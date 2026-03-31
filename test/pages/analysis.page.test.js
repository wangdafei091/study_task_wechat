jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../utils/view-scope', () => ({
  resolveAnalysisOptions: jest.fn(() => ({ userId: 'child-1' }))
}));

describe('packageChart/pages/analysis/analysis', () => {
  let pageConfig;

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
      }),
      selectComponent: jest.fn(() => ({
        smartRefresh: jest.fn()
      }))
    };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();

    global.getApp = jest.fn(() => ({
      globalData: {
        userService: {
          getLoginUser: jest.fn(() => ({ userId: 'parent-1', role: 'parent' })),
          getCurrentUser: jest.fn(() => ({ userId: 'child-1', role: 'child' }))
        }
      },
      getTaskService: jest.fn(() => ({}))
    }));

    global.wx = {
      showToast: jest.fn()
    };

    loadPageModule();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.Page;
    delete global.getApp;
    delete global.wx;
  });

  it('onLoad 首次进入应安排一次加载，首次 onShow 不应重复安排', () => {
    const page = createPageInstance();
    page.loadData = jest.fn();

    page.onLoad();
    page.onShow();
    jest.advanceTimersByTime(300);

    expect(page.data.analysisOptions).toEqual({ userId: 'child-1' });
    expect(page.loadData).toHaveBeenCalledTimes(1);
  });

  it('后续 onShow 应重新加载并触发星星日历刷新', () => {
    const page = createPageInstance();
    const starCalendar = { smartRefresh: jest.fn() };
    page.selectComponent = jest.fn(() => starCalendar);
    page.loadData = jest.fn();

    page.onLoad();
    page.onShow();
    jest.advanceTimersByTime(300);
    page.onShow();
    jest.advanceTimersByTime(300);
    jest.advanceTimersByTime(200);

    expect(page.loadData).toHaveBeenCalledTimes(2);
    expect(starCalendar.smartRefresh).toHaveBeenCalledTimes(1);
  });
});
