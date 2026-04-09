const {
  buildTemplateSearchText,
  normalizeDateStrategy,
  normalizeTaskPayload
} = require('../../utils/task-template-utils');

describe('backend task-template-utils', () => {
  it('normalizeTaskPayload 应在后端独立运行时完成基础归一化', () => {
    const payload = normalizeTaskPayload({
      title: ' 晚间阅读 ',
      type: 'unknown',
      points: '3.8',
      pointsExpiry: 'quarter',
      startDate: '2026-04-08',
      repeat: {
        type: 'monthly'
      },
      reminder: {
        enabled: true,
        time: '15'
      }
    });

    expect(payload).toEqual(expect.objectContaining({
      title: '晚间阅读',
      type: 'habit',
      points: 3,
      pointsExpiry: 'quarter',
      startDate: '2026-04-08',
      startTime: '09:00',
      endTime: '10:00'
    }));
    expect(payload.repeat.type).toBe('none');
    expect(payload.reminder).toEqual({
      enabled: true,
      time: 15
    });
  });

  it('normalizeDateStrategy 应根据重复规则给出默认模式', () => {
    expect(normalizeDateStrategy({}, {
      repeat: {
        type: 'none'
      }
    })).toEqual({
      mode: 'today',
      autoShiftExpiredEndDate: true,
      endMode: 'same-day',
      durationDays: 1
    });

    expect(normalizeDateStrategy({}, {
      repeat: {
        type: 'weekly'
      }
    })).toEqual({
      mode: 'inherit-repeat-rule',
      autoShiftExpiredEndDate: true,
      endMode: 'duration',
      durationDays: 1
    });

    expect(normalizeDateStrategy({
      durationDays: 14
    }, {
      startDate: '2026-04-08',
      endDate: '2026-04-21',
      hasNoEndDate: false,
      repeat: {
        type: 'weekly'
      }
    })).toEqual({
      mode: 'inherit-repeat-rule',
      autoShiftExpiredEndDate: true,
      endMode: 'duration',
      durationDays: 14
    });

    expect(normalizeDateStrategy({}, {
      hasNoEndDate: true,
      repeat: {
        type: 'daily'
      }
    })).toEqual({
      mode: 'inherit-repeat-rule',
      autoShiftExpiredEndDate: true,
      endMode: 'no-end',
      durationDays: null
    });
  });

  it('normalizeDateStrategy 应识别自然周和自然月结束模式', () => {
    expect(normalizeDateStrategy({
      endMode: 'week-end'
    }, {
      startDate: '2026-04-09',
      endDate: '2026-04-12',
      hasNoEndDate: false,
      repeat: {
        type: 'custom'
      }
    })).toEqual({
      mode: 'inherit-repeat-rule',
      autoShiftExpiredEndDate: true,
      endMode: 'week-end',
      durationDays: null
    });

    expect(normalizeDateStrategy({
      endMode: 'month-end'
    }, {
      startDate: '2026-04-28',
      endDate: '2026-04-30',
      hasNoEndDate: false,
      repeat: {
        type: 'daily'
      }
    })).toEqual({
      mode: 'inherit-repeat-rule',
      autoShiftExpiredEndDate: true,
      endMode: 'month-end',
      durationDays: null
    });
  });

  it('normalizeDateStrategy 应在未显式传 endMode 时根据结束日期推导自然周和自然月模式', () => {
    expect(normalizeDateStrategy({}, {
      startDate: '2026-04-09',
      endDate: '2026-04-12',
      hasNoEndDate: false,
      repeat: {
        type: 'custom',
        days: [1, 3, 5]
      }
    })).toEqual({
      mode: 'inherit-repeat-rule',
      autoShiftExpiredEndDate: true,
      endMode: 'week-end',
      durationDays: null
    });

    expect(normalizeDateStrategy({}, {
      startDate: '2026-04-28',
      endDate: '2026-04-30',
      hasNoEndDate: false,
      repeat: {
        type: 'daily'
      }
    })).toEqual({
      mode: 'inherit-repeat-rule',
      autoShiftExpiredEndDate: true,
      endMode: 'month-end',
      durationDays: null
    });
  });

  it('buildTemplateSearchText 应聚合名称、说明和任务内容用于搜索', () => {
    const text = buildTemplateSearchText({
      name: '晚间阅读',
      description: '固定任务',
      taskPayload: {
        title: '阅读20分钟',
        description: '睡前完成'
      }
    });

    expect(text).toContain('晚间阅读');
    expect(text).toContain('固定任务');
    expect(text).toContain('阅读20分钟');
    expect(text).toContain('睡前完成');
  });
});
