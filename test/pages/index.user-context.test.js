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

  it('initializeMultiUserSystem 在用户服务缺失和异常时应安全降级', async () => {
    const logger = require('../../utils/logger');

    global.getApp = jest.fn(() => ({
      globalData: {}
    }));

    const page = {
      setData: jest.fn(),
      updateMenuItemsWithPermissions: jest.fn()
    };

    await userContext.initializeMultiUserSystem(page);
    expect(page.setData).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('Index', '用户服务未初始化');

    global.getApp = jest.fn(() => ({
      globalData: {
        userService: {
          getCurrentUser: jest.fn(() => {
            throw new Error('boom');
          })
        }
      }
    }));

    await userContext.initializeMultiUserSystem(page);
    expect(logger.error).toHaveBeenCalledWith('Index', '初始化多用户系统失败', expect.any(Error));

    delete global.getApp;
  });

  it('initializeMultiUserSystem 应优先使用 app 或页面中的 lastActiveChildId', async () => {
    global.getApp = jest.fn(() => ({
      globalData: {
        lastActiveChildId: '',
        userService: {
          getCurrentUser: jest.fn(() => ({
            userId: 'parent-1',
            id: 'parent-1',
            name: '家长',
            role: 'parent'
          })),
          getLoginUser: jest.fn(() => ({
            userId: 'parent-1',
            role: 'parent'
          })),
          getAllUsers: jest.fn(() => [
            { userId: 'parent-1', role: 'parent' },
            { userId: 'child-2', role: 'child' }
          ])
        }
      }
    }));

    const page = {
      data: {
        lastActiveChildId: 'child-2'
      },
      setData: jest.fn(),
      updateMenuItemsWithPermissions: jest.fn()
    };

    await userContext.initializeMultiUserSystem(page);

    expect(page.setData).toHaveBeenCalledWith(expect.objectContaining({
      lastActiveChildId: 'child-2'
    }));
    delete global.getApp;
  });

  it('initializeMultiUserSystemDelayed 在已有 promise 时应直接复用', async () => {
    const existingPromise = Promise.resolve('cached');
    const page = {
      _multiUserSystemInitPromise: existingPromise
    };

    await expect(userContext.initializeMultiUserSystemDelayed(page)).resolves.toBe('cached');
  });
});
