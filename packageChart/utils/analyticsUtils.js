/**
 * analyticsUtils.js - 分析工具函数
 * 
 * 提供纯粹的分析相关工具函数，不包含业务逻辑
 */

const dateUtils = require('../../utils/dateUtils');
const logger = require('../../utils/logger');

const analyticsUtils = {
  /**
   * 格式化日期为显示格式（月/日）
   * @param {Date|String|Number} date 日期对象、日期字符串或时间戳
   * @returns {String} 格式化后的日期字符串 (MM/DD)
   */
  formatDateForDisplay: function(date) {
    try {
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        return '';
      }
      const month = dateObj.getMonth() + 1;
      const day = dateObj.getDate();
      return `${month}/${day}`;
    } catch (error) {
      logger.error('analyticsUtils', '格式化日期出错', error);
      return '';
    }
  },
  
  /**
   * 计算日期范围
   * @param {Number} days 天数
   * @param {Date} endDate 结束日期，默认为今天
   * @returns {Object} 日期范围对象
   */
  calculateDateRange: function(days, endDate = new Date()) {
    // 计算日期范围
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);
    
    // 生成日期序列
    const dateArray = [];
    const formattedDates = [];
    
    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      const dateStr = dateUtils.formatDate(currentDate);
      dateArray.push(dateStr);
      
      formattedDates.push(this.formatDateForDisplay(currentDate));
    }
    
    return {
      startDate,
      endDate,
      dateArray,
      formattedDates
    };
  },
  
  /**
   * 将时间戳转换为格式化的时间字符串
   * @param {Number} timestamp 时间戳
   * @returns {String} 格式化的时间字符串 (YYYY-MM-DD HH:MM:SS)
   */
  formatTimestamp: function(timestamp) {
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return '';
      }
      
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
      logger.error('analyticsUtils', '格式化时间戳出错', error);
      return '';
    }
  },
  
  /**
   * 获取时间范围描述
   * @param {String} rangeType 范围类型 (today, week, month, year)
   * @returns {String} 范围描述
   */
  getTimeRangeDescription: function(rangeType) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    
    switch (rangeType) {
      case 'today':
        return `${year}年${month}月${day}日`;
      case 'week':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        return `${weekStart.getFullYear()}年${weekStart.getMonth() + 1}月${weekStart.getDate()}日 - ${weekEnd.getFullYear()}年${weekEnd.getMonth() + 1}月${weekEnd.getDate()}日`;
      case 'month':
        return `${year}年${month}月`;
      case 'year':
        return `${year}年`;
      default:
        return '未知时间范围';
    }
  },
  
  /**
   * 计算完成率百分比
   * @param {Number} completed 已完成数量
   * @param {Number} total 总数量
   * @returns {String} 格式化的完成率百分比，保留1位小数
   */
  calculateCompletionRate: function(completed, total) {
    if (total <= 0) return '0.0';
    const rate = (completed / total) * 100;
    return rate.toFixed(1);
  },
  
  /**
   * 获取相对时间描述
   * @param {Number} timestamp 时间戳
   * @returns {String} 相对时间描述
   */
  getRelativeTimeDescription: function(timestamp) {
    try {
      const now = Date.now();
      const diff = now - timestamp;
      
      // 小于1分钟
      if (diff < 60 * 1000) {
        return '刚刚';
      }
      
      // 小于1小时
      if (diff < 60 * 60 * 1000) {
        const minutes = Math.floor(diff / (60 * 1000));
        return `${minutes}分钟前`;
      }
      
      // 小于1天
      if (diff < 24 * 60 * 60 * 1000) {
        const hours = Math.floor(diff / (60 * 60 * 1000));
        return `${hours}小时前`;
      }
      
      // 小于1周
      if (diff < 7 * 24 * 60 * 60 * 1000) {
        const days = Math.floor(diff / (24 * 60 * 60 * 1000));
        return `${days}天前`;
      }
      
      // 大于1周，返回具体日期
      return this.formatTimestamp(timestamp).substring(0, 10);
    } catch (error) {
      logger.error('analyticsUtils', '计算相对时间描述出错', error);
      return '';
    }
  }
};

module.exports = analyticsUtils; 