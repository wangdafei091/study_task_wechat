jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  logEvent: jest.fn()
}));

jest.mock('../../services/service-manager.js', () => ({
  getService: jest.fn(),
  getTaskService: jest.fn(),
  getMessageService: jest.fn(),
  getRewardService: jest.fn(),
  getEventBus: jest.fn(),
  waitForInitialization: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../utils/dateUtils', () => ({
  formatRelativeTime: jest.fn(() => '刚刚'),
  getTodayString: jest.fn(() => '2026-03-26'),
  formatDate: jest.fn((date) => {
    const target = new Date(date);
    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, '0');
    const day = String(target.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  })
}));

jest.mock('../../utils/permission-utils', () => ({
  getUserPermissions: jest.fn(() => ({
    canManageMembers: true,
    canViewStats: true
  })),
  filterMenuItems: jest.fn((items) => items)
}));

jest.mock('../../utils/view-scope', () => ({
  resolveMessageScopeOptions: jest.fn(() => ({ scope: 'user', userId: 'child-1' }))
}));

jest.mock('../../utils/page-storage-helper', () => ({
  setPageState: jest.fn(),
  getPageState: jest.fn(),
  removePageState: jest.fn()
}));

jest.mock('../../services/user-service', () => ({
  UserService: {
    getUserRoles: jest.fn(() => ({
      CHILD: 'child',
      PARENT: 'parent'
    }))
  }
}));

jest.mock('../../services/message-service', () => ({
  getNotificationTypes: jest.fn(() => ({
    UPCOMING: 'upcoming'
  }))
}));

describe('pages/index/index shell behavior', () => {
  let pageConfig;
  let page;
  let serviceManager;
  let permissionUtils;
  let dateUtils;
  let pageStorageHelper;
  let appMock;
  let eventBus;
  let taskService;
  let messageService;
  let rewardService;

  function cloneData(data) {
    return JSON.parse(JSON.stringify(data));
  }

  function setNestedValue(target, path, value) {
    const segments = path.split('.');
    let cursor = target;

    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      if (!cursor[segment] || typeof cursor[segment] !== 'object') {
        cursor[segment] = {};
      }
      cursor = cursor[segment];
    }

    cursor[segments[segments.length - 1]] = value;
  }

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../pages/index/index.js');
    });
  }

  function createPageInstance() {
    const progressBar = { playAnimation: jest.fn() };
    const instance = {
      ...pageConfig,
      data: cloneData(pageConfig.data)
    };

    instance.setData = jest.fn(function setData(update, callback) {
      Object.entries(update).forEach(([key, value]) => {
        if (key.includes('.')) {
          setNestedValue(this.data, key, value);
        } else {
          this.data[key] = value;
        }
      });

      if (typeof callback === 'function') {
        callback();
      }
    });

    instance.selectComponent = jest.fn((selector) => {
      if (selector === '#progressBar') {
        return progressBar;
      }
      return null;
    });

    instance._progressBar = progressBar;
    return instance;
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();

    serviceManager = require('../../services/service-manager.js');
    permissionUtils = require('../../utils/permission-utils');
    dateUtils = require('../../utils/dateUtils');
    pageStorageHelper = require('../../utils/page-storage-helper');

    eventBus = {
      on: jest.fn(),
      off: jest.fn()
    };
    taskService = {
      getTodayTasks: jest.fn().mockResolvedValue([{ id: 'task-1', title: '任务1', status: 0 }]),
      getTasksByDate: jest.fn().mockResolvedValue([{ id: 'task-2', title: '历史任务', status: 1 }]),
      calculateTaskProgress: jest.fn().mockResolvedValue({
        taskProgress: { habit: 1, interest: 2, study: 3 },
        stats: { totalTasks: 1, completedTasks: 1, completionRate: 100, streak: 1 }
      }),
      getTaskStatistics: jest.fn().mockResolvedValue({
        totalTasks: 2,
        completedTasks: 1,
        completionRate: 50,
        streak: 1
      }),
      checkUpcomingTasks: jest.fn().mockResolvedValue({
        success: true,
        tasks: [{
          task: { id: 'task-upcoming', title: '马上开始', startTime: '08:00' },
          timeRemaining: 10
        }]
      }),
      getAllTasks: jest.fn().mockResolvedValue([
        { id: 'task-1', title: '数学', description: '完成作业', status: 0, type: 'study', tags: ['学习'], userId: 'child-1' },
        { id: 'task-2', title: '钢琴', description: '练琴', status: 1, type: 'interest', tags: ['艺术'], userId: 'child-1' }
      ])
    };
    messageService = {
      getMessagesByScope: jest.fn().mockResolvedValue([
        { id: 'msg-1', title: '任务提醒', type: 'task', isRead: false, createTime: 2 },
        { id: 'msg-2', title: '系统消息', type: 'system', isRead: true, createTime: 1 },
        { id: 'msg-3', title: '奖励提醒', type: 'reward', isRead: false, createTime: 3 },
        { id: 'msg-4', title: '更多消息', type: 'task', isRead: false, createTime: 4 }
      ]),
      markMessageAsRead: jest.fn().mockResolvedValue(true),
      markAllMessagesAsRead: jest.fn().mockResolvedValue(2),
      getUnreadCount: jest.fn().mockResolvedValue(6),
      deleteRelatedTaskMessages: jest.fn().mockResolvedValue(true),
      markRelatedMessagesAsRead: jest.fn().mockResolvedValue(true)
    };
    rewardService = {
      hasOnlyExampleRewardsSync: jest.fn(() => false),
      _isExampleReward: jest.fn((reward) => reward.id === 'example')
    };

    serviceManager.getEventBus.mockReturnValue(eventBus);
    serviceManager.getTaskService.mockReturnValue(taskService);
    serviceManager.getMessageService.mockReturnValue(messageService);
    serviceManager.getRewardService.mockReturnValue(rewardService);
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'task') return taskService;
      return null;
    });

    global.wx = {
      showToast: jest.fn(),
      showModal: jest.fn(({ success }) => {
        if (typeof success === 'function') {
          success({ confirm: true, cancel: false });
        }
      }),
      showLoading: jest.fn(),
      hideLoading: jest.fn(),
      navigateTo: jest.fn(({ success, fail }) => {
        if (typeof success === 'function') {
          success();
        }
        if (typeof fail === 'function' && false) {
          fail(new Error('skip'));
        }
      }),
      switchTab: jest.fn(),
      vibrateShort: jest.fn(),
      createAnimation: jest.fn(() => ({
        opacity: jest.fn().mockReturnThis(),
        scale: jest.fn().mockReturnThis(),
        step: jest.fn().mockReturnThis(),
        export: jest.fn(() => ({ ok: true }))
      }))
    };

    appMock = {
      globalData: {
        userInfo: { nickName: '家长' },
        userService: {
          getCurrentUser: jest.fn(() => ({ id: 'child-1', userId: 'child-1', name: '小明', role: 'child' })),
          getLoginUser: jest.fn(() => ({ id: 'parent-1', userId: 'parent-1', name: '家长', role: 'parent' })),
          getAllUsers: jest.fn(() => [
            { id: 'parent-1', userId: 'parent-1', name: '家长', role: 'parent' },
            { id: 'child-1', userId: 'child-1', name: '小明', role: 'child' }
          ]),
          switchToUser: jest.fn().mockResolvedValue({ success: true }),
          updateNickname: jest.fn().mockResolvedValue({ success: true }),
          deleteFamilyMember: jest.fn().mockResolvedValue({ success: true }),
          validateService: jest.fn().mockResolvedValue({ success: true }),
          getLoginUserId: jest.fn(() => 'parent-1')
        }
      }
    };

    global.getApp = jest.fn(() => appMock);
    global.getCurrentPages = jest.fn(() => [{ route: 'pages/index/index' }]);

    loadPageModule();
    page = createPageInstance();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.Page;
    delete global.wx;
    delete global.getApp;
    delete global.getCurrentPages;
  });

  it('registerEventListeners、onUnload、handleProgressBarComplete 和 isCurrentPage 应工作正常', () => {
    page._eventHandlers = {
      taskChanged: jest.fn(),
      taskCreated: jest.fn(),
      messageChanged: jest.fn(),
      rewardClaimed: jest.fn(),
      rewardUpdated: jest.fn(),
      progressbarComplete: jest.fn()
    };

    page.registerEventListeners();
    expect(eventBus.on).toHaveBeenCalledTimes(7);

    page.handleProgressBarComplete();
    jest.runAllTimers();
    expect(page.data.transitionInProgress).toBe(true);
    expect(page.data.forceKeepFullValue).toBe(true);

    page.onUnload();
    expect(eventBus.off).toHaveBeenCalledTimes(7);
    expect(page.isCurrentPage()).toBe(true);

    global.getCurrentPages.mockReturnValueOnce([]);
    expect(page.isCurrentPage()).toBe(false);
  });

  it('loadTaskDataOnly 和 loadTaskData 应更新任务视图并处理失败', async () => {
    page.data.currentUser = { id: 'child-1', role: 'child' };
    page.calculateProgress = jest.fn().mockResolvedValue();
    page.updateTaskStats = jest.fn().mockResolvedValue();

    await page.loadTaskDataOnly();
    expect(taskService.getTodayTasks).toHaveBeenCalledWith('child-1', { requireFreshStars: true });
    expect(page.data.currentViewDate).toBe('2026-03-26');
    expect(page.data.pageTitle).toBe('今日任务');
    expect(page.data.pageTitleBadge).toBe('');
    expect(page.data.isViewingToday).toBe(true);

    await page.loadTaskDataOnly('2026-03-20');
    expect(taskService.getTasksByDate).toHaveBeenCalledWith('2026-03-20', 'child-1', { requireFreshStars: true });
    expect(page.data.pageTitle).toBe('3月20日任务');
    expect(page.data.isViewingPast).toBe(true);

    taskService.getTasksByDate.mockResolvedValueOnce([{ id: 'task-3', title: '未来任务', status: 0 }]);
    await page.loadTaskDataOnly('2026-03-28');
    expect(page.data.pageTitle).toBe('3月28日任务');
    expect(page.data.pageTitleBadge).toBe('预览');
    expect(page.data.isViewingFuture).toBe(true);

    page.loadTaskDataOnly = jest.fn().mockRejectedValue(new Error('boom'));
    await page.loadTaskData();
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '加载数据失败'
    }));
  });

  it('loadMessageData、calculateProgress、updateTaskStats 和 checkUpcomingTasks 应覆盖主路径与降级路径', async () => {
    await page.loadMessageData();
    expect(messageService.getMessagesByScope).toHaveBeenCalledWith({
      scope: 'user',
      userId: 'child-1',
      requireFresh: true,
      skipExpiryAuthoritySyncBeforeFormalReminders: false
    });
    expect(page.data.messages).toHaveLength(3);
    expect(page.data.unreadCount).toBe(3);
    expect(page.data.messages.map((message) => message.id)).toEqual(['msg-4', 'msg-3', 'msg-1']);

    messageService.getMessagesByScope.mockRejectedValueOnce(new Error('fail'));
    await page.loadMessageData();
    expect(page.data.messages).toEqual([]);

    await page.calculateProgress([{ id: 'task-1' }]);
    expect(page.data.taskProgress.habit).toBe(1);
    await page.updateTaskStats();
    expect(page.data.stats.totalTasks).toBe(2);

    page.data.currentViewDate = '2026-03-26';
    await page.checkUpcomingTasks();
    expect(page.data.showUpcomingTask).toBe(true);
    expect(page.data.upcomingTask.id).toBe('task-upcoming');

    taskService.checkUpcomingTasks.mockResolvedValueOnce({ success: true, tasks: [] });
    await page.checkUpcomingTasks();
    expect(page.data.showUpcomingTask).toBe(false);

    page.data.currentViewDate = '2026-03-27';
    await page.checkUpcomingTasks();
    expect(page.data.showUpcomingTask).toBe(false);
  });

  it('首页消息预览应保持未读优先，但未读总数基于完整消息集合', async () => {
    messageService.getMessagesByScope.mockResolvedValueOnce([
      { id: 'msg-read-new', title: '已读新消息', type: 'system', isRead: true, createTime: 100 },
      { id: 'msg-unread-old', title: '未读旧消息', type: 'task', isRead: false, createTime: 10 },
      { id: 'msg-unread-mid', title: '未读中间消息', type: 'reward', isRead: false, createTime: 50 },
      { id: 'msg-read-old', title: '已读旧消息', type: 'system', isRead: true, createTime: 5 }
    ]);

    await page.loadMessageData();

    expect(page.data.messages.map((message) => message.id)).toEqual([
      'msg-unread-mid',
      'msg-unread-old',
      'msg-read-new'
    ]);
    expect(page.data.unreadCount).toBe(2);
  });

  it('日期导航、翻周与日期切换应处理缺参、边界、手势、成功和失败分支', async () => {
    page.initializeDateNavigation();
    expect(page.data.currentViewDate).toBe('2026-03-26');
    expect(page.data.dateNavigation).toHaveLength(7);
    expect(page.data.dateNavigation.map((item) => item.dateString)).toEqual([
      '2026-03-23',
      '2026-03-24',
      '2026-03-25',
      '2026-03-26',
      '2026-03-27',
      '2026-03-28',
      '2026-03-29'
    ]);

    page.loadTaskDataOnly = jest.fn().mockResolvedValue();
    page.checkUpcomingTasks = jest.fn().mockResolvedValue();
    await page.onPrevWeek();
    expect(page.loadTaskDataOnly).toHaveBeenCalledWith('2026-03-16');
    expect(page.checkUpcomingTasks).toHaveBeenCalled();
    expect(page.data.weekOffset).toBe(-1);
    expect(page.data.canGoPrevWeek).toBe(false);
    expect(page.data.canGoNextWeek).toBe(true);

    page.loadTaskDataOnly.mockClear();
    page.checkUpcomingTasks.mockClear();
    await page.onPrevWeek();
    expect(page.loadTaskDataOnly).not.toHaveBeenCalled();
    expect(page.checkUpcomingTasks).not.toHaveBeenCalled();

    page.checkUpcomingTasks.mockClear();
    await page.onNextWeek();
    expect(page.loadTaskDataOnly).toHaveBeenCalledWith('2026-03-26');
    expect(page.checkUpcomingTasks).toHaveBeenCalled();
    expect(page.data.weekOffset).toBe(0);
    expect(page.data.canGoPrevWeek).toBe(true);
    expect(page.data.canGoNextWeek).toBe(false);

    page.onDateNavTouchStart({ touches: [{ clientX: 200, clientY: 10 }] });
    page.onPrevWeek = jest.fn();
    page.onDateNavTouchEnd({ changedTouches: [{ clientX: 120, clientY: 14 }] });
    expect(page.onPrevWeek).toHaveBeenCalled();

    page.onDateNavTouchStart({ touches: [{ clientX: 120, clientY: 10 }] });
    page.onNextWeek = jest.fn();
    page.onDateNavTouchEnd({ changedTouches: [{ clientX: 200, clientY: 16 }] });
    expect(page.onNextWeek).toHaveBeenCalled();

    page.onDateNavTouchStart({ touches: [{ pageX: 220, pageY: 10 }] });
    page.onPrevWeek = jest.fn();
    page.onDateNavTouchEnd({ changedTouches: [{ pageX: 120, pageY: 18 }] });
    expect(page.onPrevWeek).toHaveBeenCalled();

    global.wx.showLoading.mockClear();
    global.wx.hideLoading.mockClear();

    await page.onDateButtonTap({ currentTarget: { dataset: {} } });
    expect(global.wx.showLoading).not.toHaveBeenCalled();

    await page.onDateButtonTap({ currentTarget: { dataset: { date: '2026-03-26' } } });
    expect(global.wx.showLoading).not.toHaveBeenCalled();

    page.loadTaskDataOnly = jest.fn().mockResolvedValue();
    page.checkUpcomingTasks = jest.fn().mockResolvedValue();
    await page.onDateButtonTap({ currentTarget: { dataset: { date: '2026-03-27' } } });
    expect(global.wx.showLoading).toHaveBeenCalled();
    expect(page.loadTaskDataOnly).toHaveBeenCalledWith('2026-03-27');
    expect(page.checkUpcomingTasks).toHaveBeenCalled();
    expect(global.wx.hideLoading).toHaveBeenCalled();

    page.loadTaskDataOnly.mockRejectedValueOnce(new Error('boom'));
    await page.onDateButtonTap({ currentTarget: { dataset: { date: '2026-03-24' } } });
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '加载失败'
    }));

    global.wx.showLoading.mockClear();
    global.wx.hideLoading.mockClear();
    page.loadTaskDataOnly = jest.fn().mockResolvedValue();
    page.checkUpcomingTasks = jest.fn().mockResolvedValue();
    page.setData({
      weekOffset: -1,
      currentViewDate: '2026-03-16',
      isViewingToday: false
    });

    await page.onBackToToday();
    expect(page.data.weekOffset).toBe(0);
    expect(page.data.currentViewDate).toBe('2026-03-26');
    expect(page.loadTaskDataOnly).toHaveBeenCalledWith('2026-03-26');
    expect(page.checkUpcomingTasks).toHaveBeenCalled();
    expect(global.wx.showLoading).toHaveBeenCalled();
    expect(global.wx.hideLoading).toHaveBeenCalled();

    global.wx.showLoading.mockClear();
    page.loadTaskDataOnly.mockClear();
    page.checkUpcomingTasks.mockClear();
    await page.onBackToToday();
    expect(global.wx.showLoading).not.toHaveBeenCalled();
    expect(page.loadTaskDataOnly).not.toHaveBeenCalled();
    expect(page.checkUpcomingTasks).not.toHaveBeenCalled();

    page.initializeDateNavigation();
    page.setData({
      tasks: [{ id: 'task-old', title: '旧任务' }],
      pageTitle: '今日任务',
      weekOffset: 0,
      currentViewDate: '2026-03-26',
      isViewingToday: true
    });
    page.loadTaskDataOnly = jest.fn().mockRejectedValue(new Error('week-fail'));
    page.checkUpcomingTasks = jest.fn();

    await page.onPrevWeek();
    expect(page.data.weekOffset).toBe(0);
    expect(page.data.currentViewDate).toBe('2026-03-26');
    expect(page.data.pageTitle).toBe('今日任务');
    expect(page.data.tasks).toEqual([{ id: 'task-old', title: '旧任务' }]);
    expect(page.checkUpcomingTasks).not.toHaveBeenCalled();
  });

  it('导航、消息预览和基础事件拦截应按预期工作', () => {
    page.setRandomMotivation();
    expect(page.data.currentMotivation).toBeTruthy();

    page.navigateToTaskEdit({ detail: { type: 'habit' } });
    expect(global.wx.navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: expect.stringContaining('taskType=habit')
    }));

    page.navigateToMessageCenter({ stopPropagation: jest.fn() });
    jest.runAllTimers();
    expect(page.data.showMessagePreview).toBe(false);

    page.toggleMessagePreview();
    jest.runOnlyPendingTimers();
    expect(page.data.showMessagePreview).toBe(true);
    page.toggleMessagePreview();
    jest.runAllTimers();
    expect(page.data.showMessagePreview).toBe(false);

    const stopPropagation = jest.fn();
    const preventDefault = jest.fn();
    expect(page.preventBubble({ stopPropagation })).toBe(false);
    expect(page.preventTouchMove({ stopPropagation, preventDefault })).toBe(false);
  });

  it('消息相关交互应更新页面状态并处理提醒操作', async () => {
    page.data.messages = [
      { id: 'msg-1', title: '任务提醒', type: 'task', isRead: false, createTime: 1 },
      { id: 'msg-2', title: '系统提醒', type: 'system', isRead: false, createTime: 2 }
    ];

    page.viewMessageDetail({ currentTarget: { dataset: { id: 'msg-1' } } });
    expect(messageService.markMessageAsRead).toHaveBeenCalled();

    page.markMessageAsRead({ currentTarget: { dataset: { id: '' } } });
    page.getUnreadMessageCount = jest.fn();
    page.markMessageAsRead({ currentTarget: { dataset: { id: 'msg-1' } } });
    await Promise.resolve();
    expect(page.getUnreadMessageCount).toHaveBeenCalled();

    page.data.messages = [{ id: 'msg-3', isRead: false }, { id: 'msg-4', isRead: true }];
    page.markAllMessagesAsRead();
    await Promise.resolve();
    expect(page.data.messages.every((message) => message.isRead)).toBe(true);

    page.getUnreadMessageCount = pageConfig.getUnreadMessageCount.bind(page);
    page.getUnreadMessageCount();
    await Promise.resolve();
    expect(page.data.unreadCount).toBe(6);

    page.dismissUpcomingTask({ currentTarget: { dataset: { id: 'task-upcoming' } } });
    await Promise.resolve();
    expect(page.data.showUpcomingTask).toBe(false);

    page.markTaskMessagesAsRead({ currentTarget: { dataset: { id: 'task-upcoming' } } });
    await Promise.resolve();
    expect(messageService.markRelatedMessagesAsRead).toHaveBeenCalledWith('task-upcoming');

    page.dismissUpcomingTask = jest.fn();
    page.handleUpcomingOption({ detail: { action: 'dismiss' } });
    jest.runAllTimers();
    expect(page.dismissUpcomingTask).toHaveBeenCalled();
  });

  it('菜单、搜索与奖励相关壳层方法应覆盖主要分支', async () => {
    page.onMenuTap();
    expect(page.data.showFloatMenu).toBe(true);

    page.onMenuItemTap({ detail: { item: { id: 'habit' } } });
    page.onMenuItemTap({ detail: { item: { id: 'reward-manage' } } });
    page.onMenuItemTap({ detail: { item: { id: 'family-settings' } } });

    page.onMenuItemTap({ detail: { item: { id: 'study' } } });
    expect(global.wx.navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: '/packageChart/pages/analysis/analysis'
    }));

    page.onRingTap();
    expect(global.wx.navigateTo).toHaveBeenLastCalledWith(expect.objectContaining({
      url: '/packageChart/pages/analysis/analysis'
    }));

    page.toggleSearch();
    expect(page.data.showSearch).toBe(true);
    page.toggleSearch();
    jest.runAllTimers();
    expect(page.data.showSearch).toBe(false);

    page.updateSearchQuery({ detail: { value: '数学' } });
    await Promise.resolve();
    expect(page.data.searchQuery).toBe('数学');

    page.data.searchFilters = { type: 'study', status: '0', dateRange: '' };
    await page.performSearch();
    await Promise.resolve();
    expect(page.data.searchResults).toHaveLength(1);

    page.updateSearchFilter({ currentTarget: { dataset: { type: 'type', value: 'interest' } } });
    expect(page.data.searchFilters.type).toBe('interest');
    page.clearSearchFilters();
    expect(page.data.searchFilters.type).toBe('');

    page.data.visibleRewards = [
      { id: 'reward-1', name: '奖励1', points: 10, claimed: false },
      { id: 'reward-2', name: '奖励2', points: 20, claimed: true },
      { id: 'example', name: '示例奖励', points: 30, claimed: false }
    ];
    page.data.userPoints = 15;
    page.data.nextReward = { id: 'reward-2' };
    page._prepareRewardIndicators();
    expect(page.data.visibleRewards[0]).toEqual(expect.objectContaining({ status: 'unlocked' }));

    page.generateRewardHintText(25, page.data.visibleRewards);
    expect(page.data.rewardHintText).toContain('达成');
    expect(page.hasOnlyExampleRewards()).toBe(false);

    page.showSetupRewardTip();
    jest.runOnlyPendingTimers();
    expect(page.data.showSetupRewardTip).toBe(true);
    page.closeSetupRewardTip();
    jest.runAllTimers();
    expect(page.data.showSetupRewardTip).toBe(false);

    page.navigateToRewardManage();
    jest.runAllTimers();
    expect(global.wx.navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: '/packageManage/pages/reward-manage/reward-manage'
    }));
  });

  it('奖池跳转、奖励指示器和搜索任务应覆盖视角与异常分支', async () => {
    page.data.completedReward = { id: 'reward-1', name: '奖励1' };
    page.data.completedRewardTotal = 10;
    page.viewRewardPool();
    jest.runAllTimers();
    expect(pageStorageHelper.setPageState).toHaveBeenCalled();
    expect(global.wx.switchTab).toHaveBeenCalledWith({
      url: '/pages/rewards/rewards'
    });

    page.data.visibleRewards = [
      { id: 'reward-1', name: '奖励1', status: 'unlocked' },
      { id: 'reward-2', name: '奖励2', status: 'current' }
    ];

    page.data.isReadonlyView = true;
    page.onRewardIndicatorTap({ currentTarget: { dataset: { id: 'reward-1' } } });
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '请切换回家长视角查看奖励'
    }));

    page.data.isReadonlyView = false;
    page.onRewardIndicatorTap({ currentTarget: { dataset: { id: 'reward-1' } } });
    page.onRewardIndicatorTap({ currentTarget: { dataset: { id: 'reward-2' } } });
    expect(global.wx.switchTab).toHaveBeenCalledWith({
      url: '/pages/rewards/rewards'
    });

    page.data.isReadonlyView = true;
    page.showAllRewards();
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '请切换回家长视角查看奖励'
    }));

    page.data.isReadonlyView = false;
    page.showAllRewards();

    page.data.searchQuery = '学习';
    await page.searchTasks();
    expect(page.data.searchResults).toHaveLength(1);

    taskService.getAllTasks.mockRejectedValueOnce(new Error('search fail'));
    await page.searchTasks();
    expect(page.data.searchResults).toEqual([]);
  });

  it('多用户相关壳层方法应处理切换、编辑、删除和验证流程', async () => {
    page.showUserSwitcher();
    expect(page.data.showUserSwitcher).toBe(true);
    page.hideUserSwitcher();
    expect(page.data.showUserSwitcher).toBe(false);

    page.updateMenuItemsWithPermissions = jest.fn();
    page.refreshDataForCurrentUser = jest.fn().mockResolvedValue();
    await page.handleUserSwitch({ detail: { userId: 'child-1' } });
    expect(page.updateMenuItemsWithPermissions).toHaveBeenCalled();
    expect(page.refreshDataForCurrentUser).toHaveBeenCalled();

    appMock.globalData.userService.switchToUser.mockResolvedValueOnce({ success: false, message: '切换失败' });
    await page.handleUserSwitch({ detail: { userId: 'child-2' } });
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '切换失败'
    }));

    await page.handleUserAdd();
    expect(global.wx.navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: '/packageManage/pages/family-settings/family-settings'
    }));

    await page.handleNicknameEdit({ detail: { userId: 'child-1', nickname: '新昵称' } });
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '昵称已更新'
    }));

    appMock.globalData.userService.deleteFamilyMember.mockResolvedValueOnce({ success: false, message: '删除失败' });
    await page.handleUserDelete({ detail: { userId: 'child-1' } });
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '删除失败'
    }));

    page.updateMenuItemsWithPermissions = pageConfig.updateMenuItemsWithPermissions.bind(page);
    permissionUtils.filterMenuItems.mockReturnValueOnce([
      { id: 'study' },
      { id: 'habit' },
      { id: 'reward-manage' }
    ]);
    page.data.isReadonlyView = true;
    page.updateMenuItemsWithPermissions();
    expect(page.data.menuItems).toHaveLength(1);
    expect(page.data.menuItems[0]).toEqual(expect.objectContaining({ id: 'study' }));

    permissionUtils.filterMenuItems.mockReturnValueOnce([
      { id: 'study' },
      { id: 'habit' },
      { id: 'reward-manage' }
    ]);
    page.data.isReadonlyView = false;
    page.data.isViewingToday = false;
    page.updateMenuItemsWithPermissions();
    expect(page.data.menuItems).toEqual([{ id: 'study' }]);

    page.showUserSwitcher = jest.fn();
    page.navigateToUserProfile();
    expect(page.showUserSwitcher).toHaveBeenCalled();

    await expect(page.validateUserModule()).resolves.toBe(true);
  });
});
