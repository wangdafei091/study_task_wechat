/**
 * page-storage-helper.js - 页面存储助手
 * 
 * 为页面层提供统一的存储访问接口，避免直接调用wx存储API
 */

const StorageAdapter = require('../adapters/storage-adapter');
const logger = require('./logger');

class PageStorageHelper {
  constructor() {
    // 使用page_前缀的命名空间，避免与业务数据冲突
    this.storageAdapter = new StorageAdapter({ 
      namespace: 'page_',
      useCache: true,
      cacheExpiry: 30000 // 页面状态缓存30秒
    });
    
    logger.info('PageStorageHelper', '页面存储助手初始化完成');
  }
  
  /**
   * 设置页面状态数据
   * @param {String} key 存储键名
   * @param {*} data 要存储的数据
   * @returns {Boolean} 是否成功
   */
  setPageState(key, data) {
    try {
      return this.storageAdapter.set(key, data);
    } catch (error) {
      logger.error('PageStorageHelper', `设置页面状态失败: ${key}`, error);
      return false;
    }
  }
  
  /**
   * 获取页面状态数据
   * @param {String} key 存储键名
   * @param {*} defaultValue 默认值
   * @returns {*} 存储的数据或默认值
   */
  getPageState(key, defaultValue = null) {
    try {
      return this.storageAdapter.get(key, defaultValue);
    } catch (error) {
      logger.error('PageStorageHelper', `获取页面状态失败: ${key}`, error);
      return defaultValue;
    }
  }
  
  /**
   * 异步设置页面状态数据
   * @param {String} key 存储键名
   * @param {*} data 要存储的数据
   * @returns {Promise<Boolean>} 是否成功
   */
  async setPageStateAsync(key, data) {
    try {
      return await this.storageAdapter.setAsync(key, data);
    } catch (error) {
      logger.error('PageStorageHelper', `异步设置页面状态失败: ${key}`, error);
      return false;
    }
  }
  
  /**
   * 异步获取页面状态数据
   * @param {String} key 存储键名
   * @param {*} defaultValue 默认值
   * @returns {Promise<*>} 存储的数据或默认值
   */
  async getPageStateAsync(key, defaultValue = null) {
    try {
      return await this.storageAdapter.getAsync(key, defaultValue);
    } catch (error) {
      logger.error('PageStorageHelper', `异步获取页面状态失败: ${key}`, error);
      return defaultValue;
    }
  }
  
  /**
   * 删除页面状态数据
   * @param {String} key 存储键名
   * @returns {Boolean} 是否成功
   */
  removePageState(key) {
    try {
      return this.storageAdapter.remove(key);
    } catch (error) {
      logger.error('PageStorageHelper', `删除页面状态失败: ${key}`, error);
      return false;
    }
  }
  
  /**
   * 设置用户偏好设置（全局状态）
   * @param {String} key 偏好键名
   * @param {*} data 偏好数据
   * @returns {Boolean} 是否成功
   */
  setUserPreference(key, data) {
    try {
      // 用户偏好使用全局命名空间
      const globalAdapter = new StorageAdapter({ namespace: 'user_pref_' });
      return globalAdapter.set(key, data);
    } catch (error) {
      logger.error('PageStorageHelper', `设置用户偏好失败: ${key}`, error);
      return false;
    }
  }
  
  /**
   * 获取用户偏好设置（全局状态）
   * @param {String} key 偏好键名
   * @param {*} defaultValue 默认值
   * @returns {*} 偏好数据或默认值
   */
  getUserPreference(key, defaultValue = null) {
    try {
      // 用户偏好使用全局命名空间
      const globalAdapter = new StorageAdapter({ namespace: 'user_pref_' });
      return globalAdapter.get(key, defaultValue);
    } catch (error) {
      logger.error('PageStorageHelper', `获取用户偏好失败: ${key}`, error);
      return defaultValue;
    }
  }
  
  /**
   * 清除所有页面状态（调试用）
   * @returns {Promise<Boolean>} 是否成功
   */
  async clearAllPageStates() {
    try {
      await this.storageAdapter.clearNamespace();
      logger.info('PageStorageHelper', '清除所有页面状态成功');
      return true;
    } catch (error) {
      logger.error('PageStorageHelper', '清除所有页面状态失败', error);
      return false;
    }
  }
}

// 导出单例
const pageStorageHelper = new PageStorageHelper();
module.exports = pageStorageHelper; 