const { Task } = require('../../../models/task');
const serviceManager = require('../../../services/service-manager.js');
const logger = require('../../../utils/logger');

function isReadonlyView(page) {
  return page?.data?.isReadonlyView === true || page?.data?.isViewerReadonly === true;
}

function showReadonlyToast(page) {
  const readonlyReason = page?.data?.readonlyReason || '';
  let title = '当前视角不可修改任务';

  if (readonlyReason === 'viewer-readonly') {
    title = '当前为查看者，不能修改任务';
  } else if (readonlyReason === 'system-readonly') {
    title = '当前账号为只读，不能修改任务';
  }

  wx.showToast({
    title,
    icon: 'none',
    duration: 2000
  });
}

function clearProcessing(page) {
  page.setData({
    processingTaskId: null
  });
}

async function confirmResetIfNeeded(page, currentTask, taskId, newStatus, wasStarAwarded) {
  if (newStatus !== 0 || !wasStarAwarded) {
    return true;
  }

  const rewardService = serviceManager.getService('rewardService');
  const taskForLockCheck = currentTask instanceof Task ? currentTask : new Task(currentTask);
  let isLocked = false;

  if (rewardService && typeof rewardService.getLastExchangeTimeByUser === 'function') {
    const lastExchangeTime = await rewardService.getLastExchangeTimeByUser(taskForLockCheck.userId || null);
    isLocked = !taskForLockCheck.canBeUnchecked(lastExchangeTime);
  }

  if (isLocked) {
    logger.info('Index', '任务已锁定，直接显示锁定提示', { taskId });
    wx.showModal({
      title: '无法取消完成',
      content: '奖励已兑换，任务不可取消',
      showCancel: false,
      confirmText: '我知道了'
    });
    clearProcessing(page);
    return false;
  }

  const confirmed = await new Promise((resolve) => {
    wx.showModal({
      title: '确认取消完成',
      content: '取消完成任务将扣除已获得的星星，确定要继续吗？',
      confirmText: '确定',
      cancelText: '取消',
      success: (res) => resolve(res.confirm),
      fail: () => resolve(false)
    });
  });

  if (!confirmed) {
    clearProcessing(page);
    return false;
  }

  return true;
}

async function executeStatusChange(taskId, newStatus, currentUserId) {
  const taskService = serviceManager.getService('task');

  if (newStatus === 1) {
    const result = await taskService.completeTask(taskId, currentUserId);
    logger.info('Index', `调用完成任务: 任务ID=${taskId}, 当前用户=${currentUserId}`);
    return result;
  }

  const result = await taskService.resetTask(taskId, currentUserId);
  logger.info('Index', `调用重置任务: 任务ID=${taskId}, 当前用户=${currentUserId}`);
  return result;
}

function handleSuccess(page, resultContext) {
  const {
    newStatus,
    wasStarAwarded,
    taskPoints,
    isRequired,
    currentTask
  } = resultContext;

  logger.info('Index', '任务状态变更，刷新任务列表');

  return page.refreshTaskDataForCurrentView().then(async () => {
    const followUpLoads = [];

    if (newStatus === 1) {
      if (isRequired) {
        wx.showToast({
          title: '必做任务已完成！',
          icon: 'success',
          duration: 2000
        });

        if (wx.vibrateShort) {
          wx.vibrateShort({ type: 'medium' });
        }

        logger.info('Index', `必做任务完成: ${currentTask.title}, 避免了扣除${taskPoints}颗星星的惩罚`);
        if (typeof page.loadStarsAndRewards === 'function') {
          followUpLoads.push(page.loadStarsAndRewards());
        }
      } else if (!wasStarAwarded) {
        wx.showToast({
          title: `获得${taskPoints}颗星星！`,
          icon: 'success',
          duration: 2000
        });

        if (wx.vibrateShort) {
          wx.vibrateShort({ type: 'heavy' });
        }

        logger.info('Index', '立即检查奖励达成状态');
        if (typeof page.checkRewardUnlock === 'function') {
          followUpLoads.push(page.checkRewardUnlock());
        }
      } else {
        wx.showToast({
          title: '已获得过星星',
          icon: 'none',
          duration: 1500
        });

        if (typeof page.loadStarsAndRewards === 'function') {
          followUpLoads.push(page.loadStarsAndRewards());
        }
      }

      if (followUpLoads.length > 0) {
        await Promise.allSettled(followUpLoads);
      }

      setTimeout(() => {
        const progressBar = page.selectComponent('#progressBar');
        if (progressBar) {
          progressBar.playAnimation('complete');
        }
      }, 300);
      return;
    }

    wx.showToast({
      title: isRequired ? '必做任务已重置' : `已扣除${taskPoints}颗星星`,
      icon: 'none',
      duration: 1500
    });

    if (typeof page.loadStarsAndRewards === 'function') {
      followUpLoads.push(page.loadStarsAndRewards());
    }

    if (followUpLoads.length > 0) {
      await Promise.allSettled(followUpLoads);
    }
  });
}

function handleFailure(result) {
  logger.info('Index', '统一处理任务操作结果', {
    taskId: result?.taskId,
    operation: result?.operation,
    success: result?.success,
    locked: result?.locked,
    message: result?.message
  });

  if (result?.locked || (result?.message && result.message.includes('奖励已兑换'))) {
    wx.showModal({
      title: '无法取消完成',
      content: result?.message || '奖励已兑换，任务不可取消',
      showCancel: false,
      confirmText: '我知道了'
    });
    return;
  }

  if (result?.code === 'TASK_BACKFILL_WINDOW_EXPIRED' || result?.backfillWindowExpired) {
    wx.showModal({
      title: '补打卡期限已结束',
      content: result?.message || '该任务已超过补打卡期限，无法再补打卡',
      showCancel: false,
      confirmText: '我知道了'
    });
    return;
  }

  wx.showToast({
    title: result?.message || '操作失败',
    icon: 'none',
    duration: 2000
  });
}

async function completeTask(page, e) {
  const taskId = e.detail.taskId;

  if (!taskId) {
    logger.warn('Index', '完成任务失败: 任务ID为空');
    return;
  }

  if (page.data.isViewingFuture) {
    wx.showToast({
      title: '未来日期仅支持查看',
      icon: 'none',
      duration: 2000
    });
    return;
  }

  if (isReadonlyView(page)) {
    showReadonlyToast(page);
    return;
  }

  logger.info('Index', '完成任务:', { taskId });

  if (page.data.processingTaskId === taskId) {
    logger.warn('Index', '任务正在处理中，忽略重复点击');
    return;
  }

  page.setData({
    processingTaskId: taskId
  });

  logger.info('Index', `当前任务列表数量: ${page.data.tasks ? page.data.tasks.length : 0}`);
  const currentTask = page.data.tasks.find((task) => task.id === taskId);
  if (!currentTask) {
    logger.warn('Index', '未找到指定任务', {
      taskId,
      availableTasks: page.data.tasks ? page.data.tasks.map((task) => task.id) : []
    });
    clearProcessing(page);
    return;
  }

  const newStatus = currentTask.status === 1 ? 0 : 1;
  const wasStarAwarded = currentTask.starAwarded || false;
  const taskPoints = currentTask.points || 0;
  const isRequired = currentTask.isRequired || false;

  logger.info('Index', `任务详细信息: ID=${taskId}, 标题=${currentTask.title}, 当前状态=${currentTask.status}, 新状态=${newStatus}`);
  logger.info('Index', `任务星星信息: starAwarded=${currentTask.starAwarded}(${typeof currentTask.starAwarded}), points=${taskPoints}`);
  logger.info('Index', `任务原始星星状态: ${wasStarAwarded ? '已获得' : '未获得'}`);
  logger.info('Index', `任务类型信息: isRequired=${isRequired}, 任务类型=${isRequired ? '必做任务' : '普通任务'}`);

  const canContinue = await confirmResetIfNeeded(page, currentTask, taskId, newStatus, wasStarAwarded);
  if (!canContinue) {
    return;
  }

  try {
    const { currentUser } = page.data;
    const currentUserId = currentUser && currentUser.id ? currentUser.id : null;
    page._skipNextTaskChangedRefresh = true;
    const result = await executeStatusChange(taskId, newStatus, currentUserId);

    clearProcessing(page);

    if (result && result.success) {
      await handleSuccess(page, {
        newStatus,
        wasStarAwarded,
        taskPoints,
        isRequired,
        currentTask
      });
      return;
    }

    handleFailure({
      ...result,
      taskId,
      operation: newStatus === 1 ? 'complete' : 'reset'
    });
  } catch (error) {
    logger.error('Index', '完成任务失败', error);
    page._skipNextTaskChangedRefresh = false;
    wx.showToast({
      title: '操作失败，请重试',
      icon: 'none',
      duration: 2000
    });
    clearProcessing(page);
  }
}

async function taskItemStatusToggle(page, e) {
  try {
    if (page.data.isViewingFuture) {
      wx.showToast({
        title: '未来日期仅支持查看',
        icon: 'none'
      });
      return;
    }

    if (isReadonlyView(page)) {
      showReadonlyToast(page);
      return;
    }

    const { id, newStatus } = e.detail;

    page.setData({
      processingTaskId: id
    });

    logger.info('Index', `切换任务状态: 任务ID=${id}, 新状态=${newStatus}`);

    const taskService = serviceManager.getTaskService();
    page._skipNextTaskChangedRefresh = true;
    const result = await taskService.updateTaskStatus(id, newStatus);

    clearProcessing(page);

    if (!result?.success) {
      page._skipNextTaskChangedRefresh = false;
      handleFailure({
        ...result,
        taskId: id,
        operation: newStatus === 1 ? 'complete' : 'reset'
      });
      return;
    }

    page.transitionToNewTarget();
    page.refreshTaskDataForCurrentView();
  } catch (error) {
    logger.error('Index', '更新任务状态失败', error);
    page._skipNextTaskChangedRefresh = false;
    clearProcessing(page);
    wx.showToast({
      title: '操作失败',
      icon: 'none'
    });
  }
}

module.exports = {
  completeTask,
  taskItemStatusToggle
};
