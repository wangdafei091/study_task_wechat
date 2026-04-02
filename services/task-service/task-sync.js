const logger = require('../../utils/logger');
const { Task, TaskStatus } = require('../../models/task');
const HttpClient = require('../../utils/http-client');
const API_CONFIG = require('../../utils/api-config');

const PLACEHOLDER_USER_IDS = new Set(['parent', 'child']);

function isPlaceholderUserId(userId) {
  return PLACEHOLDER_USER_IDS.has(userId);
}

function resolveLegacyChildUserId(service, pendingSyncMeta) {
  const metaTargetUserId = pendingSyncMeta?.targetUserId;
  if (metaTargetUserId && !isPlaceholderUserId(metaTargetUserId)) {
    return metaTargetUserId;
  }

  const currentUser = service.userService?.getCurrentUser?.();
  if (currentUser?.role === 'child' && currentUser.userId && !isPlaceholderUserId(currentUser.userId)) {
    return currentUser.userId;
  }

  const childUsers = (service.userService?.getAllUsers?.() || [])
    .filter((user) => user?.role === 'child' && user.userId && !isPlaceholderUserId(user.userId));

  return childUsers.length === 1 ? childUsers[0].userId : null;
}

function resolveCloudTaskOwnership(service, task, pendingSyncMeta) {
  const rawTaskUserId = task?.userId || null;
  const loginUserId = service.userService ? service.userService.getLoginUserId() : null;

  if (!rawTaskUserId) {
    return {
      ownerUserId: null,
      targetUserId: null,
      source: 'empty'
    };
  }

  if (rawTaskUserId === 'parent') {
    return {
      ownerUserId: loginUserId || rawTaskUserId,
      targetUserId: null,
      source: 'legacy_parent'
    };
  }

  if (rawTaskUserId === 'child') {
    const resolvedChildUserId = resolveLegacyChildUserId(service, pendingSyncMeta);
    if (!resolvedChildUserId) {
      return {
        ownerUserId: rawTaskUserId,
        targetUserId: null,
        source: 'legacy_child',
        blocked: true,
        reason: 'UNRESOLVED_LEGACY_CHILD'
      };
    }

    return {
      ownerUserId: resolvedChildUserId,
      targetUserId: loginUserId && resolvedChildUserId !== loginUserId ? resolvedChildUserId : null,
      source: 'legacy_child'
    };
  }

  if (loginUserId && rawTaskUserId === loginUserId) {
    return {
      ownerUserId: rawTaskUserId,
      targetUserId: null,
      source: 'login_user'
    };
  }

  return {
    ownerUserId: rawTaskUserId,
    targetUserId: loginUserId ? rawTaskUserId : null,
    source: 'explicit_target'
  };
}

async function cleanupStaleTasks(service, cloudTaskIds, loginUserId) {
  try {
    const localTasks = await service.taskRepository.getByUserId(loginUserId);
    const staleIds = [];
    for (const localTask of localTasks) {
      if (!localTask.syncedToCloud) continue;
      if (!cloudTaskIds.has(localTask.id)) {
        staleIds.push(localTask.id);
      }
    }
    if (staleIds.length === 0) return;
    for (const id of staleIds) {
      await service.taskRepository.delete(id);
    }
    logger.info('TaskService', `陈旧任务清理完成，删除数量=${staleIds.length}`, { staleIds });
  } catch (err) {
    logger.warn('TaskService', `陈旧任务清理失败: ${err.message}`);
  }
}

async function fetchSingleTaskFromCloud(service, taskId) {
  try {
    const url = API_CONFIG.ENDPOINTS.TASK_BY_ID.replace('{taskId}', taskId);
    const raw = await HttpClient.get(url);
    if (!raw) return null;
    const task = new Task({ ...raw, id: raw.taskId || raw.id });
    const loginUserId = service.userService ? service.userService.getLoginUserId() : null;
    if (loginUserId && task.userId === loginUserId) {
      task.syncedToCloud = true;
      await service.taskRepository.save(task);
    }
    return task;
  } catch (err) {
    logger.warn('TaskService', '云端按id拉取单条任务失败', { taskId, error: err.message });
    return null;
  }
}

async function syncTaskToCloud(service, task) {
  if (!service.enableCloudStorage || !task) return;
  try {
    const pendingSyncMeta = task.pendingSyncMeta || service._buildTaskPendingSyncMeta(task, 'create');
    const ownership = resolveCloudTaskOwnership(service, task, pendingSyncMeta);

    if (ownership.blocked) {
      logger.warn('TaskService', '历史任务归属未映射，跳过本次补云', {
        taskId: task.id,
        userId: task.userId,
        reason: ownership.reason
      });
      throw new Error('历史任务归属未映射，暂不补云');
    }

    if (ownership.ownerUserId && task.userId !== ownership.ownerUserId) {
      logger.info('TaskService', '补云前修正历史任务归属用户ID', {
        taskId: task.id,
        fromUserId: task.userId,
        toUserId: ownership.ownerUserId,
        source: ownership.source
      });
      task.userId = ownership.ownerUserId;
    }

    const cloudData = {
      taskId: task.id,
      title: task.title,
      description: task.description,
      type: task.type,
      date: task.date,
      startTime: task.startTime,
      endTime: task.endTime,
      points: task.points,
      pointsExpiry: task.pointsExpiry,
      reminder: task.reminder || { enabled: false },
      isRequired: task.isRequired,
      status: task.status,
      isAllDay: task.isAllDay,
      repeat: task.repeat,
      duration: task.duration,
      hasNoEndDate: task.hasNoEndDate,
      tags: task.tags,
      penaltyApplied: task.penaltyApplied,
      modifyTime: pendingSyncMeta.modifyTime || task.modifyTime,
      operationKey: pendingSyncMeta.operationKey,
      operatorContext: {
        actorUserId: pendingSyncMeta.operatorUserId,
        actorRole: pendingSyncMeta.operatorRole,
        familyId: pendingSyncMeta.familyId
      },
      parentTaskId: task.parentTaskId || null
    };

    if (ownership.targetUserId) {
      cloudData.targetUserId = ownership.targetUserId;
      logger.info('TaskService', '家长代孩子创建任务，携带targetUserId', {
        loginUserId: service.userService ? service.userService.getLoginUserId() : null,
        targetUserId: ownership.targetUserId
      });
    }

    await HttpClient.post(API_CONFIG.ENDPOINTS.TASKS, cloudData);
    await service._markTaskSynced(task, { modifyTime: cloudData.modifyTime });

    logger.info('TaskService', '任务已同步到云端', {
      taskId: task.id,
      title: task.title
    });
  } catch (cloudError) {
    logger.warn('TaskService', '云端同步失败，本地数据已保存', {
      taskId: task.id,
      title: task.title,
      error: cloudError.message
    });
    throw cloudError;
  }
}

async function fetchTasksFromCloud(service, userId, params = {}) {
  try {
    await service._flushPendingTaskSyncs();
    const loginUserId = service.userService ? service.userService.getLoginUserId() : null;
    const requestParams = { ...params };

    // userId 由方法参数承载，避免在 query 中与 targetUserId 重复透传
    delete requestParams.userId;

    if (!params.scope && userId && loginUserId && userId !== loginUserId) {
      requestParams.targetUserId = userId;
    }

    const response = await HttpClient.get(API_CONFIG.ENDPOINTS.TASKS, requestParams);
    const backendTasks = response?.tasks || [];

    const rawModifyTimeMap = {};
    backendTasks.forEach((raw) => {
      rawModifyTimeMap[raw.taskId] = raw.modifyTime;
    });

    const tasks = backendTasks.map((raw) => new Task({
      ...raw,
      id: raw.taskId,
      taskId: undefined
    }));

    if (loginUserId) {
      const ownTasks = tasks.filter((task) => task.userId === loginUserId);
      const isViewingOwnTasks = !userId || userId === loginUserId;
      const isFullFetch = !params.date && !params.startDate && !params.endDate && !params.scope;

      if (isFullFetch && isViewingOwnTasks) {
        const cloudTaskIds = new Set(ownTasks.map((task) => task.id));
        await service._cleanupStaleTasks(cloudTaskIds, loginUserId);
      }

      if (ownTasks.length > 0) {
        try {
          const localTaskMap = {};
          const allLocal = await service.taskRepository.getByUserId(loginUserId);
          (allLocal || []).forEach((task) => {
            localTaskMap[task.id] = task;
          });

          const tasksToSaveToLocal = [];
          ownTasks.forEach((cloudTask) => {
            const localTask = localTaskMap[cloudTask.id];
            const cloudRawModifyTime = rawModifyTimeMap[cloudTask.id];

            if (localTask && localTask.modifyTime > (cloudRawModifyTime || 0)) {
              Object.assign(cloudTask, {
                title: localTask.title,
                description: localTask.description,
                type: localTask.type,
                date: localTask.date,
                startTime: localTask.startTime,
                endTime: localTask.endTime,
                points: localTask.points,
                pointsExpiry: localTask.pointsExpiry,
                reminder: localTask.reminder,
                isRequired: localTask.isRequired,
                status: localTask.status,
                isAllDay: localTask.isAllDay,
                repeat: localTask.repeat,
                duration: localTask.duration,
                hasNoEndDate: localTask.hasNoEndDate,
                tags: localTask.tags,
                penaltyApplied: localTask.penaltyApplied,
                completionTime: localTask.completionTime,
                starAwarded: localTask.starAwarded,
                modifyTime: localTask.modifyTime,
                parentTaskId: localTask.parentTaskId
              });
              logger.debug('TaskService', `modifyTime保护: 本地版本较新，保留本地数据 ID=${cloudTask.id}`);
            } else if (localTask && localTask.starAwarded && !cloudTask.starAwarded) {
              cloudTask.starAwarded = true;
            }

            cloudTask.syncedToCloud = true;
            tasksToSaveToLocal.push(cloudTask);
          });

          await service.taskRepository.saveAll(tasksToSaveToLocal);
        } catch (upsertErr) {
          logger.warn('TaskService', '云端任务批量回灌本地失败', {
            count: ownTasks.length,
            error: upsertErr.message
          });
        }
      }
    }

    logger.info('TaskService', `从云端获取任务成功: ${tasks.length}个任务`);
    return tasks;
  } catch (cloudError) {
    logger.warn('TaskService', '云端获取失败，降级到本地', {
      userId,
      error: cloudError.message
    });
    throw cloudError;
  }
}

async function mergeLocalTasksIntoCloudResult(service, tasks, userId, loadLocalTasks, sceneLabel = '任务') {
  try {
    const targetId = userId || (service.userService ? service.userService.getLoginUserId() : null);
    if (!targetId || typeof loadLocalTasks !== 'function') {
      return tasks;
    }

    const localTasks = await loadLocalTasks(targetId);
    if (!localTasks || localTasks.length === 0) {
      return tasks;
    }

    const cloudIds = new Set((tasks || []).map((task) => task.id));
    const localOnly = localTasks.filter((task) => !cloudIds.has(task.id));
    if (localOnly.length === 0) {
      return tasks;
    }

    logger.info('TaskService', `本地补充${localOnly.length}个${sceneLabel}`, {
      userId: targetId,
      localOnlyCount: localOnly.length
    });

    return [...tasks, ...localOnly];
  } catch (mergeErr) {
    logger.warn('TaskService', `${sceneLabel}本地合并失败，使用纯云端结果`, {
      userId,
      error: mergeErr.message
    });
    return tasks;
  }
}

async function syncUpdateToCloud(service, task) {
  if (!service.enableCloudStorage || !task) return;
  try {
    const pendingSyncMeta = task.pendingSyncMeta || service._buildTaskPendingSyncMeta(task, 'update');
    const url = API_CONFIG.ENDPOINTS.TASK_BY_ID.replace('{taskId}', task.id);
    await HttpClient.put(url, {
      title: task.title,
      description: task.description,
      date: task.date,
      type: task.type,
      startTime: task.startTime,
      endTime: task.endTime,
      duration: task.duration,
      isAllDay: task.isAllDay,
      reminder: task.reminder || { enabled: false },
      points: task.points,
      pointsExpiry: task.pointsExpiry,
      tags: task.tags,
      hasNoEndDate: task.hasNoEndDate,
      repeat: task.repeat,
      modifyTime: pendingSyncMeta.modifyTime || task.modifyTime,
      operationKey: pendingSyncMeta.operationKey,
      operatorContext: {
        actorUserId: pendingSyncMeta.operatorUserId,
        actorRole: pendingSyncMeta.operatorRole,
        familyId: pendingSyncMeta.familyId
      }
    });
    await service._markTaskSynced(task, { modifyTime: pendingSyncMeta.modifyTime || task.modifyTime });
    logger.info('TaskService', '任务更新已同步到云端', { taskId: task.id });
  } catch (err) {
    logger.warn('TaskService', '云端更新同步失败（本地已保存）', {
      taskId: task.id,
      error: err.message
    });
    throw err;
  }
}

async function syncDeleteToCloud(service, taskId, deleteMeta = null) {
  if (!service.enableCloudStorage) return;
  try {
    const url = API_CONFIG.ENDPOINTS.TASK_BY_ID.replace('{taskId}', taskId);
    const payload = deleteMeta ? {
      operationKey: deleteMeta.operationKey,
      operatorContext: {
        actorUserId: deleteMeta.operatorUserId,
        actorRole: deleteMeta.operatorRole,
        familyId: deleteMeta.familyId
      }
    } : null;
    await HttpClient.request({
      url,
      method: 'DELETE',
      data: payload
    });
    await service._removeDeleteTombstone(taskId);
    logger.info('TaskService', '任务删除已同步到云端', { taskId });
  } catch (err) {
    if (err.message && err.message.includes('404')) {
      await service._removeDeleteTombstone(taskId);
      logger.info('TaskService', '云端无此任务（可能为本地重复实例），跳过云端删除', { taskId });
      return;
    }
    logger.warn('TaskService', '云端删除同步失败（本地已删除）', {
      taskId,
      error: err.message
    });
    throw err;
  }
}

async function syncStatusToCloud(service, task) {
  if (!service.enableCloudStorage || !task) return;
  const pendingSyncMeta = task.pendingSyncMeta || service._buildTaskPendingSyncMeta(
    task,
    task.status === TaskStatus.COMPLETED ? 'complete' : 'reset'
  );
  const syncKey = [
    task.id,
    pendingSyncMeta.operationKey || pendingSyncMeta.modifyTime || task.modifyTime || task.status
  ].join(':');

  if (!service._statusSyncInFlight) {
    service._statusSyncInFlight = new Map();
  }

  const inFlightPromise = service._statusSyncInFlight.get(syncKey);
  if (inFlightPromise) {
    logger.info('TaskService', '复用进行中的任务状态同步请求', {
      taskId: task.id,
      operationKey: pendingSyncMeta.operationKey || null
    });
    return inFlightPromise;
  }

  const syncPromise = (async () => {
    try {
      const url = API_CONFIG.ENDPOINTS.TASK_STATUS.replace('{taskId}', task.id);
      await HttpClient.patch(url, {
        status: task.status,
        starAwarded: task.starAwarded,
        modifyTime: pendingSyncMeta.modifyTime || task.modifyTime,
        operationKey: pendingSyncMeta.operationKey,
        operatorContext: {
          actorUserId: pendingSyncMeta.operatorUserId,
          actorRole: pendingSyncMeta.operatorRole,
          familyId: pendingSyncMeta.familyId
        }
      });
      await service._markTaskSynced(task, { modifyTime: pendingSyncMeta.modifyTime || task.modifyTime });
      logger.info('TaskService', '任务状态已同步到云端', {
        taskId: task.id,
        status: task.status,
        starAwarded: task.starAwarded
      });
    } catch (err) {
      logger.warn('TaskService', '云端状态同步失败（本地已保存）', {
        taskId: task.id,
        error: err.message
      });
      throw err;
    } finally {
      service._statusSyncInFlight.delete(syncKey);
    }
  })();

  service._statusSyncInFlight.set(syncKey, syncPromise);
  return syncPromise;
}

async function syncRequiredStateToCloud(service, task) {
  if (!service.enableCloudStorage || !task) return;
  try {
    const action = task?.pendingSyncMeta?.action === 'unrequired' || task?.isRequired === false
      ? 'unrequired'
      : 'required';
    const pendingSyncMeta = task.pendingSyncMeta || service._buildTaskPendingSyncMeta(task, action);
    const endpoint = action === 'required'
      ? API_CONFIG.ENDPOINTS.TASK_REQUIRED
      : API_CONFIG.ENDPOINTS.TASK_UNREQUIRED;
    const url = endpoint.replace('{taskId}', task.id);

    await HttpClient.patch(url, {
      modifyTime: pendingSyncMeta.modifyTime || task.modifyTime,
      operationKey: pendingSyncMeta.operationKey,
      operatorContext: {
        actorUserId: pendingSyncMeta.operatorUserId,
        actorRole: pendingSyncMeta.operatorRole,
        familyId: pendingSyncMeta.familyId
      }
    });
    await service._markTaskSynced(task, { modifyTime: pendingSyncMeta.modifyTime || task.modifyTime });
    logger.info('TaskService', '任务必做状态已同步到云端', {
      taskId: task.id,
      action
    });
  } catch (err) {
    logger.warn('TaskService', '云端必做状态同步失败（本地已保存）', {
      taskId: task.id,
      error: err.message
    });
    throw err;
  }
}

async function migrateTasksToChild(service, fromUserId, toUserId) {
  logger.info('TaskService', '开始前置任务归属迁移', { fromUserId, toUserId });
  try {
    const tasks = await service.taskRepository.getByUserId(fromUserId);
    if (!service.enableCloudStorage) {
      if (tasks.length > 0) {
        tasks.forEach((task) => {
          task.userId = toUserId;
        });
        await service.taskRepository.saveAll(tasks);
      }
      logger.info('TaskService', '本地模式前置任务归属迁移完成', { count: tasks.length });
      return { success: true, count: tasks.length };
    }

    const cloudResult = await HttpClient.post(API_CONFIG.ENDPOINTS.TASKS_TRANSFER, { toUserId });
    const cloudCount = cloudResult?.count ?? 0;
    logger.info('TaskService', '云端迁移成功', { cloudCount });

    if (tasks.length > 0) {
      tasks.forEach((task) => {
        task.userId = toUserId;
      });
      await service.taskRepository.saveAll(tasks);
      logger.info('TaskService', '本地迁移完成', { count: tasks.length });
    }

    return { success: true, count: cloudCount };
  } catch (error) {
    logger.error('TaskService', '前置任务归属迁移失败', error);
    return { success: false, count: 0 };
  }
}

module.exports = {
  cleanupStaleTasks,
  fetchSingleTaskFromCloud,
  syncTaskToCloud,
  fetchTasksFromCloud,
  mergeLocalTasksIntoCloudResult,
  syncUpdateToCloud,
  syncDeleteToCloud,
  syncStatusToCloud,
  syncRequiredStateToCloud,
  migrateTasksToChild
};
