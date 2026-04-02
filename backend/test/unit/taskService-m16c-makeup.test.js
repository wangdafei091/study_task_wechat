jest.mock('../../config/database', () => ({
  getPool: jest.fn(),
  query: jest.fn(),
  execute: jest.fn()
}));

jest.mock('../../services/messageService', () => ({
  createTaskMessages: jest.fn().mockResolvedValue([])
}));

jest.mock('../../services/starService', () => ({
  grantStarsWithConnection: jest.fn().mockResolvedValue({
    idempotent: false,
    record: { recordId: 'task_makeup_refund_record' }
  }),
  upsertStarRecordWithConnection: jest.fn().mockResolvedValue({
    idempotent: false,
    record: { recordId: 'task_makeup_refund_revoke_record' }
  })
}));

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

describe('backend TaskService M16C makeup flow', () => {
  const createColumnRows = columns => columns.map(COLUMN_NAME => ({ COLUMN_NAME }));

  beforeEach(() => {
    jest.resetModules();
  });

  it('updateTaskStatus 完成已惩罚任务时应执行逾期补做退星并写入 makeup_complete 消息', async () => {
    const { getPool, query } = require('../../config/database');
    const messageService = require('../../services/messageService');
    const starService = require('../../services/starService');

    const existingRow = {
      task_id: 'task_makeup_001',
      user_id: 'child_001',
      title: '背单词',
      type: 'study',
      date: '2026-03-20',
      points: 5,
      points_expiry: 'week',
      is_required: 0,
      status: 0,
      repeat: null,
      is_all_day: 0,
      penalty_applied: 1,
      penalty_deducted_points: 4,
      penalty_refunded: 0,
      penalty_refund_time: null,
      star_awarded: 0,
      modify_time: 1000,
      deleted_at: null
    };
    const updatedRow = {
      ...existingRow,
      status: 1,
      completion_time: 2000,
      penalty_refunded: 1,
      penalty_refund_time: 2000,
      modify_time: 2000
    };

    let selectCount = 0;
    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(),
      execute: jest.fn().mockImplementation(async (sql) => {
        if (sql.startsWith('SELECT * FROM tasks')) {
          selectCount += 1;
          return [[selectCount === 1 ? existingRow : updatedRow]];
        }
        if (sql.startsWith('UPDATE tasks SET')) {
          return [{ affectedRows: 1 }, undefined];
        }
        throw new Error(`unexpected sql: ${sql}`);
      }),
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
      'status', 'repeat', 'is_all_day', 'penalty_applied', 'penalty_deducted_points',
      'penalty_refunded', 'penalty_refund_time', 'deleted_at', 'completion_time',
      'star_awarded', 'modify_time'
    ]));

    const service = require('../../services/taskService');
    const result = await service.updateTaskStatus('task_makeup_001', {
      status: 1,
      modifyTime: 2000,
      operationKey: 'm16c_complete_001'
    }, {
      actorUserId: 'child_001',
      actorRole: 'child',
      familyId: 'family_001'
    });

    expect(result.penaltyRefunded).toBe(true);
    expect(starService.grantStarsWithConnection).toHaveBeenCalledWith(
      connection,
      'child_001',
      expect.objectContaining({
        requestedPoints: 4,
        expiryType: 'permanent',
        idempotencyKey: 'task_makeup_refund:task_makeup_001:m16c_complete_001'
      })
    );
    expect(messageService.createTaskMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'makeup_complete',
        refundPoints: 4
      }),
      connection
    );
    expect(connection.commit).toHaveBeenCalled();
  });

  it('updateTaskStatus 重置已退星任务时应全额扣回永久星星', async () => {
    const { getPool, query } = require('../../config/database');
    const messageService = require('../../services/messageService');
    const starService = require('../../services/starService');

    const existingRow = {
      task_id: 'task_makeup_002',
      user_id: 'child_001',
      title: '背单词',
      type: 'study',
      date: '2026-03-20',
      points: 5,
      points_expiry: 'week',
      is_required: 0,
      status: 1,
      repeat: null,
      is_all_day: 0,
      penalty_applied: 1,
      penalty_deducted_points: 4,
      penalty_refunded: 1,
      penalty_refund_time: 1500,
      star_awarded: 0,
      completion_time: 1500,
      modify_time: 1500,
      deleted_at: null
    };
    const updatedRow = {
      ...existingRow,
      status: 0,
      penalty_refunded: 0,
      penalty_refund_time: null,
      completion_time: null,
      modify_time: 3000
    };

    let selectCount = 0;
    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(),
      execute: jest.fn().mockImplementation(async (sql) => {
        if (sql.startsWith('SELECT * FROM tasks')) {
          selectCount += 1;
          return [[selectCount === 1 ? existingRow : updatedRow]];
        }
        if (sql.startsWith('UPDATE tasks SET')) {
          return [{ affectedRows: 1 }, undefined];
        }
        throw new Error(`unexpected sql: ${sql}`);
      }),
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
      'status', 'repeat', 'is_all_day', 'penalty_applied', 'penalty_deducted_points',
      'penalty_refunded', 'penalty_refund_time', 'deleted_at', 'completion_time',
      'star_awarded', 'modify_time'
    ]));

    const service = require('../../services/taskService');
    const result = await service.updateTaskStatus('task_makeup_002', {
      status: 0,
      modifyTime: 3000,
      operationKey: 'm16c_reset_001'
    }, {
      actorUserId: 'child_001',
      actorRole: 'child',
      familyId: 'family_001'
    });

    expect(result.status).toBe(0);
    expect(starService.upsertStarRecordWithConnection).toHaveBeenCalledWith(
      connection,
      'child_001',
      expect.objectContaining({
        type: 'expense',
        points: -4,
        expiryType: 'permanent',
        idempotencyKey: 'task_makeup_refund_revoke:task_makeup_002:m16c_reset_001'
      })
    );
    expect(messageService.createTaskMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reset',
        refundPoints: 0
      }),
      connection
    );
    expect(connection.commit).toHaveBeenCalled();
  });

  it('updateTaskStatus 状态与 starAwarded 都未变化时应直接返回，不重复写消息和星星流水', async () => {
    const { getPool, query } = require('../../config/database');
    const messageService = require('../../services/messageService');
    const starService = require('../../services/starService');

    const existingRow = {
      task_id: 'task_makeup_003',
      user_id: 'child_001',
      title: '背单词',
      type: 'study',
      date: '2026-03-20',
      points: 5,
      points_expiry: 'week',
      is_required: 0,
      status: 1,
      repeat: null,
      is_all_day: 0,
      penalty_applied: 1,
      penalty_deducted_points: 4,
      penalty_refunded: 1,
      penalty_refund_time: 2000,
      star_awarded: 0,
      completion_time: 2000,
      modify_time: 2000,
      deleted_at: null
    };

    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(),
      execute: jest.fn().mockImplementation(async (sql) => {
        if (sql.startsWith('SELECT * FROM tasks')) {
          return [[existingRow]];
        }
        throw new Error(`unexpected sql: ${sql}`);
      }),
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
      'status', 'repeat', 'is_all_day', 'penalty_applied', 'penalty_deducted_points',
      'penalty_refunded', 'penalty_refund_time', 'deleted_at', 'completion_time',
      'star_awarded', 'modify_time'
    ]));

    const service = require('../../services/taskService');
    const result = await service.updateTaskStatus('task_makeup_003', {
      status: 1,
      modifyTime: 3000,
      operationKey: 'm16c_complete_same_status'
    }, {
      actorUserId: 'child_001',
      actorRole: 'child',
      familyId: 'family_001'
    });

    expect(result.status).toBe(1);
    expect(result.penaltyRefunded).toBe(true);
    expect(connection.execute).toHaveBeenCalledTimes(1);
    expect(starService.grantStarsWithConnection).not.toHaveBeenCalled();
    expect(starService.upsertStarRecordWithConnection).not.toHaveBeenCalled();
    expect(messageService.createTaskMessages).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});
