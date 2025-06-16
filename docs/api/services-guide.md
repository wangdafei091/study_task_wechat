# 服务指南

本文档详细介绍了学习任务微信小程序中基于DDD架构的服务层API，包括所有核心服务的功能、方法和使用示例。

## 服务架构概览

### 服务层职责
- **业务用例实现**：协调领域模型完成复杂业务流程
- **跨实体操作**：处理涉及多个领域实体的操作
- **事件发布**：在业务操作完成后发布领域事件
- **数据一致性**：确保跨仓储操作的数据一致性

### 服务访问方式
所有服务通过ServiceManager获取实例，确保依赖注入和生命周期管理：

```javascript
// 获取服务管理器
const serviceManager = getApp().serviceManager;

// 获取具体服务
const taskService = serviceManager.get('taskService');
const starService = serviceManager.get('starService');
const rewardService = serviceManager.get('rewardService');
```

## TaskService - 任务管理服务

任务服务是系统的核心服务，负责任务的完整生命周期管理。

### 核心功能
- 任务CRUD操作
- 任务状态管理和流转
- 必做任务惩罚机制
- 重复任务处理
- 与星星系统的集成
- 事件发布机制

### API 方法

#### 基础操作

##### getAllTasks()
获取所有任务列表

```javascript
const result = await taskService.getAllTasks();
// 返回: { success: boolean, tasks: Task[], message?: string }
```

##### getTaskById(taskId)
根据ID获取特定任务

```javascript
const result = await taskService.getTaskById('task_123');
// 返回: { success: boolean, task?: Task, message?: string }
```

##### createTask(taskData)
创建新任务

```javascript
const taskData = {
  title: '练习钢琴',
  description: '练习新曲目30分钟',
  type: 'study',
  date: '2024-12-01',
  startTime: '18:00',
  endTime: '18:30',
  points: 10,
  pointsExpiry: 'week',
  isRequired: false
};

const result = await taskService.createTask(taskData);
// 返回: { success: boolean, task?: Task, message?: string }
```

##### updateTask(taskId, updateData)
更新任务信息

```javascript
const updateData = {
  title: '练习钢琴 - 更新',
  points: 15,
  description: '加强练习时间'
};

const result = await taskService.updateTask('task_123', updateData);
// 返回: { success: boolean, task?: Task, message?: string }
```

##### deleteTask(taskId)
删除任务

```javascript
const result = await taskService.deleteTask('task_123');
// 返回: { success: boolean, message?: string }
```

#### 状态管理

##### completeTask(taskId, userId)
完成任务（核心业务流程）

```javascript
const result = await taskService.completeTask('task_123', 'child');
// 返回: { success: boolean, task?: Task, starReward?: number, message?: string }
```

**内部流程**：
1. 验证任务状态
2. 更新任务为已完成
3. 计算并分配星星奖励
4. 发布任务完成事件
5. 创建完成消息

##### resetTask(taskId, userId)
重置任务状态

```javascript
const result = await taskService.resetTask('task_123', 'child');
// 返回: { success: boolean, task?: Task, starDeduction?: number, message?: string }
```

##### updateTaskStatus(taskId, status, userId)
更新任务状态

```javascript
const result = await taskService.updateTaskStatus('task_123', 1, 'child');
// status: 0=未完成, 1=已完成
// 返回: { success: boolean, task?: Task, message?: string }
```

#### 必做任务功能

##### markTaskAsRequired(taskId, userId)
标记任务为必做

```javascript
const result = await taskService.markTaskAsRequired('task_123', 'child');
// 返回: { success: boolean, task?: Task, message?: string }
```

##### unmarkTaskAsRequired(taskId, userId)
取消必做任务标记

```javascript
const result = await taskService.unmarkTaskAsRequired('task_123', 'child');
// 返回: { success: boolean, task?: Task, message?: string }
```

##### handleRequiredTaskPenalty(task)
处理必做任务惩罚

```javascript
const result = await taskService.handleRequiredTaskPenalty(task);
// 返回: { success: boolean, penaltyAmount?: number, message?: string }
```

##### checkRequiredTasks()
检查所有必做任务状态

```javascript
const result = await taskService.checkRequiredTasks();
// 返回: { success: boolean, penalizedTasks: Task[], totalPenalty: number }
```

#### 查询功能

##### getTasksByDate(date)
获取指定日期的任务

```javascript
const result = await taskService.getTasksByDate('2024-12-01');
// 返回: { success: boolean, tasks: Task[], message?: string }
```

##### getTasksByDateRange(startDate, endDate)
获取日期范围内的任务

```javascript
const result = await taskService.getTasksByDateRange('2024-12-01', '2024-12-07');
// 返回: { success: boolean, tasks: Task[], message?: string }
```

##### getOverdueTasks()
获取过期任务

```javascript
const result = await taskService.getOverdueTasks();
// 返回: { success: boolean, tasks: Task[], message?: string }
```

### 使用示例

```javascript
const taskService = getApp().serviceManager.get('taskService');

// 完整的任务创建和完成流程
async function handleTaskWorkflow() {
  try {
    // 1. 创建任务
    const createResult = await taskService.createTask({
      title: '数学作业',
      type: 'study',
      date: '2024-12-01',
      points: 15,
      pointsExpiry: 'month',
      isRequired: true
    });
    
    if (!createResult.success) {
      throw new Error(createResult.message);
    }
    
    const taskId = createResult.task.id;
    logger.info('TaskWorkflow', '任务创建成功', { taskId });
    
    // 2. 完成任务
    const completeResult = await taskService.completeTask(taskId, 'child');
    
    if (completeResult.success) {
      logger.info('TaskWorkflow', '任务完成成功', {
        taskId,
        starReward: completeResult.starReward
      });
      
      // 显示成功提示
      wx.showToast({
        title: `完成任务，获得${completeResult.starReward}颗星！`,
        icon: 'success'
      });
    }
    
  } catch (error) {
    logger.error('TaskWorkflow', '任务流程执行失败', error);
    wx.showToast({
      title: '操作失败，请重试',
      icon: 'error'
    });
  }
}
```

## StarService - 星星积分服务

星星服务管理完整的积分系统，包括获得、消费、过期等生命周期。

### 核心功能
- 星星分组管理（按有效期分组）
- FIFO消费策略（先过期先消费）
- 自动过期处理
- 数据一致性维护
- 星星记录管理
- 统计分析功能

### API 方法

#### 余额管理

##### getStarBalance(userId)
获取用户星星余额

```javascript
const balance = await starService.getStarBalance('child');
// 返回: number - 星星总数
```

##### getStarGroups(userId)
获取用户星星分组详情

```javascript
const groups = await starService.getStarGroups('child');
// 返回: StarGroup[] - 按有效期分组的星星
```

##### getStarRecords(userId, options)
获取星星变动记录

```javascript
const options = {
  type: 'earn', // 'earn' | 'consume' | 'expire' | 'all'
  startDate: '2024-12-01',
  endDate: '2024-12-31',
  limit: 50
};

const records = await starService.getStarRecords('child', options);
// 返回: StarRecord[] - 星星记录列表
```

#### 星星操作

##### addStars(userId, amount, expiryType, sourceId, description)
添加星星

```javascript
const result = await starService.addStars(
  'child',
  10,
  'week',
  'task_123',
  '完成任务：练习钢琴'
);
// 返回: { success: boolean, message?: string }
```

**有效期类型**：
- `'permanent'` - 永久有效
- `'week'` - 一周有效
- `'month'` - 一个月有效
- `'quarter'` - 三个月有效
- `'half_year'` - 六个月有效
- `'year'` - 一年有效

##### consumeStars(userId, amount, sourceId, description)
消费星星（FIFO策略）

```javascript
const result = await starService.consumeStars(
  'child',
  25,
  'reward_456',
  '兑换奖励：看动画片'
);
// 返回: { success: boolean, consumed: number, remaining: number, message?: string }
```

##### processExpiredStars()
处理过期星星（定时任务调用）

```javascript
const result = await starService.processExpiredStars();
// 返回: { success: boolean, expiredAmount: number, affectedUsers: string[] }
```

#### 数据维护

##### checkDataConsistency(userId)
检查数据一致性

```javascript
const result = await starService.checkDataConsistency('child');
// 返回: { 
//   isConsistent: boolean, 
//   totalFromGroups: number, 
//   storedTotal: number,
//   difference: number 
// }
```

##### repairDataConsistency(userId)
修复数据不一致

```javascript
const result = await starService.repairDataConsistency('child');
// 返回: { success: boolean, repairedAmount: number, message?: string }
```

#### 统计分析

##### getStarStatistics(userId, dateRange)
获取星星统计数据

```javascript
const stats = await starService.getStarStatistics('child', {
  startDate: '2024-12-01',
  endDate: '2024-12-31'
});
// 返回: {
//   totalEarned: number,
//   totalConsumed: number,
//   totalExpired: number,
//   currentBalance: number,
//   dailyStats: Array<{date: string, earned: number, consumed: number}>
// }
```

##### getExpiryForecast(userId, days)
获取星星过期预测

```javascript
const forecast = await starService.getExpiryForecast('child', 30);
// 返回: Array<{date: string, expiringAmount: number}>
```

### 使用示例

```javascript
const starService = getApp().serviceManager.get('starService');

// 完整的星星管理流程
async function manageStarSystem() {
  try {
    // 1. 检查当前余额
    const balance = await starService.getStarBalance('child');
    logger.info('StarManagement', '当前星星余额', { balance });
    
    // 2. 添加星星奖励
    const addResult = await starService.addStars(
      'child',
      15,
      'month',
      'task_456',
      '完成每日阅读任务'
    );
    
    if (addResult.success) {
      logger.info('StarManagement', '星星添加成功', { amount: 15 });
    }
    
    // 3. 检查即将过期的星星
    const forecast = await starService.getExpiryForecast('child', 7);
    const soonExpiring = forecast.filter(f => f.expiringAmount > 0);
    
    if (soonExpiring.length > 0) {
      logger.warn('StarManagement', '有星星即将过期', { forecast: soonExpiring });
      
      // 提醒用户使用即将过期的星星
      wx.showModal({
        title: '星星即将过期',
        content: `您有${soonExpiring[0].expiringAmount}颗星星将在${soonExpiring[0].date}过期，请及时使用`,
        showCancel: false
      });
    }
    
    // 4. 定期数据一致性检查
    const consistencyResult = await starService.checkDataConsistency('child');
    if (!consistencyResult.isConsistent) {
      logger.warn('StarManagement', '发现数据不一致，尝试修复', consistencyResult);
      await starService.repairDataConsistency('child');
    }
    
  } catch (error) {
    logger.error('StarManagement', '星星管理流程执行失败', error);
  }
}
```

## RewardService - 奖励管理服务

奖励服务管理奖励系统，包括奖励创建、兑换、状态管理等功能。

### 核心功能
- 奖励CRUD操作
- 兑换流程管理
- 状态流转控制
- 库存管理
- 示例奖励处理
- 与星星系统集成

### API 方法

#### 基础操作

##### getAllRewards()
获取所有奖励

```javascript
const result = await rewardService.getAllRewards();
// 返回: { success: boolean, rewards: Reward[], message?: string }
```

##### getRewardById(rewardId)
根据ID获取奖励

```javascript
const result = await rewardService.getRewardById('reward_123');
// 返回: { success: boolean, reward?: Reward, message?: string }
```

##### createReward(rewardData)
创建新奖励

```javascript
const rewardData = {
  title: '看动画片30分钟',
  description: '可以选择喜欢的动画片观看',
  cost: 25,
  category: 'entertainment',
  totalCount: 10,
  remainingCount: 10,
  icon: 'tv'
};

const result = await rewardService.createReward(rewardData);
// 返回: { success: boolean, reward?: Reward, message?: string }
```

##### updateReward(rewardId, changes)
更新奖励信息

```javascript
const changes = {
  cost: 30,
  description: '更新描述',
  totalCount: 15
};

const result = await rewardService.updateReward('reward_123', changes);
// 返回: { success: boolean, reward?: Reward, message?: string }
```

##### deleteReward(rewardId)
删除奖励

```javascript
const result = await rewardService.deleteReward('reward_123');
// 返回: { success: boolean, message?: string }
```

#### 兑换管理

##### claimReward(rewardId, userId)
兑换奖励（核心业务流程）

```javascript
const result = await rewardService.claimReward('reward_123', 'child');
// 返回: { 
//   success: boolean, 
//   reward?: Reward, 
//   starCost?: number,
//   message?: string 
// }
```

**内部流程**：
1. 验证用户星星余额
2. 检查奖励可用性
3. 消费所需星星
4. 更新奖励状态
5. 发布兑换事件
6. 创建兑换消息

##### deliverReward(rewardId)
标记奖励为已领取

```javascript
const result = await rewardService.deliverReward('reward_123');
// 返回: { success: boolean, reward?: Reward, message?: string }
```

##### unclaimReward(rewardId)
取消兑换（退还星星）

```javascript
const result = await rewardService.unclaimReward('reward_123');
// 返回: { success: boolean, reward?: Reward, refundAmount?: number, message?: string }
```

#### 状态管理

##### enableReward(rewardId)
启用奖励

```javascript
const result = await rewardService.enableReward('reward_123');
// 返回: { success: boolean, reward?: Reward, message?: string }
```

##### disableReward(rewardId)
禁用奖励

```javascript
const result = await rewardService.disableReward('reward_123');
// 返回: { success: boolean, reward?: Reward, message?: string }
```

#### 查询功能

##### getAvailableRewards()
获取可用奖励列表

```javascript
const result = await rewardService.getAvailableRewards();
// 返回: { success: boolean, rewards: Reward[], message?: string }
```

##### getClaimedRewards()
获取已兑换奖励列表

```javascript
const result = await rewardService.getClaimedRewards();
// 返回: { success: boolean, rewards: Reward[], message?: string }
```

##### getRewardHistory(userId)
获取用户兑换历史

```javascript
const result = await rewardService.getRewardHistory('child');
// 返回: { success: boolean, history: RewardRecord[], message?: string }
```

#### 示例奖励管理

##### initializeSampleRewards()
初始化示例奖励

```javascript
const result = await rewardService.initializeSampleRewards();
// 返回: { success: boolean, createdCount: number, message?: string }
```

##### clearSampleRewards()
清理示例奖励

```javascript
const result = await rewardService.clearSampleRewards();
// 返回: { success: boolean, deletedCount: number, message?: string }
```

### 使用示例

```javascript
const rewardService = getApp().serviceManager.get('rewardService');
const starService = getApp().serviceManager.get('starService');

// 完整的奖励兑换流程
async function handleRewardExchange() {
  try {
    // 1. 获取可用奖励
    const availableResult = await rewardService.getAvailableRewards();
    if (!availableResult.success) {
      throw new Error('获取奖励列表失败');
    }
    
    const rewards = availableResult.rewards;
    logger.info('RewardExchange', '可用奖励', { count: rewards.length });
    
    // 2. 检查用户星星余额
    const balance = await starService.getStarBalance('child');
    logger.info('RewardExchange', '用户星星余额', { balance });
    
    // 3. 筛选用户可兑换的奖励
    const affordableRewards = rewards.filter(reward => reward.cost <= balance);
    
    // 4. 执行兑换
    const selectedRewardId = 'reward_123';
    const claimResult = await rewardService.claimReward(selectedRewardId, 'child');
    
    if (claimResult.success) {
      logger.info('RewardExchange', '奖励兑换成功', {
        rewardId: selectedRewardId,
        starCost: claimResult.starCost
      });
      
      // 显示成功提示
      wx.showModal({
        title: '兑换成功！',
        content: `您已成功兑换"${claimResult.reward.title}"，消耗${claimResult.starCost}颗星星`,
        showCancel: false,
        success: (res) => {
          if (res.confirm) {
            // 跳转到已兑换奖励页面
            wx.navigateTo({
              url: '/pages/reward-claimed/reward-claimed'
            });
          }
        }
      });
    } else {
      throw new Error(claimResult.message);
    }
    
  } catch (error) {
    logger.error('RewardExchange', '奖励兑换失败', error);
    wx.showToast({
      title: error.message || '兑换失败',
      icon: 'error'
    });
  }
}
```

## MessageService - 消息通知服务

消息服务处理系统内的消息通知功能，支持多种消息类型和状态管理。

### 核心功能
- 消息创建和管理
- 多种消息类型支持
- 已读状态管理
- 优先级处理
- 消息归档功能
- 便捷消息创建方法

### API 方法

#### 基础操作

##### getAllMessages(userId)
获取用户所有消息

```javascript
const result = await messageService.getAllMessages('child');
// 返回: { success: boolean, messages: Message[], message?: string }
```

##### getMessageById(messageId)
根据ID获取消息

```javascript
const result = await messageService.getMessageById('msg_123');
// 返回: { success: boolean, message?: Message, error?: string }
```

##### createMessage(messageData)
创建新消息

```javascript
const messageData = {
  userId: 'child',
  type: 'system',
  subType: 'reminder',
  title: '任务提醒',
  content: '您有未完成的必做任务，请及时处理',
  priority: 'high',
  data: { taskId: 'task_123' }
};

const result = await messageService.createMessage(messageData);
// 返回: { success: boolean, message?: Message, error?: string }
```

##### deleteMessage(messageId)
删除消息

```javascript
const result = await messageService.deleteMessage('msg_123');
// 返回: { success: boolean, message?: string }
```

#### 状态管理

##### markAsRead(messageId)
标记消息为已读

```javascript
const result = await messageService.markAsRead('msg_123');
// 返回: { success: boolean, message?: Message, error?: string }
```

##### markAsUnread(messageId)
标记消息为未读

```javascript
const result = await messageService.markAsUnread('msg_123');
// 返回: { success: boolean, message?: Message, error?: string }
```

##### archiveMessage(messageId)
归档消息

```javascript
const result = await messageService.archiveMessage('msg_123');
// 返回: { success: boolean, message?: Message, error?: string }
```

#### 查询功能

##### getUnreadMessages(userId)
获取未读消息

```javascript
const result = await messageService.getUnreadMessages('child');
// 返回: { success: boolean, messages: Message[], message?: string }
```

##### getUnreadCount(userId)
获取未读消息数量

```javascript
const count = await messageService.getUnreadCount('child');
// 返回: number - 未读消息数量
```

##### getMessagesByType(userId, type)
按类型获取消息

```javascript
const result = await messageService.getMessagesByType('child', 'task');
// 消息类型: 'task' | 'reward' | 'system' | 'star'
// 返回: { success: boolean, messages: Message[], message?: string }
```

#### 便捷方法

##### createTaskCompletionMessage(task, userId)
创建任务完成消息

```javascript
const result = await messageService.createTaskCompletionMessage(task, 'child');
// 返回: { success: boolean, message?: Message, error?: string }
```

##### createStarRewardMessage(amount, userId)
创建星星奖励消息

```javascript
const result = await messageService.createStarRewardMessage(15, 'child');
// 返回: { success: boolean, message?: Message, error?: string }
```

##### createPenaltyMessage(task, amount, userId)
创建惩罚消息

```javascript
const result = await messageService.createPenaltyMessage(task, 5, 'child');
// 返回: { success: boolean, message?: Message, error?: string }
```

##### createRewardExchangeMessage(reward, userId)
创建奖励兑换消息

```javascript
const result = await messageService.createRewardExchangeMessage(reward, 'child');
// 返回: { success: boolean, message?: Message, error?: string }
```

### 使用示例

```javascript
const messageService = getApp().serviceManager.get('messageService');

// 完整的消息管理流程
async function manageMessages() {
  try {
    // 1. 获取未读消息数量
    const unreadCount = await messageService.getUnreadCount('child');
    
    if (unreadCount > 0) {
      // 显示红点提示
      wx.showTabBarRedDot({ index: 2 });
      
      // 2. 获取未读消息详情
      const unreadResult = await messageService.getUnreadMessages('child');
      if (unreadResult.success) {
        const unreadMessages = unreadResult.messages;
        logger.info('MessageManagement', '未读消息', { count: unreadMessages.length });
        
        // 3. 处理高优先级消息
        const highPriorityMessages = unreadMessages.filter(msg => msg.priority === 'high');
        if (highPriorityMessages.length > 0) {
          const firstHighPriority = highPriorityMessages[0];
          
          // 显示重要消息弹窗
          wx.showModal({
            title: firstHighPriority.title,
            content: firstHighPriority.content,
            showCancel: false,
            success: async () => {
              // 自动标记为已读
              await messageService.markAsRead(firstHighPriority.id);
            }
          });
        }
      }
    } else {
      // 隐藏红点提示
      wx.hideTabBarRedDot({ index: 2 });
    }
    
    // 4. 定期清理旧消息（保留最近30天）
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const allMessagesResult = await messageService.getAllMessages('child');
    
    if (allMessagesResult.success) {
      const oldMessages = allMessagesResult.messages.filter(
        msg => msg.timestamp < thirtyDaysAgo && msg.isRead
      );
      
      // 批量删除旧消息
      for (const oldMessage of oldMessages) {
        await messageService.deleteMessage(oldMessage.id);
      }
      
      if (oldMessages.length > 0) {
        logger.info('MessageManagement', '清理旧消息', { count: oldMessages.length });
      }
    }
    
  } catch (error) {
    logger.error('MessageManagement', '消息管理失败', error);
  }
}
```

## ValidationService - 表单验证服务

ValidationService 提供统一的表单验证逻辑，避免页面层重复的验证代码，遵循DDD架构原则。

### 核心功能
- 任务表单验证
- 奖励表单验证
- 通用字段验证（文本、数字、日期）
- 数据组装和标准化
- 降级处理支持

### API 方法

#### 任务表单验证

##### validateTaskForm(taskData)
验证任务表单数据并组装标准化数据

```javascript
const taskData = {
  title: '学习任务',
  startDate: '2024-01-01',
  isAllDay: false,
  startTime: '09:00',
  endTime: '17:00',
  type: 'study',
  points: 5,
  isRequired: true
};

const result = validationService.validateTaskForm(taskData);
if (result.valid) {
  console.log('验证通过:', result.data);
} else {
  console.log('验证失败:', result.errorMsg);
}
// 返回: { valid: boolean, errorMsg?: string, data?: Object }
```

#### 奖励表单验证

##### validateRewardForm(rewardData)
验证奖励表单数据

```javascript
const rewardData = {
  name: '小玩具',
  requiredStars: 10,
  description: '奖励描述',
  isActive: true
};

const result = validationService.validateRewardForm(rewardData);
// 返回: { valid: boolean, errorMsg?: string, data?: Object }
```

#### 通用字段验证

##### validateTextField(value, fieldName, options)
验证文本字段

```javascript
const result = validationService.validateTextField(
  '用户输入的文本',
  '任务标题',
  { required: true, maxLength: 50 }
);
// 返回: { valid: boolean, errorMsg?: string, value: string }
```

##### validateNumberField(value, fieldName, options)
验证数字字段

```javascript
const result = validationService.validateNumberField(
  '10',
  '所需星星数',
  { required: true, min: 1, max: 100, integer: true }
);
// 返回: { valid: boolean, errorMsg?: string, value: number }
```

##### validateDateField(dateValue, fieldName, options)
验证日期字段

```javascript
const result = validationService.validateDateField(
  '2024-01-01',
  '开始日期',
  { required: true, minDate: '2024-01-01' }
);
// 返回: { valid: boolean, errorMsg?: string, value: string }
```

### 使用模式

#### 页面层使用模式
```javascript
// 1. 获取验证服务（带降级处理）
const validationService = serviceManager.getService('validation');
if (!validationService) {
  logger.error('页面名称', '无法获取验证服务，使用本地验证');
  return this.validateFormLocal();
}

// 2. 使用服务层验证
const validationResult = validationService.validateTaskForm(formData);

// 3. 处理验证结果
if (validationResult.valid) {
  // 使用验证通过的数据
  const taskData = validationResult.data;
} else {
  // 显示错误信息
  wx.showToast({
    title: validationResult.errorMsg,
    icon: 'none'
  });
}
```

## UserService - 用户管理服务

用户服务管理用户相关功能，支持多角色系统和权限控制。

### 核心功能
- 用户角色管理（parent/child）
- 当前用户状态维护
- 用户切换功能
- 权限检查
- 用户数据管理

### API 方法

#### 用户管理

##### getCurrentUserId()
获取当前用户ID

```javascript
const userId = userService.getCurrentUserId();
// 返回: string - 'parent' | 'child'
```

##### getCurrentUser()
获取当前用户信息

```javascript
const user = userService.getCurrentUser();
// 返回: { id: string, role: string, name?: string, avatar?: string }
```

##### switchUser(userId)
切换用户

```javascript
const result = userService.switchUser('child');
// 返回: { success: boolean, user?: User, message?: string }
```

##### getUserRole(userId)
获取用户角色

```javascript
const role = userService.getUserRole('child');
// 返回: string - 'parent' | 'child'
```

#### 权限检查

##### canManageRewards(userId)
检查是否可管理奖励

```javascript
const canManage = userService.canManageRewards('parent');
// 返回: boolean - 通常只有parent可以管理奖励
```

##### canViewAllTasks(userId)
检查是否可查看所有任务

```javascript
const canView = userService.canViewAllTasks('parent');
// 返回: boolean - parent可以查看所有任务
```

##### hasPermission(userId, permission)
检查特定权限

```javascript
const hasPermission = userService.hasPermission('parent', 'manage_rewards');
// 权限类型: 'manage_rewards' | 'view_all_tasks' | 'edit_tasks' | 'manage_users'
// 返回: boolean
```

### 使用示例

```javascript
const userService = getApp().serviceManager.get('userService');

// 用户权限检查示例
function checkUserPermissions() {
  const currentUserId = userService.getCurrentUserId();
  const currentUser = userService.getCurrentUser();
  
  logger.info('UserPermission', '当前用户', { currentUserId, currentUser });
  
  // 根据用户角色显示不同功能
  if (userService.canManageRewards(currentUserId)) {
    // 显示奖励管理功能
    this.setData({ showRewardManagement: true });
  }
  
  if (userService.canViewAllTasks(currentUserId)) {
    // 显示所有任务视图
    this.setData({ showAllTasksView: true });
  }
}
```

## 服务集成示例

### 完整业务流程示例

以下示例展示多个服务协同工作的完整业务流程：

```javascript
// 完整的任务-星星-奖励业务流程
class TaskRewardWorkflow {
  constructor() {
    const serviceManager = getApp().serviceManager;
    this.taskService = serviceManager.get('taskService');
    this.starService = serviceManager.get('starService');
    this.rewardService = serviceManager.get('rewardService');
    this.messageService = serviceManager.get('messageService');
    this.userService = serviceManager.get('userService');
  }
  
  async executeCompleteWorkflow() {
    try {
      // 1. 获取当前用户
      const userId = this.userService.getCurrentUserId();
      logger.info('Workflow', '开始执行完整业务流程', { userId });
      
      // 2. 创建任务
      const taskResult = await this.taskService.createTask({
        title: '每日阅读',
        type: 'study',
        date: dateUtils.getTodayString(),
        points: 20,
        pointsExpiry: 'month',
        isRequired: true
      });
      
      if (!taskResult.success) {
        throw new Error(`任务创建失败: ${taskResult.message}`);
      }
      
      const task = taskResult.task;
      
      // 3. 完成任务
      const completeResult = await this.taskService.completeTask(task.id, userId);
      
      if (!completeResult.success) {
        throw new Error(`任务完成失败: ${completeResult.message}`);
      }
      
      // 4. 检查星星余额
      const starBalance = await this.starService.getStarBalance(userId);
      logger.info('Workflow', '任务完成后星星余额', { balance: starBalance });
      
      // 5. 如果星星足够，自动兑换奖励
      if (starBalance >= 50) {
        const availableRewards = await this.rewardService.getAvailableRewards();
        
        if (availableRewards.success && availableRewards.rewards.length > 0) {
          const targetReward = availableRewards.rewards.find(r => r.cost <= starBalance);
          
          if (targetReward) {
            const claimResult = await this.rewardService.claimReward(targetReward.id, userId);
            
            if (claimResult.success) {
              logger.info('Workflow', '自动兑换奖励成功', {
                rewardId: targetReward.id,
                cost: claimResult.starCost
              });
            }
          }
        }
      }
      
      // 6. 创建总结消息
      await this.messageService.createMessage({
        userId,
        type: 'system',
        subType: 'workflow_summary',
        title: '今日任务完成总结',
        content: `恭喜完成"${task.title}"，获得${completeResult.starReward}颗星星！`,
        priority: 'normal'
      });
      
      // 7. 检查数据一致性
      const consistencyResult = await this.starService.checkDataConsistency(userId);
      if (!consistencyResult.isConsistent) {
        logger.warn('Workflow', '发现数据不一致，执行修复', consistencyResult);
        await this.starService.repairDataConsistency(userId);
      }
      
      logger.info('Workflow', '完整业务流程执行成功');
      return { success: true };
      
    } catch (error) {
      logger.error('Workflow', '业务流程执行失败', error);
      return { success: false, message: error.message };
    }
  }
}
```

## 最佳实践

### 1. 服务获取和使用
```javascript
// ✅ 正确：通过ServiceManager获取服务
const taskService = getApp().serviceManager.get('taskService');

// ❌ 错误：直接实例化服务
const taskService = new TaskService();
```

### 2. 错误处理
```javascript
// ✅ 推荐的错误处理模式
async function handleTaskOperation() {
  try {
    const result = await taskService.createTask(taskData);
    if (result.success) {
      // 处理成功结果
      logger.info('Page', '任务创建成功', result.task);
    } else {
      // 处理业务逻辑错误
      logger.warn('Page', '任务创建失败', result.message);
      wx.showToast({ title: result.message, icon: 'error' });
    }
  } catch (error) {
    // 处理系统异常
    logger.error('Page', '任务创建异常', error);
    wx.showToast({ title: '系统异常，请重试', icon: 'error' });
  }
}
```

### 3. 事件监听
```javascript
// 在页面中监听服务事件
Page({
  onLoad() {
    const eventBus = getApp().eventBus;
    
    // 监听任务完成事件
    eventBus.on('task:completed', this.handleTaskCompleted.bind(this));
    eventBus.on('reward:claimed', this.handleRewardClaimed.bind(this));
  },
  
  handleTaskCompleted(event) {
    logger.info('Page', '收到任务完成事件', event);
    this.refreshTaskList();
  },
  
  onUnload() {
    // 清理事件监听
    const eventBus = getApp().eventBus;
    eventBus.off('task:completed', this.handleTaskCompleted);
    eventBus.off('reward:claimed', this.handleRewardClaimed);
  }
});
```

### 4. 性能优化
```javascript
// 批量操作多个任务
async function batchUpdateTasks(tasks) {
  const taskService = getApp().serviceManager.get('taskService');
  
  await batchUtils.batchProcess(
    tasks,
    async (task) => {
      await taskService.updateTask(task.id, task.updates);
    },
    {
      batchSize: 20,
      delay: 50,
      showProgress: true
    }
  );
}
```

---

**文档维护者**：开发团队  
**最后更新**：2024年12月  
**版本**：v3.0 