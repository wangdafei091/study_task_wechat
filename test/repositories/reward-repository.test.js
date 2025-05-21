/**
 * RewardRepository单元测试
 */

const { Reward, RewardStatus, RewardType } = require('../../models/reward');
const { RewardRepository } = require('../../repositories/reward-repository');
const MockStorageAdapter = require('../__mocks__/storage-adapter-mock');

describe('RewardRepository', () => {
  let repository;
  let storageAdapter;
  
  // 在每个测试前创建仓储实例和测试数据
  beforeEach(() => {
    // 创建模拟存储适配器
    storageAdapter = new MockStorageAdapter({ namespace: 'rewards:' });
    
    // 使用模拟存储适配器创建仓储
    repository = new RewardRepository({
      storageAdapter,
      storageKey: 'rewards'
    });
    
    // 替换模拟方法
    repository.storageAdapter.getAsync = storageAdapter.getAsyncMock;
    repository.storageAdapter.setAsync = storageAdapter.setAsyncMock;
    repository.storageAdapter.removeAsync = storageAdapter.removeAsyncMock;
    
    // 设置测试数据
    const testRewards = [
      new Reward({
        id: 'reward_001',
        name: '测试奖励1',
        description: '描述1',
        points: 10,
        enabled: true
      }),
      new Reward({
        id: 'reward_002',
        name: '测试奖励2',
        description: '描述2',
        points: 20,
        enabled: true
      }),
      new Reward({
        id: 'reward_003',
        name: '测试奖励3',
        description: '描述3',
        points: 30,
        enabled: false
      }),
      new Reward({
        id: 'reward_004',
        name: '已兑换奖励',
        points: 15,
        claimed: true,
        claimStatus: RewardStatus.CLAIMED,
        claimTime: Date.now() - 1000
      })
    ];
    
    // 设置初始数据
    storageAdapter.set('rewards', testRewards);
  });
  
  // 测试获取所有奖励
  describe('getAll()', () => {
    test('应返回所有奖励', async () => {
      const rewards = await repository.getAll();
      
      expect(rewards).toBeDefined();
      expect(Array.isArray(rewards)).toBe(true);
      expect(rewards.length).toBe(4);
      
      // 验证返回的是Reward实例
      rewards.forEach(reward => {
        expect(reward).toBeInstanceOf(Reward);
      });
      
      // 验证数据正确性
      expect(rewards[0].id).toBe('reward_001');
      expect(rewards[1].name).toBe('测试奖励2');
      expect(rewards[3].claimStatus).toBe(RewardStatus.CLAIMED);
    });
    
    test('空存储应返回空数组', async () => {
      // 清空存储
      storageAdapter._reset();
      
      const rewards = await repository.getAll();
      
      expect(rewards).toBeDefined();
      expect(Array.isArray(rewards)).toBe(true);
      expect(rewards.length).toBe(0);
    });
  });
  
  // 测试通过ID获取奖励
  describe('getById()', () => {
    test('应返回指定ID的奖励', async () => {
      const reward = await repository.getById('reward_002');
      
      expect(reward).toBeDefined();
      expect(reward).toBeInstanceOf(Reward);
      expect(reward.id).toBe('reward_002');
      expect(reward.name).toBe('测试奖励2');
      expect(reward.points).toBe(20);
    });
    
    test('不存在的ID应返回null', async () => {
      const reward = await repository.getById('reward_999');
      expect(reward).toBeNull();
    });
  });
  
  // 测试保存奖励
  describe('save()', () => {
    test('保存新奖励', async () => {
      const newReward = new Reward({
        id: 'reward_new',
        name: '新奖励',
        points: 50
      });
      
      const result = await repository.save(newReward);
      
      expect(result).toBe(true);
      
      // 验证是否保存成功
      const savedReward = await repository.getById('reward_new');
      expect(savedReward).toBeDefined();
      expect(savedReward.id).toBe('reward_new');
      expect(savedReward.name).toBe('新奖励');
    });
    
    test('更新现有奖励', async () => {
      // 获取现有奖励
      const existingReward = await repository.getById('reward_001');
      
      // 修改属性
      existingReward.name = '更新的名称';
      existingReward.points = 25;
      
      // 保存更新
      const result = await repository.save(existingReward);
      expect(result).toBe(true);
      
      // 验证更新是否生效
      const updatedReward = await repository.getById('reward_001');
      expect(updatedReward.name).toBe('更新的名称');
      expect(updatedReward.points).toBe(25);
      
      // 确认其他奖励未受影响
      const otherReward = await repository.getById('reward_002');
      expect(otherReward.name).toBe('测试奖励2');
    });
  });
  
  // 测试删除奖励
  describe('delete()', () => {
    test('删除现有奖励', async () => {
      const result = await repository.delete('reward_001');
      expect(result).toBe(true);
      
      // 验证是否删除成功
      const rewards = await repository.getAll();
      expect(rewards.length).toBe(3);
      expect(rewards.find(r => r.id === 'reward_001')).toBeUndefined();
    });
    
    test('删除不存在的奖励应返回false', async () => {
      const result = await repository.delete('reward_999');
      expect(result).toBe(false);
      
      // 验证其他奖励未受影响
      const rewards = await repository.getAll();
      expect(rewards.length).toBe(4);
    });
  });
  
  // 测试筛选方法
  describe('getAvailableRewards()', () => {
    test('应返回可用奖励', async () => {
      const rewards = await repository.getAvailableRewards();
      
      expect(rewards).toBeDefined();
      expect(Array.isArray(rewards)).toBe(true);
      
      // 验证结果正确性
      expect(rewards.length).toBe(2); // 只有两个启用且未兑换的奖励
      expect(rewards.every(r => r.enabled && !r.claimed)).toBe(true);
    });
  });
  
  describe('getClaimedRewards()', () => {
    test('应返回已兑换奖励', async () => {
      const rewards = await repository.getClaimedRewards();
      
      expect(rewards).toBeDefined();
      expect(Array.isArray(rewards)).toBe(true);
      
      // 验证结果正确性
      expect(rewards.length).toBe(1); // 只有一个已兑换的奖励
      expect(rewards[0].claimed).toBe(true);
      expect(rewards[0].id).toBe('reward_004');
    });
  });
  
  // 测试批量操作
  describe('batchSave()', () => {
    test('批量保存奖励', async () => {
      const batchRewards = [
        new Reward({ id: 'batch_001', name: '批量1', points: 5 }),
        new Reward({ id: 'batch_002', name: '批量2', points: 10 }),
        new Reward({ id: 'batch_003', name: '批量3', points: 15 })
      ];
      
      const result = await repository.batchSave(batchRewards);
      expect(result).toBe(true);
      
      // 验证保存结果
      const allRewards = await repository.getAll();
      expect(allRewards.length).toBe(7); // 原4个 + 新增3个
      
      // 验证新增的数据
      const batchedRewards = allRewards.filter(r => r.id.startsWith('batch_'));
      expect(batchedRewards.length).toBe(3);
    });
  });
  
  // 测试自定义查询
  describe('query()', () => {
    test('使用自定义查询条件', async () => {
      // 查询10点以上的启用奖励
      const results = await repository.query(reward => 
        reward.enabled && reward.points > 10
      );
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(1); // 只有reward_002符合条件
      expect(results[0].id).toBe('reward_002');
    });
    
    test('复杂条件查询', async () => {
      // 查询所有启用或已兑换的奖励
      const results = await repository.query(reward => 
        reward.enabled || reward.claimed
      );
      
      expect(results.length).toBe(3); // reward_001, reward_002, reward_004
      // 验证结果包含预期的ID
      const ids = results.map(r => r.id);
      expect(ids).toContain('reward_001');
      expect(ids).toContain('reward_002');
      expect(ids).toContain('reward_004');
    });
  });
}); 