const app = getApp();
const taskManager = require('../../utils/taskManager.js');

Page({
  /**
   * 页面的初始数据
   */
  data: {
    mode: 'create', // 'create' 或 'edit'
    taskType: '', // 'study' 或 'habit'
    precision: 'second', // 'second' 或 'day'
    showCalendar: false, // 是否显示日历选择器
    task: {
      id: '', // 编辑模式下有值
      title: '',
      shortName: '', // 新增：任务简称(4字以内)
      description: '',
      type: '', // 任务类型
      taskType: '', // 主任务类型(study/habit)
      tags: [], // 标签ID数组
      date: '', // 执行日期
      startTime: '', // 开始时间(仅学习型)
      endTime: '', // 结束时间(仅学习型)
      points: 0, // 积分
      repeat: {
        type: 'none', // 重复类型
        days: [], // 重复日期
        endDate: '' // 结束日期
      },
      status: 0, // 0=未完成, 1=已完成
      createTime: 0,
      updateTime: 0,
      isEditing: false // 是否处于编辑模式
    },
    taskTemplates: [], // 任务模板列表
    studyTemplates: [], // 学习任务模板
    habitTemplates: [], // 生活习惯模板
    selectedTemplate: '', // 已选任务模板
    selectedTemplateType: '', // 选择的模板类型
    dateNow: '', // 当前日期，用于日期选择器最小值
    timeNow: '', // 当前时间，用于时间选择器最小值
    isCustomPoints: false, // 是否使用自定义积分
    customPointsValue: '8', // 自定义积分值
    
    // 重复模式
    repeatMode: 'once', // 'once' 或 'repeat'
    taskLoad: {
      status: 'normal', // 'light', 'normal', 'heavy'
      totalTasks: 0,
      totalMinutes: 0,
      percentage: 0, // 0-100
      message: '任务量适中'
    },
    recommendedTags: [], // 推荐标签
    frequentTags: [], // 常用标签
    allTags: [], // 所有标签
    selectedTags: [], // 已选标签
    showTagSelector: false, // 是否显示标签选择器
    taskTypes: [
      { id: 'habit', name: '习惯', icon: '⏰', parent: 'habit' },
      { id: 'study', name: '学习', icon: '📝', parent: 'study' }
    ],
    availableRewards: [
      { id: 'game', name: '游戏时间', icon: '🎮', points: 10 },
      { id: 'icecream', name: '冰淇淋', icon: '🍦', points: 15 },
      { id: 'phone', name: '手机时间', icon: '📱', points: 20 },
      { id: 'toy', name: '新玩具', icon: '🧸', points: 30 },
      { id: 'movie', name: '看电影', icon: '🎬', points: 25 }
    ],
    pointSuggestions: [
      { duration: 30, points: '1-2' },
      { duration: 60, points: '3-5' },
      { duration: 61, points: '5-10' }
    ],
    userPoints: 0, // 用户当前积分
    activeView: 'day', // 当前激活的视图: 'day', 'week', 'month'
    overviewDay: '', // 日视图当前日期
    weekRange: '', // 周视图日期范围
    monthTitle: '', // 月视图标题
    dayData: {
      totalTasks: 0,
      totalMinutes: 0,
      status: 'light',
      percentage: 0,
      message: '暂无任务',
      tasks: []
    },
    weekData: {
      totalTasks: 0,
      avgTasksPerDay: 0,
      days: []
    },
    monthData: null,
    // 日期选择器快速选项
    dateQuickOptions: [
      { label: '今天', value: 'today' },
      { label: '明天', value: 'tomorrow' },
      { label: '后天', value: 'afterTomorrow' },
      { label: '本周末', value: 'weekend' },
      { label: '下周一', value: 'nextMonday' },
      { label: '本周', value: 'week' },
      { label: '本月', value: 'month' }
    ],
    
    // 日期范围选择器快速选项
    dateRangeQuickOptions: [
      { label: '本周', value: 'week' },
      { label: '本月', value: 'month' }
    ],
    
    // 菜单项配置(移除这段)
    menuItems: [
      {
        id: 'habit',
        type: 'habit-task',
        icon: '⏰',
        label: '习惯',
        ariaLabel: '添加习惯'
      },
      {
        id: 'interest',
        type: '',
        icon: '🧹',
        label: '兴趣',
        ariaLabel: '添加兴趣任务',
        style: 'background: linear-gradient(135deg, #FFC107, #FF9800);'
      },
      {
        id: 'save',
        type: '',
        icon: '💾',
        label: '保存',
        ariaLabel: '保存任务',
        style: 'background: linear-gradient(135deg, #4CAF50, #2E7D32);'
      }
    ]
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function(options) {
    console.log('[TaskEdit] 任务编辑页面加载', options);
    
    // 记录常用任务标题添加
    console.log('[TaskEdit] 常用任务区域添加标题，提升用户界面一致性');
    
    // 设置页面标题
    wx.setNavigationBarTitle({
      title: options.mode === 'edit' ? '编辑任务' : 
             options.taskType === 'study' ? '创建学习任务' : '创建习惯任务'
    });
    
    // 初始化日期和时间
    this.initDateTime();
    
    // 判断模式(创建/编辑)
    if (options.mode === 'edit' && options.taskId) {
      console.log('[TaskEdit] 进入编辑模式，taskId:', options.taskId);
      this.initEditMode(options.taskId);
    } else {
      console.log('[TaskEdit] 进入创建模式，taskType:', options.taskType);
      this.initCreateMode(options);
    }
    
    // 加载任务模板（按类型分类）
    console.log('[TaskEdit] 开始加载任务模板...');
    this.loadTemplatesByCategory();
    
    // 更新任务负载预测
    this.updateTaskLoadPreview();
    
    // 初始化任务概览数据
    this.initTaskOverview();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function() {
    console.log('[task-edit] 页面显示，刷新能力成长计划');
    
    // 这里不需要使用bind，因为在生命周期函数中this指向的是页面实例
    this.initTaskOverview();
  },

  /**
   * 初始化创建模式
   */
  initCreateMode: function(options) {
    // 只有在明确指定taskType时才设置，否则维持当前值
    if (options.taskType) {
      const precision = options.precision || (options.taskType === 'study' ? 'second' : 'day');
      let defaultPoints = options.taskType === 'study' ? 3 : 2;
      
      this.setData({
        taskType: options.taskType,
        precision: precision,
        'task.type': options.taskType,
        'task.taskType': options.taskType,
        'task.points': defaultPoints,
        'task.precision': precision
      });
      
      console.log('[TaskEdit] 初始化创建模式，设置任务类型:', options.taskType);
    } else {
      console.log('[TaskEdit] 初始化创建模式，保持当前任务类型:', this.data.taskType);
    }
    
    // 与taskType无关的设置
    this.setData({
      mode: 'create',
      selectedTemplate: '', // 确保没有选中的模板
      'task.isEditing': false // 初始为非编辑状态
    });
  },

  /**
   * 初始化编辑模式
   */
  initEditMode: function(taskId) {
    const that = this;
    
    // 获取任务数据
    wx.getStorage({
      key: 'taskData',
      success: function(res) {
        const tasks = res.data || [];
        const task = tasks.find(t => t.id === taskId);
        
        if (task) {
          // 确保任务有所有必要字段
          const completeTask = that.ensureTaskFields(task);
          
          // 检查是否使用自定义积分值
          const isCustomPoints = ![1, 2, 3, 5].includes(completeTask.points);
          
          that.setData({
            mode: 'edit',
            taskType: completeTask.taskType || 'study',
            precision: completeTask.precision || (completeTask.taskType === 'study' ? 'second' : 'day'),
            task: completeTask,
            customMode: true,
            selectedTemplate: '',
            isCustomPoints: isCustomPoints,
            customPointsValue: isCustomPoints ? completeTask.points.toString() : '8'
          });
        } else {
          wx.showToast({
            title: '任务不存在',
            icon: 'none'
          });
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        }
      },
      fail: function() {
        wx.showToast({
          title: '获取任务失败',
          icon: 'none'
        });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      }
    });
  },
  
  /**
   * 确保任务对象包含所有必要字段
   */
  ensureTaskFields: function(task) {
    // 基本字段检查
    if (!task.hasOwnProperty('taskType')) {
      // 根据type字段推断taskType
      if (task.type === 'study') {
        task.taskType = 'study';
      } else {
        task.taskType = 'habit';
      }
    }
    
    if (!task.hasOwnProperty('precision')) {
      // 根据taskType推断precision
      task.precision = task.taskType === 'study' ? 'second' : 'day';
    }
    
    // 学习任务特有字段
    if (task.taskType === 'study' && !task.hasOwnProperty('reflection')) {
      task.reflection = '';
    }
    
    // 习惯任务特有字段
    if (task.taskType === 'habit' && !task.hasOwnProperty('repeat')) {
      task.repeat = { type: 'none' }; // 默认不重复
    }
    
    return task;
  },

  /**
   * 初始化日期和时间
   */
  initDateTime: function() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    
    this.setData({
      dateNow: `${year}-${month}-${day}`,
      timeNow: `${hours}:${minutes}`
    });
  },

  /**
   * 根据任务类型更新推荐标签
   */
  updateRecommendedTags: function(taskType) {
    if (taskType === 'study') {
      this.setData({
        recommendedTags: ['数学', '阅读', '英语', '科学', '艺术', '音乐']
      });
    } else {
      this.setData({
        recommendedTags: ['自理', '整理', '运动', '饮食', '环保', '娱乐']
      });
    }
  },

  /**
   * 验证任务数据
   */
  validateTaskData: function() {
    const { task } = this.data;
    
    // 验证基本信息
    if (!task.title.trim()) {
      wx.showToast({
        title: '请输入任务名称',
        icon: 'none'
      });
      return false;
    }
    
    // 验证日期和时间
    if (!task.date) {
      wx.showToast({
        title: '请选择执行日期',
        icon: 'none'
      });
      return false;
    }
    
    // 对于学习型任务，验证时间
    if (this.data.taskType === 'study' && !task.startTime) {
      wx.showToast({
        title: '请选择开始时间',
        icon: 'none'
      });
      return false;
    }
    
    if (this.data.taskType === 'study' && !task.endTime) {
      wx.showToast({
        title: '请选择结束时间',
        icon: 'none'
      });
      return false;
    }
    
    return true;
  },

  /**
   * 验证当前步骤
   */
  validateCurrentStep: function() {
    return this.validateTaskData();
  },

  /**
   * 处理任务信息变更事件
   */
  handleTaskInfoChange: function(e) {
    const { field, value, task } = e.detail;
    
    // 如果是从模板编辑，只允许修改积分和描述
    if (this.data.selectedTemplate !== '' && this.data.task.isEditing) {
      if (field !== 'points' && field !== 'description') {
        console.log('[TaskEdit] 从模板编辑模式下只能修改积分和描述');
        return;
      }
    }
    
    // 更新对应字段
    const data = {};
    data[`task.${field}`] = value;
    
    this.setData(data);
    
    // 如果是修改持续时间，更新任务负载预测
    if (field === 'duration') {
      this.updateTaskLoadPreview();
    }
  },

  /**
   * 输入任务简称
   */
  inputShortName: function(e) {
    this.setData({
      'task.shortName': e.detail.value
    });
  },

  /**
   * 选择日期
   */
  selectDate: function(e) {
    console.log('[TaskEdit] 选择日期:', e.detail);
    
    this.setData({
      'task.date': e.detail.date
    });
    
    // 更新任务负载预测
    this.updateTaskLoadPreview();
  },

  /**
   * 选择开始时间
   */
  selectStartTime: function(e) {
    console.log('[TaskEdit] 选择开始时间:', e.detail);
    
    this.setData({
      'task.startTime': e.detail.time
    });
  },

  /**
   * 选择结束时间
   */
  selectEndTime: function(e) {
    console.log('[TaskEdit] 选择结束时间:', e.detail);
    
    this.setData({
      'task.endTime': e.detail.time
    });
  },

  /**
   * 处理持续时间变更事件
   */
  handleDurationChange: function(e) {
    console.log('[TaskEdit] 持续时间变更:', e.detail);
    
    if (e.detail.duration > 0) {
      this.setData({
        'task.duration': e.detail.duration
      });
      
      // 更新任务负载预测
      this.updateTaskLoadPreview();
    }
  },

  /**
   * 选择开始日期（周期任务）
   */
  selectStartDate: function(e) {
    console.log('[TaskEdit] 选择开始日期:', e.detail);
    
    this.setData({
      'task.repeat.startDate': e.detail.date
    });
  },

  /**
   * 选择结束日期（周期任务）
   */
  selectEndDate: function(e) {
    console.log('[TaskEdit] 选择结束日期:', e.detail);
    
    this.setData({
      'task.repeat.endDate': e.detail.date
    });
  },

  /**
   * 切换任务执行模式
   */
  switchMode: function(e) {
    // 日志记录
    console.log('[TaskEdit] 接收到模式切换事件:', e);
    
    // 从事件详情获取模式值
    const mode = e.detail.mode;
    const previousMode = this.data.repeatMode || 'once';
    
    console.log('[TaskEdit] 切换执行模式:', mode, '上一模式:', previousMode);
    
    // 更新数据
    this.setData({
      repeatMode: mode
    });
    
    // 日志记录任务状态变化
    const taskTitle = this.data.task.title || '未命名任务';
    const taskType = this.data.taskType || 'unknown';
    console.log('[TaskEdit] 任务状态变更:', {
      taskId: this.data.taskId,
      title: taskTitle,
      type: taskType,
      previousMode: previousMode,
      currentMode: mode,
      hasRepeatSettings: !!this.data.task.repeat,
      timestamp: new Date().toISOString()
    });
  },

  /**
   * 处理创建重复设置事件（从组件接收）
   */
  handleCreateRepeatSettings: function(e) {
    console.log('[TaskEdit] 接收到创建重复设置事件:', e.detail);
    
    const { repeatSettings } = e.detail;
    
    this.setData({
      'task.repeat': repeatSettings
    });
    
    console.log('[TaskEdit] 重复任务设置已更新:', this.data.task.repeat);
  },

  /**
   * 处理日期选择器的快速日期选项事件
   */
  handleQuickDateOption: function(e) {
    const { date } = e.detail;
    this.setData({
      'task.date': date
    });
    
    // 更新任务负载预测
    this.updateTaskLoadPreview();
  },
  
  /**
   * 处理日期选择器的日期范围快速选项事件
   */
  handleRangeDateOption: function(e) {
    console.log('[TaskEdit] 处理日期范围快速选项:', e.detail);
    const { startDate, endDate } = e.detail;
    
    // 如果选择了本周或本月，且没有设置开始日期，则使用当天作为开始日期
    const today = this.data.dateNow;
    const finalStartDate = startDate || today;
    
    // 确保开始日期不早于当天
    if (finalStartDate < today) {
      console.log('[TaskEdit] 开始日期早于当天，自动调整为当天');
      this.setData({
        'task.repeat.startDate': today,
        'task.repeat.endDate': endDate
      });
    } else {
      this.setData({
        'task.repeat.startDate': finalStartDate,
        'task.repeat.endDate': endDate
      });
    }
  },

  

  /**
   * 选择预设积分值
   */
  selectPresetPoints: function(e) {
    const points = parseInt(e.currentTarget.dataset.points);
    this.setData({
      'task.points': points,
      isCustomPoints: false
    });
  },

  /**
   * 启用自定义积分输入
   */
  enableCustomPoints: function() {
    this.setData({
      isCustomPoints: true,
      customPointsValue: this.data.task.points.toString()
    });
  },

  /**
   * 自定义积分值输入
   */
  inputCustomPoints: function(e) {
    const value = e.detail.value;
    // 更新自定义积分值
    this.setData({
      customPointsValue: value
    });
    
    // 如果输入的是有效数字，更新任务积分
    if (value !== '') {
      const points = parseInt(value);
      if (!isNaN(points) && points >= 0) {
        this.setData({
          'task.points': points
        });
      }
    }
  },

  /**
   * 加载标签数据
   */
  loadTags: function() {
    wx.getStorage({
      key: 'tagData',
      success: res => {
        const allTags = res.data || [];
        
        // 根据使用频率排序标签
        const sortedTags = allTags.sort((a, b) => (b.useCount || 0) - (a.useCount || 0));
        
        // 获取常用标签(前6个)
        const frequentTags = sortedTags.slice(0, 6);
        
        this.setData({
          allTags: allTags,
          frequentTags: frequentTags
        });
      },
      fail: () => {
        // 如果没有标签数据，创建默认标签
        const defaultTags = [
          { id: 'math', name: '数学', icon: '📚', type: 'study', useCount: 0 },
          { id: 'reading', name: '阅读', icon: '📖', type: 'study', useCount: 0 },
          { id: 'english', name: '英语', icon: '🌎', type: 'study', useCount: 0 },
          { id: 'selfcare', name: '自理', icon: '👕', type: 'habit', useCount: 0 },
          { id: 'cleaning', name: '整理', icon: '🧹', type: 'habit', useCount: 0 },
          { id: 'exercise', name: '运动', icon: '🏃‍♂️', type: 'habit', useCount: 0 }
        ];
        
        this.setData({
          allTags: defaultTags,
          frequentTags: defaultTags
        });
        
        // 存储默认标签
        wx.setStorage({
          key: 'tagData',
          data: defaultTags
        });
      }
    });
  },

  /**
   * 打开标签选择器
   */
  showTagSelector: function() {
    this.setData({
      showTagSelector: true
    });
  },

  /**
   * 关闭标签选择器
   */
  hideTagSelector: function() {
    this.setData({
      showTagSelector: false
    });
  },

  /**
   * 选择标签
   */
  selectTag: function(e) {
    const tagId = e.currentTarget.dataset.id;
    const selectedTags = [...this.data.selectedTags];
    
    // 最多选择3个标签
    if (selectedTags.includes(tagId)) {
      const index = selectedTags.indexOf(tagId);
      selectedTags.splice(index, 1);
    } else {
      if (selectedTags.length >= 3) {
        wx.showToast({
          title: '最多选择3个标签',
          icon: 'none'
        });
        return;
      }
      selectedTags.push(tagId);
    }
    
    this.setData({
      selectedTags: selectedTags,
      'task.tags': selectedTags
    });
  },

  /**
   * 创建新标签
   */
  createNewTag: function(e) {
    const tagName = e.detail.value.tagName;
    
    if (!tagName.trim()) {
      wx.showToast({
        title: '标签名称不能为空',
        icon: 'none'
      });
      return;
    }
    
    // 检查标签是否已存在
    if (this.data.allTags.some(tag => tag.name === tagName)) {
      wx.showToast({
        title: '标签已存在',
        icon: 'none'
      });
      return;
    }
    
    // 生成新标签
    const newTag = {
      id: 'tag_' + Date.now(),
      name: tagName,
      icon: this.data.taskType === 'study' ? '📚' : '⭐',
      type: this.data.taskType,
      useCount: 0,
      createTime: Date.now()
    };
    
    // 保存标签
    const allTags = [...this.data.allTags, newTag];
    this.setData({
      allTags: allTags
    });
    
    // 存储标签
    wx.setStorage({
      key: 'tagData',
      data: allTags
    });
    
    // 自动选中新创建的标签
    this.selectTag({
      currentTarget: {
        dataset: {
          id: newTag.id
        }
      }
    });
    
    wx.showToast({
      title: '标签创建成功',
      icon: 'success'
    });
  },

  /**
   * 确认标签选择
   */
  confirmTagSelection: function() {
    this.setData({
      showTagSelector: false
    });
  },

  /**
   * 更新任务负载预测
   */
  updateTaskLoadPreview: function() {
    const taskManager = require('../../utils/taskManager.js');
    const that = this;
    
    taskManager.getTodayTasks(todayTasks => {
      let totalMinutes = 0;
      
      // 只计算学习类任务的持续时间
      todayTasks.forEach(task => {
        if (task.type === 'study' && task.duration) {
          totalMinutes += task.duration;
        }
      });
      
      // 计算当前任务的持续时间（如果是学习类任务）
      if (that.data.task.type === 'study' && that.data.task.duration) {
        totalMinutes += that.data.task.duration;
      }
      
      // 计算任务负载状态
      let status = 'light';
      let message = '任务量适中';
      
      if (totalMinutes > 240) {
        status = 'heavy';
        message = '任务量较重';
      } else if (totalMinutes < 60) {
        status = 'light';
        message = '任务量较轻';
      }
      
      that.setData({
        'taskLoad.totalMinutes': totalMinutes,
        'taskLoad.status': status,
        'taskLoad.message': message,
        'taskLoad.percentage': Math.min(Math.floor((totalMinutes / 240) * 100), 100)
      });
    });
  },

  /**
   * 验证周期性任务设置
   * @returns {boolean} 是否验证通过
   */
  validateRepeatTask() {
    const task = this.data.task;
    
    if (!task.repeat.startDate) {
      wx.showToast({
        title: '请选择开始日期',
        icon: 'none'
      });
      return false;
    }
    
    if (task.repeat.endDate) {
      const startDate = new Date(task.repeat.startDate);
      const endDate = new Date(task.repeat.endDate);
      if (endDate < startDate) {
        wx.showToast({
          title: '结束日期不能早于开始日期',
          icon: 'none'
        });
        return false;
      }
    }
    
    if (task.repeat.type === 'custom' && (!task.repeat.days || task.repeat.days.length === 0)) {
      wx.showToast({
        title: '请选择重复日期',
        icon: 'none'
      });
      return false;
    }
    
    return true;
  },

  /**
   * 保存任务
   */
  saveTask: function() {
    const _this = this;
    
    // 添加日志记录任务数据
    console.log('[task-edit] 准备保存任务', JSON.stringify({
      title: _this.data.task.title,
      date: _this.data.task.date,
      taskType: _this.data.taskType,
      selectedTemplate: _this.data.selectedTemplate,
      isRepeat: !!(_this.data.task.repeat && _this.data.task.repeat.type !== 'none')
    }));
    
    // 验证任务信息
    if (!_this.data.task.title || _this.data.task.title.trim() === '') {
      wx.showToast({
        title: '请输入任务标题',
        icon: 'none'
      });
      return;
    }
    
    // 验证积分是否为整数
    if (!Number.isInteger(_this.data.task.points)) {
      wx.showToast({
        title: '积分必须为整数',
        icon: 'none'
      });
      console.log('[task-edit] 积分验证失败，非整数值：', _this.data.task.points);
      return;
    }
    
    // 验证周期性任务设置
    if (_this.data.task.repeat && _this.data.task.repeat.type !== 'none') {
      if (!this.validateRepeatTask()) {
        return;
      }
    }
    
    const that = this;
    const taskData = this.data.task;
    
    // 确保必要字段已设置
    if (!taskData.date) {
      taskData.date = this.data.dateNow;
      console.log('[task-edit] 自动设置任务日期为:', taskData.date);
    }
    
    if (this.data.taskType === 'study') {
      if (!taskData.startTime) {
        taskData.startTime = '09:00';
        console.log('[task-edit] 自动设置开始时间为:', taskData.startTime);
      }
      if (!taskData.endTime) {
        taskData.endTime = '10:00';
        console.log('[task-edit] 自动设置结束时间为:', taskData.endTime);
      }
    }
    
    // 显示加载中
    wx.showLoading({
      title: '正在保存...',
    });
    
    // 如果是周期性任务，使用taskManager处理
    if (taskData.repeat && taskData.repeat.type !== 'none') {
      console.log('[task-edit] 检测到周期性任务，使用taskManager处理');
      
      // 确保任务有必要的字段
      taskData.id = taskData.id || `task_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      taskData.createTime = taskData.createTime || Date.now();
      taskData.updateTime = Date.now();
      
      const taskManager = require('../../utils/taskManager.js');
      taskManager.createTask(taskData, (newTask) => {
        wx.hideLoading();
        
        // 刷新能力成长计划数据
        that.initTaskOverview.bind(that)();
        console.log('[task-edit] 周期性任务创建成功并刷新能力成长计划');
        
        wx.showToast({
          title: '任务创建成功',
          icon: 'success',
          duration: 2000
        });
        
        // 延迟返回上一页
        setTimeout(() => {
          wx.navigateBack();
        }, 2000);
      });
      return; // 使用taskManager处理后直接返回
    }
    
    // 非周期性任务的处理逻辑
    wx.getStorage({
      key: 'taskData',
      success: function(res) {
        const tasks = res.data || [];
        const task = tasks.find(t => t.id === taskData.id);
        
        if (task) {
          // 更新现有任务
          Object.assign(task, {
            title: taskData.title,
            shortName: taskData.shortName,
            description: taskData.description,
            type: taskData.type,
            taskType: taskData.taskType,
            tags: taskData.tags,
            date: taskData.date,
            startTime: taskData.startTime,
            endTime: taskData.endTime,
            points: taskData.points,
            repeat: taskData.repeat,
            status: taskData.status,
            updateTime: Date.now(),
            isEditing: taskData.isEditing
          });
          
          // 更新任务数据
          const updatedTasks = tasks.map(t => t.id === taskData.id ? task : t);
          that._saveTaskAndReturn(updatedTasks, '任务更新成功');
        } else {
          // 创建新任务
          taskData.id = taskData.id || `task_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          taskData.createTime = Date.now();
          taskData.updateTime = Date.now();
          taskData.isEditing = true;
          
          // 添加新任务到任务列表并保存
          that._saveTaskAndReturn([...tasks, taskData], '任务创建成功');
        }
      },
      fail: function(err) {
        console.error('[TaskEdit] 获取任务数据失败:', err);
        
        // 修改：失败时直接创建新存储
        taskData.id = taskData.id || `task_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        taskData.createTime = Date.now();
        taskData.updateTime = Date.now();
        
        // 直接创建新的任务数组
        that._saveTaskAndReturn([taskData], '任务保存成功');
      }
    });
  },
  
  /**
   * 保存任务数据并返回上一页
   * @private
   * @param {Array} tasks 要保存的任务数组
   * @param {String} successMsg 成功提示信息
   */
  _saveTaskAndReturn: function(tasks, successMsg) {
    const that = this;
    
    wx.setStorage({
      key: 'taskData',
      data: tasks,
      success: function() {
        wx.hideLoading();
        
        // 刷新能力成长计划数据
        that.initTaskOverview.bind(that)();
        console.log('[task-edit] 任务保存成功并刷新能力成长计划');
        
        wx.showToast({
          title: successMsg,
          icon: 'success',
          duration: 2000
        });
        
        // 延迟返回上一页
        setTimeout(() => {
          wx.navigateBack();
        }, 2000);
      },
      fail: function(err) {
        wx.hideLoading();
        console.error('[TaskEdit] 任务保存失败:', err);
        wx.showToast({
          title: '保存任务失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 加载按类型分类的模板
   */
  loadTemplatesByCategory: function() {
    const that = this;
    console.log('[TaskEdit] 开始加载模板（按类型分类）');
    
    // 从本地存储加载自定义模板
    wx.getStorage({
      key: 'customTemplates',
      success: function(res) {
        const templates = res.data || [];
        console.log('[TaskEdit] 成功加载自定义模板，数量:', templates.length);
        
        if (templates.length === 0) {
          console.log('[TaskEdit] 已加载模板但数量为0，初始化默认模板');
          that.initializeDefaultTemplates();
          return;
        }
        
        // 记录模板的isCustom属性，用于调试
        templates.forEach((t, i) => {
          if (i < 3) { // 只记录前3个模板
            console.log(`[TaskEdit] 模板[${i}] - ID: ${t.id}, 标题: ${t.title || t.name}, isCustom: ${t.isCustom}`);
          }
        });
        
        // 迁移模板数据结构，统一字段命名
        const migratedTemplates = that.migrateTemplateStructure(templates);
        console.log('[TaskEdit] 模板迁移后数量:', migratedTemplates.length);
        
        // 记录迁移前后的前几个模板，方便对比
        if (templates.length > 0) {
          console.log('[TaskEdit] 迁移前的前3个模板:', 
            templates.slice(0, 3).map(t => ({ id: t.id, title: t.title || t.name, createTime: t.createTime })));
        }
        
        if (migratedTemplates.length > 0) {
          console.log('[TaskEdit] 迁移后的前3个模板:', 
            migratedTemplates.slice(0, 3).map(t => ({ 
              id: t.id, 
              title: t.title, 
              createTime: t.createTime,
              isCustom: t.isCustom
            })));
        }
        
        // 检查是否有变更，如果有则保存回本地存储
        const templatesJson = JSON.stringify(templates);
        const migratedJson = JSON.stringify(migratedTemplates);
        if (templatesJson !== migratedJson) {
          console.log('[TaskEdit] 检测到模板数据结构变更，保存迁移后的数据');
          wx.setStorage({
            key: 'customTemplates',
            data: migratedTemplates,
            success: function() {
              console.log('[TaskEdit] 迁移后的模板数据保存成功');
            },
            fail: function(err) {
              console.error('[TaskEdit] 迁移后的模板数据保存失败:', err);
            }
          });
        }
        
        // 确保模板按创建/更新时间排序（新的在前）
        const sortedTemplates = [...migratedTemplates].sort((a, b) => {
          // 优先使用updateTime，如果没有则使用createTime
          const timeA = a.updateTime || a.createTime || 0;
          const timeB = b.updateTime || b.createTime || 0;
          return timeB - timeA; // 降序排列，最新的在前
        });
        
        console.log('[TaskEdit] 模板已按时间排序');
        
        // 记录排序后的前几个模板
        if (sortedTemplates.length > 0) {
          console.log('[TaskEdit] 排序后的前3个模板:', 
            sortedTemplates.slice(0, 3).map(t => ({
              id: t.id,
              title: t.title,
              time: t.updateTime || t.createTime,
              isCustom: t.isCustom
            })));
        }
        
        // 按类型分类模板
        const customStudyTemplates = sortedTemplates.filter(t => t.taskType === 'study');
        const customHabitTemplates = sortedTemplates.filter(t => t.taskType === 'habit');
        
        console.log('[TaskEdit] 学习模板数量:', customStudyTemplates.length, '习惯模板数量:', customHabitTemplates.length);
        console.log('[TaskEdit] 学习模板示例:', customStudyTemplates.length > 0 ? 
          JSON.stringify({
            id: customStudyTemplates[0].id,
            title: customStudyTemplates[0].title,
            time: customStudyTemplates[0].updateTime || customStudyTemplates[0].createTime,
            isCustom: customStudyTemplates[0].isCustom
          }) : '无');
        
        // 设置模板
        that.setData({
          studyTemplates: customStudyTemplates,
          habitTemplates: customHabitTemplates
        });
        
        console.log('[TaskEdit] 模板加载完成并设置到页面数据中');
      },
      fail: function(err) {
        console.log('[TaskEdit] 未找到自定义模板或加载失败:', err);
        // 如果失败了(可能是首次使用)，尝试初始化默认模板
        console.log('[TaskEdit] 可能是首次使用，初始化默认模板');
        that.initializeDefaultTemplates();
      }
    });
  },

  /**
   * 处理模板选择事件
   */
  handleTemplateSelect: function(e) {
    // 适配新的组件接口，确保能正确读取模板信息
    const template = e.detail.template || e.detail;
    console.log('[TaskEdit] 选择模板:', template);
    console.log('[TaskEdit] 选择模板详情 - ID:', template.id, '名称:', template.title || template.name, '任务类型:', template.taskType);
    
    // 兼容两种命名方案，优先使用title/name
    const title = template.title || template.name || '';
    const shortName = template.shortName || '';
    const description = template.description || template.desc || '';
    const points = template.points || (template.taskType === 'study' ? 3 : 2);
    
    console.log('[TaskEdit] 处理后的模板数据 - 标题:', title, '简称:', shortName, '描述:', description, '积分:', points);
    
    // 设置选中模板，并更新任务信息，默认为非编辑模式
    this.setData({
      selectedTemplate: template.id,
      selectedTemplateType: template.taskType,
      'task.title': title,
      'task.shortName': shortName,
      'task.description': description,
      'task.points': points,
      'task.taskType': template.taskType,
      'task.precision': template.precision || 'day',
      'task.isEditing': false, // 初始为非编辑模式
      customMode: false        // 退出自定义模式
    });
    
    // 根据任务类型设置相应属性
    if (template.taskType === 'study') {
      this.setData({
        taskType: 'study',
        'task.type': 'study',
        'task.icon': template.icon || '📚'
      });
      console.log('[TaskEdit] 设置为学习任务类型，图标:', template.icon || '📚');
    } else if (template.taskType === 'habit') {
      this.setData({
        taskType: 'habit',
        'task.type': 'habit',
        'task.icon': template.icon || '⏰'
      });
      console.log('[TaskEdit] 设置为习惯任务类型，图标:', template.icon || '⏰');
    }
    
    // 添加更详细的日志，跟踪任务类型值
    console.log('[TaskEdit] 模板选择后 - taskType:', this.data.taskType, 'selectedTemplateType:', this.data.selectedTemplateType, 'task.taskType:', this.data.task.taskType);
    
    // 如果是重复模式，确保任务设置正确
    if (this.data.repeatMode === 'repeat') {
      this.ensureRepeatTaskSettings();
    }
    
    // 添加轻微振动反馈
    wx.vibrateShort({ type: 'light' });
    
    console.log('[TaskEdit] 已选择模板，显示只读视图，不显示保存为常用任务按钮');
    
    // 添加最终状态日志，验证修复效果
    console.log('[TaskEdit] 模板选择完成 - 最终状态:', {
      title: this.data.task.title,
      description: this.data.task.description,
      points: this.data.task.points,
      taskType: this.data.taskType,
      isEditing: this.data.task.isEditing,
      customMode: this.data.customMode,
      selectedTemplate: this.data.selectedTemplate
    });
  },

  /**
   * 处理选择自定义任务事件
   */
  handleCustomSelect: function(e) {
    // 适配新的组件接口
    const type = e.detail.type || e.detail;
    console.log('[TaskEdit] 选择自定义任务, 类型:', type);
    
    if (type === 'study') {
      console.log('[TaskEdit] 创建自定义学习任务');
      this.selectCustomStudy();
    } else if (type === 'habit') {
      console.log('[TaskEdit] 创建自定义习惯任务');
      this.selectCustomHabit();
    }
    
    // 确保设置为自定义模式
    this.setData({
      customMode: true
    });
    
    // 如果有标签选择器，刷新标签
    if (this.loadTags) {
      this.loadTags();
      console.log('[TaskEdit] 刷新标签选择器');
    }
    
    // 自定义模式下允许保存为常用任务
    console.log('[TaskEdit] 进入自定义模式，允许保存为常用任务');
    
    // 添加轻微振动反馈
    wx.vibrateShort({ type: 'light' });
    
    // 记录当前任务状态
    console.log('[TaskEdit] 自定义任务状态:', {
      taskType: this.data.taskType,
      taskTitle: this.data.task.title || '未设置',
      isEditing: this.data.task.isEditing,
      customMode: true,
      selectedTemplate: this.data.selectedTemplate
    });
  },
  
  /**
   * 启用自定义模式
   */
  enableCustomMode: function(e) {
    const fromTemplate = e && e.detail && e.detail.fromTemplate;
    console.log('[TaskEdit] 从模板视图切换到编辑模式', fromTemplate ? '(由模板编辑触发)' : '');
    
    // 设置为编辑模式，并启用自定义模式
    this.setData({
      'task.isEditing': true, // 启用编辑状态
      customMode: true        // 启用自定义模式
    });
    
    // 记录更详细的状态信息
    console.log('[TaskEdit] 编辑模式状态更新: isEditing=true, customMode=true, selectedTemplate=', this.data.selectedTemplate);
    
    // 添加轻微振动反馈
    wx.vibrateShort({ type: 'light' });
    
    console.log('[TaskEdit] 允许编辑模板，显示保存为常用任务按钮');
  },

  /**
   * 切换重复频率
   */
  selectFrequency: function(e) {
    console.log('[TaskEdit] 接收到频率变更:', e.detail);
    
    this.setData({
      'task.repeat.type': e.detail.type,
      'task.repeat.days': e.detail.days
    });
  },

  /**
   * 更新重复日设置（用于组件事件处理）
   */
  updateRepeatDays: function(e) {
    console.log('[TaskEdit] 更新重复日:', e.detail.days);
    
    this.setData({
      'task.repeat.days': e.detail.days
    });
  },

  /**
   * 切换重复日期
   */
  toggleWeekday: function(e) {
    const day = e.currentTarget.dataset.day;
    const days = this.data.task.repeat.days || [];
    const index = days.indexOf(day);
    
    if (index === -1) {
      days.push(day);
    } else {
      days.splice(index, 1);
    }
    
    this.setData({
      'task.repeat.days': days
    });
    
    // 提供用户反馈
    if (days.length > 0) {
      const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
      const selectedDays = days.map(d => weekdays[d]).join('、');
      wx.showToast({
        title: `已选择：周${selectedDays}`,
        icon: 'none'
      });
    }
  },

  /**
   * 保存当前任务为模板
   */
  saveAsTemplate: function(e) {
    // 增强日志记录
    console.log('[TaskEdit] 保存为常用任务被触发', e ? e.detail : '直接调用');
    
    const { task } = this.data;
    const isFromTemplateEdit = this.data.selectedTemplate !== '' && task.isEditing;
    
    console.log('[TaskEdit] 来源:', isFromTemplateEdit ? '模板编辑' : '自定义创建');
    console.log('[TaskEdit] 当前任务信息:', task);
    
    // 校验必要信息
    if (!task.title || !task.title.trim()) {
      wx.showToast({
        title: '请先填写任务名称',
        icon: 'none'
      });
      console.log('[TaskEdit] 保存模板失败: 任务名称为空');
      return;
    }
    
    // 确保简称不超过4字符
    let shortName = task.shortName || '';
    if (!shortName) {
      // 如果没有简称，使用任务名前4个字
      shortName = task.title.substring(0, 4);
      console.log('[TaskEdit] 自动生成简称:', shortName);
    }
    
    // 创建模板对象
    let templateObj = {
      title: task.title,
      shortName: shortName,
      icon: this.data.taskType === 'study' ? '📚' : '⏰',
      description: task.description || '',
      duration: task.duration || 30,
      points: task.points || (this.data.taskType === 'study' ? 3 : 2),
      taskType: this.data.taskType,
      isCustom: true
    };
    
    // 如果是从模板编辑，保留原模板ID；否则创建新ID
    if (isFromTemplateEdit) {
      templateObj.id = this.data.selectedTemplate;
      console.log('[TaskEdit] 更新现有模板:', templateObj.id);
    } else {
      // 使用统一的UUID生成方法
      templateObj.id = this.generateUUID();
      templateObj.createTime = Date.now();
      console.log('[TaskEdit] 创建新模板，ID:', templateObj.id, '创建时间:', templateObj.createTime);
    }
    
    // 显示加载状态
    wx.showLoading({
      title: '保存中...',
      mask: true
    });
    
    // 获取现有模板
    wx.getStorage({
      key: 'customTemplates',
      success: (res) => {
        let templates = res.data || [];
        console.log('[TaskEdit] 已加载现有模板数量:', templates.length);
        
        // 记录保存前的模板顺序
        if (templates.length > 0) {
          console.log('[TaskEdit] 保存前的前3个模板:', 
            templates.slice(0, 3).map(t => ({ id: t.id, title: t.title, createTime: t.createTime })));
        }
        
        if (isFromTemplateEdit) {
          // 从模板编辑模式：通过ID查找并更新
          const templateIndex = templates.findIndex(t => t.id === templateObj.id);
          if (templateIndex !== -1) {
            // 保留原有的createTime
            templateObj.createTime = templates[templateIndex].createTime;
            // 设置updateTime来标记更新时间
            templateObj.updateTime = Date.now();
            // 更新模板
            templates[templateIndex] = templateObj;
            console.log('[TaskEdit] 更新了现有模板, index:', templateIndex);
            
            // 将更新的模板移到列表前面
            if (templateIndex > 0) {
              // 先移除该模板
              const updatedTemplate = templates.splice(templateIndex, 1)[0];
              // 再插入到列表头部
              templates.unshift(updatedTemplate);
              console.log('[TaskEdit] 将更新的模板移到列表前面');
            }
          } else {
            // 未找到原模板，作为新模板处理
            templateObj.createTime = Date.now();
            templates.unshift(templateObj);
            console.log('[TaskEdit] 原模板未找到，添加为新模板');
          }
        } else {
          // 自定义创建模式：检查是否有同名模板
          const existingIndex = templates.findIndex(t => 
            // 使用title字段进行比较，而不是name
            (t.title === templateObj.title) && 
            (t.taskType === templateObj.taskType)
          );
          
          if (existingIndex !== -1) {
            console.log('[TaskEdit] 发现同名模板，索引:', existingIndex, '标题:', templates[existingIndex].title);
            // 保留原有ID和创建时间，但更新内容
            templateObj.id = templates[existingIndex].id;
            templateObj.createTime = templates[existingIndex].createTime;
            templateObj.updateTime = Date.now();
            // 移除已存在的同名模板
            templates.splice(existingIndex, 1);
            console.log('[TaskEdit] 已移除同名模板，准备添加更新版本');
          }
          
          // 将新模板添加到列表前端
          templates.unshift(templateObj);
          console.log('[TaskEdit] 新模板已添加到列表头部');
        }
        
        // 确保模板数量不超过100
        if (templates.length > 100) {
          const removedTemplate = templates.pop();
          console.log('[TaskEdit] 模板数量超过100个，移除最旧模板:', removedTemplate.title || removedTemplate.name);
        }
        
        // 记录保存后的模板顺序
        if (templates.length > 0) {
          console.log('[TaskEdit] 保存后的前3个模板:', 
            templates.slice(0, 3).map(t => ({ id: t.id, title: t.title, createTime: t.createTime })));
        }
        
        wx.setStorage({
          key: 'customTemplates',
          data: templates,
          success: () => {
            wx.hideLoading();
            wx.showToast({
              title: '已保存为常用任务',
              icon: 'success'
            });
            // 刷新模板列表
            this.loadTemplatesByCategory();
            
            // 保存后重置为只读状态，无论是从模板编辑还是自定义创建
            this.setData({
              'task.isEditing': false,
              customMode: false,       // 退出自定义模式
              selectedTemplate: templateObj.id // 设置为选中状态，确保按钮隐藏
            });
            console.log('[TaskEdit] 保存模板后状态重置: isEditing=false, customMode=false, selectedTemplate=', templateObj.id);
          },
          fail: (err) => {
            wx.hideLoading();
            console.error('[TaskEdit] 模板保存失败:', err);
            wx.showToast({
              title: '保存模板失败',
              icon: 'none'
            });
          }
        });
      },
      fail: () => {
        console.log('[TaskEdit] 首次创建模板存储');
        
        // 确保新模板有createTime
        templateObj.createTime = Date.now();
        
        wx.setStorage({
          key: 'customTemplates',
          data: [templateObj],
          success: () => {
            wx.hideLoading();
            wx.showToast({
              title: '已保存为常用任务',
              icon: 'success'
            });
            // 刷新模板列表
            this.loadTemplatesByCategory();
            
            // 保存后重置为只读状态，无论是从模板编辑还是自定义创建
            this.setData({
              'task.isEditing': false,
              customMode: false,       // 退出自定义模式
              selectedTemplate: templateObj.id // 设置为选中状态，确保按钮隐藏
            });
            console.log('[TaskEdit] 保存模板后状态重置: isEditing=false, customMode=false, selectedTemplate=', templateObj.id);
          },
          fail: (err) => {
            wx.hideLoading();
            console.error('[TaskEdit] 模板保存失败:', err);
            wx.showToast({
              title: '保存模板失败',
              icon: 'none'
            });
          }
        });
      }
    });
  },

  /**
   * 生成UUID用于模板ID
   */
  generateUUID: function() {
    return 'template_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  },

  /**
   * 迁移模板数据结构，统一字段命名
   */
  migrateTemplateStructure: function(templates) {
    console.log('[TaskEdit] 开始迁移模板数据结构，统一字段命名');
    
    return templates.map(template => {
      // 克隆模板对象
      const updated = { ...template };
      
      // 确保有ID
      if (!updated.id) {
        updated.id = this.generateUUID();
        console.log('[TaskEdit] 模板迁移 - 添加ID:', updated.id);
      }
      
      // 处理title/name字段
      if (template.name && !template.title) {
        updated.title = template.name;
        console.log('[TaskEdit] 模板迁移 - 从name字段创建title字段:', template.name);
      }
      
      // 处理description/desc字段
      if (template.desc && !template.description) {
        updated.description = template.desc;
        console.log('[TaskEdit] 模板迁移 - 从desc字段创建description字段:', template.desc);
      }
      
      // 确保有积分字段
      if (!updated.points) {
        updated.points = template.taskType === 'study' ? 3 : 2;
        console.log('[TaskEdit] 模板迁移 - 添加默认积分:', updated.points);
      }
      
      // 确保有简称
      if (!updated.shortName) {
        updated.shortName = updated.title ? updated.title.substring(0, 4) : '';
        console.log('[TaskEdit] 模板迁移 - 添加默认简称:', updated.shortName);
      }
      
      // 确保有createTime字段
      if (!updated.createTime) {
        // 如果没有创建时间，设置一个默认值（早于当前时间）
        // 使用一个较早的时间，确保新创建的模板会排在前面
        updated.createTime = Date.now() - (templates.length * 1000);
        console.log('[TaskEdit] 模板迁移 - 添加默认创建时间:', updated.createTime);
      }
      
      // 确保有isCustom标志，默认设为true允许长按操作
      if (updated.isCustom === undefined) {
        updated.isCustom = true;
        console.log('[TaskEdit] 模板迁移 - 添加isCustom标志为true，允许长按操作');
      }
      
      // 标记为迁移后的模板
      updated.migrated = true;
      
      return updated;
    });
  },

  /**
   * 初始化任务概览数据
   */
  initTaskOverview: function() {
    // 设置当前日期为默认日期
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const dateStr = `${year}-${month < 10 ? '0' + month : month}-${day < 10 ? '0' + day : day}`;
    
    this.setData({
      overviewDay: dateStr,
      monthTitle: `${year}年${month}月`
    });
    
    // 计算周日期范围
    this.calculateWeekRange(now);
    
    // 加载各视图数据
    this.loadDayViewData(dateStr);
    this.loadWeekViewData(now);
    this.loadMonthViewData(year, month);
  },

  /**
   * 切换视图类型
   */
  switchView: function(e) {
    const view = e.currentTarget.dataset.view;
    this.setData({
      activeView: view
    });
  },

  /**
   * 前一天
   */
  prevDay: function() {
    const currentDate = new Date(this.data.overviewDay);
    currentDate.setDate(currentDate.getDate() - 1);
    const dateStr = this.formatDate(currentDate);
    
    this.setData({
      overviewDay: dateStr
    });
    
    this.loadDayViewData(dateStr);
  },

  /**
   * 后一天
   */
  nextDay: function() {
    const currentDate = new Date(this.data.overviewDay);
    currentDate.setDate(currentDate.getDate() + 1);
    const dateStr = this.formatDate(currentDate);
    
    this.setData({
      overviewDay: dateStr
    });
    
    this.loadDayViewData(dateStr);
  },

  /**
   * 前一周
   */
  prevWeek: function() {
    const startDate = new Date(this.data.weekData.days[0].date);
    startDate.setDate(startDate.getDate() - 7);
    
    this.calculateWeekRange(startDate);
    this.loadWeekViewData(startDate);
  },

  /**
   * 后一周
   */
  nextWeek: function() {
    const startDate = new Date(this.data.weekData.days[0].date);
    startDate.setDate(startDate.getDate() + 7);
    
    this.calculateWeekRange(startDate);
    this.loadWeekViewData(startDate);
  },

  /**
   * 前一月
   */
  prevMonth: function() {
    const [year, month] = this.data.monthTitle.match(/(\d+)年(\d+)月/).slice(1).map(Number);
    let newYear = year;
    let newMonth = month - 1;
    
    if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    }
    
    this.setData({
      monthTitle: `${newYear}年${newMonth}月`
    });
    
    this.loadMonthViewData(newYear, newMonth);
  },

  /**
   * 后一月
   */
  nextMonth: function() {
    const [year, month] = this.data.monthTitle.match(/(\d+)年(\d+)月/).slice(1).map(Number);
    let newYear = year;
    let newMonth = month + 1;
    
    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    }
    
    this.setData({
      monthTitle: `${newYear}年${newMonth}月`
    });
    
    this.loadMonthViewData(newYear, newMonth);
  },

  /**
   * 从周视图点击日期跳转到日视图
   */
  switchToDayViewFromWeek: function(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    
    // 设置为日视图
    this.setData({
      activeView: 'day',
      overviewDay: date
    });
    
    // 加载该日期的任务数据
    this.loadDayViewData(date);
    
    // 轻微的反馈效果
    wx.vibrateShort({
      type: 'light'
    });
  },

  /**
   * 从月视图点击日期跳转到日视图
   */
  switchToDayViewFromMonth: function(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    
    // 设置任务日期为所选日期（原来的功能保留）
    this.setData({
      'task.date': date,
      activeView: 'day',
      overviewDay: date
    });
    
    // 更新日视图数据
    this.loadDayViewData(date);
    
    // 更新任务负载预测
    this.updateTaskLoadPreview();
    
    // 轻微的反馈效果
    wx.vibrateShort({
      type: 'light'
    });
  },

  /**
   * 计算周日期范围
   */
  calculateWeekRange: function(date) {
    const startDate = new Date(date);
    // 调整到当周周日
    const day = startDate.getDay();
    startDate.setDate(startDate.getDate() - day);
    
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    
    const startStr = this.formatDate(startDate);
    const endStr = this.formatDate(endDate);
    
    this.setData({
      weekRange: `${startStr} ~ ${endStr}`
    });
  },

  

  /**
   * 获取星期几
   */
  getWeekday: function(dateStr) {
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const date = new Date(dateStr);
    return weekdays[date.getDay()];
  },

  /**
   * 从日历中选择日期
   */
  selectDateFromCalendar: function(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    
    // 设置任务日期为所选日期
    this.setData({
      'task.date': date,
      overviewDay: date
    });
    
    // 更新日视图数据
    this.loadDayViewData(date);
    
    // 更新任务负载预测
    this.updateTaskLoadPreview();
  },

  /**
   * 选择概览日期
   */
  selectOverviewDate: function() {
    wx.showToast({
      title: '长按可选择日期',
      icon: 'none'
    });
  },

  /**
   * 加载日视图数据
   */
  loadDayViewData: function(dateStr) {
    // 获取存储的任务数据
    wx.getStorage({
      key: 'taskData',
      success: res => {
        const tasks = res.data || [];
        
        // 过滤出该日期的任务
        const dayTasks = tasks.filter(t => t.date === dateStr);
        
        // 添加当前编辑中但未保存的任务（如果日期匹配）
        const currentTask = this.data.task;
        if (currentTask && currentTask.date === dateStr && 
            !dayTasks.some(t => t.id === currentTask.id)) {
          console.log('[task-edit] 在日视图中添加当前编辑任务:', currentTask.title);
          dayTasks.push({...currentTask, isCurrentEditing: true});
        }
        
        // 计算该日期的任务总时长
        const totalMinutes = dayTasks.reduce((sum, t) => sum + (t.duration || 0), 0);
        
        // 识别重复任务
        const repeatedTasks = this.identifyRepeatedTasks(tasks, dateStr);
        
        // 按开始时间排序
        dayTasks.sort((a, b) => {
          if (!a.startTime) return 1;
          if (!b.startTime) return -1;
          return a.startTime.localeCompare(b.startTime);
        });
        
        // 为任务添加重复标记
        const tasksWithMark = dayTasks.map(task => {
          return {
            ...task,
            isRepeated: repeatedTasks.includes(task.id)
          };
        });
        
        // 分析负载状态
        let status = 'light';
        let message = '任务量较轻松';
        
        // 根据小朋友年龄段计算推荐负载上限
        const app = getApp();
        const ageGroup = app?.globalData?.ageGroup || '6-8';
        let recommendedLimit = 90; // 默认90分钟
        
        switch (ageGroup) {
          case '3-5':
            recommendedLimit = 60; // 3-5岁 最多1小时
            break;
          case '6-8':
            recommendedLimit = 90; // 6-8岁 最多1.5小时
            break;
          case '9-12':
            recommendedLimit = 120; // 9-12岁 最多2小时
            break;
        }
        
        // 计算负载百分比
        const percentage = Math.min(Math.round((totalMinutes / recommendedLimit) * 100), 100);
        
        if (totalMinutes < recommendedLimit * 0.7) {
          status = 'light';
          message = '任务量较轻松';
        } else if (totalMinutes <= recommendedLimit * 1.2) {
          status = 'normal';
          message = '任务量适中';
        } else {
          status = 'heavy';
          message = '任务量偏多';
        }
        
        this.setData({
          'dayData.totalTasks': dayTasks.length,
          'dayData.totalMinutes': totalMinutes,
          'dayData.status': status,
          'dayData.percentage': percentage,
          'dayData.message': message,
          'dayData.tasks': tasksWithMark
        });
      },
      fail: () => {
        // 若无数据则设置为空
        this.setData({
          'dayData.totalTasks': 0,
          'dayData.totalMinutes': 0,
          'dayData.status': 'light',
          'dayData.percentage': 0,
          'dayData.message': '暂无任务',
          'dayData.tasks': []
        });
      }
    });
  },

  /**
   * 加载周视图数据
   */
  loadWeekViewData: function(startDate) {
    // 获取存储的任务数据
    wx.getStorage({
      key: 'taskData',
      success: res => {
        const tasks = res.data || [];
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const today = this.formatDate(new Date());
        
        // 计算周视图的7天数据
        const days = [];
        let totalTasks = 0;
        
        for (let i = 0; i < 7; i++) {
          const date = new Date(startDate);
          date.setDate(date.getDate() - date.getDay() + i);
          const dateStr = this.formatDate(date);
          
          // 过滤出该日期的任务
          const dayTasks = tasks.filter(t => t.date === dateStr);
          const taskCount = dayTasks.length;
          totalTasks += taskCount;
          
          // 按任务类型分组计算比例
          const tasksByType = [];
          const typeMap = {};
          
          dayTasks.forEach(task => {
            const type = task.type || 'study';
            if (!typeMap[type]) {
              typeMap[type] = {
                type: type,
                count: 0,
                minutes: 0,
                percentage: 0
              };
            }
            
            typeMap[type].count++;
            typeMap[type].minutes += (task.duration || 0);
          });
          
          // 计算总时长
          const totalMinutes = Object.values(typeMap).reduce((sum, t) => sum + t.minutes, 0);
          
          // 计算各类型任务的比例
          Object.values(typeMap).forEach(t => {
            t.percentage = totalMinutes > 0 ? (t.minutes / totalMinutes) * 100 : 0;
          });
          
          days.push({
            date: dateStr,
            day: date.getDate(),
            weekday: weekdays[date.getDay()],
            isToday: dateStr === today,
            totalTasks: taskCount,
            tasksByType: Object.values(typeMap)
          });
        }
        
        this.setData({
          'weekData.totalTasks': totalTasks,
          'weekData.avgTasksPerDay': Math.round(totalTasks / 7 * 10) / 10,
          'weekData.days': days
        });
      },
      fail: () => {
        // 若无数据则设置为空
        this.setData({
          'weekData.totalTasks': 0,
          'weekData.avgTasksPerDay': 0,
          'weekData.days': []
        });
      }
    });
  },

  /**
   * 加载月视图数据
   */
  loadMonthViewData: function(year, month) {
    // 获取存储的任务数据
    wx.getStorage({
      key: 'taskData',
      success: res => {
        const tasks = res.data || [];
        const today = this.formatDate(new Date());
        
        // 获取当月第一天是周几
        const firstDay = new Date(year, month - 1, 1).getDay();
        
        // 获取当月总天数
        const lastDate = new Date(year, month, 0).getDate();
        
        // 计算上个月最后几天
        const prevMonthLastDate = new Date(year, month - 1, 0).getDate();
        
        // 构建月历数据
        const weeks = [];
        let week = [];
        let totalTasks = 0;
        let completedTasks = 0;
        
        // 添加上个月末尾的几天
        for (let i = 0; i < firstDay; i++) {
          const day = prevMonthLastDate - firstDay + i + 1;
          let prevMonth = month - 1;
          let prevYear = year;
          
          if (prevMonth < 1) {
            prevMonth = 12;
            prevYear--;
          }
          
          const dateStr = `${prevYear}-${prevMonth < 10 ? '0' + prevMonth : prevMonth}-${day < 10 ? '0' + day : day}`;
          
          // 获取该日期的任务
          const dateTasks = tasks.filter(t => t.date === dateStr);
          const repeatedTypes = this.getRepeatedTaskTypes(tasks, dateStr);
          
          week.push({
            date: dateStr,
            day: day,
            isCurrentMonth: false,
            isToday: dateStr === today,
            taskCount: dateTasks.length,
            heatLevel: this.calculateHeatLevel(dateTasks),
            repeatedTasks: repeatedTypes
          });
        }
        
        // 添加当月的天数
        for (let i = 1; i <= lastDate; i++) {
          const dateStr = `${year}-${month < 10 ? '0' + month : month}-${i < 10 ? '0' + i : i}`;
          
          // 获取该日期的任务
          const dateTasks = tasks.filter(t => t.date === dateStr);
          const repeatedTypes = this.getRepeatedTaskTypes(tasks, dateStr);
          
          // 累计任务总数和已完成数
          totalTasks += dateTasks.length;
          completedTasks += dateTasks.filter(t => t.status === 1).length;
          
          week.push({
            date: dateStr,
            day: i,
            isCurrentMonth: true,
            isToday: dateStr === today,
            taskCount: dateTasks.length,
            heatLevel: this.calculateHeatLevel(dateTasks),
            repeatedTasks: repeatedTypes
          });
          
          // 一周结束或月末
          if (week.length === 7 || i === lastDate) {
            // 如果一周未满7天，添加下个月开始的几天
            while (week.length < 7) {
              const nextDay = week.length - firstDay + 1;
              let nextMonth = month + 1;
              let nextYear = year;
              
              if (nextMonth > 12) {
                nextMonth = 1;
                nextYear++;
              }
              
              const dateStr = `${nextYear}-${nextMonth < 10 ? '0' + nextMonth : nextMonth}-${nextDay < 10 ? '0' + nextDay : nextDay}`;
              
              // 获取该日期的任务
              const dateTasks = tasks.filter(t => t.date === dateStr);
              const repeatedTypes = this.getRepeatedTaskTypes(tasks, dateStr);
              
              week.push({
                date: dateStr,
                day: nextDay,
                isCurrentMonth: false,
                isToday: dateStr === today,
                taskCount: dateTasks.length,
                heatLevel: this.calculateHeatLevel(dateTasks),
                repeatedTasks: repeatedTypes
              });
            }
            
            weeks.push(week);
            week = [];
          }
        }
        
        this.setData({
          'monthData.totalTasks': totalTasks,
          'monthData.completedTasks': completedTasks,
          'monthData.weeks': weeks
        });
      },
      fail: () => {
        // 若无数据则设置为空
        this.setData({
          'monthData.totalTasks': 0,
          'monthData.completedTasks': 0,
          'monthData.weeks': []
        });
      }
    });
  },

  /**
   * 计算热力图级别
   * 根据任务数量和总时长计算热力值
   */
  calculateHeatLevel: function(tasks) {
    if (!tasks || tasks.length === 0) return 0;
    
    // 计算任务总时长
    const totalMinutes = tasks.reduce((sum, t) => sum + (t.duration || 0), 0);
    
    // 根据任务时长和数量综合计算热力值
    const countFactor = Math.min(tasks.length / 5, 1);
    const timeFactor = Math.min(totalMinutes / 180, 1);
    
    // 热力值为时长因子和数量因子的加权平均
    return (timeFactor * 0.7 + countFactor * 0.3).toFixed(2);
  },

  /**
   * 识别重复任务
   * 返回重复任务的ID数组
   */
  identifyRepeatedTasks: function(allTasks, dateStr) {
    const repeatedIds = [];
    const targetDateTasks = allTasks.filter(t => t.date === dateStr);
    
    targetDateTasks.forEach(task => {
      // 查找不同日期但标题相同的任务
      const similarTasks = allTasks.filter(t => 
        t.id !== task.id && 
        t.title === task.title &&
        t.date !== dateStr
      );
      
      if (similarTasks.length > 0) {
        repeatedIds.push(task.id);
      }
    });
    
    return repeatedIds;
  },

  /**
   * 获取重复任务类型
   * 返回重复任务的类型数组
   */
  getRepeatedTaskTypes: function(allTasks, dateStr) {
    const repeatedTypes = new Set();
    const targetDateTasks = allTasks.filter(t => t.date === dateStr);
    
    targetDateTasks.forEach(task => {
      // 查找不同日期但标题相同的任务
      const similarTasks = allTasks.filter(t => 
        t.id !== task.id && 
        t.title === task.title &&
        t.date !== dateStr
      );
      
      if (similarTasks.length > 0) {
        repeatedTypes.add(task.type || 'study');
      }
    });
    
    return Array.from(repeatedTypes);
  },

  /**
   * 输入积分
   */
  /**
   * 选择难度
   */
  selectDifficulty: function(e) {
    const index = e.detail.value;
    const difficulty = this.data.difficultyOptions[index];
    
    this.setData({
      difficultyIndex: index,
      'task.difficulty': difficulty
    });
  },

  /**
   * 处理学习任务模板选择
   */
  handleStudyTemplateSelect: function(e) {
    const templateId = e.detail.templateId;
    const template = e.detail.template;
    
    console.log('选择了学习任务模板:', templateId, template.name);
    
    // 更新任务类型和模板选择
    this.setData({
      taskType: 'study',
      selectedTemplate: templateId,
      selectedTemplateType: 'study',
      customMode: false,
      'task.title': template.name,
      'task.shortName': template.shortName || template.name.substring(0, 4),
      'task.description': template.description || '',
      'task.points': template.points,
      'task.type': 'study',
      'task.taskType': 'study',
      'task.precision': 'second'
    });
    
    // 设置默认时间(如果未设置)
    if (!this.data.task.startTime) {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      
      // 使用模板持续时间或默认30分钟
      const duration = template.duration || 30;
      let endMinutes = minutes + duration;
      let endHours = hours + Math.floor(endMinutes / 60);
      endMinutes = endMinutes % 60;
      
      this.setData({
        'task.startTime': `${hours}:${minutes}`,
        'task.endTime': `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`,
        'task.duration': duration
      });
    }
    
    // 处理重复任务设置
    this.ensureRepeatTaskSettings();
    
    // 提供反馈
    wx.vibrateShort({ type: 'light' });
  },

  /**
   * 处理习惯任务模板选择
   */
  handleHabitTemplateSelect: function(e) {
    const templateId = e.detail.templateId;
    const template = e.detail.template;
    
    console.log('选择了生活习惯模板:', templateId, template.name);
    
    // 更新任务类型和模板选择
    this.setData({
      taskType: 'habit',
      selectedTemplate: templateId,
      selectedTemplateType: 'habit',
      customMode: false,
      'task.title': template.name,
      'task.shortName': template.shortName || template.name.substring(0, 4),
      'task.description': template.description || '',
      'task.points': template.points,
      'task.type': 'habit',
      'task.taskType': 'habit',
      'task.precision': 'day',
      'task.startTime': '',
      'task.endTime': '',
      'task.duration': 0
    });
    
    // 处理重复任务设置
    this.ensureRepeatTaskSettings();
    
    // 提供反馈
    wx.vibrateShort({ type: 'light' });
  },

  /**
   * 处理学习任务自定义选择
   */
  handleStudyCustomSelect: function(e) {
    console.log('选择自定义学习任务');
    
    this.setData({
      taskType: 'study',
      selectedTemplate: '',
      selectedTemplateType: 'study',
      customMode: true,
      'task.title': '',
      'task.shortName': '',
      'task.description': '',
      'task.type': 'study',
      'task.taskType': 'study',
      'task.precision': 'second',
      'task.points': 3
    });
    
    // 设置默认时间
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    
    // 默认30分钟
    let endMinutes = minutes + 30;
    let endHours = hours + Math.floor(endMinutes / 60);
    endMinutes = endMinutes % 60;
    
    this.setData({
      'task.startTime': `${hours}:${minutes}`,
      'task.endTime': `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`,
      'task.duration': 30
    });
    
    // 处理重复任务设置
    this.ensureRepeatTaskSettings();
  },

  /**
   * 处理习惯任务自定义选择
   */
  handleHabitCustomSelect: function(e) {
    console.log('选择自定义生活习惯');
    
    this.setData({
      taskType: 'habit',
      selectedTemplate: '',
      selectedTemplateType: 'habit',
      customMode: true,
      'task.title': '',
      'task.shortName': '',
      'task.description': '',
      'task.type': 'habit',
      'task.taskType': 'habit',
      'task.precision': 'day',
      'task.points': 2,
      'task.startTime': '',
      'task.endTime': '',
      'task.duration': 0
    });
    
    // 处理重复任务设置
    this.ensureRepeatTaskSettings();
  },


  /**
   * 检查任务类型显示状态
   * 用于调试任务类型指示器的显示问题
   */
  checkTaskTypeDisplay: function() {
    console.log('任务类型指示器状态检查:');
    console.log('- selectedTemplateType:', this.data.selectedTemplateType);
    console.log('- taskType:', this.data.taskType);
    console.log('- task.type:', this.data.task.type);
    console.log('- task.taskType:', this.data.task.taskType);
    console.log('- customMode:', this.data.customMode);
    
    // 显示指示器条件
    const shouldShowIndicator = !!this.data.selectedTemplateType;
    console.log('- 指示器是否应显示:', shouldShowIndicator);
    console.log('- 指示器显示的文本:', 
      this.data.selectedTemplateType === 'study' ? '学习' : 
      (this.data.selectedTemplateType === 'habit' ? '习惯' : 
      (this.data.selectedTemplateType === 'interest' ? '兴趣' : '未知'))
    );
  },

  // 日视图任务完成事件处理
  onDayTaskComplete: function(e) {
    console.log('日视图任务完成:', e.detail.taskId);
    // 这里可以添加任务完成的处理逻辑
    // 由于这是概览，可能仅需跳转到相应页面或显示提示
    wx.showToast({
      title: '请在任务页面完成',
      icon: 'none'
    });
  },
  
  // 日视图任务编辑事件处理
  onDayTaskEdit: function(e) {
    console.log('日视图任务编辑:', e.detail.taskId);
    const taskId = e.detail.taskId;
    // 跳转到任务编辑页面
    wx.navigateTo({
      url: '/pages/task-edit/task-edit?id=' + taskId + '&mode=edit'
    });
  },

  /**
   * 处理编辑模板简称事件
   */
  handleEditShortName: function(e) {
    console.log('[TaskEdit] 编辑模板简称:', e.detail);
    
    const { id, value, type } = e.detail;
    console.log('[TaskEdit] 编辑模板 ID:', id, '新简称:', value, '类型:', type);
    
    // 获取当前模板数据
    wx.getStorage({
      key: 'customTemplates',
      success: (res) => {
        let templates = res.data || [];
        
        // 查找并更新模板
        const index = templates.findIndex(t => t.id === id);
        if (index !== -1) {
          templates[index].shortName = value;
          
          // 保存更新后的模板
          wx.setStorage({
            key: 'customTemplates',
            data: templates,
            success: () => {
              console.log('[TaskEdit] 模板简称更新成功');
              wx.showToast({
                title: '更新成功',
                icon: 'success'
              });
              
              // 刷新模板列表
              this.loadTemplatesByCategory();
            }
          });
        } else {
          console.log('[TaskEdit] 未找到要编辑的模板:', id);
        }
      },
      fail: (err) => {
        console.error('[TaskEdit] 获取模板数据失败:', err);
      }
    });
  },

  /**
   * 处理删除模板
   */
  handleDeleteTemplate: function(e) {
    console.log('[task-edit] 删除模板:', e.detail);
    const { templateId, type } = e.detail;
    
    // 获取原有模板数据
    wx.getStorage({
      key: 'customTemplates',
      success: (res) => {
        let templates = res.data || [];
        
        // 过滤掉要删除的模板
        templates = templates.filter(t => t.id !== templateId);
        
        // 保存更新后的模板
        wx.setStorage({
          key: 'customTemplates',
          data: templates,
          success: () => {
            console.log('[task-edit] 模板删除成功');
            wx.showToast({
              title: '已删除',
              icon: 'success'
            });
            
            // 刷新模板列表
            this.loadTemplatesByCategory();
          }
        });
      }
    });
  },

  /**
   * 选择自定义学习任务
   */
  selectCustomStudy: function() {
    console.log('[TaskEdit] 选择自定义学习任务');
    
    this.setData({
      taskType: 'study',
      selectedTemplate: '',
      selectedTemplateType: 'study',
      'task.title': '',
      'task.shortName': '',
      'task.description': '',
      'task.type': 'study',
      'task.taskType': 'study',
      'task.precision': 'second',
      'task.points': 3,
      'task.startTime': '',
      'task.endTime': '',
      'task.duration': 0,
      'task.isEditing': true, // 自定义模式下设置为编辑状态
      customMode: true        // 明确设置为自定义模式
    });
    
    // 添加日志记录值
    console.log('[TaskEdit] 自定义学习任务 - taskType:', this.data.taskType, 'selectedTemplateType:', this.data.selectedTemplateType);
    
    // 处理重复任务设置
    this.ensureRepeatTaskSettings();
  },

  /**
   * 选择自定义生活习惯
   */
  selectCustomHabit: function() {
    console.log('[TaskEdit] 选择自定义生活习惯');
    
    this.setData({
      taskType: 'habit',
      selectedTemplate: '',
      selectedTemplateType: 'habit',
      'task.title': '',
      'task.shortName': '',
      'task.description': '',
      'task.type': 'habit',
      'task.taskType': 'habit',
      'task.precision': 'day',
      'task.points': 2,
      'task.startTime': '',
      'task.endTime': '',
      'task.duration': 0,
      'task.isEditing': true, // 自定义模式下设置为编辑状态
      customMode: true        // 明确设置为自定义模式
    });
    
    // 添加日志记录值
    console.log('[TaskEdit] 自定义生活习惯 - taskType:', this.data.taskType, 'selectedTemplateType:', this.data.selectedTemplateType);
    
    // 处理重复任务设置
    this.ensureRepeatTaskSettings();
  },

  /**
   * 格式化日期为YYYY-MM-DD格式
   */
  formatDate: function(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * 显示日历选择器
   */
  showCalendarPicker: function() {
    // 触感反馈
    wx.vibrateShort({ type: 'medium' });
    
    // 记录日志
    console.log('[TaskEdit] 长按日期，显示日历选择器');
    
    this.setData({ showCalendar: true });
  },

  /**
   * 关闭日历选择器
   */
  closeCalendarPicker: function() {
    // 记录日志
    console.log('[TaskEdit] 关闭日历选择器');
    
    this.setData({ showCalendar: false });
  },

  /**
   * 确认日历选择的日期
   */
  confirmCalendarDate: function(e) {
    const { date } = e.detail;
    
    // 记录日志
    console.log('[TaskEdit] 确认选择日期:', date);
    
    // 更新页面数据
    this.setData({
      overviewDay: date,
      showCalendar: false
    });
    
    // 加载该日期的任务数据
    this.loadDayViewData(date);
  },

  /**
   * 初始化默认模板
   */
  initializeDefaultTemplates: function() {
    console.log('[TaskEdit] 开始初始化默认模板');
    const that = this;
    
    // 定义默认模板
    const defaultTemplates = [
      // 学习任务模板
      {
        id: 'default_study_1',
        taskType: 'study',
        title: '单词记忆',
        shortName: '单词',
        description: '记忆英语单词10个', // 使用description替代desc
        points: 3,
        star: false,
        isCustom: true  // 添加isCustom标志，允许长按操作
      },
      {
        id: 'default_study_2',
        taskType: 'study',
        title: '阅读文章',
        shortName: '阅读',
        description: '阅读一篇英语文章',
        points: 3,
        star: false,
        isCustom: true  // 添加isCustom标志，允许长按操作
      },
      {
        id: 'default_study_3',
        taskType: 'study',
        title: '听力训练',
        shortName: '听力',
        description: '英语听力练习15分钟',
        points: 3,
        star: false,
        isCustom: true  // 添加isCustom标志，允许长按操作
      },
      
      // 习惯任务模板
      {
        id: 'default_habit_1',
        taskType: 'habit',
        title: '做运动',
        shortName: '运动',
        description: '进行15分钟的运动',
        points: 2,
        star: false,
        isCustom: true  // 添加isCustom标志，允许长按操作
      },
      {
        id: 'default_habit_2',
        taskType: 'habit',
        title: '整理床铺',
        shortName: '整理',
        description: '保持床铺整洁',
        points: 2,
        star: false,
        isCustom: true  // 添加isCustom标志，允许长按操作
      },
      {
        id: 'default_habit_3',
        taskType: 'habit',
        title: '打扫房间',
        shortName: '打扫',
        description: '清扫房间保持整洁',
        points: 2,
        star: false,
        isCustom: true  // 添加isCustom标志，允许长按操作
      }
    ];
    
    // 保存默认模板到本地存储
    wx.setStorage({
      key: 'customTemplates',
      data: defaultTemplates,
      success: function() {
        console.log('[TaskEdit] 默认模板初始化成功，数量:', defaultTemplates.length);
        
        // 分类并设置模板数据
        const studyTemplates = defaultTemplates.filter(t => t.taskType === 'study');
        const habitTemplates = defaultTemplates.filter(t => t.taskType === 'habit');
        
        console.log('[TaskEdit] 默认学习模板数量:', studyTemplates.length, '默认习惯模板数量:', habitTemplates.length);
        console.log('[TaskEdit] 默认模板数据示例:', JSON.stringify(defaultTemplates[0]).substring(0, 100) + '...');
        
        that.setData({
          studyTemplates: studyTemplates,
          habitTemplates: habitTemplates
        });
        
        console.log('[TaskEdit] 默认模板已设置到页面数据中');
      },
      fail: function(err) {
        console.error('[TaskEdit] 默认模板初始化失败:', err);
        // 即使存储失败，也设置内存中的默认模板以确保用户体验
        const studyTemplates = defaultTemplates.filter(t => t.taskType === 'study');
        const habitTemplates = defaultTemplates.filter(t => t.taskType === 'habit');
        
        that.setData({
          studyTemplates: studyTemplates,
          habitTemplates: habitTemplates
        });
        
        console.log('[TaskEdit] 默认模板设置到内存中（存储失败但保证用户体验）');
      }
    });
  },
}) 