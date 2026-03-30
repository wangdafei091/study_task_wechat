jest.mock('../../config/database', () => ({
  getPool: jest.fn(),
  query: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
}));

describe('backend StarService active group filtering', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-30T09:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('getStarGroupsByUser 应排除已过期与非法 expiry_date 分组', async () => {
    const { query } = require('../../config/database');
    query.mockResolvedValue([
      {
        group_id: 'group_permanent',
        user_id: 'child_1',
        type: 'permanent',
        stars: 5,
        expiry_date: null
      },
      {
        group_id: 'group_today',
        user_id: 'child_1',
        type: 'week',
        stars: 3,
        expiry_date: '2026-03-30'
      },
      {
        group_id: 'group_legacy_today',
        user_id: 'child_1',
        type: 'month',
        stars: 2,
        expiry_date: '今天到期'
      },
      {
        group_id: 'group_expired',
        user_id: 'child_1',
        type: 'week',
        stars: 7,
        expiry_date: '2026-03-29'
      },
      {
        group_id: 'group_legacy_expired',
        user_id: 'child_1',
        type: 'month',
        stars: 9,
        expiry_date: '2026-03-29 到期'
      },
      {
        group_id: 'group_invalid',
        user_id: 'child_1',
        type: 'quarter',
        stars: 4,
        expiry_date: 'not-a-date'
      }
    ]);

    const service = require('../../services/starService');
    const groups = await service.getStarGroupsByUser('child_1');

    expect(groups.map(group => group.groupId)).toEqual([
      'group_permanent',
      'group_today',
      'group_legacy_today'
    ]);
  });

  it('getStarSummary 总星星应只统计活跃分组', async () => {
    const { query } = require('../../config/database');
    query.mockResolvedValue([
      {
        group_id: 'group_active',
        user_id: 'child_1',
        type: 'week',
        stars: 6,
        expiry_date: '2026-03-30'
      },
      {
        group_id: 'group_expired',
        user_id: 'child_1',
        type: 'week',
        stars: 10,
        expiry_date: '2026-03-29'
      }
    ]);

    const service = require('../../services/starService');
    const summary = await service.getStarSummary('child_1');

    expect(summary.totalPoints).toBe(6);
    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0].groupId).toBe('group_active');
  });

  it('历史相对文案 expiry_date 应基于分组自身时间锚点判断是否过期', async () => {
    const { query } = require('../../config/database');
    query.mockResolvedValue([
      {
        group_id: 'group_relative_old',
        user_id: 'child_1',
        type: 'week',
        stars: 4,
        expiry_date: '今天到期',
        modify_time: new Date('2026-03-28T08:00:00.000Z').getTime()
      },
      {
        group_id: 'group_relative_future',
        user_id: 'child_1',
        type: 'week',
        stars: 5,
        expiry_date: '明天到期',
        modify_time: new Date('2026-03-30T08:00:00.000Z').getTime()
      }
    ]);

    const service = require('../../services/starService');
    const groups = await service.getStarGroupsByUser('child_1');

    expect(groups.map(group => group.groupId)).toEqual(['group_relative_future']);
  });

  it('_getGroupsByUserConn 应在事务内同样排除已过期分组', async () => {
    const service = require('../../services/starService');
    const connection = {
      execute: jest.fn().mockResolvedValue([[
        {
          group_id: 'group_future',
          user_id: 'child_1',
          type: 'month',
          stars: 5,
          expiry_date: '2026-03-31'
        },
        {
          group_id: 'group_expired',
          user_id: 'child_1',
          type: 'month',
          stars: 8,
          expiry_date: '2026-03-28 到期'
        }
      ]])
    };

    const rows = await service._getGroupsByUserConn(connection, 'child_1');

    expect(rows).toEqual([
      expect.objectContaining({ group_id: 'group_future' })
    ]);
  });
});
