/**
 * 任务控制器
 */

const taskService = require('../services/taskService');
const familyService = require('../services/familyService');
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
      const { userId, role, familyId } = req.user;
      const { date, status, targetUserId } = req.query;

      // 确定实际查询用户
      const effectiveUserId = await this._resolveTargetUserId(req, targetUserId);
      if (effectiveUserId === null) {
        return res.status(403).json(error('无权访问该成员数据', 'FAMILY_MEMBER_ACCESS_DENIED'));
      }

      logger.info('获取任务列表', { userId, effectiveUserId, date, status });

      // 获取任务列表
      const tasks = await taskService.getTasksByUser(effectiveUserId, { date, status });

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
      const { userId, familyId } = req.user;
      const { targetUserId } = req.query;

      logger.info('获取任务详情', { taskId, userId, targetUserId });

      const task = await taskService.getTaskById(taskId);

      if (!task) {
        return res.status(404).json(error('任务不存在', 'TASK_NOT_FOUND'));
      }

      // 验证访问权限：本人任务，或家长访问同家庭成员任务
      const effectiveUserId = await this._resolveTargetUserId(req, targetUserId || task.userId);
      if (effectiveUserId === null || task.userId !== effectiveUserId) {
        return res.status(403).json(error('无权访问此任务', 'TASK_FORBIDDEN'));
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
      const { userId, role, familyId } = req.user;
      const { targetUserId, userId: _bodyUserId, ...taskData } = req.body; // 显式剔除越权字段

      // 确定任务归属用户（防止客户端越权覆盖）
      let effectiveUserId = userId;
      if (targetUserId) {
        if (role !== 'parent') {
          return res.status(403).json(error('孩子账号不能代他人创建任务', 'FAMILY_TASK_CREATE_DENIED'));
        }
        if (!familyId) {
          return res.status(403).json(error('您尚未加入家庭', 'FAMILY_NOT_JOINED'));
        }
        // 验证 targetUserId 与操作者同家庭，且目标用户必须是孩子
        const targetInfo = await familyService.getUserFamilyAndRole(targetUserId);
        if (!targetInfo || targetInfo.familyId !== familyId) {
          return res.status(403).json(error('无权为该成员创建任务', 'FAMILY_TASK_CREATE_DENIED'));
        }
        if (targetInfo.role !== 'child') {
          return res.status(403).json(error('只能为孩子创建任务', 'FAMILY_TASK_CREATE_DENIED'));
        }
        effectiveUserId = targetUserId;
      }

      logger.info('创建任务', { userId, effectiveUserId });

      // 参数验证
      const validation = Task.validate(taskData, false);
      if (!validation.valid) {
        return res.status(400).json(
          error(validation.errors.join('; '), 'TASK_INVALID_PARAMS')
        );
      }

      const task = await taskService.createTask(effectiveUserId, taskData);

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
      const { date, status, targetUserId } = req.query;

      const effectiveUserId = await this._resolveTargetUserId(req, targetUserId);
      if (effectiveUserId === null) {
        return res.status(403).json(error('无权访问该成员数据', 'FAMILY_MEMBER_ACCESS_DENIED'));
      }

      logger.info('统计任务', { userId: req.user.userId, effectiveUserId, date, status });

      const count = await taskService.countTasks(effectiveUserId, { date, status });

      res.json(
        success(
          {
            count,
            userId: effectiveUserId,
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

  /**
   * 解析 targetUserId：校验权限并返回实际查询用户ID
   * 返回 null 表示无权限
   */
  async _resolveTargetUserId(req, targetUserId) {
    const { userId, role, familyId } = req.user;

    // 未传 targetUserId 或与自己一样，直接用自己
    if (!targetUserId || targetUserId === userId) {
      return userId;
    }

    // 孩子账号不能代查他人
    if (role !== 'parent') {
      return null;
    }

    // 未加入家庭不能代查
    if (!familyId) {
      return null;
    }

    // 验证 targetUserId 与操作者同家庭，且目标用户必须是孩子
    const targetInfo = await familyService.getUserFamilyAndRole(targetUserId);
    if (!targetInfo || targetInfo.familyId !== familyId) {
      return null;
    }
    if (targetInfo.role !== 'child') {
      return null;
    }

    return targetUserId;
  }
}

// 创建单例实例
const taskController = new TaskController();

module.exports = taskController;
