describe('app.js shell behavior', () => {
  let appConfig;
  let storageInitMock;
  let prepareUserServiceMock;
  let runWxLoginMock;
  let bootstrapServicesMock;
  let runtimeObserversMock;
  let postLoginBootstrapMock;
  let serviceManagerMock;

  beforeEach(() => {
    jest.resetModules();
    appConfig = null;
    storageInitMock = jest.fn();
    prepareUserServiceMock = jest.fn().mockResolvedValue();
    runWxLoginMock = jest.fn().mockResolvedValue();
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
  });

  afterEach(() => {
    jest.resetModules();
    delete global.App;
    delete global.wx;
  });

  it('onLaunch 和 onShow 应串起壳层启动流程', async () => {
    require('../../app.js');

    await appConfig.onLaunch.call(appConfig);
    appConfig.onShow.call(appConfig, {});

    expect(storageInitMock).toHaveBeenCalled();
    expect(prepareUserServiceMock).toHaveBeenCalledWith(appConfig);
    expect(bootstrapServicesMock).toHaveBeenCalledWith(appConfig, { isDevEnv: true });
    expect(runWxLoginMock).toHaveBeenCalledWith(appConfig);
    expect(runtimeObserversMock.install).toHaveBeenCalledWith(appConfig);
    expect(global.wx.setStorageSync).toHaveBeenCalledWith('logs', expect.any(Array));
    expect(appConfig.globalData.appReady).toBe(false);
    expect(appConfig.globalData.servicesInitialized).toBe(false);
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
});
