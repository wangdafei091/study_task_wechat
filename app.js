// app.js
App({
  onLaunch: function () {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 加载任务数据
    this.loadTaskData()

    // 登录
    wx.login({
      success: res => {
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
        console.log('登录成功', res)
      }
    })
  },

  // 从本地存储加载数据
  loadTaskData: function() {
    // 加载任务数据
    const tasks = wx.getStorageSync('tasks') || this.getDefaultTasks()
    this.globalData.tasks = tasks

    // 加载奖励数据
    const rewards = wx.getStorageSync('rewards') || this.getDefaultRewards()
    this.globalData.rewards = rewards
  },

  // 默认任务数据
  getDefaultTasks: function() {
    return [
      {
        id: 1,
        type: 'clock',
        title: '独立刷牙',
        description: '早晚各刷一次牙，每次2分钟',
        status: 0, 
        hasImage: false,
        images: [],
        date: '2025-03-28',
        time: '08:00',
        reminder: true
      },
      {
        id: 2,
        type: 'bag',
        title: '整理书包',
        description: '检查明天所需的课本和学习用品',
        status: 0,
        hasImage: false,
        images: [],
        date: '2025-03-28',
        time: '20:00',
        reminder: true
      },
      {
        id: 3,
        type: 'study',
        title: '数学作业',
        description: '完成数学习题第3页',
        status: 1,
        hasImage: true,
        images: ['https://example.com/image1.jpg'],
        date: '2025-03-28',
        time: '16:00',
        reminder: false
      }
    ]
  },

  // 默认奖励数据
  getDefaultRewards: function() {
    return [
      {
        id: 1,
        name: '看动画片30分钟',
        points: 10,
        icon: '🎬',
        unlocked: true,
        claimed: false
      },
      {
        id: 2,
        name: '额外的零食',
        points: 20,
        icon: '🍪',
        unlocked: true,
        claimed: false
      },
      {
        id: 3,
        name: '玩游戏1小时',
        points: 30,
        icon: '🎮',
        unlocked: false,
        claimed: false
      },
      {
        id: 4,
        name: '购买一本新书',
        points: 40,
        icon: '📚',
        unlocked: false,
        claimed: false
      },
      {
        id: 5,
        name: '去游乐园',
        points: 80,
        icon: '🎡',
        unlocked: false,
        claimed: false
      },
      {
        id: 6,
        name: '新玩具',
        points: 100,
        icon: '🧸',
        unlocked: false,
        claimed: false
      }
    ]
  },

  globalData: {
    userInfo: null,
    tasks: [],
    rewards: [],
    rewardProgress: {
      current: 2,
      total: 3
    }
  }
}) 