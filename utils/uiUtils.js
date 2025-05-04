/**
 * uiUtils.js - UI交互工具类
 * 
 * 提供通用UI相关的方法，如动画效果等
 */

/**
 * 记录UI样式优化日志
 * @param {String} component - 组件名称
 * @param {String} action - 执行的操作
 * @param {Object} details - 优化详情
 */
const logUIOptimization = function(component, action, details = {}) {
  console.log(`[uiUtils] 界面优化: ${component} - ${action}`, details);
};

/**
 * 记录样式一致性调整
 * @param {String} area - 调整区域
 * @param {Object} changes - 变更详情
 */
const logStyleConsistency = function(area, changes = {}) {
  console.log(`[uiUtils] 样式一致性: ${area}`, changes);
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
  console.log(`[uiUtils] 获取压力级别${level}的${style}样式`);
  
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
  
  console.log(`[uiUtils] 计算压力级别，当前压力值：${pressure}（小学低年级标准）`);
  
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
 * 切换组件显示状态
 * @param {Object} page - 页面实例
 * @param {String} componentName - 组件的数据路径，如'isAddPanelVisible'
 * @param {Boolean} status - 要设置的状态，不提供则切换当前状态
 */
const toggleComponent = function(page, componentName, status) {
  if (typeof page !== 'object' || !page.setData) {
    console.log('[uiUtils] 无效的页面实例');
    return;
  }
  
  // 如果没有提供状态，则切换当前状态
  if (typeof status === 'undefined') {
    const currentStatus = page.data[componentName];
    page.setData({
      [componentName]: !currentStatus
    });
    return !currentStatus;
  }
  
  // 设置为指定状态
  page.setData({
    [componentName]: status
  });
  
  return status;
};

/**
 * 切换遮罩层状态
 * @param {Object} page - 页面实例
 * @param {Boolean} status - 要设置的状态，不提供则切换当前状态
 * @returns {Boolean} 设置后的状态
 */
const toggleMask = function(page, status) {
  return toggleComponent(page, 'isMaskVisible', status);
};

/**
 * 显示加载状态
 * @param {Object} page - 页面实例
 * @param {String} loadingKey - 加载状态的数据路径，如'isLoading'
 * @param {Boolean} status - 要设置的状态
 * @returns {Boolean} 设置后的状态
 */
const setLoading = function(page, loadingKey = 'isLoading', status = true) {
  return toggleComponent(page, loadingKey, status);
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
    console.log('[uiUtils] 滚动到元素失败', e);
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
 * 显示滑入动画
 * @param {Object} page - 页面实例
 * @param {String} animationKey - 动画数据的路径
 * @param {String} direction - 滑入方向，可选值：'left', 'right', 'top', 'bottom'
 * @param {Number} distance - 滑动距离(px)
 */
const slideInAnimation = function(page, animationKey, direction = 'bottom', distance = 300) {
  if (typeof page !== 'object' || !page.setData) {
    console.error('无效的页面实例');
    return;
  }
  
  const animation = createAnimation();
  
  // 设置初始位置
  switch(direction) {
    case 'left':
      animation.translateX(-distance).step({ duration: 0 });
      break;
    case 'right':
      animation.translateX(distance).step({ duration: 0 });
      break;
    case 'top':
      animation.translateY(-distance).step({ duration: 0 });
      break;
    case 'bottom':
    default:
      animation.translateY(distance).step({ duration: 0 });
      break;
  }
  
  // 应用初始位置
  page.setData({
    [animationKey]: animation.export()
  });
  
  // 延迟一帧后执行滑入动画
  setTimeout(() => {
    animation.translateX(0).translateY(0).step({ duration: 300 });
    page.setData({
      [animationKey]: animation.export()
    });
  }, 50);
};

/**
 * 显示滑出动画
 * @param {Object} page - 页面实例
 * @param {String} animationKey - 动画数据的路径
 * @param {String} direction - 滑出方向，可选值：'left', 'right', 'top', 'bottom'
 * @param {Number} distance - 滑动距离(px)
 * @param {Function} callback - 动画完成后的回调函数
 */
const slideOutAnimation = function(page, animationKey, direction = 'bottom', distance = 300, callback) {
  if (typeof page !== 'object' || !page.setData) {
    console.error('无效的页面实例');
    return;
  }
  
  const animation = createAnimation();
  
  // 执行滑出动画
  switch(direction) {
    case 'left':
      animation.translateX(-distance).step({ duration: 300 });
      break;
    case 'right':
      animation.translateX(distance).step({ duration: 300 });
      break;
    case 'top':
      animation.translateY(-distance).step({ duration: 300 });
      break;
    case 'bottom':
    default:
      animation.translateY(distance).step({ duration: 300 });
      break;
  }
  
  // 应用动画
  page.setData({
    [animationKey]: animation.export()
  });
  
  // 动画完成后执行回调
  if (typeof callback === 'function') {
    setTimeout(callback, 300);
  }
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
  console.log(`[uiUtils] 按钮布局优化: ${page}`, layoutInfo);
};

module.exports = {
  setTheme,
  getCurrentTheme,
  toggleComponent,
  toggleMask,
  setLoading,
  scrollToElement,
  createAnimation,
  slideInAnimation,
  slideOutAnimation,
  formatTaskTypeIcon,
  formatProgressColor,
  getPressureLevelStyle,
  getPressureLevelText,
  logUIOptimization,
  logStyleConsistency,
  logButtonLayoutOptimization
}; 