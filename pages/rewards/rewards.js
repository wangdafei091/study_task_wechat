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
    // 从全局状态或本地存储获取完成的任务数量
    const app = getApp();
    const tasks = app.globalData.tasks || [];
    const completedTasks = tasks.filter(task => task.status === 1).length;
    
    // 计算当前积分（每个完成的任务10分）
    const currentPoints = completedTasks * 10;
    
    // 更新奖励解锁状态
    const rewards = this.data.rewards.map(reward => {
      return {
        ...reward,
        unlocked: currentPoints >= reward.points
      };
    });

    // 计算已解锁奖励数量
    const unlockedRewards = rewards.filter(reward => reward.unlocked).length;
    
    this.setData({
      rewards: rewards,
      currentProgress: currentPoints,
      rewardsEarned: unlockedRewards,
      currentLevel: Math.floor(currentPoints / 20) + 1 // 每20点升一级
    });
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