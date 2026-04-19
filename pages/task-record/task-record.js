const dateUtils = require('../../utils/dateUtils');
const logger = require('../../utils/logger');
const serviceManager = require('../../services/service-manager');
const occurrenceContext = require('../../utils/task-occurrence-context');
const syncState = require('../../utils/sync-state');

function getTodayString() {
  return dateUtils.getTodayString();
}

function getUserService() {
  const app = typeof getApp === 'function' ? getApp() : null;
  const appUserService = app && app.globalData ? app.globalData.userService : null;
  if (appUserService) {
    return appUserService;
  }

  return typeof serviceManager.getUserService === 'function'
    ? serviceManager.getUserService()
    : null;
}

function resolvePageContext(explicitTargetUserId = '') {
  const userService = getUserService();
  const loginUser = userService && typeof userService.getLoginUser === 'function'
    ? userService.getLoginUser()
    : null;
  const currentUser = userService && typeof userService.getCurrentUser === 'function'
    ? userService.getCurrentUser()
    : null;
  const availableUsers = userService && typeof userService.getAllUsers === 'function'
    ? userService.getAllUsers()
    : [];
  const app = typeof getApp === 'function' ? getApp() : null;
  const lastActiveChildId = app && app.globalData ? (app.globalData.lastActiveChildId || null) : null;
  const context = occurrenceContext.resolveOccurrenceExecutionSubject({
    loginUser,
    currentUser,
    availableUsers
  }, {
    lastActiveChildId
  });

  if (explicitTargetUserId) {
    const matched = context.childOptions.find((item) => item.userId === explicitTargetUserId);
    if (matched) {
      return {
        ...context,
        targetUserId: explicitTargetUserId,
        targetUserName: matched.label || ''
      };
    }
  }

  return context;
}

function buildRecordMap(records = []) {
  return (records || []).reduce((result, record) => {
    result[record.parentTaskId] = record;
    return result;
  }, {});
}

function decorateOccurrenceItem(task, recordMap = {}) {
  const record = recordMap[task.id] || null;
  const outcome = record && record.occurrenceOutcome ? record.occurrenceOutcome : 'none';
  const isPendingSync = syncState.isPendingSyncOccurrenceRecord(record);
  const statusPrefix = isPendingSync ? '待同步' : '已记录';
  const resultText = outcome === 'success'
    ? `${statusPrefix}：达成`
    : (outcome === 'failure' ? `${statusPrefix}：未达成` : '');
  const resultTone = outcome === 'success'
    ? (isPendingSync ? 'pending' : 'success')
    : (outcome === 'failure' ? (isPendingSync ? 'pending' : 'failure') : '');

  return {
    ...task,
    record,
    outcome,
    isPendingSync,
    resultText,
    resultTone,
    typeLabel: task.type === 'habit' ? '习惯' : (task.type === 'interest' ? '兴趣' : '学习')
  };
}

function normalizePageDate(date) {
  const today = getTodayString();
  if (!date || date > today) {
    return today;
  }
  return date;
}

Page({
  data: {
    loading: true,
    date: getTodayString(),
    today: getTodayString(),
    targetUserId: '',
    targetUserName: '',
    childOptions: [],
    items: [],
    selectedTaskId: ''
  },

  async onLoad(options = {}) {
    const taskService = serviceManager.getService('task');
    const occurrenceEnabled = taskService && typeof taskService.isOccurrenceEnabled === 'function'
      ? await taskService.isOccurrenceEnabled()
      : true;

    if (!occurrenceEnabled) {
      wx.showToast({
        title: '云端未完成升级，暂不可使用表现项',
        icon: 'none'
      });
      if (typeof wx.navigateBack === 'function') {
        wx.navigateBack({ delta: 1 });
      }
      return;
    }

    const context = resolvePageContext(options.targetUserId || '');
    this.setData({
      date: normalizePageDate(options.date),
      today: getTodayString(),
      targetUserId: context.targetUserId || '',
      targetUserName: context.targetUserName || '',
      childOptions: context.childOptions || [],
      selectedTaskId: options.taskId || ''
    });

    await this.loadItems();
  },

  async loadItems() {
    const taskService = serviceManager.getService('task');
    const date = this.data.date;
    const targetUserId = this.data.targetUserId || '';

    if (!taskService || !targetUserId) {
      this.setData({
        loading: false,
        items: []
      });
      return;
    }

    try {
      const [tasks, records] = await Promise.all([
        taskService.getOccurrenceTasks({
          date,
          userId: targetUserId
        }),
        taskService.getOccurrenceRecordsByDateRange({
          startDate: date,
          endDate: date,
          userId: targetUserId
        })
      ]);

      const recordMap = buildRecordMap(records);
      this.setData({
        loading: false,
        items: (tasks || []).map((task) => decorateOccurrenceItem(task, recordMap))
      });
    } catch (error) {
      logger.error('task-record', '加载记录页数据失败', error);
      this.setData({
        loading: false,
        items: []
      });
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  onDateChange(e) {
    const nextDate = normalizePageDate(e.detail.value);
    this.setData({
      date: nextDate,
      loading: true
    });
    this.loadItems();
  },

  onChildTap(e) {
    const targetUserId = e.currentTarget.dataset.userId;
    const selected = this.data.childOptions.find((item) => item.userId === targetUserId);
    this.setData({
      targetUserId,
      targetUserName: selected ? (selected.label || '') : '',
      loading: true
    });
    this.loadItems();
  },

  async onRecordTap(e) {
    const taskId = e.currentTarget.dataset.taskId;
    const outcome = e.currentTarget.dataset.outcome;
    const taskService = serviceManager.getService('task');

    if (!taskService || !taskId || !outcome) {
      return;
    }

    const result = await taskService.recordOccurrenceResult(taskId, {
      userId: this.data.targetUserId,
      date: this.data.date,
      outcome
    });

    if (!result.success) {
      wx.showToast({
        title: result.message || '记录失败',
        icon: 'none'
      });
      return;
    }

    wx.showToast(result.fallback
      ? {
        title: syncState.getPendingSyncToastCopy(),
        icon: 'none'
      }
      : {
        title: outcome === 'success' ? '已记为达成' : '已记为未达成',
        icon: 'success'
      });
    this.setData({ loading: true });
    await this.loadItems();
  }
});
