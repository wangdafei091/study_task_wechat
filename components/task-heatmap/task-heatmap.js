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
    windowWidth: 0,                         // 窗口宽度
    Constants: Constants,                   // 添加Constants对象到data中，使WXML可以访问
    todayString: ''                         // 今天的日期字符串，用于提示文本
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
      
      // 初始化今天日期字符串
      const dateUtils = require('../../utils/dateUtils.js');
      const today = dateUtils.getTodayString();
      this.setData({
        todayString: today
      });
      console.log(`[TaskHeatmap] 初始化今天日期: ${today}`);
      
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
      // 获取任务基本属性
      const type = task.type || 'study';
      const title = task.title || '未命名任务';
      const taskId = task.id || '未知ID';
      
      console.log(`[TaskHeatmap] 开始计算任务[${title}]压力值, ID: ${taskId}, 类型: ${type}`);
      
      // 初始化压力值
      let totalPressure = 0;
      let basePressure = 0;
      let durationPressure = 0;
      
      // 处理习惯任务 - 固定2点基础压力
      if (type === 'habit') {
        basePressure = 2;
        totalPressure = basePressure;
        console.log(`[TaskHeatmap] 习惯任务[${title}]基础压力: ${basePressure}点`);
        
        return {
          total: totalPressure,
          base: basePressure,
          duration: 0,
          points: 0
        };
      }
      
      // 处理全天任务 - 固定2点基础压力，与习惯任务相同
      if (task.isAllDay) {
        basePressure = 2;
        totalPressure = basePressure;
        console.log(`[TaskHeatmap] 全天任务[${title}]基础压力: ${basePressure}点`);
        
        return {
          total: totalPressure,
          base: basePressure,
          duration: 0,
          points: 0
        };
      }
      
      // 处理有时间范围的普通任务
      if (task.startTime && task.endTime) {
        // 将HH:MM格式时间转换为分钟数
        const convertTimeToMinutes = (timeStr) => {
          const [hours, minutes] = timeStr.split(':').map(Number);
          return (hours * 60) + minutes;
        };
        
        const startMinutes = convertTimeToMinutes(task.startTime);
        const endMinutes = convertTimeToMinutes(task.endTime);
        
        console.log(`[TaskHeatmap] 任务[${title}]时间范围: ${task.startTime}-${task.endTime}`);
        console.log(`[TaskHeatmap] 转换为分钟: 开始=${startMinutes}分钟, 结束=${endMinutes}分钟`);
        
        // 计算时间差（分钟）
        let duration = endMinutes - startMinutes;
        
        // 检查时间差是否有效
        if (duration <= 0) {
          console.error(`[TaskHeatmap] 错误: 任务[${title}]的结束时间早于或等于开始时间! 使用最小压力值`);
          return {
            total: 1,
            base: 0,
            duration: 1,
            points: 0
          };
        }
        
        // 计算时长压力（每10分钟1点）
        durationPressure = Math.floor(duration / 10);
        totalPressure = durationPressure;
        
        console.log(`[TaskHeatmap] 任务[${title}]实际时长: ${duration}分钟`);
        console.log(`[TaskHeatmap] 任务[${title}]时长压力: ${durationPressure}点`);
      } else {
        // 缺少时间范围的普通任务 - 记录错误
        console.error(`[TaskHeatmap] 错误: 普通任务[${title}]缺少开始时间或结束时间! 使用最小压力值`);
        
        // 使用最小压力值
        durationPressure = 1;
        totalPressure = 1;
      }
      
      console.log(`[TaskHeatmap] 任务[${title}]总压力值: ${totalPressure}点`);
      
      // 返回压力计算结果
      return {
        total: totalPressure,
        base: basePressure,
        duration: durationPressure,
        points: 0 // 移除积分影响，但保留字段
      };
    },
    
    // 计算任务压力级别并返回描述文本
    calculatePressureLevel(pressure) {
      // 使用统一的压力级别计算函数
      return uiUtils.getPressureLevelText(pressure);
    },
    
    // 计算热力图
    calculateHeatMap(forcedTasks) {
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
      
      // 使用传入的强制任务数据或组件属性中的任务
      const tasks = forcedTasks || this.properties.tasks;
      
      // 记录数据来源和任务数量
      console.log(`[TaskHeatmap] 热力图计算使用${forcedTasks ? '外部提供' : '组件属性'}任务数据，数量: ${tasks ? tasks.length : 0}`);
      
      // 如果任务列表为空，直接更新UI以重置热力图
      if (!tasks || tasks.length === 0) {
        console.log('[TaskHeatmap] 任务列表为空，重置热力图所有日期块');
        
        // 确保更新UI，重置所有日期的热力值
        this.setData({ 
          days: days,
          "__dataTimestamp": Date.now() // 添加时间戳确保视图刷新
        }, () => {
          console.log('[TaskHeatmap] 热力图已重置完成');
        });
        
        return;
      }
      
      // 按日期分组任务
      const tasksByDate = {};
      tasks.forEach(task => {
        if (!task.date) return;
        
        if (!tasksByDate[task.date]) {
          tasksByDate[task.date] = [];
        }
        tasksByDate[task.date].push(task);
      });
      
      // 输出日期任务统计日志，辅助调试
      console.log('[TaskHeatmap] 按日期分组任务统计:');
      Object.keys(tasksByDate).forEach(date => {
        console.log(`[TaskHeatmap] 日期: ${date}, 任务数: ${tasksByDate[date].length}`);
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
      
      // 检查是否有更新
      const hasChanges = JSON.stringify(updatedDays) !== JSON.stringify(this.data.days);
      console.log(`[TaskHeatmap] 热力图数据${hasChanges ? '有' : '无'}变化，准备更新视图`);
      
      this.setData({ 
        days: updatedDays,
        "__dataTimestamp": Date.now() // 添加时间戳确保视图更新
      }, () => {
        console.log('[TaskHeatmap] 热力图视图更新完成');
      });
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
              console.log(`[TaskHeatmap] 处理每周任务: ${task.title}, 起始日期: ${task.repeat.startDate}, 结束日期: ${task.repeat.endDate}`);
              enhancedTask.repeatInfo = `${this.formatDateRange(task.repeat.startDate, task.repeat.endDate)} 每周${weekDayNames[weekDay]} ${weeklyTimeRange}`;
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
              console.log(`[TaskHeatmap] 处理自定义重复任务: ${task.title}, 起始日期: ${task.repeat.startDate}, 结束日期: ${task.repeat.endDate}`);
              enhancedTask.repeatInfo = `${this.formatDateRange(task.repeat.startDate, task.repeat.endDate)} 每周${this.formatRepeatDays(task.repeat.days)} ${customTimeRange}`;
              break;
          }
        } else {
          // 格式化单次任务日期为"5月23日"形式
          const taskDate = new Date(task.date);
          const month = taskDate.getMonth() + 1;
          const day = taskDate.getDate();
          enhancedTask.date = `${month}月${day}日`;
        }
        
        // 确保任务有积分有效期信息
        if (task.status === 1 || task.status === 'completed') {
          // 已完成任务：显示具体失效日期
          if (task.pointsExpiryDate) {
            // 使用已有的有效期信息
            enhancedTask.pointsExpiryDate = task.pointsExpiryDate;
          } else if (task.pointsExpiry === 'permanent') {
            // 永久有效
            enhancedTask.pointsExpiryDate = '永久';
            console.log(`[TaskHeatmap] 任务${task.id}设置为永久有效期`);
          } else {
            // 没有有效期信息时，默认设置为7天后
            enhancedTask.pointsExpiryDate = '7天后';
          }
        } else {
          // 未完成任务：根据任务设置的实际有效期类型显示
          enhancedTask.pointsExpiryDate = '';
          enhancedTask.pointsExpiry = task.pointsExpiry || 'permanent'; // 确保有值
          console.log(`[TaskHeatmap] 未完成任务${task.id}积分有效期类型: ${enhancedTask.pointsExpiry}`);
        }
        
        // 确保必做任务属性被正确传递
        enhancedTask.isRequired = !!task.isRequired;
        
        // 确保积分值被正确传递
        enhancedTask.rewardPoints = task.rewardPoints || 0;
        
        // 添加更详细的任务状态日志
        let statusText = '';
        if (task.status === 1 || task.status === 'completed') {
          statusText = '已完成';
        } else if (task.status === 0 || task.status === 'pending') {
          statusText = '待完成';
        } else if (task.status === 2 || task.status === 'overdue') {
          statusText = '已逾期';
        } else if (task.status === 3 || task.status === 'canceled') {
          statusText = '已取消';
        }
        
        console.log(`[TaskHeatmap] 处理任务: ${task.title}, ID: ${task.id}, 类型: ${task.type}, 状态: ${statusText}, 必做: ${enhancedTask.isRequired ? '是' : '否'}, 积分: ${enhancedTask.rewardPoints}`);
        
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
      
      // 添加日志，记录当前需要删除的任务详细信息
      console.log(`[task-heatmap] 准备删除任务系列，当前任务详情:`, {
        id: task.id,
        title: task.title,
        date: task.date,
        parentTaskId: task.parentTaskId,
        repeatType: task.repeat ? task.repeat.type : 'none'
      });
      
      // 显示加载状态
      wx.showLoading({
        title: '正在分析任务系列...',
        mask: true
      });
      
      // 添加超时保护，确保加载提示不会一直显示
      const loadingTimeout = setTimeout(() => {
        console.log('[task-heatmap] 删除操作超时，强制关闭加载提示');
        wx.hideLoading();
        
        // 提供用户选择是继续等待还是取消操作
        wx.showModal({
          title: '操作耗时较长',
          content: '是否继续等待？取消将中断当前操作',
          confirmText: '继续等待',
          cancelText: '取消操作',
          success: (res) => {
            if (res.confirm) {
              // 用户选择继续等待，重启操作
              console.log('[task-heatmap] 用户选择继续等待，重启操作');
              wx.showLoading({
                title: '继续处理中...',
                mask: true
              });
              // 此处不重启超时计时器，让操作继续进行
            } else {
              // 用户选择取消操作
              console.log('[task-heatmap] 用户取消操作');
              // 重置删除相关状态
              this.setData({
                showDeleteConfirm: false,
                deleteScope: '',
                activeTaskForDelete: null
              });
            }
          }
        });
      }, 15000); // 增加超时时间到15秒
      
      // 使用Promise优化任务处理
      const getAllTasksPromise = () => {
        return new Promise((resolve, reject) => {
          try {
            taskManager.getAllTasks(allTasks => {
              resolve(allTasks);
            });
          } catch (error) {
            reject(error);
          }
        });
      };
      
      const deleteTaskPromise = (taskId) => {
        return new Promise((resolve, reject) => {
          try {
            taskManager.deleteTask(taskId, (success) => {
              if (success) {
                resolve(true);
              } else {
                reject(new Error(`删除任务失败: ${taskId}`));
              }
            });
          } catch (error) {
            reject(error);
          }
        });
      };
      
      // 执行任务删除流程
      getAllTasksPromise()
        .then(allTasks => {
          // 清除超时定时器
          clearTimeout(loadingTimeout);
          
          // 获取父任务ID
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
          
          // 记录筛选前的任务总数，用于日志
          const allSeriesTasks = [...seriesTasks];
          
          // 获取今天日期，作为筛选基准
          const today = this.data.todayString;
          
          // 只保留今天及之后的任务，而不是基于选中的任务日期
          seriesTasks = seriesTasks.filter(t => t.date >= today);
          
          console.log(`[TaskHeatmap] 今天日期: ${today}`);
          console.log(`[TaskHeatmap] 选中任务日期: ${task.date}`);
          console.log(`[TaskHeatmap] 找到该循环的任务总数: ${allSeriesTasks.length}个`);
          console.log(`[TaskHeatmap] 日期过滤后，只删除今天(${today})及之后的任务: ${seriesTasks.length}个`);
          
          // 先精简任务数据，只保留必要字段，减少内存占用
          seriesTasks = seriesTasks.map(t => ({
            id: t.id,
            title: t.title,
            date: t.date
          }));
          
          // 任务数量安全检查
          const MAX_SAFE_TASKS = 100;
          if (seriesTasks.length > MAX_SAFE_TASKS) {
            wx.hideLoading();
            return new Promise((resolve, reject) => {
              wx.showModal({
                title: '任务数量过多',
                content: `即将删除从今天(${today})开始的${seriesTasks.length}个循环任务，可能需要较长时间。是否继续？`,
                confirmText: '继续',
                cancelText: '取消',
                success: (res) => {
                  if (res.confirm) {
                    console.log(`[TaskHeatmap] 用户确认继续处理大量任务: ${seriesTasks.length}个`);
                    wx.showLoading({
                      title: '准备删除...',
                      mask: true
                    });
                    resolve(seriesTasks);
                  } else {
                    console.log('[TaskHeatmap] 用户取消大量任务删除');
                    // 重置删除相关状态
                    this.setData({
                      showDeleteConfirm: false,
                      deleteScope: '',
                      activeTaskForDelete: null
                    });
                    reject(new Error('用户取消操作'));
                  }
                }
              });
            });
          }
          
          return seriesTasks;
        })
        .then(seriesTasks => {
          console.log(`[task-heatmap] 删除任务系列，共找到: ${seriesTasks.length} 个任务`);
          
          if (seriesTasks.length === 0) {
            console.log(`[task-heatmap] 未找到任何相关系列任务，删除操作终止`);
            wx.hideLoading();
            wx.showToast({
              title: '未找到相关任务',
              icon: 'none',
              duration: 2000
            });
            
            // 重置删除相关状态
            this.setData({
              showDeleteConfirm: false,
              deleteScope: '',
              activeTaskForDelete: null
            });
            
            return Promise.reject(new Error('未找到相关任务'));
          }
          
          // 用于保存删除结果的数组
          const results = {
            success: [],
            failed: []
          };
          
          // 改为串行删除，避免数据竞争
          const deleteTasksSerially = (tasks, index = 0) => {
            if (index >= tasks.length) {
              console.log(`[task-heatmap] 所有循环任务删除完成，共删除 ${tasks.length} 个任务`);
              return { 
                success: results.success, 
                failed: results.failed 
              };
            }
            
            const currentTask = tasks[index];
            
            // 更新进度提示
            if (index % 5 === 0 || index === tasks.length - 1) {
              wx.showLoading({
                title: `删除中(${index + 1}/${tasks.length})`,
                mask: true
              });
            }
            
            console.log(`[task-heatmap] 正在删除第 ${index+1}/${tasks.length} 个任务：${currentTask.id}`);
            
            return new Promise((resolve) => {
              taskManager.deleteTask(currentTask.id, async (success) => {
                if (success) {
                  results.success.push(currentTask.id);
                  console.log(`[task-heatmap] 成功删除任务 ${currentTask.id}`);
                  
                  // 验证剩余任务数量
                  if ((index + 1) % 10 === 0 || index === tasks.length - 1) {
                    taskManager.getAllTasks(remainingTasks => {
                      console.log(`[task-heatmap] 删除任务 ${currentTask.id} 后，剩余任务总数：${remainingTasks.length}个`);
                    });
                  }
                  
                  // 等待一小段时间，避免存储冲突
                  await new Promise(r => setTimeout(r, 20));
                  
                  // 继续处理下一个任务
                  const result = await deleteTasksSerially(tasks, index + 1);
                  resolve(result);
                } else {
                  results.failed.push(currentTask.id);
                  console.error(`[task-heatmap] 删除任务失败: ${currentTask.id}`);
                  
                  // 继续处理下一个任务
                  const result = await deleteTasksSerially(tasks, index + 1);
                  resolve(result);
                }
              });
            });
          };
          
          // 使用串行删除替代并行
          return deleteTasksSerially(seriesTasks, 0);
        })
        .then(results => {
          // 全部处理完成
          wx.hideLoading();
          
          console.log(`[task-heatmap] 任务系列删除完成，成功: ${results.success.length}，失败: ${results.failed.length}`);
          
          // 创建一条批量操作消息
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
            
            // 检查删除前后任务总数
            taskManager.getAllTasks(currentTasks => {
              console.log(`[task-heatmap] 删除操作后验证: 当前任务总数 ${currentTasks.length}个`);
              
              // 强制刷新热力图，确保视图反映最新数据
              console.log(`[task-heatmap] 执行强制热力图刷新以确保视图更新`);
              this.refreshTaskList();
            });
          } else {
            wx.showToast({
              title: '删除失败',
              icon: 'error',
              duration: 1500
            });
            
            // 重置删除相关状态
            this.setData({
              showDeleteConfirm: false,
              deleteScope: '',
              activeTaskForDelete: null
            });
          }
        })
        .catch(error => {
          // 确保加载提示被关闭
          wx.hideLoading();
          
          // 只有在未被其他地方处理的错误才显示错误提示
          if (error.message !== '未找到相关任务' && error.message !== '用户取消操作') {
            console.error('[task-heatmap] 删除任务系列过程中出错:', error);
            
            // 显示友好的错误提示
            wx.showToast({
              title: '删除过程出错',
              icon: 'error',
              duration: 2000
            });
            
            // 重置删除相关状态
            this.setData({
              showDeleteConfirm: false,
              deleteScope: '',
              activeTaskForDelete: null
            });
          }
        });
    },
    
    /**
     * 刷新任务列表
     */
    refreshTaskList() {
      console.log('[task-heatmap] 刷新任务列表');
      
      // 通知父组件刷新任务数据
      this.triggerEvent('refreshTasks');
      
      // 关闭任务列表面板
      this.closeDayTasks();
      
      // 强制刷新热力图数据 - 改进三阶段刷新流程
      // 阶段1: 立即清空热力图数据
      const taskManager = require('../../utils/taskManager.js');
      console.log('[task-heatmap] 第一阶段刷新：清空热力图数据');
      
      // 将所有日期的任务计数和热力值重置为0
      const days = [...this.data.days];
      days.forEach(day => {
        day.count = 0;
        day.level = 0;
        day.completed = 0;
        day.pending = 0;
        day.pressure = null;
      });
      
      // 更新UI以反映清空后的状态
      this.setData({ 
        days: days,
        "__clearTimestamp": Date.now() // 添加时间戳确保视图清空刷新
      }, () => {
        console.log('[task-heatmap] 热力图数据已清空，准备获取新数据');
      });
      
      // 阶段2: 从任务管理器获取最新数据
      setTimeout(() => {
        console.log('[task-heatmap] 第二阶段刷新：获取最新任务数据并计算热力图');
        
        // 直接从taskManager获取最新数据
        taskManager.getAllTasks(latestTasks => {
          console.log(`[task-heatmap] 获取到最新任务数据: ${latestTasks.length}个任务`);
          
          // 将最新任务数据传递给属性，确保热力图计算使用最新数据
          this.setData({ 
            "__refreshTimestamp": Date.now() // 添加刷新时间戳，确保视图刷新
          }, () => {
            console.log('[task-heatmap] 准备强制重新计算热力图');
            
            // 强制重新计算热力图
            this.calculateHeatMap(latestTasks);
            
            // 阶段3: 确认刷新完成
            setTimeout(() => {
              console.log('[task-heatmap] 第三阶段刷新：确认热力图已更新');
              // 再次从taskManager获取最新数据，确保热力图与数据一致
              taskManager.getAllTasks(finalTasks => {
                console.log(`[task-heatmap] 确认更新：最终任务数据数量 ${finalTasks.length}个`);
                
                // 确认热力图已完全更新
                this.calculateHeatMap(finalTasks);
                
                // 触发完成事件
                this.triggerEvent('refreshComplete', {
                  taskCount: finalTasks.length,
                  timestamp: Date.now()
                });
              });
            }, 500);
          });
        });
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
      
      // 修改为显示所有日期，不再截断
      return formattedDays.join('/');
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
        date: task.date,
        parentTaskId: task.parentTaskId,
        repeatType: task.repeat ? task.repeat.type : 'none'
      });
      
      // 显示加载提示
      wx.showLoading({
        title: '正在分析任务系列...',
        mask: true
      });
      
      // 添加超时保护，确保加载提示不会一直显示
      const loadingTimeout = setTimeout(() => {
        console.log('[TaskHeatmap] 更新操作超时，强制关闭加载提示');
        wx.hideLoading();
        
        // 提供用户选择是继续等待还是取消操作
        wx.showModal({
          title: '操作耗时较长',
          content: '是否继续等待？取消将中断当前操作',
          confirmText: '继续等待',
          cancelText: '取消操作',
          success: (res) => {
            if (res.confirm) {
              // 用户选择继续等待，重启操作
              console.log('[TaskHeatmap] 用户选择继续等待，重启操作');
              wx.showLoading({
                title: '继续处理中...',
                mask: true
              });
              // 此处不重启超时计时器，让操作继续进行
            } else {
              // 用户选择取消操作
              console.log('[TaskHeatmap] 用户取消操作');
              if (callback) callback(false, 0);
            }
          }
        });
      }, 15000); // 增加超时时间到15秒
      
      // 使用Promise优化任务处理
      const getAllTasksPromise = () => {
        return new Promise((resolve, reject) => {
          try {
            taskManager.getAllTasks(allTasks => {
              resolve(allTasks);
            });
          } catch (error) {
            reject(error);
          }
        });
      };
      
      const updateTaskPromise = (taskId, data) => {
        return new Promise((resolve, reject) => {
          try {
            // 使用精简版的更新函数，避免重复加载全部任务
            const updatedTask = {
              id: taskId,
              ...data,
              updateTime: Date.now()
            };
            resolve(updatedTask);
          } catch (error) {
            reject(error);
          }
        });
      };
      
      // 执行任务更新流程
      getAllTasksPromise()
        .then(allTasks => {
          // 清除超时定时器
          clearTimeout(loadingTimeout);
          
          // 获取父任务ID
          let parentId = task.parentTaskId;
          
          // 如果当前任务没有parentTaskId，可能它自己就是父任务
          if (!parentId) {
            console.log(`[TaskHeatmap] 当前任务没有parentTaskId，可能是原始任务`);
            parentId = task.id;
          }
          
          console.log(`[TaskHeatmap] 使用父任务ID查找系列任务: ${parentId}`);
          
          // 使用改进的筛选逻辑
          let seriesTasks = allTasks.filter(t => 
            t.parentTaskId === parentId || // 找出所有子任务
            t.id === parentId              // 包含父任务自身
          );
          
          // 记录筛选前的任务总数，用于日志
          const allSeriesTasks = [...seriesTasks];
          
          // 获取今天日期，作为筛选基准
          const today = this.data.todayString;
          
          // 只保留今天及之后的任务，而不是基于选中的任务日期
          seriesTasks = seriesTasks.filter(t => t.date >= today);
          
          console.log(`[TaskHeatmap] 今天日期: ${today}`);
          console.log(`[TaskHeatmap] 选中任务日期: ${task.date}`);
          console.log(`[TaskHeatmap] 找到该循环的任务总数: ${allSeriesTasks.length}个`);
          console.log(`[TaskHeatmap] 日期过滤后，只更新今天(${today})及之后的任务: ${seriesTasks.length}个`);
          
          // 任务数量安全检查
          const MAX_SAFE_TASKS = 100;
          if (seriesTasks.length > MAX_SAFE_TASKS) {
            // 确保先隐藏之前的加载提示
            wx.hideLoading();
            
            return new Promise((resolve, reject) => {
              wx.showModal({
                title: '任务数量过多',
                content: `即将更新从今天(${today})开始的${seriesTasks.length}个循环任务，可能需要较长时间。是否继续？`,
                confirmText: '继续',
                cancelText: '取消',
                success: (res) => {
                  if (res.confirm) {
                    console.log(`[TaskHeatmap] 用户确认继续处理大量任务: ${seriesTasks.length}个`);
                    wx.showLoading({
                      title: '准备更新...',
                      mask: true
                    });
                    resolve(seriesTasks);
                  } else {
                    console.log('[TaskHeatmap] 用户取消大量任务更新');
                    // 确保在reject前执行回调，避免遗漏回调
                    if (callback) callback(false, 0);
                    reject(new Error('用户取消操作'));
                  }
                }
              });
            });
          }
          
          return seriesTasks;
        })
        .then(seriesTasks => {
          console.log(`[TaskHeatmap] 更新任务系列，共找到: ${seriesTasks.length} 个任务`);
          
          if (seriesTasks.length === 0) {
            console.log(`[TaskHeatmap] 未找到任何相关系列任务，只更新当前任务`);
            // 确保隐藏loading
            wx.hideLoading();
            taskManager.editTask(task.id, updateData, (updatedTask) => {
              if (updatedTask) {
                if (callback) callback(true, 1);
              } else {
                if (callback) callback(false, 0);
              }
            });
            throw new Error('仅更新单个任务');
          }
          
          // 用于保存更新结果的数组
          const results = {
            success: [],
            failed: []
          };
          
          // 批量处理任务更新
          const batchSize = 10; // 增大批处理数量，减少UI更新频率
          let updatedTasksData = []; // 保存所有更新后的任务数据
          
          // 分批处理任务，减少频繁更新loading消息
          let processedCount = 0;
          const updateBatch = (start) => {
            const end = Math.min(start + batchSize, seriesTasks.length);
            const batchPromises = [];
            
            for (let i = start; i < end; i++) {
              const currentTask = seriesTasks[i];
              batchPromises.push(
                updateTaskPromise(currentTask.id, updateData)
                  .then(updatedTask => {
                    updatedTasksData.push(updatedTask);
                    results.success.push(currentTask.id);
                    return true;
                  })
                  .catch(error => {
                    console.error(`[TaskHeatmap] 准备更新任务数据失败: ${currentTask.id}`, error);
                    results.failed.push(currentTask.id);
                    return false;
                  })
              );
            }
            
            return Promise.all(batchPromises)
              .then(() => {
                processedCount += (end - start);
                
                // 更新进度提示
                wx.showLoading({
                  title: `准备更新(${processedCount}/${seriesTasks.length})`,
                  mask: true
                });
                
                // 继续处理下一批或返回结果
                if (end < seriesTasks.length) {
                  return updateBatch(end);
                }
                
                console.log(`[TaskHeatmap] 所有任务更新数据准备完成 (${processedCount}/${seriesTasks.length})，准备批量保存`);
                return { results, updatedTasksData, seriesTasks };
              });
          };
          
          // 开始批量处理
          return updateBatch(0);
        })
        .then(({ results, updatedTasksData, seriesTasks }) => {
          // 保存处理结果到缓存
          if (updatedTasksData.length > 0) {
            // 更新loading提示
            wx.showLoading({
              title: '正在保存更新...',
              mask: true
            });
            
            // 保存批量更新结果
            return new Promise((resolve, reject) => {
              try {
                // 获取原始任务数据
                taskManager.getAllTasks(allTasks => {
                  // 合并更新数据
                  const updatedTasks = allTasks.map(originalTask => {
                    const updatedData = updatedTasksData.find(u => u.id === originalTask.id);
                    if (updatedData) {
                      return { 
                        ...originalTask, 
                        ...updateData,
                        updateTime: Date.now() 
                      };
                    }
                    return originalTask;
                  });
                  
                  // 批量保存
                  taskManager._saveTaskData(updatedTasks, () => {
                    // 触发任务变更事件
                    taskManager._onTaskDataChanged(updatedTasks);
                    resolve(results);
                  });
                });
              } catch (error) {
                console.error('[TaskHeatmap] 保存任务更新出错:', error);
                // 确保在出错时也关闭loading
                wx.hideLoading();
                reject(error);
              }
            });
          } else {
            // 没有任务需要更新，确保关闭loading
            wx.hideLoading();
            return results;
          }
        })
        .then(results => {
          // 全部处理完成，确保关闭loading
          wx.hideLoading();
          
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
        })
        .catch(error => {
          // 仅在需要时隐藏加载提示（确保关闭loading）
          if (error.message !== '仅更新单个任务') {
            wx.hideLoading();
            console.error('[TaskHeatmap] 更新任务系列过程中出错:', error);
            
            // 显示友好的错误提示
            wx.showToast({
              title: '更新过程出错',
              icon: 'error',
              duration: 2000
            });
            
            if (callback) callback(false, 0);
          }
        });
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
        const expiryText = task.pointsExpiry === 'permanent' ? '永久' : 
          (Constants.POINTS_EXPIRY.TEXT[task.pointsExpiry] ? 
          Constants.POINTS_EXPIRY.TEXT[task.pointsExpiry] : '7天');
          
        console.log(`[taskHeatmap] 渲染任务详情: ${task.title}, 日期: ${task.date}, 积分有效期: ${task.pointsExpiry}, 转换后: ${expiryText}`);
      }
    },

    // 添加新的方法 _loadCalendarData
    _loadCalendarData() {
      // 实现 _loadCalendarData 方法的逻辑
    }
  }
}); 