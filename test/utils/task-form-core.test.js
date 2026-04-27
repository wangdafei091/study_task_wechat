const taskFormCore = require('../../utils/task-form-core');

describe('utils/task-form-core', () => {
  it('createTaskFormDraft 应生成任务场景默认值', () => {
    const draft = taskFormCore.createTaskFormDraft('task', {
      today: '2026-04-11',
      now: new Date('2026-04-11T09:20:00')
    });

    expect(draft.startDate).toBe('2026-04-11');
    expect(draft.endDate).toBe('2026-04-11');
    expect(draft.repeatType).toBe('daily');
    expect(draft.startTime).toBe('09:00');
    expect(draft.endTime).toBe('10:00');
  });

  it('createTaskFormDraft 应生成模板场景默认值', () => {
    const draft = taskFormCore.createTaskFormDraft('template', {
      today: '2026-04-11',
      now: new Date('2026-04-11T21:20:00')
    });

    expect(draft.startDate).toBe('2026-04-11');
    expect(draft.endDate).toBe('2026-04-11');
    expect(draft.repeatType).toBe('none');
    expect(draft.startTime).toBe('09:00');
    expect(draft.endTime).toBe('10:00');
  });

  it('normalizeTaskFormDraft 应兼容嵌套 repeat/reminder 结构', () => {
    const draft = taskFormCore.normalizeTaskFormDraft({
      title: '晚间阅读',
      repeat: {
        type: 'custom',
        days: [5, 1, 3, 3]
      },
      reminder: {
        enabled: true,
        time: 15
      }
    }, {
      scene: 'task',
      today: '2026-04-11'
    });

    expect(draft.title).toBe('晚间阅读');
    expect(draft.repeatType).toBe('custom');
    expect(draft.repeatDays).toEqual([1, 3, 5]);
    expect(draft.reminderEnabled).toBe(true);
    expect(draft.reminderTime).toBe(15);
  });

  it('normalizeTaskFormDraft 应兼容 reminder 为 null', () => {
    const draft = taskFormCore.normalizeTaskFormDraft({
      title: '晚间阅读',
      reminder: null
    }, {
      scene: 'task',
      today: '2026-04-11'
    });

    expect(draft.reminderEnabled).toBe(false);
    expect(draft.reminderTime).toBe(0);
  });

  it('buildReminderOptionsFromDraft 应根据全天状态切换提醒选项', () => {
    expect(taskFormCore.buildReminderOptionsFromDraft({
      isAllDay: true
    })).toEqual([
      { label: '无', enabled: false, time: 0 },
      { label: '提前1天(晚上8点)', enabled: true, time: -1 }
    ]);

    expect(taskFormCore.buildReminderOptionsFromDraft({
      isAllDay: false,
      startTime: '09:00'
    })).toEqual(expect.arrayContaining([
      { label: '准时', enabled: true, time: 0 },
      { label: '提前30分钟', enabled: true, time: 30 }
    ]));
  });

  it('resolveDefaultTimeRange 应生成默认 1 小时时间段', () => {
    expect(taskFormCore.resolveDefaultTimeRange({
      now: new Date('2026-04-11T18:20:00')
    })).toEqual({
      startTime: '18:00',
      endTime: '19:00'
    });
  });

  it('resolveAdjustedEndTime 应在结束时间无效时自动顺延 1 小时', () => {
    expect(taskFormCore.resolveAdjustedEndTime('19:00', '18:30')).toEqual({
      endTime: '20:00',
      adjusted: true
    });

    expect(taskFormCore.resolveAdjustedEndTime('19:00', '19:30')).toEqual({
      endTime: '19:30',
      adjusted: false
    });
  });

  it('validateTaskFormDraft 应拦截时间范围错误', () => {
    const result = taskFormCore.validateTaskFormDraft({
      title: '测试任务',
      startDate: '2026-04-11',
      startTime: '19:00',
      endTime: '19:00',
      isAllDay: false,
      repeatType: 'none'
    }, {
      scene: 'task'
    });

    expect(result).toEqual({
      valid: false,
      errorMsg: '结束时间不能早于开始时间'
    });
  });

  it('validateTaskFormDraft 应保留原始缺失字段语义', () => {
    expect(taskFormCore.validateTaskFormDraft({
      title: '测试任务'
    }, {
      scene: 'task'
    })).toEqual({
      valid: false,
      errorMsg: '请选择开始日期'
    });

    expect(taskFormCore.validateTaskFormDraft({
      title: '测试任务',
      startDate: '2026-04-11',
      isAllDay: false,
      startTime: '',
      endTime: ''
    }, {
      scene: 'task'
    })).toEqual({
      valid: false,
      errorMsg: '请设置开始和结束时间'
    });
  });

  it('validateTaskFormDraft 应拦截模板持续天数错误', () => {
    const result = taskFormCore.validateTaskFormDraft({
      title: '晚间阅读',
      repeatType: 'daily',
      endMode: 'duration',
      durationDays: 0,
      startTime: '19:00',
      endTime: '19:30'
    }, {
      scene: 'template'
    });

    expect(result).toEqual({
      valid: false,
      errorMsg: '请输入有效的持续天数'
    });
  });

  it('buildTemplatePayloadFromDraft 应产出模板 payload 和 dateStrategy', () => {
    const result = taskFormCore.buildTemplatePayloadFromDraft({
      title: '晚间阅读',
      type: 'study',
      startTime: '19:00',
      endTime: '19:30',
      repeatType: 'custom',
      repeatDays: [1, 3, 5],
      endMode: 'duration',
      durationDays: 7
    }, {
      today: '2026-04-11'
    });

    expect(result.taskPayload).toEqual(expect.objectContaining({
      title: '晚间阅读',
      startDate: '2026-04-11',
      endDate: '2026-04-17',
      repeat: expect.objectContaining({
        type: 'custom',
        days: [1, 3, 5],
        endDate: '2026-04-17'
      })
    }));
    expect(result.dateStrategy).toEqual(expect.objectContaining({
      mode: 'inherit-repeat-rule',
      endMode: 'duration',
      durationDays: 7
    }));
  });

  it('resolveTaskScheduleFromDraft 应按首个匹配日解析自然周结束', () => {
    const result = taskFormCore.resolveTaskScheduleFromDraft({
      title: '晚间阅读',
      repeatType: 'custom',
      repeatDays: [1, 3, 5],
      dateStrategy: {
        mode: 'inherit-repeat-rule',
        endMode: 'week-end',
        durationDays: null
      }
    }, {
      today: '2026-04-09'
    });

    expect(result).toEqual({
      startDate: '2026-04-10',
      endDate: '2026-04-12',
      hasNoEndDate: false,
      repeatStartDate: '2026-04-10',
      repeatEndDate: '2026-04-12'
    });
  });
});
