# 里程碑-09：星星积分 + 奖励云端同步 详细设计文档

> **设计状态**：🟢 已实施并验证通过
> **创建日期**：2026-03-19
> **设计者**：Claude Code
> **审核者**：项目维护者（待补签）
> **预计工期**：1.5周

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

M07/M08 完成了任务数据的云端同步，但星星积分和奖励数据仍然纯本地存储。这导致三个用户可见问题：

1. **跨设备 resetTask 被拦截**：`task-service.js:1115` 明确提示"M09 上线后开放"，家长在设备B上无法取消孩子在设备A打卡的任务
2. **奖励数据孤岛**：家长在设备A创建的奖励，孩子在自己设备上看不到，也无法兑换
3. **分析页数据不完整**：星星趋势图有免责提示"数据仅含本设备记录"

M09 目标：将 `star_groups`、`star_records`、`rewards` 三类数据接入云端，解除上述三个限制。

### 业务价值

- **用户价值**：家庭多设备数据一致，奖励兑换体验完整
- **技术价值**：完成核心游戏化系统云端闭环，为后续功能奠基
- **业务价值**：解除 M08 遗留的跨设备 resetTask 拦截，产品功能完整度大幅提升

### 实施结果（2026-03-21）

- ✅ 代码实现已完成：星星流水/快照、奖励、任务状态 `starAwarded` 同步、分析页家庭流水读取均已接入云端
- ✅ 后端真实集成测试通过：`star-api-m09-real.test.js`、`reward-api-m09-real.test.js`，共 `10/10` 通过
- ✅ 前端针对性回归测试通过：`star-service`、`task-service`、`reward-service`、`analytics-utils`
- ✅ 人工复核通过的关键链路：奖励可见性、首页积分进度、任务完成/重置、分析页星星日历同步
- ✅ 实施后追加修复已合入：历史奖励 `family_id` 迁移、`tasks` 表旧/新字段兼容、首页残留星星快照、分析页完成/重置净额聚合

### 功能范围

**包含**：
- ✅ 后端新增 `star_groups`、`star_records`、`rewards` 三张表及对应迁移脚本
- ✅ 后端新增星星积分 API（读取余额、写入积分记录、读取分组）
- ✅ 后端新增奖励 API（CRUD、兑换，按家庭查询）
- ✅ 前端 `StarService`：任务完成/重置时双写云端（含 `star_awarded` 字段）
- ✅ 前端 `RewardService`：奖励操作双写云端，拉取时同步本地（含 stale cleanup）
- ✅ 前端 `_syncStatusToCloud` 补充 `starAwarded` 字段，使跨设备 resetTask 可靠运行
- ✅ 前端 `consumeStarsFromSpecificType` 修复 userId 隔离问题（多孩子家庭安全）
- ✅ 解除 `resetTask` 跨设备拦截
- ✅ 前端 `StarService.refreshStarsFromCloud` 拉取云端流水与分组快照并回灌本地，分析页趋势图数据来源完整
- ✅ 前端 `RewardService.getAvailableRewards` 语义扩展：云端模式下不再按 userId 精确过滤，改为按家庭可见性过滤
- ✅ 奖励兑换独立云端路径：`_syncExchangeToCloud(rewardId, exchangeUserId)`，不与通用 upsert 混用
- ✅ 后端星星/奖励接口鉴权沿用 `_resolveTargetUserId` 模式，防止跨家庭数据访问

**不包含**：
- ❌ 星星过期的云端推送通知（M10 处理）
- ❌ 历史离线数据的云端补录（项目未上线，无存量数据问题）
- ❌ 多设备实时推送（轮询拉取即可，WebSocket 不在范围内）

### 优先级

- **优先级**：P0（M07~M08 已完成后最高优先级的收尾里程碑，现已完成）
- **理由**：跨设备 resetTask 拦截和奖励孤岛是已上线前必须解决的核心缺陷

---

## 技术方案

### 方案概述

沿用 M07/M08 建立的**双写策略**和**本地优先读取**模式：

1. **写操作**：本地先写成功后，异步向云端同步（失败静默降级，不阻断用户操作）
2. **读操作**：优先读本地缓存；全量拉取时以云端为准并覆盖本地（含 stale cleanup）
3. **冲突解决**：以 `modifyTime`（epoch ms）为准，较新一方胜出

**关键设计决策**：
- 星星余额**唯一权威来源是 `star_records` 流水**；`star_groups` 在云端采用**持久化快照**方案，但语义上是由后端根据流水维护的派生投影，不是第二账本
- `star_groups` 云端同步策略：后端在处理星星业务操作时，于同一事务内同时写入 `star_records` 并更新 `star_groups` 快照；前端启动/切换账号后由 `refreshStarsFromCloud` 拉取云端流水与分组快照回灌本地；客户端**不直接写云端 `star_groups`**
- **快照维护契约**：后端**不能仅凭裸 `star_record` 自动推导所有分组扣减**。M09 中分三类处理：
  - `addStars`/任务完成发星：前端同步 payload 必须携带 `expiryType`（必要时带 `expiryDate`），后端据此写入对应分组快照
  - `consumeStarsFromSpecificType`/任务重置扣星：前端同步 payload 必须携带 `expiryType`，后端仅在该有效期类型下扣减快照
  - `consumeStars`/必做任务惩罚：**不走通用 `POST /api/stars/records` 推导**，改走专用 `POST /api/stars/consume`；由后端基于云端当前 `star_groups` 快照决定扣减分摊、写消费流水并更新快照
  - 奖励兑换：不走通用星星流水 upsert 推导，仍由 `PATCH /api/rewards/:rewardId/exchange` 在后端基于云端当前 `star_groups` 快照执行扣减、写消费流水并更新奖励状态
- **单分组流水字段约束**：只有“可确定落到单一分组”的流水同步才走 `POST /api/stars/records`，因此 `addStars` 与 `consumeStarsFromSpecificType` 的同步 payload 必须带 `expiryType`；收入场景必要时再带 `expiryDate`。**通用 `consumeStars` 不要求也不允许伪造单一 `expiryType`**，否则会丢失跨分组扣减语义
- **resetTask 前置条件**：`resetTask` 依赖本地 `star_groups` 有准确余额；因此允许执行 `resetTask` 的任务读取入口必须显式传入 `options.requireFreshStars=true`，由服务层在任务云端拉取前调用 `refreshStarsFromCloud(userId)`。分析/搜索等只读场景不得隐式触发这一同步
- **`getAllTasks(null)` 语义约束**：`userId=null` 仅表示“读取本地/缓存中的全部任务集合”，用于搜索、聚合、只读辅助场景；**不得隐式触发 `refreshStarsFromCloud(null)`**。凡是需要保证 `resetTask` 可用的任务列表页面，必须传入显式 `effectiveUserId`
- 奖励数据以 `reward_id` 为主键做幂等 upsert，逻辑与 M08 `createTask` 一致
- **奖励归属模型**：`rewards.user_id` = 创建者（家长 userId）；后端 `GET /api/rewards` 按 `family_id` 查询；前端 `getAvailableRewards` 在云端模式下**完全移除 `r.userId === userId` 过滤**——云端拉取已保证家庭可见性，本地按 userId 过滤会误杀家长奖励
- **奖励页同步前置**：奖励页 `onShow` 不仅要调用 `refreshRewardsFromCloud()`，还要在读取孩子余额前调用 `refreshStarsFromCloud(effectiveChildId)`；否则会出现“奖励列表是新的，星星余额还是旧的”的跨设备不一致

### 技术选型

| 技术点 | 选择方案 | 替代方案 | 选择理由 |
|--------|---------|---------|---------|
| 星星余额 | star_records 流水推导 | 独立 balance 字段 | 避免双源冲突，审计清晰 |
| 星星余额权威来源 | star_records 流水 + star_groups 云端持久化快照（服务端事务维护） | 仅前端本地快照 / star_groups 客户端直写 | 兼顾单一账本与高频读取性能，支持 resetTask 快速扣减 |
| 冲突解决 | modifyTime last-write-wins | CRDT | 与 M08 任务同步保持一致 |
| 奖励可见性 | 按 family_id 查询 + **前端完全移除 userId 过滤** | 仅改后端查询 | 孩子设备 rewardOwnerId=loginUserId，前端过滤必须一并移除 |
| 奖励 stale cleanup | syncedToCloud 标记 + 全量替换 | 仅 upsert | 与 M08 任务 cleanup 保持一致，避免本地脏数据 |
| 通用扣星同步 | 专用 `POST /api/stars/consume` 命令接口 | 仅靠 `POST /api/stars/records` 反推快照 | 通用扣星涉及跨分组分摊和部分扣减，必须由后端决定扣减明细 |
| resetTask 解除前置 | 允许 resetTask 的任务读取入口显式传 `requireFreshStars=true` | 仅分析页触发 | 避免服务层猜页面语义；首页/任务编辑等入口需要最新余额，只读分析不需要 |
| `getAllTasks(null)` 语义 | 只读聚合，不触发星星同步 | 将 `null` 解释为当前用户并触发同步 | 避免搜索/聚合等辅助场景产生昂贵且歧义的云同步 |
| userId 隔离修复 | consumeStars 传 userId，仓储层按 userId 过滤 | 不修复 | 多孩子家庭下正确扣减对应孩子的星星 |

### DDD分层设计

**领域层（models/）**：
- 无需新建模型（前端 `StarGroup`、`StarRecord`、`Reward` 均已完整）
- 修改 `models/star-group.js`：新增 `syncedToCloud` 字段
- 修改 `models/star-record.js`：新增 `syncedToCloud` 字段；补充 `expiryType`，收入/单分组收入场景可选补充 `expiryDate`
- 修改 `models/reward.js`：新增 `syncedToCloud` 字段

**服务层（services/）**：
- 修改 `services/star-service.js`：
  - `addStars`：成功后异步 `_syncStarRecordToCloud`
  - `consumeStars`：云端模式下成功后异步 `_syncConsumeToCloud(points, reason, options)`，走专用 `POST /api/stars/consume`
  - `consumeStarsFromSpecificType`：**补充 userId 参数传递**，修复多孩子隔离问题；成功后异步 `_syncStarRecordToCloud`
  - 新增公开方法 `refreshStarsFromCloud(userId, options)`：供 `TaskService` 和分析页调用；内部复用 `_fetchStarsFromCloud`
  - 新增 `_fetchStarsFromCloud(userId, options)`：孩子/单用户模式下拉取该用户 `star_records + star_groups` 覆盖本地；`scope='family'` 时**只拉取全家 `star_records`** 供分析页使用，不额外回灌 `star_groups`
  - 新增 `_syncStarRecordToCloud(record)`：单条流水写云端
  - 新增 `_syncConsumeToCloud(points, reason, options)`：通用扣星专用同步，供 `consumeStars`/必做任务惩罚复用
- 修改 `services/reward-service.js`：
  - `createReward`/`updateReward`/`deleteReward`：操作后异步 `_syncRewardToCloud`（通用 upsert）
  - `exchangeReward`：操作后异步 `_syncExchangeToCloud(rewardId, exchangeUserId)`（独立兑换路径）
  - `getAvailableRewards`：云端模式下跳过 `r.userId === userId` 精确过滤，展示全家奖励
  - 新增公开方法 `refreshRewardsFromCloud()`：供奖励页调用；内部复用 `_fetchRewardsFromCloud`
  - 新增 `_fetchRewardsFromCloud()`：全量拉取覆盖本地（含 stale cleanup）
  - 新增 `_syncRewardToCloud(reward)`：单条奖励 upsert 写云端（create/update/delete 用）
  - 新增 `_syncExchangeToCloud(rewardId, exchangeUserId)`：兑换专用路径，携带 `exchangeUserId` 和 `modifyTime`（幂等 key）
  - `initialize()`：云端模式下跳过默认奖励初始化，避免与云端数据冲突；云端拉取由公开方法 `refreshRewardsFromCloud()` 在页面进入时触发
  - `refreshRewardsFromCloud` 触发时机：挂在**奖励页 `onShow`**（每次显示时触发），不依赖 `initialize()` 的一次性类锁（`RewardService._initialized` 不会重置）
- 修改 `services/task-service.js`：
  - `getAllTasks(userId, options = {})`：当 `userId` 为显式用户且 `options.requireFreshStars === true` 时，云端模式下先调用 `starService.refreshStarsFromCloud(userId)`；当 `userId=null` 或 `requireFreshStars !== true` 时保持只读聚合语义，不触发星星同步
  - `getTasksByDate(date, userId, options = {})` / `getTodayTasks(userId, options = {})`：当 `userId` 为显式用户且 `options.requireFreshStars === true` 时，云端模式下在任务拉取前先调用 `starService.refreshStarsFromCloud(userId)`；首页/任务列表主入口显式传入该参数，分析组件不传
  - `_syncStatusToCloud`：补充 `starAwarded` 字段，确保任务完成时云端也记录 `star_awarded=true`
  - `resetTask`：移除跨设备拦截（前提：`star_awarded` 由云端同步正确，下详）

**仓储层（repositories/）**：
- 修改 `repositories/star-group-repository.js`：
  - `deductStarsFromSpecificExpiryType(amount, expiryType, reason, userId)`：**新增 userId 参数**，调用 `getGroupsByExpiryType(expiryType, userId)` 确保只操作指定用户的分组
  - `getGroupsByExpiryType`：已支持 userId 参数，无需新增逻辑
- 修改 `repositories/reward-repository.js`：
  - `getAvailableRewards(includeExamples, userId)`：云端模式（`enableCloudStorage=true`）下跳过 `r.userId === userId` 精确过滤（家庭奖励已由 `refreshRewardsFromCloud` 全量拉取，本地即为家庭可见集合）

**后端（backend/）**：
- 新增 `backend/database/migrations/007_create_star_records.sql`
- 新增 `backend/database/migrations/008_create_star_groups.sql`
- 新增 `backend/database/migrations/009_create_rewards.sql`
- 新增 `backend/models/StarRecord.js`、`StarGroup.js`、`Reward.js`
- 新增 `backend/services/starService.js`（含 `_resolveTargetUserId` 鉴权；在写入 `star_records` 或执行通用扣星命令的事务内维护 `star_groups` 快照，并提供内部快照重建能力用于纠偏）
- 新增 `backend/services/rewardService.js`（含 family_id 查询、`_resolveTargetUserId` 鉴权）
- 新增 `backend/controllers/starController.js`
- 新增 `backend/controllers/rewardController.js`
- 新增 `backend/routes/stars.js`
- 新增 `backend/routes/rewards.js`
- 修改 `backend/server.js`（注册新路由）

**表现层（pages/）**：
- `packageChart/components/star-trend/star-trend.wxml`：移除"数据仅含本设备"免责提示（文本在 `star-trend.wxml:6`），**前提是 star_records 已从云端拉取回灌本地**（见下节）
- `pages/rewards/rewards.js`：`onShow` 时先调用 `refreshStarsFromCloud(effectiveChildId)`，再调用 `refreshRewardsFromCloud()`（不依赖 initialize 锁），确保每次打开奖励页都能看到最新家庭奖励与最新孩子余额

### 奖励归属模型说明

现有页面中存在三个不同概念，设计必须明确对齐：

| 概念 | 当前代码 | 含义 | 后端处理 |
|------|---------|------|---------|
| 创建者 | `loginUserId`（家长） | 谁创建了这个奖励 | `rewards.user_id` |
| 奖励归属 | `_getRewardOwnerUserId()` = loginUserId | 奖励池的所有者 | `rewards.user_id`（同上） |
| 兑换者 | `_getEffectiveChildUserId()`（`rewards.js:565`） | 消耗哪个孩子的星星 | 接口需接受 `exchangeUserId` 参数 |

**关键问题1**：孩子设备的 `_getRewardOwnerUserId()` 返回的是孩子自身 loginUserId，与家长创建时的 userId 不同，导致孩子查不到家长的奖励。

**解决方案1（可见性，需同时修改前后端）**：
- **后端**：`GET /api/rewards` 按 `family_id` 查询，不按 `user_id` 精确匹配；控制器从 JWT 取 `familyId`，返回该家庭所有可见奖励
- **前端服务层**：`RewardService.getAvailableRewards` 在云端模式下**完全移除 `r.userId === userId` 过滤**（无论 includeClaimed 分支还是其他分支）——`refreshRewardsFromCloud` 已从云端按家庭取回全部可见奖励，本地过滤无意义且有害
  > ⚠️ 注意：孩子设备上 `rewardOwnerId = loginUserId`（`rewards.js:265`），"当 userId 与 loginUserId 不同时才跳过过滤"的条件**永远不会触发**，必须无条件移除过滤
- **前端仓储层**：`RewardRepository.getAvailableRewards(includeExamples, userId)` 在云端模式下同样跳过 userId 精确过滤

**关键问题2**：家长在自己设备上代孩子兑换时（`rewards.js:575` 传入 `childUserId`），若后端只认 JWT 的家长身份扣星，会扣错账户。

**解决方案2（兑换身份）**：`PATCH /api/rewards/:rewardId/exchange` 接受可选的 `exchangeUserId` 参数，与任务接口的 `targetUserId` 模式一致。后端校验：`exchangeUserId` 必须是 JWT 用户本人，或是 JWT 家长账户名下的孩子。缺省时使用 JWT userId（孩子在自己设备兑换）。

**关键问题3（兑换云端同步）**：`exchangeReward()` 内联扣星+记流水+改奖励状态，不是简单 upsert，通用 `_syncRewardToCloud(reward)` 无法携带 `exchangeUserId`，也无法保证兑换操作的幂等性。

**解决方案3（兑换独立路径）**：兑换同步独立为 `_syncExchangeToCloud(rewardId, exchangeUserId)`，发送专用的 `PATCH /api/rewards/:rewardId/exchange`，payload 包含 `{ exchangeUserId, modifyTime }`（`modifyTime` 作为幂等 key，防止重复兑换）。其余 create/update/delete 操作继续走通用 `_syncRewardToCloud(reward)`。

**兑换接口幂等语义**：
- 同一个 `rewardId + modifyTime + exchangeUserId` 组合视为同一业务命令，后端必须保证重试不重复扣星、不重复推进奖励状态
- 若首次请求已成功完成兑换，后续相同幂等 key 的重试请求返回当前已兑换结果（200 幂等成功），而不是再次扣星
- 若同一个奖励已被其他幂等 key 成功兑换，再收到新的兑换请求，应返回业务冲突/已兑换状态，而不是覆盖已有结果

### 后端鉴权模型

星星和奖励接口**必须沿用任务接口的 `_resolveTargetUserId` 鉴权模式**，不得直接信任 `?userId=` 查询参数：

```
GET /api/stars?userId=xxx
  → controller 读取 JWT 的 loginUserId 和 familyId
  → 调用 _resolveTargetUserId(loginUserId, userId, familyId)
      → 若 userId 为空：返回 loginUserId 自身数据
      → 若 userId === loginUserId：返回自身数据
      → 若 userId 是同家庭成员：家长可查孩子数据
      → 否则：403 FORBIDDEN
```

奖励接口 `GET /api/rewards` 从 JWT 取 `familyId`，直接按家庭查，**无需 `?userId=` 参数**。兑换接口 `exchangeUserId` 同样走 `_resolveTargetUserId` 校验。

**文件影响**：`backend/controllers/starController.js`、`backend/controllers/rewardController.js` 须复用 `taskController.js:327-357` 的 `_resolveTargetUserId` 逻辑（可提取为公共工具函数）。

### 分析页趋势图数据源说明

分析页趋势图实际调用链路：
```
star-trend.wxml → star-trend.js:654
  → analyticsService.calculateHistoricalBalance(days, analysisOptions.userId || null)
      → userId=null → getAllStarRecords()（读本地全量）
      → userId≠null → getStarRecordsByUserId(userId)（读本地指定用户）
```

趋势图展示的是**本地星星流水记录**，不是余额。因此：
- 移除 `star-trend.wxml:6` 免责提示的**前提**是：`refreshStarsFromCloud` 必须在分析页加载前完成，将云端 `star_records` 回灌到本地

**family scope 问题**：家长视角时 `analysis.js:18` 传入 `{ scope: 'family' }`，不含 `userId`，导致 `star-trend.js:656` 的 `analysisOptions.userId || null` 为 `null`。`calculateHistoricalBalance(days, null)` 走 `getAllStarRecords()`，只返回本地全量数据，无法保证包含所有孩子的云端流水。

**解决方案（family scope）**：`refreshStarsFromCloud` 支持 `scope='family'` 模式——当 `scope=family` 时，只向后端请求该家庭所有成员的 `star_records`（`GET /api/stars/records?scope=family`，后端按 JWT familyId 查全家流水），**不拉取全家 `star_groups` 快照**。原因：family analysis 只依赖本地流水，不执行 `resetTask`，无需引入额外的 family groups 接口复杂度。回灌到本地后 `getAllStarRecords()` 即含完整家庭数据。

**触发时机**：在用户进入分析页时（`star-trend.js:634` 的 `loadData`），根据 `analysisOptions` 调用：
- 孩子视角：`StarService.refreshStarsFromCloud(userId)`
- 家长视角：`StarService.refreshStarsFromCloud(null, { scope: 'family' })`

完成回灌后再渲染趋势图。同步更新 `GET /api/stars/records` 接口支持 `scope=family` 查询参数；family scope 仅返回全家流水，不返回 groups snapshot。

### resetTask 解除的完整契约

**根因**（引用 M07 设计文档）：设备A完成任务后，`_syncStatusToCloud` 只发送 `status`，不发送 `star_awarded`，导致云端 `star_awarded` 仍为 false。设备B拉取时得到 `starAwarded=false`，被拦截。

**M09 修复链路**：

```
设备A完成任务
  → task-service.updateTaskStatus()
      → task.starAwarded = true（非必做任务，task-service.js:928）
      → _syncStatusToCloud(task)  ← 【M09新增】发送 { status, starAwarded: task.starAwarded }
          → PATCH /api/tasks/:id/status  ← 【M09新增】后端按前端传值写入 star_awarded

设备B进入首页/任务列表
  → getTasksByDate(date, userId, { requireFreshStars: true }) / getTodayTasks(userId, { requireFreshStars: true })
      ← 【M09新增前置】首页主入口显式要求先触发 refreshStarsFromCloud(userId)
      → 本地 star_groups 已与云端对齐
  → getAllTasks(userId, { requireFreshStars: true })
      ← 【补充】任务编辑等允许 resetTask 的显式用户任务读取入口同样显式要求先触发 refreshStarsFromCloud(userId)
      → 云端 star_groups 持久化快照 + star_records 回灌本地，本地余额准确
  → _fetchTasksFromCloud()
      → 从云端拉取任务，star_awarded 已正确反映是否实际发星
      → cloudTask.starAwarded 同步回本地

设备B取消打卡
  → resetTask()
      → task.starAwarded = true（非必做任务）→ consumeStarsFromSpecificType
          → 本地 star_groups 已有准确余额（前置已同步），扣减成功
      → task.starAwarded = false（必做任务/未发星）→ 直接重置，不扣减
      → 【M09新增 userId 传递】正确从指定孩子的分组扣减
```

> ⚠️ **关键前置条件**：`resetTask` 扣星操作在本地 `star_groups` 上执行（`task-service.js:1127`，仓储层 `star-group-repository.js:645`）。若设备B未同步孩子的 `star_groups`，扣减会因余额不足失败。因此**调用方必须通过 `options.requireFreshStars=true` 显式声明“本次任务读取将用于可操作的 resetTask 页面”**。服务层只按该参数执行前置同步，不自行猜测页面语义。

**后端 PATCH /api/tasks/:id/status 需增加写 star_awarded**：

```javascript
// backend/services/taskService.js updateTaskStatus 方法
async updateTaskStatus(taskId, statusData) {
  // M09新增：从前端接收 starAwarded，不在后端自行推导
  // 因为"是否发星"由前端业务规则决定（isRequired=true 不发星），后端不应硬编码
  const { status, starAwarded } = statusData;
  await execute(
    'UPDATE tasks SET status = ?, star_awarded = ?, completion_time = ? WHERE task_id = ? AND deleted_at IS NULL',
    [status, starAwarded ? 1 : 0, status === 1 ? Date.now() : null, taskId]
  );
}
```

> **注意**：前端 `_syncStatusToCloud` 目前只发 `status`（`task-service.js:2235`），M09 需补充此字段。后端直接写入前端传来的值，**不得从 status 推导 star_awarded**——必做任务完成时 `status=1` 但 `starAwarded=false`（`task-service.js:928`）。

### 奖励 stale cleanup 设计

参考 M08 的 `_cleanupStaleTasks`，`_fetchRewardsFromCloud` 完成后执行本地清理：

```javascript
async _fetchRewardsFromCloud(userId) {
  const cloudRewards = await HttpClient.get(API_CONFIG.ENDPOINTS.REWARDS);
  const cloudRewardIds = new Set(cloudRewards.map(r => r.rewardId));

  // upsert 云端奖励
  const rewardsToSave = cloudRewards.map(r => ({ ...r, syncedToCloud: true }));
  await this.rewardRepository.saveAll(rewardsToSave);

  // stale cleanup：本地有、云端无、syncedToCloud=true 的奖励视为已删除
  const allLocal = await this.rewardRepository.getAll();
  const stale = allLocal.filter(r =>
    !cloudRewardIds.has(r.id) && r.syncedToCloud === true
  );
  for (const r of stale) {
    await this.rewardRepository.delete(r.id);
    logger.info('RewardService', '清理陈旧本地奖励', { rewardId: r.id });
  }
}
```

```javascript
async refreshRewardsFromCloud() {
  return this._fetchRewardsFromCloud();
}
```

**默认奖励初始化**：`RewardService.initialize()` 中若 `enableCloudStorage=true`，**跳过默认奖励创建**，不在初始化阶段触发云端拉取；云端同步由 `refreshRewardsFromCloud()` 在奖励页 `onShow` 时执行，以避免一次性类锁导致后续页面显示不到最新奖励。

### 数据模型

#### 后端数据库表

```sql
-- star_records：星星流水（核心，余额由此推导）
CREATE TABLE star_records (
  record_id     VARCHAR(100) PRIMARY KEY,
  user_id       VARCHAR(100) NOT NULL,
  type          ENUM('income','expense') NOT NULL,
  source        VARCHAR(50) NOT NULL,        -- task/reward/adjustment/system
  source_id     VARCHAR(100),               -- 关联的任务ID或奖励ID
  points        INT NOT NULL,
  description   VARCHAR(255),
  expiry_type   VARCHAR(50),                -- 单分组可确定流水必填
  expiry_date   VARCHAR(20),                -- 收入场景可选
  modify_time   BIGINT DEFAULT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at    DATETIME DEFAULT NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_source_id (source_id)
);

-- star_groups：星星分组快照（由 star_records 派生并持久化，辅助高频读取与 resetTask 扣减）
CREATE TABLE star_groups (
  group_id      VARCHAR(100) PRIMARY KEY,
  user_id       VARCHAR(100) NOT NULL,
  type          VARCHAR(50) NOT NULL,        -- permanent/week/month/quarter
  stars         INT DEFAULT 0,
  expiry_date   VARCHAR(20),
  modify_time   BIGINT DEFAULT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id)
);

-- rewards：奖励（user_id 为创建者，按 family_id 查询实现家庭共享）
CREATE TABLE rewards (
  reward_id     VARCHAR(100) PRIMARY KEY,
  user_id       VARCHAR(100) NOT NULL,       -- 创建者（家长 userId）
  family_id     VARCHAR(100),               -- 家庭ID，用于按家庭查询
  name          VARCHAR(100) NOT NULL,
  description   VARCHAR(500),
  type          VARCHAR(50) DEFAULT 'item',
  points        INT NOT NULL,
  icon          VARCHAR(20) DEFAULT '🎁',
  enabled       TINYINT(1) DEFAULT 1,
  claimed       TINYINT(1) DEFAULT 0,
  claim_time    BIGINT DEFAULT NULL,
  claim_status  VARCHAR(50) DEFAULT 'available',
  modify_time   BIGINT DEFAULT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at    DATETIME DEFAULT NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_family_id (family_id)
);
```

### API 接口设计

#### 星星 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/stars?userId=` | 拉取用户星星余额和分组 |
| `GET` | `/api/stars/records?userId=` | 拉取指定用户流水记录（`_resolveTargetUserId` 校验） |
| `GET` | `/api/stars/records?scope=family` | 拉取全家流水记录（家长分析页使用，JWT familyId 查全家；**family scope 仅返回 records，不返回 groups snapshot**） |
| `POST` | `/api/stars/records` | 写入单条**单分组可确定**流水并同步维护分组快照（幂等，`record_id` 主键；payload 必须包含 `expiryType`，收入场景可带 `expiryDate`） |
| `POST` | `/api/stars/consume` | 执行通用扣星命令（后端决定扣减分摊，支持部分扣减，事务内更新 `star_groups` + 写消费流水） |
| `GET` | `/api/stars/groups?userId=` | 拉取星星分组快照（只读；快照由后端在写流水事务内维护） |

#### 奖励 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/rewards` | 拉取家庭奖励列表（从 JWT 取 familyId，返回全家可见奖励） |
| `POST` | `/api/rewards` | 创建奖励（幂等 upsert，写入 family_id） |
| `PUT` | `/api/rewards/:rewardId` | 更新奖励 |
| `DELETE` | `/api/rewards/:rewardId` | 软删除奖励 |
| `PATCH` | `/api/rewards/:rewardId/exchange` | 兑换奖励（消耗星星，兑换直达 delivered 状态；支持可选 `exchangeUserId` 代孩子兑换） |

> ⚠️ 不引入 `PATCH /api/rewards/:rewardId/deliver`：前端 `markRewardAsDelivered()` 已标注 `@deprecated`，`Reward.claim()` 直接推进到 `delivered` 状态，引入此端点会导致前后端状态机分叉。

#### `POST /api/stars/consume` 命令契约

该接口是**通用扣星命令**，只用于 `consumeStars` / 必做任务惩罚等“可能跨多个分组扣减”的场景；**不用于奖励兑换**。奖励兑换仍由 `PATCH /api/rewards/:rewardId/exchange` 在后端一次性完成“校验 + 扣星 + 写消费流水 + 更新奖励状态”，保证原子性。

**请求体**：

```json
{
  "userId": "child_001",
  "requestedPoints": 5,
  "reason": "必做任务惩罚: 背单词",
  "sourceType": "task_penalty",
  "sourceId": "task_123",
  "originalTaskDate": "2026-03-20",
  "idempotencyKey": "task_penalty:task_123:1742400000000"
}
```

**字段说明**：
- `userId`：目标扣减用户，走 `_resolveTargetUserId` 鉴权
- `requestedPoints`：请求扣减数量
- `reason`：消费原因
- `sourceType` / `sourceId`：业务来源，供审计和幂等判定使用
- `originalTaskDate`：仅任务惩罚等需要保留原始日期语义的场景传递
- `idempotencyKey`：命令幂等键；同一业务动作重试时必须复用，后端据此避免重复扣星

**响应体**：

```json
{
  "success": true,
  "requestedPoints": 5,
  "consumedPoints": 3,
  "isPartial": true,
  "record": {
    "recordId": "record_123",
    "type": "expense",
    "points": -3
  },
  "deductionBreakdown": [
    { "groupId": "g1", "expiryType": "week", "points": 1 },
    { "groupId": "g2", "expiryType": "month", "points": 2 }
  ],
  "updatedGroupsSnapshot": [
    { "groupId": "g1", "stars": 0 },
    { "groupId": "g2", "stars": 4 }
  ]
}
```

**响应语义**：
- `success=true` 只表示本次命令实际扣减了 `consumedPoints > 0`
- 允许 `consumedPoints < requestedPoints`，用于表达余额不足下的部分扣减；前端业务逻辑以返回值中的实际扣减数量为准
- `deductionBreakdown` 由后端返回真实跨分组分摊结果，前端不能自行推导
- `updatedGroupsSnapshot` 用于前端在本地快速回灌最新快照；若缺失则前端需回退到后续全量刷新

---

## 代码结构

### 文件变更清单

**新增文件**：
- `backend/database/migrations/007_create_star_records.sql`
- `backend/database/migrations/008_create_star_groups.sql`
- `backend/database/migrations/009_create_rewards.sql`
- `backend/models/StarRecord.js`
- `backend/models/StarGroup.js`
- `backend/models/Reward.js`
- `backend/services/starService.js`
- `backend/services/rewardService.js`
- `backend/controllers/starController.js`
- `backend/controllers/rewardController.js`
- `backend/routes/stars.js`
- `backend/routes/rewards.js`
- `backend/test/integration/star-api-m09-real.test.js`
- `backend/test/integration/reward-api-m09-real.test.js`

**修改文件**：
- `backend/server.js` - 注册 stars/rewards 路由
- `backend/database/test-setup-modern.sql` - 补充三张表
- `backend/controllers/taskController.js` - `updateTaskStatus` 同时读取 `req.body.starAwarded` 传给服务层
- `backend/services/taskService.js` - `updateTaskStatus` 接收 `{ status, starAwarded }` 写入 DB，不从 status 推导
- `backend/test/unit/taskController-m07.test.js` - 更新 `updateTaskStatus` 调用断言（签名变更为 `{ status, starAwarded }`）
- `models/star-group.js` - 新增 `syncedToCloud` 字段
- `models/star-record.js` - 新增 `syncedToCloud` 字段，补充 `expiryType` / 可选 `expiryDate`
- `models/reward.js` - 新增 `syncedToCloud` 字段
- `repositories/star-group-repository.js` - `deductStarsFromSpecificExpiryType` 新增 userId 参数
- `repositories/reward-repository.js` - `getAvailableRewards` 云端模式下跳过 userId 精确过滤
- `services/star-service.js` - 写操作后双写云端，新增公开方法 `refreshStarsFromCloud(userId, options)`（内部复用 `_fetchStarsFromCloud`，支持 `scope=family`；family scope 仅回灌 records），`consumeStarsFromSpecificType` 传递 userId，`_syncConsumeToCloud` 使用命令式契约
- `packageChart/components/star-trend/star-trend.js` - `loadData` 中在渲染前调用 `refreshStarsFromCloud`，家长传 `{ scope: 'family' }`
- `services/reward-service.js` - 写操作后双写云端，新增公开方法 `refreshRewardsFromCloud()`（内部复用 `_fetchRewardsFromCloud`）/`_syncExchangeToCloud`，`getAvailableRewards` 语义扩展，`initialize()` 云端模式跳过默认奖励
- `services/task-service.js` - 显式用户任务读取入口（`getAllTasks` / `getTasksByDate` / `getTodayTasks`）支持 `options.requireFreshStars` 控制 `refreshStarsFromCloud` 前置，`_syncStatusToCloud` 补充 `starAwarded`，移除 resetTask 跨设备拦截
- `utils/api-config.js` - 新增 STARS/REWARDS 端点
- `packageChart/components/star-trend/star-trend.wxml` - 移除免责提示（前提：`refreshStarsFromCloud` 已回灌流水；文本在 `star-trend.wxml:6`）
- `packageChart/components/star-calendar/star-calendar.js` - 优先使用真实任务流水，并将 `task_complete` / `task_reset` 按任务净额聚合
- `packageChart/utils/analyticsUtils.js` - 新增任务星星日历净额汇总工具
- `pages/rewards/rewards.js` - `onShow` 时先调用 `starService.refreshStarsFromCloud(effectiveChildId)`，再调用 `rewardService.refreshRewardsFromCloud()`
- `backend/services/familyService.js` / `backend/services/rewardService.js` - 创建家庭后迁移历史奖励 `family_id`，修复奖励可见性
- `backend/models/Task.js` / `backend/services/taskService.js` - 兼容 `tasks` 表旧/新字段命名，修复任务云端建档/状态同步
- `test/services/star-service.test.js`、`test/services/reward-service.test.js`、`test/services/task-service.test.js`、`test/utils/analytics-utils.test.js` - 补充 M09 与实施后回归场景

### 核心代码示例

#### consumeStarsFromSpecificType 修复 userId 传递

```javascript
// services/star-service.js
async consumeStarsFromSpecificType(points, expiryType, reason, options = {}) {
  // ...现有校验逻辑...

  // 【M09修复】传入 userId，确保多孩子家庭下只操作指定用户的分组
  const userId = options.userId || null;
  const deductResult = await this.starGroupRepository.deductStarsFromSpecificExpiryType(
    points,
    expiryType,
    reason,
    userId  // 新增
  );
  // ...
}

// repositories/star-group-repository.js
async deductStarsFromSpecificExpiryType(amount, expiryType, reason, userId = null) {
  // 【M09修复】按 userId 过滤分组，userId 为 null 时保持原有行为（向后兼容）
  const groups = await this.getGroupsByExpiryType(expiryType, userId);
  // ...其余逻辑不变...
}
```

#### _syncStatusToCloud 补充 starAwarded

```javascript
// services/task-service.js
async _syncStatusToCloud(task) {
  if (!this.enableCloudStorage) return;
  try {
    const url = API_CONFIG.ENDPOINTS.TASK_STATUS.replace('{taskId}', task.id);
    // 【M09新增】同步 starAwarded，使跨设备 resetTask 可靠
    await HttpClient.patch(url, {
      status: task.status,
      starAwarded: task.starAwarded,
    });
  } catch (err) {
    logger.warn('TaskService', '云端状态同步失败（本地已保存）', { taskId: task.id, error: err.message });
  }
}
```

#### 前端 StarService 双写

```javascript
// star-service.js：addStars 成功后异步同步
async addStars(points, expiryType, source, options = {}) {
  const result = await this._localAddStars(points, expiryType, source, options);

  if (result.success && this.enableCloudStorage && result.record) {
    this._syncStarRecordToCloud(result.record).catch(err => {
      logger.warn('StarService', '云端同步失败，本地已记录', err);
    });
  }
  return result;
}

// 仅用于 addStars / consumeStarsFromSpecificType 等“单分组可确定”的流水同步
async _syncStarRecordToCloud(record) {
  await HttpClient.post(API_CONFIG.ENDPOINTS.STAR_RECORDS, {
    recordId: record.id,
    userId: record.userId,
    type: record.type,
    source: record.source,
    sourceId: record.sourceId,
    points: record.points,
    description: record.description,
    expiryType: record.expiryType,
    expiryDate: record.expiryDate || null,
    modifyTime: record.timestamp,
  });
  record.syncedToCloud = true;
  await this.starRecordRepository.save(record);
  logger.info('StarService', '星星流水云端同步成功', { recordId: record.id });
}
```

#### 后端 StarService 幂等写入

```javascript
// backend/services/starService.js
async upsertStarRecord(userId, recordData) {
  const existing = await query(
    'SELECT record_id FROM star_records WHERE record_id = ? LIMIT 1',
    [recordData.recordId]
  );
  if (existing.length > 0) {
    logger.info('星星流水幂等：已存在', { recordId: recordData.recordId });
    return this.getStarRecordById(recordData.recordId);
  }
  await execute(
    `INSERT INTO star_records (record_id, user_id, type, source, source_id, points, description, expiry_type, expiry_date, modify_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [recordData.recordId, userId, recordData.type, recordData.source,
     recordData.sourceId || null, recordData.points,
     recordData.description || '', recordData.expiryType,
     recordData.expiryDate || null, recordData.modifyTime || Date.now()]
  );
  return this.getStarRecordById(recordData.recordId);
}
```

---

## 实施步骤

### 第1步：数据库迁移 + 后端模型（0.5天）

- [x] 创建 `007_create_star_records.sql`（MySQL 5.7 兼容）
- [x] 创建 `008_create_star_groups.sql`
- [x] 创建 `009_create_rewards.sql`（含 `family_id` 字段）
- [x] 更新 `test-setup-modern.sql` 补充三张表
- [x] 创建 `backend/models/StarRecord.js`、`StarGroup.js`、`Reward.js`（fromDB / toDB / toJSON）
- [x] **验证**：真实数据库集成测试通过

### 第2步：后端 taskController + taskService 补充 star_awarded 同步（0.5天）

- [x] `backend/controllers/taskController.js`：`updateTaskStatus` 方法中从 `req.body` 同时读取 `starAwarded`，传给服务层（`const { status, starAwarded } = req.body`）
- [x] `backend/services/taskService.js`：`updateTaskStatus` 签名改为接收 `{ status, starAwarded }`，写入 DB 时直接用前端传来的值（`starAwarded ? 1 : 0`），**不从 status 推导**（必做任务完成 status=1 但 starAwarded=false）
- [x] **验证**：真实接口与任务状态链路已通过

### 第3步：后端 StarService + 路由（0.5天）

- [x] 创建 `backend/services/starService.js`（余额查询、流水写入、分组同步）
  - `POST /api/stars/records`：后端在同一事务内写 `star_records` + 更新 `star_groups`
  - 收入场景（任务完成发星）payload 必须包含 `expiryType`（必要时含 `expiryDate`）
  - 特定有效期扣减场景（任务重置）payload 必须包含 `expiryType`
  - 通用扣星/必做任务惩罚走 `POST /api/stars/consume`，由后端决定扣减分摊并写消费流水
  - 奖励兑换不依赖通用 `POST /api/stars/records` 推导快照，由 `PATCH /api/rewards/:rewardId/exchange` 在后端直接扣减快照并写消费流水
- [x] 创建 `backend/controllers/starController.js`（6个端点）
- [x] 创建 `backend/routes/stars.js`，注册到 `backend/server.js`
- [x] **验证**：`POST /api/stars/records` 仅用于单分组可确定流水；`POST /api/stars/consume` 支持部分扣减且返回扣减分摊/快照；`GET /api/stars?userId=` 返回余额

### 第4步：后端 RewardService + 路由（0.5天）

- [x] 创建 `backend/services/rewardService.js`（CRUD、兑换、幂等 upsert，按 family_id 查询）
- [x] 创建 `backend/controllers/rewardController.js`（5个端点，不含 deliver）
- [x] 创建 `backend/routes/rewards.js`，注册到 `backend/server.js`
- [x] **验证**：`POST /api/rewards` 创建、`GET /api/rewards` 按家庭返回列表

### 第5步：前端 userId 隔离修复（0.5天）

- [x] `repositories/star-group-repository.js`：`deductStarsFromSpecificExpiryType` 新增 userId 参数，调用 `getGroupsByExpiryType(expiryType, userId)`
- [x] `services/star-service.js`：`consumeStarsFromSpecificType` 从 options 取 userId 传入仓储
- [x] **验证**：多孩子场景下，取消孩子A的任务只扣孩子A的星星

### 第6步：前端 StarService 双写 + _syncStatusToCloud 修复（0.5天）

- [x] `utils/api-config.js` 新增 `STAR_RECORDS`、`STAR_GROUPS`、`STARS` 端点
- [x] `models/star-record.js` 新增 `syncedToCloud = false`，并补充 `expiryType`；收入/单分组收入场景可选补充 `expiryDate`
- [x] `models/star-group.js` 新增 `syncedToCloud = false`
- [x] `services/star-service.js`：
  - `addStars` 成功后异步 `_syncStarRecordToCloud`
  - `consumeStars` 成功后异步 `_syncConsumeToCloud(points, reason, options)`，走专用 `POST /api/stars/consume`
  - `consumeStarsFromSpecificType` 成功后异步 `_syncStarRecordToCloud`
  - `_syncStarRecordToCloud(record)` payload 补充 `expiryType`；收入场景可选补充 `expiryDate`
  - 新增 `_syncConsumeToCloud(points, reason, options)`：供必做任务惩罚等通用扣星场景复用；请求体包含 `requestedPoints`、`userId`、`sourceType`、`sourceId`、`idempotencyKey`
  - 新增公开方法 `refreshStarsFromCloud(userId, options = {})`，内部复用 `_fetchStarsFromCloud`；支持 `options.scope='family'`，家长视角时仅拉取全家流水（`GET /api/stars/records?scope=family`），不回灌全家 groups
- [x] `services/task-service.js`：`getAllTasks(userId, options = {})` 中，仅当 `userId` 为显式用户且 `options.requireFreshStars === true` 时，云端模式下**在 `_fetchTasksFromCloud` 前**调用 `starService.refreshStarsFromCloud(userId)`；`userId=null` 或 `requireFreshStars !== true` 时保持只读聚合语义，不触发星星同步
- [x] `services/task-service.js`：`getTasksByDate(date, userId, options = {})` / `getTodayTasks(userId, options = {})` 中，仅当 `userId` 为显式用户且 `options.requireFreshStars === true` 时，云端模式下同样在任务拉取前调用 `starService.refreshStarsFromCloud(userId)`；首页主任务列表入口显式传入该参数
- [x] 任务列表主页面调用链：所有需要支持 `resetTask` 的页面传入显式 `effectiveUserId`，并显式传 `requireFreshStars: true`；搜索/聚合/分析等只读场景继续使用默认值，不触发额外星星同步
- [x] `packageChart/components/star-trend/star-trend.js`：`loadData` 中在 `calculateHistoricalBalance` 前，根据 `analysisOptions` 调用 `refreshStarsFromCloud`（孩子传 userId，家长传 `{ scope: 'family' }`）
- [x] `services/task-service.js`：`_syncStatusToCloud` 补充发送 `starAwarded` 字段
- [x] `services/task-service.js`：移除 `resetTask` 中的 `crossDeviceLimit` 拦截
- [x] **验证**：任务完成后 `star_records` 表有记录，云端 `star_awarded=1`；设备B进入任务列表后 `star_groups` 本地余额与云端一致；跨设备 resetTask 扣星成功

### 第7步：前端 RewardService 双写 + stale cleanup（0.5天）

- [x] `models/reward.js` 新增 `syncedToCloud = false`
- [x] `utils/api-config.js` 新增 `REWARDS` 端点
- [x] `services/reward-service.js`：
  - `createReward`/`updateReward`/`deleteReward`：异步 `_syncRewardToCloud`（通用 upsert）
  - `exchangeReward`：异步 `_syncExchangeToCloud(rewardId, exchangeUserId)`（**独立兑换路径，不用 _syncRewardToCloud**）
  - `getAvailableRewards`：云端模式下跳过 `r.userId === userId` 精确过滤
  - 新增公开方法 `refreshRewardsFromCloud()`，内部复用 `_fetchRewardsFromCloud`（全量 upsert + stale cleanup）
  - 新增 `_syncExchangeToCloud(rewardId, exchangeUserId)`：发送 `PATCH /api/rewards/:rewardId/exchange`，payload 含 `{ exchangeUserId, modifyTime }`
  - `initialize()`：云端模式下跳过默认奖励创建；云端拉取由 `refreshRewardsFromCloud()` 在奖励页进入时触发
- [x] `repositories/reward-repository.js`：`getAvailableRewards` 云端模式下跳过 userId 精确过滤
- [x] `pages/rewards/rewards.js`：`onShow` 时先调用 `starService.refreshStarsFromCloud(effectiveChildId)`，再调用 `rewardService.refreshRewardsFromCloud()`（不依赖 initialize 锁）
- [x] **验证**：家长创建奖励后孩子设备打开奖励页即可见（onShow 触发拉取）；孩子设备进入奖励页时星星余额同步为最新值；家长删除奖励后孩子端下次打开不再显示；家长代孩子兑换后孩子星星被正确扣减

### 第8步：测试补充（0.5天）

- [x] 后端集成测试：`star-api-m09-real.test.js`（流水写入幂等、余额查询）
- [x] 后端集成测试：`star-api-m09-real.test.js` 增补 `POST /api/stars/consume`（通用扣星、幂等/原子性）
- [x] 后端集成测试：`reward-api-m09-real.test.js`（奖励 CRUD、家庭查询、兑换）
- [x] 前端单元测试：`star-service.test.js` 补充双写场景、userId 隔离、云端失败降级、`consumeStars -> _syncConsumeToCloud`
- [x] 前端单元测试：`reward-service.test.js` 补充双写场景、stale cleanup
- [x] **验证**：针对 M09 的前后端测试均已通过

---

## 测试方案

### 单元测试

| 测试项 | 测试方法 | 预期结果 |
|--------|---------|---------|
| addStars 双写 | mock HttpClient 成功 | syncedToCloud=true，record 已持久化 |
| addStars 云端失败降级 | mock HttpClient 抛错 | 本地记录保留，syncedToCloud=false，不抛异常 |
| consumeStarsFromSpecificType userId 隔离 | userId=childA，分组含 childA/childB | 只操作 childA 的分组 |
| _syncStarRecordToCloud payload（收入） | 完成任务发星 | 请求体包含 `expiryType`，可选 `expiryDate` |
| _syncStarRecordToCloud payload（重置扣星） | `consumeStarsFromSpecificType` | 请求体包含 `expiryType`，不要求伪造通用扣星的单一 `expiryType` |
| `POST /api/stars/records` 快照维护 | mock 后端事务写入 | 仅处理单分组可确定流水，`star_records` 与 `star_groups` 同步更新 |
| `consumeStars -> _syncConsumeToCloud` | 必做任务惩罚/通用扣星 | 走 `POST /api/stars/consume`，请求体带 `requestedPoints`/`idempotencyKey`，返回实际扣减数量与分摊明细 |
| refreshStarsFromCloud（孩子模式） | mock 云端返回 userId 对应 records + groups snapshot | 本地 starRecords / starGroups 更新，syncedToCloud=true |
| refreshStarsFromCloud（family scope） | mock 云端返回全家 records | 全家流水回灌本地，不额外回灌 groups，`GET /api/stars/records?scope=family` 被调用 |
| refreshStarsFromCloud（family scope）后 getAllStarRecords | 家长进入分析页 | calculateHistoricalBalance 能读到全家本地流水 |
| `getAllTasks(null)` 语义 | 搜索/聚合场景 | 不触发 `refreshStarsFromCloud(null)`，仅返回本地/缓存中的全部任务集合 |
| `getTasksByDate/getTodayTasks` 前置同步 | 首页/任务列表 | 仅在传入 `requireFreshStars: true` 时先 `refreshStarsFromCloud(userId)`，避免 resetTask 读取旧余额 |
| createReward 双写 | mock HttpClient 成功 | syncedToCloud=true |
| exchangeReward 双写 | mock HttpClient 成功 | 云端 exchange 状态同步 |
| refreshRewardsFromCloud stale cleanup | 云端无 rewardX，本地 syncedToCloud=true | rewardX 被本地删除 |
| refreshRewardsFromCloud 保留未同步奖励 | 云端无 rewardY，本地 syncedToCloud=false | rewardY 保留 |
| 奖励页 onShow 同步顺序 | 先 refreshStars 再 refreshRewards | 页面中的余额与奖励列表都为最新值 |
| resetTask 跨设备（starAwarded=true） | starAwarded=true，有积分 | 正常扣减星星，重置成功 |
| resetTask 跨设备（starAwarded=false） | starAwarded=false | 直接重置，不扣减 |
| _syncStatusToCloud 携带 starAwarded | 任务完成 | 发送 { status:1, starAwarded:true } |

### 后端集成测试

- [x] `POST /api/stars/records`：单分组可确定流水正常写入、重复幂等返回
- [x] `POST /api/stars/consume`：通用扣星成功，返回 `requestedPoints` / `consumedPoints`、更新后的快照/消费流水
- [x] `POST /api/stars/consume`：同一请求重试不重复扣减
- [x] `POST /api/stars/consume`：余额不足时返回部分扣减结果，`consumedPoints < requestedPoints`
- [x] `GET /api/stars?userId=`：正确返回余额（流水累计）
- [x] `GET /api/stars/records?scope=family`：家长身份返回全家流水，孩子身份返回 403
- [x] `GET /api/stars/records?scope=family`：返回数据覆盖家庭内所有孩子的流水记录（多孩子场景）
- [x] `GET /api/stars/records?userId=otherFamilyUser`：返回 403（跨家庭隔离）
- [x] `POST /api/rewards`：正常创建、重复幂等
- [x] `GET /api/rewards`：家庭成员均可查到家长创建的奖励
- [x] `PATCH /api/rewards/:rewardId/exchange`：孩子自己兑换（无 exchangeUserId，JWT userId 扣星）
- [x] `PATCH /api/rewards/:rewardId/exchange`：家长代孩子兑换（传 `exchangeUserId=childId`，扣孩子星星）
- [x] `PATCH /api/rewards/:rewardId/exchange`：同一 `rewardId + exchangeUserId + modifyTime` 重试不重复扣星，返回幂等成功结果
- [x] `PATCH /api/rewards/:rewardId/exchange`：奖励已被其他请求兑换后，再次兑换返回已兑换/冲突状态
- [x] `PATCH /api/rewards/:rewardId/exchange`：`exchangeUserId` 为非家庭孩子时返回 403
- [x] `PATCH /api/rewards/:rewardId/exchange`：星星不足返回 400
- [x] `PATCH /api/tasks/:id/status`：非必做任务完成时 `star_awarded=1`（前端传 `starAwarded=true`）
- [x] `PATCH /api/tasks/:id/status`：必做任务完成时 `star_awarded=0`（前端传 `starAwarded=false`）
- [x] `PATCH /api/tasks/:id/status`：重置时 `star_awarded=0`

### 手动测试

> 说明：以下为上线前建议回归清单；其中本次已完成的关键链路已标记为 ✅，其余保留为后续补充回归项。

1. **奖励同步**：
   - [x] 家长设备创建奖励 → 孩子设备重新进入奖励页面 → 可见该奖励
   - [ ] 家长设备删除奖励 → 孩子设备重新进入奖励页面 → 不再显示
   - [ ] 孩子设备重新进入奖励页面 → 奖励列表与孩子星星余额同时刷新，无“奖励已更新但余额仍旧”的状态

2. **跨设备 resetTask**：
   - [x] 完成任务（有积分）→ 首页今日任务取消打卡 → 星星正确扣减，任务重置
   - [ ] 设备A（孩子）完成任务（有积分）→ 设备B（家长）从任务编辑/热力图入口进入取消打卡 → 星星正确扣减，任务重置

3. **多孩子星星隔离**：
   - [ ] 孩子A完成任务 → 取消时只扣孩子A的星星，孩子B余额不变
   - [ ] 必做任务惩罚 → 仅扣目标孩子，快照与流水一致

4. **分析页**：
   - [x] 孩子视角进入分析页 → 拉取该孩子云端流水 → 趋势图反映该孩子完整记录
   - [ ] 家长视角进入分析页（scope=family）→ 拉取全家云端流水 → 趋势图反映所有孩子完整记录
   - [x] 删除免责提示后趋势图数据完整展示（不再仅含本设备）

5. **代孩子兑换**：
   - [ ] 家长设备选择孩子，兑换奖励 → 孩子的星星被正确扣减（不扣家长星星）

6. **跨账户隔离**：
   - [ ] 孩子设备修改 userId 参数 → 后端返回 403，无法访问其他家庭数据
   - [ ] 搜索/聚合场景调用 `getAllTasks(null)` → 不触发额外的全量星星同步

---

## 风险评估

### 技术风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| star_records 流水量大，查询慢 | 中 | 低 | 加 user_id 索引；余额由分组缓存，不每次全量累计 |
| 前端 StarService 逻辑复杂（1432行），改动引入回归 | 高 | 中 | 改动最小化，仅在 addStars/consume 出口处挂云端同步；充分单测 |
| resetTask 解除后星星余额异常 | 高 | 低 | 前提：`_syncStatusToCloud` 携带 `starAwarded`，且任务列表加载前先 `refreshStarsFromCloud` |
| 奖励兑换与星星扣减的原子性 | 中 | 中 | 奖励兑换走专用后端接口，在云端基于当前快照扣减星星并写流水；前端仅做本地乐观更新 |
| star_groups 快照与流水漂移 | 高 | 低 | 后端以事务同时维护 `star_records + star_groups`，并提供按流水重建快照能力 |
| 默认奖励与云端数据冲突 | 中 | 低 | `initialize()` 云端模式跳过默认奖励创建，页面进入时再主动拉云端奖励 |

### 业务风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| 双写失败导致云端与本地不一致 | 中 | 低 | 以 star_records 流水为准；进入首页时触发全量拉取对账，必要时重建 star_groups 快照 |
| 云端奖励为空导致首屏无内容 | 中 | 低 | 云端模式下不依赖本地默认奖励；奖励页展示空状态和创建引导，`refreshRewardsFromCloud` 返回空也不报错 |

---

## 替代方案

### 方案A（当前方案）：双写 + star_records 流水推导余额 + 家庭级奖励查询

**优势**：
- ✅ 与 M07/M08 任务同步模式完全一致，学习成本低
- ✅ 流水不可篡改，审计完整
- ✅ 奖励按 family_id 查询，天然支持家长→孩子可见
- ✅ 本地优先，离线可用

**劣势**：
- ❌ 余额需要服务端累计计算，稍复杂
- ❌ `deductStarsFromSpecificExpiryType` 需要改动，有轻微回归风险

---

### 方案B：只同步 star_groups 余额，不同步流水

**描述**：只把每个分组的余额值存云端，不存流水记录。

**优势**：
- ✅ 实现最简单

**劣势**：
- ❌ 并发修改时容易出现余额覆盖问题
- ❌ 无流水审计，无法追溯
- ❌ 与 `resetTask` 解除需要确认 `starAwarded` 的需求冲突

**未选择原因**：并发安全性不足。

---

## 审核记录

### 审核要点

- [ ] 符合DDD架构（不引入微信云开发）
- [ ] 双写模式与 M07/M08 保持一致
- [ ] userId 隔离修复正确（仓储层按 userId 过滤分组）
- [ ] resetTask 解除的完整契约（`_syncStatusToCloud` 携带 `starAwarded` → 云端写库 → 设备B拉取 → 本地 starAwarded=true）
- [ ] 奖励归属模型清晰（family_id 查询，孩子可见家长奖励）
- [ ] 奖励 stale cleanup 安全（syncedToCloud=false 的不删）
- [ ] 不引入已废弃的 markRewardAsDelivered 端点
- [ ] 实施步骤可逐步独立执行
- [ ] 测试方案覆盖关键路径

### 审核意见

**审核者**：项目维护者（待补签）
**审核日期**：2026-03-21
**审核结果**：🟢 已实施并通过代码、测试与关键链路复核

---

**最后更新**：2026-03-21
