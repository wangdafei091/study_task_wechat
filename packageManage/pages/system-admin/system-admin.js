const systemService = require('../../../services/system-service');
const API_CONFIG = require('../../../utils/api-config');

Page({
  data: {
    loading: true,
    appAccessMode: 'open',
    modeSource: '',
    updatedAt: '',
    updatedByUserId: '',
    saving: false,
    governanceEnabled: API_CONFIG.ENABLE_API === true,
    isSystemReadonly: false,
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
      loadErrorCode: error.code || 'SYSTEM_OVERVIEW_FAILED',
      loadErrorMessage: error.message || '加载失败'
    });
  },

  onRetryTap() {
    this.refreshReadonlyState();
    this.loadOverview();
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
