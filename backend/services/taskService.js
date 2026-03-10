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
      const { date, status } = filters;
      let sql = 'SELECT * FROM tasks WHERE user_id = ?';
      const params = [userId];

      if (date) {
        sql += ' AND date = ?';
        params.push(date);
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
        'SELECT * FROM tasks WHERE task_id = ? LIMIT 1',
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
      const taskId = Task.generateId();
      const task = new Task({
        taskId,
        userId,
        ...taskData,
        status: 0, // 默认为未完成
      });

      const dbData = task.toDB();
      await execute(
        `INSERT INTO tasks (
          task_id, user_id, title, description, type, date,
          startTime, endTime, points, pointsExpiry,
          isRequired, status, \`repeat\`, isAllDay, penaltyApplied
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      let sql = 'SELECT COUNT(*) as count FROM tasks WHERE user_id = ?';
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
}

// 创建单例实例
const taskService = new TaskService();

module.exports = taskService;