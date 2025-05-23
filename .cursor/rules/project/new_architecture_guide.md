# 新架构开发指南

本文档提供关于项目新采用的领域驱动设计(DDD)架构的指导，帮助开发团队理解和应用新架构。

## 架构概览

项目采用领域驱动设计架构，分为以下几层：

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│     Models      │     │  Repositories   │     │    Services     │
│                 │     │                 │     │                 │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                           Adapters                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1. 领域层 (Models)

- 位于 `models/` 目录
- 定义核心业务实体和规则
- 每个实体都是一个类，包含数据和业务方法

### 2. 仓储层 (Repositories)

- 位于 `repositories/` 目录
- 提供持久化和检索数据的方法
- 隐藏存储实现细节

### 3. 服务层 (Services)

- 位于 `services/` 目录
- 协调多个领域对象和仓储
- 实现复杂业务流程

### 4. 适配器层 (Adapters)

- 位于 `adapters/` 目录
- 封装外部系统和技术实现
- 提供统一的接口给上层使用

### 5. 表现层 (Pages/Components)

- 位于 `pages/` 和 `components/` 目录
- 实现用户界面和交互
- 通过服务管理器访问应用服务

## 迁移状态

项目已从传统的分层架构迁移至领域驱动设计(DDD)架构，迁移工作基本完成。

### 已完成迁移

- ✅ **星星服务** (`star-service.js`)
  - 实现了星星的管理、分组、有效期和消费逻辑
  - 替代了原有的 `pointsManager.js` 功能

- ✅ **奖励服务** (`reward-service.js`) 
  - 实现了奖励的管理、兑换和记录功能
  - 与星星服务集成，实现奖励兑换功能

- ✅ **消息服务** (`message-service.js`)
  - 实现了系统消息的创建、管理和通知功能
  - 替代了原有的 `messageManager.js` 功能

- ✅ **任务服务** (`task-service.js`)
  - 实现了任务的全生命周期管理
  - 替代了原有的 `taskManager.js` 功能

### 统一数据访问

所有领域服务现在通过领域仓储层访问数据，不再直接操作存储API：

```javascript
// 旧方式 - 直接使用存储API
wx.setStorageSync('taskData', tasks);
const tasks = wx.getStorageSync('taskData') || [];

// 新方式 - 通过仓储层和适配器访问数据
const taskRepository = new TaskRepository();
await taskRepository.saveAll(tasks);
const tasks = await taskRepository.getAll();
```

### 服务管理器

服务管理器 `utils/serviceManager.js` 提供了对所有领域服务的统一访问：

```javascript
// 获取服务实例
const taskService = getApp().serviceManager.getService('taskService');
const starService = getApp().serviceManager.getService('starService');
```

## 开发流程

### 1. 开发新功能

在新架构中开发功能的流程：

1. **定义领域模型**
   - 在 `models/` 目录创建模型类
   - 实现业务方法和验证规则
   - 更新 `models/index.js` 导出新模型

2. **实现仓储**
   - 在 `repositories/` 目录创建仓储类
   - 继承 `BaseRepository`
   - 实现特定查询和操作方法
   - 更新 `repositories/index.js` 导出新仓储

3. **实现服务**
   - 在 `services/` 目录创建服务类
   - 注入所需的仓储和其他依赖
   - 实现业务用例
   - 更新 `services/index.js` 导出新服务

4. **更新服务管理器**
   - 在 `utils/serviceManager.js` 添加获取新服务的方法

5. **更新UI**
   - 通过服务管理器调用新服务
   - 展示和处理数据

### 2. 修改现有功能

修改现有功能的步骤：

1. **确认功能所在服务**
   - 使用服务管理器获取相应服务
   - 查看服务中是否已有相关方法

2. **修改服务方法**
   - 在服务类中修改或添加业务方法
   - 确保正确使用领域模型和仓储类

3. **更新UI交互**
   - 通过服务管理器获取更新后的服务
   - 更新UI组件与服务的交互

## 事件驱动通信

项目使用事件总线进行跨组件通信：

```javascript
// 在服务或组件中订阅事件
constructor(options) {
  // ...
  this.eventBus = options.eventBus || new EventBus();
  this.eventBus.on('taskCompleted', this.handleTaskCompleted.bind(this));
}

// 发布事件
completeTask(taskId) {
  // ...处理逻辑
  this.eventBus.emit('taskCompleted', { taskId, task });
}
```

## 异步操作处理

项目中所有服务方法都返回Promise对象，支持async/await语法：

```javascript
// 在页面或组件中使用服务
async onLoad() {
  try {
    const taskService = getApp().serviceManager.getService('taskService');
    const tasks = await taskService.getAllTasks();
    this.setData({ tasks });
  } catch (error) {
    logger.error('PageName', '加载任务失败', error);
  }
}
```

## 日志处理

项目使用统一日志工具，按照以下规范记录日志：

```javascript
const logger = require('../../utils/logger');

// 记录信息日志
logger.info('ComponentName', '创建任务', { taskId });

// 记录警告
logger.warn('ServiceName', '任务已过期', { taskId, dueDate });

// 记录错误
try {
  // 业务逻辑
} catch (error) {
  logger.error('ServiceName', '保存任务失败', error);
}
```

## 批量处理

处理大量数据时，使用批量工具避免UI阻塞：

```javascript
const batchUtils = require('../../utils/batchUtils');

// 批量处理大量数据
batchUtils.batchProcess(
  items,
  item => {
    // 处理单个项
  },
  { 
    batchSize: 50, // 每批处理数量
    delay: 10,     // 批次间延迟(毫秒)
    showProgress: true  // 显示进度提示
  },
  () => {
    // 完成回调
  }
);
```

## 最佳实践

### 1. 使用服务管理器获取服务

```javascript
// 推荐
const taskService = getApp().serviceManager.getService('taskService');

// 不推荐
const TaskService = require('../../services/task-service');
const taskService = new TaskService();
```

### 2. 处理所有异步错误

```javascript
// 推荐
try {
  await taskService.deleteTask(taskId);
  // 成功处理
} catch (error) {
  logger.error('PageName', '删除任务失败', error);
  // 错误处理
}

// 不推荐 - 未处理异常
taskService.deleteTask(taskId)
  .then(() => {
    // 成功处理
  });
```

### 3. 领域模型验证

```javascript
// 创建任务前先验证
const task = new Task(taskData);
const errors = task.validate();

if (errors.length > 0) {
  logger.warn('TaskService', '任务数据验证失败', errors);
  return { success: false, errors };
}

// 保存任务
await this.taskRepository.save(task);
```

### 4. 使用领域事件

```javascript
// 完成任务时发布事件
async completeTask(taskId) {
  const task = await this.getTaskById(taskId);
  if (!task) return { success: false, message: '任务不存在' };
  
  task.complete();
  await this.taskRepository.save(task);
  
  // 发布领域事件
  this.eventBus.emit('taskCompleted', { taskId, task });
  
  return { success: true, task };
}
```

## 编码规范

### 1. 命名规范

- **文件命名**：使用小写字母和连字符，如 `task-repository.js`
- **类命名**：使用大驼峰命名法，如 `TaskRepository`
- **方法命名**：使用小驼峰命名法，如 `getTasksByDate`
- **私有方法**：使用下划线前缀，如 `_formatDate`

### 2. 错误处理规范

- 所有外部依赖调用应包含 try/catch
- 记录详细错误日志
- 返回标准化的结果对象

```javascript
// 标准结果对象
{
  success: true/false,  // 操作是否成功
  data: { ... },        // 成功时的数据
  message: '...',       // 操作结果消息
  error: error          // 失败时的错误对象（可选）
}
```

### 3. 日志规范

使用统一的日志工具记录操作：

```javascript
const logger = require('../utils/logger');

// 记录信息
logger.info('ComponentName', '操作描述', 可选数据);

// 记录警告
logger.warn('ComponentName', '警告描述', 可选数据);

// 记录错误
logger.error('ComponentName', '错误描述', 错误对象);
```

### 4. 注释规范

- 每个公共方法应有JSDoc注释
- 注释应说明功能、参数和返回值
- 复杂逻辑应有行内注释

```javascript
/**
 * 获取日期范围内的任务
 * @param {String} startDate 开始日期，格式YYYY-MM-DD
 * @param {String} endDate 结束日期，格式YYYY-MM-DD
 * @returns {Promise<Array>} 任务列表
 */
async getTasksInRange(startDate, endDate) {
  // 实现...
}
```

## 参考资料

- [领域驱动设计架构文档](../docs/architecture/domain-model-architecture.md)
- [存储适配器API文档](../docs/api/storage-adapter.md)
- [仓储层API文档](../docs/api/repositories.md)
- [服务层API文档](../docs/api/services.md)
- [架构规则文档](.cursor/rules/architecture-rules.md) 