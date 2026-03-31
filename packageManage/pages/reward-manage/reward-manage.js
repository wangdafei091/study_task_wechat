const app = getApp();
const { EVENTS } = require('../../../utils/constants');
// 新架构服务引入
const serviceManager = require('../../../services/service-manager');
const logger = require('../../../utils/logger');
const rewardStatus = require('../../../utils/reward-status');
const uiUtils = require('../../../utils/uiUtils');

function decorateRewardForManage(page, reward) {
  const recordTime = rewardStatus.getRewardPrimaryRecordTime(reward);
  const exchanged = rewardStatus.isRewardExchanged(reward);

  return {
    ...reward,
    claimDisplayStatus: rewardStatus.resolveRewardClaimStatus(reward),
    manageStatusLabel: exchanged ? rewardStatus.getRewardManageStatusLabel(reward) : '',
    recordStatusLabel: exchanged ? rewardStatus.getRewardRecordStatusLabel(reward) : '',
    recordTimeLabel: exchanged ? rewardStatus.getRewardRecordTimeLabel(reward) : '',
    recordTimestamp: recordTime,
    claimTimeDisplay: exchanged ? page.formatTimeStamp(recordTime) : ''
  };
}

Page({
  /**
   * 页面的初始数据
   */
  data: {
    // 标签页状态
    activeTab: 'manage', // 当前激活的标签页：manage(奖励设置) / claimed(兑换记录)
    
    // 奖励数据
    rewards: [], // 所有奖励
    
    // 兑换记录数据
    claimedRecords: [], // 所有兑换记录
    
    // 添加/编辑奖励相关
    showRewardModal: false, // 是否显示奖励编辑模态框
    isEditing: false, // 是否处于编辑模式
    editingReward: {}, // 当前编辑的奖励
    isFormValid: false, // 表单是否有效
    isSaving: false, // 是否正在保存，用于防止重复操作
    
    // emoji选择器数据 - 所有可用表情
    allEmojis: [
      '🎮', '🧸', '🍦', '🍪', '🍕', '🍫', '🍭', '🍿', '🍔', '🍰', '🍎', '🍒', '🥤',
      '🎬', '🎡', '🏊', '🚲', '📚', '🎨', '🚗', '🧩', '🎯', '🎭', '⚽', '🏀', '🏓', '🎾',
       '💰', '🎪', '🎠', '🧠', '🎓', '✏️', '📝', '📒', '📷', '🎵',
      '🎧', '📱', '🔍', '🎸', '🥁', '🎹', '🎤', '🎪', '🎨', '🎭', '🤹', '🎳', '🎯', '🎰'
    ],
    
    // emoji分类数据
    emojiCategories: {
      toys: ['🎮', '🧸', '🧩', '🎯', '🎪', '🎭'],
      study: ['📚', '✏️', '📝', '💻', '📱', '🔬'],
      activity: ['🏓', '🎾', '🏊', '🚲', '🎭', '🎨', '🎬', '🎡', '📷'],
      food: ['🍦', '🍪', '🍕', '🍫', '🍭', '🍿', '🍔', '🍰', '🍎',  '🥤', '🍩']
    },
    currentCategory: 'toys', // 当前选择的表情分类
    emojiList: [], // 当前显示的表情列表
    
    // 操作菜单相关
    showActionSheet: false, // 是否显示操作菜单
    selectedReward: null, // 当前选中的奖励
    
    // 确认对话框相关
    showConfirmDialog: false, // 是否显示确认对话框
    confirmDialogTitle: '',
    confirmDialogMessage: '', // 确认对话框消息
    confirmDialogAction: null, // 确认对话框确认操作
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    logger.info('RewardManage', '页面加载');
    
    // 加载奖励数据
    await this.loadRewardsData();
    
    // 加载兑换记录
    await this.loadClaimedRecords();
    
    // 初始化表情列表
    this.setData({
      emojiList: this.data.emojiCategories.toys
    });
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: async function () {
    logger.info('RewardManage', '页面显示');

    try {
      const rewardService = serviceManager.getService('rewardService');
      if (rewardService?.refreshRewardsFromCloud) {
        await rewardService.refreshRewardsFromCloud({
          force: app.globalData.needRefreshReward === true
        });
      }
    } catch (syncError) {
      logger.warn('RewardManage', '奖励管理页 onShow 云同步失败，继续使用本地数据', syncError);
    }
    
    // 重新加载数据，确保数据最新
    await this.loadRewardsData();
    await this.loadClaimedRecords();
  },

  onPullDownRefresh: async function() {
    try {
      const rewardService = serviceManager.getService('rewardService');
      if (rewardService?.refreshRewardsFromCloud) {
        await rewardService.refreshRewardsFromCloud({ force: true });
      }

      await this.loadRewardsData();
      await this.loadClaimedRecords();
    } catch (error) {
      logger.warn('RewardManage', '奖励管理页下拉强制刷新失败，继续保留当前数据', error);
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
   * 切换标签页
   */
  switchTab: function(e) {
    const tab = e.currentTarget.dataset.tab;
    logger.debug('RewardManage', `切换标签页: ${tab}`);
    
    if (this.data.activeTab !== tab) {
      this.setData({
        activeTab: tab
      });
      
      // 如果切换到兑换记录标签，刷新兑换记录
      if (tab === 'claimed') {
        this.loadClaimedRecords();
      }
    }
  },
  
  /**
   * 加载奖励数据
   */
  loadRewardsData: async function() {
    logger.info('RewardManage', '加载奖励数据');
    
    try {
      wx.showLoading({ title: '加载中' });
      
      // 获取服务实例
      const rewardService = serviceManager.getService('rewardService');
      
      if (!rewardService) {
        logger.error('RewardManage', '无法获取奖励服务实例');
        wx.hideLoading();
        return;
      }
      
      // 获取所有奖励
      let allRewards = await rewardService.getAllRewards();
      logger.debug('RewardManage', `获取到 ${allRewards.length} 个奖励`);
      
      // 检查是否存在自定义奖励标记（这个逻辑应该由服务层处理）
      let hasCustomRewards = false;
      try {
        // 通过配置服务检查，而不是直接访问存储
        const configService = serviceManager.getService('config');
        if (configService) {
          hasCustomRewards = configService.hasCustomRewards();
        } else {
          // 通过奖励服务检查（向后兼容）
          const rewardService = serviceManager.getService('rewardService');
          if (rewardService && typeof rewardService.hasCustomRewards === 'function') {
            hasCustomRewards = await rewardService.hasCustomRewards();
          } else {
            // 降级处理：直接使用存储
            hasCustomRewards = wx.getStorageSync('has_custom_rewards') === true;
            logger.warn('RewardManage', '配置服务不可用，使用降级存储访问');
          }
        }
      } catch (e) {
        logger.warn('RewardManage', '获取自定义奖励标记失败', e);
      }
      
      // 如果没有奖励数据，且没有自定义奖励标记，尝试主动调用calculateNextAvailableReward来初始化示例奖励
      if (allRewards.length === 0 && !hasCustomRewards) {
        logger.info('RewardManage', '没有奖励数据且无自定义奖励标记，尝试初始化示例奖励');
        const nextReward = await rewardService.calculateNextAvailableReward();
        logger.debug('RewardManage', '示例奖励初始化结果:', nextReward);
        
        // 重新获取所有奖励
        allRewards = await rewardService.getAllRewards();
        logger.debug('RewardManage', `重新获取到 ${allRewards.length} 个奖励`);
      } else if (allRewards.length === 0 && hasCustomRewards) {
        logger.info('RewardManage', '检测到自定义奖励标记，但当前没有奖励数据，可能是用户已清理所有奖励');
      }
      
      const displayRewards = allRewards.map((reward) => decorateRewardForManage(this, reward));

      // 直接设置奖励数据
      this.setData({ rewards: displayRewards });
      
      wx.hideLoading();
    } catch (error) {
      logger.error('RewardManage', '加载奖励数据失败', error);
      wx.hideLoading();
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none'
      });
    }
  },
  
  /**
   * 加载兑换记录
   */
  loadClaimedRecords: async function() {
    logger.debug('RewardManage', `加载兑换记录`);
    
    try {
      // 获取服务实例
      const rewardService = serviceManager.getService('rewardService');
      
      if (!rewardService) {
        logger.error('RewardManage', '无法获取奖励服务实例');
        return;
      }
      
      // 获取已兑换的奖励
      const claimedRewards = await rewardService.getClaimedRewards();
      logger.debug('RewardManage', `获取到 ${claimedRewards.length} 个已兑换奖励`);
      
      const records = claimedRewards.map((reward) => decorateRewardForManage(this, reward));
      
      // 按最新兑换/领取时间倒序排列
      records.sort((a, b) => b.recordTimestamp - a.recordTimestamp);
      
      this.setData({
        claimedRecords: records
      });
      
      logger.debug('RewardManage', `加载了 ${records.length} 条兑换记录`);
    } catch (error) {
      logger.error('RewardManage', '加载兑换记录失败', error);
      wx.showToast({
        title: '加载记录失败',
        icon: 'none'
      });
    }
  },
  
  /**
   * 格式化时间戳为可读时间
   */
  formatTimeStamp: function(timestamp) {
    if (!timestamp) return '未知时间';
    
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');
    
    return `${year}-${month}-${day} ${hour}:${minute}`;
  },
  
  /**
   * 显示添加奖励模态框
   */
  showAddRewardModal: function() {
    logger.info('RewardManage', '显示添加奖励模态框');
    
    // 创建一个新的奖励对象
    const newReward = {
      id: 'reward_' + Date.now(),
      name: '',
      points: 10,
      icon: '🎁',
      enabled: true,
      claimed: false,
      isExample: false, // 新创建奖励不是示例
      createTime: Date.now()
    };
    
    this.setData({
      showRewardModal: true,
      isEditing: false,
      editingReward: newReward,
      isFormValid: false // 初始表单无效，需要输入名称
    });
  },
  
  /**
   * 显示奖励操作菜单
   */
  showRewardOptions: function(e) {
    const id = e.currentTarget.dataset.id;
    const reward = this.data.rewards.find(r => r.id === id);
    
    if (reward) {
      logger.debug('RewardManage', `显示奖励操作菜单: ${reward.name}`);
      
      this.setData({
        showActionSheet: true,
        selectedReward: reward
      });
    }
  },
  
  /**
   * 关闭操作菜单
   */
  closeActionSheet: function() {
    logger.debug('RewardManage', '关闭操作菜单');
    
    this.setData({
      showActionSheet: false
    });
  },
  
  /**
   * 编辑奖励
   */
  editReward: function() {
    const reward = this.data.selectedReward;
    
    if (reward) {
      logger.debug('RewardManage', `编辑奖励: ${reward.name}`);
      
      this.setData({
        showActionSheet: false,
        showRewardModal: true,
        isEditing: true,
        editingReward: { ...reward },
        isFormValid: true // 编辑模式初始表单有效
      });
    }
  },
  
  /**
   * 确认删除奖励
   */
  confirmDeleteReward: function() {
    const reward = this.data.selectedReward;
    
    if (reward && !reward.claimed) {
      logger.debug('RewardManage', `确认删除奖励: ${reward.name}`);
      
      this.setData({
        showActionSheet: false,
        showConfirmDialog: true,
        confirmDialogTitle: '删除奖励',
        confirmDialogMessage: `确定要删除"${reward.name}"奖励吗？`,
        confirmDialogAction: this.deleteReward
      });
    }
  },
  
  /**
   * 删除奖励
   */
  deleteReward: async function() {
    const reward = this.data.selectedReward;
    
    if (reward && !reward.claimed) {
      logger.info('RewardManage', `删除奖励开始: ${reward.name}, ID=${reward.id}`, { points: reward.points });
      
      try {
        // 显示加载提示
        wx.showLoading({ title: '删除中...' });
        
        // 获取服务实例
        const rewardService = serviceManager.getService('rewardService');
        
        if (!rewardService) {
          logger.error('RewardManage', '无法获取奖励服务实例');
          throw new Error('无法获取奖励服务实例');
        }
        
        // 调用领域服务删除奖励
        const deleteResult = await rewardService.deleteReward(reward.id);
        
        if (!deleteResult || !deleteResult.success) {
          logger.warn('RewardManage', `删除奖励失败: ${deleteResult?.message || '未知错误'}`, { rewardId: reward.id });
          throw new Error(deleteResult?.message || '删除奖励失败');
        }
        
        logger.info('RewardManage', `通过服务成功删除奖励: ${reward.name}, ID=${reward.id}`);
        
        // 更新UI状态
        this.setData({
          showConfirmDialog: false,
          selectedReward: null
        });
        
        // 重新加载数据以确保数据同步
        await this.loadRewardsData();
        
        // 通知其他页面刷新奖励数据
        const app = getApp();
        app.globalData.needRefreshReward = true;
        
        // 如果有事件总线，发送奖励删除事件
        if (app.globalData.eventBus) {
          app.globalData.eventBus.emit(EVENTS.REWARD_DELETED, {
            rewardId: reward.id
          });
          logger.info('RewardManage', `已触发奖励删除事件: ${reward.id}`);
        }
        
        wx.hideLoading();
        
        // 显示成功提示
        wx.showToast({
          title: '删除成功',
          icon: 'success',
          duration: 2000
        });
      } catch (error) {
        logger.error('RewardManage', `删除奖励失败: ${error.message || error}`, { rewardId: reward.id });
        wx.hideLoading();
        
        wx.showToast({
          title: '删除失败，请重试',
          icon: 'none',
          duration: 2000
        });
      }
    }
  },
  
  /**
   * 确认重新添加奖励到奖池
   */
  confirmReactivateReward: function() {
    const reward = this.data.selectedReward;
    
    if (reward && reward.claimed) {
      logger.debug('RewardManage', `确认重新添加奖励到奖池: ${reward.name}`);
      
      this.setData({
        showActionSheet: false,
        showConfirmDialog: true,
        confirmDialogTitle: '重新添加到奖池',
        confirmDialogMessage: `确定要将"${reward.name}"重新添加到奖池吗？`,
        confirmDialogAction: this.reactivateReward
      });
    }
  },
  
  /**
   * 重新添加奖励到奖池
   */
  reactivateReward: async function() {
    const reward = this.data.selectedReward || this.data.editingReward;
    
    if (reward && reward.claimed) {
      logger.debug('RewardManage', `重新添加奖励到奖池: ${reward.name}`);
      
      try {
        // 显示加载提示
        wx.showLoading({ title: '处理中...' });
        
        // 获取服务实例
        const rewardService = serviceManager.getService('rewardService');
        
        if (!rewardService) {
          logger.error('RewardManage', '无法获取奖励服务实例');
          throw new Error('无法获取奖励服务实例');
        }
        
        // 使用服务层方法复制/重新激活奖励
        const result = await rewardService.duplicateReward(reward.id);
        
        if (!result || !result.success) {
          throw new Error(result?.message || '添加奖励到奖池失败');
        }
        
        logger.info('RewardManage', `通过服务成功添加奖励到奖池: ${reward.name}, 新ID=${result.reward?.id}`);
        
        // 更新UI状态
        this.setData({
          showConfirmDialog: false,
          showRewardModal: false,
          selectedReward: null
        });
        
        // 重新加载数据以确保数据同步
        await this.loadRewardsData();
        
        // 通知其他页面刷新奖励数据
        const app = getApp();
        app.globalData.needRefreshReward = true;
        
        // 如果有事件总线，发送奖励添加事件
        if (app.globalData.eventBus) {
          app.globalData.eventBus.emit(EVENTS.REWARD_CREATED, {
            reward: result.reward,
            isReactivation: true
          });
        }
        
        wx.hideLoading();
        
        // 显示成功提示
        wx.showToast({
          title: '已添加到奖池',
          icon: 'success',
          duration: 2000
        });
      } catch (error) {
        logger.error('RewardManage', '添加奖励到奖池失败:', error);
        wx.hideLoading();
        
        wx.showToast({
          title: '操作失败，请重试',
          icon: 'none',
          duration: 2000
        });
      }
    }
  },
  
  /**
   * 关闭奖励模态框
   */
  closeRewardModal: function() {
    logger.debug('RewardManage', '关闭奖励模态框');
    
    this.setData({
      showRewardModal: false
    });
  },
  
  /**
   * 奖励名称输入
   */
  onNameInput: function(e) {
    const name = e.detail.value;
    
    // 使用ValidationService进行实时验证
    const validationService = serviceManager.getService('validation');
    let isValid = false;
    
    if (validationService) {
      const validationResult = validationService.validateTextField(name, '奖励名称', { 
        required: true,
        minLength: 1,
        maxLength: 50 
      });
      isValid = validationResult.valid;
    } else {
      // 降级处理：使用本地验证
      isValid = name.trim().length > 0;
    }
    
    this.setData({
      'editingReward.name': name,
      isFormValid: isValid
    });
  },
  
  /**
   * 选择表情
   */
  selectEmoji: function(e) {
    const emoji = e.currentTarget.dataset.emoji;
    
    logger.debug('RewardManage', `选择表情: ${emoji}`);
    
    // 添加震动反馈
    if (wx.vibrateShort) {
      wx.vibrateShort({ type: 'light' });
    }
    
    this.setData({
      'editingReward.icon': emoji
    });
  },
  
  /**
   * 切换表情分类
   */
  switchEmojiCategory: function(e) {
    const category = e.currentTarget.dataset.category;
    
    logger.debug('RewardManage', `切换表情分类: ${category}`);
    
    this.setData({
      currentCategory: category,
      emojiList: this.data.emojiCategories[category] || this.data.emojiCategories.toys
    });
  },
  
  /**
   * 星星数量输入
   */
  onPointsInput: function(e) {
    const points = parseInt(e.detail.value) || 0;
    
    this.setData({
      'editingReward.points': points
    });
  },
  
  /**
   * 减少星星数量
   */
  decreasePoints: function() {
    const reward = this.data.editingReward;
    
    // 已领取的奖励不能修改星星数
    if (reward.claimed) return;
    
    const points = Math.max(1, (reward.points || 0) - 1);
    
    this.setData({
      'editingReward.points': points
    });
  },
  
  /**
   * 增加星星数量
   */
  increasePoints: function() {
    const reward = this.data.editingReward;
    
    // 已领取的奖励不能修改星星数
    if (reward.claimed) return;
    
    const points = (reward.points || 0) + 1;
    
    this.setData({
      'editingReward.points': points
    });
  },
  
  /**
   * 启用状态切换
   */
  onEnabledChange: function(e) {
    const enabled = e.detail.value;
    
    this.setData({
      'editingReward.enabled': enabled
    });
  },
  
  /**
   * 保存奖励
   */
  saveReward: async function() {
    const reward = this.data.editingReward;
    
    // 使用ValidationService验证奖励表单
    const validationService = serviceManager.getService('validation');
    if (validationService) {
      const validationResult = validationService.validateRewardForm({
        name: reward.name,
        requiredStars: reward.points,
        description: reward.description || '',
        isActive: reward.enabled
      });
      
      if (!validationResult.valid) {
        wx.showToast({
          title: validationResult.errorMsg,
          icon: 'none',
          duration: 2000
        });
        return;
      }
      
      logger.debug('RewardManage', `奖励表单验证通过: ${reward.name}`);
    } else {
      // 降级处理：使用本地验证
      if (!reward.name.trim()) {
        wx.showToast({
          title: '请输入奖励名称',
          icon: 'none',
          duration: 2000
        });
        return;
      }
      logger.debug('RewardManage', `本地奖励验证通过: ${reward.name}`);
    }
    
    logger.debug('RewardManage', `保存奖励: ${reward.name}`);
    
    // 设置操作锁定，防止重复操作
    this.setData({
      isSaving: true
    });
    
    try {
      let processedReward = reward;
      
      // 检查是否正在编辑示例奖励
      const isEditingExample = this.data.isEditing && reward.isExample === true;
      if (isEditingExample) {
        logger.info('RewardManage', `检测到编辑示例奖励，将转换为自定义奖励: ${reward.name}`);
        
        // 创建新的自定义奖励对象
        processedReward = {
          ...reward,
          id: `reward_custom_${Date.now()}`, // 使用新ID，避免与示例ID格式匹配
          createTime: Date.now()             // 更新创建时间
        };
        
        // 明确移除示例标记
        delete processedReward.isExample;
        
        // 标记需要刷新奖励数据
        const app = getApp();
        app.globalData.needRefreshReward = true;
        
        logger.debug('RewardManage', `示例奖励已转换为自定义奖励，新ID: ${processedReward.id}`);
      }
      
      // 获取服务实例 - 使用服务来保存奖励数据
      const rewardService = serviceManager.getService('rewardService');
      
      if (!rewardService) {
        logger.error('RewardManage', '无法获取奖励服务实例');
        throw new Error('无法获取奖励服务实例');
      }
      
      // 保存奖励到数据库/存储
      let saveResult;
      if (this.data.isEditing) {
        if (processedReward.id !== reward.id) {
          // 如果ID已经改变（示例转自定义），先保存新自定义奖励
          saveResult = await rewardService.createReward(processedReward);
        } else {
          // 常规编辑，更新已有奖励
          saveResult = await rewardService.updateReward(processedReward.id, processedReward);
        }
      } else {
        // 添加模式：添加新奖励
        saveResult = await rewardService.createReward(processedReward);
      }
      
      if (!saveResult || !saveResult.success) {
        throw new Error(saveResult?.message || '保存奖励失败');
      }
      
      logger.info('RewardManage', '奖励保存成功:', processedReward);
      
      // 检查是否是首次创建自定义奖励或编辑示例奖励转为自定义奖励
      // 首次创建自定义奖励的条件：不是编辑模式，当前奖励不是示例，且所有已有奖励都是示例
      const hasCustomRewards = this.data.rewards.some(r => r.isExample !== true);
      const isFirstCustom = !this.data.isEditing && processedReward.isExample !== true && !hasCustomRewards;
      let needClearExample = isFirstCustom || isEditingExample;
      let examplesCleared = false;
      
      // 更新界面状态
      this.setData({
        showRewardModal: false
      });
      
      // 如果是首次创建自定义奖励或编辑示例奖励转为自定义奖励，立即清理示例奖励
      if (needClearExample) {
        logger.info('RewardManage', '检测到首次创建自定义奖励或编辑示例奖励转为自定义，立即清理示例');
        
        // 异步执行清理操作
        examplesCleared = await this.clearUnclaimedExampleRewards();
        
        // 如果清理了示例奖励，使用更新后的奖励列表
        if (examplesCleared) {
          // 服务层已经处理了数据持久化，不需要重新获取rewards
          logger.info('RewardManage', '示例奖励已清理，服务层已处理数据持久化');
        }
      }
      
      // 重新加载奖励数据
      await this.loadRewardsData();
      
      // 设置全局标记，通知其他页面需要刷新奖励数据
      const app = getApp();
      app.globalData.needRefreshReward = true;
      
      // 如果有事件总线，发送奖励更新事件
      if (app.globalData.eventBus) {
        app.globalData.eventBus.emit(EVENTS.REWARD_UPDATED, {
          type: this.data.isEditing ? 'edit' : 'add',
          reward: processedReward
        });
      }
      
      // 根据操作类型和清理结果显示不同提示信息
      if (needClearExample && examplesCleared) {
        wx.showToast({
          title: '保存成功',
          icon: 'success',
          duration: 2000
        });
      } else {
        wx.showToast({
          title: this.data.isEditing ? '更新成功' : '添加成功',
          icon: 'success',
          duration: 2000
        });
      }
    } catch (error) {
      logger.error('RewardManage', '保存奖励失败:', error);
      wx.showToast({
        title: '保存失败，请重试',
        icon: 'none',
        duration: 2000
      });
    } finally {
      // 解除操作锁定
      this.setData({
        isSaving: false
      });
    }
  },
  
  /**
   * 清理未被领取的示例奖励
   * @returns {Promise<Boolean>} 是否清理了示例奖励
   */
  clearUnclaimedExampleRewards: async function() {
    logger.debug('RewardManage', '尝试清理未领取的示例奖励');
    
    try {
      // 获取服务实例
      const rewardService = serviceManager.getService('rewardService');
      
      if (!rewardService) {
        logger.error('RewardManage', '无法获取奖励服务实例');
        return false;
      }
      
      // 获取所有奖励
      const allRewards = await rewardService.getAllRewards();
      
      // 检查是否存在自定义奖励
      const customRewards = allRewards.filter(r => r.isExample !== true);
      const hasCustomRewards = customRewards.length > 0;
      
      // 筛选出未被领取的示例奖励
      const unclaimedExamples = allRewards.filter(r => r.isExample === true && !r.claimed);
      
      if (unclaimedExamples.length === 0) {
        logger.debug('RewardManage', '没有未领取的示例奖励，无需清理');
        return false;
      }
      
      logger.debug('RewardManage', `发现 ${unclaimedExamples.length} 个未领取的示例奖励，开始清理`);
      
      // 使用服务层方法批量物理删除
      const deleteResult = await rewardService.deleteRewards(unclaimedExamples.map(r => r.id));
      
      if (deleteResult.success) {
        logger.info('RewardManage', `清理了 ${unclaimedExamples.length} 个未领取的示例奖励`);
        
        // 如果有自定义奖励，通过配置服务设置标记，防止系统自动重新初始化示例奖励
        if (hasCustomRewards) {
          try {
            const configService = serviceManager.getService('config');
            if (configService) {
              configService.setCustomRewards(true);
            } else {
              // 通过奖励服务设置（向后兼容）
              const rewardService = serviceManager.getService('rewardService');
              if (rewardService && typeof rewardService.setCustomRewardsFlag === 'function') {
                await rewardService.setCustomRewardsFlag(true);
              } else {
                // 降级处理：直接使用存储
                wx.setStorageSync('has_custom_rewards', true);
                logger.warn('RewardManage', '配置服务不可用，使用降级存储访问');
              }
            }
            logger.info('RewardManage', '设置了自定义奖励标记，防止重新初始化示例奖励');
          } catch (e) {
            logger.error('RewardManage', '设置自定义奖励标记失败', e);
          }
        }
        
        // 通知其他页面更新
        const app = getApp();
        app.globalData.needRefreshReward = true;
        
        // 发送示例奖励清理事件
        if (app.globalData.eventBus) {
          app.globalData.eventBus.emit(EVENTS.REWARD_EXAMPLES_CLEARED, {
            count: unclaimedExamples.length
          });
        }
        
        // 更新本地数据
        await this.loadRewardsData();
        
        return true;
      } else {
        logger.error('RewardManage', '清理示例奖励失败');
        return false;
      }
    } catch (error) {
      logger.error('RewardManage', '清理示例奖励发生错误:', error);
      return false;
    }
  },
  
  /**
   * 取消确认对话框
   */
  cancelConfirmDialog: function() {
    logger.debug('RewardManage', '取消确认对话框');
    
    this.setData({
      showConfirmDialog: false
    });
  },
  
  /**
   * 确认对话框确认操作
   */
  confirmDialogAction: function() {
    logger.debug('RewardManage', '执行确认对话框操作');
    
    // 执行存储的确认操作
    if (typeof this.data.confirmDialogAction === 'function') {
      this.data.confirmDialogAction();
    }
  },
});
