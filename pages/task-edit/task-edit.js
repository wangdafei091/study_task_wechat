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
    endMonthText: ''     // 仅月份，如 '5月'
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
   * 切换到上个月
   */
  prevHeatmapMonth: function() {
    const heatmap = this.selectComponent('#taskHeatmap');
    if (heatmap) {
      heatmap.prevMonth();
    }
  },

  /**
   * 切换到下个月
   */
  nextHeatmapMonth: function() {
    const heatmap = this.selectComponent('#taskHeatmap');
    if (heatmap) {
      heatmap.nextMonth();
    }
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
   * 添加任务
   */
  addTask: function() {
    // 表单验证
    if (!this.data.newTask.title.trim()) {
      this.setData({
        'errors.title': '请输入任务名称'
      });
      
      wx.showToast({
        title: '请输入任务名称',
        icon: 'none',
        duration: 2000
      });
      
      return;
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
    
    // 验证日期和时间
    if (!this.data.newTask.startDate) {
      wx.showToast({
        title: '请选择开始日期',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    // 仅当未勾选"无结束日期"时验证结束日期
    if (!this.data.newTask.hasNoEndDate && !this.data.newTask.endDate) {
      wx.showToast({
        title: '请选择结束日期',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    if (!this.data.newTask.isAllDay && (!this.data.newTask.startTime || !this.data.newTask.endTime)) {
      wx.showToast({
        title: '请选择开始和结束时间',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    try {
      // 获取应用实例
      const app = getApp();
      const allTasks = app.globalData.tasks || [];
      
      // 创建新任务对象
      const taskManager = require('../../utils/taskManager.js');
      const newTask = {
        title: this.data.newTask.title,
        type: this.data.newTask.type,
        points: taskPoints, // 使用验证后的积分值
        description: this.data.newTask.description,
        date: this.data.newTask.startDate,
        isAllDay: this.data.newTask.isAllDay,
        startTime: this.data.newTask.isAllDay ? null : this.data.newTask.startTime,
        endTime: this.data.newTask.isAllDay ? null : this.data.newTask.endTime,
        endDate: this.data.newTask.endDate,
        hasNoEndDate: this.data.newTask.hasNoEndDate, // 添加无结束日期字段
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
   * 初始化日期时间数据
   */
  initDateTimeData: function() {
    const today = new Date();
    const year = today.getFullYear();
    const month = ("0" + (today.getMonth() + 1)).slice(-2);
    const day = ("0" + today.getDate()).slice(-2);
    const dateStr = `${year}-${month}-${day}`;
    
    const hour = today.getHours();
    const minute = today.getMinutes();
    const timeStr = `${hour < 10 ? '0' + hour : hour}:${minute < 10 ? '0' + minute : minute}`;
    
    // 计算结束时间，默认为开始时间后一小时
    const endHour = (hour + 1) % 24;
    const endTimeStr = `${endHour < 10 ? '0' + endHour : endHour}:${minute < 10 ? '0' + minute : minute}`;
    
    // 设置年月选择器的数据
    const yearMonthStr = `${year}-${month}`;
    const yearMonthText = `${year}年${parseInt(month)}月`;
    
    // 设置年月分开显示的文本
    const yearText = `${year}年`;
    const monthText = `${parseInt(month)}月`;
    
    this.setData({
      'newTask.startDate': dateStr,
      'newTask.startTime': timeStr,
      'newTask.endDate': dateStr,
      'newTask.endTime': endTimeStr,
      'newTask.repeat.startDate': dateStr,
      'newTask.repeat.endDate': dateStr,
      // 设置年月选择器数据
      startYearMonth: yearMonthStr,
      endYearMonth: yearMonthStr,
      startYearMonthText: yearMonthText,
      endYearMonthText: yearMonthText,
      // 设置年月分开显示的文本
      startYearText: yearText,
      startMonthText: monthText,
      endYearText: yearText,
      endMonthText: monthText
    });
    
    // 初始化日历数据
    this.generateCalendarDays('start');
    this.generateCalendarDays('end');
    
    console.log('[TaskEdit] 初始化日期时间:', {
      startDate: dateStr,
      startTime: timeStr,
      endDate: dateStr,
      endTime: endTimeStr,
      yearMonth: yearMonthText,
      yearText: yearText,
      monthText: monthText
    });
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
    if (!this.data.newTask.endDate || this.data.newTask.endDate < date) {
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
    if (this.data.newTask.startDate && date < this.data.newTask.startDate) {
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
    
    // 如果是同一天，确保结束时间不早于开始时间
    if (this.data.newTask.startDate === this.data.newTask.endDate && this.data.newTask.startTime) {
      const startHour = parseInt(this.data.newTask.startTime.split(':')[0]);
      const startMinute = parseInt(this.data.newTask.startTime.split(':')[1]);
      const endHour = parseInt(time.split(':')[0]);
      const endMinute = parseInt(time.split(':')[1]);
      
      if (startHour > endHour || (startHour === endHour && startMinute >= endMinute)) {
        wx.showToast({
          title: '结束时间不能早于开始时间',
          icon: 'none',
          duration: 2000
        });
        return;
      }
    }
    
    this.setData({
      'newTask.endTime': time
    });
    
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
    
    // 实时更新重复类型和文本（无需点击确定按钮）
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
        repeatText: repeatText
      });
      
      console.log(`[TaskEdit] 更新星期选择: ${selectedDays.length}天被选中`);
    }
  },
  
  /**
   * 关闭所有面板
   */
  closeAllPanels: function() {
    console.log('[TaskEdit] 关闭所有面板');
    
    // 如果所有面板都已关闭，无需操作
    if (!this.data.startDatePanel && 
        !this.data.endDatePanel && 
        !this.data.repeatPanel && 
        !this.data.reminderPanel) {
      return;
    }
    
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
      repeatText: repeatText
      // 不再立即关闭面板，等待用户点击"完成"按钮
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
    if (this.data.newTask.startDate === this.data.newTask.endDate && 
        this.data.newTask.endTime) {
      const startTimeValue = startTime || this.data.newTask.startTime;
      
      // 比较开始时间和结束时间
      const [startHours, startMinutes] = startTimeValue.split(':').map(Number);
      const [endHours, endMinutes] = this.data.newTask.endTime.split(':').map(Number);
      
      // 如果开始时间晚于或等于结束时间，调整结束时间
      if (startHours > endHours || (startHours === endHours && startMinutes >= endMinutes)) {
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
   * 直接选择年月
   */
  onYearMonthChange: function(e) {
    const type = e.currentTarget.dataset.type; // start 或 end
    const value = e.detail.value; // 格式：2023-05
    
    let [year, month] = value.split('-').map(Number);
    
    // 重新生成日历数据
    this.generateCalendarDays(type, year, month - 1);
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
    // 使用自定义年月或从已选日期中获取
    let year, month;
    if (customYear !== undefined && customMonth !== undefined) {
      year = customYear;
      month = customMonth;
    } else {
      const today = new Date();
      const selectedDate = type === 'start' ? this.data.newTask.startDate : this.data.newTask.endDate;
      const selectedDateObj = selectedDate ? new Date(selectedDate) : today;
      year = selectedDateObj.getFullYear();
      month = selectedDateObj.getMonth();
    }
    
    // 更新年月文本显示
    const yearMonthText = `${year}年${month + 1}月`;
    const yearMonth = `${year}-${(month + 1) < 10 ? '0' + (month + 1) : (month + 1)}`;
    const yearText = `${year}年`;
    const monthText = `${month + 1}月`;
    
    this.setData({
      [type + 'YearMonth']: yearMonth,
      [type + 'YearMonthText']: yearMonthText,
      [type + 'YearText']: yearText,
      [type + 'MonthText']: monthText
    });
    
    // 获取当月的第一天和最后一天
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // 获取当月第一天是星期几(0-6)并调整为1-7,以适应周一开始
    const firstDayOfWeek = firstDay.getDay() || 7;
    
    // 计算上月显示的天数
    const daysFromPrevMonth = firstDayOfWeek - 1;
    
    // 当月的总天数
    const daysInMonth = lastDay.getDate();
    
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();
    
    // 当天日期的时间戳，用于比较是否为过去日期
    const todayTimestamp = new Date(todayYear, todayMonth, todayDate).getTime();
    
    let days = [];
    
    // 添加上月的日期
    if (daysFromPrevMonth > 0) {
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const prevMonthLastDay = new Date(year, month, 0).getDate();
      
      for (let i = prevMonthLastDay - daysFromPrevMonth + 1; i <= prevMonthLastDay; i++) {
        const date = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        // 判断日期是否在过去
        const dateTimestamp = new Date(prevYear, prevMonth, i).getTime();
        const isPast = dateTimestamp < todayTimestamp;
        
        days.push({
          day: i,
          date,
          currentMonth: false,
          isToday: (prevYear === todayYear && prevMonth === todayMonth && i === todayDate),
          isPast: isPast
        });
      }
    }
    
    // 添加当月的日期
    for (let i = 1; i <= daysInMonth; i++) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      // 判断日期是否在过去
      const dateTimestamp = new Date(year, month, i).getTime();
      const isPast = dateTimestamp < todayTimestamp;
      
      days.push({
        day: i,
        date,
        currentMonth: true,
        isToday: (year === todayYear && month === todayMonth && i === todayDate),
        isPast: isPast
      });
    }
    
    // 计算行数并填充下月日期
    const totalDaysSoFar = days.length;
    const rowsNeeded = Math.ceil(totalDaysSoFar / 7);
    const totalCells = rowsNeeded * 7;
    const nextMonthDays = totalCells - totalDaysSoFar;
    
    if (nextMonthDays > 0) {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      
      for (let i = 1; i <= nextMonthDays; i++) {
        const date = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        // 判断日期是否在过去
        const dateTimestamp = new Date(nextYear, nextMonth, i).getTime();
        const isPast = dateTimestamp < todayTimestamp;
        
        days.push({
          day: i,
          date,
          currentMonth: false,
          isToday: (nextYear === todayYear && nextMonth === todayMonth && i === todayDate),
          isPast: isPast
        });
      }
    }
    
    if (type === 'start') {
      this.setData({ startCalendarDays: days });
    } else {
      this.setData({ endCalendarDays: days });
    }
    
    console.log(`[TaskEdit] 生成${type}日历数据，年:${year}, 月:${month+1}`);
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
    
    console.log('[TaskEdit] 选择开始日期:', date);
  },

  /**
   * 选择结束日期
   */
  selectEndDate: function(e) {
    // 如果启用了无结束日期，则不处理结束日期选择
    if (this.data.newTask.hasNoEndDate) {
      this.setData({
        endDatePanel: false
      });
      return;
    }
    
    const date = e.currentTarget.dataset.date;
    
    // 确保结束日期不早于开始日期
    if (this.data.newTask.startDate && date < this.data.newTask.startDate) {
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
    
    console.log('[TaskEdit] 选择结束日期:', date);
  }
}) 