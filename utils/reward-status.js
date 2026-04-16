const RewardClaimDisplayStatus = {
  AVAILABLE: 'available',
  CLAIMED: 'claimed',
  DELIVERED: 'delivered'
};

const RewardFulfillmentMode = {
  INSTANT: 'instant',
  MANUAL: 'manual'
};

function resolveRewardFulfillmentMode(reward = {}) {
  if (reward.fulfillmentMode === RewardFulfillmentMode.INSTANT) {
    return RewardFulfillmentMode.INSTANT;
  }

  if (reward.fulfillmentMode === RewardFulfillmentMode.MANUAL) {
    return RewardFulfillmentMode.MANUAL;
  }

  return RewardFulfillmentMode.MANUAL;
}

function resolveRewardClaimStatus(reward = {}) {
  const fulfillmentMode = resolveRewardFulfillmentMode(reward);
  const claimStatus = reward.claimStatus === 'pending'
    ? RewardClaimDisplayStatus.CLAIMED
    : reward.claimStatus;

  if (claimStatus === RewardClaimDisplayStatus.DELIVERED) {
    return RewardClaimDisplayStatus.DELIVERED;
  }

  if (fulfillmentMode === RewardFulfillmentMode.INSTANT) {
    return reward.claimed
      ? RewardClaimDisplayStatus.DELIVERED
      : RewardClaimDisplayStatus.AVAILABLE;
  }

  if (claimStatus === RewardClaimDisplayStatus.CLAIMED) {
    return RewardClaimDisplayStatus.CLAIMED;
  }

  return reward.claimed
    ? RewardClaimDisplayStatus.CLAIMED
    : RewardClaimDisplayStatus.AVAILABLE;
}

function isRewardDelivered(reward = {}) {
  return resolveRewardClaimStatus(reward) === RewardClaimDisplayStatus.DELIVERED;
}

function isRewardExchanged(reward = {}) {
  return resolveRewardClaimStatus(reward) !== RewardClaimDisplayStatus.AVAILABLE;
}

function getRewardPoolStatusLabel(reward = {}) {
  const status = resolveRewardClaimStatus(reward);
  const fulfillmentMode = resolveRewardFulfillmentMode(reward);

  if (status === RewardClaimDisplayStatus.DELIVERED) {
    return fulfillmentMode === RewardFulfillmentMode.INSTANT ? '已兑换' : '已发放';
  }

  if (status === RewardClaimDisplayStatus.CLAIMED) {
    return '待发放';
  }

  if (reward.requiresTargetSelection) {
    return '待选择';
  }

  return reward.unlocked ? '可兑换' : '未解锁';
}

function getRewardPoolActionLabel(reward = {}) {
  const status = resolveRewardClaimStatus(reward);
  const fulfillmentMode = resolveRewardFulfillmentMode(reward);

  if (status === RewardClaimDisplayStatus.DELIVERED) {
    return fulfillmentMode === RewardFulfillmentMode.INSTANT ? '已兑换' : '已发放';
  }

  if (status === RewardClaimDisplayStatus.CLAIMED) {
    return '待发放';
  }

  if (reward.requiresTargetSelection) {
    return '选择孩子兑换';
  }

  if (reward.actionSubjectLabel) {
    return `为${reward.actionSubjectLabel}兑换`;
  }

  return reward.unlocked ? '兑换奖励' : '未解锁';
}

function getRewardRecordStatusLabel(reward = {}) {
  const status = resolveRewardClaimStatus(reward);
  const fulfillmentMode = resolveRewardFulfillmentMode(reward);

  if (status === RewardClaimDisplayStatus.DELIVERED) {
    return fulfillmentMode === RewardFulfillmentMode.INSTANT ? '已兑换' : '已发放';
  }

  if (status === RewardClaimDisplayStatus.CLAIMED) {
    return '待发放';
  }

  return '未兑换';
}

function getRewardRecordTimeLabel(reward = {}) {
  const status = resolveRewardClaimStatus(reward);
  const fulfillmentMode = resolveRewardFulfillmentMode(reward);

  if (status === RewardClaimDisplayStatus.DELIVERED) {
    return fulfillmentMode === RewardFulfillmentMode.INSTANT ? '兑换时间' : '发放时间';
  }

  return '兑换时间';
}

function getRewardManageStatusLabel(reward = {}) {
  return getRewardRecordStatusLabel(reward);
}

function getRewardPrimaryRecordTime(reward = {}) {
  const fulfillmentMode = resolveRewardFulfillmentMode(reward);

  if (isRewardDelivered(reward) && fulfillmentMode === RewardFulfillmentMode.MANUAL && reward.deliveryTime) {
    return reward.deliveryTime;
  }

  return reward.claimTime || reward.createTime || 0;
}

function isRewardPendingFulfillment(reward = {}) {
  return resolveRewardFulfillmentMode(reward) === RewardFulfillmentMode.MANUAL &&
    resolveRewardClaimStatus(reward) === RewardClaimDisplayStatus.CLAIMED;
}

module.exports = {
  RewardClaimDisplayStatus,
  RewardFulfillmentMode,
  resolveRewardClaimStatus,
  resolveRewardFulfillmentMode,
  isRewardDelivered,
  isRewardExchanged,
  isRewardPendingFulfillment,
  getRewardPoolStatusLabel,
  getRewardPoolActionLabel,
  getRewardRecordStatusLabel,
  getRewardRecordTimeLabel,
  getRewardManageStatusLabel,
  getRewardPrimaryRecordTime
};
