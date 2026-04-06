const { EVENTS } = require('../../../utils/constants');
const logger = require('../../../utils/logger');

function getEventBus() {
  return getApp()?.globalData?.eventBus || null;
}

function setupProgressBarListener(page) {
  logger.info('rewards', '设置进度条完成事件监听');

  const eventBus = getEventBus();
  if (!eventBus) {
    return;
  }

  if (!page._progressBarCompleteListener) {
    page._progressBarCompleteListener = () => page.handleProgressBarComplete();
  }

  if (page._progressBarListenerAttached) {
    return;
  }

  eventBus.on(EVENTS.PROGRESS_BAR_COMPLETE, page._progressBarCompleteListener);
  page._progressBarListenerAttached = true;
}

function teardownProgressBarListener(page) {
  const eventBus = getEventBus();
  if (!eventBus || !page._progressBarCompleteListener || !page._progressBarListenerAttached) {
    return;
  }

  eventBus.off(EVENTS.PROGRESS_BAR_COMPLETE, page._progressBarCompleteListener);
  page._progressBarListenerAttached = false;
}

function handleProgressBarComplete(page) {
  logger.info('rewards', '收到进度条完成事件，锁定用户操作');

  if (page.data.isRewardAnimating) {
    logger.warn('rewards', '已经在动画中，忽略重复事件');
    return;
  }

  page.setData({
    isRewardAnimating: true,
    showAnimationMask: true
  });

  page.animationSafetyTimer = setTimeout(() => {
    logger.warn('rewards', '奖励动画安全超时触发');
    page.releaseAnimationLock();
  }, 2000);
}

function releaseAnimationLock(page) {
  logger.info('rewards', '释放动画锁定');

  if (page.animationSafetyTimer) {
    clearTimeout(page.animationSafetyTimer);
    page.animationSafetyTimer = null;
  }

  page.setData({
    showAnimationMask: false,
    isRewardAnimating: false
  });
}

function clearAllTimers(page) {
  logger.debug('rewards', '清理所有计时器');

  if (page.animationSafetyTimer) {
    clearTimeout(page.animationSafetyTimer);
    page.animationSafetyTimer = null;
  }

  if (page.rewardTimer) {
    clearTimeout(page.rewardTimer);
    page.rewardTimer = null;
  }

  if (page.data.demoClickTimeout) {
    clearTimeout(page.data.demoClickTimeout);
    page.setData({ demoClickTimeout: null });
  }
}

module.exports = {
  setupProgressBarListener,
  teardownProgressBarListener,
  handleProgressBarComplete,
  releaseAnimationLock,
  clearAllTimers
};
