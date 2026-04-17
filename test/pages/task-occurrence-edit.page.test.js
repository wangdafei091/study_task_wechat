jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../services/service-manager', () => ({
  getService: jest.fn(),
  getUserService: jest.fn()
}));

jest.mock('../../utils/dateUtils', () => ({
  getTodayString: jest.fn(() => '2026-04-17')
}));

describe('pages/task-occurrence-edit/task-occurrence-edit', () => {
  let pageConfig;
  let serviceManager;
  let taskService;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../pages/task-occurrence-edit/task-occurrence-edit.js');
    });
  }

  function createPageInstance() {
    return {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData: jest.fn(function setData(update) {
        Object.entries(update).forEach(([key, value]) => {
          if (key.includes('.')) {
            const [root, leaf] = key.split('.');
            this.data[root][leaf] = value;
          } else {
            this.data[key] = value;
          }
        });
      })
    };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    serviceManager = require('../../services/service-manager');
    taskService = {
      getOccurrenceTasks: jest.fn().mockResolvedValue([
        {
          id: 'occ_1',
          title: '听写全对',
          type: 'study',
          points: 2,
          date: '2026-04-17',
          activeRange: {
            startDate: '2026-04-17',
            endDate: '',
            hasNoEndDate: true
          }
        }
      ]),
      createTask: jest.fn().mockResolvedValue({ success: true }),
      updateTask: jest.fn().mockResolvedValue({ success: true }),
      disableOccurrenceTask: jest.fn().mockResolvedValue({ success: true }),
      deleteTask: jest.fn().mockResolvedValue({ success: true })
    };
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'task') {
        return taskService;
      }
      return null;
    });

    global.getApp = jest.fn(() => ({
      globalData: {
        lastActiveChildId: 'child_1',
        userService: {
          getLoginUser: jest.fn(() => ({ userId: 'parent_1', role: 'parent' })),
          getCurrentUser: jest.fn(() => ({ userId: 'parent_1', role: 'parent' })),
          getAllUsers: jest.fn(() => [
            { userId: 'parent_1', role: 'parent', name: '家长' },
            { userId: 'child_1', role: 'child', name: '小明' }
          ])
        }
      }
    }));
    global.wx = {
      showToast: jest.fn(),
      showModal: jest.fn(({ success }) => success({ confirm: true })),
      showActionSheet: jest.fn(({ success }) => success({ tapIndex: 0 }))
    };

    loadPageModule();
  });

  afterEach(() => {
    delete global.Page;
    delete global.getApp;
    delete global.wx;
  });

  it('onLoad 应解析目标孩子并加载表现项列表', async () => {
    const page = createPageInstance();

    await page.onLoad.call(page, {});

    expect(page.data.targetUserId).toBe('child_1');
    expect(taskService.getOccurrenceTasks).toHaveBeenCalledWith({
      date: '2026-04-17',
      userId: 'child_1',
      includeInactive: true
    });
    expect(page.data.items[0]).toEqual(expect.objectContaining({
      id: 'occ_1',
      rangeText: '2026-04-17 起长期有效'
    }));
  });

  it('onSaveTap 应在新建和编辑模式下分别调用 create/update', async () => {
    const page = createPageInstance();
    await page.onLoad.call(page, {});

    page.data.draft.title = '考试全对';
    await page.onSaveTap.call(page);
    expect(taskService.createTask).toHaveBeenCalledWith(expect.objectContaining({
      title: '考试全对',
      executionMode: 'occurrence',
      userId: 'child_1'
    }));

    page.data.editingId = 'occ_1';
    page.data.draft.title = '考试全对';
    await page.onSaveTap.call(page);
    expect(taskService.updateTask).toHaveBeenCalledWith('occ_1', expect.objectContaining({
      executionMode: 'occurrence'
    }), 'child_1');
  });

  it('onDisableTap 应调用停用接口并刷新列表', async () => {
    const page = createPageInstance();
    await page.onLoad.call(page, {});
    page.loadItems = jest.fn().mockResolvedValue();

    await page.onDisableTap.call(page, {
      currentTarget: {
        dataset: {
          id: 'occ_1'
        }
      }
    });

    expect(taskService.disableOccurrenceTask).toHaveBeenCalledWith('occ_1', {
      disableFromDate: '2026-04-17'
    }, 'child_1');
    expect(page.loadItems).toHaveBeenCalled();
  });

  it('星星 stepper 与长期有效开关应维护轻表单边界状态', async () => {
    const page = createPageInstance();
    await page.onLoad.call(page, {});

    page.data.draft.points = 1;
    page.onPointsStepTap.call(page, { currentTarget: { dataset: { action: 'minus' } } });
    expect(page.data.draft.points).toBe(1);

    page.onPointsStepTap.call(page, { currentTarget: { dataset: { action: 'plus' } } });
    expect(page.data.draft.points).toBe(2);

    page.onPointsInput.call(page, { detail: { value: '99' } });
    expect(page.data.draft.points).toBe(50);

    page.data.draft.startDate = '2026-04-17';
    page.data.draft.endDate = '';
    page.onToggleNoEndDate.call(page, { detail: { value: false } });
    expect(page.data.draft.endDate).toBe('2026-04-17');

    page.onToggleNoEndDate.call(page, { detail: { value: true } });
    expect(page.data.draft.endDate).toBe('');
  });

  it('表现项真机链路不应再引入 optional chaining 语法', () => {
    const fs = require('fs');
    const path = require('path');
    const files = [
      'pages/task-occurrence-edit/task-occurrence-edit.js',
      'pages/task-record/task-record.js',
      'utils/task-occurrence-context.js',
      'utils/user-context.js'
    ];

    files.forEach((relativePath) => {
      const content = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
      expect(content).not.toContain('?.');
      expect(content).not.toContain('??');
    });
  });

  it('表现项相关根包页面应补齐页面级 json 配置', () => {
    const fs = require('fs');
    const path = require('path');
    [
      'pages/task-occurrence-edit/task-occurrence-edit.json',
      'pages/task-record/task-record.json'
    ].forEach((relativePath) => {
      expect(fs.existsSync(path.join(process.cwd(), relativePath))).toBe(true);
    });
  });
});
