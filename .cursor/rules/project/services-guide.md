# 领域服务使用指南

本文档介绍了项目中的领域服务的使用方法，帮助开发人员理解如何在UI层与领域服务交互。

## 服务管理器使用

服务管理器是获取领域服务的统一入口点。所有页面和组件应通过服务管理器获取服务实例，而不是直接创建服务实例。

```javascript
// 获取服务管理器
const serviceManager = getApp().serviceManager;

// 获取任务服务
const taskService = serviceManager.getService('taskService');
// 或
const taskService = serviceManager.getTaskService();

// 获取星星服务
const starService = serviceManager.getService('starService');
// 或
const starService = serviceManager.getStarService();

// 其他服务类似
```

## 任务服务 (TaskService)

任务服务负责处理任务的全生命周期管理，包括创建、查询、更新和删除任务。

### 创建任务

```javascript
const taskService = serviceManager.getService('taskService');

const taskData = {
  title: '完成数学作业',
  description: '完成教材第三章习题',
  type: 'study',
  date: '2023-06-15',
  startTime: '16:00',
  endTime: '17:30',
  points: 10
};

try {
  const result = await taskService.createTask(taskData);
  if (result.success) {
    console.log('创建任务成功:', result.task.id);
    // 更新UI显示
  }
} catch (error) {
  logger.error('TaskPage', '创建任务失败', error);
}
```

### 获取任务

```javascript
// 获取所有任务
const allTasks = await taskService.getAllTasks();

// 获取今日任务
const todayTasks = await taskService.getTodayTasks();

// 获取指定日期任务
const dateTasks = await taskService.getTasksByDate('2023-06-15');

// 获取日期范围内的任务
const rangeTasks = await taskService.getTasksByDateRange('2023-06-01', '2023-06-30');

// 获取单个任务
const task = await taskService.getTaskById(taskId);
```

### 更新任务

```javascript
// 更新任务
const changes = {
  title: '新标题',
  description: '更新后的描述'
};

const result = await taskService.updateTask(taskId, changes);
if (result.success) {
  console.log('任务更新成功');
}

// 完成任务
const completeResult = await taskService.completeTask(taskId);
if (completeResult.success && completeResult.stars > 0) {
  console.log(`任务完成！获得${completeResult.stars}颗星星`);
}
```

### 删除任务

```javascript
const deleteResult = await taskService.deleteTask(taskId);
if (deleteResult.success) {
  console.log('任务已删除');
}
```

## 星星服务 (StarService)

星星服务负责管理星星的获取、消费和有效期等功能。

### 获取星星数据

```javascript
const starService = serviceManager.getService('starService');

// 获取总星星数
const totalStars = await starService.getTotalStars();

// 获取星星分组
const starGroups = await starService.getStarGroups();

// 获取星星记录
const starRecords = await starService.getStarRecords();
```

### 管理星星

```javascript
// 添加星星
await starService.addStars(10, {
  source: 'system',
  reason: '系统奖励',
  expiry: 'month' // 有效期类型：permanent, week, month 等
});

// 消费星星
const consumeResult = await starService.consumeStars(5, '购买奖励');
if (consumeResult.success) {
  console.log('星星消费成功');
} else {
  console.log('星星不足');
}

// 检查星星过期
await starService.checkStarsExpiry();
```

## 奖励服务 (RewardService)

奖励服务负责管理奖励的创建、查询和兑换功能。

### 获取奖励

```javascript
const rewardService = serviceManager.getService('rewardService');

// 获取所有奖励
const allRewards = await rewardService.getAllRewards();

// 获取单个奖励
const reward = await rewardService.getRewardById(rewardId);
```

### 管理奖励

```javascript
// 创建奖励
const rewardData = {
  name: '看一小时动画片',
  description: '完成所有作业后可以看一小时喜欢的动画片',
  points: 20,
  icon: '🎬'
};

const createResult = await rewardService.createReward(rewardData);
if (createResult.success) {
  console.log('创建奖励成功:', createResult.reward.id);
}

// 更新奖励
const updateResult = await rewardService.updateReward(rewardId, {
  name: '看两小时动画片',
  points: 30
});

// 删除奖励
await rewardService.deleteReward(rewardId);
```

### 兑换奖励

```javascript
// 兑换奖励
try {
  const exchangeResult = await rewardService.exchangeReward(rewardId);
  if (exchangeResult.success) {
    console.log('奖励兑换成功!');
  }
} catch (error) {
  if (error.message === 'insufficient_stars') {
    console.log('星星不足，无法兑换奖励');
  } else {
    console.error('兑换奖励失败:', error);
  }
}

// 获取兑换记录
const exchangeRecords = await rewardService.getExchangeRecords();
```

## 消息服务 (MessageService)

消息服务负责管理系统消息、任务提醒和通知功能。

### 获取消息

```javascript
const messageService = serviceManager.getService('messageService');

// 获取所有消息
const allMessages = await messageService.getAllMessages();

// 获取未读消息数量
const unreadCount = await messageService.getUnreadCount();
```

### 管理消息

```javascript
// 创建系统消息
await messageService.createSystemMessage('欢迎使用学习任务小助手！', 'welcome');

// 创建任务相关消息
await messageService.createTaskMessage(task, 'completed');

// 标记消息为已读
await messageService.markMessageAsRead(messageId);

// 删除消息
await messageService.deleteMessage(messageId);

// 清除所有消息
await messageService.clearAllMessages();
```

## 错误处理

所有服务方法都返回Promise，应使用try/catch或.catch()处理潜在错误：

```javascript
// 使用 try/catch
async function handleTask() {
  try {
    const result = await taskService.completeTask(taskId);
    // 成功处理
    return result;
  } catch (error) {
    // 错误处理
    logger.error('TaskPage', '完成任务失败', error);
    wx.showToast({ title: '操作失败', icon: 'none' });
    return { success: false };
  }
}

// 使用 Promise 链
taskService.deleteTask(taskId)
  .then(result => {
    if (result.success) {
      console.log('删除成功');
    }
  })
  .catch(error => {
    logger.error('TaskPage', '删除任务失败', error);
  });
```

## 事件订阅

服务会发出领域事件，可以通过事件总线订阅这些事件：

```javascript
// 获取事件总线
const eventBus = serviceManager.getEventBus();

// 订阅任务完成事件
eventBus.on('taskCompleted', event => {
  console.log('任务已完成:', event.taskId);
  // 更新UI或执行其他操作
});

// 订阅星星变更事件
eventBus.on('starsChanged', event => {
  console.log(`星星变更: ${event.change > 0 ? '增加' : '减少'}${Math.abs(event.change)}颗星星`);
  // 更新星星显示
});

// 单次订阅事件（只触发一次）
eventBus.once('rewardExchanged', event => {
  // 处理奖励兑换事件
});
```

## 批量处理

对于需要处理大量数据的场景，服务提供了批量处理方法：

```javascript
// 批量更新任务
const tasks = await taskService.getAllTasks();
const tasksToUpdate = tasks.filter(task => !task.priority);

const updateResults = await taskService.batchUpdateTasks(
  tasksToUpdate,
  { priority: 'medium' }
);

// 批量处理星星记录
await starService.batchProcessRecords(recordIds, status);
```

## 页面示例

下面是一个完整的页面示例，展示如何在页面中使用服务：

```javascript
// pages/task/task.js
const logger = require('../../utils/logger');

Page({
  data: {
    tasks: [],
    loading: true
  },
  
  onLoad() {
    this.loadTasks();
  },
  
  async loadTasks() {
    try {
      this.setData({ loading: true });
      
      const serviceManager = getApp().serviceManager;
      const taskService = serviceManager.getService('taskService');
      
      const tasks = await taskService.getTodayTasks();
      this.setData({
        tasks: tasks,
        loading: false
      });
      
      logger.info('TaskPage', `加载了${tasks.length}个任务`);
    } catch (error) {
      logger.error('TaskPage', '加载任务失败', error);
      this.setData({ loading: false });
      
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },
  
  async onCompleteTask(e) {
    const taskId = e.currentTarget.dataset.id;
    
    try {
      const serviceManager = getApp().serviceManager;
      const taskService = serviceManager.getService('taskService');
      
      const result = await taskService.completeTask(taskId);
      
      if (result.success) {
        logger.info('TaskPage', `完成任务成功: ${taskId}`);
        
        // 刷新列表
        this.loadTasks();
        
        // 显示获得星星
        if (result.stars > 0) {
          wx.showToast({
            title: `获得${result.stars}颗星星!`,
            icon: 'success'
          });
        }
      } else {
        wx.showToast({
          title: result.message || '操作失败',
          icon: 'none'
        });
      }
    } catch (error) {
      logger.error('TaskPage', '完成任务出错', error);
      
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
    }
  }
});
```

## 最佳实践

1. **始终使用服务管理器获取服务**，不要直接实例化服务
2. **适当记录日志**，特别是在错误处理时
3. **处理所有异步错误**，避免未捕获异常导致应用崩溃
4. **减少不必要的服务调用**，缓存频繁使用的数据
5. **订阅相关领域事件**，响应系统状态变化
6. **使用批量处理方法**处理大量数据，避免UI卡顿
7. **使用领域模型的验证方法**确保数据有效性 