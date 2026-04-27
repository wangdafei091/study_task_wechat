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

  it('应识别 blocked/readonly 错误码，并只在 blocked 时触发跳转', () => {
    expect(systemUserAccessState.getErrorCode({
      responseData: { error_code: 'SYSTEM_USER_BLOCKED' }
    })).toBe('SYSTEM_USER_BLOCKED');
    expect(systemUserAccessState.getErrorCode({
      responseData: { errorCode: 'SYSTEM_USER_READONLY' }
    })).toBe('SYSTEM_USER_READONLY');
    expect(systemUserAccessState.isBlockedError({
      responseData: { error_code: 'SYSTEM_USER_BLOCKED' }
    })).toBe(true);
    expect(systemUserAccessState.isReadonlyError({
      responseData: { errorCode: 'SYSTEM_USER_READONLY' }
    })).toBe(true);
    expect(systemUserAccessState.isReadonlyError({ code: 'OTHER' })).toBe(false);

    expect(systemUserAccessState.handleBlockedError({ code: 'OTHER' })).toBe(false);
    expect(global.wx.reLaunch).not.toHaveBeenCalled();

    expect(systemUserAccessState.handleBlockedError({
      code: systemUserAccessState.SYSTEM_USER_ERROR_CODE.BLOCKED
    })).toBe(true);
    expect(global.wx.reLaunch).toHaveBeenCalledTimes(1);
  });

  it('clearSessionState 遇到清理异常时应记录告警', () => {
    tokenManager.clearToken.mockImplementation(() => {
      throw new Error('token failed');
    });
    global.wx.removeStorageSync.mockImplementation(() => {
      throw new Error('storage failed');
    });
    global.getApp.mockImplementation(() => {
      throw new Error('app failed');
    });
    serviceManager.setUserService.mockImplementation(() => {
      throw new Error('service failed');
    });

    systemUserAccessState.clearSessionState();

    expect(logger.warn).toHaveBeenCalledWith(
      'SystemUserAccessState',
      '清理 token 失败',
      expect.any(Error)
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'SystemUserAccessState',
      '清理用户缓存失败',
      expect.any(Error)
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'SystemUserAccessState',
      '清理全局 userService 失败',
      expect.any(Error)
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'SystemUserAccessState',
      '清理服务管理器 userService 失败',
      expect.any(Error)
    );
  });

  it('禁入状态工具在存储或路由环境缺失时应安全降级', () => {
    delete global.getCurrentPages;
    expect(systemUserAccessState.redirectToBlockedPage()).toBe(true);
    expect(global.wx.reLaunch).toHaveBeenCalledTimes(1);

    systemUserAccessState.resetBlockedRedirectState();
    global.getCurrentPages = jest.fn(() => [{ route: 'pages/system-blocked/system-blocked' }]);
    expect(systemUserAccessState.redirectToBlockedPage()).toBe(false);

    systemUserAccessState.resetBlockedRedirectState();
    delete global.wx.reLaunch;
    expect(systemUserAccessState.redirectToBlockedPage()).toBe(false);

    global.wx.setStorageSync.mockImplementation(() => {
      throw new Error('set failed');
    });
    expect(systemUserAccessState.setBlockedSessionFlag()).toBe(false);

    global.wx.removeStorageSync = jest.fn(() => {
      throw new Error('remove failed');
    });
    expect(systemUserAccessState.clearBlockedSessionFlag()).toBe(false);

    global.wx.getStorageSync.mockImplementation(() => {
      throw new Error('get failed');
    });
    expect(systemUserAccessState.hasBlockedSessionFlag()).toBe(false);
  });
});
