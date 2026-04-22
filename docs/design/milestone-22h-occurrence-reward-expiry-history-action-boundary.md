# 里程碑-22H：表现项奖励时效与历史项动作边界收口 详细设计文档

> **设计状态**：🟢 审核通过（可实施）
> **创建日期**：2026-04-22
> **设计者**：GPT5 Codex
> **审核者**：项目维护者
> **预计工期**：1-2 天

---

## 📋 目录

- [需求分析](#需求分析)
- [技术方案](#技术方案)
- [代码结构](#代码结构)
- [实施步骤](#实施步骤)
- [测试方案](#测试方案)
- [风险评估](#风险评估)
- [替代方案](#替代方案)

---

## 需求分析

### 功能描述

`M21L` 已把表现项做成正式能力，`M22G` 又完成了表现项管理页的信息架构与交互收口。但在真实使用中，又暴露出两类新的边界问题：

1. 表现项和普通任务一样都会发放星星，但当前表现项编辑页没有“星星有效期”配置，实际创建时也不会传 `pointsExpiry`，最终默认落成 `permanent`。这和普通任务已有的时效能力不一致，用户会自然追问“为什么表现项的星星没有有效期”。
2. 表现项管理页已经把配置分成 `生效中 / 待生效 / 历史项` 三类，但历史项当前仍沿用和生效项相同的动作区，继续暴露 `编辑 / 停用 / 删除`。其中历史项再“停用”没有业务意义，继续暴露写动作也会让用户产生“是不是还能改回来 / 改坏历史数据”的疑问。

因此，`M22H` 不再重做表现项页面结构，而是专门收口这两个边界：

- 表现项奖励正式支持星星有效期，和普通任务保持一致
- 历史项彻底去写操作，避免继续暴露不合理动作

本期目标是让“表现项怎么发星星、历史项还能不能动”这两件事都变成清晰、稳定、可解释的正式规则。

### 已冻结的产品决策

本期在进入设计前，已由项目维护者明确拍板以下两条规则：

1. **表现项奖励需要支持星星有效期**
   - 不再接受“表现项默认永久有效但页面不表达”的隐含规则
   - 表现项应和普通任务一样，支持 `permanent / week / month / quarter`

2. **历史项不再保留停用、编辑和删除动作**
   - 历史项只作为归档可读信息保留
   - 历史项上不再出现任何写操作入口

### 评审后补充冻结（2026-04-22）

在正式设计评审后，本期再补充冻结两条实现边界：

1. **“历史项只读”定义为系统级业务规则**
   - 不只是当前管理页不显示按钮
   - 还要把历史项上的更新、停用、删除收口为正式拒绝规则
   - 前端、服务层、后端口径必须一致

2. **表现项奖励有效期的最少验证标准提升为完整奖励链路**
   - 不只验证表单和 payload
   - 还要验证：`配置 -> 记录成功 -> 星星入桶 -> 撤销成功 -> 原桶扣回`
   - 避免出现“页面能选有效期，但真实奖励仍按永久有效结算”的假闭环

### 业务价值

- [x] 用户价值：表现项奖励规则与普通任务统一，用户不再困惑“为什么这个有时效，那个没有”
- [x] 产品价值：历史项回归只读归档语义，页面上的动作都“可见且合理”
- [x] 技术价值：减少表现项页继续暴露无意义写入口的风险，统一任务奖励时效口径

### 功能范围

**包含**：
- ✅ 为表现项配置补齐 `pointsExpiry` 编辑能力
- ✅ 表现项创建 / 更新链路补齐 `pointsExpiry` 读写
- ✅ 表现项列表卡片继续展示星星数量，但不额外新增复杂时效文案
- ✅ 历史项卡片移除 `编辑` 主动作
- ✅ 历史项卡片移除 `更多` 入口及其派生写操作
- ✅ 按状态收口表现项动作矩阵，并补齐对应自动化测试

**不包含**：
- ❌ 修改普通任务星星有效期规则
- ❌ 修改星星桶结算规则或奖池时效规则
- ❌ 新增“恢复历史项”能力
- ❌ 新增历史项详情页
- ❌ 重做 `M22G` 已完成的页面整体布局

### 优先级

- **优先级**：P1
- **理由**：这两个问题都不是底层能力缺失导致的系统不可用，但它们直接影响用户对已交付表现项能力的理解和信任，且范围集中、收益直接，适合作为 M22G 后的紧随收口项。

---

## 技术方案

### 方案概述

`M22H` 采用“**规则补齐 + 动作收口**”方案：

1. 表现项编辑页补入 `pointsExpiry`，复用普通任务现有星星有效期枚举和默认值
2. 表现项创建 / 更新 payload 把 `pointsExpiry` 正式纳入 authoritative 字段
3. 历史项卡片按状态降为纯只读卡片，不再暴露任何写操作
4. `生效中 / 待生效 / 历史项` 三组卡片采用明确动作矩阵，而不是全状态共用同一套按钮

本期不扩后端新接口，不改数据库字段结构，只复用任务模型中已存在的 `pointsExpiry` 能力和现有表现项数据结构。

### 技术选型

| 技术点 | 选择方案 | 替代方案 | 选择理由 |
|--------|---------|---------|---------|
| 表现项星星有效期 | 复用现有 `Task.pointsExpiry` | 单独为表现项新增字段 | 现有任务模型已支持，避免重复建模 |
| 历史项动作收口 | 前后端同步收口为系统级只读规则 | 只改页面按钮显隐 | 已明确冻结为系统级业务规则，不能只做 UI 遮挡 |
| 动作矩阵来源 | 基于 `task-occurrence-display` 衍生展示字段 | 页面内临时 if/else | 避免页面再次堆积状态判断逻辑 |

### DDD 分层设计

**领域层（models/）**：
- [ ] 新建模型：无
- [ ] 修改模型：无（除非实施中发现缺少历史项只读校验入口再补充）
- 说明：现有前后端 `Task` 模型已承载 `pointsExpiry`，本期原则上不扩模型字段。

**服务层（services/）**：
- [ ] 新建服务：无
- [x] 修改服务：`services/task-service/`
- [x] 修改服务：`backend/services/taskService.js`
- 说明：除补齐表现项 payload 的 `pointsExpiry` 透传外，还要把历史项上的更新、停用、删除收口为正式拒绝规则。

**仓储层（repositories/）**：
- [ ] 新建仓储：无
- [ ] 修改仓储：无
- 说明：当前仓储与数据库已有 `points_expiry` 字段，不需要新增仓储接口。

**适配器/工具层（utils/）**：
- [ ] 新建工具：无
- [x] 修改工具：`utils/task-occurrence-display.js`
- 说明：为展示模型补齐动作矩阵字段，避免页面重复判断历史项是否可操作。

**表现层（pages/、components/）**：
- [x] 修改页面：`pages/task-occurrence-edit/`
- [ ] 新建页面：无
- [ ] 新建组件：无
- 说明：表现项编辑页补星星有效期输入，历史项动作区按状态收口。

### 数据模型

```typescript
type PointsExpiry = 'permanent' | 'week' | 'month' | 'quarter';

interface OccurrenceDraft {
  id: string;
  title: string;
  type: 'study' | 'habit' | 'interest';
  points: number;
  pointsExpiry: PointsExpiry;
  startDate: string;
  endDate: string;
  hasNoEndDate: boolean;
}

interface OccurrenceCardActionState {
  canEdit: boolean;
  canOpenMore: boolean;
}
```

### 接口设计

本期不新增新接口，但要补齐现有接口的字段消费与状态拒绝规则。

**前端服务接口变更**：

| 方法 | 说明 | 参数 | 返回值 |
|------|------|------|--------|
| `taskService.createTask` | 新建表现项时支持 `pointsExpiry` | `taskData.pointsExpiry` | `{ success, task, ... }` |
| `taskService.updateTask` | 编辑表现项时支持 `pointsExpiry` | `changes.pointsExpiry` | `{ success, task, ... }` |
| `taskService.recordOccurrenceResult` | 按配置有效期发星星并支持同桶撤销 | `taskId, outcome` | `{ success, record, ... }` |

**后端 authoritative 写接口收口**：

| 路径 | 说明 | 预期行为 |
|------|------|---------|
| `backend/services/taskService.updateTask` | 历史表现项通用更新 | 拒绝并抛出 `TASK_OCCURRENCE_HISTORY_READONLY` |
| `backend/services/taskService.disableOccurrenceTask` | 历史表现项停用 | 拒绝并抛出 `TASK_OCCURRENCE_HISTORY_READONLY` |
| `backend/services/taskService.softDeleteTask` | 历史表现项删除 | 拒绝并抛出 `TASK_OCCURRENCE_HISTORY_READONLY` |
| `backend/controllers/taskController.updateTask` | 更新接口错误映射 | 返回 409 + `TASK_OCCURRENCE_HISTORY_READONLY` |
| `backend/controllers/taskController.disableOccurrenceTask` | 停用接口错误映射 | 返回 409 + `TASK_OCCURRENCE_HISTORY_READONLY` |
| `backend/controllers/taskController.deleteTask` | 删除接口错误映射 | 返回 409 + `TASK_OCCURRENCE_HISTORY_READONLY` |

**页面展示模型变更**：

| 方法 | 说明 | 参数 | 返回值 |
|------|------|------|--------|
| `buildOccurrenceCardViewModel` | 输出状态相关动作矩阵 | `(item, today)` | `cardViewModel.canEdit / canOpenMore` |

### 关键设计决策

#### 决策1：表现项星星有效期与普通任务完全对齐

本期正式冻结：

- 表现项编辑页新增 `星星有效期`
- 可选值复用普通任务既有四档：
  - `permanent`
  - `week`
  - `month`
  - `quarter`
- 默认值继续为 `permanent`
- 交互范式必须与任务页保持一致，而不是只复用字段和值

原因：

- 当前任务模型和后端模型都已经支持 `pointsExpiry`
- 用户对“表现项发星星”与“普通任务发星星”的心智是同一类奖励
- 继续把表现项默认为永久有效，会制造不必要的规则分叉

#### 决策1A：星星有效期的组件、布局和表单顺序必须与任务页对齐

本期正式冻结：

- 表现项编辑层中的 `星星有效期`，必须复用任务页同类交互模式：
  - 默认展示为一行收起态摘要
  - 点击后打开独立的有效期选项面板
  - 不在正文直接平铺四个有效期选项
- 表单顺序固定为：
  - `名称`
  - `类别 / 星星`
  - `星星有效期`
  - `适用时间`
- 有效期选项顺序、文案、选中反馈与任务页保持一致：
  - `永久`
  - `本周结束`
  - `本月结束`
  - `本季度结束`
- 若表现项编辑层因轻面板布局需要做样式微调，只允许做尺寸和留白级微调，不允许换成交互范式

原因：

- 用户在任务页已经形成“星星后面紧跟星星有效期”的使用心智
- 若表现项改成另一套控件或换了字段顺序，会制造“同类奖励，两套表单”的割裂感
- `M22G` 已经冻结了表现项编辑层必须与站内现有表单系统保持同一视觉语言，本期不能破坏这个前提

#### 决策2：历史项正式降为只读，不再保留任何写动作

本期正式冻结：

- 历史项不再显示 `编辑`
- 历史项不再显示 `更多`
- 历史项不再保留 `停用 / 删除 / 编辑` 的任何入口
- 历史项即使被绕过页面按钮，也不允许通过正式写接口继续更新、停用或删除

原因：

- “停用历史项”没有业务意义
- 当前也不再允许“历史项编辑恢复”
- 删除历史项虽然技术上可做，但在产品语义上会让“历史归档”变得不稳定
- 既然已经冻结成正式产品规则，就不能只靠前端隐藏按钮维持

#### 决策3：动作矩阵按状态显式冻结

本期动作矩阵固定为：

| 状态 | 编辑 | 更多 |
|------|------|------|
| 生效中 | ✅ 保留 | ✅ 保留 |
| 待生效 | ✅ 保留 | ✅ 保留 |
| 历史项 | ❌ 移除 | ❌ 移除 |

说明：

- `待生效` 仍属于未来将生效的配置，继续允许家长调整或提前停用
- `历史项` 只读，不承载任何后续维护动作

#### 决策3A：历史项只读规则必须前后端同时成立

本期正式冻结以下系统级规则：

- 历史项不允许走表现项通用更新
- 历史项不允许再执行 `disableOccurrenceTask`
- 历史项不允许再执行前端 `deleteTask` / 后端 `softDeleteTask`

推荐实现口径：

- 前端页面：不再暴露入口
- 前端服务层：若已拿到状态信息，可提前拒绝并给出用户友好提示，但这只是优化，不算 authoritative
- 后端/服务层：作为 authoritative 规则兜底，必须在真实写库入口统一拒绝
- 后端控制器：必须把该错误稳定映射为 `409 Conflict`，避免前端只能收到泛化的 500

推荐错误语义：

- `TASK_OCCURRENCE_HISTORY_READONLY`
- 文案：`历史项仅保留查看，不支持继续修改`
- 覆盖范围：`updateTask / disableOccurrenceTask / softDeleteTask`

#### 决策4：本期不新增历史项详情页

历史项动作移除后，页面只保留：

- 标题
- 日期范围
- 星星数
- 历史项状态标签

本期不新增“查看详情”或“历史项详情页”，避免范围扩散。

---

## 代码结构

### 文件变更清单

**新增文件**：
- 无

**修改文件**：
- `docs/design/milestone-22h-occurrence-reward-expiry-history-action-boundary.md` - 本设计文档
- `pages/task-occurrence-edit/task-occurrence-edit.js` - 表现项草稿初始化/回填、保存 payload 与动作矩阵消费
- `pages/task-occurrence-edit/task-occurrence-edit.wxml` - 按任务页同类结构补齐星星有效期摘要行/选项面板，并收口历史项动作
- `pages/task-occurrence-edit/task-occurrence-edit.wxss` - 星星有效期控件样式与任务页同范式对齐，并收口历史项动作区
- `services/task-service/task-write.js` - 历史项写保护与表现项奖励链路测试配合点
- `backend/services/taskService.js` - 历史项 update / disable / softDelete authoritative 拒绝规则
- `backend/controllers/taskController.js` - 历史项 update / disable / delete 错误映射口径
- `utils/task-occurrence-display.js` - 输出动作矩阵展示字段
- `test/pages/task-occurrence-edit.page.test.js` - 页面状态、动作矩阵与 `pointsExpiry` 回填测试
- `test/utils/task-occurrence-display.test.js` - 展示模型动作矩阵测试
- `backend/test/unit/taskController-m07.test.js` - 历史项 update / disable / delete 返回 409 与错误码测试
- `backend/test/integration/task-api-m21l-real.test.js` 或新增 occurrence 定向集成测试 - 历史项 REST 写接口正式拒绝
- `test/services/task-service.test.js` 或 occurrence 相关定向测试 - 表现项奖励有效期链路测试

### 核心代码结构

```javascript
function getDefaultDraft() {
  return {
    title: '',
    type: 'study',
    points: 1,
    pointsExpiry: 'permanent',
    startDate: today,
    endDate: '',
    hasNoEndDate: true
  };
}

function buildOccurrenceTaskPayload(draft, targetUserId) {
  return {
    userId: targetUserId,
    title: draft.title,
    type: draft.type,
    points: draft.points,
    pointsExpiry: draft.pointsExpiry,
    executionMode: 'occurrence',
    activeRange: { ... }
  };
}

function buildDraftFromItem(item) {
  return {
    ...,
    pointsExpiry: item.pointsExpiry || 'permanent'
  };
}

function buildPointsExpirySummary(expiry) {
  return taskFormDisplay.buildPointsExpiryText(expiry || 'permanent');
}

function buildOccurrenceCardViewModel(item, today) {
  const statusKey = resolveStatusKey(...);
  return {
    ...,
    canEdit: statusKey !== 'history',
    canOpenMore: statusKey !== 'history'
  };
}

function assertOccurrenceHistoryWritable(task, today) {
  if (resolveStatusKeyFromTask(task, today) === 'history') {
    const error = new Error('历史项仅保留查看，不支持继续修改');
    error.code = 'TASK_OCCURRENCE_HISTORY_READONLY';
    throw error;
  }
}
```

### 关键函数

**函数1**：`buildOccurrenceTaskPayload`
- **输入**：`draft, targetUserId`
- **输出**：表现项写入 payload
- **职责**：把 `pointsExpiry` 正式纳入表现项创建/更新链路
- **依赖**：`Task` 既有 `pointsExpiry` 字段

**函数2**：`buildDraftFromItem`
- **输入**：`item`
- **输出**：表现项编辑草稿
- **职责**：编辑已有表现项时回填 `pointsExpiry`
- **依赖**：表现项现有任务模型字段

**函数3**：`buildPointsExpirySummary`
- **输入**：`expiry`
- **输出**：摘要文案
- **职责**：复用任务页既有有效期文案，保证表现项与任务页一致
- **依赖**：任务表单现有 `pointsExpiry` 文案映射

**函数4**：`buildOccurrenceCardViewModel`
- **输入**：`item, today`
- **输出**：卡片展示模型
- **职责**：统一输出状态文案和动作矩阵
- **依赖**：`resolveStatusKey`

**函数5**：`assertOccurrenceHistoryWritable`
- **输入**：`task, today`
- **输出**：允许继续写入 / 抛出只读错误
- **职责**：把历史项只读规则落实到服务/后端 authoritative 兜底
- **依赖**：表现项状态判断逻辑

---

## 实施步骤

### 第1步：补齐表现项草稿与写入字段（预计2小时）

- [ ] **任务**：在表现项编辑草稿中新增 `pointsExpiry`，并补齐 create/update payload
- [ ] **验证**：创建和编辑表现项时能正确透传 `pointsExpiry`
- [ ] **依赖**：无

**实施要点**：
1. 默认值设为 `permanent`
2. 编辑已有表现项时正确回填
3. `buildOccurrenceTaskPayload` 与 `buildDraftFromItem` 两端都要补齐，避免只写不回填
4. 摘要文案、选项顺序和面板交互复用任务页既有模式
5. 字段落位固定在 `类别/星星` 之后、`适用时间` 之前
6. 不改现有 `Task` 模型基础能力，只补页面消费

---

### 第2步：收口历史项动作矩阵与系统级只读规则（预计3小时）

- [ ] **任务**：按 `statusKey` 裁剪卡片动作，并把历史项更新/停用/删除提升为系统级拒绝规则
- [ ] **验证**：历史项卡片不再显示 `编辑 / 更多`，且绕过页面调用写接口也会被拒绝
- [ ] **依赖**：第1步无依赖，可并行

**实施要点**：
1. 动作矩阵下沉到展示模型
2. 页面不再散落状态 if/else
3. 保持生效中、待生效现有动作不受影响
4. 后端 authoritative 拦截点必须覆盖 `updateTask / disableOccurrenceTask / softDeleteTask`
5. 控制器必须把 `TASK_OCCURRENCE_HISTORY_READONLY` 稳定映射为 409
6. 前后端错误码和用户提示语义保持一致

---

### 第3步：补齐页面交互、奖励链路与样式（预计3小时）

- [ ] **任务**：为编辑层新增星星有效期控件，并验证记录成功/撤销时按同一有效期桶结算
- [ ] **验证**：页面布局稳定，历史项动作区收口后不出现空洞或错位，表现项奖励按配置有效期入桶并原桶撤销
- [ ] **依赖**：第1步、第2步完成

**实施要点**：
1. 复用现有任务页的有效期文案、选项顺序和面板交互
2. 不新增多余解释文案
3. 不为了“区别表现项”另造一套铺开式控件或不同字段顺序
4. 历史项卡片动作区收口后保持视觉平衡
5. 记录成功与撤销必须验证 `record.pointsExpiry` 真正参与星星加减

---

### 第4步：补齐测试与文档同步（预计2小时）

- [ ] **任务**：补页面测试、展示模型测试，并同步设计文档状态
- [ ] **验证**：相关测试通过，文档与实现一致
- [ ] **依赖**：前3步完成

**实施要点**：
1. 锁定 `pointsExpiry` 默认值和回填行为
2. 锁定历史项无动作的展示规则
3. 锁定历史项 `update / disable / delete` 三条写路径都返回同一错误码与状态码
4. 锁定表现项奖励按配置有效期入桶并按原桶撤销
5. 同步设计文档中的文件清单、测试清单和评审结论

---

## 测试方案

### 单元测试

| 测试项 | 测试方法 | 预期结果 |
|--------|---------|---------|
| 表现项草稿默认有效期 | 页面草稿初始化 | `pointsExpiry === 'permanent'` |
| 表现项编辑回填有效期 | 从已有 occurrence 配置进入编辑 | 页面正确回填已有 `pointsExpiry` |
| 表现项写入透传有效期 | 保存 create/update payload | 请求中包含 `pointsExpiry` |
| 表现项编辑回填默认兜底 | 历史数据缺少 `pointsExpiry` 时进入编辑 | 页面回填为 `permanent`，不出现空值 |
| 表现项有效期展示模式 | 页面结构测试 | 使用任务页同类“摘要行 + 独立面板”交互，不直接平铺选项 |
| 表现项表单顺序 | 页面结构测试 | `类别/星星` 后紧跟 `星星有效期`，再进入 `适用时间` |
| 表现项有效期文案一致性 | 页面文案测试 | 摘要文案与任务页 `pointsExpiry` 文案完全一致 |
| 历史项动作矩阵 | 展示模型测试 | `history.canEdit === false` 且 `history.canOpenMore === false` |
| 生效中/待生效动作保留 | 展示模型测试 | 两者仍保留可编辑/更多入口 |
| 历史项系统级只读 | 前端服务、后端服务、控制器测试 | update / disable / delete 均返回 `TASK_OCCURRENCE_HISTORY_READONLY` |
| 历史项接口状态码 | 控制器/API 测试 | update / disable / delete 均返回 HTTP 409 |
| 表现项奖励有效期闭环 | 服务层奖励链路测试 | `配置 -> 记录成功 -> 星星入桶 -> 撤销成功 -> 原桶扣回` 全链路成立 |

### 集成测试

- [ ] 场景1：新建带 `pointsExpiry=week` 的表现项后，重新进入编辑页能正确回填
- [ ] 场景1A：新建和编辑表现项时，`星星有效期` 在编辑层中的位置、摘要文案和弹出面板与任务页保持一致
- [ ] 场景2：历史项卡片不再出现任何写入口
- [ ] 场景3：待生效项仍可编辑和停用
- [ ] 场景4：历史项绕过页面直接调用 `PUT /tasks/:id`、停用接口、`DELETE /tasks/:id` 时均返回 409 + `TASK_OCCURRENCE_HISTORY_READONLY`
- [ ] 场景5：表现项记录成功后星星进入 `week/month/quarter` 对应桶，撤销时从同桶扣回

### 手动测试

1. **表现项星星有效期**
   - [ ] 新建表现项时可选有效期
   - [ ] 默认值为永久有效
   - [ ] 编辑已有表现项时有效期正确回填
   - [ ] 字段位置在 `星星` 后、`适用时间` 前
   - [ ] 交互为“摘要行 + 独立选项面板”，不在正文直接平铺
   - [ ] 摘要文案与任务页保持一致
   - [ ] 记录成功后，星星进入所选有效期桶
   - [ ] 撤销成功后，从同一有效期桶正确扣回

2. **历史项动作收口**
   - [ ] 历史项卡片不显示编辑
   - [ ] 历史项卡片不显示更多
   - [ ] 点击历史项不会再出现停用/删除动作面板
   - [ ] 绕过页面直接请求历史项写接口时，被系统正式拒绝

3. **状态矩阵稳定性**
   - [ ] 生效中项仍可编辑和更多
   - [ ] 待生效项仍可编辑和更多
   - [ ] 历史项仍保持只读展示，不影响分页/折叠交互

---

## 风险评估

| 风险 | 影响 | 概率 | 应对方案 |
|------|------|------|----------|
| 表现项新增有效期后，和普通任务表单文案不一致 | 中 | 中 | 直接复用既有有效期枚举与文案 |
| 表现项有效期若换成不同组件或字段顺序，会与任务页形成割裂 | 中 | 中 | 设计上显式冻结同一交互范式，并用页面结构测试锁定 |
| 历史项去掉全部动作后，用户担心“历史数据是不是不能看了” | 低 | 中 | 保留完整只读卡片信息，不额外隐藏历史项本身 |
| 历史项只读若只改页面、不改 authoritative 规则，会继续被绕过 | 高 | 中 | 本期正式提升为系统级业务规则，并补前后端拒绝测试 |
| 历史项若只拦更新/停用，漏掉后端 `softDeleteTask`，规则会出现缺口 | 高 | 中 | 设计中显式冻结 delete 收口到 `softDeleteTask`，并增加控制器/API 测试 |
| 页面动作按状态裁剪后，卡片布局出现不平衡 | 低 | 中 | 在样式层同步收口动作区留白与对齐 |
| 页面能选有效期，但真实记录发星星仍沿用旧默认桶 | 高 | 中 | 把奖励链路测试提升为本期最小验收标准，锁定入桶与撤销行为 |

---

## 替代方案

### 方案A：保持表现项奖励永久有效，只在文档中解释

不采用。

原因：

- 这会继续保留与普通任务的规则分叉
- 用户已经明确提出疑问，说明隐含规则不成立

### 方案B：历史项保留编辑，但去掉停用和删除

不采用。

原因：

- 当前已明确产品决策：历史项不再承载任何写操作
- 保留编辑会继续让“历史项是否可恢复”语义模糊

### 方案C：给历史项增加“查看详情”，替代编辑/更多

本期不采用。

原因：

- 会扩散到新页面或新弹层
- 当前问题是动作边界，不是详情不足
