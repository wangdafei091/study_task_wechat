# 里程碑-22A：治理与准入控制 详细设计文档

> **设计状态**：🟢 审核通过
> **创建日期**：2026-04-19
> **设计者**：GPT5 Codex
> **审核者**：项目维护者
> **预计工期**：5-7天

---

## 📋 目录

- [需求分析](#需求分析)
- [现状问题复盘](#现状问题复盘)
- [技术方案](#技术方案)
- [代码结构](#代码结构)
- [实施步骤](#实施步骤)
- [测试方案](#测试方案)
- [风险评估](#风险评估)
- [替代方案](#替代方案)
- [审核要点自检](#审核要点自检)
- [审核记录](#审核记录)

---

## 需求分析

### 功能描述

`M21O` 完成后，项目已经具备比较完整的任务、表现项、奖励、消息和同步主链路，但下一阶段最值得优先投入的，不再是继续堆叠新能力，而是先收口治理边界。当前项目存在三个已经明确暴露的问题：

1. 家庭内家长权限仍然过粗，系统只区分 `parent / child`，所有家长默认都具备完整管理能力，无法满足“少数家长管理，多数家长只读”的真实家庭场景。
2. 家庭加入已经是邀请码机制，但应用登录本身仍然是开放准入。新的微信用户完成登录后会自动创建为 `parent`，无法支撑邀请制试运营。
3. 任务与表现项的长周期边界仍然偏松。当前只对“无结束日期”的生成窗口做了 30/90 天兜底，但对显式超长 `endDate` 还没有正式上限，存在性能、数据膨胀和误操作风险。

`M22A` 的目标，就是把这三件事作为一个统一的治理里程碑正式收口：先解决“谁能进、谁能改、能改多大”，再进入后续的审计可观测与引导体验阶段。

### 业务价值

- [x] 用户价值：降低多家长家庭中的误操作风险，让只想查看的家长天然处于安全模式。
- [x] 产品价值：支持邀请制运营，避免应用在试运营阶段无限制扩散。
- [x] 技术价值：把权限、准入和时长护栏从零散条件判断提升为正式契约，为后续审计、引导和复杂度治理提供稳定基线。

### 功能范围

**包含**：

- [x] 为家庭内家长引入正式的分层权限角色
- [x] 统一前端页面权限、只读态和后端写入鉴权的家长分层口径
- [x] 引入应用级邀请制准入，限制新用户直接进入系统
- [x] 为任务重复周期和表现项适用周期增加正式上限
- [x] 在前端表单校验、后端模型校验和接口错误码中统一护栏表达
- [x] 补齐迁移策略、回填策略和关键自动化测试

**不包含**：

- [x] 不做管理员操作审计页和行为分析平台，这属于 `M22B`
- [x] 不做新手 onboarding、空状态引导和首次进入教学，这属于 `M22E`
- [x] 不做应用级邀请码管理后台；首期只提供后端配置和轻量运维脚本
- [x] 不重做现有 `loginUser / currentUser` 基础模型，只在 `M20A` 之上扩展权限维度
- [x] 不把奖励域强行纳入“最长周期限制”；本期只治理任务/表现项/模板链路的日期跨度

### 优先级

- **优先级**：P0
- **理由**：这是当前最直接影响治理安全和运营控制的缺口。继续在现有粗粒度权限和开放准入上推进业务，只会放大误操作和不可控扩散风险。

---

## 现状问题复盘

### 问题1：当前家长权限模型只有 `parent / child` 两级

当前前端和后端的大部分权限判断都仍然建立在 `role === 'parent'` 这一层上：

- 前端 [models/user.js](/Users/wangdafei/code/study_task_wechat/models/user.js) 只定义了 `PARENT / CHILD`
- 前端 [utils/permission-utils.js](/Users/wangdafei/code/study_task_wechat/utils/permission-utils.js) 也是按这两类角色发放页面和功能权限
- 前端 [utils/user-context.js](/Users/wangdafei/code/study_task_wechat/utils/user-context.js) 中 `canManageMembers` 本质上仍是 `loginUserRole === 'parent'`
- 后端 [backend/controllers/familyController.js](/Users/wangdafei/code/study_task_wechat/backend/controllers/familyController.js)、任务/奖励/星星相关 controller 大量使用 `req.user.role === 'parent'` 作为放行条件

这意味着：

1. 只要是家长，就天然拥有完整管理能力。
2. 无法表达“家长但只读”的安全模式。
3. 无法表达“少数家长可管理，多数家长只查看”的正式分层。

### 问题2：应用级准入仍然是开放模式

家庭加入已经具备邀请码机制，但它解决的是“如何加入某个家庭”，不是“谁能进入这个应用”。

- 家庭加入：后端 [backend/services/familyService.js](/Users/wangdafei/code/study_task_wechat/backend/services/familyService.js) 已支持一次性、带过期时间的邀请码
- 应用登录：后端 [backend/controllers/authController.js](/Users/wangdafei/code/study_task_wechat/backend/controllers/authController.js) 登录后直接调用 [backend/services/userService.js](/Users/wangdafei/code/study_task_wechat/backend/services/userService.js) 的 `getOrCreateUser(...)`
- 新用户创建：当前默认直接创建成 `role: 'parent'`

这会带来两个问题：

1. 试运营阶段无法控制新增用户规模。
2. “扫码即可进入”与“邀请制使用”的产品目标冲突。

### 问题3：长周期任务当前缺少正式硬上限

当前系统对日期边界的治理还不完整：

- 前端 [utils/task-form-core.js](/Users/wangdafei/code/study_task_wechat/utils/task-form-core.js) 已支持 `same-day / duration / week-end / month-end / no-end` 等策略，但没有正式最大跨度常量
- 前端 [models/task.js](/Users/wangdafei/code/study_task_wechat/models/task.js) 只校验“结束日期不能早于开始日期”
- 前端 [services/task-service/task-repeat.js](/Users/wangdafei/code/study_task_wechat/services/task-service/task-repeat.js) 与后端 [backend/services/taskService.js](/Users/wangdafei/code/study_task_wechat/backend/services/taskService.js) 仅对“无结束日期”场景使用 30/90 天默认展开窗口

这意味着：

1. 显式填很长的 `endDate` 仍然可以进入链路。
2. 系统对“无结束日期”有兜底，但对“人为输入超长周期”缺少正式防线。
3. 周期越长，实例生成、同步、读取和后续编辑成本都会随之增大。

### 问题4：现有数据和现有家庭不能被粗暴切断

`M22A` 不是从零开始的新产品：

- 已有家庭里可能已经有多个家长在共同使用
- 已有任务里可能存在超过未来上限的历史数据
- 已有登录用户不能因为邀请制上线而被挡在门外

因此本期不能采用“直接开新规则，老数据一律报错”的粗暴做法，必须提供平滑迁移和兼容边界。

### 问题5：现有家庭邀请码链路缺少“新家长默认 viewer”的正式约束

当前家庭邀请码只有一组单字段：

- `families.invite_code`
- `families.invite_code_role`
- `families.invite_code_expires_at`
- `families.invite_code_used_at`

当前家庭邀请码虽然已经能表达“邀请家长”还是“邀请孩子”，但 join 链路里仍然只有 `role=parent|child` 这一层，没有正式规则约束“新加入的家长默认只能查看”。如果不在设计里明确：

1. 新邀请家长很容易再次被默认赋予完整管理能力。
2. “邀请家长”和“授予管理权”会被混成同一件事。
3. 家庭邀请码虽然存在，但仍然无法真正承担“安全引入新家长”的职责。

### 问题6：现有登录入口不止一条，邀请制必须有统一 source of truth

当前前端至少有三条登录触发路径会调用 `auth/login`：

- `runWxLogin(...)`
- `doCloudLogin(...)`
- `autoLogin(...)`

如果设计只写“收到错误码后跳到 `access-gate` 页面”，但不定义邀请码存储位置和所有登录入口如何统一带参，就会出现：

1. 首次登录能填邀请码。
2. 自动登录和重新登录却仍然只传 `{ code }`。
3. 用户进入“看起来填过邀请码，但自动登录永远失败”的分叉状态。

---

## 技术方案

### 方案概述

`M22A` 采用“三条链路一起收口，但各自边界明确”的方案：

1. **家庭内家长分层权限**
   - 保留现有 `role = parent / child`
   - 新增 `familyPermissionRole`
   - 让前端 UI 权限、只读态和后端写入鉴权同时消费这一层正式权限
2. **应用级邀请制准入**
   - 在 `auth/login` 上增加可选 `accessCode`
   - 新用户在 `invite_only` 模式下必须先通过应用邀请码校验，已有用户不受影响
3. **任务与表现项周期护栏**
   - 在表单层、模型层、接口层统一设置最大跨度
   - 对已有超长历史数据采用“可读、可保存不扩张、不可继续拉长”的兼容策略

本期不追求一次性做成完整后台，而是优先建立可靠的正式契约：

- 家长权限不再只靠 `parent` 一刀切
- 邀请制不再只是一句运营口号
- 长周期约束不再只靠隐式默认窗口

### 核心设计决策

#### 决策1：保留 `role`，新增 `familyPermissionRole`

当前 `role` 已广泛用于前后端身份语义，直接把 `parent` 拆成多个角色会造成过大扰动。因此本期不改 `role`，而是新增第二维权限字段：

```typescript
type UserRole = 'parent' | 'child';
type FamilyPermissionRole = 'manager' | 'viewer' | null;
```

规则如下：

- `role='child'` 时，`familyPermissionRole = null`
- `role='parent'` 且未加入家庭时，`familyPermissionRole = null`
- `role='parent'` 且已加入家庭时：
  - 家庭创建者默认 `manager`
  - 其他家长按迁移策略回填

创建家庭写入要求：

- `createFamily(...)` 成功后，创建者除了获得 `familyId` 外，必须在同一事务内写入 `familyPermissionRole='manager'`
- 这条规则属于新数据正式契约，不能只依赖历史迁移脚本补救

选择理由：

- `role` 继续承担“身份类型”语义
- `familyPermissionRole` 专门承担“家庭内治理能力”语义
- 与 `M20A` 的 `loginUser / currentUser / permissionContext` 模型兼容，不需要推翻现有上下文系统

#### 决策2：家长权限采用两层模型 `manager / viewer`

本期正式定义两层家长权限：

| 能力 | `manager` | `viewer` |
|------|-----------|----------|
| 查看首页/奖池/消息/分析 | 是 | 是 |
| 切换到孩子视角查看 | 是 | 是 |
| 创建/编辑/删除任务 | 是 | 否 |
| 完成/重置任务、记录表现项 | 是 | 否 |
| 创建/编辑/删除奖励、发放奖励 | 是 | 否 |
| 手动调整星星 | 是 | 否 |
| 创建/删除虚拟孩子成员 | 是 | 否 |
| 刷新孩子邀请码 | 是 | 否 |
| 刷新家长邀请码 | 是 | 否 |
| 修改其他家长权限 | 是 | 否 |

补充约束：

- `viewer` 是真正的只读家长，不允许触发任何会改变孩子记录的操作
- `manager` 是正式管理员，同时承担业务管理和家庭治理能力
- 本期不再保留单独的 `owner` 层，避免过度设计

这样可以直接满足“少数家长管理，多数家长查看”的核心诉求，同时避免为一个尚未明确存在的中间层额外增加理解成本。

#### 决策2A：家庭治理必须满足“至少保留一个 manager”

`manager / viewer` 两层模型建立后，必须同步补上家庭治理不变量，否则家庭仍可能被操作成“所有人都只能看、无人能维护”的状态。

本期正式规则：

1. 每个家庭任意时刻至少保留一个 `manager`。
2. `manager` 可以调整其他家长的权限，但不能把家庭里的最后一个 `manager` 降级为 `viewer`。
3. `manager` 可以主动降级自己，但前提是家庭内已经存在另一个 `manager`。
4. 删除或移出家长成员时，若目标成员是家庭内最后一个 `manager`，则必须先完成管理员交接，否则拒绝。
5. `viewer` 无权调整任何家长权限，也无权改变 `manager` 数量。

接口约束：

- `PATCH /api/families/members/:userId/permission-role` 必须执行“最后一个 manager 不可被移除”的 authoritative 校验。
- 相关家庭成员删除/移出接口也必须复用同一约束，而不是只在页面按钮层隐藏。

选择理由：

- 这是治理模型的基础安全线，不能依赖运营约定或人工自觉。
- 只有把该规则写成正式契约，后续家庭权限 UI 和后端校验才不会出现语义分叉。

#### 决策3：历史家庭迁移采用“现有家长全部回填为 manager，新邀请家长默认 viewer”的低扰动策略

对已存在的家庭，本期不把历史家长批量降为 `viewer`，原因是这样会立即打断现有使用习惯。

迁移策略：

- 同家庭现有 `role='parent'` 的活跃成员全部回填为 `manager`
- 新生成的“家长邀请码”默认目标权限为 `viewer`

这意味着：

- 老家庭原有协作能力基本保留
- 新进入的家长默认按更安全的只读模式落位
- 是否把某个家长升级为 `manager`，由现有 `manager` 后续显式调整

#### 决策3A：家庭邀请码不新增权限字段，父母邀请码固定落为 `viewer`

在 2 角色模型下，本期不再为家庭邀请码新增 `familyPermissionRole` 参数或数据库字段，而是直接把“家长邀请码默认落为 `viewer`”写成 join 链路规则。

```typescript
interface FamilyInviteConfig {
  inviteCode: string;
  inviteCodeRole: 'parent' | 'child';
  inviteCodeExpiresAt: number | null;
  inviteCodeUsedAt: number | null;
}
```

规则如下：

- `inviteCodeRole='child'` 时，加入者继续按现有逻辑成为 `child`
- `inviteCodeRole='parent'` 时，加入者的 `role='parent'`，但 `familyPermissionRole` 固定写为 `viewer`
- 若该家长后续需要管理权限，由家庭内现有 `manager` 在家庭设置页显式提升

落地方式：

- 不新增 `families` 表字段
- `refreshInviteCode(...)` 继续只记录 `invite_code_role`
- `joinFamily(...)` 当 `invite_code_role='parent'` 时，直接把加入者写成 `family_permission_role='viewer'`

选择这个方案的原因：

- 本期沿用现有“家庭只维护一组当前邀请码”的产品模型
- 改动明显小于新增一套 `family_invites` 实体或额外权限字段
- 更符合“邀请加入家庭”和“授予管理权”是两步操作的产品心智

#### 决策4：应用级邀请制和家庭邀请码分层处理

本期明确区分两类邀请码：

1. **应用级邀请码**
   - 解决“谁可以成为系统用户”
   - 作用在 `auth/login`
2. **家庭邀请码**
   - 解决“进入系统后加入哪个家庭、以什么身份加入”
   - 继续作用在 `families/join` 和 `families/current/invite-code`

正式规则：

- 已存在用户登录时，不受应用级邀请码阻断
- 新用户登录时：
  - `APP_ACCESS_MODE=open`：按现有逻辑直接创建用户
  - `APP_ACCESS_MODE=invite_only`：必须提供有效 `accessCode`

这样可以避免把“应用准入”和“家庭加入”搅在一起，也避免重复造一套家庭邀请码的扩展规则。

#### 决策5：应用级邀请制首期不做后台，采用“配置 + 数据表 + 运维脚本”

本期不新增超级管理员后台，也不在小程序里暴露“创建应用邀请码”的入口。

首期实现采用：

- 后端环境配置：`APP_ACCESS_MODE=open|invite_only`
- 新表：`app_access_codes`
- 轻量运维脚本：生成 / 停用 / 查询邀请码
- 前端最小页面：邀请码输入页

选择理由：

- 这是试运营治理需求，不是面向普通家长的高频功能
- 先做后台会显著扩大 `M22A` 范围
- 没有运维脚本则邀请制不可操作，因此脚本属于必要配套

#### 决策5B：应用邀请码由项目运营方生成和管理，默认 7 天有效、1 次使用

应用级邀请码不是家庭成员之间互相邀请用的功能，而是试运营阶段的准入闸门，因此本期明确不下放给普通家长管理。

正式规则：

- 生成者：项目维护者 / 运营管理员，通过后端运维脚本生成
- 管理者：项目维护者 / 运营管理员，通过运维脚本停用、重发或查看使用情况
- 小程序端不提供“创建应用邀请码”的入口
- 默认策略：`maxUses = 1`、`expiresAt = 生成后 7 天`
- 运维脚本允许按需覆盖默认值，例如批量生成、延长有效期或设置多次可用，但这属于运营例外，不是默认产品心智

这样设计的原因：

- 普通家长不应接触应用级准入控制，否则会把“家庭邀请”和“平台放量”混在一起
- 7 天比 24 小时更符合试运营邀请码的实际传播链路，减少“刚拿到码就过期”的挫败感
- 默认单次使用最利于控制试运营用户扩散范围

运维落地要求：

- 本期至少提供以下脚本能力：
  - `generate-app-access-codes`：生成邀请码
  - `disable-app-access-codes`：停用邀请码
  - `list-app-access-codes`：按状态或时间查看邀请码及使用情况
- 若实施阶段决定合并为单一多命令脚本，也必须在文件清单和实施步骤中明确，不允许只交付“生成”能力却保留“停用/查看”文档承诺

#### 决策5C：家庭邀请码由家庭内 `manager` 管理，保持“单码、一次性、24 小时”模型

家庭邀请码属于家庭内协作工具，不属于平台准入控制，因此管理权限归家庭管理员。

正式规则：

- 生成者：家庭内任一 `manager`
- 管理者：家庭内任一 `manager`
- 入口：`family-settings` 页面现有邀请码区域
- 作用对象：`parent` 或 `child`
- 有效期：默认 24 小时
- 使用次数：1 次
- 刷新规则：每次刷新都会让旧邀请码立即失效，只保留当前最新一组邀请码

这样设计的原因：

- 与当前已实现链路一致，用户学习成本最低
- 家庭邀请是高频短链路场景，24 小时更安全
- “单码 + 一次性”更容易解释，也更符合家庭内真实使用频率

#### 决策5A：应用邀请码前端统一保存在 `pendingAppAccessCode`

邀请制首期必须定义前端统一的邀请码来源，不允许每条登录链路各自传参。

本期正式规则：

- 本地持久化键：`pending_app_access_code`
- 页面 `pages/access-gate/` 提交成功后，先把邀请码写入本地，再触发统一登录入口
- `runWxLogin(...)`、`doCloudLogin(...)`、`autoLogin(...)` 内部都不直接调用 `loginWithCode(code)`，而是统一调用：

```javascript
loginWithCode({
  code,
  accessCode: loadPendingAppAccessCode()
});
```

消费规则：

- 新用户登录成功后，清空 `pending_app_access_code`
- 老用户登录成功后，也清空本地邀请码残留
- 若后端返回 `AUTH_APP_ACCESS_CODE_INVALID / EXPIRED / REQUIRED`，保持本地邀请码或跳转输入页，让用户重新输入

这样可以保证三条登录入口共用同一 source of truth，避免自动登录、手动登录和首次登录出现分叉行为。

#### 决策6：周期护栏只治理任务/表现项/模板链路，不扩到奖励域

本期正式护栏如下：

```typescript
const MAX_REPEAT_TASK_RANGE_DAYS = 93;
const MAX_OCCURRENCE_ACTIVE_RANGE_DAYS = 180;
const MAX_TEMPLATE_REPEAT_RANGE_DAYS = 93;
```

规则说明：

- 重复任务的显式开始/结束跨度最大 93 天
- 表现项 `activeRange` 的显式跨度最大 180 天
- 模板中的任务日期策略跟随相同限制
- `no-end` 仍保留，但继续使用现有 30/90 天展开窗口，不在本期取消

不治理奖励域的原因：

- 当前奖励模型没有与任务重复实例同等级的日期展开压力
- 奖励域的核心风险在余额与履约语义，不在时间跨度

#### 决策7：历史超长数据采用“只阻止继续扩张，不阻断读取”

这是本期一个必须明确的兼容规则。

对已存在的超长任务/表现项：

- 允许继续读取和展示
- 允许在不扩大日期跨度的前提下修改非日期字段
- 不允许进一步延长 `endDate` 或把跨度从合法改成更大

这样可以避免：

- 老数据上线后无法打开
- 用户只改标题/描述却被新规则卡死
- 一次治理把历史资产全部变成不可编辑垃圾数据

#### 决策7A：兼容规则必须落在更新写路径，而不只是模型校验

“历史超长数据允许改非日期字段”的兼容承诺，单靠 stateless model validation 无法实现，必须在更新写路径里拿到“旧值 + 新值”进行比较。

本期正式钩子：

- 前端：`services/task-service/task-write.js`
- 后端：`backend/services/taskService.js`

正式规则：

1. 新建任务/表现项：直接使用新上限校验
2. 更新已有任务/表现项：
   - 若原始跨度已超上限，且本次修改不扩大跨度，则允许通过
   - 若原始跨度已超上限，且本次继续扩大跨度，则拒绝
   - 若原始跨度在上限内，但修改后超上限，则拒绝

这层比较逻辑属于 service 层职责，不写进这两个更新入口，设计中的兼容承诺就无法兑现。

### 交互与视觉收口

`M22A` 虽然是治理里程碑，但交付目标不能只停留在“规则正确”。本期页面体验必须同时满足：

1. **极简**：用户只看到当前阶段最需要做的事，不把权限和邀请码解释堆成后台表单。
2. **易懂**：优先使用自然语言，不直接把 `manager / viewer` 这类实现术语暴露给普通家长。
3. **精致**：页面层级要有主次，重点信息前置，辅助解释后置，禁用态和错误态不能粗糙。
4. **好用**：尽量减少“为什么我不能操作”的疑惑，减少误触和规则惊吓。

#### 交互决策8：权限命名面向用户收口为“管理员 / 查看者”

实现层继续使用 `manager / viewer`，但页面展示统一使用：

- `管理员`
- `查看者`

禁止直接在 UI 中展示英文或实现字段名，例如：

- 禁止：`manager`
- 禁止：`viewer`
- 禁止：`familyPermissionRole`

说明文案也要面向用户，而不是面向工程：

- `管理员`：可管理任务、奖励和家庭设置
- `查看者`：可查看记录和进展，不能修改内容

这样做的原因：

- 普通家长不需要理解实现名词
- “管理员 / 查看者”比“管理权限 / 只读权限”更稳定，也更接近日常产品表达

#### 交互决策9：家庭设置页采用“状态优先、操作其次”的信息层级

结合当前 [family-settings.wxml](/Users/wangdafei/code/study_task_wechat/packageManage/pages/family-settings/family-settings.wxml) 结构，本期不重做页面架构，但必须重排视觉优先级，正式顺序如下：

1. 家庭概览卡
2. 当前身份卡
3. 邀请码卡
4. 家庭成员卡
5. PIN 设置卡

页面目标：

- 用户进入后，先知道“我在哪个家庭、我现在是什么身份、我能做什么”
- 然后才看到“邀请别人”“管理成员”“设置 PIN”

具体要求：

- 家庭概览卡只保留家庭名称与一行辅助信息，不强调 `familyId`
- `familyId` 下沉到次级信息，默认不作为主视觉内容
- 当前身份卡必须显式展示：
  - 当前身份标签：`管理员` 或 `查看者`
  - 一句简短说明
- 邀请码卡默认展示当前邀请码、邀请对象、剩余有效期
- 成员卡中，家长成员优先显示身份标签，再显示昵称

#### 交互决策10：查看者页面以“少打扰”为原则，不做满屏禁用

`viewer` 进入页面后，不应看到大量不可点击按钮，否则页面会显得像坏掉的后台。

正式规则：

- 对明确不该触达的治理动作，优先**隐藏**
- 对用户能看到但当前不能执行、且有助于理解规则的动作，使用**禁用 + 一句原因说明**

页面级策略：

- 首页、奖池、奖励管理、任务编辑等业务页：
  - 创建、编辑、删除、发放、调整类按钮默认隐藏
  - 页面顶部可出现一条轻提示：`当前为查看者，可查看记录，不能修改内容`
- 家庭设置页：
  - 邀请码刷新、添加孩子、权限调整等操作不应全部消失
  - 对查看者保留结构，但按钮置灰，并在卡片底部展示一句解释：`只有管理员可以邀请成员或调整权限`

这样做的原因：

- 业务页以浏览为主，隐藏比禁用更干净
- 家庭设置页本身就是治理页，适当保留禁用态更有助于用户理解自己为什么不能操作

#### 交互决策11：邀请码页必须是“准入说明页”，不是裸输入框

`pages/access-gate/` 首次进入时，页面必须包含四层信息：

1. 标题：`请输入邀请码`
2. 一句解释：`当前为邀请制体验，输入邀请码后即可进入`
3. 输入区：单个邀请码输入框 + 主要按钮
4. 辅助说明：`邀请码通常由项目维护者提供`

视觉要求：

- 输入区是页面主焦点
- 标题与解释之间留出明显呼吸感
- 不在同屏堆放过多规则说明
- 错误反馈显示在输入区附近，不通过系统级长弹窗反复打断

错误文案要求：

- `邀请码无效，请检查后重试`
- `邀请码已过期，请联系维护者重新获取`
- `网络异常，请稍后再试`

禁止使用工程化文案：

- 禁止：`AUTH_APP_ACCESS_CODE_INVALID`
- 禁止：`access code required`

#### 交互决策12：邀请码卡文案要解释“邀请谁”和“加入后会怎样”

家庭设置页邀请码卡，不能只显示“家长邀请码 / 孩子邀请码”。

必须补一行说明文案：

- 选择 `家长` 时：
  - `对方加入后默认为查看者，如需协助管理，可稍后手动设为管理员`
- 选择 `孩子` 时：
  - `适合给孩子设备加入家庭，不具备管理权限`

这样可以直接化解两个困惑：

- 为什么新家长进来不能直接管理
- 家长邀请码和孩子邀请码到底差在哪

#### 交互决策13：关键阻止操作必须用“解释型反馈”，不能只报失败

以下阻止场景，反馈必须说明“为什么”和“下一步怎么办”：

1. 最后一个管理员不能降级
   - 文案：`至少保留一位管理员。请先把另一位家长设为管理员，再调整当前身份`
2. 查看者尝试执行治理动作
   - 文案：`当前为查看者，不能修改家庭设置`
3. 超长周期被拒绝
   - 文案：`时间范围过长，请缩短后再保存`

禁止只给技术性失败提示，例如：

- `操作失败`
- `权限不足`
- `校验失败`

#### 交互决策14：手工测试必须覆盖“看起来顺不顺”的主观体验项

本期手工测试除了验证功能正确，还必须检查以下体验项：

- 首次进入家庭设置页时，用户能否在 3 秒内理解“我当前是什么身份”
- 查看者是否会因为按钮全部消失而困惑
- 邀请码页是否像正式产品入口，而不是内部调试页
- 家庭设置页信息块是否存在明显主次，不会看起来四块卡片同权平铺

#### 交互决策15：页面级视觉规范必须收口到可实施程度

本期不要求输出高保真视觉稿，但必须把页面级视觉规范收口到“前端可以直接实现且不会走样”的程度。视觉原则如下：

1. **单页只保留一个主焦点**
2. **主操作只有一个高强调按钮**
3. **说明文案短而准，不堆砌规则**
4. **禁用态要像“当前不可操作”，不能像“页面坏了”**

##### 页面A：`family-settings`

视觉定位：

- 家庭治理页，不是工具集合页
- 观感应稳定、清晰、克制
- 不使用过强装饰，不做大面积渐变或多色块抢焦点

布局规范：

- 页面背景维持浅色中性底，卡片负责承载信息
- 卡片圆角、阴影、留白保持统一，不允许某些卡片明显更厚重、某些卡片过于扁平
- 卡片之间的垂直间距应大于卡片内部字段间距，确保块级层次明显

信息层级规范：

- 家庭概览卡：
  - 只突出家庭名称
  - `familyId` 下沉为弱化次信息
  - 不再把 `familyId` 当成次标题主内容
- 当前身份卡：
  - 必须比其他卡片更靠前
  - 右侧可放身份标签：`管理员` / `查看者`
  - 下方只放 1 句能力说明，不超过 18 个字
- 邀请码卡：
  - 当前邀请码数字或字母组是视觉焦点
  - `复制` 是次级按钮，`刷新邀请码` 是主操作按钮
  - 邀请对象切换器放在邀请码说明下方，不要压过邀请码本身
- 成员卡：
  - 成员昵称是第一层
  - 身份标签是第二层
  - 删除、调整权限等动作放到最右侧，弱于成员信息本身
- PIN 卡：
  - 放在页面最下方
  - 不能与邀请码、权限管理竞争注意力

文案与标签规范：

- 家长成员标签显示为：
  - `家长 · 管理员`
  - `家长 · 查看者`
- 孩子成员标签显示为：
  - `孩子`
  - `孩子（共享设备）`
- 禁止标签文案过长，例如：
  - 禁止：`当前拥有完整业务及家庭治理权限`
  - 建议：`可管理任务、奖励和家庭设置`

按钮规范：

- 每张卡片最多 1 个主按钮
- 主按钮用于当前卡片最重要动作：
  - 邀请码卡：`刷新邀请码`
  - 家庭成员卡：`添加孩子`
- 复制、清除、删除等动作统一用次级样式或危险文本样式
- 页面内不允许同一屏出现多个同等强调的蓝色实心按钮

禁用态规范：

- 查看者看到的不可操作按钮：
  - 背景改为浅灰
  - 文案改为中灰
  - 边框弱化
  - 保留正常布局，不塌陷
- 禁用按钮下必须有 1 句说明：
  - `只有管理员可以邀请成员或调整权限`
- 禁止只把透明度降很低而不解释，否则像故障态

空态规范：

- 未加入家庭时，空态只表达一件事：`创建家庭或输入邀请码加入`
- 当前空态中的大 emoji 可以保留为临时实现，但正式交付应优先替换为更克制的插画占位或简洁图形，不让页面显得幼稚或工具化
- 空态区域中只保留两个按钮：
  - 主按钮：`创建家庭`
  - 次按钮：`输入邀请码加入`

##### 页面B：`access-gate`

视觉定位：

- 首次准入页
- 应让用户感到“这是正常的开始步骤”，不是异常拦截页

布局规范：

- 页面垂直居中偏上，顶部保留足够留白
- 结构顺序固定：
  1. 标题
  2. 解释文案
  3. 输入框
  4. 主按钮
  5. 辅助说明
- 不放多余卡片组，不要把页面做成设置页样式

视觉焦点规范：

- 输入框是主焦点
- 主按钮是第二焦点
- 辅助说明使用弱化灰色，不参与第一层竞争

标题与说明规范：

- 标题：`请输入邀请码`
- 副标题：`当前为邀请制体验，输入邀请码后即可进入`
- 辅助说明：`邀请码通常由项目维护者提供`
- 说明文字不超过两行，不做长段规则解释

输入框规范：

- 使用单输入框，不拆成多个格子，避免像短信验证码
- 输入框高度、圆角、边框强度要明显高于辅助说明
- 获焦态只强调边框和阴影，不使用刺眼高饱和色

错误态规范：

- 错误文案贴近输入框显示
- 错误出现后保留用户已输入内容，方便修改
- 错误文案使用短句，不超过 16 个字优先
- 错误态颜色只服务识别，不做大面积红底警告块

按钮规范：

- 页面只有 1 个主按钮：`继续`
- 主按钮宽度与输入框对齐
- 未输入邀请码时按钮可禁用，但禁用态仍需保持完整轮廓

##### 统一视觉约束

- 本期治理页统一避免：
  - 大面积纯蓝按钮连续出现
  - 过多 emoji 作为主要视觉语言
  - 同一页面超过两种强调色
  - 一屏出现超过两个主操作按钮
- 字体层级遵循：
  - 页面标题 > 卡片标题 > 主信息 > 辅助说明 > 状态说明
- 状态标签遵循：
  - `管理员` 用低饱和深色标签，不做刺眼高亮
  - `查看者` 用更轻的中性色标签，表达“可看不可改”

### 数据模型

#### 用户权限模型

```typescript
interface UserProfile {
  userId: string;
  role: 'parent' | 'child';
  familyId: string | null;
  familyPermissionRole: 'manager' | 'viewer' | null;
}
```

#### 应用邀请码模型

```typescript
interface AppAccessCode {
  id: string;
  code: string;
  status: 'active' | 'disabled' | 'consumed' | 'expired';
  maxUses: number;
  usedCount: number;
  expiresAt: number | null;
  boundUserId: string | null;
  note: string;
  createTime: number;
  modifyTime: number;
}
```

#### 权限上下文模型

```typescript
interface PermissionContext {
  loginUserRole: 'parent' | 'child' | null;
  familyPermissionRole: 'manager' | 'viewer' | null;
  isSwitchedChildView: boolean;
  isViewerReadonly: boolean;
  isReadonlyView: boolean;
  canManageFamilyGovernance: boolean;
  canManageBusinessData: boolean;
}
```

说明：

- `isSwitchedChildView`：沿用现有语义，表示“家长切到孩子视角”或“孩子设备查看自己”
- `isViewerReadonly`：新增语义，表示“当前登录家长是 viewer，因此业务写入口只读”
- `isReadonlyView`：兼容字段，正式定义为 `isSwitchedChildView || isViewerReadonly`
- `role='parent'` 且 `familyId=null` 时：
  - `familyPermissionRole = null`
  - `isViewerReadonly = false`
  - `canManageBusinessData = true`
  - `canManageFamilyGovernance = false`

补充解释：

- “未加入家庭的家长”不是 `viewer`，不能被误判成只读用户。
- `canManageBusinessData = true` 的目的是保持其在创建家庭、接受邀请、完成初始化链路时不被只读态短路，而不是允许其绕过 `familyId` 去操作不存在的家庭数据。
- `canManageFamilyGovernance = false` 只表示“当前没有家庭可治理”，不能拿它去隐藏“创建家庭 / 加入家庭”入口；这些入口应继续由独立的未入家庭状态控制。

要求：

- 新代码优先消费 `canManageBusinessData / canManageFamilyGovernance / isViewerReadonly`
- 旧代码保留 `isReadonlyView` 兼容，但不能再把它单独解释为“孩子视角”

#### 家庭邀请码扩展模型

```typescript
interface FamilyInviteConfig {
  inviteCodeRole: 'parent' | 'child';
  inviteCodeExpiresAt: number | null;
  inviteCodeUsedAt: number | null;
}
```

### DDD分层设计

**领域层（models/、backend/models/）**：
- [x] 修改模型：`models/user.js`
- [x] 修改模型：`backend/models/User.js`
- [x] 修改模型：`models/task.js`
- [x] 修改模型：`backend/models/Task.js`
- [x] 修改模型：`models/task-template.js`
- [x] 修改模型：`backend/models/TaskTemplate.js`
- [x] 新建模型：`backend/models/AppAccessCode.js`
- 说明：
  - 用户模型补齐 `familyPermissionRole`
  - 任务与模板模型补齐最大跨度校验
  - 新增应用邀请码领域对象，封装状态和值对象规则

**服务层（services/、backend/services/）**：
- [x] 修改服务：`services/user-service.js`
- [x] 修改服务：`services/task-service/task-write.js`
- [x] 修改服务：`services/task-template-service.js`
- [x] 修改服务：`backend/services/userService.js`
- [x] 修改服务：`backend/services/familyService.js`
- [x] 修改服务：`backend/services/taskService.js`
- [x] 修改服务：`backend/services/taskTemplateService.js`
- [x] 新建服务：`backend/services/appAccessService.js`
- [x] 修改服务：`services/validation-service.js`
- 说明：
  - 前端统一读取新的家长权限上下文
  - 后端统一在家庭治理和业务写入前解析家长权限
  - 应用邀请码的生成、校验、消费由独立服务负责
  - 历史超长数据兼容逻辑在前后端任务/模板更新写路径收口，不只停留在模型层

**仓储层（repositories/）**：
- [x] 不新增前端仓储
- 说明：
  - 前端本期不新增正式仓储
  - 后端沿用当前 service + SQL 模式，不额外引入 repository 层

**适配器层（utils/、backend/utils/）**：
- [x] 修改工具：`utils/user-context.js`
- [x] 修改工具：`utils/permission-utils.js`
- [x] 修改工具：`utils/task-form-core.js`
- [x] 修改工具：`utils/app/bootstrap-auth.js`
- [x] 新建脚本：`backend/scripts/generate-app-access-codes.js`
- 说明：
  - 前端权限解析从“只看 `role`”升级为“`role + familyPermissionRole`”
  - 登录引导链路需要识别应用邀请码错误码
  - 运维脚本用于生成/停用应用邀请码

**表现层（pages/、components/）**：
- [x] 新建页面：`pages/access-gate/`
- [x] 修改页面：`packageManage/pages/family-settings/`
- [x] 修改页面：`pages/index/`
- [x] 修改页面：`pages/task-edit/`
- [x] 修改页面：`pages/task-occurrence-edit/`
- [x] 修改页面：`packageManage/pages/task-template-edit/`
- [x] 修改页面：`packageManage/pages/reward-manage/`
- 说明：
  - 新增邀请码输入页
  - 家庭设置页补齐家长权限展示和调整入口
  - 只读家长在各业务页统一隐藏或禁用写操作入口
  - 模板编辑页同步展示日期跨度限制和只读态

### 接口设计

#### 修改接口：`POST /api/auth/login`

请求体新增：

| 字段 | 说明 |
|------|------|
| `accessCode` | 可选，应用级邀请码 |

新增错误码：

| 错误码 | 含义 |
|--------|------|
| `AUTH_APP_ACCESS_CODE_REQUIRED` | 当前为邀请制，新用户未提供邀请码 |
| `AUTH_APP_ACCESS_CODE_INVALID` | 邀请码无效或已禁用 |
| `AUTH_APP_ACCESS_CODE_EXPIRED` | 邀请码已过期 |

#### 修改接口：`GET /api/auth/current`

返回中新增：

| 字段 | 说明 |
|------|------|
| `familyPermissionRole` | 当前家长在家庭中的权限层级 |

前端刷新契约：

- 以下成功操作后，前端必须立即重新拉取 `auth/current` 或刷新等价用户上下文缓存，不允许继续依赖旧 JWT 中的派生权限：
  - `createFamily`
  - `joinFamily`
  - `PATCH /api/families/members/:userId/permission-role`
  - 当前登录家长自身权限被降级或提升
- 刷新完成前，页面不得继续显示旧权限对应的治理按钮或写操作入口

#### 修改接口：`POST /api/families/current/invite-code`

请求体保持现有 `role=parent|child`：

| 字段 | 说明 |
|------|------|
| `role` | 邀请目标身份，`parent` 或 `child` |

正式规则：

- 若 `role='child'`，加入者按现有逻辑成为 `child`
- 若 `role='parent'`，加入者成为 `parent`，同时 `familyPermissionRole` 固定落为 `viewer`
- 若后续需要管理权限，由家庭内现有 `manager` 在家庭设置页手动提升

#### 新增接口：`PATCH /api/families/members/:userId/permission-role`

| 方法 | 说明 | 参数 | 返回值 |
|------|------|------|--------|
| `PATCH` | 调整家庭内家长权限层级 | `{ familyPermissionRole }` | `{ userId, familyPermissionRole }` |

补充约束：

- 仅 `manager` 可调用。
- 不允许把家庭内最后一个 `manager` 降级。
- 若目标用户不是当前家庭内家长成员，直接拒绝。
- 若请求会导致家庭内 `manager` 数量变为 `0`，返回权限错误。

#### 修改任务/表现项写接口的校验错误码

新增统一错误码：

| 错误码 | 含义 |
|--------|------|
| `TASK_REPEAT_RANGE_TOO_LARGE` | 重复任务日期跨度超过上限 |
| `TASK_ACTIVE_RANGE_TOO_LARGE` | 表现项适用跨度超过上限 |

---

## 代码结构

### 文件变更清单

**新增文件**：

- `docs/design/milestone-22a-governance-admission-control.md` - 本设计文档
- `backend/models/AppAccessCode.js` - 应用邀请码领域模型
- `backend/services/appAccessService.js` - 应用邀请码校验、消费与状态流转
- `backend/scripts/generate-app-access-codes.js` - 生成应用邀请码
- `backend/scripts/disable-app-access-codes.js` - 停用应用邀请码
- `backend/scripts/list-app-access-codes.js` - 查询邀请码与使用情况
- `pages/access-gate/access-gate.js` - 应用邀请码输入页逻辑
- `pages/access-gate/access-gate.wxml` - 应用邀请码输入页结构
- `pages/access-gate/access-gate.wxss` - 应用邀请码输入页样式
- `pages/access-gate/access-gate.json` - 页面配置
- `backend/database/migrations/0xx_add_user_family_permission_role_and_app_access_codes.sql` - 家长权限与应用邀请码表迁移

**修改文件**：

- `docs/development/ROADMAP.md` - 将 `M22A` 调整为设计中
- `models/user.js` - 增加 `familyPermissionRole`
- `backend/models/User.js` - 增加 `familyPermissionRole`
- `services/user-service.js` - 前端用户模型和缓存接入新字段
- `services/task-service/task-write.js` - 任务更新写路径接入历史超长数据兼容比较
- `services/task-template-service.js` - 模板创建/编辑链路接入相同日期跨度校验
- `backend/services/userService.js` - 用户查询和创建更新新字段
- `utils/user-context.js` - 正式权限上下文增加家长权限层级
- `utils/permission-utils.js` - 权限判定从单纯角色扩展为上下文能力
- `utils/app/bootstrap-auth.js` - 识别应用邀请码必填错误并跳转输入页
- `backend/controllers/authController.js` - 登录链路接入应用邀请码校验
- `backend/controllers/familyController.js` - 家长邀请码默认 viewer，新增权限修改接口与权限变更后上下文刷新约束
- `backend/services/familyService.js` - 创建家庭写入 manager、家庭成员权限回填和更新
- `backend/services/taskService.js` - 后端 authoritative 更新写路径接入历史超长数据兼容比较
- `backend/services/taskTemplateService.js` - 模板 authoritative 写路径接入相同日期跨度校验
- `utils/task-form-core.js` - 前端任务表单最大跨度限制
- `models/task.js` - 前端模型最大跨度校验
- `backend/models/Task.js` - 后端模型最大跨度校验
- `models/task-template.js` - 前端模板模型最大跨度校验
- `backend/models/TaskTemplate.js` - 后端模板模型最大跨度校验
- `pages/task-edit/` - 任务编辑页错误提示与禁用逻辑
- `pages/task-occurrence-edit/` - 表现项适用周期上限提示
- `packageManage/pages/task-template-edit/` - 模板编辑页跨度提示与超长保存拦截
- `pages/index/` - 只读家长入口禁用与轻提示
- `packageManage/pages/family-settings/` - 家长权限展示和调整 UI
- `packageManage/pages/reward-manage/` - 只读家长禁用管理动作

### 关键函数

**函数1**：`resolvePermissionContext(...)`
- **输入**：`loginUser`、`currentUser`、`familyPermissionRole`
- **输出**：`PermissionContext`
- **职责**：统一生成“是否只读、是否能管理业务数据、是否能管理家庭治理”的正式权限快照
- **依赖**：`utils/user-context.js`

**函数2**：`validateAppAccessForLogin({ openid, accessCode })`
- **输入**：微信 `openid`、可选 `accessCode`
- **输出**：`{ allowed, reasonCode, accessRecord }`
- **职责**：在 `invite_only` 模式下判定新用户是否允许创建账号
- **依赖**：`backend/services/appAccessService.js`

**函数3**：`validateTaskDateRange(taskLike, options)`
- **输入**：任务或模板 payload
- **输出**：校验结果对象
- **职责**：统一重复任务、表现项和模板的最大跨度规则
- **依赖**：`models/task.js`、`backend/models/Task.js`、`models/task-template.js`、`backend/models/TaskTemplate.js`、`utils/task-form-core.js`

**函数4**：`canPreserveOversizedLegacyRange(existingTaskLike, nextTaskLike)`
- **输入**：历史任务/表现项/模板、更新后的任务/表现项/模板
- **输出**：布尔值
- **职责**：判断“历史已超限但本次未继续扩大”的更新是否允许通过
- **依赖**：`services/task-service/task-write.js`、`backend/services/taskService.js`、`services/task-template-service.js`、`backend/services/taskTemplateService.js`

---

## 实施步骤

### 第1步：数据模型与迁移收口（预计1.5天）

- [ ] **任务**：为用户模型增加 `familyPermissionRole`，新增应用邀请码表和迁移脚本
- [ ] **验证**：迁移可执行，历史家庭回填正确
- [ ] **依赖**：无

**实施要点**：
1. 用户表新增 `family_permission_role`，允许为空。
2. 历史家庭中现有家长统一回填为 `manager`。
3. 不新增 `families.invite_family_permission_role`，保持家庭邀请码表结构不变。
4. 新增 `app_access_codes` 表，支持次数、过期时间、状态字段。
5. `createFamily(...)` 必须在同一事务内把创建者写成 `familyPermissionRole='manager'`，不能只更新 `family_id`。

### 第2步：家庭内权限治理落地（预计2天）

- [ ] **任务**：统一前后端的家长权限口径，并接入家庭设置页与业务页
- [ ] **验证**：`manager / viewer` 在前后端判定一致
- [ ] **依赖**：第1步

**实施要点**：
1. 前端 `permissionContext` 增加 `familyPermissionRole` 和能力位。
2. 后端敏感写操作不再只信任 JWT 中的 `role === 'parent'`，而是查询当前用户真实权限。
3. `isSwitchedChildView` 与 `isViewerReadonly` 分开建模，避免把“孩子视角”与“只读家长”混成同一布尔语义。
4. 家庭设置页允许 `manager` 调整其他家长权限；`viewer` 不得看到治理动作入口。
5. 所有家长权限变更与成员移出链路都必须执行“至少保留一个 manager”的一致性校验。
6. `createFamily`、`joinFamily`、权限变更成功后，前端必须立即刷新 `auth/current` 或等价用户上下文缓存，收口旧权限残留。

### 第3步：应用级邀请制准入落地（预计1.5天）

- [ ] **任务**：在登录链路中加入应用邀请码验证，并提供最小输入页
- [ ] **验证**：新用户在 `invite_only` 模式下必须输入有效邀请码，老用户不受影响
- [ ] **依赖**：第1步

**实施要点**：
1. `auth/login` 接收可选 `accessCode`。
2. 新用户且模式为 `invite_only` 时，没有邀请码直接拒绝。
3. 前端统一使用 `pending_app_access_code` 作为邀请码 source of truth。
4. `runWxLogin / doCloudLogin / autoLogin` 三条登录入口统一透传 `accessCode`。
5. bootstrap 捕获错误码并跳转 `access-gate` 页面。
6. 运维脚本默认生成“7 天有效、1 次使用”的应用邀请码，必要时允许显式覆盖。
7. 本期必须交付生成、停用、查询三类运维脚本能力，或者明确为同一多命令脚本，不允许只实现生成。

### 第4步：任务、表现项与模板周期护栏落地（预计2天）

- [ ] **任务**：为重复任务、表现项和模板增加统一最大跨度限制
- [ ] **验证**：前端表单和后端接口都能拒绝超长范围
- [ ] **依赖**：无

**实施要点**：
1. 前端表单层即时提示，避免提交后才失败。
2. 后端模型层保持 authoritative 校验，不信任前端。
3. 对历史超长数据采用“允许读取、不允许继续拉长”的兼容规则。
4. 前后端任务与模板更新写路径必须比较“旧跨度 vs 新跨度”，兑现兼容承诺。
5. `packageManage/pages/task-template-edit/`、`services/task-template-service.js` 与 `backend/services/taskTemplateService.js` 必须纳入同一批实现与回归。

### 第5步：测试与回归收口（预计1-1.5天）

- [ ] **任务**：补齐自动化测试和关键手工回归
- [ ] **验证**：权限、登录、周期限制主场景全绿
- [ ] **依赖**：前四步

**实施要点**：
1. 补权限矩阵测试，覆盖 `manager / viewer / child`。
2. 补登录链路测试，覆盖 `open / invite_only / invalid code / expired code / existing user bypass`。
3. 补任务/表现项/模板周期边界测试，覆盖新建、编辑和历史超长数据兼容。

---

## 测试方案

### 单元测试

| 测试项 | 测试方法 | 预期结果 |
|--------|---------|---------|
| 家长权限解析 | `utils/user-context.js` / `permission-utils.js` 单测 | `manager / viewer` 能力位正确，`isSwitchedChildView` 与 `isViewerReadonly` 不混淆 |
| 应用邀请码状态机 | `backend/services/appAccessService.js` 单测 | 默认 7 天 / 1 次使用、次数、过期、禁用、消费逻辑正确 |
| 家庭邀请码默认 viewer 规则 | `backend/services/familyService.js` 单测 | `parent` 邀请码加入后固定落为 `viewer`，不依赖额外字段 |
| 周期上限校验 | `models/task.js`、`backend/models/Task.js` 单测 | 超限被拒绝，合法范围通过 |
| 历史超长数据兼容 | `task-write.js`、`backend/services/taskService.js` 单测 | 改标题可过，继续拉长被拒绝 |
| 模板周期上限校验 | `models/task-template.js`、`backend/models/TaskTemplate.js`、`services/task-template-service.js` 单测 | 模板创建/编辑遵守相同跨度上限，历史超长模板只能缩不许继续扩 |

### 集成测试

- [ ] 新用户在 `invite_only` 模式下无邀请码登录，返回 `AUTH_APP_ACCESS_CODE_REQUIRED`
- [ ] 新用户带有效邀请码登录，成功创建用户并消费邀请码
- [ ] 三条登录入口在 `invite_only` 模式下都能复用同一 `pending_app_access_code`
- [ ] `viewer` 家长调用任务/奖励/家庭治理写接口，返回权限错误
- [ ] `manager` 家长可管理任务奖励、家庭成员和家长权限
- [ ] 家长邀请码生成后，加入家庭的新家长默认获得 `viewer`
- [ ] 超长重复任务提交被前后端一致拒绝
- [ ] 超长模板提交被前后端一致拒绝

### 手动测试

1. **功能测试**：
   - [ ] 家庭创建者默认 `manager`
   - [ ] 历史家庭中的其他家长默认回填为 `manager`
   - [ ] 新邀请的家长默认落为 `viewer`
   - [ ] 最后一个 `manager` 不能被降级或移出
   - [ ] `viewer` 登录后可看不可改
   - [ ] 未加入家庭的家长不会被误判成只读，可正常进入创建/加入家庭流程
   - [ ] 新用户在邀请制模式下首次进入会看到邀请码输入页
   - [ ] 应用邀请码默认 7 天有效、1 次使用
   - [ ] 家庭邀请码保持 24 小时有效、1 次使用
   - [ ] 任务编辑页和表现项编辑页对超长周期给出明确提示
   - [ ] 模板编辑页对超长周期给出明确提示
   - [ ] 历史超长任务修改标题/描述时仍可保存
   - [ ] 历史超长任务尝试继续拉长时被拒绝
   - [ ] 历史超长模板修改名称/描述时仍可保存，但继续拉长会被拒绝

2. **回归测试**：
   - [ ] 单家长家庭不受新权限模型影响
   - [ ] 已有用户在 `invite_only` 模式下仍可正常登录
   - [ ] 旧的超长任务仍可读取和展示
   - [ ] 家庭邀请码加入链路保持可用

### 测试覆盖率目标

- 本期新增和修改核心模块维持项目现有正式质量闸门
- 新增 `appAccessService`、权限解析和日期跨度校验的关键分支覆盖率目标：`85%+`

---

## 风险评估

### 技术风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| 家长权限升级后前端隐藏了按钮，但后端仍可写 | 高 | 中 | 所有敏感写接口同时增加后端 authoritative 权限校验 |
| 家长邀请码默认 viewer 规则只停留在页面提示，实际 join 时丢失 | 高 | 中 | `joinFamily(...)` 在 `invite_code_role='parent'` 时必须 authoritative 写入 `family_permission_role='viewer'` |
| 家长权限调整后 JWT 陈旧 | 高 | 高 | 后端写路径实时查库；前端关键页面依赖 `auth/current` 刷新后的真实权限 |
| 邀请制上线误伤已有用户 | 高 | 中 | 仅拦截“新用户创建”，已有用户一律绕过应用邀请码 |
| 自动登录与手动登录各走各路，邀请码重试链路分叉 | 高 | 中 | 统一使用 `pending_app_access_code`，所有登录入口复用同一带参调用 |
| 历史超长数据被新规则锁死无法编辑 | 中 | 中 | 使用“可读、可保存不扩张、不可继续拉长”的兼容策略 |
| 三条链路一起推进导致范围膨胀 | 中 | 中 | 明确不做后台、不做审计、不做 onboarding，把范围锁定在治理边界 |

---

## 替代方案

### 方案A：直接把 `parent` 拆成多个新角色

不采用。

原因：

- 会直接冲击现有 `role` 判断和 JWT 结构
- 与 `M20A` 已落地的上下文模型耦合过重
- 改动面远大于新增一层 `familyPermissionRole`

### 方案B：邀请制只做 openid 白名单，不做邀请码

不采用。

原因：

- 运维门槛高，无法灵活发码
- 不利于试运营阶段分批邀请
- 对产品和运营来说不可操作

### 方案C：统一限制所有日期范围都不得超过 1 个月

不采用。

原因：

- 过于粗暴，和已有 `no-end` / `month-end` / 表现项长期适用能力冲突
- 问题真实存在，但应按领域压力设置护栏，而不是一刀切

---

## 审核要点自检

- [x] 已明确区分“家庭邀请码”和“应用邀请码”
- [x] 已明确家长分层模型及其迁移策略
- [x] 已明确“至少保留一个 manager”的家庭治理不变量
- [x] 已明确“新家长默认 viewer”由 join 链路 authoritative 落位，不依赖额外字段
- [x] 已明确未加入家庭的家长不是 viewer，只是暂时无家庭治理对象
- [x] 已明确周期护栏覆盖任务/表现项/模板，并补齐对应实现与测试落点
- [x] 已明确老数据兼容策略，避免新规则锁死存量数据
- [x] 已明确历史超长数据兼容逻辑落在更新写路径，而不只是模型校验
- [x] 已明确邀请制三条登录入口共用同一邀请码 source of truth
- [x] 已明确应用邀请码与家庭邀请码分别由谁生成、谁管理、默认多久有效
- [x] 已明确本期不包含审计后台、新手引导和应用后台管理
- [x] 已把 `M22A` 定位为治理边界收口，而不是新功能堆叠

## 审核记录

- 2026-04-19：初版设计提交，待项目维护者审核。
- 2026-04-20：完成多轮规则、体验与视觉收口评审，审核通过，可进入实施阶段。
