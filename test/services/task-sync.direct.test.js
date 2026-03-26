jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const mockHttpClient = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  request: jest.fn()
};

jest.mock('../../utils/http-client', () => mockHttpClient);
jest.mock('../../utils/api-config', () => ({
  ENDPOINTS: {
    TASKS: '/tasks',
    TASK_BY_ID: '/tasks/{taskId}',
    TASK_STATUS: '/tasks/{taskId}/status',
    TASKS_TRANSFER: '/tasks/transfer'
  }
}));

const taskSync = require('../../services/task-service/task-sync');
const { TaskStatus } = require('../../models/task');

describe('task-sync direct behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetchSingleTaskFromCloud 应覆盖成功、空数据和失败分支', async () => {
    const service = {
      userService: {
        getLoginUserId: jest.fn(() => 'parent_1')
      },
      taskRepository: {
        save: jest.fn(async (task) => task)
      }
    };

    mockHttpClient.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ taskId: 'task_1', userId: 'parent_1', title: '任务1', date: '2026-03-26' })
      .mockRejectedValueOnce(new Error('network fail'));

    await expect(taskSync.fetchSingleTaskFromCloud(service, 'task_0')).resolves.toBeNull();
    const savedTask = await taskSync.fetchSingleTaskFromCloud(service, 'task_1');
    await expect(taskSync.fetchSingleTaskFromCloud(service, 'task_2')).resolves.toBeNull();

    expect(savedTask).toEqual(expect.objectContaining({
      id: 'task_1',
      syncedToCloud: true
    }));
    expect(service.taskRepository.save).toHaveBeenCalledTimes(1);
  });

  it('mergeLocalTasksIntoCloudResult 应覆盖无目标、本地为空、补并和异常分支', async () => {
    const service = {
      userService: {
        getLoginUserId: jest.fn(() => 'parent_1')
      }
    };

    await expect(taskSync.mergeLocalTasksIntoCloudResult(service, [{ id: 'cloud_1' }], null, null)).resolves.toEqual([{ id: 'cloud_1' }]);
    await expect(taskSync.mergeLocalTasksIntoCloudResult(service, [{ id: 'cloud_1' }], null, async () => [])).resolves.toEqual([{ id: 'cloud_1' }]);
    await expect(taskSync.mergeLocalTasksIntoCloudResult(service, [{ id: 'cloud_1' }], 'child_1', async () => [
      { id: 'cloud_1' },
      { id: 'local_1' }
    ])).resolves.toEqual([{ id: 'cloud_1' }, { id: 'local_1' }]);
    await expect(taskSync.mergeLocalTasksIntoCloudResult(service, [{ id: 'cloud_1' }], 'child_1', async () => {
      throw new Error('merge fail');
    }, '日期任务')).resolves.toEqual([{ id: 'cloud_1' }]);
  });

  it('syncUpdateToCloud 应覆盖禁用、成功和失败分支', async () => {
    const service = {
      enableCloudStorage: false,
      _buildTaskPendingSyncMeta: jest.fn(() => ({
        operationKey: 'op_1',
        modifyTime: 101,
        operatorUserId: 'parent_1',
        operatorRole: 'parent',
        familyId: 'family_1'
      })),
      _markTaskSynced: jest.fn(async () => true)
    };
    const task = {
      id: 'task_1',
      title: '任务1',
      description: 'desc',
      date: '2026-03-26',
      type: 'study',
      startTime: '18:00',
      endTime: '19:00',
      duration: 60,
      isAllDay: false,
      isRequired: false,
      penaltyApplied: false,
      points: 5,
      pointsExpiry: 'permanent',
      tags: [],
      hasNoEndDate: false,
      repeat: null,
      modifyTime: 99
    };

    await expect(taskSync.syncUpdateToCloud(service, task)).resolves.toBeUndefined();

    service.enableCloudStorage = true;
    mockHttpClient.put.mockResolvedValueOnce({});
    await expect(taskSync.syncUpdateToCloud(service, task)).resolves.toBeUndefined();

    mockHttpClient.put.mockRejectedValueOnce(new Error('put fail'));
    await expect(taskSync.syncUpdateToCloud(service, task)).rejects.toThrow('put fail');
  });

  it('syncDeleteToCloud 应覆盖禁用、404 跳过和异常抛出', async () => {
    const service = {
      enableCloudStorage: false,
      _removeDeleteTombstone: jest.fn(async () => true)
    };

    await expect(taskSync.syncDeleteToCloud(service, 'task_1')).resolves.toBeUndefined();

    service.enableCloudStorage = true;
    mockHttpClient.request.mockRejectedValueOnce(new Error('404 not found'));
    await expect(taskSync.syncDeleteToCloud(service, 'task_2', {
      operationKey: 'op_2',
      operatorUserId: 'parent_1',
      operatorRole: 'parent',
      familyId: 'family_1'
    })).resolves.toBeUndefined();

    mockHttpClient.request.mockRejectedValueOnce(new Error('delete fail'));
    await expect(taskSync.syncDeleteToCloud(service, 'task_3')).rejects.toThrow('delete fail');
    expect(service._removeDeleteTombstone).toHaveBeenCalledWith('task_2');
  });

  it('syncStatusToCloud 应覆盖 reset 分支和失败分支', async () => {
    const service = {
      enableCloudStorage: true,
      _buildTaskPendingSyncMeta: jest.fn(() => ({
        operationKey: 'op_status',
        modifyTime: 202,
        operatorUserId: 'parent_1',
        operatorRole: 'parent',
        familyId: 'family_1'
      })),
      _markTaskSynced: jest.fn(async () => true)
    };
    const task = {
      id: 'task_status',
      status: TaskStatus.PENDING,
      starAwarded: false,
      modifyTime: 100
    };

    mockHttpClient.patch.mockResolvedValueOnce({});
    await expect(taskSync.syncStatusToCloud(service, task)).resolves.toBeUndefined();

    mockHttpClient.patch.mockRejectedValueOnce(new Error('patch fail'));
    await expect(taskSync.syncStatusToCloud(service, {
      ...task,
      status: TaskStatus.COMPLETED
    })).rejects.toThrow('patch fail');
  });
});
