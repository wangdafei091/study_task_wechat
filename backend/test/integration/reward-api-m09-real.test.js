/**
 * M09 真实数据库集成测试 - rewards API
 */

const fs = require('fs');
const path = require('path');

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const db = require('../../config/database');
const rewardRoutes = require('../../routes/rewards');
const { authMiddleware } = require('../../middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/rewards', authMiddleware, rewardRoutes);

function formatDateOffset(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generateToken(user) {
  const secret = process.env.JWT_SECRET || 'test-secret-key-for-dev-testing-only';
  return jwt.sign(
    {
      userId: user.user_id,
      openid: user.openid,
      role: user.role,
      familyId: user.family_id,
    },
    secret,
    { expiresIn: '1h' }
  );
}

async function ensureM09Tables() {
  const migrationFiles = [
    '../../database/migrations/007_create_star_records.sql',
    '../../database/migrations/008_create_star_groups.sql',
    '../../database/migrations/009_create_rewards.sql',
  ];

  for (const relativeFile of migrationFiles) {
    const sql = fs.readFileSync(path.join(__dirname, relativeFile), 'utf8').trim();
    await db.query(sql);
  }
}

async function cleanupTestData() {
  await db.query("DELETE FROM star_records WHERE record_id LIKE 'm09_reward_%' OR idempotency_key LIKE 'reward_exchange:m09_reward_%'");
  await db.query("DELETE FROM star_groups WHERE group_id LIKE 'm09_reward_%'");
  await db.query("DELETE FROM rewards WHERE reward_id LIKE 'm09_reward_%'");
  await db.query("DELETE FROM users WHERE user_id LIKE 'm09_reward_%'");
  await db.query("DELETE FROM families WHERE family_id LIKE 'm09_reward_%'");
}

async function setupTestData() {
  await cleanupTestData();

  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
      ('m09_reward_parent_001', 'm09_reward_parent_openid', 'M09奖励家长', NULL, 'parent', 'active', NULL, 0, NULL),
      ('m09_reward_parent_002', 'm09_reward_parent_openid_2', 'M09奖励外部家长', NULL, 'parent', 'active', NULL, 0, NULL)`
  );

  await db.query(
    `INSERT INTO families (family_id, name, invite_code, invite_code_role, created_by, status) VALUES
      ('m09_reward_family_001', 'M09奖励家庭A', 'M09RW001', 'child', 'm09_reward_parent_001', 'active'),
      ('m09_reward_family_002', 'M09奖励家庭B', 'M09RW002', 'child', 'm09_reward_parent_002', 'active')`
  );

  await db.query(
    `UPDATE users SET family_id = CASE
      WHEN user_id = 'm09_reward_parent_001' THEN 'm09_reward_family_001'
      WHEN user_id = 'm09_reward_parent_002' THEN 'm09_reward_family_002'
      ELSE family_id
    END
    WHERE user_id IN ('m09_reward_parent_001', 'm09_reward_parent_002')`
  );

  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
      ('m09_reward_child_001', 'm09_reward_child_openid_1', 'M09奖励孩子1', NULL, 'child', 'active', 'm09_reward_family_001', 0, NULL),
      ('m09_reward_child_002', 'm09_reward_child_openid_2', 'M09奖励孩子2', NULL, 'child', 'active', 'm09_reward_family_001', 0, NULL),
      ('m09_reward_child_003', 'm09_reward_child_openid_3', 'M09奖励外部孩子', NULL, 'child', 'active', 'm09_reward_family_002', 0, NULL)`
  );
}

describe('M09 rewards API 真实数据库集成测试', () => {
  let parentToken;
  let childToken;
  let otherChildToken;

  beforeAll(async () => {
    await db.testConnection();
    await ensureM09Tables();
    await setupTestData();

    parentToken = generateToken({
      user_id: 'm09_reward_parent_001',
      openid: 'm09_reward_parent_openid',
      role: 'parent',
      family_id: 'm09_reward_family_001',
    });

    childToken = generateToken({
      user_id: 'm09_reward_child_001',
      openid: 'm09_reward_child_openid_1',
      role: 'child',
      family_id: 'm09_reward_family_001',
    });

    otherChildToken = generateToken({
      user_id: 'm09_reward_child_003',
      openid: 'm09_reward_child_openid_3',
      role: 'child',
      family_id: 'm09_reward_family_002',
    });
  }, 30000);

  afterEach(async () => {
    await db.query("DELETE FROM star_records WHERE record_id LIKE 'm09_reward_%' OR idempotency_key LIKE 'reward_exchange:m09_reward_%'");
    await db.query("DELETE FROM star_groups WHERE group_id LIKE 'm09_reward_%'");
    await db.query("DELETE FROM rewards WHERE reward_id LIKE 'm09_reward_%'");
  });

  afterAll(async () => {
    await cleanupTestData();
    await db.closePool();
  });

  it('POST /api/rewards 创建后，家庭成员 GET /api/rewards 均可见', async () => {
    const createRes = await request(app)
      .post('/api/rewards')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        rewardId: 'm09_reward_create_001',
        name: '周末看电影',
        description: '家庭共享奖励',
        type: 'activity',
        points: 8,
        icon: '🎬',
        modifyTime: 1742400010000,
      });

    expect(createRes.status).toBe(200);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.rewardId).toBe('m09_reward_create_001');

    const childGet = await request(app)
      .get('/api/rewards')
      .set('Authorization', `Bearer ${childToken}`);

    expect(childGet.status).toBe(200);
    expect(childGet.body.data.rewards).toHaveLength(1);
    expect(childGet.body.data.rewards[0].rewardId).toBe('m09_reward_create_001');
  });

  it('GET /api/rewards 应兼容历史个人奖励，并自动补齐 family_id', async () => {
    await db.query(
      `INSERT INTO rewards (
        reward_id, user_id, family_id, name, description, type, points, icon,
        enabled, claimed, claim_status, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['m09_reward_legacy_001', 'm09_reward_parent_001', null, '历史个人奖励', '创建家庭前的奖励', 'item', 4, '🎁', 1, 0, 'available', 1742400010500]
    );

    const childGet = await request(app)
      .get('/api/rewards')
      .set('Authorization', `Bearer ${childToken}`);

    expect(childGet.status).toBe(200);
    expect(childGet.body.success).toBe(true);
    expect(childGet.body.data.rewards).toHaveLength(1);
    expect(childGet.body.data.rewards[0].rewardId).toBe('m09_reward_legacy_001');
    expect(childGet.body.data.rewards[0].familyId).toBe('m09_reward_family_001');

    const rewardRows = await db.query(
      'SELECT family_id FROM rewards WHERE reward_id = ?',
      ['m09_reward_legacy_001']
    );
    expect(rewardRows[0].family_id).toBe('m09_reward_family_001');
  });

  it('POST /api/rewards 家庭模式下孩子不可创建奖励', async () => {
    const createRes = await request(app)
      .post('/api/rewards')
      .set('Authorization', `Bearer ${childToken}`)
      .send({
        rewardId: 'm09_reward_create_child_001',
        name: '孩子越权创建',
        points: 5,
      });

    expect(createRes.status).toBe(403);
    expect(createRes.body.success).toBe(false);
  });

  it('PATCH /api/rewards/:rewardId/exchange 孩子兑换应扣减星星并支持幂等重试', async () => {
    const nextWeek = formatDateOffset(7);
    const nextMonth = formatDateOffset(30);

    await db.query(
      `INSERT INTO rewards (
        reward_id, user_id, family_id, name, description, type, points, icon,
        enabled, claimed, claim_status, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['m09_reward_exchange_001', 'm09_reward_parent_001', 'm09_reward_family_001', '兑换测试奖励', '测试', 'item', 6, '🎁', 1, 0, 'available', 1742400011000]
    );

    await db.query(
      `INSERT INTO star_groups (group_id, user_id, type, stars, expiry_date, modify_time) VALUES
        ('m09_reward_group_week_001', 'm09_reward_child_001', 'week', 2, ?, 1742400011001),
        ('m09_reward_group_month_001', 'm09_reward_child_001', 'month', 4, ?, 1742400011002)`,
      [nextWeek, nextMonth]
    );

    const payload = {
      modifyTime: 1742400012000,
    };

    const first = await request(app)
      .patch('/api/rewards/m09_reward_exchange_001/exchange')
      .set('Authorization', `Bearer ${childToken}`)
      .send(payload);

    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.data.reward.claimed).toBe(true);
    expect(first.body.data.consumedPoints).toBe(6);
    expect(first.body.data.deductionBreakdown).toHaveLength(2);

    const second = await request(app)
      .patch('/api/rewards/m09_reward_exchange_001/exchange')
      .set('Authorization', `Bearer ${childToken}`)
      .send(payload);

    expect(second.status).toBe(200);
    expect(second.body.data.idempotent).toBe(true);

    const rewardRows = await db.query(
      'SELECT * FROM rewards WHERE reward_id = ?',
      ['m09_reward_exchange_001']
    );
    const recordRows = await db.query(
      "SELECT * FROM star_records WHERE idempotency_key = 'reward_exchange:m09_reward_exchange_001:m09_reward_child_001:1742400012000'"
    );
    const groupRows = await db.query(
      'SELECT * FROM star_groups WHERE user_id = ?',
      ['m09_reward_child_001']
    );

    expect(rewardRows[0].claimed).toBe(1);
    expect(recordRows.length).toBe(1);
    expect(recordRows[0].points).toBe(-6);
    expect(groupRows.length).toBe(0);
  });

  it('PATCH /api/rewards/:rewardId/exchange 家长可代孩子兑换，非家庭孩子返回 403', async () => {
    await db.query(
      `INSERT INTO rewards (
        reward_id, user_id, family_id, name, description, type, points, icon,
        enabled, claimed, claim_status, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['m09_reward_exchange_002', 'm09_reward_parent_001', 'm09_reward_family_001', '家长代兑奖励', '测试', 'item', 3, '🎁', 1, 0, 'available', 1742400013000]
    );

    await db.query(
      `INSERT INTO star_groups (group_id, user_id, type, stars, expiry_date, modify_time) VALUES
        ('m09_reward_group_perm_002', 'm09_reward_child_002', 'permanent', 5, NULL, 1742400013001)`
    );

    const okRes = await request(app)
      .patch('/api/rewards/m09_reward_exchange_002/exchange')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        exchangeUserId: 'm09_reward_child_002',
        modifyTime: 1742400014000,
      });

    expect(okRes.status).toBe(200);
    expect(okRes.body.data.reward.exchangeUserId).toBe('m09_reward_child_002');
    expect(okRes.body.data.consumedPoints).toBe(3);

    const forbiddenRes = await request(app)
      .patch('/api/rewards/m09_reward_exchange_002/exchange')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        exchangeUserId: 'm09_reward_child_003',
        modifyTime: 1742400015000,
      });

    expect(forbiddenRes.status).toBe(403);
  });

  it('PATCH /api/rewards/:rewardId/exchange 不可兑换其他家庭奖励', async () => {
    await db.query(
      `INSERT INTO rewards (
        reward_id, user_id, family_id, name, description, type, points, icon,
        enabled, claimed, claim_status, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['m09_reward_exchange_003', 'm09_reward_parent_002', 'm09_reward_family_002', '外家庭奖励', '测试', 'item', 2, '🎁', 1, 0, 'available', 1742400016000]
    );

    await db.query(
      `INSERT INTO star_groups (group_id, user_id, type, stars, expiry_date, modify_time) VALUES
        ('m09_reward_group_perm_003', 'm09_reward_child_001', 'permanent', 5, NULL, 1742400016001)`
    );

    const forbiddenRes = await request(app)
      .patch('/api/rewards/m09_reward_exchange_003/exchange')
      .set('Authorization', `Bearer ${childToken}`)
      .send({
        modifyTime: 1742400017000,
      });

    expect(forbiddenRes.status).toBe(404);
    expect(forbiddenRes.body.success).toBe(false);
  });
});
