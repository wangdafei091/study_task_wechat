# 学习任务微信小程序

> 采用领域驱动设计（DDD）架构的游戏化任务管理应用

---

## 📖 项目简介

这是一个**微信小程序原生应用**，帮助家长管理孩子的学习任务。通过游戏化的星星积分和奖励系统，激励孩子完成学习任务。

### 核心特性

- **任务管理**：支持学习、习惯、兴趣三种任务类型
- **游戏化激励**：完成任务获得星星，星星可兑换奖励
- **多用户支持**：家长和孩子双角色
- **数据本地化**：使用本地存储，无云服务依赖
- **DDD架构**：清晰的分层架构（models → services → repositories → pages）

### 技术栈

- **平台**：微信小程序原生开发
- **架构**：领域驱动设计（DDD）
- **存储**：微信本地存储（Storage API）
- **测试**：Jest单元测试

---

## 🚀 快速开始

### 环境要求

- 微信开发者工具（最新版本）
- Node.js（v16+）
- npm

### 安装依赖

```bash
npm install
```

### 开发流程

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd study_task_wechat
   npm install
   ```

2. **用微信开发者工具打开项目**
   - 打开微信开发者工具
   - 选择"导入项目"
   - 选择项目根目录

3. **阅读开发文档**
   - 📖 [文档导航](docs/README.md) - 完整文档索引
   - 🚀 [开发流程](docs/development/workflow.md) - 新功能开发流程
   - 📏 [编码规范](docs/development/coding_standards.md) - 编码标准

---

## 📚 文档导航

详细的文档请参阅：[docs/README.md](docs/README.md)

### 快速查找

| 我想... | 查阅文档 |
|---------|---------|
| 了解如何开发 | [开发流程](docs/development/workflow.md) |
| 了解编码规范 | [编码规范](docs/development/coding_standards.md) |
| 了解系统架构 | [架构概览](docs/architecture/architecture.md) |
| 查看服务 API | [服务 API](docs/api/services-guide.md) |
| 查看仓储 API | [仓储 API](docs/api/repositories.md) |
| 查看组件文档 | [组件指南](docs/api/components-guide.md) |
| 查看工具函数 | [工具函数指南](docs/api/utils_guide.md) |
| 提交 PR | [GitHub 协作](docs/development/GITHUB_WORKFLOW.md) |

### 新人指南（约30分钟）

按顺序阅读以下文档：

1. **[开发流程](docs/development/workflow.md)**（10分钟）- 了解新功能开发的完整流程
2. **[编码规范](docs/development/coding_standards.md)**（15分钟）- 了解命名、代码风格、UI规范
3. **[架构概览](docs/architecture/architecture.md)**（5分钟）- 了解技术选型和架构决策

---

## 🏗️ 项目结构

```
study_task_wechat/
├── models/              # 领域模型层（DDD）
│   ├── task.js
│   ├── star.js
│   └── reward.js
├── services/            # 应用服务层（DDD）
│   ├── service-manager.js
│   ├── task-service.js
│   └── ...
├── repositories/        # 数据仓储层（DDD）
│   ├── task-repository.js
│   └── ...
├── adapters/            # 基础设施适配器
│   ├── storage-adapter.js
│   └── ...
├── utils/               # 工具函数
│   ├── logger.js
│   ├── batchUtils.js
│   └── ...
├── components/          # 可复用组件
├── pages/              # 页面
├── docs/               # 项目文档
│   ├── architecture/   # 架构文档
│   ├── api/            # API 文档
│   ├── development/    # 开发指南
│   └── design/         # 设计文档
├── test/               # 测试文件
├── app.js              # 小程序入口
└── CLAUDE.md           # AI 助手工作指南
```

---

## 🧪 测试

```bash
# 运行所有测试
npm test

# 运行特定模块测试
npm run test:models
npm run test:services
npm run test:repositories

# 生成覆盖率报告
npm run test:coverage

# 代码规范检查
npm run lint
npm run lint:fix
```

---

## 📌 重要提示

### ⚠️ 开发前必读

- 所有新功能**必须**先创建设计文档，审核通过后才能实施
  - 详见：[开发流程 > 强制设计流程](docs/development/workflow.md#⚠️-强制设计流程新功能必读)
- 遵循单一数据源原则，避免文档重复
  - 详见：[开发流程 > 文档维护](docs/development/workflow.md#文档维护)

### 🎯 项目约束

- **禁止**使用跨平台框架（uni-app、Taro等）
- **禁止**使用微信云开发（本地存储优先）
- **禁止**绕过服务层直接操作数据
- **遵循**DDD架构分层原则

---

## 🤝 贡献

欢迎贡献代码和文档！请阅读：
- [GitHub 协作流程](docs/development/GITHUB_WORKFLOW.md)
- [开发流程](docs/development/workflow.md)

---

## 📞 获取帮助

- 功能开发问题：查阅 [开发流程](docs/development/workflow.md)
- 编码规范问题：查阅 [编码规范](docs/development/coding_standards.md)
- API 使用问题：查阅 [API 文档](docs/api/)
- 常见陷阱：查阅 [Claude Code 工作指南](CLAUDE.md) 的"常见陷阱"部分

---

**版本**：v2.0
**最后更新**：2026-02-28
**维护者**：项目维护团队
