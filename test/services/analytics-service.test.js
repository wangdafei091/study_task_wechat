/**
 * analytics-service.test.js - AnalyticsService 测试
 */

jest.mock('../../utils/logger');
jest.mock('../../utils/http-client', () => ({
  post: jest.fn()
}));
jest.mock('../../utils/core/event-bus', () => jest.fn(() => ({
  emit: jest.fn(),
  on: jest.fn(),
  off: jest.fn()
})));

const AnalyticsService = require('../../services/analytics-service');
const HttpClient = require('../../utils/http-client');
const logger = require('../../utils/logger');
const { Task } = require('../../models/task');
const { StarRecord } = require('../../models/star-record');

function buildCloudSnapshot(overrides = {}) {
  return {
    scope: 'user',
    scopeKey: 'user:child-1',
    subjectUserIds: ['child-1'],
    monthKey: '2026-03',
    days: 7,
    signature: 'cloud-signature',
    refreshedAt: new Date('2026-03-21T12:00:00').getTime(),
    expiresAt: new Date('2026-03-21T12:00:30').getTime(),
    currentBalance: 5,
    mode: 'authoritative',
    tasks: [],
    records: [],
    familyGroupSnapshots: undefined,
    historyData: [
      {
        date: '3/21',
        value: 5,
        earned: 5,
        spent: 0,
        penalty: 0
      }
    ],
    forecastData: [
      {
        date: '3/21',
        value: 5,
        expiring: 0
      }
    ],
    ...overrides
  };
}

describe('AnalyticsService', () => {
  let analyticsService;
  let mockStarService;
  let mockTaskService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-21T12:00:00'));

    mockStarService = {
      enableCloudStorage: true,
      hasPendingLocalStarRecords: jest.fn().mockResolvedValue(false),
      getStarRecords: jest.fn().mockResolvedValue([
        {
          id: 'record-1',
          points: 5,
          timestamp: new Date('2026-03-21T09:00:00').getTime(),
          source: 'task',
          type: 'income'
        }
      ]),
      getStarGroups: jest.fn().mockResolvedValue([]),
      getStarRecordsByDateRange: jest.fn().mockResolvedValue([]),
      refreshStarsFromCloud: jest.fn().mockResolvedValue({ success: true, records: [], groups: [] }),
      syncExpiryAuthorityIfNeeded: jest.fn().mockResolvedValue({ success: true, skipped: false }),
      getFamilyStarSummary: jest.fn().mockResolvedValue({
        success: true,
        scope: 'family',
        subjectUserIds: ['child-1'],
        totalPoints: 0,
        groups: []
      })
    };

    HttpClient.post.mockResolvedValue({
      snapshot: buildCloudSnapshot()
    });

    mockTaskService = {
      enableCloudStorage: true,
      getTasksByScope: jest.fn().mockResolvedValue([]),
      getTasksByDateRange: jest.fn().mockResolvedValue([]),
      userService: {
        getAllUsers: jest.fn().mockReturnValue([
          { userId: 'parent-1', role: 'parent', status: 'active' },
          { userId: 'child-1', role: 'child', status: 'active' },
          { userId: 'child-2', role: 'child', status: 'active' }
        ])
      },
      taskRepository: {
        getTasksByDateRange: jest.fn().mockResolvedValue([])
      }
    };

    analyticsService = new AnalyticsService({
      starService: mockStarService,
      taskService: mockTaskService
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('calculateHistoricalBalance', () => {
    it('prepareReadModel 应在 TTL 内复用已准备快照', async () => {
      const first = await analyticsService.prepareReadModel({
        analysisOptions: { userId: 'child-1' },
        monthKey: '2026-03',
        days: 7,
        force: false
      });
      const second = await analyticsService.prepareReadModel({
        analysisOptions: { userId: 'child-1' },
        monthKey: '2026-03',
        days: 7,
        force: false
      });

      expect(first.snapshot.signature).toBe(second.snapshot.signature);
      expect(HttpClient.post).toHaveBeenCalledTimes(1);
      expect(HttpClient.post).toHaveBeenCalledWith('/api/analytics/read-model/query', {
        scope: 'user',
        monthKey: '2026-03',
        trendDays: 7,
        userId: 'child-1'
      });
    });

    it('单用户分析应只读取对应 userId 的 star groups', async () => {
      mockStarService.getStarGroups.mockResolvedValue([
        {
          id: 'group-1',
          stars: 3,
          expiryType: 'week',
          expiryDate: new Date('2026-03-22T12:00:00').getTime()
        }
      ]);

      const result = await analyticsService.calculateHistoricalBalance(1, 'child-1', {
        userId: 'child-1'
      });

      expect(mockStarService.getStarRecords).toHaveBeenCalledWith({ userId: 'child-1' });
      expect(mockStarService.getStarGroups).toHaveBeenCalledWith('child-1');
      expect(result.historyData).toHaveLength(1);
      expect(result.forecastData.length).toBeGreaterThan(0);
    });

    it('单用户分析应以当前活跃分组余额作为趋势图当前值，并与过期预测保持一致', async () => {
      mockStarService.getStarRecords.mockResolvedValue([
        {
          id: 'record-1',
          points: 26,
          timestamp: new Date('2026-03-21T09:00:00').getTime(),
          source: 'task',
          type: 'income'
        }
      ]);
      mockStarService.getStarGroups.mockResolvedValue([
        {
          id: 'group-1',
          stars: 14,
          expiryType: 'week',
          expiryDate: new Date('2026-03-22T12:00:00').getTime()
        },
        {
          id: 'group-2',
          stars: 3,
          expiryType: 'week',
          expiryDate: new Date('2026-03-22T12:00:00').getTime()
        }
      ]);

      const result = await analyticsService.calculateHistoricalBalance(1, 'child-1', {
        userId: 'child-1'
      });

      expect(result.historyData).toEqual([
        expect.objectContaining({
          value: 17,
          earned: 26,
          spent: 0,
          penalty: 0
        })
      ]);
      expect(result.forecastData[result.forecastData.length - 1]).toEqual(
        expect.objectContaining({ value: 0 })
      );
      expect(logger.warn).toHaveBeenCalledWith(
        'AnalyticsService',
        '检测到星星流水净额与活跃分组快照不一致，趋势图将以当前活跃分组为准',
        expect.objectContaining({
          userId: 'child-1',
          recordsBalance: 26,
          groupsBalance: 17,
          difference: 9
        })
      );
    });

    it('家庭分析命中 authoritative snapshot 时应直接返回 snapshot 中的趋势数据', async () => {
      const familySnapshot = buildCloudSnapshot({
        scope: 'family',
        scopeKey: 'family:child-1',
        subjectUserIds: ['child-1'],
        currentBalance: 3,
        familyGroupSnapshots: {
          'child-1': [
            {
              groupId: 'group-1',
              userId: 'child-1',
              stars: 3,
              expiryType: 'week',
              expiryDate: '2026-03-22'
            }
          ]
        },
        historyData: [
          {
            date: '3/21',
            value: 3,
            earned: 7,
            spent: 0,
            penalty: 0
          }
        ],
        forecastData: [
          {
            date: '3/22',
            value: 0,
            expiring: 3
          }
        ]
      });
      HttpClient.post.mockResolvedValueOnce({ snapshot: familySnapshot });

      await analyticsService.prepareReadModel({
        analysisOptions: {
          scope: 'family',
          childUserIds: ['child-1']
        },
        monthKey: '2026-03',
        days: 7,
        force: true
      });

      const result = await analyticsService.calculateHistoricalBalance(7, null, {
        scope: 'family',
        childUserIds: ['child-1']
      });

      expect(result).toEqual({
        historyData: familySnapshot.historyData,
        forecastData: familySnapshot.forecastData
      });
      expect(mockStarService.getStarRecords).not.toHaveBeenCalled();
      expect(mockStarService.getFamilyStarSummary).not.toHaveBeenCalled();
    });

    it('family prepare 应通过后端 read model 接口获取 authoritative snapshot', async () => {
      HttpClient.post.mockResolvedValueOnce({
        snapshot: buildCloudSnapshot({
          scope: 'family',
          scopeKey: 'family:child-1',
          subjectUserIds: ['child-1']
        })
      });

      await analyticsService.prepareReadModel({
        analysisOptions: {
          scope: 'family',
          childUserIds: ['child-1']
        },
        monthKey: '2026-03',
        days: 7,
        force: true
      });

      expect(HttpClient.post).toHaveBeenCalledWith('/api/analytics/read-model/query', {
        scope: 'family',
        monthKey: '2026-03',
        trendDays: 7,
        childUserIds: ['child-1']
      });
      expect(mockStarService.syncExpiryAuthorityIfNeeded).not.toHaveBeenCalled();
      expect(mockStarService.refreshStarsFromCloud).not.toHaveBeenCalled();
      expect(mockStarService.getFamilyStarSummary).not.toHaveBeenCalled();
    });

    it('云端 authoritative snapshot 应适配为 Task 与 StarRecord 实例且不回退', async () => {
      HttpClient.post.mockResolvedValueOnce({
        snapshot: buildCloudSnapshot({
          tasks: [
            {
              id: 'task-cloud-1',
              userId: 'child-1',
              title: '云端任务',
              type: 'study',
              date: '2026-03-21',
              startTime: '09:00',
              endTime: '10:00',
              isAllDay: false,
              reminder: { enabled: true, time: 15 },
              status: 1,
              points: 2,
              starAwarded: true,
              repeat: { type: 'none' },
              createdAt: '2026-03-20T10:00:00.000Z',
              modifyTime: new Date('2026-03-21T10:00:00.000Z').getTime()
            }
          ],
          records: [
            {
              id: 'record-cloud-1',
              userId: 'child-1',
              type: 'income',
              source: 'task',
              points: 2,
              timestamp: new Date('2026-03-21T10:00:00.000Z').getTime(),
              description: '完成任务'
            }
          ]
        })
      });

      const result = await analyticsService.prepareReadModel({
        analysisOptions: { userId: 'child-1' },
        monthKey: '2026-03',
        days: 7,
        force: true
      });

      expect(result.fallback).toBe(false);
      expect(result.snapshot.mode).toBe('authoritative');
      expect(result.snapshot.tasks[0]).toBeInstanceOf(Task);
      expect(result.snapshot.tasks[0].isCompleted()).toBe(true);
      expect(result.snapshot.records[0]).toBeInstanceOf(StarRecord);
      expect(result.snapshot.records[0].isIncome()).toBe(true);
    });

    it('user prepare 遇到 pending_local_records 时应直接走本地 fallback 且不请求后端', async () => {
      mockStarService.hasPendingLocalStarRecords.mockResolvedValueOnce(true);
      mockTaskService.taskRepository.getTasksByDateRange.mockResolvedValueOnce([]);
      mockStarService.getStarRecordsByDateRange.mockResolvedValueOnce([]);
      mockStarService.getStarGroups.mockResolvedValueOnce([]);

      const result = await analyticsService.prepareReadModel({
        analysisOptions: { userId: 'child-1' },
        monthKey: '2026-03',
        days: 7,
        force: true
      });

      expect(result.fallback).toBe(true);
      expect(result.snapshot.mode).toBe('fallback');
      expect(result.snapshot.fallbackReason).toBe('pending_local_overlay');
      expect(HttpClient.post).not.toHaveBeenCalled();
    });

    it('family prepare 云端失败且未传 childUserIds 时，本地 fallback 应覆盖全部孩子而不是空快照', async () => {
      HttpClient.post.mockRejectedValueOnce(new Error('cloud down'));
      mockTaskService.taskRepository.getTasksByDateRange.mockResolvedValueOnce([
        { userId: 'parent-1', id: 'task-parent' },
        { userId: 'child-1', id: 'task-child-1' },
        { userId: 'child-2', id: 'task-child-2' }
      ]);
      mockStarService.getStarRecords.mockResolvedValueOnce([
        {
          userId: 'parent-1',
          id: 'record-parent',
          points: 1,
          timestamp: new Date('2026-03-20T08:00:00').getTime(),
          source: 'task',
          type: 'income'
        },
        {
          userId: 'child-1',
          id: 'record-child-1',
          points: 2,
          timestamp: new Date('2026-03-20T09:00:00').getTime(),
          source: 'task',
          type: 'income'
        }
      ]);
      mockStarService.getStarGroups
        .mockResolvedValueOnce([{ id: 'group-1', stars: 3 }])
        .mockResolvedValueOnce([{ id: 'group-2', stars: 2 }]);

      const result = await analyticsService.prepareReadModel({
        analysisOptions: { scope: 'family' },
        monthKey: '2026-03',
        days: 7,
        force: true
      });

      expect(result.fallback).toBe(true);
      expect(result.snapshot.tasks).toHaveLength(2);
      expect(result.snapshot.tasks.map((task) => task.userId)).toEqual(['child-1', 'child-2']);
      expect(result.snapshot.records).toHaveLength(1);
      expect(result.snapshot.subjectUserIds).toEqual(['child-1', 'child-2']);
      expect(result.snapshot.currentBalance).toBe(5);
    });
  });

  describe('getTaskCompletionStats', () => {
    it('family 分析应优先走云端 authoritative 统计接口', async () => {
      HttpClient.post.mockResolvedValueOnce({
        stats: {
          totalTasks: 1,
          completedTasks: 1,
          completionRate: '100.0',
          typeCounts: { study: 1, habit: 0, interest: 0 },
          statusCounts: { pending: 0, completed: 1 }
        }
      });

      const result = await analyticsService.getTaskCompletionStats('today', {
        scope: 'family',
        childUserIds: ['child-1']
      });

      expect(HttpClient.post).toHaveBeenCalledWith('/api/analytics/task-completion-stats/query', {
        scope: 'family',
        childUserIds: ['child-1'],
        dateRange: 'today'
      });
      expect(result.totalTasks).toBe(1);
      expect(result.completedTasks).toBe(1);
      expect(result.typeCounts.study).toBe(1);
      expect(result.typeCounts.habit).toBe(0);
      expect(mockTaskService.getTasksByScope).not.toHaveBeenCalled();
    });

    it('任务完成统计云端失败时应回退本地统计', async () => {
      HttpClient.post.mockRejectedValueOnce(new Error('cloud down'));
      mockTaskService.getTasksByScope.mockResolvedValue([
        { userId: 'parent-1', type: 'study', date: '2026-03-21', isCompleted: () => true },
        { userId: 'child-1', type: 'study', date: '2026-03-21', isCompleted: () => true }
      ]);

      const result = await analyticsService.getTaskCompletionStats('today', {
        scope: 'family',
        childUserIds: ['child-1']
      });

      expect(result.totalTasks).toBe(1);
      expect(result.completedTasks).toBe(1);
      expect(result.completionRate).toBe('100.0');
      expect(mockTaskService.getTasksByScope).toHaveBeenCalledWith({
        scope: 'family',
        childUserIds: ['child-1']
      });
    });
  });

  describe('getUpcomingExpiryStars', () => {
    it('单用户查询应优先走云端 authoritative 接口', async () => {
      HttpClient.post.mockResolvedValueOnce({
        items: [
          {
            id: 'expiry_group_1',
            points: 2,
            expiryDate: '2026-03-22T12:00:00.000Z',
            expiryDateStr: '本周星星',
            type: 'temporary'
          }
        ]
      });

      const result = await analyticsService.getUpcomingExpiryStars(7, {
        userId: 'child-2'
      });

      expect(HttpClient.post).toHaveBeenCalledWith('/api/analytics/upcoming-expiry/query', {
        scope: 'user',
        userId: 'child-2',
        days: 7
      });
      expect(mockStarService.getStarGroups).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].expiryDate).toBeInstanceOf(Date);
    });

    it('单用户查询云端失败时应回退本地 star groups', async () => {
      HttpClient.post.mockRejectedValueOnce(new Error('cloud down'));
      mockStarService.getStarGroups.mockResolvedValue([
        {
          id: 'group-1',
          name: '本周星星',
          type: 'temporary',
          stars: 2,
          expiryType: 'week',
          expiryDate: new Date('2026-03-22T12:00:00').getTime()
        }
      ]);

      const result = await analyticsService.getUpcomingExpiryStars(7, {
        userId: 'child-2'
      });

      expect(mockStarService.getStarGroups).toHaveBeenCalledWith('child-2');
      expect(result).toHaveLength(1);
    });

    it('家庭查询应走云端接口并返回空结果', async () => {
      HttpClient.post.mockResolvedValueOnce({ items: [] });

      const result = await analyticsService.getUpcomingExpiryStars(7, {
        scope: 'family',
        childUserIds: ['child-1']
      });

      expect(HttpClient.post).toHaveBeenCalledWith('/api/analytics/upcoming-expiry/query', {
        scope: 'family',
        childUserIds: ['child-1'],
        days: 7
      });
      expect(mockStarService.getStarGroups).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('getTaskStarCalendarData', () => {
    it('应优先走云端 authoritative 任务星星日历接口', async () => {
      HttpClient.post.mockResolvedValueOnce({
        records: [
          {
            id: 'task_cloud_1',
            title: '完成任务：云端任务',
            time: '2026-03-21 10:00:00',
            timestamp: new Date('2026-03-21T10:00:00').getTime(),
            points: 2,
            type: 'income',
            source: 'task'
          }
        ]
      });

      const result = await analyticsService.getTaskStarCalendarData({
        userId: 'child-1'
      });

      expect(HttpClient.post).toHaveBeenCalledWith('/api/analytics/task-star-calendar/query', {
        scope: 'user',
        userId: 'child-1'
      });
      expect(mockTaskService.getTasksByScope).not.toHaveBeenCalled();
      expect(result).toEqual([
        expect.objectContaining({
          title: '完成任务：云端任务',
          points: 2
        })
      ]);
    });

    it('云端失败时应基于事实字段本地生成惩罚与逾期补做退星记录，不依赖当前 isRequired', async () => {
      HttpClient.post.mockRejectedValueOnce(new Error('cloud down'));
      mockTaskService.getTasksByScope.mockResolvedValue([
        {
          id: 'task_penalty_1',
          title: '昨天的必做任务',
          date: '2026-03-20',
          isRequired: false,
          penaltyApplied: true,
          penaltyDeductedPoints: 3,
          penaltyRefunded: true,
          penaltyRefundTime: new Date('2026-03-21T08:30:00').getTime(),
          starAwarded: false,
          points: 5,
          isCompleted: () => false
        }
      ]);

      const result = await analyticsService.getTaskStarCalendarData({
        userId: 'child-1'
      });

      expect(result).toEqual([
        expect.objectContaining({
          title: '逾期补做退星：昨天的必做任务',
          points: 3,
          type: 'income',
          source: 'task_makeup_refund'
        }),
        expect.objectContaining({
          title: '未完成必做任务：昨天的必做任务',
          points: -3,
          type: 'penalty',
          source: 'task'
        })
      ]);
    });
  });
});
