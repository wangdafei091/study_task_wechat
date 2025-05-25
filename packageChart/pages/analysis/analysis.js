// 获取应用实例和工具类
const app = getApp();
const dateUtils = require('../../../utils/dateUtils.js');
const logger = require('../../../utils/logger.js');

Page({
  data: {
    loading: false // 加载状态
  },
  
  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    logger.info('analysis', '页面加载');
    logger.info('analysis', '调整卡片样式: 移除自定义样式，使用默认卡片样式');
    // 允许页面DOM先渲染
    this.setData({ loading: true });
    setTimeout(() => {
      this.loadData();
    }, 300);
  },
  
  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    // 每次页面显示时刷新数据
    logger.info('analysis', '页面显示');
    // 允许页面DOM先渲染
    this.setData({ loading: true });
    setTimeout(() => {
      this.loadData();
      
      // 获取星星日历组件实例并调用智能刷新方法
      const starCalendar = this.selectComponent('.star-calendar');
      if (starCalendar) {
        logger.info('analysis', '触发星星日历智能刷新');
        starCalendar.smartRefresh();
      } else {
        logger.warn('analysis', '未找到星星日历组件');
      }
    }, 300);
  },
  
  /**
   * 加载数据
   */
  loadData: function() {
    logger.info('analysis', '加载数据');
    
    try {
      // 通过app实例获取任务服务
      const taskService = app.getTaskService();
      if (!taskService) {
        logger.error('analysis', '无法获取任务服务');
        this.setData({ loading: false });
        return;
      }
      
      // 延迟加载数据，然后隐藏加载状态
      setTimeout(() => {
        this.setData({ loading: false });
        logger.info('analysis', '数据加载完成');
      }, 500);
    } catch (err) {
      logger.error('analysis', '加载数据失败:', err);
      this.setData({ loading: false });
      wx.showToast({
        title: '数据加载失败',
        icon: 'none',
        duration: 2000
      });
    }
  }
}) 