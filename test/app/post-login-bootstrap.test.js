jest.mock('../../services/service-manager.js', () => ({
  isInitialized: true,
  getOfflineQueueService: jest.fn(),
  getTaskService: jest.fn(),
  getMessageService: jest.fn(),
  getStarService: jest.fn(),
  getRewardService: jest.fn(),
  getUserService: jest.fn(),
  getService: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const serviceManager = require('../../services/service-manager.js');
const postLoginBootstrap = require('../../utils/app/post-login-bootstrap');

describe('utils/app/post-login-bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    serviceManager.getOfflineQueueService.mockReturnValue(null);

    global.wx = {
      getStorageSync: jest.fn(),
      setStorageSync: jest.fn()
    };
  });

  afterEach(() => {
    delete global.wx;
  });

  it('run 应串起任务、星星、消息和首次启动初始化', async () => {
    const offlineQueueService = {
      initialize: jest.fn().mockResolvedValue(true),
      drain: jest.fn().mockResolvedValue({ success: true })
    };
    const taskRepository = { save: jest.fn().mockResolvedValue(true) };
    const taskService = {
      getAllTasks: jest.fn().mockResolvedValue([
        { id: 'task-1', title: '任务1', penaltyApplied: undefined },
        { id: 'task-2', title: '任务2', penaltyApplied: false }
      ]),
      taskRepository,
      checkTasksStatus: jest.fn().mockResolvedValue({ penaltyResults: [] }),
      checkUpcomingTasks: jest.fn().mockResolvedValue()
    };
    const starService = {
      calculatePendingExpiry: jest.fn().mockResolvedValue(0),
      initialize: jest.fn().mockResolvedValue(),
      checkAndRepairDataConsistency: jest.fn().mockResolvedValue({
        success: true,
        repairResult: { repairedCount: 0 }
      }),
      enableCloudStorage: false
    };
    const messageService = {
      initialize: jest.fn().mockResolvedValue(),
      syncFormalRemindersIfNeeded: jest.fn().mockResolvedValue({ success: true }),
      getAllMessages: jest.fn().mockResolvedValue([{ id: 'msg-1' }]),
      createSystemMessage: jest.fn().mockResolvedValue({ id: 'welcome-1' })
    };
    const configService = {
      isFirstLaunch: jest.fn(() => true),
      markUserWelcomed: jest.fn()
    };

    serviceManager.getOfflineQueueService.mockReturnValue(offlineQueueService);
    serviceManager.getTaskService.mockReturnValue(taskService);
    serviceManager.getStarService.mockReturnValue(starService);
    serviceManager.getRewardService.mockReturnValue(null);
    serviceManager.getMessageService.mockReturnValue(messageService);
    serviceManager.getUserService.mockReturnValue({
      getLoginUserId: jest.fn(() => 'parent-1')
    });
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'config') return configService;
      return null;
    });

    const appReadyCallback = jest.fn();
    const app = {
      globalData: { appReadyCallback },
      setTheme: jest.fn()
    };

    await postLoginBootstrap.run(app);

    expect(offlineQueueService.initialize).toHaveBeenCalledTimes(1);
    expect(offlineQueueService.drain).toHaveBeenCalledWith({
      reason: 'post_login_bootstrap',
      force: true
    });
    expect(taskRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-1',
      penaltyApplied: false
    }));
    expect(taskService.checkTasksStatus).toHaveBeenCalled();
    expect(taskService.checkUpcomingTasks).toHaveBeenCalled();
    expect(starService.initialize).toHaveBeenCalled();
    expect(starService.checkAndRepairDataConsistency).toHaveBeenCalledTimes(1);
    expect(messageService.initialize).toHaveBeenCalled();
    expect(messageService.syncFormalRemindersIfNeeded).toHaveBeenCalled();
    expect(messageService.createSystemMessage).toHaveBeenCalled();
    expect(configService.markUserWelcomed).toHaveBeenCalled();
    expect(app.setTheme).toHaveBeenCalled();
    expect(appReadyCallback).toHaveBeenCalled();
  });

  it('checkFirstLaunch 在配置服务不可用时应回退到本地存储', async () => {
    serviceManager.isInitialized = false;
    global.wx.getStorageSync.mockReturnValueOnce(false);

    const messageService = {
      createSystemMessage: jest.fn().mockResolvedValue({ id: 'welcome-2' })
    };
    const app = { globalData: {} };

    await postLoginBootstrap.checkFirstLaunch(app, messageService);

    expect(global.wx.getStorageSync).toHaveBeenCalledWith('has_welcomed_user');
    expect(global.wx.setStorageSync).toHaveBeenCalledWith('has_welcomed_user', true);

    serviceManager.isInitialized = true;
  });

  it('run 应覆盖奖励保护、修复失败和 messageService 缺失分支', async () => {
    const offlineQueueService = {
      initialize: jest.fn().mockResolvedValue(true),
      drain: jest.fn().mockResolvedValue({ success: true })
    };
    const taskService = {
      getAllTasks: jest.fn().mockResolvedValue([]),
      taskRepository: { save: jest.fn() },
      checkTasksStatus: jest.fn().mockResolvedValue({ penaltyResults: [] }),
      checkUpcomingTasks: jest.fn().mockResolvedValue()
    };
    const starService = {
      calculatePendingExpiry: jest.fn().mockResolvedValue(3),
      protectRewardsByExpiry: jest.fn().mockResolvedValue({ success: true, protectedCount: 2 }),
      initialize: jest.fn().mockResolvedValue(),
      checkAndRepairDataConsistency: jest.fn().mockResolvedValue({
        success: false,
        error: 'repair failed'
      }),
      enableCloudStorage: false
    };

    serviceManager.getOfflineQueueService.mockReturnValue(offlineQueueService);
    serviceManager.getTaskService.mockReturnValue(taskService);
    serviceManager.getStarService.mockReturnValue(starService);
    serviceManager.getRewardService.mockReturnValue(null);
    serviceManager.getMessageService.mockReturnValue(null);
    serviceManager.getUserService.mockReturnValue({
      getLoginUserId: jest.fn(() => 'parent-1')
    });

    const app = {
      globalData: {},
      setTheme: jest.fn()
    };

    await postLoginBootstrap.run(app);

    expect(starService.protectRewardsByExpiry).toHaveBeenCalledWith(3, 'parent-1');
    expect(starService.initialize).toHaveBeenCalled();
    expect(starService.checkAndRepairDataConsistency).toHaveBeenCalledTimes(1);
    expect(app.setTheme).toHaveBeenCalled();
  });

  it('云端模式启动时仍应执行任务状态检查链路', async () => {
    const offlineQueueService = {
      initialize: jest.fn().mockResolvedValue(true),
      drain: jest.fn().mockResolvedValue({ success: true })
    };
    const taskService = {
      enableCloudStorage: true,
      getAllTasks: jest.fn().mockResolvedValue([]),
      taskRepository: { save: jest.fn() },
      checkTasksStatus: jest.fn().mockResolvedValue({
        penaltyResults: [],
        penaltyCount: 0,
        affectedTaskIds: []
      }),
      checkUpcomingTasks: jest.fn().mockResolvedValue()
    };
    const starService = {
      calculatePendingExpiry: jest.fn().mockResolvedValue(0),
      syncExpiryAuthorityIfNeeded: jest.fn().mockResolvedValue({ success: true }),
      refreshStarsFromCloud: jest.fn().mockResolvedValue({ success: true }),
      initialize: jest.fn().mockResolvedValue(),
      checkAndRepairDataConsistency: jest.fn().mockResolvedValue({
        success: true,
        repairResult: { repairedCount: 0 }
      }),
      enableCloudStorage: true
    };
    const rewardService = {
      refreshRewardsFromCloud: jest.fn().mockResolvedValue({ success: true })
    };
    const messageService = {
      initialize: jest.fn().mockResolvedValue(),
      syncFormalRemindersIfNeeded: jest.fn().mockResolvedValue({ success: true }),
      getAllMessages: jest.fn().mockResolvedValue([])
    };

    serviceManager.getOfflineQueueService.mockReturnValue(offlineQueueService);
    serviceManager.getTaskService.mockReturnValue(taskService);
    serviceManager.getStarService.mockReturnValue(starService);
    serviceManager.getRewardService.mockReturnValue(rewardService);
    serviceManager.getMessageService.mockReturnValue(messageService);
    serviceManager.getUserService.mockReturnValue({
      getLoginUserId: jest.fn(() => 'parent-1')
    });
    serviceManager.getService.mockReturnValue({
      isFirstLaunch: jest.fn(() => false)
    });

    const app = {
      globalData: {},
      setTheme: jest.fn()
    };

    await postLoginBootstrap.run(app);

    expect(taskService.checkTasksStatus).toHaveBeenCalledTimes(1);
    expect(taskService.checkUpcomingTasks).toHaveBeenCalledTimes(1);
    expect(starService.syncExpiryAuthorityIfNeeded).toHaveBeenCalledWith({
      scope: 'user',
      userId: 'parent-1',
      force: true
    });
    expect(starService.refreshStarsFromCloud).toHaveBeenCalledWith('parent-1', {
      forceCloudAfterAuthority: true
    });
    expect(rewardService.refreshRewardsFromCloud).toHaveBeenCalledWith({
      force: true,
      userId: 'parent-1'
    });
    expect(starService.checkAndRepairDataConsistency).not.toHaveBeenCalled();
    expect(messageService.syncFormalRemindersIfNeeded).toHaveBeenCalledTimes(1);
  });

  it('viewer 家长登录后初始化应走短路后的星星同步链路', async () => {
    const offlineQueueService = {
      initialize: jest.fn().mockResolvedValue(true),
      drain: jest.fn().mockResolvedValue({ success: true })
    };
    const taskService = {
      enableCloudStorage: true,
      getAllTasks: jest.fn().mockResolvedValue([]),
      taskRepository: { save: jest.fn() },
      checkTasksStatus: jest.fn().mockResolvedValue({
        penaltyResults: [],
        penaltyCount: 0,
        affectedTaskIds: []
      }),
      checkUpcomingTasks: jest.fn().mockResolvedValue()
    };
    const starService = {
      calculatePendingExpiry: jest.fn().mockResolvedValue(0),
      syncExpiryAuthorityIfNeeded: jest.fn().mockResolvedValue({
        success: true,
        skipped: true,
        reason: 'viewer_readonly'
      }),
      refreshStarsFromCloud: jest.fn().mockResolvedValue({ success: true }),
      initialize: jest.fn().mockResolvedValue(),
      checkAndRepairDataConsistency: jest.fn().mockResolvedValue({
        success: true,
        repairResult: { repairedCount: 0 }
      }),
      enableCloudStorage: true
    };
    const rewardService = {
      refreshRewardsFromCloud: jest.fn().mockResolvedValue({ success: true })
    };
    const messageService = {
      initialize: jest.fn().mockResolvedValue(),
      syncFormalRemindersIfNeeded: jest.fn().mockResolvedValue({ success: true }),
      getAllMessages: jest.fn().mockResolvedValue([])
    };

    serviceManager.getOfflineQueueService.mockReturnValue(offlineQueueService);
    serviceManager.getTaskService.mockReturnValue(taskService);
    serviceManager.getStarService.mockReturnValue(starService);
    serviceManager.getRewardService.mockReturnValue(rewardService);
    serviceManager.getMessageService.mockReturnValue(messageService);
    serviceManager.getUserService.mockReturnValue({
      getLoginUserId: jest.fn(() => 'parent-viewer')
    });
    serviceManager.getService.mockReturnValue({
      isFirstLaunch: jest.fn(() => false)
    });

    const app = {
      globalData: {},
      setTheme: jest.fn()
    };

    await postLoginBootstrap.run(app);

    expect(starService.syncExpiryAuthorityIfNeeded).toHaveBeenCalledWith({
      scope: 'user',
      userId: 'parent-viewer',
      force: true
    });
    expect(starService.refreshStarsFromCloud).toHaveBeenCalledWith('parent-viewer', {
      forceCloudAfterAuthority: true
    });
  });

  it('checkFirstLaunch 非首次启动和 createWelcomeMessage 失败时应安全返回', async () => {
    const configService = {
      isFirstLaunch: jest.fn(() => false),
      markUserWelcomed: jest.fn()
    };
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'config') return configService;
      return null;
    });

    const messageService = {
      createSystemMessage: jest.fn().mockResolvedValue(null)
    };

    await postLoginBootstrap.checkFirstLaunch({ globalData: {} }, messageService);
    expect(messageService.createSystemMessage).not.toHaveBeenCalled();

    await postLoginBootstrap.createWelcomeMessage(messageService);
    expect(messageService.createSystemMessage).toHaveBeenCalled();
  });
});
