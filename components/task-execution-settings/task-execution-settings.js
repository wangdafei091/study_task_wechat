Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 任务类型：study, habit, interest
    taskType: {
      type: String,
      value: ''
    },
    // 重复模式：once, repeat
    repeatMode: {
      type: String,
      value: 'once'
    },
    // 任务数据
    task: {
      type: Object,
      value: {
        date: '',
        startTime: '',
        endTime: '',
        repeat: {
          type: 'none',
          days: [],
          startDate: '',
          endDate: ''
        }
      }
    },
    // 最小可选日期
    minDate: {
      type: String,
      value: ''
    },
    // 显示区域标题
    showSectionLabel: {
      type: Boolean,
      value: true
    },
    // 日期快速选项
    dateQuickOptions: {
      type: Array,
      value: []
    },
    // 日期范围快速选项
    dateRangeQuickOptions: {
      type: Array,
      value: []
    },
    // 是否启用输入验证
    validateInput: {
      type: Boolean,
      value: true
    },
    // 是否支持快速选择时间
    supportQuickTimeOptions: {
      type: Boolean,
      value: true
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    timeOptions: [
      { label: '上午', value: '09:00', period: 'morning' },
      { label: '下午', value: '15:00', period: 'afternoon' },
      { label: '晚上', value: '19:00', period: 'evening' }
    ],
    selectedTimeOption: '',
    selectedDateOption: '',
    selectedRangeDateOption: '',
    
    // 日历选择器相关数据
    showCalendar: false,
    calendarMode: 'single',  // 'single' 或 'range'
    enableTimeSelection: true,
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 切换执行模式
     */
    onSwitchMode: function(e) {
      const mode = e.currentTarget.dataset.mode;
      console.log('[task-execution-settings] 切换执行模式:', mode);
      
      // 提供用户反馈
      wx.vibrateShort({
        type: 'light'
      });
      
      // 在切换到重复模式时确保重复任务设置正确
      if (mode === 'repeat') {
        this.ensureRepeatTaskSettings();
      }
      
      this.triggerEvent('modeChange', { mode });
    },

    /**
     * 选择执行日期
     */
    onSelectDate: function(e) {
      const date = e.detail.value;
      console.log('[task-execution-settings] 选择执行日期:', date);
      
      // 验证日期
      if (this.properties.validateInput) {
        const now = new Date();
        const selectedDate = new Date(date);
        
        if (selectedDate < now && date !== this.formatDate(now)) {
          console.warn('[task-execution-settings] 选择了过去的日期');
          wx.showToast({
            title: '请选择今天或未来的日期',
            icon: 'none'
          });
          return;
        }
      }
      
      this.triggerEvent('dateChange', { date });
    },

    /**
     * 选择开始日期
     */
    onSelectStartDate: function(e) {
      const date = e.detail.value || e.detail.startDate;
      console.log('[task-execution-settings] 选择开始日期:', date);
      
      // 验证开始日期
      if (this.properties.validateInput) {
        const now = new Date();
        const selectedDate = new Date(date);
        
        if (selectedDate < now && date !== this.formatDate(now)) {
          console.warn('[task-execution-settings] 选择了过去的日期作为开始日期');
          wx.showToast({
            title: '开始日期不能早于今天',
            icon: 'none'
          });
          return;
        }
      }
      
      this.triggerEvent('startDateChange', { date });
    },

    /**
     * 选择结束日期
     */
    onSelectEndDate: function(e) {
      const date = e.detail.value || e.detail.endDate;
      console.log('[task-execution-settings] 选择结束日期:', date);
      
      // 验证结束日期
      if (this.properties.validateInput && date) {
        const startDate = this.properties.task.repeat.startDate;
        
        if (startDate && date < startDate) {
          console.warn('[task-execution-settings] 结束日期早于开始日期');
          wx.showToast({
            title: '结束日期不能早于开始日期',
            icon: 'none'
          });
          return;
        }
      }
      
      this.triggerEvent('endDateChange', { date });
    },

    /**
     * 选择开始时间
     */
    onSelectStartTime: function(e) {
      const time = e.detail.value;
      console.log('[task-execution-settings] 选择开始时间:', time);
      
      this.setData({
        selectedTimeOption: ''
      });
      
      this.triggerEvent('startTimeChange', { time });
      
      // 如果结束时间已设置，自动计算持续时间并通知父组件
      if (this.properties.task.endTime) {
        const duration = this.calculateDuration(time, this.properties.task.endTime);
        if (duration > 0) {
          this.triggerEvent('durationChange', { duration });
        }
      }
    },

    /**
     * 选择结束时间
     */
    onSelectEndTime: function(e) {
      const time = e.detail.value;
      console.log('[task-execution-settings] 选择结束时间:', time);
      
      // 验证结束时间
      if (this.properties.validateInput && this.properties.task.startTime) {
        const duration = this.calculateDuration(this.properties.task.startTime, time);
        
        if (duration <= 0) {
          console.warn('[task-execution-settings] 结束时间早于或等于开始时间');
          wx.showToast({
            title: '结束时间必须晚于开始时间',
            icon: 'none'
          });
          return;
        }
        
        // 通知持续时间变更
        this.triggerEvent('durationChange', { duration });
      }
      
      this.triggerEvent('endTimeChange', { time });
    },

    /**
     * 处理快速日期选择
     */
    onQuickDateOptionChange: function(e) {
      console.log('[task-execution-settings] 快速日期选择:', e.detail);
      this.triggerEvent('quickDateChange', e.detail);
    },

    /**
     * 处理日期范围快速选择
     */
    onRangeDateOptionChange: function(e) {
      console.log('[task-execution-settings] 日期范围快速选择:', e.detail);
      this.triggerEvent('rangeDateChange', e.detail);
    },

    /**
     * 处理重复频率变更
     */
    onFrequencyChange: function(e) {
      console.log('[task-execution-settings] 重复频率变更:', e.detail);
      
      const type = e.detail.type;
      let defaultDays = null;
      
      // 根据类型设置默认天数
      if (type === 'daily') {
        defaultDays = ['0', '1', '2', '3', '4', '5', '6'];
      } else if (type === 'workdays') {
        defaultDays = ['1', '2', '3', '4', '5'];
      } else if (type === 'weekly') {
        const today = new Date().getDay().toString();
        defaultDays = [today];
      } else if (type === 'custom') {
        defaultDays = [];
      }
      
      // 提供用户反馈
      let message = '';
      switch (type) {
        case 'daily':
          message = '任务将每天重复';
          break;
        case 'weekly':
          message = '任务将每周重复';
          break;
        case 'workdays':
          message = '任务将在工作日重复';
          break;
        case 'custom':
          message = '请选择重复的日期';
          break;
      }
      
      if (message) {
        wx.showToast({
          title: message,
          icon: 'none'
        });
      }
      
      // 将更新后的类型和默认日数传递给父组件
      this.triggerEvent('frequencyChange', { 
        type: type,
        days: defaultDays
      });
    },

    /**
     * 处理重复日变更
     */
    onDaysChange: function(e) {
      console.log('[task-execution-settings] 重复日变更:', e.detail);
      
      const days = e.detail.days;
      
      // 提供用户反馈
      if (days && days.length > 0) {
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const selectedDays = days.map(d => weekdays[d]).join('、');
        
        wx.showToast({
          title: `已选择：周${selectedDays}`,
          icon: 'none'
        });
      }
      
      this.triggerEvent('daysChange', e.detail);
    },
    
    /**
     * 快速选择时间
     */
    onQuickTimeSelect: function(e) {
      const period = e.currentTarget.dataset.period;
      const option = this.data.timeOptions.find(item => item.period === period);
      
      if (!option) return;
      
      console.log('[task-execution-settings] 快速选择时间:', period, option.value);
      
      this.setData({
        selectedTimeOption: period
      });
      
      // 计算结束时间（默认加1小时）
      const startTime = option.value;
      const [hours, minutes] = startTime.split(':').map(Number);
      
      // 默认1小时后结束
      let endHours = hours + 1;
      let endMinutes = minutes;
      
      // 处理跨天情况
      if (endHours >= 24) {
        endHours = 23;
        endMinutes = 59;
      }
      
      const endTime = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
      
      // 触发开始和结束时间变更事件
      this.triggerEvent('startTimeChange', { time: startTime });
      this.triggerEvent('endTimeChange', { time: endTime });
      
      // 计算并触发持续时间变更
      const duration = this.calculateDuration(startTime, endTime);
      this.triggerEvent('durationChange', { duration });
      
      // 提供触感反馈
      wx.vibrateShort({ type: 'light' });
    },
    
    /**
     * 快速选择日期（供父组件调用）
     */
    quickSelectDate: function(type) {
      const now = new Date();
      let date = '';
      
      if (type === 'today') {
        date = this.formatDate(now);
      } else if (type === 'tomorrow') {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        date = this.formatDate(tomorrow);
      } else if (type === 'weekend') {
        // 获取本周周六
        const daysToSaturday = 6 - now.getDay();
        const saturday = new Date(now);
        saturday.setDate(saturday.getDate() + (daysToSaturday === 0 ? 7 : daysToSaturday));
        date = this.formatDate(saturday);
      }
      
      if (date) {
        console.log('[task-execution-settings] 快速选择日期:', type, date);
        this.triggerEvent('dateChange', { date });
      }
    },
    
    /**
     * 确保重复任务设置正确
     */
    ensureRepeatTaskSettings: function() {
      console.log('[task-execution-settings] 确保重复任务设置正确');
      
      // 如果当前是重复模式
      if (this.properties.repeatMode === 'repeat') {
        // 检查task.repeat是否存在或格式是否完整
        const task = this.properties.task;
        const hasValidRepeat = task.repeat && 
                               task.repeat.type && 
                               task.repeat.type !== 'none';
        
        console.log('[task-execution-settings] 检查repeat设置 - 是否有效:', hasValidRepeat);
        
        if (!hasValidRepeat) {
          // 根据当前任务类型设置默认重复类型
          const defaultRepeatType = this.properties.taskType === 'study' ? 'weekly' : 'daily';
          let defaultDays = [];
          
          // 根据重复类型设置默认天数
          if (defaultRepeatType === 'daily') {
            // 每天 - 包含所有日期
            defaultDays = ['0', '1', '2', '3', '4', '5', '6'];
          } else if (defaultRepeatType === 'weekly') {
            // 每周 - 默认设置为当前日期对应的星期几
            const today = new Date().getDay().toString();
            defaultDays = [today]; 
          } else if (defaultRepeatType === 'workdays') {
            // 工作日 - 周一至周五
            defaultDays = ['1', '2', '3', '4', '5'];
          }
          
          // 确保有开始日期
          const startDate = task.date || this.properties.minDate;
          
          // 创建默认重复设置
          const repeatSettings = {
            type: defaultRepeatType,
            days: defaultDays,
            startDate: startDate,
            endDate: task.repeat ? (task.repeat.endDate || '') : ''
          };
          
          console.log('[task-execution-settings] 创建默认重复设置:', repeatSettings);
          
          // 通知父组件更新重复设置
          this.triggerEvent('createRepeatSettings', { repeatSettings });
        }
      }
    },
    
    /**
     * 计算任务持续时间（分钟）
     */
    calculateDuration: function(startTime, endTime) {
      if (!startTime || !endTime) return 0;
      
      const [startHours, startMinutes] = startTime.split(':').map(Number);
      const [endHours, endMinutes] = endTime.split(':').map(Number);
      
      const startTotalMinutes = startHours * 60 + startMinutes;
      const endTotalMinutes = endHours * 60 + endMinutes;
      
      return endTotalMinutes - startTotalMinutes;
    },
    
    /**
     * 格式化日期为YYYY-MM-DD
     */
    formatDate: function(date) {
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      
      return `${year}-${month < 10 ? '0' + month : month}-${day < 10 ? '0' + day : day}`;
    },

    /**
     * 显示单日期日历选择器
     */
    showDateCalendar: function() {
      console.log('[task-execution-settings] 显示日期日历选择器');
      
      this.setData({
        showCalendar: true,
        calendarMode: 'single',
        enableTimeSelection: this.properties.taskType === 'study'
      });
      
      // 触感反馈
      wx.vibrateShort({
        type: 'light'
      });
    },

    /**
     * 显示日期范围日历选择器
     */
    showRangeCalendar: function() {
      console.log('[task-execution-settings] 显示日期范围日历选择器');
      
      this.setData({
        showCalendar: true,
        calendarMode: 'range',
        enableTimeSelection: this.properties.taskType === 'study'
      });
      
      // 触感反馈
      wx.vibrateShort({
        type: 'light'
      });
    },

    /**
     * 隐藏日历选择器
     */
    hideCalendar: function() {
      console.log('[task-execution-settings] 隐藏日历选择器');
      
      this.setData({
        showCalendar: false
      });
    },

    /**
     * 日历选择确认
     */
    onCalendarConfirm: function(e) {
      console.log('[task-execution-settings] 日历选择确认:', e.detail);
      
      if (this.data.calendarMode === 'single') {
        // 单日期模式
        const { date, time } = e.detail;
        
        if (date) {
          // 更新日期
          this.triggerEvent('dateChange', { date });
          
          // 如果有时间选择，同时更新时间
          if (time && this.properties.taskType === 'study') {
            this.triggerEvent('startTimeChange', { time });
          }
        }
      } else {
        // 日期范围模式
        const { startDate, endDate, startTime, endTime } = e.detail;
        
        if (startDate) {
          // 更新开始日期
          this.triggerEvent('startDateChange', { date: startDate });
          
          // 更新结束日期（如果有）
          if (endDate) {
            this.triggerEvent('endDateChange', { date: endDate });
          }
          
          // 如果有时间选择，同时更新时间
          if (this.properties.taskType === 'study') {
            if (startTime) {
              this.triggerEvent('startTimeChange', { time: startTime });
            }
            
            if (endTime) {
              this.triggerEvent('endTimeChange', { time: endTime });
            }
          }
        }
      }
      
      // 隐藏日历
      this.hideCalendar();
      
      // 中等振动反馈
      wx.vibrateShort({
        type: 'medium'
      });
    },

    /**
     * 日历选择取消
     */
    onCalendarCancel: function() {
      console.log('[task-execution-settings] 日历选择取消');
      
      // 隐藏日历
      this.hideCalendar();
      
      // 轻微振动反馈
      wx.vibrateShort({
        type: 'light'
      });
    },

    /**
     * 处理日历快捷选项变更
     */
    onCalendarQuickChange: function(e) {
      console.log('[task-execution-settings] 日历快捷选项变更:', e.detail);
      
      // 更新选中的快捷选项
      if (this.data.calendarMode === 'single') {
        this.setData({
          selectedDateOption: e.detail.option
        });
      } else {
        this.setData({
          selectedRangeDateOption: e.detail.option
        });
      }
    },

    /**
     * 快速日期选择 (单日期模式)
     */
    onQuickDateSelect: function(e) {
      const value = e.currentTarget.dataset.value;
      console.log('[task-execution-settings] 快速日期选择:', value);
      
      // 获取对应日期
      const date = this._getQuickOptionDate(value);
      
      if (date) {
        // 设置选中状态
        this.setData({
          selectedDateOption: value
        });
        
        // 更新日期
        this.triggerEvent('dateChange', { date });
      }
      
      // 轻微振动反馈
      wx.vibrateShort({
        type: 'light'
      });
    },

    /**
     * 快速日期范围选择 (范围模式)
     */
    onQuickRangeDateSelect: function(e) {
      const value = e.currentTarget.dataset.value;
      console.log('[task-execution-settings] 快速日期范围选择:', value);
      
      // 获取对应日期范围
      const { startDate, endDate } = this._getQuickOptionRange(value);
      
      if (startDate) {
        // 设置选中状态
        this.setData({
          selectedRangeDateOption: value
        });
        
        // 更新开始日期
        this.triggerEvent('startDateChange', { date: startDate });
        
        // 更新结束日期（如果有）
        if (endDate) {
          this.triggerEvent('endDateChange', { date: endDate });
        }
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
          return this.formatDate(now);
          
        case 'tomorrow':
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          return this.formatDate(tomorrow);
          
        case 'afterTomorrow':
          const afterTomorrow = new Date(now);
          afterTomorrow.setDate(afterTomorrow.getDate() + 2);
          return this.formatDate(afterTomorrow);
          
        default:
          if (this.properties.dateQuickOptions) {
            for (const option of this.properties.dateQuickOptions) {
              if (option.value === option && option.date) {
                return option.date;
              }
            }
          }
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
            startDate: this.formatDate(now),
            endDate: this.formatDate(now)
          };
          
        case 'thisWeek':
          // 本周从周日开始到周六结束
          const weekStart = new Date(now);
          const day = now.getDay();  // 0是周日，6是周六
          weekStart.setDate(date - day);  // 调整到本周周日
          
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);  // 到周六
          
          return {
            startDate: this.formatDate(weekStart),
            endDate: this.formatDate(weekEnd)
          };
          
        case 'thisMonth':
          // 本月
          const monthStart = new Date(year, month, 1);
          const monthEnd = new Date(year, month + 1, 0);
          
          return {
            startDate: this.formatDate(monthStart),
            endDate: this.formatDate(monthEnd)
          };
          
        case 'nextMonth':
          // 下个月
          const nextMonthStart = new Date(year, month + 1, 1);
          const nextMonthEnd = new Date(year, month + 2, 0);
          
          return {
            startDate: this.formatDate(nextMonthStart),
            endDate: this.formatDate(nextMonthEnd)
          };
          
        default:
          if (this.properties.dateRangeQuickOptions) {
            for (const option of this.properties.dateRangeQuickOptions) {
              if (option.value === option && option.startDate && option.endDate) {
                return {
                  startDate: option.startDate,
                  endDate: option.endDate
                };
              }
            }
          }
          return { startDate: '', endDate: '' };
      }
    },
  }
}) 