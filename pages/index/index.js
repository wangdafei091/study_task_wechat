const serviceManager = require('../../services/service-manager.js');
const dateUtils = require('../../utils/dateUtils');
const logger = require('../../utils/logger');
const messageDisplay = require('../../utils/message-display');
const permissionUtils = require('../../utils/permission-utils');
const viewScopeUtils = require('../../utils/view-scope');
const { UserService } = require('../../services/user-service');
const MessageService = require('../../services/message-service');
const pageStorageHelper = require('../../utils/page-storage-helper');
const lifecycleModule = require('./modules/index-lifecycle');
const refreshCoordinator = require('./modules/index-refresh-coordinator');
const userContextModule = require('./modules/index-user-context');
const taskActionsModule = require('./modules/index-task-actions');
const rewardFlowModule = require('./modules/index-reward-flow');

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
    lastExchangeTime: null, // 最后一次兑换时间，用于计算任务锁定状态

    // 多用户相关数据
    currentUser: {
      id: null,
      name: '用户',
      role: UserService.getUserRoles().CHILD
    },
    availableUsers: [], // 可用用户列表
    showUserSwitcher: false, // 是否显示用户切换界面
    userPermissions: {}, // 当前用户权限
    loginUserId: null,         // 设备拥有者ID（权限依据）
    canManageMembers: false,   // 是否可管理家庭成员（家长专属）
    isReadonlyView: false,     // 孩子视角只读：孩子设备（loginUser.role==='child'）或家长切到孩子视角（loginUser.userId !== currentUser.userId）
    lastActiveChildId: null,   // 家长最近查看的孩子ID（家长视角时任务仍显示该孩子）

    // 日期导航相关
    currentViewDate: null, // 当前查看的日期（YYYY-MM-DD格式）
    dateNavigation: [], // 日期导航数据数组
    pageTitle: '今日任务', // 页面标题，根据选择的日期动态更新
    hasTodayTasks: false // 是否有今日任务（用于显示空状态）
  },
  
  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    return lifecycleModule.onLoad(this, options);
  },
  
  /**
   * 注册事件监听
   */
  registerEventListeners: function() {
    // 使用serviceManager获取EventBus
    const eventBus = serviceManager.getEventBus();
    if (eventBus) {
      const handlers = this._eventHandlers || {};

      // 监听任务数据变化
      eventBus.on('task:changed', handlers.taskChanged);
      
      // 监听任务创建事件
      eventBus.on('task:created', handlers.taskCreated);
      
      // 监听消息数据变化
      eventBus.on('message:changed', handlers.messageChanged);
      
      // 监听奖励领取事件
      eventBus.on('reward:claimed', handlers.rewardClaimed);
      
      // 监听奖励更新相关事件
      eventBus.on('reward:updated', handlers.rewardUpdated);
      eventBus.on('reward:examples_cleared', handlers.rewardUpdated);
      
      // 监听进度条完成事件
      eventBus.on('progressbar:complete', handlers.progressbarComplete);
    }
  },
  
  /**
   * 处理奖励更新事件
   */
  handleRewardUpdated: function(data) {
    return refreshCoordinator.handleRewardUpdated(this, data);
  },

  /**
   * 处理进度条完成事件
   * 当进度条达到满值时触发，用于锁定用户操作并准备显示奖励对话框
   */
  handleProgressBarComplete: function() {
    logger.info('Index', '收到进度条完成事件，准备处理奖励达成');
    
    // 避免重复处理
    if (this.data.transitionInProgress) {
      logger.info('Index', '进度条完成事件已在处理中，跳过重复调用');
      return;
    }
    
    // 使用异步调度避免递归更新，延迟到下一个渲染周期
    setTimeout(() => {
      // 设置UI锁定状态，防止用户在动效期间进行其他操作
      this.setData({
        transitionInProgress: true,
        forceKeepFullValue: true
      });
      
      logger.info('Index', '进度条完成事件处理完毕，UI已锁定');
    }, 0);
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
    return refreshCoordinator.handleTaskDataChanged(this, eventData);
  },
  
  /**
   * 处理消息数据变化事件
   */
  handleMessageDataChanged: function(eventData) {
    return refreshCoordinator.handleMessageDataChanged(this, eventData);
  },
  
  /**
   * 处理奖励领取事件
   */
  handleRewardClaimed: function(eventData) {
    return refreshCoordinator.handleRewardClaimed(this, eventData);
  },
  
  /**
   * 生命周期函数--监听页面显示
   */
  onShow: async function() {
    return lifecycleModule.onShow(this);
  },

  /**
   * 等待登录完成
   * 在云端模式下，确保token已获取后再继续执行
   */
  waitForLoginComplete: async function() {
    return lifecycleModule.waitForLoginComplete(this);
  },

  /**
   * 等待服务准备就绪
   */
  waitForServicesReady: async function() {
    return lifecycleModule.waitForServicesReady(this);
  },
  
  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function() {
    // 解除事件监听
    const eventBus = serviceManager.getEventBus();
    const handlers = this._eventHandlers || {};
    if (eventBus) {
      eventBus.off('task:changed', handlers.taskChanged);
      eventBus.off('task:created', handlers.taskCreated);
      eventBus.off('message:changed', handlers.messageChanged);
      eventBus.off('reward:claimed', handlers.rewardClaimed);
      eventBus.off('reward:updated', handlers.rewardUpdated);
      eventBus.off('reward:examples_cleared', handlers.rewardUpdated);
      eventBus.off('progressbar:complete', handlers.progressbarComplete);
    }
  },

  /**
   * 检查过期任务和星星
   * 每次进入首页时检查，但有5分钟间隔控制，避免频繁执行
   */
  checkExpiredTasksAndStars: async function() {
    return refreshCoordinator.checkExpiredTasksAndStars(this);
  },

  /**
   * 批量加载页面所有数据
   * 统一处理所有数据加载，避免重复调用和多次UI更新
   */
  loadAllPageData: async function(options = {}) {
    return refreshCoordinator.loadAllPageData(this, options);
  },

  /**
   * 仅加载任务数据（共享模式）
   * 注意：任务设计为共享模式，家长创建任务，小朋友执行，两者都能看到所有任务
   * @param {String} date 可选的日期参数（YYYY-MM-DD格式），不传则加载今日任务
   */
  loadTaskDataOnly: async function(date = null) {
    try {
      // 获取任务服务
      const taskService = serviceManager.getService('task');
      if (!taskService) {
        logger.error('Index', '无法获取任务服务');
        return;
      }
      
      // 根据日期参数决定加载方式
      let tasks;
      let targetDate;
      
      const currentUserId = this.getEffectiveTaskUserId();
      if (date) {
        // 加载指定日期的任务
        targetDate = date;
        tasks = await taskService.getTasksByDate(date, currentUserId, { requireFreshStars: true });
        logger.info('Index', `指定日期任务加载成功（共享模式）, 日期=${date}, 任务数量: ${tasks.length}`);
      } else {
        // 加载今日任务
        targetDate = dateUtils.getTodayString();
        tasks = await taskService.getTodayTasks(currentUserId, { requireFreshStars: true });
        logger.info('Index', `今日任务加载成功（共享模式）, 任务数量: ${tasks.length}`);
      }
      
      // 添加详细的任务状态日志
      tasks.forEach((task, index) => {
        logger.info('Index', `🔒 任务${index + 1}详细状态:`, {
          id: task.id,
          title: task.title,
          status: task.status,
          statusType: typeof task.status,
          starAwarded: task.starAwarded,
          starAwardedType: typeof task.starAwarded,
          points: task.points,
          completionTime: task.completionTime,
          completionTimeDate: task.completionTime ? new Date(task.completionTime).toLocaleString() : '未完成'
        });
      });
      
      // 更新当前查看的日期
      const todayString = dateUtils.getTodayString();
      const isToday = targetDate === todayString;
      
      // 更新页面数据
      this.setData({
        tasks: tasks,
        hasTodayTasks: (tasks && tasks.length > 0),
        currentViewDate: targetDate,
        pageTitle: isToday ? '今日任务' : `${this.formatDateTitle(targetDate)}任务`
      });
      
      // 检查任务进度
      await this.calculateProgress(tasks);
      
      // 更新任务统计信息
      await this.updateTaskStats();
      
      return tasks;
    } catch (error) {
      logger.error('Index', '加载任务数据失败', error);
      throw error;
    }
  },

  /**
   * 加载任务数据（保持向后兼容）
   */
  loadTaskData: async function() {
    try {
      const tasks = await this.loadTaskDataOnly();
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

  /**
   * 刷新当前视图日期的任务数据，避免操作后跳回今天
   */
  refreshTaskDataForCurrentView: async function(options = {}) {
    return refreshCoordinator.refreshTaskDataForCurrentView(this, options);
  },
  
  // 从消息管理器加载消息数据
  // 孩子视角读取个人流，家长视角优先读取家庭动态流
  loadMessageData: async function(options = {}) {
    try {
      const messageService = serviceManager.getMessageService();
      const scopeOptions = this.getMessageScopeOptions();
      const messages = await messageService.getMessagesByScope({
        ...scopeOptions,
        requireFresh: true,
        skipExpiryAuthoritySyncBeforeFormalReminders:
          options.skipExpiryAuthoritySyncBeforeFormalReminders === true
      });
      
      const processedMessages = messageDisplay.buildPreviewMessages(messages, {
        limit: 3,
        formatMessageTime: (createTime) => dateUtils.formatRelativeTime(createTime)
      });
      
      // 计算未读消息数量（基于完整 scope 消息集合）
      const unreadCount = messages.filter(msg => !msg.isRead).length;
      
      this.setData({
        messages: processedMessages,
        unreadCount
      });
      
      logger.info('Index', `消息数据加载成功, scope=${scopeOptions.scope}`, {
        消息总数: messages.length,
        显示数量: processedMessages.length,
        未读数量: unreadCount
      });
    } catch (error) {
      logger.error('Index', '加载消息数据失败', error);
      this.setData({
        messages: [],
        unreadCount: 0
      });
    }
  },

  getMessageScopeOptions: function() {
    const userService = getApp().globalData?.userService;
    const loginUser = userService?.getLoginUser?.() || null;
    const currentUser = userService?.getCurrentUser?.() || null;
    return viewScopeUtils.resolveMessageScopeOptions(loginUser, currentUser);
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
      
      // 使用任务服务计算进度（服务层已处理数据类型转换）
      const result = await taskService.calculateTaskProgress(tasks);
      logger.info('Index', '任务进度计算成功', result);
      
      // 直接使用服务层返回的结果，无需页面层数据转换
      this.setData({ 
        taskProgress: result.taskProgress,
        stats: result.stats
      });
    } catch (error) {
      logger.error('Index', '计算任务进度失败', error);
    }
  },
  
  /**
   * 更新任务统计信息（共享模式）
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

      const effectiveUserId = this.getEffectiveTaskUserId();
      const scopeOptions = effectiveUserId ? { userId: effectiveUserId } : {};

      // 获取任务统计数据，口径与首页当前任务列表保持一致
      const stats = await taskService.getTaskStatistics(dateRange, scopeOptions);
      logger.info('Index', '任务统计获取成功（共享模式）', {
        effectiveUserId,
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
      
      // 获取即将到期的任务（按当前视角用户过滤）
      const upcomingUserId = this.getEffectiveTaskUserId();
      const upcomingResult = await taskService.checkUpcomingTasks(upcomingUserId);
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

  /**
   * 格式化日期标题
   * @param {String} dateString 日期字符串（YYYY-MM-DD格式）
   * @returns {String} 格式化后的日期标题
   */
  formatDateTitle: function(dateString) {
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  },

  /**
   * 生成日期导航数据
   * @returns {Array} 日期导航数组
   */
  generateDateNavigation: function() {
    const dates = [];
    const today = new Date();
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    
    // 生成7天：今天往前推6天到今天
    for (let i = -6; i <= 0; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateString = dateUtils.formatDate(date);
      const weekday = weekdays[date.getDay()];
      
      dates.push({
        dateString: dateString,
        label: i === 0 ? '今天' : weekday,
        isToday: i === 0,
        isHistorical: i < 0
      });
    }
    
    return dates;
  },

  /**
   * 初始化日期导航
   */
  initializeDateNavigation: function() {
    const dateNavigation = this.generateDateNavigation();
    const todayString = dateUtils.getTodayString();
    
    this.setData({
      dateNavigation: dateNavigation,
      currentViewDate: todayString,
      pageTitle: '今日任务'
    });
    
    logger.info('Index', '日期导航初始化完成', {
      dateCount: dateNavigation.length,
      currentDate: todayString
    });
  },

  /**
   * 处理日期按钮点击
   * @param {Object} e 事件对象
   */
  onDateButtonTap: async function(e) {
    const { date } = e.currentTarget.dataset;
    
    if (!date) {
      logger.warn('Index', '日期按钮点击事件缺少日期数据');
      return;
    }
    
    const { currentViewDate } = this.data;
    
    // 如果点击的是当前已选中的日期，无需操作
    if (date === currentViewDate) {
      logger.info('Index', `重复点击相同日期: ${date}`);
      return;
    }
    
    logger.info('Index', `切换日期: ${currentViewDate} -> ${date}`);
    
    try {
      // 显示加载状态
      wx.showLoading({
        title: '加载中...',
        mask: true
      });
      
      // 加载指定日期的任务
      await this.loadTaskDataOnly(date);
      
      logger.info('Index', `日期切换成功: ${date}`);
    } catch (error) {
      logger.error('Index', `日期切换失败: ${date}`, error);
      wx.showToast({
        title: '加载失败',
        icon: 'none',
        duration: 2000
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 完成任务
  async completeTask(e) {
    return taskActionsModule.completeTask(this, e);
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
    const effectiveUserId = this.getEffectiveTaskUserId();
    const targetParam = effectiveUserId ? `&targetUserId=${effectiveUserId}` : '';
    wx.navigateTo({
      url: `/pages/task-edit/task-edit?mode=create&taskType=${type}${targetParam}`
    });
  },
  
  // 跳转到编辑特定任务
  editTask: function(e) {
    const taskId = e.detail.taskId;
    wx.navigateTo({
      url: `/pages/task-edit/task-edit?mode=edit&taskId=${taskId}`
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
      url: '/packageMessage/pages/message/message',
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
    
    messageService.markMessageAsRead(messageId, this.getMessageScopeOptions())
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
    const unreadCount = this.data.messages.filter(msg => !msg.isRead).length;

    if (unreadCount === 0) {
      wx.showToast({
        title: '暂无未读消息',
        icon: 'none',
        duration: 1500
      });
      return;
    }
    
    messageService.markAllMessagesAsRead(this.getMessageScopeOptions())
      .then(count => {
        if (count <= 0) {
          logger.warn('Index', '标记全部消息已读未成功写入');
          wx.showToast({
            title: '操作失败',
            icon: 'none',
            duration: 1500
          });
          return;
        }

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
    
    messageService.getUnreadCount(this.getMessageScopeOptions())
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
            messageService.deleteRelatedTaskMessages(taskId, MessageService.getNotificationTypes().UPCOMING)
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
      const effectiveUserId = this.getEffectiveTaskUserId();
      const targetParam = effectiveUserId ? `&targetUserId=${effectiveUserId}` : '';
      wx.navigateTo({
        url: `/pages/task-edit/task-edit?mode=create${targetParam}`
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
        url: '/packageManage/pages/reward-manage/reward-manage'
      });
    } else if (item && item.id === 'family-settings') {
      logger.debug('Index', '点击家庭设置菜单项，跳转到家庭设置页面');
      wx.navigateTo({
        url: '/packageManage/pages/family-settings/family-settings'
      });
    }
  },
  
  // 触发进度圆环点击
  // 分析页暂时对所有视角禁用（内部无 userId 过滤，M10 补齐后开放）
  onRingTap: function(e) {
    // M07：分析页已支持按角色隔离，直接跳转，analysis.js 内部决定数据范围
    wx.navigateTo({
      url: '/packageChart/pages/analysis/analysis',
      fail: (err) => {
        logger.error('Index', '跳转到分析页面失败', err);
        wx.showToast({ title: '加载失败，请重试', icon: 'none' });
      }
    });
  },
  
  // 处理进度条完成事件
  onRewardComplete: function(e) {
    return rewardFlowModule.onRewardComplete(this, e);
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
  
  // 获取任务查询时应使用的用户ID
  // 家长在自己视角时，仍显示最后查看的孩子的任务；孩子视角始终用 currentUser.id
  getEffectiveTaskUserId: function() {
    const { currentUser, loginUserId, canManageMembers, lastActiveChildId, availableUsers } = this.data;
    if (canManageMembers && currentUser && currentUser.role === 'parent') {
      // 家长在自己的视角：优先用最后查看的孩子，否则用第一个孩子
      if (lastActiveChildId) return lastActiveChildId;
      const firstChild = availableUsers && availableUsers.find(u => u.role === 'child');
      return firstChild ? firstChild.id : null;
    }
    return currentUser ? currentUser.id : null;
  },

  // 更新搜索输入并实时触发搜索
  updateSearchQuery: function(e) {
    this.setData({
      searchQuery: e.detail.value
    }, () => {
      this.performSearch();
    });
  },
  
  // 执行搜索
  performSearch: function() {
    const query = this.data.searchQuery.toLowerCase().trim();
    const filters = this.data.searchFilters;
    
    // 从全局获取所有任务，按有效目标用户过滤（与主任务列表保持一致）
    const taskService = serviceManager.getTaskService();
    const effectiveUserId = this.getEffectiveTaskUserId();
    taskService.getAllTasks().then(allTasksRaw => {
      // 按有效目标用户过滤（家长视角时用 getEffectiveTaskUserId，孩子视角时用 currentUser.id）
      const allTasks = effectiveUserId
        ? allTasksRaw.filter(t => !t.userId || t.userId === effectiveUserId)
        : allTasksRaw;

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
    return rewardFlowModule.checkRewardUnlock(this);
  },

  /**
   * 加载用户星星和奖励信息（冻结展示 loginUser 自己的数据，不随视角切换变化）
   */
  loadStarsAndRewards: async function(options = {}) {
    return rewardFlowModule.loadStarsAndRewards(this, options);
  },
  
  /**
   * 处理奖励完成的满值状态
   * 独立函数处理满值逻辑，避免代码重复
   */
  _handleRewardCompletion: async function(oldProgress, userPoints) {
    return rewardFlowModule.handleRewardCompletion(this, oldProgress, userPoints);
  },
  
  /**
   * 显示奖励选择对话框
   */
  showRewardChoiceDialog: function() {
    return rewardFlowModule.showRewardChoiceDialog(this);
  },
  
  /**
   * 点击继续积累
   */
  continueCollecting: function() {
    return rewardFlowModule.continueCollecting(this);
  },
  
  /**
   * 过渡到新目标
   */
  transitionToNewTarget: async function() {
    return rewardFlowModule.transitionToNewTarget(this);
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
    pageStorageHelper.setPageState('fromRewardCompletion', true);
    pageStorageHelper.setPageState('completedRewardInfo', {
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
    
    // 家庭视角（isReadonlyView）下奖池页暂不支持多用户隔离，禁止进入
    if (this.data.isReadonlyView) {
      wx.showToast({ title: '请切换回家长视角查看奖励', icon: 'none' });
      return;
    }

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
    // 家庭视角（isReadonlyView）下奖池页暂不支持多用户隔离，禁止进入
    if (this.data.isReadonlyView) {
      wx.showToast({ title: '请切换回家长视角查看奖励', icon: 'none' });
      return;
    }
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
        url: '/packageManage/pages/reward-manage/reward-manage'
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
    return taskActionsModule.taskItemStatusToggle(this, e);
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
   * 处理任务创建事件
   * @param {Object} data 事件数据
   */
  handleTaskCreated: function(data) {
    return refreshCoordinator.handleTaskCreated(this, data);
  },

  // ============= 多用户系统相关方法 =============

  /**
   * 初始化多用户系统
   */
  async initializeMultiUserSystem() {
    return userContextModule.initializeMultiUserSystem(this);
  },

  /**
   * 延迟初始化多用户系统
   * 等待用户服务初始化完成后再进行初始化
   */
  initializeMultiUserSystemDelayed: async function() {
    return userContextModule.initializeMultiUserSystemDelayed(this);
  },

  async refreshDataForCurrentUser() {
    return refreshCoordinator.refreshDataForCurrentUser(this);
  },

  /**
   * 显示用户切换界面
   */
  showUserSwitcher() {
    logger.info('Index', '显示用户切换界面');
    
    // 刷新用户列表
    const userService = getApp().globalData.userService;
    if (userService) {
      const availableUsers = userService.getAllUsers();
      const currentUser = userService.getCurrentUser(); // 添加这行
      this.setData({
        availableUsers,
        currentUser, // 添加这行，确保数据同步
        showUserSwitcher: true
      });
    }
  },

  /**
   * 隐藏用户切换界面
   */
  hideUserSwitcher() {
    logger.info('Index', '隐藏用户切换界面');
    
    this.setData({
      showUserSwitcher: false
    });
  },

  /**
   * 处理用户切换事件
   */
  async handleUserSwitch(e) {
    try {
      const { userId } = e.detail;
      logger.info('Index', `用户切换: 切换到用户ID=${userId}`);
      
      const userService = getApp().globalData.userService;
      if (!userService) {
        logger.error('Index', '用户服务不可用');
        return;
      }
      
      // 执行用户切换
      const result = await userService.switchToUser(userId);
      if (!result.success) {
        wx.showToast({
          title: result.message || '用户切换失败',
          icon: 'none'
        });
        return;
      }
      
      // 获取新的当前用户
      const currentUser = userService.getCurrentUser();
      const availableUsers = userService.getAllUsers();
      const userPermissions = permissionUtils.getUserPermissions(currentUser.role);
      const loginUser = userService.getLoginUser ? userService.getLoginUser() : null;
      // 只读视角：孩子设备或家长切到孩子视角均为只读
      const isReadonlyView = loginUser
        ? (loginUser.role === 'child' || loginUser.userId !== currentUser.userId)
        : false;

      // 切换到孩子视角时记录，供家长回到自己视角时继续显示该孩子的任务
      const lastActiveChildId = currentUser.role === 'child'
        ? currentUser.id
        : this.data.lastActiveChildId;

      // 同步到 globalData，供其他页面（如奖池）获取最近操作的孩子
      const app = getApp();
      if (app && app.globalData) {
        app.globalData.lastActiveChildId = lastActiveChildId;
      }
      
      // 更新页面状态
      this.setData({
        currentUser,
        availableUsers,
        userPermissions,
        isReadonlyView,
        lastActiveChildId,
        showUserSwitcher: false
      });
      
      // 根据新用户权限更新菜单
      this.updateMenuItemsWithPermissions();
      
      // 重新加载数据（按新用户筛选）
      await this.refreshDataForCurrentUser();
      
      wx.showToast({
        title: `已切换到 ${currentUser.name}`,
        icon: 'success'
      });
      
      logger.info('Index', `用户切换完成: ${currentUser.name}(${currentUser.role})`);
      
    } catch (error) {
      logger.error('Index', '处理用户切换失败', error);
      wx.showToast({
        title: '用户切换失败',
        icon: 'none'
      });
    }
  },

  /**
   * 处理添加成员事件（M6：跳转到家庭设置页）
   */
  async handleUserAdd(e) {
    logger.info('Index', '跳转到家庭设置页添加成员');
    wx.navigateTo({
      url: '/packageManage/pages/family-settings/family-settings'
    });
  },

  /**
   * 处理昵称编辑事件
   */
  async handleNicknameEdit(e) {
    try {
      const { userId, nickname } = e.detail;
      const userService = getApp().globalData.userService;
      if (!userService) return;

      const result = await userService.updateNickname(userId, nickname);
      if (result.success) {
        // 刷新用户列表显示
        const availableUsers = userService.getAllUsers();
        const currentUser = userService.getCurrentUser();
        this.setData({ availableUsers, currentUser });
        wx.showToast({ title: '昵称已更新', icon: 'success' });
      } else {
        wx.showToast({ title: result.message || '修改失败', icon: 'none' });
      }
    } catch (error) {
      logger.error('Index', '处理昵称编辑失败', error);
    }
  },

  /**
   * 处理删除成员事件（M6：软删除虚拟成员）
   */
  async handleUserDelete(e) {
    try {
      const { userId } = e.detail;
      logger.info('Index', `删除家庭成员: ${userId}`);

      const userService = getApp().globalData.userService;
      if (!userService) return;

      const result = await userService.deleteFamilyMember(userId);
      if (!result.success) {
        wx.showToast({
          title: result.message || '删除用户失败',
          icon: 'none'
        });
        return;
      }
      
      // 刷新用户列表
      const availableUsers = userService.getAllUsers();
      const currentUser = userService.getCurrentUser();
      
      this.setData({
        availableUsers,
        currentUser
      });
      
      // 如果删除的是当前用户，重新加载数据
      if (currentUser.id !== this.data.currentUser.id) {
        await this.refreshDataForCurrentUser();
      }
      
      wx.showToast({
        title: '成员已删除',
        icon: 'success'
      });

      logger.info('Index', '家庭成员删除成功');
      
    } catch (error) {
      logger.error('Index', '处理删除用户失败', error);
      wx.showToast({
        title: '删除用户失败',
        icon: 'none'
      });
    }
  },

  /**
   * 根据权限更新菜单项
   */
  updateMenuItemsWithPermissions() {
    const { currentUser } = this.data;
    logger.debug('Index', `根据用户权限更新菜单: ${currentUser.role}`);
    
    // 原始菜单项（家庭设置不放在加号菜单，应通过其他入口访问）
    const originalMenuItems = [
      {
        id: 'study',
        type: 'study-task',
        icon: '📈',
        label: '分析',
        ariaLabel: '查看统计分析',
        feature: 'analytics',
        action: 'view'
      },
      {
        id: 'habit',
        type: 'habit-task',
        icon: '⏰',
        label: '任务',
        ariaLabel: '创建任务',
        feature: 'task',
        action: 'create'
      },
      {
        id: 'reward-manage',
        type: 'reward-manage',
        icon: '🏆',
        label: '奖励',
        ariaLabel: '管理奖励',
        feature: 'reward',
        action: 'create'
      }
    ];
    
    // 权限由 loginUser 决定（不随视角切换变化）
    const app = getApp();
    const loginUser = app.globalData?.userService?.getLoginUser() || currentUser;
    const filteredMenuItems = permissionUtils.filterMenuItems(originalMenuItems, loginUser.role);

    // 只读视角（孩子视角）下额外过滤掉任务创建和奖励管理入口
    // M07：分析页已支持按角色隔离数据，全面开放所有视角均可进入
    const { isReadonlyView } = this.data;
    const finalMenuItems = filteredMenuItems
      .filter(item => !isReadonlyView || (item.id !== 'habit' && item.id !== 'reward-manage'));
    
    this.setData({
      menuItems: finalMenuItems
    });
    
    logger.info('Index', `菜单项更新完成: ${originalMenuItems.length} -> ${finalMenuItems.length}`);
  },

  /**
   * 导航到用户资料（头像点击事件处理）
   */
  navigateToUserProfile() {
    logger.info('Index', '点击用户头像，显示用户切换界面');
    this.showUserSwitcher();
  },

  /**
   * 验证用户模块功能 (开发和测试用)
   * 可以在开发者工具控制台调用：getCurrentPages().pop().validateUserModule()
   */
  async validateUserModule() {
    try {
      logger.info('Index', '开始验证用户模块功能');
      
      const userService = getApp().globalData.userService;
      if (!userService) {
        logger.error('Index', '用户服务不可用');
        return false;
      }

      // 执行完整验证
      const validation = await userService.validateService();

      if (validation.success) {
        logger.info('Index', '用户模块验证通过');
      } else {
        logger.warn('Index', '用户模块验证失败', { errors: validation.errors, tests: validation.tests });
      }

      return validation.success;
    } catch (error) {
      logger.error('Index', '验证用户模块失败', error);
      return false;
    }
  }
}) 
