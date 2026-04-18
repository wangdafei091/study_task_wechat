const serviceManager = require('../../../services/service-manager');
const formatUtils = require('../../../utils/formatUtils');
const logger = require('../../../utils/logger');
const rewardStatus = require('../../../utils/reward-status');
const rewardDisplay = require('../../../utils/reward-display');
const rewardsUserContextModule = require('./rewards-user-context');

function buildEmptyAvailableStarSnapshot(userId = null) {
  return {
    userId,
    totalStars: 0,
    buckets: [],
    expiringInfo: {
      points: 0,
      expiryDateText: '',
      expiryTimestamp: 0
    }
  };
}

function getBucketPoints(buckets, key) {
  const bucket = (buckets || []).find((item) => item.key === key);
  return bucket ? Number(bucket.points || 0) : 0;
}

function formatExpiryBoundary(bucketKey) {
  if (bucketKey === 'week') {
    return '本周结束前';
  }

  if (bucketKey === 'month') {
    return '本月结束前';
  }

  if (bucketKey === 'quarter') {
    return '本季度结束前';
  }

  return '更晚';
}

function buildSingleBucketSummary(totalStars, bucketKey) {
  if (bucketKey === 'week') {
    return `这${totalStars}颗都将在本周结束前失效`;
  }

  if (bucketKey === 'month') {
    return `这${totalStars}颗都将在本月结束前失效`;
  }

  if (bucketKey === 'quarter') {
    return `这${totalStars}颗都将在本季度结束前失效`;
  }

  return `这${totalStars}颗都是永久有效`;
}

function buildRemainingSummary(remainingPoints, remainingBuckets) {
  if (remainingPoints <= 0) {
    return '';
  }

  const hasPermanent = getBucketPoints(remainingBuckets, 'permanent') > 0;
  const hasLaterExpiry = ['week', 'month', 'quarter'].some((key) => getBucketPoints(remainingBuckets, key) > 0);

  if (hasLaterExpiry && hasPermanent) {
    return `其余${remainingPoints}颗将在更晚失效或永久有效`;
  }

  if (hasLaterExpiry) {
    return `其余${remainingPoints}颗将在更晚失效`;
  }

  if (hasPermanent) {
    return `其余${remainingPoints}颗为永久有效`;
  }

  return '';
}

function buildBalanceSummary(snapshot) {
  const totalStars = Number(snapshot?.totalStars || 0);
  const buckets = Array.isArray(snapshot?.buckets) ? snapshot.buckets : [];
  const expiringInfo = snapshot?.expiringInfo || {};

  if (totalStars <= 0 || buckets.length === 0) {
    return {
      primaryText: '',
      secondaryText: ''
    };
  }

  if (expiringInfo.points > 0 && expiringInfo.expiryDateText) {
    const remainingPoints = Math.max(0, totalStars - expiringInfo.points);
    const remainingBuckets = buckets.filter((bucket) => !bucket.emphasized);
    return {
      primaryText: `${expiringInfo.points}颗星星将在${expiringInfo.expiryDateText}失效`,
      secondaryText: buildRemainingSummary(remainingPoints, remainingBuckets)
        || '兑换时会先使用快到期的星星'
    };
  }

  if (buckets.length === 1) {
    return {
      primaryText: buildSingleBucketSummary(totalStars, buckets[0].key),
      secondaryText: ''
    };
  }

  const primaryBucket = buckets[0];
  const primaryPoints = Number(primaryBucket.points || 0);
  const remainingPoints = Math.max(0, totalStars - primaryPoints);
  const remainingBuckets = buckets.slice(1);

  return {
    primaryText: `${totalStars}颗里，有${primaryPoints}颗会在${formatExpiryBoundary(primaryBucket.key)}失效，建议优先使用`,
    secondaryText: buildRemainingSummary(remainingPoints, remainingBuckets)
  };
}

function buildRewardPageState({ rewards, hasRewardHistoryHint, viewMode }) {
  if (Array.isArray(rewards) && rewards.length > 0) {
    return {
      emptyMode: 'none',
      emptyTitle: '',
      emptyDescription: '',
      emptyHistoryHint: '',
      ctaVisible: false,
      ctaText: ''
    };
  }

  const isParentManageView = viewMode === 'parent-manage';
  const emptyTitle = isParentManageView
    ? (hasRewardHistoryHint ? '目前还没有可用的正式奖励' : '还没有正式奖励')
    : '现在还没有可用奖励';

  return {
    emptyMode: isParentManageView ? 'parent-setup' : 'child-explain',
    emptyTitle,
    emptyDescription: isParentManageView
      ? '去设置一个正式奖励吧，孩子完成任务后就能看到努力目标了'
      : '奖励由家长来设置，现在完成任务也会正常积累星星',
    emptyHistoryHint: isParentManageView && hasRewardHistoryHint
      ? '如果之前清理过奖励，也可以重新添加一个正式奖励'
      : '',
    ctaVisible: isParentManageView,
    ctaText: '去设置第一个奖励'
  };
}

async function decorateRewardForDisplay(page, rewardService, reward, displayContext = {}) {
  let exchangeCost = rewardDisplay.normalizeRewardExchangeCost({
    originalPoints: reward.points,
    currentBalance: displayContext.totalPoints
  }, reward.points);

  if (
    exchangeCost.currentBalance <= 0 &&
    rewardService?.previewRewardExchangeCost &&
    displayContext.targetChildUserId
  ) {
    try {
      exchangeCost = await rewardService.previewRewardExchangeCost(reward.id, displayContext.targetChildUserId);
    } catch (error) {
      logger.warn('rewards', '奖励兑换成本预览失败，回退到原价展示', error);
    }
  }

  return rewardDisplay.buildRewardDisplayModel(reward, {
    totalPoints: displayContext.totalPoints,
    exchangeCost,
    requiresTargetSelection: displayContext.requiresTargetSelection,
    isParentOwnView: displayContext.isParentOwnView,
    targetChildName: displayContext.targetChildName
  });
}

async function onShow(page) {
  logger.info('rewards', '页面显示');

  if (page._skipNextOnShowRefresh) {
    page._skipNextOnShowRefresh = false;
    logger.info('rewards', '跳过本轮 onShow 刷新，避免兑换成功后的重复回刷');
    return;
  }

  const app = getApp();

  try {
    const starService = serviceManager.getService('starService');
    const rewardService = serviceManager.getService('rewardService');
    const effectiveChildId = page._getEffectiveChildUserId();
    const shouldForceRewardRefresh = app.globalData.needRefreshReward === true;

    if (starService?.syncExpiryAuthorityIfNeeded && effectiveChildId) {
      await starService.syncExpiryAuthorityIfNeeded({
        scope: 'user',
        userId: effectiveChildId
      });
    }

    if (starService?.refreshStarsFromCloud && effectiveChildId) {
      await starService.refreshStarsFromCloud(effectiveChildId, {
        forceCloudAfterAuthority: true
      });
    } else if (!effectiveChildId) {
      logger.info('rewards', '奖励页跳过孩子星星云同步：当前没有可用的孩子视角');
    }

    if (rewardService?.refreshRewardsFromCloud) {
      await rewardService.refreshRewardsFromCloud({
        force: shouldForceRewardRefresh || !!effectiveChildId
      });
    }
  } catch (syncError) {
    logger.warn('rewards', '奖励页 onShow 云同步失败，继续使用本地数据', syncError);
  }

  if (app.globalData.needRefreshReward) {
    logger.info('rewards', '检测到奖励数据变更标记，强制刷新');
    app.globalData.needRefreshReward = false;
    await page.loadRewardsData(true);
  } else {
    await page.loadRewardsData();
  }

  if (app.globalData.hasRedirectedToReward) {
    logger.info('rewards', '清除已跳转标记');
    app.globalData.hasRedirectedToReward = false;
  }
}

async function onPullDownRefresh(page) {
  try {
    const starService = serviceManager.getService('starService');
    const rewardService = serviceManager.getService('rewardService');
    const effectiveChildId = page._getEffectiveChildUserId();

    if (starService?.syncExpiryAuthorityIfNeeded && effectiveChildId) {
      await starService.syncExpiryAuthorityIfNeeded({
        scope: 'user',
        userId: effectiveChildId,
        force: true
      });
    }

    if (starService?.refreshStarsFromCloud && effectiveChildId) {
      await starService.refreshStarsFromCloud(effectiveChildId, {
        forceCloudAfterAuthority: true
      });
    }

    if (rewardService?.refreshRewardsFromCloud) {
      await rewardService.refreshRewardsFromCloud({
        force: true
      });
    }

    await page.loadRewardsData(true);
  } catch (error) {
    logger.warn('rewards', '奖励页下拉强制刷新失败，继续保留当前数据', error);
    wx.showToast({
      title: '刷新失败，请稍后重试',
      icon: 'none'
    });
  } finally {
    if (typeof wx.stopPullDownRefresh === 'function') {
      wx.stopPullDownRefresh();
    }
  }
}

async function loadRewardsData(page, forceRefresh = false) {
  logger.info('rewards', '开始加载奖励数据');

  try {
    wx.showLoading({ title: '加载中' });

    const starService = serviceManager.getService('starService');
    const rewardService = serviceManager.getService('rewardService');

    if (!starService || !rewardService) {
      logger.error('rewards', '无法获取服务实例');
      wx.hideLoading();
      return;
    }

    logger.info('rewards', `准备读取奖励页数据，forceRefresh=${forceRefresh}`);
    if (forceRefresh && starService.clearCache) {
      starService.clearCache();
    }
    if (forceRefresh && rewardService.clearCache) {
      rewardService.clearCache();
    }

    const effectiveChildId = page._getEffectiveChildUserId();
    const rewardFamilyScope = typeof page._getRewardFamilyScope === 'function'
      ? page._getRewardFamilyScope()
      : { familyId: null, memberUserIds: [] };
    logger.info('rewards', `有效孩子ID: ${effectiveChildId}, 奖励家庭ID: ${rewardFamilyScope.familyId || 'none'}`);

    const executionSubject = typeof page._resolveRewardExecutionSubject === 'function'
      ? page._resolveRewardExecutionSubject()
      : { targetChildUserId: effectiveChildId, requiresTargetSelection: false, isParentOwnView: false, targetChildName: '' };
    const availableStarSnapshot = await getAvailableStarSnapshot(page);
    const totalPoints = availableStarSnapshot.totalStars;
    logger.info('rewards', `获取到用户星星: ${totalPoints}`);

    const formattedPoints = formatUtils.formatPoints(totalPoints, true);
    const expiringPointsInfo = {
      points: availableStarSnapshot.expiringInfo.points,
      date: availableStarSnapshot.expiringInfo.expiryDateText
    };
    const balanceSummary = buildBalanceSummary(availableStarSnapshot);

    const userService = serviceManager.getUserService();
    const { viewMode } = rewardsUserContextModule.resolveRewardPageViewMode(userService);
    const allRewards = typeof rewardService.getRewardsByFamily === 'function'
      ? await rewardService.getRewardsByFamily(rewardFamilyScope)
      : await rewardService.getAvailableRewards(true, false);
    logger.info('rewards', `获取到家庭奖励: ${allRewards.length}个`);

    let hasCustomRewards = false;
    try {
      const configService = serviceManager.getService('config');
      if (configService) {
        hasCustomRewards = configService.hasCustomRewards();
      } else if (rewardService && typeof rewardService.hasCustomRewards === 'function') {
        hasCustomRewards = await rewardService.hasCustomRewards();
      } else {
        hasCustomRewards = wx.getStorageSync('has_custom_rewards') === true;
        logger.warn('rewards', '配置服务不可用，使用降级存储访问');
      }
      if (hasCustomRewards) {
        logger.debug('rewards', '检测到自定义奖励标记');
      }
    } catch (error) {
      logger.warn('rewards', '获取自定义奖励标记失败', error);
    }

    const realRewards = allRewards.filter((reward) => !page.isExampleReward(reward));
    const poolRewards = realRewards.filter((reward) => !rewardStatus.isRewardExchanged(reward));
    const rewardPageState = buildRewardPageState({
      rewards: poolRewards,
      hasRewardHistoryHint: hasCustomRewards,
      viewMode
    });

    if (poolRewards.length === 0) {
      logger.info('rewards', '过滤示例奖励后无正式奖励，展示显式空态', {
        hasRewardHistoryHint: hasCustomRewards,
        viewMode
      });
      wx.hideLoading();

      page.setData({
        rewards: [],
        availableRewards: [],
        claimedRewards: [],
        showTabs: false,
        activeTab: 'available',
        showClaimedRewards: true,
        currentProgress: totalPoints,
        totalPoints,
        formattedPoints,
        expiringPoints: expiringPointsInfo.points,
        expiryDate: expiringPointsInfo.date,
        balanceSummaryPrimaryText: balanceSummary.primaryText,
        balanceSummarySecondaryText: balanceSummary.secondaryText,
        rewardsEarned: 0,
        currentLevel: Math.floor(totalPoints / 20) + 1,
        nextReward: null,
        rewardEmptyMode: rewardPageState.emptyMode,
        rewardEmptyTitle: rewardPageState.emptyTitle,
        rewardEmptyDescription: rewardPageState.emptyDescription,
        rewardEmptyHistoryHint: rewardPageState.emptyHistoryHint,
        showManageRewardCTA: rewardPageState.ctaVisible,
        manageRewardCTAText: rewardPageState.ctaText
      });

      return;
    }

    const rewards = await Promise.all(poolRewards
      .map((reward) => decorateRewardForDisplay(page, rewardService, reward, {
        totalPoints,
        targetChildUserId: executionSubject.targetChildUserId || null,
        requiresTargetSelection: executionSubject.requiresPicker === true,
        isParentOwnView: executionSubject.isParentOwnView === true,
        targetChildName: executionSubject.targetChildName || ''
      })));
    const availableRewards = rewards;
    const claimedRewards = [];

    logger.debug('rewards', `家庭可兑换奖励: ${availableRewards.length}个`);

    const unlockedRewards = rewards.filter((reward) => reward.unlocked).length;
    const nextReward = typeof rewardService.calculateNextAvailableRewardByFamily === 'function'
      ? await rewardService.calculateNextAvailableRewardByFamily(totalPoints, rewardFamilyScope)
      : await rewardService.calculateNextAvailableReward(totalPoints, page._getRewardOwnerUserId());
    const normalizedNextReward = nextReward && !nextReward.isDefault && !page.isExampleReward(nextReward)
      ? nextReward
      : null;

    logger.debug('rewards', `下一个可达成奖励: ${nextReward ? nextReward.name : '无'}, 需要${nextReward ? nextReward.points : 0}颗星星`);
    logger.info('rewards', `准备设置页面数据: 总星星=${totalPoints}, 即将过期星星=${expiringPointsInfo.points}, 过期日期=${expiringPointsInfo.date}`);
    logger.info('rewards', '过期信息详细数据:', expiringPointsInfo);

    const showTabs = false;
    const activeTab = 'available';

    logger.info('rewards', `奖励页展示家庭奖池: 可获得=${availableRewards.length}`);

    page.setData({
      rewards,
      availableRewards,
      claimedRewards,
      showTabs,
      activeTab,
      showClaimedRewards: true,
      currentProgress: totalPoints,
      totalPoints,
      formattedPoints,
      expiringPoints: expiringPointsInfo.points,
      expiryDate: expiringPointsInfo.date,
      balanceSummaryPrimaryText: balanceSummary.primaryText,
      balanceSummarySecondaryText: balanceSummary.secondaryText,
      rewardsEarned: unlockedRewards,
      currentLevel: Math.floor(totalPoints / 20) + 1,
      nextReward: normalizedNextReward,
      rewardEmptyMode: 'none',
      rewardEmptyTitle: '',
      rewardEmptyDescription: '',
      rewardEmptyHistoryHint: '',
      showManageRewardCTA: false,
      manageRewardCTAText: ''
    });

    logger.info('rewards', `设置总星星: ${totalPoints}, 即将过期总星星: ${expiringPointsInfo.points}, 最早到期日期: ${expiringPointsInfo.date}`);
    wx.hideLoading();
  } catch (error) {
    logger.error('rewards', '加载奖励数据失败', error);
    wx.hideLoading();
    wx.showToast({
      title: '加载失败，请重试',
      icon: 'none'
    });
  }
}

async function getExpiringPoints(page) {
  const availableStarSnapshot = await getAvailableStarSnapshot(page);
  return {
    points: availableStarSnapshot.expiringInfo.points,
    date: availableStarSnapshot.expiringInfo.expiryDateText
  };
}

async function getAvailableStarSnapshot(page) {
  logger.info('rewards', '获取当前可用星星快照');

  try {
    const starService = serviceManager.getService('starService');

    if (!starService) {
      logger.error('rewards', '无法获取星星服务实例');
      return buildEmptyAvailableStarSnapshot();
    }

    logger.info('rewards', '星星服务实例获取成功，开始调用当前可用星星快照');
    const effectiveChildId = page._getEffectiveChildUserId();
    if (!effectiveChildId) {
      logger.info('rewards', '没有有效孩子视角，跳过即将过期星星提示');
      return buildEmptyAvailableStarSnapshot();
    }

    const messageService = serviceManager.getService('messageService');
    if (messageService?.syncFormalRemindersIfNeeded) {
      await messageService.syncFormalRemindersIfNeeded({
        scope: 'user',
        userId: effectiveChildId
      });
    }

    if (typeof starService.getAvailableStarSnapshot !== 'function') {
      const totalStars = typeof starService.getTotalStars === 'function'
        ? await starService.getTotalStars(effectiveChildId)
        : 0;
      const expiringInfo = typeof starService.getExpiringStarsInfo === 'function'
        ? await starService.getExpiringStarsInfo(effectiveChildId)
        : { points: 0, expiryDateText: '', expiryTimestamp: 0 };

      return {
        userId: effectiveChildId,
        totalStars,
        buckets: [],
        expiringInfo: {
          points: expiringInfo.points || 0,
          expiryDateText: expiringInfo.expiryDateText || '',
          expiryTimestamp: expiringInfo.expiryTimestamp || 0
        }
      };
    }

    const snapshot = await starService.getAvailableStarSnapshot(effectiveChildId);

    logger.info('rewards', '奖池页面返回的当前可用星星快照:', snapshot);
    return snapshot;
  } catch (error) {
    logger.error('rewards', '获取当前可用星星快照失败', error);
    return buildEmptyAvailableStarSnapshot();
  }
}

module.exports = {
  onShow,
  onPullDownRefresh,
  buildBalanceSummary,
  loadRewardsData,
  getExpiringPoints,
  getAvailableStarSnapshot
};
