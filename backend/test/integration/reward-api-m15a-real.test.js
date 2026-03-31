/**
 * M15A 真实数据库集成测试 - reward cancel exchange API
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

async function ensureM15ATables() {
  const migrationFiles = [
    '../../database/migrations/007_create_star_records.sql',
    '../../database/migrations/008_create_star_groups.sql',
    '../../database/migrations/009_create_rewards.sql',
    '../../database/migrations/010_create_messages.sql',
  ];

  for (const relativeFile of migrationFiles) {
    const sql = fs.readFileSync(path.join(__dirname, relativeFile), 'utf8').trim();
    await db.query(sql);
  }
}

async function cleanupTestData() {
  await db.query("DELETE FROM messages WHERE related_id LIKE 'm15a_reward_%'");
  await db.query("DELETE FROM star_records WHERE source_id LIKE 'm15a_reward_%' OR record_id LIKE 'm15a_reward_%' OR idempotency_key LIKE 'reward_unclaim:m15a_reward_%' OR idempotency_key LIKE 'reward_exchange:m15a_reward_%'");
  await db.query("DELETE FROM star_groups WHERE group_id LIKE 'm15a_reward_%'");
  await db.query("DELETE FROM rewards WHERE reward_id LIKE 'm15a_reward_%'");
  await db.query("DELETE FROM users WHERE user_id LIKE 'm15a_reward_%'");
  await db.query("DELETE FROM families WHERE family_id LIKE 'm15a_reward_%'");
}

async function setupTestData() {
  await cleanupTestData();

  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
      ('m15a_reward_parent_001', 'm15a_reward_parent_openid', 'M15A奖励家长', NULL, 'parent', 'active', NULL, 0, NULL),
      ('m15a_reward_parent_002', 'm15a_reward_parent_openid_2', 'M15A奖励外部家长', NULL, 'parent', 'active', NULL, 0, NULL)`
  );

  await db.query(
    `INSERT INTO families (family_id, name, invite_code, invite_code_role, created_by, status) VALUES
      ('m15a_reward_family_001', 'M15A奖励家庭A', 'M15AR001', 'child', 'm15a_reward_parent_001', 'active'),
      ('m15a_reward_family_002', 'M15A奖励家庭B', 'M15AR002', 'child', 'm15a_reward_parent_002', 'active')`
  );

  await db.query(
    `UPDATE users SET family_id = CASE
      WHEN user_id = 'm15a_reward_parent_001' THEN 'm15a_reward_family_001'
      WHEN user_id = 'm15a_reward_parent_002' THEN 'm15a_reward_family_002'
      ELSE family_id
    END
    WHERE user_id IN ('m15a_reward_parent_001', 'm15a_reward_parent_002')`
  );

  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
      ('m15a_reward_child_001', 'm15a_reward_child_openid_1', 'M15A奖励孩子1', NULL, 'child', 'active', 'm15a_reward_family_001', 0, NULL),
      ('m15a_reward_child_002', 'm15a_reward_child_openid_2', 'M15A奖励孩子2', NULL, 'child', 'active', 'm15a_reward_family_001', 0, NULL),
      ('m15a_reward_child_003', 'm15a_reward_child_openid_3', 'M15A奖励外部孩子', NULL, 'child', 'active', 'm15a_reward_family_002', 0, NULL)`
  );
}

describe('M15A rewards API 真实数据库集成测试', () => {
  let parentToken;
  let childToken;

  beforeAll(async () => {
    await db.testConnection();
    await ensureM15ATables();
    await setupTestData();

    parentToken = generateToken({
      user_id: 'm15a_reward_parent_001',
      openid: 'm15a_reward_parent_openid',
      role: 'parent',
      family_id: 'm15a_reward_family_001',
    });

    childToken = generateToken({
      user_id: 'm15a_reward_child_001',
      openid: 'm15a_reward_child_openid_1',
      role: 'child',
      family_id: 'm15a_reward_family_001',
    });
  }, 30000);

  afterEach(async () => {
    await db.query("DELETE FROM messages WHERE related_id LIKE 'm15a_reward_%'");
    await db.query("DELETE FROM star_records WHERE source_id LIKE 'm15a_reward_%' OR record_id LIKE 'm15a_reward_%' OR idempotency_key LIKE 'reward_unclaim:m15a_reward_%' OR idempotency_key LIKE 'reward_exchange:m15a_reward_%'");
    await db.query("DELETE FROM star_groups WHERE group_id LIKE 'm15a_reward_%'");
    await db.query("DELETE FROM rewards WHERE reward_id LIKE 'm15a_reward_%'");
  });

  afterAll(async () => {
    await cleanupTestData();
    await db.closePool();
  });

  it('PATCH /api/rewards/:rewardId/cancel-exchange 应退款、回退状态并写入消息', async () => {
    await db.query(
      `INSERT INTO rewards (
        reward_id, user_id, family_id, name, description, type, points, icon,
        enabled, claimed, claim_time, claim_status, exchange_user_id, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'm15a_reward_cancel_001',
        'm15a_reward_parent_001',
        'm15a_reward_family_001',
        'M15A撤销兑换奖励',
        '测试',
        'item',
        6,
        '🎁',
        1,
        1,
        1743400010000,
        'claimed',
        'm15a_reward_child_001',
        1743400010001
      ]
    );

    const res = await request(app)
      .patch('/api/rewards/m15a_reward_cancel_001/cancel-exchange')
      .set('Authorization', `Bearer ${childToken}`)
      .send({ modifyTime: 1743400010002 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reward.claimed).toBe(false);
    expect(res.body.data.reward.claimStatus).toBe('available');
    expect(res.body.data.refundedPoints).toBe(6);
    expect(res.body.data.idempotent).toBe(false);

    const rewardRows = await db.query(
      'SELECT claimed, claim_status, exchange_user_id FROM rewards WHERE reward_id = ?',
      ['m15a_reward_cancel_001']
    );
    const recordRows = await db.query(
      "SELECT * FROM star_records WHERE source_id = 'm15a_reward_cancel_001' AND source = 'reward'"
    );
    const groupRows = await db.query(
      "SELECT * FROM star_groups WHERE user_id = 'm15a_reward_child_001'"
    );
    const messageRows = await db.query(
      "SELECT notification_type, visibility_scope FROM messages WHERE related_id = 'm15a_reward_cancel_001' ORDER BY visibility_scope ASC"
    );

    expect(rewardRows[0]).toEqual(
      expect.objectContaining({
        claimed: 0,
        claim_status: 'available',
        exchange_user_id: null,
      })
    );
    expect(recordRows).toHaveLength(1);
    expect(recordRows[0].points).toBe(6);
    expect(groupRows).toHaveLength(1);
    expect(groupRows[0].stars).toBe(6);
    expect(messageRows).toEqual([
      expect.objectContaining({ notification_type: 'reward_unclaim', visibility_scope: 'family' }),
      expect.objectContaining({ notification_type: 'reward_unclaim', visibility_scope: 'user' }),
    ]);
  });

  it('PATCH /api/rewards/:rewardId/cancel-exchange 对未兑换奖励应返回幂等成功', async () => {
    await db.query(
      `INSERT INTO rewards (
        reward_id, user_id, family_id, name, description, type, points, icon,
        enabled, claimed, claim_status, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['m15a_reward_cancel_002', 'm15a_reward_parent_001', 'm15a_reward_family_001', '未兑换奖励', '测试', 'item', 4, '🎁', 1, 0, 'available', 1743400011000]
    );

    const res = await request(app)
      .patch('/api/rewards/m15a_reward_cancel_002/cancel-exchange')
      .set('Authorization', `Bearer ${childToken}`)
      .send({ modifyTime: 1743400011001 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.idempotent).toBe(true);
    expect(res.body.data.refundedPoints).toBe(0);
    expect(res.body.data.refundRecord).toBeNull();
  });

  it('PATCH /api/rewards/:rewardId/cancel-exchange 家长应可为同家庭孩子取消兑换', async () => {
    await db.query(
      `INSERT INTO rewards (
        reward_id, user_id, family_id, name, description, type, points, icon,
        enabled, claimed, claim_time, claim_status, exchange_user_id, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'm15a_reward_cancel_004',
        'm15a_reward_parent_001',
        'm15a_reward_family_001',
        '家长代取消兑换',
        '测试',
        'item',
        8,
        '🎁',
        1,
        1,
        1743400011500,
        'claimed',
        'm15a_reward_child_001',
        1743400011501
      ]
    );

    const res = await request(app)
      .patch('/api/rewards/m15a_reward_cancel_004/cancel-exchange')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        exchangeUserId: 'm15a_reward_child_001',
        modifyTime: 1743400011502
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reward.claimed).toBe(false);
    expect(res.body.data.reward.claimStatus).toBe('available');
    expect(res.body.data.refundedPoints).toBe(8);

    const messageRows = await db.query(
      "SELECT notification_type, visibility_scope, actor_user_id, subject_user_id FROM messages WHERE related_id = 'm15a_reward_cancel_004' ORDER BY visibility_scope ASC"
    );

    expect(messageRows).toEqual([
      expect.objectContaining({
        notification_type: 'reward_unclaim',
        visibility_scope: 'family',
        actor_user_id: 'm15a_reward_parent_001',
        subject_user_id: 'm15a_reward_child_001'
      }),
      expect.objectContaining({
        notification_type: 'reward_unclaim',
        visibility_scope: 'user',
        actor_user_id: 'm15a_reward_parent_001',
        subject_user_id: 'm15a_reward_child_001'
      }),
    ]);
  });

  it('PATCH /api/rewards/:rewardId/cancel-exchange 对跨家庭成员取消应返回 403', async () => {
    await db.query(
      `INSERT INTO rewards (
        reward_id, user_id, family_id, name, description, type, points, icon,
        enabled, claimed, claim_time, claim_status, exchange_user_id, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'm15a_reward_cancel_003',
        'm15a_reward_parent_001',
        'm15a_reward_family_001',
        '跨家庭取消兑换',
        '测试',
        'item',
        5,
        '🎁',
        1,
        1,
        1743400012000,
        'claimed',
        'm15a_reward_child_001',
        1743400012001
      ]
    );

    const res = await request(app)
      .patch('/api/rewards/m15a_reward_cancel_003/cancel-exchange')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        exchangeUserId: 'm15a_reward_child_003',
        modifyTime: 1743400012002
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error_code).toBe('FAMILY_MEMBER_ACCESS_DENIED');
  });
});
