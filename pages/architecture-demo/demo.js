const { TaskType } = require('../../models/task');
const { StarExpiryType } = require('../../models/star');
const { RewardService, StarService } = require('../../services');
const EventBus = require('../../utils/core/event-bus');
const logger = require('../../utils/logger');

// 独立命名空间
const DEMO_NAMESPACE = 'architecture_demo_';

Page({
  data: {
    // 任务相关
    newTaskName: '',
    taskTypeIndex: 0,
    taskTypes: ['日常任务', '学习任务', '特殊任务'],
    tasks: [],
    
    // 星星相关
    totalStars: 0,
    starGroups: [],
    
    // 奖励相关
    rewards: [],
    
    // 日志
    logs: []
  },
  
  onLoad: function() {
    logger.info('DemoPage', '架构示例页面加载');
    
    // 创建实例
    this.eventBus = new EventBus();
    this.starService = new StarService({ 
      eventBus: this.eventBus,
      namespace: DEMO_NAMESPACE 
    });
    this.rewardService = new RewardService({ 
      eventBus: this.eventBus,
      namespace: DEMO_NAMESPACE
    });
    
    // 注册事件
    this._registerEvents();
    
    // 初始化数据
    this._initializeData();
  },
  
  _registerEvents: function() {
    // 星星添加事件
    this.eventBus.on('stars:added', (event) => {
      this._addLog(`添加了${event.points}颗星星，过期类型：${this._getExpiryTypeText(event.expiryType)}`);
      this._refreshStarData();
    });
    
    // 星星消费事件
    this.eventBus.on('stars:consumed', (event) => {
      this._addLog(`消费了${event.points}颗星星，原因：${event.reason}`);
      this._refreshStarData();
    });
    
    // 奖励兑换事件
    this.eventBus.on('reward:exchanged', (event) => {
      this._addLog(`兑换了奖励"${event.reward.name}"，消费${event.pointsConsumed}颗星星`);
      this._refreshRewardData();
    });
  },
  
  _initializeData: async function() {
    try {
      logger.info('DemoPage', '初始化示例应用');
      
      await Promise.all([
        this.starService.initialize(),
        this.rewardService.initialize()
      ]);
      
      this._addLog('示例应用初始化完成');
      
      // 初始化示例数据
      await this._initSampleData();
      
      // 刷新页面数据
      await this._refreshAllData();
    } catch (error) {
      this._addLog(`初始化失败: ${error.message}`);
      logger.error('DemoPage', '初始化示例应用失败', error);
    }
  },
  
  // 创建初始示例数据
  _initSampleData: async function() {
    const hasData = await this._checkHasData();
    if (!hasData) {
      // 创建示例奖励
      await this.rewardService.createReward({
        name: '休息半小时',
        points: 10,
        description: '可以休息30分钟'
      });
      
      await this.rewardService.createReward({
        name: '看一集动画片',
        points: 20,
        description: '可以观看一集喜欢的动画片'
      });
      
      await this.rewardService.createReward({
        name: '购买一本新书',
        points: 50,
        description: '可以买一本想看的书'
      });
      
      this._addLog('创建了示例奖励数据');
    }
  },
  
  // 检查是否有数据
  _checkHasData: async function() {
    const rewards = await this.rewardService.getAllRewards();
    return rewards && rewards.length > 0;
  },
  
  // 刷新所有数据
  _refreshAllData: async function() {
    await Promise.all([
      this._refreshTaskData(),
      this._refreshStarData(),
      this._refreshRewardData()
    ]);
  },
  
  // 刷新任务数据
  _refreshTaskData: async function() {
    // 这里应该有任务数据刷新逻辑，本示例省略任务仓储实现
    // 模拟一些任务数据
    const sampleTasks = [
      {id: 'task1', name: '完成早起任务', type: TaskType.DAILY, starPoints: 3, completed: false},
      {id: 'task2', name: '学习一小时', type: TaskType.STUDY, starPoints: 5, completed: false},
      {id: 'task3', name: '整理房间', type: TaskType.SPECIAL, starPoints: 10, completed: false}
    ];
    
    sampleTasks.forEach(task => {
      task.typeText = this._getTaskTypeText(task.type);
    });
    
    this.setData({
      tasks: sampleTasks
    });
  },
  
  // 刷新星星数据
  _refreshStarData: async function() {
    logger.info('DemoPage', '刷新星星数据');
    
    const totalStars = await this.starService.getTotalStars();
    const starGroups = await this.starService.getStarGroups();
    
    // 处理显示文本
    starGroups.forEach(group => {
      group.expiryTypeText = this._getExpiryTypeText(group.expiryType);
    });
    
    this.setData({
      totalStars,
      starGroups
    });
  },
  
  // 刷新奖励数据
  _refreshRewardData: async function() {
    logger.info('DemoPage', '刷新奖励数据');
    
    const rewards = await this.rewardService.getAllRewards();
    this.setData({
      rewards
    });
  },
  
  // === 用户操作处理函数 ===
  
  // 创建任务
  createTask: function() {
    if (!this.data.newTaskName.trim()) {
      this._addLog('任务名称不能为空');
      return;
    }
    
    const taskTypes = [TaskType.DAILY, TaskType.STUDY, TaskType.SPECIAL];
    const taskType = taskTypes[this.data.taskTypeIndex];
    const starPoints = this.data.taskTypeIndex === 0 ? 3 : (this.data.taskTypeIndex === 1 ? 5 : 10);
    
    // 创建新任务（模拟实现，实际应使用TaskRepository）
    const newTask = {
      id: `task_${Date.now()}`,
      name: this.data.newTaskName,
      type: taskType,
      starPoints: starPoints,
      completed: false,
      typeText: this._getTaskTypeText(taskType)
    };
    
    const tasks = [...this.data.tasks, newTask];
    
    this.setData({
      tasks,
      newTaskName: ''
    });
    
    this._addLog(`创建了任务"${newTask.name}"，完成可得${starPoints}颗星星`);
  },
  
  // 完成任务
  completeTask: async function(e) {
    const taskId = e.currentTarget.dataset.id;
    const tasks = [...this.data.tasks];
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    
    if (taskIndex < 0) return;
    
    const task = tasks[taskIndex];
    task.completed = true;
    
    this.setData({ tasks });
    
    // 任务完成后添加星星
    const expiryType = task.type === TaskType.DAILY ? StarExpiryType.WEEK : 
                      (task.type === TaskType.STUDY ? StarExpiryType.MONTH : StarExpiryType.PERMANENT);
                      
    await this.starService.addStars(
      task.starPoints,
      expiryType,
      `完成任务：${task.name}`
    );
    
    this._addLog(`完成了任务"${task.name}"`);
  },
  
  // 兑换奖励
  exchangeReward: async function(e) {
    const rewardId = e.currentTarget.dataset.id;
    
    try {
      const result = await this.rewardService.exchangeReward(rewardId);
      if (!result.success) {
        this._addLog(`兑换失败：${result.message}`);
      }
    } catch (error) {
      this._addLog(`兑换过程发生错误：${error.message}`);
      console.error('Exchange error:', error);
    }
  },
  
  // 重置数据
  resetData: async function() {
    try {
      // 清空所有存储
      const wx = getApp().globalData.systemInfo.platform === 'devtools' ? wx : require('../../utils/wx-api');
      
      const storageInfo = await wx.getStorageInfoSync();
      const keys = storageInfo.keys.filter(key => key.startsWith(DEMO_NAMESPACE));
      
      for (const key of keys) {
        await wx.removeStorageSync(key);
      }
      
      this._addLog('已重置所有演示数据');
      
      // 重新初始化
      await this._initializeData();
    } catch (error) {
      this._addLog(`重置数据失败：${error.message}`);
      console.error('Reset error:', error);
    }
  },
  
  // 任务类型改变
  onTaskTypeChange: function(e) {
    this.setData({
      taskTypeIndex: parseInt(e.detail.value)
    });
  },
  
  // === 辅助工具方法 ===
  
  // 添加日志
  _addLog: function(message) {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    
    const logs = [{
      time: timeStr,
      message
    }, ...this.data.logs];
    
    // 最多保留20条日志
    if (logs.length > 20) {
      logs.pop();
    }
    
    this.setData({ logs });
    
    // 同时输出到控制台
    logger.info('DemoPage', message);
  },
  
  // 获取任务类型文本
  _getTaskTypeText: function(type) {
    switch (type) {
      case TaskType.DAILY: return '日常任务';
      case TaskType.STUDY: return '学习任务';
      case TaskType.SPECIAL: return '特殊任务';
      default: return '未知类型';
    }
  },
  
  // 获取过期类型文本
  _getExpiryTypeText: function(type) {
    switch (type) {
      case StarExpiryType.PERMANENT: return '永久有效';
      case StarExpiryType.WEEK: return '一周有效';
      case StarExpiryType.MONTH: return '一月有效';
      default: return '未知类型';
    }
  }
}); 