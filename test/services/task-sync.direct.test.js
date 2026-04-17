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
    TASK_OCCURRENCE_RECORD: '/tasks/{taskId}/occurrence-record',
    TASK_OCCURRENCE_DISABLE: '/tasks/{taskId}/disable-occurrence',
    TASK_OCCURRENCE_CONVERT: '/tasks/{taskId}/convert-occurrence',
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
    expect(mockHttpClient.put.mock.calls[0][1]).not.toHaveProperty('activeRange');

    mockHttpClient.put.mockRejectedValueOnce(new Error('put fail'));
    await expect(taskSync.syncUpdateToCloud(service, task)).rejects.toThrow('put fail');
  });

  it('通用 create/update 补云不应为表现项配置透传记录事实字段', async () => {
    const service = {
      enableCloudStorage: true,
      userService: {
        getLoginUserId: jest.fn(() => 'parent_1')
      },
      _buildTaskPendingSyncMeta: jest.fn(() => ({
        operationKey: 'op_occ_cfg',
        modifyTime: 404,
        operatorUserId: 'parent_1',
        operatorRole: 'parent',
        familyId: 'family_1'
      })),
      _markTaskSynced: jest.fn(async () => true),
      _normalizeTaskMutationResponse: jest.fn(normalizeTaskMutationResponse)
    };
    const occurrenceConfigTask = {
      id: 'occ_cfg_1',
      userId: 'child_1',
      title: '听写全对',
      description: '',
      date: '2026-04-17',
      type: 'study',
      executionMode: 'occurrence',
      startTime: '',
      endTime: '',
      duration: 0,
      isAllDay: false,
      reminder: { enabled: false, time: 0 },
      isRequired: false,
      penaltyApplied: false,
      points: 1,
      pointsExpiry: 'permanent',
      tags: [],
      hasNoEndDate: true,
      activeRange: {
        startDate: '2026-04-17',
        endDate: '',
        hasNoEndDate: true
      },
      repeat: { type: 'none' },
      parentTaskId: '',
      isOccurrenceRecord: false,
      occurrenceOutcome: 'none',
      recordedAt: 0,
      modifyTime: 400
    };

    mockHttpClient.post.mockResolvedValueOnce({ task: { taskId: 'occ_cfg_1' } });
    await taskSync.createTaskViaCloud(service, { ...occurrenceConfigTask });
    const createPayload = mockHttpClient.post.mock.calls[0][1];
    expect(createPayload).not.toHaveProperty('isOccurrenceRecord');
    expect(createPayload).not.toHaveProperty('occurrenceOutcome');
    expect(createPayload).not.toHaveProperty('recordedAt');

    mockHttpClient.put.mockResolvedValueOnce({ task: { taskId: 'occ_cfg_1' } });
    await taskSync.syncUpdateToCloud(service, { ...occurrenceConfigTask });
    const updatePayload = mockHttpClient.put.mock.calls[0][1];
    expect(updatePayload).not.toHaveProperty('isOccurrenceRecord');
    expect(updatePayload).not.toHaveProperty('occurrenceOutcome');
    expect(updatePayload).not.toHaveProperty('recordedAt');
  });

  it('普通任务补云 create 不应透传空 activeRange', async () => {
    const service = {
      enableCloudStorage: true,
      userService: {
        getLoginUserId: jest.fn(() => 'parent_1')
      },
      _buildTaskPendingSyncMeta: jest.fn(() => ({
        operationKey: 'op_plain_create',
        modifyTime: 505,
        operatorUserId: 'parent_1',
        operatorRole: 'parent',
        familyId: 'family_1'
      })),
      _normalizeTaskMutationResponse: jest.fn(normalizeTaskMutationResponse)
    };
    const plannedTask = {
      id: 'task_plain_1',
      userId: 'child_1',
      title: '数学',
      description: '',
      date: '2026-04-17',
      type: 'study',
      executionMode: 'planned',
      startTime: '14:00',
      endTime: '15:00',
      duration: 60,
      isAllDay: false,
      reminder: { enabled: false, time: 0 },
      isRequired: false,
      penaltyApplied: false,
      points: 2,
      pointsExpiry: 'permanent',
      tags: [],
      hasNoEndDate: false,
      activeRange: null,
      repeat: { type: 'none' },
      parentTaskId: '',
      modifyTime: 500
    };

    mockHttpClient.post.mockResolvedValueOnce({ task: { taskId: 'task_plain_1' } });
    await taskSync.createTaskViaCloud(service, plannedTask);

    const createPayload = mockHttpClient.post.mock.calls[mockHttpClient.post.mock.calls.length - 1][1];
    expect(createPayload).not.toHaveProperty('activeRange');
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

  it('fetchTasksFromCloud 应覆盖 targetUserId、modifyTime 保护、星星补并和回灌失败分支', async () => {
    const localNewerTask = {
      id: 'task_newer',
      userId: 'parent_1',
      title: '本地更新版',
      description: 'local desc',
      type: 'study',
      executionMode: 'planned',
      date: '2026-04-18',
      startTime: '08:00',
      endTime: '09:00',
      points: 3,
      pointsExpiry: 'permanent',
      reminder: { enabled: true, time: 5 },
      isRequired: true,
      status: 1,
      isAllDay: false,
      repeat: { type: 'none' },
      duration: 60,
      hasNoEndDate: false,
      activeRange: null,
      isOccurrenceRecord: false,
      occurrenceOutcome: 'none',
      recordedAt: 0,
      tags: ['local'],
      penaltyApplied: false,
      penaltyDeductedPoints: 0,
      penaltyRefunded: false,
      penaltyRefundTime: 0,
      completionTime: 123,
      starAwarded: true,
      modifyTime: 999,
      parentTaskId: null
    };
    const localStarTask = {
      id: 'task_star',
      userId: 'parent_1',
      modifyTime: 100,
      starAwarded: true
    };
    const service = {
      userService: {
        getLoginUserId: jest.fn(() => 'parent_1')
      },
      _flushPendingTaskSyncs: jest.fn(async () => true),
      _cleanupStaleTasks: jest.fn(async () => true),
      taskRepository: {
        getByUserId: jest.fn(async () => [localNewerTask, localStarTask]),
        saveAll: jest.fn(async () => {
          throw new Error('saveAll fail');
        })
      }
    };

    mockHttpClient.get.mockResolvedValueOnce({
      tasks: [
        {
          taskId: 'task_newer',
          userId: 'parent_1',
          title: '云端旧版',
          description: 'cloud desc',
          type: 'habit',
          executionMode: 'planned',
          date: '2026-04-17',
          startTime: '07:00',
          endTime: '08:00',
          points: 1,
          pointsExpiry: 'daily',
          reminder: { enabled: false },
          isRequired: false,
          status: 0,
          isAllDay: false,
          repeat: { type: 'none' },
          duration: 30,
          hasNoEndDate: false,
          tags: [],
          penaltyApplied: false,
          modifyTime: 100,
          starAwarded: false
        },
        {
          taskId: 'task_star',
          userId: 'parent_1',
          title: '星星保护',
          date: '2026-04-17',
          modifyTime: 120,
          status: 0,
          starAwarded: false
        },
        {
          taskId: 'task_child',
          userId: 'child_1',
          title: '代孩子任务',
          date: '2026-04-17',
          modifyTime: 130,
          status: 0,
          starAwarded: false
        }
      ]
    });

    const result = await taskSync.fetchTasksFromCloud(service, 'child_1', {});

    expect(mockHttpClient.get).toHaveBeenCalledWith('/tasks', {
      targetUserId: 'child_1'
    });
    expect(service._cleanupStaleTasks).not.toHaveBeenCalled();
    expect(result).toHaveLength(3);
    expect(result.find((task) => task.id === 'task_newer')).toEqual(expect.objectContaining({
      title: '本地更新版',
      description: 'local desc',
      type: 'study',
      status: 1,
      starAwarded: true,
      modifyTime: 999
    }));
    expect(result.find((task) => task.id === 'task_star')).toEqual(expect.objectContaining({
      starAwarded: true
    }));

    mockHttpClient.get.mockRejectedValueOnce(new Error('cloud fetch fail'));
    await expect(taskSync.fetchTasksFromCloud(service, 'parent_1', {})).rejects.toThrow('cloud fetch fail');
  });

  it('fetchTasksFromCloud 在全量拉取本人任务时应清理陈旧任务并尝试回灌本地', async () => {
    const service = {
      userService: {
        getLoginUserId: jest.fn(() => 'parent_1')
      },
      _flushPendingTaskSyncs: jest.fn(async () => true),
      _cleanupStaleTasks: jest.fn(async () => true),
      taskRepository: {
        getByUserId: jest.fn(async () => []),
        saveAll: jest.fn(async (tasks) => tasks)
      }
    };

    mockHttpClient.get.mockResolvedValueOnce({
      tasks: [
        {
          taskId: 'task_self',
          userId: 'parent_1',
          title: '本人任务',
          date: '2026-04-17',
          modifyTime: 100,
          status: 0,
          starAwarded: false
        }
      ]
    });

    const result = await taskSync.fetchTasksFromCloud(service, 'parent_1', {});

    expect(service._cleanupStaleTasks).toHaveBeenCalledWith(new Set(['task_self']), 'parent_1');
    expect(service.taskRepository.saveAll).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'task_self',
        syncedToCloud: true
      })
    ]);
    expect(result[0]).toEqual(expect.objectContaining({ id: 'task_self' }));
  });

  it('occurrence 专用同步函数和云端迁移应覆盖成功与失败分支', async () => {
    const service = {
      enableCloudStorage: true,
      _buildTaskPendingSyncMeta: jest.fn((task, action) => ({
        action,
        operationKey: `${action}_op`,
        modifyTime: 707,
        targetUserId: task.userId || null,
        operatorUserId: 'parent_1',
        operatorRole: 'parent',
        familyId: 'family_1',
        disableFromDate: '2026-04-17',
        effectiveFromDate: '2026-04-18'
      })),
      taskRepository: {
        getByUserId: jest.fn(async () => [{ id: 'legacy_1', userId: 'parent_1' }]),
        saveAll: jest.fn(async (tasks) => tasks)
      }
    };
    const occurrenceRecord = {
      id: 'occ_record_1',
      parentTaskId: 'occ_cfg_1',
      userId: 'child_1',
      date: '2026-04-17',
      occurrenceOutcome: 'success',
      modifyTime: 701
    };
    const configTask = {
      id: 'occ_cfg_1',
      userId: 'child_1',
      modifyTime: 702
    };

    await expect(taskSync.syncOccurrenceRecordToCloud({
      enableCloudStorage: false
    }, occurrenceRecord)).resolves.toBeNull();

    mockHttpClient.post
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ count: 3 })
      .mockRejectedValueOnce(new Error('transfer fail'));

    await expect(taskSync.syncOccurrenceRecordToCloud(service, occurrenceRecord)).resolves.toEqual({ ok: true });
    await expect(taskSync.syncDisableOccurrenceToCloud(service, configTask, {
      disableFromDate: '2026-04-17'
    })).resolves.toEqual({ ok: true });
    await expect(taskSync.syncConvertOccurrenceToCloud(service, configTask, {
      effectiveFromDate: '2026-04-18'
    })).resolves.toEqual({ ok: true });
    await expect(taskSync.migrateTasksToChild({
      ...service,
      enableCloudStorage: true
    }, 'parent_1', 'child_1')).resolves.toEqual({ success: true, count: 3 });
    await expect(taskSync.migrateTasksToChild({
      ...service,
      enableCloudStorage: true
    }, 'parent_1', 'child_1')).resolves.toEqual({ success: false, count: 0 });

    expect(mockHttpClient.post).toHaveBeenNthCalledWith(1, '/tasks/occ_cfg_1/occurrence-record', expect.objectContaining({
      targetUserId: 'child_1',
      date: '2026-04-17',
      outcome: 'success'
    }));
    expect(mockHttpClient.post).toHaveBeenNthCalledWith(2, '/tasks/occ_cfg_1/disable-occurrence', expect.objectContaining({
      disableFromDate: '2026-04-17'
    }));
    expect(mockHttpClient.post).toHaveBeenNthCalledWith(3, '/tasks/occ_cfg_1/convert-occurrence', expect.objectContaining({
      effectiveFromDate: '2026-04-18'
    }));
    expect(service.taskRepository.saveAll).toHaveBeenCalledWith([
      { id: 'legacy_1', userId: 'child_1' }
    ]);
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
