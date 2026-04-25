const systemService = require('../../../services/system-service');

Page({
  data: {
    loading: true,
    appAccessMode: 'open',
    modeSource: '',
    updatedAt: '',
    updatedByUserId: '',
    saving: false,
    loadErrorCode: '',
    loadErrorMessage: ''
  },

  onLoad() {
    this.loadOverview();
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
    this.loadOverview();
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
  }
});
