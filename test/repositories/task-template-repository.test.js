const TaskTemplateRepository = require('../../repositories/task-template-repository');

describe('TaskTemplateRepository', () => {
  let repository;
  let mockStorageAdapter;

  beforeEach(() => {
    mockStorageAdapter = {
      getAsync: jest.fn().mockResolvedValue([]),
      setAsync: jest.fn().mockResolvedValue(true),
      get: jest.fn(() => []),
      clearCache: jest.fn()
    };

    repository = new TaskTemplateRepository(mockStorageAdapter, {
      useCache: false
    });
  });

  it('getTemplates 应按关键字和类型过滤', async () => {
    mockStorageAdapter.getAsync.mockResolvedValue([
      {
        id: 'tpl_1',
        name: '晚间阅读',
        description: '睡前任务',
        taskPayload: { title: '阅读20分钟', type: 'study' }
      },
      {
        id: 'tpl_2',
        name: '刷牙',
        taskPayload: { title: '睡前刷牙', type: 'habit' }
      }
    ]);

    const templates = await repository.getTemplates({
      keyword: '阅读',
      type: 'study'
    });

    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe('tpl_1');
  });

  it('getRecentTemplates 应只返回启用模板并按最近使用排序', async () => {
    mockStorageAdapter.getAsync.mockResolvedValue([
      {
        id: 'tpl_1',
        name: 'A',
        enabled: false,
        usageCount: 100,
        lastUsedAt: Date.now(),
        taskPayload: { title: 'A', type: 'habit' }
      },
      {
        id: 'tpl_2',
        name: 'B',
        enabled: true,
        usageCount: 2,
        lastUsedAt: 10,
        taskPayload: { title: 'B', type: 'habit' }
      },
      {
        id: 'tpl_3',
        name: 'C',
        enabled: true,
        usageCount: 1,
        lastUsedAt: 20,
        taskPayload: { title: 'C', type: 'habit' }
      }
    ]);

    const templates = await repository.getRecentTemplates(2);

    expect(templates.map((item) => item.id)).toEqual(['tpl_3', 'tpl_2']);
  });

  it('save 和 getById 应保存并返回深拷贝模型', async () => {
    const savedStore = [];

    mockStorageAdapter.getAsync.mockImplementation(async () => savedStore);
    mockStorageAdapter.setAsync.mockImplementation(async (key, value) => {
      savedStore.splice(0, savedStore.length, ...value);
      return true;
    });

    await repository.save({
      id: 'tpl_save_1',
      name: '晨读模板',
      taskPayload: {
        title: '晨读15分钟',
        type: 'study',
        repeat: {
          type: 'custom',
          days: [1, 3]
        }
      }
    });

    const template = await repository.getById('tpl_save_1');
    template.taskPayload.repeat.days.push(5);

    expect(savedStore).toHaveLength(1);
    expect(savedStore[0].id).toBe('tpl_save_1');
    expect(savedStore[0].taskPayload.repeat.days).toEqual([1, 3]);
  });

  it('delete 应移除指定模板', async () => {
    const savedStore = [
      {
        id: 'tpl_keep',
        name: '保留模板',
        taskPayload: { title: '保留', type: 'habit' }
      },
      {
        id: 'tpl_delete',
        name: '删除模板',
        taskPayload: { title: '删除', type: 'habit' }
      }
    ];

    mockStorageAdapter.getAsync.mockImplementation(async () => savedStore);
    mockStorageAdapter.setAsync.mockImplementation(async (key, value) => {
      savedStore.splice(0, savedStore.length, ...value);
      return true;
    });

    const deleted = await repository.delete('tpl_delete');

    expect(deleted).toBe(true);
    expect(savedStore.map((item) => item.id)).toEqual(['tpl_keep']);
  });

  it('replaceAll 应用新模板集合覆盖旧数据', async () => {
    const savedStore = [
      {
        id: 'tpl_old',
        name: '旧模板',
        taskPayload: { title: '旧任务', type: 'habit' }
      }
    ];

    mockStorageAdapter.getAsync.mockImplementation(async () => savedStore);
    mockStorageAdapter.setAsync.mockImplementation(async (key, value) => {
      savedStore.splice(0, savedStore.length, ...value);
      return true;
    });

    const templates = await repository.replaceAll([
      {
        id: 'tpl_new_1',
        name: '新模板1',
        taskPayload: { title: '新任务1', type: 'study' }
      },
      {
        id: 'tpl_new_2',
        name: '新模板2',
        taskPayload: { title: '新任务2', type: 'interest' }
      }
    ]);

    expect(savedStore.map((item) => item.id)).toEqual(['tpl_new_1', 'tpl_new_2']);
    expect(templates.map((item) => item.id)).toEqual(['tpl_new_1', 'tpl_new_2']);
  });

  it('getTemplates 应使用可解析的日期字符串作为 recent 排序兜底', async () => {
    mockStorageAdapter.getAsync.mockResolvedValue([
      {
        id: 'tpl_old',
        name: '旧模板',
        lastUsedAt: null,
        updatedAt: '2026-04-01T10:00:00.000Z',
        taskPayload: { title: '旧任务', type: 'habit' }
      },
      {
        id: 'tpl_new',
        name: '新模板',
        lastUsedAt: null,
        updatedAt: '2026-04-09T08:30:00.000Z',
        taskPayload: { title: '新任务', type: 'habit' }
      }
    ]);

    const templates = await repository.getTemplates({
      sortBy: 'recent'
    });

    expect(templates.map((item) => item.id)).toEqual(['tpl_new', 'tpl_old']);
  });
});
