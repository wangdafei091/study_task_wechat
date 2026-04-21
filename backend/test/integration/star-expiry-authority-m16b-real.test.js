/**
 * M16B 真实数据库集成测试 - star expiry authority API
 */

const fs = require('fs');
const path = require('path');

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const db = require('../../config/database');
const starRoutes = require('../../routes/stars');
const { authMiddleware } = require('../../middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/stars', authMiddleware, starRoutes);

const SETTLEMENT_TIME = new Date('2026-04-01T12:00:00.000Z').getTime();

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

async function ensureM16BTables() {
  const migrationFiles = [
    '../../database/migrations/007_create_star_records.sql',
    '../../database/migrations/008_create_star_groups.sql',
  ];

  for (const relativeFile of migrationFiles) {
    const sql = fs.readFileSync(path.join(__dirname, relativeFile), 'utf8').trim();
    await db.query(sql);
  }
}

async function cleanupTestData() {
  await db.query("DELETE FROM star_records WHERE record_id LIKE 'm16b_star_%' OR idempotency_key LIKE 'star_expiry:m16b_star_%' OR user_id LIKE 'm16b_star_%'");
  await db.query("DELETE FROM star_groups WHERE group_id LIKE 'm16b_star_%' OR user_id LIKE 'm16b_star_%'");
  await db.query("DELETE FROM messages WHERE related_id LIKE 'm16b_star_%' OR subject_user_id LIKE 'm16b_star_%' OR message_event_key LIKE 'star:summary:star_expired:m16b_star_%'");
  await db.query("DELETE FROM users WHERE user_id LIKE 'm16b_star_%'");
  await db.query("DELETE FROM families WHERE family_id LIKE 'm16b_star_%'");
}

async function setupTestData() {
  await cleanupTestData();

  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
      ('m16b_star_parent_001', 'm16b_star_parent_openid_1', 'M16B家长A', NULL, 'parent', 'active', NULL, 0, NULL),
      ('m16b_star_parent_002', 'm16b_star_parent_openid_2', 'M16B家长B', NULL, 'parent', 'active', NULL, 0, NULL)`
  );

  await db.query(
    `INSERT INTO families (family_id, name, invite_code, invite_code_role, created_by, status) VALUES
      ('m16b_star_family_001', 'M16B家庭A', 'M16BS001', 'child', 'm16b_star_parent_001', 'active'),
      ('m16b_star_family_002', 'M16B家庭B', 'M16BS002', 'child', 'm16b_star_parent_002', 'active')`
  );

  await db.query(
    `UPDATE users SET family_id = CASE
      WHEN user_id = 'm16b_star_parent_001' THEN 'm16b_star_family_001'
      WHEN user_id = 'm16b_star_parent_002' THEN 'm16b_star_family_002'
      ELSE family_id
    END,
    family_permission_role = CASE
      WHEN role = 'parent' THEN 'manager'
      ELSE family_permission_role
    END
    WHERE user_id IN ('m16b_star_parent_001', 'm16b_star_parent_002')`
  );

  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
      ('m16b_star_child_001', 'm16b_star_child_openid_1', 'M16B孩子1', NULL, 'child', 'active', 'm16b_star_family_001', 0, NULL),
      ('m16b_star_child_002', 'm16b_star_child_openid_2', 'M16B孩子2', NULL, 'child', 'active', 'm16b_star_family_001', 0, NULL),
      ('m16b_star_child_003', 'm16b_star_child_openid_3', 'M16B外部孩子', NULL, 'child', 'active', 'm16b_star_family_002', 0, NULL)`
  );
}

describe('M16B stars expiry authority API 真实数据库集成测试', () => {
  let parentToken;
  let childToken;
  let otherChildToken;

  beforeAll(async () => {
    await db.testConnection();
    await ensureM16BTables();
    await setupTestData();

    parentToken = generateToken({
      user_id: 'm16b_star_parent_001',
      openid: 'm16b_star_parent_openid_1',
      role: 'parent',
      family_id: 'm16b_star_family_001',
    });

    childToken = generateToken({
      user_id: 'm16b_star_child_001',
      openid: 'm16b_star_child_openid_1',
      role: 'child',
      family_id: 'm16b_star_family_001',
    });

    otherChildToken = generateToken({
      user_id: 'm16b_star_child_003',
      openid: 'm16b_star_child_openid_3',
      role: 'child',
      family_id: 'm16b_star_family_002',
    });
  }, 30000);

  afterEach(async () => {
    await db.query("DELETE FROM star_records WHERE record_id LIKE 'm16b_star_%' OR idempotency_key LIKE 'star_expiry:m16b_star_%' OR user_id LIKE 'm16b_star_%'");
    await db.query("DELETE FROM star_groups WHERE group_id LIKE 'm16b_star_%' OR user_id LIKE 'm16b_star_%'");
    await db.query("DELETE FROM messages WHERE related_id LIKE 'm16b_star_%' OR subject_user_id LIKE 'm16b_star_%' OR message_event_key LIKE 'star:summary:star_expired:m16b_star_%'");
  });

  afterAll(async () => {
    await cleanupTestData();
    await db.closePool();
  });

  it('POST /api/stars/expiry-authority/sync 应结算单用户已到期分组并保持重复调用幂等', async () => {
    await db.query(
      `INSERT INTO star_groups (group_id, user_id, type, stars, expiry_date, modify_time) VALUES
        ('m16b_star_group_expired_001', 'm16b_star_child_001', 'week', 4, '2026-03-31', 1774800000000),
        ('m16b_star_group_active_001', 'm16b_star_child_001', 'month', 6, '2026-04-03', 1774800000001)`
    );

    const first = await request(app)
      .post('/api/stars/expiry-authority/sync')
      .set('Authorization', `Bearer ${childToken}`)
      .send({
        scope: 'user',
        modifyTime: SETTLEMENT_TIME,
      });

    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.data).toEqual(expect.objectContaining({
      settledGroupCount: 1,
      settledPoints: 4,
      createdRecordCount: 1,
      invalidGroupCount: 0,
      affectedUserIds: ['m16b_star_child_001'],
    }));

    const remainingGroups = await db.query(
      'SELECT group_id, stars FROM star_groups WHERE user_id = ? ORDER BY group_id ASC',
      ['m16b_star_child_001']
    );
    const settlementRecords = await db.query(
      `SELECT source_id, points, idempotency_key, previous_balance, balance
       FROM star_records
       WHERE user_id = ?
       ORDER BY created_at ASC`,
      ['m16b_star_child_001']
    );
    const expiredMessages = await db.query(
      `SELECT notification_type, visibility_scope, subject_user_id, summary, message_event_key
       FROM messages
       WHERE subject_user_id = ?
         AND notification_type = 'star_expired'
       ORDER BY visibility_scope ASC`,
      ['m16b_star_child_001']
    );

    expect(remainingGroups).toEqual([
      expect.objectContaining({
        group_id: 'm16b_star_group_active_001',
        stars: 6
      })
    ]);
    expect(settlementRecords).toHaveLength(1);
    expect(settlementRecords[0]).toEqual(expect.objectContaining({
      source_id: 'm16b_star_group_expired_001',
      points: -4,
      idempotency_key: 'star_expiry:m16b_star_child_001:m16b_star_group_expired_001:2026-03-31',
      previous_balance: 10,
      balance: 6
    }));
    expect(expiredMessages).toEqual([
      expect.objectContaining({
        notification_type: 'star_expired',
        visibility_scope: 'family',
        subject_user_id: 'm16b_star_child_001',
        message_event_key: 'star:summary:star_expired:m16b_star_child_001:none:2026-03-31'
      }),
      expect.objectContaining({
        notification_type: 'star_expired',
        visibility_scope: 'user',
        subject_user_id: 'm16b_star_child_001',
        summary: '你的4颗星星已于2026-03-31到期并扣除'
      })
    ]);

    const second = await request(app)
      .post('/api/stars/expiry-authority/sync')
      .set('Authorization', `Bearer ${childToken}`)
      .send({
        scope: 'user',
        modifyTime: SETTLEMENT_TIME + 1000,
      });

    expect(second.status).toBe(200);
    expect(second.body.success).toBe(true);
    expect(second.body.data).toEqual(expect.objectContaining({
      settledGroupCount: 0,
      settledPoints: 0,
      createdRecordCount: 0,
      invalidGroupCount: 0,
      affectedUserIds: ['m16b_star_child_001'],
    }));

    const secondPassRecords = await db.query(
      `SELECT source_id, points FROM star_records WHERE user_id = ?`,
      ['m16b_star_child_001']
    );
    const secondPassMessages = await db.query(
      `SELECT notification_type FROM messages
       WHERE subject_user_id = ?
         AND notification_type = 'star_expired'`,
      ['m16b_star_child_001']
    );
    expect(secondPassRecords).toHaveLength(1);
    expect(secondPassMessages).toHaveLength(2);
  });

  it('POST /api/stars/expiry-authority/sync scope=family 应由家长一次性结算家庭全部孩子的到期分组', async () => {
    await db.query(
      `INSERT INTO star_groups (group_id, user_id, type, stars, expiry_date, modify_time) VALUES
        ('m16b_star_group_expired_002', 'm16b_star_child_001', 'week', 3, '2026-03-30', 1774800000100),
        ('m16b_star_group_expired_003', 'm16b_star_child_002', 'month', 5, '2026-03-29', 1774800000101),
        ('m16b_star_group_active_002', 'm16b_star_child_003', 'week', 9, '2026-04-05', 1774800000102)`
    );

    const res = await request(app)
      .post('/api/stars/expiry-authority/sync')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        scope: 'family',
        modifyTime: SETTLEMENT_TIME,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.settledGroupCount).toBe(2);
    expect(res.body.data.settledPoints).toBe(8);
    expect(res.body.data.createdRecordCount).toBe(2);
    expect(res.body.data.invalidGroupCount).toBe(0);
    expect(res.body.data.affectedUserIds).toEqual(
      expect.arrayContaining(['m16b_star_child_001', 'm16b_star_child_002'])
    );

    const familySettlements = await db.query(
      `SELECT user_id, source_id, points
       FROM star_records
       WHERE user_id IN ('m16b_star_child_001', 'm16b_star_child_002')
       ORDER BY user_id ASC, source_id ASC`
    );
    const remainingFamilyGroups = await db.query(
      `SELECT user_id, group_id
       FROM star_groups
       WHERE user_id IN ('m16b_star_child_001', 'm16b_star_child_002')
       ORDER BY user_id ASC, group_id ASC`
    );
    const externalGroups = await db.query(
      `SELECT group_id, stars
       FROM star_groups
       WHERE user_id = 'm16b_star_child_003'`
    );

    expect(familySettlements).toEqual([
      expect.objectContaining({
        user_id: 'm16b_star_child_001',
        source_id: 'm16b_star_group_expired_002',
        points: -3
      }),
      expect.objectContaining({
        user_id: 'm16b_star_child_002',
        source_id: 'm16b_star_group_expired_003',
        points: -5
      })
    ]);
    expect(remainingFamilyGroups).toEqual([]);
    expect(externalGroups).toEqual([
      expect.objectContaining({
        group_id: 'm16b_star_group_active_002',
        stars: 9
      })
    ]);
  });

  it('POST /api/stars/expiry-authority/sync scope=family 对孩子应返回 403', async () => {
    const res = await request(app)
      .post('/api/stars/expiry-authority/sync')
      .set('Authorization', `Bearer ${otherChildToken}`)
      .send({
        scope: 'family',
        modifyTime: SETTLEMENT_TIME,
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error_code).toBe('PERMISSION_DENIED');
  });
});
