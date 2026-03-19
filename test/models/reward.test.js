/**
 * reward.test.js - Reward 领域模型测试
 *
 * 测试 Reward 模型的核心业务逻辑
 */

const { Reward, RewardStatus, RewardType } = require('../../models/reward');
const TestDataFactory = require('../utils/test-data-factory');

describe('Reward 领域模型', () => {
  // ====== 构造函数和默认值 ======
  describe('构造函数', () => {
    it('应该使用默认值创建奖励', () => {
      const reward = new Reward();

      expect(reward.id).toBeDefined();
      expect(reward.userId).toBe('');
      expect(reward.name).toBe('');
      expect(reward.type).toBe(RewardType.ITEM);
      expect(reward.points).toBe(0);
      expect(reward.enabled).toBe(true);
      expect(reward.claimed).toBe(false);
      expect(reward.isExample).toBe(false);
      expect(reward.tags).toEqual([]);
    });

    it('应该使用提供的数据创建奖励', () => {
      const data = TestDataFactory.createReward({
        name: '测试奖励',
        type: 'privilege',
        points: 100
      });

      const reward = new Reward(data);

      expect(reward.name).toBe('测试奖励');
      expect(reward.type).toBe('privilege');
      expect(reward.points).toBe(100);
    });

    it('应该根据claimed设置claimStatus', () => {
      const claimedReward = new Reward({ claimed: true });
      const unclaimedReward = new Reward({ claimed: false });

      expect(claimedReward.claimStatus).toBe(RewardStatus.CLAIMED);
      expect(unclaimedReward.claimStatus).toBe(RewardStatus.AVAILABLE);
    });

    it('应该支持自定义图标', () => {
      const reward = new Reward({ icon: '🎉' });

      expect(reward.icon).toBe('🎉');
    });
  });

  // ====== 验证方法 ======
  describe('validate', () => {
    it('空奖励应该返回验证错误', () => {
      const reward = new Reward({ name: '' });

      const errors = reward.validate();

      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain('奖励名称不能为空');
    });

    it('有效奖励应该通过验证', () => {
      const reward = new Reward(TestDataFactory.createReward({
        name: '有效奖励',
        points: 10
      }));

      const errors = reward.validate();

      expect(errors).toEqual([]);
    });

    it('负数星星应该返回验证错误', () => {
      const reward = new Reward({
        name: '测试奖励',
        points: -10
      });

      const errors = reward.validate();

      expect(errors).toContain('奖励所需星星数不能为负数');
    });

    it('已兑换但没有兑换时间应该返回错误', () => {
      const reward = new Reward({
        name: '测试奖励',
        claimed: true,
        claimTime: 0
      });

      const errors = reward.validate();

      expect(errors).toContain('已兑换的奖励必须有兑换时间');
    });

    it('0星星应该通过验证', () => {
      const reward = new Reward({
        name: '免费奖励',
        points: 0
      });

      const errors = reward.validate();

      expect(errors.length).toBe(0);
    });
  });

  // ====== isAvailable ======
  describe('isAvailable', () => {
    it('已启用且未领取的奖励应该可用', () => {
      const reward = new Reward(TestDataFactory.createReward({
        name: '可用奖励',
        enabled: true,
        claimed: false
      }));

      expect(reward.isAvailable()).toBe(true);
    });

    it('已禁用的奖励不应该可用', () => {
      const reward = new Reward(TestDataFactory.createReward({
        name: '禁用奖励',
        enabled: false,
        claimed: false
      }));

      expect(reward.isAvailable()).toBe(false);
    });

    it('已领取的奖励不应该可用', () => {
      const reward = new Reward(TestDataFactory.createReward({
        name: '已领取奖励',
        enabled: true,
        claimed: true
      }));

      expect(reward.isAvailable()).toBe(false);
    });

    it('有自定义奖励时示例奖励不可用', () => {
      const exampleReward = new Reward(TestDataFactory.createReward({
        name: '示例奖励',
        isExample: true,
        enabled: true,
        claimed: false
      }));

      expect(exampleReward.isAvailable(true)).toBe(false);
    });

    it('没有自定义奖励时示例奖励可用', () => {
      const exampleReward = new Reward(TestDataFactory.createReward({
        name: '示例奖励',
        isExample: true,
        enabled: true,
        claimed: false
      }));

      expect(exampleReward.isAvailable(false)).toBe(true);
    });

    it('非示例奖励不受hasCustomRewards影响', () => {
      const customReward = new Reward(TestDataFactory.createReward({
        name: '自定义奖励',
        isExample: false,
        enabled: true,
        claimed: false
      }));

      expect(customReward.isAvailable(true)).toBe(true);
    });
  });

  // ====== claim ======
  describe('claim', () => {
    it('应该正确兑换奖励', () => {
      const reward = new Reward(TestDataFactory.createReward({
        name: '待兑换奖励',
        enabled: true,
        claimed: false
      }));

      reward.claim();

      expect(reward.claimed).toBe(true);
      expect(reward.claimTime).toBeGreaterThan(0);
      expect(reward.claimStatus).toBe(RewardStatus.DELIVERED);
      expect(reward.deliveryTime).toBeGreaterThan(0);
    });

    it('已兑换的奖励不能重复兑换', () => {
      const originalClaimTime = Date.now() - 1000;
      const reward = new Reward(TestDataFactory.createReward({
        name: '已兑换奖励',
        claimed: true,
        claimTime: originalClaimTime
      }));

      reward.claim();

      expect(reward.claimTime).toBe(originalClaimTime); // 时间未变
    });

    it('已禁用的奖励不能兑换', () => {
      const reward = new Reward(TestDataFactory.createReward({
        name: '禁用奖励',
        enabled: false,
        claimed: false
      }));

      reward.claim();

      expect(reward.claimed).toBe(false);
      expect(reward.claimTime).toBe(0);
    });

    it('claim应该返回当前实例（链式调用）', () => {
      const reward = new Reward(TestDataFactory.createReward());

      const result = reward.claim();

      expect(result).toBe(reward);
    });
  });

  // ====== deliver ======
  describe('deliver', () => {
    it('应该标记奖励为已领取', () => {
      const reward = new Reward(TestDataFactory.createReward({
        name: '待领取奖励',
        claimed: true,
        claimStatus: RewardStatus.CLAIMED
      }));

      reward.deliver();

      expect(reward.claimStatus).toBe(RewardStatus.DELIVERED);
      expect(reward.deliveryTime).toBeGreaterThan(0);
    });

    it('未兑换的奖励不能标记为已领取', () => {
      const reward = new Reward(TestDataFactory.createReward({
        name: '未兑换奖励',
        claimed: false,
        claimStatus: RewardStatus.AVAILABLE
      }));

      reward.deliver();

      expect(reward.claimStatus).toBe(RewardStatus.AVAILABLE);
      expect(reward.deliveryTime).toBe(0);
    });

    it('deliver应该返回当前实例（链式调用）', () => {
      const reward = new Reward(TestDataFactory.createReward({
        claimed: true,
        claimStatus: RewardStatus.CLAIMED
      }));

      const result = reward.deliver();

      expect(result).toBe(reward);
    });
  });

  // ====== unclaim ======
  describe('unclaim', () => {
    it('应该取消已兑换的奖励', () => {
      const reward = new Reward(TestDataFactory.createReward({
        name: '待取消兑换奖励',
        claimed: true,
        claimStatus: RewardStatus.CLAIMED,
        claimTime: Date.now()
      }));

      reward.unclaim();

      expect(reward.claimed).toBe(false);
      expect(reward.claimTime).toBe(0);
      expect(reward.claimStatus).toBe(RewardStatus.AVAILABLE);
    });

    it('已领取的奖励不能取消兑换', () => {
      const originalClaimTime = Date.now() - 1000;
      const reward = new Reward(TestDataFactory.createReward({
        name: '已领取奖励',
        claimed: true,
        claimStatus: RewardStatus.DELIVERED,
        claimTime: originalClaimTime
      }));

      reward.unclaim();

      expect(reward.claimed).toBe(true);
      expect(reward.claimTime).toBe(originalClaimTime);
      expect(reward.claimStatus).toBe(RewardStatus.DELIVERED);
    });

    it('unclaim应该返回当前实例（链式调用）', () => {
      const reward = new Reward(TestDataFactory.createReward({
        claimed: true,
        claimStatus: RewardStatus.CLAIMED
      }));

      const result = reward.unclaim();

      expect(result).toBe(reward);
    });
  });

  // ====== enable 和 disable ======
  describe('enable 和 disable', () => {
    it('应该启用奖励', () => {
      const reward = new Reward(TestDataFactory.createReward({
        enabled: false
      }));

      reward.enable();

      expect(reward.enabled).toBe(true);
    });

    it('应该禁用奖励', () => {
      const reward = new Reward(TestDataFactory.createReward({
        enabled: true
      }));

      reward.disable();

      expect(reward.enabled).toBe(false);
    });

    it('enable应该返回当前实例（链式调用）', () => {
      const reward = new Reward(TestDataFactory.createReward());

      const result = reward.enable();

      expect(result).toBe(reward);
    });

    it('disable应该返回当前实例（链式调用）', () => {
      const reward = new Reward(TestDataFactory.createReward());

      const result = reward.disable();

      expect(result).toBe(reward);
    });
  });

  // ====== 状态检查方法 ======
  describe('状态检查方法', () => {
    it('isDelivered应该正确识别已领取奖励', () => {
      const deliveredReward = new Reward(TestDataFactory.createReward({
        claimStatus: RewardStatus.DELIVERED
      }));
      const pendingReward = new Reward(TestDataFactory.createReward({
        claimStatus: RewardStatus.CLAIMED
      }));

      expect(deliveredReward.isDelivered()).toBe(true);
      expect(pendingReward.isDelivered()).toBe(false);
    });

    it('isPending应该正确识别待领取奖励', () => {
      const pendingReward = new Reward(TestDataFactory.createReward({
        claimed: true,
        claimStatus: RewardStatus.CLAIMED
      }));
      const deliveredReward = new Reward(TestDataFactory.createReward({
        claimStatus: RewardStatus.DELIVERED
      }));
      const availableReward = new Reward(TestDataFactory.createReward({
        claimStatus: RewardStatus.AVAILABLE
      }));

      expect(pendingReward.isPending()).toBe(true);
      expect(deliveredReward.isPending()).toBe(false);
      expect(availableReward.isPending()).toBe(false);
    });
  });

  // ====== 克隆奖励 ======
  describe('clone', () => {
    it('应该克隆奖励并生成新ID', () => {
      const originalReward = new Reward(TestDataFactory.createReward({
        id: 'original_123',
        name: '原始奖励'
      }));

      const clonedReward = originalReward.clone();

      expect(clonedReward.id).not.toBe(originalReward.id);
      expect(clonedReward.name).toBe(originalReward.name);
      expect(clonedReward).not.toBe(originalReward); // 不是同一个对象
    });

    it('克隆的奖励应该重置状态', () => {
      const claimedReward = new Reward(TestDataFactory.createReward({
        id: 'original_123',
        claimed: true,
        claimTime: Date.now(),
        claimStatus: RewardStatus.DELIVERED,
        deliveryTime: Date.now()
      }));

      const clonedReward = claimedReward.clone();

      expect(clonedReward.claimed).toBe(false);
      expect(clonedReward.claimTime).toBe(0);
      expect(clonedReward.claimStatus).toBe(RewardStatus.AVAILABLE);
      expect(clonedReward.deliveryTime).toBe(0);
    });

    it('克隆奖励应该覆盖属性', () => {
      const originalReward = new Reward(TestDataFactory.createReward({
        id: 'original_123',
        name: '原始奖励',
        points: 10
      }));

      const clonedReward = originalReward.clone({
        name: '新奖励',
        points: 20
      });

      expect(clonedReward.name).toBe('新奖励');
      expect(clonedReward.points).toBe(20);
    });

    it('克隆奖励可以选择不生成新ID', () => {
      const originalReward = new Reward(TestDataFactory.createReward({
        id: 'original_123'
      }));

      const clonedReward = originalReward.clone({}, false);

      expect(clonedReward.id).toBe('original_123');
    });

    it('克隆应该复制所有属性', () => {
      const originalReward = new Reward(TestDataFactory.createReward({
        name: '测试奖励',
        description: '描述',
        type: 'privilege',
        points: 15,
        icon: '🎁',
        tags: ['tag1', 'tag2']
      }));

      const clonedReward = originalReward.clone();

      expect(clonedReward.name).toBe('测试奖励');
      expect(clonedReward.description).toBe('描述');
      expect(clonedReward.type).toBe('privilege');
      expect(clonedReward.points).toBe(15);
      expect(clonedReward.icon).toBe('🎁');
      expect(clonedReward.tags).toEqual(['tag1', 'tag2']);
    });

    it('克隆应该复制保护相关属性', () => {
      const originalReward = new Reward(TestDataFactory.createReward({
        protectedByExpiry: true,
        partialProtection: 50
      }));

      const clonedReward = originalReward.clone();

      expect(clonedReward.protectedByExpiry).toBe(true);
      expect(clonedReward.partialProtection).toBe(50);
    });
  });

  // ====== 边界场景 ======
  describe('边界场景', () => {
    it('应该处理enabled为undefined', () => {
      const reward = new Reward({ enabled: undefined });

      expect(reward.enabled).toBe(true); // 默认值
    });

    it('应该处理tags为undefined', () => {
      const reward = new Reward({ tags: undefined });

      expect(reward.tags).toEqual([]);
    });

    it('应该处理notes为空字符串', () => {
      const reward = new Reward({ notes: '' });

      expect(reward.notes).toBe('');
    });

    it('应该处理部分保护金额为0', () => {
      const reward = new Reward({
        name: '测试奖励',
        partialProtection: 0
      });

      expect(reward.partialProtection).toBe(0);
    });

    it('应该处理isExample为true', () => {
      const reward = new Reward({
        name: '示例奖励',
        isExample: true
      });

      expect(reward.isExample).toBe(true);
    });
  });

  // ====== 保护属性 ======
  describe('保护属性', () => {
    it('应该支持设置protectedByExpiry', () => {
      const reward = new Reward(TestDataFactory.createReward({
        protectedByExpiry: true
      }));

      expect(reward.protectedByExpiry).toBe(true);
    });

    it('应该支持设置partialProtection', () => {
      const reward = new Reward(TestDataFactory.createReward({
        partialProtection: 30
      }));

      expect(reward.partialProtection).toBe(30);
    });

    it('应该同时支持两种保护方式', () => {
      const reward = new Reward(TestDataFactory.createReward({
        protectedByExpiry: true,
        partialProtection: 50
      }));

      expect(reward.protectedByExpiry).toBe(true);
      expect(reward.partialProtection).toBe(50);
    });
  });
});
