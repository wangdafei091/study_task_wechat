const serviceManager = require('../../../services/service-manager');
const appMeta = require('../../../utils/app-meta');
const runtimeVersionUtils = require('../../../utils/runtime-version');

Page({
  data: {
    appName: appMeta.appName,
    version: '',
    currentReleaseNote: null,
    recentReleaseNotes: [],
    emptyState: false
  },

  onLoad(options = {}) {
    this._initialVersion = String(options.version || '').trim();
    return this.loadReleaseNotes();
  },

  async loadReleaseNotes() {
    const releaseNoteService = serviceManager.getService('releaseNote');
    const app = typeof getApp === 'function' ? getApp() : null;
    const userService = app?.globalData?.userService || serviceManager.getUserService();
    const runtimeVersion = runtimeVersionUtils.getRuntimeVersion();

    if (!releaseNoteService) {
      this.setData({
        version: runtimeVersion,
        currentReleaseNote: null,
        recentReleaseNotes: [],
        emptyState: true
      });
      return;
    }

    const context = {
      loginUser: userService?.getLoginUser?.() || null,
      currentUser: userService?.getCurrentUser?.() || null,
      runtimeVersion
    };
    const [currentReleaseNoteResult, visibleReleaseNotesResult] = await Promise.all([
      releaseNoteService.getCurrentReleaseNote(context),
      releaseNoteService.listVisibleReleaseNotes(context)
    ]);

    const visibleReleaseNotes = visibleReleaseNotesResult.success
      ? visibleReleaseNotesResult.notes
      : [];
    const currentReleaseNote = currentReleaseNoteResult.success
      ? currentReleaseNoteResult.note
      : null;
    const activeReleaseNote = this._resolveActiveReleaseNote(
      currentReleaseNote,
      visibleReleaseNotes,
      this._initialVersion
    );

    if (currentReleaseNote?.version && currentReleaseNoteResult.effectiveUserId) {
      await releaseNoteService.markReleaseNoteRead(
        currentReleaseNote.version,
        currentReleaseNoteResult.effectiveUserId
      );
    }

    this.setData({
      version: runtimeVersion,
      currentReleaseNote: activeReleaseNote,
      recentReleaseNotes: visibleReleaseNotes.filter((item) => item.version !== activeReleaseNote?.version),
      emptyState: !activeReleaseNote && visibleReleaseNotes.length === 0
    });
  },

  _resolveActiveReleaseNote(currentReleaseNote, visibleReleaseNotes = [], preferredVersion = '') {
    const version = String(preferredVersion || '').trim();
    if (version) {
      const matched = visibleReleaseNotes.find((item) => item.version === version);
      if (matched) {
        return matched;
      }
    }

    return currentReleaseNote || visibleReleaseNotes[0] || null;
  },

  onRecentReleaseTap(e) {
    const version = String(e.currentTarget.dataset.version || '').trim();
    if (!version) {
      return;
    }

    const allNotes = [this.data.currentReleaseNote]
      .concat(this.data.recentReleaseNotes || [])
      .filter(Boolean);
    const nextCurrent = allNotes.find((item) => item.version === version) || null;
    if (!nextCurrent) {
      return;
    }

    this.setData({
      currentReleaseNote: nextCurrent,
      recentReleaseNotes: allNotes.filter((item) => item.version !== version)
    });
  },

  onHighlightActionTap(e) {
    const path = String(e.currentTarget.dataset.path || '').trim();
    if (!path) {
      return;
    }

    wx.navigateTo({
      url: path
    });
  }
});
