# M15A+ 主动行为审计结论与修复设计

> **设计状态**：✅ 已完成
> **创建日期**：2026-03-30
> **设计者**：Claude Code
> **审核者**：项目维护者、Codex（交叉审核）

---

## 📋 目录

- [审计背景](#审计背景)
- [审计发现与分级](#审计发现与分级)
- [本期实施范围](#本期实施范围)
- [技术方案](#技术方案)
- [代码结构](#代码结构)
- [实施步骤](#实施步骤)
- [测试方案](#测试方案)
- [风险评估](#风险评估)
- [候选项与后续建议](#候选项与后续建议)

---

## 审计背景

对系统全部主动行为（非用户点击发起的自动行为）进行全面审计，覆盖启动链路、页面生命周期、事件驱动、仓储层后台清理等 6 类 30+ 主动行为。

**关键上下文**：当前系统已建立云端正式链路。惩罚扫描在云端模式下走后端 `POST /api/tasks/penalties/sync`（`backend/services/taskService.js:628`），后端 SQL 条件为 `penalty_applied = 0`（`backend/services/taskService.js:889`）。前端本地 `task-penalty.js` 仅在本地降级模式下使用。审计发现的问题需区分"云端正式链路"和"本地降级路径"来评估严重度。

---

## 审计发现与分级

| 编号 | 问题 | 影响路径 | 严重度 | 本期处理 |
|------|------|---------|--------|---------|
| P5 | `StarService.initialize()` 未复用 `cleanupExpiredStars()` 完整链路，缺少事件通知 | 所有模式 | P1 | ✅ 纳入本期 |
| P8 | 奖励云同步缺少共享节流，首页 / rewards / reward-manage 多入口可能重复拉取同一份奖励数据 | 云端模式 | P2 | ✅ 纳入本期 |
| P7 | `app.js` logs 数组无上限控制 | 所有模式 | P3 | ✅ 纳入本期 |
| P2/P3 | 本地降级模式下 `!task.penaltyApplied` 对 undefined 值的误判 | 仅本地降级 | P4 | ❌ 降为候选 |
| P4 | 任务提醒触发频次 | 需进一步分析 | 待定 | ❌ 问题定义需重写 |
| P6 | 云同步无真正合并策略 | 云端模式 | P3 | ❌ 留待后续 |
| O1 | 主题监听硬编码 | 所有模式 | 低 | ❌ 留待后续 |
| O2/O3 | 未使用方法 | 不影响功能 | 低 | ❌ 留待后续 |
| O4 | 事件处理器无去重 | 所有模式 | 低 | ❌ 留待后续 |

---

## 本期实施范围

**实施项（3 项）**：

- P5：`StarService.initialize()` 改为调用 `cleanupExpiredStars()`，但保持当前“全量清理”语义不变
- P8：奖励云同步改为服务层共享 5 分钟节流，覆盖首页 / rewards / reward-manage 三个入口
- P7：logs 数组添加 50 条上限

**不包含**：

- ❌ P2/P3：本地降级模式的 penaltyApplied 兼容性（降为候选项，见附录）
- ❌ P4：任务提醒触发频次（问题定义需重写，见附录）
- ❌ P6：云同步合并策略（需独立设计）
- ❌ 首页惩罚/过期事件监听与 showToast（未经产品判断，降为候选项）

---

## 技术方案

### P5：StarService.initialize() 复用 cleanupExpiredStars()

**当前问题**：`initialize()`（`star-service.js:51-84`）直接调用底层 `starGroupRepository.cleanupExpiredGroups()` + 手动创建记录 + `cleanupEmptyGroups()`，但缺少 `STARS_EXPIRED` 事件通知。而 `cleanupExpiredStars()`（`star-service.js:1668-1727`）已实现完整链路：过期分组清理 → 记录创建 → 事件 emit → 空组清理。

**方案**：将 `initialize()` 中的重复实现改为调用 `cleanupExpiredStars()`。

### P8：奖励云同步共享节流

**当前问题**：`pages/index/modules/index-lifecycle.js:52-56`、`rewards.js:144-160` 和 `reward-manage.js:95-102` 都会在页面显示时调用 `refreshRewardsFromCloud()`。当前 `RewardService.refreshRewardsFromCloud()`（`services/reward-service.js:737-742`）无时间窗口节流，因此用户在首页、奖励页、奖励管理页之间切换时，可能在短时间内重复拉取同一份奖励列表。

**方案**：将 5 分钟节流下沉到 `RewardService.refreshRewardsFromCloud(options = {})`，由服务层统一做共享时间窗口控制，并保留 `force` 参数供真正需要强制刷新的场景绕过节流。页面层继续直接调用服务，不再各自维护 storage key。

### P7：logs 数组上限

**当前问题**：`app.js:49-51` logs 数组每次启动 unshift 时间戳，无上限控制。

**方案**：添加 `.slice(0, 50)` 限制。

---

## 代码结构

### 文件变更清单

**修改文件**：
- `services/star-service.js` — initialize() 改为调用 cleanupExpiredStars()
- `services/reward-service.js` — 为 refreshRewardsFromCloud() 增加共享节流、in-flight 复用和 force 绕过
- `app.js` — logs 数组添加上限

### 核心代码设计

#### 1. star-service.js initialize() 改用 cleanupExpiredStars()

```javascript
// 修改前（star-service.js:51-84）：
async initialize() {
  const expiredGroups = await this.starGroupRepository.cleanupExpiredGroups();
  if (expiredGroups.length > 0) {
    for (const group of expiredGroups) {
      if (group.stars > 0) {
        await this.starRecordRepository.createExpiredRecord(group.stars, ...);
      }
    }
  }
  await this.starGroupRepository.cleanupEmptyGroups();
  return true;
}

// 修改后：
async initialize() {
  // 保持当前 initialize 的全量清理语义，不缩小到登录用户
  const result = await this.cleanupExpiredStars();
  if (result.success && result.expiredCount > 0) {
    logger.info('StarService', `初始化清理过期星星完成, 过期${result.expiredCount}组, 共${result.totalPoints}颗`);
  }
  return true;
}
```

#### 2. reward-service.js 共享节流

```javascript
// RewardService 内部新增共享节流
async refreshRewardsFromCloud(options = {}) {
  if (!this.enableCloudStorage) {
    return { success: false, message: '云端模式未启用' };
  }

  const { force = false } = options;
  const now = Date.now();
  const lastSyncTime = this._lastCloudRewardsSyncTime || 0;

  if (!force && now - lastSyncTime < 5 * 60 * 1000) {
    return { success: true, skipped: true, reason: 'throttled' };
  }

  if (this._cloudRewardsRefreshInFlight) {
    return this._cloudRewardsRefreshInFlight;
  }

  const request = this._fetchRewardsFromCloud()
    .then((result) => {
      this._lastCloudRewardsSyncTime = Date.now();
      return result;
    })
    .finally(() => {
      this._cloudRewardsRefreshInFlight = null;
    });

  this._cloudRewardsRefreshInFlight = request;
  return request;
}
```

#### 3. app.js logs 上限

```javascript
const logs = wx.getStorageSync('logs') || []
logs.unshift(Date.now())
wx.setStorageSync('logs', logs.slice(0, 50))  // 限制最多 50 条
```

---

## 实施步骤

### 第1步：StarService.initialize() 复用完整链路（P5）

- [ ] **任务**：将 `initialize()` 中直接调用底层仓库改为调用 `cleanupExpiredStars()`
- [ ] **验证**：
  - mock 过期星星组，调用 `initialize()`，确认 `STARS_EXPIRED` 事件被 emit
  - mock 无过期星星组，确认不触发事件
- [ ] **依赖**：无

**实施要点**：
1. `cleanupExpiredStars()` 已实现完整链路（`star-service.js:1668-1727`），包含事件通知
2. 删除 `initialize()` 中重复的底层调用代码
3. 保持 `initialize()` 当前的全量清理语义，不传 `userId`

---

### 第2步：奖励云同步共享节流（P8）

- [ ] **任务**：在 `RewardService.refreshRewardsFromCloud()` 增加 5 分钟共享节流和 in-flight 复用
- [ ] **验证**：5 分钟内从首页、rewards、reward-manage 任意切换，不触发重复奖励拉取
- [ ] **依赖**：无

**实施要点**：
1. 节流逻辑下沉到服务层，页面层不再单独维护时间戳
2. 首次进入（无时间戳）允许立即同步
3. 同步失败不影响页面正常展示
4. 保留 `force` 参数供后续手动下拉刷新或管理操作后强刷使用

---

### 第3步：logs 数组上限（P7）

- [ ] **任务**：为 `app.js` logs 数组添加 50 条上限
- [ ] **验证**：插入 60 条 logs 后存储仅保留最新 50 条
- [ ] **依赖**：无

---

### 第4步：运行测试并验证

- [ ] **任务**：运行全量测试，确认所有修改不破坏现有功能
- [ ] **验证**：`npm test` 全部通过
- [ ] **依赖**：第1-3步全部完成

---

## 测试方案

### 单元测试

| 测试项 | 测试方法 | 预期结果 |
|--------|---------|---------|
| P5: initialize 有过期时触发事件 | mock 多用户过期星星组，调用 `initialize()` | 内部调用 `cleanupExpiredStars()` 且不传 userId，`STARS_EXPIRED` 事件被 emit |
| P5: initialize 无过期时不触发事件 | mock 无过期星星组 | `cleanupExpiredStars()` 返回 expiredCount=0，不触发事件 |
| P8: 奖励云同步共享节流 | 5 分钟内多次调用 `refreshRewardsFromCloud()` | 首次请求真实拉取，后续返回 `skipped: true` 或复用 in-flight |
| P8: 奖励云同步强制绕过节流 | 调用 `refreshRewardsFromCloud({ force: true })` | 即使在节流窗口内也触发拉取 |
| P7: logs 数组上限 | 插入 60 条 logs | 存储中仅保留最新 50 条 |

### 集成测试

- [ ] 场景1：星星过期 → 启动清理 → `initialize()` 调用 `cleanupExpiredStars()` → `STARS_EXPIRED` 事件触发
- [ ] 场景2：首页 → rewards → reward-manage 连续切换 → 仅首次触发奖励云同步
- [ ] 场景3：奖励管理成功后显式 `force` 刷新 → 可绕过节流拉取最新奖励数据

### 回归测试

- [ ] `npm test` 全量通过（67 suite、1598+ tests）
- [ ] 首页正常加载任务、星星、奖励数据
- [ ] 奖励页正常同步和展示
- [ ] 消息中心正常展示和排序

### 测试覆盖率目标

- 最低要求：85%（维持现有水平）

---

## 风险评估

### 技术风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| initialize 改调 cleanupExpiredStars 后行为差异 | 中 | 低 | 明确保持“不传 userId”的全量清理语义，并补多用户测试 |
| 服务层节流导致需要即时刷新的场景被误跳过 | 中 | 低 | 设计 `force` 参数，供后续显式强刷场景使用 |
| in-flight 复用造成异常态锁死 | 低 | 低 | 在 `finally` 中清理进行中请求句柄 |

---

## 候选项与后续建议

以下问题经审计发现，但不纳入本期实施。记录于此供后续决策参考。

### 候选 1：本地降级模式 penaltyApplied 兼容性（原 P2/P3）

**现状**：云端正式惩罚链路走后端 `POST /api/tasks/penalties/sync`，后端 SQL 条件 `penalty_applied = 0`（`backend/services/taskService.js:889`），不受此问题影响。前端本地 `task-penalty.js:44` 使用 `!task.penaltyApplied`，仅在本地降级模式下生效。

**潜在风险**：如果云端不可用且存在老数据（`penaltyApplied === undefined`），本地降级路径会将其误判为待惩罚任务。

**候选方案**：将 `!task.penaltyApplied` 改为 `task.penaltyApplied === false`。风险低，但需确认本地降级场景的覆盖测试充分。

**建议**：作为后续工程收口项处理，不作为当前 P1 级问题。

### 候选 2：任务提醒触发频次（原 P4）

**现状梳理**（经复核确认）：
- `loadAllPageData()` 加载任务后会调用 `checkUpcomingTasks()`（`index-refresh-coordinator.js:142`）
- 视图刷新 `refreshTaskDataForCurrentView()` 也会调用（`index-refresh-coordinator.js:161`）
- 云端模式下消息服务有独立的 5 分钟节流同步（`message-service.js:364`）

**结论**：当前任务提醒并非"仅运行一次"。如需优化，应先明确问题是"首页 upcoming 卡片刷新不及时"还是"云端 upcoming 消息同步覆盖不全"，再设计具体方案。

**不建议**在 `checkExpiredTasksAndStars()` 中再加一层 `checkUpcomingTasks()` 调用——这会造成与 `loadAllPageData` 的重复。

### 候选 3：首页惩罚/过期事件 UI 反馈

**现状**：首页 `registerEventListeners`（`index.js:176-201`）仅监听 6 个事件，不含 `TASK_PENALTY_APPLIED` 和 `STARS_EXPIRED`。

**候选方案**：新增事件监听 + `wx.showToast` 提示。但此方案涉及产品交互决策（惩罚是否需要即时提示、提示文案风格），不应在审计修复里程碑中直接实施。

**建议**：作为独立产品需求评估后实施。

### 后续建议记录

| 候选 | 性质 | 建议时机 |
|------|------|---------|
| 本地降级 penaltyApplied 兼容性 | 工程收口 | 任意时间，低风险 |
| 任务提醒触发频次 | 需先明确问题 | 需产品/用户反馈 |
| 首页惩罚/过期 UI 反馈 | 产品决策 | 需产品评估 |
| 云同步合并策略（P6） | 独立设计 | M16+ |
| 主题监听 / 未使用方法 / 事件去重（O1-O4） | 代码清理 | 任意时间 |

---

## 审核记录

### 审核要点

- [ ] **事实准确**：审计发现基于代码实际验证
- [ ] **分级合理**：区分云端正式链路和本地降级路径
- [ ] **实施范围清晰**：本期仅 3 项，不包含未验证的方案
- [ ] **候选项记录完整**：未实施项有明确原因和后续建议

### 审核意见

**第一轮自审**（2026-03-30）：
- 🔶 需修正 → 已修正 4 项（P5 方案修正、onUnload 清理、节流 key 区分、流程图歧义）

**第二轮 Codex 交叉审核**（2026-03-30）：
- 12 条反馈全部采纳，主要修正：
  - P1 硬编码仅存在于未提交工作区，非已提交代码缺陷 → 删除
  - P2/P3 云端正式链路走后端，非前端本地主路径 → 降为候选
  - P4 任务提醒并非仅运行一次 → 问题定义需重写
  - 首页 showToast 未经产品判断 → 降为候选
  - 文档状态与 [x] 标记矛盾 → 修正为待办
  - 标题重新定义 → 审计结论与修复设计
  - 测试项与实际实施项对齐 → 仅保留 P5/P7/P8 测试

---

## 附录

### 审计发现完整汇总

| 编号 | 问题 | 影响路径 | 严重度 | 本期处理 |
|------|------|---------|--------|---------|
| P1 | app.js 硬编码 API 配置（仅未提交工作区） | 不影响已提交代码 | — | ❌ 删除（非代码缺陷） |
| P2 | 本地降级模式静默惩罚 | 仅本地降级 | P4 | ❌ 降为候选 |
| P3 | fixLegacy 与本地 checkTasksStatus 时序 | 仅本地降级 | P4 | ❌ 降为候选 |
| P4 | 任务提醒触发频次 | 需进一步分析 | 待定 | ❌ 问题定义需重写 |
| P5 | initialize() 未复用完整链路 | 所有模式 | P1 | ✅ 纳入本期 |
| P6 | 云同步无合并策略 | 云端模式 | P3 | ❌ 留待后续 |
| P7 | logs 数组无上限 | 所有模式 | P3 | ✅ 纳入本期 |
| P8 | 奖励云同步缺少共享节流 | 云端模式 | P2 | ✅ 纳入本期 |
| O1 | 主题监听硬编码 | 不影响业务 | 低 | ❌ 留待后续 |
| O2/O3 | 未使用方法 | 不影响功能 | 低 | ❌ 留待后续 |
| O4 | 事件处理器无去重 | 所有模式 | 低 | ❌ 留待后续 |

### 参考资料

- [M15A 设计文档](./milestone-15a-message-semantics-audit.md)
- [DDD 架构文档](../architecture/architecture.md)
- [编码规范](../development/coding_standards.md)

---

**最后更新**：2026-03-30
