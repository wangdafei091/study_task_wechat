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
      current: 60,
      total: 100
    },
    upcomingTask: {
      name: '新冠语文课',
      timeRemaining: 2
    },
    tasks: [],
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
    statsClosing: false, // 统计面板是否正在关闭中

    // 搜索相关
    showSearch: false,
    searchQuery: '',
    searchResults: [],
    searchFilters: {
      type: '',
      status: '',
      dateRange: ''
    },
    searchClosing: false,
    filterAnimation: {}, // 用于存储筛选器动画数据
    
    // 任务进度
    taskProgress: {
      clock: 0,
      bag: 0,
      study: 0
    },
    ringSize: 'medium', // 新增圆环尺寸类名
    typeRingSizes: {},   // 各类型圆环大小

    // 消息中心相关
    showMessagePreview: false, // 是否显示消息预览
    messagePreviewClosing: false, // 消息预览是否正在关闭中
    messages: [], // 消息列表
    unreadCount: 0, // 未读消息数量
    messageAnimation: null, // 消息预览动画实例

    // 浮动菜单状态
    showFloatMenu: false,
    
    // 浮动菜单项配置
    menuItems: [
      {
        id: 'study',
        type: 'study-task',
        icon: '📚',
        label: '学习',
        ariaLabel: '创建学习任务'
      },
      {
        id: 'habit',
        type: 'habit-task',
        icon: '⏰',
        label: '习惯',
        ariaLabel: '创建习惯任务'
      }
    ]
  },
  
  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    // 默认任务列表
    const app = getApp();
    
    // 设置当前日期字符串
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    
    // 设置随机的鼓励语
    this.setRandomMotivation();
    
    // 从全局数据或本地存储获取任务列表
    if (app.globalData.tasks && app.globalData.tasks.length > 0) {
      this.setData({
        tasks: app.globalData.tasks
      });
    } else {
      // 从本地存储加载任务数据
      this.loadTaskData();
    }
    
    // 初始化各类别任务完成率
    this.updateStats();
    
    // 加载消息数据
    this.loadMessageData();
    
    // 初始化消息预览动画实例
    this.messageAnimation = wx.createAnimation({
      duration: 250,
      timingFunction: 'ease-out',
      delay: 0
    });
    
    // 检查用户信息
    if (app.globalData.userInfo) {
      this.setData({
        userInfo: app.globalData.userInfo,
        hasUserInfo: true
      });
    } else if (this.data.canIUse) {
      // 由于 getUserInfo 是网络请求，可能会在 Page.onLoad 之后才返回
      // 所以此处加入 callback 以防止这种情况
      app.userInfoReadyCallback = res => {
        this.setData({
          userInfo: res.userInfo,
          hasUserInfo: true
        });
      };
    }
  },
  
  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    // 从本地存储重新加载任务数据
    this.loadTaskData();
    
    // 重新计算任务统计数据
    this.updateStats();
    
    // 刷新消息数据
    this.loadMessageData();
  },

  // 从本地存储加载任务数据
  loadTaskData: function() {
    const app = getApp();
    
    // 获取今天的日期字符串，确保格式一致（YYYY-MM-DD）
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
    console.log('今日日期:', todayStr);
    
    wx.getStorage({
      key: 'taskData',
      success: (res) => {
        if (res.data && res.data.length > 0) {
          // 确保每个任务都有duration属性
          const allTasks = res.data.map(task => {
            if (!task.hasOwnProperty('duration')) {
              // 根据任务类型设置默认持续时间
              switch(task.type) {
                case 'clock': 
                  task.duration = 10; // 生活习惯类默认10分钟
                  break;
                case 'bag':
                  task.duration = 20; // 整理收纳类默认20分钟
                  break;
                case 'study':
                  task.duration = 60; // 学习任务默认60分钟
                  break;
                default:
                  task.duration = 30; // 其他类型默认30分钟
              }
            }
            return task;
          });
          
          // 筛选今天的任务
          const todayTasks = allTasks.filter(task => {
            // 确保日期格式一致性
            if (!task.date) return false;
            
            // 如果任务的日期等于今天的日期，则包括该任务
            return task.date === todayStr;
          });
          
          console.log('所有任务数:', allTasks.length);
          console.log('今日任务数:', todayTasks.length);
          
          // 设置任务列表为今日任务
          this.setData({ tasks: todayTasks });
          
          // 全局任务数据保存所有任务
          app.globalData.tasks = allTasks;
          
          // 更新统计和圆环尺寸
          this.updateStats();
        }
      },
      fail: () => {
        // 如果本地没有存储数据，使用默认任务列表
        app.globalData.tasks = this.data.tasks;
        this.saveTaskData();
      }
    });
  },
  
  // 保存任务数据到本地存储
  saveTaskData: function() {
    const app = getApp();
    const tasks = this.data.tasks;
    
    // 更新全局数据
    app.globalData.tasks = tasks;
    
    // 存储到本地
    wx.setStorage({
      key: 'taskData',
      data: tasks,
      success: () => {
        console.log('任务数据保存成功');
      },
      fail: (error) => {
        console.error('保存任务数据失败：', error);
      }
    });
  },

  // 更新统计信息
  updateStats: function() {
    const tasks = this.data.tasks; // 现在只包含今日任务
    const allTasks = app.globalData.tasks || []; // 所有任务
    
    // 计算完成任务数量
    const completedTasks = tasks.filter(task => task.status === 1);
    const totalTasks = tasks.length; // 今日任务总数
    
    // 计算各类型任务的完成百分比
    const calculateProgress = (type) => {
      const typeTasks = tasks.filter(task => task.type === type);
      if (typeTasks.length === 0) return 0;
      
      const typeCompleted = typeTasks.filter(task => task.status === 1).length;
      return Math.round((typeCompleted / typeTasks.length) * 100);
    };
    
    // 计算各类型任务数量
    const countTasksByType = {
      clock: tasks.filter(task => task.type === 'clock').length,
      bag: tasks.filter(task => task.type === 'bag').length,
      study: tasks.filter(task => task.type === 'study').length
    };
    
    // 更新进度圆环数据
    this.setData({
      'taskProgress.clock': calculateProgress('clock'),
      'taskProgress.bag': calculateProgress('bag'),
      'taskProgress.study': calculateProgress('study'),
      'stats.completedTasks': completedTasks.length,
      'stats.totalTasks': totalTasks,
      'stats.completionRate': totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0,
      'rewardProgress.current': completedTasks.length,
      'rewardProgress.total': totalTasks,
      'stats.typeCounts': countTasksByType
    });
  },

  // 显示/隐藏统计面板
  toggleStats: function() {
    const currentState = this.data.showStats;
    
    // 如果当前是隐藏状态（即将显示统计），触发小黄鸡动画
    if (!currentState) {
      const progressBar = this.selectComponent('#progressBar');
      if (progressBar) {
        progressBar.playAnimation('stats');
      }
    }
    
    if (currentState) {
      // 当前是显示状态，添加一个关闭中的状态，用于触发CSS动画
      this.setData({
        statsClosing: true
      });
      
      // 动画结束后再隐藏元素
      setTimeout(() => {
        this.setData({
          showStats: false,
          statsClosing: false
        });
      }, 280); // 略小于动画时间
    } else {
      // 当前是隐藏状态，直接显示
      this.setData({
        showStats: true,
        statsClosing: false
      });
    }
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
    
    if (!newShowSearch) {
      // 当前是显示状态，需要添加关闭动画
      this.setData({
        searchClosing: true
      });
      
      // 动画结束后再隐藏元素
      setTimeout(() => {
        this.setData({
          showSearch: false,
          searchClosing: false
        });
      }, 250); // 与CSS动画时长匹配
      
      return;
    }
    
    // 触发小黄鸡动画效果
    if (newShowSearch) {
      const progressBar = this.selectComponent('#progressBar');
      if (progressBar) {
        progressBar.playAnimation('search');
      }
    }
    
    this.setData({
      showSearch: newShowSearch,
      searchQuery: '',
      searchResults: [],
      searchFilters: {
        type: '',
        status: '',
        dateRange: 'today'
      }
    });
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
    const previousValue = this.data.searchFilters[type];
    
    // 如果选择了相同值，则取消选择
    const newValue = previousValue === value ? '' : value;
    
    // 创建动画效果
    const animation = wx.createAnimation({
      duration: 200,
      timingFunction: 'ease-out'
    });
    
    // 设置动画：轻微缩放效果，改为背景色变化
    animation.scale(1.02).backgroundColor('rgba(66, 133, 244, 0.15)').step();
    animation.scale(1.0).backgroundColor('rgba(66, 133, 244, 0.1)').step();
    
    // 应用动画到对应元素（通过自定义属性）
    const animationData = {};
    animationData[`filterAnimation.${type}.${value}`] = animation.export();
    
    this.setData({
      [`searchFilters.${type}`]: newValue,
      ...animationData
    });
    
    // 轻微振动反馈
    if (wx.vibrateShort) {
      wx.vibrateShort({ type: 'light' });
    }
    
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
    // 兼容原始实现和新组件实现
    // 如果是从新组件传递过来的，e.detail中会有type
    // 如果是从旧的实现传递过来的，从dataset中获取type
    const type = e.detail && e.detail.type ? e.detail.type : e.currentTarget.dataset.type;
    
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
  
  // 奖励完成事件处理
  onRewardComplete: function() {
    // 震动效果增强体验
    setTimeout(() => {
      if (wx.vibrateShort) {
        wx.vibrateShort({
          type: 'medium'
        });
      }
    }, 300);
    
    // 触发小黄鸡的庆祝动画
    const progressBar = this.selectComponent('#progressBar');
    if (progressBar) {
      progressBar.playAnimation('complete');
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
    
    // 使用动画呈现搜索结果
    this.animateSearchResults(results);
  },
  
  // 搜索结果动画显示
  animateSearchResults: function(results) {
    if (results.length === 0) {
      this.setData({ searchResults: [] });
      return;
    }
    
    // 先一次性设置所有结果，但通过CSS动画和不同的延迟显示动画效果
    this.setData({
      searchResults: results.map((item, index) => ({
        ...item,
        // 添加动画延迟属性，索引越大延迟越长
        animationDelay: `${index * 50}ms`
      }))
    });
  },
  
  // 前往任务详情
  goToTaskDetail: function (e) {
    // 已禁用：不再跳转到任务详情页
    // const taskId = e.detail.taskId
    // wx.navigateTo({
    //   url: `/pages/task/task?id=${taskId}`
    // })
    console.log('任务详情功能已禁用');
  },
  
  // 切换浮动菜单
  toggleFloatMenu: function() {
    // 震动反馈
    if (wx.vibrateShort) {
      wx.vibrateShort({ type: 'light' });
    }
    
    this.setData({
      showFloatMenu: !this.data.showFloatMenu
    });
  },
  
  // 创建学习型任务
  createStudyTask: function() {
    // 震动反馈
    if (wx.vibrateShort) {
      wx.vibrateShort({ type: 'medium' });
    }
    
    // 关闭浮动菜单
    this.setData({
      showFloatMenu: false
    });
    
    // 跳转到任务编辑页面，并传入类型参数
    wx.navigateTo({
      url: '/pages/task-edit/task-edit?taskType=study&precision=second'
    });
  },
  
  // 创建习惯型任务
  createHabitTask: function() {
    // 震动反馈
    if (wx.vibrateShort) {
      wx.vibrateShort({ type: 'medium' });
    }
    
    // 关闭浮动菜单
    this.setData({
      showFloatMenu: false
    });
    
    // 跳转到任务编辑页面，并传入类型参数
    wx.navigateTo({
      url: '/pages/task-edit/task-edit?taskType=habit&precision=day'
    });
  },
  
  // 创建新任务（保留原有方法作为备用，确保兼容性）
  createNewTask: function() {
    // 将行为改为打开浮动菜单
    this.toggleFloatMenu();
  },
  
  // 编辑任务
  editTask: function(e) {
    const taskId = e.detail.taskId || e.detail;
    
    if (taskId) {
      wx.navigateTo({
        url: `/pages/task-edit/task-edit?mode=edit&taskId=${taskId}`
      });
    }
  },

  // 完成任务
  completeTask: function(e) {
    const id = e.detail.taskId;
    console.log('完成任务:', id);
    
    // 更新任务状态
    const tasks = this.data.tasks.map(task => {
      if (task.id === id) {
        // 如果当前状态是0(未完成)，则设置为1(已完成)
        const newStatus = task.status === 0 ? 1 : 0;
        
        // 如果是刚完成任务，触发小黄鸡庆祝动画
        if (newStatus === 1) {
          setTimeout(() => {
            const progressBar = this.selectComponent('#progressBar');
            if (progressBar) {
              progressBar.playAnimation('complete');
            }
          }, 300);
        }
        
        return { ...task, status: newStatus };
      }
      return task;
    });
    
    this.setData({ tasks });
    
    // 更新全局任务数据
    app.globalData.tasks = tasks;
    
    // 更新统计信息
    this.updateStats();
    
    // 保存数据
    this.saveTaskData();
    
    // 注释: 已移除完成任务提示，让用户体验更加流畅
  },
  
  // 根据任务数量动态调整圆环大小
  adjustRingSize: function() {
    const tasks = this.data.tasks;
    
    // 计算当日任务总耗时（分钟）
    const totalDuration = tasks.reduce((sum, task) => {
      // 只计算未完成的任务耗时
      return task.status === 0 ? sum + (task.duration || 0) : sum;
    }, 0);
    
    // 获取各类型任务数量和耗时
    const taskCounts = {
      clock: 0,
      bag: 0,
      study: 0
    };
    
    const typeDurations = {
      clock: 0,
      bag: 0,
      study: 0
    };
    
    tasks.forEach(task => {
      if (taskCounts.hasOwnProperty(task.type)) {
        // 只计算未完成的任务
        if (task.status === 0) {
          taskCounts[task.type]++;
          typeDurations[task.type] += (task.duration || 0);
        }
      }
    });
    
    // 根据任务总耗时确定圆环大小
    let ringSize;
    
    if (totalDuration >= 120) {  // 2小时或以上
      ringSize = 'large';
    } else if (totalDuration >= 60) {  // 1-2小时
      ringSize = 'medium-large';
    } else if (totalDuration >= 30) {  // 30-60分钟
      ringSize = 'medium';
    } else {
      ringSize = 'small';  // 基础大小，小于30分钟
    }
    
    // 为每个类型设置单独的圆环大小
    const typeRingSizes = {};
    
    Object.keys(typeDurations).forEach(type => {
      const duration = typeDurations[type];
      
      if (duration >= 90) {
        typeRingSizes[type] = 'large';
      } else if (duration >= 45) {
        typeRingSizes[type] = 'medium-large';
      } else if (duration >= 20) {
        typeRingSizes[type] = 'medium';
      } else {
        typeRingSizes[type] = 'small';
      }
    });
    
    // 只有当尺寸真正变化时才更新状态
    if (this.data.ringSize !== ringSize || 
        JSON.stringify(this.data.typeRingSizes || {}) !== JSON.stringify(typeRingSizes)) {
      this.setData({
        ringSize: ringSize,
        typeRingSizes: typeRingSizes
      });
    }
  },

  // 清除搜索过滤器
  clearFilters: function() {
    // 应用动画到所有当前选中的筛选器
    const animation = wx.createAnimation({
      duration: 200,
      timingFunction: 'ease-in'
    });
    
    // 更平滑的动画效果
    animation.scale(0.98).opacity(0.7).step();
    animation.scale(1.0).opacity(1.0).step();
    
    const animationData = animation.export();
    const currentFilters = this.data.searchFilters;
    const filterAnimation = {};
    
    // 为所有当前选中的筛选器添加动画
    if (currentFilters.type) {
      filterAnimation[`filterAnimation.type.${currentFilters.type}`] = animationData;
    }
    if (currentFilters.status !== '') {
      filterAnimation[`filterAnimation.status.${currentFilters.status}`] = animationData;
    }
    if (currentFilters.dateRange) {
      filterAnimation[`filterAnimation.dateRange.${currentFilters.dateRange}`] = animationData;
    }
    
    // 首先应用动画
    this.setData(filterAnimation);
    
    // 轻微振动反馈
    if (wx.vibrateShort) {
      wx.vibrateShort({ type: 'light' });
    }
    
    // 稍微延迟后清除过滤器
    setTimeout(() => {
      this.setData({
        searchFilters: {
          type: '',
          status: '',
          dateRange: ''
        }
      });
      
      // 执行搜索
      this.performSearch();
    }, 200);
  },

  // 显示/隐藏消息预览
  toggleMessagePreview: function() {
    const currentState = this.data.showMessagePreview;
    
    if (currentState) {
      // 创建关闭动画
      this.messageAnimation.opacity(0).scale(0.95).translateY(-10).step();
      
      this.setData({
        messageAnimation: this.messageAnimation.export()
      });
      
      // 动画结束后再隐藏元素
      setTimeout(() => {
        this.setData({
          showMessagePreview: false
        });
      }, 250);
    } else {
      // 重置动画初始状态
      this.messageAnimation.opacity(0).scale(0.95).translateY(-10).step({ duration: 0 });
      
      this.setData({
        showMessagePreview: true,
        messageAnimation: this.messageAnimation.export(),
        showSearch: false, // 确保搜索面板关闭
        showStats: false   // 确保统计面板关闭
      });
      
      // 添加一个短暂延时，确保视图更新后再开始动画
      setTimeout(() => {
        this.messageAnimation.opacity(1).scale(1).translateY(0).step();
        
        this.setData({
          messageAnimation: this.messageAnimation.export()
        });
      }, 30);
    }
  },

  // 从本地存储加载消息数据
  loadMessageData: function() {
    wx.getStorage({
      key: 'messageData',
      success: (res) => {
        if (res.data && res.data.length > 0) {
          // 处理消息时间显示
          const messages = res.data.map(msg => {
            return {
              ...msg,
              timeDisplay: this.formatMessageTime(msg.timestamp)
            };
          });
          
          // 计算未读消息数量
          const unreadCount = messages.filter(msg => !msg.isRead).length;
          
          this.setData({ 
            messages,
            unreadCount
          });
        } else {
          // 如果没有消息，设置默认示例消息
          this.setDefaultMessages();
        }
      },
      fail: () => {
        // 加载失败，设置默认示例消息
        this.setDefaultMessages();
      }
    });
  },
  
  // 设置默认示例消息
  setDefaultMessages: function() {
    const now = Date.now();
    const messages = [
      {
        id: 'msg_' + (now - 3600000),
        type: 'task',
        title: '任务即将到期',
        summary: '您有一个"语文作业"任务将在1小时后到期',
        timestamp: now - 3600000,
        isRead: false,
        icon: '⏰'
      },
      {
        id: 'msg_' + (now - 86400000),
        type: 'achievement',
        title: '完成连续学习3天',
        summary: '恭喜你已经连续学习3天了，再接再厉！',
        timestamp: now - 86400000,
        isRead: true,
        icon: '🏆'
      },
      {
        id: 'msg_' + (now - 172800000),
        type: 'system',
        title: '新功能上线',
        summary: '消息中心功能已上线，现在可以接收任务提醒和成就通知了',
        timestamp: now - 172800000,
        isRead: true,
        icon: '🔔'
      }
    ];
    
    // 计算未读消息数量
    const unreadCount = messages.filter(msg => !msg.isRead).length;
    
    // 格式化消息时间显示
    const formattedMessages = messages.map(msg => {
      return {
        ...msg,
        timeDisplay: this.formatMessageTime(msg.timestamp)
      };
    });
    
    this.setData({
      messages: formattedMessages,
      unreadCount
    });
    
    // 保存到本地存储
    wx.setStorage({
      key: 'messageData',
      data: messages
    });
  },
  
  // 格式化消息时间显示
  formatMessageTime: function(timestamp) {
    const now = new Date();
    const msgDate = new Date(timestamp);
    const diffMinutes = Math.floor((now - msgDate) / (60 * 1000));
    
    if (diffMinutes < 1) {
      return '刚刚';
    } else if (diffMinutes < 60) {
      return `${diffMinutes}分钟前`;
    } else if (diffMinutes < 24 * 60) {
      const hours = Math.floor(diffMinutes / 60);
      return `${hours}小时前`;
    } else if (diffMinutes < 30 * 24 * 60) {
      const days = Math.floor(diffMinutes / (24 * 60));
      return `${days}天前`;
    } else {
      const year = msgDate.getFullYear();
      const month = (msgDate.getMonth() + 1).toString().padStart(2, '0');
      const day = msgDate.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  },
  
  // 查看消息详情
  viewMessageDetail: function(e) {
    const messageId = e.currentTarget.dataset.id;
    const messages = this.data.messages;
    const messageIndex = messages.findIndex(m => m.id === messageId);
    
    if (messageIndex > -1) {
      // 标记该消息为已读
      if (!messages[messageIndex].isRead) {
        messages[messageIndex].isRead = true;
        const unreadCount = this.data.unreadCount - 1;
        
        this.setData({
          messages,
          unreadCount
        });
        
        // 更新本地存储
        wx.setStorage({
          key: 'messageData',
          data: messages
        });
      }
      
      // 根据消息类型处理不同的导航逻辑
      const message = messages[messageIndex];
      switch (message.type) {
        case 'task':
          // 如果有关联任务ID，导航到该任务详情
          if (message.taskId) {
            wx.navigateTo({
              url: `/pages/task/task?id=${message.taskId}`
            });
          }
          break;
        case 'achievement':
          // 导航到奖励页面
          wx.switchTab({
            url: '/pages/rewards/rewards'
          });
          break;
        default:
          // 显示消息内容
          wx.showModal({
            title: message.title,
            content: message.summary,
            showCancel: false
          });
      }
    }
  },
  
  // 标记所有消息为已读
  markAllAsRead: function() {
    const messages = this.data.messages.map(msg => ({
      ...msg,
      isRead: true
    }));
    
    this.setData({
      messages,
      unreadCount: 0
    });
    
    // 更新本地存储
    wx.setStorage({
      key: 'messageData',
      data: messages,
      success: () => {
        wx.showToast({
          title: '全部已读',
          icon: 'success',
          duration: 1500
        });
      }
    });
  },
  
  // 导航到消息中心完整页面
  navigateToMessageCenter: function() {
    // 关闭消息预览
    this.toggleMessagePreview();
    
    // 导航到消息中心页面
    // 注意：这个页面目前还不存在，需要创建
    wx.navigateTo({
      url: '/pages/message/message'
    });
  },

  // 处理菜单项点击
  handleMenuItemTap: function(e) {
    const item = e.detail.item;
    
    // 根据菜单项ID执行不同的操作
    switch(item.id) {
      case 'study':
        this.createStudyTask();
        break;
      case 'habit':
        this.createHabitTask();
        break;
      default:
        console.log('未知菜单项:', item.id);
    }
  },
  
  // 处理菜单状态变化
  handleMenuStateChange: function(e) {
    this.setData({
      showFloatMenu: e.detail.isOpen
    });
  },

  // 计算任务进度
  calculateTaskProgress: function() {
    const tasks = this.data.tasks;
    const completedTasks = tasks.filter(task => task.status === 1);
    const totalTasks = tasks.length; // 今日任务总数
    
    // 计算各类型任务的完成百分比
    const calculateProgress = (type) => {
      const typeTasks = tasks.filter(task => task.type === type);
      if (typeTasks.length === 0) return 0;
      
      const typeCompleted = typeTasks.filter(task => task.status === 1).length;
      return Math.round((typeCompleted / typeTasks.length) * 100);
    };
    
    // 计算各类型任务数量
    const countTasksByType = {
      clock: tasks.filter(task => task.type === 'clock').length,
      bag: tasks.filter(task => task.type === 'bag').length,
      study: tasks.filter(task => task.type === 'study').length
    };
    
    // 更新进度圆环数据
    this.setData({
      'taskProgress.clock': calculateProgress('clock'),
      'taskProgress.bag': calculateProgress('bag'),
      'taskProgress.study': calculateProgress('study'),
      'stats.completedTasks': completedTasks.length,
      'stats.totalTasks': totalTasks,
      'stats.completionRate': totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0,
      'rewardProgress.current': completedTasks.length,
      'rewardProgress.total': totalTasks,
      'stats.typeCounts': countTasksByType
    });
  },

  updateDailyTasks: function(date) {
    // 获取所有任务
    const allTasks = app.globalData.tasks || [];
    
    // 筛选出选定日期的任务
    const selectedDate = date || this.data.selectedDate || formatDate(new Date());
    const todayTasks = allTasks.filter(task => task.date === selectedDate);
    
    // 按开始时间排序
    todayTasks.sort((a, b) => {
      if (a.startTime && b.startTime) {
        return a.startTime.localeCompare(b.startTime);
      }
      return 0;
    });
    
    this.setData({
      tasks: todayTasks,
      selectedDate: selectedDate
    });
    
    // 计算任务进度
    this.calculateTaskProgress();
  },
}) 