/**
 * formatUtils.js - 格式化工具函数
 *
 * 提供数据格式化函数，用于UI显示等
 *
 * 注意：日期格式化功能请使用 dateUtils.js 中的方法：
 * - dateUtils.formatDate(date) - YYYY-MM-DD 格式
 * - dateUtils.formatTime(date) - HH:MM 格式
 * - dateUtils.formatDateFriendly(date) - 友好格式（今天/昨天/日期）
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
 * 将任务时间统一格式化为 HH:mm 展示，避免秒级噪音进入 UI。
 * @param {String} time 时间字符串，兼容 HH:mm / HH:mm:ss
 * @returns {String} 格式化后的时间字符串
 */
function formatDisplayTime(time) {
  const value = String(time || '').trim();
  if (!value) {
    return '';
  }

  const matched = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!matched) {
    return value;
  }

  const hours = matched[1].padStart(2, '0');
  const minutes = matched[2];
  return `${hours}:${minutes}`;
}

module.exports = {
  formatPoints,
  formatDisplayTime
};
