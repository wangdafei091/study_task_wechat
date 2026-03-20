# 服务指南

本文档介绍了学习任务微信小程序服务层API，包括所有核心服务的功能、方法签名和使用说明。

---

## 服务架构概览

### 服务层职责
- **业务用例实现**：协调领域模型完成复杂业务流程
- **跨实体操作**：处理涉及多个领域实体的操作
- **事件发布**：在业务操作完成后发布领域事件
- **数据一致性**：确保跨仓储操作的数据一致性

### 服务访问方式
所有服务通过ServiceManager获取实例：

```javascript
const serviceManager = getApp().serviceManager;

// 获取服务实例
const taskService = serviceManager.get('taskService');
const starService = serviceManager.get('starService');
const rewardService = serviceManager.get('rewardService');
const messageService = serviceManager.get('messageService');
const userService = serviceManager.get('userService');
const validationService = serviceManager.get('validationService');
const configService = serviceManager.get('configService');
```

---

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

##### `getAllTasks(userId = null)`
获取所有任务列表
- **参数**: `userId` - 可选的用户ID，不传则获取所有用户的任务
- **返回**: `{ success: boolean, tasks: Task[], message?: string }`

##### `getTaskById(taskId, userId = null)`
根据ID获取特定任务
- **参数**: `taskId` - 任务ID, `userId` - 可选的用户ID
- **返回**: `{ success: boolean, task?: Task, message?: string }`

##### `createTask(taskData)`
创建新任务
- **参数**:
  ```javascript
  {
    title: string,           // 任务标题
    description?: string,     // 任务描述
    type: 'study' | 'habit' | 'interest',
    date: string,            // 任务日期 YYYY-MM-DD
    startTime?: string,       // 开始时间 HH:mm
    endTime?: string,         // 结束时间 HH:mm
    points: number,          // 奖励星星数
    pointsExpiry: string,     // 有效期类型
    isRequired: boolean,      // 是否必做任务
    repeat?: Object          // 重复配置
  }
  ```
- **返回**: `{ success: boolean, task?: Task, message?: string }`

##### `updateTask(taskId, changes, userId = null)`
更新任务信息
- **参数**: `taskId` - 任务ID, `changes` - 更新数据对象, `userId` - 可选的用户ID
- **返回**: `{ success: boolean, task?: Task, message?: string }`

##### `deleteTask(taskId, userId = null, suppressMessage = false)`
删除任务
- **参数**: `taskId` - 任务ID, `userId` - 可选的用户ID, `suppressMessage` - 是否禁用消息推送，默认false
- **返回**: `{ success: boolean, message?: string }`

---

#### 状态管理

##### `completeTask(taskId, userId = null)`
完成任务（核心业务流程）
- **参数**: `taskId` - 任务ID, `userId` - 可选的用户ID
- **返回**: `{ success: boolean, task?: Task, starReward?: number, message?: string }`
- **内部流程**：验证状态 → 更新为完成 → 计算星星 → 发布事件 → 创建消息

##### `resetTask(taskId, userId = null)`
重置任务状态
- **参数**: `taskId` - 任务ID, `userId` - 可选的用户ID
- **返回**: `{ success: boolean, task?: Task, starDeduction?: number, message?: string }`

##### `updateTaskStatus(taskId, status, userId = null)`
更新任务状态
- **参数**: `taskId` - 任务ID, `status` - 状态(0=未完成, 1=已完成), `userId` - 可选的用户ID
- **返回**: `{ success: boolean, task?: Task, message?: string }`

---

#### 必做任务功能

##### `markTaskAsRequired(taskId, userId = null)`
标记任务为必做
- **参数**: `taskId` - 任务ID, `userId` - 可选的用户ID
- **返回**: `{ success: boolean, task?: Task, message?: string }`

##### `unmarkTaskAsRequired(taskId, userId = null)`
取消必做任务标记
- **参数**: `taskId` - 任务ID, `userId` - 可选的用户ID
- **返回**: `{ success: boolean, task?: Task, message?: string }`

##### `checkRequiredTasks()`
检查必做任务惩罚状态（兼容方法，内部调用checkTasksStatus）
- **返回**: `{ success: boolean, tasks: Task[], message?: string }`

##### `handleRequiredTaskPenalty(task)`
应用必做任务惩罚
- **参数**: `task` - 任务对象
- **返回**: `{ success: boolean, message?: string }`

---

#### 任务查询

##### `getTasksByDate(date, userId = null)`
获取指定日期的任务
- **参数**: `date` - 日期字符串, `userId` - 可选的用户ID
- **返回**: `{ success: boolean, tasks: Task[], message?: string }`

##### `getTodayTasks(userId = null)`
获取今日任务
- **参数**: `userId` - 可选的用户ID
- **返回**: `{ success: boolean, tasks: Task[], message?: string }`

##### `checkUpcomingTasks()`
检查即将开始的任务
- **返回**: `{ success: boolean, tasks: Task[], message?: string }`

##### `checkTasksStatus()`
检查所有任务状态（应用启动时调用）
- **返回**: `{ success: boolean, message?: string }`

##### `getExpiredIncompleteTasks(userId = null)`
获取已过期且未完成的任务
- **参数**: `userId` - 可选的用户ID
- **返回**: `{ success: boolean, tasks: Task[], message?: string }`

##### `calculateTaskProgress(tasks = null)`
计算任务进度
- **参数**: `tasks` - 可选的任务列表，不传则自动获取今日任务
- **返回**:
  ```javascript
  {
    total: number,
    completed: number,
    rate: number
  }
  ```

---

#### 任务统计

##### `getTaskStatistics(dateRange = {})`
获取任务统计数据
- **参数**: `dateRange` - 可选的日期范围对象 `{ startDate, endDate }`
- **返回**:
  ```javascript
  {
    totalTasks: number,
    completedTasks: number,
    completionRate: number,
    byType: { study: number, habit: number, interest: number }
  }
  ```

---

#### 云端同步（M07 新增）

##### `getTasksByScope(options)`
按作用域获取任务（分析页专用，不修改 `getAllTasks` 默认语义）
- **参数**:
  ```javascript
  {
    scope?: 'family',   // 家长看全家孩子任务（需云端支持）
    userId?: string     // 孩子看自己的任务
  }
  ```
- **返回**: `Task[]`
- **说明**: `scope=family` 时调用云端 `GET /api/tasks?scope=family`，结果不写入本地仓储（维护 M06 隔离）

##### `getTasksByDateRange(startDate, endDate, userId = null, options = {})`
按日期范围批量获取任务（分析页月视图专用，避免逐日请求风暴）
- **参数**: `startDate`/`endDate` - `YYYY-MM-DD` 格式, `userId` - 可选用户 ID, `options` - 作用域选项（同 `getTasksByScope`）
- **返回**: `Task[]`

##### `_syncUpdateToCloud(task)` *(私有)*
任务编辑后异步同步到云端，接收完整 Task 对象，内部提取白名单字段发送 PUT，失败仅记 warn 日志，不影响本地结果

##### `_syncDeleteToCloud(taskId)` *(私有)*
任务删除后异步同步到云端；HTTP 404 视为成功（本地重复实例从未上云）

##### `_syncStatusToCloud(task)` *(私有)*
完成/重置状态异步同步到云端，接收完整 Task 对象，只发送 `{ status: task.status }`（数字 `0`/`1`）

---

## StarService - 星星积分服务

星星服务负责星星的获取、消费、过期管理等核心积分逻辑。

### 核心功能
- 星星获取和消费（FIFO策略）
- 有效期管理和分组
- 过期处理和预测
- 数据一致性维护
- 统计分析

### API 方法

#### 星星操作

##### `getTotalStars(userId = null)`
获取用户总星星数量
- **参数**: `userId` - 可选的用户ID，不传则获取所有用户的星星
- **返回**: `Promise<Number>` - 星星总数量

##### `addStars(userId, amount, expiryType, sourceId, description)`
添加星星（奖励）
- **参数**:
  - `userId` - 用户ID
  - `amount` - 星星数量
  - `expiryType` - 有效期类型：`'permanent'` | `'week'` | `'month'` | `'quarter'` | `'half_year'` | `'year'`
  - `sourceId` - 来源ID（如任务ID）
  - `description` - 描述
- **返回**: `{ success: boolean, message?: string }`

##### `consumeStars(userId, amount, sourceId, description)`
消费星星（FIFO策略：先过期先使用）
- **参数**:
  - `userId` - 用户ID
  - `amount` - 消费数量
  - `sourceId` - 来源ID（如奖励ID）
  - `description` - 描述
- **返回**: `{ success: boolean, consumed: number, remaining: number, message?: string }`

---

#### 过期管理

##### `processExpiredStars()`
处理过期星星（定时任务调用）
- **返回**: `{ success: boolean, expiredAmount: number, affectedUsers: string[], message?: string }`

##### `calculatePendingExpiry()`
计算即将过期的星星
- **返回**: `Array<{ userId, expiryDate, amount, expiryType }>`

##### `getExpiryForecast(userId, days)`
获取星星过期预测
- **参数**: `userId` - 用户ID, `days` - 预测天数
- **返回**: `Array<{ date: string, expiringAmount: number }>`

##### `protectRewardsByExpiry(expiringStars, userId)`
根据即将过期的星星保护奖励
- **参数**: `expiringStars` - 即将过期的星星数组, `userId` - 用户ID
- **返回**: `{ success: boolean, message?: string }`

---

#### 数据维护

##### `checkDataConsistency(userId)`
检查数据一致性（分组总数 vs 存储总数）
- **参数**: `userId` - 用户ID
- **返回**:
  ```javascript
  {
    isConsistent: boolean,
    totalFromGroups: number,
    storedTotal: number,
    difference: number
  }
  ```

##### `repairDataConsistency(userId)`
修复数据不一致
- **参数**: `userId` - 用户ID
- **返回**: `{ success: boolean, repairedAmount: number, message?: string }`

---

#### 统计分析

##### `getStarStatistics(userId, dateRange)`
获取星星统计数据
- **参数**: `userId` - 用户ID, `dateRange` - `{ startDate, endDate }`
- **返回**:
  ```javascript
  {
    totalEarned: number,
    totalConsumed: number,
    totalExpired: number,
    currentBalance: number,
    dailyStats: Array<{date: string, earned: number, consumed: number}>
  }
  ```

##### `getStarRecords(userId, filters?)`
获取星星记录
- **参数**: `userId` - 用户ID, `filters?` - `{ type, source, dateRange }`
- **返回**: `{ success: boolean, records: StarRecord[], message?: string }`

---

## RewardService - 奖励管理服务

奖励服务管理奖励系统，包括奖励创建、兑换、状态管理等功能。

### 核心功能
- 奖励CRUD操作
- 奖励兑换流程
- 库存管理
- 星星过期保护机制
- 兑换记录跟踪

### API 方法

#### 奖励管理

##### `getAllRewards(userId = null)`
获取所有奖励列表
- **参数**: `userId` - 可选的用户ID，不传则获取所有用户的奖励
- **返回**: `{ success: boolean, rewards: Reward[], message?: string }`

##### `createReward(rewardData)`
创建新奖励
- **参数**:
  ```javascript
  {
    name: string,
    description: string,
    cost: number,
    type: 'item' | 'privilege' | 'activity',
    icon?: string,
    customReward?: boolean
  }
  ```
- **返回**: `{ success: boolean, reward?: Reward, message?: string }`

##### `updateReward(rewardId, rewardData)`
更新奖励信息
- **参数**: `rewardId` - 奖励ID, `rewardData` - 更新数据对象
- **返回**: `{ success: boolean, reward?: Reward, message?: string }`

##### `deleteReward(rewardId)`
删除奖励
- **参数**: `rewardId` - 奖励ID
- **返回**: `{ success: boolean, message?: string }`

---

#### 奖励兑换

##### `getAvailableRewards(includeClaimed = false, includeExamples = false, userId = null)`
获取可兑换奖励
- **参数**:
  - `includeClaimed` - 是否包含已兑换奖励，默认false
  - `includeExamples` - 是否包含示例奖励，默认false
  - `userId` - 用户ID，可选
- **返回**: `{ success: boolean, rewards: Reward[], message?: string }`

##### `exchangeReward(rewardId, userId = null)`
兑换奖励
- **参数**: `rewardId` - 奖励ID, `userId` - 用户ID（可选，默认使用当前用户）
- **返回**: `{ success: boolean, starCost: number, message?: string }`
- **内部流程**：验证库存 → 消费星星 → 标记已兑换 → 发布事件 → 创建消息

##### `cancelRewardExchange(rewardId)`
取消兑换
- **参数**: `rewardId` - 奖励ID
- **返回**: `{ success: boolean, message?: string }`

##### `markRewardAsDelivered(rewardId)`
标记奖励为已领取
- **参数**: `rewardId` - 奖励ID
- **返回**: `{ success: boolean, message?: string }`
- **注意**: 此方法已废弃，用户兑换时直接设置为delivered状态

---

#### 奖励状态管理

##### `toggleRewardStatus(rewardId, enabled)`
切换奖励启用/禁用状态
- **参数**: `rewardId` - 奖励ID, `enabled` - 是否启用
- **返回**: `{ success: boolean, message?: string }`

---

#### 其他方法

##### `getLastExchangeTime()`
获取最后一次兑换时间（当前 loginUser）
- **返回**: `Promise<number>` - 时间戳

##### `getLastExchangeTimeByUser(userId)` *(M07 新增)*
获取指定用户最后一次兑换时间
- **参数**: `userId` - 用户 ID
- **返回**: `Promise<number|null>` - 时间戳；无记录或出错时返回 `null`
- **说明**: 用于首页进度条按 `loginUserId` 计算兑换保护边界

---

## MessageService - 消息通知服务

消息服务处理系统消息的创建、查询、标记已读等功能。

### 核心功能
- 消息CRUD操作
- 消息类型管理
- 批量操作
- 过期处理
- 消息统计

### API 方法

#### 消息管理

##### `createSystemMessage(content, type = 'system', options = {})`
创建系统消息
- **参数**:
  - `content` - 消息内容字符串
  - `type` - 消息类型（默认 'system'）
  - `options` - 可选配置 `{ title, priority, userId, subType, expiryDate }`
- **返回**: `{ success: boolean, message?: Message, messageId?: string }`

##### `deleteMessage(messageId)`
删除消息
- **参数**: `messageId` - 消息ID
- **返回**: `{ success: boolean, message?: string }`

---

#### 消息查询

##### `getAllMessages()`
获取所有消息列表
- **返回**: `{ success: boolean, messages: Message[], total?: number, message?: string }`

##### `getUnreadCount()`
获取未读消息数量
- **返回**: `{ success: boolean, count: number, message?: string }`

---

#### 消息操作

##### `markMessageAsRead(messageId)`
标记消息为已读
- **参数**: `messageId` - 消息ID
- **返回**: `{ success: boolean, message?: string }`

##### `markAllMessagesAsRead()`
标记所有消息为已读
- **返回**: `{ success: boolean, affectedCount: number, message?: string }`


---

#### 消息清理

##### `_cleanExpiredMessages(expiryDays = 30)`
清理过期消息（内部方法）
- **参数**: `expiryDays` - 过期天数，默认30天
- **返回**: `Promise<boolean>`

---

## ValidationService - 表单验证服务

验证服务提供统一的表单验证逻辑，支持多种验证规则。

### 核心功能
- 任务数据验证
- 奖励数据验证
- 用户数据验证
- 自定义验证规则
- 错误提示管理

### API 方法

##### `validateTaskForm(taskData)`
验证任务表单数据
- **参数**: `taskData` - 任务数据对象
- **返回**: `{ valid: boolean, errorMsg: string, data?: Object }`

##### `validateRewardForm(rewardData)`
验证奖励表单数据
- **参数**: `rewardData` - 奖励数据对象
- **返回**: `{ valid: boolean, errorMsg: string, data?: Object }`

##### `validateUserForm(userData)`
验证用户表单数据
- **参数**: `userData` - 用户数据对象
- **返回**: `{ valid: boolean, errorMsg: string, data?: Object }`

##### `validateField(fieldConfig, value, formData)`
验证单个字段
- **参数**:
  - `fieldConfig` - 字段配置对象
  - `value` - 字段值
  - `formData` - 完整表单数据（用于关联验证）
- **返回**: `{ valid: boolean, errorMsg: string }`

---

## UserService - 用户管理服务

用户服务管理用户账户、角色切换、家庭成员缓存等功能。M6 起引入 `loginUser`（设备拥有者）与 `currentUser`（当前数据视角）双轨模型。

### 核心概念（M6）

| 字段 | 含义 | 生命周期 |
|------|------|---------|
| `loginUser` | 设备登录者（JWT 持有者），决定权限和功能可见性 | 应用启动后不变 |
| `currentUser` | 当前数据视角，家长可切换到孩子 | 随用户切换变化 |

- **`isReadonlyView`**（首页计算属性）：`loginUser.role === 'child' || loginUser.userId !== currentUser.userId`。只要在孩子视角下（无论哪种原因），管理类入口均隐藏。
- **任务创建归属**：家长在孩子视角创建任务时，任务通过 `targetUserId` 正确归属到孩子。

### 核心功能
- 登录用户（loginUser）初始化与维护
- 家庭成员缓存（userCache）加载与刷新
- 用户视角切换（currentUser）及会话恢复
- 基于角色的用户列表过滤

### API 方法

#### 登录用户

##### `getLoginUser()`
获取设备登录用户（设备拥有者，生命周期内不变）
- **返回**: `User | null`

##### `getLoginUserId()`
获取登录用户 ID
- **返回**: `string | null`

---

#### 当前视角用户

##### `getCurrentUser()`
获取当前视角用户（家长可切换到孩子）
- **返回**: `User`

##### `getCurrentUserId()`
获取当前视角用户 ID
- **返回**: `string`

##### `getCurrentUserRole()`
获取当前视角用户角色
- **返回**: `'parent' | 'child'`

---

#### 用户列表与查找

##### `getAllUsers()`
获取可用用户列表（家庭感知）
- **返回**: `User[]`
- **说明**：
  - 孩子设备（`loginUser.role === 'child'`）：只返回自身
  - 家长设备：返回 loginUser + 家庭中所有孩子，不含其他家长

##### `getUserById(userId)`
从缓存获取用户（同步）
- **参数**: `userId` (string)
- **返回**: `User | null`

##### `getUserByIdAsync(userId)`
获取用户，缓存未命中时从 API 拉取（异步）
- **参数**: `userId` (string)
- **返回**: `Promise<User | null>`

---

#### 用户切换

##### `switchToUser(userId)`
切换当前视角到指定用户
- **参数**: `userId` (string)
- **返回**: `Promise<{ success: boolean, user?: User, message?: string }>`
- **限制**：孩子设备（`loginUser.role === 'child'`）禁止切换；家长只能切换到孩子，不能切换到其他家长

---

#### 家庭成员

##### `loadFamilyMembers()`
从云端加载家庭成员并更新本地缓存
- **返回**: `Promise<boolean>`
- **说明**：登录用户无家庭（`loginUser.familyId` 为 null）时静默跳过，失败时缓存保留仅含 loginUser

##### `createFamily(name)`
创建家庭（M6新增）
- **参数**: `name` (string) - 家庭名称
- **返回**: `Promise<{ success: boolean, familyId?: string, message?: string }>`
- **说明**：创建成功后若后端返回新 token，自动保存并重新初始化 UserService

##### `joinFamily(inviteCode)`
通过邀请码加入家庭（M6新增）
- **参数**: `inviteCode` (string) - 邀请码
- **返回**: `Promise<{ success: boolean, message?: string }>`
- **说明**：加入成功后若后端返回新 token，自动保存并重新初始化 UserService

##### `getFamilyInfo()`
获取当前家庭信息（M6新增）
- **返回**: `Promise<Object | null>`
- **说明**：失败时静默返回 null

##### `refreshInviteCode(role)`
刷新家庭邀请码（M6新增）
- **参数**: `role` ('parent' | 'child') - 目标角色
- **返回**: `Promise<Object>` - 包含新邀请码的响应对象
- **说明**：失败时直接抛出异常，调用方需自行捕获

##### `createVirtualMember(name)`
创建虚拟成员（场景A共享设备，无独立微信账号的孩子）（M6新增）
- **参数**: `name` (string) - 成员名称
- **返回**: `Promise<{ success: boolean, member?: Object, message?: string }>`
- **说明**：创建成功后自动调用 `loadFamilyMembers()` 刷新缓存

##### `deleteFamilyMember(userId)`
软删除家庭成员（仅虚拟成员）（M6新增）
- **参数**: `userId` (string) - 目标用户ID
- **返回**: `Promise<{ success: boolean, message?: string }>`
- **说明**：删除成功后自动调用 `loadFamilyMembers()` 刷新缓存

##### `updateNickname(userId, nickname)`
更新成员昵称（M6新增）
- **参数**: `userId` (string) - 目标用户ID, `nickname` (string) - 新昵称
- **返回**: `Promise<{ success: boolean, message?: string }>`
- **说明**：更新成功后直接同步 userCache 和 currentUser/loginUser，不重新拉取

---

## ConfigService - 配置管理服务

配置服务管理系统配置和用户偏好设置。

### 核心功能
- 系统配置管理
- 用户偏好设置
- 配置缓存和同步
- 配置变更通知

### API 方法

#### 系统配置

##### `get(key, defaultValue = null)`
获取配置值
- **参数**: `key` - 配置键, `defaultValue` - 可选默认值
- **返回**: 配置值

##### `set(key, value)`
设置配置值
- **参数**: `key` - 配置键, `value` - 配置值
- **返回**: `boolean` - 是否成功

##### `remove(key)`
删除配置
- **参数**: `key` - 配置键
- **返回**: `boolean` - 是否成功

---

#### 用户偏好

##### `getUserPreference(key, defaultValue = null)`
获取用户偏好
- **参数**: `key` - 偏好键, `defaultValue` - 可选默认值
- **返回**: 偏好值

##### `setUserPreference(key, value)`
设置用户偏好
- **参数**: `key` - 偏好键, `value` - 偏好值
- **返回**: `boolean` - 是否成功

##### `getBatch(keys)`
批量获取配置
- **参数**: `keys` (Array) - 配置键数组
- **返回**: `Object` - 配置对象

##### `setBatch(configs)`
批量设置配置
- **参数**: `configs` (Object) - 配置对象
- **返回**: `boolean` - 是否全部成功

---

#### 批量操作

##### `clearAll()`
清除所有配置（谨慎使用）
- **返回**: `Promise<boolean>` - 是否成功

---

## AnalyticsService - 数据分析服务

数据分析服务提供任务和星星数据的统计分析功能。

### 核心功能
- 任务统计分析
- 星星趋势分析
- 数据可视化支持
- 报表生成

### API 方法

##### `getTaskAnalytics(userId, dateRange)`
获取任务分析数据
- **参数**: `userId` - 用户ID, `dateRange` - `{ startDate, endDate }`
- **返回**:
  ```javascript
  {
    totalTasks: number,
    completedTasks: number,
    completionRate: number,
    byType: { study: number, habit: number, interest: number },
    byDate: Array<{date, completed, total}>
  }
  ```

##### `getStarAnalytics(userId, dateRange)`
获取星星分析数据
- **参数**: `userId` - 用户ID, `dateRange` - `{ startDate, endDate }`
- **返回**:
  ```javascript
  {
    totalEarned: number,
    totalConsumed: number,
    balanceChange: number,
    dailyData: Array<{date, earned, consumed, balance}>
  }
  ```

##### `getCompletionTrend(userId, days)`
获取完成任务趋势
- **参数**: `userId` - 用户ID, `days` - 统计天数
- **返回**: `Array<{ date, completedRate, streak }>`

---

## 服务集成示例

### 典型业务流程

```javascript
// 任务完成 → 奖励星星 → 兑换奖励流程
async function completeTaskAndClaimReward(taskId) {
  const serviceManager = getApp().serviceManager;
  const taskService = serviceManager.get('taskService');
  const starService = serviceManager.get('starService');
  const rewardService = serviceManager.get('rewardService');

  // 1. 完成任务
  const completeResult = await taskService.completeTask(taskId, 'child');
  if (!completeResult.success) {
    return { success: false, message: completeResult.message };
  }

  // 2. 检查星星余额
  const balanceResult = await starService.getStarBalance('child');
  const balance = balanceResult.balance;

  // 3. 兑换奖励（如果余额足够）
  if (balance >= 50) {
    const rewards = await rewardService.getAvailableRewards('child');
    if (rewards.success && rewards.rewards.length > 0) {
      const affordable = rewards.rewards.filter(r => r.cost <= balance);
      if (affordable.length > 0) {
        await rewardService.claimReward(affordable[0].id, 'child');
      }
    }
  }

  return { success: true };
}
```

---

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
      logger.info('Page', '任务创建成功', result.task);
    } else {
      logger.warn('Page', '任务创建失败', result.message);
      wx.showToast({ title: result.message, icon: 'error' });
    }
  } catch (error) {
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

    eventBus.on('task:completed', this.handleTaskCompleted.bind(this));
    eventBus.on('reward:claimed', this.handleRewardClaimed.bind(this));
  },

  onUnload() {
    const eventBus = getApp().eventBus;

    eventBus.off('task:completed', this.handleTaskCompleted);
    eventBus.off('reward:claimed', this.handleRewardClaimed);
  },

  handleTaskCompleted(event) {
    logger.info('Page', '收到任务完成事件', event);
    this.refreshTaskList();
  }
});
```

### 4. 服务间协作

```javascript
// 多个服务协作完成业务流程
async function complexBusinessFlow() {
  const sm = getApp().serviceManager;

  // 服务间通过EventBus松耦合通信
  const taskService = sm.get('taskService');
  const starService = sm.get('starService');

  // TaskService完成时会发布事件
  await taskService.completeTask(taskId, userId);

  // StarService监听事件并响应（已在内部实现）
  // 不需要在这里手动调用
}
```

---

## 服务测试

### 测试文件

所有核心服务都有对应的单元测试文件，测试文件位于 `test/services/` 目录：

| 服务 | 测试文件 | 测试用例 | 覆盖率 |
|------|---------|---------|--------|
| **TaskService** | test/services/task-service.test.js | 61 个 | 54.53% |
| **StarService** | test/services/star-service.test.js | 65 个 | 23.61% |
| **RewardService** | test/services/reward-service.test.js | 56 个 | 79.08% |
| **MessageService** | test/services/message-service.test.js | 49 个 | 58.31% |
| **UserService** | test/services/user-service.test.js | 48 个 | - |
| **ValidationService** | test/services/validation-service.test.js | 60 个 | - |

### 运行测试

```bash
# 运行前端单元测试（稳定质量闸门）
npm test

# 运行特定服务测试
npm run test:services

# 运行单个服务测试
npm test test/services/task-service.test.js

# 生成覆盖率报告
npm run test:coverage
```

### 测试覆盖情况

**总体覆盖率**：
- 测试套件：9 个
- 测试用例：399 个（1221个通过，部分失败）
- 整体覆盖率：30.59% 语句
- 执行时间：约1.5秒

**服务覆盖详情**：

| 指标 | TaskService | StarService | RewardService | MessageService |
|------|-----------|-----------|--------------|--------------|
| **语句覆盖率** | 54.53% | 23.61% | 79.08% | 58.31% |
| **分支覆盖率** | 55.5% | - | 73.46% | 50.88% |
| **函数覆盖率** | 59.8% | - | 86.11% | 62.5% |
| **行覆盖率** | 55.2% | - | 79.19% | 59.22% |

**新增服务测试**：
- **UserService** (48个测试用例) - 用户管理、角色切换、权限控制
- **ValidationService** (60个测试用例) - 表单验证、数据组装

### 测试覆盖范围

**TaskService 测试覆盖**：
- 初始化测试
- CRUD 操作测试
- 状态管理测试
- 必做任务管理
- 任务检查
- 进度计算
- 批量处理
- 惩罚处理
- 错误处理测试

**RewardService 测试覆盖**：
- 奖励管理测试
- 奖励状态管理测试
- 奖励查询测试
- 兑换流程测试
- 取消兑换测试
- 奖励计算测试
- 奖励复制测试
- 批量操作测试
- 辅助方法测试

**MessageService 测试覆盖**：
- 构造函数和初始化
- 消息管理 - 创建消息
- 消息管理 - 获取消息
- 状态管理 - 标记已读
- 状态管理 - 删除消息
- 批量操作
- 批量创建任务消息
- 事件处理 - 任务事件
- 事件处理 - 奖励事件
- 事件处理 - 领域模型事件
- 错误处理
- 边界条件
- 用户操作者逻辑
- 即将到期任务通知
- 消息优先级
- 事件总线集成

### Mock 策略

测试使用依赖注入和 Mock 策略：

```javascript
// Mock Repository
const taskRepository = {
  create: jest.fn().mockResolvedValue({ id: '1', title: 'test' }),
  update: jest.fn().mockResolvedValue(true),
  delete: jest.fn().mockResolvedValue(true),
  findById: jest.fn().mockResolvedValue({ id: '1', title: 'test' }),
  findAll: jest.fn().mockResolvedValue([])
};

// Mock EventBus
const eventBus = {
  publish: jest.fn()
};

// Mock Logger（已在全局设置）
jest.mock('../../utils/logger');
```

### 可测试性

所有核心服务都支持依赖注入，便于单元测试：

```javascript
// 通过构造函数注入依赖
const taskService = new TaskService({
  taskRepository: mockRepository,
  starService: mockStarService,
  eventBus: mockEventBus
});
```

---

### 云端任务服务

任务服务支持云端存储模式，可通过 `ENABLE_API` 配置开启。

#### API 配置
云端API通过 `API_CONFIG` 进行配置，详见 `utils/api-config.js`。

#### 云端存储模式
系统支持三种存储模式（优先级从高到低）：
1. **云端优先模式**（推荐）
2. **本地优先模式**（离线）
3. **本地仅用模式**（测试）

详细说明请参阅：[docs/design/milestone-05b-task-management.md](../design/milestone-05b-task-management.md)

---

**最后更新**：2026-03-11
**维护者**：项目维护团队
