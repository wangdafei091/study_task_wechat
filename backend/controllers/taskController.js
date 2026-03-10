/**
 * 任务控制器
 */

const taskService = require('../services/taskService');
const Task = require('../models/Task');
const { createLogger } = require('../utils/logger');
const { success, error } = require('../utils/response');
const logger = createLogger('TaskController');

/**
 * 任务控制器类
 */
class TaskController {
  /**
   * 获取当前用户的任务列表
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   */
  async getTasks(req, res) {
    try {
      const userId = req.user.userId;
      const { date, status } = req.query;

      logger.info('获取任务列表', { userId, date, status });

      // 获取任务列表
      const tasks = await taskService.getTasksByUser(userId, { date, status });

      // 统计任务数量
      const total = tasks.length;

      res.json(
        success(
          {
            tasks: tasks.map(task => task.toJSON()),
            total,
          },
          '获取成功'
        )
      );
    } catch (err) {
      logger.error('获取任务列表失败', err);
      res.status(500).json(
        error('获取任务列表失败', 'TASK_GET_FAILED')
      );
    }
  }

  /**
   * 根据taskId获取任务详情
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   */
  async getTaskById(req, res) {
    try {
      const taskId = req.params.taskId;
      const userId = req.user.userId;

      logger.info('获取任务详情', { taskId, userId });

      // 获取任务
      const task = await taskService.getTaskById(taskId);

      if (!task) {
        return res.status(404).json(
          error('任务不存在', 'TASK_NOT_FOUND')
        );
      }

      // 验证任务所有权
      if (task.userId !== userId) {
        return res.status(403).json(
          error('无权访问此任务', 'TASK_FORBIDDEN')
        );
      }

      res.json(success(task.toJSON(), '获取成功'));
    } catch (err) {
      logger.error('获取任务详情失败', err);
      res.status(500).json(
        error('获取任务详情失败', 'TASK_GET_FAILED')
      );
    }
  }

  /**
   * 创建新任务
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   */
  async createTask(req, res) {
    try {
      const userId = req.user.userId;
      const taskData = req.body;

      logger.info('创建任务', { userId, taskData });

      // 参数验证
      const validation = Task.validate(taskData, false);
      if (!validation.valid) {
        return res.status(400).json(
          error(validation.errors.join('; '), 'TASK_INVALID_PARAMS')
        );
      }

      // 创建任务
      const task = await taskService.createTask(userId, taskData);

      res.json(success(task.toJSON(), '任务创建成功'));
    } catch (err) {
      logger.error('创建任务失败', err);
      res.status(500).json(
        error('创建任务失败', 'TASK_CREATE_FAILED')
      );
    }
  }


  /**
   * 统计任务
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   */
  async countTasks(req, res) {
    try {
      const userId = req.user.userId;
      const { date, status } = req.query;

      logger.info('统计任务', { userId, date, status });

      const count = await taskService.countTasks(userId, { date, status });

      res.json(
        success(
          {
            count,
            userId,
          },
          '统计成功'
        )
      );
    } catch (err) {
      logger.error('统计任务失败', err);
      res.status(500).json(
        error('统计任务失败', 'TASK_COUNT_FAILED')
      );
    }
  }
}

// 创建单例实例
const taskController = new TaskController();

module.exports = taskController;
