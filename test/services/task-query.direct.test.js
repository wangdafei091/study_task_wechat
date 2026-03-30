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
    await expect(query.getTasksByScope(service, { scope: 'family' })).rejects.toThrow('family fail');
    expect(fallbackTasks).toEqual([]);
  });
});
