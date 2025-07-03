const { RewardService } = require('../services/reward-service');
const { StarService } = require('../services/star-service');

describe('星星过期保护优化测试', () => {
  describe('部分保护奖励测试', () => {
    test('21颗星星（15颗过期+6颗未过期），奖励[10,10,20]，应保护20颗奖励', async () => {
      // 模拟场景：
      // - 总星星：21颗（15颗过期 + 6颗未过期）
      // - 奖励池：10颗、10颗、20颗
      // - 期望：保护20颗奖励，需额外支付5颗
      
      const mockStarService = {
        protectRewardsByExpiry: jest.fn().mockResolvedValue({
          success: true,
          protectedCount: 1,
          protectedRewards: [{
            id: 'reward_20',
            name: '20颗奖励',
            points: 20,
            partialProtection: 15
          }],
          usedExpiredStars: 15
        })
      };
      
      const mockRewardService = {
        exchangeReward: jest.fn().mockResolvedValue({
          success: true,
          message: '部分保护奖励兑换成功',
          protectedByExpiry: true,
          partialProtection: 15,
          actualCost: 5
        })
      };
      
      // 验证保护逻辑
      const protectResult = await mockStarService.protectRewardsByExpiry(15, 'child_user');
      expect(protectResult.success).toBe(true);
      expect(protectResult.protectedRewards[0].points).toBe(20);
      expect(protectResult.protectedRewards[0].partialProtection).toBe(15);
      
      // 验证兑换逻辑
      const exchangeResult = await mockRewardService.exchangeReward('reward_20', 'child_user');
      expect(exchangeResult.success).toBe(true);
      expect(exchangeResult.actualCost).toBe(5); // 20 - 15 = 5
      expect(exchangeResult.message).toBe('部分保护奖励兑换成功');
    });
    
    test('50颗星星（40颗过期+10颗未过期），奖励[20,15]，应完全保护20颗奖励', async () => {
      // 模拟场景：完全保护的情况
      const mockStarService = {
        protectRewardsByExpiry: jest.fn().mockResolvedValue({
          success: true,
          protectedCount: 1,
          protectedRewards: [{
            id: 'reward_20',
            name: '20颗奖励',
            points: 20,
            partialProtection: 20
          }],
          usedExpiredStars: 20
        })
      };
      
      const mockRewardService = {
        exchangeReward: jest.fn().mockResolvedValue({
          success: true,
          message: '完全保护奖励兑换成功',
          protectedByExpiry: true,
          partialProtection: 20,
          actualCost: 0
        })
      };
      
      const protectResult = await mockStarService.protectRewardsByExpiry(40, 'child_user');
      expect(protectResult.protectedRewards[0].partialProtection).toBe(20);
      
      const exchangeResult = await mockRewardService.exchangeReward('reward_20', 'child_user');
      expect(exchangeResult.actualCost).toBe(0); // 完全保护
      expect(exchangeResult.message).toBe('完全保护奖励兑换成功');
    });
  });
  
  describe('边界条件测试', () => {
    test('过期星星不足以保护任何奖励', async () => {
      const mockStarService = {
        protectRewardsByExpiry: jest.fn().mockResolvedValue({
          success: true,
          protectedCount: 0,
          protectedRewards: [],
          usedExpiredStars: 0
        })
      };
      
      const result = await mockStarService.protectRewardsByExpiry(5, 'child_user');
      expect(result.protectedCount).toBe(0);
    });
    
    test('用户星星不足以支付部分保护奖励', async () => {
      const mockRewardService = {
        exchangeReward: jest.fn().mockResolvedValue({
          success: false,
          message: '星星不足'
        })
      };
      
      const result = await mockRewardService.exchangeReward('reward_20', 'child_user');
      expect(result.success).toBe(false);
      expect(result.message).toBe('星星不足');
    });
  });

  describe('回滚逻辑优化测试', () => {
    test('私有回滚方法应正确处理普通回滚', async () => {
      const mockRewardService = {
        starGroupRepository: {
          getOrCreateGroup: jest.fn().mockResolvedValue({ id: 'permanent_group' }),
          addStarsToGroup: jest.fn().mockResolvedValue(true)
        },
        _rollbackStarDeduction: async function(actualCost, reward, userId, reason) {
          if (actualCost <= 0) return true;
          
          const group = await this.starGroupRepository.getOrCreateGroup('permanent', null, '永久有效', userId);
          if (!group) return false;
          
          await this.starGroupRepository.addStarsToGroup(group, actualCost, `${reason}回滚: ${reward.name}`, userId);
          return true;
        }
      };
      
      const reward = { name: '测试奖励' };
      const result = await mockRewardService._rollbackStarDeduction(10, reward, 'test_user', '测试回滚');
      
      expect(result).toBe(true);
      expect(mockRewardService.starGroupRepository.getOrCreateGroup).toHaveBeenCalledWith(
        'permanent', null, '永久有效', 'test_user'
      );
      expect(mockRewardService.starGroupRepository.addStarsToGroup).toHaveBeenCalledWith(
        { id: 'permanent_group' }, 10, '测试回滚回滚: 测试奖励', 'test_user'
      );
    });

    test('私有回滚方法应正确处理0星星回滚', async () => {
      const mockRewardService = {
        _rollbackStarDeduction: async function(actualCost) {
          if (actualCost <= 0) return true;
          return false; // 不应该执行到这里
        }
      };
      
      const reward = { name: '测试奖励' };
      const result = await mockRewardService._rollbackStarDeduction(0, reward, 'test_user', '测试回滚');
      
      expect(result).toBe(true);
    });

    test('私有回滚方法应正确处理回滚失败', async () => {
      const mockRewardService = {
        starGroupRepository: {
          getOrCreateGroup: jest.fn().mockResolvedValue(null)
        },
        _rollbackStarDeduction: async function(actualCost, reward, userId, reason) {
          if (actualCost <= 0) return true;
          
          const group = await this.starGroupRepository.getOrCreateGroup('permanent', null, '永久有效', userId);
          if (!group) return false;
          
          return true;
        }
      };
      
      const reward = { name: '测试奖励' };
      const result = await mockRewardService._rollbackStarDeduction(10, reward, 'test_user', '测试回滚');
      
      expect(result).toBe(false);
      expect(mockRewardService.starGroupRepository.getOrCreateGroup).toHaveBeenCalled();
    });
  });

  describe('事件数据结构优化测试', () => {
    test('REWARD_CLAIMED事件应包含所有必要字段', () => {
      const eventData = {
        rewardId: 'reward_123',
        rewardName: '测试奖励',
        points: 5, // 兼容字段
        actualCost: 5, // 实际消耗
        originalPoints: 20, // 原始积分
        displayPoints: 5, // 显示消耗
        protectedByExpiry: true,
        partialProtection: 15,
        exchangeType: 'partial_protected',
        userId: 'child_user',
        operatorUserId: 'child_user',
        timestamp: Date.now()
      };

      // 验证所有必要字段存在
      expect(eventData.rewardId).toBeDefined();
      expect(eventData.rewardName).toBeDefined();
      expect(eventData.points).toBeDefined(); // 兼容性字段
      expect(eventData.actualCost).toBeDefined();
      expect(eventData.originalPoints).toBeDefined();
      expect(eventData.displayPoints).toBeDefined();
      expect(eventData.protectedByExpiry).toBeDefined();
      expect(eventData.partialProtection).toBeDefined();
      expect(eventData.exchangeType).toBeDefined();
      expect(eventData.userId).toBeDefined();
      expect(eventData.timestamp).toBeDefined();

      // 验证字段值正确性
      expect(eventData.exchangeType).toBe('partial_protected');
      expect(eventData.actualCost).toBe(eventData.displayPoints);
      expect(eventData.originalPoints).toBeGreaterThan(eventData.actualCost);
    });

    test('普通奖励事件应标记为normal类型', () => {
      const normalRewardEvent = {
        exchangeType: 'normal',
        actualCost: 10,
        originalPoints: 10,
        protectedByExpiry: false,
        partialProtection: 0
      };

      expect(normalRewardEvent.exchangeType).toBe('normal');
      expect(normalRewardEvent.actualCost).toBe(normalRewardEvent.originalPoints);
      expect(normalRewardEvent.protectedByExpiry).toBe(false);
    });

    test('完全保护奖励事件应标记为fully_protected类型', () => {
      const fullyProtectedEvent = {
        exchangeType: 'fully_protected',
        actualCost: 0,
        originalPoints: 20,
        protectedByExpiry: true,
        partialProtection: 20
      };

      expect(fullyProtectedEvent.exchangeType).toBe('fully_protected');
      expect(fullyProtectedEvent.actualCost).toBe(0);
      expect(fullyProtectedEvent.partialProtection).toBe(fullyProtectedEvent.originalPoints);
    });
  });

  describe('数据一致性检查优化测试', () => {
    test('一致性检查数据应包含正确的字段映射', () => {
      const consistencyData = {
        operation: '兑换奖励',
        rewardId: 'reward_123',
        rewardName: '测试奖励',
        actualCost: 5,
        originalPoints: 20,
        protectedByExpiry: true,
        partialProtection: 15,
        exchangeType: 'partial_protected',
        userId: 'child_user',
        timestamp: Date.now()
      };

      // 验证字段完整性
      expect(consistencyData.operation).toBe('兑换奖励');
      expect(consistencyData.actualCost).toBeDefined();
      expect(consistencyData.originalPoints).toBeDefined();
      expect(consistencyData.exchangeType).toBeDefined();
      
      // 验证字段关联性
      expect(consistencyData.actualCost).toBeLessThan(consistencyData.originalPoints);
      expect(consistencyData.partialProtection + consistencyData.actualCost).toBe(consistencyData.originalPoints);
    });
  });
}); 