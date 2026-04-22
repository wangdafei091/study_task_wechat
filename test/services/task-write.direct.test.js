jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  logEvent: jest.fn()
}));

jest.mock('../../utils/dateUtils', () => ({
  getTodayString: jest.fn(() => '2026-04-17'),
  formatDate: jest.fn((date) => {
    const target = new Date(date);
    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, '0');
    const day = String(target.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  })
}));

const taskWrite = require('../../services/task-service/task-write');
const { Task } = require('../../models/task');

describe('task-write direct behavior', () => {
  it('updateTask 应允许历史超长表现项只改标题，但不允许继续扩张', async () => {
    const legacyTask = new Task({
      id: 'occ_cfg_legacy',
      userId: 'child_1',
      title: '听写全对',
      type: 'study',
      executionMode: 'occurrence',
      date: '2026-01-01',
      activeRange: {
        startDate: '2026-01-01',
        endDate: '2026-08-01',
        hasNoEndDate: false
      }
    });
    const service = {
      enableCloudStorage: false,
      taskRepository: {
        getById: jest.fn(async () => legacyTask.clone({}, false)),
        save: jest.fn(async (task) => task)
      },
      _buildTaskPendingSyncMeta: jest.fn((task, action, overrides = {}) => ({
        action,
        operationKey: String(overrides.operationKey || task.modifyTime || Date.now()),
        modifyTime: Number(overrides.modifyTime || task.modifyTime || Date.now()),
        targetUserId: overrides.targetUserId || task.userId || null
      })),
      eventBus: {
        emit: jest.fn()
      },
      _buildTaskServiceMutationResult: jest.fn((mutation, options = {}) => ({
        success: true,
        task: options.task
      }))
    };

    const titleOnly = await taskWrite.updateTask(service, 'occ_cfg_legacy', {
      title: '只改标题'
    }, 'child_1');
    expect(titleOnly.success).toBe(true);

    const expandResult = await taskWrite.updateTask(service, 'occ_cfg_legacy', {
      activeRange: {
        startDate: '2026-01-01',
        endDate: '2026-08-15',
        hasNoEndDate: false
      }
    }, 'child_1');
    expect(expandResult).toEqual(expect.objectContaining({
      success: false,
      code: 'TASK_ACTIVE_RANGE_TOO_LARGE'
    }));
  });

  it('recordOccurrenceResult 应拒绝未来日期记录', async () => {
    const service = {
      enableCloudStorage: false,
      taskRepository: {
        getById: jest.fn(async () => new Task({
          id: 'occ_cfg_1',
          userId: 'child_1',
          title: '听写全对',
          type: 'study',
          executionMode: 'occurrence',
          date: '2026-04-01',
          activeRange: {
            startDate: '2026-04-01',
            endDate: '',
            hasNoEndDate: true
          }
        })),
        getOccurrenceRecord: jest.fn()
      }
    };

    const result = await taskWrite.recordOccurrenceResult(service, 'occ_cfg_1', {
      userId: 'child_1',
      date: '2026-04-18',
      outcome: 'success'
    });

    expect(result).toEqual({
      success: false,
      message: '未来日期不能记录表现'
    });
    expect(service.taskRepository.getOccurrenceRecord).not.toHaveBeenCalled();
  });

  it('recordOccurrenceResult 在云端模式下应走 occurrence 专用同步接口', async () => {
    const configTask = new Task({
      id: 'occ_cfg_1',
      userId: 'child_1',
      title: '听写全对',
      type: 'study',
      points: 2,
      executionMode: 'occurrence',
      date: '2026-04-01',
      activeRange: {
        startDate: '2026-04-01',
        endDate: '',
        hasNoEndDate: true
      }
    });
    const syncedRecord = new Task({
      id: 'task_occ_occ_cfg_1_child_1_20260417',
      userId: 'child_1',
      parentTaskId: 'occ_cfg_1',
      title: '听写全对',
      type: 'study',
      executionMode: 'occurrence',
      isOccurrenceRecord: true,
      occurrenceOutcome: 'success',
      date: '2026-04-17',
      points: 2,
      starAwarded: true
    });
    const service = {
      enableCloudStorage: true,
      eventBus: {
        emit: jest.fn()
      },
      taskRepository: {
        getById: jest.fn(async () => configTask),
        getOccurrenceRecord: jest.fn(async () => null)
      },
      starService: {
        addStars: jest.fn(async () => ({ success: true }))
      },
      _buildTaskPendingSyncMeta: jest.fn((task, action, overrides = {}) => ({
        action,
        operationKey: String(overrides.operationKey || task.modifyTime || Date.now()),
        modifyTime: Number(overrides.modifyTime || task.modifyTime || Date.now()),
        targetUserId: overrides.targetUserId || task.userId || null
      })),
      _syncOccurrenceRecordToCloud: jest.fn(async () => ({
        operation: 'occurrence_record',
        task: configTask.toJSON(),
        tasks: [configTask.toJSON(), syncedRecord.toJSON()],
        recordTask: syncedRecord.toJSON(),
        taskId: configTask.id
      })),
      _createTaskViaCloud: jest.fn(),
      _syncUpdateToCloud: jest.fn(),
      _applyAuthoritativeTaskMutation: jest.fn(async () => ({
        task: configTask,
        tasks: [
          { id: configTask.id },
          {
            id: syncedRecord.id,
            occurrenceOutcome: 'success',
            starAwarded: true
          }
        ],
        taskId: configTask.id
      })),
      _toAuthoritativeTask: jest.fn(() => syncedRecord),
      _buildTaskServiceMutationResult: jest.fn((mutation, options = {}) => ({
        success: true,
        task: options.task,
        mutation
      }))
    };

    await taskWrite.recordOccurrenceResult(service, 'occ_cfg_1', {
      userId: 'child_1',
      date: '2026-04-17',
      outcome: 'success'
    });

    expect(service._syncOccurrenceRecordToCloud).toHaveBeenCalled();
    expect(service._createTaskViaCloud).not.toHaveBeenCalled();
    expect(service._syncUpdateToCloud).not.toHaveBeenCalled();
  });

  it('recordOccurrenceResult 对相同结果应返回 unchanged，对撤销失败应显式返回错误', async () => {
    const configTask = new Task({
      id: 'occ_cfg_same',
      userId: 'child_1',
      title: '听写全对',
      type: 'study',
      points: 2,
      executionMode: 'occurrence',
      date: '2026-04-01',
      activeRange: {
        startDate: '2026-04-01',
        endDate: '',
        hasNoEndDate: true
      }
    });
    const existingSuccessRecord = new Task({
      id: 'occ_record_existing',
      userId: 'child_1',
      parentTaskId: 'occ_cfg_same',
      title: '听写全对',
      type: 'study',
      points: 2,
      executionMode: 'occurrence',
      isOccurrenceRecord: true,
      occurrenceOutcome: 'success',
      date: '2026-04-17',
      status: 1,
      starAwarded: true
    });

    const unchangedService = {
      enableCloudStorage: false,
      taskRepository: {
        getById: jest.fn(async () => configTask),
        getOccurrenceRecord: jest.fn(async () => existingSuccessRecord),
        save: jest.fn()
      }
    };

    await expect(taskWrite.recordOccurrenceResult(unchangedService, 'occ_cfg_same', {
      userId: 'child_1',
      date: '2026-04-17',
      outcome: 'success'
    })).resolves.toEqual({
      success: true,
      task: configTask,
      record: existingSuccessRecord,
      unchanged: true
    });
    expect(unchangedService.taskRepository.save).not.toHaveBeenCalled();

    const revokeFailService = {
      enableCloudStorage: false,
      taskRepository: {
        getById: jest.fn(async () => configTask),
        getOccurrenceRecord: jest.fn(async () => existingSuccessRecord),
        save: jest.fn()
      },
      starService: {
        consumeStarsFromSpecificType: jest.fn(async () => ({ success: false }))
      }
    };

    await expect(taskWrite.recordOccurrenceResult(revokeFailService, 'occ_cfg_same', {
      userId: 'child_1',
      date: '2026-04-17',
      outcome: 'failure'
    })).resolves.toEqual({
      success: false,
      message: '撤销原表现奖励失败，请稍后重试'
    });
    expect(revokeFailService.taskRepository.save).not.toHaveBeenCalled();
  });

  it('recordOccurrenceResult 在云端失败时应降级为本地待同步，并支持成功改失败的奖励撤销', async () => {
    const configTask = new Task({
      id: 'occ_cfg_fallback',
      userId: 'child_1',
      title: '听写全对',
      type: 'study',
      points: 2,
      executionMode: 'occurrence',
      date: '2026-04-01',
      activeRange: {
        startDate: '2026-04-01',
        endDate: '',
        hasNoEndDate: true
      }
    });
    const existingSuccessRecord = new Task({
      id: 'occ_record_existing_fallback',
      userId: 'child_1',
      parentTaskId: 'occ_cfg_fallback',
      title: '听写全对',
      type: 'study',
      points: 2,
      executionMode: 'occurrence',
      isOccurrenceRecord: true,
      occurrenceOutcome: 'success',
      date: '2026-04-17',
      status: 1,
      starAwarded: true
    });
    const service = {
      enableCloudStorage: true,
      eventBus: {
        emit: jest.fn()
      },
      taskRepository: {
        getById: jest.fn(async () => configTask),
        getOccurrenceRecord: jest.fn(async () => existingSuccessRecord),
        save: jest.fn(async (task) => task)
      },
      starService: {
        consumeStarsFromSpecificType: jest.fn(async () => ({ success: true })),
        addStars: jest.fn(async () => ({ success: true }))
      },
      _buildTaskPendingSyncMeta: jest.fn((task, action, overrides = {}) => ({
        action,
        operationKey: String(overrides.operationKey || task.modifyTime || Date.now()),
        modifyTime: Number(overrides.modifyTime || task.modifyTime || Date.now()),
        targetUserId: overrides.targetUserId || task.userId || null,
        configTaskId: overrides.extraMeta?.configTaskId || null
      })),
      _syncOccurrenceRecordToCloud: jest.fn(async () => {
        throw new Error('occurrence cloud fail');
      }),
      _emitTaskCloudSyncFailure: jest.fn(async () => true),
      _buildTaskServiceMutationResult: jest.fn((mutation, options = {}) => ({
        success: true,
        task: options.task,
        fallback: options.fallback
      }))
    };

    const result = await taskWrite.recordOccurrenceResult(service, 'occ_cfg_fallback', {
      userId: 'child_1',
      date: '2026-04-17',
      outcome: 'failure'
    });

    expect(service.starService.consumeStarsFromSpecificType).toHaveBeenCalledWith(
      2,
      expect.anything(),
      '撤销表现达成: 听写全对',
      expect.objectContaining({
        sourceType: 'task_occurrence_revoke',
        sourceId: 'occ_record_existing_fallback',
        userId: 'child_1',
        originalTaskDate: '2026-04-17'
      })
    );
    expect(service.starService.addStars).not.toHaveBeenCalled();
    expect(service.taskRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      parentTaskId: 'occ_cfg_fallback',
      occurrenceOutcome: 'failure',
      starAwarded: false,
      pendingSyncMeta: expect.objectContaining({
        action: 'occurrence_record',
        targetUserId: 'child_1'
      })
    }));
    expect(service._emitTaskCloudSyncFailure).toHaveBeenCalledWith(
      'occurrence_record',
      expect.objectContaining({
        parentTaskId: 'occ_cfg_fallback',
        occurrenceOutcome: 'failure'
      }),
      expect.any(Error)
    );
    expect(service.eventBus.emit).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      success: true,
      fallback: true,
      starsAwarded: false,
      record: expect.objectContaining({
        parentTaskId: 'occ_cfg_fallback',
        occurrenceOutcome: 'failure',
        starAwarded: false
      })
    }));
  });

  it('recordOccurrenceResult 在 viewer 家长下应直接拒绝，不执行本地星星和记录写入', async () => {
    const service = {
      enableCloudStorage: true,
      userService: {
        getLoginUser: jest.fn(() => ({
          userId: 'parent_viewer',
          role: 'parent',
          familyId: 'family_1',
          familyPermissionRole: 'viewer'
        }))
      },
      taskRepository: {
        getById: jest.fn(),
        getOccurrenceRecord: jest.fn(),
        save: jest.fn()
      },
      starService: {
        addStars: jest.fn(),
        consumeStarsFromSpecificType: jest.fn()
      }
    };

    const result = await taskWrite.recordOccurrenceResult(service, 'occ_cfg_viewer', {
      userId: 'child_1',
      date: '2026-04-17',
      outcome: 'success'
    });

    expect(result).toEqual({
      success: false,
      message: '当前为查看者，不能记录表现',
      code: 'FAMILY_MANAGER_REQUIRED'
    });
    expect(service.taskRepository.getById).not.toHaveBeenCalled();
    expect(service.starService.addStars).not.toHaveBeenCalled();
    expect(service.taskRepository.save).not.toHaveBeenCalled();
  });

  it('viewer 家长切到孩子视角时，updateTaskStatus 不应被误拦截', async () => {
    const task = new Task({
      id: 'task_child_exec_1',
      userId: 'child_1',
      title: '数学',
      type: 'study',
      date: '2026-04-17',
      status: 0,
      points: 0,
      reminder: { enabled: false }
    });
    const service = {
      enableCloudStorage: false,
      userService: {
        getLoginUser: jest.fn(() => ({
          userId: 'parent_viewer',
          role: 'parent',
          familyId: 'family_1',
          familyPermissionRole: 'viewer'
        })),
        getCurrentUser: jest.fn(() => ({
          userId: 'child_1',
          role: 'child',
          familyId: 'family_1'
        }))
      },
      taskRepository: {
        getById: jest.fn(async () => task.clone({}, false)),
        save: jest.fn(async (savedTask) => savedTask)
      },
      _buildTaskPendingSyncMeta: jest.fn((currentTask, action, overrides = {}) => ({
        action,
        operationKey: String(overrides.operationKey || currentTask.modifyTime || Date.now()),
        modifyTime: Number(overrides.modifyTime || currentTask.modifyTime || Date.now()),
        targetUserId: overrides.targetUserId || currentTask.userId || null
      })),
      eventBus: {
        emit: jest.fn()
      },
      _buildTaskServiceMutationResult: jest.fn((mutation, options = {}) => ({
        success: mutation !== null,
        task: options.task
      }))
    };

    const result = await taskWrite.updateTaskStatus(service, 'task_child_exec_1', 1, 'child_1');

    expect(result.code).not.toBe('FAMILY_MANAGER_REQUIRED');
    expect(result.message).not.toBe('当前为查看者，不能修改任务状态');
    expect(result.task).toEqual(expect.objectContaining({
      id: 'task_child_exec_1',
      status: 1
    }));
    expect(service.taskRepository.getById).toHaveBeenCalledWith('task_child_exec_1');
    expect(service.taskRepository.save).toHaveBeenCalled();
  });

  it('disableOccurrenceTask 应在本地模式下更新有效期并标记待同步', async () => {
    const configTask = new Task({
      id: 'occ_cfg_disable',
      userId: 'child_1',
      title: '课堂表现',
      type: 'habit',
      executionMode: 'occurrence',
      date: '2026-04-01',
      activeRange: {
        startDate: '2026-04-01',
        endDate: '',
        hasNoEndDate: true
      }
    });
    const service = {
      enableCloudStorage: false,
      taskRepository: {
        getById: jest.fn(async () => configTask),
        save: jest.fn(async (task) => task)
      },
      _buildTaskPendingSyncMeta: jest.fn((task, action, overrides = {}) => ({
        action,
        operationKey: String(overrides.operationKey || task.modifyTime || Date.now()),
        modifyTime: Number(overrides.modifyTime || task.modifyTime || Date.now()),
        targetUserId: overrides.targetUserId || task.userId || null,
        disableFromDate: overrides.extraMeta?.disableFromDate || null
      })),
      _buildTaskServiceMutationResult: jest.fn((mutation, options = {}) => ({
        success: true,
        task: options.task,
        fallback: options.fallback
      }))
    };

    const result = await taskWrite.disableOccurrenceTask(service, 'occ_cfg_disable', {
      disableFromDate: '2026-04-17'
    }, 'child_1');

    expect(result).toEqual(expect.objectContaining({
      success: true,
      fallback: false,
      task: expect.objectContaining({
        id: 'occ_cfg_disable'
      })
    }));
    expect(service.taskRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      activeRange: expect.objectContaining({
        startDate: '2026-04-01',
        endDate: '2026-04-16',
        hasNoEndDate: false
      }),
      hasNoEndDate: false,
      pendingSyncMeta: expect.objectContaining({
        action: 'disable_occurrence',
        disableFromDate: '2026-04-17'
      })
    }));
  });

  it('convertTaskToOccurrenceMode 应只归档未来未完成实例并重写为表现项', async () => {
    const plannedTask = new Task({
      id: 'planned_parent_1',
      userId: 'child_1',
      title: '每周听写',
      type: 'study',
      date: '2026-04-01',
      points: 2,
      isRequired: true,
      repeat: {
        type: 'weekly',
        startDate: '2026-04-01',
        endDate: '2026-04-30'
      },
      startTime: '18:00',
      endTime: '18:30',
      duration: 30,
      reminder: { enabled: true, time: 10 }
    });
    const service = {
      enableCloudStorage: false,
      taskRepository: {
        getById: jest.fn(async () => plannedTask),
        getChildTasks: jest.fn(async () => [
          { id: 'past_child', date: '2026-04-10', isCompleted: () => false, starAwarded: false },
          { id: 'future_completed', date: '2026-04-19', isCompleted: () => true, starAwarded: true },
          { id: 'future_pending', date: '2026-04-20', isCompleted: () => false, starAwarded: false }
        ]),
        delete: jest.fn(async () => true),
        save: jest.fn(async (task) => task)
      },
      _buildTaskPendingSyncMeta: jest.fn((task, action, overrides = {}) => ({
        action,
        operationKey: String(overrides.operationKey || task.modifyTime || Date.now()),
        modifyTime: Number(overrides.modifyTime || task.modifyTime || Date.now()),
        targetUserId: overrides.targetUserId || task.userId || null,
        effectiveFromDate: overrides.extraMeta?.effectiveFromDate || null
      })),
      _buildTaskServiceMutationResult: jest.fn((mutation, options = {}) => ({
        success: true,
        task: options.task,
        fallback: options.fallback
      }))
    };

    const result = await taskWrite.convertTaskToOccurrenceMode(service, 'planned_parent_1', {
      effectiveFromDate: '2026-04-17'
    }, 'child_1');

    expect(service.taskRepository.delete).toHaveBeenCalledTimes(1);
    expect(service.taskRepository.delete).toHaveBeenCalledWith('future_pending');
    expect(result.archivedFutureInstances).toEqual(['future_pending']);
    expect(service.taskRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      executionMode: 'occurrence',
      isRequired: false,
      date: '2026-04-17',
      activeRange: expect.objectContaining({
        startDate: '2026-04-17',
        endDate: '2026-04-30',
        hasNoEndDate: false
      }),
      pendingSyncMeta: expect.objectContaining({
        action: 'convert_occurrence',
        effectiveFromDate: '2026-04-17'
      })
    }));
  });

  it('markTaskAsRequired / unmarkTaskAsRequired 应覆盖权限、unchanged 与本地保存分支', async () => {
    const task = new Task({
      id: 'required_task_1',
      userId: 'child_1',
      title: '数学作业',
      type: 'study',
      date: '2026-04-17',
      isRequired: false
    });
    const service = {
      enableCloudStorage: false,
      eventBus: {
        emit: jest.fn()
      },
      taskRepository: {
        getById: jest.fn(async () => task),
        save: jest.fn(async (taskItem) => taskItem)
      },
      _buildTaskPendingSyncMeta: jest.fn((taskItem, action, overrides = {}) => ({
        action,
        operationKey: String(overrides.operationKey || taskItem.modifyTime || Date.now()),
        modifyTime: Number(overrides.modifyTime || taskItem.modifyTime || Date.now()),
        targetUserId: overrides.targetUserId || taskItem.userId || null
      })),
      _buildTaskServiceMutationResult: jest.fn((mutation, options = {}) => ({
        success: true,
        task: options.task,
        fallback: options.fallback
      }))
    };

    await expect(taskWrite.markTaskAsRequired(service, 'required_task_1', 'other_child')).resolves.toEqual({
      success: false,
      message: '无权限操作此任务'
    });

    const requiredResult = await taskWrite.markTaskAsRequired(service, 'required_task_1', 'child_1');
    expect(requiredResult).toEqual(expect.objectContaining({
      success: true,
      task: expect.objectContaining({ isRequired: true })
    }));

    await expect(taskWrite.markTaskAsRequired(service, 'required_task_1', 'child_1')).resolves.toEqual({
      success: true,
      task,
      unchanged: true
    });

    const unrequiredResult = await taskWrite.unmarkTaskAsRequired(service, 'required_task_1', 'child_1');
    expect(unrequiredResult).toEqual(expect.objectContaining({
      success: true,
      task: expect.objectContaining({ isRequired: false })
    }));

    await expect(taskWrite.unmarkTaskAsRequired(service, 'required_task_1', 'child_1')).resolves.toEqual({
      success: true,
      task,
      unchanged: true
    });
  });

  it('disableOccurrenceTask 和 convertTaskToOccurrenceMode 应覆盖云端成功、能力关闭与降级分支', async () => {
    const occurrenceTask = new Task({
      id: 'occ_cfg_cloud',
      userId: 'child_1',
      title: '课堂表现',
      type: 'habit',
      executionMode: 'occurrence',
      date: '2026-04-01',
      activeRange: {
        startDate: '2026-04-01',
        endDate: '',
        hasNoEndDate: true
      }
    });
    const plannedTask = new Task({
      id: 'planned_cloud',
      userId: 'child_1',
      title: '每周听写',
      type: 'study',
      date: '2026-04-01',
      points: 2,
      isRequired: true,
      repeat: {
        type: 'weekly',
        startDate: '2026-04-01',
        endDate: '2026-04-30'
      }
    });
    const cloudService = {
      enableCloudStorage: true,
      isOccurrenceEnabled: jest.fn(async () => true),
      taskRepository: {
        getById: jest.fn(async (taskId) => (taskId === 'occ_cfg_cloud' ? occurrenceTask : plannedTask)),
        getChildTasks: jest.fn(async () => []),
        save: jest.fn(async (task) => task)
      },
      _buildTaskPendingSyncMeta: jest.fn((task, action, overrides = {}) => ({
        action,
        operationKey: String(overrides.operationKey || task.modifyTime || Date.now()),
        modifyTime: Number(overrides.modifyTime || task.modifyTime || Date.now()),
        targetUserId: overrides.targetUserId || task.userId || null,
        disableFromDate: overrides.extraMeta?.disableFromDate || null,
        effectiveFromDate: overrides.extraMeta?.effectiveFromDate || null
      })),
      _syncDisableOccurrenceToCloud: jest.fn(async () => ({
        operation: 'disable_occurrence',
        taskId: 'occ_cfg_cloud'
      })),
      _syncConvertOccurrenceToCloud: jest.fn(async () => ({
        operation: 'convert_occurrence',
        taskId: 'planned_cloud',
        archivedFutureTaskIds: ['future_pending']
      })),
      _applyAuthoritativeTaskMutation: jest.fn(async (mutation) => ({
        task: mutation.operation === 'disable_occurrence'
          ? { ...occurrenceTask, id: 'occ_cfg_cloud', activeRange: { startDate: '2026-04-01', endDate: '2026-04-16', hasNoEndDate: false } }
          : { ...plannedTask, id: 'planned_cloud', executionMode: 'occurrence' }
      })),
      _emitTaskCloudSyncFailure: jest.fn(async () => true),
      _buildTaskServiceMutationResult: jest.fn((mutation, options = {}) => ({
        success: true,
        task: options.task,
        fallback: options.fallback
      }))
    };

    const disableResult = await taskWrite.disableOccurrenceTask(cloudService, 'occ_cfg_cloud', {
      disableFromDate: '2026-04-17'
    }, 'child_1');
    expect(disableResult).toEqual(expect.objectContaining({
      success: true,
      task: expect.objectContaining({ id: 'occ_cfg_cloud' })
    }));
    expect(cloudService._syncDisableOccurrenceToCloud).toHaveBeenCalled();
    expect(cloudService.taskRepository.save).not.toHaveBeenCalled();
    expect(cloudService._syncDisableOccurrenceToCloud).toHaveBeenCalledWith(expect.objectContaining({
      hasNoEndDate: false,
      activeRange: expect.objectContaining({
        startDate: '2026-04-01',
        endDate: '2026-04-16',
        hasNoEndDate: false
      })
    }), expect.objectContaining({
      disableFromDate: '2026-04-17'
    }));

    const convertResult = await taskWrite.convertTaskToOccurrenceMode(cloudService, 'planned_cloud', {
      effectiveFromDate: '2026-04-17'
    }, 'child_1');
    expect(convertResult).toEqual(expect.objectContaining({
      success: true,
      convertedTask: expect.objectContaining({ id: 'planned_cloud', executionMode: 'occurrence' }),
      archivedFutureInstances: ['future_pending']
    }));
    expect(cloudService._syncConvertOccurrenceToCloud).toHaveBeenCalled();

    const disabledCapabilityService = {
      enableCloudStorage: true,
      isOccurrenceEnabled: jest.fn(async () => false),
      taskRepository: {
        getById: jest.fn(async () => occurrenceTask)
      }
    };
    await expect(taskWrite.disableOccurrenceTask(disabledCapabilityService, 'occ_cfg_cloud', {}, 'child_1')).resolves.toEqual({
      success: false,
      message: '云端未完成升级，暂不可使用表现项'
    });
    await expect(taskWrite.convertTaskToOccurrenceMode(disabledCapabilityService, 'occ_cfg_cloud', {}, 'child_1')).resolves.toEqual({
      success: true,
      convertedTask: occurrenceTask,
      archivedFutureInstances: [],
      unchanged: true
    });

    const fallbackService = {
      ...cloudService,
      _syncDisableOccurrenceToCloud: jest.fn(async () => {
        throw new Error('disable cloud fail');
      }),
      _syncConvertOccurrenceToCloud: jest.fn(async () => {
        throw new Error('convert cloud fail');
      }),
      taskRepository: {
        getById: jest.fn(async (taskId) => (taskId === 'occ_cfg_cloud' ? occurrenceTask.clone({}, false) : plannedTask.clone({}, false))),
        getChildTasks: jest.fn(async () => [
          { id: 'future_pending', date: '2026-04-20', isCompleted: () => false, starAwarded: false }
        ]),
        delete: jest.fn(async () => true),
        save: jest.fn(async (task) => task)
      }
    };

    const fallbackDisable = await taskWrite.disableOccurrenceTask(fallbackService, 'occ_cfg_cloud', {
      disableFromDate: '2026-04-17'
    }, 'child_1');
    expect(fallbackDisable).toEqual(expect.objectContaining({
      success: true,
      fallback: true,
      task: expect.objectContaining({ id: 'occ_cfg_cloud' })
    }));
    expect(fallbackService._emitTaskCloudSyncFailure).toHaveBeenCalledWith(
      'disable_occurrence',
      expect.objectContaining({ id: 'occ_cfg_cloud' }),
      expect.any(Error)
    );

    const fallbackConvert = await taskWrite.convertTaskToOccurrenceMode(fallbackService, 'planned_cloud', {
      effectiveFromDate: '2026-04-17'
    }, 'child_1');
    expect(fallbackConvert).toEqual(expect.objectContaining({
      success: true,
      fallback: true,
      convertedTask: expect.objectContaining({ id: 'planned_cloud', executionMode: 'occurrence' }),
      archivedFutureInstances: ['future_pending']
    }));
    expect(fallbackService._emitTaskCloudSyncFailure).toHaveBeenCalledWith(
      'convert_occurrence',
      expect.objectContaining({ id: 'planned_cloud' }),
      expect.any(Error)
    );
  });

  it('markTaskAsRequired / unmarkTaskAsRequired 应覆盖云端权威、降级和缺失分支', async () => {
    const baseTask = new Task({
      id: 'required_cloud',
      userId: 'child_1',
      title: '数学作业',
      type: 'study',
      date: '2026-04-17',
      isRequired: false
    });
    const service = {
      enableCloudStorage: true,
      eventBus: {
        emit: jest.fn()
      },
      taskRepository: {
        getById: jest.fn(async () => baseTask.clone({}, false)),
        save: jest.fn(async (taskItem) => taskItem)
      },
      _buildTaskPendingSyncMeta: jest.fn((taskItem, action, overrides = {}) => ({
        action,
        operationKey: String(overrides.operationKey || taskItem.modifyTime || Date.now()),
        modifyTime: Number(overrides.modifyTime || taskItem.modifyTime || Date.now()),
        targetUserId: overrides.targetUserId || taskItem.userId || null
      })),
      _syncRequiredStateToCloud: jest.fn(async (taskItem) => ({
        operation: taskItem.isRequired ? 'required' : 'unrequired',
        taskId: taskItem.id
      })),
      _applyAuthoritativeTaskMutation: jest.fn(async (mutation) => ({
        task: {
          ...baseTask,
          id: 'required_cloud',
          isRequired: mutation.operation === 'required'
        }
      })),
      _emitTaskCloudSyncFailure: jest.fn(async () => true),
      _buildTaskServiceMutationResult: jest.fn((mutation, options = {}) => ({
        success: true,
        task: options.task,
        fallback: options.fallback
      }))
    };

    await expect(taskWrite.markTaskAsRequired({
      ...service,
      _fetchSingleTaskFromCloud: jest.fn(async () => null),
      taskRepository: { getById: jest.fn(async () => null) }
    }, 'missing_task', 'child_1')).resolves.toEqual({
      success: false,
      message: '未找到指定的任务'
    });

    const requiredResult = await taskWrite.markTaskAsRequired(service, 'required_cloud', 'child_1');
    expect(requiredResult).toEqual(expect.objectContaining({
      success: true,
      task: expect.objectContaining({ isRequired: true })
    }));
    expect(service._syncRequiredStateToCloud).toHaveBeenCalled();

    const fallbackRequiredService = {
      ...service,
      _syncRequiredStateToCloud: jest.fn(async () => {
        throw new Error('required cloud fail');
      })
    };
    const fallbackRequired = await taskWrite.markTaskAsRequired(fallbackRequiredService, 'required_cloud', 'child_1');
    expect(fallbackRequired).toEqual(expect.objectContaining({
      success: true,
      fallback: true,
      task: expect.objectContaining({ isRequired: true })
    }));
    expect(fallbackRequiredService._emitTaskCloudSyncFailure).toHaveBeenCalledWith(
      'required',
      expect.objectContaining({ id: 'required_cloud', isRequired: true }),
      expect.any(Error)
    );

    const unrequiredTask = new Task({
      id: 'required_cloud',
      userId: 'child_1',
      title: '数学作业',
      type: 'study',
      date: '2026-04-17',
      isRequired: true
    });
    const unrequiredService = {
      ...service,
      taskRepository: {
        getById: jest.fn(async () => unrequiredTask.clone({}, false)),
        save: jest.fn(async (taskItem) => taskItem)
      }
    };
    const unrequiredResult = await taskWrite.unmarkTaskAsRequired(unrequiredService, 'required_cloud', 'child_1');
    expect(unrequiredResult).toEqual(expect.objectContaining({
      success: true,
      task: expect.objectContaining({ isRequired: false })
    }));

    const fallbackUnrequiredService = {
      ...unrequiredService,
      _syncRequiredStateToCloud: jest.fn(async () => {
        throw new Error('unrequired cloud fail');
      })
    };
    const fallbackUnrequired = await taskWrite.unmarkTaskAsRequired(fallbackUnrequiredService, 'required_cloud', 'child_1');
    expect(fallbackUnrequired).toEqual(expect.objectContaining({
      success: true,
      fallback: true,
      task: expect.objectContaining({ isRequired: false })
    }));
    expect(fallbackUnrequiredService._emitTaskCloudSyncFailure).toHaveBeenCalledWith(
      'unrequired',
      expect.objectContaining({ id: 'required_cloud', isRequired: false }),
      expect.any(Error)
    );
  });

  it('updateTaskStatus 遇到 403 权限拒绝时不应降级为本地待同步', async () => {
    const task = new Task({
      id: 'task_viewer_1',
      userId: 'child_1',
      title: '数学',
      type: 'study',
      date: '2026-04-17',
      status: 0,
      points: 1,
      reminder: { enabled: false }
    });
    const service = {
      enableCloudStorage: true,
      taskRepository: {
        getById: jest.fn(async () => task.clone({}, false)),
        save: jest.fn(async (savedTask) => savedTask)
      },
      starService: {
        addStars: jest.fn(async () => ({ success: true })),
        calculateExpiryDate: jest.fn(() => ({ expiryDateStr: '2026-04-24' }))
      },
      _buildTaskPendingSyncMeta: jest.fn((currentTask, action, overrides = {}) => ({
        action,
        operationKey: String(overrides.operationKey || currentTask.modifyTime || Date.now()),
        modifyTime: Number(overrides.modifyTime || currentTask.modifyTime || Date.now()),
        targetUserId: overrides.targetUserId || currentTask.userId || null
      })),
      _syncStatusToCloud: jest.fn(async () => {
        const error = new Error('当前为查看者，不能修改任务状态');
        error.code = 'FAMILY_MANAGER_REQUIRED';
        error.statusCode = 403;
        throw error;
      }),
      _applyAuthoritativeTaskMutation: jest.fn(),
      _emitTaskCloudSyncFailure: jest.fn(),
      _buildTaskServiceMutationResult: jest.fn((mutation, options = {}) => ({
        success: mutation !== null,
        task: options.task,
        fallback: options.fallback === true
      })),
      eventBus: {
        emit: jest.fn()
      }
    };

    const result = await taskWrite.updateTaskStatus(service, 'task_viewer_1', 1, 'child_1');

    expect(result).toEqual({
      success: false,
      message: '当前为查看者，不能修改任务状态',
      code: 'FAMILY_MANAGER_REQUIRED'
    });
    expect(service.taskRepository.save).not.toHaveBeenCalled();
    expect(service._emitTaskCloudSyncFailure).not.toHaveBeenCalled();
  });
});
