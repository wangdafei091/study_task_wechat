/**
 * M07 taskController 权限与接口契约单元测试
 *
 * 覆盖范围（不依赖数据库，mock service 层）：
 *   - GET /api/tasks?scope=family：家长可用，孩子返回 403
 *   - PUT /api/tasks/:taskId：自己/家长代操作允许，跨家庭拒绝，字段白名单，无效数据校验
 *   - DELETE /api/tasks/:taskId：自己/家长代操作允许，跨家庭拒绝，软删除
 *   - PATCH /api/tasks/:taskId/status：status 必须为 0/1，权限同上
 */

const request = require('supertest');
const express = require('express');
const { generateToken } = require('../../config/jwt');

// ---- mock 依赖 ----
jest.mock('../../services/taskService');
jest.mock('../../services/familyService');
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const taskService = require('../../services/taskService');
const familyService = require('../../services/familyService');
const Task = require('../../models/Task');

// 构造最小 express 应用，挂载真实 router
function buildApp() {
  const app = express();
  app.use(express.json());
  const { authMiddleware } = require('../../middleware/auth');
  const router = require('../../routes/tasks');
  app.use('/api/tasks', router);
  return app;
}

// 生成 JWT token
function token(user) {
  return `Bearer ${generateToken(user)}`;
}

const PARENT = { userId: 'parent_1', role: 'parent', familyId: 'fam_1' };
const CHILD  = { userId: 'child_1',  role: 'child',  familyId: 'fam_1' };
const OTHER  = { userId: 'other_1',  role: 'child',  familyId: 'fam_2' };

// 构造最小 Task 实例用于 mock 返回
function makeTask(overrides = {}) {
  return Task.fromDB({
    task_id: 'task_001',
    user_id: CHILD.userId,
    title: '测试任务',
    description: '',
    type: 'study',
    date: '2026-03-01',
    status: 0,
    points: 5,
    isRequired: 0,
    ...overrides,
  });
}

describe('GET /api/tasks?scope=family', () => {
  let app;
  beforeAll(() => { app = buildApp(); });

  it('家长调用 scope=family 返回 200', async () => {
    taskService.getTasksByFamily = jest.fn().mockResolvedValue([]);
    const res = await request(app)
      .get('/api/tasks?scope=family')
      .set('Authorization', token(PARENT));
    expect(res.status).toBe(200);
    expect(taskService.getTasksByFamily).toHaveBeenCalled();
  });

  it('孩子调用 scope=family 返回 403', async () => {
    const res = await request(app)
      .get('/api/tasks?scope=family')
      .set('Authorization', token(CHILD));
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('PERMISSION_DENIED');
  });
});

describe('PUT /api/tasks/:taskId', () => {
  let app;
  beforeAll(() => { app = buildApp(); });

  it('任务所有者可以更新任务', async () => {
    const task = makeTask();
    taskService.getTaskById = jest.fn().mockResolvedValue(task);
    taskService.updateTask = jest.fn().mockResolvedValue(task);
    const res = await request(app)
      .put('/api/tasks/task_001')
      .set('Authorization', token(CHILD))
      .send({ title: '新标题' });
    expect(res.status).toBe(200);
    expect(taskService.updateTask).toHaveBeenCalled();
  });

  it('家长可以代孩子更新任务', async () => {
    const task = makeTask();
    taskService.getTaskById = jest.fn().mockResolvedValue(task);
    familyService.getUserFamilyAndRole = jest.fn().mockResolvedValue({ familyId: 'fam_1', role: 'child' });
    taskService.updateTask = jest.fn().mockResolvedValue(task);
    const res = await request(app)
      .put('/api/tasks/task_001')
      .set('Authorization', token(PARENT))
      .send({ title: '家长修改标题' });
    expect(res.status).toBe(200);
  });

  it('跨家庭用户操作任务返回 403', async () => {
    const task = makeTask();
    taskService.getTaskById = jest.fn().mockResolvedValue(task);
    familyService.getUserFamilyAndRole = jest.fn().mockResolvedValue({ familyId: 'fam_2', role: 'child' });
    const res = await request(app)
      .put('/api/tasks/task_001')
      .set('Authorization', token(OTHER))
      .send({ title: '非法修改' });
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('PERMISSION_DENIED');
  });

  it('任务不存在返回 404', async () => {
    taskService.getTaskById = jest.fn().mockResolvedValue(null);
    const res = await request(app)
      .put('/api/tasks/no_such_task')
      .set('Authorization', token(CHILD))
      .send({ title: '任意' });
    expect(res.status).toBe(404);
    expect(res.body.error_code).toBe('TASK_NOT_FOUND');
  });

  it('请求体全为非白名单字段时返回 400', async () => {
    const task = makeTask();
    taskService.getTaskById = jest.fn().mockResolvedValue(task);
    const res = await request(app)
      .put('/api/tasks/task_001')
      .set('Authorization', token(CHILD))
      .send({ status: 1, userId: 'hacker', nonExistField: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('NO_UPDATABLE_FIELDS');
  });

  it('无效字段被过滤（status 不在白名单内）', async () => {
    const task = makeTask();
    taskService.getTaskById = jest.fn().mockResolvedValue(task);
    let capturedChanges;
    taskService.updateTask = jest.fn().mockImplementation((id, changes) => {
      capturedChanges = changes;
      return Promise.resolve(task);
    });
    await request(app)
      .put('/api/tasks/task_001')
      .set('Authorization', token(CHILD))
      .send({ title: '新标题', status: 1, userId: 'hacker' });
    expect(capturedChanges).not.toHaveProperty('status');
    expect(capturedChanges).not.toHaveProperty('userId');
    expect(capturedChanges).toHaveProperty('title', '新标题');
  });
});

describe('DELETE /api/tasks/:taskId', () => {
  let app;
  beforeAll(() => { app = buildApp(); });

  it('任务所有者可以软删除任务', async () => {
    const task = makeTask();
    taskService.getTaskById = jest.fn().mockResolvedValue(task);
    taskService.softDeleteTask = jest.fn().mockResolvedValue(task);
    const res = await request(app)
      .delete('/api/tasks/task_001')
      .set('Authorization', token(CHILD));
    expect(res.status).toBe(200);
    expect(taskService.softDeleteTask).toHaveBeenCalledWith(
      'task_001',
      expect.objectContaining({
        actorUserId: 'child_1',
        actorRole: 'child',
        familyId: 'fam_1',
        subjectUserId: 'child_1',
        operationKey: expect.any(String),
        modifyTime: expect.any(Number),
      })
    );
  });

  it('家长可以代孩子删除任务', async () => {
    const task = makeTask();
    taskService.getTaskById = jest.fn().mockResolvedValue(task);
    familyService.getUserFamilyAndRole = jest.fn().mockResolvedValue({ familyId: 'fam_1', role: 'child' });
    taskService.softDeleteTask = jest.fn().mockResolvedValue(task);
    const res = await request(app)
      .delete('/api/tasks/task_001')
      .set('Authorization', token(PARENT));
    expect(res.status).toBe(200);
  });

  it('跨家庭用户删除任务返回 403', async () => {
    const task = makeTask();
    taskService.getTaskById = jest.fn().mockResolvedValue(task);
    familyService.getUserFamilyAndRole = jest.fn().mockResolvedValue({ familyId: 'fam_2', role: 'child' });
    const res = await request(app)
      .delete('/api/tasks/task_001')
      .set('Authorization', token(OTHER));
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/tasks/:taskId/status', () => {
  let app;
  beforeAll(() => { app = buildApp(); });

  it('status=1 更新成功', async () => {
    const task = makeTask();
    taskService.getTaskById = jest.fn().mockResolvedValue(task);
    taskService.updateTaskStatus = jest.fn().mockResolvedValue(task);
    const res = await request(app)
      .patch('/api/tasks/task_001/status')
      .set('Authorization', token(CHILD))
      .send({ status: 1, starAwarded: true });
    expect(res.status).toBe(200);
    expect(taskService.updateTaskStatus).toHaveBeenCalledWith(
      'task_001',
      {
        status: 1,
        starAwarded: true,
        modifyTime: undefined,
        operationKey: undefined,
      },
      expect.objectContaining({
        actorUserId: 'child_1',
        actorRole: 'child',
        familyId: 'fam_1',
        subjectUserId: 'child_1',
        operationKey: expect.any(String),
        modifyTime: expect.any(Number),
      })
    );
  });

  it('status=0 更新成功（重置）', async () => {
    const task = makeTask({ status: 1 });
    taskService.getTaskById = jest.fn().mockResolvedValue(task);
    taskService.updateTaskStatus = jest.fn().mockResolvedValue(task);
    const res = await request(app)
      .patch('/api/tasks/task_001/status')
      .set('Authorization', token(CHILD))
      .send({ status: 0, starAwarded: false });
    expect(res.status).toBe(200);
  });

  it('status 为字符串 "completed" 返回 400', async () => {
    const res = await request(app)
      .patch('/api/tasks/task_001/status')
      .set('Authorization', token(CHILD))
      .send({ status: 'completed' });
    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('INVALID_STATUS');
  });

  it('status 为 2 返回 400', async () => {
    const res = await request(app)
      .patch('/api/tasks/task_001/status')
      .set('Authorization', token(CHILD))
      .send({ status: 2 });
    expect(res.status).toBe(400);
  });

  it('跨家庭用户更新状态返回 403', async () => {
    const task = makeTask();
    taskService.getTaskById = jest.fn().mockResolvedValue(task);
    familyService.getUserFamilyAndRole = jest.fn().mockResolvedValue({ familyId: 'fam_2', role: 'child' });
    const res = await request(app)
      .patch('/api/tasks/task_001/status')
      .set('Authorization', token(OTHER))
      .send({ status: 1, starAwarded: true });
    expect(res.status).toBe(403);
  });

  it('家长代孩子更新状态成功', async () => {
    const task = makeTask();
    taskService.getTaskById = jest.fn().mockResolvedValue(task);
    familyService.getUserFamilyAndRole = jest.fn().mockResolvedValue({ familyId: 'fam_1', role: 'child' });
    taskService.updateTaskStatus = jest.fn().mockResolvedValue(task);
    const res = await request(app)
      .patch('/api/tasks/task_001/status')
      .set('Authorization', token(PARENT))
      .send({ status: 1, starAwarded: true });
    expect(res.status).toBe(200);
  });

  it('家长共享设备切到孩子视角时，应允许将操作者解析为孩子', async () => {
    const task = makeTask();
    taskService.getTaskById = jest.fn().mockResolvedValue(task);
    familyService.getUserFamilyAndRole = jest.fn().mockResolvedValue({ familyId: 'fam_1', role: 'child' });
    taskService.updateTaskStatus = jest.fn().mockResolvedValue(task);

    const res = await request(app)
      .patch('/api/tasks/task_001/status')
      .set('Authorization', token(PARENT))
      .send({
        status: 1,
        starAwarded: true,
        operatorContext: {
          actorUserId: 'child_1',
          actorRole: 'child'
        }
      });

    expect(res.status).toBe(200);
    expect(taskService.updateTaskStatus).toHaveBeenCalledWith(
      'task_001',
      expect.any(Object),
      expect.objectContaining({
        actorUserId: 'child_1',
        actorRole: 'child',
        subjectUserId: 'child_1'
      })
    );
  });

  it('家长不能把其他孩子伪装成当前任务的操作者', async () => {
    const task = makeTask();
    taskService.getTaskById = jest.fn().mockResolvedValue(task);
    taskService.updateTaskStatus = jest.fn().mockResolvedValue(task);

    const res = await request(app)
      .patch('/api/tasks/task_001/status')
      .set('Authorization', token(PARENT))
      .send({
        status: 1,
        starAwarded: true,
        operatorContext: {
          actorUserId: 'child_2',
          actorRole: 'child'
        }
      });

    expect(res.status).toBe(200);
    expect(taskService.updateTaskStatus).toHaveBeenCalledWith(
      'task_001',
      expect.any(Object),
      expect.objectContaining({
        actorUserId: 'parent_1',
        actorRole: 'parent',
        subjectUserId: 'child_1'
      })
    );
  });
});
