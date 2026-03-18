/**
 * jest-setup.js - Jest 测试环境设置
 */

// 模拟全局logger，避免在测试中调用真实logger
global.logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  logEvent: jest.fn()
};

// 模拟微信API，防止在测试环境中出现wx未定义错误
global.wx = {
  // 设备信息相关
  getDeviceInfo: jest.fn(() => ({
    platform: 'devtools',
    brand: 'devtools',
    model: 'iPhone 12',
    pixelRatio: 2,
    screenWidth: 375,
    screenHeight: 667,
    windowWidth: 375,
    windowHeight: 667,
    statusBarHeight: 44,
    safeArea: {
      top: 44,
      right: 375,
      bottom: 667,
      left: 0,
      width: 375,
      height: 623
    },
    safeAreaInsets: {
      top: 44,
      right: 0,
      bottom: 0,
      left: 0
    }
  })),

  getWindowInfo: jest.fn(() => ({
    pixelRatio: 2,
    windowWidth: 375,
    windowHeight: 667,
    screenWidth: 375,
    screenHeight: 667,
    statusBarHeight: 44,
    safeArea: {
      top: 44,
      right: 375,
      bottom: 667,
      left: 0,
      width: 375,
      height: 623
    },
    safeAreaInsets: {
      top: 44,
      right: 0,
      bottom: 0,
      left: 0
    }
  })),

  getAppBaseInfo: jest.fn(() => ({
    SDKVersion: '2.32.3',
    appId: 'test-app-id',
    appName: 'test-app',
    envVersion: 'develop',
    version: '1.0.0',
    language: 'zh_CN',
    theme: 'light'
  })),

  getSystemSetting: jest.fn(() => ({
    locationEnabled: true,
    locationAuthorized: true,
    bluetoothEnabled: false,
    bluetoothAuthorized: false,
    wifiEnabled: true,
    cameraAuthorized: true,
    albumAuthorized: true,
    locationAuthorized: true,
    microphoneAuthorized: true
  })),

  // 网络请求相关
  request: jest.fn((options) => {
    // 默认模拟成功响应（测试中可以通过mockImplementationOverride覆盖）
    setTimeout(() => {
      if (options && options.success) {
        options.success({
          statusCode: 200,
          data: {
            success: true,
            data: options.data || null,
            message: 'success'
          },
          header: {},
          cookies: []
        });
      }
      if (options && options.complete) {
        options.complete();
      }
    }, 0);
  }),

  // 存储相关
  getStorageInfo: jest.fn((options) => {
    if (options && options.success) {
      options.success({
        keys: [],
        currentSize: 0,
        limitSize: 10240
      });
    }
  }),

  getStorage: jest.fn((options) => {
    if (options && options.success) {
      options.success({
        data: null
      });
    }
  }),

  setStorage: jest.fn((options) => {
    setTimeout(() => {
      if (options && options.success) {
        options.success();
      }
      if (options && options.complete) {
        options.complete();
      }
    }, 0);
  }),

  removeStorage: jest.fn((options) => {
    setTimeout(() => {
      if (options && options.success) {
        options.success();
      }
      if (options && options.complete) {
        options.complete();
      }
    }, 0);
  }),

  // 同步存储API
  getStorageSync: jest.fn((key) => {
    // 测试环境默认禁用API模式，防止误触发云端逻辑
    if (key === 'ENABLE_API') return 'false';
    if (key === 'API_BASE_URL') return '';
    return null;
  }),
  setStorageSync: jest.fn(),
  removeStorageSync: jest.fn(),
  clearStorage: jest.fn((options) => {
    setTimeout(() => {
      if (options && options.success) {
        options.success();
      }
      if (options && options.complete) {
        options.complete();
      }
    }, 0);
  }),
  clearStorageSync: jest.fn()
};
