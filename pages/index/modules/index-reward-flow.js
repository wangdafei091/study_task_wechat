const serviceManager = require('../../../services/service-manager.js');
const formatUtils = require('../../../utils/formatUtils');
const logger = require('../../../utils/logger');
const pageStorageHelper = require('../../../utils/page-storage-helper');

function getRewardServiceInstance() {
  return serviceManager.getService('rewardService') || serviceManager.getService('reward');
}

function isExampleReward(reward) {
  const rewardService = getRewardServiceInstance();
  if (!rewardService || typeof rewardService.isExampleReward !== 'function') {
    return false;
  }

  return rewardService.isExampleReward(reward);
}

function resolveHomeViewMode(page) {
  const currentUser = page?.data?.currentUser || null;
  const isReadonlyView = !!page?.data?.isReadonlyView;
  const isParentManageView = currentUser && currentUser.role === 'parent' && !isReadonlyView;
  return isParentManageView ? 'parent-manage' : 'child-no-manage';
}

function getHomeSetupHintText(page) {
  return resolveHomeViewMode(page) === 'parent-manage'
    ? '还没有设置奖励，可以去奖励管理添加一个正式奖励'
    : '现在还没有可用奖励，完成任务也会正常积累星星';
}

function buildHomeRewardState(page, nextReward, visibleRewards) {
  const safeVisibleRewards = Array.isArray(visibleRewards) ? visibleRewards : [];
  const realVisibleRewards = safeVisibleRewards.filter((reward) => !isExampleReward(reward));
  const realNextReward = nextReward && !nextReward.isDefault && !isExampleReward(nextReward)
    ? { ...nextReward }
    : null;

  const hasAllRewardsClaimed = !!realNextReward?.allClaimed;
  const shouldShowSetupTip = realVisibleRewards.length === 0 && !hasAllRewardsClaimed && !realNextReward;
  const effectiveNextReward = realNextReward || (nextReward ? { ...nextReward } : {
    name: '',
    points: 0,
    icon: '🎁'
  });

  if (shouldShowSetupTip) {
    effectiveNextReward.showSetupTip = true;
    effectiveNextReward.name = '';
  }

  const normalizedVisibleRewards = realVisibleRewards.length === 0 && realNextReward && realNextReward.id && !hasAllRewardsClaimed
    ? [realNextReward]
    : realVisibleRewards;

  return {
    nextReward: effectiveNextReward,
    visibleRewards: normalizedVisibleRewards,
    hintText: shouldShowSetupTip ? getHomeSetupHintText(page) : ''
  };
}

function buildVisibleRewards(visibleRewards, userPoints, limit = 4) {
  return visibleRewards.slice(0, limit).map((reward) => ({
    id: reward.id,
    name: reward.name,
    points: reward.points,
    icon: reward.icon,
    status: reward.points <= userPoints ? 'unlocked' : 'current',
    isExample: false
  }));
}

function calculateProgressTotal(userPoints, nextReward) {
  if (!nextReward || nextReward.allClaimed || nextReward.isDefault || nextReward.showSetupTip) {
    return Math.max(userPoints * 2, 100);
  }

  return nextReward.points
    ? Math.max(nextReward.points, userPoints + 1)
    : Math.max(userPoints + 1, 100);
}

function shouldSyncAuthorityBeforeRewards(options = {}) {
  return options.skipAuthoritySync !== true;
}

function getRewardContext(page) {
  const starService = serviceManager.getService('starService');
  const rewardService = getRewardServiceInstance();

  if (!starService || !rewardService) {
    logger.error('Index', '无法获取服务实例');
    return null;
  }

  const loginUserId = getApp().globalData?.userService?.getLoginUserId() || null;
  const effectiveUserId = page.getEffectiveTaskUserId() || loginUserId;

  return {
    starService,
    rewardService,
    loginUserId,
    effectiveUserId
  };
}

function onRewardComplete(page, e) {
  logger.debug('Index', '收到进度条完成事件', e.detail);

  const oldProgress = page.data.rewardProgress || { current: 0, total: 10 };
  const userPoints = Number.isFinite(page.data.userPoints)
    ? page.data.userPoints
    : (Number.isFinite(oldProgress.current) ? oldProgress.current : 0);

  logger.debug('Index', `处理奖励完成事件: 当前进度=${JSON.stringify(oldProgress)}, 星星数=${userPoints}`);
  page._handleRewardCompletion(oldProgress, userPoints);
}

async function checkRewardUnlock(page) {
  try {
    logger.info('Index', '开始检查奖励解锁状态');

    const context = getRewardContext(page);
    if (!context) {
      logger.error('Index', '无法获取服务实例，跳过奖励检查');
      return;
    }

    const {
      starService,
      rewardService,
      loginUserId,
      effectiveUserId
    } = context;

    const [userPoints, allRewards] = await Promise.all([
      starService.getTotalStars(effectiveUserId),
      rewardService.getAvailableRewards(false, false, loginUserId)
    ]);

    logger.info('Index', '奖励检查数据', { userPoints, rewardCount: allRewards.length });

    const unlockedRewards = allRewards.filter((reward) =>
      !isExampleReward(reward) && !reward.claimed && reward.points <= userPoints
    );

    logger.info('Index', '已解锁未领取奖励', { count: unlockedRewards.length });

    if (unlockedRewards.length > 0) {
      const achievedReward = unlockedRewards.sort((a, b) => a.points - b.points)[0];

      logger.info('Index', '检测到奖励达成', {
        rewardName: achievedReward.name,
        requiredPoints: achievedReward.points,
        userPoints
      });

      await page._handleRewardCompletion(null, achievedReward.points);

      page.setData({
        completedReward: achievedReward,
        completedRewardTotal: achievedReward.points
      });

      setTimeout(() => {
        page.showRewardChoiceDialog();
      }, 500);
      return;
    }

    logger.info('Index', '暂无奖励达成，正常刷新奖励信息');
    page.loadStarsAndRewards();
  } catch (error) {
    logger.error('Index', '检查奖励解锁状态失败', error);
  }
}

async function loadStarsAndRewards(page, options = {}) {
  try {
    const context = getRewardContext(page);
    if (!context) {
      return;
    }

    const {
      starService,
      rewardService,
      loginUserId,
      effectiveUserId
    } = context;

    if (
      shouldSyncAuthorityBeforeRewards(options) &&
      effectiveUserId &&
      typeof starService.syncExpiryAuthorityIfNeeded === 'function'
    ) {
      try {
        await starService.syncExpiryAuthorityIfNeeded({
          scope: 'user',
          userId: effectiveUserId
        });
      } catch (syncError) {
        logger.warn('Index', '首页星星到期权威同步失败，继续使用现有缓存', {
          effectiveUserId,
          error: syncError.message
        });
      }
    }

    if (effectiveUserId && typeof starService.refreshStarsFromCloud === 'function') {
      try {
        await starService.refreshStarsFromCloud(effectiveUserId, {
          forceCloudAfterAuthority: true
        });
      } catch (refreshError) {
        logger.warn('Index', '首页星星云端刷新失败，降级使用本地缓存', {
          effectiveUserId,
          error: refreshError.message
        });
      }
    }

    if (effectiveUserId && typeof rewardService.refreshRewardsFromCloud === 'function') {
      try {
        await rewardService.refreshRewardsFromCloud({
          force: true,
          userId: effectiveUserId
        });
      } catch (refreshError) {
        logger.warn('Index', '首页奖励云端刷新失败，降级使用本地缓存', {
          effectiveUserId,
          error: refreshError.message
        });
      }
    }

    const [userPoints, lastExchangeTime] = await Promise.all([
      starService.getTotalStars(effectiveUserId),
      rewardService.getLastExchangeTimeByUser(loginUserId)
    ]);
    const formattedPoints = formatUtils.formatPoints(userPoints, true);

    logger.info('Index', '🔒 当前用户星星数', { userPoints, loginUserId });
    logger.info('Index', '🔒 最后兑换时间详细信息', {
      lastExchangeTime,
      lastExchangeTimeDate: lastExchangeTime ? new Date(lastExchangeTime).toLocaleString() : '从未兑换',
      hasExchanged: !!lastExchangeTime,
      type: typeof lastExchangeTime
    });

    logger.info('Index', '开始获取奖励数据，使用已获取的星星数确保一致性');
    const [nextReward, visibleRewards] = await Promise.all([
      rewardService.calculateNextAvailableReward(userPoints, loginUserId),
      rewardService.getAvailableRewards(false, false, loginUserId)
    ]);

    logger.info('Index', '获取到下一个可达成奖励', { name: nextReward ? nextReward.name : '无' });
    logger.info('Index', '获取到可见奖励', { count: visibleRewards.length });
    const homeRewardState = buildHomeRewardState(page, nextReward, visibleRewards);
    const progressTotal = calculateProgressTotal(userPoints, homeRewardState.nextReward);

    logger.info('Index', '进度条状态计算', {
      current: userPoints,
      total: progressTotal,
      nextRewardPoints: homeRewardState.nextReward?.points,
      nextRewardName: homeRewardState.nextReward?.name,
      willTriggerComplete: userPoints >= progressTotal
    });

    page.setData({
      userPoints,
      formattedPoints,
      nextReward: homeRewardState.nextReward,
      lastExchangeTime,
      visibleRewards: buildVisibleRewards(homeRewardState.visibleRewards, userPoints),
      hasMoreRewards: homeRewardState.visibleRewards.length > 4,
      rewardHintText: homeRewardState.hintText,
      rewardProgress: {
        current: userPoints,
        total: progressTotal
      }
    });

    logger.info('Index', '🔒 页面数据已更新，lastExchangeTime已设置', {
      lastExchangeTime,
      setDataSuccess: true,
      taskCount: page.data.tasks ? page.data.tasks.length : 0
    });
  } catch (error) {
    logger.error('Index', '加载星星和奖励信息失败', error);
  }
}

async function handleRewardCompletion(page, oldProgress, userPoints) {
  try {
    logger.info('Index', '处理奖励完成状态', { targetPoints: userPoints });

    const context = getRewardContext(page);
    if (!context) {
      return;
    }

    const {
      starService,
      rewardService,
      loginUserId,
      effectiveUserId
    } = context;

    const actualUserPoints = await starService.getTotalStars(effectiveUserId);
    const formattedPoints = formatUtils.formatPoints(actualUserPoints);
    const visibleRewards = await rewardService.getAvailableRewards(false, false, loginUserId);
    const homeRewardState = buildHomeRewardState(page, null, visibleRewards);

    page.setData({
      userPoints: actualUserPoints,
      rewardProgress: {
        current: userPoints,
        total: userPoints
      },
      formattedPoints,
      visibleRewards: buildVisibleRewards(homeRewardState.visibleRewards, actualUserPoints),
      hasMoreRewards: homeRewardState.visibleRewards.length > 4,
      forceKeepFullValue: true,
      completedRewardTotal: userPoints,
      rewardTextState: 'achieved',
      transitionInProgress: true
    });

    logger.info('Index', '奖励完成状态设置完毕');
  } catch (error) {
    logger.error('Index', '处理奖励完成状态失败', error);
  }
}

function showRewardChoiceDialog(page) {
  logger.debug('Index', '显示奖励选择对话框');

  if (page.data.showRewardChoice) {
    return;
  }

  if (wx.vibrateShort) {
    wx.vibrateShort({ type: 'heavy' });
  }

  const animation = wx.createAnimation({
    duration: 300,
    timingFunction: 'ease'
  });

  animation.scale(0.8).opacity(0).step({ duration: 0 });

  page.setData({
    showRewardChoice: true,
    choiceDialogTitle: `恭喜！已达成"${page.data.completedReward.name}"`,
    choiceDialogAnimation: animation.export()
  });

  setTimeout(() => {
    animation.scale(1).opacity(1).step();
    page.setData({
      choiceDialogAnimation: animation.export()
    });
  }, 50);
}

function continueCollecting(page) {
  logger.debug('Index', '用户选择继续积累星星');

  const animation = wx.createAnimation({
    duration: 300,
    timingFunction: 'ease-out'
  });

  animation.scale(0.8).opacity(0).step();

  page.setData({
    choiceDialogAnimation: animation.export()
  });

  setTimeout(() => {
    page.setData({
      showRewardChoice: false,
      forceKeepFullValue: false
    });

    page.transitionToNewTarget();
  }, 300);
}

async function transitionToNewTarget(page) {
  logger.debug('Index', '执行过渡到新目标的动画');

  try {
    page.setData({
      forceKeepFullValue: false,
      transitionInProgress: false,
      showRewardChoice: false,
      rewardTextState: 'newTarget'
    });

    const context = getRewardContext(page);
    if (!context) {
      return;
    }

    const {
      starService,
      rewardService,
      loginUserId,
      effectiveUserId
    } = context;

    const userPoints = await starService.getTotalStars(effectiveUserId);
    logger.debug('Index', `当前星星数: ${userPoints}`);

    const [nextReward, visibleRewards] = await Promise.all([
      rewardService.calculateNextAvailableReward(userPoints, loginUserId),
      rewardService.getAvailableRewards(false, false, loginUserId)
    ]);
    const homeRewardState = buildHomeRewardState(page, nextReward, visibleRewards);
    logger.debug('Index', `新目标信息: 下一目标=${homeRewardState.nextReward ? homeRewardState.nextReward.name : '无'}, 需要星星=${homeRewardState.nextReward ? homeRewardState.nextReward.points : 0}`);

    const formattedPoints = formatUtils.formatPoints(userPoints, true);
    const progressTotal = calculateProgressTotal(userPoints, homeRewardState.nextReward);

    const progressBar = page.selectComponent('#progressBar');
    if (progressBar) {
      logger.debug('Index', '进度条平滑过渡到新目标');
      progressBar.setData({
        current: userPoints,
        total: progressTotal
      });
    }

    page.setData({
      userPoints,
      formattedPoints,
      nextReward: homeRewardState.nextReward,
      visibleRewards: buildVisibleRewards(homeRewardState.visibleRewards, userPoints),
      hasMoreRewards: homeRewardState.visibleRewards.length > 4,
      rewardHintText: homeRewardState.hintText,
      rewardProgress: {
        current: userPoints,
        total: progressTotal
      }
    });
  } catch (error) {
    logger.error('Index', '过渡到新目标时出错', error);
  }
}

function viewRewardPool(page) {
  logger.debug('Index', '用户选择查看奖池');

  const app = getApp();
  app.globalData.hasRedirectedToReward = true;
  app.globalData.completedRewardInfo = {
    reward: page.data.completedReward,
    total: page.data.completedRewardTotal
  };

  pageStorageHelper.setPageState('fromRewardCompletion', true);
  pageStorageHelper.setPageState('completedRewardInfo', {
    reward: page.data.completedReward,
    total: page.data.completedRewardTotal
  });

  page.setData({
    showRewardChoice: false
  });

  setTimeout(() => {
    wx.switchTab({
      url: '/pages/rewards/rewards'
    });
  }, 300);
}

function onRewardIndicatorTap(page, e) {
  const rewardId = e.currentTarget.dataset.id;
  const reward = page.data.visibleRewards.find((item) => item.id === rewardId);

  if (!reward) {
    return;
  }

  logger.debug('Index', `点击奖励指示器: ${reward.name}, 状态: ${reward.status}`);

  if (page.data.isReadonlyView) {
    wx.showToast({ title: '请切换回家长视角查看奖励', icon: 'none' });
    return;
  }

  if (reward.status === 'unlocked' || reward.status === 'claimed') {
    wx.switchTab({
      url: '/pages/rewards/rewards'
    });
    return;
  }

  if (reward.status === 'current') {
    wx.showToast({
      title: `目标: ${reward.name}`,
      icon: 'none'
    });
  }
}

function showAllRewards(page) {
  if (page.data.isReadonlyView) {
    wx.showToast({ title: '请切换回家长视角查看奖励', icon: 'none' });
    return;
  }

  logger.debug('Index', '查看所有奖励');
  wx.switchTab({
    url: '/pages/rewards/rewards'
  });
}

function generateRewardHintText(page, userPoints, allRewards) {
  const unlockedRewards = allRewards.filter((reward) => userPoints >= reward.points);
  const unlockedCount = unlockedRewards.length;

  let hintText = '';
  if (unlockedCount > 1) {
    hintText = `恭喜！您已达成${unlockedCount}个奖品，可前往奖池查看`;
  } else if (unlockedCount === 1) {
    hintText = `恭喜！已达成${unlockedRewards[0].name}，可前往奖池查看`;
  } else {
    hintText = null;
  }

  page.setData({
    rewardHintText: hintText
  });
}

function hasOnlyExampleRewards() {
  logger.debug('Index', '检查是否只有示例奖励可用');

  const rewardService = serviceManager.getRewardService();
  const result = rewardService.hasOnlyExampleRewardsSync();

  logger.debug('Index', `是否只有示例奖励: ${result}`);
  return result;
}

function showSetupRewardTip(page) {
  logger.debug('Index', '显示设置奖励提示');

  const animation = wx.createAnimation({
    duration: 300,
    timingFunction: 'ease'
  });

  animation.scale(0.8).opacity(0).step({ duration: 0 });

  page.setData({
    showSetupRewardTip: true,
    setupRewardTipAnimation: animation.export()
  });

  setTimeout(() => {
    animation.scale(1).opacity(1).step();
    page.setData({
      setupRewardTipAnimation: animation.export()
    });
  }, 50);
}

function closeSetupRewardTip(page) {
  logger.debug('Index', '关闭设置奖励提示');

  const animation = wx.createAnimation({
    duration: 300,
    timingFunction: 'ease-out'
  });

  animation.scale(0.8).opacity(0).step();

  page.setData({
    setupRewardTipAnimation: animation.export()
  });

  setTimeout(() => {
    page.setData({
      showSetupRewardTip: false
    });
  }, 300);
}

function navigateToRewardManage(page) {
  logger.debug('Index', '跳转到奖励管理页面');
  page.closeSetupRewardTip();

  setTimeout(() => {
    wx.navigateTo({
      url: '/packageManage/pages/reward-manage/reward-manage'
    });
  }, 300);
}

function prepareRewardIndicators(page) {
  logger.debug('Index', `准备显示奖品指示器: ${page.data.visibleRewards.length}个, 状态分布: ${page.data.visibleRewards.map(r => r.status).join(',')}`);

  const rewardService = serviceManager.getRewardService();
  const processedRewards = page.data.visibleRewards.map((reward) => {
    let status = 'locked';

    if (reward.claimed) {
      status = 'claimed';
    } else if (page.data.userPoints >= reward.points) {
      status = 'unlocked';
    } else if (page.data.nextReward && page.data.nextReward.id === reward.id) {
      status = 'current';
    }

    return {
      ...reward,
      status,
      isExample: isExampleReward(reward)
    };
  });

  page.setData({
    visibleRewards: processedRewards.slice(0, 5),
    hasMoreRewards: processedRewards.length > 5
  });
}

module.exports = {
  onRewardComplete,
  checkRewardUnlock,
  loadStarsAndRewards,
  handleRewardCompletion,
  showRewardChoiceDialog,
  continueCollecting,
  transitionToNewTarget,
  viewRewardPool,
  onRewardIndicatorTap,
  showAllRewards,
  generateRewardHintText,
  hasOnlyExampleRewards,
  showSetupRewardTip,
  closeSetupRewardTip,
  navigateToRewardManage,
  prepareRewardIndicators
};
