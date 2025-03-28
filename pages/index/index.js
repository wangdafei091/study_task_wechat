const app = getApp()

Page({
  data: {
    userInfo: {},
    hasUserInfo: false,
    canIUse: wx.canIUse('button.open-type.getUserInfo'),
    currentWeek: [],
    selectedDate: '',
    weekDays: ['日', '一', '二', '三', '四', '五', '六'],
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
    ]
  },
  onLoad: function () {
    this.initWeekDays()
    this.setCurrentDate()
    
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
  },
  
  // 获取用户信息
  getUserInfo: function (e) {
    app.globalData.userInfo = e.detail.userInfo
    this.setData({
      userInfo: e.detail.userInfo,
      hasUserInfo: true
    })
  },
  
  // 初始化周视图
  initWeekDays: function () {
    const now = new Date()
    const currentDay = now.getDay() // 0 是周日
    const currentDate = now.getDate()
    
    const week = []
    for (let i = 0; i < 7; i++) {
      const dayOffset = i - currentDay
      const date = new Date(now)
      date.setDate(currentDate + dayOffset)
      
      week.push({
        date: date.getDate(),
        day: i,
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        isToday: i === currentDay,
        hasTask: i === 1 || i === 2 || i === 4
      })
    }
    
    this.setData({
      currentWeek: week
    })
  },
  
  // 设置当前选中日期
  setCurrentDate: function () {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const day = now.getDate()
    
    this.setData({
      selectedDate: `${year}年${month}月第13周`
    })
  },
  
  // 选择日期
  selectDate: function (e) {
    const index = e.detail.index
    const weekCopy = [...this.data.currentWeek]
    
    weekCopy.forEach((day, i) => {
      day.isSelected = i === index
    })
    
    this.setData({
      currentWeek: weekCopy
    })
    
    // 这里可以加载对应日期的任务
  },
  
  // 切换周视图
  changeWeek: function (e) {
    const direction = e.detail.direction
    // 这里可以根据direction加载上一周或下一周的数据
    console.log('切换周视图:', direction)
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
    
    // 更新奖励进度
    let current = this.data.rewardProgress.current
    const total = this.data.rewardProgress.total
    
    if (current < total) {
      current++
      this.setData({
        'rewardProgress.current': current
      })
    }
  },

  // 编辑任务
  editTask: function (e) {
    const taskId = e.detail.taskId
    wx.navigateTo({
      url: `/pages/task/task?id=${taskId}&edit=1`
    })
  }
}) 