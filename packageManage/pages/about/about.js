const systemService = require('../../../services/system-service');
const serviceManager = require('../../../services/service-manager');
const miniProgramEnv = require('../../../utils/mini-program-env');
const appMeta = require('../../../utils/app-meta');
const runtimeVersionUtils = require('../../../utils/runtime-version');
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
    versionTapCount: 0,
    showReleaseNotesEntry: false,
    releaseNoteEntryTitle: '近期变化',
    releaseNoteEntrySummary: '',
    releaseNoteEntryVersion: '',
    releaseNoteEntryBadgeText: ''
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

    const resolvedVersion = runtimeVersionUtils.resolveRuntimeVersion(miniProgramInfo);

    this.setData({
      version: resolvedVersion,
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

    this._loadReleaseNotesEntry();
  },

  _resolveVersion(miniProgramInfo = {}) {
    return runtimeVersionUtils.resolveRuntimeVersion(miniProgramInfo);
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

  onShow() {
    this._loadReleaseNotesEntry();
  },

  async _loadReleaseNotesEntry() {
    const releaseNoteService = serviceManager.getService('releaseNote');
    const app = typeof getApp === 'function' ? getApp() : null;
    const userService = app?.globalData?.userService || serviceManager.getUserService();

    if (!releaseNoteService) {
      this.setData({
        showReleaseNotesEntry: false,
        releaseNoteEntryTitle: '近期变化',
        releaseNoteEntrySummary: '',
        releaseNoteEntryVersion: '',
        releaseNoteEntryBadgeText: ''
      });
      return;
    }

    const context = {
      loginUser: userService?.getLoginUser?.() || null,
      currentUser: userService?.getCurrentUser?.() || null,
      runtimeVersion: this.data.version || runtimeVersionUtils.getRuntimeVersion()
    };

    const [currentReleaseNoteResult, visibleReleaseNotesResult] = await Promise.all([
      releaseNoteService.getCurrentReleaseNote(context),
      releaseNoteService.listVisibleReleaseNotes(context)
    ]);

    const currentReleaseNote = currentReleaseNoteResult.success
      ? currentReleaseNoteResult.note
      : null;
    const visibleReleaseNotes = visibleReleaseNotesResult.success
      ? visibleReleaseNotesResult.notes
      : [];
    const entryNote = currentReleaseNote || visibleReleaseNotes[0] || null;

    this.setData({
      showReleaseNotesEntry: Boolean(entryNote),
      releaseNoteEntryTitle: currentReleaseNoteResult.entryTitle || '近期变化',
      releaseNoteEntrySummary: entryNote?.summary || '',
      releaseNoteEntryVersion: entryNote?.version || '',
      releaseNoteEntryBadgeText: currentReleaseNoteResult.badgeText || ''
    });
  },

  onReleaseNotesTap() {
    const releaseNoteService = serviceManager.getService('releaseNote');
    const app = typeof getApp === 'function' ? getApp() : null;
    const userService = app?.globalData?.userService || serviceManager.getUserService();
    if (releaseNoteService?.recordClientEvent) {
      releaseNoteService.recordClientEvent('about_release_notes_opened', {
        loginUser: userService?.getLoginUser?.() || null,
        currentUser: userService?.getCurrentUser?.() || null,
        runtimeVersion: this.data.version || runtimeVersionUtils.getRuntimeVersion(),
        sourcePage: 'about_page'
      }, {
        entryVersion: this.data.releaseNoteEntryVersion || null
      }).catch(() => {});
    }

    wx.navigateTo({
      url: '/packageManage/pages/whats-new/whats-new'
    });
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
