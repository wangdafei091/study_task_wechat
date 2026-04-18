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
    getOccurrenceTasks: jest.fn(),
    getOccurrenceRecordsByDateRange: jest.fn(),
    getRequiredTasks: jest.fn(),
    getExpiredIncompleteTasks: jest.fn(),
    calculateTaskProgress: jest.fn(),
    checkUpcomingTasks: jest.fn(),
    getTaskStatistics: jest.fn(),
    calculateDailyStats: jest.fn(() => []),
    calculateStreak: jest.fn(async () => 0),
    getTasksByScope: jest.fn(),
    getChildTasksByScope: jest.fn(),
    getPendingLocalTasksByScope: jest.fn(),
    getPendingLocalChildTasksByScope: jest.fn()
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
    syncStatusToCloud: jest.fn(),
    syncRequiredStateToCloud: jest.fn(),
    syncOccurrenceRecordToCloud: jest.fn(),
    syncDisableOccurrenceToCloud: jest.fn(),
    syncConvertOccurrenceToCloud: jest.fn()
  };
  const taskWrite = {
    createTask: jest.fn(),
    updateTask: jest.fn(),
    deleteTask: jest.fn(),
    updateTaskStatus: jest.fn(),
    resetTask: jest.fn(),
    recordOccurrenceResult: jest.fn(),
    convertTaskToOccurrenceMode: jest.fn(),
    disableOccurrenceTask: jest.fn(),
    markTaskAsRequired: jest.fn(),
    unmarkTaskAsRequired: jest.fn()
  };
  const taskPenalty = {
    checkTasksStatus: jest.fn(),
    handleRequiredTaskPenalty: jest.fn()
  };
  const HttpClient = {
    healthCheck: jest.fn()
  };

  jest.doMock('../../utils/api-config', () => ({
    ENABLE_API: overrides.enableApi === true
  }));
  jest.doMock('../../utils/http-client', () => HttpClient);
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
    taskPenalty,
    HttpClient
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

  it('_applyAuthoritativeTaskMutation 应清理同语义的旧表现待同步记录', async () => {
    const { service, taskRepository } = loadTaskService({
      taskRepository: {
        saveAll: jest.fn(async (tasks) => tasks),
        getOccurrenceRecordsByDateRange: jest.fn(async () => [
          {
            id: 'occ_cloud_1',
            userId: 'child_1',
            date: '2026-03-26',
            parentTaskId: 'occ_cfg_1',
            executionMode: 'occurrence',
            isOccurrenceRecord: true,
            occurrenceOutcome: 'success',
            syncedToCloud: true
          },
          {
            id: 'occ_local_legacy',
            userId: 'child_1',
            date: '2026-03-26',
            parentTaskId: 'occ_cfg_1',
            executionMode: 'occurrence',
            isOccurrenceRecord: true,
            occurrenceOutcome: 'success',
            pendingSyncMeta: { action: 'occurrence_record' },
            syncedToCloud: false
          }
        ]),
        delete: jest.fn(async () => true)
      }
    });

    const result = await service._applyAuthoritativeTaskMutation({
      operation: 'occurrence_record',
      tasks: [{
        taskId: 'occ_cloud_1',
        userId: 'child_1',
        date: '2026-03-26',
        parentTaskId: 'occ_cfg_1',
        executionMode: 'occurrence',
        isOccurrenceRecord: true,
        occurrenceOutcome: 'success'
      }],
      taskId: 'occ_cloud_1'
    });

    expect(taskRepository.saveAll).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'occ_cloud_1',
        syncedToCloud: true,
        pendingSyncMeta: null
      })
    ]);
    expect(taskRepository.getOccurrenceRecordsByDateRange).toHaveBeenCalledWith('2026-03-26', '2026-03-26', 'child_1');
    expect(taskRepository.delete).toHaveBeenCalledWith('occ_local_legacy');
    expect(result.task).toEqual(expect.objectContaining({ id: 'occ_cloud_1' }));
  });

  it('updateOfflineQueueService 应注册 task adapter 并支持清空引用', () => {
    const { service } = loadTaskService();
    const offlineQueueService = {
      registerAdapter: jest.fn()
    };

    service.updateOfflineQueueService(offlineQueueService);
    expect(offlineQueueService.registerAdapter).toHaveBeenCalledWith('task', expect.any(Function));

    service.updateOfflineQueueService(null);
    expect(service.offlineQueueService).toBeNull();
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
    service._applyAuthoritativeTaskMutation = jest.fn(async () => ({
      task: null,
      tasks: [],
      mutation: null
    }));
    service._syncTaskToCloud = jest.fn(async (task) => {
      if (task.id === 'create_1') {
        return { task: { taskId: 'create_1' }, tasks: [{ taskId: 'create_1' }], operation: 'create' };
      }
      throw new Error('create failed');
    });
    service._syncUpdateToCloud = jest.fn(async (task) => {
      if (task.id === 'default_1') {
        throw new Error('default failed');
      }
      return { task: { taskId: task.id }, tasks: [{ taskId: task.id }], operation: 'update' };
    });
    service._syncStatusToCloud = jest.fn(async (task) => ({
      task: { taskId: task.id },
      tasks: [{ taskId: task.id }],
      operation: task.pendingSyncMeta?.action === 'reset' ? 'reset' : 'complete'
    }));
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
    expect(service._applyAuthoritativeTaskMutation).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'create' }),
      expect.objectContaining({ fallbackOperation: 'create' })
    );
    expect(service._applyAuthoritativeTaskMutation).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'update' }),
      expect.objectContaining({ fallbackOperation: 'update' })
    );
    expect(service._applyAuthoritativeTaskMutation).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'complete' }),
      expect.objectContaining({ fallbackOperation: 'complete' })
    );
    expect(service._applyAuthoritativeTaskMutation).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'reset' }),
      expect.objectContaining({ fallbackOperation: 'reset' })
    );
  });

  it('_flushPendingTaskSyncs 在云端关闭时应直接返回', async () => {
    const { service, taskRepository } = loadTaskService();
    service.enableCloudStorage = false;

    await service._flushPendingTaskSyncs();

    expect(taskRepository.getAll).not.toHaveBeenCalled();
  });

  it('_flushPendingTaskSyncs 在接入离线队列后应委托给 offlineQueueService', async () => {
    const { service, taskRepository } = loadTaskService();
    service.offlineQueueService = {
      initialize: jest.fn(async () => true),
      drain: jest.fn(async () => ({ success: true }))
    };

    await service._flushPendingTaskSyncs();

    expect(service.offlineQueueService.initialize).toHaveBeenCalledTimes(1);
    expect(service.offlineQueueService.drain).toHaveBeenCalledWith({
      domains: ['task'],
      reason: 'before_task_read'
    });
    expect(taskRepository.getAll).not.toHaveBeenCalled();
  });

  it('_executeTaskQueueItem 与 buildLegacyQueueCandidates 应覆盖剩余队列分支', async () => {
    const { service, taskRepository } = loadTaskService({
      taskRepository: {
        getById: jest.fn(async (id) => (id === 'stored_1' ? { id: 'stored_1' } : null)),
        getAll: jest.fn(async () => [
          { id: 'task_create', syncedToCloud: false, pendingSyncMeta: { operationKey: 'op_create' } },
          { id: 'task_update', syncedToCloud: true, pendingSyncMeta: { action: 'update', operationKey: 'op_update' } }
        ]),
        getDeleteTombstones: jest.fn(async () => [
          { entityId: 'task_delete', operationKey: 'op_delete', familyId: 'family_1' }
        ])
      }
    });
    service._syncTaskToCloud = jest.fn(async (task) => ({ kind: 'create', task }));
    service._syncUpdateToCloud = jest.fn(async (task) => ({ kind: 'update', task }));
    service._syncDeleteToCloud = jest.fn(async (id, meta) => ({ kind: 'delete', id, meta }));
    service._syncStatusToCloud = jest.fn(async (task) => ({ kind: 'status', task }));
    service._syncRequiredStateToCloud = jest.fn(async (task) => ({ kind: 'required', task }));
    service._syncOccurrenceRecordToCloud = jest.fn(async (task) => ({ kind: 'occurrence_record', task }));
    service._syncDisableOccurrenceToCloud = jest.fn(async (task, options) => ({ kind: 'disable_occurrence', task, options }));
    service._syncConvertOccurrenceToCloud = jest.fn(async (task, options) => ({ kind: 'convert_occurrence', task, options }));

    await expect(service._executeTaskQueueItem({
      operation: 'create',
      snapshot: { id: 'snapshot_1' },
      payload: { pendingSyncMeta: { action: 'create' } }
    })).resolves.toEqual(expect.objectContaining({ kind: 'create' }));
    await expect(service._executeTaskQueueItem({
      operation: 'update',
      entityId: 'stored_1',
      payload: {}
    })).resolves.toEqual(expect.objectContaining({ kind: 'update' }));
    await expect(service._executeTaskQueueItem({
      operation: 'delete',
      entityId: 'task_delete',
      payload: { deleteMeta: { reason: 'cleanup' } },
      snapshot: { pendingSyncMeta: { action: 'delete' } }
    })).resolves.toEqual(expect.objectContaining({ kind: 'delete' }));
    await expect(service._executeTaskQueueItem({
      operation: 'complete',
      snapshot: { id: 'complete_1' },
      payload: {}
    })).resolves.toEqual(expect.objectContaining({ kind: 'status' }));
    await expect(service._executeTaskQueueItem({
      operation: 'required',
      snapshot: { id: 'required_1' },
      payload: {}
    })).resolves.toEqual(expect.objectContaining({ kind: 'required' }));
    await expect(service._executeTaskQueueItem({
      operation: 'occurrence_record',
      snapshot: { id: 'record_1' },
      payload: {}
    })).resolves.toEqual(expect.objectContaining({ kind: 'occurrence_record' }));
    await expect(service._executeTaskQueueItem({
      operation: 'disable_occurrence',
      snapshot: {
        id: 'disable_1',
        pendingSyncMeta: { disableFromDate: '2026-03-26' }
      },
      payload: {}
    })).resolves.toEqual(expect.objectContaining({ kind: 'disable_occurrence' }));
    await expect(service._executeTaskQueueItem({
      operation: 'convert_occurrence',
      snapshot: {
        id: 'convert_1',
        pendingSyncMeta: { effectiveFromDate: '2026-03-26' }
      },
      payload: {}
    })).resolves.toEqual(expect.objectContaining({ kind: 'convert_occurrence' }));
    await expect(service._executeTaskQueueItem({
      operation: 'unknown',
      snapshot: { id: 'default_1' },
      payload: {}
    })).resolves.toEqual(expect.objectContaining({ kind: 'update' }));

    await expect(service.buildLegacyQueueCandidates()).resolves.toEqual([
      expect.objectContaining({ entityId: 'task_create', operation: 'create', legacyMigrationKey: 'task:pending:task_create:create' }),
      expect.objectContaining({ entityId: 'task_update', operation: 'update', legacyMigrationKey: 'task:pending:task_update:update' }),
      expect.objectContaining({ entityId: 'task_delete', operation: 'delete', legacyMigrationKey: 'task:tombstone:task_delete:delete' })
    ]);
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

  it('batchProcessTasks 在处理函数异常时应返回失败结果', async () => {
    const { service } = loadTaskService();
    const result = await service.batchProcessTasks([1, 2], async (item) => {
      if (item === 2) {
        throw new Error('process-fail');
      }
      return item;
    });

    expect(result).toEqual(expect.objectContaining({
      success: true,
      total: 2,
      processed: 1
    }));
    expect(result.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ item: 2, success: false })
    ]));
  });

  it('batchProcessTasks 在批次切片抛错时应返回失败结果', async () => {
    const { service } = loadTaskService();
    const items = [1, 2];
    items.slice = jest.fn(() => {
      throw new Error('slice-fail');
    });

    const result = await service.batchProcessTasks(items, async (item) => item);

    expect(result).toEqual({
      success: false,
      message: '批量处理失败: slice-fail'
    });
  });

  it('_toAuthoritativeTask、_applyAuthoritativeTaskMutation 与 _emitTaskCloudSyncFailure 应覆盖空值和降级分支', async () => {
    const { service, taskRepository, eventBus } = loadTaskService();
    taskRepository.saveAll = jest.fn(async (tasks) => tasks);
    taskRepository.save = jest.fn(async (task) => task);
    service._enqueueTaskMutation = jest.fn(async () => {
      throw new Error('queue-fail');
    });

    expect(service._toAuthoritativeTask(null)).toBeNull();

    const authoritative = await service._applyAuthoritativeTaskMutation({
      taskId: 'task_1',
      task: { taskId: 'task_1', title: '主任务' },
      tasks: [
        null,
        { taskId: 'task_1', title: '主任务' },
        { taskId: 'task_1', title: '重复任务' },
        { taskId: 'task_2', title: '第二个任务' }
      ]
    }, {
      fallbackOperation: 'update',
      message: 'ok',
      fallback: true
    });

    expect(authoritative.tasks).toHaveLength(2);

    const mutationResult = service._buildTaskServiceMutationResult({
      taskId: 'task_1',
      operation: 'update'
    }, {
      task: { id: 'task_1' },
      tasks: authoritative.tasks,
      message: 'ok',
      fallback: true
    });

    expect(mutationResult.message).toBe('ok');
    expect(mutationResult.fallback).toBe(true);

    await expect(service._emitTaskCloudSyncFailure('update', {
      id: 'task_1',
      pendingSyncMeta: { action: 'update' }
    }, new Error('sync-fail'))).resolves.toBeUndefined();
    expect(eventBus.emit).toHaveBeenCalled();
  });

  it('TaskService wrapper 方法应继续委托到子模块', async () => {
    const {
      service,
      taskQuery,
      taskRepeat,
      taskSync,
      taskWrite,
      taskPenalty
    } = loadTaskService();

    taskQuery.getTasksByScope.mockResolvedValue(['scope-task']);
    taskQuery.getChildTasksByScope.mockResolvedValue(['child-scope-task']);
    taskQuery.getPendingLocalTasksByScope.mockResolvedValue(['pending-task']);
    taskQuery.getPendingLocalChildTasksByScope.mockResolvedValue(['pending-child-task']);
    taskQuery.getOccurrenceTasks.mockResolvedValue(['occurrence-config']);
    taskQuery.getOccurrenceRecordsByDateRange.mockResolvedValue(['occurrence-record']);
    taskRepeat.generateRepeatTasks.mockResolvedValue(['repeat-task']);
    taskRepeat.createRepeatTaskInstance.mockReturnValue({ id: 'repeat-instance' });
    taskSync.migrateTasksToChild.mockResolvedValue({ success: true, count: 1 });
    taskSync.fetchSingleTaskFromCloud.mockResolvedValue({ id: 'cloud-task' });
    taskSync.syncUpdateToCloud.mockResolvedValue(true);
    taskSync.syncDeleteToCloud.mockResolvedValue(true);
    taskSync.syncStatusToCloud.mockResolvedValue(true);
    taskSync.syncRequiredStateToCloud.mockResolvedValue(true);
    taskSync.syncOccurrenceRecordToCloud.mockResolvedValue({ success: true });
    taskSync.syncDisableOccurrenceToCloud.mockResolvedValue({ success: true });
    taskSync.syncConvertOccurrenceToCloud.mockResolvedValue({ success: true });
    taskWrite.recordOccurrenceResult.mockResolvedValue({ success: true, kind: 'record' });
    taskWrite.convertTaskToOccurrenceMode.mockResolvedValue({ success: true, kind: 'convert' });
    taskWrite.disableOccurrenceTask.mockResolvedValue({ success: true, kind: 'disable' });
    taskWrite.markTaskAsRequired.mockResolvedValue({ success: true, kind: 'required' });
    taskWrite.unmarkTaskAsRequired.mockResolvedValue({ success: true, kind: 'unrequired' });
    taskPenalty.checkTasksStatus.mockResolvedValue({ success: true });

    await expect(service.getTasksByScope({ scope: 'family' })).resolves.toEqual(['scope-task']);
    await expect(service.getChildTasksByScope({ scope: 'family' })).resolves.toEqual(['child-scope-task']);
    await expect(service.getPendingLocalTasksByScope({ scope: 'family' })).resolves.toEqual(['pending-task']);
    await expect(service.getPendingLocalChildTasksByScope({ scope: 'family' })).resolves.toEqual(['pending-child-task']);
    await expect(service.getOccurrenceTasks({ userId: 'child_1' })).resolves.toEqual(['occurrence-config']);
    await expect(service.getOccurrenceRecordsByDateRange({ userId: 'child_1', startDate: '2026-03-01', endDate: '2026-03-31' })).resolves.toEqual(['occurrence-record']);
    await expect(service._generateRepeatTasks({ id: 'task_1' })).resolves.toEqual(['repeat-task']);
    expect(service._createRepeatTaskInstance({ id: 'task_1' }, new Date('2026-03-26'))).toEqual({ id: 'repeat-instance' });
    await expect(service._migrateTasksToChild('parent_1', 'child_1')).resolves.toEqual({ success: true, count: 1 });
    await expect(service._fetchSingleTaskFromCloud('task_2')).resolves.toEqual({ id: 'cloud-task' });
    await expect(service._syncUpdateToCloud({ id: 'task_3' })).resolves.toBe(true);
    await expect(service._syncDeleteToCloud('task_4')).resolves.toBe(true);
    await expect(service._syncStatusToCloud({ id: 'task_5' })).resolves.toBe(true);
    await expect(service._syncRequiredStateToCloud({ id: 'task_6' })).resolves.toBe(true);
    await expect(service.recordOccurrenceResult('task_7', { userId: 'child_1' })).resolves.toEqual({ success: true, kind: 'record' });
    await expect(service.convertTaskToOccurrenceMode('task_8', { effectiveFromDate: '2026-03-26' }, 'child_1')).resolves.toEqual({ success: true, kind: 'convert' });
    await expect(service.disableOccurrenceTask('task_9', { disableFromDate: '2026-03-26' }, 'child_1')).resolves.toEqual({ success: true, kind: 'disable' });
    await expect(service.markTaskAsRequired('task_10', 'child_1')).resolves.toEqual({ success: true, kind: 'required' });
    await expect(service.unmarkTaskAsRequired('task_11', 'child_1')).resolves.toEqual({ success: true, kind: 'unrequired' });
    await expect(service._syncOccurrenceRecordToCloud({ id: 'task_12' })).resolves.toEqual({ success: true });
    await expect(service._syncDisableOccurrenceToCloud({ id: 'task_13' }, { disableFromDate: '2026-03-26' })).resolves.toEqual({ success: true });
    await expect(service._syncConvertOccurrenceToCloud({ id: 'task_14' }, { effectiveFromDate: '2026-03-26' })).resolves.toEqual({ success: true });
    await expect(service.checkTasksStatus()).resolves.toEqual({ success: true });

    expect(taskQuery.getTasksByScope).toHaveBeenCalledWith(service, { scope: 'family' });
    expect(taskQuery.getChildTasksByScope).toHaveBeenCalledWith(service, { scope: 'family' });
    expect(taskQuery.getPendingLocalTasksByScope).toHaveBeenCalledWith(service, { scope: 'family' });
    expect(taskQuery.getPendingLocalChildTasksByScope).toHaveBeenCalledWith(service, { scope: 'family' });
    expect(taskQuery.getOccurrenceTasks).toHaveBeenCalledWith(service, { userId: 'child_1' });
    expect(taskQuery.getOccurrenceRecordsByDateRange).toHaveBeenCalledWith(service, {
      userId: 'child_1',
      startDate: '2026-03-01',
      endDate: '2026-03-31'
    });
    expect(taskRepeat.generateRepeatTasks).toHaveBeenCalledWith(service, { id: 'task_1' });
    expect(taskRepeat.createRepeatTaskInstance).toHaveBeenCalled();
    expect(taskSync.migrateTasksToChild).toHaveBeenCalledWith(service, 'parent_1', 'child_1');
    expect(taskSync.fetchSingleTaskFromCloud).toHaveBeenCalledWith(service, 'task_2');
    expect(taskSync.syncRequiredStateToCloud).toHaveBeenCalledWith(service, { id: 'task_6' });
    expect(taskSync.syncOccurrenceRecordToCloud).toHaveBeenCalledWith(service, { id: 'task_12' });
    expect(taskSync.syncDisableOccurrenceToCloud).toHaveBeenCalledWith(service, { id: 'task_13' }, { disableFromDate: '2026-03-26' });
    expect(taskSync.syncConvertOccurrenceToCloud).toHaveBeenCalledWith(service, { id: 'task_14' }, { effectiveFromDate: '2026-03-26' });
    expect(taskWrite.recordOccurrenceResult).toHaveBeenCalledWith(service, 'task_7', { userId: 'child_1' });
    expect(taskWrite.convertTaskToOccurrenceMode).toHaveBeenCalledWith(service, 'task_8', { effectiveFromDate: '2026-03-26' }, 'child_1');
    expect(taskWrite.disableOccurrenceTask).toHaveBeenCalledWith(service, 'task_9', { disableFromDate: '2026-03-26' }, 'child_1');
    expect(taskWrite.markTaskAsRequired).toHaveBeenCalledWith(service, 'task_10', 'child_1');
    expect(taskWrite.unmarkTaskAsRequired).toHaveBeenCalledWith(service, 'task_11', 'child_1');
    expect(taskPenalty.checkTasksStatus).toHaveBeenCalledWith(service);
  });

  it('isOccurrenceEnabled 应缓存健康检查结果，并在异常时回退 false', async () => {
    const { service, HttpClient } = loadTaskService({ enableApi: true });

    HttpClient.healthCheck
      .mockResolvedValueOnce({ taskOccurrenceEnabled: true })
      .mockRejectedValueOnce(new Error('health-fail'));

    await expect(service.isOccurrenceEnabled()).resolves.toBe(true);
    await expect(service.isOccurrenceEnabled()).resolves.toBe(true);
    expect(HttpClient.healthCheck).toHaveBeenCalledTimes(1);

    await expect(service.isOccurrenceEnabled({ forceRefresh: true })).resolves.toBe(false);
    expect(HttpClient.healthCheck).toHaveBeenCalledTimes(2);
  });
});
