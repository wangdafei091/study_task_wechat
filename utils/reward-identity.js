function getUniqueChildUserIds(scope = {}) {
  if (!scope || typeof scope !== 'object' || !Array.isArray(scope.childUserIds)) {
    return [];
  }

  return [...new Set(scope.childUserIds.filter(Boolean))];
}

function isExampleReward(reward = {}) {
  if (!reward) {
    return false;
  }

  if (reward.isExample === true) {
    return true;
  }

  if (reward.id && typeof reward.id === 'string') {
    return reward.id.startsWith('reward_example_') ||
      reward.id.includes('_example_') ||
      /reward_\d+_\d+/.test(reward.id);
  }

  return false;
}

function resolveRewardExchangeUserId(reward = {}, scope = {}) {
  if (!reward) {
    return null;
  }

  if (reward.exchangeUserId) {
    return reward.exchangeUserId;
  }

  const childUserIds = getUniqueChildUserIds(scope);

  if (reward.userId && childUserIds.includes(reward.userId)) {
    return reward.userId;
  }

  if (childUserIds.length === 1) {
    return childUserIds[0];
  }

  return null;
}

module.exports = {
  isExampleReward,
  resolveRewardExchangeUserId
};
