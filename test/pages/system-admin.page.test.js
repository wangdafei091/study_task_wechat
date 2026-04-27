jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../services/system-service', () => ({
  getOverview: jest.fn(),
  updateAppAccessMode: jest.fn(),
  updateInviteGovernance: jest.fn()
}));

jest.mock('../../utils/api-config', () => ({
  ENABLE_API: true
}));

describe('packageManage/pages/system-admin/system-admin', () => {
  let pageConfig;
  let systemService;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../packageManage/pages/system-admin/system-admin.js');
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
    global.wx = {
      showToast: jest.fn(),
      navigateBack: jest.fn(),
      navigateTo: jest.fn()
    };
    global.getApp = jest.fn(() => ({
      globalData: {
        userService: {
          getLoginUser: jest.fn(() => ({
            userId: 'admin_1',
            isSystemReadonly: jest.fn(() => false),
            systemAccessLevel: 'normal'
          }))
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

  it('加载成功后应展示系统概览', async () => {
    const page = createPage();
    systemService.getOverview.mockResolvedValue({
      appAccessMode: 'invite_only',
      modeSource: 'db',
      updatedAt: '2026-04-25 12:00:00',
      updatedByUserId: 'admin_1'
    });

    await page.loadOverview.call(page);

    expect(page.data.loading).toBe(false);
    expect(page.data.appAccessMode).toBe('invite_only');
    expect(page.data.modeSource).toBe('数据库配置');
    expect(page.data.loadErrorCode).toBe('');
  });

  it('系统管理员缺失时应提示并返回上一页', async () => {
    const page = createPage();
    systemService.getOverview.mockRejectedValue({
      code: 'SYSTEM_ADMIN_REQUIRED'
    });

    await page.loadOverview.call(page);

    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '仅系统管理员可访问',
      icon: 'none'
    });
    jest.runAllTimers();
    expect(global.wx.navigateBack).toHaveBeenCalledWith({ delta: 1 });
  });

  it('切换准入模式成功后应刷新页面状态', async () => {
    const page = createPage();
    page.data.appAccessMode = 'open';
    systemService.updateAppAccessMode.mockResolvedValue({
      appAccessMode: 'invite_only',
      modeSource: 'db',
      updatedAt: '2026-04-25 13:00:00',
      updatedByUserId: 'admin_1'
    });

    await page.onModeChange.call(page, {
      currentTarget: {
        dataset: {
          mode: 'invite_only'
        }
      }
    });

    expect(page.data.appAccessMode).toBe('invite_only');
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '已更新',
      icon: 'success'
    });
  });

  it('概览加载失败时应进入错误态而不是展示默认开放制', async () => {
    const page = createPage();
    systemService.getOverview.mockRejectedValue({
      message: '网络异常'
    });

    await page.loadOverview.call(page);

    expect(page.data.loading).toBe(false);
    expect(page.data.appAccessMode).toBe('');
    expect(page.data.loadErrorCode).toBe('SYSTEM_OVERVIEW_FAILED');
    expect(page.data.loadErrorMessage).toBe('网络异常');
  });

  it('配置损坏时应进入修复态并允许通过保存恢复', async () => {
    const page = createPage();
    systemService.getOverview.mockRejectedValue({
      code: 'SYSTEM_SETTING_CORRUPTED',
      message: '系统准入配置异常，请重新设置'
    });
    systemService.updateAppAccessMode.mockResolvedValue({
      appAccessMode: 'invite_only',
      modeSource: 'db',
      updatedAt: '2026-04-25 13:00:00',
      updatedByUserId: 'admin_1'
    });

    await page.loadOverview.call(page);
    expect(page.data.appAccessMode).toBe('');
    expect(page.data.loadErrorCode).toBe('SYSTEM_SETTING_CORRUPTED');

    await page.onModeChange.call(page, {
      currentTarget: {
        dataset: {
          mode: 'invite_only'
        }
      }
    });

    expect(page.data.appAccessMode).toBe('invite_only');
    expect(page.data.loadErrorCode).toBe('');
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '已更新',
      icon: 'success'
    });
  });

  it('保存时若管理员资格被撤销应提示并返回上一页', async () => {
    const page = createPage();
    page.data.appAccessMode = 'open';
    systemService.updateAppAccessMode.mockRejectedValue({
      code: 'SYSTEM_ADMIN_REQUIRED'
    });

    await page.onModeChange.call(page, {
      currentTarget: {
        dataset: {
          mode: 'invite_only'
        }
      }
    });

    expect(page.data.saving).toBe(false);
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '仅系统管理员可访问',
      icon: 'none'
    });
    jest.runAllTimers();
    expect(global.wx.navigateBack).toHaveBeenCalledWith({ delta: 1 });
  });

  it('点击用户治理入口应进入治理页', () => {
    const page = createPage();

    page.onUserGovernanceTap.call(page);

    expect(global.wx.navigateTo).toHaveBeenCalledWith({
      url: '/packageManage/pages/system-user-governance/system-user-governance'
    });
  });

  it('系统只读时不应允许切换准入模式', async () => {
    const page = createPage();
    page.data.appAccessMode = 'open';
    page.data.isSystemReadonly = true;

    await page.onModeChange.call(page, {
      currentTarget: {
        dataset: {
          mode: 'invite_only'
        }
      }
    });

    expect(systemService.updateAppAccessMode).not.toHaveBeenCalled();
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '当前账号为只读，仅可查看',
      icon: 'none'
    });
  });

  it('应允许在系统页更新新用户邀请码全局总量', async () => {
    const page = createPage();
    page.data.inviteGovernance = {
      quotaTotal: 10,
      quotaUsed: 2,
      quotaRemaining: 8
    };
    systemService.updateInviteGovernance.mockResolvedValue({
      quotaTotal: 20,
      quotaUsed: 2,
      quotaRemaining: 18
    });

    await page.onInviteGovernanceTap.call(page);
    expect(page.data.showQuotaDialog).toBe(true);
    expect(page.data.quotaInput).toBe('10');

    page.onQuotaInput.call(page, {
      detail: {
        value: '20'
      }
    });
    await page.onQuotaDialogConfirm.call(page);

    expect(systemService.updateInviteGovernance).toHaveBeenCalledWith(20);
    expect(page.data.inviteGovernance).toEqual({
      quotaTotal: 20,
      quotaUsed: 2,
      quotaRemaining: 18
    });
    expect(page.data.showQuotaDialog).toBe(false);
  });

  it('全局总量输入非法时应停留在弹层内提示错误', async () => {
    const page = createPage();
    page.data.inviteGovernance = {
      quotaTotal: 10,
      quotaUsed: 2,
      quotaRemaining: 8
    };

    await page.onInviteGovernanceTap.call(page);
    page.onQuotaInput.call(page, {
      detail: {
        value: '-1'
      }
    });
    await page.onQuotaDialogConfirm.call(page);

    expect(systemService.updateInviteGovernance).not.toHaveBeenCalled();
    expect(page.data.quotaDialogError).toBe('请输入大于等于 0 的整数');
    expect(page.data.showQuotaDialog).toBe(true);
  });

  it('额度弹层应随键盘高度抬升，并在失焦后复位', () => {
    const page = createPage();

    page.onQuotaKeyboardHeightChange.call(page, {
      detail: {
        height: 216
      }
    });

    expect(page.data.quotaDialogKeyboardHeight).toBe(216);
    expect(page.data.quotaDialogStyle).toBe('bottom: 216px;');

    page.onQuotaInputBlur.call(page);

    expect(page.data.quotaDialogKeyboardHeight).toBe(0);
    expect(page.data.quotaDialogStyle).toBe('');
  });
});
