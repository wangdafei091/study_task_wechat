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
    const floatMenu = { openMenu: jest.fn() };
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
      if (selector === '#homeFloatMenu') {
        return floatMenu;
      }
      return null;
    });

    instance._progressBar = progressBar;
    instance._floatMenu = floatMenu;
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
      isOccurrenceEnabled: jest.fn().mockResolvedValue(true),
      getOccurrenceTasks: jest.fn().mockResolvedValue([]),
      getOccurrenceRecordsByDateRange: jest.fn().mockResolvedValue([]),
      calculateTaskProgress: jest.fn().mockResolvedValue({
        taskProgress: { habit: 1, interest: 2, study: 3 },
        taskProgressSummary: {
          habit: { completed: 1, total: 2, percent: 50, centerText: '1/2', isEmpty: false },
          interest: { completed: 0, total: 0, percent: 0, centerText: '—', isEmpty: true },
          study: { completed: 2, total: 3, percent: 67, centerText: '2/3', isEmpty: false }
        },
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

  it('loadTaskDataOnly 应渲染表现记录区块并在能力关闭时隐藏', async () => {
    page.data.currentUser = { id: 'child-1', role: 'child' };
    page.updateTaskStats = jest.fn().mockResolvedValue();

    taskService.getOccurrenceTasks.mockResolvedValueOnce([
      {
        id: 'occ_success',
        title: '听写全对',
        executionMode: 'occurrence',
        points: 2,
        pointsExpiry: 'week'
      },
      {
        id: 'occ_failure',
        title: '考试全对',
        executionMode: 'occurrence',
        points: 3,
        pointsExpiry: 'permanent'
      }
    ]);
    taskService.getOccurrenceRecordsByDateRange.mockResolvedValueOnce([
      {
        id: 'occ_record_1',
        parentTaskId: 'occ_success',
        occurrenceOutcome: 'success',
        pendingSyncMeta: {
          action: 'occurrence_record'
        },
        syncedToCloud: false
      },
      {
        id: 'occ_record_2',
        parentTaskId: 'occ_failure',
        occurrenceOutcome: 'failure'
      }
    ]);

    await page.loadTaskDataOnly('2026-03-25');
    expect(taskService.getOccurrenceTasks).toHaveBeenCalledWith({
      date: '2026-03-25',
      userId: 'child-1'
    });
    expect(taskService.getOccurrenceRecordsByDateRange).toHaveBeenCalledWith({
      startDate: '2026-03-25',
      endDate: '2026-03-25',
      userId: 'child-1'
    });
    expect(page.data.showOccurrenceSection).toBe(true);
    expect(page.data.occurrenceDateLabel).toBe('昨天');
    expect(page.data.occurrenceTasks.map((item) => item.statusLabel)).toEqual([
      '待同步 · 达成',
      '已记录 · 未达成'
    ]);
    expect(page.data.occurrenceTasks.map((item) => item.statusTone)).toEqual([
      'pending',
      'failure'
    ]);
    expect(page.data.occurrenceTasks.map((item) => item.isPendingSync)).toEqual([
      true,
      false
    ]);
    expect(page.data.occurrenceTasks.map((item) => ({
      rewardAccentText: item.rewardAccentText,
      rewardExpiryMetaText: item.rewardExpiryMetaText,
      rewardSummaryText: item.rewardSummaryText
    }))).toEqual([
      {
        rewardAccentText: '2 星',
        rewardExpiryMetaText: '本周结束',
        rewardSummaryText: '奖励 2 星 · 本周结束'
      },
      {
        rewardAccentText: '3 星',
        rewardExpiryMetaText: '永久',
        rewardSummaryText: '奖励 3 星 · 永久'
      }
    ]);

    taskService.isOccurrenceEnabled.mockResolvedValueOnce(false);
    taskService.getOccurrenceTasks.mockClear();
    taskService.getOccurrenceRecordsByDateRange.mockClear();

    await page.loadTaskDataOnly('2026-03-24');
    expect(taskService.getOccurrenceTasks).not.toHaveBeenCalled();
    expect(taskService.getOccurrenceRecordsByDateRange).not.toHaveBeenCalled();
    expect(page.data.showOccurrenceSection).toBe(false);
    expect(page.data.occurrenceDateLabel).toBe('3月24日');
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
    expect(page.data.todayTaskProgress.habit).toBe(1);
    expect(page.data.todayTaskProgressSummary.habit.centerText).toBe('1/2');
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

  it('refreshHomeOnboardingCard 应在今日主视图输出首页引导卡，并在搜索态降级隐藏', () => {
    page.data.currentUser = { id: 'parent-1', userId: 'parent-1', name: '家长', role: 'parent', familyId: 'fam_1' };
    page.data.availableUsers = [{ id: 'parent-1', userId: 'parent-1', name: '家长', role: 'parent' }];
    page.data.canManageMembers = true;
    page.data.tasks = [];
    page.data.showOccurrenceSection = false;
    page.data.isViewingToday = true;
    page.data.isViewingFuture = false;
    page.data.showSearch = false;
    page.data.showMessagePreview = false;

    page.refreshHomeOnboardingCard();

    expect(page.data.homeOnboardingCard).toEqual(expect.objectContaining({
      stage: 'family_no_child',
      title: '先把孩子加进家庭'
    }));
    expect(page.data.showHomeOnboardingCard).toBe(true);

    page.setData({
      showSearch: true
    });
    page.syncHomeOnboardingVisibility();
    expect(page.data.showHomeOnboardingCard).toBe(false);
  });

  it('首页不应为无家庭用户渲染 onboarding 卡，应交给 family-settings 承接', () => {
    page.data.currentUser = { id: 'parent-1', userId: 'parent-1', name: '家长', role: 'parent' };
    page.data.availableUsers = [{ id: 'parent-1', userId: 'parent-1', name: '家长', role: 'parent' }];
    page.data.canManageMembers = false;
    page.data.tasks = [];
    page.data.showOccurrenceSection = false;
    page.data.isViewingToday = true;
    page.data.isViewingFuture = false;
    page.data.showSearch = false;
    page.data.showMessagePreview = false;

    page.refreshHomeOnboardingCard();

    expect(page.data.homeOnboardingCard).toBeNull();
    expect(page.data.showHomeOnboardingCard).toBe(false);
  });

  it('无家庭家长首页空态应指向创建或加入家庭，而不是误显示为添加孩子', () => {
    const wxml = require('fs').readFileSync(
      require('path').join(process.cwd(), 'pages/index/index.wxml'),
      'utf8'
    );

    expect(wxml).toContain('还没有加入家庭，请前往家庭设置创建家庭或输入邀请码加入');
    expect(wxml).toContain('currentUser && currentUser.role === \'parent\' && !currentUser.familyId && !showHomeOnboardingCard');
    expect(wxml).not.toContain('canManageMembers && availableUsers.length <= 1 && !showHomeOnboardingCard');
  });

  it('查看者家长在首页无任务时应展示只读解释卡，而不是孩子口径空态', () => {
    page.data.currentUser = {
      id: 'parent-viewer',
      userId: 'parent-viewer',
      name: '查看者家长',
      role: 'parent',
      familyId: 'fam_1',
      familyPermissionRole: 'viewer'
    };
    page.data.availableUsers = [
      { id: 'parent-viewer', userId: 'parent-viewer', name: '查看者家长', role: 'parent' },
      { id: 'child-1', userId: 'child-1', name: '孩子', role: 'child' }
    ];
    page.data.canManageMembers = false;
    page.data.isViewerReadonly = true;
    page.data.tasks = [];
    page.data.showOccurrenceSection = false;
    page.data.isViewingToday = true;
    page.data.isViewingFuture = false;
    page.data.showSearch = false;
    page.data.showMessagePreview = false;

    page.refreshHomeOnboardingCard();

    expect(page.data.homeOnboardingCard).toEqual(expect.objectContaining({
      stage: 'readonly_parent_no_task',
      title: '当前还没有任务安排',
      primaryAction: null,
      secondaryAction: null
    }));
  });

  it('系统只读家长在首页无任务时应展示只读解释卡，而不是创建任务 CTA', () => {
    page.data.currentUser = {
      id: 'parent-manager',
      userId: 'parent-manager',
      name: '管理员家长',
      role: 'parent',
      familyId: 'fam_1',
      familyPermissionRole: 'manager',
      systemAccessLevel: 'readonly'
    };
    page.data.availableUsers = [
      { id: 'parent-manager', userId: 'parent-manager', name: '管理员家长', role: 'parent' },
      { id: 'child-1', userId: 'child-1', name: '孩子', role: 'child' }
    ];
    page.data.canManageMembers = true;
    page.data.isSystemReadonly = true;
    page.data.tasks = [];
    page.data.showOccurrenceSection = false;
    page.data.isViewingToday = true;
    page.data.isViewingFuture = false;
    page.data.showSearch = false;
    page.data.showMessagePreview = false;

    page.refreshHomeOnboardingCard();

    expect(page.data.homeOnboardingCard).toEqual(expect.objectContaining({
      stage: 'readonly_parent_no_task',
      title: '当前还没有任务安排',
      primaryAction: null,
      secondaryAction: null
    }));
  });

  it('系统封禁家长在首页无任务时应展示封禁解释卡，而不是孩子口径空态', () => {
    page.data.currentUser = {
      id: 'parent-blocked',
      userId: 'parent-blocked',
      name: '封禁家长',
      role: 'parent',
      familyId: 'fam_1',
      familyPermissionRole: 'manager',
      systemAccessLevel: 'blocked'
    };
    page.data.availableUsers = [
      { id: 'parent-blocked', userId: 'parent-blocked', name: '封禁家长', role: 'parent' },
      { id: 'child-1', userId: 'child-1', name: '孩子', role: 'child' }
    ];
    page.data.canManageMembers = false;
    page.data.isSystemBlocked = true;
    page.data.tasks = [];
    page.data.showOccurrenceSection = false;
    page.data.isViewingToday = true;
    page.data.isViewingFuture = false;
    page.data.showSearch = false;
    page.data.showMessagePreview = false;

    page.refreshHomeOnboardingCard();

    expect(page.data.homeOnboardingCard).toEqual(expect.objectContaining({
      stage: 'readonly_parent_no_task',
      title: '当前还没有任务安排',
      primaryAction: null,
      secondaryAction: null
    }));
    expect(page.data.homeOnboardingCard.description).toContain('暂停使用');
  });

  it('一次性首页承接卡在首次展示后再次显示时应回落为常规阶段卡', () => {
    appMock.globalData.pendingOnboardingContext = {
      source: 'create_family',
      createdAt: Date.now()
    };
    page.data.currentUser = { id: 'parent-1', userId: 'parent-1', name: '家长', role: 'parent', familyId: 'fam_1' };
    page.data.availableUsers = [{ id: 'parent-1', userId: 'parent-1', name: '家长', role: 'parent' }];
    page.data.canManageMembers = true;
    page.data.tasks = [];
    page.data.showOccurrenceSection = false;
    page.data.isViewingToday = true;
    page.data.isViewingFuture = false;
    page.data.showSearch = false;
    page.data.showMessagePreview = false;

    page.refreshHomeOnboardingCard();

    expect(page.data.homeOnboardingCard).toEqual(expect.objectContaining({
      title: '家庭已创建',
      dismissAfterConsume: true
    }));
    expect(appMock.globalData.pendingOnboardingContext).toBeNull();

    page.setData({ showSearch: true });
    page.syncHomeOnboardingVisibility();
    expect(page.data.showHomeOnboardingCard).toBe(false);
    expect(page.data.homeOnboardingCard).toEqual(expect.objectContaining({
      title: '先把孩子加进家庭',
      dismissAfterConsume: false
    }));

    page.setData({ showSearch: false });
    page.syncHomeOnboardingVisibility();
    expect(page.data.showHomeOnboardingCard).toBe(true);
    expect(page.data.homeOnboardingCard).toEqual(expect.objectContaining({
      title: '先把孩子加进家庭',
      dismissAfterConsume: false
    }));
  });

  it('首页应承接访客通过邀请码进入后的下一步提示，即使常规 no_family 卡被屏蔽', () => {
    appMock.globalData.pendingOnboardingContext = {
      source: 'guest_invite_entered',
      inviteCode: 'F123456789',
      createdAt: Date.now()
    };
    page.data.currentUser = { id: 'parent-1', userId: 'parent-1', name: '家长', role: 'parent' };
    page.data.availableUsers = [{ id: 'parent-1', userId: 'parent-1', name: '家长', role: 'parent' }];
    page.data.canManageMembers = false;
    page.data.tasks = [];
    page.data.showOccurrenceSection = false;
    page.data.isViewingToday = true;
    page.data.isViewingFuture = false;
    page.data.showSearch = false;
    page.data.showMessagePreview = false;

    page.refreshHomeOnboardingCard();

    expect(page.data.homeOnboardingCard).toEqual(expect.objectContaining({
      stage: 'joined_from_invite',
      title: '你已进入小程序',
      dismissAfterConsume: true
    }));
    expect(page.data.homeOnboardingCard.primaryAction).toEqual({
      type: 'create_family',
      text: '创建家庭'
    });
    expect(appMock.globalData.pendingOnboardingContext).toBeNull();
  });

  it('已加入已有任务的家庭后，首页仍应展示一次性承接卡', () => {
    appMock.globalData.pendingOnboardingContext = {
      source: 'invite_join_family',
      inviteCode: 'F123456789',
      createdAt: Date.now()
    };
    page.data.currentUser = {
      id: 'parent-1',
      userId: 'parent-1',
      name: '家长',
      role: 'parent',
      familyId: 'fam_1'
    };
    page.data.availableUsers = [
      { id: 'parent-1', userId: 'parent-1', name: '家长', role: 'parent' },
      { id: 'child-1', userId: 'child-1', name: '孩子', role: 'child' }
    ];
    page.data.canManageMembers = true;
    page.data.tasks = [{ id: 'task-1', title: '语文作业', status: 0 }];
    page.data.showOccurrenceSection = false;
    page.data.isViewingToday = true;
    page.data.isViewingFuture = false;
    page.data.showSearch = false;
    page.data.showMessagePreview = false;

    page.refreshHomeOnboardingCard();

    expect(page.data.homeOnboardingCard).toEqual(expect.objectContaining({
      stage: 'joined_from_invite',
      title: '已加入家庭',
      dismissAfterConsume: true
    }));
    expect(page.data.homeOnboardingCard.description).toContain('今天的任务安排');
    expect(appMock.globalData.pendingOnboardingContext).toBeNull();
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

  it('首页壳层事件代理和表现记录操作应覆盖剩余轻分支', async () => {
    page.data.currentUser = { id: 'child-1', role: 'child' };
    page.loadStarsAndRewards = jest.fn().mockResolvedValue();
    page.loadTaskDataOnly = jest.fn().mockResolvedValue();
    page.loadTodayProgressSummary = jest.fn().mockResolvedValue();
    page.checkUpcomingTasks = jest.fn().mockResolvedValue();
    page.refreshTaskDataForCurrentView = jest.fn().mockResolvedValue();
    page.loadMessageData = jest.fn().mockResolvedValue();

    await page.handleRewardUpdated({ source: 'test' });
    expect(appMock.globalData.needRefreshReward).toBe(true);
    expect(page.loadStarsAndRewards).toHaveBeenCalled();

    page.handleRewardClaimed({ rewardId: 'reward-1', points: 10, newTotalPoints: 20 });
    expect(appMock.globalData.rewardClaimedInfo).toEqual(expect.objectContaining({
      rewardId: 'reward-1'
    }));

    await page.handleTaskDataChanged({
      changeType: 'delete',
      tasks: [{ id: 'task-1' }],
      timestamp: 123
    });
    expect(page.loadTaskDataOnly).toHaveBeenCalled();
    expect(page.checkUpcomingTasks).toHaveBeenCalled();

    await page.handleMessageDataChanged([
      { id: 'msg-inline-1', title: '内联消息', type: 'task', isRead: false, createTime: 2 },
      { id: 'msg-inline-2', title: '已读消息', type: 'system', isRead: true, createTime: 1 }
    ]);
    expect(page.data.messages).toHaveLength(2);
    expect(page.data.unreadCount).toBe(1);

    await page.handleTaskCreated({ taskId: 'task-new' });
    expect(page.refreshTaskDataForCurrentView).toHaveBeenCalled();

    taskService.recordOccurrenceResult = jest.fn()
      .mockResolvedValueOnce({ success: true, unchanged: true })
      .mockResolvedValueOnce({ success: false, message: '记录失败' })
      .mockResolvedValueOnce({ success: true, fallback: true })
      .mockResolvedValueOnce({ success: true });
    page.refreshTaskDataForCurrentView = jest.fn().mockResolvedValue();

    await page.recordOccurrenceFromHome({ currentTarget: { dataset: {} } });
    expect(taskService.recordOccurrenceResult).not.toHaveBeenCalled();

    page.data.isViewerReadonly = true;
    page.data.isTaskExecutionReadonly = true;
    await page.recordOccurrenceFromHome({
      currentTarget: { dataset: { taskId: 'occ_1', outcome: 'success' } }
    });
    expect(taskService.recordOccurrenceResult).not.toHaveBeenCalled();
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '当前为查看者，不能记录表现'
    }));
    page.data.isViewerReadonly = false;
    page.data.isTaskExecutionReadonly = false;

    page.data.isReadonlyView = true;
    page.data.isTaskExecutionReadonly = false;
    await page.recordOccurrenceFromHome({
      currentTarget: { dataset: { taskId: 'occ_1', outcome: 'success' } }
    });
    expect(taskService.recordOccurrenceResult).toHaveBeenCalledWith('occ_1', {
      userId: expect.any(String),
      date: expect.any(String),
      outcome: 'success'
    });
    page.data.isReadonlyView = false;

    await page.recordOccurrenceFromHome({
      currentTarget: { dataset: { taskId: 'occ_1', outcome: 'success' } }
    });
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '记录失败'
    }));

    await page.recordOccurrenceFromHome({
      currentTarget: { dataset: { taskId: 'occ_1', outcome: 'success' } }
    });
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '已暂存，联网后自动同步',
      icon: 'none'
    }));

    await page.recordOccurrenceFromHome({
      currentTarget: { dataset: { taskId: 'occ_1', outcome: 'failure' } }
    });
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '已记为未达成'
    }));
    expect(page.refreshTaskDataForCurrentView).toHaveBeenCalled();

    page.handleMenuStateChange({ detail: { isOpen: true } });
    expect(page.data.showFloatMenu).toBe(true);
    page.handleMenuItemTap({ detail: { item: { id: 'reward-manage' } } });
    expect(global.wx.navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: '/packageManage/pages/reward-manage/reward-manage'
    }));

    page.dismissUpcomingTask({ currentTarget: { dataset: {} } });
    page.markTaskMessagesAsRead({ currentTarget: { dataset: {} } });
    expect(messageService.deleteRelatedTaskMessages).toHaveBeenCalledTimes(0);
    expect(messageService.markRelatedMessagesAsRead).toHaveBeenCalledTimes(0);

    page.handleUpcomingOption({ detail: { action: 'viewMessages' } });
    jest.runAllTimers();
    expect(global.wx.navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: '/pages/message/message?tab=task'
    }));
  });

  it('首页消息预览在同一事件存在 formal 与 provisional 时应优先 formal 且未读只计一次', async () => {
    messageService.getMessagesByScope.mockResolvedValueOnce([
      {
        id: 'msg_provisional',
        title: '待同步任务',
        type: 'task',
        isRead: false,
        createTime: 200,
        isProvisional: true,
        syncedToCloud: false,
        messageEventKey: 'task:create:1'
      },
      {
        id: 'msg_formal',
        title: '正式任务',
        type: 'task',
        isRead: false,
        createTime: 100,
        syncedToCloud: true,
        messageEventKey: 'task:create:1'
      }
    ]);

    await page.loadMessageData();

    expect(page.data.messages.map((message) => message.id)).toEqual(['msg_formal']);
    expect(page.data.unreadCount).toBe(1);
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
    expect(global.wx.navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: '/packageTask/pages/task-edit/task-edit?mode=create'
    }));

    page.data.isViewingToday = false;
    page.onMenuItemTap({ detail: { item: { id: 'habit' } } });
    expect(global.wx.navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: '/packageTask/pages/task-edit/task-edit?mode=create'
    }));

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

  it('首页 onboarding 的创建任务 CTA 应直接跳转到任务管理页', () => {
    page.data.homeOnboardingCard = {
      primaryAction: {
        type: 'create_task',
        text: '创建任务'
      }
    };

    page.onHomeOnboardingPrimaryTap();

    expect(global.wx.navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: '/packageTask/pages/task-edit/task-edit?mode=create'
    }));
  });

  it('首页 onboarding 的主次 CTA 应覆盖创建家庭、输入邀请码、添加孩子和奖励跳转分支', () => {
    page.navigateToRewardManage = jest.fn();

    page.data.homeOnboardingCard = {
      primaryAction: {
        type: 'create_family',
        text: '创建家庭'
      }
    };
    page.onHomeOnboardingPrimaryTap();
    expect(global.wx.navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: '/packageManage/pages/family-settings/family-settings?action=create_family'
    }));

    global.wx.navigateTo.mockClear();
    page.data.homeOnboardingCard = {
      primaryAction: {
        type: 'join_with_code',
        text: '输入邀请码'
      }
    };
    page.onHomeOnboardingPrimaryTap();
    expect(global.wx.navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: '/pages/access-gate/access-gate?mode=manual_input'
    }));

    global.wx.navigateTo.mockClear();
    page.data.homeOnboardingCard = {
      primaryAction: {
        type: 'add_child',
        text: '去添加孩子'
      }
    };
    page.onHomeOnboardingPrimaryTap();
    expect(global.wx.navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: '/packageManage/pages/family-settings/family-settings'
    }));

    page.data.homeOnboardingCard = {
      primaryAction: {
        type: 'go_reward_manage',
        text: '去看看奖励'
      }
    };
    page.onHomeOnboardingPrimaryTap();
    expect(page.navigateToRewardManage).toHaveBeenCalledTimes(1);

    global.wx.navigateTo.mockClear();
    page.data.homeOnboardingCard = {
      secondaryAction: {
        type: 'join_with_code',
        text: '输入邀请码加入'
      }
    };
    page.onHomeOnboardingSecondaryTap();
    expect(global.wx.navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: '/pages/access-gate/access-gate?mode=manual_input'
    }));

    page.data.homeOnboardingCard = {
      secondaryAction: {
        type: 'go_reward_manage',
        text: '去看看奖励'
      }
    };
    page.onHomeOnboardingSecondaryTap();
    expect(page.navigateToRewardManage).toHaveBeenCalledTimes(2);
  });

  it('孩子视角空态应使用等待家长安排的口径', () => {
    const wxml = require('fs').readFileSync(
      require('path').join(process.cwd(), 'pages/index/index.wxml'),
      'utf8'
    );

    expect(wxml).toContain('今天还没有任务安排，家长安排好后会显示在这里');
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

  it('多用户相关壳层方法应处理切换、编辑和验证流程', async () => {
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
    expect(page.data.menuItems).toEqual([
      { id: 'study' },
      { id: 'habit' },
      { id: 'reward-manage' }
    ]);

    page.showUserSwitcher = jest.fn();
    page.navigateToUserProfile();
    expect(page.showUserSwitcher).toHaveBeenCalled();

    await expect(page.validateUserModule()).resolves.toBe(true);
  });

  it('getEffectiveTaskUserId 应统一使用标准用户标识', () => {
    page.setData({
      canManageMembers: false,
      currentUser: { userId: 'child-user-only', role: 'child' }
    });
    expect(page.getEffectiveTaskUserId()).toBe('child-user-only');

    page.setData({
      canManageMembers: true,
      currentUser: { userId: 'parent-1', role: 'parent' },
      lastActiveChildId: null,
      availableUsers: [
        { userId: 'parent-1', role: 'parent' },
        { userId: 'child-user-only', role: 'child' }
      ]
    });
    expect(page.getEffectiveTaskUserId()).toBe('child-user-only');
  });
});
