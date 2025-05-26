const app = getApp()
const serviceManager = require('../../services/service-manager.js');
const formatUtils = require('../../utils/formatUtils');
const logger = require('../../utils/logger');
const { NotificationType } = require('../../models/message');

Page({
  data: {
    userInfo: {},
    hasUserInfo: false,
    canIUse: false,
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
      name: '',
      title: '',
      timeRemaining: 0,
      id: '',
      formattedStartTime: ''
    },
    showUpcomingTask: false, // 是否显示即将到期任务
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
        icon: '📈',
        label: '分析',
        ariaLabel: '查看统计分析'
      },
      {
        id: 'habit',
        type: 'habit-task',
        icon: '⏰',
        label: '任务',
        ariaLabel: '创建任务'
      },
      {
        id: 'reward-manage',
        type: 'reward-manage',
        icon: '🏆',
        label: '奖励',
        ariaLabel: '管理奖励'
      }
    ],

    // 新增奖品相关数据
    nextReward: {
      name: '',
      points: 0,
      icon: '🎁',
      count: 1,
      remainingStars: 0
    },
    userPoints: 0,
    formattedPoints: '',
    visibleRewards: [], // 可见的奖励列表
    hasMoreRewards: false, // 是否有更多奖励
    rewardHintText: '', // 动态奖励提示文本
    showRewardChoice: false, // 是否显示奖励选择对话框
    choiceDialogTitle: '', // 选择对话框标题
    choiceDialogAnimation: {}, // 选择对话框动画
    completedReward: null, // 已完成的奖励
    transitionInProgress: false, // 是否正在进行过渡动画
    rewardTextState: 'newTarget', // 奖励文案状态：achieved(已达成), newTarget(新目标)
    forceKeepFullValue: false, // 强制保持满值状态
    completedRewardTotal: 0, // 已完成奖励的总值

    // 新增奖励提示对话框
    showSetupRewardTip: false, // 是否显示设置奖励提示
    setupRewardTipAnimation: {}, // 提示动画

    // 新增处理中状态
    processingTaskId: null, // 用于存储正在处理的任务ID
    
    // 锁定状态相关
    lastExchangeTime: null // 最后一次兑换时间，用于计算任务锁定状态
  },
  
  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    logger.info('Index', '首页加载');
    
    // 设置当前日期字符串
    const now = new Date();
    
    // 设置随机的鼓励语
    this.setRandomMotivation();
    
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
    // 使用serviceManager获取EventBus
    const eventBus = serviceManager.getEventBus();
    if (eventBus) {
      // 监听任务数据变化
      eventBus.on('task:changed', this.handleTaskDataChanged.bind(this));
      
      // 监听任务创建事件
      eventBus.on('task:created', this.handleTaskCreated.bind(this));
      
      // 监听消息数据变化
      eventBus.on('message:changed', this.handleMessageDataChanged.bind(this));
      
      // 监听奖励领取事件
      eventBus.on('reward:claimed', this.handleRewardClaimed.bind(this));
      
      // 监听奖励更新相关事件
      eventBus.on('reward:updated', this.handleRewardUpdated.bind(this));
      eventBus.on('reward:examples_cleared', this.handleRewardUpdated.bind(this));
      
      // 监听进度条完成事件
      eventBus.on('progressbar:complete', this.handleProgressBarComplete.bind(this));
    }
  },
  
  /**
   * 处理奖励更新事件
   */
  handleRewardUpdated: function(data) {
    logger.debug('Index', '收到奖励更新事件', data);
    
    // 设置标记，下次页面显示时会通过needRefreshReward标记进行刷新
    const app = getApp();
    app.globalData.needRefreshReward = true;
    
    // 立即刷新当前页面的奖励数据
    if (this.isCurrentPage()) {
      logger.debug('Index', '当前在首页，立即刷新奖励数据');
      this.loadStarsAndRewards();
    }
  },

  /**
   * 处理进度条完成事件
   * 当进度条达到满值时触发，用于锁定用户操作并准备显示奖励对话框
   */
  handleProgressBarComplete: function() {
    logger.info('Index', '收到进度条完成事件，准备处理奖励达成');
    
    // 设置UI锁定状态，防止用户在动效期间进行其他操作
    this.setData({
      transitionInProgress: true,
      forceKeepFullValue: true
    });
    
    logger.info('Index', '进度条完成事件处理完毕，UI已锁定');
  },
  
  /**
   * 判断当前是否在首页
   * @returns {Boolean} 是否在首页
   */
  isCurrentPage: function() {
    const pages = getCurrentPages();
    if (pages.length === 0) return false;
    
    const currentPage = pages[pages.length - 1];
    return currentPage.route === 'pages/index/index' || currentPage.__route__ === 'pages/index/index';
  },
  
  /**
   * 处理任务数据变更事件
   * @param {Object} eventData 事件数据对象，包含tasks数组和变更类型等信息
   */
  handleTaskDataChanged: function(eventData) {
    // 获取所有必要的事件信息
    const allTasks = eventData.tasks || [];
    const changeType = eventData.changeType || 'unknown';
    const timestamp = eventData.timestamp || Date.now();
    
    logger.info('Index', `收到任务数据变更事件: 类型=${changeType}, 任务数量=${allTasks.length}`);
    
    // 删除操作需要特殊处理，确保热力图更新
    if (changeType === 'delete') {
      logger.info('Index', '检测到删除操作，确保热力图得到完全刷新');
      
      // 获取任务服务
      const taskService = serviceManager.getService('task');
      if (!taskService) {
        logger.error('Index', '无法获取任务服务');
        return;
      }
      
      // 刷新今日任务
      taskService.getTodayTasks().then(todayTasks => {
        this.setData({ 
          tasks: todayTasks,
          "__dataUpdateTimestamp": timestamp // 添加时间戳属性以确保视图刷新
        });
        
        // 更新任务进度和即将到期任务
        this.calculateProgress(todayTasks);
        this.checkUpcomingTasks();
        
        // 通过调度器延迟处理，确保数据变化后UI完全刷新
        setTimeout(() => {
          // 找到热力图组件并强制刷新
          const heatmapComponent = this.selectComponent('#taskHeatmap');
          if (heatmapComponent) {
            logger.info('Index', '触发热力图强制刷新');
            heatmapComponent.refreshTaskList();
          }
        }, 300);
      });
      
      return;
    }
    
    // 非删除操作的常规处理
    const taskService = serviceManager.getService('task');
    if (!taskService) {
      logger.error('Index', '无法获取任务服务');
      return;
    }
    
    taskService.getTodayTasks().then(todayTasks => {
      this.setData({ 
        tasks: todayTasks 
      });
      
      // 更新任务进度和即将到期任务
      this.calculateProgress(todayTasks);
      this.checkUpcomingTasks();
    });
  },
  
  /**
   * 处理消息数据变化事件
   */
  handleMessageDataChanged: function() {
    logger.info('Index', '收到消息数据变更事件，主动加载最新消息数据');
    
    // 主动加载消息数据，不依赖事件参数
    this.loadMessageData();
  },
  
  /**
   * 处理奖励领取事件
   */
  handleRewardClaimed: function(eventData) {
    logger.debug('Index', `收到奖励领取事件: 奖励ID=${eventData.rewardId}, 消耗星星=${eventData.points}, 剩余星星=${eventData.newTotalPoints}`);
    
    // 只记录奖励已被领取，但不立即更新UI
    const app = getApp();
    app.globalData.rewardClaimedInfo = eventData;
    app.globalData.needRefreshReward = true;
    logger.debug('Index', '已记录奖励领取信息，等待返回首页时更新');
    
    // 不立即调用loadStarsAndRewards或transitionToNewTarget
    // 等待用户返回首页时再更新
  },
  
  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    logger.info('Index', '页面显示');
    
    // 获取应用实例
    const app = getApp();
    
    // 检查是否需要刷新奖励信息
    if (app.globalData.needRefreshReward) {
      logger.debug('Index', '检测到奖励数据变更标记，强制清除缓存并刷新');
      
      // 清除满值状态
      this.setData({
        forceKeepFullValue: false,
        transitionInProgress: false,
        showRewardChoice: false,
        rewardTextState: 'newTarget'
      });
      
      // 强制重新获取最新奖励信息
      const rewardService = serviceManager.getService('rewardService');
      if (rewardService && typeof rewardService.clearCache === 'function') {
        rewardService.clearCache(); // 如果有清除缓存方法，则调用
      }
      
      // 强制重新加载奖励数据，确保UI正确显示
      this.loadStarsAndRewards();
      
      // 清除标记
      app.globalData.needRefreshReward = false;
      app.globalData.rewardClaimedInfo = null;
      return;
    }
    
    // 从多个来源检查是否从奖池页面返回
    const fromStorage = wx.getStorageSync('fromRewardCompletion');
    
    if (app.globalData.hasRedirectedToReward || fromStorage) {
      logger.debug('Index', '检测到从奖池页面返回(通过标记)');
      
      // 清除所有标记
      app.globalData.hasRedirectedToReward = false;
      if (fromStorage) {
        wx.removeStorageSync('fromRewardCompletion');
        wx.removeStorageSync('completedRewardInfo');
      }
      
      // 执行过渡到新目标
      logger.debug('Index', '从奖池返回，强制更新进度条');
      this.transitionToNewTarget();
      return;
    }
    
    // 正常页面显示流程
    // 刷新星星和奖励数据
    logger.debug('Index', '页面显示时刷新星星和奖励数据');
    this.loadStarsAndRewards();
    
    // 加载用户消息
    this.loadMessageData();
    
    // 检查即将到期的任务
    this.checkUpcomingTasks();
    
    // 加载今日所有任务
    logger.info('Index', '页面显示时加载今日所有任务');
    this.loadTodayTasks();
  },
  
  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function() {
    // 解除事件监听
    const eventBus = serviceManager.getEventBus();
    if (eventBus) {
      eventBus.off('task:changed', this.handleTaskDataChanged);
      eventBus.off('task:created', this.handleTaskCreated);
      eventBus.off('message:changed', this.handleMessageDataChanged);
      eventBus.off('reward:claimed', this.handleRewardClaimed);
      eventBus.off('reward:updated', this.handleRewardUpdated);
      eventBus.off('reward:examples_cleared', this.handleRewardUpdated);
      eventBus.off('progressbar:complete', this.handleProgressBarComplete);
    }
  },

  /**
   * 加载任务数据
   */
  loadTaskData: async function() {
    try {
      logger.info('Index', '开始加载任务数据');
      
      // 获取任务服务
      const taskService = serviceManager.getService('task');
      if (!taskService) {
        logger.error('Index', '无法获取任务服务');
        return;
      }
      
      // 使用任务服务获取今日任务
      const tasks = await taskService.getTodayTasks();
      logger.info('Index', `今日任务加载成功，任务数量: ${tasks.length}`);
      
      // 添加详细的任务状态日志
      tasks.forEach((task, index) => {
        logger.info('Index', `任务${index + 1}详细状态:`, {
          id: task.id,
          title: task.title,
          status: task.status,
          statusType: typeof task.status,
          starAwarded: task.starAwarded,
          starAwardedType: typeof task.starAwarded,
          points: task.points
        });
      });
      
      // 更新页面数据
      this.setData({
        tasks: tasks
      });
      
      // 检查任务进度
      await this.calculateProgress(tasks);
      
      // 更新任务统计信息
      await this.updateTaskStats();
      
      // 检查即将到期的任务
      await this.checkUpcomingTasks();
    } catch (error) {
      logger.error('Index', '加载任务数据失败', error);
      
      wx.showToast({
        title: '加载数据失败',
        icon: 'none',
        duration: 2000
      });
    }
  },
  
  // 从消息管理器加载消息数据
  loadMessageData: async function() {
    try {
      const messageService = serviceManager.getMessageService();
      const messages = await messageService.getAllMessages();
      
      // 计算未读消息数量
      const unreadCount = messages.filter(msg => !msg.isRead).length;
      
      this.setData({
        messages,
        unreadCount
      });
    } catch (error) {
      logger.error('Index', '加载消息数据失败', error);
    }
  },
  
  /**
   * 计算并更新任务进度
   * @param {Array} tasks 任务列表
   */
  calculateProgress: async function(tasks) {
    try {
      logger.info('Index', '开始计算任务进度');
      
      // 获取任务服务
      const taskService = serviceManager.getService('task');
      if (!taskService) {
        logger.error('Index', '无法获取任务服务');
        return;
      }
      
      // 使用任务服务计算进度
      const result = await taskService.calculateTaskProgress(tasks);
      logger.info('Index', '任务进度计算成功', result);
      
      // 确保所有进度值都是数字类型
      const taskProgress = {
        habit: Number(result.taskProgress.habit || 0),
        interest: Number(result.taskProgress.interest || 0),
        study: Number(result.taskProgress.study || 0)
      };
      
      // 更新页面数据
      this.setData({ 
        taskProgress: taskProgress,
        stats: result.stats
      });
    } catch (error) {
      logger.error('Index', '计算任务进度失败', error);
    }
  },
  
  /**
   * 更新任务统计信息
   */
  updateTaskStats: async function() {
    try {
      logger.info('Index', '开始更新任务统计');
      
      // 获取任务服务
      const taskService = serviceManager.getService('task');
      if (!taskService) {
        logger.error('Index', '无法获取任务服务');
        return;
      }
      
      // 设置日期范围（默认为最近30天）
      const dateRange = {
        startDate: null, // 使用服务默认值
        endDate: null    // 使用服务默认值
      };
      
      // 获取任务统计数据
      const stats = await taskService.getTaskStatistics(dateRange);
      logger.info('Index', '任务统计获取成功', {
        totalTasks: stats.totalTasks,
        completedTasks: stats.completedTasks,
        completionRate: stats.completionRate,
        streak: stats.streak
      });
      
      // 更新页面数据
      this.setData({ stats });
    } catch (error) {
      logger.error('Index', '更新任务统计失败', error);
    }
  },
  
  /**
   * 检查即将到期任务
   */
  checkUpcomingTasks: async function() {
    try {
      logger.info('Index', '开始检查即将到期任务');
      logger.info('Index', '当前upcomingTask状态', this.data.upcomingTask);
      logger.info('Index', '当前showUpcomingTask状态', this.data.showUpcomingTask);
      
      // 获取任务服务
      const taskService = serviceManager.getService('task');
      if (!taskService) {
        logger.error('Index', '无法获取任务服务');
        return;
      }
      
      // 获取即将到期的任务
      const upcomingResult = await taskService.checkUpcomingTasks();
      logger.info('Index', '任务服务返回结果', upcomingResult);
      
      // 检查返回结果的结构
      if (upcomingResult && upcomingResult.success && upcomingResult.tasks && upcomingResult.tasks.length > 0) {
        // 取第一个即将到期的任务
        const firstUpcoming = upcomingResult.tasks[0];
        const task = firstUpcoming.task;
        
        logger.info('Index', '发现即将到期任务', { 
          taskId: task.id,
          title: task.title,
          timeRemaining: firstUpcoming.timeRemaining
        });
        
        // 格式化开始时间
        const formattedStartTime = task.startTime || '开始';
        
        this.setData({
          upcomingTask: {
            id: task.id,
            name: task.title || '未命名任务',  // 组件模板使用name字段
            title: task.title || '未命名任务', // 保留title字段以备用
            timeRemaining: firstUpcoming.timeRemaining || 0,
            formattedStartTime: formattedStartTime
          },
          showUpcomingTask: true
        });
      } else {
        logger.info('Index', '没有即将到期的任务', upcomingResult);
        this.setData({
          showUpcomingTask: false
        });
      }
    } catch (error) {
      logger.error('Index', '检查即将到期任务失败', error);
      this.setData({
        showUpcomingTask: false
      });
    }
  },

  // 完成任务
  async completeTask(e) {
    const id = e.detail.taskId;
    
    if (!id) {
      logger.warn('Index', '完成任务失败: 任务ID为空');
      return;
    }
    
    logger.info('Index', '完成任务:', { taskId: id });
    
    // 防止重复点击
    if (this.data.processingTaskId === id) {
      logger.warn('Index', '任务正在处理中，忽略重复点击');
      return;
    }
    
    // 设置处理中状态
    this.setData({
      processingTaskId: id
    });
    
    // 获取任务当前状态，用于判断是完成还是取消完成
    logger.info('Index', `当前任务列表数量: ${this.data.tasks ? this.data.tasks.length : 0}`);
    const currentTask = this.data.tasks.find(task => task.id === id);
    if (!currentTask) {
      logger.warn('Index', '未找到指定任务', { 
        taskId: id, 
        availableTasks: this.data.tasks ? this.data.tasks.map(t => t.id) : [] 
      });
      this.setData({ processingTaskId: null });
      return;
    }
    
    const newStatus = currentTask.status === 1 ? 0 : 1; // 切换状态
    const wasStarAwarded = currentTask.starAwarded || false; // 保存原始星星状态
    const taskPoints = currentTask.points || 0; // 保存任务积分
    
    logger.info('Index', `任务详细信息: ID=${id}, 标题=${currentTask.title}, 当前状态=${currentTask.status}, 新状态=${newStatus}`);
    logger.info('Index', `任务星星信息: starAwarded=${currentTask.starAwarded}(${typeof currentTask.starAwarded}), points=${taskPoints}`);
    logger.info('Index', `任务原始星星状态: ${wasStarAwarded ? '已获得' : '未获得'}`);
    
    // 检查是否是取消完成操作
    if (newStatus === 0 && wasStarAwarded) {
      // 首先检查任务是否被锁定
      const taskService = serviceManager.getService('task');
      const rewardService = serviceManager.getService('reward');
      
      if (taskService && rewardService) {
        try {
          // 获取最后兑换时间
          const lastExchangeTime = await rewardService.getLastExchangeTime();
          
          // 检查任务是否可以取消打勾
          if (currentTask.completionTime && lastExchangeTime && currentTask.completionTime < lastExchangeTime) {
            // 任务被锁定，不能取消
            wx.showModal({
              title: '无法取消完成',
              content: '该任务已被锁定，不能取消完成。兑换奖励后完成的任务才能取消。',
              showCancel: false,
              confirmText: '我知道了'
            });
            this.setData({ processingTaskId: null });
            return;
          }
        } catch (error) {
          logger.error('Index', '检查任务锁定状态失败', error);
          // 继续执行，不阻止用户操作
        }
      }
      
      // 显示确认对话框
      const result = await new Promise((resolve) => {
        wx.showModal({
          title: '确认取消完成',
          content: '取消完成任务将扣除已获得的星星，确定要继续吗？',
          confirmText: '确定',
          cancelText: '取消',
          success: (res) => resolve(res.confirm),
          fail: () => resolve(false)
        });
      });
      
      if (!result) {
        // 用户取消操作
        this.setData({ processingTaskId: null });
        return;
      }
    }
    
    try {
      // 使用任务服务更新任务状态
      const taskService = serviceManager.getService('task');
      let result;
      
      if (newStatus === 1) {
        // 使用completeTask方法直接完成任务
        result = await taskService.completeTask(id);
      } else {
        // 使用resetTask方法重置任务状态
        result = await taskService.resetTask(id);
      }
      
      // 清除处理中状态
      this.setData({
        processingTaskId: null
      });
      
      if (result && result.success) {
        // 任务状态变更时，先刷新任务列表
        logger.info('Index', '任务状态变更，刷新任务列表');
        
        // 只刷新任务数据，星星奖励信息将在奖励检查后统一处理
        logger.info('Index', '任务状态变更成功，保持任务位置稳定');
        await this.loadTaskData();
        
        // 根据操作类型和任务状态提供合适的提示
        if (newStatus === 1) {  // 完成任务
          if (!wasStarAwarded) {  // 使用保存的原始状态判断
            // 首次完成任务，获得星星
            wx.showToast({
              title: `获得${taskPoints}颗星星！`,
              icon: 'success',
              duration: 2000
            });
            
            // 震动反馈
            if (wx.vibrateShort) {
              wx.vibrateShort({ type: 'heavy' });
            }
            
            // 立即检查奖励达成，避免进度条状态跳跃
            logger.info('Index', '立即检查奖励达成状态');
            this.checkRewardUnlock();
          } else {
            // 再次完成任务，不会获得星星，需要刷新奖励信息
            wx.showToast({
              title: '已获得过星星',
              icon: 'none',
              duration: 1500
            });
            
            // 没有获得新星星时，正常刷新奖励信息
            this.loadStarsAndRewards();
          }
          
          // 仅当完成任务时触发庆祝动画
          setTimeout(() => {
            const progressBar = this.selectComponent('#progressBar');
            if (progressBar) {
              progressBar.playAnimation('complete');
            }
          }, 300);
        } else {  // 取消完成
          // 提示用户星星已扣除
          wx.showToast({
            title: `已扣除${taskPoints}颗星星`,
            icon: 'none',
            duration: 1500
          });
        }
      } else {
        // 操作失败，检查是否是锁定错误
        if (result && result.locked) {
          // 任务被锁定的特殊处理
          wx.showModal({
            title: '无法取消完成',
            content: result.message || '该任务已被锁定，不能取消完成。',
            showCancel: false,
            confirmText: '我知道了'
          });
        } else {
          // 其他错误
          wx.showToast({
            title: result?.message || '操作失败',
            icon: 'none',
            duration: 2000
          });
        }
      }
    } catch (error) {
      // 错误处理
      logger.error('Index', '完成任务失败', error);
      wx.showToast({
        title: '操作失败，请重试',
        icon: 'none',
        duration: 2000
      });
      
      // 清除处理中状态
      this.setData({
        processingTaskId: null
      });
    }
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
  navigateToMessageCenter: function(e) {
    logger.debug('Index', '准备跳转到消息中心页面');
    
    // 阻止事件冒泡，避免同时触发toggleMessagePreview
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    
    // 先跳转到消息中心页面
    wx.navigateTo({
      url: '/pages/message/message',
      success: () => {
        logger.debug('Index', '成功跳转到消息中心页面');
        
        // 成功跳转后再关闭消息预览
        setTimeout(() => {
          this.setData({
            showMessagePreview: false
          });
        }, 300);
      }
    });
  },
  
  // 显示/隐藏消息预览
  toggleMessagePreview: function() {
    logger.debug('Index', (this.data.showMessagePreview ? '关闭' : '打开') + '消息面板');
    const currentState = this.data.showMessagePreview;
    
    // 每次都创建新的动画实例，避免复用旧的动画状态
    this.messageAnimation = wx.createAnimation({
      duration: 250,
      timingFunction: 'ease-out',
      delay: 0
    });
    
    if (currentState) {
      logger.debug('Index', '创建关闭动画');
      // 关闭动画
      this.messageAnimation.opacity(0).scale(0.8).step();
      
      this.setData({
        messageAnimation: this.messageAnimation.export()
      });
      
      // 动画结束后再隐藏元素
      setTimeout(() => {
        logger.debug('Index', '动画结束，隐藏面板');
        this.setData({
          showMessagePreview: false
        });
      }, 250);
    } else {
      logger.debug('Index', '准备显示面板');
      // 轻微振动反馈
      if (wx.vibrateShort) {
        wx.vibrateShort({ type: 'light' });
      }
      
      // 设置初始状态
      this.messageAnimation.opacity(0).scale(0.8).step({ duration: 0 });
      logger.debug('Index', '初始化动画');
      
      this.setData({
        showMessagePreview: true,
        messageAnimation: this.messageAnimation.export(),
        showSearch: false, // 确保搜索面板关闭
        showStats: false   // 确保统计面板关闭
      });
      
      // 添加一个短暂延时，确保视图更新后再开始动画
      setTimeout(() => {
        logger.debug('Index', '执行显示动画');
        this.messageAnimation.opacity(1).scale(1).step();
        
        this.setData({
          messageAnimation: this.messageAnimation.export()
        });
      }, 50);
    }
  },
  
  // 防止点击事件冒泡
  preventBubble: function(e) {
    logger.debug('Index', '阻止事件冒泡');
    // 检查事件对象是否存在且有stopPropagation方法
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    } else {
      logger.debug('Index', '事件对象不包含stopPropagation方法');
    }
    return false;
  },
  
  // 防止蒙层触摸滑动
  preventTouchMove: function(e) {
    logger.debug('Index', '阻止蒙层触摸滑动');
    // 检查事件对象是否存在
    if (e) {
      // 检查并调用stopPropagation方法
      if (typeof e.stopPropagation === 'function') {
        e.stopPropagation();
      } else {
        logger.debug('Index', '事件对象不包含stopPropagation方法');
      }
      
      // 检查并调用preventDefault方法
      if (typeof e.preventDefault === 'function') {
        e.preventDefault();
      } else {
        logger.debug('Index', '事件对象不包含preventDefault方法');
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
      this.markMessageAsRead(e);
      
      // 记录日志
      logger.debug('Index', `标记消息已读: ${message.title}`);
    }
  },
  
  /**
   * 标记消息为已读
   * @param {Object} e 事件对象 
   */
  markMessageAsRead: function(e) {
    const messageId = e.currentTarget.dataset.id;
    if (!messageId) {
      logger.warn('Index', '标记消息已读失败：消息ID为空');
      return;
    }
    
    const messageService = serviceManager.getMessageService();
    
    messageService.markMessageAsRead(messageId)
      .then(success => {
        logger.info('Index', `标记消息已读${success ? '成功' : '失败'}: ${messageId}`);
        if (success) {
          this.getUnreadMessageCount();
        }
      })
      .catch(error => {
        logger.error('Index', '标记消息已读出错', error);
      });
  },
  
  /**
   * 标记所有消息为已读
   */
  markAllMessagesAsRead: function() {
    const messageService = serviceManager.getMessageService();
    
    messageService.markAllMessagesAsRead()
      .then(count => {
        logger.info('Index', `标记全部消息已读成功, 数量: ${count}`);
        this.getUnreadMessageCount();
        
        // 更新UI
        this.setData({
          'messages': this.data.messages.map(msg => {
            return {
              ...msg,
              isRead: true
            }
          })
        });
      })
      .catch(error => {
        logger.error('Index', '标记全部消息已读出错', error);
      });
  },

  /**
   * 获取未读消息数量
   */
  getUnreadMessageCount: function() {
    const messageService = serviceManager.getMessageService();
    
    messageService.getUnreadCount()
      .then(count => {
        this.setData({
          unreadCount: count
        });
        logger.info('Index', `更新未读消息数量: ${count}`);
      })
      .catch(error => {
        logger.error('Index', '获取未读消息数量出错', error);
      });
  },

  /**
   * 忽略即将到期任务提醒
   */
  dismissUpcomingTask: function(e) {
    const taskId = e.currentTarget.dataset.id;
    if (!taskId) {
      logger.warn('Index', '忽略即将到期任务提醒失败：任务ID为空');
      return;
    }
    
    const messageService = serviceManager.getMessageService();
    
    // 删除与此任务相关的即将到期消息
    messageService.deleteRelatedTaskMessages(taskId, NotificationType.UPCOMING)
      .then(success => {
        logger.info('Index', `忽略即将到期任务提醒${success ? '成功' : '失败'}: ${taskId}`);
        if (success) {
          this.setData({
            showUpcomingTask: false
          });
        }
      })
      .catch(error => {
        logger.error('Index', '忽略即将到期任务提醒出错', error);
      });
  },

  /**
   * 标记任务相关消息为已读
   */
  markTaskMessagesAsRead: function(e) {
    const taskId = e.currentTarget.dataset.id;
    if (!taskId) {
      logger.warn('Index', '标记任务消息已读失败：任务ID为空');
      return;
    }
    
    const messageService = serviceManager.getMessageService();
    
    // 标记与此任务相关的消息为已读
    messageService.markRelatedMessagesAsRead(taskId)
      .then(success => {
        logger.info('Index', `标记任务相关消息已读${success ? '成功' : '失败'}: ${taskId}`);
        if (success) {
          this.getUnreadMessageCount();
        }
      })
      .catch(error => {
        logger.error('Index', '标记任务相关消息已读出错', error);
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
      logger.debug('Index', '点击任务菜单项，跳转到任务编辑页面');
      wx.navigateTo({
        url: `/pages/task-edit/task-edit?mode=create`
      });
    } else if (item && item.id === 'study') {
      logger.debug('Index', '点击分析菜单项，跳转到分析页面');
      wx.showLoading({
        title: '加载中...',
        mask: true
      });
      wx.navigateTo({
        url: '/packageChart/pages/analysis/analysis',
        success: () => {
          setTimeout(() => wx.hideLoading(), 500);
        },
        fail: (err) => {
          wx.hideLoading();
          wx.showToast({
            title: '加载失败，请重试',
            icon: 'none'
          });
          logger.error('Index', '跳转到分析页面失败', err);
        }
      });
    } else if (item && item.id === 'reward-manage') {
      logger.debug('Index', '点击奖励管理菜单项，跳转到奖励管理页面');
      wx.navigateTo({
        url: '/pages/reward-manage/reward-manage'
      });
    }
  },
  
  // 触发进度圆环点击
  onRingTap: function(e) {
    logger.debug('Index', '点击进度圆环，跳转到分析页面');
    wx.showLoading({
      title: '加载中...',
      mask: true
    });
    wx.navigateTo({
      url: '/packageChart/pages/analysis/analysis',
      success: () => {
        setTimeout(() => wx.hideLoading(), 500);
      },
      fail: (err) => {
        wx.hideLoading();
        wx.showToast({
          title: '加载失败，请重试',
          icon: 'none'
        });
        logger.error('Index', '跳转到分析页面失败', err);
      }
    });
  },
  
  // 处理进度条完成事件
  onRewardComplete: function(e) {
    logger.debug('Index', '收到进度条完成事件', e.detail);
    
    // 获取当前进度数据
    const oldProgress = this.data.rewardProgress || { current: 0, total: 10 };
    
    // 获取当前用户星星数
    const userPoints = this.data.userPoints || serviceManager.getUserPoints();
    
    // 添加日志
    logger.debug('Index', `处理奖励完成事件: 当前进度=${JSON.stringify(oldProgress)}, 星星数=${userPoints}`);
    
    // 正确传递参数
    this._handleRewardCompletion(oldProgress, userPoints);
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
    const taskService = serviceManager.getTaskService();
    taskService.getAllTasks().then(allTasks => {
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
  },

  /**
   * 检查奖励解锁状态
   * 在任务完成后检查是否有奖励达成，如有则显示奖励选择对话框
   */
  checkRewardUnlock: async function() {
    try {
      logger.info('Index', '开始检查奖励解锁状态');
      
      // 获取服务实例
      const starService = serviceManager.getService('starService');
      const rewardService = serviceManager.getService('rewardService');
      
      if (!starService || !rewardService) {
        logger.error('Index', '无法获取服务实例，跳过奖励检查');
        return;
      }
      
      // 获取当前星星数和所有可用奖励
      const [userPoints, allRewards] = await Promise.all([
        starService.getTotalStars(),
        rewardService.getAvailableRewards(true)
      ]);
      
      logger.info('Index', '奖励检查数据', { userPoints, rewardCount: allRewards.length });
      
      // 找到所有已解锁但未领取的奖励
      const unlockedRewards = allRewards.filter(reward => 
        !reward.claimed && reward.points <= userPoints
      );
      
      logger.info('Index', '已解锁未领取奖励', { count: unlockedRewards.length });
      
      if (unlockedRewards.length > 0) {
        // 选择点数最低的已解锁奖励作为达成奖励
        const achievedReward = unlockedRewards.sort((a, b) => a.points - b.points)[0];
        
        logger.info('Index', '检测到奖励达成', { 
          rewardName: achievedReward.name, 
          requiredPoints: achievedReward.points,
          userPoints: userPoints
        });
        
        // 先设置进度条为满值状态
        await this._handleRewardCompletion(null, achievedReward.points);
        
        // 设置完成的奖励信息
        this.setData({
          completedReward: achievedReward,
          completedRewardTotal: achievedReward.points
        });
        
        // 延迟显示奖励选择对话框，让满值动效先播放
        setTimeout(() => {
          this.showRewardChoiceDialog();
        }, 500);
      } else {
        logger.info('Index', '暂无奖励达成，正常刷新奖励信息');
        
        // 没有奖励达成时，正常刷新奖励信息
        this.loadStarsAndRewards();
      }
      
    } catch (error) {
      logger.error('Index', '检查奖励解锁状态失败', error);
    }
  },

  /**
   * 加载用户星星和奖励信息
   */
  loadStarsAndRewards: async function() {
    try {
      // 获取服务实例
      const starService = serviceManager.getService('starService');
      const rewardService = serviceManager.getService('rewardService');
      
      if (!starService || !rewardService) {
        logger.error('Index', '无法获取服务实例');
        return;
      }
      
      // 获取星星信息和最后兑换时间
      const [userPoints, lastExchangeTime] = await Promise.all([
        starService.getTotalStars(),
        rewardService.getLastExchangeTime()
      ]);
      const formattedPoints = formatUtils.formatPoints(userPoints, true);
      
      logger.info('Index', '当前用户星星数', { userPoints });
      logger.info('Index', '最后兑换时间', { lastExchangeTime });
      
      // 调用奖励服务方法，传递已获取的星星数确保数据一致性
      logger.info('Index', '开始获取奖励数据，使用已获取的星星数确保一致性');
      const [nextReward, visibleRewards] = await Promise.all([
        rewardService.calculateNextAvailableReward(userPoints),
        rewardService.getAvailableRewards(true)
      ]);
      
      logger.info('Index', '获取到下一个可达成奖励', { name: nextReward ? nextReward.name : '无' });
      logger.info('Index', '获取到可见奖励', { count: visibleRewards.length });
      
      // 判断是否需要显示设置奖励提示对话框
      // 当没有任何真实奖励时（只有默认占位奖励或完全没有奖励）
      const hasNoRealReward = !nextReward || nextReward.isDefault;
      if (hasNoRealReward && visibleRewards.length === 0) {
        logger.info('Index', '检测到无真实奖励，显示设置奖励提示');
        
        // 设置nextReward的适当参数，以便在进度条下方显示合适的信息
        if (nextReward) {
          nextReward.showSetupTip = true; // 添加标记，用于进度条下方的条件渲染
        }
      }
      
      // 如果没有可见奖励，但存在nextReward，需区分是否为默认占位奖励
      let visibleRewardsToShow = [...visibleRewards];
      if (visibleRewardsToShow.length === 0 && nextReward) {
        // 记录详细日志便于诊断
        logger.info('Index', '检查奖励信息', {
          name: nextReward.name,
          id: nextReward.id,
          isDefault: nextReward.isDefault,
          showSetupTip: nextReward.showSetupTip
        });
        
        // 如果是默认占位奖励(有isDefault属性)，不添加到显示列表
        if (nextReward.isDefault) {
          logger.info('Index', '检测到默认占位奖励，不添加到显示列表');
        }
        // 只有真实奖励（有id属性）才添加到显示列表
        else if (nextReward.id) {
          logger.info('Index', '无可见奖励但存在有效奖励，添加到显示列表');
          visibleRewardsToShow = [nextReward];
        }
      }
      
      // 检查是否有奖励刚刚达成（用于正确设置进度条）
      const hasAchievedReward = visibleRewards.some(reward => 
        !reward.claimed && reward.points <= userPoints
      );
      
      // 计算进度条的total值
      let progressTotal;
      if (nextReward.allClaimed || nextReward.isDefault || nextReward.showSetupTip) {
        // 没有真实奖励时设置更大的total值，确保进度条显示一致
        progressTotal = Math.max(userPoints * 2, 100);
      } else if (hasAchievedReward) {
        // 如果有奖励刚刚达成，使用该奖励的点数作为total，确保显示满值
        const achievedReward = visibleRewards
          .filter(reward => !reward.claimed && reward.points <= userPoints)
          .sort((a, b) => a.points - b.points)[0];
        progressTotal = achievedReward ? achievedReward.points : (nextReward.points || 100);
      } else {
        // 正常情况下使用下一个奖励的点数
        progressTotal = nextReward && nextReward.points ? nextReward.points : 100;
      }
      
      // 更新UI状态
      this.setData({
        userPoints,
        formattedPoints,
        nextReward,
        lastExchangeTime,
        visibleRewards: visibleRewardsToShow.slice(0, 3).map(reward => ({
          id: reward.id,
          name: reward.name,
          points: reward.points,
          icon: reward.icon,
          status: reward.claimed ? 'claimed' : (reward.points <= userPoints ? 'unlocked' : 'current'),
          isExample: !!reward.isExample // 确保传递示例奖励标记
        })),
        hasMoreRewards: visibleRewardsToShow.length > 3,
        rewardProgress: {
          current: userPoints,
          total: progressTotal
        }
      });
      
      logger.info('Index', '奖励进度条数据已更新', { 
        current: userPoints, 
        total: progressTotal,
        hasAchievedReward: hasAchievedReward,
        progressType: hasAchievedReward ? '已达成奖励' : 
                     (nextReward.allClaimed || nextReward.isDefault || nextReward.showSetupTip) ? '无限制' : '下一目标',
        uiOptimization: '已应用统一文字样式系统'
      });
      
    } catch (error) {
      logger.error('Index', '加载星星和奖励信息失败', error);
    }
  },
  
  /**
   * 处理奖励完成的满值状态
   * 独立函数处理满值逻辑，避免代码重复
   */
  _handleRewardCompletion: async function(oldProgress, userPoints) {
    try {
      logger.info('Index', '处理奖励完成状态', { targetPoints: userPoints });
      
      const starService = serviceManager.getService('starService');
      const rewardService = serviceManager.getService('rewardService');
      
      if (!starService || !rewardService) {
        logger.error('Index', '无法获取服务实例');
        return;
      }
      
      // 获取当前实际星星数（确保数据一致性）
      const actualUserPoints = await starService.getTotalStars();
      
      // 格式化星星数展示
      const formattedPoints = formatUtils.formatPoints(actualUserPoints);
      
      // 获取可见奖励信息，用于更新奖励指示器
      const visibleRewards = await rewardService.getAvailableRewards(true);
      const visibleRewardsToShow = visibleRewards.slice(0, 3).map(reward => ({
        id: reward.id,
        name: reward.name,
        points: reward.points,
        icon: reward.icon,
        status: reward.claimed ? 'claimed' : (reward.points <= actualUserPoints ? 'unlocked' : 'current'),
        isExample: !!reward.isExample
      }));
      
      // 更新UI显示满值状态，同时更新奖励指示器
      this.setData({
        userPoints: actualUserPoints,
        rewardProgress: {
          current: userPoints, // 使用目标点数显示满值
          total: userPoints
        },
        formattedPoints: formattedPoints,
        visibleRewards: visibleRewardsToShow,
        hasMoreRewards: visibleRewards.length > 3,
        forceKeepFullValue: true,
        completedRewardTotal: userPoints,
        rewardTextState: 'achieved',
        transitionInProgress: true
      });
      
      logger.info('Index', '奖励完成状态设置完毕');
    } catch (error) {
      logger.error('Index', '处理奖励完成状态失败', error);
    }
  },
  
  /**
   * 显示奖励选择对话框
   */
  showRewardChoiceDialog: function() {
    logger.debug('Index', '显示奖励选择对话框');
    
    // 如果对话框已显示，不重复操作
    if (this.data.showRewardChoice) {
      return;
    }
    
    // 震动反馈
    if (wx.vibrateShort) {
      wx.vibrateShort({ type: 'heavy' });
    }
    
    // 创建动画实例
    const animation = wx.createAnimation({
      duration: 300,
      timingFunction: 'ease',
    });
    
    // 设置初始状态（缩小并透明）
    animation.scale(0.8).opacity(0).step({ duration: 0 });
    
    // 设置数据并显示对话框
    this.setData({
      showRewardChoice: true,
      choiceDialogTitle: `恭喜！已达成"${this.data.completedReward.name}"`,
      choiceDialogAnimation: animation.export()
    });
    
    // 执行显示动画
    setTimeout(() => {
      animation.scale(1).opacity(1).step();
      this.setData({
        choiceDialogAnimation: animation.export()
      });
    }, 50);
  },
  
  /**
   * 点击继续积累
   */
  continueCollecting: function() {
    logger.debug('Index', '用户选择继续积累星星');
    
    // 创建动画实例
    const animation = wx.createAnimation({
      duration: 300,
      timingFunction: 'ease-out',
    });
    
    // 设置隐藏动画
    animation.scale(0.8).opacity(0).step();
    
    this.setData({
      choiceDialogAnimation: animation.export()
    });
    
    // 延迟关闭对话框，然后开始过渡
    setTimeout(() => {
      this.setData({
        showRewardChoice: false,
        forceKeepFullValue: false // 解除满值保护
      });
      
      // 执行过渡到新目标的动画
      this.transitionToNewTarget();
    }, 300);
  },
  
  /**
   * 过渡到新目标
   */
  transitionToNewTarget: async function() {
    logger.debug('Index', '执行过渡到新目标的动画');
    
    try {
      // 清除所有满值相关状态
      this.setData({
        forceKeepFullValue: false,
        transitionInProgress: false,
        showRewardChoice: false,
        rewardTextState: 'newTarget'
      });
      
      // 获取服务实例
      const starService = serviceManager.getService('starService');
      const rewardService = serviceManager.getService('rewardService');
      
      if (!starService || !rewardService) {
        logger.error('Index', '无法获取服务实例');
        return;
      }
      
      // 获取当前星星数
      const userPoints = await starService.getTotalStars();
      logger.debug('Index', `当前星星数: ${userPoints}`);
      
      // 获取下一个可达成奖励，传递已获取的星星数确保一致性
      logger.debug('Index', '获取下一个可达成奖励');
      const nextReward = await rewardService.calculateNextAvailableReward(userPoints);
      logger.debug('Index', `新目标信息: 下一目标=${nextReward ? nextReward.name : '无'}, 需要星星=${nextReward ? nextReward.points : 0}`);
      
      // 格式化星星数
      const formattedPoints = formatUtils.formatPoints(userPoints, true);
      
      // 获取进度条组件并平滑过渡
      const progressBar = this.selectComponent('#progressBar');
      if (progressBar) {
        logger.debug('Index', '进度条平滑过渡到新目标');
        progressBar.setData({
          current: userPoints,
          // 没有真实奖励时设置更大的total值，确保进度条显示一致
          total: (nextReward.allClaimed || nextReward.isDefault || nextReward.showSetupTip) ? 
                 Math.max(userPoints * 2, 100) : // 设置为当前星星数的两倍或至少100
                 (isFinite(parseInt(nextReward.points)) ? parseInt(nextReward.points) : 100)
        });
      }
      
      // 更新数据到新目标
      this.setData({
        userPoints: userPoints,
        formattedPoints: formattedPoints,
        nextReward: nextReward,
        rewardProgress: {
          current: userPoints,
          // 没有真实奖励时设置更大的total值，确保进度条显示一致
          total: (nextReward.allClaimed || nextReward.isDefault || nextReward.showSetupTip) ? 
                 Math.max(userPoints * 2, 100) : // 设置为当前星星数的两倍或至少100
                 (nextReward.points || 100)
        }
      });
    } catch (error) {
      logger.error('Index', '过渡到新目标时出错', error);
    }
  },
  
  // 点击查看奖池
  viewRewardPool: function() {
    logger.debug('Index', '用户选择查看奖池');
    
    // 保存更多状态信息
    const app = getApp();
    app.globalData.hasRedirectedToReward = true;
    app.globalData.completedRewardInfo = {
      reward: this.data.completedReward,
      total: this.data.completedRewardTotal
    };
    
    // 使用Storage备份标记(更可靠)
    wx.setStorageSync('fromRewardCompletion', true);
    wx.setStorageSync('completedRewardInfo', {
      reward: this.data.completedReward,
      total: this.data.completedRewardTotal
    });
    
    // 隐藏对话框
    this.setData({
      showRewardChoice: false
    });
    
    // 跳转到奖池页面
    setTimeout(() => {
      wx.switchTab({
        url: '/pages/rewards/rewards'
      });
    }, 300);
  },
  
  // 点击奖励指示器
  onRewardIndicatorTap: function(e) {
    const rewardId = e.currentTarget.dataset.id;
    const reward = this.data.visibleRewards.find(r => r.id === rewardId);
    
    if (!reward) return;
    
    logger.debug('Index', `点击奖励指示器: ${reward.name}, 状态: ${reward.status}`);
    
    // 已解锁或已领取状态，跳转到奖池
    if (reward.status === 'unlocked' || reward.status === 'claimed') {
      wx.switchTab({
        url: '/pages/rewards/rewards'
      });
    } else if (reward.status === 'current') {
      // 如果是当前目标，显示提示
      wx.showToast({
        title: `目标: ${reward.name}`,
        icon: 'none'
      });
    }
  },
  
  // 显示所有奖励
  showAllRewards: function() {
    logger.debug('Index', '查看所有奖励');
    wx.switchTab({
      url: '/pages/rewards/rewards'
    });
  },
  
  // 生成奖励提示文本
  generateRewardHintText: function(userPoints, allRewards) {
    // 找到所有已解锁的奖励
    const unlockedRewards = allRewards.filter(r => userPoints >= r.points);
    const unlockedCount = unlockedRewards.length;
    
    let hintText = '';
    
    if (unlockedCount > 1) {
      hintText = `恭喜！您已达成${unlockedCount}个奖品，可前往奖池查看`;
    } else if (unlockedCount === 1) {
      hintText = `恭喜！已达成${unlockedRewards[0].name}，可前往奖池查看`;
    } else {
      // 保持原有提示
      hintText = null;
    }
    
    this.setData({
      rewardHintText: hintText
    });
  },
  
  /**
   * 检查是否只有示例奖励可用
   * @return {Boolean} 是否只有示例奖励
   */
  hasOnlyExampleRewards: function() {
    logger.debug('Index', '检查是否只有示例奖励可用');
    
    // 使用RewardService获取信息
    const rewardService = serviceManager.getRewardService();
    const result = rewardService.hasOnlyExampleRewardsSync();
    
    logger.debug('Index', `是否只有示例奖励: ${result}`);
    return result;
  },
  
  /**
   * 显示设置奖励提示对话框
   */
  showSetupRewardTip: function() {
    logger.debug('Index', '显示设置奖励提示');
    
    // 创建动画实例
    const animation = wx.createAnimation({
      duration: 300,
      timingFunction: 'ease',
    });
    
    // 设置初始状态（缩小并透明）
    animation.scale(0.8).opacity(0).step({ duration: 0 });
    
    // 设置数据并显示对话框
    this.setData({
      showSetupRewardTip: true,
      setupRewardTipAnimation: animation.export()
    });
    
    // 执行显示动画
    setTimeout(() => {
      animation.scale(1).opacity(1).step();
      this.setData({
        setupRewardTipAnimation: animation.export()
      });
    }, 50);
  },
  
  /**
   * 关闭设置奖励提示对话框
   */
  closeSetupRewardTip: function() {
    logger.debug('Index', '关闭设置奖励提示');
    
    // 创建动画实例
    const animation = wx.createAnimation({
      duration: 300,
      timingFunction: 'ease-out',
    });
    
    // 设置隐藏动画
    animation.scale(0.8).opacity(0).step();
    
    this.setData({
      setupRewardTipAnimation: animation.export()
    });
    
    // 延迟关闭对话框
    setTimeout(() => {
      this.setData({
        showSetupRewardTip: false
      });
    }, 300);
  },
  
  /**
   * 跳转到奖励管理页面
   */
  navigateToRewardManage: function() {
    logger.debug('Index', '跳转到奖励管理页面');
    
    // 先关闭提示对话框
    this.closeSetupRewardTip();
    
    // 延迟跳转，等动画完成
    setTimeout(() => {
      wx.navigateTo({
        url: '/pages/reward-manage/reward-manage'
      });
    }, 300);
  },
  
  // 准备奖励指示器数据
  _prepareRewardIndicators: function() {
    logger.debug('Index', `准备显示奖品指示器: ${this.data.visibleRewards.length}个, 状态分布: ${this.data.visibleRewards.map(r => r.status).join(',')}`);
    
    // 获取奖励服务
    const rewardService = serviceManager.getRewardService();
    
    // 处理奖品指示器
    const processedRewards = this.data.visibleRewards.map(reward => {
      let status = 'locked'; // 默认状态：未解锁
      
      // 先检查是否已领取
      if (reward.claimed) {
        status = 'claimed'; // 已领取状态
      } else if (this.data.userPoints >= reward.points) {
        status = 'unlocked'; // 已解锁状态
      } else if (this.data.nextReward && this.data.nextReward.id === reward.id) {
        status = 'current'; // 当前目标状态
      }
      
      return {
        ...reward,
        status,
        isExample: rewardService._isExampleReward(reward) // 使用服务层方法判断是否为示例奖励
      };
    });
    
    // 最多显示5个，如果更多设置标记
    const hasMoreRewards = processedRewards.length > 5;
    const visibleRewards = processedRewards.slice(0, 5);
    
    this.setData({
      visibleRewards,
      hasMoreRewards
    });
  },

  // 任务状态切换处理函数
  taskItemStatusToggle: async function(e) {
    try {
      // 获取任务ID和新状态
      const { id, newStatus } = e.detail;
      
      // 记录当前处理的任务ID，用于UI加载状态显示
      this.setData({
        processingTaskId: id
      });
      
      logger.info('Index', `切换任务状态: 任务ID=${id}, 新状态=${newStatus}`);
      
      // 使用任务服务更新任务状态
      const taskService = serviceManager.getTaskService();
      const updatedTask = await taskService.updateTaskStatus(id, newStatus);
      
      // 清除处理中状态
      this.setData({
        processingTaskId: null
      });
      
      // 刷新进度条动画和任务数据
      this.transitionToNewTarget();
      this.loadTaskData();
    } catch (error) {
      logger.error('Index', '更新任务状态失败', error);
      
      // 清除处理中状态
      this.setData({
        processingTaskId: null
      });
      
      // 提示错误
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
    }
  },

  // 搜索任务
  searchTasks: async function() {
    try {
      const query = this.data.searchQuery;
      if (!query || query.trim() === '') {
        return;
      }
      
      logger.info('Index', `执行任务搜索: 关键词=${query}`);
      
      // 获取任务服务
      const taskService = serviceManager.getTaskService();
      
      // 从全局获取所有任务
      const allTasks = await taskService.getAllTasks();
      
      // 基于关键词搜索
      let results = [];
      
      // 搜索逻辑：标题包含、描述包含、标签包含
      results = allTasks.filter(task => {
        const titleMatch = task.title && task.title.toLowerCase().includes(query.toLowerCase());
        const descMatch = task.description && task.description.toLowerCase().includes(query.toLowerCase());
        const tagMatch = task.tags && task.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()));
        
        return titleMatch || descMatch || tagMatch;
      });
      
      logger.info('Index', `搜索结果: ${results.length}个匹配任务`);
      
      // 更新搜索结果到UI
      this.setData({
        searchResults: results
      });
    } catch (error) {
      logger.error('Index', '搜索任务失败', error);
      this.setData({
        searchResults: []
      });
    }
  },

  /**
   * 加载今日所有任务
   */
  loadTodayTasks: async function() {
    try {
      logger.info('Index', '开始加载今日所有任务');
      
      // 获取任务服务
      const taskService = serviceManager.getService('task');
      if (!taskService) {
        logger.error('Index', '无法获取任务服务');
        return;
      }
      
      // 获取今日所有任务
      const tasks = await taskService.getTodayTasks();
      logger.info('Index', `今日任务加载成功，任务数量: ${tasks.length}`);
      
      // 更新页面数据
      this.setData({
        tasks: tasks,
        hasTodayTasks: (tasks && tasks.length > 0)
      });
      
    } catch (error) {
      logger.error('Index', '加载今日任务失败', error);
      
      wx.showToast({
        title: '加载任务失败',
        icon: 'none',
        duration: 2000
      });
    }
  },

  /**
   * 处理任务创建事件
   * @param {Object} data 事件数据
   */
  handleTaskCreated: function(data) {
    logger.info('Index', '收到任务创建事件', data);
    
    // 重新加载今日任务
    this.loadTodayTasks();
  },
}) 