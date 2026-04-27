describe('app.js launch behavior', () => {
  let appConfig;
  let updateHeightParamsMock;
  let getServiceMock;

  beforeEach(() => {
    jest.resetModules();
    appConfig = null;
    updateHeightParamsMock = jest.fn();
    getServiceMock = jest.fn();

    global.App = jest.fn((config) => {
      appConfig = config;
      return config;
    });

    global.wx = {
      getStorageSync: jest.fn(() => null),
      setStorageSync: jest.fn(),
      showModal: jest.fn(),
      canIUse: jest.fn(() => true),
      onDeviceOrientationChange: jest.fn(),
      onWindowResize: jest.fn()
    };

    jest.doMock('../../adapters/storage-adapter', () => {
      return class MockStorageAdapter {
        static initializeApplicationStorage() {}
      };
    });

    jest.doMock('../../services/service-manager.js', () => ({
      getService: getServiceMock,
      getTaskService: jest.fn(() => 'task-service'),
      getStarService: jest.fn(() => 'star-service'),
      getEventBus: jest.fn(() => 'event-bus')
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

    jest.doMock('../../utils/app/runtime-observers', () => ({
      install: jest.fn(),
      setupOrientationListener: jest.fn(),
      setupThemeChangeListener: jest.fn(),
      setupFontSizeChangeListener: jest.fn(),
      globalEvent: jest.fn(),
      updateHeightParams: updateHeightParamsMock,
      setTheme: jest.fn()
    }));

    jest.doMock('../../utils/app/bootstrap-auth', () => ({
      prepareUserService: jest.fn(),
      runWxLogin: jest.fn(),
      handleAppShow: jest.fn().mockResolvedValue(true),
      doCloudLogin: jest.fn().mockResolvedValue(true),
      doCloudLogout: jest.fn(),
      autoLogin: jest.fn().mockResolvedValue(true),
      getWxLoginCode: jest.fn().mockResolvedValue('code')
    }));

    jest.doMock('../../utils/app/bootstrap-services', () => ({
      initialize: jest.fn().mockResolvedValue(true)
    }));

    jest.doMock('../../utils/app/post-login-bootstrap', () => ({
      run: jest.fn(),
      fixLegacyTaskData: jest.fn(),
      checkFirstLaunch: jest.fn(),
      createWelcomeMessage: jest.fn(),
      getWelcomeContent: jest.fn(() => 'welcome')
    }));
  });

  afterEach(() => {
    jest.resetModules();
    delete global.App;
    delete global.wx;
  });

  it('应暴露壳层委托方法并支持 initUnitSystem', () => {
    require('../../app.js');

    appConfig.initUnitSystem.call(appConfig);

    expect(appConfig.globalData.deviceInfo.windowWidth).toBe(375);
    expect(appConfig.globalData.rpxRatio).toBe(2);
    expect(updateHeightParamsMock).toHaveBeenCalledWith(appConfig, false);
    expect(appConfig.getTaskService()).toBe('task-service');
    expect(appConfig.getStarService()).toBe('star-service');
    expect(appConfig.globalData.eventBus).toBe('event-bus');
  });

  it('checkCompatibility 和 compareVersion 应覆盖关键分支', () => {
    const deviceInfo = require('../../utils/deviceInfo');
    require('../../app.js');

    expect(appConfig.compareVersion('2.20.1', '2.20.0')).toBe(1);
    expect(appConfig.compareVersion('2.20.0', '2.20.1')).toBe(-1);
    expect(appConfig.compareVersion('2.20.0', '2.20.0')).toBe(0);

    deviceInfo.getSDKVersion.mockReturnValueOnce(null);
    appConfig.checkCompatibility.call(appConfig);

    deviceInfo.getSDKVersion.mockReturnValueOnce('2.10.0');
    deviceInfo._compareVersion.mockReturnValueOnce(-1);
    appConfig.checkCompatibility.call(appConfig);

    expect(global.wx.showModal).toHaveBeenCalledTimes(2);
  });
});
