# 仓储层指南

本文档详细介绍了学习任务微信小程序基于DDD架构的仓储层API，包括基础仓储和各具体仓储的功能、方法和使用示例。

## 仓储层架构概览

### 仓储层职责
- **数据持久化**：封装数据存储和读取操作
- **查询接口**：提供面向领域的数据查询方法
- **缓存管理**：实现数据缓存和缓存策略
- **数据转换**：在领域对象和存储数据间进行转换

### 设计原则
- **接口隔离**：每个仓储专注于单一聚合根
- **领域导向**：提供面向业务的查询方法
- **存储无关**：隐藏底层存储实现细节
- **一致性**：确保数据操作的事务性

## BaseRepository - 基础仓储

BaseRepository提供通用的CRUD操作和缓存机制，所有具体仓储都继承自它。

### 核心功能
- 基础CRUD操作
- 内存缓存管理
- 批量操作支持
- 数据验证机制
- 错误处理和日志记录

### API 方法

#### 基础操作

##### findAll()
获取所有记录

```javascript
const tasks = await taskRepository.findAll();
// 返回: Task[] - 所有任务列表
```

##### findById(id)
根据ID查找记录

```javascript
const task = await taskRepository.findById('task_123');
// 返回: Task | null - 任务对象或null
```

##### save(entity)
保存实体（新增或更新）

```javascript
const task = new Task(taskData);
const savedTask = await taskRepository.save(task);
// 返回: Task - 保存后的任务对象
```

##### delete(id)
删除记录

```javascript
const success = await taskRepository.delete('task_123');
// 返回: boolean - 删除是否成功
```

##### count()
获取记录总数

```javascript
const total = await taskRepository.count();
// 返回: number - 记录总数
```

#### 批量操作

##### saveAll(entities)
批量保存实体

```javascript
const tasks = [task1, task2, task3];
const savedTasks = await taskRepository.saveAll(tasks);
// 返回: Task[] - 保存后的任务列表
```

##### deleteAll(ids)
批量删除记录

```javascript
const ids = ['task_1', 'task_2', 'task_3'];
const success = await taskRepository.deleteAll(ids);
// 返回: boolean - 批量删除是否成功
```

##### findByIds(ids)
根据ID列表查找记录

```javascript
const ids = ['task_1', 'task_2', 'task_3'];
const tasks = await taskRepository.findByIds(ids);
// 返回: Task[] - 任务列表
```

#### 缓存管理

##### clearCache()
清空缓存

```javascript
taskRepository.clearCache();
// 清空当前仓储的所有缓存
```

##### getCacheInfo()
获取缓存信息

```javascript
const info = taskRepository.getCacheInfo();
// 返回: { size: number, keys: string[] }
```

#### 查询支持

##### findWhere(predicate)
条件查询

```javascript
const completedTasks = await taskRepository.findWhere(task => task.status === 1);
// 返回: Task[] - 符合条件的任务列表
```

##### exists(id)
检查记录是否存在

```javascript
const exists = await taskRepository.exists('task_123');
// 返回: boolean - 记录是否存在
```

## TaskRepository - 任务仓储

管理任务数据的持久化，提供面向任务业务的查询方法。

### 继承结构
```javascript
class TaskRepository extends BaseRepository {
  constructor() {
    super('tasks'); // 存储键名
  }
}
```

### 专用查询方法

#### 按日期查询

##### findByDate(date)
获取指定日期的任务

```javascript
const tasks = await taskRepository.findByDate('2024-12-01');
// 返回: Task[] - 指定日期的任务列表
```

##### findByDateRange(startDate, endDate)
获取日期范围内的任务

```javascript
const tasks = await taskRepository.findByDateRange('2024-12-01', '2024-12-07');
// 返回: Task[] - 日期范围内的任务列表
```

##### findTodayTasks()
获取今日任务

```javascript
const tasks = await taskRepository.findTodayTasks();
// 返回: Task[] - 今日任务列表
```

#### 按状态查询

##### findByStatus(status)
按状态查找任务

```javascript
const pendingTasks = await taskRepository.findByStatus(0); // 未完成
const completedTasks = await taskRepository.findByStatus(1); // 已完成
// 返回: Task[] - 指定状态的任务列表
```

##### findCompletedTasks()
获取已完成任务

```javascript
const tasks = await taskRepository.findCompletedTasks();
// 返回: Task[] - 已完成的任务列表
```

##### findPendingTasks()
获取未完成任务

```javascript
const tasks = await taskRepository.findPendingTasks();
// 返回: Task[] - 未完成的任务列表
```

#### 按类型查询

##### findByType(type)
按类型查找任务

```javascript
const studyTasks = await taskRepository.findByType('study');
const habitTasks = await taskRepository.findByType('habit');
const interestTasks = await taskRepository.findByType('interest');
// 返回: Task[] - 指定类型的任务列表
```

#### 特殊查询

##### findOverdueTasks()
获取过期任务

```javascript
const tasks = await taskRepository.findOverdueTasks();
// 返回: Task[] - 过期未完成的任务列表
```

##### findRequiredTasks()
获取必做任务

```javascript
const tasks = await taskRepository.findRequiredTasks();
// 返回: Task[] - 标记为必做的任务列表
```

##### findUnpenalizedRequiredTasks()
获取未应用惩罚的必做任务

```javascript
const tasks = await taskRepository.findUnpenalizedRequiredTasks();
// 返回: Task[] - 需要应用惩罚的必做任务列表
```

### 使用示例

```javascript
const taskRepository = new TaskRepository();

// 获取今日的学习类型任务
async function getTodayStudyTasks() {
  try {
    const todayTasks = await taskRepository.findTodayTasks();
    const studyTasks = todayTasks.filter(task => task.type === 'study');
    
    logger.info('TaskRepository', '今日学习任务', { count: studyTasks.length });
    return studyTasks;
  } catch (error) {
    logger.error('TaskRepository', '获取今日学习任务失败', error);
    throw error;
  }
}
```

## StarGroupRepository - 星星分组仓储

管理星星分组数据，支持按有效期分组存储和FIFO消费策略。

### 继承结构
```javascript
class StarGroupRepository extends BaseRepository {
  constructor() {
    super('starGroups');
  }
}
```

### 专用方法

#### 分组管理

##### findByUserId(userId)
获取用户的星星分组

```javascript
const groups = await starGroupRepository.findByUserId('child');
// 返回: StarGroup[] - 用户的星星分组列表
```

##### findActiveGroups(userId)
获取有效的星星分组（星星数>0）

```javascript
const activeGroups = await starGroupRepository.findActiveGroups('child');
// 返回: StarGroup[] - 有星星的分组列表
```

##### findExpiredGroups(userId)
获取已过期的星星分组

```javascript
const expiredGroups = await starGroupRepository.findExpiredGroups('child');
// 返回: StarGroup[] - 已过期的分组列表
```

#### 星星操作

##### addStarsToGroup(userId, amount, expiryDate, sourceId)
向分组添加星星

```javascript
const result = await starGroupRepository.addStarsToGroup(
  'child',
  10,
  Date.now() + 7 * 24 * 60 * 60 * 1000, // 一周后过期
  'task_123'
);
// 返回: { success: boolean, group: StarGroup }
```

##### consumeStarsFromGroup(userId, amount)
从分组消费星星（FIFO策略）

```javascript
const result = await starGroupRepository.consumeStarsFromGroup('child', 25);
// 返回: { 
//   success: boolean, 
//   consumed: number, 
//   remaining: number,
//   affectedGroups: StarGroup[]
// }
```

#### 统计查询

##### getTotalStars(userId)
获取用户星星总数

```javascript
const total = await starGroupRepository.getTotalStars('child');
// 返回: number - 星星总数
```

##### getExpiringStars(userId, days)
获取即将过期的星星数量

```javascript
const expiring = await starGroupRepository.getExpiringStars('child', 7);
// 返回: { amount: number, groups: StarGroup[] }
```

##### getStarsByExpiryType(userId, expiryType)
按有效期类型获取星星

```javascript
const weeklyStars = await starGroupRepository.getStarsByExpiryType('child', 'week');
// 返回: { amount: number, groups: StarGroup[] }
```

#### 数据维护

##### cleanupExpiredGroups(userId)
清理过期的空分组

```javascript
const cleaned = await starGroupRepository.cleanupExpiredGroups('child');
// 返回: number - 清理的分组数量
```

##### mergeGroups(userId, sourceGroupId, targetGroupId)
合并星星分组

```javascript
const result = await starGroupRepository.mergeGroups('child', 'group1', 'group2');
// 返回: { success: boolean, mergedGroup: StarGroup }
```

### 使用示例

```javascript
const starGroupRepository = new StarGroupRepository();

// 实现FIFO星星消费
async function consumeStarsWithFIFO(userId, amount) {
  try {
    // 获取活跃分组并按过期时间排序
    const activeGroups = await starGroupRepository.findActiveGroups(userId);
    const sortedGroups = activeGroups.sort((a, b) => {
      if (a.expiryDate === 'permanent') return 1;
      if (b.expiryDate === 'permanent') return -1;
      return a.expiryDate - b.expiryDate;
    });
    
    let remainingToConsume = amount;
    let totalConsumed = 0;
    const affectedGroups = [];
    
    for (const group of sortedGroups) {
      if (remainingToConsume <= 0) break;
      
      const canConsume = Math.min(group.points, remainingToConsume);
      group.points -= canConsume;
      
      totalConsumed += canConsume;
      remainingToConsume -= canConsume;
      affectedGroups.push(group);
      
      // 保存更新后的分组
      await starGroupRepository.save(group);
      
      logger.info('StarGroupRepository', '消费星星', {
        groupId: group.id,
        consumed: canConsume,
        remaining: group.points
      });
    }
    
    return {
      success: true,
      consumed: totalConsumed,
      remaining: remainingToConsume,
      affectedGroups
    };
    
  } catch (error) {
    logger.error('StarGroupRepository', 'FIFO消费失败', error);
    throw error;
  }
}
```

## StarRecordRepository - 星星记录仓储

管理星星变动记录，提供详细的星星流水查询功能。

### 继承结构
```javascript
class StarRecordRepository extends BaseRepository {
  constructor() {
    super('starRecords');
  }
}
```

### 专用查询方法

#### 按用户查询

##### findByUserId(userId)
获取用户所有星星记录

```javascript
const records = await starRecordRepository.findByUserId('child');
// 返回: StarRecord[] - 用户的星星记录列表
```

##### findRecentRecords(userId, days)
获取用户最近的星星记录

```javascript
const records = await starRecordRepository.findRecentRecords('child', 30);
// 返回: StarRecord[] - 最近30天的记录
```

#### 按类型查询

##### findByType(userId, type)
按记录类型查询

```javascript
const earnRecords = await starRecordRepository.findByType('child', 'earn');
const consumeRecords = await starRecordRepository.findByType('child', 'consume');
const expiredRecords = await starRecordRepository.findByType('child', 'expire');
// 返回: StarRecord[] - 指定类型的记录列表
```

##### findBySource(userId, source)
按来源查询记录

```javascript
const taskRecords = await starRecordRepository.findBySource('child', 'task');
const rewardRecords = await starRecordRepository.findBySource('child', 'reward');
// 返回: StarRecord[] - 指定来源的记录列表
```

#### 按时间查询

##### findByDateRange(userId, startDate, endDate)
按日期范围查询

```javascript
const records = await starRecordRepository.findByDateRange(
  'child', 
  '2024-12-01', 
  '2024-12-31'
);
// 返回: StarRecord[] - 日期范围内的记录
```

##### findByMonth(userId, year, month)
按月查询记录

```javascript
const records = await starRecordRepository.findByMonth('child', 2024, 12);
// 返回: StarRecord[] - 指定月份的记录
```

#### 统计查询

##### getStatsByType(userId, type, dateRange)
按类型获取统计数据

```javascript
const stats = await starRecordRepository.getStatsByType('child', 'earn', {
  startDate: '2024-12-01',
  endDate: '2024-12-31'
});
// 返回: { count: number, totalAmount: number, avgAmount: number }
```

##### getDailyStats(userId, dateRange)
获取每日统计数据

```javascript
const dailyStats = await starRecordRepository.getDailyStats('child', {
  startDate: '2024-12-01',
  endDate: '2024-12-31'
});
// 返回: Array<{ date: string, earned: number, consumed: number, net: number }>
```

#### 便捷创建方法

##### createEarnRecord(userId, amount, sourceId, description)
创建获得星星记录

```javascript
const record = await starRecordRepository.createEarnRecord(
  'child',
  10,
  'task_123',
  '完成任务：练习钢琴'
);
// 返回: StarRecord - 创建的记录
```

##### createConsumeRecord(userId, amount, sourceId, description)
创建消费星星记录

```javascript
const record = await starRecordRepository.createConsumeRecord(
  'child',
  25,
  'reward_456',
  '兑换奖励：看动画片'
);
// 返回: StarRecord - 创建的记录
```

##### createExpireRecord(userId, amount, sourceId, description)
创建过期星星记录

```javascript
const record = await starRecordRepository.createExpireRecord(
  'child',
  5,
  'system',
  '星星过期清理'
);
// 返回: StarRecord - 创建的记录
```

### 使用示例

```javascript
const starRecordRepository = new StarRecordRepository();

// 生成星星流水报告
async function generateStarFlowReport(userId, days = 30) {
  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    
    // 获取期间内的所有记录
    const records = await starRecordRepository.findByDateRange(
      userId,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );
    
    // 按类型统计
    const earnTotal = records
      .filter(r => r.type === 'earn')
      .reduce((sum, r) => sum + r.amount, 0);
      
    const consumeTotal = records
      .filter(r => r.type === 'consume')
      .reduce((sum, r) => sum + r.amount, 0);
      
    const expiredTotal = records
      .filter(r => r.type === 'expire')
      .reduce((sum, r) => sum + r.amount, 0);
    
    // 按来源统计
    const sourceStats = {};
    records.forEach(record => {
      if (!sourceStats[record.source]) {
        sourceStats[record.source] = { earn: 0, consume: 0, expire: 0 };
      }
      sourceStats[record.source][record.type] += record.amount;
    });
    
    const report = {
      period: { startDate, endDate, days },
      summary: {
        totalEarned: earnTotal,
        totalConsumed: consumeTotal,
        totalExpired: expiredTotal,
        netChange: earnTotal - consumeTotal - expiredTotal
      },
      bySource: sourceStats,
      recordCount: records.length
    };
    
    logger.info('StarRecordRepository', '星星流水报告生成完成', report);
    return report;
    
  } catch (error) {
    logger.error('StarRecordRepository', '生成星星流水报告失败', error);
    throw error;
  }
}
```

## RewardRepository - 奖励仓储

管理奖励数据的持久化，提供奖励状态和类别相关的查询方法。

### 继承结构
```javascript
class RewardRepository extends BaseRepository {
  constructor() {
    super('rewards');
  }
}
```

### 专用查询方法

#### 按状态查询

##### findAvailable()
获取可用奖励

```javascript
const rewards = await rewardRepository.findAvailable();
// 返回: Reward[] - 状态为available的奖励列表
```

##### findClaimed()
获取已兑换奖励

```javascript
const rewards = await rewardRepository.findClaimed();
// 返回: Reward[] - 状态为claimed的奖励列表
```

##### findDelivered()
获取已领取奖励

```javascript
const rewards = await rewardRepository.findDelivered();
// 返回: Reward[] - 状态为delivered的奖励列表
```

##### findDisabled()
获取已禁用奖励

```javascript
const rewards = await rewardRepository.findDisabled();
// 返回: Reward[] - 状态为disabled的奖励列表
```

#### 按类别查询

##### findByCategory(category)
按类别查询奖励

```javascript
const entertainmentRewards = await rewardRepository.findByCategory('entertainment');
const foodRewards = await rewardRepository.findByCategory('food');
const toyRewards = await rewardRepository.findByCategory('toy');
// 返回: Reward[] - 指定类别的奖励列表
```

#### 按成本查询

##### findByCostRange(minCost, maxCost)
按成本范围查询

```javascript
const affordableRewards = await rewardRepository.findByCostRange(0, 50);
// 返回: Reward[] - 成本在指定范围内的奖励
```

##### findAffordable(starBalance)
获取用户可负担的奖励

```javascript
const rewards = await rewardRepository.findAffordable(100);
// 返回: Reward[] - 成本不超过星星余额的奖励
```

#### 库存查询

##### findInStock()
获取有库存的奖励

```javascript
const rewards = await rewardRepository.findInStock();
// 返回: Reward[] - remainingCount > 0的奖励
```

##### findOutOfStock()
获取无库存的奖励

```javascript
const rewards = await rewardRepository.findOutOfStock();
// 返回: Reward[] - remainingCount = 0的奖励
```

#### 特殊查询

##### findSampleRewards()
获取示例奖励

```javascript
const sampleRewards = await rewardRepository.findSampleRewards();
// 返回: Reward[] - 标记为示例的奖励
```

##### findPopularRewards(limit)
获取热门奖励（按兑换次数排序）

```javascript
const popularRewards = await rewardRepository.findPopularRewards(10);
// 返回: Reward[] - 前10个最受欢迎的奖励
```

#### 状态更新

##### updateStatus(rewardId, newStatus)
更新奖励状态

```javascript
const success = await rewardRepository.updateStatus('reward_123', 'claimed');
// 返回: boolean - 更新是否成功
```

##### updateStock(rewardId, remainingCount)
更新库存数量

```javascript
const success = await rewardRepository.updateStock('reward_123', 5);
// 返回: boolean - 更新是否成功
```

##### decrementStock(rewardId)
减少库存（兑换时调用）

```javascript
const success = await rewardRepository.decrementStock('reward_123');
// 返回: boolean - 库存减少是否成功
```

##### incrementStock(rewardId)
增加库存（取消兑换时调用）

```javascript
const success = await rewardRepository.incrementStock('reward_123');
// 返回: boolean - 库存增加是否成功
```

### 使用示例

```javascript
const rewardRepository = new RewardRepository();

// 获取用户可兑换的奖励推荐
async function getRecommendedRewards(userId, starBalance) {
  try {
    // 获取可用且有库存的奖励
    const availableRewards = await rewardRepository.findAvailable();
    const inStockRewards = availableRewards.filter(reward => 
      reward.remainingCount > 0
    );
    
    // 筛选用户可负担的奖励
    const affordableRewards = inStockRewards.filter(reward => 
      reward.cost <= starBalance
    );
    
    // 按成本排序（从低到高）
    const sortedRewards = affordableRewards.sort((a, b) => a.cost - b.cost);
    
    // 按类别分组
    const rewardsByCategory = {};
    sortedRewards.forEach(reward => {
      if (!rewardsByCategory[reward.category]) {
        rewardsByCategory[reward.category] = [];
      }
      rewardsByCategory[reward.category].push(reward);
    });
    
    logger.info('RewardRepository', '奖励推荐生成完成', {
      totalAvailable: availableRewards.length,
      affordable: affordableRewards.length,
      categories: Object.keys(rewardsByCategory)
    });
    
    return {
      all: sortedRewards,
      byCategory: rewardsByCategory,
      summary: {
        total: sortedRewards.length,
        minCost: sortedRewards[0]?.cost || 0,
        maxCost: sortedRewards[sortedRewards.length - 1]?.cost || 0
      }
    };
    
  } catch (error) {
    logger.error('RewardRepository', '生成奖励推荐失败', error);
    throw error;
  }
}
```

## MessageRepository - 消息仓储

管理消息数据的持久化，提供消息类型、状态和优先级相关的查询。

### 继承结构
```javascript
class MessageRepository extends BaseRepository {
  constructor() {
    super('messages');
  }
}
```

### 专用查询方法

#### 按用户查询

##### findByUserId(userId)
获取用户所有消息

```javascript
const messages = await messageRepository.findByUserId('child');
// 返回: Message[] - 用户的所有消息
```

##### findRecentMessages(userId, limit)
获取用户最近的消息

```javascript
const messages = await messageRepository.findRecentMessages('child', 20);
// 返回: Message[] - 最近的20条消息
```

#### 按状态查询

##### findUnread(userId)
获取未读消息

```javascript
const messages = await messageRepository.findUnread('child');
// 返回: Message[] - 用户的未读消息
```

##### findRead(userId)
获取已读消息

```javascript
const messages = await messageRepository.findRead('child');
// 返回: Message[] - 用户的已读消息
```

##### findArchived(userId)
获取已归档消息

```javascript
const messages = await messageRepository.findArchived('child');
// 返回: Message[] - 用户的已归档消息
```

#### 按类型查询

##### findByType(userId, type)
按消息类型查询

```javascript
const taskMessages = await messageRepository.findByType('child', 'task');
const rewardMessages = await messageRepository.findByType('child', 'reward');
const systemMessages = await messageRepository.findByType('child', 'system');
// 返回: Message[] - 指定类型的消息
```

##### findBySubType(userId, type, subType)
按子类型查询

```javascript
const reminderMessages = await messageRepository.findBySubType('child', 'system', 'reminder');
// 返回: Message[] - 指定子类型的消息
```

#### 按优先级查询

##### findByPriority(userId, priority)
按优先级查询

```javascript
const highPriorityMessages = await messageRepository.findByPriority('child', 'high');
const normalMessages = await messageRepository.findByPriority('child', 'normal');
// 返回: Message[] - 指定优先级的消息
```

##### findHighPriorityUnread(userId)
获取高优先级未读消息

```javascript
const messages = await messageRepository.findHighPriorityUnread('child');
// 返回: Message[] - 高优先级的未读消息
```

#### 统计查询

##### countUnread(userId)
统计未读消息数量

```javascript
const count = await messageRepository.countUnread('child');
// 返回: number - 未读消息数量
```

##### countByType(userId, type)
按类型统计消息数量

```javascript
const taskMessageCount = await messageRepository.countByType('child', 'task');
// 返回: number - 指定类型的消息数量
```

#### 批量状态更新

##### markAllAsRead(userId)
标记所有消息为已读

```javascript
const count = await messageRepository.markAllAsRead('child');
// 返回: number - 标记为已读的消息数量
```

##### markAsReadByIds(messageIds)
批量标记消息为已读

```javascript
const ids = ['msg_1', 'msg_2', 'msg_3'];
const count = await messageRepository.markAsReadByIds(ids);
// 返回: number - 标记为已读的消息数量
```

##### archiveOldMessages(userId, olderThanDays)
归档旧消息

```javascript
const count = await messageRepository.archiveOldMessages('child', 30);
// 返回: number - 归档的消息数量
```

### 使用示例

```javascript
const messageRepository = new MessageRepository();

// 实现智能消息管理
async function manageUserMessages(userId) {
  try {
    // 1. 获取未读消息统计
    const unreadCount = await messageRepository.countUnread(userId);
    
    if (unreadCount > 0) {
      // 2. 获取高优先级未读消息
      const highPriorityMessages = await messageRepository.findHighPriorityUnread(userId);
      
      if (highPriorityMessages.length > 0) {
        logger.info('MessageRepository', '发现高优先级未读消息', {
          count: highPriorityMessages.length
        });
        
        // 处理高优先级消息
        for (const message of highPriorityMessages) {
          // 发送推送通知或其他处理
          await handleHighPriorityMessage(message);
        }
      }
      
      // 3. 检查是否有过多未读消息
      if (unreadCount > 50) {
        logger.warn('MessageRepository', '未读消息过多，建议清理', { count: unreadCount });
        
        // 自动标记旧的普通消息为已读
        const oldNormalMessages = await messageRepository.findByPriority(userId, 'normal');
        const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const oldMessageIds = oldNormalMessages
          .filter(msg => msg.timestamp < oneWeekAgo)
          .map(msg => msg.id);
          
        if (oldMessageIds.length > 0) {
          await messageRepository.markAsReadByIds(oldMessageIds);
          logger.info('MessageRepository', '自动标记旧消息为已读', { count: oldMessageIds.length });
        }
      }
    }
    
    // 4. 定期归档旧消息
    const archivedCount = await messageRepository.archiveOldMessages(userId, 30);
    if (archivedCount > 0) {
      logger.info('MessageRepository', '归档旧消息', { count: archivedCount });
    }
    
    return {
      unreadCount: await messageRepository.countUnread(userId),
      managementActions: {
        highPriorityProcessed: highPriorityMessages?.length || 0,
        archivedCount
      }
    };
    
  } catch (error) {
    logger.error('MessageRepository', '消息管理失败', error);
    throw error;
  }
}
```

## 仓储使用最佳实践

### 1. 仓储实例化
```javascript
// ✅ 推荐：在需要时创建仓储实例
class TaskService {
  constructor() {
    this.taskRepository = new TaskRepository();
  }
}

// ❌ 避免：全局实例化仓储
const globalTaskRepository = new TaskRepository();
```

### 2. 错误处理
```javascript
// ✅ 推荐的错误处理
async function handleTaskQuery() {
  try {
    const tasks = await taskRepository.findAll();
    return { success: true, data: tasks };
  } catch (error) {
    logger.error('TaskService', '查询任务失败', error);
    return { success: false, message: '查询失败，请重试' };
  }
}
```

### 3. 批量操作
```javascript
// ✅ 使用批量操作提高性能
const tasks = [task1, task2, task3];
const savedTasks = await taskRepository.saveAll(tasks);

// ❌ 避免循环单个操作
for (const task of tasks) {
  await taskRepository.save(task); // 性能差
}
```

### 4. 缓存利用
```javascript
// ✅ 合理使用缓存
const tasks = await taskRepository.findAll(); // 第一次从存储读取
const tasks2 = await taskRepository.findAll(); // 从缓存读取

// 在数据更新后清理缓存
await taskRepository.save(newTask);
taskRepository.clearCache(); // 确保数据一致性
```

### 5. 查询优化
```javascript
// ✅ 使用专门的查询方法
const todayTasks = await taskRepository.findTodayTasks();

// ❌ 避免通用查询后过滤
const allTasks = await taskRepository.findAll();
const todayTasks = allTasks.filter(task => task.date === today);
```

## 仓储扩展指南

### 添加新查询方法
```javascript
class TaskRepository extends BaseRepository {
  // 添加新的业务查询方法
  async findTasksWithPendingRewards() {
    const tasks = await this.findAll();
    return tasks.filter(task => 
      task.status === 1 && // 已完成
      task.points > 0 && // 有星星奖励
      !task.starAwarded // 未发放星星
    );
  }
  
  // 添加复杂条件查询
  async findTasksByComplexCriteria(criteria) {
    const tasks = await this.findAll();
    return tasks.filter(task => {
      if (criteria.type && task.type !== criteria.type) return false;
      if (criteria.minPoints && task.points < criteria.minPoints) return false;
      if (criteria.dateRange) {
        if (task.date < criteria.dateRange.start || 
            task.date > criteria.dateRange.end) return false;
      }
      return true;
    });
  }
}
```

### 性能监控
```javascript
class BaseRepository {
  async findAll() {
    const startTime = Date.now();
    
    try {
      const result = await this._performQuery();
      
      const duration = Date.now() - startTime;
      if (duration > 100) { // 查询超过100ms记录警告
        logger.warn('Repository', '查询耗时过长', {
          repository: this.constructor.name,
          duration,
          method: 'findAll'
        });
      }
      
      return result;
    } catch (error) {
      logger.error('Repository', '查询失败', {
        repository: this.constructor.name,
        method: 'findAll',
        error
      });
      throw error;
    }
  }
}
```

---

**文档维护者**：开发团队  
**最后更新**：2024年12月  
**版本**：v3.0 