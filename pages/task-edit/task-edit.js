const app = getApp();

Page({
  /**
   * 页面的初始数据
   */
  data: {
    allTasks: [],
    heatmapYear: new Date().getFullYear(),
    heatmapMonthIndex: new Date().getMonth(),
    heatmapMonth: '',
    isDemoData: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function(options) {
    console.log('[TaskEdit] 页面加载');
    
    // 初始化热力图月份
    this.initHeatmapMonth();
    
    // 加载所有任务
    this.loadAllTasks();
    
    // 如果URL参数中指定了演示模式，自动生成演示数据
    if (options.demo === 'true') {
      console.log('[TaskEdit] 自动加载演示数据');
      // 延迟300ms生成演示数据，确保热力图组件已初始化
      setTimeout(() => {
        this.generateDemoData();
      }, 300);
    }
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function() {
    console.log('[task-edit] 页面显示，刷新任务数据');
    
    // 刷新任务数据
    this.loadAllTasks();
  },

  /**
   * 加载所有任务数据
   */
  loadAllTasks: function() {
    console.log('[TaskEdit] 加载所有任务数据');
    
    wx.getStorage({
      key: 'taskData',
      success: res => {
        const tasks = res.data || [];
        this.setData({
          allTasks: tasks
        });
        console.log('[TaskEdit] 成功加载任务数据，数量:', tasks.length);
      },
      fail: err => {
        console.error('[TaskEdit] 加载任务数据失败:', err);
        this.setData({
          allTasks: []
        });
      }
    });
  },

  /**
   * 初始化热力图月份信息
   */
  initHeatmapMonth: function() {
    const now = new Date();
    const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', 
                      '七月', '八月', '九月', '十月', '十一月', '十二月'];
    
    this.setData({
      heatmapYear: now.getFullYear(),
      heatmapMonthIndex: now.getMonth(),
      heatmapMonth: `${now.getFullYear()}年${monthNames[now.getMonth()]}`
    });
    
    console.log('[TaskEdit] 初始化热力图月份:', this.data.heatmapMonth);
  },

  /**
   * 热力图月份变化事件处理
   */
  onHeatmapMonthChange: function(e) {
    console.log('[TaskEdit] 热力图月份变化:', e.detail);
    
    this.setData({
      heatmapYear: e.detail.year,
      heatmapMonthIndex: e.detail.month,
      heatmapMonth: `${e.detail.year}年${e.detail.monthName}`
    });
  },

  /**
   * 切换到上个月
   */
  prevHeatmapMonth: function() {
    // 获取热力图组件实例
    const heatmap = this.selectComponent('#taskHeatmap');
    if (heatmap) {
      heatmap.prevMonth();
    }
  },

  /**
   * 切换到下个月
   */
  nextHeatmapMonth: function() {
    // 获取热力图组件实例
    const heatmap = this.selectComponent('#taskHeatmap');
    if (heatmap) {
      heatmap.nextMonth();
    }
  },

  /**
   * 处理热力图日期选择事件
   */
  onHeatmapDaySelect: function(e) {
    console.log('[TaskEdit] 热力图日期选择:', e.detail);
    
    // 日期选择事件由热力图组件内部处理，这里可以添加额外的业务逻辑
    // 例如记录最近查看的日期，或者与其他组件联动
    
    // 如果需要，可以通过以下方式获取热力图组件实例
    // const heatmap = this.selectComponent('#taskHeatmap');
  },

  /**
   * 生成演示用的假数据
   */
  generateDemoData: function() {
    console.log('[TaskEdit] 生成热力图演示数据');
    
    // 获取当前月份和年份
    const now = new Date();
    const currentYear = this.data.heatmapYear || now.getFullYear();
    const currentMonth = this.data.heatmapMonthIndex || now.getMonth();
    
    // 获取当月天数
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    // 创建任务示例数据数组
    const demoTasks = [];
    
    // 生成当月随机任务数据 - 不同密度的热点
    // 高密度区域 (10-15天)
    const highDensityDay = Math.floor(Math.random() * 15) + 10;
    // 中密度区域 (20-25天)
    const mediumDensityDay = Math.floor(Math.random() * 5) + 20;
    
    // 遍历当月所有天数
    for (let day = 1; day <= daysInMonth; day++) {
      // 格式化日期
      const date = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      // 根据日期生成不同数量的任务
      let taskCount = 0;
      
      if (day === highDensityDay) {
        // 高密度日期 - 7-10个任务
        taskCount = Math.floor(Math.random() * 4) + 7;
      } else if (day === mediumDensityDay) {
        // 中密度日期 - 4-6个任务
        taskCount = Math.floor(Math.random() * 3) + 4;
      } else if (day % 3 === 0) {
        // 每3天出现的规律 - 2-3个任务
        taskCount = Math.floor(Math.random() * 2) + 2;
      } else if (day % 2 === 0) {
        // 每2天出现的规律 - 1个任务
        taskCount = 1;
      } else if (Math.random() > 0.6) {
        // 随机日期 - 40%的概率有1个任务
        taskCount = 1;
      }
      
      // 生成指定数量的任务
      for (let i = 0; i < taskCount; i++) {
        const task = {
          id: `demo-${date}-${i}`,
          title: `演示任务 ${i+1}`,
          date: date,
          // 50%概率完成状态
          status: Math.random() > 0.5 ? 1 : 0,
          category: ['study', 'habit', 'interest'][Math.floor(Math.random() * 3)]
        };
        
        demoTasks.push(task);
      }
    }
    
    // 添加过去和未来月份的一些数据点
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    
    // 添加上个月的几个任务
    for (let i = 25; i <= 30; i++) {
      if (Math.random() > 0.5) {
        const date = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const taskCount = Math.floor(Math.random() * 2) + 1;
        
        for (let j = 0; j < taskCount; j++) {
          demoTasks.push({
            id: `demo-prev-${date}-${j}`,
            title: `上月任务 ${j+1}`,
            date: date,
            status: Math.random() > 0.7 ? 1 : 0, // 上个月大部分任务已完成
            category: ['study', 'habit', 'interest'][Math.floor(Math.random() * 3)]
          });
        }
      }
    }
    
    // 添加下个月的几个任务
    for (let i = 1; i <= 5; i++) {
      if (Math.random() > 0.7) {
        const date = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        
        demoTasks.push({
          id: `demo-next-${date}-0`,
          title: `下月任务`,
          date: date,
          status: 0, // 下个月的任务都未完成
          category: ['study', 'habit', 'interest'][Math.floor(Math.random() * 3)]
        });
      }
    }
    
    console.log('[TaskEdit] 生成演示数据完成，任务总数:', demoTasks.length);
    
    // 更新页面数据
    this.setData({
      allTasks: demoTasks,
      isDemoData: true
    });
    
    // 显示提示
    wx.showToast({
      title: `已生成${demoTasks.length}条演示数据`,
      icon: 'none',
      duration: 2000
    });
  },

  /**
   * 重置演示数据
   */
  resetDemoData: function() {
    if (this.data.isDemoData) {
      this.loadAllTasks();
      this.setData({ isDemoData: false });
      
      wx.showToast({
        title: '已恢复真实数据',
        icon: 'none',
        duration: 2000
      });
    }
  }
}) 