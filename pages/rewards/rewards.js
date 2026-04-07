// pages/rewards/rewards.js
const { EVENTS } = require('../../utils/constants');
// 新架构服务引入
const serviceManager = require('../../services/service-manager');
const formatUtils = require('../../utils/formatUtils');
const logger = require('../../utils/logger');
const rewardsAnimationModule = require('./modules/rewards-animation');
const rewardsSyncModule = require('./modules/rewards-sync');
const rewardsExchangeFlowModule = require('./modules/rewards-exchange-flow');
const rewardsUserContextModule = require('./modules/rewards-user-context');

const REWARD_MANAGE_URL = '/packageManage/pages/reward-manage/reward-manage';

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
    
    // Tab切换相关
    activeTab: 'available',    // 当前激活的Tab: 'available' | 'claimed'
    showTabs: false,           // 是否显示Tab切换
    availableRewards: [],      // 可获得的奖励
    claimedRewards: [],        // 已兑换/已领取的奖励
    rewardEmptyMode: 'none',
    rewardEmptyTitle: '',
    rewardEmptyDescription: '',
    rewardEmptyHistoryHint: '',
    showManageRewardCTA: false,
    manageRewardCTAText: '',
    
    // 架构示例页面相关
    demoClickCount: 0,  // 添加点击计数
    demoClickTimeout: null  // 添加超时变量
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    logger.info('rewards', '页面加载');
    this._skipNextOnShowRefresh = false;
    
    // 清除已跳转标记
    const app = getApp();
    if (app.globalData.hasRedirectedToReward) {
      logger.info('rewards', '清除已跳转标记');
      app.globalData.hasRedirectedToReward = false;
    }
    
    // 记录星星宝典展示
    logger.info('rewards', '展示星星宝典信息 - 精简儿童友好版');
    
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: async function() {
    this.setupProgressBarListener();
    return rewardsSyncModule.onShow(this);
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    // 清理所有计时器
    this.clearAllTimers();
    rewardsAnimationModule.teardownProgressBarListener(this);
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    // 清理所有计时器
    this.clearAllTimers();
    rewardsAnimationModule.teardownProgressBarListener(this);
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: async function() {
    return rewardsSyncModule.onPullDownRefresh(this);
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
    return rewardsAnimationModule.setupProgressBarListener(this);
  },
  
  /**
   * 处理进度条完成事件
   */
  handleProgressBarComplete: function() {
    return rewardsAnimationModule.handleProgressBarComplete(this);
  },
  
  /**
   * 释放动画锁定
   */
  releaseAnimationLock: function() {
    return rewardsAnimationModule.releaseAnimationLock(this);
  },
  
  /**
   * 清理所有计时器
   */
  clearAllTimers: function() {
    return rewardsAnimationModule.clearAllTimers(this);
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
  loadRewardsData: async function (forceRefresh = false) {
    return rewardsSyncModule.loadRewardsData(this, forceRefresh);
  },

  /**
   * 获取即将过期的星星信息
   * @returns {Promise<Object>} 包含过期星星数和最早过期日期的对象
   */
  getExpiringPoints: async function() {
    return rewardsSyncModule.getExpiringPoints(this);
  },

  /**
   * 查看奖励详情
   */
  viewReward: function (e) {
    // 如果正在动画中，拦截操作
    if (this.data.isRewardAnimating) {
      logger.warn('rewards', '正在动画中，拦截奖励查看操作');
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
      logger.warn('rewards', '正在动画中，拦截页面跳转');
      return;
    }
    
    logger.info('rewards', '导航到我的兑换页面');
    wx.navigateTo({
      url: '/packageManage/pages/my-exchanges/my-exchanges'
    });
  },

  /**
   * 导航到星星记录页面
   */
  navigateToStarRecords: function() {
    // 如果正在动画中，拦截操作
    if (this.data.isRewardAnimating) {
      logger.warn('rewards', '正在动画中，拦截页面跳转');
      return;
    }
    
    logger.info('rewards', '导航到星星记录页面');
    wx.navigateTo({
      url: '/packageMessage/pages/star-records/star-records'
    });
  },

  navigateToRewardManage: function() {
    if (!this.data.showManageRewardCTA) {
      return;
    }

    logger.info('rewards', '从奖池空态跳转到奖励管理页');
    wx.navigateTo({
      url: REWARD_MANAGE_URL
    });
  },

  /**
   * 领取奖励
   */
  claimReward: function (e) {
    return rewardsExchangeFlowModule.claimReward(this, e);
  },

  /**
   * 执行领取奖励操作
   */
  _performClaimReward: async function(reward) {
    return rewardsExchangeFlowModule.performClaimReward(this, reward);
  },
  
  /**
   * 处理兑换成功的共同逻辑
   */
  _handleExchangeSuccess: async function(result, reward, childUserId) {
    return rewardsExchangeFlowModule.handleExchangeSuccess(this, result, reward, childUserId);
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
    
    logger.info('rewards', `开始星星数量动画，从 ${start} 到 ${end}, 减少数量: ${start - end}, 帧数: ${frames}`);
    
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
        
        logger.info('rewards', `星星数量动画完成，最终数量: ${end}`);
        
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
      logger.info('rewards', '检测到5次连续点击，跳转到架构示例页面');
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
      
      logger.info(`rewards 星星区域点击 ${count}/5`);
    }
  },

  /**
   * Tab切换
   */
  switchTab: function(e) {
    const tab = e.currentTarget.dataset.tab;
    logger.info('rewards', `切换Tab到: ${tab}`);
    
    // 添加轻微震动反馈
    if (wx.vibrateShort) {
      wx.vibrateShort({ type: 'light' });
    }
    
    this.setData({
      activeTab: tab
    });
  },

  /**
   * 获取小朋友用户ID（统一方法）
   * @returns {String} 小朋友用户ID
   * @private
   */
  /**
   * 获取有效孩子userId（用于星星扣减/展示）
   * 家长视角：优先取最近操作的孩子，否则取第一个孩子
   * 孩子视角（孩子设备）：取loginUser自身
   */
  _getEffectiveChildUserId: function() {
    return rewardsUserContextModule.getEffectiveChildUserId(serviceManager);
  },

  /**
   * 获取奖励归属userId（家庭奖励池，由家长账号管理）
   * 家长设备：loginUserId（家长）
   * 孩子设备：loginUserId（孩子本身，M07已知限制：奖励未云端同步时不可见）
   */
  _getRewardOwnerUserId: function() {
    return rewardsUserContextModule.getRewardOwnerUserId(serviceManager);
  }
})
