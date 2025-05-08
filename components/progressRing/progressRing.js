Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 百分比进度(0-100)
    percent: {
      type: Number,
      value: 0,
      observer(newVal) {
        const percent = Math.max(0, Math.min(100, newVal));
        this._updateProgress(percent);
      }
    },
    // 圆环大小，可选值large/medium/small或具体数值
    size: {
      type: String,
      value: 'medium'
    },
    // 圆环类型，可选值：default/habit/study/interest
    type: {
      type: String,
      value: 'default'
    },
    // 自定义颜色（当type为default时使用）
    color: {
      type: String,
      value: '#4285F4'
    },
    // 是否显示文本
    showText: {
      type: Boolean,
      value: true
    },
    // 自定义中心内容（插槽替代）
    centerContent: {
      type: String,
      value: ''
    },
    // 是否启用悬停效果
    enableHover: {
      type: Boolean,
      value: true
    },
    // 边框宽度
    borderWidth: {
      type: Number,
      value: 8
    }
  },
  
  /**
   * 组件的初始数据
   */
  data: {
    progress: 0,
    sizeClass: 'medium',
    isComplete: false,
    progressClass: 'progress-ring-zero'
  },
  
  /**
   * 数据监听器
   */
  observers: {
    'percent': function(percent) {
      this.setData({
        isComplete: percent >= 100
      });
    },
    'size': function(size) {
      // 处理预设尺寸或自定义尺寸
      if (['large', 'medium', 'small'].includes(size)) {
        this.setData({ sizeClass: size });
      } else {
        this.setData({ sizeClass: 'custom' });
      }
    }
  },
  
  /**
   * 组件的方法列表
   */
  methods: {
    onRingTap() {
      this.triggerEvent('tap', { 
        type: this.data.type,
        percent: this.data.progress
      });
    },
    
    /**
     * 更新进度并设置相应类名
     * @param {Number} percent - 百分比进度(0-100)
     */
    _updateProgress: function(percent) {
      console.log(`[progressRing] 更新进度: ${percent}%`);
      
      // 确定适当的类名
      let progressClass = 'progress-ring-with-progress';
      if (percent <= 0) {
        progressClass = 'progress-ring-zero';
      }
      
      // 设置数据，包括进度值和类名
      this.setData({
        progress: percent,
        progressClass: progressClass
      });
      
      // 使用setData设置进度角度，供WXML使用
      this.setData({
        progressAngle: percent * 3.6
      });
    }
  }
}) 