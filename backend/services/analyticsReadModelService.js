const taskService = require('./taskService');
const starService = require('./starService');
const familyService = require('./familyService');
const starExpiryGovernanceService = require('./starExpiryGovernanceService');
const userReadModel = require('./analytics-read-model/userReadModel');
const familyReadModel = require('./analytics-read-model/familyReadModel');
const {
  filterRecordsByUserIds,
  filterTasksByUserIds,
  formatDate,
  getMonthDateRange
} = require('./analytics-read-model/common');
const { createLogger } = require('../utils/logger');

const logger = createLogger('AnalyticsReadModelService');
const AUTHORITY_SYNC_TTL_MS = 30 * 1000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

class AnalyticsReadModelService {
  constructor() {
    this._authoritySyncCache = new Map();
    this._authoritySyncInflight = new Map();
  }

  async queryReadModel(input = {}, viewer = {}) {
    const scope = input.scope;
    if (scope !== 'user' && scope !== 'family') {
      throw this._createError('INVALID_PARAMS', 'scope 参数非法');
    }

    const dateRange = getMonthDateRange(input.monthKey);
    if (!dateRange) {
      throw this._createError('INVALID_PARAMS', 'monthKey 参数非法');
    }

    const trendDays = this._normalizeTrendDays(input.trendDays);
    const nowTimestamp = Date.now();

    if (scope === 'family') {
      return {
        snapshot: await this._queryFamilyReadModel({
          childUserIds: input.childUserIds,
          monthKey: input.monthKey,
          trendDays,
          viewer,
          nowTimestamp,
          dateRange
        })
      };
    }

    return {
      snapshot: await this._queryUserReadModel({
        userId: input.userId,
        monthKey: input.monthKey,
        trendDays,
        viewer,
        nowTimestamp,
        dateRange
      })
    };
  }

  async queryTaskCompletionStats(input = {}, viewer = {}) {
    const scope = input.scope;
    const dateRange = this._normalizeDateRange(input.dateRange);

    if (scope === 'family') {
      if (!viewer.viewerUserId) {
        throw this._createError('INVALID_PARAMS', 'viewerUserId 缺失');
      }
      if (viewer.viewerRole !== 'parent' || !viewer.familyId) {
        throw this._createError('PERMISSION_DENIED', '仅家长可访问家庭分析数据');
      }

      const subjectUserIds = await this._resolveFamilySubjectUserIds(viewer.familyId, input.childUserIds);
      if (subjectUserIds.length === 0) {
        return { stats: this._buildTaskCompletionStats([], dateRange) };
      }

      const tasks = filterTasksByUserIds(
        await taskService.getTasksByFamily(viewer.familyId),
        subjectUserIds
      );

      return {
        stats: this._buildTaskCompletionStats(tasks, dateRange)
      };
    }

    if (scope !== 'user' || !input.userId) {
      throw this._createError('INVALID_PARAMS', 'scope 参数非法');
    }
    if (!viewer.viewerUserId) {
      throw this._createError('INVALID_PARAMS', 'viewerUserId 缺失');
    }

    const tasks = await taskService.getTasksByUser(input.userId);
    return {
      stats: this._buildTaskCompletionStats(tasks, dateRange)
    };
  }

  async queryUpcomingExpiry(input = {}, viewer = {}) {
    const scope = input.scope;
    const days = this._normalizePositiveDays(input.days, 7, 'days 参数非法');

    if (scope === 'family') {
      if (!viewer.viewerUserId) {
        throw this._createError('INVALID_PARAMS', 'viewerUserId 缺失');
      }
      if (viewer.viewerRole !== 'parent' || !viewer.familyId) {
        throw this._createError('PERMISSION_DENIED', '仅家长可访问家庭分析数据');
      }

      // 当前产品口径下，家庭分析页不展示“即将过期星星”列表，后端保持与前端既有行为一致。
      await this._resolveFamilySubjectUserIds(viewer.familyId, input.childUserIds);
      return { items: [] };
    }

    if (scope !== 'user' || !input.userId) {
      throw this._createError('INVALID_PARAMS', 'scope 参数非法');
    }
    if (!viewer.viewerUserId) {
      throw this._createError('INVALID_PARAMS', 'viewerUserId 缺失');
    }

    const groups = await starService.getStarGroupsByUser(input.userId);
    return {
      items: this._buildUpcomingExpiryItems(groups, days, Date.now())
    };
  }

  async queryTaskStarCalendar(input = {}, viewer = {}) {
    const scope = input.scope;

    if (scope === 'family') {
      if (!viewer.viewerUserId) {
        throw this._createError('INVALID_PARAMS', 'viewerUserId 缺失');
      }
      if (viewer.viewerRole !== 'parent' || !viewer.familyId) {
        throw this._createError('PERMISSION_DENIED', '仅家长可访问家庭分析数据');
      }

      const subjectUserIds = await this._resolveFamilySubjectUserIds(viewer.familyId, input.childUserIds);
      if (subjectUserIds.length === 0) {
        return { records: [] };
      }

      const tasks = filterTasksByUserIds(
        await taskService.getTasksByFamily(viewer.familyId),
        subjectUserIds
      );

      return {
        records: this._buildTaskStarCalendarRecords(tasks)
      };
    }

    if (scope !== 'user' || !input.userId) {
      throw this._createError('INVALID_PARAMS', 'scope 参数非法');
    }
    if (!viewer.viewerUserId) {
      throw this._createError('INVALID_PARAMS', 'viewerUserId 缺失');
    }

    const tasks = await taskService.getTasksByUser(input.userId);
    return {
      records: this._buildTaskStarCalendarRecords(tasks)
    };
  }

  async _queryUserReadModel({ userId, monthKey, trendDays, viewer, nowTimestamp, dateRange }) {
    if (!viewer.viewerUserId) {
      throw this._createError('INVALID_PARAMS', 'viewerUserId 缺失');
    }
    if (!userId) {
      throw this._createError('INVALID_PARAMS', 'userId 参数缺失');
    }

    await this._syncExpiryAuthorityIfNeeded(
      `user:${userId}`,
      {
        viewerUserId: viewer.viewerUserId,
        viewerRole: viewer.viewerRole,
        familyId: viewer.familyId || null,
        scope: 'user',
        targetUserId: userId
      },
      nowTimestamp
    );

    const [tasks, records, groups] = await Promise.all([
      taskService.getTasksByUser(userId, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      }),
      starService.getStarRecordsByUser(userId),
      starService.getStarGroupsByUser(userId)
    ]);

    logger.info('生成 user analytics read model', {
      userId,
      taskCount: tasks.length,
      recordCount: records.length,
      groupCount: groups.length
    });

    return userReadModel.buildSnapshot({
      userId,
      monthKey,
      days: trendDays,
      tasks,
      records,
      groups,
      nowTimestamp
    });
  }

  async _queryFamilyReadModel({ childUserIds, monthKey, trendDays, viewer, nowTimestamp, dateRange }) {
    if (!viewer.viewerUserId) {
      throw this._createError('INVALID_PARAMS', 'viewerUserId 缺失');
    }
    if (viewer.viewerRole !== 'parent' || !viewer.familyId) {
      throw this._createError('PERMISSION_DENIED', '仅家长可访问家庭分析读模型');
    }

    const subjectUserIds = await this._resolveFamilySubjectUserIds(viewer.familyId, childUserIds);

    if (subjectUserIds.length === 0) {
      return familyReadModel.buildSnapshot({
        subjectUserIds,
        monthKey,
        days: trendDays,
        tasks: [],
        records: [],
        groups: [],
        nowTimestamp
      });
    }

    await this._syncExpiryAuthorityIfNeeded(
      `family:${viewer.familyId}:${subjectUserIds.join(',')}`,
      {
        viewerUserId: viewer.viewerUserId,
        viewerRole: viewer.viewerRole,
        familyId: viewer.familyId,
        scope: 'family'
      },
      nowTimestamp
    );

    const [familyTasks, familyRecords, familySummary] = await Promise.all([
      taskService.getTasksByFamily(viewer.familyId, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      }),
      starService.getFamilyStarRecords(viewer.familyId),
      starService.getFamilyStarSummary(viewer.familyId)
    ]);

    const filteredTasks = filterTasksByUserIds(familyTasks, subjectUserIds);
    const filteredRecords = filterRecordsByUserIds(familyRecords, subjectUserIds);
    const filteredGroups = (familySummary.groups || []).filter((group) => subjectUserIds.includes(group.userId));

    logger.info('生成 family analytics read model', {
      familyId: viewer.familyId,
      subjectUserIds,
      taskCount: filteredTasks.length,
      recordCount: filteredRecords.length,
      groupCount: filteredGroups.length
    });

    return familyReadModel.buildSnapshot({
      subjectUserIds,
      monthKey,
      days: trendDays,
      tasks: filteredTasks,
      records: filteredRecords,
      groups: filteredGroups,
      nowTimestamp
    });
  }

  async _resolveFamilySubjectUserIds(familyId, childUserIds) {
    const members = await familyService.getFamilyMembers(familyId);
    const activeChildUserIds = members
      .filter((member) => member.role === 'child')
      .map((member) => member.userId)
      .filter(Boolean);

    if (childUserIds === undefined) {
      return activeChildUserIds;
    }

    if (!Array.isArray(childUserIds)) {
      throw this._createError('INVALID_PARAMS', 'childUserIds 必须为数组');
    }

    const requestedIds = Array.from(new Set(childUserIds.filter(Boolean)));
    if (requestedIds.length === 0) {
      return [];
    }

    const invalidUserId = requestedIds.find((userId) => !activeChildUserIds.includes(userId));
    if (invalidUserId) {
      throw this._createError('FAMILY_MEMBER_ACCESS_DENIED', 'childUserIds 包含无权访问的成员');
    }

    return requestedIds;
  }

  _normalizeTrendDays(value) {
    if (value === undefined || value === null || value === '') {
      return 7;
    }

    const normalized = Number(value);
    if (normalized !== 7 && normalized !== 30) {
      throw this._createError('INVALID_PARAMS', 'trendDays 参数非法');
    }

    return normalized;
  }

  _normalizeDateRange(value) {
    const normalized = String(value || 'today');
    if (!['today', 'week', 'month'].includes(normalized)) {
      throw this._createError('INVALID_PARAMS', 'dateRange 参数非法');
    }
    return normalized;
  }

  _normalizePositiveDays(value, defaultValue, errorMessage) {
    if (value === undefined || value === null || value === '') {
      return Number(defaultValue);
    }

    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized <= 0) {
      throw this._createError('INVALID_PARAMS', errorMessage);
    }

    return normalized;
  }

  _buildTaskCompletionStats(tasks = [], dateRange = 'today', nowTimestamp = Date.now()) {
    const filteredTasks = this._filterTasksByDateRange(tasks, dateRange, nowTimestamp);
    const totalTasks = filteredTasks.length;
    const completedTasks = filteredTasks.filter((task) => Number(task?.status) === 1).length;
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(1) : 0;

    return {
      totalTasks,
      completedTasks,
      completionRate,
      typeCounts: {
        study: filteredTasks.filter((task) => task?.type === 'study').length,
        habit: filteredTasks.filter((task) => task?.type === 'habit').length,
        interest: filteredTasks.filter((task) => task?.type === 'interest').length
      },
      statusCounts: {
        pending: filteredTasks.filter((task) => Number(task?.status) !== 1).length,
        completed: completedTasks
      }
    };
  }

  _filterTasksByDateRange(tasks = [], dateRange = 'today', nowTimestamp = Date.now()) {
    const normalizedTasks = Array.isArray(tasks) ? tasks : [];
    const today = this._formatShanghaiDate(nowTimestamp);

    if (dateRange === 'today') {
      return normalizedTasks.filter((task) => task?.date === today);
    }

    if (dateRange === 'week') {
      const weekStart = this._getShanghaiWeekStart(nowTimestamp);
      return normalizedTasks.filter((task) => task?.date && task.date >= weekStart);
    }

    const monthStart = `${today.slice(0, 7)}-01`;
    return normalizedTasks.filter((task) => task?.date && task.date >= monthStart);
  }

  _buildUpcomingExpiryItems(groups = [], days = 7, nowTimestamp = Date.now()) {
    const normalizedGroups = Array.isArray(groups) ? groups : [];
    const nowDate = new Date(nowTimestamp);
    const futureLimit = new Date(nowTimestamp);
    futureLimit.setDate(futureLimit.getDate() + Number(days));

    const items = normalizedGroups
      .filter((group) => group?.expiryType !== 'permanent' && group?.type !== 'permanent' && group?.expiryDate)
      .map((group) => {
        const expiryDate = new Date(group.expiryDate);
        if (Number.isNaN(expiryDate.getTime())) {
          return null;
        }
        if (expiryDate <= nowDate || expiryDate > futureLimit) {
          return null;
        }
        return {
          id: `expiry_group_${expiryDate.getTime()}`,
          points: Number(group.stars || 0),
          expiryDate,
          expiryDateStr: group.name || formatDate(expiryDate),
          type: group.type
        };
      })
      .filter(Boolean);

    items.sort((left, right) => left.expiryDate.getTime() - right.expiryDate.getTime());
    return items;
  }

  _buildTaskStarCalendarRecords(tasks = []) {
    const normalizedTasks = Array.isArray(tasks) ? tasks : [];
    const records = [];

    const completedTasks = normalizedTasks.filter((task) =>
      Number(task?.status) === 1 && task?.starAwarded === true
    );

    completedTasks.forEach((task) => {
      const timestamp = Number(task?.completionTime || task?.modifyTime || Date.now());
      records.push({
        id: `task_${task.taskId || task.id}_${timestamp}`,
        title: `完成任务：${task.title}`,
        time: this._formatDateTime(timestamp),
        timestamp,
        points: Number(task?.points || 0),
        type: 'income',
        source: 'task'
      });
    });

    const penaltyTasks = normalizedTasks.filter((task) =>
      task?.penaltyApplied === true && Number(task?.penaltyDeductedPoints || 0) > 0
    );

    penaltyTasks.forEach((task) => {
      const taskDate = task?.date || this._formatShanghaiDate(task?.modifyTime || Date.now());
      const taskDateTime = new Date(`${taskDate}T00:00:00`);
      records.push({
        id: `penalty_${task.taskId || task.id}_${taskDateTime.getTime()}`,
        title: `未完成必做任务：${task.title}`,
        time: `${taskDate} 00:00:00`,
        timestamp: taskDateTime.getTime(),
        points: -Number(task.penaltyDeductedPoints || 0),
        type: 'penalty',
        source: 'task'
      });
    });

    const makeupRefundTasks = normalizedTasks.filter((task) =>
      task?.penaltyRefunded === true &&
      Number(task?.penaltyDeductedPoints || 0) > 0 &&
      Number(task?.penaltyRefundTime || 0) > 0
    );

    makeupRefundTasks.forEach((task) => {
      const timestamp = Number(task.penaltyRefundTime || 0);
      records.push({
        id: `makeup_${task.taskId || task.id}_${timestamp}`,
        title: `逾期补做退星：${task.title}`,
        time: this._formatDateTime(timestamp),
        timestamp,
        points: Number(task.penaltyDeductedPoints || 0),
        type: 'income',
        source: 'task_makeup_refund'
      });
    });

    records.sort((left, right) => right.timestamp - left.timestamp);
    return records;
  }

  _formatDateTime(timestamp) {
    const shifted = new Date(Number(timestamp || Date.now()) + SHANGHAI_OFFSET_MS);
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')} ${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}:${String(shifted.getUTCSeconds()).padStart(2, '0')}`;
  }

  _formatShanghaiDate(timestamp = Date.now()) {
    return formatDate(Number(timestamp || Date.now()));
  }

  _getShanghaiWeekStart(nowTimestamp = Date.now()) {
    const shifted = new Date(Number(nowTimestamp || Date.now()) + SHANGHAI_OFFSET_MS);
    const weekday = shifted.getUTCDay();
    const midnightUtc = Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate()
    );
    const startTimestamp = midnightUtc - weekday * 24 * 60 * 60 * 1000;
    const startDate = new Date(startTimestamp);
    return `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}-${String(startDate.getUTCDate()).padStart(2, '0')}`;
  }

  async _syncExpiryAuthorityIfNeeded(cacheKey, options, nowTimestamp) {
    const cachedAt = Number(this._authoritySyncCache.get(cacheKey) || 0);
    if (nowTimestamp - cachedAt < AUTHORITY_SYNC_TTL_MS) {
      return {
        success: true,
        skipped: true,
        reason: 'authority_recently_synced'
      };
    }

    const inflight = this._authoritySyncInflight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const request = starExpiryGovernanceService.syncExpiryAuthority(options)
      .then((result) => {
        this._authoritySyncCache.set(cacheKey, nowTimestamp);
        return result;
      })
      .finally(() => {
        this._authoritySyncInflight.delete(cacheKey);
      });

    this._authoritySyncInflight.set(cacheKey, request);
    return request;
  }

  _createError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }
}

module.exports = new AnalyticsReadModelService();
