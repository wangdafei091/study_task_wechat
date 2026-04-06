const serviceManager = require('../../../services/service-manager');
const formatUtils = require('../../../utils/formatUtils');
const logger = require('../../../utils/logger');
const rewardStatus = require('../../../utils/reward-status');

function resolveExchangeActualCost(source = {}, fallbackPoints = null) {
  const explicitActualCost = Number(source.actualCost);
  if (Number.isFinite(explicitActualCost)) {
    return Math.max(0, explicitActualCost);
  }

  const originalPoints = Number(
    fallbackPoints !== null && fallbackPoints !== undefined
      ? fallbackPoints
      : source.points
  );
  const partialProtection = Number(source.partialProtection || 0);

  if (source.protectedByExpiry === true) {
    return Math.max(0, originalPoints - partialProtection);
  }

  return Math.max(0, originalPoints);
}

function buildRewardExchangeMeta(source = {}, fallbackPoints = null) {
  const originalPoints = Number(
    fallbackPoints !== null && fallbackPoints !== undefined
      ? fallbackPoints
      : source.points
  );
  const actualCost = resolveExchangeActualCost(source, fallbackPoints);
  const isProtected = source.protectedByExpiry === true;

  if (isProtected && actualCost <= 0) {
    return {
      kind: 'fully_protected',
      actualCost: 0,
      confirmContent: `【${source.name}】为星星过期完全保护奖励，兑换无需消耗星星。确定现在兑换吗？`,
      confirmLogLabel: '完全保护奖励，消耗星星: 0',
      successLogLabel: '完全保护奖励，消耗星星: 0',
      toastTitle: '完全保护奖励兑换成功',
      skipAnimation: true
    };
  }

  if (isProtected && actualCost < originalPoints) {
    return {
      kind: 'partial_protected',
      actualCost,
      confirmContent: `【${source.name}】为星星过期部分保护奖励，本次将消耗 ${actualCost} 颗星星（原价 ${originalPoints} 颗）。确定现在兑换吗？`,
      confirmLogLabel: `部分保护奖励，消耗星星: ${actualCost}/${originalPoints}`,
      successLogLabel: `部分保护奖励，消耗星星: ${actualCost}/${originalPoints}`,
      toastTitle: '部分保护奖励兑换成功',
      skipAnimation: false
    };
  }

  return {
    kind: 'normal',
    actualCost,
    confirmContent: `确定要用 ${originalPoints} 颗星星兑换【${source.name}】吗？兑换后星星将不能退回哦！`,
    confirmLogLabel: `消耗星星: ${originalPoints}`,
    successLogLabel: `消耗星星: ${actualCost || originalPoints}`,
    toastTitle: '兑换成功',
    skipAnimation: false
  };
}

function claimReward(page) {
  const reward = page.data.selectedReward;

  if (!reward.unlocked) {
    wx.showToast({
      title: '奖励尚未解锁',
      icon: 'none'
    });
    return;
  }

  const claimDisplayStatus = rewardStatus.resolveRewardClaimStatus(reward);
  if (claimDisplayStatus !== rewardStatus.RewardClaimDisplayStatus.AVAILABLE) {
    wx.showToast({
      title: claimDisplayStatus === rewardStatus.RewardClaimDisplayStatus.DELIVERED ? '奖励已领取' : '奖励已兑换',
      icon: 'none'
    });
    return;
  }

  const exchangeMeta = buildRewardExchangeMeta(reward);
  wx.showModal({
    title: '确认兑换',
    content: exchangeMeta.confirmContent,
    success: (res) => {
      if (res.confirm) {
        logger.info('rewards', `用户确认领取奖励: ${reward.name}, ${exchangeMeta.confirmLogLabel}`);
        page._performClaimReward(reward);
      } else {
        logger.info('rewards', `用户取消领取奖励: ${reward.name}`);
      }
    }
  });
}

async function performClaimReward(page, reward) {
  try {
    wx.showLoading({ title: '兑换中' });

    const rewardService = serviceManager.getService('rewardService');
    const starService = serviceManager.getService('starService');

    if (!rewardService || !starService) {
      logger.error('rewards', '无法获取服务实例');
      wx.hideLoading();
      return;
    }

    const childUserId = page._getChildUserId();
    if (!childUserId) {
      wx.hideLoading();
      wx.showToast({
        title: '请先添加孩子',
        icon: 'none'
      });
      return;
    }
    logger.info('rewards', `使用小朋友用户ID进行奖励兑换: ${childUserId}`);

    const originalPoints = page.data.totalPoints;
    logger.info('rewards', `领取奖励前星星数: ${originalPoints}, 用户: ${childUserId}`);

    const result = await rewardService.exchangeReward(reward.id, childUserId);
    if (!result.success) {
      logger.error('rewards', `兑换奖励失败: ${result.message}, 用户: ${childUserId}`);
      wx.hideLoading();
      wx.showToast({
        title: result.message || '兑换失败',
        icon: 'none'
      });
      return;
    }

    const exchangeMeta = buildRewardExchangeMeta(result, reward.points);
    const targetPoints = Math.max(0, originalPoints - exchangeMeta.actualCost);
    logger.info('rewards', `兑换奖励成功: ${reward.name}, ID=${reward.id}, ${exchangeMeta.successLogLabel}, 用户: ${childUserId}`);
    wx.hideLoading();

    if (exchangeMeta.skipAnimation) {
      logger.info('rewards', '完全保护奖励无需动画，直接处理结果');
      await page._handleExchangeSuccess(result, reward, childUserId);
      wx.showToast({
        title: exchangeMeta.toastTitle,
        icon: 'success',
        duration: 2000
      });
      return;
    }

    page.animateStarsCount(originalPoints, targetPoints, async () => {
      await page._handleExchangeSuccess(result, reward, childUserId);
      wx.showToast({
        title: exchangeMeta.toastTitle,
        icon: 'success',
        duration: 2000
      });
    });
  } catch (error) {
    logger.error('rewards', '兑换奖励出错', error);
    wx.hideLoading();
    wx.showToast({
      title: '操作失败，请重试',
      icon: 'none'
    });
  }
}

async function handleExchangeSuccess(page, result, reward, childUserId) {
  const rewardService = serviceManager.getService('rewardService');
  const starService = serviceManager.getService('starService');

  logger.info('rewards', '清除缓存确保数据一致性');
  if (starService && starService.clearCache) {
    starService.clearCache();
  }
  if (rewardService && rewardService.clearCache) {
    rewardService.clearCache();
  }

  const rewardOwnerId = page._getRewardOwnerUserId();
  const effectiveChildId = page._getEffectiveChildUserId();
  const currentStars = await starService.getTotalStars(effectiveChildId);
  const nextReward = await rewardService.calculateNextAvailableReward(currentStars, rewardOwnerId);
  logger.info('rewards', '领取奖励后计算下一个可用奖励', {
    rewardName: nextReward?.name || null,
    rewardPoints: nextReward?.points || 0
  });

  page.setData({
    showModal: false,
    nextReward: nextReward || null
  });

  await page.loadRewardsData(true);
  page._skipNextOnShowRefresh = true;

  logger.info('rewards', '奖励兑换后的页面刷新完成，业务事件已由服务层统一发布', {
    rewardId: reward?.id || null,
    childUserId: childUserId || null,
    exchangeSuccess: result?.success === true
  });
}

module.exports = {
  resolveExchangeActualCost,
  buildRewardExchangeMeta,
  claimReward,
  performClaimReward,
  handleExchangeSuccess
};
