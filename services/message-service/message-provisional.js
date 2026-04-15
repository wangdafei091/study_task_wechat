const logger = require('../../utils/logger');
const {
  Message,
  MessageType,
  MessagePriority,
  MessageVisibilityScope
} = require('../../models/message');

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function formatShanghaiDateFromTimestamp(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return '';
  }

  const date = new Date(timestamp + SHANGHAI_OFFSET_MS);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isHistoricalTaskOccurrence(taskDate, operationTime) {
  if (typeof taskDate !== 'string' || !taskDate) {
    return false;
  }

  const operationDate = formatShanghaiDateFromTimestamp(Number(operationTime || 0));
  return Boolean(operationDate && taskDate < operationDate);
}

function buildTaskMessageCopy(service, {
  action,
  taskTitle,
  taskDate = null,
  operationTime = null,
  actorUserId = null,
  actorRole = null,
  subjectUserId = null,
  actorName = null,
  subjectName = null,
  pending = false
}) {
  const safeActorName = actorName || service._normalizeDisplayName(null, actorRole);
  const safeSubjectName = subjectName || service._normalizeDisplayName(null, 'child');
  const isSelfAction = Boolean(actorUserId && subjectUserId && actorUserId === subjectUserId);
  const suffix = pending ? '，等待同步' : '';

  switch (action) {
    case 'create':
      return {
        userTitle: pending ? '新任务待同步' : '新任务已创建',
        userSummary: isSelfAction
          ? `你给自己安排了任务“${taskTitle}”${suffix}`
          : `${safeActorName}给你安排了任务“${taskTitle}”${suffix}`,
        familyTitle: pending ? '新任务待同步' : '任务已创建',
        familySummary: isSelfAction
          ? `${safeSubjectName}创建了任务“${taskTitle}”${suffix}`
          : `${safeActorName}给${safeSubjectName}创建了任务“${taskTitle}”${suffix}`,
        icon: '📝'
      };
    case 'update':
      return {
        userTitle: pending ? '任务更新待同步' : '任务已更新',
        userSummary: isSelfAction
          ? `你的任务“${taskTitle}”已更新${suffix}`
          : `${safeActorName}更新了你的任务“${taskTitle}”${suffix}`,
        familyTitle: pending ? '任务更新待同步' : '任务已更新',
        familySummary: isSelfAction
          ? `${safeSubjectName}更新了任务“${taskTitle}”${suffix}`
          : `${safeActorName}更新了${safeSubjectName}的任务“${taskTitle}”${suffix}`,
        icon: '✏️'
      };
    case 'delete':
      return {
        userTitle: pending ? '任务删除待同步' : '任务已删除',
        userSummary: isSelfAction
          ? `你的任务“${taskTitle}”已删除${suffix}`
          : `${safeActorName}删除了你的任务“${taskTitle}”${suffix}`,
        familyTitle: pending ? '任务删除待同步' : '任务已删除',
        familySummary: isSelfAction
          ? `${safeSubjectName}删除了任务“${taskTitle}”${suffix}`
          : `${safeActorName}删除了${safeSubjectName}的任务“${taskTitle}”${suffix}`,
        icon: '🗑️'
      };
    case 'complete':
      return {
        userTitle: pending ? '任务完成待同步' : '任务已完成',
        userSummary: isSelfAction
          ? `你完成了任务“${taskTitle}”${suffix}`
          : `${safeActorName}代你完成了任务“${taskTitle}”${suffix}`,
        familyTitle: pending ? '任务完成待同步' : '任务已完成',
        familySummary: isSelfAction
          ? `${safeSubjectName}完成了任务“${taskTitle}”${suffix}`
          : `${safeActorName}代${safeSubjectName}完成了任务“${taskTitle}”${suffix}`,
        icon: '✅'
      };
    case 'history_complete':
      return {
        userTitle: pending ? '补打卡完成待同步' : '历史任务已补打卡',
        userSummary: isSelfAction
          ? `你补打卡完成了${taskDate || '历史日期'}的任务“${taskTitle}”${suffix}`
          : `${safeActorName}代你补打卡完成了${taskDate || '历史日期'}的任务“${taskTitle}”${suffix}`,
        familyTitle: pending ? '补打卡完成待同步' : '历史任务已补打卡',
        familySummary: isSelfAction
          ? `${safeSubjectName}补打卡完成了${taskDate || '历史日期'}的任务“${taskTitle}”${suffix}`
          : `${safeActorName}代${safeSubjectName}补打卡完成了${taskDate || '历史日期'}的任务“${taskTitle}”${suffix}`,
        icon: '🗂️'
      };
    case 'makeup_complete':
      return {
        userTitle: pending ? '逾期补做待同步' : '任务已逾期补做',
        userSummary: isSelfAction
          ? `你逾期后补做了任务“${taskTitle}”${suffix}`
          : `${safeActorName}代你逾期后补做了任务“${taskTitle}”${suffix}`,
        familyTitle: pending ? '逾期补做待同步' : '任务已逾期补做',
        familySummary: isSelfAction
          ? `${safeSubjectName}逾期后补做了任务“${taskTitle}”${suffix}`
          : `${safeActorName}代${safeSubjectName}逾期后补做了任务“${taskTitle}”${suffix}`,
        icon: '♻️'
      };
    case 'reset': {
      const isHistoricalReset = isHistoricalTaskOccurrence(taskDate, operationTime);
      return {
        userTitle: pending
          ? (isHistoricalReset ? '历史任务重置待同步' : '任务重置待同步')
          : (isHistoricalReset ? '历史任务已重置' : '任务已重置'),
        userSummary: isSelfAction
          ? (isHistoricalReset
            ? `你将${taskDate || '历史日期'}的任务“${taskTitle}”重置为未完成${suffix}`
            : `你的任务“${taskTitle}”已重置为未完成${suffix}`)
          : (isHistoricalReset
            ? `${safeActorName}将你${taskDate || '历史日期'}的任务“${taskTitle}”重置为未完成${suffix}`
            : `${safeActorName}将你的任务“${taskTitle}”重置为未完成${suffix}`),
        familyTitle: pending
          ? (isHistoricalReset ? '历史任务重置待同步' : '任务重置待同步')
          : (isHistoricalReset ? '历史任务已重置' : '任务已重置'),
        familySummary: isSelfAction
          ? (isHistoricalReset
            ? `${safeSubjectName}将${taskDate || '历史日期'}的任务“${taskTitle}”重置为未完成${suffix}`
            : `${safeSubjectName}将任务“${taskTitle}”重置为未完成${suffix}`)
          : (isHistoricalReset
            ? `${safeActorName}将${safeSubjectName}${taskDate || '历史日期'}的任务“${taskTitle}”重置为未完成${suffix}`
            : `${safeActorName}将${safeSubjectName}的任务“${taskTitle}”重置为未完成${suffix}`),
        icon: '↩️'
      };
    }
    default:
      return {
        userTitle: pending ? '任务待同步' : '任务通知',
        userSummary: `任务“${taskTitle}”有新的状态变更${suffix}`,
        familyTitle: pending ? '任务待同步' : '任务通知',
        familySummary: `任务“${taskTitle}”有新的状态变更${suffix}`,
        icon: '📝'
      };
  }
}

async function createTaskProvisionalMessages(service, task, pendingSyncMeta) {
  if (!task || !pendingSyncMeta) {
    return [];
  }

  const createTime = pendingSyncMeta.modifyTime || pendingSyncMeta.createTime || Date.now();
  const familyId = pendingSyncMeta.familyId || null;
  const subjectUserId = pendingSyncMeta.targetUserId || task.userId || null;
  const action = pendingSyncMeta.action || 'create';
  const notificationType = pendingSyncMeta.notificationType || `task_${action}`;
  const messages = [];
  const eventKey = ['task', task.id || task.taskId, notificationType, subjectUserId || 'none', pendingSyncMeta.operatorUserId || 'none', pendingSyncMeta.operationKey].join(':');
  const actorUserId = pendingSyncMeta.operatorUserId || null;
  const actorRole = pendingSyncMeta.operatorRole || null;
  const actorName = service._getLocalUserDisplayName(actorUserId, actorRole);
  const subjectName = service._getLocalUserDisplayName(subjectUserId, 'child');
  const semanticAction = pendingSyncMeta.notificationType === 'task_history_complete'
    ? 'history_complete'
    : pendingSyncMeta.notificationType === 'task_makeup_complete'
      ? 'makeup_complete'
      : action;
  const actionCopy = buildTaskMessageCopy(service, {
    action: semanticAction,
    taskTitle: task.title,
    taskDate: task.date || null,
    operationTime: createTime,
    actorUserId,
    actorRole,
    subjectUserId,
    actorName,
    subjectName,
    pending: true
  });

  if (subjectUserId) {
    messages.push(new Message({
      userId: subjectUserId,
      familyId,
      subjectUserId,
      actorUserId: pendingSyncMeta.operatorUserId || null,
      operationKey: pendingSyncMeta.operationKey,
      messageEventKey: eventKey,
      visibilityScope: MessageVisibilityScope.USER,
      type: MessageType.TASK,
      notificationType,
      title: actionCopy.userTitle,
      summary: actionCopy.userSummary,
      relatedId: task.id || task.taskId || '',
      relatedType: 'task',
      icon: actionCopy.icon,
      priority: MessagePriority.MEDIUM,
      createTime,
      isProvisional: true,
      syncedToCloud: false
    }));
  }

  if (familyId) {
    messages.push(new Message({
      familyId,
      subjectUserId,
      actorUserId: pendingSyncMeta.operatorUserId || null,
      operationKey: pendingSyncMeta.operationKey,
      messageEventKey: eventKey,
      visibilityScope: MessageVisibilityScope.FAMILY,
      type: MessageType.TASK,
      notificationType,
      title: actionCopy.familyTitle,
      summary: actionCopy.familySummary,
      relatedId: task.id || task.taskId || '',
      relatedType: 'task',
      icon: actionCopy.icon,
      priority: MessagePriority.MEDIUM,
      createTime,
      isProvisional: true,
      syncedToCloud: false
    }));
  }

  if (messages.length > 0) {
    await service.messageRepository.batchAddMessages(messages);
    await service._emitMessageChangedEvent();
  }

  return messages;
}

async function createRewardProvisionalMessages(service, reward, pendingSyncMeta) {
  if (!reward || !pendingSyncMeta) {
    return [];
  }

  const createTime = pendingSyncMeta.modifyTime || pendingSyncMeta.createTime || Date.now();
  const familyId = pendingSyncMeta.familyId || reward.familyId || null;
  const action = pendingSyncMeta.action || 'create';
  const subjectUserId = pendingSyncMeta.exchangeUserId || reward.exchangeUserId || null;
  const messages = [];
  const eventKey = ['reward', reward.id || reward.rewardId, `reward_${action}`, subjectUserId || 'none', pendingSyncMeta.operatorUserId || 'none', pendingSyncMeta.operationKey].join(':');

  const actionCopy = {
    create: { title: '奖励创建待同步', summary: `奖励“${reward.name}”已保存在本机，等待同步`, icon: '🎁' },
    update: { title: '奖励更新待同步', summary: `奖励“${reward.name}”更新已保存在本机，等待同步`, icon: '🎁' },
    delete: { title: '奖励删除待同步', summary: `奖励“${reward.name}”删除已保存在本机，等待同步`, icon: '🗑️' },
    exchange: { title: '奖励兑换待同步', summary: `奖励“${reward.name}”兑换已保存在本机，等待同步`, icon: '⭐' }
  }[action] || { title: '奖励待同步', summary: `奖励“${reward.name}”变更已保存在本机，等待同步`, icon: '🎁' };

  if (action === 'exchange' && subjectUserId) {
    messages.push(new Message({
      userId: subjectUserId,
      familyId,
      subjectUserId,
      actorUserId: pendingSyncMeta.operatorUserId || null,
      operationKey: pendingSyncMeta.operationKey,
      messageEventKey: eventKey,
      visibilityScope: MessageVisibilityScope.USER,
      type: MessageType.REWARD,
      notificationType: pendingSyncMeta.notificationType || 'reward_exchange',
      title: actionCopy.title,
      summary: actionCopy.summary,
      relatedId: reward.id || reward.rewardId || '',
      relatedType: 'reward',
      icon: actionCopy.icon,
      priority: MessagePriority.MEDIUM,
      createTime,
      isProvisional: true,
      syncedToCloud: false
    }));
  }

  if (familyId) {
    messages.push(new Message({
      familyId,
      subjectUserId,
      actorUserId: pendingSyncMeta.operatorUserId || null,
      operationKey: pendingSyncMeta.operationKey,
      messageEventKey: eventKey,
      visibilityScope: MessageVisibilityScope.FAMILY,
      type: MessageType.REWARD,
      notificationType: pendingSyncMeta.notificationType || `reward_${action}`,
      title: actionCopy.title,
      summary: actionCopy.summary,
      relatedId: reward.id || reward.rewardId || '',
      relatedType: 'reward',
      icon: actionCopy.icon,
      priority: MessagePriority.MEDIUM,
      createTime,
      isProvisional: true,
      syncedToCloud: false
    }));
  }

  if (messages.length > 0) {
    await service.messageRepository.batchAddMessages(messages);
    await service._emitMessageChangedEvent();
  }

  return messages;
}

async function createProvisionalMessages(service, eventType, payload = {}) {
  if (!payload || !payload.pendingSyncMeta) {
    return [];
  }

  const pendingSyncMeta = payload.pendingSyncMeta;
  if (eventType === 'task') {
    return createTaskProvisionalMessages(service, payload.taskSnapshot || payload.task, pendingSyncMeta);
  }
  if (eventType === 'reward') {
    return createRewardProvisionalMessages(service, payload.rewardSnapshot || payload.reward, pendingSyncMeta);
  }
  return [];
}

function handleTaskCloudSyncFailed(service, payload) {
  if (!service.enableCloudStorage) {
    return;
  }
  createProvisionalMessages(service, 'task', payload).catch((error) => {
    logger.warn('MessageService', '创建任务 provisional 消息失败', error);
  });
}

function handleRewardCloudSyncFailed(service, payload) {
  if (!service.enableCloudStorage) {
    return;
  }
  createProvisionalMessages(service, 'reward', payload).catch((error) => {
    logger.warn('MessageService', '创建奖励 provisional 消息失败', error);
  });
}

module.exports = {
  buildTaskMessageCopy,
  createTaskProvisionalMessages,
  createRewardProvisionalMessages,
  createProvisionalMessages,
  handleTaskCloudSyncFailed,
  handleRewardCloudSyncFailed
};
