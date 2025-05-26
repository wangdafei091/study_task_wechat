// pages/my-exchanges/my-exchanges.js
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
    console.log('[MyExchanges] 页面加载');
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
    console.log('[MyExchanges] 页面显示');
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
    console.log('[MyExchanges] 加载已领取奖励数据');
    
    // 从本地存储获取所有奖励
    const rewards = wx.getStorageSync('rewards') || [];
    
    // 筛选出已领取的奖励
    const claimedRewards = rewards.filter(r => r.claimed);
    
    // 处理记录，添加显示用的时间格式
    const formattedRewards = claimedRewards.map(r => {
      return {
        ...r,
        claimTimeDisplay: this.formatTimeStamp(r.claimTime || r.createTime),
        claimStatus: r.claimStatus || 'claimed' // 添加默认值确保历史数据显示为已领取
      };
    });
    
    // 按领取时间倒序排列
    formattedRewards.sort((a, b) => b.claimTime - a.claimTime);
    
    this.setData({
      claimedRewards: formattedRewards
    });
    
    // 添加状态日志
    formattedRewards.forEach(r => {
      console.log(`[MyExchanges] 奖励[${r.name}]的显示状态: ${r.claimStatus === 'claimed' ? '已领取' : '等待领取'}, 原始状态值: ${r.claimStatus}`);
    });
    
    console.log(`[MyExchanges] 加载了 ${formattedRewards.length} 条已领取奖励记录`);
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