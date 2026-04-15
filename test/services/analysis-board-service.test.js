jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../utils/dateUtils', () => {
  const actual = jest.requireActual('../../utils/dateUtils');
  return {
    ...actual,
    getTodayString: jest.fn(() => '2026-04-14')
  };
});

const { buildMonthlyBoard, __testables } = require('../../packageChart/services/analysis-board-service.js');

describe('packageChart/services/analysis-board-service', () => {
  it('应按同标题同类型聚类并生成单元格状态', async () => {
    const taskService = {
      getTasksByDateRange: jest.fn().mockResolvedValue([
        { id: 't1', userId: 'child-1', title: '数学', type: 'study', date: '2026-04-01', status: 1 },
        { id: 't2', userId: 'child-1', title: '数学', type: 'study', date: '2026-04-08', status: 0 },
        { id: 't3', userId: 'child-1', title: '跑步', type: 'habit', date: '2026-04-20', status: 0 }
      ])
    };

    const board = await buildMonthlyBoard({
      taskService,
      monthKey: '2026-04',
      focusUserId: 'child-1'
    });

    expect(taskService.getTasksByDateRange).toHaveBeenCalledWith(
      '2026-04-01',
      '2026-04-30',
      'child-1',
      { requireFreshStars: true }
    );
    expect(board.rows).toHaveLength(2);
    expect(board.rows[0].title).toBe('数学');
    expect(board.rows[0].cells[0]).toEqual(expect.objectContaining({
      state: 'done',
      symbol: '✓'
    }));
    expect(board.rows[0].cells[7]).toEqual(expect.objectContaining({
      state: 'missed',
      symbol: '✕'
    }));
    expect(board.rows[1].cells[19]).toEqual(expect.objectContaining({
      state: 'upcoming',
      symbol: '○'
    }));
    expect(board.summary).toEqual(expect.objectContaining({
      displayedRowCount: 2,
      completedCount: 1,
      missedCount: 1,
      upcomingCount: 1
    }));
    expect(board.columns[0]).toEqual(expect.objectContaining({
      hasPlannedTasks: true,
      isFutureEmpty: false
    }));
    expect(board.columns[14]).toEqual(expect.objectContaining({
      hasPlannedTasks: false,
      isFutureEmpty: true
    }));
  });

  it('超出最大展示行数时应合并为其他任务', async () => {
    const tasks = Array.from({ length: 14 }).map((_, index) => ({
      id: `task-${index + 1}`,
      userId: 'child-1',
      title: `任务${index + 1}`,
      type: index % 2 === 0 ? 'study' : 'habit',
      date: `2026-04-${String(index + 1).padStart(2, '0')}`,
      status: 0
    }));
    const taskService = {
      getTasksByDateRange: jest.fn().mockResolvedValue(tasks)
    };

    const board = await buildMonthlyBoard({
      taskService,
      monthKey: '2026-04',
      focusUserId: 'child-1'
    });

    expect(board.rows).toHaveLength(__testables.MAX_DISPLAY_ROWS);
    expect(board.rows[board.rows.length - 1].title).toBe('其他任务');
  });

  it('未传 focusUserId 时应返回空看板 contract', async () => {
    const taskService = {
      getTasksByDateRange: jest.fn()
    };

    const board = await buildMonthlyBoard({
      taskService,
      monthKey: '2026-04',
      focusUserId: ''
    });

    expect(taskService.getTasksByDateRange).not.toHaveBeenCalled();
    expect(board.rows).toEqual([]);
    expect(board.summary.displayedRowCount).toBe(0);
    expect(board.columns).toHaveLength(30);
  });

  it('应为未来纯空列生成弱化所需元数据', async () => {
    const taskService = {
      getTasksByDateRange: jest.fn().mockResolvedValue([
        { id: 't1', userId: 'child-1', title: '数学', type: 'study', date: '2026-04-14', status: 1 },
        { id: 't2', userId: 'child-1', title: '数学', type: 'study', date: '2026-04-20', status: 0 }
      ])
    };

    const board = await buildMonthlyBoard({
      taskService,
      monthKey: '2026-04',
      focusUserId: 'child-1'
    });

    expect(board.columns[13]).toEqual(expect.objectContaining({
      day: 14,
      hasPlannedTasks: true,
      isFutureEmpty: false
    }));
    expect(board.columns[14]).toEqual(expect.objectContaining({
      day: 15,
      hasPlannedTasks: false,
      isFutureEmpty: true
    }));
    expect(board.columns[19]).toEqual(expect.objectContaining({
      day: 20,
      hasPlannedTasks: true,
      isFutureEmpty: false
    }));
  });

  it('今天未完成的任务应显示为未开始态而不是失败态', async () => {
    const taskService = {
      getTasksByDateRange: jest.fn().mockResolvedValue([
        { id: 't1', userId: 'child-1', title: '数学', type: 'study', date: '2026-04-14', status: 0 }
      ])
    };

    const board = await buildMonthlyBoard({
      taskService,
      monthKey: '2026-04',
      focusUserId: 'child-1'
    });

    expect(board.rows[0].cells[13]).toEqual(expect.objectContaining({
      state: 'upcoming',
      symbol: '○',
      isToday: true
    }));
    expect(board.summary).toEqual(expect.objectContaining({
      completedCount: 0,
      missedCount: 0,
      upcomingCount: 1
    }));
  });
});
