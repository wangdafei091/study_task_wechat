const Constants = require('../../utils/constants.js');
const uiUtils = require('../../utils/uiUtils.js');
const serviceManager = require('../../services/service-manager.js');
const logger = require('../../utils/logger.js');

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
    weekDays: ['日', '一', '二', '三', '四', '五', '六'], // 星期几
    days: [], // 日历日期
    selectedDate: '', // 选中的日期
    selectedDateText: '', // 选中日期的文本显示
    dayTasks: [], // 日期任务
    showDayTasks: false, // 是否显示日期任务
    editingTaskId: null, // 正在编辑的任务ID
    editingTaskIndex: -1, // 正在编辑的任务索引
    editPoints: 0, // 编辑时的积分值
    editDescription: '', // 编辑时的描述
    showDeleteConfirm: false, // 显示删除确认
    deleteScope: '', // 删除范围: 'single'/'series'
    activeTaskForDelete: null, // 当前要删除的任务
    showPressureInfo: false, // 显示压力指数说明
    selectedDayPressure: {}, // 选中日期压力信息
    taskListScrollTop: 0, // 任务列表滚动位置
    editScope: 'single', // 编辑范围：'single'/'series'
    scopeInfoStyle: '', // 范围说明气泡样式
    showScopeInfoBubble: false, // 显示范围说明气泡
    scopeInfoTimer: null, // 范围说明气泡计时器
    showActionMenu: false, // 显示操作菜单
    activeTaskId: '', // 当前操作的任务ID
    activeTaskIndex: -1, // 当前操作的任务索引
    actionMenuStyle: '', // 操作菜单样式
    todayString: new Date().toISOString().split('T')[0], // 今天日期字符串，格式YYYY-MM-DD
    pointsReadOnly: false, // 积分是否为只读状态（已完成任务或历史任务）
  },
  
  /**
   * 组件生命周期
   */
  lifetimes: {
    attached: function() {
      console.log('[TaskHeatmap] 组件挂载');
      
      // 获取窗口信息，判断屏幕宽度
      wx.getWindowInfo({
        success: (res) => {
          const screenWidth = res.screenWidth;
          console.log(`[taskHeatmap] 设备屏幕宽度: ${screenWidth}px, 是否采用垂直布局: ${screenWidth <= 520}`);
          this.setData({
            windowWidth: res.windowWidth
          });
        },
        fail: (err) => {
          console.error('[taskHeatmap] 获取窗口信息失败:', err);
          // 设置默认值
          this.setData({
            windowWidth: 375
          });
        }
      });
      
      // 设置当前日期字符串
      const today = new Date();
      const year = today.getFullYear();
      const month = (today.getMonth() + 1).toString().padStart(2, '0');
      const day = today.getDate().toString().padStart(2, '0');
      const todayString = `${year}-${month}-${day}`;
      
      this.setData({
        todayString: todayString
      });
      
      console.log(`[TaskHeatmap] 设置今天日期: ${todayString}`);
      
      // 生成日历
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
      
      // 使用预先计算好的压力值，避免重复计算
      let totalPressure = 0;
      if (dayData && dayData.pressure && dayData.pressure.total !== undefined) {
        console.log(`[TaskHeatmap] 使用预计算的压力值: ${dayData.pressure.total}`);
        totalPressure = dayData.pressure.total;
      } else {
        console.log(`[TaskHeatmap] 日期没有预计算的压力值，使用默认值0`);
      }
      
      // 使用统一的enhanceTaskData方法增强任务信息
      const tasks = dayTasks.map(task => {
        // 记录任务是否为必做任务
        console.log(`[task-heatmap] 处理任务: ${task.title}, 是否必做: ${task.isRequired ? '是' : '否'}, ID: ${task.id}`);
        
        // 使用统一的任务数据增强方法
        return this.enhanceTaskData(task);
      });
      
      // 使用预计算好的压力级别
      const pressureLevel = dayData && dayData.level ? 
        this.calculatePressureLevel(totalPressure) : 
        { levelText: '轻松', levelNum: 1, isHigh: false };
      
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
      
      // 判断任务是否为已完成或历史任务
      const isCompleted = task.status === 'completed' || task.status === 1;
      const isHistoryTask = task.date < this.data.todayString;
      const pointsReadOnly = isCompleted || isHistoryTask;
      
      console.log(`[TaskHeatmap] 编辑任务: ${task.title}, 是否必做: ${task.isRequired ? '是' : '否'}, 是否已完成: ${isCompleted}, 是否为历史任务: ${isHistoryTask}`);
      console.log(`[TaskHeatmap] 积分编辑状态: ${pointsReadOnly ? '只读' : '可编辑'}`);
      
      // 默认设为单任务编辑
      let defaultScope = 'single';
      
      // 设置初始编辑数据
      this.setData({
        editingTaskId: taskId,
        editingTaskIndex: taskIndex,
        editPoints: task.points || 0,
        editDescription: task.description || '',
        editScope: defaultScope,
        pointsReadOnly: pointsReadOnly // 设置积分是否为只读状态
      });
      
      console.log('[TaskHeatmap] 开始编辑任务:', task.title, 
                 '积分:', this.data.editPoints, 
                 '描述:', this.data.editDescription,
                 '范围:', this.data.editScope,
                 '积分只读:', this.data.pointsReadOnly);
      
      // 确保编辑区域可见（无论是否为循环任务）
      this.ensureEditAreaVisible(taskId, 'edit');
    },
    
    // 确保编辑或删除区域在视图中可见
    ensureEditAreaVisible(taskId, areaType = 'edit') {
      console.log(`[TaskHeatmap] 准备滚动到${areaType === 'edit' ? '编辑' : '删除'}区域`);
      
      // 给DOM更新和动画一些时间
      setTimeout(() => {
        // 构建选择器，编辑区域有专用ID，删除区域用任务ID和类组合
        const taskSelector = `#task-${taskId}`;
        const targetSelector = areaType === 'edit' ? 
          `#edit-${taskId}` : 
          `#task-${taskId} .delete-confirm.visible`;
        const containerSelector = '#tasks-scroll-view';
        
        console.log(`[TaskHeatmap] 使用选择器 "${targetSelector}" 定位滚动目标`);

        // 创建查询，同时获取所有需要的元素位置
        const query = this.createSelectorQuery();
        query.select(taskSelector).boundingClientRect(); // 任务卡片位置
        query.select(targetSelector).boundingClientRect(); // 目标区域位置
        query.select(containerSelector).boundingClientRect(); // 滚动容器位置
        query.select(containerSelector).scrollOffset(); // 当前滚动位置
        query.exec((res) => {
          if (!res || !res[0] || !res[1] || !res[2] || !res[3]) {
            console.error('[TaskHeatmap] 获取元素位置失败，使用备用滚动方案');
            
            // 备用方案：使用固定偏移量
            const currentScrollTop = this.data.taskListScrollTop || 0;
            const fallbackOffset = 120;
            this.setData({
              taskListScrollTop: currentScrollTop + fallbackOffset
            });
            return;
          }
          
          const taskRect = res[0]; // 任务卡片位置
          const targetRect = res[1]; // 目标区域（编辑或删除区域）
          const containerRect = res[2]; // 滚动容器
          const scrollData = res[3]; // 当前滚动位置
          
          console.log(`[TaskHeatmap] 任务卡片位置: top=${taskRect.top}, height=${taskRect.height}`);
          console.log(`[TaskHeatmap] ${areaType}区域位置: top=${targetRect.top}, height=${targetRect.height}`);
          console.log(`[TaskHeatmap] 滚动容器: height=${containerRect.height}, top=${containerRect.top}`);
          console.log(`[TaskHeatmap] 当前滚动位置: scrollTop=${scrollData.scrollTop}`);
          
          // 计算目标区域相对于可视容器的位置
          const targetBottom = targetRect.top + targetRect.height;
          const containerBottom = containerRect.top + containerRect.height;
          
          // 判断目标区域是否可见
          const isTargetFullyVisible = 
            targetRect.top >= containerRect.top && 
            targetBottom <= containerBottom;
          
          if (!isTargetFullyVisible) {
            // 计算需要滚动的位置
            let newScrollTop = scrollData.scrollTop;
            const visualBuffer = 20; // 视觉缓冲区，单位rpx
            
            // 如果目标底部超出可视范围底部
            if (targetBottom > containerBottom) {
              const overflow = targetBottom - containerBottom;
              newScrollTop += overflow + visualBuffer;
              console.log(`[TaskHeatmap] 目标底部超出视图 ${overflow}px，向下滚动`);
            } 
            // 如果目标顶部在可视范围顶部之上
            else if (targetRect.top < containerRect.top) {
              const underflow = containerRect.top - targetRect.top;
              newScrollTop -= underflow + visualBuffer;
              console.log(`[TaskHeatmap] 目标顶部在视图之上 ${underflow}px，向上滚动`);
            }
            
            // 确保不滚动到负值
            newScrollTop = Math.max(0, newScrollTop);
            
            console.log(`[TaskHeatmap] 计算得到新滚动位置: ${newScrollTop}px (当前: ${scrollData.scrollTop}px)`);
            
            // 设置新的滚动位置
            this.setData({
              taskListScrollTop: newScrollTop
            });
            
            console.log(`[TaskHeatmap] 设置滚动位置: ${newScrollTop}px`);
          } else {
            console.log(`[TaskHeatmap] ${areaType}区域已在可视范围内，无需滚动`);
          }
        });
      }, 300); // 给DOM更新和CSS动画足够的时间
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
      // 如果积分为只读状态，则不允许修改
      if (this.data.pointsReadOnly) {
        console.log('[TaskHeatmap] 积分为只读状态，禁止修改');
        // 显示提示
        wx.showToast({
          title: '已完成任务积分不可修改',
          icon: 'none',
          duration: 1500
        });
        return;
      }
      
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
      // 如果积分为只读状态，则不允许修改
      if (this.data.pointsReadOnly) {
        console.log('[TaskHeatmap] 积分为只读状态，禁止输入修改');
        // 还原为原值
        this.setData({
          editPoints: this.data.editPoints
        });
        return;
      }
      
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
      const logger = require('../../utils/logger');
      const value = e.detail.value;
      
      logger.info('TaskHeatmap', '编辑描述', `长度: ${value.length}/50`);
      
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
        showScopeInfoBubble: false,
        pointsReadOnly: false // 重置积分只读状态
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
    async saveEdit() {
      const logger = require('../../utils/logger.js');
      const serviceManager = require('../../services/service-manager.js');
      const taskService = serviceManager.getService('TaskService');
      
      if (this.data.editingTaskIndex < 0 || !this.data.editingTaskId) {
        logger.error('task-heatmap', '没有正在编辑的任务');
        return;
      }
      
      const taskIndex = this.data.editingTaskIndex;
      const taskId = this.data.editingTaskId;
      const task = this.data.dayTasks[taskIndex];
      
      if (!task) {
        logger.error('task-heatmap', '找不到要编辑的任务');
        this.cancelEdit();
        return;
      }
      
      logger.info('task-heatmap', `保存任务编辑: ${task.title}`);
      logger.info('task-heatmap', `新积分: ${this.data.editPoints}`);
      logger.info('task-heatmap', `新描述: ${this.data.editDescription}`);
      logger.info('task-heatmap', `编辑范围: ${this.data.editScope}`);
      
      // 准备更新的字段
      const updateData = {
        description: this.data.editDescription,
        modifyTime: Date.now()
      };
      
      // 如果不是必做任务，且积分不是只读状态，才更新积分字段
      if (!task.isRequired && !this.data.pointsReadOnly) {
        updateData.points = this.data.editPoints;
        logger.info('task-heatmap', `将更新积分为: ${this.data.editPoints}`);
      } else if (this.data.pointsReadOnly) {
        logger.info('task-heatmap', '积分为只读状态，不更新积分字段');
      } else {
        logger.info('task-heatmap', '必做任务，不更新积分字段');
      }
      
      logger.info('task-heatmap', `更新任务${task.id}，是否必做: ${task.isRequired ? '是' : '否'}, 积分只读: ${this.data.pointsReadOnly ? '是' : '否'}, 更新字段:`, updateData);
      
      // 显示加载中
      wx.showLoading({
        title: '保存中...',
        mask: true
      });
      
      try {
        // 根据编辑范围执行不同的更新逻辑
        if (this.data.editScope === 'series' && task.repeat && task.repeat.type !== 'none') {
          // 编辑循环任务系列
          logger.info('task-heatmap', '更新整个循环任务系列');
          
          const result = await this.updateTaskSeries(task, updateData);
          if (result.success) {
            // 显示成功提示
            wx.showToast({
              title: `已更新${result.count}个任务`,
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
        } else {
          // 仅编辑当前任务
          logger.info('task-heatmap', '仅更新当前任务');
          
          // 更新单个任务
          const updateResult = await taskService.updateTask(taskId, updateData);
          logger.info('task-heatmap', '任务更新服务调用完成', { success: updateResult?.success, hasTask: !!updateResult?.task });
          
          if (updateResult && updateResult.success) {
            logger.info('task-heatmap', '任务更新成功');
            
            // 增强任务数据，确保包含所有显示字段
            const enhancedTask = this.enhanceTaskData(updateResult.task);
            logger.info('task-heatmap', '任务数据增强完成', {
              id: enhancedTask.id,
              hasStartTime: !!enhancedTask.startTime,
              hasEndTime: !!enhancedTask.endTime,
              hasDate: !!enhancedTask.date
            });
            
            // 更新本地显示
            const updatedDayTasks = [...this.data.dayTasks];
            updatedDayTasks[taskIndex] = enhancedTask;
            
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
            logger.error('task-heatmap', '任务更新失败', updateResult);
            wx.showToast({
              title: updateResult && updateResult.message ? updateResult.message : '更新失败',
              icon: 'error',
              duration: 1500
            });
          }
        }
      } catch (error) {
        logger.error('task-heatmap', '保存编辑过程中出错', error);
        wx.showToast({
          title: '更新失败',
          icon: 'error',
          duration: 1500
        });
      } finally {
        // 隐藏加载提示
        wx.hideLoading();
        
        // 关闭编辑区域
        this.cancelEdit();
      }
    },
    
    // 获取当前月份
    getCurrentMonth() {
      return {
        year: this.properties.currentYear,
        month: this.properties.currentMonth
      };
    },

    /**
     * 增强任务数据，添加显示所需的格式化字段
     * @param {Object} task 原始任务对象
     * @returns {Object} 增强后的任务对象
     */
    enhanceTaskData(task) {
      const Constants = require('../../utils/constants.js');
      const logger = require('../../utils/logger.js');
      
      logger.info('task-heatmap', '开始增强任务数据', {
        taskId: task.id,
        title: task.title,
        hasStartTime: !!task.startTime,
        hasEndTime: !!task.endTime,
        isAllDay: !!task.isAllDay
      });
      
      // 创建增强任务对象
      const enhancedTask = { ...task };
      
      // 处理重复任务信息
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
            enhancedTask.repeatInfo = `${this.formatDateRange(task.repeat.startDate, task.repeat.endDate)} 每周${weekDayNames[weekDay]} ${weeklyTimeRange}`;
            break;
          case 'workdays':
            // 根据全天任务状态决定时间显示
            let workdaysTimeRange = task.isAllDay ? '全天' : `${task.startTime}-${task.endTime}`;
            enhancedTask.repeatInfo = `${this.formatDateRange(task.repeat.startDate, task.repeat.endDate)} 工作日 ${workdaysTimeRange}`;
            break;
          case 'weekends':
            // 根据全天任务状态决定时间显示
            let weekendsTimeRange = task.isAllDay ? '全天' : `${task.startTime}-${task.endTime}`;
            enhancedTask.repeatInfo = `${this.formatDateRange(task.repeat.startDate, task.repeat.endDate)} 休息日 ${weekendsTimeRange}`;
            break;
          case 'custom':
            // 根据全天任务状态决定时间显示
            let customTimeRange = task.isAllDay ? '全天' : `${task.startTime}-${task.endTime}`;
            enhancedTask.repeatInfo = `${this.formatDateRange(task.repeat.startDate, task.repeat.endDate)} 每周${this.formatRepeatDays(task.repeat.days)} ${customTimeRange}`;
            break;
        }
      } else {
        // 格式化单次任务日期为"5月23日"形式用于显示
        const taskDate = new Date(task.date);
        const month = taskDate.getMonth() + 1;
        const day = taskDate.getDate();
        enhancedTask.date = `${month}月${day}日`;
      }
      
      // 确保任务有积分有效期信息
      if (task.status === 1 || task.status === 'completed') {
        // 已完成任务：显示具体失效日期
        if (task.pointsExpiryDate) {
          enhancedTask.pointsExpiryDate = task.pointsExpiryDate;
        } else if (task.pointsExpiry === 'permanent') {
          enhancedTask.pointsExpiryDate = '永久';
        } else {
          enhancedTask.pointsExpiryDate = '7天后';
        }
      } else {
        // 未完成任务：根据任务设置的实际有效期类型显示
        enhancedTask.pointsExpiryDate = '';
        enhancedTask.pointsExpiry = task.pointsExpiry || 'permanent';
        
        if (enhancedTask.pointsExpiry === 'permanent') {
          enhancedTask.pointsExpiryDate = '永久';
        } else if (Constants.POINTS_EXPIRY.TEXT[enhancedTask.pointsExpiry]) {
          enhancedTask.pointsExpiryDate = Constants.POINTS_EXPIRY.TEXT[enhancedTask.pointsExpiry];
        } else {
          enhancedTask.pointsExpiryDate = '7天';
        }
      }
      
      // 确保必做任务属性被正确传递
      enhancedTask.isRequired = !!task.isRequired;
      
      // 确保积分值被正确传递
      enhancedTask.points = task.points || 0;
      
      // 确保时间字段被正确传递
      enhancedTask.startTime = task.startTime || '';
      enhancedTask.endTime = task.endTime || '';
      
      // 确保isAllDay字段被正确传递
      enhancedTask.isAllDay = !!task.isAllDay;
      
      logger.info('task-heatmap', '任务数据增强完成', {
        taskId: enhancedTask.id,
        title: enhancedTask.title,
        date: enhancedTask.date,
        startTime: enhancedTask.startTime,
        endTime: enhancedTask.endTime,
        isAllDay: enhancedTask.isAllDay
      });
      
      return enhancedTask;
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
      
      // 确保删除确认区域可见
      this.ensureEditAreaVisible(taskId, 'delete');
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
      
      // 如果是任务系列删除，确保提示文本可见
      if (scope === 'series' && this.data.activeTaskForDelete) {
        this.ensureEditAreaVisible(this.data.activeTaskForDelete.id, 'delete');
      }
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
    async deleteTask(taskId) {
      const logger = require('../../utils/logger.js');
      const serviceManager = require('../../services/service-manager.js');
      const taskService = serviceManager.getService('TaskService');
      
      // 记录当前任务在本地数组中的索引，用于后续更新本地UI
      const taskIndex = this.data.dayTasks.findIndex(task => task.id === taskId);
      logger.info('task-heatmap', `准备删除任务ID: ${taskId}, 在本地数组中的索引: ${taskIndex}`);
      
      if (taskIndex === -1) {
        logger.error('task-heatmap', `未找到要删除的任务: ${taskId}`);
      }
      
      try {
        // 使用TaskService删除任务
        const success = await taskService.deleteTask(taskId);
        
        if (success) {
          logger.info('task-heatmap', `任务删除成功: ${taskId}`);
          
          // 任务删除成功后，更新本地数据
          if (taskIndex !== -1) {
            // 创建新的任务数组，移除已删除的任务
            const updatedTasks = [...this.data.dayTasks];
            updatedTasks.splice(taskIndex, 1);
            
            logger.info('task-heatmap', `更新本地任务列表，删除前: ${this.data.dayTasks.length}个, 删除后: ${updatedTasks.length}个`);
            
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
          logger.error('task-heatmap', `任务删除失败: ${taskId}`);
          wx.showToast({
            title: '删除失败',
            icon: 'error'
          });
        }
      } catch (error) {
        logger.error('task-heatmap', `删除任务过程中出错: ${taskId}`, error);
        wx.showToast({
          title: '删除失败',
          icon: 'error'
        });
      } finally {
        // 删除操作完成后，重置删除相关状态
        this.setData({
          showDeleteConfirm: false,
          deleteScope: '',
          activeTaskForDelete: null
        });
      }
    },
    
    /**
     * 删除任务系列
     */
    async deleteTaskSeries(task) {
      const logger = require('../../utils/logger.js');
      const serviceManager = require('../../services/service-manager.js');
      const taskService = serviceManager.getService('TaskService');
      const messageManager = serviceManager.getService('MessageService');
      
      // 添加日志，记录当前需要删除的任务详细信息
      logger.info('task-heatmap', '准备删除任务系列，当前任务详情:', {
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
      
      try {
        // 获取所有任务
        const allTasks = await taskService.getTasks();
          
        // 获取父任务ID
        let parentId = task.parentTaskId;
        
        // 如果当前任务没有parentTaskId，可能它自己就是父任务
        if (!parentId) {
          logger.info('task-heatmap', '当前任务没有parentTaskId，可能是原始任务');
          parentId = task.id;
        }
        
        logger.info('task-heatmap', `使用父任务ID查找系列任务: ${parentId}`);
        
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
        
        logger.info('task-heatmap', `今天日期: ${today}`);
        logger.info('task-heatmap', `选中任务日期: ${task.date}`);
        logger.info('task-heatmap', `找到该循环的任务总数: ${allSeriesTasks.length}个`);
        logger.info('task-heatmap', `日期过滤后，只删除今天(${today})及之后的任务: ${seriesTasks.length}个`);
        
        // 先精简任务数据，只保留必要字段，减少内存占用
        seriesTasks = seriesTasks.map(t => ({
          id: t.id,
          title: t.title,
          date: t.date
        }));
        
        // 如果没有任务需要删除，提前返回
        if (seriesTasks.length === 0) {
          logger.info('task-heatmap', '未找到需要删除的任务');
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
          
          return;
        }
        
        // 任务数量安全检查
        const MAX_SAFE_TASKS = 100;
        if (seriesTasks.length > MAX_SAFE_TASKS) {
          wx.hideLoading();
          
          // 用户确认对话框
          const userConfirmed = await new Promise((resolve) => {
            wx.showModal({
              title: '任务数量过多',
              content: `即将删除从今天(${today})开始的${seriesTasks.length}个循环任务，可能需要较长时间。是否继续？`,
              confirmText: '继续',
              cancelText: '取消',
              success: (res) => {
                resolve(res.confirm);
              }
            });
          });
          
          if (!userConfirmed) {
            logger.info('task-heatmap', '用户取消大量任务删除');
            // 重置删除相关状态
            this.setData({
              showDeleteConfirm: false,
              deleteScope: '',
              activeTaskForDelete: null
            });
            return;
          }
          
          logger.info('task-heatmap', `用户确认继续处理大量任务: ${seriesTasks.length}个`);
          wx.showLoading({
            title: '准备删除...',
            mask: true
          });
        }
        
        logger.info('task-heatmap', `删除任务系列，共找到: ${seriesTasks.length} 个任务`);
        
        // 用于保存删除结果的数组
        const results = {
          success: [],
          failed: []
        };
        
        // 串行删除任务
        for (let i = 0; i < seriesTasks.length; i++) {
          const currentTask = seriesTasks[i];
          
          // 更新进度提示（每5个任务更新一次）
          if (i % 5 === 0 || i === seriesTasks.length - 1) {
            wx.showLoading({
              title: `删除中(${i + 1}/${seriesTasks.length})`,
              mask: true
            });
          }
          
          logger.info('task-heatmap', `正在删除第 ${i+1}/${seriesTasks.length} 个任务：${currentTask.id}`);
          
          try {
            // 使用TaskService删除任务
            const success = await taskService.deleteTask(currentTask.id);
            
            if (success) {
              results.success.push(currentTask.id);
              logger.info('task-heatmap', `成功删除任务 ${currentTask.id}`);
              
              // 等待一小段时间，避免存储冲突
              await new Promise(resolve => setTimeout(resolve, 20));
            } else {
              results.failed.push(currentTask.id);
              logger.error('task-heatmap', `删除任务失败: ${currentTask.id}`);
            }
          } catch (error) {
            results.failed.push(currentTask.id);
            logger.error('task-heatmap', `删除任务出错: ${currentTask.id}`, error);
          }
        }
        
        // 处理结果
        logger.info('task-heatmap', `任务系列删除完成，成功: ${results.success.length}，失败: ${results.failed.length}`);
        
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
            await messageManager.createTaskMessage(task, 'deleted', {
              isBatchOperation: true,
              batchCount: results.success.length
            });
          }
          
          // 强制刷新热力图，确保视图反映最新数据
          logger.info('task-heatmap', '执行强制热力图刷新以确保视图更新');
          this.refreshTaskList();
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
      } catch (error) {
        // 确保加载提示被关闭
        wx.hideLoading();
        
        logger.error('task-heatmap', '删除任务系列过程中出错:', error);
        
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
    },
    
    /**
     * 刷新任务列表
     */
    refreshTaskList() {
      const logger = require('../../utils/logger.js');
      logger.info('task-heatmap', '刷新任务列表');
      
      // 通知父组件刷新任务数据
      this.triggerEvent('refreshTasks');
      
      // 关闭任务列表面板
      this.closeDayTasks();
      
      // 强制刷新热力图数据 - 改进三阶段刷新流程
      // 阶段1: 立即清空热力图数据
      const serviceManager = require('../../services/service-manager.js');
      const taskService = serviceManager.getService('TaskService');
      logger.info('task-heatmap', '第一阶段刷新：清空热力图数据');
      
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
        logger.info('task-heatmap', '热力图数据已清空，准备获取新数据');
      });
      
      // 阶段2: 从任务服务获取最新数据
      setTimeout(async () => {
        logger.info('task-heatmap', '第二阶段刷新：获取最新任务数据并计算热力图');
        
        try {
          // 使用TaskService获取最新数据
          const latestTasks = await taskService.getTasks();
          logger.info('task-heatmap', `获取到最新任务数据: ${latestTasks.length}个任务`);
          
          // 将最新任务数据传递给属性，确保热力图计算使用最新数据
          this.setData({ 
            "__refreshTimestamp": Date.now() // 添加刷新时间戳，确保视图刷新
          }, () => {
            logger.info('task-heatmap', '准备强制重新计算热力图');
            
            // 强制重新计算热力图
            this.calculateHeatMap(latestTasks);
            
            // 阶段3: 确认刷新完成
            setTimeout(async () => {
              logger.info('task-heatmap', '第三阶段刷新：确认热力图已更新');
              
              try {
                // 再次从TaskService获取最新数据，确保热力图与数据一致
                const finalTasks = await taskService.getTasks();
                logger.info('task-heatmap', `确认更新：最终任务数据数量 ${finalTasks.length}个`);
                
                // 确认热力图已完全更新
                this.calculateHeatMap(finalTasks);
                
                // 触发完成事件
                this.triggerEvent('refreshComplete', {
                  taskCount: finalTasks.length,
                  timestamp: Date.now()
                });
              } catch (error) {
                logger.error('task-heatmap', '第三阶段刷新获取任务数据失败', error);
              }
            }, 500);
          });
        } catch (error) {
          logger.error('task-heatmap', '第二阶段刷新获取任务数据失败', error);
        }
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
      
      // 获取任务对象
      const task = this.data.dayTasks[taskIndex];
      
      // 判断是否为已完成任务或历史任务
      const isCompleted = task.status === 'completed' || task.status === 1;
      const isHistoryTask = task.date < this.data.todayString;
      const showDeleteOption = !(isCompleted || isHistoryTask);
      
      console.log(`[task-heatmap] 任务操作菜单：任务ID=${taskId}, 标题=${task.title}, 状态=${task.status}, 日期=${task.date}`);
      console.log(`[task-heatmap] 判断结果：已完成=${isCompleted}, 历史任务=${isHistoryTask}, 显示删除选项=${showDeleteOption}`);
      
      // 获取点击元素位置
      const query = this.createSelectorQuery();
      query.select(`#task-${taskId} .more-actions`).boundingClientRect();
      query.selectViewport().scrollOffset();
      query.exec((res) => {
        if (res && res[0]) {
          const buttonRect = res[0];
          // 使用deviceInfo工具替代废弃API
          const deviceInfo = require('../../utils/deviceInfo');
          const systemInfo = deviceInfo.getSystemInfo();
          
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
     * @returns {Promise<Object>} 更新结果，包含 success 和 count 属性
     */
    async updateTaskSeries(task, updateData) {
      const logger = require('../../utils/logger.js');
      const serviceManager = require('../../services/service-manager.js');
      const taskService = serviceManager.getService('TaskService');
      const messageManager = serviceManager.getService('MessageService');
      
      logger.info('task-heatmap', `准备更新任务系列，当前任务:`, {
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
      
      try {
        // 获取所有任务
        const allTasks = await taskService.getTasks();
        
        // 获取父任务ID
        let parentId = task.parentTaskId;
        
        // 如果当前任务没有parentTaskId，可能它自己就是父任务
        if (!parentId) {
          logger.info('task-heatmap', '当前任务没有parentTaskId，可能是原始任务');
          parentId = task.id;
        }
        
        logger.info('task-heatmap', `使用父任务ID查找系列任务: ${parentId}`);
        
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
        
        logger.info('task-heatmap', `今天日期: ${today}`);
        logger.info('task-heatmap', `选中任务日期: ${task.date}`);
        logger.info('task-heatmap', `找到该循环的任务总数: ${allSeriesTasks.length}个`);
        logger.info('task-heatmap', `日期过滤后，只更新今天(${today})及之后的任务: ${seriesTasks.length}个`);
        
        // 任务数量安全检查
        const MAX_SAFE_TASKS = 100;
        if (seriesTasks.length > MAX_SAFE_TASKS) {
          // 确保先隐藏之前的加载提示
          wx.hideLoading();
          
          // 使用Promise封装用户确认对话框
          const userConfirmed = await new Promise((resolve) => {
            wx.showModal({
              title: '任务数量过多',
              content: `即将更新从今天(${today})开始的${seriesTasks.length}个循环任务，可能需要较长时间。是否继续？`,
              confirmText: '继续',
              cancelText: '取消',
              success: (res) => {
                resolve(res.confirm);
              }
            });
          });
          
          if (!userConfirmed) {
            logger.info('task-heatmap', '用户取消大量任务更新');
            return { success: false, count: 0 };
          }
          
          logger.info('task-heatmap', `用户确认继续处理大量任务: ${seriesTasks.length}个`);
          
          // 用户确认继续，显示加载提示
          wx.showLoading({
            title: '准备更新...',
            mask: true
          });
        }
        
        logger.info('task-heatmap', `更新任务系列，共找到: ${seriesTasks.length} 个任务`);
        
        // 没有找到任务，只更新当前任务
        if (seriesTasks.length === 0) {
          logger.info('task-heatmap', '未找到任何相关系列任务，只更新当前任务');
          
          // 更新单个任务
          const updatedTask = await taskService.updateTask(task.id, updateData);
          return { success: !!updatedTask, count: updatedTask ? 1 : 0 };
        }
        
        // 用于保存更新结果的数组
        const results = {
          success: [],
          failed: []
        };
        
        // 批量处理任务更新
        logger.info('task-heatmap', `开始批量更新${seriesTasks.length}个任务`);
        
        // 执行批量更新
        let processedCount = 0;
        const batchSize = 10;
        
        for (let i = 0; i < seriesTasks.length; i += batchSize) {
          const batch = seriesTasks.slice(i, i + batchSize);
          
          // 更新进度提示
          wx.showLoading({
            title: `更新中(${processedCount}/${seriesTasks.length})`,
            mask: true
          });
          
          // 并行更新批次内的任务
          const updatePromises = batch.map(async (currentTask) => {
            try {
              const updated = await taskService.updateTask(currentTask.id, updateData);
              if (updated) {
                results.success.push(currentTask.id);
                return true;
              } else {
                results.failed.push(currentTask.id);
                return false;
              }
            } catch (error) {
              logger.error('task-heatmap', `更新任务失败: ${currentTask.id}`, error);
              results.failed.push(currentTask.id);
              return false;
            }
          });
          
          // 等待当前批次完成
          await Promise.all(updatePromises);
          
          processedCount += batch.length;
          logger.info('task-heatmap', `已处理 ${processedCount}/${seriesTasks.length} 个任务`);
        }
        
        logger.info('task-heatmap', `任务系列更新完成，成功: ${results.success.length}，失败: ${results.failed.length}`);
        
        // 如果至少有一个任务更新成功
        if (results.success.length > 0) {
          // 仅当成功更新多个任务时才创建批量消息
          if (results.success.length > 1) {
            await messageManager.createTaskMessage(task, 'edited', {
              isBatchOperation: true,
              batchCount: results.success.length
            });
          }
          
          // 返回成功结果
          return { success: true, count: results.success.length };
        } else {
          // 没有任务更新成功
          return { success: false, count: 0 };
        }
      } catch (error) {
        logger.error('task-heatmap', '更新任务系列过程中出错:', error);
        return { success: false, count: 0 };
      } finally {
        // 确保隐藏加载提示
        wx.hideLoading();
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
        // 处理不同类型的积分有效期
        let expiryText = '';
        
        if (task.pointsExpiryDate) {
          // 已有格式化的过期日期，直接使用
          expiryText = task.pointsExpiryDate;
        } else if (task.pointsExpiry === 'permanent') {
          // 永久有效的情况
          expiryText = '永久';
        } else if (typeof task.pointsExpiry === 'string' && Constants.POINTS_EXPIRY.TEXT[task.pointsExpiry]) {
          // 尚未完成的任务，显示完成后的有效期类型
          expiryText = Constants.POINTS_EXPIRY.TEXT[task.pointsExpiry];
        } else if (typeof task.pointsExpiry === 'number') {
          // 数字类型是时间戳，计算与当前时间的差距，格式化为"几天后"
          const now = new Date().getTime();
          const diffDays = Math.ceil((task.pointsExpiry - now) / (24 * 60 * 60 * 1000));
          
          if (diffDays <= 0) {
            expiryText = '今日到期';
          } else if (diffDays === 1) {
            expiryText = '明日到期';
          } else {
            expiryText = `${diffDays}天后到期`;
          }
        } else {
          // 默认情况
          expiryText = '7天';
        }
          
        console.log(`[taskHeatmap] 渲染任务详情: ${task.title}, 日期: ${task.date}, 积分有效期类型: ${typeof task.pointsExpiry}, 值: ${task.pointsExpiry}, 转换后: ${expiryText}`);
      }
    },

    // 添加新的方法 _loadCalendarData
    _loadCalendarData() {
      // 实现 _loadCalendarData 方法的逻辑
    }
  }
}); 