const serviceManager = require('../../../services/service-manager');
const logger = require('../../../utils/logger');
const Constants = require('../../../utils/constants');
const dateUtils = require('../../../utils/dateUtils');
const taskFormDisplay = require('../../../utils/task-form-display');
const { normalizeDateStrategy } = require('../../../utils/task-template-utils');
const viewScope = require('../../../utils/view-scope');
const { WEEKDAY_NAMES } = require('../../../utils/task-form-display');

const END_MODE_OPTIONS = [
  { value: 'week-end', label: '本周结束' },
  { value: 'month-end', label: '本月结束' },
  { value: 'duration', label: '持续天数' },
  { value: 'no-end', label: '长期有效' }
];
const DEFAULT_REPEAT_END_MODE = 'week-end';

function buildReminderOptions(form = {}) {
  if (form.isAllDay === true) {
    return [
      { label: '无', enabled: false, time: 0 },
      { label: '提前1天(晚上8点)', enabled: true, time: -1 }
    ];
  }

  const hasStartTime = typeof form.startTime === 'string' && form.startTime.trim() !== '';
  if (hasStartTime) {
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

function findPointsExpiryIndex(options = [], pointsExpiry) {
  const index = options.findIndex((option) => option.value === pointsExpiry);
  return index >= 0 ? index : 0;
}

function resolveReminderSelection(options = [], reminderEnabled, reminderTime) {
  const targetEnabled = reminderEnabled === true;
  const targetTime = Number(reminderTime || 0);
  const index = options.findIndex((option) => (
    option.enabled === targetEnabled &&
    Number(option.time || 0) === targetTime
  ));

  if (index >= 0) {
    return {
      reminderEnabled: targetEnabled,
      reminderTime: targetTime,
      reminderIndex: index
    };
  }

  const fallback = options[0] || { enabled: false, time: 0 };
  return {
    reminderEnabled: fallback.enabled === true,
    reminderTime: Number(fallback.time || 0),
    reminderIndex: 0
  };
}

function inferDateStrategyMode(repeatType) {
  return repeatType === 'none' ? 'today' : 'inherit-repeat-rule';
}

function normalizeDurationDays(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.floor(parsed));
}

function resolveTemplateDateStrategy(template = {}) {
  return normalizeDateStrategy(template.dateStrategy || {}, template.taskPayload || {});
}

function resolveTemplateDurationDays(template = {}) {
  const payload = template.taskPayload || {};
  const strategy = resolveTemplateDateStrategy(template);
  const repeatType = payload.repeat?.type || 'none';

  if (repeatType === 'none') {
    return 1;
  }

  if (strategy.endMode !== 'duration') {
    return 1;
  }

  if (Number.isInteger(Number(strategy.durationDays)) && Number(strategy.durationDays) >= 1) {
    return Number(strategy.durationDays);
  }

  if (payload.startDate && payload.endDate) {
    return Math.max(1, dateUtils.getDaysBetween(payload.startDate, payload.endDate) + 1);
  }

  return 1;
}

function createDefaultForm() {
  return {
    name: '',
    description: '',
    enabled: true,
    taskTitle: '',
    taskDescription: '',
    type: 'habit',
    points: 1,
    pointsExpiry: 'permanent',
    isRequired: false,
    isAllDay: false,
    startTime: '09:00',
    endTime: '10:00',
    repeatType: 'none',
    repeatDays: [],
    endMode: 'same-day',
    durationDays: 1,
    reminderEnabled: false,
    reminderTime: 0
  };
}

function resolvePlaceholderEndDate(todayPlaceholder, endMode, durationDays) {
  if (endMode === 'no-end') {
    return '';
  }

  if (endMode === 'month-end') {
    return dateUtils.formatDate(dateUtils.getLastDayOfMonth(todayPlaceholder));
  }

  if (endMode === 'week-end') {
    return dateUtils.formatDate(dateUtils.addDays(dateUtils.getFirstDayOfWeek(todayPlaceholder, 1), 6));
  }

  return dateUtils.formatDate(dateUtils.addDays(todayPlaceholder, durationDays - 1));
}

function buildFormPayload(form) {
  const todayPlaceholder = dateUtils.getTodayString();
  const isRepeatTemplate = form.repeatType !== 'none';
  const rawEndMode = isRepeatTemplate ? (form.endMode || DEFAULT_REPEAT_END_MODE) : 'same-day';
  const endMode = isRepeatTemplate && rawEndMode === 'same-day'
    ? DEFAULT_REPEAT_END_MODE
    : rawEndMode;
  const durationDays = isRepeatTemplate && endMode === 'duration'
    ? normalizeDurationDays(form.durationDays, 1)
    : 1;
  const hasNoEndDate = isRepeatTemplate && endMode === 'no-end';
  const endDate = resolvePlaceholderEndDate(todayPlaceholder, endMode, durationDays);

  return {
    title: form.taskTitle,
    type: form.type,
    points: Number(form.points || 1),
    pointsExpiry: form.pointsExpiry,
    description: form.taskDescription,
    isRequired: form.isRequired,
    isAllDay: form.isAllDay,
    startDate: todayPlaceholder,
    startTime: form.startTime,
    endDate,
    endTime: form.endTime,
    hasNoEndDate,
    repeat: {
      type: form.repeatType,
      days: form.repeatType === 'custom' ? form.repeatDays : [],
      startDate: todayPlaceholder,
      endDate
    },
    reminder: {
      enabled: form.reminderEnabled,
      time: Number(form.reminderTime || 0)
    }
  };
}

function buildDateStrategyFromForm(form) {
  const repeatType = form.repeatType || 'none';
  const isRepeatTemplate = repeatType !== 'none';
  const rawEndMode = isRepeatTemplate ? (form.endMode || DEFAULT_REPEAT_END_MODE) : 'same-day';
  const endMode = isRepeatTemplate && rawEndMode === 'same-day'
    ? DEFAULT_REPEAT_END_MODE
    : rawEndMode;

  return {
    mode: inferDateStrategyMode(repeatType),
    autoShiftExpiredEndDate: true,
    endMode,
    durationDays: !isRepeatTemplate
      ? 1
      : (endMode === 'duration' ? normalizeDurationDays(form.durationDays, 1) : null)
  };
}

function buildFormFromTemplate(template) {
  const payload = template.taskPayload || {};
  const repeat = payload.repeat || {};
  const reminder = payload.reminder || {};
  const repeatType = repeat.type || 'none';
  const isRepeatTemplate = repeatType !== 'none';
  const dateStrategy = resolveTemplateDateStrategy(template);

  return {
    name: template.name && template.name !== payload.title ? template.name : '',
    description: template.description || '',
    enabled: template.enabled !== false,
    taskTitle: payload.title || '',
    taskDescription: payload.description || '',
    type: payload.type || 'habit',
    points: Number(payload.points || 1),
    pointsExpiry: payload.pointsExpiry || 'permanent',
    isRequired: payload.isRequired === true,
    isAllDay: payload.isAllDay === true,
    startTime: payload.startTime || '09:00',
    endTime: payload.endTime || '10:00',
    repeatType,
    repeatDays: Array.isArray(repeat.days) ? repeat.days : [],
    endMode: isRepeatTemplate ? dateStrategy.endMode : 'same-day',
    durationDays: resolveTemplateDurationDays(template),
    reminderEnabled: reminder.enabled === true,
    reminderTime: Number(reminder.time || 0)
  };
}

function buildDraftSourceHint(sourceMeta = {}) {
  const sourceTitle = String(sourceMeta.sourceTitle || '').trim();
  const fallbackTitle = sourceTitle ? `“${sourceTitle}”` : '最近任务';

  if (sourceMeta.sourceType === 'task-edit-recommendation') {
    return `系统推荐：已根据${fallbackTitle}预填模板草稿，可调整后保存。`;
  }

  if (sourceMeta.sourceType === 'template-manage-candidate') {
    return `系统推荐：已根据${fallbackTitle}整理成模板草稿，可调整后保存。`;
  }

  return sourceTitle
    ? `已根据“${sourceTitle}”预填模板草稿，可调整后保存。`
    : '';
}

Page({
  data: {
    mode: 'create',
    templateId: null,
    loading: false,
    saving: false,
    form: createDefaultForm(),
    pointsExpiryOptions: Object.keys(Constants.POINTS_EXPIRY.TEXT).map((value) => ({
      value,
      label: Constants.POINTS_EXPIRY.TEXT[value]
    })),
    endModeOptions: END_MODE_OPTIONS,
    reminderOptions: buildReminderOptions(createDefaultForm()),
    pointsExpiryIndex: 0,
    reminderIndex: 0,
    pointsExpiryPanel: false,
    endModePanel: false,
    repeatPanel: false,
    reminderPanel: false,
    repeatPanelMode: 'type',
    weekdaySelection: [false, false, false, false, false, false, false],
    draftSourceHint: '',
    preview: {
      repeatText: '不重复',
      reminderText: '无',
      pointsExpiryText: '永久',
      resultPrimaryText: '',
      resultSecondaryText: '',
      previewChips: [
        { key: 'repeat', label: '重复', value: '不重复' },
        { key: 'reminder', label: '提醒', value: '无' },
        { key: 'pointsExpiry', label: '星星有效期', value: '永久' }
      ]
    }
  },

  onLoad(options = {}) {
    this._draftSourceMeta = null;
    const userService = serviceManager.getUserService();
    const loginUser = userService?.getLoginUser?.();
    const currentUser = userService?.getCurrentUser?.();
    const isChildView = viewScope.isChildView(loginUser, currentUser);

    if (!loginUser || loginUser.role !== 'parent' || isChildView) {
      wx.showToast({
        title: '暂无操作权限',
        icon: 'none'
      });
      wx.navigateBack({
        delta: 1
      });
      return;
    }

    const mode = options.mode === 'edit' ? 'edit' : 'create';
    const templateId = options.templateId || null;

    this.setData({
      mode,
      templateId
    });

    if (typeof wx.setNavigationBarTitle === 'function') {
      wx.setNavigationBarTitle({
        title: mode === 'edit' ? '编辑任务模板' : '新建任务模板'
      });
    }

    if (mode === 'edit' && templateId) {
      this.loadTemplate(templateId);
      return;
    }

    this.bindTemplateDraftChannel();
    this.refreshPreview();
  },

  bindTemplateDraftChannel() {
    const eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (!eventChannel || typeof eventChannel.on !== 'function') {
      return;
    }

    eventChannel.on('templateDraftReady', (payload = {}) => {
      this.applyTemplateDraft(payload.draft || null);
    });
  },

  applyTemplateDraft(draft) {
    if (!draft || !draft.draftInput) {
      return;
    }

    this._draftSourceMeta = draft.sourceMeta || null;
    this.setData({
      form: buildFormFromTemplate({
        ...draft.draftInput,
        taskPayload: draft.draftInput.taskPayload || {},
        dateStrategy: draft.draftInput.dateStrategy || {}
      }),
      draftSourceHint: buildDraftSourceHint(draft.sourceMeta || {})
    });
    this.refreshPreview();
  },

  async loadTemplate(templateId) {
    const taskTemplateService = serviceManager.getService('taskTemplate');
    this.setData({ loading: true });
    this._draftSourceMeta = null;

    try {
      const template = await taskTemplateService.getTemplateById(templateId, { force: true });
      if (!template) {
        wx.showToast({
          title: '模板不存在',
          icon: 'none'
        });
        wx.navigateBack({
          delta: 1
        });
        return;
      }

      this.setData({
        form: buildFormFromTemplate(template),
        draftSourceHint: '',
        loading: false
      });
      this.refreshPreview();
    } catch (error) {
      logger.error('TaskTemplateEdit', '加载模板失败', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载模板失败',
        icon: 'none'
      });
    }
  },

  onTextInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`form.${field}`]: e.detail.value
    });
    this.refreshPreview();
  },

  onPointsInput(e) {
    this.setData({
      'form.points': Number(e.detail.value || 1)
    });
    this.refreshPreview();
  },

  changePoints(e) {
    const action = e.currentTarget.dataset.action;
    const currentPoints = Number(this.data.form.points || 1);
    const nextPoints = action === 'minus'
      ? Math.max(1, currentPoints - 1)
      : Math.min(50, currentPoints + 1);

    this.setData({
      'form.points': nextPoints
    });
    this.refreshPreview();
  },

  selectType(e) {
    this.setData({
      'form.type': e.currentTarget.dataset.type
    });
  },

  onSwitchChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`form.${field}`]: e.detail.value
    });
    this.refreshPreview();
  },

  onDurationDaysInput(e) {
    this.setData({
      'form.durationDays': e.detail.value
    });
    this.refreshPreview();
  },

  onTimeChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`form.${field}`]: e.detail.value
    });
    this.refreshPreview();
  },

  togglePanel(e) {
    const panelName = e.currentTarget.dataset.panel;
    if (!panelName) {
      return;
    }

    const update = {
      pointsExpiryPanel: false,
      endModePanel: false,
      repeatPanel: false,
      reminderPanel: false
    };
    update[panelName] = !this.data[panelName];

    if (panelName === 'repeatPanel' && update.repeatPanel) {
      update.repeatPanelMode = 'type';
    }

    this.setData(update);
  },

  selectRepeatType(e) {
    const repeatType = e.currentTarget.dataset.type;
    const update = {
      'form.repeatType': repeatType,
      repeatPanel: false,
      repeatPanelMode: 'type'
    };

    if (repeatType !== 'custom') {
      update['form.repeatDays'] = [];
    }

    if (repeatType === 'none') {
      update['form.endMode'] = 'same-day';
      update['form.durationDays'] = 1;
    } else if (!this.data.form.endMode || this.data.form.endMode === 'same-day') {
      update['form.endMode'] = DEFAULT_REPEAT_END_MODE;
    }

    this.setData(update);
    this.refreshPreview();
  },

  switchToWeekdaySelection() {
    const repeatDays = Array.isArray(this.data.form.repeatDays) ? this.data.form.repeatDays : [];
    let weekdaySelection = WEEKDAY_NAMES.map((_, index) => repeatDays.includes(index));

    if (!weekdaySelection.some(Boolean)) {
      const startDate = new Date(dateUtils.getTodayString().replace(/-/g, '/'));
      if (startDate && !Number.isNaN(startDate.getTime())) {
        weekdaySelection[startDate.getDay()] = true;
      }
    }

    this.setData({
      'form.repeatType': 'custom',
      'form.endMode': this.data.form.endMode && this.data.form.endMode !== 'same-day'
        ? this.data.form.endMode
        : DEFAULT_REPEAT_END_MODE,
      weekdaySelection,
      repeatPanelMode: 'weekday'
    });
    this._syncRepeatDaysFromWeekdaySelection(weekdaySelection);
  },

  backToRepeatTypePanel() {
    this.setData({
      repeatPanelMode: 'type'
    });
    this.refreshPreview();
  },

  toggleWeekdaySelection(e) {
    const day = Number(e.currentTarget.dataset.day);
    const weekdaySelection = [...this.data.weekdaySelection];
    weekdaySelection[day] = !weekdaySelection[day];

    this.setData({
      weekdaySelection
    });
    this._syncRepeatDaysFromWeekdaySelection(weekdaySelection);
  },

  _syncRepeatDaysFromWeekdaySelection(weekdaySelection) {
    const repeatDays = weekdaySelection
      .map((selected, index) => (selected ? index : null))
      .filter((day) => day !== null);

    this.setData({
      'form.repeatType': 'custom',
      'form.repeatDays': repeatDays
    });
    this.refreshPreview();
  },

  selectPointsExpiry(e) {
    const expiry = e.currentTarget.dataset.expiry;
    this.setData({
      'form.pointsExpiry': expiry,
      pointsExpiryPanel: false
    });
    this.refreshPreview();
  },

  selectEndMode(e) {
    const endMode = e.currentTarget.dataset.endMode;
    const update = {
      'form.endMode': endMode,
      endModePanel: false
    };

    if (endMode !== 'duration') {
      update['form.durationDays'] = 1;
    }

    this.setData(update);
    this.refreshPreview();
  },

  selectReminderType(e) {
    const enabled = e.currentTarget.dataset.enabled === 'true';
    const time = Number(e.currentTarget.dataset.time || 0);

    this.setData({
      'form.reminderEnabled': enabled,
      'form.reminderTime': time,
      reminderPanel: false
    });
    this.refreshPreview();
  },

  closeAllPanels() {
    this.setData({
      pointsExpiryPanel: false,
      endModePanel: false,
      repeatPanel: false,
      reminderPanel: false,
      repeatPanelMode: 'type'
    });
  },

  preventTouchMove() {
    return;
  },

  preventClose() {
    return;
  },

  refreshPreview() {
    const reminderOptions = buildReminderOptions(this.data.form);
    const reminderState = resolveReminderSelection(
      reminderOptions,
      this.data.form.reminderEnabled,
      this.data.form.reminderTime
    );
    const payload = buildFormPayload({
      ...this.data.form,
      reminderEnabled: reminderState.reminderEnabled,
      reminderTime: reminderState.reminderTime
    });
    const preview = taskFormDisplay.buildTaskFormDisplayState({
      ...payload,
      dateStrategy: buildDateStrategyFromForm(this.data.form)
    }, {
      ignoreRepeatOptionDisabled: true
    });
    const update = {
      preview,
      reminderOptions,
      pointsExpiryIndex: findPointsExpiryIndex(this.data.pointsExpiryOptions, this.data.form.pointsExpiry),
      reminderIndex: reminderState.reminderIndex,
      weekdaySelection: preview.weekdaySelection
    };

    if (this.data.form.reminderEnabled !== reminderState.reminderEnabled) {
      update['form.reminderEnabled'] = reminderState.reminderEnabled;
    }

    if (Number(this.data.form.reminderTime || 0) !== reminderState.reminderTime) {
      update['form.reminderTime'] = reminderState.reminderTime;
    }

    this.setData(update);
  },

  onCancel() {
    wx.navigateBack({
      delta: 1
    });
  },

  async onSave() {
    if (this.data.saving) {
      return;
    }

    const taskTemplateService = serviceManager.getService('taskTemplate');
    const validationError = this.validateForm();

    if (validationError) {
      wx.showToast({
        title: validationError,
        icon: 'none'
      });
      return;
    }

    const payload = buildFormPayload(this.data.form);
    const resolvedName = (this.data.form.name || '').trim() || (this.data.form.taskTitle || '').trim();
    const input = {
      name: resolvedName,
      description: (this.data.form.description || '').trim(),
      enabled: this.data.form.enabled,
      taskPayload: payload,
      dateStrategy: buildDateStrategyFromForm(this.data.form)
    };

    this.setData({ saving: true });

    try {
      let saveResult = null;
      if (this.data.mode === 'edit' && this.data.templateId) {
        saveResult = await taskTemplateService.updateTemplate(this.data.templateId, input);
      } else {
        saveResult = await taskTemplateService.createTemplate(input);
      }

      const eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel();
      if (
        eventChannel &&
        typeof eventChannel.emit === 'function' &&
        this._draftSourceMeta &&
        this._draftSourceMeta.sourceType === 'template-manage-candidate'
      ) {
        eventChannel.emit('templateSaved', {
          templateId: saveResult?.template?.id || this.data.templateId || null,
          sourceMeta: this._draftSourceMeta
        });
      }

      wx.showToast({
        title: '模板已保存',
        icon: 'success'
      });

      wx.navigateBack({
        delta: 1
      });
    } catch (error) {
      logger.error('TaskTemplateEdit', '保存模板失败', error);
      wx.showToast({
        title: error.message || '保存失败',
        icon: 'none'
      });
    } finally {
      this.setData({ saving: false });
    }
  },

  validateForm() {
    const form = this.data.form;

    if (form.name.trim().length > 100) {
      return '模板别名不能超过100个字符';
    }

    if ((form.description || '').trim().length > 255) {
      return '模板说明不能超过255个字符';
    }

    if (!form.taskTitle.trim()) {
      return '请输入任务名称';
    }

    if (!form.isAllDay && (!form.startTime || !form.endTime)) {
      return '请设置开始和结束时间';
    }

    if (
      !form.isAllDay &&
      form.startTime &&
      form.endTime &&
      form.endTime <= form.startTime
    ) {
      return '结束时间不能早于开始时间';
    }

    if (form.repeatType !== 'none' && form.endMode === 'duration' && normalizeDurationDays(form.durationDays, 0) < 1) {
      return '请输入有效的持续天数';
    }

    if (form.repeatType === 'custom' && form.repeatDays.length === 0) {
      return '请选择至少一个重复星期';
    }

    return '';
  }
});
