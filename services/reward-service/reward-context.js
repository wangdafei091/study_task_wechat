const logger = require('../../utils/logger');
const userContextUtils = require('../../utils/user-context');

async function getUserAvailableStars(service, userId = null, options = {}) {
  const shouldPreferStarService = service.enableCloudStorage &&
    service.starService &&
    typeof service.starService.getTotalStars === 'function';

  if (shouldPreferStarService) {
    // 这是奖励域自己的读前余额对齐路径，保留既有 refreshBeforeRead 契约，不并入页面刷新编排。
    const shouldRefresh = options.refreshBeforeRead !== false &&
      userId &&
      typeof service.starService.refreshStarsFromCloud === 'function';

    if (shouldRefresh) {
      try {
        await service.starService.refreshStarsFromCloud(userId);
        logger.info('RewardService', `兑换前已刷新云端星星数据, 用户=${userId}`);
      } catch (refreshError) {
        logger.warn('RewardService', `刷新云端星星数据失败，将继续使用当前本地快照, 用户=${userId}`, refreshError);
      }
    }

    const totalStars = await service.starService.getTotalStars(userId);
    logger.info('RewardService', `通过StarService获取可用星星成功${userId ? `, 用户=${userId}` : ''}: ${totalStars}`);
    return totalStars;
  }

  const totalStars = await service.starGroupRepository.getTotalPoints(userId);
  logger.info('RewardService', `通过StarGroupRepository获取可用星星成功${userId ? `, 用户=${userId}` : ''}: ${totalStars}`);
  return totalStars;
}

function createOperationKey(service, seed = null) {
  return String(seed || Date.now());
}

function getUserContextInput(service) {
  const loginUser = service.userService?.getLoginUser?.() || null;
  const currentUser = service.userService?.getCurrentUser?.() || null;
  const currentUserId = service.userService?.getCurrentUserId?.() || null;
  const availableUsers = service.userService?.getAllUsers?.() || [];

  return {
    loginUser,
    currentUser,
    currentUserId,
    availableUsers
  };
}

function getOperatorContext(service, targetUserId = null, mode = 'manage') {
  const mutationContext = userContextUtils.resolveMutationContext(
    service._getUserContextInput(),
    {
      targetUserId,
      operationMode: mode
    }
  );
  const isManageMode = mutationContext.operationMode === 'manage';

  return {
    actorUserId: isManageMode
      ? mutationContext.managementActorUserId
      : mutationContext.executionActorUserId,
    actorRole: isManageMode
      ? mutationContext.managementActorRole
      : mutationContext.executionActorRole,
    familyId: mutationContext.familyId || null,
    loginUserId: mutationContext.loginUserId || null,
    targetUserId: mutationContext.targetUserId || null
  };
}

function buildRewardPendingSyncMeta(service, reward, action, overrides = {}) {
  const operatorMode = ['exchange', 'unclaim'].includes(action) ? 'execute' : 'manage';
  const operatorContext = overrides.operatorContext || service._getOperatorContext(reward?.exchangeUserId || null, operatorMode);
  const operationKey = service._createOperationKey(
    overrides.operationKey ||
    overrides.modifyTime ||
    reward?.modifyTime
  );

  return {
    operationKey,
    action,
    operatorUserId: overrides.operatorUserId || operatorContext.actorUserId || null,
    operatorRole: overrides.operatorRole || operatorContext.actorRole || 'system',
    familyId: overrides.familyId || operatorContext.familyId || reward?.familyId || null,
    loginUserId: overrides.loginUserId || operatorContext.loginUserId || null,
    exchangeUserId: overrides.exchangeUserId || reward?.exchangeUserId || operatorContext.targetUserId || null,
    notificationType: overrides.notificationType || `reward_${action}`,
    modifyTime: Number(overrides.modifyTime || reward?.modifyTime || Date.now())
  };
}

function buildOfflineQueueContextFromPendingSyncMeta(service, pendingSyncMeta = {}) {
  return {
    familyId: pendingSyncMeta.familyId || null,
    loginUserId: pendingSyncMeta.loginUserId || service.userService?.getLoginUserId?.() || null,
    actorUserId: pendingSyncMeta.operatorUserId || null,
    actorRole: pendingSyncMeta.operatorRole || 'system',
    exchangeUserId: pendingSyncMeta.exchangeUserId || null
  };
}

module.exports = {
  getUserAvailableStars,
  createOperationKey,
  getUserContextInput,
  getOperatorContext,
  buildRewardPendingSyncMeta,
  buildOfflineQueueContextFromPendingSyncMeta
};
