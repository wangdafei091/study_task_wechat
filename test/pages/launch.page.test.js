jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

describe('pages/launch/launch', () => {
  let pageConfig;
  let appMock;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../pages/launch/launch.js');
    });
  }

  function createPage() {
    return {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
    };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    appMock = {
      waitForStartupDecision: jest.fn().mockResolvedValue('/pages/access-gate/access-gate?reason=AUTH_APP_ACCESS_CODE_REQUIRED')
    };

    global.getApp = jest.fn(() => appMock);
    global.wx = {
      reLaunch: jest.fn()
    };

    loadPageModule();
  });

  afterEach(() => {
    delete global.Page;
    delete global.getApp;
    delete global.wx;
  });

  it('应等待启动决策后跳转到目标页', async () => {
    const page = createPage();

    page.onLoad.call(page, {
      inviteCode: 'u123'
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(appMock.waitForStartupDecision).toHaveBeenCalledWith({
      inviteCode: 'u123',
      source: 'launch'
    });
    expect(global.wx.reLaunch).toHaveBeenCalledWith({
      url: '/pages/access-gate/access-gate?reason=AUTH_APP_ACCESS_CODE_REQUIRED'
    });
  });

  it('缺少启动决策能力时应回退到首页', async () => {
    const page = createPage();
    global.getApp = jest.fn(() => ({}));

    page.onLoad.call(page, {});
    await Promise.resolve();
    await Promise.resolve();

    expect(global.wx.reLaunch).toHaveBeenCalledWith({
      url: '/pages/index/index'
    });
  });
});
