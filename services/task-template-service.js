const logger = require('../utils/logger');
const HttpClient = require('../utils/http-client');
const API_CONFIG = require('../utils/api-config');
const TaskTemplate = require('../models/task-template');
const TaskTemplateRepository = require('../repositories/task-template-repository');
const dateUtils = require('../utils/dateUtils');
const taskFormDisplay = require('../utils/task-form-display');
const { EVENTS } = require('../utils/constants');
const {
  normalizeDateString,
  normalizeDateStrategy
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
    const normalizedPayload = normalizedTemplate.taskPayload;
    const resolvedDates = this._resolveTemplateDates(normalizedTemplate, today);

    const newTask = {
      title: normalizedPayload.title,
      type: normalizedPayload.type,
      points: normalizedPayload.points,
      pointsExpiry: normalizedPayload.pointsExpiry,
      description: normalizedPayload.description,
      isRequired: normalizedPayload.isRequired,
      isAllDay: normalizedPayload.isAllDay,
      startDate: resolvedDates.startDate,
      startTime: normalizedPayload.startTime,
      endDate: resolvedDates.endDate,
      endTime: normalizedPayload.endTime,
      hasNoEndDate: resolvedDates.hasNoEndDate,
      repeat: {
        ...normalizedPayload.repeat,
        startDate: resolvedDates.repeatStartDate,
        endDate: resolvedDates.repeatEndDate
      },
      reminder: {
        ...normalizedPayload.reminder
      }
    };

    const displayState = taskFormDisplay.buildTaskFormDisplayState({
      ...newTask,
      startDate: today,
      repeat: {
        ...normalizedPayload.repeat
      },
      dateStrategy: normalizedTemplate.dateStrategy
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
    const cacheKey = JSON.stringify({
      recommendationContextKey,
      today,
      lookbackDays
    });
    const limit = Number.isInteger(Number(options.limit))
      ? Math.max(1, Number(options.limit))
      : null;
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
        total: cachedCandidates.length,
        cached: true
      };
    }

    if (this.enableCloudStorage && options.skipRefresh !== true) {
      await this._refreshTemplatesFromCloudSafely({
        force: options.force === true
      });
    }

    const templates = await this.repository.getAll();
    const tasks = await this._loadFamilyTasksForRecommendations();
    const candidates = groupTasksToTemplateCandidates(tasks, templates, {
      today,
      lookbackDays
    });

    this._recommendationCache = {
      key: cacheKey,
      createdAt: now,
      candidates
    };

    return {
      candidates: limit ? candidates.slice(0, limit) : candidates,
      total: candidates.length,
      cached: false
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
    if (!this.taskService || typeof this.taskService.getTasksByScope !== 'function') {
      logger.warn('TaskTemplateService', '任务服务未就绪，无法生成推荐候选');
      return [];
    }

    try {
      const tasks = await this.taskService.getTasksByScope({
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

  _resolveTemplateDates(template, today) {
    const payload = template.taskPayload || {};
    const strategy = normalizeDateStrategy(template.dateStrategy || {}, payload);
    const repeatType = payload.repeat?.type || 'none';
    const normalizedDurationDays = Number.isInteger(Number(strategy.durationDays))
      ? Math.max(1, Number(strategy.durationDays))
      : 1;
    let startDate = today;
    let endDate = today;
    let hasNoEndDate = false;

    if (repeatType !== 'none') {
      const repeatMatch = taskFormDisplay.resolveRepeatMatch({
        startDate: today,
        repeat: payload.repeat || {}
      }, repeatType);
      startDate = repeatMatch?.date
        ? dateUtils.formatDate(repeatMatch.date)
        : today;

      if (strategy.endMode === 'no-end') {
        endDate = '';
        hasNoEndDate = true;
      } else if (strategy.endMode === 'week-end') {
        endDate = dateUtils.formatDate(dateUtils.addDays(dateUtils.getFirstDayOfWeek(startDate, 1), 6));
      } else if (strategy.endMode === 'month-end') {
        endDate = dateUtils.formatDate(dateUtils.getLastDayOfMonth(startDate));
      } else {
        endDate = dateUtils.formatDate(dateUtils.addDays(startDate, normalizedDurationDays - 1));
      }
    }

    const repeatStartDate = startDate;
    const repeatEndDate = hasNoEndDate ? '' : endDate;

    return {
      startDate,
      endDate,
      hasNoEndDate,
      repeatStartDate,
      repeatEndDate
    };
  }
}

module.exports = TaskTemplateService;
