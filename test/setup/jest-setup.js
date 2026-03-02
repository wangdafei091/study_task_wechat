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

  // 存储相关
  getStorageInfo: jest.fn((options) => {
    if (options && options.success) {
      options.success({
        keys: [],
        currentSize: 0,
        limitSize: 10240
      });
    }
  })
};

// 设置测试超时时间
jest.setTimeout(10000);
