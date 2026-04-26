jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const mockHttpClient = {
  post: jest.fn()
};

jest.mock('../../utils/http-client', () => mockHttpClient);
jest.mock('../../utils/api-config', () => ({
  ENDPOINTS: {
    TASK_PENALTIES_SYNC: '/api/tasks/penalties/sync'
  }
}));

const taskPenalty = require('../../services/task-service/task-penalty');
const { TaskStatus } = require('../../models/task');

describe('task-penalty direct behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('checkTasksStatus 应过滤虚拟孩子并处理异常分支', async () => {
    const service = {
      userService: {
        getLoginUserId: jest.fn(() => 'parent_1'),
        getAllUsers: jest.fn(() => [
          { userId: 'child_virtual', role: 'child', isVirtual: true, createdByUserId: 'parent_1' },
          { userId: 'child_other', role: 'child', isVirtual: true, createdByUserId: 'parent_2' }
        ])
      },
      getExpiredIncompleteTasks: jest.fn(async () => [
        { id: 'task_1', title: '待惩罚', userId: 'child_virtual', isRequired: true, penaltyApplied: false, status: TaskStatus.PENDING, date: '2026-03-25' },
        { id: 'task_2', title: '他人任务', userId: 'child_other', isRequired: true, penaltyApplied: false, status: TaskStatus.PENDING, date: '2026-03-25' }
      ]),
      getRequiredTasks: jest.fn(async () => [{ id: 'task_1' }]),
      handleRequiredTaskPenalty: jest.fn(async (task) => ({ success: true, task }))
    };

    const result = await taskPenalty.checkTasksStatus(service);

    expect(result.success).toBe(true);
    expect(result.expiredTasks).toHaveLength(1);
    expect(service.handleRequiredTaskPenalty).toHaveBeenCalledWith(expect.objectContaining({ id: 'task_1' }));

    service.getExpiredIncompleteTasks.mockRejectedValueOnce(new Error('expired fail'));
    await expect(taskPenalty.checkTasksStatus(service)).resolves.toEqual({
      success: false,
      message: '检查任务状态失败: expired fail'
    });
  });

  it('云端模式下 checkTasksStatus 应改走后端 penalty sync', async () => {
    const service = {
      enableCloudStorage: true,
      userService: {
        getLoginUser: jest.fn(() => ({
          userId: 'parent_1',
          role: 'parent',
          familyPermissionRole: 'manager'
        }))
      }
    };
    mockHttpClient.post.mockResolvedValue({
      penaltyCount: 1,
      affectedTaskIds: ['task_cloud_1'],
      penaltyResults: [{ success: true, taskId: 'task_cloud_1', penaltyPoints: 5 }]
    });

    const result = await taskPenalty.checkTasksStatus(service);

    expect(mockHttpClient.post).toHaveBeenCalledWith('/api/tasks/penalties/sync', {});
    expect(result).toEqual({
      success: true,
      expiredTasks: [],
      requiredTasks: [],
      penaltyResults: [{ success: true, taskId: 'task_cloud_1', penaltyPoints: 5 }],
      penaltyCount: 1,
      affectedTaskIds: ['task_cloud_1']
    });
  });

  it('云端模式下 viewer 应跳过任务惩罚同步，不发起后端请求', async () => {
    const service = {
      enableCloudStorage: true,
      userService: {
        getLoginUser: jest.fn(() => ({
          userId: 'parent_viewer',
          role: 'parent',
          familyPermissionRole: 'viewer'
        }))
      }
    };

    const result = await taskPenalty.checkTasksStatus(service);

    expect(mockHttpClient.post).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      skipped: true,
      reason: 'viewer_readonly',
      expiredTasks: [],
      requiredTasks: [],
      penaltyResults: [],
      penaltyCount: 0,
      affectedTaskIds: []
    });
  });

  it('云端模式下系统只读应跳过任务惩罚同步，不发起后端请求', async () => {
    const service = {
      enableCloudStorage: true,
      userService: {
        getLoginUser: jest.fn(() => ({
          userId: 'parent_readonly',
          role: 'parent',
          familyPermissionRole: 'manager',
          systemAccessLevel: 'readonly'
        }))
      }
    };

    const result = await taskPenalty.checkTasksStatus(service);

    expect(mockHttpClient.post).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      skipped: true,
      reason: 'system_readonly',
      expiredTasks: [],
      requiredTasks: [],
      penaltyResults: [],
      penaltyCount: 0,
      affectedTaskIds: []
    });
  });

  it('handleRequiredTaskPenalty 应覆盖无 starService、零积分和异常路径', async () => {
    const service = {
      starService: null,
      taskRepository: {
        save: jest.fn(async (task) => task)
      },
      eventBus: {
        emit: jest.fn()
      }
    };

    const zeroPointsTask = {
      id: 'task_zero',
      title: '零积分任务',
      isRequired: true,
      points: 0,
      userId: 'child_1'
    };
    const zeroResult = await taskPenalty.handleRequiredTaskPenalty(service, zeroPointsTask);

    expect(zeroResult).toEqual(expect.objectContaining({
      success: true,
      penaltyPoints: 0,
      targetUserId: 'child_1'
    }));
    expect(service.eventBus.emit).toHaveBeenCalled();

    service.starService = {
      consumeStars: jest.fn(() => Promise.reject(new Error('consume fail')))
    };
    await expect(taskPenalty.handleRequiredTaskPenalty(service, {
      id: 'task_fail',
      title: '异常任务',
      isRequired: true,
      points: 3,
      userId: 'child_1'
    })).resolves.toEqual({
      success: false,
      message: '应用惩罚失败: consume fail'
    });
  });
});
