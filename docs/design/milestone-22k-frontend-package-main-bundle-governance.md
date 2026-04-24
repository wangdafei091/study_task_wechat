# 里程碑-22K：前端包体与主包治理优化 详细设计文档

> **设计状态**：🟢 审核通过
> **创建日期**：2026-04-24
> **设计者**：GPT5 Codex
> **审核者**：项目维护者
> **预计工期**：2 天

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

当前项目前端在微信开发者工具中的包体表现已经出现明确风险信号：主包体积处于高水位，整体前端包体接近 2MB，继续沿当前结构叠加功能，会越来越依赖临时压缩和开发者工具容错，而不是正式、稳定的包治理。

结合实际代码，问题并不是“测试逻辑直接跑进了线上功能”，而是三类更本质的结构性问题叠加：

1. **主包职责过重**：`task-edit`、`task-occurrence-edit`、`task-record` 这类非首页、非 tabBar 的重编辑/重详情页仍放在主包。
2. **打包卫生不完整**：`project.config.json` 已忽略 `test/`、`docs/`、`backend/`，但仍有一批明确非运行文件没有被正式排除。
3. **启动链依赖过早注入**：`app.js -> service-manager -> services/index` 会在冷启动阶段把模板、验证等并非首页首屏必需的服务也提前拉入。

本里程碑的目标不是做一次“为了降包而降包”的激进重构，而是在**不影响现有功能和 DDD 分层**的前提下，把主包从当前高水位拉回安全区，并同步收口启动链路的过度注入。

### 基于实际代码的现状结论

已确认以下事实：

- `app.json` 当前主包页面为：
  - `pages/index/index`
  - `pages/task-edit/task-edit`
  - `pages/task-occurrence-edit/task-occurrence-edit`
  - `pages/task-record/task-record`
  - `pages/rewards/rewards`
  - `pages/access-gate/access-gate`
- `app.json` 已开启 `lazyCodeLoading: "requiredComponents"`，说明项目已经用了微信官方的按需注入优化。
- `project.config.json` 已开启 `minified: true`、`bundle: true`、`minifyWXSS: true`，说明“简单打开压缩开关”这类低级优化已基本吃尽。
- `app.js` 冷启动直接 `require('./services/service-manager.js')`。
- `services/service-manager.js` 当前通过 `require('./index')` 一次性拉入：
  - `TaskService`
  - `RewardService`
  - `StarService`
  - `MessageService`
  - `OfflineQueueService`
  - `TaskTemplateService`
  - 以及直接 `require` 的 `ValidationService`、`ConfigService`
- `pages/task-edit/task-edit.json` 当前唯一使用了 `/packageComponents/components/task-heatmap/task-heatmap`，这意味着如果该组件不跟着编辑流迁移，它会继续锚定在主包。
- `packageChart/pages/analysis/analysis.js` 当前直接跳转 `/pages/task-record/task-record`，说明 `task-record` 更接近分析分包能力，而不是首页主包能力。
- `TaskTemplateService` 同时被 `pages/task-edit/` 和 `packageManage/pages/task-template-*` 使用，不能在本期用高风险方式直接跨分包搬迁。
- `ValidationService` 同时被 `pages/task-edit/` 和 `packageManage/pages/reward-manage/` 使用，适合做**懒初始化**，不适合在本期做**分包搬迁**。
- 页面访问权限当前不只存在于 `utils/permission-utils.js`，`models/user.js` 的 `getAccessiblePages / hasPageAccess` 也是实际生效的数据源，`services/user-service.js` 与相关测试会经由这套模型权限返回页面访问结果。

### 与微信小程序官方规则的对齐结论

本方案以微信官方开放文档为边界，核心约束如下：

1. **`subPackages` 配置路径外的目录会进入主包**
   - 这意味着只迁页面、不迁其专属组件/文件，主包收益会打折。

2. **`tabBar` 页面必须在主包**
   - 因此首页和奖池页不作为本期主包迁移对象。

3. **分包之间不能直接 `require` 彼此 JS**
   - 这决定了本期不做“跨分包共享服务整体迁仓”式激进改造。

4. **`lazyCodeLoading` 解决的是注入时机，不是自动缩主包**
   - 因此不能把“已经开启按需注入”误当成“主包治理已经完成”。

5. **`packOptions.ignore` 是官方支持的正式打包能力**
   - 因此补齐忽略规则属于正式治理，不是权宜之计。

6. **开发者工具对包体可能存在调试放宽**
   - 这不能替代正式发布规则，因此本期验收以正式包治理思路为准，不以开发工具临时容忍为准。

### 业务价值

- [x] 用户价值：降低首屏进入和功能跳转的包体负担，减少未来因主包膨胀导致的加载、注入和发布风险。
- [x] 技术价值：把“页面在哪个包、哪些代码必须冷启动、哪些文件不应进入发布产物”的边界正式化，避免后续继续无序堆积。
- [x] 业务价值：为后续里程碑留出主包余量，降低新增能力时被包体限制反复打断的概率。

### 功能范围

**包含**：
- ✅ 补齐 `project.config.json` 的非运行文件忽略规则
- ✅ 新增任务编辑流分包，承接 `task-edit` 与 `task-occurrence-edit`
- ✅ 将 `task-record` 从主包迁移到更合适的分析分包
- ✅ 将 `task-edit` 独占的 `task-heatmap` 跟随迁移，避免继续锚定主包
- ✅ 将 `TaskTemplateService`、`ValidationService` 从冷启动阶段改为按需初始化
- ✅ 补齐页面跳转、分包路径、服务初始化边界的回归测试
- ✅ 以微信开发者工具包分析结果做前后对比验收

**不包含**：
- ❌ 不在本期做“分包异步化”架构改造
- ❌ 不在本期大规模搬迁所有 `services/`、`utils/` 到新目录
- ❌ 不重写 `task-edit`、`task-occurrence-edit` 业务逻辑
- ❌ 不为降包而改变现有功能入口、页面布局和交互语义
- ❌ 不把首页、奖池页、`access-gate` 等主线页迁出主包
- ❌ 不在本期引入新的前端构建链或第三方打包依赖

### 优先级

- **优先级**：P1
- **理由**：这不是直接的用户功能阻断，但它已经触达发布治理边界，且问题会随着功能继续增长而指数放大。越晚收口，后续里程碑的设计自由度越低。

---

## 技术方案

### 方案概述

本期采用“**打包卫生补齐 + 主包边界重排 + 启动链减重**”三层治理方案：

1. **第一层：打包卫生**
   - 用 `packOptions.ignore` 正式排除确定不会进入运行时的文件和目录。

2. **第二层：主包边界重排**
   - 把非 tabBar、非首页首屏的重编辑页迁出主包。
   - 页面迁移时同步迁移其独占组件，避免“页面出去了，重组件还留在主包”。

3. **第三层：启动链减重**
   - 把模板服务、验证服务从 `App.onLaunch` 依赖链里退后，改为首次真正访问时再实例化。
   - 这样即使部分共享服务代码仍位于根目录，也能显著降低冷启动注入和初始化负担。

本方案的关键原则是：**本轮优先追求“收益最大且风险可控”，而不是追求理论上的绝对最小包。**

### 技术选型

| 技术点 | 选择方案 | 替代方案 | 选择理由 |
|--------|---------|---------|---------|
| 非运行文件治理 | `project.config.json > packOptions.ignore` 补齐 | 仅依赖工具自动过滤无依赖文件 | 官方正式能力，可预测、可审计 |
| 任务编辑流迁移 | 新增 `packageTask` 分包 | 继续留主包，仅做代码压缩 | 真实收益最大，且对入口语义影响小 |
| 任务记录页迁移 | 将 `task-record` 迁入 `packageChart` | 新建单独分包 | 当前唯一明确入口来自分析页，放回分析分包更自然 |
| 热力组件治理 | `task-heatmap` 跟随 `task-edit` 迁移 | 组件留主包 | 否则主包仍会被大组件锚定 |
| 启动链优化 | `service-manager` 对 `TaskTemplateService / ValidationService` 懒初始化 | 保持启动时全量初始化 | 风险较低，能立刻降低冷启动负担 |
| 服务模块边界 | 保持 `services/` DDD 目录不做大迁仓 | 把共享服务按分包重构 | 后者会与跨分包依赖规则正面冲突，超出本期风险预算 |

### DDD 分层设计

**领域层（models/）**：
- [ ] 新建模型：无
- [x] 修改模型：`models/user.js`
- 说明：不改变用户域业务规则，但需要同步收口页面访问清单中的迁移后路径，避免权限判断仍指向旧主包页面。

**服务层（services/）**：
- [x] 修改服务：`services/service-manager.js`
- [x] 修改服务：`services/index.js`
- [ ] 新建服务：无
- 说明：重点是拆掉不必要的启动期 eager import，保留对外服务契约不变；`services/user-service.js` 逻辑原则上不变，但其测试需要随模型权限路径一起更新。

**仓储层（repositories/）**：
- [ ] 新建仓储：无
- [ ] 修改仓储：无
- 说明：本期不改变数据访问层。

**适配器/工具层（utils/）**：
- [x] 修改工具：`utils/permission-utils.js`
- [x] 修改启动工具：`utils/app/bootstrap-services.js`（如需要配合服务惰性获取）
- 说明：只改路由白名单和启动装配边界，不扩散到业务工具大重构。

**表现层（pages/、components/）**：
- [x] 新建分包：`packageTask/`
- [x] 迁移页面：`task-edit`、`task-occurrence-edit`
- [x] 迁移页面：`task-record`（迁入 `packageChart`）
- [x] 迁移组件：`task-heatmap`
- [x] 修改页面入口：`pages/index/index.js`、`packageChart/pages/analysis/analysis.js`
- 说明：页面迁移只调整包路径，不改变现有页面能力和交互设计。

### 代码级核心决策

#### 决策1：新增 `packageTask`，承接任务编辑流

本期将新增一个专用分包，例如：

```json
{
  "root": "packageTask",
  "pages": [
    "pages/task-edit/task-edit",
    "pages/task-occurrence-edit/task-occurrence-edit"
  ]
}
```

原因：

- `task-edit` 与 `task-occurrence-edit` 不是 tabBar 页面；
- 入口明确，主要由首页跳转触发；
- 页面体量较大，且包含较重编辑逻辑；
- 迁出主包后对首页首屏能力没有功能损伤。

#### 决策2：`task-record` 不进 `packageTask`，而是回归 `packageChart`

当前 `task-record` 的明确入口来自分析页，因此本期不新建无谓的第三条编辑链，而是迁入分析分包，例如：

```json
{
  "root": "packageChart",
  "pages": [
    "pages/analysis/analysis",
    "pages/task-record/task-record"
  ]
}
```

这样有两个好处：

- 页面语义更一致：分析页跳出的记录详情仍归分析包；
- 减少新分包内的功能混装，避免 `packageTask` 膨胀成“所有非主包页面的垃圾桶”。

#### 决策3：`task-heatmap` 必须跟随 `task-edit` 一起迁移

当前 `task-heatmap` 只被 `pages/task-edit/task-edit.json` 使用。如果只迁页面，不迁组件：

- 页面虽然离开主包，
- 但 `task-heatmap` 仍在主包路径下，
- 主包会继续背着这块大组件。

因此本期会把组件迁到 `packageTask/components/task-heatmap/`，并同步更新 `task-edit.json` 的组件路径。

#### 决策4：`TaskTemplateService / ValidationService` 只做懒初始化，不做分包重构

原因很明确：

- `TaskTemplateService` 同时被任务编辑页和模板管理页使用；
- `ValidationService` 同时被任务编辑页和奖励管理页使用；
- 微信官方限制分包之间不能直接 `require` 彼此 JS。

因此，本期不做“把这些共享服务整体迁去某个分包”的高风险改造，而采用更可控的方案：

- `service-manager` 不再在模块加载时就经由 `services/index.js` 把相关服务一次性拉起；
- 改为：
  - 冷启动只实例化首页/启动必需服务；
  - 在 `getService('taskTemplate')` / `getService('validation')` 首次访问时再 `require + new`。

这个方案虽然对**主包体积**的收益不如“把共享服务整个搬出去”那么极端，但能稳住：

- 启动注入成本
- 首次首页进入负担
- DDD 目录稳定性

#### 决策5：`preloadRule` 本期显式扩展为同时预下载 `packageTask` 与 `packageChart`

当前首页已经通过 `preloadRule` 在后台预下载 `packageChart`。`M22K` 完成后会出现两个新事实：

- 首页仍然是分析页的主要前置入口，且 `task-record` 会并入 `packageChart`，`packageChart` 的体积会比现在更大；
- 首页“加号 -> 新建任务”是高频主链路，`task-edit` 迁入 `packageTask` 后，如果完全不预下载，首次进入编辑页会出现额外的一次性分包加载等待。

因此本期明确采用以下预加载策略：

- 保留首页对 `packageChart` 的预下载，避免分析页链路体感回退；
- 同时把 `packageTask` 纳入首页 `preloadRule.packages`，降低首次进入任务编辑页的等待感。

设计后的目标形态：

```json
{
  "preloadRule": {
    "pages/index/index": {
      "network": "all",
      "packages": ["packageChart", "packageTask"]
    }
  }
}
```

选择理由：

- 这能把“降主包”和“保住首页主操作体感”同时兼顾；
- `preloadRule` 是后台预下载，不改变首页首屏结构，也不把页面重新塞回主包；
- 虽然会增加后台网络消耗，但这是比“新建任务首击显著变慢”更可接受的成本。

验收要求：

- 包分析要看主包体积回落；
- 手工回归要额外确认首页进入 `task-edit` 与分析页的首次跳转体感未明显退化。

#### 决策6：权限路径要双处同步，`models/user.js` 为正式权限源之一

本期页面迁移后，权限相关路径不能只更新 `utils/permission-utils.js`。

当前仓库里至少有两套页面访问判断入口：

- `utils/permission-utils.js` 中的 `PAGE_PERMISSIONS`
- `models/user.js` 中的 `getAccessiblePages / hasPageAccess`

其中 `services/user-service.js` 与多个模型/服务测试实际走的是 `models/user.js` 这一套。因此本期正式要求：

- 迁移后的页面路径必须同时更新到 `utils/permission-utils.js`
- 迁移后的页面路径必须同时更新到 `models/user.js`
- `test/models/user.test.js` 与 `test/services/user-service.test.js` 必须同步更新断言

这样才能避免出现：

- UI 层路由已迁走
- 但权限判断仍指向旧路径
- 自动化测试或真实权限校验在后续阶段继续漂移

#### 决策7：本期不引入“分包异步化”

微信官方确实提供了分包异步化来放宽跨分包 JS 依赖，但这会把本期从包治理扩展成架构级改造：

- 页面路由策略会变化；
- 依赖加载时机会变化；
- 错误边界与回归成本会显著上升。

因此，本期明确不引入分包异步化。若 `M22K` 完成后主包仍高于预期，再单独评估后续架构里程碑。

### 验收指标

本期验收采用“功能不退化 + 包分析有实降”双门槛：

1. **功能门槛**
   - 任务新增、编辑、模板应用、表现项记录入口、分析页跳记录详情均保持可用。

2. **包体门槛**
   - 主包以微信开发者工具包分析结果为准，较本期实施前的实测基线下降至少 `15%`。
   - 目标值优先争取回落到 `1.3MB` 以下；若实施前复测基线口径与当前观察值存在差异，则以“相对下降幅度达标”作为正式验收线。

3. **启动门槛**
   - 未进入模板/编辑/奖励管理流前，不应在启动日志或初始化链路中看到 `TaskTemplateService`、`ValidationService` 的实例化。

---

## 代码结构

### 文件变更清单

**新增文件 / 目录**：
- `packageTask/pages/task-edit/` - 任务编辑页分包承接目录
- `packageTask/pages/task-occurrence-edit/` - 表现项编辑页分包承接目录
- `packageTask/components/task-heatmap/` - 任务编辑页独占热力组件
- `docs/design/milestone-22k-frontend-package-main-bundle-governance.md` - 本设计文档

**修改文件**：
- `app.json` - 新增 `packageTask`，移除主包中的编辑页/记录页声明，补齐 `packageChart` 页面并更新首页 `preloadRule`
- `project.config.json` - 补齐 `packOptions.ignore`
- `app.js` - 如需配合服务按需获取，保持启动调用链不依赖被延后的服务
- `models/user.js` - 同步迁移后的页面访问路径
- `services/service-manager.js` - 从 eager import 改为“核心服务启动初始化 + 特性服务懒初始化”
- `services/index.js` - 避免继续被 `service-manager` 作为全量服务入口使用
- `pages/index/index.js` - 更新跳转到任务编辑页的路径
- `packageChart/pages/analysis/analysis.js` - 更新跳转到任务记录页的路径
- `utils/permission-utils.js` - 更新受控页面白名单路径
- `packageManage/pages/task-template-manage/task-template-manage.js` - 如有依赖页面路径，按新路径更新
- `pages/task-edit/modules/*` 或对应迁移后的模块 - 跟随页面迁移修正路径
- `test/models/user.test.js` - 更新权限路径断言
- `test/services/user-service.test.js` - 更新页面访问权限断言
- 对应页面/服务测试文件 - 更新页面路径、分包路径、服务初始化时机断言

### 目标目录结构（示意）

```text
app.json
project.config.json

pages/
  index/
  rewards/
  access-gate/

packageChart/
  pages/
    analysis/
    task-record/

packageTask/
  pages/
    task-edit/
    task-occurrence-edit/
  components/
    task-heatmap/

packageManage/
packageMessage/
```

### 核心代码结构

```javascript
// service-manager.js（示意）
const TaskService = require('./task-service');
const RewardService = require('./reward-service');
const StarService = require('./star-service');
const MessageService = require('./message-service');
const OfflineQueueService = require('./offline-queue-service');
const ConfigService = require('./config-service');

class ServiceManager {
  async init() {
    this.services.starService = new StarService(...);
    this.services.messageService = new MessageService(...);
    this.services.rewardService = new RewardService(...);
    this.services.taskService = new TaskService(...);
    this.services.configService = new ConfigService(...);
    this.services.offlineQueueService = new OfflineQueueService(...);
  }

  getService(name) {
    if (name === 'taskTemplate') {
      return this.ensureTaskTemplateService();
    }
    if (name === 'validation') {
      return this.ensureValidationService();
    }
    return this.services[this.resolveName(name)];
  }

  ensureTaskTemplateService() {
    if (!this.services.taskTemplateService) {
      const TaskTemplateService = require('./task-template-service');
      this.services.taskTemplateService = new TaskTemplateService(...);
    }
    return this.services.taskTemplateService;
  }
}
```

### 关键函数

**函数1**：`ServiceManager.getService`
- **输入**：服务别名，例如 `taskTemplate`、`validation`
- **输出**：服务实例
- **职责**：对非启动必需服务执行首次访问时实例化
- **依赖**：`ensureTaskTemplateService`、`ensureValidationService`

**函数2**：首页/分析页的 `wx.navigateTo`
- **输入**：原有业务参数
- **输出**：页面跳转
- **职责**：把旧主包路径切换为新分包路径
- **依赖**：新 `app.json` 分包配置

---

## 实施步骤

### 第1步：建立包体治理基线与忽略规则（预计 2 小时）

- [ ] **任务**：补齐 `project.config.json` 的 `packOptions.ignore`
- [ ] **任务**：记录实施前主包/总包分析基线
- [ ] **验证**：开发者工具包分析能看到补齐前后结果差异
- [ ] **依赖**：无

**实施要点**：
1. 仅忽略确定不会进入运行时的文件与目录
2. 不使用过宽的后缀规则，避免误伤真实资源
3. 将基线结果写入设计实施记录，作为后续验收对照

建议补齐对象：

- `coverage/`
- `CLAUDE.md`
- `AGENTS.md`
- `jest.quality.config.js`
- `eslint.config.js`
- `task_plan.md`
- `findings.md`
- `progress.md`
- `backend.tar.gz`（若存在）

---

### 第2步：迁移页面与独占组件到正确分包（预计 4 小时）

- [ ] **任务**：新增 `packageTask` 分包
- [ ] **任务**：迁移 `task-edit`、`task-occurrence-edit`
- [ ] **任务**：迁移 `task-record` 到 `packageChart`
- [ ] **任务**：迁移 `task-heatmap` 到 `packageTask/components`
- [ ] **任务**：同步更新首页 `preloadRule`，将 `packageTask` 纳入预下载
- [ ] **验证**：所有原入口仍能正常打开对应页面
- [ ] **依赖**：第1步完成

**实施要点**：
1. 页面迁移优先保持目录内文件原样，先换包位置，不顺手改业务逻辑
2. 所有跳转路径统一通过全仓搜索替换并逐个验证
3. 迁移后确认页面 JSON 中组件路径、图片路径、样式路径全部有效
4. 迁移完成后同步核对首页 `preloadRule` 是否仍覆盖分析页和任务编辑页两条高频链路

---

### 第3步：收口服务管理器的冷启动边界（预计 4 小时）

- [ ] **任务**：移除 `service-manager` 对 `services/index.js` 的全量依赖
- [ ] **任务**：将 `TaskTemplateService`、`ValidationService` 改为懒初始化
- [ ] **任务**：同步更新 `models/user.js` 与 `utils/permission-utils.js` 的页面访问路径
- [ ] **任务**：确保 `bootstrap-services`、`post-login-bootstrap` 不再隐式依赖这两类延后服务
- [ ] **验证**：首页启动与登录后初始化链路正常
- [ ] **依赖**：第2步可并行准备，但应在最终联调前完成

**实施要点**：
1. 对外 `serviceManager.getService(...)` API 保持兼容
2. 延后初始化只影响时机，不改变服务实例依赖关系
3. 若首次访问时需要补注入 `userService` / `taskService`，在工厂函数内一次性处理
4. 权限路径更新必须同时覆盖模型权限和工具白名单，不接受只改一处的半迁移状态

---

### 第4步：回归验证与包分析验收（预计 2 小时）

- [ ] **任务**：运行目标测试
- [ ] **任务**：做关键手工回归
- [ ] **任务**：重新导出包分析结果，和实施前基线对比
- [ ] **验证**：功能回归通过，主包降幅达标
- [ ] **依赖**：第1~3步完成

**实施要点**：
1. 验收必须同时看“功能”和“包体”，不能只看其一
2. 若主包收益未达预期，先定位残留大头，再决定是否扩大范围
3. 仅当主包收益明显不足且根因明确时，才讨论后续里程碑是否追加分包异步化

---

## 测试方案

### 单元测试

| 测试项 | 测试方法 | 预期结果 |
|--------|---------|---------|
| `service-manager` 懒初始化 | 新增/扩展单测，断言启动后未实例化 `taskTemplateService`、`validationService` | 仅首次 `getService()` 时实例化 |
| 包路径跳转更新 | 针对首页/分析页入口的页面测试 | 跳转路径更新为分包路径且参数不丢失 |
| 组件迁移 | 目标页面测试或渲染测试 | `task-edit` 页面仍能正常加载 `task-heatmap` |
| 权限路径同步 | 更新 `models/user` / `user-service` 相关测试 | 迁移后页面路径仍能正确通过权限判断 |

### 集成测试

- [ ] 场景1：首页进入任务编辑页，创建任务并保存成功
- [ ] 场景2：任务编辑页进入表现项编辑页，保存成功
- [ ] 场景3：分析页进入任务记录页，详情正常展示
- [ ] 场景4：任务编辑页进入模板管理页、返回、再进入推荐模板草稿，链路不受影响
- [ ] 场景5：奖励管理页首次打开时，`ValidationService` 仍能正常使用
- [ ] 场景6：首页首次进入任务编辑页与分析页，体感不因分包迁移而明显变慢

### 手动测试

1. **包体分析**
   - [ ] 记录实施前主包大小
   - [ ] 记录实施后主包大小
   - [ ] 确认主包降幅达到目标线

2. **首页主链路**
   - [ ] 首页加载正常
   - [ ] 首页点击新建任务进入新分包页面成功
   - [ ] 首页返回不出现白屏或路径错误
   - [ ] 首页首次进入 `task-edit` 无明显额外等待感

3. **分析页链路**
   - [ ] 分析页点击记录详情进入 `packageChart` 内新路径
   - [ ] 返回分析页正常
   - [ ] 首页首次进入分析页 / 记录详情体感未明显退化

4. **模板/编辑链路**
   - [ ] 任务编辑页加载推荐模板
   - [ ] 模板管理页打开、编辑、返回正常
   - [ ] 表现项编辑链路正常

5. **启动链路**
   - [ ] 冷启动首页正常
   - [ ] 登录后初始化正常
   - [ ] 未进入编辑流前，不出现模板/验证服务被提前初始化的日志

### 回归测试建议命令

优先运行与本期直接相关的测试集：

```bash
npx jest test/pages/index.page-shell.behavior.test.js --runInBand
npx jest test/pages/task-edit.page.test.js --runInBand
npx jest test/pages/task-occurrence-edit.page.test.js --runInBand
npx jest test/pages/task-record.page.test.js --runInBand
npx jest test/pages/analysis.page.test.js --runInBand
npx jest test/services/service-manager.test.js --runInBand
npx jest test/models/user.test.js --runInBand
npx jest test/services/user-service.test.js --runInBand
```

若其中存在命名差异，以仓库实际测试文件为准调整。

---

## 风险评估

### 风险1：页面迁移后路径失配，导致跳转失败

- **风险等级**：高
- **原因**：页面路径是字符串分散在多个入口里，漏改一处就会出现运行时失败
- **缓解措施**：
  - 全仓搜索旧路径并逐项替换
  - 对首页、分析页、模板管理页入口补回归测试
  - 手工验证“进入 + 返回”双向链路

### 风险1.5：权限路径只更新到工具层，未更新模型层

- **风险等级**：高
- **原因**：`models/user.js` 仍持有正式页面访问清单，若只改 `utils/permission-utils.js`，真实权限判断与测试会继续指向旧路径
- **缓解措施**：
  - 设计和实施明确要求双处同步
  - 将 `test/models/user.test.js`、`test/services/user-service.test.js` 纳入本期必跑清单

### 风险2：`task-heatmap` 迁移后资源或样式引用失效

- **风险等级**：中
- **原因**：组件目录位置变化后，若内部存在相对路径资源引用，容易失效
- **缓解措施**：
  - 迁移时保持组件目录内部结构不变
  - 优先使用绝对组件路径
  - 迁移后对 `task-edit` 页面做渲染回归

### 风险3：服务懒初始化打破既有依赖注入顺序

- **风险等级**：高
- **原因**：`taskTemplateService` 依赖 `taskService`、`userService`；首次访问时如果注入不完整，可能出现隐性空指针
- **缓解措施**：
  - 在懒初始化工厂里显式补齐依赖注入
  - 保持 `getService()` 的返回契约不变
  - 为首次访问路径补服务级测试

### 风险4：主包降幅不如预期

- **风险等级**：中
- **原因**：共享服务和工具仍位于根目录，页面迁移不一定带来理论最大收益
- **缓解措施**：
  - 将验收定义为“相对降幅 + 冷启动减重”双指标
  - 实施后用包分析重新识别残留大头
  - 若确有必要，再单独立项评估分包异步化或更深层服务拆分

### 风险4.5：主包降了，但首页首次进入编辑页或分析页体感退化

- **风险等级**：中
- **原因**：页面从主包迁出后，如果没有同步处理预下载策略，用户会在首击时承担完整分包下载等待
- **缓解措施**：
  - 在 `app.json` 中显式把 `packageTask` 纳入首页 `preloadRule`
  - 保留对 `packageChart` 的预下载
  - 手工验证首页到编辑页/分析页的首次进入体感

### 风险5：过度追求降包，导致本期范围失控

- **风险等级**：中
- **原因**：包治理容易滑向“顺手重构半个前端”
- **缓解措施**：
  - 严格锁定为页面迁移、独占组件迁移、忽略规则补齐、启动链减重
  - 不在本期扩展到仓储、模型、业务逻辑和视觉交互重做

---

## 替代方案

### 方案A：只补 `packOptions.ignore`

**做法**：
- 不调整分包
- 只把非运行文件排除出上传/预览

**优点**：
- 风险最低
- 实施最快

**缺点**：
- 解决不了主包职责过重的问题
- 也解决不了冷启动依赖过早注入的问题
- 预计只能拿到小幅收益

**结论**：
- 不选。
- 可作为第1步必须动作，但不能单独构成完整方案。

### 方案B：只依赖 `lazyCodeLoading`

**做法**：
- 保持当前包结构不变
- 继续依赖 `lazyCodeLoading: "requiredComponents"`

**优点**：
- 不需要迁页面
- 不需要改路径

**缺点**：
- 这是注入优化，不是主包治理
- 当前项目已经启用该能力，新增收益有限
- 无法解释主包中仍存在的大页面和大组件

**结论**：
- 不选。
- 这属于现有基础，不是本期解法。

### 方案C：引入分包异步化，继续深拆共享服务

**做法**：
- 借助分包异步化突破跨分包 JS 依赖限制
- 把模板/验证等共享服务进一步挪出主包

**优点**：
- 理论收益可能更高
- 长期包治理空间更大

**缺点**：
- 风险显著上升
- 会把本期从“包治理”扩成“架构改造”
- 回归面扩大，不适合在当前阶段直接推进

**结论**：
- 本期不选。
- 若 `M22K` 完成后主包仍高于目标，再作为后续候选里程碑评估。

### 方案D：本期方案（选中）

**做法**：
- 正式补齐 `packOptions.ignore`
- 新增 `packageTask` 承接任务编辑流
- `task-record` 回归 `packageChart`
- `task-heatmap` 跟随页面迁移
- `TaskTemplateService / ValidationService` 改懒初始化

**优点**：
- 收益最大化且风险可控
- 和微信官方分包规则一致
- 不改变当前用户功能和产品交互

**缺点**：
- 不能一步做到理论最小主包
- 仍需后续观察共享服务残留体量

**结论**：
- 采用该方案作为 `M22K` 正式实施基线。
