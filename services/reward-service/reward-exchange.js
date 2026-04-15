const logger = require('../../utils/logger');
const { EVENTS } = require('../../utils/constants');

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

      const actualCost = Number(response.consumedPoints || 0);
      service.eventBus.emit(EVENTS.REWARD_CLAIMED, {
        rewardId: cloudReward.id,
        rewardName: cloudReward.name,
        points: actualCost,
        actualCost,
        originalPoints: cloudReward.points,
        displayPoints: actualCost,
        protectedByExpiry: cloudReward.protectedByExpiry || false,
        partialProtection: cloudReward.partialProtection || 0,
        exchangeType: cloudReward.protectedByExpiry
          ? (actualCost > 0 ? 'partial_protected' : 'fully_protected')
          : 'normal',
        userId,
        operatorUserId: userId,
        timestamp: Date.now()
      });

      return {
        success: true,
        reward: cloudReward,
        message: cloudReward.protectedByExpiry
          ? (actualCost > 0 ? '部分保护奖励兑换成功' : '完全保护奖励兑换成功')
          : '兑换成功',
        protectedByExpiry: cloudReward.protectedByExpiry || false,
        partialProtection: cloudReward.partialProtection || 0,
        actualCost,
        userId
      };
    }

    logger.info('RewardService', `步骤2: 检查用户星星数量, 用户=${userId}`);
    const userStars = await service._getUserAvailableStars(userId, {
      refreshBeforeRead: true
    });
    logger.info('RewardService', `兑换奖励前用户星星数: ${userStars}, 用户=${userId}`);

    const actualCost = reward.protectedByExpiry ?
      Math.max(0, reward.points - (reward.partialProtection || 0)) :
      reward.points;

    if (userStars < actualCost) {
      logger.warn('RewardService', `兑换奖励失败: 星星不足, 需要${actualCost}颗, 当前${userStars}颗${reward.protectedByExpiry ? `(保护金额${reward.partialProtection || 0}颗)` : ''}, 用户=${userId}`);
      return { success: false, message: '星星不足' };
    }

    let deductResult = null;

    try {
      logger.info('RewardService', '===== 开始兑换奖励事务 =====');
      logger.info('RewardService', `事务参数: 奖励=${reward.name}, 原价=${reward.points}颗, 保护金额=${reward.partialProtection || 0}颗, 实际消耗=${actualCost}颗(${reward.protectedByExpiry ? (actualCost > 0 ? '部分保护' : '完全保护') : '普通兑换'}), 用户=${userId}`);
      const exchangeModifyTime = Date.now();

      if (actualCost > 0) {
        logger.info('RewardService', `步骤3: 开始扣除星星, 数量=${actualCost}, 用户=${userId}`);
        deductResult = await service.starGroupRepository.deductStars(actualCost, userId);

        logger.info('RewardService', '扣除星星操作完成, 结果=', deductResult);

        if (!deductResult.success) {
          logger.error('RewardService', `扣除星星失败: ${deductResult.message}, 用户=${userId}`);
          return { success: false, message: '扣除星星失败' };
        }

        logger.info('RewardService', `步骤3完成: 星星扣除成功，扣除${actualCost}颗, 用户=${userId}`);
      } else {
        logger.info('RewardService', `步骤3跳过: 完全保护奖励无需扣除星星, 奖励=${reward.name}, 用户=${userId}`);
        deductResult = { success: true, message: '完全保护奖励无需扣星' };
      }

      try {
        const recordData = {
          amount: actualCost,
          type: reward.protectedByExpiry ?
            (actualCost > 0 ? 'partial_protected_exchange' : 'protected_exchange') :
            'exchange',
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
            protectedByExpiry: reward.protectedByExpiry || false,
            partialProtection: reward.partialProtection || 0,
            actualCost
          }
        };

        const consumptionRecord = await service.starRecordRepository.createStarConsumptionRecord(recordData);
        logger.info('RewardService', `星星消费记录创建成功: ${consumptionRecord.id}, 类型=${recordData.type}, 用户=${userId}`);
      } catch (recordError) {
        logger.error('RewardService', '创建星星消费记录失败', recordError);
        const rollbackSuccess = await service._rollbackStarDeduction(actualCost, reward, userId, '创建消费记录失败');

        return {
          success: false,
          message: '创建消费记录失败' + (actualCost > 0 ? (rollbackSuccess ? '，已回滚星星扣除' : '，回滚失败') : '')
        };
      }

      try {
        reward.claim();
        reward.claimTime = exchangeModifyTime;
        reward.modifyTime = exchangeModifyTime;
        reward.exchangeUserId = userId;
        reward.pendingSyncMeta = service._buildRewardPendingSyncMeta(reward, 'exchange', {
          operationKey: exchangeModifyTime,
          modifyTime: exchangeModifyTime,
          exchangeUserId: userId
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
        const rollbackSuccess = await service._rollbackStarDeduction(actualCost, reward, userId, '更新奖励状态失败');

        return {
          success: false,
          message: '更新奖励状态失败' + (actualCost > 0 ? (rollbackSuccess ? '，已回滚星星扣除' : '，回滚失败') : '')
        };
      }

      try {
        service.eventBus.emit(EVENTS.REWARD_CLAIMED, {
          rewardId: reward.id,
          rewardName: reward.name,
          points: actualCost,
          actualCost,
          originalPoints: reward.points,
          displayPoints: actualCost,
          protectedByExpiry: reward.protectedByExpiry || false,
          partialProtection: reward.partialProtection || 0,
          exchangeType: reward.protectedByExpiry ?
            (actualCost > 0 ? 'partial_protected' : 'fully_protected') : 'normal',
          userId,
          operatorUserId: userId,
          timestamp: Date.now()
        });
        logger.info('RewardService', `奖励领取事件发送成功, 用户=${userId}`);
      } catch (eventError) {
        logger.warn('RewardService', '发送奖励领取事件失败', eventError);
      }

      const costDescription = reward.protectedByExpiry ?
        (actualCost > 0 ? `${actualCost}颗星星(部分保护，原价${reward.points}颗)` : '0颗星星(完全保护)') :
        `${actualCost}颗星星`;
      logger.info('RewardService', `兑换奖励成功: ${reward.name}, 消耗${costDescription}, 用户=${userId}`);

      const successMessage = reward.protectedByExpiry ?
        (actualCost > 0 ? '部分保护奖励兑换成功' : '完全保护奖励兑换成功') :
        '兑换成功';

      return {
        success: true,
        reward,
        message: successMessage,
        protectedByExpiry: reward.protectedByExpiry || false,
        partialProtection: reward.partialProtection || 0,
        actualCost,
        userId
      };
    } catch (error) {
      logger.error('RewardService', '兑换奖励事务处理失败', error);

      if (deductResult && deductResult.success) {
        await service._rollbackStarDeduction(actualCost, reward, userId, '兑换事务处理失败');
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

    const exchangeRecords = await service.starRecordRepository.getRecordsBySource(
      'reward_exchange',
      rewardId
    );

    if (exchangeRecords.length === 0) {
      logger.warn('RewardService', `取消奖励兑换: 未找到兑换记录, ID=${rewardId}`);
    }

    const latestRecord = exchangeRecords[0];
    const pointsToRefund = latestRecord ? Math.abs(latestRecord.points) : reward.points;

    const permanentGroup = await service.starGroupRepository.getOrCreateGroup(
      'permanent',
      null,
      '永久有效'
    );

    if (!permanentGroup) {
      logger.error('RewardService', `取消奖励兑换失败: 无法创建星星分组, ID=${rewardId}`);
      return { success: false, message: '退款星星失败' };
    }

    const updatedGroup = await service.starGroupRepository.addStarsToGroup(
      permanentGroup,
      pointsToRefund,
      `取消兑换奖励: ${reward.name}`
    );

    if (!updatedGroup) {
      logger.error('RewardService', `取消奖励兑换失败: 添加星星到分组失败, ID=${rewardId}`);
      return { success: false, message: '退款星星失败' };
    }

    const refundRecord = await service.starRecordRepository.save({
      type: 'income',
      source: 'reward_exchange_refund',
      sourceId: rewardId,
      points: pointsToRefund,
      description: `取消兑换奖励: ${reward.name}`,
      timestamp: Date.now(),
      balance: latestRecord ? latestRecord.previousBalance : pointsToRefund,
      previousBalance: latestRecord ? latestRecord.balance : 0
    });

    if (!refundRecord) {
      logger.error('RewardService', `取消奖励兑换: 创建退款记录失败, ID=${rewardId}`);
    }

    const unclaimed = await service.rewardRepository.unclaimReward(rewardId);

    if (!unclaimed) {
      logger.error('RewardService', `取消奖励兑换: 更新奖励状态失败, ID=${rewardId}`);
      return { success: false, message: '取消兑换失败，星星已退还' };
    }

    logger.info('RewardService', `取消奖励兑换成功: ${reward.name}, ID=${rewardId}, 退还星星=${pointsToRefund}`);
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

async function rollbackStarDeduction(service, actualCost, reward, userId, reason = '兑换奖励失败') {
  if (actualCost <= 0) {
    logger.info('RewardService', '无需回滚星星扣除，actualCost为0');
    return true;
  }

  try {
    logger.warn('RewardService', `开始回滚星星扣除操作, 用户=${userId}, 回滚数量=${actualCost}, 原因=${reason}`);

    const permanentGroup = await service.starGroupRepository.getOrCreateGroup(
      'permanent',
      null,
      '永久有效',
      userId
    );

    if (!permanentGroup) {
      logger.error('RewardService', '获取永久星星分组失败，回滚中止');
      return false;
    }

    await service.starGroupRepository.addStarsToGroup(
      permanentGroup,
      actualCost,
      `${reason}回滚: ${reward.name}`,
      userId
    );

    logger.info('RewardService', `星星回滚成功，退还${actualCost}颗星星, 用户=${userId}`);
    return true;
  } catch (rollbackError) {
    logger.error('RewardService', '星星回滚失败', rollbackError);
    return false;
  }
}

module.exports = {
  exchangeReward,
  cancelRewardExchange,
  rollbackStarDeduction
};
