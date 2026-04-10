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
    return '';
  }

  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) {
    return '';
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

function buildTemplateDescription(template = {}) {
  const templateDescription = String(template.description || '').trim();
  if (templateDescription) {
    return templateDescription;
  }

  return String(template.taskPayload?.description || '').trim();
}

function buildMetaItems({ repeatLabel, timeLabel, reminderLabel, validityLabel }, activeTab, reminderEnabled) {
  const items = [
    {
      key: 'repeat',
      label: '重复',
      value: repeatLabel || '不重复'
    },
    {
      key: 'time',
      label: '时间',
      value: timeLabel || '--'
    }
  ];

  if (activeTab === TAB_SELECT) {
    if (reminderEnabled && reminderLabel) {
      items.push({
        key: 'reminder',
        label: '提醒',
        value: reminderLabel
      });
    } else if (validityLabel) {
      items.push({
        key: 'validity',
        label: '有效期',
        value: validityLabel
      });
    }
    return items;
  }

  return items.concat([
    {
      key: 'reminder',
      label: '提醒',
      value: reminderLabel || '不提醒'
    },
    {
      key: 'validity',
      label: '有效期',
      value: validityLabel || '默认当天完成'
    }
  ]);
}

function buildUsageSummary(template = {}) {
  const usageCount = Math.max(0, Number(template.usageCount || 0));
  const lastUsedText = formatTimestamp(template.lastUsedAt);

  if (usageCount > 0 && lastUsedText) {
    return `已使用 ${usageCount} 次 · 最近使用 ${lastUsedText}`;
  }

  if (usageCount > 0) {
    return `已使用 ${usageCount} 次`;
  }

  if (lastUsedText) {
    return `最近使用 ${lastUsedText}`;
  }

  return '';
}

function decorateTemplate(template, activeTab = TAB_SELECT) {
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
  const reminderEnabled = form.reminder?.enabled === true;
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
  const repeatLabel = displayState.repeatText || '不重复';
  const reminderLabel = displayState.reminderText;
  const timeLabel = payload.isAllDay ? '全天' : `${payload.startTime || '--:--'} - ${payload.endTime || '--:--'}`;

  return {
    ...template,
    displayName,
    typeLabel: getTypeLabel(payload.type),
    typeClass: payload.type || 'habit',
    repeatLabel,
    reminderLabel,
    timeLabel,
    validityLabel,
    statusLabel: template.enabled ? '启用中' : '已停用',
    primaryDescription: buildTemplateDescription(template),
    metaItems: buildMetaItems({
      repeatLabel,
      timeLabel,
      reminderLabel,
      validityLabel
    }, activeTab, reminderEnabled),
    usageSummary: activeTab === TAB_MANAGE ? buildUsageSummary(template) : ''
  };
}

function decorateRecommendationCandidate(candidate) {
  const payload = candidate.taskPayload || {};
  const form = {
    ...payload,
    repeat: payload.repeat || { type: 'none', days: [] },
    reminder: payload.reminder || { enabled: false, time: 0 },
    hasNoEndDate: payload.hasNoEndDate === true
  };
  const displayState = taskFormDisplay.buildTaskFormDisplayState(form, {
    ignoreRepeatOptionDisabled: true
  });
  const strategy = normalizeDateStrategy(candidate.dateStrategy || {}, payload);
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
  const repeatLabel = displayState.repeatText || '不重复';
  const timeLabel = payload.isAllDay === true ? '全天' : `${payload.startTime || '--:--'} - ${payload.endTime || '--:--'}`;
  const reminderLabel = displayState.reminderText;

  return {
    ...candidate,
    displayName: String(candidate.displayName || payload.title || '').trim(),
    typeClass: payload.type || 'habit',
    metaItems: buildMetaItems({
      repeatLabel,
      timeLabel,
      reminderLabel,
      validityLabel
    }, TAB_SELECT, form.reminder?.enabled === true)
  };
}

function filterSuppressedRecommendations(candidates = [], suppressedKeys) {
  if (!(suppressedKeys instanceof Set) || suppressedKeys.size === 0) {
    return Array.isArray(candidates) ? candidates : [];
  }

  return (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => !suppressedKeys.has(candidate.candidateKey));
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
    hasActiveFilters: false,
    recommendedCandidates: [],
    recommendationCount: 0,
    recommendationExpanded: false,
    showSearchTools: true
  },

  onLoad(options = {}) {
    this._suppressedRecommendationCandidateKeys = new Set();
    this._forceReloadOnShow = false;
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
      activeTab,
      loading: true,
      showSearchTools: true
    });

    if (typeof wx.setNavigationBarTitle === 'function') {
      wx.setNavigationBarTitle({
        title: '任务模板'
      });
    }
  },

  onShow() {
    const force = this._forceReloadOnShow === true;
    this._forceReloadOnShow = false;
    this.loadTemplates({ force });
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

    if (options.force === true && this._suppressedRecommendationCandidateKeys instanceof Set) {
      this._suppressedRecommendationCandidateKeys.clear();
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
      loadFailed: false,
      recommendedCandidates: [],
      recommendationCount: 0,
      recommendationExpanded: false
    });

    try {
      const recommendationPromise = activeTab === TAB_MANAGE &&
        typeof taskTemplateService.getRecommendedTemplateCandidates === 'function'
        ? taskTemplateService.getRecommendedTemplateCandidates({
            limit: 5,
            force: options.force === true
          })
        : Promise.resolve({
            candidates: [],
            total: 0
          });
      const [result, recommendationResult] = await Promise.all([
        taskTemplateService.getTemplates({
          keyword,
          type: typeFilter || 'all',
          status: 'all',
          sortBy: 'recent',
          force: options.force === true
        }),
        recommendationPromise
      ]);

      if (requestId !== this._loadRequestSeq) {
        return;
      }

      const decoratedTemplates = (result.templates || [])
        .map((template) => decorateTemplate(template, activeTab));
      const visibleTemplates = activeTab === TAB_SELECT
        ? decoratedTemplates.filter((template) => template.enabled === true)
        : decoratedTemplates;
      const templates = sortTemplates(visibleTemplates, activeTab);
      const recommendedCandidates = Array.isArray(recommendationResult?.candidates)
        ? recommendationResult.candidates.map(decorateRecommendationCandidate)
        : [];
      const visibleRecommendedCandidates = filterSuppressedRecommendations(
        recommendedCandidates,
        this._suppressedRecommendationCandidateKeys
      );
      const recommendationCount = visibleRecommendedCandidates.length;
      const hasTemplates = templates.length > 0;
      const recommendationExpanded = activeTab === TAB_MANAGE && recommendationCount > 0
        ? (
            this.data.recommendationExpanded === true
          )
        : false;

      this.setData({
        templates,
        hasTemplates,
        hasAnyTemplates: decoratedTemplates.length > 0,
        hasActiveFilters,
        recommendedCandidates: visibleRecommendedCandidates,
        recommendationCount,
        recommendationExpanded,
        showSearchTools: activeTab === TAB_SELECT
          ? true
          : (hasTemplates || hasActiveFilters),
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
      loading: true,
      keyword: '',
      typeFilter: '',
      templates: [],
      hasTemplates: false,
      hasAnyTemplates: false,
      recommendedCandidates: [],
      recommendationCount: 0,
      recommendationExpanded: false,
      showSearchTools: true,
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

  toggleRecommendationSection() {
    if (this.data.recommendationCount <= 0) {
      return;
    }

    this.setData({
      recommendationExpanded: !this.data.recommendationExpanded
    });
  },

  onSaveRecommendedCandidate(e) {
    const candidateKey = e.currentTarget.dataset.key;
    const candidate = this.data.recommendedCandidates.find((item) => item.candidateKey === candidateKey);
    if (!candidate) {
      return;
    }

    const taskTemplateService = serviceManager.getService('taskTemplate');
    if (!taskTemplateService) {
      wx.showToast({
        title: '模板服务未就绪',
        icon: 'none'
      });
      return;
    }

    try {
      const draft = taskTemplateService.buildTemplateDraftFromCandidate(candidate, {
        sourceType: 'template-manage-candidate'
      });

      wx.navigateTo({
        url: '/packageManage/pages/task-template-edit/task-template-edit?mode=create',
        success: (res) => {
          const eventChannel = res.eventChannel;
          if (eventChannel && typeof eventChannel.on === 'function') {
            eventChannel.on('templateSaved', (payload = {}) => {
              const savedCandidateKey = String(
                payload?.sourceMeta?.candidateKey || candidateKey || ''
              ).trim();
              if (!savedCandidateKey) {
                return;
              }

              this.suppressRecommendationCandidate(savedCandidateKey);
              this._forceReloadOnShow = true;
            });
          }
          if (eventChannel && typeof eventChannel.emit === 'function') {
            eventChannel.emit('templateDraftReady', {
              draft
            });
          }
        }
      });
    } catch (error) {
      logger.warn('TaskTemplateManage', '打开推荐模板草稿失败', error);
      wx.showToast({
        title: '推荐草稿生成失败',
        icon: 'none'
      });
    }
  },

  suppressRecommendationCandidate(candidateKey) {
    const normalizedKey = String(candidateKey || '').trim();
    if (!normalizedKey) {
      return;
    }

    if (!(this._suppressedRecommendationCandidateKeys instanceof Set)) {
      this._suppressedRecommendationCandidateKeys = new Set();
    }
    this._suppressedRecommendationCandidateKeys.add(normalizedKey);

    const recommendedCandidates = (this.data.recommendedCandidates || [])
      .filter((item) => item.candidateKey !== normalizedKey);
    const recommendationCount = recommendedCandidates.length;

    this.setData({
      recommendedCandidates,
      recommendationCount,
      recommendationExpanded: recommendationCount > 0 && this.data.recommendationExpanded === true
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
