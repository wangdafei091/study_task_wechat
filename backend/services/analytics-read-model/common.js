const HISTORY_DAY_OPTIONS = new Set([7, 30]);
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function toShanghaiShiftedDate(value) {
  const timestamp = value instanceof Date ? value.getTime() : parseTimestamp(value);
  return new Date(timestamp + SHANGHAI_OFFSET_MS);
}

function formatDateParts(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateOnlyString(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function formatDate(date) {
  const parsedDateString = parseDateOnlyString(date);
  if (parsedDateString) {
    return formatDateParts(parsedDateString.year, parsedDateString.month, parsedDateString.day);
  }

  const shiftedDate = toShanghaiShiftedDate(date instanceof Date ? date.getTime() : date);
  return formatDateParts(
    shiftedDate.getUTCFullYear(),
    shiftedDate.getUTCMonth() + 1,
    shiftedDate.getUTCDate()
  );
}

function formatDisplayDate(date) {
  const parsedDateString = parseDateOnlyString(date);
  if (parsedDateString) {
    return `${parsedDateString.month}/${parsedDateString.day}`;
  }

  const shiftedDate = toShanghaiShiftedDate(date instanceof Date ? date.getTime() : date);
  return `${shiftedDate.getUTCMonth() + 1}/${shiftedDate.getUTCDate()}`;
}

function addDaysToDateString(dateString, days) {
  const parsed = parseDateOnlyString(dateString);
  if (!parsed) {
    return '';
  }

  const utcTimestamp = Date.UTC(parsed.year, parsed.month - 1, parsed.day) + days * 24 * 60 * 60 * 1000;
  const utcDate = new Date(utcTimestamp);
  return formatDateParts(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth() + 1,
    utcDate.getUTCDate()
  );
}

function normalizeDateValue(value) {
  const parsedDateString = parseDateOnlyString(value);
  if (parsedDateString) {
    return formatDateParts(parsedDateString.year, parsedDateString.month, parsedDateString.day);
  }

  const timestamp = parseTimestamp(value);
  if (!timestamp) {
    return null;
  }

  return formatDate(timestamp);
}

function parseTimestamp(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function buildAnalysisSignature(context, monthKey, days) {
  return JSON.stringify({
    scope: context.scope,
    userId: context.userId || null,
    childUserIds: context.childUserIds || [],
    monthKey,
    days: Number(days || 7)
  });
}

function buildAnalysisScopeKey(context) {
  if (context.scope === 'family') {
    return `family:${(context.childUserIds || []).join(',')}`;
  }
  return `user:${context.userId || 'unknown'}`;
}

function getMonthDateRange(monthKey) {
  const match = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return { startDate, endDate };
}

function getRecordTimestamp(record) {
  return parseTimestamp(
    record?.timestamp ||
    record?.modifyTime ||
    record?.modify_time ||
    record?.createdAt ||
    record?.created_at
  );
}

function getRecordDateString(record) {
  if (record?.source === 'task' && record?.type === 'expense' && record?.originalTaskDate) {
    return normalizeDateValue(record.originalTaskDate);
  }

  const timestamp = getRecordTimestamp(record);
  if (!timestamp) {
    return null;
  }

  return formatDate(new Date(timestamp));
}

function filterTasksByUserIds(tasks = [], userIds = []) {
  if (!Array.isArray(userIds)) {
    return Array.isArray(tasks) ? tasks : [];
  }
  if (userIds.length === 0) {
    return [];
  }
  return (Array.isArray(tasks) ? tasks : []).filter((task) => userIds.includes(task.userId));
}

function filterRecordsByUserIds(records = [], userIds = []) {
  if (!Array.isArray(userIds)) {
    return Array.isArray(records) ? records : [];
  }
  if (userIds.length === 0) {
    return [];
  }
  return (Array.isArray(records) ? records : []).filter((record) => userIds.includes(record.userId));
}

function filterRecordsByDateRange(records = [], startDate, endDate) {
  return (Array.isArray(records) ? records : []).filter((record) => {
    const recordDate = getRecordDateString(record);
    if (!recordDate) {
      return false;
    }
    return recordDate >= startDate && recordDate <= endDate;
  });
}

function groupFamilySummaryByUser(groups = []) {
  return (Array.isArray(groups) ? groups : []).reduce((result, group) => {
    if (!group?.userId) {
      return result;
    }
    if (!result[group.userId]) {
      result[group.userId] = [];
    }
    result[group.userId].push(serializeGroup(group));
    return result;
  }, {});
}

function sumStarGroups(groups = []) {
  return (Array.isArray(groups) ? groups : []).reduce(
    (sum, group) => sum + Number(group?.stars || 0),
    0
  );
}

function calculateDateRange(days, nowTimestamp = Date.now()) {
  const normalizedDays = HISTORY_DAY_OPTIONS.has(Number(days)) ? Number(days) : 7;
  const endDate = formatDate(nowTimestamp);
  const startDate = addDaysToDateString(endDate, -(normalizedDays - 1));

  const dateArray = [];
  const formattedDates = [];

  for (let i = 0; i < normalizedDays; i += 1) {
    const currentDate = addDaysToDateString(startDate, i);
    dateArray.push(currentDate);
    formattedDates.push(formatDisplayDate(currentDate));
  }

  return {
    dateArray,
    formattedDates
  };
}

function calculateAnchoredDailyBalance(records, days, currentBalance, nowTimestamp = Date.now()) {
  const { dateArray, formattedDates } = calculateDateRange(days, nowTimestamp);
  const dailySummary = {};

  dateArray.forEach((dateStr) => {
    dailySummary[dateStr] = {
      delta: 0,
      earned: 0,
      spent: 0,
      penalty: 0
    };
  });

  (Array.isArray(records) ? records : []).forEach((record) => {
    const recordDateStr = getRecordDateString(record);
    if (!recordDateStr || !dailySummary[recordDateStr]) {
      return;
    }

    const points = Number(record?.points || 0);
    dailySummary[recordDateStr].delta += points;

    if (points > 0) {
      dailySummary[recordDateStr].earned += points;
    } else if (points < 0) {
      if (record?.source === 'task' && record?.type === 'expense' && record?.originalTaskDate) {
        dailySummary[recordDateStr].penalty += Math.abs(points);
      } else {
        dailySummary[recordDateStr].spent += Math.abs(points);
      }
    }
  });

  const endingBalanceByDate = {};
  let runningBalance = Number(currentBalance || 0);

  for (let i = dateArray.length - 1; i >= 0; i -= 1) {
    const dateStr = dateArray[i];
    endingBalanceByDate[dateStr] = runningBalance;
    runningBalance -= Number(dailySummary[dateStr].delta || 0);
  }

  let cumulativeEarned = 0;
  let cumulativeSpent = 0;
  let cumulativePenalty = 0;

  return dateArray.map((dateStr, index) => {
    cumulativeEarned += Number(dailySummary[dateStr].earned || 0);
    cumulativeSpent += Number(dailySummary[dateStr].spent || 0);
    cumulativePenalty += Number(dailySummary[dateStr].penalty || 0);

    return {
      date: formattedDates[index],
      value: Number(endingBalanceByDate[dateStr] || 0),
      earned: Number(cumulativeEarned),
      spent: Number(cumulativeSpent),
      penalty: Number(cumulativePenalty)
    };
  });
}

function calculateExpiryForecast(currentBalance, groups = [], nowTimestamp = Date.now()) {
  const normalizedGroups = (Array.isArray(groups) ? groups : []).filter((group) =>
    group &&
    group.type !== 'permanent' &&
    group.expiryType !== 'permanent' &&
    group.expiryDate
  ).map((group) => ({
    ...group,
    normalizedExpiryDate: normalizeDateValue(group.expiryDate)
  })).filter((group) => group.normalizedExpiryDate);

  const forecastDays = normalizedGroups.length > 0 ? 30 : 7;
  let maxExpiryDate = addDaysToDateString(formatDate(nowTimestamp), 7);

  if (normalizedGroups.length > 0) {
    normalizedGroups.sort((left, right) => {
      return left.normalizedExpiryDate.localeCompare(right.normalizedExpiryDate);
    });

    const lastExpiryDate = addDaysToDateString(
      normalizedGroups[normalizedGroups.length - 1].normalizedExpiryDate,
      3
    );
    if (lastExpiryDate > maxExpiryDate) {
      maxExpiryDate = lastExpiryDate;
    }
  }

  const today = formatDate(nowTimestamp);

  const maxDays = Math.min(
    forecastDays,
    Math.floor((Date.parse(`${maxExpiryDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / (24 * 60 * 60 * 1000)) + 1
  );

  const result = [];
  let runningBalance = Number(currentBalance || 0);

  for (let i = 0; i < maxDays; i += 1) {
    const dateStr = addDaysToDateString(today, i);

    const expiringGroups = normalizedGroups.filter((group) => {
      return group.normalizedExpiryDate === dateStr;
    });

    const expiryAmount = expiringGroups.reduce((sum, group) => {
      return sum + Number(group?.stars || 0);
    }, 0);

    if (expiryAmount > 0) {
      runningBalance = Math.max(0, Number(runningBalance) - Number(expiryAmount));
    }

    result.push({
      date: formatDisplayDate(dateStr),
      value: Number(runningBalance),
      expiring: Number(expiryAmount || 0)
    });
  }

  return result;
}

function serializeTask(task) {
  const raw = task && typeof task.toJSON === 'function'
    ? task.toJSON()
    : { ...(task || {}) };
  const taskId = raw.taskId || task?.taskId || raw.id || task?.id || null;

  return {
    ...raw,
    id: taskId,
    taskId
  };
}

function serializeRecord(record) {
  const raw = record && typeof record.toJSON === 'function'
    ? record.toJSON()
    : { ...(record || {}) };
  const recordId = raw.recordId || record?.recordId || raw.id || record?.id || null;
  const timestamp = getRecordTimestamp(raw) || getRecordTimestamp(record) || Date.now();

  return {
    ...raw,
    id: recordId,
    recordId,
    timestamp
  };
}

function serializeGroup(group) {
  return group && typeof group.toJSON === 'function'
    ? group.toJSON()
    : { ...(group || {}) };
}

function buildPreparedSnapshot({
  context,
  monthKey,
  days,
  tasks = [],
  records = [],
  currentBalance = 0,
  familyGroupSnapshots = undefined,
  historyData = [],
  forecastData = [],
  nowTimestamp = Date.now()
}) {
  return {
    scope: context.scope,
    scopeKey: buildAnalysisScopeKey(context),
    subjectUserIds: context.subjectUserIds || [],
    monthKey,
    days: Number(days || 7),
    signature: buildAnalysisSignature(context, monthKey, days),
    refreshedAt: Number(nowTimestamp),
    expiresAt: Number(nowTimestamp + 30 * 1000),
    currentBalance: Number(currentBalance || 0),
    mode: 'authoritative',
    tasks: (Array.isArray(tasks) ? tasks : []).map(serializeTask),
    records: (Array.isArray(records) ? records : []).map(serializeRecord),
    familyGroupSnapshots,
    historyData: Array.isArray(historyData) ? historyData : [],
    forecastData: Array.isArray(forecastData) ? forecastData : []
  };
}

module.exports = {
  buildAnalysisScopeKey,
  buildAnalysisSignature,
  buildPreparedSnapshot,
  calculateAnchoredDailyBalance,
  calculateExpiryForecast,
  filterRecordsByDateRange,
  filterRecordsByUserIds,
  filterTasksByUserIds,
  formatDate,
  getMonthDateRange,
  getRecordDateString,
  groupFamilySummaryByUser,
  sumStarGroups
};
