/**
 * base-repository.test.js - BaseRepository 基础仓储测试
 *
 * 测试 BaseRepository 的通用CRUD操作和数据存取方法
 */

const BaseRepository = require('../../repositories/base-repository');
const { Task } = require('../../models/task');

describe('BaseRepository', () => {
  let repository;
  let mockStorageAdapter;

  beforeEach(() => {
    // Mock StorageAdapter
    mockStorageAdapter = {
      getAsync: jest.fn().mockResolvedValue([]),
      setAsync: jest.fn().mockResolvedValue(true),
      get: jest.fn().mockReturnValue([]),
      set: jest.fn().mockReturnValue(true),
      exists: jest.fn().mockResolvedValue(true),
      clearCache: jest.fn(),
      namespace: 'test'
    };

    // 创建 BaseRepository 实例
    repository = new BaseRepository('test_tasks', Task, {
      storageAdapter: mockStorageAdapter,
      namespace: 'test',
      useCache: true,
      cacheExpiry: 60000,
      cacheTTL: 1000
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('构造函数', () => {
    it('应该正确初始化仓储', () => {
      expect(repository.storageKey).toBe('test_tasks');
      expect(repository.modelClass).toBe(Task);
      expect(repository._cache).toBeNull();
      expect(repository._cacheTime).toBe(0);
      expect(repository._cacheTTL).toBe(1000);
    });

    it('应该创建存储适配器', () => {
      expect(repository.storageAdapter).toBeDefined();
      expect(repository.storageAdapter.namespace).toBe('test');
    });

    it('空存储键应该抛出错误', () => {
      expect(() => new BaseRepository('', Task)).toThrow('存储键名不能为空');
    });

    it('空模型类应该抛出错误', () => {
      expect(() => new BaseRepository('test_key', null)).toThrow('模型类不能为空且必须是构造函数');
    });

    it('非函数的模型类应该抛出错误', () => {
      expect(() => new BaseRepository('test_key', {})).toThrow('模型类不能为空且必须是构造函数');
    });
  });

  describe('loadFromStorage', () => {
    it('应该成功从存储加载数据', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([
        { id: 'task_1', title: '任务1' },
        { id: 'task_2', title: '任务2' }
      ]);

      const result = await repository.loadFromStorage();
      expect(result).toBe(true);
      expect(mockStorageAdapter.getAsync).toHaveBeenCalledWith('test_tasks', []);
    });

    it('加载失败时应该返回false', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('加载失败'));

      const result = await repository.loadFromStorage();
      expect(result).toBe(false);
    });
  });

  describe('getAll', () => {
    it('应该获取所有实体', async () => {
      const mockData = [
        { id: 'task_1', title: '任务1' },
        { id: 'task_2', title: '任务2' }
      ];
      mockStorageAdapter.getAsync.mockResolvedValue(mockData);

      const result = await repository.getAll();
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Task);
      expect(result[1]).toBeInstanceOf(Task);
      expect(mockStorageAdapter.getAsync).toHaveBeenCalledWith('test_tasks', []);
    });

    it('应该使用缓存', async () => {
      const mockData = [{ id: 'task_1', title: '任务1' }];
      mockStorageAdapter.getAsync.mockResolvedValue(mockData);

      // 第一次调用，从存储获取
      const result1 = await repository.getAll();
      expect(result1).toHaveLength(1);
      expect(mockStorageAdapter.getAsync).toHaveBeenCalledTimes(1);

      // 等待一段时间以确保缓存未过期
      await new Promise(resolve => setTimeout(resolve, 1));

      // 第二次调用，使用缓存
      const result2 = await repository.getAll();
      expect(result2).toHaveLength(1);
      expect(mockStorageAdapter.getAsync).toHaveBeenCalledTimes(1);
    });

    it('不使用缓存应该重新从存储获取', async () => {
      const mockData = [{ id: 'task_1', title: '任务1' }];
      mockStorageAdapter.getAsync.mockResolvedValue(mockData);

      await repository.getAll(); // 第一次调用
      const result = await repository.getAll(false); // 不使用缓存

      expect(mockStorageAdapter.getAsync).toHaveBeenCalledTimes(2);
    });

    it('获取失败时应该返回空数组', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('获取失败'));

      const result = await repository.getAll();
      expect(result).toEqual([]);
    });

    it('空数据应该返回空数组', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const result = await repository.getAll();
      expect(result).toEqual([]);
    });
  });

  describe('getAllSync', () => {
    it('应该同步获取所有实体', () => {
      const mockData = [
        { id: 'task_1', title: '任务1' },
        { id: 'task_2', title: '任务2' }
      ];
      mockStorageAdapter.get.mockReturnValue(mockData);

      const result = repository.getAllSync();
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Task);
      expect(result[1]).toBeInstanceOf(Task);
      expect(mockStorageAdapter.get).toHaveBeenCalledWith('test_tasks', []);
    });

    it('应该使用缓存', () => {
      const mockData = [{ id: 'task_1', title: '任务1' }];
      mockStorageAdapter.get.mockReturnValue(mockData);

      repository.getAllSync(); // 第一次调用
      const result = repository.getAllSync(); // 第二次调用

      expect(result).toHaveLength(1);
      expect(mockStorageAdapter.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('getById', () => {
    it('应该根据ID获取实体', async () => {
      const mockData = [
        { id: 'task_1', title: '任务1' },
        { id: 'task_2', title: '任务2' }
      ];
      mockStorageAdapter.getAsync.mockResolvedValue(mockData);

      const result = await repository.getById('task_2');
      expect(result).toBeInstanceOf(Task);
      expect(result.id).toBe('task_2');
    });

    it('未找到实体时应该返回null', async () => {
      const mockData = [{ id: 'task_1', title: '任务1' }];
      mockStorageAdapter.getAsync.mockResolvedValue(mockData);

      const result = await repository.getById('task_999');
      expect(result).toBeNull();
    });

    it('空ID时应该返回null', async () => {
      const result = await repository.getById('');
      expect(result).toBeNull();
    });

    it('null ID时应该返回null', async () => {
      const result = await repository.getById(null);
      expect(result).toBeNull();
    });

    it('获取失败时应该返回null', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('获取失败'));

      const result = await repository.getById('task_1');
      expect(result).toBeNull();
    });
  });

  describe('query', () => {
    it('应该根据谓词查询实体', async () => {
      const mockData = [
        { id: 'task_1', title: '数学作业', type: 'study' },
        { id: 'task_2', title: '体育训练', type: 'habit' },
        { id: 'task_3', title: '英语阅读', type: 'study' }
      ];
      mockStorageAdapter.getAsync.mockResolvedValue(mockData);

      const result = await repository.query(task => task.type === 'study');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('task_1');
      expect(result[1].id).toBe('task_3');
    });

    it('查询结果为空时应该返回空数组', async () => {
      const mockData = [{ id: 'task_1', title: '任务1' }];
      mockStorageAdapter.getAsync.mockResolvedValue(mockData);

      const result = await repository.query(task => task.title === '不存在');
      expect(result).toEqual([]);
    });

    it('无效的谓词应该返回空数组', async () => {
      const mockData = [{ id: 'task_1', title: '任务1' }];
      mockStorageAdapter.getAsync.mockResolvedValue(mockData);

      const result = await repository.query(null);
      expect(result).toEqual([]);
    });

    it('查询失败时应该返回空数组', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('查询失败'));

      const result = await repository.query(task => task.id === 'task_1');
      expect(result).toEqual([]);
    });
  });

  describe('save', () => {
    it('应该保存新实体', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);
      mockStorageAdapter.setAsync.mockResolvedValue(true);

      const task = new Task({ id: 'task_1', title: '新任务' });
      const result = await repository.save(task);

      expect(result).toBeInstanceOf(Task);
      expect(result.id).toBe('task_1');
      expect(mockStorageAdapter.setAsync).toHaveBeenCalledWith('test_tasks', expect.any(Array));
    });

    it('应该更新已存在的实体', async () => {
      const mockData = [{ id: 'task_1', title: '旧标题' }];
      mockStorageAdapter.getAsync.mockResolvedValue(mockData);
      mockStorageAdapter.setAsync.mockResolvedValue(true);

      const task = new Task({ id: 'task_1', title: '新标题' });
      const result = await repository.save(task);

      expect(result.title).toBe('新标题');
      expect(mockStorageAdapter.setAsync).toHaveBeenCalledWith('test_tasks', expect.any(Array));
    });

    it('空实体应该返回null', async () => {
      const result = await repository.save(null);
      expect(result).toBeNull();
    });

    it('undefined实体应该返回null', async () => {
      const result = await repository.save(undefined);
      expect(result).toBeNull();
    });

    it('保存失败时应该仍返回克隆的实体', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);
      mockStorageAdapter.setAsync.mockRejectedValue(new Error('保存失败'));

      const task = new Task({ id: 'task_1', title: '任务' });
      const result = await repository.save(task);

      // 存储失败但不阻止返回克隆的实体，只记录错误
      expect(result).not.toBeNull();
      expect(result.id).toBe('task_1');
    });
  });

  describe('saveAll', () => {
    it('应该批量保存实体', async () => {
      const mockData = [];
      mockStorageAdapter.getAsync.mockResolvedValue(mockData);
      mockStorageAdapter.setAsync.mockResolvedValue(true);

      const entities = [
        new Task({ id: 'task_1', title: '任务1' }),
        new Task({ id: 'task_2', title: '任务2' })
      ];

      const result = await repository.saveAll(entities);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('task_1');
      expect(result[1].id).toBe('task_2');
      expect(mockStorageAdapter.setAsync).toHaveBeenCalledWith('test_tasks', expect.any(Array));
    });

    it('应该更新已存在的实体', async () => {
      const mockData = [{ id: 'task_1', title: '旧标题' }];
      mockStorageAdapter.getAsync.mockResolvedValue(mockData);
      mockStorageAdapter.setAsync.mockResolvedValue(true);

      const entities = [
        new Task({ id: 'task_1', title: '新标题' })
      ];

      const result = await repository.saveAll(entities);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('新标题');
    });

    it('空数组应该返回空数组', async () => {
      const result = await repository.saveAll([]);
      expect(result).toEqual([]);
      expect(mockStorageAdapter.setAsync).not.toHaveBeenCalled();
    });

    it('非数组应该返回空数组', async () => {
      const result = await repository.saveAll('not an array');
      expect(result).toEqual([]);
    });

    it('过滤无效实体', async () => {
      const mockData = [];
      mockStorageAdapter.getAsync.mockResolvedValue(mockData);
      mockStorageAdapter.setAsync.mockResolvedValue(true);

      const entities = [
        new Task({ id: 'task_1', title: '任务1' }),
        null,
        new Task({ id: 'task_2', title: '任务2' }),
        undefined
      ];

      const result = await repository.saveAll(entities);

      expect(result).toHaveLength(2);
    });

    it('保存失败时应该仍返回克隆的实体数组', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);
      mockStorageAdapter.setAsync.mockRejectedValue(new Error('保存失败'));

      const entities = [new Task({ id: 'task_1', title: '任务' })];

      const result = await repository.saveAll(entities);

      // 存储失败但不阻止返回克隆的实体，只记录错误
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('task_1');
    });
  });

  describe('delete', () => {
    it('应该删除实体', async () => {
      const mockData = [
        { id: 'task_1', title: '任务1' },
        { id: 'task_2', title: '任务2' }
      ];
      mockStorageAdapter.getAsync.mockResolvedValue(mockData);
      mockStorageAdapter.setAsync.mockResolvedValue(true);

      const result = await repository.delete('task_1');

      expect(result).toBe(true);
      expect(mockStorageAdapter.setAsync).toHaveBeenCalledWith('test_tasks', expect.any(Array));
    });

    it('删除不存在的实体应该返回false', async () => {
      const mockData = [{ id: 'task_1', title: '任务1' }];
      mockStorageAdapter.getAsync.mockResolvedValue(mockData);

      const result = await repository.delete('task_999');

      expect(result).toBe(false);
      expect(mockStorageAdapter.setAsync).not.toHaveBeenCalled();
    });

    it('空ID应该返回false', async () => {
      const result = await repository.delete('');
      expect(result).toBe(false);
    });

    it('null ID应该返回false', async () => {
      const result = await repository.delete(null);
      expect(result).toBe(false);
    });

    it('删除失败时应该返回false', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('删除失败'));

      const result = await repository.delete('task_1');

      expect(result).toBe(false);
    });
  });

  describe('deleteMany', () => {
    it('应该根据ID数组批量删除', async () => {
      const mockData = [
        { id: 'task_1', title: '任务1' },
        { id: 'task_2', title: '任务2' },
        { id: 'task_3', title: '任务3' }
      ];
      mockStorageAdapter.getAsync.mockResolvedValue(mockData);
      mockStorageAdapter.setAsync.mockResolvedValue(true);

      const result = await repository.deleteMany(['task_1', 'task_3']);

      expect(result).toBe(2);
      expect(mockStorageAdapter.setAsync).toHaveBeenCalledWith('test_tasks', expect.any(Array));
    });

    it('应该根据谓词批量删除', async () => {
      const mockData = [
        { id: 'task_1', title: '任务1', type: 'study' },
        { id: 'task_2', title: '任务2', type: 'habit' },
        { id: 'task_3', title: '任务3', type: 'study' }
      ];
      mockStorageAdapter.getAsync.mockResolvedValue(mockData);
      mockStorageAdapter.setAsync.mockResolvedValue(true);

      const result = await repository.deleteMany(task => task.type === 'study');

      expect(result).toBe(2);
    });

    it('空ID数组应该返回0', async () => {
      const result = await repository.deleteMany([]);
      expect(result).toBe(0);
    });

    it('null参数应该返回0', async () => {
      const result = await repository.deleteMany(null);
      expect(result).toBe(0);
    });

    it('没有匹配项时应该返回0', async () => {
      const mockData = [{ id: 'task_1', title: '任务1' }];
      mockStorageAdapter.getAsync.mockResolvedValue(mockData);

      const result = await repository.deleteMany(['task_999']);

      expect(result).toBe(0);
    });
  });

  describe('clear', () => {
    it('应该清空所有实体', async () => {
      mockStorageAdapter.setAsync.mockResolvedValue(true);

      const result = await repository.clear();

      expect(result).toBe(true);
      expect(mockStorageAdapter.setAsync).toHaveBeenCalledWith('test_tasks', []);
    });

    it('清空失败时应该仍返回true（内存已清空）', async () => {
      mockStorageAdapter.setAsync.mockRejectedValue(new Error('清空失败'));

      const result = await repository.clear();

      // 存储失败但内存缓存已清空，仍返回true
      expect(result).toBe(true);
    });
  });

  describe('count', () => {
    it('应该计算所有实体数量', async () => {
      const mockData = [
        { id: 'task_1', title: '任务1' },
        { id: 'task_2', title: '任务2' },
        { id: 'task_3', title: '任务3' }
      ];
      mockStorageAdapter.getAsync.mockResolvedValue(mockData);

      const result = await repository.count();

      expect(result).toBe(3);
    });

    it('应该根据谓词计算实体数量', async () => {
      const mockData = [
        { id: 'task_1', title: '任务1', type: 'study' },
        { id: 'task_2', title: '任务2', type: 'habit' },
        { id: 'task_3', title: '任务3', type: 'study' }
      ];
      mockStorageAdapter.getAsync.mockResolvedValue(mockData);

      const result = await repository.count(task => task.type === 'study');

      expect(result).toBe(2);
    });

    it('空数据应该返回0', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const result = await repository.count();

      expect(result).toBe(0);
    });

    it('计算失败时应该返回0', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('计算失败'));

      const result = await repository.count();

      expect(result).toBe(0);
    });
  });

  describe('exists', () => {
    it('应该检查仓储是否存在', async () => {
      mockStorageAdapter.exists.mockResolvedValue(true);

      const result = await repository.exists();

      expect(result).toBe(true);
      expect(mockStorageAdapter.exists).toHaveBeenCalledWith('test_tasks');
    });

    it('仓储不存在时应该返回false', async () => {
      mockStorageAdapter.exists.mockResolvedValue(false);

      const result = await repository.exists();

      expect(result).toBe(false);
    });

    it('检查失败时应该返回false', async () => {
      mockStorageAdapter.exists.mockRejectedValue(new Error('检查失败'));

      const result = await repository.exists();

      expect(result).toBe(false);
    });
  });

  describe('transaction', () => {
    it('应该执行事务操作', async () => {
      const mockData = [
        { id: 'task_1', title: '任务1' },
        { id: 'task_2', title: '任务2' }
      ];
      mockStorageAdapter.getAsync.mockResolvedValue(mockData);
      mockStorageAdapter.setAsync.mockResolvedValue(true);

      const result = await repository.transaction(entities => {
        entities.push({ id: 'task_3', title: '任务3' });
        return entities.length;
      });

      expect(result).toBe(3);
      expect(mockStorageAdapter.setAsync).toHaveBeenCalledWith('test_tasks', expect.any(Array));
    });

    it('事务函数无效时应该返回null', async () => {
      const result = await repository.transaction(null);
      expect(result).toBeNull();
    });

    it('事务执行失败时应该抛出错误', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      await expect(repository.transaction(() => {
        throw new Error('事务错误');
      })).rejects.toThrow('事务错误');
    });
  });

  describe('invalidateCache', () => {
    it('应该清除缓存', () => {
      repository._cache = [1, 2, 3];
      repository._cacheTime = Date.now();

      repository.invalidateCache();

      expect(repository._cache).toBeNull();
      expect(repository._cacheTime).toBe(0);
    });

  });

  describe('clearCache', () => {
    it('应该是invalidateCache的别名', () => {
      repository._cache = [1, 2, 3];
      repository._cacheTime = Date.now();

      repository.clearCache();

      expect(repository._cache).toBeNull();
      expect(repository._cacheTime).toBe(0);
    });
  });


  describe('边界条件', () => {
    it('应该处理非数组的数据', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue('not an array');

      const result = await repository.getAll();
      expect(result).toEqual([]);
    });

    it('应该处理null的数据', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue(null);

      const result = await repository.getAll();
      expect(result).toEqual([]);
    });

    it('应该处理undefined的数据', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue(undefined);

      const result = await repository.getAll();
      expect(result).toEqual([]);
    });
  });
});
