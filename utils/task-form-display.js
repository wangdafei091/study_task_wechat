const Constants = require('./constants');
const taskFormCore = require('./task-form-core');

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

function buildRepeatText(input = {}, options = {}) {
  const draft = taskFormCore.normalizeTaskFormDraft(input, {
    scene: input.scene || 'task',
    today: input.startDate
  });

  if (options.isRepeatOptionDisabled) {
    return '当天';
  }

  switch (draft.repeatType) {
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
    case 'custom':
      if (draft.repeatDays.length === 0) {
        return '请选择星期';
      }
      if (draft.repeatDays.length > 5) {
        return '每周多天';
      }
      return `每${draft.repeatDays.map((day) => WEEKDAY_NAMES[day]).join('、')}`;
    default:
      return '每天';
  }
}

function buildWeekdaySelection(input = {}) {
  const draft = taskFormCore.normalizeTaskFormDraft(input, {
    scene: input.scene || 'task',
    today: input.startDate
  });

  if (draft.repeatType === 'custom') {
    return WEEKDAY_NAMES.map((_, index) => draft.repeatDays.includes(index));
  }

  if (draft.repeatType === 'workdays') {
    return [false, true, true, true, true, true, false];
  }

  if (draft.repeatType === 'weekends') {
    return [true, false, false, false, false, false, true];
  }

  return [false, false, false, false, false, false, false];
}

function isRepeatOptionDisabled(input = {}) {
  const draft = taskFormCore.normalizeTaskFormDraft(input, {
    scene: input.scene || 'task',
    today: input.startDate
  });

  return Boolean(
    draft.repeatType &&
    draft.repeatType !== 'none' &&
    draft.startDate &&
    draft.endDate &&
    draft.hasNoEndDate !== true &&
    draft.startDate === draft.endDate
  );
}

function buildRepeatResultTexts(input = {}, repeatType) {
  const normalizedInput = repeatType
    ? {
        ...input,
        repeatType,
        repeat: {
          ...(input.repeat || {}),
          type: repeatType
        }
      }
    : input;
  const draft = taskFormCore.normalizeTaskFormDraft(normalizedInput, {
    scene: normalizedInput.scene || 'task',
    today: normalizedInput.startDate
  });

  if (!draft.repeatType || draft.repeatType === 'none' || !draft.startDate) {
    return {
      primaryText: '',
      secondaryText: ''
    };
  }

  if (draft.repeatType === 'custom' && draft.repeatDays.length === 0) {
    return {
      primaryText: '请至少选择一个重复的星期',
      secondaryText: ''
    };
  }

  const match = taskFormCore.resolveRepeatMatch({
    startDate: draft.startDate,
    repeatType: draft.repeatType,
    repeatDays: draft.repeatDays
  }, draft.repeatType);

  if (!match) {
    return {
      primaryText: '',
      secondaryText: ''
    };
  }

  const firstMatchWeekday = WEEKDAY_NAMES[match.date.getDay()];
  const selectedDayNames = draft.repeatDays.map((day) => WEEKDAY_NAMES[day]).join('、');
  let primaryText = '';

  switch (draft.repeatType) {
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
  if (draft.dateStrategy.endMode === 'no-end') {
    secondaryText = '默认长期有效';
  } else if (draft.dateStrategy.endMode === 'week-end') {
    secondaryText = '结束日期为该周周日';
  } else if (draft.dateStrategy.endMode === 'month-end') {
    secondaryText = '结束日期为该月最后一天';
  } else if (draft.dateStrategy.endMode === 'duration' && Number(draft.dateStrategy.durationDays || 0) >= 1) {
    secondaryText = `从实际开始日算，共持续 ${Number(draft.dateStrategy.durationDays)} 天`;
  }

  return {
    primaryText,
    secondaryText
  };
}

function checkRepeatDateConflict(input = {}, repeatType) {
  const normalizedInput = repeatType
    ? {
        ...input,
        repeatType,
        repeat: {
          ...(input.repeat || {}),
          type: repeatType
        }
      }
    : input;
  const draft = taskFormCore.normalizeTaskFormDraft(normalizedInput, {
    scene: normalizedInput.scene || 'task',
    today: normalizedInput.startDate
  });

  if (!draft.startDate || !draft.repeatType || draft.repeatType === 'none' || draft.repeatType === 'daily' || draft.repeatType === 'weekly') {
    return {
      hasConflict: false,
      previewText: '',
      primaryText: '',
      secondaryText: '',
      conflictType: ''
    };
  }

  const startDate = new Date(String(draft.startDate).replace(/-/g, '/'));
  if (Number.isNaN(startDate.getTime())) {
    return {
      hasConflict: false,
      previewText: '',
      primaryText: '',
      secondaryText: '',
      conflictType: ''
    };
  }

  const dayOfWeek = startDate.getDay();
  const resultTexts = buildRepeatResultTexts(draft, draft.repeatType);

  if (draft.repeatType === 'workdays' && (dayOfWeek === 0 || dayOfWeek === 6)) {
    return {
      hasConflict: true,
      previewText: `${resultTexts.primaryText}${resultTexts.secondaryText ? ` ${resultTexts.secondaryText}` : ''}`,
      primaryText: resultTexts.primaryText,
      secondaryText: resultTexts.secondaryText,
      conflictType: 'workdays_conflict'
    };
  }

  if (draft.repeatType === 'weekends' && dayOfWeek !== 0 && dayOfWeek !== 6) {
    return {
      hasConflict: true,
      previewText: `${resultTexts.primaryText}${resultTexts.secondaryText ? ` ${resultTexts.secondaryText}` : ''}`,
      primaryText: resultTexts.primaryText,
      secondaryText: resultTexts.secondaryText,
      conflictType: 'weekends_conflict'
    };
  }

  if (draft.repeatType === 'custom') {
    if (draft.repeatDays.length === 0) {
      return {
        hasConflict: true,
        previewText: resultTexts.primaryText,
        primaryText: resultTexts.primaryText,
        secondaryText: '',
        conflictType: 'custom_days_missing'
      };
    }

    if (!draft.repeatDays.includes(dayOfWeek)) {
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

function buildRepeatPreviewText(input = {}, repeatType) {
  const conflict = checkRepeatDateConflict(input, repeatType);
  if (conflict.hasConflict) {
    return conflict.previewText;
  }

  const resultTexts = buildRepeatResultTexts(input, repeatType);
  return `${resultTexts.primaryText}${resultTexts.secondaryText ? ` ${resultTexts.secondaryText}` : ''}`;
}

function buildTaskFormDisplayState(input = {}, options = {}) {
  const draft = taskFormCore.normalizeTaskFormDraft(input, {
    scene: input.scene || 'task',
    today: input.startDate
  });
  const repeatDisabled = options.ignoreRepeatOptionDisabled === true
    ? false
    : isRepeatOptionDisabled(draft);
  const repeatConflict = checkRepeatDateConflict(draft, draft.repeatType);
  const repeatResultTexts = buildRepeatResultTexts(draft, draft.repeatType);
  const repeatText = buildRepeatText(draft, { isRepeatOptionDisabled: repeatDisabled });
  const reminderText = buildReminderText({
    enabled: draft.reminderEnabled,
    time: draft.reminderTime
  });
  const pointsExpiryText = buildPointsExpiryText(draft.pointsExpiry);

  return {
    repeatText,
    reminderText,
    pointsExpiryText,
    repeatPreviewText: buildRepeatPreviewText(draft, draft.repeatType),
    repeatTypeWarning: repeatConflict.hasConflict,
    resultPrimaryText: repeatConflict.primaryText || repeatResultTexts.primaryText,
    resultSecondaryText: repeatConflict.secondaryText || repeatResultTexts.secondaryText,
    previewChips: [
      { key: 'repeat', label: PREVIEW_CHIP_LABELS.repeat, value: repeatText },
      { key: 'reminder', label: PREVIEW_CHIP_LABELS.reminder, value: reminderText },
      { key: 'pointsExpiry', label: PREVIEW_CHIP_LABELS.pointsExpiry, value: pointsExpiryText }
    ],
    weekdaySelection: buildWeekdaySelection(draft),
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
  resolveRepeatMatch: taskFormCore.resolveRepeatMatch
};
