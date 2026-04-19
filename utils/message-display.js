const syncState = require('./sync-state');

function buildMessageDisplayScopeKey(message) {
  const visibilityScope = message && message.visibilityScope ? message.visibilityScope : 'unknown';
  const userId = message && message.userId ? message.userId : '';
  const familyId = message && message.familyId ? message.familyId : '';

  return [visibilityScope, userId, familyId].join('|');
}

function getMessageDisplayRank(message) {
  if (syncState.isFormalMessage(message)) {
    return 0;
  }

  if (syncState.isProvisionalMessage(message)) {
    return 1;
  }

  if (message && message.isLegacy === true) {
    return 3;
  }

  return 2;
}

function pickPreferredMessage(currentMessage, candidateMessage) {
  if (!currentMessage) {
    return candidateMessage;
  }

  const currentRank = getMessageDisplayRank(currentMessage);
  const candidateRank = getMessageDisplayRank(candidateMessage);
  if (candidateRank !== currentRank) {
    return candidateRank < currentRank ? candidateMessage : currentMessage;
  }

  const currentTime = Number(currentMessage.createTime || 0);
  const candidateTime = Number(candidateMessage.createTime || 0);
  return candidateTime >= currentTime ? candidateMessage : currentMessage;
}

// 在进入展示层之前按“同一消息流 + 同一事件”做一次语义去重，
// 避免 provisional/formal 双显，同时保留 user/family 两条不同流的消息。
function dedupeMessagesByEventKey(messages = []) {
  const dedupedMessages = [];
  const eventKeyIndexMap = new Map();

  (messages || []).forEach((message) => {
    const eventKey = message && message.messageEventKey;
    if (!eventKey) {
      dedupedMessages.push(message);
      return;
    }

    const dedupeKey = `${buildMessageDisplayScopeKey(message)}|${eventKey}`;
    const existingIndex = eventKeyIndexMap.get(dedupeKey);
    if (existingIndex === undefined) {
      eventKeyIndexMap.set(dedupeKey, dedupedMessages.length);
      dedupedMessages.push(message);
      return;
    }

    dedupedMessages[existingIndex] = pickPreferredMessage(dedupedMessages[existingIndex], message);
  });

  return dedupedMessages;
}

function sortMessagesByTimeDesc(messages = []) {
  return dedupeMessagesByEventKey(messages).sort((a, b) => Number(b.createTime || 0) - Number(a.createTime || 0));
}

function sortMessagesForPreview(messages = []) {
  return dedupeMessagesByEventKey(messages).sort((a, b) => {
    if (a.isRead !== b.isRead) {
      return a.isRead ? 1 : -1;
    }

    const rankDiff = getMessageDisplayRank(a) - getMessageDisplayRank(b);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    return Number(b.createTime || 0) - Number(a.createTime || 0);
  });
}

function attachTimeDisplay(messages = [], formatMessageTime = null) {
  return messages.map((message) => ({
    ...message,
    isWeakProvisional: syncState.isProvisionalMessage(message),
    syncMetaText: syncState.isProvisionalMessage(message) ? '本机暂存' : '',
    timeDisplay: typeof formatMessageTime === 'function'
      ? formatMessageTime(message.createTime)
      : message.timeDisplay
  }));
}

function recomputeDateDividers(messages = [], formatDate = null) {
  let lastDate = '';

  return messages.map((message) => {
    const dateDivider = typeof formatDate === 'function'
      ? formatDate(message.createTime)
      : '';
    const showDateDivider = dateDivider !== lastDate;
    lastDate = dateDivider;

    return {
      ...message,
      dateDivider,
      showDateDivider
    };
  });
}

function buildPreviewMessages(messages = [], options = {}) {
  const {
    limit = 3,
    formatMessageTime = null
  } = options;

  const previewMessages = sortMessagesForPreview(messages).slice(0, limit);
  return attachTimeDisplay(previewMessages, formatMessageTime);
}

function buildTimelineMessages(messages = [], options = {}) {
  const {
    formatMessageTime = null
  } = options;

  return attachTimeDisplay(sortMessagesByTimeDesc(messages), formatMessageTime);
}

module.exports = {
  dedupeMessagesByEventKey,
  sortMessagesByTimeDesc,
  sortMessagesForPreview,
  attachTimeDisplay,
  recomputeDateDividers,
  buildPreviewMessages,
  buildTimelineMessages
};
