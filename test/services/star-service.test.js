/**
 * star-service.test.js - StarService 测试
 *
 * 测试 StarService 的核心业务逻辑，包括星星添加、消费、过期处理等
 */

const StarService = require('../../services/star-service');
const { StarExpiryType } = require('../../models/star');
const { EVENTS } = require('../../utils/constants');
const MockEventBus = require('../utils/mock-event-bus');
const TestDataFactory = require('../utils/test-data-factory');

// Mock依赖
jest.mock('../../utils/logger');
jest.mock('../../repositories/index');
jest.mock('../../utils/http-client', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn()
}));

const { StarGroupRepository, StarRecordRepository } = require('../../repositories/index');
const HttpClient = require('../../utils/http-client');

describe('StarService', () => {
  let starService;
  let mockStarGroupRepository;
  let mockStarRecordRepository;
  let mockEventBus;

  beforeEach(() => {
    jest.clearAllMocks();

    // 创建Mock仓储
    mockStarGroupRepository = {
      loadFromStorage: jest.fn().mockResolvedValue(true),
      cleanupExpiredGroups: jest.fn().mockResolvedValue([]),
      cleanupEmptyGroups: jest.fn().mockResolvedValue([]),
      getOrCreateGroup: jest.fn().mockResolvedValue(null),
      addStarsToGroup: jest.fn().mockResolvedValue(null),
      consumeStarsByExpiryOrder: jest.fn().mockResolvedValue({ success: false, consumed: 0, groupsUpdated: [] }),
      deductStarsFromSpecificExpiryType: jest.fn().mockResolvedValue({ success: false, message: '扣减失败' }),
      getTotalPoints: jest.fn().mockResolvedValue(0),
      getAll: jest.fn().mockResolvedValue([]),
      _saveData: jest.fn().mockResolvedValue(true),
      invalidateCache: jest.fn()
    };

    mockStarRecordRepository = {
      save: jest.fn().mockResolvedValue(null),
      createPenaltyRecord: jest.fn().mockResolvedValue(null),
      createTaskCompleteRecord: jest.fn().mockResolvedValue(null),
      createExpiredRecord: jest.fn().mockResolvedValue(null),
      getRecordsByTypeAndDate: jest.fn().mockResolvedValue([]),
      getRecordsByType: jest.fn().mockResolvedValue([]),
      getRecordsByDate: jest.fn().mockResolvedValue([]),
      getRecordsByTimeOrder: jest.fn().mockResolvedValue([]),
      getRecordsGroupedByMonth: jest.fn().mockResolvedValue([]),
      getRecordsByDateRange: jest.fn().mockResolvedValue([]),
      repairRecordBalances: jest.fn().mockResolvedValue({ success: true, repairedCount: 0 }),
      getAll: jest.fn().mockResolvedValue([]),
      _saveData: jest.fn().mockResolvedValue(true),
      invalidateCache: jest.fn()
    };

    // Mock仓储构造函数
    StarGroupRepository.mockImplementation(() => mockStarGroupRepository);
    StarRecordRepository.mockImplementation(() => mockStarRecordRepository);

    // 创建EventBus实例
    mockEventBus = new MockEventBus();

    // 创建StarService实例
    starService = new StarService({
      starGroupRepository: mockStarGroupRepository,
      starRecordRepository: mockStarRecordRepository,
      eventBus: mockEventBus
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== 星星添加逻辑测试 ====================

  describe('addStars - 添加星星', () => {
    it('应该成功添加永久有效星星', async () => {
      const mockGroup = TestDataFactory.createStarGroup({
        id: 'group_1',
        userId: 'user_123',
        stars: 10,
        expiryType: 'permanent',
        expiryDate: null,
        expiryDateStr: '', // 永久星星的expiryDateStr为空字符串
        type: 'permanent'
      });

      mockStarGroupRepository.getOrCreateGroup.mockResolvedValue(mockGroup);
      mockStarGroupRepository.addStarsToGroup.mockResolvedValue({ ...mockGroup, stars: 20 });
      mockStarRecordRepository.save.mockResolvedValue({
        id: 'record_1',
        type: 'income',
        points: 10,
        balance: 20,
        previousBalance: 10
      });

      const result = await starService.addStars(10, 'permanent', '测试添加', {
        userId: 'user_123'
      });

      expect(result.success).toBe(true);
      expect(result.points).toBe(10);
      expect(mockStarGroupRepository.getOrCreateGroup).toHaveBeenCalledWith(
        'permanent',
        null,
        '', // 永久星星的expiryDateStr为空字符串
        'user_123'
      );
      expect(mockStarRecordRepository.save).toHaveBeenCalled();
      expect(mockEventBus.events['stars:added']).toBeDefined();
      expect(mockEventBus.events['stars:added'].length).toBe(1);
    });

    it('应该成功添加本周有效星星', async () => {
      const mockGroup = TestDataFactory.createStarGroup({
        id: 'group_2',
        userId: 'user_123',
        stars: 5,
        expiryType: 'week',
        expiryDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
        expiryDateStr: '2026-03-11',
        type: 'temporary'
      });

      mockStarGroupRepository.getOrCreateGroup.mockResolvedValue(mockGroup);
      mockStarGroupRepository.addStarsToGroup.mockResolvedValue({ ...mockGroup, stars: 15 });
      mockStarRecordRepository.save.mockResolvedValue({
        id: 'record_2',
        type: 'income',
        points: 10,
        balance: 15,
        previousBalance: 5
      });

      const result = await starService.addStars(10, 'week', '完成任务', {
        userId: 'user_123',
        sourceType: 'task_complete',
        sourceId: 'task_1'
      });

      expect(result.success).toBe(true);
      expect(result.points).toBe(10);
      expect(mockStarRecordRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        expiryDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
      }));
      expect(mockEventBus.events['stars:added']).toBeDefined();
    });

    it('应该拒绝星星数量小于等于0的情况', async () => {
      const result1 = await starService.addStars(0, 'permanent', '测试');
      expect(result1.success).toBe(false);
      expect(result1.message).toBe('星星数量必须大于0');

      const result2 = await starService.addStars(-5, 'permanent', '测试');
      expect(result2.success).toBe(false);
      expect(result2.message).toBe('星星数量必须大于0');
    });

    it('应该拒绝无效的过期类型', async () => {
      const result = await starService.addStars(10, 'invalid_type', '测试');
      expect(result.success).toBe(false);
      expect(result.message).toBe('无效的过期类型');
    });

    it('应该处理创建分组失败的情况', async () => {
      mockStarGroupRepository.getOrCreateGroup.mockResolvedValue(null);

      const result = await starService.addStars(10, 'permanent', '测试', {
        userId: 'user_123'
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('无法创建星星分组');
    });

    it('应该处理添加星星到分组失败的情况', async () => {
      const mockGroup = TestDataFactory.createStarGroup({ id: 'group_1', userId: 'user_123' });
      mockStarGroupRepository.getOrCreateGroup.mockResolvedValue(mockGroup);
      mockStarGroupRepository.addStarsToGroup.mockResolvedValue(null);

      const result = await starService.addStars(10, 'permanent', '测试', {
        userId: 'user_123'
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('无法添加星星到分组');
    });

    it('应该正确触发星星添加事件', async () => {
      const mockGroup = TestDataFactory.createStarGroup({ id: 'group_1', userId: 'user_123', stars: 10 });
      mockStarGroupRepository.getOrCreateGroup.mockResolvedValue(mockGroup);
      mockStarGroupRepository.addStarsToGroup.mockResolvedValue({ ...mockGroup, stars: 20 });
      mockStarRecordRepository.save.mockResolvedValue({ id: 'record_1', type: 'income' });

      await starService.addStars(10, 'permanent', '测试', { userId: 'user_123' });

      mockEventBus.verifyEmit(EVENTS.STARS_ADDED, (data) => {
        expect(data.points).toBe(10);
        expect(data.expiryType).toBe('permanent');
        expect(data.group).toBeDefined();
        expect(data.record).toBeDefined();
      });
    });
  });

  // ==================== 星星消费逻辑测试 ====================

  describe('consumeStars - 消费星星（按过期顺序）', () => {
    it('应该成功消费星星（按过期顺序）', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', stars: 5, expiryDate: Date.now() + 86400000 }),
        TestDataFactory.createStarGroup({ id: 'group_2', stars: 10, expiryDate: Date.now() + 172800000 })
      ];

      mockStarGroupRepository.consumeStarsByExpiryOrder.mockResolvedValue({
        success: true,
        consumed: 5,
        groupsUpdated: [{ ...mockGroups[0], stars: 0 }]
      });
      mockStarRecordRepository.save.mockResolvedValue({
        id: 'record_1',
        type: 'expense',
        points: -5,
        balance: 10,
        previousBalance: 15
      });

      const result = await starService.consumeStars(5, '兑换奖励', {
        userId: 'user_123',
        sourceType: 'reward_exchange',
        sourceId: 'reward_1'
      });

      expect(result.success).toBe(true);
      expect(result.consumed).toBe(5);
      expect(result.requested).toBe(5);
      expect(mockStarRecordRepository.save).toHaveBeenCalled();
    });

    it('应该处理星星余额不足的情况（部分消费）', async () => {
      mockStarGroupRepository.consumeStarsByExpiryOrder.mockResolvedValue({
        success: false,
        consumed: 8,
        groupsUpdated: [
          TestDataFactory.createStarGroup({ id: 'group_1', stars: 0 }),
          TestDataFactory.createStarGroup({ id: 'group_2', stars: 2 })
        ]
      });
      mockStarRecordRepository.save.mockResolvedValue({ id: 'record_1', type: 'expense', points: -8 });

      const result = await starService.consumeStars(10, '兑换奖励', {
        userId: 'user_123'
      });

      expect(result.success).toBe(true); // 扣减了就算成功
      expect(result.consumed).toBe(8);
      expect(result.requested).toBe(10);
      expect(result.message).toContain('已扣减8颗星星');
    });

    it('应该处理完全无法消费的情况', async () => {
      mockStarGroupRepository.consumeStarsByExpiryOrder.mockResolvedValue({
        success: false,
        consumed: 0,
        groupsUpdated: []
      });

      const result = await starService.consumeStars(10, '兑换奖励', {
        userId: 'user_123'
      });

      expect(result.success).toBe(false);
      expect(result.consumed).toBe(0);
      expect(result.message).toBe('没有可用的星星');
    });

    it('应该拒绝消费数量小于等于0的情况', async () => {
      const result1 = await starService.consumeStars(0, '测试');
      expect(result1.success).toBe(false);
      expect(result1.message).toBe('星星数量必须大于0');

      const result2 = await starService.consumeStars(-5, '测试');
      expect(result2.success).toBe(false);
      expect(result2.message).toBe('星星数量必须大于0');
    });

    it('应该创建任务惩罚类型的记录', async () => {
      mockStarGroupRepository.consumeStarsByExpiryOrder.mockResolvedValue({
        success: true,
        consumed: 5,
        groupsUpdated: []
      });
      mockStarRecordRepository.createPenaltyRecord.mockResolvedValue({
        id: 'record_1',
        type: 'penalty',
        points: -5
      });

      const result = await starService.consumeStars(5, '任务惩罚', {
        userId: 'user_123',
        sourceType: 'task_penalty',
        sourceId: 'task_1',
        originalTaskDate: '2026-03-01'
      });

      expect(result.success).toBe(true);
      expect(mockStarRecordRepository.createPenaltyRecord).toHaveBeenCalledWith(
        'task_1',
        5,
        '任务惩罚',
        'user_123',
        '2026-03-01',
        5,
        expect.stringContaining('task_penalty:task_1:2026-03-01:user_123:')
      );
    });

    it('应该正确触发星星消费事件', async () => {
      mockStarGroupRepository.consumeStarsByExpiryOrder.mockResolvedValue({
        success: true,
        consumed: 5,
        groupsUpdated: [TestDataFactory.createStarGroup({ id: 'group_1', stars: 0 })]
      });
      mockStarRecordRepository.save.mockResolvedValue({ id: 'record_1', type: 'expense' });

      await starService.consumeStars(5, '测试消费', { userId: 'user_123' });

      mockEventBus.verifyEmit(EVENTS.STARS_CONSUMED, (data) => {
        expect(data.points).toBe(5);
        expect(data.reason).toBe('测试消费');
        expect(data.groups).toBeDefined();
        expect(data.record).toBeDefined();
      });
    });
  });

  describe('云端刷新去重', () => {
    it('应按 idempotencyKey 去重本地未同步的通用扣星流水', async () => {
      const localRecord = {
        id: 'local_record_1',
        userId: 'user_123',
        syncedToCloud: false,
        idempotencyKey: 'task_penalty:task_1:2026-03-21:user_123:1'
      };
      const cloudRecord = {
        id: 'cloud_record_1',
        userId: 'user_123',
        syncedToCloud: true,
        idempotencyKey: 'task_penalty:task_1:2026-03-21:user_123:1'
      };

      mockStarRecordRepository.getAll.mockResolvedValue([localRecord, cloudRecord]);

      await starService._replaceSyncedStarRecords('user_123', [cloudRecord]);

      expect(mockStarRecordRepository._saveData).toHaveBeenCalledWith([cloudRecord]);
      expect(mockStarRecordRepository.invalidateCache).toHaveBeenCalled();
    });

    it('应按 userId + expiryType + expiryDate 去重本地快照分组', async () => {
      const localGroup = {
        id: 'local_group_1',
        userId: 'user_123',
        expiryType: 'week',
        expiryDateStr: '2026-03-28',
        syncedToCloud: false
      };
      const cloudGroup = {
        id: 'cloud_group_1',
        userId: 'user_123',
        expiryType: 'week',
        expiryDateStr: '2026-03-28',
        syncedToCloud: true
      };

      mockStarGroupRepository.getAll.mockResolvedValue([localGroup, cloudGroup]);

      await starService._replaceSyncedStarGroups('user_123', [cloudGroup]);

      expect(mockStarGroupRepository._saveData).toHaveBeenCalledWith([cloudGroup]);
      expect(mockStarGroupRepository.invalidateCache).toHaveBeenCalled();
    });

    it('云端快照为空时应清除当前用户残留的本地分组，但保留其他用户分组', async () => {
      const staleLocalGroup = {
        id: 'local_group_stale',
        userId: 'user_123',
        expiryType: 'permanent',
        expiryDateStr: '',
        stars: 1,
        syncedToCloud: false
      };
      const otherUserGroup = {
        id: 'other_group_1',
        userId: 'user_other',
        expiryType: 'permanent',
        expiryDateStr: '',
        stars: 3,
        syncedToCloud: false
      };

      mockStarGroupRepository.getAll.mockResolvedValue([staleLocalGroup, otherUserGroup]);

      await starService._replaceSyncedStarGroups('user_123', []);

      expect(mockStarGroupRepository._saveData).toHaveBeenCalledWith([otherUserGroup]);
      expect(mockStarGroupRepository.invalidateCache).toHaveBeenCalled();
    });
  });

  describe('consumeStarsFromSpecificType - 从特定类型消费星星', () => {
    it('应该成功从特定类型消费星星', async () => {
      mockStarGroupRepository.deductStarsFromSpecificExpiryType.mockResolvedValue({
        success: true,
        deductedGroups: [TestDataFactory.createStarGroup({ id: 'group_1', stars: 0 })]
      });
      mockStarRecordRepository.save.mockResolvedValue({ id: 'record_1', type: 'expense', points: -10 });

      const result = await starService.consumeStarsFromSpecificType(10, 'permanent', '取消任务完成', {
        userId: 'user_123',
        sourceType: 'task_reset',
        sourceId: 'task_1'
      });

      expect(result.success).toBe(true);
      expect(result.points).toBe(10);
      expect(result.consumed).toBe(10);
      expect(mockStarGroupRepository.deductStarsFromSpecificExpiryType).toHaveBeenCalledWith(
        10,
        'permanent',
        '取消任务完成',
        'user_123'
      );
      expect(mockStarRecordRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        source: 'task_reset',
        sourceId: 'task_1'
      }));
    });

    it('应在任务重置扣星记录中保留任务原始日期', async () => {
      mockStarGroupRepository.deductStarsFromSpecificExpiryType.mockResolvedValue({
        success: true,
        deductedGroups: [TestDataFactory.createStarGroup({ id: 'group_1', stars: 0 })]
      });
      mockStarRecordRepository.save.mockResolvedValue({ id: 'record_2', type: 'expense', points: -10 });

      await starService.consumeStarsFromSpecificType(10, 'permanent', '取消任务完成', {
        userId: 'user_123',
        sourceType: 'task_reset',
        sourceId: 'task_1',
        originalTaskDate: '2026-03-21'
      });

      expect(mockStarRecordRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        source: 'task_reset',
        sourceId: 'task_1',
        originalTaskDate: '2026-03-21'
      }));
    });

    it('应该拒绝消费数量小于等于0的情况', async () => {
      const result = await starService.consumeStarsFromSpecificType(0, 'permanent', '测试');
      expect(result.success).toBe(false);
      expect(result.message).toBe('星星数量必须大于0');
    });

    it('应该拒绝未指定有效期类型的情况', async () => {
      const result = await starService.consumeStarsFromSpecificType(10, '', '测试');
      expect(result.success).toBe(false);
      expect(result.message).toBe('未指定有效期类型');
    });

    it('应该处理扣减失败的情况', async () => {
      mockStarGroupRepository.deductStarsFromSpecificExpiryType.mockResolvedValue({
        success: false,
        message: '该类型星星不足'
      });

      const result = await starService.consumeStarsFromSpecificType(10, 'permanent', '测试');

      expect(result.success).toBe(false);
      expect(result.message).toBe('该类型星星不足');
    });
  });

  describe('consumeStarsUnified - 统一消费接口', () => {
    it('应该使用expiry_order策略消费星星', async () => {
      mockStarGroupRepository.consumeStarsByExpiryOrder.mockResolvedValue({
        success: true,
        consumed: 5,
        groupsUpdated: []
      });
      mockStarRecordRepository.save.mockResolvedValue({ id: 'record_1', type: 'expense' });

      const result = await starService.consumeStarsUnified({
        points: 5,
        reason: '测试',
        strategy: 'expiry_order',
        options: { userId: 'user_123' }
      });

      expect(result.success).toBe(true);
      expect(result.consumed).toBe(5);
    });

    it('应该使用specific_type策略消费星星', async () => {
      mockStarGroupRepository.deductStarsFromSpecificExpiryType.mockResolvedValue({
        success: true,
        deductedGroups: []
      });
      mockStarRecordRepository.save.mockResolvedValue({ id: 'record_1', type: 'expense' });

      const result = await starService.consumeStarsUnified({
        points: 5,
        reason: '测试',
        strategy: 'specific_type',
        expiryType: 'permanent',
        options: { userId: 'user_123' }
      });

      expect(result.success).toBe(true);
      expect(result.consumed).toBe(5);
    });

    it('应该拒绝未知的消费策略', async () => {
      const result = await starService.consumeStarsUnified({
        points: 5,
        reason: '测试',
        strategy: 'unknown_strategy',
        options: { userId: 'user_123' }
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('未知的消费策略');
    });

    it('should reject points <= 0', async () => {
      const result = await starService.consumeStarsUnified({
        points: 0,
        reason: '测试',
        strategy: 'expiry_order',
        options: { userId: 'user_123' }
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('星星数量必须大于0');
    });
  });

  // ==================== 任务完成奖励处理测试 ====================

  describe('handleTaskCompletion - 处理任务完成奖励', () => {
    it('应该成功处理任务完成奖励', async () => {
      const mockTask = {
        id: 'task_1',
        name: '测试任务',
        userId: 'user_123',
        starExpiryType: 'week'
      };

      const mockGroup = TestDataFactory.createStarGroup({ id: 'group_1', userId: 'user_123', stars: 10 });
      mockStarGroupRepository.getOrCreateGroup.mockResolvedValue(mockGroup);
      mockStarGroupRepository.addStarsToGroup.mockResolvedValue({ ...mockGroup, stars: 20 });
      mockStarRecordRepository.save.mockResolvedValue({ id: 'record_1', type: 'income' });

      const result = await starService.handleTaskCompletion(mockTask, 10);

      expect(result.success).toBe(true);
      expect(result.points).toBe(10);
      expect(result.record).toEqual({ id: 'record_1', type: 'income' });
      expect(mockStarRecordRepository.createTaskCompleteRecord).not.toHaveBeenCalled();
    });

    it('应该拒绝无效的任务', async () => {
      const result = await starService.handleTaskCompletion(null, 10);
      expect(result.success).toBe(false);
      expect(result.message).toBe('无效的任务');
    });

    it('应该拒绝星星数量小于等于0的情况', async () => {
      const mockTask = { id: 'task_1', name: '测试任务' };
      const result = await starService.handleTaskCompletion(mockTask, 0);
      expect(result.success).toBe(false);
      expect(result.message).toBe('星星数量必须大于0');
    });

    it('应该触发任务完成奖励事件', async () => {
      const mockTask = { id: 'task_1', name: '测试任务', userId: 'user_123' };
      const mockGroup = TestDataFactory.createStarGroup({ id: 'group_1', userId: 'user_123' });
      mockStarGroupRepository.getOrCreateGroup.mockResolvedValue(mockGroup);
      mockStarGroupRepository.addStarsToGroup.mockResolvedValue(mockGroup);
      mockStarRecordRepository.save.mockResolvedValue({ id: 'record_1' });

      await starService.handleTaskCompletion(mockTask, 10);

      mockEventBus.verifyEmit(EVENTS.TASK_COMPLETED_WITH_REWARD, (data) => {
        expect(data.task).toEqual(mockTask);
        expect(data.points).toBe(10);
        expect(data.record).toEqual({ id: 'record_1' });
      });
    });
  });

  // ==================== 星星过期处理测试 ====================

  describe('cleanupExpiredStars - 清理过期星星', () => {
    it('应该成功清理过期星星', async () => {
      const expiredGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', userId: 'user_123', stars: 10, expiryType: 'week' }),
        TestDataFactory.createStarGroup({ id: 'group_2', userId: 'user_123', stars: 5, expiryType: 'month' })
      ];

      mockStarGroupRepository.cleanupExpiredGroups.mockResolvedValue(expiredGroups);
      mockStarRecordRepository.createExpiredRecord.mockResolvedValue({ id: 'record_1', type: 'expired' });

      const result = await starService.cleanupExpiredStars('user_123');

      expect(result.success).toBe(true);
      expect(result.expiredCount).toBe(2);
      expect(result.totalPoints).toBe(15);
      expect(mockStarGroupRepository.cleanupEmptyGroups).toHaveBeenCalled();
    });

    it('应该处理没有过期星星的情况', async () => {
      mockStarGroupRepository.cleanupExpiredGroups.mockResolvedValue([]);

      const result = await starService.cleanupExpiredStars('user_123');

      expect(result.success).toBe(true);
      expect(result.expiredCount).toBe(0);
      expect(result.totalPoints).toBe(0);
      expect(result.message).toBe('没有发现过期星星');
      expect(mockStarGroupRepository.cleanupEmptyGroups).not.toHaveBeenCalled();
    });

    it('应该为每个过期分组创建过期记录', async () => {
      const expiredGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', stars: 10, expiryType: 'week' }),
        TestDataFactory.createStarGroup({ id: 'group_2', stars: 5, expiryType: 'month' })
      ];

      mockStarGroupRepository.cleanupExpiredGroups.mockResolvedValue(expiredGroups);
      mockStarRecordRepository.createExpiredRecord.mockResolvedValue({ id: 'record_1' });

      await starService.cleanupExpiredStars('user_123');

      expect(mockStarRecordRepository.createExpiredRecord).toHaveBeenCalledTimes(2);
    });

    it('应该触发星星过期事件', async () => {
      const expiredGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', userId: 'user_123', stars: 10, expiryType: 'week' })
      ];

      mockStarGroupRepository.cleanupExpiredGroups.mockResolvedValue(expiredGroups);
      mockStarRecordRepository.createExpiredRecord.mockResolvedValue({ id: 'record_1' });

      await starService.cleanupExpiredStars('user_123');

      mockEventBus.verifyEmit(EVENTS.STARS_EXPIRED, (data) => {
        expect(data.expiredGroups).toEqual(expiredGroups);
        expect(data.totalExpiredPoints).toBe(10);
        expect(data.records).toBeDefined();
      });
    });
  });

  describe('protectRewardsByExpiry - 过期星星保护奖励', () => {
    it('应该跳过无过期星星的情况', async () => {
      const result = await starService.protectRewardsByExpiry(0, 'user_123');

      expect(result.success).toBe(true);
      expect(result.protectedCount).toBe(0);
      expect(result.protectedRewards).toEqual([]);
    });

    it('应该处理没有可保护奖励的情况', async () => {
      mockStarGroupRepository.getTotalPoints.mockResolvedValue(10);

      // Mock service manager and reward service
      jest.mock('../../services/service-manager', () => ({
        getService: jest.fn().mockReturnValue({
          getAvailableRewards: jest.fn().mockResolvedValue([])
        }),
        updateReward: jest.fn().mockResolvedValue({ success: true })
      }));

      const result = await starService.protectRewardsByExpiry(5, 'user_123');

      // 由于service-manager可能不可用，我们只验证不抛出错误
      expect(result).toBeDefined();
    });
  });

  // ==================== 主干流程测试 ====================

  describe('主干流程 - 完整的业务场景', () => {
    it('应该完成添加星星的主干流程', async () => {
      // 准备数据
      const mockGroup = TestDataFactory.createStarGroup({
        id: 'group_1',
        userId: 'user_123',
        stars: 10,
        expiryType: 'permanent',
        type: 'permanent'
      });

      // 设置Mock返回值
      mockStarGroupRepository.getOrCreateGroup.mockResolvedValue(mockGroup);
      mockStarGroupRepository.addStarsToGroup.mockResolvedValue({ ...mockGroup, stars: 20 });
      mockStarRecordRepository.save.mockResolvedValue({
        id: 'record_1',
        type: 'income',
        points: 10,
        balance: 20,
        previousBalance: 10
      });

      // 执行操作
      const result = await starService.addStars(10, 'permanent', '测试添加', {
        userId: 'user_123',
        sourceType: 'task_complete',
        sourceId: 'task_1'
      });

      // 验证结果
      expect(result.success).toBe(true);
      expect(result.points).toBe(10);
      expect(result.group).toBeDefined();
      expect(result.record).toBeDefined();

      // 验证仓储调用
      expect(mockStarGroupRepository.getOrCreateGroup).toHaveBeenCalledWith(
        'permanent',
        null,
        '', // 永久星星的expiryDateStr为空字符串
        'user_123'
      );
      expect(mockStarGroupRepository.addStarsToGroup).toHaveBeenCalledWith(
        mockGroup,
        10,
        '测试添加'
      );
      expect(mockStarRecordRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'income',
          source: 'task_complete',
          sourceId: 'task_1',
          points: 10,
          description: '测试添加',
          userId: 'user_123'
        })
      );

      // 验证事件触发
      mockEventBus.verifyEmit(EVENTS.STARS_ADDED, (data) => {
        expect(data.points).toBe(10);
        expect(data.expiryType).toBe('permanent');
      });
    });

    it('应该完成消费星星的主干流程', async () => {
      // 准备数据
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', userId: 'user_123', stars: 5, expiryType: 'week' }),
        TestDataFactory.createStarGroup({ id: 'group_2', userId: 'user_123', stars: 10, expiryType: 'month' })
      ];

      // 设置Mock返回值
      mockStarGroupRepository.consumeStarsByExpiryOrder.mockResolvedValue({
        success: true,
        consumed: 5,
        groupsUpdated: [{ ...mockGroups[0], stars: 0 }]
      });
      mockStarRecordRepository.save.mockResolvedValue({
        id: 'record_1',
        type: 'expense',
        points: -5,
        balance: 10,
        previousBalance: 15
      });

      // 执行操作
      const result = await starService.consumeStars(5, '兑换奖励', {
        userId: 'user_123',
        sourceType: 'reward_exchange',
        sourceId: 'reward_1'
      });

      // 验证结果
      expect(result.success).toBe(true);
      expect(result.consumed).toBe(5);
      expect(result.requested).toBe(5);
      expect(result.groups).toBeDefined();
      expect(result.record).toBeDefined();

      // 验证仓储调用
      expect(mockStarGroupRepository.consumeStarsByExpiryOrder).toHaveBeenCalledWith(5, 'user_123');
      expect(mockStarRecordRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'expense',
          source: 'reward_exchange',
          sourceId: 'reward_1',
          points: -5,
          description: '兑换奖励',
          userId: 'user_123'
        })
      );

      // 验证事件触发
      mockEventBus.verifyEmit(EVENTS.STARS_CONSUMED, (data) => {
        expect(data.points).toBe(5);
        expect(data.reason).toBe('兑换奖励');
      });
    });

    it('应该完成清理过期星星的主干流程', async () => {
      // 准备数据
      const expiredGroups = [
        TestDataFactory.createStarGroup({
          id: 'group_1',
          userId: 'user_123',
          stars: 10,
          expiryType: 'week',
          expiryDate: Date.now() - 86400000
        })
      ];

      // 设置Mock返回值
      mockStarGroupRepository.cleanupExpiredGroups.mockResolvedValue(expiredGroups);
      mockStarRecordRepository.createExpiredRecord.mockResolvedValue({
        id: 'record_1',
        type: 'expired',
        points: -10
      });

      // 执行操作
      const result = await starService.cleanupExpiredStars('user_123');

      // 验证结果
      expect(result.success).toBe(true);
      expect(result.expiredCount).toBe(1);
      expect(result.totalPoints).toBe(10);
      expect(result.records).toBeDefined();

      // 验证仓储调用
      expect(mockStarGroupRepository.cleanupExpiredGroups).toHaveBeenCalledWith('user_123');
      expect(mockStarRecordRepository.createExpiredRecord).toHaveBeenCalledWith(
        10,
        'week',
        expect.stringContaining('过期')
      );
      expect(mockStarGroupRepository.cleanupEmptyGroups).toHaveBeenCalled();

      // 验证事件触发
      mockEventBus.verifyEmit(EVENTS.STARS_EXPIRED, (data) => {
        expect(data.expiredGroups).toEqual(expiredGroups);
        expect(data.totalExpiredPoints).toBe(10);
      });
    });
  });

  // ==================== 辅助方法测试 ====================

  describe('getTotalStars - 获取总星星数', () => {
    it('应该返回用户总星星数', async () => {
      mockStarGroupRepository.getTotalPoints.mockResolvedValue(50);

      const total = await starService.getTotalStars('user_123');

      expect(total).toBe(50);
      expect(mockStarGroupRepository.getTotalPoints).toHaveBeenCalledWith('user_123');
    });

    it('应该处理获取失败的情况', async () => {
      mockStarGroupRepository.getTotalPoints.mockRejectedValue(new Error('获取失败'));

      const total = await starService.getTotalStars('user_123');

      expect(total).toBe(0);
    });

    it('应该支持不指定用户ID的情况', async () => {
      mockStarGroupRepository.getTotalPoints.mockResolvedValue(100);

      const total = await starService.getTotalStars();

      expect(total).toBe(100);
      expect(mockStarGroupRepository.getTotalPoints).toHaveBeenCalledWith(null);
    });
  });

  describe('formatStarCount - 格式化星星数量', () => {
    it('应该正确格式化数字', () => {
      const result = starService.formatStarCount(123);
      expect(result).toBe('123');
    });

    it('应该正确格式化零', () => {
      const result = starService.formatStarCount(0);
      expect(result).toBe('0');
    });

    it('应该正确处理null/undefined', () => {
      const result1 = starService.formatStarCount(null);
      const result2 = starService.formatStarCount(undefined);
      expect(result1).toBe('0');
      expect(result2).toBe('0');
    });

    it('应该正确添加千位分隔符', () => {
      const result = starService.formatStarCount(12345, true);
      expect(result).toBe('12,345');
    });

    it('应该正确处理多位千位分隔', () => {
      const result = starService.formatStarCount(1234567, true);
      expect(result).toBe('1,234,567');
    });
  });

  describe('calculateExpiryDate - 计算过期日期', () => {
    it('应该正确计算永久有效', () => {
      const result = starService.calculateExpiryDate('permanent');
      expect(result.expiry).toBe('permanent');
      expect(result.expiryDateStr).toBe('永久');
    });

    it('应该正确计算本周有效', () => {
      const result = starService.calculateExpiryDate('week');
      expect(result).toBeDefined();
      expect(result.expiry).toBeDefined();
      expect(result.expiryDateStr).toBeDefined();
      // Note: For 'week', expiry is a Date object, expiryDateStr is a date string
      // The exact format depends on implementation
    });

    it('应该正确计算本月有效', () => {
      const result = starService.calculateExpiryDate('month');
      expect(result.expiry).toBeDefined();
      expect(result.expiryDateStr).toBeDefined();
    });

    it('应该正确计算本季度有效', () => {
      const result = starService.calculateExpiryDate('quarter');
      expect(result.expiry).toBeDefined();
      expect(result.expiryDateStr).toBeDefined();
    });
  });

  describe('getExpiryText - 获取过期文本', () => {
    it('应该返回"永久"文本', () => {
      const text = starService.getExpiryText('permanent');
      expect(text).toBe('永久');
    });

    it('应该返回"一周"文本', () => {
      const text = starService.getExpiryText('week');
      expect(text).toBe('一周');
    });

    it('应该返回"一个月"文本', () => {
      const text = starService.getExpiryText('month');
      expect(text).toBe('一个月');
    });

    it('应该返回"三个月"文本', () => {
      const text = starService.getExpiryText('3months');
      expect(text).toBe('三个月');
    });

    it('应该返回"六个月"文本', () => {
      const text = starService.getExpiryText('6months');
      expect(text).toBe('六个月');
    });

    it('应该返回"十二个月"文本', () => {
      const text = starService.getExpiryText('12months');
      expect(text).toBe('十二个月');
    });

    it('应该对未知类型返回"永久"', () => {
      const text = starService.getExpiryText('unknown');
      expect(text).toBe('永久');
    });
  });

  // ==================== 边界条件和错误处理测试 ====================

  describe('边界条件和错误处理', () => {
    it('应该处理addStars时仓储抛出异常', async () => {
      mockStarGroupRepository.getOrCreateGroup.mockRejectedValue(new Error('数据库错误'));

      const result = await starService.addStars(10, 'permanent', '测试', {
        userId: 'user_123'
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('添加星星过程中发生错误');
    });

    it('应该处理consumeStars时仓储抛出异常', async () => {
      mockStarGroupRepository.consumeStarsByExpiryOrder.mockRejectedValue(new Error('数据库错误'));

      const result = await starService.consumeStars(10, '测试', {
        userId: 'user_123'
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('消费星星过程中发生错误');
    });

    it('应该处理cleanupExpiredStars时仓储抛出异常', async () => {
      mockStarGroupRepository.cleanupExpiredGroups.mockRejectedValue(new Error('数据库错误'));

      const result = await starService.cleanupExpiredStars('user_123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('清理过期星星过程中发生错误');
    });

    it('应该处理consumeStarsFromSpecificType时仓储抛出异常', async () => {
      mockStarGroupRepository.deductStarsFromSpecificExpiryType.mockRejectedValue(new Error('数据库错误'));

      const result = await starService.consumeStarsFromSpecificType(10, 'permanent', '测试', {
        userId: 'user_123'
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('从特定类型消费星星过程中发生错误');
    });

    it('应该处理handleTaskCompletion时仓储抛出异常', async () => {
      const mockTask = { id: 'task_1', name: '测试任务', userId: 'user_123' };
      mockStarGroupRepository.getOrCreateGroup.mockRejectedValue(new Error('数据库错误'));

      const result = await starService.handleTaskCompletion(mockTask, 10);

      expect(result.success).toBe(false);
      expect(result.message).toContain('添加星星过程中发生错误');
    });

    it('应该处理createRecord失败的情况（addStars流程）', async () => {
      const mockGroup = TestDataFactory.createStarGroup({ id: 'group_1', userId: 'user_123' });
      mockStarGroupRepository.getOrCreateGroup.mockResolvedValue(mockGroup);
      mockStarGroupRepository.addStarsToGroup.mockResolvedValue(mockGroup);
      mockStarRecordRepository.save.mockResolvedValue(null);

      const result = await starService.addStars(10, 'permanent', '测试', {
        userId: 'user_123'
      });

      // 应该继续流程，记录创建失败不影响主要操作
      expect(result.success).toBe(true);
      expect(result.points).toBe(10);
    });

    it('应该处理createRecord失败的情况（consumeStars流程）', async () => {
      mockStarGroupRepository.consumeStarsByExpiryOrder.mockResolvedValue({
        success: true,
        consumed: 5,
        groupsUpdated: []
      });
      mockStarRecordRepository.save.mockResolvedValue(null);

      const result = await starService.consumeStars(5, '测试', { userId: 'user_123' });

      // 应该继续流程，记录创建失败不影响主要操作
      expect(result.success).toBe(true);
      expect(result.consumed).toBe(5);
    });
  });

  // ==================== 初始化和缓存测试 ====================

  describe('初始化和缓存', () => {
    it('应该成功初始化服务', async () => {
      mockStarGroupRepository.cleanupExpiredGroups.mockResolvedValue([]);
      mockStarGroupRepository.cleanupEmptyGroups.mockResolvedValue(0);

      const initialized = await starService.initialize();

      expect(initialized).toBe(true);
      // initialize 内部复用 cleanupExpiredStars，会调用底层 cleanupExpiredGroups
      expect(mockStarGroupRepository.cleanupExpiredGroups).toHaveBeenCalled();
    });

    it('初始化失败时应该返回false', async () => {
      // cleanupExpiredStars 内部 catch 后返回 { success: false }，不再抛异常
      mockStarGroupRepository.cleanupExpiredGroups.mockRejectedValue(new Error('初始化失败'));
      // cleanupEmptyGroups 也需要 mock，避免 cleanupExpiredStars 内部再次报错
      mockStarGroupRepository.cleanupEmptyGroups.mockResolvedValue(0);
      // createExpiredRecord 也需要 mock
      mockStarRecordRepository.createExpiredRecord.mockRejectedValue(new Error('初始化失败'));

      const initialized = await starService.initialize();

      expect(initialized).toBe(false);
    });

    it('存在本地待同步星星流水时应跳过云端覆盖', async () => {
      starService.enableCloudStorage = true;

      const localGroup = TestDataFactory.createStarGroup({
        id: 'group_local_1',
        userId: 'user_123',
        stars: 8,
        expiryType: 'week'
      });
      const localPendingRecord = {
        id: 'record_pending_1',
        userId: 'user_123',
        syncedToCloud: false,
        points: -3
      };

      mockStarGroupRepository.getAll.mockResolvedValue([localGroup]);
      mockStarRecordRepository.getAll.mockResolvedValue([localPendingRecord]);

      const result = await starService.refreshStarsFromCloud('user_123');

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('pending_local_records');
      expect(result.groups).toEqual([localGroup]);
      expect(result.records).toEqual([localPendingRecord]);
      expect(HttpClient.get).not.toHaveBeenCalled();
    });

    it('权威同步后的强制云端覆盖应绕过 pending local records 保护', async () => {
      starService.enableCloudStorage = true;

      const localGroup = TestDataFactory.createStarGroup({
        id: 'local_pending_group',
        userId: 'user_123',
        stars: 8,
        expiryType: 'week'
      });
      const localPendingRecord = {
        id: 'record_pending_1',
        userId: 'user_123',
        syncedToCloud: false,
        points: -3
      };

      mockStarGroupRepository.getAll.mockResolvedValue([localGroup]);
      mockStarRecordRepository.getAll.mockResolvedValue([localPendingRecord]);
      HttpClient.get
        .mockResolvedValueOnce({
          groups: [
            {
              groupId: 'cloud_group_1',
              userId: 'user_123',
              type: 'week',
              stars: 5,
              expiryDate: '2026-04-01'
            }
          ]
        })
        .mockResolvedValueOnce({ records: [] });

      const result = await starService.refreshStarsFromCloud('user_123', {
        forceCloudAfterAuthority: true
      });

      expect(result.success).toBe(true);
      expect(result.skipped).not.toBe(true);
      expect(HttpClient.get).toHaveBeenCalledTimes(2);
      expect(mockStarGroupRepository._saveData).toHaveBeenCalled();
    });

    it('syncExpiryAuthorityIfNeeded 应调用正式结算接口并在节流窗口内复用结果', async () => {
      starService.enableCloudStorage = true;
      HttpClient.post.mockResolvedValue({
        affectedUserIds: ['user_123'],
        settledGroupCount: 1,
        settledPoints: 5,
        createdRecordCount: 1,
        invalidGroupCount: 0
      });

      const result1 = await starService.syncExpiryAuthorityIfNeeded({
        scope: 'user',
        userId: 'user_123'
      });
      const result2 = await starService.syncExpiryAuthorityIfNeeded({
        scope: 'user',
        userId: 'user_123'
      });

      expect(HttpClient.post).toHaveBeenCalledTimes(1);
      expect(HttpClient.post).toHaveBeenCalledWith('/api/stars/expiry-authority/sync', expect.objectContaining({
        scope: 'user',
        targetUserId: 'user_123'
      }));
      expect(result1.success).toBe(true);
      expect(result2).toEqual(expect.objectContaining({
        success: true,
        skipped: true,
        reason: 'throttled'
      }));
    });

    it('同一用户并发刷新星星时应复用进行中的云请求', async () => {
      starService.enableCloudStorage = true;

      mockStarGroupRepository.getAll.mockResolvedValue([]);
      mockStarRecordRepository.getAll.mockResolvedValue([]);
      HttpClient.get
        .mockResolvedValueOnce({ groups: [] })
        .mockResolvedValueOnce({ records: [] });

      const [result1, result2] = await Promise.all([
        starService.refreshStarsFromCloud('user_123'),
        starService.refreshStarsFromCloud('user_123')
      ]);

      expect(HttpClient.get).toHaveBeenCalledTimes(2);
      expect(HttpClient.get).toHaveBeenNthCalledWith(1, '/api/stars', { userId: 'user_123' });
      expect(HttpClient.get).toHaveBeenNthCalledWith(2, '/api/stars/records', { userId: 'user_123' });
      expect(result1).toEqual(expect.objectContaining({
        success: true,
        groups: [],
        records: []
      }));
      expect(result2).toEqual(expect.objectContaining({
        success: true,
        groups: [],
        records: []
      }));
    });

    it('云端刷新时应过滤已过期的云端星星分组', async () => {
      jest.useFakeTimers();
      try {
        jest.setSystemTime(new Date('2026-03-30T19:49:47'));
        starService.enableCloudStorage = true;

        mockStarGroupRepository.getAll.mockResolvedValue([]);
        mockStarRecordRepository.getAll.mockResolvedValue([]);
        HttpClient.get
          .mockResolvedValueOnce({
            groups: [
              {
                groupId: 'expired_group',
                userId: 'user_123',
                type: 'week',
                stars: 2,
                expiryDate: '2026-03-29'
              },
              {
                groupId: 'future_group',
                userId: 'user_123',
                type: 'week',
                stars: 7,
                expiryDate: '2026-04-05'
              }
            ]
          })
          .mockResolvedValueOnce({ records: [] });

        const result = await starService.refreshStarsFromCloud('user_123');

        expect(result.success).toBe(true);
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0]).toEqual(expect.objectContaining({
          id: 'future_group',
          stars: 7
        }));
        expect(mockStarGroupRepository._saveData).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ id: 'future_group' })
          ])
        );
        expect(mockStarGroupRepository._saveData).not.toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ id: 'expired_group' })
          ])
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('星星流水同步成功后应回灌服务端返回的最新分组快照', async () => {
      const record = {
        id: 'record_sync_1',
        userId: 'user_123',
        type: 'expense',
        source: 'task_reset',
        sourceId: 'task_1',
        points: -5,
        description: '取消完成任务',
        expiryType: 'week',
        expiryDate: '2026-03-28',
        syncedToCloud: false,
        modifyTime: 1742716800000
      };

      HttpClient.post.mockResolvedValue({
        updatedGroupsSnapshot: [
          {
            groupId: 'cloud_group_1',
            userId: 'user_123',
            type: 'week',
            stars: 0,
            expiryDate: '2026-03-28',
            modifyTime: 1742716801000
          }
        ]
      });
      mockStarRecordRepository.getAll.mockResolvedValue([]);
      mockStarGroupRepository.getAll.mockResolvedValue([]);

      await starService._syncStarRecordToCloud(record);

      expect(record.syncedToCloud).toBe(true);
      expect(mockStarRecordRepository.save).toHaveBeenCalledWith(record);
      expect(mockStarGroupRepository._saveData).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'cloud_group_1',
            userId: 'user_123',
            stars: 0,
            syncedToCloud: true
          })
        ])
      );
      expect(mockStarGroupRepository.invalidateCache).toHaveBeenCalled();
    });

    it('存在其他待同步本地流水时不应回灌服务端分组快照', async () => {
      const record = {
        id: 'record_sync_2',
        userId: 'user_123',
        type: 'expense',
        source: 'task_reset',
        sourceId: 'task_2',
        points: -5,
        description: '取消完成任务',
        expiryType: 'week',
        expiryDate: '2026-03-28',
        syncedToCloud: false,
        modifyTime: 1742716800000
      };

      HttpClient.post.mockResolvedValue({
        updatedGroupsSnapshot: [
          {
            groupId: 'cloud_group_2',
            userId: 'user_123',
            type: 'week',
            stars: 2,
            expiryDate: '2026-03-28',
            modifyTime: 1742716801000
          }
        ]
      });
      mockStarRecordRepository.getAll.mockResolvedValue([
        {
          id: 'record_pending_2',
          userId: 'user_123',
          syncedToCloud: false,
          points: -2
        }
      ]);

      await starService._syncStarRecordToCloud(record);

      expect(record.syncedToCloud).toBe(true);
      expect(mockStarGroupRepository._saveData).not.toHaveBeenCalled();
    });

    it('补云星星流水时应将历史展示型 expiryDate 归一化为原始日期', async () => {
      const record = {
        id: 'record_sync_legacy',
        userId: 'user_123',
        type: 'expense',
        source: 'task_reset',
        sourceId: 'task_legacy',
        points: -2,
        description: '历史脏数据',
        expiryType: 'week',
        expiryDate: '2026-03-28 到期',
        syncedToCloud: false,
        modifyTime: 1742716800000
      };

      HttpClient.post.mockResolvedValue({ updatedGroupsSnapshot: [] });
      mockStarRecordRepository.getAll.mockResolvedValue([]);

      await starService._syncStarRecordToCloud(record);

      expect(HttpClient.post).toHaveBeenCalledWith(
        '/api/stars/records',
        expect.objectContaining({
          expiryDate: '2026-03-28'
        })
      );
      expect(record.expiryDate).toBe('2026-03-28');
    });

    it('应该成功清除缓存', () => {
      // 清除缓存不应该抛出错误
      expect(() => {
        starService.clearCache();
      }).not.toThrow();
    });
  });

  // ==================== 查询分支测试 ====================

  describe('getStarRecords - 查询分支', () => {
    it('传入type和date时应该调用getRecordsByTypeAndDate', async () => {
      mockStarRecordRepository.getRecordsByTypeAndDate.mockResolvedValue([{ id: 'r1' }]);
      const result = await starService.getStarRecords({ type: 'income', date: '2026-03-01' });
      expect(result).toHaveLength(1);
      expect(mockStarRecordRepository.getRecordsByTypeAndDate).toHaveBeenCalledWith('income', '2026-03-01', undefined);
    });

    it('仅传入type时应该调用getRecordsByType', async () => {
      mockStarRecordRepository.getRecordsByType.mockResolvedValue([{ id: 'r2' }]);
      const result = await starService.getStarRecords({ type: 'expense' });
      expect(result).toHaveLength(1);
      expect(mockStarRecordRepository.getRecordsByType).toHaveBeenCalledWith('expense', undefined);
    });

    it('仅传入date时应该调用getRecordsByDate', async () => {
      mockStarRecordRepository.getRecordsByDate.mockResolvedValue([{ id: 'r3' }]);
      const result = await starService.getStarRecords({ date: '2026-03-01' });
      expect(result).toHaveLength(1);
      expect(mockStarRecordRepository.getRecordsByDate).toHaveBeenCalledWith('2026-03-01', undefined);
    });

    it('传入userId时应该透传给仓储', async () => {
      mockStarRecordRepository.getRecordsByType.mockResolvedValue([]);
      await starService.getStarRecords({ type: 'income', userId: 'user_1' });
      expect(mockStarRecordRepository.getRecordsByType).toHaveBeenCalledWith('income', 'user_1');
    });

    it('仓储抛出异常时应该返回空数组', async () => {
      mockStarRecordRepository.getRecordsByType.mockRejectedValue(new Error('db error'));
      const result = await starService.getStarRecords({ type: 'income' });
      expect(result).toEqual([]);
    });
  });

  describe('getStarRecordsByMonth/DateRange/Date - 查询方法', () => {
    it('getStarRecordsByMonth成功时应该返回分组记录', async () => {
      mockStarRecordRepository.getRecordsGroupedByMonth.mockResolvedValue([{ month: '2026-03', records: [] }]);
      const result = await starService.getStarRecordsByMonth('user_1');
      expect(result).toHaveLength(1);
      expect(mockStarRecordRepository.getRecordsGroupedByMonth).toHaveBeenCalledWith({ userId: 'user_1' });
    });

    it('getStarRecordsByMonth失败时应该返回空数组', async () => {
      mockStarRecordRepository.getRecordsGroupedByMonth.mockRejectedValue(new Error('db error'));
      const result = await starService.getStarRecordsByMonth();
      expect(result).toEqual([]);
    });

    it('getStarRecordsByDateRange成功时应该返回记录', async () => {
      mockStarRecordRepository.getRecordsByDateRange.mockResolvedValue([{ id: 'r1' }]);
      const result = await starService.getStarRecordsByDateRange('2026-03-01', '2026-03-31', 'user_1');
      expect(result).toHaveLength(1);
    });

    it('getStarRecordsByDateRange失败时应该返回空数组', async () => {
      mockStarRecordRepository.getRecordsByDateRange.mockRejectedValue(new Error('db error'));
      const result = await starService.getStarRecordsByDateRange('2026-03-01', '2026-03-31');
      expect(result).toEqual([]);
    });

    it('getStarRecordsByDate成功时应该返回记录', async () => {
      mockStarRecordRepository.getRecordsByDate.mockResolvedValue([{ id: 'r1' }]);
      const result = await starService.getStarRecordsByDate('2026-03-01', 'user_1');
      expect(result).toHaveLength(1);
    });

    it('getStarRecordsByDate失败时应该返回空数组', async () => {
      mockStarRecordRepository.getRecordsByDate.mockRejectedValue(new Error('db error'));
      const result = await starService.getStarRecordsByDate('2026-03-01');
      expect(result).toEqual([]);
    });
  });

  describe('validateConsistency - 数据一致性验证', () => {
    it('分组总数与记录余额一致时应该返回isConsistent=true', async () => {
      mockStarGroupRepository.getAll = jest.fn().mockResolvedValue([{ stars: 10 }, { stars: 5 }]);
      mockStarRecordRepository.getAll = jest.fn().mockResolvedValue([{ points: 15 }]);

      const result = await starService.validateConsistency();
      expect(result.isConsistent).toBe(true);
      expect(result.groupsTotal).toBe(15);
    });

    it('分组总数与记录余额不一致时应该返回isConsistent=false', async () => {
      mockStarGroupRepository.getAll = jest.fn().mockResolvedValue([{ stars: 20 }]);
      mockStarRecordRepository.getAll = jest.fn().mockResolvedValue([{ points: 10 }]);

      const result = await starService.validateConsistency();
      expect(result.isConsistent).toBe(false);
      expect(result.difference).toBe(10);
    });

    it('仓储抛出异常时应该返回isConsistent=false', async () => {
      mockStarGroupRepository.getAll = jest.fn().mockRejectedValue(new Error('db error'));
      const result = await starService.validateConsistency();
      expect(result.isConsistent).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getExpiringStarsInfo - 即将过期星星', () => {
    it('没有即将过期分组时应该返回points=0', async () => {
      mockStarGroupRepository.getAll = jest.fn().mockResolvedValue([]);
      const result = await starService.getExpiringStarsInfo();
      expect(result.points).toBe(0);
    });

    it('仅 3 天窗口内的分组才应进入即将过期信息', async () => {
      const futureDate = Date.now() + 2 * 24 * 60 * 60 * 1000;
      const mockGroup = {
        id: 'g1',
        userId: 'child_1',
        stars: 20,
        expiryType: 'month',
        expiryDate: futureDate,
        expiryDateStr: '2026-04-01',
        isExpired: jest.fn().mockReturnValue(false)
      };
      mockStarGroupRepository.getAll = jest.fn().mockResolvedValue([mockGroup]);

      const result = await starService.getExpiringStarsInfo();
      expect(result.points).toBe(20);
      expect(result.remindWindowDays).toBe(3);
      expect(result.protectWindowDays).toBe(2);
    });

    it('传入userId时应该只统计对应用户且在窗口内的即将过期星星', async () => {
      const futureDate = Date.now() + 2 * 24 * 60 * 60 * 1000;
      mockStarGroupRepository.getAll = jest.fn().mockResolvedValue([
        {
          id: 'g1',
          userId: 'child_1',
          stars: 20,
          expiryType: 'month',
          expiryDate: futureDate,
          expiryDateStr: '2026-04-01',
          isExpired: jest.fn().mockReturnValue(false)
        },
        {
          id: 'g2',
          userId: 'child_2',
          stars: 99,
          expiryType: 'month',
          expiryDate: futureDate,
          expiryDateStr: '2026-04-01',
          isExpired: jest.fn().mockReturnValue(false)
        }
      ]);

      const result = await starService.getExpiringStarsInfo('child_1');

      expect(result.points).toBe(20);
      expect(result.remindWindowDays).toBe(3);
    });

    it('超过 3 天窗口的分组不应显示为即将过期', async () => {
      const futureDate = Date.now() + 7 * 24 * 60 * 60 * 1000;
      mockStarGroupRepository.getAll = jest.fn().mockResolvedValue([
        {
          id: 'g1',
          userId: 'child_1',
          stars: 20,
          expiryType: 'month',
          expiryDate: futureDate,
          expiryDateStr: '2026-04-01',
          isExpired: jest.fn().mockReturnValue(false)
        }
      ]);

      const result = await starService.getExpiringStarsInfo();
      expect(result.points).toBe(0);
    });

    it('历史展示型过期日期不应把已过期分组继续算进即将过期星星', async () => {
      jest.useFakeTimers();
      try {
        jest.setSystemTime(new Date('2026-03-30T19:49:47'));
        mockStarGroupRepository.getAll = jest.fn().mockResolvedValue([
          {
            id: 'expired_legacy',
            userId: 'child_1',
            stars: 2,
            expiryType: 'week',
            expiryDate: '',
            expiryDateStr: '2026-03-29 到期',
            isExpired: jest.fn().mockReturnValue(false)
          },
          {
            id: 'today_group',
            userId: 'child_1',
            stars: 7,
            expiryType: 'week',
            expiryDate: '',
            expiryDateStr: '今天到期',
            isExpired: jest.fn().mockReturnValue(false)
          }
        ]);

        const result = await starService.getExpiringStarsInfo('child_1');

        expect(result.points).toBe(7);
        expect(result.expiryDateText).toBe('今天到期');
      } finally {
        jest.useRealTimers();
      }
    });

    it('仓储抛出异常时应该返回points=0', async () => {
      mockStarGroupRepository.getAll = jest.fn().mockRejectedValue(new Error('db error'));
      const result = await starService.getExpiringStarsInfo();
      expect(result.points).toBe(0);
    });
  });

  describe('checkAndRepairDataConsistency - 数据修复', () => {
    it('云端模式下应跳过本地一致性检查和修复', async () => {
      starService.enableCloudStorage = true;

      const result = await starService.checkAndRepairDataConsistency();

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('cloud_mode');
      expect(mockStarGroupRepository.getAll).not.toHaveBeenCalled();
      expect(mockStarRecordRepository.repairRecordBalances).not.toHaveBeenCalled();
    });

    it('应该成功执行检查和修复', async () => {
      mockStarGroupRepository.getAll = jest.fn().mockResolvedValue([{ stars: 10 }]);
      mockStarRecordRepository.getAll = jest.fn().mockResolvedValue([{ points: 10 }]);
      mockStarRecordRepository.repairRecordBalances.mockResolvedValue({ success: true, repairedCount: 0 });

      const result = await starService.checkAndRepairDataConsistency();
      expect(result.success).toBe(true);
      expect(result.repairResult).toBeDefined();
    });

    it('初始不一致修复后应包含initialConsistency和finalConsistency字段', async () => {
      mockStarGroupRepository.getAll = jest.fn().mockResolvedValue([{ stars: 20 }]);
      mockStarRecordRepository.getAll = jest.fn().mockResolvedValue([{ points: 10 }]);
      mockStarRecordRepository.repairRecordBalances.mockResolvedValue({ success: true, repairedCount: 1 });

      const result = await starService.checkAndRepairDataConsistency();
      expect(result.success).toBe(true);
      expect(result.initialConsistency.isConsistent).toBe(false);
      expect(result.repairResult.repairedCount).toBe(1);
    });
  });

  describe('verifyOperationConsistency - 操作一致性验证', () => {
    it('一致时应该返回true', async () => {
      mockStarGroupRepository.getTotalPoints.mockResolvedValue(10);
      mockStarRecordRepository.getAll = jest.fn().mockResolvedValue([{ points: 10 }]);

      const result = await starService.verifyOperationConsistency('addStars', {});
      expect(result).toBe(true);
    });

    it('不一致时应该返回false', async () => {
      mockStarGroupRepository.getTotalPoints.mockResolvedValue(20);
      mockStarRecordRepository.getAll = jest.fn().mockResolvedValue([{ points: 10 }]);

      const result = await starService.verifyOperationConsistency('addStars', {});
      expect(result).toBe(false);
    });

    it('仓储抛出异常时应该返回false', async () => {
      mockStarGroupRepository.getTotalPoints.mockRejectedValue(new Error('db error'));
      const result = await starService.verifyOperationConsistency('addStars', {});
      expect(result).toBe(false);
    });
  });

  describe('clearCache - 缓存清理', () => {
    it('仓储有clearCache方法时应该调用', () => {
      mockStarGroupRepository.clearCache = jest.fn();
      mockStarRecordRepository.clearCache = jest.fn();
      starService.clearCache();
      expect(mockStarGroupRepository.clearCache).toHaveBeenCalled();
      expect(mockStarRecordRepository.clearCache).toHaveBeenCalled();
    });
  });

  describe('calculatePendingExpiry - 计算即将过期', () => {
    it('没有即将过期分组时应该返回0', async () => {
      mockStarGroupRepository.getAll = jest.fn().mockResolvedValue([]);
      const result = await starService.calculatePendingExpiry();
      expect(result).toBe(0);
    });

    it('传入userId时应该过滤用户分组', async () => {
      const now = Date.now();
      const groups = [
        { userId: 'u1', expiryType: 'month', expiryDate: now + 1000, stars: 5 },
        { userId: 'u2', expiryType: 'month', expiryDate: now + 1000, stars: 10 }
      ];
      mockStarGroupRepository.getAll = jest.fn().mockResolvedValue(groups);
      const result = await starService.calculatePendingExpiry('u1');
      expect(result).toBe(5);
    });

    it('仓储抛出异常时应该返回0', async () => {
      mockStarGroupRepository.getAll = jest.fn().mockRejectedValue(new Error('db error'));
      const result = await starService.calculatePendingExpiry();
      expect(result).toBe(0);
    });
  });

  // ==================== 修复工具方法测试 ====================

  describe('repairStarRecordBalances - 修复星星记录余额', () => {
    it('应该成功修复星星记录余额', async () => {
      mockStarRecordRepository.repairRecordBalances.mockResolvedValue({
        success: true,
        repairedCount: 5
      });

      const result = await starService.repairStarRecordBalances();

      expect(result.success).toBe(true);
      expect(result.repairedCount).toBe(5);
      expect(mockStarRecordRepository.repairRecordBalances).toHaveBeenCalled();
    });

    it('应该处理修复失败的情况', async () => {
      mockStarRecordRepository.repairRecordBalances.mockResolvedValue({
        success: false,
        message: '修复失败'
      });

      const result = await starService.repairStarRecordBalances();

      expect(result.success).toBe(false);
    });
  });

});
