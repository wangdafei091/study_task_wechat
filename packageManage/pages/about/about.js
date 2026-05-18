const systemService = require('../../../services/system-service');
const miniProgramEnv = require('../../../utils/mini-program-env');
const appMeta = require('../../../utils/app-meta');
const supportContact = require('../../../utils/support-contact');

const VERSION_TAP_THRESHOLD = 7;
const VERSION_TAP_TIMEOUT = 2000;

Page({
  data: {
    appName: appMeta.appName,
    version: '',
    envVersionLabel: '',
    description: appMeta.description,
    supportTitle: '',
    supportHint: '',
    supportResponseHint: '',
    supportWechatId: '',
    supportEmail: '',
    supportWechatQrImage: '',
    showSupportWechatId: false,
    showSupportEmail: false,
    showSupportWechatQr: false,
    versionTapCount: 0
  },

  onLoad() {
    const accountInfo = typeof wx !== 'undefined' && wx && typeof wx.getAccountInfoSync === 'function'
      ? wx.getAccountInfoSync()
      : null;
    const miniProgramInfo = accountInfo?.miniProgram || {};
    const envVersion = miniProgramEnv.getEnvVersion();
    const supportWechatId = String(supportContact.wechatId || '').trim();
    const supportEmail = String(supportContact.email || '').trim();
    const supportWechatQrImage = String(supportContact.wechatQrImage || '').trim();
    const supportHint = String(
      supportContact.supportHint || supportContact.defaultSupportHint || ''
    ).trim();
    const supportResponseHint = String(
      supportContact.supportResponseHint || supportContact.defaultSupportResponseHint || ''
    ).trim();
    const supportTitle = String(supportContact.supportTitle || '联系维护者').trim() || '联系维护者';

    this.setData({
      version: this._resolveVersion(miniProgramInfo),
      envVersionLabel: this._formatEnvLabel(envVersion),
      supportTitle,
      supportHint,
      supportResponseHint,
      supportWechatId,
      supportEmail,
      supportWechatQrImage,
      showSupportWechatId: Boolean(supportWechatId),
      showSupportEmail: Boolean(supportEmail),
      showSupportWechatQr: Boolean(supportWechatQrImage)
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

  onSupportWechatIdTap() {
    if (!this.data.showSupportWechatId) {
      return;
    }

    this._copyToClipboard(this.data.supportWechatId);
  },

  onSupportEmailTap() {
    if (!this.data.showSupportEmail) {
      return;
    }

    this._copyToClipboard(this.data.supportEmail);
  },

  onSupportQrcodeTap() {
    if (!this.data.showSupportWechatQr) {
      return;
    }

    wx.previewImage({
      current: this.data.supportWechatQrImage,
      urls: [this.data.supportWechatQrImage]
    });
  },

  _copyToClipboard(value) {
    const text = String(value || '').trim();
    if (!text) {
      return;
    }

    wx.setClipboardData({
      data: text
    });
  },

  onUnload() {
    if (this._versionTapTimer) {
      clearTimeout(this._versionTapTimer);
      this._versionTapTimer = null;
    }
  }
});
