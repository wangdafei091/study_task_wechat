jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../utils/view-scope', () => ({
  hasResolvedAnalysisOptions: jest.fn((options) => Boolean(options && (options.scope || options.userId)))
}));

describe('packageChart/components/star-calendar/star-calendar', () => {
  let componentConfig;

  function loadComponentModule() {
    componentConfig = null;
    global.Component = jest.fn((config) => {
      componentConfig = config;
    });

    jest.isolateModules(() => {
      require('../../packageChart/components/star-calendar/star-calendar.js');
    });
  }

  function createComponentInstance() {
    const instance = {
      data: {
        ...(componentConfig.data || {})
      },
      properties: {
        analysisOptions: {
          scope: 'family',
          childUserIds: ['child-1', 'child-2']
        },
        currentMonthKey: '',
        readModelVersion: 0
      },
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      }),
      triggerEvent: jest.fn()
    };

    Object.entries(componentConfig.methods || {}).forEach(([name, fn]) => {
      instance[name] = fn;
    });

    return instance;
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    global.getApp = jest.fn();
    loadComponentModule();
  });

  afterEach(() => {
    delete global.Component;
    delete global.getApp;
  });

  it('family 分析应只保留 childUserIds 对应的星星记录', () => {
    const component = createComponentInstance();

    const records = component._filterRecordsByAnalysisScope(
      [
        { userId: 'parent-1', id: 'r1' },
        { userId: 'child-1', id: 'r2' },
        { userId: 'child-2', id: 'r3' },
        { userId: 'child-3', id: 'r4' }
      ],
      component.properties.analysisOptions
    );

    expect(records).toEqual([
      { userId: 'child-1', id: 'r2' },
      { userId: 'child-2', id: 'r3' }
    ]);
  });

  it('family 分析应只保留 childUserIds 对应的任务缓存', () => {
    const component = createComponentInstance();

    const tasks = component._filterTasksByAnalysisScope(
      [
        { userId: 'parent-1', id: 't1' },
        { userId: 'child-1', id: 't2' },
        { userId: 'child-2', id: 't3' }
      ],
      component.properties.analysisOptions
    );

    expect(tasks).toEqual([
      { userId: 'child-1', id: 't2' },
      { userId: 'child-2', id: 't3' }
    ]);
  });

  it('readModelVersion 就绪后应优先消费 prepared month data', () => {
    global.getApp.mockReturnValue({
      getAnalyticsService: jest.fn(() => ({
        getPreparedMonthData: jest.fn(() => ({
          tasks: [{ userId: 'child-1', id: 't1', date: '2026-04-01' }],
          records: [{ userId: 'child-1', id: 'r1' }],
          refreshedAt: 123
        }))
      }))
    });

    const component = createComponentInstance();
    component.properties.currentMonthKey = '2026-04';
    component.properties.readModelVersion = 1;
    component.data.currentYear = 2026;
    component.data.currentMonth = 3;
    component.monthsToRefresh = new Set();
    component.updateCalendarWithStars = jest.fn();

    component.loadStarRecords();

    expect(component.updateCalendarWithStars).toHaveBeenCalledWith([{ userId: 'child-1', id: 'r1' }]);
    expect(component._monthTaskCache).toEqual({
      key: '2026-04',
      tasks: [{ userId: 'child-1', id: 't1', date: '2026-04-01' }]
    });
  });

  it('统一读模型模式在 readModelVersion 未就绪前不应主动触发 smartRefresh', () => {
    const component = createComponentInstance();
    component._attached = true;
    component.properties.currentMonthKey = '2026-04';
    component.properties.readModelVersion = 0;
    component.loadStarRecords = jest.fn();

    componentConfig.observers['analysisOptions, currentMonthKey, readModelVersion'].call(component);

    expect(component.loadStarRecords).not.toHaveBeenCalled();
  });

  it('统一读模型模式未命中 prepared snapshot 时应保持等待状态，不回退到组件自拉数', () => {
    global.getApp.mockReturnValue({
      getAnalyticsService: jest.fn(() => ({
        getPreparedMonthData: jest.fn(() => null)
      }))
    });

    const component = createComponentInstance();
    component.properties.currentMonthKey = '2026-04';
    component.properties.readModelVersion = 1;
    component.data.currentYear = 2026;
    component.data.currentMonth = 3;
    component.monthsToRefresh = new Set();
    component.updateCalendarWithStars = jest.fn();

    component.loadStarRecords();

    expect(component.updateCalendarWithStars).not.toHaveBeenCalled();
    expect(component.data.isLoading).toBe(true);
  });

  it('分析范围切换时应先清空旧月份展示并等待新的 prepared snapshot', () => {
    global.getApp.mockReturnValue({
      getAnalyticsService: jest.fn(() => ({
        getPreparedMonthData: jest.fn(() => null)
      }))
    });

    const component = createComponentInstance();
    component._attached = true;
    component.properties.currentMonthKey = '2026-04';
    component.properties.readModelVersion = 1;
    component.properties.analysisOptions = { userId: 'child-1' };
    component._preparedStateSignature = JSON.stringify({
      scope: 'family',
      userId: null,
      childUserIds: ['child-1', 'child-2'],
      monthKey: '2026-04'
    });
    component.data.currentYear = 2026;
    component.data.currentMonth = 3;
    component.data.hasStarRecords = true;
    component.data.monthCache = {
      '2026-04': {
        records: [{ id: 'stale-record' }],
        lastUpdate: 123
      }
    };
    component.data.calendarDays = [
      {
        dateString: '2026-04-01',
        day: 1,
        isCurrentMonth: true,
        starInfo: { earned: 3, deducted: 0 }
      }
    ];
    component._monthTaskCache = {
      key: '2026-04',
      tasks: [{ id: 'stale-task', date: '2026-04-01' }]
    };

    componentConfig.observers['analysisOptions, currentMonthKey, readModelVersion'].call(component);

    expect(component.data.isLoading).toBe(true);
    expect(component.data.hasStarRecords).toBe(false);
    expect(component.data.monthCache).toEqual({});
    expect(component._monthTaskCache).toBeNull();
    expect(component.data.calendarDays[0].starInfo).toBeUndefined();
  });

  it('goToToday 应通过 monthchange(force=true) 请求页面强制重刷', () => {
    const component = createComponentInstance();
    component.properties.currentMonthKey = '2026-04';

    component.goToToday();

    expect(component.triggerEvent).toHaveBeenCalledWith('monthchange', expect.objectContaining({
      force: true
    }));
  });

  it('任务状态变化命中当前月份时应请求页面 force 刷新，而不是组件自行拉数', () => {
    const eventBus = {
      on: jest.fn(),
      off: jest.fn()
    };
    global.getApp.mockReturnValue({
      globalData: { eventBus }
    });
    const component = createComponentInstance();
    component.properties.currentMonthKey = '2026-04';
    component.data.currentYear = 2026;
    component.data.currentMonth = 3;

    componentConfig.lifetimes.attached.call(component);
    component._onTaskStatusUpdated({
      task: { date: '2026-04-10' }
    });

    expect(component.triggerEvent).toHaveBeenCalledWith('monthchange', {
      monthKey: '2026-04',
      force: true
    });
  });
});
