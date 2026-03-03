# 编码规范

> **本文档是项目编码规范的唯一权威来源**
> 相关文档：架构设计 → docs/architecture/、开发流程 → workflow.md、AI工作指南 → CLAUDE.md

本文档定义了学习任务微信小程序的编码规范和最佳实践，基于领域驱动设计(DDD)架构，确保代码风格统一和质量一致。

## 架构原则

### DDD分层规范
项目严格遵循领域驱动设计分层架构：

```
表现层(pages/components) → 应用层(services) → 基础设施层(repositories/adapters) → 领域层(models)
```

#### 分层职责
- **领域层(models/)**：业务实体和规则，无外部依赖
- **应用层(services/)**：业务用例和流程协调
- **基础设施层(repositories/adapters/)**：数据持久化和外部接口
- **表现层(pages/components/)**：用户界面和交互

#### 依赖规则
- 上层可以依赖下层，下层不能依赖上层
- 领域层不依赖任何其他层
- 通过ServiceManager访问服务，禁止直接实例化
- 使用EventBus进行跨服务通信

## 命名规范

### 文件命名

```
// DDD架构文件命名
models/task.js                    // 领域模型：小驼峰命名
services/task-service.js          // 服务类：烤串式命名
repositories/task-repository.js   // 仓储类：烤串式命名
adapters/storage-adapter.js       // 适配器：烤串式命名

// 表现层文件命名
pages/task-edit/                  // 页面：中划线分隔
components/taskItem/              // 组件：小驼峰命名
utils/dateUtils.js                // 工具类：小驼峰命名
```

### 变量和函数命名

```javascript
// 变量命名 - 小驼峰
const taskService = serviceManager.get('taskService');
const currentUser = userService.getCurrentUser();
const isCompleted = task.status === TaskStatus.COMPLETED;

// 常量命名 - 全大写下划线分隔
const MAX_TASK_COUNT = 100;
const DEFAULT_EXPIRY_TYPE = 'permanent';
const TASK_TYPES = {
  STUDY: 'study',
  HABIT: 'habit',
  INTEREST: 'interest'
};

// 类命名 - 大驼峰
class TaskService {
  async createTask(taskData) { }
}

class Task {
  constructor(data) { }
}

// 函数命名 - 小驼峰，语义化前缀
async getAllTasks()              // get前缀：获取
async createTask(data)           // create前缀：创建
async updateTaskStatus(id, status) // update前缀：更新
async deleteTask(id)             // delete前缀：删除
async checkRequiredTasks()       // check前缀：检查
async handleTaskCompletion(task) // handle前缀：处理

// 布尔类型使用is/has/can前缀
isTaskCompleted(task)            // is前缀：状态判断
hasUnreadMessages()              // has前缀：拥有判断
canManageRewards(userId)         // can前缀：权限判断
```

## 代码格式

### 缩进和空格

```javascript
// 使用2个空格缩进
if (condition) {
  const result = await processTask(task);
  if (result.success) {
    logger.info('TaskService', '任务处理成功', result);
  }
}

// 运算符前后使用空格
const total = count + additional;
const isValid = name && name.length > 0;

// 逗号后使用空格
const array = [1, 2, 3];
const object = { a: 1, b: 2, c: 3 };

// 对象和数组格式
const taskData = {
  title: '练习钢琴',
  type: 'study',
  points: 10
};
```

### 函数和类定义

```javascript
// 服务类格式
class TaskService {
  constructor(dependencies) {
    this.taskRepository = dependencies.taskRepository;
    this.starService = dependencies.starService;
    this.eventBus = dependencies.eventBus;
  }

  /**
   * 创建新任务
   * @param {Object} taskData 任务数据
   * @returns {Promise<{success: boolean, task?: Task, message?: string}>}
   */
  async createTask(taskData) {
    try {
      // 验证数据
      const validationResult = this._validateTaskData(taskData);
      if (!validationResult.isValid) {
        return { success: false, message: validationResult.message };
      }

      // 创建任务
      const task = new Task(taskData);
      const result = await this.taskRepository.save(task);

      // 发布事件
      this.eventBus.emit('task:created', task);
      
      logger.info('TaskService', '任务创建成功', { taskId: task.id });
      return { success: true, task };
    } catch (error) {
      logger.error('TaskService', '任务创建失败', error);
      return { success: false, message: '创建失败，请重试' };
    }
  }

  // 私有方法以下划线开头
  _validateTaskData(data) {
    if (!data.title || data.title.trim().length === 0) {
      return { isValid: false, message: '标题不能为空' };
    }
    return { isValid: true };
  }
}
```

## 注释规范

### JSDoc风格注释

```javascript
/**
 * 星星服务 - 管理星星积分系统
 * 提供星星获得、消费、过期等完整生命周期管理
 */
class StarService {
  /**
   * 添加星星
   * @param {string} userId - 用户ID
   * @param {number} amount - 星星数量
   * @param {string} expiryType - 有效期类型 (permanent/week/month/quarter)
   * @param {string} sourceId - 来源ID
   * @param {string} description - 描述信息
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  async addStars(userId, amount, expiryType, sourceId, description) {
    // 实现代码
  }
}
```

### 行内注释

```javascript
// 检查任务是否为必做任务
if (task.isRequired && !task.isCompleted) {
  // 计算惩罚金额
  const penaltyAmount = this._calculatePenalty(task);

  // 惩罚通知通过 EventBus 自动触发
  // 惩罚金额可配置：使用任务积分或默认5分
}
```

## 服务层规范

### 服务定义

```javascript
// 服务类必须继承BaseService（如果有的话）
class RewardService {
  constructor() {
    // 在构造函数中初始化依赖
    this.rewardRepository = new RewardRepository();
    this.starService = null; // 通过ServiceManager延迟注入
    this.messageService = null;
  }

  // 服务初始化方法
  init(serviceManager) {
    this.starService = serviceManager.get('starService');
    this.messageService = serviceManager.get('messageService');
  }

  // 业务方法返回统一格式
  async claimReward(rewardId, userId) {
    try {
      const result = await this._performClaimReward(rewardId, userId);
      return { success: true, ...result };
    } catch (error) {
      logger.error('RewardService', '奖励兑换失败', { rewardId, userId, error });
      return { success: false, message: error.message || '兑换失败' };
    }
  }
}
```

### 错误处理模式

```javascript
// 统一的错误处理模式
async performOperation(data) {
  try {
    // 1. 参数验证
    if (!this._validateInput(data)) {
      return { success: false, message: '参数无效' };
    }

    // 2. 业务逻辑
    const result = await this._executeBusinessLogic(data);
    
    // 3. 日志记录
    logger.info('ServiceName', '操作成功', { data, result });
    
    // 4. 返回结果
    return { success: true, result };
  } catch (error) {
    // 5. 错误处理
    logger.error('ServiceName', '操作失败', { data, error });
    return { success: false, message: this._getErrorMessage(error) };
  }
}
```

## 仓储层规范

### 仓储类定义

```javascript
// 继承BaseRepository
class TaskRepository extends BaseRepository {
  constructor() {
    super('tasks'); // 传入存储键名
  }

  // 特定查询方法
  async findByDate(date) {
    const allTasks = await this.findAll();
    return allTasks.filter(task => task.date === date);
  }

  async findOverdueTasks() {
    const allTasks = await this.findAll();
    const today = dateUtils.getTodayString();
    return allTasks.filter(task => 
      task.date < today && 
      task.status === TaskStatus.PENDING
    );
  }

  // 覆盖基类方法时添加业务逻辑
  async save(task) {
    // 保存前验证
    if (!task.id) {
      task.id = this._generateId();
    }
    
    task.updateTime = Date.now();
    
    // 调用基类方法
    const result = await super.save(task);
    
    logger.info('TaskRepository', '任务保存成功', { taskId: task.id });
    return result;
  }
}
```

## 领域模型规范

### 模型定义

```javascript
// 领域模型类
class Task {
  constructor(data = {}) {
    // 基础属性
    this.id = data.id || null;
    this.title = data.title || '';
    this.description = data.description || '';
    this.type = data.type || TaskType.STUDY;
    this.status = data.status || TaskStatus.PENDING;
    
    // 时间属性
    this.date = data.date || dateUtils.getTodayString();
    this.startTime = data.startTime || '';
    this.endTime = data.endTime || '';
    
    // 业务属性
    this.points = data.points || 0;
    this.pointsExpiry = data.pointsExpiry || 'permanent';
    this.isRequired = data.isRequired || false;
    this.penaltyApplied = data.penaltyApplied || false;
    
    // 时间戳
    this.createTime = data.createTime || Date.now();
    this.updateTime = data.updateTime || Date.now();
  }

  // 业务方法
  complete() {
    this.status = TaskStatus.COMPLETED;
    this.completionTime = Date.now();
    this.updateTime = Date.now();
  }

  reset() {
    this.status = TaskStatus.PENDING;
    this.completionTime = null;
    this.updateTime = Date.now();
  }

  // 验证方法
  isValid() {
    return this.title && this.title.trim().length > 0;
  }

  // 计算属性
  get isCompleted() {
    return this.status === TaskStatus.COMPLETED;
  }

  get isOverdue() {
    return this.date < dateUtils.getTodayString() && !this.isCompleted;
  }
}

// 枚举定义
const TaskType = {
  STUDY: 'study',
  HABIT: 'habit', 
  INTEREST: 'interest'
};

const TaskStatus = {
  PENDING: 0,
  COMPLETED: 1
};
```

## 页面和组件规范

### 页面结构

```javascript
// 页面文件结构
Page({
  data: {
    tasks: [],
    loading: false,
    error: null
  },

  // 生命周期
  onLoad(options) {
    // 获取服务引用
    this.taskService = getApp().serviceManager.get('taskService');
    this.messageService = getApp().serviceManager.get('messageService');
    
    // 初始化页面
    this.initPage(options);
  },

  onShow() {
    // 刷新数据
    this.refreshData();
  },

  onUnload() {
    // 清理资源
    this.cleanup();
  },

  // 初始化方法
  async initPage(options) {
    try {
      this.setData({ loading: true });
      await this.loadTasks();
    } catch (error) {
      logger.error('TaskPage', '页面初始化失败', error);
      this.setData({ error: '加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 数据加载
  async loadTasks() {
    const result = await this.taskService.getAllTasks();
    if (result.success) {
      this.setData({ tasks: result.tasks });
    }
  },

  // 事件处理
  async handleTaskComplete(e) {
    const { taskId } = e.currentTarget.dataset;
    const result = await this.taskService.completeTask(taskId, 'child');
    
    if (result.success) {
      wx.showToast({ title: '任务完成！', icon: 'success' });
      this.refreshData();
    } else {
      wx.showToast({ title: result.message, icon: 'error' });
    }
  },

  // 辅助方法
  refreshData() {
    this.loadTasks();
  },

  cleanup() {
    // 清理事件监听器等
  }
});
```

### 组件结构

```javascript
// 组件定义
Component({
  properties: {
    task: {
      type: Object,
      value: null
    },
    showActions: {
      type: Boolean,
      value: true
    }
  },

  data: {
    loading: false
  },

  lifetimes: {
    attached() {
      this.initComponent();
    },

    detached() {
      this.cleanup();
    }
  },

  methods: {
    initComponent() {
      // 组件初始化
    },

    // 事件处理方法以handle开头
    handleComplete() {
      this.triggerEvent('complete', { 
        taskId: this.data.task.id 
      });
    },

    handleEdit() {
      this.triggerEvent('edit', { 
        task: this.data.task 
      });
    },

    // 私有方法以下划线开头
    _updateDisplay() {
      // 更新显示
    },

    cleanup() {
      // 清理资源
    }
  }
});
```

## 日志记录规范

### 日志使用

```javascript
const logger = require('../../utils/logger');

// 记录关键操作
logger.info('TaskService', '任务创建开始', { taskData });
logger.info('TaskService', '任务创建成功', { taskId: result.id });

// 记录警告
logger.warn('StarService', '星星余额不足', { 
  required: amount, 
  available: balance 
});

// 记录错误
logger.error('RewardService', '奖励兑换失败', { 
  rewardId, 
  userId, 
  error: error.message 
});

// 记录调试信息（仅在开发环境）
logger.debug('TaskRepository', '查询条件', { date, status });
```

### 日志格式要求

- 第一个参数：模块名称（服务名、页面名、组件名）
- 第二个参数：操作描述（简洁明了）
- 第三个参数：相关数据（对象格式，包含关键信息）

## 性能优化规范

### 数据处理

```javascript
// 批量处理大量数据
await batchUtils.batchProcess(
  tasks,
  async (task) => {
    await this.processTask(task);
  },
  {
    batchSize: 50,
    delay: 10,
    showProgress: true
  }
);

// 合并setData调用
this.setData({
  tasks: updatedTasks,
  loading: false,
  lastUpdate: Date.now()
});

// 避免频繁存储操作
const operations = [];
operations.push({ key: 'tasks', value: tasks });
operations.push({ key: 'settings', value: settings });
await storageAdapter.setMultiple(operations);
```

### 异步处理

```javascript
// 使用async/await
async handleTaskCreation() {
  try {
    this.setData({ loading: true });
    
    const result = await this.taskService.createTask(taskData);
    if (result.success) {
      await this.refreshTasks();
      this.showSuccess('任务创建成功');
    } else {
      this.showError(result.message);
    }
  } catch (error) {
    logger.error('TaskPage', '任务创建异常', error);
    this.showError('操作失败，请重试');
  } finally {
    this.setData({ loading: false });
  }
}

// 使用setTimeout延迟非关键任务
setTimeout(() => {
  this.updateStatistics();
}, 100);
```

## 事件处理规范

### EventBus使用

```javascript
// 服务中发布事件
class TaskService {
  async completeTask(taskId, userId) {
    const result = await this._performTaskCompletion(taskId, userId);
    
    if (result.success) {
      // 发布领域事件
      this.eventBus.emit('task:completed', {
        task: result.task,
        userId,
        timestamp: Date.now()
      });
    }
    
    return result;
  }
}

// 页面中订阅事件
Page({
  onLoad() {
    const eventBus = getApp().eventBus;
    
    // 订阅任务完成事件
    eventBus.on('task:completed', this.handleTaskCompleted.bind(this));
  },

  handleTaskCompleted(event) {
    logger.info('TaskPage', '收到任务完成事件', event);
    this.refreshData();
  },

  onUnload() {
    // 取消订阅
    const eventBus = getApp().eventBus;
    eventBus.off('task:completed', this.handleTaskCompleted);
  }
});
```

## 测试规范

### 测试范围

项目使用 Jest 进行单元测试，遵循以下原则：

**包含的范围（单元测试）**：
- 领域模型：Task、Star、Reward 等
- 应用服务：StarService、TaskService、RewardService、MessageService 等
- 工具函数：dateUtils、formatUtils 等

**不包含的范围（页面和UI）**：
- 页面交互、表单提交、页面跳转
- UI渲染、样式正确性、动画效果
- 微信API调用、端到端流程

详细的测试流程请参阅 [workflow.md 的测试流程章节](workflow.md#测试流程)。

---

### 测试编写规范

#### 1. 测试文件结构

```javascript
/**
 * task-service.test.js - TaskService 测试
 *
 * 测试 TaskService 的核心业务逻辑
 */

const TaskService = require('../../services/task-service');
const EventBus = require('../../utils/core/event-bus');
const { Task, TaskStatus, TaskType } = require('../../models/task');

// Mock依赖
jest.mock('../../utils/logger');
jest.mock('../../services/star-service');
jest.mock('../../repositories/index');
```

#### 2. 测试用例结构

```javascript
describe('功能模块', () => {
  let moduleUnderTest;
  let mockDependencies;

  beforeEach(() => {
    // 重置所有mock
    jest.clearAllMocks();

    // 创建Mock依赖
    mockDependencies = {
      dependency: jest.fn().mockResolvedValue({ success: true })
    };

    // 创建测试对象
    moduleUnderTest = new Module({
      dependency: mockDependencies.dependency
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('具体方法', () => {
    it('应该正常工作', async () => {
      // Arrange（准备）
      const input = { ... };
      const expectedOutput = { ... };

      // Act（执行）
      const result = await moduleUnderTest.method(input);

      // Assert（断言）
      expect(result).toEqual(expectedOutput);
    });
  });
});
```

#### 3. 测试命名规范

```javascript
// ✅ 清晰的测试名称，使用"应该"模式
it('应该成功完成任务并奖励星星', () => { });
it('任务已完成时不应该重复奖励', () => { });
it('任务不存在时应该返回错误', () => { });

// ❌ 模糊的测试名称
it('测试完成功能', () => { });
it('测试边界条件', () => { });
```

#### 4. 断言规范

```javascript
// ✅ 清晰明确的断言
expect(result.success).toBe(true);
expect(result.task.title).toBe('测试任务');
expect(mockStarService.addStars).toHaveBeenCalledWith('child', 10);
expect(mockEventBus.emit).toHaveBeenCalledWith('task:completed', expect.objectContaining({
  taskId: 'task_1'
}));

// ❌ 模糊的断言
expect(mockStarService.addStars).toHaveBeenCalled();
expect(result).toBeDefined();
```

#### 5. Mock 使用规范

```javascript
// ✅ 只 Mock 需要的方法
mockRepository = {
  save: jest.fn().mockResolvedValue(task),
  getById: jest.fn().mockResolvedValue(task)
};

// ✅ 使用 mockResolvedValue 返回 Promise
mockService.method = jest.fn().mockResolvedValue({ success: true });

// ✅ 使用 mockImplementation 自定义逻辑
mockService.method = jest.fn().mockImplementation(async (input) => {
  return { id: input.id + '_processed' };
});

// ❌ Mock 所有方法，增加维护成本
mockRepository = {
  save: jest.fn(),
  getById: jest.fn(),
  getAll: jest.fn(),
  delete: jest.fn(),
  // ... 其他不需要的方法
};
```

#### 6. 测试覆盖

每个测试应该覆盖：
- 正常路径（成功场景）
- 边界条件（最小值、最大值、空值）
- 异常情况（错误处理）
- 边缘情况（特殊值、空数组）

```javascript
describe('completeTask', () => {
  it('应该成功完成任务', async () => {
    // 正常路径
  });

  it('任务已完成时应该跳过奖励', async () => {
    // 边界条件
  });

  it('任务不存在时应该返回错误', async () => {
    // 异常情况
  });

  it('积分为0时应该不奖励', async () => {
    // 边缘情况
  });
});
```

---

### 覆盖率要求

| 层级 | 覆盖率要求 | 说明 |
|-----|-----------|------|
| **领域模型** | 85%+ | 核心业务逻辑，必须充分测试 |
| **应用服务** | 75%+ | 业务流程，重点测试主路径 |
| **工具函数** | 90%+ | 纯函数，应全部覆盖 |
| **仓储层** | 60%+ | 数据访问，Mock存储测试 |

---

### 测试运行

```bash
# 运行所有测试
npm test

# 运行特定模块测试
npm run test:models
npm run test:services
npm run test:repositories

# 监听模式（开发时使用）
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

## 最佳实践

### 1. 架构遵循
- 严格遵循DDD分层架构
- 通过ServiceManager访问服务
- 使用EventBus进行跨层通信
- 保持领域模型的纯净性

### 2. 代码质量
- 统一的错误处理模式
- 完善的日志记录
- 合理的异步处理
- 适当的性能优化

### 3. 可维护性
- 清晰的命名规范
- 完整的注释文档
- 模块化的代码组织
- 充分的单元测试

### 4. 开发效率
- 复用通用组件和工具
- 使用批量处理优化性能
- 合理使用缓存机制
- 及时的错误反馈

## 权限控制规范

### 基于角色的权限控制
- **家长角色**：完整的管理权限（创建任务、设置奖励、用户管理）
- **小朋友角色**：受限的操作权限（完成任务、兑换奖励、查看统计）
- **双重保护**：UI层条件渲染 + 逻辑层权限验证

### 权限检查实现

```javascript
// 权限检查方法
isCurrentUserParent() {
  return this.data.currentUser && this.data.currentUser.role === UserRole.PARENT;
}

// 逻辑层权限验证
if (!this.isCurrentUserParent()) {
  logger.warn('Component', '无权限执行操作: 当前用户非家长');
  wx.showToast({
    title: '只有家长可以执行此操作',
    icon: 'error'
  });
  return;
}
```

### UI层权限控制

```xml
<!-- 条件渲染控制权限 -->
<view class="admin-section" wx:if="{{currentUser.role === 'parent'}}">
  <!-- 管理功能 -->
</view>

<!-- 权限提示 -->
<view class="permission-tip" wx:else>
  请切换到家长账号进行管理操作
</view>
```

### 权限控制最佳实践

1. **UI层隐藏**：使用`wx:if`条件渲染隐藏无权限功能
2. **逻辑层验证**：方法内部进行权限检查，防止直接调用
3. **友好提示**：权限不足时给出明确的提示信息
4. **日志记录**：记录权限检查和违规操作尝试
5. **向后兼容**：权限控制不影响现有接口和调用方式

### 权限控制示例

```javascript
// 组件权限控制示例
Component({
  methods: {
    // 管理操作前检查权限
    deleteUser(e) {
      if (!this.isCurrentUserParent()) {
        logger.warn('UserSwitcher', '无权限执行删除操作');
        wx.showToast({
          title: '只有家长可以删除用户',
          icon: 'error'
        });
        return;
      }

      const userId = e.currentTarget.dataset.userId;
      this._performDeleteUser(userId);
    },

    // 权限状态监听
    observers: {
      'currentUser': function(currentUser) {
        const canManageUsers = currentUser && currentUser.role === 'parent';
        logger.info('UserSwitcher', `用户管理权限: ${canManageUsers ? '有权限' : '无权限'}`);
      }
    }
  }
});
```

---

**文档维护者**：开发团队
**最后更新**：2026-03-02
**版本**：v4.1
**注意**：本文档是编码规范的唯一权威来源，其他文档应引用本文档而非重复其内容。 