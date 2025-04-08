Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 菜单项配置数组
    menuItems: {
      type: Array,
      value: []
    },
    // 菜单位置
    position: {
      type: String,
      value: 'bottom-right' // 可选值: bottom-right, bottom-left, top-right, top-left
    },
    // 菜单层级
    zIndex: {
      type: Number,
      value: 100
    },
    // 主按钮样式类
    mainButtonClass: {
      type: String,
      value: ''
    },
    // 默认图标
    defaultIcon: {
      type: String,
      value: '＋'
    },
    // 关闭图标
    closeIcon: {
      type: String,
      value: '×'
    },
    // 主题颜色
    themeColor: {
      type: String,
      value: '' // 空值表示使用默认主题
    },
    // 主按钮尺寸
    buttonSize: {
      type: Number,
      value: 110 // rpx
    },
    // 菜单项尺寸
    itemSize: {
      type: Number,
      value: 100 // rpx
    },
    // 是否禁用震动反馈
    disableVibrate: {
      type: Boolean,
      value: false
    },
    // 显示动画持续时间
    animationDuration: {
      type: Number,
      value: 300 // 毫秒
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    isOpen: false, // 菜单是否展开
    positionStyle: '',
    mainButtonStyle: '',
    containerClass: ''
  },

  /**
   * 生命周期函数
   */
  lifetimes: {
    attached: function() {
      this._updateStyles();
    }
  },

  /**
   * 属性监听器
   */
  observers: {
    'themeColor, position, buttonSize, itemSize': function() {
      this._updateStyles();
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 更新组件样式
     */
    _updateStyles: function() {
      const { themeColor, position, buttonSize, itemSize } = this.data;
      
      let mainButtonStyle = '';
      if (themeColor) {
        mainButtonStyle = `background: ${themeColor}; width: ${buttonSize}rpx; height: ${buttonSize}rpx;`;
      } else {
        mainButtonStyle = `width: ${buttonSize}rpx; height: ${buttonSize}rpx;`;
      }
      
      this.setData({
        mainButtonStyle,
        containerClass: `position-${position}`
      });
    },
    
    /**
     * 切换菜单展开状态
     */
    toggleMenu: function() {
      if (!this.data.disableVibrate && wx.vibrateShort) {
        wx.vibrateShort({ type: 'light' });
      }
      
      const isOpen = !this.data.isOpen;
      this.setData({ isOpen });
      
      // 触发菜单状态变化事件
      this.triggerEvent('statechange', { isOpen });
    },
    
    /**
     * 处理菜单项点击事件
     */
    handleItemTap: function(e) {
      const index = e.currentTarget.dataset.index;
      const item = this.data.menuItems[index];
      
      if (!this.data.disableVibrate && wx.vibrateShort) {
        wx.vibrateShort({ type: 'medium' });
      }
      
      // 触发菜单项点击事件
      this.triggerEvent('itemtap', { index, item });
      
      // 关闭菜单
      this.setData({ isOpen: false });
      
      // 触发菜单状态变化事件
      this.triggerEvent('statechange', { isOpen: false });
    }
  }
}) 