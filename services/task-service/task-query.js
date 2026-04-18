const logger = require('../../utils/logger');
const dateUtils = require('../../utils/dateUtils');
const userContextUtils = require('../../utils/user-context');
const { TaskStatus, TaskType } = require('../../models/task');
const { EVENTS } = require('../../utils/constants');

function isOccurrenceConfigTask(task) {
  return Boolean(task && typeof task.isOccurrenceConfigTask === 'function' && task.isOccurrenceConfigTask());
}

function isOccurrenceRecordTask(task) {
  return Boolean(task && typeof task.isOccurrenceRecordTask === 'function' && task.isOccurrenceRecordTask());
}

function isOccurrenceTask(task) {
  return isOccurrenceConfigTask(task) || isOccurrenceRecordTask(task);
}

function isRegularPlannedTask(task) {
  return Boolean(task) && !isOccurrenceTask(task);
}

function shouldIncludeTask(task, options = {}) {
  if (!task) {
    return false;
  }

  if (options.occurrenceOnly === true) {
    return isOccurrenceTask(task);
  }

  if (options.includeOccurrence === true) {
    return true;
  }

  return isRegularPlannedTask(task);
}

function shouldCountTaskAsCompleted(task) {
  if (isOccurrenceRecordTask(task)) {
    return task.occurrenceOutcome === 'success';
  }

  return Number(task?.status) === TaskStatus.COMPLETED;
}

function isPendingSyncOccurrenceRecord(task) {
  if (!isOccurrenceRecordTask(task)) {
    return false;
  }

  return Boolean(task.pendingSyncMeta || task.syncedToCloud === false);
}

function buildOccurrenceRecordSemanticKey(task = {}) {
  const parentTaskId = task.parentTaskId || task.pendingSyncMeta?.configTaskId || '';
  const userId = task.userId || task.pendingSyncMeta?.targetUserId || '';
  const date = task.date || '';

  if (parentTaskId && userId && date) {
    return `${parentTaskId}::${userId}::${date}`;
  }

  return task.id ? `id:${task.id}` : '';
}

function getOccurrenceRecordPriority(task = {}) {
  if (!task || typeof task !== 'object') {
    return -1;
  }

  const hasPendingMeta = Boolean(task.pendingSyncMeta);
  if (task.syncedToCloud === true && !hasPendingMeta) {
    return 3;
  }

  if (!hasPendingMeta && task.syncedToCloud !== false) {
    return 2;
  }

  return 1;
}

function shouldReplaceOccurrenceRecord(existingRecord, candidateRecord) {
  if (!existingRecord) {
    return true;
  }

  const existingPriority = getOccurrenceRecordPriority(existingRecord);
  const candidatePriority = getOccurrenceRecordPriority(candidateRecord);
  if (candidatePriority !== existingPriority) {
    return candidatePriority > existingPriority;
  }

  const existingModifyTime = Number(existingRecord.modifyTime || existingRecord.recordedAt || 0);
  const candidateModifyTime = Number(candidateRecord.modifyTime || candidateRecord.recordedAt || 0);
  if (candidateModifyTime !== existingModifyTime) {
    return candidateModifyTime > existingModifyTime;
  }

  return false;
}

function mergeOccurrenceRecords(cloudTasks = [], localTasks = []) {
  const mergedMap = new Map();

  (cloudTasks || []).concat(localTasks || []).forEach((task) => {
    if (!isOccurrenceRecordTask(task)) {
      return;
    }

    const semanticKey = buildOccurrenceRecordSemanticKey(task);
    if (!semanticKey) {
      return;
    }

    const existingRecord = mergedMap.get(semanticKey);
    if (shouldReplaceOccurrenceRecord(existingRecord, task)) {
      mergedMap.set(semanticKey, task);
    }
  });

  return Array.from(mergedMap.values());
}

function shouldIncludeInProgressSummary(task) {
  return !isPendingSyncOccurrenceRecord(task);
}

function filterTasksByOptions(tasks = [], options = {}) {
  return (Array.isArray(tasks) ? tasks : []).filter((task) => shouldIncludeTask(task, options));
}

function hasQueryOptions(options = {}) {
  return Object.keys(options || {}).length > 0;
}

async function getAllTasks(service, userId = null, options = {}) {
  try {
    let tasks;

    if (service.enableCloudStorage) {
      if (userId && options.requireFreshStars === true && service.starService?.refreshStarsFromCloud) {
        try {
          // M09 既有契约：允许 resetTask 等可写任务页面在云读取前显式对齐星星余额。
          await service.starService.refreshStarsFromCloud(userId);
        } catch (refreshError) {
          logger.warn('TaskService', '任务读取前刷新星星失败，继续按现有数据读取任务', {
            userId,
            error: refreshError.message
          });
        }
      }

      try {
        tasks = await service._fetchTasksFromCloud(userId, options);
        logger.info('TaskService', `从云端获取任务成功: ${tasks?.length || 0}个`, {
          userId,
          taskCount: tasks?.length || 0
        });

        tasks = await service._mergeLocalTasksIntoCloudResult(
          tasks,
          userId,
          async (targetId) => {
            const allLocal = await service.taskRepository.getAll();
            return allLocal.filter((task) => task.userId === targetId);
          },
          '全量任务'
        );
      } catch (cloudError) {
        logger.warn('TaskService', '云端获取失败，降级到本地存储', {
          userId,
          error: cloudError.message
        });

        try {
          if (userId) {
            const allTasks = await service.taskRepository.getAll();
            tasks = allTasks.filter((task) => task.userId === userId);
          } else {
            tasks = await service.taskRepository.getAll();
          }

          logger.info('TaskService', `降级成功，从本地获取任务: ${tasks?.length || 0}个`, {
            userId,
            taskCount: tasks?.length || 0
          });
        } catch (localError) {
          logger.error('TaskService', '本地获取任务也失败', {
            userId,
            error: localError.message
          });
          return [];
        }
      }
    } else {
      if (userId) {
        const allTasks = await service.taskRepository.getAll();
        tasks = allTasks.filter((task) => task.userId === userId);
      } else {
        tasks = await service.taskRepository.getAll();
      }

      logger.info('TaskService', `从本地获取任务成功: ${tasks?.length || 0}个`, {
        userId,
        taskCount: tasks?.length || 0,
        mode: 'local'
      });
    }

    return filterTasksByOptions(tasks, options);
  } catch (error) {
    logger.error('TaskService', '获取所有任务失败', error);
    return [];
  }
}

async function getTaskById(service, taskId, userId = null) {
  try {
    const task = await service.taskRepository.getById(taskId);

    if (task && userId && task.userId !== userId) {
      logger.warn('TaskService', `用户${userId}尝试访问不属于自己的任务${taskId}`);
      return null;
    }

    return task;
  } catch (error) {
    logger.error('TaskService', `获取任务详情失败, ID=${taskId}`, error);
    return null;
  }
}

async function getTodayTasks(service, userId = null, options = {}) {
  const today = dateUtils.getTodayString();
  return service.getTasksByDate(today, userId, options);
}

async function getTasksByDate(service, date, userId = null, options = {}) {
  try {
    let tasks;
    const repoGetTasksByDate = (targetDate, targetUserId) => (
      hasQueryOptions(options)
        ? service.taskRepository.getTasksByDate(targetDate, targetUserId, options)
        : service.taskRepository.getTasksByDate(targetDate, targetUserId)
    );

    if (service.enableCloudStorage) {
      if (userId && options.requireFreshStars === true && service.starService?.refreshStarsFromCloud) {
        try {
          // 该路径属于任务域读前余额对齐，不并入页面层的统一刷新 orchestration。
          await service.starService.refreshStarsFromCloud(userId);
        } catch (refreshError) {
          logger.warn('TaskService', '按日期读取任务前刷新星星失败，继续按现有数据读取任务', {
            userId,
            date,
            error: refreshError.message
          });
        }
      }

      try {
        const cloudParams = { date, ...options };
        tasks = await service._fetchTasksFromCloud(userId, cloudParams);
        tasks = await service._mergeLocalTasksIntoCloudResult(
          tasks,
          userId,
          (targetId) => repoGetTasksByDate(date, targetId),
          `${date}任务`
        );
        logger.info('TaskService', `从云端获取${date}任务成功: ${tasks.length}个`);
      } catch (cloudError) {
        logger.warn('TaskService', `云端获取${date}任务失败，降级到本地`, {
          error: cloudError.message
        });
        tasks = await repoGetTasksByDate(date, userId);
      }
    } else {
      tasks = await repoGetTasksByDate(date, userId);
    }

    logger.info('TaskService', `获取${date}任务成功${userId ? `, 用户=${userId}` : ''}, 数量=${tasks.length}`);
    return filterTasksByOptions(tasks, options);
  } catch (error) {
    logger.error('TaskService', `获取${date}任务失败`, error);
    return [];
  }
}

async function getTasksByDateRange(service, startDate, endDate, userId = null, options = {}) {
  try {
    let tasks;
    const repoGetTasksByDateRange = (targetStartDate, targetEndDate, targetUserId) => (
      hasQueryOptions(options)
        ? service.taskRepository.getTasksByDateRange(targetStartDate, targetEndDate, targetUserId, options)
        : service.taskRepository.getTasksByDateRange(targetStartDate, targetEndDate, targetUserId)
    );
    if (service.enableCloudStorage) {
      try {
        tasks = await service._fetchTasksFromCloud(userId, { startDate, endDate, ...options });
        tasks = await service._mergeLocalTasksIntoCloudResult(
          tasks,
          userId,
          (targetId) => repoGetTasksByDateRange(startDate, endDate, targetId),
          `${startDate}至${endDate}任务`
        );
      } catch (cloudError) {
        logger.warn('TaskService', '云端日期范围查询失败，降级本地', { error: cloudError.message });
        tasks = await repoGetTasksByDateRange(startDate, endDate, userId);
      }
    } else {
      tasks = await repoGetTasksByDateRange(startDate, endDate, userId);
    }
    logger.info('TaskService', `获取${startDate}至${endDate}的任务成功${userId ? `, 用户=${userId}` : ''}, 数量=${tasks.length}`);
    return filterTasksByOptions(tasks, options);
  } catch (error) {
    logger.error('TaskService', `获取${startDate}至${endDate}的任务失败`, error);
    return [];
  }
}

async function getRequiredTasks(service, date, userId = null) {
  try {
    const tasks = await service.taskRepository.getRequiredTasks(date, userId);
    logger.info('TaskService', `获取必做任务成功${date ? `, 日期=${date}` : ''}${userId ? `, 用户=${userId}` : ''}, 数量=${tasks.length}`);
    return tasks;
  } catch (error) {
    logger.error('TaskService', `获取必做任务失败${date ? `, 日期=${date}` : ''}`, error);
    return [];
  }
}

async function getExpiredIncompleteTasks(service, userId = null) {
  try {
    const tasks = await service.taskRepository.getExpiredIncompleteTask(userId);
    logger.info('TaskService', `获取过期未完成任务成功${userId ? `, 用户=${userId}` : ''}, 数量=${tasks.length}`);
    return tasks;
  } catch (error) {
    logger.error('TaskService', '获取过期未完成任务失败', error);
    return [];
  }
}

async function calculateTaskProgress(service, tasks = null) {
  try {
    logger.info('TaskService', '开始计算任务进度', { tasksProvided: !!tasks });

    const tasksToProcess = tasks || await (async () => {
      const today = dateUtils.getTodayString();
      const regularTasks = await service.getTasksByDate(today);
      const occurrenceRecords = await service.getOccurrenceRecordsByDateRange({
        startDate: today,
        endDate: today
      });
      return regularTasks.concat(occurrenceRecords);
    })();
    const typeCounts = {
      total: { habit: 0, study: 0, interest: 0 },
      completed: { habit: 0, study: 0, interest: 0 }
    };

    tasksToProcess
      .filter(shouldIncludeInProgressSummary)
      .forEach((task) => {
      if (isOccurrenceConfigTask(task)) {
        return;
      }

      if (typeCounts.total.hasOwnProperty(task.type)) {
        typeCounts.total[task.type] += 1;
        if (shouldCountTaskAsCompleted(task)) {
          typeCounts.completed[task.type] += 1;
        }
      }
    });

    const progress = {
      habit: typeCounts.total.habit > 0 ? Math.round(typeCounts.completed.habit / typeCounts.total.habit * 100) : 0,
      study: typeCounts.total.study > 0 ? Math.round(typeCounts.completed.study / typeCounts.total.study * 100) : 0,
      interest: typeCounts.total.interest > 0 ? Math.round(typeCounts.completed.interest / typeCounts.total.interest * 100) : 0
    };

    const taskProgress = {
      habit: Number(progress.habit || 0),
      interest: Number(progress.interest || 0),
      study: Number(progress.study || 0)
    };

    const countableTasks = tasksToProcess.filter((task) => (
      !isOccurrenceConfigTask(task) && shouldIncludeInProgressSummary(task)
    ));
    const totalTasks = countableTasks.length;
    const completedTasks = countableTasks.filter((task) => shouldCountTaskAsCompleted(task)).length;
    const completionRate = totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0;

    const result = {
      taskProgress,
      stats: {
        totalTasks,
        completedTasks,
        completionRate,
        typeCounts: {
          habit: typeCounts.total.habit,
          study: typeCounts.total.study,
          interest: typeCounts.total.interest
        }
      }
    };

    logger.info('TaskService', `计算任务进度成功，已包含数据类型转换: 总任务数=${totalTasks}, 完成率=${completionRate}%`);
    return result;
  } catch (error) {
    logger.error('TaskService', '计算任务进度失败', error);
    return {
      taskProgress: { habit: 0, study: 0, interest: 0 },
      stats: {
        totalTasks: 0,
        completedTasks: 0,
        completionRate: 0,
        typeCounts: { habit: 0, study: 0, interest: 0 }
      }
    };
  }
}

async function checkUpcomingTasks(service, userId = null) {
  try {
    logger.info('TaskService', '开始检查即将到期任务');

    const today = dateUtils.getTodayString();
    const tomorrow = dateUtils.getTomorrowString();

    let tasks;
    if (typeof service.taskRepository.getTasksByDateRange === 'function') {
      tasks = await service.taskRepository.getTasksByDateRange(today, tomorrow, userId);
    } else {
      tasks = await service.taskRepository.getTodayTasks();
      if (userId) {
        tasks = tasks.filter((task) => !task.userId || task.userId === userId);
      }
    }

    if (!tasks || tasks.length === 0) {
      logger.info('TaskService', '今天至明天没有需要检查的任务');
      return { success: true, count: 0, tasks: [] };
    }

    const current = new Date();
    const upcomingTasks = [];

    logger.info('TaskService', `检查${tasks.length}个今日任务的提醒状态`);

    tasks.forEach((task) => {
      if (task.status !== TaskStatus.PENDING) {
        return;
      }

      logger.debug('TaskService', `检查任务: ${task.title} (${task.type})`, {
        hasReminder: !!(task.reminder && task.reminder.enabled),
        reminderTime: task.reminder?.time,
        startTime: task.startTime
      });

      if (!task.reminder || !task.reminder.enabled) {
        logger.debug('TaskService', `任务${task.title}未设置提醒，跳过`);
        return;
      }

      let taskStartTime;
      if (task.startTime) {
        taskStartTime = new Date(`${task.date}T${task.startTime}`);
      } else {
        if (task.reminder.time !== -1) {
          logger.debug('TaskService', `全天任务${task.title}只支持提前1天提醒，跳过`);
          return;
        }
        taskStartTime = new Date(`${task.date}T00:00`);
      }

      let reminderTime;
      if (task.reminder.time === -1) {
        reminderTime = new Date(taskStartTime.getTime() - 24 * 60 * 60 * 1000);
        reminderTime.setHours(20, 0, 0, 0);
        logger.debug('TaskService', `任务${task.title}设置为提前1天晚上8点提醒`, {
          taskStartTime: taskStartTime.toISOString(),
          reminderTime: reminderTime.toISOString()
        });
      } else {
        reminderTime = new Date(taskStartTime.getTime() - task.reminder.time * 60 * 1000);
        logger.debug('TaskService', `任务${task.title}设置为提前${task.reminder.time}分钟提醒`, {
          taskStartTime: taskStartTime.toISOString(),
          reminderTime: reminderTime.toISOString()
        });
      }

      const diffMinutes = Math.floor((taskStartTime - current) / (1000 * 60));
      const reminderDiffMinutes = Math.floor((reminderTime - current) / (1000 * 60));

      logger.debug('TaskService', `任务${task.title}时间计算`, {
        currentTime: current.toISOString(),
        taskStartTime: taskStartTime.toISOString(),
        reminderTime: reminderTime.toISOString(),
        diffMinutes,
        reminderDiffMinutes,
        shouldRemind: reminderDiffMinutes <= 0 && diffMinutes > 0
      });

      if (reminderDiffMinutes <= 0 && diffMinutes > 0) {
        logger.info('TaskService', `发现需要提醒的任务: ${task.title} (${task.type})`, {
          timeRemaining: diffMinutes,
          reminderType: task.reminder.time === -1 ? '提前1天晚上8点' : `提前${task.reminder.time}分钟`
        });

        upcomingTasks.push({
          task,
          timeRemaining: diffMinutes,
          reminderType: task.reminder.time === -1 ? '提前1天晚上8点' : `提前${task.reminder.time}分钟`
        });
      }
    });

    for (const item of upcomingTasks) {
      service.eventBus.emit(EVENTS.TASK_UPCOMING, {
        task: item.task,
        timeRemaining: item.timeRemaining
      });

      logger.info('TaskService', `触发任务提醒事件: ${item.task.title}`, {
        timeRemaining: item.timeRemaining,
        reminderType: item.reminderType
      });
    }

    logger.info('TaskService', `检查完成，发现${upcomingTasks.length}个需要提醒的任务`);
    return { success: true, count: upcomingTasks.length, tasks: upcomingTasks };
  } catch (error) {
    logger.error('TaskService', `检查即将到期任务失败: ${error.message}`, error);
    return { success: false, message: '检查即将到期任务失败' };
  }
}

async function getTaskStatistics(service, dateRange = {}, scopeOptions = {}) {
  try {
    logger.info('TaskService', '获取任务统计数据', {
      ...dateRange,
      ...scopeOptions
    });

    let tasks;
    if (dateRange.startDate && dateRange.endDate) {
      tasks = await service.getTasksByDateRange(
        dateRange.startDate,
        dateRange.endDate,
        scopeOptions.userId || null,
        {
          ...(scopeOptions.scope ? { scope: scopeOptions.scope } : {}),
          includeOccurrence: scopeOptions.includeOccurrence === true
        }
      );
    } else if (scopeOptions.userId || scopeOptions.scope) {
      tasks = await service.getTasksByScope(scopeOptions);
    } else {
      tasks = await service.getAllTasks(null, {
        includeOccurrence: scopeOptions.includeOccurrence === true
      });
    }

    const stats = {
      totalTasks: tasks.length,
      completedTasks: tasks.filter((task) => shouldCountTaskAsCompleted(task)).length,
      completionRate: 0,
      typeCounts: {
        habit: tasks.filter((task) => task.type === TaskType.HABIT).length,
        study: tasks.filter((task) => task.type === TaskType.STUDY).length,
        interest: tasks.filter((task) => task.type === TaskType.INTEREST).length
      },
      typeCompletion: {
        habit: tasks.filter((task) => task.type === TaskType.HABIT && shouldCountTaskAsCompleted(task)).length,
        study: tasks.filter((task) => task.type === TaskType.STUDY && shouldCountTaskAsCompleted(task)).length,
        interest: tasks.filter((task) => task.type === TaskType.INTEREST && shouldCountTaskAsCompleted(task)).length
      },
      overdueCount: tasks.filter((task) => task.status === TaskStatus.OVERDUE).length,
      streak: await service._calculateStreak(tasks)
    };

    if (stats.totalTasks > 0) {
      stats.completionRate = Math.round((stats.completedTasks / stats.totalTasks) * 100);
    }

    stats.typeCompletionRate = {
      habit: stats.typeCounts.habit > 0 ? Math.round((stats.typeCompletion.habit / stats.typeCounts.habit) * 100) : 0,
      study: stats.typeCounts.study > 0 ? Math.round((stats.typeCompletion.study / stats.typeCounts.study) * 100) : 0,
      interest: stats.typeCounts.interest > 0 ? Math.round((stats.typeCompletion.interest / stats.typeCounts.interest) * 100) : 0
    };

    const dailyStats = service._calculateDailyStats(tasks);

    logger.info('TaskService', `统计完成: 总任务=${stats.totalTasks}, 完成率=${stats.completionRate}%`);

    return {
      ...stats,
      dailyStats
    };
  } catch (error) {
    logger.error('TaskService', '获取任务统计数据失败', error);
    return {
      totalTasks: 0,
      completedTasks: 0,
      completionRate: 0,
      typeCounts: { habit: 0, study: 0, interest: 0 },
      typeCompletion: { habit: 0, study: 0, interest: 0 },
      typeCompletionRate: { habit: 0, study: 0, interest: 0 },
      overdueCount: 0,
      streak: 0,
      dailyStats: []
    };
  }
}

function calculateDailyStats(tasks) {
  const tasksByDate = {};

  tasks.forEach((task) => {
    if (!task.date) return;
    if (isOccurrenceConfigTask(task)) return;
    if (!tasksByDate[task.date]) {
      tasksByDate[task.date] = [];
    }
    tasksByDate[task.date].push(task);
  });

  const dailyStats = [];
  for (const date in tasksByDate) {
    const dayTasks = tasksByDate[date];
    const completed = dayTasks.filter((task) => shouldCountTaskAsCompleted(task)).length;

    dailyStats.push({
      date,
      totalTasks: dayTasks.length,
      completedTasks: completed,
      completionRate: dayTasks.length > 0 ? Math.round(completed / dayTasks.length * 100) : 0,
      typeCounts: {
        habit: dayTasks.filter((task) => task.type === TaskType.HABIT).length,
        study: dayTasks.filter((task) => task.type === TaskType.STUDY).length,
        interest: dayTasks.filter((task) => task.type === TaskType.INTEREST).length
      }
    });
  }

  dailyStats.sort((a, b) => a.date.localeCompare(b.date));
  return dailyStats;
}

async function calculateStreak(tasks) {
  try {
    const tasksByDate = {};

    tasks.forEach((task) => {
      if (!task.date) return;
      if (isOccurrenceConfigTask(task)) return;
      if (!tasksByDate[task.date]) {
        tasksByDate[task.date] = {
          hasTasks: true,
          hasCompleted: false
        };
      }
      if (shouldCountTaskAsCompleted(task)) {
        tasksByDate[task.date].hasCompleted = true;
      }
    });

    const dates = Object.keys(tasksByDate).sort();
    if (dates.length === 0) {
      return 0;
    }

    const today = dateUtils.getTodayString();
    let currentDate = today;
    let streak = 0;

    while (tasksByDate[currentDate] && tasksByDate[currentDate].hasCompleted) {
      streak += 1;
      const prevDate = new Date(currentDate);
      prevDate.setDate(prevDate.getDate() - 1);
      currentDate = dateUtils.formatDate(prevDate);
    }

    logger.info('TaskService', `计算连续完成天数: ${streak}天`);
    return streak;
  } catch (error) {
    logger.error('TaskService', '计算连续完成天数失败', error);
    return 0;
  }
}

async function getTasksByScope(service, options = {}) {
  try {
    if (options.userId) {
      return service.getAllTasks(options.userId, options);
    }
    if (options.scope === 'family') {
      if (service.enableCloudStorage) {
        const cloudTasks = await service._fetchTasksFromCloud(null, { scope: 'family' });
        const localTasks = await service.taskRepository.getAll();
        const cloudIds = new Set((cloudTasks || []).map((task) => task.id).filter(Boolean));
        const localOnlyTasks = (localTasks || []).filter((task) => !cloudIds.has(task.id));
        const mergedTasks = localOnlyTasks.length > 0
          ? [...cloudTasks, ...localOnlyTasks]
          : cloudTasks;
        return filterTasksByOptions(mergedTasks, options);
      }
      return filterTasksByOptions(await service.taskRepository.getAll(), options);
    }
    return service.getAllTasks(null, options);
  } catch (error) {
    logger.error('TaskService', 'getTasksByScope 失败', error);
    return [];
  }
}

function getTaskOwnerUserId(task = {}) {
  return task.userId || task.pendingSyncMeta?.targetUserId || null;
}

function isPendingLocalTask(task) {
  return Boolean(task && (task.pendingSyncMeta || task.syncedToCloud !== true));
}

function getFamilyChildUserIds(service) {
  const availableUsers = service.userService?.getAllUsers?.() || [];
  return availableUsers
    .filter((user) => user?.role === 'child' && user?.status !== 'inactive')
    .map((user) => userContextUtils.getUserIdentifier(user))
    .filter(Boolean);
}

function filterFamilyChildTasks(service, tasks = []) {
  const childUserIds = getFamilyChildUserIds(service);
  if (childUserIds.length === 0) {
    return [];
  }

  const childUserIdSet = new Set(childUserIds);
  return (Array.isArray(tasks) ? tasks : []).filter((task) => childUserIdSet.has(getTaskOwnerUserId(task)));
}

async function getChildTasksByScope(service, options = {}) {
  try {
    if (options.userId || options.scope !== 'family') {
      return getTasksByScope(service, options);
    }

    return filterFamilyChildTasks(service, await getTasksByScope(service, options));
  } catch (error) {
    logger.error('TaskService', 'getChildTasksByScope 失败', error);
    return [];
  }
}

async function getPendingLocalTasksByScope(service, options = {}) {
  try {
    const localTasks = await service.taskRepository.getAll();
    const pendingTasks = (Array.isArray(localTasks) ? localTasks : []).filter(isPendingLocalTask);

    if (options.userId) {
      return pendingTasks.filter((task) => getTaskOwnerUserId(task) === options.userId);
    }

    if (options.scope === 'family') {
      return pendingTasks;
    }

    const currentUserId = userContextUtils.getUserIdentifier(service.userService?.getCurrentUser?.())
      || service.userService?.getCurrentUserId?.()
      || null;

    if (currentUserId) {
      return pendingTasks.filter((task) => getTaskOwnerUserId(task) === currentUserId);
    }

    return pendingTasks;
  } catch (error) {
    logger.error('TaskService', 'getPendingLocalTasksByScope 失败', error);
    return [];
  }
}

async function getPendingLocalChildTasksByScope(service, options = {}) {
  try {
    if (options.userId || options.scope !== 'family') {
      return getPendingLocalTasksByScope(service, options);
    }

    return filterFamilyChildTasks(service, await getPendingLocalTasksByScope(service, options));
  } catch (error) {
    logger.error('TaskService', 'getPendingLocalChildTasksByScope 失败', error);
    return [];
  }
}

async function getOccurrenceTasks(service, scope = {}) {
  try {
    const date = scope.date || dateUtils.getTodayString();
    const startDate = scope.startDate || '';
    const endDate = scope.endDate || '';
    const userId = scope.userId || null;
    const includeInactive = scope.includeInactive === true;
    const hasRange = Boolean(startDate && endDate);

    if (service.enableCloudStorage && typeof service.isOccurrenceEnabled === 'function') {
      const enabled = await service.isOccurrenceEnabled();
      if (!enabled) {
        return [];
      }
    }

    if (service.enableCloudStorage) {
      try {
        const cloudParams = {
          includeOccurrence: true,
          occurrenceMode: 'config',
          includeInactive
        };
        if (hasRange) {
          cloudParams.startDate = startDate;
          cloudParams.endDate = endDate;
        } else if (!includeInactive) {
          cloudParams.date = date;
        }
        const cloudTasks = await service._fetchTasksFromCloud(userId, {
          ...cloudParams
        });
        const localTasks = hasRange
          ? await service.taskRepository.getAll()
          : await service.taskRepository.getOccurrenceTasks(date, userId, { includeInactive });
        const cloudIds = new Set((cloudTasks || []).map((task) => task.id));
        const mergedTasks = (cloudTasks || []).concat(
          (localTasks || []).filter((task) => {
            if (cloudIds.has(task.id)) {
              return false;
            }
            if (userId && task.userId !== userId) {
              return false;
            }
            return true;
          })
        );

        return mergedTasks.filter((task) => {
          if (!isOccurrenceConfigTask(task)) {
            return false;
          }

          if (includeInactive && !hasRange) {
            return true;
          }

          if (hasRange) {
            const taskStartDate = task.activeRange?.startDate || task.date;
            const taskEndDate = task.activeRange?.hasNoEndDate ? '' : (task.activeRange?.endDate || '');
            const overlapsStart = !taskEndDate || taskEndDate >= startDate;
            return Boolean(taskStartDate && taskStartDate <= endDate && overlapsStart);
          }

          return includeInactive || task.canRecordOccurrenceOn(date);
        });
      } catch (cloudError) {
        logger.warn('TaskService', '云端获取表现项失败，降级到本地', {
          date,
          userId,
          error: cloudError.message
        });
      }
    }

    if (hasRange) {
      const localTasks = await service.taskRepository.getAll();
      return (localTasks || []).filter((task) => {
        if (userId && task.userId !== userId) {
          return false;
        }
        if (!isOccurrenceConfigTask(task)) {
          return false;
        }
        if (includeInactive) {
          return true;
        }
        const taskStartDate = task.activeRange?.startDate || task.date;
        const taskEndDate = task.activeRange?.hasNoEndDate ? '' : (task.activeRange?.endDate || '');
        const overlapsStart = !taskEndDate || taskEndDate >= startDate;
        return Boolean(taskStartDate && taskStartDate <= endDate && overlapsStart);
      });
    }

    return service.taskRepository.getOccurrenceTasks(date, userId, { includeInactive });
  } catch (error) {
    logger.error('TaskService', '获取表现项失败', error);
    return [];
  }
}

async function getOccurrenceRecordsByDateRange(service, scope = {}) {
  try {
    const startDate = scope.startDate;
    const endDate = scope.endDate;
    const userId = scope.userId || null;

    if (!startDate || !endDate) {
      return [];
    }

    if (service.enableCloudStorage && typeof service.isOccurrenceEnabled === 'function') {
      const enabled = await service.isOccurrenceEnabled();
      if (!enabled) {
        return [];
      }
    }

    if (service.enableCloudStorage) {
      try {
        const cloudTasks = await service._fetchTasksFromCloud(userId, {
          startDate,
          endDate,
          includeOccurrence: true,
          occurrenceMode: 'record'
        });
        const localTasks = await service.taskRepository.getOccurrenceRecordsByDateRange(startDate, endDate, userId);
        return mergeOccurrenceRecords(cloudTasks, localTasks);
      } catch (cloudError) {
        logger.warn('TaskService', '云端获取表现记录失败，降级到本地', {
          startDate,
          endDate,
          userId,
          error: cloudError.message
        });
      }
    }

    return service.taskRepository.getOccurrenceRecordsByDateRange(startDate, endDate, userId);
  } catch (error) {
    logger.error('TaskService', '获取表现记录失败', error);
    return [];
  }
}

module.exports = {
  getAllTasks,
  getTaskById,
  getTodayTasks,
  getTasksByDate,
  getTasksByDateRange,
  getRequiredTasks,
  getExpiredIncompleteTasks,
  calculateTaskProgress,
  checkUpcomingTasks,
  getTaskStatistics,
  calculateDailyStats,
  calculateStreak,
  getTasksByScope,
  getChildTasksByScope,
  getPendingLocalTasksByScope,
  getPendingLocalChildTasksByScope,
  getOccurrenceTasks,
  getOccurrenceRecordsByDateRange,
  isOccurrenceConfigTask,
  isOccurrenceRecordTask,
  isRegularPlannedTask,
  shouldCountTaskAsCompleted
};
