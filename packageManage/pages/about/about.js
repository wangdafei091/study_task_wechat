const systemService = require('../../../services/system-service');
const miniProgramEnv = require('../../../utils/mini-program-env');
const appMeta = require('../../../utils/app-meta');

const QR_CODE_IMAGE = '/packageManage/assets/about/mini-program-qrcode.png';
const VERSION_TAP_THRESHOLD = 7;
const VERSION_TAP_TIMEOUT = 2000;

Page({
  data: {
    appName: appMeta.appName,
    version: '',
    envVersionLabel: '',
    description: appMeta.description,
    showQrCode: false,
    qrCodeImage: QR_CODE_IMAGE,
    qrCodeHint: '',
    versionTapCount: 0
  },

  onLoad() {
    const accountInfo = typeof wx !== 'undefined' && wx && typeof wx.getAccountInfoSync === 'function'
      ? wx.getAccountInfoSync()
      : null;
    const miniProgramInfo = accountInfo?.miniProgram || {};
    const envVersion = miniProgramEnv.getEnvVersion();
    const showQrCode = miniProgramEnv.isReleaseEnv();

    this.setData({
      version: this._resolveVersion(miniProgramInfo),
      envVersionLabel: this._formatEnvLabel(envVersion),
      showQrCode,
      qrCodeHint: showQrCode ? '点击二维码可放大查看' : '二维码仅在正式环境提供'
    });
  },

  _resolveVersion(miniProgramInfo = {}) {
    const runtimeVersion = String(miniProgramInfo.version || '').trim();
    if (runtimeVersion && runtimeVersion !== '0.0.0') {
      return runtimeVersion;
    }

    const fallbackVersion = String(appMeta.version || '').trim();
    return fallbackVersion || '未标记版本';
  },

  _formatEnvLabel(envVersion) {
    if (envVersion === 'release') {
      return '正式版';
    }
    if (envVersion === 'trial') {
      return '体验版';
    }
    return '开发版';
  },

  onVersionTap() {
    const nextCount = Number(this.data.versionTapCount || 0) + 1;
    this.setData({ versionTapCount: nextCount });

    if (this._versionTapTimer) {
      clearTimeout(this._versionTapTimer);
    }
    this._versionTapTimer = setTimeout(() => {
      this.setData({ versionTapCount: 0 });
      this._versionTapTimer = null;
    }, VERSION_TAP_TIMEOUT);

    if (nextCount < VERSION_TAP_THRESHOLD) {
      return;
    }

    this.setData({ versionTapCount: 0 });
    clearTimeout(this._versionTapTimer);
    this._versionTapTimer = null;
    this._tryEnterSystemAdmin();
  },

  async _tryEnterSystemAdmin() {
    try {
      const result = await systemService.getBootstrap();
      if (!result?.canEnterSystemAdmin) {
        return;
      }

      wx.navigateTo({
        url: '/packageManage/pages/system-admin/system-admin'
      });
    } catch (error) {
      wx.showToast({
        title: '系统入口暂不可用',
        icon: 'none'
      });
    }
  },

  onQrcodeTap() {
    if (!this.data.showQrCode) {
      return;
    }

    wx.previewImage({
      current: this.data.qrCodeImage,
      urls: [this.data.qrCodeImage]
    });
  },

  onUnload() {
    if (this._versionTapTimer) {
      clearTimeout(this._versionTapTimer);
      this._versionTapTimer = null;
    }
  }
});
