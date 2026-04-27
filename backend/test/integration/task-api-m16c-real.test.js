/**
 * M16C 真实数据库集成测试 - required task overdue makeup governance
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

async function ensureM16CTables() {
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

  const makeupColumns = await db.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'tasks'
       AND COLUMN_NAME IN ('penalty_deducted_points', 'penalty_refunded', 'penalty_refund_time')`
  );
  const existingColumnNames = new Set((makeupColumns || []).map((row) => row.COLUMN_NAME));

  if (!existingColumnNames.has('penalty_deducted_points')) {
    await db.query(
      `ALTER TABLE tasks
       ADD COLUMN penalty_deducted_points INT NOT NULL DEFAULT 0 COMMENT '必做任务实际扣除星星数'`
    );
  }

  if (!existingColumnNames.has('penalty_refunded')) {
    await db.query(
      `ALTER TABLE tasks
       ADD COLUMN penalty_refunded TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已执行逾期补做退星'`
    );
  }

  if (!existingColumnNames.has('penalty_refund_time')) {
    await db.query(
      `ALTER TABLE tasks
       ADD COLUMN penalty_refund_time BIGINT NULL DEFAULT NULL COMMENT '逾期补做退星时间（epoch ms）'`
    );
  }
}

async function cleanupTestData() {
  await db.query("DELETE FROM messages WHERE related_id LIKE 'm16c_task_%'");
  await db.query("DELETE FROM star_records WHERE source_id LIKE 'm16c_task_%' OR record_id LIKE 'task_makeup_refund_%' OR idempotency_key LIKE 'task_makeup_refund:%' OR idempotency_key LIKE 'task_makeup_refund_revoke:%' OR user_id LIKE 'm16c_task_%'");
  await db.query("DELETE FROM star_groups WHERE group_id LIKE 'm16c_task_%' OR user_id LIKE 'm16c_task_%'");
  await db.query("DELETE FROM tasks WHERE task_id LIKE 'm16c_task_%'");
  await db.query("DELETE FROM users WHERE user_id LIKE 'm16c_task_%'");
  await db.query("DELETE FROM families WHERE family_id LIKE 'm16c_task_%'");
}

async function setupTestData() {
  await cleanupTestData();

  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
      ('m16c_task_parent_001', 'm16c_task_parent_openid', 'M16C家长', NULL, 'parent', 'active', NULL, 0, NULL)`
  );

  await db.query(
    `INSERT INTO families (family_id, name, invite_code, invite_code_role, created_by, status) VALUES
      ('m16c_task_family_001', 'M16C家庭', 'M16CT001', 'child', 'm16c_task_parent_001', 'active')`
  );

  await db.query(
    `UPDATE users
     SET family_id = 'm16c_task_family_001',
         family_permission_role = 'manager'
     WHERE user_id = 'm16c_task_parent_001'`
  );

  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
      ('m16c_task_child_001', 'm16c_task_child_openid_1', 'M16C孩子1', NULL, 'child', 'active', 'm16c_task_family_001', 0, NULL)`
  );
}

async function countTaskMessages(taskId, notificationType) {
  const rows = await db.query(
    `SELECT COUNT(*) AS count
     FROM messages
     WHERE related_id = ? AND notification_type = ?`,
    [taskId, notificationType]
  );
  return Number(rows[0]?.count || 0);
}

async function countTaskRecords(taskId, idempotencyPrefix) {
  const rows = await db.query(
    `SELECT COUNT(*) AS count
     FROM star_records
     WHERE source_id = ? AND idempotency_key LIKE ?`,
    [taskId, `${idempotencyPrefix}%`]
  );
  return Number(rows[0]?.count || 0);
}

describe('M16C tasks API 真实数据库集成测试', () => {
  let childToken;

  beforeAll(async () => {
    await db.testConnection();
    await ensureM16CTables();
    await setupTestData();

    childToken = generateToken({
      user_id: 'm16c_task_child_001',
      openid: 'm16c_task_child_openid_1',
      role: 'child',
      family_id: 'm16c_task_family_001',
    });
  }, 30000);

  afterEach(async () => {
    await db.query("DELETE FROM messages WHERE related_id LIKE 'm16c_task_%'");
    await db.query("DELETE FROM star_records WHERE source_id LIKE 'm16c_task_%' OR record_id LIKE 'task_makeup_refund_%' OR idempotency_key LIKE 'task_makeup_refund:%' OR idempotency_key LIKE 'task_makeup_refund_revoke:%' OR user_id LIKE 'm16c_task_%'");
    await db.query("DELETE FROM star_groups WHERE group_id LIKE 'm16c_task_%' OR user_id LIKE 'm16c_task_%'");
    await db.query("DELETE FROM tasks WHERE task_id LIKE 'm16c_task_%'");
  });

  afterAll(async () => {
    await cleanupTestData();
    await db.closePool();
  });

  it('PATCH /api/tasks/:taskId/status 完成已扣星任务时应退回永久星星并写入 makeup 消息', async () => {
    await db.query(
      `INSERT INTO tasks (
        task_id, user_id, title, type, date, points, status, is_required, penalty_applied,
        penalty_deducted_points, penalty_refunded, penalty_refund_time, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['m16c_task_makeup_001', 'm16c_task_child_001', 'M16C补做任务', 'study', '2026-03-20', 5, 0, 0, 1, 4, 0, null, 1743400001000]
    );

    const res = await request(app)
      .patch('/api/tasks/m16c_task_makeup_001/status')
      .set('Authorization', `Bearer ${childToken}`)
      .send({
        status: 1,
        modifyTime: 1743400002000,
        operationKey: 'm16c_makeup_complete_001',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.task).toEqual(expect.objectContaining({
      taskId: 'm16c_task_makeup_001',
      penaltyApplied: true,
      penaltyDeductedPoints: 4,
      penaltyRefunded: true
    }));

    const groupRows = await db.query(
      `SELECT type, stars FROM star_groups WHERE user_id = 'm16c_task_child_001'`
    );
    const recordRows = await db.query(
      `SELECT source, source_id, points, expiry_type, idempotency_key
       FROM star_records
       WHERE source_id = 'm16c_task_makeup_001'
       ORDER BY created_at ASC`
    );
    const messageRows = await db.query(
      `SELECT notification_type, visibility_scope
       FROM messages
       WHERE related_id = 'm16c_task_makeup_001'
       ORDER BY visibility_scope ASC`
    );

    expect(groupRows).toEqual([
      expect.objectContaining({ type: 'permanent', stars: 4 })
    ]);
    expect(recordRows).toEqual([
      expect.objectContaining({
        source: 'task',
        source_id: 'm16c_task_makeup_001',
        points: 4,
        expiry_type: 'permanent',
        idempotency_key: 'task_makeup_refund:m16c_task_makeup_001:m16c_makeup_complete_001'
      })
    ]);
    expect(messageRows).toEqual([
      expect.objectContaining({ notification_type: 'task_makeup_complete', visibility_scope: 'family' }),
      expect.objectContaining({ notification_type: 'task_makeup_complete', visibility_scope: 'user' }),
    ]);
  });

  it('PATCH /api/tasks/:taskId/status 同一 operationKey 重复补做时应保持幂等', async () => {
    await db.query(
      `INSERT INTO tasks (
        task_id, user_id, title, type, date, points, status, is_required, penalty_applied,
        penalty_deducted_points, penalty_refunded, penalty_refund_time, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['m16c_task_makeup_003', 'm16c_task_child_001', 'M16C补做幂等任务', 'study', '2026-03-20', 5, 0, 0, 1, 4, 0, null, 1743400001000]
    );

    const payload = {
      status: 1,
      modifyTime: 1743400002000,
      operationKey: 'm16c_makeup_complete_same_op',
    };

    const firstRes = await request(app)
      .patch('/api/tasks/m16c_task_makeup_003/status')
      .set('Authorization', `Bearer ${childToken}`)
      .send(payload);
    const secondRes = await request(app)
      .patch('/api/tasks/m16c_task_makeup_003/status')
      .set('Authorization', `Bearer ${childToken}`)
      .send(payload);

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);

    const taskRows = await db.query(
      `SELECT status, penalty_refunded, penalty_refund_time, completion_time
       FROM tasks
       WHERE task_id = 'm16c_task_makeup_003'`
    );

    expect(taskRows).toEqual([
      expect.objectContaining({
        status: 1,
        penalty_refunded: 1,
        penalty_refund_time: 1743400002000,
        completion_time: 1743400002000,
      })
    ]);
    expect(await countTaskRecords('m16c_task_makeup_003', 'task_makeup_refund:')).toBe(1);
    expect(await countTaskMessages('m16c_task_makeup_003', 'task_makeup_complete')).toBe(2);
  });

  it('PATCH /api/tasks/:taskId/status 重置已退星任务时，若永久星星不足应返回 409', async () => {
    await db.query(
      `INSERT INTO tasks (
        task_id, user_id, title, type, date, points, status, is_required, penalty_applied,
        penalty_deducted_points, penalty_refunded, penalty_refund_time, completion_time, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['m16c_task_makeup_002', 'm16c_task_child_001', 'M16C退星回滚任务', 'study', '2026-03-20', 5, 1, 0, 1, 4, 1, 1743400002000, 1743400002000, 1743400002000]
    );

    const res = await request(app)
      .patch('/api/tasks/m16c_task_makeup_002/status')
      .set('Authorization', `Bearer ${childToken}`)
      .send({
        status: 0,
        modifyTime: 1743400003000,
        operationKey: 'm16c_makeup_reset_001',
      });

    expect(res.status).toBe(409);
    expect(res.body).toEqual(expect.objectContaining({
      success: false,
      error_code: 'INSUFFICIENT_STARS'
    }));

    const taskRows = await db.query(
      `SELECT status, penalty_refunded, penalty_refund_time, completion_time
       FROM tasks
       WHERE task_id = 'm16c_task_makeup_002'`
    );
    expect(taskRows).toEqual([
      expect.objectContaining({
        status: 1,
        penalty_refunded: 1,
        penalty_refund_time: 1743400002000,
        completion_time: 1743400002000,
      })
    ]);
    expect(await countTaskRecords('m16c_task_makeup_002', 'task_makeup_refund_revoke:')).toBe(0);
    expect(await countTaskMessages('m16c_task_makeup_002', 'task_reset')).toBe(0);
  });

  it('PATCH /api/tasks/:taskId/status 同一 operationKey 重复重置时应保持幂等', async () => {
    await db.query(
      `INSERT INTO tasks (
        task_id, user_id, title, type, date, points, status, is_required, penalty_applied,
        penalty_deducted_points, penalty_refunded, penalty_refund_time, completion_time, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['m16c_task_makeup_004', 'm16c_task_child_001', 'M16C重置幂等任务', 'study', '2026-03-20', 5, 1, 0, 1, 4, 1, 1743400002000, 1743400002000, 1743400002000]
    );
    await db.query(
      `INSERT INTO star_groups (group_id, user_id, type, stars, expiry_date, modify_time)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['m16c_task_makeup_group_004', 'm16c_task_child_001', 'permanent', 4, null, 1743400002000]
    );

    const payload = {
      status: 0,
      modifyTime: 1743400003000,
      operationKey: 'm16c_makeup_reset_same_op',
    };

    const firstRes = await request(app)
      .patch('/api/tasks/m16c_task_makeup_004/status')
      .set('Authorization', `Bearer ${childToken}`)
      .send(payload);
    const secondRes = await request(app)
      .patch('/api/tasks/m16c_task_makeup_004/status')
      .set('Authorization', `Bearer ${childToken}`)
      .send(payload);

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);

    const taskRows = await db.query(
      `SELECT status, penalty_refunded, penalty_refund_time, completion_time
       FROM tasks
       WHERE task_id = 'm16c_task_makeup_004'`
    );
    const groupRows = await db.query(
      `SELECT type, stars
       FROM star_groups
       WHERE user_id = 'm16c_task_child_001' AND type = 'permanent'`
    );

    expect(taskRows).toEqual([
      expect.objectContaining({
        status: 0,
        penalty_refunded: 0,
        penalty_refund_time: null,
        completion_time: null,
      })
    ]);
    expect(groupRows).toEqual([]);
    expect(await countTaskRecords('m16c_task_makeup_004', 'task_makeup_refund_revoke:')).toBe(1);
    expect(await countTaskMessages('m16c_task_makeup_004', 'task_reset')).toBe(2);
  });
});
