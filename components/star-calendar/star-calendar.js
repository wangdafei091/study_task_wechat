const dateUtils = require('../../utils/dateUtils.js');
const pointsManager = require('../../utils/pointsManager.js');

Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 初始显示月份，格式：YYYY-MM
    initialMonth: {
      type: String,
      value: ''
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth(),
    yearText: '',
    monthText: '',
    weekDayLabels: ['日', '一', '二', '三', '四', '五', '六'],
    calendarDays: [],
    selectedDate: '',
    touchStartX: 0
  },

  /**
   * 生命周期函数
   */
  lifetimes: {
    attached: function() {
      console.log('[星星日历] 组件初始化');
      this.initCalendar();
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 初始化日历
     */
    initCalendar: function() {
      // 设置初始月份
      let year = this.data.currentYear;
      let month = this.data.currentMonth;
      
      if (this.properties.initialMonth) {
        const [y, m] = this.properties.initialMonth.split('-');
        year = parseInt(y);
        month = parseInt(m) - 1;
      }
      
      this.setData({
        currentYear: year,
        currentMonth: month
      });
      
      // 更新月份显示文本
      this.updateMonthTitle();
      
      // 生成日历数据
      this.generateCalendarDays();
      
      // 获取星星记录
      this.loadStarRecords();
      
      console.log(`[星星日历] 初始化完成，当前显示: ${year}年${month + 1}月`);
    },
    
    /**
     * 更新月份标题显示
     */
    updateMonthTitle: function() {
      const yearText = `${this.data.currentYear}年`;
      const monthText = `${this.data.currentMonth + 1}月`;
      
      this.setData({
        yearText,
        monthText
      });
    },
    
    /**
     * 生成日历数据
     */
    generateCalendarDays: function() {
      console.log('[星星日历] 生成日历数据');
      
      const year = this.data.currentYear;
      const month = this.data.currentMonth;
      
      // 获取当月第一天和最后一天
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      
      // 获取当月第一天是星期几(0-6)
      const firstDayOfWeek = firstDay.getDay();
      
      // 当月的总天数
      const daysInMonth = lastDay.getDate();
      
      // 获取今天的日期
      const today = new Date();
      const todayYear = today.getFullYear();
      const todayMonth = today.getMonth();
      const todayDate = today.getDate();
      
      let days = [];
      
      // 添加上个月的日期
      if (firstDayOfWeek > 0) {
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        
        for (let i = 0; i < firstDayOfWeek; i++) {
          const day = prevMonthLastDay - firstDayOfWeek + i + 1;
          const prevMonth = month === 0 ? 11 : month - 1;
          const prevYear = month === 0 ? year - 1 : year;
          const dateString = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          
          days.push({
            day,
            dateString,
            isCurrentMonth: false,
            isToday: false
          });
        }
      }
      
      // 添加当月的日期
      for (let i = 1; i <= daysInMonth; i++) {
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const isToday = (year === todayYear && month === todayMonth && i === todayDate);
        
        days.push({
          day: i,
          dateString,
          isCurrentMonth: true,
          isToday
        });
        
        // 默认选中今天
        if (isToday && !this.data.selectedDate) {
          this.setData({
            selectedDate: dateString
          });
        }
      }
      
      // 添加下个月的日期以填充6行
      const totalDays = days.length;
      const remainingDays = 42 - totalDays; // 保持6行固定高度
      
      if (remainingDays > 0) {
        const nextMonth = month === 11 ? 0 : month + 1;
        const nextYear = month === 11 ? year + 1 : year;
        
        for (let i = 1; i <= remainingDays; i++) {
          const dateString = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
          
          days.push({
            day: i,
            dateString,
            isCurrentMonth: false,
            isToday: false
          });
        }
      }
      
      this.setData({
        calendarDays: days
      });
    },
    
    /**
     * 加载星星记录
     */
    loadStarRecords: function() {
      console.log('[星星日历] 加载星星记录');
      
      pointsManager.getStarRecords((records) => {
        if (!records || records.length === 0) {
          console.log('[星星日历] 没有星星记录');
          return;
        }
        
        // 按日期分组星星记录
        const recordsByDate = this.groupRecordsByDate(records);
        
        // 更新日历数据，添加星星信息
        const updatedCalendarDays = this.data.calendarDays.map(day => {
          const dayRecords = recordsByDate[day.dateString] || [];
          
          if (dayRecords.length > 0) {
            // 计算当天获得和扣除的星星
            let earned = 0;
            let deducted = 0;
            
            dayRecords.forEach(record => {
              const points = record.points || 0;
              if (points > 0) {
                earned += points;
              } else if (points < 0) {
                deducted += Math.abs(points);
              }
            });
            
            // 仅当有星星变动时才添加信息
            if (earned > 0 || deducted > 0) {
              // 简化大数值的显示格式，对于大于等于100的数值除以10显示
              const formattedEarned = earned >= 100 ? Math.floor(earned / 10) : earned;
              const formattedDeducted = deducted >= 100 ? Math.floor(deducted / 10) : deducted;
              
              day.starInfo = {
                earned: formattedEarned,
                deducted: formattedDeducted,
                records: dayRecords
              };
              
              // 添加日志
              console.log(`[星星日历] ${day.dateString} 星星记录: 获得=${earned}(显示:${formattedEarned}), 扣除=${deducted}(显示:${formattedDeducted})`);
            }
          }
          
          return day;
        });
        
        this.setData({
          calendarDays: updatedCalendarDays
        });
        
        console.log('[星星日历] 星星记录加载完成');
      });
    },
    
    /**
     * 按日期分组星星记录
     */
    groupRecordsByDate: function(records) {
      const result = {};
      
      records.forEach(record => {
        if (!record.timestamp) return;
        
        const date = new Date(record.timestamp);
        const dateString = dateUtils.formatDate(date);
        
        if (!result[dateString]) {
          result[dateString] = [];
        }
        
        result[dateString].push(record);
      });
      
      return result;
    },
    
    /**
     * 切换到上个月
     */
    prevMonth: function() {
      let year = this.data.currentYear;
      let month = this.data.currentMonth;
      
      month--;
      if (month < 0) {
        month = 11;
        year--;
      }
      
      this.setData({
        currentYear: year,
        currentMonth: month
      });
      
      this.updateMonthTitle();
      this.generateCalendarDays();
      this.loadStarRecords();
      
      console.log(`[星星日历] 切换到上个月: ${year}年${month + 1}月`);
    },
    
    /**
     * 切换到下个月
     */
    nextMonth: function() {
      let year = this.data.currentYear;
      let month = this.data.currentMonth;
      
      month++;
      if (month > 11) {
        month = 0;
        year++;
      }
      
      this.setData({
        currentYear: year,
        currentMonth: month
      });
      
      this.updateMonthTitle();
      this.generateCalendarDays();
      this.loadStarRecords();
      
      console.log(`[星星日历] 切换到下个月: ${year}年${month + 1}月`);
    },
    
    /**
     * 返回今天
     */
    goToToday: function() {
      const today = new Date();
      
      this.setData({
        currentYear: today.getFullYear(),
        currentMonth: today.getMonth(),
        selectedDate: dateUtils.formatDate(today)
      });
      
      this.updateMonthTitle();
      this.generateCalendarDays();
      this.loadStarRecords();
      
      console.log('[星星日历] 返回今天');
    },
    
    /**
     * 选择日期
     */
    selectDate: function(e) {
      const date = e.currentTarget.dataset.date;
      
      this.setData({
        selectedDate: date
      });
      
      // 触发日期选择事件
      this.triggerEvent('dateSelected', { date });
      
      console.log(`[星星日历] 选择日期: ${date}`);
    },
    
    /**
     * 触摸开始事件 - 用于左右滑动切换月份
     */
    touchStart: function(e) {
      this.setData({
        touchStartX: e.changedTouches[0].clientX
      });
    },
    
    /**
     * 触摸结束事件 - 用于左右滑动切换月份
     */
    touchEnd: function(e) {
      const touchEndX = e.changedTouches[0].clientX;
      const diff = touchEndX - this.data.touchStartX;
      
      // 滑动距离超过50px才触发翻页
      if (Math.abs(diff) > 50) {
        if (diff > 0) {
          // 向右滑动，上个月
          this.prevMonth();
        } else {
          // 向左滑动，下个月
          this.nextMonth();
        }
      }
    }
  }
}) 