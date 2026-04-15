const logger = require('../../utils/logger');

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const FILTER_ALL = 'all';
const FILTER_TASK_INCOME = 'task_income';
const FILTER_REWARD_EXCHANGE = 'reward_exchange';
const FILTER_LOSS_EVENT = 'loss_event';

const TIME_SCOPE_LAST_7_DAYS = 'last7days';
const TIME_SCOPE_CURRENT_MONTH = 'currentMonth';
const TIME_SCOPE_ALL = 'all';
const TIME_SCOPE_LEGACY_3_MONTHS = 'legacy3months';

const SEMANTIC_TASK_INCOME = 'task_income';
const SEMANTIC_REWARD_EXCHANGE = 'reward_exchange';
const SEMANTIC_EXPIRED = 'expired';
const SEMANTIC_TASK_RESET = 'task_reset';
const SEMANTIC_TASK_PENALTY = 'task_penalty';
const SEMANTIC_OTHER_CHANGE = 'other_change';

function normalizeTimestamp(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return Number.isNaN(date.getTime()) ? NaN : date.getTime();
}

function getShanghaiDate(timestamp) {
  return new Date(timestamp + SHANGHAI_OFFSET_MS);
}

function getShanghaiDayIndex(timestamp) {
  return Math.floor((timestamp + SHANGHAI_OFFSET_MS) / MS_PER_DAY);
}

function formatShanghaiDate(timestamp) {
  const date = getShanghaiDate(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatShanghaiDateTime(timestamp) {
  const date = getShanghaiDate(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function getShanghaiMonthKey(timestamp) {
  const date = getShanghaiDate(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getMonthTextFromKey(monthKey) {
  const parts = String(monthKey).split('-');
  if (parts.length !== 2) {
    return monthKey || '未知月份';
  }

  return `${parts[0]}年${parseInt(parts[1], 10)}月`;
}

function normalizeTypeFilter(typeFilter) {
  if (typeFilter === 'income') {
    return FILTER_TASK_INCOME;
  }

  if (typeFilter === 'expense') {
    return FILTER_LOSS_EVENT;
  }

  return typeFilter || FILTER_ALL;
}

function normalizeTimeScope(timeScope) {
  if (timeScope === 'week') {
    return TIME_SCOPE_LAST_7_DAYS;
  }

  if (timeScope === 'month') {
    return TIME_SCOPE_CURRENT_MONTH;
  }

  if (timeScope === '3months') {
    return TIME_SCOPE_LEGACY_3_MONTHS;
  }

  return timeScope || TIME_SCOPE_ALL;
}

function normalizePoints(points) {
  const parsed = Number(points);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatSignedValue(value) {
  if (value > 0) {
    return `+${value}`;
  }

  return `${value}`;
}

function formatPositiveValue(value) {
  return `${Math.abs(value)}`;
}

function resolveExpiryDateText(record) {
  if (!record || record.expiryDate == null || record.expiryDate === '') {
    return '';
  }

  if (typeof record.expiryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.expiryDate)) {
    return record.expiryDate;
  }

  const normalized = normalizeTimestamp(record.expiryDate);
  if (Number.isNaN(normalized)) {
    return '';
  }

  return formatShanghaiDate(normalized);
}

function resolveExpirySubtitle(record) {
  const expiryType = record && record.expiryType;

  if (expiryType === 'permanent') {
    return '永久有效';
  }

  const expiryDateText = resolveExpiryDateText(record);
  if (!expiryDateText) {
    return '';
  }

  if (expiryType === 'week') {
    return `本周到期 · ${expiryDateText} 失效`;
  }

  if (expiryType === 'month') {
    return `本月到期 · ${expiryDateText} 失效`;
  }

  if (expiryType === 'quarter') {
    return `本季度到期 · ${expiryDateText} 失效`;
  }

  return `${expiryDateText} 失效`;
}

function resolveExpiryLossSubtitle(record) {
  const sourceId = record && record.sourceId;
  if (typeof sourceId !== 'string') {
    return '';
  }

  if (sourceId === 'expired_week') {
    return '本周到期后失效';
  }

  if (sourceId === 'expired_month') {
    return '本月到期后失效';
  }

  if (sourceId === 'expired_quarter') {
    return '本季度到期后失效';
  }

  return '星星已到期失效';
}

function resolvePenaltyDisplayInfo(record) {
  if (!record) {
    return null;
  }

  if (typeof record.getPenaltyDisplayInfo === 'function') {
    return record.getPenaltyDisplayInfo();
  }

  if (!record.originalTaskDate || normalizePoints(record.points) >= 0 || String(record.source || '') === 'task_reset') {
    return null;
  }

  const timestamp = normalizeTimestamp(record.timestamp);
  const executionText = Number.isNaN(timestamp) ? '时间未知' : formatShanghaiDateTime(timestamp);

  return {
    mainTime: `应该完成：${record.originalTaskDate}`,
    subTime: `实际扣星：${executionText}`
  };
}

function isRewardExchangeRecord(record) {
  if (!record || normalizePoints(record.points) >= 0) {
    return false;
  }

  const source = String(record.source || '');
  const sourceId = String(record.sourceId || '');
  const rewardId = record.data && record.data.rewardId;
  const rewardName = record.data && record.data.rewardName;

  return source === 'reward'
    || source === 'reward_exchange'
    || source === 'exchange'
    || source === 'partial_protected_exchange'
    || source === 'protected_exchange'
    || source.startsWith('reward_')
    || sourceId.startsWith('reward_')
    || Boolean(rewardId)
    || Boolean(rewardName);
}

function isTaskIncomeRecord(record) {
  if (!record || normalizePoints(record.points) <= 0) {
    return false;
  }

  const source = String(record.source || '');
  return source === 'task' || source === 'task_complete';
}

function classifyStarRecord(record) {
  const points = normalizePoints(record && record.points);
  const sourceId = String((record && record.sourceId) || '');
  const source = String((record && record.source) || '');

  if (points < 0 && sourceId.startsWith('expired_')) {
    return SEMANTIC_EXPIRED;
  }

  if (points < 0 && source === 'task_reset') {
    return SEMANTIC_TASK_RESET;
  }

  if (points < 0 && (source === 'task_penalty' || Boolean(record && record.originalTaskDate))) {
    return SEMANTIC_TASK_PENALTY;
  }

  if (points < 0 && isRewardExchangeRecord(record)) {
    return SEMANTIC_REWARD_EXCHANGE;
  }

  if (isTaskIncomeRecord(record)) {
    return SEMANTIC_TASK_INCOME;
  }

  return SEMANTIC_OTHER_CHANGE;
}

function resolveRecordTitle(record, semanticType) {
  const description = String((record && record.description) || '').trim();
  const rewardName = record && record.data && record.data.rewardName;
  const taskDateText = record && record.originalTaskDate ? `（${record.originalTaskDate}）` : '';

  if (semanticType === SEMANTIC_REWARD_EXCHANGE) {
    if (rewardName) {
      return `兑换奖励：${rewardName}`;
    }

    return description || '兑换使用星星';
  }

  if (semanticType === SEMANTIC_EXPIRED) {
    return '星星过期失效';
  }

  if (semanticType === SEMANTIC_TASK_RESET) {
    if (description.startsWith('取消完成任务:')) {
      return `取消完成任务：${description.slice('取消完成任务:'.length).trim()}${taskDateText}`;
    }

    return description || `取消完成任务${taskDateText}`;
  }

  if (semanticType === SEMANTIC_TASK_INCOME) {
    return description || '任务获得星星';
  }

  if (semanticType === SEMANTIC_TASK_PENALTY) {
    return description || '未完成任务扣除星星';
  }

  return description || '其他星星变动';
}

function resolveRecordSubtitle(record, semanticType) {
  if (semanticType === SEMANTIC_TASK_INCOME) {
    return resolveExpirySubtitle(record);
  }

  if (semanticType === SEMANTIC_TASK_RESET) {
    return record && record.originalTaskDate ? `原任务日期 · ${record.originalTaskDate}` : '';
  }

  if (semanticType === SEMANTIC_EXPIRED) {
    return resolveExpiryLossSubtitle(record);
  }

  return '';
}

function resolveTagText(semanticType) {
  if (semanticType === SEMANTIC_TASK_INCOME) {
    return '任务获得';
  }

  if (semanticType === SEMANTIC_REWARD_EXCHANGE) {
    return '兑换使用';
  }

  if (semanticType === SEMANTIC_TASK_RESET) {
    return '取消完成';
  }

  if (semanticType === SEMANTIC_EXPIRED) {
    return '过期失效';
  }

  if (semanticType === SEMANTIC_TASK_PENALTY) {
    return '未完成扣除';
  }

  return '其他变动';
}

function resolveTagTone(semanticType, amountValue) {
  if (semanticType === SEMANTIC_TASK_INCOME) {
    return 'income';
  }

  if (semanticType === SEMANTIC_REWARD_EXCHANGE) {
    return 'exchange';
  }

  if (semanticType === SEMANTIC_TASK_RESET) {
    return 'loss';
  }

  if (semanticType === SEMANTIC_EXPIRED || semanticType === SEMANTIC_TASK_PENALTY) {
    return 'loss';
  }

  return amountValue >= 0 ? 'neutral-positive' : 'neutral-negative';
}

function buildDisplayRecord(service, record) {
  const amountValue = normalizePoints(record && record.points);
  const timestamp = normalizeTimestamp(record && record.timestamp);
  const semanticType = classifyStarRecord(record);
  const penaltyInfo = resolvePenaltyDisplayInfo(record);
  const monthKey = Number.isNaN(timestamp) ? 'unknown' : getShanghaiMonthKey(timestamp);

  return {
    id: (record && record.id) || `record_${Date.now()}`,
    semanticType,
    title: resolveRecordTitle(record, semanticType),
    subtitle: resolveRecordSubtitle(record, semanticType),
    tagText: resolveTagText(semanticType),
    tagTone: resolveTagTone(semanticType, amountValue),
    amountText: formatSignedValue(amountValue),
    amountValue,
    primaryTimeText: penaltyInfo ? penaltyInfo.mainTime : (Number.isNaN(timestamp) ? '时间未知' : formatShanghaiDateTime(timestamp)),
    secondaryTimeText: penaltyInfo ? penaltyInfo.subTime : '',
    hasDualTime: Boolean(penaltyInfo),
    occurredAtText: Number.isNaN(timestamp) ? '时间未知' : formatShanghaiDateTime(timestamp),
    timestamp,
    monthKey,
    monthText: monthKey === 'unknown' ? '未知月份' : getMonthTextFromKey(monthKey)
  };
}

function matchesPrimaryFilter(displayRecord, activeFilter) {
  const normalizedFilter = normalizeTypeFilter(activeFilter);
  const semanticType = displayRecord.semanticType;
  const amountValue = displayRecord.amountValue;

  if (normalizedFilter === FILTER_ALL) {
    return true;
  }

  if (normalizedFilter === FILTER_TASK_INCOME) {
    return semanticType === SEMANTIC_TASK_INCOME;
  }

  if (normalizedFilter === FILTER_REWARD_EXCHANGE) {
    return semanticType === SEMANTIC_REWARD_EXCHANGE;
  }

  if (normalizedFilter === FILTER_LOSS_EVENT) {
    return amountValue < 0 && [
      SEMANTIC_REWARD_EXCHANGE,
      SEMANTIC_TASK_RESET,
      SEMANTIC_EXPIRED,
      SEMANTIC_TASK_PENALTY,
      SEMANTIC_OTHER_CHANGE
    ].includes(semanticType);
  }

  return true;
}

function matchesTimeScope(displayRecord, activeTimeScope, nowTimestamp = Date.now()) {
  const normalizedScope = normalizeTimeScope(activeTimeScope);

  if (normalizedScope === TIME_SCOPE_ALL) {
    return true;
  }

  if (Number.isNaN(displayRecord.timestamp)) {
    return false;
  }

  if (normalizedScope === TIME_SCOPE_LEGACY_3_MONTHS) {
    return displayRecord.timestamp >= (nowTimestamp - 90 * MS_PER_DAY);
  }

  const currentDayIndex = getShanghaiDayIndex(nowTimestamp);
  const recordDayIndex = getShanghaiDayIndex(displayRecord.timestamp);

  if (normalizedScope === TIME_SCOPE_LAST_7_DAYS) {
    const diffDays = currentDayIndex - recordDayIndex;
    return diffDays >= 0 && diffDays <= 6;
  }

  if (normalizedScope === TIME_SCOPE_CURRENT_MONTH) {
    return getShanghaiMonthKey(displayRecord.timestamp) === getShanghaiMonthKey(nowTimestamp);
  }

  return true;
}

function buildDisplayRecords(service, records) {
  return (records || [])
    .map((record) => buildDisplayRecord(service, record))
    .sort((left, right) => right.timestamp - left.timestamp);
}

function filterRecords(service, records, typeFilter, timeFilter, options = {}) {
  logger.info('StarService', `筛选记录，类型：${typeFilter}，时间：${timeFilter}`);
  const nowTimestamp = options.nowTimestamp || Date.now();
  const displayRecords = (records || []).map((record) => {
    if (record && typeof record.semanticType === 'string' && typeof record.amountValue === 'number') {
      return record;
    }

    return buildDisplayRecord(service, record);
  });

  const filtered = displayRecords.filter((record) => (
    matchesPrimaryFilter(record, typeFilter) && matchesTimeScope(record, timeFilter, nowTimestamp)
  ));

  logger.info('StarService', `最终筛选结果：${filtered.length}条记录`);
  return filtered;
}

function buildSummarySnapshot(records) {
  return (records || []).reduce((summary, record) => {
    const semanticType = record && typeof record.semanticType === 'string'
      ? record.semanticType
      : classifyStarRecord(record);
    const points = normalizePoints(
      record && typeof record.amountValue === 'number' ? record.amountValue : record && record.points
    );

    if (semanticType === SEMANTIC_TASK_INCOME) {
      summary.taskIncomeTotal += Math.abs(points);
    } else if (semanticType === SEMANTIC_REWARD_EXCHANGE && points < 0) {
      summary.rewardExchangeTotal += Math.abs(points);
    } else if (semanticType === SEMANTIC_TASK_RESET && points < 0) {
      summary.otherChangeNet += points;
      summary.otherChangeNegativeTotal += Math.abs(points);
    } else if (semanticType === SEMANTIC_EXPIRED && points < 0) {
      summary.expiredTotal += Math.abs(points);
    } else if (semanticType === SEMANTIC_TASK_PENALTY && points < 0) {
      summary.taskPenaltyTotal += Math.abs(points);
    } else if (semanticType === SEMANTIC_OTHER_CHANGE) {
      summary.otherChangeNet += points;
      if (points < 0) {
        summary.otherChangeNegativeTotal += Math.abs(points);
      }
    }

    summary.netChange += points;
    return summary;
  }, {
    taskIncomeTotal: 0,
    rewardExchangeTotal: 0,
    expiredTotal: 0,
    taskPenaltyTotal: 0,
    otherChangeNet: 0,
    otherChangeNegativeTotal: 0,
    netChange: 0
  });
}

function buildDecreaseTotal(summary) {
  return summary.rewardExchangeTotal
    + summary.expiredTotal
    + summary.taskPenaltyTotal
    + summary.otherChangeNegativeTotal;
}

function buildOtherChangeText(summary) {
  if (summary.otherChangeNet === 0) {
    return '';
  }

  return `其他变动 ${formatSignedValue(summary.otherChangeNet)}`;
}

function buildNetChangeText(summary) {
  if (summary.netChange > 0) {
    return `余额净增 ${formatSignedValue(summary.netChange)}`;
  }

  if (summary.netChange < 0) {
    return `余额净减 ${formatPositiveValue(summary.netChange)}`;
  }

  return '余额无变化';
}

function buildBreakdownParts(summary, activeFilter) {
  if (activeFilter === FILTER_LOSS_EVENT) {
    const parts = [
      `兑换使用 ${summary.rewardExchangeTotal}`,
      `过期失效 ${summary.expiredTotal}`,
      `未完成扣除 ${summary.taskPenaltyTotal}`
    ];

    if (summary.otherChangeNegativeTotal > 0) {
      parts.push(`其他减少 ${summary.otherChangeNegativeTotal}`);
    }

    return parts;
  }

  if (activeFilter === FILTER_ALL) {
    const parts = [
      `兑换使用 ${summary.rewardExchangeTotal}`,
      `过期失效 ${summary.expiredTotal}`,
      `未完成扣除 ${summary.taskPenaltyTotal}`
    ];

    const otherChangeText = buildOtherChangeText(summary);
    if (otherChangeText) {
      parts.push(otherChangeText);
    }

    parts.push(buildNetChangeText(summary));
    return parts;
  }

  return [];
}

function buildSummaryText(summary, scopeLabel, activeFilter) {
  const decreaseTotal = buildDecreaseTotal(summary);

  if (activeFilter === FILTER_TASK_INCOME) {
    return `${scopeLabel}任务获得 ${summary.taskIncomeTotal}`;
  }

  if (activeFilter === FILTER_REWARD_EXCHANGE) {
    return `${scopeLabel}兑换使用 ${summary.rewardExchangeTotal}`;
  }

  if (activeFilter === FILTER_LOSS_EVENT) {
    return `${scopeLabel}共减少 ${decreaseTotal}`;
  }

  return `${scopeLabel}获得 ${summary.taskIncomeTotal} · 减少 ${decreaseTotal}`;
}

function buildScopeSummary(service, records, activeTimeScope, activeFilter) {
  if (!records || records.length === 0) {
    return null;
  }

  const normalizedScope = normalizeTimeScope(activeTimeScope);
  if (normalizedScope === TIME_SCOPE_ALL) {
    return null;
  }

  const scopeLabel = normalizedScope === TIME_SCOPE_LAST_7_DAYS ? '最近7天' : '本月';
  const normalizedFilter = normalizeTypeFilter(activeFilter);
  const summary = buildSummarySnapshot(records);
  const breakdownParts = buildBreakdownParts(summary, normalizedFilter);

  return {
    scopeKey: normalizedScope,
    scopeLabel,
    activeFilter: normalizedFilter,
    summaryText: buildSummaryText(summary, scopeLabel, normalizedFilter),
    breakdownText: breakdownParts.length > 0 ? breakdownParts.join(' · ') : ''
  };
}

function buildMonthGroupSummary(service, monthText, records, activeFilter) {
  const normalizedFilter = normalizeTypeFilter(activeFilter);
  const summary = buildSummarySnapshot(records);
  const breakdownParts = buildBreakdownParts(summary, normalizedFilter);

  if (normalizedFilter === FILTER_ALL) {
    return {
      summaryText: buildSummaryText(summary, '', FILTER_ALL).replace(/^获得 /, '获得 ').trim(),
      breakdownText: breakdownParts.join(' · '),
      filterSummaryText: ''
    };
  }

  if (normalizedFilter === FILTER_TASK_INCOME) {
    return {
      summaryText: '',
      breakdownText: '',
      filterSummaryText: `${monthText}任务获得 ${summary.taskIncomeTotal}`
    };
  }

  if (normalizedFilter === FILTER_REWARD_EXCHANGE) {
    return {
      summaryText: '',
      breakdownText: '',
      filterSummaryText: `${monthText}兑换使用 ${summary.rewardExchangeTotal}`
    };
  }

  return {
    summaryText: '',
    breakdownText: breakdownParts.join(' · '),
    filterSummaryText: `${monthText}共减少 ${buildDecreaseTotal(summary)}`
  };
}

function groupRecordsByMonth(service, records, activeFilter = FILTER_ALL) {
  logger.info('StarService', '开始按月份分组记录');
  const monthGroups = {};

  (records || []).forEach((record) => {
    const displayRecord = record && typeof record.semanticType === 'string'
      ? record
      : buildDisplayRecord(service, record);

    if (Number.isNaN(displayRecord.timestamp)) {
      return;
    }

    if (!monthGroups[displayRecord.monthKey]) {
      monthGroups[displayRecord.monthKey] = {
        month: displayRecord.monthKey,
        monthText: displayRecord.monthText,
        records: []
      };
    }

    monthGroups[displayRecord.monthKey].records.push(displayRecord);
  });

  const groups = Object.values(monthGroups)
    .sort((left, right) => right.month.localeCompare(left.month))
    .map((group) => ({
      ...group
    }));

  logger.info('StarService', `月份分组完成，共${groups.length}个月份`);
  return groups;
}

function calculateMonthSummary(service, groupedRecords) {
  logger.info('StarService', `计算月度汇总，共${groupedRecords.length}个月份`);

  return (groupedRecords || []).map((group) => {
    const summary = buildSummarySnapshot(group.records || []);
    return {
      ...group,
      monthSummary: buildSummaryText(summary, '', FILTER_ALL).replace(/^获得 /, '获得 ').trim(),
      incomeTotal: summary.taskIncomeTotal,
      expenseTotal: buildDecreaseTotal(summary),
      netChange: summary.netChange
    };
  });
}

function buildStarRecordViewModel(service, records, options = {}) {
  const activeFilter = normalizeTypeFilter(options.activeFilter || FILTER_ALL);
  const activeTimeScope = normalizeTimeScope(options.activeTimeScope || TIME_SCOPE_LAST_7_DAYS);
  const nowTimestamp = options.nowTimestamp || Date.now();

  const displayRecords = buildDisplayRecords(service, records);
  const filteredRecords = filterRecords(service, displayRecords, activeFilter, activeTimeScope, { nowTimestamp });
  const isGroupedView = activeTimeScope === TIME_SCOPE_ALL;

  return {
    activeFilter,
    activeTimeScope,
    isGroupedView,
    records: isGroupedView ? [] : filteredRecords,
    groupedRecords: isGroupedView ? groupRecordsByMonth(service, filteredRecords, activeFilter) : []
  };
}

async function getStarGroups(service, userId = null) {
  try {
    const groups = await service.starGroupRepository.getNonEmptyGroups(userId);
    logger.info('StarService', `获取星星分组列表成功${userId ? `, 用户=${userId}` : ''}, 数量=${groups.length}`);
    return groups;
  } catch (error) {
    logger.error('StarService', '获取星星分组列表失败', error);
    return [];
  }
}

async function getTotalStars(service, userId = null) {
  try {
    const total = await service.starGroupRepository.getTotalPoints(userId);
    logger.info('StarService', `获取用户总星星数量成功${userId ? `, 用户=${userId}` : ''}: ${total}`);
    return total;
  } catch (error) {
    logger.error('StarService', '获取用户总星星数量失败', error);
    return 0;
  }
}

async function getStarRecords(service, options = {}) {
  try {
    let records = [];
    const { userId } = options;

    if (options.type && options.date) {
      records = await service.starRecordRepository.getRecordsByTypeAndDate(options.type, options.date, userId);
    } else if (options.type) {
      records = await service.starRecordRepository.getRecordsByType(options.type, userId);
    } else if (options.date) {
      records = await service.starRecordRepository.getRecordsByDate(options.date, userId);
    } else {
      records = await service.starRecordRepository.getRecordsByTimeOrder(true, options.limit || 0, userId);
    }

    logger.info('StarService', `获取星星记录列表成功${userId ? `, 用户=${userId}` : ''}, 数量=${records.length}`);
    return records;
  } catch (error) {
    logger.error('StarService', '获取星星记录列表失败', error);
    return [];
  }
}

async function getStarRecordsByMonth(service, userId = null) {
  try {
    const groupedRecords = await service.starRecordRepository.getRecordsGroupedByMonth({ userId });
    logger.info('StarService', `获取按月份分组的星星记录成功${userId ? `, 用户=${userId}` : ''}, 月份数=${groupedRecords.length}`);
    return groupedRecords;
  } catch (error) {
    logger.error('StarService', '获取按月份分组的星星记录失败', error);
    return [];
  }
}

async function getStarRecordsByDateRange(service, startDate, endDate, userId = null) {
  try {
    logger.info('StarService', `获取日期范围星星记录: ${startDate} 至 ${endDate}${userId ? `, 用户=${userId}` : ''}`);
    const records = await service.starRecordRepository.getRecordsByDateRange(startDate, endDate, userId);
    logger.info('StarService', `获取日期范围星星记录成功, 数量=${records.length}`);
    return records;
  } catch (error) {
    logger.error('StarService', `获取日期范围星星记录失败: ${startDate} 至 ${endDate}`, error);
    return [];
  }
}

async function getStarRecordsByDate(service, date, userId = null) {
  try {
    logger.info('StarService', `获取特定日期星星记录: ${date}${userId ? `, 用户=${userId}` : ''}`);
    const records = await service.starRecordRepository.getRecordsByDate(date, userId);
    logger.info('StarService', `获取特定日期星星记录成功, 数量=${records.length}`);
    return records;
  } catch (error) {
    logger.error('StarService', `获取特定日期星星记录失败: ${date}`, error);
    return [];
  }
}

async function validateConsistency(service) {
  logger.info('StarService', '开始验证星星数据一致性');

  try {
    const groups = await service.starGroupRepository.getAll();
    const groupsTotal = groups.reduce((sum, group) => sum + (group.stars || 0), 0);
    const records = await service.starRecordRepository.getAll();
    const recordsCalculation = service._calculateBalanceFromRecords(records);
    const isConsistent = groupsTotal === recordsCalculation.finalBalance;

    const result = {
      isConsistent,
      groupsTotal,
      recordsBalance: recordsCalculation.finalBalance,
      difference: groupsTotal - recordsCalculation.finalBalance,
      groupsCount: groups.length,
      recordsCount: records.length
    };

    logger.info('StarService', `星星数据一致性验证结果: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    logger.error('StarService', '验证星星数据一致性失败', error);
    return {
      isConsistent: false,
      error: error.message
    };
  }
}

function calculateBalanceFromRecords(service, records) {
  let income = 0;
  let expense = 0;

  records.forEach(record => {
    if (record.points > 0) {
      income += record.points;
    } else {
      expense += Math.abs(record.points);
    }
  });

  return {
    income,
    expense,
    finalBalance: income - expense
  };
}

async function repairStarRecordBalances(service) {
  logger.info('StarService', '开始修复星星记录余额信息');

  try {
    const result = await service.starRecordRepository.repairRecordBalances();

    if (result.success) {
      logger.info('StarService', `星星记录余额修复完成，共修复${result.repairedCount}条记录`);
      service.clearCache();
    } else {
      logger.error('StarService', `星星记录余额修复失败: ${result.error}`);
    }

    return result;
  } catch (error) {
    logger.error('StarService', '修复星星记录余额失败', error);
    return { success: false, error: error.message };
  }
}

async function checkAndRepairDataConsistency(service) {
  logger.info('StarService', '开始检查并修复数据一致性');

  try {
    if (service.enableCloudStorage) {
      logger.info('StarService', '云端模式跳过本地星星一致性检查和修复');
      return {
        success: true,
        skipped: true,
        reason: 'cloud_mode',
        initialConsistency: null,
        repairResult: {
          success: true,
          repairedCount: 0,
          skipped: true
        },
        finalConsistency: null,
        isFixed: true
      };
    }

    const consistencyResult = await service.validateConsistency();
    const repairResult = await service.repairStarRecordBalances();
    const finalConsistencyResult = await service.validateConsistency();

    const result = {
      success: true,
      initialConsistency: consistencyResult,
      repairResult,
      finalConsistency: finalConsistencyResult,
      isFixed: finalConsistencyResult.isConsistent
    };

    logger.info('StarService', '数据一致性检查和修复完成:', {
      初始一致性: consistencyResult.isConsistent,
      修复记录数: repairResult.repairedCount,
      最终一致性: finalConsistencyResult.isConsistent
    });

    return result;
  } catch (error) {
    logger.error('StarService', '检查并修复数据一致性失败', error);
    return { success: false, error: error.message };
  }
}

async function verifyOperationConsistency(service, operation, operationData = {}) {
  logger.info('StarService', `验证${operation}操作后的数据一致性`);

  try {
    const groupsTotal = await service.starGroupRepository.getTotalPoints();
    const records = await service.starRecordRepository.getAll();
    const recordsCalculation = service._calculateBalanceFromRecords(records);
    const isConsistent = groupsTotal === recordsCalculation.finalBalance;

    logger.info('StarService', `${operation}操作后数据一致性检查: 分组总数=${groupsTotal}, 记录余额=${recordsCalculation.finalBalance}, 一致性=${isConsistent}`);

    if (!isConsistent) {
      logger.error('StarService', `${operation}操作后数据不一致！`, {
        operation,
        operationData,
        groupsTotal,
        recordsBalance: recordsCalculation.finalBalance,
        difference: groupsTotal - recordsCalculation.finalBalance
      });
    }

    return isConsistent;
  } catch (error) {
    logger.error('StarService', `验证${operation}操作后数据一致性失败`, error);
    return false;
  }
}

function calculateRecordBalance(service, records, currentBalance) {
  logger.info('StarService', `计算记录余额，当前总星星数：${currentBalance}`);
  const sortedRecords = [...records].sort((a, b) => b.timestamp - a.timestamp);
  const result = [];
  let runningBalance = currentBalance;

  for (let i = 0; i < sortedRecords.length; i++) {
    const record = { ...sortedRecords[i] };
    record.points = parseInt(record.points, 10);
    record.balance = parseInt(runningBalance, 10);
    result.push(record);
    runningBalance = runningBalance - record.points;
  }

  logger.info('StarService', `记录余额计算完成，处理了${result.length}条记录`);
  return result;
}

function clearCache(service) {
  logger.info('StarService', '清除星星服务缓存');

  if (service.starGroupRepository && service.starGroupRepository.clearCache) {
    service.starGroupRepository.clearCache();
  }

  if (service.starRecordRepository && service.starRecordRepository.clearCache) {
    service.starRecordRepository.clearCache();
  }

  service._familySummaryCache = null;
  service._familySummaryInFlight = null;
}

module.exports = {
  getStarGroups,
  getTotalStars,
  getStarRecords,
  getStarRecordsByMonth,
  getStarRecordsByDateRange,
  getStarRecordsByDate,
  validateConsistency,
  calculateBalanceFromRecords,
  repairStarRecordBalances,
  checkAndRepairDataConsistency,
  verifyOperationConsistency,
  calculateRecordBalance,
  calculateMonthSummary,
  groupRecordsByMonth,
  filterRecords,
  buildDisplayRecord,
  classifyStarRecord,
  matchesPrimaryFilter,
  buildScopeSummary,
  buildStarRecordViewModel,
  clearCache
};
