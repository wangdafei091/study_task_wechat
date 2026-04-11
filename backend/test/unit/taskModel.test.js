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
});
