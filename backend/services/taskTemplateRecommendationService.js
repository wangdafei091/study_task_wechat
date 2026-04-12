const { createLogger } = require('../utils/logger');
const taskService = require('./taskService');
const taskTemplateService = require('./taskTemplateService');
const {
  addDays,
  formatDate,
  getTodayString,
  normalizeDateString,
  normalizeTaskPayload
} = require('../utils/task-template-utils');
const { groupTasksToRecommendationCandidates } = require('./task-template-recommendation/rules');

const logger = createLogger('TaskTemplateRecommendationService');

class TaskTemplateRecommendationService {
  async queryRecommendations(input = {}) {
    const familyId = input.familyId || null;
    if (!familyId) {
      throw this._createError('INVALID_PARAMS', '家庭信息缺失');
    }

    const today = input.today === undefined
      ? getTodayString()
      : normalizeDateString(input.today, '');
    if (!today) {
      throw this._createError('INVALID_PARAMS', 'today 参数非法');
    }

    let lookbackDays = 60;
    if (input.lookbackDays !== undefined && input.lookbackDays !== null && input.lookbackDays !== '') {
      if (!Number.isInteger(Number(input.lookbackDays)) || Number(input.lookbackDays) < 1) {
        throw this._createError('INVALID_PARAMS', 'lookbackDays 参数非法');
      }
      lookbackDays = Number(input.lookbackDays);
    }

    let limit = null;
    if (input.limit !== null && input.limit !== undefined && input.limit !== '') {
      if (!Number.isInteger(Number(input.limit)) || Number(input.limit) < 1) {
        throw this._createError('INVALID_PARAMS', 'limit 参数非法');
      }
      limit = Number(input.limit);
    }
    const localPendingTasks = this._normalizePendingTasks(input.localPendingTasks);
    const startDate = normalizeDateString(
      formatDate(addDays(today, -(lookbackDays - 1))),
      today
    );

    const [cloudTasks, templates] = await Promise.all([
      taskService.getTasksByFamily(familyId, {
        startDate,
        endDate: today
      }),
      taskTemplateService.listTemplates(familyId)
    ]);

    const mergedTasks = this.mergePendingTasks(cloudTasks, localPendingTasks);
    const candidates = groupTasksToRecommendationCandidates(mergedTasks, templates, {
      today,
      lookbackDays
    });
    const limitedCandidates = limit ? candidates.slice(0, limit) : candidates;

    logger.info('查询任务模板推荐候选成功', {
      familyId,
      cloudTaskCount: Array.isArray(cloudTasks) ? cloudTasks.length : 0,
      localPendingCount: localPendingTasks.length,
      candidateCount: limitedCandidates.length
    });

    return {
      candidates: limitedCandidates,
      total: candidates.length
    };
  }

  mergePendingTasks(cloudTasks = [], localPendingTasks = []) {
    const mergedById = new Map();
    const withoutIdTasks = [];

    (Array.isArray(cloudTasks) ? cloudTasks : []).forEach((task) => {
      const taskId = task?.taskId || task?.id || null;
      if (!taskId) {
        withoutIdTasks.push(task);
        return;
      }
      mergedById.set(taskId, task);
    });

    (Array.isArray(localPendingTasks) ? localPendingTasks : []).forEach((task) => {
      const taskId = task?.id || task?.taskId || null;
      if (!taskId) {
        withoutIdTasks.push(task);
        return;
      }
      mergedById.set(taskId, {
        ...mergedById.get(taskId),
        ...task
      });
    });

    return [
      ...Array.from(mergedById.values()),
      ...withoutIdTasks
    ];
  }

  _normalizePendingTasks(localPendingTasks) {
    if (localPendingTasks === undefined || localPendingTasks === null) {
      return [];
    }

    if (!Array.isArray(localPendingTasks)) {
      throw this._createError('INVALID_PARAMS', 'localPendingTasks 必须为数组');
    }

    return localPendingTasks
      .filter((task) => task && typeof task === 'object')
      .map((task) => {
        const fallbackDate = normalizeDateString(task.startDate, normalizeDateString(task.date, getTodayString()));
        const normalizedTaskPayload = normalizeTaskPayload({
          title: task.title,
          description: task.description,
          type: task.type,
          startDate: task.startDate || task.date,
          endDate: task.endDate || task.startDate || task.date,
          startTime: task.startTime,
          endTime: task.endTime,
          hasNoEndDate: task.hasNoEndDate === true,
          isAllDay: task.isAllDay === true,
          isRequired: task.isRequired === true,
          points: task.points,
          pointsExpiry: task.pointsExpiry,
          repeat: task.repeat || {},
          reminder: task.reminder || {}
        }, {
          defaultDate: fallbackDate
        });

        return {
          id: task.id || task.taskId || null,
          title: normalizedTaskPayload.title,
          description: normalizedTaskPayload.description,
          type: normalizedTaskPayload.type,
          date: normalizeDateString(task.date, normalizedTaskPayload.startDate),
          startDate: normalizedTaskPayload.startDate,
          endDate: normalizedTaskPayload.endDate,
          startTime: normalizedTaskPayload.startTime,
          endTime: normalizedTaskPayload.endTime,
          hasNoEndDate: normalizedTaskPayload.hasNoEndDate,
          isAllDay: normalizedTaskPayload.isAllDay,
          isRequired: normalizedTaskPayload.isRequired,
          points: normalizedTaskPayload.points,
          pointsExpiry: normalizedTaskPayload.pointsExpiry,
          repeat: normalizedTaskPayload.repeat,
          reminder: normalizedTaskPayload.reminder,
          modifyTime: task.modifyTime || null,
          createdAt: task.createdAt || null
        };
      });
  }

  _createError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }
}

module.exports = new TaskTemplateRecommendationService();
