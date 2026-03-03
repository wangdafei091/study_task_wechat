// app.js
const StorageAdapter = require('./adapters/storage-adapter'); // 引入存储适配器
const serviceManager = require('./services/service-manager.js'); // 引入服务管理器
const { UserService } = require('./services/user-service.js'); // 引入用户服务
const logger = require('./utils/logger');
const logConfig = require('./utils/log-config');
const deviceInfo = require('./utils/deviceInfo'); // 引入设备信息工具

App({
  onLaunch: async function () {
    // 初始化日志系统
    this.initLogSystem();
    
    // 初始化存储数据
    logger.info('App', '初始化存储数据');
    StorageAdapter.initializeApplicationStorage();
    
    // 确定是否为开发环境，用于配置事件总线
    let isDevEnv = deviceInfo.isDevelopmentEnv();
    
    // 初始化用户服务
    logger.info('App', '初始化用户服务');
    const userStorageAdapter = new StorageAdapter({ namespace: 'user_' });
    this.globalData.userService = new UserService({
      storageAdapter: userStorageAdapter
    });
    await this.globalData.userService.initialize();
    
    // 注入用户服务到服务管理器
    serviceManager.setUserService(this.globalData.userService);
    
    // 初始化服务管理器
    logger.info('App', '初始化服务管理器');
    try {
      // 配置事件总线优化和调试设置
      const serviceOptions = {
        // 始终启用事件优化
        enableEventOptimization: true,
        // 仅在开发环境启用事件调试
        enableEventDebug: isDevEnv
      };
      
      logger.info('App', '初始化服务管理器，配置选项:', serviceOptions);
      
      // 等待服务管理器初始化完成，确保所有服务都已经准备好
      const initialized = await serviceManager.initialize(serviceOptions);
      if (initialized) {
        logger.info('App', '服务管理器初始化成功');
        
        // 获取任务服务、消息服务和星星服务
        const taskService = serviceManager.getTaskService();
        const messageService = serviceManager.getMessageService();
        const starService = serviceManager.getStarService();
        
        // 先处理任务惩罚，再清理过期星星（确保惩罚时有足够星星）
        if (taskService) {
          // 修复存量任务数据的penaltyApplied字段
          await this.fixLegacyTaskData(taskService);
          
          // 检查任务状态和处理惩罚
          logger.info('App', '开始检查任务状态和处理必做任务惩罚');
          await taskService.checkTasksStatus();
          
          // 检查即将到期的任务
          await taskService.checkUpcomingTasks();
        }
        
        // 任务惩罚处理完毕后，先进行奖励保护，再初始化星星服务并清理过期星星
        if (starService) {
          try {
            // 计算即将过期的星星数量
            logger.info('App', '检查即将过期的星星并进行奖励保护');
            const expiredStars = await starService.calculatePendingExpiry();
            
            if (expiredStars > 0) {
              // 获取小朋友用户ID进行保护
              const userService = serviceManager.getUserService();
              const childUserId = userService ? userService.getChildUserId() : 'child';
              
              logger.info('App', `发现${expiredStars}颗即将过期的星星，为用户${childUserId}进行奖励保护`);
              const protectionResult = await starService.protectRewardsByExpiry(expiredStars, childUserId);
              
              if (protectionResult.success && protectionResult.protectedCount > 0) {
                logger.info('App', `奖励保护成功，保护了${protectionResult.protectedCount}个奖励`);
              }
            }
            
            logger.info('App', '初始化星星服务并清理过期星星');
            await starService.initialize();
            
            logger.info('App', '开始检查并修复星星数据一致性');
            const repairResult = await starService.checkAndRepairDataConsistency();
            
            if (repairResult.success) {
              if (repairResult.repairResult.repairedCount > 0) {
                logger.info('App', `星星数据修复完成，修复了${repairResult.repairResult.repairedCount}条记录`);
              } else {
                logger.info('App', '星星数据一致性检查通过，无需修复');
              }
            } else {
              logger.error('App', `星星数据修复失败: ${repairResult.error}`);
            }
          } catch (error) {
            logger.error('App', '星星数据一致性检查失败', error);
          }
        }
        
        // 检查首次启动并创建欢迎消息
        if (messageService) {
          await this.checkFirstLaunch(messageService);
        }
      } else {
        logger.error('App', '服务管理器初始化失败');
      }
    } catch (error) {
      logger.error('App', '服务管理器初始化失败:', error);
    }
    
    // 检查基础库版本兼容性
    this.checkCompatibility()
    
    // 初始化单位统一
    this.initUnitSystem()
    
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 登录
    wx.login({
      success: res => {
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
        logger.info('App', '登录成功', res);
        
        // 添加安全检查以防止后续操作失败
        try {
          // 使用现代API替代废弃的getUserProfile
          this.globalData.canIUseGetUserProfile = false; // 默认禁用
          
          // 检查是否支持open-data
          this.globalData.canIUseOpenData = wx.canIUse('open-data.type.userAvatarUrl') && 
                                          wx.canIUse('open-data.type.userNickName');
          
          logger.info('App', '用户登录处理完成，已添加防御性检查');
        } catch (error) {
          logger.error('App', '登录后处理用户信息出错:', error);
        }
      }
    })
    
    // 监听设备方向变化，用于处理横竖屏切换
    this.setupOrientationListener()
    
    // 监听系统主题变化
    this.setupThemeChangeListener()
    
    // 监听字体大小变化
    this.setupFontSizeChangeListener()

    // 设置主题
    this.setTheme();

    // 必做任务扣分在启动时已处理，无需定时检查
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
      
      // 开发环境下，尝试加载日志分析器
      if (isDevEnv) {
        try {
          const logAnalyzer = require('./utils/log-analyzer');
          setTimeout(() => {
            logger.info('App', '初始化日志分析器');
          }, 300);
        } catch (e) {
          logger.warn('App', '加载日志分析器失败', e);
        }
      }
    } catch (error) {
      console.error('初始化日志系统失败:', error);
    }
  },
  
  // 监听设备方向变化
  setupOrientationListener: function() {
    // 不是所有设备都支持方向监听，先检查是否可用
    if (typeof wx.onDeviceOrientationChange === 'function') {
      wx.onDeviceOrientationChange((res) => {
        const isLandscape = res.value === 'landscape';
        this.globalData.isLandscape = isLandscape;
        
        // 更新设备信息
        this.globalData.deviceInfo.isLandscape = isLandscape;
        
        // 更新高度相关参数
        this.updateHeightParams(isLandscape);
        
        // 触发自定义事件，通知页面方向已变化
        if (this.orientationChangeCallback) {
          this.orientationChangeCallback(res);
        }
        
        // 触发全局事件，供所有页面监听
        this.globalEvent('orientationChange', res);
      });
    }
  },
  
  // 监听系统主题变化
  setupThemeChangeListener: function() {
    // 移除主题监听功能，统一使用亮色主题
    logger.info('App', '使用统一亮色主题，不支持暗黑模式');
    
    // 设置默认亮色主题
    this.globalData.systemTheme = 'light';
  },
  
  // 监听字体大小变化
  setupFontSizeChangeListener: function() {
    if (typeof wx.onWindowResize === 'function') {
      wx.onWindowResize((res) => {
        // 重新计算高度参数
        this.updateHeightParams(this.globalData.isLandscape);
        
        // 通知页面尺寸已变化
        this.globalEvent('windowResize', res);
      });
    }
  },
  
  // 触发全局事件
  globalEvent: function(eventName, eventData) {
    if (this.globalData.eventCallbacks[eventName]) {
      const callbacks = this.globalData.eventCallbacks[eventName];
      callbacks.forEach(callback => {
        try {
          callback(eventData);
        } catch (error) {
          logger.error('App', `执行全局事件回调出错: ${eventName}`, error);
        }
      });
    }
  },
  
  // 更新高度相关参数
  updateHeightParams: function(isLandscape) {
    try {
      // 获取设备信息
      const {
        windowHeight,
        windowWidth,
        statusBarHeight,
        screenHeight,
        safeArea
      } = this.globalData.deviceInfo;
      
      // 更新安全区域信息
      if (safeArea) {
        const { top, bottom, left, right } = safeArea;
        this.globalData.safeArea = {
          top,
          bottom: screenHeight - bottom,
          left,
          right: windowWidth - right
        };
      }
      
      // 计算主内容区高度
      let contentHeight = windowHeight;
      
      // 主内容区计算逻辑
      if (isLandscape) {
        // 横屏模式计算
        contentHeight = windowHeight * 0.9; // 横屏时考虑底部安全边距
      } else {
        // 竖屏默认留出底部标签栏高度
        contentHeight -= 50;
      }
      
      // 保存计算结果
      this.globalData.contentHeight = contentHeight;
      this.globalData.statusBarHeight = statusBarHeight;
      
      logger.info('App', `更新高度参数: 内容区=${contentHeight}, 状态栏=${statusBarHeight}`);
    } catch (error) {
      logger.error('App', '更新高度参数失败', error);
    }
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
    
    const minVersion = '2.8.0';
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
    // 统一使用亮色主题
    this.globalData.theme = 'light';
    
    // 设置主题色
    this.globalData.themeColors = {
      primary: '#4285F4',
      secondary: '#4CAF50',
      accent: '#FF9800',
      background: '#FFFFFF',
      surface: '#F5F5F5',
      text: '#333333',
      lightText: '#757575'
    };
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
    try {
      logger.info('App', '开始修复存量任务数据的penaltyApplied字段');
      
      // 获取所有任务
      const allTasks = await taskService.getAllTasks();
      let fixedCount = 0;
      
      for (const task of allTasks) {
        // 检查是否需要修复penaltyApplied字段
        if (task.penaltyApplied === undefined) {
          task.penaltyApplied = false;
          
          // 保存修复后的任务
          await taskService.taskRepository.save(task);
          fixedCount++;
          
          logger.debug('App', `修复任务penaltyApplied字段: ${task.title}`);
        }
      }
      
      if (fixedCount > 0) {
        logger.info('App', `存量数据修复完成，修复了${fixedCount}个任务的penaltyApplied字段`);
      } else {
        logger.info('App', '存量数据检查完成，无需修复penaltyApplied字段');
      }
    } catch (error) {
      logger.error('App', '修复存量任务数据失败', error);
    }
  },

  // 检查首次启动并创建欢迎消息
  checkFirstLaunch: async function(messageService) {
    try {
      logger.info('App', '检查首次启动状态');
      
      // 通过配置服务检查首次启动状态（仅在服务已初始化时）
      let isFirstLaunch = false;
      
      if (serviceManager.isInitialized) {
        const configService = serviceManager.getService('config');
        if (configService) {
          isFirstLaunch = configService.isFirstLaunch();
        } else {
          // 降级处理：直接使用存储
          const hasWelcomed = wx.getStorageSync('has_welcomed_user');
          isFirstLaunch = !hasWelcomed;
        }
      } else {
        // 服务未初始化，使用降级处理：直接使用存储
        const hasWelcomed = wx.getStorageSync('has_welcomed_user');
        isFirstLaunch = !hasWelcomed;
        logger.warn('App', '配置服务未就绪，使用降级存储访问');
      }
      
      if (isFirstLaunch) {
        logger.info('App', '检测到首次启动，创建欢迎消息');
        
        // 创建欢迎消息
        await this.createWelcomeMessage(messageService);
        
        // 设置已欢迎标记
        if (serviceManager.isInitialized) {
          const configService = serviceManager.getService('config');
          if (configService) {
            configService.markUserWelcomed();
          } else {
            // 降级处理：直接使用存储
            wx.setStorageSync('has_welcomed_user', true);
          }
        } else {
          // 服务未初始化，使用降级处理：直接使用存储
          wx.setStorageSync('has_welcomed_user', true);
          logger.warn('App', '配置服务未就绪，使用降级存储访问');
        }
        
        logger.info('App', '首次启动处理完成，已设置欢迎标记');
      } else {
        logger.info('App', '非首次启动，跳过欢迎消息创建');
      }
    } catch (error) {
      logger.error('App', '检查首次启动失败', error);
    }
  },
  
  // 创建欢迎消息
  createWelcomeMessage: async function(messageService) {
    try {
      const welcomeContent = this.getWelcomeContent();
      
      const result = await messageService.createSystemMessage(welcomeContent, 'welcome', {
        title: '欢迎使用小CEO日程表',
        summary: '帮助孩子建立学习习惯的时间管理工具，支持任务管理和星星奖励'
      });
      
      if (result) {
        logger.info('App', '欢迎消息创建成功', { messageId: result.id });
      } else {
        logger.warn('App', '欢迎消息创建失败', result);
      }
    } catch (error) {
      logger.error('App', '创建欢迎消息出错', error);
    }
  },
  
  // 获取欢迎内容
  getWelcomeContent: function() {
    return `这是一个帮助孩子建立良好学习习惯的时间管理工具：

✨ 核心功能
• 创建学习、习惯、兴趣任务
• 通过星星积分激励完成
• 用积分兑换心仪的奖励

🚀 开始使用
1. 点击主页右下角的"+"按钮，选择"奖励"
2. 添加孩子喜欢的奖励作为激励目标
3. 点击"+"按钮，选择"任务"创建第一个任务
4. 开始您的时间管理之旅

记住：先设置奖励，再创建任务，效果更好哦！

祝您和孩子使用愉快！ 📚✨`;
  }
}) 