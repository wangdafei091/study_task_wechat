const app = getApp();
const Constants = require('../../utils/constants.js');

Page({
  /**
   * 页面的初始数据
   */
  data: {
    allTasks: [],
    heatmapYear: null,
    heatmapMonthIndex: null,
    heatmapMonth: '',
    isDemoData: false,
    // 添加新任务表单数据
    newTask: {
      title: '',
      type: 'habit', // 默认类型为习惯
      points: 5, // 默认积分
      description: ''
    },
    // 表单验证错误信息
    errors: {
      title: ''
    },
    // 描述字段限制常量
    descMaxLength: Constants.DESCRIPTION.MAX_LENGTH,
    descPlaceholder: Constants.DESCRIPTION.PLACEHOLDER
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function(options) {
    console.log('[TaskEdit] 页面加载');
    
    // 初始化热力图月份
    this.initHeatmapMonth();
    
    // 加载所有任务
    this.loadAllTasks();
    
    // 如果URL参数中指定了演示模式，自动生成演示数据
    if (options.demo === 'true') {
      console.log('[TaskEdit] 自动加载演示数据');
      // 延迟300ms生成演示数据，确保热力图组件已初始化
      setTimeout(() => {
        this.generateDemoData();
      }, 300);
    }
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function() {
    console.log('[task-edit] 页面显示，刷新任务数据');
    
    // 刷新任务数据
    this.loadAllTasks();
  },

  /**
   * 加载所有任务数据
   */
  loadAllTasks: function() {
    console.log('[TaskEdit] 加载所有任务数据');
    
    try {
      const allTasks = app.globalData.tasks || [];
      
      this.setData({ 
        allTasks: allTasks,
        isDemoData: false 
      });
      
      console.log('任务数据加载成功，共 ' + allTasks.length + ' 个任务');
    } catch (error) {
      console.error('加载任务数据失败:', error);
      
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
    
    this.setData({ 
      heatmapYear: year,
      heatmapMonthIndex: month
    });
    
    const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', 
                      '七月', '八月', '九月', '十月', '十一月', '十二月'];
    
    this.setData({
      heatmapMonth: `${year}年${monthNames[month]}`
    });
    
    console.log('[TaskEdit] 初始化热力图月份:', this.data.heatmapMonth);
  },

  /**
   * 热力图月份变化事件处理
   */
  onHeatmapMonthChange: function(e) {
    console.log('[TaskEdit] 热力图月份变化:', e.detail);
    
    this.setData({
      heatmapYear: e.detail.year,
      heatmapMonthIndex: e.detail.month,
      heatmapMonth: `${e.detail.year}年${e.detail.monthName}`
    });
  },

  /**
   * 切换到上个月
   */
  prevHeatmapMonth: function() {
    // 获取热力图组件实例
    const heatmap = this.selectComponent('#taskHeatmap');
    if (heatmap) {
      heatmap.prevMonth();
    }
  },

  /**
   * 切换到下个月
   */
  nextHeatmapMonth: function() {
    // 获取热力图组件实例
    const heatmap = this.selectComponent('#taskHeatmap');
    if (heatmap) {
      heatmap.nextMonth();
    }
  },

  /**
   * 处理热力图日期选择事件
   */
  onHeatmapDaySelect: function(e) {
    console.log('[TaskEdit] 热力图日期选择:', e.detail);
    
    // 日期选择事件由热力图组件内部处理，这里可以添加额外的业务逻辑
    // 例如记录最近查看的日期，或者与其他组件联动
    
    // 如果需要，可以通过以下方式获取热力图组件实例
    // const heatmap = this.selectComponent('#taskHeatmap');
  },

  /**
   * 生成演示用的假数据
   */
  generateDemoData: function() {
    console.log('[TaskEdit] 生成热力图演示数据');
    
    try {
      // 保存当前的任务数据备份
      const app = getApp();
      const realTasks = app.globalData.tasks || [];
      this._realTasksBackup = [...realTasks];
      
      // 生成一个月的随机任务
      const demoTasks = [];
      const year = this.data.heatmapYear;
      const month = this.data.heatmapMonthIndex;
      
      // 获取指定月份的天数
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      
      // 随机生成30-60个任务
      const taskCount = Math.floor(Math.random() * 30) + 30;
      
      for (let i = 0; i < taskCount; i++) {
        // 随机日期（1到月底）
        const day = Math.floor(Math.random() * daysInMonth) + 1;
        const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        
        // 随机类型
        const types = ['habit', 'study', 'interest'];
        const typeIndex = Math.floor(Math.random() * types.length);
        
        // 随机完成状态（60%的概率完成）
        const completed = Math.random() < 0.6;
        
        demoTasks.push({
          id: `demo_${i}`,
          title: `示例任务 ${i + 1}`,
          type: types[typeIndex],
          date: dateStr,
          status: completed ? 1 : 0,
          points: Math.floor(Math.random() * 20) + 1
        });
      }
      
      // 更新演示数据
      this.setData({ 
        allTasks: demoTasks,
        isDemoData: true 
      });
      
      wx.showToast({
        title: '已加载演示数据',
        icon: 'none',
        duration: 2000
      });
    } catch (error) {
      console.error('生成演示数据失败:', error);
    }
  },

  /**
   * 重置演示数据
   */
  resetDemoData: function() {
    if (this.data.isDemoData) {
      this.loadAllTasks();
      this.setData({ isDemoData: false });
      
      wx.showToast({
        title: '已恢复真实数据',
        icon: 'none',
        duration: 2000
      });
    }
  },

  /**
   * 处理任务标题输入
   */
  onTaskTitleInput: function(e) {
    this.setData({
      'newTask.title': e.detail.value,
      'errors.title': ''
    });
    
    console.log('任务标题输入:', e.detail.value);
  },

  /**
   * 选择任务类型
   */
  selectTaskType: function(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      'newTask.type': type
    });
    
    console.log('选择任务类型:', type);
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
    
    console.log('积分更改:', points);
  },

  /**
   * 处理积分输入
   */
  onPointsInput: function(e) {
    let points = parseInt(e.detail.value) || 0;
    
    // 限制积分范围
    points = Math.max(1, Math.min(50, points));
    
    this.setData({
      'newTask.points': points
    });
    
    console.log('积分输入:', points);
  },

  /**
   * 处理描述输入
   */
  onDescriptionInput: function(e) {
    const value = e.detail.value;
    
    // 记录日志
    console.log('描述输入:', value, `长度: ${value.length}/${this.data.descMaxLength}`);
    
    this.setData({
      'newTask.description': value
    });
  },

  /**
   * 清空任务表单
   */
  clearTaskForm: function() {
    this.setData({
      newTask: {
        title: '',
        type: 'habit',
        points: 5,
        description: ''
      },
      errors: {
        title: ''
      }
    });
    
    console.log('表单已清空');
  },

  /**
   * 添加任务
   */
  addTask: function() {
    // 表单验证
    if (!this.data.newTask.title.trim()) {
      this.setData({
        'errors.title': '请输入任务名称'
      });
      
      wx.showToast({
        title: '请输入任务名称',
        icon: 'none',
        duration: 2000
      });
      
      return;
    }
    
    try {
      // 获取应用实例
      const app = getApp();
      const allTasks = app.globalData.tasks || [];
      
      // 获取当前日期
      const today = new Date();
      const year = today.getFullYear();
      const month = ("0" + (today.getMonth() + 1)).slice(-2);
      const day = ("0" + today.getDate()).slice(-2);
      const dateStr = `${year}-${month}-${day}`;
      
      // 创建新任务对象
      const taskManager = require('../../utils/taskManager.js');
      const newTask = {
        title: this.data.newTask.title,
        type: this.data.newTask.type,
        points: this.data.newTask.points,
        description: this.data.newTask.description,
        date: dateStr,
        time: '08:00', // 默认时间
        status: 0, // 默认未完成
        createTime: Date.now()
      };
      
      console.log('准备添加新任务:', newTask);
      
      // 使用任务管理器创建任务
      taskManager.createTask(newTask, (createdTask) => {
        // 添加成功
        wx.showToast({
          title: '添加成功',
          icon: 'success',
          duration: 2000
        });
        
        // 清空表单
        this.clearTaskForm();
        
        // 重新加载任务数据
        this.loadAllTasks();
        
        console.log('新任务添加成功:', createdTask);
      });
    } catch (error) {
      console.error('添加任务失败:', error);
      
      wx.showToast({
        title: '添加失败，请重试',
        icon: 'none',
        duration: 2000
      });
    }
  }
}) 