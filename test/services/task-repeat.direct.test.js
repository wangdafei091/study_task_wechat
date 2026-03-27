jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const logger = require('../../utils/logger');
const taskRepeat = require('../../services/task-service/task-repeat');

function buildTask(overrides = {}) {
  return {
    id: 'parent_1',
    title: '重复任务',
    date: '2026-03-26',
    userId: 'child_1',
    isRepeating: jest.fn(() => true),
    repeat: {
      type: 'daily',
      startDate: '2026-03-26',
      endDate: '2026-03-28'
    },
    ...overrides
  };
}

describe('task-repeat direct behavior', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('应处理非重复任务和缺少开始日期分支', async () => {
    const service = {
      taskRepository: {
        saveAll: jest.fn(async () => [])
      }
    };

    await expect(taskRepeat.generateRepeatTasks(service, {
      isRepeating: jest.fn(() => false)
    })).resolves.toEqual([]);
    await expect(taskRepeat.generateRepeatTasks(service, buildTask({
      repeat: null
    }))).resolves.toEqual([]);
  });

  it('云同步阶段应覆盖失败补偿与 saveAll 降级分支', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-26T08:00:00Z'));

    const firstSaveAll = jest.fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('save synced fail'));
    const service = {
      enableCloudStorage: true,
      taskRepository: {
        saveAll: firstSaveAll
      },
      _syncTaskToCloud: jest.fn()
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('sync fail')),
      _createRepeatTaskInstance: jest.fn((task, date) => ({
        id: `repeat_${date.getDate()}`,
        date: `2026-03-${String(date.getDate()).padStart(2, '0')}`,
        userId: task.userId,
        syncedToCloud: false,
        pendingSyncMeta: { action: 'create' }
      })),
      _emitTaskCloudSyncFailure: jest.fn(() => Promise.reject(new Error('emit fail')))
    };

    const promise = taskRepeat.generateRepeatTasks(service, buildTask({
      repeat: {
        type: 'daily',
        startDate: '2026-03-26',
        endDate: '2026-03-28'
      }
    }));

    const result = await promise;
    await Promise.resolve();
    await Promise.resolve();

    expect(result).toHaveLength(2);
    expect(service._syncTaskToCloud).toHaveBeenCalled();
    expect(service._emitTaskCloudSyncFailure).toHaveBeenCalled();
    expect(firstSaveAll).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith('TaskService', '更新 syncedToCloud 标记失败', { error: 'save synced fail' });
  });

  it('syncInBatches 意外失败时应走最外层 catch', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-26T08:00:00Z'));

    const service = {
      enableCloudStorage: true,
      taskRepository: {
        saveAll: jest.fn(async () => [])
      },
      _syncTaskToCloud: null,
      _createRepeatTaskInstance: jest.fn((task, date) => ({
        id: `repeat_${date.getDate()}`,
        date: `2026-03-${String(date.getDate()).padStart(2, '0')}`,
        userId: task.userId,
        syncedToCloud: false,
        pendingSyncMeta: { action: 'create' }
      })),
      _emitTaskCloudSyncFailure: jest.fn(async () => true)
    };

    const result = await taskRepeat.generateRepeatTasks(service, buildTask());
    await Promise.resolve();
    await Promise.resolve();

    expect(service._createRepeatTaskInstance).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(logger.warn).toHaveBeenCalledWith(
      'TaskService',
      expect.stringContaining('重复任务批量云端同步异常:')
    );
  });
});
