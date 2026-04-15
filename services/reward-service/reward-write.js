const logger = require('../../utils/logger');
const { Reward } = require('../../models/reward');
const { EVENTS } = require('../../utils/constants');

async function createReward(service, rewardData) {
  if (!rewardData || !rewardData.name || !rewardData.points) {
    logger.warn('RewardService', '创建奖励失败: 缺少必要数据', rewardData);
    return { success: false, message: '奖励数据不完整' };
  }

  try {
    if (!rewardData.userId) {
      if (service.userService) {
        rewardData.userId = service.userService.getCurrentUserId();
        logger.info('RewardService', `为奖励设置用户ID: ${rewardData.userId}`);
      } else {
        rewardData.userId = 'parent';
        logger.warn('RewardService', '用户服务不可用，奖励用户ID设为默认值: parent');
      }
    }

    const reward = new Reward(rewardData);
    reward.pendingSyncMeta = service._buildRewardPendingSyncMeta(reward, 'create', {
      operationKey: rewardData.operationKey || reward.modifyTime,
      modifyTime: reward.modifyTime
    });

    const savedReward = await service.rewardRepository.save(reward);

    logger.info('RewardService', `创建奖励成功: ${savedReward.name}, ID=${savedReward.id}`);
    service.eventBus.emit(EVENTS.REWARD_CREATED, { reward: savedReward });

    if (savedReward && service.enableCloudStorage) {
      service._syncRewardToCloud(savedReward).catch(async syncError => {
        logger.warn('RewardService', '奖励创建云同步失败，本地已保存', {
          rewardId: savedReward.id,
          error: syncError.message
        });
        await service._emitRewardCloudSyncFailure('create', savedReward, syncError);
      });
    }

    return { success: true, reward: savedReward, message: '创建成功' };
  } catch (error) {
    logger.error('RewardService', '创建奖励失败', error);
    return { success: false, message: '创建过程中发生错误' };
  }
}

async function updateReward(service, rewardId, rewardData) {
  if (!rewardId || !rewardData) {
    logger.warn('RewardService', '更新奖励失败: 缺少必要数据', { rewardId, rewardData });
    return { success: false, message: '参数不完整' };
  }

  try {
    const existingReward = await service.rewardRepository.getById(rewardId);

    if (!existingReward) {
      logger.warn('RewardService', `更新奖励失败: 未找到ID为${rewardId}的奖励`);
      return { success: false, message: '未找到指定的奖励' };
    }

    const updatedFields = [];
    Object.keys(rewardData).forEach(key => {
      if (rewardData[key] !== undefined && existingReward.hasOwnProperty(key)) {
        const oldValue = existingReward[key];
        existingReward[key] = rewardData[key];
        updatedFields.push(`${key}: ${oldValue} → ${rewardData[key]}`);
      }
    });
    existingReward.modifyTime = Date.now();
    existingReward.pendingSyncMeta = service._buildRewardPendingSyncMeta(existingReward, 'update', {
      operationKey: rewardData.operationKey || existingReward.modifyTime,
      modifyTime: existingReward.modifyTime
    });
    existingReward.syncedToCloud = false;

    logger.info('RewardService', `奖励更新字段: ${updatedFields.join(', ')}`);

    const updatedReward = await service.rewardRepository.save(existingReward);

    logger.info('RewardService', `更新奖励成功: ${updatedReward.name}, ID=${updatedReward.id}`);
    service.eventBus.emit(EVENTS.REWARD_UPDATED, {
      reward: updatedReward,
      previous: existingReward
    });

    if (updatedReward && service.enableCloudStorage) {
      service._syncRewardToCloud(updatedReward).catch(async syncError => {
        logger.warn('RewardService', '奖励更新云同步失败，本地已保存', {
          rewardId: updatedReward.id,
          error: syncError.message
        });
        await service._emitRewardCloudSyncFailure('update', updatedReward, syncError);
      });
    }

    return { success: true, reward: updatedReward, message: '更新成功' };
  } catch (error) {
    logger.error('RewardService', `更新奖励失败, ID=${rewardId}`, error);
    return { success: false, message: '更新过程中发生错误' };
  }
}

async function deleteReward(service, rewardId) {
  if (!rewardId) {
    logger.warn('RewardService', '删除奖励失败: 缺少奖励ID');
    return { success: false, message: '奖励ID不能为空' };
  }

  try {
    const reward = await service.rewardRepository.getById(rewardId);

    if (!reward) {
      logger.warn('RewardService', `删除奖励失败: 未找到ID为${rewardId}的奖励`);
      return { success: false, message: '未找到指定的奖励' };
    }

    if (reward.claimed) {
      logger.warn('RewardService', `删除奖励失败: 奖励已被领取，不能删除, ID=${rewardId}`);
      return { success: false, message: '已领取的奖励不能删除' };
    }

    const operatorContext = service._getOperatorContext();
    const deleteMeta = {
      entityType: 'reward',
      entityId: rewardId,
      operationKey: service._createOperationKey(Date.now()),
      operatorUserId: operatorContext.actorUserId,
      operatorRole: operatorContext.actorRole,
      familyId: operatorContext.familyId || reward.familyId || null,
      subjectUserId: null,
      notificationType: 'reward_delete',
      title: reward.name,
      summary: `奖励“${reward.name}”已删除`,
      createTime: Date.now()
    };

    await service._saveDeleteTombstone(deleteMeta);
    await service.rewardRepository.delete(rewardId);

    logger.info('RewardService', `删除奖励成功: ${reward.name}, ID=${rewardId}`);
    service.eventBus.emit(EVENTS.REWARD_DELETED, { reward });

    if (service.enableCloudStorage) {
      service._syncDeleteRewardToCloud(rewardId, deleteMeta).catch(syncError => {
        logger.warn('RewardService', '奖励删除云同步失败，本地已删除', {
          rewardId,
          error: syncError.message
        });
        service._emitRewardCloudSyncFailure('delete', null, syncError, {
          rewardId,
          pendingSyncMeta: deleteMeta,
          rewardSnapshot: reward,
          deleteMeta
        });
      });
    }

    return { success: true, message: '删除成功' };
  } catch (error) {
    logger.error('RewardService', `删除奖励失败, ID=${rewardId}`, error);
    return { success: false, message: '删除过程中发生错误' };
  }
}

async function toggleRewardStatus(service, rewardId, enabled) {
  if (!rewardId) {
    logger.warn('RewardService', '切换奖励状态失败: 缺少奖励ID');
    return { success: false, message: '奖励ID不能为空' };
  }

  try {
    const reward = await service.rewardRepository.getById(rewardId);

    if (!reward) {
      logger.warn('RewardService', `切换奖励状态失败: 未找到ID为${rewardId}的奖励`);
      return { success: false, message: '未找到指定的奖励' };
    }

    if (reward.claimed) {
      logger.warn('RewardService', `切换奖励状态失败: 奖励已被领取，不能修改状态, ID=${rewardId}`);
      return { success: false, message: '已领取的奖励不能修改状态' };
    }

    if (reward.enabled === enabled) {
      logger.info('RewardService', `奖励状态已经是${enabled ? '启用' : '禁用'}, ID=${rewardId}`);
      return { success: true, reward, message: `奖励已经是${enabled ? '启用' : '禁用'}状态` };
    }

    if (enabled) {
      reward.enable();
      logger.info('RewardService', `启用奖励: ${reward.name}, ID=${rewardId}`);
    } else {
      reward.disable();
      logger.info('RewardService', `禁用奖励: ${reward.name}, ID=${rewardId}`);
    }

    const updatedReward = await service.rewardRepository.save(reward);

    logger.info('RewardService', `切换奖励状态成功: ${updatedReward.name}, ID=${rewardId}, 状态=${enabled ? '启用' : '禁用'}`);
    service.eventBus.emit(EVENTS.REWARD_STATUS_CHANGED, {
      reward: updatedReward,
      enabled
    });

    return { success: true, reward: updatedReward, message: `奖励已${enabled ? '启用' : '禁用'}` };
  } catch (error) {
    logger.error('RewardService', `切换奖励状态失败, ID=${rewardId}, enabled=${enabled}`, error);
    return { success: false, message: '操作过程中发生错误' };
  }
}

async function duplicateReward(service, rewardId) {
  if (!rewardId) {
    logger.warn('RewardService', '复制奖励失败: 缺少奖励ID');
    return null;
  }

  try {
    const originalReward = await service.rewardRepository.getById(rewardId);

    if (!originalReward) {
      logger.warn('RewardService', `复制奖励失败: 未找到ID为${rewardId}的奖励`);
      return null;
    }

    logger.info('RewardService', `准备复制奖励: ${originalReward.name}, ID=${rewardId}`);

    const newRewardData = {
      name: originalReward.name,
      description: originalReward.description,
      type: originalReward.type,
      points: originalReward.points,
      icon: originalReward.icon,
      tags: [...(originalReward.tags || [])],
      notes: originalReward.notes,
      enabled: true,
      claimed: false,
      originRewardId: rewardId
    };

    const newReward = await service.createReward(newRewardData);

    if (newReward) {
      logger.info('RewardService', `复制奖励成功: 从"${originalReward.name}"创建了新奖励, 新ID=${newReward.id}`);
      service.eventBus.emit(EVENTS.REWARD_DUPLICATED, {
        newReward,
        originalReward
      });
    }

    return newReward;
  } catch (error) {
    logger.error('RewardService', `复制奖励失败, ID=${rewardId}`, error);
    return null;
  }
}

async function deleteRewards(service, rewardIds) {
  if (!Array.isArray(rewardIds) || rewardIds.length === 0) {
    logger.warn('RewardService', '批量删除奖励失败: 无效的ID数组');
    return { success: false, message: '无效的ID数组' };
  }

  try {
    const deletedCount = await service.rewardRepository.deleteMany(rewardIds);
    service.clearCache();

    logger.info('RewardService', `批量删除奖励成功: 删除了${deletedCount}个奖励`);
    service.eventBus.emit(EVENTS.REWARD_DELETED_BATCH, { rewardIds });

    return { success: true, count: deletedCount };
  } catch (error) {
    logger.error('RewardService', '批量删除奖励失败', error);
    return { success: false, message: '批量删除过程中发生错误' };
  }
}

module.exports = {
  createReward,
  updateReward,
  deleteReward,
  toggleRewardStatus,
  duplicateReward,
  deleteRewards
};
