const OfflineQueueRepository = require('../repositories/offline-queue-repository');
const OfflineQueueItem = require('../models/offline-queue-item');
const logger = require('../utils/logger');

const DRAIN_REASON_LIMITS = {
  post_login_bootstrap: 50,
  before_task_read: 10,
  before_reward_read: 10
};

const SYSTEM_ACCESS_LEVEL = {
  NORMAL: 'normal',
  READONLY: 'readonly',
  BLOCKED: 'blocked'
};

class OfflineQueueService {
  constructor(options = {}) {
    this.repository = options.repository || new OfflineQueueRepository(options.storageAdapter, options.repositoryOptions);
    this.eventBus = options.eventBus || null;
    this.contextResolver = typeof options.contextResolver === 'function'
      ? options.contextResolver
      : () => ({});
    this.adapters = new Map();
    this.migrators = Array.isArray(options.migrators) ? options.migrators : [];
    this.initialized = false;
    this.initializationPromise = null;
  }

  registerAdapter(domain, handler) {
    if (!domain || typeof handler !== 'function') {
      return false;
    }
    this.adapters.set(domain, handler);
    return true;
  }

  setContextResolver(resolver) {
    if (typeof resolver === 'function') {
      this.contextResolver = resolver;
    }
  }

  async initialize() {
    if (this.initialized) {
      return true;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      await this.repository.loadFromStorage();
      await this.migrateLegacyPendingState();
      this.initialized = true;
      return true;
    })().finally(() => {
      this.initializationPromise = null;
    });

    return this.initializationPromise;
  }

  async enqueueMutation(input = {}) {
    const items = await this.repository.getAll();
    const nextItem = new OfflineQueueItem({
      domain: input.domain,
      entityId: input.entityId,
      operation: input.operation,
      operationKey: input.operationKey || this._createOperationKey(input),
      payload: input.payload || {},
      snapshot: input.snapshot || null,
      context: this._sanitizeContext(input.context || this.contextResolver()),
      source: input.source || 'live_write',
      legacyMigrationKey: input.legacyMigrationKey || '',
      suppressFailureEvents: input.suppressFailureEvents === true,
      status: 'pending'
    });

    const { nextItems, createdItem } = this._applyConflictResolution(items, nextItem);
    await this.repository.replaceAll(nextItems);
    return createdItem;
  }

  async drain(options = {}) {
    const items = await this.repository.getAll();
    const domains = Array.isArray(options.domains) && options.domains.length > 0
      ? new Set(options.domains)
      : null;
    const reason = options.reason || 'manual';
    const force = options.force === true;
    const currentContext = this._sanitizeContext(options.context || this.contextResolver());
    const limit = Number.isFinite(options.limit)
      ? Number(options.limit)
      : (DRAIN_REASON_LIMITS[reason] || 10);
    const now = Date.now();

    if (currentContext.systemAccessLevel === SYSTEM_ACCESS_LEVEL.READONLY) {
      const skipped = items.filter((item) => {
        if (domains && !domains.has(item.domain)) {
          return false;
        }
        return this._matchesContext(item, currentContext);
      }).length;

      return {
        success: true,
        processed: 0,
        skipped,
        failed: 0,
        partial: false,
        remaining: 0,
        reason: 'system_readonly'
      };
    }

    let processed = 0;
    let skipped = 0;
    let failed = 0;
    let remaining = 0;
    let totalMatched = 0;
    const nextItems = [];

    for (const item of items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) {
      if (domains && !domains.has(item.domain)) {
        nextItems.push(item);
        continue;
      }

      const matched = this._matchesContext(item, currentContext);
      if (!matched) {
        skipped += 1;
        nextItems.push(item);
        continue;
      }

      totalMatched += 1;

      if (!force && Number(item.nextRetryAt || 0) > now) {
        skipped += 1;
        nextItems.push(item);
        continue;
      }

      if (processed + failed >= limit) {
        remaining += 1;
        nextItems.push(item);
        continue;
      }

      const adapter = this.adapters.get(item.domain);
      if (!adapter) {
        failed += 1;
        nextItems.push(this._markFailedItem(item, new Error(`missing adapter for ${item.domain}`), now));
        continue;
      }

      try {
        await adapter(item, {
          reason,
          force,
          context: currentContext
        });
        processed += 1;
      } catch (error) {
        failed += 1;
        nextItems.push(this._markFailedItem(item, error, now));
      }
    }

    await this.repository.replaceAll(nextItems);

    return {
      success: failed === 0,
      processed,
      skipped,
      failed,
      partial: (processed + skipped + failed) < totalMatched || remaining > 0,
      remaining
    };
  }

  async migrateLegacyPendingState() {
    const meta = await this.repository.getMeta();
    const existingItems = await this.repository.getAll();
    const migrationKeySet = new Set(
      existingItems
        .map((item) => item.legacyMigrationKey)
        .filter(Boolean)
    );

    if (meta.legacyMigrationCompletedAt && this.migrators.length === 0) {
      return { success: true, migratedCount: 0, skippedCount: 0 };
    }

    let migratedCount = 0;
    let skippedCount = 0;
    let nextItems = existingItems.slice();

    for (const migrator of this.migrators) {
      const candidates = await migrator();
      for (const candidate of candidates || []) {
        if (!candidate || !candidate.legacyMigrationKey) {
          skippedCount += 1;
          continue;
        }

        if (migrationKeySet.has(candidate.legacyMigrationKey)) {
          skippedCount += 1;
          continue;
        }

        const item = new OfflineQueueItem({
          ...candidate,
          source: 'legacy_migration',
          suppressFailureEvents: true,
          status: 'pending'
        });
        migrationKeySet.add(item.legacyMigrationKey);
        nextItems.push(item);
        migratedCount += 1;
      }
    }

    await this.repository.replaceAll(nextItems);
    await this.repository.setMeta({
      ...meta,
      legacyMigrationCompletedAt: Date.now()
    });

    return {
      success: true,
      migratedCount,
      skippedCount
    };
  }

  async getPendingSummary({ domain } = {}) {
    const items = await this.repository.getAll();
    const filtered = domain ? items.filter((item) => item.domain === domain) : items;
    const byDomain = filtered.reduce((accumulator, item) => {
      accumulator[item.domain] = (accumulator[item.domain] || 0) + 1;
      return accumulator;
    }, {});

    return {
      total: filtered.length,
      byDomain
    };
  }

  _applyConflictResolution(items, nextItem) {
    const nextItems = items.slice();
    const existingIndex = this._findLatestItemIndex(nextItems, nextItem);

    if (existingIndex === -1) {
      nextItems.push(nextItem);
      return { nextItems, createdItem: nextItem };
    }

    const existing = nextItems[existingIndex];
    const resolved = this._resolveConsecutiveMutation(existing, nextItem);

    if (!resolved) {
      nextItems.splice(existingIndex, 1);
      return { nextItems, createdItem: null };
    }

    nextItems[existingIndex] = resolved;
    return { nextItems, createdItem: resolved };
  }

  _resolveConsecutiveMutation(existing, nextItem) {
    const existingOperation = existing.operation;
    const nextOperation = nextItem.operation;
    const entityAlreadySynced = this._isEntityAlreadySynced(existing) || this._isEntityAlreadySynced(nextItem);

    if (existingOperation === 'create' && nextOperation === 'update') {
      return this._mergeItem(existing, nextItem, 'create');
    }

    if (existingOperation === 'create' && nextOperation === 'delete') {
      return entityAlreadySynced ? this._mergeItem(existing, nextItem, 'delete') : null;
    }

    if (existingOperation === 'update' && nextOperation === 'update') {
      return this._mergeItem(existing, nextItem, 'update');
    }

    if (existingOperation === 'complete' && nextOperation === 'reset') {
      return this._mergeItem(existing, nextItem, 'reset');
    }

    if (existingOperation === 'required' && nextOperation === 'unrequired') {
      return this._mergeItem(existing, nextItem, 'unrequired');
    }

    if (
      ['update', 'complete', 'reset', 'required', 'unrequired', 'exchange', 'unclaim'].includes(existingOperation) &&
      nextOperation === 'delete'
    ) {
      return entityAlreadySynced ? this._mergeItem(existing, nextItem, 'delete') : null;
    }

    if (existingOperation === 'update' && nextOperation === 'complete') {
      return nextItem;
    }

    if (existingOperation === 'exchange' && nextOperation === 'unclaim') {
      return nextItem;
    }

    return nextItem;
  }

  _mergeItem(existing, nextItem, operation) {
    return new OfflineQueueItem({
      ...existing,
      ...nextItem,
      operation,
      payload: {
        ...(existing.payload || {}),
        ...(nextItem.payload || {})
      },
      snapshot: nextItem.snapshot || existing.snapshot,
      context: {
        ...(existing.context || {}),
        ...(nextItem.context || {})
      },
      source: nextItem.source || existing.source,
      suppressFailureEvents: existing.suppressFailureEvents && nextItem.suppressFailureEvents,
      updatedAt: Date.now()
    });
  }

  _findLatestItemIndex(items, nextItem) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const current = items[index];
      if (
        current.domain === nextItem.domain &&
        current.entityId === nextItem.entityId &&
        this._getContextScopeKey(current.context) === this._getContextScopeKey(nextItem.context)
      ) {
        return index;
      }
    }
    return -1;
  }

  _getContextScopeKey(context = {}) {
    if (context.loginUserId) {
      return `${context.familyId || ''}:${context.loginUserId}`;
    }
    return `${context.familyId || ''}:${context.actorUserId || ''}`;
  }

  _sanitizeContext(context = {}) {
    return {
      familyId: context.familyId || null,
      loginUserId: context.loginUserId || null,
      systemAccessLevel: context.systemAccessLevel || SYSTEM_ACCESS_LEVEL.NORMAL,
      actorUserId: context.actorUserId || null,
      actorRole: context.actorRole || 'system',
      targetUserId: context.targetUserId || null,
      exchangeUserId: context.exchangeUserId || null
    };
  }

  _matchesContext(item, currentContext = {}) {
    const itemContext = this._sanitizeContext(item.context || {});
    const activeContext = this._sanitizeContext(currentContext);

    if (item.source === 'legacy_migration' && !itemContext.loginUserId) {
      if (!itemContext.familyId || itemContext.familyId !== activeContext.familyId) {
        return false;
      }
      if (!itemContext.actorUserId || !activeContext.actorUserId) {
        return false;
      }
      return itemContext.actorUserId === activeContext.actorUserId;
    }

    if (!itemContext.familyId || !itemContext.loginUserId) {
      return false;
    }

    return (
      itemContext.familyId === activeContext.familyId &&
      itemContext.loginUserId === activeContext.loginUserId
    );
  }

  _markFailedItem(item, error, now) {
    const retryCount = Number(item.retryCount || 0) + 1;
    const lastAttemptAt = now;
    return new OfflineQueueItem({
      ...item,
      status: 'pending',
      retryCount,
      lastAttemptAt,
      nextRetryAt: this._calculateNextRetryAt(lastAttemptAt, retryCount),
      updatedAt: now,
      lastError: error ? error.message : ''
    });
  }

  _calculateNextRetryAt(lastAttemptAt, retryCount) {
    return lastAttemptAt + Math.min(Math.max(1, retryCount) * 10000, 300000);
  }

  _isEntityAlreadySynced(item) {
    const snapshot = item.snapshot || {};
    const payload = item.payload || {};
    return (
      snapshot.syncedToCloud === true ||
      payload.syncedToCloud === true ||
      !!snapshot.cloudId ||
      !!payload.cloudId
    );
  }

  _createOperationKey(input) {
    return `${input.domain || 'unknown'}:${input.entityId || 'unknown'}:${input.operation || 'mutation'}:${Date.now()}`;
  }
}

module.exports = OfflineQueueService;
