/**
 * 日历弹窗组件
 * 基于已有的calendar组件，提供弹窗形式的日期选择功能
 */
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 是否显示弹窗
    visible: {
      type: Boolean,
      value: false
    },
    // 已选中的日期
    selectedDate: {
      type: String,
      value: ''
    },
    // 最小可选日期
    minDate: {
      type: String,
      value: ''
    },
    // 最大可选日期
    maxDate: {
      type: String,
      value: ''
    },
    // 是否使用范围选择模式
    rangeMode: {
      type: Boolean,
      value: false
    },
    // 范围选择的开始日期
    rangeStartDate: {
      type: String,
      value: ''
    },
    // 范围选择的结束日期
    rangeEndDate: {
      type: String,
      value: ''
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    // 当前视图模式：周视图或月视图
    viewMode: 'month',
    // 当前月视图数据
    currentMonth: [],
    // 当前周视图数据
    currentWeek: [],
    // 当前所在年份
    currentYear: 0,
    // 当前所在月份 (0-11)
    currentMonthIndex: 0,
    // 用于标题显示的年月
    monthTitle: '',
    // 日历每周头部展示
    weekDays: ['日', '一', '二', '三', '四', '五', '六'],
    // 动画数据
    animationData: null,
    // 显示状态，用于控制真实的DOM显示/隐藏
    displayState: false,
    // 范围选择状态
    rangeSelectionState: 'none', // 'none', 'start', 'end', 'complete'
    // 临时选择的开始日期
    tempStartDate: '',
    // 临时选择的结束日期
    tempEndDate: '',
    // 存储原始导航栏颜色，用于恢复
    originalNavBarColor: null,
    originalNavBarFrontColor: null
  },

  /**
   * 组件生命周期
   */
  lifetimes: {
    attached: function() {
      // 初始化动画
      this.initAnimation();
      // 初始化日历数据
      this.initCalendarData();
      
      // 尝试获取当前系统信息，记录当前导航栏颜色
      try {
        const systemInfo = wx.getSystemInfoSync();
        this.data.originalNavBarColor = systemInfo.theme === 'dark' ? '#333333' : '#ffffff';
        this.data.originalNavBarFrontColor = systemInfo.theme === 'dark' ? '#ffffff' : '#000000';
        console.log('系统主题:', systemInfo.theme, '导航栏颜色已记录');
      } catch (e) {
        console.error('获取系统信息失败', e);
        // 设置默认值
        this.data.originalNavBarColor = '#ffffff';
        this.data.originalNavBarFrontColor = '#000000';
      }
    }
  },

  /**
   * 属性监听器
   */
  observers: {
    'visible': function(visible) {
      // 当visible属性变化时，控制弹窗的显示或隐藏
      if (visible) {
        this.show();
      } else {
        this.hide();
      }
    },
    'selectedDate': function(selectedDate) {
      // 当选中日期变化时，更新日历视图
      if (selectedDate && !this.data.rangeMode) {
        this.updateCalendarWithDate(selectedDate);
      }
    },
    'rangeStartDate, rangeEndDate': function(startDate, endDate) {
      if (this.data.rangeMode) {
        this.updateRangeSelection(startDate, endDate);
        
        // 如果有开始日期或结束日期，更新日历视图
        if (startDate) {
          this.updateCalendarWithDate(startDate);
        } else if (endDate) {
          this.updateCalendarWithDate(endDate);
        }
      }
    }
  },

  /**
   * 组件方法列表
   */
  methods: {
    /**
     * 初始化动画
     */
    initAnimation: function() {
      this.animation = wx.createAnimation({
        duration: 300,
        timingFunction: 'ease',
      });
    },

    /**
     * 初始化日历数据
     */
    initCalendarData: function() {
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth();
      
      this.setData({
        currentYear: year,
        currentMonthIndex: month
      });
      
      // 生成月份标题
      this.updateMonthTitle(year, month);
      
      // 生成月视图数据
      this.generateMonthData(year, month);
      
      // 生成周视图数据
      this.generateWeekData(year, month, today.getDate());
    },

    /**
     * 更新月份标题
     */
    updateMonthTitle: function(year, month) {
      this.setData({
        monthTitle: `${year}年${month + 1}月`
      });
    },

    /**
     * 生成月视图数据
     */
    generateMonthData: function(year, month) {
      const today = new Date();
      const todayStr = this.formatDate(today);
      const firstDay = new Date(year, month, 1).getDay(); // 本月第一天是周几
      const lastDate = new Date(year, month + 1, 0).getDate(); // 本月最后一天是几号
      
      const monthData = [];
      
      // 添加上个月的日期
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const prevMonthLastDate = new Date(prevYear, month, 0).getDate();
      
      for (let i = 0; i < firstDay; i++) {
        const day = prevMonthLastDate - firstDay + i + 1;
        const date = `${prevYear}-${(prevMonth + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        monthData.push({
          day,
          date,
          isCurrentMonth: false,
          isToday: date === todayStr,
          isSelected: date === this.data.selectedDate,
          inRange: false,
          isRangeStart: false,
          isRangeEnd: false
        });
      }
      
      // 添加本月的日期
      for (let i = 1; i <= lastDate; i++) {
        const date = `${year}-${(month + 1).toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
        monthData.push({
          day: i,
          date,
          isCurrentMonth: true,
          isToday: date === todayStr,
          isSelected: date === this.data.selectedDate,
          inRange: false,
          isRangeStart: false,
          isRangeEnd: false
        });
      }
      
      // 添加下个月的日期以填满6行
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      const daysNeeded = 42 - monthData.length; // 6行7列，总共42个格子
      
      for (let i = 1; i <= daysNeeded; i++) {
        const date = `${nextYear}-${(nextMonth + 1).toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
        monthData.push({
          day: i,
          date,
          isCurrentMonth: false,
          isToday: date === todayStr,
          isSelected: date === this.data.selectedDate,
          inRange: false,
          isRangeStart: false,
          isRangeEnd: false
        });
      }
      
      // 如果是范围模式，并且已有范围，需要标记范围内的日期
      if (this.data.rangeMode && (this.data.tempStartDate || this.data.rangeStartDate)) {
        const startDate = this.data.tempStartDate || this.data.rangeStartDate;
        const endDate = this.data.tempEndDate || this.data.rangeEndDate;
        
        if (startDate && endDate) {
          this.markDateRange(monthData, startDate, endDate);
        }
      }
      
      this.setData({
        currentMonth: monthData
      });
    },

    /**
     * 生成周视图数据
     */
    generateWeekData: function(year, month, date) {
      const today = new Date();
      const todayStr = this.formatDate(today);
      const currentDate = new Date(year, month, date);
      const currentDay = currentDate.getDay(); // 当前日期是周几
      
      const weekData = [];
      
      // 计算本周的开始日期（周日）
      const startDate = new Date(currentDate);
      startDate.setDate(currentDate.getDate() - currentDay);
      
      // 生成一周的数据
      for (let i = 0; i < 7; i++) {
        const day = new Date(startDate);
        day.setDate(startDate.getDate() + i);
        
        const dateStr = this.formatDate(day);
        weekData.push({
          day: day.getDate(),
          date: dateStr,
          isCurrentMonth: day.getMonth() === month,
          isToday: dateStr === todayStr,
          isSelected: dateStr === this.data.selectedDate,
          inRange: false,
          isRangeStart: false,
          isRangeEnd: false
        });
      }
      
      // 如果是范围模式，并且已有范围，需要标记范围内的日期
      if (this.data.rangeMode && (this.data.tempStartDate || this.data.rangeStartDate)) {
        const startDate = this.data.tempStartDate || this.data.rangeStartDate;
        const endDate = this.data.tempEndDate || this.data.rangeEndDate;
        
        if (startDate && endDate) {
          this.markDateRange(weekData, startDate, endDate);
        }
      }
      
      this.setData({
        currentWeek: weekData
      });
    },

    /**
     * 日期格式化
     */
    formatDate: function(date) {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    },

    /**
     * 根据给定日期更新日历视图
     */
    updateCalendarWithDate: function(dateStr) {
      if (!dateStr) return;
      
      const date = new Date(dateStr);
      const year = date.getFullYear();
      const month = date.getMonth();
      
      // 只有当年份或月份变化时才重新生成视图
      if (year !== this.data.currentYear || month !== this.data.currentMonthIndex) {
        this.setData({
          currentYear: year,
          currentMonthIndex: month
        });
        
        this.updateMonthTitle(year, month);
        this.generateMonthData(year, month);
      } else {
        // 仅更新选中状态
        const currentMonth = this.data.currentMonth.map(item => ({
          ...item,
          isSelected: !this.data.rangeMode && item.date === dateStr
        }));
        
        this.setData({ currentMonth });
      }
      
      // 始终更新周视图，因为可能需要根据选择的日期显示不同的周
      this.generateWeekData(year, month, date.getDate());
      
      // 如果是范围模式，并且已有范围，需要更新日期范围标记
      if (this.data.rangeMode) {
        const startDate = this.data.tempStartDate || this.data.rangeStartDate;
        const endDate = this.data.tempEndDate || this.data.rangeEndDate;
        
        if (startDate && endDate) {
          this.updateCalendarWithDateRange(startDate, endDate);
        }
      }
    },
    
    /**
     * 标记日期范围
     */
    markDateRange: function(dateArray, startDateStr, endDateStr) {
      if (!startDateStr || !endDateStr) return dateArray;
      
      const startDate = new Date(startDateStr);
      const endDate = new Date(endDateStr);
      
      // 确保开始日期不晚于结束日期
      if (startDate > endDate) return dateArray;
      
      return dateArray.map(item => {
        const itemDate = new Date(item.date);
        
        // 标记范围内的日期
        if (itemDate >= startDate && itemDate <= endDate) {
          item.inRange = true;
          
          // 标记开始和结束日期
          if (item.date === startDateStr) {
            item.isRangeStart = true;
          }
          if (item.date === endDateStr) {
            item.isRangeEnd = true;
          }
        }
        
        return item;
      });
    },

    /**
     * 更新日历视图中的日期范围显示
     */
    updateCalendarWithDateRange: function(startDateStr, endDateStr) {
      if (!startDateStr || !endDateStr) return;
      
      const startDate = new Date(startDateStr);
      const endDate = new Date(endDateStr);
      
      // 确保开始日期不晚于结束日期
      if (startDate > endDate) return;
      
      // 标记月视图中的范围选择
      const currentMonth = this.data.currentMonth.map(item => {
        const itemDate = new Date(item.date);
        
        // 标记范围内的日期
        if (itemDate >= startDate && itemDate <= endDate) {
          item.inRange = true;
          
          // 标记开始和结束日期
          if (item.date === startDateStr) {
            item.isRangeStart = true;
          } else {
            item.isRangeStart = false;
          }
          
          if (item.date === endDateStr) {
            item.isRangeEnd = true;
          } else {
            item.isRangeEnd = false;
          }
        } else {
          item.inRange = false;
          item.isRangeStart = false;
          item.isRangeEnd = false;
        }
        
        return item;
      });
      
      // 标记周视图中的范围选择
      const currentWeek = this.data.currentWeek.map(item => {
        const itemDate = new Date(item.date);
        
        // 标记范围内的日期
        if (itemDate >= startDate && itemDate <= endDate) {
          item.inRange = true;
          
          // 标记开始和结束日期
          if (item.date === startDateStr) {
            item.isRangeStart = true;
          } else {
            item.isRangeStart = false;
          }
          
          if (item.date === endDateStr) {
            item.isRangeEnd = true;
          } else {
            item.isRangeEnd = false;
          }
        } else {
          item.inRange = false;
          item.isRangeStart = false;
          item.isRangeEnd = false;
        }
        
        return item;
      });
      
      this.setData({
        currentMonth,
        currentWeek
      });
      
      console.log('更新日期范围显示:', startDateStr, '至', endDateStr);
    },
    
    /**
     * 更新范围选择状态
     */
    updateRangeSelection: function(startDate, endDate) {
      if (!startDate && !endDate) {
        this.setData({
          rangeSelectionState: 'none',
          tempStartDate: '',
          tempEndDate: ''
        });
        return;
      }
      
      if (startDate && !endDate) {
        this.setData({
          rangeSelectionState: 'start',
          tempStartDate: startDate,
          tempEndDate: ''
        });
        console.log('设置开始日期:', startDate);
      } else if (startDate && endDate) {
        this.setData({
          rangeSelectionState: 'complete',
          tempStartDate: startDate,
          tempEndDate: endDate
        });
        
        // 更新日历视图中的日期范围显示
        this.updateCalendarWithDateRange(startDate, endDate);
        console.log('设置日期范围:', startDate, '至', endDate);
      }
    },

    /**
     * 选择日期
     */
    selectDate: function(e) {
      const date = e.currentTarget.dataset.date;
      
      // 检查是否在允许的日期范围内
      if (!this.isDateInRange(date)) {
        wx.showToast({
          title: '所选日期超出范围',
          icon: 'none'
        });
        return;
      }
      
      if (this.data.rangeMode) {
        // 范围选择模式
        this.handleRangeSelection(date);
      } else {
        // 单日期选择模式（原有逻辑）
        this.updateSelectedDate(date);
        
        // 触发选择事件
        this.triggerEvent('select', { date });
        
        // 关闭弹窗
        this.triggerEvent('close');
      }
    },
    
    /**
     * 处理范围选择
     */
    handleRangeSelection: function(date) {
      const state = this.data.rangeSelectionState;
      
      if (state === 'none' || state === 'complete') {
        // 开始新的范围选择
        this.setData({
          rangeSelectionState: 'start',
          tempStartDate: date,
          tempEndDate: ''
        });
        
        // 触发开始日期选择事件
        this.triggerEvent('rangeSelectStart', { startDate: date });
        
        console.log('开始日期选择:', date);
        
        // 更新单个日期的选中状态
        this.updateSelectedDate(date);
      } else if (state === 'start') {
        // 已经选择了开始日期，现在选择结束日期
        const startDate = this.data.tempStartDate;
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(date);
        
        // 确保结束日期不早于开始日期
        if (endDateObj < startDateObj) {
          // 如果选择的日期早于开始日期，交换开始日期和结束日期
          this.setData({
            rangeSelectionState: 'complete',
            tempStartDate: date,
            tempEndDate: startDate
          });
          
          // 更新日历视图
          this.updateCalendarWithDateRange(date, startDate);
          
          // 触发范围选择完成事件
          this.triggerEvent('rangeSelect', { 
            startDate: date, 
            endDate: startDate 
          });
          
          console.log('范围选择完成(交换):', date, startDate);
        } else {
          // 正常情况，结束日期晚于开始日期
          this.setData({
            rangeSelectionState: 'complete',
            tempEndDate: date
          });
          
          // 更新日历视图
          this.updateCalendarWithDateRange(startDate, date);
          
          // 触发范围选择完成事件
          this.triggerEvent('rangeSelect', { 
            startDate: startDate, 
            endDate: date 
          });
          
          console.log('范围选择完成:', startDate, date);
        }
        
        // 不要立即关闭弹窗，让用户查看选择的日期范围
        // 用户需要点击确定按钮来确认选择
      }
    },

    /**
     * 检查日期是否在允许的范围内
     */
    isDateInRange: function(dateStr) {
      if (!dateStr) return false;
      
      const date = new Date(dateStr);
      const minDateObj = this.data.minDate ? new Date(this.data.minDate) : null;
      const maxDateObj = this.data.maxDate ? new Date(this.data.maxDate) : null;
      
      if (minDateObj && date < minDateObj) return false;
      if (maxDateObj && date > maxDateObj) return false;
      
      return true;
    },

    /**
     * 更新选中的日期
     */
    updateSelectedDate: function(dateStr) {
      // 更新月视图选中状态
      const currentMonth = this.data.currentMonth.map(item => ({
        ...item,
        isSelected: item.date === dateStr
      }));
      
      // 更新周视图选中状态
      const currentWeek = this.data.currentWeek.map(item => ({
        ...item,
        isSelected: item.date === dateStr
      }));
      
      this.setData({
        selectedDate: dateStr,
        currentMonth,
        currentWeek
      });
    },

    /**
     * 上一个月
     */
    prevMonth: function() {
      let { currentYear, currentMonthIndex } = this.data;
      
      if (currentMonthIndex === 0) {
        currentMonthIndex = 11;
        currentYear -= 1;
      } else {
        currentMonthIndex -= 1;
      }
      
      this.setData({
        currentYear,
        currentMonthIndex
      });
      
      this.updateMonthTitle(currentYear, currentMonthIndex);
      this.generateMonthData(currentYear, currentMonthIndex);
      this.generateWeekData(currentYear, currentMonthIndex, 1); // 默认显示本月第一天所在的周
    },

    /**
     * 下一个月
     */
    nextMonth: function() {
      let { currentYear, currentMonthIndex } = this.data;
      
      if (currentMonthIndex === 11) {
        currentMonthIndex = 0;
        currentYear += 1;
      } else {
        currentMonthIndex += 1;
      }
      
      this.setData({
        currentYear,
        currentMonthIndex
      });
      
      this.updateMonthTitle(currentYear, currentMonthIndex);
      this.generateMonthData(currentYear, currentMonthIndex);
      this.generateWeekData(currentYear, currentMonthIndex, 1); // 默认显示本月第一天所在的周
    },

    /**
     * 切换视图模式
     */
    toggleViewMode: function() {
      const newMode = this.data.viewMode === 'month' ? 'week' : 'month';
      this.setData({
        viewMode: newMode
      });
    },

    /**
     * 显示弹窗
     */
    show: function() {
      console.log('显示日历弹窗');
      
      // 确保使用亮色主题样式，防止遮罩层导致系统误判为暗色主题
      wx.setNavigationBarColor({
        frontColor: '#000000',
        backgroundColor: '#ffffff',
        animation: {
          duration: 200,
          timingFunc: 'easeIn'
        },
        success: () => {
          console.log('成功设置导航栏为亮色主题');
        },
        fail: (error) => {
          console.error('设置导航栏颜色失败', error);
        }
      });
      
      // 先设置显示状态
      this.setData({
        displayState: true
      });
      
      // 延迟执行动画，确保DOM已经渲染
      setTimeout(() => {
        this.animation.opacity(1).translateY(0).step();
        this.setData({
          animationData: this.animation.export()
        });
      }, 50);
    },

    /**
     * 隐藏弹窗
     */
    hide: function() {
      console.log('隐藏日历弹窗');
      
      this.animation.opacity(0).translateY('100%').step();
      this.setData({
        animationData: this.animation.export()
      });
      
      // 还原原始导航栏颜色
      wx.setNavigationBarColor({
        frontColor: this.data.originalNavBarFrontColor || '#000000',
        backgroundColor: this.data.originalNavBarColor || '#ffffff',
        animation: {
          duration: 200,
          timingFunc: 'easeOut'
        },
        success: () => {
          console.log('成功恢复原始导航栏颜色');
        },
        fail: (error) => {
          console.error('恢复导航栏颜色失败', error);
        }
      });
      
      // 动画结束后设置真实的隐藏状态
      setTimeout(() => {
        this.setData({
          displayState: false
        });
      }, 300);
    },

    /**
     * 点击遮罩层关闭弹窗
     */
    onMaskTap: function() {
      this.triggerEvent('close');
    },

    /**
     * 阻止事件冒泡
     */
    onContentTap: function() {
      return;
    },

    /**
     * 选择今天
     */
    selectToday: function() {
      const today = new Date();
      const dateStr = this.formatDate(today);
      
      if (this.isDateInRange(dateStr)) {
        if (this.data.rangeMode) {
          // 范围选择模式下，设置今天作为开始日期
          this.setData({
            rangeSelectionState: 'start',
            tempStartDate: dateStr,
            tempEndDate: ''
          });
          // 触发开始日期选择事件
          this.triggerEvent('rangeSelectStart', { startDate: dateStr });
          console.log('设置今天为开始日期:', dateStr);
        } else {
          // 单日期选择模式
          this.updateCalendarWithDate(dateStr);
          this.updateSelectedDate(dateStr);
          this.triggerEvent('select', { date: dateStr });
          this.triggerEvent('close');
        }
      } else {
        wx.showToast({
          title: '今天不在允许的日期范围内',
          icon: 'none'
        });
      }
    },
    
    /**
     * 确认选择
     */
    confirmSelection: function() {
      if (this.data.rangeMode) {
        if (this.data.rangeSelectionState === 'complete') {
          // 确认范围选择
          this.triggerEvent('rangeConfirm', {
            startDate: this.data.tempStartDate,
            endDate: this.data.tempEndDate
          });
          
          // 关闭弹窗
          this.triggerEvent('close');
        } else if (this.data.rangeSelectionState === 'start') {
          // 只选择了开始日期
          wx.showToast({
            title: '请选择结束日期',
            icon: 'none'
          });
        } else {
          // 未选择任何日期
          wx.showToast({
            title: '请选择日期范围',
            icon: 'none'
          });
        }
      } else {
        // 单日期模式
        if (this.data.selectedDate) {
          this.triggerEvent('select', { date: this.data.selectedDate });
          this.triggerEvent('close');
        } else {
          wx.showToast({
            title: '请选择日期',
            icon: 'none'
          });
        }
      }
    }
  }
}) 