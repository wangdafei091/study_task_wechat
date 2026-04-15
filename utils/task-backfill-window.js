const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const WINDOW_LABELS = {
  week: '本周结束',
  month: '本月结束',
  quarter: '本季度结束',
  permanent: '永久'
};

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

function formatTimestampAsShanghaiDate(value) {
  const timestamp = Number(value || 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }

  const shifted = new Date(timestamp + SHANGHAI_OFFSET_MS);
  return formatDateParts(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate()
  );
}

function normalizeDate(value) {
  const parsedDate = parseDateOnlyString(value);
  if (parsedDate) {
    return formatDateParts(parsedDate.year, parsedDate.month, parsedDate.day);
  }

  if (value instanceof Date) {
    return formatTimestampAsShanghaiDate(value.getTime());
  }

  return formatTimestampAsShanghaiDate(value);
}

function addDays(dateString, days) {
  const parsedDate = parseDateOnlyString(dateString);
  if (!parsedDate) {
    return null;
  }

  const nextUtc = Date.UTC(parsedDate.year, parsedDate.month - 1, parsedDate.day) + days * DAY_MS;
  const nextDate = new Date(nextUtc);
  return formatDateParts(
    nextDate.getUTCFullYear(),
    nextDate.getUTCMonth() + 1,
    nextDate.getUTCDate()
  );
}

function getQuarterEndDate(taskDate) {
  const parsedDate = parseDateOnlyString(taskDate);
  if (!parsedDate) {
    return null;
  }

  const quarterEndMonth = Math.floor((parsedDate.month - 1) / 3) * 3 + 3;
  const quarterEndUtc = new Date(Date.UTC(parsedDate.year, quarterEndMonth, 0));
  return formatDateParts(
    quarterEndUtc.getUTCFullYear(),
    quarterEndUtc.getUTCMonth() + 1,
    quarterEndUtc.getUTCDate()
  );
}

function resolveWindowEndDate(taskDate, windowType) {
  const normalizedTaskDate = normalizeDate(taskDate);
  if (!normalizedTaskDate) {
    return null;
  }

  if (windowType === 'week') {
    const utcMidnight = Date.UTC(
      Number(normalizedTaskDate.slice(0, 4)),
      Number(normalizedTaskDate.slice(5, 7)) - 1,
      Number(normalizedTaskDate.slice(8, 10))
    );
    const weekday = new Date(utcMidnight).getUTCDay();
    const daysUntilSunday = (7 - weekday) % 7;
    return addDays(normalizedTaskDate, daysUntilSunday);
  }

  if (windowType === 'month') {
    const parsedDate = parseDateOnlyString(normalizedTaskDate);
    const monthEndUtc = new Date(Date.UTC(parsedDate.year, parsedDate.month, 0));
    return formatDateParts(
      monthEndUtc.getUTCFullYear(),
      monthEndUtc.getUTCMonth() + 1,
      monthEndUtc.getUTCDate()
    );
  }

  if (windowType === 'quarter') {
    return getQuarterEndDate(normalizedTaskDate);
  }

  return null;
}

function evaluateTaskBackfillWindow({ taskDate, pointsExpiry, operationTime }) {
  const normalizedTaskDate = normalizeDate(taskDate);
  const operationDate = normalizeDate(operationTime);
  const windowType = pointsExpiry || 'permanent';
  const isHistorical = Boolean(
    normalizedTaskDate &&
    operationDate &&
    normalizedTaskDate < operationDate
  );

  if (!normalizedTaskDate || !operationDate || !isHistorical || windowType === 'permanent') {
    return {
      allowed: true,
      expired: false,
      isHistorical,
      taskDate: normalizedTaskDate,
      operationDate,
      windowType,
      windowEndDate: resolveWindowEndDate(normalizedTaskDate, windowType)
    };
  }

  const windowEndDate = resolveWindowEndDate(normalizedTaskDate, windowType);
  if (!windowEndDate) {
    return {
      allowed: true,
      expired: false,
      isHistorical,
      taskDate: normalizedTaskDate,
      operationDate,
      windowType,
      windowEndDate: null
    };
  }

  const expired = operationDate > windowEndDate;
  return {
    allowed: !expired,
    expired,
    isHistorical,
    taskDate: normalizedTaskDate,
    operationDate,
    windowType,
    windowEndDate
  };
}

function buildTaskBackfillExpiredMessage(result) {
  if (!result || result.allowed !== false) {
    return '该任务补打卡期限已结束，无法再补打卡';
  }

  const label = WINDOW_LABELS[result.windowType] || '有效期';
  if (result.windowEndDate) {
    return `该任务补打卡期限已于${result.windowEndDate}（${label}）结束，无法再补打卡`;
  }

  return `该任务补打卡期限已结束（${label}），无法再补打卡`;
}

module.exports = {
  WINDOW_LABELS,
  normalizeDate,
  resolveWindowEndDate,
  evaluateTaskBackfillWindow,
  buildTaskBackfillExpiredMessage
};
