const TaskTemplate = require('../../models/task-template');

describe('TaskTemplate', () => {
  it('应构造默认模板并补齐默认字段', () => {
    const template = new TaskTemplate();

    expect(template.id).toContain('task_tpl_');
    expect(template.enabled).toBe(true);
    expect(template.usageCount).toBe(0);
    expect(template.taskPayload.type).toBe('habit');
    expect(template.taskPayload.repeat.type).toBe('none');
    expect(template.dateStrategy.mode).toBe('today');
    expect(template.dateStrategy.endMode).toBe('same-day');
    expect(template.dateStrategy.durationDays).toBe(1);
  });

  it('应对历史枚举做兼容归一化', () => {
    const template = new TaskTemplate({
      name: '阅读模板',
      taskPayload: {
        title: '晚间阅读',
        pointsExpiry: 'quarter',
        repeat: {
          type: 'monthly'
        }
      }
    });

    expect(template.taskPayload.pointsExpiry).toBe('quarter');
    expect(template.taskPayload.repeat.type).toBe('none');
  });

  it('重复长期模板应保留 endMode=no-end 与 durationDays=null', () => {
    const template = new TaskTemplate({
      name: '晚间阅读',
      taskPayload: {
        title: '晚间阅读',
        hasNoEndDate: true,
        repeat: {
          type: 'daily'
        }
      },
      dateStrategy: {
        mode: 'inherit-repeat-rule',
        endMode: 'no-end',
        durationDays: null
      }
    });

    expect(template.dateStrategy).toEqual(expect.objectContaining({
      mode: 'inherit-repeat-rule',
      endMode: 'no-end',
      durationDays: null
    }));
  });

  it('clone(false) 应保留 id 且深拷贝 payload', () => {
    const template = new TaskTemplate({
      name: '游泳模板',
      taskPayload: {
        title: '游泳课',
        repeat: {
          type: 'custom',
          days: [2, 4]
        }
      }
    });

    const cloned = template.clone();
    cloned.taskPayload.repeat.days.push(6);

    expect(cloned.id).toBe(template.id);
    expect(template.taskPayload.repeat.days).toEqual([2, 4]);
  });

  it('validate 应拦截缺失模板名和自定义重复未选星期', () => {
    const template = new TaskTemplate({
      taskPayload: {
        title: '晨跑',
        repeat: {
          type: 'custom',
          days: []
        }
      }
    });

    expect(template.validate()).toEqual([
      '模板名称不能为空',
      '自定义重复模板至少选择一个星期'
    ]);
  });

  it('validate 应拦截超长模板名称与说明', () => {
    const template = new TaskTemplate({
      name: '长'.repeat(101),
      description: '描'.repeat(256),
      taskPayload: {
        title: '晨跑'
      }
    });

    expect(template.validate()).toEqual([
      '模板名称不能超过100个字符',
      '模板说明不能超过255个字符'
    ]);
  });

  it('validate 应拦截超过 93 天的重复模板范围', () => {
    const template = new TaskTemplate({
      name: '长期模板',
      taskPayload: {
        title: '阅读',
        repeat: {
          type: 'daily'
        }
      },
      dateStrategy: {
        mode: 'inherit-repeat-rule',
        endMode: 'duration',
        durationDays: 96
      }
    });

    expect(template.validate()).toContain('时间范围过长，请缩短后再保存');
  });

  it('validate 应允许历史超长模板在不扩张范围时修改其他字段', () => {
    const template = new TaskTemplate({
      name: '长期模板',
      description: '新说明',
      taskPayload: {
        title: '阅读',
        repeat: {
          type: 'daily'
        }
      },
      dateStrategy: {
        mode: 'inherit-repeat-rule',
        endMode: 'duration',
        durationDays: 96
      }
    });

    expect(template.validate({
      previousTemplate: {
        taskPayload: template.taskPayload,
        dateStrategy: template.dateStrategy
      }
    })).toEqual([]);
  });

  it('toJSON 应返回深拷贝数据', () => {
    const template = new TaskTemplate({
      name: '整理书包',
      taskPayload: {
        title: '整理书包',
        repeat: {
          type: 'custom',
          days: [1, 2]
        }
      }
    });

    const json = template.toJSON();
    json.taskPayload.repeat.days.push(5);

    expect(template.taskPayload.repeat.days).toEqual([1, 2]);
  });

  it('clone(true) 应生成新 id 并重置使用统计', () => {
    const template = new TaskTemplate({
      name: '晚间阅读',
      usageCount: 8,
      lastUsedAt: 123456789,
      taskPayload: {
        title: '阅读20分钟'
      }
    });

    const cloned = template.clone({}, true);

    expect(cloned.id).not.toBe(template.id);
    expect(cloned.usageCount).toBe(0);
    expect(cloned.lastUsedAt).toBeNull();
  });

  it('应兼容后端返回的日期字符串时间戳字段', () => {
    const template = new TaskTemplate({
      name: '云端模板',
      taskPayload: {
        title: '阅读20分钟'
      },
      lastUsedAt: '2026-04-08T12:00:00.000Z',
      createdAt: '2026-04-01T10:00:00.000Z',
      updatedAt: '2026-04-09T08:30:00.000Z'
    });

    expect(Number.isFinite(template.lastUsedAt)).toBe(true);
    expect(Number.isFinite(template.createdAt)).toBe(true);
    expect(Number.isFinite(template.updatedAt)).toBe(true);
    expect(template.updatedAt).toBeGreaterThan(template.createdAt);
  });
});
