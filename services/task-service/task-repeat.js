const logger = require('../../utils/logger');
const { Task, TaskStatus, RepeatType } = require('../../models/task');
const dateUtils = require('../../utils/dateUtils');

async function generateRepeatTasks(service, task) {
  if (!task.isRepeating()) {
    return [];
  }

  try {
    logger.info('TaskService', `开始生成重复任务: "${task.title}"`);
    logger.info('TaskService', `重复配置: ${JSON.stringify(task.repeat)}`);

    if (!task.repeat || !task.repeat.startDate) {
      logger.error('TaskService', '错误: 重复任务缺少开始日期');
      return [];
    }

    const startDate = new Date(task.repeat.startDate);
    const effectiveStartDate = new Date(startDate);
    let endDate = null;

    if (task.repeat.endDate) {
      endDate = new Date(task.repeat.endDate);
      if (
        startDate.getFullYear() === endDate.getFullYear() &&
        startDate.getMonth() === endDate.getMonth() &&
        startDate.getDate() === endDate.getDate()
      ) {
        logger.info('TaskService', `开始日期和结束日期相同(${task.repeat.startDate})，不生成重复任务`);
        return [];
      }
    } else if (task.hasNoEndDate === true) {
      endDate = new Date(startDate);
      if (task.repeat.type === RepeatType.DAILY) {
        endDate.setDate(endDate.getDate() + 90);
      } else {
        endDate.setDate(endDate.getDate() + 30);
      }
    } else {
      logger.error('TaskService', '错误: 重复任务缺少结束日期且未设置无结束日期标志');
      return [];
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (effectiveStartDate < today) {
      effectiveStartDate.setTime(today.getTime());
    }

    if (endDate < effectiveStartDate) {
      logger.error('TaskService', '错误: 结束日期早于开始日期，无法生成任务');
      return [];
    }

    const diffTime = Math.abs(endDate - effectiveStartDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    logger.info('TaskService', `任务将生成: ${diffDays}天的内容`);

    const repeatDates = [];
    const parentTaskDate = task.date || dateUtils.formatDate(startDate);

    switch (task.repeat.type) {
      case RepeatType.DAILY:
        for (let date = new Date(effectiveStartDate); date <= endDate; date.setDate(date.getDate() + 1)) {
          repeatDates.push(new Date(date));
        }
        break;
      case RepeatType.WEEKLY:
        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 7)) {
          if (date >= effectiveStartDate) {
            repeatDates.push(new Date(date));
          }
        }
        break;
      case 'workdays':
        for (let date = new Date(effectiveStartDate); date <= endDate; date.setDate(date.getDate() + 1)) {
          const day = date.getDay();
          if (day >= 1 && day <= 5) {
            repeatDates.push(new Date(date));
          }
        }
        break;
      case 'weekends':
        for (let date = new Date(effectiveStartDate); date <= endDate; date.setDate(date.getDate() + 1)) {
          const day = date.getDay();
          if (day === 0 || day === 6) {
            repeatDates.push(new Date(date));
          }
        }
        break;
      case 'custom':
        if (task.repeat.days && task.repeat.days.length > 0) {
          const selectedDays = task.repeat.days.map((day) => typeof day === 'string' ? parseInt(day) : day);
          logger.info('TaskService', `自定义重复任务生成: 选择的星期=${selectedDays}, 日期范围=${task.repeat.startDate}到${task.repeat.endDate}`);

          for (let date = new Date(effectiveStartDate); date <= endDate; date.setDate(date.getDate() + 1)) {
            const day = date.getDay();
            const dateStr = dateUtils.formatDate(date);

            if (selectedDays.includes(day)) {
              repeatDates.push(new Date(date));
              logger.info('TaskService', `添加重复任务日期: ${dateStr} (星期${day})`);
            } else {
              logger.debug('TaskService', `跳过日期: ${dateStr} (星期${day}), 不在选择的星期中`);
            }
          }

          logger.info('TaskService', `自定义重复任务生成完成: 共生成${repeatDates.length}个日期`);
        }
        break;
    }

    const repeatTasks = [];
    for (const date of repeatDates) {
      if (dateUtils.formatDate(date) === parentTaskDate) {
        continue;
      }
      repeatTasks.push(service._createRepeatTaskInstance(task, date));
    }

    if (repeatTasks.length > 0) {
      await service.taskRepository.saveAll(repeatTasks);
      logger.info('TaskService', `重复任务实例已保存到本地，数量=${repeatTasks.length}`);
    }

    if (service.enableCloudStorage && repeatTasks.length > 0) {
      const syncInBatches = async (tasks, batchSize = 10, delay = 100) => {
        for (let index = 0; index < tasks.length; index += batchSize) {
          const batch = tasks.slice(index, index + batchSize);
          const results = await Promise.allSettled(
            batch.map((repeatTask) => service._syncTaskToCloud(repeatTask))
          );

          const syncedTasks = [];
          results.forEach((result, batchIndex) => {
            if (result.status === 'fulfilled') {
              batch[batchIndex].syncedToCloud = true;
              batch[batchIndex].pendingSyncMeta = null;
              syncedTasks.push(batch[batchIndex]);
            } else {
              logger.warn('TaskService', `重复任务实例云端同步失败: ID=${batch[batchIndex].id}`, {
                error: result.reason?.message
              });
              service._emitTaskCloudSyncFailure('create', batch[batchIndex], result.reason).catch(() => null);
            }
          });

          if (syncedTasks.length > 0) {
            await service.taskRepository.saveAll(syncedTasks).catch((err) => {
              logger.warn('TaskService', '更新 syncedToCloud 标记失败', { error: err.message });
            });
          }

          if (index + batchSize < tasks.length) {
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      };

      syncInBatches(repeatTasks).catch((err) => {
        logger.warn('TaskService', `重复任务批量云端同步异常: ${err.message}`);
      });
    }

    return repeatTasks;
  } catch (error) {
    logger.error('TaskService', `生成重复任务失败: ${error.message}`, error);
    return [];
  }
}

function createRepeatTaskInstance(service, originalTask, date) {
  const dateStr = dateUtils.formatDate(date);
  const taskData = {
    ...originalTask,
    id: `task_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    date: dateStr,
    createTime: Date.now(),
    modifyTime: Date.now(),
    parentTaskId: originalTask.id,
    status: TaskStatus.PENDING,
    starAwarded: false,
    penaltyApplied: false,
    syncedToCloud: false
  };

  const taskInstance = new Task(taskData);
  taskInstance.pendingSyncMeta = service._buildTaskPendingSyncMeta(taskInstance, 'create', {
    operationKey: taskInstance.modifyTime,
    modifyTime: taskInstance.modifyTime,
    targetUserId: taskInstance.userId
  });

  logger.info('TaskService', `创建重复任务实例: ${dateStr}, 父任务ID: ${taskInstance.parentTaskId}`);
  return taskInstance;
}

module.exports = {
  generateRepeatTasks,
  createRepeatTaskInstance
};
