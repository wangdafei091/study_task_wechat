const app = getApp();
const logger = require('../../../utils/logger.js');
const viewScopeUtils = require('../../../utils/view-scope');

Page({
  data: {
    loading: false,
    analysisOptions: null, // { scope: 'family' } 或 { userId: '...' }
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

  _scheduleLoadData(refreshStarCalendar = false) {
    setTimeout(() => {
      this.loadData();
      if (!refreshStarCalendar) {
        return;
      }

      setTimeout(() => {
        const starCalendar = this.selectComponent('.star-calendar');
        if (starCalendar) {
          logger.info('analysis', '触发星星日历智能刷新');
          starCalendar.smartRefresh();
        } else {
          logger.warn('analysis', '未找到星星日历组件');
        }
      }, 200);
    }, 300);
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
    this._skipNextOnShowRefresh = true;
    this.setData({ loading: true, analysisOptions });
    this._scheduleLoadData(false);
  },

  onShow: function () {
    logger.info('analysis', '页面显示');
    const analysisOptions = this._resolveAnalysisOptions();
    const previousOptions = this.data.analysisOptions || null;
    const hasScopeChanged = JSON.stringify(previousOptions) !== JSON.stringify(analysisOptions);

    if (this._skipNextOnShowRefresh) {
      this._skipNextOnShowRefresh = false;
      if (hasScopeChanged) {
        this.setData({ analysisOptions });
      }
      return;
    }

    this.setData({ loading: true, analysisOptions });
    this._scheduleLoadData(true);
  },

  loadData: function () {
    logger.info('analysis', '加载数据');
    try {
      const taskService = app.getTaskService();
      if (!taskService) {
        logger.error('analysis', '无法获取任务服务');
        this.setData({ loading: false });
        return;
      }
      setTimeout(() => {
        this.setData({ loading: false });
        logger.info('analysis', '数据加载完成');
      }, 500);
    } catch (err) {
      logger.error('analysis', '加载数据失败:', err);
      this.setData({ loading: false });
      wx.showToast({ title: '数据加载失败', icon: 'none', duration: 2000 });
    }
  }
});
