/**
 * M10 真实数据库集成测试 - messages API
 */

const fs = require('fs');
const path = require('path');

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const db = require('../../config/database');
const taskRoutes = require('../../routes/tasks');
const rewardRoutes = require('../../routes/rewards');
const messageRoutes = require('../../routes/messages');
const { authMiddleware } = require('../../middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/tasks', authMiddleware, taskRoutes);
app.use('/api/rewards', authMiddleware, rewardRoutes);
app.use('/api/messages', authMiddleware, messageRoutes);

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

async function ensureM10Tables() {
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
  await db.query("DELETE FROM messages WHERE related_id LIKE 'm10_msg_%'");
  await db.query("DELETE FROM star_records WHERE source_id LIKE 'm10_msg_%' OR record_id LIKE 'm10_msg_%' OR idempotency_key LIKE 'reward_exchange:m10_msg_%'");
  await db.query("DELETE FROM star_groups WHERE group_id LIKE 'm10_msg_%'");
  await db.query("DELETE FROM rewards WHERE reward_id LIKE 'm10_msg_%'");
  await db.query("DELETE FROM tasks WHERE task_id LIKE 'm10_msg_%'");
  await db.query("DELETE FROM users WHERE user_id LIKE 'm10_msg_%'");
  await db.query("DELETE FROM families WHERE family_id LIKE 'm10_msg_%'");
}

async function setupTestData() {
  await cleanupTestData();

  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
      ('m10_msg_parent_001', 'm10_msg_parent_openid', 'M10家长', NULL, 'parent', 'active', NULL, 0, NULL),
      ('m10_msg_child_001', 'm10_msg_child_openid_1', 'M10孩子1', NULL, 'child', 'active', NULL, 0, NULL),
      ('m10_msg_child_002', 'm10_msg_child_openid_2', 'M10孩子2', NULL, 'child', 'active', NULL, 0, NULL)`
  );

  await db.query(
    `INSERT INTO families (family_id, name, invite_code, invite_code_role, created_by, status) VALUES
      ('m10_msg_family_001', 'M10消息家庭', 'M10MSG01', 'child', 'm10_msg_parent_001', 'active')`
  );

  await db.query(
    `UPDATE users
     SET family_id = 'm10_msg_family_001'
     WHERE user_id IN ('m10_msg_parent_001', 'm10_msg_child_001', 'm10_msg_child_002')`
  );
}

describe('M10 messages API 真实数据库集成测试', () => {
  let parentToken;
  let childToken;

  beforeAll(async () => {
    await db.testConnection();
    await ensureM10Tables();
    await setupTestData();

    parentToken = generateToken({
      user_id: 'm10_msg_parent_001',
      openid: 'm10_msg_parent_openid',
      role: 'parent',
      family_id: 'm10_msg_family_001',
    });

    childToken = generateToken({
      user_id: 'm10_msg_child_001',
      openid: 'm10_msg_child_openid_1',
      role: 'child',
      family_id: 'm10_msg_family_001',
    });
  }, 30000);

  afterEach(async () => {
    await db.query("DELETE FROM messages WHERE related_id LIKE 'm10_msg_%'");
    await db.query("DELETE FROM star_records WHERE source_id LIKE 'm10_msg_%' OR record_id LIKE 'm10_msg_%' OR idempotency_key LIKE 'reward_exchange:m10_msg_%'");
    await db.query("DELETE FROM star_groups WHERE group_id LIKE 'm10_msg_%'");
    await db.query("DELETE FROM rewards WHERE reward_id LIKE 'm10_msg_%'");
    await db.query("DELETE FROM tasks WHERE task_id LIKE 'm10_msg_%'");
  });

  afterAll(async () => {
    await cleanupTestData();
    await db.closePool();
  });

  it('任务创建与完成后，应同时生成孩子个人流和家长家庭流消息', async () => {
    const createRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        taskId: 'm10_msg_task_001',
        targetUserId: 'm10_msg_child_001',
        title: 'M10数学作业',
        type: 'study',
        date: '2026-03-22',
        points: 2,
        modifyTime: 1742600010001,
        operationKey: 'm10_msg_task_create_op_001',
      });

    expect(createRes.status).toBe(200);
    expect(createRes.body.success).toBe(true);

    const familyMessagesAfterCreate = await request(app)
      .get('/api/messages?scope=family')
      .set('Authorization', `Bearer ${parentToken}`);

    expect(familyMessagesAfterCreate.status).toBe(200);
    expect(familyMessagesAfterCreate.body.data.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relatedId: 'm10_msg_task_001',
          notificationType: 'task_create',
          visibilityScope: 'family',
          subjectUserId: 'm10_msg_child_001',
        })
      ])
    );

    const childMessagesAfterCreate = await request(app)
      .get('/api/messages?scope=user')
      .set('Authorization', `Bearer ${childToken}`);

    expect(childMessagesAfterCreate.status).toBe(200);
    expect(childMessagesAfterCreate.body.data.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relatedId: 'm10_msg_task_001',
          notificationType: 'task_create',
          visibilityScope: 'user',
          userId: 'm10_msg_child_001',
          summary: 'M10家长给你安排了任务“M10数学作业”',
        })
      ])
    );

    const completeRes = await request(app)
      .patch('/api/tasks/m10_msg_task_001/status')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        status: 1,
        starAwarded: true,
        modifyTime: 1742600010002,
        operationKey: 'm10_msg_task_complete_op_001',
        operatorContext: {
          actorUserId: 'm10_msg_child_001',
          actorRole: 'child',
        },
      });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.success).toBe(true);

    const familyMessagesAfterComplete = await request(app)
      .get('/api/messages?scope=family')
      .set('Authorization', `Bearer ${parentToken}`);

    expect(familyMessagesAfterComplete.body.data.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relatedId: 'm10_msg_task_001',
          notificationType: 'task_complete',
          visibilityScope: 'family',
          summary: 'M10孩子1完成了任务“M10数学作业”',
        })
      ])
    );

    const childMessagesAfterComplete = await request(app)
      .get('/api/messages?scope=user')
      .set('Authorization', `Bearer ${childToken}`);

    expect(childMessagesAfterComplete.body.data.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relatedId: 'm10_msg_task_001',
          notificationType: 'task_complete',
          visibilityScope: 'user',
          summary: '你完成了任务“M10数学作业”',
        })
      ])
    );
  });

  it('家长自己视角代孩子完成任务时，家庭消息应显示代操作文案', async () => {
    const createRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        taskId: 'm10_msg_task_002',
        targetUserId: 'm10_msg_child_001',
        title: 'M10英语作业',
        type: 'study',
        date: '2026-03-22',
        points: 2,
        modifyTime: 1742600010011,
        operationKey: 'm10_msg_task_create_op_002',
      });

    expect(createRes.status).toBe(200);

    const completeRes = await request(app)
      .patch('/api/tasks/m10_msg_task_002/status')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        status: 1,
        starAwarded: true,
        modifyTime: 1742600010012,
        operationKey: 'm10_msg_task_complete_op_002',
      });

    expect(completeRes.status).toBe(200);

    const familyMessages = await request(app)
      .get('/api/messages?scope=family')
      .set('Authorization', `Bearer ${parentToken}`);

    expect(familyMessages.body.data.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relatedId: 'm10_msg_task_002',
          notificationType: 'task_complete',
          visibilityScope: 'family',
          summary: 'M10家长代M10孩子1完成了任务“M10英语作业”',
        })
      ])
    );
  });

  it('家长查看孩子个人流时，不应读到入家前个人旧消息，批量已读也不能误改旧消息', async () => {
    await db.query(
      `INSERT INTO messages (
        message_id, family_id, user_id, actor_user_id, subject_user_id,
        operation_key, message_event_key, visibility_scope, type, notification_type,
        related_id, related_type, title, summary, content, icon, priority,
        is_read, read_time, is_archived, create_time
      ) VALUES
      (?, NULL, ?, ?, ?, ?, ?, 'user', 'system', 'info', ?, 'legacy', ?, ?, NULL, 'ℹ️', 1, 0, NULL, 0, ?),
      (?, ?, ?, ?, ?, ?, ?, 'user', 'task', 'task_create', ?, 'task', ?, ?, NULL, '📝', 1, 0, NULL, 0, ?)`,
      [
        'm10_msg_legacy_user_001',
        'm10_msg_child_001',
        'm10_msg_child_001',
        'm10_msg_child_001',
        'm10_msg_legacy_op_001',
        'm10_msg_legacy_event_001',
        'm10_msg_legacy_related_001',
        '入家前旧消息',
        '这条旧消息不应被家长看到',
        1742600010501,
        'm10_msg_family_user_001',
        'm10_msg_family_001',
        'm10_msg_child_001',
        'm10_msg_parent_001',
        'm10_msg_child_001',
        'm10_msg_family_op_001',
        'm10_msg_family_event_001',
        'm10_msg_family_related_001',
        '家庭内个人消息',
        '这条消息可以被家长看到',
        1742600010502,
      ]
    );

    const childUserMessages = await request(app)
      .get('/api/messages?scope=user')
      .set('Authorization', `Bearer ${childToken}`);

    expect(childUserMessages.status).toBe(200);
    expect(childUserMessages.body.data.messages.map(message => message.messageId)).toEqual(
      expect.arrayContaining(['m10_msg_legacy_user_001', 'm10_msg_family_user_001'])
    );

    const parentProxyMessages = await request(app)
      .get('/api/messages?scope=user&userId=m10_msg_child_001')
      .set('Authorization', `Bearer ${parentToken}`);

    expect(parentProxyMessages.status).toBe(200);
    expect(parentProxyMessages.body.data.messages.map(message => message.messageId)).toContain('m10_msg_family_user_001');
    expect(parentProxyMessages.body.data.messages.map(message => message.messageId)).not.toContain('m10_msg_legacy_user_001');

    const readAllRes = await request(app)
      .patch('/api/messages/read-all')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        scope: 'user',
        userId: 'm10_msg_child_001',
        readTime: 1742600010503,
      });

    expect(readAllRes.status).toBe(200);
    expect(readAllRes.body.data.count).toBe(1);

    const rows = await db.query(
      'SELECT message_id, is_read, read_time FROM messages WHERE message_id IN (?, ?) ORDER BY message_id ASC',
      ['m10_msg_family_user_001', 'm10_msg_legacy_user_001']
    );

    expect(rows).toEqual([
      expect.objectContaining({
        message_id: 'm10_msg_family_user_001',
        is_read: 1,
        read_time: 1742600010503,
      }),
      expect.objectContaining({
        message_id: 'm10_msg_legacy_user_001',
        is_read: 0,
        read_time: null,
      })
    ]);
  });

  it('奖励创建应进入家庭流和孩子个人流，兑换后进入孩子个人流和家庭流，并支持批量已读', async () => {
    const createRewardRes = await request(app)
      .post('/api/rewards')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        rewardId: 'm10_msg_reward_001',
        name: 'M10周末电影',
        description: '奖励测试',
        type: 'activity',
        points: 6,
        icon: '🎬',
        modifyTime: 1742600011001,
        operationKey: 'm10_msg_reward_create_op_001',
      });

    expect(createRewardRes.status).toBe(200);
    expect(createRewardRes.body.success).toBe(true);

    const familyMessagesAfterCreate = await request(app)
      .get('/api/messages?scope=family')
      .set('Authorization', `Bearer ${parentToken}`);

    expect(familyMessagesAfterCreate.body.data.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relatedId: 'm10_msg_reward_001',
          notificationType: 'reward_create',
          visibilityScope: 'family',
        })
      ])
    );

    const childMessagesAfterCreate = await request(app)
      .get('/api/messages?scope=user')
      .set('Authorization', `Bearer ${childToken}`);

    expect(childMessagesAfterCreate.body.data.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relatedId: 'm10_msg_reward_001',
          notificationType: 'reward_create',
          visibilityScope: 'user',
          userId: 'm10_msg_child_001',
        })
      ])
    );

    await db.query(
      `INSERT INTO star_groups (group_id, user_id, type, stars, expiry_date, modify_time) VALUES
        ('m10_msg_group_001', 'm10_msg_child_001', 'permanent', 6, NULL, 1742600011002)`
    );

    const exchangeRes = await request(app)
      .patch('/api/rewards/m10_msg_reward_001/exchange')
      .set('Authorization', `Bearer ${childToken}`)
      .send({
        modifyTime: 1742600011003,
        operationKey: 'm10_msg_reward_exchange_op_001',
      });

    expect(exchangeRes.status).toBe(200);
    expect(exchangeRes.body.success).toBe(true);

    const childMessagesAfterExchange = await request(app)
      .get('/api/messages?scope=user')
      .set('Authorization', `Bearer ${childToken}`);

    expect(childMessagesAfterExchange.body.data.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relatedId: 'm10_msg_reward_001',
          notificationType: 'reward_exchange',
          visibilityScope: 'user',
          userId: 'm10_msg_child_001',
        })
      ])
    );

    const familyMessagesAfterExchange = await request(app)
      .get('/api/messages?scope=family')
      .set('Authorization', `Bearer ${parentToken}`);

    expect(familyMessagesAfterExchange.body.data.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relatedId: 'm10_msg_reward_001',
          notificationType: 'reward_exchange',
          visibilityScope: 'family',
          subjectUserId: 'm10_msg_child_001',
        })
      ])
    );

    const readAllRes = await request(app)
      .patch('/api/messages/read-all')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ scope: 'family', readTime: 1742600011004 });

    expect(readAllRes.status).toBe(200);
    expect(readAllRes.body.success).toBe(true);
    expect(readAllRes.body.data.count).toBeGreaterThan(0);
  });
});
