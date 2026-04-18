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
  const currentBalance = Math.max(0, toSafeNumber(
    input.currentBalance !== undefined
      ? input.currentBalance
      : input.totalPoints
  ));
  const actualCost = Math.max(0, toSafeNumber(
    input.actualCost !== undefined ? input.actualCost : originalPoints,
    originalPoints
  ));
  const remainingBalance = Math.max(0, currentBalance - actualCost);
  const shortage = Math.max(0, actualCost - currentBalance);

  return {
    originalPoints,
    actualCost,
    currentBalance,
    remainingBalance,
    shortage,
    hasSufficientBalance: currentBalance >= actualCost
  };
}

function buildRewardDisplayModel(reward = {}, context = {}) {
  const totalPoints = Math.max(0, toSafeNumber(context.totalPoints, 0));
  let exchangeCost = normalizeRewardExchangeCost(
    context.exchangeCost || reward,
    reward.points
  );
  const requiresTargetSelection = context.requiresTargetSelection === true;
  const targetChildName = context.targetChildName || '';
  const hasExplicitBalance = context.exchangeCost &&
    context.exchangeCost.currentBalance !== undefined;

  if (!hasExplicitBalance) {
    exchangeCost = normalizeRewardExchangeCost({
      ...exchangeCost,
      currentBalance: totalPoints
    }, reward.points);
  }

  const claimDisplayStatus = rewardStatus.resolveRewardClaimStatus(reward);
  const fulfillmentMode = rewardStatus.resolveRewardFulfillmentMode(reward);
  const unlocked = requiresTargetSelection
    ? false
    : exchangeCost.currentBalance >= exchangeCost.actualCost;
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
    costPrimaryText: `${exchangeCost.originalPoints}颗`,
    costSecondaryText: '',
    detailOriginalPointsText: `兑换需要 ${exchangeCost.originalPoints} 颗`,
    detailBalanceText: `当前余额 ${exchangeCost.currentBalance} 颗`,
    detailActualCostText: exchangeCost.hasSufficientBalance
      ? `兑换后剩余 ${exchangeCost.remainingBalance} 颗`
      : `还差 ${exchangeCost.shortage} 颗`
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
    displayModel.detailOriginalPointsText || `兑换需要 ${displayModel.points || 0} 颗`
  ];
  lines.push(displayModel.detailBalanceText || `当前余额 ${displayModel.exchangeCost?.currentBalance || 0} 颗`);
  lines.push(displayModel.detailActualCostText || `兑换后剩余 ${displayModel.exchangeCost?.remainingBalance || 0} 颗`);
  return lines.join('\n');
}

module.exports = {
  normalizeRewardExchangeCost,
  buildRewardDisplayModel,
  buildRewardExchangeConfirmContent
};
