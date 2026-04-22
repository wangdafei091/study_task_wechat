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

describe('backend/models/Task.fromDB', () => {
  test('应将字符串 0 的布尔字段解析为 false，并保留表现项结束日期', () => {
    const task = Task.fromDB({
      task_id: 'task_occ_config',
      user_id: 'child_1',
      title: '听写全对',
      type: 'study',
      date: '2026-04-17',
      is_required: '0',
      is_all_day: '0',
      penalty_applied: '0',
      penalty_refunded: '0',
      star_awarded: '0',
      has_no_end_date: '0',
      execution_mode: 'occurrence',
      active_start_date: '2026-04-17',
      active_end_date: '2026-04-19',
      active_has_no_end_date: '0',
      is_occurrence_record: '0'
    });

    expect(task.isRequired).toBe(false);
    expect(task.isAllDay).toBe(false);
    expect(task.penaltyApplied).toBe(false);
    expect(task.penaltyRefunded).toBe(false);
    expect(task.starAwarded).toBe(false);
    expect(task.hasNoEndDate).toBe(false);
    expect(task.isOccurrenceRecord).toBe(false);
    expect(task.activeRange).toEqual({
      startDate: '2026-04-17',
      endDate: '2026-04-19',
      hasNoEndDate: false
    });
  });

  test('应将字符串 1 的布尔字段解析为 true', () => {
    const task = Task.fromDB({
      task_id: 'task_occ_record',
      user_id: 'child_1',
      title: '听写全对',
      type: 'study',
      date: '2026-04-17',
      is_required: '1',
      is_all_day: '1',
      penalty_applied: '1',
      penalty_refunded: '1',
      star_awarded: '1',
      has_no_end_date: '1',
      execution_mode: 'occurrence',
      active_start_date: '2026-04-17',
      active_end_date: '2026-04-19',
      active_has_no_end_date: '1',
      is_occurrence_record: '1',
      occurrence_outcome: 'success'
    });

    expect(task.isRequired).toBe(true);
    expect(task.isAllDay).toBe(true);
    expect(task.penaltyApplied).toBe(true);
    expect(task.penaltyRefunded).toBe(true);
    expect(task.starAwarded).toBe(true);
    expect(task.hasNoEndDate).toBe(true);
    expect(task.isOccurrenceRecord).toBe(true);
    expect(task.activeRange).toEqual({
      startDate: '2026-04-17',
      endDate: '',
      hasNoEndDate: true
    });
  });
});
