const taskFormDisplay = require('../../utils/task-form-display');

describe('utils/task-form-display', () => {
  it('buildTaskFormDisplayState 应生成带字段名的预览胶囊', () => {
    const state = taskFormDisplay.buildTaskFormDisplayState({
      startDate: '2026-04-09',
      endDate: '2026-04-09',
      hasNoEndDate: false,
      pointsExpiry: 'quarter',
      repeat: {
        type: 'none',
        days: []
      },
      reminder: {
        enabled: false,
        time: 0
      }
    });

    expect(state.previewChips).toEqual([
      { key: 'repeat', label: '重复', value: '不重复' },
      { key: 'reminder', label: '提醒', value: '无' },
      { key: 'pointsExpiry', label: '星星有效期', value: '本季度结束' }
    ]);
  });

  it('buildTaskFormDisplayState 在周四选择周一三五时应生成结果导向提示', () => {
    const state = taskFormDisplay.buildTaskFormDisplayState({
      startDate: '2026-04-09',
      endDate: '2026-04-15',
      hasNoEndDate: false,
      dateStrategy: {
        endMode: 'duration',
        durationDays: 7
      },
      pointsExpiry: 'permanent',
      repeat: {
        type: 'custom',
        days: [1, 3, 5]
      },
      reminder: {
        enabled: false,
        time: 0
      }
    });

    expect(state.resultPrimaryText).toBe('创建任务时，将从下一个周五开始执行');
    expect(state.resultSecondaryText).toBe('从实际开始日算，共持续 7 天');
    expect(state.repeatPreviewText).toBe('创建任务时，将从下一个周五开始执行 从实际开始日算，共持续 7 天');
    expect(state.repeatTypeWarning).toBe(true);
  });

  it('buildTaskFormDisplayState 在工作日模板的周末参考日应给出下一个工作日提示', () => {
    const state = taskFormDisplay.buildTaskFormDisplayState({
      startDate: '2026-04-11',
      endDate: '',
      hasNoEndDate: true,
      pointsExpiry: 'permanent',
      repeat: {
        type: 'workdays',
        days: []
      },
      reminder: {
        enabled: true,
        time: 15
      }
    });

    expect(state.resultPrimaryText).toBe('创建任务时，将从下一个工作日开始执行');
    expect(state.resultSecondaryText).toBe('默认长期有效');
    expect(state.repeatTypeWarning).toBe(true);
  });

  it('buildTaskFormDisplayState 在自然周结束模式下应给出周日结束提示', () => {
    const state = taskFormDisplay.buildTaskFormDisplayState({
      startDate: '2026-04-09',
      endDate: '2026-04-12',
      hasNoEndDate: false,
      dateStrategy: {
        endMode: 'week-end',
        durationDays: null
      },
      repeat: {
        type: 'custom',
        days: [1, 3, 5]
      },
      reminder: {
        enabled: false,
        time: 0
      }
    });

    expect(state.resultPrimaryText).toBe('创建任务时，将从下一个周五开始执行');
    expect(state.resultSecondaryText).toBe('结束日期为该周周日');
  });
});
