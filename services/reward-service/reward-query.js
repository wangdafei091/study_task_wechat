const logger = require('../../utils/logger');

async function getAllRewards(service, userId = null) {
  try {
    let rewards;

    if (userId) {
      const allRewards = await service.rewardRepository.getAll();
      rewards = allRewards.filter(reward => reward.userId === userId);
    } else {
      rewards = await service.rewardRepository.getAll();
    }

    logger.info('RewardService', `获取所有奖励成功${userId ? `, 用户=${userId}` : ''}, 数量=${rewards.length}`);
    return rewards;
  } catch (error) {
    logger.error('RewardService', '获取所有奖励失败', error);
    return [];
  }
}

async function getClaimedRewards(service, userId = null) {
  try {
    const rewards = await service.rewardRepository.getClaimedRewards(false, userId);
    logger.info('RewardService', `获取已领取奖励成功${userId ? `, 用户=${userId}` : ''}, 数量=${rewards.length}`);
    return rewards;
  } catch (error) {
    logger.error('RewardService', '获取已领取奖励失败', error);
    return [];
  }
}

async function getAvailableRewards(service, includeClaimed = false, includeExamples = false, userId = null) {
  try {
    if (!service.initialized && !service.constructor._initialized) {
      logger.info('RewardService', '奖励服务尚未初始化，先执行初始化');
      await service.initialize();
    }

    let rewards;
    if (includeClaimed) {
      if (userId && !service.enableCloudStorage) {
        const allRewards = await service.rewardRepository.getAll();
        rewards = allRewards.filter(r => r.userId === userId);
      } else {
        rewards = await service.rewardRepository.getAll();
      }

      const originalCount = rewards.length;
      rewards = rewards.filter(r => r.enabled !== false);
      const filteredCount = originalCount - rewards.length;

      if (filteredCount > 0) {
        logger.info('RewardService', `过滤掉${filteredCount}个禁用奖励，剩余${rewards.length}个可用奖励`);
      }

      if (!includeExamples) {
        const hasCustomRewards = rewards.some(r => !r.isExample && r.enabled);
        if (hasCustomRewards) {
          rewards = rewards.filter(r => !r.isExample);
        }
      }

      logger.info('RewardService', `获取所有奖励成功(包含已领取${includeExamples ? '和示例' : ''}，已过滤禁用奖励)${userId ? `, 用户=${userId}` : ''}, 数量=${rewards.length}`);
    } else {
      rewards = await service.rewardRepository.getAvailableRewards(includeExamples, userId);
      logger.info('RewardService', `获取可用奖励成功(仅未领取${includeExamples ? '，包含示例' : ''})${userId ? `, 用户=${userId}` : ''}, 数量=${rewards.length}`);
    }

    return rewards;
  } catch (error) {
    logger.error('RewardService', '获取可用奖励失败', error);
    return [];
  }
}

async function getExchangeableRewards(service, userId = null) {
  try {
    const availablePoints = await service._getUserAvailableStars(userId, {
      refreshBeforeRead: !!userId
    });
    const rewards = await service.rewardRepository.getExchangeableRewards(availablePoints, userId);

    logger.info('RewardService', `获取用户可兑换奖励列表成功${userId ? `, 用户=${userId}` : ''}, 可用星星=${availablePoints}, 可兑换奖励数量=${rewards.length}`);
    return rewards;
  } catch (error) {
    logger.error('RewardService', '获取用户可兑换奖励列表失败', error);
    return [];
  }
}

async function calculateNextAvailableReward(service, knownStarCount = null, userId = null) {
  try {
    if (!service.initialized && !service.constructor._initialized) {
      logger.info('RewardService', '奖励服务尚未初始化，先执行初始化');
      await service.initialize();
    }

    const availablePoints = knownStarCount !== null ?
      knownStarCount :
      await service.starGroupRepository.getTotalPoints();

    logger.info('RewardService', `使用星星数量: ${availablePoints}${knownStarCount !== null ? '(传入参数)' : '(查询获取)'}`);

    const availableRewards = await service.getAvailableRewards(false, false, userId);

    if (availableRewards.length === 0) {
      logger.info('RewardService', '没有可用奖励，检查是否存在已兑换奖励');
      const allRewards = await service.getAvailableRewards(true, false, userId);
      const actuallyClaimedRewards = allRewards.filter(reward =>
        reward.claimed && reward.enabled !== false
      );

      if (actuallyClaimedRewards.length > 0) {
        logger.info('RewardService', '存在真正已兑换奖励，返回allClaimed状态');
        const highestPointReward = [...actuallyClaimedRewards].sort((a, b) => b.points - a.points)[0];
        return {
          ...highestPointReward,
          remainingStars: 0,
          allClaimed: true
        };
      }

      if (allRewards.length > 0) {
        logger.info('RewardService', '发现禁用奖励，返回默认占位奖励');
      } else {
        logger.info('RewardService', '没有任何奖励，返回默认占位奖励');
      }

      const defaultPlaceholder = {
        name: '添加新奖励',
        points: 10,
        icon: '🎁',
        isDefault: true,
        remainingStars: Math.max(0, 10 - availablePoints)
      };

      logger.info('RewardService', `返回默认占位奖励，还需${defaultPlaceholder.remainingStars}颗星星`);
      return defaultPlaceholder;
    }

    const unlockedRewards = availableRewards.filter(reward =>
      reward.points > availablePoints
    ).sort((a, b) => a.points - b.points);

    if (unlockedRewards.length === 0) {
      const highestPointReward = [...availableRewards].sort((a, b) => b.points - a.points)[0];
      highestPointReward.remainingStars = 0;
      highestPointReward.allClaimed = true;
      logger.info('RewardService', `计算下一个可用奖励：没有未解锁奖励，返回点数最高的奖励 ${highestPointReward.name}(${highestPointReward.points}点), 已解锁`);
      return highestPointReward;
    }

    const nextReward = unlockedRewards[0];
    nextReward.remainingStars = Math.max(0, nextReward.points - availablePoints);
    logger.info('RewardService', `计算下一个可用奖励：${nextReward.name}(${nextReward.points}点), 还需${nextReward.remainingStars}颗星星`);
    return nextReward;
  } catch (error) {
    logger.error('RewardService', '计算下一个可用奖励失败', error);
    const userPoints = knownStarCount !== null ? knownStarCount : 0;
    return {
      name: '添加新奖励',
      points: 10,
      icon: '🎁',
      isDefault: true,
      remainingStars: Math.max(0, 10 - userPoints)
    };
  }
}

function hasOnlyExampleRewardsSync(service) {
  try {
    logger.debug('RewardService', '同步检查是否只有示例奖励可用');
    const rewards = service.rewardRepository.getAllSync();
    const enabledRewards = rewards.filter(r => r.enabled !== false);

    if (enabledRewards.length === 0) {
      logger.debug('RewardService', '没有任何奖励，返回true');
      return true;
    }

    const hasCustomReward = enabledRewards.some(reward => !service._isExampleReward(reward));

    logger.debug('RewardService', `是否只有示例奖励: ${!hasCustomReward}, 启用奖励数: ${enabledRewards.length}`);
    return !hasCustomReward;
  } catch (error) {
    logger.error('RewardService', '检查示例奖励失败', error);
    return true;
  }
}

function isExampleReward(service, reward) {
  if (!reward) return false;
  if (reward.isExample === true) return true;

  if (reward.id && typeof reward.id === 'string') {
    return reward.id.startsWith('reward_example_') ||
      reward.id.includes('_example_') ||
      /reward_\d+_\d+/.test(reward.id);
  }

  return false;
}

async function getLastExchangeTime(service) {
  try {
    const claimedRewards = await service.rewardRepository.getClaimedRewards();

    if (!claimedRewards || claimedRewards.length === 0) {
      logger.info('RewardService', '没有找到任何兑换记录');
      return null;
    }

    const lastExchangeTime = Math.max(...claimedRewards.map(reward => reward.claimTime || 0));

    logger.info('RewardService', `获取最后兑换时间成功: ${lastExchangeTime}, 共有${claimedRewards.length}条兑换记录`);
    return lastExchangeTime > 0 ? lastExchangeTime : null;
  } catch (error) {
    logger.error('RewardService', '获取最后兑换时间失败', error);
    return null;
  }
}

async function getLastExchangeTimeByUser(service, userId) {
  try {
    const claimedRewards = await service.rewardRepository.getClaimedRewards();
    if (!claimedRewards || claimedRewards.length === 0) return null;

    const userRewards = userId
      ? claimedRewards.filter(r => r.userId === userId)
      : claimedRewards;

    if (userRewards.length === 0) return null;

    const lastTime = Math.max(...userRewards.map(r => r.claimTime || 0));
    return lastTime > 0 ? lastTime : null;
  } catch (error) {
    logger.error('RewardService', '获取用户最后兑换时间失败', error);
    return null;
  }
}

module.exports = {
  getAllRewards,
  getClaimedRewards,
  getAvailableRewards,
  getExchangeableRewards,
  calculateNextAvailableReward,
  hasOnlyExampleRewardsSync,
  isExampleReward,
  getLastExchangeTime,
  getLastExchangeTimeByUser
};
