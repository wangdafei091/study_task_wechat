// app.js
const { ensureDefaultRuntimeApiConfig, resolveRuntimeApiConfig } = require('./utils/runtime-config');

// 在 require 其他依赖前补齐默认云端配置，避免冷启动时 api-config 过早读到空 storage。
ensureDefaultRuntimeApiConfig({
  enableApi: 'true',
  baseUrl: 'https://api.todoceo.xyz'
});

const StorageAdapter = require('./adapters/storage-adapter'); // 引入存储适配器
const serviceManager = require('./services/service-manager.js'); // 引入服务管理器
const logger = require('./utils/logger');
const logConfig = require('./utils/log-config');
const deviceInfo = require('./utils/deviceInfo'); // 引入设备信息工具
const EventBus = require('./utils/core/event-bus'); // 引入事件总线
const bootstrapAuth = require('./utils/app/bootstrap-auth');
const bootstrapServices = require('./utils/app/bootstrap-services');
const postLoginBootstrap = require('./utils/app/post-login-bootstrap');
const runtimeObservers = require('./utils/app/runtime-observers');

App({
  onLaunch: async function () {
    // 原地补齐启动状态，避免覆盖默认 globalData 契约和 getter。
    this.globalData.appReady = false;
    this.globalData.userServiceReady = false;
    this.globalData.servicesInitialized = false;
    this.globalData.eventCallbacks = this.globalData.eventCallbacks || {};
    const runtimeApiConfig = resolveRuntimeApiConfig();
    logger.info('App', 'onLaunch环境配置检查', {
      enableApi: runtimeApiConfig.enableApiRaw,
      baseUrl: runtimeApiConfig.baseUrlRaw,
      enabled: runtimeApiConfig.enabled,
      source: runtimeApiConfig.source
    });

    // 初始化日志系统
    this.initLogSystem();

    // 初始化存储数据
    logger.info('App', '初始化存储数据');
    StorageAdapter.initializeApplicationStorage();

    // 确定是否为开发环境，用于配置事件总线
    const isDevEnv = deviceInfo.isDevelopmentEnv();
    await bootstrapAuth.prepareUserService(this);
    await bootstrapServices.initialize(this, { isDevEnv });
    
    // 检查基础库版本兼容性
    this.checkCompatibility()
    
    // 初始化单位统一
    this.initUnitSystem()
    
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs.slice(0, 50))

    await bootstrapAuth.runWxLogin(this);
    
    runtimeObservers.install(this);

    // 必做任务扣分在启动时已处理，无需定时检查
  },

  /**
   * 小程序显示时的处理
   * 修复清理缓存后重新进入的连接问题
   */
  onShow: function(options) {
    logger.info('App', 'onShow触发，检查API配置');

    const runtimeApiConfig = resolveRuntimeApiConfig();
    logger.info('App', 'onShow环境配置检查', {
      enableApi: runtimeApiConfig.enableApiRaw,
      baseUrl: runtimeApiConfig.baseUrlRaw,
      enabled: runtimeApiConfig.enabled,
      source: runtimeApiConfig.source
    });
  },

  /**
   * 登录成功后的初始化方法
   * 处理需要认证的服务初始化操作
   */
  postLoginInitialization: async function() {
    return postLoginBootstrap.run(this);
  },

  // 初始化日志系统
  initLogSystem: function() {
    try {
      logger.info('App', '初始化日志系统');
      
      // 获取环境信息
      let isDevEnv = deviceInfo.isDevelopmentEnv();
      
      // 日志配置选项
      const logOptions = {
        levels: {
          default: isDevEnv ? 'debug' : 'error',
          // 模块特定配置，可从配置文件或本地存储加载
          modules: {
            'BaseRepository': isDevEnv ? 'info' : 'error', // 减少仓储层日志噪音
            'StorageAdapter': isDevEnv ? 'info' : 'error', // 减少存储适配器日志噪音
            'App': 'info', // 应用级别始终保持info以上
            'TaskService': 'info' // 任务服务保持info以上
          }
        },
        features: {
          // 开发环境配置
          showTimestamp: true,
          consoleOutput: true,
          // 生产环境禁用以下特性
          storeLogs: isDevEnv, 
          maxLogEntries: isDevEnv ? 1000 : 100
        }
      };
      
      // 初始化日志配置
      logConfig.init(logOptions);
      
      // 应用基于环境的默认配置
      logConfig.applyEnvironmentDefaults();
      
      // 从存储中加载用户自定义配置（如果有）
      try {
        // 尝试通过配置服务获取（仅在服务管理器已初始化时）
        let userLogConfig = null;
        
        // 检查服务管理器是否已初始化
        if (serviceManager.isInitialized) {
          const configService = serviceManager.getService('config');
          if (configService) {
            userLogConfig = configService.getUserLogConfig();
          }
        }
        
        // 如果服务未就绪，使用降级处理：直接使用存储
        if (!userLogConfig) {
          const configText = wx.getStorageSync('_user_log_config');
          if (configText) {
            userLogConfig = JSON.parse(configText);
          }
          if (!serviceManager.isInitialized) {
            logger.warn('App', '配置服务未就绪，使用降级存储访问');
          }
        }
        
        if (userLogConfig && userLogConfig.levels) {
          logConfig.setLogLevels(userLogConfig.levels);
          logger.info('App', '应用用户自定义日志配置');
        }
      } catch (e) {
        logger.warn('App', '加载和解析用户日志配置失败', e);
      }
      
      logger.info('App', '日志系统初始化完成');
      
    } catch (error) {
      console.error('初始化日志系统失败:', error);
    }
  },
  
  // 监听设备方向变化
  setupOrientationListener: function() {
    return runtimeObservers.setupOrientationListener(this);
  },
  
  // 监听系统主题变化
  setupThemeChangeListener: function() {
    return runtimeObservers.setupThemeChangeListener(this);
  },
  
  // 监听字体大小变化
  setupFontSizeChangeListener: function() {
    return runtimeObservers.setupFontSizeChangeListener(this);
  },
  
  // 触发全局事件
  globalEvent: function(eventName, eventData) {
    return runtimeObservers.globalEvent(this, eventName, eventData);
  },
  
  // 更新高度相关参数
  updateHeightParams: function(isLandscape) {
    return runtimeObservers.updateHeightParams(this, isLandscape);
  },

  // 初始化单位系统
  initUnitSystem: function() {
    // 使用新的设备信息API获取设备信息
    const info = deviceInfo.getSystemInfo();
    this.globalData.deviceInfo = info;
    
    // 设置像素比例
    this.globalData.rpxRatio = 750 / info.windowWidth;
    
    // 计算主内容区域的高度
    this.updateHeightParams(false);
  },

  // 检查基础库版本兼容性
  checkCompatibility: function() {
    const SDKVersion = deviceInfo.getSDKVersion();
    if (!SDKVersion) {
      wx.showModal({
        title: '版本检测失败',
        content: '请确保您的微信版本为最新版本',
        showCancel: false
      });
      return;
    }
    
    const minVersion = '2.20.1';
    const versionCompare = deviceInfo._compareVersion(SDKVersion, minVersion);
    
    if (versionCompare < 0) {
      wx.showModal({
        title: '版本过低',
        content: `当前基础库版本${SDKVersion}，需要${minVersion}以上版本，请更新微信后重试`,
        showCancel: false
      });
    }
  },
  
  // 比较版本号
  compareVersion: function(v1, v2) {
    const v1Parts = v1.split('.').map(Number);
    const v2Parts = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }
    
    return 0;
  },

  // 设置主题
  setTheme: function() {
    return runtimeObservers.setTheme(this);
  },

  // 全局数据
  globalData: {
    userInfo: null,
    userService: null, // 用户服务实例
    canIUseGetUserProfile: false,
    canIUseOpenData: false,
    rpxRatio: 1,
    deviceInfo: {},
    contentHeight: 0,
    statusBarHeight: 0,
    safeArea: { top: 0, bottom: 0, left: 0, right: 0 },
    isLandscape: false,
    systemTheme: 'light',
    theme: 'light',
    themeColors: {},
    eventCallbacks: {},
    needRefreshReward: false,
    rewardClaimedInfo: null,
    hasRedirectedToReward: false,
    orientation: 'portrait',
    // 使用服务管理器的事件总线
    get eventBus() {
      return serviceManager.getEventBus();
    }
  },
  
  /**
   * 获取服务实例（供分包使用）
   * @param {String} serviceName 服务名称
   * @returns {Object} 服务实例
   */
  getService: function(serviceName) {
    return serviceManager.getService(serviceName);
  },
  
  /**
   * 获取分析服务（供分包使用）
   * @returns {Object} 分析服务实例
   */
  getAnalyticsService: function() {
    return serviceManager.getAnalyticsService();
  },
  
  /**
   * 获取任务服务（供分包使用）
   * @returns {Object} 任务服务实例
   */
  getTaskService: function() {
    return serviceManager.getTaskService();
  },
  
  /**
   * 获取星星服务（供分包使用）
   * @returns {Object} 星星服务实例
   */
  getStarService: function() {
    return serviceManager.getStarService();
  },
  
  /**
   * 获取用户服务（供全应用使用）
   * @returns {Object} 用户服务实例
   */
  getUserService: function() {
    return this.globalData.userService;
  },
  
  // 修复存量任务数据的penaltyApplied字段
  fixLegacyTaskData: async function(taskService) {
    return postLoginBootstrap.fixLegacyTaskData(taskService);
  },

  // 检查首次启动并创建欢迎消息
  checkFirstLaunch: async function(messageService) {
    return postLoginBootstrap.checkFirstLaunch(this, messageService);
  },
  
  // 创建欢迎消息
  createWelcomeMessage: async function(messageService) {
    return postLoginBootstrap.createWelcomeMessage(messageService);
  },
  
  // 获取欢迎内容
  getWelcomeContent: function() {
    return postLoginBootstrap.getWelcomeContent();
  },

  /**
   * 供页面调用的云端登录方法
   * 用于需要重新登录的场景
   */
  doCloudLogin: async function() {
    return bootstrapAuth.doCloudLogin(this);
  },

  /**
   * 退出登录（云端模式）
   */
  doCloudLogout: function() {
    return bootstrapAuth.doCloudLogout(this);
  },

  /**
   * 自动登录方法
   * 用于在token丢失时自动重新登录
   * @returns {Promise<boolean>} 登录是否成功
   */
  async autoLogin() {
    return bootstrapAuth.autoLogin(this);
  },

  /**
   * 获取微信登录code
   * @returns {Promise<string|null>} 微信登录code
   */
  getWxLoginCode() {
    return bootstrapAuth.getWxLoginCode();
  }
}) 
