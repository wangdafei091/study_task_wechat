/**
 * 服务管理器 - 用于统一管理所有服务
 * 提供统一的服务获取接口
 */
const logger = require('./logger');

// 导入现有服务
const oldTaskManager = require('./taskManager');
const oldMessageManager = require('./messageManager');
const oldPointsManager = require('./pointsManager');

// 导入新架构服务
const { RewardService, StarService } = require('../services/index');

/**
 * 服务实例缓存
 */
const serviceInstances = {
  rewardService: null,
  starService: null
};

/**
 * 服务管理器
 * 提供服务获取功能
 */
const serviceManager = {
  /**
   * 初始化服务管理器
   * @returns {Promise<Boolean>} 初始化结果
   */
  async initialize() {
    logger.info('[ServiceManager] 初始化服务管理器');
    
    try {
      // 初始化新架构服务
      serviceInstances.rewardService = new RewardService();
      serviceInstances.starService = new StarService();
      
      // 初始化服务
      await serviceInstances.starService.initialize();
      await serviceInstances.rewardService.initialize();
      
      logger.info('[ServiceManager] 服务管理器初始化成功');
      return true;
    } catch (error) {
      logger.error('[ServiceManager] 服务管理器初始化失败', error);
      return false;
    }
  },

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
  },
  
  /**
   * 获取服务实例
   * @param {String} serviceName 服务名称
   * @returns {Object|null} 服务实例或null
   */
  getService(serviceName) {
    logger.info('[ServiceManager] 获取服务实例:', serviceName);
    
    switch (serviceName) {
      case 'rewardService':
        if (!serviceInstances.rewardService) {
          serviceInstances.rewardService = new RewardService();
        }
        return serviceInstances.rewardService;
        
      case 'starService':
        if (!serviceInstances.starService) {
          serviceInstances.starService = new StarService();
        }
        return serviceInstances.starService;
        
      default:
        logger.warn('[ServiceManager] 未知的服务名称:', serviceName);
        return null;
    }
  }
};

module.exports = serviceManager; 