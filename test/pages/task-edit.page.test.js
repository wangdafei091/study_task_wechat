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
      generateRepeatPreviewText: jest.fn(() => '每天')
    };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    serviceManager = require('../../services/service-manager.js');

    global.getApp = jest.fn(() => ({
      globalData: {}
    }));
    global.wx = {
      showToast: jest.fn(),
      navigateBack: jest.fn()
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
});
