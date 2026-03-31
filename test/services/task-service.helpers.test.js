jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

function loadTaskService(overrides = {}) {
  jest.resetModules();

  const taskQuery = {
    getAllTasks: jest.fn(),
    getTaskById: jest.fn(),
    getTodayTasks: jest.fn(),
    getTasksByDate: jest.fn(),
    getTasksByDateRange: jest.fn(),
    getRequiredTasks: jest.fn(),
    getExpiredIncompleteTasks: jest.fn(),
    calculateTaskProgress: jest.fn(),
    checkUpcomingTasks: jest.fn(),
    getTaskStatistics: jest.fn(),
    calculateDailyStats: jest.fn(() => []),
    calculateStreak: jest.fn(async () => 0),
    getTasksByScope: jest.fn()
  };
  const taskRepeat = {
    generateRepeatTasks: jest.fn(),
    createRepeatTaskInstance: jest.fn()
  };
  const taskSync = {
    migrateTasksToChild: jest.fn(),
    cleanupStaleTasks: jest.fn(),
    fetchSingleTaskFromCloud: jest.fn(),
    syncTaskToCloud: jest.fn(),
    fetchTasksFromCloud: jest.fn(),
    mergeLocalTasksIntoCloudResult: jest.fn(),
    syncUpdateToCloud: jest.fn(),
    syncDeleteToCloud: jest.fn(),
    syncStatusToCloud: jest.fn()
  };
  const taskWrite = {
    createTask: jest.fn(),
    updateTask: jest.fn(),
    deleteTask: jest.fn(),
    updateTaskStatus: jest.fn(),
    resetTask: jest.fn(),
    toggleTaskRequired: jest.fn()
  };
  const taskPenalty = {
    checkTasksStatus: jest.fn(),
    handleRequiredTaskPenalty: jest.fn()
  };

  jest.doMock('../../utils/api-config', () => ({
    ENABLE_API: false
  }));
  jest.doMock('../../services/task-service/task-query', () => taskQuery);
  jest.doMock('../../services/task-service/task-repeat', () => taskRepeat);
  jest.doMock('../../services/task-service/task-sync', () => taskSync);
  jest.doMock('../../services/task-service/task-write', () => taskWrite);
  jest.doMock('../../services/task-service/task-penalty', () => taskPenalty);

  const TaskService = require('../../services/task-service');
  const taskRepository = overrides.taskRepository || {
    save: jest.fn(async (task) => task),
    getAll: jest.fn(async () => []),
    getDeleteTombstones: jest.fn(async () => []),
    saveDeleteTombstone: jest.fn(async (tombstone) => tombstone),
    removeDeleteTombstone: jest.fn(async (entityId) => entityId)
  };
  const eventBus = overrides.eventBus || {
    emit: jest.fn()
  };
  const userService = overrides.userService || {
    getLoginUser: jest.fn(() => ({ userId: 'parent_1', role: 'parent', familyId: 'family_1' })),
    getCurrentUser: jest.fn(() => ({ userId: 'child_1', role: 'child', familyId: 'family_1' }))
  };

  const service = new TaskService({
    taskRepository,
    eventBus,
    userService
  });

  return {
    TaskService,
    service,
    taskRepository,
    eventBus,
    userService,
    taskQuery,
    taskRepeat,
    taskSync,
    taskWrite,
    taskPenalty
  };
}

describe('TaskService helpers and delegators', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('_markTaskSynced 应处理空任务和 modifyTime 覆盖', async () => {
    const { service, taskRepository } = loadTaskService();
    const task = {
      id: 'task_1',
      syncedToCloud: false,
      pendingSyncMeta: { action: 'update' },
      modifyTime: 100
    };

    await expect(service._markTaskSynced(null)).resolves.toBeNull();
    await service._markTaskSynced(task, { modifyTime: 200 });

    expect(task.syncedToCloud).toBe(true);
    expect(task.pendingSyncMeta).toBeNull();
    expect(task.modifyTime).toBe(200);
    expect(taskRepository.save).toHaveBeenCalledWith(task);
  });

  it('删除 tombstone 相关 helper 应覆盖缺失方法和异常降级', async () => {
    const { service } = loadTaskService({
      taskRepository: {}
    });

    await expect(service._getDeleteTombstones()).resolves.toEqual([]);
    await expect(service._saveDeleteTombstone({ entityId: 't1' })).resolves.toBeNull();
    await expect(service._removeDeleteTombstone('t1')).resolves.toBeNull();

    const loaded = loadTaskService({
      taskRepository: {
        getDeleteTombstones: jest.fn(() => Promise.reject(new Error('read-fail'))),
        saveDeleteTombstone: jest.fn(() => Promise.reject(new Error('save-fail'))),
        removeDeleteTombstone: jest.fn(() => Promise.reject(new Error('remove-fail')))
      }
    });

    await expect(loaded.service._getDeleteTombstones()).resolves.toEqual([]);
    await expect(loaded.service._saveDeleteTombstone({ entityId: 't2' })).resolves.toBeNull();
    await expect(loaded.service._removeDeleteTombstone('t2')).resolves.toBeNull();
  });

  it('_flushPendingTaskSyncs 应按动作路由并容忍同步失败', async () => {
    const { service, taskRepository } = loadTaskService({
      taskRepository: {
        getAll: jest.fn(async () => [
          { id: 'create_1', syncedToCloud: false, pendingSyncMeta: { action: 'create' } },
          { id: 'update_1', syncedToCloud: true, pendingSyncMeta: { action: 'update' } },
          { id: 'complete_1', syncedToCloud: true, pendingSyncMeta: { action: 'complete' } },
          { id: 'complete_pending_1', syncedToCloud: false, pendingSyncMeta: { action: 'complete' } },
          { id: 'reset_1', syncedToCloud: true, pendingSyncMeta: { action: 'reset' } },
          { id: 'default_1', syncedToCloud: true, pendingSyncMeta: { action: 'other' } },
          { id: 'skip_1' }
        ])
      }
    });

    service.enableCloudStorage = true;
    service._syncTaskToCloud = jest.fn(async (task) => {
      if (task.id === 'create_1') {
        return true;
      }
      throw new Error('create failed');
    });
    service._syncUpdateToCloud = jest.fn(async (task) => {
      if (task.id === 'default_1') {
        throw new Error('default failed');
      }
      return true;
    });
    service._syncStatusToCloud = jest.fn(async () => true);
    service._getDeleteTombstones = jest.fn(async () => [
      { entityId: 'delete_ok' },
      { entityId: 'delete_fail' }
    ]);
    service._syncDeleteToCloud = jest.fn(async (entityId) => {
      if (entityId === 'delete_fail') {
        throw new Error('delete failed');
      }
      return true;
    });

    await service._flushPendingTaskSyncs();

    expect(taskRepository.getAll).toHaveBeenCalled();
    expect(service._syncTaskToCloud).toHaveBeenCalledWith(expect.objectContaining({ id: 'create_1' }));
    expect(service._syncUpdateToCloud).toHaveBeenCalledWith(expect.objectContaining({ id: 'update_1' }));
    expect(service._syncUpdateToCloud).toHaveBeenCalledWith(expect.objectContaining({ id: 'default_1' }));
    expect(service._syncStatusToCloud).toHaveBeenCalledWith(expect.objectContaining({ id: 'complete_1' }));
    expect(service._syncStatusToCloud).toHaveBeenCalledWith(expect.objectContaining({ id: 'complete_pending_1' }));
    expect(service._syncStatusToCloud).toHaveBeenCalledWith(expect.objectContaining({ id: 'reset_1' }));
    expect(service._syncTaskToCloud).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'complete_pending_1' }));
    expect(service._syncDeleteToCloud).toHaveBeenCalledTimes(2);
  });

  it('_flushPendingTaskSyncs 在云端关闭时应直接返回', async () => {
    const { service, taskRepository } = loadTaskService();
    service.enableCloudStorage = false;

    await service._flushPendingTaskSyncs();

    expect(taskRepository.getAll).not.toHaveBeenCalled();
  });

  it('batchProcessTasks 应覆盖 delay 分支并累积结果', async () => {
    jest.useFakeTimers();
    const { service } = loadTaskService();
    const processFn = jest.fn(async (item) => item * 2);

    const promise = service.batchProcessTasks([1, 2, 3], processFn, {
      batchSize: 2,
      delay: 20
    });

    await jest.advanceTimersByTimeAsync(20);
    const result = await promise;

    expect(processFn).toHaveBeenCalledTimes(3);
    expect(result).toEqual(expect.objectContaining({
      success: true,
      total: 3,
      processed: 3
    }));
  });

  it('_getChildUserId 应覆盖用户存在、缺失和兜底分支', () => {
    const { service } = loadTaskService();

    service.serviceManager = {
      getUserService: jest.fn(() => ({
        getUserByRole: jest.fn(() => ({ id: 'child_real' }))
      }))
    };
    expect(service._getChildUserId()).toBe('child_real');

    service.serviceManager = {
      getUserService: jest.fn(() => ({
        getUserByRole: jest.fn(() => null)
      }))
    };
    expect(service._getChildUserId()).toBe('child');

    service.serviceManager = {
      getUserService: jest.fn(() => ({
        getUserByRole: jest.fn(() => ({ id: '' }))
      }))
    };
    expect(service._getChildUserId()).toBe('child');
  });

  it('TaskService wrapper 方法应继续委托到子模块', async () => {
    const {
      service,
      taskQuery,
      taskRepeat,
      taskSync,
      taskPenalty
    } = loadTaskService();

    taskQuery.getTasksByScope.mockResolvedValue(['scope-task']);
    taskRepeat.generateRepeatTasks.mockResolvedValue(['repeat-task']);
    taskRepeat.createRepeatTaskInstance.mockReturnValue({ id: 'repeat-instance' });
    taskSync.migrateTasksToChild.mockResolvedValue({ success: true, count: 1 });
    taskSync.fetchSingleTaskFromCloud.mockResolvedValue({ id: 'cloud-task' });
    taskSync.syncUpdateToCloud.mockResolvedValue(true);
    taskSync.syncDeleteToCloud.mockResolvedValue(true);
    taskSync.syncStatusToCloud.mockResolvedValue(true);
    taskPenalty.checkTasksStatus.mockResolvedValue({ success: true });

    await expect(service.getTasksByScope({ scope: 'family' })).resolves.toEqual(['scope-task']);
    await expect(service._generateRepeatTasks({ id: 'task_1' })).resolves.toEqual(['repeat-task']);
    expect(service._createRepeatTaskInstance({ id: 'task_1' }, new Date('2026-03-26'))).toEqual({ id: 'repeat-instance' });
    await expect(service._migrateTasksToChild('parent_1', 'child_1')).resolves.toEqual({ success: true, count: 1 });
    await expect(service._fetchSingleTaskFromCloud('task_2')).resolves.toEqual({ id: 'cloud-task' });
    await expect(service._syncUpdateToCloud({ id: 'task_3' })).resolves.toBe(true);
    await expect(service._syncDeleteToCloud('task_4')).resolves.toBe(true);
    await expect(service._syncStatusToCloud({ id: 'task_5' })).resolves.toBe(true);
    await expect(service.checkTasksStatus()).resolves.toEqual({ success: true });

    expect(taskQuery.getTasksByScope).toHaveBeenCalledWith(service, { scope: 'family' });
    expect(taskRepeat.generateRepeatTasks).toHaveBeenCalledWith(service, { id: 'task_1' });
    expect(taskRepeat.createRepeatTaskInstance).toHaveBeenCalled();
    expect(taskSync.migrateTasksToChild).toHaveBeenCalledWith(service, 'parent_1', 'child_1');
    expect(taskSync.fetchSingleTaskFromCloud).toHaveBeenCalledWith(service, 'task_2');
    expect(taskPenalty.checkTasksStatus).toHaveBeenCalledWith(service);
  });
});
