// app.js
const unitUtils = require('./utils/unit.js');
const storageUtils = require('./utils/storageUtils.js'); // 引入存储工具
const serviceManager = require('./utils/serviceManager.js'); // 引入服务管理器
const logger = require('./utils/logger');
const logConfig = require('./utils/log-config');

App({
  onLaunch: async function () {
    // 初始化日志系统
    this.initLogSystem();
    
    // 初始化存储数据
    logger.info('App', '初始化存储数据');
    storageUtils.initializeStorageIfNeeded();
    
    // 初始化服务管理器
    logger.info('App', '初始化服务管理器');
    try {
      // 等待服务管理器初始化完成，确保所有服务都已经准备好
      const initialized = await serviceManager.initialize();
      if (initialized) {
        logger.info('App', '服务管理器初始化成功');
        
        // 获取各服务实例
        const rewardService = serviceManager.getRewardService();
        const taskService = serviceManager.getTaskService();
        const messageService = serviceManager.getMessageService();
        
        // 主动触发一次奖励数据初始化，确保在首页加载前已有示例奖励
        if (rewardService) {
          const rewards = await rewardService.getAllRewards();
          logger.info('App', `检查奖励数据: 现有${rewards.length}个奖励`);
          
          if (rewards.length === 0) {
            logger.info('App', '没有找到奖励数据，初始化示例奖励');
            await rewardService.calculateNextAvailableReward();
          }
        }
        
        // 加载任务数据
        if (taskService) {
          // 检查任务状态和提醒
          await taskService.checkTasksStatus();
          
          // 检查必做任务，处理过期未完成的必做任务
          await taskService.checkRequiredTasks();
          
          // 检查即将到期的任务
          await taskService.checkUpcomingTasks();
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
          // 检查是否可以使用getUserProfile
          if (wx.getUserProfile) {
            this.globalData.canIUseGetUserProfile = true;
          }
          
          // 避免后续操作可能出现的解构undefined对象的错误
          // 用于防止operateWXData的回调中可能出现的错误
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
    
    // 创建定时器进行定期检查
    this.startTaskChecking();
  },
  
  // 初始化日志系统
  initLogSystem: function() {
    try {
      logger.info('App', '初始化日志系统');
      
      // 获取环境信息
      let isDevEnv = false;
      try {
        if (typeof wx !== 'undefined') {
          const systemInfo = wx.getSystemInfoSync();
          isDevEnv = systemInfo.platform === 'devtools';
        }
      } catch (e) {
        // 忽略错误
      }
      
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
      const userLogConfig = wx.getStorageSync('_user_log_config');
      if (userLogConfig) {
        try {
          const parsedConfig = JSON.parse(userLogConfig);
          if (parsedConfig && parsedConfig.levels) {
            logConfig.setLogLevels(parsedConfig.levels);
            logger.info('App', '应用用户自定义日志配置');
          }
        } catch (e) {
          logger.warn('App', '解析用户日志配置失败', e);
        }
      }
      
      logger.info('App', '日志系统初始化完成');
      
      // 开发环境下，尝试加载日志分析器
      if (isDevEnv) {
        try {
          const logAnalyzer = require('./utils/log-analyzer');
          logger.info('App', '已加载日志分析器，将监控console调用');
        } catch (e) {
          logger.warn('App', '加载日志分析器失败', e);
        }
      }
    } catch (error) {
      console.error('初始化日志系统失败:', error);
    }
  },
  
  // 创建定期检查任务的定时器
  startTaskChecking: function() {
    // 每5分钟检查一次任务状态
    const INTERVAL = 5 * 60 * 1000; // 5分钟
    
    this.taskCheckTimer = setInterval(() => {
      logger.info('App', '执行定期任务检查');
      
      // 通过服务管理器获取任务服务
      const taskService = serviceManager.getTaskService();
      if (taskService) {
        // 执行任务检查
        taskService.checkTasksStatus()
          .then(() => logger.info('App', '定期任务状态检查完成'))
          .catch(err => logger.error('App', '定期任务状态检查失败', err));
        
        // 检查即将到期的任务
        taskService.checkUpcomingTasks()
          .then(() => logger.info('App', '定期检查即将到期任务完成'))
          .catch(err => logger.error('App', '定期检查即将到期任务失败', err));
      }
    }, INTERVAL);
  },
  
  // 初始化事件总线
  initEventBus: function() {
    this.globalData.eventBus = {
      listeners: {},
      
      // 注册事件监听
      on: function(event, callback) {
        if (!this.listeners[event]) {
          this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
      },
      
      // 移除事件监听
      off: function(event, callback) {
        if (!this.listeners[event]) return;
        
        if (callback) {
          // 移除特定回调
          this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        } else {
          // 移除所有该事件的回调
          delete this.listeners[event];
        }
      },
      
      // 触发事件
      emit: function(event, data) {
        const callbacks = this.listeners[event] || [];
        callbacks.forEach(callback => {
          try {
            callback(data);
          } catch (error) {
            console.error(`事件处理出错: ${event}`, error);
          }
        });
      }
    };
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
    // 获取设备信息
    const info = wx.getSystemInfoSync();
    this.globalData.deviceInfo = info;
    
    // 设置像素比例
    this.globalData.rpxRatio = 750 / info.windowWidth;
    
    // 计算主内容区域的高度
    this.updateHeightParams(false);
  },

  // 检查基础库版本兼容性
  checkCompatibility: function() {
    const { SDKVersion } = wx.getSystemInfoSync();
    if (!SDKVersion) {
      wx.showModal({
        title: '版本检测失败',
        content: '请确保您的微信版本为最新版本',
        showCancel: false
      });
      return;
    }
    
    const minVersion = '2.8.0';
    const versionCompare = this.compareVersion(SDKVersion, minVersion);
    
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
    canIUseGetUserProfile: false,
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
    hasRedirectedToReward: false
  }
}) 