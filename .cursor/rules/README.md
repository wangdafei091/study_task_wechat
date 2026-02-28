# 学习任务微信小程序开发规范

本文档是Cursor规则的索引，总结项目架构、开发规范和指导原则，帮助开发者遵循一致的代码和设计标准。

## 架构概览

项目采用领域驱动设计(DDD)架构，分为以下核心层次：

- **领域层** (models/) - 定义核心业务实体和规则
- **仓储层** (repositories/) - 提供数据持久化和检索服务
- **服务层** (services/) - 协调领域对象，实现业务逻辑
- **适配器层** (adapters/) - 连接基础设施，如存储API
- **表现层** (pages/ & components/) - 实现用户界面和交互

架构详细信息在 [architecture-rules.md](./architecture-rules.md) 中定义。

## 目录结构

```
├── models/              # 领域模型
├── repositories/        # 数据仓储
├── services/            # 领域服务
├── adapters/            # 适配器
├── pages/               # 页面
├── components/          # 组件
├── utils/               # 通用工具函数
├── assets/              # 资源文件
└── styles/              # 全局样式
```

## 文档位置

> **重要说明**：所有项目文档已迁移到项目根目录的`docs/`文件夹，本目录仅保留Cursor AI助手使用的规则文件。

请参考以下文档路径：

- 架构文档: `docs/architecture/`
- 开发指南: `docs/development/`
- API文档: `docs/api/`
- 用户手册: `docs/user/`

## 开发规则索引

### 架构规则

- [architecture-rules.md](./architecture-rules.md) - 领域驱动设计架构规范
- [领域模型架构](../docs/architecture/architecture.md) - 详细的领域模型架构设计

### 业务领域规则

- [星星积分系统规则](../docs/architecture/star_points_system.md) - 积分系统的核心实现

### 开发指南

- [工具函数使用指南](../docs/api/utils_guide.md)
- [领域服务使用指南](../docs/api/services-guide.md)
- [组件使用指南](../docs/api/components-guide.md)

### 性能和优化

- [性能优化总结](../docs/architecture/optimization_summary.md)

## 核心规则

### 架构规则

1. **单向依赖**：内层不能依赖外层（领域层 → 仓储层 → 服务层 → 表现层）
2. **领域规则封装**：业务规则必须封装在领域模型中
3. **仓储统一访问**：数据访问必须通过仓储层，不直接使用存储API
4. **服务协调**：复杂业务流程由服务层协调，不在UI层实现业务逻辑

### 编码规范

1. **文件命名**：
   - 模型文件：单数形式，如 `task.js`
   - 仓储文件：`*-repository.js` 形式
   - 服务文件：`*-service.js` 形式
   - 工具文件：具体功能，如 `dateUtils.js`

2. **类命名**：使用大驼峰命名法
   - 模型类：`Task`, `Star`
   - 仓储类：`TaskRepository`
   - 服务类：`StarService`

3. **方法命名**：
   - 获取方法：使用 `get` 前缀，如 `getTasks()`
   - 修改方法：使用动词开头，如 `createTask()`
   - 私有方法：使用下划线前缀，如 `_formatDate()`

### 日志规范

1. **日志分级**：使用适当的日志级别（info, warn, error, debug）
2. **标准格式**：`logger.info('模块名', '操作描述', 数据)`
3. **关键点记录**：记录所有业务关键点和异常情况
4. **避免过度日志**：不记录循环中的重复信息或过大对象

### UI规范

1. **卡片组件**：
   - 内边距：30rpx
   - 圆角：16rpx
   - 阴影效果统一

2. **按钮样式**：
   - 高度：90rpx
   - 圆角：8rpx
   - 间距：12rpx/24rpx

3. **颜色系统**：
   - 学习任务：#4285F4（蓝色）
   - 习惯任务：#4CAF50（绿色）
   - 兴趣任务：#FF9800（橙色）

4. **字体系统**：
   - 标题文字：32rpx，字重500-600
   - 正文文字：28rpx，字重400
   - 辅助文字：24rpx，字重400

## Cursor记忆模式

项目使用Cursor记忆系统来保持项目理解上下文，主要通过以下文件维护：

- `memory-bank/activeContext.md` - 当前工作上下文
- `memory-bank/productContext.md` - 产品背景和目标
- `memory-bank/systemPatterns.md` - 系统设计模式
- `memory-bank/projectbrief.md` - 项目概要
- `memory-bank/progress.md` - 项目进度和状态

维护记忆时，请确保更新这些文件以反映最新的项目状态和决策。 