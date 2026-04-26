const dateUtils = require('../../../utils/dateUtils');
const logger = require('../../../utils/logger');
const serviceManager = require('../../../services/service-manager');
const occurrenceContext = require('../../utils/occurrence-context');
const occurrenceDisplay = require('../../../utils/task-occurrence-display');
const taskFormDisplay = require('../../../utils/task-form-display');
const { StarExpiryType } = require('../../../models/task');

function getTodayString() {
  return dateUtils.getTodayString();
}

function normalizePointsValue(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(Math.max(Math.round(parsed), 1), 50);
}

function getDefaultDraft() {
  const today = getTodayString();
  return {
    id: '',
    title: '',
    type: 'study',
    points: 1,
    pointsExpiry: StarExpiryType.PERMANENT,
    startDate: today,
    endDate: '',
    hasNoEndDate: true
  };
}

function cloneDraft(draft) {
  return {
    id: draft.id || '',
    title: draft.title || '',
    type: draft.type || 'study',
    points: normalizePointsValue(draft.points),
    pointsExpiry: draft.pointsExpiry || StarExpiryType.PERMANENT,
    startDate: draft.startDate || getTodayString(),
    endDate: draft.endDate || '',
    hasNoEndDate: draft.hasNoEndDate === true
  };
}

function normalizeDraftSnapshot(draft) {
  const snapshot = cloneDraft(draft || getDefaultDraft());
  return {
    ...snapshot,
    title: String(snapshot.title || '').trim()
  };
}

function isSameDraft(left, right) {
  return JSON.stringify(normalizeDraftSnapshot(left)) === JSON.stringify(normalizeDraftSnapshot(right));
}

function getDefaultEditorState() {
  return {
    visible: false,
    mode: 'create',
    dirty: false,
    anchorTaskId: ''
  };
}

function getDefaultSectionUiState() {
  return {
    activeExpanded: false,
    upcomingExpanded: false,
    historyExpanded: false,
    anchorTaskId: ''
  };
}

function getUserService() {
  const app = typeof getApp === 'function' ? getApp() : null;
  const appUserService = app && app.globalData ? app.globalData.userService : null;
  if (appUserService) {
    return appUserService;
  }

  return typeof serviceManager.getUserService === 'function'
    ? serviceManager.getUserService()
    : null;
}

function resolveTargetContext(explicitTargetUserId) {
  const userService = getUserService();
  const loginUser = userService && typeof userService.getLoginUser === 'function'
    ? userService.getLoginUser()
    : null;
  const currentUser = userService && typeof userService.getCurrentUser === 'function'
    ? userService.getCurrentUser()
    : null;
  const availableUsers = userService && typeof userService.getAllUsers === 'function'
    ? userService.getAllUsers()
    : [];
  const app = typeof getApp === 'function' ? getApp() : null;
  const lastActiveChildId = app && app.globalData ? (app.globalData.lastActiveChildId || null) : null;
  const context = occurrenceContext.resolveOccurrenceExecutionSubject({
    loginUser,
    currentUser,
    availableUsers
  }, {
    lastActiveChildId
  });

  if (explicitTargetUserId) {
    const matched = context.childOptions.find((item) => item.userId === explicitTargetUserId);
    if (matched) {
      return {
        ...context,
        targetUserId: explicitTargetUserId,
        targetUserName: matched.label || ''
      };
    }
  }

  return context;
}

function getPageAccessGuard(userService) {
  const loginUser = userService && typeof userService.getLoginUser === 'function'
    ? userService.getLoginUser()
    : null;
  const currentUser = userService && typeof userService.getCurrentUser === 'function'
    ? userService.getCurrentUser()
    : null;

  if ((currentUser && currentUser.role === 'child') || (loginUser && loginUser.role === 'child')) {
    return {
      blocked: true,
      message: '当前身份不能管理表现项'
    };
  }

  if (
    loginUser &&
    (
      (typeof loginUser.isSystemReadonly === 'function' && loginUser.isSystemReadonly()) ||
      loginUser.systemAccessLevel === 'readonly'
    )
  ) {
    return {
      blocked: true,
      message: '当前账号为只读，不能管理表现项'
    };
  }

  if (
    loginUser &&
    loginUser.role === 'parent' &&
    loginUser.familyId &&
    loginUser.familyPermissionRole === 'viewer'
  ) {
    return {
      blocked: true,
      message: '当前为查看者，不能管理表现项'
    };
  }

  return {
    blocked: false,
    message: ''
  };
}

function buildOccurrenceTaskPayload(draft, targetUserId) {
  return {
    userId: targetUserId,
    title: String(draft.title || '').trim(),
    type: draft.type || 'study',
    points: normalizePointsValue(draft.points),
    pointsExpiry: draft.pointsExpiry || StarExpiryType.PERMANENT,
    date: draft.startDate,
    executionMode: 'occurrence',
    activeRange: {
      startDate: draft.startDate,
      endDate: draft.hasNoEndDate ? '' : draft.endDate,
      hasNoEndDate: draft.hasNoEndDate === true
    },
    repeat: { type: 'none' },
    reminder: { enabled: false, time: 0 },
    isRequired: false,
    isAllDay: false,
    startTime: '',
    endTime: '',
    duration: 0,
    hasNoEndDate: draft.hasNoEndDate === true
  };
}

function buildDraftFromItem(item) {
  const activeRange = item && item.activeRange ? item.activeRange : {};
  return {
    id: item && item.id ? item.id : '',
    title: item && item.title ? item.title : '',
    type: item && item.type ? item.type : 'study',
    points: normalizePointsValue(item && item.points !== undefined ? item.points : 1),
    pointsExpiry: item && item.pointsExpiry ? item.pointsExpiry : StarExpiryType.PERMANENT,
    startDate: activeRange.startDate || (item && item.date ? item.date : getTodayString()),
    endDate: activeRange.endDate || '',
    hasNoEndDate: activeRange.hasNoEndDate === true
  };
}

function buildPointsExpirySummary(pointsExpiry) {
  return taskFormDisplay.buildPointsExpiryText(pointsExpiry || StarExpiryType.PERMANENT);
}

function isHistoryOccurrenceItem(item) {
  if (!item) {
    return false;
  }

  return occurrenceDisplay.buildOccurrenceCardViewModel(item, getTodayString()).statusKey === 'history';
}

function resolveRuntimeMetrics() {
  const app = typeof getApp === 'function' ? getApp() : null;
  const globalData = app && app.globalData ? app.globalData : {};
  const safeArea = globalData.safeArea || {};
  const statusBarHeight = Number(globalData.statusBarHeight || 0);
  let navContentHeight = 44;

  if (typeof wx !== 'undefined' && typeof wx.getMenuButtonBoundingClientRect === 'function') {
    try {
      const capsuleRect = wx.getMenuButtonBoundingClientRect();
      if (capsuleRect && capsuleRect.height) {
        const topGap = Math.max(Number(capsuleRect.top || 0) - statusBarHeight, 0);
        navContentHeight = Math.max(44, Math.round((topGap * 2) + Number(capsuleRect.height || 0)));
      }
    } catch (error) {
      logger.warn('task-occurrence-edit', '读取胶囊按钮尺寸失败，回退默认导航高度', error);
    }
  }

  return {
    statusBarHeight,
    navContentHeight,
    navBarHeight: statusBarHeight + navContentHeight,
    safeAreaBottom: Number(safeArea.bottom || 0)
  };
}

function resolveResultTaskId(result, fallbackTaskId) {
  if (result && result.task && result.task.id) {
    return result.task.id;
  }
  if (result && result.taskId) {
    return result.taskId;
  }
  return fallbackTaskId || '';
}

function buildMutationUiPatch(taskLike) {
  if (!taskLike || !taskLike.id) {
    return {
      anchorTaskId: '',
      activeExpanded: false
    };
  }

  const statusKey = occurrenceDisplay.buildOccurrenceCardViewModel(taskLike, getTodayString()).statusKey;
  if (statusKey === 'upcoming') {
    return {
      anchorTaskId: taskLike.id,
      upcomingExpanded: true
    };
  }
  if (statusKey === 'active') {
    return {
      anchorTaskId: taskLike.id
    };
  }

  return {
    anchorTaskId: ''
  };
}

Page({
  data: {
    loading: true,
    saving: false,
    targetUserId: '',
    targetUserName: '',
    childOptions: [],
    requiresPicker: false,
    activeSection: null,
    secondaryPanel: null,
    statsBar: {
      visible: false,
      items: []
    },
    summary: {
      activeCount: 0,
      upcomingCount: 0,
      historyCount: 0,
      totalCount: 0
    },
    draft: getDefaultDraft(),
    pointsExpiryText: buildPointsExpirySummary(StarExpiryType.PERMANENT),
    pointsExpiryPanel: false,
    editingId: '',
    editorState: getDefaultEditorState(),
    sectionUiStateByUser: {},
    scrollAnchorId: '',
    statusBarHeight: 0,
    navContentHeight: 44,
    navBarHeight: 44,
    safeAreaBottom: 0
  },

  onLoad: async function onLoad(options) {
    this._occurrenceItems = [];
    this._pristineDraft = normalizeDraftSnapshot(getDefaultDraft());

    const userService = getUserService();
    const accessGuard = getPageAccessGuard(userService);
    if (accessGuard.blocked) {
      wx.showToast({
        title: accessGuard.message,
        icon: 'none'
      });
      if (typeof wx.navigateBack === 'function') {
        wx.navigateBack({ delta: 1 });
      }
      return;
    }

    const metrics = resolveRuntimeMetrics();
    this.setData(metrics);

    const taskService = serviceManager.getService('task');
    const occurrenceEnabled = taskService && typeof taskService.isOccurrenceEnabled === 'function'
      ? await taskService.isOccurrenceEnabled()
      : true;

    if (!occurrenceEnabled) {
      wx.showToast({
        title: '云端未完成升级，暂不可使用表现项',
        icon: 'none'
      });
      if (typeof wx.navigateBack === 'function') {
        wx.navigateBack({ delta: 1 });
      }
      return;
    }

    const targetContext = resolveTargetContext(options && options.targetUserId ? options.targetUserId : '');
    this.setData({
      targetUserId: targetContext.targetUserId || '',
      targetUserName: targetContext.targetUserName || '',
      childOptions: targetContext.childOptions || [],
      requiresPicker: targetContext.requiresPicker === true
    });

    await this.loadItems();
  },

  getCurrentSectionUiState: function getCurrentSectionUiState() {
    const targetUserId = this.data.targetUserId || '';
    if (!targetUserId) {
      return getDefaultSectionUiState();
    }

    return {
      ...getDefaultSectionUiState(),
      ...(this.data.sectionUiStateByUser[targetUserId] || {})
    };
  },

  setCurrentSectionUiState: function setCurrentSectionUiState(patch) {
    const targetUserId = this.data.targetUserId || '';
    const currentState = this.getCurrentSectionUiState();
    const nextState = {
      ...currentState,
      ...(patch || {})
    };

    if (!targetUserId) {
      return nextState;
    }

    const nextMap = {
      ...this.data.sectionUiStateByUser,
      [targetUserId]: nextState
    };

    this.setData({
      sectionUiStateByUser: nextMap
    });
    return nextState;
  },

  applyDisplayModel: function applyDisplayModel(items, uiState) {
    const targetUserId = this.data.targetUserId || '';
    const displayModel = occurrenceDisplay.buildOccurrenceManageSections(items, getTodayString(), uiState);
    const nextMap = {
      ...this.data.sectionUiStateByUser
    };
    const anchorTaskId = displayModel.uiState.anchorTaskId || '';
    if (targetUserId) {
      nextMap[targetUserId] = displayModel.uiState;
    }

    this.setData({
      loading: false,
      activeSection: displayModel.activeSection,
      secondaryPanel: displayModel.secondaryPanel,
      statsBar: displayModel.statsBar,
      summary: displayModel.summary,
      sectionUiStateByUser: nextMap,
      scrollAnchorId: anchorTaskId ? `occ-card-${anchorTaskId}` : ''
    });

    if (anchorTaskId) {
      this.consumeAnchorAfterRender(anchorTaskId);
    }
  },

  consumeAnchorAfterRender: function consumeAnchorAfterRender(anchorTaskId) {
    if (!anchorTaskId || this._anchorConsumePendingFor === anchorTaskId) {
      return;
    }

    this._anchorConsumePendingFor = anchorTaskId;

    const finalize = () => {
      if (this._anchorConsumePendingFor !== anchorTaskId) {
        return;
      }
      this._anchorConsumePendingFor = '';

      const currentUiState = this.getCurrentSectionUiState();
      if (currentUiState.anchorTaskId !== anchorTaskId) {
        return;
      }

      this.setCurrentSectionUiState({
        anchorTaskId: ''
      });
      this.setData({
        scrollAnchorId: ''
      });
    };

    if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
      wx.nextTick(finalize);
      return;
    }

    finalize();
  },

  refreshDisplayFromCache: function refreshDisplayFromCache(patch) {
    const nextUiState = this.setCurrentSectionUiState(patch);
    this.applyDisplayModel(this._occurrenceItems || [], nextUiState);
  },

  loadItems: async function loadItems() {
    const taskService = serviceManager.getService('task');
    const targetUserId = this.data.targetUserId || '';

    if (!taskService || !targetUserId) {
      this._occurrenceItems = [];
      this.applyDisplayModel([], getDefaultSectionUiState());
      return;
    }

    try {
      const items = await taskService.getOccurrenceTasks({
        date: getTodayString(),
        userId: targetUserId,
        includeInactive: true
      });

      this._occurrenceItems = Array.isArray(items) ? items : [];
      this.applyDisplayModel(this._occurrenceItems, this.getCurrentSectionUiState());
    } catch (error) {
      logger.error('task-occurrence-edit', '加载表现项失败', error);
      this._occurrenceItems = [];
      this.applyDisplayModel([], this.getCurrentSectionUiState());
      wx.showToast({
        title: '加载表现项失败',
        icon: 'none'
      });
    }
  },

  syncEditorDirtyState: function syncEditorDirtyState() {
    const nextDirty = !isSameDraft(this.data.draft, this._pristineDraft);
    if (this.data.editorState.dirty === nextDirty) {
      return;
    }

    this.setData({
      editorState: {
        ...this.data.editorState,
        dirty: nextDirty
      }
    });
  },

  openEditor: function openEditor(mode, item) {
    const draft = mode === 'edit' && item ? buildDraftFromItem(item) : getDefaultDraft();
    const anchorTaskId = item && item.id ? item.id : '';
    this._pristineDraft = normalizeDraftSnapshot(draft);

    this.setData({
      editingId: mode === 'edit' && item ? item.id : '',
      draft,
      pointsExpiryText: buildPointsExpirySummary(draft.pointsExpiry),
      pointsExpiryPanel: false,
      editorState: {
        visible: true,
        mode: mode === 'edit' ? 'edit' : 'create',
        dirty: false,
        anchorTaskId
      }
    });
  },

  closeEditor: function closeEditor() {
    const nextDraft = getDefaultDraft();
    this._pristineDraft = normalizeDraftSnapshot(nextDraft);
    this.setData({
      editingId: '',
      draft: nextDraft,
      pointsExpiryText: buildPointsExpirySummary(nextDraft.pointsExpiry),
      pointsExpiryPanel: false,
      editorState: getDefaultEditorState()
    });
  },

  confirmDiscardIfDirty: function confirmDiscardIfDirty() {
    const editorState = this.data.editorState;
    if (!editorState.visible || !editorState.dirty) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      wx.showModal({
        title: '放弃本次修改？',
        content: '当前内容还没保存，离开后会丢失。',
        confirmText: '放弃修改',
        cancelText: '继续编辑',
        success: function success(result) {
          resolve(result && result.confirm === true);
        }
      });
    });
  },

  findItemById: function findItemById(itemId) {
    return (this._occurrenceItems || []).find((item) => item && item.id === itemId);
  },

  onNavBack: async function onNavBack() {
    if (this.data.editorState.visible) {
      const shouldDiscard = await this.confirmDiscardIfDirty();
      if (!shouldDiscard) {
        return;
      }
      this.closeEditor();
      return;
    }

    if (typeof wx.navigateBack === 'function') {
      wx.navigateBack({ delta: 1 });
    }
  },

  onCreateTap: function onCreateTap() {
    if (!this.data.targetUserId) {
      wx.showToast({
        title: '请先选择孩子',
        icon: 'none'
      });
      return;
    }
    this.openEditor('create');
  },

  onCloseEditorTap: async function onCloseEditorTap() {
    if (this.data.saving) {
      return;
    }

    const shouldDiscard = await this.confirmDiscardIfDirty();
    if (!shouldDiscard) {
      return;
    }
    this.closeEditor();
  },

  onTitleInput: function onTitleInput(e) {
    this.setData({
      'draft.title': e.detail.value
    });
    this.syncEditorDirtyState();
  },

  onPointsInput: function onPointsInput(e) {
    this.setData({
      'draft.points': normalizePointsValue(e.detail.value)
    });
    this.syncEditorDirtyState();
  },

  onPointsStepTap: function onPointsStepTap(e) {
    const action = e.currentTarget.dataset.action;
    const currentPoints = normalizePointsValue(this.data.draft.points);
    const nextPoints = action === 'minus'
      ? Math.max(currentPoints - 1, 1)
      : Math.min(currentPoints + 1, 50);

    this.setData({
      'draft.points': nextPoints
    });
    this.syncEditorDirtyState();
  },

  onStartDateChange: function onStartDateChange(e) {
    const nextStartDate = e.detail.value;
    const patch = {
      'draft.startDate': nextStartDate
    };

    if (!this.data.draft.hasNoEndDate && this.data.draft.endDate && this.data.draft.endDate < nextStartDate) {
      patch['draft.endDate'] = nextStartDate;
    }

    this.setData(patch);
    this.syncEditorDirtyState();
  },

  onEndDateChange: function onEndDateChange(e) {
    this.setData({
      'draft.endDate': e.detail.value
    });
    this.syncEditorDirtyState();
  },

  onTypeTap: function onTypeTap(e) {
    this.setData({
      'draft.type': e.currentTarget.dataset.type
    });
    this.syncEditorDirtyState();
  },

  onToggleNoEndDate: function onToggleNoEndDate(e) {
    const hasNoEndDate = e.detail.value;
    const patch = {
      'draft.hasNoEndDate': hasNoEndDate
    };

    if (hasNoEndDate) {
      patch['draft.endDate'] = '';
    } else if (!this.data.draft.endDate) {
      patch['draft.endDate'] = this.data.draft.startDate;
    }

    this.setData(patch);
    this.syncEditorDirtyState();
  },

  onChildTap: async function onChildTap(e) {
    const targetUserId = e.currentTarget.dataset.userId;
    if (!targetUserId || targetUserId === this.data.targetUserId) {
      return;
    }

    if (this.data.editorState.visible) {
      const shouldDiscard = await this.confirmDiscardIfDirty();
      if (!shouldDiscard) {
        return;
      }
      this.closeEditor();
    }

    const selected = this.data.childOptions.find((item) => item.userId === targetUserId);
    const app = typeof getApp === 'function' ? getApp() : null;
    if (app && app.globalData) {
      app.globalData.lastActiveChildId = targetUserId;
    }

    this.setData({
      loading: true,
      targetUserId,
      targetUserName: selected ? (selected.label || '') : ''
    });
    await this.loadItems();
  },

  onToggleSection: function onToggleSection(e) {
    const key = e.currentTarget.dataset.key;
    if (key === 'active') {
      const section = this.data.activeSection;
      if (!section || !section.hasToggle) {
        return;
      }
      this.refreshDisplayFromCache({
        activeExpanded: !section.expanded
      });
      return;
    }

    if (key === 'upcoming') {
      const panel = this.data.secondaryPanel;
      const section = panel ? panel.upcomingSection : null;
      if (!section || section.count === 0) {
        return;
      }
      this.refreshDisplayFromCache({
        upcomingExpanded: !section.expanded
      });
      return;
    }

    if (key === 'history') {
      const panel = this.data.secondaryPanel;
      const section = panel ? panel.historySection : null;
      if (!section || section.count === 0) {
        return;
      }
      this.refreshDisplayFromCache({
        historyExpanded: !section.expanded
      });
    }
  },

  onEditTap: function onEditTap(e) {
    const itemId = e.currentTarget.dataset.id;
    const item = this.findItemById(itemId);
    if (!item || isHistoryOccurrenceItem(item)) {
      return;
    }
    this.openEditor('edit', item);
  },

  onMoreTap: async function onMoreTap(e) {
    const taskId = e.currentTarget.dataset.id || this.data.editingId;
    const item = this.findItemById(taskId);
    if (!taskId || !item || isHistoryOccurrenceItem(item) || typeof wx.showActionSheet !== 'function') {
      return;
    }

    const cardState = occurrenceDisplay.buildOccurrenceCardViewModel(item, getTodayString());
    const actionKeys = Array.isArray(cardState.moreActionKeys) ? cardState.moreActionKeys : [];
    if (!actionKeys.length) {
      return;
    }

    const actionLabelMap = {
      edit: '编辑表现项',
      disable: '停用表现项',
      delete: '删除表现项'
    };
    const itemList = actionKeys.map((key) => actionLabelMap[key]).filter(Boolean);
    if (!itemList.length) {
      return;
    }

    wx.showActionSheet({
      itemList,
      success: async ({ tapIndex }) => {
        const actionKey = actionKeys[tapIndex];
        if (actionKey === 'edit') {
          this.openEditor('edit', item);
        } else if (actionKey === 'disable') {
          await this.onDisableTap({ currentTarget: { dataset: { id: taskId } } });
        } else if (actionKey === 'delete') {
          await this.onDeleteTap({ currentTarget: { dataset: { id: taskId } } });
        }
      }
    });
  },

  onDisableTap: async function onDisableTap(e) {
    const taskId = e.currentTarget.dataset.id;
    const item = this.findItemById(taskId);
    if (!taskId || !item || isHistoryOccurrenceItem(item)) {
      return;
    }

    const taskService = serviceManager.getService('task');
    if (!taskService || typeof taskService.disableOccurrenceTask !== 'function') {
      return;
    }

    const modalResult = await new Promise((resolve) => {
      wx.showModal({
        title: '停用表现项',
        content: '停用后未来日期不再出现，历史记录会保留。',
        success: resolve
      });
    });

    if (!modalResult.confirm) {
      return;
    }

    const result = await taskService.disableOccurrenceTask(taskId, {
      disableFromDate: getTodayString()
    }, this.data.targetUserId || null);

    if (!result.success) {
      wx.showToast({
        title: result.message || '停用失败',
        icon: 'none'
      });
      return;
    }

    if (this.data.editingId === taskId) {
      this.closeEditor();
    }
    this.setCurrentSectionUiState({
      anchorTaskId: ''
    });
    wx.showToast({
      title: '已停用',
      icon: 'success'
    });
    await this.loadItems();
  },

  onDeleteTap: async function onDeleteTap(e) {
    const taskId = e.currentTarget.dataset.id;
    const item = this.findItemById(taskId);
    if (!taskId || !item || isHistoryOccurrenceItem(item)) {
      return;
    }

    const taskService = serviceManager.getService('task');
    if (!taskService) {
      return;
    }

    const modalResult = await new Promise((resolve) => {
      wx.showModal({
        title: '删除表现项',
        content: '删除后会归档，不再用于后续记录，历史记录仍会保留。',
        success: resolve
      });
    });

    if (!modalResult.confirm) {
      return;
    }

    const result = await taskService.deleteTask(taskId, this.data.targetUserId || null);
    if (!result.success) {
      wx.showToast({
        title: result.message || '删除失败',
        icon: 'none'
      });
      return;
    }

    if (this.data.editingId === taskId) {
      this.closeEditor();
    }
    this.setCurrentSectionUiState({
      anchorTaskId: ''
    });
    wx.showToast({
      title: '已删除',
      icon: 'success'
    });
    await this.loadItems();
  },

  onSaveTap: async function onSaveTap() {
    if (this.data.saving) {
      return;
    }

    const taskService = serviceManager.getService('task');
    const targetUserId = this.data.targetUserId || '';
    const draft = this.data.draft;
    const editingId = this.data.editingId || '';

    if (!taskService || !targetUserId) {
      wx.showToast({
        title: '请先选择孩子',
        icon: 'none'
      });
      return;
    }

    if (!String(draft.title || '').trim()) {
      wx.showToast({
        title: '请输入表现项名称',
        icon: 'none'
      });
      return;
    }

    if (!draft.hasNoEndDate && draft.endDate && draft.endDate < draft.startDate) {
      wx.showToast({
        title: '结束日期不能早于开始日期',
        icon: 'none'
      });
      return;
    }

    this.setData({ saving: true });

    try {
      const payload = buildOccurrenceTaskPayload(draft, targetUserId);
      const result = editingId
        ? await taskService.updateTask(editingId, payload, targetUserId)
        : await taskService.createTask(payload);

      if (!result.success) {
        wx.showToast({
          title: result.message || '保存失败',
          icon: 'none'
        });
        return;
      }

      const nextTaskId = resolveResultTaskId(result, editingId);
      const nextTaskLike = {
        ...(result && result.task ? result.task : payload),
        id: nextTaskId || payload.id || ''
      };
      this.setCurrentSectionUiState(buildMutationUiPatch(nextTaskLike));

      wx.showToast({
        title: editingId ? '已更新' : '已创建',
        icon: 'success'
      });

      this.closeEditor();
      await this.loadItems();
    } catch (error) {
      logger.error('task-occurrence-edit', '保存表现项失败', error);
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    } finally {
      this.setData({ saving: false });
    }
  },

  togglePanel: function togglePanel(e) {
    const panel = e.currentTarget.dataset.panel;
    if (panel !== 'pointsExpiryPanel') {
      return;
    }

    this.setData({
      pointsExpiryPanel: !this.data.pointsExpiryPanel
    });
  },

  closeAllPanels: function closeAllPanels() {
    if (!this.data.pointsExpiryPanel) {
      return;
    }

    this.setData({
      pointsExpiryPanel: false
    });
  },

  preventTouchMove: function preventTouchMove() {},

  preventClose: function preventClose() {},

  selectPointsExpiry: function selectPointsExpiry(e) {
    const expiry = e.currentTarget.dataset.expiry || StarExpiryType.PERMANENT;
    this.setData({
      'draft.pointsExpiry': expiry,
      pointsExpiryText: buildPointsExpirySummary(expiry),
      pointsExpiryPanel: false
    });
    this.syncEditorDirtyState();
  }
});
