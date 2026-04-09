jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../utils/uiUtils', () => ({
  logUIOptimization: jest.fn(),
  logButtonLayoutOptimization: jest.fn(),
  logStyleConsistency: jest.fn()
}));

jest.mock('../../services/service-manager.js', () => ({
  getUserService: jest.fn(),
  getService: jest.fn()
}));

jest.mock('../../utils/page-storage-helper', () => ({}));
jest.mock('../../utils/permission-utils', () => ({}));

describe('pages/task-edit/task-edit', () => {
  let pageConfig;
  let serviceManager;
  let taskTemplateEntry;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../pages/task-edit/task-edit.js');
    });
  }

  function createPageInstance() {
    return {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      }),
      initHeatmapMonth: jest.fn(),
      initDateTimeData: jest.fn(),
      loadAllTasks: jest.fn(),
      loadRecentTaskTemplates: jest.fn(),
      generateRepeatPreviewText: jest.fn(() => '每天')
    };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    serviceManager = require('../../services/service-manager.js');
    taskTemplateEntry = require('../../pages/task-edit/modules/task-template-entry');

    global.getApp = jest.fn(() => ({
      globalData: {}
    }));
    global.wx = {
      hideLoading: jest.fn(),
      showLoading: jest.fn(),
      showToast: jest.fn(),
      navigateBack: jest.fn(),
      navigateTo: jest.fn()
    };

    loadPageModule();
  });

  afterEach(() => {
    delete global.Page;
    delete global.getApp;
    delete global.wx;
  });

  it('家长切到孩子视角时应拦截进入任务编辑页', () => {
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ userId: 'parent-1', role: 'parent' })),
      getCurrentUser: jest.fn(() => ({ userId: 'child-1', role: 'child' }))
    });

    const page = createPageInstance();
    page.onLoad.call(page, { mode: 'create', targetUserId: 'child-1' });

    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '暂无操作权限',
      icon: 'none'
    }));
    expect(global.wx.navigateBack).toHaveBeenCalledWith({ delta: 1 });
    expect(page.setData).not.toHaveBeenCalledWith(expect.objectContaining({
      targetUserId: 'child-1'
    }));
    expect(page.loadAllTasks).not.toHaveBeenCalled();
  });

  it('onLoad 不应重复触发任务加载，交由 onShow 统一刷新', () => {
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ userId: 'parent-1', role: 'parent' })),
      getCurrentUser: jest.fn(() => ({ userId: 'parent-1', role: 'parent' }))
    });

    const page = createPageInstance();
    page.onLoad.call(page, {});

    expect(page.loadAllTasks).not.toHaveBeenCalled();
    expect(page.data.targetUserId).toBe('');
  });

  it('applyTemplateSelection 应把模板映射到 task-edit 表单状态', () => {
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'taskTemplate') {
        return {
          applyTemplateToTaskForm: jest.fn(() => ({
            formPatch: {
              newTask: {
                title: '晚间阅读',
                repeat: {
                  type: 'daily'
                }
              },
              repeatText: '每天',
              reminderText: '提前15分钟',
              selectedTemplateId: 'tpl_1',
            }
          }))
        };
      }
      return null;
    });

    const page = createPageInstance();
    page.applyTemplateSelection({
      id: 'tpl_1',
      name: '模板A'
    });

    expect(page.setData).toHaveBeenCalledWith(expect.objectContaining({
      newTask: expect.objectContaining({
        title: '晚间阅读'
      }),
      selectedTemplateId: 'tpl_1',
      'errors.title': ''
    }));
  });

  it('_handleTaskCreationSuccess 应在使用模板时回写使用统计', () => {
    const page = createPageInstance();
    page.data.selectedTemplateId = 'tpl_1';
    page.recordSelectedTemplateUsage = jest.fn();
    page.closeAllPanels = jest.fn();
    page.getHeatmapComponent = jest.fn(() => null);

    page._handleTaskCreationSuccess({ task: { id: 'task_1' } }, { title: '任务A' });

    expect(page.recordSelectedTemplateUsage).toHaveBeenCalledWith('tpl_1');
    expect(page.setData).toHaveBeenCalledWith(expect.objectContaining({
      selectedTemplateId: null
    }));
  });

  it('openTemplateSelectPage 应进入模板选择页', () => {
    const page = createPageInstance();

    page.openTemplateSelectPage();

    expect(global.wx.navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: '/packageManage/pages/task-template-manage/task-template-manage?mode=select',
      success: expect.any(Function)
    }));
  });

  it('openTemplateCreatePage 应直接进入模板新建页', () => {
    const page = createPageInstance();

    page.openTemplateCreatePage();

    expect(global.wx.navigateTo).toHaveBeenCalledWith({
      url: '/packageManage/pages/task-template-edit/task-template-edit?mode=create'
    });
  });

  it('loadRecentTaskTemplates 在已选模板被删除后应只清空选中态', async () => {
    const page = createPageInstance();
    page.data.selectedTemplateId = 'tpl_deleted';
    page.data.newTask.title = '已回填任务';

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'taskTemplate') {
        return {
          getRecentTemplates: jest.fn().mockResolvedValue({
            templates: [
              {
                id: 'tpl_2',
                name: '模板B',
                taskPayload: {
                  title: '任务B'
                }
              }
            ]
          })
        };
      }
      return null;
    });

    await pageConfig.loadRecentTaskTemplates.call(page);

    expect(page.setData).toHaveBeenCalledWith(expect.objectContaining({
      recentTemplates: expect.any(Array),
      selectedTemplateId: null
    }));
    expect(page.data.newTask.title).toBe('已回填任务');
  });

  it('重复 showLoading 后单次 hideLoading 应只关闭一次全局 loading', () => {
    const page = createPageInstance();

    page._showLoading({ title: '添加中...' });
    page._showLoading({ title: '创建任务中...' });
    page._hideLoading();
    page._hideLoading();

    expect(global.wx.showLoading).toHaveBeenCalledTimes(2);
    expect(global.wx.hideLoading).toHaveBeenCalledTimes(1);
  });

  it('onUnload 在 loading 已关闭时不应再次调用 wx.hideLoading', () => {
    const page = createPageInstance();

    page._showLoading({ title: '添加中...' });
    page._hideLoading();
    page.onUnload.call(page);

    expect(global.wx.hideLoading).toHaveBeenCalledTimes(1);
  });
});
