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

describe('pages/rewards/rewards contract', () => {
  let pageConfig;
  let appMock;
  let serviceManager;

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
        hasRedirectedToReward: true,
        lastActiveChildId: 'child-2',
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
      showModal: jest.fn(({ success }) => success({ confirm: true })),
      navigateTo: jest.fn(),
      vibrateShort: jest.fn(),
      stopPullDownRefresh: jest.fn()
    };

    loadPageModule();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.Page;
    delete global.getApp;
    delete global.wx;
  });

  it('onLoad、事件监听与动画锁定应正常工作', async () => {
    const page = createPageInstance();
    page.setupProgressBarListener = jest.fn();
    page.loadRewardsData = jest.fn().mockResolvedValue();

    await page.onLoad({});
    expect(page._skipNextOnShowRefresh).toBe(false);
    expect(appMock.globalData.hasRedirectedToReward).toBe(false);

    await page.onShow();
    expect(page.setupProgressBarListener).toHaveBeenCalled();

    page.handleProgressBarComplete();
    expect(page.data.isRewardAnimating).toBe(true);
    expect(page.data.showAnimationMask).toBe(true);

    page.releaseAnimationLock();
    expect(page.data.isRewardAnimating).toBe(false);
    expect(page.data.showAnimationMask).toBe(false);
  });

  it('loadRewardsData 应按孩子星星和奖励池写入页面状态', async () => {
    const starService = {
      clearCache: jest.fn(),
      getAvailableStarSnapshot: jest.fn().mockResolvedValue({
        userId: 'child-2',
        totalStars: 18,
        buckets: [
          { key: 'week', label: '本周到期', points: 3, emphasized: true },
          { key: 'permanent', label: '永久有效', points: 15, emphasized: false }
        ],
        expiringInfo: {
          points: 3,
          expiryDateText: '明天',
          expiryTimestamp: 123
        }
      })
    };
    const rewardService = {
      clearCache: jest.fn(),
      getRewardsByFamily: jest.fn().mockResolvedValue([
        { id: 'r1', points: 10, claimed: false },
        { id: 'r2', points: 20, claimed: true }
      ]),
      calculateNextAvailableRewardByFamily: jest.fn().mockResolvedValue({
        id: 'r2',
        name: '奖励2',
        points: 20
      }),
      hasCustomRewards: jest.fn().mockResolvedValue(false)
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
      getCurrentUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1', id: 'parent-1', familyId: 'family-1' })),
      getAllUsers: jest.fn(() => [
        { userId: 'parent-1', role: 'parent', familyId: 'family-1' },
        { userId: 'child-2', role: 'child', familyId: 'family-1' }
      ]),
      getUserById: jest.fn((userId) => (userId === 'child-2' ? { id: 'child-2', userId: 'child-2', role: 'child', familyId: 'family-1' } : null)),
      getUserByRole: jest.fn(() => ({ id: 'child-1', userId: 'child-1', role: 'child', familyId: 'family-1' }))
    });

    const page = createPageInstance();

    await page.loadRewardsData();

    expect(starService.getAvailableStarSnapshot).toHaveBeenCalledWith('child-2');
    expect(rewardService.getRewardsByFamily).toHaveBeenCalledWith({
      familyId: 'family-1',
      memberUserIds: ['parent-1', 'child-2'],
      childUserIds: ['child-2'],
      loginUserId: 'parent-1',
      viewUserId: 'parent-1'
    });
    expect(page.data.totalPoints).toBe(18);
    expect(page.data.formattedPoints).toBe('fmt:18');
    expect(page.data.expiringPoints).toBe(3);
    expect(page.data.expiryDate).toBe('明天');
    expect(page.data.balanceSummaryPrimaryText).toBe('3颗星星将在明天失效');
    expect(page.data.balanceSummarySecondaryText).toBe('其余15颗为永久有效');
    expect(page.data.showTabs).toBe(false);
    expect(page.data.availableRewards).toHaveLength(1);
    expect(page.data.claimedRewards).toHaveLength(0);
    expect(page.data.availableRewards[0].poolStatusLabel).toBe('可兑换');
    expect(page.data.rewardEmptyMode).toBe('none');
  });

  it('loadRewardsData 在没有 lastActiveChildId 时应回退到首个活跃孩子', async () => {
    appMock.globalData.lastActiveChildId = null;

    const starService = {
      clearCache: jest.fn(),
      getTotalStars: jest.fn().mockResolvedValue(9)
    };
    const rewardService = {
      clearCache: jest.fn(),
      getRewardsByFamily: jest.fn().mockResolvedValue([]),
      calculateNextAvailableRewardByFamily: jest.fn().mockResolvedValue(null),
      hasCustomRewards: jest.fn().mockResolvedValue(false)
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
      getCurrentUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1', id: 'parent-1', familyId: 'family-1' })),
      getAllUsers: jest.fn(() => [
        { userId: 'parent-1', role: 'parent', familyId: 'family-1' },
        { userId: 'child-1', role: 'child', familyId: 'family-1' },
        { userId: 'child-2', role: 'child', familyId: 'family-1', status: 'inactive' }
      ]),
      getUserById: jest.fn(() => null),
      getUserByRole: jest.fn(() => ({ id: 'child-fallback' }))
    });

    const page = createPageInstance();
    page.getExpiringPoints = jest.fn().mockResolvedValue({ points: 0, date: '' });

    await page.loadRewardsData();

    expect(starService.getTotalStars).toHaveBeenCalledWith('child-1');
    expect(rewardService.getRewardsByFamily).toHaveBeenCalled();
  });

  it('loadRewardsData 在共享设备孩子视角无正式奖励时，应按孩子视角展示空态且不显示 CTA', async () => {
    const starService = {
      clearCache: jest.fn(),
      getTotalStars: jest.fn().mockResolvedValue(12)
    };
    const rewardService = {
      clearCache: jest.fn(),
      getRewardsByFamily: jest.fn().mockResolvedValue([
        { id: 'reward_1_1', name: '示例奖励', points: 8, claimed: false, isExample: true }
      ]),
      calculateNextAvailableRewardByFamily: jest.fn().mockResolvedValue({
        id: 'reward_1_1',
        name: '示例奖励',
        points: 8,
        isExample: true
      })
    };
    const configService = {
      hasCustomRewards: jest.fn(() => true)
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
      getCurrentUser: jest.fn(() => ({ role: 'child', userId: 'child-2', id: 'child-2', familyId: 'family-1' })),
      getAllUsers: jest.fn(() => [
        { userId: 'parent-1', role: 'parent', familyId: 'family-1' },
        { userId: 'child-2', role: 'child', familyId: 'family-1' }
      ]),
      getUserByRole: jest.fn(() => ({ id: 'child-1', userId: 'child-1', role: 'child', familyId: 'family-1' }))
    });

    const page = createPageInstance();
    page.getExpiringPoints = jest.fn().mockResolvedValue({ points: 0, date: '' });

    await page.loadRewardsData();

    expect(rewardService.getRewardsByFamily).toHaveBeenCalled();
    expect(page.data.rewardEmptyMode).toBe('child-explain');
    expect(page.data.rewardEmptyTitle).toBe('现在还没有可用奖励');
    expect(page.data.showManageRewardCTA).toBe(false);
    expect(page.data.availableRewards).toEqual([]);
    expect(page.data.claimedRewards).toEqual([]);
  });

  it('奖励查看、关闭、Tab 切换与领取前置校验应生效', async () => {
    const page = createPageInstance();
    page.data.rewards = [
      { id: 'r1', name: '奖励1', points: 10, unlocked: false, claimed: false, canExchange: false },
      { id: 'r2', name: '奖励2', points: 20, unlocked: true, claimed: true, claimStatus: 'claimed', fulfillmentMode: 'manual' },
      { id: 'r3', name: '奖励3', points: 30, unlocked: true, claimed: false, canExchange: true }
    ];

    page.viewReward({ currentTarget: { dataset: { id: 'r1' } } });
    expect(page.data.showModal).toBe(true);
    expect(page.data.selectedReward.id).toBe('r1');

    page.closeModal();
    expect(page.data.showModal).toBe(false);

    page.switchTab({ currentTarget: { dataset: { tab: 'claimed' } } });
    expect(page.data.activeTab).toBe('claimed');

    page._resolveRewardExecutionSubject = jest.fn(() => ({
      targetChildUserId: 'child-2',
      targetChildName: '孩子2',
      requiresPicker: false,
      isParentOwnView: false,
      childOptions: []
    }));

    page.data.selectedReward = page.data.rewards[0];
    await page.claimReward({});
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '星星不足'
    }));

    page.data.selectedReward = page.data.rewards[1];
    await page.claimReward({});
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '待发放'
    }));

    const rewardService = {
      previewRewardExchangeCost: jest.fn().mockResolvedValue({
        originalPoints: 30,
        expiringStarDeduction: 0,
        actualCost: 30,
        hasExpiringDeduction: false
      })
    };
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'rewardService') return rewardService;
      return null;
    });
    page.data.totalPoints = 30;
    page.data.selectedReward = page.data.rewards[2];
    page._performClaimReward = jest.fn();
    await page.claimReward({});
    expect(page._performClaimReward).toHaveBeenCalledWith(
      page.data.rewards[2],
      expect.objectContaining({ targetChildUserId: 'child-2' })
    );
  });

  it('onShow 检测到奖励变更标记时应强制刷新云端奖励', async () => {
    appMock.globalData.needRefreshReward = true;
    const rewardService = {
      refreshRewardsFromCloud: jest.fn().mockResolvedValue({ success: true })
    };
    const starService = {
      syncExpiryAuthorityIfNeeded: jest.fn().mockResolvedValue({ success: true }),
      refreshStarsFromCloud: jest.fn().mockResolvedValue({ success: true })
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
      getAllUsers: jest.fn(() => [
        { userId: 'parent-1', role: 'parent', familyId: 'family-1' },
        { userId: 'child-2', role: 'child', familyId: 'family-1' }
      ]),
      getUserById: jest.fn(() => ({ id: 'child-2', role: 'child' })),
      getUserByRole: jest.fn(() => ({ id: 'child-1' }))
    });

    const page = createPageInstance();
    page.loadRewardsData = jest.fn().mockResolvedValue();

    await page.onShow();

    expect(starService.syncExpiryAuthorityIfNeeded).toHaveBeenCalledWith({
      scope: 'user',
      userId: 'child-2'
    });
    expect(starService.refreshStarsFromCloud).toHaveBeenCalledWith('child-2', {
      forceCloudAfterAuthority: true
    });
    expect(rewardService.refreshRewardsFromCloud).toHaveBeenCalledWith({
      force: true
    });
    expect(page.loadRewardsData).toHaveBeenCalledWith(true);
    expect(appMock.globalData.needRefreshReward).toBe(false);
  });

  it('下拉刷新应强制拉取最新奖励并停止刷新动画', async () => {
    const rewardService = {
      refreshRewardsFromCloud: jest.fn().mockResolvedValue({ success: true })
    };
    const starService = {
      syncExpiryAuthorityIfNeeded: jest.fn().mockResolvedValue({ success: true }),
      refreshStarsFromCloud: jest.fn().mockResolvedValue({ success: true })
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
      getAllUsers: jest.fn(() => [
        { userId: 'parent-1', role: 'parent', familyId: 'family-1' },
        { userId: 'child-2', role: 'child', familyId: 'family-1' }
      ]),
      getUserById: jest.fn(() => ({ id: 'child-2', role: 'child' })),
      getUserByRole: jest.fn(() => ({ id: 'child-1' }))
    });

    const page = createPageInstance();
    page.loadRewardsData = jest.fn().mockResolvedValue();

    await page.onPullDownRefresh();

    expect(starService.syncExpiryAuthorityIfNeeded).toHaveBeenCalledWith({
      scope: 'user',
      userId: 'child-2',
      force: true
    });
    expect(starService.refreshStarsFromCloud).toHaveBeenCalledWith('child-2', {
      forceCloudAfterAuthority: true
    });
    expect(rewardService.refreshRewardsFromCloud).toHaveBeenCalledWith({
      force: true
    });
    expect(page.loadRewardsData).toHaveBeenCalledWith(true);
    expect(global.wx.stopPullDownRefresh).toHaveBeenCalled();
  });

  it('应按当前设备视角解析孩子、家庭奖池和个人兑换用户', () => {
    const page = createPageInstance();

    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ role: 'child', userId: 'child-self', familyId: 'family-1' })),
      getLoginUserId: jest.fn(() => 'child-self'),
      getCurrentUser: jest.fn(() => ({ role: 'child', userId: 'child-self', id: 'child-self', familyId: 'family-1' })),
      getAllUsers: jest.fn(() => [{ userId: 'child-self', role: 'child', familyId: 'family-1' }]),
      getUserByRole: jest.fn(() => ({ id: 'child-fallback', userId: 'child-fallback', role: 'child', familyId: 'family-1' }))
    });
    expect(page._getEffectiveChildUserId()).toBe('child-self');
    expect(page._getRewardFamilyScope()).toEqual(expect.objectContaining({
      familyId: 'family-1',
      memberUserIds: ['child-self'],
      childUserIds: ['child-self']
    }));
    expect(page._getMyExchangeUserId()).toBe('child-self');

    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1', familyId: 'family-1' })),
      getLoginUserId: jest.fn(() => 'parent-1'),
      getCurrentUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1', id: 'parent-1', familyId: 'family-1' })),
      getAllUsers: jest.fn(() => [
        { userId: 'parent-1', role: 'parent', familyId: 'family-1' },
        { userId: 'child-2', role: 'child', familyId: 'family-1' }
      ]),
      getUserById: jest.fn((userId) => (userId === 'child-2' ? { id: 'child-2', userId: 'child-2', role: 'child', familyId: 'family-1' } : null)),
      getUserByRole: jest.fn(() => ({ id: 'child-fallback', userId: 'child-fallback', role: 'child', familyId: 'family-1' }))
    });
    expect(page._getEffectiveChildUserId()).toBe('child-2');
    expect(page._getRewardFamilyScope()).toEqual(expect.objectContaining({
      familyId: 'family-1',
      memberUserIds: ['parent-1', 'child-2'],
      childUserIds: ['child-2']
    }));
    expect(page._getMyExchangeUserId()).toBe('child-2');
  });

  it('无可用孩子视角时应安静降级，不记录误导性 warn', () => {
    const page = createPageInstance();

    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1' })),
      getCurrentUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1', id: 'parent-1' })),
      getUserById: jest.fn(() => null),
      getUserByRole: jest.fn(() => null)
    });

    expect(page._getEffectiveChildUserId()).toBeNull();
    expect(require('../../utils/logger').warn).not.toHaveBeenCalled();
  });

  it('没有孩子成员时不应返回占位 child，也不应请求孩子星星', async () => {
    const starService = {
      clearCache: jest.fn(),
      getTotalStars: jest.fn().mockResolvedValue(99),
      refreshStarsFromCloud: jest.fn().mockResolvedValue({})
    };
    const rewardService = {
      clearCache: jest.fn(),
      refreshRewardsFromCloud: jest.fn().mockResolvedValue({}),
      getAvailableRewards: jest.fn().mockResolvedValue([]),
      calculateNextAvailableReward: jest.fn().mockResolvedValue(null)
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
      getLoginUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1' })),
      getLoginUserId: jest.fn(() => 'parent-1'),
      getCurrentUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1', id: 'parent-1' })),
      getUserByRole: jest.fn(() => null)
    });

    const page = createPageInstance();
    page.getExpiringPoints = jest.fn().mockResolvedValue({ points: 0, date: '' });

    expect(page._getEffectiveChildUserId()).toBeNull();

    await page.onShow();

    expect(starService.refreshStarsFromCloud).not.toHaveBeenCalled();
    expect(starService.getTotalStars).not.toHaveBeenCalled();
    expect(page.data.totalPoints).toBe(0);
  });

  it('无家庭场景下应退化为单用户奖励范围', () => {
    const page = createPageInstance();

    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1' })),
      getCurrentUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1', id: 'parent-1' })),
      getAllUsers: jest.fn(() => [{ userId: 'parent-1', role: 'parent' }])
    });

    expect(page._getRewardFamilyScope()).toEqual({
      familyId: null,
      memberUserIds: ['parent-1'],
      childUserIds: [],
      loginUserId: 'parent-1',
      viewUserId: 'parent-1'
    });
  });
});
