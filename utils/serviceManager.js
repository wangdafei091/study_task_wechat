/**
 * 服务管理器 - 用于统一管理所有服务
 * 提供统一的服务获取接口
 */
const logger = require('./logger');

// 导入现有服务
const oldTaskManager = require('./taskManager');
const oldMessageManager = require('./messageManager');
const oldPointsManager = require('./pointsManager');

/**
 * 服务管理器
 * 提供服务获取功能
 */
const serviceManager = {
  /**
   * 获取任务管理器
   * @returns {Object} 任务管理器实例
   */
  getTaskManager() {
    logger.info('[ServiceManager] 使用任务管理器');
    return oldTaskManager;
  },
  
  /**
   * 获取消息管理器
   * @returns {Object} 消息管理器实例
   */
  getMessageManager() {
    logger.info('[ServiceManager] 使用消息管理器');
    return oldMessageManager;
  },
  
  /**
   * 获取积分管理器
   * @returns {Object} 积分管理器实例
   */
  getPointsManager() {
    logger.info('[ServiceManager] 使用积分管理器');
    return oldPointsManager;
  }
};

module.exports = serviceManager; 