const taskFormCore = require('./task-form-core');

function adaptTaskEditStateToDraft(newTask = {}, options = {}) {
  return taskFormCore.normalizeTaskFormDraft(newTask, {
    scene: 'task',
    today: options.today || newTask.startDate,
    now: options.now
  });
}

function adaptTemplateEditFormToDraft(form = {}, options = {}) {
  return taskFormCore.normalizeTaskFormDraft(form, {
    scene: 'template',
    today: options.today,
    now: options.now
  });
}

function adaptTemplateEntityToDraft(template = {}, options = {}) {
  const payload = template.taskPayload || {};
  return taskFormCore.normalizeTaskFormDraft({
    ...payload,
    dateStrategy: template.dateStrategy || {},
    endMode: template.dateStrategy?.endMode,
    durationDays: template.dateStrategy?.durationDays
  }, {
    scene: 'template',
    today: options.today || payload.startDate
  });
}

function buildTaskEditPatchFromDraft(draftInput = {}) {
  const draft = taskFormCore.normalizeTaskFormDraft(draftInput, {
    scene: 'task',
    today: draftInput.startDate
  });
  const endDate = draft.hasNoEndDate ? '' : (draft.endDate || draft.startDate);

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
    endDate,
    endTime: draft.isAllDay ? '' : draft.endTime,
    hasNoEndDate: draft.hasNoEndDate,
    repeat: {
      type: draft.repeatType,
      days: draft.repeatType === 'custom' ? draft.repeatDays : [],
      startDate: draft.startDate,
      endDate
    },
    reminder: {
      enabled: draft.reminderEnabled,
      time: draft.reminderTime
    }
  };
}

function buildTemplateEditPatchFromDraft(draftInput = {}, meta = {}) {
  const draft = taskFormCore.normalizeTaskFormDraft(draftInput, {
    scene: 'template',
    today: meta.today || draftInput.startDate
  });
  const taskTitle = String(meta.taskTitle !== undefined ? meta.taskTitle : draft.title).trim();
  const alias = String(meta.name || '').trim();
  const resolvedName = alias && alias !== taskTitle ? alias : '';

  return {
    name: resolvedName,
    description: String(meta.description || '').trim(),
    enabled: meta.enabled !== false,
    taskTitle,
    taskDescription: draft.description,
    type: draft.type,
    points: draft.points,
    pointsExpiry: draft.pointsExpiry,
    isRequired: draft.isRequired,
    isAllDay: draft.isAllDay,
    startTime: draft.isAllDay ? '' : draft.startTime,
    endTime: draft.isAllDay ? '' : draft.endTime,
    repeatType: draft.repeatType,
    repeatDays: draft.repeatType === 'custom' ? draft.repeatDays : [],
    endMode: draft.dateStrategy.endMode,
    durationDays: draft.dateStrategy.endMode === 'duration'
      ? Number(draft.dateStrategy.durationDays || 1)
      : 1,
    reminderEnabled: draft.reminderEnabled,
    reminderTime: draft.reminderTime
  };
}

module.exports = {
  adaptTaskEditStateToDraft,
  adaptTemplateEditFormToDraft,
  adaptTemplateEntityToDraft,
  buildTaskEditPatchFromDraft,
  buildTemplateEditPatchFromDraft
};
