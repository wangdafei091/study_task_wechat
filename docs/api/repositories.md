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

```

##### findById(id)
根据ID查找记录

```

##### save(entity)
保存实体（新增或更新）

```

##### delete(id)
删除记录

```

##### count()
获取记录总数

```

#### 批量操作

##### saveAll(entities)
批量保存实体

```

##### deleteAll(ids)
批量删除记录

```

##### findByIds(ids)
根据ID列表查找记录

```

#### 缓存管理

##### clearCache()
清空缓存

```

##### getCacheInfo()
获取缓存信息

```

#### 查询支持

##### findWhere(predicate)
条件查询

```

##### exists(id)
检查记录是否存在

```

## TaskRepository - 任务仓储

管理任务数据的持久化，提供面向任务业务的查询方法。

### 继承结构

### 专用查询方法

#### 按日期查询

##### findByDate(date)
获取指定日期的任务

```

##### findByDateRange(startDate, endDate)
获取日期范围内的任务

```

##### findTodayTasks()
获取今日任务

```

#### 按状态查询

##### findByStatus(status)
按状态查找任务

```

##### findCompletedTasks()
获取已完成任务

```

##### findPendingTasks()
获取未完成任务

```

#### 按类型查询

##### findByType(type)
按类型查找任务


#### 特殊查询

##### findOverdueTasks()
获取过期任务

```

##### findRequiredTasks()
获取必做任务

```

##### findUnpenalizedRequiredTasks()
获取未应用惩罚的必做任务

```

## StarGroupRepository - 星星分组仓储

管理星星分组数据，支持按有效期分组存储和FIFO消费策略。

### 继承结构

### 专用方法

#### 分组管理

##### findByUserId(userId)
获取用户的星星分组

```

##### findActiveGroups(userId)
获取有效的星星分组（星星数>0）

```

##### findExpiredGroups(userId)
获取已过期的星星分组

```

#### 星星操作

##### addStarsToGroup(userId, amount, expiryDate, sourceId)
向分组添加星星


##### consumeStarsFromGroup(userId, amount)
从分组消费星星（FIFO策略）


#### 统计查询

##### getTotalStars(userId)
获取用户星星总数

```

##### getExpiringStars(userId, days)
获取即将过期的星星数量

```

##### getStarsByExpiryType(userId, expiryType)
按有效期类型获取星星

```

#### 数据维护

##### cleanupExpiredGroups(userId)
清理过期的空分组

```

##### mergeGroups(userId, sourceGroupId, targetGroupId)
合并星星分组

```

## StarRecordRepository - 星星记录仓储

管理星星变动记录，提供详细的星星流水查询功能。

### 继承结构

### 专用查询方法

#### 按用户查询

##### findByUserId(userId)
获取用户所有星星记录

```

##### findRecentRecords(userId, days)
获取用户最近的星星记录

```

#### 按类型查询

##### findByType(userId, type)
按记录类型查询


##### findBySource(userId, source)
按来源查询记录

```

#### 按时间查询

##### findByDateRange(userId, startDate, endDate)
按日期范围查询


##### findByMonth(userId, year, month)
按月查询记录

```

#### 统计查询

##### getStatsByType(userId, type, dateRange)
按类型获取统计数据


##### getDailyStats(userId, dateRange)
获取每日统计数据


#### 便捷创建方法

##### createEarnRecord(userId, amount, sourceId, description)
创建获得星星记录


##### createConsumeRecord(userId, amount, sourceId, description)
创建消费星星记录


##### createExpireRecord(userId, amount, sourceId, description)
创建过期星星记录


## RewardRepository - 奖励仓储

管理奖励数据的持久化，提供奖励状态和类别相关的查询方法。

### 继承结构

### 专用查询方法

#### 按状态查询

##### findAvailable()
获取可用奖励

```

##### findClaimed()
获取已兑换奖励

```

##### findDelivered()
获取已领取奖励

```

##### findDisabled()
获取已禁用奖励

```

#### 按类别查询

##### findByCategory(category)
按类别查询奖励


#### 按成本查询

##### findByCostRange(minCost, maxCost)
按成本范围查询

```

##### findAffordable(starBalance)
获取用户可负担的奖励

```

#### 库存查询

##### findInStock()
获取有库存的奖励

```

##### findOutOfStock()
获取无库存的奖励

```

#### 特殊查询

##### findSampleRewards()
获取示例奖励

```

##### findPopularRewards(limit)
获取热门奖励（按兑换次数排序）

```

#### 状态更新

##### updateStatus(rewardId, newStatus)
更新奖励状态

```

##### updateStock(rewardId, remainingCount)
更新库存数量

```

##### decrementStock(rewardId)
减少库存（兑换时调用）

```

##### incrementStock(rewardId)
增加库存（取消兑换时调用）

```

## MessageRepository - 消息仓储

管理消息数据的持久化，提供消息类型、状态和优先级相关的查询。

### 继承结构

### 专用查询方法

#### 按用户查询

##### findByUserId(userId)
获取用户所有消息

```

##### findRecentMessages(userId, limit)
获取用户最近的消息

```

#### 按状态查询

##### findUnread(userId)
获取未读消息

```

##### findRead(userId)
获取已读消息

```

##### findArchived(userId)
获取已归档消息

```

#### 按类型查询

##### findByType(userId, type)
按消息类型查询


##### findBySubType(userId, type, subType)
按子类型查询

```

#### 按优先级查询

##### findByPriority(userId, priority)
按优先级查询

```

##### findHighPriorityUnread(userId)
获取高优先级未读消息

```

#### 统计查询

##### countUnread(userId)
统计未读消息数量

```

##### countByType(userId, type)
按类型统计消息数量

```

#### 批量状态更新

##### markAllAsRead(userId)
标记所有消息为已读

```

##### markAsReadByIds(messageIds)
批量标记消息为已读

```

##### archiveOldMessages(userId, olderThanDays)
归档旧消息

```

