const app = getApp();
const logger = require('../../../utils/logger.js');
const viewScopeUtils = require('../../../utils/view-scope');

Page({
  data: {
    loading: false,
    analysisOptions: null, // { scope: 'family' } 或 { userId: '...' }
    visibleMonthKey: '',
    trendDays: 7,
    readModelVersion: 0,
    readModelFallback: false,
    readModelReadyAt: 0
  },

  _resolveAnalysisOptions() {
    const userService = app.globalData && app.globalData.userService
      ? app.globalData.userService
      : null;
    const loginUser = userService ? userService.getLoginUser() : null;
    const currentUser = userService ? userService.getCurrentUser() : null;
    const availableUsers = userService && typeof userService.getAllUsers === 'function'
      ? userService.getAllUsers()
      : [];
    return this.getAnalysisOptions(loginUser, currentUser, availableUsers);
  },

  _getCurrentMonthKey() {
    return `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  },

  /**
   * 根据当前视角决定分析数据范围
   * - 孩子视角：看当前孩子数据（userId=currentUser.id）
   * - 家长视角：根据活跃孩子数量决定是看单个孩子还是 family 汇总
   * 此函数提取为独立方法便于单测
   */
  getAnalysisOptions(loginUser, currentUser, availableUsers = []) {
    return viewScopeUtils.resolveAnalysisOptions(loginUser, currentUser, availableUsers);
  },

  onLoad: function () {
    logger.info('analysis', '页面加载');
    const analysisOptions = this._resolveAnalysisOptions();
    logger.info('analysis', '分析范围', analysisOptions);
    this.setData({
      loading: true,
      analysisOptions,
      visibleMonthKey: this._getCurrentMonthKey(),
      trendDays: 7
    });
  },

  onShow: async function () {
    logger.info('analysis', '页面显示');
    const analysisOptions = this._resolveAnalysisOptions();
    const previousOptions = this.data.analysisOptions || null;
    const hasScopeChanged = JSON.stringify(previousOptions) !== JSON.stringify(analysisOptions);

    this.setData({
      loading: true,
      analysisOptions,
      visibleMonthKey: this.data.visibleMonthKey || this._getCurrentMonthKey(),
      trendDays: this.data.trendDays || 7
    });

    await this.loadData({ force: true, scopeChanged: hasScopeChanged });
  },

  async loadData(options = {}) {
    logger.info('analysis', '加载数据');
    try {
      const analyticsService = app.getAnalyticsService();
      if (!analyticsService || typeof analyticsService.prepareReadModel !== 'function') {
        logger.error('analysis', '无法获取分析服务');
        this.setData({ loading: false });
        return;
      }

      const result = await analyticsService.prepareReadModel({
        analysisOptions: this.data.analysisOptions,
        monthKey: this.data.visibleMonthKey || this._getCurrentMonthKey(),
        days: Number(this.data.trendDays || 7),
        force: options.force === true
      });

      this.setData({
        loading: false,
        readModelVersion: Number(this.data.readModelVersion || 0) + 1,
        readModelFallback: result?.fallback === true,
        readModelReadyAt: result?.snapshot?.refreshedAt || Date.now()
      });
      logger.info('analysis', '数据加载完成', {
        fallback: result?.fallback === true,
        scopeChanged: options.scopeChanged === true
      });
    } catch (err) {
      logger.error('analysis', '加载数据失败:', err);
      this.setData({ loading: false });
      wx.showToast({ title: '数据加载失败', icon: 'none', duration: 2000 });
    }
  },

  onCalendarMonthChange: async function(e) {
    const monthKey = e?.detail?.monthKey || this.data.visibleMonthKey || this._getCurrentMonthKey();
    const force = e?.detail?.force === true;
    this.setData({
      visibleMonthKey: monthKey,
      loading: true
    });
    await this.loadData({ force });
  },

  onTrendRangeChange: async function(e) {
    const trendDays = Number(e?.detail?.days || this.data.trendDays || 7);
    this.setData({
      trendDays,
      loading: true
    });
    await this.loadData({ force: false });
  }
});
