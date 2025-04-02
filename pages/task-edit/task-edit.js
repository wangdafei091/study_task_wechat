Page({
  /**
   * 页面的初始数据
   */
  data: {
    mode: 'create', // 'create'或'edit'
    taskType: 'study', // 'study'或'habit'
    precision: 'second', // 'second'或'day'
    task: {
      id: 0,
      title: '',
      description: '',
      status: 0, // 默认未完成
      taskType: 'study', // 任务主类型
      type: '', // 子类型(如habit任务中的'clock'或'bag')
      hasImage: false,
      images: [],
      date: '',
      time: '',
      duration: 60, // 默认时长
      reminder: false,
      reflection: '', // 学习心得
      createTime: 0,
      updateTime: 0
    },
    taskTypes: [
      { id: 'clock', name: '生活习惯', icon: '⏰', parent: 'habit' },
      { id: 'bag', name: '整理收纳', icon: '📚', parent: 'habit' },
      { id: 'study', name: '学习任务', icon: '📝', parent: 'study' }
    ],
    showTypeSelector: false,
    dateNow: '',
    timeNow: ''
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    // 处理传入参数
    const { mode, type, precision } = options;
    
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
      'task.time': `${hour}:${minute}`,
      mode: mode || 'create',
      taskType: type || 'study',
      precision: precision || 'second'
    });
    
    // 更新页面标题
    wx.setNavigationBarTitle({
      title: this.data.mode === 'create' ? '创建新任务' : '编辑任务'
    });
    
    // 如果是编辑模式，获取任务数据
    if (this.data.mode === 'edit') {
      const eventChannel = this.getOpenerEventChannel();
      eventChannel.on('editTask', (data) => {
        if (data && data.task) {
          // 确保任务对象包含所有必要字段
          const task = this.ensureTaskFields(data.task);
          this.setData({ task: task });
        }
      });
    } else {
      // 创建模式，初始化新任务
      this.initNewTask();
    }
  },
  
  /**
   * 确保任务对象包含所有必要字段
   */
  ensureTaskFields: function(task) {
    // 基本字段检查
    if (!task.hasOwnProperty('taskType')) {
      // 根据type字段推断taskType
      if (task.type === 'study') {
        task.taskType = 'study';
      } else {
        task.taskType = 'habit';
      }
    }
    
    if (!task.hasOwnProperty('precision')) {
      // 根据taskType推断precision
      task.precision = task.taskType === 'study' ? 'second' : 'day';
    }
    
    // 学习任务特有字段
    if (task.taskType === 'study' && !task.hasOwnProperty('reflection')) {
      task.reflection = '';
    }
    
    // 习惯任务特有字段
    if (task.taskType === 'habit' && !task.hasOwnProperty('repeat')) {
      task.repeat = { type: 'none' }; // 默认不重复
    }
    
    return task;
  },
  
  /**
   * 初始化新任务
   */
  initNewTask: function() {
    const { taskType, precision } = this.data;
    
    // 根据任务类型设置默认值
    let taskUpdate = {
      taskType: taskType,
      precision: precision,
      createTime: Date.now(),
      updateTime: Date.now()
    };
    
    // 根据taskType设置type
    if (taskType === 'study') {
      taskUpdate.type = 'study';
      taskUpdate.duration = 60; // 学习任务默认60分钟
    } else {
      taskUpdate.type = 'clock'; // 习惯任务默认为生活习惯
      taskUpdate.duration = 15; // 习惯任务默认15分钟
    }
    
    this.setData({
      task: { ...this.data.task, ...taskUpdate }
    });
  },

  /**
   * 显示任务类型选择器
   */
  showTypeSelector: function() {
    this.setData({
      showTypeSelector: true
    });
  },

  /**
   * 隐藏任务类型选择器
   */
  hideTypeSelector: function() {
    this.setData({
      showTypeSelector: false
    });
  },

  /**
   * 选择任务类型
   */
  selectType: function(e) {
    const typeId = e.currentTarget.dataset.type;
    const type = this.data.taskTypes.find(t => t.id === typeId);
    
    if (!type) return;
    
    const updates = {
      'task.type': typeId,
      showTypeSelector: false
    };
    
    // 更新主分类
    if (type.parent) {
      updates['task.taskType'] = type.parent;
    }
    
    // 重置特定类型的字段
    if (type.parent === 'study') {
      // 学习类型任务特有字段
      if (!this.data.task.hasImage) {
        updates['task.hasImage'] = false;
        updates['task.images'] = [];
      }
      if (!this.data.task.reflection) {
        updates['task.reflection'] = '';
      }
      updates['task.precision'] = 'second';
      
      // 学习任务默认时长
      if (!this.data.task.duration || this.data.task.duration < 30) {
        updates['task.duration'] = 60;
      }
    } else {
      // 习惯类型任务，清除学习任务特有字段
      updates['task.images'] = [];
      updates['task.hasImage'] = false;
      updates['task.reflection'] = '';
      updates['task.precision'] = 'day';
      
      // 习惯任务默认时长
      if (!this.data.task.duration || this.data.task.duration > 30) {
        updates['task.duration'] = 15;
      }
    }
    
    this.setData(updates);
  },

  /**
   * 输入任务标题
   */
  inputTitle: function(e) {
    this.setData({
      'task.title': e.detail.value
    });
  },

  /**
   * 输入任务描述
   */
  inputDescription: function(e) {
    this.setData({
      'task.description': e.detail.value
    });
  },

  /**
   * 选择日期
   */
  selectDate: function(e) {
    this.setData({
      'task.date': e.detail.value
    });
  },

  /**
   * 选择时间
   */
  selectTime: function(e) {
    this.setData({
      'task.time': e.detail.value
    });
  },

  /**
   * 切换提醒开关
   */
  toggleReminder: function(e) {
    this.setData({
      'task.reminder': e.detail.value
    });
  },

  /**
   * 输入学习心得
   */
  inputReflection: function(e) {
    this.setData({
      'task.reflection': e.detail.value
    });
  },

  /**
   * 选择图片
   */
  chooseImage: function() {
    const that = this;
    wx.chooseImage({
      count: 9 - that.data.task.images.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function(res) {
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
  deleteImage: function(e) {
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
  previewImage: function(e) {
    const current = e.currentTarget.dataset.src;
    wx.previewImage({
      current: current,
      urls: this.data.task.images
    });
  },

  /**
   * 设置任务时长
   */
  setDuration: function(e) {
    const duration = parseInt(e.detail.value);
    if (!isNaN(duration) && duration > 0) {
      this.setData({
        'task.duration': duration
      });
    }
  },

  /**
   * 保存任务
   */
  saveTask: function() {
    const task = this.data.task;
    
    // 验证表单必填项
    if (!task.title.trim()) {
      wx.showToast({
        title: '请输入任务标题',
        icon: 'none'
      });
      return;
    }
    
    if (!task.date) {
      wx.showToast({
        title: '请选择任务日期',
        icon: 'none'
      });
      return;
    }
    
    // 精确到秒的任务需要时间
    if (task.precision === 'second' && !task.time) {
      wx.showToast({
        title: '请选择任务时间',
        icon: 'none'
      });
      return;
    }
    
    // 学习任务类型需要上传作业照片
    if (task.taskType === 'study' && task.images.length === 0) {
      wx.showToast({
        title: '请上传作业照片',
        icon: 'none'
      });
      return;
    }
    
    // 更新修改时间
    task.updateTime = Date.now();
    
    // 如果是创建模式，生成任务ID
    if (this.data.mode === 'create') {
      const app = getApp();
      const allTasks = app.globalData.tasks || [];
      const maxId = allTasks.length > 0 ? Math.max(...allTasks.map(t => t.id)) : 0;
      task.id = maxId + 1;
      task.createTime = Date.now();
      
      // 返回新创建的任务给上一页面
      const eventChannel = this.getOpenerEventChannel();
      if (eventChannel && eventChannel.emit) {
        eventChannel.emit('taskAdded', { task: task });
      }
    } else {
      // 编辑模式，返回更新后的任务
      const eventChannel = this.getOpenerEventChannel();
      if (eventChannel && eventChannel.emit) {
        eventChannel.emit('taskUpdated', { task: task });
      }
    }
    
    // 返回上一页
    wx.navigateBack();
  },

  /**
   * 取消操作
   */
  cancelTask: function() {
    wx.showModal({
      title: '提示',
      content: this.data.mode === 'create' ? '确定要放弃创建任务吗？' : '确定要放弃修改吗？',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack();
        }
      }
    });
  }
}); 