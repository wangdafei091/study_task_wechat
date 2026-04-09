const fs = require('fs');
const path = require('path');

jest.mock('../../services/service-manager', () => ({
  getService: jest.fn(),
  getUserService: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../utils/view-scope', () => ({
  isChildView: jest.fn(() => false)
}));

describe('packageManage/pages/task-template-manage/task-template-manage', () => {
  let pageConfig;
  let serviceManager;
  let viewScope;

  function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((nextResolve, nextReject) => {
      resolve = nextResolve;
      reject = nextReject;
    });

    return { promise, resolve, reject };
  }

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../packageManage/pages/task-template-manage/task-template-manage.js');
    });
  }

  function createPageInstance() {
    return {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      }),
      getOpenerEventChannel: jest.fn(() => ({
        emit: jest.fn()
      }))
    };
  }

  function createTemplate(overrides = {}) {
    return {
      id: 'tpl_1',
      name: '晚间阅读',
      description: '固定晚间任务',
      enabled: true,
      usageCount: 3,
      lastUsedAt: 1712500000000,
      updatedAt: 1712600000000,
      createdAt: 1712400000000,
      taskPayload: {
        title: '阅读20分钟',
        type: 'study',
        isAllDay: false,
        startDate: '2026-04-08',
        endDate: '2026-04-14',
        startTime: '19:00',
        endTime: '19:30',
        repeat: { type: 'daily' },
        reminder: { enabled: true, time: 15 }
      },
      dateStrategy: {
        mode: 'inherit-repeat-rule',
        durationDays: 7
      },
      ...overrides
    };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    serviceManager = require('../../services/service-manager');
    viewScope = require('../../utils/view-scope');
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ role: 'parent' })),
      getCurrentUser: jest.fn(() => ({ role: 'parent' }))
    });
    viewScope.isChildView.mockReturnValue(false);

    global.wx = {
      showToast: jest.fn(),
      navigateBack: jest.fn(),
      navigateTo: jest.fn(),
      redirectTo: jest.fn(),
      setNavigationBarTitle: jest.fn(),
      stopPullDownRefresh: jest.fn(),
      showModal: jest.fn(),
      showActionSheet: jest.fn()
    };

    loadPageModule();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.Page;
    delete global.wx;
  });

  it('onLoad(select) 应固定导航标题为任务模板并激活选择模板 tab', () => {
    const page = createPageInstance();

    page.onLoad.call(page, { mode: 'select' });

    expect(page.data.activeTab).toBe('select');
    expect(global.wx.setNavigationBarTitle).toHaveBeenCalledWith({
      title: '任务模板'
    });
  });

  it('onLoad(manage) 应激活管理模板 tab', () => {
    const page = createPageInstance();

    page.onLoad.call(page, { mode: 'manage' });

    expect(page.data.activeTab).toBe('manage');
    expect(global.wx.setNavigationBarTitle).toHaveBeenCalledWith({
      title: '任务模板'
    });
  });

  it('loadTemplates 在选择模板 tab 应请求全量模板并装饰展示字段', async () => {
    const getTemplates = jest.fn().mockResolvedValue({
      templates: [createTemplate()]
    });
    serviceManager.getService.mockReturnValue({
      getTemplates
    });

    const page = createPageInstance();
    page.data.activeTab = 'select';

    await page.loadTemplates();

    expect(getTemplates).toHaveBeenCalledWith(expect.objectContaining({
      status: 'all',
      sortBy: 'recent',
      type: 'all'
    }));
    expect(page.data.templates[0]).toEqual(expect.objectContaining({
      displayName: '晚间阅读',
      typeLabel: '学习',
      repeatLabel: '每天',
      reminderLabel: '提前15分钟',
      validityLabel: '持续7天'
    }));
  });

  it('loadTemplates 在选择模板 tab 应过滤掉停用模板', async () => {
    serviceManager.getService.mockReturnValue({
      getTemplates: jest.fn().mockResolvedValue({
        templates: [
          createTemplate({ id: 'tpl_enabled', enabled: true }),
          createTemplate({ id: 'tpl_disabled', enabled: false })
        ]
      })
    });

    const page = createPageInstance();
    page.data.activeTab = 'select';

    await page.loadTemplates();

    expect(page.data.templates.map((item) => item.id)).toEqual(['tpl_enabled']);
    expect(page.data.hasTemplates).toBe(true);
  });

  it('loadTemplates 在管理模板 tab 应保留停用模板', async () => {
    serviceManager.getService.mockReturnValue({
      getTemplates: jest.fn().mockResolvedValue({
        templates: [
          createTemplate({ id: 'tpl_enabled', enabled: true }),
          createTemplate({ id: 'tpl_disabled', enabled: false })
        ]
      })
    });

    const page = createPageInstance();
    page.data.activeTab = 'manage';

    await page.loadTemplates();

    expect(page.data.templates.map((item) => item.id)).toEqual(['tpl_enabled', 'tpl_disabled']);
  });

  it('loadTemplates 在选择模板 tab 全部停用时应保留 hasAnyTemplates 用于空态区分', async () => {
    const getTemplates = jest.fn().mockResolvedValue({
      templates: [
        createTemplate({ id: 'tpl_disabled', enabled: false })
      ]
    });
    serviceManager.getService.mockReturnValue({
      getTemplates
    });

    const page = createPageInstance();
    page.data.activeTab = 'select';

    await page.loadTemplates();

    expect(getTemplates).toHaveBeenCalledWith(expect.objectContaining({
      status: 'all'
    }));
    expect(page.data.hasAnyTemplates).toBe(true);
    expect(page.data.hasTemplates).toBe(false);
  });

  it('loadTemplates 应忽略过期请求回写，避免旧结果覆盖当前 tab', async () => {
    const firstRequest = createDeferred();
    const secondRequest = createDeferred();
    const getTemplates = jest.fn()
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);
    serviceManager.getService.mockReturnValue({
      getTemplates
    });

    const page = createPageInstance();
    page.data.activeTab = 'select';

    const staleLoad = page.loadTemplates();
    page.data.activeTab = 'manage';
    const currentLoad = page.loadTemplates();

    secondRequest.resolve({
      templates: [createTemplate({ id: 'tpl_manage', enabled: false })]
    });
    await currentLoad;

    firstRequest.resolve({
      templates: [createTemplate({ id: 'tpl_select', enabled: true })]
    });
    await staleLoad;

    expect(page.data.activeTab).toBe('manage');
    expect(page.data.templates.map((item) => item.id)).toEqual(['tpl_manage']);
    expect(page.data.hasTemplates).toBe(true);
    expect(page.data.hasAnyTemplates).toBe(true);
    expect(page.data.loading).toBe(false);
  });

  it('loadTemplates 失败时应保留当前列表并标记 loadFailed', async () => {
    serviceManager.getService.mockReturnValue({
      getTemplates: jest.fn().mockRejectedValue(new Error('network'))
    });

    const page = createPageInstance();
    page.data.templates = [createTemplate({ id: 'tpl_1' })];
    page.data.hasTemplates = true;
    page.data.hasAnyTemplates = true;

    await page.loadTemplates();

    expect(page.data.templates).toHaveLength(1);
    expect(page.data.hasTemplates).toBe(true);
    expect(page.data.loadFailed).toBe(true);
  });

  it('selectTypeFilter 再次点击当前分类应取消筛选', () => {
    const page = createPageInstance();
    page.loadTemplates = jest.fn();

    page.selectTypeFilter({
      currentTarget: {
        dataset: {
          type: 'study'
        }
      }
    });
    expect(page.data.typeFilter).toBe('study');

    page.selectTypeFilter({
      currentTarget: {
        dataset: {
          type: 'study'
        }
      }
    });
    expect(page.data.typeFilter).toBe('');
    expect(page.loadTemplates).toHaveBeenCalledTimes(2);
  });

  it('switchTab 应切换 tab 并重置搜索与分类筛选', () => {
    const page = createPageInstance();
    page.loadTemplates = jest.fn();
    page.data.activeTab = 'select';
    page.data.keyword = '阅读';
    page.data.typeFilter = 'study';

    page.switchTab({
      currentTarget: {
        dataset: {
          tab: 'manage'
        }
      }
    });

    expect(page.data.activeTab).toBe('manage');
    expect(page.data.keyword).toBe('');
    expect(page.data.typeFilter).toBe('');
    expect(page.loadTemplates).toHaveBeenCalledTimes(1);
  });

  it('switchTab 应取消挂起的搜索防抖，避免重复加载', () => {
    const page = createPageInstance();
    page.loadTemplates = jest.fn();

    page.onKeywordInput({
      detail: {
        value: '阅读'
      }
    });

    page.switchTab({
      currentTarget: {
        dataset: {
          tab: 'manage'
        }
      }
    });

    jest.advanceTimersByTime(250);

    expect(page.loadTemplates).toHaveBeenCalledTimes(1);
  });

  it('onTapTemplateCard 在选择模板 tab 应通过 eventChannel 传回 opener', () => {
    const emit = jest.fn();
    const page = createPageInstance();
    page.data.activeTab = 'select';
    page.data.templates = [createTemplate({ id: 'tpl_1', name: '模板A' })];
    page.getOpenerEventChannel.mockReturnValue({ emit });

    page.onTapTemplateCard({
      currentTarget: {
        dataset: {
          id: 'tpl_1'
        }
      }
    });

    expect(emit).toHaveBeenCalledWith('templateSelected', {
      template: expect.objectContaining({ id: 'tpl_1', name: '模板A' })
    });
    expect(global.wx.navigateBack).toHaveBeenCalledWith({ delta: 1 });
  });

  it('onTapTemplateCard 在管理模板 tab 应进入编辑页', () => {
    const page = createPageInstance();
    page.data.activeTab = 'manage';
    page.data.templates = [createTemplate({ id: 'tpl_1' })];

    page.onTapTemplateCard({
      currentTarget: {
        dataset: {
          id: 'tpl_1'
        }
      }
    });

    expect(global.wx.navigateTo).toHaveBeenCalledWith({
      url: '/packageManage/pages/task-template-edit/task-template-edit?mode=edit&templateId=tpl_1'
    });
  });

  it('onOpenTemplateActions 应通过 action sheet 执行启停操作', async () => {
    const setTemplateEnabled = jest.fn().mockResolvedValue({});
    serviceManager.getService.mockReturnValue({
      setTemplateEnabled,
      getTemplates: jest.fn().mockResolvedValue({ templates: [] })
    });
    global.wx.showActionSheet.mockImplementation(({ success }) => {
      success({ tapIndex: 0 });
    });

    const page = createPageInstance();
    page.loadTemplates = jest.fn().mockResolvedValue();
    page.data.templates = [createTemplate({ id: 'tpl_1', enabled: true })];

    await page.onOpenTemplateActions({
      currentTarget: {
        dataset: {
          id: 'tpl_1'
        }
      }
    });

    expect(global.wx.showActionSheet).toHaveBeenCalledWith(expect.objectContaining({
      itemList: ['停用模板', '删除模板']
    }));
    expect(setTemplateEnabled).toHaveBeenCalledWith('tpl_1', false);
  });

  it('onKeywordInput 应做防抖后再触发加载', () => {
    const page = createPageInstance();
    page.loadTemplates = jest.fn();

    page.onKeywordInput({
      detail: {
        value: '阅'
      }
    });
    page.onKeywordInput({
      detail: {
        value: '阅读'
      }
    });

    expect(page.loadTemplates).not.toHaveBeenCalled();

    jest.advanceTimersByTime(250);

    expect(page.loadTemplates).toHaveBeenCalledTimes(1);
  });

  it('clearKeyword 应取消未触发的旧搜索防抖，只立即加载一次', () => {
    const page = createPageInstance();
    page.loadTemplates = jest.fn();

    page.onKeywordInput({
      detail: {
        value: '阅读'
      }
    });

    page.clearKeyword();
    jest.advanceTimersByTime(250);

    expect(page.loadTemplates).toHaveBeenCalledTimes(1);
    expect(page.data.keyword).toBe('');
  });

  it('wxml 应使用页内双 tab，且不再使用 pageTitle 卡片标题和旧状态排序筛选', () => {
    const wxml = fs.readFileSync(
      path.join(__dirname, '../../packageManage/pages/task-template-manage/task-template-manage.wxml'),
      'utf8'
    );

    expect(wxml).toContain('data-tab="select"');
    expect(wxml).toContain('data-tab="manage"');
    expect(wxml).toContain('点击模板即可回填到任务表单');
    expect(wxml).toContain('当前没有可用模板');
    expect(wxml).toContain('去管理模板');
    expect(wxml).toContain('重新加载');
    expect(wxml).not.toContain('title="{{pageTitle}}"');
    expect(wxml).not.toContain('全部状态');
    expect(wxml).not.toContain('最近使用</view>');
    expect(wxml).not.toContain('使用次数</view>');
  });
});
