# 开发工作流程

## 概述

本文档描述了学习任务微信小程序的开发工作流程、代码规范和最佳实践。所有开发人员都应严格遵循这些规范，以确保代码质量和项目的可维护性。

## 开发环境设置

### 必需工具
- **微信开发者工具**：最新版本
- **Node.js**：v14+ 
- **npm**：用于依赖管理
- **Jest**：单元测试框架
- **Git**：版本控制

### 环境配置
1. 安装微信开发者工具
2. 克隆项目仓库
3. 安装依赖：`npm install`
4. 配置开发者工具项目路径
5. 启动项目进行开发

## 项目架构规范

### DDD分层架构
项目严格遵循领域驱动设计(DDD)架构，开发时必须按照以下分层进行：

```
领域层(models/) → 应用层(services/) → 基础设施层(repositories/adapters/) → 表现层(pages/components/)
```

#### 开发原则
1. **领域优先原则**：业务逻辑封装在领域模型中
2. **服务协调原则**：复杂业务流程通过服务层协调
3. **接口隔离原则**：通过ServiceManager访问服务
4. **事件驱动原则**：使用EventBus进行组件间通信

### 服务管理规范
- 所有服务访问都必须通过ServiceManager
- 禁止直接操作仓储层或适配器层
- 服务间通信使用EventBus进行事件发布/订阅
- 批量操作使用batchUtils工具

## 代码开发规范

### 命名规范
- **文件命名**：使用kebab-case，如`task-service.js`
- **变量命名**：使用camelCase，如`taskService`
- **常量命名**：使用UPPER_SNAKE_CASE，如`MAX_TASK_COUNT`
- **类命名**：使用PascalCase，如`TaskService`

### 代码风格
1. **简洁原则**：保持代码简洁，去除冗余
2. **中文注释**：使用简洁的中文进行注释
3. **最小修改**：仅修复指定问题，不做无关改动
4. **日志完善**：在关键操作处添加logger日志

### 文件组织
```
src/
├── models/           # 领域模型
├── services/         # 应用服务
├── repositories/     # 仓储层
├── adapters/         # 适配器层
├── pages/           # 页面组件
├── components/      # UI组件
├── utils/           # 工具函数
└── styles/          # 样式文件
```

## 功能开发流程

### 1. 需求分析
- 明确功能需求和业务规则
- 识别涉及的领域模型和服务
- 设计数据流和组件交互
- 确定测试策略

### 2. 代码实现
按照以下顺序进行开发：

#### 第一步：领域层开发
```javascript
// 1. 创建或更新领域模型
// models/task.js
class Task {
  constructor(data) {
    this.id = data.id;
    this.title = data.title;
    // ... 其他属性
  }
  
  // 业务逻辑方法
  complete() {
    this.status = TaskStatus.COMPLETED;
    this.completionTime = Date.now();
  }
}
```

#### 第二步：仓储层开发
```javascript
// 2. 实现数据访问层
// repositories/task-repository.js
class TaskRepository extends BaseRepository {
  async findByDate(date) {
    // 实现具体查询逻辑
  }
}
```

#### 第三步：服务层开发
```javascript
// 3. 实现业务服务
// services/task-service.js
class TaskService {
  async completeTask(taskId, userId) {
    // 1. 获取任务
    // 2. 执行业务逻辑
    // 3. 发布领域事件
    // 4. 返回结果
  }
}
```

#### 第四步：表现层开发
```javascript
// 4. 实现页面和组件
// pages/task/task.js
Page({
  onLoad() {
    this.taskService = getApp().serviceManager.get('taskService');
  },
  
  async completeTask() {
    await this.taskService.completeTask(this.data.taskId, 'child');
  }
});
```

### 3. 测试实现
为每个功能编写相应的测试：

```javascript
// test/services/task-service.test.js
describe('TaskService', () => {
  test('should complete task successfully', async () => {
    // 测试任务完成功能
  });
});
```

### 4. 文档更新
- 更新相关API文档
- 更新数据模型文档
- 更新用户手册（如需要）

## 日志记录规范

### 日志格式
使用统一的logger工具进行日志记录：

```javascript
const logger = require('../../utils/logger');

// 信息日志
logger.info('TaskService', '任务完成', { taskId, userId });

// 警告日志
logger.warn('TaskService', '任务状态异常', { taskId, status });

// 错误日志
logger.error('TaskService', '任务完成失败', error);
```

### 日志记录点
必须记录日志的关键点：
1. 任务状态变更
2. 积分计算和分配
3. 重要数据操作
4. 异步操作开始和结束
5. 错误和异常情况
6. 业务规则执行

## UI开发规范

### 设计规范
```css
/* 卡片设计 */
.card {
  padding: 30rpx;
  border-radius: 16rpx;
  background-color: #ffffff;
}

/* 按钮设计 */
.button {
  height: 90rpx;
  border-radius: 8rpx;
}

/* 字体规范 */
.title { font-size: 32rpx; font-weight: 500-600; }
.content { font-size: 28rpx; font-weight: 400; }
.helper { font-size: 24rpx; font-weight: 400; }
```

### 颜色系统
```javascript
// 任务类型颜色
const TASK_COLORS = {
  study: '#4285F4',    // 学习任务 - 蓝色
  habit: '#4CAF50',    // 习惯任务 - 绿色
  interest: '#FF9800'  // 兴趣任务 - 橙色
};
```

### 间距规范
- 元素间距：12rpx（小间距）/ 24rpx（标准间距）
- 页面边距：30rpx
- 组件内边距：30rpx

## 性能优化规范

### 数据处理
- 大量数据操作使用batchUtils进行批量处理
- 合并setData调用，减少渲染次数
- 异步操作使用Promise/async-await
- 使用setTimeout延迟非关键任务

### 代码示例
```javascript
// 批量处理任务
await batchUtils.batchProcess(
  tasks,
  (task) => processTask(task),
  {
    batchSize: 50,
    delay: 10,
    showProgress: true
  }
);

// 合并setData
this.setData({
  tasks: updatedTasks,
  loading: false,
  message: '处理完成'
});
```

## 测试规范

### 测试策略
1. **单元测试**：测试业务逻辑和工具函数
2. **集成测试**：测试服务间协作
3. **端到端测试**：测试完整业务流程
4. **覆盖率要求**：保持85%以上测试覆盖率

### 测试文件组织
```
test/
├── models/          # 领域模型测试
├── services/        # 服务层测试
├── repositories/    # 仓储层测试
├── utils/          # 工具函数测试
└── integration/    # 集成测试
```

### 测试示例
```javascript
// 单元测试示例
describe('TaskService', () => {
  let taskService;
  
  beforeEach(() => {
    taskService = new TaskService();
  });
  
  test('应该成功完成任务', async () => {
    const taskId = 'task_123';
    const result = await taskService.completeTask(taskId, 'child');
    
    expect(result.success).toBe(true);
    expect(result.task.status).toBe(TaskStatus.COMPLETED);
  });
});
```

## 错误处理规范

### 错误处理策略
1. **业务错误**：返回结果对象，包含成功标志和错误信息
2. **系统错误**：记录详细日志，返回用户友好的错误信息
3. **异步错误**：使用try-catch包装，确保错误被正确捕获

### 错误处理示例
```javascript
async completeTask(taskId, userId) {
  try {
    // 业务逻辑
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      return { success: false, message: '任务不存在' };
    }
    
    // 执行完成操作
    task.complete();
    await this.taskRepository.save(task);
    
    return { success: true, task };
  } catch (error) {
    logger.error('TaskService', '完成任务失败', error);
    return { success: false, message: '操作失败，请重试' };
  }
}
```

## 版本管理规范

### Git工作流
1. **分支策略**：使用feature分支进行功能开发
2. **提交规范**：使用清晰的提交信息描述变更
3. **代码审查**：重要功能需要代码审查
4. **版本标签**：重要版本使用Git标签标记

### 提交信息格式
```
feat: 添加任务完成功能
fix: 修复星星计算错误  
docs: 更新API文档
refactor: 重构任务服务
test: 添加单元测试
```

## 部署流程

### 构建检查
1. 运行所有测试：`npm test`
2. 检查代码风格：`npm run lint`
3. 构建项目：`npm run build`
4. 功能验证：手动测试关键功能

### 发布步骤
1. 更新版本号
2. 更新CHANGELOG.md
3. 提交代码到主分支
4. 创建发布标签
5. 使用微信开发者工具上传代码
6. 提交审核

## 文档维护

### 文档更新原则
1. **同步更新**：代码修改时同步更新文档
2. **准确性**：确保文档与代码实现一致
3. **完整性**：新功能必须编写相应文档
4. **可读性**：使用清晰的语言和格式

### 文档类型
- **架构文档**：系统设计和技术决策
- **API文档**：接口规范和使用说明
- **开发文档**：开发流程和规范
- **用户文档**：功能使用指南

## 常见问题和解决方案

### Q: 如何添加新的任务类型？
A: 
1. 在TaskType枚举中添加新类型
2. 更新Task模型的验证逻辑
3. 在UI中添加相应的颜色和图标
4. 更新相关测试和文档

### Q: 如何实现新的星星有效期类型？
A:
1. 在StarExpiryType枚举中添加新类型
2. 在StarService中实现过期时间计算逻辑
3. 更新UI显示逻辑
4. 添加相应的测试用例

### Q: 如何添加新的服务？
A:
1. 继承BaseService创建新服务类
2. 在ServiceManager中注册服务
3. 实现相应的仓储类
4. 编写单元测试和集成测试

## 性能监控

### 关键指标
- 页面加载时间
- 操作响应时间
- 内存使用情况
- 错误率统计

### 监控工具
- 微信开发者工具性能面板
- 自定义性能日志
- 用户反馈收集

## 安全规范

### 数据安全
1. 敏感数据加密存储
2. 输入数据验证
3. 防止XSS攻击
4. 适当的权限控制

### 代码安全
1. 避免硬编码敏感信息
2. 使用安全的第三方库
3. 定期更新依赖包
4. 代码审查检查安全问题

---

**文档维护者**：开发团队  
**最后更新**：2024年12月  
**版本**：v2.0 