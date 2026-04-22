/**
 * M08 真实数据库集成测试
 *
 * 测试范围：
 * - POST /api/tasks - 幂等创建（taskId 已存在返回原任务，无重复写入）
 * - POST /api/tasks - 软删除后恢复并覆盖字段
 * - POST /api/tasks - taskId 归属不匹配时返回 409
 * - POST /api/tasks - parentTaskId 持久化与 GET 回读
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../../config/database');

const taskRoutes = require('../../routes/tasks');
const { authMiddleware } = require('../../middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/tasks', authMiddleware, taskRoutes);

function generateToken(user) {
  const secret = process.env.JWT_SECRET || 'test-secret-key-for-dev-testing-only';
  return jwt.sign(
    { userId: user.user_id, openid: user.openid, role: user.role, familyId: user.family_id },
    secret,
    { expiresIn: '1h' }
  );
}

async function cleanupTestData() {
  await db.query('DELETE FROM tasks WHERE task_id LIKE ?', ['%_m08_test%']);
  await db.query('DELETE FROM users WHERE user_id LIKE ?', ['%_m08_test%']);
  await db.query('DELETE FROM families WHERE family_id LIKE ?', ['%_m08_test%']);
}

async function setupTestData() {
  await cleanupTestData();

  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
      ('parent_m08_test', 'parent_m08_openid', 'M08测试家长', NULL, 'parent', 'active', NULL, 0, NULL)`
  );

  await db.query(
    `INSERT INTO families (family_id, name, invite_code, invite_code_role, created_by, status) VALUES
      ('family_m08_test', 'M08测试家庭', 'M08TEST1', 'child', 'parent_m08_test', 'active')`
  );

  await db.query(
    `UPDATE users
     SET family_id = 'family_m08_test',
         family_permission_role = 'manager'
     WHERE user_id = 'parent_m08_test'`
  );

  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
      ('child_m08_test_1', 'child_m08_openid_1', 'M08孩子1', NULL, 'child', 'active', 'family_m08_test', 0, NULL),
      ('child_m08_test_2', 'child_m08_openid_2', 'M08孩子2', NULL, 'child', 'active', 'family_m08_test', 0, NULL)`
  );
}

describe('M08 真实数据库集成测试', () => {
  let parentToken, child1Token, child2Token;

  const TASK_ID = 'idem_m08_test';
  const CHILD_TASK_ID = 'child_m08_test';

  beforeAll(async () => {
    await db.testConnection();
    await setupTestData();

    parentToken = generateToken({
      user_id: 'parent_m08_test',
      openid: 'parent_m08_openid',
      role: 'parent',
      family_id: 'family_m08_test'
    });

    child1Token = generateToken({
      user_id: 'child_m08_test_1',
      openid: 'child_m08_openid_1',
      role: 'child',
      family_id: 'family_m08_test'
    });

    child2Token = generateToken({
      user_id: 'child_m08_test_2',
      openid: 'child_m08_openid_2',
      role: 'child',
      family_id: 'family_m08_test'
    });

    console.log('✅ M08 测试数据设置完成');
  }, 30000);

  afterAll(async () => {
    await cleanupTestData();
    await db.closePool();
    console.log('✅ M08 测试数据清理完成');
  });

  afterEach(async () => {
    await db.query('DELETE FROM tasks WHERE task_id IN (?, ?)', [TASK_ID, CHILD_TASK_ID]);
  });

  describe('POST /api/tasks - 幂等创建', () => {
    it('不提供 taskId 时应正常创建（原有路径不受影响）', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({ targetUserId: 'child_m08_test_1', title: 'M08普通创建', type: 'study', date: '2026-03-19', points: 3 });

      expect(res.status).toBe(200);
      expect(res.body.data.taskId).toBeDefined();

      await db.query('DELETE FROM tasks WHERE task_id = ?', [res.body.data.taskId]);
    });

    it('提供 taskId 且不存在时应正常创建，DB 中只有一条', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({ taskId: TASK_ID, targetUserId: 'child_m08_test_1', title: 'M08幂等首次创建', type: 'study', date: '2026-03-19', points: 3 });

      expect(res.status).toBe(200);
      expect(res.body.data.taskId).toBe(TASK_ID);

      const rows = await db.query('SELECT * FROM tasks WHERE task_id = ?', [TASK_ID]);
      expect(rows.length).toBe(1);
    });

    it('相同 taskId POST 两次应幂等返回已有任务，DB 中无重复行', async () => {
      const payload = { taskId: TASK_ID, title: 'M08幂等测试', type: 'study', date: '2026-03-19', points: 3 };

      const res1 = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({ ...payload, targetUserId: 'child_m08_test_1' });
      expect(res1.status).toBe(200);

      const res2 = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({ ...payload, targetUserId: 'child_m08_test_1' });
      expect(res2.status).toBe(200);
      expect(res2.body.data.taskId).toBe(TASK_ID);

      const rows = await db.query('SELECT * FROM tasks WHERE task_id = ?', [TASK_ID]);
      expect(rows.length).toBe(1);
    });
  });

  describe('POST /api/tasks - 软删除后恢复并覆盖', () => {
    it('软删除后用相同 taskId POST 应恢复任务、覆盖字段并重置状态', async () => {
      await db.query(
        'INSERT INTO tasks (task_id, user_id, title, type, date, points, status, star_awarded, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [TASK_ID, 'child_m08_test_1', '旧标题', 'study', '2026-01-01', 1, 1, 1, new Date()]
      );

      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({ taskId: TASK_ID, targetUserId: 'child_m08_test_1', title: '新标题', type: 'habit', date: '2026-03-19', points: 5 });

      expect(res.status).toBe(200);

      const rows = await db.query('SELECT * FROM tasks WHERE task_id = ?', [TASK_ID]);
      expect(rows.length).toBe(1);
      expect(rows[0].deleted_at).toBeNull();
      expect(rows[0].title).toBe('新标题');
      expect(rows[0].status).toBe(0);
      expect(rows[0].star_awarded).toBe(0);
    });
  });

  describe('POST /api/tasks - 归属校验', () => {
    it('taskId 归属不匹配时应返回 409 TASK_ID_USER_MISMATCH', async () => {
      await db.query(
        'INSERT INTO tasks (task_id, user_id, title, type, date, points, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [TASK_ID, 'child_m08_test_1', '归属测试', 'study', '2026-03-19', 3, 0]
      );

      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({ taskId: TASK_ID, targetUserId: 'child_m08_test_2', title: '越权创建', type: 'study', date: '2026-03-19', points: 3 });

      expect(res.status).toBe(409);
      expect(res.body.error_code).toBe('TASK_ID_USER_MISMATCH');
    });
  });

  describe('POST /api/tasks - parentTaskId 持久化', () => {
    it('parentTaskId 应正确写入 DB 并通过 GET 回读', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({
          taskId: CHILD_TASK_ID,
          targetUserId: 'child_m08_test_1',
          title: '重复实例',
          type: 'study',
          date: '2026-03-20',
          points: 3,
          parentTaskId: TASK_ID
        });

      expect(res.status).toBe(200);

      const rows = await db.query('SELECT parent_task_id FROM tasks WHERE task_id = ?', [CHILD_TASK_ID]);
      expect(rows[0].parent_task_id).toBe(TASK_ID);

      const getRes = await request(app)
        .get(`/api/tasks/${CHILD_TASK_ID}`)
        .set('Authorization', `Bearer ${child1Token}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.parentTaskId).toBe(TASK_ID);
    });
  });
});
