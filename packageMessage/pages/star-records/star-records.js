const serviceManager = require('../../../services/service-manager.js');
const logger = require('../../../utils/logger.js');

const TYPE_FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'task_income', label: '任务获得' },
  { value: 'reward_exchange', label: '兑换使用' },
  { value: 'loss_event', label: '星星减少' }
];

const TIME_FILTERS = [
  { value: 'last7days', label: '最近7天' },
  { value: 'currentMonth', label: '本月' },
  { value: 'all', label: '全部' }
];

Page({
  data: {
    selectedType: 'all',
    selectedTime: 'last7days',
    typeFilters: TYPE_FILTERS,
    timeFilters: TIME_FILTERS,
    records: [],
    groupedRecords: [],
    isGroupedView: false,
    emptyState: null
  },

  onLoad() {
    logger.info('starRecords', '页面加载');
    this._allRecords = [];
    this._starService = null;
    this._hasLoadedOnce = false;
    this.loadStarRecords();
  },

  onShow() {
    if (!this._hasLoadedOnce) {
      return;
    }

    logger.info('starRecords', '页面显示，刷新记录');
    this.loadStarRecords({ showLoading: false });
  },

  onPullDownRefresh() {
    logger.info('starRecords', '下拉刷新');
    this.loadStarRecords({ showLoading: false, stopPullDownRefresh: true });
  },

  getStarService() {
    if (!this._starService) {
      this._starService = serviceManager.getService('starService');
    }

    return this._starService;
  },

  navigateToTasks() {
    logger.info('starRecords', '导航到任务页面');
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  async loadStarRecords(options = {}) {
    const { showLoading = true, stopPullDownRefresh = false } = options;

    if (showLoading) {
      wx.showLoading({
        title: '加载中...'
      });
    }

    try {
      const starService = this.getStarService();

      if (!starService) {
        logger.error('starRecords', '无法获取星星服务');
        this._allRecords = [];
        this.setData({
          records: [],
          groupedRecords: [],
          isGroupedView: false,
          emptyState: this.buildEmptyState([])
        });
        return;
      }

      const records = await starService.getStarRecords();

      logger.info('starRecords', `获取到${records.length}条星星记录`);
      this._allRecords = Array.isArray(records) ? records : [];
      this._hasLoadedOnce = true;
      this.applyCurrentView();
    } catch (error) {
      logger.error('starRecords', '加载星星记录失败', error);
      this._allRecords = [];
      this.setData({
        records: [],
        groupedRecords: [],
        isGroupedView: false,
        emptyState: this.buildEmptyState([])
      });
    } finally {
      wx.hideLoading();
      if (stopPullDownRefresh) {
        wx.stopPullDownRefresh();
      }
    }
  },

  applyCurrentView() {
    const starService = this.getStarService();

    if (!starService) {
      return;
    }

    const viewModel = starService.buildStarRecordViewModel(this._allRecords, {
      activeFilter: this.data.selectedType,
      activeTimeScope: this.data.selectedTime,
      nowTimestamp: Date.now()
    });
    const timeScopedRecords = starService.filterRecords(this._allRecords, 'all', this.data.selectedTime);

    const visibleRecords = viewModel.isGroupedView ? [] : viewModel.records;
    const groupedRecords = viewModel.isGroupedView ? viewModel.groupedRecords : [];
    const hasVisibleContent = visibleRecords.length > 0 || groupedRecords.length > 0;

    this.setData({
      records: visibleRecords,
      groupedRecords,
      isGroupedView: viewModel.isGroupedView,
      emptyState: hasVisibleContent ? null : this.buildEmptyState(this._allRecords, {
        hasTimeScopedRecords: timeScopedRecords.length > 0
      })
    });
  },

  buildEmptyState(allRecords, options = {}) {
    const { hasTimeScopedRecords = false } = options;

    if (!allRecords || allRecords.length === 0) {
      return {
        title: '还没有星星记录',
        text: '完成任务即可获得闪亮星星奖励哦！',
        actions: [
          { action: 'tasks', label: '去完成任务' }
        ]
      };
    }

    if (this.data.selectedTime === 'last7days' && !hasTimeScopedRecords) {
      return {
        title: '最近7天还没有星星变化',
        text: '可以看看本月记录，或查看全部历史',
        actions: [
          { action: 'time', value: 'currentMonth', label: '本月' },
          { action: 'time', value: 'all', label: '全部' }
        ]
      };
    }

    if (this.data.selectedTime === 'currentMonth' && !hasTimeScopedRecords) {
      return {
        title: '本月还没有星星变化',
        text: '可以看看最近7天，或查看全部记录',
        actions: [
          { action: 'time', value: 'last7days', label: '最近7天' },
          { action: 'time', value: 'all', label: '全部' }
        ]
      };
    }

    return {
      title: '当前筛选下暂无记录',
      text: '试试切换时间范围或查看全部记录',
      actions: [
        { action: 'type', value: 'all', label: '查看全部' },
        { action: 'time', value: 'all', label: '全部时间' }
      ]
    };
  },

  quickSelectType(e) {
    const type = e.currentTarget.dataset.type;
    if (!type || this.data.selectedType === type) {
      return;
    }

    logger.info('starRecords', `快速选择类型筛选：${type}`);
    this.setData({
      selectedType: type
    });
    this.applyCurrentView();
  },

  quickSelectTime(e) {
    const time = e.currentTarget.dataset.time;
    if (!time || this.data.selectedTime === time) {
      return;
    }

    logger.info('starRecords', `快速选择时间筛选：${time}`);
    this.setData({
      selectedTime: time
    });
    this.applyCurrentView();
  },

  handleEmptyAction(e) {
    const action = e.currentTarget.dataset.action;
    const value = e.currentTarget.dataset.value;

    if (action === 'tasks') {
      this.navigateToTasks();
      return;
    }

    if (action === 'time' && value) {
      if (this.data.selectedTime !== value) {
        this.setData({
          selectedTime: value
        });
        this.applyCurrentView();
      }
      return;
    }

    if (action === 'type' && value) {
      if (this.data.selectedType !== value) {
        this.setData({
          selectedType: value
        });
        this.applyCurrentView();
      }
    }
  }
});
