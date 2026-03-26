jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const taskPenalty = require('../../services/task-service/task-penalty');
const { TaskStatus } = require('../../models/task');

describe('task-penalty direct behavior', () => {
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
