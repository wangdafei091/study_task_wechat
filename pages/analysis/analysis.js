// 获取应用实例和工具类
const app = getApp();
const taskManager = require('../../utils/taskManager.js');
const taskUtils = require('../../utils/taskUtils.js');
const dateUtils = require('../../utils/dateUtils.js');
// 引入ECharts
let echarts;
try {
  // 直接导入EC-Canvas内置的echarts对象
  echarts = require('../../ec-canvas/echarts.min.js');
  console.log('[分析页] 成功引入echarts模块，版本:', echarts.version || '未知');
} catch (error) {
  console.error('[分析页] 引入echarts模块失败:', error);
}

Page({
  data: {
    isParentView: false, // 默认显示小朋友视图
    timeRange: 'month', // 默认时间范围：月
    timeRangeOptions: ['week', 'month', 'quarter', 'year'],
    loading: false, // 加载状态
    
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
      },
      stars: {
        total: 0,
        used: 0,
        available: 0
      }
    },
    
    // ECharts 配置
    ecTaskCompletion: {
      lazyLoad: true,
      disableTouch: false
    },
    ecStarStats: {
      lazyLoad: true,
      disableTouch: false
    },
    ecTaskCalendar: {
      lazyLoad: true,
      disableTouch: false
    },
    ecTaskTypes: {
      lazyLoad: true,
      disableTouch: false
    },
    ecTimeDistribution: {
      lazyLoad: true,
      disableTouch: false
    },
    ecHabitTracking: {
      lazyLoad: true,
      disableTouch: false
    }
  },
  
  // 用于跟踪数据变化，避免不必要的重绘
  lastStats: null,
  
  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    console.log('[分析页] 页面加载');
    // 允许页面DOM先渲染
    this.setData({ loading: true });
    setTimeout(() => {
      this.loadAnalysisData();
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
      this.loadAnalysisData();
    }, 300);
  },
  
  /**
   * 切换视图类型（小朋友/家长）
   */
  toggleViewType: function() {
    console.log('[分析页] 切换视图类型');
    this.setData({
      isParentView: !this.data.isParentView
    }, () => {
      // 重新初始化图表
      this.initCharts();
    });
  },
  
  /**
   * 切换时间范围
   */
  changeTimeRange: function(e) {
    const timeRange = e.currentTarget.dataset.range;
    console.log(`[分析页] 切换时间范围: ${timeRange}`);
    
    this.setData({
      timeRange: timeRange
    }, () => {
      // 重新加载数据和图表
      this.loadAnalysisData();
    });
  },
  
  /**
   * 加载分析数据
   */
  loadAnalysisData: function() {
    console.log('[分析页] 加载分析数据');
    
    try {
      // 显示加载状态
      this.setData({ loading: true });
      
      // 根据选择的时间范围获取日期范围
      const dateRange = this.getDateRangeByTimeRange(this.data.timeRange);
      
      // 获取任务统计数据，传入日期范围
      taskManager.getTaskStatistics(dateRange, (stats) => {
        console.log('[分析页] 获取到统计数据:', stats);
        
        try {
          // 获取星星数据 (这里使用模拟数据，实际应用中应与pointsManager集成)
          const starStats = this.getStarStatistics();
          
          // 更新统计数据，并隐藏加载状态
          this.setData({
            stats: {
              ...stats,
              stars: starStats
            },
            loading: false
          }, () => {
            // 初始化图表
            setTimeout(() => this.initCharts(), 100);
          });
        } catch (err) {
          console.error('[分析页] 处理统计数据失败:', err);
          this.setData({ loading: false });
          wx.showToast({
            title: '数据加载失败',
            icon: 'none',
            duration: 2000
          });
        }
      });
    } catch (err) {
      console.error('[分析页] 加载分析数据失败:', err);
      this.setData({ loading: false });
      wx.showToast({
        title: '数据加载失败',
        icon: 'none',
        duration: 2000
      });
    }
  },
  
  /**
   * 获取星星统计数据（示例）
   */
  getStarStatistics: function() {
    // 此处应从实际数据源获取星星数据
    // 由于我们没有直接访问到 pointsManager，这里使用模拟数据
    const availableStars = wx.getStorageSync('userPoints') || 0;
    const totalEarnedStars = wx.getStorageSync('totalEarnedPoints') || 0;
    
    return {
      total: totalEarnedStars,
      used: totalEarnedStars - availableStars,
      available: availableStars
    };
  },
  
  /**
   * 销毁所有图表实例，避免内存泄漏和实例混淆
   */
  destroyAllCharts: function() {
    console.log('[分析页] 销毁所有图表实例');
    // 清空之前可能存在的图表实例
    const chartComponents = [
      '#taskCompletionChart', 
      '#taskTypesChart',
      '#timeDistributionChart',
      '#habitTrackingChart'
    ];
    
    chartComponents.forEach(selector => {
      const component = this.selectComponent(selector);
      if (component && component.chart) {
        try {
          component.chart.dispose();
          component.chart = null;
          console.log(`[分析页] 已销毁图表: ${selector}`);
        } catch (err) {
          console.error(`[分析页] 销毁图表失败: ${selector}`, err);
        }
      }
    });
  },
  
  /**
   * 页面相关生命周期函数
   */
  onHide: function() {
    // 页面隐藏时销毁图表，避免内存泄漏
    this.destroyAllCharts();
  },
  
  onUnload: function() {
    // 页面卸载时销毁图表，避免内存泄漏
    this.destroyAllCharts();
  },
  
  /**
   * 初始化所有图表
   */
  initCharts: function() {
    console.log('[分析页] 初始化图表');
    
    // 检查echarts是否正确加载
    if (!echarts) {
      console.error('[分析页] 无法初始化图表 - echarts未定义');
      wx.showToast({
        title: '图表初始化失败',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    // 强制清除并重建所有图表
    this.destroyAllCharts();
    
    // 根据视图类型初始化不同的图表
    if (this.data.isParentView) {
      this.initParentViewCharts();
    } else {
      this.initChildViewCharts();
    }
  },
  
  /**
   * 初始化小朋友视图图表
   */
  initChildViewCharts: function() {
    console.log('[分析页] 初始化小朋友视图图表');
    // 小朋友视图不再需要初始化图表
    console.log('[分析页] 小朋友视图不包含图表，跳过初始化');
  },
  
  /**
   * 初始化家长视图图表
   */
  initParentViewCharts: function() {
    console.log('[分析页] 初始化家长视图图表');
    
    // 延迟初始化各图表，避免同时渲染卡顿
    setTimeout(() => {
      this.initTaskCompletionChart();
    }, 100);
    
    setTimeout(() => {
      this.initTimeDistributionChart();
    }, 300);
    
    setTimeout(() => {
      this.initHabitTrackingChart();
    }, 500);
    
    setTimeout(() => {
      this.initTaskTypesChart();
    }, 700);
  },
  
  /**
   * 初始化任务完成率图表
   */
  initTaskCompletionChart: function() {
    try {
      // 如果是小朋友视图，不初始化图表
      if (!this.data.isParentView) {
        console.log('[分析页] 小朋友视图不需要初始化任务完成率图表');
        return;
      }
      
      const chartComponent = this.selectComponent('#taskCompletionChart');
      if (!chartComponent) {
        console.error('[分析页] 无法找到图表组件: #taskCompletionChart');
        return;
      }
      
      // 如果已存在图表实例，先销毁
      if (chartComponent.chart) {
        try {
          chartComponent.chart.dispose();
          chartComponent.chart = null;
        } catch (err) {
          console.error('[分析页] 销毁旧图表实例失败:', err);
        }
      }
      
      chartComponent.init((canvas, width, height, dpr) => {
        console.log('[分析页] 初始化任务完成率图表', width, height);
        try {
          if (!echarts) {
            console.error('[分析页] echarts未定义');
            return null;
          }
          const chart = echarts.init(canvas, null, {
            width: width,
            height: height,
            devicePixelRatio: dpr
          });
          
          // 给canvas设置图表实例
          canvas.setChart(chart);
          
          // 保存图表实例到组件，以便后续访问
          chartComponent.chart = chart;
          
          // 根据视图类型设置不同的图表配置
          let option;
          if (this.data.isParentView) {
            option = this.getParentTaskCompletionOption();
          } else {
            // 小朋友视图不应该走到这里，但为了安全，提供一个空选项
            console.warn('[分析页] 小朋友视图不应该初始化任务完成率图表');
            option = {
              title: {
                text: '无数据',
                left: 'center',
                top: 'center'
              }
            };
          }
          
          // 设置动画效果
          option.animation = true;
          
          // 设置图表选项，增加超时处理
          setTimeout(() => {
            try {
              if (chart && !chart.isDisposed()) {
                chart.setOption(option, true);
                console.log('[分析页] 任务完成率图表设置成功');
              }
            } catch (err) {
              console.error('[分析页] 设置图表选项失败:', err); 
            }
          }, 50);
          
          return chart;
        } catch (err) {
          console.error('[分析页] 初始化任务完成率图表失败:', err);
          return null;
        }
      });
    } catch (err) {
      console.error('[分析页] 初始化任务完成率图表组件出错:', err);
    }
  },
  
  /**
   * 初始化任务类型图表
   */
  initTaskTypesChart: function() {
    try {
      // 如果是小朋友视图，不初始化图表
      if (!this.data.isParentView) {
        console.log('[分析页] 小朋友视图不需要初始化任务类型图表');
        return;
      }
      
      const chartComponent = this.selectComponent('#taskTypesChart');
      if (!chartComponent) {
        console.error('[分析页] 无法找到图表组件: #taskTypesChart');
        return;
      }
      
      // 如果已存在图表实例，先销毁
      if (chartComponent.chart) {
        try {
          chartComponent.chart.dispose();
          chartComponent.chart = null;
        } catch (err) {
          console.error('[分析页] 销毁旧图表实例失败:', err);
        }
      }
      
      chartComponent.init((canvas, width, height, dpr) => {
        console.log('[分析页] 初始化任务类型图表', width, height);
        try {
          if (!echarts) {
            console.error('[分析页] echarts未定义');
            return null;
          }
          const chart = echarts.init(canvas, null, {
            width: width,
            height: height,
            devicePixelRatio: dpr
          });
          
          // 给canvas设置图表实例
          canvas.setChart(chart);
          
          // 保存图表实例到组件，以便后续访问
          chartComponent.chart = chart;
          
          // 任务类型数据
          const { habit, study, interest } = this.data.stats.typeCounts;
          
          const option = {
            color: ['#4285F4', '#4CAF50', '#FF9800'],
            tooltip: {
              trigger: 'item',
              formatter: '{b}: {c} ({d}%)'
            },
            legend: {
              orient: 'horizontal',
              bottom: 0,
              data: ['学习', '习惯', '兴趣']
            },
            series: [
              {
                name: '任务类型',
                type: 'pie',
                radius: '55%',
                center: ['50%', '45%'],
                data: [
                  { value: study, name: '学习' },
                  { value: habit, name: '习惯' },
                  { value: interest, name: '兴趣' }
                ],
                emphasis: {
                  itemStyle: {
                    shadowBlur: 10,
                    shadowOffsetX: 0,
                    shadowColor: 'rgba(0, 0, 0, 0.5)'
                  }
                }
              }
            ],
            animation: true
          };
          
          // 设置图表选项，增加超时处理
          setTimeout(() => {
            try {
              if (chart && !chart.isDisposed()) {
                chart.setOption(option, true);
                console.log('[分析页] 任务类型图表设置成功');
              }
            } catch (err) {
              console.error('[分析页] 设置图表选项失败:', err);
            }
          }, 50);
          
          return chart;
        } catch (err) {
          console.error('[分析页] 初始化任务类型图表失败:', err);
          return null;
        }
      });
    } catch (err) {
      console.error('[分析页] 初始化任务类型图表组件出错:', err);
    }
  },
  
  /**
   * 初始化时间分布图表（家长视图）
   */
  initTimeDistributionChart: function() {
    try {
      const chartComponent = this.selectComponent('#timeDistributionChart');
      if (!chartComponent) {
        console.error('[分析页] 无法找到图表组件: #timeDistributionChart');
        return;
      }
      
      // 如果已存在图表实例，先销毁
      if (chartComponent.chart) {
        try {
          chartComponent.chart.dispose();
          chartComponent.chart = null;
        } catch (err) {
          console.error('[分析页] 销毁旧图表实例失败:', err);
        }
      }
      
      chartComponent.init((canvas, width, height, dpr) => {
        console.log('[分析页] 初始化时间分布图表', width, height);
        try {
          if (!echarts) {
            console.error('[分析页] echarts未定义');
            return null;
          }
          const chart = echarts.init(canvas, null, {
            width: width,
            height: height,
            devicePixelRatio: dpr
          });
          
          // 给canvas设置图表实例
          canvas.setChart(chart);
          
          // 保存图表实例到组件，以便后续访问
          chartComponent.chart = chart;
          
          // 获取时间分布数据
          const { xAxisData, seriesData } = this.getTimeDistributionData();
          
          const option = {
            tooltip: {
              trigger: 'axis',
              axisPointer: {
                type: 'shadow'
              }
            },
            legend: {
              data: ['学习', '习惯', '兴趣'],
              bottom: 0
            },
            grid: {
              left: '3%',
              right: '4%',
              bottom: '15%',
              top: '3%',
              containLabel: true
            },
            xAxis: {
              type: 'category',
              data: xAxisData
            },
            yAxis: {
              type: 'value'
            },
            series: [
              {
                name: '学习',
                type: 'bar',
                stack: 'total',
                data: seriesData.study
              },
              {
                name: '习惯',
                type: 'bar',
                stack: 'total',
                data: seriesData.habit
              },
              {
                name: '兴趣',
                type: 'bar',
                stack: 'total',
                data: seriesData.interest
              }
            ],
            animation: true
          };
          
          // 设置图表选项，增加超时处理
          setTimeout(() => {
            try {
              if (chart && !chart.isDisposed()) {
                chart.setOption(option, true);
                console.log('[分析页] 时间分布图表设置成功');
              }
            } catch (err) {
              console.error('[分析页] 设置图表选项失败:', err);
            }
          }, 50);
          
          return chart;
        } catch (err) {
          console.error('[分析页] 初始化时间分布图表失败:', err);
          return null;
        }
      });
    } catch (err) {
      console.error('[分析页] 初始化时间分布图表组件出错:', err);
    }
  },
  
  /**
   * 获取时间分布数据
   */
  getTimeDistributionData: function() {
    console.log('[分析页] 获取时间分布数据');
    
    try {
      // 获取存储的所有任务
      const allTasks = wx.getStorageSync('taskData') || [];
      
      // 时间段定义
      const timeRanges = [
        { label: '早上', start: '05:00', end: '09:00' },
        { label: '上午', start: '09:00', end: '12:00' },
        { label: '中午', start: '12:00', end: '14:00' },
        { label: '下午', start: '14:00', end: '18:00' },
        { label: '晚上', start: '18:00', end: '23:59' }
      ];
      
      // 准备数据结构
      const xAxisData = timeRanges.map(range => range.label);
      const seriesData = {
        study: new Array(timeRanges.length).fill(0),
        habit: new Array(timeRanges.length).fill(0),
        interest: new Array(timeRanges.length).fill(0)
      };
      
      // 获取当前时间范围的任务
      const dateRange = this.getDateRangeByTimeRange(this.data.timeRange);
      
      // 统计各时间段任务数量
      if (Array.isArray(allTasks)) {
        allTasks.forEach(task => {
          // 检查任务是否有效且在当前筛选的日期范围内
          if (task && task.date && task.startTime && 
              task.date >= dateRange.startDate && 
              task.date <= dateRange.endDate) {
            
            // 确定任务属于哪个时间段
            const timeIndex = timeRanges.findIndex(range => {
              return task.startTime >= range.start && task.startTime < range.end;
            });
            
            if (timeIndex !== -1) {
              // 确保任务类型有效
              const taskType = task.type || 'study';
              
              // 根据任务类型添加到相应数组
              if (seriesData.hasOwnProperty(taskType)) {
                seriesData[taskType][timeIndex]++;
              } else {
                // 如果遇到未知任务类型，归入学习类型
                seriesData.study[timeIndex]++;
                console.warn(`[分析页] 未知任务类型: ${taskType}, 归入学习类型`);
              }
            }
          }
        });
      } else {
        console.warn('[分析页] 没有找到任务数据或格式不正确');
      }
      
      return { xAxisData, seriesData };
    } catch (error) {
      console.error('[分析页] 生成时间分布数据失败:', error);
      // 返回默认数据结构，避免图表渲染出错
      return { 
        xAxisData: ['早上', '上午', '中午', '下午', '晚上'],
        seriesData: {
          study: [0, 0, 0, 0, 0],
          habit: [0, 0, 0, 0, 0],
          interest: [0, 0, 0, 0, 0]
        } 
      };
    }
  },
  
  /**
   * 获取习惯跟踪数据
   */
  getHabitTrackingData: function() {
    console.log('[分析页] 获取习惯跟踪数据');
    
    // 获取存储的所有任务
    const allTasks = wx.getStorageSync('taskData') || [];
    
    // 找出所有习惯类型的任务
    const habitTasks = allTasks.filter(task => task.type === 'habit');
    
    // 提取常见的习惯任务标题（最多5种）
    const habitTitles = {};
    habitTasks.forEach(task => {
      if (task.title && !habitTitles[task.title]) {
        habitTitles[task.title] = 0;
      }
      habitTitles[task.title]++;
    });
    
    // 按出现频率排序并取前5个
    const topHabits = Object.keys(habitTitles)
      .sort((a, b) => habitTitles[b] - habitTitles[a])
      .slice(0, 5);
    
    // 如果习惯少于5个，添加默认项
    const defaultHabits = ['早起', '阅读', '锻炼', '整理房间', '按时作业'];
    while (topHabits.length < 5) {
      const habit = defaultHabits[topHabits.length];
      if (!topHabits.includes(habit)) {
        topHabits.push(habit);
      }
    }
    
    // 准备雷达图指标数据
    const indicators = topHabits.map(habit => {
      return { name: habit, max: 100 };
    });
    
    // 获取当前时间范围
    const currentDateRange = this.getDateRangeByTimeRange(this.data.timeRange);
    
    // 计算上一个时间段的日期范围
    const previousDateRange = this.getPreviousDateRange(this.data.timeRange);
    
    // 计算当前时间段的习惯完成率
    const currentData = this.calculateHabitCompletionRates(topHabits, habitTasks, currentDateRange);
    
    // 计算上一个时间段的习惯完成率
    const previousData = this.calculateHabitCompletionRates(topHabits, habitTasks, previousDateRange);
    
    return { indicators, currentData, previousData };
  },
  
  /**
   * 计算习惯完成率
   */
  calculateHabitCompletionRates: function(habits, tasks, dateRange) {
    const completionRates = [];
    
    habits.forEach(habit => {
      // 筛选出当前习惯在指定日期范围内的任务
      const habitTasks = tasks.filter(task => {
        return task && 
               task.title === habit && 
               task.date && 
               task.date >= dateRange.startDate && 
               task.date <= dateRange.endDate;
      });
      
      if (habitTasks.length === 0) {
        completionRates.push(0);
      } else {
        // 计算完成率，确保包括字符串形式的状态值
        const completed = habitTasks.filter(task => 
          task.status === 1 || task.status === '1'
        ).length;
        const rate = Math.round((completed / habitTasks.length) * 100);
        completionRates.push(rate);
      }
    });
    
    return completionRates;
  },
  
  /**
   * 获取上一个时间段的日期范围
   */
  getPreviousDateRange: function(timeRange) {
    const currentRange = this.getDateRangeByTimeRange(timeRange);
    const currentStartDate = new Date(currentRange.startDate);
    const currentEndDate = new Date(currentRange.endDate);
    
    let previousStartDate, previousEndDate;
    
    switch(timeRange) {
      case 'week':
        // 上一周
        previousStartDate = new Date(currentStartDate);
        previousStartDate.setDate(previousStartDate.getDate() - 7);
        previousEndDate = new Date(currentEndDate);
        previousEndDate.setDate(previousEndDate.getDate() - 7);
        break;
      case 'month':
        // 上个月
        previousStartDate = new Date(currentStartDate);
        previousStartDate.setMonth(previousStartDate.getMonth() - 1);
        previousEndDate = new Date(currentStartDate);
        previousEndDate.setDate(previousEndDate.getDate() - 1);
        break;
      case 'quarter':
        // 上个季度
        previousStartDate = new Date(currentStartDate);
        previousStartDate.setMonth(previousStartDate.getMonth() - 3);
        previousEndDate = new Date(currentStartDate);
        previousEndDate.setDate(previousEndDate.getDate() - 1);
        break;
      case 'year':
        // 上一年
        previousStartDate = new Date(currentStartDate);
        previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);
        previousEndDate = new Date(currentEndDate);
        previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);
        break;
    }
    
    return {
      startDate: dateUtils.formatDate(previousStartDate),
      endDate: dateUtils.formatDate(previousEndDate)
    };
  },
  
  /**
   * 获取家长视图的任务完成图表配置
   */
  getParentTaskCompletionOption: function() {
    console.log('[分析页] 获取家长视图任务完成趋势数据');
    
    try {
      // 获取存储的所有任务
      const allTasks = wx.getStorageSync('taskData') || [];
      
      // 准备数据
      const days = 7; // 显示过去7天的数据
      const dates = [];
      const completedData = [];
      const rateData = [];
      
      // 计算日期范围
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - days + 1); // 包括今天在内的7天
      
      // 为每一天准备数据
      for (let i = 0; i < days; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const dateStr = dateUtils.formatDate(currentDate);
        dates.push(dateStr.slice(5)); // 只保留MM-DD部分
        
        // 该日期的任务统计
        let totalCount = 0;
        let completedCount = 0;
        
        // 统计当天的任务数量和完成数量
        if (Array.isArray(allTasks)) {
          allTasks.forEach(task => {
            if (task && task.date === dateStr) {
              totalCount++;
              // 检查任务是否已完成（status为1或字符串'1'）
              if (task.status === 1 || task.status === '1') {
                completedCount++;
              }
            }
          });
        }
        
        // 计算完成率，避免除以零的情况
        const rate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
        
        completedData.push(completedCount);
        rateData.push(rate);
      }
      
      return {
        tooltip: {
          trigger: 'axis',
          axisPointer: {
            type: 'cross',
            crossStyle: {
              color: '#999'
            }
          }
        },
        legend: {
          data: ['完成任务数', '完成率'],
          bottom: 0
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: 30,
          containLabel: true
        },
        xAxis: [
          {
            type: 'category',
            data: dates,
            axisPointer: {
              type: 'shadow'
            }
          }
        ],
        yAxis: [
          {
            type: 'value',
            name: '任务数',
            min: 0,
            max: function(value) {
              return value.max > 5 ? Math.ceil(value.max * 1.2) : 5;
            },
            interval: 1
          },
          {
            type: 'value',
            name: '完成率',
            min: 0,
            max: 100,
            interval: 20,
            axisLabel: {
              formatter: '{value}%'
            }
          }
        ],
        series: [
          {
            name: '完成任务数',
            type: 'bar',
            data: completedData,
            itemStyle: {
              color: '#91cc75'
            }
          },
          {
            name: '完成率',
            type: 'line',
            yAxisIndex: 1,
            data: rateData,
            symbol: 'circle',
            symbolSize: 8,
            itemStyle: {
              color: '#5470c6'
            },
            lineStyle: {
              width: 3
            }
          }
        ]
      };
    } catch (error) {
      console.error('[分析页] 生成任务完成趋势数据失败:', error);
      // 返回基本图表配置，避免渲染错误
      return {
        tooltip: {
          trigger: 'axis'
        },
        legend: {
          data: ['完成任务数', '完成率'],
          bottom: 0
        },
        xAxis: {
          type: 'category',
          data: []
        },
        yAxis: [
          {
            type: 'value',
            name: '任务数'
          },
          {
            type: 'value',
            name: '完成率',
            axisLabel: {
              formatter: '{value}%'
            }
          }
        ],
        series: [
          {
            name: '完成任务数',
            type: 'bar',
            data: []
          },
          {
            name: '完成率',
            type: 'line',
            yAxisIndex: 1,
            data: []
          }
        ]
      };
    }
  },
  
  /**
   * 根据时间范围获取数据的起止日期
   */
  getDateRangeByTimeRange: function(timeRange) {
    console.log(`[分析页] 获取时间范围: ${timeRange}`);
    const endDate = new Date();
    const startDate = new Date();
    
    switch(timeRange) {
      case 'week':
        // 本周
        const dayOfWeek = endDate.getDay() || 7; // 将周日的0改为7
        startDate.setDate(endDate.getDate() - dayOfWeek + 1); // 从周一开始
        break;
      case 'month':
        // 本月
        startDate.setDate(1);
        break;
      case 'quarter':
        // 本季度
        const quarterStartMonth = Math.floor(endDate.getMonth() / 3) * 3;
        startDate.setMonth(quarterStartMonth);
        startDate.setDate(1);
        break;
      case 'year':
        // 本年
        startDate.setMonth(0);
        startDate.setDate(1);
        break;
    }
    
    console.log(`[分析页] 日期范围: ${dateUtils.formatDate(startDate)} 至 ${dateUtils.formatDate(endDate)}`);
    return {
      startDate: dateUtils.formatDate(startDate),
      endDate: dateUtils.formatDate(endDate)
    };
  },
  
  /**
   * 初始化习惯跟踪图表（家长视图）
   */
  initHabitTrackingChart: function() {
    try {
      const chartComponent = this.selectComponent('#habitTrackingChart');
      if (!chartComponent) {
        console.error('[分析页] 无法找到图表组件: #habitTrackingChart');
        return;
      }
      
      // 如果已存在图表实例，先销毁
      if (chartComponent.chart) {
        try {
          chartComponent.chart.dispose();
          chartComponent.chart = null;
        } catch (err) {
          console.error('[分析页] 销毁旧图表实例失败:', err);
        }
      }
      
      chartComponent.init((canvas, width, height, dpr) => {
        console.log('[分析页] 初始化习惯跟踪图表', width, height);
        try {
          if (!echarts) {
            console.error('[分析页] echarts未定义');
            return null;
          }
          const chart = echarts.init(canvas, null, {
            width: width,
            height: height,
            devicePixelRatio: dpr
          });
          
          // 给canvas设置图表实例
          canvas.setChart(chart);
          
          // 保存图表实例到组件，以便后续访问
          chartComponent.chart = chart;
          
          // 获取习惯跟踪数据
          const { indicators, currentData, previousData } = this.getHabitTrackingData();
          
          const option = {
            tooltip: {
              trigger: 'axis'
            },
            radar: {
              indicator: indicators
            },
            series: [
              {
                name: '习惯养成',
                type: 'radar',
                data: [
                  {
                    value: currentData,
                    name: '当前',
                    areaStyle: {}
                  },
                  {
                    value: previousData,
                    name: '上一时段',
                    lineStyle: {
                      type: 'dashed'
                    }
                  }
                ]
              }
            ],
            animation: true
          };
          
          // 设置图表选项，增加超时处理
          setTimeout(() => {
            try {
              if (chart && !chart.isDisposed()) {
                chart.setOption(option, true);
                console.log('[分析页] 习惯跟踪图表设置成功');
              }
            } catch (err) {
              console.error('[分析页] 设置图表选项失败:', err);
            }
          }, 50);
          
          return chart;
        } catch (err) {
          console.error('[分析页] 初始化习惯跟踪图表失败:', err);
          return null;
        }
      });
    } catch (err) {
      console.error('[分析页] 初始化习惯跟踪图表组件出错:', err);
    }
  },
  
  /**
   * 处理日历日期选择事件
   */
  onCalendarDateSelected: function(e) {
    const selectedDate = e.detail.date;
    console.log('[分析页] 日历选择日期:', selectedDate);
    
    // 你可以在这里添加日期选择后的处理逻辑
    // 例如展示当天的星星获取详情等
    
    wx.showToast({
      title: `已选择: ${selectedDate}`,
      icon: 'none',
      duration: 1500
    });
  }
}) 