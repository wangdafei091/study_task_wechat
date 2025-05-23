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
    
    // 添加事件统计
    this.stats = {
      eventCounts: {}, // 各事件发射次数统计
      listenerCounts: {}, // 各事件监听器数量统计
      totalEmits: 0, // 总发射次数
      totalListeners: 0, // 总监听器数量
      lastEmitTime: {}, // 各事件最后触发时间
      
      // 性能监控相关统计
      performanceStats: {
        payloadSizes: {},      // 各事件的数据大小
        processingTimes: {},   // 处理耗时
        optimizationSaved: 0   // 优化节省的时间
      }
    };
    
    // 配置选项
    this.optimizePayload = true; // 启用性能优化
    this.debugMode = false;      // 调试模式
  }
  
  /**
   * 设置性能优化配置
   * @param {Boolean} enabled 是否启用优化
   */
  setOptimization(enabled) {
    this.optimizePayload = !!enabled;
    logger.info('EventBus', `性能优化${this.optimizePayload ? '已启用' : '已禁用'}`);
    return this;
  }
  
  /**
   * 设置调试模式
   * @param {Boolean} enabled 是否启用调试模式
   */
  setDebugMode(enabled) {
    this.debugMode = !!enabled;
    logger.info('EventBus', `调试模式${this.debugMode ? '已启用' : '已禁用'}`);
    return this;
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
    
    // 记录开始时间（用于性能监控）
    const startTime = this.debugMode ? Date.now() : 0;
    
    // 更新统计信息
    this._updateEmitStats(event);
    
    // 使用智能拷贝机制替代深拷贝
    const safePayload = this.optimizePayload ? 
      this._createSafePayload(payload, event) : 
      JSON.parse(JSON.stringify(payload));
    
    // 在调试模式下记录原始数据哈希用于数据完整性检查
    let originalDataHash;
    if (this.debugMode) {
      try {
        originalDataHash = this._generateDataHash(payload);
      } catch (e) {
        logger.debug('EventBus', `无法生成数据哈希: ${e.message}`);
      }
    }
    
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
    
    // 记录执行时间并更新性能统计
    if (this.debugMode) {
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      // 更新处理耗时统计
      if (!this.stats.performanceStats.processingTimes[event]) {
        this.stats.performanceStats.processingTimes[event] = [];
      }
      this.stats.performanceStats.processingTimes[event].push(processingTime);
      
      // 限制存储的性能记录数量
      if (this.stats.performanceStats.processingTimes[event].length > 20) {
        this.stats.performanceStats.processingTimes[event].shift();
      }
      
      // 在调试模式下检查数据是否被修改
      try {
        const currentDataHash = this._generateDataHash(payload);
        if (originalDataHash && currentDataHash !== originalDataHash) {
          logger.warn('EventBus', `检测到事件数据被修改: ${event}`);
        }
      } catch (e) {
        logger.debug('EventBus', `无法比较数据哈希: ${e.message}`);
      }
    }
    
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
  
  /**
   * 获取事件统计信息
   * @returns {Object} 事件统计信息
   */
  getStats() {
    // 计算当前监听器数量
    const currentListeners = {};
    let totalCurrent = 0;
    
    // 计算注册的普通监听器数量
    Object.keys(this.listeners).forEach(event => {
      const count = this.listeners[event].length || 0;
      currentListeners[event] = (currentListeners[event] || 0) + count;
      totalCurrent += count;
    });
    
    // 计算注册的一次性监听器数量
    Object.keys(this.oneShotListeners).forEach(event => {
      const count = this.oneShotListeners[event].length || 0;
      currentListeners[event] = (currentListeners[event] || 0) + count;
      totalCurrent += count;
    });
    
    return {
      ...this.stats,
      currentListeners,
      totalCurrentListeners: totalCurrent
    };
  }
  
  /**
   * 获取事件系统调试信息
   * @returns {Object} 调试信息
   */
  getDebugInfo() {
    const stats = this.getStats();
    const topEvents = Object.entries(stats.eventCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([event, count]) => ({ event, count }));
      
    // 处理性能统计信息
    const performanceData = {};
    if (this.debugMode) {
      Object.entries(this.stats.performanceStats.processingTimes).forEach(([event, times]) => {
        if (times && times.length > 0) {
          // 计算平均处理时间
          const avg = times.reduce((sum, t) => sum + t, 0) / times.length;
          performanceData[event] = {
            avgTime: Math.round(avg * 100) / 100,
            samples: times.length,
            max: Math.max(...times),
            min: Math.min(...times)
          };
        }
      });
    }
    
    return {
      stats: {
        totalEmits: stats.totalEmits,
        totalListeners: stats.totalListeners,
        totalCurrentListeners: stats.totalCurrentListeners,
        uniqueEventTypes: Object.keys(stats.eventCounts).length
      },
      topEvents,
      historySize: Object.keys(this.history).reduce((sum, key) => sum + this.history[key].length, 0),
      memoryUsage: {
        listeners: Object.keys(this.listeners).length,
        oneShotListeners: Object.keys(this.oneShotListeners).length
      },
      performanceStats: this.debugMode ? performanceData : null
    };
  }
  
  /**
   * 更新事件触发统计
   * @private
   * @param {String} event 事件名称
   */
  _updateEmitStats(event) {
    // 更新触发计数
    if (!this.stats.eventCounts[event]) {
      this.stats.eventCounts[event] = 0;
    }
    this.stats.eventCounts[event]++;
    this.stats.totalEmits++;
    
    // 更新最后触发时间
    this.stats.lastEmitTime[event] = Date.now();
    
    // 更新监听器计数
    const listenerCount = this.listenerCount(event);
    this.stats.listenerCounts[event] = listenerCount;
    
    // 我们不在这里计算totalListeners，因为会重复累加
    // 而是在getStats中根据当前注册的监听器计算
  }
  
  /**
   * 创建安全的载荷数据
   * @private
   * @param {*} data 原始数据
   * @param {String} eventName 事件名称
   * @returns {*} 安全的数据副本
   */
  _createSafePayload(data, eventName) {
    // 基础类型或null直接返回
    if (data === null || data === undefined || typeof data !== 'object') {
      return data;
    }
    
    try {
      // 估计数据大小
      const dataSize = this._estimateObjectSize(data);
      
      // 记录数据大小用于调试
      if (this.debugMode && eventName) {
        this.stats.performanceStats.payloadSizes[eventName] = dataSize;
      }
      
      // 如果是小对象（小于1KB），使用浅拷贝+冻结
      if (dataSize < 1024) {
        return Object.freeze(Array.isArray(data) ? [...data] : {...data});
      } 
      // 如果是中等对象（小于5KB），使用浅拷贝+浅冻结
      else if (dataSize < 5120) {
        const clone = Array.isArray(data) ? [...data] : {...data};
        return Object.freeze(clone);
      }
      // 大对象（大于5KB）使用深拷贝确保数据安全
      else {
        const startTime = this.debugMode ? Date.now() : 0;
        const result = JSON.parse(JSON.stringify(data));
        
        // 记录深拷贝耗时
        if (this.debugMode) {
          const timeTaken = Date.now() - startTime;
          logger.debug('EventBus', `大对象深拷贝耗时: ${timeTaken}ms, 大小: ${dataSize}字节, 事件: ${eventName}`);
        }
        
        return result;
      }
    } catch (e) {
      // 如果遇到问题，回退到安全的深拷贝方法
      logger.warn('EventBus', `智能拷贝失败，回退到深拷贝: ${e.message}`);
      return JSON.parse(JSON.stringify(data));
    }
  }
  
  /**
   * 估计对象大小（字节）
   * @private
   * @param {Object} obj 要估计大小的对象
   * @returns {Number} 估计的字节大小
   */
  _estimateObjectSize(obj) {
    if (!obj) return 0;
    
    try {
      // 简单粗略估计：JSON字符串长度×2
      const jsonString = JSON.stringify(obj);
      return jsonString ? jsonString.length * 2 : 0;
    } catch (e) {
      logger.debug('EventBus', `估计对象大小失败: ${e.message}`);
      return 0;
    }
  }
  
  /**
   * 生成数据对象的哈希值（用于完整性检查）
   * @private
   * @param {Object} data 要哈希的数据
   * @returns {String} 哈希字符串
   */
  _generateDataHash(data) {
    try {
      // 使用简单的JSON哈希作为数据指纹
      const json = JSON.stringify(data);
      
      // 简单哈希算法
      let hash = 0;
      for (let i = 0; i < json.length; i++) {
        const char = json.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 转换为32位整数
      }
      
      return hash.toString(16);
    } catch (e) {
      // 无法生成哈希时返回随机值
      return Math.random().toString(36).substring(2, 15);
    }
  }
}

// 导出EventBus类，而不是实例
module.exports = EventBus; 