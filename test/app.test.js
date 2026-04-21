describe('app.js 自动登录环境配置', () => {
  let appConfig;
  let setTokenMock;
  let httpPostMock;

  beforeEach(() => {
    jest.resetModules();
    appConfig = null;
    setTokenMock = jest.fn();
    httpPostMock = jest.fn().mockResolvedValue({
      token: 'mock-token',
      user: { id: 'user-1', nickname: 'Tester' }
    });

    global.App = jest.fn((config) => {
      appConfig = config;
      return config;
    });

    global.wx = {
      login: jest.fn(({ success }) => success({ code: 'mock-code' })),
      request: jest.fn().mockResolvedValue({
        data: {
          success: true,
          data: {
            token: 'mock-token',
            user: { id: 'user-1', nickname: 'Tester' }
          }
        }
      }),
      setStorageSync: jest.fn(),
      getStorageSync: jest.fn(),
      removeStorageSync: jest.fn(),
      showModal: jest.fn(),
      reLaunch: jest.fn()
    };

    jest.doMock('../adapters/storage-adapter', () => {
      return class MockStorageAdapter {
        constructor() {}
        static initializeApplicationStorage() {}
      };
    });

    jest.doMock('../services/service-manager.js', () => ({
      setUserService: jest.fn(),
      initialize: jest.fn().mockResolvedValue(true),
      getService: jest.fn()
    }));

    jest.doMock('../services/user-service.js', () => ({
      UserService: class MockUserService {
        async initialize() {
          return true;
        }
      }
    }));

    jest.doMock('../utils/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }));

    jest.doMock('../utils/log-config', () => ({}));

    jest.doMock('../utils/deviceInfo', () => ({
      isDevelopmentEnv: jest.fn(() => true)
    }));

    jest.doMock('../utils/api-config', () => ({
      ENABLE_API: true,
      BASE_URL: 'https://api.example.com',
      ENDPOINTS: {
        AUTH_LOGIN: '/api/auth/login'
      }
    }));

    jest.doMock('../utils/token-manager', () => ({
      getToken: jest.fn(() => null),
      isAuthenticated: jest.fn(() => false),
      setToken: setTokenMock,
      clearToken: jest.fn()
    }));

    jest.doMock('../utils/core/event-bus', () => {
      return class MockEventBus {};
    });

    jest.doMock('../utils/http-client', () => ({
      post: httpPostMock
    }));
  });

  afterEach(() => {
    jest.resetModules();
    delete global.App;
  });

  it('自动登录成功后不应自动回写 ENABLE_API 配置', async () => {
    require('../app.js');

    expect(appConfig).toBeTruthy();
    global.wx.setStorageSync.mockClear();

    const loginSuccess = await appConfig.autoLogin();

    expect(loginSuccess).toBe(true);
    expect(httpPostMock).toHaveBeenCalledWith('/api/auth/login', { code: 'mock-code' });
    expect(setTokenMock).toHaveBeenCalledWith('mock-token');
    expect(global.wx.setStorageSync).toHaveBeenCalledWith('lastUserInfo', {
      id: 'user-1',
      nickname: 'Tester'
    });
    expect(global.wx.setStorageSync).not.toHaveBeenCalledWith('ENABLE_API', 'true');
    expect(global.wx.request).not.toHaveBeenCalled();
  });

  it('加载 app.js 时应在 require 链前补齐默认 API 配置', () => {
    require('../app.js');

    expect(global.wx.setStorageSync).toHaveBeenCalledWith('ENABLE_API', 'true');
    expect(global.wx.setStorageSync).toHaveBeenCalledWith('API_BASE_URL', 'https://api.todoceo.xyz/test');
  });
});
