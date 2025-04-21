// pages/create/create.js
const Constants = require('../../utils/constants.js');

Page({

  /**
   * 页面的初始数据
   */
  data: {
    task: {
      id: 0, // 将在提交时生成
      type: 'habit',
      title: '',
      description: '',
      status: 0, // 默认未完成
      hasImage: false,
      images: [],
      date: '',
      time: '',
      reminder: false,
      reflection: '' // 学习心得
    },
    taskTypes: [
      { id: 'habit', name: '习惯', icon: '⏰' },
      { id: 'interest', name: '兴趣', icon: '📚' },
      { id: 'study', name: '学习', icon: '📝' }
    ],
    showTypeSelector: false,
    dateNow: '',
    timeNow: '',
    // 描述字段限制常量
    descMaxLength: Constants.DESCRIPTION.MAX_LENGTH,
    descPlaceholder: Constants.DESCRIPTION.PLACEHOLDER
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
    const updates = {
      'task.type': type,
      showTypeSelector: false
    };
    
    // 如果不是学习任务类型，清空图片和心得
    if (type !== 'study') {
      updates['task.images'] = [];
      updates['task.hasImage'] = false;
      updates['task.reflection'] = '';
    }
    
    this.setData(updates);
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
    const value = e.detail.value;
    
    // 记录日志
    console.log('创建页面描述输入:', value, `长度: ${value.length}/${this.data.descMaxLength}`);
    
    this.setData({
      'task.description': value
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
   * 输入学习心得
   */
  inputReflection: function (e) {
    this.setData({
      'task.reflection': e.detail.value
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
    const task = this.data.task;
    
    // 验证表单必填项
    if (!task.title.trim()) {
      wx.showToast({
        title: '请输入任务标题',
        icon: 'none'
      });
      return;
    }
    
    if (!task.date || !task.time) {
      wx.showToast({
        title: '请选择任务时间',
        icon: 'none'
      });
      return;
    }
    
    // 学习任务类型需要上传作业照片
    if (task.type === 'study' && task.images.length === 0) {
      wx.showToast({
        title: '请上传作业照片',
        icon: 'none'
      });
      return;
    }
    
    // 生成任务ID
    const app = getApp();
    const allTasks = app.globalData.tasks || [];
    const maxId = allTasks.length > 0 ? Math.max(...allTasks.map(t => t.id)) : 0;
    task.id = maxId + 1;
    
    // 添加到全局任务列表
    allTasks.push(task);
    app.globalData.tasks = allTasks;
    
    // 保存到本地存储
    wx.setStorage({
      key: 'tasks',
      data: allTasks,
      success: () => {
        wx.showToast({
          title: '保存成功',
          icon: 'success',
          duration: 1500,
          success: () => {
            setTimeout(() => {
              wx.navigateBack();
            }, 1500);
          }
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