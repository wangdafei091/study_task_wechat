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

describe('AnalyticsService', () => {
  let analyticsService;
  let mockStarService;
  let mockTaskService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-21T12:00:00'));

    mockStarService = {
      getStarRecords: jest.fn().mockResolvedValue([
        {
          id: 'record-1',
          points: 5,
          timestamp: new Date('2026-03-21T09:00:00').getTime(),
          source: 'task',
          type: 'income'
        }
      ]),
      getStarGroups: jest.fn().mockResolvedValue([])
    };

    mockTaskService = {
      getTasksByScope: jest.fn().mockResolvedValue([])
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

    it('家庭分析应跳过基于 star groups 的过期预测', async () => {
      const result = await analyticsService.calculateHistoricalBalance(1, null, {
        scope: 'family'
      });

      expect(mockStarService.getStarRecords).toHaveBeenCalledWith();
      expect(mockStarService.getStarGroups).not.toHaveBeenCalled();
      expect(result.historyData).toHaveLength(1);
      expect(result.forecastData).toEqual([]);
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
