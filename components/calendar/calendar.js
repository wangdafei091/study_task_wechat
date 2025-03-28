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
      this.triggerEvent('selectDate', { index });
    },
    
    prevWeek() {
      this.triggerEvent('changeWeek', { direction: 'prev' });
    },
    
    nextWeek() {
      this.triggerEvent('changeWeek', { direction: 'next' });
    }
  }
}) 