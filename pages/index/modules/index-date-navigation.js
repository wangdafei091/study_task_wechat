const dateUtils = require('../../../utils/dateUtils');
const logger = require('../../../utils/logger');

function getMondayOfWeek(date) {
  const target = new Date(date);
  const day = target.getDay();
  const diff = (day + 6) % 7;
  target.setDate(target.getDate() - diff);
  target.setHours(0, 0, 0, 0);
  return target;
}

function formatDateTitle(_page, dateString) {
  const date = new Date(dateString);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
}

function getPageTitleForDate(page, dateString) {
  const todayString = dateUtils.getTodayString();
  if (!dateString || dateString === todayString) {
    return '今日任务';
  }

  if (dateString > todayString) {
    return `${formatDateTitle(page, dateString)}任务（预览）`;
  }

  return `${formatDateTitle(page, dateString)}任务`;
}

function generateDateNavigation(page) {
  const dates = [];
  const todayString = dateUtils.getTodayString();
  const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const monday = getMondayOfWeek(new Date(todayString));
  monday.setDate(monday.getDate() + (page.data.weekOffset || 0) * 7);

  for (let index = 0; index < 7; index += 1) {
    const date = new Date(monday);
    date.setDate(date.getDate() + index);
    const dateString = dateUtils.formatDate(date);

    dates.push({
      dateString,
      label: dateString === todayString ? '今天' : weekdays[index],
      isToday: dateString === todayString,
      isPast: dateString < todayString,
      isFuture: dateString > todayString,
      dayOfWeek: index + 1
    });
  }

  return dates;
}

function getDefaultSelectedDateForCurrentWeek(page) {
  if ((page.data.weekOffset || 0) === 0) {
    return dateUtils.getTodayString();
  }

  const dateNavigation = generateDateNavigation(page);
  return dateNavigation[0] ? dateNavigation[0].dateString : dateUtils.getTodayString();
}

function updateViewState(page, selectedDate) {
  const todayString = dateUtils.getTodayString();
  const isViewingToday = selectedDate === todayString;
  const isViewingPast = selectedDate < todayString;
  const isViewingFuture = selectedDate > todayString;
  const weekOffset = page.data.weekOffset || 0;

  page.setData({
    isViewingToday,
    isViewingPast,
    isViewingFuture,
    weekLabel: weekOffset === 0 ? '本周' : '上周',
    canGoPrevWeek: weekOffset > -1,
    canGoNextWeek: weekOffset < 0
  });

  page.updateMenuItemsWithPermissions();
}

function initializeDateNavigation(page) {
  const dateNavigation = generateDateNavigation(page);
  const todayString = dateUtils.getTodayString();

  page.setData({
    weekOffset: 0,
    dateNavigation,
    currentViewDate: todayString,
    pageTitle: getPageTitleForDate(page, todayString),
    weekLabel: '本周',
    canGoPrevWeek: true,
    canGoNextWeek: false,
    isViewingToday: true,
    isViewingPast: false,
    isViewingFuture: false
  });

  logger.info('Index', '日期导航初始化完成', {
    dateCount: dateNavigation.length,
    currentDate: todayString
  });
}

function captureDateViewSnapshot(page) {
  return JSON.parse(JSON.stringify({
    weekOffset: page.data.weekOffset,
    weekLabel: page.data.weekLabel,
    canGoPrevWeek: page.data.canGoPrevWeek,
    canGoNextWeek: page.data.canGoNextWeek,
    isViewingToday: page.data.isViewingToday,
    isViewingPast: page.data.isViewingPast,
    isViewingFuture: page.data.isViewingFuture,
    currentViewDate: page.data.currentViewDate,
    dateNavigation: page.data.dateNavigation || [],
    pageTitle: page.data.pageTitle,
    tasks: page.data.tasks || [],
    hasTodayTasks: page.data.hasTodayTasks,
    taskProgress: page.data.taskProgress || {},
    stats: page.data.stats || {},
    showUpcomingTask: page.data.showUpcomingTask,
    upcomingTask: page.data.upcomingTask || null,
    menuItems: page.data.menuItems || []
  }));
}

async function refreshUpcomingTasksAfterDateChange(page) {
  try {
    await page.checkUpcomingTasks();
  } catch (error) {
    logger.error('Index', '刷新即将到期任务提醒失败', error);
  }
}

function onDateNavTouchStart(page, e) {
  const touch = e && e.touches && e.touches[0];
  if (!touch) {
    return;
  }

  page._dateNavTouchStartX = Number.isFinite(touch.pageX) ? touch.pageX : touch.clientX;
  page._dateNavTouchStartY = Number.isFinite(touch.pageY) ? touch.pageY : touch.clientY;
}

function onDateNavTouchEnd(page, e) {
  const touch = (e && e.changedTouches && e.changedTouches[0])
    || (e && e.touches && e.touches[0]);
  if (!touch || typeof page._dateNavTouchStartX !== 'number') {
    return;
  }

  const endX = Number.isFinite(touch.pageX) ? touch.pageX : touch.clientX;
  const endY = Number.isFinite(touch.pageY) ? touch.pageY : touch.clientY;
  if (!Number.isFinite(endX) || !Number.isFinite(endY)) {
    page._dateNavTouchStartX = null;
    page._dateNavTouchStartY = null;
    return;
  }

  const deltaX = endX - page._dateNavTouchStartX;
  const deltaY = endY - (page._dateNavTouchStartY || 0);
  page._dateNavTouchStartX = null;
  page._dateNavTouchStartY = null;

  if (Math.abs(deltaX) < 50 || Math.abs(deltaX) <= Math.abs(deltaY)) {
    return;
  }

  if (deltaX < 0) {
    page.onPrevWeek();
    return;
  }

  page.onNextWeek();
}

async function refreshAfterWeekChange(page, targetWeekOffset) {
  const snapshot = captureDateViewSnapshot(page);
  page.setData({
    weekOffset: targetWeekOffset
  });

  const dateNavigation = generateDateNavigation(page);
  const selectedDate = getDefaultSelectedDateForCurrentWeek(page);

  page.setData({
    dateNavigation,
    currentViewDate: selectedDate
  });
  updateViewState(page, selectedDate);

  try {
    wx.showLoading({
      title: '加载中...',
      mask: true
    });
    await page.loadTaskDataOnly(selectedDate);
    await refreshUpcomingTasksAfterDateChange(page);
  } catch (error) {
    logger.error('Index', '翻周后刷新任务失败', error);
    page.setData(snapshot);
    wx.showToast({
      title: '加载失败',
      icon: 'none',
      duration: 2000
    });
  } finally {
    wx.hideLoading();
  }
}

function onPrevWeek(page) {
  if ((page.data.weekOffset || 0) === -1) {
    return;
  }

  return refreshAfterWeekChange(page, (page.data.weekOffset || 0) - 1);
}

function onNextWeek(page) {
  if ((page.data.weekOffset || 0) === 0) {
    return;
  }

  return refreshAfterWeekChange(page, (page.data.weekOffset || 0) + 1);
}

async function onBackToToday(page) {
  const todayString = dateUtils.getTodayString();
  if (page.data.currentViewDate === todayString && (page.data.weekOffset || 0) === 0) {
    return;
  }

  return refreshAfterWeekChange(page, 0);
}

async function onDateButtonTap(page, e) {
  const { date } = e.currentTarget.dataset;

  if (!date) {
    logger.warn('Index', '日期按钮点击事件缺少日期数据');
    return;
  }

  const { currentViewDate } = page.data;
  if (date === currentViewDate) {
    logger.info('Index', `重复点击相同日期: ${date}`);
    return;
  }

  logger.info('Index', `切换日期: ${currentViewDate} -> ${date}`);

  try {
    wx.showLoading({
      title: '加载中...',
      mask: true
    });

    await page.loadTaskDataOnly(date);
    await refreshUpcomingTasksAfterDateChange(page);

    logger.info('Index', `日期切换成功: ${date}`);
  } catch (error) {
    logger.error('Index', `日期切换失败: ${date}`, error);
    wx.showToast({
      title: '加载失败',
      icon: 'none',
      duration: 2000
    });
  } finally {
    wx.hideLoading();
  }
}

module.exports = {
  formatDateTitle,
  getPageTitleForDate,
  generateDateNavigation,
  getDefaultSelectedDateForCurrentWeek,
  updateViewState,
  initializeDateNavigation,
  captureDateViewSnapshot,
  refreshUpcomingTasksAfterDateChange,
  onDateNavTouchStart,
  onDateNavTouchEnd,
  refreshAfterWeekChange,
  onPrevWeek,
  onNextWeek,
  onBackToToday,
  onDateButtonTap
};
