jest.mock('../../config/database', () => ({
  getPool: jest.fn(),
  query: jest.fn(),
  execute: jest.fn()
}));

jest.mock('../../services/messageService', () => ({
  createTaskMessages: jest.fn().mockResolvedValue([])
}));

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

describe('backend TaskService M19B repeat materialization helpers', () => {
  let service;

  function startOfDay(date) {
    const next = new Date(date.getTime());
    next.setHours(0, 0, 0, 0);
    return next;
  }

  function addDays(date, delta) {
    const next = new Date(date.getTime());
    next.setDate(next.getDate() + delta);
    return startOfDay(next);
  }

  function getNextWeekday(baseDate, targetDay) {
    const current = startOfDay(baseDate);
    const offset = (targetDay - current.getDay() + 7) % 7;
    return addDays(current, offset === 0 ? 7 : offset);
  }

  function getLastWeekendDayWithinRange(startDate, endDate) {
    const cursor = startOfDay(endDate);
    while (cursor >= startDate) {
      const day = cursor.getDay();
      if (day === 0 || day === 6) {
        return service._formatDate(cursor);
      }
      cursor.setDate(cursor.getDate() - 1);
    }
    return '';
  }

  beforeEach(() => {
    jest.resetModules();
    service = require('../../services/taskService');
  });

  it('_buildRepeatTaskId 应为相同输入返回稳定结果', () => {
    const resultA = service._buildRepeatTaskId('parent_1', '2026-04-04', 'child_1');
    const resultB = service._buildRepeatTaskId('parent_1', '2026-04-04', 'child_1');

    expect(resultA).toBe(resultB);
    expect(resultA).toMatch(/^task_repeat_[a-f0-9]{24}$/);
  });

  it('_buildRepeatDateStrings 应保留每周周期并跳过父任务当天', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const pastStart = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);

    const result = service._buildRepeatDateStrings({
      taskId: 'parent_1',
      userId: 'child_1',
      date: service._formatDate(pastStart),
      repeat: {
        type: 'weekly',
        startDate: service._formatDate(pastStart),
        endDate: service._formatDate(today)
      }
    });

    expect(result).toEqual([service._formatDate(today)]);
  });

  it('_buildRepeatDateStrings 应兼容 custom days 的字符串并跳过父任务日期', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const result = service._buildRepeatDateStrings({
      taskId: 'parent_2',
      userId: 'child_1',
      date: service._formatDate(today),
      repeat: {
        type: 'custom',
        startDate: service._formatDate(today),
        endDate: service._formatDate(new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000)),
        days: [String(today.getDay()), String(tomorrow.getDay())]
      }
    });

    expect(result).not.toContain(service._formatDate(today));
    expect(result).toContain(service._formatDate(tomorrow));
  });

  it('_buildRepeatDateStrings 在 daily + hasNoEndDate 下应默认展开 90 天子任务', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = service._buildRepeatDateStrings({
      taskId: 'parent_daily',
      userId: 'child_1',
      date: service._formatDate(today),
      hasNoEndDate: true,
      repeat: {
        type: 'daily',
        startDate: service._formatDate(today),
      }
    });

    expect(result).toHaveLength(90);
    expect(result[0]).toBe(service._formatDate(new Date(today.getTime() + 24 * 60 * 60 * 1000)));
  });

  it('_buildRepeatDateStrings 在 workdays 起始不匹配时应于 21 天窗口内找到首个合法日期', () => {
    const saturday = getNextWeekday(new Date(), 6);
    const monday = addDays(saturday, 2);
    const friday = addDays(saturday, 6);

    const result = service._buildRepeatDateStrings({
      taskId: 'parent_workdays',
      userId: 'child_1',
      date: service._formatDate(saturday),
      repeat: {
        type: 'workdays',
        startDate: service._formatDate(saturday),
        endDate: service._formatDate(friday)
      }
    });

    expect(result[0]).toBe(service._formatDate(monday));
    expect(result).toContain(service._formatDate(friday));
  });

  it('_buildRepeatDateStrings 在 weekends + hasNoEndDate 下应使用 30 天展开窗口', () => {
    const tuesday = getNextWeekday(new Date(), 2);
    const expectedFirstWeekend = service._formatDate(getNextWeekday(tuesday, 6));
    const expandedEndDate = addDays(tuesday, 30);
    const expectedLastWeekend = getLastWeekendDayWithinRange(tuesday, expandedEndDate);

    const result = service._buildRepeatDateStrings({
      taskId: 'parent_weekends',
      userId: 'child_1',
      date: service._formatDate(tuesday),
      hasNoEndDate: true,
      repeat: {
        type: 'weekends',
        startDate: service._formatDate(tuesday),
      }
    });

    expect(result[0]).toBe(expectedFirstWeekend);
    expect(result[result.length - 1]).toBe(expectedLastWeekend);
  });
});
