/**
 * task-repository.test.js - Task Repository 测试
 *
 * 测试 Task Repository 的数据访问和业务逻辑
 */

const TaskRepository = require('../../repositories/task-repository');
const {
  Task,
  TaskType,
  TaskStatus,
  TaskExecutionMode,
  TaskRecordOutcome
} = require('../../models/task');
const TestDataFactory = require('../utils/test-data-factory');

function formatLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalDateWithOffset(daysOffset) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return formatLocalDate(date);
}

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

  describe('删除墓碑', () => {
    it('getDeleteTombstones 应返回仓储中的删除墓碑', async () => {
      const tombstones = [{ entityId: 'task_1' }];
      mockStorageAdapter.getAsync.mockResolvedValue(tombstones);

      await expect(repository.getDeleteTombstones()).resolves.toEqual(tombstones);
      expect(mockStorageAdapter.getAsync).toHaveBeenCalledWith('taskDeleteTombstones', []);
    });

    it('saveDeleteTombstone 在参数无效时应返回 false', async () => {
      await expect(repository.saveDeleteTombstone(null)).resolves.toBe(false);
      await expect(repository.saveDeleteTombstone({})).resolves.toBe(false);
    });

    it('saveDeleteTombstone 应替换同 entityId 的旧墓碑', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([
        { entityId: 'task_1', operationKey: 'old' },
        { entityId: 'task_2', operationKey: 'keep' }
      ]);

      await repository.saveDeleteTombstone({ entityId: 'task_1', operationKey: 'new' });

      expect(mockStorageAdapter.setAsync).toHaveBeenCalledWith('taskDeleteTombstones', [
        { entityId: 'task_2', operationKey: 'keep' },
        { entityId: 'task_1', operationKey: 'new' }
      ]);
    });

    it('removeDeleteTombstone 在 entityId 无效时应返回 false', async () => {
      await expect(repository.removeDeleteTombstone('')).resolves.toBe(false);
    });

    it('removeDeleteTombstone 应删除指定 entityId 的墓碑', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([
        { entityId: 'task_1' },
        { entityId: 'task_2' }
      ]);

      await repository.removeDeleteTombstone('task_1');

      expect(mockStorageAdapter.setAsync).toHaveBeenCalledWith('taskDeleteTombstones', [
        { entityId: 'task_2' }
      ]);
    });
  });

  describe('内部过滤辅助函数', () => {
    it('_shouldIncludeInRegularTaskQuery 应处理空任务、includeOccurrence 和发生记录模式', () => {
      expect(repository._shouldIncludeInRegularTaskQuery(null)).toBe(false);
      expect(repository._shouldIncludeInRegularTaskQuery({ isOccurrenceMode: () => true }, { includeOccurrence: true })).toBe(true);
      expect(repository._shouldIncludeInRegularTaskQuery({ isOccurrenceMode: () => true })).toBe(false);
      expect(repository._shouldIncludeInRegularTaskQuery({ isOccurrenceMode: () => false })).toBe(true);
      expect(repository._shouldIncludeInRegularTaskQuery({})).toBe(true);
    });

    it('_shouldIncludeOccurrenceConfigTask 应按 activeRange 和 includeInactive 过滤', () => {
      const occurrenceTask = new Task({
        ...TestDataFactory.createTask({
          id: 'occ_cfg_1',
          userId: 'child_1',
          executionMode: TaskExecutionMode.OCCURRENCE,
          isOccurrenceRecord: false,
          date: '2026-04-01'
        }),
        activeRange: {
          startDate: '2026-04-01',
          endDate: '2026-04-10',
          hasNoEndDate: false
        }
      });

      expect(repository._shouldIncludeOccurrenceConfigTask(null, '2026-04-05')).toBe(false);
      expect(repository._shouldIncludeOccurrenceConfigTask({}, '2026-04-05')).toBe(false);
      expect(repository._shouldIncludeOccurrenceConfigTask(occurrenceTask, '2026-04-15')).toBe(false);
      expect(repository._shouldIncludeOccurrenceConfigTask(occurrenceTask, '2026-04-15', { includeInactive: true })).toBe(true);
      expect(repository._shouldIncludeOccurrenceConfigTask(occurrenceTask, '2026-04-05')).toBe(true);
      expect(repository._shouldIncludeOccurrenceConfigTask(occurrenceTask, '')).toBe(false);
    });
  });

  // ====== getTodayTasks ======
  describe('getTodayTasks', () => {
    it('应该返回今天的任务', async () => {
      const today = formatLocalDate();
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
      const today = formatLocalDate();
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
      const today = formatLocalDate();
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

  describe('getTasksByDateRange', () => {
    it('应该返回指定日期范围内的任务', async () => {
      const mockTasks = [
        TestDataFactory.createTask({ date: '2026-03-04', title: '任务1' }),
        TestDataFactory.createTask({ date: '2026-03-05', title: '任务2' }),
        TestDataFactory.createTask({ date: '2026-03-07', title: '任务3' })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockTasks);

      const tasks = await repository.getTasksByDateRange('2026-03-04', '2026-03-05');

      expect(tasks).toHaveLength(2);
      expect(tasks.map(task => task.date)).toEqual(['2026-03-04', '2026-03-05']);
    });

    it('应该过滤 occurrence 模式任务，除非显式要求包含', async () => {
      const occurrenceTask = new Task({
        ...TestDataFactory.createTask({
          id: 'occ_cfg_1',
          date: '2026-03-04',
          userId: 'child_1',
          executionMode: TaskExecutionMode.OCCURRENCE
        }),
        isOccurrenceRecord: false
      });
      const regularTask = TestDataFactory.createTask({
        id: 'task_regular',
        date: '2026-03-04',
        userId: 'child_1'
      });

      mockStorageAdapter.getAsync.mockResolvedValue([occurrenceTask, regularTask]);

      const regularOnly = await repository.getTasksByDateRange('2026-03-01', '2026-03-05', 'child_1');
      const withOccurrence = await repository.getTasksByDateRange('2026-03-01', '2026-03-05', 'child_1', {
        includeOccurrence: true
      });

      expect(regularOnly).toHaveLength(1);
      expect(regularOnly[0].id).toBe('task_regular');
      expect(withOccurrence).toHaveLength(2);
    });

    it('应该处理无效日期范围和查询异常', async () => {
      await expect(repository.getTasksByDateRange('', '2026-03-05')).resolves.toEqual([]);

      jest.spyOn(repository, 'query').mockRejectedValueOnce(new Error('boom'));
      await expect(repository.getTasksByDateRange('2026-03-01', '2026-03-05')).resolves.toEqual([]);
    });
  });

  // ====== getExpiredIncompleteTask ======
  describe('getExpiredIncompleteTask', () => {
    it('应该返回过期未完成的任务', async () => {
      const yesterday = getLocalDateWithOffset(-1);
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
      const yesterday = getLocalDateWithOffset(-1);
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

    it('参数无效、父任务无法创建子任务或保存失败时应返回 null', async () => {
      await expect(repository.createTaskInstance(null, '2026-03-05')).resolves.toBeNull();

      const invalidParent = { id: 'parent_1', createChildTask: jest.fn(() => null) };
      await expect(repository.createTaskInstance(invalidParent, '2026-03-05')).resolves.toBeNull();

      const validParent = new Task(TestDataFactory.createTask({
        id: 'parent_2',
        title: '父任务',
        repeat: { type: 'daily' }
      }));
      jest.spyOn(repository, 'save').mockRejectedValueOnce(new Error('save fail'));

      await expect(repository.createTaskInstance(validParent, '2026-03-05')).resolves.toBeNull();
    });
  });

  describe('createTaskInstances', () => {
    it('应该批量创建任务实例', async () => {
      const parentTask = new Task(TestDataFactory.createTask({
        id: 'parent_batch',
        title: '父任务',
        repeat: { type: 'daily' }
      }));
      jest.spyOn(repository, 'saveAll').mockResolvedValueOnce([
        parentTask.createChildTask('2026-03-05'),
        parentTask.createChildTask('2026-03-06')
      ]);

      const results = await repository.createTaskInstances(parentTask, ['2026-03-05', '2026-03-06']);

      expect(results).toHaveLength(2);
      expect(repository.saveAll).toHaveBeenCalled();
    });

    it('参数无效、全部创建失败或 saveAll 异常时应返回空数组', async () => {
      await expect(repository.createTaskInstances(null, [])).resolves.toEqual([]);

      const parentTask = {
        id: 'parent_invalid',
        createChildTask: jest.fn(() => null)
      };
      await expect(repository.createTaskInstances(parentTask, ['2026-03-05'])).resolves.toEqual([]);

      const validParent = new Task(TestDataFactory.createTask({
        id: 'parent_err',
        title: '父任务',
        repeat: { type: 'daily' }
      }));
      jest.spyOn(repository, 'saveAll').mockRejectedValueOnce(new Error('saveAll fail'));

      await expect(repository.createTaskInstances(validParent, ['2026-03-05'])).resolves.toEqual([]);
    });
  });

  describe('getByUserId', () => {
    it('应该处理空 userId、正常查询和异常分支', async () => {
      await expect(repository.getByUserId('')).resolves.toEqual([]);

      mockStorageAdapter.getAsync.mockResolvedValue([
        TestDataFactory.createTask({ id: 'task_1', userId: 'user_1' }),
        TestDataFactory.createTask({ id: 'task_2', userId: 'user_2' })
      ]);
      await expect(repository.getByUserId('user_1')).resolves.toEqual([
        expect.objectContaining({ id: 'task_1', userId: 'user_1' })
      ]);

      jest.spyOn(repository, 'query').mockRejectedValueOnce(new Error('query fail'));
      await expect(repository.getByUserId('user_1')).resolves.toEqual([]);
    });
  });

  describe('occurrence 查询', () => {
    it('getOccurrenceTasks 应按日期、用户和 includeInactive 过滤', async () => {
      const tasks = [
        new Task({
          ...TestDataFactory.createTask({
            id: 'occ_cfg_active',
            userId: 'child_1',
            executionMode: TaskExecutionMode.OCCURRENCE,
            date: '2026-04-01'
          }),
          isOccurrenceRecord: false,
          activeRange: { startDate: '2026-04-01', endDate: '2026-04-10', hasNoEndDate: false }
        }),
        new Task({
          ...TestDataFactory.createTask({
            id: 'occ_cfg_inactive',
            userId: 'child_1',
            executionMode: TaskExecutionMode.OCCURRENCE,
            date: '2026-04-01'
          }),
          isOccurrenceRecord: false,
          activeRange: { startDate: '2026-04-01', endDate: '2026-04-03', hasNoEndDate: false }
        }),
        new Task({
          ...TestDataFactory.createTask({
            id: 'normal_task',
            userId: 'child_1',
            date: '2026-04-05'
          })
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(tasks);

      await expect(repository.getOccurrenceTasks('')).resolves.toEqual([]);

      const active = await repository.getOccurrenceTasks('2026-04-05', 'child_1');
      const includeInactive = await repository.getOccurrenceTasks('2026-04-05', 'child_1', { includeInactive: true });

      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('occ_cfg_active');
      expect(includeInactive).toHaveLength(2);

      jest.spyOn(repository, 'query').mockRejectedValueOnce(new Error('occ fail'));
      await expect(repository.getOccurrenceTasks('2026-04-05', 'child_1')).resolves.toEqual([]);
    });

    it('getOccurrenceRecord 应只返回匹配的记录实例', async () => {
      const tasks = [
        new Task({
          ...TestDataFactory.createTask({
            id: 'occ_record_1',
            userId: 'child_1',
            parentTaskId: 'parent_1',
            date: '2026-04-05',
            executionMode: TaskExecutionMode.OCCURRENCE
          }),
          isOccurrenceRecord: true,
          occurrenceOutcome: TaskRecordOutcome.SUCCESS
        }),
        new Task({
          ...TestDataFactory.createTask({
            id: 'occ_cfg_1',
            userId: 'child_1',
            parentTaskId: 'parent_1',
            date: '2026-04-05',
            executionMode: TaskExecutionMode.OCCURRENCE
          }),
          isOccurrenceRecord: false
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(tasks);

      await expect(repository.getOccurrenceRecord('', 'child_1', '2026-04-05')).resolves.toBeNull();

      const result = await repository.getOccurrenceRecord('parent_1', 'child_1', '2026-04-05');
      expect(result).toEqual(expect.objectContaining({ id: 'occ_record_1' }));

      jest.spyOn(repository, 'query').mockRejectedValueOnce(new Error('occ record fail'));
      await expect(repository.getOccurrenceRecord('parent_1', 'child_1', '2026-04-05')).resolves.toBeNull();
    });

    it('getOccurrenceRecordsByDateRange 应过滤记录实例、无效参数和异常', async () => {
      const tasks = [
        new Task({
          ...TestDataFactory.createTask({
            id: 'occ_record_1',
            userId: 'child_1',
            parentTaskId: 'parent_1',
            date: '2026-04-03',
            executionMode: TaskExecutionMode.OCCURRENCE
          }),
          isOccurrenceRecord: true
        }),
        new Task({
          ...TestDataFactory.createTask({
            id: 'occ_record_2',
            userId: 'child_2',
            parentTaskId: 'parent_1',
            date: '2026-04-04',
            executionMode: TaskExecutionMode.OCCURRENCE
          }),
          isOccurrenceRecord: true
        }),
        new Task({
          ...TestDataFactory.createTask({
            id: 'occ_cfg_1',
            userId: 'child_1',
            date: '2026-04-05',
            executionMode: TaskExecutionMode.OCCURRENCE
          }),
          isOccurrenceRecord: false
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(tasks);

      await expect(repository.getOccurrenceRecordsByDateRange('', '2026-04-05')).resolves.toEqual([]);

      const result = await repository.getOccurrenceRecordsByDateRange('2026-04-01', '2026-04-04', 'child_1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('occ_record_1');

      jest.spyOn(repository, 'query').mockRejectedValueOnce(new Error('occ range fail'));
      await expect(repository.getOccurrenceRecordsByDateRange('2026-04-01', '2026-04-05', 'child_1')).resolves.toEqual([]);
    });
  });

  describe('排序辅助函数', () => {
    it('_sortTasksByHabitAndTime 应按必做、时间和创建时间排序', () => {
      expect(repository._sortTasksByHabitAndTime(null)).toEqual([]);

      const sorted = repository._sortTasksByHabitAndTime([
        TestDataFactory.createTask({ id: 'normal_with_time', isRequired: false, startTime: '10:00', createTime: 3 }),
        TestDataFactory.createTask({ id: 'required_with_time', isRequired: true, startTime: '09:00', createTime: 4 }),
        TestDataFactory.createTask({ id: 'normal_no_time_old', isRequired: false, startTime: '', createTime: 1 }),
        TestDataFactory.createTask({ id: 'normal_no_time_new', isRequired: false, startTime: '', createTime: 2 }),
        TestDataFactory.createTask({ id: 'required_no_time', isRequired: true, startTime: '', createTime: 5 })
      ]);

      expect(sorted.map(task => task.id)).toEqual([
        'required_no_time',
        'required_with_time',
        'normal_no_time_old',
        'normal_no_time_new',
        'normal_with_time'
      ]);
    });
  });

  // ====== 边界场景 ======
  describe('边界场景', () => {
    it('应该处理空用户ID', async () => {
      const today = formatLocalDate();
      const mockTasks = [
        TestDataFactory.createTask({ date: today, userId: '' })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockTasks);

      const tasks = await repository.getTodayTasks('');

      expect(tasks.length).toBe(1);
    });
  });
});
