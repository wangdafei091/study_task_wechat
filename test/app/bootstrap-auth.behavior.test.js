describe('utils/app/bootstrap-auth', () => {
  function loadModule({
    enableApi = true,
    token = null,
    authenticated = false,
    cachedUserInfo = null,
    loginResult = { token: 'token-1', user: { id: 'user-1' } },
    loginCode = 'wx-code',
    pendingAccessCode = '',
    currentRoute = 'pages/index/index',
    initializationBlocked = false,
    initializeResult = true,
    blockedSession = false
  } = {}) {
    jest.resetModules();

    const setUserServiceMock = jest.fn();
    const getUserServiceMock = jest.fn(() => null);
    const initializeMock = jest.fn().mockResolvedValue(initializeResult);
    const setTokenMock = jest.fn();
    const clearTokenMock = jest.fn();
    const httpPostMock = jest.fn().mockResolvedValue(loginResult);
    const httpGetMock = jest.fn().mockResolvedValue({
      userId: 'user-1',
      systemAccessLevel: 'normal',
      systemAccessUpdatedAt: '2026-04-26 12:00:00',
      systemAccessUpdatedByUserId: 'admin-1'
    });
    const handleBlockedErrorMock = jest.fn(() => false);
    const redirectToBlockedPageMock = jest.fn(() => true);
    const resetBlockedRedirectStateMock = jest.fn();
    let blockedSessionActive = blockedSession;
    const clearBlockedSessionFlagMock = jest.fn(() => {
      blockedSessionActive = false;
      return true;
    });
    const hasBlockedSessionFlagMock = jest.fn(() => blockedSessionActive);

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
      setUserService: setUserServiceMock,
      getUserService: getUserServiceMock
    }));

    jest.doMock('../../services/user-service.js', () => ({
      UserService: class MockUserService {
        constructor(options) {
          this.options = options;
          this.initialized = true;
          this.initializationBlocked = initializationBlocked;
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
        AUTH_LOGIN: '/api/auth/login',
        AUTH_CURRENT: '/api/auth/current'
      }
    }));

    jest.doMock('../../utils/token-manager', () => ({
      getToken: jest.fn(() => token),
      isAuthenticated: jest.fn(() => authenticated),
      setToken: setTokenMock,
      clearToken: clearTokenMock
    }));

    jest.doMock('../../utils/http-client', () => ({
      post: httpPostMock,
      get: httpGetMock
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
    jest.doMock('../../utils/app/system-user-access-state', () => ({
      handleBlockedError: handleBlockedErrorMock,
      clearBlockedSessionFlag: clearBlockedSessionFlagMock,
      hasBlockedSessionFlag: hasBlockedSessionFlagMock,
      redirectToBlockedPage: redirectToBlockedPageMock,
      resetBlockedRedirectState: resetBlockedRedirectStateMock
    }));

    const module = require('../../utils/app/bootstrap-auth');
    const appAccessState = require('../../utils/app/app-access-state');
    return {
      module,
      setUserServiceMock,
      getUserServiceMock,
      initializeMock,
      setTokenMock,
      clearTokenMock,
      httpPostMock,
      httpGetMock,
      appAccessState,
      handleBlockedErrorMock,
      clearBlockedSessionFlagMock,
      hasBlockedSessionFlagMock,
      redirectToBlockedPageMock,
      resetBlockedRedirectStateMock
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
      appAccessState,
      clearBlockedSessionFlagMock
    } = loadModule({
      cachedUserInfo: { id: 'user-1' },
      pendingAccessCode: 'INVITE88'
    });
    const app = {
      globalData: {},
      postLoginInitialization: jest.fn().mockResolvedValue()
    };

    await expect(module.doCloudLogin(app)).resolves.toBe(true);
    expect(httpPostMock).toHaveBeenCalledWith('/api/auth/login', { code: 'wx-code', accessCode: 'INVITE88' });
    expect(setTokenMock).toHaveBeenCalledWith('token-1');
    expect(appAccessState.clearPendingAppAccessCode).toHaveBeenCalled();
    expect(clearBlockedSessionFlagMock).toHaveBeenCalled();
    expect(setUserServiceMock).toHaveBeenCalled();
    expect(app.postLoginInitialization).toHaveBeenCalled();

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

  it('autoLogin 成功时应恢复 userService 并执行登录后初始化', async () => {
    const { module, setUserServiceMock, clearBlockedSessionFlagMock } = loadModule({
      enableApi: true,
      cachedUserInfo: { id: 'user-1' }
    });
    const app = {
      globalData: {},
      postLoginInitialization: jest.fn().mockResolvedValue()
    };

    await expect(module.autoLogin(app)).resolves.toBe(true);

    expect(setUserServiceMock).toHaveBeenCalled();
    expect(clearBlockedSessionFlagMock).toHaveBeenCalled();
    expect(app.postLoginInitialization).toHaveBeenCalled();
  });

  it('SYSTEM_USER_BLOCKED 应走统一禁入分流而不是弹通用失败框', async () => {
    const blockedError = Object.assign(new Error('当前账号已被管理员暂停使用'), {
      code: 'SYSTEM_USER_BLOCKED'
    });
    const { module, httpPostMock, handleBlockedErrorMock } = loadModule({
      enableApi: true
    });
    httpPostMock.mockRejectedValueOnce(blockedError);
    handleBlockedErrorMock.mockReturnValueOnce(true);

    await expect(module.doCloudLogin({ globalData: {} })).resolves.toBe(false);

    expect(handleBlockedErrorMock).toHaveBeenCalledWith(blockedError);
    expect(global.wx.showModal).not.toHaveBeenCalled();
  });

  it('初始化若因 blocked 失败，不应把伪 userService 挂回全局', async () => {
    const { module, setUserServiceMock } = loadModule({
      token: 'saved-token',
      authenticated: true,
      initializationBlocked: true,
      initializeResult: false
    });
    const app = { globalData: {} };
    app.globalData.userService = { stale: true };

    await module.prepareUserService(app);

    expect(app.globalData.userService).toBeNull();
    expect(setUserServiceMock).toHaveBeenCalledWith(null);
  });

  it('onShow 命中 blocked 恢复态时，恢复成功后应离开禁入页', async () => {
    const {
      module,
      clearBlockedSessionFlagMock
    } = loadModule({
      enableApi: true,
      blockedSession: true,
      currentRoute: 'pages/system-blocked/system-blocked'
    });
    const app = {
      globalData: {},
      postLoginInitialization: jest.fn().mockResolvedValue()
    };

    await expect(module.handleAppShow(app)).resolves.toBe(true);

    expect(clearBlockedSessionFlagMock).toHaveBeenCalled();
    expect(app.postLoginInitialization).toHaveBeenCalled();
    expect(global.wx.reLaunch).toHaveBeenCalledWith({
      url: '/pages/index/index'
    });
  });

  it('onShow 命中 blocked 恢复态但登录失败时，应继续回到禁入页', async () => {
    const {
      module,
      redirectToBlockedPageMock,
      resetBlockedRedirectStateMock
    } = loadModule({
      enableApi: true,
      blockedSession: true,
      loginCode: null,
      currentRoute: 'pages/index/index'
    });
    const app = {
      globalData: {},
      postLoginInitialization: jest.fn().mockResolvedValue()
    };

    await expect(module.handleAppShow(app)).resolves.toBe(false);

    expect(global.wx.showModal).not.toHaveBeenCalled();
    expect(resetBlockedRedirectStateMock).toHaveBeenCalled();
    expect(redirectToBlockedPageMock).toHaveBeenCalled();
  });

  it('onShow 发现 token 存在但 userService 丢失时，应自动补恢复', async () => {
    const {
      module,
      setUserServiceMock
    } = loadModule({
      enableApi: true,
      token: 'saved-token',
      authenticated: true
    });
    const app = {
      globalData: {},
      postLoginInitialization: jest.fn().mockResolvedValue()
    };

    await expect(module.handleAppShow(app)).resolves.toBe(true);

    expect(setUserServiceMock).toHaveBeenCalled();
    expect(app.postLoginInitialization).toHaveBeenCalled();
  });

  it('onShow 在 userService 已就绪时应刷新前台系统访问态快照', async () => {
    const applySystemAccessLevelSnapshotMock = jest.fn();
    const readyUserService = {
      initialized: true,
      getLoginUserId: jest.fn(() => 'user-1'),
      applySystemAccessLevelSnapshot: applySystemAccessLevelSnapshotMock
    };
    const {
      module,
      getUserServiceMock,
      httpGetMock
    } = loadModule({
      enableApi: true,
      token: 'saved-token',
      authenticated: true
    });
    getUserServiceMock.mockReturnValue(readyUserService);
    const app = {
      globalData: {
        userService: readyUserService
      }
    };

    await expect(module.handleAppShow(app)).resolves.toBe(true);

    expect(httpGetMock).toHaveBeenCalledWith('/api/auth/current');
    expect(applySystemAccessLevelSnapshotMock).toHaveBeenCalledWith('user-1', {
      systemAccessLevel: 'normal',
      systemAccessUpdatedAt: '2026-04-26 12:00:00',
      systemAccessUpdatedByUserId: 'admin-1'
    });
  });

  it('onShow 前台刷新若命中 blocked，应走统一禁入分流', async () => {
    const blockedError = Object.assign(new Error('当前账号已被管理员暂停使用'), {
      code: 'SYSTEM_USER_BLOCKED'
    });
    const readyUserService = {
      initialized: true,
      getLoginUserId: jest.fn(() => 'user-1'),
      applySystemAccessLevelSnapshot: jest.fn()
    };
    const {
      module,
      getUserServiceMock,
      httpGetMock,
      handleBlockedErrorMock
    } = loadModule({
      enableApi: true,
      token: 'saved-token',
      authenticated: true
    });
    getUserServiceMock.mockReturnValue(readyUserService);
    httpGetMock.mockRejectedValueOnce(blockedError);
    handleBlockedErrorMock.mockReturnValueOnce(true);
    const app = {
      globalData: {
        userService: readyUserService
      }
    };

    await expect(module.handleAppShow(app)).resolves.toBe(true);

    expect(handleBlockedErrorMock).toHaveBeenCalledWith(blockedError);
  });
});
