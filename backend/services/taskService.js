/**
 * 任务服务
 */

const { query, execute } = require('../config/database');
const Task = require('../models/Task');
const { createLogger } = require('../utils/logger');
const logger = createLogger('TaskService');

/**
 * 任务服务类
 */
class TaskService {
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
  async createTask(userId, taskData) {
    try {
      // 幂等检查：客户端传入 taskId 时，先查是否已存在（含软删除）
      if (taskData.taskId) {
        const existing = await query(
          'SELECT * FROM tasks WHERE task_id = ? LIMIT 1',
          [taskData.taskId]
        );
        const existingRaw = existing && existing[0];

        if (existingRaw) {
          // 归属校验：taskId 已存在但归属不同用户，拒绝
          if (existingRaw.user_id !== userId) {
            const err = new Error('taskId 归属用户不匹配');
            err.code = 'TASK_ID_USER_MISMATCH';
            throw err;
          }

          if (!existingRaw.deleted_at) {
            // 未软删除：幂等返回已有任务
            logger.info('创建任务幂等：taskId 已存在，直接返回', { taskId: taskData.taskId, userId });
            return Task.fromDB(existingRaw);
          }

          // 已软删除：恢复并覆盖所有业务字段，重置完成状态
          const now = Date.now();
          await execute(
            `UPDATE tasks SET
              deleted_at = NULL,
              title = ?, description = ?, type = ?, date = ?,
              startTime = ?, endTime = ?, points = ?, pointsExpiry = ?,
              isRequired = ?, \`repeat\` = ?, isAllDay = ?, penaltyApplied = ?,
              duration = ?, has_no_end_date = ?, tags = ?,
              parent_task_id = ?, modify_time = ?,
              status = 0, completion_time = NULL, star_awarded = 0
            WHERE task_id = ?`,
            [
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
              taskData.duration || 0,
              taskData.hasNoEndDate ? 1 : 0,
              taskData.tags ? JSON.stringify(taskData.tags) : null,
              taskData.parentTaskId || null,
              taskData.modifyTime || now,
              taskData.taskId,
            ]
          );
          logger.info('创建任务幂等：恢复软删除任务', { taskId: taskData.taskId, userId });
          const restored = await query(
            'SELECT * FROM tasks WHERE task_id = ? LIMIT 1',
            [taskData.taskId]
          );
          return Task.fromDB(restored[0]);
        }
      }

      // 正常创建：优先使用客户端提供的 taskId
      const taskId = taskData.taskId || Task.generateId();
      const task = new Task({
        taskId,
        userId,
        ...taskData,
        status: 0, // 默认为未完成
        modifyTime: taskData.modifyTime || Date.now(),
      });

      const dbData = task.toDB();
      await execute(
        `INSERT INTO tasks (
          task_id, user_id, title, description, type, date,
          startTime, endTime, points, pointsExpiry,
          isRequired, status, \`repeat\`, isAllDay, penaltyApplied,
          duration, has_no_end_date, tags, modify_time, parent_task_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dbData.task_id,
          dbData.user_id,
          dbData.title,
          dbData.description,
          dbData.type,
          dbData.date,
          dbData.startTime,
          dbData.endTime,
          dbData.points,
          dbData.pointsExpiry,
          dbData.isRequired,
          dbData.status,
          dbData.repeat,
          dbData.isAllDay,
          dbData.penaltyApplied,
          dbData.duration,
          dbData.has_no_end_date,
          dbData.tags,
          dbData.modify_time,
          dbData.parent_task_id,
        ]
      );

      logger.info('创建任务成功', { taskId, userId });
      return task;
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
  async updateTask(taskId, changes) {
    try {
      const ALLOWED_FIELDS = [
        'title', 'description', 'date', 'type', 'startTime', 'endTime',
        'duration', 'isAllDay', 'isRequired', 'penaltyApplied',
        'points', 'pointsExpiry', 'tags', 'hasNoEndDate', 'repeat',
      ];

      const setClauses = [];
      const params = [];

      for (const field of ALLOWED_FIELDS) {
        if (changes[field] !== undefined) {
          const dbField = field === 'hasNoEndDate' ? 'has_no_end_date' : field;
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

      // 更新 modify_time
      setClauses.push('modify_time = ?');
      params.push(Date.now());

      params.push(taskId);

      const sql = `UPDATE tasks SET ${setClauses.join(', ')} WHERE task_id = ? AND deleted_at IS NULL`;
      const result = await execute(sql, params);

      if (result.affectedRows === 0) {
        return null;
      }

      return this.getTaskById(taskId);
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
  async softDeleteTask(taskId) {
    try {
      const result = await execute(
        'UPDATE tasks SET deleted_at = NOW(), modify_time = ? WHERE task_id = ? AND deleted_at IS NULL',
        [Date.now(), taskId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('软删除任务失败', error);
      throw error;
    }
  }

  /**
   * 更新任务状态（只更新 status 和 completion_time，服务端推导）
   * @param {string} taskId - 任务ID
   * @param {number} status - 任务状态 0=未完成 1=已完成
   * @returns {Promise<Task|null>} 更新后的任务
   */
  async updateTaskStatus(taskId, status) {
    try {
      const now = Date.now();
      const completionTime = status === 1 ? now : null;

      const result = await execute(
        `UPDATE tasks SET status = ?, completion_time = ?, modify_time = ?
         WHERE task_id = ? AND deleted_at IS NULL`,
        [status, completionTime, now, taskId]
      );

      if (result.affectedRows === 0) {
        return null;
      }

      return this.getTaskById(taskId);
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
}

// 创建单例实例
const taskService = new TaskService();

module.exports = taskService;