const app = getApp()
const taskManager = require('../../utils/taskManager.js');
const messageManager = require('../../utils/messageManager.js');

Page({
  data: {
    userInfo: {},
    hasUserInfo: false,
    canIUse: wx.canIUse('button.open-type.getUserInfo'),
    currentMotivation: '', // 当前显示的激励语
    motivationalPhrases: [
      '坚持每一天，成就更好的自己！',
      '小习惯，大改变！',
      '今天的努力，是明天的礼物！',
      '一步一个脚印，慢慢变优秀！',
      '做最好的自己，每天进步一点点！'
    ],
    rewardProgress: {
      current: 60,
      total: 100
    },
    upcomingTask: {
      name: '新冠语文课',
      timeRemaining: 2,
      id: ''
    },
    showUpcomingTask: true, // 是否显示即将到期任务
    isUpcomingLongPress: false, // 是否处于长按状态
    showUpcomingOptions: false, // 是否显示选项泡泡
    tasks: [],
    // 统计数据
    stats: {
      totalTasks: 0,
      completedTasks: 0,
      completionRate: 0,
      streak: 0, // 连续完成天数
      typeCounts: {
        habit: 0,
        interest: 0,
        study: 0
      }
    },
    showStats: false, // 是否显示统计面板
    statsClosing: false, // 统计面板是否正在关闭中

    // 搜索相关
    showSearch: false,
    searchQuery: '',
    searchResults: [],
    searchFilters: {
      type: '',
      status: '',
      dateRange: ''
    },
    searchClosing: false,
    filterAnimation: {}, // 用于存储筛选器动画数据
    
    // 任务进度
    taskProgress: {
      habit: 0,
      interest: 0,
      study: 0
    },

    // 消息中心相关
    showMessagePreview: false, // 是否显示消息预览
    messagePreviewClosing: false, // 消息预览是否正在关闭中
    messages: [], // 消息列表
    unreadCount: 0, // 未读消息数量
    messageAnimation: null, // 消息预览动画实例

    // 浮动菜单状态
    showFloatMenu: false,
    
    // 浮动菜单项配置
    menuItems: [
      {
        id: 'study',
        type: 'study-task',
        icon: '📊',
        label: '分析',
        ariaLabel: '查看统计分析'
      },
      {
        id: 'habit',
        type: 'habit-task',
        icon: '⏰',
        label: '任务',
        ariaLabel: '创建任务'
      }
    ]
  },
  
  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    console.log('首页加载');
    
    // 设置当前日期字符串
    const now = new Date();
    
    // 设置随机的鼓励语
    this.setRandomMotivation();
    
    // 加载任务数据
    this.loadTaskData();
    
    // 初始化消息预览动画实例在toggleMessagePreview中创建，这里不需要预创建
    
    // 检查用户信息
    if (app.globalData.userInfo) {
      this.setData({
        userInfo: app.globalData.userInfo,
        hasUserInfo: true
      });
    } else if (this.data.canIUse) {
      // 由于 getUserInfo 是网络请求，可能会在 Page.onLoad 之后才返回
      // 所以此处加入 callback 以防止这种情况
      app.userInfoReadyCallback = res => {
        this.setData({
          userInfo: res.userInfo,
          hasUserInfo: true
        });
      };
    }
    
    // 注册事件监听
    this.registerEventListeners();
  },
  
  /**
   * 注册事件监听
   */
  registerEventListeners: function() {
    if (app.globalData.eventBus) {
      // 监听任务数据变化
      app.globalData.eventBus.on('taskDataChanged', this.handleTaskDataChanged.bind(this));
      
      // 监听消息数据变化
      app.globalData.eventBus.on('messageDataChanged', this.handleMessageDataChanged.bind(this));
    }
  },
  
  /**
   * 处理任务数据变化事件
   * @param {Object} eventData 事件数据对象，包含tasks数组和变更类型等信息
   */
  handleTaskDataChanged: function(eventData) {
    // 获取所有必要的事件信息
    const allTasks = eventData.tasks || [];
    const changeType = eventData.changeType || 'unknown';
    const timestamp = eventData.timestamp || Date.now();
    
    console.log(`[Index] 收到任务数据变更事件: 类型=${changeType}, 任务数量=${allTasks.length}, 时间戳=${timestamp}`);
    
    // 删除操作需要特殊处理，确保热力图更新
    if (changeType === 'delete') {
      console.log('[Index] 检测到删除操作，确保热力图得到完全刷新');
      
      // 刷新今日任务
      taskManager.getTodayTasks(todayTasks => {
        this.setData({ 
          tasks: todayTasks,
          "__dataUpdateTimestamp": timestamp // 添加时间戳属性以确保视图刷新
        });
        
        // 更新任务进度和即将到期任务
        this.updateTaskProgress(todayTasks);
        this.checkUpcomingTasks();
        
        // 通过调度器延迟处理，确保数据变化后UI完全刷新
        setTimeout(() => {
          // 找到热力图组件并强制刷新
          const heatmapComponent = this.selectComponent('#taskHeatmap');
          if (heatmapComponent) {
            console.log('[Index] 触发热力图强制刷新');
            heatmapComponent.refreshTaskList();
          }
        }, 300);
      });
      
      return;
    }
    
    // 非删除操作的常规处理
    taskManager.getTodayTasks(todayTasks => {
      this.setData({ 
        tasks: todayTasks 
      });
      
      // 更新任务进度和即将到期任务
      this.updateTaskProgress(todayTasks);
      this.checkUpcomingTasks();
    });
  },
  
  /**
   * 处理消息数据变化事件
   */
  handleMessageDataChanged: function(messages) {
    // 更新消息显示
    const unreadCount = messages.filter(msg => !msg.isRead).length;
    
    this.setData({ 
      messages,
      unreadCount
    });
  },
  
  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    // 刷新任务数据
    this.loadTaskData();
    
    // 刷新消息数据
    this.loadMessageData();
  },
  
  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function() {
    // 解除事件监听
    if (app.globalData.eventBus) {
      app.globalData.eventBus.off('taskDataChanged');
      app.globalData.eventBus.off('messageDataChanged');
    }
  },

  // 从任务管理器加载任务数据
  loadTaskData: function() {
    // 获取今日任务
    taskManager.getTodayTasks(todayTasks => {
      this.setData({ tasks: todayTasks });
      
      // 更新任务进度统计和即将到期任务
      this.updateTaskProgress(todayTasks);
      this.checkUpcomingTasks();
    });
  },
  
  // 从消息管理器加载消息数据
  loadMessageData: function() {
    messageManager.getAllMessages(messages => {
      // 计算未读消息数量
      const unreadCount = messages.filter(msg => !msg.isRead).length;
      
      this.setData({ 
        messages,
        unreadCount
      });
    });
  },
  
  // 更新任务进度统计
  updateTaskProgress: function(tasks) {
    // 使用任务管理器计算进度
    const progressData = taskManager.calculateTaskProgress(tasks);
    
    // 更新UI
    this.setData({
      taskProgress: progressData.taskProgress,
      rewardProgress: progressData.rewardProgress,
      stats: {
        ...progressData.stats,
        streak: this.data.stats?.streak || 0 // 保留现有连续天数
      }
    });
    
    // 更新全局进度数据
    app.globalData.taskProgress = progressData.taskProgress;
    app.globalData.rewardProgress = progressData.rewardProgress;
  },
  
  // 检查即将到期任务
  checkUpcomingTasks: function() {
    // 使用任务管理器检查即将到期任务
    taskManager.checkUpcomingTasks(upcomingTasks => {
      if (upcomingTasks && upcomingTasks.length > 0) {
        // 使用消息管理器处理提醒显示逻辑
        messageManager.getUpcomingTaskNotifications(upcomingTasks, (taskInfo, shouldShow) => {
          if (shouldShow && taskInfo) {
            this.setData({
              upcomingTask: taskInfo,
              showUpcomingTask: true
            });
          } else {
            this.setData({
              showUpcomingTask: false
            });
          }
        });
      } else {
        this.setData({
          showUpcomingTask: false
        });
      }
    });
  },

  // 完成任务
  completeTask: function(e) {
    const id = e.detail.taskId;
    console.log('完成任务:', id);
    
    // 获取当前任务状态
    const task = this.data.tasks.find(t => t.id === id);
    if (!task) return;
    
    // 新状态是当前状态的反转
    const newStatus = task.status === 0 ? 1 : 0;
    
    // 使用任务管理器更新任务状态
    taskManager.updateTaskStatus(id, newStatus, updatedTask => {
      if (updatedTask && newStatus === 1) {
        // 如果是完成任务，触发庆祝动画
        setTimeout(() => {
          const progressBar = this.selectComponent('#progressBar');
          if (progressBar) {
            progressBar.playAnimation('complete');
          }
        }, 300);
      }
    });
  },
  
  // 设置随机的鼓励语
  setRandomMotivation: function() {
    const phrases = this.data.motivationalPhrases;
    const randomIndex = Math.floor(Math.random() * phrases.length);
    this.setData({
      currentMotivation: phrases[randomIndex]
    });
  },
  
  // 跳转到任务编辑页面
  navigateToTaskEdit: function(e) {
    const type = e.detail.type || 'study';
    wx.navigateTo({
      url: `/pages/task-edit/task-edit?mode=create&taskType=${type}`
    });
  },
  
  // 跳转到编辑特定任务
  editTask: function(e) {
    const taskId = e.detail.taskId;
    wx.navigateTo({
      url: `/pages/task-edit/task-edit?mode=edit&taskId=${taskId}`
    });
  },
  
  // 跳转到任务详情页面
  viewTaskDetail: function(e) {
    const taskId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/task/task?id=${taskId}`
    });
  },
  
  // 跳转到消息中心
  navigateToMessageCenter: function() {
    wx.navigateTo({
      url: '/pages/message/message'
    });
    
    // 关闭消息预览
    this.toggleMessagePreview();
  },
  
  // 显示/隐藏消息预览
  toggleMessagePreview: function() {
    console.log('[消息中心] ' + (this.data.showMessagePreview ? '关闭' : '打开') + '消息面板');
    const currentState = this.data.showMessagePreview;
    
    // 每次都创建新的动画实例，避免复用旧的动画状态
    this.messageAnimation = wx.createAnimation({
      duration: 250,
      timingFunction: 'ease-out',
      delay: 0
    });
    
    if (currentState) {
      console.log('[消息中心] 创建关闭动画');
      // 关闭动画
      this.messageAnimation.opacity(0).scale(0.8).step();
      
      this.setData({
        messageAnimation: this.messageAnimation.export()
      });
      
      // 动画结束后再隐藏元素
      setTimeout(() => {
        console.log('[消息中心] 动画结束，隐藏面板');
        this.setData({
          showMessagePreview: false
        });
      }, 250);
    } else {
      console.log('[消息中心] 准备显示面板');
      // 轻微振动反馈
      if (wx.vibrateShort) {
        wx.vibrateShort({ type: 'light' });
      }
      
      // 设置初始状态
      this.messageAnimation.opacity(0).scale(0.8).step({ duration: 0 });
      console.log('[消息中心] 初始化动画');
      
      this.setData({
        showMessagePreview: true,
        messageAnimation: this.messageAnimation.export(),
        showSearch: false, // 确保搜索面板关闭
        showStats: false   // 确保统计面板关闭
      });
      
      // 添加一个短暂延时，确保视图更新后再开始动画
      setTimeout(() => {
        console.log('[消息中心] 执行显示动画');
        this.messageAnimation.opacity(1).scale(1).step();
        
        this.setData({
          messageAnimation: this.messageAnimation.export()
        });
      }, 50);
    }
  },
  
  // 防止点击事件冒泡
  preventBubble: function(e) {
    console.log('[消息中心] 阻止事件冒泡');
    // 检查事件对象是否存在且有stopPropagation方法
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    } else {
      console.log('[消息中心] 事件对象不包含stopPropagation方法');
    }
    return false;
  },
  
  // 防止蒙层触摸滑动
  preventTouchMove: function(e) {
    console.log('[消息中心] 阻止蒙层触摸滑动');
    // 检查事件对象是否存在
    if (e) {
      // 检查并调用stopPropagation方法
      if (typeof e.stopPropagation === 'function') {
        e.stopPropagation();
      } else {
        console.log('[消息中心] 事件对象不包含stopPropagation方法');
      }
      
      // 检查并调用preventDefault方法
      if (typeof e.preventDefault === 'function') {
        e.preventDefault();
      } else {
        console.log('[消息中心] 事件对象不包含preventDefault方法');
      }
    }
    return false;
  },
  
  // 查看消息详情
  viewMessageDetail: function(e) {
    const messageId = e.currentTarget.dataset.id;
    const message = this.data.messages.find(m => m.id === messageId);
    
    if (message) {
      // 标记该消息为已读
      messageManager.markAsRead(messageId);
      
      // 根据消息类型处理不同的导航逻辑
      switch (message.type) {
        case 'task':
          // 如果有关联任务ID，导航到该任务详情
          if (message.taskId) {
            wx.navigateTo({
              url: `/pages/task/task?id=${message.taskId}`
            });
          }
          break;
        case 'achievement':
          // 导航到奖励页面
          wx.switchTab({
            url: '/pages/rewards/rewards'
          });
          break;
        default:
          // 显示消息内容
          wx.showModal({
            title: message.title,
            content: message.summary,
            showCancel: false
          });
      }
    }
  },
  
  // 标记所有消息为已读
  markAllAsRead: function() {
    messageManager.markAllAsRead(() => {
      wx.showToast({
        title: '全部已读',
        icon: 'success',
        duration: 1500
      });
    });
  },
  
  // 点击即将到期任务
  onUpcomingTaskTap: function(e) {
    const taskId = e && e.detail ? e.detail.taskId : this.data.upcomingTask.id;
    if (taskId) {
      wx.navigateTo({
        url: `/pages/task/task?id=${taskId}`
      });
    }
  },
  
  // 处理即将到期任务选项点击
  handleUpcomingOption: function(e) {
    const action = e.detail.action;
    
    // 轻微振动反馈
    if (wx.vibrateShort) {
      wx.vibrateShort({ type: 'light' });
    }
    
    // 延迟执行操作，让视觉效果更流畅
    setTimeout(() => {
      switch(action) {
        case 'viewTask':
          // 查看任务详情
          const taskId = e.detail.taskId || this.data.upcomingTask.id;
          if (taskId) {
            wx.navigateTo({
              url: `/pages/task/task?id=${taskId}`
            });
          }
          break;
          
        case 'viewMessages':
          // 跳转到消息中心的任务标签
          wx.navigateTo({
            url: '/pages/message/message?tab=task'
          });
          break;
          
        case 'dismiss':
          // 不再提醒
          this.dismissUpcomingTask();
          
          // 显示一个友好的确认反馈
          wx.showToast({
            title: '已暂时隐藏提醒',
            icon: 'success',
            duration: 1500
          });
          break;
      }
    }, 200);
  },
  
  // 消除即将到期任务提醒
  dismissUpcomingTask: function(e) {
    const taskId = this.data.upcomingTask.id;
    
    // 使用消息管理器处理隐藏逻辑
    messageManager.dismissUpcomingTask(taskId, success => {
      this.setData({
        showUpcomingTask: false
      });
    });
  },
  
  // 标记即将到期任务的消息为已读
  markUpcomingMessageAsRead: function() {
    const taskId = this.data.upcomingTask.id;
    if (!taskId) return;
    
    // 使用消息管理器标记任务相关消息为已读
    messageManager.markTaskMessagesAsRead(taskId, success => {
      if (success) {
        wx.showToast({
          title: '已标记为已读',
          icon: 'success',
          duration: 1500
        });
        
        // 刷新未读消息数量
        this.loadMessageData();
      }
    });
  },
  
  // 浮动菜单相关
  onMenuTap: function() {
    this.setData({
      showFloatMenu: !this.data.showFloatMenu
    });
  },
  
  onMenuItemTap: function(e) {
    const item = e.detail.item;
    
    // 隐藏菜单
    this.setData({
      showFloatMenu: false
    });
    
    // 根据选项处理
    if (item && item.id === 'habit') {
      console.log('[首页] 点击任务菜单项，跳转到任务编辑页面');
      wx.navigateTo({
        url: `/pages/task-edit/task-edit?mode=create`
      });
    } else if (item && item.id === 'study') {
      console.log('[首页] 点击分析菜单项，暂无功能');
      // 分析功能暂时清除，未来将添加统计分析功能
    }
  },
  
  // 触发进度圆环点击
  onRingTap: function(e) {
    // 切换显示统计信息
    this.toggleStats();
  },
  
  // 显示/隐藏统计信息
  toggleStats: function() {
    if (this.data.showStats) {
      this.setData({ statsClosing: true });
      
      // 动画结束后隐藏
      setTimeout(() => {
        this.setData({
          showStats: false,
          statsClosing: false
        });
      }, 300);
      
    } else {
      this.setData({
        showStats: true,
        showSearch: false, // 确保搜索面板关闭
        showMessagePreview: false // 确保消息预览关闭
      });
    }
  },
  
  // 显示/隐藏搜索面板
  toggleSearch: function() {
    if (this.data.showSearch) {
      this.setData({ searchClosing: true });
      
      // 动画结束后隐藏
      setTimeout(() => {
        this.setData({
          showSearch: false,
          searchClosing: false
        });
      }, 300);
      
    } else {
      this.setData({
        showSearch: true,
        showStats: false, // 确保统计面板关闭
        showMessagePreview: false // 确保消息预览关闭
      });
    }
  },
  
  // 更新搜索输入
  updateSearchQuery: function(e) {
    this.setData({
      searchQuery: e.detail.value
    });
  },
  
  // 执行搜索
  performSearch: function() {
    const query = this.data.searchQuery.toLowerCase().trim();
    const filters = this.data.searchFilters;
    
    // 从全局获取所有任务
    taskManager.getAllTasks(allTasks => {
      // 基于关键词搜索
      let results = [];
      
      if (query) {
        results = allTasks.filter(task => 
          task.title.toLowerCase().includes(query) || 
          (task.description && task.description.toLowerCase().includes(query))
        );
      } else {
        // 如果没有查询词但有过滤条件，则搜索所有任务
        results = [...allTasks];
      }
      
      // 应用类型过滤
      if (filters.type) {
        results = results.filter(task => task.type === filters.type);
      }
      
      // 应用状态过滤
      if (filters.status !== '') {
        const statusValue = parseInt(filters.status);
        results = results.filter(task => task.status === statusValue);
      }
      
      // 应用日期范围过滤
      if (filters.dateRange) {
        // 处理日期范围过滤逻辑...
      }
      
      // 显示结果
      this.setData({
        searchResults: results
      });
    });
  },
  
  // 更新搜索过滤器
  updateSearchFilter: function(e) {
    const { type, value } = e.currentTarget.dataset;
    
    this.setData({
      [`searchFilters.${type}`]: value
    });
    
    // 实时更新搜索结果
    this.performSearch();
  },
  
  // 清除搜索过滤器
  clearSearchFilters: function() {
    this.setData({
      searchFilters: {
        type: '',
        status: '',
        dateRange: ''
      }
    });
    
    // 实时更新搜索结果
    this.performSearch();
  },

  // 处理菜单项点击事件
  handleMenuItemTap: function(e) {
    // 内部调用我们现有的onMenuItemTap
    this.onMenuItemTap(e);
  },

  // 处理菜单状态变化事件
  handleMenuStateChange: function(e) {
    this.setData({
      showFloatMenu: e.detail.isOpen
    });
  }
}) 