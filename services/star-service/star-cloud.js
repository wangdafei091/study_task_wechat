const logger = require('../../utils/logger');
const HttpClient = require('../../utils/http-client');
const API_CONFIG = require('../../utils/api-config');
const { StarRecord } = require('../../models/star-record');
const { StarGroup } = require('../../models/star-group');

async function hasPendingLocalStarRecords(service, userId = null, options = {}) {
  try {
    const allRecords = await service.starRecordRepository.getAll(false);
    const excludeRecordId = options.excludeRecordId || null;

    return allRecords.some(record => {
      if (userId && record.userId !== userId) {
        return false;
      }
      if (excludeRecordId && record.id === excludeRecordId) {
        return false;
      }
      return record.syncedToCloud !== true;
    });
  } catch (error) {
    logger.warn('StarService', '检查本地待同步星星流水失败，按存在待同步处理', {
      userId,
      error: error.message
    });
    return true;
  }
}

async function refreshStarsFromCloud(service, userId = null, options = {}) {
  if (!service.enableCloudStorage) {
    return { success: false, message: '云端模式未启用' };
  }

  const scope = options.scope || 'user';
  const scopeKey = scope === 'family' ? 'family' : `user:${userId || 'missing'}`;
  const inFlightRequest = service._cloudRefreshInFlight.get(scopeKey);
  if (inFlightRequest) {
    logger.info('StarService', '复用进行中的云端星星刷新请求', {
      scope,
      userId: userId || null
    });
    return inFlightRequest;
  }

  const request = fetchStarsFromCloud(service, userId, options)
    .finally(() => {
      if (service._cloudRefreshInFlight.get(scopeKey) === request) {
        service._cloudRefreshInFlight.delete(scopeKey);
      }
    });

  service._cloudRefreshInFlight.set(scopeKey, request);
  return request;
}

async function getFamilyStarSummary(service, options = {}) {
  if (!service.enableCloudStorage) {
    return {
      success: false,
      skipped: true,
      reason: 'local_mode',
      scope: 'family',
      subjectUserIds: [],
      totalPoints: 0,
      groups: []
    };
  }

  if (!options.force && service._familySummaryCache) {
    return service._familySummaryCache;
  }

  if (service._familySummaryInFlight) {
    return service._familySummaryInFlight;
  }

  const request = HttpClient.get(API_CONFIG.ENDPOINTS.STAR_FAMILY_SUMMARY)
    .then((data) => {
      const groups = (data.groups || []).map(group => service._mapCloudGroup(group));
      const summary = {
        success: true,
        scope: 'family',
        subjectUserIds: Array.isArray(data.subjectUserIds) ? data.subjectUserIds.filter(Boolean) : [],
        totalPoints: Number(data.totalPoints || 0),
        groups,
        fetchedAt: Date.now()
      };
      service._familySummaryCache = summary;
      return summary;
    })
    .finally(() => {
      service._familySummaryInFlight = null;
    });

  service._familySummaryInFlight = request;
  return request;
}

async function fetchStarsFromCloud(service, userId = null, options = {}) {
  const scope = options.scope || 'user';

  if (scope === 'family') {
    const familyRecordsData = await HttpClient.get(API_CONFIG.ENDPOINTS.STAR_RECORDS, { scope: 'family' });
    const familyRecords = (familyRecordsData.records || []).map(record => service._mapCloudRecord(record));
    await service._replaceSyncedStarRecords(null, familyRecords, { scope: 'family' });
    logger.info('StarService', '已从云端刷新家庭星星流水', { recordCount: familyRecords.length });
    return { success: true, records: familyRecords, groups: [] };
  }

  if (!userId) {
    return { success: false, message: '刷新单用户星星数据时必须传 userId' };
  }

  const hasPendingLocalRecords = await service.hasPendingLocalStarRecords(userId);
  if (hasPendingLocalRecords && options.forceCloudAfterAuthority !== true) {
    logger.info('StarService', '检测到本地待同步星星流水，跳过云端星星覆盖', { userId });
    const [localGroups, localRecords] = await Promise.all([
      service.starGroupRepository.getAll(false),
      service.starRecordRepository.getAll(false)
    ]);

    return {
      success: true,
      skipped: true,
      reason: 'pending_local_records',
      groups: localGroups.filter(group => group.userId === userId),
      records: localRecords.filter(record => record.userId === userId)
    };
  }

  const starsData = await HttpClient.get(API_CONFIG.ENDPOINTS.STARS, { userId });
  const recordData = await HttpClient.get(API_CONFIG.ENDPOINTS.STAR_RECORDS, { userId });
  const cloudGroups = (starsData.groups || [])
    .map(group => service._mapCloudGroup(group))
    .filter(group => !group.isExpired());
  const cloudRecords = (recordData.records || []).map(record => service._mapCloudRecord(record));

  await service._replaceSyncedStarGroups(userId, cloudGroups);
  await service._replaceSyncedStarRecords(userId, cloudRecords);

  logger.info('StarService', '已从云端刷新单用户星星数据', {
    userId,
    groupCount: cloudGroups.length,
    recordCount: cloudRecords.length
  });

  return {
    success: true,
    groups: cloudGroups,
    records: cloudRecords
  };
}

function buildExpiryAuthorityScopeKey(service, options = {}) {
  const scope = options.scope === 'family' ? 'family' : 'user';
  if (scope === 'family') {
    return `family:${options.familyId || 'default'}`;
  }
  return `user:${options.userId || 'missing'}`;
}

function isViewerReadonlyUser(service) {
  const loginUser = service?.userService?.getLoginUser?.() || null;
  return Boolean(
    loginUser &&
    loginUser.role === 'parent' &&
    loginUser.familyPermissionRole === 'viewer'
  );
}

async function syncExpiryAuthorityIfNeeded(service, options = {}) {
  if (!service.enableCloudStorage) {
    return { success: false, skipped: true, reason: 'local_mode' };
  }

  if (isViewerReadonlyUser(service)) {
    return { success: true, skipped: true, reason: 'viewer_readonly', settledGroupCount: 0 };
  }

  const scope = options.scope === 'family' ? 'family' : 'user';
  const scopeKey = service._buildExpiryAuthorityScopeKey({ ...options, scope });
  const minIntervalMs = Number(options.minIntervalMs || 10 * 1000);
  const force = options.force === true;
  const now = Date.now();
  const lastSyncTime = service._expiryAuthoritySyncTimestamps.get(scopeKey) || 0;

  if (!force && now - lastSyncTime < minIntervalMs) {
    return { success: true, skipped: true, reason: 'throttled' };
  }

  const inFlight = service._expiryAuthoritySyncInFlight.get(scopeKey);
  if (inFlight) {
    return inFlight;
  }

  const syncPromise = (async () => {
    const payload = {
      scope,
      targetUserId: scope === 'user' ? options.userId : undefined,
      modifyTime: now,
      operationKey: `star_expiry_authority:${scopeKey}:${now}`,
    };

    try {
      const response = await HttpClient.post(API_CONFIG.ENDPOINTS.STAR_EXPIRY_AUTHORITY_SYNC, payload);
      service._expiryAuthoritySyncTimestamps.set(scopeKey, Date.now());
      return {
        success: true,
        skipped: false,
        affectedUserIds: response.affectedUserIds || [],
        settledGroupCount: Number(response.settledGroupCount || 0),
        settledPoints: Number(response.settledPoints || 0),
        createdRecordCount: Number(response.createdRecordCount || 0),
        invalidGroupCount: Number(response.invalidGroupCount || 0),
      };
    } catch (error) {
      logger.warn('StarService', '星星到期权威结算同步失败，继续使用现有缓存', {
        scope,
        userId: options.userId || null,
        error: error.message
      });
      return { success: false, skipped: false, error: error.message };
    } finally {
      service._expiryAuthoritySyncInFlight.delete(scopeKey);
    }
  })();

  service._expiryAuthoritySyncInFlight.set(scopeKey, syncPromise);
  return syncPromise;
}

async function syncStarRecordToCloud(service, record) {
  if (!record) {
    return;
  }
  const normalizedExpiryDate = service._normalizeExpiryDateValue(record.expiryDate);
  const payload = {
    recordId: record.id,
    userId: record.userId,
    type: record.type,
    source: record.source,
    sourceId: record.sourceId,
    points: record.points,
    description: record.description,
    expiryType: record.expiryType,
    expiryDate: normalizedExpiryDate,
    originalTaskDate: record.originalTaskDate || null,
    requestedPoints: record.requestedPoints || null,
    modifyTime: record.modifyTime || record.timestamp || Date.now()
  };

  if (record.data?.operatorUserId) {
    payload.operatorContext = {
      actorUserId: record.data.operatorUserId,
      actorRole: record.data.operatorRole || null,
      loginUserId: record.data.loginUserId || null,
      familyId: record.data.familyId || null,
      targetUserId: record.data.targetUserId || record.userId || null
    };
  }

  const response = await HttpClient.post(API_CONFIG.ENDPOINTS.STAR_RECORDS, payload);
  record.expiryDate = normalizedExpiryDate;
  record.syncedToCloud = true;
  await service.starRecordRepository.save(record);

  const hasOtherPendingLocalRecords = await service.hasPendingLocalStarRecords(record.userId, {
    excludeRecordId: record.id
  });

  if (!hasOtherPendingLocalRecords && response && Array.isArray(response.updatedGroupsSnapshot) && record.userId) {
    const groups = response.updatedGroupsSnapshot.map(group => service._mapCloudGroup(group));
    await service._replaceSyncedStarGroups(record.userId, groups);
  }
}

async function syncConsumeToCloud(service, points, reason, options = {}) {
  const requestedPoints = Number(options.requestedPoints || points || 0);
  if (requestedPoints <= 0) {
    return;
  }

  const response = await HttpClient.post(API_CONFIG.ENDPOINTS.STAR_CONSUME, {
    userId: options.userId || null,
    requestedPoints,
    reason: reason || '通用扣星',
    sourceType: options.sourceType || 'system_consume',
    sourceId: options.sourceId || '',
    originalTaskDate: options.originalTaskDate || null,
    idempotencyKey: options.idempotencyKey ||
      `${options.sourceType || 'consume'}:${options.sourceId || 'manual'}:${Date.now()}`
  });

  if (response && Array.isArray(response.updatedGroupsSnapshot) && options.userId) {
    const groups = response.updatedGroupsSnapshot.map(group => service._mapCloudGroup({
      groupId: group.groupId,
      userId: options.userId,
      type: group.expiryType || group.type || 'permanent',
      stars: group.stars,
      expiryDate: group.expiryDate || null,
      modifyTime: Date.now()
    }));
    await service._replaceSyncedStarGroups(options.userId, groups);
  }
}

async function replaceSyncedStarGroups(service, userId, cloudGroups) {
  const allGroups = await service.starGroupRepository.getAll(false);
  const retainedGroups = allGroups.filter(group => group.userId !== userId);
  await service.starGroupRepository._saveData([...retainedGroups, ...cloudGroups]);
  service.starGroupRepository.invalidateCache();
}

async function replaceSyncedStarRecords(service, userId, cloudRecords, options = {}) {
  const allRecords = await service.starRecordRepository.getAll(false);
  const cloudRecordIds = new Set(cloudRecords.map(record => record.id).filter(Boolean));
  const cloudIdempotencyKeys = new Set(cloudRecords.map(record => record.idempotencyKey).filter(Boolean));
  const retainedRecords = allRecords.filter(record => {
    const isTargetRecord = options.scope === 'family' ? true : record.userId === userId;
    if (!isTargetRecord) {
      return true;
    }

    if (cloudRecordIds.has(record.id)) {
      return false;
    }

    if (record.idempotencyKey && cloudIdempotencyKeys.has(record.idempotencyKey)) {
      return false;
    }

    if (options.scope === 'family') {
      return record.syncedToCloud !== true;
    }
    return record.userId !== userId || record.syncedToCloud !== true;
  });

  await service.starRecordRepository._saveData([...retainedRecords, ...cloudRecords]);
  service.starRecordRepository.invalidateCache();
}

function mapCloudGroup(service, group) {
  const expiryMeta = service._resolveExpiryMetadata(group.expiryDate, group.expiryDate || '');
  return new StarGroup({
    id: group.groupId || group.id,
    userId: group.userId,
    type: group.type || group.expiryType || 'permanent',
    expiryType: group.type || group.expiryType || 'permanent',
    stars: Number(group.stars || 0),
    expiryDate: expiryMeta.timestamp,
    expiryDateStr: expiryMeta.displayText,
    syncedToCloud: true,
    lastUpdated: group.modifyTime || Date.now()
  });
}

function mapCloudRecord(service, record) {
  return new StarRecord({
    id: record.recordId || record.id,
    userId: record.userId,
    type: record.type,
    source: record.source,
    sourceId: record.sourceId || '',
    points: Number(record.points || 0),
    timestamp: record.modifyTime || Date.parse(record.createdAt || '') || Date.now(),
    description: record.description || '',
    expiryType: record.expiryType || null,
    expiryDate: service._normalizeExpiryDateValue(record.expiryDate),
    balance: Number(record.balance || 0),
    previousBalance: Number(record.previousBalance || 0),
    originalTaskDate: record.originalTaskDate || null,
    requestedPoints: record.requestedPoints || null,
    syncedToCloud: true,
    idempotencyKey: record.idempotencyKey || null,
    modifyTime: record.modifyTime || Date.now(),
    data: record.data || {}
  });
}

function buildConsumeIdempotencyKey(service, options = {}) {
  if (options.idempotencyKey) {
    return options.idempotencyKey;
  }

  return [
    options.sourceType || 'consume',
    options.sourceId || 'manual',
    options.originalTaskDate || 'na',
    options.userId || 'anonymous',
    Date.now()
  ].join(':');
}

function buildGroupMergeKey(service, group) {
  return [
    group.userId || '',
    group.expiryType || group.type || '',
    group.expiryDateStr || group.expiryDate || ''
  ].join('|');
}

module.exports = {
  hasPendingLocalStarRecords,
  refreshStarsFromCloud,
  getFamilyStarSummary,
  fetchStarsFromCloud,
  buildExpiryAuthorityScopeKey,
  syncExpiryAuthorityIfNeeded,
  syncStarRecordToCloud,
  syncConsumeToCloud,
  replaceSyncedStarGroups,
  replaceSyncedStarRecords,
  mapCloudGroup,
  mapCloudRecord,
  buildConsumeIdempotencyKey,
  buildGroupMergeKey
};
