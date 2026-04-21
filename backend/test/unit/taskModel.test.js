const Task = require('../../models/Task');

describe('backend/models/Task.validate', () => {
  test('创建任务时应拒绝结束时间早于或等于开始时间', () => {
    const result = Task.validate({
      title: '测试任务',
      type: 'study',
      date: '2026-04-11',
      isAllDay: false,
      startTime: '10:00',
      endTime: '10:00'
    }, false);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('结束时间不能早于开始时间');
  });

  test('更新任务时传入完整合并结果应拒绝无效时间范围', () => {
    const result = Task.validate({
      title: '测试任务',
      type: 'study',
      date: '2026-04-11',
      isAllDay: false,
      startTime: '20:00',
      endTime: '19:30'
    }, false);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('结束时间不能早于开始时间');
  });

  test('应拒绝超过 93 天的重复任务范围，并返回明确错误码', () => {
    const result = Task.validate({
      title: '长期任务',
      type: 'habit',
      date: '2026-04-01',
      hasNoEndDate: false,
      repeat: {
        type: 'daily',
        startDate: '2026-04-01',
        endDate: '2026-07-05'
      }
    }, false);

    expect(result.valid).toBe(false);
    expect(result.errorCodes).toContain('TASK_REPEAT_RANGE_TOO_LARGE');
  });

  test('历史超长表现项在不扩张时应允许通过', () => {
    const result = Task.validate({
      title: '表现项',
      type: 'study',
      date: '2026-01-01',
      executionMode: 'occurrence',
      activeRange: {
        startDate: '2026-01-01',
        endDate: '2026-08-01',
        hasNoEndDate: false
      }
    }, false, {
      previousTask: {
        title: '表现项',
        type: 'study',
        date: '2026-01-01',
        executionMode: 'occurrence',
        activeRange: {
          startDate: '2026-01-01',
          endDate: '2026-08-01',
          hasNoEndDate: false
        }
      }
    });

    expect(result.valid).toBe(true);
  });
});
