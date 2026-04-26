jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../services/system-service', () => ({
  listUserGovernance: jest.fn(),
  updateUserAccessLevel: jest.fn()
}));

jest.mock('../../utils/api-config', () => ({
  ENABLE_API: true
}));

jest.mock('../../utils/app/system-user-access-state', () => ({
  clearSessionAndRedirectToBlocked: jest.fn()
}));

describe('packageManage/pages/system-user-governance/system-user-governance', () => {
  let pageConfig;
  let systemService;
  let systemUserAccessState;
  let applySnapshotMock;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../packageManage/pages/system-user-governance/system-user-governance.js');
    });
  }

  function createPage() {
    return {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
    };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
    systemService = require('../../services/system-service');
    systemUserAccessState = require('../../utils/app/system-user-access-state');
    applySnapshotMock = jest.fn();

    global.wx = {
      showToast: jest.fn(),
      navigateBack: jest.fn()
    };
    global.getApp = jest.fn(() => ({
      globalData: {
        userService: {
          getLoginUser: jest.fn(() => ({
            userId: 'admin_1',
            isSystemReadonly: jest.fn(() => false),
            systemAccessLevel: 'normal'
          })),
          applySystemAccessLevelSnapshot: applySnapshotMock
        }
      }
    }));
    loadPageModule();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.Page;
    delete global.wx;
    delete global.getApp;
  });

  it('加载成功后应展示汇总与卡片列表', async () => {
    const page = createPage();
    systemService.listUserGovernance.mockResolvedValue({
      users: [
        {
          userId: 'user_1',
          nickname: '家长A',
          role: 'parent',
          familyPermissionRole: 'manager',
          isSystemAdmin: true,
          systemAccessLevel: 'normal',
          systemAccessUpdatedAt: '2026-04-26T12:00:00.000Z'
        },
        {
          userId: 'user_2',
          nickname: '家长B',
          role: 'parent',
          familyPermissionRole: 'viewer',
          isSystemAdmin: false,
          systemAccessLevel: 'readonly',
          systemAccessUpdatedAt: '2026-04-26T11:00:00.000Z'
        }
      ]
    });

    page.onLoad.call(page);
    await Promise.resolve();
    await Promise.resolve();

    expect(page.data.loading).toBe(false);
    expect(page.data.summary).toEqual({
      normal: 1,
      readonly: 1,
      blocked: 0
    });
    expect(page.data.users).toHaveLength(2);
    expect(page.data.users[0].accessLabel).toBe('只读');
  });

  it('更新自己为只读后应切换为只读展示态', async () => {
    const page = createPage();
    page.data.loginUserId = 'admin_1';
    page.data.users = [{
      userId: 'admin_1',
      systemAccessLevel: 'normal',
      canUpdate: true
    }];
    systemService.updateUserAccessLevel.mockResolvedValue({
      userId: 'admin_1',
      systemAccessLevel: 'readonly',
      systemAccessUpdatedAt: '2026-04-26 12:00:00',
      systemAccessUpdatedByUserId: 'admin_1'
    });
    jest.spyOn(page, 'loadUsers').mockResolvedValue();

    await page.onAccessLevelTap.call(page, {
      currentTarget: {
        dataset: {
          userId: 'admin_1',
          accessLevel: 'readonly'
        }
      }
    });

    expect(page.data.isSelfReadonly).toBe(true);
    expect(applySnapshotMock).toHaveBeenCalled();
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '已更新',
      icon: 'success'
    });
  });

  it('更新自己为禁入后应立即清会话并跳阻断页', async () => {
    const page = createPage();
    page.data.loginUserId = 'admin_1';
    page.data.users = [{
      userId: 'admin_1',
      systemAccessLevel: 'normal',
      canUpdate: true
    }];
    systemService.updateUserAccessLevel.mockResolvedValue({
      userId: 'admin_1',
      systemAccessLevel: 'blocked',
      systemAccessUpdatedAt: '2026-04-26 12:00:00',
      systemAccessUpdatedByUserId: 'admin_1'
    });

    await page.onAccessLevelTap.call(page, {
      currentTarget: {
        dataset: {
          userId: 'admin_1',
          accessLevel: 'blocked'
        }
      }
    });

    expect(systemUserAccessState.clearSessionAndRedirectToBlocked).toHaveBeenCalled();
  });
});
