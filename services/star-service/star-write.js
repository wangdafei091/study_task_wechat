const logger = require('../../utils/logger');
const { EVENTS } = require('../../utils/constants');
const { StarExpiryType } = require('../../models/star');

async function addStars(service, points, expiryType, source, options = {}) {
  if (points <= 0) {
    logger.warn('StarService', `添加星星失败: 星星数量必须大于0, 实际值=${points}`);
    return { success: false, message: '星星数量必须大于0' };
  }

  if (!expiryType || !Object.values(StarExpiryType).includes(expiryType)) {
    logger.warn('StarService', `添加星星失败: 无效的过期类型: ${expiryType}`);
    return { success: false, message: '无效的过期类型' };
  }

  try {
    const { userId } = options;
    const expiryDate = service._calculateExpiryDate(expiryType);
    const expiryDateStr = expiryDate ? service._formatExpiryDate(expiryDate) : '';

    logger.info('StarService', `添加星星: 过期类型=${expiryType}, 过期时间=${expiryDate ? expiryDate.getTime() : null}, 过期日期字符串=${expiryDateStr}${userId ? `, 用户=${userId}` : ''}`);

    const group = await service.starGroupRepository.getOrCreateGroup(
      expiryType,
      expiryDate ? expiryDate.getTime() : null,
      expiryDateStr,
      userId
    );

    if (!group) {
      logger.error('StarService', `添加星星失败: 无法获取或创建星星分组, 类型=${expiryType}${userId ? `, 用户=${userId}` : ''}`);
      return { success: false, message: '无法创建星星分组' };
    }

    const updatedGroup = await service.starGroupRepository.addStarsToGroup(group, points, source);
    if (!updatedGroup) {
      logger.error('StarService', `添加星星失败: 无法添加星星到分组, 类型=${expiryType}, 数量=${points}${userId ? `, 用户=${userId}` : ''}`);
      return { success: false, message: '无法添加星星到分组' };
    }

    const recordData = {
      type: 'income',
      source: options.sourceType || 'manual',
      sourceId: options.sourceId || '',
      points,
      description: source || '手动添加星星',
      timestamp: Date.now(),
      expiryType,
      expiryDate: service._normalizeExpiryDateValue(expiryDate),
      syncedToCloud: false
    };

    if (userId) {
      recordData.userId = userId;
    }

    const record = await service.starRecordRepository.save(recordData);
    if (!record) {
      logger.error('StarService', `添加星星: 创建记录失败, 类型=${expiryType}, 数量=${points}${userId ? `, 用户=${userId}` : ''}`);
    }

    logger.info('StarService', `添加星星成功, 类型=${expiryType}, 数量=${points}, 来源=${source || '未知'}${userId ? `, 用户=${userId}` : ''}`);
    logger.info('StarService', `更新后的分组信息: ID=${updatedGroup.id}, 当前星星数=${updatedGroup.stars}(${typeof updatedGroup.stars}), 过期类型=${updatedGroup.expiryType}`);

    service.eventBus.emit(EVENTS.STARS_ADDED, {
      points,
      expiryType,
      group: updatedGroup,
      record
    });

    if (record && service.enableCloudStorage) {
      service._syncStarRecordToCloud(record).catch(syncError => {
        logger.warn('StarService', '星星收入云同步失败，本地已保存', {
          recordId: record.id,
          error: syncError.message
        });
      });
    }

    return {
      success: true,
      points,
      group: updatedGroup,
      record,
      message: '添加星星成功'
    };
  } catch (error) {
    logger.error('StarService', `添加星星失败, 类型=${expiryType}, 数量=${points}`, error);
    return { success: false, message: '添加星星过程中发生错误' };
  }
}

async function consumeStars(service, points, reason, options = {}) {
  if (points <= 0) {
    logger.warn('StarService', `消费星星失败: 星星数量必须大于0, 实际值=${points}`);
    return { success: false, message: '星星数量必须大于0' };
  }

  try {
    const { userId, sourceType, sourceId, originalTaskDate } = options;
    const consumeIdempotencyKey = service._buildConsumeIdempotencyKey(options);
    const consumeResult = await service.starGroupRepository.consumeStarsByExpiryOrder(points, userId);

    if (!consumeResult.success && consumeResult.consumed === 0) {
      logger.warn('StarService', `消费星星失败: 没有可用星星${userId ? `, 用户=${userId}` : ''}`);
      return {
        success: false,
        consumed: 0,
        message: '没有可用的星星'
      };
    }

    const actualConsumed = consumeResult.consumed || 0;
    let record;
    if (sourceType === 'task_penalty' && sourceId) {
      record = await service.starRecordRepository.createPenaltyRecord(
        sourceId,
        actualConsumed,
        reason,
        userId,
        originalTaskDate,
        points,
        consumeIdempotencyKey
      );
    } else {
      const recordData = {
        type: 'expense',
        source: sourceType || 'manual',
        sourceId: sourceId || '',
        points: -actualConsumed,
        description: reason || '手动消费星星',
        timestamp: Date.now(),
        idempotencyKey: consumeIdempotencyKey
      };

      if (userId) {
        recordData.userId = userId;
      }

      record = await service.starRecordRepository.save(recordData);
    }

    if (!record) {
      logger.error('StarService', `消费星星: 创建记录失败, 实际扣减=${actualConsumed}, 原因=${reason || '未知'}${userId ? `, 用户=${userId}` : ''}`);
    }

    const isFullyConsumed = actualConsumed === points;
    const resultMessage = isFullyConsumed ? '消费星星成功' : `星星余额不足，已扣减${actualConsumed}颗星星`;

    logger.info('StarService', `消费星星完成, 请求=${points}, 实际扣减=${actualConsumed}, 原因=${reason || '未知'}${userId ? `, 用户=${userId}` : ''}`);

    service.eventBus.emit(EVENTS.STARS_CONSUMED, {
      points: actualConsumed,
      reason,
      groups: consumeResult.groupsUpdated,
      record
    });

    if (actualConsumed > 0 && service.enableCloudStorage) {
      service._syncConsumeToCloud(points, reason, {
        ...options,
        requestedPoints: points,
        idempotencyKey: consumeIdempotencyKey
      }).catch(syncError => {
        logger.warn('StarService', '通用扣星云同步失败，本地已保存', {
          requestedPoints: points,
          error: syncError.message
        });
      });
    }

    return {
      success: actualConsumed > 0,
      points: actualConsumed,
      consumed: actualConsumed,
      requested: points,
      groups: consumeResult.groupsUpdated,
      record,
      message: resultMessage
    };
  } catch (error) {
    logger.error('StarService', `消费星星失败, 数量=${points}, 原因=${reason || '未知'}`, error);
    return { success: false, message: '消费星星过程中发生错误' };
  }
}

async function handleTaskCompletion(service, task, points) {
  if (!task || !task.id) {
    logger.warn('StarService', '处理任务完成奖励失败: 无效的任务');
    return { success: false, message: '无效的任务' };
  }

  if (points <= 0) {
    logger.warn('StarService', `处理任务完成奖励失败: 星星数量必须大于0, 实际值=${points}, 任务ID=${task.id}`);
    return { success: false, message: '星星数量必须大于0' };
  }

  try {
    const expiryType = task.starExpiryType || StarExpiryType.WEEK;
    const result = await service.addStars(
      points,
      expiryType,
      `完成任务: ${task.name || task.id}`,
      {
        sourceType: 'task_complete',
        sourceId: task.id,
        userId: task.userId
      }
    );

    if (!result.success) {
      logger.error('StarService', `处理任务完成奖励失败, 任务ID=${task.id}, 星星数=${points}${task.userId ? `, 用户=${task.userId}` : ''}`);
      return result;
    }

    const record = result.record || null;
    logger.info('StarService', `处理任务完成奖励成功, 任务ID=${task.id}, 星星数=${points}, 过期类型=${expiryType}`);

    service.eventBus.emit(EVENTS.TASK_COMPLETED_WITH_REWARD, {
      task,
      points,
      expiryType,
      record
    });

    return {
      ...result,
      task,
      record,
      message: '任务完成奖励处理成功'
    };
  } catch (error) {
    logger.error('StarService', `处理任务完成奖励失败, 任务ID=${task.id}, 星星数=${points}`, error);
    return { success: false, message: '处理任务完成奖励过程中发生错误' };
  }
}

async function consumeStarsUnified(service, params) {
  const { points, reason, strategy = 'expiry_order', expiryType, options = {} } = params;

  if (points <= 0) {
    logger.warn('StarService', `统一扣星失败: 星星数量必须大于0, 实际值=${points}`);
    return { success: false, message: '星星数量必须大于0' };
  }

  logger.info('StarService', `使用统一接口消费星星: 数量=${points}, 策略=${strategy}, 原因=${reason}`);

  try {
    switch (strategy) {
      case 'expiry_order':
        return await service.consumeStars(points, reason, options);
      case 'specific_type':
        if (!expiryType) {
          logger.warn('StarService', '使用specific_type策略时必须指定expiryType');
          return { success: false, message: '使用特定类型策略时必须指定有效期类型' };
        }
        return await service.consumeStarsFromSpecificType(points, expiryType, reason, options);
      default:
        logger.warn('StarService', `未知的消费策略: ${strategy}`);
        return { success: false, message: '未知的消费策略' };
    }
  } catch (error) {
    logger.error('StarService', `统一扣星接口执行失败: 策略=${strategy}`, error);
    return { success: false, message: '扣星操作失败' };
  }
}

async function consumeStarsFromSpecificType(service, points, expiryType, reason, options = {}) {
  if (points <= 0) {
    logger.warn('StarService', `从特定类型消费星星失败: 星星数量必须大于0, 实际值=${points}`);
    return { success: false, message: '星星数量必须大于0' };
  }

  if (!expiryType) {
    logger.warn('StarService', '从特定类型消费星星失败: 未指定有效期类型');
    return { success: false, message: '未指定有效期类型' };
  }

  try {
    logger.info('StarService', `开始从特定类型消费星星, 数量=${points}, 类型=${expiryType}, 原因=${reason}`);
    const deductResult = await service.starGroupRepository.deductStarsFromSpecificExpiryType(
      points,
      expiryType,
      reason,
      options.userId || null
    );

    if (!deductResult.success) {
      logger.error('StarService', `从特定类型消费星星失败: ${deductResult.message}`);
      return deductResult;
    }

    const record = await service.starRecordRepository.save({
      type: 'expense',
      source: options.sourceType || 'task_reset',
      sourceId: options.sourceId || '',
      points: -points,
      description: reason || '取消任务完成',
      timestamp: Date.now(),
      userId: options.userId || null,
      originalTaskDate: options.originalTaskDate || null,
      expiryType,
      syncedToCloud: false
    });

    if (!record) {
      logger.error('StarService', `从特定类型消费星星: 创建记录失败, 数量=${points}, 类型=${expiryType}`);
    }

    logger.info('StarService', `从特定类型消费星星成功, 数量=${points}, 类型=${expiryType}, 原因=${reason}`);

    service.eventBus.emit(EVENTS.STARS_CONSUMED, {
      points,
      expiryType,
      reason,
      groups: deductResult.deductedGroups,
      record
    });

    if (record && service.enableCloudStorage) {
      service._syncStarRecordToCloud(record).catch(syncError => {
        logger.warn('StarService', '特定类型扣星云同步失败，本地已保存', {
          recordId: record.id,
          error: syncError.message
        });
      });
    }

    return {
      success: true,
      points,
      consumed: points,
      groups: deductResult.deductedGroups,
      record,
      message: '从特定类型消费星星成功'
    };
  } catch (error) {
    logger.error('StarService', `从特定类型消费星星失败, 数量=${points}, 类型=${expiryType}`, error);
    return { success: false, message: '从特定类型消费星星过程中发生错误' };
  }
}

module.exports = {
  addStars,
  consumeStars,
  handleTaskCompletion,
  consumeStarsUnified,
  consumeStarsFromSpecificType
};
