/**
 * analytics-utils.test.js - 分析工具函数测试
 */

jest.mock('../../utils/logger');

const analyticsUtils = require('../../packageChart/utils/analyticsUtils');

describe('analyticsUtils', () => {
  describe('summarizeTaskStarRecords', () => {
    it('应将任务完成与任务重置按 sourceId 抵消后返回净获得星星', () => {
      const summary = analyticsUtils.summarizeTaskStarRecords([
        {
          id: 'record_income_1',
          source: 'task_complete',
          sourceId: 'task_math',
          type: 'income',
          points: 1
        },
        {
          id: 'record_reset_1',
          source: 'task_reset',
          sourceId: 'task_math',
          type: 'expense',
          points: -1
        }
      ]);

      expect(summary).toEqual({
        hasTaskRecords: true,
        earnedStars: 0
      });
    });

    it('应保留未被重置的其他任务获得星星', () => {
      const summary = analyticsUtils.summarizeTaskStarRecords([
        {
          id: 'record_income_math',
          source: 'task_complete',
          sourceId: 'task_math',
          type: 'income',
          points: 1
        },
        {
          id: 'record_income_swim',
          source: 'task_complete',
          sourceId: 'task_swim',
          type: 'income',
          points: 1
        },
        {
          id: 'record_reset_math',
          source: 'task_reset',
          sourceId: 'task_math',
          type: 'expense',
          points: -1
        }
      ]);

      expect(summary).toEqual({
        hasTaskRecords: true,
        earnedStars: 1
      });
    });

    it('无任务相关流水时应返回 hasTaskRecords=false', () => {
      const summary = analyticsUtils.summarizeTaskStarRecords([
        {
          id: 'record_expired_1',
          source: 'system',
          type: 'expense',
          points: -2
        }
      ]);

      expect(summary).toEqual({
        hasTaskRecords: false,
        earnedStars: 0
      });
    });
  });
});
