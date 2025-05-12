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
    rewards: [], // 改为空数组，后续从存储加载真实奖励数据
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
   * 判断是否为示例奖励
   * 通过ID格式或标记识别示例奖励
   */
  isExampleReward: function(reward) {
    // 检查是否有明确的示例标记
    if (reward.isExample === true) {
      return true;
    }
    
    // 使用ID前缀/后缀识别初始默认示例
    // 初始三个示例奖励的ID结尾为_1, _2, _3
    return /reward_\d+_(1|2|3)$/.test(reward.id);
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
    
    // 从本地存储获取奖励数据
    let storedRewards = wx.getStorageSync('rewards') || [];
    
    // 确保示例奖励启用状态统一
    let needUpdate = false;
    storedRewards = storedRewards.map(reward => {
      if (this.isExampleReward(reward) && !reward.enabled) {
        needUpdate = true;
        console.log(`[rewards] 修正示例奖励状态: ${reward.name}`);
        return { ...reward, enabled: true };
      }
      return reward;
    });
    
    // 如果有更新，保存回存储
    if (needUpdate) {
      console.log('[rewards] 更新奖励数据，确保示例奖励启用');
      wx.setStorageSync('rewards', storedRewards);
    }
    
    // 过滤出启用的奖励并计算解锁状态
    const rewards = storedRewards
      .filter(r => r.enabled !== false)
      .map(r => ({
        ...r,
        unlocked: userPoints >= r.points
      }));

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
   * 导航到我的兑换页面
   */
  navigateToMyExchanges: function() {
    console.log('[rewards] 导航到我的兑换页面');
    wx.navigateTo({
      url: '/pages/my-exchanges/my-exchanges'
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
    
    // 保存原始星星数和目标星星数
    const originalPoints = this.data.totalPoints;
    const targetPoints = originalPoints - reward.points;
    
    // 实际扣除星星数（先在后台扣除）
    pointsManager.reduceUserPoints(reward.points);
    console.log(`[rewards] 领取奖励后星星数: ${targetPoints}, 扣除: ${reward.points}`);
    
    // 开始星星数量减少的动画
    this.animateStarsCount(originalPoints, targetPoints, () => {
      // 动画完成后，更新奖励状态
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
        showModal: false
      });

      // 获取所有奖励，包括已禁用的
      const allRewards = wx.getStorageSync('rewards') || [];
      
      // 更新所有奖励中的对应奖励状态
      const updatedAllRewards = allRewards.map(r => {
        if (r.id === reward.id) {
          return { ...r, claimed: true, claimTime: Date.now() };
        }
        return r;
      });
      
      // 保存到本地存储
      wx.setStorageSync('rewards', updatedAllRewards);
      
      // 通知首页更新星星和奖励进度
      const app = getApp();
      if (app && app.globalData && app.globalData.eventBus) {
        console.log('[rewards] 发送奖励领取事件通知');
        app.globalData.eventBus.emit('rewardClaimed', {
          rewardId: reward.id,
          points: reward.points,
          newTotalPoints: targetPoints,
          nextReward: nextReward
        });
      }

      // 显示领取成功提示
      wx.showToast({
        title: '领取成功',
        icon: 'success',
        duration: 2000
      });
    });
  },
  
  /**
   * 星星数量减少动画
   * @param {Number} start 起始数量
   * @param {Number} end 结束数量
   * @param {Function} callback 动画结束回调
   */
  animateStarsCount: function(start, end, callback) {
    // 动画参数
    const duration = 1000;  // 动画持续时间，1秒
    const frameDuration = 16;  // 每帧时间，约60fps
    const frames = Math.floor(duration / frameDuration);
    const decrement = (start - end) / frames;
    
    console.log(`[rewards] 开始星星数量动画，从 ${start} 到 ${end}, 减少数量: ${start - end}, 帧数: ${frames}`);
    
    let currentCount = start;
    let currentFrame = 0;
    
    // 执行动画递减
    const countDown = () => {
      currentFrame++;
      
      if (currentFrame <= frames) {
        // 计算当前数量，使用缓动效果使动画更自然
        const progress = currentFrame / frames;
        const easeOutProgress = 1 - Math.pow(1 - progress, 3); // 缓出效果
        currentCount = start - ((start - end) * easeOutProgress);
        
        // 格式化并显示
        this.setData({
          totalPoints: Math.round(currentCount),
          formattedPoints: pointsManager.formatPoints(Math.round(currentCount), true),
          currentProgress: Math.round(currentCount)
        });
        
        // 继续下一帧
        setTimeout(countDown, frameDuration);
      } else {
        // 动画完成，确保最终数值准确
        this.setData({
          totalPoints: end,
          formattedPoints: pointsManager.formatPoints(end, true),
          currentProgress: end
        });
        
        console.log(`[rewards] 星星数量动画完成，最终数量: ${end}`);
        
        // 执行回调
        if (callback) {
          callback();
        }
      }
    };
    
    // 开始动画
    countDown();
  }
})