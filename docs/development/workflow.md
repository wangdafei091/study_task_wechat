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
| **新增功能** | `docs/design/[feature-name].md` | workflow.md（详细内容） |
| **修复常见问题Bug** | `docs/development/troubleshooting.md` | 其他文档（详细内容） |
| **架构调整** | `docs/architecture/architecture.md` | workflow.md（详细内容） |
| **发现新陷阱** | `CLAUDE.md` 的"常见陷阱"部分 | workflow.md（详细内容） |

**检查清单**：
- [ ] 是否新增/修改了服务/仓储？→ 更新 API 文档
- [ ] 是否新增了功能？→ 更新设计文档
- [ ] 是否修复了 Bug？→ 更新 troubleshooting.md
- [ ] 是否改变了架构设计？→ 更新架构文档
- [ ] 是否发现了新陷阱？→ 更新 CLAUDE.md

**参考**：文档更新规范详见下方"文档维护"章节。

**❌ 禁止**：未经审核直接编码

---

## 文档维护

### 核心原则

#### 原则1：代码与文档同步更新

```
代码变更
   ↓
文档必须同步更新
   ↓
一起提交到 Git
```

**禁止**：
- ❌ 先提交代码，"以后再更新文档"
- ❌ 文档更新滞后于代码变更
- ❌ 文档与代码不一致

---

#### 原则2：单一数据源（Single Source of Truth）

每类信息只有一个权威来源：

| 信息类型 | 权威文档 | 不应该出现在 |
|---------|---------|-------------|
| 项目约束（不要做什么） | `CLAUDE.md` | workflow.md |
| 服务 API 端点详细说明 | `docs/api/services-guide.md` | architecture.md、README.md |
| 仓储 API 端点详细说明 | `docs/api/repositories.md` | services-guide.md |
| 编码规范 | `docs/development/coding_standards.md` | CLAUDE.md |
| 进度跟踪 | `docs/development/CHANGELOG.md` | 所有其他文档 |
| 技术选型理由 | `docs/architecture/architecture.md` | 所有其他文档 |
| 测试方法论 | `test/` 目录 | 其他文档 |
| 功能详细设计 | `docs/design/*.md` | docs/ 顶层目录 |
| AI 编码工作流程 | `CLAUDE.md` | workflow.md（仅引用） |
| 文档维护指南 | `docs/development/workflow.md`（本文档） | 所有其他文档 |
| GitHub 协作流程 | `docs/development/GITHUB_WORKFLOW.md` | 所有其他文档 |

---

#### 原则3：引用而非重复

```markdown
✅ 正确做法：
<!-- workflow.md -->
详细的陷阱说明请参阅 [CLAUDE.md 的常见陷阱章节](../../CLAUDE.md#常见陷阱)

❌ 错误做法：
<!-- workflow.md -->
## 常见陷阱（重复 CLAUDE.md 中的所有内容）
（重复 CLAUDE.md 中的所有内容）
```

---

### 文档更新对照表

| 代码变更类型 | 必须更新文档 | 可选更新文档 |
|-------------|-------------|-------------|
| **新增服务** | `docs/api/services-guide.md` | - | - |
| **修改服务API** | `docs/api/services-guide.md` | - | `docs/architecture/architecture.md`（如影响架构） |
| **新增仓储** | `docs/api/repositories.md` | - | - |
| **修改仓储API** | `docs/api/repositories.md` | - | - |
| **新增功能特性** | `docs/design/[feature-name].md` | `docs/development/CHANGELOG.md`（如存在） | - |
| **修复用户常见问题Bug** | `docs/development/troubleshooting.md` | - | - |
| **修复功能实施中的Bug** | `docs/design/[feature-name].md`（详细） | `docs/development/CHANGELOG.md`（1行） | - |
| **架构调整** | `docs/architecture/architecture.md` | `CLAUDE.md`（如影响约束） | `docs/development/coding_standards.md`（如影响编码方式） |
| **新增配置项** | `docs/development/setup.md`（如需） | - | README（简化版） |
| **新增开发陷阱** | `CLAUDE.md` | - | - |
| **新增测试用例** | - | - | - |
| **UI变更** | - | `docs/development/coding_standards.md`（如涉及规范） | - |
| **新增组件** | `docs/api/components-guide.md`（如需） | - | - |

---

### 文档维护工作流

#### 完整工作流程

```
┌─────────────────────────────────────────┐
│ 1. 编码阶段                              │
│    - 按 coding_standards.md 规范编写代码  │
│    - 添加必要注释（简洁中文）              │
└──────────┬──────────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│ 2. 提交前检查（使用清单）                │
│    - [ ] 是否影响了公共 API？           │
│    - [ ] 是否新增了功能？               │
│    - [ ] 是否修复了 Bug？               │
│    - [ ] 是否改变了架构决策？           │
└──────────┬──────────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│ 3. 更新文档（使用对照表）               │
│    - 根据清单更新相应文档                │
│    - 使用文档定位检查清单               │
│    - 遵循文档更新规范                   │
└──────────┬──────────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│ 4. 文档验证                              │
│    - [ ] 文档与代码一致                 │
│    - [ ] 没有引入新的重复               │
│    - [ ] 文档定位准确                   │
│    - [ ] 引用关系正确                   │
└──────────┬──────────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│ 5. 一起提交                              │
│    git add <代码文件> <文档文件>        │
│    git commit -m "feat: xxx"            │
│    - 代码和文档在同一个提交             │
└─────────────────────────────────────────┘
```

---

### 文档更新最佳实践

#### 实践1：代码和文档一起提交

```bash
# 提交新功能
git add services/task-service.js docs/api/services-guide.md docs/design/task-completion.md
git commit -m "feat: 添加任务完成功能

- 新增 completeTask 接口
- 实现任务状态变更和星星积分计算
- 更新服务API文档
- 更新设计文档"
```

---

#### 实践2：文档更新模板

**新增服务/仓储模板**：
```markdown
## 变更说明
新增了 xxx 服务/仓储

## 文档更新
- [ ] docs/api/services-guide.md 或 repositories.md - 添加接口说明
  - [ ] 服务/仓储职责
  - [ ] 公开方法列表
  - [ ] 方法签名（参数、返回值）
  - [ ] 使用示例

## 检查清单
- [ ] API文档已包含完整信息
- [ ] 使用示例可运行
- [ ] 没有与其他文档重复
```

---

### 文档定位检查清单

#### 在更新任何文档前，使用此清单

**步骤1：确认文档职责**

| 信息类型 | 正确位置 | ❌ 错误位置 |
|---------|---------|-----------|
| 项目约束（不要做什么） | `CLAUDE.md` | workflow.md |
| 服务 API 端点详细说明 | `docs/api/services-guide.md` | architecture.md、README.md |
| 仓储 API 端点详细说明 | `docs/api/repositories.md` | services-guide.md |
| 编码规范（命名、注释） | `docs/development/coding_standards.md` | CLAUDE.md |
| 技术选型理由 | `docs/architecture/architecture.md` | 所有其他文档 |
| 进度跟踪 | `docs/development/CHANGELOG.md` | 所有其他文档 |
| 功能详细设计 | `docs/design/*.md` | README.md（简化版） |
| 文档维护指南 | `docs/development/workflow.md`（本文档） | 所有其他文档 |

---

#### 步骤2：检查重复

**检查方法**：
```bash
# 搜索关键词
grep -r "服务 API" docs/*.md
grep -r "批量处理" docs/*.md

# 如果找到多个结果，说明可能存在重复
```

**决策树**：
```
这个信息是否已经在其他文档中详细说明？
│
├─ 是 → 是否完全相同？
│   ├─ 是 → 不要重复，添加引用
│   └─ 否 → 概览在一处，详细在另一处
│
└─ 否 → 这是哪个文档的职责？
    └─ 添加到该文档
```

**示例**：
```markdown
✅ 正确：
<!-- README.md -->
详细的 API 文档请参阅 [docs/api/services-guide.md](docs/api/services-guide.md)

❌ 错误：
<!-- README.md -->
## API 接口
（复制 services-guide.md 的所有内容）
```

---

#### 步骤3：验证详细程度

| 文档类型 | 详细程度 | 示例 |
|---------|---------|------|
| **README.md** | ⭐⭐ 简要（1-2句话） | "采用DDD架构设计" |
| **docs/README.md** | ⭐⭐ 导航（链接列表） | "services-guide.md - 服务API文档" |
| **architecture/architecture.md** | ⭐⭐⭐ 中等（为什么） | "选择DDD架构的3个理由" |
| **services-guide.md** | ⭐⭐⭐⭐⭐ 详细（完整参考） | "方法名、参数、返回值、示例" |
| **design/*.md** | ⭐⭐⭐⭐⭐ 极详细（实施步骤） | "步骤1.1-1.8，包含代码" |
| **CHANGELOG.md** | ⭐ 概览（简要说明） | "新增功能A、修复Bug #1" |
| **coding_standards.md** | ⭐⭐⭐ 实用（代码模板） | "命名约定、函数结构、UI规范" |
| **CLAUDE.md** | ⭐⭐⭐ 完整（AI必须知道） | "项目约束、工作流程、陷阱" |

---

#### 步骤4：确认读者对象

| 读者 | 主要文档 | 说明 |
|------|---------|------|
| **AI 助手** | `CLAUDE.md` | 自动读取，必须完整准确 |
| **人类开发者** | `docs/development/coding_standards.md`、`docs/api/*.md` | 详细、可操作 |
| **新开发者** | `README.md`、`docs/README.md` | 简单、清晰 |
| **架构师** | `docs/architecture/architecture.md`、`docs/design/*.md` | 技术深度 |
| **项目管理者** | `docs/development/CHANGELOG.md` | 进度、规划 |

---

### 快速检查清单

在提交文档更新前，快速回答以下问题：

1. ✅ 这个信息放在我正在更新的文档中，是否合适？
2. ✅ 这个信息是否与其他文档重复？
3. ✅ 这个信息的详细程度是否符合该文档的定位？
4. ✅ 这个文档的读者是谁？内容对他们有用吗？
5. ✅ 如果引用了其他文档，链接是否正确？

---

## 相关文档

- **[CLAUDE.md](../../CLAUDE.md)** - AI助手工作指南
- **[编码规范](coding_standards.md)** - 详细编码规范（命名、代码风格、UI规范、日志规范等）
- **[架构概览](../architecture/architecture.md) - 技术选型和架构决策
- **[设计文档指南](../design/README.md)** - 如何创建和使用设计文档
- **[GitHub 协作](GITHUB_WORKFLOW.md)** - 团队协作和 PR 流程

---

**最后更新**：2026-02-28
**版本**：v4.0
**维护者**：项目维护团队
