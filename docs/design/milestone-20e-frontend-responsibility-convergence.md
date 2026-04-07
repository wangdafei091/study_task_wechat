# 里程碑-20E：前端职责收口与存量代码清理评估 详细设计文档

> **设计状态**：🔴 待审核
> **创建日期**：2026-04-07
> **设计者**：GPT5 Codex
> **审核者**：项目维护者
> **预计工期**：2-3天

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

经过 `M20A`、`M20B`、`M20C` 后，前端的核心语义边界已经基本稳定：用户上下文、星星域边界、页面模块化和 `MessageService` 内部切片都已落地。当前更突出的问题不再是“缺少正式语义”，而是仓库中仍保留了大量过渡入口、兼容壳层、已废弃服务方法、历史测试/文档引用和少量真正失效的遗留残链。

`M20E` 的目标不是继续做一轮大规模重构，而是对“当前哪些前端代码仍是正式职责”做一次全局复盘，并把存量代码明确分层：

1. 哪些是必须保留的正式页面入口或兼容包装
2. 哪些是可以在迁移调用后收口的兼容入口
3. 哪些已经是可删除的遗留残链或低价值历史接口

本期是“评估 + 小步收口”里程碑，而不是“大爆炸式清理”。

### 当前现状结论

基于现状调研，主要问题集中在四类对象：

| 类别 | 当前现状 | M20E 判断 |
|------|---------|-----------|
| 页面层 page shell | 首页、奖励页仍保留大量委托壳方法 | 大部分属于正式页面入口，需先区分“必留”与“可迁后删” |
| 服务层兼容接口 | `MessageService`、`UserService`、`RewardService` 仍有历史接口与废弃方法 | 存在明确清理窗口，是本期主战场 |
| 工具层适配包装 | `view-scope`、`uiUtils`、`log-analyzer` 等仍有兼容/调试残留 | 需按“正式包装 / 调试残留 / 待核对包装”分别处理 |
| 测试与文档残留 | 多个测试和文档仍显式依赖旧方法名与旧职责边界 | 代码清理必须与测试/文档收口同步设计 |

### 业务价值

- [x] 用户价值：降低后续前端迭代继续踩到历史兼容分支、隐性残链和过时入口的风险。
- [x] 技术价值：把“正式职责 / 兼容壳 / 遗留残链”三类代码分清楚，为后续持续治理建立统一口径。
- [x] 维护价值：减少低价值存量代码、收缩测试与文档中的旧引用，降低理解和回归成本。

### 功能范围

**包含**：
- ✅ 全局盘点前端页面层、服务层、工具层的正式职责与兼容/遗留入口
- ✅ 建立统一分类矩阵：`正式入口壳 / 兼容壳 / 遗留残链`
- ✅ 第一批低风险清理：优先处理真正失效或低价值的遗留接口与残链
- ✅ 同步更新相关测试和文档引用，避免“代码删了但契约说明还在”
- ✅ 为后续继续清理保留明确的“暂缓项”边界

**不包含**：
- ❌ 不重开 `M20A` 的上下文语义设计
- ❌ 不重开 `M20B` 的星星域边界设计
- ❌ 不再做一轮类似 `M20C` 的大规模结构重组
- ❌ 不删除仍由 WXML、页面生命周期或正式模块依赖的页面入口方法
- ❌ 不把 `view-scope`、页面事件入口壳等仍被正式消费的兼容层在本期一次性删除
- ❌ 不改后端 REST 契约或存储模型

### 优先级

- **优先级**：P2
- **理由**：它不是用户可见的新功能，也不是单点 bug 修复；但作为 `M20C` 后续收口项，价值在于降低后续维护成本、避免历史残链继续扩散。

---

## 技术方案

### 方案概述

`M20E` 采用“先分类、再收口、最后同步测试与文档”的保守方案。

本期不把“代码看起来多余”直接等同于“可以删除”，而是先按职责归类：

1. **正式入口壳**  
   对外仍有真实职责，通常被 WXML、页面生命周期、模块回调或跨文件调用依赖。可继续保留，但必须明确其只是入口，不再承担第二套语义。

2. **兼容壳**  
   主要为了历史方法名、旧调用点或测试保留。允许继续存在，但应优先迁移调用，并在本期或后续里程碑中收口。

3. **遗留残链 / 死代码候选**  
   已无生产价值，或内部依赖早已失效，只是因为历史原因残留。优先进入第一批清理。

### 核心原则

1. **先分清“正式入口壳”和“遗留残链”**  
   例如首页和奖励页的许多 page shell 方法虽然只是一行委托，但仍是正式页面入口，不能和真正的死代码混为一谈。

2. **先处理失效链路，再处理命名兼容**  
   `MessageService` 中依赖已不存在 `messageManager` 的残链，优先级高于“名字旧不旧”。

3. **清理代码必须同步清理测试与文档**  
   本期不能只删实现、留下测试和服务文档继续描述旧接口。

4. **不以“代码更少”为唯一目标**  
   如果某个壳层仍是 WXML 或正式模块所需入口，本期应记录它的性质，而不是强行删除。

### 当前分类矩阵

#### 1. 页面层

| 对象 | 当前判断 | 本期策略 |
|------|---------|---------|
| `pages/index/index.js` 大量 `return module.method(this, ...)` 壳 | 正式页面入口壳 | 保留，记录其正式 owner 性质 |
| `pages/index/index.js#searchTasks()` | 兼容壳，当前仍被测试引用 | 继续保留为兼容壳，不作为独立核心实现 |
| `pages/index/index.js#loadTaskData()` | 仅测试引用的附加逻辑入口候选，当前主要保留给页面行为测试 | 先确认“加载后检查即将到期任务”语义已被正式路径覆盖，再迁测试并决定是否删除 |
| `pages/rewards/rewards.js#_getEffectiveChildUserId / _getRewardOwnerUserId` | 页面正式适配入口 | 保留 |
| `pages/rewards/rewards.js#_getChildUserId` | 兼容壳，当前仍被 `rewards-exchange-flow.js` 和测试引用 | 先迁调用，再决定删除 |

#### 2. 服务层

| 对象 | 当前判断 | 本期策略 |
|------|---------|---------|
| `services/message-service.js#batchCreateTaskMessages` | 遗留残链，依赖不存在的 `messageManager`，且无生产调用 | 第一批清理候选 |
| `services/message-service.js#batchMarkMessagesAsRead` | 生产路径上的失效链路，当前会访问不存在的 `messageManager` | 第一批修复项，优先于普通清理 |
| `services/message-service.js#_migrateMessageData` | 遗留残链，内部仍依赖 `messageManager` | 第一批清理候选 |
| `services/message-service.js#_getMessageStatsWithDomainModel / _cleanExpiredMessagesWithDomainModel / _getHighPriorityMessagesWithDomainModel` | 无外部生产调用的壳方法 | 第一批清理候选 |
| `services/message-service.js#batchDeleteMessages` | 仍被内部方法调用，当前实现可工作 | 暂不删除，后续再评估是否继续保留或下沉 |
| `services/message-service.js#getUpcomingTaskNotifications` | 无生产调用，但有测试覆盖 | 若 `rg` 确认仅剩测试引用，则纳入第二批直接删除候选，并同步删除对应测试 |
| `services/user-service.js#getChildUserId` | 已标注弃用，当前仅测试仍引用 | 第一批清理候选，但要同步测试与文档 |
| `services/user-service.js#_loadUserState` | 旧方法保留注释仍在，但当前无生产或测试调用 | 第一批清理候选 |
| `services/reward-service.js#markRewardAsDelivered` | 明确 `@deprecated`，测试与文档仍引用 | 第二批：先收口测试/文档，再删 |
| `services/service-manager.js#initialize` | 标注“兼容旧架构 API”，但仍是正式启动入口 | 保留 |
| `services/message-service.js` 文件头 `messageManager` 注释 | 过时说明，和现状不符 | 第一批清理候选 |

#### 3. 工具层

| 对象 | 当前判断 | 本期策略 |
|------|---------|---------|
| `utils/view-scope.js` | 正式兼容包装，仍被消息页、分析页、首页和测试使用 | 保留，不在本期删除 |
| `utils/user-context.js` | 正式上下文 resolver | 保留 |
| `utils/uiUtils.js#toggleComponent / toggleMask / setLoading` | 待核对的向后兼容包装 | 只评估这组包装函数，不扩大到整个 `uiUtils.js` |
| `utils/log-analyzer.js` | dev-only 调试工具，模块有副作用初始化，但业务价值低 | dev-only 残留候选，纳入评估但不按死代码处理 |

#### 4. 测试与文档

| 对象 | 当前判断 | 本期策略 |
|------|---------|---------|
| `test/services/reward-service.test.js` 对 `markRewardAsDelivered` 的覆盖 | 历史接口测试 | 若删接口，必须同步迁移或删除测试 |
| `test/services/user-service.test.js` 对 `getChildUserId` 的覆盖 | 历史兼容测试 | 若删接口，必须同步调整 |
| `test/pages/rewards.page-contract.test.js` 对 `_getChildUserId` 的覆盖 | 页面兼容壳测试 | 仅在迁移页面壳后才可改 |
| `docs/api/services-guide.md` 仍描述废弃服务接口 | 文档残留 | 代码清理时同步收口 |
| `test/backend/message-service-copy.test.js` 及相关说明 | 历史命名残留，但仍是根级契约测试事实 | 作为测试/文档残留盘点对象，评估是否需要重命名或保留说明 |
| `test/README.md` / 设计文档中的历史测试命名引用 | 历史事实说明 | 需区分“保留事实”与“当前正式入口” |

### 技术选型

| 技术点 | 选择方案 | 不采用方案 | 选择理由 |
|--------|---------|-----------|---------|
| 清理策略 | 分类治理 + 分批收口 | 一次性大扫除 | 更符合当前前端兼容现实，回归风险更低 |
| 页面壳处理 | 保留正式页面入口壳 | 统一删成纯模块调用 | WXML/生命周期入口天然需要 page 方法承接 |
| 服务清理 | 优先处理失效残链与活链路 bug | 先处理所有命名兼容 | `messageManager` 残链中已包含生产路径问题，应优先修复 |
| 工具包装处理 | 先保留 `view-scope`，审慎评估 `uiUtils` 中少量兼容包装函数 | 一次性删除全部兼容工具 | `view-scope` 仍有正式调用方，`uiUtils` 也有正式生产能力 |
| 文档策略 | 与代码同步收口 | 只改代码，文档后补 | 能避免“代码与文档双轨漂移” |

### DDD 分层设计

**领域层（models/）**：
- [ ] 不新增模型
- [ ] 不修改领域模型
- 说明：`M20E` 不处理领域语义，只处理前端职责边界和兼容/遗留入口。

**服务层（services/）**：
- [ ] 不新增服务
- [x] 重点修改：`message-service.js`、`user-service.js`、`reward-service.js`
- [ ] 视情况修改：`service-manager.js`
- 说明：服务层是本期首批收口主战场，优先修复活链路 bug，再清理失效残链和低价值兼容入口。

**仓储层（repositories/）**：
- [ ] 不新增仓储
- [ ] 不默认修改仓储
- 说明：除非 `MessageService` 内部清理需要改用仓储正式批量接口，否则仓储层不是本期重点。

**适配器层 / 工具层（utils/）**：
- [ ] 不新增适配器
- [x] 重点评估：`view-scope.js`、`uiUtils.js` 中少量兼容包装函数、`log-analyzer.js`
- 说明：目标是区分正式兼容包装、待核对的低价值工具包装与 dev-only 调试工具，而不是把整个工具文件都纳入清理。

**表现层（pages/、components/）**：
- [ ] 不新增页面
- [x] 重点修改：`pages/rewards/rewards.js`
- [x] 重点评估：`pages/index/index.js`
- 说明：页面层本期不追求继续大拆分，而是识别哪些壳必须保留、哪些可在迁移调用后删除。

### 数据模型

```typescript
type ResponsibilityKind = 'formal-shell' | 'compat-shell' | 'legacy-chain';

interface CleanupCandidate {
  id: string;
  file: string;
  symbol: string;
  kind: ResponsibilityKind;
  hasProductionCaller: boolean;
  hasTestOrDocCaller: boolean;
  action: 'keep' | 'migrate-then-delete' | 'delete-now';
  risk: 'low' | 'medium' | 'high';
  note: string;
}
```

### 接口设计

本期默认 **不新增公开服务接口**。

可能发生的对外变化仅限：

1. 删除已确认无生产价值、且迁移完测试/文档引用的历史兼容接口
2. 把少量兼容壳方法正式降级为“仅委托到主路径”的内部包装

新增约束：

- 页面层若保留兼容方法名，只允许其委托到正式 owner，不再承载第二套逻辑
- 服务层若保留兼容方法名，只允许其作为显式兼容包装，不允许继续依赖已失效内部对象

---

## 代码结构

### 文件变更清单

**新增文件**：
- `docs/design/milestone-20e-frontend-responsibility-convergence.md` - M20E 设计文档

**重点修改文件**：
- `services/message-service.js` - 清理失效残链与低价值壳方法
- `services/user-service.js` - 收口已弃用的兼容接口
- `services/reward-service.js` - 评估并收口已废弃服务方法
- `app.js` - 若最终处理 `log-analyzer`，同步收口 dev-only 调试入口
- `pages/rewards/rewards.js` - 迁移兼容壳调用后视情况清理
- `pages/rewards/modules/rewards-exchange-flow.js` - 改用正式页面入口或模块能力
- `utils/uiUtils.js` - 仅评估 `toggleComponent / toggleMask / setLoading` 这组兼容包装是否仍需保留
- `utils/log-analyzer.js` - 评估 dev-only 调试工具是否仍需保留
- `docs/api/services-guide.md` - 同步废弃/删除接口说明
- `test/services/message-service.test.js` - 收口服务层兼容/遗留测试
- `test/services/user-service.test.js` - 收口弃用接口测试
- `test/services/reward-service.test.js` - 收口废弃服务方法测试
- `test/pages/rewards.page-contract.test.js` - 若迁移页面兼容壳，更新契约测试
- `test/pages/index.page-shell.behavior.test.js` - 若删除 `loadTaskData()` / 保留 `searchTasks()` 为兼容壳，同步更新页面行为测试
- `test/backend/message-service-copy.test.js` - 若重命名或调整根级契约测试口径，同步更新
- `test/README.md` - 若测试入口或命名口径变化，同步更新当前测试说明

### 核心代码结构

```javascript
// 页面层：正式入口壳继续存在，但不承载第二套逻辑
Page({
  onShow() {
    return rewardsSyncModule.onShow(this);
  },

  _getEffectiveChildUserId() {
    return rewardsUserContextModule.getEffectiveChildUserId(serviceManager);
  }
});

// 服务层：删除或重写遗留残链
class MessageService {
  async batchDeleteMessages(messageIds) {
    // 若仍保留，则必须只走 repository/domain 正式链路
  }
}
```

### 关键函数 / 对象

**对象1**：`MessageService` 遗留残链与活链路 bug
- **范围**：`batchCreateTaskMessages`、`batchMarkMessagesAsRead`、`_migrateMessageData`、若干无生产调用壳方法、过时文件头注释
- **职责**：区分“必须先修”的活链路问题与“可直接清”的遗留残链
- **依赖**：`messageRepository`、现有测试、消息页相关行为

**对象2**：页面兼容壳
- **范围**：`searchTasks`、`_getChildUserId` 等
- **职责**：区分“正式入口壳”与“仅测试/历史调用残留”
- **依赖**：WXML 绑定、模块调用、页面契约测试

**对象3**：工具层兼容包装
- **范围**：`view-scope`、`uiUtils` 中少量兼容包装函数、`log-analyzer`
- **职责**：区分正式兼容包装、待核对向后兼容工具和 dev-only 调试工具
- **依赖**：消息页、分析页、首页与测试

---

## 实施步骤

### 第0步：补齐现状分类清单（预计0.5天）

- [ ] **任务**：把候选对象按 `正式入口壳 / 兼容壳 / 遗留残链` 三类列成实现清单
- [ ] **验证**：每个候选对象都能回答“谁在调用、为什么保留/为什么可删”
- [ ] **依赖**：无

**实施要点**：
1. 页面层要同时核对 WXML、模块调用和测试引用。
2. 服务层要区分“无生产调用”和“有内部调用但实现坏掉”。
3. 工具层要区分“正式兼容包装”和“低价值辅助工具”。
4. 文档层要区分“当前 API/测试说明”与“历史设计事实归档”，后者默认不因本期清理而重写。

---

### 第1步：服务层第一批低风险清理（预计0.5-1天）

- [ ] **任务**：优先处理 `MessageService` 的活链路 bug 与遗留残链，以及 `UserService`、`RewardService` 中明确废弃/低价值接口
- [ ] **验证**：对应服务定向测试通过，且无生产调用遗漏
- [ ] **依赖**：第0步完成

**实施要点**：
1. 优先修复生产路径上的失效链路，再清理依赖已不存在对象的残链。
2. 若接口仍被测试/文档引用，必须先一起收口。
3. `batchMarkMessagesAsRead` 要作为活链路 bug 单独处理，不能和普通清理项并列。
4. `batchDeleteMessages` 这类当前仍可工作的内部能力，不允许在没有替代路径前直接删除。
5. `getUpcomingTaskNotifications()` 若 `rg` 确认只剩测试引用，则纳入第二批直接删除候选，并同步删改相应测试。

---

### 第2步：页面层兼容壳收口（预计0.5-1天）

- [ ] **任务**：评估并收口奖励页、首页中的兼容壳方法
- [ ] **验证**：页面行为测试与契约测试通过
- [ ] **依赖**：第1步完成

**实施要点**：
1. 只动兼容壳，不动正式页面入口壳。
2. 任何页面方法删除前，都要确认 WXML 和模块不再依赖。
3. `searchTasks()`、`_getChildUserId()` 这类对象优先走“迁移调用，再删壳”。
4. `loadTaskData()` 作为测试兼容壳候选处理，不默认长期保留。

---

### 第3步：工具层与文档/测试同步收口（预计0.5天）

- [ ] **任务**：收口工具层候选对象，并同步更新相关测试和文档
- [ ] **验证**：测试与文档不再继续描述已删除接口
- [ ] **依赖**：第2步完成

**实施要点**：
1. `view-scope` 本期默认保留。
2. `uiUtils` 仅评估 `toggleComponent / toggleMask / setLoading` 这组兼容包装，且仅在确认无正式调用后才进入清理。
3. `log-analyzer` 作为 dev-only 残留候选单独评估，不按普通业务死代码处理。
4. `services-guide`、`test/README.md`、当前 API/测试说明文档要同步核对。
5. 历史里程碑设计文档默认作为事实归档保留，不因为本期删除兼容接口而逐份回写。

### 量化验收标准

本期通过标准不是“看起来更干净”，而是以下硬约束至少满足：

1. **第一批对象收口完成**
   - 必须完成：`batchMarkMessagesAsRead`
   - 至少完成以下 5 项中的 4 项：
     - `batchCreateTaskMessages`
     - `_migrateMessageData`
     - `_getMessageStatsWithDomainModel / _cleanExpiredMessagesWithDomainModel / _getHighPriorityMessagesWithDomainModel`
     - `user-service#getChildUserId`
     - `user-service#_loadUserState`

2. **过时说明收口完成**
   - `services/message-service.js` 文件头中对 `messageManager` 的过时描述必须移除或改正

3. **测试/文档同步完成**
   - 若删除或收口任一公开/兼容方法：
     - 对应测试必须同步调整
     - `docs/api/services-guide.md` 中对应说明必须同步调整
   - 若调整根级契约测试命名或定位：
     - `test/README.md` 必须同步更新
   - 对于被删除的方法或文件：
     - 必须执行一次 `rg` 级别的仓库引用扫描，确认不存在残余调用点或过时说明

4. **最小验证集全部通过**
   - `test/services/message-service.test.js`
   - `test/services/message-service.modules.test.js`
   - `test/services/user-service.test.js`
   - `test/services/reward-service.test.js`
   - `test/pages/rewards.page-contract.test.js`
   - `test/pages/index.page-shell.behavior.test.js`

---

## 测试方案

### 单元测试

| 测试项 | 测试方法 | 预期结果 |
|--------|---------|---------|
| `MessageService` 残链清理 | `test/services/message-service.test.js`、`message-service.modules.test.js` | 删除/重写后消息域主要行为保持稳定 |
| `batchMarkMessagesAsRead` 活链路修复 | `test/services/message-service.test.js` | `markRelatedMessagesAsRead()` 走完整链路不再访问不存在的 `messageManager` |
| `UserService` 弃用接口收口 | `test/services/user-service.test.js` | 若删除接口，测试同步调整；若保留，行为与文档一致 |
| `RewardService` 废弃接口收口 | `test/services/reward-service.test.js` | 废弃方法与新状态机口径一致 |
| 奖励页兼容壳迁移 | `test/pages/rewards.page-contract.test.js` | 页面上下文与兑换流程契约不回归 |
| 首页兼容壳保留/收口 | `test/pages/index.page-shell.behavior.test.js`、`index.modules.test.js` | 搜索、消息预览、刷新入口保持正式行为，`loadTaskData()` / `searchTasks()` 的兼容口径与实现一致 |
| 删除后残余引用扫描 | `rg` 全仓搜索候选符号名与测试/文档说明 | 已删除对象不再有生产、测试或当前 API 文档引用 |

### 集成测试

- [ ] 首页页面入口壳与模块委托链路不回归
- [ ] 奖励页兑换与刷新链路在迁移兼容壳后不回归
- [ ] 消息域删除/已读/预览链路在服务层收口后不回归
- [ ] `view-scope` 与 `user-context` 双入口关系保持兼容
- [ ] 测试兼容壳收口后，`index.page-shell.behavior` 不再依赖已删除的页面方法
- [ ] 服务层收口后，仓储/页面正式链路不再隐式依赖 `messageManager`

### 手动测试

1. 首页搜索、消息预览、任务完成后刷新链路正常。
2. 奖励页进入、下拉刷新、兑换、动画与后续刷新正常。
3. 消息中心进入、单条已读、全部已读、删除消息正常。
4. 家长/孩子视角切换后，消息与奖励页上下文语义不回归。

### 测试覆盖率目标

- 最低要求：85%
- 推荐目标：90%

---

## 风险评估

### 技术风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| 把正式页面入口壳误删为“兼容壳” | 高 | 中 | 删除前必须核对 WXML、模块和测试调用 |
| 只删代码不收口测试/文档 | 中 | 高 | 设计中要求代码、测试、文档同步处理 |
| `MessageService` 遗留残链清理后引出隐藏内部依赖 | 高 | 中 | 优先补定向测试，再做服务层收口 |
| `view-scope` 误判为可删导致消息/分析页大面积回归 | 高 | 低 | 本期明确保留，不作为首批清理对象 |
| 范围失控，重新演变为 `M20C` 级别重构 | 中 | 中 | 本期只做存量收口，不再重做结构治理 |

### 回滚策略

1. 本期按对象分批清理，允许逐文件回退。
2. 若某个兼容壳删除后回归面过大，可先恢复该壳，继续只收口文档和测试口径。
3. 不涉及存储模型和后端接口，回滚成本可控。

---

## 替代方案

### 方案A：不做 `M20E`，继续累积存量代码

优点：
- 当前工作量最低

缺点：
- `M20C` 后暴露出的历史残链会继续保留
- 测试和文档中的旧接口引用会越来越多
- 后续每次迭代都要反复判断“这个旧方法还能不能动”

结论：
- 不采用。

### 方案B：一次性删除所有兼容入口

优点：
- 表面上代码最干净

缺点：
- 高概率误删正式页面入口壳
- 容易同时打坏 WXML 绑定、模块调用、测试与文档
- 与当前“先稳定语义，再渐进收口”的里程碑节奏不一致

结论：
- 不采用。

### 方案C：分类治理 + 分批收口

优点：
- 与当前仓库实际情况最匹配
- 可以先清真正有问题的遗留残链
- 能把正式入口壳、兼容壳和死代码候选分开处理

缺点：
- 看起来不如“一次性大扫除”痛快
- 需要同时处理代码、测试和文档，执行纪律要求更高

结论：
- 采用。
