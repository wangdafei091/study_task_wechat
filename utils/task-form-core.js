const dateUtils = require('./dateUtils');
const taskRangeGuard = require('./task-range-guard');

const TASK_TYPES = ['habit', 'study', 'interest'];
const REPEAT_TYPES = ['none', 'daily', 'weekly', 'workdays', 'weekends', 'custom'];
const POINTS_EXPIRY_TYPES = ['permanent', 'week', 'month', 'quarter'];
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

function parseTimeToSeconds(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    Number.isNaN(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds;
}

function normalizeTaskType(value) {
  return TASK_TYPES.includes(value) ? value : 'habit';
}

function normalizePoints(value, fallback = 1) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.max(1, Math.floor(numericValue));
}

function normalizePointsExpiry(value) {
  return POINTS_EXPIRY_TYPES.includes(value) ? value : 'permanent';
}

function normalizeRepeatType(value) {
  const normalized = REPEAT_TYPE_FALLBACKS[value] || value;
  return REPEAT_TYPES.includes(normalized) ? normalized : 'none';
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

function parseDateString(date) {
  if (!date) {
    return null;
  }

  const parsedDate = new Date(String(date).replace(/-/g, '/'));
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function resolveFirstMatchingWeekday(startDate, matcher) {
  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = dateUtils.addDays(startDate, offset);
    if (matcher(candidate.getDay())) {
      return {
        date: candidate,
        offset
      };
    }
  }

  return {
    date: startDate,
    offset: 0
  };
}

function resolveRepeatMatch(input = {}, repeatType) {
  const startDate = parseDateString(input.startDate);
  if (!startDate) {
    return null;
  }

  const normalizedRepeatType = normalizeRepeatType(
    repeatType || input.repeatType || input.repeat?.type
  );
  const selectedDays = normalizeRepeatDays(input.repeatDays || input.repeat?.days);
  const currentWeekday = startDate.getDay();

  switch (normalizedRepeatType) {
    case 'daily':
    case 'weekly':
      return {
        offset: 0,
        date: startDate
      };
    case 'workdays':
      return resolveFirstMatchingWeekday(startDate, (weekday) => weekday >= 1 && weekday <= 5);
    case 'weekends':
      return resolveFirstMatchingWeekday(startDate, (weekday) => weekday === 0 || weekday === 6);
    case 'custom':
      if (selectedDays.length === 0) {
        return null;
      }

      if (selectedDays.includes(currentWeekday)) {
        return {
          offset: 0,
          date: startDate
        };
      }

      return resolveFirstMatchingWeekday(startDate, (weekday) => selectedDays.includes(weekday));
    default:
      return {
        offset: 0,
        date: startDate
      };
  }
}

function resolveDefaultTimeRange(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const currentHour = now.getHours();
  let startHour = currentHour;
  let endHour = currentHour + 1;

  if (currentHour >= 20) {
    startHour = 9;
    endHour = 10;
  }

  if (endHour >= 24) {
    endHour = 23;
  }

  return {
    startTime: `${String(startHour).padStart(2, '0')}:00`,
    endTime: `${String(endHour).padStart(2, '0')}:00`
  };
}

function resolveAdjustedEndTime(startTime, currentEndTime, options = {}) {
  if (!startTime) {
    return {
      endTime: currentEndTime || '',
      adjusted: false
    };
  }

  if (currentEndTime) {
    const startSeconds = parseTimeToSeconds(startTime);
    const endSeconds = parseTimeToSeconds(currentEndTime);

    if (startSeconds !== null && endSeconds !== null && endSeconds > startSeconds) {
      return {
        endTime: currentEndTime,
        adjusted: false
      };
    }
  }

  const startParts = startTime.split(':').map(Number);
  const startHours = Number.isInteger(startParts[0]) ? startParts[0] : 9;
  const startMinutes = Number.isInteger(startParts[1]) ? startParts[1] : 0;
  const durationHours = Number.isInteger(Number(options.durationHours))
    ? Math.max(1, Number(options.durationHours))
    : 1;
  const newEndHour = (startHours + durationHours) % 24;

  return {
    endTime: `${String(newEndHour).padStart(2, '0')}:${String(startMinutes).padStart(2, '0')}`,
    adjusted: true
  };
}

function buildReminderOptionsFromDraft(draftInput = {}) {
  const draft = normalizeTaskFormDraft(draftInput, {
    scene: draftInput.scene || 'task',
    today: draftInput.startDate
  });

  if (draft.isAllDay === true) {
    return [
      { label: '无', enabled: false, time: 0 },
      { label: '提前1天(晚上8点)', enabled: true, time: -1 }
    ];
  }

  if (draft.startTime) {
    return [
      { label: '无', enabled: false, time: 0 },
      { label: '准时', enabled: true, time: 0 },
      { label: '提前5分钟', enabled: true, time: 5 },
      { label: '提前15分钟', enabled: true, time: 15 },
      { label: '提前30分钟', enabled: true, time: 30 },
      { label: '提前1天(晚上8点)', enabled: true, time: -1 }
    ];
  }

  return [
    { label: '无', enabled: false, time: 0 },
    { label: '提前1天(晚上8点)', enabled: true, time: -1 }
  ];
}

function createTaskFormDraft(scene = 'task', options = {}) {
  const today = normalizeDateString(options.today, dateUtils.getTodayString());
  const defaultTimeRange = resolveDefaultTimeRange({ now: options.now });

  return {
    title: '',
    description: '',
    type: 'habit',
    points: 1,
    pointsExpiry: 'permanent',
    isRequired: false,
    isAllDay: false,
    startDate: today,
    endDate: today,
    hasNoEndDate: false,
    startTime: defaultTimeRange.startTime,
    endTime: defaultTimeRange.endTime,
    repeatType: scene === 'task' ? 'daily' : 'none',
    repeatDays: [],
    reminderEnabled: false,
    reminderTime: 0,
    dateStrategy: {
      mode: 'today',
      autoShiftExpiredEndDate: true,
      endMode: 'same-day',
      durationDays: 1
    }
  };
}

function inferDateStrategy(input = {}, context = {}) {
  const repeatType = normalizeRepeatType(context.repeatType || input.repeatType || input.repeat?.type);
  const hasRepeatRule = repeatType !== 'none';
  const dateStrategy = input.dateStrategy || {};
  const defaultMode = hasRepeatRule ? 'inherit-repeat-rule' : 'today';
  const mode = ['today', 'inherit-repeat-rule'].includes(dateStrategy.mode)
    ? dateStrategy.mode
    : defaultMode;
  const explicitEndMode = typeof input.endMode === 'string'
    ? input.endMode
    : (typeof dateStrategy.endMode === 'string' ? dateStrategy.endMode : '');
  const rawDurationDays = input.durationDays !== undefined
    ? Number(input.durationDays)
    : Number(dateStrategy.durationDays);
  const startDate = normalizeDateString(context.startDate || input.startDate, '');
  const rawEndDate = context.hasNoEndDate === true
    ? ''
    : normalizeDateString(context.endDate || input.endDate, startDate);
  const inferredDurationDays = startDate && rawEndDate
    ? Math.max(1, dateUtils.getDaysBetween(startDate, rawEndDate) + 1)
    : 1;
  const endOfWeek = startDate
    ? dateUtils.formatDate(dateUtils.addDays(dateUtils.getFirstDayOfWeek(startDate, 1), 6))
    : '';
  const endOfMonth = startDate
    ? dateUtils.formatDate(dateUtils.getLastDayOfMonth(startDate))
    : '';

  let endMode = 'same-day';
  let durationDays = 1;

  if (!hasRepeatRule) {
    endMode = 'same-day';
    durationDays = 1;
  } else if (explicitEndMode === 'no-end') {
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
  } else if (context.hasNoEndDate === true || dateStrategy.durationDays === null) {
    endMode = 'no-end';
    durationDays = null;
  } else if (Number.isInteger(rawDurationDays) && rawDurationDays >= 1) {
    endMode = 'duration';
    durationDays = rawDurationDays;
  } else if (startDate && rawEndDate && rawEndDate === endOfWeek) {
    endMode = 'week-end';
    durationDays = null;
  } else if (startDate && rawEndDate && rawEndDate === endOfMonth) {
    endMode = 'month-end';
    durationDays = null;
  } else {
    endMode = 'duration';
    durationDays = inferredDurationDays;
  }

  if (endMode === 'duration' && (!Number.isInteger(Number(durationDays)) || Number(durationDays) < 1)) {
    durationDays = 1;
  }

  return {
    mode,
    autoShiftExpiredEndDate: dateStrategy.autoShiftExpiredEndDate !== false,
    endMode,
    durationDays: endMode === 'duration' || endMode === 'same-day' ? Number(durationDays || 1) : null
  };
}

function resolveEndDateByStrategy(startDate, dateStrategy = {}) {
  const normalizedStartDate = normalizeDateString(startDate, '');
  if (!normalizedStartDate) {
    return '';
  }

  if (dateStrategy.endMode === 'no-end') {
    return '';
  }

  if (dateStrategy.endMode === 'week-end') {
    return dateUtils.formatDate(dateUtils.addDays(dateUtils.getFirstDayOfWeek(normalizedStartDate, 1), 6));
  }

  if (dateStrategy.endMode === 'month-end') {
    return dateUtils.formatDate(dateUtils.getLastDayOfMonth(normalizedStartDate));
  }

  const durationDays = Number.isInteger(Number(dateStrategy.durationDays))
    ? Math.max(1, Number(dateStrategy.durationDays))
    : 1;

  return dateUtils.formatDate(dateUtils.addDays(normalizedStartDate, durationDays - 1));
}

function normalizeTaskFormDraft(input = {}, options = {}) {
  const scene = options.scene || input.scene || 'task';
  const today = normalizeDateString(options.today, dateUtils.getTodayString());
  const defaults = createTaskFormDraft(scene, {
    today,
    now: options.now
  });

  const title = String(input.title !== undefined ? input.title : input.taskTitle || defaults.title).trim();
  const description = String(
    input.description !== undefined
      ? input.description
      : (input.taskDescription !== undefined ? input.taskDescription : defaults.description)
  ).trim();
  const type = normalizeTaskType(input.type !== undefined ? input.type : defaults.type);
  const points = normalizePoints(input.points !== undefined ? input.points : defaults.points, defaults.points);
  const pointsExpiry = normalizePointsExpiry(
    input.pointsExpiry !== undefined ? input.pointsExpiry : defaults.pointsExpiry
  );
  const isRequired = input.isRequired === true;
  const isAllDay = input.isAllDay === true;
  const startDate = normalizeDateString(input.startDate, defaults.startDate || today);
  const rawHasNoEndDate = input.hasNoEndDate === true || input.endMode === 'no-end' || input.dateStrategy?.endMode === 'no-end';
  const rawEndDate = rawHasNoEndDate
    ? ''
    : normalizeDateString(input.endDate, startDate);
  const startTime = isAllDay
    ? ''
    : normalizeTimeString(input.startTime, defaults.startTime);
  const endTime = isAllDay
    ? ''
    : normalizeTimeString(input.endTime, defaults.endTime);
  const repeatType = normalizeRepeatType(
    input.repeatType !== undefined
      ? input.repeatType
      : (input.repeat?.type !== undefined ? input.repeat.type : defaults.repeatType)
  );
  const repeatDays = normalizeRepeatDays(
    input.repeatDays !== undefined ? input.repeatDays : input.repeat?.days
  );
  const reminderSource = input.reminder !== undefined
    ? input.reminder
    : {
        enabled: input.reminderEnabled,
        time: input.reminderTime
      };
  const reminder = normalizeReminder(reminderSource);
  const dateStrategy = inferDateStrategy(input, {
    repeatType,
    startDate,
    endDate: rawEndDate,
    hasNoEndDate: rawHasNoEndDate
  });

  let endDate = rawHasNoEndDate ? '' : rawEndDate;
  if (repeatType !== 'none' && !rawHasNoEndDate && !endDate) {
    endDate = resolveEndDateByStrategy(startDate, dateStrategy);
  }

  if (repeatType === 'none' && !rawHasNoEndDate && !endDate) {
    endDate = startDate;
  }

  return {
    title,
    description,
    type,
    points,
    pointsExpiry,
    isRequired,
    isAllDay,
    startDate,
    endDate: rawHasNoEndDate ? '' : endDate,
    hasNoEndDate: rawHasNoEndDate || dateStrategy.endMode === 'no-end',
    startTime,
    endTime,
    repeatType,
    repeatDays,
    reminderEnabled: reminder.enabled,
    reminderTime: reminder.time,
    dateStrategy
  };
}

function buildTaskPayloadFromDraft(draftInput = {}) {
  const draft = normalizeTaskFormDraft(draftInput, {
    scene: draftInput.scene || 'task',
    today: draftInput.startDate
  });
  const repeatEndDate = draft.hasNoEndDate ? '' : (draft.endDate || draft.startDate);

  return {
    title: draft.title,
    type: draft.type,
    points: draft.points,
    pointsExpiry: draft.pointsExpiry,
    description: draft.description,
    isRequired: draft.isRequired,
    isAllDay: draft.isAllDay,
    startDate: draft.startDate,
    startTime: draft.isAllDay ? '' : draft.startTime,
    endDate: draft.hasNoEndDate ? '' : (draft.endDate || draft.startDate),
    endTime: draft.isAllDay ? '' : draft.endTime,
    hasNoEndDate: draft.hasNoEndDate,
    repeat: {
      type: draft.repeatType,
      days: draft.repeatType === 'custom' ? draft.repeatDays : [],
      startDate: draft.startDate,
      endDate: repeatEndDate
    },
    reminder: {
      enabled: draft.reminderEnabled,
      time: draft.reminderTime
    }
  };
}

function buildTemplatePayloadFromDraft(draftInput = {}, meta = {}) {
  const today = normalizeDateString(meta.today, draftInput.startDate || dateUtils.getTodayString());
  const draft = normalizeTaskFormDraft(draftInput, {
    scene: 'template',
    today
  });
  const endDate = draft.repeatType === 'none'
    ? today
    : resolveEndDateByStrategy(today, draft.dateStrategy);
  const hasNoEndDate = draft.repeatType !== 'none' && draft.dateStrategy.endMode === 'no-end';

  return {
    taskPayload: {
      title: draft.title,
      type: draft.type,
      points: draft.points,
      pointsExpiry: draft.pointsExpiry,
      description: draft.description,
      isRequired: draft.isRequired,
      isAllDay: draft.isAllDay,
      startDate: today,
      startTime: draft.isAllDay ? '' : draft.startTime,
      endDate: hasNoEndDate ? '' : endDate,
      endTime: draft.isAllDay ? '' : draft.endTime,
      hasNoEndDate,
      repeat: {
        type: draft.repeatType,
        days: draft.repeatType === 'custom' ? draft.repeatDays : [],
        startDate: today,
        endDate: hasNoEndDate ? '' : endDate
      },
      reminder: {
        enabled: draft.reminderEnabled,
        time: draft.reminderTime
      }
    },
    dateStrategy: deepClone(draft.dateStrategy)
  };
}

function resolveTaskScheduleFromDraft(draftInput = {}, context = {}) {
  const today = normalizeDateString(context.today, draftInput.startDate || dateUtils.getTodayString());
  const draft = normalizeTaskFormDraft(draftInput, {
    scene: 'template',
    today
  });

  if (draft.repeatType === 'none') {
    return {
      startDate: today,
      endDate: today,
      hasNoEndDate: false,
      repeatStartDate: today,
      repeatEndDate: today
    };
  }

  const match = resolveRepeatMatch({
    startDate: today,
    repeatType: draft.repeatType,
    repeatDays: draft.repeatDays
  }, draft.repeatType);
  const startDate = match?.date ? dateUtils.formatDate(match.date) : today;
  const hasNoEndDate = draft.dateStrategy.endMode === 'no-end';
  const endDate = hasNoEndDate
    ? ''
    : resolveEndDateByStrategy(startDate, draft.dateStrategy);

  return {
    startDate,
    endDate,
    hasNoEndDate,
    repeatStartDate: startDate,
    repeatEndDate: hasNoEndDate ? '' : endDate
  };
}

function validateTaskFormDraft(draftInput = {}, options = {}) {
  const scene = options.scene || draftInput.scene || 'task';
  const rawStartDate = typeof draftInput.startDate === 'string'
    ? draftInput.startDate.trim()
    : '';
  const rawStartTime = typeof draftInput.startTime === 'string'
    ? draftInput.startTime.trim()
    : '';
  const rawEndTime = typeof draftInput.endTime === 'string'
    ? draftInput.endTime.trim()
    : '';
  const rawRepeatType = normalizeRepeatType(
    draftInput.repeatType !== undefined
      ? draftInput.repeatType
      : draftInput.repeat?.type
  );
  const rawEndMode = typeof draftInput.endMode === 'string'
    ? draftInput.endMode
    : draftInput.dateStrategy?.endMode;
  const rawHasNoEndDate = draftInput.hasNoEndDate === true || rawEndMode === 'no-end';
  const rawEndDate = rawHasNoEndDate
    ? ''
    : normalizeDateString(
      draftInput.endDate !== undefined ? draftInput.endDate : draftInput.repeat?.endDate,
      ''
    );
  const draft = normalizeTaskFormDraft(draftInput, {
    scene,
    today: options.today || draftInput.startDate
  });
  const templateName = String(options.templateName || '').trim();
  const templateDescription = String(options.templateDescription || '').trim();
  const rawDurationDays = Number(
    draftInput.durationDays !== undefined
      ? draftInput.durationDays
      : draftInput.dateStrategy?.durationDays
  );

  if (scene === 'template') {
    if (templateName.length > 100) {
      return { valid: false, errorMsg: '模板别名不能超过100个字符' };
    }

    if (templateDescription.length > 255) {
      return { valid: false, errorMsg: '模板说明不能超过255个字符' };
    }
  }

  if (!draft.title) {
    return {
      valid: false,
      errorMsg: scene === 'template' ? '请输入任务名称' : '请输入任务标题'
    };
  }

  if (scene === 'task' && !draft.startDate) {
    return { valid: false, errorMsg: '请选择开始日期' };
  }

  if (scene === 'task' && !rawStartDate) {
    return { valid: false, errorMsg: '请选择开始日期' };
  }

  if (scene === 'task' && rawRepeatType !== 'none' && !rawHasNoEndDate && !rawEndDate) {
    return { valid: false, errorMsg: '请设置重复任务的结束日期' };
  }

  if (draft.endDate && draft.startDate && draft.endDate < draft.startDate) {
    return { valid: false, errorMsg: '结束日期不能早于开始日期' };
  }

  if (!draft.isAllDay && (!rawStartTime || !rawEndTime)) {
    return { valid: false, errorMsg: '请设置开始和结束时间' };
  }

  if (!draft.isAllDay) {
    const startSeconds = parseTimeToSeconds(draft.startTime);
    const endSeconds = parseTimeToSeconds(draft.endTime);
    if (startSeconds !== null && endSeconds !== null && endSeconds <= startSeconds) {
      return { valid: false, errorMsg: '结束时间不能早于开始时间' };
    }
  }

  if (draft.repeatType === 'custom' && draft.repeatDays.length === 0) {
    return {
      valid: false,
      errorMsg: scene === 'template' ? '请选择至少一个重复星期' : '请至少选择一个重复的星期'
    };
  }

  if (
    scene === 'template' &&
    rawRepeatType !== 'none' &&
    rawEndMode === 'duration' &&
    (!Number.isInteger(rawDurationDays) || rawDurationDays < 1)
  ) {
    return {
      valid: false,
      errorMsg: '请输入有效的持续天数'
    };
  }

  const rangeValidation = scene === 'template'
    ? taskRangeGuard.validateTemplateRangeLimits(
      buildTemplatePayloadFromDraft(draft, {
        today: options.today || draftInput.startDate
      }),
      { previousTemplate: options.previousTemplate || null }
    )
    : taskRangeGuard.validateTaskRangeLimits(
      buildTaskPayloadFromDraft(draft),
      { previousTask: options.previousTask || null }
    );

  if (!rangeValidation.valid) {
    return {
      valid: false,
      errorMsg: rangeValidation.message
    };
  }

  return {
    valid: true,
    errorMsg: ''
  };
}

module.exports = {
  TASK_TYPES,
  REPEAT_TYPES,
  POINTS_EXPIRY_TYPES,
  deepClone,
  normalizeDateString,
  normalizeTimeString,
  parseTimeToSeconds,
  normalizeTaskType,
  normalizePoints,
  normalizePointsExpiry,
  normalizeRepeatType,
  normalizeRepeatDays,
  normalizeReminder,
  resolveRepeatMatch,
  resolveDefaultTimeRange,
  resolveAdjustedEndTime,
  buildReminderOptionsFromDraft,
  createTaskFormDraft,
  normalizeTaskFormDraft,
  buildTaskPayloadFromDraft,
  buildTemplatePayloadFromDraft,
  resolveTaskScheduleFromDraft,
  validateTaskFormDraft
};
