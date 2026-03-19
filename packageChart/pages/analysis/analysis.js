const app = getApp();
const logger = require('../../../utils/logger.js');

Page({
  data: {
    loading: false,
    analysisOptions: null, // { scope: 'family' } 或 { userId: '...' }
  },

  /**
   * 根据登录用户角色决定分析数据范围
   * - 家长：看家庭所有孩子数据（scope=family）
   * - 孩子：看自己数据（userId=loginUser.id）
   * 此函数提取为独立方法便于单测
   */
  getAnalysisOptions(loginUser) {
    return (loginUser && loginUser.role === 'parent')
      ? { scope: 'family' }
      : { userId: loginUser && loginUser.id };
  },

  onLoad: function () {
    logger.info('analysis', '页面加载');
    const loginUser = app.globalData && app.globalData.userService
      ? app.globalData.userService.getLoginUser()
      : null;
    const analysisOptions = this.getAnalysisOptions(loginUser);
    logger.info('analysis', '分析范围', analysisOptions);
    this.setData({ loading: true, analysisOptions });
    setTimeout(() => {
      this.loadData();
    }, 300);
  },

  onShow: function () {
    logger.info('analysis', '页面显示');
    // 每次显示时重新计算 analysisOptions，以应对账号视角切换
    const loginUser = app.globalData && app.globalData.userService
      ? app.globalData.userService.getLoginUser()
      : null;
    const analysisOptions = this.getAnalysisOptions(loginUser);
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
