const app = getApp();
const pointsManager = require('../../utils/pointsManager.js');
const taskManager = require('../../utils/taskManager.js');

Page({

  /**
   * 页面的初始数据
   */
  data: {
    records: [],
    groupedRecords: [],
    showFilterModal: false,
    selectedType: 'all',     // 筛选类型：all, income, expense
    selectedTime: 'all',     // 筛选时间：all, week, month, 3months
    tempSelectedType: 'all', // 临时选择的类型
    tempSelectedTime: 'all', // 临时选择的时间
    taskData: {}             // 任务数据缓存
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    console.log('[starRecords] 页面加载');
    this.loadTaskData();
    this.loadStarRecords();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    // 页面显示时重新加载记录
    console.log('[starRecords] 页面显示，刷新记录');
    this.loadStarRecords();
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    console.log('[starRecords] 下拉刷新');
    // 重新加载记录
    this.loadStarRecords(() => {
      wx.stopPullDownRefresh();
    });
  },
  
  /**
   * 导航到任务页面
   */
  navigateToTasks: function() {
    console.log('[starRecords] 导航到任务页面');
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  /**
   * 加载任务数据，用于确定记录的任务类型
   */
  loadTaskData: function() {
    console.log('[starRecords] 加载任务数据');
    const tasks = wx.getStorageSync('taskData') || [];
    
    // 构建任务ID到任务类型的映射
    const taskMap = {};
    tasks.forEach(task => {
      taskMap[task.id] = {
        type: task.type || 'study', // 默认为学习类型
        title: task.title
      };
    });
    
    this.setData({
      taskData: taskMap
    });
    
    console.log(`[starRecords] 加载了${Object.keys(taskMap).length}个任务数据`);
  },

  /**
   * 加载星星记录数据
   */
  loadStarRecords: function(callback) {
    console.log('[starRecords] 开始加载星星记录数据');
    wx.showLoading({
      title: '加载中...',
    });
    
    // 使用pointsManager获取星星记录
    pointsManager.getStarRecords(records => {
      console.log(`[starRecords] 获取到${records.length}条星星记录`);
      
      if (records.length > 0) {
        // 处理记录，添加任务类型信息
        records = this.processRecords(records);
        
        // 计算每条记录的星星余额
        let balance = pointsManager.getUserPoints();
        records = this.calculateRecordBalance(records, balance);
        
        // 应用筛选条件
        const filteredRecords = this.filterRecords(records, this.data.selectedType, this.data.selectedTime);
        console.log(`[starRecords] 筛选后剩余${filteredRecords.length}条记录`);
        
        // 按月份分组
        const groupedRecords = pointsManager.groupRecordsByMonth(filteredRecords);
        
        // 计算月度汇总数据
        const enhancedGroupedRecords = this.calculateMonthSummary(groupedRecords);
        
        this.setData({
          records: filteredRecords,
          groupedRecords: enhancedGroupedRecords
        });
      } else {
        this.setData({
          records: [],
          groupedRecords: []
        });
      }
      
      wx.hideLoading();
      
      if (callback) {
        callback();
      }
    });
  },

  /**
   * 处理记录，添加任务类型信息
   */
  processRecords: function(records) {
    console.log('[starRecords] 处理记录，添加任务类型信息');
    return records.map(record => {
      const processedRecord = { ...record };
      
      // 为记录添加样式类名
      if (record.points < 0) {
        // 消费记录，使用紫色
        processedRecord.recordClass = 'expense-record';
      } else if (record.source === 'task') {
        // 从记录ID提取任务类型信息
        const taskId = this.extractTaskId(record.id);
        const taskInfo = this.data.taskData[taskId];
        
        if (taskInfo) {
          switch(taskInfo.type) {
            case 'study':
              processedRecord.recordClass = 'study-task-record';
              break;
            case 'habit':
              processedRecord.recordClass = 'habit-task-record';
              break;
            case 'interest':
              processedRecord.recordClass = 'interest-task-record';
              break;
            default:
              processedRecord.recordClass = 'study-task-record';
          }
        } else {
          // 未找到任务信息，默认为学习任务
          processedRecord.recordClass = 'study-task-record';
        }
      } else {
        // 其他收入记录，默认为学习类型
        processedRecord.recordClass = 'study-task-record';
      }
      
      return processedRecord;
    });
  },

  /**
   * 从记录ID中提取任务ID
   */
  extractTaskId: function(recordId) {
    if (!recordId || typeof recordId !== 'string') return null;
    
    // 记录ID格式：task_任务ID_时间戳
    const parts = recordId.split('_');
    if (parts.length >= 2 && parts[0] === 'task') {
      return parts[1];
    }
    
    return null;
  },

  /**
   * 计算每条记录的星星余额
   */
  calculateRecordBalance: function(records, currentBalance) {
    console.log(`[starRecords] 计算记录余额，当前总星星数：${currentBalance}`);
    // 按时间从新到旧排序
    records.sort((a, b) => b.timestamp - a.timestamp);
    
    // 计算每条记录的结束余额
    let result = [];
    for (let i = 0; i < records.length; i++) {
      const record = { ...records[i] };
      
      // 修复数字问题，确保没有前导零
      record.points = parseInt(record.points);
      record.balance = parseInt(currentBalance);
      
      result.push(record);
      
      // 根据点数变动，计算之前的余额
      currentBalance = currentBalance - record.points;
    }
    
    return result;
  },
  
  /**
   * 计算月度汇总信息
   */
  calculateMonthSummary: function(groupedRecords) {
    console.log(`[starRecords] 计算月度汇总，共${groupedRecords.length}个月份`);
    return groupedRecords.map(group => {
      const records = group.records || [];
      let incomeTotal = 0;
      let expenseTotal = 0;
      
      records.forEach(record => {
        if (record.points > 0) {
          incomeTotal += record.points;
        } else {
          expenseTotal += Math.abs(record.points);
        }
      });
      
      const netChange = incomeTotal - expenseTotal;
      let summary = '';
      
      // 确保数字不显示前导零，使用parseInt处理
      if (netChange >= 0) {
        summary = `本月共获得 ${parseInt(incomeTotal)} 颗星星`;
      } else {
        summary = `本月共使用 ${parseInt(expenseTotal)} 颗星星`;
      }
      
      return {
        ...group,
        monthSummary: summary,
        incomeTotal: parseInt(incomeTotal),
        expenseTotal: parseInt(expenseTotal),
        netChange: netChange
      };
    });
  },

  /**
   * 根据条件筛选记录
   */
  filterRecords: function(records, typeFilter, timeFilter) {
    console.log(`[starRecords] 筛选记录，类型：${typeFilter}，时间：${timeFilter}`);
    let filtered = [...records];
    
    // 应用类型筛选
    if (typeFilter !== 'all') {
      filtered = filtered.filter(record => record.type === typeFilter);
    }
    
    // 应用时间筛选
    if (timeFilter !== 'all') {
      const now = Date.now();
      let timeThreshold = now;
      
      if (timeFilter === 'week') {
        // 一周前
        timeThreshold = now - (7 * 24 * 60 * 60 * 1000);
      } else if (timeFilter === 'month') {
        // 一个月前
        timeThreshold = now - (30 * 24 * 60 * 60 * 1000);
      } else if (timeFilter === '3months') {
        // 三个月前
        timeThreshold = now - (90 * 24 * 60 * 60 * 1000);
      }
      
      filtered = filtered.filter(record => record.timestamp >= timeThreshold);
    }
    
    return filtered;
  },

  /**
   * 快速选择类型筛选
   * 新增方法，直接应用筛选
   */
  quickSelectType: function(e) {
    const type = e.currentTarget.dataset.type;
    console.log(`[starRecords] 快速选择类型筛选：${type}`);
    
    // 如果选择的是当前已选类型，则不进行处理
    if (this.data.selectedType === type) {
      return;
    }
    
    this.setData({
      selectedType: type,
      tempSelectedType: type
    }, () => {
      // 重新加载并筛选记录
      this.loadStarRecords();
    });
  },
  
  /**
   * 快速选择时间筛选
   * 新增方法，直接应用筛选
   */
  quickSelectTime: function(e) {
    const time = e.currentTarget.dataset.time;
    console.log(`[starRecords] 快速选择时间筛选：${time}`);
    
    // 如果选择的是当前已选时间，则不进行处理
    if (this.data.selectedTime === time) {
      return;
    }
    
    this.setData({
      selectedTime: time,
      tempSelectedTime: time
    }, () => {
      // 重新加载并筛选记录
      this.loadStarRecords();
    });
  }
}) 