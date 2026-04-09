jest.mock('../../config/database', () => ({
  query: jest.fn(),
  getPool: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
}));

function createRow(overrides = {}) {
  return {
    template_id: 'tpl_1',
    family_id: 'family_1',
    name: '旧模板',
    description: '说明',
    task_payload: JSON.stringify({
      title: '旧任务',
      type: 'study',
      points: 8,
      pointsExpiry: 'quarter',
      description: '旧描述',
      isRequired: true,
      isAllDay: false,
      startDate: '2026-04-08',
      startTime: '18:00',
      endDate: '2026-04-10',
      endTime: '18:30',
      hasNoEndDate: false,
      repeat: {
        type: 'weekly',
        days: [],
        startDate: '2026-04-08',
        endDate: '2026-04-10'
      },
      reminder: {
        enabled: true,
        time: 15
      }
    }),
    date_strategy: JSON.stringify({
      mode: 'inherit-repeat-rule',
      autoShiftExpiredEndDate: true,
      endMode: 'duration',
      durationDays: 3
    }),
    enabled: 1,
    usage_count: 2,
    last_used_at: 100,
    created_by_user_id: 'parent_1',
    created_at: '2026-04-01 10:00:00',
    updated_at: '2026-04-01 10:00:00',
    ...overrides
  };
}

describe('backend TaskTemplateService', () => {
  let connection;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    connection = {
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn(),
      execute: jest.fn()
    };

    const { getPool } = require('../../config/database');
    getPool.mockReturnValue({
      getConnection: jest.fn().mockResolvedValue(connection)
    });
  });

  it('updateTemplate 仅传部分 taskPayload 时应保留既有字段', async () => {
    const { query } = require('../../config/database');

    query.mockResolvedValue([]);
    connection.execute
      .mockResolvedValueOnce([
        [createRow()],
        []
      ])
      .mockResolvedValueOnce([
        { affectedRows: 1 },
        []
      ])
      .mockResolvedValueOnce([
        [createRow({
          task_payload: JSON.stringify({
            title: '新任务',
            type: 'study',
            points: 8,
            pointsExpiry: 'quarter',
            description: '旧描述',
            isRequired: true,
            isAllDay: false,
            startDate: '2026-04-08',
            startTime: '18:00',
            endDate: '2026-04-10',
            endTime: '18:30',
            hasNoEndDate: false,
            repeat: {
              type: 'weekly',
              days: [],
              startDate: '2026-04-08',
              endDate: '2026-04-10'
            },
            reminder: {
              enabled: true,
              time: 15
            }
          }),
          updated_at: '2026-04-01 10:05:00'
        })],
        []
      ]);

    const service = require('../../services/taskTemplateService');
    await service.updateTemplate('tpl_1', 'family_1', {
      taskPayload: {
        title: '新任务'
      }
    });

    const [, params] = connection.execute.mock.calls[1];
    const savedPayload = JSON.parse(params[2]);
    const savedDateStrategy = JSON.parse(params[3]);

    expect(savedPayload).toEqual(expect.objectContaining({
      title: '新任务',
      type: 'study',
      points: 8,
      startTime: '18:00',
      reminder: expect.objectContaining({
        enabled: true,
        time: 15
      })
    }));
    expect(savedDateStrategy).toEqual(expect.objectContaining({
      mode: 'inherit-repeat-rule',
      autoShiftExpiredEndDate: true,
      endMode: 'duration',
      durationDays: 3
    }));
    expect(connection.beginTransaction).toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalled();
  });

  it('updateTemplate 应基于事务内锁定后的最新模板重算更新内容', async () => {
    const { query } = require('../../config/database');

    query.mockResolvedValue([]);
    connection.execute
      .mockResolvedValueOnce([
        [createRow({
          name: '锁内最新模板',
          description: '锁内说明',
          task_payload: JSON.stringify({
            title: '锁内旧任务',
            type: 'study',
            points: 12,
            pointsExpiry: 'quarter',
            description: '锁内旧描述',
            isRequired: false,
            isAllDay: false,
            startDate: '2026-04-08',
            startTime: '20:00',
            endDate: '2026-04-12',
            endTime: '20:30',
            hasNoEndDate: false,
            repeat: {
              type: 'weekly',
              days: [],
              startDate: '2026-04-08',
              endDate: '2026-04-12'
            },
            reminder: {
              enabled: true,
              time: 30
            }
          }),
          date_strategy: JSON.stringify({
            mode: 'inherit-repeat-rule',
            autoShiftExpiredEndDate: false,
            endMode: 'duration',
            durationDays: 5
          }),
          enabled: 0
        })],
        []
      ])
      .mockResolvedValueOnce([
        { affectedRows: 1 },
        []
      ])
      .mockResolvedValueOnce([
        [createRow({
          name: '锁内最新模板',
          description: '锁内说明',
          task_payload: JSON.stringify({
            title: '仅改标题后的任务',
            type: 'study',
            points: 12,
            pointsExpiry: 'quarter',
            description: '锁内旧描述',
            isRequired: false,
            isAllDay: false,
            startDate: '2026-04-08',
            startTime: '20:00',
            endDate: '2026-04-12',
            endTime: '20:30',
            hasNoEndDate: false,
            repeat: {
              type: 'weekly',
              days: [],
              startDate: '2026-04-08',
              endDate: '2026-04-12'
            },
            reminder: {
              enabled: true,
              time: 30
            }
          }),
          date_strategy: JSON.stringify({
            mode: 'inherit-repeat-rule',
            autoShiftExpiredEndDate: false,
            endMode: 'duration',
            durationDays: 5
          }),
          enabled: 0
        })],
        []
      ]);

    const service = require('../../services/taskTemplateService');
    await service.updateTemplate('tpl_1', 'family_1', {
      taskPayload: {
        title: '仅改标题后的任务'
      }
    });

    const [, params] = connection.execute.mock.calls[1];
    const savedPayload = JSON.parse(params[2]);
    const savedDateStrategy = JSON.parse(params[3]);

    expect(savedPayload).toEqual(expect.objectContaining({
      title: '仅改标题后的任务',
      points: 12,
      pointsExpiry: 'quarter',
      startTime: '20:00',
      reminder: expect.objectContaining({
        enabled: true,
        time: 30
      })
    }));
    expect(savedDateStrategy).toEqual(expect.objectContaining({
      mode: 'inherit-repeat-rule',
      autoShiftExpiredEndDate: false,
      endMode: 'duration',
      durationDays: 5
    }));
    expect(params[4]).toBe(0);
  });

  it('recordUsage 应使用 SQL 原子自增而非本地读改写', async () => {
    const { query } = require('../../config/database');

    query
      .mockResolvedValueOnce([
        createRow({
          name: '模板A',
          description: '',
          task_payload: '{}',
          date_strategy: '{}',
          last_used_at: null
        })
      ]);
    connection.execute
      .mockResolvedValueOnce([
        [createRow({
          name: '模板A',
          description: '',
          task_payload: '{}',
          date_strategy: '{}',
          last_used_at: null
        })],
        []
      ])
      .mockResolvedValueOnce([
        { affectedRows: 1 },
        []
      ])
      .mockResolvedValueOnce([
        [createRow({
          name: '模板A',
          description: '',
          task_payload: '{}',
          date_strategy: '{}',
          usage_count: 3,
          last_used_at: 123456,
          updated_at: '2026-04-01 10:05:00'
        })],
        []
      ]);

    const service = require('../../services/taskTemplateService');
    await service.recordUsage('tpl_1', 'family_1');

    expect(connection.execute).toHaveBeenCalledWith(
      expect.stringContaining('usage_count = usage_count + 1'),
      expect.any(Array)
    );
    expect(connection.beginTransaction).toHaveBeenCalled();
  });

  it('createTemplate 应插入模板并返回创建结果', async () => {
    const { query } = require('../../config/database');
    query.mockResolvedValue();
    connection.execute
      .mockResolvedValueOnce([
        { affectedRows: 1, insertId: 1 },
        []
      ])
      .mockResolvedValueOnce([
        [createRow({
          template_id: 'tpl_created',
          name: '晚间阅读',
          description: '睡前固定任务',
          task_payload: JSON.stringify({
            title: '晚间阅读20分钟',
            type: 'study',
            points: 3,
            startDate: '2026-04-08',
            endDate: '2026-04-08',
            repeat: { type: 'daily', days: [] },
            reminder: { enabled: false, time: 0 }
          }),
          date_strategy: JSON.stringify({
            mode: 'today',
            autoShiftExpiredEndDate: true,
            endMode: 'duration',
            durationDays: 1
          })
        })],
        []
      ]);

    const service = require('../../services/taskTemplateService');
    const created = await service.createTemplate('family_1', 'parent_1', {
      name: '晚间阅读',
      description: '睡前固定任务',
      taskPayload: {
        title: '晚间阅读20分钟',
        type: 'study',
        points: 3,
        repeat: { type: 'daily' }
      },
      dateStrategy: {
        endMode: 'duration',
        durationDays: 10
      }
    });

    expect(connection.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO task_templates'),
      expect.arrayContaining([
        expect.any(String),
        'family_1',
        '晚间阅读',
        '睡前固定任务'
      ])
    );
    expect(created.templateId).toBe('tpl_created');
    expect(created.name).toBe('晚间阅读');
    expect(connection.commit).toHaveBeenCalled();
  });

  it('createTemplate 应拒绝超长名称', async () => {
    const service = require('../../services/taskTemplateService');

    await expect(service.createTemplate('family_1', 'parent_1', {
      name: '长'.repeat(101),
      taskPayload: {
        title: '有效任务名'
      }
    })).rejects.toMatchObject({
      code: 'INVALID_PARAMS',
      message: '模板名称不能超过100个字符'
    });

    expect(connection.execute).not.toHaveBeenCalled();
  });

  it('listTemplates 应按状态和关键字过滤并按使用次数排序', async () => {
    const { query } = require('../../config/database');
    query.mockResolvedValue([
      createRow({
        template_id: 'tpl_usage_high',
        name: '阅读强化',
        usage_count: 9,
        last_used_at: 200
      }),
      createRow({
        template_id: 'tpl_usage_low',
        name: '阅读基础',
        usage_count: 3,
        last_used_at: 300
      }),
      createRow({
        template_id: 'tpl_disabled',
        name: '刷牙模板',
        enabled: 0,
        task_payload: JSON.stringify({
          title: '睡前刷牙',
          type: 'habit',
          repeat: { type: 'daily', days: [] },
          reminder: { enabled: false, time: 0 }
        })
      })
    ]);

    const service = require('../../services/taskTemplateService');
    const templates = await service.listTemplates('family_1', {
      keyword: '阅读',
      status: 'enabled',
      sortBy: 'usage'
    });

    expect(templates.map((item) => item.templateId)).toEqual([
      'tpl_usage_high',
      'tpl_usage_low'
    ]);
  });

  it('setTemplateEnabled 应更新启停状态并返回最新模板', async () => {
    const { query } = require('../../config/database');
    query
      .mockResolvedValueOnce([createRow({ enabled: 1 })]);
    connection.execute
      .mockResolvedValueOnce([
        [createRow({ enabled: 1 })],
        []
      ])
      .mockResolvedValueOnce([
        { affectedRows: 1 },
        []
      ])
      .mockResolvedValueOnce([
        [createRow({ enabled: 0, updated_at: '2026-04-01 10:10:00' })],
        []
      ]);

    const service = require('../../services/taskTemplateService');
    const template = await service.setTemplateEnabled('tpl_1', 'family_1', false);

    expect(connection.execute).toHaveBeenCalledWith(
      expect.stringContaining('SET enabled = ?'),
      [0, 'tpl_1', 'family_1']
    );
    expect(template.enabled).toBe(false);
  });

  it('deleteTemplate 应执行软删除', async () => {
    const { query } = require('../../config/database');
    query.mockResolvedValueOnce([createRow()]);
    connection.execute
      .mockResolvedValueOnce([
        [createRow()],
        []
      ])
      .mockResolvedValueOnce([
        { affectedRows: 1 },
        []
      ]);

    const service = require('../../services/taskTemplateService');
    await service.deleteTemplate('tpl_1', 'family_1');

    expect(connection.execute).toHaveBeenCalledWith(
      expect.stringContaining('SET deleted_at = CURRENT_TIMESTAMP'),
      ['tpl_1', 'family_1']
    );
    expect(connection.commit).toHaveBeenCalled();
  });
});
