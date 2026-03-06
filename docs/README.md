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
- [服务 API](api/services-guide.md) - 服务层 API 参考
- [仓储 API](api/repositories.md) - 仓储层 API 参考

### 开发指南
- [编码规范](development/coding_standards.md) - 命名、代码风格、UI规范、日志规范
- [开发流程](development/workflow.md) - 功能开发流程、文档维护规范
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
- 查 API：[服务 API](api/services-guide.md) 或 [仓储 API](api/repositories.md)
- 查规范：[编码规范](development/coding_standards.md)

### 我遇到问题
- 查看问题排查：[开发流程](development/workflow.md) 中的"文档维护"章节
- 查看常见陷阱：[Claude Code 工作指南](../CLAUDE.md) 中的"常见陷阱"部分

### 我想了解架构
- [架构概览](architecture/architecture.md) - 技术选型、DDD分层实现详解

### 我想提交 PR
- 阅读：[GitHub 协作](development/GITHUB_WORKFLOW.md)

---

## 🔧 快速命令参考

详细的命令说明请参阅：[Claude Code 工作指南](../CLAUDE.md) 的"快速参考"部分

### 开发相关
```bash
npm test                          # 运行测试
npm run test:models             # 运行模型测试
npm run test:services            # 运行服务测试
npm run test:coverage           # 生成覆盖率报告
npm run lint                    # 代码规范检查
npm run lint:fix                # 自动修复规范问题
npm run format                   # 代码格式化
npm run health-check            # 项目健康检查
```

---

## 📋 文档更新检查清单

根据代码变更类型，更新对应文档：

### 新增/修改服务
- [ ] 更新 [服务 API](api/services-guide.md)
- [ ] 更新 [编码规范](development/coding_standards.md)（如涉及架构）

### 新增/修改仓储
- [ ] 更新 [仓储 API](api/repositories.md)

### 新增功能
- [ ] 更新 [开发流程](development/CHANGELOG.md)（如果存在）
- [ ] 创建/更新 [设计文档](design/)

### 修复 Bug
- [ ] 如是常见问题，更新 [开发流程](development/workflow.md)（文档维护章节）
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
- API 使用问题：查阅 [服务 API](api/services-guide.md) 或 [仓储 API](api/repositories.md)
- GPT5 Codex 协作约束：查阅 [GPT5 Codex 工作指南](../AGENTS.md)
- 常见陷阱：查阅 [Claude Code 工作指南](../CLAUDE.md) 的"常见陷阱"部分

---

**最后更新**：2026-03-06
**维护者**：开发团队
