jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../utils/app/app-access-state', () => ({
  INVITE_ERROR_CODE: {
    REQUIRED: 'INVITE_CODE_REQUIRED'
  },
  loadPendingInviteCode: jest.fn(() => 'UINVITE001'),
  savePendingInviteCode: jest.fn((value) => value),
  clearPendingInviteCode: jest.fn(),
  normalizeInviteCode: jest.fn((value) => String(value || '').trim().toUpperCase()),
  isInviteError: jest.fn((error) => /^AUTH_APP_ACCESS_CODE_|^INVITE_CODE_/.test(error.code || '')),
  getInviteErrorMessage: jest.fn((input) => {
    const code = typeof input === 'string' ? input : input.code;
    if (code === 'AUTH_APP_ACCESS_CODE_INVALID' || code === 'INVITE_CODE_INVALID') {
      return '邀请码无效，请检查后重试';
    }
    if (code === 'AUTH_APP_ACCESS_CODE_EXPIRED' || code === 'INVITE_CODE_EXPIRED') {
      return '邀请码已过期，请联系维护者重新获取';
    }
    if (code === 'INVITE_CODE_TARGET_ROLE_MISMATCH') {
      return '当前账号身份与该邀请码不匹配';
    }
    return '请输入邀请码';
  })
}));

jest.mock('../../services/invite-service', () => ({
  previewInviteCode: jest.fn()
}));

let mockCurrentToken = null;

jest.mock('../../utils/token-manager', () => ({
  getToken: jest.fn(() => mockCurrentToken),
  isAuthenticated: jest.fn(() => Boolean(mockCurrentToken))
}));

jest.mock('../../utils/app/onboarding-state', () => ({
  ONBOARDING_SOURCE: {
    INVITE_JOIN_FAMILY: 'invite_join_family',
    GUEST_INVITE_ENTERED: 'guest_invite_entered'
  },
  setPendingOnboardingContext: jest.fn()
}));

describe('pages/access-gate/access-gate', () => {
  let pageConfig;
  let appMock;
  let inviteService;
  let onboardingState;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../pages/access-gate/access-gate.js');
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
    onboardingState = require('../../utils/app/onboarding-state');
    appMock = {
      doCloudLogin: jest.fn(),
      globalData: {
        userService: null
      }
    };
    mockCurrentToken = null;

    global.getApp = jest.fn(() => appMock);
    global.getCurrentPages = jest.fn(() => [{ route: 'pages/access-gate/access-gate' }]);
    global.wx = {
      reLaunch: jest.fn(),
      navigateBack: jest.fn(),
      showModal: jest.fn(({ success }) => success({ confirm: true }))
    };

    loadPageModule();
  });

  afterEach(() => {
    delete global.Page;
    delete global.getApp;
    delete global.getCurrentPages;
    delete global.wx;
  });

  it('手工输入无效邀请码时应保留在输入态并展示错误', async () => {
    const page = createPage();
    inviteService.previewInviteCode.mockResolvedValue({
      inviteCode: 'BADCODE',
      currentAction: 'invalid',
      currentActionMessage: '邀请码无效，请检查后重试'
    });

    page.onLoad.call(page, {});
    page.onInput.call(page, { detail: { value: ' badcode ' } });
    await page.onPrimaryTap.call(page);

    expect(page.data.mode).toBe('manual_input');
    expect(page.data.errorMessage).toBe('邀请码无效，请检查后重试');
  });

  it('非手工模式缺少邀请码时应降级回手工输入态', () => {
    const page = createPage();

    page.onLoad.call(page, {
      mode: 'share_pending_login',
      inviteCode: '   '
    });

    expect(page.data.mode).toBe('manual_input');
    expect(inviteService.previewInviteCode).not.toHaveBeenCalled();
  });

  it('未登录用户输入家庭邀请码后应进入分享承接态，再确认登录', async () => {
    const page = createPage();
    let loginUser = null;
    appMock.globalData.userService = {
      getLoginUser: jest.fn(() => loginUser)
    };
    inviteService.previewInviteCode.mockResolvedValue({
      inviteCode: 'F123456789',
      purpose: 'family_invite',
      familyName: '测试家庭',
      targetRole: 'child',
      currentAction: 'join_family',
      currentActionMessage: '确认后即可进入并加入家庭',
      requiresProfileAuthorization: true
    });
    appMock.doCloudLogin.mockImplementationOnce(async () => {
      loginUser = {
        userId: 'user_1',
        name: '用户',
        avatar: ''
      };
      return true;
    });

    page.onLoad.call(page, {});
    page.onInput.call(page, { detail: { value: ' f123456789 ' } });
    await page.onPrimaryTap.call(page);

    expect(page.data.mode).toBe('share_pending_login');
    await page.onPrimaryTap.call(page);

    expect(appMock.doCloudLogin).toHaveBeenCalledWith({
      throwOnAdmissionError: true,
      suppressFailureModal: true,
      inviteCode: 'F123456789'
    });
    expect(onboardingState.setPendingOnboardingContext).toHaveBeenCalledWith(appMock, {
      source: 'invite_join_family',
      inviteCode: 'F123456789'
    });
    expect(global.wx.reLaunch).toHaveBeenCalledWith({
      url: '/pages/index/index'
    });
  });

  it('未登录用户通过新用户邀请码进入时应写入 guest_invite_entered 承接上下文', async () => {
    const page = createPage();
    let loginUser = null;
    appMock.globalData.userService = {
      getLoginUser: jest.fn(() => loginUser)
    };
    inviteService.previewInviteCode.mockResolvedValue({
      inviteCode: 'U123456789',
      purpose: 'admission_only',
      familyName: null,
      targetRole: null,
      currentAction: 'enter_app',
      currentActionMessage: '确认后即可进入小程序',
      requiresProfileAuthorization: false
    });
    appMock.doCloudLogin.mockImplementationOnce(async () => {
      loginUser = {
        userId: 'user_2',
        name: '新用户',
        avatar: ''
      };
      return true;
    });

    page.onLoad.call(page, {});
    page.onInput.call(page, { detail: { value: ' u123456789 ' } });
    await page.onPrimaryTap.call(page);
    await page.onPrimaryTap.call(page);

    expect(onboardingState.setPendingOnboardingContext).toHaveBeenCalledWith(appMock, {
      source: 'guest_invite_entered',
      inviteCode: 'U123456789'
    });
  });

  it('已登录用户打开家庭邀请码应进入确认加入态', async () => {
    const page = createPage();
    appMock.globalData.userService = {
      getLoginUser: jest.fn(() => ({ userId: 'parent_1' })),
      joinFamily: jest.fn().mockResolvedValue({ success: true })
    };
    inviteService.previewInviteCode.mockResolvedValue({
      inviteCode: 'F123456789',
      purpose: 'family_invite',
      familyName: '测试家庭',
      targetRole: 'parent',
      currentAction: 'join_family',
      currentActionMessage: '确认后即可加入该家庭'
    });

    page.onLoad.call(page, {
      mode: 'confirm_join_family',
      inviteCode: 'F123456789'
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(page.data.mode).toBe('confirm_join_family');
    await page.onPrimaryTap.call(page);
    expect(appMock.globalData.userService.joinFamily).toHaveBeenCalledWith('F123456789');
    expect(onboardingState.setPendingOnboardingContext).toHaveBeenCalledWith(appMock, {
      source: 'invite_join_family',
      inviteCode: 'F123456789'
    });
  });

  it('token 已存在但 userService 尚未恢复时，家庭邀请码仍应进入确认加入态', async () => {
    const page = createPage();
    mockCurrentToken = 'saved-token';
    inviteService.previewInviteCode.mockResolvedValue({
      inviteCode: 'F123456789',
      purpose: 'family_invite',
      familyName: '测试家庭',
      targetRole: 'parent',
      currentAction: 'join_family',
      currentActionMessage: '确认后即可加入该家庭',
      requiresProfileAuthorization: false
    });

    page.onLoad.call(page, {
      mode: 'share_pending_login',
      inviteCode: 'F123456789'
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(page.data.mode).toBe('confirm_join_family');
  });
});
