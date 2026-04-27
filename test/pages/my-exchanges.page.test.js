jest.mock('../../services/service-manager', () => ({
  getService: jest.fn(),
  getUserService: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

describe('packageManage/pages/my-exchanges/my-exchanges', () => {
  let pageConfig;
  let serviceManager;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../packageManage/pages/my-exchanges/my-exchanges.js');
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
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ userId: 'child_1', role: 'child', familyId: 'family_1', name: '孩子1' })),
      getCurrentUser: jest.fn(() => ({ userId: 'child_1', role: 'child', familyId: 'family_1', name: '孩子1' })),
      getAllUsers: jest.fn(() => [
        { userId: 'parent_1', role: 'parent', familyId: 'family_1', name: '家长' },
        { userId: 'child_1', role: 'child', familyId: 'family_1', name: '孩子1' }
      ]),
      getUserByRole: jest.fn(() => ({ userId: 'child_1', role: 'child', familyId: 'family_1', name: '孩子1' }))
    });

    global.wx = {
      getStorageSync: jest.fn()
    };

    loadPageModule();
  });

  afterEach(() => {
    delete global.Page;
    delete global.wx;
  });

  it('应按 claimStatus 生成兑换记录展示字段并按最新时间排序', async () => {
    serviceManager.getService.mockReturnValue({
      getClaimedRewardsByExchangeUser: jest.fn().mockResolvedValue([
        {
          id: 'reward-claimed',
          name: '积木',
          points: 12,
          claimed: true,
          claimStatus: 'claimed',
          claimTime: 1000,
          fulfillmentMode: 'manual'
        },
        {
          id: 'reward-delivered',
          name: '乐高',
          points: 20,
          claimed: true,
          claimStatus: 'delivered',
          claimTime: 900,
          deliveryTime: 3000,
          fulfillmentMode: 'manual'
        }
      ])
    });

    const page = createPageInstance();
    await page.loadClaimedRewards();

    expect(page.data.claimedRewards).toHaveLength(2);
    expect(page.data.claimedRewards[0]).toEqual(expect.objectContaining({
      id: 'reward-delivered',
      statusLabel: '已发放',
      timeLabel: '发放时间',
      recordTimestamp: 3000
    }));
    expect(page.data.claimedRewards[1]).toEqual(expect.objectContaining({
      id: 'reward-claimed',
      statusLabel: '待发放',
      timeLabel: '兑换时间',
      recordTimestamp: 1000
    }));
  });

  it('服务失败时应从本地存储降级加载并保留待发放状态', async () => {
    serviceManager.getService.mockReturnValue({
      getClaimedRewardsByExchangeUser: jest.fn().mockRejectedValue(new Error('boom'))
    });
    global.wx.getStorageSync.mockReturnValue([
      {
        id: 'reward-local',
        name: '贴纸',
        points: 5,
        claimed: true,
        claimStatus: 'claimed',
        claimTime: 1500,
        exchangeUserId: 'child_1',
        familyId: 'family_1',
        fulfillmentMode: 'manual'
      }
    ]);

    const page = createPageInstance();
    await page.loadClaimedRewards();

    expect(page.data.claimedRewards).toEqual([
      expect.objectContaining({
        id: 'reward-local',
        statusLabel: '待发放',
        timeLabel: '兑换时间'
      })
    ]);
  });

  it('应只展示当前孩子自己的兑换记录', async () => {
    serviceManager.getService.mockReturnValue({
      getClaimedRewardsByExchangeUser: jest.fn().mockResolvedValue([
        {
          id: 'reward-self',
          name: '自己的奖励',
          points: 8,
          claimed: true,
          claimStatus: 'claimed',
          claimTime: 1200,
          exchangeUserId: 'child_1'
        }
      ])
    });

    const page = createPageInstance();
    await page.loadClaimedRewards();

    expect(page.data.claimedRewards).toHaveLength(1);
    expect(page.data.claimedRewards[0].id).toBe('reward-self');
  });

  it('单孩子家庭的旧兑换记录缺少 exchangeUserId 时也应归属到当前孩子', async () => {
    serviceManager.getService.mockReturnValue({
      getClaimedRewardsByExchangeUser: jest.fn().mockResolvedValue([
        {
          id: 'reward-legacy',
          name: '旧奖励',
          points: 8,
          claimed: true,
          claimStatus: 'claimed',
          claimTime: 1200,
          userId: 'parent_1',
          familyId: 'family_1'
        }
      ])
    });

    const page = createPageInstance();
    await page.loadClaimedRewards();

    expect(page.data.claimedRewards).toHaveLength(1);
    expect(page.data.claimedRewards[0]).toEqual(expect.objectContaining({
      id: 'reward-legacy',
      statusLabel: '待发放'
    }));
  });
});
