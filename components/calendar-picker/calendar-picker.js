Component({
  /**
   * 使用样式隔离
   */
  options: {
    styleIsolation: 'isolated'
  },

  /**
   * 组件的属性列表
   */
  properties: {
    // 显示控制
    show: {
      type: Boolean,
      value: false,
      observer: function(newVal) {
        if (newVal) {
          this._initCalendar();
          this._showAnimation();
        } else {
          this._hideAnimation();
        }
      }
    },
    
    // 模式选择: 'single' - 单日期, 'range' - 日期范围
    mode: {
      type: String,
      value: 'single',
      observer: function(newVal) {
        // 模式变更时重新载入适合的快捷选项
        this._setQuickOptions();
      }
    },
    
    // 单日期模式的日期值
    value: {
      type: String,
      value: ''
    },
    
    // 范围模式的开始日期
    startDate: {
      type: String,
      value: ''
    },
    
    // 范围模式的结束日期
    endDate: {
      type: String,
      value: ''
    },
    
    // 单日期模式的时间
    time: {
      type: String,
      value: ''
    },
    
    // 范围模式的开始时间
    startTime: {
      type: String,
      value: ''
    },
    
    // 范围模式的结束时间
    endTime: {
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
    
    // 主题色
    themeColor: {
      type: String,
      value: ''
    },
    
    // 功能开关
    enableTimeSelection: {
      type: Boolean,
      value: true
    },
    
    enableModeSwitch: {
      type: Boolean,
      value: true
    },
    
    showQuickOptions: {
      type: Boolean,
      value: true
    },
    
    // 是否启用滑动选择
    enableSlideSelect: {
      type: Boolean,
      value: true
    },
    
    // 单日期模式快捷选项
    singleQuickOptions: {
      type: Array,
      value: [
        { label: '今天', value: 'today' },
        { label: '明天', value: 'tomorrow' },
        { label: '后天', value: 'afterTomorrow' }
      ]
    },
    
    // 范围模式快捷选项
    rangeQuickOptions: {
      type: Array,
      value: [
        { label: '今天', value: 'today' },
        { label: '本周', value: 'thisWeek' },
        { label: '本月', value: 'thisMonth' },
        { label: '下个月', value: 'nextMonth' }
      ]
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    currentYear: 0,          // 当前显示的年份
    currentMonth: 0,         // 当前显示的月份
    days: [],                // 当前月的日期数据
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],  // 星期标题
    selectedDate: '',        // 单日期模式选中的日期
    selectedTime: '',        // 单日期模式选中的时间
    selectedStartDate: '',   // 范围模式选中的开始日期
    selectedEndDate: '',     // 范围模式选中的结束日期
    selectedStartTime: '',   // 范围模式选中的开始时间
    selectedEndTime: '',     // 范围模式选中的结束时间
    selectedDateDisplay: '', // 显示用的格式化日期
    selectedStartDisplay: '', // 显示用的格式化开始日期
    selectedEndDisplay: '',   // 显示用的格式化结束日期
    animation: null,         // 动画实例
    currentQuickOptions: [], // 当前模式下的快捷选项
    selectedQuickOption: '', // 当前选中的快捷选项
    themeColorStyle: '',     // 主题色样式
    
    // 滑动选择相关
    touchStartDate: '',      // 滑动开始的日期
    isTouching: false,       // 是否正在滑动
  },

  /**
   * 组件生命周期
   */
  lifetimes: {
    attached: function() {
      console.log('[calendar-picker] 组件创建');
      
      // 创建动画实例
      this.animation = wx.createAnimation({
        duration: 300,
        timingFunction: 'ease'
      });
      
      // 设置当前模式下的快捷选项
      this._setQuickOptions();
      
      // 如果有外部传入的主题色，应用到组件样式
      if (this.data.themeColor) {
        this._applyThemeColor();
      }
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 初始化日历数据
     */
    _initCalendar: function() {
      console.log('[calendar-picker] 初始化日历');
      
      const today = new Date();
      let year = today.getFullYear();
      let month = today.getMonth() + 1;
      
      // 如果有选中日期，则显示选中日期所在的月份
      if (this.data.mode === 'single' && this.data.value) {
        const dateParts = this.data.value.split('-');
        year = parseInt(dateParts[0]);
        month = parseInt(dateParts[1]);
      } else if (this.data.mode === 'range' && this.data.startDate) {
        const dateParts = this.data.startDate.split('-');
        year = parseInt(dateParts[0]);
        month = parseInt(dateParts[1]);
      }
      
      // 初始化选中状态
      this.setData({
        selectedDate: this.data.value,
        selectedTime: this.data.time,
        selectedStartDate: this.data.startDate,
        selectedEndDate: this.data.endDate,
        selectedStartTime: this.data.startTime,
        selectedEndTime: this.data.endTime,
        selectedDateDisplay: this._formatDisplayDate(this.data.value),
        selectedStartDisplay: this._formatDisplayDate(this.data.startDate),
        selectedEndDisplay: this._formatDisplayDate(this.data.endDate)
      });
      
      // 生成日历数据
      this._generateCalendar(year, month);
    },
    
    /**
     * 生成日历数据
     */
    _generateCalendar: function(year, month) {
      console.log('[calendar-picker] 生成日历数据:', year, month);
      
      // 获取当月第一天是星期几
      const firstDay = new Date(year, month - 1, 1).getDay();
      
      // 获取当月天数
      const daysInMonth = new Date(year, month, 0).getDate();
      
      // 获取上个月的天数
      const daysInPrevMonth = new Date(year, month - 1, 0).getDate();
      
      // 获取今天的日期
      const today = new Date();
      const todayYear = today.getFullYear();
      const todayMonth = today.getMonth() + 1;
      const todayDate = today.getDate();
      const todayStr = `${todayYear}-${this._padZero(todayMonth)}-${this._padZero(todayDate)}`;
      
      // 计算需要显示的上个月的天数
      const prevMonthDays = firstDay;
      
      // 准备日历数据
      const days = [];
      
      // 添加上个月的日期
      const prevMonthYear = month === 1 ? year - 1 : year;
      const prevMonth = month === 1 ? 12 : month - 1;
      
      for (let i = 0; i < prevMonthDays; i++) {
        const day = daysInPrevMonth - prevMonthDays + i + 1;
        const dateStr = `${prevMonthYear}-${this._padZero(prevMonth)}-${this._padZero(day)}`;
        days.push({
          day: day,
          fullDate: dateStr,
          isCurrentMonth: false,
          isToday: dateStr === todayStr,
          isSelected: this._isDateSelected(dateStr),
          isInRange: this._isDateInRange(dateStr),
          isStart: dateStr === this.data.selectedStartDate,
          isEnd: dateStr === this.data.selectedEndDate,
          isDisabled: this._isDateDisabled(dateStr),
          hasMarker: false
        });
      }
      
      // 添加当月的日期
      for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${this._padZero(month)}-${this._padZero(i)}`;
        days.push({
          day: i,
          fullDate: dateStr,
          isCurrentMonth: true,
          isToday: dateStr === todayStr,
          isSelected: this._isDateSelected(dateStr),
          isInRange: this._isDateInRange(dateStr),
          isStart: dateStr === this.data.selectedStartDate,
          isEnd: dateStr === this.data.selectedEndDate,
          isDisabled: this._isDateDisabled(dateStr),
          hasMarker: false
        });
      }
      
      // 添加下个月的日期
      const nextMonthDays = 42 - days.length; // 保证总是显示6周
      const nextMonthYear = month === 12 ? year + 1 : year;
      const nextMonth = month === 12 ? 1 : month + 1;
      
      for (let i = 1; i <= nextMonthDays; i++) {
        const dateStr = `${nextMonthYear}-${this._padZero(nextMonth)}-${this._padZero(i)}`;
        days.push({
          day: i,
          fullDate: dateStr,
          isCurrentMonth: false,
          isToday: dateStr === todayStr,
          isSelected: this._isDateSelected(dateStr),
          isInRange: this._isDateInRange(dateStr),
          isStart: dateStr === this.data.selectedStartDate,
          isEnd: dateStr === this.data.selectedEndDate,
          isDisabled: this._isDateDisabled(dateStr),
          hasMarker: false
        });
      }
      
      // 更新数据
      this.setData({
        currentYear: year,
        currentMonth: month,
        days: days
      });
    },
    
    /**
     * 日期是否被选中
     */
    _isDateSelected: function(dateStr) {
      if (this.data.mode === 'single') {
        return dateStr === this.data.selectedDate;
      } else {
        return dateStr === this.data.selectedStartDate || dateStr === this.data.selectedEndDate;
      }
    },
    
    /**
     * 日期是否在选中范围内
     */
    _isDateInRange: function(dateStr) {
      if (this.data.mode !== 'range' || !this.data.selectedStartDate || !this.data.selectedEndDate) {
        return false;
      }
      
      return this._compareDates(dateStr, this.data.selectedStartDate) >= 0 && 
             this._compareDates(dateStr, this.data.selectedEndDate) <= 0;
    },
    
    /**
     * 日期是否被禁用
     */
    _isDateDisabled: function(dateStr) {
      if (this.data.minDate && this._compareDates(dateStr, this.data.minDate) < 0) {
        return true;
      }
      
      if (this.data.maxDate && this._compareDates(dateStr, this.data.maxDate) > 0) {
        return true;
      }
      
      return false;
    },
    
    /**
     * 比较两个日期
     * 返回: -1 (date1 < date2), 0 (date1 = date2), 1 (date1 > date2)
     */
    _compareDates: function(date1, date2) {
      if (!date1 || !date2) return 0;
      
      const d1 = new Date(date1);
      const d2 = new Date(date2);
      
      d1.setHours(0, 0, 0, 0);
      d2.setHours(0, 0, 0, 0);
      
      if (d1 < d2) return -1;
      if (d1 > d2) return 1;
      return 0;
    },
    
    /**
     * 数字补零
     */
    _padZero: function(number) {
      return number < 10 ? '0' + number : number;
    },
    
    /**
     * 格式化显示日期
     */
    _formatDisplayDate: function(dateStr) {
      if (!dateStr) return '';
      
      const date = new Date(dateStr);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      
      return `${year}年${month}月${day}日`;
    },
    
    /**
     * 设置当前模式下的快捷选项
     */
    _setQuickOptions: function() {
      this.setData({
        currentQuickOptions: this.data.mode === 'single' ? 
                             this.data.singleQuickOptions : 
                             this.data.rangeQuickOptions
      });
    },
    
    /**
     * 应用主题色
     */
    _applyThemeColor: function() {
      if (!this.data.themeColor) return;
      
      // 小程序环境下无法直接操作DOM，使用wxss变量不可行
      // 通过动态样式来实现主题色应用
      console.log('[calendar-picker] 应用主题色:', this.data.themeColor);
      
      // 使用内联样式来应用主题色
      this.setData({
        themeColorStyle: `--cal-theme-color: ${this.data.themeColor}; --cal-today-color: ${this.data.themeColor}; --cal-selected-color: ${this.data.themeColor};`
      });
    },
    
    /**
     * 显示动画
     */
    _showAnimation: function() {
      this.animation.translateY(0).step();
      this.setData({
        animation: this.animation.export()
      });
    },
    
    /**
     * 隐藏动画
     */
    _hideAnimation: function() {
      this.animation.translateY('100%').step();
      this.setData({
        animation: this.animation.export()
      });
    },
    
    /**
     * 上个月
     */
    prevMonth: function() {
      console.log('[calendar-picker] 切换到上个月');
      
      let year = this.data.currentYear;
      let month = this.data.currentMonth - 1;
      
      if (month === 0) {
        year--;
        month = 12;
      }
      
      this._generateCalendar(year, month);
      
      // 轻微振动反馈
      wx.vibrateShort({
        type: 'light'
      });
    },
    
    /**
     * 下个月
     */
    nextMonth: function() {
      console.log('[calendar-picker] 切换到下个月');
      
      let year = this.data.currentYear;
      let month = this.data.currentMonth + 1;
      
      if (month === 13) {
        year++;
        month = 1;
      }
      
      this._generateCalendar(year, month);
      
      // 轻微振动反馈
      wx.vibrateShort({
        type: 'light'
      });
    },
    
    /**
     * 跳转到今天
     */
    jumpToToday: function() {
      console.log('[calendar-picker] 回到今天');
      
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth() + 1;
      
      this._generateCalendar(year, month);
      
      // 轻微振动反馈
      wx.vibrateShort({
        type: 'light'
      });
    },
    
    /**
     * 点击选择日期
     */
    onSelectDate: function(e) {
      const dateStr = e.currentTarget.dataset.date;
      
      console.log('[calendar-picker] 选择日期:', dateStr);
      
      // 检查日期是否被禁用
      if (this._isDateDisabled(dateStr)) {
        return;
      }
      
      if (this.data.mode === 'single') {
        // 单日期模式
        this.setData({
          selectedDate: dateStr,
          selectedDateDisplay: this._formatDisplayDate(dateStr),
          selectedQuickOption: ''
        });
        
        // 触发日期变更事件
        this.triggerEvent('change', { date: dateStr });
      } else {
        // 日期范围模式
        if (!this.data.selectedStartDate || 
            (this.data.selectedStartDate && this.data.selectedEndDate) ||
            this._compareDates(dateStr, this.data.selectedStartDate) < 0) {
          // 选择开始日期
          this.setData({
            selectedStartDate: dateStr,
            selectedEndDate: '',
            selectedStartDisplay: this._formatDisplayDate(dateStr),
            selectedEndDisplay: '',
            selectedQuickOption: ''
          });
          
          // 触发开始日期变更事件
          this.triggerEvent('startChange', { date: dateStr });
        } else {
          // 选择结束日期
          this.setData({
            selectedEndDate: dateStr,
            selectedEndDisplay: this._formatDisplayDate(dateStr)
          });
          
          // 触发结束日期变更事件
          this.triggerEvent('endChange', { date: dateStr });
          
          // 触发范围变更事件
          this.triggerEvent('rangeChange', { 
            startDate: this.data.selectedStartDate, 
            endDate: dateStr 
          });
        }
      }
      
      // 更新日历选中状态
      this._updateCalendarSelection();
      
      // 轻微振动反馈
      wx.vibrateShort({
        type: 'light'
      });
    },
    
    /**
     * 更新日历选中状态
     */
    _updateCalendarSelection: function() {
      const days = this.data.days.map(day => {
        return {
          ...day,
          isSelected: this._isDateSelected(day.fullDate),
          isInRange: this._isDateInRange(day.fullDate),
          isStart: day.fullDate === this.data.selectedStartDate,
          isEnd: day.fullDate === this.data.selectedEndDate
        };
      });
      
      this.setData({ days });
    },
    
    /**
     * 点击快捷选项
     */
    onQuickOptionTap: function(e) {
      const value = e.currentTarget.dataset.value;
      
      console.log('[calendar-picker] 选择快捷选项:', value);
      
      // 处理快捷选项
      if (this.data.mode === 'single') {
        const date = this._getQuickOptionDate(value);
        if (date) {
          this.setData({
            selectedDate: date,
            selectedDateDisplay: this._formatDisplayDate(date),
            selectedQuickOption: value
          });
          
          // 触发日期变更事件
          this.triggerEvent('change', { date });
          
          // 触发快捷选项事件
          this.triggerEvent('quickChange', { option: value, date });
        }
      } else {
        const { startDate, endDate } = this._getQuickOptionRange(value);
        if (startDate && endDate) {
          this.setData({
            selectedStartDate: startDate,
            selectedEndDate: endDate,
            selectedStartDisplay: this._formatDisplayDate(startDate),
            selectedEndDisplay: this._formatDisplayDate(endDate),
            selectedQuickOption: value
          });
          
          // 触发范围变更事件
          this.triggerEvent('rangeChange', { startDate, endDate });
          
          // 触发快捷选项事件
          this.triggerEvent('quickChange', { option: value, startDate, endDate });
        }
      }
      
      // 更新日历选中状态
      this._updateCalendarSelection();
      
      // 跳转到选中日期所在月份
      if (this.data.mode === 'single' && this.data.selectedDate) {
        const parts = this.data.selectedDate.split('-');
        this._generateCalendar(parseInt(parts[0]), parseInt(parts[1]));
      } else if (this.data.mode === 'range' && this.data.selectedStartDate) {
        const parts = this.data.selectedStartDate.split('-');
        this._generateCalendar(parseInt(parts[0]), parseInt(parts[1]));
      }
      
      // 轻微振动反馈
      wx.vibrateShort({
        type: 'light'
      });
    },
    
    /**
     * 获取快捷选项对应的日期
     */
    _getQuickOptionDate: function(option) {
      const now = new Date();
      
      switch(option) {
        case 'today':
          return this._formatDate(now);
          
        case 'tomorrow':
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          return this._formatDate(tomorrow);
          
        case 'afterTomorrow':
          const afterTomorrow = new Date(now);
          afterTomorrow.setDate(afterTomorrow.getDate() + 2);
          return this._formatDate(afterTomorrow);
          
        default:
          return '';
      }
    },
    
    /**
     * 获取快捷选项对应的日期范围
     */
    _getQuickOptionRange: function(option) {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const date = now.getDate();
      
      switch(option) {
        case 'today':
          return {
            startDate: this._formatDate(now),
            endDate: this._formatDate(now)
          };
          
        case 'thisWeek':
          // 本周从周日开始到周六结束
          const weekStart = new Date(now);
          const day = now.getDay();  // 0是周日，6是周六
          weekStart.setDate(date - day);  // 调整到本周周日
          
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);  // 到周六
          
          return {
            startDate: this._formatDate(weekStart),
            endDate: this._formatDate(weekEnd)
          };
          
        case 'thisMonth':
          // 本月
          const monthStart = new Date(year, month, 1);
          const monthEnd = new Date(year, month + 1, 0);
          
          return {
            startDate: this._formatDate(monthStart),
            endDate: this._formatDate(monthEnd)
          };
          
        case 'nextMonth':
          // 下个月
          const nextMonthStart = new Date(year, month + 1, 1);
          const nextMonthEnd = new Date(year, month + 2, 0);
          
          return {
            startDate: this._formatDate(nextMonthStart),
            endDate: this._formatDate(nextMonthEnd)
          };
          
        default:
          return { startDate: '', endDate: '' };
      }
    },
    
    /**
     * 格式化日期为YYYY-MM-DD
     */
    _formatDate: function(date) {
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      
      return `${year}-${this._padZero(month)}-${this._padZero(day)}`;
    },
    
    /**
     * 时间选择变更 (单日期模式)
     */
    onTimeChange: function(e) {
      const time = e.detail.value;
      
      console.log('[calendar-picker] 时间变更:', time);
      
      this.setData({
        selectedTime: time
      });
      
      // 触发时间变更事件
      this.triggerEvent('timeChange', { time });
    },
    
    /**
     * 开始时间变更 (范围模式)
     */
    onStartTimeChange: function(e) {
      const time = e.detail.value;
      
      console.log('[calendar-picker] 开始时间变更:', time);
      
      this.setData({
        selectedStartTime: time
      });
      
      // 触发开始时间变更事件
      this.triggerEvent('startTimeChange', { time });
    },
    
    /**
     * 结束时间变更 (范围模式)
     */
    onEndTimeChange: function(e) {
      const time = e.detail.value;
      
      console.log('[calendar-picker] 结束时间变更:', time);
      
      this.setData({
        selectedEndTime: time
      });
      
      // 触发结束时间变更事件
      this.triggerEvent('endTimeChange', { time });
    },
    
    /**
     * 切换模式 (单日期/日期范围)
     */
    switchMode: function(e) {
      const mode = e.currentTarget.dataset.mode;
      
      console.log('[calendar-picker] 切换模式:', mode);
      
      this.setData({
        mode,
        selectedQuickOption: ''
      });
      
      // 设置当前模式下的快捷选项
      this._setQuickOptions();
      
      // 触发模式变更事件
      this.triggerEvent('modeChange', { mode });
      
      // 轻微振动反馈
      wx.vibrateShort({
        type: 'light'
      });
    },
    
    /**
     * 触摸开始
     */
    onTouchStart: async function(e) {
      if (!this.data.enableSlideSelect || this.data.mode !== 'range') {
        return;
      }
      
      // 获取触摸位置对应的日期单元格
      const touch = e.touches[0];
      const dateStr = await this._getTouchDate(touch);
      
      if (dateStr && !this._isDateDisabled(dateStr)) {
        console.log('[calendar-picker] 滑动选择开始:', dateStr);
        
        this.setData({
          touchStartDate: dateStr,
          isTouching: true,
          selectedStartDate: dateStr,
          selectedEndDate: '',
          selectedStartDisplay: this._formatDisplayDate(dateStr),
          selectedEndDisplay: '',
        });
        
        // 更新日历选中状态
        this._updateCalendarSelection();
        
        // 轻微振动反馈
        wx.vibrateShort({
          type: 'light'
        });
      }
    },
    
    /**
     * 触摸移动
     */
    onTouchMove: async function(e) {
      if (!this.data.enableSlideSelect || !this.data.isTouching || this.data.mode !== 'range') {
        return;
      }
      
      // 获取触摸位置对应的日期单元格
      const touch = e.touches[0];
      const dateStr = await this._getTouchDate(touch);
      
      if (dateStr) {
        // 根据滑动方向确定开始和结束日期
        if (this._compareDates(dateStr, this.data.touchStartDate) >= 0) {
          // 向后滑动
          this.setData({
            selectedStartDate: this.data.touchStartDate,
            selectedEndDate: dateStr,
            selectedEndDisplay: this._formatDisplayDate(dateStr)
          });
        } else {
          // 向前滑动
          this.setData({
            selectedStartDate: dateStr,
            selectedEndDate: this.data.touchStartDate,
            selectedStartDisplay: this._formatDisplayDate(dateStr)
          });
        }
        
        // 更新日历选中状态
        this._updateCalendarSelection();
      }
    },
    
    /**
     * 触摸结束
     */
    onTouchEnd: async function(e) {
      if (!this.data.enableSlideSelect || !this.data.isTouching || this.data.mode !== 'range') {
        return;
      }
      
      console.log('[calendar-picker] 滑动选择结束:', this.data.selectedStartDate, this.data.selectedEndDate);
      
      this.setData({
        isTouching: false,
        selectedQuickOption: ''
      });
      
      // 触发范围变更事件
      if (this.data.selectedStartDate && this.data.selectedEndDate) {
        this.triggerEvent('rangeChange', { 
          startDate: this.data.selectedStartDate, 
          endDate: this.data.selectedEndDate 
        });
        
        // 中等振动反馈
        wx.vibrateShort({
          type: 'medium'
        });
      }
    },
    
    /**
     * 获取触摸位置对应的日期
     */
    _getTouchDate: function(touch) {
      // 获取日历网格的位置和尺寸信息
      const query = this.createSelectorQuery().in(this);
      
      return new Promise((resolve) => {
        query.select('.cal-days-grid').boundingClientRect(rect => {
          if (!rect) {
            console.error('[calendar-picker] 无法获取日历网格的位置信息');
            resolve('');
            return;
          }
          
          // 计算触摸点在网格中的位置
          const x = touch.clientX - rect.left;
          const y = touch.clientY - rect.top;
          
          // 计算对应的行列
          const cellWidth = rect.width / 7;
          const cellHeight = rect.height / 6;
          
          const col = Math.floor(x / cellWidth);
          const row = Math.floor(y / cellHeight);
          
          // 计算对应的日期索引
          const index = row * 7 + col;
          
          // 获取对应的日期
          if (index >= 0 && index < this.data.days.length) {
            resolve(this.data.days[index].fullDate);
          } else {
            resolve('');
          }
        }).exec();
      });
    },
    
    /**
     * 确认选择
     */
    onConfirm: function() {
      console.log('[calendar-picker] 确认选择');
      
      // 根据模式返回不同的数据
      if (this.data.mode === 'single') {
        this.triggerEvent('confirm', {
          date: this.data.selectedDate,
          time: this.data.selectedTime
        });
      } else {
        this.triggerEvent('confirm', {
          startDate: this.data.selectedStartDate,
          endDate: this.data.selectedEndDate,
          startTime: this.data.selectedStartTime,
          endTime: this.data.selectedEndTime
        });
      }
      
      // 关闭日历
      this.triggerEvent('close');
      
      // 中等振动反馈
      wx.vibrateShort({
        type: 'medium'
      });
    },
    
    /**
     * 取消选择
     */
    onCancel: function() {
      console.log('[calendar-picker] 取消选择');
      
      // 触发取消事件
      this.triggerEvent('cancel');
      
      // 关闭日历
      this.triggerEvent('close');
      
      // 轻微振动反馈
      wx.vibrateShort({
        type: 'light'
      });
    },
    
    /**
     * 点击遮罩关闭
     */
    onClickMask: function() {
      console.log('[calendar-picker] 点击遮罩关闭');
      
      // 关闭日历
      this.triggerEvent('close');
    },
    
    /**
     * 阻止冒泡
     */
    preventDefault: function(e) {
      // 阻止事件冒泡
      return;
    }
  }
}) 