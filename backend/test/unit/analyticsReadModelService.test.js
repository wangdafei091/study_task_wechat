jest.mock('../../services/taskService');
jest.mock('../../services/starService');
jest.mock('../../services/familyService');
jest.mock('../../services/starExpiryGovernanceService');
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
}));

const taskService = require('../../services/taskService');
const starService = require('../../services/starService');
const familyService = require('../../services/familyService');
const starExpiryGovernanceService = require('../../services/starExpiryGovernanceService');
const analyticsReadModelService = require('../../services/analyticsReadModelService');

describe('AnalyticsReadModelService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-12T10:00:00Z'));
    analyticsReadModelService._authoritySyncCache.clear();
    analyticsReadModelService._authoritySyncInflight.clear();
    starExpiryGovernanceService.syncExpiryAuthority = jest.fn().mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('应生成 user authoritative snapshot', async () => {
    taskService.getTasksByUser = jest.fn().mockResolvedValue([
      {
        taskId: 'task_1',
        userId: 'child_1',
        title: '晨读',
        type: 'study',
        date: '2026-04-10',
        status: 1,
        points: 2
      }
    ]);
    starService.getStarRecordsByUser = jest.fn().mockResolvedValue([
      {
        recordId: 'record_1',
        userId: 'child_1',
        type: 'income',
        source: 'task',
        points: 2,
        modifyTime: new Date('2026-04-10T09:00:00Z').getTime()
      }
    ]);
    starService.getStarGroupsByUser = jest.fn().mockResolvedValue([
      {
        groupId: 'group_1',
        userId: 'child_1',
        type: 'week',
        stars: 5,
        expiryDate: '2026-04-15'
      }
    ]);

    const result = await analyticsReadModelService.queryReadModel({
      scope: 'user',
      monthKey: '2026-04',
      trendDays: 7,
      userId: 'child_1'
    }, {
      viewerUserId: 'parent_1',
      viewerRole: 'parent',
      familyId: 'fam_1'
    });

    expect(starExpiryGovernanceService.syncExpiryAuthority).toHaveBeenCalledWith({
      viewerUserId: 'parent_1',
      viewerRole: 'parent',
      familyId: 'fam_1',
      scope: 'user',
      targetUserId: 'child_1'
    });
    expect(result.snapshot).toEqual(expect.objectContaining({
      scope: 'user',
      currentBalance: 5,
      mode: 'authoritative',
      subjectUserIds: ['child_1']
    }));
    expect(result.snapshot.tasks[0]).toEqual(expect.objectContaining({
      id: 'task_1',
      taskId: 'task_1'
    }));
    expect(result.snapshot.records[0]).toEqual(expect.objectContaining({
      id: 'record_1',
      recordId: 'record_1'
    }));
    expect(result.snapshot.historyData).toHaveLength(7);
    expect(result.snapshot.forecastData.length).toBeGreaterThan(0);
  });

  it('family 查询应按 childUserIds 过滤任务、流水和分组', async () => {
    familyService.getFamilyMembers = jest.fn().mockResolvedValue([
      { userId: 'child_1', role: 'child' },
      { userId: 'child_2', role: 'child' }
    ]);
    taskService.getTasksByFamily = jest.fn().mockResolvedValue([
      { taskId: 'task_1', userId: 'child_1', title: '语文', type: 'study', date: '2026-04-10', points: 1 },
      { taskId: 'task_2', userId: 'child_2', title: '数学', type: 'study', date: '2026-04-11', points: 2 }
    ]);
    starService.getFamilyStarRecords = jest.fn().mockResolvedValue([
      {
        recordId: 'record_1',
        userId: 'child_1',
        type: 'income',
        source: 'task',
        points: 1,
        modifyTime: new Date('2026-04-10T08:00:00Z').getTime()
      },
      {
        recordId: 'record_2',
        userId: 'child_2',
        type: 'income',
        source: 'task',
        points: 2,
        modifyTime: new Date('2026-04-11T08:00:00Z').getTime()
      }
    ]);
    starService.getFamilyStarSummary = jest.fn().mockResolvedValue({
      subjectUserIds: ['child_1', 'child_2'],
      totalPoints: 3,
      groups: [
        { groupId: 'group_1', userId: 'child_1', type: 'week', stars: 1, expiryDate: '2026-04-14' },
        { groupId: 'group_2', userId: 'child_2', type: 'week', stars: 2, expiryDate: '2026-04-15' }
      ]
    });

    const result = await analyticsReadModelService.queryReadModel({
      scope: 'family',
      monthKey: '2026-04',
      trendDays: 7,
      childUserIds: ['child_2']
    }, {
      viewerUserId: 'parent_1',
      viewerRole: 'parent',
      familyId: 'fam_1'
    });

    expect(result.snapshot).toEqual(expect.objectContaining({
      scope: 'family',
      currentBalance: 2,
      subjectUserIds: ['child_2']
    }));
    expect(result.snapshot.tasks).toHaveLength(1);
    expect(result.snapshot.tasks[0].userId).toBe('child_2');
    expect(result.snapshot.records).toHaveLength(1);
    expect(result.snapshot.records[0].userId).toBe('child_2');
    expect(result.snapshot.familyGroupSnapshots).toEqual({
      child_2: [
        expect.objectContaining({
          userId: 'child_2',
          stars: 2
        })
      ]
    });
  });

  it('family 查询遇到越权 childUserIds 应拒绝', async () => {
    familyService.getFamilyMembers = jest.fn().mockResolvedValue([
      { userId: 'child_1', role: 'child' }
    ]);

    await expect(
      analyticsReadModelService.queryReadModel({
        scope: 'family',
        monthKey: '2026-04',
        trendDays: 7,
        childUserIds: ['child_2']
      }, {
        viewerUserId: 'parent_1',
        viewerRole: 'parent',
        familyId: 'fam_1'
      })
    ).rejects.toMatchObject({
      code: 'FAMILY_MEMBER_ACCESS_DENIED'
    });
  });

  it('family 显式传空 childUserIds 时应直接返回空 snapshot 且不触发 authority sync', async () => {
    familyService.getFamilyMembers = jest.fn().mockResolvedValue([
      { userId: 'child_1', role: 'child' }
    ]);

    const result = await analyticsReadModelService.queryReadModel({
      scope: 'family',
      monthKey: '2026-04',
      trendDays: 7,
      childUserIds: []
    }, {
      viewerUserId: 'parent_1',
      viewerRole: 'parent',
      familyId: 'fam_1'
    });

    expect(starExpiryGovernanceService.syncExpiryAuthority).not.toHaveBeenCalled();
    expect(result.snapshot).toEqual(expect.objectContaining({
      scope: 'family',
      subjectUserIds: [],
      currentBalance: 0,
      historyData: [],
      forecastData: []
    }));
  });

  it('时区边界记录应按北京时间归属到正确月份', async () => {
    taskService.getTasksByUser = jest.fn().mockResolvedValue([]);
    starService.getStarRecordsByUser = jest.fn().mockResolvedValue([
      {
        recordId: 'record_tz_1',
        userId: 'child_1',
        type: 'income',
        source: 'task',
        points: 2,
        modifyTime: new Date('2026-03-31T16:30:00Z').getTime()
      }
    ]);
    starService.getStarGroupsByUser = jest.fn().mockResolvedValue([]);

    const result = await analyticsReadModelService.queryReadModel({
      scope: 'user',
      monthKey: '2026-04',
      trendDays: 7,
      userId: 'child_1'
    }, {
      viewerUserId: 'parent_1',
      viewerRole: 'parent',
      familyId: 'fam_1'
    });

    expect(result.snapshot.records).toHaveLength(1);
    expect(result.snapshot.records[0]).toEqual(expect.objectContaining({
      recordId: 'record_tz_1'
    }));
  });

  it('应生成 user task completion stats', async () => {
    taskService.getTasksByUser = jest.fn().mockResolvedValue([
      { taskId: 'task_1', userId: 'child_1', type: 'study', date: '2026-04-12', status: 1 },
      { taskId: 'task_2', userId: 'child_1', type: 'habit', date: '2026-04-12', status: 0 },
      { taskId: 'task_3', userId: 'child_1', type: 'interest', date: '2026-04-01', status: 1 }
    ]);

    const result = await analyticsReadModelService.queryTaskCompletionStats({
      scope: 'user',
      userId: 'child_1',
      dateRange: 'today'
    }, {
      viewerUserId: 'parent_1',
      viewerRole: 'parent',
      familyId: 'fam_1'
    });

    expect(taskService.getTasksByUser).toHaveBeenCalledWith('child_1');
    expect(result).toEqual({
      stats: {
        totalTasks: 2,
        completedTasks: 1,
        completionRate: '50.0',
        typeCounts: {
          study: 1,
          habit: 1,
          interest: 0
        },
        statusCounts: {
          pending: 1,
          completed: 1
        }
      }
    });
  });

  it('family 即将过期查询当前应返回空 items', async () => {
    familyService.getFamilyMembers = jest.fn().mockResolvedValue([
      { userId: 'child_1', role: 'child' }
    ]);

    const result = await analyticsReadModelService.queryUpcomingExpiry({
      scope: 'family',
      childUserIds: ['child_1'],
      days: 7
    }, {
      viewerUserId: 'parent_1',
      viewerRole: 'parent',
      familyId: 'fam_1'
    });

    expect(result).toEqual({ items: [] });
    expect(starService.getStarGroupsByUser).not.toHaveBeenCalled();
  });

  it('应生成 user 即将过期星星列表', async () => {
    starService.getStarGroupsByUser = jest.fn().mockResolvedValue([
      {
        groupId: 'group_1',
        userId: 'child_1',
        type: 'temporary',
        stars: 2,
        expiryType: 'week',
        expiryDate: '2026-04-13'
      },
      {
        groupId: 'group_2',
        userId: 'child_1',
        type: 'temporary',
        stars: 3,
        expiryType: 'week',
        expiryDate: '2026-04-20'
      }
    ]);

    const result = await analyticsReadModelService.queryUpcomingExpiry({
      scope: 'user',
      userId: 'child_1',
      days: 3
    }, {
      viewerUserId: 'parent_1',
      viewerRole: 'parent',
      familyId: 'fam_1'
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(expect.objectContaining({
      points: 2,
      expiryDateStr: '2026-04-13',
      type: 'temporary'
    }));
  });

  it('应生成 user task star calendar records', async () => {
    taskService.getTasksByUser = jest.fn().mockResolvedValue([
      {
        taskId: 'task_1',
        userId: 'child_1',
        title: '晨读',
        date: '2026-04-12',
        status: 1,
        starAwarded: true,
        points: 2,
        completionTime: new Date('2026-04-12T00:30:00Z').getTime()
      },
      {
        taskId: 'task_2',
        userId: 'child_1',
        title: '整理桌面',
        date: '2026-04-11',
        status: 0,
        penaltyApplied: true,
        penaltyDeductedPoints: 3,
        penaltyRefunded: true,
        penaltyRefundTime: new Date('2026-04-12T09:00:00Z').getTime()
      }
    ]);

    const result = await analyticsReadModelService.queryTaskStarCalendar({
      scope: 'user',
      userId: 'child_1'
    }, {
      viewerUserId: 'parent_1',
      viewerRole: 'parent',
      familyId: 'fam_1'
    });

    expect(result.records).toHaveLength(3);
    expect(result.records[0]).toEqual(expect.objectContaining({
      title: '逾期补做退星：整理桌面',
      points: 3,
      source: 'task_makeup_refund'
    }));
    expect(result.records[1]).toEqual(expect.objectContaining({
      title: '完成任务：晨读',
      points: 2,
      source: 'task',
      time: '2026-04-12 08:30:00'
    }));
    expect(result.records[2]).toEqual(expect.objectContaining({
      title: '未完成必做任务：整理桌面',
      points: -3,
      source: 'task'
    }));
  });
});
