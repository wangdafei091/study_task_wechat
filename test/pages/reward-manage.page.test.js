jest.mock('../../services/service-manager', () => ({
  getService: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../utils/uiUtils', () => ({}));

describe('packageManage/pages/reward-manage/reward-manage', () => {
  let pageConfig;
  let serviceManager;
  let appMock;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../packageManage/pages/reward-manage/reward-manage.js');
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
    serviceManager = require('../../services/service-manager');

    appMock = {
      globalData: {
        needRefreshReward: false,
        eventBus: {
          emit: jest.fn()
        }
      }
    };
    global.getApp = jest.fn(() => appMock);

    global.wx = {
      showLoading: jest.fn(),
      hideLoading: jest.fn(),
      showToast: jest.fn(),
      getStorageSync: jest.fn(() => false),
      stopPullDownRefresh: jest.fn()
    };

    loadPageModule();
  });

  afterEach(() => {
    delete global.Page;
    delete global.getApp;
    delete global.wx;
  });

  it('loadRewardsData 应给奖励管理列表补齐兑换状态展示字段', async () => {
    const rewardService = {
      getAllRewards: jest.fn().mockResolvedValue([
        { id: 'available', name: '阅读券', points: 5, claimed: false, enabled: true },
        { id: 'claimed', name: '拼图', points: 10, claimed: true, claimStatus: 'claimed', enabled: true, claimTime: 1000 },
        { id: 'delivered', name: '电影夜', points: 15, claimed: true, claimStatus: 'delivered', enabled: true, claimTime: 900, deliveryTime: 2000 }
      ]),
      calculateNextAvailableReward: jest.fn(),
      hasCustomRewards: jest.fn().mockResolvedValue(true)
    };

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'rewardService') return rewardService;
      if (name === 'config') return { hasCustomRewards: jest.fn(() => true) };
      return null;
    });

    const page = createPageInstance();
    await page.loadRewardsData();

    expect(page.data.rewards).toHaveLength(3);
    expect(page.data.rewards[0].manageStatusLabel).toBe('');
    expect(page.data.rewards[1]).toEqual(expect.objectContaining({
      id: 'claimed',
      manageStatusLabel: '已兑换',
      claimDisplayStatus: 'claimed'
    }));
    expect(page.data.rewards[2]).toEqual(expect.objectContaining({
      id: 'delivered',
      manageStatusLabel: '已领取',
      claimDisplayStatus: 'delivered'
    }));
  });

  it('loadClaimedRecords 应生成兑换记录的时间和状态文案', async () => {
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'rewardService') {
        return {
          getClaimedRewards: jest.fn().mockResolvedValue([
            { id: 'claimed', name: '拼图', points: 10, claimed: true, claimStatus: 'claimed', claimTime: 1000 },
            { id: 'delivered', name: '电影夜', points: 15, claimed: true, claimStatus: 'delivered', claimTime: 900, deliveryTime: 2000 }
          ])
        };
      }
      return null;
    });

    const page = createPageInstance();
    await page.loadClaimedRecords();

    expect(page.data.claimedRecords).toHaveLength(2);
    expect(page.data.claimedRecords[0]).toEqual(expect.objectContaining({
      id: 'delivered',
      recordStatusLabel: '已领取',
      recordTimeLabel: '领取时间',
      recordTimestamp: 2000
    }));
    expect(page.data.claimedRecords[1]).toEqual(expect.objectContaining({
      id: 'claimed',
      recordStatusLabel: '待领取',
      recordTimeLabel: '兑换时间',
      recordTimestamp: 1000
    }));
  });

  it('onShow 检测到奖励变更标记时应强制刷新云端奖励', async () => {
    appMock.globalData.needRefreshReward = true;
    const rewardService = {
      refreshRewardsFromCloud: jest.fn().mockResolvedValue({ success: true })
    };

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'rewardService') return rewardService;
      return null;
    });

    const page = createPageInstance();
    page.loadRewardsData = jest.fn().mockResolvedValue();
    page.loadClaimedRecords = jest.fn().mockResolvedValue();

    await page.onShow();

    expect(rewardService.refreshRewardsFromCloud).toHaveBeenCalledWith({ force: true });
    expect(page.loadRewardsData).toHaveBeenCalled();
    expect(page.loadClaimedRecords).toHaveBeenCalled();
  });

  it('下拉刷新应强制拉取最新奖励并停止刷新动画', async () => {
    const rewardService = {
      refreshRewardsFromCloud: jest.fn().mockResolvedValue({ success: true })
    };

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'rewardService') return rewardService;
      return null;
    });

    const page = createPageInstance();
    page.loadRewardsData = jest.fn().mockResolvedValue();
    page.loadClaimedRecords = jest.fn().mockResolvedValue();

    await page.onPullDownRefresh();

    expect(rewardService.refreshRewardsFromCloud).toHaveBeenCalledWith({ force: true });
    expect(page.loadRewardsData).toHaveBeenCalled();
    expect(page.loadClaimedRecords).toHaveBeenCalled();
    expect(global.wx.stopPullDownRefresh).toHaveBeenCalled();
  });
});
