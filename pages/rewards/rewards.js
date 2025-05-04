// pages/rewards/rewards.js
const app = getApp()

Page({

  /**
   * 页面的初始数据
   */
  data: {
    currentProgress: 0,
    totalProgress: 100,
    rewardsEarned: 0,
    rewardsTotal: 6,
    currentLevel: 1,
    totalPoints: 0,            // 总积分
    formattedPoints: '0',      // 格式化后的总积分
    expiringPoints: 0,         // 即将到期积分
    expiryDate: '',            // 到期日期
    rewards: [
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
    ],
    showModal: false,
    selectedReward: null
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.loadRewardsData();
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    this.loadRewardsData();
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  },

  /**
   * 加载奖励数据
   */
  loadRewardsData: function () {
    console.log('[rewards] 开始加载奖励数据');
    
    // 从存储获取用户总积分
    const userPoints = wx.getStorageSync('userPoints') || 0;
    console.log(`[rewards] 获取到用户积分: ${userPoints}`);
    
    // 格式化积分，添加千位分隔符
    const formattedPoints = userPoints.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    
    // 获取即将到期积分信息
    const expiringPointsInfo = this.getExpiringPoints();
    
    // 从全局状态或本地存储获取完成的任务数量
    const app = getApp();
    const tasks = app.globalData.tasks || [];
    const completedTasks = tasks.filter(task => task.status === 1).length;
    
    // 更新奖励解锁状态
    const rewards = this.data.rewards.map(reward => {
      return {
        ...reward,
        unlocked: userPoints >= reward.points
      };
    });

    // 计算已解锁奖励数量
    const unlockedRewards = rewards.filter(reward => reward.unlocked).length;
    
    this.setData({
      rewards: rewards,
      currentProgress: userPoints,
      totalPoints: userPoints,
      formattedPoints: formattedPoints,
      expiringPoints: expiringPointsInfo.points,
      expiryDate: expiringPointsInfo.date,
      rewardsEarned: unlockedRewards,
      currentLevel: Math.floor(userPoints / 20) + 1 // 每20点升一级
    });
    
    console.log(`[rewards] 设置总积分: ${userPoints}, 即将过期总积分: ${expiringPointsInfo.points}, 最早到期日期: ${expiringPointsInfo.date}`);
  },

  /**
   * 获取即将到期积分信息
   */
  getExpiringPoints: function() {
    console.log(`[rewards] 开始检查即将到期积分`);
    
    // 获取任务数据
    const tasks = wx.getStorageSync('taskData') || [];
    const now = new Date().getTime();
    let expiringPoints = 0;
    let expiryDate = '';
    
    // 筛选已完成且积分有有效期的任务
    const completedTasks = tasks.filter(task => 
      task.status === 1 && 
      task.pointsExpiry !== 'permanent' && // 排除永久有效的积分
      typeof task.pointsExpiry === 'number' && 
      task.pointsExpiry > now
    );
    
    console.log(`[rewards] 找到 ${completedTasks.length} 个有时效性的完成任务`);
    
    if (completedTasks.length > 0) {
      // 按过期时间排序
      completedTasks.sort((a, b) => a.pointsExpiry - b.pointsExpiry);
      
      // 获取最早过期日期
      const earliestExpiryTask = completedTasks[0];
      const earliestExpiryTime = earliestExpiryTask.pointsExpiry;
      expiryDate = earliestExpiryTask.pointsExpiryDate || '';
      
      // 只计算最早日期对应的积分总和
      expiringPoints = completedTasks
        .filter(task => task.pointsExpiry === earliestExpiryTime)
        .reduce((sum, task) => sum + (task.rewardPoints || 0), 0);
      
      console.log(`[rewards] 找到${completedTasks.length}个即将到期任务，最早到期日期: ${expiryDate}，该日期积分: ${expiringPoints}`);
    } else {
      console.log(`[rewards] 没有找到即将到期的积分`);
    }
    
    return {
      points: expiringPoints,
      date: expiryDate
    };
  },

  /**
   * 查看奖励详情
   */
  viewReward: function (e) {
    const rewardId = e.currentTarget.dataset.id;
    const reward = this.data.rewards.find(r => r.id === rewardId);
    
    this.setData({
      selectedReward: reward,
      showModal: true
    });
  },

  /**
   * 关闭弹窗
   */
  closeModal: function () {
    this.setData({
      showModal: false
    });
  },

  /**
   * 领取奖励
   */
  claimReward: function (e) {
    const rewardId = this.data.selectedReward.id;
    
    if (!this.data.selectedReward.unlocked) {
      wx.showToast({
        title: '奖励尚未解锁',
        icon: 'none'
      });
      return;
    }

    if (this.data.selectedReward.claimed) {
      wx.showToast({
        title: '奖励已领取',
        icon: 'none'
      });
      return;
    }

    // 更新奖励状态
    const rewards = this.data.rewards.map(reward => {
      if (reward.id === rewardId) {
        return { ...reward, claimed: true };
      }
      return reward;
    });

    this.setData({
      rewards: rewards,
      showModal: false
    });

    // 保存到本地存储
    wx.setStorage({
      key: 'rewards',
      data: rewards
    });
  }
})