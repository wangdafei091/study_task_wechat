jest.mock('../../services/service-manager.js', () => ({
  getService: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

describe('packageMessage/pages/star-records/star-records', () => {
  let pageConfig;
  let serviceManager;
  let starService;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../packageMessage/pages/star-records/star-records.js');
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
    starService = {
      getStarRecords: jest.fn().mockResolvedValue([{ id: 'raw_1', timestamp: 1 }]),
      filterRecords: jest.fn((records, typeFilter, timeFilter) => {
        if (timeFilter === 'last7days') {
          return [{ id: 'display_1' }];
        }

        if (timeFilter === 'currentMonth') {
          return [];
        }

        return Array.isArray(records) ? records : [];
      }),
      buildStarRecordViewModel: jest.fn((records, options) => {
        if (options.activeTimeScope === 'last7days') {
          return {
            isGroupedView: false,
            records: [
              {
                id: 'display_1',
                title: '完成任务获得2颗星星',
                amountValue: 2,
                amountText: '+2',
                tagText: '任务获得',
                tagTone: 'income',
                subtitle: '本周到期 · 2026-04-20 失效',
                primaryTimeText: '2026-04-15 10:00',
                secondaryTimeText: ''
              }
            ],
            groupedRecords: []
          };
        }

        if (options.activeTimeScope === 'currentMonth') {
          return {
            isGroupedView: false,
            records: [],
            groupedRecords: []
          };
        }

        return {
          isGroupedView: true,
          records: [],
          groupedRecords: [
            {
              month: '2026-04',
              monthText: '2026年4月',
              records: []
            }
          ]
        };
      })
    };

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'starService') {
        return starService;
      }

      return null;
    });

    global.wx = {
      showLoading: jest.fn(),
      hideLoading: jest.fn(),
      stopPullDownRefresh: jest.fn(),
      switchTab: jest.fn()
    };

    loadPageModule();
  });

  afterEach(() => {
    delete global.Page;
    delete global.wx;
  });

  it('初次加载在最近7天为空时应展示近7天空态引导', async () => {
    starService.filterRecords.mockImplementation((records, typeFilter, timeFilter) => {
      if (timeFilter === 'last7days') {
        return [];
      }

      return Array.isArray(records) ? records : [];
    });
    starService.buildStarRecordViewModel.mockImplementation((records, options) => {
      if (options.activeTimeScope === 'last7days') {
        return {
          isGroupedView: false,
          records: [],
          groupedRecords: []
        };
      }

      return {
        isGroupedView: true,
        records: [],
        groupedRecords: []
      };
    });
    const page = createPageInstance();

    await page.loadStarRecords();

    expect(starService.getStarRecords).toHaveBeenCalledTimes(1);
    expect(page.data.selectedTime).toBe('last7days');
    expect(page.data.emptyState.title).toBe('最近7天还没有星星变化');
    expect(page.data.emptyState.actions.map((item) => item.label)).toEqual(['本月', '全部']);
  });

  it('切换时间筛选时应只重算缓存，不重复拉取记录', async () => {
    const page = createPageInstance();
    await page.loadStarRecords();

    page.quickSelectTime({
      currentTarget: {
        dataset: {
          time: 'all'
        }
      }
    });

    expect(page.data.selectedTime).toBe('all');
    expect(page.data.isGroupedView).toBe(true);
    expect(page.data.groupedRecords).toHaveLength(1);
    expect(page.data.records).toEqual([]);
    expect(page.data.scopeSummary).toBeUndefined();
    expect(starService.getStarRecords).toHaveBeenCalledTimes(1);
    expect(starService.buildStarRecordViewModel).toHaveBeenCalledTimes(2);
  });

  it('当前时间范围内有记录但当前类型筛选无结果时应显示通用空态', async () => {
    starService.filterRecords.mockImplementation((records, typeFilter, timeFilter) => {
      if (timeFilter === 'last7days') {
        return typeFilter === 'reward_exchange' ? [] : [{ id: 'display_1' }];
      }

      return Array.isArray(records) ? records : [];
    });

    starService.buildStarRecordViewModel.mockImplementation((records, options) => {
      if (options.activeTimeScope === 'last7days' && options.activeFilter === 'reward_exchange') {
        return {
          isGroupedView: false,
          records: [],
          groupedRecords: []
        };
      }

      if (options.activeTimeScope === 'last7days') {
        return {
          isGroupedView: false,
          records: [
            {
              id: 'display_1',
              title: '完成任务获得2颗星星',
              amountValue: 2,
              amountText: '+2',
              tagText: '任务获得',
              tagTone: 'income',
              subtitle: '本周到期 · 2026-04-20 失效',
              primaryTimeText: '2026-04-15 10:00',
              secondaryTimeText: ''
            }
          ],
          groupedRecords: []
        };
      }

      return {
        isGroupedView: false,
        records: [],
        groupedRecords: []
      };
    });

    const page = createPageInstance();
    await page.loadStarRecords();

    page.quickSelectType({
      currentTarget: {
        dataset: {
          type: 'reward_exchange'
        }
      }
    });

    expect(page.data.emptyState.title).toBe('当前筛选下暂无记录');
    expect(page.data.emptyState.text).toBe('试试切换时间范围或查看全部记录');
  });

  it('下拉刷新和 onShow 应重新拉取最新记录', async () => {
    const page = createPageInstance();
    await page.loadStarRecords();

    await page.onPullDownRefresh();
    await page.onShow();

    expect(starService.getStarRecords).toHaveBeenCalledTimes(3);
    expect(global.wx.stopPullDownRefresh).toHaveBeenCalledTimes(1);
  });
});
