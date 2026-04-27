class OfflineQueueItem {
  constructor(data = {}) {
    this.id = data.id || `offline_queue_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.domain = data.domain || '';
    this.entityId = data.entityId || '';
    this.operation = data.operation || '';
    this.operationKey = data.operationKey || '';
    this.payload = data.payload ? { ...data.payload } : {};
    this.snapshot = data.snapshot ? { ...data.snapshot } : null;
    this.context = data.context ? { ...data.context } : {};
    this.source = data.source || 'live_write';
    this.legacyMigrationKey = data.legacyMigrationKey || '';
    this.suppressFailureEvents = data.suppressFailureEvents === true;
    this.status = data.status || 'pending';
    this.retryCount = Number(data.retryCount || 0);
    this.lastAttemptAt = Number(data.lastAttemptAt || 0);
    this.nextRetryAt = Number(data.nextRetryAt || 0);
    this.createdAt = Number(data.createdAt || Date.now());
    this.updatedAt = Number(data.updatedAt || this.createdAt);
  }
}

module.exports = OfflineQueueItem;
