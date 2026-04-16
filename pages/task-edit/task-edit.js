const uiUtils = require('../../utils/uiUtils.js');
const dateUtils = require('../../utils/dateUtils.js');
const logger = require('../../utils/logger');
const serviceManager = require('../../services/service-manager.js');
const pageStorageHelper = require('../../utils/page-storage-helper');
const taskFormDisplay = require('../../utils/task-form-display');
const taskFormCore = require('../../utils/task-form-core');
const taskFormAdapter = require('../../utils/task-form-adapter');
const taskTemplateEntry = require('./modules/task-template-entry');

let taskEditLoadingVisible = false;
const TEMPLATE_RECOMMENDATION_CARD_LIMIT = 2;

function decorateTemplateRecommendation(candidate = {}) {
  const payload = candidate.taskPayload || {};
  const preview = taskFormDisplay.buildTaskFormDisplayState({
    ...payload,
    repeat: payload.repeat || { type: 'none', days: [] },
    reminder: payload.reminder || { enabled: false, time: 0 }
  }, {
    ignoreRepeatOptionDisabled: true
  });

  return {
    ...candidate,
    displayName: String(candidate.displayName || payload.title || '').trim(),
    typeClass: payload.type || 'habit',
    repeatLabel: preview.repeatText || '不重复',
    timeLabel: payload.isAllDay === true
      ? '全天'
      : `${payload.startTime || '--:--'} - ${payload.endTime || '--:--'}`
  };
}

Page({
  /**
   * 页面的初始数据
   */
  data: {
    allTasks: [],
    heatmapYear: new Date().getFullYear(),
    heatmapMonthIndex: new Date().getMonth(),
    heatmapMonth: '',
    targetUserId: '', // 家长代孩子创建任务时的目标用户ID（由首页传入）
    // 添加新任务表单数据
    newTask: {
      title: '',
      type: 'habit', // 默认类型为习惯
      points: 1, // 默认积分修改为1
      pointsExpiry: 'permanent', // 默认积分有效期为永久
      description: '',
      isRequired: false, // 添加必做任务字段
      // 新增时间周期和频率相关字段
      isAllDay: false,
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      hasNoEndDate: false, // 添加无结束日期字段
      repeat: {
        type: 'daily', // 默认为每天，不再使用'none'
        days: [], // 自定义重复时选中的星期数组
        startDate: '', // 重复开始日期，与任务开始日期相同
        endDate: '' // 重复结束日期，与任务结束日期相同，无结束日期时为null
      },
      reminder: {
        enabled: false,
        time: 0 // 提前提醒的分钟数
      }
    },
    // 表单验证错误信息
    errors: {
      title: ''
    },
    // 描述字段限制常量
    descMaxLength: 50,
    descPlaceholder: '输入任务描述（可选）',
    // 新增UI控制字段
    repeatText: '每天',
    reminderText: '无',
    pointsExpiryText: '永久', // 积分有效期显示文本
    // 日期时间选择面板控制
    startDatePanel: false,
    endDatePanel: false,
    // 新增重复、提醒和积分有效期面板控制
    repeatPanel: false, 
    reminderPanel: false,
    pointsExpiryPanel: false, // 积分有效期面板
    // 重复面板模式：'type'表示选择重复类型，'weekday'表示选择星期
    repeatPanelMode: 'type',
    // 星期选择状态 [周日,周一,周二,周三,周四,周五,周六]
    weekdaySelection: [false, false, false, false, false, false, false],
    
    // 新增重复预览相关字段
    repeatPreviewText: '', // 重复预览文本
    repeatTypeWarning: false, // 是否存在重复类型警告
    repeatPanelDesc: '任务将在所选时间范围内按设定频率执行', // 动态面板说明文字
    
    // 控制重复选项是否禁用
    isRepeatOptionDisabled: true, // 默认为true,因为初始日期是同一天
    
    // 提醒选项列表（动态生成）
    reminderOptions: [],

    // 模板快速填充
    templateEntryLoading: true,
    templateEntryLoadedOnce: false,
    hasTemplates: false,
    recentTemplates: [],
    selectedTemplateId: null,
    recommendedTemplates: [],
    templateRecommendationCount: 0,
    templateFillUndoVisible: false,
    templateFillUndoText: '',
    entryHintVisible: false,
    entryHintText: ''
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function(options) {
    logger.info('TaskEdit', '页面加载');

    // 权限守卫：孩子设备或家长切到孩子视角时均无权限进入任务编辑页
    // 冷启动 userService 可能为 null，此时放行，登录流程会在完成后重新校验
    const userService = serviceManager.getUserService();
    if (userService) {
      const loginUser = userService.getLoginUser && userService.getLoginUser();
      const currentUser = userService.getCurrentUser && userService.getCurrentUser();
      const loginRole = loginUser ? loginUser.role : currentUser?.role;
      const isChildView = loginRole === 'child' || (loginUser && currentUser && loginUser.userId !== currentUser.userId);
      if (isChildView) {
        logger.warn('TaskEdit', '无权限访问任务编辑页，已拦截', { loginRole, isChildView });
        wx.showToast({ title: '暂无操作权限', icon: 'none', duration: 1500 });
        wx.navigateBack({ delta: 1 });
        return;
      }
    }
    
    // 家长代孩子创建任务时，首页会传入 targetUserId
    if (options.targetUserId) {
      this.setData({ targetUserId: options.targetUserId });
      logger.info('TaskEdit', '家长代孩子创建任务，targetUserId已记录', { targetUserId: options.targetUserId });
    }

    if (options.entry === 'index_non_today_create') {
      this.setData({
        entryHintVisible: true,
        entryHintText: '这是新建任务，不会自动绑定当前查看日期'
      });
      logger.info('TaskEdit', '命中首页非今天日期的新建任务入口，显示一次性提示');
    }

    // 记录UI优化日志
    uiUtils.logUIOptimization('task-edit', '页面加载', {
      'cardSpacing': '20rpx',
      'elementPadding': '24rpx',
      'groupSeparation': '分组边框样式优化'
    });
    
    // 记录按钮布局优化
    uiUtils.logButtonLayoutOptimization('task-edit', {
      'layout': '垂直排列',
      'primaryButton': '添加任务置顶',
      'secondaryButton': '清空按钮置底',
      'buttonHeight': '88rpx',
      'buttonGap': '16rpx'
    });
    
    // 记录任务类型颜色统一的更改
    logger.info('TaskEdit', '已统一任务类型颜色: 学习=绿色(var(--success-color)), 习惯=蓝色(var(--primary-color)), 兴趣=黄色(var(--warning-color))');
    
    // 记录日期时间选择器优化
    logger.info('TaskEdit', '日期时间选择器优化: 固定高度64rpx，处理长日期文本溢出，防止界面被撑高');
    
    // 记录UI布局优化日志
    logger.info('TaskEdit', '任务时间选择区布局优化: 使用"日期范围"和"时间范围"两行布局，提高用户理解度');
    
    // 初始化热力图月份
    this.initHeatmapMonth();
    
    // 初始化表单描述字段的最大长度
    this.setData({
      descMaxLength: 50,
      descPlaceholder: '任务描述（可选）'
    });
    
    // 初始化日期时间数据
    this.initDateTimeData();
    
    // 确保所有面板初始状态为关闭
    this.setData({
      startDatePanel: false,
      endDatePanel: false,
      repeatPanel: false,
      reminderPanel: false,
      pointsExpiryPanel: false
    });
    
    // 初始化重复预览文本
    this.setData({
      repeatPreviewText: this.generateRepeatPreviewText('daily')
    });
    
    // 获取当前日期
    const todayDate = new Date();
    const dayOfWeek = todayDate.getDay(); // 0是周日，6是周六
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    
    // 打印当前日期和星期信息
    logger.info('TaskEdit', '页面初始化', {
      today: todayDate.toISOString().split('T')[0],
      dayOfWeek: dayNames[dayOfWeek]
    });
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function() {
    logger.info('task-edit', '页面显示，刷新任务数据');
    
    // 记录样式一致性日志
    uiUtils.logStyleConsistency('表单区域', {
      '表单组间距': '40rpx',
      '表单项间距': '24rpx',
      '按钮区域': '顶部边框分隔',
      '开关对齐': '统一右对齐位置'
    });
    
    // 记录新布局样式一致性
    uiUtils.logStyleConsistency('时间选择区域', {
      '布局方式': '日期范围/时间范围两行',
      '连接符': '统一使用"至"连接',
      '控件大小': '自适应平均宽度',
      '视觉层次': '标签左对齐，控件右对齐'
    });
    
    logger.info('TaskEdit', '时间选择区域布局优化已应用，提高了用户理解度和操作便捷性');
    
    this.loadAllTasks();
    this.loadRecentTaskTemplates();
  },

  /**
   * 加载所有任务数据
   */
  loadAllTasks: async function() {
    try {
      // 获取任务服务
      const taskService = serviceManager.getService('task');
      if (!taskService) {
        logger.error('TaskEdit', '无法获取任务服务');
        wx.showToast({
          title: '加载任务数据失败',
          icon: 'none',
          duration: 2000
        });
        return;
      }
      
      // 家长为孩子创建任务时，获取孩子的任务；否则获取登录用户的任务
      const targetUserId = this.data.targetUserId || null;
      const userService = serviceManager.getUserService ? serviceManager.getUserService() : null;
      const effectiveUserId = targetUserId || (userService && userService.getCurrentUserId ? userService.getCurrentUserId() : null);
      const allTasks = await taskService.getAllTasks(effectiveUserId, { requireFreshStars: !!effectiveUserId });
      
      this.setData({ 
        allTasks: allTasks
      });
      
      logger.info('TaskEdit', '任务数据加载成功', { taskCount: allTasks.length, targetUserId: effectiveUserId });
    } catch (error) {
      logger.error('TaskEdit', '加载任务数据失败', error);
      
      wx.showToast({
        title: '加载数据失败',
        icon: 'none',
        duration: 2000
      });
    }
  },

  loadRecentTaskTemplates: async function() {
    const taskTemplateService = serviceManager.getService('taskTemplate');
    if (!taskTemplateService) {
      this.setData({
        templateEntryLoading: false,
        templateEntryLoadedOnce: true,
        hasTemplates: false,
        recentTemplates: [],
        recommendedTemplates: [],
        templateRecommendationCount: 0
      });
      return [];
    }

    const templates = await taskTemplateEntry.loadRecentTemplates(this, taskTemplateService, 5);

    try {
      const recommendationResult = await taskTemplateService.getRecommendedTemplateCandidates({
        limit: 5
      });
      const candidates = Array.isArray(recommendationResult?.candidates)
        ? recommendationResult.candidates.map(decorateTemplateRecommendation)
        : [];
      const recommendationCount = Number(recommendationResult?.total || candidates.length);

      this.setData({
        recommendedTemplates: candidates.slice(0, TEMPLATE_RECOMMENDATION_CARD_LIMIT),
        templateRecommendationCount: recommendationCount
      });
    } catch (error) {
      logger.warn('TaskEdit', '加载模板推荐失败，忽略推荐展示', error);
      this.setData({
        recommendedTemplates: [],
        templateRecommendationCount: 0
      });
    }

    return templates;
  },

  openTemplateSelectPage: function() {
    wx.navigateTo({
      url: '/packageManage/pages/task-template-manage/task-template-manage?mode=select',
      success: (res) => {
        const eventChannel = res.eventChannel;
        if (eventChannel && typeof eventChannel.on === 'function') {
          eventChannel.on('templateSelected', (payload) => {
            if (payload && payload.template) {
              this.applyTemplateSelection(payload.template);
            }
          });
        }
      }
    });
  },

  openTemplateCreatePage: function() {
    wx.navigateTo({
      url: '/packageManage/pages/task-template-edit/task-template-edit?mode=create'
    });
  },

  onUseRecentTemplate: function(e) {
    const templateId = e.currentTarget.dataset.id;
    const template = this.data.recentTemplates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    this.applyTemplateSelection(template);
  },

  onUseRecommendedTemplate: function(e) {
    const candidateKey = e.currentTarget.dataset.key;
    const candidate = this.data.recommendedTemplates.find((item) => item.candidateKey === candidateKey);
    if (!candidate) {
      return;
    }

    this.openRecommendedTemplateDraft(candidate, 'task-edit-recommendation');
  },

  applyTemplateSelection: function(template) {
    const taskTemplateService = serviceManager.getService('taskTemplate');
    if (!taskTemplateService) {
      wx.showToast({
        title: '模板服务未就绪',
        icon: 'none'
      });
      return;
    }

    if (!this._templateFillUndoSnapshot) {
      this._templateFillUndoSnapshot = this.captureTemplateFillSnapshot();
    }
    const result = taskTemplateEntry.applyTemplateToTaskEditForm(this, taskTemplateService, template);
    if (result && result.formPatch) {
      const displayName = taskTemplateEntry.getTemplateDisplayName(template);
      this.setData({
        templateFillUndoVisible: true,
        templateFillUndoText: displayName ? `已填充 ${displayName}，可恢复原内容` : '已填充模板，可恢复原内容'
      });
    }
  },

  captureTemplateFillSnapshot: function() {
    return JSON.parse(JSON.stringify({
      newTask: this.data.newTask,
      errors: this.data.errors,
      repeatText: this.data.repeatText,
      reminderText: this.data.reminderText,
      pointsExpiryText: this.data.pointsExpiryText,
      repeatPreviewText: this.data.repeatPreviewText,
      repeatTypeWarning: this.data.repeatTypeWarning,
      weekdaySelection: this.data.weekdaySelection,
      repeatPanelMode: this.data.repeatPanelMode,
      isRepeatOptionDisabled: this.data.isRepeatOptionDisabled,
      selectedTemplateId: this.data.selectedTemplateId,
      reminderOptions: this.data.reminderOptions
    }));
  },

  clearTemplateFillUndoState: function() {
    this._templateFillUndoSnapshot = null;
    this.setData({
      templateFillUndoVisible: false,
      templateFillUndoText: ''
    });
  },

  markTemplateFillUndoDirty: function() {
    if (!this._templateFillUndoSnapshot || this.data.templateFillUndoVisible !== true) {
      return;
    }

    this.clearTemplateFillUndoState();
  },

  undoTemplateFill: function() {
    if (!this._templateFillUndoSnapshot) {
      return;
    }

    const snapshot = this._templateFillUndoSnapshot;
    this._templateFillUndoSnapshot = null;
    this.setData({
      ...snapshot,
      templateFillUndoVisible: false,
      templateFillUndoText: ''
    });
  },

  openRecommendedTemplateDraft: function(candidate, sourceType = 'task-edit-recommendation') {
    const taskTemplateService = serviceManager.getService('taskTemplate');
    if (!taskTemplateService || !candidate) {
      wx.showToast({
        title: '模板服务未就绪',
        icon: 'none'
      });
      return;
    }

    try {
      const draft = taskTemplateService.buildTemplateDraftFromCandidate(candidate, {
        sourceType
      });

      wx.navigateTo({
        url: '/packageManage/pages/task-template-edit/task-template-edit?mode=create',
        success: (res) => {
          const eventChannel = res.eventChannel;
          if (eventChannel && typeof eventChannel.emit === 'function') {
            eventChannel.emit('templateDraftReady', {
              draft
            });
          }
        }
      });
    } catch (error) {
      logger.warn('TaskEdit', '打开推荐模板草稿失败', error);
      wx.showToast({
        title: '推荐草稿生成失败',
        icon: 'none'
      });
    }
  },

  /**
   * 初始化热力图月份信息
   */
  initHeatmapMonth: function() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', 
                      '七月', '八月', '九月', '十月', '十一月', '十二月'];
    
    this.setData({
      heatmapYear: year,
      heatmapMonthIndex: month,
      heatmapMonth: `${year}年${monthNames[month]}`
    });
  },

  /**
   * 热力图月份变化事件处理
   */
  onHeatmapMonthChange: function(e) {
    this.setData({
      heatmapYear: e.detail.year,
      heatmapMonthIndex: e.detail.month,
      heatmapMonth: `${e.detail.year}年${e.detail.monthName}`
    });
  },

  /**
   * 获取热力图组件
   * @returns {Object} 热力图组件实例
   */
  getHeatmapComponent: function() {
    return this.selectComponent('#taskHeatmap');
  },

  /**
   * 切换到上个月
   */
  prevHeatmapMonth: function() {
    const heatmap = this.getHeatmapComponent();
    if (heatmap) heatmap.prevMonth();
  },

  /**
   * 切换到下个月
   */
  nextHeatmapMonth: function() {
    const heatmap = this.getHeatmapComponent();
    if (heatmap) heatmap.nextMonth();
  },

  /**
   * 处理热力图任务刷新事件
   */
  onHeatmapRefreshTasks: async function(e) {
    logger.info('TaskEdit', '收到热力图任务刷新请求');
    
    try {
      // 获取任务服务
      const taskService = serviceManager.getService('task');
      if (!taskService) {
        logger.error('TaskEdit', '无法获取任务服务');
        return;
      }
      
      // 热力图刷新也需要使用 targetUserId，保持与 loadAllTasks 一致
      const targetUserId = this.data.targetUserId || null;
      const userService = serviceManager.getUserService ? serviceManager.getUserService() : null;
      const effectiveUserId = targetUserId || (userService && userService.getCurrentUserId ? userService.getCurrentUserId() : null);
      const latestTasks = await taskService.getAllTasks(effectiveUserId, { requireFreshStars: !!effectiveUserId });
      logger.info('TaskEdit', '已获取最新任务数据', { taskCount: latestTasks.length, targetUserId: effectiveUserId });
      
      // 确保使用新引用更新数据，触发观察器
      this.setData({ 
        allTasks: [...latestTasks]
      }, () => {
        // 数据设置完成后，手动触发热力图重新计算
        logger.info('TaskEdit', '已更新热力图任务数据，正在刷新热力图');
        
        // 获取热力图组件实例
        const heatmap = this.getHeatmapComponent();
        
        // 确保热力图组件存在，并调用其计算方法
        if (heatmap) {
          logger.info('TaskEdit', '正在触发热力图重新计算');
          heatmap.calculateHeatMap();
          
          // 添加一个延迟检查，确保热力图已完全重新计算
          setTimeout(() => {
            logger.info('TaskEdit', '执行额外的热力图刷新确认');
            heatmap.calculateHeatMap();
          }, 300);
        } else {
          logger.error('TaskEdit', '找不到热力图组件实例');
        }
      });
    } catch (error) {
      logger.error('TaskEdit', '热力图任务刷新失败', error);
    }
  },

  /**
   * 显示压力指数说明
   */
  showPressureInfo: function() {
    logger.info('TaskEdit', '显示压力指数说明');
    const heatmap = this.getHeatmapComponent();
    if (heatmap) heatmap.showPressureInfo();
  },

  /**
   * 处理任务标题输入
   */
  onTaskTitleInput: function(e) {
    this.markTemplateFillUndoDirty();
    this.setData({
      'newTask.title': e.detail.value,
      'errors.title': ''
    });
  },

  /**
   * 选择任务类型
   */
  selectTaskType: function(e) {
    this.markTemplateFillUndoDirty();
    const type = e.currentTarget.dataset.type;
    this.setData({
      'newTask.type': type
    });
  },

  /**
   * 更改积分
   */
  changePoints: function(e) {
    this.markTemplateFillUndoDirty();
    const action = e.currentTarget.dataset.action;
    let points = this.data.newTask.points;
    
    if (action === 'plus') {
      points = Math.min(points + 1, 50); // 上限50分
    } else if (action === 'minus') {
      points = Math.max(points - 1, 1); // 下限1分
    }
    
    this.setData({
      'newTask.points': points
    });
  },

  /**
   * 处理积分输入
   */
  onPointsInput: function(e) {
    this.markTemplateFillUndoDirty();
    const points = Number(e.detail.value) || 0;
    this.setData({
      'newTask.points': points
    });
  },

  /**
   * 处理描述输入
   */
  onDescriptionInput: function(e) {
    this.markTemplateFillUndoDirty();
    const logger = require('../../utils/logger');
    logger.info('TaskEdit', '描述输入', `长度: ${e.detail.value.length}/${this.data.descMaxLength}`);
    
    this.setData({
      'newTask.description': e.detail.value
    });
  },

  /**
   * 清空任务表单
   */
  clearTaskForm: function() {
    logger.info('TaskEdit', '清空任务表单');
    this.clearTemplateFillUndoState();
    
    // 重置任务为默认状态
    this.setData({
      'newTask.title': '',
      'newTask.type': 'habit',
      'newTask.points': 1, // 修改为1分（正数）
      'newTask.pointsExpiry': 'permanent', // 重置积分有效期为永久
      'newTask.description': '',
      'newTask.isAllDay': false,
      'newTask.hasNoEndDate': false, // 重置无结束日期字段
      'newTask.isRequired': false,
      'errors.title': '',
      repeatText: '当天', // 重置为当天，因为默认是同一天
      reminderText: '无',
      pointsExpiryText: '永久', // 重置积分有效期文本
      isRepeatOptionDisabled: true, // 重置为禁用状态，因为默认是同一天
      'newTask.repeat': {
        type: 'daily',
        days: [],
        startDate: '',
        endDate: ''
      },
      'newTask.reminder': {
        enabled: false,
        time: 0
      },
      selectedTemplateId: null
    });
    
    // 重新初始化日期时间数据
    this.initDateTimeData();
    
    // 关闭所有面板
    this.closeAllPanels();
    
    wx.showToast({
      title: '已清空表单',
      icon: 'success',
      duration: 1000
    });
  },

  /**
   * 验证任务表单数据
   * @returns {Object} 验证通过返回任务数据，验证失败返回包含valid字段的对象
   */
  validateTaskForm: function() {
    logger.info('TaskEdit', '开始验证任务表单，使用ValidationService');
    
    // 获取验证服务
    const validationService = serviceManager.getService('validation');
    if (!validationService) {
      logger.error('TaskEdit', '无法获取验证服务，使用本地验证');
      // 降级处理
      return this.validateTaskFormLocal();
    }
    
    // 准备验证数据
    const taskData = {
      title: this.data.newTask.title,
      startDate: this.data.newTask.startDate,
      endDate: this.data.newTask.endDate,
      startTime: this.data.newTask.startTime,
      endTime: this.data.newTask.endTime,
      isAllDay: this.data.newTask.isAllDay,
      hasNoEndDate: this.data.newTask.hasNoEndDate,
      repeat: this.data.newTask.repeat,
      type: this.data.newTask.type,
      description: this.data.newTask.description,
      points: this.data.newTask.points,
      pointsExpiry: this.data.newTask.pointsExpiry,
      pointsExpiryText: this.data.pointsExpiryText,
      isRequired: this.data.newTask.isRequired,
      reminder: this.data.newTask.reminder
    };
    
    // 使用服务层验证
    const validationResult = validationService.validateTaskForm(taskData);
    
    // 处理日期与重复类型匹配的警告（不影响验证结果）
    if (this.data.repeatTypeWarning) {
      logger.info('TaskEdit', '检测到日期与重复类型不匹配，但允许继续创建任务');
    }
    
    if (validationResult.valid) {
      // 验证通过，返回服务层组装的数据
      logger.info('TaskEdit', '任务表单验证通过，使用服务层组装的数据');
      return validationResult.data;
    } else {
      // 验证失败，返回错误信息
      logger.warn('TaskEdit', `任务表单验证失败: ${validationResult.errorMsg}`);
      return {
        valid: false,
        errorMsg: validationResult.errorMsg
      };
    }
  },

  /**
   * 本地验证任务表单（降级方法）
   */
  validateTaskFormLocal: function() {
    const validation = taskFormCore.validateTaskFormDraft(this.data.newTask, {
      scene: 'task',
      today: this.data.newTask.startDate
    });

    if (!validation.valid) {
      logger.error('TaskEdit', `验证失败: ${validation.errorMsg}`);
      return validation;
    }

    logger.info('TaskEdit', '本地表单验证通过，组装完整任务数据');
    const draft = taskFormAdapter.adaptTaskEditStateToDraft(this.data.newTask);
    const normalizedPayload = taskFormCore.buildTaskPayloadFromDraft(draft);

    return {
      title: normalizedPayload.title,
      type: normalizedPayload.type,
      date: normalizedPayload.startDate,
      description: normalizedPayload.description,
      points: normalizedPayload.points,
      pointsExpiry: normalizedPayload.pointsExpiry,
      pointsExpiryDate: this.data.pointsExpiryText,
      isRequired: normalizedPayload.isRequired,
      isAllDay: normalizedPayload.isAllDay,
      startTime: normalizedPayload.startTime,
      endTime: normalizedPayload.endTime,
      hasNoEndDate: normalizedPayload.hasNoEndDate,
      repeat: normalizedPayload.repeat,
      reminder: normalizedPayload.reminder
    };
  },

  /**
   * 添加新任务
   */
  addTask: async function() {
    try {
      // 获取任务表单数据
      const formResult = this.validateTaskForm();
      
      // 检查返回值是否为验证结果对象（有valid字段）
      if (formResult && 'valid' in formResult && !formResult.valid) {
        // 验证失败，显示错误信息
        wx.showToast({
          title: formResult.errorMsg || '表单验证失败',
          icon: 'none',
          duration: 2000
        });
        return;
      }
      
      // 此时formResult应该是完整的任务对象
      const newTask = formResult;
      
      // 记录任务数据日志
      logger.info('TaskEdit', '开始创建任务', 
                 {title: newTask.title, type: newTask.type, date: newTask.date});
      
      // 显示加载提示
      this._showLoading({
        title: '添加中...',
        mask: true
      });
      
      // 添加超时保护，确保加载提示不会一直显示
      this.loadingTimeout = setTimeout(() => {
        logger.warn('TaskEdit', '任务添加操作超时，强制关闭加载提示');
        this._hideLoading(true);
        
        // 提示用户操作耗时过长
        wx.showToast({
          title: '任务添加耗时较长',
          icon: 'none',
          duration: 2000
        });
      }, 15000);
      
      // 获取任务服务
      const taskService = serviceManager.getService('task');
      if (!taskService) {
        logger.error('TaskEdit', '无法获取任务服务');
        this._hideLoading(true);
        wx.showToast({
          title: '系统错误，请重试',
          icon: 'none',
          duration: 2000
        });
        return;
      }
      
      // 检查特殊类型的任务并做预处理
      if (newTask.type === 'study') {
        // 任务加载中的提示文本优化
        this._showLoading({
          title: '创建学习任务...',
          mask: true
        });
        
        // 只对非全天任务计算持续时间
        if (!newTask.isAllDay && newTask.startTime && newTask.endTime) {
          // 计算任务持续时间（分钟）
          const startTimeParts = newTask.startTime.split(':').map(Number);
          const endTimeParts = newTask.endTime.split(':').map(Number);
          
          const startMinutes = startTimeParts[0] * 60 + startTimeParts[1];
          const endMinutes = endTimeParts[0] * 60 + endTimeParts[1];
          
          // 如果结束时间早于开始时间，则认为是跨天的情况
          let durationMinutes = endMinutes >= startMinutes ? 
              endMinutes - startMinutes : 
              (24 * 60 - startMinutes) + endMinutes;
          
          logger.info('TaskEdit', '学习任务持续时间', { durationMinutes });
          
          // 对长时间任务添加日志和额外确认
          if (durationMinutes > 180) {
            logger.info('TaskEdit', '正在创建长时间任务', {
              hours: Math.floor(durationMinutes / 60),
              minutes: durationMinutes % 60
            });
            
            // 添加任务的持续时间字段，方便后续处理
            newTask.duration = durationMinutes;
            
            // 确保进度条更新正常
            this._showLoading({
              title: '处理长时间任务...',
              mask: true
            });
            
            // 简短延迟确保UI刷新
            setTimeout(async () => {
              logger.info('TaskEdit', '长时间任务预处理完成，继续创建任务');
              
              try {
                // 创建任务
                const result = await this._doCreateTask(taskService, newTask);
                
                if (result) {
                  this._handleTaskCreationSuccess(result, newTask);
                } else {
                  this._handleTaskCreationFailure();
                }
              } catch (error) {
                logger.error('TaskEdit', '创建长时间任务失败', error);
                this._handleTaskCreationFailure(error);
              }
            }, 300);
            
            return; // 中断当前流程，由延时函数继续
          }
        } else {
          // 全天学习任务的处理
          logger.info('TaskEdit', '创建全天学习任务');
        }
      }
      
      // 直接创建普通任务（非长时间任务）
      try {
        const result = await this._doCreateTask(taskService, newTask);
        
        if (result) {
          this._handleTaskCreationSuccess(result, newTask);
        } else {
          this._handleTaskCreationFailure();
        }
      } catch (error) {
        logger.error('TaskEdit', '创建任务失败', error);
        this._handleTaskCreationFailure(error);
      }
    } catch (error) {
      // 捕获并处理错误
      logger.error('TaskEdit', '添加任务时发生错误', error);
      
      // 确保错误时也关闭加载提示
      this._hideLoading(true);
      
      // 清除超时计时器（如果存在）
      if (this.loadingTimeout) {
        clearTimeout(this.loadingTimeout);
        this.loadingTimeout = null;
      }
      
      wx.showToast({
        title: '添加失败: ' + (error.message || '未知错误'),
        icon: 'none',
        duration: 3000
      });
    }
  },

  /**
   * 处理任务创建成功
   * @private
   */
  _handleTaskCreationSuccess: function(result, newTask) {
    const usedTemplateId = this.data.selectedTemplateId;
    this._templateFillUndoSnapshot = null;

    // 添加成功，记录详细日志
    logger.info('TaskEdit', '新任务添加成功', {
      id: result.task ? result.task.id : '未知',
      title: newTask.title
    });
    
    // 显示任务添加成功提示
    wx.showToast({
      title: '任务添加成功',
      icon: 'success',
      duration: 2000
    });
    
    // 重置表单数据
    logger.info('TaskEdit', '重置表单数据');
    this.setData({
      'newTask.title': '',
      'newTask.type': 'habit',
      'newTask.points': 1,
      'newTask.description': '',
      'newTask.isAllDay': false,
      'newTask.hasNoEndDate': false,
      'newTask.isRequired': false,
      'errors.title': '',
      repeatText: '每天',
      reminderText: '无',
      pointsExpiryText: '永久',
      'newTask.repeat': {
        type: 'daily',
        days: [],
        startDate: '',
        endDate: ''
      },
      'newTask.reminder': {
        enabled: false,
        time: 0
      },
      selectedTemplateId: null,
      templateFillUndoVisible: false,
      templateFillUndoText: ''
    });
    
    // 重新初始化日期时间数据
    this.initDateTimeData();
    
    // 关闭所有面板
    this.closeAllPanels();
    
    // 重新加载任务数据
    this.loadAllTasks();
    
    // 如果热力图组件存在，使用延迟刷新避免UI阻塞
    const heatmap = this.getHeatmapComponent();
    if (heatmap) {
      logger.info('TaskEdit', '任务添加成功，准备延迟刷新热力图');
      setTimeout(() => {
        logger.info('TaskEdit', '开始延迟刷新热力图');
        heatmap.calculateHeatMap();
      }, 300);
    }

    if (usedTemplateId) {
      this.recordSelectedTemplateUsage(usedTemplateId);
    }
  },
  
  /**
   * 处理任务创建失败
   * @private
   */
  _handleTaskCreationFailure: function(error) {
    // 添加失败，显示错误提示
    logger.error('TaskEdit', '任务添加失败', error);
    wx.showToast({
      title: '添加失败' + (error ? ': ' + error.message : ''),
      icon: 'none',
      duration: 2000
    });
  },

  /**
   * 执行任务创建
   * @private
   */
  _doCreateTask: async function(taskService, taskData) {
    try {
      // 记录当前时间戳
      const startTimestamp = Date.now();
      logger.info('TaskEdit', '开始执行任务创建', { timestamp: startTimestamp });
      
      // 追加基本任务类型验证
      if (!taskData || !taskData.title || !taskData.type) {
        logger.error('TaskEdit', '任务数据验证失败', taskData);
        
        // 关闭加载提示
        this._hideLoading(true);
        
        // 显示错误信息
        wx.showToast({
          title: '任务数据不完整',
          icon: 'none',
          duration: 2000
        });
        
        return false;
      }
      
      logger.info('TaskEdit', '任务数据验证通过，开始创建任务', {
        title: taskData.title,
        type: taskData.type, 
        date: taskData.date,
        repeat: taskData.repeat
      });
      
      // 更新loading文本，指示正在创建任务
      this._showLoading({
        title: '创建任务中...',
        mask: true
      });
      
      // 家长代孩子创建任务时，将目标孩子的 userId 注入 taskData
      if (this.data.targetUserId) {
        taskData.userId = this.data.targetUserId;
        logger.info('TaskEdit', '任务将归属到目标孩子', { targetUserId: this.data.targetUserId });
      }

      // 创建任务
      const result = await taskService.createTask(taskData);
      
      // 任务创建完成，记录耗时
      const endTimestamp = Date.now();
      const duration = endTimestamp - startTimestamp;
      
      logger.info('TaskEdit', '任务创建请求完成', { 
        duration: duration,
        success: result && result.success
      });
      
      // 关闭加载提示
      this._hideLoading();
      
      if (!result || !result.success) {
        logger.error('TaskEdit', '任务创建失败', result);
        
        // 显示错误信息
        wx.showToast({
          title: result && result.message ? result.message : '任务创建失败',
          icon: 'none',
          duration: 2000
        });
        
        return false;
      }
      
      // 清除超时保护
      if (this.loadingTimeout) {
        clearTimeout(this.loadingTimeout);
        this.loadingTimeout = null;
      }
      
      logger.info('TaskEdit', '执行任务创建完成', {
        taskId: result.task ? result.task.id : undefined
      });
      
      return result;
    } catch (error) {
      // 捕获并处理任何异常
      logger.error('TaskEdit', '任务创建过程中发生异常', error);
      
      // 确保关闭加载提示
      this._hideLoading(true);
      
      // 显示错误信息
      wx.showToast({
        title: '任务创建出错',
        icon: 'none',
        duration: 2000
      });
      
      // 清除超时保护
      if (this.loadingTimeout) {
        clearTimeout(this.loadingTimeout);
        this.loadingTimeout = null;
      }
      
      throw error; // 重新抛出错误，以便由上层处理
    }
  },

  recordSelectedTemplateUsage: async function(templateId) {
    const taskTemplateService = serviceManager.getService('taskTemplate');
    if (!taskTemplateService || !templateId) {
      return;
    }

    try {
      await taskTemplateService.recordTemplateUsage(templateId);
      await this.loadRecentTaskTemplates();
    } catch (error) {
      logger.warn('TaskEdit', '记录模板使用次数失败，不影响任务创建成功结果', error);
    }
  },

  /**
   * 初始化日期时间数据
   */
  initDateTimeData: function() {
    // 获取当前日期时间
    const now = new Date();
    
    // 格式化日期为YYYY-MM-DD
    const today = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    
    const defaultTimeRange = taskFormCore.resolveDefaultTimeRange({ now });
    const startTime = defaultTimeRange.startTime;
    const endTime = defaultTimeRange.endTime;
    
    // 设置到组件数据中
    this.setData({
      'newTask.startDate': today,
      'newTask.endDate': today,
      'newTask.startTime': startTime,
      'newTask.endTime': endTime,
      // 同时初始化重复任务的开始日期和结束日期，确保同步
      'newTask.repeat.startDate': today,
      'newTask.repeat.endDate': today,
      // 当起止日期是同一天时，设置重复文本为"当天"
      repeatText: '当天',
      // 同一天时禁用重复选项
      isRepeatOptionDisabled: true,
      // 初始化提醒选项
      reminderOptions: this.getReminderOptions()
    });
    
    logger.info('TaskEdit', '初始化日期时间数据完成', {
      today: today,
      startTime: startTime,
      endTime: endTime,
      reminderOptionsCount: this.data.reminderOptions ? this.data.reminderOptions.length : 0
    });
    logger.info('TaskEdit', '起止日期相同，重复选项设为"当天"且禁用重复面板');
  },

  /**
   * 全天开关切换
   */
  toggleAllDay: function(e) {
    this.markTemplateFillUndoDirty();
    const isAllDay = e.detail.value;
    
    // 准备更新数据
    const updateData = {
      'newTask.isAllDay': isAllDay
    };
    
    // 如果切换为全天任务，清空时间字段
    if (isAllDay) {
      updateData['newTask.startTime'] = '';
      updateData['newTask.endTime'] = '';
    } else {
      // 如果取消全天，且时间字段为空，设置默认时间
      if (!this.data.newTask.startTime) {
        const defaultTimeRange = taskFormCore.resolveDefaultTimeRange({ now: new Date() });
        updateData['newTask.startTime'] = defaultTimeRange.startTime;
        updateData['newTask.endTime'] = defaultTimeRange.endTime;
      }
    }
    
    // 更新数据
    this.setData(updateData);
    
    // 然后生成并更新提醒选项
    const reminderOptions = this.getReminderOptions();
    this.setData({
      reminderOptions: reminderOptions
    });
    
    logger.info('TaskEdit', '全天选项切换:', {
      isAllDay: isAllDay ? '开启' : '关闭',
      startTime: updateData['newTask.startTime'] || this.data.newTask.startTime,
      endTime: updateData['newTask.endTime'] || this.data.newTask.endTime,
      reminderOptionsCount: reminderOptions.length
    });
  },
  
  /**
   * 无结束日期开关切换
   */
  toggleNoEndDate: function(e) {
    this.markTemplateFillUndoDirty();
    const hasNoEndDate = e.detail.value;
    
    this.setData({
      'newTask.hasNoEndDate': hasNoEndDate
    });
    
    // 当日期选择面板打开时，更新日期选择器状态
    if (this.data.endDatePanel) {
      // 关闭日期选择面板
      this.setData({
        endDatePanel: false
      });
    }
    
    // 如果开启无结束日期，禁用结束日期选择器并提示用户
    if (hasNoEndDate) {
      wx.showToast({
        title: '任务将无限期重复',
        icon: 'none',
        duration: 2000
      });
    }
    
    // 更新重复预览文本
    if (this.data.newTask.repeat.type !== 'none') {
      this.setData({
        repeatPreviewText: this.generateRepeatPreviewText(this.data.newTask.repeat.type)
      });
    }
    
    logger.info('TaskEdit', '无结束日期选项:', hasNoEndDate ? '开启' : '关闭');
  },
  
  /**
   * 开始时间选择
   */
  onStartTimeChange: function(e) {
    this.markTemplateFillUndoDirty();
    const time = e.detail.value;
    
    this.setData({
      'newTask.startTime': time
    });
    
    // 检查并调整结束时间
    this.checkAndAdjustEndTime(time);
    
    // 更新提醒选项（开始时间变化会影响提醒选项）
    const reminderOptions = this.getReminderOptions();
    this.setData({
      reminderOptions: reminderOptions
    });
    
    // 更新重复预览文本
    if (this.data.newTask.repeat.type !== 'none') {
      this.setData({
        repeatPreviewText: this.generateRepeatPreviewText(this.data.newTask.repeat.type)
      });
    }
    
    logger.info('TaskEdit', '设置开始时间:', {
      time: time,
      reminderOptionsCount: reminderOptions.length
    });
  },
  
  /**
   * 结束时间选择
   */
  onEndTimeChange: function(e) {
    this.markTemplateFillUndoDirty();
    const time = e.detail.value;
    
    // 任务编辑页的开始/结束时间始终描述单次任务当天的时间范围，不依赖重复区间结束日期
    if (!this.isValidEndTime(this.data.newTask.startTime, time, true)) {
      wx.showToast({
        title: '结束时间不能早于开始时间',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    // 计算任务持续时间
    if (this.data.newTask.startTime) {
      const [startHours, startMinutes] = this.data.newTask.startTime.split(':').map(Number);
      const [endHours, endMinutes] = time.split(':').map(Number);
      
      let startTotalMinutes = startHours * 60 + startMinutes;
      let endTotalMinutes = endHours * 60 + endMinutes;
      
      // 处理跨越午夜的情况
      if (endTotalMinutes < startTotalMinutes) {
        endTotalMinutes += 24 * 60;
      }
      
      const durationMinutes = endTotalMinutes - startTotalMinutes;
      
      logger.info('TaskEdit', '设置任务持续时间:', {
        hours: Math.floor(durationMinutes / 60),
        minutes: durationMinutes % 60
      });
      
      // 对超过3小时的任务添加日志
      if (durationMinutes > 180) {
        logger.info('TaskEdit', '创建长时间任务', {
          durationMinutes: durationMinutes
        });
        
        // 在设置结束时间前，先确保之后的UI更新正常
        this._showLoading({
          title: '处理中...',
          mask: false,
        });
        setTimeout(() => {
          this._hideLoading();
        }, 300);
      }
    }
    
    this.setData({
      'newTask.endTime': time
    });
    
    // 更新重复预览文本
    if (this.data.newTask.repeat.type !== 'none') {
      this.setData({
        repeatPreviewText: this.generateRepeatPreviewText(this.data.newTask.repeat.type)
      });
    }
    
    logger.info('TaskEdit', '设置结束时间:', time);
  },
  
  /**
   * 切换面板显示状态
   */
  togglePanel: function(e) {
    const panelName = e.currentTarget.dataset.panel;
    
    // 如果是重复面板且被禁用，则直接返回
    if (panelName === 'repeatPanel' && this.data.isRepeatOptionDisabled) {
      logger.warn('TaskEdit', '由于起止日期相同，重复面板已被禁用');
      wx.showToast({
        title: '单日任务不可设置重复',
        icon: 'none',
        duration: 1500
      });
      return;
    }
    
    // 关闭所有其他面板
    const newState = {
      startDatePanel: false,
      endDatePanel: false,
      repeatPanel: false,
      reminderPanel: false,
      pointsExpiryPanel: false
    };
    
    // 切换当前面板状态
    newState[panelName] = !this.data[panelName];
    
    // 如果打开提醒面板，生成动态提醒选项
    if (panelName === 'reminderPanel' && newState[panelName]) {
      newState.reminderOptions = this.getReminderOptions();
    }
    
    this.setData(newState);
    
    logger.info(`TaskEdit`, '切换${panelName}:', newState[panelName] ? '打开' : '关闭');
    
    // 如果打开重复面板，确保其处于默认的重复类型选择模式
    if (panelName === 'repeatPanel' && newState[panelName]) {
      this.setData({
        repeatPanelMode: 'type'
      });
    }
  },
  
  /**
   * 根据任务是否为全天任务获取可用的提醒选项
   */
  getReminderOptions: function() {
    return taskFormCore.buildReminderOptionsFromDraft(
      taskFormAdapter.adaptTaskEditStateToDraft(this.data.newTask)
    ).map((option) => ({
      enabled: option.enabled,
      time: option.time,
      text: option.label
    }));
  },
  
  /**
   * 切换到星期选择模式
   */
  switchToWeekdaySelection: function() {
    const weekdaySelection = [false, false, false, false, false, false, false];
    
    // 获取当前开始日期信息
    const startDate = new Date(this.data.newTask.startDate.replace(/-/g, '/'));
    const startDayOfWeek = startDate.getDay(); // 0是周日，6是周六
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    
    // 是否已有自定义设置
    const hasCustomConfig = this.data.newTask.repeat.type === 'custom' && 
                            this.data.newTask.repeat.days && 
                            this.data.newTask.repeat.days.length > 0;
    
    if (hasCustomConfig) {
      // 从已保存设置恢复选择状态
      // 确保days是数字类型
      this.data.newTask.repeat.days.forEach(day => {
        const dayIndex = parseInt(day);
        weekdaySelection[dayIndex] = true;
      });
      
      logger.info('TaskEdit', '从已保存设置恢复星期选择:', this.data.newTask.repeat.days);
    } else {
      // 如果是新选择，根据当前开始日期的星期预选对应日期
      weekdaySelection[startDayOfWeek] = true;
      
      // 更新任务重复信息
      const selectedDays = [startDayOfWeek];
      
      // 在这里更新任务重复设置
      this.setData({
        'newTask.repeat.type': 'custom',
        'newTask.repeat.days': selectedDays,
        repeatText: '每' + dayNames[startDayOfWeek]
      });
      
      logger.info('TaskEdit', '根据开始日期预选星期:', dayNames[startDayOfWeek]);
    }
    
    // 收集已选择的星期
    const selectedDays = [];
    weekdaySelection.forEach((selected, index) => {
      if (selected) {
        selectedDays.push(index);
      }
    });
    
    // 检查是否包含开始日期对应的星期
    const hasStartDay = selectedDays.includes(startDayOfWeek);
    
    // 检查是否需要强制更新UI
    const needForceUpdate = !hasStartDay;
    
    if (!hasStartDay) {
      logger.warn('TaskEdit', '警告: 恢复的选择不包含开始日期对应的星期，将显示告警');
    }
    
    // 更新选择状态，先更新基本UI
    this.setData({
      weekdaySelection: weekdaySelection,
      repeatPanelMode: 'weekday'
    });
    
    // 使用新函数更新预览文本和告警状态
    this.updateRepeatPreviewWithForce(needForceUpdate);
    
    // 获取警告状态
    const hasWarning = this.data.repeatTypeWarning;
    
    logger.info('TaskEdit', '切换到星期选择模式:', {
      selectedDays: selectedDays,
      hasStartDay: hasStartDay,
      hasWarning: hasWarning
    });
  },
  
  /**
   * 返回到重复类型选择模式
   */
  backToRepeatTypePanel: function() {
    // 收集选中的星期
    const selectedDays = [];
    this.data.weekdaySelection.forEach((selected, index) => {
      if (selected) {
        selectedDays.push(index);
      }
    });
    
    // 获取开始日期信息
    const startDate = new Date(this.data.newTask.startDate.replace(/-/g, '/'));
    const startDayOfWeek = startDate.getDay();
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const hasStartDay = selectedDays.includes(startDayOfWeek);
    
    // 无论是否有选中的星期，都更新自定义重复设置
    let repeatText = '';
    
    if (selectedDays.length > 0) {
      // 设置自定义重复文本
      if (selectedDays.length <= 2) {
        // 1-2天显示具体星期
        repeatText = '每' + selectedDays.map(day => dayNames[day]).join('、');
      } else {
        // 3天或以上显示"每周多天"
        repeatText = '每周多天';
      }
    } else {
      repeatText = '请选择星期';
    }
    
    logger.info('TaskEdit', '返回重复类型面板:', {
      selectedDays: selectedDays,
      startDayOfWeek: dayNames[startDayOfWeek],
      hasStartDay: hasStartDay
    });
    
    // 检查是否需要强制更新UI
    const needForceUpdate = !hasStartDay;
    
    if (!hasStartDay) {
      logger.warn('TaskEdit', '警告: 开始日期对应的星期未被选择，将在返回时显示告警');
    }
    
    // 更新任务重复设置并返回到重复类型面板
    this.setData({
      'newTask.repeat.type': 'custom',
      'newTask.repeat.days': selectedDays,
      repeatText: repeatText,
      // 切换面板模式
      repeatPanelMode: 'type'
    });
    
    // 使用新函数更新预览文本和告警状态
    this.updateRepeatPreviewWithForce(needForceUpdate);
    
    // 使用冲突信息更新日志
    const hasWarning = this.data.repeatTypeWarning;
    logger.info('TaskEdit', '返回重复类型面板完成:', {
      hasWarning: hasWarning
    });
  },
  
  /**
   * 切换星期选择状态
   */
  toggleWeekdaySelection: function(e) {
    this.markTemplateFillUndoDirty();
    const day = parseInt(e.currentTarget.dataset.day);
    const newSelection = [...this.data.weekdaySelection];
    
    // 获取当前开始日期的星期
    const startDate = new Date(this.data.newTask.startDate.replace(/-/g, '/'));
    const startDayOfWeek = startDate.getDay(); // 0是周日，6是周六
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    
    // 记录操作是选择还是取消选择
    const isSelecting = !newSelection[day];
    const isTargetStartDay = (day === startDayOfWeek);
    
    // 记录操作前的选择状态
    const wasStartDaySelected = newSelection[startDayOfWeek];
    
    // 更新选择状态
    newSelection[day] = !newSelection[day];
    
    // 实时更新重复类型和文本
    const selectedDays = [];
    newSelection.forEach((selected, index) => {
      if (selected) {
        selectedDays.push(index);
      }
    });
    
    // 操作后开始日期对应的星期是否被选中
    const isStartDaySelected = selectedDays.includes(startDayOfWeek);
    
    // 检查是否是取消选择了开始日期对应的星期
    const canceledStartDay = !isSelecting && isTargetStartDay;
    
    // 只记录关键状态变化的日志
    if (canceledStartDay || (wasStartDaySelected && !isStartDaySelected)) {
      logger.warn('TaskEdit', '警告操作:', {
        isSelecting: isSelecting,
        isTargetStartDay: isTargetStartDay,
        wasStartDaySelected: wasStartDaySelected,
        isStartDaySelected: isStartDaySelected
      });
      logger.warn('TaskEdit', '状态变化:', {
        isStartDaySelected: isStartDaySelected,
        selectedDays: selectedDays.map(d => dayNames[d]).join('、')
      });
    }
    
    let repeatText = '';
    
    // 无论是否有选中的星期，都需要更新预览文本
    if (selectedDays.length > 0) {
      if (selectedDays.length <= 2) {
        repeatText = '每' + selectedDays.map(day => dayNames[day]).join('、');
      } else {
        repeatText = '每周多天';
      }
    } else {
      repeatText = '请选择星期';
    }
    
    // 集中更新UI，先更新内部数据，然后一次性更新UI
    this.setData({
      weekdaySelection: newSelection,
      'newTask.repeat.type': 'custom',
      'newTask.repeat.days': selectedDays,
      repeatText: repeatText
    });
    
    // 立即强制更新预览文本和告警状态，特别关注取消选择开始日期对应星期的情况
    this.updateRepeatPreviewWithForce(canceledStartDay);
  },
  
  /**
   * 强制更新重复预览文本和告警状态
   * @param {boolean} forceUpdate 是否强制更新UI
   */
  updateRepeatPreviewWithForce: function(forceUpdate = false) {
    // 生成新的预览文本
    const newPreviewText = this.generateRepeatPreviewText('custom');
    
    // 获取当前冲突状态
    const hasConflict = this.data.repeatTypeWarning;
    
    // 更新UI
    this.setData({
      repeatPreviewText: newPreviewText
    });
    
    // 对于关键变更，确保UI更新是同步的，而不需要复杂的定时器逻辑
    if (forceUpdate && hasConflict) {
      // 使用更简单的方式触发重绘，只在有冲突时强制刷新
      wx.nextTick(() => {
        logger.warn('TaskEdit', '强制触发UI更新，确保告警信息立即显示');
      });
    }
  },
  
  /**
   * 关闭所有面板
   */
  closeAllPanels: function() {
    this.setData({
      startDatePanel: false,
      endDatePanel: false,
      repeatPanel: false,
      reminderPanel: false,
      pointsExpiryPanel: false
    });
    
    logger.info('TaskEdit', '关闭所有面板');
  },

  /**
   * 选择重复类型
   */
  selectRepeatType: function(e) {
    this.markTemplateFillUndoDirty();
    const type = e.currentTarget.dataset.type;

    this.setData({
      'newTask.repeat.type': type,
      'newTask.repeat.days': type === 'custom' ? this.data.newTask.repeat.days : [],
      repeatText: taskFormDisplay.buildRepeatText({
        type,
        days: type === 'custom' ? this.data.newTask.repeat.days : []
      }, {
        isRepeatOptionDisabled: this.data.isRepeatOptionDisabled
      }),
      repeatPreviewText: this.generateRepeatPreviewText(type)
    });
    
    logger.info('TaskEdit', '已选择重复类型:', type);
  },

  /**
   * 选择提醒类型
   */
  selectReminderType: function(e) {
    this.markTemplateFillUndoDirty();
    const enabled = e.currentTarget.dataset.enabled === 'true';
    const time = parseInt(e.currentTarget.dataset.time || 0);
    const reminderText = taskFormDisplay.buildReminderText({
      enabled,
      time
    });

    this.setData({
      'newTask.reminder.enabled': enabled,
      'newTask.reminder.time': time,
      reminderText: reminderText,
      reminderPanel: false // 选择后关闭面板
    });
    
    logger.info('TaskEdit', '设置提醒:', reminderText);
  },

  /**
   * 检查并调整结束时间
   */
  checkAndAdjustEndTime: function(startTime) {
    if (this.data.newTask.endTime) {
      const startTimeValue = startTime || this.data.newTask.startTime;

      const adjusted = taskFormCore.resolveAdjustedEndTime(
        startTimeValue,
        this.data.newTask.endTime
      );

      if (adjusted.adjusted) {
        this.setData({
          'newTask.endTime': adjusted.endTime,
        });
      }
    }
  },

  /**
   * 日期时间辅助函数 - 检查结束时间是否有效
   * @param {string} startTime 开始时间
   * @param {string} endTime 结束时间
   * @returns {boolean} 结束时间是否有效（结束时间必须晚于开始时间）
   */
  isValidEndTime: function(startTime, endTime, isSameDay) {
    if (!startTime || !endTime) return true;

    if (isSameDay === false) {
      return false;
    }

    const startSeconds = taskFormCore.parseTimeToSeconds(startTime);
    const endSeconds = taskFormCore.parseTimeToSeconds(endTime);

    if (startSeconds === null || endSeconds === null) {
      return true;
    }

    return endSeconds > startSeconds;
  },

  /**
   * 阻止滑动穿透
   */
  preventTouchMove: function(e) {
    // 阻止事件冒泡和默认行为
    return;
  },

  /**
   * 防止点击面板内部关闭面板
   */
  preventClose: function(e) {
    // 阻止事件冒泡
    return;
  },

  /**
   * 处理开始日期选择事件
   */
  onStartDateSelected: function(e) {
    this.markTemplateFillUndoDirty();
    const date = e.detail.date;
    
    this.setData({
      'newTask.startDate': date
    });
    
    // 如果结束日期早于开始日期，自动调整结束日期
    if (this.data.newTask.endDate < date) {
      this.setData({
        'newTask.endDate': date
      });
    }
    
    // 检查起止日期是否相同
    const isSameDay = date === this.data.newTask.endDate;
    
    // 当起止日期相同时，设置重复为"当天"并禁用重复选项
    // 当起止日期不同时，如果之前是"当天"，则改为"每天"并启用重复选项
    if (isSameDay) {
      logger.info('TaskEdit', '检测到起止日期相同，设置为当天且禁用重复选项');
      this.setData({
        repeatText: '当天',
        isRepeatOptionDisabled: true
      });
      
      // 如果重复面板正在显示，则关闭它
      if (this.data.repeatPanel) {
        this.setData({
          repeatPanel: false
        });
      }
    } else if (this.data.isRepeatOptionDisabled) {
      // 如果之前重复选项是禁用的（即起止日期是相同的），现在不同了
      logger.info('TaskEdit', '检测到起止日期不同，启用重复选项');
      this.setData({
        repeatText: '每天', // 恢复为每天
        isRepeatOptionDisabled: false
      });
    }
    
    // 更新重复预览文本
    if (this.data.newTask.repeat.type !== 'none') {
      this.setData({
        repeatPreviewText: this.generateRepeatPreviewText(this.data.newTask.repeat.type)
      });
    }
    
    logger.info('TaskEdit', '选择开始日期:', date, '起止日期相同:', isSameDay);
  },
  
  /**
   * 处理结束日期选择事件
   */
  onEndDateSelected: function(e) {
    this.markTemplateFillUndoDirty();
    const date = e.detail.date;
    
    this.setData({
      'newTask.endDate': date
    });
    
    // 检查起止日期是否相同
    const isSameDay = this.data.newTask.startDate === date;
    
    // 当起止日期相同时，设置重复为"当天"并禁用重复选项
    // 当起止日期不同时，如果之前是"当天"，则改为"每天"并启用重复选项
    if (isSameDay) {
      logger.info('TaskEdit', '检测到起止日期相同，设置为当天且禁用重复选项');
      this.setData({
        repeatText: '当天',
        isRepeatOptionDisabled: true
      });
      
      // 如果重复面板正在显示，则关闭它
      if (this.data.repeatPanel) {
        this.setData({
          repeatPanel: false
        });
      }
    } else if (this.data.isRepeatOptionDisabled) {
      // 如果之前重复选项是禁用的（即起止日期是相同的），现在不同了
      logger.info('TaskEdit', '检测到起止日期不同，启用重复选项');
      this.setData({
        repeatText: '每天', // 恢复为每天
        isRepeatOptionDisabled: false
      });
    }
    
    // 同时更新重复任务的结束日期，修复结束日期不同步问题
    if (this.data.newTask.repeat && this.data.newTask.repeat.type !== 'none') {
      logger.info('TaskEdit', '同步更新重复任务结束日期:', date);
      this.setData({
        'newTask.repeat.endDate': date
      });
    }
    
    // 更新重复预览文本
    if (this.data.newTask.repeat.type !== 'none') {
      this.setData({
        repeatPreviewText: this.generateRepeatPreviewText(this.data.newTask.repeat.type)
      });
    }
    
    logger.info('TaskEdit', '选择结束日期:', date, '起止日期相同:', isSameDay);
  },
  
  /**
   * 处理日期选择器关闭事件
   */
  onDatePickerClose: function(e) {
    const type = e.detail.type; // 'start' 或 'end'
    
    this.setData({
      [type + 'DatePanel']: false
    });
    
    logger.info(`TaskEdit`, '关闭${type}日期选择器');
  },

  /**
   * 生成重复预览文本
   * @param {string} repeatType 重复类型
   * @returns {string} 预览文本
   */
  generateRepeatPreviewText: function(repeatType) {
    const previewText = taskFormDisplay.buildRepeatPreviewText(this.data.newTask, repeatType);
    const conflictCheck = this.checkRepeatDateConflict(repeatType);

    this.setData({
      repeatTypeWarning: conflictCheck.hasConflict
    });

    return previewText;
  },
  
  /**
   * 检查重复日期冲突
   * 集中处理日期冲突检测逻辑，确保一致性
   * @param {string} repeatType 重复类型
   * @returns {Object} 包含是否冲突和预览文本的对象
   */
  checkRepeatDateConflict: function(repeatType) {
    return taskFormDisplay.checkRepeatDateConflict(this.data.newTask, repeatType);
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide: function() {
    logger.info('task-edit', '页面隐藏');

    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = null;
    }
    
    // 确保关闭任何可能存在的加载提示
    try {
      this._hideLoading(true);
    } catch (error) {
      logger.error('task-edit', '页面隐藏时关闭加载提示出错:', error);
    }
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function() {
    logger.info('task-edit', '页面卸载');
    this._templateFillUndoSnapshot = null;

    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = null;
    }
    
    // 确保关闭任何可能存在的加载提示
    try {
      this._hideLoading(true);
    } catch (error) {
      logger.error('task-edit', '页面卸载时关闭加载提示出错:', error);
    }
  },

  _showLoading: function(options) {
    taskEditLoadingVisible = true;
    wx.showLoading(options);
  },

  _hideLoading: function(force = false) {
    if (!taskEditLoadingVisible) {
      return;
    }

    taskEditLoadingVisible = false;
    wx.hideLoading();
  },

  /**
   * 切换必做任务状态
   */
  toggleRequiredTask: function(e) {
    this.markTemplateFillUndoDirty();
    const isRequired = e.detail.value;
    logger.info('TaskEdit', '切换必做任务状态:', isRequired);
    
    this.setData({
      'newTask.isRequired': isRequired
    });
    
    // 给用户一个振动反馈
    wx.vibrateShort({
      type: 'medium'
    });
    
    logger.info('TaskEdit', '当前积分设置:', this.data.newTask.points);
    
    // 如果是首次启用必做任务，显示提示
    if (isRequired && !pageStorageHelper.getUserPreference('requiredTaskTipShown')) {
      wx.showModal({
        title: '必做任务说明',
        content: `必做任务未完成将扣除${this.data.newTask.points}积分。`,
        showCancel: false,
        success: (res) => {
          // 标记已显示提示
          pageStorageHelper.setUserPreference('requiredTaskTipShown', true);
        }
      });
    }
  },

  /**
   * 选择积分有效期
   */
  selectPointsExpiry: function(e) {
    this.markTemplateFillUndoDirty();
    const expiry = e.currentTarget.dataset.expiry;

    this.setData({
      'newTask.pointsExpiry': expiry,
      pointsExpiryText: taskFormDisplay.buildPointsExpiryText(expiry)
    });
  },
})
