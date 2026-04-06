# 里程碑-20B：星星域边界治理轻量收口 详细设计文档

> **设计状态**：🟢 审核通过
> **创建日期**：2026-04-06
> **设计者**：GPT5 Codex
> **审核者**：项目维护者
> **预计工期**：1-2天

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

复核真实代码后，星星域当前主链路并不是“错误实现”，而是“行为已基本正确，但边界分散在多个入口中，缺少统一、正式、可测试的治理表达”。

当前已经成立的事实包括：

- 星星域待同步真值是 `StarRecord.syncedToCloud !== true`
- 单用户云端刷新存在 pending-local 保护
- `syncExpiryAuthorityIfNeeded()` 只负责触发后端权威结算，不等于本地镜像已刷新
- family 分析场景同时依赖 `refreshStarsFromCloud(scope='family')` 与 `getFamilyStarSummary()`
- 奖励域、任务域、启动链路、首页、奖励页、分析页都在消费星星域，但入口语义并不完全写在一个地方

因此，`M20B` 不再定位为“新增一层星星域编排接口”的中型工程里程碑，而是改为一个轻量治理收口项：

1. 把星星域当前正式边界写清楚
2. 把最容易漂移的跨域调用点纳入统一测试矩阵
3. 用最小代码改动固化这些事实，避免后续又把星星域误当成 task/reward 的 queue 同构问题

### 业务价值

- [x] 用户价值：降低后续改动把星星余额、奖励可兑换状态、分析快照之间的既有一致性打坏的风险
- [x] 技术价值：把星星域的正式职责、非目标和跨域调用边界固化为可回归验证的事实
- [x] 维护价值：为后续 `M20E` 的前端职责清理提供更可靠的依据，区分“正式职责”与“历史兼容路径”

### 功能范围

**包含**：
- ✅ 固化星星域三类正式能力：`authority sync`、`records refresh`、`summary read`
- ✅ 固化 pending-local 保护、`forceCloudAfterAuthority` 正式语义与 family 双读模型
- ✅ 固化 6 类关键消费入口的场景矩阵：
  - 启动链路
  - 首页奖励区
  - 首页定时过期检查
  - 奖励页
  - 分析页
  - 奖励服务 / 任务查询的既有跨域入口
- ✅ 补齐针对现有正式行为的测试与必要注释
- ✅ 明确与 `M09`、`M19E`、`M20A` 的边界关系

**不包含**：
- ❌ 不把星星域迁入统一 `OfflineQueueService`
- ❌ 不新增后端接口、数据库表或新的存储模型
- ❌ 不默认新增公开的 `prepareStarCloudSnapshot()` / `prepareFamilyStarReadModel()` wrapper 接口
- ❌ 不重写页面调用顺序，只在发现真实不一致时做最小修正
- ❌ 不改写 `M09 requireFreshStars` 既有契约
- ❌ 不把 `M20A MutationContext` 引入星星域读侧编排

### 优先级

- **优先级**：P2
- **理由**：它不是用户功能交付项，也不是已暴露 bug 的修复项；但作为轻量治理收口，可以用较小成本降低未来回归风险。它不应再作为 3-5 天的独立大项实施。

---

## 技术方案

### 方案概述

`M20B` 采用“保留现有行为，不新增默认公共 wrapper，只固化边界、注释与测试”的轻量方案。

核心原则：

1. **现有正式行为优先于接口包装**  
   当前代码在多个入口上已经形成可工作的事实链路。本期优先把事实写清楚、测清楚，而不是先抽象出新的公共 API。

2. **边界治理优先于接口统一**  
   星星域和 task/reward 不是同构问题。本期重点是解释“为什么不同”，而不是形式上凑成一样。

3. **测试优先于新抽象**  
   真正有价值的是把关键场景锁成回归测试，而不是把两行组合调用抽成一个新名字。

4. **只在发现真实漂移时做最小实现收口**  
   如果在实施中确认某一组顺序在 2 个以上入口重复且已经造成测试漂移，可以提炼私有 helper；但不默认新增公开服务接口。

### 当前正式语义

#### 1. 星星域待同步模型

- 正式真值：`StarRecord.syncedToCloud !== true`
- 这不是 task/reward 的 mutation queue 模型
- `_syncStarRecordToCloud()` 与 `_syncConsumeToCloud()` 是写路径补云能力，不等于 queue drain

#### 2. 三类正式能力

- `authority sync`
  - 入口：`syncExpiryAuthorityIfNeeded()`
  - 语义：触发后端权威到期结算
  - 非语义：不承诺本地镜像已刷新

- `records refresh`
  - 入口：`refreshStarsFromCloud()`
  - 单用户语义：受 pending-local 保护
  - family 语义：只刷新家庭流水，不提供当前家庭余额汇总

- `summary read`
  - 入口：`getFamilyStarSummary()`
  - 语义：提供家庭当前余额与分组快照
  - family 分析场景不得退化为“只靠 records 自己前端聚合”

#### 3. `forceCloudAfterAuthority` 正式语义

沿用现有参数名，但正式含义定义为：

- “调用方已知服务端权威状态刚发生变更，因此允许本次绕过 pending-local 保护”

当前允许场景仅限：

- authority sync 成功后
- 奖励兑换成功后
- 奖励取消兑换成功后

它不是“所有 refresh 都可强刷”的开关，也不再解释为“仅 authority 后可用”的字面语义。

#### 4. family 双读模型

family 视角下有两个并行正式来源：

- `refreshStarsFromCloud(null, { scope: 'family' })` 提供家庭流水镜像
- `getFamilyStarSummary({ force: true })` 提供家庭当前余额与分组快照

在分析页中，正式执行顺序保持为：

1. 先做 `authority sync(scope='family')`
2. authority 成功后，并行执行：
   - family records refresh
   - family summary read

### 现状问题矩阵

| 模块 / 场景 | 当前做法 | 本期处理 |
|------|---------|---------|
| `services/star-service.js` 写路径 | 本地先写，再异步 `_syncStarRecordToCloud()` / `_syncConsumeToCloud()` 补云 | 补齐注释与测试，明确它不是 queue 模型 |
| `hasPendingLocalStarRecords()` | 以 `syncedToCloud !== true` 识别 pending | 固化为正式边界，不另造新 pending 模型 |
| `refreshStarsFromCloud(user)` | 有 pending 本地流水时跳过云端覆盖 | 补齐测试和文档，防止后续误改 |
| `syncExpiryAuthorityIfNeeded()` | 节流/in-flight 后触发权威结算 | 补齐注释，明确“不代表本地已刷新” |
| `getFamilyStarSummary()` | 独立 summary 读取入口 | 固化 family 双读模型 |
| `services/reward-service.js` | 读前余额对齐、兑换成功、取消兑换成功后会直接刷新星星 | 明确为正式例外消费路径 |
| 首页奖励区链路 | 直接加载与“前序检查后跳过重复 authority”两条路径并存 | 本期要把 `skipAuthoritySync` 分支写成正式契约 |
| `services/task-service/task-query.js` | `requireFreshStars=true` 时在任务读取前直连刷新星星 | 明确保留为 M09 既有契约，不迁移 |
| `packageChart/components/star-calendar` | fallback 模式下可直连刷新星星 | 明确只允许作为非统一读模型兼容路径 |
| `OfflineQueueService` | 只承接 task/reward | 不改实现，只复用 M19E 既有结论并补引用关系 |

### 场景调用矩阵

| 场景 | authority sync | stars refresh | family summary | reward refresh | 正式 owner |
|------|----------------|---------------|----------------|----------------|-----------|
| 登录后初始化 | 是，`scope='user'`，`force=true` | 是，`forceCloudAfterAuthority=true` | 否 | 是 | `post-login-bootstrap` |
| 首页奖励区直接加载 | 是，`scope='user'` | 是，`forceCloudAfterAuthority=true` | 否 | 是 | `index-reward-flow` |
| 首页定时过期检查 | 是，`scope='user'` | 否 | 否 | 否 | `index-refresh-coordinator` |
| 首页检查后的奖励区刷新 | 否，复用前序检查结果 | 是，`forceCloudAfterAuthority=true` | 否 | 是 | `index-refresh-coordinator -> index-reward-flow(skipAuthoritySync=true)` |
| 奖励页 `onShow` | 是，`scope='user'`，不强制 | 是，`forceCloudAfterAuthority=true` | 否 | 是 | `pages/rewards/rewards.js` |
| 奖励页下拉刷新 | 是，`scope='user'`，`force=true` | 是，`forceCloudAfterAuthority=true` | 否 | 是，`force=true` | `pages/rewards/rewards.js` |
| 奖励兑换前余额读取 | 否 | 允许普通 user refresh | 否 | 否 | `RewardService._getUserAvailableStars()` |
| 奖励兑换/取消兑换成功后 | 否 | 是，`forceCloudAfterAuthority=true` | 否 | 按现状执行 | `RewardService` |
| 分析页单用户 prepare | 是，`scope='user'` | 是，普通 user refresh | 否 | 否 | `AnalyticsService.prepareReadModel()` |
| 分析页 family prepare | 是，`scope='family'` | 是，family records refresh | 是，`force=true` | 否 | `AnalyticsService.prepareReadModel()` |
| 任务域读前余额对齐 | 否 | `requireFreshStars=true` 时允许普通 user refresh | 否 | 否 | `task-query.js` |

补充约束：

1. `AnalyticsService.prepareReadModel()` 继续是分析页唯一编排 owner。
2. `task-query.js` 的 `requireFreshStars` 仍是 M09 任务域契约，不并入页面场景编排。
3. `star-calendar` fallback 不得反向升级成新的分析页 owner。
4. 本地模式继续走 `calculatePendingExpiry()`、`protectRewardsByExpiry()`、`initialize()`、`checkAndRepairDataConsistency()` 既有链路。
5. 首页存在正式的 `skipAuthoritySync` 分支：若 authority 已由前序检查完成，后续奖励区刷新必须跳过重复 authority。
6. 奖励页 `onShow` 与下拉刷新不是同一语义：前者走普通 authority 检查，后者走 `force=true` 强制刷新。

### 与既有里程碑的关系

#### 与 M09 的关系

- 保留 `task-query.js` 中 `requireFreshStars=true -> refreshStarsFromCloud(userId)` 的既有正式语义
- 本期不把这条路径改成新的场景化接口

#### 与 M19E 的关系

- M19E 已经正式给出“星星域本期不接入统一 queue”的结论
- M20B 不重复发明该结论，只把它与当前真实调用点关联起来

#### 与 M20A 的关系

- `MutationContext` 继续只约束任务/奖励等写侧 actor 语义
- M20B 处理的是星星域读侧治理，不引入 `MutationContext`

### 技术选型

| 技术点 | 选择方案 | 不采用方案 | 理由 |
|--------|---------|-----------|------|
| 治理方式 | 注释 + 测试 + 最小实现收口 | 新增一层公开 wrapper 接口 | 当前收益主要来自固化事实，不来自新抽象 |
| 星星域待同步模型 | 保留 `syncedToCloud` 流水模型 | 迁成 queue item | 与 task/reward 语义不同，M19E 已给出边界 |
| family 读模型 | 保留 records + summary 双读模型 | 只保留其中之一 | 与现有分析实现不一致，且会丢语义 |
| task-query 边界 | 保留 M09 直连刷新语义 | 并入页面统一编排 | 它是任务域读前余额对齐，不是页面刷新 orchestration |
| 代码抽象策略 | 仅在发现真实漂移时提炼私有 helper | 默认新增公开 `prepare*` 接口 | 避免为两三行组合调用引入新的抽象层 |

### 接口设计

本期默认 **不新增公开服务接口**。

正式依赖的仍然是以下既有方法：

| 方法 | 正式语义 | 关键字段 / 约束 |
|------|---------|----------------|
| `hasPendingLocalStarRecords(userId, options)` | pending-local 判定入口 | 以 `syncedToCloud !== true` 为真值 |
| `refreshStarsFromCloud(userId, options)` | records refresh 入口 | 单用户受 pending-local 保护；family 只刷新 records |
| `syncExpiryAuthorityIfNeeded(options)` | authority sync 入口 | `settledGroupCount` 等结果字段继续保留 |
| `getFamilyStarSummary(options)` | family summary 入口 | `totalPoints/groups/subjectUserIds` 继续保留 |

实现约束：

1. 不额外发明 `prepareStarCloudSnapshot()` / `prepareFamilyStarReadModel()` 公开接口。
2. 如果实施时确认某个模块内部确实需要去重，可提炼同文件私有 helper，但不能扩大为新的跨模块公共依赖。
3. 所有现有返回结构继续沿用，不新增“摘要版”返回模型。

---

## 代码结构

### 文件变更清单

**新增文件**：
- `docs/design/milestone-20b-star-domain-boundary-governance.md` - M20B 轻量治理设计文档

**修改文件**：
- `services/star-service.js` - 补齐正式边界注释与必要结构化日志
- `services/analytics-service.js` - 固化 family 双读模型与 owner 注释
- `services/reward-service.js` - 固化奖励域读前/写后星星刷新边界
- `services/task-service/task-query.js` - 固化 `requireFreshStars` 的 M09 契约边界
- `utils/app/post-login-bootstrap.js` - 补齐启动链路星星域正式顺序注释或必要断言
- `pages/index/modules/index-reward-flow.js` - 如需，补齐场景注释或最小一致性修正
- `pages/index/modules/index-refresh-coordinator.js` - 固化“只做 authority 检查”的边界
- `pages/rewards/rewards.js` - 如需，补齐奖励页正式顺序注释或最小一致性修正
- `packageChart/components/star-calendar/star-calendar.js` - 固化 fallback 边界，避免误扩散
- `test/services/star-service.test.js` - 补齐 pending-local、`_syncConsumeToCloud()`、authority 等边界测试
- `test/services/analytics-service.test.js` - 固化 family 双读模型与 owner 断言
- `test/services/reward-service.test.js` - 固化奖励域读前/写后星星刷新边界
- `test/app/post-login-bootstrap.test.js` - 固化启动链路顺序
- `test/pages/index.reward-flow.test.js` - 固化首页奖励区直接加载与 `skipAuthoritySync` 分支
- `test/pages/index.refresh-coordinator.test.js` - 固化首页定时检查边界
- 奖励页相关测试 - 固化 `onShow` 与 `onPullDownRefresh` 的不同强制语义
- `test/pages/star-calendar.component.test.js` - 固化 fallback 不夺取 owner

### DDD 分层设计

**领域层（models/）**：
- [ ] 不新增模型
- [ ] 不修改 `StarRecord` / `StarGroup`

**服务层（services/）**：
- [ ] 主要工作放在既有服务的边界注释与测试补齐
- [ ] 不默认新增新的星星域公开服务方法

**仓储层（repositories/）**：
- [ ] 不修改

**适配器层（utils/）**：
- [ ] 不新增 `star-sync-contract.js`
- [ ] 仅在既有启动链路工具中补正式边界说明

**表现层（pages/、components/）**：
- [ ] 只做最小一致性修正
- [ ] 不做系统性接线重构

### 核心代码结构

```javascript
class StarService {
  async hasPendingLocalStarRecords(userId = null, options = {}) {
    // 正式 pending-local 判定入口
  }

  async refreshStarsFromCloud(userId = null, options = {}) {
    // 正式 records refresh 入口
    // 单用户：受 pending-local 保护
    // family：只刷新 records
  }

  async syncExpiryAuthorityIfNeeded(options = {}) {
    // 正式 authority sync 入口
    // 不代表本地镜像已刷新
  }

  async getFamilyStarSummary(options = {}) {
    // 正式 family summary 入口
  }
}

class AnalyticsService {
  async prepareReadModel(input) {
    // 继续作为分析页唯一 owner
    // family: authority -> Promise.all(records refresh, summary read)
  }
}
```

### 关键函数

**函数1**：`refreshStarsFromCloud`
- **职责**：正式 records refresh 入口
- **关键约束**：
  - 单用户场景默认受 pending-local 保护
  - `forceCloudAfterAuthority` 只在已知权威变更后使用
  - family 只刷新 records，不返回 summary

**函数2**：`syncExpiryAuthorityIfNeeded`
- **职责**：正式 authority sync 入口
- **关键约束**：
  - 节流/in-flight 继续保留
  - 返回 `settledGroupCount` 等既有字段
  - 结果不等于本地镜像已刷新

**函数3**：`getFamilyStarSummary`
- **职责**：正式 family summary 入口
- **关键约束**：
  - 不与 family records refresh 混写成同一个来源

**函数4**：`AnalyticsService.prepareReadModel`
- **职责**：分析页唯一 read-model orchestration owner
- **关键约束**：
  - family 仍采用 `authority -> 并行 records + summary`
  - 不能让 `star-calendar` fallback 或其他星星域 helper 抢 owner

---

## 实施步骤

### 第1步：收口正式边界表述（预计0.5天）

- [ ] **任务**：在 `star-service.js`、`analytics-service.js`、`reward-service.js`、`task-query.js` 中补齐必要注释
- [ ] **验证**：关键边界在代码注释、设计文档和测试名中表述一致
- [ ] **依赖**：无

实施要点：

1. 明确 `authority != refresh`。
2. 明确 `family records != family summary`。
3. 明确 `_syncStarRecordToCloud()` 与 `_syncConsumeToCloud()` 都属于正式写路径补云。
4. 明确 `task-query requireFreshStars` 保留为 M09 既有契约。
5. 明确首页奖励区存在“直接加载”和“前序检查后跳过重复 authority”两条正式路径。

### 第2步：补齐核心测试矩阵（预计0.5-1天）

- [ ] **任务**：补齐星星域、奖励域、分析页、启动链路、首页定时检查的边界测试
- [ ] **验证**：新增测试能锁定现有正式行为
- [ ] **依赖**：第1步完成

实施要点：

1. 先补服务层测试，再补页面/启动链路测试。
2. 测试重点是边界和顺序，不是重复验证仓储细节。
3. 要显式覆盖 `_syncConsumeToCloud()`、family 并行策略、`star-calendar` fallback、`task-query` 既有边界。
4. 页面层必须显式覆盖首页 `skipAuthoritySync` 分支，以及奖励页 `onShow / onPullDownRefresh` 的 force 差异。

### 第3步：只修真实不一致点（预计0-0.5天）

- [ ] **任务**：若测试暴露出现有调用点存在真实漂移，再做最小代码修正
- [ ] **验证**：所有相关测试通过
- [ ] **依赖**：第2步完成

实施要点：

1. 不以“统一形式”为目标做重构。
2. 仅修“行为与正式矩阵不一致”的点。
3. 若确需抽公共逻辑，优先提炼私有 helper，不新增公开 wrapper。

---

## 测试方案

### 单元测试

| 测试项 | 测试方法 | 预期结果 |
|--------|---------|---------|
| 单用户存在 pending 本地流水 | `refreshStarsFromCloud(userId)` | 跳过云端覆盖，返回本地 groups/records |
| authority 后强制刷新 | `refreshStarsFromCloud(userId, { forceCloudAfterAuthority: true })` | 绕过 pending-local 保护 |
| 奖励兑换/取消兑换后强制刷新 | `RewardService` 写云成功后调用刷新 | 允许用服务端结果覆盖本地镜像 |
| 单条星星流水补云成功 | `_syncStarRecordToCloud()` | record 标记为 `syncedToCloud=true` |
| 单条扣星/消费补云成功 | `_syncConsumeToCloud()` | `updatedGroupsSnapshot` 回写本地 groups |
| group 回灌保护 | `_syncStarRecordToCloud()` | 仍有其他 pending 时不回灌 groups snapshot |
| authority 节流 | `syncExpiryAuthorityIfNeeded()` | 节流窗口内复用 |
| family 双读模型 | `AnalyticsService.prepareReadModel()` | authority 后并行执行 records + summary |
| family summary 读取 | `getFamilyStarSummary()` | 返回当前余额与 child group 快照 |
| 奖励服务边界 | `RewardService` | 读前/写后刷新场景符合设计矩阵 |
| task-query 既有边界 | `requireFreshStars=true` | 继续直连 `refreshStarsFromCloud(userId)` |
| 首页 `skipAuthoritySync` 分支 | `index-refresh-coordinator -> loadStarsAndRewards({ skipAuthoritySync: true })` | 前序已做 authority 时，不重复同步 |
| 奖励页 `onShow / 下拉刷新` 差异 | `pages/rewards/rewards.js` | `onShow` 不强制，`onPullDownRefresh` 使用 `force=true` |
| fallback 边界 | `star-calendar` 组件 | 仅非统一读模型时允许直连刷新 |

### 集成测试

- [ ] 启动链路在云端模式下维持 `authority -> stars -> rewards` 顺序
- [ ] 首页奖励区直接加载维持 `authority -> stars -> rewards` 顺序
- [ ] 首页定时检查后的奖励区刷新通过 `skipAuthoritySync=true` 跳过重复 authority
- [ ] 首页定时过期检查只做 authority 检查，不展开全量刷新
- [ ] 奖励页 `onShow` 维持普通 authority 检查，并保留本地降级
- [ ] 奖励页下拉刷新维持 `force=true` 的强制 authority / rewards 刷新
- [ ] 分析页 family 模式维持 `authority -> Promise.all(records, summary)`
- [ ] `task-query` 的 M09 既有契约不回归
- [ ] 星星域仍不接入 `OfflineQueueService`

### 手动测试

1. 家长自己视角进入首页，检查星星与奖励状态一致。
2. 进入奖励页，确认 authority 后余额与奖励可兑换状态一致。
3. 产生本地待同步星星流水后，再次刷新，确认普通刷新不会直接覆盖本地余额。
4. 家长进入分析页，确认 family 趋势与日历可正常读取家庭结果。
5. 多孩子家庭场景下，family summary 与家庭流水读取结果不冲突。

### 测试覆盖率目标

- 最低要求：85%
- 推荐目标：90%

---

## 风险评估

### 技术风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| 只做文档不做测试，后续边界继续漂移 | 中 | 高 | 把重点放在测试固化，而不是只写说明 |
| 为统一形式强行引入 wrapper，增加抽象但不增能力 | 中 | 中 | 明确本期不默认新增公开 wrapper |
| 误把 `task-query` 也并入页面编排，打坏 M09 既有契约 | 中 | 中 | 明确保留 `requireFreshStars` 原语义 |
| 误把 M20A `MutationContext` 扩散到星星域读侧 | 中 | 中 | 明确本期不处理写侧 actor 语义 |
| `star-calendar` fallback 再次绕开分析页 owner | 中 | 中 | 用组件测试锁定兼容边界 |

### 回滚策略

1. 本期默认不引入新的公开接口，回滚成本低。
2. 若只新增注释和测试，失败时回滚面主要在测试。
3. 若出现最小一致性修正，可逐文件回退，不涉及底层存储结构。

---

## 替代方案

### 方案A：维持原版 M20B，大规模新增 wrapper 与统一接线

优点：
- 形式上更“统一”

缺点：
- 主要收益来自包装现有调用，ROI 偏低
- 引入新的公开抽象层，但不增加真实能力
- 会把轻量治理项放大成 3-5 天的工程项

结论：

- 不采用。

### 方案B：只写一份治理文档，不做代码层固化

优点：
- 工时最低

缺点：
- 不能约束现有旁路入口
- 无法通过自动化测试锁定边界
- 后续仍容易出现“文档是一个说法，代码又走回老路”

结论：

- 不采用。

### 方案C：当前轻量治理收口方案

优点：
- 工时可控
- 能把已有正式行为沉淀为可测试事实
- 不额外引入低收益抽象

缺点：
- 用户感知价值有限
- 本质上是工程治理收益，而非功能增量

结论：

- 采用。本期只做轻量收口，不再按中型里程碑组织实施。
