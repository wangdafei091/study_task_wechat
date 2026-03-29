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

    global.getApp = jest.fn(() => ({
      globalData: {
        eventBus: {
          emit: jest.fn()
        }
      }
    }));

    global.wx = {
      showLoading: jest.fn(),
      hideLoading: jest.fn(),
      showToast: jest.fn(),
      getStorageSync: jest.fn(() => false)
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
});
