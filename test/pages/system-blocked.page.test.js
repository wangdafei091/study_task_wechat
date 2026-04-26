jest.mock('../../utils/app/system-user-access-state', () => ({
  resetBlockedRedirectState: jest.fn()
}));

describe('pages/system-blocked/system-blocked', () => {
  let pageConfig;
  let systemUserAccessState;
  let appMock;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../pages/system-blocked/system-blocked.js');
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
    systemUserAccessState = require('../../utils/app/system-user-access-state');
    appMock = {
      doCloudLogin: jest.fn()
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

  it('加载时应重置禁入跳转状态', () => {
    const page = createPage();

    page.onLoad.call(page);

    expect(systemUserAccessState.resetBlockedRedirectState).toHaveBeenCalled();
  });

  it('重新检查成功后应返回首页', async () => {
    const page = createPage();
    appMock.doCloudLogin.mockResolvedValueOnce(true);

    await page.onRetryTap.call(page);

    expect(appMock.doCloudLogin).toHaveBeenCalled();
    expect(global.wx.reLaunch).toHaveBeenCalledWith({
      url: '/pages/index/index'
    });
  });
});
