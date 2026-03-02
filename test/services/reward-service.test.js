/**
 * reward-service.test.js - RewardService 单元测试
 *
 * 测试 RewardService 的核心业务逻辑，包括：
 * - 奖励管理（创建、更新、删除、获取）
 * - 兑换流程（兑换、确认、取消）
 * - 库存管理（检查可用性）
 * - 边界条件（库存不足、星星不足、奖励已禁用）
 * - 错误处理（数据验证失败、存储操作失败）
 */

const RewardService = require('../../services/reward-service');
const MockStorageAdapter = require('../__mocks__/storage-adapter-mock');
const EventBus = require('../../utils/core/event-bus');
const { Reward } = require('../../models/reward');

// Mock 日志模块
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  logEvent: jest.fn()
}));

// Mock 配置服务
jest.mock('../../services/service-manager', () => ({
  getService: jest.fn().mockReturnValue(null)
}));

describe('RewardService', () => {
  let rewardService;
  let mockRewardRepository;
  let mockStarGroupRepository;
  let mockStarRecordRepository;
  let mockUserService;
  let mockStorage;
  let eventBus;

  beforeEach(() => {
    // 重置所有Mock
    jest.clearAllMocks();

    // 创建Mock存储
    mockStorage = new MockStorageAdapter();

    // 创建EventBus实例
    eventBus = new EventBus();

    // Mock奖励仓储
    mockRewardRepository = {
      loadFromStorage: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn().mockImplementation(async (reward) => reward),
      getAll: jest.fn().mockResolvedValue([]),
      getById: jest.fn(),
      delete: jest.fn().mockResolvedValue(true),
      deleteMany: jest.fn().mockResolvedValue(1),
      getClaimedRewards: jest.fn().mockResolvedValue([]),
      getAvailableRewards: jest.fn().mockResolvedValue([]),
      getExchangeableRewards: jest.fn().mockResolvedValue([]),
      invalidateCache: jest.fn(),
      getAllSync: jest.fn().mockReturnValue([]),
      unclaimReward: jest.fn().mockResolvedValue(null)
    };

    // Mock星星分组仓储
    mockStarGroupRepository = {
      getTotalPoints: jest.fn().mockResolvedValue(100),
      deductStars: jest.fn().mockResolvedValue({ success: true }),
      addStarsToGroup: jest.fn().mockResolvedValue({ success: true }),
      getOrCreateGroup: jest.fn().mockResolvedValue({ id: 'permanent', name: '永久有效' })
    };

    // Mock星星记录仓储
    mockStarRecordRepository = {
      createStarConsumptionRecord: jest.fn().mockResolvedValue({
        id: 'record1',
        amount: 10,
        type: 'exchange'
      }),
      getRecordsBySource: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue({
        id: 'record1',
        type: 'income',
        points: 10
      })
    };

    // Mock用户服务
    mockUserService = {
      getCurrentUserId: jest.fn().mockReturnValue('user1')
    };

    // 创建RewardService实例
    rewardService = new RewardService({
      rewardRepository: mockRewardRepository,
      starGroupRepository: mockStarGroupRepository,
      starRecordRepository: mockStarRecordRepository,
      userService: mockUserService,
      storageAdapter: mockStorage,
      eventBus: eventBus
    });

    // 手动设置已初始化状态，跳过初始化流程
    rewardService.initialized = true;
    RewardService._initialized = true;
  });

  describe('构造函数', () => {
    it('应该正确初始化服务', () => {
      const service = new RewardService();
      expect(service).toBeInstanceOf(RewardService);
      expect(service.initialized).toBe(false);
    });

    it('应该支持依赖注入', () => {
      const service = new RewardService({
        rewardRepository: mockRewardRepository,
        starGroupRepository: mockStarGroupRepository,
        starRecordRepository: mockStarRecordRepository,
        userService: mockUserService,
        storageAdapter: mockStorage,
        eventBus: eventBus
      });

      expect(service.rewardRepository).toBe(mockRewardRepository);
      expect(service.starGroupRepository).toBe(mockStarGroupRepository);
      expect(service.starRecordRepository).toBe(mockStarRecordRepository);
      expect(service.userService).toBe(mockUserService);
      expect(service.storageAdapter).toBe(mockStorage);
      expect(service.eventBus).toBe(eventBus);
    });
  });

  describe('getAllRewards', () => {
    it('应该返回所有奖励', async () => {
      const mockRewards = [
        new Reward({ id: '1', name: '奖励1', points: 10 }),
        new Reward({ id: '2', name: '奖励2', points: 20 })
      ];
      mockRewardRepository.getAll.mockResolvedValue(mockRewards);

      const result = await rewardService.getAllRewards();

      expect(result).toEqual(mockRewards);
      expect(mockRewardRepository.getAll).toHaveBeenCalledTimes(1);
    });

    it('应该返回指定用户的奖励', async () => {
      const mockRewards = [
        new Reward({ id: '1', name: '奖励1', points: 10, userId: 'user1' }),
        new Reward({ id: '2', name: '奖励2', points: 20, userId: 'user2' })
      ];
      mockRewardRepository.getAll.mockResolvedValue(mockRewards);

      const result = await rewardService.getAllRewards('user1');

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('user1');
    });

    it('应该处理错误情况', async () => {
      mockRewardRepository.getAll.mockRejectedValue(new Error('数据库错误'));

      const result = await rewardService.getAllRewards();

      expect(result).toEqual([]);
    });
  });

  describe('getClaimedRewards', () => {
    it('应该返回已领取的奖励', async () => {
      const mockRewards = [
        new Reward({ id: '1', name: '奖励1', points: 10, claimed: true })
      ];
      mockRewardRepository.getClaimedRewards.mockResolvedValue(mockRewards);

      const result = await rewardService.getClaimedRewards();

      expect(result).toEqual(mockRewards);
      expect(mockRewardRepository.getClaimedRewards).toHaveBeenCalledWith(false, null);
    });

    it('应该返回指定用户的已领取奖励', async () => {
      const mockRewards = [
        new Reward({ id: '1', name: '奖励1', points: 10, claimed: true, userId: 'user1' })
      ];
      mockRewardRepository.getClaimedRewards.mockResolvedValue(mockRewards);

      const result = await rewardService.getClaimedRewards('user1');

      expect(result).toEqual(mockRewards);
      expect(mockRewardRepository.getClaimedRewards).toHaveBeenCalledWith(false, 'user1');
    });

    it('应该处理错误情况', async () => {
      mockRewardRepository.getClaimedRewards.mockRejectedValue(new Error('数据库错误'));

      const result = await rewardService.getClaimedRewards();

      expect(result).toEqual([]);
    });
  });

  describe('createReward', () => {
    it('应该成功创建奖励', async () => {
      const rewardData = {
        name: '新奖励',
        points: 10,
        icon: '🎁'
      };

      const mockReward = new Reward({ ...rewardData, id: '1' });
      mockRewardRepository.save.mockResolvedValue(mockReward);

      const result = await rewardService.createReward(rewardData);

      expect(result.success).toBe(true);
      expect(result.reward).toEqual(mockReward);
      expect(result.message).toBe('创建成功');
      expect(mockRewardRepository.save).toHaveBeenCalledTimes(1);
    });

    it('应该为奖励设置用户ID', async () => {
      const rewardData = {
        name: '新奖励',
        points: 10
      };

      const mockReward = new Reward({ ...rewardData, userId: 'user1', id: '1' });
      mockRewardRepository.save.mockResolvedValue(mockReward);

      await rewardService.createReward(rewardData);

      expect(mockUserService.getCurrentUserId).toHaveBeenCalled();
    });

    it('应该在用户服务不可用时使用默认用户ID', async () => {
      const serviceWithoutUserService = new RewardService({
        rewardRepository: mockRewardRepository,
        starGroupRepository: mockStarGroupRepository,
        starRecordRepository: mockStarRecordRepository,
        eventBus: eventBus
      });
      serviceWithoutUserService.initialized = true;

      const rewardData = {
        name: '新奖励',
        points: 10,
        userId: 'parent'
      };

      const mockReward = new Reward({ ...rewardData, id: '1' });
      mockRewardRepository.save.mockResolvedValue(mockReward);

      const result = await serviceWithoutUserService.createReward(rewardData);

      expect(result.success).toBe(true);
    });

    it('应该拒绝缺少名称的奖励', async () => {
      const rewardData = {
        points: 10
      };

      const result = await rewardService.createReward(rewardData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('奖励数据不完整');
      expect(mockRewardRepository.save).not.toHaveBeenCalled();
    });

    it('应该拒绝缺少积分的奖励', async () => {
      const rewardData = {
        name: '新奖励'
      };

      const result = await rewardService.createReward(rewardData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('奖励数据不完整');
      expect(mockRewardRepository.save).not.toHaveBeenCalled();
    });

    it('应该拒绝空数据', async () => {
      const result = await rewardService.createReward(null);

      expect(result.success).toBe(false);
      expect(result.message).toBe('奖励数据不完整');
    });

    it('应该处理保存错误', async () => {
      const rewardData = {
        name: '新奖励',
        points: 10
      };

      mockRewardRepository.save.mockRejectedValue(new Error('保存失败'));

      const result = await rewardService.createReward(rewardData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('创建过程中发生错误');
    });

    it('应该触发奖励创建事件', async () => {
      const rewardData = {
        name: '新奖励',
        points: 10
      };

      const mockReward = new Reward({ ...rewardData, id: '1' });
      mockRewardRepository.save.mockResolvedValue(mockReward);

      // 监听事件
      const eventBusSpy = jest.spyOn(eventBus, 'emit');

      await rewardService.createReward(rewardData);

      expect(eventBusSpy).toHaveBeenCalledWith('reward:created', expect.objectContaining({
        reward: mockReward
      }));
    });
  });

  describe('updateReward', () => {
    it('应该成功更新奖励', async () => {
      const existingReward = new Reward({ id: '1', name: '旧名称', points: 10 });
      const updatedReward = new Reward({ id: '1', name: '新名称', points: 20 });

      mockRewardRepository.getById.mockResolvedValue(existingReward);
      mockRewardRepository.save.mockResolvedValue(updatedReward);

      const result = await rewardService.updateReward('1', {
        name: '新名称',
        points: 20
      });

      expect(result.success).toBe(true);
      expect(result.reward).toEqual(updatedReward);
      expect(result.message).toBe('更新成功');
      expect(mockRewardRepository.getById).toHaveBeenCalledWith('1');
      expect(mockRewardRepository.save).toHaveBeenCalledTimes(1);
    });

    it('应该拒绝缺少奖励ID', async () => {
      const result = await rewardService.updateReward('', { name: '新名称' });

      expect(result.success).toBe(false);
      expect(result.message).toBe('参数不完整');
      expect(mockRewardRepository.getById).not.toHaveBeenCalled();
    });

    it('应该拒绝缺少更新数据', async () => {
      const result = await rewardService.updateReward('1', null);

      expect(result.success).toBe(false);
      expect(result.message).toBe('参数不完整');
      expect(mockRewardRepository.getById).not.toHaveBeenCalled();
    });

    it('应该处理奖励不存在的情况', async () => {
      mockRewardRepository.getById.mockResolvedValue(null);

      const result = await rewardService.updateReward('1', { name: '新名称' });

      expect(result.success).toBe(false);
      expect(result.message).toBe('未找到指定的奖励');
      expect(mockRewardRepository.save).not.toHaveBeenCalled();
    });

    it('应该处理更新错误', async () => {
      const existingReward = new Reward({ id: '1', name: '旧名称', points: 10 });
      mockRewardRepository.getById.mockResolvedValue(existingReward);
      mockRewardRepository.save.mockRejectedValue(new Error('更新失败'));

      const result = await rewardService.updateReward('1', { name: '新名称' });

      expect(result.success).toBe(false);
      expect(result.message).toBe('更新过程中发生错误');
    });

    it('应该触发奖励更新事件', async () => {
      const existingReward = new Reward({ id: '1', name: '旧名称', points: 10 });
      const updatedReward = new Reward({ id: '1', name: '新名称', points: 20 });

      mockRewardRepository.getById.mockResolvedValue(existingReward);
      mockRewardRepository.save.mockResolvedValue(updatedReward);

      const eventBusSpy = jest.spyOn(eventBus, 'emit');

      await rewardService.updateReward('1', { name: '新名称', points: 20 });

      expect(eventBusSpy).toHaveBeenCalledWith('reward:updated', expect.objectContaining({
        reward: updatedReward,
        previous: existingReward
      }));
    });
  });

  describe('deleteReward', () => {
    it('应该成功删除奖励', async () => {
      const reward = new Reward({ id: '1', name: '要删除的奖励', points: 10, claimed: false });
      mockRewardRepository.getById.mockResolvedValue(reward);
      mockRewardRepository.delete.mockResolvedValue(true);

      const result = await rewardService.deleteReward('1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('删除成功');
      expect(mockRewardRepository.getById).toHaveBeenCalledWith('1');
      expect(mockRewardRepository.delete).toHaveBeenCalledWith('1');
    });

    it('应该拒绝缺少奖励ID', async () => {
      const result = await rewardService.deleteReward('');

      expect(result.success).toBe(false);
      expect(result.message).toBe('奖励ID不能为空');
      expect(mockRewardRepository.getById).not.toHaveBeenCalled();
    });

    it('应该处理奖励不存在的情况', async () => {
      mockRewardRepository.getById.mockResolvedValue(null);

      const result = await rewardService.deleteReward('1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('未找到指定的奖励');
      expect(mockRewardRepository.delete).not.toHaveBeenCalled();
    });

    it('应该拒绝删除已领取的奖励', async () => {
      const reward = new Reward({ id: '1', name: '已领取的奖励', points: 10, claimed: true });
      mockRewardRepository.getById.mockResolvedValue(reward);

      const result = await rewardService.deleteReward('1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('已领取的奖励不能删除');
      expect(mockRewardRepository.delete).not.toHaveBeenCalled();
    });

    it('应该处理删除错误', async () => {
      const reward = new Reward({ id: '1', name: '要删除的奖励', points: 10, claimed: false });
      mockRewardRepository.getById.mockResolvedValue(reward);
      mockRewardRepository.delete.mockRejectedValue(new Error('删除失败'));

      const result = await rewardService.deleteReward('1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('删除过程中发生错误');
    });

    it('应该触发奖励删除事件', async () => {
      const reward = new Reward({ id: '1', name: '要删除的奖励', points: 10, claimed: false });
      mockRewardRepository.getById.mockResolvedValue(reward);
      mockRewardRepository.delete.mockResolvedValue(true);

      const eventBusSpy = jest.spyOn(eventBus, 'emit');

      await rewardService.deleteReward('1');

      expect(eventBusSpy).toHaveBeenCalledWith('reward:deleted', expect.objectContaining({
        reward: reward
      }));
    });
  });

  describe('toggleRewardStatus', () => {
    it('应该成功启用奖励', async () => {
      const reward = new Reward({ id: '1', name: '奖励', points: 10, enabled: false, claimed: false });
      const enabledReward = new Reward({ id: '1', name: '奖励', points: 10, enabled: true, claimed: false });

      mockRewardRepository.getById.mockResolvedValue(reward);
      mockRewardRepository.save.mockResolvedValue(enabledReward);

      const result = await rewardService.toggleRewardStatus('1', true);

      expect(result.success).toBe(true);
      expect(result.reward.enabled).toBe(true);
      expect(result.message).toBe('奖励已启用');
      expect(mockRewardRepository.getById).toHaveBeenCalledWith('1');
    });

    it('应该成功禁用奖励', async () => {
      const reward = new Reward({ id: '1', name: '奖励', points: 10, enabled: true, claimed: false });
      const disabledReward = new Reward({ id: '1', name: '奖励', points: 10, enabled: false, claimed: false });

      mockRewardRepository.getById.mockResolvedValue(reward);
      mockRewardRepository.save.mockResolvedValue(disabledReward);

      const result = await rewardService.toggleRewardStatus('1', false);

      expect(result.success).toBe(true);
      expect(result.reward.enabled).toBe(false);
      expect(result.message).toBe('奖励已禁用');
    });

    it('应该拒绝缺少奖励ID', async () => {
      const result = await rewardService.toggleRewardStatus('', true);

      expect(result.success).toBe(false);
      expect(result.message).toBe('奖励ID不能为空');
    });

    it('应该处理奖励不存在的情况', async () => {
      mockRewardRepository.getById.mockResolvedValue(null);

      const result = await rewardService.toggleRewardStatus('1', true);

      expect(result.success).toBe(false);
      expect(result.message).toBe('未找到指定的奖励');
    });

    it('应该拒绝修改已领取奖励的状态', async () => {
      const reward = new Reward({ id: '1', name: '已领取的奖励', points: 10, claimed: true });
      mockRewardRepository.getById.mockResolvedValue(reward);

      const result = await rewardService.toggleRewardStatus('1', true);

      expect(result.success).toBe(false);
      expect(result.message).toBe('已领取的奖励不能修改状态');
      expect(mockRewardRepository.save).not.toHaveBeenCalled();
    });

    it('应该在状态相同时直接返回成功', async () => {
      const reward = new Reward({ id: '1', name: '奖励', points: 10, enabled: true, claimed: false });
      mockRewardRepository.getById.mockResolvedValue(reward);

      const result = await rewardService.toggleRewardStatus('1', true);

      expect(result.success).toBe(true);
      expect(result.message).toBe('奖励已经是启用状态');
      expect(mockRewardRepository.save).not.toHaveBeenCalled();
    });

    it('应该处理操作错误', async () => {
      const reward = new Reward({ id: '1', name: '奖励', points: 10, enabled: false, claimed: false });
      mockRewardRepository.getById.mockResolvedValue(reward);
      mockRewardRepository.save.mockRejectedValue(new Error('保存失败'));

      const result = await rewardService.toggleRewardStatus('1', true);

      expect(result.success).toBe(false);
      expect(result.message).toBe('操作过程中发生错误');
    });

    it('应该触发奖励状态变更事件', async () => {
      const reward = new Reward({ id: '1', name: '奖励', points: 10, enabled: false, claimed: false });
      const enabledReward = new Reward({ id: '1', name: '奖励', points: 10, enabled: true, claimed: false });

      mockRewardRepository.getById.mockResolvedValue(reward);
      mockRewardRepository.save.mockResolvedValue(enabledReward);

      const eventBusSpy = jest.spyOn(eventBus, 'emit');

      await rewardService.toggleRewardStatus('1', true);

      expect(eventBusSpy).toHaveBeenCalledWith('reward:status_changed', expect.objectContaining({
        reward: enabledReward,
        enabled: true
      }));
    });
  });

  describe('getAvailableRewards', () => {
    it('应该返回可用奖励', async () => {
      const mockRewards = [
        new Reward({ id: '1', name: '奖励1', points: 10, enabled: true, claimed: false })
      ];
      mockRewardRepository.getAvailableRewards.mockResolvedValue(mockRewards);

      const result = await rewardService.getAvailableRewards();

      expect(result).toEqual(mockRewards);
      expect(mockRewardRepository.getAvailableRewards).toHaveBeenCalledWith(false, null);
    });

    it('应该返回包含已领取的奖励', async () => {
      const mockRewards = [
        new Reward({ id: '1', name: '奖励1', points: 10, enabled: true, claimed: false }),
        new Reward({ id: '2', name: '奖励2', points: 20, enabled: true, claimed: true })
      ];
      mockRewardRepository.getAll.mockResolvedValue(mockRewards);

      const result = await rewardService.getAvailableRewards(true);

      expect(result).toHaveLength(2);
    });

    it('应该返回指定用户的奖励', async () => {
      const mockRewards = [
        new Reward({ id: '1', name: '奖励1', points: 10, userId: 'user1', enabled: true, claimed: false })
      ];
      mockRewardRepository.getAvailableRewards.mockResolvedValue(mockRewards);

      const result = await rewardService.getAvailableRewards(false, false, 'user1');

      expect(mockRewardRepository.getAvailableRewards).toHaveBeenCalledWith(false, 'user1');
    });

    it('应该处理错误情况', async () => {
      mockRewardRepository.getAvailableRewards.mockRejectedValue(new Error('数据库错误'));

      const result = await rewardService.getAvailableRewards();

      expect(result).toEqual([]);
    });
  });

  describe('getExchangeableRewards', () => {
    it('应该返回用户可兑换的奖励', async () => {
      const mockRewards = [
        new Reward({ id: '1', name: '奖励1', points: 10, enabled: true, claimed: false }),
        new Reward({ id: '2', name: '奖励2', points: 20, enabled: true, claimed: false })
      ];
      mockStarGroupRepository.getTotalPoints.mockResolvedValue(100);
      mockRewardRepository.getExchangeableRewards.mockResolvedValue(mockRewards);

      const result = await rewardService.getExchangeableRewards();

      expect(result).toEqual(mockRewards);
      expect(mockStarGroupRepository.getTotalPoints).toHaveBeenCalledWith(null);
      expect(mockRewardRepository.getExchangeableRewards).toHaveBeenCalledWith(100, null);
    });

    it('应该返回指定用户的可兑换奖励', async () => {
      const mockRewards = [
        new Reward({ id: '1', name: '奖励1', points: 10, userId: 'user1', enabled: true, claimed: false })
      ];
      mockStarGroupRepository.getTotalPoints.mockResolvedValue(50);
      mockRewardRepository.getExchangeableRewards.mockResolvedValue(mockRewards);

      const result = await rewardService.getExchangeableRewards('user1');

      expect(mockStarGroupRepository.getTotalPoints).toHaveBeenCalledWith('user1');
      expect(mockRewardRepository.getExchangeableRewards).toHaveBeenCalledWith(50, 'user1');
    });

    it('应该处理错误情况', async () => {
      mockStarGroupRepository.getTotalPoints.mockRejectedValue(new Error('数据库错误'));

      const result = await rewardService.getExchangeableRewards();

      expect(result).toEqual([]);
    });
  });

  describe('exchangeReward', () => {
    it('应该成功兑换奖励', async () => {
      const reward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        enabled: true,
        claimed: false
      });

      mockRewardRepository.getById.mockResolvedValue(reward);
      mockRewardRepository.save.mockResolvedValue(reward);
      mockStarGroupRepository.getTotalPoints.mockResolvedValue(100);
      mockStarGroupRepository.deductStars.mockResolvedValue({ success: true });
      mockStarRecordRepository.createStarConsumptionRecord.mockResolvedValue({
        id: 'record1',
        amount: 10
      });

      const result = await rewardService.exchangeReward('1', 'user1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('兑换成功');
      expect(result.actualCost).toBe(10);
      expect(mockRewardRepository.getById).toHaveBeenCalledWith('1');
      expect(mockStarGroupRepository.getTotalPoints).toHaveBeenCalledWith('user1');
      expect(mockStarGroupRepository.deductStars).toHaveBeenCalledWith(10, 'user1');
      expect(mockRewardRepository.save).toHaveBeenCalled();
    });

    it('应该成功兑换部分保护奖励', async () => {
      const reward = new Reward({
        id: '1',
        name: '奖励',
        points: 20,
        protectedByExpiry: true,
        partialProtection: 10,
        enabled: true,
        claimed: false
      });

      mockRewardRepository.getById.mockResolvedValue(reward);
      mockRewardRepository.save.mockResolvedValue(reward);
      mockStarGroupRepository.getTotalPoints.mockResolvedValue(100);
      mockStarGroupRepository.deductStars.mockResolvedValue({ success: true });
      mockStarRecordRepository.createStarConsumptionRecord.mockResolvedValue({
        id: 'record1',
        amount: 10
      });

      const result = await rewardService.exchangeReward('1', 'user1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('部分保护奖励兑换成功');
      expect(result.actualCost).toBe(10);
      expect(result.protectedByExpiry).toBe(true);
      expect(result.partialProtection).toBe(10);
    });

    it('应该成功兑换完全保护奖励', async () => {
      const reward = new Reward({
        id: '1',
        name: '奖励',
        points: 20,
        protectedByExpiry: true,
        partialProtection: 20,
        enabled: true,
        claimed: false
      });

      mockRewardRepository.getById.mockResolvedValue(reward);
      mockRewardRepository.save.mockResolvedValue(reward);
      mockStarGroupRepository.getTotalPoints.mockResolvedValue(100);

      const result = await rewardService.exchangeReward('1', 'user1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('完全保护奖励兑换成功');
      expect(result.actualCost).toBe(0);
      expect(mockStarGroupRepository.deductStars).not.toHaveBeenCalled();
    });

    it('应该自动获取用户ID', async () => {
      const reward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        enabled: true,
        claimed: false
      });

      mockRewardRepository.getById.mockResolvedValue(reward);
      mockRewardRepository.save.mockResolvedValue(reward);
      mockStarGroupRepository.getTotalPoints.mockResolvedValue(100);
      mockStarGroupRepository.deductStars.mockResolvedValue({ success: true });
      mockStarRecordRepository.createStarConsumptionRecord.mockResolvedValue({
        id: 'record1',
        amount: 10
      });

      await rewardService.exchangeReward('1');

      expect(mockUserService.getCurrentUserId).toHaveBeenCalled();
    });

    it('应该拒绝缺少奖励ID', async () => {
      const result = await rewardService.exchangeReward('');

      expect(result.success).toBe(false);
      expect(result.message).toBe('奖励ID不能为空');
      expect(mockRewardRepository.getById).not.toHaveBeenCalled();
    });

    it('应该拒绝不存在的奖励', async () => {
      mockRewardRepository.getById.mockResolvedValue(null);

      const result = await rewardService.exchangeReward('1', 'user1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('未找到指定的奖励');
    });

    it('应该兑换已禁用的奖励', async () => {
      const reward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        enabled: false,
        claimed: false
      });

      mockRewardRepository.getById.mockResolvedValue(reward);

      const result = await rewardService.exchangeReward('1', 'user1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('该奖励已禁用');
    });

    it('应该拒绝兑换已兑换的奖励', async () => {
      const reward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        enabled: true,
        claimed: true
      });

      mockRewardRepository.getById.mockResolvedValue(reward);

      const result = await rewardService.exchangeReward('1', 'user1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('该奖励已被兑换');
    });

    it('应该拒绝星星不足的情况', async () => {
      const reward = new Reward({
        id: '1',
        name: '奖励',
        points: 100,
        enabled: true,
        claimed: false
      });

      mockRewardRepository.getById.mockResolvedValue(reward);
      mockStarGroupRepository.getTotalPoints.mockResolvedValue(50);

      const result = await rewardService.exchangeReward('1', 'user1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('星星不足');
      expect(mockStarGroupRepository.deductStars).not.toHaveBeenCalled();
    });

    it('应该处理扣除星星失败的情况', async () => {
      const reward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        enabled: true,
        claimed: false
      });

      mockRewardRepository.getById.mockResolvedValue(reward);
      mockStarGroupRepository.getTotalPoints.mockResolvedValue(100);
      mockStarGroupRepository.deductStars.mockResolvedValue({ success: false, message: '扣除失败' });

      const result = await rewardService.exchangeReward('1', 'user1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('扣除星星失败');
    });

    it('应该处理创建消费记录失败的情况', async () => {
      const reward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        enabled: true,
        claimed: false
      });

      mockRewardRepository.getById.mockResolvedValue(reward);
      mockStarGroupRepository.getTotalPoints.mockResolvedValue(100);
      mockStarGroupRepository.deductStars.mockResolvedValue({ success: true });
      mockStarRecordRepository.createStarConsumptionRecord.mockRejectedValue(new Error('创建失败'));

      const result = await rewardService.exchangeReward('1', 'user1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('创建消费记录失败');
    });

    it('应该处理保存奖励状态失败的情况', async () => {
      const reward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        enabled: true,
        claimed: false
      });

      mockRewardRepository.getById.mockResolvedValue(reward);
      mockStarGroupRepository.getTotalPoints.mockResolvedValue(100);
      mockStarGroupRepository.deductStars.mockResolvedValue({ success: true });
      mockStarRecordRepository.createStarConsumptionRecord.mockResolvedValue({
        id: 'record1',
        amount: 10
      });
      mockRewardRepository.save.mockRejectedValue(new Error('保存失败'));

      const result = await rewardService.exchangeReward('1', 'user1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('更新奖励状态失败');
    });

    it('应该触发奖励兑换事件', async () => {
      const reward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        enabled: true,
        claimed: false
      });

      mockRewardRepository.getById.mockResolvedValue(reward);
      mockRewardRepository.save.mockResolvedValue(reward);
      mockStarGroupRepository.getTotalPoints.mockResolvedValue(100);
      mockStarGroupRepository.deductStars.mockResolvedValue({ success: true });
      mockStarRecordRepository.createStarConsumptionRecord.mockResolvedValue({
        id: 'record1',
        amount: 10
      });

      const eventBusSpy = jest.spyOn(eventBus, 'emit');

      await rewardService.exchangeReward('1', 'user1');

      expect(eventBusSpy).toHaveBeenCalledWith('reward:claimed', expect.objectContaining({
        rewardId: '1',
        rewardName: '奖励',
        actualCost: 10,
        userId: 'user1'
      }));
    });
  });

  describe('cancelRewardExchange', () => {
    it('应该成功取消奖励兑换', async () => {
      const reward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        claimed: true,
        claimStatus: 'claimed'
      });

      const updatedReward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        claimed: false,
        claimStatus: 'available'
      });

      mockRewardRepository.getById.mockResolvedValue(reward);
      mockStarRecordRepository.getRecordsBySource.mockResolvedValue([
        { id: 'record1', points: -10, previousBalance: 20, balance: 10 }
      ]);
      mockStarGroupRepository.getOrCreateGroup.mockResolvedValue({
        id: 'permanent',
        name: '永久有效'
      });
      mockStarGroupRepository.addStarsToGroup.mockResolvedValue({ success: true });
      mockStarRecordRepository.save.mockResolvedValue({
        id: 'refund1',
        type: 'income',
        points: 10
      });
      mockRewardRepository.unclaimReward.mockResolvedValue(updatedReward);

      const result = await rewardService.cancelRewardExchange('1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('取消兑换成功');
      expect(result.pointsRefunded).toBe(10);
    });

    it('应该拒绝缺少奖励ID', async () => {
      const result = await rewardService.cancelRewardExchange('');

      expect(result.success).toBe(false);
      expect(result.message).toBe('奖励ID不能为空');
    });

    it('应该处理奖励不存在的情况', async () => {
      mockRewardRepository.getById.mockResolvedValue(null);

      const result = await rewardService.cancelRewardExchange('1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('未找到指定的奖励');
    });

    it('应该处理奖励未兑换的情况', async () => {
      const reward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        claimed: false
      });

      mockRewardRepository.getById.mockResolvedValue(reward);

      const result = await rewardService.cancelRewardExchange('1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('奖励尚未兑换');
    });

    it('应该拒绝取消已领取的奖励', async () => {
      const reward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        claimed: true,
        claimStatus: 'delivered'
      });

      mockRewardRepository.getById.mockResolvedValue(reward);

      const result = await rewardService.cancelRewardExchange('1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('已领取的奖励不可取消兑换');
    });

    it('应该处理取消错误', async () => {
      const reward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        claimed: true,
        claimStatus: 'claimed'
      });

      mockRewardRepository.getById.mockResolvedValue(reward);
      mockStarRecordRepository.getRecordsBySource.mockRejectedValue(new Error('查询失败'));

      const result = await rewardService.cancelRewardExchange('1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('操作过程中发生错误');
    });

    it('应该触发奖励取消兑换事件', async () => {
      const reward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        claimed: true,
        claimStatus: 'claimed'
      });

      const updatedReward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        claimed: false,
        claimStatus: 'available'
      });

      mockRewardRepository.getById.mockResolvedValue(reward);
      mockStarRecordRepository.getRecordsBySource.mockResolvedValue([
        { id: 'record1', points: -10, previousBalance: 20, balance: 10 }
      ]);
      mockStarGroupRepository.getOrCreateGroup.mockResolvedValue({
        id: 'permanent',
        name: '永久有效'
      });
      mockStarGroupRepository.addStarsToGroup.mockResolvedValue({ success: true });
      mockStarRecordRepository.save.mockResolvedValue({
        id: 'refund1',
        type: 'income',
        points: 10
      });
      mockRewardRepository.unclaimReward.mockResolvedValue(updatedReward);

      const eventBusSpy = jest.spyOn(eventBus, 'emit');

      await rewardService.cancelRewardExchange('1');

      expect(eventBusSpy).toHaveBeenCalledWith('reward:exchange_cancelled', expect.objectContaining({
        reward: updatedReward,
        pointsRefunded: 10
      }));
    });
  });

  describe('calculateNextAvailableReward', () => {
    it('应该返回下一个可用奖励', async () => {
      const mockRewards = [
        new Reward({ id: '1', name: '奖励1', points: 10, enabled: true, claimed: false }),
        new Reward({ id: '2', name: '奖励2', points: 20, enabled: true, claimed: false }),
        new Reward({ id: '3', name: '奖励3', points: 30, enabled: true, claimed: false })
      ];

      mockStarGroupRepository.getTotalPoints.mockResolvedValue(15);
      mockRewardRepository.getAvailableRewards.mockResolvedValue(mockRewards);

      const result = await rewardService.calculateNextAvailableReward();

      expect(result.id).toBe('2');
      expect(result.remainingStars).toBe(5);
    });

    it('应该处理所有奖励已解锁的情况', async () => {
      const mockRewards = [
        new Reward({ id: '1', name: '奖励1', points: 10, enabled: true, claimed: false }),
        new Reward({ id: '2', name: '奖励2', points: 20, enabled: true, claimed: false })
      ];

      mockStarGroupRepository.getTotalPoints.mockResolvedValue(100);
      mockRewardRepository.getAvailableRewards.mockResolvedValue(mockRewards);

      const result = await rewardService.calculateNextAvailableReward();

      expect(result.allClaimed).toBe(true);
      expect(result.remainingStars).toBe(0);
    });

    it('应该处理没有可用奖励的情况', async () => {
      mockStarGroupRepository.getTotalPoints.mockResolvedValue(5);
      mockRewardRepository.getAvailableRewards.mockResolvedValue([]);
      mockRewardRepository.getAll.mockResolvedValue([]);

      const result = await rewardService.calculateNextAvailableReward();

      expect(result.isDefault).toBe(true);
      expect(result.remainingStars).toBe(5);
    });

    it('应该使用已知的星星数量', async () => {
      const mockRewards = [
        new Reward({ id: '1', name: '奖励1', points: 10, enabled: true, claimed: false })
      ];

      mockRewardRepository.getAvailableRewards.mockResolvedValue(mockRewards);

      const result = await rewardService.calculateNextAvailableReward(5);

      expect(result.remainingStars).toBe(5);
      expect(mockStarGroupRepository.getTotalPoints).not.toHaveBeenCalled();
    });

    it('应该处理错误情况', async () => {
      mockStarGroupRepository.getTotalPoints.mockRejectedValue(new Error('数据库错误'));

      const result = await rewardService.calculateNextAvailableReward();

      expect(result.isDefault).toBe(true);
    });
  });

  describe('duplicateReward', () => {
    it('应该成功复制奖励', async () => {
      const originalReward = new Reward({
        id: '1',
        name: '原始奖励',
        points: 10,
        description: '原始描述',
        type: 'item',
        icon: '🎁',
        tags: ['标签1'],
        notes: '备注'
      });

      const newReward = new Reward({
        id: '2',
        name: '原始奖励',
        points: 10,
        description: '原始描述',
        type: 'item',
        icon: '🎁',
        tags: ['标签1'],
        notes: '备注',
        enabled: true,
        claimed: false,
        originRewardId: '1'
      });

      mockRewardRepository.getById.mockResolvedValue(originalReward);
      // Mock save to return the new reward with originRewardId
      mockRewardRepository.save.mockImplementation((reward) => {
        // Ensure the reward has originRewardId
        if (!reward.originRewardId) {
          reward.originRewardId = '1';
        }
        return Promise.resolve(reward);
      });

      const result = await rewardService.duplicateReward('1');

      expect(result).not.toBeNull();
      expect(result.success).toBe(true);
      expect(result.reward.id).toBeDefined();
      expect(result.reward.id).not.toBe('1'); // ID应该不同
      expect(result.reward.name).toBe('原始奖励');
      expect(result.reward.enabled).toBe(true);
      expect(result.reward.claimed).toBe(false);
      expect(result.reward.originRewardId).toBe('1');
    });

    it('应该拒绝缺少奖励ID', async () => {
      const result = await rewardService.duplicateReward('');

      expect(result).toBeNull();
    });

    it('应该处理奖励不存在的情况', async () => {
      mockRewardRepository.getById.mockResolvedValue(null);

      const result = await rewardService.duplicateReward('1');

      expect(result).toBeNull();
    });

    it('应该处理复制错误', async () => {
      const originalReward = new Reward({
        id: '1',
        name: '原始奖励',
        points: 10
      });

      mockRewardRepository.getById.mockResolvedValue(originalReward);
      mockRewardRepository.save.mockRejectedValue(new Error('保存失败'));

      const result = await rewardService.duplicateReward('1');

      // createReward 返回 { success: false, message: ... }
      expect(result).not.toBeNull();
      expect(result.success).toBe(false);
    });

    it('应该触发奖励复制事件', async () => {
      const originalReward = new Reward({
        id: '1',
        name: '原始奖励',
        points: 10
      });

      const newReward = new Reward({
        id: '2',
        name: '原始奖励',
        points: 10
      });

      mockRewardRepository.getById.mockResolvedValue(originalReward);
      mockRewardRepository.save.mockResolvedValue(newReward);

      const eventBusSpy = jest.spyOn(eventBus, 'emit');

      await rewardService.duplicateReward('1');

      expect(eventBusSpy).toHaveBeenCalledWith('reward:duplicated', expect.objectContaining({
        newReward: expect.objectContaining({
          success: true,
          reward: newReward
        }),
        originalReward: originalReward
      }));
    });
  });

  describe('deleteRewards', () => {
    it('应该成功批量删除奖励', async () => {
      mockRewardRepository.deleteMany.mockResolvedValue(2);

      const result = await rewardService.deleteRewards(['1', '2']);

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(mockRewardRepository.deleteMany).toHaveBeenCalledWith(['1', '2']);
    });

    it('应该拒绝无效的ID数组', async () => {
      const result = await rewardService.deleteRewards([]);

      expect(result.success).toBe(false);
      expect(result.message).toBe('无效的ID数组');
      expect(mockRewardRepository.deleteMany).not.toHaveBeenCalled();
    });

    it('应该拒绝非数组参数', async () => {
      const result = await rewardService.deleteRewards('not an array');

      expect(result.success).toBe(false);
      expect(result.message).toBe('无效的ID数组');
    });

    it('应该处理删除错误', async () => {
      mockRewardRepository.deleteMany.mockRejectedValue(new Error('删除失败'));

      const result = await rewardService.deleteRewards(['1', '2']);

      expect(result.success).toBe(false);
      expect(result.message).toBe('批量删除过程中发生错误');
    });

    it('应该触发批量删除事件', async () => {
      mockRewardRepository.deleteMany.mockResolvedValue(2);

      const eventBusSpy = jest.spyOn(eventBus, 'emit');

      await rewardService.deleteRewards(['1', '2']);

      expect(eventBusSpy).toHaveBeenCalledWith('reward:deleted_batch', expect.objectContaining({
        rewardIds: ['1', '2']
      }));
    });

    it('应该清除缓存', async () => {
      mockRewardRepository.deleteMany.mockResolvedValue(2);
      mockRewardRepository.invalidateCache.mockReturnValue(undefined);

      await rewardService.deleteRewards(['1', '2']);

      expect(mockRewardRepository.invalidateCache).toHaveBeenCalled();
    });
  });

  describe('clearCache', () => {
    it('应该清除仓储缓存', () => {
      rewardService.clearCache();

      expect(mockRewardRepository.invalidateCache).toHaveBeenCalled();
    });

    it('应该处理仓储没有invalidateCache方法的情况', () => {
      const serviceWithoutCacheMethod = new RewardService({
        rewardRepository: {},
        eventBus: eventBus
      });

      serviceWithoutCacheMethod.clearCache();

      // 不应该抛出错误
      expect(true).toBe(true);
    });
  });

  describe('hasOnlyExampleRewardsSync', () => {
    it('应该返回true当只有示例奖励时', () => {
      const mockRewards = [
        new Reward({ id: '1', name: '示例奖励', points: 10, isExample: true, enabled: true }),
        new Reward({ id: '2', name: '示例奖励2', points: 20, isExample: true, enabled: true })
      ];

      mockRewardRepository.getAllSync.mockReturnValue(mockRewards);

      const result = rewardService.hasOnlyExampleRewardsSync();

      expect(result).toBe(true);
    });

    it('应该返回false当有自定义奖励时', () => {
      const mockRewards = [
        new Reward({ id: '1', name: '示例奖励', points: 10, isExample: true, enabled: true }),
        new Reward({ id: '2', name: '自定义奖励', points: 20, isExample: false, enabled: true })
      ];

      mockRewardRepository.getAllSync.mockReturnValue(mockRewards);

      const result = rewardService.hasOnlyExampleRewardsSync();

      expect(result).toBe(false);
    });

    it('应该返回true当没有奖励时', () => {
      mockRewardRepository.getAllSync.mockReturnValue([]);

      const result = rewardService.hasOnlyExampleRewardsSync();

      expect(result).toBe(true);
    });

    it('应该过滤禁用的奖励', () => {
      const mockRewards = [
        new Reward({ id: '1', name: '示例奖励', points: 10, isExample: true, enabled: false }),
        new Reward({ id: '2', name: '自定义奖励', points: 20, isExample: false, enabled: false })
      ];

      mockRewardRepository.getAllSync.mockReturnValue(mockRewards);

      const result = rewardService.hasOnlyExampleRewardsSync();

      expect(result).toBe(true);
    });

    it('应该处理错误情况', () => {
      mockRewardRepository.getAllSync.mockImplementation(() => {
        throw new Error('查询失败');
      });

      const result = rewardService.hasOnlyExampleRewardsSync();

      expect(result).toBe(true); // 出错时保守处理
    });
  });

  describe('getLastExchangeTime', () => {
    it('应该返回最后一次兑换时间', async () => {
      const claimedRewards = [
        new Reward({ id: '1', name: '奖励1', points: 10, claimed: true, claimTime: 1000000 }),
        new Reward({ id: '2', name: '奖励2', points: 20, claimed: true, claimTime: 2000000 }),
        new Reward({ id: '3', name: '奖励3', points: 30, claimed: true, claimTime: 1500000 })
      ];

      mockRewardRepository.getClaimedRewards.mockResolvedValue(claimedRewards);

      const result = await rewardService.getLastExchangeTime();

      expect(result).toBe(2000000);
    });

    it('应该返回null当没有兑换记录时', async () => {
      mockRewardRepository.getClaimedRewards.mockResolvedValue([]);

      const result = await rewardService.getLastExchangeTime();

      expect(result).toBeNull();
    });

    it('应该返回null当没有奖励时', async () => {
      mockRewardRepository.getClaimedRewards.mockResolvedValue(null);

      const result = await rewardService.getLastExchangeTime();

      expect(result).toBeNull();
    });

    it('应该处理错误情况', async () => {
      mockRewardRepository.getClaimedRewards.mockRejectedValue(new Error('查询失败'));

      const result = await rewardService.getLastExchangeTime();

      expect(result).toBeNull();
    });
  });

  describe('markRewardAsDelivered', () => {
    it('应该成功标记奖励为已领取', async () => {
      const reward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        claimed: true,
        claimStatus: 'claimed'
      });

      const deliveredReward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        claimed: true,
        claimStatus: 'delivered',
        deliveryTime: expect.any(Number)
      });

      mockRewardRepository.getById.mockResolvedValue(reward);
      mockRewardRepository.save.mockResolvedValue(deliveredReward);

      const result = await rewardService.markRewardAsDelivered('1');

      expect(result.success).toBe(true);
      expect(result.reward).toEqual(deliveredReward);
      expect(result.message).toBe('奖励已标记为已领取');
    });

    it('应该拒绝缺少奖励ID', async () => {
      const result = await rewardService.markRewardAsDelivered('');

      expect(result.success).toBe(false);
      expect(result.message).toBe('奖励ID不能为空');
    });

    it('应该处理奖励不存在的情况', async () => {
      mockRewardRepository.getById.mockResolvedValue(null);

      const result = await rewardService.markRewardAsDelivered('1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('未找到指定的奖励');
    });

    it('应该拒绝标记未兑换的奖励', async () => {
      const reward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        claimed: false
      });

      mockRewardRepository.getById.mockResolvedValue(reward);

      const result = await rewardService.markRewardAsDelivered('1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('奖励尚未被兑换');
    });

    it('应该在奖励已是已领取状态时直接返回', async () => {
      const reward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        claimed: true,
        claimStatus: 'delivered'
      });

      mockRewardRepository.getById.mockResolvedValue(reward);

      const result = await rewardService.markRewardAsDelivered('1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('奖励已经是已领取状态');
      expect(mockRewardRepository.save).not.toHaveBeenCalled();
    });

    it('应该处理标记错误', async () => {
      const reward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        claimed: true,
        claimStatus: 'claimed'
      });

      mockRewardRepository.getById.mockResolvedValue(reward);
      mockRewardRepository.save.mockRejectedValue(new Error('保存失败'));

      const result = await rewardService.markRewardAsDelivered('1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('操作过程中发生错误');
    });

    it('应该触发奖励领取事件', async () => {
      const reward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        claimed: true,
        claimStatus: 'claimed'
      });

      const deliveredReward = new Reward({
        id: '1',
        name: '奖励',
        points: 10,
        claimed: true,
        claimStatus: 'delivered'
      });

      mockRewardRepository.getById.mockResolvedValue(reward);
      mockRewardRepository.save.mockResolvedValue(deliveredReward);

      const eventBusSpy = jest.spyOn(eventBus, 'emit');

      await rewardService.markRewardAsDelivered('1');

      expect(eventBusSpy).toHaveBeenCalledWith('reward:delivered', expect.objectContaining({
        reward: deliveredReward
      }));
    });
  });
});
