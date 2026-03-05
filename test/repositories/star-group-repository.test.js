/**
 * star-group-repository.test.js - StarGroup Repository 测试
 *
 * 测试 StarGroup Repository 的数据访问和业务逻辑
 */

const StarGroupRepository = require('../../repositories/star-group-repository');
const { StarGroup } = require('../../models/star-group');
const { StarExpiryType } = require('../../models/star');
const TestDataFactory = require('../utils/test-data-factory');
const dateUtils = require('../../utils/dateUtils');

describe('StarGroup Repository', () => {
  let repository;
  let mockStorageAdapter;
  let userId;

  beforeEach(() => {
    jest.clearAllMocks();
    userId = 'user_123';

    // 创建 Mock StorageAdapter
    mockStorageAdapter = {
      getAsync: jest.fn().mockResolvedValue([]),
      setAsync: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue(),
      clear: jest.fn().mockResolvedValue()
    };

    // 创建 Repository 实例，禁用缓存以简化测试
    repository = new StarGroupRepository(mockStorageAdapter, { useCache: false });
  });

  // ====== 初始化 ======
  describe('初始化', () => {
    it('应该正确初始化仓储', () => {
      expect(repository).toBeInstanceOf(StarGroupRepository);
    });

    it('应该设置默认的存储键', () => {
      expect(repository.storageKey).toBe('starGroups');
    });

    it('应该使用提供的存储适配器', () => {
      const customAdapter = {
        getAsync: jest.fn().mockResolvedValue([]),
        setAsync: jest.fn().mockResolvedValue({})
      };
      const repo = new StarGroupRepository(customAdapter, { useCache: false });
      expect(repo.storageAdapter).toBe(customAdapter);
    });
  });

  // ====== getNonEmptyGroups ======
  describe('getNonEmptyGroups', () => {
    it('应该返回非空的分组', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', stars: 10, userId }),
        TestDataFactory.createStarGroup({ id: 'group_2', stars: 0, userId }),
        TestDataFactory.createStarGroup({ id: 'group_3', stars: 5, userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const groups = await repository.getNonEmptyGroups(userId);

      expect(groups.length).toBe(2);
      expect(groups.find(g => g.id === 'group_1')).toBeDefined();
      expect(groups.find(g => g.id === 'group_3')).toBeDefined();
    });

    it('应该过滤用户ID', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', stars: 10, userId: 'user_456' }),
        TestDataFactory.createStarGroup({ id: 'group_2', stars: 5, userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const groups = await repository.getNonEmptyGroups(userId);

      expect(groups.length).toBe(1);
      expect(groups[0].userId).toBe(userId);
    });

    it('不指定用户ID时应该返回所有用户的非空分组', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', stars: 10, userId: 'user_456' }),
        TestDataFactory.createStarGroup({ id: 'group_2', stars: 5, userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const groups = await repository.getNonEmptyGroups();

      expect(groups.length).toBe(2);
    });

    it('应该处理空存储', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const groups = await repository.getNonEmptyGroups(userId);

      expect(groups).toEqual([]);
    });

    it('应该处理存储错误', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));

      const groups = await repository.getNonEmptyGroups(userId);

      expect(groups).toEqual([]);
    });
  });

  // ====== getGroupsByExpiryType ======
  describe('getGroupsByExpiryType', () => {
    it('应该返回特定有效期类型的分组', async () => {
      const expiryType = StarExpiryType.WEEK;
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', expiryType, userId }),
        TestDataFactory.createStarGroup({ id: 'group_2', expiryType: StarExpiryType.MONTH, userId }),
        TestDataFactory.createStarGroup({ id: 'group_3', expiryType, userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const groups = await repository.getGroupsByExpiryType(expiryType, userId);

      expect(groups.length).toBe(2);
      expect(groups.every(g => g.expiryType === expiryType)).toBe(true);
    });

    it('应该过滤用户ID', async () => {
      const expiryType = StarExpiryType.WEEK;
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', expiryType, userId: 'user_456' }),
        TestDataFactory.createStarGroup({ id: 'group_2', expiryType, userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const groups = await repository.getGroupsByExpiryType(expiryType, userId);

      expect(groups.length).toBe(1);
      expect(groups[0].userId).toBe(userId);
    });

    it('应该处理无效的有效期类型', async () => {
      const groups = await repository.getGroupsByExpiryType('', userId);

      expect(groups).toEqual([]);
    });

    it('应该处理空的有效期类型', async () => {
      const groups = await repository.getGroupsByExpiryType(null, userId);

      expect(groups).toEqual([]);
    });

    it('不指定用户ID时应该返回所有用户的分组', async () => {
      const expiryType = StarExpiryType.WEEK;
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', expiryType, userId: 'user_456' }),
        TestDataFactory.createStarGroup({ id: 'group_2', expiryType, userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const groups = await repository.getGroupsByExpiryType(expiryType);

      expect(groups.length).toBe(2);
    });
  });

  // ====== getOrCreateGroup ======
  describe('getOrCreateGroup', () => {
    it('应该创建新的永久有效分组', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const group = await repository.getOrCreateGroup(
        StarExpiryType.PERMANENT,
        null,
        '永久有效',
        userId
      );

      expect(group).not.toBeNull();
      expect(group.expiryType).toBe(StarExpiryType.PERMANENT);
      expect(group.userId).toBe(userId);
      expect(mockStorageAdapter.setAsync).toHaveBeenCalled();
    });

    it('应该返回已存在的永久有效分组', async () => {
      const existingGroup = TestDataFactory.createStarGroup({
        id: 'group_1',
        expiryType: StarExpiryType.PERMANENT,
        userId
      });

      mockStorageAdapter.getAsync.mockResolvedValue([existingGroup]);

      const group = await repository.getOrCreateGroup(
        StarExpiryType.PERMANENT,
        null,
        '永久有效',
        userId
      );

      expect(group).not.toBeNull();
      expect(group.id).toBe('group_1');
      expect(mockStorageAdapter.setAsync).not.toHaveBeenCalled();
    });

    it('应该创建新的临时分组', async () => {
      const expiryDate = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7天后
      const expiryDateStr = dateUtils.formatDate(new Date(expiryDate));

      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const group = await repository.getOrCreateGroup(
        StarExpiryType.WEEK,
        expiryDate,
        expiryDateStr,
        userId
      );

      expect(group).not.toBeNull();
      expect(group.expiryType).toBe(StarExpiryType.WEEK);
      expect(group.expiryDate).toBe(expiryDate);
      expect(group.expiryDateStr).toBe(expiryDateStr);
      expect(mockStorageAdapter.setAsync).toHaveBeenCalled();
    });

    it('应该返回同一天已存在的临时分组', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expiryDate = today.getTime();
      const expiryDateStr = dateUtils.formatDate(today);

      const existingGroup = TestDataFactory.createStarGroup({
        id: 'group_1',
        expiryType: StarExpiryType.WEEK,
        expiryDate,
        expiryDateStr,
        userId
      });

      mockStorageAdapter.getAsync.mockResolvedValue([existingGroup]);

      const group = await repository.getOrCreateGroup(
        StarExpiryType.WEEK,
        expiryDate,
        expiryDateStr,
        userId
      );

      expect(group).not.toBeNull();
      expect(group.id).toBe('group_1');
      expect(mockStorageAdapter.setAsync).not.toHaveBeenCalled();
    });

    it('应该区分不同用户的分组', async () => {
      const existingGroup = TestDataFactory.createStarGroup({
        id: 'group_1',
        expiryType: StarExpiryType.PERMANENT,
        userId: 'user_456'
      });

      mockStorageAdapter.getAsync.mockResolvedValue([existingGroup]);

      const group = await repository.getOrCreateGroup(
        StarExpiryType.PERMANENT,
        null,
        '永久有效',
        userId
      );

      expect(group).not.toBeNull();
      expect(group.id).not.toBe('group_1');
      expect(mockStorageAdapter.setAsync).toHaveBeenCalled();
    });

    it('应该处理无效的有效期类型', async () => {
      const group = await repository.getOrCreateGroup('', null, '', userId);

      expect(group).toBeNull();
    });

    it('应该处理缺失的用户ID', async () => {
      const group = await repository.getOrCreateGroup(
        StarExpiryType.WEEK,
        Date.now(),
        '',
        ''
      );

      expect(group).toBeNull();
    });

    it('应该处理存储错误', async () => {
      // getAll() 捕获错误并返回空数组，getOrCreateGroup 会创建新分组
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));
      mockStorageAdapter.setAsync.mockResolvedValue({});

      const group = await repository.getOrCreateGroup(
        StarExpiryType.WEEK,
        Date.now(),
        '',
        userId
      );

      // 由于 getAll() 返回空数组，会创建新分组
      expect(group).not.toBeNull();
      expect(group.userId).toBe(userId);
      expect(mockStorageAdapter.setAsync).toHaveBeenCalled();
    });
  });

  // ====== addStarsToGroup ======
  describe('addStarsToGroup', () => {
    it('应该成功添加星星到分组', async () => {
      const groupData = TestDataFactory.createStarGroup({ id: 'group_1', stars: 5, userId });
      const group = new StarGroup(groupData);

      mockStorageAdapter.getAsync.mockResolvedValue([groupData]);
      mockStorageAdapter.setAsync.mockResolvedValue({ ...groupData, stars: 15 });

      const result = await repository.addStarsToGroup(group, 10, 'task');

      expect(result).not.toBeNull();
      expect(result.stars).toBe(15);
      expect(mockStorageAdapter.setAsync).toHaveBeenCalled();
    });

    it('应该处理无效的分组', async () => {
      const result = await repository.addStarsToGroup(null, 10, 'task');

      expect(result).toBeNull();
    });

    it('应该处理无效的星星数量', async () => {
      const group = new StarGroup(TestDataFactory.createStarGroup({ userId }));

      const result = await repository.addStarsToGroup(group, 0, 'task');

      expect(result).toBeNull();
    });

    it('应该处理负数的星星数量', async () => {
      const group = new StarGroup(TestDataFactory.createStarGroup({ userId }));

      const result = await repository.addStarsToGroup(group, -5, 'task');

      expect(result).toBeNull();
    });

    it('应该处理存储错误', async () => {
      const groupData = TestDataFactory.createStarGroup({ id: 'group_1', stars: 10, userId });
      const group = new StarGroup(groupData);

      mockStorageAdapter.getAsync.mockResolvedValue([groupData]);
      mockStorageAdapter.setAsync.mockRejectedValue(new Error('存储错误'));

      const result = await repository.addStarsToGroup(group, 10, 'task');

      // Repository 设计：存储错误被捕获并记录，但仍返回更新后的分组
      // 因为 in-memory 操作（addStars）已经成功
      expect(result).not.toBeNull();
      expect(result.stars).toBe(20); // 10 + 10
      expect(mockStorageAdapter.setAsync).toHaveBeenCalled();
    });
  });

  // ====== consumeStarsFromGroup ======
  describe('consumeStarsFromGroup', () => {
    it('应该成功从分组消费星星', async () => {
      const groupData = TestDataFactory.createStarGroup({ id: 'group_1', stars: 10, userId });
      const group = new StarGroup(groupData);

      mockStorageAdapter.getAsync.mockResolvedValue([groupData]);
      mockStorageAdapter.setAsync.mockResolvedValue({ ...groupData, stars: 5 });

      const result = await repository.consumeStarsFromGroup(group, 5);

      expect(result.consumed).toBe(5);
      expect(result.group).not.toBeNull();
      expect(result.group.stars).toBe(5);
      expect(mockStorageAdapter.setAsync).toHaveBeenCalled();
    });

    it('应该消费分组中的所有星星', async () => {
      const groupData = TestDataFactory.createStarGroup({ id: 'group_1', stars: 5, userId });
      const group = new StarGroup(groupData);

      mockStorageAdapter.getAsync.mockResolvedValue([groupData]);
      mockStorageAdapter.setAsync.mockResolvedValue({ ...groupData, stars: 0 });

      const result = await repository.consumeStarsFromGroup(group, 10);

      expect(result.consumed).toBe(5);
      expect(result.group.stars).toBe(0);
    });

    it('应该处理无效的分组', async () => {
      const result = await repository.consumeStarsFromGroup(null, 5);

      expect(result.consumed).toBe(0);
      expect(result.group).toBeNull();
    });

    it('应该处理无效的星星数量', async () => {
      const group = new StarGroup(TestDataFactory.createStarGroup({ userId }));

      const result = await repository.consumeStarsFromGroup(group, 0);

      expect(result.consumed).toBe(0);
      expect(result.group).toBeNull();
    });

    it('应该处理空分组的消费', async () => {
      const groupData = TestDataFactory.createStarGroup({ id: 'group_1', stars: 0, userId });
      const group = new StarGroup(groupData);

      mockStorageAdapter.getAsync.mockResolvedValue([groupData]);

      const result = await repository.consumeStarsFromGroup(group, 5);

      expect(result.consumed).toBe(0);
      expect(result.group.stars).toBe(0);
      expect(mockStorageAdapter.setAsync).not.toHaveBeenCalled();
    });

    it('应该处理存储错误', async () => {
      const groupData = TestDataFactory.createStarGroup({ id: 'group_1', stars: 10, userId });
      const group = new StarGroup(groupData);

      mockStorageAdapter.getAsync.mockResolvedValue([groupData]);
      mockStorageAdapter.setAsync.mockRejectedValue(new Error('存储错误'));

      const result = await repository.consumeStarsFromGroup(group, 5);

      // Repository 设计：存储错误被捕获并记录，但仍返回消费结果
      // 因为 in-memory 操作（removeStars）已经成功
      expect(result.consumed).toBe(5);
      expect(result.group).not.toBeNull();
      expect(result.group.stars).toBe(5); // 10 - 5
    });
  });

  // ====== consumeStarsByExpiryOrder ======
  describe('consumeStarsByExpiryOrder', () => {
    it('应该按过期顺序消费星星', async () => {
      const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
      const nextWeek = Date.now() + 7 * 24 * 60 * 60 * 1000;

      const mockGroups = [
        TestDataFactory.createStarGroup({
          id: 'group_1',
          stars: 5,
          expiryDate: nextWeek,
          expiryType: StarExpiryType.WEEK,
          userId
        }),
        TestDataFactory.createStarGroup({
          id: 'group_2',
          stars: 8,
          expiryDate: tomorrow,
          expiryType: StarExpiryType.WEEK,
          userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);
      mockStorageAdapter.setAsync.mockResolvedValue({});

      const result = await repository.consumeStarsByExpiryOrder(10, userId);

      expect(result.success).toBe(true);
      expect(result.consumed).toBe(10);
      expect(result.remaining).toBe(0);
      expect(result.groupsUpdated.length).toBeGreaterThan(0);
    });

    it('应该优先消费临近过期的星星', async () => {
      const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
      const nextWeek = Date.now() + 7 * 24 * 60 * 60 * 1000;

      const mockGroups = [
        TestDataFactory.createStarGroup({
          id: 'group_1',
          stars: 5,
          expiryDate: tomorrow,
          expiryType: StarExpiryType.WEEK,
          userId
        }),
        TestDataFactory.createStarGroup({
          id: 'group_2',
          stars: 10,
          expiryDate: nextWeek,
          expiryType: StarExpiryType.WEEK,
          userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);
      mockStorageAdapter.setAsync.mockResolvedValue({});

      const result = await repository.consumeStarsByExpiryOrder(7, userId);

      expect(result.success).toBe(true);
      expect(result.consumed).toBe(7);
      // 应该先消费临近过期的分组1的全部5颗，再消费分组2的2颗
    });

    it('应该处理星星不足的情况', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({
          id: 'group_1',
          stars: 5,
          expiryType: StarExpiryType.WEEK,
          userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);
      mockStorageAdapter.setAsync.mockResolvedValue({});

      const result = await repository.consumeStarsByExpiryOrder(10, userId);

      expect(result.success).toBe(false);
      expect(result.consumed).toBe(5);
      expect(result.remaining).toBe(5);
    });

    it('应该处理无效的消费数量', async () => {
      const result = await repository.consumeStarsByExpiryOrder(0, userId);

      expect(result.success).toBe(false);
      expect(result.consumed).toBe(0);
      expect(result.remaining).toBe(0);
    });

    it('应该处理负数的消费数量', async () => {
      const result = await repository.consumeStarsByExpiryOrder(-5, userId);

      expect(result.success).toBe(false);
      expect(result.consumed).toBe(0);
    });

    it('应该处理缺失的用户ID', async () => {
      const result = await repository.consumeStarsByExpiryOrder(10, '');

      expect(result.success).toBe(false);
      expect(result.consumed).toBe(0);
    });

    it('应该处理空分组列表', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const result = await repository.consumeStarsByExpiryOrder(10, userId);

      expect(result.success).toBe(false);
      expect(result.consumed).toBe(0);
      expect(result.remaining).toBe(10);
    });

    it('应该处理存储错误', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));

      const result = await repository.consumeStarsByExpiryOrder(10, userId);

      expect(result.success).toBe(false);
      expect(result.consumed).toBe(0);
    });
  });

  // ====== cleanupExpiredGroups ======
  describe('cleanupExpiredGroups', () => {
    it('应该清理已过期的分组', async () => {
      const yesterday = Date.now() - 24 * 60 * 60 * 1000;
      const tomorrow = Date.now() + 24 * 60 * 60 * 1000;

      const mockGroups = [
        TestDataFactory.createStarGroup({
          id: 'group_1',
          stars: 10,
          expiryDate: yesterday,
          expiryType: StarExpiryType.WEEK,
          userId
        }),
        TestDataFactory.createStarGroup({
          id: 'group_2',
          stars: 5,
          expiryDate: tomorrow,
          expiryType: StarExpiryType.WEEK,
          userId
        }),
        TestDataFactory.createStarGroup({
          id: 'group_3',
          stars: 20,
          expiryType: StarExpiryType.PERMANENT,
          userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);
      mockStorageAdapter.remove.mockResolvedValue();

      const result = await repository.cleanupExpiredGroups(userId);

      expect(result.length).toBe(1);
      expect(result[0].groupId).toBe('group_1');
      expect(result[0].points).toBe(10);
    });

    it('应该保留永久有效的分组', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({
          id: 'group_1',
          stars: 10,
          expiryType: StarExpiryType.PERMANENT,
          userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const result = await repository.cleanupExpiredGroups(userId);

      expect(result.length).toBe(0);
    });

    it('应该过滤用户ID', async () => {
      const yesterday = Date.now() - 24 * 60 * 60 * 1000;

      const mockGroups = [
        TestDataFactory.createStarGroup({
          id: 'group_1',
          stars: 10,
          expiryDate: yesterday,
          expiryType: StarExpiryType.WEEK,
          userId: 'user_456'
        }),
        TestDataFactory.createStarGroup({
          id: 'group_2',
          stars: 5,
          expiryDate: yesterday,
          expiryType: StarExpiryType.WEEK,
          userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);
      mockStorageAdapter.remove.mockResolvedValue();

      const result = await repository.cleanupExpiredGroups(userId);

      expect(result.length).toBe(1);
      expect(result[0].groupId).toBe('group_2');
    });

    it('不指定用户ID时应该清理所有用户的过期分组', async () => {
      const yesterday = Date.now() - 24 * 60 * 60 * 1000;

      const mockGroups = [
        TestDataFactory.createStarGroup({
          id: 'group_1',
          stars: 10,
          expiryDate: yesterday,
          expiryType: StarExpiryType.WEEK,
          userId: 'user_456'
        }),
        TestDataFactory.createStarGroup({
          id: 'group_2',
          stars: 5,
          expiryDate: yesterday,
          expiryType: StarExpiryType.WEEK,
          userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);
      mockStorageAdapter.remove.mockResolvedValue();

      const result = await repository.cleanupExpiredGroups();

      expect(result.length).toBe(2);
    });

    it('应该处理没有过期分组的情况', async () => {
      const tomorrow = Date.now() + 24 * 60 * 60 * 1000;

      const mockGroups = [
        TestDataFactory.createStarGroup({
          id: 'group_1',
          stars: 10,
          expiryDate: tomorrow,
          expiryType: StarExpiryType.WEEK,
          userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const result = await repository.cleanupExpiredGroups(userId);

      expect(result.length).toBe(0);
    });

    it('应该处理空分组列表', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const result = await repository.cleanupExpiredGroups(userId);

      expect(result.length).toBe(0);
    });

    it('应该处理存储错误', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));

      const result = await repository.cleanupExpiredGroups(userId);

      expect(result).toEqual([]);
    });
  });

  // ====== cleanupEmptyGroups ======
  describe('cleanupEmptyGroups', () => {
    it('应该清理空分组', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', stars: 0, userId }),
        TestDataFactory.createStarGroup({ id: 'group_2', stars: 5, userId }),
        TestDataFactory.createStarGroup({ id: 'group_3', stars: 0, userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);
      mockStorageAdapter.remove.mockResolvedValue();

      const result = await repository.cleanupEmptyGroups();

      expect(result).toBe(2);
    });

    it('应该保留有星星的分组', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', stars: 10, userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const result = await repository.cleanupEmptyGroups();

      expect(result).toBe(0);
    });

    it('应该处理空分组列表', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const result = await repository.cleanupEmptyGroups();

      expect(result).toBe(0);
    });

    it('应该处理存储错误', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));

      const result = await repository.cleanupEmptyGroups();

      expect(result).toBe(0);
    });
  });

  // ====== getTotalPoints ======
  describe('getTotalPoints', () => {
    it('应该计算所有分组的星星总数', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', stars: 10, userId }),
        TestDataFactory.createStarGroup({ id: 'group_2', stars: 5, userId }),
        TestDataFactory.createStarGroup({ id: 'group_3', stars: 15, userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const total = await repository.getTotalPoints(userId);

      expect(total).toBe(30);
    });

    it('应该过滤用户ID', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', stars: 10, userId: 'user_456' }),
        TestDataFactory.createStarGroup({ id: 'group_2', stars: 5, userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const total = await repository.getTotalPoints(userId);

      expect(total).toBe(5);
    });

    it('不指定用户ID时应该计算所有用户的星星总数', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', stars: 10, userId: 'user_456' }),
        TestDataFactory.createStarGroup({ id: 'group_2', stars: 5, userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const total = await repository.getTotalPoints();

      expect(total).toBe(15);
    });

    it('应该处理星星值为字符串的情况', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', stars: '10', userId }),
        TestDataFactory.createStarGroup({ id: 'group_2', stars: 5, userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const total = await repository.getTotalPoints(userId);

      expect(total).toBe(15);
    });

    it('应该处理星星值为null的情况', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', stars: null, userId }),
        TestDataFactory.createStarGroup({ id: 'group_2', stars: 5, userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const total = await repository.getTotalPoints(userId);

      expect(total).toBe(5);
    });

    it('应该处理星星值为undefined的情况', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', stars: undefined, userId }),
        TestDataFactory.createStarGroup({ id: 'group_2', stars: 5, userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const total = await repository.getTotalPoints(userId);

      expect(total).toBe(5);
    });

    it('应该处理空分组列表', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const total = await repository.getTotalPoints(userId);

      expect(total).toBe(0);
    });

    it('应该处理存储错误', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));

      const total = await repository.getTotalPoints(userId);

      expect(total).toBe(0);
    });
  });

  // ====== hasEnoughPoints ======
  describe('hasEnoughPoints', () => {
    it('应该检查星星数量是否足够', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', stars: 10, userId }),
        TestDataFactory.createStarGroup({ id: 'group_2', stars: 5, userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const hasEnough = await repository.hasEnoughPoints(10, userId);

      expect(hasEnough).toBe(true);
    });

    it('应该返回false当星星数量不足', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', stars: 10, userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const hasEnough = await repository.hasEnoughPoints(15, userId);

      expect(hasEnough).toBe(false);
    });

    it('应该返回true当数量为0或负数', async () => {
      const hasEnough = await repository.hasEnoughPoints(0, userId);

      expect(hasEnough).toBe(true);
    });

    it('应该处理存储错误', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));

      const hasEnough = await repository.hasEnoughPoints(10, userId);

      expect(hasEnough).toBe(false);
    });
  });

  // ====== deductStars ======
  describe('deductStars', () => {
    it('应该成功扣除星星', async () => {
      const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
      const nextWeek = Date.now() + 7 * 24 * 60 * 60 * 1000;

      const mockGroups = [
        TestDataFactory.createStarGroup({
          id: 'group_1',
          stars: 5,
          expiryDate: tomorrow,
          expiryType: StarExpiryType.WEEK,
          userId
        }),
        TestDataFactory.createStarGroup({
          id: 'group_2',
          stars: 10,
          expiryDate: nextWeek,
          expiryType: StarExpiryType.WEEK,
          userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);
      mockStorageAdapter.setAsync.mockResolvedValue({});

      const result = await repository.deductStars(10);

      expect(result.success).toBe(true);
      expect(result.message).toBe('扣除成功');
      expect(result.deductedGroups.length).toBeGreaterThan(0);
    });

    it('应该优先扣除临近过期的星星', async () => {
      const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
      const nextWeek = Date.now() + 7 * 24 * 60 * 60 * 1000;

      const mockGroups = [
        TestDataFactory.createStarGroup({
          id: 'group_1',
          stars: 5,
          expiryDate: tomorrow,
          expiryType: StarExpiryType.WEEK,
          userId
        }),
        TestDataFactory.createStarGroup({
          id: 'group_2',
          stars: 10,
          expiryDate: nextWeek,
          expiryType: StarExpiryType.WEEK,
          userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);
      mockStorageAdapter.setAsync.mockResolvedValue({});

      const result = await repository.deductStars(7);

      expect(result.success).toBe(true);
      expect(result.deductedGroups[0].groupId).toBe('group_1');
    });

    it('应该处理星星不足的情况', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({
          id: 'group_1',
          stars: 5,
          expiryType: StarExpiryType.WEEK,
          userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const result = await repository.deductStars(10);

      expect(result.success).toBe(false);
      expect(result.message).toBe('星星不足');
    });

    it('应该处理无效的数量', async () => {
      const result = await repository.deductStars(0);

      expect(result.success).toBe(false);
      expect(result.message).toBe('扣除数量无效');
    });

    it('应该处理负数的数量', async () => {
      const result = await repository.deductStars(-5);

      expect(result.success).toBe(false);
      expect(result.message).toBe('扣除数量无效');
    });

    it('应该处理存储错误', async () => {
      // getAll() 捕获错误并返回空数组，导致星星不足
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));

      const result = await repository.deductStars(10);

      // getAll() 返回空数组，totalStars = 0，星星不足
      expect(result.success).toBe(false);
      expect(result.message).toBe('星星不足');
    });
  });

  // ====== deductStarsFromSpecificExpiryType ======
  describe('deductStarsFromSpecificExpiryType', () => {
    it('应该从特定有效期类型扣减星星', async () => {
      const tomorrow = Date.now() + 24 * 60 * 60 * 1000;

      const mockGroups = [
        TestDataFactory.createStarGroup({
          id: 'group_1',
          stars: 10,
          expiryDate: tomorrow,
          expiryType: StarExpiryType.WEEK,
          userId
        }),
        TestDataFactory.createStarGroup({
          id: 'group_2',
          stars: 5,
          expiryType: StarExpiryType.MONTH,
          userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);
      mockStorageAdapter.setAsync.mockResolvedValue({});

      const result = await repository.deductStarsFromSpecificExpiryType(
        5,
        StarExpiryType.WEEK,
        '测试原因'
      );

      expect(result.success).toBe(true);
      expect(result.deductedGroups.length).toBe(1);
      expect(result.deductedGroups[0].groupId).toBe('group_1');
    });

    it('应该处理指定类型星星不足的情况', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({
          id: 'group_1',
          stars: 5,
          expiryType: StarExpiryType.WEEK,
          userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const result = await repository.deductStarsFromSpecificExpiryType(
        10,
        StarExpiryType.WEEK,
        '测试原因'
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('该类型分组星星不足');
    });

    it('应该处理未找到对应类型的分组', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const result = await repository.deductStarsFromSpecificExpiryType(
        10,
        StarExpiryType.WEEK,
        '测试原因'
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('未找到对应的星星分组');
    });

    it('应该处理无效的数量', async () => {
      const result = await repository.deductStarsFromSpecificExpiryType(
        0,
        StarExpiryType.WEEK,
        '测试原因'
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('扣减数量无效');
    });

    it('应该处理缺失的有效期类型', async () => {
      const result = await repository.deductStarsFromSpecificExpiryType(
        10,
        '',
        '测试原因'
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('未指定有效期类型');
    });

    it('应该处理存储错误', async () => {
      // getGroupsByExpiryType 调用 getAll，getAll 捕获错误并返回空数组
      // getGroupsByExpiryType 过滤空数组，返回空数组
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));

      const result = await repository.deductStarsFromSpecificExpiryType(
        10,
        StarExpiryType.WEEK,
        '测试原因'
      );

      // 找不到对应类型的分组
      expect(result.success).toBe(false);
      expect(result.message).toBe('未找到对应的星星分组');
    });
  });

  // ====== clearCache ======
  describe('clearCache', () => {
    it('应该清除缓存', () => {
      const mockClearCache = jest.fn();
      repository.storageAdapter.clearCache = mockClearCache;

      repository.clearCache();

      expect(mockClearCache).toHaveBeenCalled();
    });

    it('应该处理没有清除缓存方法的情况', () => {
      repository.storageAdapter.clearCache = undefined;

      expect(() => repository.clearCache()).not.toThrow();
    });
  });

  // ====== 边界条件和错误处理 ======
  describe('边界条件和错误处理', () => {
    it('应该处理星星值为NaN的情况', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', stars: NaN, userId }),
        TestDataFactory.createStarGroup({ id: 'group_2', stars: 5, userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const total = await repository.getTotalPoints(userId);

      expect(total).toBe(5);
    });

    it('应该处理星星值为空字符串的情况', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', stars: '', userId }),
        TestDataFactory.createStarGroup({ id: 'group_2', stars: 5, userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const total = await repository.getTotalPoints(userId);

      expect(total).toBe(5);
    });

    it('应该处理星星值为小数的情况', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', stars: 10.5, userId }),
        TestDataFactory.createStarGroup({ id: 'group_2', stars: 5.3, userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const total = await repository.getTotalPoints(userId);

      // 应该向下取整
      expect(total).toBe(15);
    });

    it('应该处理分组ID为null的情况', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: null, stars: 10, userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const total = await repository.getTotalPoints(userId);

      expect(total).toBe(10);
    });

    it('应该处理用户ID为null的情况', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', stars: 10, userId: null })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const groups = await repository.getNonEmptyGroups();

      expect(groups.length).toBe(1);
    });

    it('应该处理分组ID为undefined的情况', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: undefined, stars: 10, userId })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const total = await repository.getTotalPoints(userId);

      expect(total).toBe(10);
    });

    it('应该处理过期日期为无效格式的情况', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({
          id: 'group_1',
          stars: 10,
          expiryDate: 'invalid-date',
          expiryType: StarExpiryType.WEEK,
          userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const result = await repository.cleanupExpiredGroups(userId);

      // 无效日期不应该被视为过期
      expect(result.length).toBe(0);
    });

    it('应该处理过期日期为null的情况', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({
          id: 'group_1',
          stars: 10,
          expiryDate: null,
          expiryType: StarExpiryType.WEEK,
          userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const result = await repository.cleanupExpiredGroups(userId);

      // null过期日期不应该被视为过期
      expect(result.length).toBe(0);
    });

    it('应该处理分组数量非常大的情况', async () => {
      const mockGroups = Array.from({ length: 100 }, (_, i) =>
        TestDataFactory.createStarGroup({
          id: `group_${i}`,
          stars: 1,
          userId
        })
      );

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const total = await repository.getTotalPoints(userId);

      expect(total).toBe(100);
    });

    it('应该处理星星数量非常大的情况', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({
          id: 'group_1',
          stars: Number.MAX_SAFE_INTEGER,
          userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const total = await repository.getTotalPoints(userId);

      expect(total).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('应该处理同时有多个用户的情况', async () => {
      const mockGroups = [
        TestDataFactory.createStarGroup({ id: 'group_1', stars: 10, userId: 'user_1' }),
        TestDataFactory.createStarGroup({ id: 'group_2', stars: 5, userId: 'user_2' }),
        TestDataFactory.createStarGroup({ id: 'group_3', stars: 15, userId: 'user_1' })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockGroups);

      const totalUser1 = await repository.getTotalPoints('user_1');
      const totalUser2 = await repository.getTotalPoints('user_2');

      expect(totalUser1).toBe(25);
      expect(totalUser2).toBe(5);
    });
  });
});
