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

const serviceManager = require('../../services/service-manager');
const rewardsAnimationModule = require('../../pages/rewards/modules/rewards-animation');
const rewardsUserContextModule = require('../../pages/rewards/modules/rewards-user-context');
const rewardsSyncModule = require('../../pages/rewards/modules/rewards-sync');
const rewardsExchangeFlowModule = require('../../pages/rewards/modules/rewards-exchange-flow');

describe('pages/rewards helper modules', () => {
  let appMock;

  beforeEach(() => {
    jest.clearAllMocks();

    global.wx = {
      showToast: jest.fn(),
      showLoading: jest.fn(),
      hideLoading: jest.fn(),
      stopPullDownRefresh: jest.fn(),
      showModal: jest.fn(({ success }) => {
        if (typeof success === 'function') {
          success({ confirm: true, cancel: false });
        }
      })
    };

    appMock = {
      globalData: {
        needRefreshReward: false,
        hasRedirectedToReward: false,
        lastActiveChildId: 'child-2',
        eventBus: {
          on: jest.fn(),
          off: jest.fn()
        }
      }
    };

    global.getApp = jest.fn(() => appMock);
  });

  afterEach(() => {
    delete global.wx;
    delete global.getApp;
  });

  it('rewards-animation 应使用稳定回调注册和解绑进度条事件', () => {
    const page = {
      data: {},
      handleProgressBarComplete: jest.fn()
    };

    rewardsAnimationModule.setupProgressBarListener(page);
    rewardsAnimationModule.setupProgressBarListener(page);
    rewardsAnimationModule.teardownProgressBarListener(page);
    rewardsAnimationModule.teardownProgressBarListener(page);

    expect(appMock.globalData.eventBus.on).toHaveBeenCalledTimes(1);
    expect(appMock.globalData.eventBus.off).toHaveBeenCalledTimes(1);
    expect(appMock.globalData.eventBus.off).toHaveBeenCalledWith(
      expect.any(String),
      appMock.globalData.eventBus.on.mock.calls[0][1]
    );
  });

  it('rewards-user-context 在家长视角下应优先回退最近活跃孩子', () => {
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ id: 'parent-1', userId: 'parent-1', role: 'parent' })),
      getCurrentUser: jest.fn(() => ({ id: 'parent-1', userId: 'parent-1', role: 'parent' })),
      getAllUsers: jest.fn(() => [
        { id: 'parent-1', userId: 'parent-1', role: 'parent' },
        { id: 'child-1', userId: 'child-1', role: 'child' },
        { id: 'child-2', userId: 'child-2', role: 'child' }
      ]),
      getUserById: jest.fn((id) => ({ id, userId: id, role: id.startsWith('child') ? 'child' : 'parent' })),
      getUserByRole: jest.fn(() => ({ id: 'child-1', userId: 'child-1', role: 'child' }))
    });

    const childUserId = rewardsUserContextModule.getEffectiveChildUserId(serviceManager);

    expect(childUserId).toBe('child-2');
  });

  it('rewards-sync onPullDownRefresh 应强制拉取 authority 和奖励数据并停止下拉动画', async () => {
    const starService = {
      syncExpiryAuthorityIfNeeded: jest.fn().mockResolvedValue({}),
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

    const page = {
      _getEffectiveChildUserId: jest.fn(() => 'child-1'),
      loadRewardsData: jest.fn().mockResolvedValue()
    };

    await rewardsSyncModule.onPullDownRefresh(page);

    expect(starService.syncExpiryAuthorityIfNeeded).toHaveBeenCalledWith({
      scope: 'user',
      userId: 'child-1',
      force: true
    });
    expect(rewardService.refreshRewardsFromCloud).toHaveBeenCalledWith({
      force: true,
      userId: 'child-1'
    });
    expect(page.loadRewardsData).toHaveBeenCalledWith(true);
    expect(global.wx.stopPullDownRefresh).toHaveBeenCalled();
  });

  it('rewards-sync getExpiringPoints 应在正式提醒同步后读取孩子即将过期星星', async () => {
    const starService = {
      getExpiringStarsInfo: jest.fn().mockResolvedValue({
        points: 4,
        expiryDateText: '明天',
        expiryTimestamp: 123
      })
    };
    const messageService = {
      syncFormalRemindersIfNeeded: jest.fn().mockResolvedValue({})
    };

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'starService') return starService;
      if (name === 'messageService') return messageService;
      return null;
    });

    const page = {
      _getEffectiveChildUserId: jest.fn(() => 'child-1')
    };

    await expect(rewardsSyncModule.getExpiringPoints(page)).resolves.toEqual({
      points: 4,
      date: '明天'
    });
    expect(messageService.syncFormalRemindersIfNeeded).toHaveBeenCalledWith({
      scope: 'user',
      userId: 'child-1'
    });
  });

  it('rewards-exchange-flow handleExchangeSuccess 应清缓存、刷新数据并设置 skip 标记', async () => {
    const starService = {
      clearCache: jest.fn(),
      getTotalStars: jest.fn().mockResolvedValue(8)
    };
    const rewardService = {
      clearCache: jest.fn(),
      calculateNextAvailableReward: jest.fn().mockResolvedValue({
        id: 'reward-next',
        name: '新奖励',
        points: 10
      })
    };

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'starService') return starService;
      if (name === 'rewardService') return rewardService;
      return null;
    });

    const page = {
      data: { showModal: true, nextReward: null },
      _skipNextOnShowRefresh: false,
      _getRewardOwnerUserId: jest.fn(() => 'parent-1'),
      _getEffectiveChildUserId: jest.fn(() => 'child-1'),
      loadRewardsData: jest.fn().mockResolvedValue(),
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
    };

    await rewardsExchangeFlowModule.handleExchangeSuccess(page, { success: true }, { id: 'reward-1' }, 'child-1');

    expect(starService.clearCache).toHaveBeenCalled();
    expect(rewardService.clearCache).toHaveBeenCalled();
    expect(page.data.showModal).toBe(false);
    expect(page.data.nextReward).toEqual(expect.objectContaining({ id: 'reward-next' }));
    expect(page.loadRewardsData).toHaveBeenCalledWith(true);
    expect(page._skipNextOnShowRefresh).toBe(true);
  });

  it('rewards-exchange-flow handleExchangeSuccess 在无下一个奖励时应写入 null', async () => {
    const starService = {
      clearCache: jest.fn(),
      getTotalStars: jest.fn().mockResolvedValue(0)
    };
    const rewardService = {
      clearCache: jest.fn(),
      calculateNextAvailableReward: jest.fn().mockResolvedValue(null)
    };

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'starService') return starService;
      if (name === 'rewardService') return rewardService;
      return null;
    });

    const page = {
      data: { showModal: true, nextReward: { id: 'old' } },
      _skipNextOnShowRefresh: false,
      _getRewardOwnerUserId: jest.fn(() => 'parent-1'),
      _getEffectiveChildUserId: jest.fn(() => 'child-1'),
      loadRewardsData: jest.fn().mockResolvedValue(),
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
    };

    await rewardsExchangeFlowModule.handleExchangeSuccess(page, { success: true }, { id: 'reward-last' }, 'child-1');

    expect(page.data.nextReward).toBeNull();
    expect(page.loadRewardsData).toHaveBeenCalledWith(true);
  });

  it('rewards-exchange-flow buildRewardExchangeMeta 应正确识别完全保护奖励', () => {
    expect(rewardsExchangeFlowModule.buildRewardExchangeMeta({
      name: '保护奖励',
      points: 8,
      protectedByExpiry: true,
      actualCost: 0
    })).toEqual(expect.objectContaining({
      kind: 'fully_protected',
      skipAnimation: true,
      actualCost: 0
    }));
  });
});
