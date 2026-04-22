/**
 * M21L 真实数据库集成测试 - occurrence task APIs
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

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateOffset(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function buildModifyTime(dateString, hour = 12) {
  return new Date(`${dateString}T${String(hour).padStart(2, '0')}:00:00`).getTime();
}

function resolveExpiryDateByType(modifyTime, expiryType) {
  const anchor = new Date(Number(modifyTime));
  const result = new Date(anchor.getTime());

  if (expiryType === 'week') {
    const daysUntilSunday = 7 - result.getDay();
    result.setDate(result.getDate() + (daysUntilSunday === 7 ? 0 : daysUntilSunday));
  } else if (expiryType === 'month') {
    result.setMonth(result.getMonth() + 1, 0);
  } else if (expiryType === 'quarter') {
    const quarterEndMonth = Math.floor(result.getMonth() / 3) * 3 + 2;
    result.setMonth(quarterEndMonth + 1, 0);
  } else {
    return null;
  }

  return formatDate(result);
}

function buildRepeatPayload(startDate, endDate) {
  return JSON.stringify({
    type: 'weekly',
    days: [],
    startDate,
    endDate
  });
}

async function ensureM21LTables() {
  const baseMigrations = [
    '../../database/migrations/007_create_star_records.sql',
    '../../database/migrations/008_create_star_groups.sql',
    '../../database/migrations/010_create_messages.sql'
  ];

  for (const relativeFile of baseMigrations) {
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

  const executionModeColumn = await db.query("SHOW COLUMNS FROM tasks LIKE 'execution_mode'");
  if (!Array.isArray(executionModeColumn) || executionModeColumn.length === 0) {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../database/migrations/014_alter_tasks_add_occurrence_fields.sql'),
      'utf8'
    ).trim();
    await db.query(sql);
  }
}

async function cleanupTestData() {
  await db.query("DELETE FROM messages WHERE related_id LIKE 'm21l_task_%'");
  await db.query("DELETE FROM star_records WHERE source_id LIKE 'm21l_task_%' OR record_id LIKE 'm21l_task_%' OR user_id LIKE 'm21l_task_%' OR idempotency_key LIKE 'task_occurrence_success:m21l_task_%' OR idempotency_key LIKE 'task_occurrence_revoke:m21l_task_%'");
  await db.query("DELETE FROM star_groups WHERE group_id LIKE 'm21l_task_%' OR user_id LIKE 'm21l_task_%'");
  await db.query("DELETE FROM tasks WHERE task_id LIKE 'm21l_task_%'");
  await db.query("DELETE FROM users WHERE user_id LIKE 'm21l_task_%'");
  await db.query("DELETE FROM families WHERE family_id LIKE 'm21l_task_%'");
}

async function setupTestData() {
  await cleanupTestData();

  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
      ('m21l_task_parent_001', 'm21l_task_parent_openid_1', 'M21L家长', NULL, 'parent', 'active', NULL, 0, NULL),
      ('m21l_task_parent_002', 'm21l_task_parent_openid_2', 'M21L外部家长', NULL, 'parent', 'active', NULL, 0, NULL)`
  );

  await db.query(
    `INSERT INTO families (family_id, name, invite_code, invite_code_role, created_by, status) VALUES
      ('m21l_task_family_001', 'M21L家庭A', 'M21LT001', 'child', 'm21l_task_parent_001', 'active'),
      ('m21l_task_family_002', 'M21L家庭B', 'M21LT002', 'child', 'm21l_task_parent_002', 'active')`
  );

  await db.query(
    `UPDATE users SET family_id = CASE
      WHEN user_id = 'm21l_task_parent_001' THEN 'm21l_task_family_001'
      WHEN user_id = 'm21l_task_parent_002' THEN 'm21l_task_family_002'
      ELSE family_id
    END,
    family_permission_role = CASE
      WHEN role = 'parent' THEN 'manager'
      ELSE family_permission_role
    END
    WHERE user_id IN ('m21l_task_parent_001', 'm21l_task_parent_002')`
  );

  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
      ('m21l_task_child_001', 'm21l_task_child_openid_1', 'M21L孩子1', NULL, 'child', 'active', 'm21l_task_family_001', 0, NULL),
      ('m21l_task_child_002', 'm21l_task_child_openid_2', 'M21L孩子2', NULL, 'child', 'active', 'm21l_task_family_001', 0, NULL),
      ('m21l_task_child_003', 'm21l_task_child_openid_3', 'M21L外部孩子', NULL, 'child', 'active', 'm21l_task_family_002', 0, NULL)`
  );
}

describe('M21L tasks API 真实数据库集成测试', () => {
  let parentToken;
  let childToken;
  let otherChildToken;

  beforeAll(async () => {
    await db.testConnection();
    await ensureM21LTables();
    await setupTestData();

    parentToken = generateToken({
      user_id: 'm21l_task_parent_001',
      openid: 'm21l_task_parent_openid_1',
      role: 'parent',
      family_id: 'm21l_task_family_001',
    });

    childToken = generateToken({
      user_id: 'm21l_task_child_001',
      openid: 'm21l_task_child_openid_1',
      role: 'child',
      family_id: 'm21l_task_family_001',
    });

    otherChildToken = generateToken({
      user_id: 'm21l_task_child_003',
      openid: 'm21l_task_child_openid_3',
      role: 'child',
      family_id: 'm21l_task_family_002',
    });
  }, 30000);

  afterEach(async () => {
    await db.query("DELETE FROM messages WHERE related_id LIKE 'm21l_task_%'");
    await db.query("DELETE FROM star_records WHERE source_id LIKE 'm21l_task_%' OR record_id LIKE 'm21l_task_%' OR user_id LIKE 'm21l_task_%' OR idempotency_key LIKE 'task_occurrence_success:m21l_task_%' OR idempotency_key LIKE 'task_occurrence_revoke:m21l_task_%'");
    await db.query("DELETE FROM star_groups WHERE group_id LIKE 'm21l_task_%' OR user_id LIKE 'm21l_task_%'");
    await db.query("DELETE FROM tasks WHERE task_id LIKE 'm21l_task_%'");
  });

  afterAll(async () => {
    await cleanupTestData();
    await db.closePool();
  });

  it('GET /api/tasks 在 occurrenceMode=config 月范围查询下应返回月中生效的表现项', async () => {
    await db.query(
      `INSERT INTO tasks (
        task_id, user_id, title, description, type, date, points, status,
        points_expiry, execution_mode, active_start_date, active_end_date,
        active_has_no_end_date, is_occurrence_record, occurrence_outcome,
        recorded_at, is_required, is_all_day, start_time, end_time,
        duration, reminder, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'm21l_task_occ_cfg_001',
        'm21l_task_child_001',
        'M21L听写全对',
        '',
        'study',
        '2026-04-15',
        2,
        0,
        'permanent',
        'occurrence',
        '2026-04-15',
        null,
        1,
        0,
        'none',
        null,
        0,
        0,
        '',
        '',
        0,
        JSON.stringify({ enabled: false, time: 0 }),
        1760000001000
      ]
    );

    const res = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${parentToken}`)
      .query({
        targetUserId: 'm21l_task_child_001',
        includeOccurrence: 'true',
        occurrenceMode: 'config',
        startDate: '2026-04-01',
        endDate: '2026-04-30'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tasks).toHaveLength(1);
    expect(res.body.data.tasks[0]).toEqual(expect.objectContaining({
      taskId: 'm21l_task_occ_cfg_001',
      executionMode: 'occurrence',
      isOccurrenceRecord: false,
      activeRange: expect.objectContaining({
        startDate: '2026-04-15',
        hasNoEndDate: true
      })
    }));
  });

  it('POST /api/tasks/:taskId/occurrence-record 同日覆盖结果时应复用同一记录并撤回已发星星', async () => {
    const recordDate = formatDateOffset(-1);
    const firstModifyTime = buildModifyTime(recordDate, 10);
    const secondModifyTime = buildModifyTime(recordDate, 11);

    await db.query(
      `INSERT INTO tasks (
        task_id, user_id, title, description, type, date, points, status,
        points_expiry, execution_mode, active_start_date, active_end_date,
        active_has_no_end_date, is_occurrence_record, occurrence_outcome,
        recorded_at, is_required, is_all_day, start_time, end_time,
        duration, reminder, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'm21l_task_occ_cfg_002',
        'm21l_task_child_001',
        'M21L考试全对',
        '',
        'study',
        recordDate,
        3,
        0,
        'week',
        'occurrence',
        recordDate,
        null,
        1,
        0,
        'none',
        null,
        0,
        0,
        '',
        '',
        0,
        JSON.stringify({ enabled: false, time: 0 }),
        1760000002000
      ]
    );

    const firstRes = await request(app)
      .post('/api/tasks/m21l_task_occ_cfg_002/occurrence-record')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        targetUserId: 'm21l_task_child_001',
        date: recordDate,
        outcome: 'success',
        modifyTime: firstModifyTime,
        operationKey: 'm21l_occ_record_success_001'
      });

    expect(firstRes.status).toBe(200);
    expect(firstRes.body.success).toBe(true);
    expect(firstRes.body.data.recordTask).toEqual(expect.objectContaining({
      parentTaskId: 'm21l_task_occ_cfg_002',
      occurrenceOutcome: 'success',
      starAwarded: true
    }));

    const secondRes = await request(app)
      .post('/api/tasks/m21l_task_occ_cfg_002/occurrence-record')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        targetUserId: 'm21l_task_child_001',
        date: recordDate,
        outcome: 'failure',
        modifyTime: secondModifyTime,
        operationKey: 'm21l_occ_record_failure_001'
      });

    expect(secondRes.status).toBe(200);
    expect(secondRes.body.success).toBe(true);
    expect(secondRes.body.data.recordTask).toEqual(expect.objectContaining({
      parentTaskId: 'm21l_task_occ_cfg_002',
      occurrenceOutcome: 'failure',
      starAwarded: false
    }));

    const recordRows = await db.query(
      `SELECT task_id, parent_task_id, occurrence_outcome, status, star_awarded
       FROM tasks
       WHERE parent_task_id = 'm21l_task_occ_cfg_002'`
    );
    const starRecordRows = await db.query(
      `SELECT points, expiry_type, expiry_date, idempotency_key
       FROM star_records
       WHERE source_id = ?
       ORDER BY created_at ASC`,
      [secondRes.body.data.recordTask.taskId]
    );
    const starGroupRows = await db.query(
      `SELECT COALESCE(SUM(stars), 0) AS totalStars
       FROM star_groups
       WHERE user_id = 'm21l_task_child_001'`
    );

    expect(recordRows).toHaveLength(1);
    expect(recordRows[0]).toEqual(expect.objectContaining({
      occurrence_outcome: 'failure',
      status: 0,
      star_awarded: 0
    }));
    expect(starRecordRows).toHaveLength(2);
    expect(starRecordRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        points: 3,
        expiry_type: 'week',
        expiry_date: resolveExpiryDateByType(firstModifyTime, 'week'),
        idempotency_key: expect.stringContaining('task_occurrence_success:')
      }),
      expect.objectContaining({
        points: -3,
        idempotency_key: expect.stringContaining('task_occurrence_revoke:')
      })
    ]));
    expect(Number(starGroupRows[0].totalStars || 0)).toBe(0);
  });

  it('POST /api/tasks/:taskId/disable-occurrence 停用后应退出未来查询但可在 includeInactive 下继续返回', async () => {
    const today = formatDateOffset(0);
    const yesterday = formatDateOffset(-1);

    await db.query(
      `INSERT INTO tasks (
        task_id, user_id, title, description, type, date, points, status,
        points_expiry, execution_mode, active_start_date, active_end_date,
        active_has_no_end_date, is_occurrence_record, occurrence_outcome,
        recorded_at, is_required, is_all_day, start_time, end_time,
        duration, reminder, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'm21l_task_occ_cfg_003',
        'm21l_task_child_001',
        'M21L课堂表现',
        '',
        'habit',
        yesterday,
        1,
        0,
        'permanent',
        'occurrence',
        yesterday,
        null,
        1,
        0,
        'none',
        null,
        0,
        0,
        '',
        '',
        0,
        JSON.stringify({ enabled: false, time: 0 }),
        1760000003000
      ]
    );

    const disableRes = await request(app)
      .post('/api/tasks/m21l_task_occ_cfg_003/disable-occurrence')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        disableFromDate: today,
        modifyTime: 1760000003100,
        operationKey: 'm21l_occ_disable_001'
      });

    expect(disableRes.status).toBe(200);
    expect(disableRes.body.success).toBe(true);
    expect(disableRes.body.data.disabledTask).toEqual(expect.objectContaining({
      taskId: 'm21l_task_occ_cfg_003',
      executionMode: 'occurrence',
      hasNoEndDate: false,
      activeRange: expect.objectContaining({
        endDate: yesterday,
        hasNoEndDate: false
      })
    }));

    const disabledRows = await db.query(
      `SELECT has_no_end_date, active_end_date, active_has_no_end_date
         FROM tasks
        WHERE task_id = 'm21l_task_occ_cfg_003'`
    );
    expect(disabledRows[0]).toEqual(expect.objectContaining({
      has_no_end_date: 0,
      active_end_date: yesterday,
      active_has_no_end_date: 0
    }));

    const futureQueryRes = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${parentToken}`)
      .query({
        targetUserId: 'm21l_task_child_001',
        includeOccurrence: 'true',
        occurrenceMode: 'config',
        date: today
      });

    const inactiveQueryRes = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${parentToken}`)
      .query({
        targetUserId: 'm21l_task_child_001',
        includeOccurrence: 'true',
        occurrenceMode: 'config',
        includeInactive: 'true'
      });

    expect(futureQueryRes.status).toBe(200);
    expect(futureQueryRes.body.data.tasks).toHaveLength(0);
    expect(inactiveQueryRes.status).toBe(200);
    expect(inactiveQueryRes.body.data.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskId: 'm21l_task_occ_cfg_003' })
      ])
    );
  });

  it('历史表现项调用 PUT /api/tasks/:taskId 应返回 409 + TASK_OCCURRENCE_HISTORY_READONLY', async () => {
    await db.query(
      `INSERT INTO tasks (
        task_id, user_id, title, description, type, date, points, status,
        points_expiry, execution_mode, active_start_date, active_end_date,
        active_has_no_end_date, is_occurrence_record, occurrence_outcome,
        recorded_at, is_required, is_all_day, start_time, end_time,
        duration, reminder, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'm21l_task_occ_cfg_history_update',
        'm21l_task_child_001',
        'M21L历史表现项更新',
        '',
        'study',
        '2026-04-01',
        2,
        0,
        'permanent',
        'occurrence',
        '2026-04-01',
        '2026-04-10',
        0,
        0,
        'none',
        null,
        0,
        0,
        '',
        '',
        0,
        JSON.stringify({ enabled: false, time: 0 }),
        1760000003200
      ]
    );

    const res = await request(app)
      .put('/api/tasks/m21l_task_occ_cfg_history_update')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        title: '试图修改历史项'
      });

    expect(res.status).toBe(409);
    expect(res.body.error_code).toBe('TASK_OCCURRENCE_HISTORY_READONLY');
  });

  it('历史表现项调用 POST /api/tasks/:taskId/disable-occurrence 应返回 409 + TASK_OCCURRENCE_HISTORY_READONLY', async () => {
    await db.query(
      `INSERT INTO tasks (
        task_id, user_id, title, description, type, date, points, status,
        points_expiry, execution_mode, active_start_date, active_end_date,
        active_has_no_end_date, is_occurrence_record, occurrence_outcome,
        recorded_at, is_required, is_all_day, start_time, end_time,
        duration, reminder, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'm21l_task_occ_cfg_history_disable',
        'm21l_task_child_001',
        'M21L历史表现项停用',
        '',
        'habit',
        '2026-04-01',
        1,
        0,
        'permanent',
        'occurrence',
        '2026-04-01',
        '2026-04-10',
        0,
        0,
        'none',
        null,
        0,
        0,
        '',
        '',
        0,
        JSON.stringify({ enabled: false, time: 0 }),
        1760000003201
      ]
    );

    const res = await request(app)
      .post('/api/tasks/m21l_task_occ_cfg_history_disable/disable-occurrence')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        disableFromDate: formatDateOffset(0)
      });

    expect(res.status).toBe(409);
    expect(res.body.error_code).toBe('TASK_OCCURRENCE_HISTORY_READONLY');
  });

  it('历史表现项调用 DELETE /api/tasks/:taskId 应返回 409 + TASK_OCCURRENCE_HISTORY_READONLY', async () => {
    await db.query(
      `INSERT INTO tasks (
        task_id, user_id, title, description, type, date, points, status,
        points_expiry, execution_mode, active_start_date, active_end_date,
        active_has_no_end_date, is_occurrence_record, occurrence_outcome,
        recorded_at, is_required, is_all_day, start_time, end_time,
        duration, reminder, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'm21l_task_occ_cfg_history_delete',
        'm21l_task_child_001',
        'M21L历史表现项删除',
        '',
        'study',
        '2026-04-01',
        1,
        0,
        'permanent',
        'occurrence',
        '2026-04-01',
        '2026-04-10',
        0,
        0,
        'none',
        null,
        0,
        0,
        '',
        '',
        0,
        JSON.stringify({ enabled: false, time: 0 }),
        1760000003202
      ]
    );

    const res = await request(app)
      .delete('/api/tasks/m21l_task_occ_cfg_history_delete')
      .set('Authorization', `Bearer ${parentToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error_code).toBe('TASK_OCCURRENCE_HISTORY_READONLY');
  });

  it('POST /api/tasks/:taskId/convert-occurrence 应只归档未来未完成实例并把父任务切成表现项', async () => {
    const today = formatDateOffset(0);
    const tomorrow = formatDateOffset(1);
    const dayAfterTomorrow = formatDateOffset(2);
    const nextWeek = formatDateOffset(7);

    await db.query(
      `INSERT INTO tasks (
        task_id, user_id, title, description, type, date, points, status,
        points_expiry, is_required, is_all_day, start_time, end_time,
        duration, reminder, modify_time, has_no_end_date, \`repeat\`
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'm21l_task_planned_parent_001',
        'm21l_task_child_001',
        'M21L周计划任务',
        '',
        'study',
        today,
        2,
        0,
        'permanent',
        1,
        0,
        '18:00',
        '18:30',
        30,
        JSON.stringify({ enabled: true, time: 10 }),
        1760000004000,
        0,
        buildRepeatPayload(today, nextWeek)
      ]
    );

    await db.query(
      `INSERT INTO tasks (
        task_id, user_id, title, description, type, date, points, status,
        points_expiry, is_required, is_all_day, start_time, end_time,
        duration, reminder, modify_time, has_no_end_date, parent_task_id
      ) VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'm21l_task_planned_child_future_001',
        'm21l_task_child_001',
        'M21L未来实例未完成',
        '',
        'study',
        tomorrow,
        2,
        0,
        'permanent',
        1,
        0,
        '18:00',
        '18:30',
        30,
        JSON.stringify({ enabled: true, time: 10 }),
        1760000004001,
        0,
        'm21l_task_planned_parent_001',
        'm21l_task_planned_child_future_002',
        'm21l_task_child_001',
        'M21L未来实例已完成',
        '',
        'study',
        dayAfterTomorrow,
        2,
        1,
        'permanent',
        1,
        0,
        '18:00',
        '18:30',
        30,
        JSON.stringify({ enabled: true, time: 10 }),
        1760000004002,
        0,
        'm21l_task_planned_parent_001'
      ]
    );

    const convertRes = await request(app)
      .post('/api/tasks/m21l_task_planned_parent_001/convert-occurrence')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        effectiveFromDate: today,
        modifyTime: 1760000004100,
        operationKey: 'm21l_occ_convert_001'
      });

    expect(convertRes.status).toBe(200);
    expect(convertRes.body.success).toBe(true);
    expect(convertRes.body.data.convertedTask).toEqual(expect.objectContaining({
      taskId: 'm21l_task_planned_parent_001',
      executionMode: 'occurrence',
      isRequired: false,
      activeRange: expect.objectContaining({
        startDate: today
      })
    }));
    expect(convertRes.body.data.archivedFutureTaskIds).toEqual(['m21l_task_planned_child_future_001']);

    const parentRows = await db.query(
      `SELECT execution_mode, active_start_date, active_has_no_end_date, is_required, start_time, end_time, \`repeat\`
       FROM tasks
       WHERE task_id = 'm21l_task_planned_parent_001'`
    );
    const childRows = await db.query(
      `SELECT task_id, status, deleted_at
       FROM tasks
       WHERE task_id IN ('m21l_task_planned_child_future_001', 'm21l_task_planned_child_future_002')
       ORDER BY task_id ASC`
    );

    expect(parentRows[0]).toEqual(expect.objectContaining({
      execution_mode: 'occurrence',
      active_start_date: today,
      active_has_no_end_date: 0,
      is_required: 0,
      start_time: '00:00:00',
      end_time: '00:00:00',
      repeat: null
    }));
    expect(childRows).toEqual([
      expect.objectContaining({
        task_id: 'm21l_task_planned_child_future_001',
        status: 0
      }),
      expect.objectContaining({
        task_id: 'm21l_task_planned_child_future_002',
        status: 1,
        deleted_at: null
      })
    ]);
    expect(childRows[0].deleted_at).not.toBeNull();
  });

  it('POST /api/tasks/:taskId/occurrence-record 对跨家庭孩子应拒绝访问', async () => {
    const today = formatDateOffset(0);

    await db.query(
      `INSERT INTO tasks (
        task_id, user_id, title, description, type, date, points, status,
        points_expiry, execution_mode, active_start_date, active_end_date,
        active_has_no_end_date, is_occurrence_record, occurrence_outcome,
        recorded_at, is_required, is_all_day, start_time, end_time,
        duration, reminder, modify_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'm21l_task_occ_cfg_004',
        'm21l_task_child_001',
        'M21L跨家庭保护',
        '',
        'study',
        today,
        1,
        0,
        'permanent',
        'occurrence',
        today,
        null,
        1,
        0,
        'none',
        null,
        0,
        0,
        '',
        '',
        0,
        JSON.stringify({ enabled: false, time: 0 }),
        1760000005000
      ]
    );

    const res = await request(app)
      .post('/api/tasks/m21l_task_occ_cfg_004/occurrence-record')
      .set('Authorization', `Bearer ${otherChildToken}`)
      .send({
        targetUserId: 'm21l_task_child_001',
        date: today,
        outcome: 'success',
        modifyTime: 1760000005100,
        operationKey: 'm21l_occ_forbidden_001'
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error_code).toBe('PERMISSION_DENIED');
  });
});
