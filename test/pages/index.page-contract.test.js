const fs = require('fs');
const path = require('path');

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
  waitForInitialization: jest.fn().mockResolvedValue(true),
  getEventBus: jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn()
  }))
}));

jest.mock('../../utils/formatUtils', () => ({
  formatPoints: jest.fn((points) => `fmt:${points}`)
}));

jest.mock('../../utils/dateUtils', () => ({
  formatRelativeTime: jest.fn(() => '刚刚'),
  getTodayString: jest.fn(() => '2026-03-25')
}));

jest.mock('../../utils/permission-utils', () => ({
  getUserPermissions: jest.fn(() => ({
    canManageMembers: true,
    canViewStats: true
  }))
}));

jest.mock('../../utils/view-scope', () => ({}));
jest.mock('../../services/message-service', () => ({}));
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

describe('pages/index page contract', () => {
  let pageConfig;
  let permissionUtils;
  let page;
  let appMock;

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

    instance.selectComponent = jest.fn(() => null);

    return instance;
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    permissionUtils = require('../../utils/permission-utils');

    global.wx = {
      showToast: jest.fn(),
      showModal: jest.fn(),
      vibrateShort: jest.fn(),
      setStorageSync: jest.fn(),
      getStorageSync: jest.fn(() => 0)
    };

    appMock = {
      globalData: {
        userInfo: null,
        userService: {
          getCurrentUser: jest.fn(() => ({
            id: 'child-1',
            userId: 'child-1',
            name: '小明',
            role: 'child'
          })),
          getLoginUser: jest.fn(() => ({
            id: 'parent-1',
            userId: 'parent-1',
            name: '家长',
            role: 'parent'
          })),
          getAllUsers: jest.fn(() => [
            { id: 'parent-1', userId: 'parent-1', name: '家长', role: 'parent' },
            { id: 'child-1', userId: 'child-1', name: '小明', role: 'child' }
          ])
        }
      }
    };

    global.getApp = jest.fn(() => appMock);
    global.getCurrentPages = jest.fn(() => [
      { route: 'pages/index/index' }
    ]);

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

  it('应继续暴露首页生命周期与事件入口方法', () => {
    expect(typeof page.onLoad).toBe('function');
    expect(typeof page.onShow).toBe('function');
    expect(typeof page.waitForLoginComplete).toBe('function');
    expect(typeof page.waitForServicesReady).toBe('function');
    expect(typeof page.handleRewardUpdated).toBe('function');
    expect(typeof page.handleRewardClaimed).toBe('function');
    expect(typeof page.handleTaskDataChanged).toBe('function');
    expect(typeof page.handleMessageDataChanged).toBe('function');
    expect(typeof page.handleTaskCreated).toBe('function');
    expect(typeof page.checkExpiredTasksAndStars).toBe('function');
    expect(typeof page.loadAllPageData).toBe('function');
    expect(typeof page.refreshTaskDataForCurrentView).toBe('function');
    expect(typeof page.initializeMultiUserSystem).toBe('function');
    expect(typeof page.initializeMultiUserSystemDelayed).toBe('function');
    expect(typeof page.refreshDataForCurrentUser).toBe('function');
    expect(typeof page.refreshHomeOnboardingCard).toBe('function');
    expect(typeof page.syncHomeOnboardingVisibility).toBe('function');
    expect(typeof page.onHomeOnboardingPrimaryTap).toBe('function');
    expect(typeof page.onHomeOnboardingSecondaryTap).toBe('function');
  });

  it('initializeMultiUserSystem 应按登录用户权限和当前视角更新页面上下文', async () => {
    page.updateMenuItemsWithPermissions = jest.fn();

    await page.initializeMultiUserSystem();

    expect(permissionUtils.getUserPermissions).toHaveBeenCalledWith('child', null);
    expect(page.updateMenuItemsWithPermissions).toHaveBeenCalledTimes(1);
    expect(page.data.currentUser).toEqual(expect.objectContaining({
      userId: 'child-1',
      role: 'child'
    }));
    expect(page.data.availableUsers).toHaveLength(2);
    expect(page.data.loginUserId).toBe('parent-1');
    expect(page.data.canManageMembers).toBe(true);
    expect(page.data.isReadonlyView).toBe(true);
    expect(page.data.isViewerReadonly).toBe(false);
  });

  it('首页任务项应仅在查看者或未来日期下只读，不能误伤孩子视角打卡', () => {
    const wxml = fs.readFileSync(
      path.join(__dirname, '../../pages/index/index.wxml'),
      'utf8'
    );

    expect(wxml).toContain('readonly="{{isReadonlyView}}"');
    expect(wxml).toContain('readonlyReason="{{readonlyReason}}"');
    expect(wxml).toContain('readonly="{{isReadonlyView || isViewingFuture}}"');
    expect(wxml).toContain('readonlyReason="{{isViewingFuture ? \'future-date\' : readonlyReason}}"');
  });

  it('普通任务为空但存在表现项时，不应继续显示任务空态', () => {
    const wxml = fs.readFileSync(
      path.join(__dirname, '../../pages/index/index.wxml'),
      'utf8'
    );

    expect(wxml).toContain('task-list-container {{showOccurrenceSection ? \'has-occurrence-section\' : \'\'}} {{tasks.length === 0 && showOccurrenceSection ? \'occurrence-only\' : \'\'}}');
    expect(wxml).toContain('task-list-count" wx:if="{{tasks.length > 0 || !showOccurrenceSection}}"');
    expect(wxml).toContain('home-onboarding-card');
    expect(wxml).toContain('wx:if="{{homeOnboardingCard && showHomeOnboardingCard}}"');
    expect(wxml).toContain('task-list {{tasks.length === 0 && showOccurrenceSection ? \'occurrence-only\' : \'\'}}');
    expect(wxml).toContain('bottomOffset="{{showOccurrenceSection ? 150 : 0}}"');
    expect(wxml).toContain('tasks.length === 0 && !showOccurrenceSection && canManageMembers && currentUser && currentUser.role === \'child\' && currentUser.familyId && !showHomeOnboardingCard');
    expect(wxml).toContain('还没有加入家庭，请前往家庭设置创建家庭或输入邀请码加入');
    expect(wxml).toContain('tasks.length === 0 && !showOccurrenceSection && canManageMembers && currentUser && currentUser.role === \'parent\' && !currentUser.familyId && !showHomeOnboardingCard');
    expect(wxml).toContain('今天还没有任务安排，家长安排好后会显示在这里');
    expect(wxml).toContain('tasks.length === 0 && !showOccurrenceSection && canManageMembers && currentUser && currentUser.role === \'parent\' && currentUser.familyId && availableUsers.length > 1 && !showHomeOnboardingCard');
    expect(wxml).toContain('tasks.length === 0 && !showOccurrenceSection && canManageMembers && currentUser && currentUser.role === \'parent\' && currentUser.familyId && availableUsers.length <= 1 && !showHomeOnboardingCard');
    expect(wxml).toContain('tasks.length === 0 && !showOccurrenceSection && !canManageMembers && !showHomeOnboardingCard');
  });

  it('onLoad 不应直接触发多用户初始化，避免与 onShow 双入口竞争', async () => {
    page.setRandomMotivation = jest.fn();
    page.registerEventListeners = jest.fn();
    page.initializeDateNavigation = jest.fn();
    page.initializeMultiUserSystemDelayed = jest.fn();

    await page.onLoad({});

    expect(page.setRandomMotivation).toHaveBeenCalledTimes(1);
    expect(page.registerEventListeners).toHaveBeenCalledTimes(1);
    expect(page.initializeDateNavigation).toHaveBeenCalledTimes(1);
    expect(page.initializeMultiUserSystemDelayed).not.toHaveBeenCalled();
  });

  it('onShow 应通过统一入口初始化多用户上下文，而不是直接重复调用底层步骤', async () => {
    page.waitForServicesReady = jest.fn().mockResolvedValue();
    page.waitForLoginComplete = jest.fn().mockResolvedValue();
    page.initializeMultiUserSystemDelayed = jest.fn().mockResolvedValue();
    page.initializeMultiUserSystem = jest.fn().mockResolvedValue();
    page.checkExpiredTasksAndStars = jest.fn().mockResolvedValue();
    page.loadAllPageData = jest.fn();

    await page.onShow();

    expect(page.waitForServicesReady).toHaveBeenCalledTimes(1);
    expect(page.initializeMultiUserSystemDelayed).toHaveBeenCalledTimes(1);
    expect(page.waitForLoginComplete).not.toHaveBeenCalled();
    expect(page.initializeMultiUserSystem).not.toHaveBeenCalled();
  });

  it('handleTaskDataChanged 在删除事件下应按当前视图刷新任务并触发热力图刷新', async () => {
    jest.useFakeTimers();

    const heatmapComponent = {
      refreshTaskList: jest.fn()
    };

    page.data.currentViewDate = '2026-03-20';
    page.loadTaskDataOnly = jest.fn().mockResolvedValue([]);
    page.checkUpcomingTasks = jest.fn().mockResolvedValue();
    page.selectComponent.mockReturnValue(heatmapComponent);

    await page.handleTaskDataChanged({
      changeType: 'delete',
      timestamp: 123456
    });

    expect(page.loadTaskDataOnly).toHaveBeenCalledWith('2026-03-20');
    expect(page.checkUpcomingTasks).toHaveBeenCalledTimes(1);
    expect(page.data.__dataUpdateTimestamp).toBe(123456);

    jest.advanceTimersByTime(300);
    expect(heatmapComponent.refreshTaskList).toHaveBeenCalledTimes(1);
  });

  it('refreshDataForCurrentUser 应并行刷新任务、奖励和消息数据', async () => {
    page.data.currentUser = { name: '小明' };
    page.refreshTaskDataForCurrentView = jest.fn().mockResolvedValue();
    page.loadStarsAndRewards = jest.fn().mockResolvedValue();
    page.loadMessageData = jest.fn().mockResolvedValue();

    await page.refreshDataForCurrentUser();

    expect(page.refreshTaskDataForCurrentView).toHaveBeenCalledTimes(1);
    expect(page.loadStarsAndRewards).toHaveBeenCalledTimes(1);
    expect(page.loadMessageData).toHaveBeenCalledTimes(1);
  });
});
