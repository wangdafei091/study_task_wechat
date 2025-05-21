/**
 * 奖励系统端到端集成测试
 */

const { RewardService } = require('../../services/reward-service');
const { RewardRepository } = require('../../repositories/reward-repository');
const { StarGroupRepository } = require('../../repositories/star-group-repository');
const { StarRecordRepository } = require('../../repositories/star-record-repository');
const { StorageAdapter } = require('../../adapters/storage-adapter');
const { Reward, RewardType, RewardStatus } = require('../../models/reward');

// 清理存储数据
beforeEach(() => {
  // 重置模拟的wx存储
  global.wx._resetStorage();
});

// 创建完整的测试环境
const createTestEnvironment = () => {
  // 创建真实的存储适配器
  const storageAdapter = new StorageAdapter();
  
  // 创建仓储
  const rewardRepository = new RewardRepository({
    storageAdapter,
    storageKey: 'test_rewards'
  });
  
  const starGroupRepository = new StarGroupRepository({
    storageAdapter,
    storageKey: 'test_star_groups'
  });
  
  const starRecordRepository = new StarRecordRepository({
    storageAdapter,
    storageKey: 'test_star_records'
  });
  
  // 创建服务
  const rewardService = new RewardService({
    rewardRepository,
    starGroupRepository,
    starRecordRepository
  });
  
  return {
    rewardService,
    rewardRepository,
    starGroupRepository,
    starRecordRepository,
    storageAdapter
  };
};

describe('奖励系统流程测试', () => {
  // 测试完整流程：创建 -> 兑换 -> 领取
  test('完整奖励生命周期', async () => {
    // 创建测试环境
    const env = createTestEnvironment();
    
    // 初始化星星点数(添加一些星星用于测试)
    await env.storageAdapter.setAsync('test_total_points', 100);
    
    // 步骤1: 创建奖励
    const createResult = await env.rewardService.createReward({
      name: '测试奖励',
      description: '这是一个测试奖励',
      points: 30,
      type: RewardType.ITEM,
      icon: '🎁'
    });
    
    // 验证创建成功
    expect(createResult.success).toBe(true);
    expect(createResult.reward).toBeDefined();
    const rewardId = createResult.reward.id;
    
    // 步骤2: 兑换奖励
    const claimResult = await env.rewardService.claimReward(rewardId);
    
    // 验证兑换成功
    expect(claimResult.success).toBe(true);
    expect(claimResult.reward.claimed).toBe(true);
    expect(claimResult.reward.claimStatus).toBe(RewardStatus.CLAIMED);
    
    // 验证星星点数减少
    const remainingPoints = await env.starGroupRepository.getTotalPoints();
    expect(remainingPoints).toBe(70); // 初始100 - 消费30
    
    // 步骤3: 标记奖励已领取
    const deliverResult = await env.rewardService.deliverReward(rewardId);
    
    // 验证标记成功
    expect(deliverResult.success).toBe(true);
    expect(deliverResult.reward.claimStatus).toBe(RewardStatus.DELIVERED);
    
    // 步骤4: 获取所有奖励并检查状态
    const allRewards = await env.rewardService.getAllRewards();
    
    // 验证奖励状态
    expect(allRewards.length).toBe(1);
    const savedReward = allRewards[0];
    expect(savedReward.id).toBe(rewardId);
    expect(savedReward.claimed).toBe(true);
    expect(savedReward.claimStatus).toBe(RewardStatus.DELIVERED);
  });
  
  // 测试下一个可兑换奖励计算
  test('计算下一个可兑换奖励', async () => {
    // 创建测试环境
    const env = createTestEnvironment();
    
    // 初始化星星点数
    await env.storageAdapter.setAsync('test_total_points', 40);
    
    // 创建多个奖励
    await env.rewardRepository.batchSave([
      new Reward({ id: 'reward_small', name: '小奖励', points: 20, enabled: true }),
      new Reward({ id: 'reward_medium', name: '中奖励', points: 50, enabled: true }),
      new Reward({ id: 'reward_large', name: '大奖励', points: 100, enabled: true }),
      new Reward({ id: 'reward_disabled', name: '禁用奖励', points: 10, enabled: false })
    ]);
    
    // 计算下一个可兑换奖励
    const nextReward = await env.rewardService.calculateNextAvailableReward();
    
    // 验证结果
    expect(nextReward).toBeDefined();
    expect(nextReward.reward.id).toBe('reward_small'); // 星星够兑换的最便宜奖励
    expect(nextReward.progress).toBeDefined();
    expect(nextReward.progress.current).toBe(40);
    expect(nextReward.progress.target).toBe(20);
    expect(nextReward.progress.percentage).toBe(100); // 已达到
    expect(nextReward.progress.remaining).toBe(0);
  });
  
  // 测试奖励复制功能
  test('复制奖励', async () => {
    // 创建测试环境
    const env = createTestEnvironment();
    
    // 创建原始奖励
    const originalReward = new Reward({
      id: 'original_reward',
      name: '原始奖励',
      description: '这是原始描述',
      points: 50,
      tags: ['tag1', 'tag2']
    });
    
    // 保存原始奖励
    await env.rewardRepository.save(originalReward);
    
    // 复制奖励
    const duplicateResult = await env.rewardService.duplicateReward('original_reward');
    
    // 验证复制成功
    expect(duplicateResult.success).toBe(true);
    expect(duplicateResult.reward).toBeDefined();
    expect(duplicateResult.reward.id).not.toBe('original_reward');
    expect(duplicateResult.reward.name).toContain('原始奖励');
    expect(duplicateResult.reward.name).toContain('复制');
    expect(duplicateResult.reward.points).toBe(50);
    expect(duplicateResult.reward.tags).toEqual(['tag1', 'tag2']);
    
    // 获取所有奖励检查
    const allRewards = await env.rewardService.getAllRewards();
    expect(allRewards.length).toBe(2); // 原始 + 复制
  });
  
  // 测试错误处理场景
  test('错误处理和边界情况', async () => {
    // 创建测试环境
    const env = createTestEnvironment();
    
    // 初始化星星点数(较少)
    await env.storageAdapter.setAsync('test_total_points', 10);
    
    // 创建奖励
    const createResult = await env.rewardService.createReward({
      name: '昂贵奖励',
      points: 50
    });
    
    const rewardId = createResult.reward.id;
    
    // 尝试兑换星星不足的奖励
    const claimResult = await env.rewardService.claimReward(rewardId);
    
    // 验证兑换失败
    expect(claimResult.success).toBe(false);
    expect(claimResult.error).toContain('星星不足');
    
    // 验证星星点数未减少
    const remainingPoints = await env.starGroupRepository.getTotalPoints();
    expect(remainingPoints).toBe(10); // 仍保持原值
    
    // 尝试领取未兑换的奖励
    const deliverResult = await env.rewardService.deliverReward(rewardId);
    
    // 验证领取失败
    expect(deliverResult.success).toBe(false);
    expect(deliverResult.error).toContain('未兑换');
  });
}); 