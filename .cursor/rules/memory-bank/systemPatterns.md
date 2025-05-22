# 系统架构与设计模式

## 领域驱动设计(DDD)架构

项目采用领域驱动设计架构，将系统分为以下几层：

1. **领域层（Domain Layer）**
   - 包含核心业务实体和逻辑
   - 定义任务、星星和奖励等领域对象
   - 实现业务规则和约束

2. **应用层（Application Layer）**
   - 协调领域对象完成用户操作
   - 管理事务和工作流程
   - 不包含业务规则，仅负责流程协调

3. **接口层（Interface Layer）**
   - 用户界面和外部通信
   - 页面和组件的实现
   - 用户交互与反馈

4. **基础设施层（Infrastructure Layer）**
   - 技术支持和实现细节
   - 存储访问和第三方服务集成
   - 工具函数和辅助类

## 核心设计模式

### 1. 仓储模式（Repository Pattern）

用于领域对象的持久化和检索：

```javascript
// 任务仓储示例
const taskRepository = {
  save(task) {
    // 持久化任务
  },
  
  findById(taskId) {
    // 检索特定任务
  },
  
  findAll() {
    // 检索所有任务
  }
};
```

### 2. 服务层模式（Service Layer Pattern）

处理跨实体的复杂业务逻辑：

```javascript
// 任务服务示例
const taskService = {
  completeTask(taskId) {
    // 完成任务的复杂逻辑
    const task = taskRepository.findById(taskId);
    task.markAsCompleted();
    pointsService.awardPoints(task.points);
    taskRepository.save(task);
    notificationService.notifyTaskCompleted(task);
  }
};
```

### 3. 状态模式（State Pattern）

管理任务的不同状态及其行为：

```javascript
// 任务状态管理
const taskStateMachine = {
  changeState(task, newStatus) {
    const currentStatus = task.status;
    
    // 状态转换验证和业务规则
    if (canTransition(currentStatus, newStatus)) {
      // 执行状态特定的行为
      executeStateTransition(task, currentStatus, newStatus);
      task.status = newStatus;
    }
  }
};
```

### 4. 观察者模式（Observer Pattern）

通过事件总线实现组件间通信：

```javascript
// 事件总线实现
const eventBus = {
  listeners: {},
  
  on(event, callback) {
    // 注册事件监听器
  },
  
  emit(event, data) {
    // 触发事件通知
  }
};
```

### 5. 策略模式（Strategy Pattern）

用于实现可替换的算法，如不同类型任务的积分计算：

```javascript
// 积分计算策略
const pointsCalculationStrategies = {
  study: (task) => {
    // 学习任务积分计算逻辑
  },
  
  habit: (task) => {
    // 习惯任务积分计算逻辑
  },
  
  interest: (task) => {
    // 兴趣任务积分计算逻辑
  }
};
```

## 数据流模式

### 单向数据流

组件和页面遵循单向数据流模式：

1. 数据源（通常是Manager或Service）提供数据
2. 页面通过回调获取数据并通过setData更新UI
3. 用户操作触发事件，事件处理器调用相应服务
4. 服务更新数据并通知数据变更
5. 数据变更触发UI更新

```
数据源 --> 页面/组件 --> 用户操作 --> 事件处理 --> 服务/Manager --> 数据更新 --> 通知变更 --> 重新获取数据 --> 页面/组件更新
```

### 批量处理模式

对于大量数据处理，采用批量分段模式避免UI阻塞：

```javascript
// 批量处理示例
batchUtils.batchProcess(
  items,          // 要处理的数据项
  processFn,      // 单项处理函数
  options,        // 批处理选项
  callback        // 完成回调
);
```

## 组件通信模式

1. **属性传递（Props）**：父组件向子组件传递数据
   
2. **事件机制**：子组件通过触发事件向父组件通信
   ```javascript
   // 子组件触发事件
   this.triggerEvent('statusChange', { taskId, newStatus });
   
   // 父组件监听事件
   <task-item bind:statusChange="onTaskStatusChange"></task-item>
   ```

3. **全局事件总线**：跨组件通信
   ```javascript
   // 发布事件
   app.globalData.eventBus.emit('taskUpdated', { taskId });
   
   // 订阅事件
   app.globalData.eventBus.on('taskUpdated', this.refreshTaskList);
   ```

4. **数据管理服务**：统一状态管理
   ```javascript
   // 获取数据
   taskManager.getAllTasks(tasks => {
     this.setData({ tasks });
   });
   
   // 更新数据
   taskManager.updateTaskStatus(taskId, newStatus, result => {
     // 处理更新结果
   });
   ```

## 存储模式

使用分层存储模式，将存储访问与业务逻辑分离：

1. **存储适配器**：封装微信存储API
   ```javascript
   // 存储适配器
   storageUtils.setItem('key', data);
   storageUtils.getItem('key');
   ```

2. **仓储实现**：使用适配器实现领域仓储
   ```javascript
   // 仓储实现
   const taskRepository = {
     findAll() {
       return storageUtils.getItem('tasks', []);
     },
     save(task) {
       const tasks = this.findAll();
       const index = tasks.findIndex(t => t.id === task.id);
       if (index >= 0) {
         tasks[index] = task;
       } else {
         tasks.push(task);
       }
       storageUtils.setItem('tasks', tasks);
     }
   };
   ```

3. **批量存储**：优化大量数据写入
   ```javascript
   // 批量存储操作
   batchUtils.batchStorage([
     { key: 'task_1', data: task1 },
     { key: 'task_2', data: task2 }
   ]);
   ``` 