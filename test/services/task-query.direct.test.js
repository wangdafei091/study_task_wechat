jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../utils/dateUtils', () => ({
  getTodayString: jest.fn(() => '2026-03-26'),
  getTomorrowString: jest.fn(() => '2026-03-27'),
  formatDate: jest.fn((date) => {
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  })
}));

const query = require('../../services/task-service/task-query');
const { TaskStatus, TaskType } = require('../../models/task');

describe('task-query direct behavior', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('getAllTasks 应覆盖刷新星星失败后的云端主路径', async () => {
    const service = {
      enableCloudStorage: true,
      starService: {
        refreshStarsFromCloud: jest.fn(() => Promise.reject(new Error('refresh fail')))
      },
      _fetchTasksFromCloud: jest.fn(async () => [{ id: 'cloud_1', userId: 'child_1' }]),
      _mergeLocalTasksIntoCloudResult: jest.fn(async (tasks) => tasks),
      taskRepository: {
        getAll: jest.fn(async () => [{ id: 'local_1', userId: 'child_1' }])
      }
    };

    const result = await query.getAllTasks(service, 'child_1', { requireFreshStars: true });

    expect(service.starService.refreshStarsFromCloud).toHaveBeenCalledWith('child_1');
    expect(service._fetchTasksFromCloud).toHaveBeenCalledWith('child_1', { requireFreshStars: true });
    expect(result).toEqual([{ id: 'cloud_1', userId: 'child_1' }]);
  });

  it('getTasksByDate、DateRange、Required 和 Expired 查询应覆盖降级与异常路径', async () => {
    const service = {
      enableCloudStorage: true,
      starService: {
        refreshStarsFromCloud: jest.fn(async () => true)
      },
      _fetchTasksFromCloud: jest.fn()
        .mockRejectedValueOnce(new Error('date cloud fail'))
        .mockRejectedValueOnce(new Error('range cloud fail')),
      _mergeLocalTasksIntoCloudResult: jest.fn(),
      taskRepository: {
        getTasksByDate: jest.fn(async () => [{ id: 'date_local' }]),
        getTasksByDateRange: jest.fn(async () => [{ id: 'range_local' }]),
        getRequiredTasks: jest.fn(() => Promise.reject(new Error('required fail'))),
        getExpiredIncompleteTask: jest.fn(() => Promise.reject(new Error('expired fail')))
      }
    };

    await expect(query.getTasksByDate(service, '2026-03-26', 'child_1', { requireFreshStars: true }))
      .resolves.toEqual([{ id: 'date_local' }]);
    await expect(query.getTasksByDateRange(service, '2026-03-20', '2026-03-26', 'child_1'))
      .resolves.toEqual([{ id: 'range_local' }]);
    await expect(query.getRequiredTasks(service, '2026-03-26', 'child_1')).resolves.toEqual([]);
    await expect(query.getExpiredIncompleteTasks(service, 'child_1')).resolves.toEqual([]);
  });

  it('getOccurrenceTasks 在 includeInactive 云端模式下应拉取全量表现项后再本地过滤', async () => {
    const service = {
      enableCloudStorage: true,
      _fetchTasksFromCloud: jest.fn(async () => [
        {
          id: 'occ_cfg_cloud',
          executionMode: 'occurrence',
          isOccurrenceRecord: false,
          canRecordOccurrenceOn: jest.fn(() => true),
          isOccurrenceConfigTask: jest.fn(() => true)
        }
      ]),
      taskRepository: {
        getOccurrenceTasks: jest.fn(async () => [])
      }
    };

    const result = await query.getOccurrenceTasks(service, {
      date: '2026-03-26',
      userId: 'child_1',
      includeInactive: true
    });

    expect(service._fetchTasksFromCloud).toHaveBeenCalledWith('child_1', {
      includeOccurrence: true,
      occurrenceMode: 'config',
      includeInactive: true
    });
    expect(result.map((item) => item.id)).toEqual(['occ_cfg_cloud']);
  });

  it('getOccurrenceTasks 应覆盖 capability 关闭、月范围过滤和云端失败回退', async () => {
    const disabledService = {
      enableCloudStorage: true,
      isOccurrenceEnabled: jest.fn(async () => false),
      _fetchTasksFromCloud: jest.fn(),
      taskRepository: {
        getAll: jest.fn()
      }
    };

    await expect(query.getOccurrenceTasks(disabledService, {
      date: '2026-03-26',
      userId: 'child_1'
    })).resolves.toEqual([]);
    expect(disabledService._fetchTasksFromCloud).not.toHaveBeenCalled();

    const fallbackService = {
      enableCloudStorage: true,
      isOccurrenceEnabled: jest.fn(async () => true),
      _fetchTasksFromCloud: jest.fn(() => Promise.reject(new Error('cloud fail'))),
      taskRepository: {
        getAll: jest.fn(async () => [
          {
            id: 'occ_in_range',
            userId: 'child_1',
            date: '2026-03-10',
            executionMode: 'occurrence',
            isOccurrenceRecord: false,
            activeRange: { startDate: '2026-03-10', endDate: '2026-03-20', hasNoEndDate: false },
            isOccurrenceConfigTask: jest.fn(() => true)
          },
          {
            id: 'occ_out_range',
            userId: 'child_1',
            date: '2026-02-01',
            executionMode: 'occurrence',
            isOccurrenceRecord: false,
            activeRange: { startDate: '2026-02-01', endDate: '2026-02-05', hasNoEndDate: false },
            isOccurrenceConfigTask: jest.fn(() => true)
          },
          {
            id: 'other_user',
            userId: 'child_2',
            date: '2026-03-12',
            executionMode: 'occurrence',
            isOccurrenceRecord: false,
            activeRange: { startDate: '2026-03-12', endDate: '', hasNoEndDate: true },
            isOccurrenceConfigTask: jest.fn(() => true)
          },
          {
            id: 'planned_task',
            userId: 'child_1',
            date: '2026-03-12',
            executionMode: 'planned',
            isOccurrenceRecord: false,
            isOccurrenceConfigTask: jest.fn(() => false)
          }
        ])
      }
    };

    const result = await query.getOccurrenceTasks(fallbackService, {
      userId: 'child_1',
      startDate: '2026-03-01',
      endDate: '2026-03-31'
    });

    expect(fallbackService._fetchTasksFromCloud).toHaveBeenCalledWith('child_1', {
      includeOccurrence: true,
      occurrenceMode: 'config',
      includeInactive: false,
      startDate: '2026-03-01',
      endDate: '2026-03-31'
    });
    expect(result.map((item) => item.id)).toEqual(['occ_in_range']);
  });

  it('getOccurrenceRecordsByDateRange 应覆盖缺参、语义去重和云端失败回退', async () => {
    const emptyService = {
      enableCloudStorage: false,
      taskRepository: {
        getOccurrenceRecordsByDateRange: jest.fn()
      }
    };
    await expect(query.getOccurrenceRecordsByDateRange(emptyService, {
      startDate: '2026-03-01'
    })).resolves.toEqual([]);
    expect(emptyService.taskRepository.getOccurrenceRecordsByDateRange).not.toHaveBeenCalled();

    const cloudService = {
      enableCloudStorage: true,
      isOccurrenceEnabled: jest.fn(async () => true),
      _fetchTasksFromCloud: jest.fn(async () => [
        {
          id: 'record_cloud_authoritative',
          parentTaskId: 'occ_cfg_same',
          userId: 'child_1',
          date: '2026-03-03',
          executionMode: 'occurrence',
          isOccurrenceRecord: true,
          syncedToCloud: true,
          isOccurrenceRecordTask: jest.fn(() => true)
        }
      ]),
      taskRepository: {
        getOccurrenceRecordsByDateRange: jest.fn(async () => [
          {
            id: 'record_local_pending_legacy',
            parentTaskId: 'occ_cfg_same',
            userId: 'child_1',
            date: '2026-03-03',
            executionMode: 'occurrence',
            isOccurrenceRecord: true,
            pendingSyncMeta: {
              action: 'occurrence_record'
            },
            syncedToCloud: false,
            isOccurrenceRecordTask: jest.fn(() => true)
          },
          {
            id: 'record_local',
            parentTaskId: 'occ_cfg_local',
            userId: 'child_1',
            date: '2026-03-04',
            executionMode: 'occurrence',
            isOccurrenceRecord: true,
            isOccurrenceRecordTask: jest.fn(() => true)
          },
          {
            id: 'config_local',
            executionMode: 'occurrence',
            isOccurrenceRecord: false,
            isOccurrenceRecordTask: jest.fn(() => false)
          }
        ])
      }
    };

    const cloudResult = await query.getOccurrenceRecordsByDateRange(cloudService, {
      userId: 'child_1',
      startDate: '2026-03-01',
      endDate: '2026-03-31'
    });

    expect(cloudService._fetchTasksFromCloud).toHaveBeenCalledWith('child_1', {
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      includeOccurrence: true,
      occurrenceMode: 'record'
    });
    expect(cloudResult.map((item) => item.id)).toEqual(['record_cloud_authoritative', 'record_local']);

    const fallbackService = {
      enableCloudStorage: true,
      isOccurrenceEnabled: jest.fn(async () => true),
      _fetchTasksFromCloud: jest.fn(() => Promise.reject(new Error('record cloud fail'))),
      taskRepository: {
        getOccurrenceRecordsByDateRange: jest.fn(async () => [{ id: 'record_fallback' }])
      }
    };

    await expect(query.getOccurrenceRecordsByDateRange(fallbackService, {
      userId: 'child_1',
      startDate: '2026-03-01',
      endDate: '2026-03-31'
    })).resolves.toEqual([{ id: 'record_fallback' }]);
  });

  it('本地模式查询助手应覆盖 getTodayTasks、getTaskById 和 occurrenceOnly 过滤分支', async () => {
    const regularTask = { id: 'planned_1', userId: 'child_1', type: TaskType.STUDY, status: TaskStatus.PENDING };
    const occurrenceConfigTask = {
      id: 'occ_cfg_local',
      userId: 'child_1',
      executionMode: 'occurrence',
      isOccurrenceRecord: false,
      isOccurrenceConfigTask: jest.fn(() => true)
    };
    const occurrenceRecordTask = {
      id: 'occ_record_local',
      userId: 'child_1',
      executionMode: 'occurrence',
      occurrenceOutcome: 'success',
      isOccurrenceRecord: true,
      isOccurrenceRecordTask: jest.fn(() => true)
    };
    const service = {
      enableCloudStorage: false,
      taskRepository: {
        getAll: jest.fn(async () => [regularTask, occurrenceConfigTask, occurrenceRecordTask]),
        getById: jest.fn(async (taskId) => (taskId === 'planned_1' ? regularTask : null)),
        getTasksByDate: jest.fn(async () => [regularTask, occurrenceConfigTask, occurrenceRecordTask])
      },
      getTasksByDate: jest.fn((date, userId, options) => query.getTasksByDate(service, date, userId, options)),
      getOccurrenceRecordsByDateRange: jest.fn(async () => [occurrenceRecordTask])
    };

    await expect(query.getTaskById(service, 'planned_1', 'child_1')).resolves.toEqual(regularTask);
    await expect(query.getTodayTasks(service, 'child_1', { occurrenceOnly: true })).resolves.toEqual([
      occurrenceConfigTask,
      occurrenceRecordTask
    ]);
    await expect(query.getAllTasks(service, 'child_1', { includeOccurrence: true })).resolves.toEqual([
      regularTask,
      occurrenceConfigTask,
      occurrenceRecordTask
    ]);

    const progress = await query.calculateTaskProgress(service, [
      regularTask,
      occurrenceConfigTask,
      occurrenceRecordTask
    ]);
    expect(progress.stats.totalTasks).toBe(2);
    expect(progress.stats.completedTasks).toBe(1);
  });

  it('getOccurrenceTasks 与 getOccurrenceRecordsByDateRange 应覆盖本地分支、能力关闭和异常回退', async () => {
    const localOccurrenceTask = {
      id: 'occ_cfg_local',
      userId: 'child_1',
      date: '2026-03-05',
      executionMode: 'occurrence',
      isOccurrenceRecord: false,
      activeRange: { startDate: '2026-03-05', endDate: '2026-03-10', hasNoEndDate: false },
      canRecordOccurrenceOn: jest.fn(() => false),
      isOccurrenceConfigTask: jest.fn(() => true)
    };
    const localInactiveTask = {
      id: 'occ_cfg_inactive',
      userId: 'child_1',
      date: '2026-02-01',
      executionMode: 'occurrence',
      isOccurrenceRecord: false,
      activeRange: { startDate: '2026-02-01', endDate: '2026-02-05', hasNoEndDate: false },
      canRecordOccurrenceOn: jest.fn(() => false),
      isOccurrenceConfigTask: jest.fn(() => true)
    };
    const localService = {
      enableCloudStorage: false,
      taskRepository: {
        getAll: jest.fn(async () => [localOccurrenceTask, localInactiveTask]),
        getOccurrenceTasks: jest.fn(async () => [localOccurrenceTask]),
        getOccurrenceRecordsByDateRange: jest.fn(async () => [{ id: 'record_local_1' }])
      }
    };

    await expect(query.getOccurrenceTasks(localService, {
      userId: 'child_1',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      includeInactive: true
    })).resolves.toEqual([localOccurrenceTask, localInactiveTask]);
    await expect(query.getOccurrenceTasks(localService, {
      date: '2026-03-05',
      userId: 'child_1'
    })).resolves.toEqual([localOccurrenceTask]);

    const disabledCloudService = {
      enableCloudStorage: true,
      isOccurrenceEnabled: jest.fn(async () => false),
      taskRepository: {
        getOccurrenceRecordsByDateRange: jest.fn(async () => [{ id: 'record_should_not_load' }])
      }
    };
    await expect(query.getOccurrenceRecordsByDateRange(disabledCloudService, {
      userId: 'child_1',
      startDate: '2026-03-01',
      endDate: '2026-03-31'
    })).resolves.toEqual([]);

    const failedLocalService = {
      enableCloudStorage: false,
      taskRepository: {
        getAll: jest.fn(() => Promise.reject(new Error('local occ fail')))
      }
    };
    await expect(query.getOccurrenceTasks(failedLocalService, {
      userId: 'child_1',
      startDate: '2026-03-01',
      endDate: '2026-03-31'
    })).resolves.toEqual([]);
  });

  it('scope 与 pending local 助手应覆盖 userId/currentUser/no-child 等过滤分支', async () => {
    const service = {
      enableCloudStorage: false,
      getAllTasks: jest.fn(async (userId) => [{ id: `task_${userId || 'all'}` }]),
      taskRepository: {
        getAll: jest.fn(async () => [
          { id: 'task_child_pending', userId: 'child_1', syncedToCloud: false },
          { id: 'task_parent_pending', userId: 'parent_1', syncedToCloud: false },
          { id: 'task_synced', userId: 'child_1', syncedToCloud: true }
        ])
      },
      userService: {
        getAllUsers: jest.fn(() => [{ userId: 'parent_1', role: 'parent', status: 'active' }]),
        getCurrentUser: jest.fn(() => ({ userId: 'parent_1', role: 'parent' })),
        getCurrentUserId: jest.fn(() => 'parent_1')
      }
    };

    await expect(query.getTasksByScope(service, { userId: 'child_1' })).resolves.toEqual([{ id: 'task_child_1' }]);
    await expect(query.getChildTasksByScope(service, { userId: 'child_1' })).resolves.toEqual([{ id: 'task_child_1' }]);
    await expect(query.getPendingLocalTasksByScope(service, {})).resolves.toEqual([
      { id: 'task_parent_pending', userId: 'parent_1', syncedToCloud: false }
    ]);
    await expect(query.getPendingLocalTasksByScope(service, { userId: 'child_1' })).resolves.toEqual([
      { id: 'task_child_pending', userId: 'child_1', syncedToCloud: false }
    ]);
    await expect(query.getChildTasksByScope(service, { scope: 'family' })).resolves.toEqual([]);
    await expect(query.getPendingLocalChildTasksByScope(service, { scope: 'family' })).resolves.toEqual([]);
  });

  it('calculateTaskProgress 在获取今日任务失败时应返回默认值', async () => {
    const service = {
      getTodayTasks: jest.fn(() => Promise.reject(new Error('today fail')))
    };

    const result = await query.calculateTaskProgress(service);

    expect(result).toEqual({
      taskProgress: { habit: 0, study: 0, interest: 0 },
      stats: {
        totalTasks: 0,
        completedTasks: 0,
        completionRate: 0,
        typeCounts: { habit: 0, study: 0, interest: 0 }
      }
    });
  });

  it('calculateTaskProgress 不应把待同步表现记录计入最终进度', async () => {
    const occurrencePendingRecord = {
      id: 'occ_record_pending',
      type: 'study',
      occurrenceOutcome: 'success',
      syncedToCloud: false,
      pendingSyncMeta: { action: 'occurrence_record' },
      isOccurrenceRecordTask: jest.fn(() => true),
      isOccurrenceConfigTask: jest.fn(() => false)
    };
    const occurrenceSyncedRecord = {
      id: 'occ_record_synced',
      type: 'study',
      occurrenceOutcome: 'failure',
      syncedToCloud: true,
      isOccurrenceRecordTask: jest.fn(() => true),
      isOccurrenceConfigTask: jest.fn(() => false)
    };
    const regularTask = {
      id: 'task_1',
      type: 'habit',
      status: 1,
      isOccurrenceRecordTask: jest.fn(() => false),
      isOccurrenceConfigTask: jest.fn(() => false)
    };

    const result = await query.calculateTaskProgress({}, [
      regularTask,
      occurrencePendingRecord,
      occurrenceSyncedRecord
    ]);

    expect(result.stats.totalTasks).toBe(2);
    expect(result.stats.completedTasks).toBe(1);
    expect(result.taskProgress.habit).toBe(100);
    expect(result.taskProgress.study).toBe(0);
  });

  it('checkUpcomingTasks 应覆盖全天提醒、普通提醒和跳过分支', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-25T21:00:00'));

    const service = {
      taskRepository: {
        getTasksByDateRange: jest.fn(async () => [
          {
            id: 'completed_1',
            title: '已完成任务',
            status: TaskStatus.COMPLETED,
            type: TaskType.STUDY
          },
          {
            id: 'remind_all_day',
            title: '全天提醒任务',
            date: '2026-03-26',
            status: TaskStatus.PENDING,
            type: TaskType.HABIT,
            reminder: { enabled: true, time: -1 }
          },
          {
            id: 'timed_future',
            title: '未来提醒任务',
            date: '2026-03-26',
            startTime: '23:30',
            status: TaskStatus.PENDING,
            type: TaskType.INTEREST,
            reminder: { enabled: true, time: 30 }
          },
          {
            id: 'all_day_skip',
            title: '全天但提醒类型不支持',
            date: '2026-03-26',
            status: TaskStatus.PENDING,
            type: TaskType.STUDY,
            reminder: { enabled: true, time: 60 }
          },
          {
            id: 'no_reminder',
            title: '无提醒任务',
            date: '2026-03-26',
            status: TaskStatus.PENDING,
            type: TaskType.STUDY
          }
        ])
      },
      eventBus: {
        emit: jest.fn()
      }
    };

    const result = await query.checkUpcomingTasks(service);

    expect(result).toEqual(expect.objectContaining({
      success: true,
      count: 1
    }));
    expect(service.taskRepository.getTasksByDateRange).toHaveBeenCalledWith('2026-03-26', '2026-03-27', null);
    expect(service.eventBus.emit).toHaveBeenCalledTimes(1);
  });

  it('getTaskStatistics、DailyStats、Streak 和 Scope 查询应覆盖辅助分支', async () => {
    const tasks = [
      { id: '1', date: '2026-03-25', type: TaskType.HABIT, status: TaskStatus.COMPLETED },
      { id: '2', date: '2026-03-26', type: TaskType.STUDY, status: TaskStatus.COMPLETED },
      { id: '3', date: '2026-03-26', type: TaskType.INTEREST, status: TaskStatus.OVERDUE },
      { id: '4', type: TaskType.INTEREST, status: TaskStatus.PENDING }
    ];
    const service = {
      getAllTasks: jest.fn(async () => tasks),
      getTasksByScope: jest.fn(async () => tasks),
      getTasksByDateRange: jest.fn(async () => tasks),
      _calculateStreak: jest.fn(async () => 1),
      _calculateDailyStats: query.calculateDailyStats
    };

    const allStats = await query.getTaskStatistics(service);
    const scopeStats = await query.getTaskStatistics(service, {}, { scope: 'family' });
    const rangeStats = await query.getTaskStatistics(service, {
      startDate: '2026-03-25',
      endDate: '2026-03-26'
    }, { userId: 'child_1' });
    const dailyStats = query.calculateDailyStats(tasks);
    const streak = await query.calculateStreak(tasks);

    expect(allStats.totalTasks).toBe(4);
    expect(scopeStats.totalTasks).toBe(4);
    expect(rangeStats.totalTasks).toBe(4);
    expect(dailyStats).toEqual([
      expect.objectContaining({ date: '2026-03-25', completionRate: 100 }),
      expect.objectContaining({ date: '2026-03-26', completionRate: 50 })
    ]);
    expect(streak).toBe(2);
  });

  it('getTaskStatistics 和 getTasksByScope 失败时应返回默认值', async () => {
    const service = {
      getAllTasks: jest.fn(() => Promise.reject(new Error('all fail'))),
      _calculateStreak: jest.fn(async () => 0),
      _calculateDailyStats: jest.fn(() => []),
      enableCloudStorage: true,
      _fetchTasksFromCloud: jest.fn(() => Promise.reject(new Error('family fail'))),
      taskRepository: {
        getAll: jest.fn(() => Promise.reject(new Error('repo fail')))
      }
    };
    const fallbackService = {
      enableCloudStorage: false,
      getAllTasks: jest.fn(() => {
        throw new Error('sync getAll fail');
      })
    };

    const stats = await query.getTaskStatistics(service);
    const fallbackTasks = await query.getTasksByScope(fallbackService, {});

    expect(stats).toEqual(expect.objectContaining({
      totalTasks: 0,
      dailyStats: []
    }));
    await expect(query.getTasksByScope(service, { scope: 'family' })).resolves.toEqual([]);
    expect(fallbackTasks).toEqual([]);
  });

  it('getTasksByScope 在 family 云端模式下应合并本地未同步任务', async () => {
    const service = {
      enableCloudStorage: true,
      _fetchTasksFromCloud: jest.fn(async () => [
        { id: 'cloud_1', title: '云端任务', userId: 'child_1' }
      ]),
      taskRepository: {
        getAll: jest.fn(async () => [
          { id: 'cloud_1', title: '云端任务', userId: 'child_1' },
          { id: 'local_1', title: '本地孩子任务', userId: 'child_1' },
          { id: 'local_parent', title: '本地家长任务', userId: 'parent_1' }
        ])
      },
      userService: {
        getAllUsers: jest.fn(() => [
          { userId: 'parent_1', role: 'parent', status: 'active' },
          { userId: 'child_1', role: 'child', status: 'active' }
        ])
      }
    };

    const result = await query.getTasksByScope(service, { scope: 'family' });

    expect(result.map((item) => item.id)).toEqual(['cloud_1', 'local_1', 'local_parent']);
  });

  it('getChildTasksByScope 在 family 场景下应只保留当前家庭孩子任务', async () => {
    const service = {
      enableCloudStorage: true,
      _fetchTasksFromCloud: jest.fn(async () => [
        { id: 'cloud_1', title: '云端任务', userId: 'child_1' }
      ]),
      taskRepository: {
        getAll: jest.fn(async () => [
          { id: 'cloud_1', title: '云端任务', userId: 'child_1' },
          { id: 'local_1', title: '本地孩子任务', userId: 'child_1' },
          { id: 'local_parent', title: '本地家长任务', userId: 'parent_1' }
        ])
      },
      userService: {
        getAllUsers: jest.fn(() => [
          { userId: 'parent_1', role: 'parent', status: 'active' },
          { userId: 'child_1', role: 'child', status: 'active' }
        ])
      }
    };

    const result = await query.getChildTasksByScope(service, { scope: 'family' });

    expect(result.map((item) => item.id)).toEqual(['cloud_1', 'local_1']);
  });

  it('getPendingLocalTasksByScope 在 family 场景下应返回全部待同步本地任务', async () => {
    const service = {
      taskRepository: {
        getAll: jest.fn(async () => [
          { id: 'task_child_pending', userId: 'child_1', syncedToCloud: false },
          { id: 'task_child_synced', userId: 'child_1', syncedToCloud: true },
          { id: 'task_parent_pending', userId: 'parent_1', syncedToCloud: false },
          { id: 'task_other_pending', userId: 'child_9', pendingSyncMeta: { action: 'create' } }
        ])
      },
      userService: {
        getAllUsers: jest.fn(() => [
          { userId: 'parent_1', role: 'parent', status: 'active' },
          { userId: 'child_1', role: 'child', status: 'active' }
        ]),
        getCurrentUser: jest.fn(() => ({ userId: 'parent_1', role: 'parent' })),
        getCurrentUserId: jest.fn(() => 'parent_1')
      }
    };

    const result = await query.getPendingLocalTasksByScope(service, { scope: 'family' });

    expect(result.map((task) => task.id)).toEqual([
      'task_child_pending',
      'task_parent_pending',
      'task_other_pending'
    ]);
  });

  it('getPendingLocalChildTasksByScope 应只返回当前家庭孩子的待同步任务', async () => {
    const service = {
      taskRepository: {
        getAll: jest.fn(async () => [
          { id: 'task_child_pending', userId: 'child_1', syncedToCloud: false },
          { id: 'task_child_synced', userId: 'child_1', syncedToCloud: true },
          { id: 'task_parent_pending', userId: 'parent_1', syncedToCloud: false },
          { id: 'task_other_pending', userId: 'child_9', pendingSyncMeta: { action: 'create' } }
        ])
      },
      userService: {
        getAllUsers: jest.fn(() => [
          { userId: 'parent_1', role: 'parent', status: 'active' },
          { userId: 'child_1', role: 'child', status: 'active' }
        ]),
        getCurrentUser: jest.fn(() => ({ userId: 'parent_1', role: 'parent' })),
        getCurrentUserId: jest.fn(() => 'parent_1')
      }
    };

    const result = await query.getPendingLocalChildTasksByScope(service, { scope: 'family' });

    expect(result.map((task) => task.id)).toEqual(['task_child_pending']);
  });
});
