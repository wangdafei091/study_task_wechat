const serviceManager = require('../../../services/service-manager.js');
const formatUtils = require('../../../utils/formatUtils');
const logger = require('../../../utils/logger');

function buildVisibleRewards(visibleRewards, userPoints, limit = 3) {
  return visibleRewards.slice(0, limit).map((reward) => ({
    id: reward.id,
    name: reward.name,
    points: reward.points,
    icon: reward.icon,
    status: reward.claimed ? 'claimed' : (reward.points <= userPoints ? 'unlocked' : 'current'),
    isExample: !!reward.isExample
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

function getRewardContext(page) {
  const starService = serviceManager.getService('starService');
  const rewardService = serviceManager.getService('rewardService');

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
      rewardService.getAvailableRewards(true, false, loginUserId)
    ]);

    logger.info('Index', '奖励检查数据', { userPoints, rewardCount: allRewards.length });

    const unlockedRewards = allRewards.filter((reward) =>
      !reward.claimed && reward.points <= userPoints
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

async function loadStarsAndRewards(page) {
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
      rewardService.getAvailableRewards(true, false, loginUserId)
    ]);

    logger.info('Index', '获取到下一个可达成奖励', { name: nextReward ? nextReward.name : '无' });
    logger.info('Index', '获取到可见奖励', { count: visibleRewards.length });

    const hasNoRealReward = !nextReward || nextReward.isDefault;
    const hasOnlyExampleRewards = visibleRewards.length > 0 &&
      visibleRewards.every((reward) => reward.isExample === true);

    if ((hasNoRealReward && visibleRewards.length === 0) || hasOnlyExampleRewards) {
      logger.info('Index', hasOnlyExampleRewards ? '检测到只有示例奖励，显示设置奖励提示' : '检测到无真实奖励，显示设置奖励提示');
      if (nextReward) {
        nextReward.showSetupTip = true;
      }
    }

    let visibleRewardsToShow = [...visibleRewards];
    if (visibleRewardsToShow.length === 0 && nextReward) {
      logger.info('Index', '检查奖励信息', {
        name: nextReward.name,
        id: nextReward.id,
        isDefault: nextReward.isDefault,
        showSetupTip: nextReward.showSetupTip
      });

      if (nextReward.isDefault) {
        logger.info('Index', '检测到默认占位奖励，不添加到显示列表');
      } else if (nextReward.id) {
        logger.info('Index', '无可见奖励但存在有效奖励，添加到显示列表');
        visibleRewardsToShow = [nextReward];
      }
    }

    const progressTotal = calculateProgressTotal(userPoints, nextReward);

    logger.info('Index', '进度条状态计算', {
      current: userPoints,
      total: progressTotal,
      nextRewardPoints: nextReward?.points,
      nextRewardName: nextReward?.name,
      willTriggerComplete: userPoints >= progressTotal
    });

    page.setData({
      userPoints,
      formattedPoints,
      nextReward,
      lastExchangeTime,
      visibleRewards: buildVisibleRewards(visibleRewardsToShow, userPoints),
      hasMoreRewards: visibleRewardsToShow.length > 3,
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
    const visibleRewards = await rewardService.getAvailableRewards(true, false, loginUserId);

    page.setData({
      userPoints: actualUserPoints,
      rewardProgress: {
        current: userPoints,
        total: userPoints
      },
      formattedPoints,
      visibleRewards: buildVisibleRewards(visibleRewards, actualUserPoints),
      hasMoreRewards: visibleRewards.length > 3,
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

    const nextReward = await rewardService.calculateNextAvailableReward(userPoints, loginUserId);
    logger.debug('Index', `新目标信息: 下一目标=${nextReward ? nextReward.name : '无'}, 需要星星=${nextReward ? nextReward.points : 0}`);

    const formattedPoints = formatUtils.formatPoints(userPoints, true);
    const progressTotal = calculateProgressTotal(userPoints, nextReward);

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
      nextReward,
      rewardProgress: {
        current: userPoints,
        total: progressTotal
      }
    });
  } catch (error) {
    logger.error('Index', '过渡到新目标时出错', error);
  }
}

module.exports = {
  onRewardComplete,
  checkRewardUnlock,
  loadStarsAndRewards,
  handleRewardCompletion,
  showRewardChoiceDialog,
  continueCollecting,
  transitionToNewTarget
};
