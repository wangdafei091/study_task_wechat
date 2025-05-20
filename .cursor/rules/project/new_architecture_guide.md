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

## 目录结构

```
project/
  ├── models/                # 领域模型
  │   ├── index.js           # 导出所有模型
  │   ├── task.js            # 任务模型
  │   ├── star.js            # 星星模型
  │   ├── star-group.js      # 星星分组模型
  │   ├── reward.js          # 奖励模型
  │   └── star-record.js     # 星星记录模型
  │
  ├── repositories/          # 仓储实现
  │   ├── index.js           # 导出所有仓储
  │   ├── base-repository.js # 基础仓储类
  │   ├── task-repository.js # 任务仓储
  │   ├── star-repository.js # 星星仓储
  │   └── ...                # 其他仓储
  │
  ├── services/              # 应用服务
  │   ├── index.js           # 导出所有服务
  │   ├── star-service.js    # 星星服务
  │   └── reward-service.js  # 奖励服务
  │
  ├── adapters/              # 适配器
  │   └── storage-adapter.js # 存储适配器
  │
  ├── utils/                 # 工具类
  │   ├── serviceManager.js  # 服务管理器
  │   ├── logger.js          # 日志工具
  │   └── ...                # 其他工具
  │
  ├── pages/                 # 页面
  └── components/            # 组件
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

### 2. 迁移现有功能

迁移现有功能的步骤：

1. **分析现有实现**
   - 识别核心业务逻辑和数据模型
   - 确定需要迁移的功能范围

2. **创建领域模型**
   - 基于现有数据结构创建领域模型
   - 确保与现有数据格式兼容

3. **实现仓储类**
   - 创建对应的仓储类
   - 确保能正确读取现有数据

4. **实现服务类**
   - 创建服务类实现现有功能
   - 确保行为与现有实现一致

5. **并行运行测试**
   - 使用服务管理器支持新旧实现并行运行
   - 测试确保结果一致

6. **逐步替换**
   - 逐个页面或功能点替换为使用新服务
   - 持续测试确保功能正常

7. **移除旧实现**
   - 所有功能迁移完成后移除旧代码
   - 进行全面测试确保系统稳定

## 代码示例

### 1. 定义领域模型

```javascript
// models/task.js
class Task {
  constructor(data = {}) {
    this.id = data.id || `task_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.title = data.title || '';
    this.description = data.description || '';
    this.type = data.type || TaskType.STUDY;
    this.date = data.date || this._formatDate(new Date());
    this.status = data.status ?? TaskStatus.PENDING;
    // ... 其他属性
    
    this._initDefaults();
  }
  
  // 业务方法
  complete() {
    this.status = TaskStatus.COMPLETED;
    this.completionTime = Date.now();
    return this;
  }
  
  reset() {
    this.status = TaskStatus.PENDING;
    this.completionTime = 0;
    return this;
  }
  
  // 验证方法
  validate() {
    const errors = [];
    if (!this.title) {
      errors.push('任务标题不能为空');
    }
    // ... 其他验证规则
    return errors;
  }
  
  // 辅助方法
  _formatDate(date) {
    // 日期格式化逻辑
  }
  
  _initDefaults() {
    // 初始化默认值
  }
}

// 导出模型和枚举
module.exports = { Task, TaskType, TaskStatus, StarExpiryType, RepeatType };
```

### 2. 实现仓储类

```javascript
// repositories/task-repository.js
const { BaseRepository } = require('./base-repository');
const { Task } = require('../models/task');
const logger = require('../utils/logger');

class TaskRepository extends BaseRepository {
  constructor(options = {}) {
    super('tasks', Task, options);
    logger.info('TaskRepository', '初始化任务仓储');
  }
  
  // 特定查询方法
  async getTasksByDate(date) {
    try {
      logger.info('TaskRepository', `获取日期为 ${date} 的任务`);
      return this.query(task => task.date === date);
    } catch (error) {
      logger.error('TaskRepository', `获取日期任务失败: ${date}`, error);
      return [];
    }
  }
  
  async getTasksInRange(startDate, endDate) {
    try {
      logger.info('TaskRepository', `获取日期范围 ${startDate} 到 ${endDate} 的任务`);
      return this.query(task => {
        return task.date >= startDate && task.date <= endDate;
      });
    } catch (error) {
      logger.error('TaskRepository', `获取日期范围任务失败`, error);
      return [];
    }
  }
  
  // 其他特定方法
  async markAsCompleted(taskId) {
    try {
      const task = await this.getById(taskId);
      if (!task) {
        logger.warn('TaskRepository', `标记完成失败: 未找到任务 ${taskId}`);
        return null;
      }
      
      task.complete();
      return await this.save(task);
    } catch (error) {
      logger.error('TaskRepository', `标记任务完成失败: ${taskId}`, error);
      return null;
    }
  }
}

module.exports = TaskRepository;
```

### 3. 实现服务类

```javascript
// services/task-service.js
const { TaskRepository } = require('../repositories');
const { StarService } = require('./star-service');
const logger = require('../utils/logger');

class TaskService {
  constructor(options = {}) {
    this.taskRepository = options.taskRepository || new TaskRepository();
    this.starService = options.starService || new StarService();
    
    logger.info('TaskService', '初始化任务服务');
  }
  
  // 业务用例方法
  async completeTask(taskId) {
    try {
      logger.info('TaskService', `完成任务: ${taskId}`);
      
      // 获取任务
      const task = await this.taskRepository.getById(taskId);
      if (!task) {
        logger.warn('TaskService', `完成任务失败: 未找到任务 ${taskId}`);
        return { success: false, message: '任务不存在' };
      }
      
      // 修改任务状态
      task.complete();
      const savedTask = await this.taskRepository.save(task);
      
      // 处理星星奖励
      if (task.points > 0 && !task.starAwarded) {
        await this.starService.handleTaskCompletion(task, task.points);
      }
      
      logger.info('TaskService', `任务完成成功: ${taskId}`);
      return { success: true, task: savedTask };
    } catch (error) {
      logger.error('TaskService', `完成任务错误: ${taskId}`, error);
      return { success: false, message: '处理任务时发生错误', error };
    }
  }
  
  // 其他业务方法
  async getTodayTasks() {
    const today = new Date().toISOString().split('T')[0];
    logger.info('TaskService', `获取今日任务: ${today}`);
    return this.taskRepository.getTasksByDate(today);
  }
  
  // ...其他方法
}

module.exports = TaskService;
```

### 4. 更新服务管理器

```javascript
// utils/serviceManager.js
const logger = require('./logger');

// 导入现有服务
const oldTaskManager = require('./taskManager');
const oldMessageManager = require('./messageManager');
const oldPointsManager = require('./pointsManager');

// 导入新服务
const { TaskService, StarService, RewardService } = require('../services');

/**
 * 服务管理器
 * 提供服务获取功能
 */
const serviceManager = {
  // 配置是否使用新架构
  _useNewArchitecture: {
    task: false,
    star: true,
    reward: true
  },
  
  /**
   * 获取任务服务
   * @returns {Object} 任务服务实例
   */
  getTaskService() {
    if (this._useNewArchitecture.task) {
      logger.info('ServiceManager', '使用新任务服务');
      if (!this._taskService) {
        this._taskService = new TaskService();
      }
      return this._taskService;
    } else {
      logger.info('ServiceManager', '使用旧任务管理器');
      return oldTaskManager;
    }
  },
  
  /**
   * 获取星星服务
   * @returns {Object} 星星服务实例
   */
  getStarService() {
    if (this._useNewArchitecture.star) {
      logger.info('ServiceManager', '使用新星星服务');
      if (!this._starService) {
        this._starService = new StarService();
      }
      return this._starService;
    } else {
      logger.info('ServiceManager', '使用旧积分管理器');
      return oldPointsManager;
    }
  },
  
  // ...其他服务获取方法
};

module.exports = serviceManager;
```

### 5. 在UI层使用

```javascript
// pages/task/index.js
const serviceManager = require('../../utils/serviceManager');

Page({
  data: {
    tasks: []
  },
  
  onLoad() {
    this.loadTasks();
  },
  
  async loadTasks() {
    const taskService = serviceManager.getTaskService();
    
    // 使用服务获取数据
    const tasks = await taskService.getTodayTasks();
    this.setData({ tasks });
  },
  
  async completeTask(e) {
    const taskId = e.currentTarget.dataset.id;
    const taskService = serviceManager.getTaskService();
    
    // 使用服务完成任务
    const result = await taskService.completeTask(taskId);
    
    if (result.success) {
      // 更新UI
      this.loadTasks();
      wx.showToast({ title: '任务完成！', icon: 'success' });
    } else {
      wx.showToast({ title: result.message, icon: 'none' });
    }
  }
});
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

## 最佳实践

### 1. 依赖注入

通过构造函数注入依赖，便于测试和灵活配置：

```javascript
// 好的方式：
function TaskService(options = {}) {
  this.taskRepo = options.taskRepo || new TaskRepository();
  this.starService = options.starService || new StarService();
}

// 不推荐：
function BadTaskService() {
  this.taskRepo = new TaskRepository();
  this.starService = new StarService();
}
```

### 2. 批量操作

使用批量方法处理大量数据：

```javascript
// 好的方式：
const tasks = await taskRepo.getAll();
tasks.forEach(task => task.priority = 'high');
await taskRepo.saveAll(tasks);

// 不推荐：
const tasks = await taskRepo.getAll();
for (const task of tasks) {
  task.priority = 'high';
  await taskRepo.save(task); // 每次单独存储，性能差
}
```

### 3. 异步处理

统一使用 async/await 处理异步操作：

```javascript
// 好的方式：
async function processTasks() {
  try {
    const tasks = await taskRepo.getAll();
    // 处理任务
    return { success: true, tasks };
  } catch (error) {
    logger.error('processTasks', '处理任务失败', error);
    return { success: false, message: '处理失败' };
  }
}

// 不推荐：
function processTasks() {
  return taskRepo.getAll()
    .then(tasks => {
      // 处理任务
      return { success: true, tasks };
    })
    .catch(error => {
      logger.error('processTasks', '处理任务失败', error);
      return { success: false, message: '处理失败' };
    });
}
```

### 4. 事务使用

使用事务保证数据一致性：

```javascript
// 使用事务处理多个实体的修改
const success = await taskRepo.transaction(tasks => {
  // 修改任务数据
  const task = tasks.find(t => t.id === 'task_123');
  if (task) {
    task.status = 1;
    task.priority = 'high';
  }
  
  // 返回修改后的数据
  return tasks;
});
```

### 5. 适当缓存

适当使用缓存提高性能：

```javascript
// 使用缓存获取数据
const allTasks = await taskRepo.getAll(true); // 使用缓存

// 需要实时数据时跳过缓存
const latestTasks = await taskRepo.getAll(false); // 跳过缓存
```

## 常见问题与解决方案

### 1. 数据不一致

**问题**：新旧架构并行运行时可能出现数据不一致。

**解决方案**：
- 确保模型构造函数能处理旧数据格式
- 实现数据迁移方法
- 使用统一的存储键

### 2. 性能问题

**问题**：新架构可能引入额外的处理层导致性能下降。

**解决方案**：
- 使用多级缓存
- 实现批处理方法
- 优化仓储查询

### 3. 依赖循环

**问题**：服务间可能出现依赖循环。

**解决方案**：
- 使用事件通知代替直接依赖
- 重构服务职责边界
- 将共享逻辑提取到工具函数

## 迁移检查清单

迁移功能时使用以下检查清单：

- [ ] 领域模型完整定义所有属性和方法
- [ ] 仓储类实现所有必要的查询方法
- [ ] 服务类实现所有业务用例
- [ ] 模型验证规则与原有逻辑一致
- [ ] 服务管理器更新获取新服务的方法
- [ ] 界面代码更新使用新服务
- [ ] 添加详细日志记录
- [ ] 编写测试确保功能等价
- [ ] 确认新实现没有引入性能问题

## 参考资料

- [领域驱动设计架构文档](../docs/architecture/domain-model-architecture.md)
- [存储适配器API文档](../docs/api/storage-adapter.md)
- [仓储层API文档](../docs/api/repositories.md)
- [服务层API文档](../docs/api/services.md)
- [架构规则文档](.cursor/rules/architecture-rules.md) 