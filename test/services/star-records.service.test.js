jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const starRecords = require('../../services/star-service/star-records');

describe('services/star-service/star-records helpers', () => {
  it('classifyStarRecord 应按优先级优先识别 expired', () => {
    const semanticType = starRecords.classifyStarRecord({
      points: -3,
      source: 'reward_exchange',
      sourceId: 'expired_week'
    });

    expect(semanticType).toBe('expired');
  });

  it('buildDisplayRecord 应保留惩罚记录双时间语义', () => {
    const record = starRecords.buildDisplayRecord({}, {
      id: 'penalty_1',
      points: -2,
      source: 'task',
      sourceId: 'task_1',
      originalTaskDate: '2026-04-14',
      description: '必做任务【阅读】未完成，扣除2颗星星',
      timestamp: new Date('2026-04-15T21:30:00+08:00').getTime()
    });

    expect(record.semanticType).toBe('task_penalty');
    expect(record.primaryTimeText).toBe('应该完成：2026-04-14');
    expect(record.secondaryTimeText).toBe('实际扣星：2026-04-15 21:30');
  });

  it('buildDisplayRecord 应将 task_reset 识别为取消完成而不是未完成扣除', () => {
    const record = starRecords.buildDisplayRecord({}, {
      id: 'reset_1',
      points: -2,
      source: 'task_reset',
      sourceId: 'task_1',
      originalTaskDate: '2026-04-14',
      description: '取消完成任务: 收拾房子',
      timestamp: new Date('2026-04-15T20:44:00+08:00').getTime()
    });

    expect(record.semanticType).toBe('task_reset');
    expect(record.title).toBe('取消完成任务：收拾房子（2026-04-14）');
    expect(record.tagText).toBe('取消完成');
    expect(record.subtitle).toBe('原任务日期 · 2026-04-14');
    expect(record.primaryTimeText).toBe('2026-04-15 20:44');
    expect(record.secondaryTimeText).toBe('');
  });

  it('buildStarRecordViewModel 在 loss_event 下应保留全部负向变动且不再输出周期汇总', () => {
    const viewModel = starRecords.buildStarRecordViewModel({}, [
      {
        id: 'exchange_1',
        points: -8,
        source: 'reward_exchange',
        sourceId: 'reward_1',
        timestamp: new Date('2026-04-15T10:00:00+08:00').getTime(),
        data: { rewardName: '电影票' }
      },
      {
        id: 'expired_1',
        points: -4,
        source: 'system',
        sourceId: 'expired_month',
        timestamp: new Date('2026-04-13T10:00:00+08:00').getTime()
      },
      {
        id: 'penalty_1',
        points: -3,
        source: 'task',
        sourceId: 'task_1',
        originalTaskDate: '2026-04-12',
        timestamp: new Date('2026-04-12T20:00:00+08:00').getTime(),
        description: '必做任务【阅读】未完成，扣除3颗星星'
      },
      {
        id: 'reset_1',
        points: -2,
        source: 'task_reset',
        sourceId: 'task_1',
        originalTaskDate: '2026-04-14',
        timestamp: new Date('2026-04-14T20:00:00+08:00').getTime(),
        description: '取消完成任务: 收拾房子'
      },
      {
        id: 'refund_revoke_1',
        points: -2,
        source: 'task_makeup_refund_revoke',
        sourceId: 'task_1',
        timestamp: new Date('2026-04-11T20:00:00+08:00').getTime(),
        description: '撤销补打卡，退回星星'
      }
    ], {
      activeFilter: 'loss_event',
      activeTimeScope: 'currentMonth',
      nowTimestamp: new Date('2026-04-15T23:00:00+08:00').getTime()
    });

    expect(viewModel.records).toHaveLength(5);
    expect(viewModel.records.map((record) => record.semanticType)).toEqual([
      'reward_exchange',
      'task_reset',
      'expired',
      'task_penalty',
      'other_change'
    ]);
    expect(viewModel.scopeSummary).toBeUndefined();
  });

  it('groupRecordsByMonth 应按上海自然月分组，避免时区漂移', () => {
    const viewModel = starRecords.buildStarRecordViewModel({}, [
      {
        id: 'boundary_1',
        points: 2,
        source: 'task_complete',
        sourceId: 'task_1',
        expiryType: 'week',
        expiryDate: '2026-04-06',
        description: '完成任务获得2颗星星',
        timestamp: new Date('2026-04-01T00:10:00+08:00').getTime()
      }
    ], {
      activeFilter: 'all',
      activeTimeScope: 'all',
      nowTimestamp: new Date('2026-04-15T12:00:00+08:00').getTime()
    });

    expect(viewModel.isGroupedView).toBe(true);
    expect(viewModel.groupedRecords).toHaveLength(1);
    expect(viewModel.groupedRecords[0].month).toBe('2026-04');
    expect(viewModel.groupedRecords[0].monthText).toBe('2026年4月');
  });

  it('calculateMonthSummary 应兼容按月分组后的原始记录输入', () => {
    const result = starRecords.calculateMonthSummary({}, [
      {
        month: '2026-04',
        monthText: '2026年4月',
        records: [
          {
            id: 'income_1',
            points: 5,
            source: 'task_complete',
            sourceId: 'task_1',
            timestamp: new Date('2026-04-02T10:00:00+08:00').getTime()
          },
          {
            id: 'exchange_1',
            points: -2,
            source: 'reward_exchange',
            sourceId: 'reward_1',
            timestamp: new Date('2026-04-03T10:00:00+08:00').getTime()
          }
        ]
      }
    ]);

    expect(result[0].monthSummary).toBe('获得 5 · 减少 2');
    expect(result[0].incomeTotal).toBe(5);
    expect(result[0].expenseTotal).toBe(2);
    expect(result[0].netChange).toBe(3);
  });
});
