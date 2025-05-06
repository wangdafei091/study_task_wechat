const app = getApp();
const Constants = require('../../utils/constants.js');
const uiUtils = require('../../utils/uiUtils.js');

Page({
  /**
   * 页面的初始数据
   */
  data: {
    allTasks: [],
    heatmapYear: new Date().getFullYear(),
    heatmapMonthIndex: new Date().getMonth(),
    heatmapMonth: '',
    // 添加新任务表单数据
    newTask: {
      title: '',
      type: 'habit', // 默认类型为习惯
      points: 1, // 默认积分修改为1
      pointsExpiry: 'permanent', // 默认积分有效期为永久
      description: '',
      isRequired: false, // 添加必做任务字段
      // 新增时间周期和频率相关字段
      isAllDay: false,
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      hasNoEndDate: false, // 添加无结束日期字段
      repeat: {
        type: 'daily', // 默认为每天，不再使用'none'
        days: [], // 自定义重复时选中的星期数组
        startDate: '', // 重复开始日期，与任务开始日期相同
        endDate: '' // 重复结束日期，与任务结束日期相同，无结束日期时为null
      },
      reminder: {
        enabled: false,
        time: 0 // 提前提醒的分钟数
      }
    },
    // 表单验证错误信息
    errors: {
      title: ''
    },
    // 描述字段限制常量
    descMaxLength: 50,
    descPlaceholder: '输入任务描述（可选）',
    // 新增UI控制字段
    repeatText: '每天',
    reminderText: '无',
    pointsExpiryText: '永久', // 积分有效期显示文本
    // 日期时间选择面板控制
    startDatePanel: false,
    endDatePanel: false,
    // 新增重复、提醒和积分有效期面板控制
    repeatPanel: false, 
    reminderPanel: false,
    pointsExpiryPanel: false, // 积分有效期面板
    // 重复面板模式：'type'表示选择重复类型，'weekday'表示选择星期
    repeatPanelMode: 'type',
    // 星期选择状态 [周日,周一,周二,周三,周四,周五,周六]
    weekdaySelection: [false, false, false, false, false, false, false],
    
    // 新增重复预览相关字段
    repeatPreviewText: '', // 重复预览文本
    repeatTypeWarning: false, // 是否存在重复类型警告
    repeatPanelDesc: '任务将在所选时间范围内按设定频率执行' // 动态面板说明文字
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function(options) {
    console.log('[TaskEdit] 页面加载');
    
    // 记录UI优化日志
    uiUtils.logUIOptimization('task-edit', '页面加载', {
      'cardSpacing': '20rpx',
      'elementPadding': '24rpx',
      'groupSeparation': '分组边框样式优化'
    });
    
    // 记录按钮布局优化
    uiUtils.logButtonLayoutOptimization('task-edit', {
      'layout': '垂直排列',
      'primaryButton': '添加任务置顶',
      'secondaryButton': '清空按钮置底',
      'buttonHeight': '88rpx',
      'buttonGap': '16rpx'
    });
    
    // 初始化热力图月份
    this.initHeatmapMonth();
    
    // 初始化日期时间数据
    this.initDateTimeData();
    
    // 加载所有任务
    this.loadAllTasks();
    
    // 确保所有面板初始状态为关闭
    this.setData({
      startDatePanel: false,
      endDatePanel: false,
      repeatPanel: false,
      reminderPanel: false,
      pointsExpiryPanel: false
    });
    
    // 初始化重复预览文本
    this.setData({
      repeatPreviewText: this.generateRepeatPreviewText('daily')
    });
    
    // 获取当前日期
    const todayDate = new Date();
    const dayOfWeek = todayDate.getDay(); // 0是周日，6是周六
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    
    // 打印当前日期和星期信息
    console.log(`[TaskEdit] 页面初始化: 今天是 ${this.data.newTask.startDate} (${dayNames[dayOfWeek]})`);
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function() {
    console.log('[task-edit] 页面显示，刷新任务数据');
    
    // 记录样式一致性日志
    uiUtils.logStyleConsistency('表单区域', {
      '表单组间距': '40rpx',
      '表单项间距': '24rpx',
      '按钮区域': '顶部边框分隔',
      '开关对齐': '统一右对齐位置'
    });
    
    this.loadAllTasks();
  },

  /**
   * 加载所有任务数据
   */
  loadAllTasks: function() {
    try {
      const allTasks = app.globalData.tasks || [];
      
      this.setData({ 
        allTasks: allTasks
      });
      
      console.log('[TaskEdit] 任务数据加载成功，共 ' + allTasks.length + ' 个任务');
    } catch (error) {
      console.error('[TaskEdit] 加载任务数据失败:', error);
      
      wx.showToast({
        title: '加载数据失败',
        icon: 'none',
        duration: 2000
      });
    }
  },

  /**
   * 初始化热力图月份信息
   */
  initHeatmapMonth: function() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', 
                      '七月', '八月', '九月', '十月', '十一月', '十二月'];
    
    this.setData({
      heatmapYear: year,
      heatmapMonthIndex: month,
      heatmapMonth: `${year}年${monthNames[month]}`
    });
  },

  /**
   * 热力图月份变化事件处理
   */
  onHeatmapMonthChange: function(e) {
    this.setData({
      heatmapYear: e.detail.year,
      heatmapMonthIndex: e.detail.month,
      heatmapMonth: `${e.detail.year}年${e.detail.monthName}`
    });
  },

  /**
   * 获取热力图组件
   * @returns {Object} 热力图组件实例
   */
  getHeatmapComponent: function() {
    return this.selectComponent('#taskHeatmap');
  },

  /**
   * 切换到上个月
   */
  prevHeatmapMonth: function() {
    const heatmap = this.getHeatmapComponent();
    if (heatmap) heatmap.prevMonth();
  },

  /**
   * 切换到下个月
   */
  nextHeatmapMonth: function() {
    const heatmap = this.getHeatmapComponent();
    if (heatmap) heatmap.nextMonth();
  },

  /**
   * 处理热力图日期选择事件
   */
  onHeatmapDaySelect: function(e) {
    // 日期选择事件由热力图组件内部处理
  },

  /**
   * 处理热力图任务刷新事件
   */
  onHeatmapRefreshTasks: function(e) {
    console.log('[TaskEdit] 收到热力图任务刷新请求');
    
    // 获取任务管理器
    const taskManager = require('../../utils/taskManager.js');
    
    // 直接从存储中获取最新数据，而非使用缓存
    taskManager.getAllTasks(latestTasks => {
      console.log('[TaskEdit] 已获取最新任务数据，任务数量:', latestTasks.length);
      
      // 确保使用新引用更新数据，触发观察器
      this.setData({ 
        allTasks: [...latestTasks]
      }, () => {
        // 数据设置完成后，手动触发热力图重新计算
        console.log('[TaskEdit] 已更新热力图任务数据，正在刷新热力图');
        
        // 获取热力图组件实例
        const heatmap = this.getHeatmapComponent();
        
        // 确保热力图组件存在，并调用其计算方法
        if (heatmap) {
          console.log('[TaskEdit] 正在触发热力图重新计算');
          heatmap.calculateHeatMap();
          
          // 添加一个延迟检查，确保热力图已完全重新计算
          setTimeout(() => {
            console.log('[TaskEdit] 执行额外的热力图刷新确认');
            heatmap.calculateHeatMap();
          }, 300);
        } else {
          console.error('[TaskEdit] 找不到热力图组件实例');
        }
      });
    });
  },

  /**
   * 显示压力指数说明
   */
  showPressureInfo: function() {
    console.log('[TaskEdit] 显示压力指数说明');
    const heatmap = this.getHeatmapComponent();
    if (heatmap) heatmap.showPressureInfo();
  },

  /**
   * 处理任务标题输入
   */
  onTaskTitleInput: function(e) {
    this.setData({
      'newTask.title': e.detail.value,
      'errors.title': ''
    });
  },

  /**
   * 选择任务类型
   */
  selectTaskType: function(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      'newTask.type': type
    });
  },

  /**
   * 更改积分
   */
  changePoints: function(e) {
    const action = e.currentTarget.dataset.action;
    let points = this.data.newTask.points;
    
    if (action === 'plus') {
      points = Math.min(points + 1, 50); // 上限50分
    } else if (action === 'minus') {
      points = Math.max(points - 1, 1); // 下限1分
    }
    
    this.setData({
      'newTask.points': points
    });
  },

  /**
   * 处理积分输入
   */
  onPointsInput: function(e) {
    this.setData({
      'newTask.points': e.detail.value
    });
  },

  /**
   * 处理描述输入
   */
  onDescriptionInput: function(e) {
    this.setData({
      'newTask.description': e.detail.value
    });
  },

  /**
   * 清空任务表单
   */
  clearTaskForm: function() {
    console.log('[TaskEdit] 清空任务表单');
    
    // 重置任务为默认状态
    this.setData({
      'newTask.title': '',
      'newTask.type': 'habit',
      'newTask.points': 1, // 修改为1分（正数）
      'newTask.pointsExpiry': 'permanent', // 重置积分有效期为永久
      'newTask.description': '',
      'newTask.isAllDay': false,
      'newTask.hasNoEndDate': false, // 重置无结束日期字段
      'newTask.isRequired': false,
      'errors.title': '',
      repeatText: '每天',
      reminderText: '无',
      pointsExpiryText: '永久', // 重置积分有效期文本
      'newTask.repeat': {
        type: 'daily',
        days: [],
        startDate: '',
        endDate: ''
      },
      'newTask.reminder': {
        enabled: false,
        time: 0
      }
    });
    
    // 重新初始化日期时间数据
    this.initDateTimeData();
    
    // 关闭所有面板
    this.closeAllPanels();
    
    wx.showToast({
      title: '已清空表单',
      icon: 'success',
      duration: 1000
    });
  },

  /**
   * 验证任务表单数据
   * @returns {Object} 验证通过返回任务数据，验证失败返回包含valid字段的对象
   */
  validateTaskForm: function() {
    // 创建错误信息容器
    const result = {
      valid: true,
      errorMsg: ''
    };
    
    // 验证标题
    if (!this.data.newTask.title.trim()) {
      result.valid = false;
      result.errorMsg = '请输入任务标题';
      return result;
    }
    
    // 验证日期
    if (!this.data.newTask.startDate) {
      result.valid = false;
      result.errorMsg = '请选择开始日期';
      return result;
    }
    
    // 验证重复任务的结束日期
    if (this.data.newTask.repeat && this.data.newTask.repeat.type !== 'none') {
      // 如果是重复任务，且没有勾选"无结束日期"，必须设置结束日期
      if (!this.data.newTask.hasNoEndDate && !this.data.newTask.endDate) {
        result.valid = false;
        result.errorMsg = '请设置重复任务的结束日期';
        console.error('[TaskEdit] 验证失败: 重复任务缺少结束日期');
        return result;
      }
      
      // 如果设置了结束日期，确保结束日期不早于开始日期
      if (this.data.newTask.endDate && this.data.newTask.endDate < this.data.newTask.startDate) {
        result.valid = false;
        result.errorMsg = '结束日期不能早于开始日期';
        console.error('[TaskEdit] 验证失败: 结束日期早于开始日期');
        return result;
      }
    }
    
    // 验证时间
    if (!this.data.newTask.isAllDay && (!this.data.newTask.startTime || !this.data.newTask.endTime)) {
      result.valid = false;
      result.errorMsg = '请设置开始和结束时间';
      return result;
    }
    
    // 注意：日期与重复类型匹配问题不再视为表单验证失败
    // 只在UI中显示警告，允许用户继续创建任务
    if (this.data.repeatTypeWarning) {
      console.log('[TaskEdit] 检测到日期与重复类型不匹配，但允许继续创建任务');
    }
    
    // 验证通过后，返回完整的任务对象
    console.log('[TaskEdit] 表单验证通过，组装完整任务数据');
    const taskData = {
      title: this.data.newTask.title,
      type: this.data.newTask.type,
      date: this.data.newTask.startDate,
      description: this.data.newTask.description,
      points: this.data.newTask.points,
      pointsExpiry: this.data.newTask.pointsExpiry,
      pointsExpiryDate: this.data.pointsExpiryText,
      isRequired: this.data.newTask.isRequired,
      isAllDay: this.data.newTask.isAllDay,
      startTime: this.data.newTask.startTime,
      endTime: this.data.newTask.endTime,
      hasNoEndDate: this.data.newTask.hasNoEndDate, // 明确传递无结束日期标志
      repeat: this.data.newTask.repeat,
      reminder: this.data.newTask.reminder
    };
    
    // 确保重复任务的开始和结束日期与主任务一致
    if (taskData.repeat.startDate !== taskData.date) {
      console.log('[TaskEdit] 修正重复任务开始日期与主任务保持一致');
      taskData.repeat.startDate = taskData.date;
    }
    
    // 确保endDate字段和repeat.endDate字段一致
    if (!this.data.newTask.hasNoEndDate) {
      if (taskData.repeat.endDate !== this.data.newTask.endDate) {
        console.log('[TaskEdit] 修正重复任务结束日期与主任务保持一致');
        taskData.repeat.endDate = this.data.newTask.endDate;
      }
      console.log(`[TaskEdit] 任务结束日期设置为: ${taskData.repeat.endDate}`);
    } else {
      console.log('[TaskEdit] 任务设置为无结束日期模式，将使用默认期限');
    }
    
    // 添加更详细的重复任务配置日志
    if (taskData.repeat && taskData.repeat.type !== 'none') {
      console.log('[TaskEdit] 任务包含重复配置:', JSON.stringify(taskData.repeat));
      console.log(`[TaskEdit] 重复任务详情 - 类型: ${taskData.repeat.type}, 开始日期: ${taskData.repeat.startDate}, 结束日期: ${taskData.hasNoEndDate ? '无限期' : taskData.repeat.endDate}`);
      console.log(`[TaskEdit] 无结束日期标志: ${taskData.hasNoEndDate}`);
    }
    
    console.log('[TaskEdit] 组装完成的任务数据:', 
               {title: taskData.title, type: taskData.type, date: taskData.date, hasNoEndDate: taskData.hasNoEndDate});
    
    return taskData;
  },

  /**
   * 添加新任务
   */
  addTask: function() {
    try {
      // 获取任务表单数据
      const formResult = this.validateTaskForm();
      
      // 检查返回值是否为验证结果对象（有valid字段）
      if (formResult && 'valid' in formResult && !formResult.valid) {
        // 验证失败，显示错误信息
        wx.showToast({
          title: formResult.errorMsg || '表单验证失败',
          icon: 'none',
          duration: 2000
        });
        return;
      }
      
      // 此时formResult应该是完整的任务对象
      const newTask = formResult;
      
      // 记录任务数据日志
      console.log('[TaskEdit] 开始创建任务，数据:', 
                 {title: newTask.title, type: newTask.type, date: newTask.date});
      
      // 显示加载提示
      wx.showLoading({
        title: '添加中...',
        mask: true
      });
      
      // 添加超时保护，确保加载提示不会一直显示
      this.loadingTimeout = setTimeout(() => {
        console.log('[TaskEdit] 任务添加操作超时，强制关闭加载提示');
        wx.hideLoading();
        
        // 提示用户操作耗时过长
        wx.showToast({
          title: '任务添加耗时较长',
          icon: 'none',
          duration: 2000
        });
      }, 15000);
      
      // 获取任务管理器
      const taskManager = require('../../utils/taskManager.js');
      
      // 检查特殊类型的任务并做预处理
      if (newTask.type === 'study') {
        // 任务加载中的提示文本优化
        wx.showLoading({
          title: '创建学习任务...',
          mask: true
        });
        
        // 计算任务持续时间（分钟）
        const startTimeParts = newTask.startTime.split(':').map(Number);
        const endTimeParts = newTask.endTime.split(':').map(Number);
        
        const startMinutes = startTimeParts[0] * 60 + startTimeParts[1];
        const endMinutes = endTimeParts[0] * 60 + endTimeParts[1];
        
        // 如果结束时间早于开始时间，则认为是跨天的情况
        let durationMinutes = endMinutes >= startMinutes ? 
            endMinutes - startMinutes : 
            (24 * 60 - startMinutes) + endMinutes;
        
        console.log(`[TaskEdit] 学习任务持续时间: ${durationMinutes}分钟`);
        
        // 对长时间任务添加日志和额外确认
        if (durationMinutes > 180) {
          console.log(`[TaskEdit] 正在创建长时间任务 - 持续${Math.floor(durationMinutes / 60)}小时${durationMinutes % 60}分钟`);
          
          // 添加任务的持续时间字段，方便后续处理
          newTask.duration = durationMinutes;
          
          // 确保进度条更新正常
          wx.showLoading({
            title: '处理长时间任务...',
            mask: true
          });
          
          // 简短延迟确保UI刷新
          setTimeout(() => {
            console.log('[TaskEdit] 长时间任务预处理完成，继续创建任务');
            // 在这里继续调用实际的创建任务函数
            this._doCreateTask(taskManager, newTask, (result) => {
              if (result) {
                // 添加成功，记录详细日志
                console.log('[TaskEdit] 新任务添加成功，ID:', typeof result === 'object' ? result.id : '未知', 
                           '标题:', newTask.title);
                
                // 显示任务添加成功提示
                wx.showToast({
                  title: '任务添加成功',
                  icon: 'success',
                  duration: 2000
                });
                
                // 重置表单数据
                console.log('[TaskEdit] 重置表单数据');
                this.setData({
                  'newTask.title': '',
                  'newTask.type': 'habit',
                  'newTask.points': 1,
                  'newTask.description': '',
                  'newTask.isAllDay': false,
                  'newTask.hasNoEndDate': false,
                  'newTask.isRequired': false,
                  'errors.title': '',
                  repeatText: '每天',
                  reminderText: '无',
                  pointsExpiryText: '永久',
                  'newTask.repeat': {
                    type: 'daily',
                    days: [],
                    startDate: '',
                    endDate: ''
                  },
                  'newTask.reminder': {
                    enabled: false,
                    time: 0
                  }
                });
                
                // 重新初始化日期时间数据
                this.initDateTimeData();
                
                // 关闭所有面板
                this.closeAllPanels();
                
                // 重新加载任务数据
                this.loadAllTasks();
                
                // 如果热力图组件存在，使用延迟刷新避免UI阻塞
                const heatmap = this.getHeatmapComponent();
                if (heatmap) {
                  console.log('[TaskEdit] 任务添加成功，准备延迟刷新热力图');
                  setTimeout(() => {
                    console.log('[TaskEdit] 开始延迟刷新热力图');
                    heatmap.calculateHeatMap();
                  }, 300);
                }
              } else {
                // 添加失败，显示错误提示
                console.error('[TaskEdit] 任务添加失败');
                wx.showToast({
                  title: '添加失败',
                  icon: 'none',
                  duration: 2000
                });
              }
            });
          }, 300);
          
          return; // 中断当前流程，由延时函数继续
        }
      }
      
      // 直接创建普通任务（非长时间任务）
      this._doCreateTask(taskManager, newTask, (result) => {
        if (result) {
          // 添加成功，记录详细日志
          console.log('[TaskEdit] 新任务添加成功，ID:', typeof result === 'object' ? result.id : '未知', 
                     '标题:', newTask.title);
          
          // 显示任务添加成功提示
          wx.showToast({
            title: '任务添加成功',
            icon: 'success',
            duration: 2000
          });
          
          // 重置表单数据
          console.log('[TaskEdit] 重置表单数据');
          this.setData({
            'newTask.title': '',
            'newTask.type': 'habit',
            'newTask.points': 1,
            'newTask.description': '',
            'newTask.isAllDay': false,
            'newTask.hasNoEndDate': false,
            'newTask.isRequired': false,
            'errors.title': '',
            repeatText: '每天',
            reminderText: '无',
            pointsExpiryText: '永久',
            'newTask.repeat': {
              type: 'daily',
              days: [],
              startDate: '',
              endDate: ''
            },
            'newTask.reminder': {
              enabled: false,
              time: 0
            }
          });
          
          // 重新初始化日期时间数据
          this.initDateTimeData();
          
          // 关闭所有面板
          this.closeAllPanels();
          
          // 重新加载任务数据
          this.loadAllTasks();
          
          // 如果热力图组件存在，使用延迟刷新避免UI阻塞
          const heatmap = this.getHeatmapComponent();
          if (heatmap) {
            console.log('[TaskEdit] 任务添加成功，准备延迟刷新热力图');
            setTimeout(() => {
              console.log('[TaskEdit] 开始延迟刷新热力图');
              heatmap.calculateHeatMap();
            }, 300);
          }
        } else {
          // 添加失败，显示错误提示
          console.error('[TaskEdit] 任务添加失败');
          wx.showToast({
            title: '添加失败',
            icon: 'none',
            duration: 2000
          });
        }
      });
    } catch (error) {
      // 捕获并处理错误
      console.error('[TaskEdit] 添加任务时发生错误:', error);
      
      // 确保错误时也关闭加载提示
      wx.hideLoading();
      
      // 清除超时计时器（如果存在）
      if (this.loadingTimeout) {
        clearTimeout(this.loadingTimeout);
        this.loadingTimeout = null;
      }
      
      wx.showToast({
        title: '添加失败: ' + (error.message || '未知错误'),
        icon: 'none',
        duration: 3000
      });
    }
  },

  /**
   * 执行任务创建
   * @private
   */
  _doCreateTask: function(taskManager, taskData, callback) {
    try {
      // 记录当前时间戳
      const startTimestamp = Date.now();
      console.log(`[TaskEdit] 开始执行任务创建，当前时间戳: ${startTimestamp}`);
      
      // 追加基本任务类型验证
      if (!taskData || !taskData.title || !taskData.type) {
        console.error('[TaskEdit] 任务数据验证失败:', taskData);
        
        // 关闭加载提示
        wx.hideLoading();
        
        // 显示错误信息
        wx.showToast({
          title: '任务数据不完整',
          icon: 'none',
          duration: 2000
        });
        
        if (callback) callback(false);
        return;
      }
      
      console.log(`[TaskEdit] 任务数据验证通过，开始创建任务: ${JSON.stringify({
        title: taskData.title,
        type: taskData.type, 
        date: taskData.date,
        repeat: taskData.repeat
      })}`);
      
      // 更新loading文本，指示正在创建任务
      wx.showLoading({
        title: '创建任务中...',
        mask: true
      });
      
      // 创建任务
      taskManager.createTask(taskData, (result) => {
        // 任务创建完成，记录耗时
        const endTimestamp = Date.now();
        const duration = endTimestamp - startTimestamp;
        
        console.log(`[TaskEdit] 任务创建请求完成，耗时: ${duration} ms`);
        
        // 关闭加载提示
        wx.hideLoading();
        
        if (!result) {
          console.error('[TaskEdit] 任务创建失败，返回结果为空');
          
          // 显示错误信息
          wx.showToast({
            title: '任务创建失败',
            icon: 'none',
            duration: 2000
          });
          
          if (callback) callback(false);
          return;
        }
        
        // 清除超时保护
        if (this.loadingTimeout) {
          clearTimeout(this.loadingTimeout);
          this.loadingTimeout = null;
        }
        
        console.log('[TaskEdit] 执行任务创建完成回调');
        
        // 调用回调函数返回结果
        if (callback) callback(result);
      });
    } catch (error) {
      // 捕获并处理任何异常
      console.error('[TaskEdit] 任务创建过程中发生异常:', error);
      
      // 确保关闭加载提示
      wx.hideLoading();
      
      // 显示错误信息
      wx.showToast({
        title: '任务创建出错',
        icon: 'none',
        duration: 2000
      });
      
      // 清除超时保护
      if (this.loadingTimeout) {
        clearTimeout(this.loadingTimeout);
        this.loadingTimeout = null;
      }
      
      // 回调错误结果
      if (callback) callback(false);
    }
  },

  /**
   * @deprecated 使用统一的addTask函数代替，此函数将在未来版本移除
   */
  doAddTask: function() {
    console.log('[TaskEdit] 警告：调用了已废弃的doAddTask函数，请使用addTask代替');
    this.addTask();
  },

  /**
   * 初始化日期时间数据
   */
  initDateTimeData: function() {
    // 获取当前日期时间
    const now = new Date();
    
    // 格式化日期为YYYY-MM-DD
    const today = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    
    // 获取当前小时
    const currentHour = now.getHours();
    
    // 计算开始时间和结束时间，整点为单位，并确保至少有1小时间隔
    let startHour = currentHour;
    let endHour = currentHour + 1;
    
    // 如果已经是晚上，默认设为明天的早上和上午
    if (currentHour >= 20) {
      startHour = 9; // 第二天上午9点
      endHour = 10; // 第二天上午10点
    }
    
    // 避免超过24小时
    if (endHour >= 24) {
      endHour = 23;
    }
    
    // 格式化为HH:00格式的时间字符串
    const startTime = `${startHour.toString().padStart(2, '0')}:00`;
    const endTime = `${endHour.toString().padStart(2, '0')}:00`;
    
    // 设置到组件数据中
    this.setData({
      'newTask.startDate': today,
      'newTask.endDate': today,
      'newTask.startTime': startTime,
      'newTask.endTime': endTime,
      // 同时初始化重复任务的开始日期和结束日期，确保同步
      'newTask.repeat.startDate': today,
      'newTask.repeat.endDate': today
    });
    
    console.log(`[TaskEdit] 初始化日期时间数据完成, 当前日期: ${today} 开始时间: ${startTime} 结束时间: ${endTime}`);
  },

  /**
   * 全天开关切换
   */
  toggleAllDay: function(e) {
    const isAllDay = e.detail.value;
    
    this.setData({
      'newTask.isAllDay': isAllDay
    });
    
    console.log('[TaskEdit] 全天选项:', isAllDay ? '开启' : '关闭');
  },
  
  /**
   * 无结束日期开关切换
   */
  toggleNoEndDate: function(e) {
    const hasNoEndDate = e.detail.value;
    
    this.setData({
      'newTask.hasNoEndDate': hasNoEndDate
    });
    
    // 当日期选择面板打开时，更新日期选择器状态
    if (this.data.endDatePanel) {
      // 关闭日期选择面板
      this.setData({
        endDatePanel: false
      });
    }
    
    // 如果开启无结束日期，禁用结束日期选择器并提示用户
    if (hasNoEndDate) {
      wx.showToast({
        title: '任务将无限期重复',
        icon: 'none',
        duration: 2000
      });
    }
    
    // 更新重复预览文本
    if (this.data.newTask.repeat.type !== 'none') {
      this.setData({
        repeatPreviewText: this.generateRepeatPreviewText(this.data.newTask.repeat.type)
      });
    }
    
    console.log('[TaskEdit] 无结束日期选项:', hasNoEndDate ? '开启' : '关闭');
  },
  
  /**
   * 开始时间选择
   */
  onStartTimeChange: function(e) {
    const time = e.detail.value;
    
    this.setData({
      'newTask.startTime': time
    });
    
    // 检查并调整结束时间
    this.checkAndAdjustEndTime(time);
    
    // 更新重复预览文本
    if (this.data.newTask.repeat.type !== 'none') {
      this.setData({
        repeatPreviewText: this.generateRepeatPreviewText(this.data.newTask.repeat.type)
      });
    }
    
    console.log('[TaskEdit] 设置开始时间:', time);
  },
  
  /**
   * 结束时间选择
   */
  onEndTimeChange: function(e) {
    const time = e.detail.value;
    const isSameDay = this.data.newTask.startDate === this.data.newTask.endDate;
    
    // 如果是同一天，确保结束时间不早于开始时间
    if (!this.isValidEndTime(this.data.newTask.startTime, time, isSameDay)) {
      wx.showToast({
        title: '结束时间不能早于开始时间',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    // 计算任务持续时间
    if (isSameDay && this.data.newTask.startTime) {
      const [startHours, startMinutes] = this.data.newTask.startTime.split(':').map(Number);
      const [endHours, endMinutes] = time.split(':').map(Number);
      
      let startTotalMinutes = startHours * 60 + startMinutes;
      let endTotalMinutes = endHours * 60 + endMinutes;
      
      // 处理跨越午夜的情况
      if (endTotalMinutes < startTotalMinutes) {
        endTotalMinutes += 24 * 60;
      }
      
      const durationMinutes = endTotalMinutes - startTotalMinutes;
      
      console.log(`[TaskEdit] 设置任务持续时间: ${Math.floor(durationMinutes / 60)}小时${durationMinutes % 60}分钟`);
      
      // 对超过3小时的任务添加日志
      if (durationMinutes > 180) {
        console.log(`[TaskEdit] 创建长时间任务(${durationMinutes}分钟)，确保界面刷新机制正常工作`);
        
        // 在设置结束时间前，先确保之后的UI更新正常
        wx.showLoading({
          title: '处理中...',
          mask: false,
          duration: 300
        });
      }
    }
    
    this.setData({
      'newTask.endTime': time
    });
    
    // 更新重复预览文本
    if (this.data.newTask.repeat.type !== 'none') {
      this.setData({
        repeatPreviewText: this.generateRepeatPreviewText(this.data.newTask.repeat.type)
      });
    }
    
    console.log('[TaskEdit] 设置结束时间:', time);
  },
  
  /**
   * 切换面板显示状态
   */
  togglePanel: function(e) {
    const panelName = e.currentTarget.dataset.panel;
    
    // 关闭所有其他面板
    const newState = {
      startDatePanel: false,
      endDatePanel: false,
      repeatPanel: false,
      reminderPanel: false,
      pointsExpiryPanel: false
    };
    
    // 切换当前面板状态
    newState[panelName] = !this.data[panelName];
    
    this.setData(newState);
    
    console.log(`[TaskEdit] 切换${panelName}:`, newState[panelName] ? '打开' : '关闭');
    
    // 如果打开重复面板，确保其处于默认的重复类型选择模式
    if (panelName === 'repeatPanel' && newState[panelName]) {
      this.setData({
        repeatPanelMode: 'type'
      });
    }
  },
  
  /**
   * 切换到星期选择模式
   */
  switchToWeekdaySelection: function() {
    const weekdaySelection = [false, false, false, false, false, false, false];
    
    // 获取当前开始日期信息
    const startDate = new Date(this.data.newTask.startDate.replace(/-/g, '/'));
    const startDayOfWeek = startDate.getDay(); // 0是周日，6是周六
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    
    // 是否已有自定义设置
    const hasCustomConfig = this.data.newTask.repeat.type === 'custom' && 
                            this.data.newTask.repeat.days && 
                            this.data.newTask.repeat.days.length > 0;
    
    if (hasCustomConfig) {
      // 从已保存设置恢复选择状态
      // 确保days是数字类型
      this.data.newTask.repeat.days.forEach(day => {
        const dayIndex = parseInt(day);
        weekdaySelection[dayIndex] = true;
      });
      
      console.log('[TaskEdit] 从已保存设置恢复星期选择: ', this.data.newTask.repeat.days);
    } else {
      // 如果是新选择，根据当前开始日期的星期预选对应日期
      weekdaySelection[startDayOfWeek] = true;
      
      // 更新任务重复信息
      const selectedDays = [startDayOfWeek];
      
      // 在这里更新任务重复设置
      this.setData({
        'newTask.repeat.type': 'custom',
        'newTask.repeat.days': selectedDays,
        repeatText: '每' + dayNames[startDayOfWeek]
      });
      
      console.log(`[TaskEdit] 根据开始日期预选星期: ${dayNames[startDayOfWeek]} (索引${startDayOfWeek})`);
    }
    
    // 收集已选择的星期
    const selectedDays = [];
    weekdaySelection.forEach((selected, index) => {
      if (selected) {
        selectedDays.push(index);
      }
    });
    
    // 检查是否包含开始日期对应的星期
    const hasStartDay = selectedDays.includes(startDayOfWeek);
    
    // 检查是否需要强制更新UI
    const needForceUpdate = !hasStartDay;
    
    if (!hasStartDay) {
      console.log(`[TaskEdit] ⚠️ 警告: 恢复的选择不包含开始日期对应的星期，将显示告警`);
    }
    
    // 更新选择状态，先更新基本UI
    this.setData({
      weekdaySelection: weekdaySelection,
      repeatPanelMode: 'weekday'
    });
    
    // 使用新函数更新预览文本和告警状态
    this.updateRepeatPreviewWithForce(needForceUpdate);
    
    // 获取警告状态
    const hasWarning = this.data.repeatTypeWarning;
    
    console.log(`[TaskEdit] 切换到星期选择模式: 选择了${selectedDays.length}天，包含开始日期=${hasStartDay}，冲突状态=${hasWarning ? '有冲突' : '无冲突'}`);
  },
  
  /**
   * 返回到重复类型选择模式
   */
  backToRepeatTypePanel: function() {
    // 收集选中的星期
    const selectedDays = [];
    this.data.weekdaySelection.forEach((selected, index) => {
      if (selected) {
        selectedDays.push(index);
      }
    });
    
    // 获取开始日期信息
    const startDate = new Date(this.data.newTask.startDate.replace(/-/g, '/'));
    const startDayOfWeek = startDate.getDay();
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const hasStartDay = selectedDays.includes(startDayOfWeek);
    
    // 无论是否有选中的星期，都更新自定义重复设置
    let repeatText = '';
    
    if (selectedDays.length > 0) {
      // 设置自定义重复文本
      if (selectedDays.length <= 2) {
        // 1-2天显示具体星期
        repeatText = '每' + selectedDays.map(day => dayNames[day]).join('、');
      } else {
        // 3天或以上显示"每周多天"
        repeatText = '每周多天';
      }
    } else {
      repeatText = '请选择星期';
    }
    
    console.log(`[TaskEdit] 返回重复类型面板: 当前选择了${selectedDays.length}天, 开始日期是${dayNames[startDayOfWeek]}(${hasStartDay ? '已包含' : '未包含'})`);
    
    // 检查是否需要强制更新UI
    const needForceUpdate = !hasStartDay;
    
    if (!hasStartDay) {
      console.log(`[TaskEdit] ⚠️ 关键状态: 开始日期对应的星期未被选择，将在返回时显示告警`);
    }
    
    // 更新任务重复设置并返回到重复类型面板
    this.setData({
      'newTask.repeat.type': 'custom',
      'newTask.repeat.days': selectedDays,
      repeatText: repeatText,
      // 切换面板模式
      repeatPanelMode: 'type'
    });
    
    // 使用新函数更新预览文本和告警状态
    this.updateRepeatPreviewWithForce(needForceUpdate);
    
    // 使用冲突信息更新日志
    const hasWarning = this.data.repeatTypeWarning;
    console.log(`[TaskEdit] 返回重复类型面板完成: 冲突状态=${hasWarning ? '有冲突' : '无冲突'}`);
  },
  
  /**
   * 切换星期选择状态
   */
  toggleWeekdaySelection: function(e) {
    const day = parseInt(e.currentTarget.dataset.day);
    const newSelection = [...this.data.weekdaySelection];
    
    // 获取当前开始日期的星期
    const startDate = new Date(this.data.newTask.startDate.replace(/-/g, '/'));
    const startDayOfWeek = startDate.getDay(); // 0是周日，6是周六
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    
    // 记录操作是选择还是取消选择
    const isSelecting = !newSelection[day];
    const isTargetStartDay = (day === startDayOfWeek);
    
    // 记录操作前的选择状态
    const wasStartDaySelected = newSelection[startDayOfWeek];
    
    // 更新选择状态
    newSelection[day] = !newSelection[day];
    
    // 实时更新重复类型和文本
    const selectedDays = [];
    newSelection.forEach((selected, index) => {
      if (selected) {
        selectedDays.push(index);
      }
    });
    
    // 操作后开始日期对应的星期是否被选中
    const isStartDaySelected = selectedDays.includes(startDayOfWeek);
    
    // 检查是否是取消选择了开始日期对应的星期
    const canceledStartDay = !isSelecting && isTargetStartDay;
    
    // 只记录关键状态变化的日志
    if (canceledStartDay || (wasStartDaySelected && !isStartDaySelected)) {
      console.log(`[TaskEdit] ⚠️ 关键操作: ${isSelecting ? '选择' : '取消选择'}了星期${dayNames[day]}, 开始日期是${dayNames[startDayOfWeek]}`);
      console.log(`[TaskEdit] ⚠️ 状态变化: 开始日期的星期${isStartDaySelected ? '包含' : '不包含'}在当前选择中 (${selectedDays.map(d => dayNames[d]).join('、')})`);
    }
    
    let repeatText = '';
    
    // 无论是否有选中的星期，都需要更新预览文本
    if (selectedDays.length > 0) {
      if (selectedDays.length <= 2) {
        repeatText = '每' + selectedDays.map(day => dayNames[day]).join('、');
      } else {
        repeatText = '每周多天';
      }
    } else {
      repeatText = '请选择星期';
    }
    
    // 集中更新UI，先更新内部数据，然后一次性更新UI
    this.setData({
      weekdaySelection: newSelection,
      'newTask.repeat.type': 'custom',
      'newTask.repeat.days': selectedDays,
      repeatText: repeatText
    });
    
    // 立即强制更新预览文本和告警状态，特别关注取消选择开始日期对应星期的情况
    this.updateRepeatPreviewWithForce(canceledStartDay);
  },
  
  /**
   * 强制更新重复预览文本和告警状态
   * @param {boolean} forceUpdate 是否强制更新UI
   */
  updateRepeatPreviewWithForce: function(forceUpdate = false) {
    // 生成新的预览文本
    const newPreviewText = this.generateRepeatPreviewText('custom');
    
    // 获取当前冲突状态
    const hasConflict = this.data.repeatTypeWarning;
    
    // 更新UI
    this.setData({
      repeatPreviewText: newPreviewText
    });
    
    // 对于关键变更，确保UI更新是同步的，而不需要复杂的定时器逻辑
    if (forceUpdate && hasConflict) {
      // 使用更简单的方式触发重绘，只在有冲突时强制刷新
      wx.nextTick(() => {
        console.log(`[TaskEdit] 强制触发UI更新，确保告警信息立即显示 (冲突状态=有冲突)`);
      });
    }
  },
  
  /**
   * 关闭所有面板
   */
  closeAllPanels: function() {
    this.setData({
      startDatePanel: false,
      endDatePanel: false,
      repeatPanel: false,
      reminderPanel: false,
      pointsExpiryPanel: false
    });
    
    console.log('[TaskEdit] 关闭所有面板');
  },

  /**
   * 选择重复类型
   */
  selectRepeatType: function(e) {
    const type = e.currentTarget.dataset.type;
    
    let repeatText = '';
    switch (type) {
      case 'daily':
        repeatText = '每天';
        break;
      case 'workdays':
        repeatText = '工作日';
        break;
      case 'weekends':
        repeatText = '休息日';
        break;
    }
    
    this.setData({
      'newTask.repeat.type': type,
      repeatText: repeatText,
      repeatPreviewText: this.generateRepeatPreviewText(type)
    });
    
    console.log(`[TaskEdit] 已选择重复类型: ${type}, 预览文本已更新至统一信息区域`);
  },

  /**
   * 选择提醒类型
   */
  selectReminderType: function(e) {
    const enabled = e.currentTarget.dataset.enabled === 'true';
    const time = parseInt(e.currentTarget.dataset.time || 0);
    
    let reminderText = '无';
    if (enabled) {
      if (time === 0) {
        reminderText = '准时';
      } else if (time === -1) {
        reminderText = '提前1天(晚上8点)';
      } else {
        reminderText = `提前${time}分钟`;
      }
    }
    
    this.setData({
      'newTask.reminder.enabled': enabled,
      'newTask.reminder.time': time,
      reminderText: reminderText,
      reminderPanel: false // 选择后关闭面板
    });
    
    console.log(`[TaskEdit] 设置提醒: ${reminderText}, 参数: enabled=${enabled}, time=${time}`);
  },

  /**
   * 检查并调整结束时间
   */
  checkAndAdjustEndTime: function(startTime) {
    const isSameDay = this.data.newTask.startDate === this.data.newTask.endDate;
    if (isSameDay && this.data.newTask.endTime) {
      const startTimeValue = startTime || this.data.newTask.startTime;
      
      // 检查时间是否有效
      if (!this.isValidEndTime(startTimeValue, this.data.newTask.endTime, true)) {
        // 比较开始时间和结束时间
        const [startHours, startMinutes] = startTimeValue.split(':').map(Number);
        
        // 将结束时间设置为开始时间后一小时
        const newEndHour = (startHours + 1) % 24;
        const newEndTime = `${newEndHour.toString().padStart(2, '0')}:${startMinutes.toString().padStart(2, '0')}`;
        
        this.setData({
          'newTask.endTime': newEndTime,
        });
      }
    }
  },

  /**
   * 日期时间辅助函数 - 检查结束日期是否有效
   * @param {string} startDate 开始日期
   * @param {string} endDate 结束日期
   * @returns {boolean} 结束日期是否有效
   */
  isValidEndDate: function(startDate, endDate) {
    if (!startDate || !endDate) return false;
    return endDate >= startDate;
  },

  /**
   * 日期时间辅助函数 - 检查结束时间是否有效
   * @param {string} startTime 开始时间
   * @param {string} endTime 结束时间
   * @returns {boolean} 结束时间是否有效（仅当同一天时检查）
   */
  isValidEndTime: function(startTime, endTime, isSameDay) {
    if (!startTime || !endTime || !isSameDay) return true;
    
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    
    // 计算时间差（分钟）
    let startTotalMinutes = startHours * 60 + startMinutes;
    let endTotalMinutes = endHours * 60 + endMinutes;
    
    // 处理跨越午夜的情况
    if (endTotalMinutes < startTotalMinutes) {
      endTotalMinutes += 24 * 60; // 加上24小时的分钟数
    }
    
    const durationMinutes = endTotalMinutes - startTotalMinutes;
    
    // 记录持续时间到日志
    console.log(`[TaskEdit] 任务持续时间: ${Math.floor(durationMinutes / 60)}小时${durationMinutes % 60}分钟`);
    
    // 如果持续时间超过3小时，特别标记
    if (durationMinutes > 180) {
      console.log(`[TaskEdit] 检测到长时间任务(${durationMinutes}分钟)，已允许创建`);
    }
    
    if (startHours > endHours) return false;
    if (startHours === endHours && startMinutes >= endMinutes) return false;
    return true;
  },

  /**
   * 阻止滑动穿透
   */
  preventTouchMove: function(e) {
    // 阻止事件冒泡和默认行为
    return;
  },

  /**
   * 防止点击面板内部关闭面板
   */
  preventClose: function(e) {
    // 阻止事件冒泡
    return;
  },

  /**
   * 处理开始日期选择事件
   */
  onStartDateSelected: function(e) {
    const date = e.detail.date;
    
    this.setData({
      'newTask.startDate': date
    });
    
    // 如果结束日期早于开始日期，自动调整结束日期
    if (this.data.newTask.endDate < date) {
      this.setData({
        'newTask.endDate': date
      });
    }
    
    // 更新重复预览文本
    if (this.data.newTask.repeat.type !== 'none') {
      this.setData({
        repeatPreviewText: this.generateRepeatPreviewText(this.data.newTask.repeat.type)
      });
    }
    
    console.log('[TaskEdit] 选择开始日期:', date);
  },
  
  /**
   * 处理结束日期选择事件
   */
  onEndDateSelected: function(e) {
    const date = e.detail.date;
    
    this.setData({
      'newTask.endDate': date
    });
    
    // 同时更新重复任务的结束日期，修复结束日期不同步问题
    if (this.data.newTask.repeat && this.data.newTask.repeat.type !== 'none') {
      console.log('[TaskEdit] 同步更新重复任务结束日期:', date);
      this.setData({
        'newTask.repeat.endDate': date
      });
    }
    
    // 更新重复预览文本
    if (this.data.newTask.repeat.type !== 'none') {
      this.setData({
        repeatPreviewText: this.generateRepeatPreviewText(this.data.newTask.repeat.type)
      });
    }
    
    console.log('[TaskEdit] 选择结束日期:', date);
  },
  
  /**
   * 处理日期选择器关闭事件
   */
  onDatePickerClose: function(e) {
    const type = e.detail.type; // 'start' 或 'end'
    
    this.setData({
      [type + 'DatePanel']: false
    });
    
    console.log(`[TaskEdit] 关闭${type}日期选择器`);
  },

  /**
   * 生成重复预览文本
   * @param {string} repeatType 重复类型
   * @returns {string} 预览文本
   */
  generateRepeatPreviewText: function(repeatType) {
    // 如果没有选择重复类型，返回空
    if (!repeatType || repeatType === 'none') {
      return '';
    }
    
    console.log('[TaskEdit] 生成重复预览文本, repeatType:', repeatType);
    
    // 获取开始日期
    const startDate = new Date(this.data.newTask.startDate.replace(/-/g, '/'));
    const todayStr = this.data.newTask.startDate;
    
    // 获取结束日期字符串
    let endDateStr = '';
    if (!this.data.newTask.hasNoEndDate) {
      endDateStr = `直到${this.data.newTask.endDate}结束`;
    }
    
    // 日期的星期信息
    const dayOfWeek = startDate.getDay(); // 0是周日，6是周六
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const dayName = dayNames[dayOfWeek];
    
    let previewText = '';
    let warningExists = false;
    
    // 首先检查是否有日期冲突
    const conflictCheck = this.checkRepeatDateConflict(repeatType);
    
    if (conflictCheck.hasConflict) {
      // 如果有冲突，使用冲突的预览文本
      previewText = conflictCheck.previewText;
      warningExists = true;
      console.log(`[TaskEdit] 使用警告预览文本: ${previewText.substring(0, 30)}...`);
    } else {
      // 如果没有冲突，生成正常的预览文本
      switch (repeatType) {
        case 'daily':
          previewText = `从${todayStr}开始每天执行${endDateStr ? '，' + endDateStr : ''}`;
          break;
          
        case 'workdays':
          previewText = `从${todayStr}开始每个工作日执行${endDateStr ? '，' + endDateStr : ''}`;
          break;
          
        case 'weekends':
          previewText = `从${todayStr}开始每个休息日执行${endDateStr ? '，' + endDateStr : ''}`;
          break;
          
        case 'custom':
          // 获取选中的星期
          const selectedDays = this.data.newTask.repeat.days ? 
                              this.data.newTask.repeat.days.map(day => parseInt(day)) : 
                              [];
          if (selectedDays.length > 0) {
            const selectedDayNames = selectedDays.map(day => dayNames[day]).join('、');
            previewText = `从${todayStr}开始每${selectedDayNames}执行${endDateStr ? '，' + endDateStr : ''}`;
          } else {
            previewText = '请选择重复的星期';
          }
          break;
      }
    }
    
    // 更新警告状态
    if (this.data.repeatTypeWarning !== warningExists) {
      console.log(`[TaskEdit] 警告状态变化: ${this.data.repeatTypeWarning ? '有警告' : '无警告'} -> ${warningExists ? '有警告' : '无警告'}`);
    }
    
    this.setData({
      repeatTypeWarning: warningExists
    });
    
    // 使用简化的日志记录
    if (previewText.length > 30) {
      console.log(`[TaskEdit] 生成预览: ${previewText.substring(0, 30)}...${warningExists ? ' (有警告)' : ''}`);
    } else {
      console.log(`[TaskEdit] 生成预览: ${previewText}${warningExists ? ' (有警告)' : ''}`);
    }
    
    return previewText;
  },
  
  /**
   * 检查重复日期冲突
   * 集中处理日期冲突检测逻辑，确保一致性
   * @param {string} repeatType 重复类型
   * @returns {Object} 包含是否冲突和预览文本的对象
   */
  checkRepeatDateConflict: function(repeatType) {
    // 获取开始日期信息
    const startDate = new Date(this.data.newTask.startDate.replace(/-/g, '/'));
    const todayStr = this.data.newTask.startDate;
    const dayOfWeek = startDate.getDay(); // 0是周日，6是周六
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const dayName = dayNames[dayOfWeek];
    
    // 获取结束日期字符串
    let endDateStr = '';
    if (!this.data.newTask.hasNoEndDate) {
      endDateStr = `直到${this.data.newTask.endDate}结束`;
    }
    
    let previewText = '';
    let hasConflict = false;
    let conflictType = '';
    
    // 检查各种冲突情况
    switch (repeatType) {
      case 'workdays':
        // 判断开始日期是否是工作日（周一至周五）
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          previewText = `注意：开始日期(${todayStr}，${dayName})是休息日，系统将只创建周一至周五的任务实例。`;
          hasConflict = true;
          conflictType = '工作日任务不能从周末开始';
        }
        break;
        
      case 'weekends':
        // 判断开始日期是否是周末（周六或周日）
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          previewText = `注意：开始日期(${todayStr}，${dayName})是工作日，系统将只创建周六和周日的任务实例。`;
          hasConflict = true;
          conflictType = '休息日任务不能从工作日开始';
        }
        break;
        
      case 'custom':
        // 自定义重复的冲突检查
        if (this.data.newTask.repeat.days && this.data.newTask.repeat.days.length > 0) {
          // 确保selectedDays中的元素是数字类型
          const selectedDays = this.data.newTask.repeat.days.map(day => parseInt(day));
          const selectedDayNames = selectedDays.map(day => dayNames[day]).join('、');
          
          if (!selectedDays.includes(dayOfWeek)) {
            // 开始日期的星期不在所选星期中
            previewText = `注意：开始日期(${todayStr}，${dayName})不在所选重复星期(${selectedDayNames})内，系统将只创建符合条件的任务实例。`;
            hasConflict = true;
            conflictType = '开始日期的星期不在所选星期中';
            
            console.log(`[TaskEdit] 检测到冲突: 开始日期是${dayName}，但选择了${selectedDayNames}`);
          } else {
            // 无冲突，记录正常情况
            console.log(`[TaskEdit] 无冲突: 开始日期(${dayName})包含在选择的星期中(${selectedDayNames})`);
          }
        } else {
          // 没有选择任何星期
          previewText = `请至少选择一个重复的星期`;
          hasConflict = true;
          conflictType = '未选择任何重复星期';
          
          console.log('[TaskEdit] 检测到问题: 未选择任何重复星期');
        }
        break;
    }
    
    if (hasConflict) {
      console.log(`[TaskEdit] 检查冲突: 发现冲突(${conflictType})`);
    }
    
    return {
      hasConflict: hasConflict,
      previewText: previewText,
      conflictType: conflictType
    };
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide: function() {
    console.log('[task-edit] 页面隐藏');
    
    // 确保关闭任何可能存在的加载提示
    try {
      wx.hideLoading();
    } catch (error) {
      console.error('[task-edit] 页面隐藏时关闭加载提示出错:', error);
    }
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function() {
    console.log('[task-edit] 页面卸载');
    
    // 确保关闭任何可能存在的加载提示
    try {
      wx.hideLoading();
    } catch (error) {
      console.error('[task-edit] 页面卸载时关闭加载提示出错:', error);
    }
  },

  /**
   * 切换必做任务状态
   */
  toggleRequiredTask: function(e) {
    const isRequired = e.detail.value;
    console.log('[TaskEdit] 切换必做任务状态:', isRequired);
    
    this.setData({
      'newTask.isRequired': isRequired
    });
    
    // 给用户一个振动反馈
    wx.vibrateShort({
      type: 'medium'
    });
    
    console.log('[TaskEdit] 当前积分设置:', this.data.newTask.points);
    
    // 如果是首次启用必做任务，显示提示
    if (isRequired && !wx.getStorageSync('requiredTaskTipShown')) {
      wx.showModal({
        title: '必做任务说明',
        content: `必做任务未完成将扣除${this.data.newTask.points}积分。`,
        showCancel: false,
        success: (res) => {
          // 标记已显示提示
          wx.setStorageSync('requiredTaskTipShown', true);
        }
      });
    }
  },

  /**
   * 选择积分有效期
   */
  selectPointsExpiry: function(e) {
    const expiry = e.currentTarget.dataset.expiry;
    
    // 使用常量中的文本映射
    const expiryText = Constants.POINTS_EXPIRY.TEXT[expiry];
    
    console.log(`[TaskEdit] 设置积分有效期: ${expiryText}`);
    
    this.setData({
      'newTask.pointsExpiry': expiry,
      pointsExpiryText: expiryText
    });
  },
})