function isPendingSyncOccurrenceRecord(entity) {
  if (!entity || typeof entity !== 'object') {
    return false;
  }

  if (entity.executionMode && entity.executionMode !== 'occurrence') {
    return false;
  }

  if (entity.isOccurrenceRecord === false) {
    return false;
  }

  return Boolean(entity.pendingSyncMeta || entity.syncedToCloud === false);
}

function getPendingSyncToastCopy() {
  return '已暂存，联网后自动同步';
}

function isProvisionalMessage(message) {
  return Boolean(message && message.isProvisional === true && message.syncedToCloud !== true);
}

function isFormalMessage(message) {
  return Boolean(message && message.syncedToCloud === true && message.isProvisional !== true && message.isLegacy !== true);
}

module.exports = {
  isPendingSyncOccurrenceRecord,
  getPendingSyncToastCopy,
  isProvisionalMessage,
  isFormalMessage
};
