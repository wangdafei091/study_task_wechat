/**
 * formatUtils.js - 格式化工具函数
 * 
 * 提供各种数据格式化函数，用于UI显示等
 */

const logger = require('./logger');

/**
 * 格式化星星数量
 * @param {Number} points 要格式化的星星数量
 * @param {Boolean} useThousandSeparator 是否使用千位分隔符
 * @returns {String} 格式化后的星星数量字符串
 */
function formatPoints(points, useThousandSeparator = false) {
  // 确保输入为数字
  const numPoints = parseInt(points, 10) || 0;
  
  logger.info('formatUtils', `格式化星星数量: ${points}, 使用千位分隔符: ${useThousandSeparator}`);
  
  if (useThousandSeparator) {
    // 添加千位分隔符
    return numPoints.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  
  // 普通格式化，直接返回字符串
  return numPoints.toString();
}

/**
 * 格式化日期时间
 * @param {Date|Number|String} date 日期对象、时间戳或日期字符串
 * @param {String} format 格式化模式，默认为'YYYY-MM-DD'
 * @returns {String} 格式化后的日期字符串
 */
function formatDateTime(date, format = 'YYYY-MM-DD') {
  try {
    // 转换输入为Date对象
    if (!(date instanceof Date)) {
      if (typeof date === 'string' && !isNaN(Date.parse(date))) {
        date = new Date(date);
      } else if (typeof date === 'number') {
        date = new Date(date);
      } else {
        logger.warn('formatUtils', `无效的日期格式: ${date}`);
        return '';
      }
    }
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    // 根据格式模式返回结果
    switch (format.toUpperCase()) {
      case 'YYYY-MM-DD':
        return `${year}-${month}-${day}`;
      case 'YYYY/MM/DD':
        return `${year}/${month}/${day}`;
      case 'MM-DD':
        return `${month}-${day}`;
      case 'MM/DD':
        return `${month}/${day}`;
      case 'YYYY-MM-DD HH:MM':
        return `${year}-${month}-${day} ${hours}:${minutes}`;
      case 'YYYY-MM-DD HH:MM:SS':
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      case 'HH:MM':
        return `${hours}:${minutes}`;
      case 'HH:MM:SS':
        return `${hours}:${minutes}:${seconds}`;
      case 'FRIENDLY':
        // 相对于当前日期的友好展示
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (date.getTime() >= today.getTime()) {
          return `今天 ${hours}:${minutes}`;
        } else if (date.getTime() >= yesterday.getTime()) {
          return `昨天 ${hours}:${minutes}`;
        } else {
          return `${month}-${day} ${hours}:${minutes}`;
        }
      default:
        return `${year}-${month}-${day}`;
    }
  } catch (error) {
    logger.error('formatUtils', '格式化日期时间出错', error);
    return '';
  }
}

module.exports = {
  formatPoints,
  formatDateTime
}; 