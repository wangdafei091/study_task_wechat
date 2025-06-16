// pages/my-exchanges/my-exchanges.js
const logger = require('../../../utils/logger');
const serviceManager = require('../../../services/service-manager');

Page({

  /**
   * 页面的初始数据
   */
  data: {
    claimedRewards: [] // 已领取的奖励
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    logger.debug('MyExchanges', '页面加载');
    this.loadClaimedRewards();
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
    logger.debug('MyExchanges', '页面显示');
    this.loadClaimedRewards();
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
   * 加载已领取奖励数据
   */
  loadClaimedRewards: function() {
    logger.debug('MyExchanges', '加载已领取奖励数据');
    
    // 通过奖励服务获取已领取的奖励
    const rewardService = serviceManager.getService('reward');
    
    if (rewardService) {
      // 使用服务层获取已领取奖励
      rewardService.getClaimedRewards()
        .then(claimedRewards => {
          logger.info('MyExchanges', `通过奖励服务获取已领取奖励成功，数量=${claimedRewards.length}`);
          
          // 处理记录，添加显示用的时间格式
          const formattedRewards = claimedRewards.map(r => {
            return {
              ...r,
              claimTimeDisplay: this.formatTimeStamp(r.claimTime || r.createTime)
              // 所有兑换的奖励现在都是delivered状态，统一显示为已领取
            };
          });
          
          // 按领取时间倒序排列
          formattedRewards.sort((a, b) => b.claimTime - a.claimTime);
          
          this.setData({
            claimedRewards: formattedRewards
          });
          
          // 添加状态日志
          formattedRewards.forEach(r => {
            logger.debug('MyExchanges', `奖励[${r.name}]的显示状态: 已领取, 原始claimed值: ${r.claimed}, claimStatus: ${r.claimStatus}`);
          });
          
          logger.debug('MyExchanges', `加载了 ${formattedRewards.length} 条已领取奖励记录`);
        })
        .catch(error => {
          logger.error('MyExchanges', '通过奖励服务获取已领取奖励失败', error);
          
          // 降级处理：直接从存储获取
          this.loadClaimedRewardsFromStorage();
        });
    } else {
      logger.warn('MyExchanges', '奖励服务不可用，使用降级存储访问');
      
      // 降级处理：直接从存储获取
      this.loadClaimedRewardsFromStorage();
    }
  },
  
  /**
   * 降级处理：从存储直接加载已领取奖励数据
   */
  loadClaimedRewardsFromStorage: function() {
    logger.warn('MyExchanges', '使用降级方式从存储加载已领取奖励数据');
    
    try {
      // 从本地存储获取所有奖励
      const rewards = wx.getStorageSync('rewards') || [];
      
      // 筛选出已领取的奖励
      const claimedRewards = rewards.filter(r => r.claimed);
      
      // 处理记录，添加显示用的时间格式
      const formattedRewards = claimedRewards.map(r => {
        return {
          ...r,
          claimTimeDisplay: this.formatTimeStamp(r.claimTime || r.createTime)
        };
      });
      
      // 按领取时间倒序排列
      formattedRewards.sort((a, b) => b.claimTime - a.claimTime);
      
      this.setData({
        claimedRewards: formattedRewards
      });
      
      logger.info('MyExchanges', `降级方式加载了 ${formattedRewards.length} 条已领取奖励记录`);
    } catch (error) {
      logger.error('MyExchanges', '降级加载已领取奖励失败', error);
      
      // 设置空数据
      this.setData({
        claimedRewards: []
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
  }
})