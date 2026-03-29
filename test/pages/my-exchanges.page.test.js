jest.mock('../../services/service-manager', () => ({
  getService: jest.fn()
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
      getClaimedRewards: jest.fn().mockResolvedValue([
        {
          id: 'reward-claimed',
          name: '积木',
          points: 12,
          claimed: true,
          claimStatus: 'claimed',
          claimTime: 1000
        },
        {
          id: 'reward-delivered',
          name: '乐高',
          points: 20,
          claimed: true,
          claimStatus: 'delivered',
          claimTime: 900,
          deliveryTime: 3000
        }
      ])
    });

    const page = createPageInstance();
    await page.loadClaimedRewards();

    expect(page.data.claimedRewards).toHaveLength(2);
    expect(page.data.claimedRewards[0]).toEqual(expect.objectContaining({
      id: 'reward-delivered',
      statusLabel: '已领取',
      timeLabel: '领取时间',
      recordTimestamp: 3000
    }));
    expect(page.data.claimedRewards[1]).toEqual(expect.objectContaining({
      id: 'reward-claimed',
      statusLabel: '待领取',
      timeLabel: '兑换时间',
      recordTimestamp: 1000
    }));
  });

  it('服务失败时应从本地存储降级加载并保留待领取状态', async () => {
    serviceManager.getService.mockReturnValue({
      getClaimedRewards: jest.fn().mockRejectedValue(new Error('boom'))
    });
    global.wx.getStorageSync.mockReturnValue([
      {
        id: 'reward-local',
        name: '贴纸',
        points: 5,
        claimed: true,
        claimStatus: 'claimed',
        claimTime: 1500
      }
    ]);

    const page = createPageInstance();
    await page.loadClaimedRewards();

    expect(page.data.claimedRewards).toEqual([
      expect.objectContaining({
        id: 'reward-local',
        statusLabel: '待领取',
        timeLabel: '兑换时间'
      })
    ]);
  });
});
