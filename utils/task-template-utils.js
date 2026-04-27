const taskFormCore = require('./task-form-core');

const TASK_TEMPLATE_TYPES = taskFormCore.TASK_TYPES;
const TASK_TEMPLATE_REPEAT_TYPES = taskFormCore.REPEAT_TYPES;
const TASK_TEMPLATE_POINTS_EXPIRY = taskFormCore.POINTS_EXPIRY_TYPES;

function normalizeTaskPayload(payload = {}, options = {}) {
  return taskFormCore.buildTaskPayloadFromDraft(
    taskFormCore.normalizeTaskFormDraft(payload, {
      scene: options.scene || 'template',
      today: options.defaultDate || payload.startDate
    })
  );
}

function normalizeDateStrategy(dateStrategy = {}, taskPayload = {}) {
  return taskFormCore.normalizeTaskFormDraft({
    ...taskPayload,
    dateStrategy
  }, {
    scene: 'template',
    today: taskPayload.startDate
  }).dateStrategy;
}

function createEmptyTaskPayload(options = {}) {
  const draft = taskFormCore.createTaskFormDraft('template', {
    today: options.today
  });
  return taskFormCore.buildTaskPayloadFromDraft({
    ...draft,
    repeatType: 'none'
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
  deepClone: taskFormCore.deepClone,
  normalizeTaskType: taskFormCore.normalizeTaskType,
  normalizePoints: taskFormCore.normalizePoints,
  normalizePointsExpiry: taskFormCore.normalizePointsExpiry,
  normalizeRepeatType: taskFormCore.normalizeRepeatType,
  normalizeRepeatDays: taskFormCore.normalizeRepeatDays,
  normalizeReminder: taskFormCore.normalizeReminder,
  normalizeRepeat: function normalizeRepeat(repeat = {}, context = {}) {
    const draft = taskFormCore.normalizeTaskFormDraft({
      startDate: context.startDate,
      endDate: context.endDate,
      hasNoEndDate: context.hasNoEndDate,
      repeat
    }, {
      scene: 'template',
      today: context.startDate
    });

    return {
      type: draft.repeatType,
      days: draft.repeatType === 'custom' ? draft.repeatDays : [],
      startDate: draft.startDate,
      endDate: draft.hasNoEndDate ? '' : draft.endDate
    };
  },
  normalizeTaskPayload,
  normalizeDateStrategy,
  normalizeDateString: taskFormCore.normalizeDateString,
  normalizeTimeString: taskFormCore.normalizeTimeString,
  createEmptyTaskPayload,
  buildTemplateSearchText
};
