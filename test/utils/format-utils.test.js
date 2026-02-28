/**
 * format-utils.test.js - 格式化工具函数测试
 *
 * 测试 formatUtils 模块的各种格式化功能
 */

const formatUtils = require('../../utils/formatUtils');

describe('formatUtils', () => {

  describe('formatPoints', () => {
    it('应该正确格式化正整数', () => {
      const result = formatUtils.formatPoints(123);
      expect(result).toBe('123');
    });

    it('应该正确格式化零', () => {
      const result = formatUtils.formatPoints(0);
      expect(result).toBe('0');
    });

    it('应该正确处理字符串输入', () => {
      const result = formatUtils.formatPoints('456');
      expect(result).toBe('456');
    });

    it('应该正确处理null/undefined（返回0）', () => {
      const result1 = formatUtils.formatPoints(null);
      const result2 = formatUtils.formatPoints(undefined);
      expect(result1).toBe('0');
      expect(result2).toBe('0');
    });

    it('应该正确添加千位分隔符', () => {
      const result = formatUtils.formatPoints(12345, true);
      expect(result).toBe('12,345');
    });

    it('应该正确处理多位千位分隔', () => {
      const result = formatUtils.formatPoints(1234567, true);
      expect(result).toBe('1,234,567');
    });

    it('应该正确处理不需要分隔符的数字', () => {
      const result = formatUtils.formatPoints(123, true);
      expect(result).toBe('123');
    });
  });

  describe('formatDateTime', () => {
    const testDate = new Date(2026, 0, 15, 14, 30, 45); // 2026-01-15 14:30:45

    it('应该默认返回YYYY-MM-DD格式', () => {
      const result = formatUtils.formatDateTime(testDate);
      expect(result).toBe('2026-01-15');
    });

    it('应该正确返回YYYY-MM-DD格式', () => {
      const result = formatUtils.formatDateTime(testDate, 'YYYY-MM-DD');
      expect(result).toBe('2026-01-15');
    });

    it('应该正确返回YYYY/MM/DD格式', () => {
      const result = formatUtils.formatDateTime(testDate, 'YYYY/MM/DD');
      expect(result).toBe('2026/01/15');
    });

    it('应该正确返回MM-DD格式', () => {
      const result = formatUtils.formatDateTime(testDate, 'MM-DD');
      expect(result).toBe('01-15');
    });

    it('应该正确返回YYYY-MM-DD HH:MM格式', () => {
      const result = formatUtils.formatDateTime(testDate, 'YYYY-MM-DD HH:MM');
      expect(result).toBe('2026-01-15 14:30');
    });

    it('应该正确返回YYYY-MM-DD HH:MM:SS格式', () => {
      const result = formatUtils.formatDateTime(testDate, 'YYYY-MM-DD HH:MM:SS');
      expect(result).toBe('2026-01-15 14:30:45');
    });

    it('应该正确返回HH:MM格式', () => {
      const result = formatUtils.formatDateTime(testDate, 'HH:MM');
      expect(result).toBe('14:30');
    });

    it('应该正确返回HH:MM:SS格式', () => {
      const result = formatUtils.formatDateTime(testDate, 'HH:MM:SS');
      expect(result).toBe('14:30:45');
    });

    it('应该处理时间戳输入', () => {
      const timestamp = testDate.getTime();
      const result = formatUtils.formatDateTime(timestamp, 'YYYY-MM-DD');
      expect(result).toBe('2026-01-15');
    });

    it('应该处理日期字符串输入', () => {
      const result = formatUtils.formatDateTime('2026-01-15', 'YYYY-MM-DD');
      expect(result).toBe('2026-01-15');
    });

    it('应该处理FRIENDLY格式 - 今天', () => {
      const today = new Date();
      const result = formatUtils.formatDateTime(today, 'FRIENDLY');
      const hours = String(today.getHours()).padStart(2, '0');
      const minutes = String(today.getMinutes()).padStart(2, '0');
      expect(result).toBe(`今天 ${hours}:${minutes}`);
    });

    it('应该处理FRIENDLY格式 - 昨天', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const result = formatUtils.formatDateTime(yesterday, 'FRIENDLY');
      const hours = String(yesterday.getHours()).padStart(2, '0');
      const minutes = String(yesterday.getMinutes()).padStart(2, '0');
      expect(result).toBe(`昨天 ${hours}:${minutes}`);
    });

    it('应该处理FRIENDLY格式 - 其他日期', () => {
      const result = formatUtils.formatDateTime(testDate, 'FRIENDLY');
      expect(result).toBe('01-15 14:30');
    });

    it('应该处理无效日期格式（返回空字符串）', () => {
      const result = formatUtils.formatDateTime('invalid-date', 'YYYY-MM-DD');
      expect(result).toBe('');
    });

    it('应该处理null/undefined（返回空字符串）', () => {
      const result1 = formatUtils.formatDateTime(null, 'YYYY-MM-DD');
      const result2 = formatUtils.formatDateTime(undefined, 'YYYY-MM-DD');
      expect(result1).toBe('');
      expect(result2).toBe('');
    });
  });

});
