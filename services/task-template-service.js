const logger = require('../utils/logger');
const HttpClient = require('../utils/http-client');
const API_CONFIG = require('../utils/api-config');
const TaskTemplate = require('../models/task-template');
const TaskTemplateRepository = require('../repositories/task-template-repository');
const dateUtils = require('../utils/dateUtils');
const taskFormDisplay = require('../utils/task-form-display');
const taskFormCore = require('../utils/task-form-core');
const taskFormAdapter = require('../utils/task-form-adapter');
const { EVENTS } = require('../utils/constants');
const {
  normalizeDateString
} = require('../utils/task-template-utils');
const {
  buildTemplateDraftFromTask,
  buildTemplateDraftFromCandidate,
  groupTasksToTemplateCandidates
} = require('../utils/task-template-source');

const TEMPLATE_CLOUD_REFRESH_MIN_INTERVAL_MS = 3000;
const TEMPLATE_RECOMMENDATION_CACHE_TTL_MS = 30000;

class TaskTemplateService {
  constructor(options = {}) {
    this.repository = options.repository || new TaskTemplateRepository(options.storageAdapter);
    this.userService = options.userService || null;
    this.eventBus = options.eventBus || null;
    this.taskService = options.taskService || null;
    this.enableCloudStorage = API_CONFIG.ENABLE_API;
    this._lastCloudSyncAt = 0;
    this._cloudRefreshPromise = null;
    this._recommendationCache = null;
    this._taskEventUnsubscribers = [];
    this._bindTaskEvents();

    logger.info('TaskTemplateService', '初始化任务模板服务', {
      enableCloudStorage: this.enableCloudStorage
    });
  }

  updateUserService(userService) {
    this.userService = userService || null;
    this.invalidateRecommendationCache();
  }

  updateTaskService(taskService) {
    this.taskService = taskService || null;
    this.invalidateRecommendationCache();
  }

  async getTemplateById(templateId, options = {}) {
    if (!templateId) {
      return null;
    }

    if (this.enableCloudStorage && options.force === true) {
      await this._refreshTemplatesFromCloudSafely({ force: true });
    }

    return this.repository.getById(templateId);
  }

  async getRecentTemplates(limit = 5, options = {}) {
    if (this.enableCloudStorage && options.skipRefresh !== true) {
      await this._refreshTemplatesFromCloudSafely();
    }

    const templates = await this.repository.getRecentTemplates(limit);
    return {
      templates
    };
  }

  async getTemplates(options = {}) {
    if (this.enableCloudStorage && options.skipRefresh !== true) {
      await this._refreshTemplatesFromCloudSafely({
        force: options.force === true
      });
    }

    const templates = await this.repository.getTemplates(options);
    return {
      templates
    };
  }

  async createTemplate(input = {}) {
    const template = new TaskTemplate({
      ...input,
      familyId: input.familyId || this._getCurrentFamilyId(),
      createdByUserId: input.createdByUserId || this.userService?.getLoginUserId?.() || null,
      taskPayload: input.taskPayload || {},
      dateStrategy: input.dateStrategy || {}
    });

    const validationErrors = template.validate();
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join('；'));
    }

    let savedTemplate = template;
    if (this.enableCloudStorage) {
      const response = await HttpClient.post(API_CONFIG.ENDPOINTS.TASK_TEMPLATES, this._buildTemplateMutationPayload(template));
      savedTemplate = new TaskTemplate(response.template || response);
    }

    await this.repository.save(savedTemplate);
    this.invalidateRecommendationCache();
    return {
      success: true,
      template: savedTemplate
    };
  }

  async updateTemplate(templateId, input = {}) {
    const existingTemplate = await this.repository.getById(templateId);
    if (!existingTemplate) {
      throw new Error('模板不存在');
    }

    const existingTemplateData = existingTemplate.toJSON();
    const mergedTaskPayload = input.taskPayload === undefined
      ? (existingTemplateData.taskPayload || {})
      : {
          ...(existingTemplateData.taskPayload || {}),
          ...input.taskPayload
        };
    const mergedDateStrategy = input.dateStrategy === undefined
      ? (existingTemplateData.dateStrategy || {})
      : {
          ...(existingTemplateData.dateStrategy || {}),
          ...input.dateStrategy
        };

    const nextTemplate = new TaskTemplate({
      ...existingTemplateData,
      ...input,
      id: templateId,
      familyId: existingTemplateData.familyId || this._getCurrentFamilyId(),
      taskPayload: mergedTaskPayload,
      dateStrategy: mergedDateStrategy
    });

    const validationErrors = nextTemplate.validate();
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join('；'));
    }

    let savedTemplate = nextTemplate;
    if (this.enableCloudStorage) {
      const url = API_CONFIG.ENDPOINTS.TASK_TEMPLATE_BY_ID.replace('{templateId}', templateId);
      const response = await HttpClient.put(url, this._buildTemplateMutationPayload(nextTemplate));
      savedTemplate = new TaskTemplate(response.template || response);
    }

    await this.repository.save(savedTemplate);
    this.invalidateRecommendationCache();
    return {
      success: true,
      template: savedTemplate
    };
  }

  async setTemplateEnabled(templateId, enabled) {
    const template = await this.repository.getById(templateId);
    if (!template) {
      throw new Error('模板不存在');
    }

    let nextTemplate = template.clone({
      enabled: enabled === true,
      updatedAt: Date.now()
    });

    if (this.enableCloudStorage) {
      const url = API_CONFIG.ENDPOINTS.TASK_TEMPLATE_ENABLED.replace('{templateId}', templateId);
      const response = await HttpClient.patch(url, {
        enabled: enabled === true
      });
      nextTemplate = new TaskTemplate(response.template || response);
    }

    await this.repository.save(nextTemplate);
    this.invalidateRecommendationCache();
    return {
      success: true,
      template: nextTemplate
    };
  }

  async deleteTemplate(templateId) {
    if (!templateId) {
      throw new Error('模板不存在');
    }

    if (this.enableCloudStorage) {
      const url = API_CONFIG.ENDPOINTS.TASK_TEMPLATE_BY_ID.replace('{templateId}', templateId);
      await HttpClient.delete(url);
    }

    await this.repository.delete(templateId);
    this.invalidateRecommendationCache();
    return {
      success: true
    };
  }

  async recordTemplateUsage(templateId) {
    const template = await this.repository.getById(templateId);
    if (!template) {
      return {
        success: false
      };
    }

    let nextTemplate = template.clone({
      usageCount: Number(template.usageCount || 0) + 1,
      lastUsedAt: Date.now(),
      updatedAt: Date.now()
    });

    if (this.enableCloudStorage) {
      const url = API_CONFIG.ENDPOINTS.TASK_TEMPLATE_USAGE.replace('{templateId}', templateId);
      const response = await HttpClient.post(url, {});
      nextTemplate = new TaskTemplate(response.template || response);
    }

    await this.repository.save(nextTemplate);
    return {
      success: true,
      template: nextTemplate
    };
  }

  applyTemplateToTaskForm(template, context = {}) {
    const normalizedTemplate = template instanceof TaskTemplate
      ? template
      : new TaskTemplate(template);
    const today = normalizeDateString(context.today, dateUtils.getTodayString());
    const draft = taskFormAdapter.adaptTemplateEntityToDraft(normalizedTemplate.toJSON(), {
      today: normalizedTemplate.taskPayload?.startDate || today
    });
    const resolvedDates = this._resolveTemplateDates(draft, today);
    const newTask = taskFormAdapter.buildTaskEditPatchFromDraft({
      ...draft,
      scene: 'task',
      startDate: resolvedDates.startDate,
      endDate: resolvedDates.endDate,
      hasNoEndDate: resolvedDates.hasNoEndDate
    });
    const displayState = taskFormDisplay.buildTaskFormDisplayState({
      ...draft,
      startDate: today
    });

    return {
      formPatch: {
        newTask,
        repeatText: displayState.repeatText,
        reminderText: displayState.reminderText,
        pointsExpiryText: displayState.pointsExpiryText,
        repeatPreviewText: displayState.repeatPreviewText,
        repeatTypeWarning: displayState.repeatTypeWarning,
        weekdaySelection: displayState.weekdaySelection,
        repeatPanelMode: 'type',
        isRepeatOptionDisabled: displayState.isRepeatOptionDisabled,
        startDatePanel: false,
        endDatePanel: false,
        repeatPanel: false,
        reminderPanel: false,
        pointsExpiryPanel: false,
        selectedTemplateId: normalizedTemplate.id
      }
    };
  }

  async refreshTemplatesFromCloud(options = {}) {
    if (!this.enableCloudStorage) {
      return {
        success: true,
        templates: await this.repository.getAll()
      };
    }

    const now = Date.now();
    if (!options.force && this._cloudRefreshPromise) {
      return this._cloudRefreshPromise;
    }

    if (
      !options.force &&
      this._lastCloudSyncAt > 0 &&
      now - this._lastCloudSyncAt < TEMPLATE_CLOUD_REFRESH_MIN_INTERVAL_MS
    ) {
      return {
        success: true,
        templates: await this.repository.getAll()
      };
    }

    this._cloudRefreshPromise = (async () => {
      const response = await HttpClient.get(
        API_CONFIG.ENDPOINTS.TASK_TEMPLATES,
        this._buildTemplateListQueryParams(options)
      );
      const templates = Array.isArray(response.templates)
        ? response.templates.map((item) => new TaskTemplate(item))
        : [];

      await this.repository.replaceAll(templates);
      this.invalidateRecommendationCache();
      this._lastCloudSyncAt = Date.now();

      return {
        success: true,
        templates
      };
    })();

    try {
      return await this._cloudRefreshPromise;
    } finally {
      this._cloudRefreshPromise = null;
    }
  }

  invalidateRecommendationCache() {
    this._recommendationCache = null;
  }

  buildTemplateDraftFromTask(task, options = {}) {
    return buildTemplateDraftFromTask(task, options);
  }

  buildTemplateDraftFromCandidate(candidate, options = {}) {
    return buildTemplateDraftFromCandidate(candidate, options);
  }

  async getRecommendedTemplateCandidates(options = {}) {
    const today = normalizeDateString(options.today, dateUtils.getTodayString());
    const lookbackDays = Number.isInteger(Number(options.lookbackDays))
      ? Math.max(1, Number(options.lookbackDays))
      : 60;
    const recommendationContextKey = this._buildRecommendationContextKey();
    const limit = Number.isInteger(Number(options.limit))
      ? Math.max(1, Number(options.limit))
      : null;
    const cacheKey = JSON.stringify({
      recommendationContextKey,
      today,
      lookbackDays,
      limit
    });
    const now = Date.now();

    if (
      options.force !== true &&
      this._recommendationCache &&
      this._recommendationCache.key === cacheKey &&
      now - this._recommendationCache.createdAt < TEMPLATE_RECOMMENDATION_CACHE_TTL_MS
    ) {
      const cachedCandidates = this._recommendationCache.candidates || [];
      return {
        candidates: limit ? cachedCandidates.slice(0, limit) : cachedCandidates,
        total: this._recommendationCache.total ?? cachedCandidates.length,
        cached: true,
        source: this._recommendationCache.source || 'local'
      };
    }

    if (this.enableCloudStorage && options.skipRefresh !== true) {
      await this._refreshTemplatesFromCloudSafely({
        force: options.force === true
      });
    }

    let candidates = [];
    let total = 0;
    let source = 'local';

    if (this.enableCloudStorage) {
      try {
        const cloudResult = await this._queryRecommendationCandidatesFromCloud({
          today,
          lookbackDays,
          limit
        });
        candidates = Array.isArray(cloudResult.candidates) ? cloudResult.candidates : [];
        total = Number.isInteger(Number(cloudResult.total))
          ? Number(cloudResult.total)
          : candidates.length;
        source = 'cloud';
      } catch (error) {
        logger.warn('TaskTemplateService', '云端推荐候选查询失败，回退本地算法', {
          error: error && error.message ? error.message : error
        });
        const templates = await this.repository.getAll();
        const tasks = await this._loadFamilyTasksForRecommendations();
        candidates = groupTasksToTemplateCandidates(tasks, templates, {
          today,
          lookbackDays
        });
        total = candidates.length;
        source = 'local_fallback';
      }
    } else {
      const templates = await this.repository.getAll();
      const tasks = await this._loadFamilyTasksForRecommendations();
      candidates = groupTasksToTemplateCandidates(tasks, templates, {
        today,
        lookbackDays
      });
      total = candidates.length;
    }

    this._recommendationCache = {
      key: cacheKey,
      createdAt: now,
      candidates,
      total,
      source
    };

    return {
      candidates: limit ? candidates.slice(0, limit) : candidates,
      total,
      cached: false,
      source
    };
  }

  _buildTemplateMutationPayload(template) {
    return {
      name: template.name,
      description: template.description,
      taskPayload: template.taskPayload,
      dateStrategy: template.dateStrategy,
      enabled: template.enabled
    };
  }

  _buildRecommendationContextKey() {
    return JSON.stringify({
      familyId: this._getCurrentFamilyId() || '',
      loginUserId: this.userService?.getLoginUserId?.() || '',
      currentUserId: this.userService?.getCurrentUserId?.() || ''
    });
  }

  async _refreshTemplatesFromCloudSafely(options = {}) {
    try {
      return await this.refreshTemplatesFromCloud(options);
    } catch (error) {
      logger.warn('TaskTemplateService', '云端刷新模板失败，回退本地镜像缓存', {
        error: error && error.message ? error.message : error
      });
      return {
        success: false,
        templates: await this.repository.getAll()
      };
    }
  }

  _buildTemplateListQueryParams(options = {}) {
    const params = {};

    ['keyword', 'type', 'sortBy', 'status'].forEach((key) => {
      const value = options[key];
      if (value === undefined || value === null || value === '') {
        return;
      }
      params[key] = value;
    });

    return params;
  }

  _getCurrentFamilyId() {
    return this.userService?.getLoginUser?.()?.familyId || this.userService?.getCurrentUser?.()?.familyId || null;
  }

  _bindTaskEvents() {
    if (!this.eventBus || typeof this.eventBus.on !== 'function' || this._taskEventUnsubscribers.length > 0) {
      return;
    }

    [EVENTS.TASK_CREATED, EVENTS.TASK_UPDATED, EVENTS.TASK_DELETED].forEach((eventName) => {
      const unsubscribe = this.eventBus.on(eventName, () => {
        this.invalidateRecommendationCache();
      });
      if (typeof unsubscribe === 'function') {
        this._taskEventUnsubscribers.push(unsubscribe);
      }
    });
  }

  async _loadFamilyTasksForRecommendations() {
    const loadTasks = typeof this.taskService?.getChildTasksByScope === 'function'
      ? this.taskService.getChildTasksByScope.bind(this.taskService)
      : this.taskService?.getTasksByScope?.bind(this.taskService);

    if (typeof loadTasks !== 'function') {
      logger.warn('TaskTemplateService', '任务服务未就绪，无法生成推荐候选');
      return [];
    }

    try {
      const tasks = await loadTasks({
        scope: 'family'
      });
      return Array.isArray(tasks) ? tasks : [];
    } catch (error) {
      logger.warn('TaskTemplateService', '加载家庭任务失败，推荐候选回退为空', {
        error: error && error.message ? error.message : error
      });
      return [];
    }
  }

  async _queryRecommendationCandidatesFromCloud(options = {}) {
    const pendingTasks = await this._buildPendingLocalTaskSnapshots();
    return HttpClient.post(API_CONFIG.ENDPOINTS.TASK_TEMPLATE_RECOMMENDATIONS_QUERY, {
      today: options.today,
      lookbackDays: options.lookbackDays,
      limit: options.limit,
      localPendingTasks: pendingTasks
    });
  }

  async _buildPendingLocalTaskSnapshots() {
    const loadPendingTasks = typeof this.taskService?.getPendingLocalChildTasksByScope === 'function'
      ? this.taskService.getPendingLocalChildTasksByScope.bind(this.taskService)
      : this.taskService?.getPendingLocalTasksByScope?.bind(this.taskService);
    const localTasks = await loadPendingTasks?.({
      scope: 'family'
    });
    if (!Array.isArray(localTasks)) {
      return [];
    }

    return localTasks
      .filter((task) => task && (task.pendingSyncMeta || task.syncedToCloud !== true))
      .map((task) => this._buildPendingTaskSnapshot(task));
  }

  _buildPendingTaskSnapshot(task = {}) {
    return {
      id: task.id || task.taskId || null,
      title: String(task.title || '').trim(),
      description: String(task.description || '').trim(),
      type: task.type || 'habit',
      date: normalizeDateString(task.date, ''),
      startDate: normalizeDateString(task.startDate, ''),
      endDate: normalizeDateString(task.endDate, ''),
      startTime: task.startTime || '',
      endTime: task.endTime || '',
      hasNoEndDate: task.hasNoEndDate === true,
      isAllDay: task.isAllDay === true,
      isRequired: task.isRequired === true,
      points: task.points,
      pointsExpiry: task.pointsExpiry,
      repeat: task.repeat || null,
      reminder: task.reminder || null,
      modifyTime: task.modifyTime || null,
      createdAt: task.createdAt || task.createTime || null
    };
  }

  _resolveTemplateDates(template, today) {
    const draft = template instanceof TaskTemplate || template?.taskPayload
      ? taskFormAdapter.adaptTemplateEntityToDraft(
        template instanceof TaskTemplate ? template.toJSON() : template,
        { today }
      )
      : taskFormCore.normalizeTaskFormDraft(template, {
        scene: 'template',
        today
      });

    return taskFormCore.resolveTaskScheduleFromDraft(draft, {
      today
    });
  }
}

module.exports = TaskTemplateService;
