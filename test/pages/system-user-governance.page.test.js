jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../services/system-service', () => ({
  listUserGovernance: jest.fn(),
  updateUserAccessLevel: jest.fn(),
  updateUserAdmissionIssuer: jest.fn()
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

  it('加载成功后应展示汇总、列表并默认选中第一位用户', async () => {
    const page = createPage();
    systemService.listUserGovernance.mockResolvedValue({
      users: [
        {
          userId: 'user_1',
          nickname: '家长A',
          role: 'parent',
          familyPermissionRole: 'manager',
          isSystemAdmin: false,
          canIssueAdmissionCode: true,
          admissionCodeQuotaTotal: 3,
          admissionCodeQuotaUsed: 1,
          admissionCodeQuotaRemaining: 2,
          systemAccessLevel: 'normal',
          systemAccessUpdatedAt: '2026-04-26T12:00:00.000Z'
        },
        {
          userId: 'user_2',
          nickname: '家长B',
          role: 'parent',
          familyPermissionRole: 'viewer',
          isSystemAdmin: false,
          canIssueAdmissionCode: false,
          admissionCodeQuotaTotal: null,
          admissionCodeQuotaUsed: 0,
          admissionCodeQuotaRemaining: null,
          systemAccessLevel: 'readonly',
          systemAccessUpdatedAt: '2026-04-26T11:00:00.000Z'
        }
      ],
      summary: {
        normal: 1,
        readonly: 1,
        blocked: 0
      },
      nextCursor: '',
      hasMore: false
    });

    page.onLoad.call(page);
    await Promise.resolve();
    await Promise.resolve();

    expect(systemService.listUserGovernance).toHaveBeenCalledWith({});
    expect(page.data.loading).toBe(false);
    expect(page.data.summary).toEqual({
      normal: 1,
      readonly: 1,
      blocked: 0
    });
    expect(page.data.users).toHaveLength(2);
    expect(page.data.selectedUserId).toBe('user_2');
    expect(page.data.selectedUser.userId).toBe('user_2');
  });

  it('搜索和筛选时应携带查询参数重新加载', async () => {
    const page = createPage();
    systemService.listUserGovernance.mockResolvedValue({
      users: [],
      summary: { normal: 0, readonly: 0, blocked: 0 },
      nextCursor: '',
      hasMore: false
    });

    page.onKeywordInput.call(page, {
      detail: {
        value: '家长A'
      }
    });
    page.onSearchTap.call(page);
    await Promise.resolve();

    expect(systemService.listUserGovernance).toHaveBeenLastCalledWith({
      keyword: '家长A'
    });

    page.onFilterTap.call(page, {
      currentTarget: {
        dataset: {
          group: 'canIssueAdmissionCode',
          value: 'true'
        }
      }
    });
    await Promise.resolve();

    expect(systemService.listUserGovernance).toHaveBeenLastCalledWith({
      keyword: '家长A',
      canIssueAdmissionCode: 'true'
    });
  });

  it('更新自己为只读后应本地重算而不是重新拉整页', async () => {
    const page = createPage();
    page.data.loginUserId = 'admin_1';
    page.rawUsers = [
      {
        userId: 'admin_1',
        nickname: '管理员',
        role: 'parent',
        isSystemAdmin: true,
        familyPermissionRole: 'manager',
        canIssueAdmissionCode: false,
        admissionCodeQuotaTotal: null,
        admissionCodeQuotaUsed: 0,
        admissionCodeQuotaRemaining: null,
        systemAccessLevel: 'normal',
        systemAccessUpdatedAt: '2026-04-26T12:00:00.000Z'
      },
      {
        userId: 'admin_2',
        nickname: '管理员B',
        role: 'parent',
        isSystemAdmin: true,
        familyPermissionRole: 'manager',
        canIssueAdmissionCode: false,
        admissionCodeQuotaTotal: null,
        admissionCodeQuotaUsed: 0,
        admissionCodeQuotaRemaining: null,
        systemAccessLevel: 'normal',
        systemAccessUpdatedAt: '2026-04-26T11:00:00.000Z'
      }
    ];
    page.rebuildViewState.call(page, {
      preferredSelectedUserId: 'admin_1',
      summary: {
        normal: 2,
        readonly: 0,
        blocked: 0
      }
    });
    systemService.updateUserAccessLevel.mockResolvedValue({
      userId: 'admin_1',
      systemAccessLevel: 'readonly',
      systemAccessUpdatedAt: '2026-04-26 12:30:00',
      systemAccessUpdatedByUserId: 'admin_1'
    });
    const loadUsersSpy = jest.spyOn(page, 'loadUsers');

    await page.onAccessLevelTap.call(page, {
      currentTarget: {
        dataset: {
          userId: 'admin_1',
          accessLevel: 'readonly'
        }
      }
    });

    expect(loadUsersSpy).not.toHaveBeenCalled();
    expect(page.data.isSelfReadonly).toBe(true);
    expect(page.data.summary).toEqual({
      normal: 1,
      readonly: 1,
      blocked: 0
    });
    expect(page.data.selectedUser.accessLabel).toBe('只读');
    expect(applySnapshotMock).toHaveBeenCalled();
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

  it('允许用户发新用户邀请码时应调用治理接口并本地更新', async () => {
    const page = createPage();
    page.rawUsers = [{
      userId: 'user_1',
      nickname: '家长A',
      role: 'parent',
      familyPermissionRole: 'viewer',
      isSystemAdmin: false,
      canIssueAdmissionCode: false,
      admissionCodeQuotaTotal: null,
      admissionCodeQuotaUsed: 0,
      admissionCodeQuotaRemaining: null,
      systemAccessLevel: 'normal',
      systemAccessUpdatedAt: '2026-04-26T12:00:00.000Z'
    }];
    page.rebuildViewState.call(page, {
      preferredSelectedUserId: 'user_1',
      summary: {
        normal: 1,
        readonly: 0,
        blocked: 0
      }
    });
    systemService.updateUserAdmissionIssuer.mockResolvedValue({
      userId: 'user_1',
      canIssueAdmissionCode: true,
      admissionCodeQuotaTotal: 3
    });
    const loadUsersSpy = jest.spyOn(page, 'loadUsers');

    page.onEnableAdmissionIssuerTap.call(page, {
      currentTarget: {
        dataset: {
          userId: 'user_1'
        }
      }
    });
    expect(page.data.showQuotaDialog).toBe(true);

    page.onQuotaInput.call(page, {
      detail: {
        value: '3'
      }
    });
    await page.onQuotaDialogConfirm.call(page);

    expect(loadUsersSpy).not.toHaveBeenCalled();
    expect(systemService.updateUserAdmissionIssuer).toHaveBeenCalledWith('user_1', {
      canIssueAdmissionCode: true,
      admissionCodeQuotaTotal: 3
    });
    expect(page.data.showQuotaDialog).toBe(false);
    expect(page.data.selectedUser.canIssueAdmissionCodeEffective).toBe(true);
  });

  it('只读家长不应展示可编辑发码治理动作', async () => {
    const page = createPage();
    systemService.listUserGovernance.mockResolvedValue({
      users: [{
        userId: 'user_1',
        nickname: '只读家长',
        role: 'parent',
        isVirtual: false,
        systemAccessLevel: 'readonly',
        familyPermissionRole: 'viewer',
        isSystemAdmin: false,
        canIssueAdmissionCode: true,
        admissionCodeQuotaTotal: 3,
        admissionCodeQuotaUsed: 1,
        admissionCodeQuotaRemaining: 2,
        systemAccessUpdatedAt: '2026-04-26T11:00:00.000Z'
      }],
      summary: {
        normal: 0,
        readonly: 1,
        blocked: 0
      },
      nextCursor: '',
      hasMore: false
    });

    await page.loadUsers.call(page);

    expect(page.data.selectedUser.canGovernAdmissionIssuer).toBe(false);
    expect(page.data.selectedUser.admissionIssuerDisabledReason).toBe('该账号为只读，不支持生成新用户邀请码');
  });

  it('只读系统管理员应展示真实的禁用原因而不是默认可发说明', async () => {
    const page = createPage();
    systemService.listUserGovernance.mockResolvedValue({
      users: [{
        userId: 'admin_1',
        nickname: '只读管理员',
        role: 'parent',
        isVirtual: false,
        systemAccessLevel: 'readonly',
        familyPermissionRole: 'manager',
        isSystemAdmin: true,
        canIssueAdmissionCode: false,
        admissionCodeQuotaTotal: null,
        admissionCodeQuotaUsed: 0,
        admissionCodeQuotaRemaining: null,
        systemAccessUpdatedAt: '2026-04-26T11:00:00.000Z'
      }],
      summary: {
        normal: 0,
        readonly: 1,
        blocked: 0
      },
      nextCursor: '',
      hasMore: false
    });

    await page.loadUsers.call(page);

    expect(page.data.selectedUser.canGovernAdmissionIssuer).toBe(false);
    expect(page.data.selectedUser.admissionIssuerDisabledReason).toBe('该账号为只读，不支持生成新用户邀请码');
  });

  it('未配置额度的家长不应被识别为有效可发码', async () => {
    const page = createPage();
    systemService.listUserGovernance.mockResolvedValue({
      users: [{
        userId: 'user_1',
        nickname: '待补额度家长',
        role: 'parent',
        isVirtual: false,
        systemAccessLevel: 'normal',
        familyPermissionRole: 'viewer',
        isSystemAdmin: false,
        canIssueAdmissionCode: true,
        admissionCodeQuotaTotal: null,
        admissionCodeQuotaUsed: 0,
        admissionCodeQuotaRemaining: null,
        systemAccessUpdatedAt: '2026-04-26T11:00:00.000Z'
      }],
      summary: {
        normal: 1,
        readonly: 0,
        blocked: 0
      },
      nextCursor: '',
      hasMore: false
    });

    await page.loadUsers.call(page);

    expect(page.data.selectedUser.canIssueAdmissionCodeEffective).toBe(false);
    expect(page.data.selectedUser.inviteAbilityLabel).toBe('未配额度');
  });

  it('邀请码额度输入非法时不应调用治理接口', async () => {
    const page = createPage();
    page.rawUsers = [{
      userId: 'user_1',
      nickname: '家长A',
      role: 'parent',
      familyPermissionRole: 'viewer',
      isSystemAdmin: false,
      canIssueAdmissionCode: false,
      admissionCodeQuotaTotal: null,
      admissionCodeQuotaUsed: 0,
      admissionCodeQuotaRemaining: null,
      systemAccessLevel: 'normal',
      systemAccessUpdatedAt: '2026-04-26T12:00:00.000Z'
    }];
    page.rebuildViewState.call(page, {
      preferredSelectedUserId: 'user_1',
      summary: {
        normal: 1,
        readonly: 0,
        blocked: 0
      }
    });

    page.onEnableAdmissionIssuerTap.call(page, {
      currentTarget: {
        dataset: {
          userId: 'user_1'
        }
      }
    });
    page.onQuotaInput.call(page, {
      detail: {
        value: ''
      }
    });
    await page.onQuotaDialogConfirm.call(page);

    expect(systemService.updateUserAdmissionIssuer).not.toHaveBeenCalled();
    expect(page.data.quotaDialogError).toBe('请输入大于等于 0 的整数');
    expect(page.data.showQuotaDialog).toBe(true);
  });

  it('用户额度弹层应随键盘高度抬升，并在失焦后复位', () => {
    const page = createPage();

    page.onQuotaKeyboardHeightChange.call(page, {
      detail: {
        height: 188
      }
    });

    expect(page.data.quotaDialogKeyboardHeight).toBe(188);
    expect(page.data.quotaDialogStyle).toBe('bottom: 188px;');

    page.onQuotaInputBlur.call(page);

    expect(page.data.quotaDialogKeyboardHeight).toBe(0);
    expect(page.data.quotaDialogStyle).toBe('');
  });
});
