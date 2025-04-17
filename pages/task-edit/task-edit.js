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
      status: 0, // 0=未完成, 1=已完成
      createTime: 0,
      updateTime: 0,
      isEditing: false // 是否处于编辑模式
    },
    dateNow: '', // 当前日期，用于日期选择器最小值
    timeNow: '', // 当前时间，用于时间选择器最小值
    isCustomPoints: false, // 是否使用自定义积分
    customPointsValue: '8', // 自定义积分值
    
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
    
    // 菜单项配置
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
    ],
    allTasks: [],
    heatmapYear: new Date().getFullYear(),
    heatmapMonthIndex: new Date().getMonth(),
    heatmapMonth: ''
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function(options) {
    console.log('[TaskEdit] 任务编辑页面加载', options);
    
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
    
    // 更新任务负载预测
    this.updateTaskLoadPreview();
    
    // 加载所有任务数据
    this.loadAllTasks();
    
    // 初始化热力图月份信息
    this.initHeatmapMonth();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function() {
    console.log('[task-edit] 页面显示，刷新任务数据');
    
    // 刷新任务数据
    this.loadAllTasks();
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
    // 复制任务对象，避免直接修改
    const t = {...task};
    
    // 确保基本字段
    t.title = t.title || '';
    t.shortName = t.shortName || '';
    t.description = t.description || '';
    t.type = t.type || t.taskType || 'study';
    t.taskType = t.taskType || t.type || 'study';
    t.tags = t.tags || [];
    t.date = t.date || this.data.dateNow;
    t.points = typeof t.points === 'number' ? t.points : (t.taskType === 'study' ? 3 : 2);
    t.status = typeof t.status === 'number' ? t.status : 0;
    t.isEditing = !!t.isEditing;
    
    // 针对学习型任务
    if (t.taskType === 'study') {
      t.startTime = t.startTime || '';
      t.endTime = t.endTime || '';
      
      // 确保precision字段
      t.precision = t.precision || 'second';
    } else {
      // 对于习惯型任务
      t.precision = t.precision || 'day';
    }
    
    // 确保重复相关字段
    if (!t.repeat) {
      t.repeat = {
        type: 'none',
        days: [],
        startDate: '',
        endDate: ''
      };
    } else {
      t.repeat.type = t.repeat.type || 'none';
      t.repeat.days = t.repeat.days || [];
      t.repeat.startDate = t.repeat.startDate || '';
      t.repeat.endDate = t.repeat.endDate || '';
    }
    
    // 补充任务创建和更新时间
    t.createTime = t.createTime || Date.now();
    t.updateTime = t.updateTime || Date.now();
    
    return t;
  },

  /**
   * 初始化日期和时间
   */
  initDateTime: function() {
    const now = new Date();
    const dateNow = this.formatDate(now);
    
    // 获取当前时间，精确到分钟
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const timeNow = `${hours}:${minutes}`;
    
    // 初始化新任务的日期为今天
    const taskDate = this.data.task.date || dateNow;
    
    this.setData({
      dateNow: dateNow,
      timeNow: timeNow,
      'task.date': taskDate
    });
    
    // 日志记录
    console.log('[TaskEdit] 初始化时间信息: 当前日期=', dateNow, '当前时间=', timeNow, '任务日期=', taskDate);
  },

  /**
   * 初始化标签
   */
  initTags: function() {
    const taskType = this.data.taskType || this.data.task.taskType || 'study';
    
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
   * 修改结束日期
   */
  selectEndDate: function(e) {
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
   * 格式化日期为YYYY-MM-DD格式
   */
  formatDate: function(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * 确保重复任务设置
   */
  ensureRepeatTaskSettings: function() {
    // 如果当前是重复模式
    if (this.data.repeatMode === 'repeat') {
      // 检查task.repeat是否存在或格式是否完整
      const task = this.data.task;
      const hasValidRepeat = task.repeat && 
                           task.repeat.type && 
                           task.repeat.type !== 'none';
      
      if (!hasValidRepeat) {
        // 根据当前任务类型设置默认重复类型
        const defaultRepeatType = this.data.taskType === 'study' ? 'weekly' : 'daily';
        let defaultDays = [];
        
        // 根据重复类型设置默认天数
        if (defaultRepeatType === 'daily') {
          // 每天 - 包含所有日期
          defaultDays = ['0', '1', '2', '3', '4', '5', '6'];
        } else if (defaultRepeatType === 'weekly') {
          // 每周 - 默认设置为当前日期对应的星期几
          const today = new Date().getDay().toString();
          defaultDays = [today]; 
        } else if (defaultRepeatType === 'workdays') {
          // 工作日 - 周一至周五
          defaultDays = ['1', '2', '3', '4', '5'];
        }
        
        // 确保有开始日期
        const startDate = task.date || this.data.dateNow;
        
        // 更新重复设置
        this.setData({
          'task.repeat.type': defaultRepeatType,
          'task.repeat.days': defaultDays,
          'task.repeat.startDate': startDate,
          'task.repeat.endDate': ''
        });
      }
    }
  },

  /**
   * 加载所有任务数据
   */
  loadAllTasks: function() {
    console.log('[TaskEdit] 加载所有任务数据');
    
    wx.getStorage({
      key: 'taskData',
      success: res => {
        const tasks = res.data || [];
        this.setData({
          allTasks: tasks
        });
        console.log('[TaskEdit] 成功加载任务数据，数量:', tasks.length);
      },
      fail: err => {
        console.error('[TaskEdit] 加载任务数据失败:', err);
        this.setData({
          allTasks: []
        });
      }
    });
  },

  /**
   * 处理热力图日期点击事件
   */
  onHeatmapDayClick: function(e) {
    const { date, count, isCurrentMonth } = e.detail;
    
    console.log(`[TaskEdit] 点击日期: ${date}, 任务数: ${count}`);
    
    // 更新当前选择的日期（不显示弹窗）
    if (isCurrentMonth && date) {
      this.setData({
        'task.date': date
      });
    }
  },

  /**
   * 初始化热力图月份信息
   */
  initHeatmapMonth: function() {
    const now = new Date();
    const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', 
                      '七月', '八月', '九月', '十月', '十一月', '十二月'];
    
    this.setData({
      heatmapYear: now.getFullYear(),
      heatmapMonthIndex: now.getMonth(),
      heatmapMonth: `${now.getFullYear()}年${monthNames[now.getMonth()]}`
    });
    
    console.log('[TaskEdit] 初始化热力图月份:', this.data.heatmapMonth);
  },

  /**
   * 热力图月份变化事件处理
   */
  onHeatmapMonthChange: function(e) {
    console.log('[TaskEdit] 热力图月份变化:', e.detail);
    
    this.setData({
      heatmapYear: e.detail.year,
      heatmapMonthIndex: e.detail.month,
      heatmapMonth: `${e.detail.year}年${e.detail.monthName}`
    });
  },

  /**
   * 切换到上个月
   */
  prevHeatmapMonth: function() {
    // 获取热力图组件实例
    const heatmap = this.selectComponent('#taskHeatmap');
    if (heatmap) {
      heatmap.prevMonth();
    }
  },

  /**
   * 切换到下个月
   */
  nextHeatmapMonth: function() {
    // 获取热力图组件实例
    const heatmap = this.selectComponent('#taskHeatmap');
    if (heatmap) {
      heatmap.nextMonth();
    }
  }
}) 