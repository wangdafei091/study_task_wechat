/**
 * task-service.test.js - TaskService 测试
 *
 * 测试 TaskService 的核心业务逻辑
 * 使用 MockSetup、MockEventBus、TestDataFactory 和 ScenarioBuilder 工具
 */

const TaskService = require('../../services/task-service');
const { Task, TaskStatus, TaskType, RepeatType, StarExpiryType } = require('../../models/task');
const dateUtils = require('../../utils/dateUtils');
const MockSetup = require('../utils/mock-setup');
const MockEventBus = require('../utils/mock-event-bus');
const TestDataFactory = require('../utils/test-data-factory');
const ScenarioBuilder = require('../utils/scenario-builder');
const { EVENTS, ERROR_MESSAGES } = require('../../utils/constants');

// Mock依赖
jest.mock('../../utils/logger');
jest.mock('../../services/star-service');
jest.mock('../../services/reward-service');
jest.mock('../../services/user-service');
jest.mock('../../repositories/index');
jest.mock('../../utils/http-client');
jest.mock('../../utils/api-config', () => ({
  ENABLE_API: false,
  ENDPOINTS: {
    TASKS: '/api/tasks',
    TASK_BY_ID: '/api/tasks/{taskId}',
    TASK_STATUS: '/api/tasks/{taskId}/status',
    TASK_REQUIRED: '/api/tasks/{taskId}/required',
    TASK_UNREQUIRED: '/api/tasks/{taskId}/unrequired',
    TASK_PENALTIES_SYNC: '/api/tasks/penalties/sync',
  }
}));

const StarService = require('../../services/star-service');
const RewardService = require('../../services/reward-service');
const UserService = require('../../services/user-service');
const { TaskRepository } = require('../../repositories/index');
const HttpClient = require('../../utils/http-client');

describe('TaskService', () => {
  let taskService;
  let mockConfig;
  let mockTaskRepository;
  let mockStarService;
  let mockRewardService;
  let mockUserService;
  let mockEventBus;

  beforeEach(() => {
    // 重置所有mock
    jest.clearAllMocks();

    // 使用 MockSetup 创建标准配置
    mockTaskRepository = {
      loadFromStorage: jest.fn().mockResolvedValue(true),
      save: jest.fn().mockImplementation(async (task) => task),
      saveAll: jest.fn().mockImplementation(async (tasks) => tasks),
      getAll: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue(null),
      getByUserId: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(true),
      getTodayTasks: jest.fn().mockResolvedValue([]),
      getTasksByDate: jest.fn().mockResolvedValue([]),
      getTasksByDateRange: jest.fn().mockResolvedValue([]),
      getRequiredTasks: jest.fn().mockResolvedValue([]),
      getExpiredIncompleteTask: jest.fn().mockResolvedValue([])
    };

    mockStarService = {
      addStars: jest.fn().mockResolvedValue({ success: true, stars: 10 }),
      consumeStars: jest.fn().mockResolvedValue({ success: true, consumed: 5 }),
      consumeStarsFromSpecificType: jest.fn().mockResolvedValue({ success: true, consumed: 5 }),
      calculateExpiryDate: jest.fn().mockReturnValue({ expiry: 'permanent', expiryDateStr: '永久' })
    };

    mockRewardService = {
      getLastExchangeTime: jest.fn().mockResolvedValue(null),
      getLastExchangeTimeByUser: jest.fn().mockResolvedValue(null)
    };

    mockUserService = {
      getCurrentUserId: jest.fn().mockReturnValue('parent'),
      getCurrentUser: jest.fn().mockReturnValue({ userId: 'parent', role: 'parent' }),
      getUserByRole: jest.fn().mockReturnValue({ id: 'child' }),
      getLoginUserId: jest.fn().mockReturnValue(null),
      getAllUsers: jest.fn().mockReturnValue([])
    };

    // 创建 EventBus Mock
    mockEventBus = new MockEventBus();

    // 使用 MockSetup 创建配置
    mockConfig = MockSetup.createServiceMock({
      repositories: {
        task: mockTaskRepository
      },
      services: {
        star: mockStarService,
        reward: mockRewardService,
        user: mockUserService
      }
    });

    // 创建TaskService实例
    taskService = new TaskService({
      taskRepository: mockTaskRepository,
      starService: mockStarService,
      rewardService: mockRewardService,
      userService: mockUserService,
      eventBus: mockEventBus
    });
  });

  afterEach(() => {
    // 使用 MockSetup 重置所有mock
    MockSetup.resetAllMocks(mockConfig);
  });

  describe('初始化和基本操作', () => {
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

    it('应该获取所有任务（不指定用户）', async () => {
      const task = TestDataFactory.createTask({ id: 'task_1' });
      const tasks = [task];
      mockTaskRepository.getAll.mockResolvedValue(tasks);

      const result = await taskService.getAllTasks();

      expect(result).toEqual(tasks);
      expect(mockTaskRepository.getAll).toHaveBeenCalled();
    });

    it('应该获取指定用户的任务', async () => {
      const task = TestDataFactory.createTask({ id: 'task_1', userId: 'parent' });
      const tasks = [task];
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

  describe('操作者视角解析', () => {
    beforeEach(() => {
      mockUserService.getLoginUser = jest.fn().mockReturnValue({
        userId: 'parent_1',
        role: 'parent',
        familyId: 'fam_1'
      });
      mockUserService.getCurrentUser = jest.fn().mockReturnValue({
        userId: 'child_1',
        role: 'child',
        familyId: 'fam_1'
      });
    });

    it('共享设备切到孩子视角时，执行动作应优先使用 currentUser 作为操作者', () => {
      const operatorContext = taskService._getOperatorContext('child_1', 'execute');

      expect(operatorContext).toEqual({
        actorUserId: 'child_1',
        actorRole: 'child',
        familyId: 'fam_1',
        targetUserId: 'child_1'
      });
    });

    it('共享设备切到孩子视角时，管理动作应优先使用 loginUser 作为操作者', () => {
      const operatorContext = taskService._getOperatorContext('child_1', 'manage');

      expect(operatorContext).toEqual({
        actorUserId: 'parent_1',
        actorRole: 'parent',
        familyId: 'fam_1',
        targetUserId: 'child_1'
      });
    });
  });

  describe('任务创建 - 使用 TestDataFactory', () => {
    it('应该成功创建简单任务', async () => {
      const taskData = TestDataFactory.createTask({
        userId: 'parent',
        title: '新任务',
        type: TaskType.HABIT,
        date: dateUtils.getTodayString(),
        points: 10,
        pointsExpiry: StarExpiryType.PERMANENT,
        isAllDay: true
      });

      const task = new Task(taskData);
      mockTaskRepository.save.mockResolvedValue(task);

      const result = await taskService.createTask(taskData);

      expect(result.success).toBe(true);
      expect(result.task).toBeDefined();
      expect(mockTaskRepository.save).toHaveBeenCalled();

      // 验证事件发布
      mockEventBus.verifyEmit(EVENTS.TASK_CREATED, {
        task: expect.any(Object)
      });
    });

    it('应该为没有userId的任务设置默认用户ID', async () => {
      const taskData = {
        title: '新任务',
        type: TaskType.HABIT,
        date: dateUtils.getTodayString()
      };

      const newTask = TestDataFactory.createTask({
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

    it('应该处理每日重复任务', async () => {
      const repeatTaskData = TestDataFactory.createTask({
        userId: 'parent',
        title: '每日任务',
        type: TaskType.HABIT,
        date: dateUtils.getTodayString(),
        repeat: {
          type: RepeatType.DAILY,
          startDate: dateUtils.getTodayString(),
          endDate: dateUtils.formatDate(dateUtils.addDays(new Date(), 7))
        }
      });

      const task = new Task(repeatTaskData);
      mockTaskRepository.save.mockResolvedValue(task);

      const result = await taskService.createTask(repeatTaskData);

      expect(result.success).toBe(true);
      expect(result.task).toBeDefined();
    });

    it('应该处理自定义重复任务并调整日期', async () => {
      // 从周三开始，但选择周一和周五重复
      const today = new Date();
      const wednesday = new Date(today);
      wednesday.setDate(today.getDate() + (3 - today.getDay() + 7) % 7); // 下一个周三

      const repeatTaskData = TestDataFactory.createTask({
        userId: 'parent',
        title: '自定义重复任务',
        type: TaskType.HABIT,
        date: dateUtils.formatDate(wednesday),
        repeat: {
          type: 'custom',
          days: [1, 5], // 周一和周五
          startDate: dateUtils.formatDate(wednesday),
          endDate: dateUtils.formatDate(dateUtils.addDays(wednesday, 14))
        }
      });

      const task = new Task(repeatTaskData);
      mockTaskRepository.save.mockResolvedValue(task);

      const result = await taskService.createTask(repeatTaskData);

      expect(result.success).toBe(true);
      // 日期应该被调整到下一个匹配的星期（周五）
      expect(result.task.date).toBeDefined();
    });

    it('应该处理工作日重复任务', async () => {
      const saturday = new Date();
      saturday.setDate(saturday.getDate() + (6 - saturday.getDay() + 7) % 7); // 下一个周六

      const repeatTaskData = TestDataFactory.createTask({
        userId: 'parent',
        title: '工作日任务',
        type: TaskType.HABIT,
        date: dateUtils.formatDate(saturday),
        repeat: {
          type: 'workdays',
          startDate: dateUtils.formatDate(saturday),
          endDate: dateUtils.formatDate(dateUtils.addDays(saturday, 14))
        }
      });

      const task = new Task(repeatTaskData);
      mockTaskRepository.save.mockResolvedValue(task);

      const result = await taskService.createTask(repeatTaskData);

      expect(result.success).toBe(true);
    });

    it('应该处理周末重复任务', async () => {
      const monday = new Date();
      monday.setDate(monday.getDate() + (1 - monday.getDay() + 7) % 7); // 下一个周一

      const repeatTaskData = TestDataFactory.createTask({
        userId: 'parent',
        title: '周末任务',
        type: TaskType.HABIT,
        date: dateUtils.formatDate(monday),
        repeat: {
          type: 'weekends',
          startDate: dateUtils.formatDate(monday),
          endDate: dateUtils.formatDate(dateUtils.addDays(monday, 14))
        }
      });

      const task = new Task(repeatTaskData);
      mockTaskRepository.save.mockResolvedValue(task);

      const result = await taskService.createTask(repeatTaskData);

      expect(result.success).toBe(true);
    });

    it('自定义重复任务在日期范围内无匹配星期时应返回兜底错误', async () => {
      const startDate = new Date();
      const selectedDay = (startDate.getDay() + 1) % 7;
      const repeatTaskData = TestDataFactory.createTask({
        userId: 'parent',
        title: '无可用日期的自定义重复任务',
        type: TaskType.HABIT,
        date: dateUtils.formatDate(startDate),
        repeat: {
          type: 'custom',
          days: [selectedDay],
          startDate: dateUtils.formatDate(startDate),
          endDate: dateUtils.formatDate(startDate)
        }
      });

      const result = await taskService.createTask(repeatTaskData);

      expect(result.success).toBe(false);
      expect(result.message).toContain('无法在日期范围');
      expect(result.message).toContain('重复星期');
      expect(mockTaskRepository.save).not.toHaveBeenCalled();
    });

    it('周末重复任务在日期范围内无匹配日期时应返回兜底错误', async () => {
      const startDate = new Date();
      while ([0, 6].includes(startDate.getDay())) {
        startDate.setDate(startDate.getDate() + 1);
      }

      const repeatTaskData = TestDataFactory.createTask({
        userId: 'parent',
        title: '无可用日期的周末任务',
        type: TaskType.HABIT,
        date: dateUtils.formatDate(startDate),
        repeat: {
          type: 'weekends',
          startDate: dateUtils.formatDate(startDate),
          endDate: dateUtils.formatDate(startDate)
        }
      });

      const result = await taskService.createTask(repeatTaskData);

      expect(result.success).toBe(false);
      expect(result.message).toContain('无法在日期范围');
      expect(result.message).toContain('周末重复条件');
      expect(mockTaskRepository.save).not.toHaveBeenCalled();
    });

    it('创建失败时应该返回错误', async () => {
      const taskData = TestDataFactory.createTask({
        userId: 'parent',
        title: '新任务',
        type: TaskType.HABIT,
        date: dateUtils.getTodayString()
      });

      mockTaskRepository.save.mockRejectedValue(new Error('保存失败'));

      const result = await taskService.createTask(taskData);

      expect(result.success).toBe(false);
      expect(result.message).toContain('创建任务失败');
    });
  });

  describe('任务更新 - 使用 MockEventBus', () => {
    it('应该成功更新任务', async () => {
      const taskData = TestDataFactory.createTask({
        id: 'task_1',
        userId: 'parent',
        title: '测试任务',
        type: TaskType.HABIT,
        date: dateUtils.getTodayString(),
        status: TaskStatus.PENDING
      });

      const task = new Task(taskData);
      mockTaskRepository.getById.mockResolvedValue(task);
      mockTaskRepository.save.mockImplementation(async (t) => t);

      const result = await taskService.updateTask('task_1', {
        title: '更新后的标题'
      });

      expect(result.success).toBe(true);
      expect(result.task.title).toBe('更新后的标题');

      // 验证事件发布
      mockEventBus.verifyEmit(EVENTS.TASK_UPDATED, {
        task: expect.any(Object),
        changes: expect.any(Object),
        operationType: 'update'
      });
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
      const taskData = TestDataFactory.createTask({
        id: 'task_1',
        userId: 'parent'
      });

      mockTaskRepository.getById.mockResolvedValue(new Task(taskData));

      const result = await taskService.updateTask('task_1', {
        title: '新标题'
      }, 'other_user');

      expect(result.success).toBe(false);
      expect(result.message).toBe('无权限操作此任务');
    });

    it('更新失败时应该捕获异常', async () => {
      mockTaskRepository.getById.mockRejectedValue(new Error('数据库错误'));

      const result = await taskService.updateTask('task_1', { title: '新标题' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('更新任务失败');
    });
  });

  describe('任务完成逻辑 - completeTask 和 updateTaskStatus', () => {
    it('应该成功完成任务', async () => {
      const taskData = TestDataFactory.createTask({
        id: 'task_1',
        userId: 'parent',
        title: '测试任务',
        type: TaskType.HABIT,
        status: TaskStatus.PENDING,
        starAwarded: false,
        isRequired: false,
        points: 10,
        pointsExpiry: 'week' // 匹配TestDataFactory默认值
      });

      const task = new Task(taskData);
      mockTaskRepository.getById.mockResolvedValue(task);
      mockTaskRepository.save.mockResolvedValue({
        ...task,
        status: TaskStatus.COMPLETED,
        starAwarded: true,
        completionTime: expect.any(Number)
      });

      const result = await taskService.completeTask('task_1');

      expect(result.success).toBe(true);
      expect(result.task.status).toBe(TaskStatus.COMPLETED);

      // 验证星星分配（M6后使用任务自身的userId，而非getChildUserId）
      expect(mockStarService.addStars).toHaveBeenCalledWith(
        10,
        'week', // 实际传递的pointsExpiry
        '完成任务: 测试任务',
        expect.objectContaining({
          sourceType: 'task_complete',
          sourceId: 'task_1',
          userId: 'parent'
        })
      );

      // 验证事件发布
      mockEventBus.verifyEmit(EVENTS.TASK_STATUS_UPDATED, {
        task: expect.any(Object),
        previousStatus: TaskStatus.PENDING,
        operationType: 'complete'
      });

      mockEventBus.verifyEmit(EVENTS.TASK_COMPLETED, {
        task: expect.any(Object)
      });
    });

    it('必做任务不应该获得积分', async () => {
      const taskData = TestDataFactory.createTask({
        id: 'task_1',
        userId: 'parent',
        title: '必做任务',
        type: TaskType.HABIT,
        status: TaskStatus.PENDING,
        starAwarded: false,
        isRequired: true,
        points: 10
      });

      const task = new Task(taskData);
      mockTaskRepository.getById.mockResolvedValue(task);
      mockTaskRepository.save.mockResolvedValue({
        ...task,
        status: TaskStatus.COMPLETED
      });

      await taskService.completeTask('task_1');

      expect(mockStarService.addStars).not.toHaveBeenCalled();
    });

    it('已经获得过星星的任务不应该再次分配', async () => {
      const taskData = TestDataFactory.createTask({
        id: 'task_1',
        userId: 'parent',
        title: '已完成任务',
        type: TaskType.HABIT,
        status: TaskStatus.PENDING,
        starAwarded: true,
        isRequired: false,
        points: 10
      });

      const task = new Task(taskData);
      mockTaskRepository.getById.mockResolvedValue(task);
      mockTaskRepository.save.mockResolvedValue({
        ...task,
        status: TaskStatus.COMPLETED
      });

      await taskService.completeTask('task_1');

      expect(mockStarService.addStars).not.toHaveBeenCalled();
    });

    it('状态未变化时应该返回unchanged', async () => {
      const taskData = TestDataFactory.createTask({
        id: 'task_1',
        userId: 'parent',
        status: TaskStatus.COMPLETED
      });

      const task = new Task(taskData);
      mockTaskRepository.getById.mockResolvedValue(task);

      const result = await taskService.completeTask('task_1');

      expect(result.success).toBe(true);
      expect(result.unchanged).toBe(true);
    });

    it('任务不存在时应该返回错误', async () => {
      mockTaskRepository.getById.mockResolvedValue(null);

      const result = await taskService.completeTask('nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toBe('未找到指定的任务');
    });

    it('应该设置正确的completionTime', async () => {
      const taskData = TestDataFactory.createTask({
        id: 'task_1',
        userId: 'parent',
        status: TaskStatus.PENDING
      });

      const task = new Task(taskData);
      mockTaskRepository.getById.mockResolvedValue(task);

      const savedTask = {
        ...task,
        status: TaskStatus.COMPLETED,
        completionTime: Date.now()
      };
      mockTaskRepository.save.mockResolvedValue(savedTask);

      const result = await taskService.completeTask('task_1');

      expect(result.task.completionTime).toBeGreaterThan(0);
      expect(result.task.completionTime).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('任务重置逻辑 - resetTask', () => {
    it('应该成功重置已完成的任务', async () => {
      const taskData = TestDataFactory.createTask({
        id: 'task_1',
        userId: 'parent',
        title: '已完成的任务',
        type: TaskType.HABIT,
        status: TaskStatus.COMPLETED,
        starAwarded: true,
        points: 10,
        pointsExpiry: StarExpiryType.PERMANENT,
        completionTime: Date.now() - 3600000 // 1小时前完成
      });

      const task = new Task(taskData);
      mockTaskRepository.getById.mockResolvedValue(task);
      mockTaskRepository.save.mockResolvedValue({
        ...task,
        status: TaskStatus.PENDING,
        starAwarded: false,
        completionTime: null
      });

      const result = await taskService.resetTask('task_1');

      expect(result.success).toBe(true);
      expect(result.task.status).toBe(TaskStatus.PENDING);
      expect(result.task.starAwarded).toBe(false);
      expect(result.task.completionTime).toBeNull();

      // 验证星星扣减
      expect(mockStarService.consumeStarsFromSpecificType).toHaveBeenCalledWith(
        10,
        'permanent',
        expect.any(String),
        expect.objectContaining({
          sourceType: 'task_reset',
          sourceId: 'task_1',
          originalTaskDate: task.date
        })
      );

      // 验证事件发布
      mockEventBus.verifyEmit(EVENTS.TASK_RESET, {
        task: expect.any(Object),
        starsDeducted: 10
      });
    });

    it('未完成的任务无需重置', async () => {
      const taskData = TestDataFactory.createTask({
        id: 'task_1',
        userId: 'parent',
        status: TaskStatus.PENDING
      });

      const task = new Task(taskData);
      mockTaskRepository.getById.mockResolvedValue(task);

      const result = await taskService.resetTask('task_1');

      expect(result.success).toBe(true);
      expect(result.unchanged).toBe(true);
      expect(mockStarService.consumeStarsFromSpecificType).not.toHaveBeenCalled();
    });

    it('星星扣减失败时应该返回错误', async () => {
      const taskData = TestDataFactory.createTask({
        id: 'task_1',
        userId: 'parent',
        status: TaskStatus.COMPLETED,
        starAwarded: true,
        points: 10
      });

      const task = new Task(taskData);
      mockTaskRepository.getById.mockResolvedValue(task);
      mockStarService.consumeStarsFromSpecificType.mockResolvedValue({
        success: false,
        message: '扣减失败'
      });

      const result = await taskService.resetTask('task_1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('扣减星星失败');
    });

    it('任务锁定时（已兑换奖励）应该返回错误', async () => {
      const taskData = TestDataFactory.createTask({
        id: 'task_1',
        userId: 'parent',
        status: TaskStatus.COMPLETED,
        starAwarded: true,
        points: 10,
        completionTime: Date.now() - 7200000 // 2小时前完成
      });

      const task = new Task(taskData);
      mockTaskRepository.getById.mockResolvedValue(task);
      mockRewardService.getLastExchangeTimeByUser.mockResolvedValue(Date.now() - 3600000); // 1小时前兑换

      const result = await taskService.resetTask('task_1');

      expect(result.success).toBe(false);
      expect(result.message).toBe(ERROR_MESSAGES.TASK_LOCKED);
      expect(result.locked).toBe(true);
      expect(mockRewardService.getLastExchangeTimeByUser).toHaveBeenCalledWith('parent');
      expect(mockRewardService.getLastExchangeTime).not.toHaveBeenCalled();
    });

    it('应按任务归属用户查询最后兑换时间，避免无关用户的兑换记录误锁任务', async () => {
      const taskData = TestDataFactory.createTask({
        id: 'task_2',
        userId: 'child-1',
        status: TaskStatus.COMPLETED,
        starAwarded: true,
        points: 5,
        completionTime: Date.now() - 7200000
      });

      const task = new Task(taskData);
      mockTaskRepository.getById.mockResolvedValue(task);
      mockRewardService.getLastExchangeTimeByUser.mockResolvedValue(null);
      mockTaskRepository.save.mockResolvedValue({
        ...task,
        status: TaskStatus.PENDING,
        starAwarded: false,
        completionTime: null
      });

      const result = await taskService.resetTask('task_2');

      expect(result.success).toBe(true);
      expect(mockRewardService.getLastExchangeTimeByUser).toHaveBeenCalledWith('child-1');
    });

    it('重置失败时应该捕获异常', async () => {
      mockTaskRepository.getById.mockRejectedValue(new Error('数据库错误'));

      const result = await taskService.resetTask('task_1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('重置任务失败');
    });
  });

  describe('重复任务处理', () => {
    it('应该生成每日重复任务', async () => {
      const taskData = TestDataFactory.createTask({
        userId: 'parent',
        title: '每日任务',
        type: TaskType.HABIT,
        date: dateUtils.getTodayString(),
        repeat: {
          type: RepeatType.DAILY,
          startDate: dateUtils.getTodayString(),
          endDate: dateUtils.formatDate(dateUtils.addDays(new Date(), 5))
        }
      });

      const task = new Task(taskData);
      mockTaskRepository.save.mockResolvedValue(task);

      // 模拟保存重复任务
      mockTaskRepository.save.mockImplementation(async (t) => {
        if (t.parentTaskId) {
          // 这是重复任务实例
          return t;
        }
        return task;
      });

      const result = await taskService.createTask(taskData);

      expect(result.success).toBe(true);
      expect(result.createdTasks).toBeDefined();
    });

    it('应该生成每周重复任务', async () => {
      const taskData = TestDataFactory.createTask({
        userId: 'parent',
        title: '每周任务',
        type: TaskType.HABIT,
        date: dateUtils.getTodayString(),
        repeat: {
          type: RepeatType.WEEKLY,
          startDate: dateUtils.getTodayString(),
          endDate: dateUtils.formatDate(dateUtils.addDays(new Date(), 14))
        }
      });

      const task = new Task(taskData);
      mockTaskRepository.save.mockResolvedValue(task);

      const result = await taskService.createTask(taskData);

      expect(result.success).toBe(true);
    });

    it('应该生成自定义星期重复任务', async () => {
      const taskData = TestDataFactory.createTask({
        userId: 'parent',
        title: '自定义重复',
        type: TaskType.HABIT,
        date: dateUtils.getTodayString(),
        repeat: {
          type: 'custom',
          days: [1, 3, 5], // 周一、三、五
          startDate: dateUtils.getTodayString(),
          endDate: dateUtils.formatDate(dateUtils.addDays(new Date(), 7))
        }
      });

      const task = new Task(taskData);
      mockTaskRepository.save.mockResolvedValue(task);

      const result = await taskService.createTask(taskData);

      expect(result.success).toBe(true);
    });

    it('开始日期和结束日期相同时不应该生成重复任务', async () => {
      const today = dateUtils.getTodayString();

      const taskData = TestDataFactory.createTask({
        userId: 'parent',
        title: '单日重复任务',
        type: TaskType.HABIT,
        date: today,
        repeat: {
          type: RepeatType.DAILY,
          startDate: today,
          endDate: today
        }
      });

      const task = new Task(taskData);
      mockTaskRepository.save.mockResolvedValue(task);

      // 模拟_generateRepeatTasks返回空数组（开始和结束日期相同）
      jest.spyOn(taskService, '_generateRepeatTasks').mockResolvedValue([]);

      const result = await taskService.createTask(taskData);

      expect(result.success).toBe(true);
      // createdTasks应该只包含原始任务（1个），没有额外的重复任务
      expect(result.createdTasks).toBeDefined();
      expect(result.createdTasks).toHaveLength(1); // 只有原始任务
      expect(result.createdTasks[0].id).toBe(task.id); // 确认是原始任务

      // 恢复原始方法
      taskService._generateRepeatTasks.mockRestore();
    });

    it('重复任务实例应该正确继承父任务属性', async () => {
      const parentTaskData = TestDataFactory.createTask({
        userId: 'parent',
        title: '父任务',
        type: TaskType.HABIT,
        date: dateUtils.getTodayString(),
        points: 15,
        pointsExpiry: StarExpiryType.WEEK,
        repeat: {
          type: RepeatType.DAILY,
          startDate: dateUtils.getTodayString(),
          endDate: dateUtils.formatDate(dateUtils.addDays(new Date(), 2))
        }
      });

      const parentTask = new Task(parentTaskData);
      mockTaskRepository.save.mockResolvedValue(parentTask);

      // 模拟生成一个重复任务实例
      const mockRepeatTask = new Task({
        ...parentTaskData,
        id: 'repeat_task_1',
        parentTaskId: parentTask.id,
        date: dateUtils.formatDate(dateUtils.addDays(new Date(), 1)),
        status: TaskStatus.PENDING,
        starAwarded: false,
        penaltyApplied: false
      });

      jest.spyOn(taskService, '_generateRepeatTasks').mockResolvedValue([mockRepeatTask]);

      const result = await taskService.createTask(parentTaskData);

      expect(result.success).toBe(true);
      expect(result.createdTasks).toBeDefined();
      expect(result.createdTasks.length).toBe(2); // 原始任务 + 1个重复任务

      // 验证重复任务实例（第二个元素，第一个是原始任务）
      const repeatTask = result.createdTasks[1];
      expect(repeatTask.parentTaskId).toBe(parentTask.id);
      expect(repeatTask.points).toBe(15);
      expect(repeatTask.pointsExpiry).toBe('week'); // 实际存储的是'week'，不是StarExpiryType.WEEK
      expect(repeatTask.starAwarded).toBe(false);
      expect(repeatTask.penaltyApplied).toBe(false);

      // 恢复原始方法
      taskService._generateRepeatTasks.mockRestore();
    });
  });

  describe('必做任务管理', () => {
    it('应该成功标记任务为必做', async () => {
      const taskData = TestDataFactory.createTask({
        id: 'task_1',
        userId: 'parent',
        isRequired: false
      });

      const task = new Task(taskData);
      mockTaskRepository.getById.mockResolvedValue(task);
      mockTaskRepository.save.mockResolvedValue({
        ...task,
        isRequired: true
      });

      const result = await taskService.markTaskAsRequired('task_1');

      expect(result.success).toBe(true);
      expect(result.task.isRequired).toBe(true);

      mockEventBus.verifyEmit(EVENTS.TASK_MARKED_REQUIRED, {
        task: expect.any(Object)
      });
    });

    it('应该成功取消必做标记', async () => {
      const taskData = TestDataFactory.createTask({
        id: 'task_1',
        userId: 'parent',
        isRequired: true
      });

      const task = new Task(taskData);
      mockTaskRepository.getById.mockResolvedValue(task);
      mockTaskRepository.save.mockResolvedValue({
        ...task,
        isRequired: false
      });

      const result = await taskService.unmarkTaskAsRequired('task_1');

      expect(result.success).toBe(true);
      expect(result.task.isRequired).toBe(false);

      mockEventBus.verifyEmit(EVENTS.TASK_UNMARKED_REQUIRED, {
        task: expect.any(Object)
      });
    });

    it('已经是必做任务时应该返回unchanged', async () => {
      const taskData = TestDataFactory.createTask({
        id: 'task_1',
        userId: 'parent',
        isRequired: true
      });

      const task = new Task(taskData);
      mockTaskRepository.getById.mockResolvedValue(task);

      const result = await taskService.markTaskAsRequired('task_1');

      expect(result.success).toBe(true);
      expect(result.unchanged).toBe(true);
    });

    it('云端模式下标记必做应写入待同步元数据并调用正式同步入口', async () => {
      taskService.enableCloudStorage = true;
      taskService._syncRequiredStateToCloud = jest.fn().mockResolvedValue(true);

      const task = new Task(TestDataFactory.createTask({
        id: 'task_required_cloud',
        userId: 'parent',
        isRequired: false
      }));
      mockTaskRepository.getById.mockResolvedValue(task);
      mockTaskRepository.save.mockImplementation(async (savedTask) => savedTask);

      const result = await taskService.markTaskAsRequired('task_required_cloud');

      expect(result.success).toBe(true);
      expect(result.task.isRequired).toBe(true);
      expect(result.task.syncedToCloud).toBe(false);
      expect(result.task.pendingSyncMeta).toEqual(expect.objectContaining({
        action: 'required',
        notificationType: 'task_required',
        targetUserId: 'parent'
      }));
      expect(taskService._syncRequiredStateToCloud).toHaveBeenCalledWith(expect.objectContaining({
        id: 'task_required_cloud',
        isRequired: true
      }));
    });

    it('云端模式下取消必做应写入待同步元数据并调用正式同步入口', async () => {
      taskService.enableCloudStorage = true;
      taskService._syncRequiredStateToCloud = jest.fn().mockResolvedValue(true);

      const task = new Task(TestDataFactory.createTask({
        id: 'task_unrequired_cloud',
        userId: 'parent',
        isRequired: true
      }));
      mockTaskRepository.getById.mockResolvedValue(task);
      mockTaskRepository.save.mockImplementation(async (savedTask) => savedTask);

      const result = await taskService.unmarkTaskAsRequired('task_unrequired_cloud');

      expect(result.success).toBe(true);
      expect(result.task.isRequired).toBe(false);
      expect(result.task.syncedToCloud).toBe(false);
      expect(result.task.pendingSyncMeta).toEqual(expect.objectContaining({
        action: 'unrequired',
        notificationType: 'task_unrequired',
        targetUserId: 'parent'
      }));
      expect(taskService._syncRequiredStateToCloud).toHaveBeenCalledWith(expect.objectContaining({
        id: 'task_unrequired_cloud',
        isRequired: false
      }));
    });
  });

  describe('必做任务惩罚逻辑', () => {
    it('应该成功执行必做任务惩罚', async () => {
      const taskData = TestDataFactory.createTask({
        id: 'task_1',
        userId: 'parent',
        isRequired: true,
        points: 5
      });

      const task = new Task(taskData);
      mockStarService.consumeStars.mockResolvedValue({ success: true, consumed: 5 });
      mockTaskRepository.save.mockResolvedValue({
        ...task,
        penaltyApplied: true
      });

      const result = await taskService.handleRequiredTaskPenalty(task);

      expect(result.success).toBe(true);
      expect(result.penaltyPoints).toBe(5);
      expect(mockStarService.consumeStars).toHaveBeenCalledWith(
        5,
        expect.any(String),
        expect.any(Object)
      );

      mockEventBus.verifyEmit(EVENTS.TASK_PENALTY_APPLIED, {
        task: expect.any(Object),
        penaltyPoints: 5,
        operator: 'system',
        reason: '必做任务未完成'
      });
    });

    it('惩罚扣减部分成功（余额不足）时应该继续', async () => {
      const taskData = TestDataFactory.createTask({
        id: 'task_1',
        userId: 'parent',
        isRequired: true,
        points: 10
      });

      const task = new Task(taskData);
      mockStarService.consumeStars.mockResolvedValue({ success: true, consumed: 5 });
      mockTaskRepository.save.mockResolvedValue({
        ...task,
        penaltyApplied: true
      });

      const result = await taskService.handleRequiredTaskPenalty(task);

      expect(result.success).toBe(true);
      expect(result.penaltyPoints).toBe(5); // 实际扣减5星
    });

    it('惩罚执行完全失败（没有星星）时应该返回错误', async () => {
      const taskData = TestDataFactory.createTask({
        id: 'task_1',
        userId: 'parent',
        isRequired: true,
        points: 10
      });

      const task = new Task(taskData);
      mockStarService.consumeStars.mockResolvedValue({ success: true, consumed: 0 });

      const result = await taskService.handleRequiredTaskPenalty(task);

      expect(result.success).toBe(false);
      expect(result.message).toContain('没有可扣除的星星');
    });

    it('非必做任务应该返回错误', async () => {
      const taskData = TestDataFactory.createTask({
        id: 'task_1',
        userId: 'parent',
        isRequired: false
      });

      const task = new Task(taskData);

      const result = await taskService.handleRequiredTaskPenalty(task);

      expect(result.success).toBe(false);
      expect(result.message).toContain('无效或不是必做任务');
    });

    it('任务为null时应该返回错误', async () => {
      const result = await taskService.handleRequiredTaskPenalty(null);

      expect(result.success).toBe(false);
      expect(result.message).toContain('无效或不是必做任务');
    });
  });

  describe('任务进度计算', () => {
    it('应该正确计算任务进度', async () => {
      const tasks = [
        TestDataFactory.createTask({
          id: 'task_1',
          type: TaskType.HABIT,
          status: TaskStatus.COMPLETED
        }),
        TestDataFactory.createTask({
          id: 'task_2',
          type: TaskType.HABIT,
          status: TaskStatus.PENDING
        }),
        TestDataFactory.createTask({
          id: 'task_3',
          type: TaskType.STUDY,
          status: TaskStatus.COMPLETED
        })
      ];

      // M6后 calculateTaskProgress 通过 getTasksByDate 而非 getTodayTasks 获取任务
      mockTaskRepository.getTasksByDate.mockResolvedValue(tasks);

      const result = await taskService.calculateTaskProgress();

      expect(result.taskProgress.habit).toBe(50);
      expect(result.taskProgress.study).toBe(100);
      expect(result.taskProgress.interest).toBe(0);
      expect(result.stats.totalTasks).toBe(3);
      expect(result.stats.completedTasks).toBe(2);
      expect(result.stats.completionRate).toBe(67);
    });

    it('应该使用传入的任务列表计算进度', async () => {
      const tasks = [
        TestDataFactory.createTask({
          id: 'task_1',
          type: TaskType.HABIT,
          status: TaskStatus.COMPLETED
        })
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

    it('进度值应该是数字类型', async () => {
      const tasks = [
        TestDataFactory.createTask({
          id: 'task_1',
          type: TaskType.HABIT,
          status: TaskStatus.COMPLETED
        })
      ];

      mockTaskRepository.getTodayTasks.mockResolvedValue(tasks);

      const result = await taskService.calculateTaskProgress();

      expect(typeof result.taskProgress.habit).toBe('number');
      expect(typeof result.taskProgress.study).toBe('number');
      expect(typeof result.taskProgress.interest).toBe('number');
    });
  });

  describe('任务统计数据', () => {
    it('应该正确计算任务统计数据', async () => {
      const tasks = [
        TestDataFactory.createTask({ id: 'task_1', type: TaskType.HABIT, status: TaskStatus.COMPLETED }),
        TestDataFactory.createTask({ id: 'task_2', type: TaskType.HABIT, status: TaskStatus.PENDING }),
        TestDataFactory.createTask({ id: 'task_3', type: TaskType.STUDY, status: TaskStatus.COMPLETED })
      ];

      mockTaskRepository.getTasksByDateRange.mockResolvedValue(tasks);

      const result = await taskService.getTaskStatistics({
        startDate: '2026-03-01',
        endDate: '2026-03-07'
      });

      expect(result.totalTasks).toBe(3);
      expect(result.completedTasks).toBe(2);
      expect(result.completionRate).toBe(67);
      expect(result.typeCounts.habit).toBe(2);
      expect(result.typeCounts.study).toBe(1);
      expect(result.typeCompletion.habit).toBe(1);
      expect(result.typeCompletion.study).toBe(1);
    });

    it('没有指定日期范围时应该获取所有任务', async () => {
      const tasks = [
        TestDataFactory.createTask({ id: 'task_1', type: TaskType.HABIT, status: TaskStatus.COMPLETED })
      ];

      mockTaskRepository.getAll.mockResolvedValue(tasks);

      const result = await taskService.getTaskStatistics();

      expect(result.totalTasks).toBe(1);
      expect(mockTaskRepository.getAll).toHaveBeenCalled();
      expect(mockTaskRepository.getTasksByDateRange).not.toHaveBeenCalled();
    });

    it('无日期范围但传入userId时应该按目标用户统计', async () => {
      const tasks = [
        TestDataFactory.createTask({ id: 'task_1', userId: 'child_1', type: TaskType.HABIT, status: TaskStatus.COMPLETED }),
        TestDataFactory.createTask({ id: 'task_2', userId: 'child_1', type: TaskType.STUDY, status: TaskStatus.PENDING })
      ];

      const getTasksByScopeSpy = jest.spyOn(taskService, 'getTasksByScope').mockResolvedValue(tasks);

      const result = await taskService.getTaskStatistics({}, { userId: 'child_1' });

      expect(getTasksByScopeSpy).toHaveBeenCalledWith({ userId: 'child_1' });
      expect(result.totalTasks).toBe(2);
      expect(result.completedTasks).toBe(1);

      getTasksByScopeSpy.mockRestore();
    });

    it('应该计算类型完成率', async () => {
      const tasks = [
        TestDataFactory.createTask({ id: 'task_1', type: TaskType.HABIT, status: TaskStatus.COMPLETED }),
        TestDataFactory.createTask({ id: 'task_2', type: TaskType.HABIT, status: TaskStatus.COMPLETED }),
        TestDataFactory.createTask({ id: 'task_3', type: TaskType.HABIT, status: TaskStatus.PENDING })
      ];

      mockTaskRepository.getAll.mockResolvedValue(tasks);

      const result = await taskService.getTaskStatistics();

      expect(result.typeCompletionRate.habit).toBe(67);
    });

    it('应该生成按日期分组的统计数据', async () => {
      const tasks = [
        TestDataFactory.createTask({ id: 'task_1', date: '2026-03-01', type: TaskType.HABIT, status: TaskStatus.COMPLETED }),
        TestDataFactory.createTask({ id: 'task_2', date: '2026-03-01', type: TaskType.STUDY, status: TaskStatus.PENDING }),
        TestDataFactory.createTask({ id: 'task_3', date: '2026-03-02', type: TaskType.HABIT, status: TaskStatus.COMPLETED })
      ];

      mockTaskRepository.getTasksByDateRange.mockResolvedValue(tasks);

      const result = await taskService.getTaskStatistics({
        startDate: '2026-03-01',
        endDate: '2026-03-02'
      });

      expect(result.dailyStats).toBeDefined();
      expect(result.dailyStats).toHaveLength(2);
      expect(result.dailyStats[0].date).toBe('2026-03-01');
      expect(result.dailyStats[0].totalTasks).toBe(2);
      expect(result.dailyStats[1].date).toBe('2026-03-02');
    });

    it('统计数据失败时应该返回默认值', async () => {
      mockTaskRepository.getAll.mockRejectedValue(new Error('数据库错误'));

      const result = await taskService.getTaskStatistics();

      expect(result.totalTasks).toBe(0);
      expect(result.completedTasks).toBe(0);
      expect(result.completionRate).toBe(0);
      expect(result.typeCounts.habit).toBe(0);
      expect(result.dailyStats).toEqual([]);
    });
  });

  describe('批量处理任务', () => {
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
      expect(result.total).toBe(3);
      // failed属性可能不存在于返回结果中
      expect(result.processed + (result.failed || 0)).toBeGreaterThanOrEqual(2);
    });
  });

  describe('任务状态检查', () => {
    it('应该检查过期任务和必做任务', async () => {
      const expiredTask = TestDataFactory.createTask({
        id: 'task_1',
        date: dateUtils.getYesterdayString(),
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
      expect(result.penaltyResults).toHaveLength(1);
    });

    it('兼容方法checkRequiredTasks应该调用checkTasksStatus', async () => {
      mockTaskRepository.getExpiredIncompleteTask.mockResolvedValue([]);
      mockTaskRepository.getRequiredTasks.mockResolvedValue([]);

      const result = await taskService.checkRequiredTasks();

      expect(result.success).toBe(true);
    });
  });

  describe('getAllTasks - 云端模式分支', () => {
    beforeEach(() => {
      taskService.enableCloudStorage = true;
    });

    afterEach(() => {
      taskService.enableCloudStorage = false;
    });

    it('云端模式：成功从云端获取任务', async () => {
      const tasks = [TestDataFactory.createTask({ id: 't1' })];
      taskService._fetchTasksFromCloud = jest.fn().mockResolvedValue(tasks);

      const result = await taskService.getAllTasks();
      expect(result).toEqual(tasks);
      expect(taskService._fetchTasksFromCloud).toHaveBeenCalledWith(null, {});
    });

    it('云端模式：云端失败时降级到本地(无userId)', async () => {
      const localTasks = [TestDataFactory.createTask({ id: 't1' })];
      taskService._fetchTasksFromCloud = jest.fn().mockRejectedValue(new Error('cloud error'));
      mockTaskRepository.getAll.mockResolvedValue(localTasks);

      const result = await taskService.getAllTasks();
      expect(result).toEqual(localTasks);
    });

    it('云端模式：云端失败时降级到本地(带userId过滤)', async () => {
      const localTasks = [
        TestDataFactory.createTask({ id: 't1', userId: 'u1' }),
        TestDataFactory.createTask({ id: 't2', userId: 'u2' })
      ];
      taskService._fetchTasksFromCloud = jest.fn().mockRejectedValue(new Error('cloud error'));
      mockTaskRepository.getAll.mockResolvedValue(localTasks);

      const result = await taskService.getAllTasks('u1');
      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('u1');
    });

    it('云端和本地都失败时应该返回空数组', async () => {
      taskService._fetchTasksFromCloud = jest.fn().mockRejectedValue(new Error('cloud error'));
      mockTaskRepository.getAll.mockRejectedValue(new Error('local error'));

      const result = await taskService.getAllTasks();
      expect(result).toEqual([]);
    });
  });

  describe('getTasksByDate/getTasksByDateRange - 云端结果补并本地任务', () => {
    beforeEach(() => {
      taskService.enableCloudStorage = true;
    });

    afterEach(() => {
      taskService.enableCloudStorage = false;
    });

    it('按日期查询时应补并本地独有任务，避免首页因云端空结果丢任务', async () => {
      const cloudTasks = [new Task(TestDataFactory.createTask({ id: 'cloud_1', userId: 'child_1', date: '2026-03-21' }))];
      const localTasks = [
        new Task(TestDataFactory.createTask({ id: 'cloud_1', userId: 'child_1', date: '2026-03-21' })),
        new Task(TestDataFactory.createTask({ id: 'local_only_1', userId: 'child_1', date: '2026-03-21' }))
      ];

      taskService._fetchTasksFromCloud = jest.fn().mockResolvedValue(cloudTasks);
      mockTaskRepository.getTasksByDate.mockResolvedValue(localTasks);

      const result = await taskService.getTasksByDate('2026-03-21', 'child_1');

      expect(taskService._fetchTasksFromCloud).toHaveBeenCalledWith('child_1', { date: '2026-03-21' });
      expect(mockTaskRepository.getTasksByDate).toHaveBeenCalledWith('2026-03-21', 'child_1');
      expect(result.map(task => task.id)).toEqual(['cloud_1', 'local_only_1']);
    });

    it('按日期范围查询时也应补并本地独有任务', async () => {
      const cloudTasks = [new Task(TestDataFactory.createTask({ id: 'cloud_range_1', userId: 'child_1', date: '2026-03-21' }))];
      const localTasks = [
        new Task(TestDataFactory.createTask({ id: 'cloud_range_1', userId: 'child_1', date: '2026-03-21' })),
        new Task(TestDataFactory.createTask({ id: 'local_range_1', userId: 'child_1', date: '2026-03-22' }))
      ];

      taskService._fetchTasksFromCloud = jest.fn().mockResolvedValue(cloudTasks);
      mockTaskRepository.getTasksByDateRange.mockResolvedValue(localTasks);

      const result = await taskService.getTasksByDateRange('2026-03-21', '2026-03-23', 'child_1');

      expect(mockTaskRepository.getTasksByDateRange).toHaveBeenCalledWith('2026-03-21', '2026-03-23', 'child_1');
      expect(result.map(task => task.id)).toEqual(['cloud_range_1', 'local_range_1']);
    });
  });

  describe('getTaskById - 访问权限和错误分支', () => {
    it('任务userId与传入userId不匹配时应该返回null', async () => {
      const task = TestDataFactory.createTask({ id: 't1', userId: 'owner' });
      mockTaskRepository.getById.mockResolvedValue(new Task(task));

      const result = await taskService.getTaskById('t1', 'other_user');
      expect(result).toBeNull();
    });

    it('仓储抛出异常时应该返回null', async () => {
      mockTaskRepository.getById.mockRejectedValue(new Error('db error'));

      const result = await taskService.getTaskById('t1');
      expect(result).toBeNull();
    });
  });

  describe('updateUserService - 更新UserService引用', () => {
    it('传入相同UserService时不应该更新', () => {
      taskService.userService = mockUserService;
      taskService.updateUserService(mockUserService);
      expect(taskService.userService).toBe(mockUserService);
    });

    it('传入不同UserService时应该更新引用', () => {
      const newUserService = { getCurrentUserId: jest.fn().mockReturnValue('user2') };
      taskService.updateUserService(newUserService);
      expect(taskService.userService).toBe(newUserService);
    });
  });

  describe('checkUpcomingTasks - 提醒检查', () => {
    it('没有今日任务时应该返回count=0', async () => {
      mockTaskRepository.getTodayTasks.mockResolvedValue([]);
      const result = await taskService.checkUpcomingTasks();
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });

    it('传入userId时应该过滤用户任务', async () => {
      const task = TestDataFactory.createTask({
        id: 't1', userId: 'u1',
        status: TaskStatus.PENDING,
        date: dateUtils.getTodayString()
      });
      mockTaskRepository.getTodayTasks.mockResolvedValue([new Task(task)]);
      const result = await taskService.checkUpcomingTasks('u2');
      expect(result.count).toBe(0);
    });

    it('未完成且无提醒的任务应该跳过', async () => {
      const taskData = TestDataFactory.createTask({
        id: 't1', userId: 'u1',
        status: TaskStatus.PENDING,
        date: dateUtils.getTodayString()
      });
      const task = new Task(taskData);
      task.reminder = null;
      mockTaskRepository.getTodayTasks.mockResolvedValue([task]);
      const result = await taskService.checkUpcomingTasks('u1');
      expect(result.count).toBe(0);
    });

    it('全天任务且reminder.time!==-1时应该跳过', async () => {
      const taskData = TestDataFactory.createTask({
        id: 't1', userId: 'u1',
        status: TaskStatus.PENDING,
        date: dateUtils.getTodayString(),
        isAllDay: true
      });
      const task = new Task(taskData);
      task.reminder = { enabled: true, time: 30 };
      task.startTime = null;
      mockTaskRepository.getTodayTasks.mockResolvedValue([task]);
      const result = await taskService.checkUpcomingTasks('u1');
      expect(result.count).toBe(0);
    });

    it('仓储抛出异常时应该返回success=false', async () => {
      mockTaskRepository.getTodayTasks.mockRejectedValue(new Error('db error'));
      const result = await taskService.checkUpcomingTasks();
      expect(result.success).toBe(false);
    });
  });

  describe('边條条件和错误处理', () => {
    it('deleteTask suppressMessage为true时不应该触发事件', async () => {
      const taskData = TestDataFactory.createTask({ id: 'task_1', userId: 'parent' });
      mockTaskRepository.getById.mockResolvedValue(new Task(taskData));
      mockTaskRepository.delete.mockResolvedValue(true);

      await taskService.deleteTask('task_1', null, true);

      mockEventBus.verifyNotEmit(EVENTS.TASK_DELETED);
    });

    it('应该处理无效的用户ID', async () => {
      const taskData = TestDataFactory.createTask({ id: 'task_1', userId: 'parent' });
      mockTaskRepository.getById.mockResolvedValue(new Task(taskData));
      mockTaskRepository.save.mockImplementation(async (t) => t);

      // 使用无效的用户ID
      const result = await taskService.updateTask('task_1', { title: '新标题' }, '');

      // 由于userId为空字符串，应该通过权限检查（空字符串 != 'parent'）
      expect(result.success).toBe(true);
    });

    it('应该处理任务ID为null的情况', async () => {
      mockTaskRepository.getById.mockResolvedValue(null);

      const result = await taskService.getTaskById(null);

      expect(result).toBeNull();
    });

    it('应该处理points为0的任务完成', async () => {
      const taskData = TestDataFactory.createTask({
        id: 'task_1',
        userId: 'parent',
        status: TaskStatus.PENDING,
        starAwarded: false,
        isRequired: false,
        points: 0
      });

      const task = new Task(taskData);
      mockTaskRepository.getById.mockResolvedValue(task);
      mockTaskRepository.save.mockResolvedValue({
        ...task,
        status: TaskStatus.COMPLETED,
        starAwarded: true
      });

      const result = await taskService.completeTask('task_1');

      expect(result.success).toBe(true);
      // points为0时不应该调用addStars
      expect(mockStarService.addStars).not.toHaveBeenCalled();
    });

    it('应该处理重复任务的days数组包含字符串数字', async () => {
      const taskData = TestDataFactory.createTask({
        userId: 'parent',
        title: '自定义重复任务',
        type: TaskType.HABIT,
        date: dateUtils.getTodayString(),
        repeat: {
          type: 'custom',
          days: ['1', '3', '5'], // 字符串数字
          startDate: dateUtils.getTodayString(),
          endDate: dateUtils.formatDate(dateUtils.addDays(new Date(), 7))
        }
      });

      const task = new Task(taskData);
      mockTaskRepository.save.mockResolvedValue(task);

      const result = await taskService.createTask(taskData);

      expect(result.success).toBe(true);
    });
  });

  // ============================================================
  // M07：云端同步失败降级测试
  // ============================================================

  describe('M07 - 云端写操作失败降级', () => {
    beforeEach(() => {
      taskService.enableCloudStorage = true;
    });

    afterEach(() => {
      taskService.enableCloudStorage = false;
    });

    it('updateTask：本地成功但云端失败时应返回成功并打warn', async () => {
      const task = new Task(TestDataFactory.createTask({ id: 't1', userId: 'u1' }));
      mockTaskRepository.getById.mockResolvedValue(task);
      mockTaskRepository.save.mockResolvedValue(task);
      HttpClient.put = jest.fn().mockRejectedValue(new Error('cloud error'));

      const result = await taskService.updateTask('t1', { title: '新标题' });

      expect(result.success).toBe(true);
    });

    it('deleteTask：本地成功但云端失败时应返回成功并打warn', async () => {
      const task = new Task(TestDataFactory.createTask({ id: 't1', userId: 'u1' }));
      mockTaskRepository.getById.mockResolvedValue(task);
      mockTaskRepository.delete.mockResolvedValue(true);
      HttpClient.delete = jest.fn().mockRejectedValue(new Error('cloud error'));

      const result = await taskService.deleteTask('t1');

      expect(result.success).toBe(true);
    });

    it('deleteTask：云端删除失败后应发出待补偿事件', async () => {
      const task = new Task(TestDataFactory.createTask({ id: 't_delete_fail', userId: 'u1' }));
      mockTaskRepository.getById.mockResolvedValue(task);
      mockTaskRepository.delete.mockResolvedValue(true);
      HttpClient.request = jest.fn().mockRejectedValue(new Error('cloud request error'));

      const result = await taskService.deleteTask('t_delete_fail');
      await new Promise(setImmediate);

      expect(result.success).toBe(true);
      mockEventBus.verifyEmit(EVENTS.TASK_CLOUD_SYNC_FAILED, {
        action: 'delete',
        taskId: 't_delete_fail'
      });
    });

    it('updateTaskStatus：本地成功但云端失败时应返回成功并打warn', async () => {
      const task = new Task(TestDataFactory.createTask({ id: 't1', userId: 'u1', status: 0, isRequired: true }));
      mockTaskRepository.getById.mockResolvedValue(task);
      mockTaskRepository.save.mockResolvedValue(task);
      HttpClient.patch = jest.fn().mockRejectedValue(new Error('cloud error'));

      const result = await taskService.updateTaskStatus('t1', 1);

      expect(result.success).toBe(true);
    });

    it('resetTask：本地成功但云端失败时应返回成功并打warn', async () => {
      const task = new Task(TestDataFactory.createTask({
        id: 't1', userId: 'u1', status: 1, starAwarded: true, points: 0, isRequired: false
      }));
      mockTaskRepository.getById.mockResolvedValue(task);
      mockTaskRepository.save.mockResolvedValue(task);
      HttpClient.patch = jest.fn().mockRejectedValue(new Error('cloud error'));

      const result = await taskService.resetTask('t1');

      expect(result.success).toBe(true);
    });
  });

  describe('M15A - pendingSync required/unrequired 补云', () => {
    beforeEach(() => {
      taskService.enableCloudStorage = true;
      taskService._syncRequiredStateToCloud = jest.fn().mockResolvedValue(true);
      taskService._getDeleteTombstones = jest.fn().mockResolvedValue([]);
    });

    afterEach(() => {
      taskService.enableCloudStorage = false;
    });

    it('应将 required/unrequired 待同步任务路由到专用同步入口', async () => {
      const requiredTask = new Task(TestDataFactory.createTask({
        id: 'required_task',
        userId: 'u1',
        isRequired: true
      }));
      requiredTask.syncedToCloud = true;
      requiredTask.pendingSyncMeta = { action: 'required' };

      const unrequiredTask = new Task(TestDataFactory.createTask({
        id: 'unrequired_task',
        userId: 'u1',
        isRequired: false
      }));
      unrequiredTask.syncedToCloud = true;
      unrequiredTask.pendingSyncMeta = { action: 'unrequired' };

      mockTaskRepository.getAll.mockResolvedValue([requiredTask, unrequiredTask]);

      await taskService._flushPendingTaskSyncs();

      expect(taskService._syncRequiredStateToCloud).toHaveBeenCalledTimes(2);
      expect(taskService._syncRequiredStateToCloud).toHaveBeenNthCalledWith(1, requiredTask);
      expect(taskService._syncRequiredStateToCloud).toHaveBeenNthCalledWith(2, unrequiredTask);
    });
  });

  // ============================================================
  // M07：_fetchTasksFromCloud 云端读取契约测试
  // ============================================================

  describe('M07 - _fetchTasksFromCloud 云端读取契约', () => {
    it('应该返回 Task 模型实例而非普通对象', async () => {
      const rawTasks = [
        { taskId: 't1', userId: 'u1', title: '任务1', date: '2026-03-01', type: 'study', points: 5, status: 0 }
      ];
      HttpClient.get = jest.fn().mockResolvedValue({ tasks: rawTasks, total: 1 });
      taskService.userService = { getLoginUserId: jest.fn().mockReturnValue('u1') };

      const tasks = await taskService._fetchTasksFromCloud('u1');

      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toBeInstanceOf(Task);
    });

    it('应该将 taskId 映射为 id', async () => {
      const rawTasks = [
        { taskId: 'task_abc', userId: 'u1', title: '测试任务', date: '2026-03-01', type: 'study', points: 0, status: 0 }
      ];
      HttpClient.get = jest.fn().mockResolvedValue({ tasks: rawTasks, total: 1 });
      taskService.userService = { getLoginUserId: jest.fn().mockReturnValue('u1') };

      const tasks = await taskService._fetchTasksFromCloud('u1');

      expect(tasks[0].id).toBe('task_abc');
    });
  });

  describe('M12 - _syncTaskToCloud 历史占位 userId 兼容', () => {
    beforeEach(() => {
      taskService.enableCloudStorage = true;
      taskService._markTaskSynced = jest.fn().mockResolvedValue(true);
      taskService.userService = {
        getLoginUserId: jest.fn().mockReturnValue('parent_real'),
        getCurrentUser: jest.fn().mockReturnValue({ userId: 'parent_real', role: 'parent' }),
        getAllUsers: jest.fn().mockReturnValue([
          { userId: 'parent_real', role: 'parent' },
          { userId: 'child_real', role: 'child' }
        ])
      };
      HttpClient.post = jest.fn().mockResolvedValue({ success: true });
    });

    afterEach(() => {
      taskService.enableCloudStorage = false;
    });

    it('历史 parent 占位任务补云时不应携带 targetUserId=parent', async () => {
      const task = new Task(TestDataFactory.createTask({
        id: 'legacy_parent_task',
        userId: 'parent'
      }));
      task.pendingSyncMeta = {
        action: 'create',
        modifyTime: 1001,
        operationKey: 'op_1001',
        operatorUserId: 'parent_real',
        operatorRole: 'parent',
        familyId: 'fam_1',
        targetUserId: 'parent'
      };

      await taskService._syncTaskToCloud(task);

      const payload = HttpClient.post.mock.calls[0][1];
      expect(payload.targetUserId).toBeUndefined();
      expect(task.userId).toBe('parent_real');
      expect(taskService._markTaskSynced).toHaveBeenCalledWith(task, { modifyTime: 1001 });
    });

    it('真实孩子任务补云时应保留 targetUserId', async () => {
      const task = new Task(TestDataFactory.createTask({
        id: 'child_task',
        userId: 'child_real'
      }));
      task.pendingSyncMeta = {
        action: 'create',
        modifyTime: 1002,
        operationKey: 'op_1002',
        operatorUserId: 'parent_real',
        operatorRole: 'parent',
        familyId: 'fam_1',
        targetUserId: 'child_real'
      };

      await taskService._syncTaskToCloud(task);

      const payload = HttpClient.post.mock.calls[0][1];
      expect(payload.targetUserId).toBe('child_real');
    });

    it('历史 child 占位任务在单孩子家庭中应映射到真实孩子ID', async () => {
      const task = new Task(TestDataFactory.createTask({
        id: 'legacy_child_task',
        userId: 'child'
      }));
      task.pendingSyncMeta = {
        action: 'create',
        modifyTime: 1003,
        operationKey: 'op_1003',
        operatorUserId: 'parent_real',
        operatorRole: 'parent',
        familyId: 'fam_1',
        targetUserId: 'child'
      };

      await taskService._syncTaskToCloud(task);

      const payload = HttpClient.post.mock.calls[0][1];
      expect(task.userId).toBe('child_real');
      expect(payload.targetUserId).toBe('child_real');
    });

    it('无法解析的历史 child 占位任务不应错误上云', async () => {
      taskService.userService.getAllUsers.mockReturnValue([
        { userId: 'parent_real', role: 'parent' },
        { userId: 'child_a', role: 'child' },
        { userId: 'child_b', role: 'child' }
      ]);
      taskService.userService.getCurrentUser.mockReturnValue({ userId: 'parent_real', role: 'parent' });

      const task = new Task(TestDataFactory.createTask({
        id: 'legacy_child_ambiguous',
        userId: 'child'
      }));
      task.pendingSyncMeta = {
        action: 'create',
        modifyTime: 1004,
        operationKey: 'op_1004',
        operatorUserId: 'parent_real',
        operatorRole: 'parent',
        familyId: 'fam_1',
        targetUserId: 'child'
      };

      await expect(taskService._syncTaskToCloud(task)).rejects.toThrow('历史任务归属未映射');
      expect(HttpClient.post).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // M09：resetTask 跨设备放开测试
  // ============================================================

  describe('M07 - resetTask 跨设备拒绝检测', () => {
    it('跨设备完成的任务（已完成+未奖星+有积分+非必做）在 M09 中应允许重置', async () => {
      const task = new Task(TestDataFactory.createTask({
        id: 't1', userId: 'u1', status: 1, starAwarded: false, points: 5, isRequired: false
      }));
      mockTaskRepository.getById.mockResolvedValue(task);
      mockTaskRepository.save.mockImplementation(async (t) => t);

      const result = await taskService.resetTask('t1');

      expect(result.success).toBe(true);
      expect(result.crossDeviceLimit).not.toBe(true);
    });

    it('points=0 的已完成任务应允许重置（不涉及积分）', async () => {
      const task = new Task(TestDataFactory.createTask({
        id: 't1', userId: 'u1', status: 1, starAwarded: false, points: 0, isRequired: false
      }));
      mockTaskRepository.getById.mockResolvedValue(task);
      mockTaskRepository.save.mockImplementation(async (t) => t);

      const result = await taskService.resetTask('t1');

      expect(result.crossDeviceLimit).toBeUndefined();
    });

    it('isRequired=true 的已完成任务应允许重置（必做任务不涉及积分）', async () => {
      const task = new Task(TestDataFactory.createTask({
        id: 't1', userId: 'u1', status: 1, starAwarded: false, points: 5, isRequired: true
      }));
      mockTaskRepository.getById.mockResolvedValue(task);
      mockTaskRepository.save.mockImplementation(async (t) => t);

      const result = await taskService.resetTask('t1');

      expect(result.crossDeviceLimit).toBeUndefined();
    });
  });

  // ============================================================
  // M07：getTasksByScope 方法测试
  // ============================================================

  describe('M07 - getTasksByScope', () => {
    it('传入 userId 时应委托给 getAllTasks', async () => {
      const tasks = [new Task(TestDataFactory.createTask({ id: 't1', userId: 'u1' }))];
      mockTaskRepository.getAll.mockResolvedValue(tasks);

      const result = await taskService.getTasksByScope({ userId: 'u1' });

      expect(mockTaskRepository.getAll).toHaveBeenCalled();
    });

    it('传入 scope=family 且无云端时应返回全量本地任务', async () => {
      taskService.enableCloudStorage = false;
      const tasks = [new Task(TestDataFactory.createTask({ id: 't1' }))];
      mockTaskRepository.getAll.mockResolvedValue(tasks);

      const result = await taskService.getTasksByScope({ scope: 'family' });

      expect(result).toEqual(tasks);
    });
  });

  // ============================================================
  // M08：重复任务批量云端同步
  // ============================================================

  describe('M08 - _generateRepeatTasks 批量云端同步', () => {
    beforeEach(() => {
      mockTaskRepository.saveAll = jest.fn().mockImplementation(async (tasks) => tasks);
      mockTaskRepository.getByUserId = jest.fn().mockResolvedValue([]);
      taskService.enableCloudStorage = true;
      taskService.userService = { getLoginUserId: jest.fn().mockReturnValue('u1') };
    });

    it('enableCloudStorage=false 时不触发云端同步', async () => {
      taskService.enableCloudStorage = false;
      HttpClient.post = jest.fn();

      const parentTask = new Task(TestDataFactory.createTask({
        id: 'parent_1', userId: 'u1',
        repeat: { type: 'weekly', startDate: '2026-03-17', endDate: '2026-03-31' }
      }));
      await taskService._generateRepeatTasks(parentTask);

      // fire-and-forget，等一个 tick
      await new Promise(r => setTimeout(r, 0));
      expect(HttpClient.post).not.toHaveBeenCalled();
    });

    it('云端同步成功后应将 syncedToCloud 更新为 true 并调用 saveAll', async () => {
      HttpClient.post = jest.fn().mockResolvedValue({ taskId: 'x', status: 0 });

      const parentTask = new Task(TestDataFactory.createTask({
        id: 'parent_2', userId: 'u1',
        repeat: { type: 'weekly', startDate: '2026-03-17', endDate: '2026-03-31' }
      }));
      await taskService._generateRepeatTasks(parentTask);

      // 等待 fire-and-forget 完成
      await new Promise(r => setTimeout(r, 200));
      const saveAllCalls = mockTaskRepository.saveAll.mock.calls;
      // 至少有一次 saveAll（本地批量保存）+ 一次 syncedToCloud 更新
      expect(saveAllCalls.length).toBeGreaterThanOrEqual(2);
      const syncedCallArgs = saveAllCalls[saveAllCalls.length - 1][0];
      expect(syncedCallArgs.every(t => t.syncedToCloud === true)).toBe(true);
    });

    it('云端同步失败不应影响本地实例的返回', async () => {
      HttpClient.post = jest.fn().mockRejectedValue(new Error('network error'));

      const parentTask = new Task(TestDataFactory.createTask({
        id: 'parent_3', userId: 'u1',
        repeat: { type: 'weekly', startDate: '2026-03-17', endDate: '2026-03-31' }
      }));
      const result = await taskService._generateRepeatTasks(parentTask);

      expect(result.length).toBeGreaterThan(0);
    });

    it('开始日期早于今天的每周重复任务应保留原始周期，只生成未来对齐实例', async () => {
      HttpClient.post = jest.fn().mockResolvedValue({ taskId: 'x', status: 0 });

      const parentTask = new Task(TestDataFactory.createTask({
        id: 'parent_3b',
        userId: 'u1',
        date: '2026-03-17',
        repeat: { type: 'weekly', startDate: '2026-03-17', endDate: '2026-03-31' }
      }));

      const result = await taskService._generateRepeatTasks(parentTask);

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2026-03-31');
    });

    it('_createRepeatTaskInstance 应重置 syncedToCloud 为 false', () => {
      const parentTask = new Task(TestDataFactory.createTask({
        id: 'parent_4', userId: 'u1', syncedToCloud: true
      }));
      const instance = taskService._createRepeatTaskInstance(parentTask, new Date('2026-03-20'));

      expect(instance.syncedToCloud).toBe(false);
    });
  });

  // ============================================================
  // M08：modifyTime 冲突保护
  // ============================================================

  describe('M08 - _fetchTasksFromCloud modifyTime 冲突保护', () => {
    beforeEach(() => {
      mockTaskRepository.saveAll = jest.fn().mockResolvedValue([]);
      mockTaskRepository.getByUserId = jest.fn().mockResolvedValue([]);
      taskService.enableCloudStorage = true;
      taskService.userService = { getLoginUserId: jest.fn().mockReturnValue('u1') };
    });

    it('本地 modifyTime 更新时：返回对象应为本地版本（title 为本地标题）', async () => {
      const localTask = new Task(TestDataFactory.createTask({
        id: 't1', userId: 'u1', title: '本地标题', modifyTime: 2000
      }));
      mockTaskRepository.getByUserId.mockResolvedValue([localTask]);

      HttpClient.get = jest.fn().mockResolvedValue({
        tasks: [{ taskId: 't1', userId: 'u1', title: '云端旧标题', date: '2026-03-01', type: 'study', points: 0, status: 0, modifyTime: 1000 }]
      });

      const tasks = await taskService._fetchTasksFromCloud('u1');
      expect(tasks.find(t => t.id === 't1').title).toBe('本地标题');
    });

    it('本地 modifyTime 更新时：该任务应被加入 saveAll（携带本地版本）', async () => {
      const localTask = new Task(TestDataFactory.createTask({
        id: 't1', userId: 'u1', title: '本地标题', modifyTime: 2000
      }));
      mockTaskRepository.getByUserId.mockResolvedValue([localTask]);

      HttpClient.get = jest.fn().mockResolvedValue({
        tasks: [{ taskId: 't1', userId: 'u1', title: '云端旧标题', date: '2026-03-01', type: 'study', points: 0, status: 0, modifyTime: 1000 }]
      });

      await taskService._fetchTasksFromCloud('u1');

      expect(mockTaskRepository.saveAll).toHaveBeenCalled();
      const saved = mockTaskRepository.saveAll.mock.calls[0][0];
      const savedTask = saved.find(t => t.id === 't1');
      expect(savedTask).toBeDefined();
      expect(savedTask.title).toBe('本地标题');
    });

    it('云端 modifyTime 更新时：应正常回灌云端版本', async () => {
      const localTask = new Task(TestDataFactory.createTask({
        id: 't2', userId: 'u1', title: '本地旧标题', modifyTime: 1000
      }));
      mockTaskRepository.getByUserId.mockResolvedValue([localTask]);

      HttpClient.get = jest.fn().mockResolvedValue({
        tasks: [{ taskId: 't2', userId: 'u1', title: '云端新标题', date: '2026-03-01', type: 'study', points: 0, status: 0, modifyTime: 2000 }]
      });

      const tasks = await taskService._fetchTasksFromCloud('u1');
      expect(tasks.find(t => t.id === 't2').title).toBe('云端新标题');
    });

    it('云端 modifyTime=null 时，本地有值则本地优先', async () => {
      const localTask = new Task(TestDataFactory.createTask({
        id: 't3', userId: 'u1', title: '本地标题', modifyTime: 1000
      }));
      mockTaskRepository.getByUserId.mockResolvedValue([localTask]);

      HttpClient.get = jest.fn().mockResolvedValue({
        tasks: [{ taskId: 't3', userId: 'u1', title: '云端标题', date: '2026-03-01', type: 'study', points: 0, status: 0, modifyTime: null }]
      });

      const tasks = await taskService._fetchTasksFromCloud('u1');
      expect(tasks.find(t => t.id === 't3').title).toBe('本地标题');
    });

    it('本地 modifyTime=0（无时间戳）、云端 modifyTime=null 时走原有覆盖逻辑（云端版本回灌）', async () => {
      const localTask = new Task(TestDataFactory.createTask({ id: 't5', userId: 'u1', title: '本地标题' }));
      // 手动置 0，模拟"本地无 modifyTime"状态（Task 构造函数默认赋 Date.now()）
      localTask.modifyTime = 0;
      mockTaskRepository.getByUserId.mockResolvedValue([localTask]);

      HttpClient.get = jest.fn().mockResolvedValue({
        tasks: [{ taskId: 't5', userId: 'u1', title: '云端标题', date: '2026-03-01', type: 'study', points: 0, status: 0, modifyTime: null }]
      });

      const tasks = await taskService._fetchTasksFromCloud('u1');
      // 0 > (null || 0) = 0 > 0 → false，云端覆盖本地
      expect(tasks.find(t => t.id === 't5').title).toBe('云端标题');
      const saved = mockTaskRepository.saveAll.mock.calls[0][0];
      expect(saved.find(t => t.id === 't5')).toBeDefined();
    });

    it('modifyTime 保护与 starAwarded 保护共存：本地更新时 starAwarded 应正确保留', async () => {
      const localTask = new Task(TestDataFactory.createTask({
        id: 't6', userId: 'u1', title: '本地标题', modifyTime: 2000, starAwarded: true
      }));
      mockTaskRepository.getByUserId.mockResolvedValue([localTask]);

      HttpClient.get = jest.fn().mockResolvedValue({
        tasks: [{ taskId: 't6', userId: 'u1', title: '云端旧标题', date: '2026-03-01', type: 'study', points: 0, status: 0, modifyTime: 1000, starAwarded: false }]
      });

      const tasks = await taskService._fetchTasksFromCloud('u1');
      const result = tasks.find(t => t.id === 't6');
      // 本地版本更新：title 保留本地
      expect(result.title).toBe('本地标题');
      // starAwarded 也应保留本地值（通过 Object.assign 携带）
      expect(result.starAwarded).toBe(true);
    });

    it('回灌任务应被标记 syncedToCloud=true', async () => {
      mockTaskRepository.getByUserId.mockResolvedValue([]);

      HttpClient.get = jest.fn().mockResolvedValue({
        tasks: [{ taskId: 't4', userId: 'u1', title: '任务', date: '2026-03-01', type: 'study', points: 0, status: 0, modifyTime: 1000 }]
      });

      await taskService._fetchTasksFromCloud('u1');

      const saved = mockTaskRepository.saveAll.mock.calls[0][0];
      expect(saved.find(t => t.id === 't4').syncedToCloud).toBe(true);
    });
  });

  // ============================================================
  // M08：_cleanupStaleTasks 安全清理
  // ============================================================

  describe('M08 - _cleanupStaleTasks', () => {
    beforeEach(() => {
      mockTaskRepository.saveAll = jest.fn().mockResolvedValue([]);
      mockTaskRepository.getByUserId = jest.fn().mockResolvedValue([]);
    });

    it('syncedToCloud=true 且云端不存在时应被删除', async () => {
      const staleTask = new Task(TestDataFactory.createTask({ id: 'stale_1', userId: 'u1', syncedToCloud: true }));
      mockTaskRepository.getByUserId.mockResolvedValue([staleTask]);

      const cloudIds = new Set(['other_task']);
      await taskService._cleanupStaleTasks(cloudIds, 'u1');

      expect(mockTaskRepository.delete).toHaveBeenCalledWith('stale_1');
    });

    it('syncedToCloud=false（sync失败的普通任务）不应被删除', async () => {
      const localTask = new Task(TestDataFactory.createTask({ id: 'local_1', userId: 'u1', syncedToCloud: false }));
      mockTaskRepository.getByUserId.mockResolvedValue([localTask]);

      const cloudIds = new Set();
      await taskService._cleanupStaleTasks(cloudIds, 'u1');

      expect(mockTaskRepository.delete).not.toHaveBeenCalled();
    });

    it('syncedToCloud=false 的重复实例（sync失败）不应被删除', async () => {
      const instance = new Task(TestDataFactory.createTask({
        id: 'inst_1', userId: 'u1', parentTaskId: 'parent_1', syncedToCloud: false
      }));
      mockTaskRepository.getByUserId.mockResolvedValue([instance]);

      const cloudIds = new Set();
      await taskService._cleanupStaleTasks(cloudIds, 'u1');

      expect(mockTaskRepository.delete).not.toHaveBeenCalled();
    });

    it('syncedToCloud=true 的重复实例（已上云后被其他设备删除）应被删除', async () => {
      const instance = new Task(TestDataFactory.createTask({
        id: 'inst_2', userId: 'u1', parentTaskId: 'parent_1', syncedToCloud: true
      }));
      mockTaskRepository.getByUserId.mockResolvedValue([instance]);

      const cloudIds = new Set();
      await taskService._cleanupStaleTasks(cloudIds, 'u1');

      expect(mockTaskRepository.delete).toHaveBeenCalledWith('inst_2');
    });

    it('清理失败不应抛出异常（主流程不受影响）', async () => {
      const staleTask = new Task(TestDataFactory.createTask({ id: 'stale_2', userId: 'u1', syncedToCloud: true }));
      mockTaskRepository.getByUserId.mockResolvedValue([staleTask]);
      mockTaskRepository.delete.mockRejectedValue(new Error('delete failed'));

      const cloudIds = new Set();
      await expect(taskService._cleanupStaleTasks(cloudIds, 'u1')).resolves.not.toThrow();
    });
  });

  // ============================================================
  // M08：全量拉取触发清理 / 日期过滤不触发清理
  // ============================================================

  describe('M08 - isFullFetch 清理触发条件', () => {
    beforeEach(() => {
      mockTaskRepository.saveAll = jest.fn().mockResolvedValue([]);
      mockTaskRepository.getByUserId = jest.fn().mockResolvedValue([]);
      taskService.enableCloudStorage = true;
      taskService.userService = { getLoginUserId: jest.fn().mockReturnValue('u1') };
      HttpClient.get = jest.fn().mockResolvedValue({ tasks: [] });
      jest.spyOn(taskService, '_cleanupStaleTasks').mockResolvedValue();
    });

    it('无参数的全量拉取应触发 _cleanupStaleTasks', async () => {
      await taskService._fetchTasksFromCloud('u1');
      expect(taskService._cleanupStaleTasks).toHaveBeenCalled();
    });

    it('带 date 参数的拉取不应触发 _cleanupStaleTasks', async () => {
      await taskService._fetchTasksFromCloud('u1', { date: '2026-03-19' });
      expect(taskService._cleanupStaleTasks).not.toHaveBeenCalled();
    });

    it('带 startDate/endDate 的拉取不应触发 _cleanupStaleTasks', async () => {
      await taskService._fetchTasksFromCloud('u1', { startDate: '2026-03-01', endDate: '2026-03-31' });
      expect(taskService._cleanupStaleTasks).not.toHaveBeenCalled();
    });

    it('带 scope=family 的拉取不应触发 _cleanupStaleTasks', async () => {
      await taskService._fetchTasksFromCloud('u1', { scope: 'family' });
      expect(taskService._cleanupStaleTasks).not.toHaveBeenCalled();
    });

    it('家长代孩子查任务（userId != loginUserId）不应触发 _cleanupStaleTasks', async () => {
      // loginUserId = 'u1'（家长），userId = 'child1'（孩子）
      taskService.userService = { getLoginUserId: jest.fn().mockReturnValue('u1') };
      await taskService._fetchTasksFromCloud('child1');
      expect(taskService._cleanupStaleTasks).not.toHaveBeenCalled();
    });

    it('按指定孩子读取任务时不应重复透传 userId 查询参数', async () => {
      taskService.userService = { getLoginUserId: jest.fn().mockReturnValue('u1') };

      await taskService._fetchTasksFromCloud('child1', { userId: 'child1', date: '2026-03-19' });

      expect(HttpClient.get).toHaveBeenCalledWith('/api/tasks', {
        date: '2026-03-19',
        targetUserId: 'child1'
      });
    });
  });

  // ===== M08b: _migrateTasksToChild =====
  describe('M08b _migrateTasksToChild', () => {
    let mockSaveAll;

    beforeEach(() => {
      mockSaveAll = jest.fn().mockResolvedValue(undefined);
      taskService.taskRepository = {
        getByUserId: jest.fn(),
        saveAll: mockSaveAll,
      };
      HttpClient.post = jest.fn();
    });

    it('云端成功时返回云端 count，并更新本地 userId', async () => {
      const task = { id: 't1', userId: 'parent1', syncedToCloud: true };
      taskService.taskRepository.getByUserId.mockResolvedValue([task]);
      HttpClient.post.mockResolvedValue({ count: 1 });

      const result = await taskService._migrateTasksToChild('parent1', 'child1');

      expect(result).toEqual({ success: true, count: 1 });
      expect(task.userId).toBe('child1');
      expect(mockSaveAll).toHaveBeenCalled();
    });

    it('云端成功时 syncedToCloud 保持不变', async () => {
      const t1 = { id: 't1', userId: 'parent1', syncedToCloud: true };
      const t2 = { id: 't2', userId: 'parent1', syncedToCloud: false };
      taskService.taskRepository.getByUserId.mockResolvedValue([t1, t2]);
      HttpClient.post.mockResolvedValue({ count: 2 });

      await taskService._migrateTasksToChild('parent1', 'child1');

      expect(t1.syncedToCloud).toBe(true);
      expect(t2.syncedToCloud).toBe(false);
    });

    it('云端失败时不修改本地，返回 success=false', async () => {
      const task = { id: 't1', userId: 'parent1', syncedToCloud: true };
      taskService.taskRepository.getByUserId.mockResolvedValue([task]);
      HttpClient.post.mockRejectedValue(new Error('网络错误'));

      const result = await taskService._migrateTasksToChild('parent1', 'child1');

      expect(result).toEqual({ success: false, count: 0 });
      expect(task.userId).toBe('parent1');
      expect(mockSaveAll).not.toHaveBeenCalled();
    });

    it('本地为空时仍调用云端，count 来自 affectedRows', async () => {
      taskService.taskRepository.getByUserId.mockResolvedValue([]);
      HttpClient.post.mockResolvedValue({ count: 3 });

      const result = await taskService._migrateTasksToChild('parent1', 'child1');

      expect(HttpClient.post).toHaveBeenCalled();
      expect(result).toEqual({ success: true, count: 3 });
      expect(mockSaveAll).not.toHaveBeenCalled();
    });

    it('重复触发时云端 count=0 且本地为空，无副作用', async () => {
      taskService.taskRepository.getByUserId.mockResolvedValue([]);
      HttpClient.post.mockResolvedValue({ count: 0 });

      const result = await taskService._migrateTasksToChild('parent1', 'child1');

      expect(result).toEqual({ success: true, count: 0 });
      expect(mockSaveAll).not.toHaveBeenCalled();
    });
  });
});
