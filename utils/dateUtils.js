/**
 * dateUtils.js - 日期处理工具类
 * 
 * 提供日期相关的通用方法，如格式化日期、日期计算等
 */

const logger = require('./logger');

/**
 * 获取当天日期字符串
 * @returns {String} 格式为YYYY-MM-DD的日期字符串
 */
const getTodayString = function() {
  const today = new Date();
  return formatDate(today);
};

/**
 * 获取明天日期字符串
 * @returns {String} 格式为YYYY-MM-DD的日期字符串
 */
const getTomorrowString = function() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return formatDate(tomorrow);
};

/**
 * 获取昨天日期字符串
 * @returns {String} 格式为YYYY-MM-DD的日期字符串
 */
const getYesterdayString = function() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return formatDate(yesterday);
};

/**
 * 格式化日期为YYYY-MM-DD格式
 * @param {Date|String} date - 日期对象或日期字符串
 * @returns {String} 格式化后的日期字符串
 */
const formatDate = function(date) {
  const d = date instanceof Date ? date : new Date(date);
  
  // 修正无效日期
  if (isNaN(d.getTime())) {
    logger.error('dateUtils', '无效的日期:', date);
    return '';
  }
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * 格式化时间为HH:MM格式
 * @param {Date|String} date - 日期对象或日期字符串
 * @returns {String} 格式化后的时间字符串
 */
const formatTime = function(date) {
  const d = date instanceof Date ? date : new Date(date);
  
  // 修正无效日期
  if (isNaN(d.getTime())) {
    logger.error('dateUtils', '无效的日期:', date);
    return '';
  }
  
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  
  return `${hours}:${minutes}`;
};

/**
 * 获取当前完整时间字符串
 * @returns {String} 格式为YYYY-MM-DD HH:MM:SS的时间字符串
 */
const getCurrentDateTime = function() {
  const now = new Date();
  const date = formatDate(now);
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  return `${date} ${hours}:${minutes}:${seconds}`;
};

/**
 * 判断两个日期是否为同一天
 * @param {Date|String} date1 - 第一个日期
 * @param {Date|String} date2 - 第二个日期
 * @returns {Boolean} 是否为同一天
 */
const isSameDay = function(date1, date2) {
  const d1 = date1 instanceof Date ? date1 : new Date(date1);
  const d2 = date2 instanceof Date ? date2 : new Date(date2);
  
  // 修正无效日期
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
    logger.error('dateUtils', '无效的日期比较:', {date1, date2});
    return false;
  }
  
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

/**
 * 判断是否为今天
 * @param {Date|String} date - 要判断的日期
 * @returns {Boolean} 是否为今天
 */
const isToday = function(date) {
  return isSameDay(new Date(), date);
};

/**
 * 判断是否为明天
 * @param {Date|String} date - 要判断的日期
 * @returns {Boolean} 是否为明天
 */
const isTomorrow = function(date) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return isSameDay(tomorrow, date);
};

/**
 * 判断是否为昨天
 * @param {Date|String} date - 要判断的日期
 * @returns {Boolean} 是否为昨天
 */
const isYesterday = function(date) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(yesterday, date);
};

/**
 * 获取两个日期之间的天数差
 * @param {String|Date} date1 - 第一个日期
 * @param {String|Date} date2 - 第二个日期
 * @returns {Number} 天数差（正数表示date2晚于date1，负数表示date2早于date1）
 */
const getDaysBetween = function(date1, date2) {
  const d1 = date1 instanceof Date ? date1 : new Date(date1);
  const d2 = date2 instanceof Date ? date2 : new Date(date2);
  
  // 修正无效日期
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
    logger.error('dateUtils', '无效的日期比较:', {date1, date2});
    return 0;
  }
  
  // 重置时间部分，只比较日期
  const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
  
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.floor((utc2 - utc1) / MS_PER_DAY);
};

/**
 * 获取一周中的第一天
 * @param {Date|String} date - 日期
 * @param {Number} firstDayOfWeek - 一周的起始日 (0=周日, 1=周一)
 * @returns {Date} 该周的第一天
 */
const getFirstDayOfWeek = function(date, firstDayOfWeek = 1) {
  const d = date instanceof Date ? date : new Date(date);
  
  // 修正无效日期
  if (isNaN(d.getTime())) {
    logger.error('dateUtils', '无效的日期:', date);
    return new Date();
  }
  
  const day = d.getDay();
  const diff = (day < firstDayOfWeek ? 7 : 0) + day - firstDayOfWeek;
  
  d.setDate(d.getDate() - diff);
  return d;
};

/**
 * 获取一个月的第一天
 * @param {Date|String} date - 日期
 * @returns {Date} 该月的第一天
 */
const getFirstDayOfMonth = function(date) {
  const d = date instanceof Date ? date : new Date(date);
  
  // 修正无效日期
  if (isNaN(d.getTime())) {
    logger.error('dateUtils', '无效的日期:', date);
    return new Date();
  }
  
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

/**
 * 获取一个月的最后一天
 * @param {Date|String} date - 日期
 * @returns {Date} 该月的最后一天
 */
const getLastDayOfMonth = function(date) {
  const d = date instanceof Date ? date : new Date(date);
  
  // 修正无效日期
  if (isNaN(d.getTime())) {
    logger.error('dateUtils', '无效的日期:', date);
    return new Date();
  }
  
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
};

/**
 * 获取日期之后的N天
 * @param {Date|String} date - 起始日期
 * @param {Number} days - 天数
 * @returns {Date} 结果日期
 */
const addDays = function(date, days) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  
  // 修正无效日期
  if (isNaN(d.getTime())) {
    logger.error('dateUtils', '无效的日期:', date);
    return new Date();
  }
  
  d.setDate(d.getDate() + days);
  return d;
};

/**
 * 获取日期之后的N个月
 * @param {Date|String} date - 起始日期
 * @param {Number} months - 月数
 * @returns {Date} 结果日期
 */
const addMonths = function(date, months) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  
  // 修正无效日期
  if (isNaN(d.getTime())) {
    logger.error('dateUtils', '无效的日期:', date);
    return new Date();
  }
  
  d.setMonth(d.getMonth() + months);
  return d;
};

/**
 * 获取星期几文本
 * @param {Date|String|Number} date - 日期或星期几的数字(0-6)
 * @returns {String} 星期几文本
 */
const getDayOfWeekChinese = function(date) {
  let day;
  
  if (typeof date === 'number' && date >= 0 && date <= 6) {
    day = date;
  } else {
    const d = date instanceof Date ? date : new Date(date);
    
    // 修正无效日期
    if (isNaN(d.getTime())) {
      logger.error('dateUtils', '无效的日期:', date);
      return '';
    }
    
    day = d.getDay();
  }
  
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return weekdays[day];
};

/**
 * 获取两个日期之间的所有日期数组
 * @param {Date|String} startDate - 开始日期
 * @param {Date|String} endDate - 结束日期
 * @returns {Array} 日期对象数组
 */
const getDatesBetween = function(startDate, endDate) {
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const end = endDate instanceof Date ? endDate : new Date(endDate);
  
  // 修正无效日期
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    logger.error('dateUtils', '无效的日期范围:', {startDate, endDate});
    return [];
  }
  
  const dates = [];
  let current = new Date(start);
  
  // 重置时间为00:00:00
  current.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  
  // 如果开始日期晚于结束日期，返回空数组
  if (current > end) {
    return [];
  }
  
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
};

/**
 * 检查日期是否在指定范围内
 * @param {Date|String} date - 要检查的日期
 * @param {Date|String} startDate - 范围开始日期
 * @param {Date|String} endDate - 范围结束日期
 * @returns {Boolean} 是否在范围内
 */
const isDateInRange = function(date, startDate, endDate) {
  const d = date instanceof Date ? date : new Date(date);
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const end = endDate instanceof Date ? endDate : new Date(endDate);
  
  // 修正无效日期
  if (isNaN(d.getTime()) || isNaN(start.getTime()) || isNaN(end.getTime())) {
    logger.error('dateUtils', '无效的日期比较:', {date, startDate, endDate});
    return false;
  }
  
  // 重置时间为00:00:00
  d.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  
  return d >= start && d <= end;
};

/**
 * 格式化日期为友好文本
 * @param {Date|String} date - 日期
 * @returns {String} 友好文本，如"今天"、"明天"、"昨天"或具体日期
 */
const formatDateFriendly = function(date) {
  const d = date instanceof Date ? date : new Date(date);
  
  // 修正无效日期
  if (isNaN(d.getTime())) {
    logger.error('dateUtils', '无效的日期:', date);
    return '';
  }
  
  // 判断是否为今天、明天、昨天
  if (isToday(d)) {
    return '今天';
  } else if (isTomorrow(d)) {
    return '明天';
  } else if (isYesterday(d)) {
    return '昨天';
  }
  
  // 计算与今天的天数差
  const daysDiff = getDaysBetween(new Date(), d);
  
  // 本周内的日期显示为星期几
  if (daysDiff > -7 && daysDiff < 7) {
    return getDayOfWeekChinese(d);
  }
  
  // 其他日期使用"月-日"格式
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}月${day}日`;
};

/**
 * 获取日期的时间戳
 * @param {Date|String} date - 日期
 * @returns {Number} 时间戳（毫秒）
 */
const getTimestamp = function(date) {
  if (!date) {
    return Date.now();
  }
  
  const d = date instanceof Date ? date : new Date(date);
  
  // 修正无效日期
  if (isNaN(d.getTime())) {
    logger.error('dateUtils', '无效的日期:', date);
    return Date.now();
  }
  
  return d.getTime();
};

/**
 * 解析日期时间字符串
 * @param {String} dateTimeStr - 日期时间字符串，格式如"2023-05-20 14:30"
 * @returns {Date} 解析后的日期对象
 */
const parseDateTime = function(dateTimeStr) {
  if (!dateTimeStr) {
    logger.warn('dateUtils', '日期时间字符串为空');
    return new Date();
  }
  
  // 尝试解析不同格式的日期时间字符串
  let date;
  
  // 格式: YYYY-MM-DD HH:MM:SS 或 YYYY-MM-DD HH:MM
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(dateTimeStr)) {
    date = new Date(dateTimeStr.replace(/-/g, '/'));
  }
  // 格式: YYYY-MM-DD
  else if (/^\d{4}-\d{2}-\d{2}$/.test(dateTimeStr)) {
    date = new Date(dateTimeStr.replace(/-/g, '/'));
  }
  // 格式: HH:MM:SS 或 HH:MM，使用当天日期
  else if (/^\d{2}:\d{2}(:\d{2})?$/.test(dateTimeStr)) {
    const today = new Date();
    const [hours, minutes, seconds] = dateTimeStr.split(':').map(Number);
    date = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes, seconds || 0);
  }
  // 其他情况，尝试直接解析
  else {
    date = new Date(dateTimeStr);
  }
  
  // 检查日期是否有效
  if (isNaN(date.getTime())) {
    logger.error('dateUtils', `无法解析日期时间字符串: ${dateTimeStr}`);
    return new Date();
  }
  
  return date;
};

/**
 * 获取两个时间之间的分钟差
 * @param {String} time1 - 第一个时间 (HH:MM格式)
 * @param {String} time2 - 第二个时间 (HH:MM格式)
 * @returns {Number} 分钟差
 */
const getMinutesBetween = function(time1, time2) {
  if (!time1 || !time2) {
    logger.error('dateUtils', `无效的时间参数: ${time1}, ${time2}`);
    return 0;
  }
  
  // 解析时间
  const [hours1, minutes1] = time1.split(':').map(Number);
  const [hours2, minutes2] = time2.split(':').map(Number);
  
  // 检查解析结果是否有效
  if (isNaN(hours1) || isNaN(minutes1) || isNaN(hours2) || isNaN(minutes2)) {
    logger.error('dateUtils', `无法解析时间格式: ${time1}, ${time2}`);
    return 0;
  }
  
  // 计算总分钟数
  const totalMinutes1 = hours1 * 60 + minutes1;
  const totalMinutes2 = hours2 * 60 + minutes2;
  
  return totalMinutes2 - totalMinutes1;
};

/**
 * 获取日期对应月份的日历数据
 * @param {Number} year - 年份
 * @param {Number} month - 月份 (1-12)
 * @returns {Array} 日历数据，包含前一个月、当前月和下一个月的日期
 */
const getMonthCalendar = function(year, month) {
  // 修正月份参数 (0-11)
  const monthIndex = month - 1;
  
  // 获取当月第一天
  const firstDay = new Date(year, monthIndex, 1);
  
  // 获取当月最后一天
  const lastDay = new Date(year, monthIndex + 1, 0);
  
  // 当月天数
  const daysInMonth = lastDay.getDate();
  
  // 月初是星期几 (0-6，0表示周日)
  const firstDayOfWeek = firstDay.getDay();
  
  // 创建日历数据
  const calendar = [];
  
  // 填充上月数据
  const prevMonthLastDay = new Date(year, monthIndex, 0).getDate();
  for (let i = 0; i < firstDayOfWeek; i++) {
    const day = prevMonthLastDay - firstDayOfWeek + i + 1;
    calendar.push({
      date: new Date(year, monthIndex - 1, day),
      day,
      isCurrentMonth: false,
      isPrevMonth: true
    });
  }
  
  // 填充当月数据
  for (let i = 1; i <= daysInMonth; i++) {
    calendar.push({
      date: new Date(year, monthIndex, i),
      day: i,
      isCurrentMonth: true
    });
  }
  
  // 填充下月数据，补满42格
  const remainingDays = 42 - calendar.length;
  for (let i = 1; i <= remainingDays; i++) {
    calendar.push({
      date: new Date(year, monthIndex + 1, i),
      day: i,
      isCurrentMonth: false,
      isNextMonth: true
    });
  }
  
  return calendar;
};

/**
 * 格式化相对时间
 * @param {Date|String|Number} date - 日期或时间戳
 * @returns {String} 相对时间描述，如"刚刚"、"5分钟前"、"2小时前"等
 */
const formatRelativeTime = function(date) {
  const now = new Date();
  const d = date instanceof Date ? date : new Date(date);
  
  // 修正无效日期
  if (isNaN(d.getTime())) {
    logger.error('dateUtils', '无效的日期:', date);
    return '';
  }
  
  const diffMs = now.getTime() - d.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSeconds < 60) {
    return '刚刚';
  } else if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`;
  } else if (diffHours < 24) {
    return `${diffHours}小时前`;
  } else if (diffDays < 30) {
    return `${diffDays}天前`;
  } else {
    // 超过30天则显示具体日期
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
};

module.exports = {
  getTodayString,
  getTomorrowString,
  getYesterdayString,
  formatDate,
  formatTime,
  getCurrentDateTime,
  isSameDay,
  isToday,
  isTomorrow,
  isYesterday,
  getDaysBetween,
  getFirstDayOfWeek,
  getFirstDayOfMonth,
  getLastDayOfMonth,
  addDays,
  addMonths,
  getDayOfWeekChinese,
  getDatesBetween,
  isDateInRange,
  formatDateFriendly,
  getTimestamp,
  parseDateTime,
  getMinutesBetween,
  getMonthCalendar,
  formatRelativeTime
}; 