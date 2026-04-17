Component({
  options: {
    multipleSlots: true
  },

  /**
   * 组件的属性列表
   */
  properties: {
    // 卡片标题
    title: {
      type: String,
      value: ''
    },
    // 标题前的图标
    icon: {
      type: String,
      value: ''
    },
    // 是否取消内边距
    noPadding: {
      type: Boolean,
      value: false
    },
    // 自定义样式类
    customClass: {
      type: String,
      value: ''
    },
    // 自定义样式
    customStyle: {
      type: String,
      value: ''
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
    
  }
}) 
