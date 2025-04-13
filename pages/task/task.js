Page({
  /**
   * 页面的初始数据
   */
  data: {
    taskId: null,
    isEdit: false,
    task: {
      id: 0,
      type: 'clock',
      title: '',
      description: '',
      status: 0,
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
    showTypeSelector: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    const { id, edit } = options
    this.setData({
      taskId: parseInt(id),
      isEdit: edit === '1'
    })
    this.loadTaskData()
  },

  /**
   * 加载任务数据
   */
  loadTaskData: function () {
    const app = getApp();
    const allTasks = app.globalData.tasks || [];
    const task = allTasks.find(task => task.id === this.data.taskId);
    
    if (task) {
      // 确保反射字段存在
      if (task.type === 'study' && !task.hasOwnProperty('reflection')) {
        task.reflection = '';
      }
      
      this.setData({
        task: task
      });
    } else {
      wx.showToast({
        title: '未找到任务',
        icon: 'none',
        duration: 2000,
        success: () => {
          setTimeout(() => {
            wx.navigateBack();
          }, 2000);
        }
      });
    }
  },

  /**
   * 切换任务状态
   */
  toggleTaskStatus: function () {
    const newStatus = this.data.task.status === 0 ? 1 : 0
    this.setData({
      'task.status': newStatus
    })
  },

  /**
   * 显示任务类型选择器
   */
  showTypeSelector: function () {
    if (this.data.isEdit) {
      this.setData({
        showTypeSelector: true
      })
    }
  },

  /**
   * 选择任务类型
   */
  selectType: function (e) {
    const type = e.currentTarget.dataset.type
    this.setData({
      'task.type': type,
      showTypeSelector: false
    })
  },

  /**
   * 输入任务标题
   */
  inputTitle: function (e) {
    this.setData({
      'task.title': e.detail.value
    })
  },

  /**
   * 输入任务描述
   */
  inputDescription: function (e) {
    this.setData({
      'task.description': e.detail.value
    })
  },

  /**
   * 选择日期
   */
  selectDate: function (e) {
    this.setData({
      'task.date': e.detail.value
    })
  },

  /**
   * 选择时间
   */
  selectTime: function (e) {
    this.setData({
      'task.time': e.detail.value
    })
  },

  /**
   * 切换提醒开关
   */
  toggleReminder: function () {
    this.setData({
      'task.reminder': !this.data.task.reminder
    })
  },

  /**
   * 选择图片
   */
  chooseImage: function () {
    const that = this
    wx.chooseImage({
      count: 9,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        that.setData({
          'task.images': that.data.task.images.concat(res.tempFilePaths),
          'task.hasImage': true
        })
      }
    })
  },

  /**
   * 删除图片
   */
  deleteImage: function (e) {
    const index = e.currentTarget.dataset.index
    const images = this.data.task.images
    images.splice(index, 1)
    this.setData({
      'task.images': images,
      'task.hasImage': images.length > 0
    })
  },

  /**
   * 预览图片
   */
  previewImage: function (e) {
    const current = e.currentTarget.dataset.src
    wx.previewImage({
      current: current,
      urls: this.data.task.images
    })
  },

  /**
   * 保存任务
   */
  saveTask: function () {
    // 这里应该将数据保存到服务器或本地存储
    wx.showToast({
      title: '保存成功',
      icon: 'success',
      duration: 2000,
      success: () => {
        setTimeout(() => {
          wx.navigateBack()
        }, 2000)
      }
    })
  },

  /**
   * 删除任务
   */
  deleteTask: function () {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个任务吗？',
      success: (res) => {
        if (res.confirm) {
          const messageManager = require('../../utils/messageManager.js');
          const app = getApp();
          const allTasks = app.globalData.tasks || [];
          
          // 获取任务ID
          const taskId = this.data.task.id;
          
          // 从数组中删除任务
          const updatedTasks = allTasks.filter(task => task.id !== taskId);
          
          // 更新全局数据
          app.globalData.tasks = updatedTasks;
          
          // 保存到本地存储
          wx.setStorage({
            key: 'taskData',
            data: updatedTasks,
            success: () => {
              // 删除与任务相关的消息
              messageManager.removeTaskMessages(taskId);
              
              wx.showToast({
                title: '删除成功',
                icon: 'success',
                duration: 2000,
                success: () => {
                  setTimeout(() => {
                    wx.navigateBack();
                  }, 2000)
                }
              });
            },
            fail: () => {
              wx.showToast({
                title: '删除失败',
                icon: 'none',
                duration: 2000
              });
            }
          });
        }
      }
    });
  },

  /**
   * 输入学习心得
   */
  inputReflection: function (e) {
    this.setData({
      'task.reflection': e.detail.value
    })
  },
}) 