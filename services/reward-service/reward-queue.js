const logger = require('../../utils/logger');
const { Reward } = require('../../models/reward');
const { EVENTS } = require('../../utils/constants');

async function updateOfflineQueueService(service, offlineQueueService) {
  service.offlineQueueService = offlineQueueService || null;
  if (service.offlineQueueService) {
    service.offlineQueueService.registerAdapter('reward', service._executeRewardQueueItem.bind(service));
  }
}

async function enqueueRewardMutation(service, action, reward, extra = {}) {
  if (!service.offlineQueueService) {
    return null;
  }

  const pendingSyncMeta = extra.pendingSyncMeta || reward?.pendingSyncMeta || service._buildRewardPendingSyncMeta(reward, action, extra);
  const snapshot = extra.rewardSnapshot || (reward ? { ...reward } : null);

  return service.offlineQueueService.enqueueMutation({
    domain: 'reward',
    entityId: reward?.id || extra.rewardId || null,
    operation: action,
    operationKey: pendingSyncMeta.operationKey,
    payload: {
      pendingSyncMeta,
      rewardId: reward?.id || extra.rewardId || null,
      deleteMeta: extra.deleteMeta || null
    },
    snapshot,
    context: service._buildOfflineQueueContextFromPendingSyncMeta(pendingSyncMeta)
  });
}

async function executeRewardQueueItem(service, item) {
  const snapshot = item.snapshot ? new Reward(item.snapshot) : null;
  const storedReward = item.entityId ? await service.rewardRepository.getById(item.entityId) : null;
  const reward = storedReward || snapshot;

  if (reward && item.payload?.pendingSyncMeta) {
    reward.pendingSyncMeta = { ...item.payload.pendingSyncMeta };
  }

  switch (item.operation) {
    case 'create':
    case 'update':
      return service._syncRewardToCloud(reward);
    case 'delete':
      return service._syncDeleteRewardToCloud(
        item.entityId,
        item.payload?.deleteMeta || item.payload?.pendingSyncMeta || item.snapshot?.pendingSyncMeta || null
      );
    case 'exchange':
      return service._syncExchangeToCloud(
        item.entityId,
        item.payload?.pendingSyncMeta?.exchangeUserId || reward?.exchangeUserId || null,
        item.payload?.pendingSyncMeta?.modifyTime || reward?.modifyTime || Date.now(),
        reward
      );
    case 'unclaim':
      return service._syncCancelExchangeToCloud(
        item.entityId,
        item.payload?.pendingSyncMeta?.exchangeUserId || reward?.exchangeUserId || null,
        item.payload?.pendingSyncMeta?.modifyTime || reward?.modifyTime || Date.now(),
        reward
      );
    default:
      return service._syncRewardToCloud(reward);
  }
}

async function buildLegacyQueueCandidates(service) {
  const [rewards, tombstones] = await Promise.all([
    service.rewardRepository.getAll(),
    service._getDeleteTombstones()
  ]);

  const rewardItems = (rewards || [])
    .filter((reward) => reward?.pendingSyncMeta)
    .map((reward) => {
      const pendingSyncMeta = reward.pendingSyncMeta || {};
      const operation = pendingSyncMeta.action || (reward.syncedToCloud ? 'update' : 'create');
      return {
        domain: 'reward',
        entityId: reward.id,
        operation,
        operationKey: pendingSyncMeta.operationKey || `${reward.id}:${operation}`,
        payload: { pendingSyncMeta },
        snapshot: { ...reward },
        context: service._buildOfflineQueueContextFromPendingSyncMeta(pendingSyncMeta),
        legacyMigrationKey: `reward:pending:${reward.id}:${operation}`
      };
    });

  const tombstoneItems = (tombstones || []).map((tombstone) => ({
    domain: 'reward',
    entityId: tombstone.entityId,
    operation: 'delete',
    operationKey: tombstone.operationKey || `${tombstone.entityId}:delete`,
    payload: {
      deleteMeta: tombstone,
      pendingSyncMeta: tombstone
    },
    snapshot: null,
    context: service._buildOfflineQueueContextFromPendingSyncMeta(tombstone),
    legacyMigrationKey: `reward:tombstone:${tombstone.entityId}:delete`
  }));

  return [...rewardItems, ...tombstoneItems];
}

async function markRewardSynced(service, reward, overrides = {}) {
  if (!reward) {
    return null;
  }

  reward.syncedToCloud = true;
  reward.pendingSyncMeta = null;
  if (overrides.modifyTime) {
    reward.modifyTime = overrides.modifyTime;
  }
  return service.rewardRepository.save(reward);
}

async function emitRewardCloudSyncFailure(service, action, reward, error, extra = {}) {
  const pendingSyncMeta = extra.pendingSyncMeta || reward?.pendingSyncMeta || service._buildRewardPendingSyncMeta(reward, action, extra);
  if (reward && action !== 'delete') {
    reward.pendingSyncMeta = pendingSyncMeta;
    reward.syncedToCloud = false;
    await service.rewardRepository.save(reward).catch(() => null);
  }

  await service._enqueueRewardMutation(action, reward, {
    ...extra,
    pendingSyncMeta,
    rewardSnapshot: extra.rewardSnapshot || (reward ? { ...reward } : null)
  }).catch(() => null);

  service.eventBus.emit(EVENTS.REWARD_CLOUD_SYNC_FAILED, {
    action,
    reward,
    rewardId: reward?.id || extra.rewardId || null,
    error,
    pendingSyncMeta,
    rewardSnapshot: extra.rewardSnapshot || (reward ? { ...reward } : null)
  });
}

async function getDeleteTombstones(service) {
  if (typeof service.rewardRepository.getDeleteTombstones !== 'function') {
    return [];
  }
  return service.rewardRepository.getDeleteTombstones().catch(() => []);
}

async function saveDeleteTombstone(service, tombstone) {
  if (typeof service.rewardRepository.saveDeleteTombstone !== 'function') {
    return null;
  }
  return service.rewardRepository.saveDeleteTombstone(tombstone).catch(() => null);
}

async function removeDeleteTombstone(service, entityId) {
  if (typeof service.rewardRepository.removeDeleteTombstone !== 'function') {
    return null;
  }
  return service.rewardRepository.removeDeleteTombstone(entityId).catch(() => null);
}

async function flushPendingRewardSyncs(service) {
  if (service.offlineQueueService) {
    if (typeof service.offlineQueueService.initialize === 'function') {
      await service.offlineQueueService.initialize();
    }
    await service.offlineQueueService.drain({
      domains: ['reward'],
      reason: 'before_reward_read'
    });
    return;
  }

  if (!service.enableCloudStorage) {
    return;
  }

  const rewards = await service.rewardRepository.getAll();
  for (const reward of rewards) {
    if (!reward?.pendingSyncMeta) {
      continue;
    }

    try {
      if (!reward.syncedToCloud) {
        await service._syncRewardToCloud(reward);
        continue;
      }

      switch (reward.pendingSyncMeta.action) {
        case 'exchange':
          await service._syncExchangeToCloud(
            reward.id,
            reward.pendingSyncMeta.exchangeUserId || reward.exchangeUserId,
            reward.pendingSyncMeta.modifyTime || reward.modifyTime,
            reward
          );
          break;
        case 'unclaim':
          await service._syncCancelExchangeToCloud(
            reward.id,
            reward.pendingSyncMeta.exchangeUserId || reward.exchangeUserId,
            reward.pendingSyncMeta.modifyTime || reward.modifyTime,
            reward
          );
          break;
        default:
          await service._syncRewardToCloud(reward);
          break;
      }
    } catch (error) {
      logger.warn('RewardService', '奖励补云失败，保留待同步状态', {
        rewardId: reward.id,
        action: reward.pendingSyncMeta.action,
        error: error.message
      });
    }
  }

  const tombstones = await service._getDeleteTombstones();
  for (const tombstone of tombstones) {
    try {
      await service._syncDeleteRewardToCloud(tombstone.entityId, tombstone);
    } catch (error) {
      logger.warn('RewardService', '奖励删除 tombstone 补云失败，保留待同步状态', {
        rewardId: tombstone.entityId,
        error: error.message
      });
    }
  }
}

module.exports = {
  updateOfflineQueueService,
  enqueueRewardMutation,
  executeRewardQueueItem,
  buildLegacyQueueCandidates,
  markRewardSynced,
  emitRewardCloudSyncFailure,
  getDeleteTombstones,
  saveDeleteTombstone,
  removeDeleteTombstone,
  flushPendingRewardSyncs
};
