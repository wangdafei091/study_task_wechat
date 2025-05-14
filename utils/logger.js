/**
 * logger.js - 统一日志工具
 * 
 * 提供统一的日志记录接口，统一格式和级别
 */

const logger = {
  /**
   * 记录普通信息
   * @param {String} module 模块名称
   * @param {String} message 日志信息
   * @param {Object} data 附加数据
   */
  log: function(module, message, data) {
    console.log(`[${module}] ${message}`, data || '');
  },

  /**
   * 记录流程节点信息
   * @param {String} module 模块名称
   * @param {String} message 日志信息
   * @param {Object} data 附加数据
   */
  info: function(module, message, data) {
    console.info(`[${module}] ${message}`, data || '');
  },

  /**
   * 记录调试信息（详细级别）
   * @param {String} module 模块名称
   * @param {String} message 日志信息
   * @param {Object} data 附加数据
   */
  debug: function(module, message, data) {
    console.log(`[${module}][DEBUG] ${message}`, data || '');
  },

  /**
   * 记录警告信息
   * @param {String} module 模块名称
   * @param {String} message 日志信息
   * @param {Object} data 附加数据
   */
  warn: function(module, message, data) {
    console.warn(`[${module}] ${message}`, data || '');
  },

  /**
   * 记录错误信息
   * @param {String} module 模块名称
   * @param {String} message 日志信息
   * @param {Object} data 附加数据
   */
  error: function(module, message, data) {
    console.error(`[${module}] ${message}`, data || '');
  }
};

module.exports = logger; 