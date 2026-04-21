/**
 * M07 真实数据库集成测试
 *
 * 测试范围：
 * - PUT /api/tasks/:taskId - 更新任务
 * - DELETE /api/tasks/:taskId - 软删除任务
 * - PATCH /api/tasks/:taskId/status - 更新任务状态
 * - GET /api/tasks?scope=family - 家庭聚合查询
 * - deleted_at IS NULL 过滤
 * - 跨家庭权限控制
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../../config/database');

// 导入路由和实际的认证中间件
const taskRoutes = require('../../routes/tasks');
const userRoutes = require('../../routes/users');
const { authMiddleware } = require('../../middleware/auth');

// 创建测试应用
const app = express();
app.use(express.json());

// 应用实际的认证中间件和路由
app.use('/api/tasks', authMiddleware, taskRoutes);
app.use('/api/users', authMiddleware, userRoutes);

// 生成测试JWT token（必须与后端config/jwt.js中的secret一致）
function generateToken(user) {
  // 与后端JWT_CONFIG.secret保持一致：优先使用环境变量，否则使用默认值
  const secret = process.env.JWT_SECRET || 'test-secret-key-for-dev-testing-only';
  console.log('测试生成Token使用的secret:', secret);

  return jwt.sign(
    {
      userId: user.user_id,
      openid: user.openid,
      role: user.role,
      familyId: user.family_id,
      familyPermissionRole: user.family_permission_role || null
    },
    secret,
    { expiresIn: '1h' }
  );
}

// 测试数据清理
async function cleanupTestData() {
  await db.query('DELETE FROM tasks WHERE user_id LIKE ?', ['%_test_%']);
  await db.query('DELETE FROM users WHERE user_id LIKE ?', ['%_test_%']);
  await db.query('DELETE FROM families WHERE family_id LIKE ?', ['%_test_%']);
}

// 设置测试数据
async function setupTestData() {
  await cleanupTestData();

  // 先创建家长，再创建家庭，最后回填 family_id，兼容真实外键关系
  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
      ('parent_test_001', 'parent_test_openid', '测试家长', NULL, 'parent', 'active', NULL, 0, NULL),
      ('parent_test_002', 'parent_test_openid_2', '外部家长', NULL, 'parent', 'active', NULL, 0, NULL),
      ('parent_test_003', 'parent_test_openid_3', '查看者家长', NULL, 'parent', 'active', NULL, 0, NULL)`
  );

  await db.query(
    `INSERT INTO families (family_id, name, invite_code, invite_code_role, created_by, status) VALUES
      ('family_test_001', '集成测试家庭', 'TESTINT1', 'child', 'parent_test_001', 'active'),
      ('family_test_002', '外部测试家庭', 'TESTINT2', 'child', 'parent_test_002', 'active')`
  );

  await db.query(
    `UPDATE users SET family_id = CASE
      WHEN user_id = 'parent_test_001' THEN 'family_test_001'
      WHEN user_id = 'parent_test_002' THEN 'family_test_002'
      WHEN user_id = 'parent_test_003' THEN 'family_test_001'
      ELSE family_id
    END,
    family_permission_role = CASE
      WHEN user_id = 'parent_test_001' THEN 'manager'
      WHEN user_id = 'parent_test_002' THEN 'manager'
      WHEN user_id = 'parent_test_003' THEN 'viewer'
      ELSE family_permission_role
    END
    WHERE user_id IN ('parent_test_001', 'parent_test_002', 'parent_test_003')`
  );

  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
      ('child_test_001', 'child_test_openid', '测试孩子', NULL, 'child', 'active', 'family_test_001', 0, NULL),
      ('child_test_002', 'child_test_openid_2', '测试孩子2', NULL, 'child', 'active', 'family_test_001', 0, NULL),
      ('child_test_004', 'child_test_openid_4', '停用孩子', NULL, 'child', 'inactive', 'family_test_001', 0, NULL),
      ('child_test_003', 'child_test_openid_3', '外部孩子', NULL, 'child', 'active', 'family_test_002', 0, NULL)`
  );
}

describe('M07 真实数据库集成测试', () => {
  let parentToken, childToken, otherFamilyToken, viewerToken;
  let testTaskId;

  beforeAll(async () => {
    // 等待数据库连接
    await db.testConnection();

    // 设置测试数据
    await setupTestData();

    // 生成测试token
    parentToken = generateToken({
      user_id: 'parent_test_001',
      openid: 'parent_test_openid',
      role: 'parent',
      family_id: 'family_test_001'
    });

    childToken = generateToken({
      user_id: 'child_test_001',
      openid: 'child_test_openid',
      role: 'child',
      family_id: 'family_test_001'
    });

    otherFamilyToken = generateToken({
      user_id: 'child_test_003',
      openid: 'child_test_openid_3',
      role: 'child',
      family_id: 'family_test_002'
    });

    viewerToken = generateToken({
      user_id: 'parent_test_003',
      openid: 'parent_test_openid_3',
      role: 'parent',
      family_id: 'family_test_001',
      family_permission_role: 'viewer'
    });

    console.log('✅ 测试数据设置完成');
  }, 30000);

  afterAll(async () => {
    // 清理测试数据
    await cleanupTestData();
    await db.closePool();
    console.log('✅ 测试数据清理完成');
  });

  describe('PUT /api/tasks/:taskId - 更新任务', () => {
    beforeEach(async () => {
      // 为每个测试创建一个测试任务
      const result = await db.query(
        `INSERT INTO tasks (task_id, user_id, title, type, date, points, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['task_update_test', 'child_test_001', '更新测试任务', 'study', '2026-03-19', 5, 0]
      );
      testTaskId = 'task_update_test';
    });

    afterEach(async () => {
      // 清理测试任务
      await db.query('DELETE FROM tasks WHERE task_id LIKE ?', ['task_update_test']);
    });

    it('应该成功更新任务', async () => {
      const response = await request(app)
        .put(`/api/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${parentToken}`)
        .send({
          title: '更新后的任务标题',
          description: '更新后的描述',
          points: 10
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.task.title).toBe('更新后的任务标题');
      expect(response.body.data.task.points).toBe(10);

      // 验证数据库中的更新
      const updatedTask = await db.query('SELECT * FROM tasks WHERE task_id = ?', [testTaskId]);
      expect(updatedTask[0].title).toBe('更新后的任务标题');
      expect(updatedTask[0].points).toBe(10);
    });

    it('家长应该能够代孩子更新任务', async () => {
      const response = await request(app)
        .put(`/api/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${parentToken}`)
        .send({ title: '家长代更新' });

      expect(response.status).toBe(200);
      expect(response.body.data.task.title).toBe('家长代更新');
    });

    it('跨家庭用户更新任务应该返回 403', async () => {
      const response = await request(app)
        .put(`/api/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${otherFamilyToken}`)
        .send({ title: '非法更新' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('更新不存在的任务应该返回 404', async () => {
      const response = await request(app)
        .put('/api/tasks/non_existent_task')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({ title: '测试' });

      expect(response.status).toBe(404);
    });

    it('查看者家长更新任务应该返回 403 FAMILY_MANAGER_REQUIRED', async () => {
      const response = await request(app)
        .put(`/api/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ title: '查看者非法更新' });

      expect(response.status).toBe(403);
      expect(response.body.error_code).toBe('FAMILY_MANAGER_REQUIRED');
    });
  });

  describe('DELETE /api/tasks/:taskId - 软删除任务', () => {
    beforeEach(async () => {
      await db.query(
        `INSERT INTO tasks (task_id, user_id, title, type, date, points, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['task_delete_test', 'child_test_001', '删除测试任务', 'study', '2026-03-19', 5, 0]
      );
    });

    afterEach(async () => {
      await db.query('DELETE FROM tasks WHERE task_id LIKE ?', ['task_delete_test']);
    });

    it('应该成功软删除任务', async () => {
      const response = await request(app)
        .delete('/api/tasks/task_delete_test')
        .set('Authorization', `Bearer ${parentToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // 验证软删除：deleted_at 不为空
      const deletedTask = await db.query('SELECT * FROM tasks WHERE task_id = ?', ['task_delete_test']);
      expect(deletedTask[0].deleted_at).not.toBeNull();
    });

    it('软删除后的任务不应该在列表中出现', async () => {
      // 先删除任务
      await request(app)
        .delete('/api/tasks/task_delete_test')
        .set('Authorization', `Bearer ${parentToken}`);

      // 验证列表查询不包含已删除任务
      const response = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${childToken}`);

      const deletedTask = response.body.data.tasks.find(t => t.taskId === 'task_delete_test');
      expect(deletedTask).toBeUndefined();
    });

    it('跨家庭用户删除任务应该返回 403', async () => {
      const response = await request(app)
        .delete('/api/tasks/task_delete_test')
        .set('Authorization', `Bearer ${otherFamilyToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('PATCH /api/tasks/:taskId/status - 更新任务状态', () => {
    beforeEach(async () => {
      await db.query(
        `INSERT INTO tasks (task_id, user_id, title, type, date, points, status, star_awarded)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['task_status_test', 'child_test_001', '状态测试任务', 'study', '2026-03-19', 5, 0, 0]
      );
    });

    afterEach(async () => {
      await db.query('DELETE FROM tasks WHERE task_id LIKE ?', ['task_status_test']);
    });

    it('应该成功更新任务状态为已完成', async () => {
      const response = await request(app)
        .patch('/api/tasks/task_status_test/status')
        .set('Authorization', `Bearer ${childToken}`)
        .send({ status: 1 });

      expect(response.status).toBe(200);
      expect(response.body.data.task.status).toBe(1);
      expect(response.body.data.task.completionTime).not.toBeNull();

      // 验证数据库状态
      const updatedTask = await db.query('SELECT * FROM tasks WHERE task_id = ?', ['task_status_test']);
      expect(updatedTask[0].status).toBe(1);
      expect(updatedTask[0].completion_time).not.toBeNull();
    });

    it('应该成功重置任务状态', async () => {
      // 先完成任务
      await request(app)
        .patch('/api/tasks/task_status_test/status')
        .set('Authorization', `Bearer ${childToken}`)
        .send({ status: 1 });

      // 重置状态
      const response = await request(app)
        .patch('/api/tasks/task_status_test/status')
        .set('Authorization', `Bearer ${childToken}`)
        .send({ status: 0 });

      expect(response.status).toBe(200);
      expect(response.body.data.task.status).toBe(0);
    });

    it('家长应该能够代孩子更新任务状态', async () => {
      const response = await request(app)
        .patch('/api/tasks/task_status_test/status')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({ status: 1 });

      expect(response.status).toBe(200);
    });

    it('无效的状态值应该返回 400', async () => {
      const response = await request(app)
        .patch('/api/tasks/task_status_test/status')
        .set('Authorization', `Bearer ${childToken}`)
        .send({ status: 999 });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/tasks?scope=family - 家庭聚合查询', () => {
    beforeAll(async () => {
      // 创建多个孩子的任务数据
      await db.query(
        `INSERT INTO tasks (task_id, user_id, title, type, date, points, status) VALUES
          ('family_task_1', 'child_test_001', '孩子1的任务', 'study', '2026-03-19', 5, 0),
          ('family_task_2', 'child_test_001', '孩子1的任务2', 'study', '2026-03-19', 3, 1),
          ('family_task_3', 'child_test_002', '孩子2的任务', 'habit', '2026-03-19', 2, 0),
          ('family_task_inactive', 'child_test_004', '停用孩子任务', 'study', '2026-03-19', 1, 0),
          ('family_task_4', 'child_test_003', '外部孩子任务', 'study', '2026-03-19', 4, 0)`
      );
    });

    afterAll(async () => {
      await db.query('DELETE FROM tasks WHERE task_id LIKE ?', ['family_task_%']);
    });

    it('家长应该能够获取家庭所有孩子的任务', async () => {
      const response = await request(app)
        .get('/api/tasks?scope=family')
        .set('Authorization', `Bearer ${parentToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.tasks.length).toBeGreaterThanOrEqual(3);

      // 应该包含家庭内孩子的任务，但不包含外部家庭任务
      const taskIds = response.body.data.tasks.map(t => t.taskId);
      expect(taskIds).toContain('family_task_1');
      expect(taskIds).toContain('family_task_2');
      expect(taskIds).toContain('family_task_3');
      expect(taskIds).not.toContain('family_task_inactive');
      expect(taskIds).not.toContain('family_task_4');
    });

    it('孩子请求 scope=family 应该返回 403', async () => {
      const response = await request(app)
        .get('/api/tasks?scope=family')
        .set('Authorization', `Bearer ${childToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('scope=family 应该支持日期过滤', async () => {
      const response = await request(app)
        .get('/api/tasks?scope=family&date=2026-03-19')
        .set('Authorization', `Bearer ${parentToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.tasks.length).toBe(3);
    });
  });

  describe('软删除行为验证', () => {
    it('软删除的任务不应该在普通查询中出现', async () => {
      // 创建并软删除一个任务
      await db.query(
        `INSERT INTO tasks (task_id, user_id, title, type, date, points, status, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['soft_delete_test', 'child_test_001', '软删除测试', 'study', '2026-03-19', 5, 0, new Date()]
      );

      // 验证普通查询不包含软删除任务
      const response = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${childToken}`);

      const deletedTask = response.body.data.tasks.find(t => t.taskId === 'soft_delete_test');
      expect(deletedTask).toBeUndefined();

      // 清理
      await db.query('DELETE FROM tasks WHERE task_id = ?', ['soft_delete_test']);
    });

    it('软删除任务应该可以通过ID查询时返回404', async () => {
      await db.query(
        `INSERT INTO tasks (task_id, user_id, title, type, date, points, status, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['soft_delete_id_test', 'child_test_001', 'ID查询测试', 'study', '2026-03-19', 5, 0, new Date()]
      );

      const response = await request(app)
        .get('/api/tasks/soft_delete_id_test')
        .set('Authorization', `Bearer ${childToken}`);

      expect(response.status).toBe(404);

      // 清理
      await db.query('DELETE FROM tasks WHERE task_id = ?', ['soft_delete_id_test']);
    });
  });
});
