/**
 * 任务服务
 */

const { createHash } = require('crypto');
const { getPool, query, execute } = require('../config/database');
const Task = require('../models/Task');
const Message = require('../models/Message');
const { createLogger } = require('../utils/logger');
const messageService = require('./messageService');
const starService = require('./starService');
const {
  evaluateTaskBackfillWindow,
  buildTaskBackfillExpiredMessage
} = require('../utils/task-backfill-window');
const logger = createLogger('TaskService');
let taskColumnMapPromise = null;
const TASK_BACKFILL_WINDOW_EXPIRED = 'TASK_BACKFILL_WINDOW_EXPIRED';

/**
 * 任务服务类
 */
class TaskService {
  _createSchemaError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  _serializeTaskMutationTask(task) {
    if (!task) {
      return null;
    }

    if (typeof task.toJSON === 'function') {
      return task.toJSON();
    }

    return { ...task };
  }

  buildTaskMutationResponse({
    primaryTask = null,
    affectedTasks = null,
    operation = 'update',
    idempotent = false,
    taskId = null,
  } = {}) {
    const serializedPrimaryTask = this._serializeTaskMutationTask(primaryTask);
    const serializedAffectedTasks = Array.isArray(affectedTasks)
      ? affectedTasks.map(task => this._serializeTaskMutationTask(task)).filter(Boolean)
      : (serializedPrimaryTask ? [serializedPrimaryTask] : []);

    const response = {
      primaryTask: serializedPrimaryTask,
      affectedTasks: serializedAffectedTasks,
      operation,
      task: serializedPrimaryTask,
      tasks: serializedAffectedTasks,
    };

    if (idempotent) {
      response.idempotent = true;
    }

    const resolvedTaskId = taskId || serializedPrimaryTask?.taskId || serializedPrimaryTask?.id || null;
    if (resolvedTaskId || operation === 'delete') {
      response.taskId = resolvedTaskId || null;
    }

    return response;
  }

  _assertReminderColumnAvailable(columnMap, context, reminderPayload) {
    const hasReminderPayload = reminderPayload !== undefined && reminderPayload !== null;
    if (hasReminderPayload && !columnMap.reminder) {
      throw this._createSchemaError(
        'TASK_REMINDER_SCHEMA_MISSING',
        `${context}失败：tasks 表缺少 reminder 字段，请先执行数据库迁移`
      );
    }
  }

  _getOccurrenceRequiredColumns(columnMap) {
    return [
      columnMap.executionMode,
      columnMap.activeStartDate,
      columnMap.activeEndDate,
      columnMap.activeHasNoEndDate,
      columnMap.isOccurrenceRecord,
      columnMap.occurrenceOutcome,
      columnMap.recordedAt
    ];
  }

  _hasOccurrenceSchema(columnMap) {
    return this._getOccurrenceRequiredColumns(columnMap).every(Boolean);
  }

  _assertOccurrenceSchemaAvailable(columnMap, context, shouldRequire) {
    if (!shouldRequire) {
      return;
    }

    if (!this._hasOccurrenceSchema(columnMap)) {
      throw this._createSchemaError(
        'TASK_OCCURRENCE_SCHEMA_MISSING',
        `${context}失败：tasks 表缺少 occurrence 字段，请先执行数据库迁移`
      );
    }
  }

  async _getTaskColumnMap(forceRefresh = false) {
    if (forceRefresh) {
      taskColumnMapPromise = null;
    }

    if (!taskColumnMapPromise) {
      taskColumnMapPromise = (async () => {
        try {
          const rows = await query(
            `SELECT COLUMN_NAME
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks'`
          );
          const columns = new Set((rows || []).map(row => row.COLUMN_NAME));
          const resolveColumn = (modernName, legacyName, optional = false) => {
            if (columns.has(modernName)) return modernName;
            if (legacyName && columns.has(legacyName)) return legacyName;
            return optional ? null : modernName;
          };

          const columnMap = {
            startTime: resolveColumn('start_time', 'startTime'),
            endTime: resolveColumn('end_time', 'endTime'),
            pointsExpiry: resolveColumn('points_expiry', 'pointsExpiry'),
            reminder: resolveColumn('reminder', null, true),
            isRequired: resolveColumn('is_required', 'isRequired'),
            isAllDay: resolveColumn('is_all_day', 'isAllDay'),
            penaltyApplied: resolveColumn('penalty_applied', 'penaltyApplied'),
            penaltyDeductedPoints: resolveColumn('penalty_deducted_points', 'penaltyDeductedPoints', true),
            penaltyRefunded: resolveColumn('penalty_refunded', 'penaltyRefunded', true),
            penaltyRefundTime: resolveColumn('penalty_refund_time', 'penaltyRefundTime', true),
            deletedAt: resolveColumn('deleted_at', 'deletedAt', true),
            completionTime: resolveColumn('completion_time', 'completionTime', true),
            starAwarded: resolveColumn('star_awarded', 'starAwarded', true),
            modifyTime: resolveColumn('modify_time', 'modifyTime', true),
            duration: resolveColumn('duration', null, true),
            hasNoEndDate: resolveColumn('has_no_end_date', 'hasNoEndDate', true),
            tags: resolveColumn('tags', null, true),
            parentTaskId: resolveColumn('parent_task_id', 'parentTaskId', true),
            executionMode: resolveColumn('execution_mode', 'executionMode', true),
            activeStartDate: resolveColumn('active_start_date', 'activeStartDate', true),
            activeEndDate: resolveColumn('active_end_date', 'activeEndDate', true),
            activeHasNoEndDate: resolveColumn('active_has_no_end_date', 'activeHasNoEndDate', true),
            isOccurrenceRecord: resolveColumn('is_occurrence_record', 'isOccurrenceRecord', true),
            occurrenceOutcome: resolveColumn('occurrence_outcome', 'occurrenceOutcome', true),
            recordedAt: resolveColumn('recorded_at', 'recordedAt', true),
          };

          logger.info('检测到 tasks 表字段映射', columnMap);
          return columnMap;
        } catch (error) {
          logger.warn('获取 tasks 表字段映射失败，回退到默认字段名', {
            message: error.message
          });
          return {
            startTime: 'start_time',
            endTime: 'end_time',
            pointsExpiry: 'points_expiry',
            reminder: 'reminder',
            isRequired: 'is_required',
            isAllDay: 'is_all_day',
            penaltyApplied: 'penalty_applied',
            penaltyDeductedPoints: 'penalty_deducted_points',
            penaltyRefunded: 'penalty_refunded',
            penaltyRefundTime: 'penalty_refund_time',
            deletedAt: 'deleted_at',
            completionTime: 'completion_time',
            starAwarded: 'star_awarded',
            modifyTime: 'modify_time',
            duration: 'duration',
            hasNoEndDate: 'has_no_end_date',
            tags: 'tags',
            parentTaskId: 'parent_task_id',
            executionMode: 'execution_mode',
            activeStartDate: 'active_start_date',
            activeEndDate: 'active_end_date',
            activeHasNoEndDate: 'active_has_no_end_date',
            isOccurrenceRecord: 'is_occurrence_record',
            occurrenceOutcome: 'occurrence_outcome',
            recordedAt: 'recorded_at',
          };
        }
      })();
    }

    return taskColumnMapPromise;
  }

  _formatDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return null;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  _buildOccurrenceHistoryReadonlyError() {
    const error = new Error('历史项仅保留查看，不支持继续修改');
    error.code = 'TASK_OCCURRENCE_HISTORY_READONLY';
    return error;
  }

  _resolveOccurrenceStatusKey(task, today) {
    if (!task || typeof task.isOccurrenceConfigTask !== 'function' || !task.isOccurrenceConfigTask() || !today) {
      return null;
    }

    const startDate = task.activeRange?.startDate || task.date || '';
    const hasNoEndDate = task.activeRange?.hasNoEndDate === true;
    const endDate = hasNoEndDate ? '' : (task.activeRange?.endDate || '');

    if (startDate && startDate > today) {
      return 'upcoming';
    }

    if (!hasNoEndDate && endDate && endDate < today) {
      return 'history';
    }

    return 'active';
  }

  _assertOccurrenceHistoryWritable(task) {
    const today = this._formatDate(new Date());
    if (this._resolveOccurrenceStatusKey(task, today) === 'history') {
      throw this._buildOccurrenceHistoryReadonlyError();
    }
  }

  _shiftDate(dateString, dayDelta) {
    if (!dateString) {
      return null;
    }

    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    date.setDate(date.getDate() + dayDelta);
    return this._formatDate(date);
  }

  _buildOccurrenceRecordTaskId(parentTaskId, userId, date) {
    const digest = createHash('sha1')
      .update(`${parentTaskId}:${userId}:${date}`)
      .digest('hex');
    return `task_occ_${digest.slice(0, 24)}`;
  }

  _buildOccurrenceStarRecordId(action, taskId, operationKey) {
    const digest = createHash('sha1')
      .update(`${action}:${taskId}:${operationKey}`)
      .digest('hex');
    return `task_occ_${action}_${digest.slice(0, 24)}`;
  }

  async hasOccurrenceCapability() {
    const columnMap = await this._getTaskColumnMap();
    return this._hasOccurrenceSchema(columnMap);
  }

  _buildTaskBackfillExpiredError(task, modifyTime) {
    const result = evaluateTaskBackfillWindow({
      taskDate: task?.date,
      pointsExpiry: task?.pointsExpiry,
      operationTime: modifyTime
    });

    if (!result || result.allowed !== false) {
      return null;
    }

    const error = new Error(buildTaskBackfillExpiredMessage(result));
    error.code = TASK_BACKFILL_WINDOW_EXPIRED;
    error.windowType = result.windowType || null;
    error.windowEndDate = result.windowEndDate || null;
    error.taskDate = result.taskDate || null;
    error.operationDate = result.operationDate || null;
    return error;
  }

  _normalizeRepeatDays(days = []) {
    return days
      .map(day => Number(day))
      .filter(day => Number.isInteger(day) && day >= 0 && day <= 6);
  }

  _supportsRepeatMaterialization(task) {
    const repeatType = task?.repeat?.type;
    if (!task || task.parentTaskId || !repeatType) {
      return false;
    }

    return ['daily', 'weekly', 'custom', 'workdays', 'weekends'].includes(repeatType);
  }

  _buildRepeatTaskId(parentTaskId, instanceDate, ownerUserId) {
    const digest = createHash('sha1')
      .update(`${parentTaskId}:${instanceDate}:${ownerUserId}`)
      .digest('hex');
    return `task_repeat_${digest.slice(0, 24)}`;
  }

  _resolveRepeatMatcher(task) {
    switch (task?.repeat?.type) {
      case 'workdays':
        return (date) => {
          const day = date.getDay();
          return day >= 1 && day <= 5;
        };
      case 'weekends':
        return (date) => {
          const day = date.getDay();
          return day === 0 || day === 6;
        };
      case 'custom': {
        const selectedDays = this._normalizeRepeatDays(task?.repeat?.days);
        if (selectedDays.length === 0) {
          return null;
        }
        return (date) => selectedDays.includes(date.getDay());
      }
      default:
        return null;
    }
  }

  _findFirstRepeatDateWithinWindow(startDate, endDate, matcher, maxDays = 21) {
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
      return null;
    }
    if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
      return null;
    }
    if (typeof matcher !== 'function') {
      return null;
    }

    const cursor = new Date(startDate.getTime());
    for (let index = 0; index < maxDays; index += 1) {
      if (cursor > endDate) {
        return null;
      }
      if (matcher(cursor)) {
        return new Date(cursor.getTime());
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return null;
  }

  _buildRepeatDateStrings(task) {
    if (!this._supportsRepeatMaterialization(task) || !task.repeat?.startDate) {
      return [];
    }

    const startDate = new Date(`${task.repeat.startDate}T00:00:00`);
    if (Number.isNaN(startDate.getTime())) {
      return [];
    }

    let endDate = null;
    if (task.repeat.endDate) {
      endDate = new Date(`${task.repeat.endDate}T00:00:00`);
    } else if (task.hasNoEndDate === true) {
      endDate = new Date(startDate.getTime());
      endDate.setDate(endDate.getDate() + (task.repeat.type === 'daily' ? 90 : 30));
    }

    if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
      return [];
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const effectiveStartDate = new Date(startDate.getTime());
    if (effectiveStartDate < today) {
      effectiveStartDate.setTime(today.getTime());
    }

    if (endDate < effectiveStartDate) {
      return [];
    }

    const parentTaskDate = task.date || this._formatDate(startDate);
    const repeatDates = [];

    switch (task.repeat.type) {
      case 'daily':
        for (let date = new Date(effectiveStartDate); date <= endDate; date.setDate(date.getDate() + 1)) {
          repeatDates.push(this._formatDate(date));
        }
        break;
      case 'weekly':
        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 7)) {
          if (date >= effectiveStartDate) {
            repeatDates.push(this._formatDate(date));
          }
        }
        break;
      case 'workdays':
      case 'weekends':
      case 'custom': {
        const repeatMatcher = this._resolveRepeatMatcher(task);
        const firstMatchDate = this._findFirstRepeatDateWithinWindow(
          effectiveStartDate,
          endDate,
          repeatMatcher,
          21
        );
        if (!firstMatchDate) {
          return [];
        }

        for (let date = new Date(firstMatchDate); date <= endDate; date.setDate(date.getDate() + 1)) {
          if (repeatMatcher(date)) {
            repeatDates.push(this._formatDate(date));
          }
        }
        break;
      }
      default:
        return [];
    }

    return repeatDates.filter(date => date && date !== parentTaskDate);
  }

  /**
   * 获取用户的任务列表
   * @param {string} userId - 用户ID
   * @param {Object} filters - 过滤条件
   * @param {string} filters.date - 按日期筛选
   * @param {number} filters.status - 按状态筛选（0=未完成，1=已完成）
   * @returns {Promise<Array<Task>>} 任务列表
   */
  async getTasksByUser(userId, filters = {}) {
    try {
      const { date, status, startDate, endDate } = filters;
      const includeOccurrence = filters.includeOccurrence === true;
      const occurrenceMode = filters.occurrenceMode || 'all';
      const includeInactive = filters.includeInactive === true;
      const columnMap = await this._getTaskColumnMap();
      this._assertOccurrenceSchemaAvailable(
        columnMap,
        '查询任务',
        includeOccurrence || occurrenceMode !== 'all' || includeInactive
      );

      let sql = 'SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL';
      const params = [userId];

      if (this._hasOccurrenceSchema(columnMap)) {
        if (!includeOccurrence) {
          sql += ` AND (${columnMap.executionMode} IS NULL OR ${columnMap.executionMode} = 'planned')`;
        } else if (occurrenceMode === 'config') {
          sql += ` AND ${columnMap.executionMode} = 'occurrence' AND ${columnMap.isOccurrenceRecord} = 0`;
        } else if (occurrenceMode === 'record') {
          sql += ` AND ${columnMap.executionMode} = 'occurrence' AND ${columnMap.isOccurrenceRecord} = 1`;
        }
      }

      const isOccurrenceConfigQuery = includeOccurrence && occurrenceMode === 'config' && this._hasOccurrenceSchema(columnMap);

      if (date && isOccurrenceConfigQuery) {
        if (includeInactive) {
          // 表现项维护页带 includeInactive 时不过滤有效期，返回当前孩子的全部未删除配置任务。
        } else {
          sql += ` AND ${columnMap.activeStartDate} <= ? AND (${columnMap.activeHasNoEndDate} = 1 OR ${columnMap.activeEndDate} IS NULL OR ${columnMap.activeEndDate} >= ?)`;
          params.push(date, date);
        }
      } else if (date) {
        sql += ' AND date = ?';
        params.push(date);
      }

      if (startDate && endDate && isOccurrenceConfigQuery) {
        if (!includeInactive) {
          sql += ` AND ${columnMap.activeStartDate} <= ? AND (${columnMap.activeHasNoEndDate} = 1 OR ${columnMap.activeEndDate} IS NULL OR ${columnMap.activeEndDate} >= ?)`;
          params.push(endDate, startDate);
        }
      } else if (startDate && endDate) {
        sql += ' AND date >= ? AND date <= ?';
        params.push(startDate, endDate);
      }

      if (status !== undefined && !isOccurrenceConfigQuery) {
        sql += ' AND status = ?';
        params.push(status);
      }

      sql += ' ORDER BY created_at DESC';

      logger.info('执行任务查询', { userId, sql, params });
      const results = await query(sql, params);
      logger.info('任务查询结果', { userId, resultCount: results.length });

      return results.map(record => Task.fromDB(record));
    } catch (error) {
      logger.error('获取任务列表失败', {
        message: error.message,
        stack: error.stack,
        code: error.code
      });
      throw error;
    }
  }

  /**
   * 根据taskId获取任务
   * @param {string} taskId - 任务ID
   * @returns {Promise<Task|null>} 任务实例，如果不存在返回null
   */
  async getTaskById(taskId) {
    try {
      const results = await query(
        'SELECT * FROM tasks WHERE task_id = ? AND deleted_at IS NULL LIMIT 1',
        [taskId]
      );

      if (results.length === 0) {
        return null;
      }

      return Task.fromDB(results[0]);
    } catch (error) {
      logger.error('根据taskId获取任务失败', error);
      throw error;
    }
  }

  async _createTaskRecordWithConnection(connection, userId, taskData, options = {}) {
    const columnMap = options.columnMap || await this._getTaskColumnMap();
    this._assertReminderColumnAvailable(columnMap, '创建任务', taskData.reminder);
    this._assertOccurrenceSchemaAvailable(
      columnMap,
      '创建任务',
      taskData.executionMode === 'occurrence' ||
      taskData.activeRange !== undefined ||
      taskData.isOccurrenceRecord === true ||
      taskData.occurrenceOutcome !== undefined ||
      taskData.recordedAt !== undefined
    );

    const modifyTime = Number(taskData.modifyTime || options.modifyTime || Date.now());
    const operationKey = String(options.operationKey || taskData.operationKey || modifyTime);
    const shouldCreateMessages = options.createMessages !== false;

    if (taskData.taskId) {
      const existingRaw = await this._getTaskByIdConn(connection, taskData.taskId, true);

      if (existingRaw) {
        if (existingRaw.user_id !== userId) {
          const err = new Error('taskId 归属用户不匹配');
          err.code = 'TASK_ID_USER_MISMATCH';
          throw err;
        }

        if (!existingRaw.deleted_at) {
          const existingTask = Task.fromDB(existingRaw);
          if (shouldCreateMessages) {
            await this._createTaskMessagesAfterMutation(existingTask, 'create', options, operationKey, connection);
          }
          return {
            task: existingTask,
            idempotent: true,
          };
        }

        const restoreSetClauses = ['deleted_at = NULL', 'title = ?', 'description = ?', 'type = ?', 'date = ?'];
        const restoreParams = [
          taskData.title,
          taskData.description || '',
          taskData.type,
          taskData.date,
          taskData.startTime || '',
          taskData.endTime || '',
          taskData.points || 0,
          taskData.pointsExpiry || 'permanent',
          taskData.isRequired ? 1 : 0,
          taskData.repeat ? JSON.stringify(taskData.repeat) : null,
          taskData.isAllDay ? 1 : 0,
          taskData.penaltyApplied ? 1 : 0,
        ];

        restoreSetClauses.push(
          `${columnMap.startTime} = ?`,
          `${columnMap.endTime} = ?`,
          ...(columnMap.reminder ? [`${columnMap.reminder} = ?`] : []),
          'points = ?',
          `${columnMap.pointsExpiry} = ?`,
          `${columnMap.isRequired} = ?`,
          '`repeat` = ?',
          `${columnMap.isAllDay} = ?`,
          `${columnMap.penaltyApplied} = ?`
        );

        if (columnMap.reminder) {
          restoreParams.splice(6, 0, JSON.stringify(Task.normalizeReminder(taskData.reminder)));
        }
        if (columnMap.duration) {
          restoreSetClauses.push(`${columnMap.duration} = ?`);
          restoreParams.push(taskData.duration || 0);
        }
        if (columnMap.hasNoEndDate) {
          restoreSetClauses.push(`${columnMap.hasNoEndDate} = ?`);
          restoreParams.push(taskData.hasNoEndDate ? 1 : 0);
        }
        if (columnMap.tags) {
          restoreSetClauses.push(`${columnMap.tags} = ?`);
          restoreParams.push(taskData.tags ? JSON.stringify(taskData.tags) : null);
        }
        if (columnMap.parentTaskId) {
          restoreSetClauses.push(`${columnMap.parentTaskId} = ?`);
          restoreParams.push(taskData.parentTaskId || null);
        }
        if (columnMap.executionMode) {
          restoreSetClauses.push(`${columnMap.executionMode} = ?`);
          restoreParams.push(taskData.executionMode || 'planned');
        }
        if (columnMap.activeStartDate) {
          restoreSetClauses.push(`${columnMap.activeStartDate} = ?`);
          restoreParams.push(taskData.activeRange?.startDate || null);
        }
        if (columnMap.activeEndDate) {
          restoreSetClauses.push(`${columnMap.activeEndDate} = ?`);
          restoreParams.push(taskData.activeRange?.hasNoEndDate ? null : (taskData.activeRange?.endDate || null));
        }
        if (columnMap.activeHasNoEndDate) {
          restoreSetClauses.push(`${columnMap.activeHasNoEndDate} = ?`);
          restoreParams.push(taskData.activeRange?.hasNoEndDate ? 1 : 0);
        }
        if (columnMap.isOccurrenceRecord) {
          restoreSetClauses.push(`${columnMap.isOccurrenceRecord} = ?`);
          restoreParams.push(taskData.isOccurrenceRecord ? 1 : 0);
        }
        if (columnMap.occurrenceOutcome) {
          restoreSetClauses.push(`${columnMap.occurrenceOutcome} = ?`);
          restoreParams.push(taskData.occurrenceOutcome || 'none');
        }
        if (columnMap.recordedAt) {
          restoreSetClauses.push(`${columnMap.recordedAt} = ?`);
          restoreParams.push(taskData.recordedAt || null);
        }
        if (columnMap.modifyTime) {
          restoreSetClauses.push(`${columnMap.modifyTime} = ?`);
          restoreParams.push(modifyTime);
        }
        if (columnMap.completionTime) {
          restoreSetClauses.push(`${columnMap.completionTime} = NULL`);
        }
        if (columnMap.starAwarded) {
          restoreSetClauses.push(`${columnMap.starAwarded} = 0`);
        }
        if (columnMap.penaltyDeductedPoints) {
          restoreSetClauses.push(`${columnMap.penaltyDeductedPoints} = ?`);
          restoreParams.push(Number(taskData.penaltyDeductedPoints || 0));
        }
        if (columnMap.penaltyRefunded) {
          restoreSetClauses.push(`${columnMap.penaltyRefunded} = ?`);
          restoreParams.push(taskData.penaltyRefunded ? 1 : 0);
        }
        if (columnMap.penaltyRefundTime) {
          restoreSetClauses.push(`${columnMap.penaltyRefundTime} = ?`);
          restoreParams.push(taskData.penaltyRefundTime || null);
        }
        restoreSetClauses.push('status = 0');
        restoreParams.push(taskData.taskId);

        await connection.execute(
          `UPDATE tasks SET ${restoreSetClauses.join(', ')} WHERE task_id = ?`,
          restoreParams
        );
        const restoredRaw = await this._getTaskByIdConn(connection, taskData.taskId);
        const restoredTask = Task.fromDB(restoredRaw);
        if (shouldCreateMessages) {
          await this._createTaskMessagesAfterMutation(restoredTask, 'create', options, operationKey, connection);
        }
        return {
          task: restoredTask,
          idempotent: true,
        };
      }
    }

    const taskId = taskData.taskId || Task.generateId();
    const task = new Task({
      taskId,
      userId,
      ...taskData,
      status: 0,
      modifyTime,
    });

    const insertColumns = [
      'task_id',
      'user_id',
      'title',
      'description',
      'type',
      'date',
      columnMap.startTime,
      columnMap.endTime,
      'points',
      columnMap.pointsExpiry,
      columnMap.isRequired,
      'status',
      '`repeat`',
      columnMap.isAllDay,
      columnMap.penaltyApplied,
    ];
    const insertValues = [
      task.taskId,
      task.userId,
      task.title,
      task.description,
      task.type,
      task.date,
      task.startTime || '',
      task.endTime || '',
      task.points || 0,
      task.pointsExpiry || 'permanent',
      task.isRequired ? 1 : 0,
      task.status,
      task.repeat ? JSON.stringify(task.repeat) : null,
      task.isAllDay ? 1 : 0,
      task.penaltyApplied ? 1 : 0,
    ];

    if (columnMap.duration) {
      insertColumns.push(columnMap.duration);
      insertValues.push(task.duration || 0);
    }
    if (columnMap.reminder) {
      insertColumns.push(columnMap.reminder);
      insertValues.push(task.reminder ? JSON.stringify(task.reminder) : null);
    }
    if (columnMap.hasNoEndDate) {
      insertColumns.push(columnMap.hasNoEndDate);
      insertValues.push(task.hasNoEndDate ? 1 : 0);
    }
    if (columnMap.tags) {
      insertColumns.push(columnMap.tags);
      insertValues.push(task.tags ? JSON.stringify(task.tags) : null);
    }
    if (columnMap.modifyTime) {
      insertColumns.push(columnMap.modifyTime);
      insertValues.push(task.modifyTime || Date.now());
    }
    if (columnMap.parentTaskId) {
      insertColumns.push(columnMap.parentTaskId);
      insertValues.push(task.parentTaskId || null);
    }
    if (columnMap.executionMode) {
      insertColumns.push(columnMap.executionMode);
      insertValues.push(task.executionMode || 'planned');
    }
    if (columnMap.activeStartDate) {
      insertColumns.push(columnMap.activeStartDate);
      insertValues.push(task.activeRange?.startDate || null);
    }
    if (columnMap.activeEndDate) {
      insertColumns.push(columnMap.activeEndDate);
      insertValues.push(task.activeRange?.hasNoEndDate ? null : (task.activeRange?.endDate || null));
    }
    if (columnMap.activeHasNoEndDate) {
      insertColumns.push(columnMap.activeHasNoEndDate);
      insertValues.push(task.activeRange?.hasNoEndDate ? 1 : 0);
    }
    if (columnMap.isOccurrenceRecord) {
      insertColumns.push(columnMap.isOccurrenceRecord);
      insertValues.push(task.isOccurrenceRecord ? 1 : 0);
    }
    if (columnMap.occurrenceOutcome) {
      insertColumns.push(columnMap.occurrenceOutcome);
      insertValues.push(task.occurrenceOutcome || 'none');
    }
    if (columnMap.recordedAt) {
      insertColumns.push(columnMap.recordedAt);
      insertValues.push(task.recordedAt || null);
    }
    if (columnMap.penaltyDeductedPoints) {
      insertColumns.push(columnMap.penaltyDeductedPoints);
      insertValues.push(Number(task.penaltyDeductedPoints || 0));
    }
    if (columnMap.penaltyRefunded) {
      insertColumns.push(columnMap.penaltyRefunded);
      insertValues.push(task.penaltyRefunded ? 1 : 0);
    }
    if (columnMap.penaltyRefundTime) {
      insertColumns.push(columnMap.penaltyRefundTime);
      insertValues.push(task.penaltyRefundTime || null);
    }

    await connection.execute(
      `INSERT INTO tasks (${insertColumns.join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`,
      insertValues
    );

    if (shouldCreateMessages) {
      await this._createTaskMessagesAfterMutation(task, 'create', options, operationKey, connection);
    }

    return {
      task,
      idempotent: false,
    };
  }

  async _materializeRepeatTasksWithConnection(connection, primaryTask, userId, options = {}) {
    if (!this._supportsRepeatMaterialization(primaryTask)) {
      return [];
    }

    const repeatDates = this._buildRepeatDateStrings(primaryTask);
    if (repeatDates.length === 0) {
      return [];
    }

    const materializedTasks = [];
    const baseModifyTime = Number(primaryTask.modifyTime || options.modifyTime || Date.now());

    for (const instanceDate of repeatDates) {
      const childTaskId = this._buildRepeatTaskId(primaryTask.taskId, instanceDate, userId);
      const childTaskData = {
        ...primaryTask.toJSON(),
        taskId: childTaskId,
        date: instanceDate,
        parentTaskId: primaryTask.taskId,
        status: 0,
        starAwarded: false,
        penaltyApplied: false,
        penaltyDeductedPoints: 0,
        penaltyRefunded: false,
        penaltyRefundTime: null,
        completionTime: null,
        modifyTime: baseModifyTime,
      };

      const { task } = await this._createTaskRecordWithConnection(
        connection,
        userId,
        childTaskData,
        {
          ...options,
          createMessages: false,
          columnMap: options.columnMap,
        }
      );
      materializedTasks.push(task);
    }

    return materializedTasks;
  }

  async createTaskWithRepeatMaterialization(userId, taskData, options = {}) {
    try {
      const createValidation = Task.validate(taskData, false);
      if (!createValidation.valid) {
        throw this._createSchemaError(
          createValidation.errorCodes[0] || 'INVALID_PARAMS',
          createValidation.errors.join('；')
        );
      }

      const columnMap = await this._getTaskColumnMap();
      this._assertReminderColumnAvailable(columnMap, '创建任务', taskData.reminder);
      const pool = getPool();
      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();
        const primaryResult = await this._createTaskRecordWithConnection(connection, userId, taskData, {
          ...options,
          columnMap,
          createMessages: options.createMessages !== false,
        });
        const repeatTasks = await this._materializeRepeatTasksWithConnection(
          connection,
          primaryResult.task,
          userId,
          {
            ...options,
            columnMap,
          }
        );

        await connection.commit();
        return {
          primaryTask: primaryResult.task,
          affectedTasks: [primaryResult.task, ...repeatTasks],
          idempotent: primaryResult.idempotent,
        };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('创建任务失败', error);
      throw error;
    }
  }

  /**
   * 创建新任务
   * @param {string} userId - 用户ID
   * @param {Object} taskData - 任务数据
   * @returns {Promise<Task>} 创建的任务实例
   */
  async createTask(userId, taskData, options = {}) {
    const result = await this.createTaskWithRepeatMaterialization(userId, taskData, options);
    return result.primaryTask;
  }

  /**
   * 统计用户任务
   * @param {string} userId - 用户ID
   * @param {Object} filters - 过滤条件
   * @returns {Promise<Object>} 统计结果
   */
  async countTasks(userId, filters = {}) {
    try {
      const { date, status } = filters;
      let sql = 'SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND deleted_at IS NULL';
      const params = [userId];

      if (date) {
        sql += ' AND date = ?';
        params.push(date);
      }

      if (status !== undefined) {
        sql += ' AND status = ?';
        params.push(status);
      }

      const results = await query(sql, params);
      return results[0].count;
    } catch (error) {
      logger.error('统计任务失败', error);
      throw error;
    }
  }
  /**
   * 更新任务
   * @param {string} taskId - 任务ID
   * @param {Object} changes - 允许更新的字段（已白名单过滤）
   * @returns {Promise<Task>} 更新后的任务
   */
  async updateTask(taskId, changes, options = {}) {
    try {
      const columnMap = await this._getTaskColumnMap();
      this._assertReminderColumnAvailable(columnMap, '更新任务', changes.reminder);
      this._assertOccurrenceSchemaAvailable(
        columnMap,
        '更新任务',
        changes.executionMode !== undefined ||
        changes.activeRange !== undefined ||
        changes.isOccurrenceRecord !== undefined ||
        changes.occurrenceOutcome !== undefined ||
        changes.recordedAt !== undefined
      );
      const pool = getPool();
      const connection = await pool.getConnection();
      const ALLOWED_FIELDS = [
        'title', 'description', 'date', 'type', 'startTime', 'endTime',
        'duration', 'isAllDay', 'reminder',
        'points', 'pointsExpiry', 'tags', 'hasNoEndDate', 'repeat',
        'executionMode', 'activeRange', 'isOccurrenceRecord', 'occurrenceOutcome', 'recordedAt'
      ];

      const setClauses = [];
      const params = [];
      const fieldToColumnMap = {
        title: 'title',
        description: 'description',
        date: 'date',
        type: 'type',
        startTime: columnMap.startTime,
        endTime: columnMap.endTime,
        duration: columnMap.duration,
        isAllDay: columnMap.isAllDay,
        reminder: columnMap.reminder,
        points: 'points',
        pointsExpiry: columnMap.pointsExpiry,
        tags: columnMap.tags,
        hasNoEndDate: columnMap.hasNoEndDate,
        repeat: '`repeat`',
        executionMode: columnMap.executionMode,
        isOccurrenceRecord: columnMap.isOccurrenceRecord,
        occurrenceOutcome: columnMap.occurrenceOutcome,
        recordedAt: columnMap.recordedAt,
      };

      for (const field of ALLOWED_FIELDS) {
        if (changes[field] !== undefined) {
          const dbField = fieldToColumnMap[field];
          if (!dbField) {
            logger.warn('更新任务时跳过当前库结构不支持的字段', { taskId, field });
            continue;
          }
          if (field === 'tags' || field === 'repeat' || field === 'reminder') {
            setClauses.push(`${dbField} = ?`);
            if (field === 'reminder') {
              params.push(JSON.stringify(Task.normalizeReminder(changes[field])));
            } else {
              params.push(changes[field] !== null ? JSON.stringify(changes[field]) : null);
            }
          } else if (field === 'activeRange') {
            if (columnMap.activeStartDate) {
              setClauses.push(`${columnMap.activeStartDate} = ?`);
              params.push(changes.activeRange?.startDate || null);
            }
            if (columnMap.activeEndDate) {
              setClauses.push(`${columnMap.activeEndDate} = ?`);
              params.push(changes.activeRange?.hasNoEndDate ? null : (changes.activeRange?.endDate || null));
            }
            if (columnMap.activeHasNoEndDate) {
              setClauses.push(`${columnMap.activeHasNoEndDate} = ?`);
              params.push(changes.activeRange?.hasNoEndDate ? 1 : 0);
            }
          } else {
            setClauses.push(`${dbField} = ?`);
            if (field === 'isOccurrenceRecord') {
              params.push(changes[field] ? 1 : 0);
            } else {
              params.push(changes[field]);
            }
          }
        }
      }

      if (setClauses.length === 0) {
        throw new Error('没有可更新的字段');
      }

      const modifyTime = Number(changes.modifyTime || options.modifyTime || Date.now());
      const operationKey = String(options.operationKey || changes.operationKey || modifyTime);

      if (columnMap.modifyTime) {
        setClauses.push(`${columnMap.modifyTime} = ?`);
        params.push(modifyTime);
      }

      params.push(taskId);

      try {
        await connection.beginTransaction();
        const existingRaw = await this._getTaskByIdConn(connection, taskId);
        if (!existingRaw) {
          await connection.rollback();
          return null;
        }

        const existingTask = Task.fromDB(existingRaw);
        this._assertOccurrenceHistoryWritable(existingTask);
        const mergedValidation = Task.validate({
          ...existingTask.toJSON(),
          ...changes
        }, false, {
          previousTask: existingTask.toJSON()
        });
        if (!mergedValidation.valid) {
          await connection.rollback();
          throw this._createSchemaError(
            mergedValidation.errorCodes[0] || 'INVALID_PARAMS',
            mergedValidation.errors.join('；')
          );
        }

        const sql = `UPDATE tasks SET ${setClauses.join(', ')} WHERE task_id = ? AND deleted_at IS NULL`;
        const [result] = await connection.execute(sql, params);

        if (result.affectedRows === 0) {
          await connection.rollback();
          return null;
        }

        const updatedRaw = await this._getTaskByIdConn(connection, taskId);
        const updatedTask = Task.fromDB(updatedRaw);
        await this._createTaskMessagesAfterMutation(updatedTask, 'update', options, operationKey, connection);
        await connection.commit();
        return updatedTask;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('更新任务失败', error);
      throw error;
    }
  }

  /**
   * 软删除任务
   * @param {string} taskId - 任务ID
   * @returns {Promise<boolean>} 是否成功
   */
  async softDeleteTask(taskId, options = {}) {
    try {
      const columnMap = await this._getTaskColumnMap();
      const pool = getPool();
      const connection = await pool.getConnection();
      const modifyTime = Number(options.modifyTime || Date.now());
      const operationKey = String(options.operationKey || modifyTime);

      try {
        await connection.beginTransaction();
        const existingRaw = await this._getTaskByIdConn(connection, taskId);
        if (!existingRaw) {
          await connection.rollback();
          return false;
        }

        const existingTask = Task.fromDB(existingRaw);
        this._assertOccurrenceHistoryWritable(existingTask);

        const [result] = await connection.execute(
          `UPDATE tasks SET deleted_at = NOW()${columnMap.modifyTime ? `, ${columnMap.modifyTime} = ?` : ''} WHERE task_id = ? AND deleted_at IS NULL`,
          columnMap.modifyTime ? [modifyTime, taskId] : [taskId]
        );
        if (result.affectedRows === 0) {
          await connection.rollback();
          return false;
        }

        await this._createTaskMessagesAfterMutation(Task.fromDB(existingRaw), 'delete', options, operationKey, connection);
        await connection.commit();
        return true;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('软删除任务失败', error);
      throw error;
    }
  }

  /**
   * 更新任务状态（支持显式写入 starAwarded）
   * @param {string} taskId - 任务ID
   * @param {Object} statusData - 状态对象
   * @returns {Promise<Task|null>} 更新后的任务
   */
  async updateTaskStatus(taskId, statusData, options = {}) {
    try {
      const columnMap = await this._getTaskColumnMap();
      const pool = getPool();
      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();
        const existingRaw = await this._getTaskByIdConn(connection, taskId);
        if (!existingRaw) {
          await connection.rollback();
          return null;
        }

        const existing = Task.fromDB(existingRaw);
        const { status, starAwarded } = statusData;
        const now = Number(statusData.modifyTime || options.modifyTime || Date.now());
        const operationKey = String(options.operationKey || statusData.operationKey || now);
        const completionTime = status === 1 ? now : null;
        const resolvedStarAwarded =
          typeof starAwarded === 'boolean'
            ? starAwarded
            : (status === 0 ? false : Boolean(existing.starAwarded));

        if (existing.status === status && Boolean(existing.starAwarded) === resolvedStarAwarded) {
          await connection.rollback();
          return existing;
        }

        const setClauses = ['status = ?'];
        const params = [status];

        if (columnMap.starAwarded) {
          setClauses.push(`${columnMap.starAwarded} = ?`);
          params.push(resolvedStarAwarded ? 1 : 0);
        }
        if (columnMap.completionTime) {
          setClauses.push(`${columnMap.completionTime} = ?`);
          params.push(completionTime);
        }

        let messageAction = status === 1 ? 'complete' : 'reset';
        let refundPoints = 0;
        const backfillWindowResult =
          status === 1 && existing.status !== 1
            ? evaluateTaskBackfillWindow({
              taskDate: existing.date,
              pointsExpiry: existing.pointsExpiry,
              operationTime: now
            })
            : null;

        if (status === 1 && existing.status !== 1) {
          if (backfillWindowResult && backfillWindowResult.allowed === false) {
            throw this._buildTaskBackfillExpiredError(existing, now);
          }

          const refundResult = await this._applyLateMakeupRefundIfNeeded(
            connection,
            existing,
            now,
            operationKey
          );
          if (refundResult.refunded) {
            refundPoints = refundResult.refundPoints;
            messageAction = 'makeup_complete';
            if (columnMap.penaltyRefunded) {
              setClauses.push(`${columnMap.penaltyRefunded} = ?`);
              params.push(1);
            }
            if (columnMap.penaltyRefundTime) {
              setClauses.push(`${columnMap.penaltyRefundTime} = ?`);
              params.push(now);
            }
          } else if (backfillWindowResult?.isHistorical) {
            messageAction = 'history_complete';
          }
        }

        if (status === 0 && existing.status === 1) {
          const revokeResult = await this._revokeLateMakeupRefundIfNeeded(
            connection,
            existing,
            operationKey,
            now
          );
          if (revokeResult.revoked) {
            if (columnMap.penaltyRefunded) {
              setClauses.push(`${columnMap.penaltyRefunded} = ?`);
              params.push(0);
            }
            if (columnMap.penaltyRefundTime) {
              setClauses.push(`${columnMap.penaltyRefundTime} = NULL`);
            }
          }
        }

        if (columnMap.modifyTime) {
          setClauses.push(`${columnMap.modifyTime} = ?`);
          params.push(now);
        }

        params.push(taskId);
        const [result] = await connection.execute(
          `UPDATE tasks SET ${setClauses.join(', ')} WHERE task_id = ? AND deleted_at IS NULL`,
          params
        );

        if (result.affectedRows === 0) {
          await connection.rollback();
          return null;
        }

        const updatedRaw = await this._getTaskByIdConn(connection, taskId);
        const updatedTask = Task.fromDB(updatedRaw);
        await this._createTaskMessagesAfterMutation(
          updatedTask,
          messageAction,
          {
            ...options,
            refundPoints,
          },
          operationKey,
          connection
        );
        await connection.commit();
        return updatedTask;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('更新任务状态失败', error);
      throw error;
    }
  }

  async recordOccurrenceResult(taskId, payload = {}, options = {}) {
    try {
      const columnMap = await this._getTaskColumnMap();
      this._assertOccurrenceSchemaAvailable(columnMap, '记录表现', true);
      const pool = getPool();
      const connection = await pool.getConnection();
      const outcome = payload.outcome;
      const targetUserId = payload.targetUserId || payload.userId || null;
      const date = payload.date || this._formatDate(new Date());
      const modifyTime = Number(payload.modifyTime || options.modifyTime || Date.now());
      const operationKey = String(payload.operationKey || options.operationKey || modifyTime);
      const today = this._formatDate(new Date(modifyTime));

      if (!targetUserId) {
        const error = new Error('targetUserId 不能为空');
        error.code = 'INVALID_PARAMS';
        throw error;
      }

      if (!['success', 'failure'].includes(outcome)) {
        const error = new Error('outcome 必须为 success/failure');
        error.code = 'INVALID_PARAMS';
        throw error;
      }

      if (date > today) {
        const error = new Error('未来日期不能记录表现');
        error.code = 'TASK_OCCURRENCE_FUTURE_DATE';
        throw error;
      }

      try {
        await connection.beginTransaction();
        const configRaw = await this._getTaskByIdConn(connection, taskId);
        if (!configRaw) {
          await connection.rollback();
          return null;
        }

        const configTask = Task.fromDB(configRaw);
        if (!configTask.isOccurrenceConfigTask()) {
          const error = new Error('当前任务不是表现项配置任务');
          error.code = 'TASK_OCCURRENCE_INVALID_TASK';
          throw error;
        }

        if (!configTask.canRecordOccurrenceOn(date)) {
          const error = new Error('该日期不在表现项有效时间内');
          error.code = 'TASK_OCCURRENCE_DATE_OUT_OF_RANGE';
          throw error;
        }

        const [existingRows] = await connection.execute(
          `SELECT * FROM tasks
           WHERE ${columnMap.parentTaskId} = ?
             AND user_id = ?
             AND date = ?
             AND deleted_at IS NULL
             AND ${columnMap.executionMode} = 'occurrence'
             AND ${columnMap.isOccurrenceRecord} = 1
           LIMIT 1`,
          [configTask.taskId, targetUserId, date]
        );
        const existingRecord = existingRows[0] ? Task.fromDB(existingRows[0]) : null;
        const previousOutcome = existingRecord?.occurrenceOutcome || 'none';

        if (existingRecord && previousOutcome === outcome) {
          await connection.commit();
          const response = this.buildTaskMutationResponse({
            primaryTask: configTask,
            affectedTasks: [configTask, existingRecord],
            operation: 'occurrence_record',
            idempotent: true,
          });
          response.configTask = configTask.toJSON();
          response.recordTask = existingRecord.toJSON();
          response.starsAwarded = existingRecord.starAwarded === true;
          return response;
        }

        const recordTask = existingRecord || new Task({
          ...configTask.toJSON(),
          taskId: this._buildOccurrenceRecordTaskId(configTask.taskId, targetUserId, date),
          userId: targetUserId,
          date,
          description: configTask.description || '',
          parentTaskId: configTask.taskId,
          executionMode: 'occurrence',
          activeRange: null,
          isOccurrenceRecord: true,
          occurrenceOutcome: 'none',
          recordedAt: null,
          repeat: null,
          isRequired: false,
          isAllDay: false,
          startTime: '',
          endTime: '',
          duration: 0,
          reminder: { enabled: false, time: 0 },
          status: 0,
          completionTime: null,
          starAwarded: false,
          modifyTime,
          hasNoEndDate: false,
        });

        recordTask.title = configTask.title;
        recordTask.description = configTask.description || '';
        recordTask.type = configTask.type;
        recordTask.points = configTask.points;
        recordTask.pointsExpiry = configTask.pointsExpiry;
        recordTask.parentTaskId = configTask.taskId;
        recordTask.applyOccurrenceOutcome(outcome, {
          recordedAt: modifyTime,
          date,
        });

        if (previousOutcome === 'success' && existingRecord?.starAwarded && Number(existingRecord.points || 0) > 0) {
          await starService.upsertStarRecordWithConnection(
            connection,
            existingRecord.userId,
            {
              recordId: this._buildOccurrenceStarRecordId('revoke', existingRecord.taskId, operationKey),
              type: 'expense',
              source: 'task',
              sourceId: existingRecord.taskId,
              points: -Math.abs(Number(existingRecord.points || 0)),
              description: `撤销表现达成: ${existingRecord.title}`,
              expiryType: existingRecord.pointsExpiry || 'permanent',
              expiryDate: null,
              originalTaskDate: existingRecord.date || null,
              requestedPoints: Number(existingRecord.points || 0),
              idempotencyKey: `task_occurrence_revoke:${existingRecord.taskId}:${operationKey}`,
              data: {
                sourceType: 'task_occurrence_revoke',
                taskId: existingRecord.taskId,
                operationKey,
              },
              modifyTime,
            }
          );
          recordTask.starAwarded = false;
        }

        if (outcome === 'success' && Number(recordTask.points || 0) > 0) {
          await starService.grantStarsWithConnection(
            connection,
            recordTask.userId,
            {
              recordId: this._buildOccurrenceStarRecordId('success', recordTask.taskId, operationKey),
              source: 'task',
              sourceId: recordTask.taskId,
              requestedPoints: Number(recordTask.points || 0),
              reason: `记录表现达成: ${recordTask.title}`,
              expiryType: recordTask.pointsExpiry || 'permanent',
              expiryDate: null,
              idempotencyKey: `task_occurrence_success:${recordTask.taskId}:${operationKey}`,
              data: {
                sourceType: 'task_occurrence_success',
                taskId: recordTask.taskId,
                operationKey,
              },
              modifyTime,
            }
          );
          recordTask.starAwarded = true;
        } else {
          recordTask.starAwarded = false;
        }

        const recordDb = recordTask.toDB();
        const existingRecordRaw = await this._getTaskByIdConn(connection, recordTask.taskId, true);
        if (existingRecordRaw && !existingRecordRaw.deleted_at) {
          const updateClauses = [
            'title = ?',
            'description = ?',
            'type = ?',
            'date = ?',
            `${columnMap.pointsExpiry} = ?`,
            'points = ?',
            `${columnMap.executionMode} = ?`,
            `${columnMap.isOccurrenceRecord} = ?`,
            `${columnMap.occurrenceOutcome} = ?`,
            `${columnMap.recordedAt} = ?`,
            'status = ?',
            `${columnMap.starAwarded} = ?`,
            `${columnMap.completionTime} = ?`,
            `${columnMap.modifyTime} = ?`
          ];
          const updateParams = [
            recordDb.title,
            recordDb.description,
            recordDb.type,
            recordDb.date,
            recordDb[columnMap.pointsExpiry] || recordTask.pointsExpiry || 'permanent',
            recordDb.points,
            recordDb.execution_mode,
            recordDb.is_occurrence_record,
            recordDb.occurrence_outcome,
            recordDb.recorded_at,
            recordDb.status,
            recordDb.star_awarded,
            recordDb.completion_time,
            modifyTime,
            recordTask.taskId
          ];

          await connection.execute(
            `UPDATE tasks SET ${updateClauses.join(', ')} WHERE task_id = ? AND deleted_at IS NULL`,
            updateParams
          );
        } else {
          await this._createTaskRecordWithConnection(connection, targetUserId, recordTask.toJSON(), {
            ...options,
            columnMap,
            createMessages: false,
            modifyTime,
            operationKey
          });
          await connection.execute(
            `UPDATE tasks
             SET status = ?,
                 ${columnMap.starAwarded} = ?,
                 ${columnMap.completionTime} = ?,
                 ${columnMap.modifyTime} = ?
             WHERE task_id = ? AND deleted_at IS NULL`,
            [
              recordTask.status,
              recordTask.starAwarded ? 1 : 0,
              recordTask.completionTime || null,
              modifyTime,
              recordTask.taskId
            ]
          );
        }

        let messageAction = null;
        if (outcome === 'success') {
          messageAction = date < today ? 'history_complete' : 'complete';
        } else if (previousOutcome === 'success') {
          messageAction = 'reset';
        }

        if (messageAction) {
          await this._createTaskMessagesAfterMutation(
            recordTask,
            messageAction,
            options,
            operationKey,
            connection
          );
        }

        const updatedRecordRaw = await this._getTaskByIdConn(connection, recordTask.taskId);
        const updatedRecord = Task.fromDB(updatedRecordRaw);
        await connection.commit();

        const response = this.buildTaskMutationResponse({
          primaryTask: configTask,
          affectedTasks: [configTask, updatedRecord],
          operation: 'occurrence_record',
        });
        response.configTask = configTask.toJSON();
        response.recordTask = updatedRecord.toJSON();
        response.starsAwarded = updatedRecord.starAwarded === true;
        return response;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('记录表现失败', error);
      throw error;
    }
  }

  async disableOccurrenceTask(taskId, payload = {}, options = {}) {
    try {
      const columnMap = await this._getTaskColumnMap();
      this._assertOccurrenceSchemaAvailable(columnMap, '停用表现项', true);
      const pool = getPool();
      const connection = await pool.getConnection();
      const disableFromDate = payload.disableFromDate || this._formatDate(new Date());
      const modifyTime = Number(payload.modifyTime || options.modifyTime || Date.now());
      const operationKey = String(payload.operationKey || options.operationKey || modifyTime);

      try {
        await connection.beginTransaction();
        const existingRaw = await this._getTaskByIdConn(connection, taskId);
        if (!existingRaw) {
          await connection.rollback();
          return null;
        }

        const existingTask = Task.fromDB(existingRaw);
        if (!existingTask.isOccurrenceConfigTask()) {
          const error = new Error('当前任务不是表现项配置任务');
          error.code = 'TASK_OCCURRENCE_INVALID_TASK';
          throw error;
        }
        this._assertOccurrenceHistoryWritable(existingTask);

        const nextEndDateCandidate = this._shiftDate(disableFromDate, -1);
        const currentEndDate = existingTask.activeRange?.hasNoEndDate
          ? null
          : (existingTask.activeRange?.endDate || null);
        const nextEndDate = currentEndDate && nextEndDateCandidate
          ? (currentEndDate < nextEndDateCandidate ? currentEndDate : nextEndDateCandidate)
          : nextEndDateCandidate;

        const updateClauses = [
          `${columnMap.activeEndDate} = ?`,
          `${columnMap.activeHasNoEndDate} = 0`,
          `${columnMap.modifyTime} = ?`
        ];
        const updateParams = [nextEndDate, modifyTime];

        if (columnMap.hasNoEndDate) {
          updateClauses.splice(2, 0, `${columnMap.hasNoEndDate} = 0`);
        }

        const [result] = await connection.execute(
          `UPDATE tasks
           SET ${updateClauses.join(', ')}
           WHERE task_id = ? AND deleted_at IS NULL`,
          [...updateParams, taskId]
        );

        if (result.affectedRows === 0) {
          await connection.rollback();
          return null;
        }

        const updatedRaw = await this._getTaskByIdConn(connection, taskId);
        const updatedTask = Task.fromDB(updatedRaw);
        await connection.commit();

        const response = this.buildTaskMutationResponse({
          primaryTask: updatedTask,
          affectedTasks: [updatedTask],
          operation: 'disable_occurrence',
        });
        response.disabledTask = updatedTask.toJSON();
        response.disabledFromDate = disableFromDate;
        return response;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('停用表现项失败', error);
      throw error;
    }
  }

  async convertTaskToOccurrenceMode(taskId, payload = {}, options = {}) {
    try {
      const columnMap = await this._getTaskColumnMap();
      this._assertOccurrenceSchemaAvailable(columnMap, '切换表现项', true);
      const pool = getPool();
      const connection = await pool.getConnection();
      const effectiveFromDate = payload.effectiveFromDate || this._formatDate(new Date());
      const modifyTime = Number(payload.modifyTime || options.modifyTime || Date.now());
      const operationKey = String(payload.operationKey || options.operationKey || modifyTime);

      try {
        await connection.beginTransaction();
        const existingRaw = await this._getTaskByIdConn(connection, taskId);
        if (!existingRaw) {
          await connection.rollback();
          return null;
        }

        const existingTask = Task.fromDB(existingRaw);
        if (existingTask.isOccurrenceConfigTask()) {
          await connection.commit();
          const response = this.buildTaskMutationResponse({
            primaryTask: existingTask,
            affectedTasks: [existingTask],
            operation: 'convert_occurrence',
            idempotent: true,
          });
          response.convertedTask = existingTask.toJSON();
          response.archivedFutureTaskIds = [];
          return response;
        }

        if (existingTask.isOccurrenceRecordTask()) {
          const error = new Error('表现记录实例不能切换为表现项配置');
          error.code = 'TASK_OCCURRENCE_INVALID_TASK';
          throw error;
        }

        const [childRows] = await connection.execute(
          `SELECT * FROM tasks
           WHERE ${columnMap.parentTaskId} = ?
             AND deleted_at IS NULL
           ORDER BY date ASC`,
          [taskId]
        );

        const archivedFutureTaskIds = [];
        for (const row of childRows) {
          const childTask = Task.fromDB(row);
          if (childTask.date < effectiveFromDate) {
            continue;
          }
          if (Number(childTask.status) === 1 || childTask.starAwarded) {
            continue;
          }

          const [deleteResult] = await connection.execute(
            `UPDATE tasks
             SET deleted_at = NOW(), ${columnMap.modifyTime} = ?
             WHERE task_id = ? AND deleted_at IS NULL`,
            [modifyTime, childTask.taskId]
          );
          if (deleteResult.affectedRows > 0) {
            archivedFutureTaskIds.push(childTask.taskId);
          }
        }

        const nextHasNoEndDate = existingTask.hasNoEndDate || !existingTask.repeat?.endDate;
        const nextActiveRange = {
          startDate: effectiveFromDate,
          endDate: nextHasNoEndDate ? '' : (existingTask.repeat?.endDate || ''),
          hasNoEndDate: nextHasNoEndDate,
        };

        const updateClauses = [
          `date = ?`,
          `${columnMap.executionMode} = 'occurrence'`,
          `${columnMap.activeStartDate} = ?`,
          `${columnMap.activeEndDate} = ?`,
          `${columnMap.activeHasNoEndDate} = ?`,
          `${columnMap.isRequired} = 0`,
          `${columnMap.startTime} = ''`,
          `${columnMap.endTime} = ''`,
          '`repeat` = NULL',
          `${columnMap.isAllDay} = 0`
        ];
        const updateParams = [
          effectiveFromDate,
          nextActiveRange.startDate,
          nextActiveRange.hasNoEndDate ? null : (nextActiveRange.endDate || null),
          nextActiveRange.hasNoEndDate ? 1 : 0
        ];

        if (columnMap.reminder) {
          updateClauses.push(`${columnMap.reminder} = ?`);
          updateParams.push(JSON.stringify({ enabled: false, time: 0 }));
        }
        if (columnMap.duration) {
          updateClauses.push(`${columnMap.duration} = 0`);
        }
        if (columnMap.hasNoEndDate) {
          updateClauses.push(`${columnMap.hasNoEndDate} = ?`);
          updateParams.push(nextActiveRange.hasNoEndDate ? 1 : 0);
        }
        if (columnMap.modifyTime) {
          updateClauses.push(`${columnMap.modifyTime} = ?`);
          updateParams.push(modifyTime);
        }

        updateParams.push(taskId);
        const [result] = await connection.execute(
          `UPDATE tasks SET ${updateClauses.join(', ')} WHERE task_id = ? AND deleted_at IS NULL`,
          updateParams
        );

        if (result.affectedRows === 0) {
          await connection.rollback();
          return null;
        }

        const updatedRaw = await this._getTaskByIdConn(connection, taskId);
        const updatedTask = Task.fromDB(updatedRaw);
        await connection.commit();

        const response = this.buildTaskMutationResponse({
          primaryTask: updatedTask,
          affectedTasks: [updatedTask],
          operation: 'convert_occurrence',
        });
        response.convertedTask = updatedTask.toJSON();
        response.archivedFutureTaskIds = archivedFutureTaskIds;
        return response;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('切换表现项失败', error);
      throw error;
    }
  }

  async markTaskRequired(taskId, options = {}) {
    return this._updateTaskRequiredState(taskId, true, options);
  }

  async unmarkTaskRequired(taskId, options = {}) {
    return this._updateTaskRequiredState(taskId, false, options);
  }

  async syncRequiredTaskPenalties(options = {}) {
    try {
      const scanUserIds = await this._resolvePenaltyScanUserIds(options);
      const asOfDate = this._formatDate(new Date(Number(options.modifyTime || Date.now()))) || this._formatDate(new Date());
      if (scanUserIds.length === 0) {
        return {
          success: true,
          penaltyCount: 0,
          failureCount: 0,
          affectedTaskIds: [],
          penaltyResults: [],
          failedTaskIds: [],
        };
      }

      const tasks = await this._getExpiredRequiredTasksForPenalty(scanUserIds, asOfDate);
      const baseOperationKey = String(options.operationKey || options.modifyTime || Date.now());
      const penaltyResults = [];
      const failedTaskIds = [];

      for (const task of tasks) {
        try {
          const result = await this._applyRequiredTaskPenalty(task.taskId, {
            actorUserId: null,
            actorRole: 'system',
            familyId: options.familyId || null,
            operationKey: `${baseOperationKey}:${task.taskId}`,
            modifyTime: Number(options.modifyTime || Date.now()),
            asOfDate,
          });

          if (result?.success) {
            penaltyResults.push(result);
          }
        } catch (error) {
          failedTaskIds.push(task.taskId);
          logger.error('同步必做任务惩罚时单任务执行失败', {
            taskId: task.taskId,
            userId: task.userId,
            error: error.message,
          });
        }
      }

      return {
        success: true,
        penaltyCount: penaltyResults.length,
        failureCount: failedTaskIds.length,
        affectedTaskIds: penaltyResults.map(result => result.task.taskId),
        penaltyResults: penaltyResults.map(result => ({
          success: true,
          taskId: result.task.taskId,
          penaltyPoints: result.penaltyPoints,
          targetUserId: result.targetUserId,
        })),
        failedTaskIds,
      };
    } catch (error) {
      logger.error('同步必做任务惩罚失败', error);
      throw error;
    }
  }

  async syncUpcomingTaskMessages(options = {}) {
    try {
      const scanUserIds = await this._resolvePenaltyScanUserIds(options);
      const columnMap = await this._getTaskColumnMap();
      if (scanUserIds.length === 0) {
        return {
          success: true,
          createdCount: 0,
          dedupedCount: 0,
          archivedCount: 0,
          activeCount: 0,
          affectedTaskIds: [],
        };
      }
      this._assertReminderColumnAvailable(columnMap, '同步 upcoming 任务消息', { enabled: true });

      const tasks = await this._getUpcomingTasksForReminder(scanUserIds);
      const now = Number(options.modifyTime || Date.now());
      const candidates = tasks
        .map(task => this._resolveUpcomingReminderCandidate(task, now))
        .filter(Boolean);

      const pool = getPool();
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const existingMessages = await this._getActiveUpcomingMessagesBySubjectConn(connection, scanUserIds);
        const existingCompositeKeys = new Set(
          existingMessages.map(message => this._buildUpcomingMessageCompositeKey(message))
        );
        const activeCompositeKeys = new Set();
        const affectedTaskIds = new Set();

        for (const candidate of candidates) {
          const savedMessages = await messageService.createTaskMessages({
            task: candidate.task,
            familyId: options.familyId || null,
            action: 'upcoming',
            actorUserId: null,
            actorRole: 'system',
            operationKey: candidate.instanceKey,
            upcomingMeta: {
              remainingMinutes: candidate.remainingMinutes,
              remainingText: candidate.remainingText,
              isRequired: candidate.task.isRequired === true,
            },
            createTimeOverride: candidate.reminderTime,
          }, connection);

          savedMessages.forEach((message) => {
            activeCompositeKeys.add(this._buildUpcomingMessageCompositeKey(message));
            affectedTaskIds.add(message.relatedId);
          });
        }

        const staleMessageIds = existingMessages
          .filter(message => !activeCompositeKeys.has(this._buildUpcomingMessageCompositeKey(message)))
          .map(message => message.messageId);

        if (staleMessageIds.length > 0) {
          const placeholders = staleMessageIds.map(() => '?').join(', ');
          await connection.execute(
            `UPDATE messages
             SET is_archived = 1
             WHERE message_id IN (${placeholders})
               AND deleted_at IS NULL`,
            staleMessageIds
          );
        }

        await connection.commit();

        let createdCount = 0;
        let dedupedCount = 0;
        activeCompositeKeys.forEach((key) => {
          if (existingCompositeKeys.has(key)) {
            dedupedCount += 1;
          } else {
            createdCount += 1;
          }
        });

        return {
          success: true,
          createdCount,
          updatedCount: dedupedCount,
          dedupedCount,
          archivedCount: staleMessageIds.length,
          activeCount: activeCompositeKeys.size,
          affectedTaskIds: Array.from(affectedTaskIds),
        };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('同步 upcoming 任务消息失败', error);
      throw error;
    }
  }

  /**
   * 获取同一家庭下所有孩子的任务
   * @param {string} familyId - 家庭ID
   * @param {Object} filters - 过滤条件
   * @returns {Promise<Array<Task>>} 任务列表
   */
  async getTasksByFamily(familyId, filters = {}) {
    try {
      const { date, status, startDate, endDate } = filters;
      const includeOccurrence = filters.includeOccurrence === true;
      const occurrenceMode = filters.occurrenceMode || 'all';
      const includeInactive = filters.includeInactive === true;
      const columnMap = await this._getTaskColumnMap();
      this._assertOccurrenceSchemaAvailable(
        columnMap,
        '查询家庭任务',
        includeOccurrence || occurrenceMode !== 'all' || includeInactive
      );

      let sql = `SELECT t.* FROM tasks t
        INNER JOIN users u ON t.user_id = u.user_id
        WHERE u.family_id = ? AND u.role = 'child' AND u.status = 'active' AND t.deleted_at IS NULL`;
      const params = [familyId];

      if (this._hasOccurrenceSchema(columnMap)) {
        if (!includeOccurrence) {
          sql += ` AND (t.${columnMap.executionMode} IS NULL OR t.${columnMap.executionMode} = 'planned')`;
        } else if (occurrenceMode === 'config') {
          sql += ` AND t.${columnMap.executionMode} = 'occurrence' AND t.${columnMap.isOccurrenceRecord} = 0`;
        } else if (occurrenceMode === 'record') {
          sql += ` AND t.${columnMap.executionMode} = 'occurrence' AND t.${columnMap.isOccurrenceRecord} = 1`;
        }
      }

      const isOccurrenceConfigQuery = includeOccurrence && occurrenceMode === 'config' && this._hasOccurrenceSchema(columnMap);

      if (date && isOccurrenceConfigQuery) {
        if (!includeInactive) {
          sql += ` AND t.${columnMap.activeStartDate} <= ? AND (t.${columnMap.activeHasNoEndDate} = 1 OR t.${columnMap.activeEndDate} IS NULL OR t.${columnMap.activeEndDate} >= ?)`;
          params.push(date, date);
        }
      } else if (date) {
        sql += ' AND t.date = ?';
        params.push(date);
      }

      if (startDate && endDate && isOccurrenceConfigQuery) {
        if (!includeInactive) {
          sql += ` AND t.${columnMap.activeStartDate} <= ? AND (t.${columnMap.activeHasNoEndDate} = 1 OR t.${columnMap.activeEndDate} IS NULL OR t.${columnMap.activeEndDate} >= ?)`;
          params.push(endDate, startDate);
        }
      } else if (startDate && endDate) {
        sql += ' AND t.date >= ? AND t.date <= ?';
        params.push(startDate, endDate);
      }

      if (status !== undefined && !isOccurrenceConfigQuery) {
        sql += ' AND t.status = ?';
        params.push(status);
      }

      sql += ' ORDER BY t.created_at DESC';

      const results = await query(sql, params);
      return results.map(record => Task.fromDB(record));
    } catch (error) {
      logger.error('获取家庭任务列表失败', error);
      throw error;
    }
  }

  /**
   * 将家长名下的所有任务批量转移给指定孩子
   * @param {string} fromUserId 家长 userId（来自 JWT，不信任客户端）
   * @param {string} toUserId   目标孩子 userId
   * @param {string} familyId   家长所属家庭 ID
   * @param {Object} options    操作上下文
   * @returns {number} 实际迁移的任务数量
   */
  async transferTasksToChild(fromUserId, toUserId, familyId, options = {}) {
    const pool = getPool();
    const connection = await pool.getConnection();
    const modifyTime = Number(options.modifyTime || Date.now());
    const operationKey = String(options.operationKey || modifyTime);

    try {
      await connection.beginTransaction();

      const [targetRows] = await connection.execute(
        "SELECT user_id FROM users WHERE user_id = ? AND family_id = ? AND role = 'child' AND status = 'active' LIMIT 1",
        [toUserId, familyId]
      );
      if (!targetRows.length) {
        const err = new Error('目标用户不是同家庭的孩子成员');
        err.code = 'TRANSFER_TARGET_INVALID';
        throw err;
      }

      const [taskRows] = await connection.execute(
        'SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at ASC',
        [fromUserId]
      );

      if (!taskRows.length) {
        await connection.commit();
        logger.info('任务归属转移完成', { fromUserId, toUserId, count: 0 });
        return 0;
      }

      const [result] = await connection.execute(
        'UPDATE tasks SET user_id = ? WHERE user_id = ? AND deleted_at IS NULL',
        [toUserId, fromUserId]
      );

      for (const row of taskRows) {
        const transferredTask = Task.fromDB({
          ...row,
          user_id: toUserId,
          modify_time: modifyTime,
        });
        await messageService.createTaskMessages({
          task: transferredTask,
          familyId,
          action: 'assign',
          actorUserId: fromUserId,
          actorRole: options.actorRole || 'parent',
          operationKey: `${operationKey}:${transferredTask.taskId}`,
          createTimeOverride: modifyTime,
        }, connection);
      }

      await connection.commit();
      logger.info('任务归属转移完成', { fromUserId, toUserId, count: result.affectedRows });
      return result.affectedRows;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async _getTaskByIdConn(connection, taskId, includeDeleted = false) {
    const sql = includeDeleted
      ? 'SELECT * FROM tasks WHERE task_id = ? LIMIT 1'
      : 'SELECT * FROM tasks WHERE task_id = ? AND deleted_at IS NULL LIMIT 1';
    const [rows] = await connection.execute(sql, [taskId]);
    return rows[0] || null;
  }

  async _resolvePenaltyScanUserIds(options = {}) {
    const { viewerUserId, viewerRole, familyId, scope = null, targetUserId = null } = options;

    if (!viewerUserId) {
      return [];
    }

    if (scope === 'user') {
      return [targetUserId || viewerUserId];
    }

    if (viewerRole === 'parent' && familyId) {
      const members = await query(
        `SELECT user_id
         FROM users
         WHERE family_id = ?
           AND role = 'child'
           AND status = 'active'`,
        [familyId]
      );
      return members.map(row => row.user_id);
    }

    return [viewerUserId];
  }

  async _getExpiredRequiredTasksForPenalty(userIds = [], asOfDate = null) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return [];
    }

    const columnMap = await this._getTaskColumnMap();
    const effectiveAsOfDate = asOfDate || this._formatDate(new Date());
    const placeholders = userIds.map(() => '?').join(', ');
    const rows = await query(
      `SELECT * FROM tasks
       WHERE user_id IN (${placeholders})
         AND deleted_at IS NULL
         AND date < ?
         AND ${columnMap.isRequired} = 1
         AND ${columnMap.penaltyApplied} = 0
         AND status <> 1
       ORDER BY date ASC, created_at ASC`,
      userIds.concat(effectiveAsOfDate)
    );

    return rows.map(row => Task.fromDB(row));
  }

  async _getUpcomingTasksForReminder(userIds = []) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return [];
    }

    const columnMap = await this._getTaskColumnMap();
    if (!columnMap.reminder) {
      return [];
    }

    const placeholders = userIds.map(() => '?').join(', ');
    const rows = await query(
      `SELECT * FROM tasks
       WHERE user_id IN (${placeholders})
         AND deleted_at IS NULL
         AND status = 0
         AND ${columnMap.reminder} IS NOT NULL
         AND date >= CURDATE()
         AND date <= DATE_ADD(CURDATE(), INTERVAL 1 DAY)
       ORDER BY date ASC, created_at ASC`,
      userIds
    );

    return rows.map(row => Task.fromDB(row));
  }

  _resolveUpcomingReminderCandidate(task, nowTimestamp = Date.now()) {
    if (!task || !task.reminder || task.reminder.enabled !== true) {
      return null;
    }

    let taskStartTime = null;
    if (task.startTime) {
      taskStartTime = new Date(`${task.date}T${task.startTime}`);
    } else if (Number(task.reminder.time) === -1) {
      taskStartTime = new Date(`${task.date}T00:00:00`);
    } else {
      return null;
    }

    if (Number.isNaN(taskStartTime.getTime())) {
      return null;
    }

    let reminderTime = null;
    const reminderOffset = Number(task.reminder.time);
    if (reminderOffset === -1) {
      reminderTime = new Date(taskStartTime.getTime() - 24 * 60 * 60 * 1000);
      reminderTime.setHours(20, 0, 0, 0);
    } else {
      reminderTime = new Date(taskStartTime.getTime() - reminderOffset * 60 * 1000);
    }

    if (Number.isNaN(reminderTime.getTime())) {
      return null;
    }

    const remainingMinutes = Math.floor((taskStartTime.getTime() - nowTimestamp) / (1000 * 60));
    const reminderDiffMinutes = Math.floor((reminderTime.getTime() - nowTimestamp) / (1000 * 60));
    if (reminderDiffMinutes > 0 || remainingMinutes <= 0) {
      return null;
    }

    return {
      task,
      instanceKey: task.date || task.taskId,
      reminderTime: reminderTime.getTime(),
      remainingMinutes,
      remainingText: this._formatUpcomingRemainingText(remainingMinutes),
      dayLabel: !task.startTime ? this._formatUpcomingDayLabel(task.date, nowTimestamp) : null,
    };
  }

  _formatUpcomingRemainingText(remainingMinutes) {
    const totalMinutes = Math.max(1, Number(remainingMinutes || 0));
    if (totalMinutes < 60) {
      return `${totalMinutes}分钟`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (minutes === 0) {
      return `${hours}小时`;
    }
    return `${hours}小时${minutes}分钟`;
  }

  _formatUpcomingDayLabel(taskDate, nowTimestamp = Date.now()) {
    if (!taskDate) {
      return '当天';
    }

    const now = new Date(nowTimestamp);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(`${taskDate}T00:00:00`);
    if (Number.isNaN(target.getTime())) {
      return taskDate;
    }

    const diffDays = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays === 0) {
      return '今天';
    }
    if (diffDays === 1) {
      return '明天';
    }
    return taskDate;
  }

  async _getActiveUpcomingMessagesBySubjectConn(connection, subjectUserIds = []) {
    if (!Array.isArray(subjectUserIds) || subjectUserIds.length === 0) {
      return [];
    }

    const placeholders = subjectUserIds.map(() => '?').join(', ');
    const [rows] = await connection.execute(
      `SELECT * FROM messages
       WHERE deleted_at IS NULL
         AND is_archived = 0
         AND notification_type = 'task_upcoming'
         AND subject_user_id IN (${placeholders})`,
      subjectUserIds
    );
    return rows.map(row => Message.fromDB ? Message.fromDB(row) : row);
  }

  _buildUpcomingMessageCompositeKey(message) {
    return `${message.visibilityScope || message.visibility_scope}:${message.messageEventKey || message.message_event_key}`;
  }

  async _applyLateMakeupRefundIfNeeded(connection, task, modifyTime, operationKey) {
    const penaltyDeductedPoints = Number(task?.penaltyDeductedPoints || 0);
    if (!task || !task.penaltyApplied || task.penaltyRefunded || penaltyDeductedPoints <= 0) {
      return {
        refunded: false,
        refundPoints: 0,
      };
    }

    const refundIdempotencyKey = `task_makeup_refund:${task.taskId}:${operationKey}`;
    await starService.grantStarsWithConnection(
      connection,
      task.userId,
      {
        recordId: `task_makeup_refund_${task.taskId}_${operationKey}`,
        source: 'task',
        sourceId: task.taskId,
        requestedPoints: penaltyDeductedPoints,
        reason: `逾期补做退回: ${task.title}`,
        expiryType: 'permanent',
        expiryDate: null,
        idempotencyKey: refundIdempotencyKey,
        data: {
          sourceType: 'task_makeup_refund',
          taskId: task.taskId,
          operationKey,
        },
        modifyTime,
      }
    );

    return {
      refunded: true,
      refundPoints: penaltyDeductedPoints,
    };
  }

  async _revokeLateMakeupRefundIfNeeded(connection, task, operationKey, modifyTime) {
    const penaltyDeductedPoints = Number(task?.penaltyDeductedPoints || 0);
    if (!task || !task.penaltyRefunded || penaltyDeductedPoints <= 0) {
      return {
        revoked: false,
        revokePoints: 0,
      };
    }

    await starService.upsertStarRecordWithConnection(
      connection,
      task.userId,
      {
        recordId: `task_makeup_refund_revoke_${task.taskId}_${operationKey}`,
        type: 'expense',
        source: 'task',
        sourceId: task.taskId,
        points: -penaltyDeductedPoints,
        description: `撤销逾期补做退星: ${task.title}`,
        expiryType: 'permanent',
        expiryDate: null,
        originalTaskDate: task.date || null,
        requestedPoints: penaltyDeductedPoints,
        idempotencyKey: `task_makeup_refund_revoke:${task.taskId}:${operationKey}`,
        data: {
          sourceType: 'task_makeup_refund_revoke',
          taskId: task.taskId,
          operationKey,
        },
        modifyTime,
      }
    );

    return {
      revoked: true,
      revokePoints: penaltyDeductedPoints,
    };
  }

  async _applyRequiredTaskPenalty(taskId, options = {}) {
    try {
      const columnMap = await this._getTaskColumnMap();
      const pool = getPool();
      const connection = await pool.getConnection();
      const modifyTime = Number(options.modifyTime || Date.now());
      const operationKey = String(options.operationKey || modifyTime);

      try {
        await connection.beginTransaction();
        const existingRaw = await this._getTaskByIdConn(connection, taskId);
        if (!existingRaw) {
          await connection.rollback();
          return null;
        }

        const existingTask = Task.fromDB(existingRaw);
        const asOfDate = options.asOfDate || this._formatDate(new Date(modifyTime)) || this._formatDate(new Date());
        if (
          !existingTask.isRequired ||
          existingTask.penaltyApplied ||
          existingTask.status === 1 ||
          !existingTask.date ||
          existingTask.date >= asOfDate
        ) {
          await connection.commit();
          return {
            success: false,
            skipped: true,
            task: existingTask,
            penaltyPoints: 0,
            targetUserId: existingTask.userId,
          };
        }

        const requestedPoints = Number(existingTask.points || 5);
        let consumedPoints = 0;

        if (requestedPoints > 0) {
          const consumeResult = await starService.consumeStarsWithConnection(
            connection,
            existingTask.userId,
            {
              requestedPoints,
              reason: `必做任务惩罚: ${existingTask.title}`,
              sourceType: 'task_penalty',
              sourceId: existingTask.taskId,
              originalTaskDate: existingTask.date || null,
              idempotencyKey: `task_penalty:${existingTask.taskId}`,
              modifyTime,
            },
            {
              allowPartial: true,
              recordPrefix: 'task_penalty',
            }
          );

          consumedPoints = Number(consumeResult?.consumedPoints || 0);
          if (consumedPoints === 0) {
            await connection.rollback();
            return {
              success: false,
              task: existingTask,
              penaltyPoints: 0,
              targetUserId: existingTask.userId,
              message: '惩罚执行失败: 没有可扣除的星星',
            };
          }
        }

        const updateParams = [1];
        const updateClauses = [`${columnMap.penaltyApplied} = ?`];

        if (columnMap.penaltyDeductedPoints) {
          updateClauses.push(`${columnMap.penaltyDeductedPoints} = ?`);
          updateParams.push(consumedPoints);
        }
        if (columnMap.penaltyRefunded) {
          updateClauses.push(`${columnMap.penaltyRefunded} = ?`);
          updateParams.push(0);
        }
        if (columnMap.penaltyRefundTime) {
          updateClauses.push(`${columnMap.penaltyRefundTime} = NULL`);
        }

        if (columnMap.modifyTime) {
          updateClauses.push(`${columnMap.modifyTime} = ?`);
          updateParams.push(modifyTime);
        }

        updateParams.push(taskId);
        const [updateResult] = await connection.execute(
          `UPDATE tasks SET ${updateClauses.join(', ')} WHERE task_id = ? AND deleted_at IS NULL`,
          updateParams
        );

        if (updateResult.affectedRows === 0) {
          await connection.rollback();
          return null;
        }

        const updatedRaw = await this._getTaskByIdConn(connection, taskId);
        const updatedTask = Task.fromDB(updatedRaw);
        await messageService.createTaskMessages({
          task: updatedTask,
          familyId: options.familyId || null,
          action: 'penalty',
          actorUserId: options.actorUserId || null,
          actorRole: options.actorRole || 'system',
          operationKey,
          penaltyPoints: consumedPoints,
        }, connection);

        await connection.commit();
        return {
          success: true,
          task: updatedTask,
          penaltyPoints: consumedPoints,
          targetUserId: updatedTask.userId,
        };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('执行必做任务惩罚失败', error);
      throw error;
    }
  }

  async _updateTaskRequiredState(taskId, isRequired, options = {}) {
    try {
      const columnMap = await this._getTaskColumnMap();
      const pool = getPool();
      const connection = await pool.getConnection();
      const modifyTime = Number(options.modifyTime || Date.now());
      const operationKey = String(options.operationKey || modifyTime);

      try {
        await connection.beginTransaction();
        const existingRaw = await this._getTaskByIdConn(connection, taskId);
        if (!existingRaw) {
          await connection.rollback();
          return null;
        }

        const existingTask = Task.fromDB(existingRaw);
        if (existingTask.isRequired === isRequired) {
          await connection.commit();
          return existingTask;
        }

        const params = [isRequired ? 1 : 0];
        const setClauses = [`${columnMap.isRequired} = ?`];

        if (columnMap.modifyTime) {
          setClauses.push(`${columnMap.modifyTime} = ?`);
          params.push(modifyTime);
        }

        params.push(taskId);
        const [result] = await connection.execute(
          `UPDATE tasks SET ${setClauses.join(', ')} WHERE task_id = ? AND deleted_at IS NULL`,
          params
        );

        if (result.affectedRows === 0) {
          await connection.rollback();
          return null;
        }

        const updatedRaw = await this._getTaskByIdConn(connection, taskId);
        const updatedTask = Task.fromDB(updatedRaw);
        await this._createTaskMessagesAfterMutation(
          updatedTask,
          isRequired ? 'required' : 'unrequired',
          options,
          operationKey,
          connection
        );
        await connection.commit();
        return updatedTask;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('更新任务必做状态失败', error);
      throw error;
    }
  }

  async _createTaskMessagesAfterMutation(task, action, options, operationKey, connection) {
    await messageService.createTaskMessages({
      task,
      familyId: options.familyId || null,
      action,
      actorUserId: options.actorUserId || task.userId,
      actorRole: options.actorRole || 'system',
      operationKey,
      refundPoints: Number(options.refundPoints || 0),
      createTimeOverride: action === 'delete' ? Date.now() : null,
    }, connection);
  }
}

// 创建单例实例
const taskService = new TaskService();

module.exports = taskService;
