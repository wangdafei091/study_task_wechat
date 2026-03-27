# 文档导航

> 本文档提供项目文档的导航和快速参考，帮助快速找到需要的文档。

---

## 🚀 新人快速开始（约30分钟）

按顺序阅读以下文档：

### 1. 了解如何开发（10分钟）
阅读：[开发流程](development/workflow.md)

你将了解：
- 新功能开发的完整流程（设计→审核→实施→完成）
- 文档更新规范
- 强制设计流程

### 2. 了解如何编写代码（15分钟）
阅读：[编码规范](development/coding_standards.md)

你将了解：
- DDD架构分层规范
- 命名规范
- 代码风格
- 日志记录规范
- UI规范（颜色、字体、间距）

### 3. 了解系统设计（5分钟）
阅读：[架构概览](architecture/architecture.md)

你将了解：
- 技术选型理由
- DDD分层架构
- 核心组件关系

---

## 📚 文档分类

### 架构设计
- [架构概览](architecture/architecture.md) - 技术选型和架构决策、DDD分层实现详解

### API 参考
- [服务 API](api/services-guide.md) - 前端服务层 API 参考
- [后端 REST 契约](api/backend-rest-api.md) - 后端 HTTP/REST 接口契约
- [仓储 API](api/repositories.md) - 仓储层 API 参考

### 开发指南
- [编码规范](development/coding_standards.md) - 命名、代码风格、UI规范、日志规范
- [开发流程](development/workflow.md) - 功能开发流程、文档维护规范
- [测试策略总览](development/testing-strategy.md) - 测试分层、命令入口、覆盖率口径与手工回归原则
- [项目路线图](development/ROADMAP.md) - 未来里程碑、阶段状态与目标摘要
- [GitHub 协作](development/GITHUB_WORKFLOW.md) - 团队协作和 PR 流程

### 设计文档
- [设计文档指南](design/README.md) - 如何创建和使用设计文档
- [设计文档模板](design/.template.md) - 新功能设计文档模板

### AI 工作指南
- [Claude Code 工作指南](../CLAUDE.md) - Claude Code AI 助手工作指南
- [GPT5 Codex 工作指南](../AGENTS.md) - GPT5 Codex AI 助手工作指南

---

## 🎯 根据任务查找文档

### 我想添加新功能
1. 阅读：[开发流程](development/workflow.md) 中的"强制设计流程"部分
2. 使用模板：[设计文档模板](design/.template.md)
3. 提交审核

### 我想编写代码
- 查前端 API：[服务 API](api/services-guide.md) 或 [仓储 API](api/repositories.md)
- 查后端 HTTP 接口：[后端 REST 契约](api/backend-rest-api.md)
- 查规范：[编码规范](development/coding_standards.md)

### 我遇到问题
- 查看问题排查：[开发流程](development/workflow.md) 中的"文档维护"章节
- 查看常见陷阱：[Claude Code 工作指南](../CLAUDE.md) 中的"常见陷阱"部分

### 我想了解架构
- [架构概览](architecture/architecture.md) - 技术选型、DDD分层实现详解

### 我想提交 PR
- 阅读：[GitHub 协作](development/GITHUB_WORKFLOW.md)

### 我想跑测试或看测试范围
- 阅读：[测试策略总览](development/testing-strategy.md)
- 如需真实数据库集成测试准备，阅读：[backend/test/README.md](../backend/test/README.md)

---

## 🔧 快速命令参考

详细的命令说明请参阅：[Claude Code 工作指南](../CLAUDE.md) 的"快速参考"部分

### 开发相关
```bash
npm test                        # 根级稳定闸门
npm run test:quality           # 前端覆盖率闸门
npm run test:backend:unit      # 后端单元测试
npm run test:backend:integration:memory   # 后端轻量集成测试
```

更完整的测试入口和适用场景请参阅：[测试策略总览](development/testing-strategy.md)

---

## 📋 文档更新检查清单

根据代码变更类型，更新对应文档：

### 新增/修改服务
- [ ] 更新 [服务 API](api/services-guide.md)
- [ ] 更新 [编码规范](development/coding_standards.md)（如涉及架构）

### 新增/修改后端 REST 接口
- [ ] 更新 [后端 REST 契约](api/backend-rest-api.md)
- [ ] 如影响测试入口或回归范围，更新 [测试策略总览](development/testing-strategy.md)

### 新增/修改仓储
- [ ] 更新 [仓储 API](api/repositories.md)

### 新增功能
- [ ] 如涉及未来里程碑或阶段状态，更新 [项目路线图](development/ROADMAP.md)
- [ ] 功能完成后，更新 [更新日志](development/CHANGELOG.md)
- [ ] 创建/更新 [设计文档](design/)

### 修复 Bug
- [ ] 如是常见问题，更新 [故障排除指南](development/troubleshooting.md)
- [ ] 如是功能 Bug，更新对应 [设计文档](design/)

### 架构调整
- [ ] 更新 [架构概览](architecture/architecture.md)
- [ ] 如影响约束，更新 [Claude Code 工作指南](../CLAUDE.md)

### 发现新陷阱
- [ ] 更新 [Claude Code 工作指南](../CLAUDE.md) 的"常见陷阱"部分

---

## 📖 文档维护规范

详细的文档维护规范请参阅：[文档维护指南](DOCUMENTATION_MAINTENANCE.md)

### 核心原则

1. **代码和文档同步提交**：代码变更和文档更新必须在同一个 commit
2. **单一数据源**：每类信息只有一个权威来源，避免重复
3. **引用而非重复**：通过链接引用其他文档，避免内容重复
4. **保持简洁**：文档应该是"快速参考"，不是"完整教程"

### 提交规范

```bash
# 示例：新增服务并更新文档
git add services/new-service.js docs/api/services-guide.md
git commit -m "feat: 添加新服务

- 新增 NewService 类
- 更新服务 API 文档
"
```

---

## 📞 需要帮助？

- 功能开发问题：查阅 [开发流程](development/workflow.md)
- 编码规范问题：查阅 [编码规范](development/coding_standards.md)
- 前端内部 API：查阅 [服务 API](api/services-guide.md) 或 [仓储 API](api/repositories.md)
- 后端 HTTP 接口：查阅 [后端 REST 契约](api/backend-rest-api.md)
- 测试策略问题：查阅 [测试策略总览](development/testing-strategy.md)
- GPT5 Codex 协作约束：查阅 [GPT5 Codex 工作指南](../AGENTS.md)
- 常见陷阱：查阅 [Claude Code 工作指南](../CLAUDE.md) 的"常见陷阱"部分

---

**最后更新**：2026-03-27
**维护者**：开发团队
