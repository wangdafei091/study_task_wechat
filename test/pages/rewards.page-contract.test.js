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
      vibrateShort: jest.fn()
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
    page.loadRewardsData = jest.fn().mockResolvedValue();
    page.setupProgressBarListener = jest.fn();

    await page.onLoad({});
    expect(page.loadRewardsData).toHaveBeenCalled();
    expect(page.setupProgressBarListener).toHaveBeenCalled();
    expect(appMock.globalData.hasRedirectedToReward).toBe(false);

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
      getTotalStars: jest.fn().mockResolvedValue(18)
    };
    const rewardService = {
      clearCache: jest.fn(),
      getAvailableRewards: jest.fn().mockResolvedValue([
        { id: 'r1', points: 10, claimed: false },
        { id: 'r2', points: 20, claimed: true }
      ]),
      calculateNextAvailableReward: jest.fn().mockResolvedValue({
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
      getLoginUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1' })),
      getLoginUserId: jest.fn(() => 'parent-1'),
      getCurrentUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1', id: 'parent-1' })),
      getUserById: jest.fn((userId) => (userId === 'child-2' ? { id: 'child-2', role: 'child' } : null)),
      getUserByRole: jest.fn(() => ({ id: 'child-1' }))
    });

    const page = createPageInstance();
    page.getExpiringPoints = jest.fn().mockResolvedValue({ points: 2, date: '明天' });

    await page.loadRewardsData();

    expect(starService.getTotalStars).toHaveBeenCalledWith('child-2');
    expect(rewardService.getAvailableRewards).toHaveBeenCalledWith(true, false, 'parent-1');
    expect(page.data.totalPoints).toBe(18);
    expect(page.data.formattedPoints).toBe('fmt:18');
    expect(page.data.showTabs).toBe(true);
    expect(page.data.availableRewards).toHaveLength(1);
    expect(page.data.claimedRewards).toHaveLength(1);
    expect(page.data.availableRewards[0].poolStatusLabel).toBe('可兑换');
    expect(page.data.claimedRewards[0].poolStatusLabel).toBe('已兑换');
    expect(page.data.rewardEmptyMode).toBe('none');
  });

  it('loadRewardsData 在共享设备孩子视角无正式奖励时，应按孩子视角展示空态且不显示 CTA', async () => {
    const starService = {
      clearCache: jest.fn(),
      getTotalStars: jest.fn().mockResolvedValue(12)
    };
    const rewardService = {
      clearCache: jest.fn(),
      getAvailableRewards: jest.fn().mockResolvedValue([
        { id: 'reward_1_1', name: '示例奖励', points: 8, claimed: false, isExample: true }
      ]),
      calculateNextAvailableReward: jest.fn().mockResolvedValue({
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
      getLoginUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1' })),
      getLoginUserId: jest.fn(() => 'parent-1'),
      getCurrentUser: jest.fn(() => ({ role: 'child', userId: 'child-2', id: 'child-2' })),
      getUserByRole: jest.fn(() => ({ id: 'child-1' }))
    });

    const page = createPageInstance();
    page.getExpiringPoints = jest.fn().mockResolvedValue({ points: 0, date: '' });

    await page.loadRewardsData();

    expect(rewardService.getAvailableRewards).toHaveBeenCalledWith(true, false, 'parent-1');
    expect(page.data.rewardEmptyMode).toBe('child-explain');
    expect(page.data.rewardEmptyTitle).toBe('现在还没有可用奖励');
    expect(page.data.showManageRewardCTA).toBe(false);
    expect(page.data.availableRewards).toEqual([]);
    expect(page.data.claimedRewards).toEqual([]);
  });

  it('奖励查看、关闭、Tab 切换与领取前置校验应生效', () => {
    const page = createPageInstance();
    page.data.rewards = [
      { id: 'r1', name: '奖励1', points: 10, unlocked: false, claimed: false },
      { id: 'r2', name: '奖励2', points: 20, unlocked: true, claimed: true, claimStatus: 'claimed' },
      { id: 'r3', name: '奖励3', points: 30, unlocked: true, claimed: false }
    ];

    page.viewReward({ currentTarget: { dataset: { id: 'r1' } } });
    expect(page.data.showModal).toBe(true);
    expect(page.data.selectedReward.id).toBe('r1');

    page.closeModal();
    expect(page.data.showModal).toBe(false);

    page.switchTab({ currentTarget: { dataset: { tab: 'claimed' } } });
    expect(page.data.activeTab).toBe('claimed');

    page.data.selectedReward = page.data.rewards[0];
    page.claimReward({});
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '奖励尚未解锁'
    }));

    page.data.selectedReward = page.data.rewards[1];
    page.claimReward({});
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '奖励已兑换'
    }));

    page.data.selectedReward = page.data.rewards[2];
    page._performClaimReward = jest.fn();
    page.claimReward({});
    expect(page._performClaimReward).toHaveBeenCalledWith(page.data.rewards[2]);
  });

  it('应按当前设备视角解析孩子和奖励归属用户', () => {
    const page = createPageInstance();

    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ role: 'child', userId: 'child-self' })),
      getLoginUserId: jest.fn(() => 'child-self'),
      getCurrentUser: jest.fn(() => ({ role: 'child', userId: 'child-self', id: 'child-self' })),
      getUserByRole: jest.fn(() => ({ id: 'child-fallback' }))
    });
    expect(page._getEffectiveChildUserId()).toBe('child-self');
    expect(page._getRewardOwnerUserId()).toBe('child-self');

    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1' })),
      getLoginUserId: jest.fn(() => 'parent-1'),
      getCurrentUser: jest.fn(() => ({ role: 'parent', userId: 'parent-1', id: 'parent-1' })),
      getUserById: jest.fn((userId) => (userId === 'child-2' ? { id: 'child-2', role: 'child' } : null)),
      getUserByRole: jest.fn(() => ({ id: 'child-fallback' }))
    });
    expect(page._getEffectiveChildUserId()).toBe('child-2');
    expect(page._getRewardOwnerUserId()).toBe('parent-1');
    expect(page._getChildUserId()).toBe('child-2');
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
});
