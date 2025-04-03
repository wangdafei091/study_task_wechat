Component({
  /**
   * 组件的属性列表
   */
  properties: {
    tasks: {
      type: Array,
      value: []
    },
    currentDate: {
      type: String,
      value: ''
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    viewMode: 'day', // 'day', 'week', 'month' 三种视图模式
    visibleTasks: [], // 当前视图下可见的任务
    groupedTasks: {}, // 按日期分组的任务
    weekDays: [], // 当前周的日期数组
    monthDays: [], // 当前月的日期数组
    currentYear: 0,
    currentMonth: 0,
    currentDay: 0,
    currentWeek: [],
    weekRange: '',
    monthText: ''
  },

  observers: {
    'tasks, currentDate, viewMode': function(tasks, currentDate, viewMode) {
      if (tasks && tasks.length > 0 && currentDate) {
        this.processTaskData(tasks, currentDate, viewMode);
      }
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 初始化组件
    initComponent: function() {
      const today = this.properties.currentDate || this.formatDate(new Date());
      this.setData({
        currentDate: today
      });
      
      // 解析日期
      const dateObj = new Date(today);
      this.setData({
        currentYear: dateObj.getFullYear(),
        currentMonth: dateObj.getMonth(),
        currentDay: dateObj.getDate()
      });
      
      this.processTaskData(this.properties.tasks, today, this.data.viewMode);
    },
    
    // 处理任务数据
    processTaskData: function(tasks, date, viewMode) {
      const dateObj = new Date(date);
      const year = dateObj.getFullYear();
      const month = dateObj.getMonth();
      const day = dateObj.getDate();
      
      // 根据视图模式处理数据
      if (viewMode === 'day') {
        this.processDayView(tasks, dateObj);
      } else if (viewMode === 'week') {
        this.processWeekView(tasks, dateObj);
      } else if (viewMode === 'month') {
        this.processMonthView(tasks, year, month);
      }
    },
    
    // 处理日视图
    processDayView: function(tasks, dateObj) {
      const dateStr = this.formatDate(dateObj);
      const filteredTasks = tasks.filter(task => task.date === dateStr);
      
      // 按时间排序
      filteredTasks.sort((a, b) => {
        if (!a.startTime && !b.startTime) return 0;
        if (!a.startTime) return 1;
        if (!b.startTime) return -1;
        return a.startTime.localeCompare(b.startTime);
      });
      
      // 设置数据
      this.setData({
        visibleTasks: filteredTasks
      });
    },
    
    // 处理周视图
    processWeekView: function(tasks, dateObj) {
      // 获取当前周的起始日期和结束日期
      const currentDay = dateObj.getDay(); // 0是周日，1是周一，...
      const weekStart = new Date(dateObj);
      weekStart.setDate(dateObj.getDate() - currentDay + (currentDay === 0 ? -6 : 1)); // 调整为周一
      
      const weekDays = [];
      const weekTaskGroups = {};
      
      // 生成一周的日期
      for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + i);
        const dayStr = this.formatDate(day);
        
        weekDays.push({
          date: dayStr,
          day: day.getDate(),
          weekDay: this.getWeekdayName(day.getDay()),
          isToday: this.isToday(day),
          isCurrentMonth: day.getMonth() === dateObj.getMonth()
        });
        
        // 筛选当天的任务
        weekTaskGroups[dayStr] = tasks.filter(task => task.date === dayStr);
      }
      
      // 处理重复任务
      const groupedTasks = this.groupRepeatingTasks(tasks, weekDays);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      this.setData({
        weekDays: weekDays,
        groupedTasks: groupedTasks,
        weekRange: `${this.formatDate(weekStart)} - ${this.formatDate(weekEnd)}`,
        currentWeek: weekDays
      });
    },
    
    // 处理月视图
    processMonthView: function(tasks, year, month) {
      // 获取当月第一天和最后一天
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const daysInMonth = lastDay.getDate();
      
      // 获取当月第一天是星期几
      const firstDayOfWeek = firstDay.getDay(); // 0是周日，1是周一，...
      
      // 调整为以周一为一周的第一天
      const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
      
      const monthDays = [];
      const monthTaskGroups = {};
      
      // 上个月的最后几天
      const prevMonthLastDay = new Date(year, month, 0).getDate();
      for (let i = 0; i < startOffset; i++) {
        const day = prevMonthLastDay - startOffset + i + 1;
        const date = new Date(year, month - 1, day);
        const dateStr = this.formatDate(date);
        
        monthDays.push({
          date: dateStr,
          day: day,
          isCurrentMonth: false,
          isToday: this.isToday(date),
          tasks: tasks.filter(task => task.date === dateStr)
        });
      }
      
      // 当月的天数
      for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(year, month, i);
        const dateStr = this.formatDate(date);
        const dayTasks = tasks.filter(task => task.date === dateStr);
        
        monthDays.push({
          date: dateStr,
          day: i,
          isCurrentMonth: true,
          isToday: this.isToday(date),
          tasks: dayTasks
        });
        
        monthTaskGroups[dateStr] = dayTasks;
      }
      
      // 下个月的前几天
      const remainingDays = 42 - (startOffset + daysInMonth); // 6行7列的日历表格
      for (let i = 1; i <= remainingDays; i++) {
        const date = new Date(year, month + 1, i);
        const dateStr = this.formatDate(date);
        
        monthDays.push({
          date: dateStr,
          day: i,
          isCurrentMonth: false,
          isToday: this.isToday(date),
          tasks: tasks.filter(task => task.date === dateStr)
        });
      }
      
      // 处理重复任务
      const groupedTasks = this.groupRepeatingTasks(tasks, monthDays);
      
      const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
      
      this.setData({
        monthDays: monthDays,
        groupedTasks: groupedTasks,
        monthText: `${year}年${monthNames[month]}`
      });
    },
    
    // 将重复任务分组
    groupRepeatingTasks: function(tasks, days) {
      const dateList = days.map(d => d.date);
      const grouped = {};
      
      // 先按每天分组
      dateList.forEach(date => {
        grouped[date] = tasks.filter(task => task.date === date);
      });
      
      // 查找连续多天的相同任务
      const repeatingGroups = [];
      const processedTaskIds = new Set();
      
      tasks.forEach(task => {
        if (processedTaskIds.has(task.id)) return;
        
        // 查找相同标题和类型的任务
        const similarTasks = tasks.filter(t => 
          t.title === task.title && 
          t.type === task.type &&
          dateList.includes(t.date) &&
          !processedTaskIds.has(t.id)
        );
        
        if (similarTasks.length > 1) {
          // 将任务按日期排序
          similarTasks.sort((a, b) => a.date.localeCompare(b.date));
          
          // 检查是否日期连续
          let isConsecutive = true;
          for (let i = 1; i < similarTasks.length; i++) {
            const prevDate = new Date(similarTasks[i-1].date);
            const currDate = new Date(similarTasks[i].date);
            prevDate.setDate(prevDate.getDate() + 1);
            
            if (prevDate.getTime() !== currDate.getTime()) {
              isConsecutive = false;
              break;
            }
          }
          
          if (isConsecutive) {
            // 创建一个跨越多天的任务组
            const group = {
              id: `group_${task.id}`,
              title: task.title,
              type: task.type,
              startDate: similarTasks[0].date,
              endDate: similarTasks[similarTasks.length - 1].date,
              tasks: similarTasks,
              isRepeating: true
            };
            
            repeatingGroups.push(group);
            
            // 标记这些任务已处理
            similarTasks.forEach(t => processedTaskIds.add(t.id));
          }
        }
      });
      
      // 将分组任务添加到结果中
      const result = { ...grouped };
      result.repeatingGroups = repeatingGroups;
      
      return result;
    },
    
    // 切换视图模式
    switchViewMode: function(e) {
      const mode = e.currentTarget.dataset.mode;
      if (mode && mode !== this.data.viewMode) {
        this.setData({ viewMode: mode });
        this.processTaskData(this.properties.tasks, this.properties.currentDate, mode);
      }
    },
    
    // 选择日期
    selectDate: function(e) {
      const date = e.currentTarget.dataset.date;
      if (date) {
        this.triggerEvent('dateSelect', { date });
      }
    },
    
    // 上一个周期
    prevPeriod: function() {
      const { viewMode, currentYear, currentMonth, currentDay } = this.data;
      const currentDate = new Date(currentYear, currentMonth, currentDay);
      
      if (viewMode === 'day') {
        currentDate.setDate(currentDate.getDate() - 1);
      } else if (viewMode === 'week') {
        currentDate.setDate(currentDate.getDate() - 7);
      } else if (viewMode === 'month') {
        currentDate.setMonth(currentDate.getMonth() - 1);
      }
      
      this.triggerEvent('changeDate', { 
        date: this.formatDate(currentDate) 
      });
    },
    
    // 下一个周期
    nextPeriod: function() {
      const { viewMode, currentYear, currentMonth, currentDay } = this.data;
      const currentDate = new Date(currentYear, currentMonth, currentDay);
      
      if (viewMode === 'day') {
        currentDate.setDate(currentDate.getDate() + 1);
      } else if (viewMode === 'week') {
        currentDate.setDate(currentDate.getDate() + 7);
      } else if (viewMode === 'month') {
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
      
      this.triggerEvent('changeDate', { 
        date: this.formatDate(currentDate) 
      });
    },
    
    // 返回今天
    goToToday: function() {
      const today = this.formatDate(new Date());
      this.triggerEvent('changeDate', { date: today });
    },
    
    // 任务点击事件
    onTaskTap: function(e) {
      const taskId = e.currentTarget.dataset.id;
      this.triggerEvent('taskTap', { taskId });
    },
    
    // 完成任务事件
    completeTask: function(e) {
      const taskId = e.currentTarget.dataset.id;
      this.triggerEvent('complete', { taskId });
    },
    
    // 检查日期是否为今天
    isToday: function(date) {
      const today = new Date();
      return date.getDate() === today.getDate() && 
             date.getMonth() === today.getMonth() && 
             date.getFullYear() === today.getFullYear();
    },
    
    // 格式化日期为YYYY-MM-DD
    formatDate: function(date) {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    },
    
    // 获取星期几名称
    getWeekdayName: function(day) {
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      return weekdays[day];
    },
    
    // 获取任务类型对应的文本
    getTaskTypeName: function(type) {
      const typeMap = {
        'clock': '习惯',
        'bag': '整理',
        'study': '学习'
      };
      return typeMap[type] || '任务';
    }
  },
  
  lifetimes: {
    attached: function() {
      this.initComponent();
    }
  }
}) 