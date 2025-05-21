// pages/rewards/rewards.js
const app = getApp();
// 新架构服务引入
const serviceManager = require('../../utils/serviceManager');
const formatUtils = require('../../utils/formatUtils');

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
    selectedReward: null,
    showAnimationMask: false,  // 进度条满值动画期间显示的蒙层
    isRewardAnimating: false,  // 是否正在进行奖励动画
    
    // 架构示例页面相关
    demoClickCount: 0,  // 添加点击计数
    demoClickTimeout: null  // 添加超时变量
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    console.log('[rewards] 页面加载');
    await this.loadRewardsData();
    
    // 清除已跳转标记
    const app = getApp();
    if (app.globalData.hasRedirectedToReward) {
      console.log('[rewards] 清除已跳转标记');
      app.globalData.hasRedirectedToReward = false;
    }
    
    // 记录星星宝典展示
    console.log('[rewards] 展示星星宝典信息 - 精简儿童友好版');
    
    // 注册进度条完成事件监听
    this.setupProgressBarListener();
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: async function () {
    console.log('[rewards] 页面显示');
    await this.loadRewardsData();
    
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
    // 清理所有计时器
    this.clearAllTimers();
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    // 清理所有计时器
    this.clearAllTimers();
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
   * 设置进度条完成事件监听
   */
  setupProgressBarListener: function() {
    console.log('[rewards] 设置进度条完成事件监听');
    
    // 获取全局事件总线
    const eventBus = app.globalData.eventBus;
    if (eventBus) {
      // 监听进度条完成事件
      eventBus.on('progressBarComplete', this.handleProgressBarComplete.bind(this));
    }
  },
  
  /**
   * 处理进度条完成事件
   */
  handleProgressBarComplete: function() {
    console.log('[rewards] 收到进度条完成事件，锁定用户操作');
    
    // 已经在动画中则不重复处理
    if (this.data.isRewardAnimating) {
      console.log('[rewards] 已经在动画中，忽略重复事件');
      return;
    }
    
    // 设置动画标志和显示蒙层
    this.setData({
      isRewardAnimating: true,
      showAnimationMask: true
    });
    
    // 设置安全超时，确保不会永久锁定界面
    this.animationSafetyTimer = setTimeout(() => {
      console.log('[rewards] 奖励动画安全超时触发');
      this.releaseAnimationLock();
    }, 2000); // 2秒后如果仍未释放锁定，则自动释放
  },
  
  /**
   * 释放动画锁定
   */
  releaseAnimationLock: function() {
    console.log('[rewards] 释放动画锁定');
    
    // 清除安全超时计时器
    if (this.animationSafetyTimer) {
      clearTimeout(this.animationSafetyTimer);
      this.animationSafetyTimer = null;
    }
    
    // 隐藏蒙层，解除锁定
    this.setData({
      showAnimationMask: false,
      isRewardAnimating: false
    });
  },
  
  /**
   * 清理所有计时器
   */
  clearAllTimers: function() {
    console.log('[rewards] 清理所有计时器');
    
    // 清除动画安全超时计时器
    if (this.animationSafetyTimer) {
      clearTimeout(this.animationSafetyTimer);
      this.animationSafetyTimer = null;
    }
    
    // 清除其他可能的计时器
    if (this.rewardTimer) {
      clearTimeout(this.rewardTimer);
      this.rewardTimer = null;
    }
    
    // 清除点击计数超时计时器
    if (this.data.demoClickTimeout) {
      clearTimeout(this.data.demoClickTimeout);
      this.setData({ demoClickTimeout: null });
    }
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
  loadRewardsData: async function () {
    console.log('[rewards] 开始加载奖励数据');
    
    try {
      wx.showLoading({ title: '加载中' });
      
      // 获取服务实例
      const starService = serviceManager.getService('starService');
      const rewardService = serviceManager.getService('rewardService');
      
      if (!starService || !rewardService) {
        console.error('[rewards] 无法获取服务实例');
        wx.hideLoading();
        return;
      }
      
      // 使用新架构获取用户星星数
      const totalPoints = await starService.getTotalStars();
      console.log(`[rewards] 获取到用户星星: ${totalPoints}`);
      
      // 格式化星星数量
      const formattedPoints = formatUtils.formatPoints(totalPoints, true);
      
      // 获取即将到期积分信息
      const expiringPointsInfo = await this.getExpiringPointsNew();
      
      // 获取所有奖励（包括已领取的）
      const allRewards = await rewardService.getAvailableRewards(true);
      console.log(`[rewards] 获取到可用奖励: ${allRewards.length}个`);
      
      // 额外过滤一次示例奖励，确保UI显示正确
      const hasCustomRewards = allRewards.some(r => !r.isExample && r.enabled);
      const displayRewards = hasCustomRewards 
        ? allRewards.filter(r => !r.isExample) 
        : allRewards;
      console.log(`[rewards] 过滤示例奖励后，实际显示: ${displayRewards.length}个`);
      
      // 计算解锁状态
      const rewards = displayRewards.map(r => ({
        ...r,
        unlocked: totalPoints >= r.points
      }));
      
      // 区分可用和已领取的奖励
      const availableRewards = rewards.filter(r => !r.claimed);
      const claimedRewards = rewards.filter(r => r.claimed);
      
      console.log(`[rewards] 可用奖励: ${availableRewards.length}个, 已领取奖励: ${claimedRewards.length}个`);
      
      // 计算已解锁奖励数量
      const unlockedRewards = rewards.filter(reward => reward.unlocked).length;
      
      // 计算下一个可达成的奖励
      const nextReward = await rewardService.calculateNextAvailableReward();
      console.log(`[rewards] 下一个可达成奖励: ${nextReward.name}, 需要${nextReward.points}颗星星`);
      
      this.setData({
        rewards: rewards,
        availableRewards: availableRewards,
        claimedRewards: claimedRewards,
        showClaimedRewards: true, // 显示已领取的奖励
        currentProgress: totalPoints,
        totalPoints: totalPoints,
        formattedPoints: formattedPoints,
        expiringPoints: expiringPointsInfo.points,
        expiryDate: expiringPointsInfo.date,
        rewardsEarned: unlockedRewards,
        currentLevel: Math.floor(totalPoints / 20) + 1, // 每20点升一级
        nextReward: nextReward
      });
      
      console.log(`[rewards] 设置总星星: ${totalPoints}, 即将过期总星星: ${expiringPointsInfo.points}, 最早到期日期: ${expiringPointsInfo.date}`);
      
      wx.hideLoading();
    } catch (error) {
      console.error('[rewards] 加载奖励数据失败', error);
      wx.hideLoading();
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none'
      });
    }
  },

  /**
   * 获取即将过期的星星信息
   * @returns {Promise<Object>} 包含过期星星数和最早过期日期的对象
   */
  getExpiringPointsNew: async function() {
    console.log('[rewards] 获取即将过期的星星信息');
    
    try {
      // 获取服务实例
      const starService = serviceManager.getService('starService');
      
      if (!starService) {
        console.error('[rewards] 无法获取星星服务实例');
        return { points: 0, date: '' };
      }
      
      // 获取即将过期的星星信息
      const expiringInfo = await starService.getExpiringStarsInfo();
      
      console.log(`[rewards] 即将过期星星: ${expiringInfo.points}颗, 最早到期日期: ${expiringInfo.expiryDateText}`);
      
      return {
        points: expiringInfo.points,
        date: expiringInfo.expiryDateText
      };
    } catch (error) {
      console.error('[rewards] 获取即将过期的星星信息失败', error);
      return { points: 0, date: '' };
    }
  },

  /**
   * 查看奖励详情
   */
  viewReward: function (e) {
    // 如果正在动画中，拦截操作
    if (this.data.isRewardAnimating) {
      console.log('[rewards] 正在动画中，拦截奖励查看操作');
      return;
    }
    
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
    // 如果正在动画中，拦截操作
    if (this.data.isRewardAnimating) {
      console.log('[rewards] 正在动画中，拦截页面跳转');
      return;
    }
    
    console.log('[rewards] 导航到我的兑换页面');
    wx.navigateTo({
      url: '/pages/my-exchanges/my-exchanges'
    });
  },

  /**
   * 导航到星星记录页面
   */
  navigateToStarRecords: function() {
    // 如果正在动画中，拦截操作
    if (this.data.isRewardAnimating) {
      console.log('[rewards] 正在动画中，拦截页面跳转');
      return;
    }
    
    console.log('[rewards] 导航到星星记录页面');
    wx.navigateTo({
      url: '/pages/star-records/star-records'
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
  _performClaimReward: async function(reward) {
    try {
      wx.showLoading({ title: '兑换中' });
      
      // 获取服务实例
      const rewardService = serviceManager.getService('rewardService');
      const starService = serviceManager.getService('starService');
      
      if (!rewardService || !starService) {
        console.error('[rewards] 无法获取服务实例');
        wx.hideLoading();
        return;
      }
      
      // 保存原始星星数和目标星星数
      const originalPoints = this.data.totalPoints;
      const targetPoints = originalPoints - reward.points;
      
      console.log(`[rewards] 领取奖励前星星数: ${originalPoints}`);
      
      // 使用新架构兑换奖励
      const result = await rewardService.exchangeReward(reward.id);
      
      if (!result.success) {
        console.error(`[rewards] 兑换奖励失败: ${result.message}`);
        wx.hideLoading();
        wx.showToast({
          title: result.message || '兑换失败',
          icon: 'none'
        });
        return;
      }
      
      console.log(`[rewards] 兑换奖励成功: ${reward.name}, ID=${reward.id}, 消耗星星: ${reward.points}`);
      
      // 开始星星数量减少的动画
      wx.hideLoading();
      this.animateStarsCount(originalPoints, targetPoints, async () => {
        // 动画完成后，计算下一个可用奖励
        const nextReward = await rewardService.calculateNextAvailableReward();
        console.log(`[rewards] 领取奖励后计算下一个可用奖励: ${nextReward.name}, 需要${nextReward.points}颗星星`);
        
        // 关闭弹窗并更新数据
        this.setData({
          showModal: false,
          nextReward: nextReward
        });
        
        // 重新加载奖励数据以更新UI
        await this.loadRewardsData();
        
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
          title: '兑换成功',
          icon: 'success',
          duration: 2000
        });
      });
    } catch (error) {
      console.error('[rewards] 兑换奖励出错', error);
      wx.hideLoading();
      wx.showToast({
        title: '操作失败，请重试',
        icon: 'none'
      });
    }
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
          formattedPoints: formatUtils.formatPoints(Math.round(currentCount), true),
          currentProgress: Math.round(currentCount)
        });
        
        // 继续下一帧
        setTimeout(countDown, frameDuration);
      } else {
        // 动画完成，确保最终数值准确
        this.setData({
          totalPoints: end,
          formattedPoints: formatUtils.formatPoints(end, true),
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
  },

  /**
   * 处理星星区域点击
   * 连续点击5次进入架构示例页面
   */
  onStarsAreaTap: function() {
    clearTimeout(this.data.demoClickTimeout);
    
    let count = this.data.demoClickCount + 1;
    
    if (count === 5) {
      // 达到5次点击，跳转到示例页面
      console.log('[rewards] 检测到5次连续点击，跳转到架构示例页面');
      // 添加振动反馈
      if (wx.vibrateShort) {
        wx.vibrateShort({ type: 'light' });
      }
      wx.navigateTo({
        url: '/pages/architecture-demo/demo'
      });
      count = 0;  // 重置计数
    } else {
      // 设置2秒超时，如果2秒内没有下一次点击，重置计数
      const timeout = setTimeout(() => {
        this.setData({ demoClickCount: 0 });
      }, 2000);
      
      this.setData({ 
        demoClickCount: count,
        demoClickTimeout: timeout
      });
      
      console.log(`[rewards] 星星区域点击 ${count}/5`);
    }
  },

  /**
   * 兑换奖励
   * @param {Object} reward 要兑换的奖励
   */
  exchangeReward: async function(reward) {
    if (!reward) {
      console.error('[rewards] 尝试兑换无效奖励');
      return;
    }
    
    console.log(`[rewards] 尝试兑换奖励: ${reward.name}, 需要${reward.points}颗星星`);
    
    // 获取服务实例
    const starService = serviceManager.getService('starService');
    const rewardService = serviceManager.getService('rewardService');
    
    if (!starService || !rewardService) {
      console.error('[rewards] 无法获取服务实例');
      wx.showToast({
        title: '系统错误，请重试',
        icon: 'none'
      });
      return;
    }
    
    try {
      wx.showLoading({ title: '处理中' });
      
      // 尝试兑换奖励
      const result = await rewardService.exchangeReward(reward.id);
      
      wx.hideLoading();
      
      if (!result.success) {
        console.error('[rewards] 兑换奖励失败:', result.message);
        wx.showToast({
          title: result.message || '兑换失败',
          icon: 'none'
        });
        return;
      }
      
      // 兑换成功，显示动画和提示
      console.log(`[rewards] 成功兑换奖励: ${reward.name}`);
      
      wx.showToast({
        title: '兑换成功',
        icon: 'success'
      });
      
      // 更新页面数据
      this.loadRewardsData();
      
      // 触发奖励兑换成功事件
      const eventChannel = this.getOpenerEventChannel();
      if (eventChannel && eventChannel.emit) {
        eventChannel.emit('rewardExchanged', { reward: result.reward });
      }
      
      // 添加到成就系统
      this.addToAchievements(reward);
    } catch (error) {
      wx.hideLoading();
      console.error('[rewards] 兑换奖励过程中发生错误:', error);
      wx.showToast({
        title: '兑换失败，请重试',
        icon: 'none'
      });
    }
  },

  /**
   * 添加奖励兑换成就
   * @param {Object} reward 兑换的奖励
   */
  addToAchievements: function(reward) {
    if (!reward) return;
    
    // 这里可以添加奖励成就相关逻辑
    console.log(`[rewards] 记录奖励兑换成就: ${reward.name}`);
    
    // TODO: 实现成就系统后集成
  },
})