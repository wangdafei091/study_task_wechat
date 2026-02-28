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

##### `getAllTasks()`
获取所有任务列表
- **返回**: `{ success: boolean, tasks: Task[], message?: string }`

##### `getTaskById(taskId)`
根据ID获取特定任务
- **参数**: `taskId` - 任务ID
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

##### `updateTask(taskId, updateData)`
更新任务信息
- **参数**: `taskId` - 任务ID, `updateData` - 更新数据对象
- **返回**: `{ success: boolean, task?: Task, message?: string }`

##### `deleteTask(taskId)`
删除任务
- **参数**: `taskId` - 任务ID
- **返回**: `{ success: boolean, message?: string }`

---

#### 状态管理

##### `completeTask(taskId, userId)`
完成任务（核心业务流程）
- **参数**: `taskId` - 任务ID, `userId` - 用户ID
- **返回**: `{ success: boolean, task?: Task, starReward?: number, message?: string }`
- **内部流程**：验证状态 → 更新为完成 → 计算星星 → 发布事件 → 创建消息

##### `resetTask(taskId, userId)`
重置任务状态
- **参数**: `taskId` - 任务ID, `userId` - 用户ID
- **返回**: `{ success: boolean, task?: Task, starDeduction?: number, message?: string }`

##### `updateTaskStatus(taskId, status, userId)`
更新任务状态
- **参数**: `taskId` - 任务ID, `status` - 状态(0=未完成, 1=已完成), `userId` - 用户ID
- **返回**: `{ success: boolean, task?: Task, message?: string }`

---

#### 必做任务功能

##### `markTaskAsRequired(taskId, userId)`
标记任务为必做
- **参数**: `taskId` - 任务ID, `userId` - 用户ID
- **返回**: `{ success: boolean, task?: Task, message?: string }`

##### `unmarkTaskAsRequired(taskId, userId)`
取消必做任务标记
- **参数**: `taskId` - 任务ID, `userId` - 用户ID
- **返回**: `{ success: boolean, task?: Task, message?: string }`

##### `checkRequiredTasks(date, userId)`
检查指定日期的必做任务惩罚状态
- **参数**: `date` - 日期字符串, `userId` - 用户ID
- **返回**: `{ success: boolean, tasks: Task[], message?: string }`

##### `handleRequiredTaskPenalty(taskId)`
应用必做任务惩罚
- **参数**: `taskId` - 任务ID
- **返回**: `{ success: boolean, message?: string }`

---

#### 任务查询

##### `getTasksByDate(date, userId)`
获取指定日期的任务
- **参数**: `date` - 日期字符串, `userId` - 用户ID
- **返回**: `{ success: boolean, tasks: Task[], message?: string }`

##### `getTodayTasks(userId)`
获取今日任务
- **参数**: `userId` - 用户ID
- **返回**: `{ success: boolean, tasks: Task[], message?: string }`

##### `getUpcomingTasks(userId)`
获取即将开始的任务
- **参数**: `userId` - 用户ID
- **返回**: `{ success: boolean, tasks: Task[], message?: string }`

##### `checkTasksStatus()`
检查所有任务状态（应用启动时调用）
- **返回**: `{ success: boolean, message?: string }`

##### `getExpiredIncompleteTasks(userId)`
获取已过期且未完成的任务
- **参数**: `userId` - 用户ID
- **返回**: `{ success: boolean, tasks: Task[], message?: string }`

##### `calculateTaskProgress(date, userId)`
计算指定日期的任务进度
- **参数**: `date` - 日期字符串, `userId` - 用户ID
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

##### `getTaskStatistics(date, userId)`
获取任务统计数据
- **参数**: `date` - 日期字符串, `userId` - 用户ID
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

##### `getStarBalance(userId)`
获取用户当前星星余额
- **参数**: `userId` - 用户ID
- **返回**: `{ success: boolean, balance: number, message?: string }`

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

##### `getAllRewards(userId)`
获取所有奖励列表
- **参数**: `userId` - 用户ID
- **返回**: `{ success: boolean, rewards: Reward[], message?: string }`

##### `getRewardById(rewardId)`
根据ID获取奖励
- **参数**: `rewardId` - 奖励ID
- **返回**: `{ success: boolean, reward?: Reward, message?: string }`

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

##### `updateReward(rewardId, updateData)`
更新奖励信息
- **参数**: `rewardId` - 奖励ID, `updateData` - 更新数据对象
- **返回**: `{ success: boolean, reward?: Reward, message?: string }`

##### `deleteReward(rewardId)`
删除奖励
- **参数**: `rewardId` - 奖励ID
- **返回**: `{ success: boolean, message?: string }`

---

#### 奖励兑换

##### `getAvailableRewards(userId)`
获取可兑换奖励
- **参数**: `userId` - 用户ID
- **返回**: `{ success: boolean, rewards: Reward[], message?: string }`

##### `claimReward(rewardId, userId)`
兑换奖励
- **参数**: `rewardId` - 奖励ID, `userId` - 用户ID
- **返回**: `{ success: boolean, starCost: number, message?: string }`
- **内部流程**：验证库存 → 消费星星 → 标记已兑换 → 发布事件 → 创建消息

##### `unclaimReward(rewardId, userId)`
取消兑换
- **参数**: `rewardId` - 奖励ID, `userId` - 用户ID
- **返回**: `{ success: boolean, message?: string }`

##### `deliverReward(rewardId, userId)`
标记奖励为已领取
- **参数**: `rewardId` - 奖励ID, `userId` - 用户ID
- **返回**: `{ success: boolean, message?: string }`

---

#### 奖励状态管理

##### `enableReward(rewardId)`
启用奖励
- **参数**: `rewardId` - 奖励ID
- **返回**: `{ success: boolean, message?: string }`

##### `disableReward(rewardId)`
禁用奖励
- **参数**: `rewardId` - 奖励ID
- **返回**: `{ success: boolean, message?: string }`

##### `initializeDefaultRewards()`
初始化默认奖励
- **返回**: `{ success: boolean, initializedCount: number, message?: string }`

---

#### 兑换记录

##### `getClaimRecords(userId, filters?)`
获取兑换记录
- **参数**: `userId` - 用户ID, `filters?` - `{ startDate, endDate, status }`
- **返回**: `{ success: boolean, records: Array, message?: string }`

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

##### `createMessage(messageData)`
创建新消息
- **参数**:
  ```javascript
  {
    userId: string,
    type: 'system' | 'task' | 'reward' | 'warning',
    subType?: string,
    title: string,
    content: string,
    priority?: 'high' | 'normal' | 'low',
    expiryDate?: string
  }
  ```
- **返回**: `{ success: boolean, message?: Message, messageId?: string }`

##### `getMessageById(messageId)`
根据ID获取消息
- **参数**: `messageId` - 消息ID
- **返回**: `{ success: boolean, message?: Message, content?: string }`

##### `updateMessage(messageId, updateData)`
更新消息
- **参数**: `messageId` - 消息ID, `updateData` - 更新数据对象
- **返回**: `{ success: boolean, message?: Message, messageContent?: string }`

##### `deleteMessage(messageId)`
删除消息
- **参数**: `messageId` - 消息ID
- **返回**: `{ success: boolean, message?: string }`

---

#### 消息查询

##### `getMessages(userId, filters?)`
获取消息列表
- **参数**: `userId` - 用户ID, `filters?` - `{ type, status, limit, offset }`
- **返回**: `{ success: boolean, messages: Message[], total?: number, message?: string }`

##### `getUnreadCount(userId)`
获取未读消息数量
- **参数**: `userId` - 用户ID
- **返回**: `{ success: boolean, count: number, message?: string }`

##### `getMessagesByType(userId, type)`
根据类型获取消息
- **参数**: `userId` - 用户ID, `type` - 消息类型
- **返回**: `{ success: boolean, messages: Message[], message?: string }`

---

#### 消息操作

##### `markAsRead(messageId, userId)`
标记消息为已读
- **参数**: `messageId` - 消息ID, `userId` - 用户ID
- **返回**: `{ success: boolean, message?: string }`

##### `markAllAsRead(userId)`
标记所有消息为已读
- **参数**: `userId` - 用户ID
- **返回**: `{ success: boolean, affectedCount: number, message?: string }`

##### `batchCreateMessages(messages, userId)`
批量创建消息
- **参数**: `messages` - 消息数组, `userId` - 用户ID
- **返回**: `{ success: boolean, createdCount: number, messageIds: string[], message?: string }`

---

#### 消息清理

##### `cleanExpiredMessages(userId)`
清理过期消息
- **参数**: `userId` - 用户ID
- **返回**: `{ success: boolean, deletedCount: number, message?: string }`

##### `cleanOldMessages(userId, days)`
清理指定天数之前的消息
- **参数**: `userId` - 用户ID, `days` - 天数
- **返回**: `{ success: boolean, deletedCount: number, message?: string }`

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

##### `validateTask(taskData)`
验证任务数据
- **参数**: `taskData` - 任务数据对象
- **返回**: `{ isValid: boolean, errors: Array<{field, message}> }`

##### `validateReward(rewardData)`
验证奖励数据
- **参数**: `rewardData` - 奖励数据对象
- **返回**: `{ isValid: boolean, errors: Array<{field, message}> }`

##### `validateUser(userData)`
验证用户数据
- **参数**: `userData` - 用户数据对象
- **返回**: `{ isValid: boolean, errors: Array<{field, message}> }`

##### `validateEmail(email)`
验证邮箱格式
- **参数**: `email` - 邮箱地址
- **返回**: `{ isValid: boolean, message?: string }`

##### `validatePhoneNumber(phone)`
验证手机号格式
- **参数**: `phone` - 手机号
- **返回**: `{ isValid: boolean, message?: string }`

---

## UserService - 用户管理服务

用户服务管理用户账户、角色、权限等功能。

### 核心功能
- 用户CRUD操作
- 角色管理（家长/孩子）
- 权限控制
- 用户配置管理

### API 方法

#### 用户管理

##### `getCurrentUser()`
获取当前登录用户
- **返回**: `{ success: boolean, user?: User, message?: string }`

##### `getCurrentUserId()`
获取当前用户ID
- **返回**: `string` (用户ID) 或 `null`

##### `createUser(userData)`
创建新用户
- **参数**:
  ```javascript
  {
    name: string,
    displayName?: string,
    role: 'parent' | 'child',
    avatar?: string
  }
  ```
- **返回**: `{ success: boolean, user?: User, message?: string }`

##### `updateUser(userId, updateData)`
更新用户信息
- **参数**: `userId` - 用户ID, `updateData` - 更新数据对象
- **返回**: `{ success: boolean, user?: User, message?: string }`

---

#### 角色和权限

##### `switchRole(role)`
切换用户角色
- **参数**: `role` - 'parent' | 'child'
- **返回**: `{ success: boolean, user?: User, message?: string }`

##### `hasPermission(userId, permission)`
检查用户权限
- **参数**: `userId` - 用户ID, `permission` - 权限标识
- **返回**: `boolean`

##### `getAccessiblePages(userId)`
获取用户可访问的页面列表
- **参数**: `userId` - 用户ID
- **返回**: `Array<{ path, name, requiredRole }>`

---

#### 用户配置

##### `getUserConfig(userId, key)`
获取用户配置
- **参数**: `userId` - 用户ID, `key` - 配置键
- **返回**: `{ success: boolean, value: any, message?: string }`

##### `setUserConfig(userId, key, value)`
设置用户配置
- **参数**: `userId` - 用户ID, `key` - 配置键, `value` - 配置值
- **返回**: `{ success: boolean, message?: string }`

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

##### `getConfig(key)`
获取系统配置
- **参数**: `key` - 配置键
- **返回**: 配置值

##### `setConfig(key, value)`
设置系统配置
- **参数**: `key` - 配置键, `value` - 配置值
- **返回**: `{ success: boolean, message?: string }`

##### `getAllConfigs()`
获取所有系统配置
- **返回**: `Object` (配置对象)

---

#### 用户偏好

##### `getPreference(userId, key)`
获取用户偏好
- **参数**: `userId` - 用户ID, `key` - 偏好键
- **返回**: 偏好值

##### `setPreference(userId, key, value)`
设置用户偏好
- **参数**: `userId` - 用户ID, `key` - 偏好键, `value` - 偏好值
- **返回**: `{ success: boolean, message?: string }`

##### `getAllPreferences(userId)`
获取用户所有偏好
- **参数**: `userId` - 用户ID
- **返回**: `Object` (偏好对象)

---

#### 配置重置

##### `resetToDefaults(userId)`
重置用户配置为默认值
- **参数**: `userId` - 用户ID
- **返回**: `{ success: boolean, message?: string }`

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

**最后更新**：2026-02-28
**维护者**：项目维护团队
