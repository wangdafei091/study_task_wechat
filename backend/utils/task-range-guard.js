const DAY_MS = 24 * 60 * 60 * 1000;

const MAX_REPEAT_TASK_RANGE_DAYS = 93;
const MAX_OCCURRENCE_ACTIVE_RANGE_DAYS = 180;
const MAX_TEMPLATE_REPEAT_RANGE_DAYS = 93;

function buildRangeLimitMessage() {
  return '时间范围过长，请缩短后再保存';
}

function parseDateValue(value) {
  if (!value || typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  const utcTime = Date.UTC(year, month - 1, day);
  return Number.isFinite(utcTime) ? utcTime : null;
}

function calculateInclusiveRangeDays(startDate, endDate) {
  const startTime = parseDateValue(startDate);
  const endTime = parseDateValue(endDate);
  if (startTime === null || endTime === null || endTime < startTime) {
    return null;
  }

  return Math.floor((endTime - startTime) / DAY_MS) + 1;
}

function resolveRepeatRange(entity = {}) {
  const repeat = entity.repeat || {};
  if (!repeat || repeat.type === 'none' || entity.hasNoEndDate === true) {
    return null;
  }

  const startDate = repeat.startDate || entity.startDate || entity.date || '';
  const endDate = repeat.endDate || entity.endDate || '';
  const days = calculateInclusiveRangeDays(startDate, endDate);
  if (days === null) {
    return null;
  }

  return {
    code: 'TASK_REPEAT_RANGE_TOO_LARGE',
    message: buildRangeLimitMessage(),
    days,
    maxDays: MAX_REPEAT_TASK_RANGE_DAYS
  };
}

function resolveOccurrenceRange(entity = {}) {
  if (entity.executionMode !== 'occurrence' || entity.isOccurrenceRecord === true) {
    return null;
  }

  const activeRange = entity.activeRange || {};
  const hasNoEndDate = activeRange.hasNoEndDate === true || entity.hasNoEndDate === true;
  if (hasNoEndDate) {
    return null;
  }

  const startDate = activeRange.startDate || entity.startDate || entity.date || '';
  const endDate = activeRange.endDate || entity.endDate || '';
  const days = calculateInclusiveRangeDays(startDate, endDate);
  if (days === null) {
    return null;
  }

  return {
    code: 'TASK_ACTIVE_RANGE_TOO_LARGE',
    message: buildRangeLimitMessage(),
    days,
    maxDays: MAX_OCCURRENCE_ACTIVE_RANGE_DAYS
  };
}

function resolveTemplateRange(entity = {}) {
  const payload = entity.taskPayload || entity;
  const dateStrategy = entity.dateStrategy || {};
  const repeat = payload.repeat || {};
  if (!repeat || repeat.type === 'none' || payload.hasNoEndDate === true || dateStrategy.endMode === 'no-end') {
    return null;
  }

  let days = null;
  if (dateStrategy.endMode === 'duration') {
    const durationDays = Number(dateStrategy.durationDays);
    if (Number.isFinite(durationDays) && durationDays > 0) {
      days = durationDays;
    }
  }

  if (days === null) {
    const startDate = repeat.startDate || payload.startDate || '';
    const endDate = repeat.endDate || payload.endDate || '';
    days = calculateInclusiveRangeDays(startDate, endDate);
  }

  if (days === null) {
    return null;
  }

  return {
    code: 'TASK_TEMPLATE_RANGE_TOO_LARGE',
    message: buildRangeLimitMessage(),
    days,
    maxDays: MAX_TEMPLATE_REPEAT_RANGE_DAYS
  };
}

function evaluateLimit(nextRange, previousRange = null) {
  if (!nextRange || nextRange.days <= nextRange.maxDays) {
    return { valid: true };
  }

  if (previousRange && previousRange.days > nextRange.maxDays && nextRange.days <= previousRange.days) {
    return { valid: true, legacyAllowed: true };
  }

  return {
    valid: false,
    code: nextRange.code,
    message: nextRange.message,
    rangeDays: nextRange.days,
    maxDays: nextRange.maxDays
  };
}

function validateTaskRangeLimits(task = {}, options = {}) {
  const previousTask = options.previousTask || null;
  const nextOccurrenceRange = resolveOccurrenceRange(task);
  if (nextOccurrenceRange) {
    return evaluateLimit(nextOccurrenceRange, previousTask ? resolveOccurrenceRange(previousTask) : null);
  }

  const nextRepeatRange = resolveRepeatRange(task);
  if (nextRepeatRange) {
    return evaluateLimit(nextRepeatRange, previousTask ? resolveRepeatRange(previousTask) : null);
  }

  return { valid: true };
}

function validateTemplateRangeLimits(template = {}, options = {}) {
  const previousTemplate = options.previousTemplate || null;
  const nextRange = resolveTemplateRange(template);
  return evaluateLimit(nextRange, previousTemplate ? resolveTemplateRange(previousTemplate) : null);
}

module.exports = {
  MAX_REPEAT_TASK_RANGE_DAYS,
  MAX_OCCURRENCE_ACTIVE_RANGE_DAYS,
  MAX_TEMPLATE_REPEAT_RANGE_DAYS,
  buildRangeLimitMessage,
  calculateInclusiveRangeDays,
  validateTaskRangeLimits,
  validateTemplateRangeLimits
};
