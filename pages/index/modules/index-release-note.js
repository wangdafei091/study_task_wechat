const serviceManager = require('../../../services/service-manager.js');
const logger = require('../../../utils/logger');
const runtimeVersionUtils = require('../../../utils/runtime-version');

function getReleaseNoteService() {
  return serviceManager.getService('releaseNote');
}

function buildReleaseNoteContext(page) {
  const app = typeof getApp === 'function' ? getApp() : null;
  const userService = app?.globalData?.userService || serviceManager.getUserService();

  return {
    loginUser: userService?.getLoginUser?.() || null,
    currentUser: page.data.currentUser || userService?.getCurrentUser?.() || null,
    runtimeVersion: runtimeVersionUtils.getRuntimeVersion()
  };
}

function clearPendingReleaseNotePrompt(page) {
  page._pendingReleaseNotePrompt = null;
}

function hideReleaseNotePrompt(page) {
  page.setData({
    releaseNoteSheetVisible: false,
    releaseNoteSheetNote: null
  });
}

async function evaluatePendingReleaseNotePrompt(page) {
  const pendingPrompt = page._pendingReleaseNotePrompt || null;
  if (!pendingPrompt) {
    return false;
  }

  const releaseNoteService = getReleaseNoteService();
  if (!releaseNoteService) {
    clearPendingReleaseNotePrompt(page);
    return false;
  }

  const displayState = releaseNoteService.evaluateReleaseNotePromptDisplay(page.data || {});
  if (displayState.shouldDisplay !== true) {
    return false;
  }

  page.setData({
    releaseNoteSheetVisible: true,
    releaseNoteSheetNote: pendingPrompt.note
  });

  await releaseNoteService.markPromptShown(
    pendingPrompt.note.version,
    pendingPrompt.effectiveUserId
  );
  clearPendingReleaseNotePrompt(page);

  logger.info('Index', '展示版本更新轻提醒', {
    version: pendingPrompt.note.version
  });
  return true;
}

async function refreshReleaseNoteAwareness(page) {
  const releaseNoteService = getReleaseNoteService();
  if (!releaseNoteService) {
    clearPendingReleaseNotePrompt(page);
    hideReleaseNotePrompt(page);
    page.setData({
      releaseNoteHelpBadgeVisible: false,
      releaseNoteHelpBadgeText: ''
    });
    return;
  }

  const context = buildReleaseNoteContext(page);
  const [currentReleaseNoteResult, helpEntryBadgeState] = await Promise.all([
    releaseNoteService.getCurrentReleaseNote(context),
    releaseNoteService.getHelpEntryBadgeState(context)
  ]);

  page.setData({
    releaseNoteHelpBadgeVisible: helpEntryBadgeState.visible === true,
    releaseNoteHelpBadgeText: helpEntryBadgeState.text || ''
  });

  if (!currentReleaseNoteResult.success || !currentReleaseNoteResult.note) {
    clearPendingReleaseNotePrompt(page);
    hideReleaseNotePrompt(page);
    return;
  }

  if (currentReleaseNoteResult.promptEligible !== true) {
    clearPendingReleaseNotePrompt(page);
    return;
  }

  page._pendingReleaseNotePrompt = {
    note: currentReleaseNoteResult.note,
    effectiveUserId: currentReleaseNoteResult.effectiveUserId
  };

  await evaluatePendingReleaseNotePrompt(page);
}

async function handleReleaseNotePromptLater(page) {
  clearPendingReleaseNotePrompt(page);
  hideReleaseNotePrompt(page);
  await refreshReleaseNoteAwareness(page);
}

async function handleReleaseNotePromptDetail(page) {
  const releaseNoteService = getReleaseNoteService();
  const note = page.data.releaseNoteSheetNote || null;
  const context = buildReleaseNoteContext(page);
  const effectiveUserId = context.currentUser?.userId
    || context.currentUser?.id
    || context.loginUser?.userId
    || context.loginUser?.id
    || '';

  clearPendingReleaseNotePrompt(page);
  hideReleaseNotePrompt(page);

  if (releaseNoteService && note?.version) {
    await releaseNoteService.markReleaseNoteRead(note.version, effectiveUserId);
  }

  page.setData({
    releaseNoteHelpBadgeVisible: false,
    releaseNoteHelpBadgeText: ''
  });

  wx.navigateTo({
    url: `/packageManage/pages/whats-new/whats-new?version=${encodeURIComponent(note?.version || '')}`
  });
}

module.exports = {
  refreshReleaseNoteAwareness,
  evaluatePendingReleaseNotePrompt,
  handleReleaseNotePromptLater,
  handleReleaseNotePromptDetail
};
