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

##### getAll(useCache = true)
获取所有记录
- **参数**: `useCache` (Boolean, 可选) - 是否使用缓存，默认 true
- **返回**: `Promise<Array>` - 实体列表
- **说明**: 支持异步和同步版本（`getAllSync`）

##### getById(id)
根据ID查找记录
- **参数**: `id` (String) - 实体ID
- **返回**: `Promise<Object|null>` - 实体对象或null

```

##### save(entity)
保存实体（新增或更新）

**返回值**:
- 成功：返回保存后的实体
- 失败：抛出异常

**异常**:
- 保存失败时抛出 Error 异常，包含详细错误信息

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

**返回值**:
- 成功：返回保存后的实体数组
- 失败：抛出异常

**异常**:
- 保存失败时抛出 Error 异常，包含详细错误信息

```

##### deleteAll(ids)
批量删除记录

```

##### findByIds(ids)
根据ID列表查找记录
- **参数**: `ids` (Array) - ID数组
- **返回**: `Promise<Array>` - 实体列表

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

## TaskTemplateRepository - 任务模板仓储

管理任务模板的本地镜像，提供模板搜索、筛选、排序与最近模板查询能力。

### 继承结构

- 继承 `BaseRepository`
- 存储键默认值：`taskTemplates`
- 聚合模型：`TaskTemplate`

### 专用方法

##### `replaceAll(templates = [])`
用新的模板集合整体替换本地镜像。
- **参数**: `templates` (Array)
- **返回**: `Promise<Array>` - 替换后的模板列表

##### `getTemplates(options = {})`
按条件获取模板列表。
- **参数**:
  ```javascript
  {
    keyword?: string,
    type?: 'all' | 'study' | 'habit' | 'interest',
    status?: 'all' | 'enabled' | 'disabled',
    enabledOnly?: boolean,
    sortBy?: 'recent' | 'usage'
  }
  ```
- **返回**: `Promise<Array>` - 过滤并排序后的模板列表

说明：
- `keyword` 会同时匹配模板名称、模板说明和模板内任务标题
- `enabledOnly=true` 会先过滤停用模板，常用于任务编辑页快捷填充入口
- `sortBy='recent'` 以 `lastUsedAt`、`updatedAt` 作为主排序键
- `sortBy='usage'` 以 `usageCount`、`lastUsedAt` 作为主排序键

##### `getRecentTemplates(limit = 5)`
获取最近使用的启用模板。
- **参数**: `limit` (Number)
- **返回**: `Promise<Array>` - 最近模板列表

##### `_compareTemplates(left, right, sortBy)`
模板排序内部比较器。
- **说明**:
  - `recent` 模式优先比较 `lastUsedAt`
  - `usage` 模式优先比较 `usageCount`

## ReleaseNoteRepository - 版本说明仓储

管理前台静态版本说明注册表与按 `currentUser + version` 维度持久化的本地阅读状态。

### 实现结构

- 不继承 `BaseRepository`
- 静态内容源：`utils/release-notes/index.js`
- 本地状态存储键默认值：`releaseNoteReadStates`
- 聚合模型：`ReleaseNote`

### 专用方法

##### `getAllNotes()`
获取全部版本说明。
- **返回**: `Promise<ReleaseNote[]>`

说明：
- 返回顺序按 `publishedAt` 从近到远排序
- 当前版本说明唯一前台内容源固定为 `utils/release-notes/index.js`

##### `findByVersion(version)`
根据版本号查找单条版本说明。
- **参数**:
  - `version` (String)
- **返回**: `Promise<ReleaseNote | null>`

##### `getReadState(version, effectiveUserId)`
获取指定视角用户在指定版本下的提示/阅读状态。
- **参数**:
  - `version` (String)
  - `effectiveUserId` (String)
- **返回**:
  ```javascript
  {
    version: string,
    effectiveUserId: string,
    promptShownAt: number,
    readAt: number
  }
  ```

##### `saveReadState(version, effectiveUserId, patch = {})`
更新指定视角用户在指定版本下的提示/阅读状态。
- **参数**:
  - `version` (String)
  - `effectiveUserId` (String)
  - `patch` (Object)
- **返回**:
  ```javascript
  {
    success: boolean,
    state?: Object
  }
  ```

说明：
- 当前状态键格式为 `effectiveUserId::version`
- 仅维护轻量本地状态，不做云端同步
- `promptShownAt` 与 `readAt` 可独立存在，支持“稍后查看但保留未读 badge”的前台语义

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

##### getAvailableRewards(includeExamples = false, userId = null)
获取可用奖励
- **参数**:
  - `includeExamples` (Boolean) - 是否包含示例奖励
  - `userId` (String, 可选) - 用户ID
- **返回**: `Promise<Array>` - 可用的奖励列表

##### getClaimedRewards(onlyPending = false, userId = null)
获取已兑换奖励
- **参数**: `onlyPending` - 是否只获取待领取的奖励，默认false
- **返回**: `Promise<Array>` - 已兑换的奖励列表

#### 按状态查询

##### getDeliveredRewards(userId = null)
获取已领取的奖励
- **参数**: `userId` (String, 可选) - 用户ID
- **返回**: `Promise<Array>` - 已领取的奖励列表

##### getRewardsByPointsOrder(ascending = true, onlyAvailable = true, userId = null)
按星星数量排序获取奖励
- **参数**:
  - `ascending` (Boolean, 可选) - 是否升序排列，默认true
  - `onlyAvailable` (Boolean, 可选) - 只获取可兑换的奖励，默认true
  - `userId` (String, 可选) - 用户ID
- **返回**: `Promise<Array>` - 排序后的奖励列表

##### getExchangeableRewards(availablePoints, userId = null)
获取可兑换的奖励
- **参数**:
  - `availablePoints` (Number) - 可用的星星数
  - `userId` (String, 可选) - 用户ID
- **返回**: `Promise<Array>` - 可兑换的奖励列表

#### 兑换管理

##### claimReward(rewardId)
兑换奖励
- **参数**: `rewardId` (String) - 奖励ID
- **返回**: `Promise<Reward|null>` - 兑换后的奖励或null

##### deliverReward(rewardId)
标记奖励为已领取
- **参数**: `rewardId` (String) - 奖励ID
- **返回**: `Promise<Reward|null>` - 更新后的奖励或null

##### unclaimReward(rewardId)
取消奖励兑换
- **参数**: `rewardId` (String) - 奖励ID
- **返回**: `Promise<Reward|null>` - 更新后的奖励或null

#### 状态管理

##### setRewardEnabled(rewardId, enable)
启用/禁用奖励
- **参数**:
  - `rewardId` (String) - 奖励ID
  - `enable` (Boolean) - 是否启用
- **返回**: `Promise<Reward|null>` - 更新后的奖励或null

#### 初始化方法

##### getDefaultRewards()
获取默认奖励
- **返回**: `Promise<Array>` - 默认奖励列表

##### initializeDefaultRewards()
初始化默认奖励
- **返回**: `Promise<Array>` - 保存的默认奖励列表

##### ensureExampleRewardsEnabled()
确保示例奖励启用
- **返回**: `Promise<Number>` - 更新的奖励数量

```

获取热门奖励（按兑换次数排序）

```

#### 状态更新

更新奖励状态

```

更新库存数量

```

减少库存（兑换时调用）

```

增加库存（取消兑换时调用）

```

## MessageRepository - 消息仓储

管理消息数据的持久化，提供消息类型、状态和优先级相关的查询。

### 继承结构

### 专用查询方法

#### 按用户查询

获取用户所有消息

```

获取用户最近的消息

```

#### 按状态查询

##### getUnreadMessages(userId = null)
获取未读消息
- **参数**: `userId` (String, 可选) - 用户ID
- **返回**: `Promise<Array>` - 未读消息列表

##### getUnreadCount(userId = null)
获取未读消息数量
- **参数**: `userId` (String, 可选) - 用户ID
- **返回**: `Promise<Number>` - 未读消息数量

##### markAsRead(messageId)
标记消息为已读
- **参数**: `messageId` (String) - 消息ID
- **返回**: `Promise<Object|null>` - 更新后的消息对象或null

#### 按类型查询

##### getMessagesByType(type, userId = null)
按消息类型查询
- **参数**:
  - `type` (String) - 消息类型
  - `userId` (String, 可选) - 用户ID
- **返回**: `Promise<Array>` - 指定类型的消息列表

##### getMessagesByNotificationType(notificationType, userId = null)
按通知子类型查询
- **参数**:
  - `notificationType` (String) - 通知子类型
  - `userId` (String, 可选) - 用户ID
- **返回**: `Promise<Array>` - 指定通知类型的消息列表

#### 按优先级查询

##### getHighPriorityMessages(userId = null)
获取高优先级未读消息
- **参数**: `userId` (String, 可选) - 用户ID
- **返回**: `Promise<Array>` - 高优先级未读消息列表

#### 统计查询

##### getMessageStats()
获取消息统计信息
- **返回**: `Promise<Object>` - 消息统计数据

```

#### 批量状态更新

##### markAllAsRead(userId = null)
标记所有消息为已读
- **参数**: `userId` (String, 可选) - 用户ID
- **返回**: `Promise<Number>` - 更新的消息数量

##### markManyAsRead(messageIds)
批量标记消息为已读
- **参数**: `messageIds` (Array) - 消息ID数组
- **返回**: `Promise<Number>` - 成功标记的消息数量

---

**最后更新**：2026-03-11
**维护者**：项目维护团队
