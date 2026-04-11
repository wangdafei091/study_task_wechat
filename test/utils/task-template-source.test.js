const {
  buildTemplateDraftFromTask,
  deriveTemplateCoverageKey,
  groupTasksToTemplateCandidates,
  isCandidateCoveredByTemplate,
  normalizeTemplateSourceCoverageSignature,
  isMultiDayOneOffTask
} = require('../../utils/task-template-source');

describe('utils/task-template-source', () => {
  it('一次性多天任务应被识别并排除出推荐候选', () => {
    const task = {
      id: 'task_1',
      title: '春游',
      type: 'interest',
      date: '2026-04-01',
      startDate: '2026-04-01',
      endDate: '2026-04-03',
      startTime: '09:00',
      endTime: '10:00',
      hasNoEndDate: false,
      repeat: {
        type: 'none',
        days: [],
        startDate: '2026-04-01',
        endDate: '2026-04-03'
      },
      reminder: {
        enabled: false,
        time: 0
      }
    };

    expect(isMultiDayOneOffTask(task)).toBe(true);
    expect(groupTasksToTemplateCandidates([task], [], {
      today: '2026-04-09'
    })).toEqual([]);
  });

  it('已跨多个自然周的重复任务应进入候选，并保留持续天数语义', () => {
    const task = {
      id: 'task_1',
      title: '晚间阅读',
      type: 'study',
      date: '2026-04-01',
      startDate: '2026-04-01',
      endDate: '2026-04-12',
      startTime: '19:00',
      endTime: '19:30',
      hasNoEndDate: false,
      repeat: {
        type: 'custom',
        days: [1, 3, 5],
        startDate: '2026-04-01',
        endDate: '2026-04-12'
      },
      reminder: {
        enabled: true,
        time: 15
      }
    };

    const candidates = groupTasksToTemplateCandidates([task], [], {
      today: '2026-04-12'
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual(expect.objectContaining({
      reasonCode: 'stable-repeat',
      reasonText: '近2周都出现了相同的重复安排',
      repeatSpanKey: 'duration:12'
    }));
  });

  it('每周分别创建的自然周重复任务应按连续周数进入候选', () => {
    const tasks = [
      {
        id: 'task_1',
        title: '每周阅读',
        type: 'study',
        date: '2026-04-06',
        startDate: '2026-04-06',
        endDate: '2026-04-12',
        startTime: '19:00',
        endTime: '19:30',
        hasNoEndDate: false,
        repeat: {
          type: 'custom',
          days: [1, 3, 5],
          startDate: '2026-04-06',
          endDate: '2026-04-12'
        },
        reminder: {
          enabled: true,
          time: 15
        }
      },
      {
        id: 'task_2',
        title: '每周阅读',
        type: 'study',
        date: '2026-04-13',
        startDate: '2026-04-13',
        endDate: '2026-04-19',
        startTime: '19:00',
        endTime: '19:30',
        hasNoEndDate: false,
        repeat: {
          type: 'custom',
          days: [1, 3, 5],
          startDate: '2026-04-13',
          endDate: '2026-04-19'
        },
        reminder: {
          enabled: true,
          time: 15
        }
      }
    ];

    const candidates = groupTasksToTemplateCandidates(tasks, [], {
      today: '2026-04-19'
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual(expect.objectContaining({
      reasonCode: 'stable-repeat',
      reasonText: '近2周都出现了相同的重复安排',
      repeatSpanKey: 'week-window',
      stableWeeks: 2
    }));
  });

  it('重复任务只在非连续自然周出现时不应误判为稳定候选', () => {
    const tasks = [
      {
        id: 'task_1',
        title: '每周阅读',
        type: 'study',
        date: '2026-03-30',
        startDate: '2026-03-30',
        endDate: '2026-04-05',
        startTime: '19:00',
        endTime: '19:30',
        hasNoEndDate: false,
        repeat: {
          type: 'custom',
          days: [1, 3, 5],
          startDate: '2026-03-30',
          endDate: '2026-04-05'
        },
        reminder: {
          enabled: true,
          time: 15
        }
      },
      {
        id: 'task_2',
        title: '每周阅读',
        type: 'study',
        date: '2026-04-13',
        startDate: '2026-04-13',
        endDate: '2026-04-19',
        startTime: '19:00',
        endTime: '19:30',
        hasNoEndDate: false,
        repeat: {
          type: 'custom',
          days: [1, 3, 5],
          startDate: '2026-04-13',
          endDate: '2026-04-19'
        },
        reminder: {
          enabled: true,
          time: 15
        }
      }
    ];

    expect(groupTasksToTemplateCandidates(tasks, [], {
      today: '2026-04-19'
    })).toEqual([]);
  });

  it('仅持续不到两周的日重复任务不应进入候选', () => {
    const task = {
      id: 'task_1',
      title: '晨读',
      type: 'study',
      date: '2026-04-01',
      startDate: '2026-04-01',
      endDate: '2026-04-07',
      startTime: '07:00',
      endTime: '07:30',
      hasNoEndDate: false,
      repeat: {
        type: 'daily',
        days: [],
        startDate: '2026-04-01',
        endDate: '2026-04-07'
      },
      reminder: {
        enabled: false,
        time: 0
      }
    };

    expect(groupTasksToTemplateCandidates([task], [], {
      today: '2026-04-12'
    })).toEqual([]);
  });

  it('monthly 重复任务不应进入候选', () => {
    const task = {
      id: 'task_1',
      title: '月度复盘',
      type: 'study',
      date: '2026-04-01',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      startTime: '19:00',
      endTime: '19:30',
      hasNoEndDate: false,
      repeat: {
        type: 'monthly',
        days: [],
        startDate: '2026-04-01',
        endDate: '2026-04-30'
      },
      reminder: {
        enabled: false,
        time: 0
      }
    };

    expect(groupTasksToTemplateCandidates([task], [], {
      today: '2026-04-12'
    })).toEqual([]);
  });

  it('候选与模板覆盖判断应使用同一结束语义层', () => {
    const task = {
      id: 'task_1',
      title: '晨跑',
      type: 'habit',
      date: '2026-04-01',
      startDate: '2026-04-01',
      endDate: '2026-04-05',
      startTime: '07:00',
      endTime: '07:30',
      hasNoEndDate: false,
      repeat: {
        type: 'daily',
        days: [],
        startDate: '2026-04-01',
        endDate: '2026-04-05'
      },
      reminder: {
        enabled: false,
        time: 0
      }
    };
    const draft = buildTemplateDraftFromTask(task);
    const candidate = {
      signature: draft.signature,
      repeatSpanKey: draft.repeatSpanKey,
      taskPayload: draft.draftInput.taskPayload,
      dateStrategy: draft.draftInput.dateStrategy
    };
    const template = {
      taskPayload: draft.draftInput.taskPayload,
      dateStrategy: draft.draftInput.dateStrategy
    };

    expect(deriveTemplateCoverageKey(template)).toBe('week-window');
    expect(isCandidateCoveredByTemplate(candidate, [template])).toBe(true);
  });

  it('已有同任务节奏模板时应抑制仅次要字段不同的候选', () => {
    const task = {
      id: 'task_1',
      title: '晚间阅读',
      type: 'study',
      date: '2026-04-07',
      startDate: '2026-04-07',
      endDate: '2026-04-13',
      startTime: '19:00',
      endTime: '19:30',
      hasNoEndDate: false,
      points: 2,
      pointsExpiry: 'week',
      isRequired: false,
      repeat: {
        type: 'custom',
        days: [1, 3, 5],
        startDate: '2026-04-07',
        endDate: '2026-04-13'
      },
      reminder: {
        enabled: false,
        time: 0
      }
    };
    const candidate = {
      signature: 'candidate-exact-signature',
      coverageSignature: normalizeTemplateSourceCoverageSignature(task, {
        repeatSpanKey: 'week-window'
      }),
      repeatSpanKey: 'week-window',
      taskPayload: {
        title: '晚间阅读',
        type: 'study',
        points: 2,
        pointsExpiry: 'week',
        isAllDay: false,
        startDate: '2026-04-07',
        endDate: '2026-04-13',
        startTime: '19:00',
        endTime: '19:30',
        hasNoEndDate: false,
        repeat: {
          type: 'custom',
          days: [1, 3, 5],
          startDate: '2026-04-07',
          endDate: '2026-04-13'
        },
        reminder: {
          enabled: false,
          time: 0
        }
      },
      dateStrategy: {
        mode: 'inherit-repeat-rule',
        autoShiftExpiredEndDate: true,
        endMode: 'week-end',
        durationDays: null
      }
    };
    const existingTemplate = {
      name: '晚间阅读模板',
      taskPayload: {
        title: '晚间阅读',
        type: 'study',
        points: 5,
        pointsExpiry: 'quarter',
        isRequired: true,
        isAllDay: false,
        startDate: '2026-04-14',
        endDate: '2026-04-20',
        startTime: '19:00',
        endTime: '19:30',
        hasNoEndDate: false,
        repeat: {
          type: 'custom',
          days: [1, 3, 5],
          startDate: '2026-04-14',
          endDate: '2026-04-20'
        },
        reminder: {
          enabled: true,
          time: 15
        }
      },
      dateStrategy: {
        mode: 'inherit-repeat-rule',
        autoShiftExpiredEndDate: true,
        endMode: 'week-end',
        durationDays: null
      }
    };

    expect(isCandidateCoveredByTemplate(candidate, [existingTemplate])).toBe(true);
  });
});
