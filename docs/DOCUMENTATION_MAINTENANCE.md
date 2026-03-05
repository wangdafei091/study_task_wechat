# 文档维护指南

> 如何在编码完成后及时同步更新文档，并严格遵守文档定位和规范
> **最后更新**：2026-03-04

---

## 📋 目录

- [核心原则](#核心原则)
- [文档维护工作流](#文档维护工作流)
- [代码变更时如何更新文档](#代码变更时如何更新文档)
- [架构评审流程](#架构评审流程)
- [文档定位检查清单](#文档定位检查清单)
- [设计文档归档规则](#设计文档归档规则)
- [文档维护最佳实践](#文档维护最佳实践)
- [快速参考](#快速参考)

---

## 核心原则

### 原则1：代码与文档同步更新

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

### 原则2：单一数据源（Single Source of Truth）

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
| 功能详细设计 | `docs/design/*.md` | README.md（简化版） |
| AI 编码工作流程 | `CLAUDE.md` | workflow.md（仅引用） |
| 文档维护指南 | `docs/DOCUMENTATION_MAINTENANCE.md`（本文档） | 所有其他文档 |
| GitHub 协作流程 | `docs/development/GITHUB_WORKFLOW.md` | 所有其他文档 |

---

### 原则3：引用而非重复

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

## 文档维护工作流

### 完整工作流程

```
┌─────────────────────────────────────────┐
│ 1. 编码阶段                              │
│    - 按 coding_standards.md 规范编写代码  │
│    - 添加必要注释（简洁中文）              │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│ 2. 提交前检查（使用清单）                │
│    - [ ] 是否影响了公共 API？           │
│    - [ ] 是否新增了功能？               │
│    - [ ] 是否修复了 Bug？               │
│    - [ ] 是否改变了架构决策？           │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│ 3. 更新文档（使用对照表）               │
│    - 根据清单更新相应文档                │
│    - 使用文档定位检查清单               │
│    - 遵循文档更新规范                   │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│ 4. 文档验证                              │
│    - [ ] 文档与代码一致                 │
│    - [ ] 没有引入新的重复               │
│    - [ ] 文档定位准确                   │
│    - [ ] 引用关系正确                   │
└──────────────┬──────────────────────────┘
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

## 代码变更时如何更新文档

### 场景1：新增/修改服务

**影响范围**：
- 代码：`services/[service-name].js`
- 文档：`docs/api/services-guide.md`（必需）✅

**更新步骤**：
1. 在服务文件中添加或修改方法
2. 在 `docs/api/services-guide.md` 添加：
   - 服务职责说明
   - 公开方法列表
   - 方法签名（参数、返回值）
   - 使用示例
3. 检查清单：
   - [ ] API文档包含完整信息
   - [ ] 使用示例可运行
   - [ ] 没有与其他文档重复

**不应该做的**：
- ❌ 在 `architecture.md` 添加详细的API说明
- ❌ 在 `README.md` 添加详细API文档

---

### 场景2：新增/修改仓储

**影响范围**：
- 代码：`repositories/[repository-name].js`
- 文档：`docs/api/repositories.md`（必需）✅

**更新步骤**：
1. 在仓储文件中添加或修改方法
2. 在 `docs/api/repositories.md` 添加：
   - 仓储职责说明
   - 查询方法列表
   - 方法签名（参数、返回值）
   - 使用示例

**不应该做的**：
- ❌ 在 `services-guide.md` 添加仓储说明
- ❌ 在 `architecture.md` 添加详细的API说明

---

### 场景3：新增功能特性

**影响范围**：
- 代码：新增功能
- 文档：
  - `docs/design/[feature-name].md`（必需）✅
  - `docs/development/CHANGELOG.md`（如存在）✅

**更新步骤**：
1. 在设计文档中更新实施状态
2. 在 `CHANGELOG.md` 更新：
   - 标记为"已完成"
   - 更新进度百分比
   - 移除"待办任务"清单

**不应该做的**：
- ❌ 在 `workflow.md` 添加功能说明（这是项目进度）
- ❌ 在 `architecture.md` 添加功能描述（除非涉及架构变更）

---

### 场景4：修复 Bug

**影响范围**：
- 代码：修复 Bug
- 文档：
  - `docs/development/troubleshooting.md`（如果是常见问题）✅
  - `docs/design/[feature-name].md`（如果是功能 Bug）✅

**更新步骤**：
1. 如果 Bug 是用户常见问题，在 `troubleshooting.md` 添加：
   - 问题症状
   - 解决方案
   - 预防措施

2. 如果 Bug 影响功能测试，在设计文档更新测试用例

**不应该做的**：
- ❌ 在 `README.md` 记录 Bug（除非是已知限制）
- ❌ 在 `CHANGELOG.md` 记录（除非是进度相关）

---

### 场景5：功能实施过程中的 Bug 修复

**影响范围**：
- `docs/design/[feature-name].md`（详细记录）✅
- `docs/development/CHANGELOG.md`（简要提及，1行）✅

**规则**：
1. **功能特定 Bug** → 记录在该功能的设计文档"Bug 修复记录"部分
2. **框架级 Bug** → 记录在功能设计文档，标记"需要迁移到框架文档"

> Bug 修复记录模板请参阅 `docs/design/.template.md` 的"Bug 修复记录"部分

**不应该做的**：
- ❌ 在 CHANGELOG.md 中展开技术细节（超过3行）
- ❌ 在多个地方重复记录相同的 Bug

**文档管理原则**：
1. **Single Source of Truth**：Bug 的详细技术描述只有一个权威来源（design/*.md）
2. **可追溯性**：代码变更的原因可以在 design/*.md 中找到完整答案
3. **渐进式文档**：框架级 Bug 先记录在发现它的功能文档中，待第2个功能遇到时再迁移

---

### 场景6：改变技术决策

**影响范围**：
- 代码：架构变更
- 文档：
  - `docs/architecture/architecture.md`（必需）✅
  - `CLAUDE.md`（如果影响约束）✅
  - `docs/development/coding_standards.md`（如果影响编码规范）✅

**更新步骤**：
1. 在 `architecture.md` 的"关键设计决策"部分：
   - 更新或新增决策记录
   - 说明变更理由
   - 记录权衡（trade-off）

2. 如果影响项目约束，在 `CLAUDE.md` 的"重要约束"部分更新

3. 如果影响编码方式，在 `coding_standards.md` 更新编码规范

#### 架构评审流程

对于涉及架构变更的代码变更，必须经过架构评审：

**评审触发条件**：
- [ ] 影响DDD分层原则
- [ ] 跨越模块边界或改变模块职责
- [ ] 引入新的技术栈或依赖
- [ ] 改变服务间通信方式（EventBus vs 直接调用）
- [ ] 改变数据访问层设计（Repository模式变更）

**架构评审检查清单**：
- [ ] **DDD分层检查**
  - [ ] 是否违反依赖规则（上层依赖下层）
  - [ ] 是否保持领域层无外部依赖
  - [ ] 服务是否通过ServiceManager访问
  - [ ] 跨服务通信是否使用EventBus

- [ ] **接口一致性检查**
  - [ ] 是否需要更新 `docs/api/services-guide.md`
  - [ ] 是否需要更新 `docs/api/repositories.md`
  - [ ] 公开接口是否有完整的JSDoc注释

- [ ] **项目约束检查**
  - [ ] 是否违反微信小程序原生开发定位
  - [ ] 是否引入不允许的跨平台框架
  - [ ] 是否引入不必要的重型依赖
  - [ ] 是否需要更新 `CLAUDE.md` 的项目约束

- [ ] **兼容性检查**
  - [ ] 是否影响现有功能
  - [ ] 是否需要数据迁移
  - [ ] 是否需要版本标记（breaking change）

**架构评审流程**：
1. 在设计文档中详细说明架构变更
2. 提交设计文档进行架构评审
3. 项目维护者或架构师进行评审
4. 评审通过后才能开始实施
5. 实施后更新 `docs/architecture/architecture.md`
6. 如果影响项目约束，同步更新 `CLAUDE.md`

**架构变更示例**：
```markdown
## 架构变更说明

### 变更原因
说明为什么需要进行架构变更

### 变更内容
详细描述架构变更的具体内容

### 影响范围
- 影响的模块
- 影响的接口
- 是否影响现有功能

### 架构评审
- [ ] DDD分层检查
- [ ] 接口一致性检查
- [ ] 项目约束检查
- [ ] 兼容性检查

### 评审结论
- [ ] 通过
- [ ] 需要修改
- [ ] 不通过

评审意见：（详细描述）
```

---

### 场景7：新增开发陷阱

**影响范围**：
- 发现新的常见错误模式
- 文档：`CLAUDE.md`（必需）✅

**更新步骤**：
1. 在 `CLAUDE.md` 的"常见陷阱"部分添加：
   - 陷阱名称和编号
   - 错误示例
   - 正确做法
   - 检查清单

2. 在 `coding_standards.md` 的"常见陷阱"部分：
   - 添加快速引用
   - 链接到 `CLAUDE.md` 的详细说明

---

## 文档定位检查清单

### 在更新任何文档前，使用此清单

#### 步骤1：确认文档职责

**问题1：这个信息应该放在哪个文档？**

| 信息类型 | 正确位置 | ❌ 错误位置 |
|---------|---------|-----------|
| 项目约束（不要做什么） | `CLAUDE.md` | workflow.md |
| 服务 API 端点详细说明 | `docs/api/services-guide.md` | architecture.md、README.md |
| 仓储 API 端点详细说明 | `docs/api/repositories.md` | services-guide.md |
| 编码规范（命名、注释） | `docs/development/coding_standards.md` | CLAUDE.md |
| 技术选型理由 | `docs/architecture/architecture.md` | 所有其他文档 |
| 进度跟踪 | `docs/development/CHANGELOG.md` | 所有其他文档 |
| 功能详细设计 | `docs/design/*.md` | README.md（简化版） |
| 文档维护指南 | `docs/DOCUMENTATION_MAINTENANCE.md`（本文档） | 所有其他文档 |
| GitHub 协作流程 | `docs/development/GITHUB_WORKFLOW.md` | 所有其他文档 |

---

#### 步骤2：检查重复

**问题2：这个信息是否在其他文档中存在？**

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

**问题3：这个内容的详细程度是否合适？**

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

**问题4：这个文档的读者是谁？**

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

## 设计文档归档规则

设计文档实施完成后，**不删除**，但可以逐步精简为存档形式。

### 保留内容

| 内容 | 保留 | 理由 |
|------|------|------|
| 需求分析（功能范围） | ✅ | 记录"做了什么、为什么做" |
| 技术方案（架构选型） | ✅ | 记录设计决策和权衡 |
| 替代方案 | ✅ | 记录"为什么不选其他方案" |
| 审核记录 | ✅ | 记录审核过程 |
| Bug 修复记录 | ✅ | 记录实施中的问题和解决 |

### 可精简内容

| 内容 | 处理方式 | 理由 |
|------|---------|------|
| 实施步骤的详细代码 | 精简为概要 | 代码在 Git 中有完整记录 |
| 测试方案的详细用例 | 精简为概要 | 测试代码在仓库中 |
| 风险评估 | 保留已实现的风险项 | 防止重蹈覆辙 |
| 数据模型/接口设计 | 保留接口，删除实现细节 | 接口是架构信息 |

### 归档时机

- 功能**已完成且稳定**（无后续 bug 修复或变更）即可归档
- 不按日历时间，按功能稳定性判断
- 归档时将设计文档精简并保留在 `docs/design/` 目录

> 注：chatbot 项目使用 `docs/archive/` 目录，study_task_wechat 可选择是否采用此方式

---

## 文档维护最佳实践

### 实践1：代码和文档一起提交

**提交原则**：
- ✅ 代码变更和文档更新在同一个 commit
- ✅ Commit message 同时描述代码和文档变更
- ❌ 避免代码提交后"回头再更新文档"

**示例**：
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

### 实践2：文档更新模板

#### 新增服务/仓储模板

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

#### 修复 Bug 模板

```markdown
## 变更说明
修复了 xxx 问题

## 文档更新
- [ ] docs/development/troubleshooting.md - 添加问题解决步骤（如果是常见问题）
- [ ] docs/design/[feature-name].md - 更新Bug修复记录（如果是功能Bug）

## 检查清单
- [ ] 问题已记录到 troubleshooting.md 或 design/*.md
- [ ] 解决方案清晰可操作
```

---

### 实践3：定期文档审查

**审查频率**：
- 小型项目：每季度
- 中型项目：每月
- 大型项目：每两周

**审查内容**：
- [ ] 文档与代码一致性
- [ ] 文档间是否有重复
- [ ] 文档定位是否清晰
- [ ] 链接是否有效
- [ ] 示例代码是否可运行

---

## 快速参考

### 代码变更 → 文档更新对照表

| 代码变更 | 必须更新文档 | 可选更新文档 |
|---------|-------------|-------------|
| **新增服务** | `docs/api/services-guide.md` | - |
| **修改服务API** | `docs/api/services-guide.md` | - |
| **新增仓储** | `docs/api/repositories.md` | - |
| **修改仓储API** | `docs/api/repositories.md` | - |
| **新增功能特性** | `docs/design/[feature-name].md` | `docs/development/CHANGELOG.md`（如存在） |
| **修复用户常见问题Bug** | `docs/development/troubleshooting.md` | - |
| **修复功能实施中的Bug** | **`docs/design/[feature-name].md`**（详细）+ **`docs/development/CHANGELOG.md`**（1行） | - |
| **架构调整** | `docs/architecture/architecture.md` | `CLAUDE.md`（如影响约束） |
| **新增配置项** | `docs/development/setup.md`（如需） | README（简化版） |
| **新增开发陷阱** | `CLAUDE.md` | - |
| **新增测试用例** | - | - |
| **UI变更** | - | `docs/development/coding_standards.md`（如涉及规范） |
| **新增组件** | `docs/api/components-guide.md`（如需） | - |

---

### 文档定位速查

**我想...应该更新哪个文档？**

| 我想... | 应该更新 | ❌ 不要更新 |
|---------|----------|--------------|
| 记录新 API | `docs/api/services-guide.md` 或 `repositories.md` | `README.md`（详细API） |
| 说明新功能 | `docs/design/[feature-name].md` | workflow.md（详细内容） |
| 记录技术决策 | `docs/architecture/architecture.md` | 所有其他文档 |
| 更新进度 | `docs/development/CHANGELOG.md` | 所有其他文档 |
| 添加配置说明 | `docs/development/setup.md`（如需） | `README.md`（详细） |
| 记录 Bug 解决 | `docs/development/troubleshooting.md` 或 `design/[feature-name].md` | `README.md` |
| 记录陷阱 | `CLAUDE.md` | 所有其他文档 |
| 更新编码规范 | `docs/development/coding_standards.md` | `CLAUDE.md`（只放约束） |

---

## 相关文档

- [开发工作流程](workflow.md) - 开发流程和设计文档管理
- [编码规范](coding_standards.md) - 详细编码规范
- [设计文档指南](../design/README.md) - 如何创建和使用设计文档
- [架构概览](../architecture/architecture.md) - 项目架构决策和DDD分层实现
- [CLAUDE.md](../../CLAUDE.md) - AI助手工作指南

---

**最后更新**：2026-03-04
**维护者**：项目维护团队
