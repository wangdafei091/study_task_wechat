Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 任务对象
    task: {
      type: Object,
      value: {
        id: '',
        name: '',
        timeRemaining: 0
      }
    },
    // 是否显示组件
    show: {
      type: Boolean,
      value: false
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    swipeOffset: 0,        // 滑动偏移量
    dismissing: false,     // 是否正在消除
    showSwipeHint: false   // 是否高亮显示滑动提示
  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 触摸开始
    touchStartUpcoming: function(e) {
      console.log('[upcomingTask] 触摸开始');
      this.startX = e.touches[0].clientX;
      this.startY = e.touches[0].clientY;
      this.setData({ 
        swipeOffset: 0,
        dismissing: false
      });
    },

    // 触摸移动
    touchMoveUpcoming: function(e) {
      const moveX = e.touches[0].clientX;
      const moveY = e.touches[0].clientY;
      
      // 判断是否是横向滑动（水平方向移动距离大于垂直方向）
      const deltaX = moveX - this.startX;
      const deltaY = moveY - this.startY;
      
      // 如果是垂直滑动为主，取消滑动效果
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        return;
      }
      
      // 只允许向左滑动(负值)，且最大滑动距离有限制
      if (deltaX < 0 && deltaX > -300) {
        // 当滑动距离超过一定值时高亮显示提示
        const showHint = deltaX < -30;
        
        this.setData({
          swipeOffset: deltaX,
          showSwipeHint: showHint
        });
        
        console.log(`[upcomingTask] 滑动距离: ${deltaX}rpx, 显示提示: ${showHint}`);
      }
    },

    // 触摸结束
    touchEndUpcoming: function(e) {
      console.log('[upcomingTask] 触摸结束');
      const offset = this.data.swipeOffset;
      
      // 如果滑动距离超过阈值，触发消除
      if (offset < -100) {
        console.log('[upcomingTask] 滑动距离足够，关闭提醒');
        this.dismissTask();
      } else {
        // 否则回弹
        this.setData({
          swipeOffset: 0,
          showSwipeHint: false
        });
        console.log('[upcomingTask] 滑动距离不足，回弹');
      }
    },

    // 消除任务提醒
    dismissTask: function() {
      console.log('[upcomingTask] 开始消除任务提醒');
      this.setData({
        dismissing: true
      });
      
      // 触发消除事件
      setTimeout(() => {
        console.log('[upcomingTask] 触发dismiss事件');
        this.triggerEvent('dismiss', {
          taskId: this.properties.task.id
        });
      }, 300);
    }
  }
}) 