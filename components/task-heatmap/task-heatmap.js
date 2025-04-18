Component({
  properties: {
    tasks: {
      type: Array,
      value: [],
      observer: function(newVal) {
        if (newVal && newVal.length > 0) {
          this.calculateHeatMap();
        }
      }
    },
    // 添加外部控制月份的属性
    currentMonth: {
      type: Number,
      value: new Date().getMonth(),
      observer: function(newVal) {
        if (this.data.currentMonth !== newVal) {
          this.setData({ currentMonth: newVal });
          this.generateCalendar();
        }
      }
    },
    currentYear: {
      type: Number,
      value: new Date().getFullYear(),
      observer: function(newVal) {
        if (this.data.currentYear !== newVal) {
          this.setData({ currentYear: newVal });
          this.generateCalendar();
        }
      }
    }
  },
  
  data: {
    days: [],
    weekDays: ['日', '一', '二', '三', '四', '五', '六'],
    monthTitle: '',
    selectedDate: '', // 当前选中的日期
    selectedDateText: '', // 格式化后的日期文本
    showDayTasks: false, // 是否显示日期任务
    dayTasks: [] // 当前日期的任务列表
  },
  
  lifetimes: {
    attached() {
      console.log('[TaskHeatmap] 组件挂载');
      console.log('[TaskHeatmap] 已优化热力图布局，减少垂直空间占用');
      console.log('[TaskHeatmap] 已优化热力图色阶，使用蓝色渐变提高辨识度');
      console.log('[TaskHeatmap] 已优化任务项UI，减轻背景色厚重感，优化布局');
      console.log('[TaskHeatmap] 已优化任务完成状态显示，使用勾标记替代删除线');
      const now = new Date();
      this.setData({
        currentYear: this.properties.currentYear || now.getFullYear(),
        currentMonth: this.properties.currentMonth || now.getMonth()
      });
      this.generateCalendar();
      
      // 初始化完成后，通知父组件当前月份信息
      this.triggerMonthChange();
    },
    
    detached() {
      // 移除定时器清理代码
    }
  },
  
  methods: {
    // 生成日历数据
    generateCalendar() {
      console.log('[TaskHeatmap] 生成日历数据');
      const { currentYear, currentMonth } = this.data;
      const days = [];
      
      // 获取当月第一天是星期几
      const firstDay = new Date(currentYear, currentMonth, 1).getDay();
      // 获取当月最后一天
      const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate();
      
      // 上个月的最后几天
      const prevMonthLastDate = new Date(currentYear, currentMonth, 0).getDate();
      for(let i = 0; i < firstDay; i++) {
        const prevMonthDay = prevMonthLastDate - firstDay + i + 1;
        let prevMonth = currentMonth - 1;
        let yearOfPrevMonth = currentYear;
        
        if (prevMonth < 0) {
          prevMonth = 11;
          yearOfPrevMonth--;
        }
        
        days.push({
          date: `${yearOfPrevMonth}-${String(prevMonth + 1).padStart(2, '0')}-${String(prevMonthDay).padStart(2, '0')}`,
          count: 0,
          level: 0,
          isCurrentMonth: false,
          day: prevMonthDay,
          completed: 0,
          pending: 0
        });
      }
      
      // 当前月的天数
      for(let i = 1; i <= lastDate; i++) {
        days.push({
          date: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
          count: 0,
          level: 0,
          isCurrentMonth: true,
          day: i,
          isToday: this.isToday(currentYear, currentMonth, i),
          completed: 0,
          pending: 0
        });
      }
      
      // 计算需要的行数（根据当前填充的天数确定）
      const totalDaysAdded = firstDay + lastDate;
      const rowsNeeded = Math.ceil(totalDaysAdded / 7);
      // 计算需要补充的下个月天数（确保最后一行是完整的）
      const remainingDays = (rowsNeeded * 7) - totalDaysAdded;
      
      console.log(`[TaskHeatmap] 当月需要${rowsNeeded}行，补充${remainingDays}天`);
      
      // 下个月的前几天
      for(let i = 1; i <= remainingDays; i++) {
        let nextMonth = currentMonth + 1;
        let yearOfNextMonth = currentYear;
        
        if (nextMonth > 11) {
          nextMonth = 0;
          yearOfNextMonth++;
        }
        
        days.push({
          date: `${yearOfNextMonth}-${String(nextMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
          count: 0,
          level: 0,
          isCurrentMonth: false,
          day: i,
          completed: 0,
          pending: 0
        });
      }
      
      // 设置月份标题
      const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', 
                        '七月', '八月', '九月', '十月', '十一月', '十二月'];
      
      this.setData({
        days,
        monthTitle: `${monthNames[currentMonth]} ${currentYear}`
      });
      
      // 计算任务热力
      this.calculateHeatMap();
      
      // 通知父组件月份变化
      this.triggerMonthChange();
    },
    
    // 触发月份变化事件
    triggerMonthChange() {
      const { currentYear, currentMonth, monthTitle } = this.data;
      const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', 
                        '七月', '八月', '九月', '十月', '十一月', '十二月'];
      
      this.triggerEvent('monthChange', {
        year: currentYear,
        month: currentMonth,
        monthName: monthNames[currentMonth],
        title: monthTitle
      });
    },
    
    // 判断是否是今天
    isToday(year, month, day) {
      const today = new Date();
      return year === today.getFullYear() && 
             month === today.getMonth() && 
             day === today.getDate();
    },
    
    // 格式化日期显示
    formatDateDisplay(dateStr) {
      if (!dateStr) return '';
      
      try {
        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        const weekday = this.getWeekdayName(date.getDay());
        return `${month}月${day}日 ${weekday}`;
      } catch (e) {
        console.error('[TaskHeatmap] 日期格式化错误:', e);
        return dateStr;
      }
    },
    
    // 获取星期几名称
    getWeekdayName(day) {
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      return weekdays[day] || '';
    },
    
    // 计算热力图
    calculateHeatMap() {
      console.log('[TaskHeatmap] 计算热力图');
      const { days } = this.data;
      const tasks = this.properties.tasks || [];
      
      if (tasks.length === 0) {
        console.log('[TaskHeatmap] 无任务数据');
        return;
      }
      
      // 打印任务数据示例，用于调试
      if (tasks.length > 0) {
        console.log('[TaskHeatmap] 任务数据示例:', tasks[0]);
      }
      
      // 统计每天的任务数量和完成情况
      const taskCountMap = {};
      const completedMap = {};
      const pendingMap = {};
      
      tasks.forEach(task => {
        if (task.date) {
          // 初始化统计数据
          if (!taskCountMap[task.date]) {
            taskCountMap[task.date] = 0;
            completedMap[task.date] = 0;
            pendingMap[task.date] = 0;
          }
          
          // 增加总任务数
          taskCountMap[task.date]++;
          
          // 根据任务状态计算完成/待办
          if (task.status === 1) {
            completedMap[task.date]++;
          } else {
            pendingMap[task.date]++;
          }
        }
      });
      
      console.log('[TaskHeatmap] 任务统计:', taskCountMap);
      
      // 找出最大任务数，用于计算热力等级
      let maxCount = 0;
      Object.values(taskCountMap).forEach(count => {
        maxCount = Math.max(maxCount, count);
      });
      
      // 更新每天的任务数和热力等级
      const updatedDays = days.map(day => {
        const count = taskCountMap[day.date] || 0;
        const completed = completedMap[day.date] || 0;
        const pending = pendingMap[day.date] || 0;
        
        // 计算热力等级：0-4共5级
        let level = 0;
        if (count > 0) {
          level = Math.min(4, Math.ceil((count / maxCount) * 4));
        }
        
        return {
          ...day,
          count,
          level,
          completed,
          pending
        };
      });
      
      this.setData({ days: updatedDays });
    },
    
    // 切换到上个月
    prevMonth() {
      let { currentYear, currentMonth } = this.data;
      currentMonth--;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      }
      this.setData({
        currentYear,
        currentMonth,
        // 切换月份时清除选中状态
        selectedDate: '',
        showDayTasks: false
      });
      this.generateCalendar();
    },
    
    // 切换到下个月
    nextMonth() {
      let { currentYear, currentMonth } = this.data;
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
      this.setData({
        currentYear,
        currentMonth,
        // 切换月份时清除选中状态
        selectedDate: '',
        showDayTasks: false
      });
      this.generateCalendar();
    },
    
    // 日期点击处理
    onDayTap(e) {
      console.log('[TaskHeatmap] 日期点击');
      
      const dayData = e.currentTarget.dataset.day;
      const date = e.currentTarget.dataset.date;
      
      if (!dayData.isCurrentMonth) {
        return; // 只处理当前月的日期点击
      }
      
      // 如果点击了已选中的日期，则切换显示/隐藏状态
      if (this.data.selectedDate === date) {
        this.setData({
          showDayTasks: !this.data.showDayTasks
        });
        return;
      }
      
      // 筛选该日期的任务
      const dayTasks = this.properties.tasks.filter(task => task.date === date);
      console.log('[TaskHeatmap] 该日期任务数:', dayTasks.length);
      
      // 添加调试日志，查看任务数据结构
      if (dayTasks.length > 0) {
        console.log('[TaskHeatmap] 任务示例:', dayTasks[0]);
        console.log('[TaskHeatmap] 是否有循环任务:', dayTasks.some(t => t.repeat && t.repeat.enabled));
      }
      
      // 更新选中状态和任务列表
      this.setData({
        selectedDate: date,
        selectedDateText: this.formatDateDisplay(date),
        dayTasks,
        showDayTasks: true
      });
      
      // 触发日期选择事件
      this.triggerEvent('daySelect', {
        date,
        count: dayData.count,
        completed: dayData.completed,
        pending: dayData.pending,
        tasks: dayTasks
      });
    },
    
    // 关闭日期任务列表
    closeDayTasks() {
      console.log('[TaskHeatmap] 关闭日期任务列表');
      this.setData({
        showDayTasks: false
      });
    },
    
    // 获取当前月份
    getCurrentMonth() {
      return {
        year: this.data.currentYear,
        month: this.data.currentMonth
      };
    }
  }
}); 