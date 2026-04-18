jest.mock('../../services/service-manager', () => ({
  getService: jest.fn(),
  getUserService: jest.fn()
}));

jest.mock('../../utils/formatUtils', () => ({
  formatPoints: jest.fn((points) => `fmt:${points}`)
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../utils/uiUtils', () => ({}));

describe('pages/rewards/rewards behavior', () => {
  let pageConfig;
  let serviceManager;
  let appMock;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../pages/rewards/rewards.js');
    });
  }

  function createPageInstance() {
    return {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
    };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();

    serviceManager = require('../../services/service-manager');
    appMock = {
      globalData: {
        needRefreshReward: false,
        hasRedirectedToReward: false,
        lastActiveChildId: 'child-1',
        eventBus: {
          on: jest.fn(),
          off: jest.fn(),
          emit: jest.fn()
        }
      }
    };

    global.getApp = jest.fn(() => appMock);
    global.wx = {
      showLoading: jest.fn(),
      hideLoading: jest.fn(),
      showToast: jest.fn(),
      showActionSheet: jest.fn(),
      showModal: jest.fn(({ success }) => {
        if (typeof success === 'function') {
          success({ confirm: true, cancel: false });
        }
      }),
      navigateTo: jest.fn(),
      switchTab: jest.fn(),
      vibrateShort: jest.fn(),
      getStorageSync: jest.fn(() => false)
    };

    loadPageModule();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.Page;
    delete global.getApp;
    delete global.wx;
  });

  it('onShow 应在同步失败时继续加载本地数据，并按刷新标记走强制刷新', async () => {
    const starService = {
      refreshStarsFromCloud: jest.fn().mockRejectedValue(new Error('sync fail'))
    };
    const rewardService = {
      refreshRewardsFromCloud: jest.fn()
    };
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'starService') return starService;
      if (name === 'rewardService') return rewardService;
      return null;
    });
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1' })),
      getLoginUserId: jest.fn(() => 'parent-1'),
      getCurrentUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1', id: 'parent-1' })),
      getAllUsers: jest.fn(() => [
        { userId: 'parent-1', role: 'parent', familyId: 'family-1' },
        { userId: 'child-1', role: 'child', familyId: 'family-1' }
      ]),
      getUserByRole: jest.fn(() => ({ id: 'child-1' }))
    });

    appMock.globalData.needRefreshReward = true;
    appMock.globalData.hasRedirectedToReward = true;

    const page = createPageInstance();
    page.loadRewardsData = jest.fn().mockResolvedValue();

    await page.onShow();

    expect(starService.refreshStarsFromCloud).toHaveBeenCalledWith('child-1', {
      forceCloudAfterAuthority: true
    });
    expect(page.loadRewardsData).toHaveBeenCalledWith(true);
    expect(appMock.globalData.needRefreshReward).toBe(false);
    expect(appMock.globalData.hasRedirectedToReward).toBe(false);
  });

  it('首次 onShow 不应因兑换成功后的跳过标记再次刷新', async () => {
    const page = createPageInstance();
    page._skipNextOnShowRefresh = true;
    page.loadRewardsData = jest.fn().mockResolvedValue();

    await page.onShow();

    expect(appMock.globalData.eventBus.on).toHaveBeenCalledTimes(1);
    expect(page.loadRewardsData).not.toHaveBeenCalled();
    expect(page._skipNextOnShowRefresh).toBe(false);
  });

  it('clearAllTimers、onHide 和 onUnload 应清理计时器并按页面生命周期移除事件监听', async () => {
    const starService = {
      refreshStarsFromCloud: jest.fn().mockResolvedValue({})
    };
    const rewardService = {
      refreshRewardsFromCloud: jest.fn().mockResolvedValue({})
    };
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'starService') return starService;
      if (name === 'rewardService') return rewardService;
      return null;
    });
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1' })),
      getLoginUserId: jest.fn(() => 'parent-1'),
      getCurrentUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1', id: 'parent-1' })),
      getUserByRole: jest.fn(() => ({ id: 'child-1' }))
    });

    const page = createPageInstance();
    page.animationSafetyTimer = setTimeout(() => {}, 1000);
    page.rewardTimer = setTimeout(() => {}, 1000);
    page.data.demoClickTimeout = setTimeout(() => {}, 1000);
    page.loadRewardsData = jest.fn().mockResolvedValue();

    await page.onShow();

    page.onHide();
    expect(page.animationSafetyTimer).toBeNull();
    expect(page.rewardTimer).toBeNull();
    expect(page.data.demoClickTimeout).toBeNull();
    expect(appMock.globalData.eventBus.off).toHaveBeenCalledTimes(1);

    page.onUnload();
    expect(appMock.globalData.eventBus.on).toHaveBeenCalledTimes(1);
    expect(appMock.globalData.eventBus.off).toHaveBeenCalledTimes(1);
    expect(appMock.globalData.eventBus.off).toHaveBeenCalledWith(
      expect.any(String),
      appMock.globalData.eventBus.on.mock.calls[0][1]
    );
  });

  it('loadRewardsData 在无服务实例和历史配置提示场景下应正确降级为显式空态', async () => {
    const page = createPageInstance();

    serviceManager.getService.mockReturnValueOnce(null);
    await page.loadRewardsData();
    expect(global.wx.hideLoading).toHaveBeenCalled();

    const starService = {
      clearCache: jest.fn(),
      getTotalStars: jest.fn().mockResolvedValue(12)
    };
    const rewardService = {
      clearCache: jest.fn(),
      getRewardsByFamily: jest.fn().mockResolvedValue([]),
      hasCustomRewards: jest.fn().mockResolvedValue(true)
    };

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'starService') return starService;
      if (name === 'rewardService') return rewardService;
      if (name === 'config') return null;
      return null;
    });
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1', familyId: 'family-1' })),
      getLoginUserId: jest.fn(() => 'parent-1'),
      getCurrentUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1', id: 'parent-1', familyId: 'family-1' })),
      getAllUsers: jest.fn(() => [
        { userId: 'parent-1', role: 'parent', familyId: 'family-1' },
        { userId: 'child-1', role: 'child', familyId: 'family-1' }
      ]),
      getUserByRole: jest.fn(() => ({ id: 'child-1', userId: 'child-1', role: 'child', familyId: 'family-1' }))
    });

    page.getExpiringPoints = jest.fn().mockResolvedValue({ points: 1, date: '明天' });
    global.wx.getStorageSync.mockReturnValue(true);

    await page.loadRewardsData();

    expect(page.data.rewards).toEqual([]);
    expect(page.data.availableRewards).toEqual([]);
    expect(page.data.claimedRewards).toEqual([]);
    expect(page.data.showTabs).toBe(false);
    expect(page.data.totalPoints).toBe(12);
    expect(page.data.rewardEmptyMode).toBe('parent-setup');
    expect(page.data.rewardEmptyTitle).toBe('目前还没有可用的正式奖励');
    expect(page.data.showManageRewardCTA).toBe(true);
  });

  it('loadRewardsData 在只有示例奖励时应过滤示例并展示孩子空态', async () => {
    const page = createPageInstance();
    const starService = {
      clearCache: jest.fn(),
      getTotalStars: jest.fn().mockResolvedValue(9)
    };
    const rewardService = {
      clearCache: jest.fn(),
      getRewardsByFamily: jest.fn().mockResolvedValue([
        { id: 'reward_1_1', name: '示例奖励', points: 6, claimed: false, isExample: true }
      ]),
      calculateNextAvailableRewardByFamily: jest.fn().mockResolvedValue({
        id: 'reward_1_1',
        name: '示例奖励',
        points: 6,
        isExample: true
      })
    };
    const configService = {
      hasCustomRewards: jest.fn(() => false)
    };

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'starService') return starService;
      if (name === 'rewardService') return rewardService;
      if (name === 'config') return configService;
      return null;
    });
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1', familyId: 'family-1' })),
      getLoginUserId: jest.fn(() => 'parent-1'),
      getCurrentUser: jest.fn(() => ({ role: 'child', userId: 'child-1', id: 'child-1', familyId: 'family-1' })),
      getAllUsers: jest.fn(() => [
        { userId: 'parent-1', role: 'parent', familyId: 'family-1' },
        { userId: 'child-1', role: 'child', familyId: 'family-1' }
      ]),
      getUserByRole: jest.fn(() => ({ id: 'child-1', userId: 'child-1', role: 'child', familyId: 'family-1' }))
    });

    page.getExpiringPoints = jest.fn().mockResolvedValue({ points: 0, date: '' });

    await page.loadRewardsData();

    expect(page.data.rewards).toEqual([]);
    expect(page.data.rewardEmptyMode).toBe('child-explain');
    expect(page.data.rewardEmptyDescription).toContain('奖励由家长来设置');
    expect(page.data.showManageRewardCTA).toBe(false);
  });

  it('loadRewardsData 在已有当前余额时不应为每个奖励重复预览兑换成本', async () => {
    const page = createPageInstance();
    const starService = {
      clearCache: jest.fn(),
      getAvailableStarSnapshot: jest.fn().mockResolvedValue({
        userId: 'child-1',
        totalStars: 21,
        buckets: [
          { key: 'week', label: '本周到期', points: 16, emphasized: true },
          { key: 'permanent', label: '永久有效', points: 5, emphasized: false }
        ],
        expiringInfo: {
          points: 16,
          expiryDateText: '明天到期',
          expiryTimestamp: Date.now() + 86400000
        }
      })
    };
    const rewardService = {
      clearCache: jest.fn(),
      getRewardsByFamily: jest.fn().mockResolvedValue([
        { id: 'reward-1', name: '奖励1', points: 10, claimed: false, fulfillmentMode: 'manual' },
        { id: 'reward-2', name: '奖励2', points: 20, claimed: false, fulfillmentMode: 'manual' },
        { id: 'reward-3', name: '奖励3', points: 30, claimed: false, fulfillmentMode: 'manual' }
      ]),
      calculateNextAvailableRewardByFamily: jest.fn().mockResolvedValue(null),
      previewRewardExchangeCost: jest.fn().mockResolvedValue({
        originalPoints: 10,
        actualCost: 10,
        currentBalance: 21,
        remainingBalance: 11,
        shortage: 0,
        hasSufficientBalance: true
      })
    };

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'starService') return starService;
      if (name === 'rewardService') return rewardService;
      if (name === 'config') return null;
      return null;
    });
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1', familyId: 'family-1' })),
      getLoginUserId: jest.fn(() => 'parent-1'),
      getCurrentUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1', id: 'parent-1', familyId: 'family-1' })),
      getAllUsers: jest.fn(() => [
        { userId: 'parent-1', role: 'parent', familyId: 'family-1' },
        { userId: 'child-1', role: 'child', familyId: 'family-1' }
      ]),
      getUserByRole: jest.fn(() => ({ id: 'child-1', userId: 'child-1', role: 'child', familyId: 'family-1' }))
    });

    await page.loadRewardsData();

    expect(rewardService.previewRewardExchangeCost).not.toHaveBeenCalled();
    expect(page.data.totalPoints).toBe(21);
    expect(page.data.availableRewards).toHaveLength(3);
  });

  it('getExpiringPoints 在服务不可用或异常时应返回默认值', async () => {
    const page = createPageInstance();

    serviceManager.getService.mockReturnValue(null);
    await expect(page.getExpiringPoints()).resolves.toEqual({ points: 0, date: '' });

    serviceManager.getService.mockReturnValue({
      getAvailableStarSnapshot: jest.fn().mockRejectedValue(new Error('boom'))
    });
    await expect(page.getExpiringPoints()).resolves.toEqual({ points: 0, date: '' });
  });

  it('getExpiringPoints 应按当前孩子视角查询对应孩子的当前可用星星快照', async () => {
    const page = createPageInstance();
    const getAvailableStarSnapshot = jest.fn().mockResolvedValue({
      userId: 'child-1',
      totalStars: 10,
      buckets: [{ key: 'week', label: '本周到期', points: 6, emphasized: true }],
      expiringInfo: {
        points: 6,
        expiryDateText: '明天',
        expiryTimestamp: Date.now() + 86400000
      }
    });

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'starService') {
        return { getAvailableStarSnapshot };
      }
      return null;
    });
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1' })),
      getLoginUserId: jest.fn(() => 'parent-1'),
      getCurrentUser: jest.fn(() => ({ role: 'child', userId: 'child-1', id: 'child-1' })),
      getUserByRole: jest.fn(() => ({ id: 'child-1' }))
    });

    await expect(page.getExpiringPoints()).resolves.toEqual({ points: 6, date: '明天' });
    expect(getAvailableStarSnapshot).toHaveBeenCalledWith('child-1');
  });

  it('查看奖励、页面跳转与领取确认应覆盖动画拦截和兑换确认提示', async () => {
    const page = createPageInstance();
    page.data.rewards = [
      {
        id: 'reward-1',
        name: '奖励1',
        points: 10,
        unlocked: true,
        claimed: false,
        canExchange: true,
        poolActionLabel: '兑换奖励'
      }
    ];

    page.data.isRewardAnimating = true;
    page.viewReward({ currentTarget: { dataset: { id: 'reward-1' } } });
    page.navigateToMyExchanges();
    page.navigateToStarRecords();
    expect(page.data.showModal).toBe(false);
    expect(global.wx.navigateTo).not.toHaveBeenCalled();

    page.data.isRewardAnimating = false;
    page.viewReward({ currentTarget: { dataset: { id: 'reward-1' } } });
    expect(page.data.selectedReward.id).toBe('reward-1');
    page.data.totalPoints = 20;

    const rewardService = {
      previewRewardExchangeCost: jest.fn().mockResolvedValue({
        originalPoints: 10,
        actualCost: 10,
        currentBalance: 20,
        remainingBalance: 10,
        shortage: 0,
        hasSufficientBalance: true
      })
    };
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'rewardService') return rewardService;
      return null;
    });
    page._resolveRewardExecutionSubject = jest.fn(() => ({
      targetChildUserId: 'child-1',
      targetChildName: '孩子1',
      requiresPicker: false,
      isParentOwnView: false,
      childOptions: []
    }));
    page._performClaimReward = jest.fn();
    await page.claimReward({});
    expect(global.wx.showModal).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('兑换后剩余 10 颗')
    }));
    expect(page._performClaimReward).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'reward-1' }),
      expect.objectContaining({ targetChildUserId: 'child-1' })
    );
  });

  it('claimReward 在成本预览失败时应保持页面余额文案一致', async () => {
    const page = createPageInstance();
    page.data.totalPoints = 20;
    page.data.selectedReward = {
      id: 'reward-fallback',
      name: '奖励回退',
      points: 10,
      claimed: false,
      canExchange: true
    };

    const rewardService = {
      previewRewardExchangeCost: jest.fn().mockRejectedValue(new Error('preview failed'))
    };
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'rewardService') return rewardService;
      return null;
    });
    page._resolveRewardExecutionSubject = jest.fn(() => ({
      targetChildUserId: 'child-1',
      targetChildName: '孩子1',
      requiresPicker: false,
      isParentOwnView: false,
      childOptions: []
    }));
    page._performClaimReward = jest.fn();

    await page.claimReward({});

    expect(global.wx.showModal).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('当前余额 20 颗')
    }));
    expect(global.wx.showModal).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('兑换后剩余 10 颗')
    }));
    expect(page._performClaimReward).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'reward-fallback' }),
      expect.objectContaining({ targetChildUserId: 'child-1' })
    );
  });

  it('claimReward 在多孩子选择且预览失败时应按被选孩子余额回退', async () => {
    const page = createPageInstance();
    page.data.totalPoints = 5;
    page.data.selectedReward = {
      id: 'reward-picker-fallback',
      name: '奖励回退',
      points: 10,
      claimed: false,
      canExchange: true
    };

    const rewardService = {
      previewRewardExchangeCost: jest.fn().mockRejectedValue(new Error('preview failed'))
    };
    const starService = {
      getTotalStars: jest.fn().mockResolvedValue(20)
    };
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'rewardService') return rewardService;
      if (name === 'starService') return starService;
      return null;
    });
    global.wx.showActionSheet.mockImplementation(({ success }) => {
      success({ tapIndex: 1 });
    });
    page._resolveRewardExecutionSubject = jest.fn(() => ({
      targetChildUserId: null,
      targetChildName: '',
      requiresPicker: true,
      isParentOwnView: true,
      childOptions: [
        { userId: 'child-1', label: '孩子1' },
        { userId: 'child-2', label: '孩子2' }
      ]
    }));
    page._performClaimReward = jest.fn();

    await page.claimReward({});

    expect(starService.getTotalStars).toHaveBeenCalledWith('child-2');
    expect(global.wx.showModal).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('当前余额 20 颗')
    }));
    expect(global.wx.showModal).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('兑换后剩余 10 颗')
    }));
    expect(global.wx.showToast).not.toHaveBeenCalledWith(expect.objectContaining({
      title: '星星不足'
    }));
  });

  it('页面导航与星星快照查询应覆盖真实跳转和空态 CTA 分支', async () => {
    const page = createPageInstance();
    const starService = {
      getAvailableStarSnapshot: jest.fn().mockResolvedValue({
        userId: 'child-1',
        totalStars: 12,
        buckets: [],
        expiringInfo: {
          points: 0,
          expiryDateText: '',
          expiryTimestamp: null
        }
      })
    };

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'starService') return starService;
      return null;
    });
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ role: 'child', userId: 'child-1', familyId: 'family-1' })),
      getLoginUserId: jest.fn(() => 'child-1'),
      getCurrentUser: jest.fn(() => ({ role: 'child', userId: 'child-1', id: 'child-1', familyId: 'family-1' })),
      getUserByRole: jest.fn(() => ({ id: 'child-1', userId: 'child-1', role: 'child', familyId: 'family-1' })),
      getAllUsers: jest.fn(() => [{ userId: 'child-1', role: 'child', familyId: 'family-1' }])
    });

    await expect(page.getAvailableStarSnapshot()).resolves.toEqual({
      userId: 'child-1',
      totalStars: 12,
      buckets: [],
      expiringInfo: {
        points: 0,
        expiryDateText: '',
        expiryTimestamp: null
      }
    });

    page.navigateToMyExchanges();
    page.navigateToStarRecords();
    page.navigateToRewardManage();
    expect(global.wx.navigateTo).toHaveBeenNthCalledWith(1, {
      url: '/packageManage/pages/my-exchanges/my-exchanges'
    });
    expect(global.wx.navigateTo).toHaveBeenNthCalledWith(2, {
      url: '/packageMessage/pages/star-records/star-records'
    });
    expect(global.wx.navigateTo).toHaveBeenCalledTimes(2);

    page.setData({ showManageRewardCTA: true });
    page.navigateToRewardManage();
    expect(global.wx.navigateTo).toHaveBeenNthCalledWith(3, {
      url: '/packageManage/pages/reward-manage/reward-manage'
    });
  });

  it('claimReward 在需要选择孩子时应先弹出孩子选择器', async () => {
    const page = createPageInstance();
    page.data.totalPoints = 20;
    page.data.selectedReward = {
      id: 'reward-picker',
      name: '奖励选择',
      points: 10,
      claimed: false,
      canExchange: true
    };
    const rewardService = {
      previewRewardExchangeCost: jest.fn().mockResolvedValue({
        originalPoints: 10,
        actualCost: 10,
        currentBalance: 20,
        remainingBalance: 10,
        shortage: 0,
        hasSufficientBalance: true
      })
    };
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'rewardService') return rewardService;
      return null;
    });
    global.wx.showActionSheet.mockImplementation(({ success }) => {
      success({ tapIndex: 1 });
    });
    page._resolveRewardExecutionSubject = jest.fn(() => ({
      targetChildUserId: null,
      targetChildName: '',
      requiresPicker: true,
      isParentOwnView: true,
      childOptions: [
        { userId: 'child-1', label: '孩子1' },
        { userId: 'child-2', label: '孩子2' }
      ]
    }));
    page._performClaimReward = jest.fn();

    await page.claimReward({});

    expect(global.wx.showActionSheet).toHaveBeenCalledWith(expect.objectContaining({
      itemList: ['孩子1', '孩子2']
    }));
    expect(page._performClaimReward).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'reward-picker' }),
      expect.objectContaining({ targetChildUserId: 'child-2', targetChildName: '孩子2' })
    );
  });

  it('_performClaimReward 应处理失败、手动奖励和普通奖励动画路径', async () => {
    const page = createPageInstance();
    page.data.totalPoints = 20;
    page._handleExchangeSuccess = jest.fn().mockResolvedValue();

    const rewardService = {
      exchangeReward: jest.fn()
    };
    const starService = {
      getTotalStars: jest.fn().mockResolvedValue(20)
    };
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'rewardService') return rewardService;
      if (name === 'starService') return starService;
      return null;
    });
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1' })),
      getLoginUserId: jest.fn(() => 'parent-1'),
      getCurrentUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1', id: 'parent-1' })),
      getUserByRole: jest.fn(() => ({ id: 'child-1' }))
    });

    rewardService.exchangeReward.mockResolvedValueOnce({ success: false, message: '星星不足' });
    await page._performClaimReward(
      { id: 'reward-1', name: '奖励1', points: 10 },
      { targetChildUserId: 'child-1', targetChildName: '孩子1', requiresPicker: false, isParentOwnView: false }
    );
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '星星不足'
    }));

    rewardService.exchangeReward.mockResolvedValueOnce({
      success: true,
      actualCost: 8,
      fulfillmentMode: 'manual'
    });
    page.animateStarsCount = jest.fn((start, end, callback) => callback());
    await page._performClaimReward(
      { id: 'reward-2', name: '奖励2', points: 8 },
      { targetChildUserId: 'child-1', targetChildName: '孩子1', requiresPicker: false, isParentOwnView: false }
    );
    expect(page.animateStarsCount).toHaveBeenCalledWith(20, 12, expect.any(Function));
    expect(page._handleExchangeSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ actualCost: 8, fulfillmentMode: 'manual' }),
      expect.objectContaining({ id: 'reward-2' }),
      'child-1'
    );
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '已加入待发放'
    }));

    page._handleExchangeSuccess.mockClear();
    page.animateStarsCount = jest.fn((start, end, callback) => callback());
    rewardService.exchangeReward.mockResolvedValueOnce({
      success: true,
      actualCost: 4,
      fulfillmentMode: 'instant'
    });
    await page._performClaimReward(
      { id: 'reward-2b', name: '奖励3', points: 10 },
      { targetChildUserId: 'child-1', targetChildName: '孩子1', requiresPicker: false, isParentOwnView: false }
    );
    expect(page.animateStarsCount).toHaveBeenCalledWith(20, 16, expect.any(Function));
    expect(page._handleExchangeSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ actualCost: 4, fulfillmentMode: 'instant' }),
      expect.objectContaining({ id: 'reward-2b' }),
      'child-1'
    );
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '兑换成功'
    }));

    page._handleExchangeSuccess.mockClear();
    page.animateStarsCount.mockClear();
    rewardService.exchangeReward.mockResolvedValueOnce({
      success: true,
      actualCost: 6,
      fulfillmentMode: 'instant'
    });
    await page._performClaimReward(
      { id: 'reward-3', name: '普通奖励', points: 6 },
      { targetChildUserId: 'child-1', targetChildName: '孩子1', requiresPicker: false, isParentOwnView: false }
    );
    expect(page.animateStarsCount).toHaveBeenCalledWith(20, 14, expect.any(Function));
    expect(page._handleExchangeSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
      expect.objectContaining({ id: 'reward-3' }),
      'child-1'
    );
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '兑换成功'
    }));
  });

  it('_handleExchangeSuccess 应刷新数据且不重复发送奖励领取事件', async () => {
    const rewardService = {
      clearCache: jest.fn(),
      calculateNextAvailableReward: jest.fn().mockResolvedValue({
        id: 'reward-next',
        name: '下一个奖励',
        points: 18
      })
    };
    const starService = {
      clearCache: jest.fn(),
      getTotalStars: jest.fn().mockResolvedValue(15)
    };

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'rewardService') return rewardService;
      if (name === 'starService') return starService;
      return null;
    });
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1' })),
      getLoginUserId: jest.fn(() => 'parent-1'),
      getCurrentUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1', id: 'parent-1' })),
      getUserByRole: jest.fn(() => ({ id: 'child-1' }))
    });

    const page = createPageInstance();
    page.data.totalPoints = 15;
    page.loadRewardsData = jest.fn().mockResolvedValue();

    await page._handleExchangeSuccess(
      { actualCost: 5, fulfillmentMode: 'instant' },
      { id: 'reward-1', name: '奖励1', points: 5 },
      'child-1'
    );

    expect(starService.clearCache).toHaveBeenCalled();
    expect(rewardService.clearCache).toHaveBeenCalled();
    expect(page.loadRewardsData).toHaveBeenCalledWith(true);
    expect(page.data.showModal).toBe(false);
    expect(page._skipNextOnShowRefresh).toBe(true);
    expect(appMock.globalData.eventBus.emit).not.toHaveBeenCalled();
  });

  it('_handleExchangeSuccess 在没有下一个奖励时也应安全刷新', async () => {
    const rewardService = {
      clearCache: jest.fn(),
      calculateNextAvailableReward: jest.fn().mockResolvedValue(null)
    };
    const starService = {
      clearCache: jest.fn(),
      getTotalStars: jest.fn().mockResolvedValue(0)
    };

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'rewardService') return rewardService;
      if (name === 'starService') return starService;
      return null;
    });
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1' })),
      getLoginUserId: jest.fn(() => 'parent-1'),
      getCurrentUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1', id: 'parent-1' })),
      getUserByRole: jest.fn(() => ({ id: 'child-1' }))
    });

    const page = createPageInstance();
    page.loadRewardsData = jest.fn().mockResolvedValue();

    await expect(page._handleExchangeSuccess(
      { success: true },
      { id: 'reward-last', name: '最后一个奖励', points: 3 },
      'child-1'
    )).resolves.toBeUndefined();

    expect(page.data.nextReward).toBeNull();
    expect(page.loadRewardsData).toHaveBeenCalledWith(true);
  });

  it('animateStarsCount、onStarsAreaTap、switchTab 和示例判断应按预期工作', () => {
    const page = createPageInstance();
    const callback = jest.fn();

    page.animateStarsCount(12, 10, callback);
    jest.runAllTimers();
    expect(page.data.totalPoints).toBe(10);
    expect(page.data.formattedPoints).toBe('fmt:10');
    expect(callback).toHaveBeenCalled();

    for (let i = 0; i < 4; i += 1) {
      page.onStarsAreaTap();
    }
    expect(page.data.demoClickCount).toBe(4);
    page.onStarsAreaTap();
    expect(global.wx.navigateTo).toHaveBeenCalledWith({
      url: '/pages/architecture-demo/demo'
    });

    page.switchTab({ currentTarget: { dataset: { tab: 'claimed' } } });
    expect(page.data.activeTab).toBe('claimed');
    expect(page.isExampleReward({ isExample: true })).toBe(true);
    expect(page.isExampleReward({ id: 'reward_1_1' })).toBe(true);
    expect(page.isExampleReward({ id: 'reward_example_legacy' })).toBe(true);
  });

  it('onStarsAreaTap 在超时后应重置连续点击计数', () => {
    const page = createPageInstance();

    page.onStarsAreaTap();
    page.onStarsAreaTap();
    expect(page.data.demoClickCount).toBe(2);

    jest.advanceTimersByTime(2000);

    expect(page.data.demoClickCount).toBe(0);
  });
});
