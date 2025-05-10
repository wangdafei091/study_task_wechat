const app = getApp();

Page({
  /**
   * 页面的初始数据
   */
  data: {
    // 标签页状态
    activeTab: 'manage', // 当前激活的标签页：manage(奖励设置) / claimed(领取记录)
    
    // 奖励数据
    rewards: [], // 所有奖励
    
    // 领取记录数据
    claimedRecords: [], // 所有领取记录
    claimedFilter: 'all', // 领取记录筛选: all(全部) / pending(待领取) / delivered(已领取)
    
    // 添加/编辑奖励相关
    showRewardModal: false, // 是否显示奖励编辑模态框
    isEditing: false, // 是否处于编辑模式
    editingReward: {}, // 当前编辑的奖励
    isFormValid: false, // 表单是否有效
    
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
    confirmDialogTitle: '', // 确认对话框标题
    confirmDialogMessage: '', // 确认对话框消息
    confirmDialogAction: null, // 确认对话框确认操作
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    console.log('[RewardManage] 页面加载');
    
    // 加载奖励数据
    this.loadRewardsData();
    
    // 加载领取记录
    this.loadClaimedRecords();
    
    // 初始化表情列表
    this.setData({
      emojiList: this.data.emojiCategories.toys
    });
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    console.log('[RewardManage] 页面显示');
    
    // 重新加载数据，确保数据最新
    this.loadRewardsData();
    this.loadClaimedRecords();
  },
  
  /**
   * 切换标签页
   */
  switchTab: function(e) {
    const tab = e.currentTarget.dataset.tab;
    console.log(`[RewardManage] 切换标签页: ${tab}`);
    
    if (this.data.activeTab !== tab) {
      this.setData({
        activeTab: tab
      });
      
      // 如果切换到领取记录标签，刷新领取记录
      if (tab === 'claimed') {
        this.loadClaimedRecords();
      }
    }
  },
  
  /**
   * 设置领取记录筛选
   */
  setClaimedFilter: function(e) {
    const filter = e.currentTarget.dataset.filter;
    console.log(`[RewardManage] 设置领取记录筛选: ${filter}`);
    
    this.setData({
      claimedFilter: filter
    });
    
    // 根据筛选条件重新加载领取记录
    this.loadClaimedRecords(filter);
  },
  
  /**
   * 加载奖励数据
   */
  loadRewardsData: function() {
    console.log('[RewardManage] 加载奖励数据');
    
    // 从本地存储获取奖励数据
    const rewards = wx.getStorageSync('rewards') || [];
    
    // 如果没有奖励数据，使用默认数据
    if (rewards.length === 0) {
      console.log('[RewardManage] 没有找到奖励数据，使用默认数据');
      const defaultRewards = app.getDefaultRewards ? app.getDefaultRewards() : this.getDefaultRewards();
      this.setData({ rewards: defaultRewards });
      // 保存默认奖励到本地存储
      wx.setStorageSync('rewards', defaultRewards);
    } else {
      console.log(`[RewardManage] 找到 ${rewards.length} 个奖励`);
      this.setData({ rewards });
    }
  },
  
  /**
   * 获取默认奖励数据
   */
  getDefaultRewards: function() {
    return [
      {
        id: 'reward_' + Date.now() + '_1',
        name: '看动画片30分钟',
        points: 10,
        icon: '🎬',
        enabled: true,
        claimed: false,
        createTime: Date.now()
      },
      {
        id: 'reward_' + Date.now() + '_2',
        name: '额外的零食',
        points: 20,
        icon: '🍪',
        enabled: true,
        claimed: false,
        createTime: Date.now() + 1
      },
      {
        id: 'reward_' + Date.now() + '_3',
        name: '玩游戏1小时',
        points: 30,
        icon: '🎮',
        enabled: true,
        claimed: false,
        createTime: Date.now() + 2
      }
    ];
  },
  
  /**
   * 加载领取记录
   */
  loadClaimedRecords: function(filter = null) {
    console.log(`[RewardManage] 加载领取记录，筛选: ${filter || this.data.claimedFilter}`);
    
    // 从本地存储获取已领取的奖励
    const rewards = wx.getStorageSync('rewards') || [];
    const claimedRewards = rewards.filter(r => r.claimed);
    
    // 处理记录，添加显示用的时间格式
    const records = claimedRewards.map(r => {
      return {
        ...r,
        claimTimeDisplay: this.formatTimeStamp(r.claimTime)
      };
    });
    
    // 根据筛选条件过滤记录
    let filteredRecords = records;
    const filterType = filter || this.data.claimedFilter;
    
    if (filterType === 'pending') {
      filteredRecords = records.filter(r => r.claimStatus !== 'delivered');
    } else if (filterType === 'delivered') {
      filteredRecords = records.filter(r => r.claimStatus === 'delivered');
    }
    
    // 按领取时间倒序排列
    filteredRecords.sort((a, b) => b.claimTime - a.claimTime);
    
    this.setData({
      claimedRecords: filteredRecords
    });
    
    console.log(`[RewardManage] 加载了 ${filteredRecords.length} 条领取记录`);
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
    console.log('[RewardManage] 显示添加奖励模态框');
    
    // 创建一个新的奖励对象
    const newReward = {
      id: 'reward_' + Date.now(),
      name: '',
      points: 10,
      icon: '🎁',
      enabled: true,
      claimed: false,
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
      console.log(`[RewardManage] 显示奖励操作菜单: ${reward.name}`);
      
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
    console.log('[RewardManage] 关闭操作菜单');
    
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
      console.log(`[RewardManage] 编辑奖励: ${reward.name}`);
      
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
      console.log(`[RewardManage] 确认删除奖励: ${reward.name}`);
      
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
  deleteReward: function() {
    const reward = this.data.selectedReward;
    
    if (reward && !reward.claimed) {
      console.log(`[RewardManage] 删除奖励: ${reward.name}`);
      
      // 从奖励列表中删除
      const updatedRewards = this.data.rewards.filter(r => r.id !== reward.id);
      
      // 更新数据
      this.setData({
        rewards: updatedRewards,
        showConfirmDialog: false,
        selectedReward: null
      });
      
      // 保存到本地存储
      wx.setStorageSync('rewards', updatedRewards);
      
      // 显示提示
      wx.showToast({
        title: '删除成功',
        icon: 'success',
        duration: 2000
      });
    }
  },
  
  /**
   * 确认重新添加奖励到奖池
   */
  confirmReactivateReward: function() {
    const reward = this.data.selectedReward;
    
    if (reward && reward.claimed) {
      console.log(`[RewardManage] 确认重新添加奖励到奖池: ${reward.name}`);
      
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
  reactivateReward: function() {
    const reward = this.data.selectedReward || this.data.editingReward;
    
    if (reward && reward.claimed) {
      console.log(`[RewardManage] 重新添加奖励到奖池: ${reward.name}`);
      
      // 创建新的奖励实例
      const newReward = {
        id: 'reward_' + Date.now(),
        name: reward.name,
        points: reward.points,
        icon: reward.icon,
        enabled: true,
        claimed: false,
        createTime: Date.now(),
        originRewardId: reward.id
      };
      
      // 添加到奖励列表
      const updatedRewards = [...this.data.rewards, newReward];
      
      // 更新数据
      this.setData({
        rewards: updatedRewards,
        showConfirmDialog: false,
        showRewardModal: false,
        selectedReward: null
      });
      
      // 保存到本地存储
      wx.setStorageSync('rewards', updatedRewards);
      
      // 显示提示
      wx.showToast({
        title: '已添加到奖池',
        icon: 'success',
        duration: 2000
      });
    }
  },
  
  /**
   * 关闭奖励模态框
   */
  closeRewardModal: function() {
    console.log('[RewardManage] 关闭奖励模态框');
    
    this.setData({
      showRewardModal: false
    });
  },
  
  /**
   * 奖励名称输入
   */
  onNameInput: function(e) {
    const name = e.detail.value;
    
    this.setData({
      'editingReward.name': name,
      isFormValid: name.trim().length > 0
    });
  },
  
  /**
   * 选择表情
   */
  selectEmoji: function(e) {
    const emoji = e.currentTarget.dataset.emoji;
    
    console.log(`[RewardManage] 选择表情: ${emoji}`);
    
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
    
    console.log(`[RewardManage] 切换表情分类: ${category}`);
    
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
  saveReward: function() {
    const reward = this.data.editingReward;
    
    if (!reward.name.trim()) {
      wx.showToast({
        title: '请输入奖励名称',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    console.log(`[RewardManage] 保存奖励: ${reward.name}`);
    
    let updatedRewards = [];
    
    if (this.data.isEditing) {
      // 编辑模式：更新现有奖励
      updatedRewards = this.data.rewards.map(r => {
        if (r.id === reward.id) {
          return reward;
        }
        return r;
      });
    } else {
      // 添加模式：添加新奖励
      updatedRewards = [...this.data.rewards, reward];
    }
    
    // 更新数据
    this.setData({
      rewards: updatedRewards,
      showRewardModal: false
    });
    
    // 保存到本地存储
    wx.setStorageSync('rewards', updatedRewards);
    
    // 显示提示
    wx.showToast({
      title: this.data.isEditing ? '更新成功' : '添加成功',
      icon: 'success',
      duration: 2000
    });
  },
  
  /**
   * 标记奖励为已领取
   */
  markAsDelivered: function(e) {
    const id = e.currentTarget.dataset.id;
    const record = this.data.claimedRecords.find(r => r.id === id);
    
    if (record) {
      console.log(`[RewardManage] 标记奖励已领取: ${record.name}`);
      
      // 更新状态
      const updatedRewards = this.data.rewards.map(r => {
        if (r.id === id) {
          return {
            ...r,
            claimStatus: 'delivered'
          };
        }
        return r;
      });
      
      // 更新数据
      this.setData({
        rewards: updatedRewards
      });
      
      // 刷新领取记录
      this.loadClaimedRecords();
      
      // 保存到本地存储
      wx.setStorageSync('rewards', updatedRewards);
      
      // 显示提示
      wx.showToast({
        title: '已标记为领取',
        icon: 'success',
        duration: 2000
      });
    }
  },
  
  /**
   * 取消确认对话框
   */
  cancelConfirmDialog: function() {
    console.log('[RewardManage] 取消确认对话框');
    
    this.setData({
      showConfirmDialog: false
    });
  },
  
  /**
   * 确认对话框确认操作
   */
  confirmDialogAction: function() {
    console.log('[RewardManage] 执行确认对话框操作');
    
    // 执行存储的确认操作
    if (typeof this.data.confirmDialogAction === 'function') {
      this.data.confirmDialogAction();
    }
  }
});
