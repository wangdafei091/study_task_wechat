// pages/create/create.js
Page({

  /**
   * 页面的初始数据
   */
  data: {
    task: {
      id: 0, // 将在提交时生成
      type: 'clock',
      title: '',
      description: '',
      status: 0, // 默认未完成
      hasImage: false,
      images: [],
      date: '',
      time: '',
      reminder: false
    },
    taskTypes: [
      { id: 'clock', name: '生活习惯', icon: '⏰' },
      { id: 'bag', name: '整理收纳', icon: '📚' },
      { id: 'study', name: '学习任务', icon: '📝' }
    ],
    showTypeSelector: false,
    dateNow: '',
    timeNow: ''
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    // 设置当前日期和时间
    const now = new Date();
    const year = now.getFullYear();
    const month = ("0" + (now.getMonth() + 1)).slice(-2);
    const day = ("0" + now.getDate()).slice(-2);
    const hour = ("0" + now.getHours()).slice(-2);
    const minute = ("0" + now.getMinutes()).slice(-2);
    
    this.setData({
      dateNow: `${year}-${month}-${day}`,
      timeNow: `${hour}:${minute}`,
      'task.date': `${year}-${month}-${day}`,
      'task.time': `${hour}:${minute}`
    });
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {

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
   * 显示任务类型选择器
   */
  showTypeSelector: function () {
    this.setData({
      showTypeSelector: true
    });
  },

  /**
   * 隐藏任务类型选择器
   */
  hideTypeSelector: function () {
    this.setData({
      showTypeSelector: false
    });
  },

  /**
   * 选择任务类型
   */
  selectType: function (e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      'task.type': type,
      showTypeSelector: false
    });
  },

  /**
   * 输入任务标题
   */
  inputTitle: function (e) {
    this.setData({
      'task.title': e.detail.value
    });
  },

  /**
   * 输入任务描述
   */
  inputDescription: function (e) {
    this.setData({
      'task.description': e.detail.value
    });
  },

  /**
   * 选择日期
   */
  selectDate: function (e) {
    this.setData({
      'task.date': e.detail.value
    });
  },

  /**
   * 选择时间
   */
  selectTime: function (e) {
    this.setData({
      'task.time': e.detail.value
    });
  },

  /**
   * 切换提醒开关
   */
  toggleReminder: function (e) {
    this.setData({
      'task.reminder': e.detail.value
    });
  },

  /**
   * 选择图片
   */
  chooseImage: function () {
    const that = this;
    wx.chooseImage({
      count: 9 - that.data.task.images.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        that.setData({
          'task.images': that.data.task.images.concat(res.tempFilePaths),
          'task.hasImage': true
        });
      }
    });
  },

  /**
   * 删除图片
   */
  deleteImage: function (e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.task.images;
    images.splice(index, 1);
    this.setData({
      'task.images': images,
      'task.hasImage': images.length > 0
    });
  },

  /**
   * 预览图片
   */
  previewImage: function (e) {
    const current = e.currentTarget.dataset.src;
    wx.previewImage({
      current: current,
      urls: this.data.task.images
    });
  },

  /**
   * 保存任务
   */
  saveTask: function () {
    // 校验必填字段
    if (!this.data.task.title) {
      wx.showToast({
        title: '请输入任务标题',
        icon: 'none'
      });
      return;
    }

    // 生成任务ID（实际应用中可能由服务器生成）
    const taskId = new Date().getTime();
    const newTask = { ...this.data.task, id: taskId };

    // 获取全局数据
    const app = getApp();
    const tasks = app.globalData.tasks || [];

    // 添加新任务
    tasks.unshift(newTask);
    
    // 更新全局数据
    app.globalData.tasks = tasks;

    // 保存到本地存储
    wx.setStorage({
      key: 'tasks',
      data: tasks,
      success: () => {
        wx.showToast({
          title: '保存成功',
          icon: 'success',
          duration: 2000,
          success: () => {
            setTimeout(() => {
              wx.navigateBack();
            }, 2000);
          }
        });
      },
      fail: () => {
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 取消创建任务
   */
  cancelTask: function () {
    wx.showModal({
      title: '提示',
      content: '确定要放弃创建任务吗？',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack();
        }
      }
    });
  }
})