const logger = require('../../utils/logger');
const HttpClient = require('../../utils/http-client');
const API_CONFIG = require('../../utils/api-config');
const { Reward } = require('../../models/reward');
const runtimeVersionUtils = require('../../utils/runtime-version');

const REWARD_CLOUD_REFRESH_MIN_INTERVAL_MS = 3 * 1000;

async function refreshRewardsFromCloud(service, options = {}) {
  if (!service.enableCloudStorage) {
    return { success: false, message: '云端模式未启用' };
  }

  const {
    force = false,
    minIntervalMs = REWARD_CLOUD_REFRESH_MIN_INTERVAL_MS
  } = options;
  const scopeKey = `user:${options.userId || 'default'}`;

  const inFlight = service._cloudRewardsRefreshInFlight.get(scopeKey);
  if (inFlight) {
    logger.debug('RewardService', '复用进行中的奖励云同步请求');
    return inFlight;
  }

  const request = (async () => {
    await service._flushPendingRewardSyncs();

    const now = Date.now();
    const lastSyncTime = service._lastCloudRewardsSyncTimes.get(scopeKey) || 0;
    if (!force && minIntervalMs > 0 && now - lastSyncTime < minIntervalMs) {
      logger.debug('RewardService', '奖励云同步被短窗口去重跳过', {
        scopeKey,
        elapsed: now - lastSyncTime,
        minIntervalMs
      });
      return { success: true, skipped: true, reason: 'throttled' };
    }

    const result = await service._fetchRewardsFromCloud(options);
    service._lastCloudRewardsSyncTimes.set(scopeKey, Date.now());
    return result;
  })().finally(() => {
    service._cloudRewardsRefreshInFlight.delete(scopeKey);
  });

  service._cloudRewardsRefreshInFlight.set(scopeKey, request);
  return request;
}

async function fetchRewardsFromCloud(service, options = {}) {
  const response = await HttpClient.get(API_CONFIG.ENDPOINTS.REWARDS, options.userId ? {
    userId: options.userId
  } : {});
  const cloudRewards = (response.rewards || []).map(item => service._mapCloudReward(item));
  const allLocal = await service.rewardRepository.getAll(false);
  const cloudRewardIds = new Set(cloudRewards.map(reward => reward.id).filter(Boolean));
  const retainedRewards = allLocal.filter(reward => {
    if (cloudRewardIds.has(reward.id)) {
      return false;
    }

    return reward.syncedToCloud !== true;
  });
  await service.rewardRepository._saveData([...retainedRewards, ...cloudRewards]);
  service.rewardRepository.invalidateCache();
  logger.info('RewardService', '已从云端刷新奖励列表', { rewardCount: cloudRewards.length });
  return { success: true, rewards: cloudRewards };
}

async function syncRewardToCloud(service, reward) {
  if (!reward) return;
  const pendingSyncMeta = reward.pendingSyncMeta || service._buildRewardPendingSyncMeta(reward, reward.syncedToCloud ? 'update' : 'create');

  const payload = {
    rewardId: reward.id,
    userId: reward.userId || null,
    familyId: reward.familyId || pendingSyncMeta.familyId || null,
    name: reward.name,
    description: reward.description,
    type: reward.type,
    points: reward.points,
    icon: reward.icon,
    enabled: reward.enabled,
    claimed: reward.claimed,
    claimTime: reward.claimTime || 0,
    claimStatus: reward.claimStatus,
    deliveryTime: reward.deliveryTime || 0,
    fulfillmentMode: reward.fulfillmentMode || 'manual',
    exchangeUserId: reward.exchangeUserId || pendingSyncMeta.exchangeUserId || null,
    isExample: reward.isExample || false,
    tags: reward.tags || [],
    notes: reward.notes || '',
    runtimeVersion: runtimeVersionUtils.getRuntimeVersion(),
    modifyTime: pendingSyncMeta.modifyTime || reward.modifyTime || Date.now(),
    operationKey: pendingSyncMeta.operationKey,
    operatorContext: {
      actorUserId: pendingSyncMeta.operatorUserId || null,
      actorRole: pendingSyncMeta.operatorRole || 'system',
      familyId: pendingSyncMeta.familyId || reward.familyId || null
    }
  };

  if (reward.syncedToCloud) {
    const url = API_CONFIG.ENDPOINTS.REWARD_BY_ID.replace('{rewardId}', reward.id);
    await HttpClient.put(url, payload);
  } else {
    await HttpClient.post(API_CONFIG.ENDPOINTS.REWARDS, payload);
  }

  await service._markRewardSynced(reward, { modifyTime: payload.modifyTime });
}

async function syncDeleteRewardToCloud(service, rewardId, deleteMeta = null) {
  const url = API_CONFIG.ENDPOINTS.REWARD_BY_ID.replace('{rewardId}', rewardId);
  try {
    await HttpClient.request({
      url,
      method: 'DELETE',
      data: deleteMeta ? {
        operationKey: deleteMeta.operationKey,
        operatorContext: {
          actorUserId: deleteMeta.operatorUserId,
          actorRole: deleteMeta.operatorRole,
          familyId: deleteMeta.familyId
        }
      } : null
    });
    await service._removeDeleteTombstone(rewardId);
  } catch (error) {
    if (error.message && error.message.includes('404')) {
      await service._removeDeleteTombstone(rewardId);
      return;
    }
    throw error;
  }
}

async function syncExchangeToCloud(service, rewardId, exchangeUserId, modifyTime, reward = null) {
  const pendingSyncMeta = reward?.pendingSyncMeta || service._buildRewardPendingSyncMeta(reward, 'exchange', {
    modifyTime,
    exchangeUserId
  });
  const url = API_CONFIG.ENDPOINTS.REWARD_EXCHANGE.replace('{rewardId}', rewardId);
  const response = await HttpClient.patch(url, {
    exchangeUserId,
    modifyTime,
    operationKey: pendingSyncMeta.operationKey,
    operatorContext: {
      actorUserId: pendingSyncMeta.operatorUserId,
      actorRole: pendingSyncMeta.operatorRole,
      familyId: pendingSyncMeta.familyId
    }
  });
  if (reward) {
    await service._markRewardSynced(reward, { modifyTime });
  }
  return response;
}

async function syncCancelExchangeToCloud(service, rewardId, exchangeUserId, modifyTime, reward = null) {
  const pendingSyncMeta = reward?.pendingSyncMeta || service._buildRewardPendingSyncMeta(reward, 'unclaim', {
    modifyTime,
    exchangeUserId
  });
  const url = API_CONFIG.ENDPOINTS.REWARD_CANCEL_EXCHANGE.replace('{rewardId}', rewardId);
  const response = await HttpClient.patch(url, {
    exchangeUserId,
    modifyTime,
    operationKey: pendingSyncMeta.operationKey,
    operatorContext: {
      actorUserId: pendingSyncMeta.operatorUserId,
      actorRole: pendingSyncMeta.operatorRole,
      familyId: pendingSyncMeta.familyId
    }
  });
  if (reward) {
    await service._markRewardSynced(reward, { modifyTime });
  }
  return response;
}

function mapCloudReward(service, item) {
  return new Reward({
    id: item.rewardId || item.id,
    userId: item.userId,
    familyId: item.familyId || null,
    name: item.name,
    description: item.description || '',
    type: item.type || 'item',
    points: Number(item.points || 0),
    icon: item.icon || '🎁',
    enabled: item.enabled !== false,
    claimed: item.claimed === true,
    claimTime: item.claimTime || 0,
    claimStatus: item.claimStatus || (item.claimed ? 'claimed' : 'available'),
    deliveryTime: item.deliveryTime || 0,
    fulfillmentMode: item.fulfillmentMode || null,
    isExample: item.isExample === true,
    tags: item.tags || [],
    notes: item.notes || '',
    syncedToCloud: true,
    modifyTime: item.modifyTime || Date.now(),
    exchangeUserId: item.exchangeUserId || null
  });
}

module.exports = {
  refreshRewardsFromCloud,
  fetchRewardsFromCloud,
  syncRewardToCloud,
  syncDeleteRewardToCloud,
  syncExchangeToCloud,
  syncCancelExchangeToCloud,
  mapCloudReward
};
