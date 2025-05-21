/**
 * 分析管理器 - 专门处理数据分析和报表功能
 */

const logger = require('./logger');
const storageUtils = require('./storageUtils');
const dateUtils = require('./dateUtils');
const serviceManager = require('./serviceManager');

const analyticsManager = {
  /**
   * 获取任务星星日历数据
   * 只获取任务完成获得的星星和未完成必做任务扣除的星星
   * @param {Function} callback 回调函数，参数为记录数组
   */
  getTaskStarCalendarData: function(callback) {
    logger.info('analyticsManager', `开始获取任务星星日历数据`);
    
    const records = [];
    
    // 获取任务数据
    const tasks = storageUtils.get('taskData', []);
    
    // 获取已完成任务记录中的星星获取记录
    const completedTasks = tasks.filter(task => 
      task.status === 1 && task.starAwarded === true
    );
    
    logger.info('analyticsManager', `从${completedTasks.length}个已完成任务中获取星星记录`);
    
    // 将任务完成记录转换为星星记录
    completedTasks.forEach(task => {
      const timestamp = task.completionRecords && task.completionRecords.length > 0 
        ? task.completionRecords[0].timestamp
        : task.modifyTime || Date.now();
      
      const date = new Date(timestamp);
      const timeStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
      
      records.push({
        id: `task_${task.id}_${timestamp}`,
        title: `完成任务：${task.title}`,
        time: timeStr,
        timestamp: timestamp,
        points: task.points || 0,
        type: 'income',
        source: 'task'
      });
    });
    
    // 获取未完成必做任务的惩罚记录中的星星扣除记录
    const penaltyTasks = tasks.filter(task => 
      task.isRequired === true && task.penaltyApplied === true
    );
    
    logger.info('analyticsManager', `从${penaltyTasks.length}个未完成必做任务中获取星星扣除记录`);
    
    // 将未完成必做任务记录转换为星星扣除记录
    penaltyTasks.forEach(task => {
      const timestamp = task.modifyTime || Date.now();
      const date = new Date(timestamp);
      const timeStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
      
      records.push({
        id: `penalty_${task.id}_${timestamp}`,
        title: `未完成必做任务：${task.title}`,
        time: timeStr,
        timestamp: timestamp,
        points: -(task.points || 0), // 扣除的星星使用负数表示
        type: 'penalty',
        source: 'task'
      });
    });
    
    // 按时间戳排序，最新的在前面
    records.sort((a, b) => b.timestamp - a.timestamp);
    
    logger.info('analyticsManager', `获取到${records.length}条任务星星记录（${completedTasks.length}条获得，${penaltyTasks.length}条扣除）`);
    
    // 如果提供了回调函数，通过回调返回结果
    if (typeof callback === 'function') {
      callback(records);
    }
    
    return records;
  },
  
  /**
   * 按日期分组星星记录
   * @param {Array} records 星星记录数组
   * @returns {Object} 按日期分组的记录对象
   */
  groupRecordsByDate: function(records) {
    logger.info('analyticsManager', `开始按日期分组${records.length}条星星记录`);
    
    const result = {};
    
    records.forEach(record => {
      if (!record.timestamp) return;
      
      const date = new Date(record.timestamp);
      const dateString = dateUtils.formatDate(date);
      
      if (!result[dateString]) {
        result[dateString] = [];
      }
      
      result[dateString].push(record);
    });
    
    const dateCount = Object.keys(result).length;
    logger.info('analyticsManager', `分组完成，共${dateCount}个日期`);
    
    return result;
  },
  
  /**
   * 获取所有星星记录（包括获取、消费和过期）
   * @param {Function} callback 回调函数，参数为记录数组
   */
  getAllStarRecords: async function(callback) {
    try {
      logger.info('analyticsManager', '从星星服务获取所有星星记录');
      // 获取服务实例
      const starService = serviceManager.getService('starService');
      
      if (!starService) {
        logger.error('analyticsManager', '无法获取星星服务实例');
        if (typeof callback === 'function') {
          callback([]);
        }
        return;
      }
      
      // 从新架构获取星星记录
      const records = await starService.getStarRecords();
      
      logger.info('analyticsManager', `从starService获取到${records.length}条星星记录`);
      if (typeof callback === 'function') {
        callback(records);
      }
    } catch (error) {
      logger.error('analyticsManager', '获取星星记录出错', error);
      if (typeof callback === 'function') {
        callback([]);
      }
    }
  },
  
  /**
   * 计算日期范围，确保生成合适的历史日期范围
   * @param {Number} days 天数
   * @returns {Object} 包含开始日期、结束日期和格式化日期数组的对象
   * @private
   */
  _calculateDateRange: function(days) {
    logger.info('analyticsManager', `计算${days}天的日期范围`);
    
    // 计算日期范围，确保是过去的days天，而不是将来的
    const endDate = new Date(); // 今天
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days + 1); // 往前推 days-1 天
    startDate.setHours(0, 0, 0, 0); // 设置为当天开始
    
    logger.info('analyticsManager', `日期范围: ${dateUtils.formatDate(startDate)} 至 ${dateUtils.formatDate(endDate)}`);
    
    // 生成日期序列
    const dateArray = [];
    const formattedDates = [];
    
    // 初始化每一天的日期
    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      const dateStr = dateUtils.formatDate(currentDate);
      dateArray.push(dateStr);
      
      // 格式化为MM/DD格式显示
      const month = currentDate.getMonth() + 1;
      const day = currentDate.getDate();
      formattedDates.push(`${month}/${day}`);
    }
    
    return {
      startDate,
      endDate,
      dateArray,
      formattedDates
    };
  },
  
  /**
   * 计算历史每日可用星星余额
   * @param {Number} days 历史天数（7或30）
   * @param {Function} callback 回调函数，参数为历史余额数据
   */
  calculateHistoricalBalance: function(days, callback) {
    logger.info('analyticsManager', `计算最近${days}天的可用星星余额`);
    
    // 获取所有星星记录
    this.getAllStarRecords((records) => {
      if (!records || records.length === 0) {
        logger.warn('analyticsManager', '没有星星记录，返回空数据');
        if (typeof callback === 'function') {
          callback({
            historyData: [],
            forecastData: []
          });
        }
        return;
      }
      
      // 计算历史余额数据
      const historyData = this._calculateDailyBalance(records, days);
      
      // 获取当前余额，用于预测（改进：确保使用最后一天的余额作为起点）
      const currentBalance = historyData.length > 0 ? historyData[historyData.length - 1].value : 0;
      
      // 计算预测数据
      const forecastData = this._calculateExpiryForecast(currentBalance);
      
      logger.info('analyticsManager', `余额计算完成，历史数据: ${historyData.length}项，预测数据: ${forecastData.length}项`);
      
      if (typeof callback === 'function') {
        callback({
          historyData,
          forecastData
        });
      }
    });
  },
  
  /**
   * 计算每日余额数据
   * @param {Array} records 星星记录
   * @param {Number} days 天数
   * @returns {Array} 每日余额数据
   * @private
   */
  _calculateDailyBalance: function(records, days) {
    logger.info('analyticsManager', `计算${days}天的每日余额`);
    
    // 使用改进的日期范围计算函数
    const { dateArray, formattedDates } = this._calculateDateRange(days);
    
    // 对记录按时间排序（从早到晚）
    records.sort((a, b) => a.timestamp - b.timestamp);
    
    // 计算每天截止时的余额
    const result = [];
    let runningBalance = 0;
    
    dateArray.forEach((dateStr, index) => {
      // 筛选当天及之前的所有记录
      const relevantRecords = records.filter(record => {
        const recordDate = dateUtils.formatDate(new Date(record.timestamp));
        return recordDate <= dateStr;
      });
      
      // 计算各类型星星总数 - 确保所有计算都使用数字类型
      const earned = relevantRecords.filter(r => r.type === 'income')
        .reduce((sum, r) => Number(sum) + Number(r.points || 0), 0);
      
      const spent = relevantRecords.filter(r => r.type === 'expense')
        .reduce((sum, r) => Number(sum) + Math.abs(Number(r.points || 0)), 0);
      
      const penalty = relevantRecords.filter(r => r.type === 'penalty')
        .reduce((sum, r) => Number(sum) + Math.abs(Number(r.points || 0)), 0);
      
      // 记录计算前的变量类型与值，帮助调试
      logger.debug('analyticsManager', `${dateStr} 计算数据: earned=${earned}(${typeof earned}), spent=${spent}(${typeof spent}), penalty=${penalty}(${typeof penalty})`);
      
      // 计算当日余额 - 显式使用Number转换确保结果是数字
      const balance = Math.max(0, Number(earned) - Number(spent) - Number(penalty));
      runningBalance = Number(balance); // 确保运行余额也是数字类型
      
      logger.debug('analyticsManager', `${dateStr} 计算结果: balance=${balance}(${typeof balance})`);
      
      // 添加到结果
      result.push({
        date: formattedDates[index],
        value: Number(balance), // 确保值是数字类型
        earned: Number(earned),
        spent: Number(spent),
        penalty: Number(penalty)
      });
      
      logger.debug('analyticsManager', `${dateStr} (${formattedDates[index]}) 余额: ${balance}`);
    });
    
    logger.info('analyticsManager', `余额计算完成，共${result.length}天的数据`);
    
    return result;
  },
  
  /**
   * 计算星星过期预测
   * @param {Number} currentBalance 当前星星余额
   * @returns {Array} 预测数据
   * @private
   */
  _calculateExpiryForecast: async function(currentBalance) {
    logger.info('analyticsManager', `计算星星过期预测，当前余额: ${currentBalance}`);
    
    try {
      // 确保当前余额是数字类型
      currentBalance = Number(currentBalance);
      
      // 获取星星服务
      const starService = serviceManager.getService('starService');
      
      if (!starService) {
        logger.error('analyticsManager', '无法获取星星服务实例');
        return [];
      }
      
      // 获取星星分组数据
      const starGroups = await starService.getStarGroups();
      
      // 筛选出非永久有效的分组
      const expiryGroups = starGroups.filter(group => 
        group.expiryDate !== 'permanent' && 
        typeof group.expiryDate === 'number'
      );
      
      logger.info('analyticsManager', `获取到${expiryGroups.length}个有过期时间的星星分组`);
      
      // 如果没有即将过期的星星，只需要预测近7天
      const forecastDays = expiryGroups.length > 0 ? 30 : 7;
      
      // 如果有过期数据，找出最远的过期日期
      let maxExpiryDate = new Date();
      maxExpiryDate.setDate(maxExpiryDate.getDate() + 7); // 默认预测7天
      
      if (expiryGroups.length > 0) {
        // 按过期时间排序
        expiryGroups.sort((a, b) => a.expiryDate - b.expiryDate);
        
        const lastExpiryDate = new Date(expiryGroups[expiryGroups.length - 1].expiryDate);
        // 给最后过期日再加3天的缓冲，让图表显示过期后的余额状态
        lastExpiryDate.setDate(lastExpiryDate.getDate() + 3);
        
        if (lastExpiryDate > maxExpiryDate) {
          maxExpiryDate = lastExpiryDate;
          logger.info('analyticsManager', `根据过期数据调整预测时长至 ${dateUtils.formatDate(maxExpiryDate)}`);
        }
      }
      
      const result = [];
      let runningBalance = Number(currentBalance);
      const today = new Date();
      
      // 设置时间为当天23:59:59，确保包含当天所有变化
      today.setHours(23, 59, 59, 999);
      
      logger.debug('analyticsManager', `预测开始日期: ${dateUtils.formatDate(today)}, 初始余额: ${runningBalance}(${typeof runningBalance})`);
      
      // 计算预测天数（从今天到最远过期日的天数）
      const maxDays = Math.min(
        30, // 最多30天
        Math.ceil((maxExpiryDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)) + 1
      );
      
      logger.info('analyticsManager', `预测天数: ${maxDays}天`);
      
      // 生成预测的日期序列
      for (let i = 0; i < maxDays; i++) {
        const forecastDate = new Date(today);
        forecastDate.setDate(today.getDate() + i);
        const dateStr = dateUtils.formatDate(forecastDate);
        
        // 查找当天过期的星星分组
        const todayExpiring = expiryGroups.filter(group => 
          dateUtils.formatDate(new Date(group.expiryDate)) === dateStr
        );
        
        // 计算过期总数 - 确保使用数字计算
        const expiryAmount = todayExpiring.reduce((sum, group) => 
          Number(sum) + Number(group.points || 0), 0
        );
        
        // 更新余额 - 确保使用数字计算
        if (expiryAmount > 0) {
          const oldBalance = Number(runningBalance);
          runningBalance = Math.max(0, Number(runningBalance) - Number(expiryAmount));
          logger.info('analyticsManager', `${dateStr} 将过期 ${expiryAmount} 颗星星, 余额从 ${oldBalance} 变为 ${runningBalance}`);
          
          // 记录过期的分组信息
          todayExpiring.forEach(group => {
            logger.debug('analyticsManager', `  - 过期时间"${group.expiryDateStr}"的${Number(group.points)}颗星星将过期`);
          });
        }
        
        // 格式化日期为显示格式
        const displayDate = new Date(forecastDate);
        const month = displayDate.getMonth() + 1;
        const day = displayDate.getDate();
        const formattedDate = `${month}/${day}`;
        
        // 记录数据点 - 确保值是数字类型
        result.push({
          date: formattedDate,
          value: Number(runningBalance),
          expiring: expiryAmount > 0 ? Number(expiryAmount) : undefined
        });
        
        logger.debug('analyticsManager', `预测日期: ${formattedDate}, 余额: ${runningBalance}(${typeof runningBalance})${expiryAmount > 0 ? `, 过期: ${expiryAmount}(${typeof expiryAmount})` : ''}`);
      }
      
      logger.info('analyticsManager', `过期预测完成，共${result.length}天的数据，开始余额: ${currentBalance}，结束余额: ${result[result.length-1].value}`);
      
      return result;
    } catch (error) {
      logger.error('analyticsManager', '计算星星过期预测出错', error);
      return [];
    }
  },
  
  /**
   * 获取即将过期的星星信息（基于星星分组数据）
   * @param {Number} days 未来天数
   * @returns {Array} 过期星星数据
   * @private
   */
  _getUpcomingExpiryStars: async function(days) {
    logger.info('analyticsManager', `获取${days}天内即将过期的星星信息`);
    
    try {
      // 获取星星服务
      const starService = serviceManager.getService('starService');
      
      if (!starService) {
        logger.error('analyticsManager', '无法获取星星服务实例');
        return [];
      }
      
      // 获取星星分组数据
      const starGroups = await starService.getStarGroups();
      
      // 筛选出非永久有效的分组
      const expiryGroups = starGroups.filter(group => 
        group.expiryDate !== 'permanent' && 
        typeof group.expiryDate === 'number'
      );
      
      const expiryData = [];
      const now = new Date();
      const futureLimit = new Date();
      futureLimit.setDate(now.getDate() + days);
      
      // 筛选未来指定天数内会过期的星星分组
      expiryGroups.forEach(group => {
        const expiryDate = new Date(group.expiryDate);
        
        if (expiryDate > now && expiryDate <= futureLimit) {
          expiryData.push({
            id: `expiry_group_${expiryDate.getTime()}`,
            points: group.points,
            expiryDate: expiryDate,
            expiryDateStr: group.expiryDateStr,
            sources: group.sources
          });
          
          logger.info('analyticsManager', `${group.points}颗星星将于${dateUtils.formatDate(expiryDate)}(${group.expiryDateStr})过期`);
        }
      });
      
      // 按过期日期排序
      expiryData.sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());
      
      logger.info('analyticsManager', `获取到${expiryData.length}组即将过期的星星数据`);
      return expiryData;
    } catch (error) {
      logger.error('analyticsManager', '获取即将过期星星信息出错', error);
      return [];
    }
  },
  
  /**
   * 计算任务完成情况统计数据
   * 后续可添加更多分析功能
   */
  getTaskCompletionStats: function(dateRange, callback) {
    // 这里将来可以实现任务完成率分析功能
    // 暂时返回空对象
    return {};
  },
  
  /**
   * 获取星星分组情况
   * @param {Function} callback 回调函数，参数为分组数据
   */
  getStarGroups: async function(callback) {
    try {
      logger.info('analyticsManager', '获取星星分组情况');
      
      // 获取星星服务
      const starService = serviceManager.getService('starService');
      
      if (!starService) {
        logger.error('analyticsManager', '无法获取星星服务实例');
        if (typeof callback === 'function') {
          callback([]);
        }
        return [];
      }
      
      // 从新架构服务获取星星分组
      const starGroups = await starService.getStarGroups();
      
      logger.info('analyticsManager', `获取到${starGroups.length}个星星分组`);
      
      if (typeof callback === 'function') {
        callback(starGroups);
      }
      
      return starGroups;
    } catch (error) {
      logger.error('analyticsManager', '获取星星分组出错', error);
      if (typeof callback === 'function') {
        callback([]);
      }
      return [];
    }
  },
  
  /**
   * 获取星星有效期数据，用于预测过期趋势
   * @param {Number} days 预测天数
   * @param {Function} callback 回调函数，参数为有效期数据
   */
  getStarExpiryForecast: async function(days, callback) {
    try {
      logger.info('analyticsManager', `获取未来${days}天的星星过期预测`);
      
      // 获取星星服务
      const starService = serviceManager.getService('starService');
      
      if (!starService) {
        logger.error('analyticsManager', '无法获取星星服务实例');
        if (typeof callback === 'function') {
          callback([]);
        }
        return [];
      }
      
      // 从新架构服务获取星星分组
      const starGroups = await starService.getStarGroups();
      
      logger.info('analyticsManager', `获取到${starGroups.length}个星星分组`);
      
      // 计算未来每天将过期的星星数量
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const expiryForecast = [];
      
      // 生成未来days天的日期序列
      for (let i = 0; i < days; i++) {
        const forecastDate = new Date(today);
        forecastDate.setDate(today.getDate() + i);
        
        // 计算这一天将过期的星星数量
        let expiryCount = 0;
        
        starGroups.forEach(group => {
          if (group.expiry === 'permanent') return;
          
          const expiryDate = new Date(group.expiry);
          expiryDate.setHours(0, 0, 0, 0);
          
          if (expiryDate.getTime() === forecastDate.getTime()) {
            expiryCount += group.stars;
          }
        });
        
        expiryForecast.push({
          date: dateUtils.formatDate(forecastDate),
          count: expiryCount,
          dateObj: forecastDate
        });
      }
      
      logger.info('analyticsManager', `生成了${expiryForecast.length}天的星星过期预测`);
      
      if (typeof callback === 'function') {
        callback(expiryForecast);
      }
      
      return expiryForecast;
    } catch (error) {
      logger.error('analyticsManager', '获取星星过期预测出错', error);
      if (typeof callback === 'function') {
        callback([]);
      }
      return [];
    }
  }
};

module.exports = analyticsManager; 