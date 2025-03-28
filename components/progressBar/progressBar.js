Component({
  /**
   * 组件的属性列表
   */
  properties: {
    current: {
      type: Number,
      value: 0
    },
    total: {
      type: Number,
      value: 100
    },
    showText: {
      type: Boolean,
      value: true
    },
    barHeight: {
      type: Number,
      value: 16
    },
    activeColor: {
      type: String,
      value: '#4285F4'
    },
    backgroundColor: {
      type: String,
      value: '#E8E8E8'
    },
    borderRadius: {
      type: Number,
      value: 8
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    percentage: 0
  },

  /**
   * 数据监听器
   */
  observers: {
    'current, total': function(current, total) {
      let percentage = 0;
      if (total > 0) {
        percentage = Math.min(Math.max(current / total * 100, 0), 100);
      }
      this.setData({
        percentage: percentage
      });
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {

  }
}) 