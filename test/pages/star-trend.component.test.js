jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../utils/view-scope', () => ({
  hasResolvedAnalysisOptions: jest.fn((options) => Boolean(options && (options.scope || options.userId)))
}));

describe('packageChart/components/star-trend/star-trend', () => {
  let componentConfig;

  function loadComponentModule() {
    componentConfig = null;
    global.Component = jest.fn((config) => {
      componentConfig = config;
    });

    jest.isolateModules(() => {
      require('../../packageChart/components/star-trend/star-trend.js');
    });
  }

  function createComponentInstance() {
    const instance = {
      data: {
        ...(componentConfig.data || {}),
        currentRange: 7
      },
      properties: {
        days: 7,
        analysisOptions: { userId: 'child-1' },
        readModelVersion: 1
      },
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      }),
      selectComponent: jest.fn(() => null)
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

  it('attached 与 readModelVersion observer 并发触发时应复用同一次趋势加载', async () => {
    const calculateHistoricalBalance = jest.fn().mockResolvedValue({
      historyData: [{ date: '3/29', value: 1 }],
      forecastData: []
    });

    global.getApp.mockReturnValue({
      getAnalyticsService: jest.fn(() => ({
        calculateHistoricalBalance
      }))
    });

    const component = createComponentInstance();
    component.detectEnvironment = jest.fn();
    component.updateDateRangeText = jest.fn();
    component.initChart = jest.fn();
    component.setChartOption = jest.fn();

    const attachedPromise = componentConfig.lifetimes.attached.call(component);
    const observerPromise = componentConfig.observers['analysisOptions, readModelVersion, days'].call(component);
    await attachedPromise;
    await observerPromise;

    expect(calculateHistoricalBalance).toHaveBeenCalledTimes(1);
  });

  it('days 变化但 readModelVersion 未推进时不应抢先加载趋势', () => {
    const component = createComponentInstance();
    component._attached = true;
    component._lastRequestedReadModelVersion = 1;
    component.properties.days = 30;
    component.properties.readModelVersion = 1;
    component.updateDateRangeText = jest.fn();
    component.loadStarTrendData = jest.fn();

    componentConfig.observers['analysisOptions, readModelVersion, days'].call(component);

    expect(component.data.currentRange).toBe(30);
    expect(component.updateDateRangeText).toHaveBeenCalled();
    expect(component.loadStarTrendData).not.toHaveBeenCalled();
  });

  it('readModelVersion 推进后才应加载新趋势数据', () => {
    const component = createComponentInstance();
    component._attached = true;
    component._lastRequestedReadModelVersion = 1;
    component.properties.days = 30;
    component.properties.readModelVersion = 2;
    component.updateDateRangeText = jest.fn();
    component.loadStarTrendData = jest.fn();

    componentConfig.observers['analysisOptions, readModelVersion, days'].call(component);

    expect(component.loadStarTrendData).toHaveBeenCalledTimes(1);
    expect(component._lastRequestedReadModelVersion).toBe(2);
  });
});
