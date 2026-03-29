const logger = require('../../utils/logger');
const { Task, TaskStatus } = require('../../models/task');
const dateUtils = require('../../utils/dateUtils');
const { EVENTS, ERROR_MESSAGES } = require('../../utils/constants');

function normalizeRepeatDays(days = []) {
  return days.map((day) => (typeof day === 'string' ? parseInt(day) : day));
}

function formatWeekdayList(days) {
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return days.map((day) => dayNames[day]).join('、');
}

function buildFallbackDateErrorMessage(startDate, endDate, typeLabel) {
  const startDateStr = dateUtils.formatDate(startDate);
  const endDateStr = dateUtils.formatDate(endDate);
  return `无法在日期范围(${startDateStr}到${endDateStr})内找到符合${typeLabel}的日期，请检查日期设置`;
}

function buildNotFoundResult(message = '未找到指定的任务') {
  return { success: false, message };
}

async function loadTaskForWrite(service, taskId, actionLabel) {
  let task = await service.taskRepository.getById(taskId);
  if (!task && service.enableCloudStorage) {
    task = await service._fetchSingleTaskFromCloud(taskId);
  }

  if (!task) {
    logger.warn('TaskService', `${actionLabel}失败: 未找到ID为${taskId}的任务`);
    return null;
  }

  return task;
}

function ensureTaskUserId(service, taskData) {
  if (taskData.userId) {
    return taskData;
  }

  if (service.userService) {
    taskData.userId = service.userService.getCurrentUserId();
    logger.info('TaskService', `为任务设置用户ID: ${taskData.userId}`);
    return taskData;
  }

  taskData.userId = 'parent';
  logger.warn('TaskService', '用户服务不可用，任务用户ID设为默认值: parent');
  return taskData;
}

function adjustCustomRepeatTaskDate(task) {
  if (!(task.repeat && task.repeat.type === 'custom' && task.repeat.days && task.repeat.days.length > 0)) {
    return { success: true };
  }

  const startDate = new Date(task.date);
  const startDayOfWeek = startDate.getDay();
  const selectedDays = normalizeRepeatDays(task.repeat.days);

  logger.info('TaskService', `检查自定义重复任务日期匹配: 开始日期=${task.date}, 星期=${startDayOfWeek}, 选择的星期=${selectedDays}`);
  logger.info('TaskService', `数据类型修复: 原始days=${JSON.stringify(task.repeat.days)}, 转换后=${JSON.stringify(selectedDays)}`);

  if (selectedDays.includes(startDayOfWeek)) {
    logger.info('TaskService', '开始日期的星期匹配选择的重复星期，无需调整');
    return { success: true };
  }

  logger.warn('TaskService', `开始日期的星期(${startDayOfWeek})不在选择的重复星期中(${selectedDays})，需要调整日期`);

  const endDate = new Date(task.repeat.endDate);
  endDate.setHours(0, 0, 0, 0);

  let adjustedDate = new Date(startDate);
  adjustedDate.setHours(0, 0, 0, 0);

  logger.info('TaskService', `开始搜索符合条件的日期: 开始=${adjustedDate.toISOString()}, 结束=${endDate.toISOString()}, 选择星期=${selectedDays}`);

  for (let index = 0; index <= 20; index += 1) {
    const currentDay = adjustedDate.getDay();
    const dateStr = dateUtils.formatDate(adjustedDate);
    const dayMatches = selectedDays.includes(currentDay);
    const dateInRange = adjustedDate <= endDate;

    logger.debug('TaskService', `检查日期: ${dateStr} (星期${currentDay}), 星期匹配=${dayMatches}, 日期范围内=${dateInRange}`);

    if (dayMatches && dateInRange) {
      logger.info('TaskService', `找到符合条件的日期: ${dateStr} (星期${currentDay})`);
      task.date = dateStr;
      task.repeat.startDate = dateStr;
      return { success: true };
    }

    adjustedDate.setDate(adjustedDate.getDate() + 1);
  }

  logger.error('TaskService', '无法在指定日期范围内找到符合重复条件的日期', {
    startDate: dateUtils.formatDate(startDate),
    endDate: dateUtils.formatDate(endDate),
    selectedDays: formatWeekdayList(selectedDays),
    searchRange: '21天'
  });

  return {
    success: false,
    message: buildFallbackDateErrorMessage(startDate, endDate, `重复星期(${formatWeekdayList(selectedDays)})`)
  };
}

function adjustWorkdayOrWeekendRepeatTaskDate(task) {
  if (!(task.repeat && (task.repeat.type === 'weekends' || task.repeat.type === 'workdays'))) {
    return { success: true };
  }

  const startDate = new Date(task.date);
  const startDayOfWeek = startDate.getDay();
  const isWeekendTask = task.repeat.type === 'weekends';
  const targetDays = isWeekendTask ? [0, 6] : [1, 2, 3, 4, 5];
  const needsAdjustment = !targetDays.includes(startDayOfWeek);
  const typeText = isWeekendTask ? '周末重复条件' : '工作日重复条件';

  logger.info('TaskService', `检查${isWeekendTask ? '周末' : '工作日'}重复任务日期匹配: 开始日期=${task.date} (星期${startDayOfWeek}), 是否需要调整=${needsAdjustment}`);

  if (!needsAdjustment) {
    logger.info('TaskService', `开始日期的星期匹配${task.repeat.type}重复条件，无需调整`);
    return { success: true };
  }

  const endDate = new Date(task.repeat.endDate);
  endDate.setHours(0, 0, 0, 0);

  let adjustedDate = new Date(startDate);
  adjustedDate.setHours(0, 0, 0, 0);

  logger.info('TaskService', `开始搜索符合${task.repeat.type}条件的日期: 开始=${adjustedDate.toISOString()}, 结束=${endDate.toISOString()}, 目标星期=${targetDays}`);

  for (let index = 0; index <= 20; index += 1) {
    const currentDay = adjustedDate.getDay();
    const dateStr = dateUtils.formatDate(adjustedDate);
    const dayMatches = targetDays.includes(currentDay);
    const dateInRange = adjustedDate <= endDate;

    logger.debug('TaskService', `检查日期: ${dateStr} (星期${currentDay}), 星期匹配=${dayMatches}, 日期范围内=${dateInRange}`);

    if (dayMatches && dateInRange) {
      logger.info('TaskService', `找到符合条件的日期: ${dateStr} (星期${currentDay})`);
      task.date = dateStr;
      task.repeat.startDate = dateStr;
      return { success: true };
    }

    adjustedDate.setDate(adjustedDate.getDate() + 1);
  }

  logger.error('TaskService', `无法在指定日期范围内找到符合${isWeekendTask ? '周末' : '工作日'}重复条件的日期`, {
    startDate: dateUtils.formatDate(startDate),
    endDate: dateUtils.formatDate(endDate),
    targetDays,
    searchRange: '21天'
  });

  return {
    success: false,
    message: buildFallbackDateErrorMessage(startDate, endDate, typeText)
  };
}

async function createTask(service, taskData) {
  try {
    ensureTaskUserId(service, taskData);

    const task = new Task(taskData);
    const errors = task.validate();
    if (errors.length > 0) {
      logger.warn('TaskService', '创建任务失败: 数据验证不通过', { errors });
      return { success: false, message: errors.join(', ') };
    }

    const customAdjustResult = adjustCustomRepeatTaskDate(task);
    if (!customAdjustResult.success) {
      return customAdjustResult;
    }

    const weekdayAdjustResult = adjustWorkdayOrWeekendRepeatTaskDate(task);
    if (!weekdayAdjustResult.success) {
      return weekdayAdjustResult;
    }

    const initialModifyTime = Number(task.modifyTime || Date.now());
    task.modifyTime = initialModifyTime;
    task.pendingSyncMeta = service._buildTaskPendingSyncMeta(task, 'create', {
      operationKey: taskData.operationKey || initialModifyTime,
      modifyTime: initialModifyTime,
      targetUserId: task.userId
    });

    const savedTask = await service.taskRepository.save(task);
    logger.info('TaskService', `创建任务成功: "${savedTask.title}", ID=${savedTask.id}`);

    if (service.enableCloudStorage) {
      try {
        await service._syncTaskToCloud(savedTask);
        await service._markTaskSynced(savedTask);
        logger.info('TaskService', `任务已同步到云端: ID=${savedTask.id}`);
      } catch (cloudError) {
        logger.warn('TaskService', `云端同步失败，使用本地数据: ${cloudError.message}`, {
          taskId: savedTask.id,
          taskTitle: savedTask.title
        });
        await service._emitTaskCloudSyncFailure('create', savedTask, cloudError);
      }
    } else {
      logger.info('TaskService', '云端模式未启用，仅使用本地存储', {
        taskId: savedTask.id,
        taskTitle: savedTask.title
      });
    }

    let createdTasks = [savedTask];
    if (task.isRepeating()) {
      const repeatTasks = await service._generateRepeatTasks(savedTask);
      if (repeatTasks.length > 0) {
        createdTasks = createdTasks.concat(repeatTasks);
        logger.info('TaskService', `生成了${repeatTasks.length}个重复任务实例`);
      }
    }

    logger.info('TaskService', '触发任务创建事件，包含完整任务对象', {
      taskId: savedTask.id,
      title: savedTask.title,
      tasksCount: createdTasks.length
    });

    logger.logEvent(EVENTS.TASK_CREATED, {
      taskId: savedTask.id,
      title: savedTask.title,
      tasksCount: createdTasks.length
    }, {
      module: 'TaskService',
      direction: 'emit'
    });

    service.eventBus.emit(EVENTS.TASK_CREATED, {
      task: savedTask,
      tasks: createdTasks,
      originalTask: savedTask
    });

    return {
      success: true,
      task: savedTask,
      createdTasks
    };
  } catch (error) {
    logger.error('TaskService', '创建任务失败', error);
    return { success: false, message: `创建任务失败: ${error.message}` };
  }
}

async function updateTask(service, taskId, changes, userId = null) {
  try {
    const task = await loadTaskForWrite(service, taskId, '更新任务');
    if (!task) {
      return buildNotFoundResult();
    }

    if (userId && task.userId !== userId) {
      logger.warn('TaskService', `用户${userId}尝试更新不属于自己的任务${taskId}`);
      return { success: false, message: '无权限操作此任务' };
    }

    const originalStatus = task.status;
    task.update(changes);
    task.pendingSyncMeta = service._buildTaskPendingSyncMeta(task, 'update', {
      operationKey: changes.operationKey || changes.modifyTime || task.modifyTime,
      modifyTime: task.modifyTime,
      targetUserId: task.userId
    });
    task.syncedToCloud = false;

    const updatedTask = await service.taskRepository.save(task);

    logger.info('TaskService', `更新任务成功: "${updatedTask.title}", ID=${updatedTask.id}${userId ? `, 用户=${userId}` : ''}`);

    service.eventBus.emit(EVENTS.TASK_UPDATED, {
      task: updatedTask,
      changes,
      previousStatus: originalStatus,
      operationType: 'update'
    });

    service._syncUpdateToCloud(updatedTask).catch(async (syncError) => {
      logger.warn('TaskService', '任务更新云同步失败，本地保留待同步状态', {
        taskId: updatedTask.id,
        error: syncError.message
      });
      await service._emitTaskCloudSyncFailure('update', updatedTask, syncError);
    });

    return { success: true, task: updatedTask };
  } catch (error) {
    logger.error('TaskService', `更新任务失败: ${error.message}`, error);
    return { success: false, message: `更新任务失败: ${error.message}` };
  }
}

async function deleteTask(service, taskId, userId = null, suppressMessage = false) {
  try {
    const taskInfo = await loadTaskForWrite(service, taskId, '删除任务');
    if (!taskInfo) {
      return buildNotFoundResult();
    }

    if (userId && taskInfo.userId !== userId) {
      logger.warn('TaskService', `用户${userId}尝试删除不属于自己的任务${taskId}`);
      return { success: false, message: '无权限操作此任务' };
    }

    const operatorContext = service._getOperatorContext(taskInfo.userId);
    const deleteMeta = {
      entityType: 'task',
      entityId: taskId,
      operationKey: service._createOperationKey(Date.now()),
      operatorUserId: operatorContext.actorUserId,
      operatorRole: operatorContext.actorRole,
      familyId: operatorContext.familyId,
      subjectUserId: taskInfo.userId || null,
      notificationType: 'task_delete',
      title: taskInfo.title,
      summary: `任务“${taskInfo.title}”已删除`,
      createTime: Date.now()
    };

    await service._saveDeleteTombstone(deleteMeta);
    await service.taskRepository.delete(taskId);

    logger.info('TaskService', `删除任务成功: ${taskId}${userId ? `, 用户=${userId}` : ''}${suppressMessage ? ', 抑制消息' : ''}`);

    if (!suppressMessage) {
      service.eventBus.emit(EVENTS.TASK_DELETED, {
        taskId,
        taskInfo: {
          id: taskInfo.id,
          title: taskInfo.title,
          type: taskInfo.type,
          date: taskInfo.date,
          status: taskInfo.status
        }
      });
    }

    service._syncDeleteToCloud(taskId, deleteMeta).catch(async (syncError) => {
      logger.warn('TaskService', '云端删除同步失败（本地已删除）', {
        taskId,
        error: syncError.message
      });
      service.eventBus.emit(EVENTS.TASK_CLOUD_SYNC_FAILED, {
        action: 'delete',
        taskId,
        error: syncError,
        pendingSyncMeta: deleteMeta,
        taskSnapshot: taskInfo
      });
    });

    return { success: true };
  } catch (error) {
    logger.error('TaskService', `删除任务失败: ${error.message}`, error);
    return { success: false, message: `删除任务失败: ${error.message}` };
  }
}

async function updateTaskStatus(service, taskId, status, userId = null) {
  try {
    const task = await loadTaskForWrite(service, taskId, '更新任务状态');
    if (!task) {
      return buildNotFoundResult();
    }

    logger.info('TaskService', `共享执行模式: 用户${userId || '未指定'}正在更新任务状态${taskId}`);

    const previousStatus = task.status;
    if (previousStatus === status) {
      logger.info('TaskService', `任务状态未发生变化: ${taskId}, 状态=${status}${userId ? `, 用户=${userId}` : ''}`);
      return { success: true, task, unchanged: true };
    }

    logger.info('TaskService', `准备设置任务状态: ${task.title}, 当前状态=${task.status}, 新状态=${status}${userId ? `, 用户=${userId}` : ''}`);

    if (status === 1 && previousStatus !== 1) {
      logger.info('TaskService', `任务状态变为完成，调用complete方法设置completionTime: ${task.title}`);
      task.complete();
      logger.info('TaskService', `任务complete方法调用完成: ${task.title}, completionTime=${task.completionTime}`);
    } else {
      task.status = status;
      logger.info('TaskService', `任务状态已设置: ${task.title}, 状态=${task.status}, 类型=${typeof task.status}`);
    }

    if (!task.starAwarded && !task.isRequired && service.starService) {
      logger.info('TaskService', `开始为任务分配积分: ${task.title}, 积分=${task.points}, 有效期=${task.pointsExpiry}`);
      logger.info('TaskService', `任务当前starAwarded状态: ${task.starAwarded}, 类型: ${typeof task.starAwarded}`);

      const expiryInfo = service.starService.calculateExpiryDate(task.pointsExpiry);
      task.pointsExpiryDate = expiryInfo.expiryDateStr;

      logger.info('TaskService', `积分有效期计算完成: ${expiryInfo.expiryDateStr}`);

      task.starAwarded = true;
      logger.info('TaskService', `设置starAwarded为true: ${task.starAwarded}`);

      if (task.points > 0) {
        const taskUserId = task.userId || task.assignedTo;
        const addResult = await service.starService.addStars(
          task.points,
          task.pointsExpiry,
          `完成任务: ${task.title}`,
          {
            sourceType: 'task_complete',
            sourceId: task.id,
            userId: taskUserId
          }
        );

        logger.info('TaskService', '积分添加结果:', addResult);
        logger.info('TaskService', `积分分配给用户: ${taskUserId}`);

        if (addResult.success) {
          logger.info('TaskService', `任务 "${task.title}" 获得 ${task.points} 颗星星`);
        } else {
          logger.warn('TaskService', `任务 "${task.title}" 积分添加失败: ${addResult.message}`);
        }
      }
    } else if (task.starAwarded) {
      logger.info('TaskService', `任务 "${task.title}" 已经获得过星星，跳过积分分配`);
    } else if (task.isRequired) {
      logger.info('TaskService', `任务 "${task.title}" 是必做任务，完成后不获得星星奖励`);
    }

    const syncAction = status === TaskStatus.COMPLETED ? 'complete' : 'reset';
    task.modifyTime = Date.now();
    task.pendingSyncMeta = service._buildTaskPendingSyncMeta(task, syncAction, {
      operationKey: task.modifyTime,
      modifyTime: task.modifyTime,
      targetUserId: task.userId
    });
    task.syncedToCloud = false;

    logger.info('TaskService', `准备保存任务: ${task.title}`, {
      id: task.id,
      status: task.status,
      starAwarded: task.starAwarded,
      points: task.points,
      modifyTime: task.modifyTime
    });

    const savedTask = await service.taskRepository.save(task);

    logger.info('TaskService', `任务保存完成: ${task.title}`, {
      id: savedTask.id,
      status: savedTask.status,
      starAwarded: savedTask.starAwarded,
      points: savedTask.points,
      saveSuccess: !!savedTask
    });

    let operationType = 'update';
    if (status === TaskStatus.COMPLETED) {
      operationType = 'complete';
    } else if (previousStatus === TaskStatus.COMPLETED) {
      operationType = 'uncomplete';
    }

    logger.logEvent(EVENTS.TASK_STATUS_UPDATED, {
      taskId: savedTask.id,
      title: savedTask.title,
      status,
      previousStatus,
      operationType
    }, {
      module: 'TaskService',
      direction: 'emit'
    });

    service.eventBus.emit(EVENTS.TASK_STATUS_UPDATED, {
      task: savedTask,
      previousStatus,
      operationType,
      operatorUserId: userId
    });

    if (status === TaskStatus.COMPLETED) {
      logger.logEvent(EVENTS.TASK_COMPLETED, {
        taskId: savedTask.id,
        title: savedTask.title
      }, {
        module: 'TaskService',
        direction: 'emit'
      });

      service.eventBus.emit(EVENTS.TASK_COMPLETED, {
        task: savedTask,
        operatorUserId: userId
      });
    }

    service._syncStatusToCloud(savedTask).catch(async (syncError) => {
      logger.warn('TaskService', '任务状态云同步失败，本地保留待同步状态', {
        taskId: savedTask.id,
        action: operationType,
        error: syncError.message
      });
      await service._emitTaskCloudSyncFailure(operationType === 'complete' ? 'complete' : 'reset', savedTask, syncError);
    });

    return { success: true, task: savedTask };
  } catch (error) {
    logger.error('TaskService', `更新任务状态失败: ${error.message}`, error);
    return { success: false, message: `更新任务状态失败: ${error.message}` };
  }
}

async function resetTask(service, taskId, userId = null) {
  try {
    const task = await loadTaskForWrite(service, taskId, '重置任务');
    if (!task) {
      return buildNotFoundResult();
    }

    logger.info('TaskService', `共享执行模式: 用户${userId || '未指定'}正在重置任务${taskId}`);

    if (!task.isCompleted()) {
      logger.info('TaskService', `任务未完成，无需重置: ${task.title}${userId ? `, 用户=${userId}` : ''}`);
      return { success: true, task, unchanged: true };
    }

    let lastExchangeTime = null;
    if (service.rewardService) {
      if (typeof service.rewardService.getLastExchangeTimeByUser === 'function') {
        lastExchangeTime = await service.rewardService.getLastExchangeTimeByUser(task.userId || userId || null);
      } else {
        lastExchangeTime = await service.rewardService.getLastExchangeTime();
      }
    }

    if (!task.canBeUnchecked(lastExchangeTime)) {
      logger.warn('TaskService', `${ERROR_MESSAGES.TASK_LOCKED}: ${task.title}, 完成时间=${task.completionTime}, 最后兑换时间=${lastExchangeTime}`);
      return {
        success: false,
        message: ERROR_MESSAGES.TASK_LOCKED,
        locked: true
      };
    }

    if (task.starAwarded && task.points > 0 && service.starService) {
      logger.info('TaskService', `准备从特定分组扣减星星: ${task.title}, 星星数=${task.points}, 有效期类型=${task.pointsExpiry}`);

      const taskUserId = task.userId || task.assignedTo;
      const consumeResult = await service.starService.consumeStarsFromSpecificType(
        task.points,
        task.pointsExpiry,
        `取消完成任务: ${task.title}`,
        {
          sourceType: 'task_reset',
          sourceId: task.id,
          userId: taskUserId,
          originalTaskDate: task.date || null
        }
      );

      if (!consumeResult.success) {
        logger.error('TaskService', `从特定分组扣减星星失败: ${consumeResult.message}`);
        return {
          success: false,
          message: '扣减星星失败，无法取消任务完成状态'
        };
      }

      logger.info('TaskService', `从特定分组扣减星星成功: ${task.title}, 扣减${task.points}颗星星`);
      logger.info('TaskService', `星星扣减自用户: ${taskUserId}`);
    }

    task.reset();
    task.starAwarded = false;
    task.modifyTime = Date.now();
    task.pendingSyncMeta = service._buildTaskPendingSyncMeta(task, 'reset', {
      operationKey: task.modifyTime,
      modifyTime: task.modifyTime,
      targetUserId: task.userId
    });
    task.syncedToCloud = false;

    const savedTask = await service.taskRepository.save(task);
    logger.info('TaskService', `任务重置成功: ${savedTask.title}, ID=${savedTask.id}${userId ? `, 用户=${userId}` : ''}`);

    service.eventBus.emit(EVENTS.TASK_RESET, {
      task: savedTask,
      starsDeducted: task.points || 0
    });

    service._syncStatusToCloud(savedTask).catch(async (syncError) => {
      logger.warn('TaskService', '任务重置云同步失败，本地保留待同步状态', {
        taskId: savedTask.id,
        error: syncError.message
      });
      await service._emitTaskCloudSyncFailure('reset', savedTask, syncError);
    });

    return { success: true, task: savedTask };
  } catch (error) {
    logger.error('TaskService', `重置任务失败: ${error.message}`, error);
    return { success: false, message: `重置任务失败: ${error.message}` };
  }
}

async function markTaskAsRequired(service, taskId, userId = null) {
  try {
    const task = await loadTaskForWrite(service, taskId, '标记任务为必做');
    if (!task) {
      return buildNotFoundResult();
    }

    if (userId && task.userId !== userId) {
      logger.warn('TaskService', `用户${userId}尝试标记不属于自己的任务为必做${taskId}`);
      return { success: false, message: '无权限操作此任务' };
    }

    if (task.isRequired) {
      return { success: true, task, unchanged: true };
    }

    task.isRequired = true;
    task.modifyTime = Date.now();
    task.pendingSyncMeta = service._buildTaskPendingSyncMeta(task, 'required', {
      operationKey: task.modifyTime,
      modifyTime: task.modifyTime,
      targetUserId: task.userId
    });
    task.syncedToCloud = false;

    const updatedTask = await service.taskRepository.save(task);
    logger.info('TaskService', `将任务标记为必做: "${updatedTask.title}", ID=${updatedTask.id}${userId ? `, 用户=${userId}` : ''}`);
    service.eventBus.emit(EVENTS.TASK_MARKED_REQUIRED, { task: updatedTask });

    if (service.enableCloudStorage) {
      service._syncRequiredStateToCloud(updatedTask).catch(async (syncError) => {
        logger.warn('TaskService', '任务必做标记云同步失败，本地保留待同步状态', {
          taskId: updatedTask.id,
          error: syncError.message
        });
        await service._emitTaskCloudSyncFailure('required', updatedTask, syncError);
      });
    }

    return { success: true, task: updatedTask };
  } catch (error) {
    logger.error('TaskService', `标记必做任务失败: ${error.message}`, error);
    return { success: false, message: `标记必做任务失败: ${error.message}` };
  }
}

async function unmarkTaskAsRequired(service, taskId, userId = null) {
  try {
    const task = await loadTaskForWrite(service, taskId, '取消任务必做标记');
    if (!task) {
      return buildNotFoundResult();
    }

    if (userId && task.userId !== userId) {
      logger.warn('TaskService', `用户${userId}尝试取消不属于自己的任务必做标记${taskId}`);
      return { success: false, message: '无权限操作此任务' };
    }

    if (!task.isRequired) {
      return { success: true, task, unchanged: true };
    }

    task.isRequired = false;
    task.modifyTime = Date.now();
    task.pendingSyncMeta = service._buildTaskPendingSyncMeta(task, 'unrequired', {
      operationKey: task.modifyTime,
      modifyTime: task.modifyTime,
      targetUserId: task.userId
    });
    task.syncedToCloud = false;

    const updatedTask = await service.taskRepository.save(task);
    logger.info('TaskService', `取消任务的必做标记: "${updatedTask.title}", ID=${updatedTask.id}${userId ? `, 用户=${userId}` : ''}`);
    service.eventBus.emit(EVENTS.TASK_UNMARKED_REQUIRED, { task: updatedTask });

    if (service.enableCloudStorage) {
      service._syncRequiredStateToCloud(updatedTask).catch(async (syncError) => {
        logger.warn('TaskService', '任务取消必做云同步失败，本地保留待同步状态', {
          taskId: updatedTask.id,
          error: syncError.message
        });
        await service._emitTaskCloudSyncFailure('unrequired', updatedTask, syncError);
      });
    }

    return { success: true, task: updatedTask };
  } catch (error) {
    logger.error('TaskService', `取消必做任务标记失败: ${error.message}`, error);
    return { success: false, message: `取消必做任务标记失败: ${error.message}` };
  }
}

module.exports = {
  createTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
  resetTask,
  markTaskAsRequired,
  unmarkTaskAsRequired
};
