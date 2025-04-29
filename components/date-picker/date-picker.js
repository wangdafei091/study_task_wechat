Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 是否显示日期选择器
    visible: {
      type: Boolean,
      value: false,
      observer: function(newVal) {
        if (newVal) {
          // 当显示时，重新生成日历数据
          this.generateCalendarDays();
          console.log(`[DatePicker] 显示${this.data.type}日期选择器`);
        }
      }
    },
    // 标题
    title: {
      type: String,
      value: '选择日期'
    },
    // 当前选中日期
    currentDate: {
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
    // 类型：start(开始日期) 或 end(结束日期)
    type: {
      type: String,
      value: 'start'
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    calendarDays: [],
    yearMonth: '',
    yearText: '',
    monthText: ''
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 组件初始化
     */
    attached: function() {
      // 设置初始日期
      if (!this.data.currentDate) {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        this.setData({
          currentDate: `${year}-${month}-${day}`
        });
      }
      
      // 初始化年月显示
      this.initYearMonthDisplay();
      
      console.log(`[DatePicker] 组件初始化，类型: ${this.data.type}, 当前日期: ${this.data.currentDate}`);
    },
    
    /**
     * 初始化年月显示
     */
    initYearMonthDisplay: function() {
      const date = this.data.currentDate ? new Date(this.data.currentDate.replace(/-/g, '/')) : new Date();
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      
      const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
      const yearText = `${year}年`;
      const monthText = `${month}月`;
      
      this.setData({
        yearMonth,
        yearText,
        monthText
      });
      
      console.log(`[DatePicker] 初始化年月显示: ${yearMonth}`);
    },
    
    /**
     * 获取年月数据
     */
    getYearMonthData: function(customYear, customMonth) {
      let year, month;
      if (customYear !== undefined && customMonth !== undefined) {
        // 使用自定义年月
        year = customYear;
        month = customMonth;
      } else {
        // 从已选日期或当前日期获取
        const selectedDate = this.data.currentDate;
        const date = selectedDate ? new Date(selectedDate.replace(/-/g, '/')) : new Date();
        year = date.getFullYear();
        month = date.getMonth();
      }
      return { year, month };
    },
    
    /**
     * 更新年月显示
     */
    updateYearMonthDisplay: function(year, month) {
      // 更新年月文本显示
      const yearMonthStr = `${year}-${(month + 1) < 10 ? '0' + (month + 1) : (month + 1)}`;
      const yearText = `${year}年`;
      const monthText = `${month + 1}月`;
      
      this.setData({
        yearMonth: yearMonthStr,
        yearText: yearText,
        monthText: monthText
      });
    },
    
    /**
     * 生成日历数据
     */
    generateCalendarDays: function(customYear, customMonth) {
      // 确定年月
      const yearMonthData = this.getYearMonthData(customYear, customMonth);
      const { year, month } = yearMonthData;
      
      // 更新界面年月显示
      this.updateYearMonthDisplay(year, month);
      
      // 生成日历数据
      const days = this.generateMonthDays(year, month);
      
      // 更新日历数据
      this.setData({
        calendarDays: days
      });
      
      console.log(`[DatePicker] 生成日历数据，年:${year}, 月:${month+1}`);
    },
    
    /**
     * 生成月份天数数据
     */
    generateMonthDays: function(year, month) {
      // 获取当月的第一天和最后一天
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      
      // 获取当月第一天是星期几(0-6)并调整为1-7，以适应周一开始
      const firstDayOfWeek = firstDay.getDay() || 7;
      
      // 计算上月显示的天数
      const daysFromPrevMonth = firstDayOfWeek - 1;
      
      // 当月的总天数
      const daysInMonth = lastDay.getDate();
      
      // 今天日期信息
      const today = new Date();
      const todayYear = today.getFullYear();
      const todayMonth = today.getMonth();
      const todayDate = today.getDate();
      const todayTimestamp = new Date(todayYear, todayMonth, todayDate).getTime();
      
      let days = [];
      
      // 添加上月的日期
      this.addPrevMonthDays(days, year, month, daysFromPrevMonth, todayYear, todayMonth, todayDate, todayTimestamp);
      
      // 添加当月的日期
      this.addCurrentMonthDays(days, year, month, daysInMonth, todayYear, todayMonth, todayDate, todayTimestamp);
      
      // 添加下月的日期
      this.addNextMonthDays(days, year, month, todayYear, todayMonth, todayDate, todayTimestamp);
      
      return days;
    },
    
    /**
     * 添加上月日期到日历
     */
    addPrevMonthDays: function(days, year, month, daysFromPrevMonth, todayYear, todayMonth, todayDate, todayTimestamp) {
      if (daysFromPrevMonth <= 0) return;
      
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const prevMonthLastDay = new Date(year, month, 0).getDate();
      
      for (let i = prevMonthLastDay - daysFromPrevMonth + 1; i <= prevMonthLastDay; i++) {
        const date = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        // 判断日期是否在过去
        const dateTimestamp = new Date(prevYear, prevMonth, i).getTime();
        
        days.push({
          day: i,
          date,
          currentMonth: false,
          isToday: (prevYear === todayYear && prevMonth === todayMonth && i === todayDate),
          isPast: dateTimestamp < todayTimestamp
        });
      }
    },
    
    /**
     * 添加当月日期到日历
     */
    addCurrentMonthDays: function(days, year, month, daysInMonth, todayYear, todayMonth, todayDate, todayTimestamp) {
      for (let i = 1; i <= daysInMonth; i++) {
        const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        // 判断日期是否在过去
        const dateTimestamp = new Date(year, month, i).getTime();
        
        days.push({
          day: i,
          date,
          currentMonth: true,
          isToday: (year === todayYear && month === todayMonth && i === todayDate),
          isPast: dateTimestamp < todayTimestamp
        });
      }
    },
    
    /**
     * 添加下月日期到日历
     */
    addNextMonthDays: function(days, year, month, todayYear, todayMonth, todayDate, todayTimestamp) {
      // 计算行数并填充下月日期
      const totalDaysSoFar = days.length;
      // 固定使用6行显示所有月份，确保日历高度一致
      const rowsNeeded = 6; 
      const totalCells = rowsNeeded * 7;
      const nextMonthDays = totalCells - totalDaysSoFar;
      
      console.log(`[DatePicker] 当前已有${totalDaysSoFar}天，固定6行需要补充${nextMonthDays}天`);
      
      if (nextMonthDays <= 0) return;
      
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      
      for (let i = 1; i <= nextMonthDays; i++) {
        const date = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        // 判断日期是否在过去
        const dateTimestamp = new Date(nextYear, nextMonth, i).getTime();
        
        days.push({
          day: i,
          date,
          currentMonth: false,
          isToday: (nextYear === todayYear && nextMonth === todayMonth && i === todayDate),
          isPast: dateTimestamp < todayTimestamp
        });
      }
    },
    
    /**
     * 选择日期
     */
    selectDate: function(e) {
      const date = e.currentTarget.dataset.date;
      
      // 检查是否小于最小日期
      if (this.data.minDate && date < this.data.minDate) {
        wx.showToast({
          title: '不能选择早于最小日期的日期',
          icon: 'none',
          duration: 2000
        });
        return;
      }
      
      // 检查是否大于最大日期
      if (this.data.maxDate && date > this.data.maxDate) {
        wx.showToast({
          title: '不能选择晚于最大日期的日期',
          icon: 'none',
          duration: 2000
        });
        return;
      }
      
      this.setData({
        currentDate: date
      });
      
      // 触发日期选择事件
      this.triggerEvent('dateSelected', {
        date: date,
        type: this.data.type
      });
      
      // 自动关闭选择器
      this.triggerEvent('close', {
        type: this.data.type
      });
      
      console.log(`[DatePicker] 选择日期: ${date}, 类型: ${this.data.type}`);
    },
    
    /**
     * 更改月份
     */
    changeMonth: function(e) {
      // 添加详细日志记录
      console.log('[DatePicker] changeMonth被触发，事件完整数据:', e);
      console.log('[DatePicker] 事件目标数据:', e.currentTarget.dataset);
      
      const action = e.currentTarget.dataset.action; // prev 或 next
      
      console.log(`[DatePicker] 月份切换方向: ${action}`);
      
      let yearMonth = this.data.yearMonth;
      let [year, month] = yearMonth.split('-').map(Number);
      
      console.log(`[DatePicker] 当前年月: ${year}年${month}月`);
      
      if (action === 'prev') {
        month--;
        if (month === 0) {
          month = 12;
          year--;
        }
      } else if (action === 'next') {  // 显式检查是否为'next'
        month++;
        if (month === 13) {
          month = 1;
          year++;
        }
      } else {
        console.warn(`[DatePicker] 未知的月份切换方向: ${action}`);
        return; // 如果不是有效的action，则中断执行
      }
      
      console.log(`[DatePicker] 切换后的年月: ${year}年${month}月`);
      
      // 添加按钮反馈 - 适应紧凑型布局的反馈效果
      let activeStyle = 'color: #1A73E8; opacity: 0.7; transform: scale(1.05);';
      
      // 更紧凑的视觉反馈
      this.setData({
        [`btnActiveStyle${action}`]: activeStyle
      });
      
      // 120ms后移除活跃状态 - 紧凑型布局反馈更快
      setTimeout(() => {
        this.setData({
          [`btnActiveStyle${action}`]: ''
        });
      }, 120);
      
      // 重新生成日历数据
      this.generateCalendarDays(year, month - 1);
      
      console.log(`[DatePicker] 切换月份完成: ${year}年${month}月, 方向: ${action}`);
    },
    
    /**
     * 更改年份
     */
    changeYear: function(e) {
      const action = e.currentTarget.dataset.yearAction; // prev 或 next
      
      let yearMonth = this.data.yearMonth;
      let [year, month] = yearMonth.split('-').map(Number);
      
      if (action === 'prev') {
        year--;
      } else {
        year++;
      }
      
      // 显示提示
      wx.showToast({
        title: `切换至${year}年`,
        icon: 'none',
        duration: 1000
      });
      
      // 重新生成日历数据
      this.generateCalendarDays(year, month - 1);
      
      console.log(`[DatePicker] 切换年份: ${year}年`);
    },
    
    /**
     * 年月选择器变更
     */
    onYearMonthChange: function(e) {
      const yearMonth = e.detail.value; // 格式：'2023-05'
      const [year, month] = yearMonth.split('-').map(Number);
      
      // 重新生成日历数据
      this.generateCalendarDays(year, month - 1);
      
      console.log(`[DatePicker] 修改年月: ${year}年${month}月`);
    },
    
    /**
     * 关闭选择器
     */
    onClose: function() {
      this.triggerEvent('close', {
        type: this.data.type
      });
      
      console.log(`[DatePicker] 关闭${this.data.type}日期选择器`);
    },
    
    /**
     * 阻止滑动穿透
     */
    preventTouchMove: function(e) {
      // 阻止事件冒泡和默认行为
      return;
    },
    
    /**
     * 防止点击面板内部关闭面板
     */
    preventClose: function(e) {
      // 阻止事件冒泡
      return;
    }
  },
  
  /**
   * 组件生命周期
   */
  lifetimes: {
    attached: function() {
      this.attached();
    }
  }
})
