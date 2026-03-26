describe('app bootstrap modules', () => {
  beforeEach(() => {
    jest.resetModules();
    global.wx = {
      getStorageSync: jest.fn(),
      setStorageSync: jest.fn(),
      login: jest.fn(),
      canIUse: jest.fn(() => true),
      showModal: jest.fn(),
      request: jest.fn(),
      reLaunch: jest.fn(),
      onDeviceOrientationChange: jest.fn(),
      onWindowResize: jest.fn()
    };
  });

  afterEach(() => {
    jest.resetModules();
  });

  async function flushMicrotasks(times = 3) {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
    }
  }

  it('prepareUserService 在本地模式下应初始化本地 UserService 并注入 serviceManager', async () => {
    const initializeMock = jest.fn().mockResolvedValue(true);
    const setUserServiceMock = jest.fn();

    jest.doMock('../../adapters/storage-adapter', () => {
      return class MockStorageAdapter {
        constructor(options) {
          this.options = options;
        }
      };
    });

    jest.doMock('../../services/user-service.js', () => ({
      UserService: class MockUserService {
        constructor(options) {
          this.options = options;
        }
        initialize() {
          return initializeMock();
        }
      }
    }));

    jest.doMock('../../services/service-manager.js', () => ({
      setUserService: setUserServiceMock
    }));

    jest.doMock('../../utils/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }));

    jest.doMock('../../utils/api-config', () => ({
      ENABLE_API: false,
      BASE_URL: ''
    }));

    jest.doMock('../../utils/token-manager', () => ({
      getToken: jest.fn(() => null),
      isAuthenticated: jest.fn(() => false),
      setToken: jest.fn(),
      clearToken: jest.fn()
    }));

    const bootstrapAuth = require('../../utils/app/bootstrap-auth');
    const app = { globalData: {} };

    await bootstrapAuth.prepareUserService(app);

    expect(initializeMock).toHaveBeenCalledTimes(1);
    expect(app.globalData.userService).toBeTruthy();
    expect(app.globalData.userService.options.useCloudStorage).toBe(false);
    expect(setUserServiceMock).toHaveBeenCalledWith(app.globalData.userService);
  });

  it('runWxLogin 在云端模式下应登录、初始化用户服务并执行 postLoginInitialization', async () => {
    const setTokenMock = jest.fn();
    const setUserServiceMock = jest.fn();
    const initializeMock = jest.fn().mockResolvedValue(true);
    const postLoginInitialization = jest.fn().mockResolvedValue();

    jest.doMock('../../adapters/storage-adapter', () => {
      return class MockStorageAdapter {
        constructor(options) {
          this.options = options;
        }
      };
    });

    jest.doMock('../../services/user-service.js', () => ({
      UserService: class MockUserService {
        constructor(options) {
          this.options = options;
        }
        initialize() {
          return initializeMock();
        }
      }
    }));

    jest.doMock('../../services/service-manager.js', () => ({
      setUserService: setUserServiceMock
    }));

    jest.doMock('../../utils/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }));

    jest.doMock('../../utils/api-config', () => ({
      ENABLE_API: true,
      BASE_URL: 'https://api.example.com',
      ENDPOINTS: {
        AUTH_LOGIN: '/api/auth/login'
      }
    }));

    jest.doMock('../../utils/token-manager', () => ({
      getToken: jest.fn(() => null),
      isAuthenticated: jest.fn(() => false),
      setToken: setTokenMock,
      clearToken: jest.fn()
    }));

    jest.doMock('../../utils/http-client', () => ({
      post: jest.fn().mockResolvedValue({
        token: 'token-1',
        user: { id: 'user-1' }
      })
    }));

    const bootstrapAuth = require('../../utils/app/bootstrap-auth');
    const app = {
      globalData: {},
      postLoginInitialization
    };

    global.wx.login.mockImplementation(({ success }) => success({ code: 'wx-code' }));

    await bootstrapAuth.runWxLogin(app);
    await flushMicrotasks(4);

    expect(setTokenMock).toHaveBeenCalledWith('token-1');
    expect(initializeMock).toHaveBeenCalledTimes(1);
    expect(setUserServiceMock).toHaveBeenCalledWith(app.globalData.userService);
    expect(postLoginInitialization).toHaveBeenCalledTimes(1);
  });
});
