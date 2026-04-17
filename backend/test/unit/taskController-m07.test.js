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

beforeEach(() => {
  jest.clearAllMocks();
  taskService.buildTaskMutationResponse = jest.fn().mockImplementation(({
    primaryTask = null,
    affectedTasks = null,
    operation = 'update',
    taskId = null,
  } = {}) => {
    const serializedPrimaryTask = primaryTask && typeof primaryTask.toJSON === 'function'
      ? primaryTask.toJSON()
      : primaryTask;
    const serializedAffectedTasks = Array.isArray(affectedTasks)
      ? affectedTasks.map(task => (task && typeof task.toJSON === 'function' ? task.toJSON() : task))
      : (serializedPrimaryTask ? [serializedPrimaryTask] : []);

    return {
      primaryTask: serializedPrimaryTask,
      affectedTasks: serializedAffectedTasks,
      operation,
      task: serializedPrimaryTask,
      tasks: serializedAffectedTasks,
      taskId: taskId ?? serializedPrimaryTask?.taskId ?? serializedPrimaryTask?.id ?? (operation === 'delete' ? null : null),
    };
  });
});

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

describe('GET /api/tasks with occurrence filters', () => {
  let app;
  beforeAll(() => { app = buildApp(); });

  it('应透传 occurrence 查询参数到 service', async () => {
    taskService.getTasksByUser = jest.fn().mockResolvedValue([]);

    const res = await request(app)
      .get('/api/tasks?includeOccurrence=true&occurrenceMode=config&includeInactive=true&date=2026-04-17')
      .set('Authorization', token(CHILD));

    expect(res.status).toBe(200);
    expect(taskService.getTasksByUser).toHaveBeenCalledWith('child_1', expect.objectContaining({
      date: '2026-04-17',
      includeOccurrence: true,
      occurrenceMode: 'config',
      includeInactive: true
    }));
  });
});

describe('POST /api/tasks', () => {
  let app;
  beforeAll(() => { app = buildApp(); });

  it('创建任务时应过滤 penaltyApplied 字段', async () => {
    const task = makeTask();
    let capturedTaskData;
    taskService.createTaskWithRepeatMaterialization = jest.fn().mockImplementation((userId, taskData) => {
      capturedTaskData = taskData;
      return Promise.resolve({
        primaryTask: task,
        affectedTasks: [task],
        idempotent: false
      });
    });

    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', token(CHILD))
      .send({
        title: '新任务',
        type: 'study',
        date: '2026-03-01',
        penaltyApplied: true,
        isRequired: true
      });

    expect(res.status).toBe(200);
    expect(capturedTaskData).not.toHaveProperty('penaltyApplied');
    expect(capturedTaskData).toHaveProperty('isRequired', true);
    expect(res.body.data.operation).toBe('create');
    expect(res.body.data.taskId).toBe('task_001');
    expect(res.body.data.primaryTask.taskId).toBe('task_001');
    expect(res.body.data.affectedTasks).toHaveLength(1);
  });
});

describe('POST /api/tasks/penalties/sync', () => {
  let app;
  beforeAll(() => { app = buildApp(); });

  it('家长默认按家庭范围同步 penalty', async () => {
    taskService.syncRequiredTaskPenalties = jest.fn().mockResolvedValue({
      success: true,
      penaltyCount: 1,
      affectedTaskIds: ['task_001'],
      penaltyResults: [{ success: true, taskId: 'task_001', penaltyPoints: 5 }]
    });

    const res = await request(app)
      .post('/api/tasks/penalties/sync')
      .set('Authorization', token(PARENT))
      .send({});

    expect(res.status).toBe(200);
    expect(taskService.syncRequiredTaskPenalties).toHaveBeenCalledWith(expect.objectContaining({
      viewerUserId: 'parent_1',
      viewerRole: 'parent',
      familyId: 'fam_1',
      scope: 'family',
      targetUserId: null
    }));
  });

  it('家长按个人范围同步指定孩子 penalty 时应校验 targetUserId', async () => {
    familyService.getUserFamilyAndRole = jest.fn().mockResolvedValue({ familyId: 'fam_1', role: 'child' });
    taskService.syncRequiredTaskPenalties = jest.fn().mockResolvedValue({
      success: true,
      penaltyCount: 0,
      affectedTaskIds: [],
      penaltyResults: []
    });

    const res = await request(app)
      .post('/api/tasks/penalties/sync')
      .set('Authorization', token(PARENT))
      .send({ scope: 'user', targetUserId: 'child_1' });

    expect(res.status).toBe(200);
    expect(taskService.syncRequiredTaskPenalties).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'user',
      targetUserId: 'child_1'
    }));
  });
});

describe('POST /api/tasks/upcoming/sync', () => {
  let app;
  beforeAll(() => { app = buildApp(); });

  it('家长默认按家庭范围同步 upcoming', async () => {
    taskService.syncUpcomingTaskMessages = jest.fn().mockResolvedValue({
      success: true,
      createdCount: 1,
      dedupedCount: 0,
      archivedCount: 0,
      activeCount: 2,
      affectedTaskIds: ['task_001']
    });

    const res = await request(app)
      .post('/api/tasks/upcoming/sync')
      .set('Authorization', token(PARENT))
      .send({});

    expect(res.status).toBe(200);
    expect(taskService.syncUpcomingTaskMessages).toHaveBeenCalledWith(expect.objectContaining({
      viewerUserId: 'parent_1',
      viewerRole: 'parent',
      familyId: 'fam_1',
      scope: 'family',
      targetUserId: null
    }));
  });

  it('家长按个人范围同步指定孩子 upcoming 时应校验 targetUserId', async () => {
    familyService.getUserFamilyAndRole = jest.fn().mockResolvedValue({ familyId: 'fam_1', role: 'child' });
    taskService.syncUpcomingTaskMessages = jest.fn().mockResolvedValue({
      success: true,
      createdCount: 0,
      dedupedCount: 1,
      archivedCount: 0,
      activeCount: 1,
      affectedTaskIds: ['task_001']
    });

    const res = await request(app)
      .post('/api/tasks/upcoming/sync')
      .set('Authorization', token(PARENT))
      .send({ scope: 'user', targetUserId: 'child_1' });

    expect(res.status).toBe(200);
    expect(taskService.syncUpcomingTaskMessages).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'user',
      targetUserId: 'child_1'
    }));
  });

  it('schema 缺失时应显式返回 TASK_REMINDER_SCHEMA_MISSING', async () => {
    const schemaError = new Error('同步 upcoming 任务消息失败：tasks 表缺少 reminder 字段，请先执行数据库迁移');
    schemaError.code = 'TASK_REMINDER_SCHEMA_MISSING';
    taskService.syncUpcomingTaskMessages = jest.fn().mockRejectedValue(schemaError);

    const res = await request(app)
      .post('/api/tasks/upcoming/sync')
      .set('Authorization', token(PARENT))
      .send({});

    expect(res.status).toBe(503);
    expect(res.body.error_code).toBe('TASK_REMINDER_SCHEMA_MISSING');
  });
});

describe('M21L occurrence endpoints', () => {
  let app;
  beforeAll(() => { app = buildApp(); });

  function makeOccurrenceTask(overrides = {}) {
    return Task.fromDB({
      task_id: 'occ_cfg_001',
      user_id: CHILD.userId,
      title: '听写全对',
      description: '',
      type: 'study',
      date: '2026-04-01',
      status: 0,
      points: 2,
      is_required: 0,
      execution_mode: 'occurrence',
      active_start_date: '2026-04-01',
      active_end_date: null,
      active_has_no_end_date: 1,
      is_occurrence_record: 0,
      occurrence_outcome: 'none',
      ...overrides
    });
  }

  it('POST /api/tasks/:taskId/occurrence-record 应调用记录接口', async () => {
    taskService.getTaskById = jest.fn().mockResolvedValue(makeOccurrenceTask());
    taskService.recordOccurrenceResult = jest.fn().mockResolvedValue({
      operation: 'occurrence_record',
      taskId: 'occ_cfg_001'
    });

    const res = await request(app)
      .post('/api/tasks/occ_cfg_001/occurrence-record')
      .set('Authorization', token(CHILD))
      .send({
        date: '2026-04-17',
        outcome: 'success'
      });

    expect(res.status).toBe(200);
    expect(taskService.recordOccurrenceResult).toHaveBeenCalledWith(
      'occ_cfg_001',
      expect.objectContaining({
        targetUserId: 'child_1',
        date: '2026-04-17',
        outcome: 'success'
      }),
      expect.any(Object)
    );
  });

  it('POST /api/tasks/:taskId/disable-occurrence 应调用停用接口', async () => {
    familyService.getUserFamilyAndRole = jest.fn().mockResolvedValue({ familyId: 'fam_1', role: 'child' });
    taskService.getTaskById = jest.fn().mockResolvedValue(makeOccurrenceTask());
    taskService.disableOccurrenceTask = jest.fn().mockResolvedValue({
      operation: 'disable_occurrence',
      taskId: 'occ_cfg_001'
    });

    const res = await request(app)
      .post('/api/tasks/occ_cfg_001/disable-occurrence')
      .set('Authorization', token(PARENT))
      .send({
        disableFromDate: '2026-04-17'
      });

    expect(res.status).toBe(200);
    expect(taskService.disableOccurrenceTask).toHaveBeenCalledWith(
      'occ_cfg_001',
      expect.objectContaining({
        disableFromDate: '2026-04-17'
      }),
      expect.any(Object)
    );
  });

  it('POST /api/tasks/:taskId/convert-occurrence 应调用转换接口', async () => {
    familyService.getUserFamilyAndRole = jest.fn().mockResolvedValue({ familyId: 'fam_1', role: 'child' });
    taskService.getTaskById = jest.fn().mockResolvedValue(makeTask());
    taskService.convertTaskToOccurrenceMode = jest.fn().mockResolvedValue({
      operation: 'convert_occurrence',
      taskId: 'task_001'
    });

    const res = await request(app)
      .post('/api/tasks/task_001/convert-occurrence')
      .set('Authorization', token(PARENT))
      .send({
        effectiveFromDate: '2026-04-17'
      });

    expect(res.status).toBe(200);
    expect(taskService.convertTaskToOccurrenceMode).toHaveBeenCalledWith(
      'task_001',
      expect.objectContaining({
        effectiveFromDate: '2026-04-17'
      }),
      expect.any(Object)
    );
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
    expect(res.body.data.operation).toBe('update');
    expect(res.body.data.primaryTask.taskId).toBe('task_001');
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

  it('更新任务时应过滤 penaltyApplied 字段', async () => {
    const task = makeTask();
    taskService.getTaskById = jest.fn().mockResolvedValue(task);
    let capturedChanges;
    taskService.updateTask = jest.fn().mockImplementation((id, changes) => {
      capturedChanges = changes;
      return Promise.resolve(task);
    });

    const res = await request(app)
      .put('/api/tasks/task_001')
      .set('Authorization', token(CHILD))
      .send({ title: '新标题', penaltyApplied: true, isRequired: true });

    expect(res.status).toBe(200);
    expect(capturedChanges).not.toHaveProperty('penaltyApplied');
    expect(capturedChanges).toHaveProperty('title', '新标题');
    expect(capturedChanges).not.toHaveProperty('isRequired');
  });

  it('仅更新开始时间导致结束时间早于开始时间时应返回 400', async () => {
    const task = makeTask({
      start_time: '18:00',
      end_time: '19:00',
      is_all_day: 0
    });
    taskService.getTaskById = jest.fn().mockResolvedValue(task);
    taskService.updateTask = jest.fn();

    const res = await request(app)
      .put('/api/tasks/task_001')
      .set('Authorization', token(CHILD))
      .send({ startTime: '20:00' });

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('INVALID_TASK_DATA');
    expect(res.body.message).toContain('结束时间不能早于开始时间');
    expect(taskService.updateTask).not.toHaveBeenCalled();
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
    expect(res.body.data.operation).toBe('delete');
    expect(res.body.data.taskId).toBe('task_001');
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
    expect(res.body.data.operation).toBe('complete');
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
    expect(res.body.data.operation).toBe('reset');
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

  it('补打卡资格窗口已过时应返回 409 和稳定业务错误码', async () => {
    const task = makeTask();
    taskService.getTaskById = jest.fn().mockResolvedValue(task);
    taskService.updateTaskStatus = jest.fn().mockRejectedValue(Object.assign(
      new Error('该任务补打卡期限已于2026-04-12（本周结束）结束，无法再补打卡'),
      { code: 'TASK_BACKFILL_WINDOW_EXPIRED' }
    ));

    const res = await request(app)
      .patch('/api/tasks/task_001/status')
      .set('Authorization', token(CHILD))
      .send({ status: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error_code).toBe('TASK_BACKFILL_WINDOW_EXPIRED');
  });
});

describe('PATCH /api/tasks/:taskId/required', () => {
  let app;
  beforeAll(() => { app = buildApp(); });

  it('任务所有者可以标记必做', async () => {
    const task = makeTask();
    taskService.getTaskById = jest.fn().mockResolvedValue(task);
    taskService.markTaskRequired = jest.fn().mockResolvedValue(task);

    const res = await request(app)
      .patch('/api/tasks/task_001/required')
      .set('Authorization', token(CHILD))
      .send({ modifyTime: 123456 });

    expect(res.status).toBe(200);
    expect(taskService.markTaskRequired).toHaveBeenCalledWith(
      'task_001',
      expect.objectContaining({
        actorUserId: 'child_1',
        actorRole: 'child',
        familyId: 'fam_1',
        subjectUserId: 'child_1',
        modifyTime: 123456
      })
    );
  });

  it('家长可以代孩子标记必做', async () => {
    const task = makeTask();
    taskService.getTaskById = jest.fn().mockResolvedValue(task);
    familyService.getUserFamilyAndRole = jest.fn().mockResolvedValue({ familyId: 'fam_1', role: 'child' });
    taskService.markTaskRequired = jest.fn().mockResolvedValue(task);

    const res = await request(app)
      .patch('/api/tasks/task_001/required')
      .set('Authorization', token(PARENT))
      .send({});

    expect(res.status).toBe(200);
  });

  it('跨家庭用户标记必做返回 403', async () => {
    const task = makeTask();
    taskService.getTaskById = jest.fn().mockResolvedValue(task);
    familyService.getUserFamilyAndRole = jest.fn().mockResolvedValue({ familyId: 'fam_2', role: 'child' });

    const res = await request(app)
      .patch('/api/tasks/task_001/required')
      .set('Authorization', token(OTHER))
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('PERMISSION_DENIED');
  });
});

describe('PATCH /api/tasks/:taskId/unrequired', () => {
  let app;
  beforeAll(() => { app = buildApp(); });

  it('任务所有者可以取消必做', async () => {
    const task = makeTask({ isRequired: 1 });
    taskService.getTaskById = jest.fn().mockResolvedValue(task);
    taskService.unmarkTaskRequired = jest.fn().mockResolvedValue(task);

    const res = await request(app)
      .patch('/api/tasks/task_001/unrequired')
      .set('Authorization', token(CHILD))
      .send({ modifyTime: 223344 });

    expect(res.status).toBe(200);
    expect(taskService.unmarkTaskRequired).toHaveBeenCalledWith(
      'task_001',
      expect.objectContaining({
        actorUserId: 'child_1',
        actorRole: 'child',
        familyId: 'fam_1',
        subjectUserId: 'child_1',
        modifyTime: 223344
      })
    );
  });
});
