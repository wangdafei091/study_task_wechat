/**
 * dateUtils.js - 日期处理工具类
 * 
 * 提供日期相关的通用方法，如格式化日期、日期计算等
 */

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
    console.error('无效的日期:', date);
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
    console.error('无效的日期:', date);
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
    console.error('无效的日期比较:', date1, date2);
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
    console.error('无效的日期比较:', date1, date2);
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
    console.error('无效的日期:', date);
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
    console.error('无效的日期:', date);
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
    console.error('无效的日期:', date);
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
    console.error('无效的日期:', date);
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
    console.error('无效的日期:', date);
    return new Date();
  }
  
  d.setMonth(d.getMonth() + months);
  return d;
};

/**
 * 获取指定日期的星期几
 * @param {Date|String} date - 日期
 * @returns {Number} 星期几 (0-6, 0表示星期日)
 */
const getDayOfWeek = function(date) {
  const d = date instanceof Date ? date : new Date(date);
  
  // 修正无效日期
  if (isNaN(d.getTime())) {
    console.error('无效的日期:', date);
    return 0;
  }
  
  return d.getDay();
};

/**
 * 获取指定日期的星期几（中文）
 * @param {Date|String} date - 日期
 * @returns {String} 星期几的中文表示
 */
const getDayOfWeekChinese = function(date) {
  const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return weekDays[getDayOfWeek(date)];
};

/**
 * 获取指定范围内的日期数组
 * @param {Date|String} startDate - 开始日期
 * @param {Date|String} endDate - 结束日期
 * @returns {Array} 日期字符串数组 (YYYY-MM-DD格式)
 */
const getDatesBetween = function(startDate, endDate) {
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const end = endDate instanceof Date ? endDate : new Date(endDate);
  
  // 修正无效日期
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    console.error('无效的日期范围:', startDate, endDate);
    return [];
  }
  
  const dates = [];
  let currentDate = new Date(start);
  
  while (currentDate <= end) {
    dates.push(formatDate(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return dates;
};

/**
 * 检查日期是否在指定范围内
 * @param {Date|String} date - 要检查的日期
 * @param {Date|String} startDate - 开始日期
 * @param {Date|String} endDate - 结束日期
 * @returns {Boolean} 日期是否在范围内
 */
const isDateInRange = function(date, startDate, endDate) {
  const d = date instanceof Date ? date : new Date(date);
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const end = endDate instanceof Date ? endDate : new Date(endDate);
  
  // 修正无效日期
  if (isNaN(d.getTime()) || isNaN(start.getTime()) || isNaN(end.getTime())) {
    console.error('无效的日期范围检查:', date, startDate, endDate);
    return false;
  }
  
  // 重置时间部分，只比较日期
  d.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  
  return d >= start && d <= end;
};

/**
 * 格式化日期为友好显示
 * @param {Date|String} date - 日期
 * @returns {String} 友好的日期显示
 */
const formatDateFriendly = function(date) {
  const d = date instanceof Date ? date : new Date(date);
  
  // 修正无效日期
  if (isNaN(d.getTime())) {
    console.error('无效的日期:', date);
    return '';
  }
  
  if (isToday(d)) {
    return '今天';
  } else if (isTomorrow(d)) {
    return '明天';
  } else if (isYesterday(d)) {
    return '昨天';
  }
  
  const dayDiff = getDaysBetween(new Date(), d);
  
  if (dayDiff > 0 && dayDiff < 7) {
    return `${dayDiff}天后`;
  } else if (dayDiff < 0 && dayDiff > -7) {
    return `${-dayDiff}天前`;
  } else {
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const currentYear = new Date().getFullYear();
    
    if (year === currentYear) {
      return `${month}月${day}日`;
    } else {
      return `${year}年${month}月${day}日`;
    }
  }
};

/**
 * 解析日期时间字符串
 * @param {String} dateTimeStr - 日期时间字符串
 * @returns {Date} 解析后的日期对象，解析失败返回当前日期
 */
const parseDateTime = function(dateTimeStr) {
  if (!dateTimeStr) {
    return new Date();
  }
  
  try {
    // 尝试直接解析
    const parsedDate = new Date(dateTimeStr);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
    
    // 尝试解析常见格式
    if (dateTimeStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // YYYY-MM-DD
      const [year, month, day] = dateTimeStr.split('-').map(Number);
      return new Date(year, month - 1, day);
    } else if (dateTimeStr.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)) {
      // YYYY-MM-DD HH:MM
      const [datePart, timePart] = dateTimeStr.split(' ');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);
      return new Date(year, month - 1, day, hours, minutes);
    }
    
    // 其他格式解析失败，返回当前日期
    console.error('无法解析日期时间字符串:', dateTimeStr);
    return new Date();
  } catch (error) {
    console.error('解析日期时间字符串出错:', error);
    return new Date();
  }
};

/**
 * 计算两个时间的时间差（分钟）
 * @param {String} time1 - 第一个时间 (HH:MM格式)
 * @param {String} time2 - 第二个时间 (HH:MM格式)
 * @returns {Number} 分钟差（正数表示time2晚于time1，负数表示time2早于time1）
 */
const getMinutesBetween = function(time1, time2) {
  if (!time1 || !time2) {
    return 0;
  }
  
  try {
    const [hours1, minutes1] = time1.split(':').map(Number);
    const [hours2, minutes2] = time2.split(':').map(Number);
    
    const totalMinutes1 = hours1 * 60 + minutes1;
    const totalMinutes2 = hours2 * 60 + minutes2;
    
    return totalMinutes2 - totalMinutes1;
  } catch (error) {
    console.error('计算时间差出错:', error);
    return 0;
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
  getDayOfWeek,
  getDayOfWeekChinese,
  getDatesBetween,
  isDateInRange,
  formatDateFriendly,
  parseDateTime,
  getMinutesBetween
}; 