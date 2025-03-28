Component({
  /**
   * 组件的属性列表
   */
  properties: {
    selectedDate: {
      type: String,
      value: ''
    },
    weekDays: {
      type: Array,
      value: ['日', '一', '二', '三', '四', '五', '六']
    },
    currentWeek: {
      type: Array,
      value: []
    },
    currentMonth: {
      type: Array,
      value: []
    },
    viewMode: {
      type: String,
      value: 'week' // 'week' 或 'month'
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
    selectDate(e) {
      const index = e.currentTarget.dataset.index;
      const date = e.currentTarget.dataset.date;
      this.triggerEvent('selectDate', { index, date });
    },
    
    prevWeek() {
      this.triggerEvent('changeWeek', { direction: 'prev' });
    },
    
    nextWeek() {
      this.triggerEvent('changeWeek', { direction: 'next' });
    },
    
    prevMonth() {
      this.triggerEvent('changeMonth', { direction: 'prev' });
    },
    
    nextMonth() {
      this.triggerEvent('changeMonth', { direction: 'next' });
    },
    
    toggleViewMode() {
      const newMode = this.data.viewMode === 'week' ? 'month' : 'week';
      this.triggerEvent('toggleViewMode', { mode: newMode });
    }
  }
}) 