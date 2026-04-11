/**
 * 任务控制器
 */

const taskService = require('../services/taskService');
const familyService = require('../services/familyService');
const Task = require('../models/Task');
const { createLogger } = require('../utils/logger');
const { success, error } = require('../utils/response');
const { resolveTargetUserId } = require('../utils/resolveTargetUserId');
const logger = createLogger('TaskController');

/**
 * 任务控制器类
 */
class TaskController {
  async _buildOperatorContext(req, subjectUserId = null, fallbackOperationKey = null, options = {}) {
    const requestedActorUserId = req.body?.operatorContext?.actorUserId || req.user.userId;
    let actorUserId = req.user.userId;
    let actorRole = req.user.role;
    const allowSubjectActorOverride = options.allowSubjectActorOverride === true;

    // 家长设备允许把“当前视角孩子”作为消息操作者透传到后端；
    // 仅限执行类状态动作使用；创建/编辑/删除仍按管理者本人记述。
    if (
      allowSubjectActorOverride &&
      req.user.role === 'parent' &&
      req.user.familyId &&
      subjectUserId &&
      requestedActorUserId &&
      requestedActorUserId !== req.user.userId &&
      requestedActorUserId === subjectUserId
    ) {
      const actorInfo = await familyService.getUserFamilyAndRole(requestedActorUserId);
      if (actorInfo && actorInfo.familyId === req.user.familyId && actorInfo.role === 'child') {
        actorUserId = requestedActorUserId;
        actorRole = 'child';
      }
    }

    return {
      actorUserId,
      actorRole,
      familyId: req.user.familyId || null,
      subjectUserId: subjectUserId || null,
      operationKey: String(
        req.body.operationKey ||
        req.query.operationKey ||
        req.body.modifyTime ||
        fallbackOperationKey ||
        Date.now()
      ),
      modifyTime: Number(req.body.modifyTime || fallbackOperationKey || Date.now()),
    };
  }

  async _canManageTask(user, taskOwnerUserId) {
    if (taskOwnerUserId === user.userId) {
      return true;
    }

    if (user.role !== 'parent' || !user.familyId) {
      return false;
    }

    const targetInfo = await familyService.getUserFamilyAndRole(taskOwnerUserId);
    return Boolean(targetInfo && targetInfo.familyId === user.familyId && targetInfo.role === 'child');
  }

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

      const { scope, startDate, endDate } = req.query;

      logger.info('获取任务列表', { userId, effectiveUserId, date, status, scope });

      let tasks;
      // scope=family：仅家长角色有效，孩子调用返回 403
      if (scope === 'family') {
        if (role !== 'parent') {
          return res.status(403).json(error('仅家长角色可访问家庭聚合数据', 'PERMISSION_DENIED'));
        }
        tasks = await taskService.getTasksByFamily(familyId, { date, status, startDate, endDate });
      } else {
        tasks = await taskService.getTasksByUser(effectiveUserId, { date, status, startDate, endDate });
      }

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
      const {
        targetUserId,
        userId: _bodyUserId,
        penaltyApplied: _penaltyApplied,
        ...taskData
      } = req.body; // 显式剔除越权字段与服务端事务字段

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

      const mutationResult = await taskService.createTaskWithRepeatMaterialization(
        effectiveUserId,
        taskData,
        await this._buildOperatorContext(req, effectiveUserId, taskData.modifyTime)
      );

      res.json(success(
        taskService.buildTaskMutationResponse({
          ...mutationResult,
          operation: 'create'
        }),
        '任务创建成功'
      ));
    } catch (err) {
      if (err.code === 'TASK_ID_USER_MISMATCH') {
        return res.status(409).json(
          error('taskId 已被其他用户使用', 'TASK_ID_USER_MISMATCH')
        );
      }
      if (err.code === 'TASK_REMINDER_SCHEMA_MISSING') {
        return res.status(503).json(
          error(err.message, 'TASK_REMINDER_SCHEMA_MISSING')
        );
      }
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
   * 更新任务
   * 业务规则：孩子操作自己的任务，或家长操作同家庭任意孩子的任务
   */
  async updateTask(req, res) {
    try {
      const { taskId } = req.params;
      const { userId, role, familyId } = req.user;

      const existing = await taskService.getTaskById(taskId);
      if (!existing) {
        return res.status(404).json(error('任务不存在', 'TASK_NOT_FOUND'));
      }

      const isOwner = existing.userId === userId;
      let isParentProxy = false;
      if (!isOwner && role === 'parent' && familyId) {
        const targetInfo = await familyService.getUserFamilyAndRole(existing.userId);
        isParentProxy = targetInfo && targetInfo.familyId === familyId && targetInfo.role === 'child';
      }
      if (!isOwner && !isParentProxy) {
        return res.status(403).json(error('无权限操作', 'PERMISSION_DENIED'));
      }

      const ALLOWED_FIELDS = [
        'title', 'description', 'date', 'type', 'startTime', 'endTime',
        'duration', 'isAllDay', 'reminder',
        'points', 'pointsExpiry', 'tags', 'hasNoEndDate', 'repeat',
      ];
      const safeChanges = {};
      ALLOWED_FIELDS.forEach(field => {
        if (req.body[field] !== undefined) safeChanges[field] = req.body[field];
      });

      if (Object.keys(safeChanges).length === 0) {
        return res.status(400).json(error('请求体中没有可更新的字段', 'NO_UPDATABLE_FIELDS'));
      }

      const validation = Task.validate(safeChanges, true);
      if (!validation.valid) {
        return res.status(400).json(error(validation.errors.join('; '), 'INVALID_TASK_DATA'));
      }

      const mergedValidation = Task.validate({
        ...existing.toJSON(),
        ...safeChanges
      }, false);
      if (!mergedValidation.valid) {
        return res.status(400).json(error(mergedValidation.errors.join('; '), 'INVALID_TASK_DATA'));
      }

      const updated = await taskService.updateTask(
        taskId,
        safeChanges,
        await this._buildOperatorContext(req, existing.userId, safeChanges.modifyTime)
      );
      if (!updated) {
        return res.status(404).json(error('任务不存在或已删除', 'TASK_NOT_FOUND'));
      }

      logger.info('任务更新成功', { taskId, userId });
      res.json(success(
        taskService.buildTaskMutationResponse({
          primaryTask: updated,
          affectedTasks: [updated],
          operation: 'update'
        }),
        '更新成功'
      ));
    } catch (err) {
      if (err.code === 'TASK_REMINDER_SCHEMA_MISSING') {
        return res.status(503).json(error(err.message, 'TASK_REMINDER_SCHEMA_MISSING'));
      }
      logger.error('更新任务失败', err);
      res.status(500).json(error('更新任务失败', 'TASK_UPDATE_FAILED'));
    }
  }

  /**
   * 软删除任务
   */
  async deleteTask(req, res) {
    try {
      const { taskId } = req.params;
      const { userId, role, familyId } = req.user;

      const existing = await taskService.getTaskById(taskId);
      if (!existing) {
        return res.status(404).json(error('任务不存在', 'TASK_NOT_FOUND'));
      }

      const isOwner = existing.userId === userId;
      let isParentProxy = false;
      if (!isOwner && role === 'parent' && familyId) {
        const targetInfo = await familyService.getUserFamilyAndRole(existing.userId);
        isParentProxy = targetInfo && targetInfo.familyId === familyId && targetInfo.role === 'child';
      }
      if (!isOwner && !isParentProxy) {
        return res.status(403).json(error('无权限操作', 'PERMISSION_DENIED'));
      }

      const deleted = await taskService.softDeleteTask(
        taskId,
        await this._buildOperatorContext(req, existing.userId)
      );
      if (!deleted) {
        return res.status(404).json(error('任务不存在或已删除', 'TASK_NOT_FOUND'));
      }

      logger.info('任务软删除成功', { taskId, userId });
      res.json(success(
        taskService.buildTaskMutationResponse({
          operation: 'delete',
          taskId
        }),
        '删除成功'
      ));
    } catch (err) {
      logger.error('删除任务失败', err);
      res.status(500).json(error('删除任务失败', 'TASK_DELETE_FAILED'));
    }
  }

  async markTaskRequired(req, res) {
    try {
      const { taskId } = req.params;
      const existing = await taskService.getTaskById(taskId);
      if (!existing) {
        return res.status(404).json(error('任务不存在', 'TASK_NOT_FOUND'));
      }

      const permitted = await this._canManageTask(req.user, existing.userId);
      if (!permitted) {
        return res.status(403).json(error('无权限操作', 'PERMISSION_DENIED'));
      }

      const updated = await taskService.markTaskRequired(
        taskId,
        await this._buildOperatorContext(req, existing.userId, req.body?.modifyTime)
      );

      if (!updated) {
        return res.status(404).json(error('任务不存在或已删除', 'TASK_NOT_FOUND'));
      }

      return res.json(success(
        taskService.buildTaskMutationResponse({
          primaryTask: updated,
          affectedTasks: [updated],
          operation: 'required'
        }),
        '设置成功'
      ));
    } catch (err) {
      logger.error('标记必做任务失败', err);
      return res.status(500).json(error('标记必做任务失败', 'TASK_REQUIRED_UPDATE_FAILED'));
    }
  }

  async unmarkTaskRequired(req, res) {
    try {
      const { taskId } = req.params;
      const existing = await taskService.getTaskById(taskId);
      if (!existing) {
        return res.status(404).json(error('任务不存在', 'TASK_NOT_FOUND'));
      }

      const permitted = await this._canManageTask(req.user, existing.userId);
      if (!permitted) {
        return res.status(403).json(error('无权限操作', 'PERMISSION_DENIED'));
      }

      const updated = await taskService.unmarkTaskRequired(
        taskId,
        await this._buildOperatorContext(req, existing.userId, req.body?.modifyTime)
      );

      if (!updated) {
        return res.status(404).json(error('任务不存在或已删除', 'TASK_NOT_FOUND'));
      }

      return res.json(success(
        taskService.buildTaskMutationResponse({
          primaryTask: updated,
          affectedTasks: [updated],
          operation: 'unrequired'
        }),
        '设置成功'
      ));
    } catch (err) {
      logger.error('取消必做任务失败', err);
      return res.status(500).json(error('取消必做任务失败', 'TASK_REQUIRED_UPDATE_FAILED'));
    }
  }

  async syncRequiredTaskPenalties(req, res) {
    try {
      const requestedScope = req.body?.scope || req.query?.scope;
      const scope = requestedScope === 'user' ? 'user' : (req.user.role === 'parent' ? 'family' : 'user');
      let targetUserId = null;

      if (scope === 'user') {
        targetUserId = await this._resolveTargetUserId(
          req,
          req.body?.targetUserId || req.query?.targetUserId || req.user.userId
        );
        if (!targetUserId) {
          return res.status(403).json(error('无权访问该成员数据', 'FAMILY_MEMBER_ACCESS_DENIED'));
        }
      }

      const result = await taskService.syncRequiredTaskPenalties({
        viewerUserId: req.user.userId,
        viewerRole: req.user.role,
        familyId: req.user.familyId || null,
        scope,
        targetUserId,
        operationKey: String(req.body?.operationKey || req.query?.operationKey || Date.now()),
        modifyTime: Number(req.body?.modifyTime || req.query?.modifyTime || Date.now()),
      });

      return res.json(success(result, '同步成功'));
    } catch (err) {
      logger.error('同步必做任务惩罚失败', err);
      return res.status(500).json(error('同步必做任务惩罚失败', 'TASK_PENALTY_SYNC_FAILED'));
    }
  }

  async syncUpcomingTaskMessages(req, res) {
    try {
      const requestedScope = req.body?.scope || req.query?.scope;
      const scope = requestedScope === 'user' ? 'user' : (req.user.role === 'parent' ? 'family' : 'user');
      let targetUserId = null;

      if (scope === 'user') {
        targetUserId = await this._resolveTargetUserId(
          req,
          req.body?.targetUserId || req.query?.targetUserId || req.user.userId
        );
        if (!targetUserId) {
          return res.status(403).json(error('无权访问该成员数据', 'FAMILY_MEMBER_ACCESS_DENIED'));
        }
      }

      const result = await taskService.syncUpcomingTaskMessages({
        viewerUserId: req.user.userId,
        viewerRole: req.user.role,
        familyId: req.user.familyId || null,
        scope,
        targetUserId,
        operationKey: String(req.body?.operationKey || req.query?.operationKey || Date.now()),
        modifyTime: Number(req.body?.modifyTime || req.query?.modifyTime || Date.now()),
      });

      return res.json(success(result, '同步成功'));
    } catch (err) {
      if (err.code === 'TASK_REMINDER_SCHEMA_MISSING') {
        return res.status(503).json(error(err.message, 'TASK_REMINDER_SCHEMA_MISSING'));
      }
      logger.error('同步 upcoming 任务消息失败', err);
      return res.status(500).json(error('同步 upcoming 任务消息失败', 'TASK_UPCOMING_SYNC_FAILED'));
    }
  }

  /**
   * 更新任务状态（只接受 status 字段，其余字段服务端推导）
   */
  async updateTaskStatus(req, res) {
    try {
      const { taskId } = req.params;
      const { userId, role, familyId } = req.user;
      const { status, starAwarded } = req.body;

      if (status !== 0 && status !== 1) {
        return res.status(400).json(error('status 必须为 0 或 1', 'INVALID_STATUS'));
      }

      if (starAwarded !== undefined && typeof starAwarded !== 'boolean') {
        return res.status(400).json(error('starAwarded 必须为布尔值', 'INVALID_STAR_AWARDED'));
      }

      const existing = await taskService.getTaskById(taskId);
      if (!existing) {
        return res.status(404).json(error('任务不存在', 'TASK_NOT_FOUND'));
      }

      const isOwner = existing.userId === userId;
      let isParentProxy = false;
      if (!isOwner && role === 'parent' && familyId) {
        const targetInfo = await familyService.getUserFamilyAndRole(existing.userId);
        isParentProxy = targetInfo && targetInfo.familyId === familyId && targetInfo.role === 'child';
      }
      if (!isOwner && !isParentProxy) {
        return res.status(403).json(error('无权限操作', 'PERMISSION_DENIED'));
      }

      const updated = await taskService.updateTaskStatus(
        taskId,
        {
          status,
          starAwarded,
          modifyTime: req.body.modifyTime,
          operationKey: req.body.operationKey,
        },
        await this._buildOperatorContext(req, existing.userId, req.body.modifyTime, {
          allowSubjectActorOverride: true
        })
      );
      if (!updated) {
        return res.status(404).json(error('任务不存在或已删除', 'TASK_NOT_FOUND'));
      }

      logger.info('任务状态更新成功', { taskId, status, userId });
      res.json(success(
        taskService.buildTaskMutationResponse({
          primaryTask: updated,
          affectedTasks: [updated],
          operation: status === 1 ? 'complete' : 'reset'
        }),
        '状态更新成功'
      ));
    } catch (err) {
      if (err.code === 'INSUFFICIENT_STARS') {
        return res.status(409).json(error('撤销逾期补做失败：当前永久星星不足，无法回滚退星', 'INSUFFICIENT_STARS'));
      }
      logger.error('更新任务状态失败', err);
      res.status(500).json(error('更新任务状态失败', 'TASK_STATUS_UPDATE_FAILED'));
    }
  }

  /**
   * 解析 targetUserId：校验权限并返回实际查询用户ID
   * 返回 null 表示无权限
   */
  async _resolveTargetUserId(req, targetUserId) {
    return resolveTargetUserId(req, targetUserId);
  }

  /**
   * POST /api/tasks/transfer
   * 将家长名下的所有任务转移给指定孩子（仅限首次添加孩子场景）
   */
  async transferTasks(req, res) {
    try {
      const { userId, role, familyId } = req.user;
      const { toUserId } = req.body;

      if (role !== 'parent') {
        return res.status(403).json(error('只有家长可以转移任务', 'TRANSFER_PARENT_REQUIRED'));
      }
      if (!familyId) {
        return res.status(400).json(error('您尚未加入家庭', 'FAMILY_NOT_JOINED'));
      }
      if (!toUserId) {
        return res.status(400).json(error('目标用户不能为空', 'INVALID_PARAMS'));
      }

      const count = await taskService.transferTasksToChild(userId, toUserId, familyId, {
        actorRole: role,
        modifyTime: req.body.modifyTime,
        operationKey: req.body.operationKey,
      });
      logger.info('任务归属转移成功', { fromUserId: userId, toUserId, count });
      res.json(success({ count }, '转移成功'));
    } catch (err) {
      if (err.code === 'TRANSFER_TARGET_INVALID') {
        return res.status(400).json(error(err.message, err.code));
      }
      logger.error('任务归属转移失败', err);
      res.status(500).json(error('转移失败', 'TASK_TRANSFER_FAILED'));
    }
  }
}

// 创建单例实例
const taskController = new TaskController();

module.exports = taskController;
