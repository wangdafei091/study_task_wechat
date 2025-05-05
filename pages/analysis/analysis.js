const app = getApp();
const taskManager = require('../../utils/taskManager.js');

Page({
  data: {
    // 统计数据
    stats: {
      totalTasks: 0,
      completedTasks: 0,
      completionRate: 0,
      streak: 0, // 连续完成天数
      typeCounts: {
        habit: 0,
        interest: 0,
        study: 0
      }
    }
  },
  
  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    console.log('[分析页] 页面加载');
    this.loadAnalysisData();
  },
  
  /**
   * 加载分析数据
   */
  loadAnalysisData: function() {
    console.log('[分析页] 加载分析数据');
    
    // 获取任务统计数据
    taskManager.getTaskStatistics(null, (stats) => {
      console.log('[分析页] 获取到统计数据:', stats);
      this.setData({ stats });
    });
  },
  
  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    // 每次页面显示时刷新数据
    this.loadAnalysisData();
  }
}) 