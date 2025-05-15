const dateUtils = require('../../utils/dateUtils.js');
const analyticsManager = require('../../utils/analyticsManager.js');

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
    lastTouchTime: 0 // 添加触摸时间记录，用于节流
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
        getApp().globalData.eventBus.on('taskStatusChanged', this.taskStatusChangeListener);
        console.log('[星星日历] 已订阅任务状态变更事件');
      }
    },
    
    detached: function() {
      // 取消事件订阅
      if (getApp().globalData.eventBus && this.taskStatusChangeListener) {
        getApp().globalData.eventBus.off('taskStatusChanged', this.taskStatusChangeListener);
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
      
      console.log(`[星星日历] 生成了${days.length}个日历单元格`);
    },
    
    /**
     * 检查是否需要刷新缓存
     * @param {String} monthKey 月份键值，格式：YYYY-MM
     * @returns {Boolean} 是否需要刷新
     */
    checkNeedsRefresh: function(monthKey) {
      const cache = this.data.starRecordsCache[monthKey];
      if (!cache) return true; // 无缓存需要加载
      
      if (cache.needsRefresh) {
        console.log(`[星星日历] 月份 ${monthKey} 被标记为需要刷新`);
        return true;
      }
      
      const now = Date.now();
      const today = dateUtils.getTodayString();
      const cacheTime = cache.timestamp;
      
      // 历史月份完全缓存（当月之前的月份）
      const [yearStr, monthStr] = monthKey.split('-');
      const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      
      if (monthKey < currentMonth) {
        // 历史月份，缓存时间可以更长
        const historicalTimeout = 24 * 60 * 60 * 1000; // 24小时
        const needsRefresh = (now - cacheTime > historicalTimeout);
        if (needsRefresh) {
          console.log(`[星星日历] 历史月份 ${monthKey} 缓存已过期`);
        }
        return needsRefresh;
      }
      
      // 当前月份需要更细粒度检查
      // 判断该月是否包含今天
      const monthDays = cache.data || [];
      const hasTodayInMonth = monthDays.some(day => day.dateString === today);
      
      if (hasTodayInMonth) {
        // 包含今天的月份，需要较频繁更新
        const currentDayTimeout = 2 * 60 * 1000; // 2分钟
        const needsRefresh = (now - cacheTime > currentDayTimeout);
        if (needsRefresh) {
          console.log(`[星星日历] 当月 ${monthKey} 包含今天，缓存已过期`);
        }
        return needsRefresh;
      } else {
        // 未来月份
        const futureTimeout = 30 * 60 * 1000; // 30分钟
        const needsRefresh = (now - cacheTime > futureTimeout);
        if (needsRefresh) {
          console.log(`[星星日历] 未来月份 ${monthKey} 缓存已过期`);
        }
        return needsRefresh;
      }
    },
    
    /**
     * 智能刷新数据
     */
    smartRefresh: function() {
      const today = dateUtils.getTodayString();
      const currentMonthKey = `${this.data.currentYear}-${String(this.data.currentMonth + 1).padStart(2, '0')}`;
      
      // 检查是否显示当月
      const isCurrentMonthShowing = 
        this.data.currentYear === new Date().getFullYear() && 
        this.data.currentMonth === new Date().getMonth();
      
      if (isCurrentMonthShowing) {
        // 当前显示的是包含今天的月份，只更新今天的数据
        console.log('[星星日历] 显示当月，只更新今日数据');
        this.updateTodayDataOnly();
      } else if (this.checkNeedsRefresh(currentMonthKey)) {
        // 其他月份根据缓存策略决定是否需要完全刷新
        console.log(`[星星日历] 月份 ${currentMonthKey} 需要刷新`);
        this.loadStarRecords();
      } else {
        console.log(`[星星日历] 月份 ${currentMonthKey} 缓存有效，无需刷新`);
      }
    },
    
    /**
     * 仅更新今日数据
     */
    updateTodayDataOnly: function() {
      console.log('[星星日历] 仅更新今日数据');
      const today = dateUtils.getTodayString();
      const currentMonthKey = `${this.data.currentYear}-${String(this.data.currentMonth + 1).padStart(2, '0')}`;
      
      // 检查当月缓存是否存在
      if (!this.data.starRecordsCache[currentMonthKey]) {
        // 如果不存在，则加载整月数据
        console.log('[星星日历] 当月缓存不存在，加载完整数据');
        this.loadStarRecords();
        return;
      }
      
      // 设置加载状态
      this.setData({ isLoading: true });
      
      // 仅获取今天的星星数据
      analyticsManager.getTaskStarCalendarData((records) => {
        if (this.data.isLoading === false) {
          console.log('[星星日历] 加载已取消，放弃更新');
          return; // 防止重复加载导致的状态混乱
        }
        
        // 按日期分组星星记录
        const recordsByDate = analyticsManager.groupRecordsByDate(records || []);
        const todayRecords = recordsByDate[today] || [];
        
        // 只更新今天的数据
        const updatedCalendarDays = [...this.data.calendarDays];
        const todayIndex = updatedCalendarDays.findIndex(day => day.dateString === today);
        
        if (todayIndex >= 0) {
          // 更新今天的星星信息
          const day = {...updatedCalendarDays[todayIndex]};
          
          if (todayRecords.length > 0) {
            // 计算当天获得和扣除的星星
            let earned = 0;
            let deducted = 0;
            
            todayRecords.forEach(record => {
              const points = Number(record.points || 0);
              if (points > 0) {
                earned += points;
              } else if (points < 0) {
                deducted += Math.abs(points);
              }
            });
            
            // 更新星星信息
            day.starInfo = {
              earned: Number(earned),
              deducted: Number(deducted),
              records: todayRecords
            };
            
            console.log(`[星星日历] 更新今日(${today})星星: 获得=${earned}, 扣除=${deducted}`);
          } else {
            // 今天没有星星记录
            delete day.starInfo;
            console.log(`[星星日历] 今日(${today})没有星星记录`);
          }
          
          updatedCalendarDays[todayIndex] = day;
          
          // 更新缓存和界面
          const updatedCache = {...this.data.starRecordsCache};
          if (updatedCache[currentMonthKey]) {
            updatedCache[currentMonthKey].data = updatedCalendarDays;
            updatedCache[currentMonthKey].timestamp = Date.now();
            updatedCache[currentMonthKey].needsRefresh = false; // 重置刷新标志
          }
          
          // 计算是否存在星星记录
          const hasStarRecords = updatedCalendarDays.some(day => day.starInfo);
          
          this.setData({
            calendarDays: updatedCalendarDays,
            starRecordsCache: updatedCache,
            hasStarRecords: hasStarRecords,
            isLoading: false
          });
          
          console.log('[星星日历] 今日数据更新完成');
        } else {
          console.log(`[星星日历] 未找到今日(${today})单元格`);
          this.setData({ isLoading: false });
        }
      });
    },
    
    /**
     * 加载星星记录
     */
    loadStarRecords: function() {
      // 如果正在加载，避免重复加载
      if (this.data.isLoading) {
        console.log('[星星日历] 正在加载中，忽略重复请求');
        return;
      }
      
      console.log('[星星日历] 加载星星记录');
      
      // 设置当前月份的键名
      const currentMonthKey = `${this.data.currentYear}-${String(this.data.currentMonth + 1).padStart(2, '0')}`;
      
      // 检查缓存是否有效
      if (!this.checkNeedsRefresh(currentMonthKey)) {
        // 使用缓存数据
        const cachedData = this.data.starRecordsCache[currentMonthKey];
        console.log(`[星星日历] 使用缓存数据，月份: ${currentMonthKey}`);
        
        this.setData({
          calendarDays: cachedData.data,
          hasStarRecords: cachedData.hasStarRecords
        });
        
        return;
      }
      
      // 设置加载状态
      this.setData({ isLoading: true });
      
      analyticsManager.getTaskStarCalendarData((records) => {
        // 如果在数据返回时组件已被销毁或已切换月份，则忽略结果
        if (this.data.isLoading === false) {
          console.log('[星星日历] 加载已取消，放弃更新');
          return;
        }
        
        if (!records || records.length === 0) {
          console.log('[星星日历] 没有星星记录');
          
          // 更新缓存
          const updatedCache = {...this.data.starRecordsCache};
          updatedCache[currentMonthKey] = {
            timestamp: Date.now(),
            data: this.data.calendarDays,
            hasStarRecords: false,
            needsRefresh: false
          };
          
          this.setData({
            hasStarRecords: false,
            starRecordsCache: updatedCache,
            isLoading: false
          });
          return;
        }
        
        console.log(`[星星日历] 获取到${records.length}条星星记录`);
        
        // 过滤记录，只保留任务相关的星星记录
        const taskRelatedRecords = records.filter(record => {
          return record.source === 'task'; // 只保留任务相关的记录
        });
        
        console.log(`[星星日历] 过滤后任务相关记录: ${taskRelatedRecords.length}条`);
        
        // 按日期分组星星记录
        const recordsByDate = analyticsManager.groupRecordsByDate(taskRelatedRecords);
        const dateCount = Object.keys(recordsByDate).length;
        console.log(`[星星日历] 星星记录分组为${dateCount}个日期`);
        
        // 更新日历数据，添加星星信息
        const updatedCalendarDays = this.data.calendarDays.map(day => {
          const dayRecords = recordsByDate[day.dateString] || [];
          
          if (dayRecords.length > 0) {
            // 计算当天获得和扣除的星星
            let earned = 0;
            let deducted = 0;
            
            dayRecords.forEach(record => {
              const points = Number(record.points || 0);
              if (points > 0) {
                earned += points;
              } else if (points < 0) {
                deducted += Math.abs(points);
              }
            });
            
            // 仅当有星星变动时才添加信息
            if (earned > 0 || deducted > 0) {
              // 确保获得的是数字类型，强制转换
              const formattedEarned = Number(earned);
              const formattedDeducted = Number(deducted);
              
              // 复制日期对象并添加星星信息，避免引用问题
              const updatedDay = {...day};
              updatedDay.starInfo = {
                earned: formattedEarned,
                deducted: formattedDeducted,
                records: dayRecords
              };
              
              // 添加日志
              console.log(`[星星日历] ${day.dateString} 星星记录: 获得=${earned}(${typeof earned}), 扣除=${deducted}(${typeof deducted})`);
              
              return updatedDay;
            }
          }
          
          return day;
        });
        
        // 记录有星星信息的日期数量
        const daysWithStarInfo = updatedCalendarDays.filter(day => day.starInfo).length;
        console.log(`[星星日历] 共有${daysWithStarInfo}天显示星星信息`);
        
        // 判断当前月是否有星星记录
        const hasStarRecords = daysWithStarInfo > 0;
        
        // 更新缓存
        const updatedCache = {...this.data.starRecordsCache};
        updatedCache[currentMonthKey] = {
          timestamp: Date.now(),
          data: updatedCalendarDays,
          hasStarRecords: hasStarRecords,
          needsRefresh: false
        };
        
        this.setData({
          calendarDays: updatedCalendarDays,
          hasStarRecords: hasStarRecords,
          starRecordsCache: updatedCache,
          isLoading: false
        });
        
        console.log('[星星日历] 星星记录加载完成，当前月' + (hasStarRecords ? '有' : '没有') + '星星记录');
      });
    },
    
    /**
     * 切换到上个月
     */
    prevMonth: function() {
      // 如果正在加载数据，忽略用户操作
      if (this.data.isLoading) {
        console.log('[星星日历] 正在加载数据，忽略月份切换');
        return;
      }
      
      let year = this.data.currentYear;
      let month = this.data.currentMonth;
      
      month--;
      if (month < 0) {
        month = 11;
        year--;
      }
      
      this.setData({
        currentYear: year,
        currentMonth: month,
        isLoading: false // 重置加载状态
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
      // 如果正在加载数据，忽略用户操作
      if (this.data.isLoading) {
        console.log('[星星日历] 正在加载数据，忽略月份切换');
        return;
      }
      
      let year = this.data.currentYear;
      let month = this.data.currentMonth;
      
      month++;
      if (month > 11) {
        month = 0;
        year++;
      }
      
      this.setData({
        currentYear: year,
        currentMonth: month,
        isLoading: false // 重置加载状态
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
      // 如果正在加载数据，忽略用户操作
      if (this.data.isLoading) {
        console.log('[星星日历] 正在加载数据，忽略跳转今天');
        return;
      }
      
      const today = new Date();
      
      this.setData({
        currentYear: today.getFullYear(),
        currentMonth: today.getMonth(),
        selectedDate: dateUtils.formatDate(today),
        isLoading: false // 重置加载状态
      });
      
      this.updateMonthTitle();
      this.generateCalendarDays();
      this.loadStarRecords();
      
      console.log('[星星日历] 返回今天');
    },
    
    /**
     * 触摸开始事件 - 用于左右滑动切换月份
     */
    touchStart: function(e) {
      // 记录触摸开始时间，用于节流
      const now = Date.now();
      this.setData({
        touchStartX: e.changedTouches[0].clientX,
        lastTouchTime: now
      });
    },
    
    /**
     * 触摸结束事件 - 用于左右滑动切换月份
     */
    touchEnd: function(e) {
      // 如果正在加载数据，忽略用户操作
      if (this.data.isLoading) {
        console.log('[星星日历] 正在加载数据，忽略滑动操作');
        return;
      }
      
      // 节流处理：如果距离上次触摸结束时间太短，则忽略
      const now = Date.now();
      if (now - this.data.lastTouchTime < 300) {
        console.log('[星星日历] 触摸事件太频繁，忽略此次操作');
        return;
      }
      
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
        
        // 更新最后触摸时间
        this.setData({ lastTouchTime: now });
      }
    }
  }
}) 