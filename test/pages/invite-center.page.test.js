jest.mock('../../services/invite-service', () => ({
  getBootstrap: jest.fn(),
  getCurrentInviteSummary: jest.fn(),
  issueAdmissionCode: jest.fn(),
  issueFamilyCode: jest.fn()
}));

jest.mock('../../utils/api-config', () => ({
  ENABLE_API: true
}));

describe('packageManage/pages/invite-center/invite-center', () => {
  let pageConfig;
  let inviteService;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../packageManage/pages/invite-center/invite-center.js');
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
    inviteService = require('../../services/invite-service');
    global.wx = {
      showToast: jest.fn(),
      showModal: jest.fn(({ success }) => success({ confirm: true })),
      setClipboardData: jest.fn(({ success }) => success && success())
    };
    global.getApp = jest.fn(() => ({
      globalData: {
        userService: {
          getLoginUser: jest.fn(() => ({
            userId: 'parent_1',
            isSystemReadonly: jest.fn(() => false),
            systemAccessLevel: 'normal'
          }))
        }
      }
    }));
    loadPageModule();
  });

  afterEach(() => {
    delete global.Page;
    delete global.wx;
    delete global.getApp;
  });

  it('加载成功后应展示 bootstrap 与当前邀请码摘要', async () => {
    const page = createPage();
    inviteService.getBootstrap.mockResolvedValue({
      canIssueAdmissionCode: true,
      admissionCodeQuotaRemaining: 3,
      admissionGlobalQuotaRemaining: 8,
      availableFamilyInviteRoles: ['child', 'parent']
    });
    inviteService.getCurrentInviteSummary.mockResolvedValue({
      admissionCode: {
        code: 'U123456789',
        expiresAt: '2099-01-01T00:00:00.000Z'
      },
      familyInviteCodes: [{
        code: 'F123456789',
        targetRole: 'child',
        expiresAt: '2099-01-01T00:00:00.000Z'
      }]
    });

    await page.loadPageData.call(page);

    expect(page.data.loading).toBe(false);
    expect(page.data.bootstrap.canIssueAdmissionCode).toBe(true);
    expect(page.data.admissionInvite.code).toBe('U123456789');
    expect(page.data.familyInviteByRole.child.code).toBe('F123456789');
  });

  it('应兼容 MySQL DATETIME 格式的过期时间', async () => {
    const page = createPage();
    inviteService.getBootstrap.mockResolvedValue({
      canIssueAdmissionCode: true,
      admissionCodeQuotaRemaining: 3,
      admissionGlobalQuotaRemaining: 8,
      availableFamilyInviteRoles: ['child']
    });
    inviteService.getCurrentInviteSummary.mockResolvedValue({
      admissionCode: {
        code: 'U123456789',
        expiresAt: '2099-01-01 08:00:00'
      },
      familyInviteCodes: []
    });

    await page.loadPageData.call(page);

    expect(page.data.admissionInvite.expiresText).not.toBe('未设置有效期');
    expect(page.data.admissionInvite.expiresText).not.toBe('已过期');
  });

  it('刷新新用户邀请码时应局部更新当前邀请码而不是整页重载', async () => {
    const page = createPage();
    page.data.bootstrap = { canIssueAdmissionCode: true };
    page.data.admissionInvite = { code: 'UOLD000001' };
    page.loadPageData = jest.fn().mockResolvedValue();
    inviteService.issueAdmissionCode.mockResolvedValue({
      code: 'UNEW000001',
      expiresAt: '2099-01-01T00:00:00.000Z'
    });

    await page.onIssueAdmissionTap.call(page);

    expect(inviteService.issueAdmissionCode).toHaveBeenCalled();
    expect(page.loadPageData).not.toHaveBeenCalled();
    expect(page.data.admissionInvite.code).toBe('UNEW000001');
    expect(page.data.submittingAdmission).toBe(false);
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '已生成',
      icon: 'success'
    });
  });

  it('刷新家庭邀请码时应局部更新当前角色邀请码而不是整页重载', async () => {
    const page = createPage();
    page.data.bootstrap = {
      availableFamilyInviteRoles: ['child', 'parent']
    };
    page.data.activeFamilyInviteRole = 'child';
    page.data.familyInviteByRole = {
      child: { code: 'FOLD000001' },
      parent: null
    };
    page.loadPageData = jest.fn().mockResolvedValue();
    inviteService.issueFamilyCode.mockResolvedValue({
      code: 'FNEW000001',
      targetRole: 'child',
      expiresAt: '2099-01-01T00:00:00.000Z'
    });

    await page.onIssueFamilyTap.call(page, {
      currentTarget: {
        dataset: {
          role: 'child'
        }
      }
    });

    expect(inviteService.issueFamilyCode).toHaveBeenCalledWith('child');
    expect(page.loadPageData).not.toHaveBeenCalled();
    expect(page.data.familyInviteByRole.child.code).toBe('FNEW000001');
    expect(page.data.currentFamilyInvite.code).toBe('FNEW000001');
    expect(page.data.submittingFamilyRole).toBe('');
  });

  it('无家庭邀请码能力且服务端未返回家庭邀请码时，应隐藏家庭邀请码区块', async () => {
    const page = createPage();
    inviteService.getBootstrap.mockResolvedValue({
      canIssueAdmissionCode: false,
      canIssueFamilyInviteCode: false,
      admissionCodeQuotaRemaining: null,
      admissionGlobalQuotaRemaining: 8,
      availableFamilyInviteRoles: []
    });
    inviteService.getCurrentInviteSummary.mockResolvedValue({
      admissionCode: null,
      familyInviteCodes: []
    });

    await page.loadPageData.call(page);

    expect(page.data.showFamilyInviteSection).toBe(false);
  });
});
