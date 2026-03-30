jest.mock('../../config/database', () => ({
  getPool: jest.fn(),
  query: jest.fn(),
  execute: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })
}));

jest.mock('../../services/messageService', () => ({
  createTaskMessages: jest.fn()
}));

jest.mock('../../services/starService', () => ({
  consumeStarsWithConnection: jest.fn()
}));

const Task = require('../../models/Task');

describe('backend TaskService M15A message sync', () => {
  let database;
  let messageService;
  let starService;
  let connection;
  let taskService;

  function createTaskRow(overrides = {}) {
    return {
      task_id: 'task_1',
      user_id: 'child_1',
      title: '背单词',
      description: '',
      type: 'study',
      date: '2026-03-01',
      start_time: '18:00',
      end_time: '18:30',
      points: 5,
      points_expiry: 'permanent',
      is_required: 1,
      status: 0,
      repeat: null,
      is_all_day: 0,
      penalty_applied: 0,
      modify_time: 100,
      deleted_at: null,
      ...overrides
    };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    database = require('../../config/database');
    messageService = require('../../services/messageService');
    starService = require('../../services/starService');

    connection = {
      beginTransaction: jest.fn().mockResolvedValue(),
      execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn()
    };

    database.getPool.mockReturnValue({
      getConnection: jest.fn().mockResolvedValue(connection)
    });

    taskService = require('../../services/taskService');
    jest.spyOn(taskService, '_getTaskColumnMap').mockResolvedValue({
      penaltyApplied: 'penalty_applied',
      modifyTime: 'modify_time',
      reminder: 'reminder'
    });
  });

  it('penalty 消息创建失败时应整体回滚事务', async () => {
    jest.spyOn(taskService, '_getTaskByIdConn')
      .mockResolvedValueOnce(createTaskRow())
      .mockResolvedValueOnce(createTaskRow({ penalty_applied: 1, modify_time: 200 }));

    starService.consumeStarsWithConnection.mockResolvedValue({
      consumedPoints: 5
    });
    messageService.createTaskMessages.mockRejectedValue(new Error('message fail'));

    await expect(taskService._applyRequiredTaskPenalty('task_1', {
      familyId: 'family_1',
      actorRole: 'system'
    })).rejects.toThrow('message fail');

    expect(connection.beginTransaction).toHaveBeenCalled();
    expect(starService.consumeStarsWithConnection).toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalled();
  });

  it('upcoming sync 应归档 stale 提醒并区分新增与去重记录', async () => {
    jest.spyOn(taskService, '_resolvePenaltyScanUserIds').mockResolvedValue(['child_1']);
    jest.spyOn(taskService, '_getUpcomingTasksForReminder').mockResolvedValue([
      createTaskRow({
        task_id: 'task_upcoming_1',
        reminder: JSON.stringify({ enabled: true, time: 30 }),
        modify_time: 300
      })
    ]);
    jest.spyOn(taskService, '_resolveUpcomingReminderCandidate').mockReturnValue({
      task: {
        taskId: 'task_upcoming_1',
        userId: 'child_1',
        title: '整理书包',
        isRequired: false,
        date: '2026-03-30',
        reminder: { enabled: true, time: 30 }
      },
      slotKey: 'task_upcoming_1:30m',
      reminderTime: 1000,
      remainingMinutes: 30,
      remainingText: '30分钟'
    });

    jest.spyOn(taskService, '_getActiveUpcomingMessagesBySubjectConn').mockResolvedValue([
      {
        messageId: 'msg_family_existing',
        visibility_scope: 'family',
        message_event_key: 'task:task_upcoming_1:task_upcoming:child_1:none:task_upcoming_1:30m'
      },
      {
        messageId: 'msg_stale',
        visibility_scope: 'user',
        message_event_key: 'task:task_old:task_upcoming:child_1:none:task_old:60m'
      }
    ]);

    messageService.createTaskMessages.mockResolvedValue([
      {
        messageId: 'msg_family_existing',
        visibilityScope: 'family',
        messageEventKey: 'task:task_upcoming_1:task_upcoming:child_1:none:task_upcoming_1:30m',
        relatedId: 'task_upcoming_1'
      },
      {
        messageId: 'msg_user_new',
        visibilityScope: 'user',
        messageEventKey: 'task:task_upcoming_1:task_upcoming:child_1:none:task_upcoming_1:30m:user',
        relatedId: 'task_upcoming_1'
      }
    ]);

    const result = await taskService.syncUpcomingTaskMessages({
      familyId: 'family_1',
      modifyTime: 1000
    });

    expect(connection.beginTransaction).toHaveBeenCalled();
    expect(connection.execute).toHaveBeenCalledWith(
      expect.stringContaining('SET is_archived = 1'),
      ['msg_stale']
    );
    expect(connection.commit).toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      createdCount: 1,
      dedupedCount: 1,
      archivedCount: 1,
      activeCount: 2,
      affectedTaskIds: ['task_upcoming_1']
    });
  });

  it('penalty sync 中单任务失败时应记录失败并继续其他任务', async () => {
    jest.spyOn(taskService, '_resolvePenaltyScanUserIds').mockResolvedValue(['child_1']);
    jest.spyOn(taskService, '_getExpiredRequiredTasksForPenalty').mockResolvedValue([
      Task.fromDB(createTaskRow({ task_id: 'task_fail' })),
      Task.fromDB(createTaskRow({ task_id: 'task_ok', title: '阅读', user_id: 'child_2' }))
    ]);
    jest.spyOn(taskService, '_applyRequiredTaskPenalty')
      .mockRejectedValueOnce(new Error('message fail'))
      .mockResolvedValueOnce({
        success: true,
        task: { taskId: 'task_ok' },
        penaltyPoints: 3,
        targetUserId: 'child_2'
      });

    const result = await taskService.syncRequiredTaskPenalties({
      familyId: 'family_1',
      modifyTime: 1000
    });

    expect(result).toEqual({
      success: true,
      penaltyCount: 1,
      failureCount: 1,
      affectedTaskIds: ['task_ok'],
      penaltyResults: [{
        success: true,
        taskId: 'task_ok',
        penaltyPoints: 3,
        targetUserId: 'child_2'
      }],
      failedTaskIds: ['task_fail']
    });
  });
});
