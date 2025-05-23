/**
 * 服务管理器 - 用于统一管理所有服务
 * 提供统一的服务获取接口
 */
const logger = require('./logger');
const EventBus = require('./core/event-bus');
const { EVENTS } = require('./constants');

// 导入新架构服务
const { RewardService, StarService, TaskService, MessageService } = require('../services/index');

/**
 * 共享的事件总线实例
 */
const sharedEventBus = new EventBus();

/**
 * 服务实例缓存
 */
const serviceInstances = {
  rewardService: null,
  starService: null,
  taskService: null,
  messageService: null
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
    logger.info('ServiceManager', '初始化服务管理器');
    
    try {
      // 先初始化基础服务
      serviceInstances.starService = new StarService({
        eventBus: sharedEventBus
      });
      
      // 初始化任务服务
      serviceInstances.taskService = new TaskService({
        starService: serviceInstances.starService,
        eventBus: sharedEventBus
      });
      
      // 初始化消息服务
      serviceInstances.messageService = new MessageService({
        eventBus: sharedEventBus
      });
      
      // 初始化奖励服务
      serviceInstances.rewardService = new RewardService({
        starService: serviceInstances.starService,
        eventBus: sharedEventBus
      });
      
      // 顺序初始化所有服务
      await serviceInstances.starService.initialize();
      await serviceInstances.taskService.initialize();
      await serviceInstances.messageService.initialize();
      await serviceInstances.rewardService.initialize();
      
      // 设置事件监控
      this._setupEventMonitoring();
      
      logger.info('ServiceManager', '服务管理器初始化成功');
      return true;
    } catch (error) {
      logger.error('ServiceManager', '服务管理器初始化失败', error);
      return false;
    }
  },
  
  /**
   * 设置事件监控
   * 定期输出事件统计信息
   * @private
   */
  _setupEventMonitoring() {
    // 只在开发环境启用事件监控
    if (typeof wx !== 'undefined') {
      const systemInfo = wx.getSystemInfoSync();
      if (systemInfo.platform !== 'devtools') {
        logger.info('ServiceManager', '非开发环境，不启用事件监控');
        return;
      }
    }
    
    logger.info('ServiceManager', '启用事件监控');
    
    // 定期输出事件统计信息
    setInterval(() => {
      try {
        const stats = sharedEventBus.getStats();
        
        // 如果没有事件触发，不输出统计信息
        if (stats.totalEmits === 0) {
          return;
        }
        
        logger.info('EventMonitor', `事件统计: 总触发=${stats.totalEmits}, 总监听器=${stats.totalCurrentListeners}`);
        
        // 获取详细调试信息
        const debugInfo = sharedEventBus.getDebugInfo();
        
        // 输出前5个最常触发的事件
        if (debugInfo.topEvents && debugInfo.topEvents.length > 0) {
          const topEventsText = debugInfo.topEvents
            .slice(0, 5)
            .map(e => `${e.event}(${e.count})`)
            .join(', ');
          
          logger.info('EventMonitor', `热门事件: ${topEventsText}`);
        }
        
      } catch (error) {
        logger.error('EventMonitor', '事件统计发生错误', error);
      }
    }, 60000); // 每分钟输出一次统计
  },
  
  /**
   * 获取当前事件统计信息
   * @returns {Object} 事件统计信息
   */
  getEventStats() {
    return sharedEventBus.getStats();
  },
  
  /**
   * 获取事件调试信息
   * @returns {Object} 事件调试信息
   */
  getEventDebugInfo() {
    return sharedEventBus.getDebugInfo();
  },
  
  /**
   * 获取消息管理器
   * @returns {Object} 消息管理器实例
   * @deprecated 请使用getMessageService代替
   */
  getMessageManager() {
    logger.warn('ServiceManager', '使用已废弃的getMessageManager方法，请使用getMessageService');
    return this.getMessageService();
  },
  
  /**
   * 获取任务服务
   * @returns {TaskService} 任务服务实例
   */
  getTaskService() {
    logger.info('ServiceManager', '使用任务服务');
    
    if (!serviceInstances.taskService) {
      serviceInstances.taskService = new TaskService({
        starService: this.getStarService(),
        eventBus: this.getEventBus()
      });
    }
    
    return serviceInstances.taskService;
  },
  
  /**
   * 获取消息服务
   * @returns {MessageService} 消息服务实例
   */
  getMessageService() {
    logger.info('ServiceService', '使用消息服务');
    
    if (!serviceInstances.messageService) {
      serviceInstances.messageService = new MessageService({
        eventBus: this.getEventBus()
      });
    }
    
    return serviceInstances.messageService;
  },
  
  /**
   * 获取星星服务
   * @returns {StarService} 星星服务实例
   */
  getStarService() {
    logger.info('ServiceManager', '使用星星服务');
    
    if (!serviceInstances.starService) {
      serviceInstances.starService = new StarService({
        eventBus: this.getEventBus()
      });
    }
    
    return serviceInstances.starService;
  },
  
  /**
   * 获取奖励服务
   * @returns {RewardService} 奖励服务实例
   */
  getRewardService() {
    logger.info('ServiceManager', '使用奖励服务');
    
    if (!serviceInstances.rewardService) {
      serviceInstances.rewardService = new RewardService({
        starService: this.getStarService(),
        eventBus: this.getEventBus()
      });
    }
    
    return serviceInstances.rewardService;
  },
  
  /**
   * 获取共享事件总线
   * @returns {EventBus} 事件总线实例
   */
  getEventBus() {
    return sharedEventBus;
  },
  
  /**
   * 获取服务实例（通用方法）
   * @param {String} serviceName 服务名称
   * @returns {Object|null} 服务实例或null
   */
  getService(serviceName) {
    logger.info('ServiceManager', '获取服务实例:', serviceName);
    
    switch (serviceName) {
      case 'task':
      case 'taskService':
        return this.getTaskService();
        
      case 'message':
      case 'messageService':
        return this.getMessageService();
        
      case 'star':
      case 'starService':
        return this.getStarService();
        
      case 'reward':
      case 'rewardService':
        return this.getRewardService();
        
      default:
        logger.warn('ServiceManager', '未知的服务名称:', serviceName);
        return null;
    }
  }
};

module.exports = serviceManager; 