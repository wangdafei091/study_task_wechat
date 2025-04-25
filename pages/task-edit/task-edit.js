const app = getApp();
const Constants = require('../../utils/constants.js');

Page({
  /**
   * 页面的初始数据
   */
  data: {
    allTasks: [],
    heatmapYear: new Date().getFullYear(),
    heatmapMonthIndex: new Date().getMonth(),
    heatmapMonth: '',
    // 添加新任务表单数据
    newTask: {
      title: '',
      type: 'habit', // 默认类型为习惯
      points: 5, // 默认积分
      description: '',
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
    // 日期时间选择面板控制
    startDatePanel: false,
    endDatePanel: false,
    // 新增重复和提醒面板控制
    repeatPanel: false, 
    reminderPanel: false,
    // 重复面板模式：'type'表示选择重复类型，'weekday'表示选择星期
    repeatPanelMode: 'type',
    // 星期选择状态 [周日,周一,周二,周三,周四,周五,周六]
    weekdaySelection: [false, false, false, false, false, false, false],
    // 日历面板数据
    startCalendarDays: [],
    endCalendarDays: [],
    // 年月选择器数据
    startYearMonth: '',  // 格式：'2023-05'
    endYearMonth: '',    // 格式：'2023-05'
    startYearMonthText: '', // 显示的年月文本，如 '2023年5月'
    endYearMonthText: '',    // 显示的年月文本，如 '2023年5月'
    // 年月分开显示的文本
    startYearText: '',   // 仅年份，如 '2023年'
    startMonthText: '',  // 仅月份，如 '5月'
    endYearText: '',     // 仅年份，如 '2023年'
    endMonthText: '',     // 仅月份，如 '5月'
    
    // 新增重复预览相关字段
    repeatPreviewText: '', // 重复预览文本
    repeatTypeWarning: false, // 是否存在重复类型警告
    repeatPanelDesc: '任务将在所选时间范围内按设定频率执行' // 动态面板说明文字
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function(options) {
    console.log('[TaskEdit] 页面加载');
    
    // 初始化热力图月份
    this.initHeatmapMonth();
    
    // 初始化日期时间数据
    this.initDateTimeData();
    
    // 加载所有任务
    this.loadAllTasks();
    
    // 确保所有面板初始状态为关闭
    this.setData({
      startDatePanel: false,
      endDatePanel: false,
      repeatPanel: false,
      reminderPanel: false
    });
    
    // 初始化重复预览文本
    this.setData({
      repeatPreviewText: this.generateRepeatPreviewText('daily'),
      repeatPanelDesc: '任务将在所选时间范围内每天执行'
    });
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function() {
    console.log('[task-edit] 页面显示，刷新任务数据');
    this.loadAllTasks();
  },

  /**
   * 加载所有任务数据
   */
  loadAllTasks: function() {
    try {
      const allTasks = app.globalData.tasks || [];
      
      this.setData({ 
        allTasks: allTasks
      });
      
      console.log('[TaskEdit] 任务数据加载成功，共 ' + allTasks.length + ' 个任务');
    } catch (error) {
      console.error('[TaskEdit] 加载任务数据失败:', error);
      
      wx.showToast({
        title: '加载数据失败',
        icon: 'none',
        duration: 2000
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
   * 处理热力图日期选择事件
   */
  onHeatmapDaySelect: function(e) {
    // 日期选择事件由热力图组件内部处理
  },

  /**
   * 处理任务标题输入
   */
  onTaskTitleInput: function(e) {
    this.setData({
      'newTask.title': e.detail.value,
      'errors.title': ''
    });
  },

  /**
   * 选择任务类型
   */
  selectTaskType: function(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      'newTask.type': type
    });
  },

  /**
   * 更改积分
   */
  changePoints: function(e) {
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
    // 记录用户输入
    this.setData({
      'newTask.points': e.detail.value
    });
  },

  /**
   * 处理描述输入
   */
  onDescriptionInput: function(e) {
    this.setData({
      'newTask.description': e.detail.value
    });
  },

  /**
   * 清空任务表单
   */
  clearTaskForm: function() {
    console.log('[TaskEdit] 清空任务表单');
    
    // 重置任务为默认状态
    this.setData({
      'newTask.title': '',
      'newTask.type': 'habit',
      'newTask.points': 5,
      'newTask.description': '',
      'newTask.isAllDay': false,
      'newTask.hasNoEndDate': false, // 重置无结束日期字段
      'errors.title': '',
      repeatText: '每天',
      reminderText: '无',
      'newTask.repeat': {
        type: 'daily',
        days: [],
        startDate: '',
        endDate: ''
      },
      'newTask.reminder': {
        enabled: false,
        time: 0
      }
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
   * @returns {Object} 包含验证结果和错误信息
   */
  validateTaskForm: function() {
    const result = {
      valid: true,
      errorMsg: ''
    };

    // 验证任务标题
    if (!this.data.newTask.title.trim()) {
      this.setData({
        'errors.title': '请输入任务名称'
      });
      result.valid = false;
      result.errorMsg = '请输入任务名称';
      return result;
    }
    
    // 验证积分范围
    let taskPoints = parseInt(this.data.newTask.points) || 0;
    if (taskPoints < 1 || taskPoints > 50) {
      // 限制积分范围在1-50之间
      taskPoints = Math.max(1, Math.min(50, taskPoints));
      
      // 更新为有效值
      this.setData({
        'newTask.points': taskPoints
      });
      
      console.log('[TaskEdit] 积分已调整到有效范围:', taskPoints);
    }
    
    // 验证日期
    if (!this.data.newTask.startDate) {
      result.valid = false;
      result.errorMsg = '请选择开始日期';
      return result;
    }
    
    // 仅当未勾选"无结束日期"时验证结束日期
    if (!this.data.newTask.hasNoEndDate && !this.data.newTask.endDate) {
      result.valid = false;
      result.errorMsg = '请选择结束日期';
      return result;
    }
    
    // 验证时间
    if (!this.data.newTask.isAllDay && (!this.data.newTask.startTime || !this.data.newTask.endTime)) {
      result.valid = false;
      result.errorMsg = '请选择开始和结束时间';
      return result;
    }
    
    // 验证日期与重复类型是否匹配
    if (this.data.repeatTypeWarning) {
      // 获取当前日期
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
      const isToday = this.data.newTask.startDate === todayStr;
      
      const startDate = new Date(this.data.newTask.startDate);
      const dayOfWeek = startDate.getDay();
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      
      let warningMessage = '';
      
      if (this.data.newTask.repeat.type === 'workdays' && isWeekend) {
        warningMessage = `您选择的开始日期是周末，但重复类型是工作日。任务将从下一个工作日开始执行`;
      } else if (this.data.newTask.repeat.type === 'weekends' && !isWeekend) {
        warningMessage = `您选择的开始日期是工作日，但重复类型是休息日。任务将从下一个休息日开始执行`;
      } else if (this.data.newTask.repeat.type === 'custom') {
        const selectedDays = this.data.newTask.repeat.days;
        if (selectedDays && selectedDays.length > 0 && !selectedDays.includes(dayOfWeek)) {
          warningMessage = `您选择的开始日期不在设定的重复星期内。任务将从下一个匹配的日期开始执行`;
        }
      }
      
      if (warningMessage) {
        if (isToday) {
          warningMessage += `。请注意，今日任务列表中将不会显示该任务。是否继续创建？`;
        } else {
          warningMessage += `。是否继续创建？`;
        }
        
        console.log('[TaskEdit] 任务验证 - 检测到日期与重复类型不匹配');
        
        // 使用确认对话框
        wx.showModal({
          title: '重复类型提示',
          content: warningMessage,
          confirmText: '继续创建',
          cancelText: '返回修改',
          success: (res) => {
            if (res.confirm) {
              // 用户确认继续，执行任务创建
              this.doAddTask();
            }
          }
        });
        
        // 中断验证流程，由对话框回调处理后续操作
        result.valid = false;
        return result;
      }
    }
    
    return result;
  },

  /**
   * 执行添加任务操作
   */
  doAddTask: function() {
    try {
      // 获取应用实例
      const app = getApp();
      const allTasks = app.globalData.tasks || [];
      
      // 创建新任务对象
      const taskManager = require('../../utils/taskManager.js');
      const taskPoints = parseInt(this.data.newTask.points) || 0;
      
      const newTask = {
        title: this.data.newTask.title,
        type: this.data.newTask.type,
        points: taskPoints,
        description: this.data.newTask.description,
        date: this.data.newTask.startDate,
        isAllDay: this.data.newTask.isAllDay,
        startTime: this.data.newTask.isAllDay ? null : this.data.newTask.startTime,
        endTime: this.data.newTask.isAllDay ? null : this.data.newTask.endTime,
        endDate: this.data.newTask.endDate,
        hasNoEndDate: this.data.newTask.hasNoEndDate,
        repeat: {
          type: this.data.newTask.repeat.type,
          startDate: this.data.newTask.startDate,
          endDate: this.data.newTask.repeat.type !== 'none' ?
            (this.data.newTask.hasNoEndDate ? null : this.data.newTask.endDate) : null,
          days: this.data.newTask.repeat.days || []
        },
        reminder: {
          enabled: this.data.newTask.reminder.enabled,
          time: this.data.newTask.reminder.time
        },
        status: 0, // 默认未完成
        createTime: Date.now()
      };
      
      console.log('[TaskEdit] 准备添加新任务:', newTask);
      
      // 使用任务管理器创建任务
      taskManager.createTask(newTask, (createdTask) => {
        // 添加成功
        wx.showToast({
          title: '添加成功',
          icon: 'success',
          duration: 2000
        });
        
        // 清空表单
        this.clearTaskForm();
        
        // 重新加载任务数据
        this.loadAllTasks();
        
        console.log('[TaskEdit] 新任务添加成功:', createdTask);
      });
    } catch (error) {
      console.error('[TaskEdit] 添加任务失败:', error);
      
      wx.showToast({
        title: '添加失败，请重试',
        icon: 'none',
        duration: 2000
      });
    }
  },

  /**
   * 添加任务
   */
  addTask: function() {
    // 表单验证
    const validation = this.validateTaskForm();
    if (!validation.valid) {
      if (validation.errorMsg) {
        wx.showToast({
          title: validation.errorMsg,
          icon: 'none',
          duration: 2000
        });
      }
      // 如果没有错误消息，说明是等待确认对话框的情况
      return;
    }
    
    // 通过验证，直接执行添加任务
    this.doAddTask();
  },

  /**
   * 初始化日期时间数据
   */
  initDateTimeData: function() {
    const today = new Date();
    const year = today.getFullYear();
    const month = ("0" + (today.getMonth() + 1)).slice(-2);
    const day = ("0" + today.getDate()).slice(-2);
    const dateStr = `${year}-${month}-${day}`;
    
    // 获取当前时间和默认结束时间（当前时间+1小时）
    const hour = today.getHours();
    const minute = today.getMinutes();
    const timeStr = `${hour < 10 ? '0' + hour : hour}:${minute < 10 ? '0' + minute : minute}`;
    const endHour = (hour + 1) % 24;
    const endTimeStr = `${endHour < 10 ? '0' + endHour : endHour}:${minute < 10 ? '0' + minute : minute}`;
    
    // 设置年月显示格式
    const yearMonthStr = `${year}-${month}`;
    const yearText = `${year}年`;
    const monthText = `${parseInt(month)}月`;
    
    this.setData({
      // 设置日期时间
      'newTask.startDate': dateStr,
      'newTask.startTime': timeStr,
      'newTask.endDate': dateStr,
      'newTask.endTime': endTimeStr,
      'newTask.repeat.startDate': dateStr,
      'newTask.repeat.endDate': dateStr,
      
      // 设置年月选择器数据
      startYearMonth: yearMonthStr,
      endYearMonth: yearMonthStr,
      startYearMonthText: `${year}年${parseInt(month)}月`,
      endYearMonthText: `${year}年${parseInt(month)}月`,
      
      // 设置年月分开显示的文本
      startYearText: yearText,
      startMonthText: monthText,
      endYearText: yearText,
      endMonthText: monthText
    });
    
    // 初始化日历数据
    this.generateCalendarDays('start');
    this.generateCalendarDays('end');
  },

  /**
   * 全天开关切换
   */
  toggleAllDay: function(e) {
    const isAllDay = e.detail.value;
    
    this.setData({
      'newTask.isAllDay': isAllDay
    });
    
    console.log('[TaskEdit] 全天选项:', isAllDay ? '开启' : '关闭');
  },
  
  /**
   * 无结束日期开关切换
   */
  toggleNoEndDate: function(e) {
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
    
    console.log('[TaskEdit] 无结束日期选项:', hasNoEndDate ? '开启' : '关闭');
  },
  
  /**
   * 开始日期选择
   */
  onStartDateChange: function(e) {
    const date = e.detail.value;
    
    this.setData({
      'newTask.startDate': date
    });
    
    // 如果结束日期为空或早于开始日期，自动设置结束日期为开始日期
    if (!this.isValidEndDate(date, this.data.newTask.endDate)) {
      this.setData({
        'newTask.endDate': date
      });
    }
    
    console.log('[TaskEdit] 设置开始日期:', date);
  },
  
  /**
   * 开始时间选择
   */
  onStartTimeChange: function(e) {
    const time = e.detail.value;
    
    this.setData({
      'newTask.startTime': time
    });
    
    // 检查并调整结束时间
    this.checkAndAdjustEndTime(time);
    
    // 更新重复预览文本
    if (this.data.newTask.repeat.type !== 'none') {
      this.setData({
        repeatPreviewText: this.generateRepeatPreviewText(this.data.newTask.repeat.type)
      });
    }
    
    console.log('[TaskEdit] 设置开始时间:', time);
  },
  
  /**
   * 结束日期选择
   */
  onEndDateChange: function(e) {
    // 如果启用了无结束日期，则不处理结束日期变更
    if (this.data.newTask.hasNoEndDate) {
      return;
    }
    
    const date = e.detail.value;
    
    // 确保结束日期不早于开始日期
    if (!this.isValidEndDate(this.data.newTask.startDate, date)) {
      wx.showToast({
        title: '结束日期不能早于开始日期',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    this.setData({
      'newTask.endDate': date
    });
    
    console.log('[TaskEdit] 设置结束日期:', date);
  },
  
  /**
   * 结束时间选择
   */
  onEndTimeChange: function(e) {
    const time = e.detail.value;
    const isSameDay = this.data.newTask.startDate === this.data.newTask.endDate;
    
    // 如果是同一天，确保结束时间不早于开始时间
    if (!this.isValidEndTime(this.data.newTask.startTime, time, isSameDay)) {
      wx.showToast({
        title: '结束时间不能早于开始时间',
        icon: 'none',
        duration: 2000
      });
      return;
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
    
    console.log('[TaskEdit] 设置结束时间:', time);
  },
  
  /**
   * 切换面板显示
   */
  togglePanel: function(e) {
    const panelName = e.currentTarget.dataset.panel;
    
    // 关闭所有其他面板
    const newState = {
      startDatePanel: false,
      endDatePanel: false,
      repeatPanel: false,
      reminderPanel: false
    };
    
    // 切换当前面板状态
    newState[panelName] = !this.data[panelName];
    
    this.setData(newState);
    
    // 如果是日期面板且已打开，生成日历数据
    if ((panelName === 'startDatePanel' && newState.startDatePanel) || 
        (panelName === 'endDatePanel' && newState.endDatePanel)) {
      const type = panelName === 'startDatePanel' ? 'start' : 'end';
      this.generateCalendarDays(type);
    }
    
    console.log(`[TaskEdit] 切换${panelName}:`, newState[panelName] ? '打开' : '关闭');
  },
  
  /**
   * 切换到星期选择模式
   */
  switchToWeekdaySelection: function() {
    // 如果当前是自定义类型，恢复之前的星期选择状态
    if (this.data.newTask.repeat.type === 'custom' && this.data.newTask.repeat.days.length > 0) {
      const weekdaySelection = [false, false, false, false, false, false, false];
      this.data.newTask.repeat.days.forEach(day => {
        weekdaySelection[day] = true;
      });
      
      this.setData({
        weekdaySelection: weekdaySelection
      });
    }
    
    this.setData({
      repeatPanelMode: 'weekday'
    });
    
    console.log('[TaskEdit] 切换到星期选择模式');
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
    
    // 如果有选中的星期，设置为自定义类型
    if (selectedDays.length > 0) {
      // 设置自定义重复文本
      let repeatText = '';
      if (selectedDays.length <= 2) {
        // 1-2天显示具体星期
        const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        repeatText = '每' + selectedDays.map(day => dayNames[day]).join('、');
      } else {
        // 3天或以上显示"每周多天"
        repeatText = '每周多天';
      }
      
      this.setData({
        'newTask.repeat.type': 'custom',
        'newTask.repeat.days': selectedDays,
        repeatText: repeatText
      });
    }
    
    this.setData({
      repeatPanelMode: 'type'
    });
    
    console.log('[TaskEdit] 返回到重复类型选择模式');
  },
  
  /**
   * 切换星期选择状态
   */
  toggleWeekdaySelection: function(e) {
    const day = parseInt(e.currentTarget.dataset.day);
    const newSelection = [...this.data.weekdaySelection];
    newSelection[day] = !newSelection[day];
    
    this.setData({
      weekdaySelection: newSelection
    });
    
    // 实时更新重复类型和文本
    const selectedDays = [];
    newSelection.forEach((selected, index) => {
      if (selected) {
        selectedDays.push(index);
      }
    });
    
    if (selectedDays.length > 0) {
      let repeatText = '';
      if (selectedDays.length <= 2) {
        const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        repeatText = '每' + selectedDays.map(day => dayNames[day]).join('、');
      } else {
        repeatText = '每周多天';
      }
      
      this.setData({
        'newTask.repeat.type': 'custom',
        'newTask.repeat.days': selectedDays,
        repeatText: repeatText,
        // 更新重复预览文本
        repeatPreviewText: this.generateRepeatPreviewText('custom')
      });
      
      console.log(`[TaskEdit] 更新星期选择: ${selectedDays.length}天被选中`);
    }
  },
  
  /**
   * 关闭所有面板
   */
  closeAllPanels: function() {
    // 关闭所有面板
    this.setData({
      startDatePanel: false,
      endDatePanel: false,
      repeatPanel: false,
      reminderPanel: false,
      // 重置重复面板模式为类型选择
      repeatPanelMode: 'type'
    });
  },

  /**
   * 选择重复类型
   */
  selectRepeatType: function(e) {
    const type = e.currentTarget.dataset.type;
    
    let repeatText = '';
    switch (type) {
      case 'daily':
        repeatText = '每天';
        break;
      case 'workdays':
        repeatText = '工作日';
        break;
      case 'weekends':
        repeatText = '休息日';
        break;
    }
    
    this.setData({
      'newTask.repeat.type': type,
      repeatText: repeatText,
      repeatPreviewText: this.generateRepeatPreviewText(type)
    });
    
    console.log(`[TaskEdit] 选择重复类型: ${type}`);
  },

  /**
   * 选择提醒类型
   */
  selectReminderType: function(e) {
    const enabled = e.currentTarget.dataset.enabled === 'true';
    const time = parseInt(e.currentTarget.dataset.time || 0);
    
    let reminderText = '无';
    if (enabled) {
      if (time === 0) {
        reminderText = '准时';
      } else {
        reminderText = `提前${time}分钟`;
      }
    }
    
    this.setData({
      'newTask.reminder.enabled': enabled,
      'newTask.reminder.time': time,
      reminderText: reminderText,
      reminderPanel: false // 选择后关闭面板
    });
    
    console.log(`[TaskEdit] 设置提醒: ${reminderText}`);
  },

  /**
   * 检查并调整结束时间
   */
  checkAndAdjustEndTime: function(startTime) {
    const isSameDay = this.data.newTask.startDate === this.data.newTask.endDate;
    if (isSameDay && this.data.newTask.endTime) {
      const startTimeValue = startTime || this.data.newTask.startTime;
      
      // 检查时间是否有效
      if (!this.isValidEndTime(startTimeValue, this.data.newTask.endTime, true)) {
        // 比较开始时间和结束时间
        const [startHours, startMinutes] = startTimeValue.split(':').map(Number);
        
        // 将结束时间设置为开始时间后一小时
        const newEndHour = (startHours + 1) % 24;
        const newEndTime = `${newEndHour.toString().padStart(2, '0')}:${startMinutes.toString().padStart(2, '0')}`;
        
        this.setData({
          'newTask.endTime': newEndTime,
        });
      }
    }
  },

  /**
   * 日期时间辅助函数 - 检查结束日期是否有效
   * @param {string} startDate 开始日期
   * @param {string} endDate 结束日期
   * @returns {boolean} 结束日期是否有效
   */
  isValidEndDate: function(startDate, endDate) {
    if (!startDate || !endDate) return false;
    return endDate >= startDate;
  },

  /**
   * 日期时间辅助函数 - 检查结束时间是否有效
   * @param {string} startTime 开始时间
   * @param {string} endTime 结束时间
   * @returns {boolean} 结束时间是否有效（仅当同一天时检查）
   */
  isValidEndTime: function(startTime, endTime, isSameDay) {
    if (!startTime || !endTime || !isSameDay) return true;
    
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    
    if (startHours > endHours) return false;
    if (startHours === endHours && startMinutes >= endMinutes) return false;
    return true;
  },

  /**
   * 更改月份
   */
  changeMonth: function(e) {
    const type = e.currentTarget.dataset.type; // start 或 end
    const action = e.currentTarget.dataset.action; // prev 或 next
    
    let yearMonth = this.data[type + 'YearMonth'];
    let [year, month] = yearMonth.split('-').map(Number);
    
    if (action === 'prev') {
      month--;
      if (month === 0) {
        month = 12;
        year--;
      }
    } else {
      month++;
      if (month === 13) {
        month = 1;
        year++;
      }
    }
    
    // 重新生成日历数据
    this.generateCalendarDays(type, year, month - 1);
  },

  /**
   * 更改年份
   */
  changeYear: function(e) {
    const type = e.currentTarget.dataset.type; // start 或 end
    const action = e.currentTarget.dataset.action; // prev 或 next
    
    let yearMonth = this.data[type + 'YearMonth'];
    let [year, month] = yearMonth.split('-').map(Number);
    
    if (action === 'prev') {
      year--;
    } else {
      year++;
    }
    
    // 显示提示
    wx.showToast({
      title: `切换至${year}年`,
      icon: 'none',
      duration: 1000
    });
    
    // 重新生成日历数据
    this.generateCalendarDays(type, year, month - 1);
  },

  /**
   * 年月选择器变更
   */
  onYearMonthChange: function(e) {
    const type = e.currentTarget.dataset.type;
    const yearMonth = e.detail.value; // 格式：'2023-05'
    
    const [year, month] = yearMonth.split('-').map(Number);
    
    const yearText = `${year}年`;
    const monthText = `${month}月`;
    
    if (type === 'start') {
      this.setData({
        startYearMonth: yearMonth,
        startYearMonthText: `${year}年${month}月`,
        startYearText: yearText,
        startMonthText: monthText
      });
      this.generateCalendarDays('start', year, month - 1);
    } else {
      this.setData({
        endYearMonth: yearMonth,
        endYearMonthText: `${year}年${month}月`,
        endYearText: yearText,
        endMonthText: monthText
      });
      this.generateCalendarDays('end', year, month - 1);
    }
    
    console.log(`[TaskEdit] 修改${type}年月：${year}年${month}月`);
  },

  /**
   * 阻止滑动穿透
   * 该函数捕获touchmove事件并阻止事件冒泡，防止日历面板滑动时底层页面也随之滚动
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
   * 生成简化版日历数据
   */
  generateCalendarDays: function(type, customYear, customMonth) {
    // 确定年月
    const yearMonthData = this.getYearMonthData(type, customYear, customMonth);
    const { year, month } = yearMonthData;
    
    // 更新界面年月显示
    this.updateYearMonthDisplay(type, year, month);
    
    // 生成日历数据
    const days = this.generateMonthDays(year, month);
    
    // 更新日历数据
    this.setData({
      [type + 'CalendarDays']: days
    });
    
    console.log(`[TaskEdit] 生成${type}日历数据，年:${year}, 月:${month+1}`);
  },

  /**
   * 获取指定类型的年月数据
   */
  getYearMonthData: function(type, customYear, customMonth) {
    let year, month;
    if (customYear !== undefined && customMonth !== undefined) {
      // 使用自定义年月
      year = customYear;
      month = customMonth;
    } else {
      // 从已选日期或当前日期获取
      const today = new Date();
      const selectedDate = type === 'start' ? this.data.newTask.startDate : this.data.newTask.endDate;
      const selectedDateObj = selectedDate ? new Date(selectedDate) : today;
      year = selectedDateObj.getFullYear();
      month = selectedDateObj.getMonth();
    }
    return { year, month };
  },

  /**
   * 更新年月显示
   */
  updateYearMonthDisplay: function(type, year, month) {
    // 更新年月文本显示
    const yearMonthStr = `${year}-${(month + 1) < 10 ? '0' + (month + 1) : (month + 1)}`;
    const yearMonthText = `${year}年${month + 1}月`;
    const yearText = `${year}年`;
    const monthText = `${month + 1}月`;
    
    this.setData({
      [type + 'YearMonth']: yearMonthStr,
      [type + 'YearMonthText']: yearMonthText,
      [type + 'YearText']: yearText,
      [type + 'MonthText']: monthText
    });
  },

  /**
   * 生成月份天数数据
   */
  generateMonthDays: function(year, month) {
    // 获取当月的第一天和最后一天
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // 获取当月第一天是星期几(0-6)并调整为1-7,以适应周一开始
    const firstDayOfWeek = firstDay.getDay() || 7;
    
    // 计算上月显示的天数
    const daysFromPrevMonth = firstDayOfWeek - 1;
    
    // 当月的总天数
    const daysInMonth = lastDay.getDate();
    
    // 今天日期信息
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();
    const todayTimestamp = new Date(todayYear, todayMonth, todayDate).getTime();
    
    let days = [];
    
    // 添加上月的日期
    this.addPrevMonthDays(days, year, month, daysFromPrevMonth, todayYear, todayMonth, todayDate, todayTimestamp);
    
    // 添加当月的日期
    this.addCurrentMonthDays(days, year, month, daysInMonth, todayYear, todayMonth, todayDate, todayTimestamp);
    
    // 添加下月的日期
    this.addNextMonthDays(days, year, month, todayYear, todayMonth, todayDate, todayTimestamp);
    
    return days;
  },

  /**
   * 添加上月日期到日历
   */
  addPrevMonthDays: function(days, year, month, daysFromPrevMonth, todayYear, todayMonth, todayDate, todayTimestamp) {
    if (daysFromPrevMonth <= 0) return;
    
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    
    for (let i = prevMonthLastDay - daysFromPrevMonth + 1; i <= prevMonthLastDay; i++) {
      const date = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      // 判断日期是否在过去
      const dateTimestamp = new Date(prevYear, prevMonth, i).getTime();
      
      days.push({
        day: i,
        date,
        currentMonth: false,
        isToday: (prevYear === todayYear && prevMonth === todayMonth && i === todayDate),
        isPast: dateTimestamp < todayTimestamp
      });
    }
  },

  /**
   * 添加当月日期到日历
   */
  addCurrentMonthDays: function(days, year, month, daysInMonth, todayYear, todayMonth, todayDate, todayTimestamp) {
    for (let i = 1; i <= daysInMonth; i++) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      // 判断日期是否在过去
      const dateTimestamp = new Date(year, month, i).getTime();
      
      days.push({
        day: i,
        date,
        currentMonth: true,
        isToday: (year === todayYear && month === todayMonth && i === todayDate),
        isPast: dateTimestamp < todayTimestamp
      });
    }
  },

  /**
   * 添加下月日期到日历
   */
  addNextMonthDays: function(days, year, month, todayYear, todayMonth, todayDate, todayTimestamp) {
    // 计算行数并填充下月日期
    const totalDaysSoFar = days.length;
    const rowsNeeded = Math.ceil(totalDaysSoFar / 7);
    const totalCells = rowsNeeded * 7;
    const nextMonthDays = totalCells - totalDaysSoFar;
    
    if (nextMonthDays <= 0) return;
    
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    
    for (let i = 1; i <= nextMonthDays; i++) {
      const date = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      // 判断日期是否在过去
      const dateTimestamp = new Date(nextYear, nextMonth, i).getTime();
      
      days.push({
        day: i,
        date,
        currentMonth: false,
        isToday: (nextYear === todayYear && nextMonth === todayMonth && i === todayDate),
        isPast: dateTimestamp < todayTimestamp
      });
    }
  },

  /**
   * 选择开始日期
   */
  selectStartDate: function(e) {
    const date = e.currentTarget.dataset.date;
    
    this.setData({
      'newTask.startDate': date,
      startDatePanel: false
    });
    
    // 如果结束日期早于开始日期，自动调整结束日期
    if (this.data.newTask.endDate < date) {
      this.setData({
        'newTask.endDate': date
      });
    }
    
    // 更新重复预览文本
    if (this.data.newTask.repeat.type !== 'none') {
      this.setData({
        repeatPreviewText: this.generateRepeatPreviewText(this.data.newTask.repeat.type)
      });
    }
    
    console.log('[TaskEdit] 选择开始日期:', date);
  },

  /**
   * 选择结束日期
   */
  selectEndDate: function(e) {
    const date = e.currentTarget.dataset.date;
    
    // 如果结束日期早于开始日期，不允许选择
    if (!this.isValidEndDate(this.data.newTask.startDate, date)) {
      wx.showToast({
        title: '结束日期不能早于开始日期',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    this.setData({
      'newTask.endDate': date,
      endDatePanel: false
    });
    
    // 更新重复预览文本
    if (this.data.newTask.repeat.type !== 'none') {
      this.setData({
        repeatPreviewText: this.generateRepeatPreviewText(this.data.newTask.repeat.type)
      });
    }
    
    console.log('[TaskEdit] 选择结束日期:', date);
  },

  /**
   * 生成重复预览文本
   * @param {string} repeatType 重复类型
   * @returns {string} 预览文本
   */
  generateRepeatPreviewText: function(repeatType) {
    // 获取当前选择的开始日期
    const startDate = new Date(this.data.newTask.startDate);
    if (isNaN(startDate.getTime())) {
      return ''; // 日期无效
    }
    
    // 格式化日期的辅助函数
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const weekday = date.getDay();
      const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      return `${month}月${day}日(${weekdayNames[weekday]})`;
    };
    
    // 检查是否为今天
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isToday = (
      startDate.getFullYear() === today.getFullYear() &&
      startDate.getMonth() === today.getMonth() &&
      startDate.getDate() === today.getDate()
    );
    
    const todayStr = isToday ? '今天' : formatDate(startDate);
    const dayOfWeek = startDate.getDay(); // 0是周日，6是周六
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    
    let warningExists = false;
    let previewText = '';
    let endDateStr = '';
    
    // 添加结束日期信息
    if (this.data.newTask.hasNoEndDate) {
      endDateStr = '无限期执行';
    } else if (this.data.newTask.endDate) {
      const endDate = new Date(this.data.newTask.endDate);
      if (!isNaN(endDate.getTime())) {
        endDateStr = `直到${formatDate(endDate)}结束`;
      }
    }
    
    // 根据重复类型生成预览文本
    switch (repeatType) {
      case 'daily':
        previewText = `从${todayStr}开始每天执行${endDateStr ? '，' + endDateStr : ''}`;
        break;
        
      case 'workdays':
        if (isWeekend) {
          // 如果当前是周末，计算下一个工作日
          const nextWorkday = new Date(startDate);
          if (dayOfWeek === 0) { // 周日
            nextWorkday.setDate(nextWorkday.getDate() + 1); // 下一个周一
          } else { // 周六
            nextWorkday.setDate(nextWorkday.getDate() + 2); // 下下个周一
          }
          previewText = `首次执行：${formatDate(nextWorkday)}，之后每周一至周五执行${endDateStr ? '，' + endDateStr : ''}`;
          warningExists = true;
          
          // 更新面板说明
          this.setData({
            repeatPanelDesc: '工作日指周一至周五，周末不会执行任务'
          });
        } else {
          previewText = `从${todayStr}开始每周一至周五执行${endDateStr ? '，' + endDateStr : ''}`;
          
          // 更新面板说明
          this.setData({
            repeatPanelDesc: '任务将在所选日期范围内的工作日(周一至周五)执行'
          });
        }
        break;
        
      case 'weekends':
        if (!isWeekend) {
          // 如果当前不是周末，计算下一个周末
          const nextWeekend = new Date(startDate);
          const daysUntilWeekend = dayOfWeek === 6 ? 0 : 6 - dayOfWeek; // 到周六的天数
          nextWeekend.setDate(nextWeekend.getDate() + daysUntilWeekend);
          previewText = `首次执行：${formatDate(nextWeekend)}，之后每周六、周日执行${endDateStr ? '，' + endDateStr : ''}`;
          warningExists = true;
          
          // 更新面板说明
          this.setData({
            repeatPanelDesc: '休息日指周六和周日，工作日不会执行任务'
          });
        } else {
          previewText = `从${todayStr}开始每周六、周日执行${endDateStr ? '，' + endDateStr : ''}`;
          
          // 更新面板说明
          this.setData({
            repeatPanelDesc: '任务将在所选日期范围内的休息日(周六、周日)执行'
          });
        }
        break;
        
      case 'custom':
        // 处理自定义重复情况
        if (this.data.newTask.repeat.days && this.data.newTask.repeat.days.length > 0) {
          const selectedDays = this.data.newTask.repeat.days;
          const nextExecutionDate = this.findNextCustomExecutionDate(startDate, selectedDays);
          
          if (nextExecutionDate > startDate) {
            previewText = `首次执行：${formatDate(nextExecutionDate)}，之后按所选星期几执行${endDateStr ? '，' + endDateStr : ''}`;
            warningExists = true;
          } else {
            const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            const selectedDayNames = selectedDays.map(day => dayNames[day]).join('、');
            previewText = `从${todayStr}开始每${selectedDayNames}执行${endDateStr ? '，' + endDateStr : ''}`;
          }
          
          // 更新面板说明
          this.setData({
            repeatPanelDesc: '任务将在所选日期范围内的指定星期几执行'
          });
        } else {
          previewText = `请选择重复的星期`;
          
          // 更新面板说明
          this.setData({
            repeatPanelDesc: '请选择至少一个重复的星期几'
          });
        }
        break;
    }
    
    // 更新警告状态
    this.setData({
      repeatTypeWarning: warningExists
    });
    
    console.log(`[TaskEdit] 生成重复预览: ${previewText}${warningExists ? ' (有警告)' : ''}`);
    return previewText;
  },
  
  /**
   * 查找下一个自定义执行日期
   * @param {Date} startDate 开始日期
   * @param {Array} selectedDays 选中的星期几（0-6）
   * @returns {Date} 下一个执行日期
   */
  findNextCustomExecutionDate: function(startDate, selectedDays) {
    if (!selectedDays || selectedDays.length === 0) {
      return startDate;
    }
    
    // 检查当前日期是否匹配
    const currentDayOfWeek = startDate.getDay();
    if (selectedDays.includes(currentDayOfWeek)) {
      return startDate;
    }
    
    // 查找下一个匹配的日期
    const nextDate = new Date(startDate);
    let daysChecked = 0;
    
    while (daysChecked < 7) {
      nextDate.setDate(nextDate.getDate() + 1);
      daysChecked++;
      
      if (selectedDays.includes(nextDate.getDay())) {
        break;
      }
    }
    
    return nextDate;
  }
}) 