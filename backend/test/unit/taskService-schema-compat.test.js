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

describe('backend TaskService schema compatibility', () => {
  const createColumnRows = columns => columns.map(COLUMN_NAME => ({ COLUMN_NAME }));

  beforeEach(() => {
    jest.resetModules();
  });

  it('createTask 应兼容旧版 camelCase tasks 字段', async () => {
    const { getPool, query } = require('../../config/database');
    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(),
      execute: jest.fn().mockResolvedValue([[], undefined]),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn()
    };
    getPool.mockReturnValue({
      getConnection: jest.fn().mockResolvedValue(connection)
    });
    query.mockResolvedValueOnce(createColumnRows([
      'task_id', 'user_id', 'title', 'description', 'type', 'date',
      'startTime', 'endTime', 'points', 'pointsExpiry', 'isRequired',
      'status', 'repeat', 'isAllDay', 'penaltyApplied', 'deleted_at',
      'completion_time', 'star_awarded', 'modify_time'
    ]));

    const service = require('../../services/taskService');

    await service.createTask('user_001', {
      title: '兼容老库任务',
      type: 'study',
      date: '2026-03-21'
    });

    const [sql] = connection.execute.mock.calls[0];
    expect(sql).toContain('startTime');
    expect(sql).toContain('endTime');
    expect(sql).toContain('pointsExpiry');
    expect(sql).toContain('isRequired');
    expect(sql).toContain('isAllDay');
    expect(sql).toContain('penaltyApplied');
    expect(sql).not.toContain('start_time');
  });

  it('旧版 schema 缺少 reminder 字段时，带 reminder 的创建应显式失败', async () => {
    const { getPool, query } = require('../../config/database');
    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(),
      execute: jest.fn().mockResolvedValue([[], undefined]),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn()
    };
    getPool.mockReturnValue({
      getConnection: jest.fn().mockResolvedValue(connection)
    });
    query.mockResolvedValueOnce(createColumnRows([
      'task_id', 'user_id', 'title', 'description', 'type', 'date',
      'startTime', 'endTime', 'points', 'pointsExpiry', 'isRequired',
      'status', 'repeat', 'isAllDay', 'penaltyApplied', 'deleted_at',
      'completion_time', 'star_awarded', 'modify_time'
    ]));

    const service = require('../../services/taskService');

    await expect(service.createTask('user_001', {
      title: '需要提醒的任务',
      type: 'study',
      date: '2026-03-21',
      reminder: { enabled: true, time: 30 }
    })).rejects.toMatchObject({
      code: 'TASK_REMINDER_SCHEMA_MISSING'
    });
  });

  it('createTask 应兼容新版 snake_case tasks 字段', async () => {
    const { getPool, query } = require('../../config/database');
    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(),
      execute: jest.fn().mockResolvedValue([[], undefined]),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn()
    };
    getPool.mockReturnValue({
      getConnection: jest.fn().mockResolvedValue(connection)
    });
    query.mockResolvedValueOnce(createColumnRows([
      'task_id', 'user_id', 'title', 'description', 'type', 'date',
      'start_time', 'end_time', 'reminder', 'points', 'points_expiry', 'is_required',
      'status', 'repeat', 'is_all_day', 'penalty_applied', 'deleted_at',
      'completion_time', 'star_awarded', 'modify_time', 'duration',
      'has_no_end_date', 'tags', 'parent_task_id'
    ]));

    const service = require('../../services/taskService');

    await service.createTask('user_001', {
      title: '兼容新库任务',
      type: 'study',
      date: '2026-03-21',
      reminder: { enabled: true, time: 30 },
      duration: 30,
      hasNoEndDate: false
    });

    const [sql] = connection.execute.mock.calls[0];
    expect(sql).toContain('start_time');
    expect(sql).toContain('end_time');
    expect(sql).toContain('reminder');
    expect(sql).toContain('points_expiry');
    expect(sql).toContain('is_required');
    expect(sql).toContain('is_all_day');
    expect(sql).toContain('penalty_applied');
    expect(sql).toContain('parent_task_id');
  });

  it('createTask 未传 reminder 时，在新版 schema 下也应写入默认提醒对象而不是 NULL', async () => {
    const { getPool, query } = require('../../config/database');
    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(),
      execute: jest.fn().mockResolvedValue([[], undefined]),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn()
    };
    getPool.mockReturnValue({
      getConnection: jest.fn().mockResolvedValue(connection)
    });
    query.mockResolvedValueOnce(createColumnRows([
      'task_id', 'user_id', 'title', 'description', 'type', 'date',
      'start_time', 'end_time', 'reminder', 'points', 'points_expiry', 'is_required',
      'status', 'repeat', 'is_all_day', 'penalty_applied', 'deleted_at',
      'completion_time', 'star_awarded', 'modify_time', 'duration',
      'has_no_end_date', 'tags', 'parent_task_id'
    ]));

    const service = require('../../services/taskService');

    await service.createTask('user_001', {
      title: '默认提醒任务',
      type: 'study',
      date: '2026-03-21'
    });

    const [, params] = connection.execute.mock.calls[0];
    expect(params).toContain(JSON.stringify({
      enabled: false,
      time: 0
    }));
  });

  it('updateTask 传入 reminder=null 时应收口为默认提醒对象而不是写入 NULL', async () => {
    const { getPool, query } = require('../../config/database');
    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(),
      execute: jest.fn()
        .mockResolvedValueOnce([{ affectedRows: 1 }, undefined])
        .mockResolvedValueOnce([[
          {
            task_id: 'task_001',
            user_id: 'user_001',
            title: '更新后任务',
            description: '',
            type: 'study',
            date: '2026-03-21',
            start_time: '09:00',
            end_time: '10:00',
            reminder: JSON.stringify({ enabled: false, time: 0 }),
            points: 1,
            points_expiry: 'week',
            is_required: 0,
            status: 0,
            repeat: null,
            is_all_day: 0,
            penalty_applied: 0,
            deleted_at: null,
            modify_time: 123
          }
        ], undefined]),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn()
    };
    getPool.mockReturnValue({
      getConnection: jest.fn().mockResolvedValue(connection)
    });
    query.mockResolvedValueOnce(createColumnRows([
      'task_id', 'user_id', 'title', 'description', 'type', 'date',
      'start_time', 'end_time', 'reminder', 'points', 'points_expiry', 'is_required',
      'status', 'repeat', 'is_all_day', 'penalty_applied', 'deleted_at',
      'completion_time', 'star_awarded', 'modify_time'
    ]));

    const service = require('../../services/taskService');

    await service.updateTask('task_001', {
      reminder: null,
      modifyTime: 123
    });

    const [, params] = connection.execute.mock.calls[0];
    expect(params[0]).toBe(JSON.stringify({
      enabled: false,
      time: 0
    }));
  });
});
