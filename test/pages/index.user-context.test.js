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
});
