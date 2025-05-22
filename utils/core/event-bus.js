/**
 * event-bus.js - 事件总线工具类
 * 
 * 提供统一的事件发布/订阅机制，用于组件间的松耦合通信
 */

const logger = require('../logger');

class EventBus {
  constructor() {
    this.listeners = {};
    this.oneShotListeners = {};
    this.history = {};
    this.historyLimit = 50;
  }
  
  /**
   * 注册事件监听器
   * @param {String} event 事件名称
   * @param {Function} callback 回调函数
   * @param {Object} options 选项配置
   * @param {Boolean} options.once 是否为一次性监听器
   * @returns {Function} 返回取消监听的函数
   */
  on(event, callback, options = {}) {
    if (!event || typeof callback !== 'function') {
      logger.warn('EventBus', '注册事件监听器时提供了无效参数', { event, hasCallback: !!callback });
      return () => {};
    }
    
    // 初始化事件监听器数组
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    
    // 如果是一次性监听器
    if (options.once === true) {
      if (!this.oneShotListeners[event]) {
        this.oneShotListeners[event] = [];
      }
      this.oneShotListeners[event].push(callback);
    } else {
      this.listeners[event].push(callback);
    }
    
    logger.info('EventBus', `注册事件监听器: ${event}, 一次性=${options.once === true}`);
    
    // 返回取消监听的函数
    return () => this.off(event, callback);
  }
  
  /**
   * 注册一次性事件监听器
   * @param {String} event 事件名称
   * @param {Function} callback 回调函数
   * @returns {Function} 返回取消监听的函数
   */
  once(event, callback) {
    return this.on(event, callback, { once: true });
  }
  
  /**
   * 移除事件监听器
   * @param {String} event 事件名称
   * @param {Function} callback 回调函数，如果不提供则移除该事件的所有监听器
   */
  off(event, callback) {
    if (!event) {
      logger.warn('EventBus', '移除事件监听器时提供了无效的事件名称');
      return;
    }
    
    if (!callback) {
      // 移除该事件的所有监听器
      delete this.listeners[event];
      delete this.oneShotListeners[event];
      logger.info('EventBus', `移除事件的所有监听器: ${event}`);
      return;
    }
    
    // 从普通监听器中移除
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(listener => listener !== callback);
      if (this.listeners[event].length === 0) {
        delete this.listeners[event];
      }
    }
    
    // 从一次性监听器中移除
    if (this.oneShotListeners[event]) {
      this.oneShotListeners[event] = this.oneShotListeners[event].filter(listener => listener !== callback);
      if (this.oneShotListeners[event].length === 0) {
        delete this.oneShotListeners[event];
      }
    }
    
    logger.info('EventBus', `移除特定事件监听器: ${event}`);
  }
  
  /**
   * 发布事件
   * @param {String} event 事件名称
   * @param {*} data 事件数据
   */
  emit(event, data) {
    if (!event) {
      logger.warn('EventBus', '发布事件时提供了无效的事件名称');
      return;
    }
    
    const payload = data || {};
    let callbackCount = 0;
    let errorCount = 0;
    
    // 深拷贝数据，避免处理器修改原始数据影响其他处理器
    const safePayload = JSON.parse(JSON.stringify(payload));
    
    // 调用普通监听器
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(safePayload);
          callbackCount++;
        } catch (error) {
          errorCount++;
          logger.error('EventBus', `事件处理器出错: ${event}`, error);
        }
      });
    }
    
    // 调用一次性监听器
    if (this.oneShotListeners[event]) {
      const oneShots = [...this.oneShotListeners[event]];
      delete this.oneShotListeners[event];
      
      oneShots.forEach(callback => {
        try {
          callback(safePayload);
          callbackCount++;
        } catch (error) {
          errorCount++;
          logger.error('EventBus', `一次性事件处理器出错: ${event}`, error);
        }
      });
    }
    
    // 保存事件历史
    this._saveEventHistory(event, payload);
    
    logger.info('EventBus', `事件已发布: ${event}, 监听器数量=${callbackCount}${errorCount > 0 ? `, 错误数=${errorCount}` : ''}`);
    return callbackCount;
  }
  
  /**
   * 检查事件是否有监听器
   * @param {String} event 事件名称
   * @returns {Boolean} 是否有监听器
   */
  hasListeners(event) {
    if (!event) {
      return false;
    }
    
    const hasRegularListeners = this.listeners[event] && this.listeners[event].length > 0;
    const hasOneShotListeners = this.oneShotListeners[event] && this.oneShotListeners[event].length > 0;
    
    return hasRegularListeners || hasOneShotListeners;
  }
  
  /**
   * 获取事件监听器数量
   * @param {String} event 事件名称
   * @returns {Number} 监听器数量
   */
  listenerCount(event) {
    if (!event) {
      return 0;
    }
    
    const regularCount = this.listeners[event] ? this.listeners[event].length : 0;
    const oneShotCount = this.oneShotListeners[event] ? this.oneShotListeners[event].length : 0;
    
    return regularCount + oneShotCount;
  }
  
  /**
   * 获取事件历史
   * @param {String} event 事件名称
   * @returns {Array} 事件历史数组
   */
  getEventHistory(event) {
    if (!event || !this.history[event]) {
      return [];
    }
    
    return [...this.history[event]];
  }
  
  /**
   * 清除所有事件监听器
   */
  clear() {
    this.listeners = {};
    this.oneShotListeners = {};
    logger.info('EventBus', '已清除所有事件监听器');
  }
  
  /**
   * 保存事件历史
   * @private
   * @param {String} event 事件名称
   * @param {*} data 事件数据
   */
  _saveEventHistory(event, data) {
    if (!this.history[event]) {
      this.history[event] = [];
    }
    
    // 添加新事件到历史
    this.history[event].push({
      timestamp: Date.now(),
      data
    });
    
    // 限制历史记录长度
    if (this.history[event].length > this.historyLimit) {
      this.history[event] = this.history[event].slice(-this.historyLimit);
    }
  }
}

// 导出EventBus类，而不是实例
module.exports = EventBus; 