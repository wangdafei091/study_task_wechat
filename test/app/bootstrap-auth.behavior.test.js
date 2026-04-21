describe('utils/app/bootstrap-auth', () => {
  function loadModule({
    enableApi = true,
    token = null,
    authenticated = false,
    cachedUserInfo = null,
    loginResult = { token: 'token-1', user: { id: 'user-1' } },
    loginCode = 'wx-code',
    pendingAccessCode = '',
    currentRoute = 'pages/index/index'
  } = {}) {
    jest.resetModules();

    const setUserServiceMock = jest.fn();
    const initializeMock = jest.fn().mockResolvedValue(true);
    const setTokenMock = jest.fn();
    const clearTokenMock = jest.fn();
    const httpPostMock = jest.fn().mockResolvedValue(loginResult);

    global.wx = {
      getStorageSync: jest.fn((key) => {
        if (key === 'lastUserInfo') return cachedUserInfo;
        return null;
      }),
      setStorageSync: jest.fn(),
      removeStorageSync: jest.fn(),
      canIUse: jest.fn(() => true),
      login: jest.fn(({ success, fail }) => {
        if (loginCode) {
          success({ code: loginCode });
        } else {
          fail({ errMsg: 'login fail' });
        }
      }),
      showModal: jest.fn(),
      reLaunch: jest.fn()
    };
    global.getCurrentPages = jest.fn(() => [{ route: currentRoute }]);

    jest.doMock('../../adapters/storage-adapter', () => {
      return class MockStorageAdapter {
        constructor(options) {
          this.options = options;
        }
      };
    });

    jest.doMock('../../services/service-manager.js', () => ({
      setUserService: setUserServiceMock
    }));

    jest.doMock('../../services/user-service.js', () => ({
      UserService: class MockUserService {
        constructor(options) {
          this.options = options;
          this.initialized = true;
        }
        initialize() {
          return initializeMock();
        }
      }
    }));

    jest.doMock('../../utils/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }));

    jest.doMock('../../utils/api-config', () => ({
      ENABLE_API: enableApi,
      ENDPOINTS: {
        AUTH_LOGIN: '/api/auth/login'
      }
    }));

    jest.doMock('../../utils/token-manager', () => ({
      getToken: jest.fn(() => token),
      isAuthenticated: jest.fn(() => authenticated),
      setToken: setTokenMock,
      clearToken: clearTokenMock
    }));

    jest.doMock('../../utils/http-client', () => ({
      post: httpPostMock
    }));

    jest.doMock('../../utils/app/app-access-state', () => {
      const actual = jest.requireActual('../../utils/app/app-access-state');
      return {
        ...actual,
        loadPendingAppAccessCode: jest.fn(() => pendingAccessCode),
        clearPendingAppAccessCode: jest.fn(),
        savePendingAppAccessCode: jest.fn(actual.savePendingAppAccessCode)
      };
    });

    const module = require('../../utils/app/bootstrap-auth');
    const appAccessState = require('../../utils/app/app-access-state');
    return {
      module,
      setUserServiceMock,
      initializeMock,
      setTokenMock,
      clearTokenMock,
      httpPostMock,
      appAccessState
    };
  }

  afterEach(() => {
    jest.resetModules();
    delete global.wx;
    delete global.getCurrentPages;
  });

  it('云端模式且已有有效 token 时应直接初始化 UserService', async () => {
    const { module, setUserServiceMock } = loadModule({
      token: 'saved-token',
      authenticated: true
    });
    const app = { globalData: {} };

    await module.prepareUserService(app);

    expect(app.globalData.userService).toBeTruthy();
    expect(app.globalData.userService.options.useCloudStorage).toBe(true);
    expect(setUserServiceMock).toHaveBeenCalledWith(app.globalData.userService);
  });

  it('云端模式下缓存用户存在但自动登录失败时应保持未登录态', async () => {
    const { module } = loadModule({
      cachedUserInfo: { id: 'user-1' },
      loginResult: null
    });
    const app = { globalData: {} };

    await module.prepareUserService(app);

    expect(app.globalData.userService).toBeNull();
  });

  it('doCloudLogin、doCloudLogout 与 getWxLoginCode 应走完整主路径', async () => {
    const {
      module,
      setUserServiceMock,
      setTokenMock,
      clearTokenMock,
      httpPostMock,
      appAccessState
    } = loadModule({
      cachedUserInfo: { id: 'user-1' },
      pendingAccessCode: 'INVITE88'
    });
    const app = { globalData: {} };

    await expect(module.doCloudLogin(app)).resolves.toBe(true);
    expect(httpPostMock).toHaveBeenCalledWith('/api/auth/login', { code: 'wx-code', accessCode: 'INVITE88' });
    expect(setTokenMock).toHaveBeenCalledWith('token-1');
    expect(appAccessState.clearPendingAppAccessCode).toHaveBeenCalled();
    expect(setUserServiceMock).toHaveBeenCalled();

    module.doCloudLogout(app);
    expect(clearTokenMock).toHaveBeenCalled();
    expect(global.wx.reLaunch).toHaveBeenCalledWith({
      url: '/pages/index/index'
    });

    await expect(module.getWxLoginCode()).resolves.toBe('wx-code');
  });

  it('getWxLoginCode 登录失败时应返回 null', async () => {
    const { module } = loadModule({
      loginCode: null
    });

    await expect(module.getWxLoginCode()).resolves.toBeNull();
  });

  it('本地模式和无缓存云端模式应走各自初始化路径', async () => {
    const local = loadModule({
      enableApi: false
    });
    const localApp = { globalData: {} };
    await local.module.prepareUserService(localApp);
    expect(localApp.globalData.userService.options.useCloudStorage).toBe(false);

    const cloud = loadModule({
      enableApi: true,
      cachedUserInfo: null
    });
    const cloudApp = { globalData: {} };
    await cloud.module.prepareUserService(cloudApp);
    expect(cloudApp.globalData.userService).toBeNull();
  });

  it('runWxLogin 应覆盖本地模式、云端失败与 wx.login 失败分支', async () => {
    const local = loadModule({
      enableApi: false
    });
    const localApp = {
      globalData: {},
      postLoginInitialization: jest.fn().mockResolvedValue()
    };
    await local.module.runWxLogin(localApp);
    await Promise.resolve();
    expect(localApp.globalData.canIUseGetUserProfile).toBe(false);
    expect(localApp.postLoginInitialization).toHaveBeenCalled();

    const cloud = loadModule({
      enableApi: true
    });
    cloud.httpPostMock.mockRejectedValueOnce(new Error('network'));
    const cloudApp = {
      globalData: {},
      postLoginInitialization: jest.fn().mockResolvedValue()
    };
    await cloud.module.runWxLogin(cloudApp);
    await Promise.resolve();
    await Promise.resolve();
    expect(global.wx.showModal).toHaveBeenCalledWith(expect.objectContaining({
      title: '登录失败'
    }));

    const failedWxLogin = loadModule({
      enableApi: true,
      loginCode: null
    });
    await expect(failedWxLogin.module.getWxLoginCode()).resolves.toBeNull();
  });

  it('邀请制错误应跳转到 access-gate，且不再弹通用失败弹窗', async () => {
    const admissionError = Object.assign(new Error('当前为邀请制体验，请先输入邀请码'), {
      code: 'AUTH_APP_ACCESS_CODE_REQUIRED'
    });
    const { module, httpPostMock } = loadModule({
      enableApi: true
    });
    httpPostMock.mockRejectedValueOnce(admissionError);
    const app = {
      globalData: {},
      postLoginInitialization: jest.fn().mockResolvedValue()
    };

    await module.runWxLogin(app);
    await Promise.resolve();
    await Promise.resolve();

    expect(global.wx.reLaunch).toHaveBeenCalledWith({
      url: '/pages/access-gate/access-gate?reason=AUTH_APP_ACCESS_CODE_REQUIRED'
    });
    expect(global.wx.showModal).not.toHaveBeenCalled();
  });

  it('access-gate 主动登录时可抛出邀请制错误供页面内联展示', async () => {
    const invalidError = Object.assign(new Error('邀请码无效，请检查后重试'), {
      code: 'AUTH_APP_ACCESS_CODE_INVALID'
    });
    const { module, httpPostMock } = loadModule({
      enableApi: true,
      currentRoute: 'pages/access-gate/access-gate'
    });
    httpPostMock.mockRejectedValueOnce(invalidError);

    await expect(module.doCloudLogin({ globalData: {} }, {
      throwOnAdmissionError: true
    })).rejects.toMatchObject({
      code: 'AUTH_APP_ACCESS_CODE_INVALID'
    });

    expect(global.wx.reLaunch).not.toHaveBeenCalled();
    expect(global.wx.showModal).not.toHaveBeenCalled();
  });

  it('doCloudLogin、doCloudLogout 和 autoLogin 应覆盖禁用与失败分支', async () => {
    const disabled = loadModule({
      enableApi: false
    });
    await expect(disabled.module.doCloudLogin({ globalData: {} })).resolves.toBe(false);
    disabled.module.doCloudLogout({ globalData: {} });
    expect(global.wx.reLaunch).not.toHaveBeenCalled();

    const failing = loadModule({
      enableApi: true,
      loginCode: null
    });
    await expect(failing.module.doCloudLogin({ globalData: {} })).resolves.toBe(false);
    expect(global.wx.showModal).toHaveBeenCalledWith(expect.objectContaining({
      title: '登录失败'
    }));

    const autoLoginFail = loadModule({
      enableApi: true,
      loginResult: { ok: false }
    });
    await expect(autoLoginFail.module.autoLogin({ globalData: {} })).resolves.toBe(false);
  });
});
