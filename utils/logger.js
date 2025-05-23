/**
 * logger.js - 日志工具
 * 
 * 提供统一的日志记录功能，可被全局使用
 * 支持环境自适应的日志级别控制和配置
 */

// 日志级别定义
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 99
};

// 日志级别映射
const LogLevelMap = {
  'debug': LogLevel.DEBUG,
  'info': LogLevel.INFO,
  'warn': LogLevel.WARN,
  'error': LogLevel.ERROR,
  'none': LogLevel.NONE
};

const Logger = {
  // 当前日志级别
  _currentLevel: null,
  
  /**
   * 记录信息日志
   * @param {String} module 模块名称
   * @param {String} message 日志消息
   * @param {Object} data 附加数据，可选
   */
  info(module, message, data) {
    if (this._shouldLog('INFO')) {
      this._log('INFO', module, message, data);
    }
  },
  
  /**
   * 记录警告日志
   * @param {String} module 模块名称
   * @param {String} message 日志消息
   * @param {Object} data 附加数据，可选
   */
  warn(module, message, data) {
    if (this._shouldLog('WARN')) {
      this._log('WARN', module, message, data);
    }
  },
  
  /**
   * 记录错误日志
   * @param {String} module 模块名称
   * @param {String} message 日志消息
   * @param {Error|Object} error 错误对象或附加数据，可选
   */
  error(module, message, error) {
    if (this._shouldLog('ERROR')) {
      this._log('ERROR', module, message, error);
    }
  },
  
  /**
   * 记录调试日志
   * @param {String} module 模块名称
   * @param {String} message 日志消息
   * @param {Object} data 附加数据，可选
   */
  debug(module, message, data) {
    if (this._shouldLog('DEBUG')) {
      this._log('DEBUG', module, message, data);
    }
  },
  
  /**
   * 专门记录事件相关的日志
   * @param {String} eventName 事件名称
   * @param {Object} eventData 事件数据
   * @param {Object} context 上下文信息
   */
  logEvent(eventName, eventData, context = {}) {
    if (this._shouldLog('INFO')) {
      const module = context.module || 'Event';
      const direction = context.direction || 'emit';
      const formattedData = this._formatEventData(eventData);
      const message = `${direction === 'on' ? '监听' : '发布'}事件: ${eventName}`;
      
      this._log('INFO', module, message, {
        eventName,
        direction,
        ...context,
        data: formattedData
      });
    }
  },
  
  /**
   * 格式化事件数据，避免日志过大
   * @private
   * @param {Object} data 事件数据
   * @returns {Object} 格式化后的数据
   */
  _formatEventData(data) {
    if (!data) return null;
    
    try {
      // 对象太大或嵌套太深时进行简化
      if (typeof data === 'object') {
        const simpleData = {};
        
        // 只保留第一层属性
        Object.keys(data).forEach(key => {
          const value = data[key];
          if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
              simpleData[key] = `Array(${value.length})`;
            } else {
              simpleData[key] = `Object(${Object.keys(value).length} props)`;
            }
          } else {
            simpleData[key] = value;
          }
        });
        
        return simpleData;
      }
      
      return data;
    } catch (err) {
      return '数据格式化失败';
    }
  },
  
  /**
   * 设置日志级别
   * @param {String} level 日志级别 'debug'|'info'|'warn'|'error'|'none'
   * @returns {Boolean} 是否设置成功
   */
  setLevel(level) {
    if (LogLevelMap[level] !== undefined) {
      this._currentLevel = level;
      return true;
    }
    return false;
  },
  
  /**
   * 获取当前日志级别
   * @returns {String} 当前日志级别
   */
  getLevel() {
    return this._getCurrentLevel();
  },
  
  /**
   * 检测当前环境并返回适合的日志级别
   * @private
   * @returns {String} 日志级别
   */
  _detectEnvironmentLevel() {
    try {
      if (typeof wx !== 'undefined') {
        const systemInfo = wx.getSystemInfoSync();
        // 微信开发者工具环境
        if (systemInfo.platform === 'devtools') {
          return 'debug';
        }
      }
      // 生产环境
      return 'error';
    } catch (e) {
      // 错误时默认使用info级别
      return 'info';
    }
  },
  
  /**
   * 获取当前配置的日志级别
   * @private
   * @returns {String} 日志级别
   */
  _getCurrentLevel() {
    if (!this._currentLevel) {
      this._currentLevel = this._detectEnvironmentLevel();
    }
    return this._currentLevel;
  },
  
  /**
   * 检查是否应该记录指定级别的日志
   * @private
   * @param {String} level 日志级别
   * @returns {Boolean} 是否应该记录
   */
  _shouldLog(level) {
    const currentLevel = this._getCurrentLevel();
    const currentValue = LogLevelMap[currentLevel.toLowerCase()] || LogLevel.INFO;
    const messageValue = LogLevelMap[level.toUpperCase()] || LogLevelMap[level.toLowerCase()] || LogLevel.INFO;
    
    return messageValue >= currentValue;
  },
  
  /**
   * 内部日志记录方法
   * @private
   * @param {String} level 日志级别
   * @param {String} module 模块名称
   * @param {String} message 日志消息
   * @param {Object} data 附加数据，可选
   */
  _log(level, module, message, data) {
    // 使用本地时间格式而非UTC
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
    
    const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
    const moduleStr = module ? `[${module}] ` : '';
    const logMsg = `${timestamp} ${level} ${moduleStr}${message}`;
    
    switch (level) {
      case 'ERROR':
        console.error(logMsg);
        if (data instanceof Error) {
          console.error(data.stack || data.message || data);
        } else if (data) {
          console.error(data);
        }
        break;
      case 'WARN':
        console.warn(logMsg);
        if (data) console.warn(data);
        break;
      case 'INFO':
        console.log(logMsg);
        if (data) console.log(data);
        break;
      default:
        console.debug(logMsg);
        if (data) console.debug(data);
        break;
    }
    
    // 这里可以添加将日志保存到文件或发送到服务器的逻辑
    
    // 触发日志记录事件
    if (typeof wx !== 'undefined' && wx.getEventEmitter) {
      try {
        const eventEmitter = wx.getEventEmitter();
        eventEmitter.emit('log', {
          level,
          module,
          message,
          data,
          timestamp
        });
      } catch (e) {
        // 忽略事件发送错误
      }
    }
  }
};

module.exports = Logger; 