const app = getApp();
const serviceManager = require('../../../services/service-manager.js');
const formatUtils = require('../../../utils/formatUtils.js');
const logger = require('../../../utils/logger.js');

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
    logger.info('starRecords', '页面加载');
    this.loadTaskData();
    this.loadStarRecords();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    // 页面显示时重新加载记录
    logger.info('starRecords', '页面显示，刷新记录');
    this.loadStarRecords();
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    logger.info('starRecords', '下拉刷新');
    // 重新加载记录
    this.loadStarRecords(() => {
      wx.stopPullDownRefresh();
    });
  },
  
  /**
   * 导航到任务页面
   */
  navigateToTasks: function() {
    logger.info('starRecords', '导航到任务页面');
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  /**
   * 加载任务数据，用于确定记录的任务类型
   */
  async loadTaskData() {
    logger.info('starRecords', '加载任务数据');
    
    try {
      // 获取任务服务
      const taskService = serviceManager.getService('task');
      
      if (!taskService) {
        logger.error('starRecords', '无法获取任务服务');
        return;
      }
      
      // 使用任务服务获取所有任务
      const tasks = await taskService.getAllTasks();
      
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
      
      logger.info('starRecords', `加载了${Object.keys(taskMap).length}个任务数据`);
    } catch (error) {
      logger.error('starRecords', '加载任务数据失败', error);
    }
  },

  /**
   * 加载星星记录数据
   */
  loadStarRecords: async function(callback) {
    logger.info('starRecords', '开始加载星星记录数据');
    wx.showLoading({
      title: '加载中...',
    });
    
    try {
      // 获取星星服务
      const starService = serviceManager.getService('starService');
      
      if (!starService) {
        logger.error('starRecords', '无法获取星星服务');
        wx.hideLoading();
        if (callback) callback();
        return;
      }
      
      // 使用starService获取记录
      const records = await starService.getStarRecords();
      logger.info('starRecords', `获取到${records.length}条星星记录`);
      
      // 添加原始数据调试日志
      if (records.length > 0) {
        logger.info('starRecords', `第一条原始记录结构:`, {
          id: records[0].id,
          type: records[0].type,
          source: records[0].source,
          points: records[0].points,
          description: records[0].description,
          timestamp: records[0].timestamp
        });
      }
      
      if (records.length > 0) {
        // 处理记录，添加任务类型信息
        const processedRecords = this.processRecords(records);
        
        // 获取当前星星数量
        const balance = await starService.getTotalStars();
        
        // 计算每条记录的星星余额
        const recordsWithBalance = this.calculateRecordBalance(processedRecords, balance);
        
        // 应用筛选条件
        const filteredRecords = this.filterRecords(recordsWithBalance, this.data.selectedType, this.data.selectedTime);
        logger.info('starRecords', `筛选后剩余${filteredRecords.length}条记录`);
        
        // 按月份分组
        const groupedRecords = this.groupRecordsByMonth(filteredRecords);
        
        // 计算月度汇总数据
        const enhancedGroupedRecords = this.calculateMonthSummary(groupedRecords);
        
        // 添加最终数据结构调试日志
        logger.info('starRecords', `准备设置页面数据: 记录数=${filteredRecords.length}, 分组数=${enhancedGroupedRecords.length}`);
        if (enhancedGroupedRecords.length > 0 && enhancedGroupedRecords[0].records.length > 0) {
          logger.info('starRecords', `第一条最终记录结构:`, {
            title: enhancedGroupedRecords[0].records[0].title,
            time: enhancedGroupedRecords[0].records[0].time,
            points: enhancedGroupedRecords[0].records[0].points,
            type: enhancedGroupedRecords[0].records[0].type,
            recordClass: enhancedGroupedRecords[0].records[0].recordClass
          });
        }
        
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
    } catch (error) {
      logger.error('starRecords', '加载星星记录失败', error);
    } finally {
      wx.hideLoading();
      if (callback) callback();
    }
  },

  /**
   * 处理记录，添加任务类型信息
   */
  processRecords: function(records) {
    logger.info('starRecords', '处理记录，添加任务类型信息');
    return records.map(record => {
      const processedRecord = { ...record };
      
      // 添加页面需要的字段映射
      processedRecord.title = record.description || '星星记录';
      
      // 检查是否为惩罚记录并处理双时间显示
      const penaltyInfo = record.getPenaltyDisplayInfo ? record.getPenaltyDisplayInfo() : null;
      if (penaltyInfo) {
        // 惩罚记录：主要显示任务截止时间，次要显示扣星执行时间
        processedRecord.time = penaltyInfo.mainTime;
        processedRecord.subTime = penaltyInfo.subTime;
        processedRecord.hasDualTime = true;
      } else {
        // 普通记录：正常显示时间
        if (record.timestamp) {
          const date = new Date(record.timestamp);
          processedRecord.time = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        } else {
          processedRecord.time = '未知时间';
        }
        processedRecord.hasDualTime = false;
      }
      
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
      
      // 添加调试日志
      logger.info('starRecords', `处理记录: ${processedRecord.title}, 类型: ${processedRecord.type}, 点数: ${processedRecord.points}${processedRecord.hasDualTime ? ', 双时间显示' : ''}`);
      
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
    logger.info('starRecords', `开始计算记录余额，使用StarService`);
    
    // 获取星星服务
    const starService = serviceManager.getService('starService');
    if (!starService) {
      logger.error('starRecords', '无法获取星星服务，使用本地计算');
      // 降级处理
      return this.calculateRecordBalanceLocal(records, currentBalance);
    }
    
    // 使用服务层计算方法
    return starService.calculateRecordBalance(records, currentBalance);
  },

  /**
   * 本地计算记录余额（降级方法）
   */
  calculateRecordBalanceLocal: function(records, currentBalance) {
    logger.info('starRecords', `计算记录余额，当前总星星数：${currentBalance}`);
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
    logger.info('starRecords', `开始计算月度汇总，使用StarService`);
    
    // 获取星星服务
    const starService = serviceManager.getService('starService');
    if (!starService) {
      logger.error('starRecords', '无法获取星星服务，使用本地计算');
      // 降级处理
      return this.calculateMonthSummaryLocal(groupedRecords);
    }
    
    // 使用服务层计算方法
    return starService.calculateMonthSummary(groupedRecords);
  },

  /**
   * 本地计算月度汇总（降级方法）
   */
  calculateMonthSummaryLocal: function(groupedRecords) {
    logger.info('starRecords', `计算月度汇总，共${groupedRecords.length}个月份`);
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
    logger.info('starRecords', `开始筛选记录，使用StarService`);
    
    // 获取星星服务
    const starService = serviceManager.getService('starService');
    if (!starService) {
      logger.error('starRecords', '无法获取星星服务，使用本地筛选');
      // 降级处理
      return this.filterRecordsLocal(records, typeFilter, timeFilter);
    }
    
    // 使用服务层筛选方法
    return starService.filterRecords(records, typeFilter, timeFilter);
  },

  /**
   * 本地筛选记录（降级方法）
   */
  filterRecordsLocal: function(records, typeFilter, timeFilter) {
    logger.info('starRecords', `筛选记录，类型：${typeFilter}，时间：${timeFilter}`);
    let filtered = [...records];
    
    // 记录筛选前的数据用于调试
    logger.info('starRecords', `筛选前记录数量：${records.length}`);
    if (records.length > 0) {
      logger.info('starRecords', `第一条记录类型：${records[0].type}，点数：${records[0].points}，标题：${records[0].title || records[0].description}`);
    }
    
    // 应用类型筛选
    if (typeFilter !== 'all') {
      filtered = filtered.filter(record => record.type === typeFilter);
      logger.info('starRecords', `类型筛选后记录数量：${filtered.length}`);
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
      logger.info('starRecords', `时间筛选后记录数量：${filtered.length}`);
    }
    
    logger.info('starRecords', `最终筛选结果：${filtered.length}条记录`);
    return filtered;
  },

  /**
   * 快速选择类型筛选
   * 新增方法，直接应用筛选
   */
  quickSelectType: function(e) {
    const type = e.currentTarget.dataset.type;
    logger.info('starRecords', `快速选择类型筛选：${type}`);
    
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
    logger.info('starRecords', `快速选择时间筛选：${time}`);
    
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
  },

  /**
   * 按月份分组记录
   */
  groupRecordsByMonth: function(records) {
    logger.info('starRecords', `开始按月份分组记录，使用StarService`);
    
    // 获取星星服务
    const starService = serviceManager.getService('starService');
    if (!starService) {
      logger.error('starRecords', '无法获取星星服务，使用本地分组');
      // 降级处理
      return this.groupRecordsByMonthLocal(records);
    }
    
    // 使用服务层分组方法
    return starService.groupRecordsByMonth(records);
  },

  /**
   * 本地按月份分组记录（降级方法）
   */
  groupRecordsByMonthLocal: function(records) {
    logger.info('starRecords', '开始按月份分组记录');
    const result = [];
    const monthGroups = {};
    
    // 按月份分组
    records.forEach(record => {
      if (!record.timestamp) return;
      
      const date = new Date(record.timestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthGroups[monthKey]) {
        monthGroups[monthKey] = {
          month: monthKey,
          monthText: `${date.getFullYear()}年${date.getMonth() + 1}月`,
          records: []
        };
      }
      
      monthGroups[monthKey].records.push(record);
    });
    
    // 将分组转换为数组并按月份排序
    Object.values(monthGroups).forEach(group => {
      result.push(group);
    });
    
    // 按时间从新到旧排序
    result.sort((a, b) => {
      return b.month.localeCompare(a.month);
    });
    
    return result;
  }
}) 