# M6 补充设计：家长角色定位澄清（v3）

> **设计状态**：✅ 实施完成
> **创建日期**：2026-03-15
> **更新日期**：2026-03-15（v3：收窄 M6 验收范围、明确本地操作 UX 约束、显式说明家长打卡业务规则）
> **关联文档**：`docs/design/milestone-06-family-account.md`
> **设计者**：Claude Code

---

## 背景与问题

M6 实现完成后，实测发现产品行为与真实使用场景不符：

**当前行为（有问题的）**：
- 家长视角 = 家长自己的任务列表（通常为空，因为家长不用这个 App 记录自己的事）
- 家长需要"切换成孩子身份"才能看到孩子的任务
- 家长在孩子视角下，`isReadonlyView = true`，任务勾选/创建/编辑/删除全部被禁用

**用户明确的产品定位**：
- 家长使用这个 App **专门为孩子管理任务**，家长本身不需要有任务
- 家长视角：可以直接看到孩子的任务列表，可以**创建任务**（云端同步）、在当前设备**编辑/删除/打卡**（本地生效，M7 前不跨设备同步）
- 孩子视角：只能看自己的任务，**可以打卡（完成/重置）**，不能创建/编辑/删除

> **M6 验收范围（明确）**：查看孩子任务 + 创建任务（云端同步）+ 当前设备打卡/编辑/删除（本地生效）。跨设备数据一致性在 M7 解决。

---

## 核心设计变更

### 变更 1：任务项 `readonly` 永远为 false（两种角色都能打卡）

**问题**：`isReadonlyView` 目前同时控制：
1. 任务项的勾选（完成/重置）— `index-task-item.js:153` 中 `readonly` 为 true 时拦截所有点击
2. 入口守卫（消息、奖励管理、分析、搜索等）— `index.js` 多处判断

这两件事的语义完全不同，不能共用一个标志。

**业务规则（显式声明）**：
- 家长**可以**在孩子视角替孩子打卡（完成/重置）。这代表家长作为监护人确认任务完成状态，是合理的监管行为。打卡结果当前设备本地生效，M7 前不跨设备同步（已知限制）。
- 孩子**可以**打卡自己的任务。
- 孩子**不能**创建/编辑/删除任务，由 `FEATURE_PERMISSIONS` 角色配置控制。

**新设计**：

| 能力 | 家长 | 孩子 | 控制方式 |
|------|------|------|---------|
| 任务打卡（完成/重置） | ✅ 当前设备本地生效 | ✅ 当前设备本地生效 | `index-task-item` `readonly` 永远为 `false` |
| 创建任务 | ✅ 云端同步 | ❌ | `FEATURE_PERMISSIONS` 角色配置（已有，不变）|
| 编辑/删除任务 | ✅ 当前设备本地生效 | ❌ | `FEATURE_PERMISSIONS` 角色配置（已有，不变）|

**实施**：
- `pages/index/index.wxml` 两处 `<index-task-item>` 的 `readonly="{{isReadonlyView}}"` 改为 `readonly="{{false}}"`
- `isReadonlyView` 这个 `data` 字段只用于入口守卫（见变更 3），不再影响任务项

---

### 变更 2：本地操作的 UX 约束（已知限制，统一说明）

**M6 限制范围**（后端无 PATCH/PUT/DELETE，本地写入不同步云端）：

| 操作 | 云端同步 | 用户可感知的限制 |
|------|---------|----------------|
| 创建任务 | ✅ 同步 | 无限制 |
| 查看任务 | ✅ 云端读取 | 无限制 |
| 完成/重置任务 | ❌ 本地生效 | 换设备后状态不同步（M7 解决）|
| 编辑任务内容 | ❌ 本地生效 | 换设备或重新拉取云端后被覆盖（M7 解决）|
| 删除任务 | ❌ 本地生效 | 孩子设备重启后任务可能重新出现（M7 解决）|

**UX 处理原则**（M6 已知限制的统一方案）：
- 本期不做操作拦截，允许用户操作但标注这是"本地操作"
- 已有 Toast 提醒"完成/重置"的跨设备限制（M6 现有实现保留）
- 编辑/删除的跨设备限制不做额外 Toast（操作频率低，避免过度打扰）
- M7 双写策略上线后以上限制全部消除，本 UX 约束随之废弃

---

### 变更 3：入口守卫重新定义（家长与孩子分开处理）

M6 原有 `isReadonlyView` 守卫的逻辑是"任何切换视角都禁用入口"。新设计要求：
- 家长：**允许**进入大部分入口（因为显示的是 loginUser 自己的数据）
- 孩子：**保持**现有限制（孩子进入奖励管理、分析等页面，读取仍无 userId 过滤）

具体入口：

| 入口 | 家长策略 | 孩子策略 | 原因 |
|------|---------|---------|------|
| 奖励管理页 | ✅ 放开 | ❌ 保持禁用 | 奖励管理是家长专属功能（`FEATURE_PERMISSIONS` 已配置），家长进入看自己的奖励池 |
| 消息页 | ✅ 放开 | ❌ 保持限制 | 消息路由以 loginUser 为准，家长进入看自己的消息 |
| 搜索功能 | ✅ 放开（需补过滤） | ❌ 保持禁用 | 详见下文 |
| 分析页 | ❌ 保持禁用 | ❌ 保持禁用 | 分析页 `getAllTasks()` 无 userId 过滤，两种角色目前都不可用，留后续版本 |

**搜索功能补充方案**（家长放开的前提）：
- `index.js:1742` 调用 `taskService.getAllTasks()` 后，按 `currentUser.id` 过滤结果再显示
- 家长搜索时，看到的是**当前选中孩子**的任务
- 代码变更：`taskService.getAllTasks()` 后加 `filter(t => !t.userId || t.userId === currentUserId)`

**入口守卫新条件**：
- 原：`if (this.data.isReadonlyView) { ... }`
- 新：`if (this.data.loginUserRole === 'child') { ... }`（或直接用 `loginUser.role`）

---

### 变更 4：家长首页默认显示第一个孩子的任务

**行为**：
- 家长打开 App，若家庭中有孩子 → 首页默认显示**第一个孩子**的任务
- 若家庭中暂无孩子 → 任务列表区域显示"请先前往家庭设置添加孩子"

**会话恢复优先级**（采纳 Codex 建议）：
```
1. 读取本地存储的 savedCurrentUserId
2. 如果 savedCurrentUserId 存在且该用户在家庭成员缓存中 → 恢复上次选择（优先）
3. 如果不存在或已失效 → 选第一个孩子（首次启动 / 缓存清除后的默认行为）
```

这样：
- 家长主动切到"大宝"后，下次打开 App 仍显示大宝的任务（会话恢复优先）
- 首次安装或清除缓存后，自动选第一个孩子（无需手动切换）

**实施位置**：
- `services/user-service.js` `initialize()` 方法，在 `_restoreSession()` 之后执行：
  ```
  if (loginUser.role === 'parent') {
    const children = getAllUsers().filter(u => u.role === 'child');
    if (savedCurrentUserId 有效) → 使用 savedCurrentUserId
    else if (children.length > 0) → currentUser = children[0]
    else → currentUser = loginUser（无孩子时展示家长视图）
  }
  ```

---

### 变更 5：用户切换器语义调整（视觉）

家长视角下，切换器的标题文字：
- "切换到" → "选择孩子"（家长选择要管理的孩子）

**实施**：`user-switcher.wxml` 标题区域按 `canManageMembers` 条件渲染。

---

## 不变的内容

| 项目 | 说明 |
|------|------|
| 后端 API | 无新增接口（任务编辑/删除/状态同步的 API 是 M7 的工作）|
| 任务创建归属 | 家长切到孩子视角创建任务 → `targetUserId` 写入正确（已实现）|
| 角色权限配置 | `FEATURE_PERMISSIONS` 里孩子不能创建/编辑/删除，保持不变 |
| 家庭设置入口 | 家长专属，不变 |
| PIN 保护 | 孩子独立设备切回家长视角需 PIN，不变 |
| 星星/奖励卡片 | 始终展示 loginUser 自己的数据，不变 |

---

## 代码变更清单

### `pages/index/index.wxml`
- [ ] 两处 `<index-task-item readonly="{{isReadonlyView}}">` 改为 `readonly="{{false}}"`

### `pages/index/index.js`
- [ ] `isReadonlyView` 计算改为：`loginUser.role === 'child'`（第 2568、2682 行）
- [ ] 入口守卫条件：`if (this.data.isReadonlyView)` 改为检查 `loginUser.role === 'child'`
- [ ] 搜索结果：`taskService.getAllTasks()` 后按 `currentUser.id` 过滤（第 1742 行）
- [ ] 当家长无孩子成员时，任务区域显示引导空状态

### `services/user-service.js`
- [ ] `initialize()` 末段：按"会话恢复 → 默认选第一孩子"优先级设置 `currentUser`

### `components/user-switcher/user-switcher.wxml`
- [ ] "切换到"标题按 `canManageMembers` 条件改为"选择孩子"

---

## 风险评估

| 风险 | 等级 | 说明 |
|------|------|------|
| 本地操作（编辑/删除/打卡）云端不同步 | 中 | M6 已知限制，M7 统一解决。不影响 M6 核心验收（查看 + 创建是云端同步的）|
| 家长打卡替代孩子的责任归属 | 低 | 业务规则已显式声明：家长打卡代表监管确认，积分记录仍归属孩子账户 |
| isReadonlyView 多处引用已调整 | ✅ 已解决 | 全部改为 `loginUser.role === 'child'` |
| 搜索过滤已实现 | ✅ 已解决 | `performSearch` 按 `currentUser.id` 过滤 |
| 分析页留后续 | 低 | 对家长/孩子均不影响使用（分析页不是核心路径）|

---

## 工期估算

**预计工时**：半天
- `readonly` 从任务项移除 + `isReadonlyView` 守卫调整：2 小时
- `user-service.js` 初始化逻辑：1 小时
- 搜索过滤 + 用户切换器文案：1 小时

---

## M6 验收标准（最终）

以下为 M6 补充设计的验收口径，全部满足即通过：

| 验收项 | 判断依据 |
|--------|---------|
| 家长首次启动默认显示第一个孩子的任务 | `_restoreSession()` 无存档时选第一个孩子 |
| 家长切换孩子后任务列表正确切换 | API 携带 `targetUserId` |
| 家长可以为孩子创建任务且云端持久化 | `_syncTaskToCloud` 携带 `targetUserId`，后端写入正确用户 |
| 孩子设备启动只看自己的任务 | `loginUser.role=child` → `isReadonlyView=true` |
| 孩子不能创建/编辑/删除任务 | `FEATURE_PERMISSIONS` 角色配置拦截 |
| 家长/孩子均可打卡（完成/重置） | `readonly="{{false}}"` |
| 家长搜索只显示当前孩子的任务 | `getAllTasks()` 后按 `currentUser.id` 过滤 |
| 家长无孩子时首页显示引导空态 | `currentUser.role === 'parent'` 判断 |
| 用户切换器家长侧显示"选择孩子" | `canManageMembers` 条件渲染 |

**不在 M6 验收范围内**（已知限制，M7 解决）：
- 编辑/删除/打卡的跨设备同步
- 分析页按孩子视角过滤
