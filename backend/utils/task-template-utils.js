function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateInput, days) {
  const date = dateInput instanceof Date ? new Date(dateInput.getTime()) : new Date(`${dateInput}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setDate(date.getDate() + Number(days || 0));
  return date;
}

const TASK_TEMPLATE_TYPES = ['habit', 'study', 'interest'];
const TASK_TEMPLATE_REPEAT_TYPES = ['none', 'daily', 'weekly', 'workdays', 'weekends', 'custom'];
const TASK_TEMPLATE_POINTS_EXPIRY = ['permanent', 'week', 'month', 'quarter'];

const REPEAT_TYPE_FALLBACKS = {
  monthly: 'none'
};

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
  const safeReminder = reminder && typeof reminder === 'object' ? reminder : {};
  return {
    enabled: safeReminder.enabled === true,
    time: Number.isFinite(Number(safeReminder.time)) ? Number(safeReminder.time) : 0
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
  const defaultDate = normalizeDateString(options.defaultDate, getTodayString());
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
      ? (() => {
        const start = new Date(normalizedStartDate);
        const end = new Date(normalizedEndDate);
        const diffMs = end.getTime() - start.getTime();
        return Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1);
      })()
      : 1;
    const endOfWeek = normalizedStartDate
      ? (() => {
        const start = new Date(normalizedStartDate);
        const weekday = start.getDay();
        const diff = (weekday + 6) % 7;
        start.setDate(start.getDate() - diff + 6);
        return formatDate(start);
      })()
      : '';
    const endOfMonth = normalizedStartDate
      ? (() => {
        const start = new Date(normalizedStartDate);
        return formatDate(new Date(start.getFullYear(), start.getMonth() + 1, 0));
      })()
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
  addDays,
  buildTemplateSearchText,
  formatDate,
  getTodayString,
  normalizeDateString,
  normalizeDateStrategy,
  normalizePoints,
  normalizePointsExpiry,
  normalizeReminder,
  normalizeRepeatDays,
  normalizeTaskType,
  normalizeTimeString,
  normalizeTaskPayload
};
