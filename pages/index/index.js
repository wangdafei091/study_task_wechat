const app = getApp()

Page({
  data: {
    userInfo: {},
    hasUserInfo: false,
    canIUse: wx.canIUse('button.open-type.getUserInfo'),
    currentMotivation: '', // 当前显示的激励语
    motivationalPhrases: [
      '坚持每一天，成就更好的自己！',
      '小习惯，大改变！',
      '今天的努力，是明天的礼物！',
      '一步一个脚印，慢慢变优秀！',
      '做最好的自己，每天进步一点点！'
    ],
    rewardProgress: {
      current: 2,
      total: 3
    },
    upcomingTask: {
      name: '新冠语文课',
      timeRemaining: 2
    },
    tasks: [
      {
        id: 1,
        type: 'clock',
        title: '独立刷牙',
        status: 0, // 0-未完成，1-已完成
        hasImage: false
      },
      {
        id: 2,
        type: 'bag',
        title: '整理书包',
        status: 0,
        hasImage: false
      },
      {
        id: 3,
        type: 'study',
        title: '数学作业',
        status: 1,
        hasImage: true
      }
    ],
    // 统计数据
    stats: {
      totalTasks: 0,
      completedTasks: 0,
      completionRate: 0,
      streak: 0, // 连续完成天数
      typeCounts: {
        clock: 0,
        bag: 0,
        study: 0
      }
    },
    showStats: false, // 是否显示统计面板

    // 搜索相关
    showSearch: false,
    searchQuery: '',
    searchResults: [],
    searchFilters: {
      type: '',
      status: '',
      dateRange: ''
    },
    
    // 任务进度
    taskProgress: {
      clock: 0,
      bag: 0,
      study: 0
    }
  },
  
  onLoad: function () {
    // 设置当前日期字符串
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const day = now.getDate()
    
    // 随机选择一条激励语
    this.setRandomMotivation()
    
    if (app.globalData.userInfo) {
      this.setData({
        userInfo: app.globalData.userInfo,
        hasUserInfo: true
      })
    } else if (this.data.canIUse) {
      app.userInfoReadyCallback = res => {
        this.setData({
          userInfo: res.userInfo,
          hasUserInfo: true
        })
      }
    } else {
      wx.getUserInfo({
        success: res => {
          app.globalData.userInfo = res.userInfo
          this.setData({
            userInfo: res.userInfo,
            hasUserInfo: true
          })
        }
      })
    }

    // 从本地存储加载任务数据
    this.loadTaskData();
  },
  
  onShow: function() {
    // 页面显示时重新加载任务数据和统计信息
    this.loadTaskData();
  },

  // 加载任务数据
  loadTaskData: function() {
    // 从本地存储或全局状态获取任务
    const app = getApp();
    const storedTasks = app.globalData.tasks;
    
    if (storedTasks && storedTasks.length > 0) {
      this.setData({
        tasks: storedTasks
      });
    }

    // 更新统计数据
    this.updateStats();
  },

  // 更新统计数据
  updateStats: function() {
    const tasks = this.data.tasks;
    const completedTasks = tasks.filter(task => task.status === 1).length;
    
    // 计算任务类型统计
    const typeCounts = {
      clock: 0,
      bag: 0,
      study: 0
    };
    
    tasks.forEach(task => {
      if (typeCounts.hasOwnProperty(task.type)) {
        typeCounts[task.type]++;
      }
    });
    
    // 计算连续完成天数（模拟数据，实际应根据历史记录计算）
    const streak = 3;
    
    const stats = {
      totalTasks: tasks.length,
      completedTasks: completedTasks,
      completionRate: tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0,
      streak: streak,
      typeCounts: typeCounts
    };
    
    this.setData({
      stats: stats,
      'rewardProgress.current': completedTasks,
      'rewardProgress.total': tasks.length
    });
    
    // 更新任务进度圆环
    this.updateTaskProgress();
  },

  // 显示统计面板
  toggleStats: function() {
    this.setData({
      showStats: !this.data.showStats
    });
  },
  
  // 获取用户信息
  getUserInfo: function (e) {
    app.globalData.userInfo = e.detail.userInfo
    this.setData({
      userInfo: e.detail.userInfo,
      hasUserInfo: true
    })
  },
  
  // 导航到用户个人资料页面
  navigateToUserProfile: function() {
    wx.showToast({
      title: '用户资料功能开发中',
      icon: 'none',
      duration: 1500
    });
  },

  // 设置随机激励语
  setRandomMotivation: function() {
    const phrases = this.data.motivationalPhrases
    const randomIndex = Math.floor(Math.random() * phrases.length)
    this.setData({
      currentMotivation: phrases[randomIndex]
    })
  },
  
  // 打开/关闭搜索面板
  toggleSearch: function() {
    const newShowSearch = !this.data.showSearch;
    
    this.setData({
      showSearch: newShowSearch,
      searchQuery: '',
      searchFilters: {
        type: '',
        status: '',
        dateRange: ''
      }
    });
    
    if (newShowSearch) {
      // 如果是打开搜索，则清空搜索结果
      this.setData({
        searchResults: []
      });
    }
  },
  
  // 输入搜索关键词
  inputSearch: function(e) {
    this.setData({
      searchQuery: e.detail.value
    });
    
    // 如果输入为空，清空搜索结果
    if (!e.detail.value.trim()) {
      this.setData({
        searchResults: []
      });
      return;
    }
    
    // 否则执行搜索
    this.performSearch();
  },
  
  // 选择搜索过滤器
  selectFilter: function(e) {
    const { type, value } = e.currentTarget.dataset;
    
    this.setData({
      [`searchFilters.${type}`]: value
    });
    
    // 执行搜索
    this.performSearch();
  },
  
  // 更新任务进度
  updateTaskProgress: function() {
    const tasks = this.data.tasks;
    const typeProgress = {
      clock: 0,
      bag: 0,
      study: 0
    };

    // 计算各类型任务的完成情况
    Object.keys(typeProgress).forEach(type => {
      const typeTasks = tasks.filter(t => t.type === type);
      const completedCount = typeTasks.filter(task => task.status === 1).length;
      typeProgress[type] = typeTasks.length > 0 
        ? Math.round((completedCount / typeTasks.length) * 100) 
        : 0;
    });

    // 使用动画更新进度
    this.animateProgress(typeProgress);
  },

  // 动画更新进度
  animateProgress: function(targetProgress) {
    const currentProgress = { ...this.data.taskProgress };
    const steps = 30; // 动画步数
    const interval = 16; // 每步时间间隔（ms）
    let step = 0;

    const animate = () => {
      if (step >= steps) {
        // 确保最终值为整数，尤其是100%
        const finalProgress = {};
        Object.keys(targetProgress).forEach(type => {
          finalProgress[type] = Math.round(targetProgress[type]);
          // 确保100值是精确的100，不是99.99或100.01
          if (finalProgress[type] > 99 && finalProgress[type] < 101) {
            finalProgress[type] = 100;
          }
        });
        this.setData({ taskProgress: finalProgress });
        return;
      }

      const progress = {};
      Object.keys(targetProgress).forEach(type => {
        const start = currentProgress[type] || 0;
        const end = targetProgress[type];
        // 使用二次缓动函数使动画更自然
        const t = step / steps;
        const easeOutQuad = 1 - (1 - t) * (1 - t);
        const current = Math.round(start + (end - start) * easeOutQuad);
        
        // 如果接近100%，确保精确值
        progress[type] = (current > 99 && current < 101 && end >= 100) ? 100 : current;
      });

      this.setData({ taskProgress: progress });
      step++;
      setTimeout(animate, interval);
    };

    animate();
  },
  
  // 圆环点击事件处理
  onRingTap: function(e) {
    const type = e.currentTarget.dataset.type;
    const typeNames = {
      bag: '整理收纳',
      clock: '生活习惯',
      study: '学习任务'
    };
    
    // 获取该类型的任务
    const tasks = this.data.tasks.filter(task => task.type === type);
    const completedTasks = tasks.filter(task => task.status === 1);
    
    wx.showToast({
      title: `${typeNames[type]}任务: ${completedTasks.length}/${tasks.length}`,
      icon: 'none',
      duration: 1500
    });
    
    // 如果有任务存在，可以导航到该类型的任务列表
    if (tasks.length > 0) {
      // 这里可以根据需求导航到任务列表并筛选特定类型
      // 例如：wx.navigateTo({ url: `/pages/taskList/taskList?type=${type}` });
      
      // 当前先简单地显示相应信息
      setTimeout(() => {
        wx.showModal({
          title: typeNames[type] + '任务',
          content: `总任务数: ${tasks.length}个\n已完成: ${completedTasks.length}个\n完成率: ${tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0}%`,
          showCancel: false,
          confirmText: '我知道了'
        });
      }, 500);
    }
  },
  
  // 执行搜索
  performSearch: function() {
    const query = this.data.searchQuery.toLowerCase().trim();
    const filters = this.data.searchFilters;
    const allTasks = app.globalData.tasks || [];
    
    // 首先基于关键词搜索
    let results = [];
    
    if (query) {
      results = allTasks.filter(task => 
        task.title.toLowerCase().includes(query) || 
        (task.description && task.description.toLowerCase().includes(query))
      );
    } else {
      // 如果没有查询词但有过滤条件，则搜索所有任务
      results = [...allTasks];
    }
    
    // 应用类型过滤
    if (filters.type) {
      results = results.filter(task => task.type === filters.type);
    }
    
    // 应用状态过滤
    if (filters.status !== '') {
      const statusValue = parseInt(filters.status);
      results = results.filter(task => task.status === statusValue);
    }
    
    // 应用日期范围过滤
    if (filters.dateRange) {
      const now = new Date();
      
      if (filters.dateRange === 'today') {
        const today = new Date().toISOString().split('T')[0];
        results = results.filter(task => task.date === today);
      } else if (filters.dateRange === 'week') {
        // 本周范围
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);
        
        results = results.filter(task => {
          if (!task.date) return false;
          const taskDate = new Date(task.date);
          return taskDate >= startOfWeek && taskDate <= endOfWeek;
        });
      } else if (filters.dateRange === 'month') {
        // 本月范围
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        results = results.filter(task => {
          if (!task.date) return false;
          const taskDate = new Date(task.date);
          return taskDate >= startOfMonth && taskDate <= endOfMonth;
        });
      }
    }
    
    console.log('搜索结果:', results);
    
    // 更新搜索结果
    this.setData({
      searchResults: results
    });
  },
  
  // 前往任务详情
  goToTaskDetail: function (e) {
    const taskId = e.detail.taskId
    wx.navigateTo({
      url: `/pages/task/task?id=${taskId}`
    })
  },
  
  // 创建新任务
  createNewTask: function () {
    wx.navigateTo({
      url: '/pages/create/create'
    })
  },
  
  // 完成任务
  completeTask: function (e) {
    const taskId = e.detail.taskId
    const tasksCopy = [...this.data.tasks]
    
    tasksCopy.forEach(task => {
      if (task.id === taskId) {
        task.status = 1
      }
    })
    
    this.setData({
      tasks: tasksCopy
    })
    
    // 更新全局数据
    const allTasks = app.globalData.tasks || [];
    allTasks.forEach(task => {
      if (task.id === taskId) {
        task.status = 1;
      }
    });
    app.globalData.tasks = allTasks;
    
    // 保存到本地存储
    wx.setStorage({
      key: 'tasks',
      data: allTasks
    });
    
    // 更新统计信息
    this.updateStats();
  },

  // 编辑任务
  editTask: function (e) {
    const taskId = e.detail.taskId
    wx.navigateTo({
      url: `/pages/task/task?id=${taskId}&edit=1`
    })
  }
}) 