jest.mock('../../utils/logger', () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn()
}));

jest.mock('../../utils/token-manager', () => ({
  clearToken: jest.fn()
}));

jest.mock('../../services/service-manager', () => ({
  setUserService: jest.fn()
}));

describe('utils/app/system-user-access-state', () => {
  let systemUserAccessState;
  let tokenManager;
  let serviceManager;
  let logger;
  let nowValue;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    nowValue = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => nowValue);

    global.wx = {
      setStorageSync: jest.fn(),
      getStorageSync: jest.fn(() => null),
      removeStorageSync: jest.fn(),
      reLaunch: jest.fn()
    };
    global.getCurrentPages = jest.fn(() => []);
    global.getApp = jest.fn(() => ({
      globalData: {
        userService: { stale: true }
      }
    }));

    systemUserAccessState = require('../../utils/app/system-user-access-state');
    tokenManager = require('../../utils/token-manager');
    serviceManager = require('../../services/service-manager');
    logger = require('../../utils/logger');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.wx;
    delete global.getCurrentPages;
    delete global.getApp;
  });

  it('clearSessionAndRedirectToBlocked 应持久化禁入标记并清空会话', () => {
    systemUserAccessState.clearSessionAndRedirectToBlocked();

    expect(global.wx.setStorageSync).toHaveBeenCalledWith(
      'system_user_blocked_session',
      expect.objectContaining({ active: true, updatedAt: 1000 })
    );
    expect(tokenManager.clearToken).toHaveBeenCalled();
    expect(global.wx.removeStorageSync).toHaveBeenCalledWith('lastUserInfo');
    expect(serviceManager.setUserService).toHaveBeenCalledWith(null);
    expect(global.wx.reLaunch).toHaveBeenCalledWith(expect.objectContaining({
      url: '/pages/system-blocked/system-blocked'
    }));
  });

  it('重复命中禁入时不应重复清理会话，只保留一次清 token 和服务解绑', () => {
    systemUserAccessState.clearSessionAndRedirectToBlocked();
    systemUserAccessState.clearSessionAndRedirectToBlocked();

    expect(tokenManager.clearToken).toHaveBeenCalledTimes(1);
    expect(global.wx.removeStorageSync).toHaveBeenCalledWith('lastUserInfo');
    expect(serviceManager.setUserService).toHaveBeenCalledTimes(1);
    expect(global.wx.reLaunch).toHaveBeenCalledTimes(1);
  });

  it('serviceManager 未就绪时也不应阻断禁入跳转', () => {
    serviceManager.setUserService = undefined;

    expect(() => systemUserAccessState.clearSessionAndRedirectToBlocked()).not.toThrow();

    expect(logger.warn).toHaveBeenCalledWith(
      'SystemUserAccessState',
      '服务管理器未就绪，跳过清理 ServiceManager.userService'
    );
    expect(global.wx.reLaunch).toHaveBeenCalledWith(expect.objectContaining({
      url: '/pages/system-blocked/system-blocked'
    }));
  });

  it('redirectToBlockedPage 应在检测到陈旧跳转锁时自动恢复重试', () => {
    global.wx.reLaunch.mockImplementation(() => {});

    expect(systemUserAccessState.redirectToBlockedPage()).toBe(true);

    nowValue = 3000;
    expect(systemUserAccessState.redirectToBlockedPage()).toBe(true);

    expect(logger.warn).toHaveBeenCalledWith(
      'SystemUserAccessState',
      '检测到陈旧的禁入跳转锁，自动重置'
    );
    expect(global.wx.reLaunch).toHaveBeenCalledTimes(2);
  });

  it('禁入会话标记应支持写入、读取和清理', () => {
    let storedValue = null;
    global.wx.setStorageSync.mockImplementation((key, value) => {
      storedValue = value;
    });
    global.wx.getStorageSync.mockImplementation(() => storedValue);
    global.wx.removeStorageSync.mockImplementation(() => {
      storedValue = null;
    });

    expect(systemUserAccessState.setBlockedSessionFlag()).toBe(true);
    expect(systemUserAccessState.hasBlockedSessionFlag()).toBe(true);
    expect(systemUserAccessState.clearBlockedSessionFlag()).toBe(true);
    expect(systemUserAccessState.hasBlockedSessionFlag()).toBe(false);
  });

  it('清理禁入会话标记后，应允许下一轮再次执行会话清理', () => {
    systemUserAccessState.clearSessionAndRedirectToBlocked();
    systemUserAccessState.clearBlockedSessionFlag();
    systemUserAccessState.clearSessionAndRedirectToBlocked();

    expect(tokenManager.clearToken).toHaveBeenCalledTimes(2);
    expect(serviceManager.setUserService).toHaveBeenCalledTimes(2);
  });
});
