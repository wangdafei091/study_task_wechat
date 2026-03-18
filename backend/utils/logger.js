/**
 * 日志工具
 */

const LOG_LEVELS = {
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
};

class Logger {
  constructor(context) {
    this.context = context || 'App';
  }

  /**
   * 输出信息日志
   * @param {string} message - 日志信息
   * @param {Object} data - 附加数据
   */
  info(message, data = null) {
    this._log(LOG_LEVELS.INFO, message, data);
  }

  /**
   * 输出警告日志
   * @param {string} message - 日志信息
   * @param {Object} data - 附加数据
   */
  warn(message, data = null) {
    this._log(LOG_LEVELS.WARN, message, data);
  }

  /**
   * 输出错误日志
   * @param {string} message - 日志信息
   * @param {Object} data - 附加数据
   */
  error(message, data = null) {
    this._log(LOG_LEVELS.ERROR, message, data);
  }

  /**
   * 内部日志方法
   * @param {string} level - 日志级别
   * @param {string} message - 日志信息
   * @param {Object} data - 附加数据
   */
  _log(level, message, data) {
    const timestamp = new Date().toISOString();
    const logData = data ? JSON.stringify(data, null, 2) : '';

    const logMessage = `[${timestamp}] [${level.toUpperCase()}] [${this.context}] ${message} ${logData}`;

    switch (level) {
      case LOG_LEVELS.INFO:
        console.log(logMessage);
        break;
      case LOG_LEVELS.WARN:
        console.warn(logMessage);
        break;
      case LOG_LEVELS.ERROR:
        console.error(logMessage);
        break;
      default:
        console.log(logMessage);
    }
  }
}

/**
 * 创建日志实例
 * @param {string} context - 日志上下文
 * @returns {Logger} 日志实例
 */
function createLogger(context) {
  return new Logger(context);
}

module.exports = {
  Logger,
  createLogger,
  LOG_LEVELS,
};
