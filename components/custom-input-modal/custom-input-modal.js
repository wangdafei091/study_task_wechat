Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 是否显示弹窗
    show: {
      type: Boolean,
      value: false
    },
    // 弹窗标题
    title: {
      type: String,
      value: ''
    },
    // 提示内容
    content: {
      type: String,
      value: ''
    },
    // 输入框占位文字
    placeholder: {
      type: String,
      value: ''
    },
    // 输入框默认值
    value: {
      type: String,
      value: ''
    },
    // 最大输入长度
    maxLength: {
      type: Number,
      value: 100
    },
    // 确认按钮文字
    confirmText: {
      type: String,
      value: '确定'
    },
    // 取消按钮文字
    cancelText: {
      type: String,
      value: '取消'
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    inputValue: '',
    // 焦点控制
    isFocused: false
  },

  /**
   * 数据监听器
   */
  observers: {
    'show': function(show) {
      if (show) {
        // 显示弹窗时，设置输入值并准备聚焦
        this.setData({
          inputValue: this.properties.value,
          isFocused: true
        });
        console.log('[custom-input-modal] 显示弹窗，设置初始值:', this.properties.value);
      } else {
        // 隐藏弹窗时，重置焦点状态
        this.setData({
          isFocused: false
        });
      }
    },
    'value': function(value) {
      // 当外部属性value变化时更新内部inputValue
      if (this.properties.show) {
        this.setData({
          inputValue: value
        });
      }
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 输入框内容变化处理
    handleInput: function(e) {
      const value = e.detail.value;
      console.log('[custom-input-modal] 输入内容变化:', value);
      this.setData({
        inputValue: value
      });
    },

    // 点击确认按钮
    handleConfirm: function() {
      console.log('[custom-input-modal] 确认输入:', this.data.inputValue);
      this.triggerEvent('confirm', {
        value: this.data.inputValue
      });
    },

    // 点击取消按钮
    handleCancel: function() {
      console.log('[custom-input-modal] 取消输入');
      this.triggerEvent('cancel');
    },

    // 点击遮罩层，防止冒泡
    preventBubble: function() {
      return false;
    },

    // 输入框获得焦点
    handleFocus: function(e) {
      console.log('[custom-input-modal] 输入框获得焦点');
    },

    // 输入框失去焦点
    handleBlur: function(e) {
      console.log('[custom-input-modal] 输入框失去焦点');
    }
  }
}); 