/**
 * reward-repository.test.js - Reward Repository 测试
 *
 * 测试 Reward Repository 的数据访问和业务逻辑
 */

const RewardRepository = require('../../repositories/reward-repository');
const { Reward, RewardStatus, RewardType } = require('../../models/reward');
const TestDataFactory = require('../utils/test-data-factory');

describe('Reward Repository', () => {
  let repository;
  let mockStorageAdapter;

  beforeEach(() => {
    jest.clearAllMocks();

    // 创建 Mock StorageAdapter
    mockStorageAdapter = {
      getAsync: jest.fn().mockResolvedValue([]),
      setAsync: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue(),
      clear: jest.fn().mockResolvedValue()
    };

    // 创建 Repository 实例，禁用缓存以简化测试
    repository = new RewardRepository(mockStorageAdapter, { useCache: false });
  });

  // ====== 初始化 ======
  describe('初始化', () => {
    it('应该正确初始化仓储', () => {
      expect(repository).toBeInstanceOf(RewardRepository);
    });

    it('应该设置默认的存储键', () => {
      expect(repository.storageKey).toBe('rewards');
    });
  });

  // ====== getAvailableRewards ======
  describe('getAvailableRewards', () => {
    it('应该返回可用的奖励', async () => {
      const mockRewards = [
        new Reward(TestDataFactory.createReward({
          id: 'reward_1',
          name: '可用奖励1',
          points: 10,
          enabled: true,
          claimed: false,
          isExample: false
        })),
        new Reward(TestDataFactory.createReward({
          id: 'reward_2',
          name: '可用奖励2',
          points: 20,
          enabled: true,
          claimed: false,
          isExample: false
        }))
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getAvailableRewards(false);

      expect(rewards.length).toBe(2);
      expect(rewards[0].enabled).toBe(true);
      expect(rewards[0].claimed).toBe(false);
    });

    it('应该过滤用户ID', async () => {
      const userId = 'user_123';
      const mockRewards = [
        new Reward(TestDataFactory.createReward({
          id: 'reward_1',
          userId: 'user_456',
          name: '其他用户奖励'
        })),
        new Reward(TestDataFactory.createReward({
          id: 'reward_2',
          userId: userId,
          name: '当前用户奖励'
        }))
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getAvailableRewards(false, userId);

      expect(rewards.length).toBe(1);
      expect(rewards[0].userId).toBe(userId);
    });

    it('有自定义奖励且不包含示例时，应该过滤掉示例奖励', async () => {
      const mockRewards = [
        new Reward(TestDataFactory.createReward({
          id: 'reward_1',
          name: '自定义奖励',
          enabled: true,
          claimed: false,
          isExample: false
        })),
        new Reward(TestDataFactory.createReward({
          id: 'reward_2',
          name: '示例奖励',
          enabled: true,
          claimed: false,
          isExample: true
        }))
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getAvailableRewards(false);

      expect(rewards.length).toBe(1);
      expect(rewards[0].isExample).toBe(false);
    });

    it('没有自定义奖励时，应该返回示例奖励', async () => {
      const mockRewards = [
        new Reward(TestDataFactory.createReward({
          id: 'reward_1',
          name: '示例奖励1',
          enabled: true,
          claimed: false,
          isExample: true
        })),
        new Reward(TestDataFactory.createReward({
          id: 'reward_2',
          name: '示例奖励2',
          enabled: true,
          claimed: false,
          isExample: true
        }))
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getAvailableRewards(true);

      expect(rewards.length).toBe(2);
      expect(rewards.every(r => r.isExample)).toBe(true);
    });

    it('应该过滤已禁用的奖励', async () => {
      const mockRewards = [
        new Reward(TestDataFactory.createReward({
          id: 'reward_1',
          name: '启用奖励',
          enabled: true,
          claimed: false
        })),
        new Reward(TestDataFactory.createReward({
          id: 'reward_2',
          name: '禁用奖励',
          enabled: false,
          claimed: false
        }))
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getAvailableRewards(false);

      expect(rewards.length).toBe(1);
      expect(rewards[0].enabled).toBe(true);
    });

    it('应该过滤已兑换的奖励', async () => {
      const mockRewards = [
        new Reward(TestDataFactory.createReward({
          id: 'reward_1',
          name: '未兑换奖励',
          enabled: true,
          claimed: false
        })),
        new Reward(TestDataFactory.createReward({
          id: 'reward_2',
          name: '已兑换奖励',
          enabled: true,
          claimed: true
        }))
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getAvailableRewards(false);

      expect(rewards.length).toBe(1);
      expect(rewards[0].claimed).toBe(false);
    });

    it('应该处理空存储', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const rewards = await repository.getAvailableRewards();

      expect(rewards).toEqual([]);
    });
  });

  // ====== getClaimedRewards ======
  describe('getClaimedRewards', () => {
    it('应该返回已兑换的奖励', async () => {
      const mockRewards = [
        new Reward(TestDataFactory.createReward({
          id: 'reward_1',
          name: '已兑换奖励',
          claimed: true,
          claimTime: Date.now()
        })),
        new Reward(TestDataFactory.createReward({
          id: 'reward_2',
          name: '未兑换奖励',
          claimed: false
        }))
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getClaimedRewards(false);

      expect(rewards.length).toBe(1);
      expect(rewards[0].claimed).toBe(true);
    });

    it('应该过滤用户ID', async () => {
      const userId = 'user_123';
      const mockRewards = [
        new Reward(TestDataFactory.createReward({
          id: 'reward_1',
          userId: 'user_456',
          claimed: true
        })),
        new Reward(TestDataFactory.createReward({
          id: 'reward_2',
          userId: userId,
          claimed: true
        }))
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getClaimedRewards(false, userId);

      expect(rewards.length).toBe(1);
      expect(rewards[0].userId).toBe(userId);
    });

    it('onlyPending=true时应该只返回待领取的奖励', async () => {
      const now = Date.now();
      const mockRewards = [
        new Reward({
          id: 'reward_1',
          name: '待领取奖励',
          claimed: true,
          claimTime: now,
          claimStatus: RewardStatus.CLAIMED
        }),
        new Reward({
          id: 'reward_2',
          name: '已领取奖励',
          claimed: true,
          claimTime: now,
          claimStatus: RewardStatus.DELIVERED,
          deliveryTime: now
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getClaimedRewards(true);

      expect(rewards.length).toBe(1);
      expect(rewards[0].isPending()).toBe(true);
    });
  });

  // ====== getDeliveredRewards ======
  describe('getDeliveredRewards', () => {
    it('应该返回已领取的奖励', async () => {
      const now = Date.now();
      const mockRewards = [
        new Reward({
          id: 'reward_1',
          name: '已领取奖励',
          claimed: true,
          claimTime: now,
          claimStatus: RewardStatus.DELIVERED,
          deliveryTime: now
        }),
        new Reward({
          id: 'reward_2',
          name: '待领取奖励',
          claimed: true,
          claimTime: now,
          claimStatus: RewardStatus.CLAIMED
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getDeliveredRewards();

      expect(rewards.length).toBe(1);
      expect(rewards[0].isDelivered()).toBe(true);
    });

    it('应该过滤用户ID', async () => {
      const userId = 'user_123';
      const now = Date.now();
      const mockRewards = [
        new Reward({
          id: 'reward_1',
          userId: 'user_456',
          claimStatus: RewardStatus.DELIVERED
        }),
        new Reward({
          id: 'reward_2',
          userId: userId,
          claimStatus: RewardStatus.DELIVERED
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getDeliveredRewards(userId);

      expect(rewards.length).toBe(1);
      expect(rewards[0].userId).toBe(userId);
    });

    it('应该处理空结果', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const rewards = await repository.getDeliveredRewards();

      expect(rewards).toEqual([]);
    });
  });

  // ====== getRewardsByPointsOrder ======
  describe('getRewardsByPointsOrder', () => {
    it('应该按星星数升序排序', async () => {
      const mockRewards = [
        new Reward(TestDataFactory.createReward({
          id: 'reward_1',
          name: '30星奖励',
          points: 30,
          enabled: true,
          claimed: false
        })),
        new Reward(TestDataFactory.createReward({
          id: 'reward_2',
          name: '10星奖励',
          points: 10,
          enabled: true,
          claimed: false
        })),
        new Reward(TestDataFactory.createReward({
          id: 'reward_3',
          name: '20星奖励',
          points: 20,
          enabled: true,
          claimed: false
        }))
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getRewardsByPointsOrder(true);

      expect(rewards[0].points).toBe(10);
      expect(rewards[1].points).toBe(20);
      expect(rewards[2].points).toBe(30);
    });

    it('应该按星星数降序排序', async () => {
      const mockRewards = [
        new Reward(TestDataFactory.createReward({
          id: 'reward_1',
          name: '10星奖励',
          points: 10,
          enabled: true,
          claimed: false
        })),
        new Reward(TestDataFactory.createReward({
          id: 'reward_2',
          name: '30星奖励',
          points: 30,
          enabled: true,
          claimed: false
        })),
        new Reward(TestDataFactory.createReward({
          id: 'reward_3',
          name: '20星奖励',
          points: 20,
          enabled: true,
          claimed: false
        }))
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getRewardsByPointsOrder(false);

      expect(rewards[0].points).toBe(30);
      expect(rewards[1].points).toBe(20);
      expect(rewards[2].points).toBe(10);
    });

    it('onlyAvailable=true时应该只返回可用的奖励', async () => {
      const mockRewards = [
        new Reward(TestDataFactory.createReward({
          id: 'reward_1',
          points: 10,
          enabled: true,
          claimed: false
        })),
        new Reward(TestDataFactory.createReward({
          id: 'reward_2',
          points: 20,
          enabled: true,
          claimed: true
        }))
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getRewardsByPointsOrder(true, true);

      expect(rewards.length).toBe(1);
      expect(rewards[0].claimed).toBe(false);
    });

    it('应该过滤用户ID', async () => {
      const userId = 'user_123';
      const mockRewards = [
        new Reward(TestDataFactory.createReward({
          id: 'reward_1',
          userId: 'user_456',
          points: 10,
          enabled: true,
          claimed: false
        })),
        new Reward(TestDataFactory.createReward({
          id: 'reward_2',
          userId: userId,
          points: 20,
          enabled: true,
          claimed: false
        }))
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getRewardsByPointsOrder(true, false, userId);

      expect(rewards.length).toBe(1);
      expect(rewards[0].userId).toBe(userId);
    });
  });

  // ====== getExchangeableRewards ======
  describe('getExchangeableRewards', () => {
    it('应该返回可兑换的奖励', async () => {
      const mockRewards = [
        new Reward(TestDataFactory.createReward({
          id: 'reward_1',
          name: '10星奖励',
          points: 10,
          enabled: true,
          claimed: false
        })),
        new Reward(TestDataFactory.createReward({
          id: 'reward_2',
          name: '20星奖励',
          points: 20,
          enabled: true,
          claimed: false
        })),
        new Reward(TestDataFactory.createReward({
          id: 'reward_3',
          name: '30星奖励',
          points: 30,
          enabled: true,
          claimed: false
        }))
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getExchangeableRewards(25);

      expect(rewards.length).toBe(2);
      expect(rewards.every(r => r.points <= 25)).toBe(true);
    });

    it('应该过滤用户ID', async () => {
      const userId = 'user_123';
      const mockRewards = [
        new Reward(TestDataFactory.createReward({
          id: 'reward_1',
          userId: 'user_456',
          points: 10,
          enabled: true,
          claimed: false
        })),
        new Reward(TestDataFactory.createReward({
          id: 'reward_2',
          userId: userId,
          points: 10,
          enabled: true,
          claimed: false
        }))
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getExchangeableRewards(20, userId);

      expect(rewards.length).toBe(1);
      expect(rewards[0].userId).toBe(userId);
    });

    it('应该处理无效的星星数', async () => {
      const rewards = await repository.getExchangeableRewards(-10);

      expect(rewards).toEqual([]);
    });

    it('应该处理0星星', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const rewards = await repository.getExchangeableRewards(0);

      expect(rewards).toEqual([]);
    });

    it('应该只返回可用的奖励', async () => {
      const mockRewards = [
        new Reward(TestDataFactory.createReward({
          id: 'reward_1',
          points: 10,
          enabled: true,
          claimed: false
        })),
        new Reward(TestDataFactory.createReward({
          id: 'reward_2',
          points: 10,
          enabled: false,
          claimed: false
        }))
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getExchangeableRewards(20);

      expect(rewards.length).toBe(1);
      expect(rewards[0].enabled).toBe(true);
    });
  });

  // ====== claimReward ======
  describe('claimReward', () => {
    it('应该成功兑换奖励', async () => {
      const reward = new Reward(TestDataFactory.createReward({
        id: 'reward_1',
        name: '测试奖励',
        points: 10,
        enabled: true,
        claimed: false
      }));

      mockStorageAdapter.getAsync.mockResolvedValue([reward]);
      mockStorageAdapter.setAsync.mockResolvedValue(reward);

      const claimedReward = await repository.claimReward('reward_1');

      expect(claimedReward).not.toBeNull();
      expect(claimedReward.claimed).toBe(true);
      expect(claimedReward.claimTime).toBeGreaterThan(0);
    });

    it('应该拒绝兑换无效ID的奖励', async () => {
      const claimedReward = await repository.claimReward('');

      expect(claimedReward).toBeNull();
    });

    it('应该拒绝兑换不存在的奖励', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const claimedReward = await repository.claimReward('non_existent');

      expect(claimedReward).toBeNull();
    });

    it('应该拒绝兑换已禁用的奖励', async () => {
      const reward = new Reward(TestDataFactory.createReward({
        id: 'reward_1',
        name: '禁用奖励',
        enabled: false,
        claimed: false
      }));

      mockStorageAdapter.getAsync.mockResolvedValue([reward]);

      const claimedReward = await repository.claimReward('reward_1');

      expect(claimedReward).toBeNull();
    });

    it('应该拒绝兑换已兑换的奖励', async () => {
      const reward = new Reward(TestDataFactory.createReward({
        id: 'reward_1',
        name: '已兑换奖励',
        enabled: true,
        claimed: true,
        claimTime: Date.now()
      }));

      mockStorageAdapter.getAsync.mockResolvedValue([reward]);

      const claimedReward = await repository.claimReward('reward_1');

      expect(claimedReward).toBeNull();
    });

    it('有自定义奖励时应该拒绝兑换示例奖励', async () => {
      const customReward = new Reward(TestDataFactory.createReward({
        id: 'reward_1',
        name: '自定义奖励',
        enabled: true,
        claimed: false,
        isExample: false
      }));

      const exampleReward = new Reward(TestDataFactory.createReward({
        id: 'reward_2',
        name: '示例奖励',
        enabled: true,
        claimed: false,
        isExample: true
      }));

      mockStorageAdapter.getAsync.mockResolvedValue([customReward, exampleReward]);

      const claimedReward = await repository.claimReward('reward_2');

      expect(claimedReward).toBeNull();
    });
  });

  // ====== deliverReward ======
  describe('deliverReward', () => {
    it('应该成功标记奖励为已领取', async () => {
      const now = Date.now();
      const reward = new Reward({
        id: 'reward_1',
        name: '测试奖励',
        claimed: true,
        claimTime: now,
        claimStatus: RewardStatus.CLAIMED
      });

      mockStorageAdapter.getAsync.mockResolvedValue([reward]);
      mockStorageAdapter.setAsync.mockResolvedValue(reward);

      const deliveredReward = await repository.deliverReward('reward_1');

      expect(deliveredReward).not.toBeNull();
      expect(deliveredReward.isDelivered()).toBe(true);
      expect(deliveredReward.deliveryTime).toBeGreaterThan(0);
    });

    it('应该拒绝标记无效ID的奖励', async () => {
      const deliveredReward = await repository.deliverReward('');

      expect(deliveredReward).toBeNull();
    });

    it('应该拒绝标记不存在的奖励', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const deliveredReward = await repository.deliverReward('non_existent');

      expect(deliveredReward).toBeNull();
    });

    it('应该拒绝标记未兑换的奖励', async () => {
      const reward = new Reward(TestDataFactory.createReward({
        id: 'reward_1',
        name: '未兑换奖励',
        claimed: false
      }));

      mockStorageAdapter.getAsync.mockResolvedValue([reward]);

      const deliveredReward = await repository.deliverReward('reward_1');

      expect(deliveredReward).toBeNull();
    });

    it('重复标记已领取的奖励应该返回原奖励', async () => {
      const now = Date.now();
      const reward = new Reward({
        id: 'reward_1',
        name: '已领取奖励',
        claimed: true,
        claimTime: now,
        claimStatus: RewardStatus.DELIVERED,
        deliveryTime: now
      });

      mockStorageAdapter.getAsync.mockResolvedValue([reward]);

      const deliveredReward = await repository.deliverReward('reward_1');

      expect(deliveredReward).not.toBeNull();
      expect(deliveredReward.isDelivered()).toBe(true);
    });
  });

  // ====== unclaimReward ======
  describe('unclaimReward', () => {
    it('应该成功取消奖励兑换', async () => {
      const now = Date.now();
      const reward = new Reward({
        id: 'reward_1',
        name: '已兑换奖励',
        claimed: true,
        claimTime: now,
        claimStatus: RewardStatus.CLAIMED
      });

      mockStorageAdapter.getAsync.mockResolvedValue([reward]);
      mockStorageAdapter.setAsync.mockResolvedValue(reward);

      const unclaimedReward = await repository.unclaimReward('reward_1');

      expect(unclaimedReward).not.toBeNull();
      expect(unclaimedReward.claimed).toBe(false);
      expect(unclaimedReward.claimTime).toBe(0);
    });

    it('应该拒绝取消无效ID的奖励', async () => {
      const unclaimedReward = await repository.unclaimReward('');

      expect(unclaimedReward).toBeNull();
    });

    it('应该拒绝取消不存在的奖励', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const unclaimedReward = await repository.unclaimReward('non_existent');

      expect(unclaimedReward).toBeNull();
    });

    it('已领取的奖励应该不能取消兑换', async () => {
      const now = Date.now();
      const reward = new Reward({
        id: 'reward_1',
        name: '已领取奖励',
        claimed: true,
        claimTime: now,
        claimStatus: RewardStatus.DELIVERED,
        deliveryTime: now
      });

      mockStorageAdapter.getAsync.mockResolvedValue([reward]);
      mockStorageAdapter.setAsync.mockResolvedValue(reward);

      const unclaimedReward = await repository.unclaimReward('reward_1');

      // 注意：根据Reward.unclaim()的实现，已领取的奖励不会被取消
      expect(unclaimedReward).not.toBeNull();
      expect(unclaimedReward.claimed).toBe(true);
    });
  });

  // ====== setRewardEnabled ======
  describe('setRewardEnabled', () => {
    it('应该成功启用奖励', async () => {
      const reward = new Reward(TestDataFactory.createReward({
        id: 'reward_1',
        name: '禁用奖励',
        enabled: false
      }));

      mockStorageAdapter.getAsync.mockResolvedValue([reward]);
      mockStorageAdapter.setAsync.mockResolvedValue(reward);

      const enabledReward = await repository.setRewardEnabled('reward_1', true);

      expect(enabledReward).not.toBeNull();
      expect(enabledReward.enabled).toBe(true);
    });

    it('应该成功禁用奖励', async () => {
      const reward = new Reward(TestDataFactory.createReward({
        id: 'reward_1',
        name: '启用奖励',
        enabled: true
      }));

      mockStorageAdapter.getAsync.mockResolvedValue([reward]);
      mockStorageAdapter.setAsync.mockResolvedValue(reward);

      const disabledReward = await repository.setRewardEnabled('reward_1', false);

      expect(disabledReward).not.toBeNull();
      expect(disabledReward.enabled).toBe(false);
    });

    it('应该拒绝设置无效ID的奖励', async () => {
      const updatedReward = await repository.setRewardEnabled('', true);

      expect(updatedReward).toBeNull();
    });

    it('应该拒绝设置不存在的奖励', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const updatedReward = await repository.setRewardEnabled('non_existent', true);

      expect(updatedReward).toBeNull();
    });
  });

  // ====== getDefaultRewards ======
  describe('getDefaultRewards', () => {
    it('应该返回默认奖励列表', async () => {
      const defaultRewards = await repository.getDefaultRewards();

      expect(defaultRewards.length).toBe(3);
      expect(defaultRewards.every(r => r.isExample)).toBe(true);
      expect(defaultRewards.every(r => r.enabled)).toBe(true);
    });

    it('默认奖励应该有不同的点数', async () => {
      const defaultRewards = await repository.getDefaultRewards();

      const points = defaultRewards.map(r => r.points);
      expect(points).toContain(10);
      expect(points).toContain(20);
      expect(points).toContain(30);
    });

    it('默认奖励应该有不同的图标', async () => {
      const defaultRewards = await repository.getDefaultRewards();

      expect(defaultRewards[0].icon).toBe('🎬');
      expect(defaultRewards[1].icon).toBe('🍪');
      expect(defaultRewards[2].icon).toBe('🎮');
    });
  });

  // ====== initializeDefaultRewards ======
  describe('initializeDefaultRewards', () => {
    it('应该初始化默认奖励当存储为空时', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const rewards = await repository.initializeDefaultRewards();

      expect(rewards.length).toBe(3);
      expect(mockStorageAdapter.setAsync).toHaveBeenCalled();
    });

    it('应该在已有奖励时跳过初始化', async () => {
      const existingRewards = [
        new Reward(TestDataFactory.createReward({ id: 'reward_1' }))
      ];
      mockStorageAdapter.getAsync.mockResolvedValue(existingRewards);

      const rewards = await repository.initializeDefaultRewards();

      expect(rewards.length).toBe(0);
      expect(mockStorageAdapter.setAsync).not.toHaveBeenCalled();
    });
  });

  // ====== ensureExampleRewardsEnabled ======
  describe('ensureExampleRewardsEnabled', () => {
    it('应该启用禁用的示例奖励', async () => {
      const mockRewards = [
        new Reward({
          id: 'reward_1',
          name: '禁用的示例奖励',
          enabled: false,
          isExample: true
        }),
        new Reward(TestDataFactory.createReward({
          id: 'reward_2',
          name: '启用的示例奖励',
          enabled: true,
          isExample: true
        }))
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);
      mockStorageAdapter.setAsync.mockResolvedValue({});

      const count = await repository.ensureExampleRewardsEnabled();

      expect(count).toBe(1);
      expect(mockStorageAdapter.setAsync).toHaveBeenCalled();
    });

    it('应该在没有禁用的示例奖励时返回0', async () => {
      const mockRewards = [
        new Reward({
          id: 'reward_1',
          name: '启用的示例奖励',
          enabled: true,
          isExample: true
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const count = await repository.ensureExampleRewardsEnabled();

      expect(count).toBe(0);
      expect(mockStorageAdapter.setAsync).not.toHaveBeenCalled();
    });

    it('应该忽略非示例奖励', async () => {
      const mockRewards = [
        new Reward({
          id: 'reward_1',
          name: '禁用的自定义奖励',
          enabled: false,
          isExample: false
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const count = await repository.ensureExampleRewardsEnabled();

      expect(count).toBe(0);
      expect(mockStorageAdapter.setAsync).not.toHaveBeenCalled();
    });
  });

  // ====== 边界场景 ======
  describe('边界场景', () => {
    it('应该处理空用户ID', async () => {
      const mockRewards = [
        new Reward(TestDataFactory.createReward({
          id: 'reward_1',
          userId: '',
          enabled: true,
          claimed: false
        }))
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getAvailableRewards(false, '');

      expect(rewards.length).toBe(1);
    });

    it('应该处理所有奖励都已兑换的情况', async () => {
      const mockRewards = [
        new Reward(TestDataFactory.createReward({
          id: 'reward_1',
          claimed: true
        })),
        new Reward(TestDataFactory.createReward({
          id: 'reward_2',
          claimed: true
        }))
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getAvailableRewards();

      expect(rewards).toEqual([]);
    });

    it('应该处理所有奖励都已禁用的情况', async () => {
      const mockRewards = [
        new Reward(TestDataFactory.createReward({
          id: 'reward_1',
          enabled: false,
          claimed: false
        })),
        new Reward(TestDataFactory.createReward({
          id: 'reward_2',
          enabled: false,
          claimed: false
        }))
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getAvailableRewards();

      expect(rewards).toEqual([]);
    });

    it('应该处理0星星的可兑换奖励查询', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const rewards = await repository.getExchangeableRewards(0);

      expect(rewards).toEqual([]);
    });

    it('应该处理极大星星数的可兑换奖励查询', async () => {
      const mockRewards = [
        new Reward(TestDataFactory.createReward({
          id: 'reward_1',
          points: 10,
          enabled: true,
          claimed: false
        })),
        new Reward(TestDataFactory.createReward({
          id: 'reward_2',
          points: 100,
          enabled: true,
          claimed: false
        }))
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockRewards);

      const rewards = await repository.getExchangeableRewards(999999);

      expect(rewards.length).toBe(2);
    });
  });

  // ====== 错误处理 ======
  describe('错误处理', () => {
    it('getAvailableRewards应该优雅处理存储错误', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));

      const rewards = await repository.getAvailableRewards();

      expect(rewards).toEqual([]);
    });

    it('getClaimedRewards应该优雅处理存储错误', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));

      const rewards = await repository.getClaimedRewards();

      expect(rewards).toEqual([]);
    });

    it('getDeliveredRewards应该优雅处理存储错误', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));

      const rewards = await repository.getDeliveredRewards();

      expect(rewards).toEqual([]);
    });

    it('getRewardsByPointsOrder应该优雅处理存储错误', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));

      const rewards = await repository.getRewardsByPointsOrder();

      expect(rewards).toEqual([]);
    });

    it('getExchangeableRewards应该优雅处理存储错误', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));

      const rewards = await repository.getExchangeableRewards(10);

      expect(rewards).toEqual([]);
    });

    it('claimReward应该优雅处理存储错误', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));

      const claimedReward = await repository.claimReward('reward_1');

      expect(claimedReward).toBeNull();
    });

    it('deliverReward应该优雅处理存储错误', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));

      const deliveredReward = await repository.deliverReward('reward_1');

      expect(deliveredReward).toBeNull();
    });

    it('unclaimReward应该优雅处理存储错误', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));

      const unclaimedReward = await repository.unclaimReward('reward_1');

      expect(unclaimedReward).toBeNull();
    });

    it('setRewardEnabled应该优雅处理存储错误', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));

      const updatedReward = await repository.setRewardEnabled('reward_1', true);

      expect(updatedReward).toBeNull();
    });

    it('initializeDefaultRewards应该优雅处理存储错误', async () => {
      // Mock count方法抛出错误
      jest.spyOn(repository, 'count').mockRejectedValue(new Error('存储错误'));

      const rewards = await repository.initializeDefaultRewards();

      expect(rewards).toEqual([]);

      // 清理spy
      repository.count.mockRestore();
    });

    it('ensureExampleRewardsEnabled应该优雅处理存储错误', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));

      const count = await repository.ensureExampleRewardsEnabled();

      expect(count).toBe(0);
    });
  });
});
