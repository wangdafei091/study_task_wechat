/**
 * 任务管理API集成测试（内存版）
 * 使用内存数据存储，避免真实数据库依赖。
 */

const request = require('supertest');
const express = require('express');
const { generateToken, JWT_CONFIG } = require('../../config/jwt');
const Task = require('../../models/Task');
const { success, error } = require('../../utils/response');

function createTestApp() {
  const app = express();
  const store = {
    tasks: [],
    sequence: 0,
  };

  const nextTaskId = () => {
    store.sequence += 1;
    return `task_${store.sequence}`;
  };

  const createTaskRecord = (userId, payload) => ({
    taskId: nextTaskId(),
    userId,
    title: payload.title,
    description: payload.description || '',
    type: payload.type,
    date: payload.date,
    startTime: payload.startTime || '',
    endTime: payload.endTime || '',
    points: payload.points !== undefined ? payload.points : 0,
    pointsExpiry: payload.pointsExpiry || 'permanent',
    isRequired: payload.isRequired || false,
    status: 0,
    repeat: payload.repeat || null,
    isAllDay: payload.isAllDay || false,
    penaltyApplied: payload.penaltyApplied || false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  app.use(express.json());

  app.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    const hasBearer = authHeader && authHeader.startsWith('Bearer ');
    const token = hasBearer ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json(error('未提供认证token', 'AUTH_INVALID_TOKEN'));
    }

    try {
      const jwt = require('jsonwebtoken');
      const secret = JWT_CONFIG.secret;
      const payload = jwt.verify(token, secret);

      // 确保req.user正确设置
      req.user = payload;

      return next();
    } catch (err) {
      // 区分token过期错误和其他错误
      const isTokenExpired = err.name === 'TokenExpiredError';

      return res.status(401).json({
        success: false,
        message: isTokenExpired ? 'Token已过期' : 'Token无效',
        error_code: isTokenExpired ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_INVALID_TOKEN'
      });
    }
  });

  app.get('/api/tasks', (req, res) => {
    // 安全访问req.user，避免未定义错误
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        message: '用户认证信息缺失',
        error_code: 'AUTH_NO_USER_INFO'
      });
    }

    const userId = req.user.userId;
    const { date, status } = req.query;

    let userTasks = store.tasks.filter(task => task.userId === userId);

    if (date) {
      userTasks = userTasks.filter(task => task.date === date);
    }

    if (status !== undefined) {
      userTasks = userTasks.filter(task => String(task.status) === String(status));
    }

    res.json(success({ tasks: userTasks, total: userTasks.length }, '获取成功'));
  });

  app.get('/api/tasks/count', (req, res) => {
    // 安全访问req.user，避免未定义错误
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        message: '用户认证信息缺失',
        error_code: 'AUTH_NO_USER_INFO'
      });
    }

    const userId = req.user.userId;
    const { date, status } = req.query;

    let userTasks = store.tasks.filter(task => task.userId === userId);

    if (date) {
      userTasks = userTasks.filter(task => task.date === date);
    }

    if (status !== undefined) {
      userTasks = userTasks.filter(task => String(task.status) === String(status));
    }

    res.json(success({ count: userTasks.length, userId }, '统计成功'));
  });

  app.get('/api/tasks/:taskId', (req, res) => {
    // 安全访问req.user，避免未定义错误
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        message: '用户认证信息缺失',
        error_code: 'AUTH_NO_USER_INFO'
      });
    }

    const userId = req.user.userId;
    const task = store.tasks.find(item => item.taskId === req.params.taskId);

    if (!task) {
      return res.status(404).json(error('任务不存在', 'TASK_NOT_FOUND'));
    }

    if (task.userId !== userId) {
      return res.status(403).json(error('无权访问此任务', 'TASK_FORBIDDEN'));
    }

    return res.json(success(task, '获取成功'));
  });

  app.post('/api/tasks', (req, res) => {
    // 安全访问req.user，避免未定义错误
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        message: '用户认证信息缺失',
        error_code: 'AUTH_NO_USER_INFO'
      });
    }

    const userId = req.user.userId;
    const validation = Task.validate(req.body, false);

    if (!validation.valid) {
      return res.status(400).json(error(validation.errors.join('; '), 'TASK_INVALID_PARAMS'));
    }

    const task = createTaskRecord(userId, req.body);
    store.tasks.push(task);

    return res.json(success(task, '任务创建成功'));
  });


  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json(error('请求体JSON格式错误', 'REQUEST_INVALID_JSON'));
    }
    return next(err);
  });

  return { app, store };
}

const { app, store } = createTestApp();

const TEST_USERS = {
  user1: { userId: 'test_user_001', openid: 'test_openid_001', role: 'user' },
  user2: { userId: 'test_user_002', openid: 'test_openid_002', role: 'user' },
};

const TEST_TASKS = {
  validTask: {
    title: '测试任务',
    type: 'study',
    date: '2026-03-06',
    points: 10,
    pointsExpiry: 'permanent',
  },
  incompleteTask: {
    title: '不完整任务',
    type: 'study',
  },
  invalidTask: {
    title: '',
    type: 'invalid',
    date: '2026-03-06',
  },
};

function generateTestToken(user) {
  return generateToken(user);
}

function seedTask(userId, payload = {}) {
  const task = {
    taskId: `seed_${store.sequence + 1}`,
    userId,
    title: payload.title || '默认任务',
    description: payload.description || '',
    type: payload.type || 'study',
    date: payload.date || '2026-03-06',
    startTime: '',
    endTime: '',
    points: payload.points !== undefined ? payload.points : 10,
    pointsExpiry: payload.pointsExpiry || 'permanent',
    isRequired: false,
    status: payload.status !== undefined ? payload.status : 0,
    repeat: null,
    isAllDay: false,
    penaltyApplied: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.sequence += 1;
  store.tasks.push(task);
  return task;
}

describe('Task API Integration Tests', () => {
  let token1;
  let token2;

  beforeAll(() => {
    token1 = generateTestToken(TEST_USERS.user1);
    token2 = generateTestToken(TEST_USERS.user2);
  });

  beforeEach(() => {
    store.tasks.length = 0;
    store.sequence = 0;
  });

  describe('认证测试', () => {
    test('应该拒绝没有token的请求', async () => {
      const response = await request(app).get('/api/tasks').expect(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error_code).toBe('AUTH_INVALID_TOKEN');
    });

    test('应该拒绝无效的token', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error_code).toBe('AUTH_INVALID_TOKEN');
    });

    test('应该接受有效的token', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('创建任务 (POST /api/tasks)', () => {
    test('应该成功创建有效任务', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token1}`)
        .send(TEST_TASKS.validTask)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('任务创建成功');
      expect(response.body.data).toHaveProperty('taskId');
      expect(response.body.data.title).toBe(TEST_TASKS.validTask.title);
      expect(response.body.data.type).toBe(TEST_TASKS.validTask.type);
      expect(response.body.data.status).toBe(0);
    });

    test('应该拒绝缺少必填字段的任务', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token1}`)
        .send(TEST_TASKS.incompleteTask)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error_code).toBe('TASK_INVALID_PARAMS');
    });

    test('应该拒绝无效的任务类型', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token1}`)
        .send(TEST_TASKS.invalidTask)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error_code).toBe('TASK_INVALID_PARAMS');
    });
  });

  describe('获取任务列表 (GET /api/tasks)', () => {
    test('应该返回用户的任务列表', async () => {
      seedTask(TEST_USERS.user1.userId, { title: 'u1-task-1' });
      seedTask(TEST_USERS.user1.userId, { title: 'u1-task-2' });
      seedTask(TEST_USERS.user2.userId, { title: 'u2-task-1' });

      const response = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total).toBe(2);
      expect(Array.isArray(response.body.data.tasks)).toBe(true);
      expect(response.body.data.tasks.every(task => task.userId === TEST_USERS.user1.userId)).toBe(true);
    });

    test('应该支持按日期筛选', async () => {
      seedTask(TEST_USERS.user1.userId, { date: '2026-03-06' });
      seedTask(TEST_USERS.user1.userId, { date: '2026-03-07' });

      const response = await request(app)
        .get('/api/tasks?date=2026-03-06')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total).toBe(1);
    });

    test('应该支持按状态筛选', async () => {
      seedTask(TEST_USERS.user1.userId, { status: 0 });
      seedTask(TEST_USERS.user1.userId, { status: 1 });

      const response = await request(app)
        .get('/api/tasks?status=0')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total).toBe(1);
      expect(response.body.data.tasks[0].status).toBe(0);
    });
  });

  describe('获取任务详情 (GET /api/tasks/:taskId)', () => {
    test('应该返回任务详情', async () => {
      const task = seedTask(TEST_USERS.user1.userId, { title: 'detail-task' });

      const response = await request(app)
        .get(`/api/tasks/${task.taskId}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.taskId).toBe(task.taskId);
    });

    test('应该拒绝访问不存在的任务', async () => {
      const response = await request(app)
        .get('/api/tasks/nonexistent_task_id')
        .set('Authorization', `Bearer ${token1}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error_code).toBe('TASK_NOT_FOUND');
    });

    test('应该拒绝访问其他用户的任务', async () => {
      const task = seedTask(TEST_USERS.user1.userId, { title: 'private-task' });

      const response = await request(app)
        .get(`/api/tasks/${task.taskId}`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error_code).toBe('TASK_FORBIDDEN');
    });
  });

  describe('统计任务 (GET /api/tasks/count)', () => {
    test('应该返回任务统计信息', async () => {
      seedTask(TEST_USERS.user1.userId, { status: 0 });
      seedTask(TEST_USERS.user1.userId, { status: 1 });

      const response = await request(app)
        .get('/api/tasks/count')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('count');
      expect(response.body.data).toHaveProperty('userId');
      expect(response.body.data.count).toBe(2);
    });

    test('应该支持按日期统计', async () => {
      seedTask(TEST_USERS.user1.userId, { date: '2026-03-06' });
      seedTask(TEST_USERS.user1.userId, { date: '2026-03-07' });

      const response = await request(app)
        .get('/api/tasks/count?date=2026-03-06')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.count).toBe(1);
    });

    test('应该支持按状态统计', async () => {
      seedTask(TEST_USERS.user1.userId, { status: 0 });
      seedTask(TEST_USERS.user1.userId, { status: 1 });

      const response = await request(app)
        .get('/api/tasks/count?status=1')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.count).toBe(1);
    });
  });

  describe('错误处理测试', () => {
    test('应该正确处理无效的JSON请求体', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token1}`)
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error_code).toBe('REQUEST_INVALID_JSON');
    });

    test('应该正确处理超长的任务标题', async () => {
      const longTitle = 'A'.repeat(1000);
      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          title: longTitle,
          type: 'study',
          date: '2026-03-06',
          points: 10,
          pointsExpiry: 'permanent',
        })
        .expect(200);

      expect(response.body).toHaveProperty('success');
    });
  });

  describe('权限控制测试', () => {
    test('用户只能访问自己的任务', async () => {
      const user1Task = seedTask(TEST_USERS.user1.userId, { title: 'user1-task' });
      const user2Task = seedTask(TEST_USERS.user2.userId, { title: 'user2-task' });

      const listResponse = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      const user1TaskIds = listResponse.body.data.tasks.map(task => task.taskId);
      expect(user1TaskIds).toContain(user1Task.taskId);
      expect(user1TaskIds).not.toContain(user2Task.taskId);
    });
  });
});
