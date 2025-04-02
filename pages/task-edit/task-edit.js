Page({
  /**
   * 页面的初始数据
   */
  data: {
    mode: 'create', // 'create' 或 'edit'
    taskType: 'study', // 'study' 或 'habit'
    precision: 'second', // 'second' 或 'day'
    currentStep: 1, // 当前处于第几步
    task: {
      id: '', // 编辑模式下有值
      title: '',
      shortName: '', // 新增：任务简称(4字以内)
      description: '',
      type: '', // 任务类型
      taskType: '', // 主任务类型(study/habit)
      tags: [], // 标签ID数组
      date: '', // 执行日期
      time: '', // 执行时间(仅学习型)
      duration: 0, // 任务时长(分钟)
      points: 0, // 积分
      repeat: {
        type: 'none', // 重复类型
        days: [], // 重复日期
        endDate: '' // 结束日期
      },
      status: 0, // 0=未完成, 1=已完成
      createTime: 0,
      updateTime: 0
    },
    taskTemplates: [], // 任务模板列表
    selectedTemplate: '', // 已选任务模板
    customMode: true, // 是否为自定义模式
    dateNow: '', // 当前日期，用于日期选择器最小值
    timeNow: '', // 当前时间，用于时间选择器最小值
    isCustomPoints: false, // 是否使用自定义积分
    customPointsValue: '8', // 自定义积分值
    isCustomDuration: false, // 是否使用自定义时长
    customDurationValue: '', // 自定义时长值
    taskLoad: {
      status: 'normal', // 'light', 'normal', 'heavy'
      totalTasks: 0,
      totalMinutes: 0,
      percentage: 0, // 0-100
      message: '任务量适中'
    },
    recommendedTags: [], // 推荐标签
    frequentTags: [], // 常用标签
    allTags: [], // 所有标签
    selectedTags: [], // 已选标签
    showTagSelector: false, // 是否显示标签选择器
    taskTypes: [
      { id: 'clock', name: '生活习惯', icon: '⏰', parent: 'habit' },
      { id: 'bag', name: '整理收纳', icon: '📚', parent: 'habit' },
      { id: 'study', name: '学习任务', icon: '📝', parent: 'study' }
    ]
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function(options) {
    console.log('Page onLoad with options:', options);
    
    // 设置页面标题
    wx.setNavigationBarTitle({
      title: options.mode === 'edit' ? '编辑任务' : 
             options.taskType === 'study' ? '创建学习任务' : '创建习惯任务'
    });
    
    // 初始化日期和时间
    this.initDateTime();
    
    // 判断模式(创建/编辑)
    if (options.mode === 'edit' && options.taskId) {
      this.initEditMode(options.taskId);
    } else {
      this.initCreateMode(options);
    }
    
    // 加载任务模板
    this.loadTaskTemplates();
    
    // 更新任务负载预测
    this.updateTaskLoadPreview();
  },

  /**
   * 初始化创建模式
   */
  initCreateMode: function(options) {
    // 设置任务类型(从首页传入)
    const taskType = options.taskType || 'study';
    const precision = options.precision || (taskType === 'study' ? 'second' : 'day');
    
    // 根据任务类型设置默认值
    let defaultDuration = taskType === 'study' ? 45 : 15;
    let defaultPoints = taskType === 'study' ? 3 : 2;
    let defaultType = taskType === 'study' ? 'study' : 'clock';
    
    this.setData({
      mode: 'create',
      taskType: taskType,
      precision: precision,
      customMode: true,
      // 根据任务类型设置默认值
      'task.taskType': taskType,
      'task.type': defaultType,
      'task.duration': defaultDuration,
      'task.points': defaultPoints,
      'task.precision': precision
    });
  },

  /**
   * 初始化编辑模式
   */
  initEditMode: function(taskId) {
    const that = this;
    
    // 获取任务数据
    wx.getStorage({
      key: 'taskData',
      success: function(res) {
        const tasks = res.data || [];
        const task = tasks.find(t => t.id === taskId);
        
        if (task) {
          // 确保任务有所有必要字段
          const completeTask = that.ensureTaskFields(task);
          
          // 检查是否使用自定义积分值
          const isCustomPoints = ![1, 2, 3, 5].includes(completeTask.points);
          
          // 检查是否使用自定义时长
          const isCustomDuration = completeTask.taskType === 'study' ? 
            ![30, 45, 60].includes(completeTask.duration) : 
            ![5, 15, 30].includes(completeTask.duration);
          
          that.setData({
            mode: 'edit',
            taskType: completeTask.taskType || 'study',
            precision: completeTask.precision || (completeTask.taskType === 'study' ? 'second' : 'day'),
            task: completeTask,
            customMode: true,
            selectedTemplate: '',
            isCustomPoints: isCustomPoints,
            customPointsValue: isCustomPoints ? completeTask.points.toString() : '8',
            isCustomDuration: isCustomDuration,
            customDurationValue: isCustomDuration ? completeTask.duration.toString() : ''
          });
        } else {
          wx.showToast({
            title: '任务不存在',
            icon: 'none'
          });
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        }
      },
      fail: function() {
        wx.showToast({
          title: '获取任务失败',
          icon: 'none'
        });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      }
    });
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
   * 初始化日期和时间
   */
  initDateTime: function() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    
    this.setData({
      dateNow: `${year}-${month}-${day}`,
      timeNow: `${hours}:${minutes}`
    });
  },

  /**
   * 根据任务类型更新推荐标签
   */
  updateRecommendedTags: function(taskType) {
    if (taskType === 'study') {
      this.setData({
        recommendedTags: ['数学', '阅读', '英语', '科学', '艺术', '音乐']
      });
    } else {
      this.setData({
        recommendedTags: ['自理', '整理', '运动', '饮食', '环保', '娱乐']
      });
    }
  },

  /**
   * 下一步
   */
  nextStep: function() {
    // 验证当前步骤数据
    if (!this.validateCurrentStep()) {
      return;
    }
    
    this.setData({
      currentStep: 2
    });
  },

  /**
   * 返回上一步
   */
  prevStep: function() {
    this.setData({
      currentStep: 1
    });
  },

  /**
   * 验证当前步骤
   */
  validateCurrentStep: function() {
    const { task, currentStep } = this.data;
    
    if (currentStep === 1) {
      // 验证第一步数据
      if (!task.title.trim()) {
        wx.showToast({
          title: '请输入任务名称',
          icon: 'none'
        });
        return false;
      }
      return true;
    } else if (currentStep === 2) {
      // 验证第二步数据
      if (!task.date) {
        wx.showToast({
          title: '请选择执行日期',
          icon: 'none'
        });
        return false;
      }
      
      // 对于学习型任务，验证时间
      if (this.data.taskType === 'study' && !task.time) {
        wx.showToast({
          title: '请选择执行时间',
          icon: 'none'
        });
        return false;
      }
      
      return true;
    }
    
    return true;
  },

  /**
   * 输入任务名称
   */
  inputTitle: function(e) {
    const title = e.detail.value;
    // 自动提取前4个字作为简称(如果简称为空)
    let shortName = this.data.task.shortName || '';
    if (!shortName && title) {
      shortName = title.substring(0, 4);
    }
    
    this.setData({
      'task.title': title,
      'task.shortName': shortName
    });
  },

  /**
   * 输入任务简称
   */
  inputShortName: function(e) {
    this.setData({
      'task.shortName': e.detail.value
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
    
    // 更新任务负载预测
    this.updateTaskLoadPreview();
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
   * 快速选择日期
   */
  quickSelectDate: function(e) {
    const type = e.currentTarget.dataset.type;
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    
    let dateStr = '';
    
    if (type === 'today') {
      dateStr = `${year}-${month}-${day}`;
    } else if (type === 'tomorrow') {
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      const tYear = tomorrow.getFullYear();
      const tMonth = (tomorrow.getMonth() + 1).toString().padStart(2, '0');
      const tDay = tomorrow.getDate().toString().padStart(2, '0');
      dateStr = `${tYear}-${tMonth}-${tDay}`;
    } else if (type === 'weekend') {
      // 计算本周末(周六)的日期
      const day = now.getDay(); // 0是周日，6是周六
      const daysToWeekend = day === 6 ? 0 : 6 - day;
      const weekend = new Date(now);
      weekend.setDate(now.getDate() + daysToWeekend);
      const wYear = weekend.getFullYear();
      const wMonth = (weekend.getMonth() + 1).toString().padStart(2, '0');
      const wDay = weekend.getDate().toString().padStart(2, '0');
      dateStr = `${wYear}-${wMonth}-${wDay}`;
    }
    
    if (dateStr) {
      this.setData({
        'task.date': dateStr
      });
      
      // 更新任务负载预测
      this.updateTaskLoadPreview();
    }
  },

  /**
   * 快速选择时间
   */
  quickSelectTime: function(e) {
    const period = e.currentTarget.dataset.period;
    let timeStr = '';
    
    if (period === 'morning') {
      timeStr = '08:30';
    } else if (period === 'afternoon') {
      timeStr = '15:00';
    } else if (period === 'evening') {
      timeStr = '19:00';
    }
    
    if (timeStr) {
      this.setData({
        'task.time': timeStr
      });
    }
  },

  /**
   * 选择预设时长
   */
  selectDuration: function(e) {
    const duration = parseInt(e.currentTarget.dataset.duration);
    
    this.setData({
      'task.duration': duration,
      isCustomDuration: false
    });
    
    // 更新任务负载预测
    this.updateTaskLoadPreview();
  },

  /**
   * 启用自定义时长
   */
  enableCustomDuration: function() {
    const duration = this.data.task.duration || (this.data.taskType === 'study' ? 45 : 15);
    
    this.setData({
      isCustomDuration: true,
      customDurationValue: duration.toString()
    });
  },

  /**
   * 设置自定义时长
   */
  setCustomDuration: function(e) {
    let value = e.detail.value;
    
    // 确保输入为有效数字
    if (value === '' || isNaN(value)) {
      value = this.data.taskType === 'study' ? '45' : '15';
    }
    
    // 限制最大值为240分钟(4小时)
    if (parseInt(value) > 240) {
      value = '240';
    }
    
    // 限制最小值为1分钟
    if (parseInt(value) < 1) {
      value = '1';
    }
    
    this.setData({
      customDurationValue: value,
      'task.duration': parseInt(value)
    });
    
    // 更新任务负载预测
    this.updateTaskLoadPreview();
  },

  /**
   * 选择预设积分
   */
  selectPresetPoints: function(e) {
    const points = parseInt(e.currentTarget.dataset.points);
    
    this.setData({
      'task.points': points,
      isCustomPoints: false
    });
  },

  /**
   * 启用自定义积分
   */
  enableCustomPoints: function() {
    // 如果当前未选中自定义，则启用
    if (!this.data.isCustomPoints) {
      this.setData({
        isCustomPoints: true,
        'task.points': parseInt(this.data.customPointsValue) || 1
      });
    }
  },

  /**
   * 输入自定义积分
   */
  inputCustomPoints: function(e) {
    let value = e.detail.value;
    
    // 确保输入为有效数字
    if (value === '' || isNaN(value)) {
      value = '1';
    }
    
    // 限制最大值为100
    if (parseInt(value) > 100) {
      value = '100';
    }
    
    // 限制最小值为1
    if (parseInt(value) < 1) {
      value = '1';
    }
    
    this.setData({
      customPointsValue: value,
      'task.points': parseInt(value)
    });
  },

  /**
   * 确认自定义积分
   */
  confirmCustomPoints: function() {
    // 确保值有效
    let points = parseInt(this.data.customPointsValue) || 1;
    
    this.setData({
      'task.points': points,
      customPointsValue: points.toString()
    });
  },

  /**
   * 加载标签数据
   */
  loadTags: function() {
    wx.getStorage({
      key: 'tagData',
      success: res => {
        const allTags = res.data || [];
        
        // 根据使用频率排序标签
        const sortedTags = allTags.sort((a, b) => (b.useCount || 0) - (a.useCount || 0));
        
        // 获取常用标签(前6个)
        const frequentTags = sortedTags.slice(0, 6);
        
        this.setData({
          allTags: allTags,
          frequentTags: frequentTags
        });
      },
      fail: () => {
        // 如果没有标签数据，创建默认标签
        const defaultTags = [
          { id: 'math', name: '数学', icon: '📚', type: 'study', useCount: 0 },
          { id: 'reading', name: '阅读', icon: '📖', type: 'study', useCount: 0 },
          { id: 'english', name: '英语', icon: '🌎', type: 'study', useCount: 0 },
          { id: 'selfcare', name: '自理', icon: '👕', type: 'habit', useCount: 0 },
          { id: 'cleaning', name: '整理', icon: '🧹', type: 'habit', useCount: 0 },
          { id: 'exercise', name: '运动', icon: '🏃‍♂️', type: 'habit', useCount: 0 }
        ];
        
        this.setData({
          allTags: defaultTags,
          frequentTags: defaultTags
        });
        
        // 存储默认标签
        wx.setStorage({
          key: 'tagData',
          data: defaultTags
        });
      }
    });
  },

  /**
   * 打开标签选择器
   */
  showTagSelector: function() {
    this.setData({
      showTagSelector: true
    });
  },

  /**
   * 关闭标签选择器
   */
  hideTagSelector: function() {
    this.setData({
      showTagSelector: false
    });
  },

  /**
   * 选择标签
   */
  selectTag: function(e) {
    const tagId = e.currentTarget.dataset.id;
    const selectedTags = [...this.data.selectedTags];
    
    // 最多选择3个标签
    if (selectedTags.includes(tagId)) {
      const index = selectedTags.indexOf(tagId);
      selectedTags.splice(index, 1);
    } else {
      if (selectedTags.length >= 3) {
        wx.showToast({
          title: '最多选择3个标签',
          icon: 'none'
        });
        return;
      }
      selectedTags.push(tagId);
    }
    
    this.setData({
      selectedTags: selectedTags,
      'task.tags': selectedTags
    });
  },

  /**
   * 创建新标签
   */
  createNewTag: function(e) {
    const tagName = e.detail.value.tagName;
    
    if (!tagName.trim()) {
      wx.showToast({
        title: '标签名称不能为空',
        icon: 'none'
      });
      return;
    }
    
    // 检查标签是否已存在
    if (this.data.allTags.some(tag => tag.name === tagName)) {
      wx.showToast({
        title: '标签已存在',
        icon: 'none'
      });
      return;
    }
    
    // 生成新标签
    const newTag = {
      id: 'tag_' + Date.now(),
      name: tagName,
      icon: this.data.taskType === 'study' ? '📚' : '⭐',
      type: this.data.taskType,
      useCount: 0,
      createTime: Date.now()
    };
    
    // 保存标签
    const allTags = [...this.data.allTags, newTag];
    this.setData({
      allTags: allTags
    });
    
    // 存储标签
    wx.setStorage({
      key: 'tagData',
      data: allTags
    });
    
    // 自动选中新创建的标签
    this.selectTag({
      currentTarget: {
        dataset: {
          id: newTag.id
        }
      }
    });
    
    wx.showToast({
      title: '标签创建成功',
      icon: 'success'
    });
  },

  /**
   * 确认标签选择
   */
  confirmTagSelection: function() {
    this.setData({
      showTagSelector: false
    });
  },

  /**
   * 更新任务负载预测
   */
  updateTaskLoadPreview: function() {
    const app = getApp();
    const { task, taskType } = this.data;
    
    // 获取现有任务
    wx.getStorage({
      key: 'taskData',
      success: res => {
        const tasks = res.data || [];
        
        // 计算当前任务量
        let totalTasks = tasks.filter(t => {
          // 只统计选定日期的任务
          if (!task.date) return false;
          
          const taskDate = new Date(t.date);
          const selectedDate = new Date(task.date);
          return taskDate.toDateString() === selectedDate.toDateString() && t.status === 0;
        }).length;
        
        // 计算总时长
        let totalMinutes = tasks.reduce((sum, t) => {
          if (!task.date) return sum;
          
          const taskDate = new Date(t.date);
          const selectedDate = new Date(task.date);
          if (taskDate.toDateString() === selectedDate.toDateString() && t.status === 0) {
            return sum + (t.duration || 0);
          }
          return sum;
        }, 0);
        
        // 加上当前编辑的任务
        if (task.date) {
          // 编辑模式下，不重复计算
          if (this.data.mode === 'create') {
            totalTasks += 1;
            totalMinutes += task.duration || 0;
          } else {
            // 编辑模式下，检查是否是同一天的任务
            const existingTask = tasks.find(t => t.id === task.id);
            if (existingTask) {
              const oldTaskDate = new Date(existingTask.date);
              const newTaskDate = new Date(task.date);
              
              // 如果日期变了，需要重新计算
              if (oldTaskDate.toDateString() !== newTaskDate.toDateString()) {
                totalTasks += 1;
                totalMinutes += task.duration || 0;
              } else {
                // 如果只是修改了时长，计算差值
                totalMinutes = totalMinutes - (existingTask.duration || 0) + (task.duration || 0);
              }
            }
          }
        }
        
        // 分析负载状态
        let status = 'normal';
        let message = '任务量适中';
        
        // 根据小朋友年龄段计算推荐负载上限
        // 这里使用简单逻辑，实际应该从用户配置获取
        const ageGroup = app?.globalData?.ageGroup || '6-8';
        let recommendedLimit = 90; // 默认90分钟
        
        switch (ageGroup) {
          case '3-5':
            recommendedLimit = 60; // 3-5岁 最多1小时
            break;
          case '6-8':
            recommendedLimit = 90; // 6-8岁 最多1.5小时
            break;
          case '9-12':
            recommendedLimit = 120; // 9-12岁 最多2小时
            break;
        }
        
        // 计算负载百分比
        const percentage = Math.min(Math.round((totalMinutes / recommendedLimit) * 100), 100);
        
        if (totalMinutes < recommendedLimit * 0.7) {
          status = 'light';
          message = '任务量较轻松';
        } else if (totalMinutes <= recommendedLimit * 1.2) {
          status = 'normal';
          message = '任务量适中';
        } else {
          status = 'heavy';
          message = '任务量偏多';
        }
        
        this.setData({
          taskLoad: {
            status: status,
            totalTasks: totalTasks,
            totalMinutes: totalMinutes,
            percentage: percentage,
            message: message
          }
        });
      },
      fail: () => {
        // 如果没有任务数据，只计算当前任务
        this.setData({
          taskLoad: {
            status: 'light',
            totalTasks: 1,
            totalMinutes: task.duration || 0,
            percentage: 10,
            message: '任务量轻松'
          }
        });
      }
    });
  },

  /**
   * 保存任务
   */
  saveTask: function() {
    // 最终验证
    if (!this.validateCurrentStep()) {
      return;
    }
    
    const { mode, task } = this.data;
    
    // 获取现有任务数据
    wx.getStorage({
      key: 'taskData',
      success: res => {
        let tasks = res.data || [];
        
        if (mode === 'create') {
          // 创建新任务
          const newTask = {
            ...task,
            id: 'task_' + Date.now(),
            status: 0,
            createTime: Date.now(),
            updateTime: Date.now()
          };
          
          tasks.push(newTask);
        } else {
          // 更新现有任务
          const index = tasks.findIndex(t => t.id === task.id);
          if (index !== -1) {
            tasks[index] = {
              ...task,
              updateTime: Date.now()
            };
          }
        }
        
        // 保存任务数据
        wx.setStorage({
          key: 'taskData',
          data: tasks,
          success: () => {
            wx.showToast({
              title: mode === 'create' ? '任务创建成功' : '任务更新成功',
              icon: 'success'
            });
            
            setTimeout(() => {
              wx.navigateBack();
            }, 1500);
          },
          fail: err => {
            wx.showToast({
              title: '保存失败，请重试',
              icon: 'none'
            });
            console.error('保存任务失败:', err);
          }
        });
      },
      fail: () => {
        // 如果没有现有数据，创建新数组
        const tasks = mode === 'create' ? 
          [{
            ...task,
            id: 'task_' + Date.now(),
            status: 0,
            createTime: Date.now(),
            updateTime: Date.now()
          }] : [];
        
        wx.setStorage({
          key: 'taskData',
          data: tasks,
          success: () => {
            wx.showToast({
              title: '任务创建成功',
              icon: 'success'
            });
            
            setTimeout(() => {
              wx.navigateBack();
            }, 1500);
          }
        });
      }
    });
  },

  /**
   * 取消操作返回上一页
   */
  cancelTask: function() {
    wx.navigateBack();
  },

  /**
   * 加载任务模板
   */
  loadTaskTemplates: function() {
    // 学习任务模板
    const studyTemplates = [
      { 
        id: 'math_homework', 
        name: '数学作业', 
        shortName: '数学',
        icon: '📐', 
        description: '完成数学练习册', 
        duration: 45, 
        points: 3 
      },
      { 
        id: 'reading', 
        name: '阅读练习', 
        shortName: '阅读',
        icon: '📚', 
        description: '阅读一篇文章并做笔记', 
        duration: 30, 
        points: 2 
      },
      { 
        id: 'english_words', 
        name: '英语单词', 
        shortName: '英语',
        icon: '🔤', 
        description: '背诵英语单词', 
        duration: 20, 
        points: 2 
      },
      { 
        id: 'writing', 
        name: '写作文', 
        shortName: '作文',
        icon: '✏️', 
        description: '完成一篇作文', 
        duration: 60, 
        points: 5 
      }
    ];

    // 习惯任务模板
    const habitTemplates = [
      { 
        id: 'tidy_desk', 
        name: '整理书桌', 
        shortName: '整理',
        icon: '🧹', 
        description: '整理书桌和学习用品', 
        duration: 15, 
        points: 2 
      },
      { 
        id: 'wash_dishes', 
        name: '洗碗', 
        shortName: '洗碗',
        icon: '🍽️', 
        description: '清洗并整理餐具', 
        duration: 10, 
        points: 1 
      },
      { 
        id: 'exercise', 
        name: '做运动', 
        shortName: '运动',
        icon: '🏃', 
        description: '进行体育锻炼', 
        duration: 30, 
        points: 3 
      },
      { 
        id: 'make_bed', 
        name: '整理床铺', 
        shortName: '床铺',
        icon: '🛏️', 
        description: '整理床铺被褥', 
        duration: 5, 
        points: 1 
      }
    ];
    
    // 根据任务类型加载不同的模板
    const templates = this.data.taskType === 'study' ? studyTemplates : habitTemplates;
    
    // 获取并添加用户自定义的常用模板
    wx.getStorage({
      key: 'customTemplates',
      success: (res) => {
        if (res.data) {
          // 过滤获取当前任务类型的自定义模板
          const customTemplates = res.data.filter(
            t => t.taskType === this.data.taskType
          );
          // 将自定义模板添加到列表前面
          this.setData({ 
            taskTemplates: [...customTemplates, ...templates].slice(0, 8) // 限制展示数量
          });
        } else {
          this.setData({ taskTemplates: templates });
        }
      },
      fail: () => {
        this.setData({ taskTemplates: templates });
      }
    });
  },

  /**
   * 选择任务模板
   */
  selectTemplate: function(e) {
    const templateId = e.currentTarget.dataset.id;
    const template = this.data.taskTemplates.find(t => t.id === templateId);
    
    if (template) {
      // 使用模板数据填充表单
      this.setData({
        selectedTemplate: templateId,
        customMode: false,
        'task.title': template.name,
        'task.shortName': template.shortName || template.name.substring(0, 4), // 设置简称
        'task.description': template.description || '',
        'task.duration': template.duration,
        'task.points': template.points,
        // 设置相应的选择状态
        isCustomDuration: ![5, 15, 30, 45, 60].includes(template.duration),
        isCustomPoints: ![1, 2, 3, 5].includes(template.points)
      });
      
      // 如果是自定义时长和积分，设置对应的值
      if (this.data.isCustomDuration) {
        this.setData({ customDurationValue: template.duration.toString() });
      }
      
      if (this.data.isCustomPoints) {
        this.setData({ customPointsValue: template.points.toString() });
      }
      
      // 更新任务负载预测
      this.updateTaskLoadPreview();
      
      // 给用户提示
      wx.showToast({
        title: '已应用模板',
        icon: 'success',
        duration: 1000
      });
    }
  },

  /**
   * 选择自定义任务
   */
  selectCustomTask: function() {
    this.setData({
      selectedTemplate: '',
      customMode: true,
      'task.title': '',
      'task.description': '',
      // 保留默认值，不清空
    });
  },

  /**
   * 保存当前任务为模板
   */
  saveAsTemplate: function() {
    const { task } = this.data;
    
    // 校验必要信息
    if (!task.title.trim()) {
      wx.showToast({
        title: '请先填写任务名称',
        icon: 'none'
      });
      return;
    }
    
    // 确保简称不超过4字符
    let shortName = task.shortName || '';
    if (!shortName) {
      // 如果没有简称，使用任务名前4个字
      shortName = task.title.substring(0, 4);
    }
    
    // 创建新模板
    const newTemplate = {
      id: 'custom_' + Date.now(),
      name: task.title,
      shortName: shortName,  // 保存简称
      icon: this.data.taskType === 'study' ? '📚' : '⏰',
      description: task.description,
      duration: task.duration,
      points: task.points,
      taskType: this.data.taskType,
      isCustom: true,
      createTime: Date.now()
    };
    
    // 获取现有模板
    wx.getStorage({
      key: 'customTemplates',
      success: (res) => {
        let templates = res.data || [];
        // 最多保留10个自定义模板，先进先出
        if (templates.length >= 10) {
          templates.pop();
        }
        templates.unshift(newTemplate);
        
        wx.setStorage({
          key: 'customTemplates',
          data: templates,
          success: () => {
            wx.showToast({
              title: '已保存为模板',
              icon: 'success'
            });
            // 刷新模板列表
            this.loadTaskTemplates();
          }
        });
      },
      fail: () => {
        wx.setStorage({
          key: 'customTemplates',
          data: [newTemplate],
          success: () => {
            wx.showToast({
              title: '已保存为模板',
              icon: 'success'
            });
            // 刷新模板列表
            this.loadTaskTemplates();
          }
        });
      }
    });
  },
}) 