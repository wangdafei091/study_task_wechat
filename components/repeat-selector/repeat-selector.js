Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 重复类型：none, daily, weekly, workdays, custom
    repeatType: {
      type: String,
      value: 'none'
    },
    // 选中的重复日（用于自定义重复）
    selectedDays: {
      type: Array,
      value: []
    },
    // 是否显示重复规则预览
    showPreview: {
      type: Boolean,
      value: true
    },
    // 开始日期
    startDate: {
      type: String,
      value: ''
    },
    // 结束日期
    endDate: {
      type: String,
      value: ''
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    weekdayNames: ['日', '一', '二', '三', '四', '五', '六']
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 选择重复频率类型
     */
    onSelectFrequency: function(e) {
      const type = e.currentTarget.dataset.type;
      console.log('选择重复频率:', type);
      
      // 工作日模式自动选择周一到周五
      let days = [];
      if (type === 'workdays') {
        days = ['1', '2', '3', '4', '5'];
      }

      this.triggerEvent('frequencyChange', {
        type: type,
        days: days
      });
    },

    /**
     * 切换星期选择状态
     */
    onToggleWeekday: function(e) {
      const day = e.currentTarget.dataset.day;
      console.log('切换星期选择:', day);
      
      // 复制当前已选择的日期数组
      const days = [...this.properties.selectedDays];
      
      // 判断是否已选中
      const index = days.indexOf(day);
      if (index > -1) {
        // 已选中，移除
        days.splice(index, 1);
      } else {
        // 未选中，添加
        days.push(day);
      }
      
      this.triggerEvent('daysChange', {
        days: days
      });
    }
  }
}) 