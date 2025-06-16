# 工具函数使用指南

本文档介绍了项目中可用的各种工具函数和服务的用途和使用方法，基于当前的DDD架构设计，帮助开发人员快速了解和使用这些核心功能。

## 服务管理器 (ServiceManager)

`utils/service-manager.js` 是DDD架构的核心组件，提供统一的服务实例管理和依赖注入功能。

### 核心职责
- 服务生命周期管理
- 依赖注入和服务发现
- 服务实例缓存
- 初始化顺序控制

### 主要方法

```javascript
// 获取服务实例
get(serviceName)

// 初始化服务管理器
init()

// 重置服务实例
reset()
```

### 使用示例

```javascript
// 在页面中获取服务
const serviceManager = getApp().serviceManager;

// 获取任务服务
const taskService = serviceManager.get('taskService');
const starService = serviceManager.get('starService');
const rewardService = serviceManager.get('rewardService');

// 使用服务
const tasks = await taskService.getAllTasks();
const starBalance = await starService.getStarBalance('child');
```

### 可用服务列表
- `taskService` - 任务管理服务
- `starService` - 星星积分服务  
- `rewardService` - 奖励管理服务
- `messageService` - 消息通知服务
- `userService` - 用户管理服务

## 任务服务 (TaskService)

`services/task-service.js` 是任务领域的核心服务，提供完整的任务生命周期管理。

### 核心功能
- 任务CRUD操作
- 任务状态管理
- 必做任务惩罚机制
- 重复任务处理
- 事件发布机制

### 主要方法

```javascript
// 基础操作
async getAllTasks()                    // 获取所有任务
async getTaskById(taskId)             // 根据ID获取任务
async createTask(taskData)            // 创建新任务
async updateTask(taskId, updateData)  // 更新任务
async deleteTask(taskId)              // 删除任务

// 状态管理
async completeTask(taskId, userId)    // 完成任务
async resetTask(taskId, userId)       // 重置任务状态
async updateTaskStatus(taskId, status, userId) // 更新任务状态

// 特殊功能
async markTaskAsRequired(taskId, userId)      // 标记为必做任务
async unmarkTaskAsRequired(taskId, userId)    // 取消必做任务标记
async handleRequiredTaskPenalty(task)        // 处理必做任务惩罚
async checkRequiredTasks()                   // 检查必做任务状态

// 查询功能
async getTasksByDate(date)            // 获取指定日期任务
async getTasksByDateRange(startDate, endDate) // 获取日期范围内任务
async getOverdueTasks()               // 获取过期任务
async getUpcomingTasks()              // 获取即将到期任务
```

### 使用示例

```javascript
const taskService = getApp().serviceManager.get('taskService');

// 创建任务
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
if (result.success) {
  logger.info('Page', '任务创建成功', result.task);
}

// 完成任务
const completeResult = await taskService.completeTask(taskId, 'child');
if (completeResult.success) {
  logger.info('Page', '任务完成成功', completeResult.task);
}
```

## 星星服务 (StarService)

`services/star-service.js` 管理星星积分系统，实现获得、消费、过期等完整生命周期。

### 核心功能
- 星星分组管理
- FIFO消费策略
- 有效期计算
- 过期处理
- 数据一致性维护

### 主要方法

```javascript
// 星星余额管理
async getStarBalance(userId)          // 获取星星余额
async getStarGroups(userId)           // 获取星星分组
async getStarRecords(userId, options) // 获取星星记录

// 星星操作
async addStars(userId, amount, expiryType, sourceId, description) // 添加星星
async consumeStars(userId, amount, sourceId, description)         // 消费星星
async processExpiredStars()           // 处理过期星星

// 统计分析
async getStarStatistics(userId, dateRange) // 获取统计数据
async getExpiryForecast(userId, days)       // 获取过期预测
```

### 使用示例

```javascript
const starService = getApp().serviceManager.get('starService');

// 获取星星余额
const balance = await starService.getStarBalance('child');
logger.info('Page', '当前星星余额', balance);

// 添加星星（任务完成时）
const addResult = await starService.addStars(
  'child',
  10,
  'week',
  'task_123',
  '完成任务：练习钢琴'
);

// 消费星星（兑换奖励时）
const consumeResult = await starService.consumeStars(
  'child',
  25,
  'reward_456',
  '兑换奖励：看动画片'
);
```

## 奖励服务 (RewardService)

`services/reward-service.js` 管理奖励系统，包括奖励创建、兑换、状态管理等。

### 核心功能
- 奖励CRUD操作
- 兑换流程管理
- 状态流转控制
- 库存管理
- 示例奖励处理

### 主要方法

```javascript
// 基础操作
async getAllRewards()                 // 获取所有奖励
async getRewardById(rewardId)        // 根据ID获取奖励
async createReward(rewardData)       // 创建奖励
async updateReward(rewardId, changes) // 更新奖励
async deleteReward(rewardId)         // 删除奖励

// 兑换管理
async claimReward(rewardId, userId)   // 兑换奖励
async deliverReward(rewardId)        // 标记为已领取
async unclaimReward(rewardId)        // 取消兑换

// 状态管理
async enableReward(rewardId)         // 启用奖励
async disableReward(rewardId)        // 禁用奖励

// 查询功能
async getAvailableRewards()          // 获取可用奖励
async getClaimedRewards()            // 获取已兑换奖励
async getRewardHistory(userId)       // 获取兑换历史
```

### 使用示例

```javascript
const rewardService = getApp().serviceManager.get('rewardService');

// 兑换奖励
const claimResult = await rewardService.claimReward('reward_123', 'child');
if (claimResult.success) {
  logger.info('Page', '奖励兑换成功', claimResult.reward);
  // 显示成功提示
  wx.showToast({
    title: '兑换成功！',
    icon: 'success'
  });
}

// 创建奖励
const rewardData = {
  title: '看动画片30分钟',
  description: '可以选择喜欢的动画片',
  cost: 25,
  category: 'entertainment',
  totalCount: 5
};

const createResult = await rewardService.createReward(rewardData);
```

## 消息服务 (MessageService)

`services/message-service.js` 处理系统消息和通知功能。

### 核心功能
- 消息创建和管理
- 多种消息类型支持
- 已读状态管理
- 优先级处理
- 消息归档功能

### 主要方法

```javascript
// 基础操作
async getAllMessages(userId)          // 获取所有消息
async getMessageById(messageId)       // 根据ID获取消息
async createMessage(messageData)      // 创建消息
async deleteMessage(messageId)        // 删除消息

// 状态管理
async markAsRead(messageId)           // 标记为已读
async markAsUnread(messageId)         // 标记为未读
async archiveMessage(messageId)       // 归档消息

// 查询功能
async getUnreadMessages(userId)       // 获取未读消息
async getUnreadCount(userId)          // 获取未读数量
async getMessagesByType(userId, type) // 按类型获取消息

// 便捷方法
async createTaskCompletionMessage(task, userId)    // 创建任务完成消息
async createStarRewardMessage(amount, userId)      // 创建星星奖励消息
async createPenaltyMessage(task, amount, userId)   // 创建惩罚消息
async createRewardExchangeMessage(reward, userId)  // 创建奖励兑换消息
```

### 使用示例

```javascript
const messageService = getApp().serviceManager.get('messageService');

// 获取未读消息数量
const unreadCount = await messageService.getUnreadCount('child');
if (unreadCount > 0) {
  wx.showTabBarRedDot({ index: 2 });
}

// 创建系统消息
const messageData = {
  userId: 'child',
  type: 'system',
  subType: 'reminder',
  title: '任务提醒',
  content: '您有未完成的任务，请及时处理',
  priority: 'normal'
};

await messageService.createMessage(messageData);
```

## 用户服务 (UserService)

`services/user-service.js` 管理用户相关功能，支持多角色系统。

### 核心功能
- 用户角色管理
- 当前用户状态
- 用户切换功能
- 权限控制

### 主要方法

```javascript
// 用户管理
getCurrentUserId()                    // 获取当前用户ID
getCurrentUser()                      // 获取当前用户信息
switchUser(userId)                    // 切换用户
getUserRole(userId)                   // 获取用户角色

// 权限检查
canManageRewards(userId)             // 是否可管理奖励
canViewAllTasks(userId)              // 是否可查看所有任务
hasPermission(userId, permission)     // 检查权限
```

### 使用示例

```javascript
const userService = getApp().serviceManager.get('userService');

// 获取当前用户
const currentUserId = userService.getCurrentUserId();
const currentUser = userService.getCurrentUser();

// 检查权限
const canManage = userService.canManageRewards(currentUserId);
if (canManage) {
  // 显示管理界面
}
```

## 日志工具 (Logger)

`utils/logger.js` 提供统一的日志记录功能。

### 日志级别
- `info` - 一般信息
- `warn` - 警告信息
- `error` - 错误信息
- `debug` - 调试信息

### 主要方法

```javascript
logger.info(module, message, data)    // 记录信息
logger.warn(module, message, data)    // 记录警告
logger.error(module, message, data)   // 记录错误
logger.debug(module, message, data)   // 记录调试信息
```

### 使用示例

```javascript
const logger = require('../../utils/logger');

// 记录操作信息
logger.info('TaskService', '任务创建成功', { taskId: 'task_123' });

// 记录警告
logger.warn('StarService', '星星余额不足', { required: 25, available: 10 });

// 记录错误
logger.error('RewardService', '奖励兑换失败', error);
```

## 批量处理工具 (batchUtils)

`utils/batchUtils.js` 提供高效的批量数据处理功能。

### 核心功能
- 分批处理大量数据
- 进度显示
- 性能优化
- 错误处理

### 主要方法

```javascript
// 批量处理数据
batchProcess(items, processFn, options, callback)

// 批量执行操作
batchExecute(operations, options)
```

### 使用示例

```javascript
const batchUtils = require('../../utils/batchUtils');

// 批量处理任务
await batchUtils.batchProcess(
  tasks,
  async (task) => {
    // 处理单个任务
    await processTask(task);
  },
  {
    batchSize: 50,
    delay: 10,
    showProgress: true,
    progressTitle: '处理任务中'
  }
);
```

## 日期工具 (dateUtils)

`utils/dateUtils.js` 提供日期处理和格式化功能。

### 主要方法

```javascript
// 格式化
formatDate(date)                      // 格式化为YYYY-MM-DD
formatDateTime(date)                  // 格式化为YYYY-MM-DD HH:MM:SS
formatTime(date)                      // 格式化为HH:MM

// 计算
getTodayString()                      // 获取今天日期字符串
getCurrentTimestamp()                 // 获取当前时间戳
getDaysBetween(startDate, endDate)    // 计算天数差
isToday(date)                        // 是否是今天
isOverdue(date)                      // 是否过期

// 日历
getMonthCalendar(year, month)         // 获取月历数据
getWeekRange(date)                    // 获取周范围
```

### 使用示例

```javascript
const dateUtils = require('../../utils/dateUtils');

// 格式化日期
const today = dateUtils.getTodayString();
const formatted = dateUtils.formatDateTime(new Date());

// 检查任务是否过期
const isOverdue = dateUtils.isOverdue(task.date);
if (isOverdue) {
  logger.warn('TaskCheck', '任务已过期', { taskId: task.id });
}
```

## 存储适配器 (StorageAdapter)

`adapters/storage-adapter.js` 提供统一的数据存储接口。

### 核心功能
- 数据存储和读取
- 缓存管理
- 命名空间隔离
- 错误处理

### 主要方法

```javascript
// 数据操作
get(key)                             // 获取数据
set(key, value, options)             // 设置数据
remove(key)                          // 删除数据
clear()                              // 清空所有数据

// 批量操作
getMultiple(keys)                    // 批量获取
setMultiple(data)                    // 批量设置

// 缓存管理
clearCache()                         // 清空缓存
getCacheInfo()                       // 获取缓存信息
```

### 使用示例

```javascript
// 通过仓储类使用，一般不直接调用
const taskRepository = new TaskRepository();
const tasks = await taskRepository.findAll();
```

## EventBus 事件总线

`utils/eventBus.js` 提供高性能的事件发布订阅机制。

### 核心功能
- 事件发布和订阅
- 一次性事件监听
- 事件取消订阅
- 性能优化

### 主要方法

```javascript
// 事件订阅
on(event, listener)                  // 订阅事件
once(event, listener)                // 一次性订阅
off(event, listener)                 // 取消订阅

// 事件发布
emit(event, ...args)                 // 发布事件
```

### 使用示例

```javascript
const eventBus = getApp().eventBus;

// 订阅事件
eventBus.on('task:completed', (task) => {
  logger.info('EventListener', '收到任务完成事件', task);
  // 更新UI
  this.updateTaskDisplay();
});

// 发布事件（通常在服务中发布）
eventBus.emit('task:completed', task);
```

## 最佳实践

### 1. 服务使用原则
- 始终通过ServiceManager获取服务实例
- 不要直接实例化服务类
- 在页面onLoad中获取服务引用
- 使用async/await处理异步操作

### 2. 错误处理
- 所有异步操作都要有错误处理
- 使用logger记录关键操作和错误
- 给用户友好的错误提示

### 3. 性能优化
- 大量数据操作使用batchUtils
- 合理使用事件机制减少耦合
- 避免频繁的存储操作

### 4. 代码规范
- 遵循统一的命名规范
- 添加必要的日志记录
- 编写清晰的注释
- 保持代码简洁

---

**文档维护者**：开发团队  
**最后更新**：2024年12月  
**版本**：v3.0