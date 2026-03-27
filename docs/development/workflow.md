# 开发工作流程

> 本文档描述了学习任务微信小程序的开发流程和文档维护规范。
> 详细的编码规范请参阅 [coding_standards.md](coding_standards.md)。

---

## 功能开发流程

### ⚠️ 强制设计流程（新功能必读）

**重要**：所有新功能必须遵循以下流程，**禁止未经审核直接编码**

---

#### 阶段1：设计阶段（必需）

1. **先阅读文档**
   - [架构概览](../architecture/architecture.md) - 理解技术选型和架构决策
   - [编码规范](coding_standards.md) - 了解编码规范
   - [Claude Code 工作指南](../../CLAUDE.md) - 了解项目约束和工作流程

2. **检查现有实现**
   - 搜索相关功能（避免重复造轮子）
   - 理解现有设计模式
   - 基于现有代码改进，而非重写

3. **创建详细设计文档** ⚠️ 必须
   - 在 `docs/design/` 创建 `[feature-name].md`
   - 使用模板：[design/.template.md](../design/.template.md)
   - 包含：需求分析、技术方案、代码结构、实施步骤、测试方案、风险评估

4. **提交审核** ⚠️ 必须
   - 将设计文档提交给项目维护者审核
   - 审核通过后才能进入实施阶段
   - 审核标准：符合DDD架构、技术方案合理、实施步骤清晰

---

#### 阶段2：实施阶段（审核通过后）

5. **按照设计文档实施**
   - 严格遵循设计文档中的实施步骤
   - 遵循现有代码风格（参考 [coding_standards.md](coding_standards.md)）
   - 添加必要注释（简洁中文）
   - 不添加不必要的依赖
   - 如需变更设计，必须重新审核

---

#### 阶段3：完成阶段（实施后）

6. **完成后：同步更新文档** ⚠️ 重要
   - 代码和文档必须同时提交
   - 根据代码变更类型，更新对应文档：

| 代码变更类型 | 必须更新文档 | 不应该更新 |
|-------------|-------------|-------------|
| **新增/修改服务/仓储** | `docs/api/services-guide.md` 或 `repositories.md` | README（详细内容） |
| **新增/修改后端 REST 接口** | `docs/api/backend-rest-api.md` | README、services-guide.md（详细内容） |
| **新增功能** | `docs/design/[feature-name].md`、`docs/development/CHANGELOG.md`（完成后简要记录） | workflow.md（详细内容） |
| **修复常见问题Bug** | `docs/development/troubleshooting.md` | 其他文档（详细内容） |
| **架构调整** | `docs/architecture/architecture.md` | workflow.md（详细内容） |
| **发现新陷阱** | `CLAUDE.md` 的"常见陷阱"部分 | workflow.md（详细内容） |

**检查清单**：
- [ ] 是否涉及未来里程碑规划或阶段状态调整？→ 更新 `docs/development/ROADMAP.md`
- [ ] 是否新增/修改了服务/仓储？→ 更新 API 文档
- [ ] 是否新增/修改了后端 REST 接口？→ 更新 `docs/api/backend-rest-api.md`
- [ ] 是否新增了功能？→ 更新设计文档
- [ ] 是否修复了 Bug？→ 更新 troubleshooting.md
- [ ] 是否改变了架构设计？→ 更新架构文档
- [ ] 是否发现了新陷阱？→ 更新 CLAUDE.md

**参考**：文档更新规范详见下方"文档维护"章节。

**❌ 禁止**：未经审核直接编码

---

## 文档维护

> 详细的文档维护规范、场景说明和检查清单请参阅 [文档维护指南](../DOCUMENTATION_MAINTENANCE.md)

本节简要介绍文档维护的核心原则，详细规范请参考《文档维护指南》。

### 核心原则

1. **代码与文档同步更新**：代码变更后必须同步更新文档，一起提交到 Git
2. **单一数据源**：每类信息只有一个权威来源，避免重复
3. **引用而非重复**：使用链接引用，不要复制粘贴
4. **规划与变更分离**：未来里程碑写入 `ROADMAP.md`，已完成事项记录到 `CHANGELOG.md`

### 快速参考


| 代码变更类型 | 必须更新文档 |
|-------------|-------------|
| 新增/修改服务/仓储 | `docs/api/services-guide.md` 或 `repositories.md` |
| 新增/修改后端 REST 接口 | `docs/api/backend-rest-api.md` |
| 新增功能特性 | `docs/design/[feature-name].md`、`docs/development/CHANGELOG.md`（完成后简要记录） |
| 修复 Bug | `docs/design/[feature-name].md`（详细）、`docs/development/CHANGELOG.md`（1行） |
| 架构调整 | `docs/architecture/architecture.md`、`CLAUDE.md`（如影响约束） |
| 新增开发陷阱 | `CLAUDE.md` |

**补充说明**：
- 未来里程碑、阶段边界、当前状态变化 → 更新 `docs/development/ROADMAP.md`
- 已完成功能、里程碑和验证结果 → 更新 `docs/development/CHANGELOG.md`

## 测试流程

项目级测试分层、命令入口、覆盖率口径和手工回归原则，请参阅：

- **[测试策略总览](testing-strategy.md)** - 统一测试入口、闸门和覆盖率口径
- **[编码规范 - 测试规范章节](coding_standards.md#测试规范)** - 测试编写规范、命名、Mock 和断言约束
- **[后端测试说明](../../backend/test/README.md)** - 真实数据库集成测试准备与执行细节

---

## 相关文档

- **[CLAUDE.md](../../CLAUDE.md)** - AI助手工作指南
- **[编码规范](coding_standards.md)** - 详细编码规范（命名、代码风格、UI规范、日志规范等）
- **[测试策略总览](testing-strategy.md)** - 项目级测试分层、命令入口和覆盖率口径
- **[架构概览](../architecture/architecture.md)** - 技术选型和架构决策
- **[设计文档指南](../design/README.md)** - 如何创建和使用设计文档
- **[GitHub 协作](GITHUB_WORKFLOW.md)** - 团队协作和 PR 流程

---

**最后更新**：2026-03-27
**版本**：v4.5
**维护者**：项目维护团队
