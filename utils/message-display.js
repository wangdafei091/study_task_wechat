function sortMessagesByTimeDesc(messages = []) {
  return [...messages].sort((a, b) => Number(b.createTime || 0) - Number(a.createTime || 0));
}

function sortMessagesForPreview(messages = []) {
  return [...messages].sort((a, b) => {
    if (a.isRead !== b.isRead) {
      return a.isRead ? 1 : -1;
    }

    return Number(b.createTime || 0) - Number(a.createTime || 0);
  });
}

function attachTimeDisplay(messages = [], formatMessageTime = null) {
  return messages.map((message) => ({
    ...message,
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
  sortMessagesByTimeDesc,
  sortMessagesForPreview,
  attachTimeDisplay,
  recomputeDateDividers,
  buildPreviewMessages,
  buildTimelineMessages
};
