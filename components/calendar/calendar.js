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
    },
    isLandscape: {
      type: Boolean,
      value: false
    },
    deviceType: {
      type: Object,
      value: {}
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    itemWidths: {
      small: 'calc(100% / 7 - 6rpx)',
      medium: 'calc(100% / 7 - 10rpx)',
      large: 'calc(100% / 7 - 12rpx)'
    },
    itemHeights: {
      small: '70rpx',
      medium: '80rpx',
      large: '90rpx'
    },
    dateNumberSizes: {
      small: '26rpx',
      medium: '28rpx',
      large: '32rpx'
    }
  },

  observers: {
    'deviceType, isLandscape': function(deviceType, isLandscape) {
      this.updateStyles(deviceType, isLandscape);
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    updateStyles: function(deviceType, isLandscape) {
      let sizeCategory = 'medium';
      
      // 根据设备类型确定尺寸类别
      if (deviceType) {
        if (deviceType.isSmallScreen) {
          sizeCategory = 'small';
        } else if (deviceType.isLargeScreen || deviceType.isExtraLargeScreen) {
          sizeCategory = 'large';
        }
      }
      
      // 横屏模式下的特殊处理
      let itemStyle = '';
      let containerPadding = '';
      
      if (isLandscape) {
        // 横屏模式下调整布局
        const itemWidth = this.data.itemWidths[sizeCategory];
        const itemHeight = this.data.itemHeights[sizeCategory];
        const dateNumberSize = this.data.dateNumberSizes[sizeCategory];
        
        itemStyle = `width: ${itemWidth}; height: ${itemHeight}; font-size: ${dateNumberSize};`;
        containerPadding = 'padding: 20rpx 20rpx 30rpx;';
      } else {
        // 竖屏模式使用默认样式
        const itemWidth = this.data.itemWidths[sizeCategory];
        const itemHeight = this.data.itemHeights[sizeCategory];
        const dateNumberSize = this.data.dateNumberSizes[sizeCategory];
        
        itemStyle = `width: ${itemWidth}; height: ${itemHeight}; font-size: ${dateNumberSize};`;
        
        if (sizeCategory === 'small') {
          containerPadding = 'padding: 20rpx 15rpx 30rpx;';
        } else if (sizeCategory === 'large') {
          containerPadding = 'padding: 40rpx 40rpx 50rpx;';
        } else {
          containerPadding = 'padding: 30rpx 30rpx 40rpx;';
        }
      }
      
      this.setData({
        itemStyle,
        containerPadding
      });
    },
    
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
  },

  /**
   * 组件生命周期
   */
  lifetimes: {
    attached: function() {
      // 初始化组件时进行一次样式计算
      this.updateStyles(this.data.deviceType, this.data.isLandscape);
    }
  }
}) 