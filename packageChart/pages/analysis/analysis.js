const app = getApp();
const logger = require('../../../utils/logger.js');
const viewScopeUtils = require('../../../utils/view-scope');

Page({
  data: {
    loading: false,
    analysisOptions: null, // { scope: 'family' } 或 { userId: '...' }
  },

  /**
   * 根据当前视角决定分析数据范围
   * - 家长视角：看家庭所有孩子数据（scope=family）
   * - 孩子视角：看当前孩子数据（userId=currentUser.id）
   * 此函数提取为独立方法便于单测
   */
  getAnalysisOptions(loginUser, currentUser) {
    return viewScopeUtils.resolveAnalysisOptions(loginUser, currentUser);
  },

  onLoad: function () {
    logger.info('analysis', '页面加载');
    const userService = app.globalData && app.globalData.userService
      ? app.globalData.userService
      : null;
    const loginUser = userService ? userService.getLoginUser() : null;
    const currentUser = userService ? userService.getCurrentUser() : null;
    const analysisOptions = this.getAnalysisOptions(loginUser, currentUser);
    logger.info('analysis', '分析范围', analysisOptions);
    this.setData({ loading: true, analysisOptions });
    setTimeout(() => {
      this.loadData();
    }, 300);
  },

  onShow: function () {
    logger.info('analysis', '页面显示');
    // 每次显示时重新计算 analysisOptions，以应对账号视角切换
    const userService = app.globalData && app.globalData.userService
      ? app.globalData.userService
      : null;
    const loginUser = userService ? userService.getLoginUser() : null;
    const currentUser = userService ? userService.getCurrentUser() : null;
    const analysisOptions = this.getAnalysisOptions(loginUser, currentUser);
    this.setData({ loading: true, analysisOptions });
    setTimeout(() => {
      this.loadData();
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
