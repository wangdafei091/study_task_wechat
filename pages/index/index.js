const app = getApp()

Page({
  data: {
    userInfo: {},
    hasUserInfo: false,
    canIUse: wx.canIUse('button.open-type.getUserInfo'),
    currentWeek: [],
    currentMonth: [],
    calendarViewMode: 'week', // 'week' 或 'month'
    selectedDate: '',
    selectedMonthStr: '',
    weekDays: ['日', '一', '二', '三', '四', '五', '六'],
    rewardProgress: {
      current: 2,
      total: 3
    },
    upcomingTask: {
      name: '新冠语文课',
      timeRemaining: 2
    },
    tasks: [
      {
        id: 1,
        type: 'clock',
        title: '独立刷牙',
        status: 0, // 0-未完成，1-已完成
        hasImage: false
      },
      {
        id: 2,
        type: 'bag',
        title: '整理书包',
        status: 0,
        hasImage: false
      },
      {
        id: 3,
        type: 'study',
        title: '数学作业',
        status: 1,
        hasImage: true
      }
    ],
    // 统计数据
    stats: {
      totalTasks: 0,
      completedTasks: 0,
      completionRate: 0,
      streak: 0, // 连续完成天数
      typeCounts: {
        clock: 0,
        bag: 0,
        study: 0
      }
    },
    showStats: false, // 是否显示统计面板

    // 搜索相关
    showSearch: false,
    searchQuery: '',
    searchResults: [],
    searchFilters: {
      type: '',
      status: '',
      dateRange: ''
    }
  },
  onLoad: function () {
    this.initWeekDays()
    this.initMonthDays()
    this.setCurrentDate()
    
    if (app.globalData.userInfo) {
      this.setData({
        userInfo: app.globalData.userInfo,
        hasUserInfo: true
      })
    } else if (this.data.canIUse) {
      app.userInfoReadyCallback = res => {
        this.setData({
          userInfo: res.userInfo,
          hasUserInfo: true
        })
      }
    } else {
      wx.getUserInfo({
        success: res => {
          app.globalData.userInfo = res.userInfo
          this.setData({
            userInfo: res.userInfo,
            hasUserInfo: true
          })
        }
      })
    }

    // 从本地存储加载任务数据
    this.loadTaskData();
  },
  
  onShow: function() {
    // 页面显示时重新加载任务数据和统计信息
    this.loadTaskData();
  },

  // 加载任务数据
  loadTaskData: function() {
    // 从本地存储或全局状态获取任务
    const app = getApp();
    const storedTasks = app.globalData.tasks;
    
    if (storedTasks && storedTasks.length > 0) {
      this.setData({
        tasks: storedTasks
      });
    }

    // 更新统计数据
    this.updateStats();
    // 更新日历任务标记
    this.updateCalendarTasks();
  },

  // 更新日历任务标记
  updateCalendarTasks: function() {
    const tasks = this.data.tasks;
    const currentWeek = [...this.data.currentWeek];
    const currentMonth = [...this.data.currentMonth];
    
    // 更新周视图任务标记
    currentWeek.forEach(day => {
      const dayStr = `${day.year}-${day.month.toString().padStart(2, '0')}-${day.date.toString().padStart(2, '0')}`;
      day.hasTask = tasks.some(task => task.date === dayStr);
    });
    
    // 更新月视图任务标记
    currentMonth.forEach(day => {
      const dayStr = `${day.year}-${day.month.toString().padStart(2, '0')}-${day.date.toString().padStart(2, '0')}`;
      day.hasTask = tasks.some(task => task.date === dayStr);
    });
    
    this.setData({
      currentWeek,
      currentMonth
    });
  },

  // 更新统计数据
  updateStats: function() {
    const tasks = this.data.tasks;
    const completedTasks = tasks.filter(task => task.status === 1).length;
    
    // 计算任务类型统计
    const typeCounts = {
      clock: 0,
      bag: 0,
      study: 0
    };
    
    tasks.forEach(task => {
      if (typeCounts.hasOwnProperty(task.type)) {
        typeCounts[task.type]++;
      }
    });
    
    // 计算连续完成天数（模拟数据，实际应根据历史记录计算）
    const streak = 3;
    
    const stats = {
      totalTasks: tasks.length,
      completedTasks: completedTasks,
      completionRate: tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0,
      streak: streak,
      typeCounts: typeCounts
    };
    
    this.setData({
      stats: stats,
      'rewardProgress.current': completedTasks,
      'rewardProgress.total': tasks.length
    });
  },

  // 显示统计面板
  toggleStats: function() {
    this.setData({
      showStats: !this.data.showStats
    });
  },
  
  // 获取用户信息
  getUserInfo: function (e) {
    app.globalData.userInfo = e.detail.userInfo
    this.setData({
      userInfo: e.detail.userInfo,
      hasUserInfo: true
    })
  },
  
  // 初始化周视图
  initWeekDays: function () {
    const now = new Date()
    const currentDay = now.getDay() // 0 是周日
    const currentDate = now.getDate()
    
    const week = []
    for (let i = 0; i < 7; i++) {
      const dayOffset = i - currentDay
      const date = new Date(now)
      date.setDate(currentDate + dayOffset)
      
      week.push({
        date: date.getDate(),
        day: i,
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        isToday: i === currentDay,
        hasTask: i === 1 || i === 2 || i === 4,
        isSelected: i === currentDay
      })
    }
    
    this.setData({
      currentWeek: week
    })
  },
  
  // 初始化月视图
  initMonthDays: function () {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();
    
    // 获取当月第一天是星期几
    const firstDay = new Date(year, month, 1).getDay();
    
    // 获取当月的天数
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // 获取上个月的天数
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    const days = [];
    
    // 添加上个月的日期
    for (let i = firstDay - 1; i >= 0; i--) {
      const prevMonthDay = daysInPrevMonth - i;
      const prevMonth = month === 0 ? 12 : month;
      const prevYear = month === 0 ? year - 1 : year;
      
      days.push({
        date: prevMonthDay,
        day: days.length % 7,
        month: prevMonth,
        year: prevYear,
        isCurrentMonth: false,
        isToday: false,
        hasTask: false
      });
    }
    
    // 添加当月的日期
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: i,
        day: days.length % 7,
        month: month + 1,
        year: year,
        isCurrentMonth: true,
        isToday: i === today,
        hasTask: false,
        isSelected: i === today
      });
    }
    
    // 添加下个月的日期填充网格（确保总数能被7整除）
    const remainingDays = 7 - (days.length % 7);
    if (remainingDays < 7) {
      const nextMonth = month === 11 ? 1 : month + 2;
      const nextYear = month === 11 ? year + 1 : year;
      
      for (let i = 1; i <= remainingDays; i++) {
        days.push({
          date: i,
          day: days.length % 7,
          month: nextMonth,
          year: nextYear,
          isCurrentMonth: false,
          isToday: false,
          hasTask: false
        });
      }
    }
    
    this.setData({
      currentMonth: days
    });
  },
  
  // 设置当前选中日期
  setCurrentDate: function () {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const weekNumber = this.getWeekOfMonth(now)
    
    this.setData({
      selectedDate: `${year}年${month}月第${weekNumber}周`,
      selectedMonthStr: `${year}年${month}月`
    })
  },
  
  // 获取当前是本月第几周
  getWeekOfMonth: function (date) {
    const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const dayOfWeek = firstDayOfMonth.getDay();
    return Math.ceil((date.getDate() + dayOfWeek) / 7);
  },
  
  // 选择日期
  selectDate: function (e) {
    const index = e.detail.index;
    const date = e.detail.date;
    
    if (this.data.calendarViewMode === 'week') {
      const weekCopy = [...this.data.currentWeek];
      weekCopy.forEach((day, i) => {
        day.isSelected = i === index;
      });
      
      this.setData({
        currentWeek: weekCopy
      });
    } else {
      const monthCopy = [...this.data.currentMonth];
      monthCopy.forEach((day, i) => {
        day.isSelected = i === index;
      });
      
      this.setData({
        currentMonth: monthCopy
      });
    }
    
    // 这里可以加载对应日期的任务
    this.loadTasksByDate(date);
  },
  
  // 加载指定日期的任务
  loadTasksByDate: function(dateStr) {
    // 从全部任务中筛选出指定日期的任务
    const allTasks = app.globalData.tasks || [];
    const dayTasks = allTasks.filter(task => task.date === dateStr);
    
    this.setData({
      tasks: dayTasks.length > 0 ? dayTasks : []
    });
  },
  
  // 切换周视图
  changeWeek: function (e) {
    const direction = e.detail.direction;
    const currentWeek = [...this.data.currentWeek];
    const offset = direction === 'prev' ? -7 : 7;
    
    // 以当前周的第一天为基准
    const firstDay = new Date(
      currentWeek[0].year,
      currentWeek[0].month - 1,
      currentWeek[0].date
    );
    
    // 调整日期
    firstDay.setDate(firstDay.getDate() + offset);
    
    // 重新生成周数据
    const week = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(firstDay);
      date.setDate(date.getDate() + i);
      
      const now = new Date();
      const isToday = date.getDate() === now.getDate() && 
                     date.getMonth() === now.getMonth() && 
                     date.getFullYear() === now.getFullYear();
      
      week.push({
        date: date.getDate(),
        day: i,
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        isToday: isToday,
        hasTask: false,
        isSelected: i === 0
      });
    }
    
    // 更新周视图标题
    const year = firstDay.getFullYear();
    const month = firstDay.getMonth() + 1;
    const weekNumber = this.getWeekOfMonth(firstDay);
    
    this.setData({
      currentWeek: week,
      selectedDate: `${year}年${month}月第${weekNumber}周`
    });
    
    // 更新任务标记
    this.updateCalendarTasks();
  },
  
  // 切换月视图
  changeMonth: function (e) {
    const direction = e.detail.direction;
    const currentMonth = [...this.data.currentMonth];
    
    // 找到当月的第一天
    let currentMonthDay = null;
    for (const day of currentMonth) {
      if (day.isCurrentMonth) {
        currentMonthDay = day;
        break;
      }
    }
    
    if (!currentMonthDay) return;
    
    // 创建日期对象并调整月份
    const date = new Date(currentMonthDay.year, currentMonthDay.month - 1, 1);
    if (direction === 'prev') {
      date.setMonth(date.getMonth() - 1);
    } else {
      date.setMonth(date.getMonth() + 1);
    }
    
    // 重新生成月视图数据
    const year = date.getFullYear();
    const month = date.getMonth();
    const today = new Date();
    
    // 获取当月第一天是星期几
    const firstDay = new Date(year, month, 1).getDay();
    
    // 获取当月的天数
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // 获取上个月的天数
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    const days = [];
    
    // 添加上个月的日期
    for (let i = firstDay - 1; i >= 0; i--) {
      const prevMonthDay = daysInPrevMonth - i;
      const prevMonth = month === 0 ? 12 : month;
      const prevYear = month === 0 ? year - 1 : year;
      
      days.push({
        date: prevMonthDay,
        day: days.length % 7,
        month: prevMonth,
        year: prevYear,
        isCurrentMonth: false,
        isToday: false,
        hasTask: false
      });
    }
    
    // 添加当月的日期
    for (let i = 1; i <= daysInMonth; i++) {
      const isToday = i === today.getDate() && 
                     month === today.getMonth() && 
                     year === today.getFullYear();
      
      days.push({
        date: i,
        day: days.length % 7,
        month: month + 1,
        year: year,
        isCurrentMonth: true,
        isToday: isToday,
        hasTask: false,
        isSelected: isToday
      });
    }
    
    // 添加下个月的日期填充网格（确保总数能被7整除）
    const remainingDays = 7 - (days.length % 7);
    if (remainingDays < 7) {
      const nextMonth = month === 11 ? 1 : month + 2;
      const nextYear = month === 11 ? year + 1 : year;
      
      for (let i = 1; i <= remainingDays; i++) {
        days.push({
          date: i,
          day: days.length % 7,
          month: nextMonth,
          year: nextYear,
          isCurrentMonth: false,
          isToday: false,
          hasTask: false
        });
      }
    }
    
    this.setData({
      currentMonth: days,
      selectedMonthStr: `${year}年${month + 1}月`
    });
    
    // 更新当前选中的月份标题
    if (this.data.calendarViewMode === 'month') {
      this.setData({
        selectedDate: `${year}年${month + 1}月`
      });
    }
    
    // 更新任务标记
    this.updateCalendarTasks();
  },
  
  // 切换日历视图模式
  toggleViewMode: function (e) {
    const mode = e.detail.mode;
    let selectedDate = this.data.selectedDate;
    
    if (mode === 'month') {
      // 切换到月视图，更新标题为当前月
      selectedDate = this.data.selectedMonthStr;
    } else {
      // 切换到周视图，从月视图回到周视图时，标题显示当前周
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const weekNumber = this.getWeekOfMonth(now);
      
      selectedDate = `${year}年${month}月第${weekNumber}周`;
      
      // 重置周视图选中状态
      this.initWeekDays();
    }
    
    this.setData({
      calendarViewMode: mode,
      selectedDate: selectedDate
    });
    
    // 重新加载任务
    this.loadTaskData();
  },
  
  // 显示/隐藏搜索面板
  toggleSearch: function() {
    this.setData({
      showSearch: !this.data.showSearch,
      searchQuery: '',
      searchResults: []
    });
  },
  
  // 输入搜索关键词
  inputSearch: function(e) {
    this.setData({
      searchQuery: e.detail.value
    });
    
    // 如果输入为空，清空搜索结果
    if (!e.detail.value.trim()) {
      this.setData({
        searchResults: []
      });
      return;
    }
    
    // 否则执行搜索
    this.performSearch();
  },
  
  // 选择搜索过滤器
  selectFilter: function(e) {
    const { type, value } = e.currentTarget.dataset;
    
    this.setData({
      [`searchFilters.${type}`]: value
    });
    
    // 执行搜索
    this.performSearch();
  },
  
  // 清除搜索过滤器
  clearFilters: function() {
    this.setData({
      searchFilters: {
        type: '',
        status: '',
        dateRange: ''
      }
    });
    
    // 执行搜索
    this.performSearch();
  },
  
  // 执行搜索
  performSearch: function() {
    const query = this.data.searchQuery.toLowerCase().trim();
    const filters = this.data.searchFilters;
    const allTasks = app.globalData.tasks || [];
    
    // 首先基于关键词搜索
    let results = allTasks.filter(task => 
      task.title.toLowerCase().includes(query) || 
      (task.description && task.description.toLowerCase().includes(query))
    );
    
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
      const now = new Date();
      
      if (filters.dateRange === 'today') {
        const today = new Date().toISOString().split('T')[0];
        results = results.filter(task => task.date === today);
      } else if (filters.dateRange === 'week') {
        // 本周范围
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);
        
        results = results.filter(task => {
          const taskDate = new Date(task.date);
          return taskDate >= startOfWeek && taskDate <= endOfWeek;
        });
      } else if (filters.dateRange === 'month') {
        // 本月范围
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        results = results.filter(task => {
          const taskDate = new Date(task.date);
          return taskDate >= startOfMonth && taskDate <= endOfMonth;
        });
      }
    }
    
    // 更新搜索结果
    this.setData({
      searchResults: results
    });
  },
  
  // 前往任务详情
  goToTaskDetail: function (e) {
    const taskId = e.detail.taskId
    wx.navigateTo({
      url: `/pages/task/task?id=${taskId}`
    })
  },
  
  // 创建新任务
  createNewTask: function () {
    wx.navigateTo({
      url: '/pages/create/create'
    })
  },
  
  // 完成任务
  completeTask: function (e) {
    const taskId = e.detail.taskId
    const tasksCopy = [...this.data.tasks]
    
    tasksCopy.forEach(task => {
      if (task.id === taskId) {
        task.status = 1
      }
    })
    
    this.setData({
      tasks: tasksCopy
    })
    
    // 更新全局数据
    const allTasks = app.globalData.tasks || [];
    allTasks.forEach(task => {
      if (task.id === taskId) {
        task.status = 1;
      }
    });
    app.globalData.tasks = allTasks;
    
    // 保存到本地存储
    wx.setStorage({
      key: 'tasks',
      data: allTasks
    });
    
    // 更新统计信息
    this.updateStats();
  },

  // 编辑任务
  editTask: function (e) {
    const taskId = e.detail.taskId
    wx.navigateTo({
      url: `/pages/task/task?id=${taskId}&edit=1`
    })
  }
}) 