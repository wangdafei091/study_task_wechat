const logger = require('../../utils/logger');
const { EVENTS } = require('../../utils/constants');
const rewardStatus = require('../../utils/reward-status');
const rewardDisplay = require('../../utils/reward-display');

async function previewRewardExchangeCost(service, rewardOrId, userId = null) {
  const reward = typeof rewardOrId === 'string'
    ? await service.rewardRepository.getById(rewardOrId)
    : rewardOrId;

  if (!reward) {
    return rewardDisplay.normalizeRewardExchangeCost({ points: 0, currentBalance: 0 });
  }

  let currentBalance = 0;

  if (userId && typeof service._getUserAvailableStars === 'function') {
    try {
      currentBalance = Number(await service._getUserAvailableStars(userId, {
        refreshBeforeRead: false
      }) || 0);
    } catch (error) {
      logger.warn('RewardService', '读取用户可用星星失败，兑换成本预览回退到0余额', error);
    }
  }

  return rewardDisplay.normalizeRewardExchangeCost({
    originalPoints: reward.points,
    currentBalance
  });
}

async function getLatestRewardExchangeRecord(service, reward, exchangeUserId = null) {
  if (!reward?.id) {
    return null;
  }

  const sourceCandidates = [
    { source: `reward_${reward.id}`, sourceId: reward.id },
    { source: 'reward_exchange', sourceId: reward.id }
  ];

  for (const candidate of sourceCandidates) {
    const records = await service.starRecordRepository.getRecordsBySource(
      candidate.source,
      candidate.sourceId,
      exchangeUserId
    );
    if (Array.isArray(records) && records.length > 0) {
      return records[0];
    }
  }

  return null;
}

function normalizeDeductionBreakdown(buckets = []) {
  if (!Array.isArray(buckets)) {
    return [];
  }

  return buckets
    .map((bucket) => ({
      groupId: bucket?.groupId || null,
      expiryType: bucket?.expiryType || 'permanent',
      expiryDate: bucket?.expiryDate || null,
      points: Number(bucket?.points || bucket?.amount || 0)
    }))
    .filter((bucket) => bucket.points > 0);
}

function hasExpiredConsumedBuckets(deductionBreakdown = [], now = Date.now()) {
  return normalizeDeductionBreakdown(deductionBreakdown).some((bucket) => {
    if (!bucket.expiryType || bucket.expiryType === 'permanent' || !bucket.expiryDate) {
      return false;
    }

    return Number(now) > Number(bucket.expiryDate);
  });
}

function isSameRefundTargetGroup(group, bucket, userId) {
  if (!group || group.userId !== userId || group.expiryType !== bucket.expiryType) {
    return false;
  }

  if (bucket.expiryType === 'permanent') {
    return true;
  }

  if (!group.expiryDate || !bucket.expiryDate) {
    return false;
  }

  return new Date(group.expiryDate).toDateString() === new Date(bucket.expiryDate).toDateString();
}

function buildRefundTargetGroup(repository, bucket, userId) {
  const GroupModel = repository?.modelClass;

  if (typeof GroupModel !== 'function') {
    return null;
  }

  return new GroupModel({
    userId,
    type: bucket.expiryType,
    expiryType: bucket.expiryType,
    expiryDate: bucket.expiryDate || '',
    expiryDateStr: typeof repository._getExpiryDescription === 'function'
      ? repository._getExpiryDescription(bucket.expiryType, bucket.expiryDate)
      : '',
    stars: 0
  });
}

async function refundToOriginalBuckets(service, userId, deductionBreakdown = [], reason = '') {
  const buckets = normalizeDeductionBreakdown(deductionBreakdown);
  const repository = service.starGroupRepository;

  if (!userId) {
    logger.warn('RewardService', '退回原始星星分组失败: 缺少用户ID');
    return false;
  }

  if (buckets.length === 0) {
    return true;
  }

  if (
    repository &&
    typeof repository.getAll === 'function' &&
    typeof repository.saveAll === 'function' &&
    typeof repository.modelClass === 'function'
  ) {
    const allGroups = await repository.getAll();
    const stagedGroups = [];

    for (const bucket of buckets) {
      let targetGroup = stagedGroups.find((group) => isSameRefundTargetGroup(group, bucket, userId));

      if (!targetGroup) {
        const existingGroup = allGroups.find((group) => isSameRefundTargetGroup(group, bucket, userId));
        targetGroup = existingGroup
          ? (typeof repository._cloneModel === 'function' ? repository._cloneModel(existingGroup) : { ...existingGroup })
          : buildRefundTargetGroup(repository, bucket, userId);
      }

      if (!targetGroup) {
        logger.error('RewardService', '退回原始星星分组失败: 无法构造目标分组', bucket);
        return false;
      }

      if (!stagedGroups.some((group) => group.id === targetGroup.id)) {
        stagedGroups.push(targetGroup);
      }

      targetGroup.addStars(bucket.points, reason);
    }

    const savedGroups = await repository.saveAll(stagedGroups);
    return Array.isArray(savedGroups) && savedGroups.length === stagedGroups.length;
  }

  for (const bucket of buckets) {
    const group = await repository.getOrCreateGroup(
      bucket.expiryType,
      bucket.expiryDate,
      null,
      userId
    );

    if (!group) {
      return false;
    }

    const updated = await repository.addStarsToGroup(
      group,
      bucket.points,
      reason
    );

    if (!updated) {
      return false;
    }
  }

  return true;
}

async function reverseRefundToOriginalBuckets(service, userId, deductionBreakdown = [], reason = '') {
  const buckets = normalizeDeductionBreakdown(deductionBreakdown);
  const repository = service.starGroupRepository;

  if (!userId) {
    logger.warn('RewardService', '冲销退款失败: 缺少用户ID');
    return false;
  }

  if (buckets.length === 0) {
    return true;
  }

  if (
    repository &&
    typeof repository.getAll === 'function' &&
    typeof repository.saveAll === 'function' &&
    typeof repository.modelClass === 'function'
  ) {
    const allGroups = await repository.getAll();
    const stagedGroups = [];

    for (const bucket of buckets) {
      let targetGroup = stagedGroups.find((group) => isSameRefundTargetGroup(group, bucket, userId));

      if (!targetGroup) {
        const existingGroup = allGroups.find((group) => isSameRefundTargetGroup(group, bucket, userId));
        targetGroup = existingGroup
          ? (typeof repository._cloneModel === 'function' ? repository._cloneModel(existingGroup) : { ...existingGroup })
          : null;
      }

      if (!targetGroup) {
        logger.error('RewardService', '冲销退款失败: 未找到原始分组', bucket);
        return false;
      }

      if (!stagedGroups.some((group) => group.id === targetGroup.id)) {
        stagedGroups.push(targetGroup);
      }

      const beforeStars = Number(targetGroup.stars || 0);
      targetGroup.removeStars(bucket.points, reason);
      const deductedPoints = beforeStars - Number(targetGroup.stars || 0);

      if (deductedPoints !== bucket.points) {
        logger.error('RewardService', '冲销退款失败: 原始分组星星不足', {
          bucket,
          beforeStars,
          deductedPoints
        });
        return false;
      }
    }

    const savedGroups = await repository.saveAll(stagedGroups);
    return Array.isArray(savedGroups) && savedGroups.length === stagedGroups.length;
  }

  logger.error('RewardService', '冲销退款失败: 当前仓储不支持原子回滚');
  return false;
}

async function exchangeReward(service, rewardId, userId = null) {
  logger.info('RewardService', '===== 开始兑换奖励流程 =====');
  logger.info('RewardService', `兑换奖励ID: ${rewardId}, 用户ID: ${userId || '未指定，将自动获取'}`);

  if (!rewardId) {
    logger.warn('RewardService', '兑换奖励失败: 缺少奖励ID');
    return { success: false, message: '奖励ID不能为空' };
  }

  try {
    if (!userId) {
      if (service.userService) {
        userId = service.userService.getCurrentUserId();
        logger.info('RewardService', `自动获取当前用户ID: ${userId}`);
      } else {
        logger.error('RewardService', '无法获取用户服务，兑换失败');
        return { success: false, message: '用户服务不可用' };
      }
    }

    logger.info('RewardService', `步骤1: 获取奖励信息, ID=${rewardId}`);
    const reward = await service.rewardRepository.getById(rewardId);

    if (!reward) {
      logger.warn('RewardService', `兑换奖励失败: 未找到ID为${rewardId}的奖励`);
      return { success: false, message: '未找到指定的奖励' };
    }

    logger.info('RewardService', `奖励信息: 名称=${reward.name}, 积分=${reward.points}, 状态=${reward.enabled ? '启用' : '禁用'}, 已领取=${reward.claimed}`);

    if (!reward.enabled) {
      logger.warn('RewardService', `兑换奖励失败: 奖励已禁用, ID=${rewardId}`);
      return { success: false, message: '该奖励已禁用' };
    }

    if (reward.claimed) {
      logger.warn('RewardService', `兑换奖励失败: 奖励已被兑换, ID=${rewardId}`);
      return { success: false, message: '该奖励已被兑换' };
    }

    if (service.enableCloudStorage) {
      const exchangeModifyTime = Date.now();
      const response = await service._syncExchangeToCloud(
        reward.id,
        userId,
        exchangeModifyTime,
        reward
      );
      const cloudReward = service._mapCloudReward(response.reward || {
        ...reward,
        rewardId: reward.id,
        claimed: true,
        claimTime: exchangeModifyTime,
        claimStatus: 'claimed',
        exchangeUserId: userId,
        modifyTime: exchangeModifyTime
      });
      cloudReward.pendingSyncMeta = null;
      cloudReward.syncedToCloud = true;
      await service.rewardRepository.save(cloudReward);

      if (service.starService?.refreshStarsFromCloud) {
        await service.starService.refreshStarsFromCloud(userId, {
          forceCloudAfterAuthority: true
        }).catch(() => null);
      }
      await service.refreshRewardsFromCloud({
        force: true,
        userId
      }).catch(() => null);

      const operatorContext = service._getOperatorContext(userId, 'execute');
      const fulfillmentMode = rewardStatus.resolveRewardFulfillmentMode(cloudReward);
      const costBreakdown = rewardDisplay.normalizeRewardExchangeCost({
        originalPoints: cloudReward.points,
        currentBalance: Math.max(0, Number((response.consumedPoints || 0) + (response.updatedGroupsSnapshot || [])
          .reduce((sum, group) => sum + Number(group.stars || 0), 0)))
      });
      service.eventBus.emit(EVENTS.REWARD_CLAIMED, {
        reward: cloudReward,
        rewardId: cloudReward.id,
        rewardName: cloudReward.name,
        points: costBreakdown.actualCost,
        actualCost: costBreakdown.actualCost,
        originalPoints: cloudReward.points,
        displayPoints: costBreakdown.actualCost,
        fulfillmentMode,
        exchangeType: fulfillmentMode === rewardStatus.RewardFulfillmentMode.INSTANT
          ? 'instant'
          : 'manual',
        userId,
        exchangeUserId: userId,
        operatorUserId: operatorContext.actorUserId || userId,
        timestamp: Date.now()
      });

      return {
        success: true,
        reward: cloudReward,
        message: fulfillmentMode === rewardStatus.RewardFulfillmentMode.INSTANT
          ? '兑换成功'
          : '已加入待发放',
        fulfillmentMode,
        originalPoints: costBreakdown.originalPoints,
        actualCost: costBreakdown.actualCost,
        userId
      };
    }

    logger.info('RewardService', `步骤2: 检查用户星星数量, 用户=${userId}`);
    const userStars = await service._getUserAvailableStars(userId, {
      refreshBeforeRead: true
    });
    logger.info('RewardService', `兑换奖励前用户星星数: ${userStars}, 用户=${userId}`);

    const operatorContext = service._getOperatorContext(userId, 'execute');
    const fulfillmentMode = rewardStatus.resolveRewardFulfillmentMode(reward);
    const costBreakdown = await previewRewardExchangeCost(service, reward, userId);
    const actualCost = costBreakdown.actualCost;

    if (userStars < actualCost) {
      logger.warn('RewardService', `兑换奖励失败: 星星不足, 需要${actualCost}颗, 当前${userStars}颗, 用户=${userId}`);
      return { success: false, message: '星星不足' };
    }

    let deductResult = null;

    try {
      logger.info('RewardService', '===== 开始兑换奖励事务 =====');
      logger.info('RewardService', `事务参数: 奖励=${reward.name}, 标价=${reward.points}颗, 实际消耗=${actualCost}颗, 履约=${fulfillmentMode}, 用户=${userId}`);
      const exchangeModifyTime = Date.now();

      logger.info('RewardService', `步骤3: 开始扣除星星, 数量=${actualCost}, 用户=${userId}`);
      deductResult = await service.starGroupRepository.deductStars(actualCost, userId);

      logger.info('RewardService', '扣除星星操作完成, 结果=', deductResult);

      if (!deductResult.success) {
        logger.error('RewardService', `扣除星星失败: ${deductResult.message}, 用户=${userId}`);
        return { success: false, message: '扣除星星失败' };
      }

      logger.info('RewardService', `步骤3完成: 星星扣除成功，扣除${actualCost}颗, 用户=${userId}`);

      try {
        const recordData = {
          amount: actualCost,
          type: 'exchange',
          source: `reward_${rewardId}`,
          sourceId: reward.id,
          timestamp: exchangeModifyTime,
          userId,
          idempotencyKey: `reward_exchange:${reward.id}:${userId}:${exchangeModifyTime}`,
          modifyTime: exchangeModifyTime,
          data: {
            rewardId: reward.id,
            rewardName: reward.name,
            originalPoints: reward.points,
            fulfillmentMode,
            actualCost,
            deductionBreakdown: normalizeDeductionBreakdown(deductResult.deductionBreakdown || [])
          },
          description: `兑换奖励: ${reward.name}`
        };

        const consumptionRecord = await service.starRecordRepository.createStarConsumptionRecord(recordData);
        logger.info('RewardService', `星星消费记录创建成功: ${consumptionRecord?.id || 'unknown'}, 类型=${recordData.type}, 用户=${userId}`);
      } catch (recordError) {
        logger.error('RewardService', '创建星星消费记录失败', recordError);
        const rollbackSuccess = await service._rollbackStarDeduction(
          normalizeDeductionBreakdown(deductResult?.deductionBreakdown || []),
          reward,
          userId,
          '创建消费记录失败'
        );

        return {
          success: false,
          message: '创建消费记录失败' + (rollbackSuccess ? '，已回滚星星扣除' : '，回滚失败')
        };
      }

      try {
        reward.exchangeUserId = userId;
        reward.fulfillmentMode = fulfillmentMode;
        reward.claim();
        reward.claimTime = exchangeModifyTime;
        reward.deliveryTime = fulfillmentMode === rewardStatus.RewardFulfillmentMode.INSTANT
          ? exchangeModifyTime
          : 0;
        reward.modifyTime = exchangeModifyTime;
        reward.pendingSyncMeta = service._buildRewardPendingSyncMeta(reward, 'exchange', {
          operationKey: exchangeModifyTime,
          modifyTime: exchangeModifyTime,
          exchangeUserId: userId,
          operatorUserId: operatorContext.actorUserId || null,
          operatorRole: operatorContext.actorRole || 'system'
        });
        reward.syncedToCloud = false;
        logger.info('RewardService', `奖励状态设置: claimed=${reward.claimed}, claimStatus=${reward.claimStatus}, claimTime=${reward.claimTime}, deliveryTime=${reward.deliveryTime}, 用户=${userId}`);
        const savedReward = await service.rewardRepository.save(reward);

        if (!savedReward) {
          throw new Error('保存奖励状态失败');
        }

        logger.info('RewardService', `奖励状态更新成功: ${reward.name}, 最终状态=${reward.claimStatus}, 用户=${userId}`);
      } catch (saveError) {
        logger.error('RewardService', '更新奖励状态失败', saveError);
        const rollbackSuccess = await service._rollbackStarDeduction(
          normalizeDeductionBreakdown(deductResult?.deductionBreakdown || []),
          reward,
          userId,
          '更新奖励状态失败'
        );

        return {
          success: false,
          message: '更新奖励状态失败' + (rollbackSuccess ? '，已回滚星星扣除' : '，回滚失败')
        };
      }

      try {
        service.eventBus.emit(EVENTS.REWARD_CLAIMED, {
          reward,
          rewardId: reward.id,
          rewardName: reward.name,
          points: actualCost,
          actualCost,
          originalPoints: reward.points,
          displayPoints: actualCost,
          fulfillmentMode,
          exchangeType: fulfillmentMode === rewardStatus.RewardFulfillmentMode.INSTANT
            ? 'instant'
            : 'manual',
          userId,
          exchangeUserId: userId,
          operatorUserId: operatorContext.actorUserId || userId,
          timestamp: Date.now()
        });
        logger.info('RewardService', `奖励领取事件发送成功, 用户=${userId}`);
      } catch (eventError) {
        logger.warn('RewardService', '发送奖励领取事件失败', eventError);
      }

      logger.info('RewardService', `兑换奖励成功: ${reward.name}, 消耗${actualCost}颗星星, 用户=${userId}`);

      const successMessage = fulfillmentMode === rewardStatus.RewardFulfillmentMode.INSTANT
        ? '兑换成功'
        : '已加入待发放';

      return {
        success: true,
        reward,
        message: successMessage,
        fulfillmentMode,
        originalPoints: costBreakdown.originalPoints,
        actualCost,
        userId
      };
    } catch (error) {
      logger.error('RewardService', '兑换奖励事务处理失败', error);

      if (deductResult && deductResult.success) {
        await service._rollbackStarDeduction(
          normalizeDeductionBreakdown(deductResult.deductionBreakdown || []),
          reward,
          userId,
          '兑换事务处理失败'
        );
      }

      return { success: false, message: '兑换过程中发生错误，请重试' };
    }
  } catch (error) {
    logger.error('RewardService', '兑换奖励失败', error);
    return { success: false, message: '兑换过程中发生错误' };
  }
}

async function cancelRewardExchange(service, rewardId) {
  if (!rewardId) {
    logger.warn('RewardService', '取消奖励兑换失败: 缺少奖励ID');
    return { success: false, message: '奖励ID不能为空' };
  }

  try {
    const reward = await service.rewardRepository.getById(rewardId);

    if (!reward) {
      logger.warn('RewardService', `取消奖励兑换失败: 未找到ID为${rewardId}的奖励`);
      return { success: false, message: '未找到指定的奖励' };
    }

    if (!reward.claimed) {
      logger.info('RewardService', `奖励尚未兑换, 无需取消, ID=${rewardId}`);
      return { success: true, reward, message: '奖励尚未兑换' };
    }

    if (service.enableCloudStorage) {
      const exchangeUserId = reward.exchangeUserId || service.userService?.getCurrentUserId?.() || null;
      const modifyTime = Date.now();
      const response = await service._syncCancelExchangeToCloud(
        rewardId,
        exchangeUserId,
        modifyTime
      );

      const cloudReward = service._mapCloudReward(response.reward || {
        ...reward,
        rewardId: reward.id,
        claimed: false,
        claimTime: 0,
        claimStatus: 'available',
        deliveryTime: 0,
        exchangeUserId: null,
        modifyTime
      });
      cloudReward.pendingSyncMeta = null;
      cloudReward.syncedToCloud = true;
      await service.rewardRepository.save(cloudReward);

      if (service.starService?.refreshStarsFromCloud && exchangeUserId) {
        await service.starService.refreshStarsFromCloud(exchangeUserId, {
          forceCloudAfterAuthority: true
        }).catch(() => null);
      }

      const pointsRefunded = Number(response.refundedPoints || 0);
      const operatorContext = service._getOperatorContext(exchangeUserId, 'execute');
      service.eventBus.emit(EVENTS.REWARD_UNCLAIMED, {
        reward: cloudReward,
        pointsRefunded,
        operatorUserId: operatorContext.actorUserId || null
      });
      service.eventBus.emit(EVENTS.REWARD_EXCHANGE_CANCELLED, {
        reward: cloudReward,
        pointsRefunded,
        record: response.refundRecord || null
      });

      return {
        success: true,
        reward: cloudReward,
        pointsRefunded,
        message: '取消兑换成功'
      };
    }

    if (reward.isDelivered()) {
      logger.warn('RewardService', `取消奖励兑换失败: 奖励已领取, 不可取消, ID=${rewardId}`);
      return { success: false, message: '已领取的奖励不可取消兑换' };
    }

    const exchangeUserId = reward.exchangeUserId || service.userService?.getCurrentUserId?.() || null;
    const latestRecord = await getLatestRewardExchangeRecord(service, reward, exchangeUserId);

    if (!latestRecord) {
      logger.warn('RewardService', `取消奖励兑换: 未找到兑换记录, ID=${rewardId}`);
    }

    const pointsToRefund = latestRecord ? Math.abs(latestRecord.points) : reward.points;
    const deductionBreakdown = normalizeDeductionBreakdown(latestRecord?.data?.deductionBreakdown || []);

    if (pointsToRefund > 0 && deductionBreakdown.length === 0) {
      logger.warn('RewardService', `取消奖励兑换失败: 缺少可退款的消费明细, ID=${rewardId}`);
      return { success: false, message: '已过可取消时点' };
    }

    if (hasExpiredConsumedBuckets(deductionBreakdown, Date.now())) {
      logger.warn('RewardService', `取消奖励兑换失败: 已消费星星已过期, ID=${rewardId}`);
      return { success: false, message: '已过可取消时点' };
    }

    const refundSuccess = await refundToOriginalBuckets(
      service,
      exchangeUserId,
      deductionBreakdown,
      `取消兑换奖励: ${reward.name}`
    );

    if (!refundSuccess) {
      logger.error('RewardService', `取消奖励兑换失败: 退回原星星分组失败, ID=${rewardId}`);
      return { success: false, message: '退款星星失败' };
    }

    const unclaimed = await service.rewardRepository.unclaimReward(rewardId);

    if (!unclaimed) {
      logger.error('RewardService', `取消奖励兑换: 更新奖励状态失败, ID=${rewardId}`);
      const revertRefundSuccess = await reverseRefundToOriginalBuckets(
        service,
        exchangeUserId,
        deductionBreakdown,
        `取消兑换奖励回滚: ${reward.name}`
      );

      return {
        success: false,
        message: revertRefundSuccess ? '取消兑换失败，已自动回滚退款' : '取消兑换失败，回滚退款失败'
      };
    }

    const refundRecord = await service.starRecordRepository.save({
      userId: exchangeUserId,
      type: 'income',
      source: 'reward_exchange_refund',
      sourceId: rewardId,
      points: pointsToRefund,
      description: `取消兑换奖励: ${reward.name}`,
      timestamp: Date.now(),
      balance: latestRecord ? latestRecord.previousBalance : pointsToRefund,
      previousBalance: latestRecord ? latestRecord.balance : 0,
      data: {
        rewardId,
        rewardName: reward.name,
        refundBreakdown: deductionBreakdown
      }
    });

    if (!refundRecord) {
      logger.error('RewardService', `取消奖励兑换: 创建退款记录失败, ID=${rewardId}`);
    }

    logger.info('RewardService', `取消奖励兑换成功: ${reward.name}, ID=${rewardId}, 退还星星=${pointsToRefund}`);
    const operatorContext = service._getOperatorContext(exchangeUserId, 'execute');
    service.eventBus.emit(EVENTS.REWARD_UNCLAIMED, {
      reward: unclaimed,
      pointsRefunded: pointsToRefund,
      operatorUserId: operatorContext.actorUserId || null
    });
    service.eventBus.emit(EVENTS.REWARD_EXCHANGE_CANCELLED, {
      reward: unclaimed,
      pointsRefunded: pointsToRefund,
      record: refundRecord
    });

    return {
      success: true,
      reward: unclaimed,
      pointsRefunded: pointsToRefund,
      message: '取消兑换成功'
    };
  } catch (error) {
    logger.error('RewardService', `取消奖励兑换失败, ID=${rewardId}`, error);
    return { success: false, message: '操作过程中发生错误' };
  }
}

async function rollbackStarDeduction(service, deductionBreakdown, reward, userId, reason = '兑换奖励失败') {
  const normalizedBuckets = normalizeDeductionBreakdown(deductionBreakdown);
  const refundPoints = normalizedBuckets.reduce((sum, bucket) => sum + Number(bucket.points || 0), 0);

  if (refundPoints <= 0) {
    logger.info('RewardService', '无需回滚星星扣除，未找到有效扣减明细');
    return true;
  }

  try {
    logger.warn('RewardService', `开始回滚星星扣除操作, 用户=${userId}, 回滚数量=${refundPoints}, 原因=${reason}`);

    const rollbackSuccess = await refundToOriginalBuckets(
      service,
      userId,
      normalizedBuckets,
      `${reason}回滚: ${reward.name}`
    );

    if (!rollbackSuccess) {
      logger.error('RewardService', '回滚星星到原始分组失败');
      return false;
    }

    logger.info('RewardService', `星星回滚成功，退还${refundPoints}颗星星, 用户=${userId}`);
    return true;
  } catch (rollbackError) {
    logger.error('RewardService', '星星回滚失败', rollbackError);
    return false;
  }
}

module.exports = {
  previewRewardExchangeCost,
  exchangeReward,
  cancelRewardExchange,
  rollbackStarDeduction
};
