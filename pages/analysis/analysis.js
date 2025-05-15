// 获取应用实例和工具类
const app = getApp();
const taskManager = require('../../utils/taskManager.js');
const dateUtils = require('../../utils/dateUtils.js');

Page({
  data: {
    loading: false // 加载状态
  },
  
  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    console.log('[分析页] 页面加载');
    console.log('[analysis] 调整卡片样式: 移除自定义样式，使用默认卡片样式');
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
    console.log('[分析页] 页面显示');
    // 允许页面DOM先渲染
    this.setData({ loading: true });
    setTimeout(() => {
      this.loadData();
      
      // 获取星星日历组件实例并调用智能刷新方法
      const starCalendar = this.selectComponent('.star-calendar');
      if (starCalendar) {
        console.log('[分析页] 触发星星日历智能刷新');
        starCalendar.smartRefresh();
      } else {
        console.log('[分析页] 未找到星星日历组件');
      }
    }, 300);
  },
  
  /**
   * 加载数据
   */
  loadData: function() {
    console.log('[分析页] 加载数据');
    
    try {
      // 延迟加载数据，然后隐藏加载状态
      setTimeout(() => {
        this.setData({ loading: false });
        console.log('[分析页] 数据加载完成');
      }, 500);
    } catch (err) {
      console.error('[分析页] 加载数据失败:', err);
      this.setData({ loading: false });
      wx.showToast({
        title: '数据加载失败',
        icon: 'none',
        duration: 2000
      });
    }
  }
}) 