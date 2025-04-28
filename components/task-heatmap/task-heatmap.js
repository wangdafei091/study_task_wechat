const Constants = require('../../utils/constants.js');

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
    currentYear: new Date().getFullYear(),  // 当前选择的年份
    currentMonth: new Date().getMonth(),    // 当前选择的月份 (0-11)
    days: [],                               // 日历天数数组
    weekDays: ['日', '一', '二', '三', '四', '五', '六'], // 星期标题
    selectedDate: '',                       // 当前选中的日期
    selectedDateText: '',                   // 日期显示文本
    dayTasks: [],                           // 选中日期的任务
    showDayTasks: false,                    // 是否显示日期任务面板
    selectedDayPressure: {},                // 选中日期的压力信息
    editingTaskId: null,                    // 当前正在编辑的任务ID
    editingTaskIndex: -1,                   // 当前正在编辑的任务在dayTasks中的索引
    editPoints: 0,                          // 编辑中的积分
    editDescription: '',                    // 编辑中的描述
    editScope: 'single',                    // 编辑范围，默认为仅今天
    showScopeInfoBubble: false,             // 是否显示范围信息气泡
    scopeInfoStyle: '',                     // 范围信息气泡样式
    scopeInfoTimer: null,                   // 范围信息气泡定时器
    showPressureInfo: false                 // 是否显示压力说明弹窗
  },
  
  lifetimes: {
    attached() {
      console.log('[TaskHeatmap] 组件挂载');
      console.log('[TaskHeatmap] 已优化热力图布局，减少垂直空间占用');
      console.log('[TaskHeatmap] 已优化热力图色阶，使用蓝色渐变提高辨识度');
      console.log('[TaskHeatmap] 已优化任务项UI，减轻背景色厚重感，优化布局');
      console.log('[TaskHeatmap] 已优化任务完成状态显示，使用勾标记替代删除线');
      console.log('[TaskHeatmap] 已添加任务描述信息气泡功能');
      console.log('[TaskHeatmap] 已添加任务编辑功能');
      console.log('[TaskHeatmap] 已优化压力级别显示为单行布局，减少垂直空间占用');
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
      // 清理定时器
      if (this.data.bubbleTimer) {
        clearTimeout(this.data.bubbleTimer);
      }
      
      if (this.data.scopeInfoTimer) {
        clearTimeout(this.data.scopeInfoTimer);
      }
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
    
    // 新增：计算单个任务的压力指数
    calculateTaskPressure(task) {
      console.log('[TaskHeatmap] 计算任务压力指数:', task.title);
      
      // 任务类型权重
      const typeWeights = {
        'study': 1.2,   // 学习任务权重高
        'habit': 0.8,   // 习惯养成权重中
        'interest': 0.6 // 兴趣活动权重低
      };
      
      // 获取任务基本属性（带默认值）
      const type = task.type || 'study';
      const duration = task.duration || (type === 'study' ? 60 : (type === 'habit' ? 10 : 30));
      const points = task.points || 1;
      
      // 计算压力指数
      const typeWeight = typeWeights[type] || 1.0;
      const basePressure = 1.0 * typeWeight;
      const durationPressure = duration * 0.1;  // 每10分钟增加1点压力
      const pointsPressure = points * 0.05;     // 每20积分增加1点压力
      
      const totalPressure = basePressure + durationPressure + pointsPressure;
      
      console.log(`[TaskHeatmap] 任务[${task.title}] 压力构成: 基础(${basePressure.toFixed(1)}) + 时长(${durationPressure.toFixed(1)}) + 积分(${pointsPressure.toFixed(1)}) = ${totalPressure.toFixed(1)}`);
      
      return {
        total: totalPressure,
        base: basePressure,
        duration: durationPressure,
        points: pointsPressure
      };
    },
    
    // 计算任务压力级别并返回描述文本
    calculatePressureLevel(pressure) {
      console.log(`[TaskHeatmap] 计算压力级别: ${pressure}`);
      
      let levelText = '轻松';
      let levelNum = 1;
      let isHigh = false;
      
      if (pressure <= 10) {
        levelText = '轻松';
        levelNum = 1;
      } else if (pressure <= 20) {
        levelText = '适中';
        levelNum = 2;
      } else if (pressure <= 30) {
        levelText = '繁忙';
        levelNum = 3;
        isHigh = true;
      } else {
        levelText = '紧张';
        levelNum = 4;
        isHigh = true;
      }
      
      return { levelText, levelNum, isHigh };
    },
    
    // 计算热力图
    calculateHeatMap() {
      console.log('[TaskHeatmap] 计算热力图数据');
      
      if (!this.properties.tasks || this.properties.tasks.length === 0) {
        console.log('[TaskHeatmap] 任务列表为空，不需要计算热力图');
        return;
      }
      
      const days = [...this.data.days];
      
      // 清空现有的任务统计数据
      days.forEach(day => {
        day.count = 0;
        day.level = 0;
        day.completed = 0;
        day.pending = 0;
        day.pressure = null;
      });
      
      // 按日期分组任务
      const tasksByDate = {};
      this.properties.tasks.forEach(task => {
        if (!tasksByDate[task.date]) {
          tasksByDate[task.date] = [];
        }
        tasksByDate[task.date].push(task);
      });
      
      // 更新每个日期的任务数量和热力等级
      const updatedDays = days.map(day => {
        const dateTasks = tasksByDate[day.date] || [];
        const count = dateTasks.length;
        
        if (count === 0) {
          return { ...day, count: 0, level: 0 };
        }
        
        // 计算完成和待完成任务数
        let completed = 0;
        let pending = 0;
        
        // 计算总压力指数
        let pressureIndex = 0;
        const tasksPressure = [];
        
        dateTasks.forEach(task => {
          if (task.status === 'completed' || task.status === 1) {
            completed++;
          } else {
            pending++;
          }
          
          // 计算任务压力
          const pressure = this.calculateTaskPressure(task);
          pressureIndex += pressure.total;
          
          tasksPressure.push({
            id: task.id,
            pressure: pressure
          });
        });
        
        // 计算日期热力等级 (1-4)
        const level = this.calculatePressureLevel(pressureIndex);
        
        console.log(`[TaskHeatmap] 日期:${day.date} 任务数:${count} 压力指数:${pressureIndex.toFixed(1)} 色阶等级:${level.levelText}`);
        
        return {
          ...day,
          count,
          level: level.levelNum, // 用于日历热力图的级别值 (1-4)
          completed,
          pending,
          pressure: {
            total: pressureIndex,
            tasks: tasksPressure
          }
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
    
    // 更新日期任务列表和压力显示
    onDayTap(e) {
      const dayData = e.currentTarget.dataset.day;
      const date = dayData.date;
      
      console.log(`[TaskHeatmap] 点击日期: ${date}`);
      
      // 如果点击当前已选中日期，则关闭任务列表
      if (this.data.selectedDate === date && this.data.showDayTasks) {
        this.closeDayTasks();
        return;
      }
      
      // 获取当前日期的任务
      const dayTasks = this.properties.tasks.filter(task => task.date === date);
      
      // 计算总压力值并增强任务信息
      let totalPressure = 0;
      const tasks = dayTasks.map(task => {
        // 计算总压力
        const taskPressure = this.calculateTaskPressure(task);
        totalPressure += taskPressure.total;
        
        // 增强任务信息
        const enhancedTask = { ...task };
        
        // 处理重复任务格式化
        if (task.repeat && task.repeat.type !== 'none') {
          // 格式化重复任务信息
          switch (task.repeat.type) {
            case 'daily':
              // 确保显示完整时间范围
              const timeRange = task.endTime ? `${task.startTime}-${task.endTime}` : task.startTime;
              
              // 检查是否为单天任务
              const isOneTimeDaily = task.repeat.startDate === task.repeat.endDate;
              
              if (isOneTimeDaily) {
                // 单天任务不显示"每天"
                enhancedTask.repeatInfo = `${this.formatDateRange(task.repeat.startDate, task.repeat.endDate)} ${timeRange}`;
              } else {
                enhancedTask.repeatInfo = `${this.formatDateRange(task.repeat.startDate, task.repeat.endDate)} 每天 ${timeRange}`;
              }
              break;
            case 'weekly':
              const weekDay = new Date(task.date).getDay();
              const weekDayNames = ['日', '一', '二', '三', '四', '五', '六'];
              enhancedTask.repeatInfo = `每周${weekDayNames[weekDay]} ${task.startTime}-${task.endTime}`;
              break;
            case 'workdays':
              enhancedTask.repeatInfo = `工作日 ${task.startTime}-${task.endTime}`;
              break;
            case 'custom':
              enhancedTask.repeatInfo = `每周${this.formatRepeatDays(task.repeat.days)} ${task.startTime}-${task.endTime}`;
              break;
          }
        } else {
          // 格式化单次任务日期为"5月23日"形式
          const taskDate = new Date(task.date);
          const month = taskDate.getMonth() + 1;
          const day = taskDate.getDate();
          enhancedTask.date = `${month}月${day}日`;
        }
        
        // 确保任务有积分信息
        if (!enhancedTask.rewardPoints) {
          enhancedTask.rewardPoints = task.points || 0;
        }
        
        console.log(`[TaskHeatmap] 处理任务: ${task.title}, ${task.date}, 重复类型: ${task.repeat ? task.repeat.type : '无'}`);
        
        return enhancedTask;
      });
      
      // 计算当日压力级别
      const pressureLevel = this.calculatePressureLevel(totalPressure);
      
      // 转换日期为友好显示格式，例如"5月23日 周一"
      const selectedDate = new Date(date);
      const day = selectedDate.getDate();
      const month = selectedDate.getMonth() + 1;
      const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const weekDay = weekDays[selectedDate.getDay()];
      const dateText = `${month}月${day}日 ${weekDay}`;
      
      this.setData({
        selectedDate: date,
        selectedDateText: dateText,
        dayTasks: tasks,
        showDayTasks: true,
        selectedDayPressure: {
          total: totalPressure.toFixed(1),
          levelText: pressureLevel.levelText,
          levelNum: pressureLevel.levelNum,
          isHigh: pressureLevel.isHigh,
          showWarning: pressureLevel.isHigh && totalPressure > 30
        }
      });
      
      console.log(`[TaskHeatmap] 显示日期任务, 总数:${dayTasks.length}, 总压力: ${totalPressure.toFixed(1)}, 级别: ${pressureLevel.levelText}`);
    },
    
    // 关闭日期任务列表
    closeDayTasks() {
      console.log('[TaskHeatmap] 关闭任务详情面板');
      
      this.setData({
        showDayTasks: false
      });
    },
    
    // 显示任务编辑区域
    showTaskEdit(e) {
      console.log('[TaskHeatmap] 显示任务编辑');
      const taskId = e.currentTarget.dataset.id;
      const taskIndex = e.currentTarget.dataset.index;
      
      // 如果已经在编辑这个任务，则关闭编辑
      if (this.data.editingTaskId === taskId) {
        this.cancelEdit();
        return;
      }
      
      // 先关闭可能打开的其他编辑区
      if (this.data.editingTaskId) {
        this.cancelEdit();
      }
      
      // 获取要编辑的任务
      const task = this.data.dayTasks[taskIndex];
      if (!task) {
        console.error('[TaskHeatmap] 找不到要编辑的任务');
        return;
      }
      
      // 设置初始编辑数据
      this.setData({
        editingTaskId: taskId,
        editingTaskIndex: taskIndex,
        editPoints: task.points || 0,
        editDescription: task.description || '',
        editScope: 'single' // 默认只修改今天的任务
      });
      
      console.log('[TaskHeatmap] 开始编辑任务:', task.title, '积分:', this.data.editPoints);
      
      // 如果是循环任务，处理滚动确保编辑区域可见
      if (task.repeat && task.repeat.enabled) {
        this.ensureEditAreaVisible(taskId);
      }
    },
    
    // 确保编辑区域在视图中可见
    ensureEditAreaVisible(taskId) {
      setTimeout(() => {
        const query = this.createSelectorQuery();
        query.select(`#edit-${taskId}`).boundingClientRect();
        query.selectViewport().boundingClientRect();
        query.exec((res) => {
          if (!res || !res[0] || !res[1]) return;
          
          const editRect = res[0];
          const viewportRect = res[1];
          
          // 如果编辑区域底部超出视口，滚动到可见区域
          if (editRect.bottom > viewportRect.height) {
            const scrollView = this.selectComponent('.tasks-list');
            if (scrollView) {
              scrollView.scrollIntoView(`#edit-${taskId}`);
            }
          }
        });
      }, 300); // 给动画一些时间完成
    },
    
    // 选择编辑范围
    selectEditScope(e) {
      const scope = e.currentTarget.dataset.scope;
      this.setData({
        editScope: scope
      });
      console.log('[TaskHeatmap] 设置编辑范围:', scope);
    },
    
    // 显示范围说明气泡
    showScopeInfo(e) {
      // 清除之前的定时器
      if (this.data.scopeInfoTimer) {
        clearTimeout(this.data.scopeInfoTimer);
      }
      
      // 获取点击元素位置
      const query = this.createSelectorQuery();
      query.select('.scope-info').boundingClientRect();
      query.selectViewport().scrollOffset();
      query.exec((res) => {
        if (!res || !res[0]) return;
        
        const rect = res[0];
        const scrollTop = res[1] ? res[1].scrollTop : 0;
        
        // 计算气泡位置，显示在图标右上方
        const left = rect.right + 5;
        const top = rect.top - 10;
        
        this.setData({
          showScopeInfoBubble: true,
          scopeInfoStyle: `left: ${left}px; top: ${top}px;`
        });
        
        // 3秒后自动隐藏
        const timer = setTimeout(() => {
          this.setData({
            showScopeInfoBubble: false
          });
        }, 3000);
        
        this.setData({
          scopeInfoTimer: timer
        });
      });
    },
    
    // 修改积分值
    changePoints(e) {
      const action = e.currentTarget.dataset.action;
      let points = this.data.editPoints;
      
      if (action === 'reduce') {
        points = Math.max(0, points - 1);
      } else if (action === 'add') {
        points = Math.min(100, points + 1);
      }
      
      this.setData({
        editPoints: points
      });
      
      console.log('[TaskHeatmap] 调整积分:', points);
    },
    
    // 积分输入处理
    inputPoints(e) {
      let value = parseInt(e.detail.value);
      
      // 确保值为有效数字且在0-100范围内
      if (isNaN(value)) value = 0;
      value = Math.max(0, Math.min(100, value));
      
      this.setData({
        editPoints: value
      });
    },
    
    /**
     * 输入描述文本
     */
    inputDescription(e) {
      const value = e.detail.value;
      
      // 记录日志
      console.log('[TaskHeatmap] 编辑描述:', value, `长度: ${value.length}/${this.data.descMaxLength}`);
      
      this.setData({
        editDescription: value
      });
    },
    
    // 取消编辑
    cancelEdit() {
      if (!this.data.editingTaskId) return;
      
      console.log('[TaskHeatmap] 取消编辑');
      this.setData({
        editingTaskId: null,
        editingTaskIndex: -1,
        editPoints: 0,
        editDescription: '',
        editScope: 'single',
        showScopeInfoBubble: false
      });
      
      // 清除可能存在的定时器
      if (this.data.scopeInfoTimer) {
        clearTimeout(this.data.scopeInfoTimer);
        this.setData({
          scopeInfoTimer: null
        });
      }
    },
    
    // 保存编辑
    saveEdit() {
      if (this.data.editingTaskIndex < 0 || !this.data.editingTaskId) {
        console.error('[TaskHeatmap] 没有正在编辑的任务');
        return;
      }
      
      const taskIndex = this.data.editingTaskIndex;
      const task = this.data.dayTasks[taskIndex];
      
      if (!task) {
        console.error('[TaskHeatmap] 找不到要编辑的任务');
        this.cancelEdit();
        return;
      }
      
      console.log('[TaskHeatmap] 保存任务编辑:', task.title);
      console.log('[TaskHeatmap] 新积分:', this.data.editPoints);
      console.log('[TaskHeatmap] 新描述:', this.data.editDescription);
      console.log('[TaskHeatmap] 编辑范围:', this.data.editScope);
      
      // 更新任务数据
      const updatedTask = {
        ...task,
        points: this.data.editPoints,
        description: this.data.editDescription
      };
      
      // 更新当前日期任务列表中的任务
      const updatedDayTasks = [...this.data.dayTasks];
      updatedDayTasks[taskIndex] = updatedTask;
      
      this.setData({
        dayTasks: updatedDayTasks
      });
      
      // 向父组件发送任务更新事件
      this.triggerEvent('taskUpdate', {
        task: updatedTask,
        scope: this.data.editScope,
        date: this.data.selectedDate
      });
      
      // 关闭编辑区
      this.cancelEdit();
    },
    
    // 获取当前月份
    getCurrentMonth() {
      return {
        year: this.data.currentYear,
        month: this.data.currentMonth
      };
    },
    
    // 显示压力指数说明弹窗
    showPressureInfo() {
      console.log('[TaskHeatmap] 显示压力指数说明');
      this.setData({
        showPressureInfo: true
      });
    },
    
    // 隐藏压力指数说明弹窗
    hidePressureInfo() {
      this.setData({
        showPressureInfo: false
      });
    },
    
    // 阻止事件冒泡（用于点击弹窗内容时不关闭弹窗）
    preventClose(e) {
      // 阻止事件冒泡
      return;
    },
    
    // 任务删除处理函数
    showTaskDelete(e) {
      const { id, index } = e.currentTarget.dataset;
      const task = this.data.dayTasks[index];
      
      console.log(`[TaskHeatmap] 请求删除任务: ${id}, 标题: ${task.title}`);
      
      // 确认删除
      wx.showModal({
        title: '删除任务',
        content: '确定要删除此任务吗？',
        confirmColor: '#E53935',
        success: (res) => {
          if (res.confirm) {
            // 如果是重复任务，询问删除范围
            if (task.repeat && task.repeat.type !== 'none') {
              this.showDeleteRepeatOptions(task);
            } else {
              this.deleteTask(id);
            }
          }
        }
      });
    },
    
    // 显示重复任务删除选项
    showDeleteRepeatOptions(task) {
      wx.showActionSheet({
        itemList: ['仅删除此任务', '删除此任务及未来任务'],
        success: (res) => {
          console.log(`[TaskHeatmap] 删除重复任务选项: ${res.tapIndex}`);
          
          const taskManager = require('../../utils/taskManager.js');
          
          if (res.tapIndex === 0) {
            // 仅删除此任务
            this.deleteTask(task.id);
          } else if (res.tapIndex === 1) {
            // 删除此任务及未来任务
            // 这里需要先获取所有任务，然后筛选出相关任务进行删除
            taskManager.getAllTasks(allTasks => {
              const currentDate = new Date(task.date);
              // 找出所有从这个日期开始的同一重复系列的任务
              const relatedTasks = allTasks.filter(t => 
                t.parentTaskId === task.parentTaskId &&
                new Date(t.date) >= currentDate
              );
              
              console.log(`[TaskHeatmap] 删除重复任务系列，共 ${relatedTasks.length} 个任务`);
              
              // 逐个删除相关任务
              let completedCount = 0;
              relatedTasks.forEach(t => {
                taskManager.deleteTask(t.id, () => {
                  completedCount++;
                  if (completedCount === relatedTasks.length) {
                    this.refreshTaskList();
                  }
                });
              });
            });
          }
        }
      });
    },
    
    // 删除单个任务
    deleteTask(taskId) {
      const taskManager = require('../../utils/taskManager.js');
      
      taskManager.deleteTask(taskId, () => {
        console.log(`[TaskHeatmap] 任务已删除: ${taskId}`);
        wx.showToast({
          title: '任务已删除',
          icon: 'success'
        });
        
        // 刷新任务列表
        this.refreshTaskList();
      });
    },
    
    // 刷新任务列表
    refreshTaskList() {
      // 通知父组件刷新任务数据
      this.triggerEvent('refreshTasks');
      
      // 关闭任务列表面板
      this.closeDayTasks();
      
      // 重新计算热力图
      setTimeout(() => {
        this.calculateHeatMap();
      }, 300);
    },
    
    // 格式化重复任务的天数显示
    formatRepeatDays(days) {
      if (!days || !Array.isArray(days) || days.length === 0) {
        return '';
      }
      
      // 将数字转换为对应的星期
      const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
      const formattedDays = days.map(day => dayNames[parseInt(day)]);
      
      if (formattedDays.length <= 3) {
        return formattedDays.join('/');
      } else {
        return `${formattedDays.slice(0, 3).join('/')}等`;
      }
    },
    
    // 格式化重复任务的日期范围显示
    formatDateRange(startDate, endDate) {
      const dateUtils = require('../../utils/dateUtils.js');
      
      // 如果没有终止日期，显示无限期
      if (!endDate) {
        // 格式化为"自X月X日起"
        const start = new Date(startDate);
        return `自${start.getMonth() + 1}月${start.getDate()}日起`;
      }
      
      // 格式化为"X月X日-X月X日"
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // 如果起止日期相同，只显示一个日期
      if (startDate === endDate) {
        return `${start.getMonth() + 1}月${start.getDate()}日`;
      }
      
      // 如果同年同月，只显示一次月份
      if (start.getFullYear() === end.getFullYear() && 
          start.getMonth() === end.getMonth()) {
        return `${start.getMonth() + 1}月${start.getDate()}-${end.getDate()}日`;
      }
      
      // 如果同年不同月
      if (start.getFullYear() === end.getFullYear()) {
        return `${start.getMonth() + 1}月${start.getDate()}日-${end.getMonth() + 1}月${end.getDate()}日`;
      }
      
      // 不同年
      return `${start.getFullYear()}/${start.getMonth() + 1}/${start.getDate()}-${end.getFullYear()}/${end.getMonth() + 1}/${end.getDate()}`;
    }
  }
}); 