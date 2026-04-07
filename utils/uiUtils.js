/**
 * uiUtils.js - UI交互工具类
 * 
 * 提供通用UI相关的方法，如动画效果等
 */

const logger = require('./logger');

/**
 * 记录UI样式优化日志
 * @param {String} component - 组件名称
 * @param {String} action - 执行的操作
 * @param {Object} details - 优化详情
 */
const logUIOptimization = function(component, action, details = {}) {
  logger.info('uiUtils', `界面优化: ${component} - ${action}`, details);
};

/**
 * 记录样式一致性调整
 * @param {String} area - 调整区域
 * @param {Object} changes - 变更详情
 */
const logStyleConsistency = function(area, changes = {}) {
  logger.info('uiUtils', `样式一致性: ${area}`, changes);
};

/**
 * 设置主题样式 (已简化为仅亮色主题)
 */
const setTheme = function() {
  // 统一使用亮色主题
  wx.setNavigationBarColor({
    frontColor: '#000000',
    backgroundColor: '#ffffff'
  });
  
  // 返回亮色主题标识
  return 'light';
};

/**
 * 获取当前主题 (始终返回亮色主题)
 * @returns {String} 当前主题类型
 */
const getCurrentTheme = function() {
  // 仅返回亮色主题
  return 'light';
};

/**
 * 获取压力级别相关颜色和样式
 * @param {Number} level - 压力级别 (1-4)
 * @param {String} style - 返回样式类型: 'bg'=背景色, 'color'=文本色, 'class'=CSS类名
 * @returns {String} 颜色值或类名
 */
const getPressureLevelStyle = function(level, style = 'bg') {
  logger.info('uiUtils', `获取压力级别${level}的${style}样式`);
  
  const styleMap = {
    1: { // 轻松
      bg: 'rgba(92, 151, 247, 0.2)',
      color: '#5C97F7',
      class: 'pressure-level-1'
    },
    2: { // 适中
      bg: 'rgba(66, 133, 244, 0.4)',
      color: '#4285F4',
      class: 'pressure-level-2'
    },
    3: { // 繁忙
      bg: 'rgba(83, 81, 186, 0.7)',
      color: '#5351BA',
      class: 'pressure-level-3'
    },
    4: { // 紧张
      bg: 'rgba(198, 40, 40, 0.85)',
      color: '#C62828',
      class: 'pressure-level-4'
    }
  };
  
  // 确保级别在有效范围内
  const safeLevel = Math.min(Math.max(parseInt(level) || 1, 1), 4);
  
  // 返回请求的样式类型
  if (styleMap[safeLevel] && styleMap[safeLevel][style]) {
    return styleMap[safeLevel][style];
  }
  
  // 默认返回背景色
  return styleMap[safeLevel].bg;
};

/**
 * 获取压力级别文本描述
 * @param {Number} pressure - 压力指数
 * @returns {Object} 包含levelText, levelNum, isHigh属性的对象
 * 
 * 压力级别对应数值区间（小学低年级标准）：
 * 轻松: 0-15分
 * 适中: 16-30分
 * 繁忙: 31-45分
 * 紧张: 46分以上
 */
const getPressureLevelText = function(pressure) {
  let levelText = '轻松';
  let levelNum = 1;
  let isHigh = false;
  
  logger.info('uiUtils', `计算压力级别，当前压力值：${pressure}（小学低年级标准）`);
  
  if (pressure <= 15) {
    levelText = '轻松';
    levelNum = 1;
  } else if (pressure <= 30) {
    levelText = '适中';
    levelNum = 2;
  } else if (pressure <= 45) {
    levelText = '繁忙';
    levelNum = 3;
    isHigh = true;
  } else {
    levelText = '紧张';
    levelNum = 4;
    isHigh = true;
  }
  
  return { levelText, levelNum, isHigh };
};

/**
 * 切换组件状态 - 统一的状态管理函数
 * @param {Object} page - 页面实例
 * @param {String} dataKey - 状态数据的路径
 * @param {*} value - 要设置的值，不提供则切换布尔值
 * @param {Object} options - 额外选项
 * @returns {*} 设置后的状态值
 */
const updateState = function(page, dataKey, value, options = {}) {
  if (typeof page !== 'object' || !page.setData) {
    logger.error('uiUtils', `无效的页面实例`);
    return null;
  }
  
  const currentValue = page.data[dataKey];
  let newValue;
  
  // 如果没有提供值，且当前值是布尔类型，则切换布尔值
  if (value === undefined) {
    if (typeof currentValue === 'boolean') {
      newValue = !currentValue;
    } else {
      logger.warn('uiUtils', `当前值不是布尔类型，无法切换: ${dataKey}`);
      return currentValue;
    }
  } else {
    newValue = value;
  }
  
  // 更新数据
  page.setData({
    [dataKey]: newValue
  });
  
  logger.info('uiUtils', `状态更新: ${dataKey} = ${newValue}`);
  
  // 如果有回调，则调用
  if (options.callback && typeof options.callback === 'function') {
    options.callback(newValue);
  }
  
  return newValue;
};

/**
 * 滚动到指定元素
 * @param {String} selector - 元素选择器
 * @param {Object} context - 组件实例或页面实例
 * @param {Number} offset - 偏移量(px)
 */
const scrollToElement = function(selector, context, offset = 0) {
  if (!selector) return;
  
  try {
    const query = context ? context.createSelectorQuery() : wx.createSelectorQuery();
    query.select(selector).boundingClientRect();
    query.selectViewport().scrollOffset();
    query.exec(function(res) {
      if (res && res[0] && res[1]) {
        wx.pageScrollTo({
          scrollTop: res[0].top + res[1].scrollTop - offset,
          duration: 300
        });
      }
    });
  } catch (e) {
    logger.error('uiUtils', `滚动到元素失败: ${selector}`, e);
  }
};

/**
 * 创建动画实例
 * @param {Object} options - 动画选项
 * @returns {Object} 动画实例
 */
const createAnimation = function(options = {}) {
  const defaultOptions = {
    duration: 300,
    timingFunction: 'ease',
    delay: 0,
    transformOrigin: '50% 50% 0'
  };
  
  const finalOptions = { ...defaultOptions, ...options };
  return wx.createAnimation(finalOptions);
};

/**
 * 统一的滑动动画处理函数
 * @param {Object} page - 页面实例
 * @param {String} animationKey - 动画数据的路径
 * @param {Object} options - 动画选项
 * @param {String} options.type - 动画类型: 'in'=滑入, 'out'=滑出
 * @param {String} options.direction - 方向: 'left', 'right', 'top', 'bottom'
 * @param {Number} options.distance - 滑动距离(px)
 * @param {Number} options.duration - 动画时长(ms)
 * @param {Number} options.delay - 延迟执行时间(ms)
 * @param {Function} options.callback - 动画完成后的回调函数
 */
const slideAnimation = function(page, animationKey, options = {}) {
  if (typeof page !== 'object' || !page.setData) {
    logger.error('uiUtils', '无效的页面实例');
    return;
  }
  
  const {
    type = 'in',
    direction = 'bottom',
    distance = 300,
    duration = 300,
    delay = 50,
    callback
  } = options;
  
  const animation = createAnimation({ duration: type === 'in' ? 0 : duration });
  let initialX = 0, initialY = 0;
  let targetX = 0, targetY = 0;
  
  // 设置初始位置或目标位置
  switch(direction) {
    case 'left':
      initialX = type === 'in' ? -distance : 0;
      targetX = type === 'in' ? 0 : -distance;
      break;
    case 'right':
      initialX = type === 'in' ? distance : 0;
      targetX = type === 'in' ? 0 : distance;
      break;
    case 'top':
      initialY = type === 'in' ? -distance : 0;
      targetY = type === 'in' ? 0 : -distance;
      break;
    case 'bottom':
    default:
      initialY = type === 'in' ? distance : 0;
      targetY = type === 'in' ? 0 : distance;
      break;
  }
  
  logger.info('uiUtils', `执行${type === 'in' ? '滑入' : '滑出'}动画: ${direction}方向, 距离${distance}px`);
  
  if (type === 'in') {
    // 滑入：先设置初始位置，然后动画到目标位置
    animation.translateX(initialX).translateY(initialY).step();
    page.setData({ [animationKey]: animation.export() });
    
    setTimeout(() => {
      animation.translateX(targetX).translateY(targetY).step({ duration });
      page.setData({ [animationKey]: animation.export() });
      
      if (callback && typeof callback === 'function') {
        setTimeout(callback, duration);
      }
    }, delay);
  } else {
    // 滑出：直接动画到目标位置
    animation.translateX(targetX).translateY(targetY).step();
    page.setData({ [animationKey]: animation.export() });
    
    if (callback && typeof callback === 'function') {
      setTimeout(callback, duration);
    }
  }
};

/**
 * 显示滑入动画 (保留向后兼容)
 * @param {Object} page - 页面实例
 * @param {String} animationKey - 动画数据的路径
 * @param {String} direction - 滑入方向，可选值：'left', 'right', 'top', 'bottom'
 * @param {Number} distance - 滑动距离(px)
 */
const slideInAnimation = function(page, animationKey, direction = 'bottom', distance = 300) {
  slideAnimation(page, animationKey, {
    type: 'in',
    direction,
    distance
  });
};

/**
 * 显示滑出动画 (保留向后兼容)
 * @param {Object} page - 页面实例
 * @param {String} animationKey - 动画数据的路径
 * @param {String} direction - 滑出方向，可选值：'left', 'right', 'top', 'bottom'
 * @param {Number} distance - 滑动距离(px)
 * @param {Function} callback - 动画完成后的回调函数
 */
const slideOutAnimation = function(page, animationKey, direction = 'bottom', distance = 300, callback) {
  slideAnimation(page, animationKey, {
    type: 'out',
    direction,
    distance,
    callback
  });
};

/**
 * 格式化任务类型图标
 * @param {String} type - 任务类型
 * @returns {String} 图标类名
 */
const formatTaskTypeIcon = function(type) {
  const iconMap = {
    'habit': 'icon-time',
    'interest': 'icon-backpack',
    'study': 'icon-study',
    'default': 'icon-task'
  };
  
  return iconMap[type] || iconMap.default;
};

/**
 * 格式化任务进度颜色
 * @param {Number} progress - 进度百分比(0-100)
 * @returns {String} 颜色代码
 */
const formatProgressColor = function(progress) {
  if (progress >= 80) {
    return '#52c41a'; // 绿色
  } else if (progress >= 50) {
    return '#1890ff'; // 蓝色
  } else if (progress >= 20) {
    return '#faad14'; // 黄色
  } else {
    return '#f5222d'; // 红色
  }
};

/**
 * 记录按钮布局优化日志
 * @param {String} page - 页面名称
 * @param {Object} layoutInfo - 布局信息
 */
const logButtonLayoutOptimization = function(page, layoutInfo = {}) {
  logger.info('uiUtils', `按钮布局优化: ${page}`, layoutInfo);
};

module.exports = {
  setTheme,
  getCurrentTheme,
  scrollToElement,
  createAnimation,
  slideAnimation,
  slideInAnimation,
  slideOutAnimation,
  formatTaskTypeIcon,
  formatProgressColor,
  getPressureLevelStyle,
  getPressureLevelText,
  updateState,
  logUIOptimization,
  logStyleConsistency,
  logButtonLayoutOptimization
}; 
