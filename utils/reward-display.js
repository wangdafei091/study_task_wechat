const rewardStatus = require('./reward-status');

function toSafeNumber(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeRewardExchangeCost(input = {}, fallbackPoints = null) {
  const originalPoints = Math.max(0, toSafeNumber(
    fallbackPoints !== null && fallbackPoints !== undefined
      ? fallbackPoints
      : input.originalPoints !== undefined
        ? input.originalPoints
        : input.points
  ));
  // 前台只认动态计算出的快过期抵扣，不再回退历史 partialProtection 字段。
  const explicitDeduction = input.expiringStarDeduction;
  const expiringStarDeduction = Math.max(0, Math.min(
    originalPoints,
    toSafeNumber(explicitDeduction, 0)
  ));
  const explicitActualCost = input.actualCost;
  const actualCost = Math.max(0, explicitActualCost !== undefined
    ? toSafeNumber(explicitActualCost, originalPoints - expiringStarDeduction)
    : originalPoints - expiringStarDeduction);
  const hasExpiringDeduction = input.hasExpiringDeduction === true || expiringStarDeduction > 0;

  return {
    originalPoints,
    expiringStarDeduction,
    actualCost,
    hasExpiringDeduction
  };
}

function buildRewardDisplayModel(reward = {}, context = {}) {
  const exchangeCost = normalizeRewardExchangeCost(
    context.exchangeCost || reward,
    reward.points
  );
  const requiresTargetSelection = context.requiresTargetSelection === true;
  const targetChildName = context.targetChildName || '';
  const totalPoints = Math.max(0, toSafeNumber(context.totalPoints, 0));
  const claimDisplayStatus = rewardStatus.resolveRewardClaimStatus(reward);
  const fulfillmentMode = rewardStatus.resolveRewardFulfillmentMode(reward);
  const unlocked = requiresTargetSelection
    ? false
    : totalPoints >= exchangeCost.actualCost;
  const canExchange = claimDisplayStatus === rewardStatus.RewardClaimDisplayStatus.AVAILABLE &&
    (requiresTargetSelection || unlocked);
  const actionSubjectLabel = context.isParentOwnView && targetChildName
    ? targetChildName
    : '';

  return {
    ...reward,
    fulfillmentMode,
    claimDisplayStatus,
    exchangeCost,
    unlocked,
    canExchange,
    requiresTargetSelection,
    targetChildName,
    poolStatusLabel: rewardStatus.getRewardPoolStatusLabel({
      ...reward,
      fulfillmentMode,
      unlocked,
      requiresTargetSelection
    }),
    poolActionLabel: rewardStatus.getRewardPoolActionLabel({
      ...reward,
      fulfillmentMode,
      unlocked,
      requiresTargetSelection,
      actionSubjectLabel
    }),
    costPrimaryText: exchangeCost.hasExpiringDeduction
      ? `本次${exchangeCost.actualCost}颗`
      : `${exchangeCost.originalPoints}颗`,
    costSecondaryText: exchangeCost.hasExpiringDeduction
      ? `已抵扣${exchangeCost.expiringStarDeduction}颗快过期星星`
      : '',
    detailOriginalPointsText: `原价 ${exchangeCost.originalPoints} 颗`,
    detailDeductionText: exchangeCost.hasExpiringDeduction
      ? `已抵扣 ${exchangeCost.expiringStarDeduction} 颗快过期星星`
      : '未使用快过期星星抵扣',
    detailActualCostText: `本次消耗 ${exchangeCost.actualCost} 颗`
  };
}

function buildRewardExchangeConfirmContent(displayModel = {}, subject = {}) {
  const rewardName = displayModel.name || '该奖励';
  const targetChildName = subject.targetChildName || '';
  const actionPrefix = subject.isParentOwnView
    ? (targetChildName ? `确定为${targetChildName}` : '确定为孩子')
    : '确定兑换';
  const lines = [
    `${actionPrefix}兑换【${rewardName}】吗？`,
    displayModel.detailOriginalPointsText || `原价 ${displayModel.points || 0} 颗`
  ];

  if (displayModel.exchangeCost?.hasExpiringDeduction) {
    lines.push(displayModel.detailDeductionText);
  }

  lines.push(displayModel.detailActualCostText || `本次消耗 ${displayModel.points || 0} 颗`);
  return lines.join('\n');
}

module.exports = {
  normalizeRewardExchangeCost,
  buildRewardDisplayModel,
  buildRewardExchangeConfirmContent
};
