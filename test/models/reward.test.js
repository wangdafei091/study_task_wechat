/**
 * Reward模型单元测试
 */

const { Reward, RewardStatus, RewardType } = require('../../models/reward');

describe('Reward Model', () => {
  // 测试模型创建
  describe('创建奖励', () => {
    test('使用完整数据创建奖励', () => {
      const data = {
        id: 'reward_123',
        name: '测试奖励',
        description: '这是一个测试奖励',
        type: RewardType.ITEM,
        points: 50,
        icon: '🎁',
        enabled: true,
        tags: ['test', 'reward']
      };
      
      const reward = new Reward(data);
      
      // 验证基本属性
      expect(reward.id).toBe('reward_123');
      expect(reward.name).toBe('测试奖励');
      expect(reward.description).toBe('这是一个测试奖励');
      expect(reward.type).toBe(RewardType.ITEM);
      expect(reward.points).toBe(50);
      expect(reward.icon).toBe('🎁');
      expect(reward.enabled).toBe(true);
      expect(reward.tags).toEqual(['test', 'reward']);
      
      // 验证默认状态
      expect(reward.claimed).toBe(false);
      expect(reward.claimStatus).toBe(RewardStatus.AVAILABLE);
    });
    
    test('使用最小数据创建奖励(使用默认值)', () => {
      const reward = new Reward({ name: '简单奖励' });
      
      // 验证必要属性
      expect(reward.name).toBe('简单奖励');
      
      // 验证默认值
      expect(reward.id).toMatch(/^reward_\d+_\d+$/); // ID格式检查
      expect(reward.description).toBe('');
      expect(reward.type).toBe(RewardType.ITEM);
      expect(reward.points).toBe(0);
      expect(reward.icon).toBe('🎁');
      expect(reward.enabled).toBe(true);
      expect(reward.claimed).toBe(false);
      expect(reward.tags).toEqual([]);
    });
  });
  
  // 测试数据验证
  describe('数据验证', () => {
    test('有效数据应通过验证', () => {
      const reward = new Reward({
        name: '有效奖励',
        points: 10
      });
      
      const errors = reward.validate();
      expect(errors).toHaveLength(0);
    });
    
    test('无名称应失败验证', () => {
      const reward = new Reward({
        points: 10
      });
      
      const errors = reward.validate();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('名称不能为空');
    });
    
    test('负星星数应失败验证', () => {
      const reward = new Reward({
        name: '无效奖励',
        points: -5
      });
      
      const errors = reward.validate();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('星星数不能为负数');
    });
  });
  
  // 测试状态转换
  describe('状态转换', () => {
    test('兑换奖励', () => {
      const reward = new Reward({
        name: '可兑换奖励',
        points: 20
      });
      
      // 执行兑换
      reward.claim();
      
      // 验证状态变化
      expect(reward.claimed).toBe(true);
      expect(reward.claimStatus).toBe(RewardStatus.CLAIMED);
      expect(reward.claimTime).toBeGreaterThan(0);
    });
    
    test('标记已领取', () => {
      const reward = new Reward({
        name: '已兑换奖励',
        points: 20,
        claimed: true,
        claimStatus: RewardStatus.CLAIMED,
        claimTime: Date.now() - 1000
      });
      
      // 标记为已领取
      reward.deliver();
      
      // 验证状态变化
      expect(reward.claimed).toBe(true);
      expect(reward.claimStatus).toBe(RewardStatus.DELIVERED);
      expect(reward.deliveryTime).toBeGreaterThan(0);
    });
    
    test('未兑换不能标记为已领取', () => {
      const reward = new Reward({
        name: '未兑换奖励',
        points: 20
      });
      
      // 尝试标记为已领取
      reward.deliver();
      
      // 验证状态未变化
      expect(reward.claimed).toBe(false);
      expect(reward.claimStatus).toBe(RewardStatus.AVAILABLE);
      expect(reward.deliveryTime).toBe(0);
    });
    
    test('启用和禁用奖励', () => {
      const reward = new Reward({
        name: '可控制奖励',
        points: 30,
        enabled: false
      });
      
      // 启用奖励
      reward.enable();
      expect(reward.enabled).toBe(true);
      
      // 禁用奖励
      reward.disable();
      expect(reward.enabled).toBe(false);
    });
    
    test('示例奖励不能禁用', () => {
      const reward = new Reward({
        name: '示例奖励',
        points: 10,
        isExample: true
      });
      
      // 尝试禁用
      reward.disable();
      
      // 验证仍然启用
      expect(reward.enabled).toBe(true);
    });
    
    test('取消兑换', () => {
      const reward = new Reward({
        name: '已兑换奖励',
        points: 20,
        claimed: true,
        claimStatus: RewardStatus.CLAIMED,
        claimTime: Date.now() - 1000
      });
      
      // 取消兑换
      reward.unclaim();
      
      // 验证状态
      expect(reward.claimed).toBe(false);
      expect(reward.claimStatus).toBe(RewardStatus.AVAILABLE);
      expect(reward.claimTime).toBe(0);
    });
    
    test('已领取奖励不能取消兑换', () => {
      const reward = new Reward({
        name: '已领取奖励',
        points: 20,
        claimed: true,
        claimStatus: RewardStatus.DELIVERED,
        claimTime: Date.now() - 2000,
        deliveryTime: Date.now() - 1000
      });
      
      // 尝试取消兑换
      reward.unclaim();
      
      // 验证状态未变化
      expect(reward.claimed).toBe(true);
      expect(reward.claimStatus).toBe(RewardStatus.DELIVERED);
    });
  });
  
  // 测试功能方法
  describe('功能方法', () => {
    test('isAvailable() - 可用状态', () => {
      const reward = new Reward({
        name: '可用奖励',
        enabled: true,
        claimed: false
      });
      
      expect(reward.isAvailable()).toBe(true);
    });
    
    test('isAvailable() - 禁用状态', () => {
      const reward = new Reward({
        name: '禁用奖励',
        enabled: false,
        claimed: false
      });
      
      expect(reward.isAvailable()).toBe(false);
    });
    
    test('isAvailable() - 已兑换状态', () => {
      const reward = new Reward({
        name: '已兑换奖励',
        enabled: true,
        claimed: true
      });
      
      expect(reward.isAvailable()).toBe(false);
    });
    
    test('getStatusDescription() - 状态描述', () => {
      // 可用状态
      const availableReward = new Reward({
        name: '可用奖励',
        enabled: true,
        claimed: false
      });
      expect(availableReward.getStatusDescription()).toContain('可兑换');
      
      // 已兑换状态
      const claimedReward = new Reward({
        name: '已兑换奖励',
        claimed: true,
        claimStatus: RewardStatus.CLAIMED
      });
      expect(claimedReward.getStatusDescription()).toContain('已兑换');
      
      // 已领取状态
      const deliveredReward = new Reward({
        name: '已领取奖励',
        claimed: true,
        claimStatus: RewardStatus.DELIVERED
      });
      expect(deliveredReward.getStatusDescription()).toContain('已领取');
    });
    
    test('clone() - 克隆对象', () => {
      const original = new Reward({
        name: '原始奖励',
        description: '描述信息',
        points: 15,
        tags: ['tag1', 'tag2']
      });
      
      // 克隆并修改部分属性
      const clone = original.clone({
        name: '克隆奖励',
        points: 20
      });
      
      // 验证克隆和覆盖
      expect(clone.name).toBe('克隆奖励'); // 被覆盖
      expect(clone.points).toBe(20); // 被覆盖
      expect(clone.description).toBe('描述信息'); // 保持不变
      expect(clone.tags).toEqual(['tag1', 'tag2']); // 保持不变
      expect(clone.id).not.toBe(original.id); // ID应该重新生成
      
      // 确保是深度复制
      clone.tags.push('tag3');
      expect(original.tags).toEqual(['tag1', 'tag2']); // 原数组不受影响
    });
  });
}); 