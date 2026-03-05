/**
 * star-record-repository.test.js - StarRecord Repository 测试
 *
 * 测试 StarRecord Repository 的数据访问和业务逻辑
 */

const StarRecordRepository = require('../../repositories/star-record-repository');
const { StarRecord, RecordType, RecordSource } = require('../../models/star-record');
const TestDataFactory = require('../utils/test-data-factory');
const dateUtils = require('../../utils/dateUtils');

describe('StarRecord Repository', () => {
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
    repository = new StarRecordRepository(mockStorageAdapter, { useCache: false });
  });

  // ====== 初始化 ======
  describe('初始化', () => {
    it('应该正确初始化仓储', () => {
      expect(repository).toBeInstanceOf(StarRecordRepository);
    });

    it('应该设置默认的存储键', () => {
      expect(repository.storageKey).toBe('starRecords');
    });

    it('应该支持自定义存储键', () => {
      const customRepo = new StarRecordRepository(mockStorageAdapter, {
        storageKey: 'customRecords',
        useCache: false
      });
      expect(customRepo.storageKey).toBe('customRecords');
    });
  });

  // ====== 基础 CRUD 操作 ======
  describe('基础 CRUD 操作', () => {
    it('应该保存星星记录', async () => {
      const record = new StarRecord(TestDataFactory.createStarRecord({
        type: RecordType.INCOME,
        points: 10
      }));

      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const savedRecord = await repository.save(record);

      expect(savedRecord).not.toBeNull();
      expect(savedRecord.points).toBe(10);
      expect(savedRecord.type).toBe(RecordType.INCOME);
    });

    it('应该根据 ID 获取星星记录', async () => {
      const recordData = TestDataFactory.createStarRecord({
        id: 'record_123'
      });

      mockStorageAdapter.getAsync.mockResolvedValue([recordData]);

      const record = await repository.getById('record_123');

      expect(record).not.toBeNull();
      expect(record.id).toBe('record_123');
    });

    it('应该获取所有星星记录', async () => {
      const records = [
        TestDataFactory.createStarRecord({ id: 'record_1' }),
        TestDataFactory.createStarRecord({ id: 'record_2' })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const allRecords = await repository.getAll();

      expect(allRecords.length).toBe(2);
    });

    it('应该删除星星记录', async () => {
      const recordData = TestDataFactory.createStarRecord({
        id: 'record_123'
      });

      mockStorageAdapter.getAsync.mockResolvedValue([recordData]);

      const deleted = await repository.delete('record_123');

      expect(deleted).toBe(true);
      expect(mockStorageAdapter.setAsync).toHaveBeenCalled();
    });

    it('应该批量保存星星记录', async () => {
      const records = [
        new StarRecord(TestDataFactory.createStarRecord({ id: 'record_1' })),
        new StarRecord(TestDataFactory.createStarRecord({ id: 'record_2' }))
      ];

      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const savedRecords = await repository.saveAll(records);

      expect(savedRecords.length).toBe(2);
      expect(mockStorageAdapter.setAsync).toHaveBeenCalled();
    });
  });

  // ====== 按类型查询 ======
  describe('getRecordsByType', () => {
    it('应该返回指定类型的记录', async () => {
      const records = [
        TestDataFactory.createStarRecord({
          type: RecordType.INCOME,
          points: 10
        }),
        TestDataFactory.createStarRecord({
          type: RecordType.EXPENSE,
          points: -5
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const incomeRecords = await repository.getRecordsByType(RecordType.INCOME);

      expect(incomeRecords.length).toBe(1);
      expect(incomeRecords[0].type).toBe(RecordType.INCOME);
      expect(incomeRecords[0].points).toBe(10);
    });

    it('应该过滤用户ID', async () => {
      const userId = 'user_123';
      const records = [
        TestDataFactory.createStarRecord({
          type: RecordType.INCOME,
          userId: 'user_456'
        }),
        TestDataFactory.createStarRecord({
          type: RecordType.INCOME,
          userId: userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const userRecords = await repository.getRecordsByType(RecordType.INCOME, userId);

      expect(userRecords.length).toBe(1);
      expect(userRecords[0].userId).toBe(userId);
    });

    it('应该处理无效类型', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const records = await repository.getRecordsByType('');

      expect(records).toEqual([]);
    });
  });

  // ====== 按来源查询 ======
  describe('getRecordsBySource', () => {
    it('应该返回指定来源的记录', async () => {
      const records = [
        TestDataFactory.createStarRecord({
          source: RecordSource.TASK,
          sourceId: 'task_1'
        }),
        TestDataFactory.createStarRecord({
          source: RecordSource.REWARD,
          sourceId: 'reward_1'
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const taskRecords = await repository.getRecordsBySource(RecordSource.TASK);

      expect(taskRecords.length).toBe(1);
      expect(taskRecords[0].source).toBe(RecordSource.TASK);
    });

    it('应该按来源和来源ID查询', async () => {
      const records = [
        TestDataFactory.createStarRecord({
          source: RecordSource.TASK,
          sourceId: 'task_1'
        }),
        TestDataFactory.createStarRecord({
          source: RecordSource.TASK,
          sourceId: 'task_2'
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const taskRecords = await repository.getRecordsBySource(
        RecordSource.TASK,
        'task_1'
      );

      expect(taskRecords.length).toBe(1);
      expect(taskRecords[0].sourceId).toBe('task_1');
    });

    it('应该过滤用户ID', async () => {
      const userId = 'user_123';
      const records = [
        TestDataFactory.createStarRecord({
          source: RecordSource.TASK,
          userId: 'user_456'
        }),
        TestDataFactory.createStarRecord({
          source: RecordSource.TASK,
          userId: userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const userRecords = await repository.getRecordsBySource(
        RecordSource.TASK,
        null,
        userId
      );

      expect(userRecords.length).toBe(1);
      expect(userRecords[0].userId).toBe(userId);
    });
  });

  // ====== 按日期查询 ======
  describe('getRecordsByDate', () => {
    it('应该返回指定日期的记录', async () => {
      const today = dateUtils.getTodayString();
      const records = [
        TestDataFactory.createStarRecord({
          timestamp: new Date(today + 'T10:00:00').getTime()
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const todayRecords = await repository.getRecordsByDate(today);

      expect(todayRecords.length).toBe(1);
      expect(todayRecords[0].getDate()).toBe(today);
    });

    it('应该过滤用户ID', async () => {
      const today = dateUtils.getTodayString();
      const userId = 'user_123';
      const records = [
        TestDataFactory.createStarRecord({
          timestamp: new Date(today + 'T10:00:00').getTime(),
          userId: 'user_456'
        }),
        TestDataFactory.createStarRecord({
          timestamp: new Date(today + 'T10:00:00').getTime(),
          userId: userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const userRecords = await repository.getRecordsByDate(today, userId);

      expect(userRecords.length).toBe(1);
      expect(userRecords[0].userId).toBe(userId);
    });

    it('应该处理无效日期', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const records = await repository.getRecordsByDate('');

      expect(records).toEqual([]);
    });
  });

  // ====== 按日期范围查询 ======
  describe('getRecordsByDateRange', () => {
    it('应该返回日期范围内的记录', async () => {
      const startDate = '2026-03-01';
      const endDate = '2026-03-05';
      const records = [
        TestDataFactory.createStarRecord({
          timestamp: new Date('2026-03-01T10:00:00').getTime()
        }),
        TestDataFactory.createStarRecord({
          timestamp: new Date('2026-03-05T10:00:00').getTime()
        }),
        TestDataFactory.createStarRecord({
          timestamp: new Date('2026-03-06T10:00:00').getTime()
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const rangeRecords = await repository.getRecordsByDateRange(startDate, endDate);

      expect(rangeRecords.length).toBe(2);
    });

    it('应该过滤用户ID', async () => {
      const startDate = '2026-03-01';
      const endDate = '2026-03-05';
      const userId = 'user_123';
      const records = [
        TestDataFactory.createStarRecord({
          timestamp: new Date('2026-03-01T10:00:00').getTime(),
          userId: 'user_456'
        }),
        TestDataFactory.createStarRecord({
          timestamp: new Date('2026-03-01T10:00:00').getTime(),
          userId: userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const userRecords = await repository.getRecordsByDateRange(
        startDate,
        endDate,
        userId
      );

      expect(userRecords.length).toBe(1);
      expect(userRecords[0].userId).toBe(userId);
    });

    it('应该处理无效日期范围', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const records = await repository.getRecordsByDateRange('', '');

      expect(records).toEqual([]);
    });
  });

  // ====== 按月份查询 ======
  describe('getRecordsByMonth', () => {
    it('应该返回指定月份的记录', async () => {
      const month = '2026-03';
      const records = [
        TestDataFactory.createStarRecord({
          timestamp: new Date('2026-03-01T10:00:00').getTime()
        }),
        TestDataFactory.createStarRecord({
          timestamp: new Date('2026-04-01T10:00:00').getTime()
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const monthRecords = await repository.getRecordsByMonth(month);

      expect(monthRecords.length).toBe(1);
      expect(monthRecords[0].getMonth()).toBe(month);
    });

    it('应该过滤用户ID', async () => {
      const month = '2026-03';
      const userId = 'user_123';
      const records = [
        TestDataFactory.createStarRecord({
          timestamp: new Date('2026-03-01T10:00:00').getTime(),
          userId: 'user_456'
        }),
        TestDataFactory.createStarRecord({
          timestamp: new Date('2026-03-01T10:00:00').getTime(),
          userId: userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const userRecords = await repository.getRecordsByMonth(month, userId);

      expect(userRecords.length).toBe(1);
      expect(userRecords[0].userId).toBe(userId);
    });
  });

  // ====== 按类型和日期查询 ======
  describe('getRecordsByTypeAndDate', () => {
    it('应该返回指定类型和日期的记录', async () => {
      const today = dateUtils.getTodayString();
      const records = [
        TestDataFactory.createStarRecord({
          type: RecordType.INCOME,
          timestamp: new Date(today + 'T10:00:00').getTime()
        }),
        TestDataFactory.createStarRecord({
          type: RecordType.EXPENSE,
          timestamp: new Date(today + 'T10:00:00').getTime()
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const incomeTodayRecords = await repository.getRecordsByTypeAndDate(
        RecordType.INCOME,
        today
      );

      expect(incomeTodayRecords.length).toBe(1);
      expect(incomeTodayRecords[0].type).toBe(RecordType.INCOME);
    });

    it('应该过滤用户ID', async () => {
      const today = dateUtils.getTodayString();
      const userId = 'user_123';
      const records = [
        TestDataFactory.createStarRecord({
          type: RecordType.INCOME,
          timestamp: new Date(today + 'T10:00:00').getTime(),
          userId: 'user_456'
        }),
        TestDataFactory.createStarRecord({
          type: RecordType.INCOME,
          timestamp: new Date(today + 'T10:00:00').getTime(),
          userId: userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const userRecords = await repository.getRecordsByTypeAndDate(
        RecordType.INCOME,
        today,
        userId
      );

      expect(userRecords.length).toBe(1);
      expect(userRecords[0].userId).toBe(userId);
    });
  });

  // ====== 按时间顺序查询 ======
  describe('getRecordsByTimeOrder', () => {
    it('应该按时间降序返回记录', async () => {
      const now = Date.now();
      const records = [
        TestDataFactory.createStarRecord({
          timestamp: now - 2000
        }),
        TestDataFactory.createStarRecord({
          timestamp: now
        }),
        TestDataFactory.createStarRecord({
          timestamp: now - 1000
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const sortedRecords = await repository.getRecordsByTimeOrder(true);

      expect(sortedRecords[0].timestamp).toBe(now);
      expect(sortedRecords[2].timestamp).toBe(now - 2000);
    });

    it('应该按时间升序返回记录', async () => {
      const now = Date.now();
      const records = [
        TestDataFactory.createStarRecord({
          timestamp: now - 2000
        }),
        TestDataFactory.createStarRecord({
          timestamp: now
        }),
        TestDataFactory.createStarRecord({
          timestamp: now - 1000
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const sortedRecords = await repository.getRecordsByTimeOrder(false);

      expect(sortedRecords[0].timestamp).toBe(now - 2000);
      expect(sortedRecords[2].timestamp).toBe(now);
    });

    it('应该限制返回数量', async () => {
      const records = [
        TestDataFactory.createStarRecord({ timestamp: Date.now() }),
        TestDataFactory.createStarRecord({ timestamp: Date.now() }),
        TestDataFactory.createStarRecord({ timestamp: Date.now() })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const limitedRecords = await repository.getRecordsByTimeOrder(true, 2);

      expect(limitedRecords.length).toBe(2);
    });

    it('应该过滤用户ID', async () => {
      const userId = 'user_123';
      const records = [
        TestDataFactory.createStarRecord({
          userId: 'user_456',
          timestamp: Date.now()
        }),
        TestDataFactory.createStarRecord({
          userId: userId,
          timestamp: Date.now()
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const userRecords = await repository.getRecordsByTimeOrder(true, 0, userId);

      expect(userRecords.length).toBe(1);
      expect(userRecords[0].userId).toBe(userId);
    });
  });

  // ====== 创建任务完成记录 ======
  describe('createTaskCompleteRecord', () => {
    it('应该创建任务完成记录', async () => {
      const taskId = 'task_123';
      const points = 10;
      const userId = 'user_123';

      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const record = await repository.createTaskCompleteRecord(
        taskId,
        points,
        '完成任务',
        userId
      );

      expect(record).not.toBeNull();
      expect(record.points).toBe(points);
      expect(record.type).toBe(RecordType.INCOME);
      expect(record.source).toBe(RecordSource.TASK);
      expect(record.sourceId).toBe(taskId);
      expect(record.userId).toBe(userId);
    });

    it('应该正确计算余额', async () => {
      const existingRecords = [
        TestDataFactory.createStarRecord({
          points: 5,
          balance: 5,
          previousBalance: 0,
          userId: 'user_123'
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(existingRecords);

      const record = await repository.createTaskCompleteRecord(
        'task_123',
        10,
        '完成任务',
        'user_123'
      );

      expect(record.balance).toBe(15);
      expect(record.previousBalance).toBe(5);
    });

    it('应该处理无效参数', async () => {
      const record = await repository.createTaskCompleteRecord('', 10, '完成任务');

      expect(record).toBeNull();
    });

    it('应该处理负数点数', async () => {
      const record = await repository.createTaskCompleteRecord('task_123', -10, '完成任务');

      expect(record).toBeNull();
    });
  });

  // ====== 创建奖励兑换记录 ======
  describe('createRewardExchangeRecord', () => {
    it('应该创建奖励兑换记录', async () => {
      const rewardId = 'reward_123';
      const points = 10;
      const userId = 'user_123';

      mockStorageAdapter.getAsync.mockResolvedValue([
        TestDataFactory.createStarRecord({
          points: 20,
          balance: 20,
          previousBalance: 0,
          userId: 'user_123'
        })
      ]);

      const record = await repository.createRewardExchangeRecord(
        rewardId,
        points,
        '兑换奖励',
        userId
      );

      expect(record).not.toBeNull();
      expect(record.points).toBe(-points);
      expect(record.type).toBe(RecordType.EXPENSE);
      expect(record.source).toBe(RecordSource.REWARD);
      expect(record.sourceId).toBe(rewardId);
      expect(record.userId).toBe(userId);
    });

    it('应该正确计算余额', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([
        TestDataFactory.createStarRecord({
          points: 20,
          balance: 20,
          previousBalance: 0,
          userId: 'user_123'
        })
      ]);

      const record = await repository.createRewardExchangeRecord(
        'reward_123',
        10,
        '兑换奖励',
        'user_123'
      );

      expect(record.balance).toBe(10);
      expect(record.previousBalance).toBe(20);
    });

    it('应该处理无效参数', async () => {
      const record = await repository.createRewardExchangeRecord('', 10, '兑换奖励');

      expect(record).toBeNull();
    });
  });

  // ====== 创建星星过期记录 ======
  describe('createExpiredRecord', () => {
    it('应该创建星星过期记录', async () => {
      const points = 10;
      const expiryType = 'week';
      const userId = 'user_123';

      mockStorageAdapter.getAsync.mockResolvedValue([
        TestDataFactory.createStarRecord({
          points: 20,
          balance: 20,
          previousBalance: 0,
          userId: 'user_123'
        })
      ]);

      const record = await repository.createExpiredRecord(
        points,
        expiryType,
        '星星过期',
        userId
      );

      expect(record).not.toBeNull();
      expect(record.points).toBe(-points);
      expect(record.type).toBe(RecordType.EXPENSE);
      expect(record.source).toBe(RecordSource.SYSTEM);
      expect(record.sourceId).toContain('expired');
      expect(record.userId).toBe(userId);
    });

    it('应该正确计算余额', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([
        TestDataFactory.createStarRecord({
          points: 20,
          balance: 20,
          previousBalance: 0,
          userId: 'user_123'
        })
      ]);

      const record = await repository.createExpiredRecord(
        10,
        'week',
        '星星过期',
        'user_123'
      );

      expect(record.balance).toBe(10);
      expect(record.previousBalance).toBe(20);
    });

    it('应该处理负数点数', async () => {
      const record = await repository.createExpiredRecord(-10, 'week', '星星过期');

      expect(record).toBeNull();
    });
  });

  // ====== 创建惩罚记录 ======
  describe('createPenaltyRecord', () => {
    it('应该创建惩罚记录', async () => {
      const taskId = 'task_123';
      const points = 10;
      const userId = 'user_123';

      mockStorageAdapter.getAsync.mockResolvedValue([
        TestDataFactory.createStarRecord({
          points: 20,
          balance: 20,
          previousBalance: 0,
          userId: 'user_123'
        })
      ]);

      const record = await repository.createPenaltyRecord(
        taskId,
        points,
        '必做任务惩罚',
        userId,
        '2026-03-04',
        15
      );

      expect(record).not.toBeNull();
      expect(record.points).toBe(-points);
      expect(record.type).toBe(RecordType.EXPENSE);
      expect(record.source).toBe(RecordSource.TASK);
      expect(record.sourceId).toBe(taskId);
      expect(record.userId).toBe(userId);
      expect(record.originalTaskDate).toBe('2026-03-04');
      expect(record.requestedPoints).toBe(15);
    });

    it('应该正确计算余额', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([
        TestDataFactory.createStarRecord({
          points: 20,
          balance: 20,
          previousBalance: 0,
          userId: 'user_123'
        })
      ]);

      const record = await repository.createPenaltyRecord(
        'task_123',
        10,
        '必做任务惩罚',
        'user_123'
      );

      expect(record.balance).toBe(10);
      expect(record.previousBalance).toBe(20);
    });

    it('应该处理无效参数', async () => {
      const record = await repository.createPenaltyRecord('', 10, '惩罚');

      expect(record).toBeNull();
    });
  });

  // ====== 按月份分组 ======
  describe('groupByMonth', () => {
    it('应该按月份分组记录', () => {
      const records = [
        new StarRecord(TestDataFactory.createStarRecord({
          timestamp: new Date('2026-03-01T10:00:00').getTime()
        })),
        new StarRecord(TestDataFactory.createStarRecord({
          timestamp: new Date('2026-03-15T10:00:00').getTime()
        })),
        new StarRecord(TestDataFactory.createStarRecord({
          timestamp: new Date('2026-04-01T10:00:00').getTime()
        }))
      ];

      const grouped = repository.groupByMonth(records, true);

      expect(grouped.length).toBe(2);
      expect(grouped[0].title).toBe('2026年4月');
      expect(grouped[0].records.length).toBe(1);
      expect(grouped[1].title).toBe('2026年3月');
      expect(grouped[1].records.length).toBe(2);
    });

    it('应该支持升序排列', () => {
      const records = [
        new StarRecord(TestDataFactory.createStarRecord({
          timestamp: new Date('2026-03-01T10:00:00').getTime()
        })),
        new StarRecord(TestDataFactory.createStarRecord({
          timestamp: new Date('2026-04-01T10:00:00').getTime()
        }))
      ];

      const grouped = repository.groupByMonth(records, false);

      expect(grouped[0].title).toBe('2026年3月');
      expect(grouped[1].title).toBe('2026年4月');
    });
  });

  // ====== 获取按月份分组的记录 ======
  describe('getRecordsGroupedByMonth', () => {
    it('应该返回按月份分组的记录', async () => {
      const records = [
        TestDataFactory.createStarRecord({
          timestamp: new Date('2026-03-01T10:00:00').getTime()
        }),
        TestDataFactory.createStarRecord({
          timestamp: new Date('2026-03-15T10:00:00').getTime()
        }),
        TestDataFactory.createStarRecord({
          timestamp: new Date('2026-04-01T10:00:00').getTime()
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const grouped = await repository.getRecordsGroupedByMonth();

      expect(grouped.length).toBe(2);
    });

    it('应该限制返回数量', async () => {
      const records = [
        TestDataFactory.createStarRecord({
          timestamp: new Date('2026-03-01T10:00:00').getTime()
        }),
        TestDataFactory.createStarRecord({
          timestamp: new Date('2026-03-02T10:00:00').getTime()
        }),
        TestDataFactory.createStarRecord({
          timestamp: new Date('2026-03-03T10:00:00').getTime()
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const grouped = await repository.getRecordsGroupedByMonth({ limit: 2 });

      expect(grouped[0].records.length).toBe(2);
    });

    it('应该过滤用户ID', async () => {
      const userId = 'user_123';
      const records = [
        TestDataFactory.createStarRecord({
          timestamp: new Date('2026-03-01T10:00:00').getTime(),
          userId: 'user_456'
        }),
        TestDataFactory.createStarRecord({
          timestamp: new Date('2026-03-01T10:00:00').getTime(),
          userId: userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const grouped = await repository.getRecordsGroupedByMonth({ userId });

      expect(grouped[0].records.length).toBe(1);
      expect(grouped[0].records[0].userId).toBe(userId);
    });
  });

  // ====== 创建星星消费记录 ======
  describe('createStarConsumptionRecord', () => {
    it('应该创建星星消费记录', async () => {
      const userId = 'user_123';
      const recordData = {
        amount: 10,
        type: 'expense',
        source: 'reward',
        description: '兑换奖励',
        userId: userId,
        data: { rewardName: '测试奖励' }
      };

      mockStorageAdapter.getAsync.mockResolvedValue([
        TestDataFactory.createStarRecord({
          points: 20,
          balance: 20,
          previousBalance: 0,
          userId: userId
        })
      ]);

      const record = await repository.createStarConsumptionRecord(recordData);

      expect(record).not.toBeNull();
      expect(record.points).toBe(-10);
      expect(record.type).toBe('expense');
      expect(record.source).toBe('reward');
      expect(record.userId).toBe(userId);
    });

    it('应该创建完全保护兑换记录（消耗0颗星星）', async () => {
      const userId = 'user_123';
      const recordData = {
        amount: 0,
        type: 'expense',
        source: 'reward',
        description: '完全保护兑换',
        userId: userId,
        data: { rewardName: '测试奖励' }
      };

      mockStorageAdapter.getAsync.mockResolvedValue([
        TestDataFactory.createStarRecord({
          points: 20,
          balance: 20,
          previousBalance: 0,
          userId: userId
        })
      ]);

      const record = await repository.createStarConsumptionRecord(recordData);

      expect(record).not.toBeNull();
      expect(record.points).toBe(0);
      expect(record.description).toContain('完全保护兑换');
    });

    it('应该正确计算余额', async () => {
      const userId = 'user_123';
      const recordData = {
        amount: 10,
        type: 'expense',
        source: 'reward',
        userId: userId
      };

      mockStorageAdapter.getAsync.mockResolvedValue([
        TestDataFactory.createStarRecord({
          points: 20,
          balance: 20,
          previousBalance: 0,
          userId: userId
        })
      ]);

      const record = await repository.createStarConsumptionRecord(recordData);

      expect(record.balance).toBe(10);
      expect(record.previousBalance).toBe(20);
    });

    it('应该处理空记录数据', async () => {
      await expect(
        repository.createStarConsumptionRecord(null)
      ).rejects.toThrow('记录数据不能为空');
    });

    it('应该处理空数量', async () => {
      await expect(
        repository.createStarConsumptionRecord({})
      ).rejects.toThrow('消费数量不能为空');
    });

    it('应该处理负数数量', async () => {
      const recordData = { amount: -10 };
      await expect(
        repository.createStarConsumptionRecord(recordData)
      ).rejects.toThrow('消费数量不能为负数');
    });
  });

  // ====== 修复历史记录余额 ======
  describe('repairRecordBalances', () => {
    it('应该修复历史记录的余额信息', async () => {
      const now = Date.now();
      const records = [
        TestDataFactory.createStarRecord({
          timestamp: now - 2000,
          points: 10,
          balance: 10,
          previousBalance: 0
        }),
        TestDataFactory.createStarRecord({
          timestamp: now - 1000,
          points: 5,
          balance: 100, // 错误的余额
          previousBalance: 100
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const result = await repository.repairRecordBalances();

      expect(result.success).toBe(true);
      expect(result.repairedCount).toBeGreaterThan(0);
      expect(mockStorageAdapter.setAsync).toHaveBeenCalled();
    });

    it('应该处理没有记录的情况', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const result = await repository.repairRecordBalances();

      expect(result.success).toBe(true);
      expect(result.repairedCount).toBe(0);
    });

    it('应该处理正确的记录（无需修复）', async () => {
      const records = [
        TestDataFactory.createStarRecord({
          points: 10,
          balance: 10,
          previousBalance: 0
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const result = await repository.repairRecordBalances();

      expect(result.success).toBe(true);
      expect(result.repairedCount).toBe(0);
    });
  });

  // ====== 清除缓存 ======
  describe('clearCache', () => {
    it('应该清除缓存', () => {
      repository.clearCache();

      expect(repository._cache).toBeNull();
      expect(repository._cacheTime).toBe(0);
    });

    it('应该清除存储适配器缓存', () => {
      const mockClearCache = jest.fn();
      mockStorageAdapter.clearCache = mockClearCache;

      repository.clearCache();

      expect(mockClearCache).toHaveBeenCalled();
    });
  });

  // ====== 边界场景 ======
  describe('边界场景', () => {
    it('应该处理空用户ID', async () => {
      const records = [
        TestDataFactory.createStarRecord({
          userId: '',
          type: RecordType.INCOME
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const userRecords = await repository.getRecordsByType(RecordType.INCOME, '');

      expect(userRecords.length).toBe(1);
    });

    it('应该处理零星数（完全保护兑换）', async () => {
      const recordData = {
        amount: 0,
        type: 'expense',
        source: 'reward',
        userId: 'user_123',
        data: { rewardName: '完全保护兑换奖励' }
      };

      mockStorageAdapter.getAsync.mockResolvedValue([
        TestDataFactory.createStarRecord({
          points: 20,
          balance: 20,
          previousBalance: 0,
          userId: 'user_123'
        })
      ]);

      const record = await repository.createStarConsumptionRecord(recordData);

      expect(record).not.toBeNull();
      expect(record.points).toBe(0);
    });

    it('应该处理大数量记录', async () => {
      const records = [];
      for (let i = 0; i < 100; i++) {
        records.push(TestDataFactory.createStarRecord({ id: `record_${i}` }));
      }

      mockStorageAdapter.getAsync.mockResolvedValue(records);

      const allRecords = await repository.getAll();

      expect(allRecords.length).toBe(100);
    });

    it('应该处理空数组批量保存', async () => {
      const savedRecords = await repository.saveAll([]);

      expect(savedRecords).toEqual([]);
    });
  });

  // ====== 错误处理 ======
  describe('错误处理', () => {
    it('应该处理存储错误', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));

      const records = await repository.getAll();

      expect(records).toEqual([]);
    });

    it('应该处理查询错误', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));

      const records = await repository.getRecordsByType(RecordType.INCOME);

      expect(records).toEqual([]);
    });

    it('应该处理保存错误', async () => {
      // 注意：BaseRepository的_saveData内部有try-catch，存储失败不会抛出异常
      // 存储失败时，数据仍会保存在内存缓存中，save方法仍返回实体
      mockStorageAdapter.getAsync.mockResolvedValue([]);
      mockStorageAdapter.setAsync.mockRejectedValue(new Error('存储错误'));

      const record = new StarRecord(TestDataFactory.createStarRecord());
      const savedRecord = await repository.save(record);

      // 存储失败但缓存成功，仍返回实体
      expect(savedRecord).not.toBeNull();
      expect(savedRecord.id).toBe(record.id);
    });
  });
});
