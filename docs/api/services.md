# 服务层 API

## 概述

服务层是应用层的核心组成部分，负责协调领域对象和仓储实现业务用例。服务类封装复杂的业务流程，提供高级功能接口给界面层使用，是领域模型和用户界面之间的桥梁。

## 服务管理器 (ServiceManager)

服务管理器是获取各种服务实例的统一入口，管理服务的生命周期和依赖关系。

### 基本用法

```javascript
const serviceManager = require('../utils/serviceManager');

// 获取任务服务
const taskService = serviceManager.getService('taskService');

// 获取消息服务
const messageService = serviceManager.getService('messageService');

// 获取星星服务
const starService = serviceManager.getService('starService');
```

### 主要方法

- `getService(serviceName)` - 获取指定名称的服务实例
- `registerService(serviceName, serviceInstance)` - 注册服务实例
- `initialize()` - 初始化所有服务

## 星星服务 (StarService)

星星服务处理与星星（积分）相关的业务逻辑，包括星星的获取、消费、分组和过期处理。

### 基本用法

```javascript
const { StarService } = require('../services');

// 创建服务实例
const starService = new StarService();

// 初始化服务（清理过期星星等）
await starService.initialize();

// 添加星星
const result = await starService.addStars(10, 'permanent', '每日登录奖励');

// 消费星星
const consumeResult = await starService.consumeStars(5, '购买奖品');

// 获取总星星数量
const totalStars = await starService.getTotalStars();
```

### 构造函数

```javascript
new StarService(options)
```

**参数：**
- `options` *{Object}* 可选配置
  - `starGroupRepository` *{StarGroupRepository}* 星星分组仓储实例
  - `starRecordRepository` *{StarRecordRepository}* 星星记录仓储实例
  - `eventBus` *{EventBus}* 事件总线实例

### 核心方法

#### initialize

初始化服务，清理过期星星。

```javascript
async initialize()
```

**返回：**
- *{Promise<Boolean>}* 初始化是否成功

#### addStars

添加星星到用户账户。

```javascript
async addStars(points, expiryType, source, options = {})
```

**参数：**
- `points` *{Number}* 星星数量
- `expiryType` *{String}* 过期类型，来自 `StarExpiryType` 枚举
- `source` *{String}* 来源描述
- `options` *{Object}* 可选参数
  - `sourceType` *{String}* 来源类型
  - `sourceId` *{String}* 来源ID

**返回：**
- *{Promise<Object>}* 添加结果
  - `success` *{Boolean}* 是否成功
  - `message` *{String}* 结果消息
  - `group` *{StarGroup}* 更新后的星星分组

#### consumeStars

从用户账户消费星星。

```javascript
async consumeStars(points, reason, options = {})
```

**参数：**
- `points` *{Number}* 要消费的星星数量
- `reason` *{String}* 消费原因
- `options` *{Object}* 可选参数
  - `sourceType` *{String}* 来源类型
  - `sourceId` *{String}* 来源ID

**返回：**
- *{Promise<Object>}* 消费结果
  - `success` *{Boolean}* 是否成功
  - `message` *{String}* 结果消息
  - `consumedGroups` *{Array}* 消费的星星分组列表

#### getTotalStars

获取用户总星星数量。

```javascript
async getTotalStars()
```

**返回：**
- *{Promise<Number>}* 星星总数量

#### getStarGroups

获取星星分组列表。

```javascript
async getStarGroups()
```

**返回：**
- *{Promise<Array>}* 星星分组列表

#### getStarRecords

获取星星记录列表。

```javascript
async getStarRecords(options = {})
```

**参数：**
- `options` *{Object}* 查询选项
  - `limit` *{Number}* 限制数量
  - `type` *{String}* 记录类型
  - `date` *{String}* 日期

**返回：**
- *{Promise<Array>}* 星星记录列表

#### getStarRecordsByMonth

获取按月份分组的星星记录。

```javascript
async getStarRecordsByMonth()
```

**返回：**
- *{Promise<Object>}* 按月份分组的记录

#### handleTaskCompletion

处理任务完成时的星星奖励。

```javascript
async handleTaskCompletion(task, points)
```

**参数：**
- `task` *{Task}* 完成的任务对象
- `points` *{Number}* 获得的星星数量

**返回：**
- *{Promise<Object>}* 处理结果

#### handleRequiredTaskPenalty

处理必做任务未完成的星星惩罚。

```javascript
async handleRequiredTaskPenalty(task, points)
```

**参数：**
- `task` *{Task}* 任务对象
- `points` *{Number}* 惩罚的星星数量

**返回：**
- *{Promise<Object>}* 处理结果

#### cleanupExpiredStars

清理过期的星星。

```javascript
async cleanupExpiredStars()
```

**返回：**
- *{Promise<Object>}* 清理结果
  - `expiredGroups` *{Array}* 过期的星星分组
  - `totalExpired` *{Number}* 过期的星星总数

## 奖励服务 (RewardService)

奖励服务处理与奖励相关的业务逻辑，包括奖励的创建、兑换和管理。

### 基本用法

```javascript
const { RewardService } = require('../services');
const starService = new StarService();

// 创建服务实例
const rewardService = new RewardService({
  starService: starService
});

// 创建新奖励
const reward = await rewardService.createReward({
  name: '新玩具',
  description: '一个很酷的玩具',
  points: 50,
  type: 'gift'
});

// 兑换奖励
const result = await rewardService.redeemReward('reward_123');

// 获取可用奖励列表
const availableRewards = await rewardService.getAvailableRewards();
```

### 构造函数

```javascript
new RewardService(options)
```

**参数：**
- `options` *{Object}* 可选配置
  - `rewardRepository` *{RewardRepository}* 奖励仓储实例
  - `starService` *{StarService}* 星星服务实例
  - `eventBus` *{EventBus}* 事件总线实例

### 核心方法

#### createReward

创建新奖励。

```javascript
async createReward(rewardData)
```

**参数：**
- `rewardData` *{Object}* 奖励数据
  - `name` *{String}* 奖励名称
  - `description` *{String}* 奖励描述
  - `points` *{Number}* 所需星星数量
  - `type` *{String}* 奖励类型
  - `imageUrl` *{String}* 可选，图片URL
  - `expiryDate` *{Number}* 可选，过期时间戳

**返回：**
- *{Promise<Object>}* 创建的奖励对象

#### redeemReward

兑换奖励。

```javascript
async redeemReward(rewardId)
```

**参数：**
- `rewardId` *{String}* 奖励ID

**返回：**
- *{Promise<Object>}* 兑换结果
  - `success` *{Boolean}* 是否成功
  - `message` *{String}* 结果消息
  - `reward` *{Reward}* 更新后的奖励对象

#### getRewardById

根据ID获取奖励。

```javascript
async getRewardById(rewardId)
```

**参数：**
- `rewardId` *{String}* 奖励ID

**返回：**
- *{Promise<Object>}* 奖励对象或null

#### getAllRewards

获取所有奖励。

```javascript
async getAllRewards()
```

**返回：**
- *{Promise<Array>}* 奖励列表

#### getAvailableRewards

获取可用的奖励。

```javascript
async getAvailableRewards()
```

**返回：**
- *{Promise<Array>}* 可用奖励列表

#### getRedeemedRewards

获取已兑换的奖励。

```javascript
async getRedeemedRewards()
```

**返回：**
- *{Promise<Array>}* 已兑换奖励列表

#### getRewardsByType

获取特定类型的奖励。

```javascript
async getRewardsByType(type)
```

**参数：**
- `type` *{String}* 奖励类型

**返回：**
- *{Promise<Array>}* 指定类型的奖励列表

#### updateReward

更新奖励信息。

```javascript
async updateReward(rewardId, updateData)
```

**参数：**
- `rewardId` *{String}* 奖励ID
- `updateData` *{Object}* 更新数据

**返回：**
- *{Promise<Object>}* 更新后的奖励对象

#### deleteReward

删除奖励。

```javascript
async deleteReward(rewardId)
```

**参数：**
- `rewardId` *{String}* 奖励ID

**返回：**
- *{Promise<Boolean>}* 是否删除成功

## 事件总线 (EventBus)

事件总线用于领域事件的发布和订阅，帮助不同组件间进行松耦合通信。

### 基本用法

```javascript
const EventBus = require('../utils/core/event-bus');

// 创建事件总线实例
const eventBus = new EventBus();

// 订阅事件
eventBus.on('taskCompleted', (task) => {
  console.log(`任务 ${task.title} 已完成`);
});

// 发布事件
eventBus.emit('taskCompleted', { id: 'task_123', title: '完成作业' });

// 移除订阅
const handler = (task) => {
  console.log(`处理任务: ${task.title}`);
};
eventBus.on('taskCreated', handler);
eventBus.off('taskCreated', handler);
```

### 主要方法

#### on

订阅事件。

```javascript
on(eventName, handler)
```

**参数：**
- `eventName` *{String}* 事件名称
- `handler` *{Function}* 事件处理函数

**返回：**
- *{EventBus}* 事件总线实例，用于链式调用

#### off

取消订阅事件。

```javascript
off(eventName, handler)
```

**参数：**
- `eventName` *{String}* 事件名称
- `handler` *{Function}* 要移除的事件处理函数

**返回：**
- *{EventBus}* 事件总线实例，用于链式调用

#### emit

发布事件。

```javascript
emit(eventName, ...args)
```

**参数：**
- `eventName` *{String}* 事件名称
- `...args` *{Any}* 传递给处理函数的参数

**返回：**
- *{Boolean}* 是否有处理函数被调用

#### once

订阅事件，但只触发一次。

```javascript
once(eventName, handler)
```

**参数：**
- `eventName` *{String}* 事件名称
- `handler` *{Function}* 事件处理函数

**返回：**
- *{EventBus}* 事件总线实例，用于链式调用

## 最佳实践

### 1. 服务创建与使用

```javascript
// 推荐: 创建服务时注入依赖
const starRepo = new StarRepository();
const starService = new StarService({
  starGroupRepository: starRepo
});

// 不推荐: 在服务内部创建依赖
// 这样会使测试更困难
const badService = new BadService();
```

### 2. 事件驱动设计

```javascript
// 推荐: 使用事件通知而非直接调用
// 在星星服务中
starService.consumeStars(50, '兑换奖励').then(() => {
  eventBus.emit('starsConsumed', { points: 50, reason: '兑换奖励' });
});

// 在奖励服务中
eventBus.on('starsConsumed', (data) => {
  if (data.reason === '兑换奖励') {
    // 处理后续逻辑
  }
});
```

### 3. 服务粒度

```javascript
// 推荐: 每个服务专注于一个领域
// StarService 只处理星星相关
// RewardService 只处理奖励相关

// 不推荐: 大而全的服务
// UserService 同时处理用户、星星、奖励、任务等
```

### 4. 错误处理

```javascript
// 推荐: 统一的错误处理策略
async function someServiceMethod() {
  try {
    // 业务逻辑
    return { success: true, data: result };
  } catch (error) {
    logger.error('ServiceName', '发生错误', error);
    return { success: false, message: '操作失败，请稍后再试', error };
  }
}
```

### 5. 返回值一致性

```javascript
// 推荐: 返回标准化的结果对象
// 成功情况
return {
  success: true,
  data: result,
  message: '操作成功'
};

// 失败情况
return {
  success: false,
  error: errorObject,
  message: '操作失败：' + errorMessage
};
```

## 任务与服务的集成

### 将任务完成与星星奖励集成

```javascript
// 在任务服务中
async function completeTask(taskId) {
  const task = await taskRepository.getById(taskId);
  
  if (!task) {
    return { success: false, message: '任务不存在' };
  }
  
  // 更新任务状态
  task.complete();
  await taskRepository.save(task);
  
  // 处理星星奖励
  if (task.points > 0 && !task.starAwarded) {
    await starService.handleTaskCompletion(task, task.points);
  }
  
  return { success: true, task };
}
```

### 奖励兑换与星星消费集成

```javascript
// 在奖励服务中
async function redeemReward(rewardId) {
  const reward = await rewardRepository.getById(rewardId);
  
  if (!reward) {
    return { success: false, message: '奖励不存在' };
  }
  
  // 检查星星是否足够
  const totalStars = await starService.getTotalStars();
  
  if (totalStars < reward.points) {
    return { 
      success: false, 
      message: '星星不足', 
      required: reward.points,
      current: totalStars 
    };
  }
  
  // 消费星星
  const consumeResult = await starService.consumeStars(
    reward.points, 
    `兑换奖励: ${reward.name}`
  );
  
  if (!consumeResult.success) {
    return consumeResult;
  }
  
  // 更新奖励状态
  reward.redeem();
  await rewardRepository.save(reward);
  
  return { success: true, reward };
}
```

## 注意事项

1. **事务处理**：涉及多个仓储的操作应考虑事务处理，确保数据一致性。

2. **资源释放**：服务可能使用的资源（如计时器、连接等）应在适当时机释放。

3. **服务边界**：合理划分服务边界，避免服务之间的循环依赖。

4. **延迟加载**：考虑使用延迟加载策略，按需创建服务实例。

5. **性能优化**：服务方法应尽量批量处理数据，避免频繁的存储操作。 