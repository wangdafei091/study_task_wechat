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

function cloneTaskForCloudWrite(task) {
  if (!task) {
    return null;
  }

  if (typeof task.clone === 'function') {
    return task.clone({}, false);
  }

  return new Task(task);
}

function assignPendingSyncMeta(service, task, action, overrides = {}) {
  if (!task) {
    return task;
  }

  task.pendingSyncMeta = {
    ...service._buildTaskPendingSyncMeta(task, action, {
      operationKey: overrides.operationKey || task.modifyTime,
      modifyTime: overrides.modifyTime || task.modifyTime,
      targetUserId: overrides.targetUserId || task.userId
    }),
    ...(overrides.extraMeta || {})
  };
  task.syncedToCloud = false;
  return task;
}

function emitTaskUpdatedEvent(service, task, changes, previousStatus) {
  service.eventBus.emit(EVENTS.TASK_UPDATED, {
    task,
    changes,
    previousStatus,
    operationType: 'update'
  });
}

function emitTaskDeletedEvent(service, taskId, taskInfo, suppressMessage) {
  if (suppressMessage) {
    return;
  }

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

function emitRequiredStateEvent(service, eventName, task) {
  service.eventBus.emit(eventName, { task });
}

function emitTaskStatusEvents(service, task, status, previousStatus, operationType, userId = null) {
  logger.logEvent(EVENTS.TASK_STATUS_UPDATED, {
    taskId: task.id,
    title: task.title,
    status,
    previousStatus,
    operationType
  }, {
    module: 'TaskService',
    direction: 'emit'
  });

  service.eventBus.emit(EVENTS.TASK_STATUS_UPDATED, {
    task,
    previousStatus,
    operationType,
    operatorUserId: userId
  });

  if (status === TaskStatus.COMPLETED && operationType !== 'makeup_complete') {
    logger.logEvent(EVENTS.TASK_COMPLETED, {
      taskId: task.id,
      title: task.title
    }, {
      module: 'TaskService',
      direction: 'emit'
    });

    service.eventBus.emit(EVENTS.TASK_COMPLETED, {
      task,
      operatorUserId: userId
    });
  }
}

function emitTaskResetEvent(service, task) {
  service.eventBus.emit(EVENTS.TASK_RESET, {
    task,
    starsDeducted: task.points || 0
  });
}

async function createTaskLocally(service, task, options = {}) {
  task.syncedToCloud = false;
  const savedTask = await service.taskRepository.save(task);
  let createdTasks = [savedTask];

  if (options.materializeRepeats !== false && task.isRepeating()) {
    const repeatTasks = await service._generateRepeatTasks(savedTask);
    if (repeatTasks.length > 0) {
      createdTasks = createdTasks.concat(repeatTasks);
      logger.info('TaskService', `生成了${repeatTasks.length}个重复任务实例`);
    }
  }

  return {
    task: savedTask,
    createdTasks
  };
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
    assignPendingSyncMeta(service, task, 'create', {
      operationKey: taskData.operationKey || initialModifyTime,
      modifyTime: initialModifyTime,
      targetUserId: task.userId
    });

    let effectiveTask = task;
    let createdTasks = [task];
    let authoritativeMutation = null;

    if (service.enableCloudStorage) {
      try {
        authoritativeMutation = await service._createTaskViaCloud(task);
        const authoritativeCache = await service._applyAuthoritativeTaskMutation(authoritativeMutation, {
          fallbackOperation: 'create'
        });

        if (authoritativeCache.task) {
          effectiveTask = authoritativeCache.task;
        }
        if (authoritativeCache.tasks && authoritativeCache.tasks.length > 0) {
          createdTasks = authoritativeCache.tasks;
        } else if (effectiveTask) {
          createdTasks = [effectiveTask];
        }

        logger.info('TaskService', `任务已通过云端创建: ID=${effectiveTask.id}`);
      } catch (cloudError) {
        logger.warn('TaskService', `云端同步失败，使用本地数据: ${cloudError.message}`, {
          taskId: task.id,
          taskTitle: task.title
        });

        if (task.isRepeating() && task.pendingSyncMeta) {
          task.pendingSyncMeta = {
            ...task.pendingSyncMeta,
            repeatMaterializationPending: true
          };
        }

        const fallbackResult = await createTaskLocally(service, task, {
          materializeRepeats: false
        });
        effectiveTask = fallbackResult.task;
        createdTasks = fallbackResult.createdTasks;
        await service._emitTaskCloudSyncFailure('create', effectiveTask, cloudError);
      }
    } else {
      const localResult = await createTaskLocally(service, task, {
        materializeRepeats: true
      });
      effectiveTask = localResult.task;
      createdTasks = localResult.createdTasks;
      logger.info('TaskService', '云端模式未启用，仅使用本地存储', {
        taskId: effectiveTask.id,
        taskTitle: effectiveTask.title
      });
    }

    logger.info('TaskService', `创建任务成功: "${effectiveTask.title}", ID=${effectiveTask.id}`);

    logger.info('TaskService', '触发任务创建事件，包含完整任务对象', {
      taskId: effectiveTask.id,
      title: effectiveTask.title,
      tasksCount: createdTasks.length
    });

    logger.logEvent(EVENTS.TASK_CREATED, {
      taskId: effectiveTask.id,
      title: effectiveTask.title,
      tasksCount: createdTasks.length
    }, {
      module: 'TaskService',
      direction: 'emit'
    });

    service.eventBus.emit(EVENTS.TASK_CREATED, {
      task: effectiveTask,
      tasks: createdTasks,
      originalTask: effectiveTask
    });

    return service._buildTaskServiceMutationResult(authoritativeMutation, {
      task: effectiveTask,
      tasks: createdTasks,
      createdTasks,
      fallback: !authoritativeMutation && service.enableCloudStorage
    });
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
    const cloudTask = cloneTaskForCloudWrite(task);
    cloudTask.update(changes);
    assignPendingSyncMeta(service, cloudTask, 'update', {
      operationKey: changes.operationKey || changes.modifyTime || cloudTask.modifyTime,
      modifyTime: cloudTask.modifyTime,
      targetUserId: cloudTask.userId
    });

    if (service.enableCloudStorage) {
      try {
        const mutation = await service._syncUpdateToCloud(cloudTask);
        const authoritativeCache = await service._applyAuthoritativeTaskMutation(mutation, {
          fallbackOperation: 'update'
        });
        const effectiveTask = authoritativeCache.task || cloudTask;

        logger.info('TaskService', `更新任务成功（云端权威）: "${effectiveTask.title}", ID=${effectiveTask.id}${userId ? `, 用户=${userId}` : ''}`);
        emitTaskUpdatedEvent(service, effectiveTask, changes, originalStatus);

        return service._buildTaskServiceMutationResult(mutation, { task: effectiveTask });
      } catch (syncError) {
        logger.warn('TaskService', '任务更新云同步失败，降级为本地保存', {
          taskId,
          error: syncError.message
        });
      }
    }

    task.update(changes);
    assignPendingSyncMeta(service, task, 'update', {
      operationKey: changes.operationKey || changes.modifyTime || task.modifyTime,
      modifyTime: task.modifyTime,
      targetUserId: task.userId
    });

    const updatedTask = await service.taskRepository.save(task);

    logger.info('TaskService', `更新任务成功: "${updatedTask.title}", ID=${updatedTask.id}${userId ? `, 用户=${userId}` : ''}`);
    emitTaskUpdatedEvent(service, updatedTask, changes, originalStatus);

    if (service.enableCloudStorage) {
      await service._emitTaskCloudSyncFailure('update', updatedTask, new Error('任务更新已降级为本地待同步'));
    }

    return service._buildTaskServiceMutationResult(null, {
      task: updatedTask,
      fallback: service.enableCloudStorage
    });
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

    if (service.enableCloudStorage) {
      try {
        const mutation = await service._syncDeleteToCloud(taskId, deleteMeta);
        await service.taskRepository.delete(taskId);

        logger.info('TaskService', `删除任务成功（云端权威）: ${taskId}${userId ? `, 用户=${userId}` : ''}${suppressMessage ? ', 抑制消息' : ''}`);
        emitTaskDeletedEvent(service, taskId, taskInfo, suppressMessage);

        return service._buildTaskServiceMutationResult(mutation, { taskId });
      } catch (syncError) {
        logger.warn('TaskService', '云端删除失败，降级为本地删除', {
          taskId,
          error: syncError.message
        });
      }
    }

    await service._saveDeleteTombstone(deleteMeta);
    await service.taskRepository.delete(taskId);

    logger.info('TaskService', `删除任务成功: ${taskId}${userId ? `, 用户=${userId}` : ''}${suppressMessage ? ', 抑制消息' : ''}`);
    emitTaskDeletedEvent(service, taskId, taskInfo, suppressMessage);

    if (service.enableCloudStorage) {
      service.eventBus.emit(EVENTS.TASK_CLOUD_SYNC_FAILED, {
        action: 'delete',
        taskId,
        error: new Error('任务删除已降级为本地待同步'),
        pendingSyncMeta: deleteMeta,
        taskSnapshot: taskInfo
      });
    }

    return service._buildTaskServiceMutationResult(null, {
      taskId,
      fallback: service.enableCloudStorage
    });
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

    let operationType = 'update';

    if (
      !service.enableCloudStorage &&
      status === TaskStatus.COMPLETED &&
      task.penaltyApplied &&
      !task.penaltyRefunded &&
      Number(task.penaltyDeductedPoints || 0) > 0 &&
      service.starService
    ) {
      const refundPoints = Number(task.penaltyDeductedPoints || 0);
      const refundUserId = task.userId || task.assignedTo;
      const refundResult = await service.starService.addStars(
        refundPoints,
        'permanent',
        `逾期补做退回: ${task.title}`,
        {
          sourceType: 'task_makeup_refund',
          sourceId: task.id,
          userId: refundUserId
        }
      );

      if (!refundResult.success) {
        return {
          success: false,
          message: refundResult.message || '逾期补做退星失败'
        };
      }

      task.penaltyRefunded = true;
      task.penaltyRefundTime = task.completionTime || Date.now();
      operationType = 'makeup_complete';
    } else if (!task.starAwarded && !task.penaltyApplied && !task.isRequired && service.starService) {
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
      operationType = 'complete';
    } else if (task.starAwarded) {
      logger.info('TaskService', `任务 "${task.title}" 已经获得过星星，跳过积分分配`);
    } else if (task.isRequired) {
      logger.info('TaskService', `任务 "${task.title}" 是必做任务，完成后不获得星星奖励`);
      operationType = 'complete';
    } else if (task.penaltyApplied) {
      logger.info('TaskService', `任务 "${task.title}" 存在历史必做惩罚，本次完成不走普通奖励`);
      operationType = 'complete';
    }

    const syncAction = status === TaskStatus.COMPLETED ? 'complete' : 'reset';
    task.modifyTime = Date.now();
    task.pendingSyncMeta = service._buildTaskPendingSyncMeta(task, syncAction, {
      operationKey: task.modifyTime,
      modifyTime: task.modifyTime,
      targetUserId: task.userId
    });
    task.syncedToCloud = false;

    if (previousStatus === TaskStatus.COMPLETED && status !== TaskStatus.COMPLETED) {
      operationType = 'uncomplete';
    }

    if (service.enableCloudStorage) {
      try {
        const mutation = await service._syncStatusToCloud(task);
        const authoritativeCache = await service._applyAuthoritativeTaskMutation(mutation, {
          fallbackOperation: syncAction
        });
        const effectiveTask = authoritativeCache.task || task;

        logger.info('TaskService', `任务状态更新成功（云端权威）: ${effectiveTask.title}`, {
          id: effectiveTask.id,
          status: effectiveTask.status,
          operationType
        });
        emitTaskStatusEvents(service, effectiveTask, status, previousStatus, operationType, userId);

        return service._buildTaskServiceMutationResult(mutation, {
          task: effectiveTask
        });
      } catch (syncError) {
        logger.warn('TaskService', '任务状态云同步失败，降级为本地保存', {
          taskId: task.id,
          action: operationType,
          error: syncError.message
        });
      }
    }

    logger.info('TaskService', `准备保存任务: ${task.title}`, {
      id: task.id,
      status: task.status,
      starAwarded: task.starAwarded,
      points: task.points,
      modifyTime: task.modifyTime
    });

    const savedTask = await service.taskRepository.save(task);

    logger.info('TaskService', `任务保存完成: ${savedTask.title}`, {
      id: savedTask.id,
      status: savedTask.status,
      starAwarded: savedTask.starAwarded,
      points: savedTask.points,
      saveSuccess: !!savedTask
    });

    emitTaskStatusEvents(service, savedTask, status, previousStatus, operationType, userId);

    if (service.enableCloudStorage) {
      await service._emitTaskCloudSyncFailure(syncAction, savedTask, new Error('任务状态更新已降级为本地待同步'));
    }

    return service._buildTaskServiceMutationResult(null, {
      task: savedTask,
      fallback: service.enableCloudStorage
    });
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

    if (
      !service.enableCloudStorage &&
      task.penaltyRefunded &&
      Number(task.penaltyDeductedPoints || 0) > 0 &&
      service.starService
    ) {
      const refundUserId = task.userId || task.assignedTo;
      const revokeResult = await service.starService.consumeStarsFromSpecificType(
        Number(task.penaltyDeductedPoints || 0),
        'permanent',
        `撤销逾期补做退星: ${task.title}`,
        {
          sourceType: 'task_makeup_refund_revoke',
          sourceId: task.id,
          userId: refundUserId,
          originalTaskDate: task.date || null
        }
      );

      if (!revokeResult.success) {
        return {
          success: false,
          message: '永久星星不足，无法撤销逾期补做退星'
        };
      }

      task.penaltyRefunded = false;
      task.penaltyRefundTime = 0;
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

    if (service.enableCloudStorage) {
      try {
        const mutation = await service._syncStatusToCloud(task);
        const authoritativeCache = await service._applyAuthoritativeTaskMutation(mutation, {
          fallbackOperation: 'reset'
        });
        const effectiveTask = authoritativeCache.task || task;

        logger.info('TaskService', `任务重置成功（云端权威）: ${effectiveTask.title}, ID=${effectiveTask.id}${userId ? `, 用户=${userId}` : ''}`);
        emitTaskResetEvent(service, effectiveTask);

        return service._buildTaskServiceMutationResult(mutation, {
          task: effectiveTask
        });
      } catch (syncError) {
        logger.warn('TaskService', '任务重置云同步失败，降级为本地保存', {
          taskId: task.id,
          error: syncError.message
        });
      }
    }

    const savedTask = await service.taskRepository.save(task);
    logger.info('TaskService', `任务重置成功: ${savedTask.title}, ID=${savedTask.id}${userId ? `, 用户=${userId}` : ''}`);
    emitTaskResetEvent(service, savedTask);

    if (service.enableCloudStorage) {
      await service._emitTaskCloudSyncFailure('reset', savedTask, new Error('任务重置已降级为本地待同步'));
    }

    return service._buildTaskServiceMutationResult(null, {
      task: savedTask,
      fallback: service.enableCloudStorage
    });
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

    const cloudTask = cloneTaskForCloudWrite(task);
    cloudTask.isRequired = true;
    cloudTask.modifyTime = Date.now();
    assignPendingSyncMeta(service, cloudTask, 'required', {
      operationKey: cloudTask.modifyTime,
      modifyTime: cloudTask.modifyTime,
      targetUserId: cloudTask.userId
    });

    if (service.enableCloudStorage) {
      try {
        const mutation = await service._syncRequiredStateToCloud(cloudTask);
        const authoritativeCache = await service._applyAuthoritativeTaskMutation(mutation, {
          fallbackOperation: 'required'
        });
        const effectiveTask = authoritativeCache.task || cloudTask;

        logger.info('TaskService', `将任务标记为必做（云端权威）: "${effectiveTask.title}", ID=${effectiveTask.id}${userId ? `, 用户=${userId}` : ''}`);
        emitRequiredStateEvent(service, EVENTS.TASK_MARKED_REQUIRED, effectiveTask);

        return service._buildTaskServiceMutationResult(mutation, { task: effectiveTask });
      } catch (syncError) {
        logger.warn('TaskService', '任务必做标记云同步失败，降级为本地保存', {
          taskId,
          error: syncError.message
        });
      }
    }

    task.isRequired = true;
    task.modifyTime = Date.now();
    assignPendingSyncMeta(service, task, 'required', {
      operationKey: task.modifyTime,
      modifyTime: task.modifyTime,
      targetUserId: task.userId
    });

    const updatedTask = await service.taskRepository.save(task);
    logger.info('TaskService', `将任务标记为必做: "${updatedTask.title}", ID=${updatedTask.id}${userId ? `, 用户=${userId}` : ''}`);
    emitRequiredStateEvent(service, EVENTS.TASK_MARKED_REQUIRED, updatedTask);

    if (service.enableCloudStorage) {
      await service._emitTaskCloudSyncFailure('required', updatedTask, new Error('任务必做标记已降级为本地待同步'));
    }

    return service._buildTaskServiceMutationResult(null, {
      task: updatedTask,
      fallback: service.enableCloudStorage
    });
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

    const cloudTask = cloneTaskForCloudWrite(task);
    cloudTask.isRequired = false;
    cloudTask.modifyTime = Date.now();
    assignPendingSyncMeta(service, cloudTask, 'unrequired', {
      operationKey: cloudTask.modifyTime,
      modifyTime: cloudTask.modifyTime,
      targetUserId: cloudTask.userId
    });

    if (service.enableCloudStorage) {
      try {
        const mutation = await service._syncRequiredStateToCloud(cloudTask);
        const authoritativeCache = await service._applyAuthoritativeTaskMutation(mutation, {
          fallbackOperation: 'unrequired'
        });
        const effectiveTask = authoritativeCache.task || cloudTask;

        logger.info('TaskService', `取消任务的必做标记（云端权威）: "${effectiveTask.title}", ID=${effectiveTask.id}${userId ? `, 用户=${userId}` : ''}`);
        emitRequiredStateEvent(service, EVENTS.TASK_UNMARKED_REQUIRED, effectiveTask);

        return service._buildTaskServiceMutationResult(mutation, { task: effectiveTask });
      } catch (syncError) {
        logger.warn('TaskService', '任务取消必做云同步失败，降级为本地保存', {
          taskId,
          error: syncError.message
        });
      }
    }

    task.isRequired = false;
    task.modifyTime = Date.now();
    assignPendingSyncMeta(service, task, 'unrequired', {
      operationKey: task.modifyTime,
      modifyTime: task.modifyTime,
      targetUserId: task.userId
    });

    const updatedTask = await service.taskRepository.save(task);
    logger.info('TaskService', `取消任务的必做标记: "${updatedTask.title}", ID=${updatedTask.id}${userId ? `, 用户=${userId}` : ''}`);
    emitRequiredStateEvent(service, EVENTS.TASK_UNMARKED_REQUIRED, updatedTask);

    if (service.enableCloudStorage) {
      await service._emitTaskCloudSyncFailure('unrequired', updatedTask, new Error('任务取消必做已降级为本地待同步'));
    }

    return service._buildTaskServiceMutationResult(null, {
      task: updatedTask,
      fallback: service.enableCloudStorage
    });
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
