const serviceManager = require('../../../services/service-manager');
const logger = require('../../../utils/logger');
const taskFormDisplay = require('../../../utils/task-form-display');
const { normalizeDateStrategy } = require('../../../utils/task-template-utils');
const viewScope = require('../../../utils/view-scope');

const SEARCH_DEBOUNCE_MS = 250;
const TAB_SELECT = 'select';
const TAB_MANAGE = 'manage';

function normalizeTimestamp(value) {
  const timestamp = Number(value || 0);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return '最近未使用';
  }

  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) {
    return '最近未使用';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTypeLabel(type) {
  switch (type) {
    case 'study':
      return '学习';
    case 'interest':
      return '兴趣';
    default:
      return '习惯';
  }
}

function getRecentChangeTimestamp(template) {
  return Math.max(
    normalizeTimestamp(template.updatedAt),
    normalizeTimestamp(template.createdAt)
  );
}

function compareSelectTemplates(left, right) {
  const rightLastUsed = normalizeTimestamp(right.lastUsedAt);
  const leftLastUsed = normalizeTimestamp(left.lastUsedAt);
  if (rightLastUsed !== leftLastUsed) {
    return rightLastUsed - leftLastUsed;
  }

  const rightUsageCount = Number(right.usageCount || 0);
  const leftUsageCount = Number(left.usageCount || 0);
  if (rightUsageCount !== leftUsageCount) {
    return rightUsageCount - leftUsageCount;
  }

  return getRecentChangeTimestamp(right) - getRecentChangeTimestamp(left);
}

function compareManageTemplates(left, right) {
  const rightUpdatedAt = normalizeTimestamp(right.updatedAt);
  const leftUpdatedAt = normalizeTimestamp(left.updatedAt);
  if (rightUpdatedAt !== leftUpdatedAt) {
    return rightUpdatedAt - leftUpdatedAt;
  }

  const rightLastUsed = normalizeTimestamp(right.lastUsedAt);
  const leftLastUsed = normalizeTimestamp(left.lastUsedAt);
  if (rightLastUsed !== leftLastUsed) {
    return rightLastUsed - leftLastUsed;
  }

  return normalizeTimestamp(right.createdAt) - normalizeTimestamp(left.createdAt);
}

function sortTemplates(templates = [], activeTab) {
  const nextTemplates = Array.isArray(templates) ? [...templates] : [];
  nextTemplates.sort(activeTab === TAB_MANAGE ? compareManageTemplates : compareSelectTemplates);
  return nextTemplates;
}

function normalizeActiveTab(mode) {
  return mode === TAB_MANAGE ? TAB_MANAGE : TAB_SELECT;
}

function decorateTemplate(template) {
  const payload = template.taskPayload || {};
  const strategy = normalizeDateStrategy(template.dateStrategy || {}, payload);
  const form = {
    ...payload,
    repeat: payload.repeat || { type: 'none', days: [] },
    reminder: payload.reminder || { enabled: false, time: 0 },
    hasNoEndDate: payload.hasNoEndDate === true
  };
  const displayState = taskFormDisplay.buildTaskFormDisplayState(form, {
    ignoreRepeatOptionDisabled: true
  });
  const alias = String(template.name || '').trim();
  const taskTitle = String(payload.title || '').trim();
  const displayName = alias && alias !== taskTitle ? alias : (taskTitle || alias);
  const validityLabel = payload.repeat?.type === 'none'
    ? '创建时默认当天完成'
    : (() => {
      if (strategy.endMode === 'no-end') {
        return '长期有效';
      }
      if (strategy.endMode === 'week-end') {
        return '本周结束';
      }
      if (strategy.endMode === 'month-end') {
        return '本月结束';
      }
      const durationDays = Number.isInteger(Number(strategy.durationDays))
        ? Math.max(1, Number(strategy.durationDays))
        : 1;
      return `持续${durationDays}天`;
    })();

  return {
    ...template,
    displayName,
    typeLabel: getTypeLabel(payload.type),
    typeClass: payload.type || 'habit',
    repeatLabel: displayState.repeatText || '不重复',
    reminderLabel: displayState.reminderText,
    timeLabel: payload.isAllDay ? '全天' : `${payload.startTime || '--:--'} - ${payload.endTime || '--:--'}`,
    validityLabel,
    usageLabel: `${Number(template.usageCount || 0)}次使用`,
    lastUsedLabel: formatTimestamp(template.lastUsedAt),
    statusLabel: template.enabled ? '启用中' : '已停用'
  };
}

Page({
  data: {
    activeTab: TAB_SELECT,
    loading: false,
    loadFailed: false,
    keyword: '',
    typeFilter: '',
    templates: [],
    hasTemplates: false,
    hasAnyTemplates: false,
    hasActiveFilters: false
  },

  onLoad(options = {}) {
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

    const activeTab = normalizeActiveTab(options.mode);
    this.setData({
      activeTab
    });

    if (typeof wx.setNavigationBarTitle === 'function') {
      wx.setNavigationBarTitle({
        title: '任务模板'
      });
    }
  },

  onShow() {
    this.loadTemplates();
  },

  onUnload() {
    if (this._keywordTimer) {
      clearTimeout(this._keywordTimer);
      this._keywordTimer = null;
    }

    this._loadRequestSeq = (this._loadRequestSeq || 0) + 1;
  },

  async onPullDownRefresh() {
    try {
      await this.loadTemplates({ force: true });
    } finally {
      if (typeof wx.stopPullDownRefresh === 'function') {
        wx.stopPullDownRefresh();
      }
    }
  },

  async loadTemplates(options = {}) {
    const taskTemplateService = serviceManager.getService('taskTemplate');
    if (!taskTemplateService) {
      this.setData({
        loading: false,
        loadFailed: true,
        templates: [],
        hasTemplates: false,
        hasAnyTemplates: false,
        hasActiveFilters: false
      });
      wx.showToast({
        title: '模板服务未就绪',
        icon: 'none'
      });
      return;
    }

    const activeTab = this.data.activeTab || TAB_SELECT;
    const keyword = String(this.data.keyword || '');
    const typeFilter = String(this.data.typeFilter || '');
    const hasActiveFilters = Boolean(
      keyword.trim() ||
      typeFilter.trim()
    );
    const requestId = (this._loadRequestSeq || 0) + 1;
    this._loadRequestSeq = requestId;

    this.setData({
      loading: true,
      loadFailed: false
    });

    try {
      const result = await taskTemplateService.getTemplates({
        keyword,
        type: typeFilter || 'all',
        status: 'all',
        sortBy: 'recent',
        force: options.force === true
      });

      if (requestId !== this._loadRequestSeq) {
        return;
      }

      const decoratedTemplates = (result.templates || []).map(decorateTemplate);
      const visibleTemplates = activeTab === TAB_SELECT
        ? decoratedTemplates.filter((template) => template.enabled === true)
        : decoratedTemplates;
      const templates = sortTemplates(visibleTemplates, activeTab);

      this.setData({
        templates,
        hasTemplates: templates.length > 0,
        hasAnyTemplates: decoratedTemplates.length > 0,
        hasActiveFilters,
        loadFailed: false,
        loading: false
      });
    } catch (error) {
      if (requestId !== this._loadRequestSeq) {
        return;
      }

      logger.error('TaskTemplateManage', '加载模板失败', error);
      this.setData({
        loadFailed: true,
        loading: false,
        hasActiveFilters
      });
      wx.showToast({
        title: '加载模板失败',
        icon: 'none'
      });
    }
  },

  switchTab(e) {
    const nextTab = normalizeActiveTab(e.currentTarget.dataset.tab);
    if (nextTab === this.data.activeTab) {
      return;
    }

    if (this._keywordTimer) {
      clearTimeout(this._keywordTimer);
      this._keywordTimer = null;
    }

    this.setData({
      activeTab: nextTab,
      keyword: '',
      typeFilter: '',
      templates: [],
      hasTemplates: false,
      hasAnyTemplates: false,
      hasActiveFilters: false,
      loadFailed: false
    });
    this.loadTemplates();
  },

  onKeywordInput(e) {
    this.setData({
      keyword: e.detail.value
    });
    this.scheduleTemplateReload();
  },

  clearKeyword() {
    if (this._keywordTimer) {
      clearTimeout(this._keywordTimer);
      this._keywordTimer = null;
    }

    this.setData({
      keyword: ''
    });
    this.loadTemplates();
  },

  selectTypeFilter(e) {
    const type = String(e.currentTarget.dataset.type || '');
    this.setData({
      typeFilter: this.data.typeFilter === type ? '' : type
    });
    this.loadTemplates();
  },

  scheduleTemplateReload() {
    if (this._keywordTimer) {
      clearTimeout(this._keywordTimer);
    }

    this._keywordTimer = setTimeout(() => {
      this._keywordTimer = null;
      this.loadTemplates();
    }, SEARCH_DEBOUNCE_MS);
  },

  onCreateTemplate() {
    wx.navigateTo({
      url: '/packageManage/pages/task-template-edit/task-template-edit?mode=create'
    });
  },

  onRetryLoad() {
    this.loadTemplates({ force: true });
  },

  onTapTemplateCard(e) {
    const templateId = e.currentTarget.dataset.id;
    const template = this.data.templates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    if (this.data.activeTab === TAB_SELECT) {
      this.onSelectTemplate(template);
      return;
    }

    this.openTemplateEditor(templateId);
  },

  openTemplateEditor(templateId) {
    if (!templateId) {
      return;
    }

    wx.navigateTo({
      url: `/packageManage/pages/task-template-edit/task-template-edit?mode=edit&templateId=${templateId}`
    });
  },

  onOpenTemplateActions(e) {
    const templateId = e.currentTarget.dataset.id;
    const template = this.data.templates.find((item) => item.id === templateId);
    if (!template || typeof wx.showActionSheet !== 'function') {
      return;
    }

    const toggleLabel = template.enabled ? '停用模板' : '启用模板';
    wx.showActionSheet({
      itemList: [toggleLabel, '删除模板'],
      success: async (result) => {
        if (result.tapIndex === 0) {
          await this.updateTemplateEnabled(templateId, template.enabled);
        }

        if (result.tapIndex === 1) {
          this.confirmDeleteTemplate(templateId);
        }
      }
    });
  },

  onSelectTemplate(templateOrEvent) {
    if (this.data.activeTab !== TAB_SELECT) {
      return;
    }

    const template = templateOrEvent?.currentTarget
      ? this.data.templates.find((item) => item.id === templateOrEvent.currentTarget.dataset.id)
      : templateOrEvent;
    if (!template) {
      return;
    }

    const eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (eventChannel && typeof eventChannel.emit === 'function') {
      eventChannel.emit('templateSelected', {
        template
      });
    }

    wx.navigateBack({
      delta: 1
    });
  },

  async updateTemplateEnabled(templateId, enabled) {
    const taskTemplateService = serviceManager.getService('taskTemplate');

    try {
      await taskTemplateService.setTemplateEnabled(templateId, !enabled);
      wx.showToast({
        title: !enabled ? '模板已启用' : '模板已停用',
        icon: 'success'
      });
      await this.loadTemplates({ force: true });
    } catch (error) {
      logger.error('TaskTemplateManage', '更新模板启停状态失败', error);
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
    }
  },

  confirmDeleteTemplate(templateId) {
    const taskTemplateService = serviceManager.getService('taskTemplate');

    wx.showModal({
      title: '删除模板',
      content: '删除后不会影响已通过该模板创建的任务，确认继续吗？',
      success: async (result) => {
        if (!result.confirm) {
          return;
        }

        try {
          await taskTemplateService.deleteTemplate(templateId);
          wx.showToast({
            title: '模板已删除',
            icon: 'success'
          });
          await this.loadTemplates({ force: true });
        } catch (error) {
          logger.error('TaskTemplateManage', '删除模板失败', error);
          wx.showToast({
            title: '删除失败',
            icon: 'none'
          });
        }
      }
    });
  }
});
