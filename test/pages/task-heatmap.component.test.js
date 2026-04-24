const fs = require('fs');
const path = require('path');

const mockGetService = jest.fn();
const mockGetUserService = jest.fn();

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../utils/uiUtils', () => ({
  getPressureLevelText: (pressure) => {
    if (pressure <= 15) {
      return { levelText: '轻松', levelNum: 1, isHigh: false };
    }
    if (pressure <= 30) {
      return { levelText: '适中', levelNum: 2, isHigh: false };
    }
    if (pressure <= 45) {
      return { levelText: '繁忙', levelNum: 3, isHigh: true };
    }
    return { levelText: '紧张', levelNum: 4, isHigh: true };
  }
}));

jest.mock('../../services/service-manager.js', () => ({
  getService: (...args) => mockGetService(...args),
  getUserService: (...args) => mockGetUserService(...args)
}));

describe('packageComponents/components/task-heatmap/task-heatmap', () => {
  let componentConfig;
  const heatmapWxmlPath = path.join(__dirname, '../../packageComponents/components/task-heatmap/task-heatmap.wxml');

  function loadComponentModule() {
    componentConfig = null;
    global.Component = jest.fn((config) => {
      componentConfig = config;
    });

    jest.isolateModules(() => {
      require('../../packageComponents/components/task-heatmap/task-heatmap.js');
    });
  }

  function createComponentInstance(propertyOverrides = {}) {
    const instance = {
      data: {
        ...(componentConfig.data || {}),
        todayString: '2026-04-04'
      },
      properties: {
        tasks: [],
        scene: 'task-edit',
        currentMonth: 3,
        currentYear: 2026,
        targetUserId: '',
        ...propertyOverrides
      },
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      }),
      triggerEvent: jest.fn(),
      _showLoading: jest.fn(),
      _hideLoading: jest.fn(),
      closeDayTasks: jest.fn(),
      ensureEditAreaVisible: jest.fn(),
      refreshTaskList: jest.fn()
    };

    Object.entries(componentConfig.methods || {}).forEach(([name, fn]) => {
      instance[name] = fn;
    });

    return instance;
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    global.wx = {
      showLoading: jest.fn(),
      hideLoading: jest.fn(),
      showToast: jest.fn(),
      showModal: jest.fn()
    };

    loadComponentModule();
  });

  afterEach(() => {
    delete global.Component;
    delete global.wx;
  });

  it('删除循环任务时应使用 targetUserId 查询孩子任务全集', async () => {
    const taskService = {
      getAllTasks: jest.fn().mockResolvedValue([])
    };
    const messageService = {
      createTaskMessage: jest.fn()
    };

    mockGetService.mockImplementation((name) => {
      if (name === 'TaskService') return taskService;
      if (name === 'MessageService') return messageService;
      return null;
    });

    const component = createComponentInstance({
      targetUserId: 'child_1'
    });

    await component.deleteTaskSeries({
      id: 'task_parent',
      title: '背单词',
      date: '2026-04-04',
      parentTaskId: '',
      repeat: {
        type: 'daily'
      }
    });

    expect(taskService.getAllTasks).toHaveBeenCalledWith('child_1', {
      requireFreshStars: true
    });
  });

  it('未传 targetUserId 时应回退到当前用户查询任务全集', async () => {
    const taskService = {
      getAllTasks: jest.fn().mockResolvedValue([])
    };
    const messageService = {
      createTaskMessage: jest.fn()
    };

    mockGetService.mockImplementation((name) => {
      if (name === 'TaskService') return taskService;
      if (name === 'MessageService') return messageService;
      return null;
    });
    mockGetUserService.mockReturnValue({
      getCurrentUserId: jest.fn(() => 'child_current')
    });

    const component = createComponentInstance();

    await component.updateTaskSeries({
      id: 'task_parent',
      title: '背单词',
      date: '2026-04-04',
      parentTaskId: '',
      repeat: {
        type: 'daily'
      }
    }, {
      description: '新描述',
      modifyTime: 1775298252144
    });

    expect(taskService.getAllTasks).toHaveBeenCalledWith('child_current', {
      requireFreshStars: true
    });
  });

  it('应为 1 到 3 个任务生成对应数量的轻量标记', () => {
    const component = createComponentInstance();

    expect(component.generateTaskDots({
      study: 1,
      habit: 1,
      interest: 0
    })).toEqual({
      dots: [
        { type: 'study', color: '#71A971' },
        { type: 'habit', color: '#7E8FA8' }
      ],
      taskCount: 2,
      taskCountLabel: '',
      markerMode: 'dots',
      hasOverflow: false
    });
  });

  it('应在 3 个及以上任务时切换为轻量数字提示', () => {
    const component = createComponentInstance();

    expect(component.generateTaskDots({
      study: 2,
      habit: 1,
      interest: 1
    })).toEqual({
      dots: [],
      taskCount: 4,
      taskCountLabel: '4',
      markerMode: 'count',
      hasOverflow: true
    });
  });

  it('应根据单格状态生成交互视觉辅助信息', () => {
    const component = createComponentInstance();

    expect(component.buildDayCellVisualState({
      isCurrentMonth: false,
      count: 0
    }, {
      dots: [],
      hasOverflow: false
    })).toEqual({
      isInteractive: false,
      hasTasks: false,
      markerCount: 0,
      hasOverflowMarker: false
    });

    expect(component.buildDayCellVisualState({
      isCurrentMonth: false,
      count: 4
    }, {
      dots: [],
      markerMode: 'count',
      hasOverflow: true
    })).toEqual({
      isInteractive: true,
      hasTasks: true,
      markerCount: 0,
      hasOverflowMarker: true
    });
  });

  it('应将数量和摘要收口到详情头部状态', () => {
    const component = createComponentInstance();

    expect(component.buildSelectedDaySummaryState([
      { isRequired: true, points: 2 },
      { isRequired: false, points: 3 }
    ], {
      pressure: {
        total: 18
      }
    })).toEqual({
      taskCountText: '2个任务',
      taskSummaryText: '必做1项 · 选做1项，风险2🌟，可得3🌟',
      selectedDayPressure: {
        total: '18.0',
        levelText: '适中',
        levelNum: 2,
        isHigh: false,
        showWarning: false,
        showTag: true
      }
    });
  });

  it('热力图模板不应再保留长按提示和格子内任务数字', () => {
    const wxml = fs.readFileSync(heatmapWxmlPath, 'utf8');

    expect(wxml).not.toContain('bindlongpress');
    expect(wxml).not.toContain('task-tooltip');
    expect(wxml).not.toContain('task-count-number');
    expect(wxml).toContain('task-count-text');
  });
});
