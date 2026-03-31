const RewardClaimDisplayStatus = {
  AVAILABLE: 'available',
  CLAIMED: 'claimed',
  DELIVERED: 'delivered'
};

function resolveRewardClaimStatus(reward = {}) {
  const claimStatus = reward.claimStatus;

  if (claimStatus === RewardClaimDisplayStatus.DELIVERED) {
    return RewardClaimDisplayStatus.DELIVERED;
  }

  if (claimStatus === RewardClaimDisplayStatus.CLAIMED || claimStatus === 'pending') {
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

  if (status === RewardClaimDisplayStatus.DELIVERED) {
    return '已领取';
  }

  if (status === RewardClaimDisplayStatus.CLAIMED) {
    return '已兑换';
  }

  return reward.unlocked ? '可兑换' : '未解锁';
}

function getRewardPoolActionLabel(reward = {}) {
  const status = resolveRewardClaimStatus(reward);

  if (status === RewardClaimDisplayStatus.DELIVERED) {
    return '已领取';
  }

  if (status === RewardClaimDisplayStatus.CLAIMED) {
    return '已兑换';
  }

  return reward.unlocked ? '兑换奖励' : '未解锁';
}

function getRewardRecordStatusLabel(reward = {}) {
  return isRewardDelivered(reward) ? '已领取' : '待领取';
}

function getRewardRecordTimeLabel(reward = {}) {
  return isRewardDelivered(reward) ? '领取时间' : '兑换时间';
}

function getRewardManageStatusLabel(reward = {}) {
  return isRewardDelivered(reward) ? '已领取' : '已兑换';
}

function getRewardPrimaryRecordTime(reward = {}) {
  if (isRewardDelivered(reward) && reward.deliveryTime) {
    return reward.deliveryTime;
  }

  return reward.claimTime || reward.createTime || 0;
}

module.exports = {
  RewardClaimDisplayStatus,
  resolveRewardClaimStatus,
  isRewardDelivered,
  isRewardExchanged,
  getRewardPoolStatusLabel,
  getRewardPoolActionLabel,
  getRewardRecordStatusLabel,
  getRewardRecordTimeLabel,
  getRewardManageStatusLabel,
  getRewardPrimaryRecordTime
};
