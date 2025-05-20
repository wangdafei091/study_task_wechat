/**
 * logger.js - 日志工具
 * 
 * 提供统一的日志记录功能，可被全局使用
 */

const Logger = {
  /**
   * 记录信息日志
   * @param {String} module 模块名称
   * @param {String} message 日志消息
   * @param {Object} data 附加数据，可选
   */
  info(module, message, data) {
    this._log('INFO', module, message, data);
  },
  
  /**
   * 记录警告日志
   * @param {String} module 模块名称
   * @param {String} message 日志消息
   * @param {Object} data 附加数据，可选
   */
  warn(module, message, data) {
    this._log('WARN', module, message, data);
  },
  
  /**
   * 记录错误日志
   * @param {String} module 模块名称
   * @param {String} message 日志消息
   * @param {Error|Object} error 错误对象或附加数据，可选
   */
  error(module, message, error) {
    this._log('ERROR', module, message, error);
  },
  
  /**
   * 记录调试日志
   * @param {String} module 模块名称
   * @param {String} message 日志消息
   * @param {Object} data 附加数据，可选
   */
  debug(module, message, data) {
    // 可以根据环境变量控制是否输出调试日志
    const enableDebug = true;
    if (enableDebug) {
      this._log('DEBUG', module, message, data);
    }
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
    const timestamp = new Date().toISOString();
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