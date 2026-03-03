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

##### getTasksByDate(date, userId = null)
获取指定日期的任务
- **参数**:
  - `date` (String) - 日期字符串，格式 YYYY-MM-DD
  - `userId` (String, 可选) - 用户ID，不传则获取所有用户的任务
- **返回**: `Promise<Array>` - 指定日期的任务列表

##### getTasksByDateRange(startDate, endDate, userId = null)
获取日期范围内的任务
- **参数**:
  - `startDate` (String) - 开始日期字符串，格式 YYYY-MM-DD
  - `endDate` (String) - 结束日期字符串，格式 YYYY-MM-DD
  - `userId` (String, 可选) - 用户ID，不传则获取所有用户的任务
- **返回**: `Promise<Array>` - 指定日期范围的任务列表

##### getTodayTasks(userId = null)
获取今日任务
- **参数**:
  - `userId` (String, 可选) - 用户ID，不传则获取所有用户的任务
- **返回**: `Promise<Array>` - 今日任务列表

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

##### getNonEmptyGroups(userId = null)
获取非空的星星分组
- **参数**:
  - `userId` (String, 可选) - 用户ID
- **返回**: `Promise<Array>` - 非空分组列表

##### getGroupsByExpiryType(expiryType, userId = null)
按有效期类型获取分组
- **参数**:
  - `expiryType` (String) - 有效期类型
  - `userId` (String, 可选) - 用户ID
- **返回**: `Promise<Array>` - 符合条件的分组列表

#### 星星操作

##### addStarsToGroup(group, points, source)
向分组添加星星
- **参数**:
  - `group` (StarGroup) - 星星分组对象
  - `points` (Number) - 星星数量
  - `source` (String) - 来源标识
- **返回**: `Promise<StarGroup>` - 更新后的分组

##### consumeStarsFromGroup(group, points)
从分组消费星星（FIFO策略）
- **参数**:
  - `group` (StarGroup) - 星星分组对象
  - `points` (Number) - 要消费的星星数量
- **返回**: `Promise<Object>` - 包含实际消费数量和更新后分组的对象

#### 统计查询

##### getTotalPoints(userId = null)
获取用户星星总数
- **参数**:
  - `userId` (String, 可选) - 用户ID
- **返回**: `Promise<Number>` - 星星总数

##### hasEnoughPoints(amount, userId = null)
检查是否有足够的星星
- **参数**:
  - `amount` (Number) - 需要的星星数
  - `userId` (String, 可选) - 用户ID
- **返回**: `Promise<Boolean>` - 是否有足够的星星

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

#### 按类型查询

##### getRecordsByType(type, userId = null)
按记录类型查询
- **参数**:
  - `type` (String) - 记录类型（earn/consume/expire）
  - `userId` (String, 可选) - 用户ID
- **返回**: `Promise<Array>` - 符合条件的记录列表

##### getRecordsBySource(source, sourceId, userId = null)
按来源查询记录
- **参数**:
  - `source` (String) - 记录来源
  - `sourceId` (String) - 来源ID
  - `userId` (String, 可选) - 用户ID
- **返回**: `Promise<Array>` - 符合条件的记录列表

#### 按时间查询

##### getRecordsByDate(date, userId = null)
获取特定日期的记录
- **参数**:
  - `date` (String) - 日期字符串，格式 YYYY-MM-DD
  - `userId` (String, 可选) - 用户ID
- **返回**: `Promise<Array>` - 符合条件的记录列表

##### getRecordsByDateRange(startDate, endDate, userId = null)
按日期范围查询
- **参数**:
  - `startDate` (String) - 开始日期，格式 YYYY-MM-DD
  - `endDate` (String) - 结束日期，格式 YYYY-MM-DD
  - `userId` (String, 可选) - 用户ID
- **返回**: `Promise<Array>` - 符合条件的记录列表

##### getRecordsByMonth(month, userId = null)
按月查询记录
- **参数**:
  - `month` (String) - 月份字符串，格式 YYYY-MM
  - `userId` (String, 可选) - 用户ID
- **返回**: `Promise<Array>` - 符合条件的记录列表

##### getRecordsByTimeOrder(descending = true, limit = 0, userId = null)
按时间顺序查询记录
- **参数**:
  - `descending` (Boolean, 可选) - 是否降序排序（新的在前），默认 true
  - `limit` (Number, 可选) - 限制返回的记录数量，0 表示不限制
  - `userId` (String, 可选) - 用户ID
- **返回**: `Promise<Array>` - 排序后的记录列表

##### getRecordsGroupedByMonth(options = {})
按月份分组获取记录
- **参数**:
  - `options.limit` (Number, 可选) - 限制数量
  - `options.descending` (Boolean, 可选) - 是否降序排列
  - `options.userId` (String, 可选) - 用户ID
- **返回**: `Promise<Array>` - 按月份分组的记录数组

#### 便捷创建方法

##### createTaskCompleteRecord(taskId, points, description, userId = null)
创建任务完成记录
- **参数**:
  - `taskId` (String) - 任务ID
  - `points` (Number) - 获得的星星数
  - `description` (String) - 描述
  - `userId` (String, 可选) - 用户ID
- **返回**: `Promise<StarRecord>` - 创建的记录

##### createRewardExchangeRecord(rewardId, points, description, userId = null)
创建奖励兑换记录
- **参数**:
  - `rewardId` (String) - 奖励ID
  - `points` (Number) - 消费的星星数
  - `description` (String) - 描述
  - `userId` (String, 可选) - 用户ID
- **返回**: `Promise<StarRecord>` - 创建的记录

##### createExpiredRecord(points, expiryType, description, userId = null)
创建星星过期记录
- **参数**:
  - `points` (Number) - 过期的星星数
  - `expiryType` (String) - 过期类型
  - `description` (String) - 描述
  - `userId` (String, 可选) - 用户ID
- **返回**: `Promise<StarRecord>` - 创建的记录


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

