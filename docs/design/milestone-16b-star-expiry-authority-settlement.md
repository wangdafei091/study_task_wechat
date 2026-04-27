# 里程碑-16B：星星到期后端权威结算 详细设计文档

> **设计状态**：🟢 已完成
> **创建日期**：2026-04-01
> **设计者**：GPT5 Codex
> **审核者**：项目维护者
> **预计工期**：7-9天

---

## 📋 目录

- [需求分析](#需求分析)
- [技术方案](#技术方案)
- [代码结构](#代码结构)
- [实施步骤](#实施步骤)
- [测试方案](#测试方案)
- [风险评估](#风险评估)
- [替代方案](#替代方案)
- [审核要点自检](#审核要点自检)
- [审核记录](#审核记录)
- [附录](#附录)

---

## 需求分析

### 功能描述

M16A 已把“任务即将开始提醒”和“星星即将过期提醒”正式化，并统一了提醒窗口、保护窗口和展示口径；但本轮审计确认，星星真正的“到期结算”和“奖励过期保护”仍不是后端单一权威。当前项目里，前端启动链路和首页定时检查仍会直接执行本地过期清理、创建本地过期流水、触发本地事件，并在本地奖励数据上写入 `protectedByExpiry / partialProtection`。与此同时，后端只是在读取余额和扣星时把已过期或非法分组过滤掉，并未成为“到期结算”的唯一执行者。进一步复核还确认：当前奖励池是家庭共享实体，而星星与到期发生在孩子个人维度上，因此“奖励保护”并不是一个天然的纯 reward 维度状态；若继续把保护结果直接写回共享 `rewards` 记录，就会在多孩子家庭里产生作用域冲突。

这会带来三个直接问题。第一，跨设备一致性仍然不可靠，因为设备 A 没打开时，设备 B 可能已经基于后端过滤读到了“正确余额”，但本地到期流水、奖励展示缓存和前端缓存未必同步一致。第二，星星到期属于“资产结算”语义，继续依赖前端本地清理意味着时序和幂等边界分散，难以解释“到底是哪一端真正扣掉了已到期星星”。第三，现有测试和代码都在固化一个“前端负责清理、后端负责隐藏”的混合模型，若不先完成权威迁移，后续的真实环境验证、问题排查和数据修复会越来越困难。

M16B 的目标，就是把“星星到期结算”迁移为后端权威执行，同时把“奖励保护”的权威使用点从前端本地写状态迁移为后端按兑换孩子即时计算，并保留 M16A 已完成的正式提醒语义。客户端仍可作为触发方，但只能触发后端命令，不能再在云端模式下自行修改到期分组、创建到期流水或本地写保护状态。

### 业务价值

- [x] 用户价值：跨设备进入首页、奖池页、消息页时，都能看到一致的星星余额、到期结果和奖励可兑换结果。
- [x] 技术价值：将“前端本地清理 + 后端读时过滤”的混合模型收敛为“后端结算 + 前端读取”的单权威模型。
- [x] 业务价值：把星星到期从弱一致体验问题升级为可审计、可回放、可修复的正式业务流水。

### 事实基线（2026-04-01，设计前）

#### 1. 前端仍在执行真实的到期清理

当前前端 `services/star-service.js` 在 `initialize()` 中直接调用 `cleanupExpiredStars()`，会：

- 删除本地已过期分组
- 创建本地过期流水
- 触发 `STARS_EXPIRED` 事件
- 清理空分组

对应代码事实：

- `services/star-service.js:54-68`
- `services/star-service.js:1789-1848`

#### 2. 前端仍在执行奖励过期保护

当前前端仍保留以下逻辑：

- `calculatePendingExpiry()`：以未来 48 小时窗口计算“即将过期星星”
- `protectRewardsByExpiry()`：在本地奖励数据上写入 `protectedByExpiry / partialProtection`

对应代码事实：

- `services/star-service.js:1645-1672`
- `services/star-service.js:1681-1777`

#### 3. 登录启动链路先做前端保护和清理，再进入正式读取

`utils/app/post-login-bootstrap.js` 里当前顺序是：

1. `calculatePendingExpiry(loginUserId)`
2. `protectRewardsByExpiry(expiredStars, loginUserId)`
3. `starService.initialize()`，其内部又会本地 `cleanupExpiredStars()`
4. 之后才继续其他初始化

这意味着云端模式下，启动阶段仍会先对本地数据执行到期相关副作用。

对应代码事实：

- `utils/app/post-login-bootstrap.js:56-77`

#### 4. 首页仍每 5 分钟执行一次前端本地到期清理

首页 `checkExpiredTasksAndStars()` 当前以 5 分钟窗口节流，并在窗口到达时调用：

- `taskService.checkTasksStatus()`
- `starService.cleanupExpiredStars()`

对应代码事实：

- `pages/index/modules/index-refresh-coordinator.js:68-115`

#### 5. 后端目前是“读时过滤”，不是“权威结算”

后端 `backend/services/starService.js` 当前会在以下位置把已过期或非法分组排除：

- `getStarGroupsByUser()`
- `_getGroupsByUserConn()`
- `_deductFromGroups()` 的候选分组来源

核心规则是：

- `permanent` 永远有效
- 非永久分组若 `expiry_date` 无法规范化，直接视为无效并过滤
- 规范化后的日期若早于今天，直接视为已过期并过滤

但后端当前并不会主动：

- 删除这些已过期分组
- 生成“到期结算”的正式流水
- 统一收口与到期相关的奖励展示缓存

对应代码事实：

- `backend/services/starService.js:28-38`
- `backend/services/starService.js:561-593`
- `backend/services/starService.js:595-693`

#### 6. 后端已经具备“到期前提醒”，但没有“到期结算”接口

当前星星域对外路由只有：

- `GET /api/stars`
- `GET /api/stars/records`
- `POST /api/stars/records`
- `POST /api/stars/consume`
- `GET /api/stars/groups`
- `POST /api/stars/expiring-reminders/sync`

其中 `expiring-reminders/sync` 是 M16A 的正式提醒入口，不承担结算职责。

对应代码事实：

- `backend/routes/stars.js:14-19`
- `backend/controllers/starController.js:118-155`

#### 7. 现有表结构足够承载星星结算，但不足以无歧义承载“按孩子区分的奖励保护”

当前后端已有：

- `star_groups`：表示当前余额快照
- `star_records`：表示收入/支出流水，支持 `idempotency_key`
- `rewards`：已有 `protected_by_expiry / partial_protection`

其中 `star_groups + star_records` 已足够支撑“星星到期结算”迁移；但 `rewards.protected_by_expiry / partial_protection` 当前是直接挂在共享奖励实体上的字段，而不是按孩子区分的状态。由于当前奖励池在家庭内共享读取，孩子 A 与孩子 B 的到期保护结果并不天然相同，因此 M16B 不能继续把“保护结果”简单视为共享 reward 字段的权威来源，必须先明确作用域和读取契约。

对应代码事实：

- `backend/database/migrations/007_create_star_records.sql:1-24`
- `backend/database/migrations/008_create_star_groups.sql:1-13`

#### 8. 当前测试仍在固化“前端负责到期清理/保护”的混合模型

已存在测试明确期望：

- 登录启动链路会调用 `protectRewardsByExpiry()`
- 首页过期检查会调用 `cleanupExpiredStars()`
- 后端只验证“读时过滤活跃分组”，不验证“到期结算”

对应代码事实：

- `test/app/post-login-bootstrap.test.js:115-148`
- `test/pages/index.refresh-coordinator.test.js:152-211`
- `backend/test/unit/starService.test.js:21-158`

#### 9. 当前前端“sync 后读取”仍可能拿到本地旧快照

当前 `refreshStarsFromCloud(userId)` 在云端模式下只要发现本地还有待同步的星星流水，就会跳过云端覆盖并继续返回本地分组/流水快照。这意味着即便后端已经执行了权威结算，前端也不一定会马上读到结算后的权威余额。

对应代码事实：

- `services/star-service.js:1421-1435`

#### 10. 当前奖励读取与星星读取不是同一刷新契约

奖励页进入时会同时调用：

- `starService.refreshStarsFromCloud(effectiveChildId)`
- `rewardService.refreshRewardsFromCloud(...)`

但首页奖励区当前只刷新星星，不刷新奖励；因此若后续权威链路改变了奖励相关展示或可兑换结果，首页和奖池页并不天然会同时读到同一份结果。

对应代码事实：

- `pages/rewards/rewards.js:148-175`
- `services/reward-service.js:741-799`
- `pages/index/modules/index-reward-flow.js:173-216`

### 功能范围

**包含**：
- ✅ 设计并实现星星到期的后端权威结算命令
- ✅ 设计并实现奖励兑换时按孩子即时计算的后端权威保护
- ✅ 将云端模式下的前端本地清理/保护改为后端触发 + 云端刷新
- ✅ 保留并衔接 M16A 的正式提醒链路，确保“先结算，再提醒/读取”
- ✅ 明确历史脏数据、旧共享保护缓存字段和兼容降级策略
- ✅ 补齐与新权威边界匹配的自动化测试和手工验收矩阵

**不包含**：
- ❌ 引入后端定时任务或常驻调度器
- ❌ 重做星星有效期规则本身
- ❌ 重做奖励保护业务规则本身
- ❌ 重新设计消息中心 UI
- ❌ 强制补算所有历史前端本地流水到云端数据库

### 优先级

- **优先级**：P0
- **理由**：星星到期本质上是资产结算问题。只要继续保留“前端本地清理 + 后端读时过滤”的双语义模型，跨设备一致性和数据可审计性就无法真正收口。

---

## 技术方案

### 方案概述

M16B 采用“客户端触发、后端权威执行”的迁移方案。核心原则是：

1. 云端模式下，只有后端可以执行“已到期星星结算”，并在奖励兑换时权威计算保护额度。
2. 客户端只负责在关键页面或启动时触发同步命令，然后刷新云端星星/奖励/消息数据。
3. 后端结算必须具备幂等性，奖励保护计算必须保持纯读取语义，避免多设备、多次进入页面时重复生成流水或重复扣减。
4. 现有后端读时过滤逻辑保留，但角色从“主语义”降为“防御兜底”。

M16B 不直接引入定时任务，因为当前项目尚无稳定的调度基础设施。取而代之，继续复用 M16A 已接受的“客户端触发后端 sync”模式，但将 sync 的业务含义从“提醒 materialize”扩展为“到期权威收口”。这样可以在不引入更大运维面的前提下，把当前最核心的时效一致性问题先解决。

需要补充的是：本里程碑里的“星星到期后端权威结算”和“奖励保护”并不是同等成熟的存储问题。星星结算已经可以直接复用 `star_groups + star_records` 完成权威迁移；而奖励保护当前仍挂在共享奖励实体字段上，天然存在多孩子作用域冲突。因此 M16B 的正确设计应该分两层：

1. **星星到期结算**：本期必须迁移为后端权威。
2. **奖励保护**：本期先把“实际兑换时使用哪个保护结果”迁移为后端按兑换孩子即时计算；共享 `rewards` 表上的保护字段降为展示缓存或兼容字段，不能再作为多孩子家庭下的全局权威来源。

### 技术选型

| 技术点 | 选择方案 | 替代方案 | 选择理由 |
|--------|---------|---------|---------|
| 到期权威入口 | 新增 `POST /api/stars/expiry-authority/sync` | 复用 `GET /api/stars` 或 `expiring-reminders/sync` | 结算属于有副作用命令，单独端点边界更清晰 |
| 权威编排位置 | 新增 `backend/services/starExpiryGovernanceService.js` | 直接塞进 `backend/services/starService.js` | 涉及星星、奖励、提醒三域协作，独立应用服务更清晰，也避免与 `rewardService` 形成循环依赖 |
| 到期结算落账 | 复用 `star_records` + `idempotency_key` | 新增专用结算表 | 现有流水模型已足够表达，增量最小 |
| 到期保护权威 | 后端按 `exchangeUserId` 即时计算有效保护，不再把共享 `rewards` 表上的保护字段视为全局权威 | 后端继续全量重算并直接覆盖共享 `rewards` 字段 | 现有奖励池是家庭共享实体，保护结果天然带有孩子维度，不能被建模成全局共享状态 |
| 触发策略 | 保留客户端触发，但统一 10 秒共享节流 | 继续首页 5 分钟本地清理 | 10 秒短窗口能保障强时效一致性，同时避免重复请求 |
| 读路径过期过滤 | 保留现有过滤逻辑作为防御兜底 | 迁移后立即删除过滤 | 可避免历史脏数据或偶发同步失败时把错误余额直接暴露给用户 |
| 历史脏数据处理 | “可规范化则自动收敛，不可规范化则记录异常并人工修复” | 完全忽略或完全自动删除 | 兼顾安全性与落地性，避免误删无法推断真实到期日的数据 |
| sync 后前端刷新 | 权威 sync 后强制刷新星星和奖励云端快照 | 只刷新星星或沿用现有 pending-local 跳过逻辑 | 若不同时刷新星星和奖励，页面会继续读到旧奖励展示或旧余额 |

### 设计决策

#### 决策1：云端模式下，前端不再直接执行星星到期清理或奖励保护

M16B 后的权责边界：

- 前端本地 `cleanupExpiredStars()`：仅作为本地模式或完全离线模式的兼容路径
- 前端本地 `calculatePendingExpiry() / protectRewardsByExpiry()`：仅作为本地模式兼容路径
- 云端模式：这些方法在启动链路、首页刷新和页面读取中全部改为跳过，改由后端权威 sync 替代

这样可以彻底消除“前端说已经结算、后端只是隐藏了过期余额”的双语义问题。

#### 决策2：新增后端权威 sync 命令，统一做“到期结算 + 结算结果汇总”

新增接口：

- `POST /api/stars/expiry-authority/sync`

输入建议：

```json
{
  "scope": "user | family",
  "targetUserId": "child_xxx",
  "modifyTime": 1711900000000,
  "operationKey": "optional"
}
```

语义：

- `scope=user`
  - 孩子：只能为自己触发
  - 家长：可为当前目标孩子触发
- `scope=family`
  - 仅家长可用
  - 扫描家庭下全部活跃孩子，逐个执行到期结算

返回建议：

```json
{
  "success": true,
  "affectedUserIds": ["child_1"],
  "settledGroupCount": 2,
  "settledPoints": 15,
  "createdRecordCount": 2,
  "invalidGroupCount": 0
}
```

#### 决策3：到期结算以“分组幂等结算”为核心，不以页面触发次数为核心

每个已到期分组只能被正式结算一次。建议幂等键按“用户 + 分组 + 规范化到期日”构造，例如：

- `star_expiry:{userId}:{groupId}:{normalizedExpiryDate}`

结算流程：

1. 查询目标用户全部 `star_groups`
2. 规范化 `expiry_date`
3. 找出“已到期且可结算”的分组
4. 为每个分组创建一条负向 `star_records` 流水
5. 删除对应 `star_groups` 分组
6. 提交事务

这样即便多个设备同时触发，也只会有一个事务真正落账；其余请求会因为幂等键命中而安全返回。

#### 决策4：奖励保护从“共享 reward 字段权威”改为“按兑换孩子即时计算权威”

本轮评审确认，当前奖励池是家庭共享实体，而星星与到期发生在孩子个人维度，因此：

- “孩子 A 的到期保护结果”
- “孩子 B 的到期保护结果”

不应再被直接压缩成一份共享 `rewards.protected_by_expiry / partial_protection` 状态。

因此 M16B 的正确收口方式不是“后端重算后把结果覆盖回共享 reward 字段”，而是：

1. 后端保留统一的保护规则计算器
2. 在奖励兑换时，以 `exchangeUserId` 为输入即时计算该孩子的有效保护额度
3. `exchangeReward()` 以该即时结果决定 `actualCost`
4. 共享 `rewards` 表上的 `protected_by_expiry / partial_protection` 降为展示缓存或兼容字段，不再作为全局权威

这样可以避免：

- 多孩子家庭下孩子 A 的保护结果覆盖孩子 B
- 页面切换孩子视角后看到被污染的共享保护状态
- 奖励兑换时依据错误的全局缓存扣费

本期不改变“保护窗口 48 小时”“高价值奖励优先”这些业务规则，只改变保护的权威计算位置和使用方式。

#### 决策5：读路径过滤保留，但不再作为主语义

迁移后仍保留后端 `_filterActiveGroupRows()` 的读时过滤，其角色变为：

- 防御历史脏数据
- 防御极端情况下 sync 未来得及执行
- 保证读取 API 不把明显错误的过期余额暴露给前端

但文档语义上必须明确：真正的“到期已发生”以结算流水和分组删除为准，而不是以读接口是否过滤为准。

#### 决策6：前端读取链路改为“先权威 sync，再强制刷新星星与奖励，再正式提醒 sync”

云端模式下，建议统一顺序：

1. `starService.syncExpiryAuthorityIfNeeded(...)`
2. `starService.refreshStarsFromCloud(..., { forceCloudAfterAuthority: true })`
3. `rewardService.refreshRewardsFromCloud({ force: true })`
4. `messageService.syncFormalRemindersIfNeeded(...)`
5. 页面读取星星余额、奖励、消息

这样可保证：

- 星星余额读取的是结算后快照
- 奖励展示读取的是最新云端奖励快照，而不是旧本地缓存
- 星星即将过期提醒读取的是结算后、仍有效的数据

入口建议：

- 登录后 bootstrap
- 首页奖励/星星区域刷新
- 奖池页进入和下拉刷新
- 消息页进入和下拉刷新

补充约束：

- `refreshStarsFromCloud()` 不能继续沿用“检测到本地待同步星星流水就跳过云端覆盖”的默认行为，否则权威 sync 后前端仍可能读到旧余额
- M16B 需新增一个仅在“权威 sync 之后”使用的强制云端覆盖分支，例如 `forceCloudAfterAuthority`
- 首页奖励区不能只刷新星星，还必须同步刷新奖励，否则奖励展示与实际可兑换结果仍可能落后于最新星星状态

原首页 5 分钟本地 `cleanupExpiredStars()` 检查应移除；若仍需节流，统一收敛为 10 秒共享节流，而不是首页单独的 5 分钟窗口。

#### 决策7：历史脏数据分为两类处理

第一类：可规范化脏数据，自动纳入结算。

例如：

- `今天到期`
- `明天到期`
- `2026-03-29 到期`

这些数据后端已有规范化逻辑，可直接在 M16B 中沿用。

第二类：不可规范化脏数据，不自动猜测，不自动删。

例如：

- `not-a-date`
- 空串但 `type != permanent`

处理策略：

- 继续在读路径过滤
- 在权威 sync 结果中返回 `invalidGroupCount`
- 记录日志并纳入维护者数据修复清单

M16B 不应假装这类脏数据“已经正确结算”，必须把它暴露为异常，而不是无限兼容。

### DDD 分层设计

**服务层（services/）**：
- [ ] 修改服务：`services/star-service.js`
- [ ] 修改服务：`services/message-service.js`
- [ ] 修改服务：`services/reward-service.js`
- [ ] 修改服务：`utils/app/post-login-bootstrap.js`
- [ ] 修改页面逻辑模块：`pages/index/modules/index-refresh-coordinator.js`
- [ ] 修改页面逻辑模块：`pages/index/modules/index-reward-flow.js`
- [ ] 修改页面：`pages/rewards/rewards.js`
- 说明：前端统一改为“触发后端权威 sync + 强制刷新星星/奖励云端快照”，本地清理/保护只保留给本地模式

**后端服务层（backend/services/）**：
- [ ] 新建服务：`backend/services/starExpiryGovernanceService.js`
- [ ] 修改服务：`backend/services/starService.js`
- [ ] 修改服务：`backend/services/rewardService.js`
- [ ] 修改服务：`backend/services/messageService.js`
- 说明：新的治理服务负责到期结算编排；`starService` 保留底层星星读写/扣减能力；`rewardService` 提供按兑换孩子即时计算保护额度的辅助能力；`messageService` 继续承接 M16A 正式提醒

**后端控制器/路由层（backend/controllers/、backend/routes/）**：
- [ ] 修改接口：`backend/controllers/starController.js`
- [ ] 修改接口：`backend/routes/stars.js`
- 说明：新增 `expiry-authority/sync` 命令入口

**表现层（pages/、components/）**：
- [ ] 修改页面：`pages/index/index.js`
- [ ] 修改页面：`packageMessage/pages/message/message.js`
- [ ] 修改页面：`pages/rewards/rewards.js`
- 说明：页面本身不做结算，只调整读取前的触发顺序

### 架构图

```mermaid
graph LR
    A[登录后 bootstrap / 首页 / 奖池页 / 消息页] --> B[前端 StarService 权威 sync helper]
    B --> C[POST /api/stars/expiry-authority/sync]
    C --> D[starExpiryGovernanceService]
    D --> E[starService 结算到期分组]
    E --> F[(star_groups / star_records)]
    A --> G[refreshStarsFromCloud force after authority]
    G --> H[GET /api/stars + GET /api/stars/records]
    A --> I[rewardService.refreshRewardsFromCloud]
    I --> J[GET /api/rewards]
    K[rewardService.exchangeReward] --> L[resolveEffectiveRewardProtection(exchangeUserId)]
    L --> M[(rewards / star_groups)]
    A --> N[messageService.syncFormalRemindersIfNeeded]
    N --> O[POST /api/stars/expiring-reminders/sync]
    O --> P[(messages)]
```

### 数据模型

M16B 不强制新增数据库字段，优先复用现有模型。建议在设计层固化以下逻辑结构：

```typescript
interface StarExpiryAuthorityCommand {
  scope: 'user' | 'family';
  targetUserId?: string;
  modifyTime: number;
  operationKey?: string;
}

interface StarExpirySettlementMeta {
  kind: 'star_expiry_settlement';
  groupId: string;
  normalizedExpiryDate: string;
  settledAt: number;
}

interface ExpiryAuthorityResult {
  affectedUserIds: string[];
  settledGroupCount: number;
  settledPoints: number;
  createdRecordCount: number;
  invalidGroupCount: number;
}
```

落库约定：

- 到期结算流水：
  - 继续使用 `star_records`
  - `type = 'expense'`
  - `source = 'system'` 或 `source = 'adjustment'`
  - `description = '星星到期结算'`
  - `idempotency_key = star_expiry:{userId}:{groupId}:{normalizedExpiryDate}`
  - `data` 里写入 `groupId / normalizedExpiryDate / settledAt`
- 已到期分组：
  - 从 `star_groups` 删除
- 保护状态：
  - 本期不把 `rewards.protected_by_expiry / partial_protection` 继续定义为“多孩子共享场景下的全局权威”
  - 兑换时的权威保护额度由后端基于 `exchangeUserId` 即时计算
  - 现有奖励字段仅保留为展示缓存或兼容字段，后续若要彻底建模 child 维度保护状态，再拆独立里程碑

### 接口设计

**建议新增/调整服务接口**：

| 方法 | 说明 | 参数 | 返回值 |
|------|------|------|--------|
| `syncExpiryAuthority(options)` | 后端权威结算与结果汇总 | `{ viewerUserId, viewerRole, familyId, scope, targetUserId, modifyTime, operationKey }` | `{ success, affectedUserIds, settledGroupCount, settledPoints, createdRecordCount, invalidGroupCount }` |
| `settleExpiredGroupsWithConnection(connection, userId, options)` | 事务内结算单用户已到期分组 | `{ modifyTime, operationKey }` | `{ settledGroups, settledPoints, createdRecords, invalidGroups }` |
| `resolveEffectiveRewardProtection(connection, rewardId, exchangeUserId, options)` | 兑换时按孩子即时计算保护额度 | `{ modifyTime }` | `{ protectedByExpiry, partialProtection, actualCost }` |
| `syncExpiryAuthorityIfNeeded(options)` | 前端共享触发 helper | `{ scope, userId, familyId, force }` | `{ success, affectedUserIds, settledGroupCount }` |

---

## 代码结构

### 文件变更清单

**预计新增文件**：
- `backend/services/starExpiryGovernanceService.js` - 星星到期结算的后端编排服务
- `backend/test/integration/star-expiry-authority-m16b-real.test.js` - 权威结算链路集成测试

**预计修改文件**：
- `utils/api-config.js` - 新增星星权威结算 sync 端点常量
- `services/star-service.js` - 新增前端权威 sync helper，云端模式下跳过本地到期清理/保护
- `services/message-service.js` - 调整提醒 sync 与星星权威 sync 的触发顺序
- `services/reward-service.js` - 新增奖励强制云端刷新在首页/消息/奖池链路中的统一接入
- `utils/app/post-login-bootstrap.js` - 启动链路改为触发后端权威 sync
- `pages/index/modules/index-refresh-coordinator.js` - 移除首页 5 分钟本地星星清理
- `pages/index/modules/index-reward-flow.js` - 首页奖励区在读取前先做权威 sync
- `packageMessage/pages/message/message.js` - 消息页进入和刷新前先完成权威 sync，再读正式消息
- `pages/rewards/rewards.js` - 奖池页读取前先做权威 sync，再刷新云端星星和奖励
- `backend/services/starService.js` - 下沉事务内结算基础能力与异常分组识别
- `backend/services/rewardService.js` - 将兑换保护改为按 `exchangeUserId` 即时计算，不再依赖共享奖励字段作为全局权威
- `backend/controllers/starController.js` - 新增 `expiry-authority/sync` 控制器入口
- `backend/routes/stars.js` - 注册新端点
- `test/app/post-login-bootstrap.test.js` - 启动链路从本地保护迁移为后端权威 sync
- `test/pages/index.refresh-coordinator.test.js` - 首页从本地清理迁移为权威 sync

### 核心代码结构

```javascript
// 伪代码：后端权威结算编排
async function syncExpiryAuthority(options) {
  const userIds = await resolveTargetUsers(options);
  const summary = createEmptySummary();

  for (const userId of userIds) {
    await db.transaction(async (connection) => {
      const settlement = await starService.settleExpiredGroupsWithConnection(
        connection,
        userId,
        options
      );

      mergeSummary(summary, userId, settlement);
    });
  }

  return summary;
}
```

### 关键函数

**函数1**：`settleExpiredGroupsWithConnection(connection, userId, options)`
- **输入**：数据库连接、用户 ID、时间参数
- **输出**：`{ settledGroups, settledPoints, createdRecords, invalidGroups }`
- **职责**：事务内完成单用户的已到期分组扫描、幂等流水创建和分组删除
- **依赖**：`star_groups`、`star_records`

**函数2**：`resolveEffectiveRewardProtection(connection, rewardId, exchangeUserId, options)`
- **输入**：数据库连接、奖励 ID、兑换孩子 ID、时间参数
- **输出**：`{ protectedByExpiry, partialProtection, actualCost }`
- **职责**：在奖励兑换时按孩子即时计算有效保护额度
- **依赖**：`rewards`、`star_groups`

**函数3**：`syncExpiryAuthorityIfNeeded(options)`
- **输入**：前端页面上下文中的 scope / userId / force
- **输出**：权威 sync 结果
- **职责**：统一节流、in-flight 复用、失败降级，并在权威 sync 后触发强制云端刷新契约
- **依赖**：`HttpClient.post(API_CONFIG.ENDPOINTS.STAR_EXPIRY_AUTHORITY_SYNC)`

---

## 实施步骤

### 第1步：后端权威结算编排服务落地（预计2天）

- [ ] **任务**：新增后端权威 sync 入口和编排服务
- [ ] **验证**：接口能按 `scope=user/family` 返回受影响成员和结算汇总
- [ ] **依赖**：无

**实施要点**：
1. 新增 `POST /api/stars/expiry-authority/sync`
2. 新增 `backend/services/starExpiryGovernanceService.js`
3. 明确家庭/个人权限解析规则
4. 保证每个用户的到期结算在独立事务内完成

### 第2步：事务内到期结算与幂等流水（预计2天）

- [ ] **任务**：在后端补齐单用户到期分组结算能力
- [ ] **验证**：重复调用不会重复生成到期流水或重复扣减分组
- [ ] **依赖**：第1步

**实施要点**：
1. 规范化 `expiry_date`
2. 对可结算分组按分组维度生成幂等键
3. 插入 `star_records` 负向流水
4. 删除对应 `star_groups`
5. 识别并统计无法规范化的异常分组

### 第3步：奖励保护权威迁移（预计1.5天）

- [ ] **任务**：将奖励过期保护迁移为“兑换时按孩子即时计算”
- [ ] **验证**：多孩子家庭下，不同孩子兑换同一奖励时按各自到期保护结果计算实际扣费
- [ ] **依赖**：第1-2步

**实施要点**：
1. 不再把共享 `rewards` 表字段作为全局权威
2. 复用当前 48 小时保护窗口
3. 保持高价值奖励优先的既有分配策略
4. 在 `exchangeReward()` 里按 `exchangeUserId` 即时计算 `actualCost`
5. 现有奖励字段只作为展示缓存或兼容字段处理

### 第4步：前端触发链路迁移（预计1.5天）

- [ ] **任务**：将启动链路、首页、奖池页、消息页的前端本地清理改为后端权威 sync
- [ ] **验证**：云端模式下不再执行本地 `cleanupExpiredStars()` / `protectRewardsByExpiry()`
- [ ] **依赖**：第1-3步

**实施要点**：
1. 登录后 bootstrap 先触发权威 sync，再刷新云端数据
2. 首页移除 5 分钟本地星星清理
3. 奖池页读取前先权威 sync，再强制刷新星星和奖励
4. 首页奖励区读取前也必须刷新奖励，不能只刷新星星
5. 提醒 sync 继续保留，但顺序调整到结算后

### 第5步：测试收口与异常数据策略（预计1-2天）

- [ ] **任务**：补齐自动化测试，并给出异常分组/历史数据的验收和维护方案
- [ ] **验证**：新旧测试口径完成迁移，权威边界明确
- [ ] **依赖**：第1-4步

**实施要点**：
1. 更新前端测试，不再把本地清理/保护视为云端模式正常行为
2. 新增后端权威结算集成测试
3. 明确异常 `expiry_date` 的日志与人工修复口径
4. 手工验收覆盖跨设备、多次进入页面、家庭多孩子三类场景

---

## 测试方案

### 单元测试

| 测试项 | 测试方法 | 预期结果 |
|--------|---------|---------|
| 单用户到期结算 | 预置 2 个已到期分组后执行 sync | 生成 2 条幂等流水，分组被删除 |
| 重复 sync 幂等 | 连续两次对同一用户执行 sync | 第二次不重复生成流水，不重复扣减 |
| 非法 `expiry_date` | 预置不可规范化分组 | 不自动结算，返回 `invalidGroupCount` |
| 奖励保护按孩子即时计算 | 同一家庭两个孩子兑换同一奖励 | 实际扣费基于各自星星与到期窗口计算，不互相污染 |
| 家庭范围 sync | 家长对 `scope=family` 调用 | 仅处理家庭下活跃孩子 |
| 孩子权限边界 | 孩子尝试触发 `scope=family` | 返回权限错误 |
| 前端云端模式启动 | 执行 bootstrap | 不再直接调用本地 `protectRewardsByExpiry / cleanupExpiredStars` |
| 权威 sync 后强制刷新 | sync 后调用读取链路 | 不受 pending local star records 阻挡，能读到云端结算后快照 |
| 首页读取顺序 | 首页刷新奖励区域 | 先权威 sync，再刷新星星和奖励，再消息 sync |

### 集成测试

- [ ] 创建未来到期和已到期混合分组，执行 `expiry-authority/sync` 后仅已到期分组被结算
- [ ] 已到期分组被结算后，`GET /api/stars` 不再返回该分组，`GET /api/stars/records` 可见到期流水
- [ ] 家庭有两个孩子时，家长 `scope=family` 会分别处理两个孩子的到期结算，后续兑换时再按各自孩子即时计算保护额度
- [ ] 同一分组被多个并发 sync 命中时，只落一条正式到期流水
- [ ] 权威 sync 后再执行 M16A 的 `expiring-reminders/sync`，不会为已到期分组生成“即将过期”提醒
- [ ] 奖励兑换时，相同奖励对孩子 A / 孩子 B 的实际扣费可不同，但都符合各自即时保护结果
- [ ] 权威 sync 后首页与奖池页都必须刷新奖励快照，否则测试判失败

### 手动测试

1. **单用户时效场景**：
   - [ ] 构造今天已到期星星，进入首页或奖池页后余额立刻变为结算后值
   - [ ] 星星流水页能看到“星星到期结算”记录
   - [ ] 已到期的星星不再生成“即将过期”提醒

2. **保护场景**：
   - [ ] 构造 48 小时内将到期星星和多个奖励，孩子 A 与孩子 B 兑换同一奖励时，实际扣费分别正确
   - [ ] 修改奖励或兑换奖励后再次进入，首页和奖池页读取到的奖励快照一致

3. **跨设备/跨视角场景**：
   - [ ] 设备 A 打开首页触发结算后，设备 B 再进入奖池页应直接看到一致余额
   - [ ] 家长家庭视角进入消息/首页后，孩子相关的星星到期提醒和余额一致
   - [ ] 孩子本人进入时，不会看到家长家庭范围的数据污染

4. **异常数据场景**：
   - [ ] 预置非法 `expiry_date` 后，前端不展示错误余额
   - [ ] 后端日志或返回结果中能看到异常计数

### 测试覆盖率目标

- 新增后端权威结算核心分支覆盖率目标：90%+
- 新增前端触发链路迁移相关分支覆盖率目标：85%+

---

## 风险评估

### 技术风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| 结算链路与兑换保护计算跨服务耦合导致循环依赖 | 高 | 中 | 使用独立 `starExpiryGovernanceService` 统一编排，避免 `starService` 直接依赖 `rewardService` |
| 重复触发导致重复流水 | 高 | 中 | 以分组维度的 `idempotency_key` 保证事务幂等 |
| 前端本地缓存与云端快照冲突 | 高 | 中 | 统一“先 sync 再强制刷新星星和奖励”，并为星星刷新增加权威 sync 后的强制覆盖分支 |
| 历史脏数据无法自动修复 | 中 | 中 | 明确分层处理：可规范化自动收敛，不可规范化上报异常并人工修复 |
| 多孩子共享奖励池导致保护状态串扰 | 高 | 高 | 不再把共享 `rewards` 字段当作全局权威，兑换时按孩子即时计算保护额度 |

### 业务风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| 用户误以为“星星被重复扣除” | 高 | 低 | 到期流水必须可见且幂等，文案明确为到期结算 |
| 保护规则迁移后用户体感变化 | 中 | 中 | M16B 不修改保护规则，只迁移权威位置；重点做真机回归 |
| 家长家庭范围触发造成孩子数据错位 | 高 | 低 | 家庭范围只处理活跃孩子，且每个孩子独立事务 |

### 修复风险结论

- **低风险项**：新增后端命令入口、前端触发顺序调整
- **中风险项**：奖励保护权威迁移与旧共享缓存字段兼容
- **高风险项**：历史脏数据、并发幂等、跨设备缓存一致性

M16B 可以做，但不属于“低改动小修”。它是一次明确的权威迁移，实施前必须先锁定设计和测试矩阵。

---

## 替代方案

### 方案A：继续保留当前混合模型，只补局部 Bug

**未选择原因**：

- 不能解决“到底谁在真正结算到期星星”的根本问题
- 跨设备一致性仍依赖前端是否恰好执行过本地清理
- 真实环境验证会一直被“缓存/时序/本地脏数据”噪声干扰

### 方案B：直接引入后端定时任务，完全脱离客户端触发

**未选择原因**：

- 当前项目尚无成熟调度基础设施
- 会把 M16B 从“权威迁移”扩大成“运维体系建设”
- 风险和工期明显上升，不利于当前里程碑收口

### 方案C：让 `GET /api/stars` 在读取时顺便做结算

**未选择原因**：

- 读接口混入副作用会让缓存、幂等和审计都变得模糊
- 与 M16A 已经形成的 “sync 命令负责 materialize，read 接口负责读取” 边界冲突

---

## 审核要点自检

- [x] 是否忠实反映当前代码事实：已明确前端启动清理、首页 5 分钟检查、后端读时过滤的现状
- [x] 是否明确 M16B 的真实性质：这是权威迁移，不是简单提醒补丁
- [x] 是否给出迁移后的权责边界：云端模式下前端不再直接结算或保护，奖励保护改为兑换时按孩子即时计算
- [x] 是否给出可落地的后端命令和事务模型：已定义独立 `expiry-authority/sync`
- [x] 是否覆盖兼容与异常数据：已区分可规范化与不可规范化脏数据，并补充 sync 后强制刷新契约
- [x] 是否具备可执行测试口径：已补单测、集测和手工验收重点场景

---

## 审核记录

| 日期 | 审核人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-04-01 | GPT5 Codex | 初稿 | 基于当前代码和测试现状审计形成，待维护者审核 |
| 2026-04-01 | GPT5 Codex | 评审修订 | 根据代码复核补充多孩子保护作用域、sync 后强制刷新和奖励 refresh 契约 |
| 2026-04-01 | GPT5 Codex | 一致性修订 | 清理“保护重算/共享字段权威”残留口径，统一为“结算权威 + 兑换时即时保护计算” |
| 2026-04-01 | 项目维护者 | 审核通过 | 同意按该设计实施并进入交付收口 |
| 2026-04-01 | GPT5 Codex | 已完成 | 对应代码、测试、CHANGELOG 与 REST 契约已同步落地 |

---

## 附录

### A. 关键代码事实引用

- `services/star-service.js:54-68`
- `services/star-service.js:1645-1777`
- `services/star-service.js:1789-1848`
- `utils/app/post-login-bootstrap.js:56-77`
- `pages/index/modules/index-refresh-coordinator.js:68-115`
- `backend/services/starService.js:28-38`
- `backend/services/starService.js:561-693`
- `backend/routes/stars.js:14-19`
- `backend/controllers/starController.js:118-155`

### B. 前置里程碑

- `docs/design/milestone-15a-message-semantics-audit.md`
- `docs/design/milestone-15a-proactive-behavior-audit.md`
- `docs/design/milestone-15b-real-env-verification.md`
- `docs/design/milestone-16a-proactive-reminder-validity-governance.md`

### C. 当前不在本期解决的问题

- 后端定时调度器
- 星星有效期规则本身的重定义
- 奖励保护业务规则本身的重定义
- 历史本地离线流水的全量回填
