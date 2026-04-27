const systemService = require('../../../services/system-service');
const API_CONFIG = require('../../../utils/api-config');

function buildQuotaDialogStyle(keyboardHeight) {
  const normalizedHeight = Number(keyboardHeight) || 0;
  if (normalizedHeight <= 0) {
    return '';
  }

  return `bottom: ${normalizedHeight}px;`;
}

function normalizeQuotaInput(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return { ok: true, value: null };
  }

  const normalizedValue = Number(rawValue);
  if (!Number.isInteger(normalizedValue) || normalizedValue < 0) {
    return {
      ok: false,
      message: '请输入大于等于 0 的整数'
    };
  }

  return {
    ok: true,
    value: normalizedValue
  };
}

Page({
  data: {
    loading: true,
    appAccessMode: 'open',
    modeSource: '',
    updatedAt: '',
    updatedByUserId: '',
    inviteGovernance: null,
    saving: false,
    governanceEnabled: API_CONFIG.ENABLE_API === true,
    isSystemReadonly: false,
    showQuotaDialog: false,
    quotaInput: '',
    quotaDialogError: '',
    quotaDialogKeyboardHeight: 0,
    quotaDialogStyle: '',
    loadErrorCode: '',
    loadErrorMessage: ''
  },

  onLoad() {
    this.refreshReadonlyState();
    this.loadOverview();
  },

  async onShow() {
    const app = typeof getApp === 'function' ? getApp() : null;
    if (typeof app?.waitForSystemAccessRefresh === 'function') {
      const canContinue = await app.waitForSystemAccessRefresh();
      if (canContinue === false) {
        return;
      }
    }

    this.refreshReadonlyState();
  },

  handleSystemAdminRequired() {
    wx.showToast({ title: '仅系统管理员可访问', icon: 'none' });
    setTimeout(() => {
      wx.navigateBack({ delta: 1 });
    }, 300);
  },

  setOverviewError(error = {}) {
    this.setData({
      loading: false,
      saving: false,
      appAccessMode: '',
      modeSource: '',
      updatedAt: '',
      updatedByUserId: '',
      inviteGovernance: null,
      showQuotaDialog: false,
      quotaInput: '',
      quotaDialogError: '',
      quotaDialogKeyboardHeight: 0,
      quotaDialogStyle: '',
      loadErrorCode: error.code || 'SYSTEM_OVERVIEW_FAILED',
      loadErrorMessage: error.message || '加载失败'
    });
  },

  onRetryTap() {
    this.refreshReadonlyState();
    this.loadOverview();
  },

  noop() {},

  openInviteQuotaDialog() {
    this.setData({
      showQuotaDialog: true,
      quotaInput: this.data.inviteGovernance?.quotaTotal === null
        ? ''
        : String(this.data.inviteGovernance?.quotaTotal || ''),
      quotaDialogError: '',
      quotaDialogKeyboardHeight: 0,
      quotaDialogStyle: ''
    });
  },

  closeInviteQuotaDialog() {
    if (this.data.saving) {
      return;
    }

    this.setData({
      showQuotaDialog: false,
      quotaInput: '',
      quotaDialogError: '',
      quotaDialogKeyboardHeight: 0,
      quotaDialogStyle: ''
    });
  },

  onQuotaInput(e) {
    this.setData({
      quotaInput: e.detail?.value || '',
      quotaDialogError: ''
    });
  },

  onQuotaKeyboardHeightChange(e) {
    const keyboardHeight = Math.max(0, Number(e?.detail?.height) || 0);
    this.setData({
      quotaDialogKeyboardHeight: keyboardHeight,
      quotaDialogStyle: buildQuotaDialogStyle(keyboardHeight)
    });
  },

  onQuotaInputBlur() {
    this.setData({
      quotaDialogKeyboardHeight: 0,
      quotaDialogStyle: ''
    });
  },

  async onQuotaDialogConfirm() {
    if (this.data.saving) {
      return;
    }

    const normalized = normalizeQuotaInput(this.data.quotaInput);
    if (!normalized.ok) {
      this.setData({ quotaDialogError: normalized.message });
      return;
    }

    this.setData({ saving: true });
    try {
      const result = await systemService.updateInviteGovernance(normalized.value);
      this.setData({
        saving: false,
        inviteGovernance: result,
        showQuotaDialog: false,
        quotaDialogError: '',
        quotaDialogKeyboardHeight: 0,
        quotaDialogStyle: ''
      });
      wx.showToast({ title: '已更新', icon: 'success' });
    } catch (error) {
      this.setData({ saving: false });
      if (error?.code === 'SYSTEM_ADMIN_REQUIRED') {
        this.handleSystemAdminRequired();
        return;
      }
      wx.showToast({ title: error?.message || '更新失败', icon: 'none' });
    }
  },

  refreshReadonlyState() {
    const userService = getApp()?.globalData?.userService;
    const loginUser = userService?.getLoginUser?.() || null;
    const isSystemReadonly = Boolean(loginUser && (
      (typeof loginUser.isSystemReadonly === 'function' && loginUser.isSystemReadonly()) ||
      loginUser.systemAccessLevel === 'readonly'
    ));

    this.setData({ isSystemReadonly });
  },

  async loadOverview() {
    this.setData({
      loading: true,
      loadErrorCode: '',
      loadErrorMessage: ''
    });
    try {
      const result = await systemService.getOverview();
      this.setData({
        loading: false,
        appAccessMode: result?.appAccessMode || 'open',
        modeSource: this.formatModeSource(result?.modeSource),
        updatedAt: this.formatUpdatedAt(result?.updatedAt),
        updatedByUserId: result?.updatedByUserId || '系统默认',
        inviteGovernance: result?.admissionInviteGovernance || null,
        loadErrorCode: '',
        loadErrorMessage: ''
      });
    } catch (error) {
      const code = error?.code || '';
      if (code === 'SYSTEM_ADMIN_REQUIRED') {
        this.setData({ loading: false });
        this.handleSystemAdminRequired();
        return;
      }

      this.setOverviewError(error);
    }
  },

  formatModeSource(source) {
    if (source === 'db') {
      return '数据库配置';
    }
    if (source === 'env') {
      return '环境变量兜底';
    }
    return '默认开放';
  },

  formatUpdatedAt(updatedAt) {
    if (!updatedAt) {
      return '暂无';
    }
    return String(updatedAt).replace('T', ' ').replace(/\.\d{3}Z$/, '');
  },

  async onModeChange(e) {
    const nextMode = e.currentTarget.dataset.mode;
    if (!nextMode || nextMode === this.data.appAccessMode || this.data.saving) {
      return;
    }

    if (this.data.isSystemReadonly) {
      wx.showToast({
        title: '当前账号为只读，仅可查看',
        icon: 'none'
      });
      return;
    }

    this.setData({ saving: true });
    try {
      const result = await systemService.updateAppAccessMode(nextMode);
      this.setData({
        saving: false,
        appAccessMode: result?.appAccessMode || nextMode,
        modeSource: this.formatModeSource(result?.modeSource),
        updatedAt: this.formatUpdatedAt(result?.updatedAt),
        updatedByUserId: result?.updatedByUserId || '当前管理员',
        inviteGovernance: this.data.inviteGovernance,
        loadErrorCode: '',
        loadErrorMessage: ''
      });
      wx.showToast({ title: '已更新', icon: 'success' });
    } catch (error) {
      this.setData({ saving: false });
      if (error?.code === 'SYSTEM_ADMIN_REQUIRED') {
        this.handleSystemAdminRequired();
        return;
      }
      wx.showToast({ title: error?.message || '更新失败', icon: 'none' });
    }
  },

  async onInviteGovernanceTap() {
    if (this.data.isSystemReadonly) {
      wx.showToast({
        title: '当前账号为只读，仅可查看',
        icon: 'none'
      });
      return;
    }

    this.openInviteQuotaDialog();
  },

  onUserGovernanceTap() {
    if (!this.data.governanceEnabled) {
      wx.showToast({
        title: '仅云端模式可用',
        icon: 'none'
      });
      return;
    }

    wx.navigateTo({
      url: '/packageManage/pages/system-user-governance/system-user-governance'
    });
  }
});
