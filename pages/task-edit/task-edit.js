const app = getApp();
const taskManager = require('../../utils/taskManager.js');

Page({
  /**
   * 页面的初始数据
   */
  data: {
    mode: 'create', // 'create' 或 'edit'
    taskType: 'study', // 'study' 或 'habit'
    precision: 'second', // 'second' 或 'day'
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
      updateTime: 0
    },
    taskTemplates: [], // 任务模板列表
    studyTemplates: [], // 学习任务模板
    habitTemplates: [], // 生活习惯模板
    selectedTemplate: '', // 已选任务模板
    selectedTemplateType: '', // 选择的模板类型
    customMode: true, // 是否为自定义模式
    dateNow: '', // 当前日期，用于日期选择器最小值
    timeNow: '', // 当前时间，用于时间选择器最小值
    isCustomPoints: false, // 是否使用自定义积分
    customPointsValue: '8', // 自定义积分值
    
    // 难度选项
    difficultyOptions: ['简单', '普通', '困难'],
    difficultyIndex: 1,
    
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
      { id: 'clock', name: '生活习惯', icon: '⏰', parent: 'habit' },
      { id: 'study', name: '学习任务', icon: '📝', parent: 'study' }
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
        id: 'clock',
        type: 'habit-task',
        icon: '⏰',
        label: '习惯',
        ariaLabel: '添加生活习惯'
      },
      {
        id: 'bag',
        type: '',
        icon: '🧹',
        label: '整理',
        ariaLabel: '添加整理任务',
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
    console.log('Page onLoad with options:', options);
    
    // 设置页面标题
    wx.setNavigationBarTitle({
      title: options.mode === 'edit' ? '编辑任务' : 
             options.taskType === 'study' ? '创建学习任务' : '创建习惯任务'
    });
    
    // 初始化日期和时间
    this.initDateTime();
    
    // 判断模式(创建/编辑)
    if (options.mode === 'edit' && options.taskId) {
      this.initEditMode(options.taskId);
    } else {
      this.initCreateMode(options);
    }
    
    // 加载任务模板（按类型分类）
    this.loadTemplatesByCategory();
    
    // 更新任务负载预测
    this.updateTaskLoadPreview();
    
    // 初始化任务概览数据
    this.initTaskOverview();
  },

  /**
   * 初始化创建模式
   */
  initCreateMode: function(options) {
    // 设置任务类型(从首页传入)
    const taskType = options.taskType || 'study';
    const precision = options.precision || (taskType === 'study' ? 'second' : 'day');
    
    // 根据任务类型设置默认值
    let defaultPoints = taskType === 'study' ? 3 : 2;
    
    this.setData({
      mode: 'create',
      taskType: taskType,
      precision: precision,
      customMode: true,
      // 确保任务类型正确设置
      'task.type': taskType === 'study' ? 'study' : 'clock',
      'task.taskType': taskType,
      'task.points': defaultPoints,
      'task.precision': precision
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
   * 输入任务标题
   */
  inputTitle: function(e) {
    this.setData({
      'task.title': e.detail.value
    });
  },

  /**
   * 输入任务描述
   */
  inputDescription: function(e) {
    this.setData({
      'task.description': e.detail.value
    });
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
    this.setData({
      'task.date': e.detail.value
    });
    
    // 更新任务负载预测
    this.updateTaskLoadPreview();
  },

  /**
   * 选择开始时间
   */
  selectStartTime: function(e) {
    console.log('[TaskEdit] 选择开始时间:', e.detail.value);
    const startTime = e.detail.value;
    this.setData({
      'task.startTime': startTime
    });
    // 如果结束时间已设置，重新计算持续时间
    if (this.data.task.endTime) {
      this.calculateDuration();
    }
  },

  /**
   * 选择结束时间
   */
  selectEndTime: function(e) {
    console.log('[TaskEdit] 选择结束时间:', e.detail.value);
    const endTime = e.detail.value;
    this.setData({
      'task.endTime': endTime
    });
    // 如果开始时间已设置，重新计算持续时间
    if (this.data.task.startTime) {
      this.calculateDuration();
    }
  },

  /**
   * 计算任务持续时间
   */
  calculateDuration: function() {
    const task = this.data.task;
    if (task.startTime && task.endTime) {
      const [startHours, startMinutes] = task.startTime.split(':').map(Number);
      const [endHours, endMinutes] = task.endTime.split(':').map(Number);
      
      const startTotalMinutes = startHours * 60 + startMinutes;
      const endTotalMinutes = endHours * 60 + endMinutes;
      
      const duration = endTotalMinutes - startTotalMinutes;
      if (duration > 0) {
        this.setData({
          'task.duration': duration
        });
      }
    }
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
   * 快速选择日期
   */
  quickSelectDate: function(e) {
    const type = e.currentTarget.dataset.type;
    const now = new Date();
    let date = '';
    
    // 格式化日期函数
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    if (type === 'today') {
      date = formatDate(now);
    } else if (type === 'tomorrow') {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      date = formatDate(tomorrow);
    } else if (type === 'weekend') {
      // 获取本周周六
      const daysToSaturday = 6 - now.getDay();
      const saturday = new Date(now);
      saturday.setDate(saturday.getDate() + (daysToSaturday === 0 ? 7 : daysToSaturday));
      date = formatDate(saturday);
    }
    
    if (date) {
      this.setData({
        'task.date': date
      });
    }
  },

  /**
   * 快速选择时间
   */
  quickSelectTime: function(e) {
    const period = e.currentTarget.dataset.period;
    let timeStr = '';
    
    if (period === 'morning') {
      timeStr = '08:30';
    } else if (period === 'afternoon') {
      timeStr = '15:00';
    } else if (period === 'evening') {
      timeStr = '19:00';
    }
    
    if (timeStr) {
      this.setData({
        'task.startTime': timeStr.split(':')[0],
        'task.endTime': timeStr.split(':')[1]
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
    const that = this;
    const taskData = this.data.task;
    
    // 验证必填字段
    if (!taskData.title) {
      wx.showToast({
        title: '请输入任务名称',
        icon: 'none'
      });
      return;
    }
    
    // 如果是周期性任务，进行额外验证
    if (this.data.repeatMode === 'repeat') {
      if (!this.validateRepeatTask()) {
        return;
      }
    }
    
    // 如果是学习类任务，验证时间
    if (taskData.type === 'study') {
      if (!taskData.startTime || !taskData.endTime) {
        wx.showToast({
          title: '请选择开始时间和结束时间',
          icon: 'none'
        });
        return;
      }
      
      // 验证时间顺序
      const [startHour, startMinute] = taskData.startTime.split(':').map(Number);
      const [endHour, endMinute] = taskData.endTime.split(':').map(Number);
      if (startHour > endHour || (startHour === endHour && startMinute >= endMinute)) {
        wx.showToast({
          title: '结束时间必须晚于开始时间',
          icon: 'none'
        });
        return;
      }
    }
    
    // 显示加载提示
    wx.showLoading({
      title: '保存中...',
      mask: true
    });
    
    // 保存任务
    if (that.data.mode === 'create') {
      taskManager.createTask(taskData, (newTask) => {
        wx.hideLoading();
        if (newTask) {
          // 显示成功提示
          wx.showToast({
            title: '创建成功',
            icon: 'success',
            duration: 2000
          });
          
          // 延迟返回上一页
          setTimeout(() => {
            wx.navigateBack();
          }, 2000);
        }
      });
    } else {
      taskManager.editTask(taskData.id, taskData, (updatedTask) => {
        wx.hideLoading();
        if (updatedTask) {
          // 显示成功提示
          wx.showToast({
            title: '更新成功',
            icon: 'success',
            duration: 2000
          });
          
          // 延迟返回上一页
          setTimeout(() => {
            wx.navigateBack();
          }, 2000);
        }
      });
    }
  },

  /**
   * 按类型加载任务模板
   */
  loadTemplatesByCategory: function() {
    // 学习任务模板
    const studyTemplates = [
      { 
        id: 'math_homework', 
        name: '数学作业', 
        shortName: '数学',
        difficulty: '普通',
        description: '完成数学练习册', 
        duration: 45, 
        points: 3 
      },
      { 
        id: 'reading', 
        name: '阅读练习', 
        shortName: '阅读',
        difficulty: '简单',
        description: '阅读一篇文章并做笔记', 
        duration: 30, 
        points: 2 
      },
      { 
        id: 'english_words', 
        name: '英语单词', 
        shortName: '英语',
        difficulty: '普通',
        description: '背诵英语单词', 
        duration: 20, 
        points: 2 
      },
      { 
        id: 'writing', 
        name: '写作文', 
        shortName: '作文',
        difficulty: '困难',
        description: '完成一篇作文', 
        duration: 60, 
        points: 5 
      }
    ];

    // 生活习惯模板
    const habitTemplates = [
      { 
        id: 'tidy_desk', 
        name: '整理书桌', 
        shortName: '整理',
        difficulty: '简单',
        description: '整理书桌和学习用品', 
        duration: 15, 
        points: 2 
      },
      { 
        id: 'wash_dishes', 
        name: '洗碗', 
        shortName: '洗碗',
        difficulty: '简单',
        description: '清洗并整理餐具', 
        duration: 10, 
        points: 1 
      },
      { 
        id: 'exercise', 
        name: '做运动', 
        shortName: '运动',
        difficulty: '普通',
        description: '进行体育锻炼', 
        duration: 30, 
        points: 3 
      },
      { 
        id: 'make_bed', 
        name: '整理床铺', 
        shortName: '床铺',
        difficulty: '简单',
        description: '整理床铺被褥', 
        duration: 5, 
        points: 1 
      },
      { 
        id: 'clean_room', 
        name: '打扫房间', 
        shortName: '打扫',
        difficulty: '普通',
        description: '清扫房间卫生', 
        duration: 20, 
        points: 2 
      }
    ];
    
    
    // 获取自定义模板并添加到相应分类
    wx.getStorage({
      key: 'customTemplates',
      success: (res) => {
        if (res.data) {
          const customTemplates = res.data || [];
          
          // 根据类型将自定义模板添加到不同分类中
          const customStudy = customTemplates.filter(t => t.type === 'study');
          const customClock = customTemplates.filter(t => t.type === 'clock');
         
          
          // 更新数据
          this.setData({
            studyTemplates: [...customStudy, ...studyTemplates],
            habitTemplates: [...customClock, ...habitTemplates]
           
          });
        } else {
          // 没有自定义模板，直接使用默认模板
          this.setData({
            studyTemplates: studyTemplates,
            habitTemplates: habitTemplates
           
          });
        }
      },
      fail: () => {
        // 获取失败，使用默认模板
        this.setData({
          studyTemplates: studyTemplates,
          habitTemplates: habitTemplates
          
        });
      }
    });
  },

  /**
   * 选择任务模板
   */
  selectTemplate: function(e) {
    const templateId = e.currentTarget.dataset.id;
    const templateType = e.currentTarget.dataset.type;
    
    // 根据类型查找模板
    let template = null;
    if (templateType === 'study') {
      template = this.data.studyTemplates.find(t => t.id === templateId);
    } else if (templateType === 'clock') {
      template = this.data.habitTemplates.find(t => t.id === templateId);
    } 
    
    if (template) {
      // 使用模板数据填充表单
      const difficultyIndex = this.getDifficultyIndex(template.difficulty);
      
      this.setData({
        selectedTemplate: templateId,
        selectedTemplateType: templateType,
        customMode: false,
        'task.title': template.name,
        'task.shortName': template.shortName || template.name.substring(0, 4),
        'task.description': template.description || '',
        'task.points': template.points,
        'task.type': templateType,
        'task.difficulty': template.difficulty || '普通',
        difficultyIndex: difficultyIndex
      });
      
      // 给用户提示
      wx.vibrateShort({
        type: 'light'
      });
    }
  },

  /**
   * 根据难度名称获取索引
   */
  getDifficultyIndex: function(difficultyName) {
    const index = this.data.difficultyOptions.indexOf(difficultyName);
    return index > -1 ? index : 1; // 默认返回普通(索引1)
  },

  /**
   * 选择自定义任务
   */
  selectCustomTask: function(e) {
    // 获取任务类型（如果有传入）
    const taskType = e.currentTarget.dataset.type || 
                    (this.data.taskType === 'study' ? 'study' : 'clock');
    
    this.setData({
      selectedTemplate: '',
      selectedTemplateType: taskType,
      customMode: true,
      'task.title': '',
      'task.shortName': '',
      'task.description': '',
      'task.type': taskType,
      difficultyIndex: 1,
      'task.difficulty': '普通',
      'task.points': taskType === 'study' ? 3 : 2  // 默认积分：学习3分，习惯2分
    });
  },

  /**
   * 启用自定义编辑模式
   */
  enableCustomMode: function() {
    this.setData({
      customMode: true
    });
    
    wx.showToast({
      title: '已切换到编辑模式',
      icon: 'none',
      duration: 1000
    });
  },

  /**
   * 切换任务执行模式
   */
  switchMode: function(e) {
    const mode = e.currentTarget.dataset.mode;
    
    // 如果是周期性任务但还没有设置重复类型，设置默认值
    if (mode === 'repeat' && (!this.data.task.repeat || !this.data.task.repeat.type)) {
      this.setData({
        'task.repeat': {
          type: 'daily',
          days: ['0', '1', '2', '3', '4', '5', '6'], // 默认每天
          startDate: this.data.task.date || this.data.dateNow,
          endDate: ''
        }
      });
    }
    
    this.setData({
      repeatMode: mode
    });
  },

  /**
   * 选择重复频率
   */
  selectFrequency: function(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      'task.repeat.type': type,
      'task.repeat.days': type === 'custom' ? [] : null
    });
    
    // 提供用户反馈
    let message = '';
    switch (type) {
      case 'daily':
        message = '任务将每天重复';
        break;
      case 'weekly':
        message = '任务将每周重复';
        break;
      case 'workdays':
        message = '任务将在工作日重复';
        break;
      case 'custom':
        message = '请选择重复的日期';
        break;
    }
    
    wx.showToast({
      title: message,
      icon: 'none'
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
  saveAsTemplate: function() {
    const { task } = this.data;
    
    // 校验必要信息
    if (!task.title.trim()) {
      wx.showToast({
        title: '请先填写任务名称',
        icon: 'none'
      });
      return;
    }
    
    // 确保简称不超过4字符
    let shortName = task.shortName || '';
    if (!shortName) {
      // 如果没有简称，使用任务名前4个字
      shortName = task.title.substring(0, 4);
    }
    
    // 创建新模板
    const newTemplate = {
      id: 'custom_' + Date.now(),
      name: task.title,
      shortName: shortName,  // 保存简称
      icon: this.data.taskType === 'study' ? '📚' : '⏰',
      description: task.description,
      duration: task.duration,
      points: task.points,
      taskType: this.data.taskType,
      isCustom: true,
      createTime: Date.now()
    };
    
    // 获取现有模板
    wx.getStorage({
      key: 'customTemplates',
      success: (res) => {
        let templates = res.data || [];
        // 最多保留10个自定义模板，先进先出
        if (templates.length >= 10) {
          templates.pop();
        }
        templates.unshift(newTemplate);
        
        wx.setStorage({
          key: 'customTemplates',
          data: templates,
          success: () => {
            wx.showToast({
              title: '已保存为模板',
              icon: 'success'
            });
            // 刷新模板列表
            this.loadTemplatesByCategory();
          }
        });
      },
      fail: () => {
        wx.setStorage({
          key: 'customTemplates',
          data: [newTemplate],
          success: () => {
            wx.showToast({
              title: '已保存为模板',
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
   * 日期格式化
   */
  formatDate: function(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0'); // 确保月份是两位数
    const day = date.getDate().toString().padStart(2, '0'); // 确保日期是两位数
    return `${year}-${month}-${day}`;
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
  inputPoints: function(e) {
    let value = parseInt(e.detail.value);
    // 检查是否是有效数字且在合理范围内
    if (isNaN(value) || value < 1) {
      value = 1;
    } else if (value > 10) {
      value = 10;
    }
    
    this.setData({
      'task.points': value
    });
  },

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
   * 选择开始日期（周期任务）
   */
  selectStartDate: function(e) {
    // 兼容新旧两种事件格式
    const startDate = e.detail.startDate || e.detail.value;
    this.setData({
      'task.repeat.startDate': startDate
    });
  },

  /**
   * 选择结束日期（周期任务）
   */
  selectEndDate: function(e) {
    // 兼容新旧两种事件格式
    const endDate = e.detail.endDate || e.detail.value;
    this.setData({
      'task.repeat.endDate': endDate
    });
  },

  // 处理菜单项点击
  handleMenuItemTap: function(e) {
    const item = e.detail.item;
    
    // 根据菜单项ID执行不同的操作
    switch(item.id) {
      case 'clock':
        this.selectTaskType('habit');
        break;
      case 'bag':
        this.selectCustomTask('bag');
        break;
      case 'save':
        this.saveTask();
        break;
      default:
        console.log('未知菜单项:', item.id);
    }
  },
  
  // 处理菜单状态变化
  handleMenuStateChange: function(e) {
    console.log('菜单状态变化:', e.detail.isOpen);
  },
}) 