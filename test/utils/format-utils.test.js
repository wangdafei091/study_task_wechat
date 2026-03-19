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

});
