/**
 * M15A 真实数据库集成测试 - tasks message command API
 */

const fs = require('fs');
const path = require('path');

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

function formatDateOffset(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

async function ensureM15ATables() {
  const migrationFiles = [
    '../../database/migrations/007_create_star_records.sql',
    '../../database/migrations/008_create_star_groups.sql',
    '../../database/migrations/010_create_messages.sql',
  ];

  for (const relativeFile of migrationFiles) {
    const sql = fs.readFileSync(path.join(__dirname, relativeFile), 'utf8').trim();
    await db.query(sql);
  }

  const reminderColumn = await db.query("SHOW COLUMNS FROM tasks LIKE 'reminder'");
  if (!Array.isArray(reminderColumn) || reminderColumn.length === 0) {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../database/migrations/011_alter_tasks_add_reminder.sql'),
      'utf8'
    ).trim();
    await db.query(sql);
  }
}

async function cleanupTestData() {
  await db.query("DELETE FROM messages WHERE related_id LIKE 'm15a_task_%'");
  await db.query("DELETE FROM star_records WHERE source_id LIKE 'm15a_task_%' OR record_id LIKE 'm15a_task_%' OR idempotency_key LIKE 'task_penalty:m15a_task_%'");
  await db.query("DELETE FROM star_groups WHERE group_id LIKE 'm15a_task_%'");
  await db.query("DELETE FROM tasks WHERE task_id LIKE 'm15a_task_%'");
  await db.query("DELETE FROM users WHERE user_id LIKE 'm15a_task_%'");
  await db.query("DELETE FROM families WHERE family_id LIKE 'm15a_task_%'");
}

async function setupTestData() {
  await cleanupTestData();

  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
      ('m15a_task_parent_001', 'm15a_task_parent_openid', 'M15A任务家长', NULL, 'parent', 'active', NULL, 0, NULL),
      ('m15a_task_parent_002', 'm15a_task_parent_openid_2', 'M15A外部家长', NULL, 'parent', 'active', NULL, 0, NULL)`
  );

  await db.query(
    `INSERT INTO families (family_id, name, invite_code, invite_code_role, created_by, status) VALUES
      ('m15a_task_family_001', 'M15A任务家庭A', 'M15AT001', 'child', 'm15a_task_parent_001', 'active'),
      ('m15a_task_family_002', 'M15A任务家庭B', 'M15AT002', 'child', 'm15a_task_parent_002', 'active')`
  );

  await db.query(
    `UPDATE users SET family_id = CASE
      WHEN user_id = 'm15a_task_parent_001' THEN 'm15a_task_family_001'
      WHEN user_id = 'm15a_task_parent_002' THEN 'm15a_task_family_002'
      ELSE family_id
    END,
    family_permission_role = CASE
      WHEN role = 'parent' THEN 'manager'
      ELSE family_permission_role
    END
    WHERE user_id IN ('m15a_task_parent_001', 'm15a_task_parent_002')`
  );

  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
      ('m15a_task_child_001', 'm15a_task_child_openid_1', 'M15A孩子1', NULL, 'child', 'active', 'm15a_task_family_001', 0, NULL),
      ('m15a_task_child_002', 'm15a_task_child_openid_2', 'M15A孩子2', NULL, 'child', 'active', 'm15a_task_family_001', 0, NULL),
      ('m15a_task_child_003', 'm15a_task_child_openid_3', 'M15A外部孩子', NULL, 'child', 'active', 'm15a_task_family_002', 0, NULL)`
  );
}

describe('M15A tasks API 真实数据库集成测试', () => {
  let parentToken;
  let childToken;
  let otherChildToken;

  beforeAll(async () => {
    await db.testConnection();
    await ensureM15ATables();
    await setupTestData();

    parentToken = generateToken({
      user_id: 'm15a_task_parent_001',
      openid: 'm15a_task_parent_openid',
      role: 'parent',
      family_id: 'm15a_task_family_001',
    });

    childToken = generateToken({
      user_id: 'm15a_task_child_001',
      openid: 'm15a_task_child_openid_1',
      role: 'child',
      family_id: 'm15a_task_family_001',
    });

    otherChildToken = generateToken({
      user_id: 'm15a_task_child_003',
      openid: 'm15a_task_child_openid_3',
      role: 'child',
      family_id: 'm15a_task_family_002',
    });
  }, 30000);

  afterEach(async () => {
    await db.query("DELETE FROM messages WHERE related_id LIKE 'm15a_task_%'");
    await db.query("DELETE FROM star_records WHERE source_id LIKE 'm15a_task_%' OR record_id LIKE 'm15a_task_%' OR idempotency_key LIKE 'task_penalty:m15a_task_%'");
    await db.query("DELETE FROM star_groups WHERE group_id LIKE 'm15a_task_%'");
    await db.query("DELETE FROM tasks WHERE task_id LIKE 'm15a_task_%'");
  });

  afterAll(async () => {
    await cleanupTestData();
    await db.closePool();
  });

  it('POST /api/tasks/penalties/sync 应对过期必做任务执行扣星、更新状态并写入消息', async () => {
    await db.query(
      `INSERT INTO tasks (
        task_id, user_id, title, type, date, points, status, is_required, penalty_applied, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['m15a_task_penalty_001', 'm15a_task_child_001', 'M15A必做惩罚任务', 'study', formatDateOffset(-1), 5, 0, 1, 0, 1743400001000]
    );
    await db.query(
      `INSERT INTO star_groups (group_id, user_id, type, stars, expiry_date, modify_time) VALUES
        ('m15a_task_penalty_group_001', 'm15a_task_child_001', 'permanent', 5, NULL, 1743400001001)`
    );

    const res = await request(app)
      .post('/api/tasks/penalties/sync')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        modifyTime: Date.now(),
        operationKey: 'm15a_task_penalty_sync_001',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.penaltyCount).toBe(1);
    expect(res.body.data.affectedTaskIds).toEqual(['m15a_task_penalty_001']);

    const taskRows = await db.query(
      'SELECT penalty_applied FROM tasks WHERE task_id = ?',
      ['m15a_task_penalty_001']
    );
    const recordRows = await db.query(
      "SELECT source, source_id, points, idempotency_key FROM star_records WHERE source_id = 'm15a_task_penalty_001' AND source = 'task'"
    );
    const messageRows = await db.query(
      "SELECT notification_type, visibility_scope FROM messages WHERE related_id = 'm15a_task_penalty_001' ORDER BY visibility_scope ASC"
    );

    expect(taskRows[0].penalty_applied).toBe(1);
    expect(recordRows).toHaveLength(1);
    expect(recordRows[0].source).toBe('task');
    expect(recordRows[0].points).toBe(-5);
    expect(recordRows[0].idempotency_key).toBe('task_penalty:m15a_task_penalty_001');
    expect(messageRows).toEqual([
      expect.objectContaining({ notification_type: 'task_penalty', visibility_scope: 'family' }),
      expect.objectContaining({ notification_type: 'task_penalty', visibility_scope: 'user' }),
    ]);
  });

  it('POST /api/tasks/penalties/sync 对已完成或无待惩罚任务应返回空结果', async () => {
    await db.query(
      `INSERT INTO tasks (
        task_id, user_id, title, type, date, points, status, is_required, penalty_applied, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['m15a_task_penalty_done_001', 'm15a_task_child_001', '已完成必做任务', 'study', formatDateOffset(-1), 5, 1, 1, 0, 1743400002000]
    );

    const res = await request(app)
      .post('/api/tasks/penalties/sync')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        modifyTime: Date.now(),
        operationKey: 'm15a_task_penalty_sync_002',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.penaltyCount).toBe(0);
    expect(res.body.data.affectedTaskIds).toEqual([]);
  });

  it('POST /api/tasks/penalties/sync 在 scope=user 时应只处理目标孩子任务', async () => {
    await db.query(
      `INSERT INTO tasks (
        task_id, user_id, title, type, date, points, status, is_required, penalty_applied, modify_time
      ) VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'm15a_task_penalty_user_001', 'm15a_task_child_001', '孩子1必做惩罚任务', 'study', formatDateOffset(-1), 5, 0, 1, 0, 1743400002100,
        'm15a_task_penalty_user_002', 'm15a_task_child_002', '孩子2必做惩罚任务', 'study', formatDateOffset(-1), 4, 0, 1, 0, 1743400002101
      ]
    );
    await db.query(
      `INSERT INTO star_groups (group_id, user_id, type, stars, expiry_date, modify_time) VALUES
        ('m15a_task_penalty_user_group_001', 'm15a_task_child_001', 'permanent', 5, NULL, 1743400002102),
        ('m15a_task_penalty_user_group_002', 'm15a_task_child_002', 'permanent', 4, NULL, 1743400002103)`
    );

    const res = await request(app)
      .post('/api/tasks/penalties/sync')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        scope: 'user',
        targetUserId: 'm15a_task_child_001',
        modifyTime: Date.now(),
        operationKey: 'm15a_task_penalty_sync_user_001',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.penaltyCount).toBe(1);
    expect(res.body.data.affectedTaskIds).toEqual(['m15a_task_penalty_user_001']);

    const taskRows = await db.query(
      'SELECT task_id, penalty_applied FROM tasks WHERE task_id IN (?, ?) ORDER BY task_id ASC',
      ['m15a_task_penalty_user_001', 'm15a_task_penalty_user_002']
    );
    expect(taskRows).toEqual([
      expect.objectContaining({ task_id: 'm15a_task_penalty_user_001', penalty_applied: 1 }),
      expect.objectContaining({ task_id: 'm15a_task_penalty_user_002', penalty_applied: 0 }),
    ]);
  });

  it('POST /api/tasks/penalties/sync 在 scope=user 指向跨家庭成员时应返回 403', async () => {
    const res = await request(app)
      .post('/api/tasks/penalties/sync')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        scope: 'user',
        targetUserId: 'm15a_task_child_003',
        modifyTime: Date.now(),
        operationKey: 'm15a_task_penalty_sync_user_403',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error_code).toBe('FAMILY_MEMBER_ACCESS_DENIED');
  });

  it('POST /api/tasks/upcoming/sync 应生成提醒消息并支持幂等重跑', async () => {
    const startAt = new Date(Date.now() + 20 * 60 * 1000);

    await db.query(
      `INSERT INTO tasks (
        task_id, user_id, title, type, date, start_time, points, status, is_required, reminder, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'm15a_task_upcoming_001',
        'm15a_task_child_001',
        'M15A即将开始任务',
        'study',
        formatDateOffset(0),
        formatTime(startAt),
        3,
        0,
        1,
        JSON.stringify({ enabled: true, time: 30 }),
        1743400003000
      ]
    );

    const payload = {
      modifyTime: Date.now(),
      operationKey: 'm15a_task_upcoming_sync_001',
    };

    const first = await request(app)
      .post('/api/tasks/upcoming/sync')
      .set('Authorization', `Bearer ${parentToken}`)
      .send(payload);

    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.data.createdCount).toBe(2);
    expect(first.body.data.dedupedCount).toBe(0);
    expect(first.body.data.activeCount).toBe(2);
    expect(first.body.data.affectedTaskIds).toEqual(['m15a_task_upcoming_001']);

    const second = await request(app)
      .post('/api/tasks/upcoming/sync')
      .set('Authorization', `Bearer ${parentToken}`)
      .send(payload);

    expect(second.status).toBe(200);
    expect(second.body.data.createdCount).toBe(0);
    expect(second.body.data.dedupedCount).toBe(2);
    expect(second.body.data.activeCount).toBe(2);

    const messageRows = await db.query(
      "SELECT notification_type, visibility_scope, is_archived FROM messages WHERE related_id = 'm15a_task_upcoming_001' ORDER BY visibility_scope ASC"
    );

    expect(messageRows).toEqual([
      expect.objectContaining({ notification_type: 'task_upcoming', visibility_scope: 'family', is_archived: 0 }),
      expect.objectContaining({ notification_type: 'task_upcoming', visibility_scope: 'user', is_archived: 0 }),
    ]);
  });

  it('POST /api/tasks/upcoming/sync 在没有候选任务时应返回空结果', async () => {
    const res = await request(app)
      .post('/api/tasks/upcoming/sync')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        modifyTime: Date.now(),
        operationKey: 'm15a_task_upcoming_sync_002',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.createdCount).toBe(0);
    expect(res.body.data.activeCount).toBe(0);
  });

  it('POST /api/tasks/upcoming/sync 在 scope=user 时应只为目标孩子 materialize 提醒', async () => {
    const startAt = new Date(Date.now() + 20 * 60 * 1000);

    await db.query(
      `INSERT INTO tasks (
        task_id, user_id, title, type, date, start_time, points, status, is_required, reminder, modify_time
      ) VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'm15a_task_upcoming_user_001', 'm15a_task_child_001', '孩子1即将开始任务', 'study', formatDateOffset(0), formatTime(startAt), 3, 0, 1, JSON.stringify({ enabled: true, time: 30 }), 1743400003100,
        'm15a_task_upcoming_user_002', 'm15a_task_child_002', '孩子2即将开始任务', 'study', formatDateOffset(0), formatTime(startAt), 3, 0, 1, JSON.stringify({ enabled: true, time: 30 }), 1743400003101
      ]
    );

    const res = await request(app)
      .post('/api/tasks/upcoming/sync')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        scope: 'user',
        targetUserId: 'm15a_task_child_001',
        modifyTime: Date.now(),
        operationKey: 'm15a_task_upcoming_sync_user_001',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.createdCount).toBe(2);
    expect(res.body.data.affectedTaskIds).toEqual(['m15a_task_upcoming_user_001']);

    const messageRows = await db.query(
      "SELECT related_id, visibility_scope FROM messages WHERE related_id IN ('m15a_task_upcoming_user_001', 'm15a_task_upcoming_user_002') ORDER BY related_id ASC, visibility_scope ASC"
    );

    expect(messageRows).toEqual([
      expect.objectContaining({ related_id: 'm15a_task_upcoming_user_001', visibility_scope: 'family' }),
      expect.objectContaining({ related_id: 'm15a_task_upcoming_user_001', visibility_scope: 'user' }),
    ]);
  });

  it('POST /api/tasks/upcoming/sync 在 scope=user 指向跨家庭成员时应返回 403', async () => {
    const res = await request(app)
      .post('/api/tasks/upcoming/sync')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        scope: 'user',
        targetUserId: 'm15a_task_child_003',
        modifyTime: Date.now(),
        operationKey: 'm15a_task_upcoming_sync_user_403',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error_code).toBe('FAMILY_MEMBER_ACCESS_DENIED');
  });

  it('PATCH /api/tasks/:taskId/required 应成功标记必做并写入消息，重复调用保持幂等', async () => {
    await db.query(
      `INSERT INTO tasks (task_id, user_id, title, type, date, points, status, is_required, penalty_applied, modify_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['m15a_task_required_001', 'm15a_task_child_001', 'M15A设为必做', 'study', formatDateOffset(1), 4, 0, 0, 0, 1743400004000]
    );

    const first = await request(app)
      .patch('/api/tasks/m15a_task_required_001/required')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ modifyTime: 1743400004001 });

    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.data.task.isRequired).toBe(true);

    const second = await request(app)
      .patch('/api/tasks/m15a_task_required_001/required')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ modifyTime: 1743400004002 });

    expect(second.status).toBe(200);
    expect(second.body.data.task.isRequired).toBe(true);

    const taskRows = await db.query(
      'SELECT is_required FROM tasks WHERE task_id = ?',
      ['m15a_task_required_001']
    );
    const messageRows = await db.query(
      "SELECT notification_type, visibility_scope FROM messages WHERE related_id = 'm15a_task_required_001' ORDER BY visibility_scope ASC"
    );

    expect(taskRows[0].is_required).toBe(1);
    expect(messageRows).toEqual([
      expect.objectContaining({ notification_type: 'task_required', visibility_scope: 'family' }),
      expect.objectContaining({ notification_type: 'task_required', visibility_scope: 'user' }),
    ]);
  });

  it('PATCH /api/tasks/:taskId/unrequired 应成功取消必做并校验跨家庭权限', async () => {
    await db.query(
      `INSERT INTO tasks (task_id, user_id, title, type, date, points, status, is_required, penalty_applied, modify_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['m15a_task_unrequired_001', 'm15a_task_child_001', 'M15A取消必做', 'study', formatDateOffset(1), 4, 0, 1, 0, 1743400005000]
    );

    const forbidden = await request(app)
      .patch('/api/tasks/m15a_task_unrequired_001/unrequired')
      .set('Authorization', `Bearer ${otherChildToken}`)
      .send({ modifyTime: 1743400005001 });

    expect(forbidden.status).toBe(403);

    const ok = await request(app)
      .patch('/api/tasks/m15a_task_unrequired_001/unrequired')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ modifyTime: 1743400005002 });

    expect(ok.status).toBe(200);
    expect(ok.body.success).toBe(true);
    expect(ok.body.data.task.isRequired).toBe(false);

    const taskRows = await db.query(
      'SELECT is_required FROM tasks WHERE task_id = ?',
      ['m15a_task_unrequired_001']
    );
    const messageRows = await db.query(
      "SELECT notification_type, visibility_scope FROM messages WHERE related_id = 'm15a_task_unrequired_001' ORDER BY visibility_scope ASC"
    );

    expect(taskRows[0].is_required).toBe(0);
    expect(messageRows).toEqual([
      expect.objectContaining({ notification_type: 'task_unrequired', visibility_scope: 'family' }),
      expect.objectContaining({ notification_type: 'task_unrequired', visibility_scope: 'user' }),
    ]);
  });
});
