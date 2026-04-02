const logger = require('../../utils/logger');
const { TaskStatus } = require('../../models/task');
const { EVENTS } = require('../../utils/constants');
const HttpClient = require('../../utils/http-client');
const API_CONFIG = require('../../utils/api-config');

async function checkTasksStatus(service) {
  try {
    if (service.enableCloudStorage) {
      const response = await HttpClient.post(API_CONFIG.ENDPOINTS.TASK_PENALTIES_SYNC, {});
      const payload = response || {};
      return {
        success: true,
        expiredTasks: [],
        requiredTasks: [],
        penaltyResults: Array.isArray(payload.penaltyResults) ? payload.penaltyResults : [],
        penaltyCount: Number(payload.penaltyCount || 0),
        affectedTaskIds: payload.affectedTaskIds || []
      };
    }

    const loginUserId = service.userService ? service.userService.getLoginUserId() : null;

    let scanUserIds = null;
    if (loginUserId) {
      scanUserIds = new Set([loginUserId]);
      if (service.userService && service.userService.getAllUsers) {
        const allUsers = service.userService.getAllUsers();
        allUsers.forEach((user) => {
          if (user.isVirtual && user.createdByUserId === loginUserId) {
            scanUserIds.add(user.userId || user.id);
          }
        });
      }
    }

    const allExpiredTasks = await service.getExpiredIncompleteTasks();
    const expiredTasks = scanUserIds
      ? allExpiredTasks.filter((task) => !task.userId || scanUserIds.has(task.userId))
      : allExpiredTasks;

    const requiredTasks = await service.getRequiredTasks();
    const expiredRequiredTasks = expiredTasks.filter((task) =>
      task.isRequired && !task.penaltyApplied && task.status !== TaskStatus.COMPLETED
    );

    if (expiredTasks.length > 0) {
      logger.info('TaskService', `过期任务筛选详情: 总过期任务=${expiredTasks.length}, 必做任务=${expiredTasks.filter((task) => task.isRequired).length}, 待惩罚任务=${expiredRequiredTasks.length}`);
      expiredRequiredTasks.forEach((task) => {
        logger.debug('TaskService', `待惩罚任务: "${task.title}", 日期=${task.date}, penaltyApplied=${task.penaltyApplied}`);
      });
    }

    const penaltyResults = [];
    for (const task of expiredRequiredTasks) {
      const result = await service.handleRequiredTaskPenalty(task);
      penaltyResults.push(result);
    }

    logger.info('TaskService', `任务状态检查完成, 过期任务: ${expiredTasks.length}, 必做任务: ${requiredTasks.length}, 执行惩罚: ${penaltyResults.length}`);

    return {
      success: true,
      expiredTasks,
      requiredTasks,
      penaltyResults
    };
  } catch (error) {
    logger.error('TaskService', '检查任务状态失败', error);
    return { success: false, message: `检查任务状态失败: ${error.message}` };
  }
}

async function handleRequiredTaskPenalty(service, task) {
  if (!task || !task.isRequired) {
    return { success: false, message: '任务无效或不是必做任务' };
  }

  try {
    const penaltyPoints = task.points || 5;
    const taskUserId = task.userId || task.assignedTo;

    let consumeResult = null;
    if (service.starService && penaltyPoints > 0) {
      logger.info('TaskService', `执行必做任务惩罚扣除: 从用户${taskUserId}扣除${penaltyPoints}颗星星`);

      consumeResult = await service.starService.consumeStars(
        penaltyPoints,
        `必做任务惩罚: ${task.title}`,
        {
          sourceType: 'task_penalty',
          sourceId: task.id,
          userId: taskUserId,
          operator: 'system'
        }
      );

      if (consumeResult.consumed === 0) {
        logger.error('TaskService', `惩罚扣除积分失败: 没有可扣除的星星, 用户=${taskUserId}`);
        return {
          success: false,
          message: '惩罚执行失败: 没有可扣除的星星',
          task,
          penaltyPoints: 0,
          targetUserId: taskUserId
        };
      }

      const message = consumeResult.consumed < penaltyPoints
        ? `惩罚扣除积分部分成功: 从用户${taskUserId}扣除${consumeResult.consumed}颗星星（余额不足，应扣${penaltyPoints}颗）`
        : `惩罚扣除积分成功: 从用户${taskUserId}扣除${consumeResult.consumed}颗星星`;
      logger.info('TaskService', message);
    }

    const actualDeducted = consumeResult ? consumeResult.consumed : 0;
    task.penaltyApplied = true;
    task.penaltyDeductedPoints = actualDeducted;
    task.penaltyRefunded = false;
    task.penaltyRefundTime = 0;
    task.modifyTime = Date.now();

    const updatedTask = await service.taskRepository.save(task);

    logger.info('TaskService', `已对必做任务应用惩罚: "${task.title}", 扣除${actualDeducted}颗星, 目标用户=${taskUserId}`);

    service.eventBus.emit(EVENTS.TASK_PENALTY_APPLIED, {
      task: updatedTask,
      penaltyPoints: actualDeducted,
      targetUserId: taskUserId,
      operator: 'system',
      reason: '必做任务未完成'
    });

    return {
      success: true,
      task: updatedTask,
      penaltyPoints: actualDeducted,
      targetUserId: taskUserId
    };
  } catch (error) {
    logger.error('TaskService', `应用必做任务惩罚失败: ${error.message}`, error);
    return { success: false, message: `应用惩罚失败: ${error.message}` };
  }
}

module.exports = {
  checkTasksStatus,
  handleRequiredTaskPenalty
};
