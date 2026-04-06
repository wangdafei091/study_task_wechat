jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../utils/view-scope', () => ({
  hasResolvedAnalysisOptions: jest.fn((options) => Boolean(options && (options.scope || options.userId)))
}));

jest.mock('../../services/service-manager.js', () => ({
  getStarService: jest.fn(() => ({
    refreshStarsFromCloud: jest.fn(),
    getStarRecordsByDateRange: jest.fn()
  })),
  getTaskService: jest.fn(() => ({
    getTasksByDateRange: jest.fn(),
    getTasksByDate: jest.fn()
  }))
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
        }
      },
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
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
    component.smartRefresh = jest.fn();

    componentConfig.observers['analysisOptions, currentMonthKey, readModelVersion'].call(component);

    expect(component.smartRefresh).not.toHaveBeenCalled();
  });

  it('统一读模型模式未命中 prepared snapshot 时不应回退到组件自拉云', () => {
    const serviceManager = require('../../services/service-manager.js');
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

    expect(serviceManager.getStarService).not.toHaveBeenCalled();
    expect(serviceManager.getTaskService).not.toHaveBeenCalled();
    expect(component.updateCalendarWithStars).not.toHaveBeenCalled();
  });

  it('非统一读模型 fallback 仍允许按 analysis scope 直连刷新星星', async () => {
    const refreshStarsFromCloud = jest.fn().mockResolvedValue();

    const component = createComponentInstance();

    await component._refreshStarsForAnalysis({ refreshStarsFromCloud }, {
      scope: 'family',
      childUserIds: ['child-1']
    });
    await component._refreshStarsForAnalysis({ refreshStarsFromCloud }, {
      userId: 'child-1'
    });

    expect(refreshStarsFromCloud).toHaveBeenNthCalledWith(1, null, { scope: 'family' });
    expect(refreshStarsFromCloud).toHaveBeenNthCalledWith(2, 'child-1');
  });
});
