# M17 首页日期导航升级

> **设计状态**：🔴 待审核
> **创建日期**：2026-04-02
> **设计者**：Claude Code
> **审核者**：项目维护者
> **预计工期**：1天

---

## 📋 目录

- [需求分析](#需求分析)
- [技术方案](#技术方案)
- [代码结构](#代码结构)
- [实施步骤](#实施步骤)
- [测试方案](#测试方案)
- [风险评估](#风险评估)
- [替代方案](#替代方案)
- [审核记录](#审核记录)
- [附录](#附录)

---

## 需求分析

### 功能描述

升级首页日期导航栏，从当前的"往前6天+今天"改为自然周视图（周一到周日），当日自动高亮定位。用户可以查看本周所有天的任务，过去的日期允许补打卡，未来的日期只读查看。支持往前翻一周查看历史，但限制最多往前翻一周。

### 业务价值

- [x] 用户价值：孩子可以看到整周任务全貌，补打卡更直观，培养周计划感
- [x] 技术价值：日期导航逻辑更规范，只读控制为后续功能扩展打基础
- [x] 业务价值：自然周视图符合家长和孩子的认知习惯，降低使用门槛

### 功能范围

**包含**：
- ✅ 自然周排列（周一到周日），当日自动高亮显示"今天"
- ✅ 过去日期可查看+可补打卡（完成任务），补打卡获得的星星以实际完成时间计算
- ✅ 未来日期只读查看（降低透明度），禁止操作
- ✅ 翻周控制：左滑往前（最多1周），右滑往后（不能超过本周）
- ✅ 周标识提示：导航栏上方显示"本周"/"上周"
- ✅ 顶部三个任务进度圆环随选中日期动态更新，查看上周时展示上周当天任务集合的完成率
- ✅ 任务项的 readonly 属性根据日期动态计算
- ✅ 页面标题随选中日期动态变化
- ✅ 查看非今天日期时隐藏"即将到期任务"提醒组件，避免与历史/未来视图语义冲突
- ✅ 浮动菜单按日期过滤入口：查看非今天日期时隐藏任务创建/奖励管理入口，保留分析入口

**不包含**（明确的边界）：
- ❌ 往前翻超过1周（防止过度回溯）
- ❌ 在非今天日期通过首页入口创建任务或管理奖励
- ❌ 搜索面板跨日期结果的操作语义重构（本次不把搜索结果与日期导航只读状态强耦合）
- ❌ 周统计/周报表（属于独立功能）
- ❌ 日历组件替换（保持标签栏形态）

### 优先级

- **优先级**：P1
- **理由**：当前日期导航体验不直观（"今天"在末尾），且缺乏历史/未来的操作边界控制

### 边界场景

- **今天是周一**：本周视图中无"过去"日期，上周全部为过去日期。用户补昨天的任务需翻到上周，属正常操作路径
- **翻到上周**：全部日期为"过去"，均可补打卡。"今天"标签不会出现在上周视图中
- **补打卡星星时效**：补打卡获得的星星以**实际完成时间**（`Date.now()`）作为 `createTime`，不回填到任务原定日期。现有服务层逻辑已满足此规则（`task-service.js` 中 `completeTask` 使用当前时间），无需额外修改

---

## 技术方案

### 方案概述

改造首页 `generateDateNavigation` 方法，生成以自然周为单位的日期数据，增加 `weekOffset` 状态管理翻周操作。在 WXML 中根据日期状态（过去/今天/未来）传递 `readonly` 属性给任务项组件，实现操作控制；同时复用现有 `updateMenuItemsWithPermissions` 入口，对首页浮动菜单做按日期过滤。

当前首页在 `loadTaskDataOnly(date)` 后会基于该日期任务集重新执行 `calculateProgress(tasks)`，因此三个进度圆环天然可以随选中日期联动，本次只需要把这一行为纳入设计与测试，不新增服务层逻辑。

考虑到当前项目里 `readonly` 只在 `index-task-item` 组件点击层生效，为避免未来日期操作被页面级事件绕过，本方案在表现层额外补一层 `index-task-actions` 防线：未来日期下直接拒绝完成/重置任务并给出提示。对于"即将到期任务"提醒，则改为仅在查看今天时显示；切换到过去/未来日期后直接隐藏。仍然不修改 services/repositories 层。

### 技术选型

| 技术点 | 选择方案 | 替代方案 | 选择理由 |
|--------|---------|---------|---------|
| 日期范围 | 自然周（周一到周日） | 保持滚动7天 | 符合用户认知习惯 |
| 翻周控制 | weekOffset 状态变量 | 虚拟列表无限滚动 | 实现简单，限制1周足够 |
| 翻周交互 | 左右滑动手势 | 左右箭头按钮 | 不占用标签栏空间，交互更自然 |
| 只读控制 | `isReadonlyView || isViewingFuture` 传递给 task-item，并在页面动作层补防线 | 仅靠组件 readonly | 兼容现有孩子视角只读语义，并避免页面事件绕过 |
| 即将到期提醒 | 仅在 `isViewingToday` 时显示，其他日期强制隐藏 | 所有日期都展示 | 保持提醒语义与"今天视图"一致，避免历史/未来页面出现无关提醒 |
| 标签样式 | 新增 past/future CSS 类 | 条件渲染不同组件 | 样式隔离更清晰 |
| 浮动菜单 | 复用现有 menuItems 过滤逻辑，非今天只保留分析入口 | 复用 showFloatMenu 控制整个菜单显隐 | 不与现有“菜单展开状态”语义冲突，也不误伤分析入口 |

### DDD分层设计

**领域层（models/）**：
- 无变更

**服务层（services/）**：
- 无变更（任务加载仍走 `loadTaskDataOnly(date)`，星星发放以实际完成时间为准）

**仓储层（repositories/）**：
- 无变更

**适配器层（adapters/）**：
- 无变更

**表现层（pages/、components/）**：
- 修改页面：`pages/index/index.js` — 日期导航生成、翻周、视图状态计算、菜单入口过滤
- 修改模板：`pages/index/index.wxml` — 标签UI、readonly 绑定、周标识
- 修改样式：`pages/index/index.wxss` — 日期按钮状态样式
- 修改页面模块：`pages/index/modules/index-task-actions.js` — 未来日期完成/重置任务的页面层防线

### 架构图

```mermaid
graph LR
    A[首页日期导航交互] --> B[index.js 周视图/日期状态]
    B --> C[loadTaskDataOnly(date)]
    B --> D[updateMenuItemsWithPermissions]
    C --> E[calculateProgress(tasks)]
    C --> F[任务列表渲染]
    B --> G{isViewingToday}
    G -->|yes| H[checkUpcomingTasks]
    G -->|no| I[showUpcomingTask=false]
    F --> J[index-task-item readonly]
    J --> K[index-task-actions 页面防线]
```

### 数据模型

```typescript
// dateNavigation 数组中的元素
interface DateNavItem {
  dateString: string;   // YYYY-MM-DD
  label: string;        // 显示文本："周一"~"周日"，仅当天显示"今天"
  isToday: boolean;     // 是否今天
  isPast: boolean;      // 是否过去（早于今天）
  isFuture: boolean;    // 是否未来（晚于今天）
  dayOfWeek: number;    // 1=周一 ~ 7=周日
}

// 页面新增状态
interface PageDataAdditions {
  weekOffset: number;          // 翻周偏移：0=本周，-1=上周，最小-1
  weekLabel: string;           // 周标识："本周" 或 "上周"
  canGoPrevWeek: boolean;      // 是否可以往前翻周
  canGoNextWeek: boolean;      // 是否可以往后翻周
  isViewingToday: boolean;     // 是否在查看今天
  isViewingPast: boolean;      // 是否在查看过去的日期
  isViewingFuture: boolean;    // 是否在查看未来的日期
}
```

### 接口设计

无新增服务接口，复用现有 `loadTaskDataOnly(date)` 加载指定日期任务。

---

## 代码结构

### 文件变更清单

**修改文件**：
- `pages/index/index.js` — 日期导航生成逻辑、翻周操作、只读状态计算、菜单入口过滤
- `pages/index/index.wxml` — 日期标签UI重构、任务项 readonly 绑定、周标识
- `pages/index/index.wxss` — 日期按钮 past/future 状态样式
- `pages/index/modules/index-task-actions.js` — 未来日期任务操作防线

**修改测试**：
- `test/pages/index.page-shell.behavior.test.js` — 日期导航、翻周、标题、菜单入口过滤
- `test/pages/index.task-actions.test.js` — 未来日期任务操作拦截
- `test/pages/index.lifecycle.test.js` — 初始化日期导航后的默认周视图

**不变更文件**：
- services/、repositories/、adapters/、models/ 均不变

### 核心代码结构

```javascript
// 辅助函数：获取某日期所在周的周一
function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  // getDay(): 0=周日, 1=周一, ..., 6=周六
  // 周一为基准：偏移量 = (day + 6) % 7
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// generateDateNavigation — 按自然周生成日期
generateDateNavigation: function() {
  const dates = [];
  const todayStr = dateUtils.getTodayString();
  const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  // 基于 weekOffset 计算目标周的周一
  const monday = getMondayOfWeek(new Date());
  monday.setDate(monday.getDate() + this.data.weekOffset * 7);

  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(date.getDate() + i);
    const dateString = dateUtils.formatDate(date);

    dates.push({
      dateString,
      label: dateString === todayStr ? '今天' : weekdays[i],
      isToday: dateString === todayStr,
      isPast: dateString < todayStr,
      isFuture: dateString > todayStr,
      dayOfWeek: i + 1
    });
  }
  return dates;
}

// 翻周操作
onPrevWeek: function() {
  if (this.data.weekOffset === -1) return;
  this.setData({ weekOffset: this.data.weekOffset - 1 });
  this._refreshAfterWeekChange();
}

onNextWeek: function() {
  if (this.data.weekOffset === 0) return;
  this.setData({ weekOffset: this.data.weekOffset + 1 });
  this._refreshAfterWeekChange();
}

// 日期切换时更新只读状态和菜单入口
_updateViewState: function(selectedDate) {
  const todayStr = dateUtils.getTodayString();
  const isViewingToday = selectedDate === todayStr;
  const isViewingPast = selectedDate < todayStr;
  const isViewingFuture = selectedDate > todayStr;

  this.setData({
    isViewingToday,
    isViewingPast,
    isViewingFuture,
    weekLabel: this.data.weekOffset === 0 ? '本周' : '上周'
  });

  this.updateMenuItemsWithPermissions();
}

// WXML 中任务项只读绑定
readonly="{{isReadonlyView || isViewingFuture}}"
```

---

## 实施步骤

### 第1步：改造日期导航生成逻辑

- [ ] **任务**：重写 `generateDateNavigation`，按自然周（周一到周日）生成，支持 `weekOffset`
- [ ] **验证**：今天高亮"今天"标签，周一到周日顺序正确
- [ ] **依赖**：无

**实施要点**：
1. 新增辅助函数 `getMondayOfWeek(date)` 计算某日期所在周的周一
2. `weekOffset` 默认 0（本周），最小 -1（上周）
3. `initializeDateNavigation` 初始化时设置 `weekOffset: 0`，默认选中今天
4. 如果今天不在当前查看周内（如翻到上周），默认选中该周周一

### 第2步：增加翻周交互（滑动手势）

- [ ] **任务**：在日期导航栏区域监听左右滑动手势，实现 `onPrevWeek` / `onNextWeek`
- [ ] **验证**：左滑往前翻周，右滑往后翻周，限制边界（最多往前1周，不能超过本周）
- [ ] **依赖**：第1步

**实施要点**：
1. 使用 `bindtouchstart` + `bindtouchend` 检测滑动方向，滑动距离 > 50px 触发翻周
2. 日期导航栏改为固定 7 列布局，移除现有 `.date-navigation` 的 `overflow-x: auto`，避免横向滚动容器吞掉翻周手势
3. 左滑：若 `weekOffset === -1` 直接 return，否则 `weekOffset--`
4. 右滑：若 `weekOffset === 0` 直接 return，否则 `weekOffset++`
5. 首次成功翻周后可用一次性 toast 提示支持左右滑动查看周切换，不引入常驻箭头控件
6. 翻周后重新生成 dateNavigation，如果该周包含今天则默认选中今天，否则选中周一
7. 翻周后加载选中日期的任务
8. 周标识文案更新：`weekOffset === 0` 显示"本周"，否则显示"上周"

### 第3步：实现只读控制与菜单入口过滤

- [ ] **任务**：根据选中日期计算只读状态，传递给 task-item 组件；按日期过滤首页浮动菜单入口
- [ ] **验证**：过去日期可补打卡，未来日期禁止操作，非今天日期隐藏任务创建/奖励管理入口
- [ ] **依赖**：第1步

**实施要点**：
1. 日期切换时计算：`isViewingFuture = selectedDate > todayStr`
2. WXML 中任务项绑定：`readonly="{{isReadonlyView || isViewingFuture}}"`
3. `updateMenuItemsWithPermissions` 继续保留现有 `isReadonlyView` 过滤，并在 `!isViewingToday` 时额外过滤掉任务创建和奖励管理入口，保留分析入口
4. 日期切换或翻周后：若 `isViewingToday` 为真，则执行 `checkUpcomingTasks()`；否则直接 `setData({ showUpcomingTask: false })`
5. 在 `index-task-actions.js` 增加页面层防线：`isViewingFuture` 时拒绝完成/重置任务，避免组件只读被页面事件绕过
6. 页面标题动态变化：
   - 今天 → "今日任务"
   - 过去 → "X月X日任务"
   - 未来 → "X月X日任务（预览）"

### 第4步：样式优化

- [ ] **任务**：优化日期按钮样式，区分过去/今天/未来状态；添加周标识样式
- [ ] **验证**：视觉上能清晰区分三种日期状态
- [ ] **依赖**：第1步

**实施要点**：
1. 今天的按钮：主色背景（保持现有 `.active` 样式）
2. 过去的按钮：浅灰背景，选中时略深灰
3. 未来的按钮：更浅的灰色 + 降低透明度（`opacity: 0.5`），不用虚线边框
4. 周标识：日期导航上方居中小字（20rpx），"本周"为主色，"上周"为灰色

---

## 测试方案

### 单元测试

| 测试项 | 测试方法 | 预期结果 |
|--------|---------|---------|
| getMondayOfWeek 周三 | 传入周三日期 | 返回本周一 |
| getMondayOfWeek 周日 | 传入周日日期 | 返回本周一（非下周一） |
| generateDateNavigation 本周 | 模拟周三调用 | 返回7项，周一到周日顺序，周三 label="今天" |
| generateDateNavigation 上周 | weekOffset=-1 | 返回上周一到上周日，全部 isPast=true，无 isToday |
| 翻周边界 | weekOffset=-1 时再 onPrevWeek | weekOffset 保持 -1，不变成 -2 |
| 翻周边界 | weekOffset=0 时再 onNextWeek | weekOffset 保持 0，不变成 1 |
| 进度圆环联动 | 切换到上周日期 | `taskProgress` 基于该日期任务集重新计算 |
| 只读判断 | 选中未来日期 | isViewingFuture=true |
| 只读判断 | 选中过去日期 | isViewingFuture=false，isViewingPast=true |
| 即将到期提醒隐藏 | 选中非今天日期 | `showUpcomingTask=false` |
| 菜单入口过滤 | 选中今天 | 保留现有允许的菜单项 |
| 菜单入口过滤 | 选中昨天 | 隐藏任务创建/奖励管理入口，保留分析入口 |
| 周一特殊场景 | 模拟周一 | 本周视图全部 isFuture 或 isToday，无 isPast |
| 页面层防线 | 未来日期触发 completeTask | 不调用 taskService.completeTask，直接提示 |

### 集成测试

- [ ] 场景1：本周翻到上周（左滑），选中上周一，加载对应任务，任务可操作
- [ ] 场景2：选中明天（未来），任务显示但不可点击完成
- [ ] 场景3：翻周后翻回本周（右滑），今天自动选中并高亮
- [ ] 场景4：查看上周时首页浮动菜单仅保留分析入口，翻回今天后恢复完整允许入口
- [ ] 场景5：切换到非今天日期后，即将到期提醒隐藏；切回今天后按当前数据重新显示
- [ ] 场景6：切换到上周日期后，顶部三个进度圆环与该日期任务完成率一致

### 手动测试

1. **功能测试**：
   - [ ] 本周视图正确，今天高亮
   - [ ] 左滑翻到上周，周标识显示"上周"
   - [ ] 上周可查看和补打卡
   - [ ] 选择未来日期，任务只读（低透明度）
   - [ ] 翻周边界正确（不能超过上周/本周）
   - [ ] 顶部三个进度圆环会随选中日期变化
   - [ ] 页面标题随日期变化
   - [ ] 查看非今天日期时，即将到期提醒不显示
   - [ ] 查看非今天日期时，仅分析入口保留，任务创建/奖励管理入口隐藏
   - [ ] 周一场景：本周无过去日期，翻到上周可补昨天任务

2. **回归测试**：
   - [ ] 今天的任务加载和操作正常
   - [ ] 任务完成/星星奖励流程正常
   - [ ] 奖品进度条正常

### 测试覆盖率目标

- 最低要求：85%
- 推荐目标：90%

---

## 风险评估

### 技术风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| dateUtils.formatDate 兼容性 | 低 | 低 | 已有工具函数，直接复用 |
| 翻周状态与任务加载不一致 | 中 | 低 | 翻周后强制重新加载任务数据 |
| 只读绕过（如通过页面事件直接操作） | 中 | 中 | 组件 `readonly` + `index-task-actions` 页面层防线双重控制；服务层不新增日期约束 |
| 滑动手势与页面滚动冲突 | 中 | 中 | 仅在日期导航栏区域监听，限制最小滑动距离 |

### 业务风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| 用户混淆"查看历史"和"操作今天" | 中 | 中 | 周标识 + 标题明确区分，过去日期标题显示日期 |
| 补打卡滥用（翻太久） | 低 | 低 | 限制最多往前1周 |
| 用户不知道可以滑动翻周 | 中 | 中 | 首次成功翻周后给一次性 toast 提示，必要时后续再评估补充箭头提示 |

---

## 替代方案

### 方案A：当前方案（自然周+滑动手势翻周）

**优势**：
- ✅ 符合自然周认知
- ✅ 实现简单，改动集中在前端
- ✅ 滑动手势不占布局空间
- ✅ 翻周控制边界清晰

**劣势**：
- ❌ 只能看最近2周（本周+上周）
- ❌ 首次进入时如果今天是周一，前面只有一个"今天"
- ❌ 滑动手势可发现性较低

---

### 方案B：滚动7天（保持现有逻辑，增加只读）

**描述**：保持当前"往前6天+今天"的方式，只增加只读控制和前后翻页

**优势**：
- ✅ 改动最小
- ✅ 总能看到过去6天

**劣势**：
- ❌ 不符合自然周认知
- ❌ "今天"在末尾的体验问题没解决

**未选择原因**：核心体验问题（自然周排列）未解决

---

### 方案C：完整日历组件

**描述**：用日历网格替换标签栏，支持月视图

**优势**：
- ✅ 功能最完整

**劣势**：
- ❌ 改动大，影响首页布局
- ❌ 日历组件对小程序空间占用过多
- ❌ 偏离简单优先原则

**未选择原因**：过度设计，当前需求用标签栏即可满足

---

## 审核记录

### 审核要点

- [ ] **符合DDD架构**：变更仅限表现层，不动 services/repositories
- [ ] **技术方案合理**：weekOffset + 滑动手势 + 只读控制方案简单可靠
- [ ] **实施步骤清晰**：4步可执行
- [ ] **风险评估充分**：已识别滑动手势冲突、可发现性等问题
- [ ] **测试方案完整**：覆盖核心场景含边界场景（周一特殊情况）

### 审核意见

**审核者**：[项目维护者]
**审核日期**：
**审核结果**：

**意见**：

---

## 附录

### 参考资料

- `pages/index/index.js`
- `pages/index/index.wxml`
- `pages/index/index.wxss`
- `pages/index/modules/index-task-actions.js`
- `components/index-task-item/index-task-item.js`
- `test/pages/index.page-shell.behavior.test.js`
- `test/pages/index.task-actions.test.js`

### 相关 Issue/PR

- 待补充

**最后更新**：2026-04-02
