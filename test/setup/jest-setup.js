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

// 设置测试超时时间
jest.setTimeout(10000);
