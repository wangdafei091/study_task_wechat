const dateUtils = require('../../../utils/dateUtils.js');
const analyticsUtils = require('../../utils/analyticsUtils.js');
const { EVENTS } = require('../../../utils/constants.js');
const serviceManager = require('../../../services/service-manager.js');

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
    touchStartX: 0,
    hasStarRecords: false, // 添加标记，表示当前月是否有星星记录
    isLoading: false, // 添加加载状态标志
    starRecordsCache: {}, // 添加星星记录缓存
    lastTouchTime: 0, // 添加触摸时间记录，用于节流
    activeStarInfo: null, // 当前激活的星星信息（用于动画）
  },

  /**
   * 生命周期函数
   */
  lifetimes: {
    attached: function() {
      console.log('[星星日历] 组件初始化');
      this.initCalendar();
      
      // 订阅任务状态变更事件
      this.taskStatusChangeListener = (data) => {
        console.log('[星星日历] 接收到任务状态变更事件:', data);
        
        // 获取变更任务的日期
        const taskDate = data.task ? data.task.date : dateUtils.getTodayString();
        
        // 如果是当天任务，直接更新今日数据
        if (taskDate === dateUtils.getTodayString()) {
          this.updateTodayDataOnly();
        } else {
          // 非当天任务，标记对应月份缓存需要刷新
          const [year, month] = taskDate.split('-');
          const monthKey = `${year}-${month}`;
          
          const updatedCache = {...this.data.starRecordsCache};
          if (updatedCache[monthKey]) {
            updatedCache[monthKey].needsRefresh = true;
            this.setData({ starRecordsCache: updatedCache });
            console.log(`[星星日历] 标记月份 ${monthKey} 需要刷新`);
          }
          
          // 如果是当前显示的月份，则刷新数据
          if (monthKey === `${this.data.currentYear}-${String(this.data.currentMonth + 1).padStart(2, '0')}`) {
            this.loadStarRecords();
          }
        }
      };
      
      // 通过事件总线订阅任务状态变更事件
      if (getApp().globalData.eventBus) {
        getApp().globalData.eventBus.on(EVENTS.TASK_STATUS_CHANGED, this.taskStatusChangeListener);
        console.log('[星星日历] 已订阅任务状态变更事件');
      }
    },
    
    detached: function() {
      // 取消事件订阅
      if (getApp().globalData.eventBus && this.taskStatusChangeListener) {
        getApp().globalData.eventBus.off(EVENTS.TASK_STATUS_CHANGED, this.taskStatusChangeListener);
        console.log('[星星日历] 已取消任务状态变更事件订阅');
      }
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
      
      // 添加下个月的日期，补齐6行
      const totalCells = 42; // 6行 × 7列
      const remainingCells = totalCells - days.length;
      
      if (remainingCells > 0) {
        const nextMonth = month === 11 ? 0 : month + 1;
        const nextYear = month === 11 ? year + 1 : year;
        
        for (let i = 1; i <= remainingCells; i++) {
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
     * 判断是否为惩罚性扣减记录
     * 只显示必做任务未完成的惩罚扣减，不显示奖励兑换的扣减
     * @param {Object} record 星星记录
     * @returns {Boolean} 是否为惩罚性扣减
     */
    isPenaltyDeduction: function(record) {
      if (!record || !record.isExpense()) {
        return false;
      }
      
      // 根据source字段判断是否为惩罚性扣减
      const source = record.source || '';
      
      // 惩罚性扣减的来源标识
      const penaltySources = [
        'task_penalty',        // TaskService中的必做任务惩罚
        'required_penalty'     // StarService中的必做任务惩罚
      ];
      
      const isPenalty = penaltySources.includes(source);
      
      // 添加过滤日志
      if (record.isExpense() && !isPenalty) {
        console.log(`[星星日历] 过滤非惩罚性扣减: source=${source}, points=${record.points}`);
      }
      
      return isPenalty;
    },

    /**
     * 加载星星记录
     */
    loadStarRecords: function() {
      const year = this.data.currentYear;
      const month = this.data.currentMonth;
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      
      // 检查缓存
      const cachedData = this.data.starRecordsCache[monthKey];
      if (cachedData && !cachedData.needsRefresh) {
        console.log(`[星星日历] 使用缓存数据: ${monthKey}`);
        this.updateCalendarWithStars(cachedData.records);
        return;
      }
      
      console.log(`[星星日历] 加载星星记录: ${monthKey}`);
      this.setData({ isLoading: true });
      
      // 获取当月的开始和结束日期
      const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;
      
      serviceManager.getStarService().getStarRecordsByDateRange(startDate, endDate)
        .then(records => {
          console.log(`[星星日历] 获取到 ${records.length} 条星星记录`);
          
          // 更新缓存
          const updatedCache = {...this.data.starRecordsCache};
          updatedCache[monthKey] = {
            records: records,
            needsRefresh: false,
            lastUpdate: Date.now()
          };
          
          this.setData({ 
            starRecordsCache: updatedCache,
            isLoading: false
          });
          
          // 更新日历显示
          this.updateCalendarWithStars(records);
        })
        .catch(error => {
          console.error('[星星日历] 获取星星记录失败:', error);
          this.setData({ isLoading: false });
        });
    },
    
    /**
     * 更新日历显示星星数据
     */
    updateCalendarWithStars: function(starRecords) {
      console.log('[星星日历] 数据类型已修复：确保earnedStars和deductedStars为数字类型，避免字符串拼接问题');
      
      const calendarDays = this.data.calendarDays.map(day => {
        if (!day.isCurrentMonth) {
          return day;
        }
        
        // 查找该日期的星星记录，使用getDate()方法获取日期
        const dayRecords = starRecords.filter(record => record.getDate() === day.dateString);
        
        // 分别计算收入和支出的星星数量
        const earnedStars = dayRecords
          .filter(record => record.isIncome()) // 收入记录
          .reduce((sum, record) => sum + Number(record.points || 0), 0);
          
        const deductedStars = dayRecords
          .filter(record => this.isPenaltyDeduction(record)) // 只计算惩罚性扣减
          .reduce((sum, record) => sum + Math.abs(Number(record.points || 0)), 0); // 支出记录points是负数，取绝对值
        
        // 设置starInfo对象以匹配WXML模板，确保数值类型
        const starInfo = (earnedStars > 0 || deductedStars > 0) ? {
          earned: Number(earnedStars),
          deducted: Number(deductedStars)
        } : null;
        
        // 添加调试日志
        if (starInfo) {
          console.log(`[星星日历] 计算星星数据: 日期=${day.dateString}, 获得=${earnedStars}(${typeof earnedStars}), 惩罚扣除=${deductedStars}(${typeof deductedStars})`);
        }
        
        return {
          ...day,
          starInfo: starInfo,
          starRecords: dayRecords
        };
      });
      
      // 检查当前月是否有星星记录
      const hasStarRecords = starRecords.length > 0;
      
      this.setData({
        calendarDays,
        hasStarRecords
      });
      
      console.log(`[星星日历] 日历更新完成，当前月${hasStarRecords ? '有' : '无'}星星记录`);
    },
    
    /**
     * 仅更新今日数据（性能优化）
     */
    updateTodayDataOnly: function() {
      const today = dateUtils.getTodayString();
      const todayIndex = this.data.calendarDays.findIndex(day => day.dateString === today);
      
      if (todayIndex === -1) {
        console.log('[星星日历] 今日不在当前显示月份，跳过更新');
        return;
      }
      
      console.log('[星星日历] 更新今日星星数据');
      
      serviceManager.getStarService().getStarRecordsByDate(today)
        .then(records => {
          // 分别计算收入和支出的星星数量
          const earnedStars = records
            .filter(record => record.isIncome()) // 收入记录
            .reduce((sum, record) => sum + Number(record.points || 0), 0);
            
          const deductedStars = records
            .filter(record => this.isPenaltyDeduction(record)) // 只计算惩罚性扣减
            .reduce((sum, record) => sum + Math.abs(Number(record.points || 0)), 0); // 支出记录points是负数，取绝对值
          
          // 设置starInfo对象以匹配WXML模板，确保数值类型
          const starInfo = (earnedStars > 0 || deductedStars > 0) ? {
            earned: Number(earnedStars),
            deducted: Number(deductedStars)
          } : null;
          
          const updatedDays = [...this.data.calendarDays];
          updatedDays[todayIndex] = {
            ...updatedDays[todayIndex],
            starInfo: starInfo,
            starRecords: records
          };
          
          this.setData({
            calendarDays: updatedDays
          });
          
          console.log(`[星星日历] 今日星星数据更新完成: 获得${earnedStars}颗，惩罚扣除${deductedStars}颗`);
        })
        .catch(error => {
          console.error('[星星日历] 更新今日星星数据失败:', error);
        });
    },
    
    /**
     * 上一个月
     */
    onPrevMonth: function() {
      let year = this.data.currentYear;
      let month = this.data.currentMonth - 1;
      
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
      
      console.log(`[星星日历] 切换到上月: ${year}年${month + 1}月`);
    },
    
    /**
     * 下一个月
     */
    onNextMonth: function() {
      let year = this.data.currentYear;
      let month = this.data.currentMonth + 1;
      
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
      
      console.log(`[星星日历] 切换到下月: ${year}年${month + 1}月`);
    },
    
    /**
     * 日期点击事件
     */
    onDayTap: function(e) {
      const { day } = e.currentTarget.dataset;
      
      if (!day.isCurrentMonth) {
        return;
      }
      
      // 节流处理
      const now = Date.now();
      if (now - this.data.lastTouchTime < 300) {
        return;
      }
      
      this.setData({
        selectedDate: day.dateString,
        lastTouchTime: now
      });
      
      // 计算总星星数（获得的星星减去扣除的星星）
      const totalStars = day.starInfo ? (day.starInfo.earned - day.starInfo.deducted) : 0;
      
      // 触发日期选择事件
      this.triggerEvent('dateSelect', {
        date: day.dateString,
        stars: totalStars,
        starRecords: day.starRecords || []
      });
      
      // 如果有星星，显示动画效果
      if (day.starInfo && (day.starInfo.earned > 0 || day.starInfo.deducted > 0)) {
        this.showStarAnimation(day);
      }
      
      console.log(`[星星日历] 选择日期: ${day.dateString}, 获得星星: ${day.starInfo ? day.starInfo.earned : 0}, 惩罚扣除: ${day.starInfo ? day.starInfo.deducted : 0}`);
    },
    
    /**
     * 显示星星动画
     */
    showStarAnimation: function(day) {
      const totalStars = day.starInfo ? (day.starInfo.earned - day.starInfo.deducted) : 0;
      
      this.setData({
        activeStarInfo: {
          date: day.dateString,
          stars: totalStars,
          earned: day.starInfo ? day.starInfo.earned : 0,
          deducted: day.starInfo ? day.starInfo.deducted : 0,
          show: true
        }
      });
      
      // 2秒后隐藏动画
      setTimeout(() => {
        this.setData({
          activeStarInfo: null
        });
      }, 2000);
    },
    
    /**
     * 触摸开始事件（用于滑动切换月份）
     */
    onTouchStart: function(e) {
      this.setData({
        touchStartX: e.touches[0].clientX
      });
    },
    
    /**
     * 触摸结束事件（用于滑动切换月份）
     */
    onTouchEnd: function(e) {
      const touchEndX = e.changedTouches[0].clientX;
      const touchStartX = this.data.touchStartX;
      const deltaX = touchEndX - touchStartX;
      
      // 滑动距离大于50px才触发切换
      if (Math.abs(deltaX) > 50) {
        if (deltaX > 0) {
          // 向右滑动，上一个月
          this.onPrevMonth();
        } else {
          // 向左滑动，下一个月
          this.onNextMonth();
        }
      }
    },
    
    /**
     * 获取当前选中的日期
     */
    getSelectedDate: function() {
      return this.data.selectedDate;
    },
    
    /**
     * 设置选中的日期
     */
    setSelectedDate: function(dateString) {
      this.setData({
        selectedDate: dateString
      });
    },
    
    /**
     * 刷新当前月份数据
     */
    refresh: function() {
      console.log('[星星日历] 手动刷新数据');
      
      // 清除当前月份缓存
      const year = this.data.currentYear;
      const month = this.data.currentMonth;
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      
      const updatedCache = {...this.data.starRecordsCache};
      if (updatedCache[monthKey]) {
        updatedCache[monthKey].needsRefresh = true;
      }
      
      this.setData({ starRecordsCache: updatedCache });
      
      // 重新加载数据
      this.loadStarRecords();
    },
    
    /**
     * 智能刷新数据
     * 清除所有缓存并重新加载当前月份数据，用于确保数据最新
     */
    smartRefresh: function() {
      console.log('[星星日历] 智能刷新数据');
      
      // 清除所有月份的缓存
      this.setData({ 
        starRecordsCache: {} 
      });
      
      // 重新加载当前月份数据
      this.loadStarRecords();
    }
  }
}); 