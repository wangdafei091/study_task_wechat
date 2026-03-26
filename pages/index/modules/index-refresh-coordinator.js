const serviceManager = require('../../../services/service-manager.js');
const dateUtils = require('../../../utils/dateUtils');
const logger = require('../../../utils/logger');

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
    const processedMessages = [...eventData]
      .sort((a, b) => {
        if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
        return b.createTime - a.createTime;
      })
      .slice(0, 3)
      .map((msg) => ({
        ...msg,
        timeDisplay: dateUtils.formatRelativeTime(msg.createTime)
      }));

    const unreadCount = eventData.filter((msg) => !msg.isRead).length;
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
    const configService = serviceManager.getService('config');
    const now = Date.now();
    const checkInterval = 5 * 60 * 1000;

    let lastCheckTime = 0;
    if (configService) {
      lastCheckTime = configService.getLastExpiryCheckTime();
    } else {
      lastCheckTime = wx.getStorageSync('last_expiry_check_time') || 0;
      logger.warn('Index', '配置服务不可用，使用降级存储访问');
    }

    if (now - lastCheckTime < checkInterval) {
      logger.debug('Index', '距离上次检查时间过短，跳过检查');
      return;
    }

    logger.info('Index', '开始检查过期任务和星星');
    const taskService = serviceManager.getService('task');
    const starService = serviceManager.getService('star');

    const [taskResult, starResult] = await Promise.allSettled([
      taskService ? taskService.checkTasksStatus() : Promise.resolve(),
      starService ? starService.cleanupExpiredStars() : Promise.resolve()
    ]);

    if (configService) {
      configService.setLastExpiryCheckTime(now);
    } else {
      wx.setStorageSync('last_expiry_check_time', now);
      logger.warn('Index', '配置服务不可用，使用降级存储访问');
    }

    let needRefresh = false;
    if (taskResult.status === 'fulfilled' && taskResult.value?.penaltyResults?.length > 0) {
      logger.info('Index', `执行了${taskResult.value.penaltyResults.length}个必做任务惩罚`);
      needRefresh = true;
    }

    if (starResult.status === 'fulfilled' && starResult.value?.expiredCount > 0) {
      logger.info('Index', `清理了${starResult.value.expiredCount}个过期星星分组`);
      needRefresh = true;
    }

    if (needRefresh) {
      logger.info('Index', '检查发现变更，将在数据加载时刷新显示');
    }
  } catch (error) {
    logger.error('Index', '检查过期任务和星星失败', error);
  }
}

async function loadAllPageData(page) {
  try {
    logger.info('Index', '开始批量加载页面数据');
    const [tasksResult, messagesResult, starsResult] = await Promise.allSettled([
      page.loadTaskDataOnly(),
      page.loadMessageData(),
      page.loadStarsAndRewards()
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
