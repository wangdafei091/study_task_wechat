/**
 * date-utils.test.js - 日期工具函数测试
 *
 * 测试 dateUtils 模块的各种日期处理功能
 */

const dateUtils = require('../../utils/dateUtils');

describe('dateUtils', () => {

  describe('getTodayString', () => {
    it('应该返回YYYY-MM-DD格式的今天日期', () => {
      const today = dateUtils.getTodayString();
      const pattern = /^\d{4}-\d{2}-\d{2}$/;
      expect(today).toMatch(pattern);
    });

    it('返回的日期应该是今天', () => {
      const today = dateUtils.getTodayString();
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const expected = `${year}-${month}-${day}`;
      expect(today).toBe(expected);
    });
  });

  describe('getTomorrowString', () => {
    it('应该返回明天的日期字符串', () => {
      const tomorrow = dateUtils.getTomorrowString();
      const today = new Date();
      const expected = new Date(today);
      expected.setDate(today.getDate() + 1);
      const year = expected.getFullYear();
      const month = String(expected.getMonth() + 1).padStart(2, '0');
      const day = String(expected.getDate()).padStart(2, '0');
      const expectedStr = `${year}-${month}-${day}`;
      expect(tomorrow).toBe(expectedStr);
    });
  });

  describe('getYesterdayString', () => {
    it('应该返回昨天的日期字符串', () => {
      const yesterday = dateUtils.getYesterdayString();
      const today = new Date();
      const expected = new Date(today);
      expected.setDate(today.getDate() - 1);
      const year = expected.getFullYear();
      const month = String(expected.getMonth() + 1).padStart(2, '0');
      const day = String(expected.getDate()).padStart(2, '0');
      const expectedStr = `${year}-${month}-${day}`;
      expect(yesterday).toBe(expectedStr);
    });
  });

  describe('formatDate', () => {
    it('应该正确格式化日期对象', () => {
      const date = new Date(2026, 0, 15); // 2026-01-15
      const formatted = dateUtils.formatDate(date);
      expect(formatted).toBe('2026-01-15');
    });

    it('应该正确格式化日期字符串', () => {
      const formatted = dateUtils.formatDate('2026-01-15');
      expect(formatted).toBe('2026-01-15');
    });

    it('应该处理不同月份和日期', () => {
      const date = new Date(2026, 11, 31); // 2026-12-31
      const formatted = dateUtils.formatDate(date);
      expect(formatted).toBe('2026-12-31');
    });

    it('应该处理单月和单日', () => {
      const date = new Date(2026, 0, 5); // 2026-01-05
      const formatted = dateUtils.formatDate(date);
      expect(formatted).toBe('2026-01-05');
    });
  });

  describe('formatTime', () => {
    it('应该正确格式化时间', () => {
      const date = new Date(2026, 0, 15, 14, 30, 45);
      const formatted = dateUtils.formatTime(date);
      expect(formatted).toBe('14:30');
    });

    it('应该处理零点时间', () => {
      const date = new Date(2026, 0, 15, 0, 5, 0);
      const formatted = dateUtils.formatTime(date);
      expect(formatted).toBe('00:05');
    });

    it('应该处理午夜时间', () => {
      const date = new Date(2026, 0, 15, 23, 59, 59);
      const formatted = dateUtils.formatTime(date);
      expect(formatted).toBe('23:59');
    });
  });

  describe('getDaysBetween', () => {
    it('应该正确计算同一年两个日期的天数差', () => {
      const date1 = '2026-01-01';
      const date2 = '2026-01-10';
      const diff = dateUtils.getDaysBetween(date1, date2);
      expect(diff).toBe(9);
    });

    it('应该正确计算跨月两个日期的天数差', () => {
      const date1 = '2026-01-25';
      const date2 = '2026-02-05';
      const diff = dateUtils.getDaysBetween(date1, date2);
      expect(diff).toBe(11);
    });

    it('应该正确计算跨年两个日期的天数差', () => {
      const date1 = '2025-12-30';
      const date2 = '2026-01-02';
      const diff = dateUtils.getDaysBetween(date1, date2);
      expect(diff).toBe(3);
    });

    it('应该正确计算负数天数差（前向）', () => {
      const date1 = '2026-01-10';
      const date2 = '2026-01-01';
      const diff = dateUtils.getDaysBetween(date1, date2);
      expect(diff).toBe(-9);
    });

    it('应该正确计算同一天的天数差', () => {
      const date1 = '2026-01-01';
      const date2 = '2026-01-01';
      const diff = dateUtils.getDaysBetween(date1, date2);
      expect(diff).toBe(0);
    });
  });

  describe('isSameDay', () => {
    it('应该正确判断同一天', () => {
      const date1 = new Date(2026, 0, 15, 10, 30);
      const date2 = new Date(2026, 0, 15, 18, 45);
      expect(dateUtils.isSameDay(date1, date2)).toBe(true);
    });

    it('应该正确判断不同天', () => {
      const date1 = new Date(2026, 0, 15);
      const date2 = new Date(2026, 0, 16);
      expect(dateUtils.isSameDay(date1, date2)).toBe(false);
    });

    it('应该正确判断同一天（字符串格式）', () => {
      const date1 = '2026-01-15';
      const date2 = '2026-01-15';
      expect(dateUtils.isSameDay(date1, date2)).toBe(true);
    });
  });

  describe('isToday', () => {
    it('应该正确判断今天', () => {
      const today = new Date();
      expect(dateUtils.isToday(today)).toBe(true);
    });

    it('应该正确判断不是今天', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(dateUtils.isToday(yesterday)).toBe(false);
    });
  });

  describe('addDays', () => {
    it('应该正确添加天数', () => {
      const date = new Date(2026, 0, 15);
      const result = dateUtils.addDays(date, 7);
      expect(result.getDate()).toBe(22);
    });

    it('应该正确处理跨月添加', () => {
      const date = new Date(2026, 0, 31);
      const result = dateUtils.addDays(date, 1);
      expect(result.getDate()).toBe(1);
      expect(result.getMonth()).toBe(1); // 2月
    });

    it('应该正确处理跨年添加', () => {
      const date = new Date(2026, 11, 31);
      const result = dateUtils.addDays(date, 1);
      expect(result.getDate()).toBe(1);
      expect(result.getMonth()).toBe(0); // 1月
      expect(result.getFullYear()).toBe(2027);
    });
  });

  describe('getMonthCalendar', () => {
    it('应该正确生成2026年1月的日历', () => {
      const calendar = dateUtils.getMonthCalendar(2026, 1);
      expect(calendar.length).toBe(42); // 6行 x 7列
    });

    it('应该正确标记上个月的日期', () => {
      const calendar = dateUtils.getMonthCalendar(2026, 1);
      // 2026年1月1日是周四（getDay返回4）
      // 应该有4天上个月日期（周日到周三）
      const prevMonthDays = calendar.filter(d => d.isPrevMonth);
      expect(prevMonthDays.length).toBe(4);
    });

    it('应该正确标记当月日期', () => {
      const calendar = dateUtils.getMonthCalendar(2026, 1);
      // 2026年1月有31天
      const currentMonthDays = calendar.filter(d => d.isCurrentMonth);
      expect(currentMonthDays.length).toBe(31);
    });
  });

  describe('formatRelativeTime', () => {
    it('应该显示"刚刚"（1分钟内）', () => {
      const date = new Date(Date.now() - 30 * 1000);
      const result = dateUtils.formatRelativeTime(date);
      expect(result).toBe('刚刚');
    });

    it('应该显示"X分钟前"', () => {
      const date = new Date(Date.now() - 5 * 60 * 1000);
      const result = dateUtils.formatRelativeTime(date);
      expect(result).toBe('5分钟前');
    });

    it('应该显示"X小时前"', () => {
      const date = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const result = dateUtils.formatRelativeTime(date);
      expect(result).toBe('3小时前');
    });

    it('应该显示"X天前"', () => {
      const date = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const result = dateUtils.formatRelativeTime(date);
      expect(result).toBe('5天前');
    });

    it('应该超过30天显示具体日期', () => {
      const date = new Date(2026, 0, 1);
      const result = dateUtils.formatRelativeTime(date);
      expect(result).toMatch(/\d{4}-\d{2}-\d{2}/);
    });
  });

  describe('formatDateFriendly', () => {
    it('今天应该返回"今天"', () => {
      const today = new Date();
      const result = dateUtils.formatDateFriendly(today);
      expect(result).toBe('今天');
    });

    it('明天应该返回"明天"', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const result = dateUtils.formatDateFriendly(tomorrow);
      expect(result).toBe('明天');
    });

    it('昨天应该返回"昨天"', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const result = dateUtils.formatDateFriendly(yesterday);
      expect(result).toBe('昨天');
    });

    it('本周内的日期应该显示星期几', () => {
      const date = new Date();
      date.setDate(date.getDate() + 3); // 3天后
      const result = dateUtils.formatDateFriendly(date);
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      expect(weekdays).toContain(result);
    });

    it('其他日期应该显示"月-日"格式', () => {
      const date = new Date(2026, 0, 15); // 2026-01-15
      const result = dateUtils.formatDateFriendly(date);
      expect(result).toBe('1月15日');
    });
  });

  describe('parseDateTime', () => {
    it('应该正确解析YYYY-MM-DD格式', () => {
      const result = dateUtils.parseDateTime('2026-01-15');
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(15);
    });

    it('应该正确解析YYYY-MM-DD HH:MM:SS格式', () => {
      const result = dateUtils.parseDateTime('2026-01-15 14:30:45');
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(15);
      expect(result.getHours()).toBe(14);
      expect(result.getMinutes()).toBe(30);
      expect(result.getSeconds()).toBe(45);
    });

    it('应该正确解析HH:MM格式（使用当天日期）', () => {
      const result = dateUtils.parseDateTime('14:30');
      expect(result.getHours()).toBe(14);
      expect(result.getMinutes()).toBe(30);
    });
  });

  describe('getMinutesBetween', () => {
    it('应该正确计算两个时间之间的分钟差', () => {
      const time1 = '14:30';
      const time2 = '15:45';
      const diff = dateUtils.getMinutesBetween(time1, time2);
      expect(diff).toBe(75); // 1小时15分钟 = 75分钟
    });

    it('应该正确处理跨天时间（负数表示跨天）', () => {
      const time1 = '23:30';
      const time2 = '00:30';
      const diff = dateUtils.getMinutesBetween(time1, time2);
      // dateUtils的getMinutesBetween返回负数表示跨天
      expect(diff).toBeLessThan(0); // 应该是负数（第二天 - 第一天）
    });

    it('应该正确计算相同时间', () => {
      const time1 = '14:30';
      const time2 = '14:30';
      const diff = dateUtils.getMinutesBetween(time1, time2);
      expect(diff).toBe(0);
    });
  });

});
