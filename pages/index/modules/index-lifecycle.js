const serviceManager = require('../../../services/service-manager.js');
const logger = require('../../../utils/logger');

async function onLoad(page, options) {
  logger.info('Index', '首页加载');
  logger.info('Index', 'UI优化已实施：示例标识优化、移除箭头指示器、任务排序优化、任务条高度调整、标签背景色优化');
  logger.info('Index', '示例标识位置进一步优化：调整到 top: -18rpx, right: -18rpx，字体减小到 16rpx');
  logger.info('Index', '标签样式冗余代码清理：移除冗余选择器、提高CSS优先级、使用CSS变量统一颜色');
  logger.info('Index', '标签背景色修复：将CSS变量替换为硬编码颜色值，解决微信小程序组件样式隔离问题');
  logger.info('Index', '标签背景色最终修复：在组件配置文件中添加 styleIsolation: apply-shared，完全解决样式隔离问题');
  logger.info('Index', '🎯 标签样式重大简化：采用内联样式方案，删除50+行复杂CSS，移除样式隔离配置，实现简单可靠的标签背景色显示');
  logger.info('Index', '✨ 标签样式专业优化：采用渐变色彩+柔和阴影，提升视觉层次感和现代感，符合少儿教育心理学设计原则');
  logger.info('Index', '🎯 标签视觉权重调和：缩小尺寸(36→28rpx)、柔化色彩、减少阴影，让标签回归辅助角色，突出任务内容主导地位');
  logger.info('Index', '🚀 页面初始化优化：合并重复数据加载逻辑，统一批量处理，减少重复调用和UI闪烁');

  const app = getApp();
  page._eventHandlers = {
    taskChanged: page.handleTaskDataChanged.bind(page),
    taskCreated: page.handleTaskCreated.bind(page),
    messageChanged: page.handleMessageDataChanged.bind(page),
    rewardClaimed: page.handleRewardClaimed.bind(page),
    rewardUpdated: page.handleRewardUpdated.bind(page),
    progressbarComplete: page.handleProgressBarComplete.bind(page)
  };

  page.setRandomMotivation();

  if (app.globalData.userInfo) {
    page.setData({
      userInfo: app.globalData.userInfo,
      hasUserInfo: true
    });
  } else if (page.data.canIUse) {
    app.userInfoReadyCallback = (res) => {
      page.setData({
        userInfo: res.userInfo,
        hasUserInfo: true
      });
    };
  }

  page.registerEventListeners();
  page.initializeDateNavigation();
}

async function onShow(page) {
  logger.info('Index', '页面显示');

  await page.waitForServicesReady();
  await page.initializeMultiUserSystemDelayed();

  try {
    const effectiveUserId = typeof page.getEffectiveTaskUserId === 'function'
      ? page.getEffectiveTaskUserId()
      : null;
    const rewardService = serviceManager.getService('rewardService');
    if (rewardService?.refreshRewardsFromCloud) {
      await rewardService.refreshRewardsFromCloud({
        userId: effectiveUserId || undefined
      });
    }
  } catch (syncError) {
    logger.warn('Index', '首页奖励云同步失败，继续使用本地数据', syncError);
  }

  const app = getApp();
  if (app.globalData.fromRewardCompletion) {
    app.globalData.fromRewardCompletion = false;
    logger.info('Index', '从奖励完成页面返回，跳过过期检查');
    page.loadAllPageData();
    return;
  }

  logger.debug('Index', '页面显示时检查过期任务和星星');
  await page.checkExpiredTasksAndStars();

  logger.debug('Index', '页面显示时批量加载所有数据');
  page.loadAllPageData({
    skipExpiryAuthoritySyncBeforeFormalReminders: true
  });
}

async function waitForLoginComplete(page) {
  const API_CONFIG = require('../../../utils/api-config');
  if (!API_CONFIG.ENABLE_API) {
    logger.debug('Index', '本地模式，无需等待登录');
    return;
  }

  const TokenManager = require('../../../utils/token-manager');
  const maxWaitTime = 5000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const hasToken = !!TokenManager.getToken();
    const us = serviceManager.getUserService();
    const isUserServiceReady = us && us.initialized;
    if (hasToken && isUserServiceReady) {
      logger.info('Index', '登录完成，用户服务已就绪', {
        loginUserId: us.loginUser && us.loginUser.userId,
        currentUserId: us.currentUser && us.currentUser.userId
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  logger.warn('Index', '等待登录/用户服务超时，继续执行');
}

async function waitForServicesReady(page) {
  try {
    logger.info('Index', '等待服务管理器初始化完成');
    const isReady = await serviceManager.waitForInitialization(10000);

    if (isReady) {
      logger.info('Index', '服务管理器已就绪');
      return;
    }

    logger.error('Index', '服务管理器初始化超时，将使用降级处理');
    wx.showToast({
      title: '服务加载中，请稍候',
      icon: 'none',
      duration: 2000
    });
  } catch (error) {
    logger.error('Index', '等待服务就绪失败', error);
  }
}

module.exports = {
  onLoad,
  onShow,
  waitForLoginComplete,
  waitForServicesReady
};
