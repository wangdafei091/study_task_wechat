/**
 * task-repository.test.js - Task Repository 测试
 *
 * 测试 Task Repository 的数据访问和业务逻辑
 */

const TaskRepository = require('../../repositories/task-repository');
const { Task, TaskType, TaskStatus } = require('../../models/task');
const TestDataFactory = require('../utils/test-data-factory');

describe('Task Repository', () => {
  let repository;
  let mockStorageAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // 创建 Mock StorageAdapter
    mockStorageAdapter = {
      getAsync: jest.fn().mockResolvedValue([]),
      setAsync: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue(),
      clear: jest.fn().mockResolvedValue()
    };

    // 创建 Repository 实例，禁用缓存以简化测试
    repository = new TaskRepository(mockStorageAdapter, { useCache: false });
  });

  // ====== 初始化 ======
  describe('初始化', () => {
    it('应该正确初始化仓储', () => {
      expect(repository).toBeInstanceOf(TaskRepository);
    });

    it('应该设置默认的存储键', () => {
      expect(repository.storageKey).toBe('taskData');
    });
  });

  // ====== getTodayTasks ======
  describe('getTodayTasks', () => {
    it('应该返回今天的任务', async () => {
      const today = new Date().toISOString().split('T')[0];
      const mockTasks = [
        TestDataFactory.createTask({ date: today, type: TaskType.STUDY }),
        TestDataFactory.createTask({ date: today, type: TaskType.HABIT })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockTasks);

      const tasks = await repository.getTodayTasks();

      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks[0].date).toBe(today);
    });

    it('应该过滤用户ID', async () => {
      const userId = 'user_123';
      const today = new Date().toISOString().split('T')[0];
      const mockTasks = [
        TestDataFactory.createTask({ date: today, userId: 'user_456' }),
        TestDataFactory.createTask({ date: today, userId: userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockTasks);

      const tasks = await repository.getTodayTasks(userId);

      expect(tasks.length).toBe(1);
      expect(tasks[0].userId).toBe(userId);
    });

    it('应该对任务进行排序（必做优先）', async () => {
      const today = new Date().toISOString().split('T')[0];
      const mockTasks = [
        TestDataFactory.createTask({ date: today, isRequired: false, startTime: '09:00' }),
        TestDataFactory.createTask({ date: today, isRequired: true, startTime: '' })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockTasks);

      const tasks = await repository.getTodayTasks();

      expect(tasks[0].isRequired).toBe(true);
    });

    it('应该处理空存储', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const tasks = await repository.getTodayTasks();

      expect(tasks).toEqual([]);
    });
  });

  // ====== getTasksByDate ======
  describe('getTasksByDate', () => {
    it('应该返回指定日期的任务', async () => {
      const date = '2026-03-04';
      const mockTasks = [
        TestDataFactory.createTask({ date: date, type: TaskType.STUDY })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockTasks);

      const tasks = await repository.getTasksByDate(date);

      expect(tasks.length).toBe(1);
      expect(tasks[0].date).toBe(date);
    });

    it('应该过滤用户ID', async () => {
      const userId = 'user_123';
      const date = '2026-03-04';
      const mockTasks = [
        TestDataFactory.createTask({ date: date, userId: 'user_456' }),
        TestDataFactory.createTask({ date: date, userId: userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockTasks);

      const tasks = await repository.getTasksByDate(date, userId);

      expect(tasks.length).toBe(1);
      expect(tasks[0].userId).toBe(userId);
    });

    it('应该处理无效日期', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const tasks = await repository.getTasksByDate('');

      expect(tasks).toEqual([]);
    });
  });

  // ====== getChildTasks ======
  describe('getChildTasks', () => {
    it('应该返回父任务的子任务', async () => {
      const parentTaskId = 'parent_123';
      const mockTasks = [
        TestDataFactory.createTask({ parentTaskId, title: '子任务1' }),
        TestDataFactory.createTask({ parentTaskId: 'other_parent' })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockTasks);

      const tasks = await repository.getChildTasks(parentTaskId);

      expect(tasks.length).toBe(1);
      expect(tasks[0].parentTaskId).toBe(parentTaskId);
    });

    it('应该处理无效的父任务ID', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const tasks = await repository.getChildTasks('');

      expect(tasks).toEqual([]);
    });
  });

  // ====== getExpiredIncompleteTask ======
  describe('getExpiredIncompleteTask', () => {
    it('应该返回过期未完成的任务', async () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const mockTasks = [
        TestDataFactory.createTask({ date: yesterday, status: TaskStatus.PENDING, title: '过期任务' }),
        TestDataFactory.createTask({ date: yesterday, status: TaskStatus.COMPLETED, title: '已完成任务' })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockTasks);

      const tasks = await repository.getExpiredIncompleteTask();

      expect(tasks.length).toBe(1);
      expect(tasks[0].status).toBe(TaskStatus.PENDING);
    });

    it('应该排除已完成的过期任务', async () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const mockTasks = [
        TestDataFactory.createTask({ date: yesterday, status: TaskStatus.COMPLETED })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockTasks);

      const tasks = await repository.getExpiredIncompleteTask();

      expect(tasks.length).toBe(0);
    });
  });

  // ====== getRequiredTasks ======
  describe('getRequiredTasks', () => {
    it('应该返回必做任务', async () => {
      const date = '2026-03-04';
      const mockTasks = [
        TestDataFactory.createTask({ date: date, isRequired: true, title: '必做任务' }),
        TestDataFactory.createTask({ date: date, isRequired: false, title: '普通任务' })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockTasks);

      const tasks = await repository.getRequiredTasks(date);

      expect(tasks.length).toBe(1);
      expect(tasks[0].isRequired).toBe(true);
    });

    it('不指定日期时应该返回所有必做任务', async () => {
      const mockTasks = [
        TestDataFactory.createTask({ isRequired: true, date: '2026-03-04' }),
        TestDataFactory.createTask({ isRequired: true, date: '2026-03-05' })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockTasks);

      const tasks = await repository.getRequiredTasks();

      expect(tasks.length).toBe(2);
    });
  });

  // ====== createTaskInstance ======
  describe('createTaskInstance', () => {
    it('应该创建子任务实例', async () => {
      const parentTask = new Task(TestDataFactory.createTask({
        id: 'parent_123',
        title: '父任务',
        repeat: { type: 'daily' }
      }));

      mockStorageAdapter.setAsync.mockResolvedValue(parentTask);

      const date = '2026-03-05';
      const childTask = await repository.createTaskInstance(parentTask, date);

      expect(childTask).not.toBeNull();
      expect(childTask.parentTaskId).toBe('parent_123');
      expect(childTask.date).toBe(date);
      expect(childTask.status).toBe(TaskStatus.PENDING);
    });
  });

  // ====== 边界场景 ======
  describe('边界场景', () => {
    it('应该处理空用户ID', async () => {
      const today = new Date().toISOString().split('T')[0];
      const mockTasks = [
        TestDataFactory.createTask({ date: today, userId: '' })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockTasks);

      const tasks = await repository.getTodayTasks('');

      expect(tasks.length).toBe(1);
    });
  });
});
