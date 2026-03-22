/**
 * 任务服务
 */

const { getPool, query, execute } = require('../config/database');
const Task = require('../models/Task');
const { createLogger } = require('../utils/logger');
const messageService = require('./messageService');
const logger = createLogger('TaskService');
let taskColumnMapPromise = null;

/**
 * 任务服务类
 */
class TaskService {
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
            isRequired: resolveColumn('is_required', 'isRequired'),
            isAllDay: resolveColumn('is_all_day', 'isAllDay'),
            penaltyApplied: resolveColumn('penalty_applied', 'penaltyApplied'),
            deletedAt: resolveColumn('deleted_at', 'deletedAt', true),
            completionTime: resolveColumn('completion_time', 'completionTime', true),
            starAwarded: resolveColumn('star_awarded', 'starAwarded', true),
            modifyTime: resolveColumn('modify_time', 'modifyTime', true),
            duration: resolveColumn('duration', null, true),
            hasNoEndDate: resolveColumn('has_no_end_date', 'hasNoEndDate', true),
            tags: resolveColumn('tags', null, true),
            parentTaskId: resolveColumn('parent_task_id', 'parentTaskId', true),
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
            isRequired: 'is_required',
            isAllDay: 'is_all_day',
            penaltyApplied: 'penalty_applied',
            deletedAt: 'deleted_at',
            completionTime: 'completion_time',
            starAwarded: 'star_awarded',
            modifyTime: 'modify_time',
            duration: 'duration',
            hasNoEndDate: 'has_no_end_date',
            tags: 'tags',
            parentTaskId: 'parent_task_id',
          };
        }
      })();
    }

    return taskColumnMapPromise;
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
      let sql = 'SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL';
      const params = [userId];

      if (date) {
        sql += ' AND date = ?';
        params.push(date);
      }

      if (startDate && endDate) {
        sql += ' AND date >= ? AND date <= ?';
        params.push(startDate, endDate);
      }

      if (status !== undefined) {
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

  /**
   * 创建新任务
   * @param {string} userId - 用户ID
   * @param {Object} taskData - 任务数据
   * @returns {Promise<Task>} 创建的任务实例
   */
  async createTask(userId, taskData, options = {}) {
    try {
      const columnMap = await this._getTaskColumnMap();
      const pool = getPool();
      const connection = await pool.getConnection();
      const modifyTime = Number(taskData.modifyTime || options.modifyTime || Date.now());
      const operationKey = String(options.operationKey || taskData.operationKey || modifyTime);

      try {
        await connection.beginTransaction();

        // 幂等检查：客户端传入 taskId 时，先查是否已存在（含软删除）
        if (taskData.taskId) {
          const existingRaw = await this._getTaskByIdConn(connection, taskData.taskId, true);

          if (existingRaw) {
            // 归属校验：taskId 已存在但归属不同用户，拒绝
            if (existingRaw.user_id !== userId) {
              const err = new Error('taskId 归属用户不匹配');
              err.code = 'TASK_ID_USER_MISMATCH';
              throw err;
            }

            if (!existingRaw.deleted_at) {
              const existingTask = Task.fromDB(existingRaw);
              await this._createTaskMessagesAfterMutation(existingTask, 'create', options, operationKey, connection);
              await connection.commit();
              logger.info('创建任务幂等：taskId 已存在，直接返回', { taskId: taskData.taskId, userId });
              return existingTask;
            }

            // 已软删除：恢复并覆盖所有业务字段，重置完成状态
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
              'points = ?',
              `${columnMap.pointsExpiry} = ?`,
              `${columnMap.isRequired} = ?`,
              '`repeat` = ?',
              `${columnMap.isAllDay} = ?`,
              `${columnMap.penaltyApplied} = ?`
            );

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
            restoreSetClauses.push('status = 0');
            restoreParams.push(taskData.taskId);

            await connection.execute(
              `UPDATE tasks SET ${restoreSetClauses.join(', ')} WHERE task_id = ?`,
              restoreParams
            );
            const restoredRaw = await this._getTaskByIdConn(connection, taskData.taskId);
            const restoredTask = Task.fromDB(restoredRaw);
            await this._createTaskMessagesAfterMutation(restoredTask, 'create', options, operationKey, connection);
            await connection.commit();
            logger.info('创建任务幂等：恢复软删除任务', { taskId: taskData.taskId, userId });
            return restoredTask;
          }
        }

        // 正常创建：优先使用客户端提供的 taskId
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

        await connection.execute(
          `INSERT INTO tasks (${insertColumns.join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`,
          insertValues
        );

        await this._createTaskMessagesAfterMutation(task, 'create', options, operationKey, connection);
        await connection.commit();

        logger.info('创建任务成功', { taskId, userId });
        return task;
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
      const pool = getPool();
      const connection = await pool.getConnection();
      const ALLOWED_FIELDS = [
        'title', 'description', 'date', 'type', 'startTime', 'endTime',
        'duration', 'isAllDay', 'isRequired', 'penaltyApplied',
        'points', 'pointsExpiry', 'tags', 'hasNoEndDate', 'repeat',
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
        isRequired: columnMap.isRequired,
        penaltyApplied: columnMap.penaltyApplied,
        points: 'points',
        pointsExpiry: columnMap.pointsExpiry,
        tags: columnMap.tags,
        hasNoEndDate: columnMap.hasNoEndDate,
        repeat: '`repeat`',
      };

      for (const field of ALLOWED_FIELDS) {
        if (changes[field] !== undefined) {
          const dbField = fieldToColumnMap[field];
          if (!dbField) {
            logger.warn('更新任务时跳过当前库结构不支持的字段', { taskId, field });
            continue;
          }
          if (field === 'tags' || field === 'repeat') {
            setClauses.push(`${dbField} = ?`);
            params.push(changes[field] !== null ? JSON.stringify(changes[field]) : null);
          } else {
            setClauses.push(`${dbField} = ?`);
            params.push(changes[field]);
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
        const action = status === 1 ? 'complete' : 'reset';
        await this._createTaskMessagesAfterMutation(updatedTask, action, options, operationKey, connection);
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

  /**
   * 获取同一家庭下所有孩子的任务
   * @param {string} familyId - 家庭ID
   * @param {Object} filters - 过滤条件
   * @returns {Promise<Array<Task>>} 任务列表
   */
  async getTasksByFamily(familyId, filters = {}) {
    try {
      const { date, status, startDate, endDate } = filters;
      let sql = `SELECT t.* FROM tasks t
        INNER JOIN users u ON t.user_id = u.user_id
        WHERE u.family_id = ? AND u.role = 'child' AND t.deleted_at IS NULL`;
      const params = [familyId];

      if (date) {
        sql += ' AND t.date = ?';
        params.push(date);
      }

      if (startDate && endDate) {
        sql += ' AND t.date >= ? AND t.date <= ?';
        params.push(startDate, endDate);
      }

      if (status !== undefined) {
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
   * @returns {number} 实际迁移的任务数量
   */
  async transferTasksToChild(fromUserId, toUserId, familyId) {
    const targetRows = await query(
      "SELECT user_id FROM users WHERE user_id = ? AND family_id = ? AND role = 'child' AND status = 'active' LIMIT 1",
      [toUserId, familyId]
    );
    if (!targetRows.length) {
      const err = new Error('目标用户不是同家庭的孩子成员');
      err.code = 'TRANSFER_TARGET_INVALID';
      throw err;
    }
    const result = await execute(
      'UPDATE tasks SET user_id = ? WHERE user_id = ?',
      [toUserId, fromUserId]
    );
    logger.info('任务归属转移完成', { fromUserId, toUserId, count: result.affectedRows });
    return result.affectedRows;
  }

  async _getTaskByIdConn(connection, taskId, includeDeleted = false) {
    const sql = includeDeleted
      ? 'SELECT * FROM tasks WHERE task_id = ? LIMIT 1'
      : 'SELECT * FROM tasks WHERE task_id = ? AND deleted_at IS NULL LIMIT 1';
    const [rows] = await connection.execute(sql, [taskId]);
    return rows[0] || null;
  }

  async _createTaskMessagesAfterMutation(task, action, options, operationKey, connection) {
    await messageService.createTaskMessages({
      task,
      familyId: options.familyId || null,
      action,
      actorUserId: options.actorUserId || task.userId,
      actorRole: options.actorRole || 'system',
      operationKey,
    }, connection);
  }
}

// 创建单例实例
const taskService = new TaskService();

module.exports = taskService;
