// pages/rewards/rewards.js
const app = getApp()
const pointsManager = require('../../utils/pointsManager.js'); // 引入星星管理工具

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
    console.log('[rewards] 页面加载');
    this.loadRewardsData();
    
    // 清除已跳转标记
    const app = getApp();
    if (app.globalData.hasRedirectedToReward) {
      console.log('[rewards] 清除已跳转标记');
      app.globalData.hasRedirectedToReward = false;
    }
    
    // 记录星星宝典展示
    console.log('[rewards] 展示星星宝典信息 - 精简儿童友好版');
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
    console.log('[rewards] 页面显示');
    this.loadRewardsData();
    
    // 清除已跳转标记
    const app = getApp();
    if (app.globalData.hasRedirectedToReward) {
      console.log('[rewards] 清除已跳转标记');
      app.globalData.hasRedirectedToReward = false;
    }
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
    
    // 使用pointsManager获取用户星星数
    const userPoints = pointsManager.getUserPoints();
    console.log(`[rewards] 获取到用户星星: ${userPoints}`);
    
    // 格式化积分，添加千位分隔符
    const formattedPoints = pointsManager.formatPoints(userPoints, true);
    
    // 获取即将到期积分信息
    const expiringPointsInfo = this.getExpiringPoints();
    
    // 从全局状态或本地存储获取完成的任务数量
    const app = getApp();
    const tasks = app.globalData.tasks || [];
    const completedTasks = tasks.filter(task => task.status === 1).length;
    
    // 获取所有奖励配置
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
    
    console.log(`[rewards] 设置总星星: ${userPoints}, 即将过期总星星: ${expiringPointsInfo.points}, 最早到期日期: ${expiringPointsInfo.date}`);
  },

  /**
   * 获取即将到期积分信息
   */
  getExpiringPoints: function() {
    console.log(`[rewards] 开始检查即将到期星星`);
    
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
        .reduce((sum, task) => sum + (task.points || 0), 0);
      
      console.log(`[rewards] 找到${completedTasks.length}个即将到期任务，最早到期日期: ${expiryDate}，该日期星星: ${expiringPoints}`);
    } else {
      console.log(`[rewards] 没有找到即将到期的星星`);
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
    const reward = this.data.selectedReward;
    const rewardId = reward.id;
    
    if (!reward.unlocked) {
      wx.showToast({
        title: '奖励尚未解锁',
        icon: 'none'
      });
      return;
    }

    if (reward.claimed) {
      wx.showToast({
        title: '奖励已领取',
        icon: 'none'
      });
      return;
    }

    // 添加二次确认
    wx.showModal({
      title: '确认领取',
      content: `确定要用 ${reward.points} 颗星星兑换【${reward.name}】吗？领取后星星将不能退回哦！`,
      success: (res) => {
        if (res.confirm) {
          console.log(`[rewards] 用户确认领取奖励: ${reward.name}, 消耗星星: ${reward.points}`);
          this._performClaimReward(reward);
        } else {
          console.log(`[rewards] 用户取消领取奖励: ${reward.name}`);
        }
      }
    });
  },

  /**
   * 执行领取奖励操作
   */
  _performClaimReward: function(reward) {
    // 扣除相应的星星数
    console.log(`[rewards] 领取奖励前星星数: ${this.data.totalPoints}`);
    const newPoints = pointsManager.reduceUserPoints(reward.points);
    console.log(`[rewards] 领取奖励后星星数: ${newPoints}, 扣除: ${reward.points}`);
    
    // 更新奖励状态
    const rewards = this.data.rewards.map(r => {
      if (r.id === reward.id) {
        return { ...r, claimed: true };
      }
      return r;
    });

    // 使用更新后的奖励数据计算下一个可用奖励
    const nextReward = pointsManager.calculateNextReward(rewards);
    console.log(`[rewards] 领取奖励后计算下一个可用奖励: ${nextReward.name}, 需要${nextReward.points}颗星星`);
    
    // 关闭弹窗并更新数据
    this.setData({
      rewards: rewards,
      showModal: false,
      totalPoints: newPoints,
      formattedPoints: pointsManager.formatPoints(newPoints, true),
      currentProgress: newPoints
    });

    // 保存到本地存储
    wx.setStorage({
      key: 'rewards',
      data: rewards
    });
    
    // 通知首页更新星星和奖励进度
    const app = getApp();
    if (app && app.globalData && app.globalData.eventBus) {
      console.log('[rewards] 发送奖励领取事件通知');
      app.globalData.eventBus.emit('rewardClaimed', {
        rewardId: reward.id,
        points: reward.points,
        newTotalPoints: newPoints,
        nextReward: nextReward
      });
    }

    // 显示领取成功提示
    wx.showToast({
      title: '领取成功',
      icon: 'success',
      duration: 2000
    });
  }
})