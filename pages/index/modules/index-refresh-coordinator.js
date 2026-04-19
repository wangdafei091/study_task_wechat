const serviceManager = require('../../../services/service-manager.js');
const dateUtils = require('../../../utils/dateUtils');
const logger = require('../../../utils/logger');
const messageDisplay = require('../../../utils/message-display');

async function handleRewardUpdated(page, data) {
  logger.debug('Index', '收到奖励更新事件', data);
  const app = getApp();
  app.globalData.needRefreshReward = true;

  if (page.isCurrentPage()) {
    logger.debug('Index', '当前在首页，立即刷新奖励数据');
    await page.loadStarsAndRewards();
  }
}

function handleRewardClaimed(page, eventData) {
  logger.debug('Index', `收到奖励领取事件: 奖励ID=${eventData.rewardId}, 消耗星星=${eventData.points}, 剩余星星=${eventData.newTotalPoints}`);
  const app = getApp();
  app.globalData.rewardClaimedInfo = eventData;
  app.globalData.needRefreshReward = true;
  logger.debug('Index', '已记录奖励领取信息，等待返回首页时更新');
}

async function handleTaskDataChanged(page, eventData = {}) {
  if (page._skipNextTaskChangedRefresh) {
    logger.info('Index', '跳过当前轮 task:changed 刷新，避免与页面显式刷新重复');
    page._skipNextTaskChangedRefresh = false;
    return;
  }

  const allTasks = eventData.tasks || [];
  const changeType = eventData.changeType || 'unknown';
  const timestamp = eventData.timestamp || Date.now();

  logger.info('Index', `收到任务数据变更事件: 类型=${changeType}, 任务数量=${allTasks.length}`);
  if (changeType === 'delete') {
    logger.info('Index', '检测到删除操作，按当前视图刷新任务并强制刷新热力图');
    await refreshTaskDataForCurrentView(page, {
      timestamp,
      forceHeatmapRefresh: true
    });
    return;
  }

  await refreshTaskDataForCurrentView(page, { timestamp });
}

async function handleTaskCreated(page, data) {
  logger.info('Index', '收到任务创建事件', data);
  await page.refreshTaskDataForCurrentView();
}

async function handleMessageDataChanged(page, eventData) {
  logger.info('Index', '收到消息数据变更事件');

  if (Array.isArray(eventData)) {
    const normalizedMessages = messageDisplay.dedupeMessagesByEventKey(eventData);
    const processedMessages = messageDisplay.buildPreviewMessages(normalizedMessages, {
      limit: 3,
      formatMessageTime: (createTime) => dateUtils.formatRelativeTime(createTime)
    });

    const unreadCount = normalizedMessages.filter((msg) => !msg.isRead).length;
    page.setData({
      messages: processedMessages,
      unreadCount
    });
    return;
  }

  await page.loadMessageData();
}

async function checkExpiredTasksAndStars(page) {
  try {
    logger.info('Index', '开始检查过期任务和星星');
    const taskService = serviceManager.getService('task');
    const starService = serviceManager.getService('starService') || serviceManager.getService('star');
    const effectiveUserId = typeof page.getEffectiveTaskUserId === 'function'
      ? page.getEffectiveTaskUserId()
      : null;

    const [taskResult, starResult] = await Promise.allSettled([
      taskService ? taskService.checkTasksStatus() : Promise.resolve(),
      (starService && typeof starService.syncExpiryAuthorityIfNeeded === 'function' && effectiveUserId)
        ? starService.syncExpiryAuthorityIfNeeded({
          scope: 'user',
          userId: effectiveUserId
        })
        : Promise.resolve()
    ]);

    let needRefresh = false;
    if (taskResult.status === 'fulfilled' && taskResult.value?.penaltyResults?.length > 0) {
      logger.info('Index', `执行了${taskResult.value.penaltyResults.length}个必做任务惩罚`);
      needRefresh = true;
    }

    if (starResult.status === 'fulfilled' && Number(starResult.value?.settledGroupCount || 0) > 0) {
      logger.info('Index', `结算了${starResult.value.settledGroupCount}个过期星星分组`);
      needRefresh = true;
    }

    if (needRefresh) {
      logger.info('Index', '检查发现变更，将在数据加载时刷新显示');
    }
  } catch (error) {
    logger.error('Index', '检查过期任务和星星失败', error);
  }
}

async function loadAllPageData(page, options = {}) {
  try {
    logger.info('Index', '开始批量加载页面数据');
    const targetDate = page.data.currentViewDate || null;
    const [tasksResult, messagesResult, starsResult] = await Promise.allSettled([
      page.loadTaskDataOnly(targetDate),
      page.loadMessageData({
        skipExpiryAuthoritySyncBeforeFormalReminders:
          options.skipExpiryAuthoritySyncBeforeFormalReminders === true
      }),
      // authority 可能已在前序过期检查中完成；这里必须跳过重复 authority，只做后续 stars/rewards 刷新。
      page.loadStarsAndRewards({
        skipAuthoritySync: true
      })
    ]);

    if (tasksResult.status === 'rejected') {
      logger.error('Index', '任务数据加载失败', tasksResult.reason);
    }
    if (messagesResult.status === 'rejected') {
      logger.error('Index', '消息数据加载失败', messagesResult.reason);
    }
    if (starsResult.status === 'rejected') {
      logger.error('Index', '星星奖励数据加载失败', starsResult.reason);
    }

    if (tasksResult.status === 'fulfilled') {
      await page.checkUpcomingTasks();
    }

    logger.info('Index', '页面数据批量加载完成');
  } catch (error) {
    logger.error('Index', '批量加载页面数据失败', error);
    wx.showToast({
      title: '加载数据失败',
      icon: 'none',
      duration: 2000
    });
  }
}

async function refreshTaskDataForCurrentView(page, options = {}) {
  const targetDate = page.data.currentViewDate || null;

  try {
    await page.loadTaskDataOnly(targetDate);
    await page.checkUpcomingTasks();

    if (options.timestamp) {
      page.setData({
        __dataUpdateTimestamp: options.timestamp
      });
    }

    if (options.forceHeatmapRefresh) {
      setTimeout(() => {
        const heatmapComponent = page.selectComponent('#taskHeatmap');
        if (heatmapComponent) {
          logger.info('Index', '触发热力图强制刷新');
          heatmapComponent.refreshTaskList();
        }
      }, 300);
    }
  } catch (error) {
    logger.error('Index', '刷新当前视图任务数据失败', {
      currentViewDate: targetDate,
      error
    });
    wx.showToast({
      title: '加载数据失败',
      icon: 'none',
      duration: 2000
    });
  }
}

async function refreshDataForCurrentUser(page) {
  try {
    logger.info('Index', '为当前用户刷新数据');
    const { currentUser } = page.data;

    await Promise.all([
      page.refreshTaskDataForCurrentView(),
      page.loadStarsAndRewards(),
      page.loadMessageData()
    ]);

    logger.info('Index', `用户数据刷新完成: ${currentUser.name}`);
  } catch (error) {
    logger.error('Index', '刷新用户数据失败', error);
  }
}

module.exports = {
  handleRewardUpdated,
  handleRewardClaimed,
  handleTaskDataChanged,
  handleTaskCreated,
  handleMessageDataChanged,
  checkExpiredTasksAndStars,
  loadAllPageData,
  refreshTaskDataForCurrentView,
  refreshDataForCurrentUser
};
