const serviceManager = require('../../../services/service-manager');
const logger = require('../../../utils/logger');
const rewardStatus = require('../../../utils/reward-status');
const rewardDisplay = require('../../../utils/reward-display');

function getRewardService() {
  return serviceManager.getService('rewardService');
}

function getStarService() {
  return serviceManager.getService('starService');
}

function buildExchangeMeta(source = {}, fallbackPoints = null) {
  const exchangeCost = rewardDisplay.normalizeRewardExchangeCost(source, fallbackPoints);

  return {
    ...exchangeCost,
    skipAnimation: exchangeCost.actualCost <= 0,
    toastTitle: source.fulfillmentMode === rewardStatus.RewardFulfillmentMode.MANUAL
      ? '已加入待发放'
      : '兑换成功'
  };
}

function pickTargetChild(resolution) {
  return new Promise((resolve) => {
    const childOptions = Array.isArray(resolution?.childOptions) ? resolution.childOptions : [];
    if (!resolution?.requiresPicker || childOptions.length === 0) {
      resolve(resolution);
      return;
    }

    if (typeof wx.showActionSheet !== 'function') {
      wx.showToast({
        title: '请先选择孩子',
        icon: 'none'
      });
      resolve(null);
      return;
    }

    wx.showActionSheet({
      itemList: childOptions.map((item) => item.label),
      success: (result) => {
        const selected = childOptions[result.tapIndex];
        resolve(selected ? {
          ...resolution,
          requiresPicker: false,
          targetChildUserId: selected.userId,
          targetChildName: selected.label || ''
        } : null);
      },
      fail: () => resolve(null)
    });
  });
}

async function resolveExchangeSubject(page) {
  const resolution = typeof page._resolveRewardExecutionSubject === 'function'
    ? page._resolveRewardExecutionSubject()
    : null;

  if (!resolution) {
    return null;
  }

  if (resolution.requiresPicker) {
    return pickTargetChild(resolution);
  }

  return resolution;
}

async function buildDisplayModelForClaim(page, reward, subject) {
  const rewardService = getRewardService();
  const starService = getStarService();
  let fallbackBalance = Number(page.data.totalPoints || 0);

  if (subject?.targetChildUserId && typeof starService?.getTotalStars === 'function') {
    try {
      fallbackBalance = Number(await starService.getTotalStars(subject.targetChildUserId) || 0);
    } catch (error) {
      logger.warn('rewards', '读取目标孩子余额失败，领取确认回退到页面余额展示', error);
    }
  }

  let exchangeCost = rewardDisplay.normalizeRewardExchangeCost({
    originalPoints: reward.points,
    currentBalance: fallbackBalance
  }, reward.points);

  if (rewardService?.previewRewardExchangeCost && subject?.targetChildUserId) {
    try {
      exchangeCost = await rewardService.previewRewardExchangeCost(reward.id, subject.targetChildUserId);
    } catch (error) {
      logger.warn('rewards', '奖励兑换成本预览失败，领取确认回退到页面余额展示', error);
    }
  }

  return rewardDisplay.buildRewardDisplayModel(reward, {
    totalPoints: fallbackBalance,
    exchangeCost,
    requiresTargetSelection: false,
    isParentOwnView: subject?.isParentOwnView === true,
    targetChildName: subject?.targetChildName || ''
  });
}

async function claimReward(page) {
  const reward = page.data.selectedReward;
  if (!reward) {
    return;
  }

  const currentDisplayStatus = rewardStatus.resolveRewardClaimStatus(reward);
  if (currentDisplayStatus !== rewardStatus.RewardClaimDisplayStatus.AVAILABLE) {
    wx.showToast({
      title: rewardStatus.getRewardPoolStatusLabel(reward),
      icon: 'none'
    });
    return;
  }

  const subject = await resolveExchangeSubject(page);
  if (!subject || !subject.targetChildUserId) {
    wx.showToast({
      title: '请先选择孩子',
      icon: 'none'
    });
    return;
  }

  const displayModel = await buildDisplayModelForClaim(page, reward, subject);
  if (!displayModel.canExchange) {
    wx.showToast({
      title: '星星不足',
      icon: 'none'
    });
    return;
  }

  wx.showModal({
    title: '确认兑换',
    content: rewardDisplay.buildRewardExchangeConfirmContent(displayModel, subject),
    success: (res) => {
      if (res.confirm) {
        logger.info('rewards', '用户确认兑换奖励', {
          rewardId: reward.id,
          rewardName: reward.name,
          targetChildUserId: subject.targetChildUserId,
          targetChildName: subject.targetChildName || null,
          actualCost: displayModel.exchangeCost.actualCost
        });
        page._performClaimReward(reward, {
          ...subject,
          displayModel
        });
      }
    }
  });
}

async function performClaimReward(page, reward, exchangeContext = null) {
  try {
    wx.showLoading({ title: '兑换中' });

    const rewardService = getRewardService();
    const starService = getStarService();

    if (!rewardService || !starService) {
      logger.error('rewards', '无法获取服务实例');
      wx.hideLoading();
      return;
    }

    const subject = exchangeContext || await resolveExchangeSubject(page);
    if (!subject || !subject.targetChildUserId) {
      wx.hideLoading();
      wx.showToast({
        title: '请先选择孩子',
        icon: 'none'
      });
      return;
    }

    const originalPoints = typeof starService.getTotalStars === 'function'
      ? await starService.getTotalStars(subject.targetChildUserId)
      : page.data.totalPoints;
    const result = await rewardService.exchangeReward(reward.id, subject.targetChildUserId);

    if (!result.success) {
      logger.error('rewards', `兑换奖励失败: ${result.message}, 用户: ${subject.targetChildUserId}`);
      wx.hideLoading();
      wx.showToast({
        title: result.message || '兑换失败',
        icon: 'none'
      });
      return;
    }

    const exchangeMeta = buildExchangeMeta(result, reward.points);
    const targetPoints = Math.max(0, originalPoints - exchangeMeta.actualCost);
    wx.hideLoading();

    if (exchangeMeta.skipAnimation) {
      await page._handleExchangeSuccess(result, reward, subject.targetChildUserId);
      wx.showToast({
        title: exchangeMeta.toastTitle,
        icon: 'success',
        duration: 2000
      });
      return;
    }

    page.animateStarsCount(originalPoints, targetPoints, async () => {
      await page._handleExchangeSuccess(result, reward, subject.targetChildUserId);
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
  const rewardService = getRewardService();
  const starService = getStarService();

  logger.info('rewards', '清除缓存确保数据一致性');
  if (starService && starService.clearCache) {
    starService.clearCache();
  }
  if (rewardService && rewardService.clearCache) {
    rewardService.clearCache();
  }

  const effectiveChildId = childUserId || page._getEffectiveChildUserId();
  const rewardFamilyScope = typeof page._getRewardFamilyScope === 'function'
    ? page._getRewardFamilyScope()
    : null;
  const currentStars = await starService.getTotalStars(effectiveChildId);
  const nextReward = typeof rewardService.calculateNextAvailableRewardByFamily === 'function'
    ? await rewardService.calculateNextAvailableRewardByFamily(currentStars, rewardFamilyScope || {})
    : await rewardService.calculateNextAvailableReward(currentStars, page._getRewardOwnerUserId());

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
  buildExchangeMeta,
  claimReward,
  performClaimReward,
  handleExchangeSuccess
};
