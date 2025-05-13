/**
 * storageUtils.js - 统一存储工具
 * 
 * 封装微信小程序的存储API，提供统一的读写接口
 */

const logger = require('./logger');

const storageUtils = {
  /**
   * 同步获取存储数据
   * @param {String} key 存储键名
   * @param {*} defaultValue 默认值，当数据不存在时返回
   * @returns {*} 存储的数据或默认值
   */
  get: function(key, defaultValue = null) {
    try {
      const value = wx.getStorageSync(key);
      if (value === '' || value === undefined || value === null) {
        logger.info('storageUtils', `键 ${key} 不存在，返回默认值`);
        return defaultValue;
      }
      return value;
    } catch (e) {
      logger.error('storageUtils', `获取存储键 ${key} 失败`, e);
      return defaultValue;
    }
  },

  /**
   * 同步设置存储数据
   * @param {String} key 存储键名
   * @param {*} data 要存储的数据
   * @returns {Boolean} 是否成功
   */
  set: function(key, data) {
    try {
      wx.setStorageSync(key, data);
      logger.info('storageUtils', `设置存储键 ${key} 成功`);
      return true;
    } catch (e) {
      logger.error('storageUtils', `设置存储键 ${key} 失败`, e);
      return false;
    }
  },

  /**
   * 异步获取存储数据
   * @param {String} key 存储键名
   * @param {Function} callback 回调函数
   * @param {*} defaultValue 默认值，当数据不存在时返回
   */
  getAsync: function(key, callback, defaultValue = null) {
    wx.getStorage({
      key: key,
      success: (res) => {
        if (typeof callback === 'function') {
          callback(res.data);
        }
      },
      fail: (e) => {
        logger.error('storageUtils', `异步获取存储键 ${key} 失败`, e);
        if (typeof callback === 'function') {
          callback(defaultValue);
        }
      }
    });
  },

  /**
   * 异步设置存储数据
   * @param {String} key 存储键名
   * @param {*} data 要存储的数据
   * @param {Function} callback 回调函数
   */
  setAsync: function(key, data, callback) {
    wx.setStorage({
      key: key,
      data: data,
      success: () => {
        logger.info('storageUtils', `异步设置存储键 ${key} 成功`);
        if (typeof callback === 'function') {
          callback(true);
        }
      },
      fail: (e) => {
        logger.error('storageUtils', `异步设置存储键 ${key} 失败`, e);
        if (typeof callback === 'function') {
          callback(false);
        }
      }
    });
  },

  /**
   * 删除存储数据
   * @param {String} key 存储键名
   * @returns {Boolean} 是否成功
   */
  remove: function(key) {
    try {
      wx.removeStorageSync(key);
      logger.info('storageUtils', `删除存储键 ${key} 成功`);
      return true;
    } catch (e) {
      logger.error('storageUtils', `删除存储键 ${key} 失败`, e);
      return false;
    }
  },

  /**
   * 清除所有存储数据
   * @returns {Boolean} 是否成功
   */
  clear: function() {
    try {
      wx.clearStorageSync();
      logger.info('storageUtils', '清除所有存储成功');
      return true;
    } catch (e) {
      logger.error('storageUtils', '清除所有存储失败', e);
      return false;
    }
  }
};

module.exports = storageUtils; 