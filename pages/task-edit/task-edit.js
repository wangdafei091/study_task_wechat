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
    isDemoData: false,
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
      repeat: {
        type: 'none',
        enabled: false,
        days: []
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
    descPlaceholder: '',
    // 新增UI控制字段
    showRepeatOptions: false,
    showReminderOptions: false,
    repeatText: '永不',
    reminderText: '无',
    // 日期时间选择面板控制
    startDatePanel: false,
    startTimePanel: false,
    endDatePanel: false,
    endTimePanel: false,
    // 日历面板数据
    startPanelYear: 0,
    startPanelMonth: 0,
    endPanelYear: 0,
    endPanelMonth: 0,
    startCalendarDays: [],
    endCalendarDays: [],
    // 时间选择器数据
    startTimePickerValue: [8, 0], // 默认8:00，索引从0开始
    endTimePickerValue: [9, 0],    // 默认9:00，索引从0开始
    // 新增属性
    anyPanelVisible: false,
    // 年月选择器数据
    startYearMonth: '',  // 格式：'2023-05'
    endYearMonth: '',    // 格式：'2023-05'
    startYearMonthText: '', // 显示的年月文本，如 '2023年5月'
    endYearMonthText: ''    // 显示的年月文本，如 '2023年5月'
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
    
    // 如果URL参数中指定了演示模式，自动生成演示数据
    if (options.demo === 'true') {
      console.log('[TaskEdit] 自动加载演示数据');
      // 延迟300ms生成演示数据，确保热力图组件已初始化
      setTimeout(() => {
        this.generateDemoData();
      }, 300);
    }
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
   * 加载所有任务数据
   */
  loadAllTasks: function() {
    console.log('[TaskEdit] 加载所有任务数据');
    
    try {
      const allTasks = app.globalData.tasks || [];
      
      this.setData({ 
        allTasks: allTasks,
        isDemoData: false 
      });
      
      console.log('任务数据加载成功，共 ' + allTasks.length + ' 个任务');
    } catch (error) {
      console.error('加载任务数据失败:', error);
      
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
    
    this.setData({ 
      heatmapYear: year,
      heatmapMonthIndex: month
    });
    
    const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', 
                      '七月', '八月', '九月', '十月', '十一月', '十二月'];
    
    this.setData({
      heatmapMonth: `${year}年${monthNames[month]}`
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
  },

  /**
   * 处理热力图日期选择事件
   */
  onHeatmapDaySelect: function(e) {
    console.log('[TaskEdit] 热力图日期选择:', e.detail);
    // 日期选择事件由热力图组件内部处理
  },

  /**
   * 生成演示用的假数据
   */
  generateDemoData: function() {
    console.log('[TaskEdit] 生成热力图演示数据');
    
    try {
      // 保存当前的任务数据备份
      const app = getApp();
      const realTasks = app.globalData.tasks || [];
      this._realTasksBackup = [...realTasks];
      
      // 生成一个月的随机任务
      const demoTasks = [];
      const year = this.data.heatmapYear;
      const month = this.data.heatmapMonthIndex;
      
      // 获取指定月份的天数
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      
      // 随机生成30-60个任务
      const taskCount = Math.floor(Math.random() * 30) + 30;
      
      for (let i = 0; i < taskCount; i++) {
        // 随机日期（1到月底）
        const day = Math.floor(Math.random() * daysInMonth) + 1;
        const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        
        // 随机类型
        const types = ['habit', 'study', 'interest'];
        const typeIndex = Math.floor(Math.random() * types.length);
        
        // 随机完成状态（60%的概率完成）
        const completed = Math.random() < 0.6;
        
        demoTasks.push({
          id: `demo_${i}`,
          title: `示例任务 ${i + 1}`,
          type: types[typeIndex],
          date: dateStr,
          status: completed ? 1 : 0,
          points: Math.floor(Math.random() * 20) + 1
        });
      }
      
      // 更新演示数据
      this.setData({ 
        allTasks: demoTasks,
        isDemoData: true 
      });
      
      wx.showToast({
        title: '已加载演示数据',
        icon: 'none',
        duration: 2000
      });
    } catch (error) {
      console.error('生成演示数据失败:', error);
    }
  },

  /**
   * 重置演示数据
   */
  resetDemoData: function() {
    if (this.data.isDemoData) {
      this.loadAllTasks();
      this.setData({ isDemoData: false });
      
      wx.showToast({
        title: '已恢复真实数据',
        icon: 'none',
        duration: 2000
      });
    }
  },

  /**
   * 处理任务标题输入
   */
  onTaskTitleInput: function(e) {
    this.setData({
      'newTask.title': e.detail.value,
      'errors.title': ''
    });
    
    console.log('任务标题输入:', e.detail.value);
  },

  /**
   * 选择任务类型
   */
  selectTaskType: function(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      'newTask.type': type
    });
    
    console.log('选择任务类型:', type);
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
    
    console.log('积分更改:', points);
  },

  /**
   * 处理积分输入
   */
  onPointsInput: function(e) {
    let points = parseInt(e.detail.value) || 0;
    
    // 限制积分范围
    points = Math.max(1, Math.min(50, points));
    
    this.setData({
      'newTask.points': points
    });
    
    console.log('积分输入:', points);
  },

  /**
   * 处理描述输入
   */
  onDescriptionInput: function(e) {
    const value = e.detail.value;
    
    // 记录日志
    console.log('描述输入:', value, `长度: ${value.length}/${this.data.descMaxLength}`);
    
    this.setData({
      'newTask.description': value
    });
  },

  /**
   * 清空任务表单
   */
  clearTaskForm: function() {
    // 获取当前日期和时间用于重置
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
    
    this.setData({
      newTask: {
        title: '',
        type: 'habit',
        points: 5,
        description: '',
        isAllDay: false,
        startDate: dateStr,
        startTime: timeStr,
        endDate: dateStr,
        endTime: endTimeStr,
        repeat: {
          type: 'none',
          enabled: false,
          days: []
        },
        reminder: {
          enabled: false,
          time: 0
        }
      },
      errors: {
        title: ''
      },
      repeatText: '永不',
      reminderText: '无',
      showRepeatOptions: false,
      showReminderOptions: false,
      startTimePickerValue: [hour, minute],
      endTimePickerValue: [endHour, minute]
    });
    
    console.log('[TaskEdit] 表单已清空');
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
    
    // 验证日期和时间
    if (!this.data.newTask.startDate) {
      wx.showToast({
        title: '请选择开始日期',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    if (!this.data.newTask.endDate) {
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
        points: this.data.newTask.points,
        description: this.data.newTask.description,
        date: this.data.newTask.startDate,
        isAllDay: this.data.newTask.isAllDay,
        startTime: this.data.newTask.isAllDay ? null : this.data.newTask.startTime,
        endTime: this.data.newTask.isAllDay ? null : this.data.newTask.endTime,
        endDate: this.data.newTask.endDate,
        repeat: {
          type: this.data.newTask.repeat.type,
          enabled: this.data.newTask.repeat.enabled,
          startDate: this.data.newTask.startDate,
          endDate: this.data.newTask.repeat.type !== 'none' ? this.data.newTask.endDate : null,
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
    
    this.setData({
      'newTask.startDate': dateStr,
      'newTask.startTime': timeStr,
      'newTask.endDate': dateStr,
      'newTask.endTime': endTimeStr,
      // 设置年月选择器数据
      startYearMonth: yearMonthStr,
      endYearMonth: yearMonthStr,
      startYearMonthText: yearMonthText,
      endYearMonthText: yearMonthText
    });
    
    // 初始化日历数据
    this.generateCalendarDays('start');
    this.generateCalendarDays('end');
    
    console.log('[TaskEdit] 初始化日期时间:', {
      startDate: dateStr,
      startTime: timeStr,
      endDate: dateStr,
      endTime: endTimeStr,
      yearMonth: yearMonthText
    });
  },

  /**
   * 全天开关切换
   */
  toggleAllDay: function(e) {
    const isAllDay = e.detail.value;
    console.log('[TaskEdit] 全天开关切换:', isAllDay);
    
    this.setData({
      'newTask.isAllDay': isAllDay
    });
  },
  
  /**
   * 开始日期选择
   */
  onStartDateChange: function(e) {
    const date = e.detail.value;
    console.log('[TaskEdit] 开始日期选择:', date);
    
    this.setData({
      'newTask.startDate': date
    });
    
    // 如果结束日期为空或早于开始日期，自动设置结束日期为开始日期
    if (!this.data.newTask.endDate || this.data.newTask.endDate < date) {
      this.setData({
        'newTask.endDate': date
      });
    }
  },
  
  /**
   * 开始时间选择
   */
  onStartTimeChange: function(e) {
    const time = e.detail.value;
    console.log('[TaskEdit] 开始时间选择:', time);
    
    this.setData({
      'newTask.startTime': time
    });
    
    // 如果结束时间为空或早于开始时间，自动调整结束时间
    if (this.data.newTask.startDate === this.data.newTask.endDate) {
      const startHour = parseInt(time.split(':')[0]);
      const startMinute = parseInt(time.split(':')[1]);
      
      if (!this.data.newTask.endTime) {
        // 如果结束时间为空，设置为开始时间+1小时
        const endHour = (startHour + 1) % 24;
        this.setData({
          'newTask.endTime': `${endHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`
        });
      } else {
        // 如果结束时间早于开始时间，设置为开始时间+1小时
        const endHour = parseInt(this.data.newTask.endTime.split(':')[0]);
        const endMinute = parseInt(this.data.newTask.endTime.split(':')[1]);
        
        if (startHour > endHour || (startHour === endHour && startMinute >= endMinute)) {
          const newEndHour = (startHour + 1) % 24;
          this.setData({
            'newTask.endTime': `${newEndHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`
          });
        }
      }
    }
  },
  
  /**
   * 结束日期选择
   */
  onEndDateChange: function(e) {
    const date = e.detail.value;
    console.log('[TaskEdit] 结束日期选择:', date);
    
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
  },
  
  /**
   * 结束时间选择
   */
  onEndTimeChange: function(e) {
    const time = e.detail.value;
    console.log('[TaskEdit] 结束时间选择:', time);
    
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
  },
  
  /**
   * 切换重复选项
   */
  toggleRepeatOptions: function() {
    this.setData({
      showRepeatOptions: !this.data.showRepeatOptions,
      showReminderOptions: false // 关闭提醒选项
    });
    
    console.log('[TaskEdit] 切换重复选项:', this.data.showRepeatOptions);
  },
  
  /**
   * 选择重复类型
   */
  selectRepeatType: function(e) {
    const type = e.currentTarget.dataset.type;
    console.log('[TaskEdit] 选择重复类型:', type);
    
    let repeatText = '';
    switch (type) {
      case 'none':
        repeatText = '永不';
        break;
      case 'daily':
        repeatText = '每天';
        break;
      case 'weekly':
        repeatText = '每周';
        break;
      case 'workdays':
        repeatText = '工作日';
        break;
    }
    
    this.setData({
      'newTask.repeat.type': type,
      'newTask.repeat.enabled': type !== 'none',
      repeatText: repeatText
    });
  },
  
  /**
   * 切换提醒选项
   */
  toggleReminderOptions: function() {
    this.setData({
      showReminderOptions: !this.data.showReminderOptions,
      showRepeatOptions: false // 关闭重复选项
    });
    
    console.log('[TaskEdit] 切换提醒选项:', this.data.showReminderOptions);
  },
  
  /**
   * 选择提醒类型
   */
  selectReminderType: function(e) {
    const enabled = e.currentTarget.dataset.enabled === 'true';
    const time = parseInt(e.currentTarget.dataset.time || 0);
    console.log('[TaskEdit] 选择提醒类型:', { enabled, time });
    
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
      reminderText: reminderText
    });
  },

  /**
   * 比较两个时间字符串的大小
   * 返回值：1表示time1大于time2，0表示相等，-1表示time1小于time2
   */
  compareTimeStrings: function(time1, time2) {
    const [hours1, minutes1] = time1.split(':').map(Number);
    const [hours2, minutes2] = time2.split(':').map(Number);
    
    if (hours1 > hours2) return 1;
    if (hours1 < hours2) return -1;
    if (minutes1 > minutes2) return 1;
    if (minutes1 < minutes2) return -1;
    return 0;
  },
  
  /**
   * 检查并调整结束时间
   */
  checkAndAdjustEndTime: function(startTime) {
    if (this.data.newTask.startDate === this.data.newTask.endDate && 
        this.data.newTask.endTime) {
      const startTimeValue = startTime || this.data.newTask.startTime;
      
      if (this.compareTimeStrings(startTimeValue, this.data.newTask.endTime) >= 0) {
        // 如果开始时间晚于或等于结束时间，将结束时间设置为开始时间后一小时
        const [hours, minutes] = startTimeValue.split(':').map(Number);
        const newEndHour = (hours + 1) % 24;
        const newEndTime = `${newEndHour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        
        this.setData({
          'newTask.endTime': newEndTime,
        });
        
        console.log('[TaskEdit] 调整结束时间:', newEndTime);
      }
    }
  },

  /**
   * 切换日期面板
   */
  togglePanel: function(e) {
    const panelName = e.currentTarget.dataset.panel;
    console.log('[TaskEdit] 切换日期面板:', panelName);
    
    // 关闭其他面板
    if (panelName === 'startDatePanel') {
      this.setData({
        startDatePanel: !this.data.startDatePanel,
        endDatePanel: false,
        showRepeatOptions: false,
        showReminderOptions: false
      });
    } else if (panelName === 'endDatePanel') {
      this.setData({
        endDatePanel: !this.data.endDatePanel,
        startDatePanel: false,
        showRepeatOptions: false,
        showReminderOptions: false
      });
    }
    
    // 如果打开面板，生成日历数据
    if ((panelName === 'startDatePanel' && this.data.startDatePanel) || 
        (panelName === 'endDatePanel' && this.data.endDatePanel)) {
      const type = panelName === 'startDatePanel' ? 'start' : 'end';
      this.generateCalendarDays(type);
    }
  },
  
  /**
   * 生成简化版日历数据
   */
  generateCalendarDays: function(type, customYear, customMonth) {
    const today = new Date();
    
    // 使用自定义年月或从已选日期中获取
    let year, month;
    if (customYear !== undefined && customMonth !== undefined) {
      year = customYear;
      month = customMonth;
    } else {
      const selectedDate = type === 'start' ? this.data.newTask.startDate : this.data.newTask.endDate;
      const selectedDateObj = selectedDate ? new Date(selectedDate) : today;
      year = selectedDateObj.getFullYear();
      month = selectedDateObj.getMonth();
    }
    
    // 更新年月文本显示
    const yearMonthText = `${year}年${month + 1}月`;
    const yearMonth = `${year}-${(month + 1) < 10 ? '0' + (month + 1) : (month + 1)}`;
    
    this.setData({
      [type + 'YearMonth']: yearMonth,
      [type + 'YearMonthText']: yearMonthText
    });
    
    console.log(`[TaskEdit] 生成${type}日历数据`, year, month + 1);
    
    // 获取当月的第一天和最后一天
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // 获取当月第一天是星期几(0-6)并调整为1-7,以适应周一开始
    const firstDayOfWeek = firstDay.getDay() || 7;
    
    // 计算上月显示的天数
    const daysFromPrevMonth = firstDayOfWeek - 1;
    
    // 当月的总天数
    const daysInMonth = lastDay.getDate();
    
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();
    
    let days = [];
    
    // 添加上月的日期
    if (daysFromPrevMonth > 0) {
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const prevMonthLastDay = new Date(year, month, 0).getDate();
      
      for (let i = prevMonthLastDay - daysFromPrevMonth + 1; i <= prevMonthLastDay; i++) {
        const date = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        days.push({
          day: i,
          date,
          currentMonth: false,
          isToday: (prevYear === todayYear && prevMonth === todayMonth && i === todayDate)
        });
      }
    }
    
    // 添加当月的日期
    for (let i = 1; i <= daysInMonth; i++) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({
        day: i,
        date,
        currentMonth: true,
        isToday: (year === todayYear && month === todayMonth && i === todayDate)
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
        days.push({
          day: i,
          date,
          currentMonth: false,
          isToday: (nextYear === todayYear && nextMonth === todayMonth && i === todayDate)
        });
      }
    }
    
    if (type === 'start') {
      this.setData({ startCalendarDays: days });
    } else {
      this.setData({ endCalendarDays: days });
    }
    
    console.log(`[TaskEdit] 日历生成完成，共${days.length}天`);
  },
  
  /**
   * 选择开始日期
   */
  selectStartDate: function(e) {
    const date = e.currentTarget.dataset.date;
    console.log('[TaskEdit] 选择开始日期:', date);
    
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
  },
  
  /**
   * 选择结束日期
   */
  selectEndDate: function(e) {
    const date = e.currentTarget.dataset.date;
    console.log('[TaskEdit] 选择结束日期:', date);
    
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
  },
  
  /**
   * 防止点击面板内部关闭面板
   */
  preventClose: function(e) {
    // 阻止事件冒泡
    return;
  },

  /**
   * 关闭所有面板
   */
  closeAllPanels: function() {
    // 记录当前开启的面板状态
    const panelStates = {
      startDatePanel: this.data.startDatePanel,
      endDatePanel: this.data.endDatePanel,
      showRepeatOptions: this.data.showRepeatOptions,
      showReminderOptions: this.data.showReminderOptions
    };
    
    console.log('[TaskEdit] 关闭所有面板', panelStates);
    
    this.setData({
      startDatePanel: false,
      endDatePanel: false,
      showRepeatOptions: false,
      showReminderOptions: false
    });
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
    
    const newYearMonth = `${year}-${month < 10 ? '0' + month : month}`;
    const newYearMonthText = `${year}年${month}月`;
    
    console.log(`[TaskEdit] 更改${type}月份:`, newYearMonthText);
    
    // 重新生成日历数据
    this.generateCalendarDays(type === 'start' ? 'start' : 'end', year, month - 1);
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
    
    const newYearMonth = `${year}-${month < 10 ? '0' + month : month}`;
    const newYearMonthText = `${year}年${month}月`;
    
    // 显示提示
    wx.showToast({
      title: `切换至${year}年`,
      icon: 'none',
      duration: 1000
    });
    
    console.log(`[TaskEdit] 更改${type}年份:`, newYearMonthText);
    
    // 重新生成日历数据
    this.generateCalendarDays(type === 'start' ? 'start' : 'end', year, month - 1);
  },

  /**
   * 直接选择年月
   */
  onYearMonthChange: function(e) {
    const type = e.currentTarget.dataset.type; // start 或 end
    const value = e.detail.value; // 格式：2023-05
    
    let [year, month] = value.split('-').map(Number);
    const newYearMonthText = `${year}年${month}月`;
    
    console.log(`[TaskEdit] 选择${type}年月:`, newYearMonthText);
    
    // 重新生成日历数据
    this.generateCalendarDays(type === 'start' ? 'start' : 'end', year, month - 1);
  },
}) 