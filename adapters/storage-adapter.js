/**
 * storage-adapter.js - 存储适配器
 * 
 * 封装微信小程序的存储API，提供统一的读写接口，支持命名空间和缓存
 */

const logger = require('../utils/logger');

class StorageAdapter {
  /**
   * 构造函数
   * @param {Object} options 配置选项
   * @param {String} options.namespace 命名空间前缀，用于隔离不同模块的存储
   * @param {Boolean} options.useCache 是否使用内存缓存
   * @param {Number} options.cacheExpiry 缓存过期时间（毫秒）
   */
  constructor(options = {}) {
    // 配置
    this.namespace = options.namespace || '';
    this.useCache = options.useCache !== false;
    this.cacheExpiry = options.cacheExpiry || 60000; // 默认1分钟
    
    // 缓存
    this.cache = {};
    
    logger.info('StorageAdapter', `初始化存储适配器 [命名空间: ${this.namespace || '无'}, 使用缓存: ${this.useCache}]`);
  }
  
  /**
   * 根据键名生成完整存储键（添加命名空间前缀）
   * @private
   * @param {String} key 原始键名
   * @returns {String} 添加前缀后的完整键名
   */
  _getFullKey(key) {
    return this.namespace ? `${this.namespace}${key}` : key;
  }
  
  /**
   * 同步获取存储数据
   * @param {String} key 存储键名
   * @param {*} defaultValue 默认值，当数据不存在时返回
   * @returns {*} 存储的数据或默认值
   */
  get(key, defaultValue = null) {
    const fullKey = this._getFullKey(key);
    
    // 尝试从缓存获取
    if (this.useCache && this.cache[fullKey] && this.cache[fullKey].expiry > Date.now()) {
      logger.info('StorageAdapter', `从缓存获取数据: ${key}`);
      return this.cache[fullKey].data;
    }
    
    try {
      const value = wx.getStorageSync(fullKey);
      if (value === '' || value === undefined || value === null) {
        logger.info('StorageAdapter', `键 ${key} 不存在，返回默认值`);
        return defaultValue;
      }
      
      // 更新缓存
      if (this.useCache) {
        this._updateCache(fullKey, value);
      }
      
      return value;
    } catch (e) {
      logger.error('StorageAdapter', `获取存储键 ${key} 失败`, e);
      return defaultValue;
    }
  }
  
  /**
   * 同步设置存储数据
   * @param {String} key 存储键名
   * @param {*} data 要存储的数据
   * @returns {Boolean} 是否成功
   */
  set(key, data) {
    const fullKey = this._getFullKey(key);
    
    try {
      wx.setStorageSync(fullKey, data);
      logger.info('StorageAdapter', `设置存储键 ${key} 成功`);
      
      // 更新缓存
      if (this.useCache) {
        this._updateCache(fullKey, data);
      }
      
      return true;
    } catch (e) {
      logger.error('StorageAdapter', `设置存储键 ${key} 失败`, e);
      return false;
    }
  }
  
  /**
   * 异步获取存储数据
   * @param {String} key 存储键名
   * @param {*} defaultValue 默认值，当数据不存在时返回
   * @returns {Promise<*>} 返回Promise对象
   */
  async getAsync(key, defaultValue = null) {
    const fullKey = this._getFullKey(key);
    
    // 尝试从缓存获取
    if (this.useCache && this.cache[fullKey] && this.cache[fullKey].expiry > Date.now()) {
      logger.info('StorageAdapter', `从缓存异步获取数据: ${key}`);
      return this.cache[fullKey].data;
    }
    
    try {
      const res = await this._wxStoragePromise('getStorage', { key: fullKey });
      
      // 更新缓存
      if (this.useCache) {
        this._updateCache(fullKey, res.data);
      }
      
      return res.data;
    } catch (e) {
      // 如果是键不存在错误，返回默认值
      if (e.errMsg && e.errMsg.indexOf('data not found') !== -1) {
        logger.info('StorageAdapter', `键 ${key} 不存在，返回默认值`);
        return defaultValue;
      }
      
      logger.error('StorageAdapter', `异步获取存储键 ${key} 失败`, e);
      return defaultValue;
    }
  }
  
  /**
   * 异步设置存储数据
   * @param {String} key 存储键名
   * @param {*} data 要存储的数据
   * @returns {Promise<Boolean>} 是否成功的Promise
   */
  async setAsync(key, data) {
    const fullKey = this._getFullKey(key);
    
    try {
      await this._wxStoragePromise('setStorage', {
        key: fullKey,
        data: data
      });
      
      logger.info('StorageAdapter', `异步设置存储键 ${key} 成功`);
      
      // 更新缓存
      if (this.useCache) {
        this._updateCache(fullKey, data);
      }
      
      return true;
    } catch (e) {
      logger.error('StorageAdapter', `异步设置存储键 ${key} 失败`, e);
      return false;
    }
  }
  
  /**
   * 删除存储数据
   * @param {String} key 存储键名
   * @returns {Boolean} 是否成功
   */
  remove(key) {
    const fullKey = this._getFullKey(key);
    
    try {
      wx.removeStorageSync(fullKey);
      
      // 清除缓存
      if (this.useCache && this.cache[fullKey]) {
        delete this.cache[fullKey];
      }
      
      logger.info('StorageAdapter', `删除存储键 ${key} 成功`);
      return true;
    } catch (e) {
      logger.error('StorageAdapter', `删除存储键 ${key} 失败`, e);
      return false;
    }
  }
  
  /**
   * 异步删除存储数据
   * @param {String} key 存储键名
   * @returns {Promise<Boolean>} 是否成功的Promise
   */
  async removeAsync(key) {
    const fullKey = this._getFullKey(key);
    
    try {
      await this._wxStoragePromise('removeStorage', { key: fullKey });
      
      // 清除缓存
      if (this.useCache && this.cache[fullKey]) {
        delete this.cache[fullKey];
      }
      
      logger.info('StorageAdapter', `异步删除存储键 ${key} 成功`);
      return true;
    } catch (e) {
      logger.error('StorageAdapter', `异步删除存储键 ${key} 失败`, e);
      return false;
    }
  }
  
  /**
   * 清除所有与当前命名空间相关的存储
   * @returns {Promise<Boolean>} 是否成功的Promise
   */
  async clearNamespace() {
    if (!this.namespace) {
      logger.warn('StorageAdapter', '尝试清除无命名空间的存储，操作被拒绝');
      return false;
    }
    
    try {
      // 获取所有存储信息
      const res = await this._wxStoragePromise('getStorageInfo');
      const keys = res.keys || [];
      
      // 过滤出命名空间下的键
      const namespacedKeys = keys.filter(key => key.startsWith(this.namespace));
      
      // 逐个删除
      const deletePromises = namespacedKeys.map(key => 
        this._wxStoragePromise('removeStorage', { key })
      );
      
      await Promise.all(deletePromises);
      
      // 清除缓存
      if (this.useCache) {
        Object.keys(this.cache).forEach(cacheKey => {
          if (cacheKey.startsWith(this.namespace)) {
            delete this.cache[cacheKey];
          }
        });
      }
      
      logger.info('StorageAdapter', `清除命名空间 ${this.namespace} 下的所有数据成功，共 ${namespacedKeys.length} 项`);
      return true;
    } catch (e) {
      logger.error('StorageAdapter', `清除命名空间 ${this.namespace} 失败`, e);
      return false;
    }
  }
  
  /**
   * 将微信API转换为Promise形式
   * @private
   * @param {String} method 微信API方法名
   * @param {Object} options API参数
   * @returns {Promise} Promise对象
   */
  _wxStoragePromise(method, options = {}) {
    return new Promise((resolve, reject) => {
      wx[method]({
        ...options,
        success: resolve,
        fail: reject
      });
    });
  }
  
  /**
   * 更新内存缓存
   * @private
   * @param {String} fullKey 完整键名
   * @param {*} data 数据
   */
  _updateCache(fullKey, data) {
    this.cache[fullKey] = {
      data,
      expiry: Date.now() + this.cacheExpiry
    };
  }
  
  /**
   * 清除所有缓存
   */
  clearCache() {
    this.cache = {};
    logger.info('StorageAdapter', '已清除所有内存缓存');
  }
}

module.exports = StorageAdapter; 