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
        analysisOptions: { userId: 'child-1' }
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

  it('attached 与 analysisOptions observer 并发触发时应复用同一次趋势加载', async () => {
    let resolveRefresh;
    const refreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve;
    });
    const refreshStarsFromCloud = jest.fn(() => refreshPromise);
    const calculateHistoricalBalance = jest.fn().mockResolvedValue({
      historyData: [{ date: '3/29', value: 1 }],
      forecastData: []
    });

    global.getApp.mockReturnValue({
      getAnalyticsService: jest.fn(() => ({
        calculateHistoricalBalance
      })),
      getStarService: jest.fn(() => ({
        refreshStarsFromCloud
      }))
    });

    const component = createComponentInstance();
    component.detectEnvironment = jest.fn();
    component.updateDateRangeText = jest.fn();
    component.initChart = jest.fn();
    component.setChartOption = jest.fn();

    const attachedPromise = componentConfig.lifetimes.attached.call(component);
    const observerPromise = componentConfig.observers.analysisOptions.call(component);

    expect(refreshStarsFromCloud).toHaveBeenCalledTimes(1);

    resolveRefresh();
    await attachedPromise;
    await observerPromise;

    expect(calculateHistoricalBalance).toHaveBeenCalledTimes(1);
  });
});
