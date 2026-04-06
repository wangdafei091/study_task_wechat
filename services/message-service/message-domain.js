const logger = require('../../utils/logger');
const {
  Message,
  MessageType,
  NotificationType,
  MessagePriority
} = require('../../models/message');
const { EVENTS } = require('../../utils/constants');

function buildTaskLocalMessageMeta(service, task, notificationType, options = {}) {
  const { isBatchOperation, batchCount, priority, operatorUserId } = options;
  const operator = service._resolveOperatorIdentity(operatorUserId);
  const isChildOperator = operator.role === 'child';
  const isParentOperator = operator.role === 'parent';

  if (
    [NotificationType.COMPLETED, NotificationType.MAKEUP_COMPLETED, NotificationType.UPDATED].includes(notificationType) &&
    isParentOperator
  ) {
    logger.info('MessageService', `家长操作，跳过消息创建: ${task.title}, 操作类型=${notificationType}, 操作者=${operator.userId}`);
    return null;
  }

  let title;
  let summary;
  let icon;

  switch (notificationType) {
    case NotificationType.NEW:
      title = '新任务提醒';
      summary = isBatchOperation
        ? `您有${batchCount}个"${task.title}"循环任务已添加到计划中`
        : `您有新的任务"${task.title}"已添加到计划中`;
      icon = '📝';
      break;
    case NotificationType.UPCOMING:
      title = '任务即将到期';
      summary = `您的任务"${task.title}"将在不久后到期，请及时完成`;
      icon = '⏰';
      break;
    case NotificationType.UPDATED:
      title = '任务已更新';
      summary = isBatchOperation
        ? `已更新${batchCount}个"${task.title}"循环任务`
        : `任务"${task.title}"的内容已被更新`;
      icon = '✏️';
      break;
    case NotificationType.COMPLETED:
      title = '任务已完成';
      summary = isChildOperator
        ? `您的孩子完成了任务"${task.title}"`
        : `恭喜您完成了任务"${task.title}"`;
      icon = '✅';
      break;
    case NotificationType.MAKEUP_COMPLETED:
      title = '任务已逾期补做';
      summary = isChildOperator
        ? `您的孩子逾期后补做了任务"${task.title}"，已退回星星`
        : `您逾期后补做了任务"${task.title}"，已退回星星`;
      icon = '♻️';
      break;
    case NotificationType.REQUIRED:
      title = '必做任务提醒';
      summary = `请务必完成任务"${task.title}"，否则将扣除星星`;
      icon = '⚠️';
      break;
    case NotificationType.DELETED:
      title = '任务已删除';
      summary = isBatchOperation
        ? `已删除${batchCount}个"${task.title}"循环任务`
        : `任务"${task.title}"已被删除`;
      icon = '🗑️';
      break;
    default:
      title = '任务通知';
      summary = `任务"${task.title}"有新的状态变更`;
      icon = '🔔';
  }

  let targetUserId;
  if (isChildOperator) {
    targetUserId = service._getUserIdByRole('parent');
    logger.info('MessageService', `小朋友操作，任务消息发给家长: ${task.title}, 操作类型=${notificationType}`);
  } else if (isParentOperator && notificationType === NotificationType.NEW) {
    targetUserId = task.userId || service._getUserIdByRole('child');
    logger.info('MessageService', `家长创建任务，消息发给小朋友: ${task.title}`);
  } else {
    targetUserId = task.userId || service.userService?.getCurrentUserId?.() || 'parent';
  }

  return {
    userId: targetUserId,
    title,
    summary,
    icon,
    priority: priority || MessagePriority.MEDIUM
  };
}

function prepareTaskMessageData(service, task, notificationType, options = {}) {
  const messageMeta = buildTaskLocalMessageMeta(service, task, notificationType, options);
  if (!messageMeta) {
    return null;
  }

  return {
    userId: messageMeta.userId,
    type: MessageType.TASK,
    notificationType,
    relatedId: task.id,
    title: messageMeta.title,
    summary: messageMeta.summary,
    icon: messageMeta.icon,
    isBatchOperation: options.isBatchOperation,
    batchCount: options.batchCount,
    priority: messageMeta.priority
  };
}

async function createMessageWithDomainModel(service, messageData) {
  try {
    const message = new Message(messageData);
    const errors = message.validate();
    if (errors.length > 0) {
      logger.warn('MessageService', `消息验证失败: ${errors.join(', ')}`, messageData);
      return null;
    }

    const savedMessage = await service.messageRepository.addMessage(message);
    logger.info('MessageService', `使用领域模型创建消息成功: ${savedMessage.id}`);
    service.eventBus.emit(EVENTS.DOMAIN_MESSAGE_CREATED, { message: savedMessage });
    return savedMessage;
  } catch (error) {
    logger.error('MessageService', '使用领域模型创建消息失败', error);
    throw error;
  }
}

async function createTaskMessageWithDomainModel(service, task, notificationType, options = {}) {
  const messageData = prepareTaskMessageData(service, task, notificationType, options);
  if (!messageData) {
    return null;
  }
  return createMessageWithDomainModel(service, messageData);
}

async function createSystemMessageWithDomainModel(service, content, type = 'system', options = {}) {
  let title;
  let icon;
  const { priority, title: customTitle, summary: customSummary } = options;

  switch (type) {
    case 'reward':
      title = '星星奖励';
      icon = '⭐';
      break;
    case 'penalty':
      title = '星星扣除';
      icon = '⚠️';
      break;
    case 'achievement':
      title = '成就达成';
      icon = '🏆';
      break;
    case 'welcome':
      title = '欢迎使用小CEO日程表';
      icon = '🎉';
      break;
    default:
      title = '系统通知';
      icon = '🔔';
  }

  if (customTitle) {
    title = customTitle;
  }

  return createMessageWithDomainModel(service, {
    userId: 'shared',
    type: MessageType.SYSTEM,
    notificationType: type,
    title,
    summary: customSummary || content,
    content,
    icon,
    priority: priority || MessagePriority.MEDIUM
  });
}

async function createPenaltyMessageWithDomainModel(service, task, points) {
  return createMessageWithDomainModel(service, {
    userId: service.userService ? service.userService.getCurrentUserId() : 'parent',
    type: MessageType.PENALTY,
    relatedId: task.id,
    title: '星星扣除提醒',
    summary: `必做任务"${task.title}"未完成，已扣除${points}颗星星`,
    content: `您的必做任务"${task.title}"未能按时完成，系统已扣除${points}颗星星。请继续努力，按时完成任务！`,
    icon: '⚠️',
    priority: MessagePriority.HIGH
  });
}

async function getAllMessagesWithDomainModel(service, options = {}) {
  try {
    const resolved = service._resolveScopeOptions(options);
    const messages = await service._getScopedMessagesForDisplay(resolved);
    logger.info('MessageService', `使用领域模型获取所有消息成功: ${messages.length}条`);
    return service._compactMessagesForDisplay(messages);
  } catch (error) {
    logger.error('MessageService', '使用领域模型获取所有消息失败', error);
    return [];
  }
}

async function getUnreadCountWithDomainModel(service, options = {}) {
  try {
    const messages = await getAllMessagesWithDomainModel(service, options);
    const count = messages.filter((message) => !message.isRead).length;
    logger.info('MessageService', `使用领域模型获取未读消息数量成功: ${count}条`);
    return count;
  } catch (error) {
    logger.error('MessageService', '使用领域模型获取未读消息数量失败', error);
    return 0;
  }
}

async function markMessageAsReadWithDomainModel(service, messageId) {
  try {
    const result = await service.messageRepository.markAsRead(messageId);
    if (result) {
      service.eventBus.emit(EVENTS.DOMAIN_MESSAGE_READ, { messageId });
      logger.info('MessageService', `使用领域模型标记消息${messageId}为已读成功`);
      return true;
    }
    logger.warn('MessageService', `使用领域模型标记消息${messageId}为已读失败`);
    return false;
  } catch (error) {
    logger.error('MessageService', `使用领域模型标记消息为已读失败, ID=${messageId}`, error);
    return false;
  }
}

async function markAllMessagesAsReadWithDomainModel(service, options = {}, visibleMessages = null) {
  try {
    const resolved = service._resolveScopeOptions(options);
    const messages = visibleMessages || await service._getScopedMessagesForDisplay(resolved);
    const unreadMessages = messages.filter((message) => !message.isRead);
    const count = unreadMessages.length;

    if (count === 0) {
      return 0;
    }

    await service.messageRepository.batchMarkAsRead(unreadMessages.map((message) => message.markAsRead()));
    service.eventBus.emit(EVENTS.DOMAIN_MESSAGE_ALL_READ, { count });
    logger.info('MessageService', `使用领域模型标记所有消息为已读成功: ${count}条`);
    return count;
  } catch (error) {
    logger.error('MessageService', '使用领域模型标记所有消息为已读失败', error);
    return 0;
  }
}

async function deleteMessageWithDomainModel(service, messageId) {
  try {
    const result = await service.messageRepository.delete(messageId);
    if (result) {
      service.eventBus.emit(EVENTS.DOMAIN_MESSAGE_DELETED, { messageId });
      logger.info('MessageService', `使用领域模型删除消息${messageId}成功`);
      return true;
    }
    logger.warn('MessageService', `使用领域模型删除消息${messageId}失败`);
    return false;
  } catch (error) {
    logger.error('MessageService', `使用领域模型删除消息失败, ID=${messageId}`, error);
    return false;
  }
}

async function deleteRelatedMessagesWithDomainModel(service, entityId) {
  try {
    const count = await service.messageRepository.deleteRelatedMessages(entityId);
    if (count > 0) {
      service.eventBus.emit(EVENTS.DOMAIN_MESSAGE_RELATED_DELETED, { entityId, count });
    }
    logger.info('MessageService', `使用领域模型删除与实体${entityId}相关的消息成功: ${count}条`);
    return count;
  } catch (error) {
    logger.error('MessageService', `使用领域模型删除相关消息失败, 实体ID=${entityId}`, error);
    return 0;
  }
}

async function updateTaskMessagesWithDomainModel(service, task) {
  try {
    const count = await service.messageRepository.updateTaskMessages(task);
    if (count > 0) {
      service.eventBus.emit(EVENTS.DOMAIN_MESSAGE_TASK_UPDATED, { taskId: task.id, count });
    }
    logger.info('MessageService', `使用领域模型更新任务消息成功: ${count}条`);
    return count;
  } catch (error) {
    logger.error('MessageService', `使用领域模型更新任务消息失败, 任务ID=${task.id}`, error);
    return 0;
  }
}

async function getMessageStatsWithDomainModel(service) {
  try {
    const stats = await service.messageRepository.getMessageStats();
    logger.info('MessageService', '使用领域模型获取消息统计信息成功');
    return stats;
  } catch (error) {
    logger.error('MessageService', '使用领域模型获取消息统计信息失败', error);
    return {
      total: 0,
      unread: 0,
      today: 0,
      highPriority: 0,
      byType: {}
    };
  }
}

async function cleanExpiredMessagesWithDomainModel(service, expiryDays = 30) {
  try {
    const count = await service.messageRepository.cleanExpiredMessages(expiryDays);
    if (count > 0) {
      service.eventBus.emit(EVENTS.DOMAIN_MESSAGE_CLEANED, { count, expiryDays });
    }
    logger.info('MessageService', `使用领域模型清理过期消息成功: ${count}条`);
    return count;
  } catch (error) {
    logger.error('MessageService', '使用领域模型清理过期消息失败', error);
    return 0;
  }
}

async function getHighPriorityMessagesWithDomainModel(service) {
  try {
    const unreadMessages = await service.messageRepository.getUnreadMessages();
    const highPriorityMessages = unreadMessages.filter((message) => message.isHighPriority());
    logger.info('MessageService', `使用领域模型获取高优先级未读消息成功: ${highPriorityMessages.length}条`);
    return highPriorityMessages;
  } catch (error) {
    logger.error('MessageService', '使用领域模型获取高优先级未读消息失败', error);
    return [];
  }
}

async function migrateMessageData(service) {
  try {
    logger.info('MessageService', '开始迁移消息数据到领域模型');
    const oldMessages = await new Promise((resolve) => {
      service.messageManager.getAllMessages((messages) => resolve(messages || []));
    });

    if (oldMessages.length === 0) {
      logger.info('MessageService', '没有消息需要迁移');
      return { migrated: 0, total: 0 };
    }

    const newMessages = oldMessages.map((old) => new Message(old));
    await service.messageRepository.saveAll(newMessages);
    logger.info('MessageService', `成功迁移${newMessages.length}条消息数据到领域模型`);
    return { migrated: newMessages.length, total: oldMessages.length };
  } catch (error) {
    logger.error('MessageService', '迁移消息数据到领域模型失败', error);
    return { migrated: 0, total: 0, error: error.message };
  }
}

async function createRewardMessageWithDomainModel(service, reward, action, options = {}) {
  const { operatorUserId } = options;
  const operator = service._resolveOperatorIdentity(operatorUserId);
  const isChildOperator = operator.role === 'child';
  const isParentOperator = operator.role === 'parent';
  const exchangeUserId = reward.exchangeUserId || reward.userId || null;
  const isProxyAction = Boolean(
    operator.userId &&
    exchangeUserId &&
    operator.userId !== exchangeUserId
  );

  let title;
  let summary;
  let icon;

  switch (action) {
    case 'created':
      title = '新奖励已添加';
      summary = `您已成功添加新奖励"${reward.name}"，需要${reward.points}颗星星兑换`;
      icon = '✨';
      break;
    case 'claimed':
      title = '奖励已兑换';
      if (isProxyAction) {
        summary = `家长为您兑换了奖励"${reward.name}"，花费了${reward.points}颗星星`;
      } else if (isChildOperator) {
        summary = `您的孩子兑换了奖励"${reward.name}"，花费了${reward.points}颗星星`;
      } else {
        summary = `您已成功兑换奖励"${reward.name}"，花费了${reward.points}颗星星`;
      }
      icon = '🎁';
      break;
    case 'delivered':
      title = '奖励已领取';
      summary = `您已成功领取奖励"${reward.name}"`;
      icon = '🎉';
      break;
    case 'unclaimed':
      title = '奖励兑换已取消';
      if (isProxyAction) {
        summary = `家长取消了您兑换的奖励"${reward.name}"，退回${reward.points}颗星星`;
      } else if (isChildOperator) {
        summary = `您的孩子取消了兑换奖励"${reward.name}"，退回${reward.points}颗星星`;
      } else {
        summary = `您已取消兑换奖励"${reward.name}"，退回${reward.points}颗星星`;
      }
      icon = '↩️';
      break;
    default:
      title = '奖励通知';
      summary = `您的奖励"${reward.name}"有新的状态变更`;
      icon = '🔔';
  }

  let targetUserId;
  if (isChildOperator) {
    targetUserId = service._getUserIdByRole('parent');
    logger.info('MessageService', `小朋友操作，奖励消息发给家长: ${reward.name}, 操作类型=${action}`);
  } else if (isParentOperator && action === 'created') {
    targetUserId = service._getUserIdByRole('child');
    logger.info('MessageService', `家长创建奖励，消息发给小朋友: ${reward.name}`);
  } else {
    targetUserId = service.userService ? service.userService.getCurrentUserId() : 'parent';
  }

  return createMessageWithDomainModel(service, {
    userId: targetUserId,
    type: MessageType.REWARD,
    notificationType: action,
    relatedId: reward.id,
    title,
    summary,
    icon,
    priority: MessagePriority.MEDIUM
  });
}

module.exports = {
  buildTaskLocalMessageMeta,
  prepareTaskMessageData,
  createMessageWithDomainModel,
  createTaskMessageWithDomainModel,
  createSystemMessageWithDomainModel,
  createPenaltyMessageWithDomainModel,
  getAllMessagesWithDomainModel,
  getUnreadCountWithDomainModel,
  markMessageAsReadWithDomainModel,
  markAllMessagesAsReadWithDomainModel,
  deleteMessageWithDomainModel,
  deleteRelatedMessagesWithDomainModel,
  updateTaskMessagesWithDomainModel,
  getMessageStatsWithDomainModel,
  cleanExpiredMessagesWithDomainModel,
  getHighPriorityMessagesWithDomainModel,
  migrateMessageData,
  createRewardMessageWithDomainModel
};
