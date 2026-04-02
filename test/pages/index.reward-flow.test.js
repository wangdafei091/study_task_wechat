jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  logEvent: jest.fn()
}));

jest.mock('../../services/service-manager.js', () => ({
  getService: jest.fn(),
  getTaskService: jest.fn()
}));

jest.mock('../../utils/formatUtils', () => ({
  formatPoints: jest.fn((points) => `fmt:${points}`)
}));

jest.mock('../../utils/dateUtils', () => ({}));
jest.mock('../../utils/permission-utils', () => ({}));
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

describe('pages/index reward flow', () => {
  let serviceManager;
  let formatUtils;
  let pageConfig;
  let appMock;
  let starService;
  let rewardService;
  let taskService;

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
    const page = {
      ...pageConfig,
      data: cloneData(pageConfig.data)
    };

    page.setData = jest.fn(function setData(update, callback) {
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

    page.selectComponent = jest.fn(() => ({
      setData: jest.fn()
    }));

    return page;
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    serviceManager = require('../../services/service-manager.js');
    formatUtils = require('../../utils/formatUtils');

    starService = {
      getTotalStars: jest.fn(),
      refreshStarsFromCloud: jest.fn(),
      syncExpiryAuthorityIfNeeded: jest.fn().mockResolvedValue({ success: true })
    };

    taskService = {
      updateTaskStatus: jest.fn(),
      completeTask: jest.fn(),
      resetTask: jest.fn()
    };

    rewardService = {
      getLastExchangeTimeByUser: jest.fn(),
      calculateNextAvailableReward: jest.fn(),
      getAvailableRewards: jest.fn(),
      refreshRewardsFromCloud: jest.fn()
    };

    serviceManager.getService.mockImplementation((serviceName) => {
      if (serviceName === 'starService') return starService;
      if (serviceName === 'rewardService') return rewardService;
      if (serviceName === 'reward') return rewardService;
      if (serviceName === 'task') return taskService;
      return null;
    });
    serviceManager.getTaskService.mockReturnValue(taskService);

    appMock = {
      globalData: {
        userService: {
          getLoginUserId: jest.fn(() => 'parent-1')
        }
      }
    };

    global.getApp = jest.fn(() => appMock);
    global.wx.showModal = jest.fn(({ success }) => {
      if (typeof success === 'function') {
        success({ confirm: true, cancel: false });
      }
    });
    global.wx.showToast = jest.fn();
    global.wx.vibrateShort = jest.fn();

    loadPageModule();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.Page;
    delete global.getApp;
  });

  it('onRewardComplete 应使用页面当前星星数，不依赖不存在的 serviceManager.getUserPoints', () => {
    const page = createPageInstance();
    page.data.userPoints = 6;
    page.data.rewardProgress = { current: 6, total: 10 };
    page._handleRewardCompletion = jest.fn();

    expect(() => page.onRewardComplete({ detail: {} })).not.toThrow();
    expect(page._handleRewardCompletion).toHaveBeenCalledWith({ current: 6, total: 10 }, 6);
  });

  it('loadStarsAndRewards 应按 effectiveUserId 读取孩子星星，并按 loginUserId 读取奖励', async () => {
    const page = createPageInstance();
    page.getEffectiveTaskUserId = jest.fn(() => 'child-1');

    starService.refreshStarsFromCloud.mockResolvedValue({ success: true });
    starService.getTotalStars.mockResolvedValue(6);
    rewardService.getLastExchangeTimeByUser.mockResolvedValue(1774157832799);
    rewardService.calculateNextAvailableReward.mockResolvedValue({
      id: 'reward-1',
      name: '看动画片',
      points: 10,
      icon: '🎁'
    });
    rewardService.getAvailableRewards.mockResolvedValue([
      {
        id: 'reward-1',
        name: '看动画片',
        points: 10,
        icon: '🎁',
        claimed: false
      }
    ]);

    await page.loadStarsAndRewards();

    expect(starService.syncExpiryAuthorityIfNeeded).toHaveBeenCalledWith({
      scope: 'user',
      userId: 'child-1'
    });
    expect(starService.refreshStarsFromCloud).toHaveBeenCalledWith('child-1', {
      forceCloudAfterAuthority: true
    });
    expect(rewardService.refreshRewardsFromCloud).toHaveBeenCalledWith({
      force: true,
      userId: 'child-1'
    });
    expect(starService.getTotalStars).toHaveBeenCalledWith('child-1');
    expect(rewardService.getLastExchangeTimeByUser).toHaveBeenCalledWith('parent-1');
    expect(rewardService.calculateNextAvailableReward).toHaveBeenCalledWith(6, 'parent-1');
    expect(rewardService.getAvailableRewards).toHaveBeenCalledWith(false, false, 'parent-1');
    expect(starService.refreshStarsFromCloud.mock.invocationCallOrder[0])
      .toBeLessThan(starService.getTotalStars.mock.invocationCallOrder[0]);
    expect(formatUtils.formatPoints).toHaveBeenCalledWith(6, true);
    expect(page.data.userPoints).toBe(6);
    expect(page.data.rewardProgress).toEqual({ current: 6, total: 10 });
    expect(page.data.visibleRewards).toEqual([
      expect.objectContaining({
        id: 'reward-1',
        status: 'current'
      })
    ]);
    expect(page.data.rewardHintText).toBe('');
  });

  it('loadStarsAndRewards 在 skipAuthoritySync=true 时不应重复触发 authority sync', async () => {
    const page = createPageInstance();
    page.getEffectiveTaskUserId = jest.fn(() => 'child-1');

    starService.refreshStarsFromCloud.mockResolvedValue({ success: true });
    starService.getTotalStars.mockResolvedValue(6);
    rewardService.getLastExchangeTimeByUser.mockResolvedValue(null);
    rewardService.calculateNextAvailableReward.mockResolvedValue({
      id: 'reward-1',
      name: '看动画片',
      points: 10,
      icon: '🎁'
    });
    rewardService.getAvailableRewards.mockResolvedValue([]);

    await page.loadStarsAndRewards({ skipAuthoritySync: true });

    expect(starService.syncExpiryAuthorityIfNeeded).not.toHaveBeenCalled();
    expect(starService.refreshStarsFromCloud).toHaveBeenCalledWith('child-1', {
      forceCloudAfterAuthority: true
    });
  });

  it('loadStarsAndRewards 在共享设备孩子视角且无正式奖励时，应显示孩子提示并过滤示例奖励', async () => {
    const page = createPageInstance();
    page.getEffectiveTaskUserId = jest.fn(() => 'child-1');
    page.data.currentUser = { id: 'child-1', role: 'child', name: '孩子' };
    page.data.isReadonlyView = true;

    starService.refreshStarsFromCloud.mockResolvedValue({ success: true });
    starService.getTotalStars.mockResolvedValue(8);
    rewardService.getLastExchangeTimeByUser.mockResolvedValue(null);
    rewardService.calculateNextAvailableReward.mockResolvedValue({
      id: 'reward_1_1',
      name: '示例奖励',
      points: 20,
      icon: '🎁',
      isExample: true
    });
    rewardService.getAvailableRewards.mockResolvedValue([
      {
        id: 'reward_1_1',
        name: '示例奖励',
        points: 20,
        icon: '🎁',
        claimed: false,
        isExample: true
      }
    ]);

    await page.loadStarsAndRewards();

    expect(page.data.nextReward.showSetupTip).toBe(true);
    expect(page.data.nextReward.name).toBe('');
    expect(page.data.visibleRewards).toEqual([]);
    expect(page.data.rewardHintText).toBe('现在还没有可用奖励，完成任务也会正常积累星星');
  });

  it('loadStarsAndRewards 在家长视角且无正式奖励时，应显示家长提示文案', async () => {
    const page = createPageInstance();
    page.getEffectiveTaskUserId = jest.fn(() => 'child-1');
    page.data.currentUser = { id: 'parent-1', role: 'parent', name: '家长' };
    page.data.isReadonlyView = false;

    starService.refreshStarsFromCloud.mockResolvedValue({ success: true });
    starService.getTotalStars.mockResolvedValue(8);
    rewardService.getLastExchangeTimeByUser.mockResolvedValue(null);
    rewardService.calculateNextAvailableReward.mockResolvedValue({ id: 'default', isDefault: true, icon: '🎁' });
    rewardService.getAvailableRewards.mockResolvedValue([]);

    await page.loadStarsAndRewards();

    expect(page.data.nextReward.showSetupTip).toBe(true);
    expect(page.data.nextReward.name).toBe('');
    expect(page.data.rewardHintText).toBe('还没有设置奖励，可以去奖励管理添加一个正式奖励');
  });

  it('checkRewardUnlock 应按当前孩子星星检查达成奖励，并在动画后弹出奖励对话框', async () => {
    jest.useFakeTimers();

    const page = createPageInstance();
    page.getEffectiveTaskUserId = jest.fn(() => 'child-1');
    page._handleRewardCompletion = jest.fn().mockResolvedValue();
    page.showRewardChoiceDialog = jest.fn();

    starService.getTotalStars.mockResolvedValue(16);
    rewardService.getAvailableRewards.mockResolvedValue([
      { id: 'reward-2', name: '大奖励', points: 20, claimed: false },
      { id: 'reward-1', name: '看动画片', points: 10, claimed: false }
    ]);

    await page.checkRewardUnlock();

    expect(starService.getTotalStars).toHaveBeenCalledWith('child-1');
    expect(rewardService.getAvailableRewards).toHaveBeenCalledWith(false, false, 'parent-1');
    expect(page._handleRewardCompletion).toHaveBeenCalledWith(null, 10);
    expect(page.data.completedReward).toEqual(expect.objectContaining({ id: 'reward-1', name: '看动画片' }));
    expect(page.data.completedRewardTotal).toBe(10);

    jest.advanceTimersByTime(500);
    expect(page.showRewardChoiceDialog).toHaveBeenCalledTimes(1);
  });

  it('_handleRewardCompletion 应按 effectiveUserId 刷新奖励完成后的实际星星数', async () => {
    const page = createPageInstance();
    page.getEffectiveTaskUserId = jest.fn(() => 'child-1');

    starService.getTotalStars.mockResolvedValue(6);
    rewardService.getAvailableRewards.mockResolvedValue([
      { id: 'reward-1', name: '看动画片', points: 10, icon: '🎁', claimed: false }
    ]);

    await page._handleRewardCompletion({ current: 6, total: 10 }, 10);

    expect(starService.getTotalStars).toHaveBeenCalledWith('child-1');
    expect(rewardService.getAvailableRewards).toHaveBeenCalledWith(false, false, 'parent-1');
    expect(page.data.userPoints).toBe(6);
    expect(page.data.rewardProgress).toEqual({ current: 10, total: 10 });
    expect(page.data.visibleRewards).toEqual([
      expect.objectContaining({
        id: 'reward-1',
        status: 'current'
      })
    ]);
  });

  it('checkRewardUnlock 应忽略示例奖励，不把它们当成正式达成目标', async () => {
    const page = createPageInstance();
    page.getEffectiveTaskUserId = jest.fn(() => 'child-1');
    page._handleRewardCompletion = jest.fn().mockResolvedValue();
    page.showRewardChoiceDialog = jest.fn();
    page.loadStarsAndRewards = jest.fn();

    starService.getTotalStars.mockResolvedValue(30);
    rewardService.getAvailableRewards.mockResolvedValue([
      { id: 'reward_1_1', name: '示例奖励', points: 10, claimed: false, isExample: true }
    ]);

    await page.checkRewardUnlock();

    expect(page._handleRewardCompletion).not.toHaveBeenCalled();
    expect(page.showRewardChoiceDialog).not.toHaveBeenCalled();
    expect(page.loadStarsAndRewards).toHaveBeenCalled();
  });

  it('completeTask 在取消完成前应按任务归属用户预检查锁定状态', async () => {
    const page = createPageInstance();
    page.data.tasks = [{
      id: 'task-1',
      userId: 'child-1',
      title: '已完成任务',
      status: 1,
      starAwarded: true,
      points: 5,
      completionTime: Date.now() - 7200000
    }];

    rewardService.getLastExchangeTimeByUser.mockResolvedValue(Date.now() - 3600000);

    await page.completeTask({ detail: { taskId: 'task-1' } });

    expect(rewardService.getLastExchangeTimeByUser).toHaveBeenCalledWith('child-1');
    expect(taskService.resetTask).not.toHaveBeenCalled();
    expect(global.wx.showModal).toHaveBeenCalledWith(expect.objectContaining({
      title: '无法取消完成'
    }));
  });

  it('transitionToNewTarget 应按 effectiveUserId 读取孩子剩余星星并更新进度条', async () => {
    const page = createPageInstance();
    const progressBar = {
      setData: jest.fn()
    };

    page.getEffectiveTaskUserId = jest.fn(() => 'child-1');
    page.selectComponent.mockReturnValue(progressBar);

    starService.getTotalStars.mockResolvedValue(6);
    rewardService.calculateNextAvailableReward.mockResolvedValue({
      id: 'reward-1',
      name: '看动画片',
      points: 10,
      allClaimed: false,
      isDefault: false,
      showSetupTip: false
    });
    rewardService.getAvailableRewards.mockResolvedValue([
      { id: 'reward-1', name: '看动画片', points: 10, icon: '🎁', claimed: false }
    ]);

    await page.transitionToNewTarget();

    expect(starService.getTotalStars).toHaveBeenCalledWith('child-1');
    expect(rewardService.calculateNextAvailableReward).toHaveBeenCalledWith(6, 'parent-1');
    expect(progressBar.setData).toHaveBeenCalledWith({ current: 6, total: 10 });
    expect(page.data.rewardProgress).toEqual({ current: 6, total: 10 });
    expect(page.data.userPoints).toBe(6);
    expect(page.data.visibleRewards).toEqual([
      expect.objectContaining({ id: 'reward-1', status: 'current' })
    ]);
  });

  it('refreshTaskDataForCurrentView 应按当前选中日期刷新任务', async () => {
    const page = createPageInstance();
    page.data.currentViewDate = '2026-03-20';
    page.loadTaskDataOnly = jest.fn().mockResolvedValue([]);
    page.checkUpcomingTasks = jest.fn().mockResolvedValue();

    await page.refreshTaskDataForCurrentView();

    expect(page.loadTaskDataOnly).toHaveBeenCalledWith('2026-03-20');
    expect(page.checkUpcomingTasks).toHaveBeenCalledTimes(1);
  });

  it('taskItemStatusToggle 应刷新当前视图日期任务，不跳回今天', async () => {
    const page = createPageInstance();
    page.data.currentViewDate = '2026-03-20';
    page.transitionToNewTarget = jest.fn();
    page.refreshTaskDataForCurrentView = jest.fn().mockResolvedValue();
    taskService.updateTaskStatus.mockResolvedValue({ success: true });

    await page.taskItemStatusToggle({
      detail: {
        id: 'task-1',
        newStatus: 1
      }
    });

    expect(taskService.updateTaskStatus).toHaveBeenCalledWith('task-1', 1);
    expect(page.transitionToNewTarget).toHaveBeenCalledTimes(1);
    expect(page.refreshTaskDataForCurrentView).toHaveBeenCalledTimes(1);
  });

  it('onShow 应先刷新云端奖励再加载首页数据', async () => {
    const page = createPageInstance();
    page.waitForServicesReady = jest.fn().mockResolvedValue();
    page.waitForLoginComplete = jest.fn().mockResolvedValue();
    page.initializeMultiUserSystem = jest.fn().mockResolvedValue();
    page.checkExpiredTasksAndStars = jest.fn().mockResolvedValue();
    page.loadAllPageData = jest.fn();

    await page.onShow();

    expect(rewardService.refreshRewardsFromCloud).toHaveBeenCalledTimes(1);
    expect(page.checkExpiredTasksAndStars).toHaveBeenCalledTimes(1);
    expect(page.loadAllPageData).toHaveBeenCalledTimes(1);
  });

  it('奖励流模块应覆盖无上下文、无达成奖励和设置奖励提示分支', async () => {
    const page = createPageInstance();
    page.loadStarsAndRewards = jest.fn().mockResolvedValue();

    serviceManager.getService.mockReturnValueOnce(null);
    await page.loadStarsAndRewards();

    serviceManager.getService.mockImplementation((serviceName) => {
      if (serviceName === 'starService') return starService;
      if (serviceName === 'rewardService') return rewardService;
      return null;
    });

    page.getEffectiveTaskUserId = jest.fn(() => 'child-1');
    starService.getTotalStars.mockResolvedValue(3);
    rewardService.getAvailableRewards.mockResolvedValue([{ id: 'reward-2', name: '大奖励', points: 10, claimed: false }]);
    await page.checkRewardUnlock();
    expect(page.loadStarsAndRewards).toHaveBeenCalled();

    page.loadStarsAndRewards = pageConfig.loadStarsAndRewards.bind(page);
    starService.refreshStarsFromCloud.mockResolvedValue({ success: true });
    rewardService.getLastExchangeTimeByUser.mockResolvedValue(null);
    rewardService.calculateNextAvailableReward.mockResolvedValue({
      id: 'default',
      name: '默认奖励',
      isDefault: true
    });
    rewardService.getAvailableRewards.mockResolvedValue([]);
    await page.loadStarsAndRewards();
    expect(page.data.nextReward.showSetupTip).toBe(true);
    expect(page.data.rewardProgress.total).toBe(100);
  });

  it('loadStarsAndRewards 在云端刷新失败时应降级读取本地星星数据', async () => {
    const page = createPageInstance();
    page.getEffectiveTaskUserId = jest.fn(() => 'child-1');

    starService.refreshStarsFromCloud.mockRejectedValue(new Error('network down'));
    starService.getTotalStars.mockResolvedValue(4);
    rewardService.getLastExchangeTimeByUser.mockResolvedValue(null);
    rewardService.calculateNextAvailableReward.mockResolvedValue({
      id: 'reward-1',
      name: '看动画片',
      points: 10,
      icon: '🎁'
    });
    rewardService.getAvailableRewards.mockResolvedValue([
      { id: 'reward-1', name: '看动画片', points: 10, icon: '🎁', claimed: false }
    ]);

    await page.loadStarsAndRewards();

    expect(starService.refreshStarsFromCloud).toHaveBeenCalledWith('child-1', {
      forceCloudAfterAuthority: true
    });
    expect(starService.getTotalStars).toHaveBeenCalledWith('child-1');
    expect(page.data.userPoints).toBe(4);
  });

  it('奖励对话框与继续积累应覆盖重复打开和关闭动画分支', async () => {
    jest.useFakeTimers();
    const page = createPageInstance();
    page.data.completedReward = { name: '看动画片' };
    page.transitionToNewTarget = jest.fn();

    global.wx.createAnimation = jest.fn(() => ({
      scale: jest.fn().mockReturnThis(),
      opacity: jest.fn().mockReturnThis(),
      step: jest.fn().mockReturnThis(),
      export: jest.fn(() => ({ ok: true }))
    }));

    page.showRewardChoiceDialog();
    page.showRewardChoiceDialog();
    jest.runOnlyPendingTimers();
    expect(page.data.showRewardChoice).toBe(true);

    page.continueCollecting();
    jest.runAllTimers();
    expect(page.transitionToNewTarget).toHaveBeenCalled();
    expect(page.data.showRewardChoice).toBe(false);
  });

  it('transitionToNewTarget 在无上下文或无进度条时应安全处理', async () => {
    const page = createPageInstance();
    page.selectComponent.mockReturnValue(null);

    serviceManager.getService.mockReturnValueOnce(null);
    await expect(page.transitionToNewTarget()).resolves.toBeUndefined();

    serviceManager.getService.mockImplementation((serviceName) => {
      if (serviceName === 'starService') return starService;
      if (serviceName === 'rewardService') return rewardService;
      return null;
    });
    starService.getTotalStars.mockResolvedValue(5);
    rewardService.calculateNextAvailableReward.mockResolvedValue({
      id: 'reward-1',
      name: '看动画片',
      points: 10
    });

    await page.transitionToNewTarget();
    expect(page.data.rewardProgress).toEqual({ current: 5, total: 10 });
  });
});
