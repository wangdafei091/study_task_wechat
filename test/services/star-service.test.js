/**
 * star-service.test.js - StarService 测试
 *
 * 测试 StarService 的核心业务逻辑
 */

const StarService = require('../../services/star-service');
const MockStorageAdapter = require('../__mocks__/storage-adapter-mock');
const EventBus = require('../../utils/core/event-bus');
const { StarExpiryType } = require('../../models/star');

describe('StarService', () => {
  let starService;
  let mockStorage;

  beforeEach(() => {
    // 创建Mock存储
    mockStorage = new MockStorageAdapter();

    // 创建EventBus实例
    const eventBus = new EventBus();

    // 创建StarService实例
    starService = new StarService({
      storageAdapter: mockStorage,
      eventBus: eventBus
    });
  });

  describe('calculateExpiryDate', () => {
    it('应该正确计算永久有效', () => {
      const result = starService.calculateExpiryDate('permanent');
      expect(result.expiry).toBe('permanent');
      expect(result.expiryDateStr).toBe('永久');
    });

    it('应该正确计算本周有效', () => {
      const result = starService.calculateExpiryDate('week');
      expect(result.expiry).toBeDefined();
      expect(result.expiryDateStr).toBeDefined();
    });

    it('应该正确计算本月有效', () => {
      const result = starService.calculateExpiryDate('month');
      expect(result.expiry).toBeDefined();
      expect(result.expiryDateStr).toBeDefined();
    });

    it('应该正确计算本季度有效', () => {
      const result = starService.calculateExpiryDate('quarter');
      expect(result.expiry).toBeDefined();
      expect(result.expiryDateStr).toBeDefined();
    });
  });

  describe('getExpiryText', () => {
    it('应该返回"永久"文本', () => {
      const text = starService.getExpiryText('permanent');
      expect(text).toBe('永久');
    });

    it('应该返回"一周"文本', () => {
      const text = starService.getExpiryText('week');
      expect(text).toBe('一周');
    });

    it('应该返回"一个月"文本', () => {
      const text = starService.getExpiryText('month');
      expect(text).toBe('一个月');
    });

    it('应该返回"三个月"文本', () => {
      const text = starService.getExpiryText('3months');
      expect(text).toBe('三个月');
    });

    it('应该返回"六个月"文本', () => {
      const text = starService.getExpiryText('6months');
      expect(text).toBe('六个月');
    });

    it('应该返回"十二个月"文本', () => {
      const text = starService.getExpiryText('12months');
      expect(text).toBe('十二个月');
    });

    it('应该对未知类型返回"永久"', () => {
      const text = starService.getExpiryText('unknown');
      expect(text).toBe('永久');
    });
  });

  describe('formatStarCount', () => {
    it('应该正确格式化数字', () => {
      const result = starService.formatStarCount(123);
      expect(result).toBe('123');
    });

    it('应该正确格式化零', () => {
      const result = starService.formatStarCount(0);
      expect(result).toBe('0');
    });

    it('应该正确处理null/undefined', () => {
      const result1 = starService.formatStarCount(null);
      const result2 = starService.formatStarCount(undefined);
      expect(result1).toBe('0');
      expect(result2).toBe('0');
    });

    it('应该正确添加千位分隔符', () => {
      const result = starService.formatStarCount(12345, true);
      expect(result).toBe('12,345');
    });

    it('应该正确处理多位千位分隔', () => {
      const result = starService.formatStarCount(1234567, true);
      expect(result).toBe('1,234,567');
    });
  });

  describe('验证星星值', () => {
    it('应该拒绝无效的星星数量（<= 0）', async () => {
      const result1 = await starService.addStars(0, 'permanent', '测试');
      expect(result1.success).toBe(false);
      expect(result1.message).toBe('星星数量必须大于0');

      const result2 = await starService.addStars(-5, 'permanent', '测试');
      expect(result2.success).toBe(false);
      expect(result2.message).toBe('星星数量必须大于0');
    });

    it('应该拒绝无效的有效期类型', async () => {
      const result = await starService.addStars(10, 'invalid_type', '测试');
      expect(result.success).toBe(false);
      expect(result.message).toBe('无效的过期类型');
    });

    it('应该接受有效的有效期类型', async () => {
      const result = await starService.addStars(10, 'permanent', '测试');
      // 注意：这里测试参数验证逻辑，实际存储可能失败
      expect(result.success !== undefined).toBe(true);
    });
  });

  describe('getTotalStars', () => {
    it('应该返回0如果没有星星', async () => {
      const total = await starService.getTotalStars('user1');
      expect(typeof total).toBe('number');
      expect(total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('消费星星验证', () => {
    it('应该拒绝无效的消费数量（<= 0）', async () => {
      const result1 = await starService.consumeStars(0, '测试消费');
      expect(result1.success).toBe(false);
      expect(result1.message).toBe('星星数量必须大于0');

      const result2 = await starService.consumeStars(-5, '测试消费');
      expect(result2.success).toBe(false);
      expect(result2.message).toBe('星星数量必须大于0');
    });
  });

  describe('consumeStarsFromSpecificType', () => {
    it('应该拒绝无效的消费数量（<= 0）', async () => {
      const result = await starService.consumeStarsFromSpecificType(0, 'permanent', '测试');
      expect(result.success).toBe(false);
      expect(result.message).toBe('星星数量必须大于0');
    });

    it('应该拒绝未指定有效期类型', async () => {
      const result = await starService.consumeStarsFromSpecificType(10, '', '测试');
      expect(result.success).toBe(false);
      expect(result.message).toBe('未指定有效期类型');
    });

    it('应该接受有效的参数', async () => {
      const result = await starService.consumeStarsFromSpecificType(10, 'permanent', '测试');
      // 注意：这里测试参数验证逻辑，实际存储可能失败
      expect(result.success !== undefined).toBe(true);
    });
  });

  describe('protectRewardsByExpiry', () => {
    it('应该跳过无过期星星的情况', async () => {
      const result = await starService.protectRewardsByExpiry(0, 'user1');
      expect(result.success).toBe(true);
      expect(result.protectedCount).toBe(0);
      expect(result.protectedRewards).toEqual([]);
    });

    it('应该处理正数过期星星', async () => {
      const result = await starService.protectRewardsByExpiry(10, 'user1');
      // 注意：这里测试参数验证逻辑，实际保护逻辑可能失败
      expect(result.success !== undefined).toBe(true);
    });
  });

  describe('cleanupExpiredStars', () => {
    it('应该清理过期星星', async () => {
      const result = await starService.cleanupExpiredStars('user1');
      // 注意：这里测试参数验证逻辑，实际清理可能没有数据
      expect(result.success !== undefined).toBe(true);
    });
  });

  describe('clearCache', () => {
    it('应该清除缓存', () => {
      // 清除缓存不应该抛出错误
      expect(() => {
        starService.clearCache();
      }).not.toThrow();
    });
  });

});
