const BaseRepository = require('./base-repository');
const OfflineQueueItem = require('../models/offline-queue-item');
const logger = require('../utils/logger');

class OfflineQueueRepository extends BaseRepository {
  constructor(storageAdapter, options = {}) {
    const storageKey = options.storageKey || 'offlineQueueData';
    super(storageKey, OfflineQueueItem, {
      namespace: options.namespace || '',
      useCache: options.useCache !== false,
      cacheExpiry: options.cacheExpiry || 60000,
      cacheTTL: options.cacheTTL || 10000,
      storageAdapter
    });

    if (storageAdapter) {
      this.storageAdapter = storageAdapter;
    }

    this.metaKey = options.metaKey || 'offlineQueueMeta';
    logger.info('OfflineQueueRepository', '初始化离线队列仓储');
  }

  async replaceAll(items) {
    const nextItems = Array.isArray(items) ? items : [];
    await this._saveData(nextItems);
    this.invalidateCache();
    return this.getAll();
  }

  async getMeta() {
    return this.storageAdapter.getAsync(this.metaKey, {});
  }

  async setMeta(meta) {
    return this.storageAdapter.setAsync(this.metaKey, meta || {});
  }
}

module.exports = OfflineQueueRepository;
