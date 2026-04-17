const dateUtils = require('../../utils/dateUtils');
const logger = require('../../utils/logger');
const serviceManager = require('../../services/service-manager');
const occurrenceContext = require('../../utils/task-occurrence-context');

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
    startDate: today,
    endDate: '',
    hasNoEndDate: true
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

function resolveTargetContext(explicitTargetUserId = '') {
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

function buildOccurrenceTaskPayload(draft, targetUserId) {
  return {
    userId: targetUserId,
    title: String(draft.title || '').trim(),
    type: draft.type || 'study',
    points: normalizePointsValue(draft.points),
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

function decorateItem(item) {
  const activeRange = item.activeRange || {};
  const hasNoEndDate = activeRange.hasNoEndDate === true;
  const today = getTodayString();
  let statusText = '有效中';
  if ((activeRange.startDate || item.date || '') > today) {
    statusText = '未生效';
  } else if (!hasNoEndDate && (activeRange.endDate || '') && activeRange.endDate < today) {
    statusText = '已停用';
  }
  return {
    ...item,
    rangeText: hasNoEndDate
      ? `${activeRange.startDate || item.date} 起长期有效`
      : `${activeRange.startDate || item.date} - ${activeRange.endDate || '未设置'}`,
    typeLabel: item.type === 'habit' ? '习惯' : (item.type === 'interest' ? '兴趣' : '学习'),
    statusText
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
    items: [],
    draft: getDefaultDraft(),
    editingId: '',
    emptyText: '还没有表现项，可以先创建一个。'
  },

  async onLoad(options = {}) {
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

    const targetContext = resolveTargetContext(options.targetUserId || '');
    this.setData({
      targetUserId: targetContext.targetUserId || '',
      targetUserName: targetContext.targetUserName || '',
      childOptions: targetContext.childOptions || [],
      requiresPicker: targetContext.requiresPicker === true
    });

    await this.loadItems();
  },

  async loadItems() {
    const taskService = serviceManager.getService('task');
    if (!taskService) {
      this.setData({
        loading: false,
        items: []
      });
      return;
    }

    const date = getTodayString();
    const targetUserId = this.data.targetUserId || '';
    if (!targetUserId) {
      this.setData({
        loading: false,
        items: []
      });
      return;
    }

    try {
      const items = await taskService.getOccurrenceTasks({
        date,
        userId: targetUserId,
        includeInactive: true
      });

      this.setData({
        loading: false,
        items: items.map(decorateItem)
      });
    } catch (error) {
      logger.error('task-occurrence-edit', '加载表现项失败', error);
      this.setData({
        loading: false,
        items: []
      });
      wx.showToast({
        title: '加载表现项失败',
        icon: 'none'
      });
    }
  },

  onTitleInput(e) {
    this.setData({
      'draft.title': e.detail.value
    });
  },

  onPointsInput(e) {
    this.setData({
      'draft.points': normalizePointsValue(e.detail.value)
    });
  },

  onPointsStepTap(e) {
    const action = e.currentTarget.dataset.action;
    const currentPoints = normalizePointsValue(this.data.draft.points);
    const nextPoints = action === 'minus'
      ? Math.max(currentPoints - 1, 1)
      : Math.min(currentPoints + 1, 50);

    this.setData({
      'draft.points': nextPoints
    });
  },

  onStartDateChange(e) {
    const nextStartDate = e.detail.value;
    const patch = {
      'draft.startDate': nextStartDate
    };

    if (!this.data.draft.hasNoEndDate && this.data.draft.endDate && this.data.draft.endDate < nextStartDate) {
      patch['draft.endDate'] = nextStartDate;
    }

    this.setData({
      ...patch
    });
  },

  onEndDateChange(e) {
    this.setData({
      'draft.endDate': e.detail.value
    });
  },

  onTypeTap(e) {
    this.setData({
      'draft.type': e.currentTarget.dataset.type
    });
  },

  onToggleNoEndDate(e) {
    const hasNoEndDate = e.detail.value;
    const patch = {
      'draft.hasNoEndDate': hasNoEndDate
    };

    if (hasNoEndDate) {
      patch['draft.endDate'] = '';
    } else if (!this.data.draft.endDate) {
      patch['draft.endDate'] = this.data.draft.startDate;
    }

    this.setData({
      ...patch
    });
  },

  onChildTap(e) {
    const targetUserId = e.currentTarget.dataset.userId;
    const selected = this.data.childOptions.find((item) => item.userId === targetUserId);
    this.setData({
      targetUserId,
      targetUserName: selected ? (selected.label || '') : ''
    });
    this.loadItems();
  },

  async onMoreTap(e) {
    const taskId = e.currentTarget.dataset.id;
    if (!taskId || typeof wx.showActionSheet !== 'function') {
      return;
    }

    wx.showActionSheet({
      itemList: ['停用表现项', '删除表现项'],
      success: async ({ tapIndex }) => {
        if (tapIndex === 0) {
          await this.onDisableTap({ currentTarget: { dataset: { id: taskId } } });
        } else if (tapIndex === 1) {
          await this.onDeleteTap({ currentTarget: { dataset: { id: taskId } } });
        }
      }
    });
  },

  async onDisableTap(e) {
    const taskId = e.currentTarget.dataset.id;
    if (!taskId) {
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

    wx.showToast({
      title: '已停用',
      icon: 'success'
    });
    await this.loadItems();
    if (this.data.editingId === taskId) {
      this.onCancelEdit();
    }
  },

  onEditTap(e) {
    const itemId = e.currentTarget.dataset.id;
    const item = this.data.items.find((candidate) => candidate.id === itemId);
    if (!item) {
      return;
    }

    const activeRange = item.activeRange || {};
    this.setData({
      editingId: item.id,
        draft: {
          id: item.id,
          title: item.title,
          type: item.type,
          points: normalizePointsValue(item.points),
          startDate: activeRange.startDate || item.date || getTodayString(),
          endDate: activeRange.endDate || '',
          hasNoEndDate: activeRange.hasNoEndDate === true
        }
    });
  },

  onCancelEdit() {
    this.setData({
      editingId: '',
      draft: getDefaultDraft()
    });
  },

  async onDeleteTap(e) {
    const taskId = e.currentTarget.dataset.id;
    if (!taskId) {
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

    wx.showToast({
      title: '已删除',
      icon: 'success'
    });
    await this.loadItems();
    if (this.data.editingId === taskId) {
      this.onCancelEdit();
    }
  },

  async onSaveTap() {
    const taskService = serviceManager.getService('task');
    const targetUserId = this.data.targetUserId || '';
    const draft = this.data.draft;

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
      const result = this.data.editingId
        ? await taskService.updateTask(this.data.editingId, payload, targetUserId)
        : await taskService.createTask(payload);

      if (!result.success) {
        wx.showToast({
          title: result.message || '保存失败',
          icon: 'none'
        });
        return;
      }

      wx.showToast({
        title: this.data.editingId ? '已更新' : '已创建',
        icon: 'success'
      });
      this.setData({
        editingId: '',
        draft: getDefaultDraft()
      });
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
  }
});
