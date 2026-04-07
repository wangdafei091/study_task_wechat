/**
 * star-record.test.js - StarRecord 领域模型测试
 *
 * 测试 StarRecord 领域模型的数据结构和业务方法
 */

const { StarRecord, RecordType, RecordSource } = require('../../models/star-record');

describe('StarRecord 领域模型', () => {

  describe('构造函数', () => {
    it('应该使用默认值创建记录', () => {
      const record = new StarRecord({});
      expect(record.id).toBeDefined();
      expect(record.userId).toBe('');
      expect(record.type).toBe(RecordType.INCOME);
      expect(record.source).toBe(RecordSource.SYSTEM);
      expect(record.points).toBe(0);
      expect(record.description).toBe('');
      expect(record.data).toEqual({});
      expect(record.balance).toBe(0);
      expect(record.previousBalance).toBe(0);
    });

    it('应该使用提供的数据创建记录', () => {
      const recordData = {
        id: 'record_123',
        userId: 'user_456',
        type: RecordType.INCOME,
        source: RecordSource.TASK,
        sourceId: 'task_789',
        points: 10,
        description: '完成任务获得星星',
        balance: 100,
        previousBalance: 90,
        timestamp: Date.now()
      };
      const record = new StarRecord(recordData);
      expect(record.id).toBe('record_123');
      expect(record.userId).toBe('user_456');
      expect(record.type).toBe(RecordType.INCOME);
      expect(record.source).toBe(RecordSource.TASK);
      expect(record.sourceId).toBe('task_789');
      expect(record.points).toBe(10);
      expect(record.description).toBe('完成任务获得星星');
      expect(record.balance).toBe(100);
      expect(record.previousBalance).toBe(90);
    });

    it('应该生成默认ID', () => {
      const record = new StarRecord({});
      expect(record.id).toMatch(/^record_\d+_\d+$/);
    });

    it('应该设置默认时间戳', () => {
      const record = new StarRecord({});
      expect(record.timestamp).toBeDefined();
      expect(record.timestamp).toBeGreaterThan(0);
      expect(record.timestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('validate', () => {
    it('有效的记录应该通过验证', () => {
      const record = new StarRecord({
        type: RecordType.INCOME,
        source: RecordSource.TASK,
        points: 10
      });
      const errors = record.validate();
      expect(errors).toHaveLength(0);
    });

    it('无效的记录类型应该返回验证错误', () => {
      const record = new StarRecord({ type: 'invalid_type' });
      const errors = record.validate();
      expect(errors).toContain('无效的记录类型: invalid_type');
    });

    it('星星数量为0且非完全保护兑换时应该返回错误', () => {
      const record = new StarRecord({
        type: RecordType.EXPENSE,
        points: 0,
        description: '普通记录'
      });
      const errors = record.validate();
      expect(errors).toContain('星星数量不能为0（完全保护兑换除外）');
    });

    it('完全保护兑换允许0星星', () => {
      const record = new StarRecord({
        type: RecordType.EXPENSE,
        points: 0,
        description: '完全保护兑换，消耗0颗星星'
      });
      const errors = record.validate();
      expect(errors).toHaveLength(0);
    });

    it('收入记录点数必须为正数', () => {
      const record = new StarRecord({
        type: RecordType.INCOME,
        points: -5
      });
      const errors = record.validate();
      expect(errors).toContain('收入记录的星星数量必须为正数');
    });

    it('收入记录点数为0应该返回错误', () => {
      const record = new StarRecord({
        type: RecordType.INCOME,
        points: 0
      });
      const errors = record.validate();
      expect(errors).toContain('星星数量不能为0（完全保护兑换除外）');
    });

    it('支出记录点数必须为负数或0', () => {
      const record = new StarRecord({
        type: RecordType.EXPENSE,
        points: 10
      });
      const errors = record.validate();
      expect(errors).toContain('支出记录的星星数量必须为负数或0（完全保护兑换）');
    });

    it('支出记录允许负数', () => {
      const record = new StarRecord({
        type: RecordType.EXPENSE,
        points: -10,
        description: '兑换奖励'
      });
      const errors = record.validate();
      expect(errors).toHaveLength(0);
    });
  });

  describe('getFormattedTime', () => {
    it('应该返回格式化的时间字符串', () => {
      const timestamp = new Date('2026-03-04T12:30:45').getTime();
      const record = new StarRecord({ timestamp });
      const formattedTime = record.getFormattedTime();
      expect(formattedTime).toContain('2026');
      expect(formattedTime).toContain('12');
      expect(formattedTime).toContain('30');
    });
  });

  describe('getDate', () => {
    it('应该返回YYYY-MM-DD格式的日期字符串', () => {
      const timestamp = new Date('2026-03-04T12:30:45').getTime();
      const record = new StarRecord({ timestamp });
      const date = record.getDate();
      expect(date).toBe('2026-03-04');
    });

    it('应该正确处理跨年日期', () => {
      const timestamp = new Date('2025-12-31T23:59:59').getTime();
      const record = new StarRecord({ timestamp });
      const date = record.getDate();
      expect(date).toBe('2025-12-31');
    });
  });

  describe('getMonth', () => {
    it('应该返回YYYY-MM格式的月份字符串', () => {
      const timestamp = new Date('2026-03-04T12:30:45').getTime();
      const record = new StarRecord({ timestamp });
      const month = record.getMonth();
      expect(month).toBe('2026-03');
    });

    it('应该正确处理1月', () => {
      const timestamp = new Date('2026-01-15T12:30:45').getTime();
      const record = new StarRecord({ timestamp });
      const month = record.getMonth();
      expect(month).toBe('2026-01');
    });

    it('应该正确处理12月', () => {
      const timestamp = new Date('2026-12-15T12:30:45').getTime();
      const record = new StarRecord({ timestamp });
      const month = record.getMonth();
      expect(month).toBe('2026-12');
    });
  });

  describe('getDisplayDate', () => {
    it('没有原始任务日期时应该返回当前日期', () => {
      const timestamp = new Date('2026-03-04').getTime();
      const record = new StarRecord({
        timestamp,
        originalTaskDate: null
      });
      const displayDate = record.getDisplayDate();
      expect(displayDate).toBe('2026-03-04');
    });

    it('有原始任务日期时应该返回原始任务日期', () => {
      const timestamp = new Date('2026-03-04').getTime();
      const record = new StarRecord({
        timestamp,
        originalTaskDate: '2026-03-03'
      });
      const displayDate = record.getDisplayDate();
      expect(displayDate).toBe('2026-03-03');
    });
  });

  describe('getPenaltyDisplayInfo', () => {
    it('惩罚记录应该返回双时间显示信息', () => {
      const executionTime = new Date('2026-03-04T14:30:00').getTime();
      const record = new StarRecord({
        type: RecordType.EXPENSE,
        source: RecordSource.TASK,
        timestamp: executionTime,
        originalTaskDate: '2026-03-03'
      });
      const info = record.getPenaltyDisplayInfo();
      expect(info).not.toBeNull();
      expect(info.mainTime).toBe('应该完成：2026-03-03');
      expect(info.subTime).toContain('实际扣星：');
      expect(info.subTime).toContain('2026-03-04');
      expect(info.subTime).toContain('14:30');
    });

    it('非惩罚记录应该返回null', () => {
      const record = new StarRecord({
        type: RecordType.INCOME,
        source: RecordSource.TASK
      });
      const info = record.getPenaltyDisplayInfo();
      expect(info).toBeNull();
    });

    it('非任务来源的支出记录应该返回null', () => {
      const record = new StarRecord({
        type: RecordType.EXPENSE,
        source: RecordSource.REWARD,
        originalTaskDate: '2026-03-03'
      });
      const info = record.getPenaltyDisplayInfo();
      expect(info).toBeNull();
    });

    it('没有原始任务日期的惩罚记录应该返回null', () => {
      const record = new StarRecord({
        type: RecordType.EXPENSE,
        source: RecordSource.TASK
      });
      const info = record.getPenaltyDisplayInfo();
      expect(info).toBeNull();
    });
  });

  describe('getAbsolutePoints', () => {
    it('应该返回正数的绝对值', () => {
      const record = new StarRecord({ points: 10 });
      expect(record.getAbsolutePoints()).toBe(10);
    });

    it('应该返回负数的绝对值', () => {
      const record = new StarRecord({ points: -10 });
      expect(record.getAbsolutePoints()).toBe(10);
    });

    it('应该返回0的绝对值', () => {
      const record = new StarRecord({ points: 0 });
      expect(record.getAbsolutePoints()).toBe(0);
    });
  });

  describe('isIncome', () => {
    it('收入记录应该返回true', () => {
      const record = new StarRecord({ type: RecordType.INCOME });
      expect(record.isIncome()).toBe(true);
    });

    it('支出记录应该返回false', () => {
      const record = new StarRecord({ type: RecordType.EXPENSE });
      expect(record.isIncome()).toBe(false);
    });
  });

  describe('isExpense', () => {
    it('支出记录应该返回true', () => {
      const record = new StarRecord({ type: RecordType.EXPENSE });
      expect(record.isExpense()).toBe(true);
    });

    it('收入记录应该返回false', () => {
      const record = new StarRecord({ type: RecordType.INCOME });
      expect(record.isExpense()).toBe(false);
    });
  });

  describe('clone', () => {
    it('应该克隆记录并生成新ID', () => {
      const originalRecord = new StarRecord({
        id: 'record_123',
        points: 10,
        description: '测试记录'
      });
      const clonedRecord = originalRecord.clone();
      expect(clonedRecord.id).not.toBe(originalRecord.id);
      expect(clonedRecord.points).toBe(originalRecord.points);
      expect(clonedRecord.description).toBe(originalRecord.description);
      expect(clonedRecord).not.toBe(originalRecord);
    });

    it('克隆记录应该生成新时间戳', () => {
      const originalRecord = new StarRecord({ points: 10, timestamp: 1000 });
      const clonedRecord = originalRecord.clone();
      expect(clonedRecord.timestamp).toBeGreaterThan(originalRecord.timestamp);
    });

    it('克隆记录应该覆盖属性', () => {
      const originalRecord = new StarRecord({ points: 10, description: '原始描述' });
      const clonedRecord = originalRecord.clone({ points: 20, description: '新描述' });
      expect(clonedRecord.points).toBe(20);
      expect(clonedRecord.description).toBe('新描述');
    });

    it('克隆记录时不生成新ID', () => {
      const originalRecord = new StarRecord({
        id: 'record_123',
        points: 10
      });
      const clonedRecord = originalRecord.clone({}, false);
      expect(clonedRecord.id).toBe(originalRecord.id);
    });

    it('克隆记录时应复制 data，避免与原对象共享嵌套引用', () => {
      const originalRecord = new StarRecord({
        id: 'record_123',
        points: 10,
        data: {
          expiry: {
            type: 'daily'
          }
        }
      });

      const clonedRecord = originalRecord.clone();
      clonedRecord.data.expiry.type = 'weekly';

      expect(originalRecord.data.expiry.type).toBe('daily');
      expect(clonedRecord.data.expiry.type).toBe('weekly');
    });
  });

  describe('createTaskCompleteRecord', () => {
    it('应该创建任务完成记录', () => {
      const record = StarRecord.createTaskCompleteRecord(
        10,
        'task_123',
        '完成数学作业',
        100,
        90,
        'user_456'
      );
      expect(record.type).toBe(RecordType.INCOME);
      expect(record.source).toBe(RecordSource.TASK);
      expect(record.sourceId).toBe('task_123');
      expect(record.points).toBe(10);
      expect(record.description).toBe('完成数学作业');
      expect(record.balance).toBe(100);
      expect(record.previousBalance).toBe(90);
      expect(record.userId).toBe('user_456');
    });

    it('负数点数应该转为正数', () => {
      const record = StarRecord.createTaskCompleteRecord(
        -10,
        'task_123',
        '完成任务',
        100,
        90
      );
      expect(record.points).toBe(10);
    });

    it('默认描述应该基于点数生成', () => {
      const record = StarRecord.createTaskCompleteRecord(
        15,
        'task_123',
        null,
        100,
        90
      );
      expect(record.description).toBe('完成任务获得15颗星星');
    });
  });

  describe('createRewardExchangeRecord', () => {
    it('应该创建奖励兑换记录', () => {
      const record = StarRecord.createRewardExchangeRecord(
        10,
        'reward_123',
        '兑换玩具',
        90,
        100,
        'user_456'
      );
      expect(record.type).toBe(RecordType.EXPENSE);
      expect(record.source).toBe(RecordSource.REWARD);
      expect(record.sourceId).toBe('reward_123');
      expect(record.points).toBe(-10);
      expect(record.description).toBe('兑换玩具');
      expect(record.balance).toBe(90);
      expect(record.previousBalance).toBe(100);
      expect(record.userId).toBe('user_456');
    });

    it('负数点数应该转为正数后取负', () => {
      const record = StarRecord.createRewardExchangeRecord(
        -10,
        'reward_123',
        '兑换奖励',
        90,
        100
      );
      expect(record.points).toBe(-10);
    });

    it('默认描述应该基于点数生成', () => {
      const record = StarRecord.createRewardExchangeRecord(
        15,
        'reward_123',
        null,
        85,
        100
      );
      expect(record.description).toBe('兑换奖励消费15颗星星');
    });
  });

  describe('createExpiredRecord', () => {
    it('应该创建星星过期记录', () => {
      const record = StarRecord.createExpiredRecord(
        10,
        'week',
        '星星过期',
        90,
        100,
        'user_456'
      );
      expect(record.type).toBe(RecordType.EXPENSE);
      expect(record.source).toBe(RecordSource.SYSTEM);
      expect(record.sourceId).toBe('expired_week');
      expect(record.points).toBe(-10);
      expect(record.description).toBe('星星过期');
      expect(record.balance).toBe(90);
      expect(record.previousBalance).toBe(100);
      expect(record.userId).toBe('user_456');
    });

    it('负数点数应该转为正数后取负', () => {
      const record = StarRecord.createExpiredRecord(
        -10,
        'week',
        '过期',
        90,
        100
      );
      expect(record.points).toBe(-10);
    });

    it('默认描述应该基于点数生成', () => {
      const record = StarRecord.createExpiredRecord(
        15,
        'week',
        null,
        85,
        100
      );
      expect(record.description).toBe('星星过期失效15颗');
    });
  });

  describe('createPenaltyRecord', () => {
    it('应该创建必做任务惩罚记录（余额充足）', () => {
      const record = StarRecord.createPenaltyRecord(
        10,
        'task_123',
        '必做任务惩罚: 数学作业',
        90,
        100,
        'user_456',
        '2026-03-03',
        10
      );
      expect(record.type).toBe(RecordType.EXPENSE);
      expect(record.source).toBe(RecordSource.TASK);
      expect(record.sourceId).toBe('task_123');
      expect(record.points).toBe(-10);
      expect(record.balance).toBe(90);
      expect(record.previousBalance).toBe(100);
      expect(record.userId).toBe('user_456');
      expect(record.originalTaskDate).toBe('2026-03-03');
      expect(record.requestedPoints).toBe(10);
      expect(record.description).toContain('必做任务【数学作业】');
      expect(record.description).toContain('扣除10颗星星');
    });

    it('惩罚记录（余额不足）应该生成特殊描述', () => {
      const record = StarRecord.createPenaltyRecord(
        5,
        'task_123',
        '必做任务惩罚: 数学作业',
        95,
        100,
        'user_456',
        '2026-03-03',
        10
      );
      expect(record.points).toBe(-5);
      expect(record.description).toContain('应扣10颗星星');
      expect(record.description).toContain('实扣5颗');
    });

    it('默认描述应该提取任务名称', () => {
      const record = StarRecord.createPenaltyRecord(
        10,
        'task_123',
        null,
        90,
        100,
        null,
        '2026-03-03'
      );
      expect(record.description).toContain('必做任务【任务】');
      expect(record.description).toContain('扣除10颗星星');
    });

    it('负数点数应该转为正数后取负', () => {
      const record = StarRecord.createPenaltyRecord(
        -10,
        'task_123',
        '惩罚',
        90,
        100
      );
      expect(record.points).toBe(-10);
    });
  });

  describe('边界条件', () => {
    it('应该处理data为undefined', () => {
      const record = new StarRecord({ data: undefined });
      expect(record.data).toEqual({});
    });

    it('应该处理sourceId为空字符串', () => {
      const record = new StarRecord({ sourceId: '' });
      expect(record.sourceId).toBe('');
    });

    it('应该处理originalTaskDate为null', () => {
      const record = new StarRecord({ originalTaskDate: null });
      expect(record.originalTaskDate).toBeNull();
    });

    it('应该处理requestedPoints为null', () => {
      const record = new StarRecord({ requestedPoints: null });
      expect(record.requestedPoints).toBeNull();
    });

    it('应该处理非常大的点数值', () => {
      const record = new StarRecord({ points: 999999 });
      expect(record.points).toBe(999999);
    });

    it('应该处理非常长的描述', () => {
      const longDesc = 'A'.repeat(1000);
      const record = new StarRecord({ description: longDesc });
      expect(record.description).toBe(longDesc);
    });
  });
});
