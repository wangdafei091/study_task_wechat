const logger = require('../../utils/logger');
const appAccessState = require('../../utils/app/app-access-state');
const onboardingState = require('../../utils/app/onboarding-state');
const inviteService = require('../../services/invite-service');

const PAGE_MODE = {
  MANUAL_INPUT: 'manual_input',
  SHARE_PENDING_LOGIN: 'share_pending_login',
  CONFIRM_JOIN_FAMILY: 'confirm_join_family',
  NO_ACTION_NEEDED: 'no_action_needed'
};

function buildInitialState(reason, options = {}) {
  return {
    mode: options.mode || PAGE_MODE.MANUAL_INPUT,
    inviteCode: appAccessState.normalizeInviteCode(
      options.inviteCode || appAccessState.loadPendingInviteCode()
    ),
    previewLoading: false,
    previewResult: null,
    title: '请输入邀请码',
    subtitle: '邀请码可由系统管理员或已有用户提供，输入后继续。',
    primaryButtonText: '继续',
    secondaryButtonText: '',
    errorMessage: appAccessState.isInviteError({ code: reason })
      ? appAccessState.getInviteErrorMessage(reason)
      : '',
    submitting: false
  };
}

Page({
  data: buildInitialState(''),

  onLoad(options = {}) {
    const normalizedMode = Object.values(PAGE_MODE).includes(options.mode)
      ? options.mode
      : PAGE_MODE.MANUAL_INPUT;
    const initialInviteCode = options.inviteCode || '';
    const hasInviteCode = Boolean(appAccessState.normalizeInviteCode(initialInviteCode));
    const initialMode = normalizedMode !== PAGE_MODE.MANUAL_INPUT && !hasInviteCode
      ? PAGE_MODE.MANUAL_INPUT
      : normalizedMode;

    this.setData(buildInitialState(options.reason || '', {
      mode: initialMode,
      inviteCode: initialInviteCode
    }));

    if (hasInviteCode) {
      this.loadInvitePreview(this.data.inviteCode, { preferMode: initialMode });
    }
  },

  onInput(e) {
    this.setData({
      inviteCode: appAccessState.normalizeInviteCode(e.detail.value),
      errorMessage: ''
    });
  },

  buildModeView(mode, previewResult = {}) {
    if (mode === PAGE_MODE.SHARE_PENDING_LOGIN) {
      if (previewResult.purpose === 'family_invite') {
        return {
          mode,
          title: '确认邀请码',
          subtitle: previewResult.familyName
            ? `继续后会进入小程序，并加入“${previewResult.familyName}”。`
            : '继续后会进入小程序，并加入邀请家庭。',
          primaryButtonText: '确认并继续',
          secondaryButtonText: '重新输入'
        };
      }

      return {
        mode,
        title: '确认邀请码',
        subtitle: '继续后即可进入小程序，之后可自己创建家庭或加入其他家庭。',
        primaryButtonText: '确认并继续',
        secondaryButtonText: '重新输入'
      };
    }

    if (mode === PAGE_MODE.CONFIRM_JOIN_FAMILY) {
      return {
        mode,
        title: '确认加入家庭',
        subtitle: previewResult.familyName
          ? `确认后会加入“${previewResult.familyName}”。`
          : '确认后会加入邀请家庭。',
        primaryButtonText: '确认加入',
        secondaryButtonText: '取消'
      };
    }

    if (mode === PAGE_MODE.NO_ACTION_NEEDED) {
      return {
        mode,
        title: '当前无需继续',
        subtitle: previewResult.currentActionMessage || '当前邀请码无需继续处理。',
        primaryButtonText: '返回首页',
        secondaryButtonText: '重新输入'
      };
    }

    return {
      mode: PAGE_MODE.MANUAL_INPUT,
      title: '请输入邀请码',
      subtitle: '邀请码可由系统管理员或已有用户提供，输入后继续。',
      primaryButtonText: '继续',
      secondaryButtonText: ''
    };
  },

  async loadInvitePreview(inviteCode, options = {}) {
    const normalizedCode = appAccessState.normalizeInviteCode(inviteCode);
    if (!normalizedCode) {
      return;
    }

    this.setData({
      previewLoading: true,
      errorMessage: ''
    });

    try {
      const previewResult = await inviteService.previewInviteCode(normalizedCode);
      this.applyPreviewResult(previewResult, options);
    } catch (error) {
      logger.error('AccessGate', '预览邀请码失败', error);
      this.setData({
        previewLoading: false,
        errorMessage: error?.message || '网络异常，请稍后再试'
      });
    }
  },

  applyPreviewResult(previewResult = {}, options = {}) {
    const currentAction = previewResult.currentAction || 'invalid';
    const isLoggedIn = Boolean(getApp()?.globalData?.userService?.getLoginUser?.());
    let nextMode = PAGE_MODE.NO_ACTION_NEEDED;

    if (currentAction === 'enter_app' || (!isLoggedIn && currentAction === 'join_family')) {
      nextMode = PAGE_MODE.SHARE_PENDING_LOGIN;
      appAccessState.savePendingInviteCode(previewResult.inviteCode || this.data.inviteCode);
    } else if (currentAction === 'join_family') {
      nextMode = PAGE_MODE.CONFIRM_JOIN_FAMILY;
    }

    if (options.preferMode === PAGE_MODE.MANUAL_INPUT && currentAction === 'invalid') {
      this.setData({
        previewLoading: false,
        previewResult,
        errorMessage: previewResult.currentActionMessage || '邀请码无效，请检查后重试'
      });
      return;
    }

    this.setData({
      ...this.buildModeView(nextMode, previewResult),
      inviteCode: previewResult.inviteCode || this.data.inviteCode,
      previewLoading: false,
      previewResult,
      errorMessage: nextMode === PAGE_MODE.NO_ACTION_NEEDED && currentAction === 'invalid'
        ? previewResult.currentActionMessage || ''
        : ''
    });
  },

  async onSubmit() {
    const inviteCode = appAccessState.normalizeInviteCode(this.data.inviteCode);
    if (!inviteCode) {
      this.setData({
        errorMessage: appAccessState.getInviteErrorMessage(appAccessState.INVITE_ERROR_CODE.REQUIRED)
      });
      return;
    }

    this.setData({
      submitting: true,
      errorMessage: ''
    });

    try {
      await this.loadInvitePreview(inviteCode, {
        preferMode: PAGE_MODE.MANUAL_INPUT
      });
    } finally {
      this.setData({
        submitting: false
      });
    }
  },

  async confirmGuestInvite() {
    const inviteCode = appAccessState.normalizeInviteCode(this.data.inviteCode);
    if (!inviteCode) {
      return;
    }

    this.setData({
      submitting: true,
      errorMessage: ''
    });

    try {
      const app = getApp();
      appAccessState.savePendingInviteCode(inviteCode);
      const loginSuccess = await app.doCloudLogin({
        throwOnAdmissionError: true,
        suppressFailureModal: true,
        inviteCode
      });

      if (loginSuccess) {
        const onboardingSource = this.data.previewResult?.purpose === 'family_invite'
          ? onboardingState.ONBOARDING_SOURCE.INVITE_JOIN_FAMILY
          : onboardingState.ONBOARDING_SOURCE.GUEST_INVITE_ENTERED;
        onboardingState.setPendingOnboardingContext(app, {
          source: onboardingSource,
          inviteCode
        });
        wx.reLaunch({
          url: '/pages/index/index'
        });
      }
    } catch (error) {
      logger.error('AccessGate', '通过邀请码进入失败', error);
      if (appAccessState.isInviteError(error)) {
        this.applyPreviewResult({
          inviteCode,
          purpose: this.data.previewResult?.purpose || null,
          familyName: this.data.previewResult?.familyName || null,
          targetRole: this.data.previewResult?.targetRole || null,
          currentAction: 'invalid',
          currentActionMessage: appAccessState.getInviteErrorMessage(error)
        });
      } else {
        this.setData({
          errorMessage: error?.message || '网络异常，请稍后再试'
        });
      }
    } finally {
      this.setData({
        submitting: false
      });
    }
  },

  async confirmJoinFamily() {
    const inviteCode = appAccessState.normalizeInviteCode(this.data.inviteCode);
    if (!inviteCode) {
      return;
    }

    this.setData({
      submitting: true,
      errorMessage: ''
    });

    try {
      const userService = getApp()?.globalData?.userService;
      const result = await userService?.joinFamily?.(inviteCode);
      if (result?.success) {
        onboardingState.setPendingOnboardingContext(getApp(), {
          source: onboardingState.ONBOARDING_SOURCE.INVITE_JOIN_FAMILY,
          inviteCode
        });
        appAccessState.clearPendingInviteCode();
        wx.reLaunch({
          url: '/pages/index/index'
        });
        return;
      }

      this.setData({
        errorMessage: result?.message || '加入失败，请稍后再试'
      });
    } catch (error) {
      logger.error('AccessGate', '加入家庭失败', error);
      this.setData({
        errorMessage: error?.message || '加入失败，请稍后再试'
      });
    } finally {
      this.setData({
        submitting: false
      });
    }
  },

  async onPrimaryTap() {
    if (this.data.mode === PAGE_MODE.MANUAL_INPUT) {
      await this.onSubmit();
      return;
    }

    if (this.data.mode === PAGE_MODE.SHARE_PENDING_LOGIN) {
      await this.confirmGuestInvite();
      return;
    }

    if (this.data.mode === PAGE_MODE.CONFIRM_JOIN_FAMILY) {
      await this.confirmJoinFamily();
      return;
    }

    this.returnToIndex();
  },

  onSecondaryTap() {
    if (this.data.mode === PAGE_MODE.CONFIRM_JOIN_FAMILY) {
      this.navigateBack();
      return;
    }

    appAccessState.clearPendingInviteCode();
    this.setData({
      ...this.buildModeView(PAGE_MODE.MANUAL_INPUT),
      previewResult: null,
      errorMessage: ''
    });
  },

  navigateBack() {
    if (typeof getCurrentPages === 'function') {
      const pages = getCurrentPages();
      if (Array.isArray(pages) && pages.length > 1) {
        wx.navigateBack({ delta: 1 });
        return;
      }
    }

    this.returnToIndex();
  },

  returnToIndex() {
    wx.reLaunch({
      url: '/pages/index/index'
    });
  }
});
