# 里程碑-06：家庭账户 + 数据隔离 详细设计文档

> **设计状态**：🔴 待审核
> **创建日期**：2026-03-12
> **最后更新**：2026-03-12（v40：采纳 GLM 评审意见——1. 补充家庭视角完成/重置禁用的 UX 风险和用户引导说明；2. 新增数据修复承诺区块强调优先级；3. 明确 openid 唯一性校验的具体代码位置；4. 补充 permission-utils 修改前后代码对比；反驳：JWT 刷新/错误码/i18n 已覆盖或超出项目范围）
> **设计者**：Claude Code
> **审核者**：项目维护者
> **预计工期**：2周
> **依赖**：里程碑-05（✅ 已完成）

---

## 📋 目录

- [需求分析](#需求分析)
- [核心架构决策](#核心架构决策)
- [两种使用场景](#两种使用场景)
- [技术方案](#技术方案)
- [数据库设计](#数据库设计)
- [API设计](#api设计)
- [代码结构](#代码结构)
- [实施步骤](#实施步骤)
- [测试方案](#测试方案)
- [风险评估](#风险评估)
- [替代方案](#替代方案)

---

## 需求分析

### 功能描述

本里程碑引入"家庭"概念，将多个家长和多个孩子关联到同一家庭单元，实现数据隔离和家庭协作：

1. 多个家长（爸爸、妈妈、爷爷、奶奶等）和多个孩子属于同一家庭
2. 家长可以切换到孩子视角查看/管理孩子的任务
3. 孩子只能管理自己的任务
4. 不同家庭之间数据完全隔离

### 业务价值

- ✅ **用户价值**：支持真实家庭结构，家长监督孩子任务，多设备数据共享
- ✅ **技术价值**：建立数据隔离基础，为后续星星积分、奖励等功能的多用户场景奠定基础
- ✅ **业务价值**：完成云端迁移项目最核心的业务目标，是里程碑07-10的必要前置

### 功能范围

**包含**：
- ✅ 后端：`families` 表 + `users` 表扩展字段
- ✅ 后端：创建家庭、加入家庭（独立设备）、创建虚拟成员（共享设备）
- ✅ 后端：家庭成员列表、软删除成员、修改昵称
- ✅ 后端：任务查询支持 `targetUserId`（家长代理查看孩子数据）
- ✅ 前端：家庭设置页面（新增，在 `packageManage`）
- ✅ 前端：`user-switcher` 适配家庭成员（区分虚拟/真实，改造删除逻辑）
- ✅ 前端：`UserService` 新增家庭方法；`getAllUsers` 同步读 `userCache`（由 `loadFamilyMembers` 异步预加载）
- ✅ 前端：`TaskService` 任务读取时携带 `currentUser.userId`，支持家长切换到孩子视角后读孩子任务
- ✅ 前端：`HttpClient` 新增 PATCH 方法
- ✅ 前端：`TaskService` 任务创建时在切换视角下携带 `targetUserId`（写入链路闭环）
- ✅ 前端：`user-switcher` 新增 PIN 码拦截（孩子→家长切换需验证）；`family-settings` 新增设置/修改 PIN 入口

**不包含**（明确边界）：
- ❌ 消息/奖励/星星服务的多孩子兼容改造——记录在"多孩子兼容范围"章节，后续里程碑处理
  - **M6 非首页页面策略（家庭视角下）**：以下页面内部服务调用均无用户作用域，M6 统一策略为**家庭视角（`currentUser !== loginUser`）下禁止进入**，避免显示聚合/错误数据：
    - `rewards`（奖励页）：`rewards.js:264/274/340` 无 userId 过滤
    - `star-records`（星星记录页）：内部读取无 userId 作用域
    - `message`（消息页）：路由硬编码 parent/child 对
  - **实施**：在 `index.js` 对应导航入口或 `permission-utils.js` 加判断，`isReadonlyView` 为 `true` 时禁用以下所有入口（按钮置灰或不显示）；`loginUser` 自己的视角下正常访问；完整多用户支持留后续版本
  - **M6 家庭视角下需禁用的入口完整清单**：
    - 奖励页（`rewards.js:264/274/340` 无 userId 作用域）
    - 星星记录页（内部读取无 userId 作用域）
    - 消息页（路由硬编码 parent/child 对，`index.js:700` 消息预览也持续加载）
    - **分析页**（`analytics-service.js:41/520` 读全量任务，`index.js:1637` 是入口）
    - **搜索功能**（`index.js:1706` 调用 `getAllTasks()` 无用户过滤）——搜索结果列表中的 `index-task-item` 已加 `readonly` 防止操作，但搜索结果本身仍会混入所有用户任务；M6 策略：家庭视角下禁用搜索入口，或搜索时在 `getAllTasks()` 后按 `currentUserId` 过滤（后者改动更小，推荐）
  - **M6 首页星星/奖励卡片策略**：切换到孩子视角时，星星/奖励卡片**展示 loginUser 自己的数据**（不跟随 currentUser 切换）。⚠️ **不能依赖"不传 userId 自然展示 loginUser 数据"**——在 `userId=null` 时相关服务读取的是**所有用户汇总**，不是 loginUser 单人数据。需改造以下调用链路以支持 `userId` 参数，均传入 `loginUserId`：
    - `getTotalStars(loginUserId)`（`star-service.js:100`）
    - `getAvailableRewards(true, false, loginUserId)`（`reward-service.js:436`，实际签名为 `getAvailableRewards(includeClaimed, includeExamples, userId)`）
    - ⚠️ **`getLastExchangeTime()` 不得直接新增 `userId` 参数**：`index.js:1085` 现有调用传入 `taskId`，由于当前方法不收参所以"碰巧无害"；一旦添加 `userId` 参数，`taskId` 会被误当 `userId` 使用，导致任务锁定判断失真、已兑换奖励后的"不可取消完成"保护被绕开。**正确方案：新增独立方法 `getLastExchangeTimeByUser(userId)`**，只供首页展示使用，原 `getLastExchangeTime(taskId)` 签名和调用点保持不变
    - `calculateNextAvailableReward(userPoints, loginUserId)`（`reward-service.js:871`）——内部调用 `getAvailableRewards()` 时需透传 `userId`；`index.js:1887` 调用时传入 `loginUserId`
- ❌ 家庭成员退出/解散——后续版本
- ❌ 家庭内跨用户任务分配——后续版本
- ❌ **编辑任务/删除任务的家庭场景适配**：`updateTask`/`deleteTask` 当前为纯本地操作，M6 不覆盖这两条的云端同步和家庭鉴权设计；M6 家庭场景下管理孩子任务的范围限定为：**查看 + 创建**（完成/重置见下条）
- ❌ **家庭视角（`currentUser !== loginUser`）下的完成/重置**：切换到孩子视角后，**完成/重置功能在 UI 层禁用**（按钮置灰或隐藏）——因为完成/重置只写本地而读取走云端优先，下次 `loadTaskData()` 会立即覆盖操作结果，在同设备切换日期/返回页面后就会自我回滚，无法提供稳定的交互承诺；`loginUser` 自己的任务（不切换视角）完成/重置正常工作；家庭视角下的完成/重置将在里程碑07补齐云端 PATCH 接口后启用
  - **UI 层实施**：真正承载勾选交互的是 `index-task-item` 组件（`index-task-item.wxml:18`、`index-task-item.js:111/145`），直接在 `index.wxml` 隐藏按钮不足以拦截组件内部的 tap 事件。正确方案：
    1. `index-task-item.js` `properties` 中新增 `readonly: { type: Boolean, value: false }` 属性
    2. `index-task-item.js` 的 `onCheckboxTap`（`:145`）方法开头加守卫：`if (this.data.readonly) return;`
    3. `index-task-item.wxml` 对勾选按钮加 `wx:if="{{!readonly}}"` 或 `class="{{readonly ? 'disabled' : ''}}"` 视觉反馈
    4. `index.js` 在 `currentUser !== loginUser` 时计算 `isReadonlyView: true` 并 `setData`；`index.wxml` **两处** `<index-task-item>` 均须传入 `readonly="{{isReadonlyView}}"`：
       - `index.wxml:135`（主任务列表）
       - `index.wxml:255`（搜索结果列表）
       **两处缺一不可**——漏掉搜索结果列表，家庭视角下仍可从搜索结果中完成/重置任务，绕过只读保护
- ❌ **任务完成/重置状态的跨设备实时同步**：将在里程碑07（双写策略）统一解决

### 优先级

- **优先级**：P0（最高）
- **理由**：里程碑06是后续所有云端多用户功能的前置

---

## 核心架构决策

### 决策：采用"切换身份"模型（不是"代理查看"）

这是影响整个实现方案的根本决策，必须明确。

**两种方案对比**：

| | 切换身份（本方案）| 代理查看 |
|--|---------------|---------|
| 含义 | `UserService.currentUser` 切换为孩子；后续所有 API 以孩子 userId 查询 | JWT 持有者保持家长；所有查询额外传 `targetUserId` |
| 与现有代码兼容性 | ✅ 与 user-switcher 现有模型完全一致 | ❌ 需要改造所有读取链路 |
| 任务读取 | `TaskService` 读取 `currentUser.userId`，自然切换 | 每个读取接口都需要额外传参 |
| 后端验证 | JWT userId 是家长，targetUserId 是孩子，后端验证同家庭 | 同左 |
| 消息/奖励兼容 | M6 中星星/奖励卡片**冻结展示 `loginUser` 数据**（`index.js` 调用时**显式传 `loginUserId`**，不依赖 `null`——`null` 会汇总所有用户数据）；孩子视角独立积分展示留后续版本 | 需要到处传参 |

**选择"切换身份"模型**，理由：与现有 `user-switcher` 模型一致，改动最小，且现有所有服务读取 `currentUser` 的逻辑自然适配。

### 切换身份模型的工作方式

```
家长打开 user-switcher → 点击"小明"
  → UserService.switchToUser("usr-child1")
  → currentUser = { userId: "usr-child1", role: "child", ... }
  → 保存到本地 session

后续 TaskService.getTasksByDate(date):
  → userId = UserService.getCurrentUserId()  // = "usr-child1"
  → getTasksByDate(date, "usr-child1")
  → _fetchTasksFromCloud("usr-child1", { date })
  → GET /api/tasks?date=...&targetUserId=usr-child1  ← 带 targetUserId
  → 后端验证 JWT.userId（家长）和 targetUserId（孩子）在同一家庭 ✅
```

### 关于多孩子兼容范围（本里程碑边界声明）

**本里程碑目标**：建立多孩子的数据结构基础（`users` 表支持多孩子，家庭成员列表支持展示多孩子）。

**已知限制（不在本里程碑解决）**：

| 位置 | 问题 | 影响 | 计划 |
|------|------|------|------|
| `user-service.js:112` `getChildUserId()` | 只取第一个 child | 积分/奖励功能 | 里程碑09 |
| `message-service.js:790` | 硬编码 parent/child 对发 | 消息通知 | 里程碑10 |
| `rewards.js:795` `_getChildUserId()` | 只取第一个 child | 奖励兑换 | 里程碑09 |

**⚠️ 本里程碑必须修复（防止数据损坏）**：

| 位置 | 问题 | 影响 | 修复方案 |
|------|------|------|------|
| `task-service.js` `completeTask` `:851` | `_getChildUserId()` 给第一个孩子加星，而非任务实际归属人 | **积分记到错误孩子**，数据损坏 | 改用 `task.userId`（任务已带归属） |
| `task-service.js` `resetTask` `:1012` | 同上，扣星时也用 `_getChildUserId()` | **同上** | 改用 `task.userId` |
| `task-service.js` `handleRequiredTaskPenalty` `:1218` | 必做任务逾期惩罚扣星同样使用 `_getChildUserId()`，`index.js:521` 的 `checkTasksStatus()` 周期调用 | **每次刷新首页都可能把罚星扣到错误孩子**，数据持续损坏 | 改用 `task.userId`（同上） |
| `star-service.js` 星星过期保护 `:1222/1258` | `app.js:336` 启动时汇总所有用户的即将过期星星，然后把保护动作打到 `getChildUserId()`（`user-service.js:112`）返回的第一个孩子——不是展示错误，而是**直接将过期保护写到错误孩子账户** | **多孩子家庭下星星数据持续损坏**，与 `handleRequiredTaskPenalty` 同等级 | 改造星星过期保护链路使其按**真实拥有者**操作：只扫 `loginUserId` 的星星（设备登录者）；或按实际 `star.userId` 精确操作；不得依赖 `getChildUserId()` |

> 🔴 **数据修复承诺（实施优先级最高）**：以下四处 `_getChildUserId()` 调用在多孩子家庭下会将积分/扣分错误地归属到第一个孩子，导致数据持续损坏。**必须在 M6 上线前完成，否则多孩子家庭数据将不可逆地损坏**：
> - `task-service.js` `completeTask`（`:851`）→ 改用 `task.userId`
> - `task-service.js` `resetTask`（`:1012`）→ 改用 `task.userId`
> - `task-service.js` `handleRequiredTaskPenalty`（`:1218`）→ 改用 `task.userId`
> - `star-service.js` 星星过期保护（`:1222/1258`）→ 改为只处理 `loginUserId` 的星星
>
> 详见实施步骤第6步第0项。

**结论**：本里程碑后，多孩子家庭的**任务读取**和**单次任务创建**的归属均可正确工作；`completeTask`/`resetTask`/`handleRequiredTaskPenalty` 的**星星归属**（扣/加哪个孩子）修复正确；**切换到孩子视角后完成/重置功能在 UI 层禁用**（避免操作结果被云端读取立即覆盖）；**重复/周期任务的后续实例**仅在本地生成，不同步云端——这是现有重复任务功能的存量限制，不在本里程碑修复范围内；消息通知和奖励功能仍基于单孩子假设，不做承诺。

---

## 两种使用场景

### 场景A：共享设备（孩子无独立微信号）

```
[爸爸手机]                      [妈妈手机]
  爸爸微信登录                    妈妈微信登录
  创建家庭                        输入邀请码加入家庭
  在 family-settings 创建孩子档案  同步看到孩子档案（云端同步）
  
  user-switcher 显示：             user-switcher 显示：
  ┌────────────┐                  ┌────────────┐
  │ 爸爸 (当前) │                  │ 妈妈 (当前) │
  │ 小明(孩子) │← 可切换孩子视角    │ 小明(孩子) │← 可切换孩子视角
  └────────────┘                  └────────────┘
  （家长之间不互相切换）             （家长之间不互相切换）
```

> **设计原则**：user-switcher 只允许家长切换到家庭中的孩子视角，**家长之间不互相切换**。爸爸不能冒用妈妈身份操作，每位家长始终以自己的账号登录和操作。家长在孩子视角下的操作，后续里程碑通过操作日志记录操作者身份（里程碑10范畴）。

**孩子使用家长手机时**：
- 家长切换到小明视角 → `currentUser = 小明`
- 此时只显示小明的任务；家长功能入口**仍然可见**（由 `loginUser.role` 控制，不随视角切换变化）
- 孩子在 user-switcher 里可以看到家长账号并点击切换
- **本期实现 PIN 保护**：孩子切回家长视角时，若家长已设置 PIN 则弹出验证框；**未设置 PIN 则允许自由切换**（初始态，避免设备锁死）
- PIN 码由家长在 family-settings 主动设置，设置后才生效；存储在设备本地，以 `loginUserId` 作用域隔离

**多台设备**：爸爸手机和妈妈手机都可以切换到孩子视角，数据云端同步。

### 场景B：独立设备（孩子有自己的微信号）

```
[爸爸手机]         [妈妈手机]         [孩子手机]
  爸爸登录          妈妈登录            孩子微信登录
  创建家庭          加入家庭（parent）   输入邀请码加入家庭（角色由邀请码决定=child）
  
  user-switcher:   user-switcher:      user-switcher:
  ┌──────────────┐ ┌──────────────┐   ┌──────────────┐
  │ 爸爸 (当前)  │ │ 妈妈 (当前)  │   │ 孩子 (当前)  │
  │ 孩子         │ │ 孩子         │   └──────────────┘
  └──────────────┘ └──────────────┘   （孩子设备只有自己，
  （不显示妈妈）   （不显示爸爸）        无法切换他人）
```

**场景B的家长查看孩子任务**：
- 家长在 user-switcher 切换到孩子视角（`currentUser = 孩子`）
- 任务查询携带孩子 userId，后端验证同家庭关系后返回孩子任务
- **M6 任务操作范围（家庭视角）**：家长切换到孩子视角后可**查看孩子任务和创建任务**；**完成/重置按钮 UI 禁用**（云端无状态写接口，操作结果会被下次读取覆盖，无法提供持久化承诺）；里程碑07补齐 PATCH 接口后恢复
- **任务状态跨设备同步（本期不覆盖）**：将在里程碑07统一解决

**场景B的孩子设备**：
- user-switcher 只显示自己（孩子自己的账号）
- 无法切换到家长，只能管理自己的任务

### 两种场景技术对应

| | 场景A（共享设备）| 场景B（独立设备）|
|--|--------------|--------------|
| 孩子账户类型 | 虚拟成员（`is_virtual=true`，无 openid）| 真实成员（`is_virtual=false`，有 openid）|
| 孩子如何加入家庭 | 家长在 family-settings 直接创建 | 孩子手机输入邀请码 |
| 家长切换孩子视角 | user-switcher 选择孩子档案 | user-switcher 选择孩子账号 |
| **家长设备 user-switcher** | 仅显示当前家长 + 家庭中的孩子（虚拟成员）| 仅显示当前家长 + 家庭中的孩子（真实账号）|
| **孩子设备 user-switcher** | 无独立设备（共享家长手机）| **仅显示自己**，无法切换他人 |

**user-switcher 成员显示规则**（`getAllUsers()` 依据**设备登录用户 loginUser**，不可变）：

| loginUser 角色 | 返回结果 |
|---|---|
| `child`（场景B孩子设备）| 仅返回 `[currentUser]`（只有自己） |
| `parent`（家长设备） | loginUser 本人 + 家庭中所有 `role=child` 的成员；**不含其他家长** |
| 无家庭（单用户） | 仅返回 `[currentUser]` |

⚠️ **不能用 `currentUser` 做此判断**：家长切换到真实孩子视角后，`currentUser.role === 'child'`，若用 `currentUser` 判断会误认为孩子设备，导致家长无法切回。

⚠️ **不显示其他家长**：user-switcher 不展示同家庭的其他家长账号；其他家长信息只在 family-settings 成员管理页面展示。

---

## 技术方案

### 核心原则：loginUser 用于权限，currentUser 用于数据

> 这是本里程碑最关键的设计边界，必须在实施前确认清楚。

| 维度 | 使用对象 | 说明 |
|------|--------|------|
| **UI 权限 / 功能入口** | `loginUser.role` | 是否显示"创建任务"按钮、能否访问 family-settings、能否触发软删除等 |
| **数据显示 / API 请求** | `currentUser` | 当前显示哪个孩子的任务列表、targetUserId 填谁 |

**原因**：当前 `index.js` 和 `permission-utils.js` 以 `currentUser.role` 计算权限和菜单。家长切到孩子视角后 `currentUser.role === 'child'`，导致"创建任务"入口消失、family-settings 无法访问——与"家长切换后仍可管理孩子任务"的核心目标直接冲突。

**实施要求**：
- `index.js` 中 `getUserPermissions(currentUser.role)` 改为 `getUserPermissions(loginUser.role)`（涉及 `:2514`、`:2623`、`:2794` 三处）
- **`utils/permission-utils.js` 的 `PAGE_PERMISSIONS` 表中显式新增 `family-settings` 路径**：`PAGE_PERMISSIONS` 的实际结构是**按角色分组的页面路径数组**（`{ [UserRole.PARENT]: [...], [UserRole.CHILD]: [...] }`），**不是**按页面配置 `roles` 的对象——正确做法是把 `/packageManage/pages/family-settings/family-settings` 加入 `[UserRole.PARENT]` 数组，**不加入** `[UserRole.CHILD]` 数组；不新增此条目则所有走权限表的入口均将该页面判为无权限
  ```javascript
  // 修改前
  [UserRole.PARENT]: [
    '/pages/index/index',
    '/pages/task-edit/task-edit',
    // ...其他页面
  ],

  // 修改后（新增最后一行）
  [UserRole.PARENT]: [
    '/pages/index/index',
    '/pages/task-edit/task-edit',
    // ...其他页面
    '/packageManage/pages/family-settings/family-settings',  // ← 新增
  ],
  // [UserRole.CHILD] 数组不做修改，family-settings 对孩子不可见
  ```
- **`models/user.js` 的 `getAccessiblePages()` 中显式新增 `family-settings` 的 parent 映射**；同样，不在此处新增则模型级权限方法调用时会遗漏该页面
- `UserService.hasPageAccess()` 和 `getAccessiblePages()`（`user-service.js:267/275`）当前代理到 `currentUser`——在有家庭的场景下也应改为代理到 `loginUser`，避免与 `permission-utils.js` 产生"一处放行、一处拒绝"的矛盾；如暂不修改，调用方必须统一使用 `permission-utils.js` 而非模型级方法
- 任务列表、任务数量统计等数据展示继续用 `currentUser.userId` 作为 targetUserId

---

### 任务读取链路（关键）

> ⚠️ **本节覆盖范围**：不仅限于主任务列表（`getTasksByDate`），首页还有两条辅助读取链路同样需要用户过滤，否则切换视角后仍会串数据：
>
> **首页辅助链路统一口径**（避免"任务列表是孩子的，提醒/统计是家长的"混合展示）：
>
> | 链路 | 当前问题 | M6 处理方式 | 说明 |
> |------|---------|------------|------|
> | `checkUpcomingTasks()`（`:1442`） | 读本地全量任务，无用户过滤 | **传 `currentUserId` 过滤**：与任务列表保持同一视角（任务列表是孩子的，提醒也应是孩子的） | 不冻结到 loginUser——冻结会导致页面同时展示两个人的数据 |
> | 首页统计 `updateTaskStats()`→`getTaskStatistics()`（`index.js:791`，`task-service.js:1569`） | `getTaskStatistics()` 内读全量任务 | **在 `getTaskStatistics()` 加 `userId` 可选参数，传入 `currentUserId`**；`index.js` 调用时传当前视角用户 | ⚠️ **只改 `getTaskStatistics()`，不改 `getAllTasks()`**—— `getAllTasks()` 被搜索、热力图、星星记录等多处复用，加过滤会破坏这些调用语义 |
> | `checkTasksStatus()`（惩罚扫描，`:1153`） | 同上 | **保持 `loginUserId` 过滤**：惩罚扣星是写操作，只能操作设备登录者自己的任务，不能代操作孩子任务 | 与任务展示逻辑不同，是写路径，必须保守 |
>
> **统一结论**：
> - **展示类**（任务列表、提醒、统计）：跟随 `currentUser`，确保同一页面数据属于同一个人
> - **写入类**（惩罚扫描、星星过期保护）：只处理 `loginUserId` 的数据，不代操作家庭成员
> - **星星/奖励**：显式传 `loginUserId`（不传 null）
> - **无法快速适配的功能**（搜索 `index.js:1706`、分析页 `analytics-service.js:41/520`、消息预览 `index.js:700`、奖励页、星星记录页、消息页）：家庭视角下在入口处禁用；搜索结果已加 readonly 保护但数据仍混合，推荐搜索结果按 `currentUserId` 过滤
>
> **实施位置**：
> - `checkUpcomingTasks()`（`:1442`）：加 `userId` 参数，`index.js` 调用时传 `currentUserId`
> - `getTaskStatistics()`（`:1569` 链路）：加可选 `userId` 参数，`index.js` 调用时传 `currentUserId`；**不改 `getAllTasks()`**
> - `checkTasksStatus()`（`:1153`）、`star-service.js` 过期保护：保持 `loginUserId` 过滤

当前链路（有问题）：
```
user-switcher 切换 currentUser
  → index.js: taskService.getTasksByDate(date)  ← 不传 userId
  → TaskService: this.taskRepository.getTasksByDate(date)  ← 只查本地
  → _fetchTasksFromCloud(userId=null, { date })  ← userId 未传给 API
```

改造后链路：
```
user-switcher 切换 currentUser（userId="usr-child1"）
  → index.js: taskService.getTasksByDate(date)  ← TaskService 内部取 currentUser
  → TaskService.getTasksByDate(date):
      currentUserId = UserService.getCurrentUserId()  // "usr-child1"
      loginUserId   = UserService.getLoginUserId()    // "usr-parent1"
      params = { date }
      if currentUserId !== loginUserId:              // ← 关键条件，避免无家庭用户进入家庭校验
        params.targetUserId = currentUserId
      _fetchTasksFromCloud(currentUserId, params)
  → GET /api/tasks?date=...&targetUserId=usr-child1
  → 后端验证：JWT(爸爸) 与 targetUserId(小明) 在同一家庭 ✅
  → 返回小明的任务

无家庭用户（currentUserId === loginUserId）：
  → params = { date }（不含 targetUserId）
  → GET /api/tasks?date=...（行为完全不变）✅
```

**关键改造**：`TaskService` 所有云端读取方法（`getTasksByDate`、`getTodayTasks`、`getAllTasks`）在 `currentUserId !== loginUserId` 时才传 `targetUserId`，否则不传——确保无家庭用户行为不变。

### 任务写入链路（补充）

**问题**：当家长切换到孩子视角后创建任务，后端 `createTask` 固定用 `req.user.userId`（JWT 中的家长 userId），导致任务归属家长而非孩子。

**改造后链路**：
```
家长切到孩子视角（currentUser = 小明）
  → 家长填写任务，点击保存
  → TaskService._syncTaskToCloud(task):
      targetUserId = UserService.getCurrentUserId()  // "usr-child1"
      loginUserId  = UserService.getLoginUserId()    // "usr-parent1"
      if targetUserId !== loginUserId:
        cloudData.targetUserId = targetUserId        // 携带目标用户
  → POST /api/tasks { ...taskData, targetUserId: "usr-child1" }
  → 后端验证：JWT(爸爸) 与 targetUserId(小明) 在同一 family_id，role=parent ✅
  → 使用 targetUserId 作为 task.user_id 落库
  → 任务归属小明 ✅
```

**后端 `createTask` 改造**：
```javascript
// backend/controllers/taskController.js
const userId = req.body.targetUserId
  ? await verifyFamilyParentAccess(req.user, req.body.targetUserId)  // 验证后返回 targetUserId
  : req.user.userId;
```

**前端 `_syncTaskToCloud` 改造**：
```javascript
// services/task-service.js（this.userService 已直接注入，无需 serviceManager）
const currentUserId = this.userService?.getCurrentUserId();
const loginUserId   = this.userService?.getLoginUserId();
if (currentUserId && currentUserId !== loginUserId) {
  cloudData.targetUserId = currentUserId;
}
```

**task-service.js 新增 `getLoginUserId()`**：
```javascript
// services/user-service.js — 新增方法
getLoginUserId() {
  return this.loginUserId;  // 微信 JWT 对应的真实登录用户 id，初始化时赋值
}
```

**影响范围**：`createTask` 写路径（本期实现云端写入归属修正）。

⚠️ **`completeTask`/`resetTask` 本期不做云端同步**：当前前端状态更新只写本地仓储，后端也没有 PUT/PATCH 任务状态接口。这意味着多设备家庭中，一台设备完成任务后，其他设备看到的状态不会实时同步——这是整个应用当前阶段的已知限制，将在里程碑07（双写策略）中统一解决，不在本里程碑承诺范围内。

### DDD分层设计

**后端**：
- 新增 `backend/models/Family.js`
- 新增 `backend/services/familyService.js`
- 新增 `backend/controllers/familyController.js`
- 新增 `backend/routes/families.js`
- 修改 `backend/services/taskService.js`：`getTasksByUser` 支持 `targetUserId`，验证同家庭
- 修改 `backend/services/userService.js`：支持虚拟成员创建（`is_virtual`、`openid` 可空）
- 修改 `backend/controllers/userController.js`：新增 `updateNickname`
- 修改 `backend/routes/users.js`：新增 `PATCH /:userId/nickname`

**前端**：
- 修改 `services/user-service.js`：`getAllUsers` 保持同步接口，改为读 `userCache`（`loadFamilyMembers` 异步预加载，见下方缓存刷新时机说明）；新增家庭方法
- 修改 `services/task-service.js`：所有云端读取携带 `currentUserId` 作为 `targetUserId`
- 修改 `utils/http-client.js`：新增 `patch` 静态方法
- 修改 `utils/api-config.js`：新增 FAMILIES 系列端点
- 修改 `components/user-switcher/`：适配家庭成员（虚拟/真实区分，删除逻辑改造）
- 修改 `pages/index/index.js` + `index.wxml`：`userAdd/userDelete` 事件处理器适配新逻辑
- 新增 `packageManage/pages/family-settings/`（四个文件）
- 修改根目录 `app.json`：在 `packageManage` subPackages 中注册 `family-settings`

### 技术选型

| 技术点 | 选择方案 | 理由 |
|--------|---------|------|
| 查看孩子任务方式 | 切换身份（`currentUser` 切换）| 与 user-switcher 现有模型一致，改动最小 |
| 虚拟成员标识 | `is_virtual` 字段 + `openid` 可空 | 复用 users 表，语义清晰 |
| 邀请码 | 6位随机码，24小时有效，一次性 | 简单可靠 |
| 昵称修改 HTTP 方法 | PATCH（新增到 HttpClient）| 语义正确；需在 HttpClient 补充 |
| 软删除 | `users.status='inactive'`，对用户透明（与真实删除体验完全一致，不告知云端保留） | DB 完整性保障（防止关联数据孤儿错误），历史任务数据物理保留但无用户侧访问入口——这是有意为之的产品决策，后续如需查看历史可在管理后台操作 |
| **家庭身份鉴权方式** | **JWT payload 中包含 `familyId`**（而非每次回表查询）| 性能好，每次请求无额外 DB 查询；家庭状态变更（创建/加入）时重签 token 确保一致性，配合已有的"join 必须刷新 token"规则闭环 |

---

## 数据库设计

### 新增表：families

```sql
-- backend/database/migrations/003_create_families.sql
CREATE TABLE IF NOT EXISTS families (
    family_id              VARCHAR(36)  PRIMARY KEY,
    name                   VARCHAR(100) NOT NULL    COMMENT '家庭名称',
    invite_code            VARCHAR(8)   UNIQUE      COMMENT '邀请码（最长8位字母数字）',
    invite_code_role       VARCHAR(20)              COMMENT '邀请码绑定的目标角色：parent | child，加入者角色由此决定',
    invite_code_expires_at TIMESTAMP                COMMENT '邀请码过期时间（24小时）',
    invite_code_used_at    TIMESTAMP                COMMENT '邀请码使用时间，不为NULL即已使用（一次性）',
    created_by             VARCHAR(36)  NOT NULL    COMMENT '创建者user_id',
    status                 VARCHAR(20)  DEFAULT 'active',
    created_at             TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_invite_code (invite_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 修改表：users

```sql
-- backend/database/migrations/004_update_users_for_family.sql

-- 1. openid 改为可空（虚拟成员无 openid）
ALTER TABLE users MODIFY COLUMN openid VARCHAR(64) COMMENT '微信openid，虚拟成员为NULL';

-- 2. 新增字段
ALTER TABLE users
    ADD COLUMN family_id          VARCHAR(36) COMMENT '所属家庭ID，NULL表示未加入家庭',
    ADD COLUMN is_virtual         BOOLEAN     DEFAULT FALSE COMMENT '是否虚拟成员（无独立微信号，由家长创建）',
    ADD COLUMN created_by_user_id VARCHAR(36) COMMENT '虚拟成员的创建者user_id',
    ADD INDEX idx_family_id (family_id),
    ADD CONSTRAINT fk_users_family
        FOREIGN KEY (family_id) REFERENCES families(family_id) ON DELETE SET NULL;
```

### 数据示例

```
families: family_id="fam-001", name="我们家", invite_code="ABC123", invite_code_used_at=NULL

users:
  usr-dad:    openid="wx_dad",  family_id="fam-001", role="parent", is_virtual=false
  usr-mom:    openid="wx_mom",  family_id="fam-001", role="parent", is_virtual=false
  usr-child1: openid=NULL,      family_id="fam-001", role="child",  is_virtual=true,  created_by="usr-dad"
  usr-child2: openid="wx_kid",  family_id="fam-001", role="child",  is_virtual=false  （场景B）
```

---

## API设计

### 新增接口

#### POST /api/families — 创建家庭

**请求体**：`{ "name": "我们家" }`

**响应**：`{ familyId, name, inviteCode, inviteCodeExpiresAt, token }`

> ⚠️ **必须返回新 token**：创建家庭后 `users.family_id` 已更新，但原 JWT payload 中 `familyId` 仍为 null。后续依赖 `req.user.familyId` 的接口（如家庭成员管理、任务隔离）会因 `familyId=null` 立即失败。响应体必须包含重签的新 token，前端收到后立即 `TokenManager.setToken(token)`。

**业务规则**：已有 family_id 的用户返回 400（`FAMILY_ALREADY_JOINED`）；创建时同步更新 `users.family_id`；成功后签发包含最新 `familyId` 的新 token

---

#### POST /api/families/join — 加入家庭（场景B：独立设备）

**请求体**：`{ "inviteCode": "ABC123" }`

> ⚠️ **加入者角色由邀请码携带，不允许加入方自行声明**：由现有家长生成邀请码时指定目标角色（见下方"刷新邀请码"接口），后端从邀请码记录中读取角色落库，完全忽略请求体中任何 `role` 字段。避免拿到邀请码的孩子通过传 `role=parent` 越权提升为家长。

**业务规则**：
- 邀请码不存在/已过期 → 400
- `invite_code_used_at` 不为 NULL（已使用）→ 400（`FAMILY_INVITE_CODE_INVALID`）
- 加入成功：更新 `users.family_id` + **更新 `users.role` 为邀请码记录中存储的 `invite_code_role`** + 写入 `invite_code_used_at=NOW()`（一次性失效）
- 已有家庭 → 400（`FAMILY_ALREADY_JOINED`）

**⚠️ 必须刷新 JWT**：认证中间件直接从 JWT payload 取 `role`（`auth.js:43`），不回表。若不刷新 token，join 后服务端仍按旧 `role=parent` 执行任务权限（如允许传 `targetUserId`），与实际孩子身份冲突。

- **返回体**：`{ success: true, token: "<新JWT>" }`（包含更新后的 role、family_id）
- **前端处理**：收到新 token 后立即替换本地存储（`TokenManager.setToken(token)`），再继续后续操作
- 后端签发新 token 的逻辑与 `/api/auth/login` 复用同一方法

---

#### POST /api/families/members — 创建虚拟成员（场景A：共享设备）

**请求体**：`{ "name": "小明" }`（不接受 `role` 字段，服务端强制设为 `child`）

**业务规则**：
- **JWT `role` 必须为 `parent`，否则 403 `FAMILY_PARENT_REQUIRED`**（孩子账号不得创建虚拟成员）
- **虚拟成员 `role` 强制为 `child`**：服务端忽略客户端传入的 `role` 字段（或传入 `role=parent` 时直接返回 400）；虚拟成员只用于共享设备上的孩子档案，不允许创建虚拟家长，否则会破坏"家长身份只能来自真实微信登录"的前提
- 调用者必须已有家庭（`FAMILY_NOT_JOINED`）
- `is_virtual=true`，`openid=NULL`，`role=child`（强制），`family_id` 继承调用者
- 同家庭内同名成员不可重复创建

---

#### DELETE /api/families/members/:userId — 软删除家庭成员

**业务规则**：
- **JWT `role` 必须为 `parent`，否则 403 `FAMILY_PARENT_REQUIRED`**
- **调用者的 `family_id` 必须与被删除成员的 `family_id` 相同，否则 403**（防止跨家庭删除）
- 只能删除 `is_virtual=true` 的成员（`FAMILY_VIRTUAL_MEMBER_ONLY`）
- 不能删除自己
- 软删除：`users.status='inactive'`，对用户完全透明

---

#### GET /api/families/current — 获取当前家庭信息

未加入家庭时 `data: null`，前端据此引导创建/加入流程。

---

#### GET /api/families/current/members — 获取家庭成员列表

**响应**：仅返回 `status='active'` 的成员（软删除成员不返回）

```json
{
  "members": [
    { "userId": "usr-dad",    "name": "爸爸", "role": "parent", "isVirtual": false },
    { "userId": "usr-child1", "name": "小明", "role": "child",  "isVirtual": true  }
  ]
}
```

---

#### POST /api/families/current/invite-code — 刷新邀请码

**请求体**：`{ "role": "parent" | "child" }`（必填，指定持码人加入后的角色）

生成新码（旧码立即失效），新码为一次性，**邀请码中存储目标角色 `invite_code_role`**。使用 POST 而非 GET，因为此操作修改服务端状态。

**权限**：调用方必须是 `role=parent`（只有已有家长能生成邀请码）。

---

#### PATCH /api/users/:userId/nickname — 修改昵称

**请求体**：`{ "nickname": "小明" }`

**权限**：修改自己的昵称（任何角色）；或家长修改同家庭虚拟成员（`is_virtual=true`）的昵称；不能修改其他真实账号成员的昵称。

---

### 修改现有接口

#### GET /api/tasks — 支持 targetUserId

```
GET /api/tasks?date=2026-03-12&targetUserId=usr-child1
```

**后端验证**：
- 不传 `targetUserId`：查调用者自己的任务（行为不变）
- 传 `targetUserId`：验证 `targetUserId` 与 JWT 持有者在同一 `family_id`，否则 403
- `role=child` 的 JWT 持有者不允许传 `targetUserId`（孩子不能代查他人）

**同样扩展**：`GET /api/tasks/:taskId`、`GET /api/tasks/count` 也支持 `targetUserId`

---

#### POST /api/tasks — 支持 targetUserId（家长代孩子创建）

```
POST /api/tasks
Content-Type: application/json

{
  "title": "读书30分钟",
  "type": "study",
  "date": "2026-03-12",
  "points": 10,
  "targetUserId": "usr-child1"   // 可选；不传则归属 JWT 用户自己
}
```

**后端验证**：
- 不传 `targetUserId`：任务归属 JWT 用户（行为不变）
- 传 `targetUserId`：验证 JWT 持有者为 `role=parent` 且与 `targetUserId` 在同一 `family_id`，否则 403
- `role=child` 的 JWT 持有者不允许传 `targetUserId`
- 验证通过后：以 `targetUserId` 作为 `task.user_id` 落库

> ⚠️ **防越权写入**：`taskController.createTask` 在计算出合法的 `userId`（`targetUserId` 或 `req.user.userId`）后，必须将 `req.body.userId` 和 `req.body.targetUserId` 从传入 service 的数据中**显式删除**，再调用 `taskService.createTask(userId, taskData)`。否则 `taskService` 在构造任务时若扩展 `{ userId, ...taskData }`，客户端直接在 body 中携带 `userId` 字段即可覆盖控制器算出的合法归属人。

**错误码**（新增）：`FAMILY_TASK_CREATE_DENIED`——无权为该成员创建任务

---

### 错误码

| 错误码 | 说明 |
|--------|------|
| `FAMILY_ALREADY_JOINED` | 用户已有家庭 |
| `FAMILY_NOT_JOINED` | 用户未加入家庭 |
| `FAMILY_NOT_FOUND` | 家庭不存在 |
| `FAMILY_INVITE_CODE_INVALID` | 邀请码无效或已使用 |
| `FAMILY_INVITE_CODE_EXPIRED` | 邀请码已过期 |
| `FAMILY_MEMBER_ACCESS_DENIED` | 无权访问该成员数据（非同家庭）|
| `FAMILY_VIRTUAL_MEMBER_ONLY` | 该操作仅限虚拟成员 |
| `FAMILY_TASK_CREATE_DENIED` | 无权为该成员创建任务（非同家庭或非家长）|
| `FAMILY_PARENT_REQUIRED` | 该操作仅限家长（孩子账号不允许）|

---

## 代码结构

### 文件变更清单

**后端新增**：
- `backend/database/migrations/003_create_families.sql`
- `backend/database/migrations/004_update_users_for_family.sql`
- `backend/models/Family.js`
- `backend/services/familyService.js`
- `backend/controllers/familyController.js`
- `backend/routes/families.js`

**后端修改**：
- `backend/server.js` — 注册 `/api/families` 路由
- `backend/models/User.js` — **全链路字段打通**：`constructor`、`fromDB()`、`toDB()`、`toJSON()` 均须新增 `isVirtual`/`familyId`/`createdByUserId` 字段；只改 `toJSON()` 不够——model 内部不认识这些字段，`fromDB()` 不映射则读库后永远是 `undefined`，前端 `loginUser.familyId`、成员删除按钮判断全部失效
- **`backend/middleware/auth.js`** — **`req.user` 新增 `familyId` 字段**：从 JWT payload 提取（`payload.familyId`），后续家庭鉴权（`req.user.familyId`）依赖此字段；不修改此处则所有同家庭验证伪代码均无法落地
- **`backend/controllers/authController.js`**（或统一的 `generateToken` 工具方法）— **JWT payload 新增 `familyId`**：签发 token 时带入 `familyId`；影响 `login`、`POST /api/families`（创建）、`POST /api/families/join`（加入）三处签发点，确保每次家庭状态变更后新 token 包含最新 `familyId`
- `backend/controllers/userController.js` — **`getUserById` 放宽权限**：在 `userId !== currentUserId` 时，额外允许同家庭成员互查（验证 `req.user.familyId` 与目标用户相同且不为 NULL），否则 `switchToUser` 缓存 miss 时会 403。验证逻辑：
  ```
  if userId === currentUserId → 放行
  else if targetUser.familyId === req.user.familyId && familyId !== null → 放行（同家庭）
  else → 403 USER_ACCESS_DENIED
  ```
- `backend/services/taskService.js` — `getTasksByUser` 支持 `targetUserId` + 同家庭验证；`createTask` 支持 `targetUserId`（家长代孩子创建）
- `backend/controllers/taskController.js` — `getTasks` 传递 `req.query.targetUserId` 给 service；`getTaskById`、`countTasks` 支持 `req.query.targetUserId` + 同家庭验证
- `backend/services/userService.js` — 支持虚拟成员（`is_virtual`、`openid` 可空）；新增 `updateNickname`
- `backend/controllers/userController.js` — 新增 `updateNickname`
- `backend/routes/users.js` — 新增 `PATCH /:userId/nickname`

**前端新增**：
- `packageManage/pages/family-settings/family-settings.{js,wxml,wxss,json}`

**前端修改**：
- `utils/http-client.js` — **新增 `static patch(url, data)` 方法**
- `utils/api-config.js` — 新增 FAMILIES 端点、USER_NICKNAME 端点
- **`utils/token-manager.js`** — **`getUserInfo()` 返回值新增 `familyId` 字段**：从 JWT payload 提取（`payload.familyId`）；新增 `static getFamilyId()` 方法（与现有 `getUserInfo()` 模式一致）。`getFamilyId()` 读取本地已存储 token 中的值，与 `GET /api/auth/current` 返回的 `familyId` 应始终一致（每次家庭状态变更都会刷新 token）；`UserService.initialize()` 中 `loginUser` 的完整信息仍从 API 获取（含 nickname、isVirtual 等字段），`getFamilyId()` 可用于判断"用户是否已加入家庭"等不需要完整对象的快速检查，避免额外 API 调用
- `models/user.js` — **构造函数新增 `isVirtual`、`familyId`、`createdByUserId` 字段**（从 API 响应映射；缺少则 user-switcher 删除按钮、场景过滤全部失效）
- `services/user-service.js` — **`getAllUsers` 保持同步接口，改为读 `userCache`**（由 `loadFamilyMembers` 异步预加载，详见关键代码第6节）；新增家庭方法；新增 `updateNickname`；新增 `loginUser`/`loginUserId` 记录；新增 `getLoginUserId()`；**`hasPageAccess()` 和 `getAccessiblePages()` 改为代理到 `loginUser`**；**`refreshUserCache()`（`:482`）和 `validateService()`（`:533`）均依赖 `GET /api/users`（仅返回当前登录用户），M6 后若被调用会静默清空家庭缓存**：这两条路径**迁移到 `GET /api/auth/current` + `loadFamilyMembers()` 模式**，与 `initialize()` 保持一致；若短期内无法迁移，至少在方法开头加日志警告并在有 familyId 时跳过缓存重置
- `services/task-service.js` — 云端读取**仅在 `currentUserId !== loginUserId` 时**携带 `targetUserId`（避免无家庭用户进入家庭校验）；`_syncTaskToCloud` 在切换视角时携带 `targetUserId`
- `components/user-switcher/user-switcher.js` — **新增 `loginUserId` 属性**（`properties` 中声明，由父页面传入）；**新增 `canManageMembers` 属性**（`Boolean`，由父页面传入 `loginUser.role === 'parent'`，控制删除按钮和添加入口可见性）；**将 `isCurrentUserParent()`、`deleteUser()`、`showAddUserDialog()`、`confirmAddUser()` 中的 `currentUser.role === 'parent'` 校验全部替换为 `this.data.canManageMembers`**（仅改 WXML 不够，JS 内部校验不改则点击时依然被旧逻辑拦截）；改造"添加成员"入口；新增 PIN 码验证拦截（PIN key = `familySwitchPIN_${this.data.loginUserId}`）；**`triggerEvent('userSwitch', ...)` 的载荷统一为 `{ userId: targetUser.userId }`**（与现有 `index.js:2599` 读 `e.detail.userId` 的契约保持一致，不传 `{ user }` 对象）
- `components/user-switcher/user-switcher.wxml` — 删除按钮仅对 `is_virtual=true` 成员显示；**删除现有"添加用户对话框"代码块**；新增 PIN 码输入弹窗（复用现有 dialog 样式模式）
- `pages/index/index.js` — `handleUserAdd` 改为跳转 family-settings；`handleUserDelete` 适配软删除；**权限计算改为用 `loginUser.role`（`:2514`、`:2623`、`:2794` 三处 `currentUser.role` → `loginUser.role`）**，确保家长切到孩子视角后创建任务入口和家长功能仍然可见
- `pages/index/index.wxml` — **需要修改**：在 `<user-switcher>` 组件调用处新增 `loginUserId="{{loginUserId}}"` 属性传递（PIN key 作用域隔离依赖此字段）
- `utils/permission-utils.js` — **`PAGE_PERMISSIONS` 的 `[UserRole.PARENT]` 数组新增 `/packageManage/pages/family-settings/family-settings`，不加入 `[UserRole.CHILD]` 数组**（`PAGE_PERMISSIONS` 是按角色分组的路径数组，不是按页面配置 roles 的对象，写成 `roles: ['parent']` 会改坏权限表）；**family-settings 页面的访问权限检查改用 `loginUser.role`**（调用方传入时使用 `loginUser.role` 而非 `currentUser.role`）；两者缺一不可，否则权限检查形同虚设
- `models/user.js` — **`getAccessiblePages()` 中新增 `family-settings` 的 parent 映射**（与 `permission-utils.js` 对齐）
- `test/services/user-service.test.js` — **调整 validateService 测试5**：放宽"必须同时有 parent 和 child"断言为"缓存包含 loginUser 即可"，避免场景B孩子设备上假失败
- 根目录 `app.json` — 在 `packageManage` subPackages 中新增 `family-settings` 页面路径

### 关键代码改造

#### 1. HttpClient 新增 patch 方法

```javascript
// utils/http-client.js
static patch(url, data) {
  return this.request({ url, method: 'PATCH', data });
}
```

#### 2. TaskService 云端读取携带 targetUserId

```javascript
// services/task-service.js
// 注：task-service 通过 this.userService 直接注入（见 task-service.js:34），无需 serviceManager
async getTasksByDate(date, userId = null) {
  const currentUserId = this.userService?.getCurrentUserId() || userId;
  const loginUserId   = this.userService?.getLoginUserId()   || currentUserId;

  // 仅在切换了视角（currentUserId !== loginUserId）时才传 targetUserId
  // 保证无家庭用户的行为完全不变，不进入家庭校验分支
  const params = { date };
  if (currentUserId && currentUserId !== loginUserId) {
    params.targetUserId = currentUserId;
  }

  if (this.enableCloudStorage) {
    try {
      tasks = await this._fetchTasksFromCloud(currentUserId, params);
      // 云端任务回填本地 repo：确保 completeTask/resetTask 能通过 taskRepository.getById() 找到任务
      // 不回填则切换视角后点完成会报"未找到任务"
      // ⚠️ 隔离要求见下方说明
      if (tasks.length > 0) {
        await this.taskRepository.saveAll(tasks, currentUserId);
      }
    } catch (cloudError) {
      tasks = await this.taskRepository.getTasksByDate(date, currentUserId);
    }
  } else {
    tasks = await this.taskRepository.getTasksByDate(date, currentUserId);
  }
  // ...
}
```

**`taskRepository.saveAll` 说明**：该方法已存在（继承自 `base-repository.js`，`task-repository.js` 内部也已在使用），直接调用即可，无需新增。

> ⚠️ **本地任务缓存混合问题与隔离策略**
>
> **问题**：`saveAll` 会将孩子的云端任务写入共享的本地 `taskData` 存储（`task-repository.js:18` 使用全局键）。而 `checkTasksStatus()`（`app.js:329` 启动时调用）不过滤用户，直接扫描所有本地任务，可能对非 `loginUser` 的孩子任务触发逾期惩罚扫描——尽管惩罚扣星已修正为 `task.userId`，但应扫描到的时机本不该由家长设备的全局扫描触发。
>
> **本期策略（最小改动）**：修改 `checkTasksStatus()` 加入用户过滤，**只处理 `task.userId === loginUser.userId` 的任务**（即只扫描设备登录者自己的任务）。家庭成员的任务逾期检测不在本设备的全局扫描中处理，各成员在自己设备登录时触发自己的扫描。
>
> **实施位置**：`task-service.js` `checkTasksStatus()`（`:1153`）开头或循环内增加过滤：
> ```javascript
> // task-service.js — checkTasksStatus() 中
> const loginUserId = this.userService?.getLoginUserId();
> // 家庭模式下只扫描登录用户自己的任务，避免对家庭成员缓存任务误触发惩罚
> if (loginUserId && task.userId && task.userId !== loginUserId) continue;
> ```
>
> 这确保了即使孩子任务被 `saveAll` 写入本地，全局惩罚扫描也不会误处理它们。`saveAll` 的回填目的（保证 `completeTask` 能找到任务）不受影响。

#### 3. user-switcher 删除按钮仅对虚拟成员显示

```xml
<!-- user-switcher.wxml -->
<!-- 改造前：只判断当前用户是否家长（currentUser.role 会随视角切换变化，不可靠）-->
<view wx:if="{{currentUser.role === 'parent'}}" ...>×</view>

<!-- 改造后：用 loginUser 派生的 canManageMembers prop，不受视角切换影响 -->
<view wx:if="{{canManageMembers && item.isVirtual}}" ...>×</view>
```

> `canManageMembers` 由父页面（`index.js`）根据 `loginUser.role === 'parent'` 计算后通过 props 传入 user-switcher 组件，与 `loginUserId` 一同传递。组件层不自行判断 `currentUser.role`，避免家长切到孩子视角后管理入口消失。

**user-switcher 组件需新增 `canManageMembers` 属性**（`properties` 中声明 `canManageMembers: { type: Boolean, value: false }`），由 `index.js` 传入 `loginUser.role === 'parent'` 的计算结果。

> ⚠️ **组件内部校验须一并替换**：组件内部现有的 `isCurrentUserParent()` 方法及 `deleteUser()`、`showAddUserDialog()`、`confirmAddUser()` 中依赖 `currentUser.role === 'parent'` 的校验逻辑，**全部替换为 `this.data.canManageMembers`**。若仅改 WXML 可见性而不改 JS 校验，家长切到孩子视角后按钮虽然显示，点击时依然被 `currentUser.role === 'child'` 拦住，功能无法正常运行。

#### 4. index.js handleUserAdd 改为跳转 + index.wxml 传入 loginUserId

**index.wxml 需要两处修改**：
1. 在 `<user-switcher>` 组件调用处新增 `loginUserId="{{loginUserId}}"` 属性（PIN key 作用域依赖此值）
2. 事件绑定保持不变（`bind:userAdd`、`bind:userDelete`、`bind:userSwitch`）

事件流：`user-switcher.js` 点击"添加" → 触发已有的 `userAdd` 事件（保持原事件名） → `index.wxml` 的 `bind:userAdd="handleUserAdd"` 不变 → `index.js` 的 `handleUserAdd` 改为跳转。

```javascript
// pages/index/index.js
async handleUserAdd(e) {
  // 不再本地创建用户，跳转到家庭设置页
  wx.navigateTo({
    url: '/packageManage/pages/family-settings/family-settings'
  });
}
```

#### 5. UserService 初始化：非法会话回正规则

**问题**：M6 后家庭成员缓存包含所有家长和孩子账号。以下两种情况下，本地残留的 `savedUserId` 会导致启动恢复到非法视角：
- 孩子独立设备（场景B）残留了非本人 `savedUserId`（例如家长曾借用该设备）
- 家长设备残留了**另一位家长**的 `savedUserId`（场景A 明确禁止家长-家长视角切换）

**规则**：`initialize()` 恢复会话时，按以下优先级判断是否强制回正到 `loginUser`：

1. `loginUser.role === 'child' && !loginUser.isVirtual`：孩子设备，始终强制 `currentUser = loginUser`
2. `loginUser.role === 'parent'` 且 savedUserId 对应的 `savedUser.role === 'parent'` 且 `savedUserId !== loginUser.userId`：家长设备恢复到其他家长视角，非法，强制 `currentUser = loginUser`
3. 其他情况：正常恢复 savedUserId，或兜底到 `loginUser`

```javascript
// services/user-service.js — initialize() 中恢复会话处
const savedUserId = this.storageAdapter?.get('currentUserId') || wx.getStorageSync('currentUserId');

const forceReset = (reason) => {
  this.currentUser = this.loginUser;
  if (this.storageAdapter) {
    this.storageAdapter.set('currentUserId', this.loginUser.userId);
  } else {
    wx.setStorageSync('currentUserId', this.loginUser.userId);
  }
  logger.info('UserService', `会话回正到 loginUser：${reason}`, { userId: this.loginUser.userId });
};

if (this.loginUser?.role === 'child' && !this.loginUser?.isVirtual) {
  // 孩子设备：忽略 savedUserId，始终使用 loginUser
  forceReset('孩子设备');
} else if (savedUserId && this.userCache.has(savedUserId)) {
  const savedUser = this.userCache.get(savedUserId);
  if (
    this.loginUser?.role === 'parent' &&
    savedUser.role === 'parent' &&
    savedUserId !== this.loginUser.userId
  ) {
    // 家长设备恢复到其他家长视角：非法，回正
    forceReset('家长设备不允许恢复其他家长视角');
  } else {
    this.currentUser = savedUser;
  }
} else {
  this.currentUser = this.loginUser;  // 兜底
}
```

> **与 loadFamilyMembers 的时序**：`initialize()` 在加载家庭成员（`loadFamilyMembers`）后执行上述判断，此时 `userCache` 已包含完整成员信息，`savedUser.role` 可正确取到。若加载失败（网络异常），userCache 仅含 loginUser，savedUserId 缓存 miss，兜底到 `loginUser`，行为安全。

#### 6. UserService getAllUsers（同步读缓存）与 loadFamilyMembers（异步刷新）

```javascript
// services/user-service.js
async loadFamilyMembers() {
  try {
    const data = await HttpClient.get(API_CONFIG.ENDPOINTS.FAMILIES_MEMBERS);
    const members = (data.members || []).map(m => new User(m));
    // 使用 clear + 重建模式（与 refreshUserCache 一致），确保跨设备软删除后幽灵成员不残留
    this.userCache.clear();
    // loginUser 本身必须始终在缓存中（不依赖后端是否返回）
    if (this.loginUser) {
      this.userCache.set(this.loginUser.userId, this.loginUser);
    }
    members.forEach(u => this.userCache.set(u.userId, u));
    logger.info('UserService', `家庭成员加载: ${members.length}人`);

    // 软删除回退：重建缓存后检查 currentUser 是否还在有效成员中
    // 跨设备删除场景：本机 currentUser 可能已被其他设备软删除（后端不再返回该成员）
    if (this.currentUser && !this.userCache.has(this.currentUser.userId)) {
      logger.warn('UserService', '当前视角成员已被删除，回退到 loginUser', { userId: this.currentUser.userId });
      this.currentUser = this.loginUser;
      if (this.storageAdapter) {
        this.storageAdapter.set('currentUserId', this.loginUser.userId);
      } else {
        wx.setStorageSync('currentUserId', this.loginUser.userId);
      }
    }
  } catch (error) {
    logger.warn('UserService', '加载家庭成员失败，使用本地缓存', error);
  }
}

getAllUsers() {
  // 场景B孩子设备：用 loginUser（设备拥有者，不随视角切换变化）判断，不能用 currentUser
  if (this.loginUser?.role === 'child' && !this.loginUser?.isVirtual) {
    return [this.currentUser];  // 孩子设备只返回当前视角（始终是自己）
  }
  // 家长设备：只返回 loginUser 本人 + 家庭中的孩子（不含其他家长）
  const users = Array.from(this.userCache.values())
    .filter(u => u.status !== 'inactive')
    .filter(u => u.userId === this.loginUser?.userId || u.role === 'child');
  return users.length > 0 ? users : [this.currentUser];
}
```

> **`getAllUsers` 接口性质**：始终为**同步调用**，读取 `userCache` 内存缓存，与现有所有调用点（`user-service.js:121`、`index.js:2511`、`index.js:2575`）保持兼容，无需改造调用方。
>
> **缓存刷新时机**（由 `loadFamilyMembers` 异步驱动，主动调用时机）：
> 1. **应用初始化**：`UserService.initialize()` 末尾调用（已在变更清单中）
> 2. **创建家庭成功后**：`family-settings` 页调用 `TokenManager.setToken()` + `UserService.initialize()` 后，`initialize()` 内部再次触发
> 3. **加入家庭成功后**：同上
> 4. **添加虚拟成员成功后**：`family-settings` 页调用 `userService.loadFamilyMembers()` 刷新
> 5. **软删除成员成功后**：同上
>
> 跨设备成员变更（其他设备添加/删除成员）依赖下次应用进入前台时重新初始化触发刷新，不做实时推送（M6 已知限制）。

#### 7. UserService switchToUser 补充硬性权限校验

`getAllUsers()` 过滤只是 UI 层约束（user-switcher 不显示其他家长），但 `switchToUser()` 本身可被任何代码直接调用，必须在 service 层添加防线。

```javascript
// services/user-service.js — switchToUser() 方法起始处
async switchToUser(userId) {
  // 防线1：孩子独立设备不允许切换任何人（自己除外）
  if (this.loginUser?.role === 'child' && !this.loginUser?.isVirtual) {
    if (userId !== this.loginUser.userId) {
      logger.warn('UserService', '孩子设备禁止切换到其他用户', { userId });
      return { success: false, message: '无权切换用户' };
    }
  }

  // 防线2：不允许家长切换到其他家长账号
  const targetUser = this.userCache.get(userId) || await this.getUserByIdAsync(userId);
  if (this.loginUser?.role === 'parent' && targetUser?.role === 'parent' && userId !== this.loginUser.userId) {
    logger.warn('UserService', '不允许家长切换到其他家长账号', { userId });
    return { success: false, message: '只能切换到家庭中的孩子' };
  }

  // 原有逻辑...
}
```

### PIN 码保护设计

**适用场景**：场景A（共享设备），孩子切回家长视角时需要输入 PIN 码。场景B（独立设备）孩子设备无其他成员，不触发此逻辑。

#### 存储方案

PIN 码**仅存储在设备本地**，不上云。原因：
- PIN 是共享设备的使用惯例，不同设备可以有不同 PIN
- 避免云端存储带来的安全复杂度

```javascript
// 存储键以 loginUserId 作用域隔离，防止同设备不同账号串用
const pinKey = `familySwitchPIN_${loginUser.userId}`;

// 存储
wx.setStorageSync(pinKey, pin);  // pin 为4-6位数字字符串

// 读取
const pin = wx.getStorageSync(pinKey);  // 返回 '' 表示未设置
```

#### 触发条件

```javascript
// components/user-switcher/user-switcher.js
handleUserSwitch(targetUser) {
  const currentUser = this.data.currentUser;
  // 当前是孩子视角，切换目标是家长 → 检查 PIN
  if (currentUser.role === 'child' && targetUser.role === 'parent') {
    const loginUserId = this.data.loginUserId;  // 从 UserService 传入，用于 PIN key 隔离
    const pinKey = `familySwitchPIN_${loginUserId}`;
    const savedPIN = wx.getStorageSync(pinKey);
    if (savedPIN) {
      // 已设置 PIN → 弹窗验证
      this.setData({ showPINDialog: true, pendingTargetUser: targetUser, pinKey });
      return;
    }
    // 未设置 PIN → 允许自由切换（初始态无锁，家长后续可在 family-settings 设置 PIN）
    // 不拒绝切换，避免共享设备在 PIN 未配置时陷入死锁
    this.triggerEvent('userSwitch', { userId: targetUser.userId });  // 与现有页面契约一致（index.js:2599 读 e.detail.userId）
    return;
  }
  // 其他切换：无需 PIN
  this.triggerEvent('userSwitch', { userId: targetUser.userId });  // 统一使用 userId，不传 user 对象
}
```

#### PIN 验证弹窗

```xml
<!-- user-switcher.wxml -->
<view wx:if="{{showPINDialog}}" class="pin-dialog-mask">
  <view class="pin-dialog">
    <text class="pin-title">请输入切换密码</text>
    <input type="number" password maxlength="6"
           bindinput="onPINInput" placeholder="请输入密码" />
    <view class="pin-actions">
      <button bindtap="cancelPIN">取消</button>
      <button bindtap="confirmPIN" type="primary">确认</button>
    </view>
  </view>
</view>
```

```javascript
confirmPIN() {
  const inputPIN = this.data.pinInput;
  // 使用 setData 时存入的 pinKey（含 loginUserId 作用域），不能用硬编码键
  const savedPIN = wx.getStorageSync(this.data.pinKey);
  if (inputPIN === savedPIN) {
    this.setData({ showPINDialog: false, pinInput: '' });
    this.triggerEvent('userSwitch', { userId: this.data.pendingTargetUser.userId });  // 与现有契约一致
  } else {
    wx.showToast({ title: '密码错误', icon: 'error' });
  }
}
```

#### family-settings 中设置 PIN

```
家长视角 family-settings 新增入口：
┌─────────────────────────────────────┐
│ 切换密码                              │
│ [修改密码]                            │
│ 说明：孩子切换到家长视角时需要输入此密码  │
└─────────────────────────────────────┘
```

- 首次设置：输入新密码（4-6位数字）→ 确认 → `wx.setStorageSync`
- 修改密码：先输旧密码验证 → 输新密码 → 保存
- **重置密码（忘记密码）**：直接点"清除密码"按钮 → 确认弹窗 → `wx.removeStorageSync(pinKey)` 清除本地 PIN；不需要验证旧密码（PIN 是本地设备隔离，非账号安全凭证；强制验证旧密码反而会在忘记密码时锁死设备）；清除后孩子切回家长视角自由通行，家长可重新设置新 PIN
- 密码存储为明文（本地存储，已足够安全）

### 家庭设置页面（新增）

**页面路径**：`packageManage/pages/family-settings/family-settings`

**注册位置**：根目录 `app.json` → `subPackages` → `packageManage.pages` 数组中追加

**两种状态**（parent-only 页面，孩子无权访问）：

> ⚠️ **页面态和按钮权限由 `loginUser.role` 决定**——家长切到孩子视角后 `currentUser.role === 'child'`，必须用 `loginUser.role`（不变量）判断，否则 PIN 设置、成员管理等入口会错误消失。
>
> `family-settings` **仅 `loginUser.role === 'parent'` 时可访问**，孩子（`loginUser.role === 'child'`）不进入本页面。真实孩子（场景B独立设备）修改自己昵称的路径：通过 **user-switcher 组件新增的昵称编辑入口**（见下方 user-switcher 改造说明，组件当前只有切换/添加/删除，无编辑入口，需要新增）；虚拟孩子的昵称由家长在本页成员列表中编辑。
>
> ⚠️ **页面自身必须做权限守卫**：`permission-utils` 只在首页生效（`index.js:2514/2794`），孩子仍可通过直达路径（如分享链接、历史记录）进入本页。`family-settings.js` 的 `onLoad`/`onShow` 必须主动校验：
> ```javascript
> const loginUser = userService.loginUser;
> if (!loginUser || loginUser.role !== 'parent') {
>   wx.redirectTo({ url: '/pages/index/index' });
>   return;
> }
> ```

| 状态 | 条件（用 `loginUser` 判断） | 显示内容 |
|------|------|---------|
| 未加入家庭 | `loginUser.familyId == null` | "创建家庭"卡片 + "加入家庭（输入邀请码）"卡片 |
| 家长视角 | 有家庭 + `loginUser.role === 'parent'` | 家庭名称、成员列表（含虚拟成员删除/所有成员昵称编辑）、邀请码展示与刷新、添加虚拟成员入口、PIN 设置入口 |

---

## 实施步骤

### 第1步：数据库迁移（0.5天）

- [ ] 创建并执行 `003_create_families.sql`
- [ ] 创建并执行 `004_update_users_for_family.sql`
- [ ] **验证**：`DESCRIBE families; DESCRIBE users;` 确认字段正确；存量用户数据不受影响

**注意**：先执行 003，再执行 004（外键依赖）

---

### 第2步：后端 Family 模型和 familyService（1天）

- [ ] 创建 `backend/models/Family.js`（字段：`familyId`、`name`、`inviteCode`、`inviteCodeExpiresAt`、`inviteCodeUsedAt`、`createdBy`）
- [ ] 创建 `familyService.js`，实现所有方法
- [ ] **验证**：单独测试 createFamily、joinFamily（含一次性邀请码验证）、createVirtualMember

**事务要求**：
- `createFamily`：使用 MySQL 事务（`families` 插入 + `users.family_id` 更新必须原子完成；中途失败需回滚，避免留下 families 记录但 user 未关联的半成品状态）
- `joinFamily`：使用 MySQL 事务（同时更新 `invite_code_used_at` + `users.family_id` + `users.role`）

---

### 第3步：后端家庭模块（路由、控制器、用户扩展）（0.5天）

- [ ] 创建 `familyController.js` 和 `routes/families.js`
- [ ] 在 `server.js` 注册 `/api/families` 路由
- [ ] 修改 `userService` + `userController`：新增 `updateNickname`；`createUser` 支持虚拟成员
- [ ] 在 `users.js` 路由新增 `PATCH /:userId/nickname`
- [ ] 修改 `backend/models/User.js`——**全链路字段打通**（只改 `toJSON()` 不够，model 内部不认识新字段则 API 响应永远无法输出它们）：
  - `constructor`：新增 `isVirtual = false`、`familyId = null`、`createdByUserId = null` 参数和赋值
  - `fromDB()`：新增 `isVirtual: dbRecord.is_virtual`、`familyId: dbRecord.family_id`、`createdByUserId: dbRecord.created_by_user_id` 映射
  - `toDB()`：新增 `is_virtual: this.isVirtual`、`family_id: this.familyId`、`created_by_user_id: this.createdByUserId` 映射
  - `toJSON()`：新增 `isVirtual`、`familyId`、`createdByUserId` 输出（API 响应字段）
- [ ] 修改 `backend/controllers/userController.js` 的 `getUserById`：放宽为同家庭成员互查（`req.user.familyId` 相同即允许），防止 `switchToUser` 缓存 miss 时 403
- [ ] **验证**：curl 测试家庭相关新接口；API 响应包含 `isVirtual` 字段；`GET /api/users/:familyMemberId` 家庭成员可互查

---

### 第4步：JWT 改造 + 任务隔离（核心，0.5天）

> ⚠️ **本步骤是后续所有家庭鉴权的基础**，必须在任务隔离接口生效前完成。

**JWT 改造（先做）**：
- [ ] **⚠️ 修改 `backend/middleware/auth.js`**：`req.user` 新增 `familyId: payload.familyId`（从 token 中提取）；不修改则所有家庭鉴权中的 `req.user.familyId` 运行时为 `undefined`
- [ ] **⚠️ 修改 JWT 签发逻辑**（在 `authController` 或统一的 `generateToken` 工具中）：签发 token 时 payload 带入 `familyId`；影响三处：`login`、`POST /api/families`（创建后）、`POST /api/families/join`（加入后）

**任务隔离（依赖 JWT 改造完成后）**：
- [ ] 修改 `taskController.getTasks`：从 `req.query` 解构 `targetUserId` 并传给 `taskService.getTasksByUser`（当前只传 `{ date, status }`，`targetUserId` 会被丢掉，切换视角后列表仍查登录者自己）
- [ ] 修改 `taskService.getTasksByUser`：支持 `targetUserId` + 同家庭验证
- [ ] 修改 `taskController.getTaskById`：支持 `req.query.targetUserId`，验证同家庭后用 targetUserId 做归属校验（当前固定用 `req.user.userId`，家长查孩子任务详情会返回404）
- [ ] 修改 `taskController.countTasks`：支持 `req.query.targetUserId`，验证同家庭后统计目标用户任务数（当前固定用 `req.user.userId`，切换视角后统计数据仍是家长自己的）
- [ ] 修改 `taskController.createTask`：支持 `req.body.targetUserId`（家长代孩子创建，需同家庭验证）；计算出合法 `userId` 后，**显式从 taskData 中删除 `userId` 和 `targetUserId`**（`delete taskData.userId; delete taskData.targetUserId;`），再传入 service，防止客户端通过 body 字段覆盖归属人
- [ ] **验证**：curl 测试所有任务接口；家长可查孩子任务；孩子不能查家长任务；join 后返回的新 token 解码可见 `familyId` 和正确 `role`；`req.user.familyId` 有值（不为 undefined）

---

### 第5步（前端）：前端基础设施（0.5天）

- [ ] `http-client.js` 新增 `patch` 方法
- [ ] `api-config.js` 新增所有新端点（FAMILIES 系列 + USER_NICKNAME）
- [ ] 根目录 `app.json` 的 `packageManage` subPackages 中新增 `family-settings` 页面
- [ ] `models/user.js` 构造函数新增字段：`isVirtual`（`data.isVirtual || false`）、`familyId`（`data.familyId || null`）、`createdByUserId`（`data.createdByUserId || null`）
- [ ] **⚠️ `utils/token-manager.js`**：`getUserInfo()` 返回值新增 `familyId: payload.familyId || null`；新增 `static getFamilyId()` 方法（与现有 `getUserInfo()` 模式一致），供 `UserService.initialize()` 使用
- [ ] **验证**：`HttpClient.patch` 可正常发出 PATCH 请求；`new User({ isVirtual: true })` 能正确取到字段；`TokenManager.getFamilyId()` 在 join 后返回正确 familyId

---

### 第6步（前端）：UserService 和 TaskService 改造（1天）

**⚠️ 0. 数据修复（优先级最高，第一个实施）**

多孩子家庭中，以下三处代码使用 `_getChildUserId()` 取第一个孩子，会把积分加/扣到错误的孩子身上，是严重的数据损坏 bug，必须首先修复：

- [ ] `task-service.js` `completeTask`（`:851`）：`_getChildUserId()` → `task.userId`
- [ ] `task-service.js` `resetTask`（`:1012`）：`_getChildUserId()` → `task.userId`
- [ ] `task-service.js` `handleRequiredTaskPenalty`（`:1218`）：`_getChildUserId()` → `task.userId`

**验证**：由于 M6 家庭视角下完成/重置 UI 禁用，星星归属修复通过以下方式验证：①**单元测试**：直接调用 `completeTask`/`resetTask` 服务方法（绕过 UI），验证 `task.userId` 被正确用于星星归属（非 `_getChildUserId()` 返回的第一个孩子）；②**集成测试**：首页启动触发 `handleRequiredTaskPenalty`，验证必做任务惩罚扣星归属于 `task.userId` 对应的孩子。

---

- [ ] `user-service.js`：新增 `loginUser`/`loginUserId` 属性，**赋值时机**：`initialize()` 中调用 `GET /api/auth/current`（已有接口）获取 JWT 对应用户后赋值，此后不随 `switchToUser` 变化
- [ ] `user-service.js`：新增 `getLoginUserId()` 方法
- [ ] `user-service.js`：`initialize()` 恢复会话时，若 `loginUser.role === 'child' && !loginUser.isVirtual`，忽略 savedUserId 并强制 `currentUser = loginUser`（覆盖本地存储）
- [ ] `user-service.js`：新增家庭方法；实现 `loadFamilyMembers`（**clear + 重建模式**，确保软删除成员不残留）；改造 `getAllUsers`（inactive 过滤 + loginUser 角色过滤）
- [ ] `task-service.js`：云端读取**仅在 `currentUserId !== loginUserId` 时**携带 `targetUserId`；读取成功后将结果**回填本地 repo**（`taskRepository.saveAll`），确保 `completeTask`/`resetTask` 能通过 `taskRepository.getById()` 找到任务
- [ ] `task-service.js`：`_syncTaskToCloud` 在 `currentUserId !== loginUserId` 时携带 `targetUserId`
- [ ] **`task-service.js` 三处辅助扫描加 `loginUserId` 过滤**（`this.userService?.getLoginUserId()`，只处理 `task.userId === loginUserId`）：
  - `checkTasksStatus()`（`:1153`）：防止 saveAll 回填的孩子任务被家长设备的全局惩罚扫描误处理
  - `checkUpcomingTasks()`（`:1442`）：改为接受 `userId` 参数，`index.js` 调用时传 `currentUserId`（跟随视角，与任务列表一致）
  - `getTaskStatistics()`（首页统计真实链路：`index.js:791` → `task-service.js:1569`）：加可选 `userId` 参数，`index.js` 调用时传 `currentUserId`；**⚠️ 不改 `getAllTasks()`**，避免影响搜索/热力图/星星记录等复用场景
- [ ] `task-service.js` **⚠️ 数据修复**：`completeTask`（`:851`）中给孩子加星时，将 `_getChildUserId()` 替换为 `task.userId`；`resetTask`（`:1012`）中扣星时同样替换；`handleRequiredTaskPenalty`（`:1218`）中惩罚扣星时同样替换——三处统一改用 `task.userId`，防止多孩子家庭积分串账
- [ ] `star-service.js` **⚠️ 数据修复**：星星过期保护链路（`:1222/1258`）当前依赖 `getChildUserId()` 确定操作对象，在多孩子家庭下将过期保护打到错误孩子账户；修复方案：**改为只扫并处理 `loginUserId`（设备登录者）自己的星星**，不再通过 `getChildUserId()` 跨用户操作；与 `checkTasksStatus()` 的 loginUserId 过滤模式保持一致
- [ ] 在 `user-service.js` 的 `initialize()` 中调用 `loadFamilyMembers`
- [ ] **`user-service.js` `refreshUserCache()`（`:482`）和 `validateService()`（`:533`）处理**：这两条路径当前依赖 `GET /api/users` 仅返回当前登录用户，M6 后调用会静默清空家庭缓存。处理方案：**迁移到 `GET /api/auth/current` + `loadFamilyMembers()` 模式**；若短期内无法迁移，至少在方法体开头加守卫：`if (this.loginUser?.familyId) { logger.warn(...); return; }` 防止清空家庭缓存
- [ ] **调整旧单测**：`test/services/user-service.test.js` 中固化"同时存在 parent 和 child 才算成功"的断言（`user-service.js:validateService` 测试5）会在场景B孩子设备上误报，需改为"缓存包含 loginUser 即可"；`validateService()` 本身的测试5也需同步放宽条件
- [ ] **验证**：无家庭用户：任务读取行为不变（不传 targetUserId）；切换视角后：任务读取返回对应用户的云端数据；旧单测无假失败

---

### 第7步（前端）：user-switcher 组件改造（1天）


- [ ] `user-switcher.wxml`：删除按钮改为仅对 `item.isVirtual === true` 显示
- [ ] `user-switcher.wxml`：**整块删除**现有"添加用户对话框"（`showAddUserDialog` 变量控制的约45行 WXML + 对应 WXSS），改为跳转 family-settings 后不再需要此弹窗
- [ ] `user-switcher.wxml`：新增 PIN 码输入弹窗（`showPINDialog` 控制显示，复用现有 `add-user-dialog` 样式模式）
- [ ] **`user-switcher.js` 新增 `loginUserId` 属性**：在 `properties` 中声明 `loginUserId: { type: String, value: '' }`；由 `index.js` 调用 `UserService.getLoginUserId()` 后通过 `<user-switcher loginUserId="{{loginUserId}}" ...>` 传入；PIN key 作用域（`familySwitchPIN_${loginUserId}`）依赖此字段，不新增则 `this.data.loginUserId` 为空，所有设备共用同一 PIN key，多账号串用
- [ ] `index.js` 在初始化时从 `UserService.getLoginUserId()` 获取值并 `setData({ loginUserId })`
- [ ] `user-switcher.js`：删除确认弹窗文案更新为"确认删除成员？"
- [ ] `user-switcher.js`：`showAddUserDialog` 直接触发现有 `userAdd` 事件（不新增事件，保持 index.wxml 不变）
- [ ] `user-switcher.js`：`handleUserSwitch` 拦截孩子→家长切换，读取本地 PIN 验证；**未设置 PIN 时允许自由切换**（初始态无锁）
- [ ] `user-switcher.js`：实现 `confirmPIN` / `cancelPIN` 方法
- [ ] `user-switcher.js`：新增 `canManageMembers` 属性（`Boolean`，默认 `false`），`properties` 中声明；删除按钮和添加成员入口的可见性判断从 `currentUser.role === 'parent'` 改为 `canManageMembers`
- [ ] `user-switcher.js`/`user-switcher.wxml`：**新增昵称编辑交互**（当前组件无此功能，需显式新增）：
  - `user-switcher.wxml`：在每个成员 item 行尾新增"编辑"图标/文字按钮，`wx:if="{{item.userId === currentUser.userId || canManageMembers}}"`（本人或家长可编辑）
  - `user-switcher.js`：新增 `showEditNickname(e)` 方法，读取 `e.currentTarget.dataset.userId`，弹出 `wx.showModal` 输入框（或内联 input 弹窗）让用户输入新昵称
  - `user-switcher.js`：确认后触发 `nicknameEdit` 事件，payload 为 `{ userId, newNickname }`
  - `pages/index/index.js`：绑定 `bind:nicknameEdit="handleNicknameEdit"`，调用 **`userService.updateNickname(userId, newNickname)`**（遵循 DDD 分层，页面层不直接调后端接口；`UserService.updateNickname` 负责封装 `HttpClient.patch`、错误处理和缓存刷新——**缓存刷新策略：直接更新 `userCache` 中对应成员对象的 `name` 字段**，不重新调用 `loadFamilyMembers()`，避免不必要的网络请求；API 失败时缓存保持原值）
- [ ] `services/reward-service.js`：**新增 `getLastExchangeTimeByUser(userId)` 方法**（独立于原 `getLastExchangeTime(taskId)`，原方法签名和 `index.js:1085` 调用点**不动**，避免 taskId 被误当 userId）；**`calculateNextAvailableReward()` 新增可选 `userId` 参数并透传给内部的 `getAvailableRewards()` 调用**（`reward-service.js:871`，向下兼容）
- [ ] `pages/index/index.js`：`handleUserAdd` 改为跳转 family-settings；`handleUserDelete` 调用新的软删除逻辑；初始化及用户切换后，向 user-switcher 传入 `canManageMembers: loginUser.role === 'parent'` 和 `loginUserId: loginUser.userId`；**切换视角时计算 `isReadonlyView: currentUser.userId !== loginUser.userId` 并 `setData`**；**`loadStarsAndRewards()`（`:1858`）中以下四个调用均显式传入 `loginUserId`**（不传 null）：`getTotalStars(loginUserId)`、`getAvailableRewards(true, false, loginUserId)`（签名：`includeClaimed, includeExamples, userId`）、**`getLastExchangeTimeByUser(loginUserId)`**（新方法，不是原 `getLastExchangeTime`）、`calculateNextAvailableReward(userPoints, loginUserId)`；**`checkRewardUnlock()`（`:1805`）中 `starService.getTotalStars()` 改为 `getTotalStars(loginUserId)`、`rewardService.getAvailableRewards(true)` 改为 `getAvailableRewards(true, false, loginUserId)`**——此函数决定是否弹出奖励达成提示，若不加 userId 作用域则按全量/混合数据触发，与"首页只展示 loginUser 数据"口径冲突
- [ ] `pages/index/index.js` 搜索逻辑（`:1706`）：`getAllTasks()` 结果在**家庭视角（`isReadonlyView = true`）下按 `currentUserId` 过滤**后展示搜索结果（保留搜索入口体验；`getAllTasks()` 自身不加过滤，避免影响热力图/星星记录等复用场景）
- [ ] `components/index-task-item/index-task-item.js`：**`properties` 新增 `readonly: { type: Boolean, value: false }`**；`onCheckboxTap`（`:145`）方法开头加 `if (this.data.readonly) return;`
- [ ] `components/index-task-item/index-task-item.wxml`：勾选/重置按钮加 `wx:if="{{!readonly}}"` 或 `class="{{readonly ? 'task-btn-disabled' : ''}}"` 视觉反馈
- [ ] `pages/index/index.wxml`：**两处** `<index-task-item>` 均须传入 `readonly="{{isReadonlyView}}"`：`:135`（主任务列表）和 `:255`（搜索结果列表）——漏掉任意一处，家庭视角下仍可从该列表完成/重置任务
- [ ] `pages/index/index.wxml`：`<user-switcher>` 新增 `canManageMembers="{{canManageMembers}}"` 和 `loginUserId="{{loginUserId}}"` 属性传递
- [ ] `pages/index/index.js` 及相关导航入口：**家庭视角（`isReadonlyView = true`）下禁用以下所有入口**——这些页面/功能内部服务读取无 userId 作用域，进入/执行会显示聚合/混合数据：
  - 奖励页（`rewards.js:264/274/340`）
  - 星星记录页（内部读取无 userId 作用域）
  - 消息页（路由硬编码 parent/child 对；**`index.js:700` 消息预览加载也需停止**——消息预览不是导航入口，是 `index.js` 主动调用的加载逻辑，不能靠 `wx:if` 禁用入口解决；需在 `loadData`/`handleUserSwitch` 等调用点加 `if (this.data.isReadonlyView) return;` 守卫跳过消息预览加载）
  - **分析页**（`analytics-service.js:41/520` 读全量任务，`index.js:1637` 是入口）
  - **搜索功能**（`index.js:1706` 调用 `getAllTasks()` 无用户过滤）——推荐方案：在 `index.js` 搜索逻辑中，`getAllTasks()` 结果按 `currentUserId` 过滤后再展示（比禁用搜索入口体验更好，改动范围最小，详见第7步实施 checkbox）
  - 禁用方式：入口按钮/菜单项加 `wx:if="{{!isReadonlyView}}"` 或导航前判断 `currentUser.userId === loginUser.userId`
- [ ] **验证**：**家长切到孩子视角后，删除按钮和添加入口仍然可见**（关键回归）；真实成员无删除按钮；虚拟成员可删除；未设 PIN 时孩子可自由切回家长；设置 PIN 后孩子切回家长需输 PIN；PIN 错误拒绝切换；同设备两个家长账号 PIN 互不干扰

---

### 第8步（前端）：家庭设置页面（1.5天）

- [ ] 创建四个文件（js/wxml/wxss/json）
- [ ] 实现**两种状态** UI（未加入 / 家长视角）——本页 parent-only，无孩子视角状态
- [ ] 邀请码复制、刷新功能
- [ ] 创建虚拟成员表单（**仅名字**，角色固定为孩子，不提供角色选择）
- [ ] 昵称编辑功能
- [ ] 家长视角新增"切换密码"设置入口（设置/修改 PIN，存本地）
- [ ] **创建家庭流程**：调用 `POST /api/families` 后，**立即用响应体中的新 `token` 替换本地 token**（`TokenManager.setToken(newToken)`），再重新加载用户信息（`UserService.initialize()`）
- [ ] **加入家庭流程**：调用 `POST /api/families/join` 后，**同上**（`TokenManager.setToken(newToken)` + `UserService.initialize()`）
- [ ] `family-settings.js`：`onLoad`/`onShow` 开头加权限守卫（`loginUser.role !== 'parent'` 时直接 `wx.redirectTo` 回首页）——`permission-utils` 只在首页拦截，孩子仍可通过直达路径进入，页面自身必须防御
- [ ] **验证**：**两种状态**正确切换（未加入/家长视角，无孩子视角）；所有功能流程完整；PIN 设置后生效；创建/加入后 token 均已刷新（JWT payload 可见正确 role 和 familyId）；真实孩子昵称修改路径为 **user-switcher 组件**（点击自己头像触发编辑弹窗），不经过本页；**孩子账号直达本页 URL 时被重定向回首页**

---

### 第9步：集成测试（0.5天）

- [ ] 场景A完整流程：创建家庭 → 创建虚拟孩子 → 切换孩子视角 → 任务显示孩子数据
- [ ] 场景A写入链路：切换到孩子视角 → 创建任务 → 后端任务 user_id = 孩子 userId
- [ ] 场景A PIN 流程：家长设置 PIN → 切到孩子视角 → 孩子点切回家长 → 输 PIN → 验证通过切换成功
- [ ] 场景A PIN 错误：输错 PIN → 切换被拒绝
- [ ] 场景B完整流程：家长创建家庭 → 孩子输入邀请码加入（role=child）→ **验证 join 返回新 token 且 role=child** → 家长切换到孩子视角 → 任务显示孩子数据
- [ ] 场景B孩子设备：孩子手机登录后 user-switcher 只显示自己，无切换入口
- [ ] 邀请码一次性：用过的码再次使用返回失败
- [ ] 数据隔离：不同家庭的任务互不可见
- [ ] 无家庭用户的现有功能不受影响

---

## 测试方案

### 单元测试（后端 familyService）

| 测试项 | 预期结果 |
|--------|---------|
| 创建家庭 | 返回含邀请码的家庭对象，用户 family_id 更新 |
| 加入家庭（有效码，首次）| 成功，invite_code_used_at 写入 |
| 加入家庭（已使用码）| 400 `FAMILY_INVITE_CODE_INVALID` |
| 加入家庭（过期码）| 400 `FAMILY_INVITE_CODE_EXPIRED` |
| 创建虚拟成员（家长调用，不传 role） | is_virtual=true，role=child（强制），openid=NULL，family_id 正确 |
| **创建虚拟成员（传 role=parent）** | **400（服务端拒绝虚拟家长创建）** |
| **创建虚拟成员（孩子调用）** | **403 `FAMILY_PARENT_REQUIRED`** |
| 软删除虚拟成员（家长调用） | status='inactive'，成员列表不再返回 |
| **软删除虚拟成员（孩子调用）** | **403 `FAMILY_PARENT_REQUIRED`** |
| **软删除跨家庭成员** | **403** |
| 删除真实成员 | 403 `FAMILY_VIRTUAL_MEMBER_ONLY` |
| 加入家庭（邀请码绑定 child）后返回新 token | 新 token payload role=child，familyId 已更新 |
| **加入家庭（邀请码绑定 parent，第二位家长）后返回新 token** | **新 token payload role=parent，familyId 已更新** |
| **请求体携带 role=parent + 邀请码绑定 child** | **role 取邀请码存储值（child），请求体 role 被忽略** |
| **role=parent 加入后不出现在 user-switcher** | **getAllUsers() 不返回同家庭其他家长** |
| 修改自己昵称 | 任何角色成功 |
| 家长修改虚拟孩子昵称 | 成功 |
| 家长修改真实孩子昵称 | 403 |
| targetUserId 同家庭 | 返回目标用户任务 |
| targetUserId 跨家庭 | 403 `FAMILY_MEMBER_ACCESS_DENIED` |
| 孩子传 targetUserId | 403 |
| **POST /api/tasks body 携带 userId（恶意覆盖）** | **任务归属仍为 JWT 用户或合法 targetUserId，body.userId 被忽略** |

### 集成测试

- [ ] 场景A：创建家庭 → 虚拟孩子 → 切换视角 → 读取孩子云端任务 ✅
- [ ] 场景A写入：切换孩子视角 → 创建任务 → 任务归属孩子 ✅
- [ ] 场景A PIN：设置 PIN → 孩子切回家长 → PIN 验证 ✅
- [ ] 场景B（孩子加入）：孩子输入邀请码 role=child 加入 → join 返回新 token → role=child → 家长切换到孩子视角 → 读取孩子云端任务 ✅
- [ ] **场景A（第二家长加入）**：妈妈输入邀请码 role=parent 加入 → join 返回新 token → role=parent，familyId 已更新 → 妈妈手机 user-switcher 不显示爸爸，只显示家庭孩子 ✅
- [ ] 场景B孩子设备：getAllUsers() 只返回自己 ✅
- [ ] 场景B孩子设备启动恢复：本地 savedUserId 为他人（如家长）时，启动后 currentUser 强制等于 loginUser，本地 currentUserId 被覆盖为 loginUser.userId ✅
- [ ] 无家庭用户：任务读取/创建功能正常（行为不变）
- [ ] 现有测试套件：通过率 ≥ 99%

| 单元测试（PIN 相关）| 预期结果 |
|--------|---------|
| 孩子切换到家长，已设 PIN | 弹 PIN 弹窗，拒绝直接切换 |
| PIN 输入正确 | 切换成功，弹窗关闭 |
| PIN 输入错误 | 弹 toast 报错，弹窗保留 |
| 孩子切换到家长，未设 PIN | 允许自由切换（已知产品取舍，见已知限制）|
| 家长切换到孩子 | 无需 PIN，直接切换 |
| **家长切换到其他家长** | **switchToUser 防线拒绝，返回失败** |

| 单元测试（UserService 初始化）| 预期结果 |
|--------|---------|
| 孩子独立设备启动，本地 savedUserId 为他人（如家长 userId）| `currentUser` 强制等于 `loginUser`，本地 `currentUserId` 被覆盖为 `loginUser.userId` |
| 孩子独立设备启动，本地无 savedUserId | `currentUser` 等于 `loginUser`，正常初始化 |
| 家长设备启动，本地 savedUserId 为孩子 userId | 正常恢复为孩子视角（家长设备不受限制）|

### M6 验收标准（核心场景）

> 以下为本里程碑的最终验收口径，全部通过才算完成。

**场景A（共享设备）**：
- [ ] 家长创建家庭并生成带角色的邀请码
- [ ] 家长创建虚拟孩子后，user-switcher 显示孩子
- [ ] 家长切换到孩子视角后，任务列表正确展示孩子的任务（云端数据）
- [ ] 家长视角下创建任务归属孩子（云端落库 user_id 正确）
- [ ] 家长视角下完成/重置按钮**不可操作**（UI 禁用）
- [ ] 家长切到孩子视角后，创建任务入口、family-settings 入口仍然可见（loginUser 权限不变）
- [ ] 家长视角下 user-switcher 删除按钮仅虚拟成员可见，真实成员无删除按钮
- [ ] 孩子切回家长：未设 PIN 时自由切换；设置 PIN 后需输入正确 PIN

**场景B（孩子独立设备）**：
- [ ] 孩子通过邀请码以 child 角色加入家庭，返回新 JWT（role=child）
- [ ] 孩子设备 user-switcher 只显示孩子自己，不显示家长或其他家庭成员
- [ ] 孩子设备启动时，即使本地残留其他人的 savedUserId，也始终以 loginUser 作为 currentUser

**数据隔离**：
- [ ] 家长查看孩子任务需同家庭（跨家庭 403）
- [ ] 孩子不能查看家长任务（403）
- [ ] 创建任务无法通过 body 注入 userId（服务端显式删除）

**多孩子不串账**：
- [ ] `completeTask`/`resetTask` 单元测试：传入 `task.userId = child2Id` 的任务，验证星星加/扣到 child2 而非 child1（M6 家庭视角下完成/重置 UI 禁用，通过单元测试验证归属逻辑）
- [ ] 必做任务惩罚 `handleRequiredTaskPenalty` 扣星归属正确（可通过应用启动的自动扫描触发验证）

---

### 已知本期不覆盖的限制（供测试参考，不作为本期 bug）

- **星星/奖励展示不跟随视角切换（首页）**：切换到孩子视角时，首页星星/奖励卡片仍展示 `loginUser` 自己的积分和奖励（`index.js` 显式传 `loginUserId`）；孩子视角下的独立积分展示将在后续版本实现
- **奖励页、星星记录页、消息页在家庭视角下禁止进入**：这三个页面内部服务读取均无 userId 作用域，家庭视角（`currentUser !== loginUser`）下进入会显示聚合/错误数据；M6 统一在入口处禁用（`isReadonlyView = true` 时不显示/不可点击入口）；`loginUser` 自己的视角下正常访问；完整多用户支持留后续版本
- 多孩子家庭中，消息通知功能仍取第一个孩子
- **家庭视角（切换后）完成/重置禁用**：`currentUser !== loginUser` 时完成/重置按钮在 UI 层禁用，不允许操作——因为无法提供持久化保证（云端优先读取会立即覆盖）；`loginUser` 自己的任务正常可操作；里程碑07补齐云端 PATCH 接口后解除禁用
  - **用户体验影响**：家长切换到孩子视角后无法帮孩子打卡，仅支持查看和创建。孩子需在自己的设备（场景B）或家长切回自己视角后（场景A）完成任务
  - **建议 App 内引导文案**：在家庭视角下，完成/重置按钮置灰并可添加提示文字，如"请切换回孩子身份完成任务"（场景B）或"孩子在家长手机上操作任务，请切换回孩子视角"（场景A）；具体文案由 UI 设计确定，不在本里程碑范围强制实现
- **重复/周期任务后续实例不上云**：云端同步只覆盖首个 `savedTask`，后续重复实例在本地生成，跨设备不可见——这是现有重复任务功能的存量限制，不在本里程碑修复范围内
- **场景B家庭视角下任务操作范围**：家长可查看和创建孩子任务；完成/重置在 M6 中 UI 禁用（见"不包含"章节）；里程碑07解除禁用后将同时评估只读保护需求
- **编辑/删除孩子任务不做家庭场景适配**：`updateTask`/`deleteTask` 为纯本地操作，切换到孩子视角后编辑/删除只影响本地存储，不上云、不鉴权、不跨设备——这是有意的范围限定，不作为 M6 bug 验收
- **共享设备（场景A）PIN 未设置时孩子可自由切回家长视角**：这是有意的产品取舍——避免家长首次切到孩子视角后、尚未设置 PIN 时设备陷入死锁（孩子无法切回，家长也操作不了）。验收口径：PIN 未设置时不算缺陷；家长主动在 family-settings 设置 PIN 后，孩子切回家长必须输 PIN

**多设备数据一致性（已知风险，M7 解决）**：
- 家长在设备A创建任务归属孩子后，孩子在设备B重新打开 App 才会刷新看到该任务（无实时推送）
- 家长在设备A添加/删除虚拟成员，家长在设备B的 user-switcher 不会实时更新（需重新进入 App）
- 家长在设备A视角禁用了完成/重置，任务状态变更后孩子在设备B无法实时感知
- 以上均属跨设备状态同步问题，根本原因是后端缺少任务状态更新接口（无 PUT/PATCH /api/tasks/:id）和实时推送机制；将在里程碑07双写策略中统一解决

---

## 风险评估

### 技术风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| `openid` 改为可空后影响唯一索引 | 中 | 低 | MySQL NULL 不参与 UNIQUE 约束（已验证原理）；应用层校验位置：`backend/services/userService.js` 的 `createUser` 方法中，当 `is_virtual=false` 时须校验 openid 不为空且不与现有真实用户重复（`SELECT COUNT(*) WHERE openid = ? AND is_virtual = false`） |
| `ALTER TABLE` 影响存量数据 | 高 | 低 | 存量用户 openid 均有值，新增字段默认值安全；先在测试环境验证 |
| TaskService 改造引入回归 | 高 | 中 | 无家庭用户不传 targetUserId，后端行为不变；加充分的回归测试 |
| user-switcher 删除按钮逻辑遗漏 | 中 | 中 | 严格测试真实成员无删除按钮场景 |
| 加入时角色越权（拿到邀请码自声明 parent） | 高 | 中 | 角色绑定在邀请码记录（`invite_code_role`），由现有家长生成时指定；join 接口完全忽略请求体的 `role` 字段，只信邀请码存储值 |
| switchToUser 被意外调用绕过 UI 限制 | 中 | 低 | service 层双重防线（孩子设备禁止切换；家长不可切换到其他家长） |

### 业务风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| PIN 码仅存本地，换设备后失效 | 低 | 中 | 已知限制，文档说明；首次使用提示家长在新设备重新设置 |
| 家长忘记 PIN 码 | 中 | 低 | family-settings 提供重置入口（清除旧 PIN 重新设置）|
| 家长误删虚拟孩子档案 | 高 | 低 | 软删除保障 DB 完整性；删除前确认弹窗；历史任务物理保留但无用户侧入口恢复（有意设计，与"完全透明"一致） |
| **家庭视角下完成/重置禁用影响用户体验** | 中 | 高（M6 上线即必现）| M6 已知限制，将在里程碑07补齐 PATCH 接口后解除；用户侧通过置灰按钮和引导文案（见已知限制章节）告知正确操作路径 |

---

## 替代方案

### 方案A：当前方案（切换身份 + 虚拟成员）

**优势**：与现有 user-switcher 模型完全一致；TaskService 改动集中；

**劣势**：孩子视角下家长 JWT 仍执行操作，有安全简化（已接受）

---

### 方案B：代理查看（家长保持身份，所有接口传 targetUserId）

**劣势**：需要改造所有读取链路（task/star/reward/message 全部）；改动面极大

**未选择原因**：改动量是方案A的 3-4 倍，且与现有 user-switcher 模型不一致

---

### 方案C：为孩子模式增加 PIN 码保护（本期已采纳）

**已选择**：本里程碑实现 PIN 保护，预计增加 1 天工期（已并入第6步、第7步）

---

## 审核记录

### 审核要点

- [ ] 核心架构决策（切换身份模型）是否认可
- [ ] 任务读取链路改造是否完整（targetUserId 传递）
- [ ] user-switcher 改造范围是否合理
- [ ] 多孩子兼容范围的边界声明是否接受
- [ ] PIN 码保护设计（本地存储、触发条件、family-settings 设置入口）是否认可
- [ ] 实施步骤是否可执行（app.json 路径、PATCH 方法等）

### 审核意见

**审核者**：项目维护者
**审核日期**：待填写
**审核结果**：🔴 待审核

---

## 附录

### 参考文档

- [里程碑-05B 设计文档](./milestone-05b-task-management.md)
- [云端存储迁移总体规划](./cloud-storage-migration.md)
- [架构文档](../architecture/architecture.md)

### 后续里程碑影响

| 里程碑 | 与本里程碑的关系 |
|--------|---------------|
| 里程碑-07（双写策略）| 依赖 family_id 数据隔离 |
| 里程碑-09（星星积分）| 解决多孩子兼容问题（`getChildUserId` 等）|
| 里程碑-10（消息通知）| 解决多孩子消息路由（`message-service.js` 硬编码）|

---

**最后更新**：2026-03-12（v40）
**维护者**：项目维护团队
