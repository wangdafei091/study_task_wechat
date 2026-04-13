/**
 * analytics-service.js - 分析服务
 *
 * 提供数据分析相关功能，包括星星记录分析、任务完成情况统计等
 */

const logger = require('../utils/logger.js');
const dateUtils = require('../utils/dateUtils.js');
const HttpClient = require('../utils/http-client');
const API_CONFIG = require('../utils/api-config');
const EventBus = require('../utils/core/event-bus');
const { EVENTS } = require('../utils/constants.js');
const { Task } = require('../models/task');
const { StarRecord } = require('../models/star-record');

class AnalyticsService {
  /**
   * 构造函数
   * @param {Object} options 选项
   * @param {StarService} options.starService 星星服务
   * @param {TaskService} options.taskService 任务服务
   * @param {EventBus} options.eventBus 事件总线
   */
  constructor(options = {}) {
    // 关联服务
    this.starService = options.starService;
    this.taskService = options.taskService;

    // 事件总线
    this.eventBus = options.eventBus || new EventBus();
    this.prepareSnapshotTtlMs = Number(options.prepareSnapshotTtlMs || 30 * 1000);
    this._preparedSnapshots = new Map();
    this._prepareInflight = new Map();
    this._latestPreparedSignatures = new Map();
    this._installInvalidationListeners();

    logger.info('AnalyticsService', '初始化分析服务');
  }

  _installInvalidationListeners() {
    if (!this.eventBus || typeof this.eventBus.on !== 'function') {
      return;
    }

    const invalidate = () => this.invalidatePreparedSnapshots();
    [
      EVENTS.TASK_CREATED,
      EVENTS.TASK_UPDATED,
      EVENTS.TASK_DELETED,
      EVENTS.TASK_STATUS_UPDATED,
      EVENTS.STARS_ADDED,
      EVENTS.STARS_CONSUMED,
      EVENTS.STARS_EXPIRED
    ].forEach((eventName) => {
      this.eventBus.on(eventName, invalidate);
    });
  }

  invalidatePreparedSnapshots() {
    this._preparedSnapshots.clear();
    this._latestPreparedSignatures.clear();
  }

  /**
   * 获取任务星星日历数据
   * 只获取任务完成获得的星星和未完成必做任务扣除的星星
   * @returns {Promise<Array>} 记录数组
   */
  async getTaskStarCalendarData(options = {}) {
    logger.info('AnalyticsService', '开始获取任务星星日历数据', options);

    try {
      const context = this._resolveAnalysisContext(options);
      if (this._canUseCloudScopedAnalyticsQuery(context)) {
        try {
          const response = await HttpClient.post(
            API_CONFIG.ENDPOINTS.ANALYTICS_TASK_STAR_CALENDAR_QUERY,
            this._buildScopedAnalyticsPayload(context, {}, options)
          );
          return Array.isArray(response?.records) ? response.records : [];
        } catch (cloudError) {
          logger.warn('AnalyticsService', '任务星星日历查询走云端 authoritative 失败，回退本地', {
            scope: context.scope,
            userId: context.userId || null,
            error: cloudError.message
          });
        }
      }

      return this._getTaskStarCalendarDataLocal(options);
    } catch (error) {
      logger.error('AnalyticsService', '获取任务星星日历数据失败', error);
      return [];
    }
  }

  async _getTaskStarCalendarDataLocal(options = {}) {
    try {
      const familyChildUserIds = this._resolveFamilyChildUserIds(options);
      // 使用 getTasksByScope 支持 userId 和 scope=family 两种场景
      const tasks = options.scope === 'family'
        ? this._filterTasksByResolvedChildUserIds(
          await this.taskService.getTasksByScope(options),
          familyChildUserIds
        )
        : this._filterTasksByChildUserIds(
          await this.taskService.getTasksByScope(options),
          options.childUserIds
        );

      const records = [];

      // 获取已完成任务记录中的星星获取记录
      const completedTasks = tasks.filter((task) =>
        task.isCompleted() && task.starAwarded === true
      );

      logger.info('AnalyticsService', `从${completedTasks.length}个已完成任务中获取星星记录`);

      // 将任务完成记录转换为星星记录
      completedTasks.forEach((task) => {
        const timestamp = task.completionTime || task.modifyTime || Date.now();

        const date = new Date(timestamp);
        const timeStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;

        records.push({
          id: `task_${task.id}_${timestamp}`,
          title: `完成任务：${task.title}`,
          time: timeStr,
          timestamp,
          points: task.points || 0,
          type: 'income',
          source: 'task'
        });
      });

      // 获取未完成必做任务的惩罚记录中的星星扣除记录
      const penaltyTasks = tasks.filter((task) =>
        task.penaltyApplied === true && Number(task.penaltyDeductedPoints || 0) > 0
      );

      logger.info('AnalyticsService', `从${penaltyTasks.length}个未完成必做任务中获取星星扣除记录`);

      // 将未完成必做任务记录转换为星星扣除记录
      penaltyTasks.forEach((task) => {
        // 使用任务原始截止日期而不是惩罚执行日期
        let taskDate = task.date;
        if (!taskDate) {
          // 如果任务没有date字段，使用修改时间作为兜底
          taskDate = dateUtils.formatDate(new Date(task.modifyTime || Date.now()));
        }

        // 构造扣星记录，日期归属到任务原始截止日期
        const taskDateTime = new Date(`${taskDate}T00:00:00`);
        const timeStr = `${taskDate} 00:00:00`;

        records.push({
          id: `penalty_${task.id}_${taskDateTime.getTime()}`,
          title: `未完成必做任务：${task.title}`,
          time: timeStr,
          timestamp: taskDateTime.getTime(),
          points: -Number(task.penaltyDeductedPoints || 0),
          type: 'penalty',
          source: 'task'
        });
      });

      const makeupRefundTasks = tasks.filter((task) =>
        task.penaltyRefunded === true &&
        Number(task.penaltyDeductedPoints || 0) > 0 &&
        Number(task.penaltyRefundTime || 0) > 0
      );

      makeupRefundTasks.forEach((task) => {
        const timestamp = Number(task.penaltyRefundTime || 0);
        const date = new Date(timestamp);
        const timeStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;

        records.push({
          id: `makeup_${task.id}_${timestamp}`,
          title: `逾期补做退星：${task.title}`,
          time: timeStr,
          timestamp,
          points: Number(task.penaltyDeductedPoints || 0),
          type: 'income',
          source: 'task_makeup_refund'
        });
      });

      // 按时间戳排序，最新的在前面
      records.sort((a, b) => b.timestamp - a.timestamp);

      logger.info('AnalyticsService', `获取到${records.length}条任务星星记录（${completedTasks.length}条获得，${penaltyTasks.length}条扣除，${makeupRefundTasks.length}条补做退回）`);

      return records;
    } catch (error) {
      logger.error('AnalyticsService', '获取任务星星日历数据失败', error);
      return [];
    }
  }

  async prepareReadModel({ analysisOptions = {}, monthKey, days = 7, force = false } = {}) {
    const context = this._resolveAnalysisContext(analysisOptions);
    const normalizedMonthKey = monthKey || dateUtils.formatDate(new Date()).slice(0, 7);
    const normalizedDays = Number(days || 7);
    const signature = this._buildAnalysisSignature(context, normalizedMonthKey, normalizedDays);
    const scopeKey = this._buildAnalysisScopeKey(context);
    const cachedSnapshot = this._preparedSnapshots.get(signature);

    if (!force && cachedSnapshot && Number(cachedSnapshot.expiresAt || 0) > Date.now()) {
      this._latestPreparedSignatures.set(scopeKey, signature);
      return { success: true, snapshot: cachedSnapshot, fallback: cachedSnapshot.mode === 'fallback' };
    }

    const inFlight = this._prepareInflight.get(signature);
    if (inFlight) {
      return inFlight;
    }

    const request = this._prepareReadModelInternal({
      context,
      monthKey: normalizedMonthKey,
      days: normalizedDays,
      signature
    }).then((result) => {
      if (result && result.snapshot) {
        this._preparedSnapshots.set(signature, result.snapshot);
        this._latestPreparedSignatures.set(scopeKey, signature);
      }
      return result;
    }).finally(() => {
      this._prepareInflight.delete(signature);
    });

    this._prepareInflight.set(signature, request);
    return request;
  }

  getPreparedMonthData({ analysisOptions = {}, monthKey } = {}) {
    const snapshot = this._findPreparedSnapshot(analysisOptions, monthKey);
    if (!snapshot) {
      return null;
    }

    return {
      tasks: snapshot.tasks || [],
      records: snapshot.records || [],
      refreshedAt: snapshot.refreshedAt || 0,
      fallback: snapshot.mode === 'fallback'
    };
  }

  _findPreparedSnapshot(analysisOptions = {}, monthKey = null) {
    const now = Date.now();
    const context = this._resolveAnalysisContext(analysisOptions);
    const scopeKey = this._buildAnalysisScopeKey(context);
    const latestSignature = this._latestPreparedSignatures.get(scopeKey);
    const latestSnapshot = latestSignature ? this._preparedSnapshots.get(latestSignature) : null;
    const isSnapshotActive = (snapshot) => snapshot && Number(snapshot.expiresAt || 0) > now;

    if (isSnapshotActive(latestSnapshot) && (!monthKey || latestSnapshot.monthKey === monthKey)) {
      return latestSnapshot;
    }

    if (!monthKey) {
      return null;
    }

    for (const snapshot of this._preparedSnapshots.values()) {
      if (isSnapshotActive(snapshot) && snapshot.scopeKey === scopeKey && snapshot.monthKey === monthKey) {
        return snapshot;
      }
    }

    return null;
  }

  async _prepareReadModelInternal({ context, monthKey, days, signature }) {
    const cloudEnabled = this._isCloudEnabled();

    if (!cloudEnabled) {
      const snapshot = await this._buildLocalPreparedSnapshot({
        context,
        monthKey,
        days,
        signature,
        reason: 'local_mode'
      });
      return { success: true, fallback: true, snapshot };
    }

    try {
      if (
        context.scope === 'user' &&
        context.userId &&
        await this.starService.hasPendingLocalStarRecords(context.userId)
      ) {
        const snapshot = await this._buildLocalPreparedSnapshot({
          context,
          monthKey,
          days,
          signature,
          reason: 'pending_local_overlay'
        });
        return { success: true, fallback: true, snapshot };
      }

      const snapshot = await this._queryPreparedSnapshotFromCloud({
        context,
        monthKey,
        days,
        signature
      });
      return { success: true, fallback: false, snapshot };
    } catch (error) {
      logger.warn('AnalyticsService', 'prepareReadModel 云端主路径失败，回退本地快照', {
        scope: context.scope,
        userId: context.userId || null,
        error: error.message
      });
      const snapshot = await this._buildLocalPreparedSnapshot({
        context,
        monthKey,
        days,
        signature,
        reason: 'cloud_failed'
      });
      return { success: true, fallback: true, snapshot };
    }
  }

  /**
   * 获取所有星星记录（包括获取、消费和过期）
   * @returns {Promise<Array>} 星星记录数组
   */
  async getAllStarRecords() {
    try {
      logger.info('AnalyticsService', '获取所有星星记录');

      if (!this.starService) {
        logger.error('AnalyticsService', '无法获取星星服务实例');
        return [];
      }

      // 从星星服务获取记录
      const records = await this.starService.getStarRecords();

      logger.info('AnalyticsService', `获取到${records.length}条星星记录`);
      return records;
    } catch (error) {
      logger.error('AnalyticsService', '获取星星记录出错', error);
      return [];
    }
  }

  /**
   * 计算日期范围，确保生成合适的历史日期范围
   * @param {Number} days 天数
   * @returns {Object} 包含开始日期、结束日期和格式化日期数组的对象
   * @private
   */
  _calculateDateRange(days) {
    logger.info('AnalyticsService', `计算${days}天的日期范围`);

    // 计算日期范围，确保是过去的days天，而不是将来的
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);

    logger.info('AnalyticsService', `日期范围: ${dateUtils.formatDate(startDate)} 至 ${dateUtils.formatDate(endDate)}`);

    // 生成日期序列
    const dateArray = [];
    const formattedDates = [];

    // 初始化每一天的日期
    for (let i = 0; i < days; i += 1) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      const dateStr = dateUtils.formatDate(currentDate);
      dateArray.push(dateStr);

      // 格式化为MM/DD格式显示
      const month = currentDate.getMonth() + 1;
      const day = currentDate.getDate();
      formattedDates.push(`${month}/${day}`);
    }

    return {
      startDate,
      endDate,
      dateArray,
      formattedDates
    };
  }

  /**
   * 计算历史每日可用星星余额
   * @param {Number} days 历史天数（7或30）
   * @param {String|null} userId 单用户分析时的用户ID
   * @param {Object} options 分析选项
   * @param {String} options.scope 分析范围，支持 `user` / `family`
   * @returns {Promise<Object>} 历史余额数据和预测数据
   */
  async calculateHistoricalBalance(days, userId = null, options = {}) {
    const scope = options.scope || (userId ? 'user' : null);
    logger.info('AnalyticsService', `计算最近${days}天的可用星星余额`, { userId, scope });

    try {
      if (scope !== 'user' && scope !== 'family') {
        logger.warn('AnalyticsService', '分析范围无效，返回空趋势数据', {
          userId,
          scope
        });
        return {
          historyData: [],
          forecastData: []
        };
      }

      const preparedSnapshot = this._findPreparedSnapshot(
        scope === 'family'
          ? {
            scope: 'family',
            childUserIds: options.childUserIds
          }
          : {
            userId: userId || options.userId || null
          }
      );

      if (
        preparedSnapshot &&
        preparedSnapshot.mode === 'authoritative' &&
        Number(preparedSnapshot.days || 0) === Number(days || 7) &&
        Array.isArray(preparedSnapshot.historyData) &&
        Array.isArray(preparedSnapshot.forecastData)
      ) {
        return {
          historyData: preparedSnapshot.historyData,
          forecastData: preparedSnapshot.forecastData
        };
      }

      let records = [];
      let starGroups = [];
      let historyData = [];
      let currentBalance = 0;

      if (scope === 'user' && userId) {
        [records, starGroups] = await Promise.all([
          this.starService.getStarRecords({ userId }),
          this.starService.getStarGroups(userId)
        ]);

        currentBalance = this._sumStarGroups(starGroups);
        historyData = this._calculateAnchoredDailyBalance(records || [], days, currentBalance);

        const recordsBalance = this._sumRecordNetPoints(records || []);
        const difference = Number(recordsBalance) - Number(currentBalance);
        if (difference !== 0) {
          logger.warn('AnalyticsService', '检测到星星流水净额与活跃分组快照不一致，趋势图将以当前活跃分组为准', {
            userId,
            recordsBalance,
            groupsBalance: currentBalance,
            difference
          });
        }
      } else if (scope === 'family') {
        records = this._filterRecordsByChildUserIds(
          await this.getAllStarRecords(),
          options.childUserIds
        );
        const familySnapshot = this._findPreparedSnapshot(options);
        if (familySnapshot && familySnapshot.scope === 'family') {
          starGroups = this._flattenFamilyGroupSnapshots(familySnapshot.familyGroupSnapshots);
          currentBalance = Number(familySnapshot.currentBalance || 0);
        } else {
          const resolvedChildUserIds = this._resolveFamilyChildUserIds(options);
          const familyGroups = await Promise.all(
            (resolvedChildUserIds || []).map((childId) => this.starService.getStarGroups(childId))
          );
          starGroups = familyGroups.flat().filter(Boolean);
          currentBalance = this._sumStarGroups(starGroups);
        }

        if (!records || records.length === 0) {
          logger.warn('AnalyticsService', '没有星星记录，返回空数据');
          return {
            historyData: [],
            forecastData: []
          };
        }

        historyData = this._calculateAnchoredDailyBalance(records || [], days, currentBalance);
      }

      if (historyData.length === 0) {
        logger.warn('AnalyticsService', '没有可用于绘制趋势图的历史数据');
        return {
          historyData: [],
          forecastData: []
        };
      }

      // 计算预测数据
      const forecastData = await this._calculateExpiryForecast(currentBalance, {
        userId,
        scope,
        starGroups
      });

      logger.info('AnalyticsService', `余额计算完成，历史数据: ${historyData.length}项，预测数据: ${forecastData.length}项`);

      return {
        historyData,
        forecastData
      };
    } catch (error) {
      logger.error('AnalyticsService', '计算历史余额出错', error);
      return {
        historyData: [],
        forecastData: []
      };
    }
  }

  /**
   * 基于当前活跃分组余额反推历史每日余额，确保趋势图最后一个点与当前可用星星一致
   * @param {Array} records 星星记录数组
   * @param {Number} days 历史天数
   * @param {Number} currentBalance 当前活跃分组总余额
   * @returns {Array} 每日余额数据
   * @private
   */
  _calculateAnchoredDailyBalance(records, days, currentBalance) {
    logger.info('AnalyticsService', `基于当前余额锚点反推${days}天的每日余额变化`, {
      currentBalance: Number(currentBalance || 0)
    });

    const { dateArray, formattedDates } = this._calculateDateRange(days);
    const dailySummary = {};

    dateArray.forEach((dateStr) => {
      dailySummary[dateStr] = {
        delta: 0,
        earned: 0,
        spent: 0,
        penalty: 0
      };
    });

    (records || []).forEach((record) => {
      if (!record || !record.timestamp) {
        return;
      }

      const recordDateStr = this._getRecordDateString(record);
      if (!dailySummary[recordDateStr]) {
        return;
      }

      const points = Number(record.points || 0);
      dailySummary[recordDateStr].delta += points;

      if (points > 0) {
        dailySummary[recordDateStr].earned += points;
      } else if (points < 0) {
        if (record.source === 'task' && record.type === 'expense' && record.originalTaskDate) {
          dailySummary[recordDateStr].penalty += Math.abs(points);
        } else {
          dailySummary[recordDateStr].spent += Math.abs(points);
        }
      }
    });

    const endingBalanceByDate = {};
    let runningBalance = Number(currentBalance || 0);

    for (let i = dateArray.length - 1; i >= 0; i -= 1) {
      const dateStr = dateArray[i];
      endingBalanceByDate[dateStr] = runningBalance;
      runningBalance -= Number(dailySummary[dateStr].delta || 0);
    }

    let cumulativeEarned = 0;
    let cumulativeSpent = 0;
    let cumulativePenalty = 0;

    const result = dateArray.map((dateStr, index) => {
      cumulativeEarned += Number(dailySummary[dateStr].earned || 0);
      cumulativeSpent += Number(dailySummary[dateStr].spent || 0);
      cumulativePenalty += Number(dailySummary[dateStr].penalty || 0);

      return {
        date: formattedDates[index],
        value: Number(endingBalanceByDate[dateStr] || 0),
        earned: Number(cumulativeEarned),
        spent: Number(cumulativeSpent),
        penalty: Number(cumulativePenalty)
      };
    });

    logger.info('AnalyticsService', `锚点余额反推完成，共${result.length}天的数据`);
    return result;
  }

  _getRecordDateString(record) {
    if (record.source === 'task' && record.type === 'expense' && record.originalTaskDate) {
      return record.originalTaskDate;
    }

    const recordDate = new Date(record.timestamp);
    return dateUtils.formatDate(recordDate);
  }

  _sumStarGroups(groups = []) {
    return groups.reduce((sum, group) => sum + Number(group.stars || 0), 0);
  }

  _sumRecordNetPoints(records = []) {
    return records.reduce((sum, record) => sum + Number(record.points || 0), 0);
  }

  /**
   * 计算星星过期预测
   * @param {Number} currentBalance 当前星星余额
   * @param {Object} options 分析选项
   * @param {String|null} options.userId 单用户分析时的用户ID
   * @param {String} options.scope 分析范围，支持 `user` / `family`
   * @returns {Promise<Array>} 预测数据
   * @private
   */
  async _calculateExpiryForecast(currentBalance, options = {}) {
    const scope = options.scope || (options.userId ? 'user' : 'all');
    logger.info('AnalyticsService', '计算星星过期预测，当前余额: ' + currentBalance, {
      userId: options.userId || null,
      scope
    });

    try {
      // 确保当前余额是数字类型
      currentBalance = Number(currentBalance);

      if (!this.starService) {
        logger.error('AnalyticsService', '无法获取星星服务实例');
        return [];
      }

      // 获取星星分组数据
      const starGroups = Array.isArray(options.starGroups) && options.starGroups.length > 0
        ? options.starGroups
        : await this.starService.getStarGroups(options.userId || null);
      logger.info('AnalyticsService', `获取到${starGroups.length}个星星分组`);

      // 筛选出非永久有效的分组
      const expiryGroups = starGroups.filter((group) =>
        group.expiryType !== 'permanent' &&
        group.expiryDate
      );

      logger.info('AnalyticsService', `获取到${expiryGroups.length}个有过期时间的星星分组`);

      // 记录每个过期分组的详细信息
      expiryGroups.forEach((group, index) => {
        logger.info('AnalyticsService', `过期分组${index + 1}: ID=${group.id}, 星星数=${group.stars}, 过期类型=${group.expiryType}, 过期日期=${group.expiryDate}`);
      });

      // 如果没有即将过期的星星，只需要预测近7天
      const forecastDays = expiryGroups.length > 0 ? 30 : 7;

      // 如果有过期数据，找出最远的过期日期
      let maxExpiryDate = new Date();
      maxExpiryDate.setDate(maxExpiryDate.getDate() + 7);

      if (expiryGroups.length > 0) {
        // 按过期时间排序
        expiryGroups.sort((a, b) => {
          const dateA = new Date(a.expiryDate);
          const dateB = new Date(b.expiryDate);
          return dateA.getTime() - dateB.getTime();
        });

        const lastExpiryDate = new Date(expiryGroups[expiryGroups.length - 1].expiryDate);
        // 给最后过期日再加3天的缓冲，让图表显示过期后的余额状态
        lastExpiryDate.setDate(lastExpiryDate.getDate() + 3);

        if (lastExpiryDate > maxExpiryDate) {
          maxExpiryDate = lastExpiryDate;
          logger.info('AnalyticsService', `根据过期数据调整预测时长至 ${dateUtils.formatDate(maxExpiryDate)}`);
        }
      }

      const result = [];
      let runningBalance = Number(currentBalance);
      const today = new Date();

      // 设置时间为当天23:59:59，确保包含当天所有变化
      today.setHours(23, 59, 59, 999);

      logger.debug('AnalyticsService', `预测开始日期: ${dateUtils.formatDate(today)}, 初始余额: ${runningBalance}`);

      // 计算预测天数（从今天到最远过期日的天数）
      const maxDays = Math.min(
        forecastDays,
        Math.ceil((maxExpiryDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)) + 1
      );

      logger.info('AnalyticsService', `预测天数: ${maxDays}天`);

      // 生成预测的日期序列
      for (let i = 0; i < maxDays; i += 1) {
        const forecastDate = new Date(today);
        forecastDate.setDate(today.getDate() + i);
        const dateStr = dateUtils.formatDate(forecastDate);

        // 查找当天过期的星星分组
        const todayExpiring = expiryGroups.filter((group) => {
          const expiryDate = new Date(group.expiryDate);
          return dateUtils.formatDate(expiryDate) === dateStr;
        });

        // 计算过期总数
        const expiryAmount = todayExpiring.reduce(
          (sum, group) => Number(sum) + Number(group.stars || 0),
          0
        );

        // 更新余额
        if (expiryAmount > 0) {
          const oldBalance = Number(runningBalance);
          runningBalance = Math.max(0, Number(runningBalance) - Number(expiryAmount));
          logger.info('AnalyticsService', `${dateStr} 将过期 ${expiryAmount} 颗星星, 余额从 ${oldBalance} 变为 ${runningBalance}`);
        }

        // 格式化日期为显示格式
        const displayDate = new Date(forecastDate);
        const month = displayDate.getMonth() + 1;
        const day = displayDate.getDate();
        const formattedDate = `${month}/${day}`;

        // 添加到结果
        result.push({
          date: formattedDate,
          value: runningBalance,
          expiring: expiryAmount || 0
        });
      }

      logger.info('AnalyticsService', `预测数据生成完成，共${result.length}天的数据`);
      return result;
    } catch (error) {
      logger.error('AnalyticsService', '计算星星过期预测出错', error);
      return [];
    }
  }

  /**
   * 获取即将过期的星星信息
   * @param {Number} days 未来天数
   * @param {Object} options 查询选项
   * @param {String|null} options.userId 单用户分析时的用户ID
   * @param {String} options.scope 分析范围，支持 `user` / `family`
   * @returns {Promise<Array>} 过期星星数据
   */
  async getUpcomingExpiryStars(days, options = {}) {
    const scope = options.scope || (options.userId ? 'user' : 'all');
    logger.info('AnalyticsService', `获取${days}天内即将过期的星星信息`, {
      userId: options.userId || null,
      scope
    });

    try {
      if (!this.starService) {
        logger.error('AnalyticsService', '无法获取星星服务实例');
        return [];
      }

      const context = this._resolveAnalysisContext(options);
      if (this._canUseCloudScopedAnalyticsQuery(context)) {
        try {
          const response = await HttpClient.post(
            API_CONFIG.ENDPOINTS.ANALYTICS_UPCOMING_EXPIRY_QUERY,
            this._buildScopedAnalyticsPayload(context, { days }, options)
          );
          return this._adaptCloudUpcomingExpiryItems(response?.items);
        } catch (cloudError) {
          logger.warn('AnalyticsService', '即将过期星星查询走云端 authoritative 失败，回退本地', {
            scope: context.scope,
            userId: context.userId || null,
            error: cloudError.message
          });
        }
      }

      if (scope === 'family') {
        logger.info('AnalyticsService', '家庭分析模式跳过即将过期星星查询：当前作用域仅同步星星流水');
        return [];
      }

      // 获取星星分组数据
      const starGroups = await this.starService.getStarGroups(options.userId || null);

      // 筛选出非永久有效的分组
      const expiryGroups = starGroups.filter((group) =>
        group.expiryType !== 'permanent' &&
        group.expiryDate
      );

      const expiryData = [];
      const now = new Date();
      const futureLimit = new Date();
      futureLimit.setDate(now.getDate() + days);

      // 筛选未来指定天数内会过期的星星分组
      expiryGroups.forEach((group) => {
        const expiryDate = new Date(group.expiryDate);

        if (expiryDate > now && expiryDate <= futureLimit) {
          expiryData.push({
            id: `expiry_group_${expiryDate.getTime()}`,
            points: group.stars,
            expiryDate,
            expiryDateStr: group.name || dateUtils.formatDate(expiryDate),
            type: group.type
          });

          logger.info('AnalyticsService', `${group.stars}颗星星将于${dateUtils.formatDate(expiryDate)}过期`);
        }
      });

      // 按过期日期排序
      expiryData.sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());

      logger.info('AnalyticsService', `获取到${expiryData.length}组即将过期的星星数据`);
      return expiryData;
    } catch (error) {
      logger.error('AnalyticsService', '获取即将过期星星信息出错', error);
      return [];
    }
  }

  /**
   * 获取任务完成情况统计数据
   * @param {String} dateRange 日期范围
   * @returns {Promise<Object>} 统计数据
   */
  async getTaskCompletionStats(dateRange, options = {}) {
    logger.info('AnalyticsService', `获取任务完成情况统计数据，日期范围: ${dateRange}`, options);

    try {
      if (!this.taskService) {
        logger.error('AnalyticsService', '无法获取任务服务实例');
        return {};
      }

      const context = this._resolveAnalysisContext(options);
      if (this._canUseCloudScopedAnalyticsQuery(context)) {
        try {
          const response = await HttpClient.post(
            API_CONFIG.ENDPOINTS.ANALYTICS_TASK_COMPLETION_STATS_QUERY,
            this._buildScopedAnalyticsPayload(context, { dateRange }, options)
          );
          return response?.stats || {};
        } catch (cloudError) {
          logger.warn('AnalyticsService', '任务完成统计走云端 authoritative 失败，回退本地', {
            scope: context.scope,
            userId: context.userId || null,
            error: cloudError.message
          });
        }
      }

      // 使用 getTasksByScope 支持 userId 和 scope=family 两种场景
      const familyChildUserIds = this._resolveFamilyChildUserIds(options);
      const tasks = options.scope === 'family'
        ? this._filterTasksByResolvedChildUserIds(
          await this.taskService.getTasksByScope(options),
          familyChildUserIds
        )
        : this._filterTasksByChildUserIds(
          await this.taskService.getTasksByScope(options),
          options.childUserIds
        );

      // 根据日期范围筛选任务
      let filteredTasks = tasks;

      if (dateRange === 'today') {
        const today = dateUtils.formatDate(new Date());
        filteredTasks = tasks.filter((task) => task.date === today);
      } else if (dateRange === 'week') {
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);

        filteredTasks = tasks.filter((task) => {
          const taskDate = new Date(task.date);
          return taskDate >= weekStart;
        });
      } else if (dateRange === 'month') {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        filteredTasks = tasks.filter((task) => {
          const taskDate = new Date(task.date);
          return taskDate >= monthStart;
        });
      }

      // 计算统计数据
      const totalTasks = filteredTasks.length;
      const completedTasks = filteredTasks.filter((task) => task.isCompleted()).length;
      const completionRate = totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(1) : 0;

      // 按类型统计
      const typeCounts = {
        study: filteredTasks.filter((task) => task.type === 'study').length,
        habit: filteredTasks.filter((task) => task.type === 'habit').length,
        interest: filteredTasks.filter((task) => task.type === 'interest').length
      };

      // 按状态统计
      const statusCounts = {
        pending: filteredTasks.filter((task) => !task.isCompleted()).length,
        completed: completedTasks
      };

      const result = {
        totalTasks,
        completedTasks,
        completionRate,
        typeCounts,
        statusCounts
      };

      logger.info('AnalyticsService', `统计完成: 总任务数=${totalTasks}, 完成数=${completedTasks}, 完成率=${completionRate}%`);

      return result;
    } catch (error) {
      logger.error('AnalyticsService', '获取任务完成情况统计数据出错', error);
      return {};
    }
  }

  _filterRecordsByChildUserIds(records = [], childUserIds) {
    if (!Array.isArray(childUserIds)) {
      return records || [];
    }
    if (childUserIds.length === 0) {
      return [];
    }
    return (records || []).filter((record) => childUserIds.includes(record.userId));
  }

  _filterTasksByChildUserIds(tasks = [], childUserIds) {
    if (!Array.isArray(childUserIds)) {
      return tasks || [];
    }
    if (childUserIds.length === 0) {
      return [];
    }
    return (tasks || []).filter((task) => childUserIds.includes(task.userId));
  }

  _resolveAnalysisContext(analysisOptions = {}) {
    if (analysisOptions.scope === 'family') {
      const hasExplicitChildUserIds = Object.prototype.hasOwnProperty.call(analysisOptions, 'childUserIds');
      const childUserIds = hasExplicitChildUserIds && Array.isArray(analysisOptions.childUserIds)
        ? analysisOptions.childUserIds.filter(Boolean)
        : undefined;
      return {
        scope: 'family',
        userId: null,
        childUserIds,
        subjectUserIds: childUserIds,
        hasExplicitChildUserIds
      };
    }

    const userId = analysisOptions.userId || null;
    return {
      scope: 'user',
      userId,
      childUserIds: [],
      subjectUserIds: userId ? [userId] : []
    };
  }

  _buildAnalysisSignature(context, monthKey, days) {
    return JSON.stringify({
      scope: context.scope,
      userId: context.userId || null,
      childUserIds: context.scope === 'family'
        ? (context.hasExplicitChildUserIds ? (context.childUserIds || []) : null)
        : [],
      monthKey,
      days: Number(days || 7)
    });
  }

  _buildAnalysisScopeKey(context) {
    if (context.scope === 'family') {
      if (!context.hasExplicitChildUserIds) {
        return 'family:all';
      }
      return `family:${(context.childUserIds || []).join(',')}`;
    }
    return `user:${context.userId || 'unknown'}`;
  }

  _isCloudEnabled() {
    return Boolean(this.starService?.enableCloudStorage || this.taskService?.enableCloudStorage);
  }

  _canUseCloudScopedAnalyticsQuery(context = {}) {
    if (!this._isCloudEnabled()) {
      return false;
    }

    if (context.scope === 'family') {
      return true;
    }

    return Boolean(context.userId);
  }

  _buildScopedAnalyticsPayload(context = {}, extra = {}, rawOptions = {}) {
    const payload = {
      scope: context.scope,
      ...extra
    };

    if (context.scope === 'family') {
      if (Object.prototype.hasOwnProperty.call(rawOptions || {}, 'childUserIds')) {
        payload.childUserIds = context.childUserIds || [];
      }
    } else if (context.userId) {
      payload.userId = context.userId;
    }

    return payload;
  }

  _getMonthDateRange(monthKey) {
    const [yearText, monthText] = String(monthKey || '').split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { startDate, endDate };
  }

  async _loadLocalScopedTasksByDateRange(startDate, endDate, context) {
    if (!this.taskService?.taskRepository?.getTasksByDateRange) {
      return [];
    }

    if (context.scope === 'family') {
      const resolvedChildUserIds = this._resolveFamilyChildUserIds(context);
      const allTasks = await this.taskService.taskRepository.getTasksByDateRange(startDate, endDate, null);
      return this._filterTasksByResolvedChildUserIds(allTasks, resolvedChildUserIds);
    }

    return this.taskService.taskRepository.getTasksByDateRange(startDate, endDate, context.userId || null);
  }

  async _loadScopedStarRecordsByDateRange(startDate, endDate, context) {
    if (!this.starService) {
      return [];
    }

    if (context.scope !== 'family') {
      return this.starService.getStarRecordsByDateRange(startDate, endDate, context.userId || null);
    }

    const resolvedChildUserIds = this._resolveFamilyChildUserIds(context);
    const allRecords = await this.starService.getStarRecords();
    return this._filterRecordsByResolvedChildUserIds(allRecords, resolvedChildUserIds).filter((record) => {
      const recordDate = this._getRecordDateString(record);
      return recordDate >= startDate && recordDate <= endDate;
    });
  }

  async _buildLocalPreparedSnapshot({ context, monthKey, days, signature, reason }) {
    const { startDate, endDate } = this._getMonthDateRange(monthKey);
    const [tasks, records] = await Promise.all([
      this._loadLocalScopedTasksByDateRange(startDate, endDate, context),
      this._loadScopedStarRecordsByDateRange(startDate, endDate, context)
    ]);

    let currentBalance = 0;
    let familyGroupSnapshots = undefined;

    if (context.scope === 'family') {
      const resolvedChildUserIds = this._resolveFamilyChildUserIds(context);
      const allGroups = await Promise.all(
        (resolvedChildUserIds || []).map(async (userId) => ({
          userId,
          groups: await this.starService.getStarGroups(userId)
        }))
      );
      familyGroupSnapshots = {};
      allGroups.forEach(({ userId, groups }) => {
        familyGroupSnapshots[userId] = groups || [];
        currentBalance += this._sumStarGroups(groups || []);
      });
    } else {
      const starGroups = await this.starService.getStarGroups(context.userId || null);
      currentBalance = this._sumStarGroups(starGroups);
    }

    return this._buildPreparedSnapshot({
      context,
      signature,
      monthKey,
      days,
      tasks,
      records,
      currentBalance,
      familyGroupSnapshots,
      mode: 'fallback',
      fallbackReason: reason
    });
  }

  _buildPreparedSnapshot({
    context,
    signature,
    monthKey,
    days,
    tasks = [],
    records = [],
    currentBalance = 0,
    familyGroupSnapshots = undefined,
    historyData = [],
    forecastData = [],
    mode = 'authoritative',
    fallbackReason = undefined
  }) {
    return {
      scope: context.scope,
      scopeKey: this._buildAnalysisScopeKey(context),
      subjectUserIds: context.scope === 'family'
        ? (this._resolveFamilyChildUserIds(context) || [])
        : (context.subjectUserIds || []),
      monthKey,
      days: Number(days || 7),
      signature,
      refreshedAt: Date.now(),
      expiresAt: Date.now() + this.prepareSnapshotTtlMs,
      currentBalance: Number(currentBalance || 0),
      mode,
      fallbackReason,
      tasks,
      records,
      familyGroupSnapshots,
      historyData,
      forecastData
    };
  }

  async _queryPreparedSnapshotFromCloud({ context, monthKey, days, signature }) {
    const payload = {
      scope: context.scope,
      monthKey,
      trendDays: Number(days || 7)
    };

    if (context.scope === 'family') {
      payload.childUserIds = context.childUserIds;
    } else {
      payload.userId = context.userId;
    }

    const response = await HttpClient.post(API_CONFIG.ENDPOINTS.ANALYTICS_READ_MODEL_QUERY, payload);
    if (!response || !response.snapshot) {
      throw new Error('analytics read model 响应缺少 snapshot');
    }

    return this._adaptCloudPreparedSnapshot(response.snapshot, {
      context,
      monthKey,
      days,
      signature
    });
  }

  _adaptCloudPreparedSnapshot(snapshot, { context, monthKey, days, signature }) {
    return {
      scope: context.scope,
      scopeKey: this._buildAnalysisScopeKey(context),
      subjectUserIds: Array.isArray(snapshot.subjectUserIds)
        ? snapshot.subjectUserIds.filter(Boolean)
        : (context.subjectUserIds || []),
      monthKey,
      days: Number(days || 7),
      signature,
      refreshedAt: Number(snapshot.refreshedAt || Date.now()),
      expiresAt: Date.now() + this.prepareSnapshotTtlMs,
      currentBalance: Number(snapshot.currentBalance || 0),
      mode: 'authoritative',
      fallbackReason: undefined,
      tasks: this._adaptCloudTasks(snapshot.tasks || []),
      records: this._adaptCloudRecords(snapshot.records || []),
      familyGroupSnapshots: this._adaptCloudFamilyGroupSnapshots(snapshot.familyGroupSnapshots),
      historyData: Array.isArray(snapshot.historyData) ? snapshot.historyData : [],
      forecastData: Array.isArray(snapshot.forecastData) ? snapshot.forecastData : []
    };
  }

  _adaptCloudTasks(tasks = []) {
    return (Array.isArray(tasks) ? tasks : []).map((task) => new Task({
      id: task.id || task.taskId,
      userId: task.userId,
      title: task.title,
      description: task.description,
      type: task.type,
      date: task.date,
      startTime: task.startTime,
      endTime: task.endTime,
      duration: task.duration,
      isAllDay: task.isAllDay === true,
      reminder: task.reminder,
      status: task.status,
      isRequired: task.isRequired === true,
      penaltyApplied: task.penaltyApplied === true,
      penaltyDeductedPoints: Number(task.penaltyDeductedPoints || 0),
      penaltyRefunded: task.penaltyRefunded === true,
      penaltyRefundTime: task.penaltyRefundTime || 0,
      completionTime: task.completionTime || 0,
      points: Number(task.points || 0),
      pointsExpiry: task.pointsExpiry,
      starAwarded: task.starAwarded === true,
      repeat: task.repeat || { type: 'none' },
      parentTaskId: task.parentTaskId || '',
      hasNoEndDate: task.hasNoEndDate === true,
      modifyTime: task.modifyTime || Date.now(),
      createTime: Date.parse(task.createdAt || '') || Date.now(),
      syncedToCloud: true
    }));
  }

  _adaptCloudRecords(records = []) {
    return (Array.isArray(records) ? records : []).map((record) => new StarRecord({
      id: record.id || record.recordId,
      userId: record.userId,
      type: record.type,
      source: record.source,
      sourceId: record.sourceId || '',
      points: Number(record.points || 0),
      timestamp: record.timestamp || record.modifyTime || Date.parse(record.createdAt || '') || Date.now(),
      description: record.description || '',
      expiryType: record.expiryType || null,
      expiryDate: record.expiryDate || null,
      balance: Number(record.balance || 0),
      previousBalance: Number(record.previousBalance || 0),
      originalTaskDate: record.originalTaskDate || null,
      requestedPoints: record.requestedPoints || null,
      syncedToCloud: true,
      idempotencyKey: record.idempotencyKey || null,
      modifyTime: record.modifyTime || Date.now(),
      data: record.data || {}
    }));
  }

  _adaptCloudFamilyGroupSnapshots(groupsByUser = {}) {
    if (!groupsByUser || typeof groupsByUser !== 'object') {
      return undefined;
    }

    return Object.keys(groupsByUser).reduce((result, userId) => {
      result[userId] = (groupsByUser[userId] || []).map((group) => ({
        ...group,
        stars: Number(group.stars || 0)
      }));
      return result;
    }, {});
  }

  _flattenFamilyGroupSnapshots(groupsByUser = {}) {
    return Object.values(groupsByUser || {}).reduce((result, groups) => {
      return result.concat(groups || []);
    }, []);
  }

  _resolveFamilyChildUserIds(options = {}) {
    if (Array.isArray(options.childUserIds)) {
      return options.childUserIds.filter(Boolean);
    }

    const allUsers = this.taskService?.userService?.getAllUsers?.() || [];
    const childUserIds = allUsers
      .filter((user) => user?.role === 'child' && user?.status !== 'inactive')
      .map((user) => user.userId || user.id)
      .filter(Boolean);

    return childUserIds.length > 0 ? childUserIds : null;
  }

  _filterTasksByResolvedChildUserIds(tasks = [], childUserIds = null) {
    if (!Array.isArray(childUserIds)) {
      return tasks || [];
    }
    return this._filterTasksByChildUserIds(tasks, childUserIds);
  }

  _filterRecordsByResolvedChildUserIds(records = [], childUserIds = null) {
    if (!Array.isArray(childUserIds)) {
      return records || [];
    }
    return this._filterRecordsByChildUserIds(records, childUserIds);
  }

  _adaptCloudUpcomingExpiryItems(items = []) {
    return (Array.isArray(items) ? items : []).map((item) => ({
      ...item,
      expiryDate: item?.expiryDate ? new Date(item.expiryDate) : null,
      points: Number(item?.points || 0)
    }));
  }
}

module.exports = AnalyticsService;
