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
  let viewScopeUtils;
  let prepareReadModel;

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
    viewScopeUtils = require('../../utils/view-scope');
    prepareReadModel = jest.fn().mockResolvedValue({
      success: true,
      fallback: false,
      snapshot: {
        refreshedAt: new Date('2026-04-04T10:00:00').getTime()
      }
    });

    global.getApp = jest.fn(() => ({
      globalData: {
        userService: {
          getLoginUser: jest.fn(() => ({ userId: 'parent-1', role: 'parent' })),
          getCurrentUser: jest.fn(() => ({ userId: 'child-1', role: 'child' })),
          getAllUsers: jest.fn(() => [
            { userId: 'parent-1', role: 'parent', status: 'active' },
            { userId: 'child-1', role: 'child', status: 'active' }
          ])
        }
      },
      getAnalyticsService: jest.fn(() => ({
        prepareReadModel
      }))
    }));

    global.wx = {
      showToast: jest.fn()
    };

    loadPageModule();
  });

  afterEach(() => {
    delete global.Page;
    delete global.getApp;
    delete global.wx;
  });

  it('onLoad 应初始化页面分析状态但不直接重复触发读模型准备', () => {
    const page = createPageInstance();

    page.onLoad();

    expect(page.data.analysisOptions).toEqual({ userId: 'child-1' });
    expect(page.data.visibleMonthKey).toMatch(/^\d{4}-\d{2}$/);
    expect(page.data.trendDays).toBe(7);
    expect(prepareReadModel).not.toHaveBeenCalled();
    expect(viewScopeUtils.resolveAnalysisOptions).toHaveBeenCalledWith(
      { userId: 'parent-1', role: 'parent' },
      { userId: 'child-1', role: 'child' },
      [
        { userId: 'parent-1', role: 'parent', status: 'active' },
        { userId: 'child-1', role: 'child', status: 'active' }
      ]
    );
  });

  it('onShow 应调用 prepareReadModel(force=true) 并递增 readModelVersion', async () => {
    const page = createPageInstance();
    page.onLoad();

    await page.onShow();

    expect(prepareReadModel).toHaveBeenCalledWith(expect.objectContaining({
      analysisOptions: { userId: 'child-1' },
      monthKey: page.data.visibleMonthKey,
      days: 7,
      force: true
    }));
    expect(page.data.readModelVersion).toBe(1);
    expect(page.data.loading).toBe(false);
    expect(page.data.readModelFallback).toBe(false);
  });

  it('月份切换与趋势范围切换应走页面级 loadData(force=false)', async () => {
    const page = createPageInstance();
    page.loadData = jest.fn().mockResolvedValue();

    await page.onCalendarMonthChange({ detail: { monthKey: '2026-05' } });
    await page.onTrendRangeChange({ detail: { days: 30 } });

    expect(page.data.visibleMonthKey).toBe('2026-05');
    expect(page.data.trendDays).toBe(30);
    expect(page.loadData).toHaveBeenNthCalledWith(1, { force: false });
    expect(page.loadData).toHaveBeenNthCalledWith(2, { force: false });
  });

  it('月份切换带 force=true 时应透传到页面级 loadData', async () => {
    const page = createPageInstance();
    page.loadData = jest.fn().mockResolvedValue();

    await page.onCalendarMonthChange({ detail: { monthKey: '2026-04', force: true } });

    expect(page.loadData).toHaveBeenCalledWith({ force: true });
  });
});
