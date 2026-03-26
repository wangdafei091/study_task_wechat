jest.mock('../../services/service-manager.js', () => ({
  getService: jest.fn(),
  getUserService: jest.fn(),
  waitForInitialization: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

describe('pages/index/modules/index-lifecycle', () => {
  let lifecycle;
  let app;
  let serviceManager;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    serviceManager = require('../../services/service-manager.js');
    app = {
      globalData: {
        userInfo: null,
        fromRewardCompletion: false
      }
    };
    global.getApp = jest.fn(() => app);
    global.wx = {
      showToast: jest.fn()
    };
    lifecycle = require('../../pages/index/modules/index-lifecycle');
  });

  afterEach(() => {
    delete global.getApp;
    delete global.wx;
  });

  it('onLoad 应注册事件处理器并初始化页面基础能力', async () => {
    const page = {
      data: { canIUse: true },
      handleTaskDataChanged: jest.fn(),
      handleTaskCreated: jest.fn(),
      handleMessageDataChanged: jest.fn(),
      handleRewardClaimed: jest.fn(),
      handleRewardUpdated: jest.fn(),
      handleProgressBarComplete: jest.fn(),
      setRandomMotivation: jest.fn(),
      registerEventListeners: jest.fn(),
      initializeDateNavigation: jest.fn(),
      setData: jest.fn()
    };

    await lifecycle.onLoad(page, {});

    expect(page._eventHandlers).toBeTruthy();
    expect(page.setRandomMotivation).toHaveBeenCalled();
    expect(page.registerEventListeners).toHaveBeenCalled();
    expect(page.initializeDateNavigation).toHaveBeenCalled();
    expect(typeof app.userInfoReadyCallback).toBe('function');
  });

  it('onLoad 在已有 userInfo 时应直接写入页面', async () => {
    app.globalData.userInfo = { nickName: '家长' };
    const page = {
      data: { canIUse: false },
      handleTaskDataChanged: jest.fn(),
      handleTaskCreated: jest.fn(),
      handleMessageDataChanged: jest.fn(),
      handleRewardClaimed: jest.fn(),
      handleRewardUpdated: jest.fn(),
      handleProgressBarComplete: jest.fn(),
      setRandomMotivation: jest.fn(),
      registerEventListeners: jest.fn(),
      initializeDateNavigation: jest.fn(),
      setData: jest.fn()
    };

    await lifecycle.onLoad(page, {});

    expect(page.setData).toHaveBeenCalledWith({
      userInfo: { nickName: '家长' },
      hasUserInfo: true
    });
  });

  it('onLoad 注册的 userInfoReadyCallback 应能回写页面数据', async () => {
    const page = {
      data: { canIUse: true },
      handleTaskDataChanged: jest.fn(),
      handleTaskCreated: jest.fn(),
      handleMessageDataChanged: jest.fn(),
      handleRewardClaimed: jest.fn(),
      handleRewardUpdated: jest.fn(),
      handleProgressBarComplete: jest.fn(),
      setRandomMotivation: jest.fn(),
      registerEventListeners: jest.fn(),
      initializeDateNavigation: jest.fn(),
      setData: jest.fn()
    };

    await lifecycle.onLoad(page, {});
    app.userInfoReadyCallback({ userInfo: { nickName: '小朋友' } });

    expect(page.setData).toHaveBeenCalledWith({
      userInfo: { nickName: '小朋友' },
      hasUserInfo: true
    });
  });

  it('onShow 应刷新奖励并在正常路径下检查过期数据', async () => {
    const rewardService = {
      refreshRewardsFromCloud: jest.fn().mockResolvedValue()
    };
    serviceManager.getService.mockReturnValue(rewardService);

    const page = {
      waitForServicesReady: jest.fn().mockResolvedValue(),
      initializeMultiUserSystemDelayed: jest.fn().mockResolvedValue(),
      checkExpiredTasksAndStars: jest.fn().mockResolvedValue(),
      loadAllPageData: jest.fn()
    };

    await lifecycle.onShow(page);

    expect(page.waitForServicesReady).toHaveBeenCalled();
    expect(page.initializeMultiUserSystemDelayed).toHaveBeenCalled();
    expect(rewardService.refreshRewardsFromCloud).toHaveBeenCalled();
    expect(page.checkExpiredTasksAndStars).toHaveBeenCalled();
    expect(page.loadAllPageData).toHaveBeenCalled();
  });

  it('waitForServicesReady 初始化超时时应提示用户', async () => {
    serviceManager.waitForInitialization.mockResolvedValue(false);

    await lifecycle.waitForServicesReady({});

    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '服务加载中，请稍候'
    }));
  });

  it('waitForServicesReady 就绪时应直接返回', async () => {
    serviceManager.waitForInitialization.mockResolvedValue(true);

    await expect(lifecycle.waitForServicesReady({})).resolves.toBeUndefined();
    expect(global.wx.showToast).not.toHaveBeenCalled();
  });

  it('onShow 在从奖励完成页返回或同步失败时应走降级路径', async () => {
    const rewardService = {
      refreshRewardsFromCloud: jest.fn().mockRejectedValue(new Error('sync fail'))
    };
    serviceManager.getService.mockReturnValue(rewardService);
    app.globalData.fromRewardCompletion = true;

    const page = {
      waitForServicesReady: jest.fn().mockResolvedValue(),
      initializeMultiUserSystemDelayed: jest.fn().mockResolvedValue(),
      checkExpiredTasksAndStars: jest.fn().mockResolvedValue(),
      loadAllPageData: jest.fn()
    };

    await lifecycle.onShow(page);

    expect(page.checkExpiredTasksAndStars).not.toHaveBeenCalled();
    expect(page.loadAllPageData).toHaveBeenCalled();
    expect(app.globalData.fromRewardCompletion).toBe(false);
  });

  it('waitForServicesReady 异常时不应抛错', async () => {
    serviceManager.waitForInitialization.mockRejectedValue(new Error('boom'));
    await expect(lifecycle.waitForServicesReady({})).resolves.toBeUndefined();
  });

  it('waitForLoginComplete 在本地模式下应直接跳过等待', async () => {
    jest.resetModules();
    jest.doMock('../../utils/api-config', () => ({
      ENABLE_API: false
    }));

    serviceManager = require('../../services/service-manager.js');
    lifecycle = require('../../pages/index/modules/index-lifecycle');

    await expect(lifecycle.waitForLoginComplete({})).resolves.toBeUndefined();
    expect(serviceManager.getUserService).not.toHaveBeenCalled();
  });

  it('waitForLoginComplete 在 token 和用户服务就绪时应尽快返回', async () => {
    jest.resetModules();
    jest.doMock('../../utils/api-config', () => ({
      ENABLE_API: true
    }));
    jest.doMock('../../utils/token-manager', () => ({
      getToken: jest.fn(() => 'token-1')
    }));

    serviceManager = require('../../services/service-manager.js');
    serviceManager.getUserService.mockReturnValue({
      initialized: true,
      loginUser: { userId: 'parent_1' },
      currentUser: { userId: 'child_1' }
    });
    lifecycle = require('../../pages/index/modules/index-lifecycle');

    await expect(lifecycle.waitForLoginComplete({})).resolves.toBeUndefined();
    expect(serviceManager.getUserService).toHaveBeenCalled();
  });

  it('waitForLoginComplete 超时时应安全结束', async () => {
    jest.useFakeTimers();
    jest.resetModules();
    jest.doMock('../../utils/api-config', () => ({
      ENABLE_API: true
    }));
    jest.doMock('../../utils/token-manager', () => ({
      getToken: jest.fn(() => '')
    }));

    serviceManager = require('../../services/service-manager.js');
    serviceManager.getUserService.mockReturnValue({
      initialized: false
    });
    lifecycle = require('../../pages/index/modules/index-lifecycle');

    const waitPromise = lifecycle.waitForLoginComplete({});
    await jest.advanceTimersByTimeAsync(5050);
    await expect(waitPromise).resolves.toBeUndefined();
    jest.useRealTimers();
  });
});
