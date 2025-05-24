/**
 * deviceInfo.js - 设备信息工具模块
 * 
 * 替代已废弃的wx.getSystemInfoSync API，使用新的细粒度API
 * 提供统一的设备信息获取接口
 */

// 移除logger依赖，使用console作为日志输出
// const logger = require('./logger');

const deviceInfo = {
  /**
   * 获取完整的系统信息
   * 替代wx.getSystemInfoSync，组合多个新API
   * @returns {Object} 组合后的系统信息
   */
  getSystemInfo() {
    try {
      console.debug('[deviceInfo] 获取系统信息');
      // 组合多个新API的结果
      return {
        ...wx.getDeviceInfo(),
        ...wx.getWindowInfo(),
        ...wx.getAppBaseInfo(),
        ...wx.getSystemSetting()
      };
    } catch (error) {
      console.error('[deviceInfo] 获取系统信息失败', error);
      // 返回一些基本默认值，防止调用方出错
      return {
        platform: 'unknown',
        pixelRatio: 2,
        windowWidth: 375,
        windowHeight: 667,
        screenWidth: 375,
        screenHeight: 667
      };
    }
  },
  
  /**
   * 检查是否为开发环境
   * @returns {Boolean} 是否为开发环境
   */
  isDevelopmentEnv() {
    try {
      const appInfo = wx.getAppBaseInfo();
      const deviceInfo = wx.getDeviceInfo();
      
      // 检查是否为开发版本或开发者工具
      return appInfo.envVersion === 'develop' || 
             deviceInfo.platform === 'devtools';
    } catch (error) {
      console.error('[deviceInfo] 检查开发环境失败', error);
      return false;
    }
  },
  
  /**
   * 获取设备像素比
   * @returns {Number} 设备像素比
   */
  getPixelRatio() {
    try {
      return wx.getWindowInfo().pixelRatio || 2;
    } catch (error) {
      console.error('[deviceInfo] 获取设备像素比失败', error);
      return 2;
    }
  },
  
  /**
   * 获取窗口尺寸
   * @returns {Object} 窗口尺寸信息
   */
  getWindowSize() {
    try {
      const info = wx.getWindowInfo();
      return {
        width: info.windowWidth,
        height: info.windowHeight
      };
    } catch (error) {
      console.error('[deviceInfo] 获取窗口尺寸失败', error);
      return { width: 375, height: 667 };
    }
  },
  
  /**
   * 获取安全区域信息
   * @returns {Object} 安全区域信息
   */
  getSafeArea() {
    try {
      return wx.getWindowInfo().safeArea || {
        top: 0,
        right: 375,
        bottom: 667,
        left: 0,
        width: 375,
        height: 667
      };
    } catch (error) {
      console.error('[deviceInfo] 获取安全区域失败', error);
      return {
        top: 0,
        right: 375,
        bottom: 667,
        left: 0,
        width: 375,
        height: 667
      };
    }
  },
  
  /**
   * 获取基础库版本
   * @returns {String} 基础库版本
   */
  getSDKVersion() {
    try {
      return wx.getAppBaseInfo().SDKVersion || '0.0.0';
    } catch (error) {
      console.error('[deviceInfo] 获取基础库版本失败', error);
      return '0.0.0';
    }
  },
  
  /**
   * 检查基础库版本是否满足最低要求
   * @param {String} minVersion 最低版本要求
   * @returns {Boolean} 是否满足要求
   */
  checkSDKVersion(minVersion) {
    try {
      const version = this.getSDKVersion();
      return this._compareVersion(version, minVersion) >= 0;
    } catch (error) {
      console.error('[deviceInfo] 检查基础库版本失败', error);
      return false;
    }
  },
  
  /**
   * 比较版本号
   * @private
   * @param {String} v1 版本1
   * @param {String} v2 版本2
   * @returns {Number} 比较结果(-1, 0, 1)
   */
  _compareVersion(v1, v2) {
    const v1Parts = v1.split('.').map(Number);
    const v2Parts = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }
    
    return 0;
  }
};

module.exports = deviceInfo; 