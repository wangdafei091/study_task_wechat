/**
 * RewardService单元测试
 */

const { Reward, RewardStatus, RewardType } = require('../../models/reward');
const { RewardService } = require('../../services/reward-service');

// 创建模拟依赖
const createMockDependencies = () => {
  // 模拟仓储
  const mockRewardRepository = {
    getAll: jest.fn(),
    getById: jest.fn(),
    getAvailableRewards: jest.fn(),
    getClaimedRewards: jest.fn(),
    query: jest.fn(),
    save: jest.fn(),
    batchSave: jest.fn(),
    delete: jest.fn()
  };
  
  // 模拟StarGroupRepository
  const mockStarGroupRepository = {
    getTotalPoints: jest.fn(),
    getAll: jest.fn()
  };
  
  // 模拟StarRecordRepository
  const mockStarRecordRepository = {
    getAllRecords: jest.fn(),
    saveRecord: jest.fn()
  };
  
  return {
    rewardRepository: mockRewardRepository,
    starGroupRepository: mockStarGroupRepository,
    starRecordRepository: mockStarRecordRepository
  };
};

describe('RewardService', () => {
  let service;
  let mockDeps;
  
  // 在每个测试前创建服务实例
  beforeEach(() => {
    // 创建模拟依赖
    mockDeps = createMockDependencies();
    
    // 创建服务实例
    service = new RewardService({
      rewardRepository: mockDeps.rewardRepository,
      starGroupRepository: mockDeps.starGroupRepository,
      starRecordRepository: mockDeps.starRecordRepository
    });
  });
  
  // 测试获取奖励
  describe('getAllRewards()', () => {
    test('应返回所有奖励', async () => {
      // 配置模拟
      const mockRewards = [
        new Reward({ id: 'r1', name: '奖励1' }),
        new Reward({ id: 'r2', name: '奖励2' })
      ];
      mockDeps.rewardRepository.getAll.mockResolvedValue(mockRewards);
      
      // 执行方法
      const result = await service.getAllRewards();
      
      // 验证
      expect(mockDeps.rewardRepository.getAll).toHaveBeenCalled();
      expect(result).toEqual(mockRewards);
      expect(result.length).toBe(2);
    });
  });
  
  // 测试创建奖励
  describe('createReward()', () => {
    test('创建有效奖励', async () => {
      // 配置模拟
      mockDeps.rewardRepository.save.mockResolvedValue(true);
      
      // 准备测试数据
      const rewardData = {
        name: '新奖励',
        description: '测试描述',
        points: 30,
        type: RewardType.ACTIVITY
      };
      
      // 执行方法
      const result = await service.createReward(rewardData);
      
      // 验证
      expect(result.success).toBe(true);
      expect(result.reward).toBeDefined();
      expect(result.reward).toBeInstanceOf(Reward);
      expect(result.reward.name).toBe('新奖励');
      expect(result.reward.points).toBe(30);
      expect(result.reward.type).toBe(RewardType.ACTIVITY);
      
      // 验证调用保存
      expect(mockDeps.rewardRepository.save).toHaveBeenCalledWith(
        expect.any(Reward)
      );
    });
    
    test('创建无效奖励应失败', async () => {
      // 准备无效测试数据(缺少名称)
      const invalidData = {
        points: 30,
        type: RewardType.ITEM
      };
      
      // 执行方法
      const result = await service.createReward(invalidData);
      
      // 验证失败结果
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
      
      // 验证未调用保存
      expect(mockDeps.rewardRepository.save).not.toHaveBeenCalled();
    });
  });
  
  // 测试更新奖励
  describe('updateReward()', () => {
    test('更新存在的奖励', async () => {
      // 准备原始奖励数据
      const originalReward = new Reward({
        id: 'reward_update',
        name: '原始名称',
        description: '原始描述',
        points: 10
      });
      
      // 配置模拟
      mockDeps.rewardRepository.getById.mockResolvedValue(originalReward);
      mockDeps.rewardRepository.save.mockResolvedValue(true);
      
      // 准备更新数据
      const updateData = {
        name: '更新名称',
        points: 20
      };
      
      // 执行更新
      const result = await service.updateReward('reward_update', updateData);
      
      // 验证
      expect(result.success).toBe(true);
      expect(result.reward).toBeDefined();
      expect(result.reward.id).toBe('reward_update');
      expect(result.reward.name).toBe('更新名称');
      expect(result.reward.points).toBe(20);
      expect(result.reward.description).toBe('原始描述'); // 未修改的属性保持原值
      
      // 验证调用
      expect(mockDeps.rewardRepository.getById).toHaveBeenCalledWith('reward_update');
      expect(mockDeps.rewardRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'reward_update',
          name: '更新名称',
          points: 20
        })
      );
    });
    
    test('更新不存在的奖励应失败', async () => {
      // 配置模拟 - 奖励不存在
      mockDeps.rewardRepository.getById.mockResolvedValue(null);
      
      // 执行更新
      const result = await service.updateReward('non_existent', { name: '新名称' });
      
      // 验证失败结果
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('不存在');
      
      // 验证未调用保存
      expect(mockDeps.rewardRepository.save).not.toHaveBeenCalled();
    });
  });
  
  // 测试删除奖励
  describe('deleteReward()', () => {
    test('删除存在的奖励', async () => {
      // 配置模拟
      mockDeps.rewardRepository.getById.mockResolvedValue(
        new Reward({ id: 'reward_delete', name: '待删除奖励' })
      );
      mockDeps.rewardRepository.delete.mockResolvedValue(true);
      
      // 执行删除
      const result = await service.deleteReward('reward_delete');
      
      // 验证
      expect(result.success).toBe(true);
      expect(mockDeps.rewardRepository.delete).toHaveBeenCalledWith('reward_delete');
    });
    
    test('删除已兑换奖励应失败', async () => {
      // 配置模拟 - 奖励已兑换
      mockDeps.rewardRepository.getById.mockResolvedValue(
        new Reward({ 
          id: 'reward_claimed', 
          name: '已兑换奖励', 
          claimed: true,
          claimStatus: RewardStatus.CLAIMED
        })
      );
      
      // 执行删除
      const result = await service.deleteReward('reward_claimed');
      
      // 验证失败结果
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('已兑换');
      
      // 验证未调用删除
      expect(mockDeps.rewardRepository.delete).not.toHaveBeenCalled();
    });
    
    test('删除不存在的奖励应失败', async () => {
      // 配置模拟 - 奖励不存在
      mockDeps.rewardRepository.getById.mockResolvedValue(null);
      
      // 执行删除
      const result = await service.deleteReward('non_existent');
      
      // 验证
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('不存在');
      
      // 验证未调用删除
      expect(mockDeps.rewardRepository.delete).not.toHaveBeenCalled();
    });
  });
  
  // 测试奖励兑换
  describe('claimReward()', () => {
    test('兑换可用奖励', async () => {
      // 准备模拟数据
      const rewardToClaim = new Reward({
        id: 'reward_to_claim',
        name: '待兑换奖励',
        points: 20,
        enabled: true
      });
      
      // 配置模拟
      mockDeps.rewardRepository.getById.mockResolvedValue(rewardToClaim);
      mockDeps.starGroupRepository.getTotalPoints.mockResolvedValue(30); // 用户有足够星星
      mockDeps.rewardRepository.save.mockResolvedValue(true);
      mockDeps.starRecordRepository.saveRecord.mockResolvedValue(true);
      
      // 执行兑换
      const result = await service.claimReward('reward_to_claim');
      
      // 验证
      expect(result.success).toBe(true);
      expect(result.reward).toBeDefined();
      expect(result.reward.claimed).toBe(true);
      expect(result.reward.claimStatus).toBe(RewardStatus.CLAIMED);
      expect(result.reward.claimTime).toBeGreaterThan(0);
      
      // 验证调用
      expect(mockDeps.rewardRepository.save).toHaveBeenCalled();
      expect(mockDeps.starRecordRepository.saveRecord).toHaveBeenCalled();
    });
    
    test('星星不足应兑换失败', async () => {
      // 准备模拟数据
      const rewardToClaim = new Reward({
        id: 'reward_expensive',
        name: '高价奖励',
        points: 50,
        enabled: true
      });
      
      // 配置模拟
      mockDeps.rewardRepository.getById.mockResolvedValue(rewardToClaim);
      mockDeps.starGroupRepository.getTotalPoints.mockResolvedValue(30); // 用户星星不足
      
      // 执行兑换
      const result = await service.claimReward('reward_expensive');
      
      // 验证
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('星星不足');
      
      // 验证未调用保存
      expect(mockDeps.rewardRepository.save).not.toHaveBeenCalled();
      expect(mockDeps.starRecordRepository.saveRecord).not.toHaveBeenCalled();
    });
    
    test('兑换禁用奖励应失败', async () => {
      // 准备模拟数据
      const disabledReward = new Reward({
        id: 'reward_disabled',
        name: '禁用奖励',
        points: 10,
        enabled: false
      });
      
      // 配置模拟
      mockDeps.rewardRepository.getById.mockResolvedValue(disabledReward);
      mockDeps.starGroupRepository.getTotalPoints.mockResolvedValue(30);
      
      // 执行兑换
      const result = await service.claimReward('reward_disabled');
      
      // 验证
      expect(result.success).toBe(false);
      expect(result.error).toContain('已禁用');
      
      // 验证未调用保存
      expect(mockDeps.rewardRepository.save).not.toHaveBeenCalled();
    });
  });
  
  // 测试取消兑换
  describe('unclaimReward()', () => {
    test('取消已兑换未领取的奖励', async () => {
      // 准备模拟数据
      const claimedReward = new Reward({
        id: 'reward_claimed',
        name: '已兑换奖励',
        points: 20,
        claimed: true,
        claimStatus: RewardStatus.CLAIMED,
        claimTime: Date.now() - 1000
      });
      
      // 配置模拟
      mockDeps.rewardRepository.getById.mockResolvedValue(claimedReward);
      mockDeps.rewardRepository.save.mockResolvedValue(true);
      mockDeps.starRecordRepository.saveRecord.mockResolvedValue(true);
      
      // 执行取消兑换
      const result = await service.unclaimReward('reward_claimed');
      
      // 验证
      expect(result.success).toBe(true);
      expect(result.reward).toBeDefined();
      expect(result.reward.claimed).toBe(false);
      expect(result.reward.claimStatus).toBe(RewardStatus.AVAILABLE);
      
      // 验证调用保存
      expect(mockDeps.rewardRepository.save).toHaveBeenCalled();
      expect(mockDeps.starRecordRepository.saveRecord).toHaveBeenCalled();
    });
    
    test('取消已领取奖励应失败', async () => {
      // 准备模拟数据
      const deliveredReward = new Reward({
        id: 'reward_delivered',
        name: '已领取奖励',
        points: 20,
        claimed: true,
        claimStatus: RewardStatus.DELIVERED,
        claimTime: Date.now() - 2000,
        deliveryTime: Date.now() - 1000
      });
      
      // 配置模拟
      mockDeps.rewardRepository.getById.mockResolvedValue(deliveredReward);
      
      // 执行取消兑换
      const result = await service.unclaimReward('reward_delivered');
      
      // 验证
      expect(result.success).toBe(false);
      expect(result.error).toContain('已领取');
      
      // 验证未调用保存
      expect(mockDeps.rewardRepository.save).not.toHaveBeenCalled();
    });
  });
  
  // 测试标记奖励已领取
  describe('deliverReward()', () => {
    test('标记已兑换奖励为已领取', async () => {
      // 准备模拟数据
      const claimedReward = new Reward({
        id: 'reward_claimed',
        name: '已兑换奖励',
        points: 20,
        claimed: true,
        claimStatus: RewardStatus.CLAIMED,
        claimTime: Date.now() - 1000
      });
      
      // 配置模拟
      mockDeps.rewardRepository.getById.mockResolvedValue(claimedReward);
      mockDeps.rewardRepository.save.mockResolvedValue(true);
      
      // 执行标记
      const result = await service.deliverReward('reward_claimed');
      
      // 验证
      expect(result.success).toBe(true);
      expect(result.reward).toBeDefined();
      expect(result.reward.claimStatus).toBe(RewardStatus.DELIVERED);
      expect(result.reward.deliveryTime).toBeGreaterThan(0);
      
      // 验证调用保存
      expect(mockDeps.rewardRepository.save).toHaveBeenCalled();
    });
    
    test('标记未兑换奖励应失败', async () => {
      // 准备模拟数据
      const availableReward = new Reward({
        id: 'reward_available',
        name: '可用奖励',
        points: 20,
        claimed: false
      });
      
      // 配置模拟
      mockDeps.rewardRepository.getById.mockResolvedValue(availableReward);
      
      // 执行标记
      const result = await service.deliverReward('reward_available');
      
      // 验证
      expect(result.success).toBe(false);
      expect(result.error).toContain('未兑换');
      
      // 验证未调用保存
      expect(mockDeps.rewardRepository.save).not.toHaveBeenCalled();
    });
  });
  
  // 测试计算下一个可达成奖励
  describe('calculateNextAvailableReward()', () => {
    test('有可达成奖励时返回正确信息', async () => {
      // 准备模拟数据
      const availableRewards = [
        new Reward({ id: 'r1', name: '奖励1', points: 50, enabled: true }),
        new Reward({ id: 'r2', name: '奖励2', points: 20, enabled: true }),
        new Reward({ id: 'r3', name: '奖励3', points: 100, enabled: true })
      ];
      
      // 配置模拟
      mockDeps.rewardRepository.getAvailableRewards.mockResolvedValue(availableRewards);
      mockDeps.starGroupRepository.getTotalPoints.mockResolvedValue(15); // 有15颗星星
      
      // 执行计算
      const result = await service.calculateNextAvailableReward();
      
      // 验证 - 应返回最接近的奖励(奖励2需要20星星)
      expect(result).toBeDefined();
      expect(result.reward).toBeDefined();
      expect(result.reward.id).toBe('r2');
      expect(result.reward.points).toBe(20);
      expect(result.progress).toBeDefined();
      expect(result.progress.current).toBe(15);
      expect(result.progress.target).toBe(20);
      expect(result.progress.percentage).toBe(75); // 15/20 = 75%
      expect(result.progress.remaining).toBe(5); // 还需5颗星星
    });
    
    test('无可达成奖励时返回最便宜的奖励', async () => {
      // 准备模拟数据 - 所有奖励都很贵
      const expensiveRewards = [
        new Reward({ id: 'r1', name: '奖励1', points: 100, enabled: true }),
        new Reward({ id: 'r2', name: '奖励2', points: 80, enabled: true }),
        new Reward({ id: 'r3', name: '奖励3', points: 200, enabled: true })
      ];
      
      // 配置模拟
      mockDeps.rewardRepository.getAvailableRewards.mockResolvedValue(expensiveRewards);
      mockDeps.starGroupRepository.getTotalPoints.mockResolvedValue(10); // 只有10颗星星
      
      // 执行计算
      const result = await service.calculateNextAvailableReward();
      
      // 验证 - 应返回最便宜的奖励(奖励2需要80星星)
      expect(result).toBeDefined();
      expect(result.reward).toBeDefined();
      expect(result.reward.id).toBe('r2');
      expect(result.reward.points).toBe(80);
      expect(result.progress.current).toBe(10);
      expect(result.progress.target).toBe(80);
      expect(result.progress.percentage).toBe(12.5); // 10/80 = 12.5%
      expect(result.progress.remaining).toBe(70); // 还需70颗星星
    });
    
    test('没有可用奖励时返回null', async () => {
      // 配置模拟 - 没有可用奖励
      mockDeps.rewardRepository.getAvailableRewards.mockResolvedValue([]);
      mockDeps.starGroupRepository.getTotalPoints.mockResolvedValue(50);
      
      // 执行计算
      const result = await service.calculateNextAvailableReward();
      
      // 验证
      expect(result).toBeNull();
    });
  });
  
  // 测试复制奖励
  describe('duplicateReward()', () => {
    test('复制现有奖励', async () => {
      // 准备原始奖励
      const originalReward = new Reward({
        id: 'original_reward',
        name: '原始奖励',
        description: '原始描述',
        points: 30,
        tags: ['tag1', 'tag2'],
        icon: '🌟'
      });
      
      // 配置模拟
      mockDeps.rewardRepository.getById.mockResolvedValue(originalReward);
      mockDeps.rewardRepository.save.mockResolvedValue(true);
      
      // 执行复制
      const result = await service.duplicateReward('original_reward');
      
      // 验证
      expect(result.success).toBe(true);
      expect(result.reward).toBeDefined();
      
      // 验证复制的属性
      expect(result.reward.id).not.toBe('original_reward'); // ID应不同
      expect(result.reward.name).toContain('原始奖励'); // 名称应包含原始名称
      expect(result.reward.name).toContain('复制'); // 名称应包含"复制"
      expect(result.reward.description).toBe('原始描述');
      expect(result.reward.points).toBe(30);
      expect(result.reward.tags).toEqual(['tag1', 'tag2']);
      expect(result.reward.icon).toBe('🌟');
      
      // 验证复制奖励是未兑换状态
      expect(result.reward.claimed).toBe(false);
      expect(result.reward.claimStatus).toBe(RewardStatus.AVAILABLE);
      
      // 验证调用保存
      expect(mockDeps.rewardRepository.save).toHaveBeenCalledWith(result.reward);
    });
    
    test('复制不存在的奖励应失败', async () => {
      // 配置模拟 - 奖励不存在
      mockDeps.rewardRepository.getById.mockResolvedValue(null);
      
      // 执行复制
      const result = await service.duplicateReward('non_existent');
      
      // 验证
      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
      
      // 验证未调用保存
      expect(mockDeps.rewardRepository.save).not.toHaveBeenCalled();
    });
  });
}); 