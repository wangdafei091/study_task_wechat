/**
 * M09 真实数据库集成测试 - stars API
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
    '../../database/migrations/010_create_messages.sql',
  ];

  for (const relativeFile of migrationFiles) {
    const sql = fs.readFileSync(path.join(__dirname, relativeFile), 'utf8').trim();
    await db.query(sql);
  }
}

async function cleanupTestData() {
  await db.query("DELETE FROM messages WHERE related_id LIKE 'm09_star_%' OR message_event_key LIKE 'star:summary:star_expiring:m09_star_%'");
  await db.query("DELETE FROM star_records WHERE record_id LIKE 'm09_star_%' OR idempotency_key LIKE 'm09_star_%' OR user_id LIKE 'm09_star_%'");
  await db.query("DELETE FROM star_groups WHERE group_id LIKE 'm09_star_%' OR user_id LIKE 'm09_star_%'");
  await db.query("DELETE FROM users WHERE user_id LIKE 'm09_star_%'");
  await db.query("DELETE FROM families WHERE family_id LIKE 'm09_star_%'");
}

async function setupTestData() {
  await cleanupTestData();

  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
      ('m09_star_parent_001', 'm09_star_parent_openid', 'M09家长', NULL, 'parent', 'active', NULL, 0, NULL),
      ('m09_star_parent_002', 'm09_star_parent_openid_2', 'M09外部家长', NULL, 'parent', 'active', NULL, 0, NULL)`
  );

  await db.query(
    `INSERT INTO families (family_id, name, invite_code, invite_code_role, created_by, status) VALUES
      ('m09_star_family_001', 'M09星星家庭A', 'M09SA001', 'child', 'm09_star_parent_001', 'active'),
      ('m09_star_family_002', 'M09星星家庭B', 'M09SA002', 'child', 'm09_star_parent_002', 'active')`
  );

  await db.query(
    `UPDATE users SET family_id = CASE
      WHEN user_id = 'm09_star_parent_001' THEN 'm09_star_family_001'
      WHEN user_id = 'm09_star_parent_002' THEN 'm09_star_family_002'
      ELSE family_id
    END
    WHERE user_id IN ('m09_star_parent_001', 'm09_star_parent_002')`
  );

  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
      ('m09_star_child_001', 'm09_star_child_openid_1', 'M09孩子1', NULL, 'child', 'active', 'm09_star_family_001', 0, NULL),
      ('m09_star_child_002', 'm09_star_child_openid_2', 'M09孩子2', NULL, 'child', 'active', 'm09_star_family_001', 0, NULL),
      ('m09_star_child_003', 'm09_star_child_openid_3', 'M09外部孩子', NULL, 'child', 'active', 'm09_star_family_002', 0, NULL)`
  );
}

describe('M09 stars API 真实数据库集成测试', () => {
  let parentToken;
  let childToken;
  let otherChildToken;

  beforeAll(async () => {
    await db.testConnection();
    await ensureM09Tables();
    await setupTestData();

    parentToken = generateToken({
      user_id: 'm09_star_parent_001',
      openid: 'm09_star_parent_openid',
      role: 'parent',
      family_id: 'm09_star_family_001',
    });

    childToken = generateToken({
      user_id: 'm09_star_child_001',
      openid: 'm09_star_child_openid_1',
      role: 'child',
      family_id: 'm09_star_family_001',
    });

    otherChildToken = generateToken({
      user_id: 'm09_star_child_003',
      openid: 'm09_star_child_openid_3',
      role: 'child',
      family_id: 'm09_star_family_002',
    });
  }, 30000);

  afterEach(async () => {
    await db.query("DELETE FROM messages WHERE related_id LIKE 'm09_star_%' OR message_event_key LIKE 'star:summary:star_expiring:m09_star_%'");
    await db.query("DELETE FROM star_records WHERE record_id LIKE 'm09_star_%' OR idempotency_key LIKE 'm09_star_%' OR user_id LIKE 'm09_star_%'");
    await db.query("DELETE FROM star_groups WHERE group_id LIKE 'm09_star_%' OR user_id LIKE 'm09_star_%'");
  });

  afterAll(async () => {
    await cleanupTestData();
    await db.closePool();
  });

  it('POST /api/stars/records 应写入单分组流水并维护快照，重复请求幂等', async () => {
    const nextWeek = formatDateOffset(7);

    const payload = {
      recordId: 'm09_star_record_income_001',
      userId: 'm09_star_child_001',
      type: 'income',
      source: 'task',
      sourceId: 'task_m09_income_001',
      points: 5,
      description: '完成任务获得5颗星星',
      expiryType: 'week',
      expiryDate: nextWeek,
      modifyTime: 1742400001000,
    };

    const first = await request(app)
      .post('/api/stars/records')
      .set('Authorization', `Bearer ${childToken}`)
      .send(payload);

    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.data.record.recordId).toBe(payload.recordId);
    expect(first.body.data.updatedGroupsSnapshot).toHaveLength(1);
    expect(first.body.data.updatedGroupsSnapshot[0].stars).toBe(5);

    const second = await request(app)
      .post('/api/stars/records')
      .set('Authorization', `Bearer ${childToken}`)
      .send(payload);

    expect(second.status).toBe(200);
    expect(second.body.data.idempotent).toBe(true);

    const recordRows = await db.query(
      'SELECT * FROM star_records WHERE record_id = ?',
      [payload.recordId]
    );
    const groupRows = await db.query(
      'SELECT * FROM star_groups WHERE user_id = ? AND type = ?',
      ['m09_star_child_001', 'week']
    );

    expect(recordRows.length).toBe(1);
    expect(groupRows.length).toBe(1);
    expect(groupRows[0].stars).toBe(5);
  });

  it('POST /api/stars/consume 应支持部分扣减并返回分摊结果，同一幂等键不重复扣减', async () => {
    const nextWeek = formatDateOffset(7);
    const nextMonth = formatDateOffset(30);

    await db.query(
      `INSERT INTO star_groups (group_id, user_id, type, stars, expiry_date, modify_time) VALUES
        ('m09_star_group_week_001', 'm09_star_child_001', 'week', 1, ?, 1742400001001),
        ('m09_star_group_month_001', 'm09_star_child_001', 'month', 2, ?, 1742400001002)`,
      [nextWeek, nextMonth]
    );

    const payload = {
      userId: 'm09_star_child_001',
      requestedPoints: 5,
      reason: '必做任务惩罚',
      sourceType: 'task_penalty',
      sourceId: 'task_m09_penalty_001',
      originalTaskDate: '2026-03-20',
      idempotencyKey: 'm09_star_consume_idem_001',
      modifyTime: 1742400002000,
    };

    const first = await request(app)
      .post('/api/stars/consume')
      .set('Authorization', `Bearer ${childToken}`)
      .send(payload);

    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.data.consumedPoints).toBe(3);
    expect(first.body.data.isPartial).toBe(true);
    expect(first.body.data.deductionBreakdown).toHaveLength(2);

    const second = await request(app)
      .post('/api/stars/consume')
      .set('Authorization', `Bearer ${childToken}`)
      .send(payload);

    expect(second.status).toBe(200);
    expect(second.body.data.idempotent).toBe(true);
    expect(second.body.data.consumedPoints).toBe(3);

    const groups = await db.query(
      'SELECT * FROM star_groups WHERE user_id = ?',
      ['m09_star_child_001']
    );
    const records = await db.query(
      "SELECT * FROM star_records WHERE idempotency_key = 'm09_star_consume_idem_001'"
    );

    expect(groups.length).toBe(0);
    expect(records.length).toBe(1);
    expect(records[0].points).toBe(-3);
    expect(records[0].requested_points).toBe(5);
  });

  it('GET /api/stars?userId 应返回余额与分组，跨家庭访问应被拒绝', async () => {
    await db.query(
      `INSERT INTO star_groups (group_id, user_id, type, stars, expiry_date, modify_time) VALUES
        ('m09_star_group_perm_001', 'm09_star_child_001', 'permanent', 7, NULL, 1742400003000)`
    );

    const okRes = await request(app)
      .get('/api/stars')
      .query({ userId: 'm09_star_child_001' })
      .set('Authorization', `Bearer ${parentToken}`);

    expect(okRes.status).toBe(200);
    expect(okRes.body.data.totalPoints).toBe(7);
    expect(okRes.body.data.groups).toHaveLength(1);

    const forbidden = await request(app)
      .get('/api/stars')
      .query({ userId: 'm09_star_child_001' })
      .set('Authorization', `Bearer ${otherChildToken}`);

    expect(forbidden.status).toBe(403);
  });

  it('POST /api/stars/expiring-reminders/sync 应生成孩子个人流和家庭流提醒，并在过窗后归档', async () => {
    await db.query(
      `INSERT INTO star_groups (group_id, user_id, type, stars, expiry_date, modify_time) VALUES
        ('m09_star_group_expiring_001', 'm09_star_child_001', 'week', 3, ?, 1742400004001),
        ('m09_star_group_expiring_002', 'm09_star_child_001', 'month', 5, ?, 1742400004002)`,
      [formatDateOffset(1), formatDateOffset(1)]
    );

    const first = await request(app)
      .post('/api/stars/expiring-reminders/sync')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        scope: 'user',
        targetUserId: 'm09_star_child_001',
        modifyTime: Date.now(),
        operationKey: 'm09_star_expiring_sync_001'
      });

    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.data.activeCount).toBe(2);

    const messageRows = await db.query(
      `SELECT notification_type, visibility_scope, type, subject_user_id, is_archived
       FROM messages
       WHERE message_event_key = 'star:summary:star_expiring:m09_star_child_001:none:${formatDateOffset(1)}'
       ORDER BY visibility_scope ASC`
    );

    expect(messageRows).toEqual([
      expect.objectContaining({
        notification_type: 'star_expiring',
        visibility_scope: 'family',
        type: 'system',
        subject_user_id: 'm09_star_child_001',
        is_archived: 0
      }),
      expect.objectContaining({
        notification_type: 'star_expiring',
        visibility_scope: 'user',
        type: 'system',
        subject_user_id: 'm09_star_child_001',
        is_archived: 0
      })
    ]);

    await db.query("DELETE FROM star_groups WHERE group_id IN ('m09_star_group_expiring_001', 'm09_star_group_expiring_002')");

    const second = await request(app)
      .post('/api/stars/expiring-reminders/sync')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        scope: 'user',
        targetUserId: 'm09_star_child_001',
        modifyTime: Date.now() + 1000,
        operationKey: 'm09_star_expiring_sync_002'
      });

    expect(second.status).toBe(200);
    expect(second.body.data.archivedCount).toBe(2);

    const archivedRows = await db.query(
      `SELECT visibility_scope, is_archived
       FROM messages
       WHERE message_event_key = 'star:summary:star_expiring:m09_star_child_001:none:${formatDateOffset(1)}'
       ORDER BY visibility_scope ASC`
    );
    expect(archivedRows).toEqual([
      expect.objectContaining({ visibility_scope: 'family', is_archived: 1 }),
      expect.objectContaining({ visibility_scope: 'user', is_archived: 1 })
    ]);
  });

  it('GET /api/stars/records?scope=family 家长可获取全家流水，孩子返回 403', async () => {
    const nextWeek = formatDateOffset(7);
    const nextMonth = formatDateOffset(30);

    await db.query(
      `INSERT INTO star_records (
        record_id, user_id, type, source, source_id, points, description,
        expiry_type, expiry_date, balance, previous_balance, modify_time
      ) VALUES
        ('m09_star_family_record_001', 'm09_star_child_001', 'income', 'task', 'task_a', 3, '孩子1得星', 'week', ?, 3, 0, 1742400004000),
        ('m09_star_family_record_002', 'm09_star_child_002', 'income', 'task', 'task_b', 4, '孩子2得星', 'month', ?, 4, 0, 1742400004001)`,
      [nextWeek, nextMonth]
    );

    const parentRes = await request(app)
      .get('/api/stars/records')
      .query({ scope: 'family' })
      .set('Authorization', `Bearer ${parentToken}`);

    expect(parentRes.status).toBe(200);
    expect(parentRes.body.data.records).toHaveLength(2);

    const childRes = await request(app)
      .get('/api/stars/records')
      .query({ scope: 'family' })
      .set('Authorization', `Bearer ${childToken}`);

    expect(childRes.status).toBe(403);
  });
});
