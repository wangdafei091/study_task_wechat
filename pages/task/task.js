const serviceManager = require('../../utils/serviceManager.js');
const logger = require('../../utils/logger');

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
    logger.info('TaskDetail', '页面加载', { taskId: id, isEdit: edit === '1' });
    
    this.setData({
      taskId: id,
      isEdit: edit === '1'
    })
    this.loadTaskData()
  },

  /**
   * 加载任务数据
   */
  loadTaskData: async function () {
    try {
      logger.info('TaskDetail', '开始加载任务数据', { taskId: this.data.taskId });
      
      // 获取任务服务
      const taskService = serviceManager.getService('task');
      if (!taskService) {
        logger.error('TaskDetail', '无法获取任务服务');
        this.showErrorAndGoBack('系统错误，请重试');
        return;
      }
      
      // 获取任务详情
      const task = await taskService.getTaskById(this.data.taskId);
      
      if (task) {
        // 确保反射字段存在
        if (task.type === 'study' && !task.hasOwnProperty('reflection')) {
          task.reflection = '';
        }
        
        logger.info('TaskDetail', '任务数据加载成功', { 
          taskId: task.id, 
          title: task.title, 
          type: task.type 
        });
        
        this.setData({ task });
      } else {
        logger.warn('TaskDetail', '未找到任务', { taskId: this.data.taskId });
        this.showErrorAndGoBack('未找到任务');
      }
    } catch (error) {
      logger.error('TaskDetail', '加载任务数据失败', error);
      this.showErrorAndGoBack('加载失败，请重试');
    }
  },
  
  /**
   * 显示错误并返回
   */
  showErrorAndGoBack: function(message) {
    wx.showToast({
      title: message,
      icon: 'none',
      duration: 2000,
      success: () => {
        setTimeout(() => {
          wx.navigateBack();
        }, 2000);
      }
    });
  },

  /**
   * 切换任务状态
   */
  toggleTaskStatus: async function () {
    try {
      const taskId = this.data.task.id;
      const currentStatus = this.data.task.status;
      const newStatus = currentStatus === 0 ? 1 : 0;
      
      logger.info('TaskDetail', '切换任务状态', { taskId, from: currentStatus, to: newStatus });
      
      // 显示加载提示
      wx.showLoading({
        title: newStatus === 1 ? '正在完成...' : '正在重置...',
        mask: true
      });
      
      // 获取任务服务
      const taskService = serviceManager.getService('task');
      if (!taskService) {
        logger.error('TaskDetail', '无法获取任务服务');
        wx.hideLoading();
        wx.showToast({
          title: '操作失败，请重试',
          icon: 'none'
        });
        return;
      }
      
      // 调用服务更新任务状态
      let updatedTask;
      if (newStatus === 1) {
        // 完成任务
        updatedTask = await taskService.completeTask(taskId);
      } else {
        // 重置任务
        updatedTask = await taskService.resetTask(taskId);
      }
      
      // 隐藏加载提示
      wx.hideLoading();
      
      if (updatedTask) {
        logger.info('TaskDetail', '任务状态更新成功', { 
          taskId, 
          newStatus: updatedTask.status,
          title: updatedTask.title
        });
        
        // 更新本地数据
        this.setData({
          task: updatedTask
        });
        
        // 提示用户
        wx.showToast({
          title: newStatus === 1 ? '已完成' : '已重置',
          icon: 'success'
        });
        
        // 轻微振动反馈
        if (wx.vibrateShort) {
          wx.vibrateShort({ type: 'light' });
        }
      } else {
        logger.warn('TaskDetail', '任务状态更新失败', { taskId });
        wx.showToast({
          title: '操作失败，请重试',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      logger.error('TaskDetail', '切换任务状态出现异常', error);
      
      wx.showToast({
        title: '操作失败，请重试',
        icon: 'none'
      });
    }
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
  deleteTask: async function () {
    const taskId = this.data.task.id;
    logger.info('TaskDetail', '请求删除任务', { taskId });
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个任务吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            // 显示加载提示
            wx.showLoading({
              title: '正在删除...',
              mask: true
            });
            
            // 获取任务服务
            const taskService = serviceManager.getService('task');
            if (!taskService) {
              logger.error('TaskDetail', '无法获取任务服务');
              wx.hideLoading();
              this.showErrorAndGoBack('系统错误，请重试');
              return;
            }
            
            // 调用服务删除任务
            const result = await taskService.deleteTask(taskId);
            
            // 隐藏加载提示
            wx.hideLoading();
            
            if (result && result.success) {
              logger.info('TaskDetail', '任务删除成功', { taskId });
              
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              });
              
              // 返回上一页
              setTimeout(() => {
                wx.navigateBack();
              }, 1500);
            } else {
              const errorMsg = result ? result.message : '未知错误';
              logger.warn('TaskDetail', '任务删除失败', { taskId, error: errorMsg });
              
              wx.showToast({
                title: '删除失败: ' + errorMsg,
                icon: 'none',
                duration: 2000
              });
            }
          } catch (error) {
            // 隐藏加载提示
            wx.hideLoading();
            
            logger.error('TaskDetail', '删除任务出现异常', error);
            
            wx.showToast({
              title: '操作失败，请重试',
              icon: 'none',
              duration: 2000
            });
          }
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