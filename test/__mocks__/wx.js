/**
 * 微信小程序API模拟
 * 主要模拟存储相关的API
 */

// 内存存储模拟
const storage = {};

const wx = {
  // 同步存储API
  setStorageSync: jest.fn((key, data) => {
    storage[key] = JSON.parse(JSON.stringify(data)); // 深拷贝，避免引用问题
    return true;
  }),
  
  getStorageSync: jest.fn((key) => {
    return storage[key] !== undefined ? JSON.parse(JSON.stringify(storage[key])) : '';
  }),
  
  removeStorageSync: jest.fn((key) => {
    delete storage[key];
    return true;
  }),
  
  clearStorageSync: jest.fn(() => {
    Object.keys(storage).forEach(key => delete storage[key]);
    return true;
  }),
  
  // 异步存储API
  setStorage: jest.fn(options => {
    try {
      storage[options.key] = JSON.parse(JSON.stringify(options.data));
      if (options.success) options.success();
      if (options.complete) options.complete();
    } catch (e) {
      if (options.fail) options.fail(e);
      if (options.complete) options.complete();
    }
  }),
  
  getStorage: jest.fn(options => {
    try {
      const data = storage[options.key] !== undefined 
        ? JSON.parse(JSON.stringify(storage[options.key]))
        : '';
      if (options.success) options.success({ data });
      if (options.complete) options.complete();
    } catch (e) {
      if (options.fail) options.fail(e);
      if (options.complete) options.complete();
    }
  }),
  
  removeStorage: jest.fn(options => {
    try {
      delete storage[options.key];
      if (options.success) options.success();
      if (options.complete) options.complete();
    } catch (e) {
      if (options.fail) options.fail(e);
      if (options.complete) options.complete();
    }
  }),
  
  // 工具API
  showToast: jest.fn(options => {}),
  showLoading: jest.fn(options => {}),
  hideLoading: jest.fn(() => {}),
  showModal: jest.fn(options => {
    if (options.success) options.success({ confirm: true });
  }),
  
  // 系统信息API
  getSystemInfoSync: jest.fn(() => ({
    platform: 'devtools',
    pixelRatio: 2,
    windowWidth: 375,
    windowHeight: 667,
    screenWidth: 375,
    screenHeight: 667
  })),
  
  // 辅助方法 - 清空模拟存储(仅测试用)
  _resetStorage: () => {
    Object.keys(storage).forEach(key => delete storage[key]);
  }
};

module.exports = wx; 