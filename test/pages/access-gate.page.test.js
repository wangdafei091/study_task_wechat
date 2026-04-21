jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../utils/app/app-access-state', () => ({
  APP_ACCESS_ERROR_CODE: {
    REQUIRED: 'AUTH_APP_ACCESS_CODE_REQUIRED',
    INVALID: 'AUTH_APP_ACCESS_CODE_INVALID',
    EXPIRED: 'AUTH_APP_ACCESS_CODE_EXPIRED'
  },
  loadPendingAppAccessCode: jest.fn(() => 'ABC123'),
  savePendingAppAccessCode: jest.fn((value) => value),
  normalizeAppAccessCode: jest.fn((value) => String(value || '').trim().toUpperCase()),
  isAppAccessError: jest.fn((error) => /^AUTH_APP_ACCESS_CODE_/.test(error.code || '')),
  getAppAccessErrorMessage: jest.fn((input) => {
    const code = typeof input === 'string' ? input : input.code;
    if (code === 'AUTH_APP_ACCESS_CODE_INVALID') {
      return '邀请码无效，请检查后重试';
    }
    if (code === 'AUTH_APP_ACCESS_CODE_EXPIRED') {
      return '邀请码已过期，请联系维护者重新获取';
    }
    return '当前为邀请制体验，请先输入邀请码';
  })
}));

describe('pages/access-gate/access-gate', () => {
  let pageConfig;
  let appMock;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../pages/access-gate/access-gate.js');
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

  it('onLoad 应加载本地邀请码并展示初始错误文案', () => {
    const page = createPage();
    page.onLoad.call(page, {
      reason: 'AUTH_APP_ACCESS_CODE_EXPIRED'
    });

    expect(page.data.accessCode).toBe('ABC123');
    expect(page.data.errorMessage).toBe('邀请码已过期，请联系维护者重新获取');
  });

  it('提交成功后应回到首页，失败时展示内联错误', async () => {
    const page = createPage();
    page.onLoad.call(page, {});
    page.onInput.call(page, {
      detail: {
        value: ' invite88 '
      }
    });

    appMock.doCloudLogin.mockResolvedValueOnce(true);
    await page.onSubmit.call(page);

    expect(appMock.doCloudLogin).toHaveBeenCalledWith({
      throwOnAdmissionError: true
    });
    expect(global.wx.reLaunch).toHaveBeenCalledWith({
      url: '/pages/index/index'
    });

    appMock.doCloudLogin.mockRejectedValueOnce(Object.assign(new Error('invalid'), {
      code: 'AUTH_APP_ACCESS_CODE_INVALID'
    }));
    await page.onSubmit.call(page);
    expect(page.data.errorMessage).toBe('邀请码无效，请检查后重试');
  });
});
