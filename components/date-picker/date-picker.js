Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 基本属性
    mode: {
      type: String,
      value: 'single' // 'single'(单日期)、'range'(日期范围)
    },
    value: {
      type: String,
      value: ''  // 当前选中日期，格式'YYYY-MM-DD'
    },
    label: {
      type: String,
      value: '' // 日期选择器标签
    },
    placeholder: {
      type: String,
      value: '请选择日期' // 日期选择器占位符
    },
    
    // 范围选择相关
    startDate: {
      type: String,
      value: '' // 范围开始日期
    },
    endDate: {
      type: String,
      value: '' // 范围结束日期
    },
    startLabel: {
      type: String,
      value: '开始日期' // 开始日期标签
    },
    endLabel: {
      type: String,
      value: '结束日期' // 结束日期标签
    },
    startPlaceholder: {
      type: String,
      value: '请选择开始日期' // 开始日期占位符
    },
    endPlaceholder: {
      type: String,
      value: '请选择结束日期' // 结束日期占位符
    },
    
    // 限制范围
    minDate: {
      type: String,
      value: '' // 最小可选日期，格式'YYYY-MM-DD'
    },
    maxDate: {
      type: String,
      value: '' // 最大可选日期，格式'YYYY-MM-DD'
    },
    
    // 快速选项
    quickOptions: {
      type: Array,
      value: [
        { label: '今天', value: 'today' },
        { label: '明天', value: 'tomorrow' },
        { label: '周末', value: 'weekend' }
      ] // 单日期模式快速选项配置
    },
    rangeQuickOptions: {
      type: Array,
      value: [
        { label: '本周', value: 'week' },
        { label: '本月', value: 'month' },
        { label: '上月', value: 'lastMonth' }
      ] // 范围模式快速选项配置
    },
    
    // 样式相关
    customClass: {
      type: String,
      value: '' // 自定义样式类
    },
    customStyle: {
      type: String,
      value: '' // 自定义内联样式
    },
    
    // 功能开关
    useNativePicker: {
      type: Boolean,
      value: true // 是否使用原生选择器
    },
    showQuickOptions: {
      type: Boolean,
      value: true // 是否显示快速选项
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    currentQuickOption: '', // 当前选中的快速选项（单日期模式）
    currentRangeQuickOption: '' // 当前选中的快速选项（范围模式）
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 日期变更处理函数 (单日期模式)
     */
    onDateChange(e) {
      const value = e.detail.value;
      this.setData({ value, currentQuickOption: '' });
      
      // 触发日期变更事件
      this.triggerEvent('change', { value });
    },
    
    /**
     * 开始日期变更处理函数 (范围模式)
     */
    onStartDateChange(e) {
      const startDate = e.detail.value;
      this.setData({ 
        startDate,
        currentRangeQuickOption: '' 
      });
      
      // 触发开始日期变更事件
      this.triggerEvent('startChange', { startDate });
      
      // 如果结束日期存在，同时触发范围变更事件
      if (this.data.endDate) {
        this.triggerEvent('rangeChange', { 
          startDate, 
          endDate: this.data.endDate 
        });
      }
    },
    
    /**
     * 结束日期变更处理函数 (范围模式)
     */
    onEndDateChange(e) {
      const endDate = e.detail.value;
      this.setData({ 
        endDate,
        currentRangeQuickOption: '' 
      });
      
      // 触发结束日期变更事件
      this.triggerEvent('endChange', { endDate });
      
      // 如果开始日期存在，同时触发范围变更事件
      if (this.data.startDate) {
        this.triggerEvent('rangeChange', { 
          startDate: this.data.startDate, 
          endDate 
        });
      }
    },
    
    /**
     * 快速选项点击处理 (单日期模式)
     */
    onQuickOptionTap(e) {
      const value = e.currentTarget.dataset.value;
      const date = this.getQuickOptionDate(value);
      
      if (date) {
        this.setData({
          value: date,
          currentQuickOption: value
        });
        
        // 触发日期变更事件
        this.triggerEvent('change', { value: date });
        
        // 触发快速选项事件
        this.triggerEvent('quickOptionChange', { 
          option: value, 
          date 
        });
      }
    },
    
    /**
     * 范围快速选项点击处理 (范围模式)
     */
    onRangeQuickOptionTap(e) {
      const value = e.currentTarget.dataset.value;
      const { startDate, endDate } = this.getRangeQuickOptionDates(value);
      
      if (startDate && endDate) {
        this.setData({
          startDate,
          endDate,
          currentRangeQuickOption: value
        });
        
        // 触发范围变更事件
        this.triggerEvent('rangeChange', { startDate, endDate });
        
        // 触发快速选项事件
        this.triggerEvent('rangeQuickOptionChange', { 
          option: value, 
          startDate, 
          endDate 
        });
      }
    },
    
    /**
     * 获取快速选项对应的日期 (单日期模式)
     */
    getQuickOptionDate(option) {
      const now = new Date();
      
      switch(option) {
        case 'today':
          return this.formatDate(now);
          
        case 'tomorrow':
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          return this.formatDate(tomorrow);
          
        case 'weekend':
          // 获取本周周六
          const daysToSaturday = 6 - now.getDay();
          const saturday = new Date(now);
          saturday.setDate(saturday.getDate() + (daysToSaturday === 0 ? 7 : daysToSaturday));
          return this.formatDate(saturday);
          
        default:
          return '';
      }
    },
    
    /**
     * 获取范围快速选项对应的日期范围 (范围模式)
     */
    getRangeQuickOptionDates(option) {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const date = now.getDate();
      const day = now.getDay(); // 0是周日，6是周六
      
      let startDate = '';
      let endDate = '';
      
      switch(option) {
        case 'week':
          // 本周日至周六
          const weekStart = new Date(now);
          weekStart.setDate(date - day); // 调整到本周周日
          startDate = this.formatDate(weekStart);
          
          const weekEnd = new Date(now);
          weekEnd.setDate(date + (6 - day)); // 调整到本周周六
          endDate = this.formatDate(weekEnd);
          break;
          
        case 'month':
          // 本月1日至月末
          const monthStart = new Date(year, month, 1);
          startDate = this.formatDate(monthStart);
          
          const monthEnd = new Date(year, month + 1, 0);
          endDate = this.formatDate(monthEnd);
          break;
          
        case 'lastMonth':
          // 上月1日至月末
          const lastMonthStart = new Date(year, month - 1, 1);
          startDate = this.formatDate(lastMonthStart);
          
          const lastMonthEnd = new Date(year, month, 0);
          endDate = this.formatDate(lastMonthEnd);
          break;
      }
      
      return { startDate, endDate };
    },
    
    /**
     * 日期格式化
     */
    formatDate(date) {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    },
    
    /**
     * 显示日历选择器 (单日期模式，不使用原生选择器时)
     * 在此处可以扩展实现自定义日历选择UI
     */
    showCalendar() {
      // 通知外部显示日历
      this.triggerEvent('showCalendar', {
        currentDate: this.data.value,
        mode: 'single'
      });
    },
    
    /**
     * 显示开始日期日历选择器 (范围模式，不使用原生选择器时)
     */
    showStartCalendar() {
      // 通知外部显示日历
      this.triggerEvent('showCalendar', {
        currentDate: this.data.startDate,
        mode: 'start'
      });
    },
    
    /**
     * 显示结束日期日历选择器 (范围模式，不使用原生选择器时)
     */
    showEndCalendar() {
      // 通知外部显示日历
      this.triggerEvent('showCalendar', {
        currentDate: this.data.endDate,
        mode: 'end'
      });
    }
  }
}); 