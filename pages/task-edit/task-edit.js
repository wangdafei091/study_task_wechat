const app = getApp();
const Constants = require('../../utils/constants.js');

Page({
  /**
   * 页面的初始数据
   */
  data: {
    allTasks: [],
    heatmapYear: null,
    heatmapMonthIndex: null,
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
      startTime: '08:00',
      endDate: '',
      endTime: '09:00',
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
    descMaxLength: Constants.DESCRIPTION.MAX_LENGTH,
    descPlaceholder: Constants.DESCRIPTION.PLACEHOLDER,
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
    hours: ['06', '07', '08', '09', '10', '11', '14', '15', '16', '17', '18', '19', '20', '21'], // 从早6点到晚9点，去除12点和13点
    minutes: ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'], // 每5分钟一个选项
    startSelectedHour: '08',
    startSelectedMinute: '00',
    endSelectedHour: '09',
    endSelectedMinute: '00'
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
    
    // 日期选择事件由热力图组件内部处理，这里可以添加额外的业务逻辑
    // 例如记录最近查看的日期，或者与其他组件联动
    
    // 如果需要，可以通过以下方式获取热力图组件实例
    // const heatmap = this.selectComponent('#taskHeatmap');
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
    
    const hour = ("0" + today.getHours()).slice(-2);
    const minute = ("0" + today.getMinutes()).slice(-2);
    const timeStr = `${hour}:${minute}`;
    
    // 计算结束时间，默认为开始时间后一小时
    const endHour = ("0" + ((today.getHours() + 1) % 24)).slice(-2);
    const endTimeStr = `${endHour}:${minute}`;
    
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
      showReminderOptions: false
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
    
    const hour = ("0" + today.getHours()).slice(-2);
    const minute = ("0" + today.getMinutes()).slice(-2);
    const timeStr = `${hour}:${minute}`;
    
    // 计算结束时间，默认为开始时间后一小时
    const endHour = ("0" + ((today.getHours() + 1) % 24)).slice(-2);
    const endTimeStr = `${endHour}:${minute}`;
    
    this.setData({
      'newTask.startDate': dateStr,
      'newTask.startTime': timeStr,
      'newTask.endDate': dateStr,
      'newTask.endTime': endTimeStr,
      startSelectedHour: hour,
      startSelectedMinute: minute,
      endSelectedHour: endHour,
      endSelectedMinute: minute,
      startPanelYear: year,
      startPanelMonth: parseInt(month),
      endPanelYear: year,
      endPanelMonth: parseInt(month)
    });
    
    // 初始化日历数据
    this.generateCalendarDays('start');
    this.generateCalendarDays('end');
    
    console.log('[TaskEdit] 初始化日期时间:', {
      startDate: dateStr,
      startTime: timeStr,
      endDate: dateStr,
      endTime: endTimeStr
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
    
    let repeatText = '永不';
    switch (type) {
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
      repeatText: repeatText,
      showRepeatOptions: false
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
      reminderText: reminderText,
      showReminderOptions: false
    });
  },

  /**
   * 切换面板显示
   */
  togglePanel: function(e) {
    // 获取面板标识
    const panelName = e.currentTarget.dataset.panel;
    const isDisabled = e.currentTarget.dataset.disabled === 'true';
    
    // 如果控件被禁用，则不执行任何操作
    if (isDisabled) {
      return;
    }
    
    // 创建要更新的数据对象
    const updateData = {};
    
    // 所有可能的面板列表
    const allPanels = [
      'startDatePanel', 'startTimePanel', 
      'endDatePanel', 'endTimePanel',
      'showRepeatOptions', 'showReminderOptions'
    ];
    
    // 关闭所有面板
    allPanels.forEach(panel => {
      updateData[panel] = false;
    });
    
    // 切换当前面板状态
    updateData[panelName] = !this.data[panelName];
    
    // 更新数据
    this.setData(updateData);
    
    console.log(`[TaskEdit] 切换${panelName}面板:`, this.data[panelName]);
  },
  
  /**
   * 生成日历天数据
   */
  generateCalendarDays: function(type) {
    const year = type === 'start' ? this.data.startPanelYear : this.data.endPanelYear;
    const month = type === 'start' ? this.data.startPanelMonth : this.data.endPanelMonth;
    
    console.log(`[TaskEdit] 开始生成${type}日历数据`, year, month);
    
    // 获取当月第一天是星期几 (注意JS中月份从0开始)
    const firstDay = new Date(year, month - 1, 1).getDay();
    // 星期天是0，调整为7，以适应周一开始的日历
    const firstDayOfWeek = firstDay === 0 ? 7 : firstDay;
    
    // 获取当月的天数
    const daysInMonth = new Date(year, month, 0).getDate();
    
    // 获取上个月的天数
    const daysInPrevMonth = new Date(year, month - 1, 0).getDate();
    
    // 获取当前日期
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth() + 1;
    const todayDate = today.getDate();
    
    const days = [];
    
    // 添加上个月的日期
    for (let i = firstDayOfWeek - 1; i > 0; i--) {
      const day = daysInPrevMonth - i + 1;
      let prevMonth = month - 1;
      let prevYear = year;
      
      if (prevMonth < 1) {
        prevMonth = 12;
        prevYear = year - 1;
      }
      
      const date = `${prevYear}-${prevMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      days.push({
        day,
        date,
        currentMonth: false,
        isToday: (prevYear === todayYear && prevMonth === todayMonth && day === todayDate)
      });
    }
    
    // 添加当月的日期
    for (let i = 1; i <= daysInMonth; i++) {
      const date = `${year}-${month.toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
      days.push({
        day: i,
        date,
        currentMonth: true,
        isToday: (year === todayYear && month === todayMonth && i === todayDate)
      });
    }
    
    // 计算需要添加的下个月日期数量
    // 计算当前用了多少格子
    const totalDays = firstDayOfWeek - 1 + daysInMonth;
    // 计算需要多少行展示(向上取整)
    const rowsNeeded = Math.ceil(totalDays / 7);
    // 计算展示这些行需要的总格子数
    const totalCells = rowsNeeded * 7;
    // 需要添加的下个月天数
    const remainingDays = totalCells - totalDays;
    
    console.log(`[TaskEdit] 日历计算: 当月${daysInMonth}天, 需要${rowsNeeded}行, 总格子${totalCells}, 剩余${remainingDays}个格子`);
    
    // 添加下个月的日期
    for (let i = 1; i <= remainingDays; i++) {
      let nextMonth = month + 1;
      let nextYear = year;
      
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear = year + 1;
      }
      
      const date = `${nextYear}-${nextMonth.toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
      days.push({
        day: i,
        date,
        currentMonth: false,
        isToday: (nextYear === todayYear && nextMonth === todayMonth && i === todayDate)
      });
    }
    
    if (type === 'start') {
      this.setData({
        startCalendarDays: days
      });
    } else {
      this.setData({
        endCalendarDays: days
      });
    }
    
    console.log(`[TaskEdit] 生成${type}日历数据完成`, days.length, '天');
  },
  
  /**
   * 切换月份
   */
  prevMonth: function(e) {
    const type = e.currentTarget.dataset.type;
    let year, month;
    
    if (type === 'start') {
      year = this.data.startPanelYear;
      month = this.data.startPanelMonth - 1;
      
      if (month < 1) {
        month = 12;
        year--;
      }
      
      this.setData({
        startPanelYear: year,
        startPanelMonth: month
      });
    } else {
      year = this.data.endPanelYear;
      month = this.data.endPanelMonth - 1;
      
      if (month < 1) {
        month = 12;
        year--;
      }
      
      this.setData({
        endPanelYear: year,
        endPanelMonth: month
      });
    }
    
    this.generateCalendarDays(type);
    console.log(`[TaskEdit] ${type}面板切换到上个月:`, year, month, '用户操作');
  },
  
  nextMonth: function(e) {
    const type = e.currentTarget.dataset.type;
    let year, month;
    
    if (type === 'start') {
      year = this.data.startPanelYear;
      month = this.data.startPanelMonth + 1;
      
      if (month > 12) {
        month = 1;
        year++;
      }
      
      this.setData({
        startPanelYear: year,
        startPanelMonth: month
      });
    } else {
      year = this.data.endPanelYear;
      month = this.data.endPanelMonth + 1;
      
      if (month > 12) {
        month = 1;
        year++;
      }
      
      this.setData({
        endPanelYear: year,
        endPanelMonth: month
      });
    }
    
    this.generateCalendarDays(type);
    console.log(`[TaskEdit] ${type}面板切换到下个月:`, year, month, '用户操作');
  },
  
  /**
   * 选择日期
   */
  selectStartDate: function(e) {
    const date = e.currentTarget.dataset.date;
    console.log('[TaskEdit] 选择开始日期:', date, '用户点击');
    
    this.setData({
      'newTask.startDate': date,
      startDatePanel: false
    });
    
    // 如果结束日期早于开始日期，调整结束日期
    if (this.data.newTask.endDate < date) {
      this.setData({
        'newTask.endDate': date
      });
      console.log('[TaskEdit] 自动调整结束日期为:', date, '(原结束日期早于新开始日期)');
    }
  },
  
  selectEndDate: function(e) {
    const date = e.currentTarget.dataset.date;
    console.log('[TaskEdit] 选择结束日期:', date, '用户点击');
    
    // 确保结束日期不早于开始日期
    if (this.data.newTask.startDate && date < this.data.newTask.startDate) {
      wx.showToast({
        title: '结束日期不能早于开始日期',
        icon: 'none',
        duration: 2000
      });
      console.log('[TaskEdit] 结束日期选择被拒绝:', date, '早于开始日期', this.data.newTask.startDate);
      return;
    }
    
    this.setData({
      'newTask.endDate': date,
      endDatePanel: false
    });
  },
  
  /**
   * 选择时间
   */
  selectStartHour: function(e) {
    const hour = e.currentTarget.dataset.hour;
    console.log('[TaskEdit] 选择开始小时:', hour);
    
    const time = `${hour}:${this.data.startSelectedMinute}`;
    
    this.setData({
      'newTask.startTime': time,
      startSelectedHour: hour
    });
    
    // 如果结束时间与开始时间在同一天且早于开始时间，调整结束时间
    this.checkAndAdjustEndTime(time);
  },
  
  selectStartMinute: function(e) {
    const minute = e.currentTarget.dataset.minute;
    console.log('[TaskEdit] 选择开始分钟:', minute);
    
    const time = `${this.data.startSelectedHour}:${minute}`;
    
    this.setData({
      'newTask.startTime': time,
      startSelectedMinute: minute
    });
    
    // 如果结束时间与开始时间在同一天且早于开始时间，调整结束时间
    this.checkAndAdjustEndTime(time);
  },
  
  selectEndHour: function(e) {
    const hour = e.currentTarget.dataset.hour;
    console.log('[TaskEdit] 选择结束小时:', hour);
    
    const time = `${hour}:${this.data.endSelectedMinute}`;
    
    // 如果与开始时间在同一天，需要检查是否早于开始时间
    if (this.data.newTask.startDate === this.data.newTask.endDate && 
        this.data.newTask.startTime &&
        this.compareTimeStrings(this.data.newTask.startTime, time) > 0) {
      wx.showToast({
        title: '结束时间不能早于开始时间',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    this.setData({
      'newTask.endTime': time,
      endSelectedHour: hour
    });
  },
  
  selectEndMinute: function(e) {
    const minute = e.currentTarget.dataset.minute;
    console.log('[TaskEdit] 选择结束分钟:', minute);
    
    const time = `${this.data.endSelectedHour}:${minute}`;
    
    // 如果与开始时间在同一天，需要检查是否早于开始时间
    if (this.data.newTask.startDate === this.data.newTask.endDate && 
        this.data.newTask.startTime &&
        this.compareTimeStrings(this.data.newTask.startTime, time) > 0) {
      wx.showToast({
        title: '结束时间不能早于开始时间',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    this.setData({
      'newTask.endTime': time,
      endSelectedMinute: minute
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
          endSelectedHour: newEndHour.toString().padStart(2, '0'),
          endSelectedMinute: minutes.toString().padStart(2, '0')
        });
        
        console.log('[TaskEdit] 调整结束时间:', newEndTime);
      }
    }
  },
  
  /**
   * 选择今天
   */
  selectToday: function(e) {
    const type = e.currentTarget.dataset.type;
    
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    
    console.log(`[TaskEdit] 选择${type === 'start' ? '开始' : '结束'}日期为今天:`, dateStr, '用户点击');
    
    if (type === 'start') {
      this.setData({
        'newTask.startDate': dateStr,
        startDatePanel: false,
        startPanelYear: year,
        startPanelMonth: month
      });
      
      // 如果结束日期早于今天，调整结束日期
      if (this.data.newTask.endDate < dateStr) {
        this.setData({
          'newTask.endDate': dateStr
        });
        console.log('[TaskEdit] 自动调整结束日期为今天:', dateStr, '(原结束日期早于今天)');
      }
      
      this.generateCalendarDays('start');
    } else {
      // 确保结束日期不早于开始日期
      if (this.data.newTask.startDate && dateStr < this.data.newTask.startDate) {
        wx.showToast({
          title: '结束日期不能早于开始日期',
          icon: 'none',
          duration: 2000
        });
        console.log('[TaskEdit] 结束日期选择今天被拒绝:', dateStr, '早于开始日期', this.data.newTask.startDate);
        return;
      }
      
      this.setData({
        'newTask.endDate': dateStr,
        endDatePanel: false,
        endPanelYear: year,
        endPanelMonth: month
      });
      
      this.generateCalendarDays('end');
    }
  },
  
  /**
   * 选择快捷时间
   */
  selectQuickTime: function(e) {
    const time = e.currentTarget.dataset.time;
    const type = e.currentTarget.dataset.type;
    
    if (type === 'start') {
      // 如果结束时间与开始时间在同一天且早于新的开始时间，调整结束时间
      if (this.data.newTask.startDate === this.data.newTask.endDate && 
          this.data.newTask.endTime &&
          this.compareTimeStrings(time, this.data.newTask.endTime) >= 0) {
        // 计算新的结束时间，默认为开始时间后一小时
        const [hours, minutes] = time.split(':').map(Number);
        const newEndHour = (hours + 1) % 24;
        const newEndTime = `${newEndHour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        
        this.setData({
          'newTask.endTime': newEndTime,
          endSelectedHour: newEndHour.toString().padStart(2, '0'),
          endSelectedMinute: minutes.toString().padStart(2, '0')
        });
      }
      
      this.setData({
        'newTask.startTime': time,
        startTimePanel: false,
        startSelectedHour: time.split(':')[0],
        startSelectedMinute: time.split(':')[1]
      });
    } else {
      // 如果与开始时间在同一天，需要检查是否早于开始时间
      if (this.data.newTask.startDate === this.data.newTask.endDate && 
          this.data.newTask.startTime &&
          this.compareTimeStrings(this.data.newTask.startTime, time) > 0) {
        wx.showToast({
          title: '结束时间不能早于开始时间',
          icon: 'none',
          duration: 2000
        });
        return;
      }
      
      this.setData({
        'newTask.endTime': time,
        endTimePanel: false,
        endSelectedHour: time.split(':')[0],
        endSelectedMinute: time.split(':')[1]
      });
    }
    
    console.log(`[TaskEdit] 选择${type === 'start' ? '开始' : '结束'}快捷时间:`, time);
  },
}) 