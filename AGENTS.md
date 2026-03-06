# AGENTS.md

> GPT5 Codex 在本仓库的增量工作指南（桥接文档）
> **最后更新**：2026-03-06
> **维护者**：项目维护团队

---

## 1. 文档定位（重要）

本文件仅用于为 GPT5 Codex 提供入口约束，**不替代**现有权威文档。

必须遵循的权威文档：
- 项目约束与 AI 工作流程：`CLAUDE.md`
- 开发流程与设计审核：`docs/development/workflow.md`
- 编码规范：`docs/development/coding_standards.md`
- 文档维护规范：`docs/DOCUMENTATION_MAINTENANCE.md`
- GitHub 协作流程：`docs/development/GITHUB_WORKFLOW.md`

原则：
- 单一数据源（Single Source of Truth）
- 引用而非重复
- 只新增，不改造现有文档体系

---

## 2. 项目定制执行约束（最高优先级）

以下规则由项目负责人明确指定，优先于本文件其他默认流程：

1. **禁止修改项目管理类文档、架构文档**
   - 包括但不限于：`README.md`、`CLAUDE.md`、`docs/**/*.md`
   - 尤其禁止：`docs/architecture/**`、`docs/development/**`、`docs/design/**`
2. **例外：允许修改 GPT5 Codex 专用文档**
   - `AGENTS.md`
   - `docs/development/AI_PARALLEL_WORKFLOW.md`
3. **职责边界**
   - 主要职责：代码实现、测试实现、代码评审
   - 非职责默认项：项目管理文档维护、架构文档维护
4. **触发条件**
   - 若任务必须修改非 GPT5 Codex 专用文档，必须先向用户确认后再执行

---

## 3. GPT5 Codex 启动检查清单

收到开发任务后，按顺序执行：

1. 阅读 `CLAUDE.md`，确认项目定位与禁区约束
2. 阅读 `docs/development/workflow.md`，确认是否属于“新功能”
3. 只做代码实现、测试和评审相关工作
4. 不修改非 GPT5 Codex 专用文档；如确需修改先征求确认
5. 实现过程遵循 `coding_standards.md` 的代码规范部分

---

## 4. 与 ClaudeCode 并行开发规则

当 GPT5 Codex 与 ClaudeCode 并行参与同一迭代时，额外遵循：

- 并行协作协议：`docs/development/AI_PARALLEL_WORKFLOW.md`
- 无明确任务边界前，不并行修改同一文件
- 涉及架构、公共接口、跨层职责变更时，先回到设计文档审核

---

## 5. 冲突时的优先级

若本文件与其他文档出现解释冲突，按以下优先级执行：

1. 用户当次明确指令（本项目定制约束）
2. 本文件第2章“项目定制执行约束”
3. `CLAUDE.md`
4. `docs/development/workflow.md`
5. `docs/development/coding_standards.md`
6. 本文件其他章节

---

## 6. 维护触发条件

以下场景需更新本文件：
- 新增或调整 AI 协作流程入口
- GPT5 Codex 在执行中出现重复性偏差（需要新增约束）
- 并行协作协议调整导致入口检查清单变化
