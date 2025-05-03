const Constants = require('../../utils/constants.js');
const uiUtils = require('../../utils/uiUtils.js');

/**
 * 任务热力图组件 (task-heatmap)
 * 
 * @description 显示任务分布热力图，支持月份导航、日期选择和任务操作
 * @usage 用于任务编辑页面，展示任务分布状况和进行任务管理
 * @pages 使用此组件的页面：task-edit（任务编辑页面）
 * 
 * 特性:
 * - 展示任务分布热力图，颜色深浅表示学习压力
 * - 点击日期查看和管理当日任务
 * - 支持任务编辑、删除等操作
 * - 包含独立的任务操作逻辑，不依赖taskItem组件
 * 
 * 示例：
 * <task-heatmap 
 *   tasks="{{allTasks}}" 
 *   currentYear="{{heatmapYear}}"
 *   currentMonth="{{heatmapMonthIndex}}"
 *   bind:monthChange="onHeatmapMonthChange"
 *   bind:daySelect="onHeatmapDaySelect"
 *   bind:refreshTasks="onHeatmapRefreshTasks">
 * </task-heatmap>
 */
Component({
  properties: {
    tasks: {
      type: Array,
      value: [],
      observer: function(newVal, oldVal) {
        console.log('[task-heatmap] 任务数据已更新，新数据长度:', newVal ? newVal.length : 0);
        
        if (newVal && newVal.length > 0) {
          // 检查任务数据是否真的发生了变化
          const hasChanged = !oldVal || 
                            oldVal.length !== newVal.length || 
                            JSON.stringify(newVal) !== JSON.stringify(oldVal);
          
          if (hasChanged) {
            console.log('[task-heatmap] 检测到任务数据变化，重新计算热力图');
            this.calculateHeatMap();
          } else {
            console.log('[task-heatmap] 任务数据引用已更新，但内容未变化');
          }
        } else {
          console.log('[task-heatmap] 收到空任务数据，重置热力图');
          // 即使是空数据也需要重新计算，以清除热力图
          this.calculateHeatMap();
        }
      }
    },
    // 添加场景属性，用于区分组件使用场景
    scene: {
      type: String,
      value: 'task-edit', // 默认为任务编辑页面
      observer: function(newVal) {
        console.log('[task-heatmap] 使用场景:', newVal);
      }
    },
    // 添加外部控制月份的属性
    currentMonth: {
      type: Number,
      value: new Date().getMonth(),
      observer: function(newVal) {
        // 不需要再进行数据比较，直接生成日历
        this.generateCalendar();
      }
    },
    currentYear: {
      type: Number,
      value: new Date().getFullYear(),
      observer: function(newVal) {
        // 不需要再进行数据比较，直接生成日历
        this.generateCalendar();
      }
    }
  },
  
  data: {
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
    showPressureInfo: false,                // 是否显示压力说明弹窗
    activeTaskId: null,                     // 当前激活的任务ID
    activeTaskIndex: -1,                    // 当前激活的任务在dayTasks中的索引
    showActionMenu: false,                  // 是否显示操作菜单
    actionMenuStyle: '',                    // 操作菜单样式
    showDeleteConfirm: false,               // 是否显示删除确认区域
    activeTaskForDelete: null,              // 当前准备删除的任务
    deleteScope: '',                         // 删除范围选择: 'single'或'series'
    descMaxLength: 50,                      // 描述最大长度
    windowWidth: 0                          // 窗口宽度
  },
  
  /**
   * 组件生命周期
   */
  lifetimes: {
    attached: function() {
      console.log('[TaskHeatmap] 组件挂载');
      console.log('[TaskHeatmap] 已优化热力图布局，减少垂直空间占用');
      console.log('[TaskHeatmap] 已优化热力图色阶，使用蓝-紫-红渐变提高辨识度');
      console.log('[TaskHeatmap] 已优化任务项UI，减轻背景色厚重感，优化布局');
      console.log('[TaskHeatmap] 已优化任务完成状态显示，使用勾标记替代删除线');
      console.log('[TaskHeatmap] 已添加任务描述信息气泡功能');
      console.log('[TaskHeatmap] 已添加任务编辑功能');
      console.log('[TaskHeatmap] 已优化压力级别显示为单行布局，减少垂直空间占用');
      console.log('[TaskHeatmap] 已优化积分有效期显示，垂直布局时左对齐，移除多余视觉指示符');
      console.log('[TaskHeatmap] 已优化时间范围与积分有效期行距，更加紧凑美观');
      console.log('[TaskHeatmap] 已修复手机端时钟图标与积分有效期重叠问题');
      console.log('[TaskHeatmap] 已修复时钟图标上半部分被截断的问题，优化显示效果');
      
      // 获取系统信息，判断屏幕宽度
      wx.getSystemInfo({
        success: (res) => {
          const screenWidth = res.screenWidth;
          console.log(`[taskHeatmap] 设备屏幕宽度: ${screenWidth}px, 是否采用垂直布局: ${screenWidth <= 520}`);
          this.setData({
            windowWidth: res.windowWidth
          });
        }
      });
      
      // 初始化日历数据
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
      
      // 确保关闭任何可能存在的加载提示
      try {
        console.log('[task-heatmap] 组件销毁，确保关闭加载提示');
        wx.hideLoading();
      } catch (error) {
        console.error('[task-heatmap] 组件销毁时关闭加载提示出错:', error);
      }
    }
  },
  
  methods: {
    // 生成日历数据
    generateCalendar() {
      console.log('[TaskHeatmap] 生成日历数据');
      const currentYear = this.properties.currentYear;
      const currentMonth = this.properties.currentMonth;
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
      const currentYear = this.properties.currentYear;
      const currentMonth = this.properties.currentMonth;
      const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', 
                        '七月', '八月', '九月', '十月', '十一月', '十二月'];
      const monthTitle = `${monthNames[currentMonth]} ${currentYear}`;
      
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
      
      // 只在需要时记录详细日志
      console.log(`[TaskHeatmap] 任务[${task.title}] 压力指数: ${totalPressure.toFixed(1)}`);
      
      return {
        total: totalPressure,
        base: basePressure,
        duration: durationPressure,
        points: pointsPressure
      };
    },
    
    // 计算任务压力级别并返回描述文本
    calculatePressureLevel(pressure) {
      // 使用统一的压力级别计算函数
      return uiUtils.getPressureLevelText(pressure);
    },
    
    // 计算热力图
    calculateHeatMap() {
      console.log('[TaskHeatmap] 计算热力图数据');
      
      const days = [...this.data.days];
      
      // 清空现有的任务统计数据
      days.forEach(day => {
        day.count = 0;
        day.level = 0;
        day.completed = 0;
        day.pending = 0;
        day.pressure = null;
      });
      
      // 如果任务列表为空，直接更新UI以重置热力图
      if (!this.properties.tasks || this.properties.tasks.length === 0) {
        console.log('[TaskHeatmap] 任务列表为空，重置热力图所有日期块');
        
        // 确保更新UI，重置所有日期的热力值
        this.setData({ 
          days: days 
        }, () => {
          console.log('[TaskHeatmap] 热力图已重置完成');
        });
        
        return;
      }
      
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
    
    // 上个月
    prevMonth() {
      console.log('[TaskHeatmap] 切换到上个月');
      let newMonth = this.properties.currentMonth - 1;
      let newYear = this.properties.currentYear;
      
      if (newMonth < 0) {
        newMonth = 11;
        newYear--;
      }
      
      this.setData({
        currentYear: newYear,
        currentMonth: newMonth,
        // 切换月份时清除选中状态
        selectedDate: '',
        showDayTasks: false
      });
      
      this.generateCalendar();
    },
    
    // 下个月
    nextMonth() {
      console.log('[TaskHeatmap] 切换到下个月');
      let newMonth = this.properties.currentMonth + 1;
      let newYear = this.properties.currentYear;
      
      if (newMonth > 11) {
        newMonth = 0;
        newYear++;
      }
      
      this.setData({
        currentYear: newYear,
        currentMonth: newMonth,
        // 切换月份时清除选中状态
        selectedDate: '',
        showDayTasks: false
      });
      
      this.generateCalendar();
    },
    
    // 更新日期任务列表和压力显示
    onDayTap(e) {
      console.log('[TaskHeatmap] 点击日期');
      const dayData = e.currentTarget.dataset.day;
      const date = e.currentTarget.dataset.date;
      
      // 如果点击当前已选中日期，则关闭任务列表
      if (this.data.selectedDate === date && this.data.showDayTasks) {
        this.closeDayTasks();
        return;
      }
      
      // 获取当前日期的任务
      const dayTasks = this.properties.tasks.filter(task => task.date === date);
      
      // 统计已完成任务数
      const completedTasksCount = dayTasks.filter(
        t => t.status === 1 || t.status === 'completed'
      ).length;
      
      console.log(`[TaskHeatmap] 处理积分有效期：${completedTasksCount}个已完成任务，${dayTasks.length - completedTasksCount}个待完成任务`);
      
      // 计算总压力值并增强任务信息
      let totalPressure = 0;
      const tasks = dayTasks.map(task => {
        // 计算总压力
        const taskPressure = this.calculateTaskPressure(task);
        totalPressure += taskPressure.total;
        
        // 记录任务是否为必做任务
        console.log(`[task-heatmap] 处理任务: ${task.title}, 是否必做: ${task.isRequired ? '是' : '否'}, ID: ${task.id}`);
        
        // 增强任务信息
        const enhancedTask = { ...task };
        
        // 处理重复任务格式化
        if (task.repeat && task.repeat.type !== 'none') {
          // 格式化重复任务信息
          switch (task.repeat.type) {
            case 'daily':
              // 根据全天任务状态决定时间显示
              let timeRange = '';
              if (task.isAllDay) {
                timeRange = '全天';
              } else {
                timeRange = task.endTime ? `${task.startTime}-${task.endTime}` : task.startTime;
              }
              
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
              // 根据全天任务状态决定时间显示
              let weeklyTimeRange = task.isAllDay ? '全天' : `${task.startTime}-${task.endTime}`;
              enhancedTask.repeatInfo = `每周${weekDayNames[weekDay]} ${weeklyTimeRange}`;
              break;
            case 'workdays':
              console.log(`[TaskHeatmap] 处理工作日任务: ${task.title}, 起始日期: ${task.repeat.startDate}, 结束日期: ${task.repeat.endDate}`);
              // 根据全天任务状态决定时间显示
              let workdaysTimeRange = task.isAllDay ? '全天' : `${task.startTime}-${task.endTime}`;
              enhancedTask.repeatInfo = `${this.formatDateRange(task.repeat.startDate, task.repeat.endDate)} 工作日 ${workdaysTimeRange}`;
              break;
            case 'weekends':
              console.log(`[TaskHeatmap] 处理休息日任务: ${task.title}, 起始日期: ${task.repeat.startDate}, 结束日期: ${task.repeat.endDate}`);
              // 根据全天任务状态决定时间显示
              let weekendsTimeRange = task.isAllDay ? '全天' : `${task.startTime}-${task.endTime}`;
              enhancedTask.repeatInfo = `${this.formatDateRange(task.repeat.startDate, task.repeat.endDate)} 休息日 ${weekendsTimeRange}`;
              break;
            case 'custom':
              // 根据全天任务状态决定时间显示
              let customTimeRange = task.isAllDay ? '全天' : `${task.startTime}-${task.endTime}`;
              enhancedTask.repeatInfo = `每周${this.formatRepeatDays(task.repeat.days)} ${customTimeRange}`;
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
        
        // 确保任务有积分有效期信息
        if (task.status === 1 || task.status === 'completed') {
          // 已完成任务：显示具体失效日期
          if (task.pointsExpiryDate) {
            // 使用已有的有效期信息
            enhancedTask.pointsExpiryDate = task.pointsExpiryDate;
          } else {
            // 没有有效期信息时，默认设置为7天后
            enhancedTask.pointsExpiryDate = '7天后';
          }
        } else {
          // 未完成任务：显示默认有效期规则
          enhancedTask.pointsExpiryDate = '';
        }
        
        // 确保必做任务属性被正确传递
        enhancedTask.isRequired = !!task.isRequired;
        
        // 打印简化日志
        console.log(`[TaskHeatmap] 处理任务: ${task.title}, ID: ${task.id}, 类型: ${task.type}`);
        
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
          showWarning: pressureLevel.isHigh && totalPressure > 90
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
      
      // 如果删除确认区域正在显示，先关闭它
      if (this.data.showDeleteConfirm) {
        console.log('[TaskHeatmap] 关闭删除确认区域，准备编辑任务');
        this.cancelDelete();
      }
      
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
      
      // 记录必做任务状态
      console.log(`[TaskHeatmap] 编辑任务: ${task.title}, 是否必做: ${task.isRequired ? '是' : '否'}`);
      
      // 默认设为单任务编辑
      let defaultScope = 'single';
      
      // 设置初始编辑数据
      this.setData({
        editingTaskId: taskId,
        editingTaskIndex: taskIndex,
        editPoints: task.rewardPoints || 0,
        editDescription: task.description || '',
        editScope: defaultScope
      });
      
      console.log('[TaskHeatmap] 开始编辑任务:', task.title, 
                 '积分:', this.data.editPoints, 
                 '描述:', this.data.editDescription,
                 '范围:', this.data.editScope);
      
      // 如果是循环任务，处理滚动确保编辑区域可见
      if (task.repeat && task.repeat.type !== 'none') {
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
    
    /**
     * 调整积分值
     */
    adjustEditPoints(e) {
      const action = e.currentTarget.dataset.action;
      let points = this.data.editPoints;
      
      if (action === 'reduce') {
        points = Math.max(1, points - 1); // 最小1分
      } else if (action === 'add') {
        points = Math.min(50, points + 1); // 最大50分
      }
      
      this.setData({
        editPoints: points
      });
      
      console.log('[TaskHeatmap] 调整积分:', points);
    },
    
    /**
     * 处理积分输入
     */
    onEditPointsInput(e) {
      const value = parseInt(e.detail.value) || 0;
      // 限制积分范围在1-50之间
      const points = Math.max(1, Math.min(50, value));
      
      this.setData({
        editPoints: points
      });
      
      console.log('[TaskHeatmap] 输入积分:', points);
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
      const taskId = this.data.editingTaskId;
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
      const taskManager = require('../../utils/taskManager.js');
      
      // 准备更新的字段
      const updateData = {
        description: this.data.editDescription,
        modifyTime: Date.now()
      };
      
      // 如果不是必做任务，才更新积分字段
      if (!task.isRequired) {
        updateData.rewardPoints = this.data.editPoints;
      }
      
      console.log(`[TaskHeatmap] 更新任务${task.id}，是否必做: ${task.isRequired ? '是' : '否'}, 更新字段:`, updateData);
      
      // 显示加载中
      wx.showLoading({
        title: '保存中...',
        mask: true
      });
      
      // 根据编辑范围执行不同的更新逻辑
      if (this.data.editScope === 'series' && task.repeat && task.repeat.type !== 'none') {
        // 编辑循环任务系列
        console.log('[TaskHeatmap] 更新整个循环任务系列');
        
        this.updateTaskSeries(task, updateData, (success, count) => {
          wx.hideLoading();
          
          if (success) {
            // 显示成功提示
            wx.showToast({
              title: `已更新${count}个任务`,
              icon: 'success',
              duration: 1500
            });
            
            // 触发刷新事件
            this.triggerEvent('refreshTasks');
          } else {
            wx.showToast({
              title: '更新失败',
              icon: 'error',
              duration: 1500
            });
          }
          
          // 关闭编辑区域
          this.cancelEdit();
        });
      } else {
        // 仅编辑当前任务
        console.log('[TaskHeatmap] 仅更新当前任务');
        
        // 更新单个任务
        taskManager.editTask(taskId, updateData, (updatedTask) => {
          wx.hideLoading();
          
          if (updatedTask) {
            console.log('[TaskHeatmap] 任务更新成功');
            
            // 更新本地显示
            const updatedDayTasks = [...this.data.dayTasks];
            updatedDayTasks[taskIndex] = updatedTask;
            
            this.setData({
              dayTasks: updatedDayTasks
            });
            
            // 显示成功提示
            wx.showToast({
              title: '更新成功',
              icon: 'success',
              duration: 1500
            });
            
            // 触发刷新事件
            this.triggerEvent('refreshTasks');
          } else {
            console.error('[TaskHeatmap] 任务更新失败');
            wx.showToast({
              title: '更新失败',
              icon: 'error',
              duration: 1500
            });
          }
          
          // 关闭编辑区域
          this.cancelEdit();
        });
      }
    },
    
    // 获取当前月份
    getCurrentMonth() {
      return {
        year: this.properties.currentYear,
        month: this.properties.currentMonth
      };
    },
    
    // 显示压力指数说明弹窗
    showPressureInfo() {
      console.log('[TaskHeatmap] 显示压力指数说明');
      // 记录查看行为
      console.log('[TaskHeatmap] 用户查看压力级别数值区间说明');
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
    
    /**
     * 处理删除任务
     */
    handleDeleteTask(e) {
      const taskId = e.currentTarget.dataset.id;
      console.log(`[task-heatmap] 准备删除任务: ${taskId}`);
      
      // 隐藏菜单
      this.hideActionMenu();
      
      // 如果有正在编辑的任务，先取消编辑
      if (this.data.editingTaskId) {
        console.log(`[task-heatmap] 取消当前编辑，准备删除任务`);
        this.cancelEdit();
      }

      // 获取当前任务
      const task = this.data.dayTasks.find(t => t.id === taskId);
      if (!task) {
        console.error(`[task-heatmap] 未找到要删除的任务: ${taskId}`);
        return;
      }

      // 设置当前操作的任务
      console.log(`[task-heatmap] 显示删除确认区域, 任务类型: ${task.type}, 重复类型: ${task.repeat ? task.repeat.type : 'none'}`);
      
      // 如果是循环任务，重置选择状态；否则对于一次性任务默认选择"删除此任务"
      let initialDeleteScope = '';
      if (!(task.repeat && task.repeat.type !== 'none')) {
        initialDeleteScope = 'single'; // 一次性任务默认已选择状态
      }
      
      // 更新状态，显示删除确认区域
      this.setData({
        activeTaskForDelete: task,
        deleteScope: initialDeleteScope,
        showDeleteConfirm: true
      });
    },
    
    /**
     * 选择删除范围
     */
    selectDeleteScope(e) {
      const scope = e.currentTarget.dataset.scope;
      console.log(`[task-heatmap] 选择删除范围: ${scope}`);
      
      this.setData({
        deleteScope: scope
      });
    },

    /**
     * 取消删除
     */
    cancelDelete() {
      console.log('[task-heatmap] 取消删除');
      
      this.setData({
        showDeleteConfirm: false,
        deleteScope: '',
        activeTaskForDelete: null
      });
    },

    /**
     * 确认删除
     */
    confirmDelete() {
      const task = this.data.activeTaskForDelete;
      if (!task) {
        console.error('[task-heatmap] 没有活动的删除任务');
        return;
      }
      
      // 对于循环任务，需要检查是否已选择范围
      if (task.repeat && task.repeat.type !== 'none' && !this.data.deleteScope) {
        console.log('[task-heatmap] 循环任务未选择删除范围，禁止操作');
        return; // 未选择范围，禁止操作
      }
      
      const scope = this.data.deleteScope;
      console.log(`[task-heatmap] 确认删除任务: ${task.id}, 范围: ${scope}, 类型: ${task.repeat ? task.repeat.type : 'none'}`);
      
      // 检查是否是循环任务
      if (task.repeat && task.repeat.type !== 'none') {
        if (scope === 'single') {
          // 仅删除当日任务
          this.deleteTask(task.id);
        } else {
          // 删除整个循环
          this.deleteTaskSeries(task);
        }
      } else {
        // 一次性任务，直接删除
        this.deleteTask(task.id);
      }
      
      // 注意：状态重置已移到deleteTask函数的回调中进行
      // 对于deleteTaskSeries，需要在其内部也添加状态重置
    },
    
    /**
     * 删除单个任务
     */
    deleteTask(taskId) {
      const taskManager = require('../../utils/taskManager.js');
      
      // 记录当前任务在本地数组中的索引，用于后续更新本地UI
      const taskIndex = this.data.dayTasks.findIndex(task => task.id === taskId);
      console.log(`[task-heatmap] 准备删除任务ID: ${taskId}, 在本地数组中的索引: ${taskIndex}`);
      
      if (taskIndex === -1) {
        console.error(`[task-heatmap] 未找到要删除的任务: ${taskId}`);
      }
      
      taskManager.deleteTask(taskId, (success) => {
        if (success) {
          console.log(`[task-heatmap] 任务删除成功: ${taskId}`);
          
          // 任务删除成功后，更新本地数据
          if (taskIndex !== -1) {
            // 创建新的任务数组，移除已删除的任务
            const updatedTasks = [...this.data.dayTasks];
            updatedTasks.splice(taskIndex, 1);
            
            console.log(`[task-heatmap] 更新本地任务列表，删除前: ${this.data.dayTasks.length}个, 删除后: ${updatedTasks.length}个`);
            
            // 更新视图
            this.setData({
              dayTasks: updatedTasks
            });
          }
          
          // 更新任务列表
          this.triggerEvent('refreshTasks');
          
          wx.showToast({
            title: '删除成功',
            icon: 'success'
          });
        } else {
          console.error(`[task-heatmap] 任务删除失败: ${taskId}`);
          wx.showToast({
            title: '删除失败',
            icon: 'error'
          });
        }
        
        // 删除操作完成后，重置删除相关状态
        this.setData({
          showDeleteConfirm: false,
          deleteScope: '',
          activeTaskForDelete: null
        });
      });
    },
    
    /**
     * 删除任务系列
     */
    deleteTaskSeries(task) {
      const taskManager = require('../../utils/taskManager.js');
      const messageManager = require('../../utils/messageManager.js');
      
      // 添加日志，记录当前需要删除的任务信息
      console.log(`[task-heatmap] 准备删除任务系列，当前任务:`, {
        id: task.id,
        title: task.title,
        parentTaskId: task.parentTaskId,
        repeatType: task.repeat ? task.repeat.type : 'none'
      });
      
      // 显示加载状态
      wx.showLoading({
        title: '删除中...',
        mask: true
      });
      
      // 添加超时保护，确保加载提示不会一直显示
      const loadingTimeout = setTimeout(() => {
        console.log('[task-heatmap] 删除操作超时，强制关闭加载提示');
        wx.hideLoading();
        
        wx.showToast({
          title: '操作超时，请重试',
          icon: 'none',
          duration: 2000
        });
      }, 8000); // 8秒超时
      
      try {
        taskManager.getAllTasks(allTasks => {
          try {
            // 清除超时定时器
            clearTimeout(loadingTimeout);
            
            // 先尝试找出父任务ID
            let parentId = task.parentTaskId;
            
            // 如果当前任务没有parentTaskId，可能它自己就是父任务
            if (!parentId) {
              console.log(`[task-heatmap] 当前任务没有parentTaskId，可能是原始任务`);
              parentId = task.id;
            }
            
            console.log(`[task-heatmap] 使用父任务ID查找系列任务: ${parentId}`);
            
            // 使用改进的筛选逻辑
            let seriesTasks = allTasks.filter(t => 
              t.parentTaskId === parentId || // 找出所有子任务
              t.id === parentId              // 包含父任务自身
            );
            
            // 如果找不到系列任务，尝试其他匹配方式
            if (seriesTasks.length === 0 && task.repeat && task.repeat.type !== 'none') {
              seriesTasks = allTasks.filter(t => 
                t.repeat && 
                t.repeat.type === task.repeat.type && 
                t.title === task.title &&
                t.createTime === task.createTime
              );
            }
            
            console.log(`[task-heatmap] 删除任务系列，共找到: ${seriesTasks.length} 个任务`);
            
            if (seriesTasks.length === 0) {
              // 未找到系列任务，仅删除当前任务
              wx.hideLoading();
              this.deleteTask(task.id);
              return;
            }
            
            // 用于保存删除结果的数组
            const results = {
              success: [],
              failed: []
            };
            
            // 暂时保存原始的deleteTask函数
            const originalDeleteTask = taskManager.deleteTask;
            
            // 临时替换deleteTask函数，避免创建多条消息
            taskManager.deleteTask = function(taskId, cb) {
              if (!taskId) {
                console.error('[TaskManager] 删除任务失败: 任务ID为空');
                if (cb) cb(false);
                return;
              }
              
              this.getAllTasks(allTasks => {
                // 过滤掉要删除的任务
                const updatedTasks = allTasks.filter(task => task.id !== taskId);
                
                // 如果任务数量减少，说明删除成功
                if (updatedTasks.length < allTasks.length) {
                  // 保存任务数据
                  this._saveTaskData(updatedTasks, () => {
                    // 触发任务变更事件
                    this._onTaskDataChanged(updatedTasks);
                    
                    // 不创建删除消息，稍后创建一条批量消息
                    if (cb) cb(true);
                  });
                } else {
                  console.error('[TaskManager] 未找到要删除的任务:', taskId);
                  if (cb) cb(false);
                }
              });
            };
            
            let currentIndex = 0;
            
            // 批量删除任务
            const deleteNext = () => {
              if (currentIndex >= seriesTasks.length) {
                // 所有任务删除完成
                wx.hideLoading();
                
                // 恢复原始的deleteTask函数
                taskManager.deleteTask = originalDeleteTask;
                
                console.log(`[task-heatmap] 任务系列删除完成，成功: ${results.success.length}，失败: ${results.failed.length}`);
                
                if (results.success.length > 0) {
                  // 显示成功提示
                  wx.showToast({
                    title: `已删除${results.success.length}个任务`,
                    icon: 'success',
                    duration: 1500
                  });
                  
                  // 仅当成功删除多个任务时才创建批量消息
                  if (results.success.length > 1) {
                    messageManager.createTaskMessage(task, 'deleted', {
                      isBatchOperation: true,
                      batchCount: results.success.length
                    });
                  }
                  
                  // 刷新任务列表
                  this.triggerEvent('refreshTasks');
                } else {
                  wx.showToast({
                    title: '删除失败',
                    icon: 'error',
                    duration: 1500
                  });
                }
                
                // 重置删除状态
                this.setData({
                  showDeleteConfirm: false,
                  deleteScope: '',
                  activeTaskForDelete: null
                });
                
                return;
              }
              
              // 获取当前任务
              const currentTask = seriesTasks[currentIndex];
              
              // 更新加载提示
              wx.hideLoading();
              wx.showLoading({
                title: `删除中(${currentIndex + 1}/${seriesTasks.length})`,
                mask: true
              });
              
              console.log(`[task-heatmap] 删除第${currentIndex + 1}/${seriesTasks.length}个任务: ${currentTask.id}, 标题: ${currentTask.title}`);
              
              // 删除当前任务
              taskManager.deleteTask(currentTask.id, (success) => {
                try {
                  if (success) {
                    console.log(`[task-heatmap] 成功删除任务: ${currentTask.id}`);
                    results.success.push(currentTask.id);
                    
                    // 从本地任务列表中移除已删除的任务
                    const taskIndex = this.data.dayTasks.findIndex(t => t.id === currentTask.id);
                    if (taskIndex !== -1) {
                      const updatedTasks = [...this.data.dayTasks];
                      updatedTasks.splice(taskIndex, 1);
                      
                      this.setData({
                        dayTasks: updatedTasks
                      });
                    }
                  } else {
                    console.error(`[task-heatmap] 删除任务失败: ${currentTask.id}`);
                    results.failed.push(currentTask.id);
                  }
                  
                  // 继续下一个
                  currentIndex++;
                  deleteNext();
                } catch (error) {
                  console.error('[task-heatmap] 删除任务回调中出错:', error);
                  results.failed.push(currentTask.id);
                  
                  currentIndex++;
                  deleteNext();
                }
              });
            };
            
            // 开始删除第一个任务
            deleteNext();
            
          } catch (error) {
            // 清除超时定时器
            clearTimeout(loadingTimeout);
            
            // 恢复原始函数(如果已替换)
            if (taskManager._originalDeleteTask) {
              taskManager.deleteTask = taskManager._originalDeleteTask;
            }
            
            wx.hideLoading();
            console.error('[task-heatmap] 删除任务系列出错:', error);
            
            // 重置删除相关状态
            this.setData({
              showDeleteConfirm: false,
              deleteScope: '',
              activeTaskForDelete: null
            });
          }
        });
      } catch (error) {
        // 清除超时定时器
        clearTimeout(loadingTimeout);
        
        wx.hideLoading();
        console.error('[task-heatmap] 获取任务列表出错:', error);
        
        // 重置删除相关状态
        this.setData({
          showDeleteConfirm: false,
          deleteScope: '',
          activeTaskForDelete: null
        });
      }
    },
    
    // 刷新任务列表
    refreshTaskList() {
      console.log('[task-heatmap] 刷新任务列表');
      
      // 通知父组件刷新任务数据
      this.triggerEvent('refreshTasks');
      
      // 关闭任务列表面板
      this.closeDayTasks();
      
      // 为确保热力图刷新，分两步进行：
      // 1. 立即计算一次清空任务列表的情况
      setTimeout(() => {
        console.log('[task-heatmap] 第一阶段刷新：立即重置热力图');
        this.calculateHeatMap();
        
        // 2. 延迟再次计算，确保父组件已加载新数据
        setTimeout(() => {
          console.log('[task-heatmap] 第二阶段刷新：数据加载后再次计算热力图');
          this.calculateHeatMap();
        }, 500);
      }, 100);
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
    },
    
    /**
     * 显示任务操作菜单
     */
    showTaskActions(e) {
      const taskId = e.currentTarget.dataset.id;
      const taskIndex = e.currentTarget.dataset.index;
      
      console.log(`[task-heatmap] 显示任务操作菜单: ${taskId}`);
      
      // 获取点击元素位置
      const query = this.createSelectorQuery();
      query.select(`#task-${taskId} .more-actions`).boundingClientRect();
      query.selectViewport().scrollOffset();
      query.exec((res) => {
        if (res && res[0]) {
          const buttonRect = res[0];
          const systemInfo = wx.getSystemInfoSync();
          
          // 计算菜单位置，使其位于三点按钮右下方
          const style = `top:${buttonRect.top + buttonRect.height + 10}px; right:${systemInfo.windowWidth - buttonRect.right + 20}px;`;
          
          // 更新状态
          this.setData({
            activeTaskId: taskId,
            activeTaskIndex: taskIndex,
            showActionMenu: true,
            actionMenuStyle: style
          });
          
          console.log(`[task-heatmap] 显示卡片式操作菜单，位置: ${style}`);
          
          // 添加轻微振动反馈
          if (wx.vibrateShort) {
            wx.vibrateShort({ type: 'light' });
          }
        }
      });
    },
    
    /**
     * 隐藏操作菜单
     */
    hideActionMenu() {
      console.log(`[task-heatmap] 隐藏操作菜单`);
      this.setData({
        showActionMenu: false
      });
    },
    
    /**
     * 阻止冒泡
     */
    preventBubble(e) {
      // 阻止冒泡，使点击菜单项时不会触发外层容器的点击事件
    },
    
    /**
     * 阻止触摸滑动
     */
    preventTouchMove(e) {
      // 阻止背景滑动
    },

    /**
     * 处理编辑任务
     */
    handleEditTask(e) {
      console.log(`[task-heatmap] 编辑任务`);
      
      // 隐藏菜单
      this.hideActionMenu();
      
      // 获取任务ID
      const taskId = e.currentTarget.dataset.id;
      console.log(`[task-heatmap] 编辑任务ID: ${taskId}`);
      
      // 获取任务在数组中的索引
      const taskIndex = this.data.dayTasks.findIndex(task => task.id === taskId);
      
      // 调用已有的showTaskEdit方法
      this.showTaskEdit({
        currentTarget: {
          dataset: {
            id: taskId,
            index: taskIndex
          }
        }
      });
    },

    /**
     * 更新整个循环任务系列
     * @param {Object} task 当前任务
     * @param {Object} updateData 要更新的字段
     * @param {Function} callback 回调函数，参数为(success, count)
     */
    updateTaskSeries(task, updateData, callback) {
      const taskManager = require('../../utils/taskManager.js');
      const messageManager = require('../../utils/messageManager.js');
      
      console.log(`[TaskHeatmap] 准备更新任务系列，当前任务:`, {
        id: task.id,
        title: task.title,
        parentTaskId: task.parentTaskId,
        repeatType: task.repeat ? task.repeat.type : 'none'
      });
      
      // 显示加载提示
      wx.showLoading({
        title: '正在更新...',
        mask: true
      });
      
      // 添加超时保护，确保加载提示不会一直显示
      const loadingTimeout = setTimeout(() => {
        console.log('[TaskHeatmap] 更新操作超时，强制关闭加载提示');
        wx.hideLoading();
        
        wx.showToast({
          title: '操作超时，请重试',
          icon: 'none',
          duration: 2000
        });
        
        if (callback) callback(false, 0);
      }, 8000); // 8秒超时
      
      try {
        taskManager.getAllTasks(allTasks => {
          try {
            // 清除超时定时器
            clearTimeout(loadingTimeout);
            
            // 先尝试找出父任务ID
            let parentId = task.parentTaskId;
            
            // 如果当前任务没有parentTaskId，可能它自己就是父任务
            if (!parentId) {
              console.log(`[TaskHeatmap] 当前任务没有parentTaskId，可能是原始任务`);
              parentId = task.id;
            }
            
            console.log(`[TaskHeatmap] 使用父任务ID查找系列任务: ${parentId}`);
            
            // 使用改进的筛选逻辑
            const seriesTasks = allTasks.filter(t => 
              t.parentTaskId === parentId || // 找出所有子任务
              t.id === parentId              // 包含父任务自身
            );
            
            console.log(`[TaskHeatmap] 更新任务系列，共找到: ${seriesTasks.length} 个任务`);
            
            if (seriesTasks.length === 0) {
              console.log(`[TaskHeatmap] 未找到任何相关系列任务，只更新当前任务`);
              taskManager.editTask(task.id, updateData, (updatedTask) => {
                wx.hideLoading();
                if (updatedTask) {
                  if (callback) callback(true, 1);
                } else {
                  if (callback) callback(false, 0);
                }
              });
              return;
            }
            
            // 用于保存更新结果的数组
            const results = {
              success: [],
              failed: []
            };
            
            // 暂时保存原始的editTask函数
            const originalEditTask = taskManager.editTask;
            
            // 临时替换editTask函数，避免创建多条消息
            taskManager.editTask = function(taskId, data, cb) {
              this.getAllTasks(allTasks => {
                let updatedTask = null;
                
                // 更新任务数据
                const updatedTasks = allTasks.map(t => {
                  if (t.id === taskId) {
                    updatedTask = { 
                      ...t, 
                      ...data,
                      updateTime: Date.now() 
                    };
                    return updatedTask;
                  }
                  return t;
                });
                
                if (updatedTask) {
                  // 保存任务数据
                  this._saveTaskData(updatedTasks, () => {
                    // 触发任务变更事件
                    this._onTaskDataChanged(updatedTasks);
                    
                    // 不创建任务编辑消息，稍后创建一条批量消息
                    if (cb) cb(updatedTask);
                  });
                } else if (cb) {
                  cb(null);
                }
              });
            };
            
            let currentIndex = 0;
            
            // 批量更新任务
            const updateNext = () => {
              if (currentIndex >= seriesTasks.length) {
                // 所有任务更新完成
                wx.hideLoading();
                
                // 恢复原始的editTask函数
                taskManager.editTask = originalEditTask;
                
                console.log(`[TaskHeatmap] 任务系列更新完成，成功: ${results.success.length}，失败: ${results.failed.length}`);
                
                // 创建一条批量操作消息
                if (results.success.length > 0) {
                  // 显示成功提示
                  wx.showToast({
                    title: `已更新${results.success.length}个任务`,
                    icon: 'success',
                    duration: 1500
                  });
                  
                  // 仅当成功更新多个任务时才创建批量消息
                  if (results.success.length > 1) {
                    messageManager.createTaskMessage(task, 'edited', {
                      isBatchOperation: true,
                      batchCount: results.success.length
                    });
                  }
                  
                  if (callback) callback(true, results.success.length);
                } else {
                  wx.showToast({
                    title: '更新失败',
                    icon: 'error',
                    duration: 1500
                  });
                  
                  if (callback) callback(false, 0);
                }
                return;
              }
              
              // 获取当前任务
              const currentTask = seriesTasks[currentIndex];
              
              // 更新加载提示
              wx.hideLoading();
              wx.showLoading({
                title: `更新中(${currentIndex + 1}/${seriesTasks.length})`,
                mask: true
              });
              
              console.log(`[TaskHeatmap] 更新第${currentIndex + 1}/${seriesTasks.length}个任务: ${currentTask.id}, 标题: ${currentTask.title}`);
              
              // 更新当前任务
              taskManager.editTask(currentTask.id, updateData, (updatedTask) => {
                try {
                  if (updatedTask) {
                    console.log(`[TaskHeatmap] 成功更新任务: ${currentTask.id}`);
                    results.success.push(currentTask.id);
                  } else {
                    console.error(`[TaskHeatmap] 更新任务失败: ${currentTask.id}`);
                    results.failed.push(currentTask.id);
                  }
                  
                  // 继续下一个
                  currentIndex++;
                  updateNext();
                } catch (error) {
                  console.error('[TaskHeatmap] 更新任务回调中出错:', error);
                  results.failed.push(currentTask.id);
                  
                  currentIndex++;
                  updateNext();
                }
              });
            };
            
            // 开始更新第一个任务
            updateNext();
            
          } catch (error) {
            // 清除超时定时器
            clearTimeout(loadingTimeout);
            
            // 恢复原始函数(如果已替换)
            if (taskManager._originalEditTask) {
              taskManager.editTask = taskManager._originalEditTask;
            }
            
            wx.hideLoading();
            console.error('[TaskHeatmap] 更新任务系列过程中出错:', error);
            
            if (callback) callback(false, 0);
          }
        });
      } catch (error) {
        // 清除超时定时器
        clearTimeout(loadingTimeout);
        
        wx.hideLoading();
        console.error('[TaskHeatmap] 获取任务列表出错:', error);
        
        if (callback) callback(false, 0);
      }
    },

    /**
     * 处理任务系列更新，继续更新下一个
     */
    handleSeriesUpdateContinue(tasks, index, updateData, results, callback) {
      this.updateTasksSerially(tasks, index, updateData, results, callback);
    },

    /**
     * 任务详情渲染处理 
     */
    _renderTaskDetails(task) {
      if (task) {
        console.log(`[taskHeatmap] 渲染任务详情: ${task.title}, 日期: ${task.date}, 积分有效期: ${task.pointsExpiryDate || '完成后7天'}`);
        console.log(`[taskHeatmap] 积分有效期使用左对齐垂直布局，优化显示效果`);
        console.log(`[taskHeatmap] 已调整时间与积分有效期行距，提升视觉紧凑感`);
        console.log(`[taskHeatmap] 已优化时钟图标位置，避免与积分有效期文本重叠`);
        console.log(`[taskHeatmap] 已修复时钟图标被截断问题，优化图标可见性`);
      }
      
      // 已有代码部分...
    },

    // 添加新的方法 _loadCalendarData
    _loadCalendarData() {
      // 实现 _loadCalendarData 方法的逻辑
    }
  }
}); 