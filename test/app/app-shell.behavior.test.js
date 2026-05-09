describe('app.js shell behavior', () => {
  let appConfig;
  let storageInitMock;
  let prepareUserServiceMock;
  let runWxLoginMock;
  let handleAppShowMock;
  let bootstrapServicesMock;
  let runtimeObserversMock;
  let postLoginBootstrapMock;
  let serviceManagerMock;
  let hasBlockedSessionFlagMock;
  let blockedSessionActive;
  let normalizeInviteCodeMock;
  let savePendingInviteCodeMock;

  beforeEach(() => {
    jest.resetModules();
    appConfig = null;
    storageInitMock = jest.fn();
    prepareUserServiceMock = jest.fn().mockResolvedValue();
    runWxLoginMock = jest.fn().mockResolvedValue();
    handleAppShowMock = jest.fn().mockResolvedValue('handled-show');
    blockedSessionActive = false;
    hasBlockedSessionFlagMock = jest.fn(() => blockedSessionActive);
    normalizeInviteCodeMock = jest.fn((value) => String(value || '').trim().toUpperCase());
    savePendingInviteCodeMock = jest.fn();
    bootstrapServicesMock = jest.fn().mockResolvedValue(true);
    runtimeObserversMock = {
      install: jest.fn(),
      setupOrientationListener: jest.fn(() => 'orientation'),
      setupThemeChangeListener: jest.fn(() => 'theme-change'),
      setupFontSizeChangeListener: jest.fn(() => 'font-size'),
      globalEvent: jest.fn(() => 'event-result'),
      updateHeightParams: jest.fn(() => 'height-updated'),
      setTheme: jest.fn(() => 'theme-set')
    };
    postLoginBootstrapMock = {
      run: jest.fn(() => 'post-login-run'),
      fixLegacyTaskData: jest.fn(() => 'fixed'),
      checkFirstLaunch: jest.fn(() => 'first-launch'),
      createWelcomeMessage: jest.fn(() => 'welcome-created'),
      getWelcomeContent: jest.fn(() => 'welcome')
    };
    serviceManagerMock = {
      getService: jest.fn(() => 'named-service'),
      getTaskService: jest.fn(() => 'task-service'),
      getStarService: jest.fn(() => 'star-service'),
      getEventBus: jest.fn(() => 'event-bus'),
      isInitialized: false
    };

    global.App = jest.fn((config) => {
      appConfig = config;
      return config;
    });

    global.wx = {
      getStorageSync: jest.fn((key) => {
        if (key === 'logs') return [1];
        return null;
      }),
      setStorageSync: jest.fn(),
      reLaunch: jest.fn(),
      showModal: jest.fn(),
      canIUse: jest.fn(() => true),
      onDeviceOrientationChange: jest.fn(),
      onWindowResize: jest.fn()
    };

    jest.doMock('../../adapters/storage-adapter', () => {
      return class MockStorageAdapter {
        static initializeApplicationStorage() {
          storageInitMock();
        }
      };
    });

    jest.doMock('../../services/service-manager.js', () => serviceManagerMock);

    jest.doMock('../../utils/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }));

    jest.doMock('../../utils/log-config', () => ({
      init: jest.fn(),
      applyEnvironmentDefaults: jest.fn(),
      setLogLevels: jest.fn()
    }));

    jest.doMock('../../utils/deviceInfo', () => ({
      isDevelopmentEnv: jest.fn(() => true),
      getSystemInfo: jest.fn(() => ({
        windowWidth: 375,
        windowHeight: 667,
        statusBarHeight: 20,
        screenHeight: 667,
        safeArea: { top: 20, bottom: 667, left: 0, right: 375 }
      })),
      getSDKVersion: jest.fn(() => '2.30.0'),
      _compareVersion: jest.fn(() => 1)
    }));

    jest.doMock('../../utils/app/bootstrap-auth', () => ({
      prepareUserService: prepareUserServiceMock,
      runWxLogin: runWxLoginMock,
      handleAppShow: handleAppShowMock,
      doCloudLogin: jest.fn().mockResolvedValue('cloud-login'),
      doCloudLogout: jest.fn(() => 'cloud-logout'),
      autoLogin: jest.fn().mockResolvedValue('auto-login'),
      getWxLoginCode: jest.fn().mockResolvedValue('wx-code')
    }));

    jest.doMock('../../utils/app/bootstrap-services', () => ({
      initialize: bootstrapServicesMock
    }));

    jest.doMock('../../utils/app/post-login-bootstrap', () => postLoginBootstrapMock);
    jest.doMock('../../utils/app/runtime-observers', () => runtimeObserversMock);
    jest.doMock('../../utils/app/system-user-access-state', () => ({
      hasBlockedSessionFlag: hasBlockedSessionFlagMock
    }));
    jest.doMock('../../utils/app/app-access-state', () => ({
      normalizeInviteCode: normalizeInviteCodeMock,
      savePendingInviteCode: savePendingInviteCodeMock
    }));
    jest.doMock('../../utils/runtime-config', () => ({
      ensureDefaultRuntimeApiConfig: jest.fn(),
      resolveRuntimeApiConfig: jest.fn(() => ({
        enableApiRaw: 'true',
        baseUrlRaw: 'https://api.todoceo.xyz',
        enabled: true,
        source: 'test'
      }))
    }));
  });

  afterEach(() => {
    jest.resetModules();
    delete global.App;
    delete global.wx;
  });

  it('onLaunch 和 onShow 应串起壳层启动流程', async () => {
    require('../../app.js');

    await appConfig.onLaunch.call(appConfig);
    await appConfig.onShow.call(appConfig, {});

    expect(storageInitMock).toHaveBeenCalled();
    expect(prepareUserServiceMock).toHaveBeenCalledWith(appConfig);
    expect(bootstrapServicesMock).toHaveBeenCalledWith(appConfig, { isDevEnv: true });
    expect(runWxLoginMock).toHaveBeenCalledWith(appConfig, expect.objectContaining({
      startupMode: true,
      suppressFailureModal: true
    }));
    expect(handleAppShowMock).toHaveBeenCalledWith(appConfig, {});
    expect(runtimeObserversMock.install).toHaveBeenCalledWith(appConfig);
    expect(global.wx.setStorageSync).toHaveBeenCalledWith('logs', expect.any(Array));
    expect(appConfig.globalData.appReady).toBe(false);
    expect(appConfig.globalData.servicesInitialized).toBe(false);
  });

  it('waitForSystemAccessRefresh 应等待当前前台刷新完成，并在禁入态返回 false', async () => {
    let resolveShow;
    handleAppShowMock.mockImplementation(() => new Promise((resolve) => {
      resolveShow = resolve;
    }));

    require('../../app.js');

    const onShowPromise = appConfig.onShow.call(appConfig, {});
    const waitPromise = appConfig.waitForSystemAccessRefresh();
    let waitSettled = false;
    waitPromise.then(() => {
      waitSettled = true;
    });

    await Promise.resolve();
    expect(waitSettled).toBe(false);

    resolveShow(true);
    await waitPromise;
    await onShowPromise;

    expect(appConfig.globalData.systemAccessRefreshPromise).toBeNull();

    handleAppShowMock.mockResolvedValue('handled-show');
    handleAppShowMock.mockClear();
    await expect(appConfig.waitForSystemAccessRefresh()).resolves.toBe(true);
    expect(handleAppShowMock).toHaveBeenCalledWith(appConfig, {
      source: 'page_on_show'
    });

    blockedSessionActive = true;
    await expect(appConfig.waitForSystemAccessRefresh()).resolves.toBe(false);
  });

  it('waitForStartupDecision 在启动决策未完成前不应提前放行首页流程', async () => {
    let resolveInitialLogin;
    runWxLoginMock.mockImplementation(() => new Promise((resolve) => {
      resolveInitialLogin = resolve;
    }));

    require('../../app.js');

    const launchPromise = appConfig.onLaunch.call(appConfig, {});
    const waitPromise = appConfig.waitForStartupDecision();
    let waitSettled = false;
    waitPromise.then(() => {
      waitSettled = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(waitSettled).toBe(false);
    expect(runWxLoginMock).toHaveBeenCalledWith(appConfig, expect.objectContaining({
      startupMode: true,
      suppressFailureModal: true
    }));

    resolveInitialLogin({
      success: false,
      url: '/pages/access-gate/access-gate?reason=AUTH_APP_ACCESS_CODE_REQUIRED'
    });

    await expect(waitPromise).resolves.toBe('/pages/access-gate/access-gate?reason=AUTH_APP_ACCESS_CODE_REQUIRED');
    await launchPromise;
    expect(appConfig.globalData.startupDecisionUrl).toBe('/pages/access-gate/access-gate?reason=AUTH_APP_ACCESS_CODE_REQUIRED');
  });

  it('壳层委托方法应继续转发到对应模块', async () => {
    require('../../app.js');
    appConfig.globalData.userService = 'user-service';

    expect(appConfig.getService('reward')).toBe('named-service');
    expect(appConfig.getTaskService()).toBe('task-service');
    expect(appConfig.getStarService()).toBe('star-service');
    expect(appConfig.getUserService()).toBe('user-service');
    await expect(appConfig.postLoginInitialization()).resolves.toBe('post-login-run');
    await expect(appConfig.fixLegacyTaskData('task-service')).resolves.toBe('fixed');
    await expect(appConfig.checkFirstLaunch('message-service')).resolves.toBe('first-launch');
    await expect(appConfig.createWelcomeMessage('message-service')).resolves.toBe('welcome-created');
    expect(appConfig.getWelcomeContent()).toBe('welcome');
    await expect(appConfig.doCloudLogin()).resolves.toBe('cloud-login');
    expect(appConfig.doCloudLogout()).toBe('cloud-logout');
    await expect(appConfig.autoLogin()).resolves.toBe('auto-login');
    await expect(appConfig.getWxLoginCode()).resolves.toBe('wx-code');
    expect(appConfig.setupOrientationListener()).toBe('orientation');
    expect(appConfig.setupThemeChangeListener()).toBe('theme-change');
    expect(appConfig.setupFontSizeChangeListener()).toBe('font-size');
    expect(appConfig.globalEvent('event', { ok: true })).toBe('event-result');
    expect(appConfig.updateHeightParams(true)).toBe('height-updated');
    expect(appConfig.setTheme()).toBe('theme-set');
  });

  it('initLogSystem 应覆盖生产环境和配置服务优先分支', () => {
    const deviceInfo = require('../../utils/deviceInfo');
    const logConfig = require('../../utils/log-config');

    deviceInfo.isDevelopmentEnv.mockReturnValue(false);
    serviceManagerMock.isInitialized = true;
    serviceManagerMock.getService.mockImplementation((name) => {
      if (name === 'config') {
        return {
          getUserLogConfig: jest.fn(() => ({
            levels: {
              default: 'warn',
              modules: {
                App: 'debug'
              }
            }
          }))
        };
      }
      return null;
    });

    require('../../app.js');
    appConfig.initLogSystem.call(appConfig);

    expect(logConfig.init).toHaveBeenCalledWith(expect.objectContaining({
      levels: expect.objectContaining({
        default: 'error'
      }),
      features: expect.objectContaining({
        storeLogs: false,
        maxLogEntries: 100
      })
    }));
    expect(logConfig.setLogLevels).toHaveBeenCalledWith({
      default: 'warn',
      modules: {
        App: 'debug'
      }
    });
  });

  it('initLogSystem 在本地降级配置解析失败时应记录告警', () => {
    const logger = require('../../utils/logger');

    global.wx.getStorageSync.mockImplementation((key) => {
      if (key === '_user_log_config') {
        return '{invalid-json';
      }
      if (key === 'logs') {
        return [1];
      }
      return null;
    });

    require('../../app.js');
    appConfig.initLogSystem.call(appConfig);

    expect(logger.warn).toHaveBeenCalledWith('App', '加载和解析用户日志配置失败', expect.any(Error));
  });

  it('邀请码入口应为未登录用户保存待处理邀请码并跳转到分享承接态', () => {
    require('../../app.js');

    expect(appConfig.extractInviteCode({
      query: { invite_code: ' u10086 ' }
    })).toBe('U10086');

    expect(appConfig.captureInviteEntry.call(appConfig, {
      query: { invite_code: ' u10086 ' },
      path: 'pages/home/index',
      scene: 1044
    }, {
      source: 'launch'
    })).toBe(true);

    expect(savePendingInviteCodeMock).toHaveBeenCalledWith('U10086');
    expect(global.wx.reLaunch).toHaveBeenCalledWith({
      url: '/pages/access-gate/access-gate?mode=share_pending_login&inviteCode=U10086&source=launch'
    });
  });

  it('邀请码入口应在已登录时进入手工确认态，且短时间重复指纹不重复跳转', () => {
    require('../../app.js');
    appConfig.globalData.userService = {
      getLoginUser: jest.fn(() => ({ userId: 'parent_1' }))
    };

    expect(appConfig.captureInviteEntry.call(appConfig, {
      query: { inviteCode: 'f123456789' },
      path: 'pages/home/index',
      scene: 1044
    }, {
      source: 'show'
    })).toBe(true);

    expect(savePendingInviteCodeMock).not.toHaveBeenCalled();
    expect(global.wx.reLaunch).toHaveBeenCalledWith({
      url: '/pages/access-gate/access-gate?mode=manual_input&inviteCode=F123456789&source=show'
    });

    expect(appConfig.captureInviteEntry.call(appConfig, {
      query: { inviteCode: 'f123456789' },
      path: 'pages/home/index',
      scene: 1044
    }, {
      source: 'show'
    })).toBe(false);
    expect(global.wx.reLaunch).toHaveBeenCalledTimes(1);
  });

  it('邀请码入口在 userService 未就绪但 token 已认证时也应直接进入手工确认态', () => {
    global.wx.getStorageSync.mockImplementation((key) => {
      if (key === 'jwt_token') {
        return 'saved-token';
      }
      if (key === 'logs') {
        return [1];
      }
      return null;
    });
    require('../../app.js');

    expect(appConfig.captureInviteEntry.call(appConfig, {
      query: { inviteCode: 'f123456789' },
      path: 'pages/home/index',
      scene: 1044
    }, {
      source: 'launch'
    })).toBe(true);

    expect(savePendingInviteCodeMock).not.toHaveBeenCalled();
    expect(global.wx.reLaunch).toHaveBeenCalledWith({
      url: '/pages/access-gate/access-gate?mode=manual_input&inviteCode=F123456789&source=launch'
    });
  });

  it('邀请码入口应支持 referrer extraData，并在缺失邀请码或缺少跳转能力时安全返回 false', () => {
    require('../../app.js');

    expect(appConfig.extractInviteCode({
      referrerInfo: {
        extraData: {
          inviteCode: ' ref9988 '
        }
      }
    })).toBe('REF9988');

    expect(appConfig.captureInviteEntry.call(appConfig, {}, { source: 'launch' })).toBe(false);

    delete global.wx.reLaunch;
    expect(appConfig.captureInviteEntry.call(appConfig, {
      referrerInfo: {
        extraData: {
          invite_code: 'ref9988'
        }
      }
    }, {
      source: 'launch'
    })).toBe(false);
  });

  it('onLaunch 在已拦截邀请码冷启动且尚未建立 userService 时应跳过首轮微信登录', async () => {
    require('../../app.js');

    await appConfig.onLaunch.call(appConfig, {
      query: { inviteCode: 'skip001' }
    });

    expect(runWxLoginMock).not.toHaveBeenCalled();
    expect(appConfig.globalData.startupDecisionUrl).toBe('/pages/access-gate/access-gate?mode=share_pending_login&inviteCode=SKIP001&source=launch');
    await expect(appConfig.waitForStartupDecision()).resolves.toBe('/pages/access-gate/access-gate?mode=share_pending_login&inviteCode=SKIP001&source=launch');
  });

  it('启动决策应在已登录时直接回到首页', async () => {
    global.wx.getStorageSync.mockImplementation((key) => {
      if (key === 'jwt_token') {
        return 'saved-token';
      }
      if (key === 'logs') {
        return [1];
      }
      return null;
    });
    prepareUserServiceMock.mockImplementation(async (app) => {
      app.globalData.userService = {
        initialized: true,
        getLoginUser: jest.fn(() => ({ userId: 'parent_1' }))
      };
    });

    require('../../app.js');

    await appConfig.onLaunch.call(appConfig, {});

    expect(runWxLoginMock).not.toHaveBeenCalled();
    expect(appConfig.globalData.startupDecisionUrl).toBe('/pages/index/index');
  });
});
