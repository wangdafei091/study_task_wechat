# 仓储层 API

## 概述

仓储层是领域模型与底层存储之间的桥梁，负责领域对象的持久化和检索。遵循仓储模式设计，它提供了统一的数据访问接口，隐藏了数据存取的复杂性，让领域层专注于业务逻辑。

## 基础仓储 (BaseRepository)

所有具体仓储类都继承自 `BaseRepository`，它提供了通用的CRUD操作和数据访问方法。

### 基本用法

```javascript
const { BaseRepository } = require('../repositories');
const { MyModel } = require('../models');

// 创建仓储实例
const myRepository = new BaseRepository('my_data', MyModel);

// 使用仓储操作数据
async function example() {
  // 获取所有实体
  const allItems = await myRepository.getAll();
  
  // 获取特定ID的实体
  const item = await myRepository.getById('item_123');
  
  // 保存实体
  const savedItem = await myRepository.save(item);
  
  // 删除实体
  const deleted = await myRepository.delete('item_123');
  
  // 条件查询
  const filteredItems = await myRepository.query(item => item.type === 'important');
}
```

### 构造函数参数

```javascript
new BaseRepository(storageKey, modelClass, options)
```

- `storageKey` *{String}* 存储键名
- `modelClass` *{Function}* 模型构造函数
- `options` *{Object}* 可选配置
  - `namespace` *{String}* 命名空间
  - `useCache` *{Boolean}* 是否使用缓存
  - `cacheExpiry` *{Number}* 缓存过期时间(毫秒)
  - `cacheTTL` *{Number}* 内存缓存生存时间(毫秒)

### 核心方法

#### getAll

获取所有实体。

```javascript
async getAll(useCache = true)
```

**参数：**
- `useCache` *{Boolean}* 是否使用缓存，默认为 `true`

**返回：**
- *{Promise<Array>}* 实体列表

#### getById

根据ID获取实体。

```javascript
async getById(id)
```

**参数：**
- `id` *{String}* 实体ID

**返回：**
- *{Promise<Object|null>}* 实体对象或null(未找到)

#### query

根据条件查询实体。

```javascript
async query(predicate)
```

**参数：**
- `predicate` *{Function}* 过滤函数，接收实体作为参数，返回布尔值

**返回：**
- *{Promise<Array>}* 符合条件的实体列表

#### save

保存单个实体。

```javascript
async save(entity)
```

**参数：**
- `entity` *{Object}* 实体对象

**返回：**
- *{Promise<Object|null>}* 保存后的实体对象或null(失败)

#### saveAll

批量保存实体。

```javascript
async saveAll(entities)
```

**参数：**
- `entities` *{Array}* 实体对象数组

**返回：**
- *{Promise<Array>}* 保存后的实体对象数组

#### delete

删除单个实体。

```javascript
async delete(id)
```

**参数：**
- `id` *{String}* 实体ID

**返回：**
- *{Promise<Boolean>}* 是否删除成功

#### deleteMany

批量删除实体。

```javascript
async deleteMany(predicateOrIds)
```

**参数：**
- `predicateOrIds` *{Function|Array}* 过滤函数或ID数组

**返回：**
- *{Promise<Number>}* 删除的实体数量

#### clear

清空仓储。

```javascript
async clear()
```

**返回：**
- *{Promise<Boolean>}* 是否清空成功

#### count

计算符合条件的实体数量。

```javascript
async count(predicate)
```

**参数：**
- `predicate` *{Function}* 可选，过滤函数

**返回：**
- *{Promise<Number>}* 符合条件的实体数量

#### exists

检查仓储是否存在(是否有数据)。

```javascript
async exists()
```

**返回：**
- *{Promise<Boolean>}* 仓储是否存在

#### transaction

在事务中执行一系列操作。

```javascript
async transaction(transactionFn)
```

**参数：**
- `transactionFn` *{Function}* 事务函数，接收实体列表作为参数，返回修改后的实体列表

**返回：**
- *{Promise<Boolean>}* 事务是否成功

## 具体仓储类

项目中提供了多个特定领域的仓储实现：

### 1. 任务仓储 (TaskRepository)

管理任务实体，提供任务相关的数据操作。

```javascript
const { TaskRepository } = require('../repositories');
const taskRepo = new TaskRepository();

// 示例方法
const todayTasks = await taskRepo.getTasksByDate('2023-05-25');
const completedTasks = await taskRepo.getCompletedTasks();
const tasksByType = await taskRepo.getTasksByType('study');
```

主要方法：

- `getTasksByDate(date)` - 获取特定日期的任务
- `getTasksInRange(startDate, endDate)` - 获取日期范围内的任务
- `getTasksByType(type)` - 获取特定类型的任务
- `getCompletedTasks()` - 获取已完成的任务
- `getPendingTasks()` - 获取待完成的任务
- `getRequiredTasks()` - 获取必做任务
- `markAsCompleted(taskId)` - 标记任务为已完成
- `createTask(taskData)` - 创建新任务
- `createRepeatTasks(parentTask, dates)` - 创建重复任务

### 2. 星星仓储 (StarRepository)

管理星星实体，用于处理积分数据。

```javascript
const { StarRepository } = require('../repositories');
const starRepo = new StarRepository();

// 示例方法
const availableStars = await starRepo.getAvailableStars();
const expiredStars = await starRepo.getExpiredStars();
const starsBySource = await starRepo.getStarsBySource('task');
```

主要方法：

- `getAvailableStars()` - 获取可用星星
- `getExpiredStars()` - 获取已过期星星
- `getStarsBySource(sourceType)` - 获取特定来源的星星
- `addStar(starData)` - 添加星星
- `consumeStars(count)` - 消费星星
- `checkExpiry()` - 检查并处理星星过期

### 3. 星星分组仓储 (StarGroupRepository)

管理星星分组，用于处理不同有效期类型的星星集合。

```javascript
const { StarGroupRepository } = require('../repositories');
const starGroupRepo = new StarGroupRepository();

// 示例方法
const groups = await starGroupRepo.getNonEmptyGroups();
const totalPoints = await starGroupRepo.getTotalPoints();
const expiringGroups = await starGroupRepo.getExpiringGroups();
```

主要方法：

- `getNonEmptyGroups()` - 获取非空分组
- `getTotalPoints()` - 获取总积分
- `getExpiringGroups(daysThreshold)` - 获取即将过期的分组
- `getOrCreateGroup(expiryType, expiryDate)` - 获取或创建分组
- `addStarsToGroup(group, points, source)` - 向分组添加星星
- `consumeStarsFromGroups(points)` - 从分组消费星星
- `cleanupExpiredGroups()` - 清理过期分组

### 4. 奖励仓储 (RewardRepository)

管理奖励实体，处理奖励相关数据。

```javascript
const { RewardRepository } = require('../repositories');
const rewardRepo = new RewardRepository();

// 示例方法
const availableRewards = await rewardRepo.getAvailableRewards();
const redeemedRewards = await rewardRepo.getRedeemedRewards();
const rewardsByType = await rewardRepo.getRewardsByType('gift');
```

主要方法：

- `getAvailableRewards()` - 获取可用奖励
- `getRedeemedRewards()` - 获取已兑换奖励
- `getRewardsByType(type)` - 获取特定类型的奖励
- `createReward(rewardData)` - 创建新奖励
- `redeemReward(rewardId)` - 兑换奖励
- `updateRewardStatus(rewardId, status)` - 更新奖励状态

### 5. 星星记录仓储 (StarRecordRepository)

管理星星记录，用于跟踪星星的获取、消费和过期历史。

```javascript
const { StarRecordRepository } = require('../repositories');
const recordRepo = new StarRecordRepository();

// 示例方法
const recentRecords = await recordRepo.getRecordsByTimeOrder(true, 10);
const gainRecords = await recordRepo.getRecordsByType('gain');
const monthlyRecords = await recordRepo.groupRecordsByMonth(records);
```

主要方法：

- `getRecordsByType(type)` - 获取特定类型的记录
- `getRecordsByDate(date)` - 获取特定日期的记录
- `getRecordsByTimeOrder(descending, limit)` - 按时间顺序获取记录
- `getRecordsByTypeAndDate(type, date)` - 获取特定类型和日期的记录
- `createGainRecord(points, source, description)` - 创建获取记录
- `createConsumeRecord(points, reason, description)` - 创建消费记录
- `createExpiredRecord(points, expiryType, description)` - 创建过期记录
- `groupRecordsByMonth(records)` - 按月份分组记录

## 最佳实践

### 1. 仓储选择与创建

```javascript
// 推荐: 通过依赖注入方式获取仓储
function SomeService(options = {}) {
  this.taskRepo = options.taskRepo || new TaskRepository();
  this.starRepo = options.starRepo || new StarRepository();
}

// 不推荐: 直接在函数中创建仓储
function badFunction() {
  const repo = new TaskRepository(); // 每次调用都会创建新实例
}
```

### 2. 异步操作处理

```javascript
// 推荐: 使用async/await处理异步操作
async function example() {
  try {
    const tasks = await taskRepo.getAll();
    // 处理数据
  } catch (error) {
    console.error('获取任务失败', error);
  }
}

// 不推荐: 混合使用Promise和回调
function badExample() {
  taskRepo.getAll().then(tasks => {
    // 嵌套太深难以维护
  });
}
```

### 3. 批量操作

```javascript
// 推荐: 使用批量方法一次性处理多个实体
async function batchExample() {
  // 一次性获取所有任务
  const tasks = await taskRepo.getAll();
  
  // 批量修改
  const updatedTasks = tasks.map(task => {
    task.priority = 'high';
    return task;
  });
  
  // 一次性保存
  await taskRepo.saveAll(updatedTasks);
}

// 不推荐: 循环中单独处理
async function badBatchExample() {
  const tasks = await taskRepo.getAll();
  
  // 每个任务单独保存，产生多次存储操作
  for (const task of tasks) {
    task.priority = 'high';
    await taskRepo.save(task); // 性能问题!
  }
}
```

### 4. 事务操作

```javascript
// 推荐: 使用事务确保数据一致性
async function transactionExample() {
  const success = await taskRepo.transaction(tasks => {
    // 在事务中修改数据
    const task = tasks.find(t => t.id === 'task_123');
    if (task) {
      task.status = 1;
      task.completionTime = Date.now();
    }
    
    // 返回修改后的数据
    return tasks;
  });
}
```

### 5. 查询优化

```javascript
// 推荐: 使用专门的查询方法
async function optimizedQuery() {
  // 使用特定方法直接获取所需数据
  const todayTasks = await taskRepo.getTasksByDate('2023-05-25');
}

// 不推荐: 获取全部后再过滤
async function badQuery() {
  // 先获取所有任务，再过滤，性能差
  const allTasks = await taskRepo.getAll();
  const todayTasks = allTasks.filter(task => task.date === '2023-05-25');
}
```

## 注意事项

1. **缓存控制**：仓储层实现了缓存机制，可以通过参数控制缓存行为。需要实时数据时，使用 `getAll(false)` 跳过缓存。

2. **错误处理**：所有仓储方法都会捕获内部异常并记录日志，但上层调用者仍应妥善处理异常情况。

3. **数据克隆**：仓储返回的实体是原始数据的深拷贝，修改返回对象不会影响存储中的数据，除非显式调用保存方法。

4. **按需加载**：尽量只获取业务逻辑所需的数据，避免不必要的全量加载。

5. **存储限制**：微信小程序的存储容量有限(10MB)，避免存储过大的数据集。 