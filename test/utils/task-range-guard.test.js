const taskRangeGuard = require('../../utils/task-range-guard');

describe('task-range-guard', () => {
  it('重复任务恰好 93 天应通过，93 天加 1 应拒绝', () => {
    expect(taskRangeGuard.validateTaskRangeLimits({
      repeat: {
        type: 'daily',
        startDate: '2026-04-01',
        endDate: '2026-07-02'
      },
      hasNoEndDate: false
    })).toEqual({ valid: true });

    expect(taskRangeGuard.validateTaskRangeLimits({
      repeat: {
        type: 'daily',
        startDate: '2026-04-01',
        endDate: '2026-07-03'
      },
      hasNoEndDate: false
    })).toEqual(expect.objectContaining({
      valid: false,
      code: 'TASK_REPEAT_RANGE_TOO_LARGE'
    }));
  });

  it('应拦截超过 93 天的重复任务跨度', () => {
    const result = taskRangeGuard.validateTaskRangeLimits({
      repeat: {
        type: 'daily',
        startDate: '2026-04-01',
        endDate: '2026-07-05'
      },
      hasNoEndDate: false
    });

    expect(result).toEqual(expect.objectContaining({
      valid: false,
      code: 'TASK_REPEAT_RANGE_TOO_LARGE'
    }));
  });

  it('no-end 长期任务应跳过范围校验', () => {
    expect(taskRangeGuard.validateTaskRangeLimits({
      repeat: {
        type: 'daily',
        startDate: '2026-04-01'
      },
      hasNoEndDate: true
    })).toEqual({ valid: true });

    expect(taskRangeGuard.validateTaskRangeLimits({
      executionMode: 'occurrence',
      activeRange: {
        startDate: '2026-04-01',
        hasNoEndDate: true
      }
    })).toEqual({ valid: true });
  });

  it('应拦截超过 180 天的表现项 activeRange', () => {
    const result = taskRangeGuard.validateTaskRangeLimits({
      executionMode: 'occurrence',
      activeRange: {
        startDate: '2026-01-01',
        endDate: '2026-07-01',
        hasNoEndDate: false
      }
    });

    expect(result).toEqual(expect.objectContaining({
      valid: false,
      code: 'TASK_ACTIVE_RANGE_TOO_LARGE'
    }));
  });

  it('应允许历史超长表现项在不扩张跨度时继续保存', () => {
    const previousTask = {
      executionMode: 'occurrence',
      activeRange: {
        startDate: '2026-01-01',
        endDate: '2026-08-01',
        hasNoEndDate: false
      }
    };

    const result = taskRangeGuard.validateTaskRangeLimits(previousTask, {
      previousTask
    });

    expect(result.valid).toBe(true);
  });

  it('历史超长表现项继续扩张时应拒绝', () => {
    const previousTask = {
      executionMode: 'occurrence',
      activeRange: {
        startDate: '2026-01-01',
        endDate: '2026-08-01',
        hasNoEndDate: false
      }
    };

    const result = taskRangeGuard.validateTaskRangeLimits({
      executionMode: 'occurrence',
      activeRange: {
        startDate: '2026-01-01',
        endDate: '2026-08-15',
        hasNoEndDate: false
      }
    }, {
      previousTask
    });

    expect(result).toEqual(expect.objectContaining({
      valid: false,
      code: 'TASK_ACTIVE_RANGE_TOO_LARGE'
    }));
  });

  it('模板 duration 超过 93 天应拒绝', () => {
    const result = taskRangeGuard.validateTemplateRangeLimits({
      taskPayload: {
        hasNoEndDate: false,
        repeat: {
          type: 'weekly',
          startDate: '2026-04-01'
        }
      },
      dateStrategy: {
        endMode: 'duration',
        durationDays: 94
      }
    });

    expect(result).toEqual(expect.objectContaining({
      valid: false,
      code: 'TASK_TEMPLATE_RANGE_TOO_LARGE'
    }));
  });

  it('应拦截历史超长模板继续扩张范围', () => {
    const result = taskRangeGuard.validateTemplateRangeLimits({
      taskPayload: {
        hasNoEndDate: false,
        repeat: {
          type: 'weekly',
          startDate: '2026-04-01',
          endDate: '2026-07-15'
        }
      }
    }, {
      previousTemplate: {
        taskPayload: {
          hasNoEndDate: false,
          repeat: {
            type: 'weekly',
            startDate: '2026-04-01',
            endDate: '2026-07-10'
          }
        }
      }
    });

    expect(result).toEqual(expect.objectContaining({
      valid: false,
      code: 'TASK_TEMPLATE_RANGE_TOO_LARGE'
    }));
  });
});
