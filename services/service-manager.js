/**
 * service-manager.js - 服务管理器
 * 
 * 管理所有服务的实例和依赖关系
 */

const { 
  TaskService, 
  RewardService, 
  StarService, 
  MessageService,
  OfflineQueueService
} = require('./index');
const ValidationService = require('./validation-service');
const ConfigService = require('./config-service');

const logger = require('../utils/logger');
const EventBus = require('../utils/core/event-bus');
const StorageAdapter = require('../adapters/storage-adapter');

class ServiceManager {
  constructor() {
    this.services = {};
    this.eventBus = new EventBus();
    this.userService = null; // 用户服务实例
    this.storageAdapter = new StorageAdapter(); // 创建存储适配器实例
    this.isInitialized = false; // 添加初始化状态标记
    this.initializationPromise = null; // 初始化Promise，避免重复初始化
    
    logger.info('ServiceManager', '服务管理器初始化');
  }

  _resolveOfflineQueueContext() {
    const loginUser = this.userService?.getLoginUser?.();
    const currentUser = this.userService?.getCurrentUser?.();
    const fallbackCurrentUserId = this.userService?.getCurrentUserId?.() || null;

    return {
      familyId: loginUser?.familyId || currentUser?.familyId || null,
      loginUserId: loginUser?.userId || loginUser?.id || null,
      actorUserId: currentUser?.userId || currentUser?.id || fallbackCurrentUserId || loginUser?.userId || loginUser?.id || null,
      actorRole: currentUser?.role || loginUser?.role || 'system',
      targetUserId: currentUser?.userId || currentUser?.id || fallbackCurrentUserId || null
    };
  }
  
  /**
   * 设置用户服务实例
   * @param {UserService} userService 用户服务实例
   */
  setUserService(userService) {
    this.userService = userService;

    // 如果其他服务已经初始化，确保它们能够访问到更新后的UserService
    // 重新初始化其他服务以注入UserService依赖
    this._reinitDependentServices();

    logger.info('ServiceManager', '用户服务已注入到服务管理器');
  }

  /**
   * 重新初始化依赖UserService的服务
   */
  _reinitDependentServices() {
    // 如果某些服务在构造或初始化时缓存了UserService实例
    // 需要更新它们以获得最新的UserService

    // 检查TaskService（使用正确的this.services路径）
    if (this.services.taskService && this.services.taskService.updateUserService) {
      this.services.taskService.updateUserService(this.userService);
      logger.info('ServiceManager', 'TaskService已更新UserService');
    }

    // 检查RewardService（使用正确的this.services路径）
    if (this.services.rewardService && this.services.rewardService.updateUserService) {
      this.services.rewardService.updateUserService(this.userService);
      logger.info('ServiceManager', 'RewardService已更新UserService');
    }

    if (this.services.rewardService && this.services.starService && this.services.rewardService.updateStarService) {
      this.services.rewardService.updateStarService(this.services.starService);
      logger.info('ServiceManager', 'RewardService已更新StarService');
    }

    // 检查MessageService（使用正确的this.services路径）
    if (this.services.messageService && this.services.messageService.updateUserService) {
      this.services.messageService.updateUserService(this.userService);
      logger.info('ServiceManager', 'MessageService已更新UserService');
    }

    // 检查其他可能需要UserService更新的服务
    // 如果需要，可以在这里添加更多的检查和更新逻辑
  }
  
  /**
   * 初始化所有服务（兼容旧架构API）
   * @param {Object} options 初始化选项
   * @param {Boolean} options.enableEventDebug 是否启用事件调试
   * @param {Boolean} options.enableEventOptimization 是否启用事件优化
   * @returns {Promise<Boolean>} 初始化结果
   */
  async initialize(options = {}) {
    // 如果已经初始化，直接返回true
    if (this.isInitialized) {
      return true;
    }
    
    // 如果正在初始化，等待初始化完成
    if (this.initializationPromise) {
      return await this.initializationPromise;
    }
    
    logger.info('ServiceManager', '初始化服务管理器');
    
    // 创建初始化Promise
    this.initializationPromise = this._doInitialize(options);
    
    const result = await this.initializationPromise;
    this.initializationPromise = null;
    
    return result;
  }
  
  /**
   * 执行实际的初始化逻辑
   * @param {Object} options 初始化选项
   * @returns {Promise<Boolean>} 初始化结果
   */
  async _doInitialize(options = {}) {
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
      this.isInitialized = true;
      logger.info('ServiceManager', '服务管理器初始化成功');
      return true;
    } catch (error) {
      logger.error('ServiceManager', '服务管理器初始化失败', error);
      return false;
    }
  }
  
  /**
   * 等待服务管理器初始化完成
   * @param {Number} maxWaitTime 最大等待时间（毫秒），默认10秒
   * @returns {Promise<Boolean>} 是否初始化成功
   */
  async waitForInitialization(maxWaitTime = 10000) {
    if (this.isInitialized) {
      return true;
    }
    
    const startTime = Date.now();
    
    while (!this.isInitialized && (Date.now() - startTime) < maxWaitTime) {
      // 等待100ms后再检查
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return this.isInitialized;
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
        eventBus: this.eventBus,
        starService: this.services.starService,
        userService: this.userService, // 注入用户服务
        storageAdapter: this.storageAdapter // 注入存储适配器
      });
      
      // 第二步：初始化依赖StarService和RewardService的服务
      this.services.taskService = new TaskService({
        eventBus: this.eventBus,
        starService: this.services.starService,
        rewardService: this.services.rewardService,
        userService: this.userService // 注入用户服务
      });
      
      // 第三步：初始化表单验证服务（无依赖）
      this.services.validationService = new ValidationService();
      
      // 第四步：初始化配置服务
      this.services.configService = new ConfigService({
        eventBus: this.eventBus
      });

      this.services.offlineQueueService = new OfflineQueueService({
        eventBus: this.eventBus,
        storageAdapter: this.storageAdapter,
        contextResolver: () => this._resolveOfflineQueueContext(),
        migrators: [
          () => this.services.taskService.buildLegacyQueueCandidates(),
          () => this.services.rewardService.buildLegacyQueueCandidates()
        ]
      });

      this.services.taskService.updateOfflineQueueService(this.services.offlineQueueService);
      this.services.rewardService.updateOfflineQueueService(this.services.offlineQueueService);
      
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
    // 如果服务管理器未初始化，提供警告但不返回undefined
    if (!this.isInitialized) {
      logger.warn('ServiceManager', `服务管理器未初始化，尝试获取服务: ${serviceName}`);
      return null; // 返回null而非undefined，便于调用方判断
    }
    
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
      
      'validation': 'validationService',
      'validationService': 'validationService',
      'ValidationService': 'validationService',
      
      'config': 'configService',
      'configService': 'configService',
      'ConfigService': 'configService',

      'offlineQueue': 'offlineQueueService',
      'offlineQueueService': 'offlineQueueService',
      'OfflineQueueService': 'offlineQueueService',
      
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
    return service || null; // 确保返回null而非undefined
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

  getOfflineQueueService() {
    return this.services.offlineQueueService;
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
   * 获取分析服务
   * @returns {AnalyticsService} 分析服务实例
   */
  getAnalyticsService() {
    // 如果已经加载过，直接返回
    if (this.services.analyticsService) {
      return this.services.analyticsService;
    }
    
    try {
      const AnalyticsService = require('./analytics-service');
      
      // 初始化分析服务
      this.services.analyticsService = new AnalyticsService({
        eventBus: this.eventBus,
        starService: this.services.starService,
        taskService: this.services.taskService
      });
      
      logger.info('ServiceManager', '加载AnalyticsService成功');
      return this.services.analyticsService;
    } catch (error) {
      logger.error('ServiceManager', '加载AnalyticsService失败', error);
      return null;
    }
  }
}

// 导出单例
const serviceManager = new ServiceManager();
module.exports = serviceManager; 
