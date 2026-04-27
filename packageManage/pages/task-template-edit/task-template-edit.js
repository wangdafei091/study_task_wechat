const serviceManager = require('../../../services/service-manager');
const logger = require('../../../utils/logger');
const Constants = require('../../../utils/constants');
const dateUtils = require('../../../utils/dateUtils');
const taskFormDisplay = require('../../../utils/task-form-display');
const taskFormCore = require('../../../utils/task-form-core');
const taskFormAdapter = require('../../../utils/task-form-adapter');
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
  return taskFormCore.buildReminderOptionsFromDraft(buildFormDraft(form));
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

function createDefaultForm() {
  const draft = taskFormCore.createTaskFormDraft('template', {
    today: dateUtils.getTodayString(),
    now: new Date()
  });

  return taskFormAdapter.buildTemplateEditPatchFromDraft(draft, {
    name: '',
    description: '',
    enabled: true
  });
}

function buildFormDraft(form = {}, options = {}) {
  return taskFormAdapter.adaptTemplateEditFormToDraft(form, {
    today: options.today || dateUtils.getTodayString(),
    now: options.now
  });
}

function buildFormFromTemplate(template = {}) {
  const draft = taskFormAdapter.adaptTemplateEntityToDraft(template, {
    today: template.taskPayload?.startDate || dateUtils.getTodayString()
  });

  return taskFormAdapter.buildTemplateEditPatchFromDraft(draft, {
    name: template.name || '',
    description: template.description || '',
    enabled: template.enabled !== false
  });
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
    this._loadedTemplate = null;
    this._draftSourceMeta = null;
    const userService = serviceManager.getUserService();
    const loginUser = userService?.getLoginUser?.();
    const currentUser = userService?.getCurrentUser?.();
    const isChildView = viewScope.isChildView(loginUser, currentUser);
    const isViewerReadonly = Boolean(
      loginUser &&
      loginUser.role === 'parent' &&
      loginUser.familyId &&
      loginUser.familyPermissionRole === 'viewer'
    );
    const isSystemReadonly = Boolean(
      loginUser &&
      (
        (typeof loginUser.isSystemReadonly === 'function' && loginUser.isSystemReadonly()) ||
        loginUser.systemAccessLevel === 'readonly'
      )
    );

    if (!loginUser || loginUser.role !== 'parent' || isChildView || isViewerReadonly || isSystemReadonly) {
      wx.showToast({
        title: isSystemReadonly
          ? '当前账号为只读，不能管理任务模板'
          : (isViewerReadonly ? '当前为查看者，不能管理任务模板' : '暂无操作权限'),
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

      this._loadedTemplate = typeof template.toJSON === 'function' ? template.toJSON() : template;
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
    this.refreshPreview();
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
    const draft = buildFormDraft(this.data.form);
    const reminderOptions = taskFormCore.buildReminderOptionsFromDraft(draft);
    const reminderState = resolveReminderSelection(
      reminderOptions,
      this.data.form.reminderEnabled,
      this.data.form.reminderTime
    );
    const previewDraft = buildFormDraft({
      ...this.data.form,
      reminderEnabled: reminderState.reminderEnabled,
      reminderTime: reminderState.reminderTime
    });
    const preview = taskFormDisplay.buildTaskFormDisplayState(previewDraft, {
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

    const draft = buildFormDraft(this.data.form);
    const payload = taskFormCore.buildTemplatePayloadFromDraft(draft, {
      today: dateUtils.getTodayString()
    });
    const resolvedName = (this.data.form.name || '').trim() || (this.data.form.taskTitle || '').trim();
    const input = {
      name: resolvedName,
      description: (this.data.form.description || '').trim(),
      enabled: this.data.form.enabled,
      taskPayload: payload.taskPayload,
      dateStrategy: payload.dateStrategy
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
    const validation = taskFormCore.validateTaskFormDraft(this.data.form, {
      scene: 'template',
      templateName: this.data.form.name,
      templateDescription: this.data.form.description,
      previousTemplate: this.data.mode === 'edit' ? this._loadedTemplate : null
    });

    return validation.valid ? '' : validation.errorMsg;
  }
});
