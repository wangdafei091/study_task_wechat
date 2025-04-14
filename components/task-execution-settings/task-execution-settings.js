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
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
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
      console.log('切换执行模式:', mode);
      
      this.triggerEvent('modeChange', { mode });
    },

    /**
     * 选择执行日期
     */
    onSelectDate: function(e) {
      console.log('选择执行日期:', e.detail);
      
      this.triggerEvent('dateChange', { date: e.detail.value });
    },

    /**
     * 选择开始日期
     */
    onSelectStartDate: function(e) {
      console.log('选择开始日期:', e.detail);
      
      this.triggerEvent('startDateChange', { date: e.detail.value });
    },

    /**
     * 选择结束日期
     */
    onSelectEndDate: function(e) {
      console.log('选择结束日期:', e.detail);
      
      this.triggerEvent('endDateChange', { date: e.detail.value });
    },

    /**
     * 选择开始时间
     */
    onSelectStartTime: function(e) {
      console.log('选择开始时间:', e.detail);
      
      this.triggerEvent('startTimeChange', { time: e.detail.value });
    },

    /**
     * 选择结束时间
     */
    onSelectEndTime: function(e) {
      console.log('选择结束时间:', e.detail);
      
      this.triggerEvent('endTimeChange', { time: e.detail.value });
    },

    /**
     * 处理快速日期选择
     */
    onQuickDateOptionChange: function(e) {
      console.log('快速日期选择:', e.detail);
      
      this.triggerEvent('quickDateChange', e.detail);
    },

    /**
     * 处理日期范围快速选择
     */
    onRangeDateOptionChange: function(e) {
      console.log('日期范围快速选择:', e.detail);
      
      this.triggerEvent('rangeDateChange', e.detail);
    },

    /**
     * 处理重复频率变更
     */
    onFrequencyChange: function(e) {
      console.log('重复频率变更:', e.detail);
      
      this.triggerEvent('frequencyChange', e.detail);
    },

    /**
     * 处理重复日变更
     */
    onDaysChange: function(e) {
      console.log('重复日变更:', e.detail);
      
      this.triggerEvent('daysChange', e.detail);
    }
  }
}) 