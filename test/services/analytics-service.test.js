/**
 * analytics-service.test.js - AnalyticsService 测试
 */

jest.mock('../../utils/logger');
jest.mock('../../utils/core/event-bus', () => jest.fn(() => ({
  emit: jest.fn(),
  on: jest.fn(),
  off: jest.fn()
})));

const AnalyticsService = require('../../services/analytics-service');
const logger = require('../../utils/logger');

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

    mockTaskService = {
      enableCloudStorage: true,
      getTasksByScope: jest.fn().mockResolvedValue([]),
      getTasksByDateRange: jest.fn().mockResolvedValue([]),
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
      mockStarService.getStarGroups.mockResolvedValue([
        {
          id: 'group-1',
          stars: 5,
          expiryType: 'permanent',
          expiryDate: null
        }
      ]);
      mockStarService.getStarRecordsByDateRange.mockResolvedValue([
        {
          id: 'record-1',
          userId: 'child-1',
          points: 5,
          timestamp: new Date('2026-03-21T09:00:00').getTime(),
          source: 'task',
          type: 'income'
        }
      ]);

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
      expect(mockStarService.refreshStarsFromCloud).toHaveBeenCalledTimes(1);
      expect(mockTaskService.getTasksByDateRange).toHaveBeenCalledTimes(1);
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

    it('家庭分析在存在 prepared family snapshot 时应使用正式余额锚定并生成预测', async () => {
      mockStarService.getStarRecords.mockResolvedValue([
        {
          id: 'parent-record',
          userId: 'parent-1',
          points: 5,
          timestamp: new Date('2026-03-21T09:00:00').getTime(),
          source: 'task',
          type: 'income'
        },
        {
          id: 'child-record',
          userId: 'child-1',
          points: 7,
          timestamp: new Date('2026-03-21T10:00:00').getTime(),
          source: 'task',
          type: 'income'
        }
      ]);
      mockStarService.getFamilyStarSummary.mockResolvedValue({
        success: true,
        scope: 'family',
        subjectUserIds: ['child-1'],
        totalPoints: 3,
        groups: [
          {
            id: 'group-1',
            userId: 'child-1',
            stars: 3,
            expiryType: 'week',
            expiryDate: new Date('2026-03-22T12:00:00').getTime()
          }
        ]
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

      const result = await analyticsService.calculateHistoricalBalance(1, null, {
        scope: 'family',
        childUserIds: ['child-1']
      });

      expect(mockStarService.getStarRecords).toHaveBeenCalledWith();
      expect(mockStarService.getFamilyStarSummary).toHaveBeenCalled();
      expect(result.historyData).toHaveLength(1);
      expect(result.historyData[0].value).toBe(3);
      expect(result.forecastData.length).toBeGreaterThan(0);
      expect(result.forecastData[result.forecastData.length - 1].value).toBe(0);
    });
  });

  describe('getTaskCompletionStats', () => {
    it('family 分析应只统计 childUserIds 对应任务', async () => {
      mockTaskService.getTasksByScope.mockResolvedValue([
        { userId: 'parent-1', type: 'study', date: '2026-03-21', isCompleted: () => true },
        { userId: 'child-1', type: 'study', date: '2026-03-21', isCompleted: () => true },
        { userId: 'child-2', type: 'habit', date: '2026-03-21', isCompleted: () => false }
      ]);

      const result = await analyticsService.getTaskCompletionStats('today', {
        scope: 'family',
        childUserIds: ['child-1']
      });

      expect(result.totalTasks).toBe(1);
      expect(result.completedTasks).toBe(1);
      expect(result.typeCounts.study).toBe(1);
      expect(result.typeCounts.habit).toBe(0);
    });

    it('family 分析在 childUserIds 为空时应返回空统计', async () => {
      mockTaskService.getTasksByScope.mockResolvedValue([
        { userId: 'parent-1', type: 'study', date: '2026-03-21', isCompleted: () => true },
        { userId: 'child-1', type: 'study', date: '2026-03-21', isCompleted: () => true }
      ]);

      const result = await analyticsService.getTaskCompletionStats('today', {
        scope: 'family',
        childUserIds: []
      });

      expect(result.totalTasks).toBe(0);
      expect(result.completedTasks).toBe(0);
      expect(result.completionRate).toBe(0);
    });
  });

  describe('getUpcomingExpiryStars', () => {
    it('单用户查询应只读取对应 userId 的 star groups', async () => {
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

    it('家庭查询应直接返回空结果且不读取 star groups', async () => {
      const result = await analyticsService.getUpcomingExpiryStars(7, {
        scope: 'family'
      });

      expect(mockStarService.getStarGroups).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('getTaskStarCalendarData', () => {
    it('应基于事实字段生成惩罚与逾期补做退星记录，不依赖当前 isRequired', async () => {
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
