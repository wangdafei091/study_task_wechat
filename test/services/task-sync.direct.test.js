jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const mockHttpClient = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  request: jest.fn()
};

jest.mock('../../utils/http-client', () => mockHttpClient);
jest.mock('../../utils/api-config', () => ({
  ENDPOINTS: {
    TASKS: '/tasks',
    TASK_BY_ID: '/tasks/{taskId}',
    TASK_STATUS: '/tasks/{taskId}/status',
    TASK_UPCOMING_SYNC: '/tasks/upcoming/sync',
    TASK_REQUIRED: '/tasks/{taskId}/required',
    TASK_UNREQUIRED: '/tasks/{taskId}/unrequired',
    TASKS_TRANSFER: '/tasks/transfer'
  }
}));

const taskSync = require('../../services/task-service/task-sync');
const { TaskStatus } = require('../../models/task');

describe('task-sync direct behavior', () => {
  function normalizeTaskMutationResponse(rawMutation, fallbackOperation = 'update') {
    return {
      primaryTask: rawMutation?.primaryTask ?? rawMutation?.task ?? null,
      affectedTasks: rawMutation?.affectedTasks ?? rawMutation?.tasks ?? [],
      operation: rawMutation?.operation || fallbackOperation,
      task: rawMutation?.task ?? rawMutation?.primaryTask ?? null,
      tasks: rawMutation?.tasks ?? rawMutation?.affectedTasks ?? [],
      taskId: rawMutation?.taskId || rawMutation?.task?.taskId || rawMutation?.primaryTask?.taskId || null
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetchSingleTaskFromCloud 应覆盖成功、空数据和失败分支', async () => {
    const service = {
      userService: {
        getLoginUserId: jest.fn(() => 'parent_1')
      },
      taskRepository: {
        save: jest.fn(async (task) => task)
      }
    };

    mockHttpClient.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ taskId: 'task_1', userId: 'parent_1', title: '任务1', date: '2026-03-26' })
      .mockRejectedValueOnce(new Error('network fail'));

    await expect(taskSync.fetchSingleTaskFromCloud(service, 'task_0')).resolves.toBeNull();
    const savedTask = await taskSync.fetchSingleTaskFromCloud(service, 'task_1');
    await expect(taskSync.fetchSingleTaskFromCloud(service, 'task_2')).resolves.toBeNull();

    expect(savedTask).toEqual(expect.objectContaining({
      id: 'task_1',
      syncedToCloud: true
    }));
    expect(service.taskRepository.save).toHaveBeenCalledTimes(1);
  });

  it('mergeLocalTasksIntoCloudResult 应覆盖无目标、本地为空、补并和异常分支', async () => {
    const service = {
      userService: {
        getLoginUserId: jest.fn(() => 'parent_1')
      }
    };

    await expect(taskSync.mergeLocalTasksIntoCloudResult(service, [{ id: 'cloud_1' }], null, null)).resolves.toEqual([{ id: 'cloud_1' }]);
    await expect(taskSync.mergeLocalTasksIntoCloudResult(service, [{ id: 'cloud_1' }], null, async () => [])).resolves.toEqual([{ id: 'cloud_1' }]);
    await expect(taskSync.mergeLocalTasksIntoCloudResult(service, [{ id: 'cloud_1' }], 'child_1', async () => [
      { id: 'cloud_1' },
      { id: 'local_1' }
    ])).resolves.toEqual([{ id: 'cloud_1' }, { id: 'local_1' }]);
    await expect(taskSync.mergeLocalTasksIntoCloudResult(service, [{ id: 'cloud_1' }], 'child_1', async () => {
      throw new Error('merge fail');
    }, '日期任务')).resolves.toEqual([{ id: 'cloud_1' }]);
  });

  it('syncUpdateToCloud 应覆盖禁用、成功和失败分支', async () => {
    const service = {
      enableCloudStorage: false,
      _buildTaskPendingSyncMeta: jest.fn(() => ({
        operationKey: 'op_1',
        modifyTime: 101,
        operatorUserId: 'parent_1',
        operatorRole: 'parent',
        familyId: 'family_1'
      })),
      _markTaskSynced: jest.fn(async () => true),
      _normalizeTaskMutationResponse: jest.fn(normalizeTaskMutationResponse)
    };
    const task = {
      id: 'task_1',
      title: '任务1',
      description: 'desc',
      date: '2026-03-26',
      type: 'study',
      startTime: '18:00',
      endTime: '19:00',
      duration: 60,
      isAllDay: false,
      reminder: { enabled: true, time: 30 },
      isRequired: false,
      penaltyApplied: false,
      points: 5,
      pointsExpiry: 'permanent',
      tags: [],
      hasNoEndDate: false,
      repeat: null,
      modifyTime: 99
    };

    await expect(taskSync.syncUpdateToCloud(service, task)).resolves.toBeUndefined();

    service.enableCloudStorage = true;
    mockHttpClient.put.mockResolvedValueOnce({ task: { taskId: 'task_1' } });
    await expect(taskSync.syncUpdateToCloud(service, task)).resolves.toEqual(expect.objectContaining({
      operation: 'update',
      taskId: 'task_1'
    }));
    expect(mockHttpClient.put).toHaveBeenCalledWith('/tasks/task_1', expect.objectContaining({
      reminder: { enabled: true, time: 30 }
    }));

    mockHttpClient.put.mockRejectedValueOnce(new Error('put fail'));
    await expect(taskSync.syncUpdateToCloud(service, task)).rejects.toThrow('put fail');
  });

  it('syncDeleteToCloud 应覆盖禁用、404 跳过和异常抛出', async () => {
    const service = {
      enableCloudStorage: false,
      _removeDeleteTombstone: jest.fn(async () => true)
    };

    await expect(taskSync.syncDeleteToCloud(service, 'task_1')).resolves.toBeUndefined();

    service.enableCloudStorage = true;
    mockHttpClient.request.mockRejectedValueOnce(new Error('404 not found'));
    await expect(taskSync.syncDeleteToCloud(service, 'task_2', {
      operationKey: 'op_2',
      operatorUserId: 'parent_1',
      operatorRole: 'parent',
      familyId: 'family_1'
    })).resolves.toBeUndefined();

    mockHttpClient.request.mockRejectedValueOnce(new Error('delete fail'));
    await expect(taskSync.syncDeleteToCloud(service, 'task_3')).rejects.toThrow('delete fail');
    expect(service._removeDeleteTombstone).toHaveBeenCalledWith('task_2');
  });

  it('syncStatusToCloud 应覆盖 reset 分支和失败分支', async () => {
    const service = {
      enableCloudStorage: true,
      _buildTaskPendingSyncMeta: jest.fn(() => ({
        operationKey: 'op_status',
        modifyTime: 202,
        operatorUserId: 'parent_1',
        operatorRole: 'parent',
        familyId: 'family_1'
      })),
      _markTaskSynced: jest.fn(async () => true),
      _normalizeTaskMutationResponse: jest.fn(normalizeTaskMutationResponse)
    };
    const task = {
      id: 'task_status',
      status: TaskStatus.PENDING,
      starAwarded: false,
      modifyTime: 100
    };

    mockHttpClient.patch.mockResolvedValueOnce({ task: { taskId: 'task_status' } });
    await expect(taskSync.syncStatusToCloud(service, task)).resolves.toEqual(expect.objectContaining({
      operation: 'reset',
      taskId: 'task_status'
    }));

    mockHttpClient.patch.mockRejectedValueOnce(new Error('patch fail'));
    await expect(taskSync.syncStatusToCloud(service, {
      ...task,
      status: TaskStatus.COMPLETED
    })).rejects.toThrow('patch fail');
  });

  it('syncStatusToCloud 对相同 operationKey 的并发调用应复用同一次请求', async () => {
    let resolvePatch;
    const patchPromise = new Promise((resolve) => {
      resolvePatch = resolve;
    });
    const service = {
      enableCloudStorage: true,
      _buildTaskPendingSyncMeta: jest.fn(() => ({
        operationKey: 'op_reuse',
        modifyTime: 303,
        operatorUserId: 'parent_1',
        operatorRole: 'parent',
        familyId: 'family_1'
      })),
      _markTaskSynced: jest.fn(async () => true),
      _normalizeTaskMutationResponse: jest.fn(normalizeTaskMutationResponse)
    };
    const task = {
      id: 'task_reuse',
      status: TaskStatus.COMPLETED,
      starAwarded: true,
      modifyTime: 300
    };

    mockHttpClient.patch.mockReturnValueOnce(patchPromise);

    const firstCall = taskSync.syncStatusToCloud(service, task);
    const secondCall = taskSync.syncStatusToCloud(service, task);

    expect(mockHttpClient.patch).toHaveBeenCalledTimes(1);

    resolvePatch({ task: { taskId: 'task_reuse' } });
    await Promise.all([firstCall, secondCall]);

    expect(service._markTaskSynced).toHaveBeenCalledTimes(1);
  });

  it('syncRequiredStateToCloud 应根据动作选择 required/unrequired 端点', async () => {
    const service = {
      enableCloudStorage: true,
      _buildTaskPendingSyncMeta: jest.fn(() => ({
        operationKey: 'op_required',
        modifyTime: 303,
        operatorUserId: 'parent_1',
        operatorRole: 'parent',
        familyId: 'family_1'
      })),
      _markTaskSynced: jest.fn(async () => true),
      _normalizeTaskMutationResponse: jest.fn(normalizeTaskMutationResponse)
    };

    mockHttpClient.patch.mockResolvedValueOnce({ task: { taskId: 'task_required' } });
    await expect(taskSync.syncRequiredStateToCloud(service, {
      id: 'task_required',
      isRequired: true,
      modifyTime: 300
    })).resolves.toEqual(expect.objectContaining({
      operation: 'required',
      taskId: 'task_required'
    }));
    expect(mockHttpClient.patch).toHaveBeenLastCalledWith('/tasks/task_required/required', expect.objectContaining({
      modifyTime: 303,
      operationKey: 'op_required'
    }));

    mockHttpClient.patch.mockResolvedValueOnce({ task: { taskId: 'task_unrequired' } });
    await expect(taskSync.syncRequiredStateToCloud(service, {
      id: 'task_unrequired',
      isRequired: false,
      modifyTime: 301,
      pendingSyncMeta: {
        action: 'unrequired',
        modifyTime: 304,
        operationKey: 'op_unrequired',
        operatorUserId: 'parent_1',
        operatorRole: 'parent',
        familyId: 'family_1'
      }
    })).resolves.toEqual(expect.objectContaining({
      operation: 'unrequired',
      taskId: 'task_unrequired'
    }));
    expect(mockHttpClient.patch).toHaveBeenLastCalledWith('/tasks/task_unrequired/unrequired', expect.objectContaining({
      modifyTime: 304,
      operationKey: 'op_unrequired'
    }));

    mockHttpClient.patch.mockRejectedValueOnce(new Error('required fail'));
    await expect(taskSync.syncRequiredStateToCloud(service, {
      id: 'task_fail',
      isRequired: true,
      modifyTime: 305
    })).rejects.toThrow('required fail');
  });

  it('migrateTasksToChild 在本地模式下应直接迁移本地任务', async () => {
    const task1 = { id: 'task_1', userId: 'parent_1' };
    const task2 = { id: 'task_2', userId: 'parent_1' };
    const service = {
      enableCloudStorage: false,
      taskRepository: {
        getByUserId: jest.fn().mockResolvedValue([task1, task2]),
        saveAll: jest.fn().mockResolvedValue([task1, task2])
      }
    };

    const result = await taskSync.migrateTasksToChild(service, 'parent_1', 'child_1');

    expect(result).toEqual({ success: true, count: 2 });
    expect(mockHttpClient.post).not.toHaveBeenCalled();
    expect(task1.userId).toBe('child_1');
    expect(task2.userId).toBe('child_1');
    expect(service.taskRepository.saveAll).toHaveBeenCalledWith([task1, task2]);
  });
});
