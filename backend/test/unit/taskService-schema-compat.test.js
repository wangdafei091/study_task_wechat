jest.mock('../../config/database', () => ({
  query: jest.fn(),
  execute: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

describe('backend TaskService schema compatibility', () => {
  const createColumnRows = columns => columns.map(COLUMN_NAME => ({ COLUMN_NAME }));

  beforeEach(() => {
    jest.resetModules();
  });

  it('createTask 应兼容旧版 camelCase tasks 字段', async () => {
    const { query, execute } = require('../../config/database');
    query.mockResolvedValueOnce(createColumnRows([
      'task_id', 'user_id', 'title', 'description', 'type', 'date',
      'startTime', 'endTime', 'points', 'pointsExpiry', 'isRequired',
      'status', 'repeat', 'isAllDay', 'penaltyApplied', 'deleted_at',
      'completion_time', 'star_awarded', 'modify_time'
    ]));
    execute.mockResolvedValue({ affectedRows: 1 });

    const service = require('../../services/taskService');

    await service.createTask('user_001', {
      title: '兼容老库任务',
      type: 'study',
      date: '2026-03-21'
    });

    const [sql] = execute.mock.calls[0];
    expect(sql).toContain('startTime');
    expect(sql).toContain('endTime');
    expect(sql).toContain('pointsExpiry');
    expect(sql).toContain('isRequired');
    expect(sql).toContain('isAllDay');
    expect(sql).toContain('penaltyApplied');
    expect(sql).not.toContain('start_time');
  });

  it('createTask 应兼容新版 snake_case tasks 字段', async () => {
    const { query, execute } = require('../../config/database');
    query.mockResolvedValueOnce(createColumnRows([
      'task_id', 'user_id', 'title', 'description', 'type', 'date',
      'start_time', 'end_time', 'points', 'points_expiry', 'is_required',
      'status', 'repeat', 'is_all_day', 'penalty_applied', 'deleted_at',
      'completion_time', 'star_awarded', 'modify_time', 'duration',
      'has_no_end_date', 'tags', 'parent_task_id'
    ]));
    execute.mockResolvedValue({ affectedRows: 1 });

    const service = require('../../services/taskService');

    await service.createTask('user_001', {
      title: '兼容新库任务',
      type: 'study',
      date: '2026-03-21',
      duration: 30,
      hasNoEndDate: false
    });

    const [sql] = execute.mock.calls[0];
    expect(sql).toContain('start_time');
    expect(sql).toContain('end_time');
    expect(sql).toContain('points_expiry');
    expect(sql).toContain('is_required');
    expect(sql).toContain('is_all_day');
    expect(sql).toContain('penalty_applied');
    expect(sql).toContain('parent_task_id');
  });
});
