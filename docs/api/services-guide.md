# 领域服务使用指南

本文档介绍了项目中的领域服务的使用方法，帮助开发人员理解如何在UI层与领域服务交互。

## 领域服务架构

领域服务是 DDD 架构中负责协调领域对象和实现业务用例的组件。在本项目中，领域服务位于 `services/` 目录下，主要包括：

- **TaskService**：任务领域服务，处理任务的创建、修改、删除等操作
- **StarService**：星星领域服务，处理星星的获取、消费、有效期等逻辑
- **RewardService**：奖励领域服务，处理奖励的管理和兑换
- **MessageService**：消息领域服务，处理系统消息的创建和管理

## 如何使用领域服务

在项目中，所有领域服务都通过服务管理器 (`serviceManager`) 进行访问，确保单一实例和依赖管理。

### 1. 获取服务实例

```javascript
// 在页面或组件中获取服务实例
const taskService = getApp().serviceManager.getService('taskService');
const starService = getApp().serviceManager.getService('starService');
```

### 2. 调用服务方法

所有服务方法都返回 Promise，可以使用异步/await 或 then/catch 方式处理：

```javascript
// 使用 async/await
async onLoad() {
  try {
    const taskService = getApp().serviceManager.getService('taskService');
    const tasks = await taskService.getTodayTasks();
    this.setData({ tasks });
  } catch (error) {
    console.error('[页面] 加载任务失败:', error);
  }
}

// 使用 Promise 链式调用
onLoad() {
  const taskService = getApp().serviceManager.getService('taskService');
  taskService.getTodayTasks()
    .then(tasks => {
      this.setData({ tasks });
    })
    .catch(error => {
      console.error('[页面] 加载任务失败:', error);
    });
}
```

## TaskService (任务服务)

任务服务处理与任务相关的所有业务逻辑，包括任务的增删改查、状态管理等。

### 主要方法

```javascript
// 获取任务相关方法
async getAllTasks()             // 获取所有任务
async getTaskById(taskId)       // 根据ID获取单个任务
async getTodayTasks()           // 获取今日任务
async getTasksByDate(date)      // 获取指定日期任务
async getTasksByDateRange(startDate, endDate) // 获取日期范围内的任务

// 任务操作方法
async createTask(taskData)      // 创建新任务
async updateTask(taskId, changes) // 更新任务
async updateTaskStatus(taskId, status) // 更新任务状态
async deleteTask(taskId)        // 删除任务
async completeTask(taskId)      // 完成任务
async uncompleteTask(taskId)    // 取消完成任务

// 任务分析方法
async calculateTaskProgress()   // 计算任务进度
async getTaskStatistics(dateRange) // 获取任务统计数据
async checkUpcomingTasks()      // 检查即将到期任务
```

### 使用示例

```javascript
// 创建任务
const newTask = {
  title: '阅读30分钟',
  type: 'study',
  date: '2023-06-15',
  duration: 30,
  points: 5
};

const taskService = getApp().serviceManager.getService('taskService');
try {
  const result = await taskService.createTask(newTask);
  console.log('[页面] 创建任务成功:', result.task.id);
} catch (error) {
  console.error('[页面] 创建任务失败:', error);
}

// 完成任务
try {
  const result = await taskService.completeTask('task_123456');
  if (result.stars > 0) {
    wx.showToast({
      title: `获得${result.stars}颗星星!`,
      icon: 'success'
    });
  }
} catch (error) {
  console.error('[页面] 完成任务失败:', error);
}
```

## StarService (星星服务)

星星服务负责星星的管理、分组、有效期和消费逻辑。

### 主要方法

```javascript
// 星星管理
async getTotalStars()           // 获取总星星数
async addStars(count, options)  // 添加星星
async consumeStars(count, reason) // 消费星星
async checkStarsExpiry()        // 检查星星过期

// 星星分组管理
async getStarGroups()           // 获取所有星星分组
async getStarGroupsByExpiry()   // 按过期时间获取星星分组

// 星星记录管理
async getStarRecords(options)   // 获取星星记录
async addStarRecord(record)     // 添加星星记录
```

### 使用示例

```javascript
const starService = getApp().serviceManager.getService('starService');

// 获取总星星数
try {
  const totalStars = await starService.getTotalStars();
  this.setData({ totalStars });
} catch (error) {
  console.error('[页面] 获取星星数量失败:', error);
}

// 添加星星
try {
  await starService.addStars(10, {
    source: 'task_completion',
    taskId: 'task_123456',
    expiry: 'month'
  });
  console.log('[页面] 添加星星成功');
} catch (error) {
  console.error('[页面] 添加星星失败:', error);
}

// 消费星星
try {
  await starService.consumeStars(5, '兑换奖励');
  console.log('[页面] 星星消费成功');
} catch (error) {
  console.error('[页面] 星星消费失败:', error);
}
```

## RewardService (奖励服务)

奖励服务处理奖励的管理和兑换功能。

### 主要方法

```javascript
// 奖励管理
async getAllRewards()           // 获取所有奖励
async getRewardById(rewardId)   // 根据ID获取奖励
async createReward(rewardData)  // 创建奖励
async updateReward(rewardId, changes) // 更新奖励
async deleteReward(rewardId)    // 删除奖励

// 奖励兑换
async exchangeReward(rewardId)  // 兑换奖励
async getExchangeRecords()      // 获取兑换记录
```

### 使用示例

```javascript
const rewardService = getApp().serviceManager.getService('rewardService');

// 获取所有奖励
try {
  const rewards = await rewardService.getAllRewards();
  this.setData({ rewards });
} catch (error) {
  console.error('[页面] 获取奖励列表失败:', error);
}

// 创建奖励
const newReward = {
  name: '看一小时动画片',
  description: '可以自选喜欢的动画片观看一小时',
  cost: 20, // 星星数量
  iconPath: '/assets/icons/movie.png'
};

try {
  const result = await rewardService.createReward(newReward);
  console.log('[页面] 创建奖励成功:', result.reward.id);
} catch (error) {
  console.error('[页面] 创建奖励失败:', error);
}

// 兑换奖励
try {
  await rewardService.exchangeReward('reward_123456');
  wx.showToast({
    title: '兑换成功！',
    icon: 'success'
  });
} catch (error) {
  console.error('[页面] 兑换奖励失败:', error);
  wx.showToast({
    title: '星星不足',
    icon: 'error'
  });
}
```

## MessageService (消息服务)

消息服务负责系统消息的创建和管理。

### 主要方法

```javascript
// 消息管理
async getAllMessages()          // 获取所有消息
async getUnreadCount()          // 获取未读消息数量
async markMessageAsRead(messageId) // 标记消息为已读
async deleteMessage(messageId)  // 删除消息
async clearAllMessages()        // 清除所有消息

// 消息创建
async createTaskMessage(task, action) // 创建任务相关消息
async createSystemMessage(content, type) // 创建系统消息
async createRewardMessage(reward, action) // 创建奖励相关消息
```

### 使用示例

```javascript
const messageService = getApp().serviceManager.getService('messageService');

// 获取所有消息
try {
  const messages = await messageService.getAllMessages();
  this.setData({ messages });
} catch (error) {
  console.error('[页面] 获取消息列表失败:', error);
}

// 获取未读消息数量
try {
  const unreadCount = await messageService.getUnreadCount();
  if (unreadCount > 0) {
    wx.showTabBarRedDot({
      index: 2 // 消息中心的tab索引
    });
  }
} catch (error) {
  console.error('[页面] 获取未读消息数失败:', error);
}

// 创建系统消息
try {
  await messageService.createSystemMessage(
    '欢迎使用学习任务小助手！', 
    'welcome'
  );
} catch (error) {
  console.error('[页面] 创建系统消息失败:', error);
}
```

## 最佳实践

### 1. 始终使用服务管理器获取服务

```javascript
// 推荐
const taskService = getApp().serviceManager.getService('taskService');

// 不推荐 - 直接实例化
const TaskService = require('../../services/task-service');
const taskService = new TaskService();
```

### 2. 处理所有异步错误

```javascript
// 推荐
try {
  await taskService.deleteTask(taskId);
  this.refreshTaskList();
} catch (error) {
  console.error('[页面] 删除任务失败:', error);
  wx.showToast({ title: '操作失败', icon: 'none' });
}

// 不推荐 - 未处理错误
taskService.deleteTask(taskId)
  .then(() => {
    this.refreshTaskList();
  }); // 没有 catch 处理
```

### 3. 遵循领域界限

```javascript
// 推荐 - 使用对应的领域服务
const messageService = getApp().serviceManager.getService('messageService');
await messageService.createTaskMessage(task, 'created');

// 不推荐 - 混合不同领域的责任
const taskService = getApp().serviceManager.getService('taskService');
await taskService.createTaskAndNotify(taskData); // 任务服务不应包含通知功能
```

### 4. 在服务层处理业务逻辑

```javascript
// 推荐 - 业务逻辑在服务中处理
const result = await taskService.completeTask(taskId);
if (result.success) {
  wx.showToast({ title: '完成任务！' });
}

// 不推荐 - 页面处理业务逻辑
const task = await taskService.getTaskById(taskId);
if (task.status === 0) {
  task.status = 1;
  task.completionTime = Date.now();
  await taskService.updateTask(taskId, task);
  if (task.points > 0 && !task.starAwarded) {
    // 添加星星逻辑...
  }
}
```

### 5. 使用日志记录服务操作

```javascript
// 服务调用前后添加日志
logger.info('TaskPage', '开始加载任务列表');
try {
  const tasks = await taskService.getAllTasks();
  logger.info('TaskPage', '任务列表加载完成', { count: tasks.length });
  this.setData({ tasks });
} catch (error) {
  logger.error('TaskPage', '加载任务列表失败', error);
}
``` 