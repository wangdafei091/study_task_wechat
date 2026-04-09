const dateUtils = require('./dateUtils');

const TASK_TEMPLATE_TYPES = ['habit', 'study', 'interest'];
const TASK_TEMPLATE_REPEAT_TYPES = ['none', 'daily', 'weekly', 'workdays', 'weekends', 'custom'];
const TASK_TEMPLATE_POINTS_EXPIRY = ['permanent', 'week', 'month', 'quarter'];

const REPEAT_TYPE_FALLBACKS = {
  monthly: 'none'
};

function deepClone(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function normalizeDateString(value, fallback = '') {
  if (!value || typeof value !== 'string') {
    return fallback;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function normalizeTimeString(value, fallback = '') {
  if (!value || typeof value !== 'string') {
    return fallback;
  }
  return /^\d{2}:\d{2}$/.test(value) ? value : fallback;
}

function normalizeTaskType(value) {
  return TASK_TEMPLATE_TYPES.includes(value) ? value : 'habit';
}

function normalizePoints(value, fallback = 1) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.max(1, Math.floor(numericValue));
}

function normalizePointsExpiry(value) {
  return TASK_TEMPLATE_POINTS_EXPIRY.includes(value) ? value : 'permanent';
}

function normalizeRepeatType(value) {
  const normalized = REPEAT_TYPE_FALLBACKS[value] || value;
  return TASK_TEMPLATE_REPEAT_TYPES.includes(normalized) ? normalized : 'none';
}

function normalizeRepeatDays(days) {
  if (!Array.isArray(days)) {
    return [];
  }

  const values = Array.from(
    new Set(
      days
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    )
  );

  return values.sort((left, right) => left - right);
}

function normalizeReminder(reminder = {}) {
  return {
    enabled: reminder.enabled === true,
    time: Number.isFinite(Number(reminder.time)) ? Number(reminder.time) : 0
  };
}

function normalizeRepeat(repeat = {}, context = {}) {
  const type = normalizeRepeatType(repeat.type);
  const days = type === 'custom' ? normalizeRepeatDays(repeat.days) : [];
  const startDate = normalizeDateString(repeat.startDate, normalizeDateString(context.startDate, ''));
  const endDate = context.hasNoEndDate
    ? ''
    : normalizeDateString(repeat.endDate, normalizeDateString(context.endDate, startDate));

  return {
    type,
    days,
    startDate,
    endDate
  };
}

function normalizeTaskPayload(payload = {}, options = {}) {
  const defaultDate = normalizeDateString(options.defaultDate, dateUtils.getTodayString());
  const startDate = normalizeDateString(payload.startDate, defaultDate);
  const hasNoEndDate = payload.hasNoEndDate === true;
  const endDate = hasNoEndDate
    ? ''
    : normalizeDateString(payload.endDate, startDate);

  const normalizedPayload = {
    title: String(payload.title || '').trim(),
    type: normalizeTaskType(payload.type),
    points: normalizePoints(payload.points, 1),
    pointsExpiry: normalizePointsExpiry(payload.pointsExpiry),
    description: String(payload.description || '').trim(),
    isRequired: payload.isRequired === true,
    isAllDay: payload.isAllDay === true,
    startDate,
    startTime: normalizeTimeString(payload.startTime, '09:00'),
    endDate,
    endTime: normalizeTimeString(payload.endTime, '10:00'),
    hasNoEndDate,
    repeat: normalizeRepeat(payload.repeat, {
      startDate,
      endDate,
      hasNoEndDate
    }),
    reminder: normalizeReminder(payload.reminder)
  };

  if (normalizedPayload.repeat.type === 'none') {
    normalizedPayload.repeat.startDate = normalizedPayload.startDate;
    normalizedPayload.repeat.endDate = normalizedPayload.hasNoEndDate
      ? ''
      : normalizedPayload.endDate;
  }

  if (!normalizedPayload.hasNoEndDate && !normalizedPayload.endDate) {
    normalizedPayload.endDate = normalizedPayload.startDate;
    normalizedPayload.repeat.endDate = normalizedPayload.startDate;
  }

  return normalizedPayload;
}

function normalizeDateStrategy(dateStrategy = {}, taskPayload = {}) {
  const hasRepeatRule = normalizeRepeatType(taskPayload?.repeat?.type) !== 'none';
  const defaultMode = hasRepeatRule ? 'inherit-repeat-rule' : 'today';
  const mode = ['today', 'inherit-repeat-rule'].includes(dateStrategy.mode)
    ? dateStrategy.mode
    : defaultMode;
  const explicitEndMode = typeof dateStrategy.endMode === 'string'
    ? dateStrategy.endMode
    : '';
  const rawDurationDays = Number(dateStrategy.durationDays);
  let endMode = 'same-day';
  let durationDays = 1;

  if (!hasRepeatRule) {
    endMode = 'same-day';
    durationDays = 1;
  } else {
    const normalizedStartDate = normalizeDateString(taskPayload?.startDate, '');
    const normalizedEndDate = normalizeDateString(taskPayload?.endDate, normalizedStartDate);
    const inferredDurationDays = normalizedStartDate && normalizedEndDate
      ? Math.max(1, dateUtils.getDaysBetween(normalizedStartDate, normalizedEndDate) + 1)
      : 1;
    const endOfWeek = normalizedStartDate
      ? dateUtils.formatDate(dateUtils.addDays(dateUtils.getFirstDayOfWeek(normalizedStartDate, 1), 6))
      : '';
    const endOfMonth = normalizedStartDate
      ? dateUtils.formatDate(dateUtils.getLastDayOfMonth(normalizedStartDate))
      : '';

    if (explicitEndMode === 'no-end') {
      endMode = 'no-end';
      durationDays = null;
    } else if (explicitEndMode === 'week-end') {
      endMode = 'week-end';
      durationDays = null;
    } else if (explicitEndMode === 'month-end') {
      endMode = 'month-end';
      durationDays = null;
    } else if (explicitEndMode === 'duration') {
      endMode = 'duration';
      durationDays = Number.isInteger(rawDurationDays) && rawDurationDays >= 1
        ? rawDurationDays
        : inferredDurationDays;
    } else if (taskPayload?.hasNoEndDate === true || dateStrategy.durationDays === null) {
      endMode = 'no-end';
      durationDays = null;
    } else if (Number.isInteger(rawDurationDays) && rawDurationDays >= 1) {
      endMode = 'duration';
      durationDays = rawDurationDays;
    } else if (normalizedStartDate && normalizedEndDate && normalizedEndDate === endOfWeek) {
      endMode = 'week-end';
      durationDays = null;
    } else if (normalizedStartDate && normalizedEndDate && normalizedEndDate === endOfMonth) {
      endMode = 'month-end';
      durationDays = null;
    } else {
      endMode = 'duration';
      durationDays = Number.isInteger(rawDurationDays) && rawDurationDays >= 1
        ? rawDurationDays
        : inferredDurationDays;
    }

    if (endMode === 'duration' && (!Number.isInteger(Number(durationDays)) || Number(durationDays) < 1)) {
      durationDays = 1;
    }

    if (endMode !== 'duration' && endMode !== 'same-day') {
      durationDays = null;
    }

    if (endMode === 'same-day') {
      endMode = 'duration';
      durationDays = 1;
    }

    if (!normalizedStartDate && endMode === 'duration') {
      durationDays = 1;
    }

    if (endMode === 'no-end') {
      durationDays = null;
    }
  }

  return {
    mode,
    autoShiftExpiredEndDate: dateStrategy.autoShiftExpiredEndDate !== false,
    endMode,
    durationDays
  };
}

function createEmptyTaskPayload(options = {}) {
  const today = normalizeDateString(options.today, dateUtils.getTodayString());
  return normalizeTaskPayload({
    title: '',
    type: 'habit',
    points: 1,
    pointsExpiry: 'permanent',
    description: '',
    isRequired: false,
    isAllDay: false,
    startDate: today,
    startTime: '09:00',
    endDate: today,
    endTime: '10:00',
    hasNoEndDate: false,
    repeat: {
      type: 'none',
      days: [],
      startDate: today,
      endDate: today
    },
    reminder: {
      enabled: false,
      time: 0
    }
  }, {
    defaultDate: today
  });
}

function buildTemplateSearchText(template = {}) {
  const parts = [
    template.name,
    template.description,
    template.taskPayload?.title,
    template.taskPayload?.description
  ]
    .filter(Boolean)
    .map((item) => String(item).toLowerCase());

  return parts.join(' ');
}

module.exports = {
  TASK_TEMPLATE_TYPES,
  TASK_TEMPLATE_REPEAT_TYPES,
  TASK_TEMPLATE_POINTS_EXPIRY,
  deepClone,
  normalizeTaskType,
  normalizePoints,
  normalizePointsExpiry,
  normalizeRepeatType,
  normalizeRepeatDays,
  normalizeReminder,
  normalizeRepeat,
  normalizeTaskPayload,
  normalizeDateStrategy,
  normalizeDateString,
  normalizeTimeString,
  createEmptyTaskPayload,
  buildTemplateSearchText
};
