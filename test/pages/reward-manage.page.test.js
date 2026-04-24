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
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ userId: 'parent_1', role: 'parent', familyId: 'family_1', name: '家长' })),
      getCurrentUser: jest.fn(() => ({ userId: 'parent_1', role: 'parent', familyId: 'family_1', name: '家长' })),
      getAllUsers: jest.fn(() => [
        { userId: 'parent_1', role: 'parent', familyId: 'family_1', name: '家长' },
        { userId: 'child_1', role: 'child', familyId: 'family_1', name: '孩子1' }
      ]),
      getUserById: jest.fn((userId) => (
        userId === 'child_1'
          ? { userId: 'child_1', role: 'child', familyId: 'family_1', name: '孩子1' }
          : { userId: 'parent_1', role: 'parent', familyId: 'family_1', name: '家长' }
      ))
    });

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
      navigateBack: jest.fn(),
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

  it('loadRewardsData 应只保留家庭下可管理正式奖励并记录 rewardFamilyId', async () => {
    const rewardService = {
      getRewardManageFamilyViewModel: jest.fn().mockResolvedValue({
        familyId: 'family_1',
        manageableRewards: [
          { id: 'available', name: '阅读券', points: 5, claimed: false, enabled: true },
          { id: 'disabled', name: '电影票', points: 8, claimed: false, enabled: false }
        ],
        exampleTemplates: [
          { id: 'reward_example_1', name: '示例奖励', points: 10, claimed: false, enabled: true, isExample: true }
        ]
      })
    };

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'rewardService') return rewardService;
      return null;
    });

    const page = createPageInstance();
    await page.loadRewardsData();

    expect(rewardService.getRewardManageFamilyViewModel).toHaveBeenCalledWith({
      familyId: 'family_1',
      memberUserIds: ['parent_1', 'child_1'],
      childUserIds: ['child_1'],
      loginUserId: 'parent_1',
      viewUserId: 'parent_1'
    });
    expect(page.data.rewardFamilyId).toBe('family_1');
    expect(page.data.rewards).toHaveLength(2);
    expect(page.data.rewards[0].manageStatusLabel).toBe('');
    expect(page.data.rewards[1]).toEqual(expect.objectContaining({
      id: 'disabled',
      enabled: false,
      claimDisplayStatus: 'available'
    }));
    expect(page.data.exampleTemplates).toHaveLength(1);
  });

  it('loadClaimedRecords 应生成兑换记录的时间和状态文案', async () => {
    const rewardService = {
      getFamilyClaimedRewards: jest.fn().mockResolvedValue([
        { id: 'claimed', name: '拼图', points: 10, claimed: true, claimStatus: 'claimed', claimTime: 1000, exchangeUserId: 'child_1', fulfillmentMode: 'manual' },
        { id: 'delivered', name: '电影夜', points: 15, claimed: true, claimStatus: 'delivered', claimTime: 900, deliveryTime: 2000, exchangeUserId: 'child_1', fulfillmentMode: 'manual' }
      ])
    };

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'rewardService') return rewardService;
      return null;
    });

    const page = createPageInstance();
    await page.loadClaimedRecords();

    expect(rewardService.getFamilyClaimedRewards).toHaveBeenCalledWith({
      familyId: 'family_1',
      memberUserIds: ['parent_1', 'child_1'],
      childUserIds: ['child_1'],
      loginUserId: 'parent_1',
      viewUserId: 'parent_1'
    });
    expect(page.data.claimedRecords).toHaveLength(2);
    expect(page.data.claimedRecords[0]).toEqual(expect.objectContaining({
      id: 'delivered',
      exchangeUserLabel: '孩子1',
      recordStatusLabel: '已发放',
      recordTimeLabel: '发放时间',
      recordTimestamp: 2000
    }));
    expect(page.data.claimedRecords[1]).toEqual(expect.objectContaining({
      id: 'claimed',
      recordStatusLabel: '待发放',
      recordTimeLabel: '兑换时间',
      recordTimestamp: 1000,
      canMarkDelivered: true
    }));
  });

  it('showClaimedRewardActions 应暴露待发放记录的发放与复用动作', () => {
    const page = createPageInstance();
    page.data.claimedRecords = [
      { id: 'claimed', name: '拼图', claimed: true, claimStatus: 'claimed', fulfillmentMode: 'manual' }
    ];

    page.showClaimedRewardActions({ currentTarget: { dataset: { id: 'claimed' } } });

    expect(page.data.showActionSheet).toBe(true);
    expect(page.data.selectedReward).toEqual(expect.objectContaining({ id: 'claimed' }));
    expect(page.data.actionSheetActions).toEqual([
      expect.objectContaining({ key: 'deliver', label: '标记已发放' }),
      expect.objectContaining({ key: 'reactivate', label: '重新添加到奖池' })
    ]);
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

  it('孩子或只读视角进入奖励管理页时应拦截并返回', async () => {
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ userId: 'parent_1', role: 'parent', familyId: 'family_1', name: '家长' })),
      getCurrentUser: jest.fn(() => ({ userId: 'child_1', role: 'child', familyId: 'family_1', name: '孩子1' })),
      getAllUsers: jest.fn(() => [
        { userId: 'parent_1', role: 'parent', familyId: 'family_1', name: '家长' },
        { userId: 'child_1', role: 'child', familyId: 'family_1', name: '孩子1' }
      ])
    });

    const page = createPageInstance();
    page.loadRewardsData = jest.fn().mockResolvedValue();
    page.loadClaimedRecords = jest.fn().mockResolvedValue();

    await page.onLoad({});

    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '当前视角不可管理奖励'
    }));
    expect(global.wx.navigateBack).toHaveBeenCalledWith({ delta: 1 });
    expect(page.loadRewardsData).not.toHaveBeenCalled();
    expect(page.loadClaimedRecords).not.toHaveBeenCalled();
  });

  it('只读视角下不应打开新增奖励弹窗或执行发放动作', async () => {
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ userId: 'child_1', role: 'child', familyId: 'family_1', name: '孩子1' })),
      getCurrentUser: jest.fn(() => ({ userId: 'child_1', role: 'child', familyId: 'family_1', name: '孩子1' })),
      getAllUsers: jest.fn(() => [
        { userId: 'child_1', role: 'child', familyId: 'family_1', name: '孩子1' }
      ])
    });

    const rewardService = {
      markRewardAsDelivered: jest.fn()
    };
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'rewardService') return rewardService;
      return null;
    });

    const page = createPageInstance();
    page.data.selectedReward = {
      id: 'claimed',
      name: '拼图',
      claimed: true,
      claimStatus: 'claimed',
      fulfillmentMode: 'manual'
    };

    page.showAddRewardModal();
    await page.markRewardAsDelivered();

    expect(page.data.showRewardModal).toBe(false);
    expect(rewardService.markRewardAsDelivered).not.toHaveBeenCalled();
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '当前视角不可管理奖励'
    }));
  });

  it('markRewardAsDelivered 成功后应刷新记录并提示成功', async () => {
    const rewardService = {
      markRewardAsDelivered: jest.fn().mockResolvedValue({
        success: true,
        reward: {
          id: 'claimed',
          claimStatus: 'delivered',
          deliveryTime: 2000
        }
      })
    };
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'rewardService') return rewardService;
      return null;
    });

    const page = createPageInstance();
    page.loadClaimedRecords = jest.fn().mockResolvedValue();
    page.data.selectedReward = {
      id: 'claimed',
      name: '拼图',
      claimed: true,
      claimStatus: 'claimed',
      fulfillmentMode: 'manual'
    };
    page.setData({
      showConfirmDialog: true
    });

    await page.markRewardAsDelivered();

    expect(rewardService.markRewardAsDelivered).toHaveBeenCalledWith('claimed');
    expect(page.loadClaimedRecords).toHaveBeenCalled();
    expect(page.data.showConfirmDialog).toBe(false);
    expect(page.data.selectedReward).toBeNull();
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '已标记发放'
    }));
  });
});
