const Constants = require('./constants');
const dateUtils = require('./dateUtils');

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const PREVIEW_CHIP_LABELS = {
  repeat: '重复',
  reminder: '提醒',
  pointsExpiry: '星星有效期'
};

function buildPointsExpiryText(pointsExpiry) {
  return Constants.POINTS_EXPIRY.TEXT[pointsExpiry] || Constants.POINTS_EXPIRY.TEXT.permanent;
}

function buildReminderText(reminder = {}) {
  if (!reminder || reminder.enabled !== true) {
    return '无';
  }

  if (Number(reminder.time) === 0) {
    return '准时';
  }

  if (Number(reminder.time) === -1) {
    return '提前1天(晚上8点)';
  }

  return `提前${Number(reminder.time)}分钟`;
}

function buildRepeatText(repeat = {}, options = {}) {
  if (options.isRepeatOptionDisabled) {
    return '当天';
  }

  switch (repeat?.type) {
    case 'none':
      return '不重复';
    case 'daily':
      return '每天';
    case 'weekly':
      return '每周';
    case 'workdays':
      return '工作日';
    case 'weekends':
      return '休息日';
    case 'custom': {
      const selectedDays = Array.isArray(repeat.days) ? repeat.days : [];
      if (selectedDays.length === 0) {
        return '请选择星期';
      }
      if (selectedDays.length > 5) {
        return '每周多天';
      }
      return `每${selectedDays.map((day) => WEEKDAY_NAMES[day]).join('、')}`;
    }
    default:
      return '每天';
  }
}

function buildWeekdaySelection(repeat = {}) {
  if (repeat?.type === 'custom') {
    const selectedDays = Array.isArray(repeat.days) ? repeat.days : [];
    return WEEKDAY_NAMES.map((_, index) => selectedDays.includes(index));
  }

  if (repeat?.type === 'workdays') {
    return [false, true, true, true, true, true, false];
  }

  if (repeat?.type === 'weekends') {
    return [true, false, false, false, false, false, true];
  }

  return [false, false, false, false, false, false, false];
}

function isRepeatOptionDisabled(form = {}) {
  return Boolean(
    form.repeat?.type &&
    form.repeat.type !== 'none' &&
    form.startDate &&
    form.endDate &&
    form.hasNoEndDate !== true &&
    form.startDate === form.endDate
  );
}

function parseDateString(date) {
  if (!date) {
    return null;
  }

  const parsedDate = new Date(String(date).replace(/-/g, '/'));
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function normalizeSelectedDays(repeat = {}) {
  const selectedDays = Array.isArray(repeat.days) ? repeat.days : [];
  return [...new Set(
    selectedDays
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  )].sort((left, right) => left - right);
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

function resolveRepeatMatch(form = {}, repeatType) {
  const startDate = parseDateString(form.startDate);
  if (!startDate) {
    return null;
  }

  const currentWeekday = startDate.getDay();
  switch (repeatType) {
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
    case 'custom': {
      const selectedDays = normalizeSelectedDays(form.repeat);
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
    }
    default:
      return {
        offset: 0,
        date: startDate
      };
  }
}

function resolveDateStrategy(form = {}) {
  const dateStrategy = form.dateStrategy || {};
  const explicitEndMode = form.endMode || dateStrategy.endMode;

  if (explicitEndMode) {
    return {
      endMode: explicitEndMode,
      durationDays: dateStrategy.durationDays
    };
  }

  if (form.hasNoEndDate === true) {
    return {
      endMode: 'no-end',
      durationDays: null
    };
  }

  if (form.startDate && form.endDate) {
    return {
      endMode: 'duration',
      durationDays: Math.max(1, dateUtils.getDaysBetween(form.startDate, form.endDate) + 1)
    };
  }

  return {
    endMode: '',
    durationDays: null
  };
}

function buildRepeatResultTexts(form = {}, repeatType) {
  if (!repeatType || repeatType === 'none' || !form.startDate) {
    return {
      primaryText: '',
      secondaryText: ''
    };
  }

  if (repeatType === 'custom') {
    const selectedDays = normalizeSelectedDays(form.repeat);
    if (selectedDays.length === 0) {
      return {
        primaryText: '请至少选择一个重复的星期',
        secondaryText: ''
      };
    }
  }

  const match = resolveRepeatMatch(form, repeatType);
  if (!match) {
    return {
      primaryText: '',
      secondaryText: ''
    };
  }

  const firstMatchWeekday = WEEKDAY_NAMES[match.date.getDay()];
  const selectedDayNames = normalizeSelectedDays(form.repeat).map((day) => WEEKDAY_NAMES[day]).join('、');
  let primaryText = '';

  switch (repeatType) {
    case 'daily':
      primaryText = '创建任务时，将从今天开始每天执行';
      break;
    case 'weekly':
      primaryText = '创建任务时，将从今天开始每周执行';
      break;
    case 'workdays':
      primaryText = match.offset === 0
        ? '创建任务时，将从今天开始在工作日执行'
        : '创建任务时，将从下一个工作日开始执行';
      break;
    case 'weekends':
      primaryText = match.offset === 0
        ? '创建任务时，将从今天开始在休息日执行'
        : '创建任务时，将从下一个休息日开始执行';
      break;
    case 'custom':
      primaryText = match.offset === 0
        ? `创建任务时，将从今天开始在${selectedDayNames}执行`
        : `创建任务时，将从下一个${firstMatchWeekday}开始执行`;
      break;
    default:
      primaryText = '';
      break;
  }

  let secondaryText = '';
  const strategy = resolveDateStrategy(form);
  if (strategy.endMode === 'no-end') {
    secondaryText = '默认长期有效';
  } else if (strategy.endMode === 'week-end') {
    secondaryText = '结束日期为该周周日';
  } else if (strategy.endMode === 'month-end') {
    secondaryText = '结束日期为该月最后一天';
  } else if (strategy.endMode === 'duration' && repeatType !== 'none' && Number(strategy.durationDays || 0) >= 1) {
    secondaryText = `从实际开始日算，共持续 ${Number(strategy.durationDays)} 天`;
  }

  return {
    primaryText,
    secondaryText
  };
}

function checkRepeatDateConflict(form = {}, repeatType) {
  if (!form.startDate || !repeatType || repeatType === 'none' || repeatType === 'daily' || repeatType === 'weekly') {
    return {
      hasConflict: false,
      previewText: '',
      primaryText: '',
      secondaryText: '',
      conflictType: ''
    };
  }

  const startDate = parseDateString(form.startDate);
  if (!startDate) {
    return {
      hasConflict: false,
      previewText: '',
      primaryText: '',
      secondaryText: '',
      conflictType: ''
    };
  }

  const dayOfWeek = startDate.getDay();
  const resultTexts = buildRepeatResultTexts(form, repeatType);

  if (repeatType === 'workdays' && (dayOfWeek === 0 || dayOfWeek === 6)) {
    return {
      hasConflict: true,
      previewText: `${resultTexts.primaryText}${resultTexts.secondaryText ? ` ${resultTexts.secondaryText}` : ''}`,
      primaryText: resultTexts.primaryText,
      secondaryText: resultTexts.secondaryText,
      conflictType: 'workdays_conflict'
    };
  }

  if (repeatType === 'weekends' && dayOfWeek !== 0 && dayOfWeek !== 6) {
    return {
      hasConflict: true,
      previewText: `${resultTexts.primaryText}${resultTexts.secondaryText ? ` ${resultTexts.secondaryText}` : ''}`,
      primaryText: resultTexts.primaryText,
      secondaryText: resultTexts.secondaryText,
      conflictType: 'weekends_conflict'
    };
  }

  if (repeatType === 'custom') {
    const selectedDays = normalizeSelectedDays(form.repeat);

    if (selectedDays.length === 0) {
      return {
        hasConflict: true,
        previewText: resultTexts.primaryText,
        primaryText: resultTexts.primaryText,
        secondaryText: '',
        conflictType: 'custom_days_missing'
      };
    }

    if (!selectedDays.includes(dayOfWeek)) {
      return {
        hasConflict: true,
        previewText: `${resultTexts.primaryText}${resultTexts.secondaryText ? ` ${resultTexts.secondaryText}` : ''}`,
        primaryText: resultTexts.primaryText,
        secondaryText: resultTexts.secondaryText,
        conflictType: 'custom_start_day_mismatch'
      };
    }
  }

  return {
    hasConflict: false,
    previewText: '',
    primaryText: resultTexts.primaryText,
    secondaryText: resultTexts.secondaryText,
    conflictType: ''
  };
}

function buildRepeatPreviewText(form = {}, repeatType) {
  if (!repeatType || repeatType === 'none' || !form.startDate) {
    return '';
  }

  const conflict = checkRepeatDateConflict(form, repeatType);
  if (conflict.hasConflict) {
    return conflict.previewText;
  }

  const resultTexts = buildRepeatResultTexts(form, repeatType);
  return `${resultTexts.primaryText}${resultTexts.secondaryText ? ` ${resultTexts.secondaryText}` : ''}`;
}

function buildTaskFormDisplayState(form = {}, options = {}) {
  const repeatType = form.repeat?.type || 'none';
  const repeatDisabled = options.ignoreRepeatOptionDisabled === true
    ? false
    : isRepeatOptionDisabled(form);
  const repeatConflict = checkRepeatDateConflict(form, repeatType);
  const repeatResultTexts = buildRepeatResultTexts(form, repeatType);
  const repeatText = buildRepeatText(form.repeat, { isRepeatOptionDisabled: repeatDisabled });
  const reminderText = buildReminderText(form.reminder);
  const pointsExpiryText = buildPointsExpiryText(form.pointsExpiry);

  return {
    repeatText,
    reminderText,
    pointsExpiryText,
    repeatPreviewText: buildRepeatPreviewText(form, repeatType),
    repeatTypeWarning: repeatConflict.hasConflict,
    resultPrimaryText: repeatConflict.primaryText || repeatResultTexts.primaryText,
    resultSecondaryText: repeatConflict.secondaryText || repeatResultTexts.secondaryText,
    previewChips: [
      { key: 'repeat', label: PREVIEW_CHIP_LABELS.repeat, value: repeatText },
      { key: 'reminder', label: PREVIEW_CHIP_LABELS.reminder, value: reminderText },
      { key: 'pointsExpiry', label: PREVIEW_CHIP_LABELS.pointsExpiry, value: pointsExpiryText }
    ],
    weekdaySelection: buildWeekdaySelection(form.repeat),
    isRepeatOptionDisabled: repeatDisabled
  };
}

module.exports = {
  PREVIEW_CHIP_LABELS,
  WEEKDAY_NAMES,
  buildPointsExpiryText,
  buildReminderText,
  buildRepeatText,
  buildRepeatResultTexts,
  buildRepeatPreviewText,
  buildWeekdaySelection,
  buildTaskFormDisplayState,
  isRepeatOptionDisabled,
  checkRepeatDateConflict,
  resolveRepeatMatch
};
