jest.mock('../../services/service-manager.js', () => ({
  getService: jest.fn()
}));

jest.mock('../../utils/dateUtils', () => ({
  formatRelativeTime: jest.fn(() => '刚刚')
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const serviceManager = require('../../services/service-manager.js');
const coordinator = require('../../pages/index/modules/index-refresh-coordinator');

describe('pages/index/modules/index-refresh-coordinator', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    app = {
      globalData: {}
    };
    global.wx = {
      getStorageSync: jest.fn(() => 0),
      setStorageSync: jest.fn(),
      showToast: jest.fn()
    };
    global.getApp = jest.fn(() => app);
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.wx;
    delete global.getApp;
  });

  it('奖励更新与领取应正确写入首页全局状态', async () => {
    const page = {
      isCurrentPage: jest.fn(() => true),
      loadStarsAndRewards: jest.fn().mockResolvedValue()
    };

    await coordinator.handleRewardUpdated(page, { id: 'reward-1' });
    coordinator.handleRewardClaimed(page, { rewardId: 'reward-2', points: 5 });

    expect(app.globalData.needRefreshReward).toBe(true);
    expect(app.globalData.rewardClaimedInfo).toEqual({ rewardId: 'reward-2', points: 5 });
    expect(page.loadStarsAndRewards).toHaveBeenCalled();
  });

  it('奖励更新和消息变化在非首页或非数组场景下应走降级路径', async () => {
    const page = {
      isCurrentPage: jest.fn(() => false),
      loadStarsAndRewards: jest.fn().mockResolvedValue(),
      loadMessageData: jest.fn().mockResolvedValue()
    };

    await coordinator.handleRewardUpdated(page, { id: 'reward-1' });
    await coordinator.handleMessageDataChanged(page, { changed: true });

    expect(page.loadStarsAndRewards).not.toHaveBeenCalled();
    expect(page.loadMessageData).toHaveBeenCalled();
  });

  it('任务与消息刷新应按当前视图和消息数组处理', async () => {
    const heatmap = { refreshTaskList: jest.fn() };
    const page = {
      data: {
        currentViewDate: '2026-03-26'
      },
      loadTaskDataOnly: jest.fn().mockResolvedValue(),
      checkUpcomingTasks: jest.fn().mockResolvedValue(),
      loadMessageData: jest.fn().mockResolvedValue(),
      selectComponent: jest.fn(() => heatmap),
      setData: jest.fn()
    };

    await coordinator.handleTaskDataChanged(page, {
      changeType: 'delete',
      timestamp: 123
    });
    jest.runAllTimers();

    await coordinator.handleMessageDataChanged(page, [
      { id: 'm1', isRead: true, type: 'task', createTime: 1 },
      { id: 'm2', isRead: false, type: 'reward', createTime: 2 }
    ]);

    expect(page.loadTaskDataOnly).toHaveBeenCalledWith('2026-03-26');
    expect(heatmap.refreshTaskList).toHaveBeenCalled();
    expect(page.setData).toHaveBeenLastCalledWith({
      messages: [
        expect.objectContaining({ id: 'm2', timeDisplay: '刚刚' }),
        expect.objectContaining({ id: 'm1', timeDisplay: '刚刚' })
      ],
      unreadCount: 1
    });
  });

  it('任务创建和普通任务变更应走当前视图刷新主路径', async () => {
    const page = {
      data: {
        currentViewDate: '2026-03-26'
      },
      loadTaskDataOnly: jest.fn().mockResolvedValue(),
      checkUpcomingTasks: jest.fn().mockResolvedValue(),
      refreshTaskDataForCurrentView: jest.fn().mockResolvedValue(),
      setData: jest.fn()
    };

    await coordinator.handleTaskCreated(page, { id: 'task-1' });
    await coordinator.handleTaskDataChanged(page, {
      changeType: 'update',
      timestamp: 456,
      tasks: [{ id: 'task-1' }]
    });

    expect(page.refreshTaskDataForCurrentView).toHaveBeenCalled();
    expect(page.loadTaskDataOnly).toHaveBeenCalledWith('2026-03-26');
    expect(page.setData).toHaveBeenCalledWith({
      __dataUpdateTimestamp: 456
    });
  });

  it('过期检查和页面批量刷新应调用对应服务', async () => {
    const configService = {
      getLastExpiryCheckTime: jest.fn(() => 0),
      setLastExpiryCheckTime: jest.fn()
    };
    const taskService = {
      checkTasksStatus: jest.fn().mockResolvedValue({ penaltyResults: [{}] })
    };
    const starService = {
      cleanupExpiredStars: jest.fn().mockResolvedValue({ expiredCount: 1 })
    };
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'config') return configService;
      if (name === 'task') return taskService;
      if (name === 'star') return starService;
      return null;
    });

    const page = {
      data: { currentUser: { name: '小明' } },
      loadTaskDataOnly: jest.fn().mockResolvedValue(),
      loadMessageData: jest.fn().mockResolvedValue(),
      loadStarsAndRewards: jest.fn().mockResolvedValue(),
      checkUpcomingTasks: jest.fn().mockResolvedValue(),
      refreshTaskDataForCurrentView: jest.fn().mockResolvedValue()
    };

    await coordinator.checkExpiredTasksAndStars(page);
    await coordinator.loadAllPageData(page);
    await coordinator.refreshDataForCurrentUser(page);

    expect(configService.setLastExpiryCheckTime).toHaveBeenCalled();
    expect(taskService.checkTasksStatus).toHaveBeenCalled();
    expect(starService.cleanupExpiredStars).toHaveBeenCalled();
    expect(page.checkUpcomingTasks).toHaveBeenCalled();
    expect(page.loadMessageData).toHaveBeenCalled();
    expect(page.loadStarsAndRewards).toHaveBeenCalled();
    expect(page.refreshTaskDataForCurrentView).toHaveBeenCalled();
  });

  it('过期检查在配置服务缺失或检查间隔未到时应走降级/跳过路径', async () => {
    const taskService = {
      checkTasksStatus: jest.fn().mockResolvedValue({ penaltyResults: [] })
    };
    const starService = {
      cleanupExpiredStars: jest.fn().mockResolvedValue({ expiredCount: 0 })
    };

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'task') return taskService;
      if (name === 'star') return starService;
      return null;
    });

    global.wx.getStorageSync.mockReturnValueOnce(0);
    await coordinator.checkExpiredTasksAndStars({});

    expect(global.wx.setStorageSync).toHaveBeenCalledWith('last_expiry_check_time', expect.any(Number));
    expect(taskService.checkTasksStatus).toHaveBeenCalled();
    expect(starService.cleanupExpiredStars).toHaveBeenCalled();

    jest.clearAllMocks();
    serviceManager.getService.mockReturnValue(null);
    global.wx.getStorageSync.mockReturnValue(Date.now());

    await coordinator.checkExpiredTasksAndStars({});

    expect(global.wx.setStorageSync).not.toHaveBeenCalled();
  });

  it('loadAllPageData 遇到同步异常时应提示失败', async () => {
    const page = {
      loadTaskDataOnly: jest.fn(() => {
        throw new Error('sync task error');
      }),
      loadMessageData: jest.fn().mockResolvedValue(),
      loadStarsAndRewards: jest.fn().mockResolvedValue(),
      checkUpcomingTasks: jest.fn().mockResolvedValue()
    };

    await coordinator.loadAllPageData(page);

    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '加载数据失败'
    }));
  });

  it('过期检查、批量刷新和当前视图刷新失败时应安全降级', async () => {
    const page = {
      data: { currentViewDate: '2026-03-26', currentUser: { name: '小明' } },
      loadTaskDataOnly: jest.fn().mockRejectedValue(new Error('task fail')),
      loadMessageData: jest.fn().mockRejectedValue(new Error('message fail')),
      loadStarsAndRewards: jest.fn().mockRejectedValue(new Error('star fail')),
      checkUpcomingTasks: jest.fn().mockResolvedValue(),
      selectComponent: jest.fn(() => null),
      setData: jest.fn(),
      refreshTaskDataForCurrentView: jest.fn().mockRejectedValue(new Error('refresh fail'))
    };

    global.wx.getStorageSync.mockReturnValue(Date.now());

    await coordinator.checkExpiredTasksAndStars(page);
    await coordinator.loadAllPageData(page);
    await coordinator.refreshTaskDataForCurrentView(page, { forceHeatmapRefresh: true });
    await coordinator.refreshDataForCurrentUser(page);

    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '加载数据失败'
    }));
  });
});
