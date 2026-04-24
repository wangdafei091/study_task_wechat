jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../services/service-manager.js', () => ({
  waitForInitialization: jest.fn().mockResolvedValue(true),
  getService: jest.fn()
}));

jest.mock('../../packageChart/services/analysis-board-service.js', () => ({
  buildMonthlyBoard: jest.fn()
}));

jest.mock('../../utils/dateUtils', () => ({
  getTodayString: jest.fn(() => '2026-04-14')
}));

describe('packageChart/pages/analysis/analysis', () => {
  let pageConfig;
  let serviceManager;
  let analysisBoardService;
  let appMock;
  let pageModule;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../packageChart/pages/analysis/analysis.js');
    });
  }

  function createPageInstance() {
    return {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
    };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    serviceManager = require('../../services/service-manager.js');
    analysisBoardService = require('../../packageChart/services/analysis-board-service.js');

    appMock = {
      globalData: {
        userService: {
          getLoginUser: jest.fn(() => ({ userId: 'parent-1', role: 'parent' })),
          getCurrentUser: jest.fn(() => ({ userId: 'child-2', role: 'child' })),
          getAllUsers: jest.fn(() => ([
            { userId: 'parent-1', role: 'parent', name: '家长' },
            { userId: 'child-1', role: 'child', name: '小明', status: 'active' },
            { userId: 'child-2', role: 'child', name: '小红', status: 'active' }
          ]))
        }
      }
    };

    global.getApp = jest.fn(() => appMock);
    global.wx = {
      navigateTo: jest.fn(),
      navigateBack: jest.fn(),
      switchTab: jest.fn()
    };
    global.getCurrentPages = jest.fn(() => ([{ route: 'pages/index/index' }, { route: 'packageChart/pages/analysis/analysis' }]));

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'task') {
        return { getTasksByDateRange: jest.fn() };
      }
      return null;
    });

    analysisBoardService.buildMonthlyBoard.mockResolvedValue({
      monthKey: '2026-04',
      monthTitle: '2026年4月',
      columns: [{
        key: '2026-04-01',
        day: 1,
        weekdayLabel: '二',
        hasPlannedTasks: true,
        isFutureEmpty: false
      }],
      rows: [{
        rowKey: 'child-2|study|数学',
        title: '数学',
        type: 'study',
        executionMode: 'planned',
        taskId: 'task-1',
        cells: [{
          date: '2026-04-01',
          state: 'done',
          cellClass: 'cell-done',
          symbol: '✓',
          isToday: false,
          isWeekend: false,
          isFutureEmpty: false,
          taskIds: ['task-1']
        }]
      }],
      rowHeightRpx: 56,
      summary: {
        displayedRowCount: 1,
        completedCount: 1,
        missedCount: 0,
        upcomingCount: 0
      }
    });

    loadPageModule();
    pageModule = require('../../packageChart/pages/analysis/analysis.js');
  });

  afterEach(() => {
    delete global.Page;
    delete global.getApp;
    delete global.wx;
    delete global.getCurrentPages;
  });

  it('onLoad 应按当前孩子视角初始化并加载看板', async () => {
    const page = createPageInstance();

    await page.onLoad();

    expect(serviceManager.waitForInitialization).toHaveBeenCalled();
    expect(page.data.focusUserId).toBe('child-2');
    expect(page.data.showChildSwitcher).toBe(true);
    expect(page.data.pageState).toBe('ready');
    expect(page.data.summaryItems[0]).toEqual(expect.objectContaining({
      label: '行',
      value: '1'
    }));
    expect(analysisBoardService.buildMonthlyBoard).toHaveBeenCalledWith(expect.objectContaining({
      monthKey: page.data.monthKey,
      focusUserId: 'child-2'
    }));
  });

  it('家长当前不在孩子视角时应默认选第一个孩子', async () => {
    appMock.globalData.userService.getCurrentUser.mockReturnValueOnce({ userId: 'parent-1', role: 'parent' });
    const page = createPageInstance();

    await page.onLoad();

    expect(page.data.focusUserId).toBe('child-1');
  });

  it('切换孩子应重新加载看板', async () => {
    const page = createPageInstance();
    await page.onLoad();
    analysisBoardService.buildMonthlyBoard.mockClear();

    await page.onChildTap({
      currentTarget: {
        dataset: {
          userId: 'child-1'
        }
      }
    });

    expect(page.data.focusUserId).toBe('child-1');
    expect(analysisBoardService.buildMonthlyBoard).toHaveBeenCalledWith(expect.objectContaining({
      monthKey: '2026-04',
      focusUserId: 'child-1'
    }));
  });

  it('切换月份应使用新的 monthKey 重新加载', async () => {
    const page = createPageInstance();
    await page.onLoad();
    analysisBoardService.buildMonthlyBoard.mockClear();

    await page.onPrevMonthTap();

    expect(analysisBoardService.buildMonthlyBoard).toHaveBeenCalledWith(expect.objectContaining({
      monthKey: '2026-03',
      focusUserId: 'child-2'
    }));
  });

  it('没有孩子可展示时应进入 empty 状态', async () => {
    appMock.globalData.userService.getAllUsers.mockReturnValue([
      { userId: 'parent-1', role: 'parent', name: '家长' }
    ]);
    appMock.globalData.userService.getCurrentUser.mockReturnValue({ userId: 'parent-1', role: 'parent' });

    const page = createPageInstance();
    await page.onLoad();

    expect(page.data.pageState).toBe('empty');
    expect(page.data.emptyTitle).toContain('没有可展示');
    expect(analysisBoardService.buildMonthlyBoard).not.toHaveBeenCalled();
  });

  it('点击任务行应切换单选高亮', async () => {
    const page = createPageInstance();
    await page.onLoad();

    page.onRowTap({
      currentTarget: {
        dataset: {
          rowKey: 'child-2|study|数学'
        }
      }
    });

    expect(page.data.selectedRowKey).toBe('child-2|study|数学');

    page.onRowTap({
      currentTarget: {
        dataset: {
          rowKey: 'child-1|habit|跑步'
        }
      }
    });

    expect(page.data.selectedRowKey).toBe('child-1|habit|跑步');
  });

  it('再次点击当前任务行应取消高亮', async () => {
    const page = createPageInstance();
    await page.onLoad();

    page.onRowTap({
      currentTarget: {
        dataset: {
          rowKey: 'child-2|study|数学'
        }
      }
    });
    page.onRowTap({
      currentTarget: {
        dataset: {
          rowKey: 'child-2|study|数学'
        }
      }
    });

    expect(page.data.selectedRowKey).toBe('');
  });

  it('点击空白区应清空当前高亮行', async () => {
    const page = createPageInstance();
    await page.onLoad();

    page.onRowTap({
      currentTarget: {
        dataset: {
          rowKey: 'child-2|study|数学'
        }
      }
    });
    page.onShellTap();

    expect(page.data.selectedRowKey).toBe('');
  });

  it('点击表现项单元格应跳到记录页，未来日期不跳转', async () => {
    const page = createPageInstance();
    await page.onLoad();

    page.onCellTap({
      currentTarget: {
        dataset: {
          executionMode: 'occurrence',
          taskId: 'occ_cfg_1',
          date: '2026-04-10'
        }
      }
    });

    expect(global.wx.navigateTo).toHaveBeenCalledWith({
      url: '/packageChart/pages/task-record/task-record?taskId=occ_cfg_1&date=2026-04-10&targetUserId=child-2'
    });

    global.wx.navigateTo.mockClear();
    page.onCellTap({
      currentTarget: {
        dataset: {
          executionMode: 'occurrence',
          taskId: 'occ_cfg_1',
          date: '2026-04-20'
        }
      }
    });

    expect(global.wx.navigateTo).not.toHaveBeenCalled();
  });

  it('返回按钮优先回上一页', () => {
    const page = createPageInstance();

    page.onBackTap();

    expect(global.wx.navigateBack).toHaveBeenCalledWith({ delta: 1 });
    expect(global.wx.switchTab).not.toHaveBeenCalled();
  });

  it('无页面栈时返回按钮应回首页', () => {
    global.getCurrentPages.mockReturnValueOnce([{ route: 'packageChart/pages/analysis/analysis' }]);
    const page = createPageInstance();

    page.onBackTap();

    expect(global.wx.navigateBack).not.toHaveBeenCalled();
    expect(global.wx.switchTab).toHaveBeenCalledWith({
      url: '/pages/index/index'
    });
  });

  it('中间省略应保留标题前后缀辨识信息', () => {
    const { truncateMiddleText } = pageModule.__testables;

    expect(truncateMiddleText('收拾房子(床，桌面，拖地)', {
      maxLength: 10,
      headLength: 6,
      tailLength: 3
    })).toBe('收拾房子(床…拖地)');
  });
});
