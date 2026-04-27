jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../utils/permission-utils', () => ({
  getUserPermissions: jest.fn(() => ({
    canManageMembers: true
  }))
}));

const userContext = require('../../pages/index/modules/index-user-context');

describe('pages/index/modules/index-user-context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializeMultiUserSystem 应写入当前用户与只读视角', async () => {
    global.getApp = jest.fn(() => ({
      globalData: {
        userService: {
          getCurrentUser: jest.fn(() => ({
            userId: 'child-1',
            name: '小明',
            role: 'child'
          })),
          getLoginUser: jest.fn(() => ({
            userId: 'parent-1',
            role: 'parent'
          })),
          getAllUsers: jest.fn(() => [
            { userId: 'parent-1', role: 'parent' },
            { userId: 'child-1', role: 'child' }
          ])
        }
      }
    }));

    const page = {
      setData: jest.fn(),
      updateMenuItemsWithPermissions: jest.fn()
    };

    await userContext.initializeMultiUserSystem(page);

    expect(page.setData).toHaveBeenCalledWith(expect.objectContaining({
      loginUserId: 'parent-1',
      canManageMembers: true,
      isReadonlyView: true
    }));
    expect(page.updateMenuItemsWithPermissions).toHaveBeenCalled();
    delete global.getApp;
  });

  it('viewer 家长切到孩子视角时不应把首页误标记为 viewer 只读', async () => {
    global.getApp = jest.fn(() => ({
      globalData: {
        userService: {
          getCurrentUser: jest.fn(() => ({
            userId: 'child-1',
            name: '小明',
            role: 'child',
            familyId: 'family-1'
          })),
          getLoginUser: jest.fn(() => ({
            userId: 'parent-1',
            role: 'parent',
            familyId: 'family-1',
            familyPermissionRole: 'viewer'
          })),
          getAllUsers: jest.fn(() => [
            { userId: 'parent-1', role: 'parent', familyId: 'family-1', familyPermissionRole: 'viewer' },
            { userId: 'child-1', role: 'child', familyId: 'family-1' }
          ])
        }
      }
    }));

    const page = {
      setData: jest.fn(),
      updateMenuItemsWithPermissions: jest.fn()
    };

    await userContext.initializeMultiUserSystem(page);

    expect(page.setData).toHaveBeenCalledWith(expect.objectContaining({
      isReadonlyView: true,
      isViewerReadonly: false
    }));
    delete global.getApp;
  });

  it('initializeMultiUserSystem 在 userService 缺失时应提前返回', async () => {
    global.getApp = jest.fn(() => ({
      globalData: {}
    }));

    const page = {
      setData: jest.fn(),
      updateMenuItemsWithPermissions: jest.fn()
    };

    await userContext.initializeMultiUserSystem(page);

    expect(page.setData).not.toHaveBeenCalled();
    expect(page.updateMenuItemsWithPermissions).not.toHaveBeenCalled();
    delete global.getApp;
  });

  it('initializeMultiUserSystem 应兼容从全局 lastActiveChildId 恢复家长视角上下文', async () => {
    global.getApp = jest.fn(() => ({
      globalData: {
        lastActiveChildId: 'child-9',
        userService: {
          getCurrentUser: jest.fn(() => ({
            userId: 'parent-1',
            name: '家长',
            role: 'parent'
          })),
          getLoginUser: jest.fn(() => ({
            userId: 'parent-1',
            role: 'parent'
          })),
          getAllUsers: jest.fn(() => [
            { userId: 'parent-1', role: 'parent' },
            { userId: 'child-9', role: 'child' }
          ])
        }
      }
    }));

    const page = {
      data: {},
      setData: jest.fn(),
      updateMenuItemsWithPermissions: jest.fn()
    };

    await userContext.initializeMultiUserSystem(page);

    expect(page.setData).toHaveBeenCalledWith(expect.objectContaining({
      lastActiveChildId: 'child-9'
    }));
    delete global.getApp;
  });

  it('initializeMultiUserSystem 发生异常时应记录错误并吞掉异常', async () => {
    global.getApp = jest.fn(() => ({
      globalData: {
        userService: {
          getCurrentUser: jest.fn(() => ({
            userId: 'child-1',
            name: '小明',
            role: 'child'
          })),
          getLoginUser: jest.fn(() => ({
            userId: 'parent-1',
            role: 'parent'
          })),
          getAllUsers: jest.fn(() => {
            throw new Error('boom');
          })
        }
      }
    }));

    const page = {
      setData: jest.fn(),
      updateMenuItemsWithPermissions: jest.fn()
    };

    await expect(userContext.initializeMultiUserSystem(page)).resolves.toBeUndefined();
    delete global.getApp;
  });

  it('initializeMultiUserSystemDelayed 超时后应返回 false', async () => {
    jest.useFakeTimers();
    global.getApp = jest.fn(() => ({
      globalData: {}
    }));

    const page = {
      _multiUserSystemInitPromise: null,
      waitForLoginComplete: jest.fn().mockResolvedValue(),
      initializeMultiUserSystem: jest.fn().mockResolvedValue()
    };

    const pending = userContext.initializeMultiUserSystemDelayed(page);
    await jest.advanceTimersByTimeAsync(3100);
    await expect(pending).resolves.toBe(false);

    jest.useRealTimers();
    delete global.getApp;
  });

  it('initializeMultiUserSystemDelayed 在 userService 已就绪时应立即初始化', async () => {
    global.getApp = jest.fn(() => ({
      globalData: {
        userService: {}
      }
    }));

    const page = {
      _multiUserSystemInitPromise: null,
      waitForLoginComplete: jest.fn().mockResolvedValue(),
      initializeMultiUserSystem: jest.fn().mockResolvedValue(true)
    };

    await expect(userContext.initializeMultiUserSystemDelayed(page)).resolves.toBe(true);
    expect(page.initializeMultiUserSystem).toHaveBeenCalledTimes(1);
    delete global.getApp;
  });

  it('initializeMultiUserSystemDelayed 命中已有 promise 时应直接复用', async () => {
    const cachedPromise = Promise.resolve('cached');
    const page = {
      _multiUserSystemInitPromise: cachedPromise
    };

    await expect(userContext.initializeMultiUserSystemDelayed(page)).resolves.toBe('cached');
  });
});
