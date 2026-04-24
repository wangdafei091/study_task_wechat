# 里程碑-22J：首页今日进度圆环语义与展示收口 详细设计文档

> **设计状态**：🟢 审核通过
> **创建日期**：2026-04-24
> **设计者**：GPT5 Codex
> **审核者**：项目维护者
> **预计工期**：1 天

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

当前首页顶部的三枚任务进度圆环已经具备基础展示能力，但结合真实截图与实际代码，存在三类明确问题：

1. **语义不准**：页面标题固定写为“当前进度”，见 `pages/index/index.wxml`；但圆环数据实际来自 `loadTaskDataOnly(date)` 传入的当前视图任务集合，切换历史/未来日期后，圆环会跟着选中日期变化，而不是稳定表达“当前”或“今天”。
2. **口径混杂**：同一首页中，圆环会随日期切换，但下方奖励卡片仍是“今日奖品进度”。这样会出现“上面是历史日任务进度，下面是今日奖励进度”的混合口径，用户理解成本较高。
3. **信息重复且完成度不足**：圆环中心直接显示百分比，和外圈弧线表达重复；`0%` 状态下信息价值很低。组件内部仍保留十字辅助线和较强装饰高光，整体比当前首页其他卡片更偏“功能控件”而非“精致摘要”。

本里程碑的目标不是重做首页结构，而是把这块收口为一个稳定、清晰、克制的“今日摘要模块”。

### 基于实际代码的现状结论

结合当前实现，已确认以下事实：

- `pages/index/index.wxml` 中标题固定为 `当前进度`，三枚圆环绑定 `taskProgress.habit / study / interest`
- `pages/index/index.js` 中 `loadTaskDataOnly(date)` 会在切换日期后调用 `calculateProgress(tasks.concat(occurrenceRecords))`
- `services/task-service/task-query.js` 中 `calculateTaskProgress(tasks)` 会按传入任务集合计算各类型进度
- 因此：**当前圆环确实会跟着所选日期变化，并不是单纯固定展示今天**

这意味着本期需要同时处理**产品语义**和**数据口径**，不能只改文案或只改样式。

### 已冻结的产品决策

进入设计前，已确认以下决策：

1. **首页圆环固定表达“今天”**
   - 不再跟随下方日期浏览切换
   - 首页顶部摘要与“今日奖品进度”统一为同一时间口径

2. **标题改为“今日进度”**
   - 不再使用“当前进度”“当日进度”等模糊说法
   - 直接告诉用户这里看的是今天

3. **中心信息不再显示百分比**
   - 中心改为 `完成数/总数`
   - 外圈继续表达比例，中心负责表达绝对量

4. **三枚圆环保持等大、并列**
   - 不放大中间圆环
   - 不引入主次错觉

5. **不做多层日/周/月圆环**
   - 本期不扩成分析能力
   - 不在首页引入高解释成本的复合视觉

6. **本期只做轻量视觉收敛**
   - 允许收口尺寸、线条、留白和装饰
   - 不重做首页整体版式，不扩到其他模块

### 业务价值

- [x] 用户价值：让首页首屏摘要更直观，用户不再困惑“这里到底是今天、当前视图，还是本周进度”。
- [x] 产品价值：统一首页顶部摘要和奖励卡片的时间语义，提升首页信息结构稳定性。
- [x] 技术价值：为首页进度模块建立清晰的数据契约，避免后续继续在“标题是今天、数据是选中日期”的模糊状态上修补。

### 功能范围

**包含**：
- ✅ 首页圆环标题从“当前进度”收口为“今日进度”
- ✅ 首页圆环数据改为固定按“今天”计算，不随日期浏览切换
- ✅ 圆环中心信息从百分比改为 `完成数/总数`
- ✅ 无任务类型下不再显示误导性的 `0%`
- ✅ 对圆环组件做轻量视觉收敛：去低价值装饰、收紧视觉密度、统一首页风格
- ✅ 补齐首页与圆环组件相关测试

**不包含**：
- ❌ 不新增周/月进度能力
- ❌ 不做多层圆环
- ❌ 不把中间圆环单独放大
- ❌ 不重做首页整体布局、奖励卡片、任务列表和日期导航
- ❌ 不扩展为分析页或统计页的通用趋势组件

### 优先级

- **优先级**：P1
- **理由**：该问题不影响核心链路可用性，但它位于首页第一屏、每天都会出现，直接影响用户对首页摘要的理解和品质感判断，且范围集中，适合作为独立体验收口项推进。

---

## 技术方案

### 方案概述

本期采用“**口径固定 + 信息增值 + 视觉收敛**”方案：

1. 首页圆环正式定义为“今日进度”，只看今天，不再消费当前选中日期的任务集合
2. 页面层新增今日进度专用数据载入方法，和任务列表的日期浏览链路拆开
3. 服务层继续复用现有 `calculateTaskProgress` 能力，但补齐每类任务的完成数/总数摘要，供首页圆环中心使用
4. 圆环组件保持三枚并列结构，只收敛装饰和中心文本表达，不做复杂视觉扩张

这样既能解决真实认知问题，也能把实现复杂度控制在小里程碑范围内。

### 技术选型

| 技术点 | 选择方案 | 替代方案 | 选择理由 |
|--------|---------|---------|---------|
| 首页时间口径 | 顶部圆环固定今日、任务列表继续按日期浏览 | 圆环继续跟日期切换 | 首页奖励卡片已是今日口径，统一后更稳定 |
| 中心文本 | `完成数/总数` | 继续显示百分比 | 弧线已表达比例，中心更适合承载绝对量 |
| 计数来源 | 扩展 `calculateTaskProgress` 返回每类任务 summary | 页面层自行二次计算 | 服务层更适合作为正式统计口径来源 |
| 今日摘要刷新 | 页面层新增 `loadTodayProgressSummary` | 复用 `loadTaskDataOnly` 的当前视图结果 | 避免“选中日期”和“首页今日摘要”继续混用同一状态字段 |
| 视觉优化策略 | 收口装饰、微调尺寸与留白 | 放大圆环 / 多层套环 | 小屏首页更需要清晰克制，而不是继续加复杂度 |

### DDD 分层设计

**领域层（models/）**：
- [ ] 新建模型：无
- [ ] 修改模型：无
- 说明：本期不改任务领域模型。

**服务层（services/）**：
- [x] 修改服务：`services/task-service/task-query.js`
- [ ] 新建服务：无
- 说明：扩展任务进度计算结果，补齐每类任务的 `completed / total / percent` 摘要，不改变既有进度算法。

**仓储层（repositories/）**：
- [ ] 新建仓储：无
- [ ] 修改仓储：无
- 说明：继续复用现有 `getTodayTasks / getOccurrenceRecordsByDateRange`。

**适配器/工具层（utils/）**：
- [ ] 新建工具：无
- [ ] 修改适配器：无
- 说明：原则上不新增工具，避免把首页摘要逻辑拆散到额外 helper。

**表现层（pages/、components/）**：
- [x] 修改页面：`pages/index/`
- [x] 修改组件：`components/progressRing/`
- 说明：首页负责区分“今日摘要”和“日期浏览任务列表”；除 `pages/index/index.js` 外，还要同步收口 `pages/index/modules/index-refresh-coordinator.js` 与 `pages/index/modules/index-date-navigation.js` 的刷新/快照边界，避免旧状态路径继续覆盖今日摘要。

### 数据模型

本期新增/明确首页消费的数据结构：

```typescript
interface TaskProgressBucketSummary {
  completed: number;
  total: number;
  percent: number;
  centerText: string;   // 例如 "2/5"、"—"
  isEmpty: boolean;
}

interface TaskProgressResult {
  taskProgress: {
    habit: number;
    study: number;
    interest: number;
  };
  taskProgressSummary: {
    habit: TaskProgressBucketSummary;
    study: TaskProgressBucketSummary;
    interest: TaskProgressBucketSummary;
  };
  stats: {
    totalTasks: number;
    completedTasks: number;
    completionRate: number;
    typeCounts: {
      habit: number;
      study: number;
      interest: number;
    };
  };
}
```

约束说明：

- `taskProgress` 继续保留给圆环弧线使用，兼容现有调用
- `taskProgressSummary` 专门为首页中心文本和空态语义服务
- `centerText` 由服务层一次产出，避免页面重复拼装

### 接口设计

本期不新增后端接口，但会扩展前端服务返回结构并新增页面内部刷新方法。

**服务接口扩展**：

| 方法 | 说明 | 参数 | 返回值 |
|------|------|------|--------|
| `taskService.calculateTaskProgress` | 计算各类型进度，并补齐每类完成数/总数摘要 | `tasks?: Task[]` | `TaskProgressResult` |

**页面内部方法新增/调整**：

| 方法 | 说明 | 参数 | 返回值 |
|------|------|------|--------|
| `loadTodayProgressSummary` | 只刷新首页“今日进度”摘要 | `options?: { reuseCurrentTodayData?: boolean, currentTasks?: Task[], currentOccurrenceRecords?: Task[] }` | `Promise<void>` |
| `loadTaskDataOnly` | 继续负责当前选中日期的任务与表现记录列表 | `date?: string` | `Promise<Task[]>` |

### 关键设计决策

#### 决策1：首页圆环正式收口为“今日摘要”

当前首页顶部圆环和下方日期浏览复用了同一个 `taskProgress` 数据口径，导致“标题写当前、数据跟日期切”的语义错位。

本期决策：

- 首页圆环只表达今天
- 日期导航只控制任务列表和表现记录
- 首页顶部摘要与“今日奖品进度”保持同一时间口径

这是本期最核心的产品收口点。

#### 决策2：中心文本从百分比改为完成数/总数

当前百分比由弧线和文字重复表达，信息价值较低。

本期决策：

- 中心显示 `完成数/总数`
- 例如：`2/5`
- 对应类型当天无任务时显示 `—`

这样能解决两类问题：

1. 同一比例下补充绝对量信息，避免“50% 但不知道是 1/2 还是 5/10”
2. 让日期变化或数据变化时更容易被感知

#### 决策3：无任务时不再表达为 0%

`0%` 在“无任务”和“有任务但没完成”这两种场景下完全不同，但视觉上容易被混为一类。

本期决策：

- `total === 0` 时：
  - 中心显示 `—`
  - 外圈显示空轨道，不强调进度弧线
- `total > 0 && completed === 0` 时：
  - 中心显示 `0/N`
  - 外圈维持 0% 弧线表现

这样能把“今天没有这类任务”和“今天有但没做”清楚区分开。

#### 决策4：视觉只做克制收敛

本期不走“更大、更复杂”的方向。

冻结约束：

- 三枚圆环保持等大并列
- 不单独放大中间圆环
- 不引入日/周/月多层圆环
- 不增加新的解释型文案

允许的视觉优化仅包括：

- 去掉十字辅助线
- 降低内层高光存在感
- 略收紧尺寸、间距和卡片留白
- 微调黄色环颜色，使其与首页整体更协调

#### 决策5：状态字段语义拆开，避免再次混用

当前 `taskProgress` 既承接首页顶部圆环，又隐含跟随当前视图日期变化，语义已经模糊。

本期冻结：

- 页面层引入明确的 `todayTaskProgress` / `todayTaskProgressSummary`
- 首页圆环与模板绑定全面切换到 `todayTaskProgress / todayTaskProgressSummary`
- 旧 `taskProgress` 从首页正式状态中退出，不再作为首页圆环的数据源
- `loadTaskDataOnly()` 不再负责写首页圆环进度
- 任务列表继续维护自己的日期视图状态

实施约束：

1. 首页 WXML 中三枚圆环只允许绑定 `todayTaskProgress.*`
2. 首页中心文案只允许绑定 `todayTaskProgressSummary.*`
3. `taskProgress` 如仍临时保留，只能作为过渡字段存在于局部兼容代码中，不得继续出现在首页模板绑定、刷新编排和日期快照里
4. 本期实施完成后，首页页面层不再存在“双进度状态源”

---

## 代码结构

### 文件变更清单

**新增文件**：
- `docs/design/milestone-22j-home-today-progress-ring-convergence.md` - 本设计文档

**修改文件**：
- `pages/index/index.js` - 拆分今日摘要与日期浏览任务列表的数据刷新逻辑
- `pages/index/index.wxml` - 标题改为“今日进度”，并将圆环绑定全面切换到 `todayTaskProgress / todayTaskProgressSummary`
- `pages/index/index.wxss` - 首页圆环卡片留白与节奏轻量收敛
- `pages/index/modules/index-refresh-coordinator.js` - 统一批量刷新、事件刷新和用户切换刷新时的今日摘要更新策略
- `pages/index/modules/index-date-navigation.js` - 从日期视图快照中剥离首页今日摘要字段，避免日期回滚误伤今日摘要
- `components/progressRing/progressRing.wxml` - 承接新的中心文本显示分支
- `components/progressRing/progressRing.wxss` - 去除低价值装饰，微调视觉密度
- `services/task-service/task-query.js` - 扩展任务进度计算结果，补齐每类 summary
- `test/pages/index.page-shell.behavior.test.js` - 补齐首页“今日摘要不随日期切换”的行为测试
- `test/pages/index.modules.test.js` - 补齐刷新编排与日期快照边界测试
- `test/components/progress-ring.test.js` - 补齐圆环中心文本和空态展示契约测试

### 核心代码结构

```javascript
// pages/index/index.js
async function loadTodayProgressSummary(options = {}) {
  const today = dateUtils.getTodayString();

  let todayTasks = options.currentTasks || null;
  let todayOccurrenceRecords = options.currentOccurrenceRecords || null;

  if (!options.reuseCurrentTodayData) {
    [todayTasks, todayOccurrenceRecords] = await Promise.all([
      taskService.getTodayTasks(currentUserId, { requireFreshStars: true }),
      taskService.getOccurrenceRecordsByDateRange({
        startDate: today,
        endDate: today,
        userId: currentUserId
      })
    ]);
  }

  const progressResult = await taskService.calculateTaskProgress(
    (todayTasks || []).concat(todayOccurrenceRecords || [])
  );

  this.setData({
    todayTaskProgress: progressResult.taskProgress,
    todayTaskProgressSummary: progressResult.taskProgressSummary
  });
}

async function loadTaskDataOnly(date = null) {
  // 继续只负责当前视图任务列表与表现记录
  // 不再写首页圆环进度字段
}
```

```javascript
// pages/index/modules/index-refresh-coordinator.js
async function loadAllPageData(page, options = {}) {
  const targetDate = page.data.currentViewDate || null;
  const tasksResult = await page.loadTaskDataOnly(targetDate);

  await page.loadTodayProgressSummary({
    reuseCurrentTodayData: !targetDate || targetDate === dateUtils.getTodayString(),
    currentTasks: targetDate === dateUtils.getTodayString() ? page.data.tasks : null,
    currentOccurrenceRecords: targetDate === dateUtils.getTodayString()
      ? page.data.currentDateOccurrenceRecords
      : null
  });

  // 其余消息、奖励、upcoming 刷新逻辑保持原位
}
```

```javascript
// services/task-service/task-query.js
function buildBucketSummary(completed, total) {
  return {
    completed,
    total,
    percent: total > 0 ? Math.round(completed / total * 100) : 0,
    centerText: total > 0 ? `${completed}/${total}` : '—',
    isEmpty: total === 0
  };
}
```

### 关键函数

**函数1**：`loadTodayProgressSummary`
- **输入**：当前用户、可选的“复用当前今天数据”参数
- **输出**：更新页面 `todayTaskProgress` 与 `todayTaskProgressSummary`
- **职责**：把首页今日摘要与日期浏览任务列表彻底分开
- **依赖**：`taskService.getTodayTasks`、`taskService.getOccurrenceRecordsByDateRange`、`taskService.calculateTaskProgress`

**函数2**：`refreshTodayProgressSummary`
- **输入**：页面实例、当前刷新上下文
- **输出**：在批量刷新、事件刷新、用户切换后更新首页今日摘要
- **职责**：把今日摘要纳入首页真实刷新编排，而不是只在首屏初始化时刷新一次
- **依赖**：`loadAllPageData`、`refreshTaskDataForCurrentView`、`refreshDataForCurrentUser`

**函数3**：`calculateTaskProgress`
- **输入**：任务数组
- **输出**：进度百分比 + 每类任务完成数/总数摘要
- **职责**：继续作为正式进度口径唯一来源
- **依赖**：现有任务完成判定逻辑

**函数4**：`loadTaskDataOnly`
- **输入**：当前查看日期
- **输出**：更新当前视图任务列表、表现记录列表和日期视图状态
- **职责**：只负责“日期浏览内容”，不再承担首页今日摘要写入职责
- **依赖**：`taskService.getTodayTasks`、`taskService.getTasksByDate`、`taskService.getOccurrenceTasks`

---

## 实施步骤

### 第1步：收口统计契约（预计 2 小时）

- [ ] **任务**：扩展 `taskService.calculateTaskProgress` 返回结构，增加每类任务 `completed / total / centerText / isEmpty`
- [ ] **验证**：现有调用方不被破坏，新增结果可被首页消费
- [ ] **依赖**：无

**实施要点**：
1. 保持现有 `taskProgress` 返回不变，降低回归风险
2. 新摘要字段命名清晰，不再继续沿用模糊字段名
3. 无任务场景直接在服务层落成 `—`

---

### 第2步：拆分首页“今日摘要”和“日期浏览”数据链路（预计 3 小时）

- [ ] **任务**：在 `pages/index/` 中新增今日摘要刷新方法，并改造现有加载流程
- [ ] **验证**：切换日期后任务列表变化，但首页圆环继续展示今天数据
- [ ] **依赖**：第1步完成

**实施要点**：
1. 默认首页首次进入时，任务列表和今日摘要都读取今天
2. 切换到历史/未来日期时，只刷新任务列表，不覆盖今日摘要
3. 当当前视图本来就是今天时，允许复用当前已加载结果，避免重复读取
4. 页面层要为“当前视图表现记录”保留可复用的记录集合，避免首页今日摘要重复去拉今天的 occurrence records
5. `loadTaskDataOnly()` 与首页模板绑定都不能再写/读旧 `taskProgress`

---

### 第3步：把今日摘要纳入真实刷新编排（预计 2 小时）

- [ ] **任务**：修改 `index-refresh-coordinator.js`，补齐首页 onShow 批量刷新、任务事件刷新、用户切换刷新对今日摘要的正式更新
- [ ] **验证**：切换孩子、收到 `task:changed` / `task:created`、首页重新显示后，今日摘要始终与今天数据保持一致
- [ ] **依赖**：第2步完成

**实施要点**：
1. `loadAllPageData` 不能只刷新当前视图任务列表，还要刷新今日摘要
2. `refreshTaskDataForCurrentView` 在刷新列表后，也要刷新今日摘要
3. `refreshDataForCurrentUser` 需要把今日摘要当成正式首页数据的一部分
4. 当前视图本身就是今天时，允许复用已拉取的数据，避免重复请求

---

### 第4步：收口日期快照与回滚边界（预计 1 小时）

- [ ] **任务**：修改 `index-date-navigation.js` 快照策略，确保今日摘要不再属于日期视图状态
- [ ] **验证**：翻周/切日失败回滚后，任务列表回滚，但“今日进度”不被历史视图状态覆盖
- [ ] **依赖**：第2步完成

**实施要点**：
1. `todayTaskProgress / todayTaskProgressSummary` 不进入 date snapshot
2. `taskProgress` 如被废弃或降级，需同步清理快照里的旧引用
3. `test/pages/index.modules.test.js` 要锁定该边界，避免后续回归

---

### 第5步：重做圆环中心信息与轻量视觉收敛（预计 3 小时）

- [ ] **任务**：修改首页模板和 `progressRing` 组件，完成标题、中心文本和装饰收敛
- [ ] **验证**：首页首屏显示“今日进度”，中心为 `完成数/总数`，视觉较当前更克制统一
- [ ] **依赖**：第2步完成

**实施要点**：
1. 标题统一为 `今日进度`
2. 中心优先显示 `2/5`、`0/3`、`—`
3. 删除十字辅助线，降低内层高光存在感
4. 不放大圆环，不改单枚主次，不做多层效果

---

### 第6步：补齐测试与回归（预计 2 小时）

- [ ] **任务**：补充首页行为测试和圆环组件测试
- [ ] **验证**：定向测试全绿
- [ ] **依赖**：前 3 步完成

**实施要点**：
1. 验证切换日期后今日摘要保持不变
2. 验证无任务类型显示 `—`
3. 验证中心文本由百分比切换为计数摘要

---

## 测试方案

### 单元测试

| 测试项 | 测试方法 | 预期结果 |
|--------|---------|---------|
| 任务进度 summary 生成 | 扩展 `calculateTaskProgress` 测试 | 正确返回 `completed / total / centerText / isEmpty` |
| 圆环中心文本显示 | `test/components/progress-ring.test.js` | 组件可显示新的中心文本并保持原有绘制行为 |
| 无任务空态 | 首页/组件定向测试 | 中心显示 `—`，不误显示 `0%` |
| 日期快照边界 | `test/pages/index.modules.test.js` | 翻周失败回滚不覆盖今日摘要 |
| 单一数据源约束 | `test/pages/index.page-shell.behavior.test.js` | 首页圆环只消费 `todayTaskProgress / todayTaskProgressSummary`，`loadTaskDataOnly` 不再写旧 `taskProgress` |

### 集成测试

- [ ] 场景1：首页首次进入，圆环与奖励卡片均为今日口径
- [ ] 场景2：切换到历史日期，任务列表变化但圆环保持今日摘要
- [ ] 场景3：当天某一类型无任务时，圆环显示 `—`
- [ ] 场景4：切换孩子、任务新增/完成、首页 onShow 批量刷新后，今日摘要仍刷新到最新今天数据

### 手动测试

1. **功能测试**：
   - [ ] 首页首次进入，标题显示 `今日进度`
   - [ ] 切换日期导航，圆环不再跟随变化
   - [ ] 完成今天任务后，圆环中心显示 `完成数/总数`

2. **视觉测试**：
   - [ ] 三枚圆环保持等大并列
   - [ ] 删除辅助十字线后视觉更干净
   - [ ] 黄色圆环与页面整体风格更协调

3. **回归测试**：
   - [ ] 奖励卡片、日期导航、任务列表原有行为不受影响
   - [ ] 表现记录区块与首页消息预览不受影响

### 定向测试命令

- `npx jest test/pages/index.page-shell.behavior.test.js --runInBand`
- `npx jest test/pages/index.modules.test.js --runInBand`
- `npx jest test/components/progress-ring.test.js --runInBand`

---

## 风险评估

### 技术风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| 首页状态字段拆分后旧逻辑仍误写入旧字段 | 中 | 中 | 明确把今日摘要和日期浏览分开命名，并补行为测试 |
| 扩展 `calculateTaskProgress` 返回结构影响既有调用方 | 中 | 低 | 保留现有字段不变，仅追加字段 |
| 首页在切换日期时额外读取今天数据导致重复请求 | 低 | 中 | 当前视图为今天时复用已有数据，非今天时再单独读取 |
| 旧刷新编排或 date snapshot 继续覆盖今日摘要 | 高 | 中 | 把 `index-refresh-coordinator.js` 与 `index-date-navigation.js` 纳入正式范围，并补模块级测试 |

### 产品风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| 用户看到历史日期任务列表，但顶部仍是今日摘要，初期需要重新建立心智 | 中 | 中 | 通过标题明确写成“今日进度”，消除语义误解 |
| 中心改为 `完成数/总数` 后，少数用户短期内不习惯没有 `%` | 低 | 中 | 弧线仍保留比例表达，且新文本信息价值更高 |

---

## 替代方案

### 方案A：保留圆环跟随日期切换，仅把标题改成动态日期

**做法**：
- 圆环继续跟随 `currentViewDate`
- 标题改为 `今日进度 / 3月20日进度 / 3月28日预览`

**优点**：
- 不需要拆分首页数据链路
- 标题和数据口径能重新一致

**缺点**：
- 首页奖励卡片仍是今日口径，页面顶部会继续出现混合时间语义
- 首页首屏摘要会在“今日首页”和“日期浏览器”之间摇摆，不够稳定

**结论**：
- 不采用。虽然技术改动更小，但产品语义仍不够干净。

### 方案B：把三枚圆环做成日/周/月多层套环

**做法**：
- 每枚圆环内叠加多层时间维度
- 在一枚圆环里同时表达今日、本周、本月

**优点**：
- 单模块承载更多统计信息，看起来“功能更强”

**缺点**：
- 小屏首页解释成本过高
- 视觉噪音明显上升
- 和下方日期导航、后续分析页职责冲突

**结论**：
- 不采用。本期方向是更清晰、更克制，而不是更复杂。

### 方案C：单独放大中间圆环

**做法**：
- 保持三枚圆环，但把中间圆环做大

**优点**：
- 视觉上更有中心焦点

**缺点**：
- 三类任务本是并列关系，强行放大中间项会制造错误主次
- 破坏首页模块平衡

**结论**：
- 不采用。本期保持等大并列更合理。
