/**
 * service-manager.js - 服务管理器
 * 
 * 管理所有服务的实例和依赖关系
 */

const { 
  TaskService, 
  RewardService, 
  StarService, 
  MessageService
} = require('./index');

const logger = require('../utils/logger');
const EventBus = require('../utils/core/event-bus');

class ServiceManager {
  constructor() {
    this.services = {};
    this.eventBus = new EventBus();
    this.userService = null; // 用户服务实例
    
    logger.info('ServiceManager', '服务管理器初始化');
  }
  
  /**
   * 设置用户服务实例
   * @param {UserService} userService 用户服务实例
   */
  setUserService(userService) {
    this.userService = userService;
    logger.info('ServiceManager', '用户服务已注入到服务管理器');
  }
  
  /**
   * 初始化所有服务（兼容旧架构API）
   * @param {Object} options 初始化选项
   * @param {Boolean} options.enableEventDebug 是否启用事件调试
   * @param {Boolean} options.enableEventOptimization 是否启用事件优化
   * @returns {Promise<Boolean>} 初始化结果
   */
  async initialize(options = {}) {
    logger.info('ServiceManager', '初始化服务管理器');
    
    // 配置事件总线
    if (options.hasOwnProperty('enableEventDebug')) {
      this.eventBus.setDebugMode(options.enableEventDebug);
    }
    
    if (options.hasOwnProperty('enableEventOptimization')) {
      this.eventBus.setOptimization(options.enableEventOptimization);
    }
    
    try {
      // 调用现有的初始化方法
      await this.init();
      logger.info('ServiceManager', '服务管理器初始化成功');
      return true;
    } catch (error) {
      logger.error('ServiceManager', '服务管理器初始化失败', error);
      return false;
    }
  }
  
  /**
   * 初始化所有服务
   */
  async init() {
    logger.info('ServiceManager', '开始初始化所有服务');
    
    try {
      // 第一步：初始化不依赖其他服务的基础服务
      this.services.starService = new StarService({
        eventBus: this.eventBus
      });
      
      // 初始化MessageService，注入UserService依赖
      this.services.messageService = new MessageService({
        eventBus: this.eventBus,
        userService: this.userService // 注入用户服务
      });
      
      this.services.rewardService = new RewardService({
        eventBus: this.eventBus
      });
      
      // 第二步：初始化依赖StarService和RewardService的服务
      this.services.taskService = new TaskService({
        eventBus: this.eventBus,
        starService: this.services.starService,
        rewardService: this.services.rewardService
      });
      
      logger.info('ServiceManager', '所有服务初始化完成');
    } catch (error) {
      logger.error('ServiceManager', '服务初始化失败', error);
      throw error;
    }
  }
  
  /**
   * 获取服务实例（增强版，支持别名）
   * @param {String} serviceName 服务名称
   * @returns {Object} 服务实例
   */
  getService(serviceName) {
    // 服务名别名映射
    const serviceNameMap = {
      'task': 'taskService',
      'taskService': 'taskService',
      'TaskService': 'taskService',
      
      'star': 'starService', 
      'starService': 'starService',
      'StarService': 'starService',
      
      'reward': 'rewardService',
      'rewardService': 'rewardService',
      'RewardService': 'rewardService',
      
      'message': 'messageService',
      'messageService': 'messageService',
      'MessageService': 'messageService',
      
      'eventBus': 'eventBus'
    };
    
    const mappedServiceName = serviceNameMap[serviceName] || serviceName;
    
    if (mappedServiceName === 'eventBus') {
      return this.eventBus;
    }
    
    const service = this.services[mappedServiceName];
    if (!service) {
      logger.warn('ServiceManager', `尝试获取不存在的服务: ${serviceName} (映射为: ${mappedServiceName})`);
    }
    return service;
  }
  
  /**
   * 获取任务服务
   * @returns {TaskService} 任务服务实例
   */
  getTaskService() {
    return this.services.taskService;
  }
  
  /**
   * 获取奖励服务
   * @returns {RewardService} 奖励服务实例
   */
  getRewardService() {
    return this.services.rewardService;
  }
  
  /**
   * 获取星星服务
   * @returns {StarService} 星星服务实例
   */
  getStarService() {
    return this.services.starService;
  }
  
  /**
   * 获取消息服务
   * @returns {MessageService} 消息服务实例
   */
  getMessageService() {
    return this.services.messageService;
  }
  
  /**
   * 获取用户服务
   * @returns {UserService} 用户服务实例
   */
  getUserService() {
    return this.userService;
  }
  
  /**
   * 获取事件总线
   * @returns {EventBus} 事件总线实例
   */
  getEventBus() {
    return this.eventBus;
  }
  
  /**
   * 获取分析服务（动态加载分包中的服务）
   * @returns {AnalyticsService} 分析服务实例
   */
  getAnalyticsService() {
    // 如果已经加载过，直接返回
    if (this.services.analyticsService) {
      return this.services.analyticsService;
    }
    
    try {
      // 动态加载分包中的AnalyticsService
      const AnalyticsService = require('../packageChart/services/analytics-service');
      
      // 初始化分析服务
      this.services.analyticsService = new AnalyticsService({
        eventBus: this.eventBus,
        starService: this.services.starService,
        taskService: this.services.taskService
      });
      
      logger.info('ServiceManager', '动态加载分包AnalyticsService成功');
      return this.services.analyticsService;
    } catch (error) {
      logger.error('ServiceManager', '动态加载分包AnalyticsService失败', error);
      return null;
    }
  }
}

// 导出单例
const serviceManager = new ServiceManager();
module.exports = serviceManager; 