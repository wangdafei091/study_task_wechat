jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

describe('packageManage/pages/family-settings/family-settings', () => {
  let pageConfig;
  let appMock;

  function loadPageModule(options = {}) {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.doMock('../../utils/api-config', () => ({
      ENABLE_API: options.apiEnabled !== false
    }));

    jest.isolateModules(() => {
      require('../../packageManage/pages/family-settings/family-settings.js');
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

    appMock = {
      globalData: {
        userService: {
          getAllUsers: jest.fn(() => [{ userId: 'child_existing', role: 'child' }]),
          getFamilyInfo: jest.fn().mockResolvedValue({ data: null }),
          getLoginUser: jest.fn(() => null),
          getCurrentUser: jest.fn(() => null),
          refreshInviteCode: jest.fn(),
          updateFamilyMemberPermissionRole: jest.fn(),
          createVirtualMember: jest.fn().mockResolvedValue({
            success: true,
            member: { userId: 'child_new' }
          }),
          deleteFamilyMember: jest.fn().mockResolvedValue({
            success: true
          })
        }
      },
      getTaskService: jest.fn(() => null)
    };

    global.getApp = jest.fn(() => appMock);
    global.wx = {
      showToast: jest.fn(),
      navigateBack: jest.fn(),
      showModal: jest.fn(),
      navigateTo: jest.fn()
    };

    loadPageModule();
  });

  afterEach(() => {
    delete global.Page;
    delete global.getApp;
    delete global.wx;
  });

  it('添加孩子成功后应重新加载整页家庭数据，避免成员展示字段丢失', async () => {
    const page = createPage();
    page.data.canManageFamilyGovernance = true;
    page._loadFamilyData = jest.fn().mockResolvedValue();

    global.wx.showModal.mockImplementation(({ success }) => {
      success({
        confirm: true,
        content: '新孩子'
      });
    });

    await page.addVirtualMember.call(page);
    await Promise.resolve();

    expect(page._loadFamilyData).toHaveBeenCalled();
    expect(appMock.globalData.userService.createVirtualMember).toHaveBeenCalledWith('新孩子');
  });

  it('删除成员成功后应重新加载整页家庭数据，避免成员展示字段丢失', async () => {
    const page = createPage();
    page.data.canManageFamilyGovernance = true;
    page._loadFamilyData = jest.fn().mockResolvedValue();

    global.wx.showModal.mockImplementation(({ success }) => {
      success({ confirm: true });
    });

    await page.deleteMember.call(page, {
      currentTarget: {
        dataset: {
          userId: 'child_existing',
          name: '旧成员'
        }
      }
    });
    await Promise.resolve();

    expect(page._loadFamilyData).toHaveBeenCalled();
    expect(appMock.globalData.userService.deleteFamilyMember).toHaveBeenCalledWith('child_existing');
  });

  it('本地模式应使用 currentUser 回填家长自己，并默认展示为管理员', async () => {
    jest.resetModules();
    loadPageModule({ apiEnabled: false });
    const page = createPage();
    appMock.globalData.userService.getLoginUser = jest.fn(() => null);
    appMock.globalData.userService.getCurrentUser = jest.fn(() => ({
      userId: 'parent_local',
      name: '本地家长',
      role: 'parent',
      familyPermissionRole: null
    }));
    appMock.globalData.userService.storageAdapter = {
      get: jest.fn((key) => {
        if (key === 'localFamilyMembers') {
          return [{ userId: 'child_local', nickname: '孩子', role: 'child', isVirtual: true }];
        }
        return null;
      })
    };
    const members = await page._loadMembers.call(page);

    expect(members[0]).toEqual(expect.objectContaining({
      userId: 'parent_local',
      nickname: '本地家长',
      role: 'parent',
      familyPermissionRole: 'manager'
    }));
  });

  it('本地模式下刷新邀请码应直接拦截，不调用云端服务', async () => {
    const page = createPage();
    page.data.canManageInviteCode = false;
    page.data.inviteManagementDisabledReason = '本地模式下不提供邀请码';

    await page.refreshInviteCode.call(page);

    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '本地模式下不提供邀请码',
      icon: 'none'
    });
    expect(appMock.globalData.userService.refreshInviteCode).not.toHaveBeenCalled();
  });

  it('本地模式下调整家长权限应直接拦截，不调用云端服务', async () => {
    const page = createPage();
    page.data.supportsParentPermissionManagement = false;

    await page.onPermissionRoleTap.call(page, {
      currentTarget: {
        dataset: {
          userId: 'parent_2',
          role: 'viewer'
        }
      }
    });

    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '当前模式不支持调整家长权限',
      icon: 'none'
    });
    expect(appMock.globalData.userService.updateFamilyMemberPermissionRole).not.toHaveBeenCalled();
  });

  it('点击关于入口应跳转到关于页', () => {
    const page = createPage();

    page.navigateToAboutPage.call(page);

    expect(global.wx.navigateTo).toHaveBeenCalledWith({
      url: '/packageManage/pages/about/about'
    });
  });

  it('输入邀请码加入应跳转到统一 access-gate 页面', () => {
    const page = createPage();

    page.navigateToAccessGate.call(page);

    expect(global.wx.navigateTo).toHaveBeenCalledWith({
      url: '/pages/access-gate/access-gate?mode=manual_input'
    });
  });

  it('点击邀请码中心入口应跳转到邀请码中心页', () => {
    const page = createPage();
    page.data.canEnterInviteCenter = true;

    page.navigateToInviteCenter.call(page);

    expect(global.wx.navigateTo).toHaveBeenCalledWith({
      url: '/packageManage/pages/invite-center/invite-center'
    });
  });

  it('viewer 加载家庭数据时应展示禁用态和解释文案', async () => {
    jest.resetModules();
    loadPageModule({ apiEnabled: true });
    const page = createPage();
    appMock.globalData.userService.getFamilyInfo = jest.fn().mockResolvedValue({
      data: {
        familyId: 'fam_1',
        name: '测试家庭',
        inviteCode: 'INV12345',
        inviteCodeRole: 'parent',
        inviteCodeExpiresAt: '2099-01-01T00:00:00.000Z'
      }
    });
    appMock.globalData.userService.getLoginUser = jest.fn(() => ({
      userId: 'parent_viewer',
      name: '查看者家长',
      role: 'parent',
      familyId: 'fam_1',
      familyPermissionRole: 'viewer'
    }));
    appMock.globalData.userService.getCurrentUser = jest.fn(() => ({
      userId: 'parent_viewer',
      name: '查看者家长',
      role: 'parent',
      familyId: 'fam_1',
      familyPermissionRole: 'viewer'
    }));
    page._loadMembers = jest.fn().mockResolvedValue([
      { userId: 'parent_viewer', nickname: '查看者家长', role: 'parent', familyPermissionRole: 'viewer', isVirtual: false },
      { userId: 'child_1', nickname: '孩子', role: 'child', isVirtual: true }
    ]);

    await page._loadFamilyData.call(page);

    expect(page.data.canManageFamilyGovernance).toBe(false);
    expect(page.data.canManageInviteCode).toBe(false);
    expect(page.data.currentIdentityLabel).toBe('查看者');
    expect(page.data.currentIdentityDescription).toBe('可查看记录和进展，不能修改内容');
    expect(page.data.governanceDisabledReason).toBe('只有管理员可以邀请成员或调整权限');
    expect(page.data.inviteManagementDisabledReason).toBe('只有管理员可以刷新邀请码');
  });

  it('系统只读家长加载家庭数据时应展示系统级禁用原因', async () => {
    jest.resetModules();
    loadPageModule({ apiEnabled: true });
    const page = createPage();
    appMock.globalData.userService.getFamilyInfo = jest.fn().mockResolvedValue({
      data: {
        familyId: 'fam_1',
        name: '测试家庭',
        inviteCode: 'INV12345',
        inviteCodeRole: 'parent',
        inviteCodeExpiresAt: '2099-01-01T00:00:00.000Z'
      }
    });
    appMock.globalData.userService.getLoginUser = jest.fn(() => ({
      userId: 'parent_manager',
      name: '管理员家长',
      role: 'parent',
      familyId: 'fam_1',
      familyPermissionRole: 'manager',
      systemAccessLevel: 'readonly'
    }));
    appMock.globalData.userService.getCurrentUser = jest.fn(() => ({
      userId: 'parent_manager',
      name: '管理员家长',
      role: 'parent',
      familyId: 'fam_1',
      familyPermissionRole: 'manager',
      systemAccessLevel: 'readonly'
    }));
    page._loadMembers = jest.fn().mockResolvedValue([
      { userId: 'parent_manager', nickname: '管理员家长', role: 'parent', familyPermissionRole: 'manager', isVirtual: false },
      { userId: 'child_1', nickname: '孩子', role: 'child', isVirtual: true }
    ]);

    await page._loadFamilyData.call(page);

    expect(page.data.isSystemReadonly).toBe(true);
    expect(page.data.currentIdentityDescription).toBe('当前账号为只读，仅可查看家庭信息');
    expect(page.data.governanceDisabledReason).toBe('当前账号为只读，仅可查看家庭信息');
    expect(page.data.inviteManagementDisabledReason).toBe('当前账号为只读，不能刷新邀请码');
  });

  it('加载家庭数据时应兼容数据库时间格式的邀请码有效期', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-10T10:00:00+08:00'));

    try {
      jest.resetModules();
      loadPageModule({ apiEnabled: true });
      const page = createPage();
      appMock.globalData.userService.getFamilyInfo = jest.fn().mockResolvedValue({
        data: {
          familyId: 'fam_1',
          name: '测试家庭',
          inviteCode: 'INV12345',
          inviteCodeRole: 'parent',
          inviteCodeExpiresAt: '2026-04-10 14:58:43'
        }
      });
      appMock.globalData.userService.getLoginUser = jest.fn(() => ({
        userId: 'parent_manager',
        name: '管理员家长',
        role: 'parent',
        familyId: 'fam_1',
        familyPermissionRole: 'manager'
      }));
      appMock.globalData.userService.getCurrentUser = jest.fn(() => ({
        userId: 'parent_manager',
        name: '管理员家长',
        role: 'parent',
        familyId: 'fam_1',
        familyPermissionRole: 'manager'
      }));
      page._loadMembers = jest.fn().mockResolvedValue([]);

      await page._loadFamilyData.call(page);

      expect(page.data.inviteCodeExpiryText).toBe('约 5 小时后失效');
    } finally {
      jest.useRealTimers();
    }
  });

  it('viewer 点击添加孩子应被前端拦截并提示', async () => {
    const page = createPage();
    page.data.canManageFamilyGovernance = false;

    await page.addVirtualMember.call(page);

    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '当前为查看者，不能修改家庭设置',
      icon: 'none'
    });
    expect(appMock.globalData.userService.createVirtualMember).not.toHaveBeenCalled();
  });

  it('管理员调整家长权限成功后应刷新整页数据', async () => {
    const page = createPage();
    page.data.supportsParentPermissionManagement = true;
    page.data.canManageFamilyGovernance = true;
    page.data.members = [
      { userId: 'parent_2', familyPermissionRole: 'viewer' }
    ];
    page._loadFamilyData = jest.fn().mockResolvedValue();
    appMock.globalData.userService.updateFamilyMemberPermissionRole = jest.fn().mockResolvedValue({
      success: true
    });

    await page.onPermissionRoleTap.call(page, {
      currentTarget: {
        dataset: {
          userId: 'parent_2',
          role: 'manager'
        }
      }
    });

    expect(appMock.globalData.userService.updateFamilyMemberPermissionRole)
      .toHaveBeenCalledWith('parent_2', 'manager');
    expect(page._loadFamilyData).toHaveBeenCalled();
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '已设为管理员',
      icon: 'success'
    });
  });
});
