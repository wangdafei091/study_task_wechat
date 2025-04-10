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
    isLongPress: false,    // 是否长按状态
    showOptions: false     // 是否显示选项
  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 触摸开始
    touchStartUpcoming: function(e) {
      this.startX = e.touches[0].clientX;
      this.startY = e.touches[0].clientY;
      this.setData({ 
        swipeOffset: 0,
        dismissing: false
      });
      
      // 记录开始长按的时间
      this.longPressStartTime = Date.now();
      
      // 设置定时器，750ms后触发长按效果
      this.longPressTimer = setTimeout(() => {
        // 播放振动反馈
        if (wx.vibrateShort) {
          wx.vibrateShort({ type: 'heavy' });
        }
        
        // 显示长按状态
        this.setData({
          isLongPress: true
        });
        
        // 添加动画后显示选项
        setTimeout(() => {
          this.setData({
            showOptions: true
          });
        }, 100);
      }, 750);
    },

    // 触摸移动
    touchMoveUpcoming: function(e) {
      const moveX = e.touches[0].clientX;
      const moveY = e.touches[0].clientY;
      
      // 判断是否是横向滑动（水平方向移动距离大于垂直方向）
      const deltaX = moveX - this.startX;
      const deltaY = moveY - this.startY;
      
      // 如果是垂直滑动为主，取消长按和滑动效果
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        clearTimeout(this.longPressTimer);
        return;
      }
      
      // 如果手指移动，取消长按效果
      clearTimeout(this.longPressTimer);
      
      // 只允许向左滑动(负值)，且最大滑动距离有限制
      if (deltaX < 0 && deltaX > -300) {
        this.setData({
          swipeOffset: deltaX
        });
      }
    },

    // 触摸结束
    touchEndUpcoming: function(e) {
      // 清除长按定时器
      clearTimeout(this.longPressTimer);
      
      const offset = this.data.swipeOffset;
      
      // 如果滑动距离超过阈值，触发消除
      if (offset < -100) {
        this.dismissTask();
      } else {
        // 否则回弹
        this.setData({
          swipeOffset: 0
        });
        
        // 如果不是长按状态，且触摸时间短，则认为是点击进入任务详情
        if (!this.data.isLongPress && (Date.now() - this.longPressStartTime < 500)) {
          this.onTaskTap();
        }
      }
    },

    // 点击任务
    onTaskTap: function() {
      this.triggerEvent('tap', {
        taskId: this.properties.task.id
      });
    },

    // 处理选项点击
    handleOption: function(e) {
      const action = e.currentTarget.dataset.action;
      
      // 轻微振动反馈
      if (wx.vibrateShort) {
        wx.vibrateShort({ type: 'light' });
      }
      
      // 先关闭选项卡
      this.setData({
        showOptions: false,
        isLongPress: false
      });
      
      // 延迟执行操作，让视觉效果更流畅
      setTimeout(() => {
        switch(action) {
          case 'viewTask':
            // 查看任务详情
            this.triggerEvent('tap', {
              taskId: this.properties.task.id
            });
            break;
            
          case 'viewMessages':
            // 跳转到消息中心
            this.triggerEvent('messages');
            break;
            
          case 'dismiss':
            // 不再提醒
            this.dismissTask();
            break;
        }
      }, 200);
    },

    // 消除任务提醒
    dismissTask: function() {
      this.setData({
        dismissing: true
      });
      
      // 触发消除事件
      setTimeout(() => {
        this.triggerEvent('dismiss', {
          taskId: this.properties.task.id
        });
      }, 300);
    }
  }
}) 