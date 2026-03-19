/**
 * M08b 真实数据库集成测试
 *
 * 测试范围：
 * - POST /api/tasks/transfer - 正常转移（家长任务批量迁移给孩子，count 正确）
 * - POST /api/tasks/transfer - 非家长身份调用返回 403
 * - POST /api/tasks/transfer - toUserId 不在同家庭返回 400 TRANSFER_TARGET_INVALID
 * - POST /api/tasks/transfer - toUserId 是家长角色返回 400 TRANSFER_TARGET_INVALID
 * - POST /api/tasks/transfer - 家长名下无任务时返回 200 count=0
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
  await db.query('DELETE FROM tasks WHERE task_id LIKE ?', ['%_m08b_test%']);
  await db.query('DELETE FROM users WHERE user_id LIKE ?', ['%_m08b_test%']);
  await db.query('DELETE FROM families WHERE family_id LIKE ?', ['%_m08b_test%']);
}

async function setupTestData() {
  await cleanupTestData();

  // 先插入用户（families.created_by 外键依赖 users.user_id）
  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
      ('parent_m08b_test', 'parent_m08b_openid', 'M08b测试家长', NULL, 'parent', 'active', NULL, 0, NULL),
      ('parent2_m08b_test', 'parent2_m08b_openid', 'M08b另一家长', NULL, 'parent', 'active', NULL, 0, NULL),
      ('outsider_m08b_test', 'outsider_m08b_openid', 'M08b外部用户', NULL, 'child', 'active', NULL, 0, NULL)`
  );

  await db.query(
    `INSERT INTO families (family_id, name, invite_code, invite_code_role, created_by, status) VALUES
      ('family_m08b_test', 'M08b测试家庭', 'M08BTEST', 'child', 'parent_m08b_test', 'active')`
  );

  // 建家庭后再关联用户到家庭，并插入孩子
  await db.query(
    `UPDATE users SET family_id = 'family_m08b_test' WHERE user_id IN ('parent_m08b_test', 'parent2_m08b_test')`
  );

  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
      ('child_m08b_test', 'child_m08b_openid', 'M08b测试孩子', NULL, 'child', 'active', 'family_m08b_test', 1, 'parent_m08b_test')`
  );
}

describe('M08b 真实数据库集成测试 - POST /api/tasks/transfer', () => {
  let parentToken, childToken, parent2Token, outsiderToken;

  beforeAll(async () => {
    await db.testConnection();
    await setupTestData();

    parentToken = generateToken({
      user_id: 'parent_m08b_test',
      openid: 'parent_m08b_openid',
      role: 'parent',
      family_id: 'family_m08b_test'
    });

    childToken = generateToken({
      user_id: 'child_m08b_test',
      openid: 'child_m08b_openid',
      role: 'child',
      family_id: 'family_m08b_test'
    });

    parent2Token = generateToken({
      user_id: 'parent2_m08b_test',
      openid: 'parent2_m08b_openid',
      role: 'parent',
      family_id: 'family_m08b_test'
    });

    outsiderToken = generateToken({
      user_id: 'outsider_m08b_test',
      openid: 'outsider_m08b_openid',
      role: 'child',
      family_id: null
    });

    console.log('✅ M08b 测试数据设置完成');
  }, 30000);

  afterAll(async () => {
    await cleanupTestData();
    await db.closePool();
    console.log('✅ M08b 测试数据清理完成');
  });

  afterEach(async () => {
    await db.query("DELETE FROM tasks WHERE task_id LIKE '%_m08b_test%'");
  });

  it('家长有多个任务时应全部转移给孩子，返回正确 count', async () => {
    await db.query(
      `INSERT INTO tasks (task_id, user_id, title, type, date, points, status) VALUES
        ('task1_m08b_test', 'parent_m08b_test', '任务1', 'study', '2026-03-19', 3, 0),
        ('task2_m08b_test', 'parent_m08b_test', '任务2', 'habit', '2026-03-20', 2, 0),
        ('task3_m08b_test', 'parent_m08b_test', '任务3', 'interest', '2026-03-21', 1, 0)`
    );

    const res = await request(app)
      .post('/api/tasks/transfer')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ toUserId: 'child_m08b_test' });

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(3);

    const rows = await db.query(
      'SELECT user_id FROM tasks WHERE task_id IN (?, ?, ?)',
      ['task1_m08b_test', 'task2_m08b_test', 'task3_m08b_test']
    );
    expect(rows.every(r => r.user_id === 'child_m08b_test')).toBe(true);
  });

  it('家长名下无任务时应返回 200 count=0', async () => {
    const res = await request(app)
      .post('/api/tasks/transfer')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ toUserId: 'child_m08b_test' });

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(0);
  });

  it('孩子身份调用应返回 403 TRANSFER_PARENT_REQUIRED', async () => {
    const res = await request(app)
      .post('/api/tasks/transfer')
      .set('Authorization', `Bearer ${childToken}`)
      .send({ toUserId: 'child_m08b_test' });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('TRANSFER_PARENT_REQUIRED');
  });

  it('toUserId 不在同家庭应返回 400 TRANSFER_TARGET_INVALID', async () => {
    const res = await request(app)
      .post('/api/tasks/transfer')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ toUserId: 'outsider_m08b_test' });

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('TRANSFER_TARGET_INVALID');
  });

  it('toUserId 是家长角色应返回 400 TRANSFER_TARGET_INVALID', async () => {
    const res = await request(app)
      .post('/api/tasks/transfer')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ toUserId: 'parent2_m08b_test' });

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('TRANSFER_TARGET_INVALID');
  });

  it('缺少 toUserId 参数应返回 400 INVALID_PARAMS', async () => {
    const res = await request(app)
      .post('/api/tasks/transfer')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('INVALID_PARAMS');
  });
});
