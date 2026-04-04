const mockGetService = jest.fn();
const mockGetUserService = jest.fn();

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../utils/uiUtils', () => ({}));

jest.mock('../../services/service-manager.js', () => ({
  getService: (...args) => mockGetService(...args),
  getUserService: (...args) => mockGetUserService(...args)
}));

describe('packageComponents/components/task-heatmap/task-heatmap', () => {
  let componentConfig;

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
});
