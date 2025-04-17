// app.js
const unitUtils = require('./utils/unit.js');
const taskManager = require('./utils/taskManager.js');

App({
  onLaunch: function () {
    // 初始化事件总线
    this.initEventBus();
    
    // 检查基础库版本兼容性
    this.checkCompatibility()
    
    // 初始化单位统一
    this.initUnitSystem()
    
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 加载任务数据
    this.loadTaskData()

    // 登录
    wx.login({
      success: res => {
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
        console.log('登录成功', res)
      }
    })
    
    // 监听设备方向变化，用于处理横竖屏切换
    this.setupOrientationListener()
    
    // 监听系统主题变化
    this.setupThemeChangeListener()
    
    // 监听字体大小变化
    this.setupFontSizeChangeListener()
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
    console.log('[App] 使用统一亮色主题，忽略系统主题变化');
    
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
  globalEvent: function(eventName, data) {
    const pages = getCurrentPages();
    
    if (pages.length > 0) {
      pages.forEach(page => {
        if (typeof page['on' + eventName.charAt(0).toUpperCase() + eventName.slice(1)] === 'function') {
          page['on' + eventName.charAt(0).toUpperCase() + eventName.slice(1)](data);
        }
      });
    }
    
    // 如果有注册全局回调，也触发它
    const callbackName = eventName + 'Callback';
    if (this[callbackName] && typeof this[callbackName] === 'function') {
      this[callbackName](data);
    }
  },
  
  // 更新高度相关参数
  updateHeightParams: function(isLandscape) {
    const viewportInfo = unitUtils.getViewportInfo();
    const deviceInfo = this.globalData.deviceInfo;
    
    // 计算内容区域可用高度
    const contentHeight = unitUtils.getContentHeight({
      hasTabBar: true, 
      hasCustomNavBar: false
    });
    
    // 更新高度参数
    this.globalData.heightParams = {
      windowHeight: viewportInfo.windowHeight,
      contentHeight: contentHeight,
      isFullScreenDevice: unitUtils.isFullScreenDevice(),
      safeAreaInset: viewportInfo.safeAreaInset
    };
    
    // 横屏模式下的特殊处理
    if (isLandscape) {
      // 横屏模式下，内容高度计算可能不同
      this.globalData.heightParams.landscapeContentHeight = 
        unitUtils.getContentHeight({
          hasTabBar: true, 
          hasCustomNavBar: false, 
          extraHeight: 20 // 横屏模式下额外减去一些空间
        });
    }
  },

  // 初始化单位系统，处理单位统一问题
  initUnitSystem: function() {
    // 扩展wx.createSelectorQuery功能，自动转换单位
    const originalCreateSelectorQuery = wx.createSelectorQuery
    
    wx.createSelectorQuery = function() {
      const query = originalCreateSelectorQuery.call(this)
      
      // 保存原始方法
      const originalSelect = query.select
      const originalSelectAll = query.selectAll
      
      // 扩展select方法，对样式返回值进行单位处理
      query.select = function(selector) {
        const selectedQuery = originalSelect.call(this, selector)
        
        // 保存原始方法
        const originalFields = selectedQuery.fields
        
        // 增强fields方法，在样式返回前进行单位转换
        selectedQuery.fields = function(fields, callback) {
          // 增强回调函数
          const enhancedCallback = function(res) {
            if (res && fields.computedStyle) {
              // 处理样式单位
              fields.computedStyle.forEach(style => {
                if (style.includes('width') || style.includes('height') || 
                    style.includes('size') || style.includes('margin') || 
                    style.includes('padding')) {
                  if (res[style] && typeof res[style] === 'string' && res[style].includes('px')) {
                    // 转换px为rpx
                    res[style] = unitUtils.unifyUnit(res[style])
                  }
                }
              })
            }
            
            // 调用原始回调
            if (callback) callback(res)
          }
          
          return originalFields.call(this, fields, enhancedCallback)
        }
        
        return selectedQuery
      }
      
      // 类似地增强selectAll方法
      query.selectAll = function(selector) {
        // 类似的增强处理...
        return originalSelectAll.call(this, selector)
      }
      
      return query
    }
    
    // 增强setData方法，自动处理样式值中的px单位
    const originalPage = Page;
    
    Page = function(config) {
      // 保存原始setData方法
      const originalSetData = config.setData;
      
      if (originalSetData) {
        config.setData = function(data, callback) {
          // 处理data中所有可能包含样式的字段
          const processedData = {};
          
          for (const key in data) {
            let value = data[key];
            
            // 处理样式字符串
            if (typeof value === 'string' && 
                (key.includes('style') || key.includes('Style') || value.includes('px'))) {
              processedData[key] = unitUtils.unifyUnit(value);
            } else {
              processedData[key] = value;
            }
          }
          
          return originalSetData.call(this, processedData, callback);
        };
      }
      
      // 注入设备和尺寸信息到页面
      const originalOnLoad = config.onLoad;
      
      if (originalOnLoad) {
        config.onLoad = function(options) {
          // 注入设备和尺寸信息
          this.deviceInfo = getApp().globalData.deviceInfo;
          this.heightParams = getApp().globalData.heightParams;
          
          // 调用原始onLoad
          return originalOnLoad.call(this, options);
        };
      } else {
        config.onLoad = function(options) {
          // 注入设备和尺寸信息
          this.deviceInfo = getApp().globalData.deviceInfo;
          this.heightParams = getApp().globalData.heightParams;
        };
      }
      
      // 增加页面显示时更新尺寸参数
      const originalOnShow = config.onShow;
      
      if (originalOnShow) {
        config.onShow = function() {
          // 更新尺寸信息
          this.heightParams = getApp().globalData.heightParams;
          
          // 调用原始onShow
          return originalOnShow.call(this);
        };
      } else {
        config.onShow = function() {
          // 更新尺寸信息
          this.heightParams = getApp().globalData.heightParams;
        };
      }
      
      // 添加方向变化和主题变化处理方法
      if (!config.onOrientationChange) {
        config.onOrientationChange = function(res) {
          // 更新设备信息和尺寸参数
          this.deviceInfo = getApp().globalData.deviceInfo;
          this.heightParams = getApp().globalData.heightParams;
          
          // 如果需要，刷新页面
          if (this.data) {
            this.setData({
              isLandscape: res.value === 'landscape'
            });
          }
        };
      }
      
      if (!config.onThemeChange) {
        config.onThemeChange = function(res) {
          // 更新主题信息
          if (this.data) {
            this.setData({
              theme: res.theme
            });
          }
        };
      }
      
      return originalPage(config);
    };
    
    // 记录到全局数据中
    this.globalData.unitUtils = unitUtils;

    // 设置系统信息
    this.getSystemInfo();
  },

  // 获取系统信息，用于屏幕适配
  getSystemInfo: function() {
    const systemInfo = wx.getSystemInfoSync();
    this.globalData.systemInfo = systemInfo;
    
    // 获取设备类型信息
    const deviceType = unitUtils.getDeviceType();
    const isLandscape = systemInfo.windowWidth > systemInfo.windowHeight;
    
    this.globalData.deviceInfo = {
      ...deviceType,
      pixelRatio: systemInfo.pixelRatio,
      screenWidth: systemInfo.screenWidth,
      screenHeight: systemInfo.screenHeight,
      windowWidth: systemInfo.windowWidth,
      windowHeight: systemInfo.windowHeight,
      statusBarHeight: systemInfo.statusBarHeight,
      isLandscape: isLandscape,
      platform: systemInfo.platform,
      brand: systemInfo.brand,
      model: systemInfo.model,
      system: systemInfo.system,
      language: systemInfo.language,
      version: systemInfo.version,
      SDKVersion: systemInfo.SDKVersion,
      theme: systemInfo.theme || 'light'
    };
    
    // 计算安全区域
    if (systemInfo.safeArea) {
      this.globalData.safeArea = systemInfo.safeArea;
      this.globalData.safeAreaInset = {
        top: systemInfo.safeArea.top,
        bottom: systemInfo.screenHeight - systemInfo.safeArea.bottom,
        left: systemInfo.safeArea.left,
        right: systemInfo.screenWidth - systemInfo.safeArea.right
      };
    }
    
    // 计算适配后的字体大小
    this.globalData.baseFontSize = unitUtils.adaptFontSize(28); // 基础字体大小
    
    // 根据设备特性设置弹性布局参数
    this.setFlexLayoutParams();
    
    // 初始化高度参数
    this.updateHeightParams(isLandscape);
  },
  
  // 设置弹性布局参数
  setFlexLayoutParams: function() {
    const deviceInfo = this.globalData.deviceInfo;
    const flexParams = {};
    
    // 根据屏幕大小调整容器内边距
    if (deviceInfo.isSmallScreen) {
      flexParams.containerPadding = 20; // 小屏幕使用更小的边距
    } else if (deviceInfo.isLargeScreen || deviceInfo.isExtraLargeScreen) {
      flexParams.containerPadding = 40; // 大屏幕使用更大的边距
    } else {
      flexParams.containerPadding = 30; // 中等屏幕使用标准边距
    }
    
    // 根据屏幕大小调整网格间距
    if (deviceInfo.isSmallScreen) {
      flexParams.gridGap = 16;
    } else if (deviceInfo.isLargeScreen || deviceInfo.isExtraLargeScreen) {
      flexParams.gridGap = 24;
    } else {
      flexParams.gridGap = 20;
    }
    
    // 保存到全局数据
    this.globalData.flexParams = flexParams;
  },

  // 检查基础库版本兼容性
  checkCompatibility: function() {
    // 获取系统信息和微信基础库版本
    const systemInfo = wx.getSystemInfoSync()
    const currentVersion = systemInfo.SDKVersion
    const requiredVersion = '2.14.0'

    // 比较版本号
    if (this.compareVersion(currentVersion, requiredVersion) < 0) {
      // 如果当前版本小于所需最低版本，提示用户升级
      wx.showModal({
        title: '版本提示',
        content: '当前微信版本过低，部分功能可能无法正常使用。请更新微信到最新版本后重试。',
        showCancel: false
      })
    }
  },

  // 版本号比较函数
  compareVersion: function(v1, v2) {
    const v1Parts = v1.split('.')
    const v2Parts = v2.split('.')
    const len = Math.max(v1Parts.length, v2Parts.length)

    // 补全版本号
    while (v1Parts.length < len) {
      v1Parts.push('0')
    }
    while (v2Parts.length < len) {
      v2Parts.push('0')
    }

    // 逐位比较版本号
    for (let i = 0; i < len; i++) {
      const num1 = parseInt(v1Parts[i])
      const num2 = parseInt(v2Parts[i])

      if (num1 > num2) {
        return 1
      } else if (num1 < num2) {
        return -1
      }
    }

    return 0
  },

  // 从本地存储加载数据
  loadTaskData: function() {
    // 使用任务管理器获取所有任务
    taskManager.getAllTasks(allTasks => {
      // 数据已在taskManager中处理并更新到app.globalData.tasks
      console.log(`加载了 ${allTasks.length} 个任务`);
      
      // 通知事件总线
      if (this.globalData.eventBus) {
        this.globalData.eventBus.emit('taskDataChanged', allTasks);
      }
    });

    // 加载奖励数据
    const rewards = wx.getStorageSync('rewards') || this.getDefaultRewards();
    this.globalData.rewards = rewards;
  },

  // 默认任务数据
  getDefaultTasks: function() {
    return [
      {
        id: 1,
        type: 'habit',
        title: '独立刷牙',
        description: '早晚各刷一次牙，每次2分钟',
        status: 0, 
        hasImage: false,
        images: [],
        date: '2025-03-28',
        time: '08:00',
        reminder: true
      },
      {
        id: 2,
        type: 'interest',
        title: '整理书包',
        description: '检查明天所需的课本和学习用品',
        status: 0,
        hasImage: false,
        images: [],
        date: '2025-03-28',
        time: '20:00',
        reminder: true
      },
      {
        id: 3,
        type: 'study',
        title: '数学作业',
        description: '完成数学习题第3页',
        status: 1,
        hasImage: true,
        images: ['https://example.com/image1.jpg'],
        date: '2025-03-28',
        time: '16:00',
        reminder: false,
        reflection: '这次作业我学会了分数的加减法，感觉比以前更清楚了。'
      }
    ]
  },

  // 默认奖励数据
  getDefaultRewards: function() {
    return [
      {
        id: 1,
        name: '看动画片30分钟',
        points: 10,
        icon: '🎬',
        unlocked: true,
        claimed: false
      },
      {
        id: 2,
        name: '额外的零食',
        points: 20,
        icon: '🍪',
        unlocked: true,
        claimed: false
      },
      {
        id: 3,
        name: '玩游戏1小时',
        points: 30,
        icon: '🎮',
        unlocked: false,
        claimed: false
      },
      {
        id: 4,
        name: '购买一本新书',
        points: 40,
        icon: '📚',
        unlocked: false,
        claimed: false
      },
      {
        id: 5,
        name: '去游乐园',
        points: 80,
        icon: '🎡',
        unlocked: false,
        claimed: false
      },
      {
        id: 6,
        name: '新玩具',
        points: 100,
        icon: '🧸',
        unlocked: false,
        claimed: false
      }
    ]
  },

  globalData: {
    userInfo: null,
    tasks: [],
    rewards: [],
    rewardProgress: {
      current: 2,
      total: 3
    }
  }
}) 