// pages/rewards/rewards.js
const { EVENTS } = require('../../utils/constants');
const app = getApp();
// 新架构服务引入
const serviceManager = require('../../services/service-manager');
const formatUtils = require('../../utils/formatUtils');
const logger = require('../../utils/logger');
const rewardStatus = require('../../utils/reward-status');
const uiUtils = require('../../utils/uiUtils');

const REWARD_MANAGE_URL = '/packageManage/pages/reward-manage/reward-manage';

function resolveRewardPageViewMode(userService) {
  const loginUser = userService?.getLoginUser ? userService.getLoginUser() : null;
  const currentUser = userService?.getCurrentUser ? userService.getCurrentUser() : null;
  const activeUser = currentUser || loginUser || null;
  const activeUserId = activeUser ? (activeUser.userId || activeUser.id) : null;
  const isReadonlyView = loginUser
    ? (loginUser.role === 'child' || loginUser.userId !== activeUserId)
    : !!(activeUser && activeUser.role === 'child');

  return {
    loginUser,
    currentUser: activeUser,
    isReadonlyView,
    viewMode: activeUser && activeUser.role === 'parent' && !isReadonlyView
      ? 'parent-manage'
      : 'child-no-manage'
  };
}

function buildRewardPageState({ rewards, hasRewardHistoryHint, viewMode }) {
  if (Array.isArray(rewards) && rewards.length > 0) {
    return {
      emptyMode: 'none',
      emptyTitle: '',
      emptyDescription: '',
      emptyHistoryHint: '',
      ctaVisible: false,
      ctaText: ''
    };
  }

  const isParentManageView = viewMode === 'parent-manage';
  const emptyTitle = isParentManageView
    ? (hasRewardHistoryHint ? '目前还没有可用的正式奖励' : '还没有正式奖励')
    : '现在还没有可用奖励';

  return {
    emptyMode: isParentManageView ? 'parent-setup' : 'child-explain',
    emptyTitle,
    emptyDescription: isParentManageView
      ? '去设置一个正式奖励吧，孩子完成任务后就能看到努力目标了'
      : '奖励由家长来设置，现在完成任务也会正常积累星星',
    emptyHistoryHint: isParentManageView && hasRewardHistoryHint
      ? '如果之前清理过奖励，也可以重新添加一个正式奖励'
      : '',
    ctaVisible: isParentManageView,
    ctaText: '去设置第一个奖励'
  };
}

function decorateRewardForDisplay(reward, totalPoints) {
  const unlocked = totalPoints >= reward.points;

  return {
    ...reward,
    unlocked,
    claimDisplayStatus: rewardStatus.resolveRewardClaimStatus(reward),
    poolStatusLabel: rewardStatus.getRewardPoolStatusLabel({ ...reward, unlocked }),
    poolActionLabel: rewardStatus.getRewardPoolActionLabel({ ...reward, unlocked })
  };
}

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
    await this.loadRewardsData();
    
    // 清除已跳转标记
    const app = getApp();
    if (app.globalData.hasRedirectedToReward) {
      logger.info('rewards', '清除已跳转标记');
      app.globalData.hasRedirectedToReward = false;
    }
    
    // 记录星星宝典展示
    logger.info('rewards', '展示星星宝典信息 - 精简儿童友好版');
    
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
  onShow: async function() {
    // 记录页面显示
    logger.info('rewards', '页面显示');

    try {
      const starService = serviceManager.getService('starService');
      const rewardService = serviceManager.getService('rewardService');
      const effectiveChildId = this._getEffectiveChildUserId();
      const shouldForceRewardRefresh = app.globalData.needRefreshReward === true;

      if (starService?.syncExpiryAuthorityIfNeeded && effectiveChildId) {
        await starService.syncExpiryAuthorityIfNeeded({
          scope: 'user',
          userId: effectiveChildId
        });
      }

      if (starService?.refreshStarsFromCloud && effectiveChildId) {
        await starService.refreshStarsFromCloud(effectiveChildId, {
          forceCloudAfterAuthority: true
        });
      } else if (!effectiveChildId) {
        logger.info('rewards', '奖励页跳过孩子星星云同步：当前没有可用的孩子视角');
      }
      if (rewardService?.refreshRewardsFromCloud) {
        await rewardService.refreshRewardsFromCloud({
          force: shouldForceRewardRefresh || !!effectiveChildId,
          userId: effectiveChildId || undefined
        });
      }
    } catch (syncError) {
      logger.warn('rewards', '奖励页 onShow 云同步失败，继续使用本地数据', syncError);
    }
    
    // 检查是否有奖励数据变更标记
    if (app.globalData.needRefreshReward) {
      logger.info('rewards', '检测到奖励数据变更标记，强制刷新');
      app.globalData.needRefreshReward = false;
      await this.loadRewardsData(true); // 强制刷新
    } else {
      await this.loadRewardsData();
    }
    
    // 检查是否从其他页面跳转回来
    if (app.globalData.hasRedirectedToReward) {
      logger.info('rewards', '清除已跳转标记');
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
    
    // 清理事件监听器
    const app = getApp();
    const eventBus = app.globalData.eventBus;
    if (eventBus) {
      eventBus.off(EVENTS.PROGRESS_BAR_COMPLETE, this.handleProgressBarComplete);
    }
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: async function() {
    try {
      const starService = serviceManager.getService('starService');
      const rewardService = serviceManager.getService('rewardService');
      const effectiveChildId = this._getEffectiveChildUserId();

      if (starService?.syncExpiryAuthorityIfNeeded && effectiveChildId) {
        await starService.syncExpiryAuthorityIfNeeded({
          scope: 'user',
          userId: effectiveChildId,
          force: true
        });
      }

      if (starService?.refreshStarsFromCloud && effectiveChildId) {
        await starService.refreshStarsFromCloud(effectiveChildId, {
          forceCloudAfterAuthority: true
        });
      }
      if (rewardService?.refreshRewardsFromCloud) {
        await rewardService.refreshRewardsFromCloud({
          force: true,
          userId: effectiveChildId || undefined
        });
      }

      await this.loadRewardsData(true);
    } catch (error) {
      logger.warn('rewards', '奖励页下拉强制刷新失败，继续保留当前数据', error);
      wx.showToast({
        title: '刷新失败，请稍后重试',
        icon: 'none'
      });
    } finally {
      if (typeof wx.stopPullDownRefresh === 'function') {
        wx.stopPullDownRefresh();
      }
    }
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
    logger.info('rewards', '设置进度条完成事件监听');
    
    // 获取全局事件总线
    const eventBus = app.globalData.eventBus;
    if (eventBus) {
      // 监听进度条完成事件
      eventBus.on(EVENTS.PROGRESS_BAR_COMPLETE, this.handleProgressBarComplete.bind(this));
    }
  },
  
  /**
   * 处理进度条完成事件
   */
  handleProgressBarComplete: function() {
    logger.info('rewards', '收到进度条完成事件，锁定用户操作');
    
    // 已经在动画中则不重复处理
    if (this.data.isRewardAnimating) {
      logger.warn('rewards', '已经在动画中，忽略重复事件');
      return;
    }
    
    // 设置动画标志和显示蒙层
    this.setData({
      isRewardAnimating: true,
      showAnimationMask: true
    });
    
    // 设置安全超时，确保不会永久锁定界面
    this.animationSafetyTimer = setTimeout(() => {
      logger.warn('rewards', '奖励动画安全超时触发');
      this.releaseAnimationLock();
    }, 2000); // 2秒后如果仍未释放锁定，则自动释放
  },
  
  /**
   * 释放动画锁定
   */
  releaseAnimationLock: function() {
    logger.info('rewards', '释放动画锁定');
    
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
    logger.debug('rewards', '清理所有计时器');
    
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
    logger.info('rewards', '开始加载奖励数据');
    
    try {
      wx.showLoading({ title: '加载中' });
      
      // 获取服务实例
      const starService = serviceManager.getService('starService');
      const rewardService = serviceManager.getService('rewardService');
      
      if (!starService || !rewardService) {
        logger.error('rewards', '无法获取服务实例');
        wx.hideLoading();
        return;
      }
      
      // 强制清除所有相关缓存，确保获取最新数据
      logger.info('rewards', '强制清除缓存以获取最新数据');
      if (starService.clearCache) {
        starService.clearCache();
      }
      if (rewardService.clearCache) {
        rewardService.clearCache();
      }
      
      // 使用有效孩子ID取星星数；奖励属于家长账号（家庭奖励池）
      const effectiveChildId = this._getEffectiveChildUserId();
      const rewardOwnerId = this._getRewardOwnerUserId();
      logger.info('rewards', `有效孩子ID: ${effectiveChildId}, 奖励归属ID: ${rewardOwnerId}`);

      // 使用新架构获取用户星星数
      const totalPoints = effectiveChildId
        ? await starService.getTotalStars(effectiveChildId)
        : 0;
      logger.info('rewards', `获取到用户星星: ${totalPoints}`);
      
      // 格式化星星数量
      const formattedPoints = formatUtils.formatPoints(totalPoints, true);
      
      // 获取即将到期积分信息
      const expiringPointsInfo = await this.getExpiringPoints();
      
      const userService = serviceManager.getUserService();
      const { viewMode } = resolveRewardPageViewMode(userService);

      // 获取所有奖励（包括已领取的），按家庭奖励池查询
      const allRewards = await rewardService.getAvailableRewards(true, false, rewardOwnerId);
      logger.info('rewards', `获取到可用奖励: ${allRewards.length}个`);
      
      // 检查是否存在自定义奖励标记（通过服务层）
      let hasCustomRewards = false;
      try {
        // 尝试通过配置服务检查
        const configService = serviceManager.getService('config');
        if (configService) {
          hasCustomRewards = configService.hasCustomRewards();
        } else if (rewardService && typeof rewardService.hasCustomRewards === 'function') {
          // 通过奖励服务检查（向后兼容）
          hasCustomRewards = await rewardService.hasCustomRewards();
        } else {
          // 降级处理：直接使用存储
          hasCustomRewards = wx.getStorageSync('has_custom_rewards') === true;
          logger.warn('rewards', '配置服务不可用，使用降级存储访问');
        }
        if (hasCustomRewards) {
          logger.debug('rewards', '检测到自定义奖励标记');
        }
      } catch (e) {
        logger.warn('rewards', '获取自定义奖励标记失败', e);
      }
      
      const realRewards = allRewards.filter((reward) => !this.isExampleReward(reward));
      const rewardPageState = buildRewardPageState({
        rewards: realRewards,
        hasRewardHistoryHint: hasCustomRewards,
        viewMode
      });

      // 如果过滤示例奖励后没有正式奖励，展示空态而不是空白奖励网格
      if (realRewards.length === 0) {
        logger.info('rewards', '过滤示例奖励后无正式奖励，展示显式空态', {
          hasRewardHistoryHint: hasCustomRewards,
          viewMode
        });
        wx.hideLoading();

        this.setData({
          rewards: [],
          availableRewards: [],
          claimedRewards: [],
          showTabs: false,
          activeTab: 'available',
          showClaimedRewards: true,
          currentProgress: totalPoints,
          totalPoints: totalPoints,
          formattedPoints: formattedPoints,
          expiringPoints: expiringPointsInfo.points,
          expiryDate: expiringPointsInfo.date,
          rewardsEarned: 0,
          currentLevel: Math.floor(totalPoints / 20) + 1,
          nextReward: null,
          rewardEmptyMode: rewardPageState.emptyMode,
          rewardEmptyTitle: rewardPageState.emptyTitle,
          rewardEmptyDescription: rewardPageState.emptyDescription,
          rewardEmptyHistoryHint: rewardPageState.emptyHistoryHint,
          showManageRewardCTA: rewardPageState.ctaVisible,
          manageRewardCTAText: rewardPageState.ctaText
        });

        return;
      }
      
      // 计算页面展示状态
      const rewards = realRewards.map((reward) => decorateRewardForDisplay(reward, totalPoints));
      
      // 区分可兑换和已兑换/已领取的奖励
      const availableRewards = rewards.filter((reward) => !rewardStatus.isRewardExchanged(reward));
      const claimedRewards = rewards.filter((reward) => rewardStatus.isRewardExchanged(reward));
      
      logger.debug('rewards', `可兑换奖励: ${availableRewards.length}个, 已兑换奖励: ${claimedRewards.length}个`);
      
      // 计算已解锁奖励数量
      const unlockedRewards = rewards.filter(reward => reward.unlocked).length;
      
      // 计算下一个可达成的奖励（用孩子的星星数 vs 家长的奖励池）
      const nextReward = await rewardService.calculateNextAvailableReward(totalPoints, rewardOwnerId);
      const normalizedNextReward = nextReward && !nextReward.isDefault && !this.isExampleReward(nextReward)
        ? nextReward
        : null;
      logger.debug('rewards', `下一个可达成奖励: ${nextReward ? nextReward.name : '无'}, 需要${nextReward ? nextReward.points : 0}颗星星`);
      
      // 添加即将设置到页面的数据日志
      logger.info('rewards', `准备设置页面数据: 总星星=${totalPoints}, 即将过期星星=${expiringPointsInfo.points}, 过期日期=${expiringPointsInfo.date}`);
      logger.info('rewards', `过期信息详细数据:`, expiringPointsInfo);
      
      // 计算Tab显示逻辑
      const showTabs = availableRewards.length > 0 && claimedRewards.length > 0;
      let activeTab = this.data.activeTab;
      
      // 智能默认Tab选择
      if (showTabs) {
        // 如果两种奖励都有，保持当前Tab或默认选择可获得
        if (!activeTab || (activeTab === 'available' && availableRewards.length === 0)) {
          activeTab = 'claimed';
        } else if (activeTab === 'claimed' && claimedRewards.length === 0) {
          activeTab = 'available';
        }
      } else {
        // 如果只有一种奖励，设置对应的Tab
        activeTab = availableRewards.length > 0 ? 'available' : 'claimed';
      }
      
      logger.info('rewards', `Tab显示逻辑: showTabs=${showTabs}, activeTab=${activeTab}, 可获得=${availableRewards.length}, 已兑换=${claimedRewards.length}`);

      this.setData({
        rewards: rewards,
        availableRewards: availableRewards,
        claimedRewards: claimedRewards,
        showTabs: showTabs,
        activeTab: activeTab,
        showClaimedRewards: true, // 显示已兑换/已领取的奖励
        currentProgress: totalPoints,
        totalPoints: totalPoints,
        formattedPoints: formattedPoints,
        expiringPoints: expiringPointsInfo.points,
        expiryDate: expiringPointsInfo.date,
        rewardsEarned: unlockedRewards,
        currentLevel: Math.floor(totalPoints / 20) + 1, // 每20点升一级
        nextReward: normalizedNextReward,
        rewardEmptyMode: 'none',
        rewardEmptyTitle: '',
        rewardEmptyDescription: '',
        rewardEmptyHistoryHint: '',
        showManageRewardCTA: false,
        manageRewardCTAText: ''
      });
      
      logger.info('rewards', `设置总星星: ${totalPoints}, 即将过期总星星: ${expiringPointsInfo.points}, 最早到期日期: ${expiringPointsInfo.date}`);
      
      wx.hideLoading();
    } catch (error) {
      logger.error('rewards', '加载奖励数据失败', error);
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
  getExpiringPoints: async function() {
    logger.info('rewards', '获取即将过期的星星信息');
    
    try {
      // 获取服务实例
      const starService = serviceManager.getService('starService');
      
      if (!starService) {
        logger.error('rewards', '无法获取星星服务实例');
        return { points: 0, date: '' };
      }
      
      logger.info('rewards', '星星服务实例获取成功，开始调用getExpiringStarsInfo');
      const effectiveChildId = this._getEffectiveChildUserId();
      if (!effectiveChildId) {
        logger.info('rewards', '没有有效孩子视角，跳过即将过期星星提示');
        return { points: 0, date: '' };
      }

      const messageService = serviceManager.getService('messageService');
      if (messageService?.syncFormalRemindersIfNeeded) {
        await messageService.syncFormalRemindersIfNeeded({
          scope: 'user',
          userId: effectiveChildId
        });
      }
      
      // 获取即将过期的星星信息
      const expiringInfo = await starService.getExpiringStarsInfo(effectiveChildId);
      
      logger.info('rewards', `星星服务返回的原始数据:`, expiringInfo);
      logger.info('rewards', `即将过期星星: ${expiringInfo.points}颗, 最早到期日期: ${expiringInfo.expiryDateText}, 过期时间戳: ${expiringInfo.expiryTimestamp}`);
      
      // 构建返回结果
      const result = {
        points: expiringInfo.points,
        date: expiringInfo.expiryDateText
      };
      
      logger.info('rewards', `奖池页面返回的过期信息:`, result);
      
      return result;
    } catch (error) {
      logger.error('rewards', '获取即将过期的星星信息失败', error);
      return { points: 0, date: '' };
    }
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
    const reward = this.data.selectedReward;
    const rewardId = reward.id;
    
    if (!reward.unlocked) {
      wx.showToast({
        title: '奖励尚未解锁',
        icon: 'none'
      });
      return;
    }

    const claimDisplayStatus = rewardStatus.resolveRewardClaimStatus(reward);

    if (claimDisplayStatus !== rewardStatus.RewardClaimDisplayStatus.AVAILABLE) {
      wx.showToast({
        title: claimDisplayStatus === rewardStatus.RewardClaimDisplayStatus.DELIVERED ? '奖励已领取' : '奖励已兑换',
        icon: 'none'
      });
      return;
    }

    // 添加二次确认
    let confirmTitle = '确认兑换';
    let confirmContent = '';
    
    if (reward.protectedByExpiry) {
      confirmContent = `【${reward.name}】为星星过期保护奖励，兑换无需消耗星星。确定现在兑换吗？`;
    } else {
      confirmContent = `确定要用 ${reward.points} 颗星星兑换【${reward.name}】吗？兑换后星星将不能退回哦！`;
    }
    
    wx.showModal({
      title: confirmTitle,
      content: confirmContent,
      success: (res) => {
        if (res.confirm) {
          logger.info('rewards', `用户确认领取奖励: ${reward.name}, ${reward.protectedByExpiry ? '保护奖励' : '消耗星星: ' + reward.points}`);
          this._performClaimReward(reward);
        } else {
          logger.info('rewards', `用户取消领取奖励: ${reward.name}`);
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
        logger.error('rewards', '无法获取服务实例');
        wx.hideLoading();
        return;
      }
      
      // 获取小朋友用户ID（统一使用小朋友账户进行星星操作）
      const childUserId = this._getChildUserId();
      if (!childUserId) {
        wx.hideLoading();
        wx.showToast({
          title: '请先添加孩子',
          icon: 'none'
        });
        return;
      }
      logger.info('rewards', `使用小朋友用户ID进行奖励兑换: ${childUserId}`);
      
      // 保存原始星星数和目标星星数
      const originalPoints = this.data.totalPoints;
      const targetPoints = originalPoints - reward.points;
      
      logger.info('rewards', `领取奖励前星星数: ${originalPoints}, 用户: ${childUserId}`);
      
      // 使用新架构兑换奖励，传递小朋友用户ID
      const result = await rewardService.exchangeReward(reward.id, childUserId);
      
      if (!result.success) {
        logger.error('rewards', `兑换奖励失败: ${result.message}, 用户: ${childUserId}`);
        wx.hideLoading();
        wx.showToast({
          title: result.message || '兑换失败',
          icon: 'none'
        });
        return;
      }
      
      logger.info('rewards', `兑换奖励成功: ${reward.name}, ID=${reward.id}, ${result.protectedByExpiry ? '保护奖励' : '消耗星星: ' + reward.points}, 用户: ${childUserId}`);
      
      // 隐藏加载提示
      wx.hideLoading();
      
      // 如果是保护奖励，直接处理结果；否则播放动画
      if (result.protectedByExpiry) {
        logger.info('rewards', '保护奖励无需动画，直接处理结果');
        await this._handleExchangeSuccess(result, reward, childUserId);
        
        // 显示保护奖励兑换成功提示
        wx.showToast({
          title: '保护奖励兑换成功',
          icon: 'success',
          duration: 2000
        });
      } else {
        // 普通奖励播放星星减少动画
        this.animateStarsCount(originalPoints, targetPoints, async () => {
          await this._handleExchangeSuccess(result, reward, childUserId);
          
          // 显示普通兑换成功提示
          wx.showToast({
            title: '兑换成功',
            icon: 'success',
            duration: 2000
          });
        });
      }
    } catch (error) {
      logger.error('rewards', '兑换奖励出错', error);
      wx.hideLoading();
      wx.showToast({
        title: '操作失败，请重试',
        icon: 'none'
      });
    }
  },
  
  /**
   * 处理兑换成功的共同逻辑
   */
  _handleExchangeSuccess: async function(result, reward, childUserId) {
    // 获取服务实例
    const rewardService = serviceManager.getService('rewardService');
    const starService = serviceManager.getService('starService');
    
    // 强制清除所有缓存确保数据一致性
    logger.info('rewards', '清除缓存确保数据一致性');
    if (starService && starService.clearCache) {
      starService.clearCache();
    }
    if (rewardService && rewardService.clearCache) {
      rewardService.clearCache();
    }
    
    // 计算下一个可用奖励（用孩子的星星 vs 家长的奖励池）
    const rewardOwnerId = this._getRewardOwnerUserId();
    const effectiveChildId = this._getEffectiveChildUserId();
    const currentStars = await starService.getTotalStars(effectiveChildId);
    const nextReward = await rewardService.calculateNextAvailableReward(currentStars, rewardOwnerId);
    logger.info('rewards', `领取奖励后计算下一个可用奖励: ${nextReward.name}, 需要${nextReward.points}颗星星`);
    
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
      logger.info('rewards', '发送奖励领取事件通知');
      
      const actualCost = result.actualCost !== undefined ? result.actualCost : 
        (result.protectedByExpiry ? 0 : reward.points);
      const exchangeType = result.protectedByExpiry ? 
        (actualCost > 0 ? 'partial_protected' : 'fully_protected') : 'normal';
      
      app.globalData.eventBus.emit(EVENTS.REWARD_CLAIMED, {
        rewardId: reward.id,
        rewardName: reward.name,
        points: actualCost, // 兼容字段
        actualCost: actualCost, // 实际消耗数量
        originalPoints: reward.points, // 原始奖励积分
        displayPoints: actualCost, // 用于显示的消耗数量
        protectedByExpiry: result.protectedByExpiry || false,
        partialProtection: result.partialProtection || 0,
        exchangeType: exchangeType,
        userId: childUserId,
        operatorUserId: childUserId,
        newTotalPoints: this.data.totalPoints, // 使用当前最新的星星总数
        nextReward: nextReward,
        timestamp: Date.now()
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
    const userService = serviceManager.getUserService();
    if (!userService) {
      logger.warn('rewards', '无法获取用户服务');
      return null;
    }
    const loginUser = userService.getLoginUser ? userService.getLoginUser() : null;
    const currentUser = userService.getCurrentUser ? userService.getCurrentUser() : null;
    // 孩子设备：loginUser 本身就是孩子
    if (loginUser && loginUser.role === 'child') {
      return loginUser.userId || loginUser.id;
    }
    // 家长切到孩子视角时，优先使用当前视角孩子
    if (currentUser && currentUser.role === 'child') {
      return currentUser.userId || currentUser.id;
    }
    // 家长设备：优先用最近操作的孩子
    const app = getApp();
    const lastActiveChildId = app && app.globalData && app.globalData.lastActiveChildId;
    if (lastActiveChildId) {
      const lastActiveChild = typeof userService.getUserById === 'function'
        ? userService.getUserById(lastActiveChildId)
        : null;
      if (lastActiveChild && lastActiveChild.role === 'child') {
        logger.info('rewards', `使用最近活跃孩子ID: ${lastActiveChildId}`);
        return lastActiveChildId;
      }
      logger.info('rewards', `忽略失效的最近活跃孩子ID: ${lastActiveChildId}`);
    }
    // 兜底：取第一个孩子
    const firstChild = userService.getUserByRole('child');
    if (firstChild) {
      logger.info('rewards', `使用第一个孩子ID: ${firstChild.id}`);
      return firstChild.id;
    }
    logger.info('rewards', '当前没有可用的孩子视角，返回空孩子ID');
    return null;
  },

  /**
   * 获取奖励归属userId（家庭奖励池，由家长账号管理）
   * 家长设备：loginUserId（家长）
   * 孩子设备：loginUserId（孩子本身，M07已知限制：奖励未云端同步时不可见）
   */
  _getRewardOwnerUserId: function() {
    const userService = serviceManager.getUserService();
    if (userService && userService.getLoginUserId) {
      return userService.getLoginUserId();
    }
    return null;
  },

  // 兼容旧调用，内部改为使用 _getEffectiveChildUserId
  _getChildUserId: function() {
    return this._getEffectiveChildUserId();
  }
})
