const logger = require('../../utils/logger');
const dateUtils = require('../../utils/dateUtils');
const userContextUtils = require('../../utils/user-context');
const { TaskStatus, TaskType } = require('../../models/task');
const { EVENTS } = require('../../utils/constants');

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

    return tasks;
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
          (targetId) => service.taskRepository.getTasksByDate(date, targetId),
          `${date}任务`
        );
        logger.info('TaskService', `从云端获取${date}任务成功: ${tasks.length}个`);
      } catch (cloudError) {
        logger.warn('TaskService', `云端获取${date}任务失败，降级到本地`, {
          error: cloudError.message
        });
        tasks = await service.taskRepository.getTasksByDate(date, userId);
      }
    } else {
      tasks = await service.taskRepository.getTasksByDate(date, userId);
    }

    logger.info('TaskService', `获取${date}任务成功${userId ? `, 用户=${userId}` : ''}, 数量=${tasks.length}`);
    return tasks;
  } catch (error) {
    logger.error('TaskService', `获取${date}任务失败`, error);
    return [];
  }
}

async function getTasksByDateRange(service, startDate, endDate, userId = null, options = {}) {
  try {
    let tasks;
    if (service.enableCloudStorage) {
      try {
        tasks = await service._fetchTasksFromCloud(userId, { startDate, endDate, ...options });
        tasks = await service._mergeLocalTasksIntoCloudResult(
          tasks,
          userId,
          (targetId) => service.taskRepository.getTasksByDateRange(startDate, endDate, targetId),
          `${startDate}至${endDate}任务`
        );
      } catch (cloudError) {
        logger.warn('TaskService', '云端日期范围查询失败，降级本地', { error: cloudError.message });
        tasks = await service.taskRepository.getTasksByDateRange(startDate, endDate, userId);
      }
    } else {
      tasks = await service.taskRepository.getTasksByDateRange(startDate, endDate, userId);
    }
    logger.info('TaskService', `获取${startDate}至${endDate}的任务成功${userId ? `, 用户=${userId}` : ''}, 数量=${tasks.length}`);
    return tasks;
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

    const tasksToProcess = tasks || await service.getTodayTasks();
    const typeCounts = {
      total: { habit: 0, study: 0, interest: 0 },
      completed: { habit: 0, study: 0, interest: 0 }
    };

    tasksToProcess.forEach((task) => {
      if (typeCounts.total.hasOwnProperty(task.type)) {
        typeCounts.total[task.type] += 1;
        if (task.status === TaskStatus.COMPLETED) {
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

    const totalTasks = tasksToProcess.length;
    const completedTasks = tasksToProcess.filter((task) => task.status === TaskStatus.COMPLETED).length;
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
        scopeOptions.scope ? { scope: scopeOptions.scope } : {}
      );
    } else if (scopeOptions.userId || scopeOptions.scope) {
      tasks = await service.getTasksByScope(scopeOptions);
    } else {
      tasks = await service.getAllTasks();
    }

    const stats = {
      totalTasks: tasks.length,
      completedTasks: tasks.filter((task) => task.status === TaskStatus.COMPLETED).length,
      completionRate: 0,
      typeCounts: {
        habit: tasks.filter((task) => task.type === TaskType.HABIT).length,
        study: tasks.filter((task) => task.type === TaskType.STUDY).length,
        interest: tasks.filter((task) => task.type === TaskType.INTEREST).length
      },
      typeCompletion: {
        habit: tasks.filter((task) => task.type === TaskType.HABIT && task.status === TaskStatus.COMPLETED).length,
        study: tasks.filter((task) => task.type === TaskType.STUDY && task.status === TaskStatus.COMPLETED).length,
        interest: tasks.filter((task) => task.type === TaskType.INTEREST && task.status === TaskStatus.COMPLETED).length
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
    if (!tasksByDate[task.date]) {
      tasksByDate[task.date] = [];
    }
    tasksByDate[task.date].push(task);
  });

  const dailyStats = [];
  for (const date in tasksByDate) {
    const dayTasks = tasksByDate[date];
    const completed = dayTasks.filter((task) => task.status === TaskStatus.COMPLETED).length;

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
      if (!tasksByDate[task.date]) {
        tasksByDate[task.date] = {
          hasTasks: true,
          hasCompleted: false
        };
      }
      if (task.status === TaskStatus.COMPLETED) {
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
        return localOnlyTasks.length > 0
          ? [...cloudTasks, ...localOnlyTasks]
          : cloudTasks;
      }
      return service.taskRepository.getAll();
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
  getPendingLocalChildTasksByScope
};
