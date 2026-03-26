describe('app.js contract', () => {
  let appConfig;
  let getEventBusMock;
  let prepareUserServiceMock;
  let initializeServicesMock;
  let runWxLoginMock;
  let installObserversMock;

  beforeEach(() => {
    jest.resetModules();
    appConfig = null;
    getEventBusMock = jest.fn();
    prepareUserServiceMock = jest.fn().mockResolvedValue();
    initializeServicesMock = jest.fn().mockResolvedValue(true);
    runWxLoginMock = jest.fn().mockResolvedValue();
    installObserversMock = jest.fn();

    global.App = jest.fn((config) => {
      appConfig = config;
      return config;
    });

    global.wx = {
      login: jest.fn(),
      request: jest.fn(),
      setStorageSync: jest.fn(),
      getStorageSync: jest.fn(),
      removeStorageSync: jest.fn(),
      showModal: jest.fn(),
      reLaunch: jest.fn(),
      onDeviceOrientationChange: jest.fn(),
      onWindowResize: jest.fn(),
      canIUse: jest.fn(() => true)
    };

    jest.doMock('../../adapters/storage-adapter', () => {
      return class MockStorageAdapter {
        constructor() {}
        static initializeApplicationStorage() {}
      };
    });

    jest.doMock('../../services/service-manager.js', () => ({
      setUserService: jest.fn(),
      initialize: jest.fn().mockResolvedValue(true),
      getService: jest.fn(),
      getTaskService: jest.fn(),
      getStarService: jest.fn(),
      getMessageService: jest.fn(),
      getUserService: jest.fn(),
      getEventBus: getEventBusMock,
      getAnalyticsService: jest.fn()
    }));

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

    jest.doMock('../../utils/api-config', () => ({
      ENABLE_API: false,
      BASE_URL: '',
      ENDPOINTS: {
        AUTH_LOGIN: '/api/auth/login'
      }
    }));

    jest.doMock('../../utils/token-manager', () => ({
      getToken: jest.fn(() => null),
      isAuthenticated: jest.fn(() => false),
      setToken: jest.fn(),
      clearToken: jest.fn()
    }));

    jest.doMock('../../utils/core/event-bus', () => {
      return class MockEventBus {};
    });

    jest.doMock('../../services/user-service.js', () => ({
      UserService: class MockUserService {
        async initialize() {
          return true;
        }
      }
    }));

    jest.doMock('../../utils/app/bootstrap-auth', () => ({
      prepareUserService: prepareUserServiceMock,
      runWxLogin: runWxLoginMock,
      doCloudLogin: jest.fn(),
      doCloudLogout: jest.fn(),
      autoLogin: jest.fn(),
      getWxLoginCode: jest.fn()
    }));

    jest.doMock('../../utils/app/bootstrap-services', () => ({
      initialize: initializeServicesMock
    }));

    jest.doMock('../../utils/app/post-login-bootstrap', () => ({
      run: jest.fn(),
      fixLegacyTaskData: jest.fn(),
      checkFirstLaunch: jest.fn(),
      createWelcomeMessage: jest.fn(),
      getWelcomeContent: jest.fn()
    }));

    jest.doMock('../../utils/app/runtime-observers', () => ({
      install: installObserversMock,
      setupOrientationListener: jest.fn(),
      setupThemeChangeListener: jest.fn(),
      setupFontSizeChangeListener: jest.fn(),
      globalEvent: jest.fn(),
      updateHeightParams: jest.fn(),
      setTheme: jest.fn()
    }));
  });

  afterEach(() => {
    jest.resetModules();
    delete global.App;
  });

  it('应继续暴露 App 对外认证与运行时入口方法', () => {
    require('../../app.js');

    expect(appConfig).toBeTruthy();
    expect(typeof appConfig.doCloudLogin).toBe('function');
    expect(typeof appConfig.doCloudLogout).toBe('function');
    expect(typeof appConfig.autoLogin).toBe('function');
    expect(typeof appConfig.getWxLoginCode).toBe('function');
    expect(typeof appConfig.globalEvent).toBe('function');
  });

  it('onLaunch 后应保留 globalData 的事件契约', async () => {
    const eventBus = { emit: jest.fn() };
    getEventBusMock.mockReturnValue(eventBus);

    require('../../app.js');

    await appConfig.onLaunch.call(appConfig);

    expect(prepareUserServiceMock).toHaveBeenCalledWith(appConfig);
    expect(initializeServicesMock).toHaveBeenCalledWith(appConfig, { isDevEnv: true });
    expect(runWxLoginMock).toHaveBeenCalledWith(appConfig);
    expect(installObserversMock).toHaveBeenCalledWith(appConfig);
    expect(appConfig.globalData.eventCallbacks).toEqual({});
    expect(appConfig.globalData.eventBus).toBe(eventBus);
  });
});
