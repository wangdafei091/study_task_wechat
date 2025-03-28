/**
 * unit.js - 单位转换工具
 * 
 * 用于处理 rpx 和 px 之间的转换，确保全应用样式单位统一
 */

// 设计稿宽度 (rpx 基准)
const DESIGN_WIDTH = 750;

/**
 * px 转换为 rpx
 * @param {Number} px - 像素值
 * @returns {Number} rpx值
 */
const px2rpx = function(px) {
  // 获取设备信息
  const systemInfo = wx.getSystemInfoSync();
  const screenWidth = systemInfo.screenWidth;
  
  // 转换 (屏幕实际宽度和设计稿宽度的比例)
  return px * (DESIGN_WIDTH / screenWidth);
};

/**
 * rpx 转换为 px
 * @param {Number} rpx - rpx值
 * @returns {Number} 像素值
 */
const rpx2px = function(rpx) {
  // 获取设备信息
  const systemInfo = wx.getSystemInfoSync();
  const screenWidth = systemInfo.screenWidth;
  
  // 转换
  return rpx / (DESIGN_WIDTH / screenWidth);
};

/**
 * 统一单位为rpx (处理样式字符串中可能存在的px单位)
 * @param {String} styleStr - 样式字符串
 * @returns {String} 转换后的样式字符串
 */
const unifyUnit = function(styleStr) {
  if (typeof styleStr !== 'string') return styleStr;
  
  // 匹配所有px单位
  return styleStr.replace(/(\d+(\.\d+)?)px/g, (match, val) => {
    // 将px转为rpx
    return Math.round(px2rpx(parseFloat(val))) + 'rpx';
  });
};

/**
 * 适配不同屏幕尺寸的字体大小
 * @param {Number} size - 基础字体大小(rpx)
 * @returns {Number} 适配后的字体大小(rpx)
 */
const adaptFontSize = function(size) {
  const systemInfo = wx.getSystemInfoSync();
  const screenWidth = systemInfo.screenWidth;
  
  // 375pt是标准设计稿屏幕宽度
  let scale = 1;
  if (screenWidth < 375) {
    // 小屏幕缩小字体
    scale = 0.9;
  } else if (screenWidth > 414) {
    // 大屏幕放大字体
    scale = 1.1;
  }
  
  return Math.round(size * scale);
};

/**
 * 获取当前设备屏幕类型标识
 * @returns {Object} 设备屏幕类型标识
 */
const getDeviceType = function() {
  const systemInfo = wx.getSystemInfoSync();
  const screenWidth = systemInfo.screenWidth;
  const isIPad = systemInfo.model.toLowerCase().includes('ipad') || (systemInfo.brand === 'devtools' && systemInfo.screenWidth >= 768);
  
  return {
    isSmallScreen: screenWidth < 375,
    isMediumScreen: screenWidth >= 375 && screenWidth < 414,
    isLargeScreen: screenWidth >= 414 && screenWidth < 768,
    isExtraLargeScreen: screenWidth >= 768,
    isIPad: isIPad,
    isIPhoneX: (systemInfo.model.toLowerCase().includes('iphone x') || 
                systemInfo.model.toLowerCase().includes('iphone 1') ||
                (systemInfo.brand === 'devtools' && 
                systemInfo.screenHeight / systemInfo.screenWidth > 2))
  };
};

/**
 * 计算弹性尺寸
 * 根据屏幕宽度比例计算自适应尺寸
 * @param {Number} baseSize - 基础尺寸(rpx)
 * @param {Number} minSize - 最小尺寸(rpx)
 * @param {Number} maxSize - 最大尺寸(rpx)
 * @returns {Number} 适配后的尺寸(rpx)
 */
const getFlexSize = function(baseSize, minSize, maxSize) {
  const systemInfo = wx.getSystemInfoSync();
  const screenWidth = systemInfo.screenWidth;
  
  // 基准屏幕宽度
  const baseWidth = 375;
  
  // 计算比例
  const ratio = screenWidth / baseWidth;
  let result = Math.round(baseSize * ratio);
  
  // 限制在最小值和最大值之间
  if (minSize !== undefined && result < minSize) {
    result = minSize;
  }
  if (maxSize !== undefined && result > maxSize) {
    result = maxSize;
  }
  
  return result;
};

/**
 * 获取适配后的安全边距
 * 特别处理全面屏设备的底部安全区域
 * @returns {Object} 安全边距
 */
const getSafeAreaInset = function() {
  const systemInfo = wx.getSystemInfoSync();
  let safeArea = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  };
  
  if (systemInfo.safeArea) {
    safeArea = {
      top: systemInfo.safeArea.top,
      right: systemInfo.screenWidth - systemInfo.safeArea.right,
      bottom: systemInfo.screenHeight - systemInfo.safeArea.bottom,
      left: systemInfo.safeArea.left
    };
  }
  
  return {
    top: px2rpx(safeArea.top),
    right: px2rpx(safeArea.right),
    bottom: px2rpx(safeArea.bottom),
    left: px2rpx(safeArea.left)
  };
};

/**
 * 获取可用内容区域高度
 * 考虑状态栏、导航栏和安全区域
 * @param {Object} options - 选项参数
 * @param {Boolean} options.hasTabBar - 是否有底部选项卡
 * @param {Boolean} options.hasCustomNavBar - 是否有自定义导航栏
 * @param {Number} options.extraHeight - 额外的高度偏移(rpx)
 * @returns {Number} 可用内容区域高度(rpx)
 */
const getContentHeight = function(options = {}) {
  const systemInfo = wx.getSystemInfoSync();
  const safeArea = getSafeAreaInset();
  
  // 页面可用高度(像素)
  let availHeight = systemInfo.windowHeight;
  
  // 减去底部安全区域(像素)
  if (safeArea.bottom > 0) {
    availHeight -= systemInfo.screenHeight - systemInfo.safeArea.bottom;
  }
  
  // 考虑底部选项卡高度
  if (options.hasTabBar) {
    // 标准底部选项卡高度约为48~56px
    availHeight -= options.customTabBarHeight || 50;
  }
  
  // 考虑顶部导航栏高度
  if (options.hasCustomNavBar) {
    // 如果自定义了导航栏，内容已经考虑了状态栏和导航栏的高度
  } else {
    // 默认顶部导航栏高度
    availHeight -= systemInfo.statusBarHeight + 44; // 状态栏 + 导航栏
  }
  
  // 转换为rpx
  let availHeightRpx = px2rpx(availHeight);
  
  // 考虑额外的高度偏移
  if (options.extraHeight) {
    availHeightRpx -= options.extraHeight;
  }
  
  return availHeightRpx;
};

/**
 * 获取视口信息
 * 包括视口尺寸、安全区域等
 * @returns {Object} 视口信息
 */
const getViewportInfo = function() {
  const systemInfo = wx.getSystemInfoSync();
  const safeAreaInset = getSafeAreaInset();
  
  return {
    width: px2rpx(systemInfo.windowWidth),
    height: px2rpx(systemInfo.windowHeight),
    pixelRatio: systemInfo.pixelRatio,
    safeAreaInset,
    statusBarHeight: px2rpx(systemInfo.statusBarHeight),
    isLandscape: systemInfo.windowWidth > systemInfo.windowHeight,
    screenWidth: px2rpx(systemInfo.screenWidth),
    screenHeight: px2rpx(systemInfo.screenHeight),
    windowWidth: px2rpx(systemInfo.windowWidth),
    windowHeight: px2rpx(systemInfo.windowHeight)
  };
};

/**
 * 检测是否为全面屏设备
 * @returns {Boolean} 是否为全面屏设备
 */
const isFullScreenDevice = function() {
  const systemInfo = wx.getSystemInfoSync();
  const safeArea = systemInfo.safeArea;
  
  // 判断是否有底部安全区域的全面屏设备
  if (safeArea && systemInfo.screenHeight > 0) {
    return systemInfo.screenHeight - safeArea.bottom > 0;
  }
  
  // 通过屏幕比例判断
  const ratio = systemInfo.screenHeight / systemInfo.screenWidth;
  return ratio >= 2.0; // iPhone X 及以上的比例基本上都大于2
};

module.exports = {
  px2rpx,
  rpx2px,
  unifyUnit,
  adaptFontSize,
  getDeviceType,
  getFlexSize,
  getSafeAreaInset,
  getContentHeight,
  getViewportInfo,
  isFullScreenDevice
}; 