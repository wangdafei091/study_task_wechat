const logger = require('../../utils/logger');
const {
  Task,
  TaskStatus,
  TaskExecutionMode,
  TaskRecordOutcome,
  RepeatType
} = require('../../models/task');
const dateUtils = require('../../utils/dateUtils');
const { EVENTS, ERROR_MESSAGES } = require('../../utils/constants');
const {
  evaluateTaskBackfillWindow,
  buildTaskBackfillExpiredMessage
} = require('../../utils/task-backfill-window');
const taskRangeGuard = require('../../utils/task-range-guard');

const TASK_BACKFILL_WINDOW_EXPIRED = 'TASK_BACKFILL_WINDOW_EXPIRED';

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

function buildBusinessErrorResult(message, code, extra = {}) {
  return {
    success: false,
    message,
    code,
    ...extra
  };
}

function buildOccurrenceUnavailableResult() {
  return {
    success: false,
    message: '云端未完成升级，暂不可使用表现项'
  };
}

function buildOccurrenceHistoryReadonlyResult() {
  return buildBusinessErrorResult(
    '历史项仅保留查看，不支持继续修改',
    'TASK_OCCURRENCE_HISTORY_READONLY'
  );
}

function isPermissionDeniedSyncError(error) {
  if (!error) {
    return false;
  }

  return error.statusCode === 403
    || error.code === 'FAMILY_MANAGER_REQUIRED'
    || error.code === 'PERMISSION_DENIED';
}

function isViewerReadonlyUser(service) {
  const loginUser = service?.userService?.getLoginUser?.() || null;
  const currentUser = service?.userService?.getCurrentUser?.() || null;
  const isExecutingChildView = Boolean(
    loginUser &&
    currentUser &&
    loginUser.userId !== currentUser.userId &&
    currentUser.role === 'child'
  );
  return Boolean(
    loginUser &&
    loginUser.role === 'parent' &&
    loginUser.familyId &&
    loginUser.familyPermissionRole === 'viewer' &&
    !isExecutingChildView
  );
}

function getExecutionOperatorContext(service, targetUserId) {
  if (typeof service?._getOperatorContext !== 'function') {
    return null;
  }

  return service._getOperatorContext(targetUserId, 'execute');
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

function isOccurrenceConfigTask(task) {
  return Boolean(task && typeof task.isOccurrenceConfigTask === 'function' && task.isOccurrenceConfigTask());
}

function isOccurrenceRecordTask(task) {
  return Boolean(task && typeof task.isOccurrenceRecordTask === 'function' && task.isOccurrenceRecordTask());
}

function resolveOccurrenceStatusKey(task, today) {
  if (!isOccurrenceConfigTask(task) || !today) {
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

function isReadonlyHistoryOccurrenceTask(task, today = dateUtils.getTodayString()) {
  return resolveOccurrenceStatusKey(task, today) === 'history';
}

function buildOccurrenceRecordId(parentTaskId, userId, date) {
  const normalizedDate = String(date || '').replace(/-/g, '');
  return `task_occ_${parentTaskId}_${userId}_${normalizedDate}`;
}

function shiftDate(dateString, delta) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  date.setDate(date.getDate() + delta);
  return dateUtils.formatDate(date);
}

function createOccurrenceRecordFromConfig(task, userId, date) {
  const record = task.clone({
    id: buildOccurrenceRecordId(task.id, userId, date),
    userId,
    date,
    parentTaskId: task.id,
    executionMode: TaskExecutionMode.OCCURRENCE,
    isOccurrenceRecord: true,
    occurrenceOutcome: TaskRecordOutcome.NONE,
    recordedAt: 0,
    repeat: { type: RepeatType.NONE },
    activeRange: null,
    status: TaskStatus.PENDING,
    completionTime: 0,
    starAwarded: false,
    isRequired: false,
    startTime: '',
    endTime: '',
    duration: 0,
    reminder: { enabled: false }
  }, false);

  record.id = buildOccurrenceRecordId(task.id, userId, date);
  record.createTime = Date.now();
  record.modifyTime = Date.now();
  return record;
}

async function ensureOccurrenceCapabilityEnabled(service) {
  if (!service.enableCloudStorage || typeof service.isOccurrenceEnabled !== 'function') {
    return true;
  }

  return service.isOccurrenceEnabled();
}

async function addOccurrenceStars(service, record) {
  if (!service.starService || Number(record?.points || 0) <= 0) {
    return { success: true, skipped: true };
  }

  return service.starService.addStars(
    record.points,
    record.pointsExpiry,
    `记录表现达成: ${record.title}`,
    {
      sourceType: 'task_occurrence_success',
      sourceId: record.id,
      userId: record.userId
    }
  );
}

async function revokeOccurrenceStars(service, record) {
  if (!service.starService || Number(record?.points || 0) <= 0) {
    return { success: true, skipped: true };
  }

  return service.starService.consumeStarsFromSpecificType(
    record.points,
    record.pointsExpiry,
    `撤销表现达成: ${record.title}`,
    {
      sourceType: 'task_occurrence_revoke',
      sourceId: record.id,
      userId: record.userId,
      originalTaskDate: record.date || null
    }
  );
}

async function applyOccurrenceStarMutationLocally(service, existingRecord, record, outcome) {
  if (existingRecord?.occurrenceOutcome === TaskRecordOutcome.SUCCESS && existingRecord?.starAwarded) {
    const revokeResult = await revokeOccurrenceStars(service, existingRecord);
    if (!revokeResult.success) {
      return {
        success: false,
        message: '撤销原表现奖励失败，请稍后重试'
      };
    }
  }

  if (outcome === TaskRecordOutcome.SUCCESS) {
    const addResult = await addOccurrenceStars(service, record);
    record.starAwarded = addResult.success === true;

    if (!addResult.success) {
      return {
        success: false,
        message: addResult.message || '表现奖励发放失败，请稍后重试'
      };
    }
  } else {
    record.starAwarded = false;
  }

  return {
    success: true,
    record
  };
}

function emitOccurrenceRecordEvent(service, record, previousStatus, operationType, userId = null) {
  emitTaskStatusEvents(service, record, record.status, previousStatus, operationType, userId || record.userId || null);
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

  if (status === TaskStatus.COMPLETED && operationType === 'complete') {
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
    if (task.isOccurrenceMode() && !(await ensureOccurrenceCapabilityEnabled(service))) {
      return buildOccurrenceUnavailableResult();
    }
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

    if ((isOccurrenceConfigTask(task) || changes.executionMode === TaskExecutionMode.OCCURRENCE) && !(await ensureOccurrenceCapabilityEnabled(service))) {
      return buildOccurrenceUnavailableResult();
    }

    if (isReadonlyHistoryOccurrenceTask(task)) {
      return buildOccurrenceHistoryReadonlyResult();
    }

    const originalStatus = task.status;
    const cloudTask = cloneTaskForCloudWrite(task);
    cloudTask.update(changes);
    const rangeValidation = taskRangeGuard.validateTaskRangeLimits(cloudTask.toJSON(), {
      previousTask: task.toJSON()
    });
    if (!rangeValidation.valid) {
      return {
        success: false,
        message: rangeValidation.message,
        code: rangeValidation.code
      };
    }
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

    if (isReadonlyHistoryOccurrenceTask(taskInfo)) {
      return buildOccurrenceHistoryReadonlyResult();
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
      await service._emitTaskCloudSyncFailure('delete', null, new Error('任务删除已降级为本地待同步'), {
        taskId,
        pendingSyncMeta: deleteMeta,
        taskSnapshot: taskInfo,
        deleteMeta
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

async function disableOccurrenceTask(service, taskId, options = {}, userId = null) {
  try {
    const task = await loadTaskForWrite(service, taskId, '停用表现项');
    if (!task) {
      return buildNotFoundResult();
    }

    if (userId && task.userId !== userId) {
      logger.warn('TaskService', `用户${userId}尝试停用不属于自己的表现项${taskId}`);
      return { success: false, message: '无权限操作此任务' };
    }

    if (!isOccurrenceConfigTask(task)) {
      return { success: false, message: '当前任务不是表现项，无法停用' };
    }

    if (isReadonlyHistoryOccurrenceTask(task)) {
      return buildOccurrenceHistoryReadonlyResult();
    }

    if (!(await ensureOccurrenceCapabilityEnabled(service))) {
      return buildOccurrenceUnavailableResult();
    }

    const disableFromDate = options.disableFromDate || dateUtils.getTodayString();
    const nextEndDate = shiftDate(disableFromDate, -1);
    const cloudTask = cloneTaskForCloudWrite(task);
    cloudTask.activeRange = {
      startDate: cloudTask.activeRange?.startDate || cloudTask.date,
      endDate: nextEndDate,
      hasNoEndDate: false
    };
    cloudTask.hasNoEndDate = false;
    cloudTask.modifyTime = Date.now();
    assignPendingSyncMeta(service, cloudTask, 'disable_occurrence', {
      operationKey: options.operationKey || options.modifyTime || cloudTask.modifyTime,
      modifyTime: options.modifyTime || cloudTask.modifyTime,
      targetUserId: cloudTask.userId,
      extraMeta: {
        disableFromDate
      }
    });

    if (service.enableCloudStorage) {
      try {
        const mutation = await service._syncDisableOccurrenceToCloud(cloudTask, {
          disableFromDate
        });
        const authoritativeCache = await service._applyAuthoritativeTaskMutation(mutation, {
          fallbackOperation: 'disable_occurrence'
        });
        const effectiveTask = authoritativeCache.task || cloudTask;
        return service._buildTaskServiceMutationResult(mutation, {
          task: effectiveTask
        });
      } catch (syncError) {
        logger.warn('TaskService', '表现项停用云同步失败，降级为本地保存', {
          taskId,
          error: syncError.message
        });
      }
    }

    task.activeRange = {
      startDate: task.activeRange?.startDate || task.date,
      endDate: nextEndDate,
      hasNoEndDate: false
    };
    task.hasNoEndDate = false;
    task.modifyTime = Date.now();
    assignPendingSyncMeta(service, task, 'disable_occurrence', {
      operationKey: options.operationKey || options.modifyTime || task.modifyTime,
      modifyTime: options.modifyTime || task.modifyTime,
      targetUserId: task.userId,
      extraMeta: {
        disableFromDate
      }
    });

    const savedTask = await service.taskRepository.save(task);
    if (service.enableCloudStorage) {
      await service._emitTaskCloudSyncFailure(
        'disable_occurrence',
        savedTask,
        new Error('表现项停用已降级为本地待同步')
      );
    }

    return service._buildTaskServiceMutationResult(null, {
      task: savedTask,
      fallback: service.enableCloudStorage
    });
  } catch (error) {
    logger.error('TaskService', `停用表现项失败: ${error.message}`, error);
    return { success: false, message: `停用表现项失败: ${error.message}` };
  }
}

async function updateTaskStatus(service, taskId, status, userId = null) {
  try {
    if (isViewerReadonlyUser(service)) {
      return buildBusinessErrorResult(
        '当前为查看者，不能修改任务状态',
        'FAMILY_MANAGER_REQUIRED'
      );
    }

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
    const operationModifyTime = Date.now();
    const backfillWindowResult =
      status === TaskStatus.COMPLETED && previousStatus !== TaskStatus.COMPLETED
        ? evaluateTaskBackfillWindow({
          taskDate: task.date,
          pointsExpiry: task.pointsExpiry,
          operationTime: operationModifyTime
        })
        : null;

    if (backfillWindowResult && backfillWindowResult.allowed === false) {
      return buildBusinessErrorResult(
        buildTaskBackfillExpiredMessage(backfillWindowResult),
        TASK_BACKFILL_WINDOW_EXPIRED,
        {
          backfillWindowExpired: true,
          windowEndDate: backfillWindowResult.windowEndDate || null
        }
      );
    }

    if (status === 1 && previousStatus !== 1) {
      logger.info('TaskService', `任务状态变为完成，调用complete方法设置completionTime: ${task.title}`);
      task.complete();
      task.completionTime = operationModifyTime;
      task.modifyTime = operationModifyTime;
      logger.info('TaskService', `任务complete方法调用完成: ${task.title}, completionTime=${task.completionTime}`);
    } else {
      task.status = status;
      task.modifyTime = operationModifyTime;
      logger.info('TaskService', `任务状态已设置: ${task.title}, 状态=${task.status}, 类型=${typeof task.status}`);
    }

    let operationType = 'update';
    const isHistoricalCompletion = Boolean(backfillWindowResult?.isHistorical);

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
      const refundOperatorContext = getExecutionOperatorContext(service, refundUserId);
      const refundResult = await service.starService.addStars(
        refundPoints,
        'permanent',
        `逾期补做退回: ${task.title}`,
        {
          sourceType: 'task_makeup_refund',
          sourceId: task.id,
          userId: refundUserId,
          operatorContext: refundOperatorContext
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
        const executionOperatorContext = getExecutionOperatorContext(service, taskUserId);
        const addResult = await service.starService.addStars(
          task.points,
          task.pointsExpiry,
          `完成任务: ${task.title}`,
          {
            sourceType: 'task_complete',
            sourceId: task.id,
            userId: taskUserId,
            operatorContext: executionOperatorContext
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
      operationType = isHistoricalCompletion ? 'history_complete' : 'complete';
    } else if (task.starAwarded) {
      logger.info('TaskService', `任务 "${task.title}" 已经获得过星星，跳过积分分配`);
      operationType = isHistoricalCompletion ? 'history_complete' : 'complete';
    } else if (task.isRequired) {
      logger.info('TaskService', `任务 "${task.title}" 是必做任务，完成后不获得星星奖励`);
      operationType = isHistoricalCompletion ? 'history_complete' : 'complete';
    } else if (task.penaltyApplied) {
      logger.info('TaskService', `任务 "${task.title}" 存在历史必做惩罚，本次完成不走普通奖励`);
      operationType = isHistoricalCompletion ? 'history_complete' : 'complete';
    }

    const syncAction = status === TaskStatus.COMPLETED ? 'complete' : 'reset';
    task.pendingSyncMeta = service._buildTaskPendingSyncMeta(task, syncAction, {
      operationKey: operationModifyTime,
      modifyTime: operationModifyTime,
      targetUserId: task.userId,
      notificationType: status === TaskStatus.COMPLETED
        ? `task_${operationType === 'history_complete' ? 'history_complete' : operationType === 'makeup_complete' ? 'makeup_complete' : 'complete'}`
        : 'task_reset'
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
        if (syncError?.code === TASK_BACKFILL_WINDOW_EXPIRED) {
          return buildBusinessErrorResult(syncError.message, syncError.code, {
            backfillWindowExpired: true
          });
        }
        if (isPermissionDeniedSyncError(syncError)) {
          logger.warn('TaskService', '任务状态云同步被权限拒绝，停止本地降级保存', {
            taskId: task.id,
            action: operationType,
            error: syncError.message,
            code: syncError.code || null
          });
          return buildBusinessErrorResult(
            syncError.message || '无权限操作',
            syncError.code || 'PERMISSION_DENIED'
          );
        }
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
    if (isViewerReadonlyUser(service)) {
      return buildBusinessErrorResult(
        '当前为查看者，不能修改任务状态',
        'FAMILY_MANAGER_REQUIRED'
      );
    }

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
      const revokeOperatorContext = getExecutionOperatorContext(service, refundUserId);
      const revokeResult = await service.starService.consumeStarsFromSpecificType(
        Number(task.penaltyDeductedPoints || 0),
        'permanent',
        `撤销逾期补做退星: ${task.title}`,
        {
          sourceType: 'task_makeup_refund_revoke',
          sourceId: task.id,
          userId: refundUserId,
          originalTaskDate: task.date || null,
          operatorContext: revokeOperatorContext
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
      const resetOperatorContext = getExecutionOperatorContext(service, taskUserId);
      const consumeResult = await service.starService.consumeStarsFromSpecificType(
        task.points,
        task.pointsExpiry,
        `取消完成任务: ${task.title}`,
        {
          sourceType: 'task_reset',
          sourceId: task.id,
          userId: taskUserId,
          originalTaskDate: task.date || null,
          operatorContext: resetOperatorContext
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
        if (isPermissionDeniedSyncError(syncError)) {
          logger.warn('TaskService', '任务重置云同步被权限拒绝，停止本地降级保存', {
            taskId: task.id,
            error: syncError.message,
            code: syncError.code || null
          });
          return buildBusinessErrorResult(
            syncError.message || '无权限操作',
            syncError.code || 'PERMISSION_DENIED'
          );
        }
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

async function recordOccurrenceResult(service, taskId, options = {}) {
  try {
    if (isViewerReadonlyUser(service)) {
      return buildBusinessErrorResult(
        '当前为查看者，不能记录表现',
        'FAMILY_MANAGER_REQUIRED'
      );
    }

    const outcome = options.outcome;
    const date = options.date || dateUtils.getTodayString();
    const today = dateUtils.getTodayString();
    const recordUserId = options.userId || null;

    if (![TaskRecordOutcome.SUCCESS, TaskRecordOutcome.FAILURE].includes(outcome)) {
      return { success: false, message: '表现记录结果无效' };
    }

    if (date > today) {
      return { success: false, message: '未来日期不能记录表现' };
    }

    const configTask = await loadTaskForWrite(service, taskId, '记录表现');
    if (!configTask) {
      return buildNotFoundResult();
    }

    if (!isOccurrenceConfigTask(configTask)) {
      return { success: false, message: '当前任务不是表现项，无法记录结果' };
    }

    if (!(await ensureOccurrenceCapabilityEnabled(service))) {
      return buildOccurrenceUnavailableResult();
    }

    if (!recordUserId) {
      return { success: false, message: '未找到要记录的孩子' };
    }

    if (!configTask.canRecordOccurrenceOn(date)) {
      return { success: false, message: '该日期不在表现项有效时间内' };
    }

    const existingRecord = await service.taskRepository.getOccurrenceRecord(configTask.id, recordUserId, date);
    const previousOutcome = existingRecord?.occurrenceOutcome || TaskRecordOutcome.NONE;
    const previousStatus = existingRecord?.status ?? TaskStatus.PENDING;

    if (previousOutcome === outcome) {
      return {
        success: true,
        task: configTask,
        record: existingRecord,
        unchanged: true
      };
    }

    const operationTime = Date.now();
    const record = existingRecord
      ? cloneTaskForCloudWrite(existingRecord)
      : createOccurrenceRecordFromConfig(configTask, recordUserId, date);

    record.applyOccurrenceOutcome(outcome, {
      recordedAt: operationTime,
      date
    });

    if (!service.enableCloudStorage) {
      const localStarMutation = await applyOccurrenceStarMutationLocally(
        service,
        existingRecord,
        record,
        outcome
      );
      if (!localStarMutation.success) {
        return localStarMutation;
      }
    } else {
      record.starAwarded = outcome === TaskRecordOutcome.SUCCESS;
    }

    assignPendingSyncMeta(service, record, 'occurrence_record', {
      operationKey: operationTime,
      modifyTime: operationTime,
      targetUserId: record.userId,
      notificationType: outcome === TaskRecordOutcome.SUCCESS
        ? 'task_complete'
        : 'task_occurrence_failure',
      extraMeta: {
        configTaskId: configTask.id
      }
    });

    let effectiveRecord = record;
    let mutation = null;

    if (service.enableCloudStorage) {
      try {
        mutation = await service._syncOccurrenceRecordToCloud(record);
        const authoritativeCache = await service._applyAuthoritativeTaskMutation(mutation, {
          fallbackOperation: 'occurrence_record'
        });
        const recordId = mutation?.recordTask?.taskId || mutation?.recordTask?.id || record.id;
        const authoritativeRecord = Array.isArray(authoritativeCache.tasks)
          ? authoritativeCache.tasks.find((taskItem) => taskItem.id === recordId)
          : null;
        const fallbackRecord = typeof service._toAuthoritativeTask === 'function'
          ? service._toAuthoritativeTask(mutation?.recordTask, {
            syncedToCloud: true,
            pendingSyncMeta: null
          })
          : null;
        effectiveRecord = authoritativeRecord
          || fallbackRecord
          || record;
      } catch (syncError) {
        logger.warn('TaskService', '表现记录云同步失败，降级为本地保存', {
          taskId,
          recordId: record.id,
          error: syncError.message
        });
      }
    }

    if (!mutation) {
      if (service.enableCloudStorage) {
        const fallbackStarMutation = await applyOccurrenceStarMutationLocally(
          service,
          existingRecord,
          record,
          outcome
        );
        if (!fallbackStarMutation.success) {
          return fallbackStarMutation;
        }
      }

      effectiveRecord = await service.taskRepository.save(record);
      if (service.enableCloudStorage) {
        await service._emitTaskCloudSyncFailure('occurrence_record', effectiveRecord, new Error('表现记录已降级为本地待同步'));
      }
    }

    const operationType = outcome === TaskRecordOutcome.SUCCESS
      ? 'complete'
      : (previousOutcome === TaskRecordOutcome.SUCCESS ? 'uncomplete' : 'occurrence_failure');
    emitOccurrenceRecordEvent(service, effectiveRecord, previousStatus, operationType, recordUserId);

    const result = service._buildTaskServiceMutationResult(mutation, {
      task: configTask,
      fallback: !mutation && service.enableCloudStorage
    });
    result.record = effectiveRecord;
    result.starsAwarded = effectiveRecord.starAwarded === true;
    return result;
  } catch (error) {
    logger.error('TaskService', `记录表现失败: ${error.message}`, error);
    return { success: false, message: `记录表现失败: ${error.message}` };
  }
}

async function convertTaskToOccurrenceMode(service, taskId, options = {}, userId = null) {
  try {
    const task = await loadTaskForWrite(service, taskId, '切换为表现项');
    if (!task) {
      return buildNotFoundResult();
    }

    if (userId && task.userId !== userId) {
      return { success: false, message: '无权限操作此任务' };
    }

    if (isOccurrenceConfigTask(task)) {
      return { success: true, convertedTask: task, archivedFutureInstances: [], unchanged: true };
    }

    if (!(await ensureOccurrenceCapabilityEnabled(service))) {
      return buildOccurrenceUnavailableResult();
    }

    const effectiveFromDate = options.effectiveFromDate || dateUtils.getTodayString();
    let archivedFutureInstances = [];

    if (service.enableCloudStorage) {
      const cloudTask = cloneTaskForCloudWrite(task);
      cloudTask.modifyTime = Date.now();
      assignPendingSyncMeta(service, cloudTask, 'convert_occurrence', {
        operationKey: options.operationKey || options.modifyTime || cloudTask.modifyTime,
        modifyTime: options.modifyTime || cloudTask.modifyTime,
        targetUserId: cloudTask.userId,
        extraMeta: {
          effectiveFromDate
        }
      });

      try {
        const mutation = await service._syncConvertOccurrenceToCloud(cloudTask, {
          effectiveFromDate
        });
        const authoritativeCache = await service._applyAuthoritativeTaskMutation(mutation, {
          fallbackOperation: 'convert_occurrence'
        });
        const effectiveTask = authoritativeCache.task || cloudTask;

        return {
          ...service._buildTaskServiceMutationResult(mutation, {
            task: effectiveTask
          }),
          convertedTask: effectiveTask,
          archivedFutureInstances: mutation?.archivedFutureTaskIds || []
        };
      } catch (syncError) {
        logger.warn('TaskService', '切换表现项云同步失败，降级为本地保存', {
          taskId,
          error: syncError.message
        });
      }
    }

    if (typeof service.taskRepository.getChildTasks === 'function') {
      const childTasks = await service.taskRepository.getChildTasks(task.id, task.userId);
      for (const childTask of childTasks) {
        if (childTask.date < effectiveFromDate) {
          continue;
        }
        if (childTask.isCompleted() || childTask.starAwarded) {
          continue;
        }
        await service.taskRepository.delete(childTask.id);
        archivedFutureInstances.push(childTask.id);
      }
    }

    const nextHasNoEndDate = task.hasNoEndDate || !(task.repeat?.endDate);
    const nextActiveRange = {
      startDate: effectiveFromDate,
      endDate: nextHasNoEndDate ? '' : (task.repeat?.endDate || ''),
      hasNoEndDate: nextHasNoEndDate
    };

    task.update({
      executionMode: TaskExecutionMode.OCCURRENCE,
      activeRange: nextActiveRange,
      repeat: { type: RepeatType.NONE },
      isRequired: false,
      hasNoEndDate: nextActiveRange.hasNoEndDate,
      date: effectiveFromDate,
      startTime: '',
      endTime: '',
      duration: 0,
      reminder: { enabled: false }
    });
    assignPendingSyncMeta(service, task, 'convert_occurrence', {
      operationKey: options.operationKey || options.modifyTime || task.modifyTime,
      modifyTime: options.modifyTime || task.modifyTime,
      targetUserId: task.userId,
      extraMeta: {
        effectiveFromDate
      }
    });

    const savedTask = await service.taskRepository.save(task);
    if (service.enableCloudStorage) {
      await service._emitTaskCloudSyncFailure(
        'convert_occurrence',
        savedTask,
        new Error('切换表现项已降级为本地待同步')
      );
    }

    return {
      ...service._buildTaskServiceMutationResult(null, {
        task: savedTask,
        fallback: service.enableCloudStorage
      }),
      convertedTask: savedTask,
      archivedFutureInstances
    };
  } catch (error) {
    logger.error('TaskService', `切换表现项失败: ${error.message}`, error);
    return { success: false, message: `切换表现项失败: ${error.message}` };
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
  recordOccurrenceResult,
  convertTaskToOccurrenceMode,
  disableOccurrenceTask,
  markTaskAsRequired,
  unmarkTaskAsRequired
};
