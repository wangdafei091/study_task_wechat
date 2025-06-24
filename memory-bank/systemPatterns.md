# 系统架构模式

## DDD分层架构

### 领域层 (models/)
- **核心实体**：Task、Star、StarGroup、Reward、Message、User、StarRecord
- **业务规则**：封装在领域模型内部，确保业务一致性
- **领域事件**：支持状态变更通知机制

### 应用服务层 (services/)
- **TaskService**：任务管理核心服务
- **StarService**：星星积分系统服务
- **RewardService**：奖励兑换服务
- **MessageService**：消息通知服务
- **UserService**：用户管理服务
- **ValidationService**：表单验证服务
- **ConfigService**：配置管理服务
- **AnalyticsService**：数据分析服务

### 基础设施层 (repositories/ & adapters/)
- **BaseRepository**：通用CRUD操作基类
- **专门仓储**：各领域仓储实现特定业务查询
- **StorageAdapter**：统一数据存储接口

### 表现层 (pages/ & components/)
- **页面组件**：通过ServiceManager访问业务逻辑
- **UI组件**：高度复用的组件化设计
- **分包加载**：按需加载功能模块

## 核心设计模式

### 1. 服务管理器模式
```javascript
// 统一的服务访问和依赖注入
const serviceManager = getApp().serviceManager;
const taskService = serviceManager.get('taskService');
```

### 2. 事件驱动模式
```javascript
// 服务间通过EventBus进行松耦合通信
this.eventBus.publish('task.completed', { taskId, userId });
```

### 3. 仓储模式
```javascript
// 数据访问层抽象
const baseRepository = new BaseRepository('tasks');
await baseRepository.save(task);
```

### 4. 适配器模式
```javascript
// 统一存储接口
const storageAdapter = new StorageAdapter({ namespace: 'user_' });
```

## 分包结构
- **主包**：核心功能（任务管理、奖励兑换）
- **packageChart**：数据分析和图表展示
- **packageManage**：奖励管理和兑换记录
- **packageMessage**：消息中心和星星记录
- **packageComponents**：复杂组件

## 关键架构决策
1. **本地存储优先**：使用微信小程序本地存储，支持离线使用
2. **事件驱动架构**：通过EventBus实现松耦合的模块通信
3. **批量处理优化**：使用batchUtils处理大量数据操作
4. **分包按需加载**：优化性能，减少主包体积
5. **服务依赖注入**：通过ServiceManager统一管理服务生命周期

## 性能优化策略
- **数据结构优化**：按有效期分组存储星星，优化消费策略
- **UI渲染优化**：合并setData调用，减少渲染次数
- **异步操作**：使用Promise/async-await处理异步逻辑
- **延迟加载**：非关键任务使用setTimeout延迟执行 