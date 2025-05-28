/**
 * analytics-service.js - 分析服务
 * 
 * 提供数据分析相关功能，包括星星记录分析、任务完成情况统计等
 */

const logger = require('../../utils/logger.js');
const dateUtils = require('../../utils/dateUtils.js');
const EventBus = require('../../utils/core/event-bus');
const { EVENTS } = require('../../utils/constants.js');

class AnalyticsService {
  /**
   * 构造函数
   * @param {Object} options 选项
   * @param {StarService} options.starService 星星服务
   * @param {TaskService} options.taskService 任务服务
   * @param {EventBus} options.eventBus 事件总线
   */
  constructor(options = {}) {
    // 关联服务
    this.starService = options.starService;
    this.taskService = options.taskService;
    
    // 事件总线
    this.eventBus = options.eventBus || new EventBus();
    
    logger.info('AnalyticsService', '初始化分析服务');
  }

  /**
   * 获取任务星星日历数据
   * 只获取任务完成获得的星星和未完成必做任务扣除的星星
   * @returns {Promise<Array>} 记录数组
   */
  async getTaskStarCalendarData() {
    logger.info('AnalyticsService', `开始获取任务星星日历数据`);
    
    try {
      // 使用taskService获取任务数据
      const tasks = await this.taskService.getAllTasks();
      
      const records = [];
      
      // 获取已完成任务记录中的星星获取记录
      const completedTasks = tasks.filter(task => 
        task.isCompleted() && task.starAwarded === true
      );
      
      logger.info('AnalyticsService', `从${completedTasks.length}个已完成任务中获取星星记录`);
      
      // 将任务完成记录转换为星星记录
      completedTasks.forEach(task => {
        const timestamp = task.completionTime || task.modifyTime || Date.now();
        
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
      
      logger.info('AnalyticsService', `从${penaltyTasks.length}个未完成必做任务中获取星星扣除记录`);
      
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
      
      logger.info('AnalyticsService', `获取到${records.length}条任务星星记录（${completedTasks.length}条获得，${penaltyTasks.length}条扣除）`);
      
      return records;
    } catch (error) {
      logger.error('AnalyticsService', '获取任务星星日历数据失败', error);
      return [];
    }
  }
  
  /**
   * 按日期分组星星记录
   * @param {Array} records 星星记录数组
   * @returns {Object} 按日期分组的记录对象
   */
  groupRecordsByDate(records) {
    logger.info('AnalyticsService', `开始按日期分组${records.length}条星星记录`);
    
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
    logger.info('AnalyticsService', `分组完成，共${dateCount}个日期`);
    
    return result;
  }
  
  /**
   * 获取所有星星记录（包括获取、消费和过期）
   * @returns {Promise<Array>} 星星记录数组
   */
  async getAllStarRecords() {
    try {
      logger.info('AnalyticsService', '获取所有星星记录');
      
      if (!this.starService) {
        logger.error('AnalyticsService', '无法获取星星服务实例');
        return [];
      }
      
      // 从星星服务获取记录
      const records = await this.starService.getStarRecords();
      
      logger.info('AnalyticsService', `获取到${records.length}条星星记录`);
      return records;
    } catch (error) {
      logger.error('AnalyticsService', '获取星星记录出错', error);
      return [];
    }
  }
  
  /**
   * 计算日期范围，确保生成合适的历史日期范围
   * @param {Number} days 天数
   * @returns {Object} 包含开始日期、结束日期和格式化日期数组的对象
   * @private
   */
  _calculateDateRange(days) {
    logger.info('AnalyticsService', `计算${days}天的日期范围`);
    
    // 计算日期范围，确保是过去的days天，而不是将来的
    const endDate = new Date(); // 今天
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days + 1); // 往前推 days-1 天
    startDate.setHours(0, 0, 0, 0); // 设置为当天开始
    
    logger.info('AnalyticsService', `日期范围: ${dateUtils.formatDate(startDate)} 至 ${dateUtils.formatDate(endDate)}`);
    
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
  }
  
  /**
   * 计算历史每日可用星星余额
   * @param {Number} days 历史天数（7或30）
   * @returns {Promise<Object>} 历史余额数据和预测数据
   */
  async calculateHistoricalBalance(days) {
    logger.info('AnalyticsService', `计算最近${days}天的可用星星余额`);
    
    try {
      // 获取所有星星记录
      const records = await this.getAllStarRecords();
      
      if (!records || records.length === 0) {
        logger.warn('AnalyticsService', '没有星星记录，返回空数据');
        return {
          historyData: [],
          forecastData: []
        };
      }
      
      // 计算历史余额数据
      const historyData = this._calculateDailyBalance(records, days);
      
      // 获取当前余额，用于预测
      const currentBalance = historyData.length > 0 ? historyData[historyData.length - 1].value : 0;
      
      // 计算预测数据
      const forecastData = await this._calculateExpiryForecast(currentBalance);
      
      logger.info('AnalyticsService', `余额计算完成，历史数据: ${historyData.length}项，预测数据: ${forecastData.length}项`);
      
      return {
        historyData,
        forecastData
      };
    } catch (error) {
      logger.error('AnalyticsService', '计算历史余额出错', error);
      return {
        historyData: [],
        forecastData: []
      };
    }
  }
  
  /**
   * 计算每日余额变化
   * @param {Array} records 星星记录数组
   * @param {Number} days 历史天数
   * @returns {Array} 每日余额数据
   * @private
   */
  _calculateDailyBalance(records, days) {
    logger.info('AnalyticsService', `计算${days}天的每日余额变化`);
    
    // 计算日期范围
    const { dateArray, formattedDates } = this._calculateDateRange(days);
    
    // 按日期计算余额变化
    const result = [];
    let runningBalance = 0;
    
    dateArray.forEach((dateStr, index) => {
      // 筛选当天及之前的所有记录
      const relevantRecords = records.filter(record => {
        if (!record.timestamp) return false;
        const recordDate = new Date(record.timestamp);
        const recordDateStr = dateUtils.formatDate(recordDate);
        return recordDateStr <= dateStr;
      });
      
      // 计算余额
      let earned = 0;
      let spent = 0;
      let penalty = 0;
      
      relevantRecords.forEach(record => {
        const points = Number(record.points || 0);
        
        if (points > 0) {
          earned += points;
        } else if (points < 0) {
          if (record.type === 'penalty') {
            penalty += Math.abs(points);
          } else {
            spent += Math.abs(points);
          }
        }
      });
      
      // 计算当前总余额 = 收入 - 支出 - 惩罚
      const balance = earned - spent - penalty;
      
      // 添加到结果
      result.push({
        date: formattedDates[index],
        value: Number(balance), // 确保值是数字类型
        earned: Number(earned),
        spent: Number(spent),
        penalty: Number(penalty)
      });
      
      logger.debug('AnalyticsService', `${dateStr} (${formattedDates[index]}) 余额: ${balance}`);
    });
    
    logger.info('AnalyticsService', `余额计算完成，共${result.length}天的数据`);
    
    return result;
  }
  
  /**
   * 计算星星过期预测
   * @param {Number} currentBalance 当前星星余额
   * @returns {Promise<Array>} 预测数据
   * @private
   */
  async _calculateExpiryForecast(currentBalance) {
    logger.info('AnalyticsService', `计算星星过期预测，当前余额: ${currentBalance}`);
    
    try {
      // 确保当前余额是数字类型
      currentBalance = Number(currentBalance);
      
      if (!this.starService) {
        logger.error('AnalyticsService', '无法获取星星服务实例');
        return [];
      }
      
      // 获取星星分组数据
      const starGroups = await this.starService.getStarGroups();
      logger.info('AnalyticsService', `获取到${starGroups.length}个星星分组`);
      
      // 筛选出非永久有效的分组
      const expiryGroups = starGroups.filter(group => 
        group.expiryType !== 'permanent' && 
        group.expiryDate
      );
      
      logger.info('AnalyticsService', `获取到${expiryGroups.length}个有过期时间的星星分组`);
      
      // 记录每个过期分组的详细信息
      expiryGroups.forEach((group, index) => {
        logger.info('AnalyticsService', `过期分组${index + 1}: ID=${group.id}, 星星数=${group.stars}, 过期类型=${group.expiryType}, 过期日期=${group.expiryDate}`);
      });
      
      // 如果没有即将过期的星星，只需要预测近7天
      const forecastDays = expiryGroups.length > 0 ? 30 : 7;
      
      // 如果有过期数据，找出最远的过期日期
      let maxExpiryDate = new Date();
      maxExpiryDate.setDate(maxExpiryDate.getDate() + 7); // 默认预测7天
      
      if (expiryGroups.length > 0) {
        // 按过期时间排序
        expiryGroups.sort((a, b) => {
          const dateA = new Date(a.expiryDate);
          const dateB = new Date(b.expiryDate);
          return dateA.getTime() - dateB.getTime();
        });
        
        const lastExpiryDate = new Date(expiryGroups[expiryGroups.length - 1].expiryDate);
        // 给最后过期日再加3天的缓冲，让图表显示过期后的余额状态
        lastExpiryDate.setDate(lastExpiryDate.getDate() + 3);
        
        if (lastExpiryDate > maxExpiryDate) {
          maxExpiryDate = lastExpiryDate;
          logger.info('AnalyticsService', `根据过期数据调整预测时长至 ${dateUtils.formatDate(maxExpiryDate)}`);
        }
      }
      
      const result = [];
      let runningBalance = Number(currentBalance);
      const today = new Date();
      
      // 设置时间为当天23:59:59，确保包含当天所有变化
      today.setHours(23, 59, 59, 999);
      
      logger.debug('AnalyticsService', `预测开始日期: ${dateUtils.formatDate(today)}, 初始余额: ${runningBalance}`);
      
      // 计算预测天数（从今天到最远过期日的天数）
      const maxDays = Math.min(
        30, // 最多30天
        Math.ceil((maxExpiryDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)) + 1
      );
      
      logger.info('AnalyticsService', `预测天数: ${maxDays}天`);
      
      // 生成预测的日期序列
      for (let i = 0; i < maxDays; i++) {
        const forecastDate = new Date(today);
        forecastDate.setDate(today.getDate() + i);
        const dateStr = dateUtils.formatDate(forecastDate);
        
        // 查找当天过期的星星分组
        const todayExpiring = expiryGroups.filter(group => {
          const expiryDate = new Date(group.expiryDate);
          return dateUtils.formatDate(expiryDate) === dateStr;
        });
        
        // 计算过期总数 - 确保使用数字计算
        const expiryAmount = todayExpiring.reduce((sum, group) => 
          Number(sum) + Number(group.stars || 0), 0
        );
        
        // 更新余额 - 确保使用数字计算
        if (expiryAmount > 0) {
          const oldBalance = Number(runningBalance);
          runningBalance = Math.max(0, Number(runningBalance) - Number(expiryAmount));
          logger.info('AnalyticsService', `${dateStr} 将过期 ${expiryAmount} 颗星星, 余额从 ${oldBalance} 变为 ${runningBalance}`);
        }
        
        // 格式化日期为显示格式
        const displayDate = new Date(forecastDate);
        const month = displayDate.getMonth() + 1;
        const day = displayDate.getDate();
        const formattedDate = `${month}/${day}`;
        
        // 添加到结果
        result.push({
          date: formattedDate,
          value: runningBalance,
          expiring: expiryAmount || 0
        });
      }
      
      logger.info('AnalyticsService', `预测数据生成完成，共${result.length}天的数据`);
      return result;
    } catch (error) {
      logger.error('AnalyticsService', '计算星星过期预测出错', error);
      return [];
    }
  }
  
  /**
   * 获取即将过期的星星信息
   * @param {Number} days 未来天数
   * @returns {Promise<Array>} 过期星星数据
   */
  async getUpcomingExpiryStars(days) {
    logger.info('AnalyticsService', `获取${days}天内即将过期的星星信息`);
    
    try {
      if (!this.starService) {
        logger.error('AnalyticsService', '无法获取星星服务实例');
        return [];
      }
      
      // 获取星星分组数据
      const starGroups = await this.starService.getStarGroups();
      
      // 筛选出非永久有效的分组
      const expiryGroups = starGroups.filter(group => 
        group.expiryType !== 'permanent' && 
        group.expiryDate
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
            points: group.stars,
            expiryDate: expiryDate,
            expiryDateStr: group.name || dateUtils.formatDate(expiryDate),
            type: group.type
          });
          
          logger.info('AnalyticsService', `${group.stars}颗星星将于${dateUtils.formatDate(expiryDate)}过期`);
        }
      });
      
      // 按过期日期排序
      expiryData.sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());
      
      logger.info('AnalyticsService', `获取到${expiryData.length}组即将过期的星星数据`);
      return expiryData;
    } catch (error) {
      logger.error('AnalyticsService', '获取即将过期星星信息出错', error);
      return [];
    }
  }
  
  /**
   * 获取任务完成情况统计数据
   * @param {String} dateRange 日期范围
   * @returns {Promise<Object>} 统计数据
   */
  async getTaskCompletionStats(dateRange) {
    logger.info('AnalyticsService', `获取任务完成情况统计数据，日期范围: ${dateRange}`);
    
    try {
      if (!this.taskService) {
        logger.error('AnalyticsService', '无法获取任务服务实例');
        return {};
      }
      
      // 获取所有任务
      const tasks = await this.taskService.getAllTasks();
      
      // 根据日期范围筛选任务
      let filteredTasks = tasks;
      
      if (dateRange === 'today') {
        const today = dateUtils.formatDate(new Date());
        filteredTasks = tasks.filter(task => task.date === today);
      } else if (dateRange === 'week') {
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay()); // 获取本周日
        weekStart.setHours(0, 0, 0, 0);
        
        filteredTasks = tasks.filter(task => {
          const taskDate = new Date(task.date);
          return taskDate >= weekStart;
        });
      } else if (dateRange === 'month') {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        
        filteredTasks = tasks.filter(task => {
          const taskDate = new Date(task.date);
          return taskDate >= monthStart;
        });
      }
      
      // 计算统计数据
      const totalTasks = filteredTasks.length;
      const completedTasks = filteredTasks.filter(task => task.isCompleted()).length;
      const completionRate = totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(1) : 0;
      
      // 按类型统计
      const typeCounts = {
        study: filteredTasks.filter(task => task.type === 'study').length,
        habit: filteredTasks.filter(task => task.type === 'habit').length,
        interest: filteredTasks.filter(task => task.type === 'interest').length
      };
      
      // 按状态统计
      const statusCounts = {
        pending: filteredTasks.filter(task => !task.isCompleted()).length,
        completed: completedTasks
      };
      
      const result = {
        totalTasks,
        completedTasks,
        completionRate,
        typeCounts,
        statusCounts
      };
      
      logger.info('AnalyticsService', `统计完成: 总任务数=${totalTasks}, 完成数=${completedTasks}, 完成率=${completionRate}%`);
      
      return result;
    } catch (error) {
      logger.error('AnalyticsService', '获取任务完成情况统计数据出错', error);
      return {};
    }
  }
}

module.exports = AnalyticsService; 