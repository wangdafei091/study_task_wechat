const dateUtils = require('./dateUtils');
const {
  normalizeDateStrategy,
  normalizeDateString,
  normalizePoints,
  normalizePointsExpiry,
  normalizeReminder,
  normalizeRepeatDays,
  normalizeTaskPayload,
  normalizeTaskType,
  normalizeTimeString
} = require('./task-template-utils');

const SUPPORTED_REPEAT_TYPES = new Set([
  'none',
  'daily',
  'weekly',
  'workdays',
  'weekends',
  'custom',
  'monthly'
]);

function normalizeSourceRepeatType(value) {
  const normalized = typeof value === 'string' ? value : 'none';
  return SUPPORTED_REPEAT_TYPES.has(normalized) ? normalized : 'none';
}

function isTemplateLike(taskLike = {}) {
  return taskLike && typeof taskLike === 'object' && taskLike.taskPayload;
}

function normalizeOccurrenceDate(taskLike = {}) {
  if (isTemplateLike(taskLike)) {
    return normalizeDateString(
      taskLike.taskPayload?.repeat?.startDate,
      normalizeDateString(taskLike.taskPayload?.startDate, '')
    );
  }

  return normalizeDateString(
    taskLike.date,
    normalizeDateString(taskLike.repeat?.startDate, normalizeDateString(taskLike.startDate, ''))
  );
}

function getRepeatType(taskLike = {}) {
  if (isTemplateLike(taskLike)) {
    return normalizeSourceRepeatType(taskLike.taskPayload?.repeat?.type);
  }

  return normalizeSourceRepeatType(taskLike.repeat?.type);
}

function getRepeatDays(taskLike = {}) {
  const rawDays = isTemplateLike(taskLike)
    ? taskLike.taskPayload?.repeat?.days
    : taskLike.repeat?.days;
  return normalizeRepeatDays(rawDays);
}

function getStartDate(taskLike = {}) {
  if (isTemplateLike(taskLike)) {
    return normalizeDateString(
      taskLike.taskPayload?.repeat?.startDate,
      normalizeDateString(taskLike.taskPayload?.startDate, '')
    );
  }

  return normalizeDateString(
    taskLike.repeat?.startDate,
    normalizeDateString(taskLike.startDate, normalizeDateString(taskLike.date, ''))
  );
}

function getEndDate(taskLike = {}) {
  const hasNoEndDate = isNoEndDateTask(taskLike);
  if (hasNoEndDate) {
    return '';
  }

  if (isTemplateLike(taskLike)) {
    return normalizeDateString(
      taskLike.taskPayload?.repeat?.endDate,
      normalizeDateString(taskLike.taskPayload?.endDate, getStartDate(taskLike))
    );
  }

  return normalizeDateString(
    taskLike.repeat?.endDate,
    normalizeDateString(taskLike.endDate, getStartDate(taskLike))
  );
}

function isNoEndDateTask(taskLike = {}) {
  return isTemplateLike(taskLike)
    ? taskLike.taskPayload?.hasNoEndDate === true
    : taskLike.hasNoEndDate === true;
}

function getReminder(taskLike = {}) {
  return isTemplateLike(taskLike)
    ? normalizeReminder(taskLike.taskPayload?.reminder)
    : normalizeReminder(taskLike.reminder);
}

function getCoreTaskPayload(taskLike = {}) {
  if (isTemplateLike(taskLike)) {
    return normalizeTaskPayload(taskLike.taskPayload || {}, {
      defaultDate: getStartDate(taskLike) || dateUtils.getTodayString()
    });
  }

  const startDate = getStartDate(taskLike) || dateUtils.getTodayString();
  const endDate = getEndDate(taskLike) || startDate;
  const repeatType = getRepeatType(taskLike);
  const reminder = getReminder(taskLike);

  return normalizeTaskPayload({
    title: String(taskLike.title || '').trim(),
    type: normalizeTaskType(taskLike.type),
    points: normalizePoints(taskLike.points, 1),
    pointsExpiry: normalizePointsExpiry(taskLike.pointsExpiry),
    description: String(taskLike.description || '').trim(),
    isRequired: taskLike.isRequired === true,
    isAllDay: taskLike.isAllDay === true,
    startDate,
    startTime: normalizeTimeString(taskLike.startTime, '09:00'),
    endDate,
    endTime: normalizeTimeString(taskLike.endTime, '10:00'),
    hasNoEndDate: isNoEndDateTask(taskLike),
    repeat: {
      type: repeatType,
      days: getRepeatDays(taskLike),
      startDate,
      endDate: isNoEndDateTask(taskLike) ? '' : endDate
    },
    reminder
  }, {
    defaultDate: startDate
  });
}

function isOneOffTask(taskLike = {}) {
  return getRepeatType(taskLike) === 'none';
}

function isMultiDayOneOffTask(taskLike = {}) {
  if (!isOneOffTask(taskLike)) {
    return false;
  }

  if (isNoEndDateTask(taskLike)) {
    return true;
  }

  const startDate = getStartDate(taskLike);
  const endDate = getEndDate(taskLike);
  return Boolean(startDate && endDate && endDate > startDate);
}

function collectRepeatWeekKeys(taskLike = {}) {
  const repeatType = getRepeatType(taskLike);
  if (repeatType === 'none' || repeatType === 'monthly') {
    return [];
  }

  const startDate = getStartDate(taskLike);
  if (!startDate) {
    return [];
  }

  if (isNoEndDateTask(taskLike)) {
    const weekKey = dateUtils.formatDate(dateUtils.getFirstDayOfWeek(startDate, 1));
    return weekKey ? [weekKey] : [];
  }

  const endDate = getEndDate(taskLike);
  if (!endDate || endDate < startDate) {
    return [];
  }

  if (repeatType === 'daily') {
    const durationDays = Math.max(1, dateUtils.getDaysBetween(startDate, endDate) + 1);
    const cycleCount = Math.floor(durationDays / 7);
    const cycleKeys = [];

    for (let index = 0; index < cycleCount; index += 1) {
      cycleKeys.push(dateUtils.formatDate(dateUtils.addDays(startDate, index * 7)));
    }

    return cycleKeys.filter(Boolean);
  }

  const weekKeys = [];
  let cursor = dateUtils.getFirstDayOfWeek(startDate, 1);
  const lastWeek = dateUtils.getFirstDayOfWeek(endDate, 1);

  while (cursor && lastWeek && cursor.getTime() <= lastWeek.getTime()) {
    weekKeys.push(dateUtils.formatDate(cursor));
    cursor = dateUtils.addDays(cursor, 7);
  }

  return weekKeys.filter(Boolean);
}

function resolveStableRepeatWeeks(taskLike = {}, options = {}) {
  const repeatType = getRepeatType(taskLike);
  if (repeatType === 'none' || repeatType === 'monthly') {
    return 0;
  }

  if (isNoEndDateTask(taskLike)) {
    return Number.MAX_SAFE_INTEGER;
  }

  const rawWeekKeys = Array.isArray(options.weekKeys)
    ? options.weekKeys
    : collectRepeatWeekKeys(taskLike);
  const orderedWeekKeys = Array.from(new Set(rawWeekKeys.filter(Boolean))).sort();

  if (orderedWeekKeys.length === 0) {
    return 0;
  }

  let stableWeeks = 1;
  let cursor = orderedWeekKeys[orderedWeekKeys.length - 1];

  for (let index = orderedWeekKeys.length - 2; index >= 0; index -= 1) {
    const previousWeek = orderedWeekKeys[index];
    const expectedPreviousWeek = dateUtils.formatDate(dateUtils.addDays(cursor, -7));
    if (previousWeek !== expectedPreviousWeek) {
      break;
    }
    stableWeeks += 1;
    cursor = previousWeek;
  }

  return stableWeeks;
}

function hasStableRepeatCycles(taskLike = {}, options = {}) {
  return resolveStableRepeatWeeks(taskLike, options) >= 2;
}

function deriveRepeatSpanKey(taskLike = {}) {
  const repeatType = getRepeatType(taskLike);
  if (repeatType === 'none' || repeatType === 'monthly') {
    return null;
  }

  if (isNoEndDateTask(taskLike)) {
    return 'no-end';
  }

  const startDate = getStartDate(taskLike);
  const endDate = getEndDate(taskLike);
  if (!startDate || !endDate) {
    return null;
  }

  const endOfWeek = dateUtils.formatDate(dateUtils.addDays(dateUtils.getFirstDayOfWeek(startDate, 1), 6));
  if (endOfWeek && endDate === endOfWeek) {
    return 'week-window';
  }

  const endOfMonth = dateUtils.formatDate(dateUtils.getLastDayOfMonth(startDate));
  if (endOfMonth && endDate === endOfMonth) {
    return 'month-window';
  }

  return `duration:${Math.max(1, dateUtils.getDaysBetween(startDate, endDate) + 1)}`;
}

function deriveTemplateCoverageKey(templateLike = {}) {
  const payload = getCoreTaskPayload(templateLike);
  const repeatType = normalizeSourceRepeatType(payload.repeat?.type);
  if (repeatType === 'none') {
    return null;
  }

  const strategy = normalizeDateStrategy(templateLike.dateStrategy || {}, payload);
  if (strategy.endMode === 'no-end') {
    return 'no-end';
  }
  if (strategy.endMode === 'week-end') {
    return 'week-window';
  }
  if (strategy.endMode === 'month-end') {
    return 'month-window';
  }
  if (strategy.endMode === 'duration') {
    const durationDays = Number.isInteger(Number(strategy.durationDays))
      ? Math.max(1, Number(strategy.durationDays))
      : 1;
    return `duration:${durationDays}`;
  }

  return null;
}

function normalizeTemplateSourceSignature(taskLike = {}, options = {}) {
  const payload = getCoreTaskPayload(taskLike);
  const repeatType = normalizeSourceRepeatType(payload.repeat?.type);
  const repeatSpanKey = options.repeatSpanKey !== undefined
    ? options.repeatSpanKey
    : deriveRepeatSpanKey(taskLike);

  const signature = {
    title: String(payload.title || '').trim().toLowerCase().replace(/\s+/g, ' '),
    type: payload.type || 'habit',
    isRequired: payload.isRequired === true,
    points: Number(payload.points || 1),
    pointsExpiry: payload.pointsExpiry || 'permanent',
    isAllDay: payload.isAllDay === true,
    startTime: payload.isAllDay ? '' : normalizeTimeString(payload.startTime, '09:00'),
    endTime: payload.isAllDay ? '' : normalizeTimeString(payload.endTime, '10:00'),
    repeatType,
    repeatDays: repeatType === 'custom' ? normalizeRepeatDays(payload.repeat?.days) : [],
    reminderEnabled: payload.reminder?.enabled === true,
    reminderTime: Number(payload.reminder?.time || 0),
    repeatSpanKey: repeatType === 'none' ? null : (repeatSpanKey || null)
  };

  return JSON.stringify(signature);
}

function normalizeTemplateSourceCoverageSignature(taskLike = {}, options = {}) {
  const payload = getCoreTaskPayload(taskLike);
  const repeatType = normalizeSourceRepeatType(payload.repeat?.type);
  const repeatSpanKey = options.repeatSpanKey !== undefined
    ? options.repeatSpanKey
    : deriveRepeatSpanKey(taskLike);

  const signature = {
    title: String(payload.title || '').trim().toLowerCase().replace(/\s+/g, ' '),
    type: payload.type || 'habit',
    isAllDay: payload.isAllDay === true,
    startTime: payload.isAllDay ? '' : normalizeTimeString(payload.startTime, '09:00'),
    endTime: payload.isAllDay ? '' : normalizeTimeString(payload.endTime, '10:00'),
    repeatType,
    repeatDays: repeatType === 'custom' ? normalizeRepeatDays(payload.repeat?.days) : [],
    repeatSpanKey: repeatType === 'none' ? null : (repeatSpanKey || null)
  };

  return JSON.stringify(signature);
}

function buildRepeatDateStrategy(payload, sourceTask = {}) {
  const repeatType = normalizeSourceRepeatType(payload.repeat?.type);
  if (repeatType === 'none') {
    return normalizeDateStrategy({
      mode: 'today',
      autoShiftExpiredEndDate: true,
      endMode: 'same-day',
      durationDays: 1
    }, payload);
  }

  if (repeatType === 'monthly') {
    throw new Error('monthly-repeat-not-supported');
  }

  if (sourceTask.hasNoEndDate === true || payload.hasNoEndDate === true) {
    return normalizeDateStrategy({
      mode: 'inherit-repeat-rule',
      autoShiftExpiredEndDate: true,
      endMode: 'no-end',
      durationDays: null
    }, payload);
  }

  const startDate = getStartDate(sourceTask);
  const endDate = getEndDate(sourceTask);
  const endOfWeek = startDate
    ? dateUtils.formatDate(dateUtils.addDays(dateUtils.getFirstDayOfWeek(startDate, 1), 6))
    : '';
  const endOfMonth = startDate
    ? dateUtils.formatDate(dateUtils.getLastDayOfMonth(startDate))
    : '';

  if (startDate && endDate && endDate === endOfWeek) {
    return normalizeDateStrategy({
      mode: 'inherit-repeat-rule',
      autoShiftExpiredEndDate: true,
      endMode: 'week-end',
      durationDays: null
    }, payload);
  }

  if (startDate && endDate && endDate === endOfMonth) {
    return normalizeDateStrategy({
      mode: 'inherit-repeat-rule',
      autoShiftExpiredEndDate: true,
      endMode: 'month-end',
      durationDays: null
    }, payload);
  }

  const durationDays = startDate && endDate
    ? Math.max(1, dateUtils.getDaysBetween(startDate, endDate) + 1)
    : 1;

  return normalizeDateStrategy({
    mode: 'inherit-repeat-rule',
    autoShiftExpiredEndDate: true,
    endMode: 'duration',
    durationDays
  }, payload);
}

function buildTemplateDraftFromTask(taskLike, options = {}) {
  if (!taskLike) {
    throw new Error('task-required');
  }

  if (getRepeatType(taskLike) === 'monthly') {
    throw new Error('monthly-repeat-not-supported');
  }

  if (isMultiDayOneOffTask(taskLike)) {
    throw new Error('multi-day-one-off-not-supported');
  }

  const payload = getCoreTaskPayload(taskLike);
  const dateStrategy = buildRepeatDateStrategy(payload, taskLike);
  const signature = normalizeTemplateSourceSignature(taskLike);

  return {
    signature,
    repeatSpanKey: deriveRepeatSpanKey(taskLike),
    draftInput: {
      name: String(payload.title || '').trim(),
      description: '',
      taskPayload: payload,
      dateStrategy,
      enabled: true
    },
    sourceMeta: {
      sourceType: options.sourceType || 'task-edit-recommendation',
      sourceTaskId: taskLike.id || null,
      sourceTitle: String(payload.title || '').trim()
    }
  };
}

function buildTemplateDraftFromCandidate(candidate, options = {}) {
  if (!candidate || !candidate.taskPayload) {
    throw new Error('candidate-required');
  }

  const payload = getCoreTaskPayload({ taskPayload: candidate.taskPayload });
  const dateStrategy = normalizeDateStrategy(candidate.dateStrategy || {}, payload);

  return {
    signature: candidate.signature || normalizeTemplateSourceSignature({
      taskPayload: payload,
      dateStrategy
    }, {
      repeatSpanKey: candidate.repeatSpanKey || deriveTemplateCoverageKey({
        taskPayload: payload,
        dateStrategy
      })
    }),
    repeatSpanKey: candidate.repeatSpanKey || deriveTemplateCoverageKey({
      taskPayload: payload,
      dateStrategy
    }),
    draftInput: {
      name: String(candidate.displayName || payload.title || '').trim(),
      description: '',
      taskPayload: payload,
      dateStrategy,
      enabled: true
    },
    sourceMeta: {
      sourceType: options.sourceType || 'template-manage-candidate',
      sourceTaskId: candidate.sourceTaskId || null,
      candidateKey: candidate.candidateKey || null,
      sourceTitle: String(candidate.displayName || payload.title || '').trim()
    }
  };
}

function isCandidateCoveredByTemplate(candidate, templates = []) {
  if (!candidate || !Array.isArray(templates)) {
    return false;
  }

  const candidateCoverageSignature = candidate.coverageSignature || normalizeTemplateSourceCoverageSignature({
    taskPayload: candidate.taskPayload || {},
    dateStrategy: candidate.dateStrategy || {}
  }, {
    repeatSpanKey: candidate.repeatSpanKey
  });

  return templates.some((template) => {
    if (!template || !template.taskPayload) {
      return false;
    }

    const signature = normalizeTemplateSourceSignature({
      taskPayload: template.taskPayload,
      dateStrategy: template.dateStrategy
    }, {
      repeatSpanKey: deriveTemplateCoverageKey(template)
    });
    if (candidate.signature && signature === candidate.signature) {
      return true;
    }

    const coverageSignature = normalizeTemplateSourceCoverageSignature({
      taskPayload: template.taskPayload,
      dateStrategy: template.dateStrategy
    }, {
      repeatSpanKey: deriveTemplateCoverageKey(template)
    });

    return Boolean(candidateCoverageSignature && coverageSignature === candidateCoverageSignature);
  });
}

function isTaskWithinLookback(taskLike, lookbackStartDate) {
  if (!lookbackStartDate) {
    return true;
  }
  const occurrenceDate = normalizeOccurrenceDate(taskLike);
  return Boolean(occurrenceDate && occurrenceDate >= lookbackStartDate);
}

function normalizeLastSeenAt(taskLike = {}) {
  const occurrenceDate = normalizeOccurrenceDate(taskLike);
  const timestamp = Date.parse(occurrenceDate);
  if (Number.isFinite(timestamp)) {
    return timestamp;
  }
  return Number(taskLike.modifyTime || taskLike.updatedAt || taskLike.createTime || taskLike.createdAt || 0) || 0;
}

function buildCandidateReason(latestTask, occurrences, lookbackDays, stableWeeks) {
  const repeatType = getRepeatType(latestTask);
  if (repeatType === 'none') {
    return {
      reasonCode: 'high-frequency',
      reasonText: `近${lookbackDays}天出现了 ${occurrences} 次`
    };
  }

  if (isNoEndDateTask(latestTask)) {
    return {
      reasonCode: 'stable-repeat',
      reasonText: '这是一个长期重复任务'
    };
  }

  return {
    reasonCode: 'stable-repeat',
    reasonText: `近${stableWeeks}周都出现了相同的重复安排`
  };
}

function groupTasksToTemplateCandidates(tasks = [], templates = [], options = {}) {
  const today = normalizeDateString(options.today, dateUtils.getTodayString());
  const lookbackDays = Number.isInteger(Number(options.lookbackDays))
    ? Math.max(1, Number(options.lookbackDays))
    : 60;
  const lookbackStartDate = normalizeDateString(
    dateUtils.formatDate(dateUtils.addDays(today, -(lookbackDays - 1))),
    today
  );
  const grouped = new Map();

  tasks
    .filter((task) => task && isTaskWithinLookback(task, lookbackStartDate))
    .forEach((task) => {
      const repeatType = getRepeatType(task);
      if (repeatType === 'monthly' || isMultiDayOneOffTask(task)) {
        return;
      }

      const signature = normalizeTemplateSourceSignature(task);
      const entry = grouped.get(signature) || {
        signature,
        occurrences: 0,
        latestTask: task,
        lastSeenAt: 0,
        weekKeys: new Set()
      };

      entry.occurrences += 1;
      const seenAt = normalizeLastSeenAt(task);
      if (seenAt >= entry.lastSeenAt) {
        entry.lastSeenAt = seenAt;
        entry.latestTask = task;
      }

      if (repeatType !== 'none' && repeatType !== 'monthly' && isNoEndDateTask(task) !== true) {
        collectRepeatWeekKeys(task).forEach((weekKey) => entry.weekKeys.add(weekKey));
      }

      grouped.set(signature, entry);
    });

  const candidates = [];

  grouped.forEach((entry) => {
    const repeatType = getRepeatType(entry.latestTask);
    const isRepeating = repeatType !== 'none';
    const stableWeeks = isRepeating
      ? resolveStableRepeatWeeks(entry.latestTask, {
          today,
          weekKeys: Array.from(entry.weekKeys)
        })
      : 0;

    if (isRepeating && !hasStableRepeatCycles(entry.latestTask, {
      today,
      weekKeys: Array.from(entry.weekKeys)
    })) {
      return;
    }
    if (!isRepeating && entry.occurrences < 2) {
      return;
    }

    const draft = buildTemplateDraftFromTask(entry.latestTask, {
      sourceType: 'template-manage-candidate'
    });
    const reason = buildCandidateReason(entry.latestTask, entry.occurrences, lookbackDays, stableWeeks);
    const candidate = {
      candidateKey: entry.signature,
      displayName: draft.draftInput.name || draft.draftInput.taskPayload.title || '',
      sourceTaskId: entry.latestTask.id || null,
      taskPayload: draft.draftInput.taskPayload,
      dateStrategy: draft.draftInput.dateStrategy,
      occurrences: entry.occurrences,
      lastSeenAt: entry.lastSeenAt,
      stableWeeks,
      reasonCode: reason.reasonCode,
      reasonText: reason.reasonText,
      signature: entry.signature,
      coverageSignature: normalizeTemplateSourceCoverageSignature(entry.latestTask, {
        repeatSpanKey: draft.repeatSpanKey
      }),
      repeatSpanKey: draft.repeatSpanKey
    };

    if (!isCandidateCoveredByTemplate(candidate, templates)) {
      candidates.push(candidate);
    }
  });

  return candidates.sort((left, right) => {
    const leftRepeat = left.reasonCode === 'stable-repeat' ? 1 : 0;
    const rightRepeat = right.reasonCode === 'stable-repeat' ? 1 : 0;
    if (rightRepeat !== leftRepeat) {
      return rightRepeat - leftRepeat;
    }
    if (right.stableWeeks !== left.stableWeeks) {
      return Number(right.stableWeeks || 0) - Number(left.stableWeeks || 0);
    }
    if (right.occurrences !== left.occurrences) {
      return right.occurrences - left.occurrences;
    }
    return Number(right.lastSeenAt || 0) - Number(left.lastSeenAt || 0);
  });
}

module.exports = {
  normalizeTemplateSourceSignature,
  normalizeTemplateSourceCoverageSignature,
  deriveRepeatSpanKey,
  deriveTemplateCoverageKey,
  hasStableRepeatCycles,
  buildTemplateDraftFromTask,
  buildTemplateDraftFromCandidate,
  groupTasksToTemplateCandidates,
  isCandidateCoveredByTemplate,
  isMultiDayOneOffTask
};
