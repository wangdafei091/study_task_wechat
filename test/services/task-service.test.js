/**
 * task-service.test.js - TaskService 测试
 *
 * 测试 TaskService 的核心业务逻辑
 */

const TaskService = require('../../services/task-service');
const EventBus = require('../../utils/core/event-bus');
const { Task, TaskStatus, TaskType, RepeatType } = require('../../models/task');

// Mock依赖
jest.mock('../../utils/logger');
jest.mock('../../services/star-service');
jest.mock('../../services/reward-service');
jest.mock('../../services/user-service');
jest.mock('../../repositories/index');

const StarService = require('../../services/star-service');
const RewardService = require('../../services/reward-service');
const UserService = require('../../services/user-service');
const { TaskRepository } = require('../../repositories/index');

describe('TaskService', () => {
  let taskService;
  let mockTaskRepository;
  let mockStarService;
  let mockRewardService;
  let mockUserService;
  let mockEventBus;
  let mockTask;

  beforeEach(() => {
    // 重置所有mock
    jest.clearAllMocks();

    // 创建Mock仓储
    mockTaskRepository = {
      loadFromStorage: jest.fn().mockResolvedValue(true),
      save: jest.fn().mockImplementation(async (task) => task),
      getAll: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(true),
      getTodayTasks: jest.fn().mockResolvedValue([]),
      getTasksByDate: jest.fn().mockResolvedValue([]),
      getTasksByDateRange: jest.fn().mockResolvedValue([]),
      getRequiredTasks: jest.fn().mockResolvedValue([]),
      getExpiredIncompleteTask: jest.fn().mockResolvedValue([])
    };

    // Mock TaskRepository构造函数
    TaskRepository.mockImplementation(() => mockTaskRepository);

    // 创建Mock服务
    mockStarService = {
      addStars: jest.fn().mockResolvedValue({ success: true, stars: 10 }),
      consumeStars: jest.fn().mockResolvedValue({ success: true, consumed: 5 }),
      consumeStarsFromSpecificType: jest.fn().mockResolvedValue({ success: true, consumed: 5 }),
      calculateExpiryDate: jest.fn().mockReturnValue({ expiry: 'permanent', expiryDateStr: '永久' })
    };

    mockRewardService = {
      getLastExchangeTime: jest.fn().mockResolvedValue(null)
    };

    mockUserService = {
      getCurrentUserId: jest.fn().mockReturnValue('parent'),
      getUserByRole: jest.fn().mockReturnValue({ id: 'child' })
    };

    // 创建EventBus实例
    mockEventBus = new EventBus();

    // 监听事件发布
    mockEventBus.on = jest.fn((event, callback) => {
      mockEventBus[event] = callback;
      return mockEventBus;
    });
    mockEventBus.emit = jest.fn();

    // 创建TaskService实例
    taskService = new TaskService({
      taskRepository: mockTaskRepository,
      starService: mockStarService,
      rewardService: mockRewardService,
      userService: mockUserService,
      eventBus: mockEventBus
    });

    // 创建Mock任务
    mockTask = new Task({
      id: 'task_1',
      userId: 'parent',
      title: '测试任务',
      type: TaskType.STUDY,
      date: '2026-03-02',
      status: TaskStatus.PENDING,
      points: 10,
      pointsExpiry: 'permanent',
      starAwarded: false
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('初始化', () => {
    it('应该正确初始化服务', async () => {
      const initialized = await taskService.initialize();
      expect(initialized).toBe(true);
      expect(mockTaskRepository.loadFromStorage).toHaveBeenCalled();
    });

    it('初始化失败时应该返回false', async () => {
      mockTaskRepository.loadFromStorage.mockRejectedValue(new Error('加载失败'));
      const initialized = await taskService.initialize();
      expect(initialized).toBe(false);
    });
  });

  describe('getAllTasks - 获取所有任务', () => {
    it('应该获取所有任务（不指定用户）', async () => {
      const tasks = [mockTask];
      mockTaskRepository.getAll.mockResolvedValue(tasks);

      const result = await taskService.getAllTasks();

      expect(result).toEqual(tasks);
      expect(mockTaskRepository.getAll).toHaveBeenCalled();
    });

    it('应该获取指定用户的任务', async () => {
      const tasks = [mockTask];
      mockTaskRepository.getAll.mockResolvedValue(tasks);

      const result = await taskService.getAllTasks('parent');

      expect(result).toEqual(tasks);
      expect(mockTaskRepository.getAll).toHaveBeenCalled();
    });

    it('获取失败时应该返回空数组', async () => {
      mockTaskRepository.getAll.mockRejectedValue(new Error('获取失败'));

      const result = await taskService.getAllTasks();

      expect(result).toEqual([]);
    });
  });

  describe('getTaskById - 获取任务详情', () => {
    it('应该获取任务详情', async () => {
      mockTaskRepository.getById.mockResolvedValue(mockTask);

      const result = await taskService.getTaskById('task_1');

      expect(result).toEqual(mockTask);
      expect(mockTaskRepository.getById).toHaveBeenCalledWith('task_1');
    });

    it('应该验证用户访问权限', async () => {
      mockTaskRepository.getById.mockResolvedValue(mockTask);

      const result = await taskService.getTaskById('task_1', 'other_user');

      expect(result).toBeNull();
    });

    it('任务不存在时应该返回null', async () => {
      mockTaskRepository.getById.mockResolvedValue(null);

      const result = await taskService.getTaskById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getTodayTasks - 获取今日任务', () => {
    it('应该获取今日任务', async () => {
      const tasks = [mockTask];
      mockTaskRepository.getTodayTasks.mockResolvedValue(tasks);

      const result = await taskService.getTodayTasks();

      expect(result).toEqual(tasks);
      expect(mockTaskRepository.getTodayTasks).toHaveBeenCalledWith(null);
    });

    it('应该获取指定用户的今日任务', async () => {
      const tasks = [mockTask];
      mockTaskRepository.getTodayTasks.mockResolvedValue(tasks);

      const result = await taskService.getTodayTasks('parent');

      expect(result).toEqual(tasks);
      expect(mockTaskRepository.getTodayTasks).toHaveBeenCalledWith('parent');
    });
  });

  describe('getTasksByDate - 按日期获取任务', () => {
    it('应该按日期获取任务', async () => {
      const tasks = [mockTask];
      mockTaskRepository.getTasksByDate.mockResolvedValue(tasks);

      const result = await taskService.getTasksByDate('2026-03-02');

      expect(result).toEqual(tasks);
      expect(mockTaskRepository.getTasksByDate).toHaveBeenCalledWith('2026-03-02', null);
    });

    it('应该获取指定用户指定日期的任务', async () => {
      const tasks = [mockTask];
      mockTaskRepository.getTasksByDate.mockResolvedValue(tasks);

      const result = await taskService.getTasksByDate('2026-03-02', 'parent');

      expect(result).toEqual(tasks);
      expect(mockTaskRepository.getTasksByDate).toHaveBeenCalledWith('2026-03-02', 'parent');
    });
  });

  describe('getTasksByDateRange - 获取日期范围内的任务', () => {
    it('应该获取日期范围内的任务', async () => {
      const tasks = [mockTask];
      mockTaskRepository.getTasksByDateRange.mockResolvedValue(tasks);

      const result = await taskService.getTasksByDateRange('2026-03-01', '2026-03-07');

      expect(result).toEqual(tasks);
      expect(mockTaskRepository.getTasksByDateRange).toHaveBeenCalledWith('2026-03-01', '2026-03-07', null);
    });
  });

  describe('getRequiredTasks - 获取必做任务', () => {
    it('应该获取必做任务', async () => {
      const requiredTask = new Task({
        ...mockTask,
        isRequired: true
      });
      mockTaskRepository.getRequiredTasks.mockResolvedValue([requiredTask]);

      const result = await taskService.getRequiredTasks();

      expect(result).toEqual([requiredTask]);
      expect(mockTaskRepository.getRequiredTasks).toHaveBeenCalledWith(undefined, null);
    });

    it('应该获取指定日期的必做任务', async () => {
      const requiredTask = new Task({
        ...mockTask,
        isRequired: true
      });
      mockTaskRepository.getRequiredTasks.mockResolvedValue([requiredTask]);

      const result = await taskService.getRequiredTasks('2026-03-02');

      expect(result).toEqual([requiredTask]);
      expect(mockTaskRepository.getRequiredTasks).toHaveBeenCalledWith('2026-03-02', null);
    });
  });

  describe('getExpiredIncompleteTasks - 获取过期未完成任务', () => {
    it('应该获取过期未完成任务', async () => {
      const expiredTask = new Task({
        ...mockTask,
        date: '2026-03-01'
      });
      mockTaskRepository.getExpiredIncompleteTask.mockResolvedValue([expiredTask]);

      const result = await taskService.getExpiredIncompleteTasks();

      expect(result).toEqual([expiredTask]);
      expect(mockTaskRepository.getExpiredIncompleteTask).toHaveBeenCalledWith(null);
    });
  });

  describe('createTask - 创建任务', () => {
    it('应该成功创建任务', async () => {
      const taskData = {
        userId: 'parent',
        title: '新任务',
        type: TaskType.STUDY,
        date: '2026-03-02',
        points: 10,
        pointsExpiry: 'permanent',
        isAllDay: true // 全天任务不需要时间字段
      };

      mockTaskRepository.save.mockResolvedValue(new Task(taskData));

      const result = await taskService.createTask(taskData);

      expect(result.success).toBe(true);
      expect(result.task).toBeDefined();
      expect(mockTaskRepository.save).toHaveBeenCalled();
      expect(mockEventBus.emit).toHaveBeenCalled();
    });

    it('应该为没有userId的任务设置默认用户ID', async () => {
      const taskData = {
        title: '新任务',
        type: TaskType.HABIT, // 使用习惯任务，不需要时间字段
        date: '2026-03-02'
      };

      const newTask = new Task({
        ...taskData,
        userId: 'parent'
      });
      mockTaskRepository.save.mockResolvedValue(newTask);

      await taskService.createTask(taskData);

      expect(mockTaskRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'parent' })
      );
    });

    it('任务数据验证失败时应该返回错误', async () => {
      const invalidTaskData = {
        userId: 'parent',
        // 缺少必需字段title
      };

      const result = await taskService.createTask(invalidTaskData);

      expect(result.success).toBe(false);
      expect(result.message).toContain('标题');
    });

    it('应该处理重复任务（每日）', async () => {
      const repeatTaskData = {
        userId: 'parent',
        title: '每日任务',
        type: TaskType.HABIT,
        date: '2026-03-02',
        repeat: {
          type: RepeatType.DAILY,
          startDate: '2026-03-02',
          endDate: '2026-03-07'
        }
      };

      const task = new Task(repeatTaskData);
      mockTaskRepository.save.mockResolvedValue(task);

      const result = await taskService.createTask(repeatTaskData);

      expect(result.success).toBe(true);
    });

    it('应该触发任务创建事件', async () => {
      const taskData = {
        userId: 'parent',
        title: '新任务',
        type: TaskType.HABIT, // 使用习惯任务，不需要时间字段
        date: '2026-03-02'
      };

      const newTask = new Task(taskData);
      mockTaskRepository.save.mockResolvedValue(newTask);

      await taskService.createTask(taskData);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: expect.any(Object)
        })
      );
    });

    it('创建失败时应该返回错误', async () => {
      const taskData = {
        userId: 'parent',
        title: '新任务',
        type: TaskType.HABIT, // 使用习惯任务，不需要时间字段
        date: '2026-03-02'
      };

      mockTaskRepository.save.mockRejectedValue(new Error('保存失败'));

      const result = await taskService.createTask(taskData);

      expect(result.success).toBe(false);
      expect(result.message).toContain('创建任务失败');
    });
  });

  describe('updateTask - 更新任务', () => {
    it('应该成功更新任务', async () => {
      // 直接使用HABIT类型，避免学习任务的时间字段验证问题
      const habitTaskData = {
        id: 'task_1',
        userId: 'parent',
        title: '测试任务',
        type: TaskType.HABIT,
        date: '2026-03-02',
        status: TaskStatus.PENDING,
        points: 10,
        pointsExpiry: 'permanent',
        starAwarded: false
      };

      const habitTask = new Task(habitTaskData);

      mockTaskRepository.getById.mockResolvedValue(habitTask);

      // mock save方法，让它返回传入的任务对象
      mockTaskRepository.save.mockImplementation(async (task) => {
        return task;
      });

      const result = await taskService.updateTask('task_1', {
        title: '更新后的标题'
      });

      expect(result.success).toBe(true);
      expect(result.task.title).toBe('更新后的标题');
      expect(mockEventBus.emit).toHaveBeenCalled();
    });

    it('任务不存在时应该返回错误', async () => {
      mockTaskRepository.getById.mockResolvedValue(null);

      const result = await taskService.updateTask('nonexistent', {
        title: '新标题'
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('未找到指定的任务');
    });

    it('应该验证用户权限', async () => {
      mockTaskRepository.getById.mockResolvedValue(mockTask);

      const result = await taskService.updateTask('task_1', {
        title: '新标题'
      }, 'other_user');

      expect(result.success).toBe(false);
      expect(result.message).toBe('无权限操作此任务');
    });

    it('应该触发任务更新事件', async () => {
      // 直接使用HABIT类型，避免学习任务的时间字段验证问题
      const habitTaskData = {
        id: 'task_1',
        userId: 'parent',
        title: '测试任务',
        type: TaskType.HABIT,
        date: '2026-03-02',
        status: TaskStatus.PENDING,
        points: 10,
        pointsExpiry: 'permanent',
        starAwarded: false
      };

      const habitTask = new Task(habitTaskData);

      mockTaskRepository.getById.mockResolvedValue(habitTask);

      // mock save方法，让它返回传入的任务对象
      mockTaskRepository.save.mockImplementation(async (task) => {
        return task;
      });

      await taskService.updateTask('task_1', { title: '新标题' });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: expect.any(Object),
          changes: expect.any(Object),
          operationType: 'update'
        })
      );
    });
  });

  describe('deleteTask - 删除任务', () => {
    it('应该成功删除任务', async () => {
      mockTaskRepository.getById.mockResolvedValue(mockTask);
      mockTaskRepository.delete.mockResolvedValue(true);

      const result = await taskService.deleteTask('task_1');

      expect(result.success).toBe(true);
      expect(mockTaskRepository.delete).toHaveBeenCalledWith('task_1');
      expect(mockEventBus.emit).toHaveBeenCalled();
    });

    it('任务不存在时应该返回错误', async () => {
      mockTaskRepository.getById.mockResolvedValue(null);

      const result = await taskService.deleteTask('nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toBe('未找到指定的任务');
    });

    it('应该验证用户权限', async () => {
      mockTaskRepository.getById.mockResolvedValue(mockTask);

      const result = await taskService.deleteTask('task_1', 'other_user');

      expect(result.success).toBe(false);
      expect(result.message).toBe('无权限操作此任务');
    });

    it('suppressMessage为true时不应该触发事件', async () => {
      mockTaskRepository.getById.mockResolvedValue(mockTask);
      mockTaskRepository.delete.mockResolvedValue(true);

      await taskService.deleteTask('task_1', null, true);

      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('应该触发任务删除事件', async () => {
      mockTaskRepository.getById.mockResolvedValue(mockTask);
      mockTaskRepository.delete.mockResolvedValue(true);

      await taskService.deleteTask('task_1');

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          taskId: 'task_1',
          taskInfo: expect.any(Object)
        })
      );
    });
  });

  describe('updateTaskStatus - 更新任务状态', () => {
    it('应该成功更新任务状态为完成', async () => {
      mockTaskRepository.getById.mockResolvedValue(mockTask);
      mockTaskRepository.save.mockResolvedValue({
        ...mockTask,
        status: TaskStatus.COMPLETED
      });

      const result = await taskService.updateTaskStatus('task_1', TaskStatus.COMPLETED);

      expect(result.success).toBe(true);
      expect(result.task.status).toBe(TaskStatus.COMPLETED);
    });

    it('任务不存在时应该返回错误', async () => {
      mockTaskRepository.getById.mockResolvedValue(null);

      const result = await taskService.updateTaskStatus('nonexistent', TaskStatus.COMPLETED);

      expect(result.success).toBe(false);
      expect(result.message).toBe('未找到指定的任务');
    });

    it('状态未变化时应该返回unchanged', async () => {
      const completedTask = new Task({
        ...mockTask,
        status: TaskStatus.COMPLETED
      });
      mockTaskRepository.getById.mockResolvedValue(completedTask);

      const result = await taskService.updateTaskStatus('task_1', TaskStatus.COMPLETED);

      expect(result.success).toBe(true);
      expect(result.unchanged).toBe(true);
    });

    it('应该为完成任务分配积分（非必做任务）', async () => {
      const task = new Task({
        ...mockTask,
        status: TaskStatus.PENDING,
        starAwarded: false,
        isRequired: false,
        points: 10
      });

      mockTaskRepository.getById.mockResolvedValue(task);
      mockTaskRepository.save.mockResolvedValue({
        ...task,
        status: TaskStatus.COMPLETED,
        starAwarded: true
      });

      await taskService.updateTaskStatus('task_1', TaskStatus.COMPLETED);

      expect(mockStarService.addStars).toHaveBeenCalled();
    });

    it('必做任务不应该获得积分', async () => {
      const requiredTask = new Task({
        ...mockTask,
        status: TaskStatus.PENDING,
        starAwarded: false,
        isRequired: true,
        points: 10
      });

      mockTaskRepository.getById.mockResolvedValue(requiredTask);
      mockTaskRepository.save.mockResolvedValue({
        ...requiredTask,
        status: TaskStatus.COMPLETED
      });

      await taskService.updateTaskStatus('task_1', TaskStatus.COMPLETED);

      expect(mockStarService.addStars).not.toHaveBeenCalled();
    });

    it('已经获得过星星的任务不应该再次分配', async () => {
      const task = new Task({
        ...mockTask,
        status: TaskStatus.PENDING,
        starAwarded: true,
        isRequired: false,
        points: 10
      });

      mockTaskRepository.getById.mockResolvedValue(task);
      mockTaskRepository.save.mockResolvedValue({
        ...task,
        status: TaskStatus.COMPLETED
      });

      await taskService.updateTaskStatus('task_1', TaskStatus.COMPLETED);

      expect(mockStarService.addStars).not.toHaveBeenCalled();
    });

    it('应该触发任务状态更新事件', async () => {
      mockTaskRepository.getById.mockResolvedValue(mockTask);
      mockTaskRepository.save.mockResolvedValue({
        ...mockTask,
        status: TaskStatus.COMPLETED
      });

      await taskService.updateTaskStatus('task_1', TaskStatus.COMPLETED);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: expect.any(Object),
          previousStatus: TaskStatus.PENDING,
          operationType: 'complete'
        })
      );
    });

    it('应该触发任务完成事件', async () => {
      mockTaskRepository.getById.mockResolvedValue(mockTask);
      mockTaskRepository.save.mockResolvedValue({
        ...mockTask,
        status: TaskStatus.COMPLETED
      });

      await taskService.updateTaskStatus('task_1', TaskStatus.COMPLETED);

      // 应该触发状态更新事件和完成事件
      expect(mockEventBus.emit).toHaveBeenCalled();
    });
  });

  describe('completeTask - 完成任务', () => {
    it('应该成功完成任务', async () => {
      mockTaskRepository.getById.mockResolvedValue(mockTask);
      mockTaskRepository.save.mockResolvedValue({
        ...mockTask,
        status: TaskStatus.COMPLETED
      });

      const result = await taskService.completeTask('task_1');

      expect(result.success).toBe(true);
      expect(result.task.status).toBe(TaskStatus.COMPLETED);
    });

    it('应该传递用户ID给updateTaskStatus', async () => {
      mockTaskRepository.getById.mockResolvedValue(mockTask);
      mockTaskRepository.save.mockResolvedValue({
        ...mockTask,
        status: TaskStatus.COMPLETED
      });

      await taskService.completeTask('task_1', 'child_user');

      expect(mockTaskRepository.getById).toHaveBeenCalledWith('task_1');
    });
  });

  describe('resetTask - 重置任务', () => {
    it('应该成功重置已完成的任务', async () => {
      const completedTask = new Task({
        ...mockTask,
        status: TaskStatus.COMPLETED,
        starAwarded: true,
        points: 10
      });

      mockTaskRepository.getById.mockResolvedValue(completedTask);
      mockTaskRepository.save.mockResolvedValue({
        ...completedTask,
        status: TaskStatus.PENDING,
        starAwarded: false
      });

      const result = await taskService.resetTask('task_1');

      expect(result.success).toBe(true);
      expect(result.task.status).toBe(TaskStatus.PENDING);
      expect(result.task.starAwarded).toBe(false);
    });

    it('任务不存在时应该返回错误', async () => {
      mockTaskRepository.getById.mockResolvedValue(null);

      const result = await taskService.resetTask('nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toBe('未找到指定的任务');
    });

    it('未完成的任务无需重置', async () => {
      mockTaskRepository.getById.mockResolvedValue(mockTask);

      const result = await taskService.resetTask('task_1');

      expect(result.success).toBe(true);
      expect(result.unchanged).toBe(true);
    });

    it('应该扣减已获得的星星', async () => {
      const completedTask = new Task({
        ...mockTask,
        status: TaskStatus.COMPLETED,
        starAwarded: true,
        points: 10,
        pointsExpiry: 'permanent'
      });

      mockTaskRepository.getById.mockResolvedValue(completedTask);
      mockTaskRepository.save.mockResolvedValue({
        ...completedTask,
        status: TaskStatus.PENDING,
        starAwarded: false
      });

      await taskService.resetTask('task_1');

      expect(mockStarService.consumeStarsFromSpecificType).toHaveBeenCalledWith(
        10,
        'permanent',
        expect.any(String),
        expect.any(Object)
      );
    });

    it('星星扣减失败时应该返回错误', async () => {
      const completedTask = new Task({
        ...mockTask,
        status: TaskStatus.COMPLETED,
        starAwarded: true,
        points: 10
      });

      mockTaskRepository.getById.mockResolvedValue(completedTask);
      mockStarService.consumeStarsFromSpecificType.mockResolvedValue({
        success: false,
        message: '扣减失败'
      });

      const result = await taskService.resetTask('task_1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('扣减星星失败');
    });

    it('应该触发任务重置事件', async () => {
      const completedTask = new Task({
        ...mockTask,
        status: TaskStatus.COMPLETED,
        starAwarded: true,
        points: 10
      });

      mockTaskRepository.getById.mockResolvedValue(completedTask);
      mockTaskRepository.save.mockResolvedValue({
        ...completedTask,
        status: TaskStatus.PENDING,
        starAwarded: false
      });

      await taskService.resetTask('task_1');

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: expect.any(Object),
          starsDeducted: 10
        })
      );
    });
  });

  describe('markTaskAsRequired - 标记任务为必做', () => {
    it('应该成功标记任务为必做', async () => {
      mockTaskRepository.getById.mockResolvedValue(mockTask);
      mockTaskRepository.save.mockResolvedValue({
        ...mockTask,
        isRequired: true
      });

      const result = await taskService.markTaskAsRequired('task_1');

      expect(result.success).toBe(true);
      expect(result.task.isRequired).toBe(true);
    });

    it('任务不存在时应该返回错误', async () => {
      mockTaskRepository.getById.mockResolvedValue(null);

      const result = await taskService.markTaskAsRequired('nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toBe('未找到指定的任务');
    });

    it('已经是必做任务时应该返回unchanged', async () => {
      const requiredTask = new Task({
        ...mockTask,
        isRequired: true
      });
      mockTaskRepository.getById.mockResolvedValue(requiredTask);

      const result = await taskService.markTaskAsRequired('task_1');

      expect(result.success).toBe(true);
      expect(result.unchanged).toBe(true);
    });

    it('应该触发标记必做事件', async () => {
      mockTaskRepository.getById.mockResolvedValue(mockTask);
      mockTaskRepository.save.mockResolvedValue({
        ...mockTask,
        isRequired: true
      });

      await taskService.markTaskAsRequired('task_1');

      expect(mockEventBus.emit).toHaveBeenCalled();
    });
  });

  describe('unmarkTaskAsRequired - 取消必做标记', () => {
    it('应该成功取消必做标记', async () => {
      const requiredTask = new Task({
        ...mockTask,
        isRequired: true
      });
      mockTaskRepository.getById.mockResolvedValue(requiredTask);
      mockTaskRepository.save.mockResolvedValue({
        ...requiredTask,
        isRequired: false
      });

      const result = await taskService.unmarkTaskAsRequired('task_1');

      expect(result.success).toBe(true);
      expect(result.task.isRequired).toBe(false);
    });

    it('任务不存在时应该返回错误', async () => {
      mockTaskRepository.getById.mockResolvedValue(null);

      const result = await taskService.unmarkTaskAsRequired('nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toBe('未找到指定的任务');
    });

    it('本来就不是必做任务时应该返回unchanged', async () => {
      mockTaskRepository.getById.mockResolvedValue(mockTask);

      const result = await taskService.unmarkTaskAsRequired('task_1');

      expect(result.success).toBe(true);
      expect(result.unchanged).toBe(true);
    });
  });

  describe('checkTasksStatus - 检查任务状态', () => {
    it('应该检查过期任务和必做任务', async () => {
      const expiredTask = new Task({
        ...mockTask,
        date: '2026-03-01',
        isRequired: true,
        status: TaskStatus.PENDING,
        penaltyApplied: false
      });

      mockTaskRepository.getExpiredIncompleteTask.mockResolvedValue([expiredTask]);
      mockTaskRepository.getRequiredTasks.mockResolvedValue([expiredTask]);
      mockStarService.consumeStars.mockResolvedValue({ success: true, consumed: 5 });
      mockTaskRepository.save.mockResolvedValue(expiredTask);

      const result = await taskService.checkTasksStatus();

      expect(result.success).toBe(true);
      expect(result.expiredTasks).toEqual([expiredTask]);
      expect(result.requiredTasks).toEqual([expiredTask]);
    });

    it('应该对过期未完成的必做任务执行惩罚', async () => {
      const expiredTask = new Task({
        ...mockTask,
        date: '2026-03-01',
        isRequired: true,
        status: TaskStatus.PENDING,
        penaltyApplied: false,
        points: 5
      });

      mockTaskRepository.getExpiredIncompleteTask.mockResolvedValue([expiredTask]);
      mockTaskRepository.getRequiredTasks.mockResolvedValue([expiredTask]);
      mockStarService.consumeStars.mockResolvedValue({ success: true, consumed: 5 });
      mockTaskRepository.save.mockResolvedValue({
        ...expiredTask,
        penaltyApplied: true
      });

      await taskService.checkTasksStatus();

      expect(mockStarService.consumeStars).toHaveBeenCalled();
    });

    it('惩罚执行失败时应该返回失败', async () => {
      const expiredTask = new Task({
        ...mockTask,
        date: '2026-03-01',
        isRequired: true,
        status: TaskStatus.PENDING,
        penaltyApplied: false,
        points: 10
      });

      mockTaskRepository.getExpiredIncompleteTask.mockResolvedValue([expiredTask]);
      mockTaskRepository.getRequiredTasks.mockResolvedValue([expiredTask]);
      mockStarService.consumeStars.mockResolvedValue({ success: true, consumed: 0 });

      const result = await taskService.checkTasksStatus();

      expect(result.penaltyResults[0].success).toBe(false);
    });
  });

  describe('calculateTaskProgress - 计算任务进度', () => {
    it('应该正确计算任务进度', async () => {
      const tasks = [
        new Task({ ...mockTask, type: 'habit', status: TaskStatus.COMPLETED }),
        new Task({ ...mockTask, type: 'habit', status: TaskStatus.PENDING }),
        new Task({ ...mockTask, type: 'study', status: TaskStatus.COMPLETED })
      ];

      mockTaskRepository.getTodayTasks.mockResolvedValue(tasks);

      const result = await taskService.calculateTaskProgress();

      expect(result.taskProgress.habit).toBe(50);
      expect(result.taskProgress.study).toBe(100);
      expect(result.stats.totalTasks).toBe(3);
      expect(result.stats.completedTasks).toBe(2);
    });

    it('应该使用传入的任务列表计算进度', async () => {
      const tasks = [
        new Task({ ...mockTask, type: 'habit', status: TaskStatus.COMPLETED })
      ];

      const result = await taskService.calculateTaskProgress(tasks);

      expect(result.taskProgress.habit).toBe(100);
      expect(mockTaskRepository.getTodayTasks).not.toHaveBeenCalled();
    });

    it('没有任务时应该返回零进度', async () => {
      mockTaskRepository.getTodayTasks.mockResolvedValue([]);

      const result = await taskService.calculateTaskProgress();

      expect(result.taskProgress.habit).toBe(0);
      expect(result.taskProgress.study).toBe(0);
      expect(result.taskProgress.interest).toBe(0);
      expect(result.stats.totalTasks).toBe(0);
    });
  });

  describe('batchProcessTasks - 批量处理任务', () => {
    it('应该成功批量处理任务', async () => {
      const items = ['item1', 'item2', 'item3'];
      const processFn = jest.fn().mockResolvedValue({ success: true });

      const result = await taskService.batchProcessTasks(items, processFn, {
        batchSize: 2
      });

      expect(result.success).toBe(true);
      expect(result.total).toBe(3);
      expect(result.processed).toBe(3);
      expect(processFn).toHaveBeenCalledTimes(3);
    });

    it('空任务数组时应该返回成功', async () => {
      const processFn = jest.fn();

      const result = await taskService.batchProcessTasks([], processFn);

      expect(result.success).toBe(true);
      expect(result.processed).toBe(0);
      expect(processFn).not.toHaveBeenCalled();
    });

    it('处理函数无效时应该返回错误', async () => {
      const items = ['item1', 'item2'];

      const result = await taskService.batchProcessTasks(items, null);

      expect(result.success).toBe(false);
      expect(result.message).toBe('处理函数无效');
    });

    it('处理失败的项目应该继续处理其他项目', async () => {
      const items = ['item1', 'item2', 'item3'];
      const processFn = jest.fn()
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('处理失败'))
        .mockResolvedValueOnce({ success: true });

      const result = await taskService.batchProcessTasks(items, processFn);

      expect(result.success).toBe(true);
      expect(result.processed).toBe(2);
    });
  });

  describe('handleRequiredTaskPenalty - 处理必做任务惩罚', () => {
    it('应该成功执行惩罚', async () => {
      const requiredTask = new Task({
        ...mockTask,
        isRequired: true,
        points: 5
      });

      mockStarService.consumeStars.mockResolvedValue({ success: true, consumed: 5 });
      mockTaskRepository.save.mockResolvedValue({
        ...requiredTask,
        penaltyApplied: true
      });

      const result = await taskService.handleRequiredTaskPenalty(requiredTask);

      expect(result.success).toBe(true);
      expect(result.penaltyPoints).toBe(5);
      expect(mockStarService.consumeStars).toHaveBeenCalled();
    });

    it('任务无效时应该返回错误', async () => {
      const result = await taskService.handleRequiredTaskPenalty(null);

      expect(result.success).toBe(false);
      expect(result.message).toContain('无效或不是必做任务');
    });

    it('非必做任务应该返回错误', async () => {
      const normalTask = new Task({
        ...mockTask,
        isRequired: false
      });

      const result = await taskService.handleRequiredTaskPenalty(normalTask);

      expect(result.success).toBe(false);
    });

    it('惩罚扣减失败时应该返回错误', async () => {
      const requiredTask = new Task({
        ...mockTask,
        isRequired: true,
        points: 10
      });

      mockStarService.consumeStars.mockResolvedValue({ success: true, consumed: 0 });

      const result = await taskService.handleRequiredTaskPenalty(requiredTask);

      expect(result.success).toBe(false);
      expect(result.message).toContain('没有可扣除的星星');
    });

    it('应该触发惩罚事件', async () => {
      const requiredTask = new Task({
        ...mockTask,
        isRequired: true,
        points: 5
      });

      mockStarService.consumeStars.mockResolvedValue({ success: true, consumed: 5 });
      mockTaskRepository.save.mockResolvedValue({
        ...requiredTask,
        penaltyApplied: true
      });

      await taskService.handleRequiredTaskPenalty(requiredTask);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: expect.any(Object),
          penaltyPoints: 5,
          operator: 'system'
        })
      );
    });
  });

  describe('错误处理', () => {
    it('updateTask应该捕获异常', async () => {
      mockTaskRepository.getById.mockRejectedValue(new Error('数据库错误'));

      const result = await taskService.updateTask('task_1', { title: '新标题' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('更新任务失败');
    });

    it('deleteTask应该捕获异常', async () => {
      mockTaskRepository.getById.mockRejectedValue(new Error('数据库错误'));

      const result = await taskService.deleteTask('task_1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('删除任务失败');
    });

    it('resetTask应该捕获异常', async () => {
      mockTaskRepository.getById.mockRejectedValue(new Error('数据库错误'));

      const result = await taskService.resetTask('task_1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('重置任务失败');
    });
  });
});
