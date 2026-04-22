# 服务指南

本文档介绍了学习任务微信小程序服务层API，包括所有核心服务的功能、方法签名和使用说明。

---

## 服务架构概览

### 服务层职责
- **业务用例实现**：协调领域模型完成复杂业务流程
- **跨实体操作**：处理涉及多个领域实体的操作
- **事件发布**：在业务操作完成后发布领域事件
- **数据一致性**：确保跨仓储操作的数据一致性

### 服务访问方式
所有服务通过ServiceManager获取实例：

```javascript
const serviceManager = getApp().serviceManager;

// 获取服务实例
const taskService = serviceManager.get('taskService');
const starService = serviceManager.get('starService');
const rewardService = serviceManager.get('rewardService');
const messageService = serviceManager.get('messageService');
const userService = serviceManager.get('userService');
const validationService = serviceManager.get('validationService');
const configService = serviceManager.get('configService');
const offlineQueueService = serviceManager.get('offlineQueueService');
const taskTemplateService = serviceManager.get('taskTemplateService');
```

补充说明：
- `offlineQueueService` 为 M19E 引入的统一待同步队列服务，负责承接任务域与奖励域的离线待同步动作。
- `ENABLE_API / API_BASE_URL` 不属于 `ConfigService` 管辖范围，而是由 `utils/runtime-config.js` 与 `utils/api-config.js` 统一解析为启动时运行模式快照。
- `taskTemplateService` 同时支持别名 `taskTemplate` / `TaskTemplateService`，由 `ServiceManager` 统一映射。

---

## OfflineQueueService - 统一离线队列服务

离线队列服务负责统一承接任务域、奖励域在云端失败后的待同步动作，并在登录后补偿或读取前补偿阶段顺序 drain。

### 核心功能
- 统一入队任务域 / 奖励域 mutation
- 队列项去重与冲突折叠
- 按当前会话上下文过滤并执行 drain
- 兼容历史 `pendingSyncMeta / tombstone` 迁移

### API 方法

##### `initialize()`
初始化离线队列元数据与迁移状态。
- **返回**: `Promise<boolean>`

##### `enqueueMutation(input)`
将待同步动作写入统一离线队列。
- **参数**:
  ```javascript
  {
    domain: 'task' | 'reward',
    entityId: string,
    operation: string,
    operationKey?: string,
    payload?: Object,
    snapshot?: Object | null,
    context?: {
      familyId?: string | null,
      loginUserId?: string | null,
      actorUserId?: string | null,
      actorRole?: 'parent' | 'child' | null,
      targetUserId?: string | null
    },
    source?: 'live_write' | 'legacy_migration'
  }
  ```
- **返回**: `Promise<OfflineQueueItem>`
- **说明**:
  - 对同一实体的连续 mutation 会按设计规则折叠
  - 过渡期仍允许任务/奖励实体保留 `pendingSyncMeta` 兼容镜像

##### `drain(options = {})`
按当前登录上下文执行待同步项。
- **参数**:
  ```javascript
  {
    domains?: Array<'task' | 'reward'>,
    reason?: string,
    force?: boolean,
    limit?: number
  }
  ```
- **返回**:
  ```javascript
  {
    success: boolean,
    processed: number,
    skipped: number,
    failed: number,
    partial: boolean,
    remaining: number
  }
  ```
- **说明**:
  - 登录后补偿和任务/奖励读取前补偿都走该入口
  - 上下文不匹配、未到退避窗口的项会被跳过，不会误回放

##### `migrateLegacyPendingState()`
把历史 `pendingSyncMeta / delete tombstone` 导入统一队列。
- **返回**: `Promise<{ success: boolean, migratedCount: number, skippedCount: number }>`

##### `getPendingSummary(filter = {})`
返回当前待同步概览。
- **返回**: `Promise<{ total: number, byDomain: Object }>`

---

## TaskTemplateService - 任务模板服务

任务模板服务负责模板的 CRUD、云端同步、本地镜像、模板回填任务表单以及最近模板推荐。

### 核心功能
- 任务模板创建、编辑、删除、启停
- 模板列表 / 最近模板查询
- 模板应用到 `task-edit` 表单
- 模板使用次数回写
- 云端模板列表刷新与本地镜像替换
- 模板日期策略与重复周期护栏校验

### M22A 补充说明

- 模板重复周期与任务周期共用同一套跨度护栏：模板重复范围最大 `93` 天。
- 历史超长模板允许继续读取，并允许“不扩大跨度”的名称/描述类编辑；若继续拉长则会被拒绝。
- 模板回填到 `task-edit` 后，页面仍会按当前表单日期重新推导重复语义，不再出现“UI 看起来是多天，但底层仍按单天提交”的回填残差。

### API 方法

##### `getTemplateById(templateId, options = {})`
根据模板 ID 获取单个模板。
- **参数**:
  - `templateId` - 模板 ID
  - `options.force` - `true` 时先强制云端刷新
- **返回**: `Promise<TaskTemplate | null>`

##### `getRecentTemplates(limit = 5, options = {})`
获取最近使用的启用模板。
- **参数**:
  - `limit` - 返回数量上限
  - `options.skipRefresh` - `true` 时跳过云端刷新
- **返回**:
  ```javascript
  {
    templates: TaskTemplate[]
  }
  ```

##### `getTemplates(options = {})`
获取模板列表。
- **参数**:
  ```javascript
  {
    keyword?: string,
    type?: 'all' | 'study' | 'habit' | 'interest',
    status?: 'all' | 'enabled' | 'disabled',
    enabledOnly?: boolean,
    sortBy?: 'recent' | 'usage',
    skipRefresh?: boolean,
    force?: boolean
  }
  ```
- **返回**:
  ```javascript
  {
    templates: TaskTemplate[]
  }
  ```

##### `createTemplate(input = {})`
创建任务模板。
- **参数**:
  ```javascript
  {
    name: string,
    description?: string,
    enabled?: boolean,
    taskPayload: Object,
    dateStrategy?: Object,
    familyId?: string,
    createdByUserId?: string
  }
  ```
- **返回**:
  ```javascript
  {
    success: true,
    template: TaskTemplate
  }
  ```
- **说明**：
  - `dateStrategy.durationDays` 或模板重复结束日期超出 `93` 天时会拒绝保存
  - 失败时会抛出带中文提示的校验错误，调用方应直接向用户展示

##### `updateTemplate(templateId, input = {})`
更新任务模板。
- **返回**:
  ```javascript
  {
    success: true,
    template: TaskTemplate
  }
  ```
- **说明**：
  - 会以“旧模板 + 本次变更”合并后的结果做完整校验
  - 历史超长模板若本次没有继续扩大跨度，允许保存；若继续拉长会被拒绝

##### `setTemplateEnabled(templateId, enabled)`
启用或停用模板。
- **返回**:
  ```javascript
  {
    success: true,
    template: TaskTemplate
  }
  ```

##### `deleteTemplate(templateId)`
删除模板。
- **返回**:
  ```javascript
  {
    success: true
  }
  ```

##### `recordTemplateUsage(templateId)`
回写模板使用次数和最近使用时间。
- **返回**:
  ```javascript
  {
    success: boolean,
    template?: TaskTemplate
  }
  ```

##### `applyTemplateToTaskForm(template, context = {})`
将模板映射为 `task-edit` 可直接 `setData` 的表单补丁。
- **参数**:
  - `template` - `TaskTemplate` 或普通模板对象
  - `context.today` - 可选，指定回填参考日期
- **返回**:
  ```javascript
  {
    formPatch: {
      newTask: Object,
      repeatText: string,
      reminderText: string,
      pointsExpiryText: string,
      repeatPreviewText: string,
      repeatTypeWarning: boolean,
      weekdaySelection: boolean[],
      isRepeatOptionDisabled: boolean,
      selectedTemplateId: string
    }
  }
  ```

##### `refreshTemplatesFromCloud(options = {})`
主动从云端刷新模板列表并替换本地镜像。
- **返回**:
  ```javascript
  {
    success: boolean,
    templates: TaskTemplate[]
  }
  ```

---

## TaskService - 任务管理服务

任务服务是系统的核心服务，负责任务的完整生命周期管理。

### 核心功能
- 任务CRUD操作
- 任务状态管理和流转
- 必做任务惩罚机制
- 重复任务处理
- 表现项（occurrence）配置、记录、停用与转换
- 与星星系统的集成
- 事件发布机制
- 家庭治理权限与执行态上下文收口
- 任务/表现项周期护栏与历史超长兼容

### API 方法

#### M22A 治理补充说明

- `loginUser.role='parent' && familyPermissionRole='viewer'` 时，默认不允许创建、编辑、删除、必做设置、表现项治理等管理型写操作。
- 查看者家长切到孩子视角后，任务“执行型”操作保留例外链路：`completeTask / resetTask / updateTaskStatus` 会按孩子执行上下文透传 `operatorContext`，后端据此允许孩子自己的打卡/重置。
- 表现项记录不属于查看者例外；`recordOccurrenceResult(...)` 仍要求孩子本人或 `manager` 家长链路。
- 任务重复周期最大 `93` 天，表现项 `activeRange` 最大 `180` 天；历史已超限数据允许继续读取，并允许“不继续扩张”的更新。

#### 结果结构补充说明（M19B）

任务写方法对页面层继续保持兼容返回结构：

```javascript
{
  success: boolean,
  task?: Task | null,
  tasks?: Task[],
  taskId?: string | null,
  message?: string,
  fallback?: boolean,
  mutation?: {
    primaryTask: Object | null,
    affectedTasks: Object[],
    operation: 'create' | 'update' | 'delete' | 'complete' | 'reset' | 'required' | 'unrequired',
    task?: Object | null,
    tasks?: Object[],
    taskId?: string | null
  }
}
```

说明：
- 云端模式下，正常主路径采用 API 优先，成功后回写本地仓储
- `fallback=true` 表示云端写入失败，已降级为本地保存 / 待同步路径
- 页面层若只关心兼容契约，可继续读取 `success / task / taskId`
- 新链路与测试可读取 `mutation` 查看权威写结果

#### 基础操作

##### `getAllTasks(userId = null, options = {})`
获取所有任务列表
- **参数**:
  - `userId` - 可选的用户ID，不传则获取本地/缓存中的全部任务集合
  - `options.requireFreshStars` - 仅在传入显式 `userId` 时生效；为 `true` 时会在云端任务读取前先执行 `starService.refreshStarsFromCloud(userId)`
- **返回**: `Promise<Task[]>`

##### `getTaskById(taskId, userId = null)`
根据ID获取特定任务
- **参数**: `taskId` - 任务ID, `userId` - 可选的用户ID
- **返回**: `{ success: boolean, task?: Task, message?: string }`

##### `createTask(taskData)`
创建新任务
- **参数**:
  ```javascript
  {
    title: string,           // 任务标题
    description?: string,     // 任务描述
    type: 'study' | 'habit' | 'interest',
    date: string,            // 任务日期 YYYY-MM-DD
    startTime?: string,       // 开始时间 HH:mm
    endTime?: string,         // 结束时间 HH:mm
    points: number,          // 奖励星星数
    pointsExpiry: string,     // 有效期类型
    isRequired: boolean,      // 是否必做任务
    repeat?: Object,         // 重复配置
    executionMode?: 'planned' | 'occurrence',
    activeRange?: {
      startDate: string,
      endDate?: string,
      hasNoEndDate?: boolean
    },
    targetUserId?: string,   // 家长代孩子创建时传入
    operationKey?: string,
    modifyTime?: number
  }
  ```
- **返回**: `Promise<{ success: boolean, task?: Task, tasks?: Task[], createdTasks?: Task[], fallback?: boolean, mutation?: Object, message?: string }>`
- **说明**:
  - 云端模式下先调用后端创建接口，再把权威结果回写到本地缓存
  - 重复任务在云端模式下由后端展开，`tasks / createdTasks` 会包含主任务和受影响实例
  - 若云端创建失败，降级时仅本地保存主任务；重复任务会标记 `pendingSyncMeta.repeatMaterializationPending=true`
  - 当 `executionMode='occurrence'` 时，表示创建“表现项配置任务”；`occurrenceOutcome / isOccurrenceRecord / recordedAt` 不允许通过该通用创建接口直传
  - 当重复周期或表现项有效期超出护栏时，返回 `{ success: false, code, message }`，其中 `code` 为 `TASK_REPEAT_RANGE_TOO_LARGE` 或 `TASK_ACTIVE_RANGE_TOO_LARGE`

##### `updateTask(taskId, changes, userId = null)`
更新任务信息
- **参数**: `taskId` - 任务ID, `changes` - 更新数据对象, `userId` - 可选的用户ID
- **返回**: `Promise<{ success: boolean, task?: Task, fallback?: boolean, mutation?: Object, message?: string }>`
- **说明**:
  - 云端模式下为 API 优先；失败时降级为本地保存并保留待同步元数据
  - `occurrence` 配置任务允许通过通用更新接口维护 `title / type / points / activeRange`
  - 普通任务切换到 `occurrence` 必须走 `convertTaskToOccurrenceMode(...)`
  - 历史超长任务若本次没有继续扩大跨度，允许保存；继续拉长则返回范围错误

##### `deleteTask(taskId, userId = null, suppressMessage = false)`
删除任务
- **参数**: `taskId` - 任务ID, `userId` - 可选的用户ID, `suppressMessage` - 是否禁用消息推送，默认false
- **返回**: `Promise<{ success: boolean, taskId?: string, fallback?: boolean, mutation?: Object, message?: string }>`
- **说明**: 云端模式下删除成功后直接删除本地缓存；失败时写入 delete tombstone 走待同步链路

---

#### 状态管理

##### `completeTask(taskId, userId = null)`
完成任务（核心业务流程）
- **参数**: `taskId` - 任务ID, `userId` - 可选的用户ID
- **返回**: `Promise<{ success: boolean, task?: Task, fallback?: boolean, mutation?: Object, message?: string }>`
- **内部流程**：验证状态 → 更新为完成 → 计算星星 → 发布事件 → 创建消息

##### `resetTask(taskId, userId = null)`
重置任务状态
- **参数**: `taskId` - 任务ID, `userId` - 可选的用户ID
- **返回**: `Promise<{ success: boolean, task?: Task, fallback?: boolean, mutation?: Object, message?: string, locked?: boolean }>`
- **说明**:
  - 奖励锁定判断按任务归属用户执行，而不是按全局最后兑换时间执行
  - 若任务在对应用户最近一次奖励兑换之前完成，则返回 `locked=true`，且不会执行状态回退或扣星

##### `updateTaskStatus(taskId, status, userId = null)`
更新任务状态
- **参数**: `taskId` - 任务ID, `status` - 状态(0=未完成, 1=已完成), `userId` - 可选的用户ID
- **返回**: `Promise<{ success: boolean, task?: Task, fallback?: boolean, mutation?: Object, message?: string }>`
- **说明**:
  - 云端模式下优先使用后端状态权威返回，本地模式仍保留原有本地写路径
  - 查看者家长切到孩子视角后，该方法会按执行态构造 `operatorContext`，保证孩子自己的打卡链路可继续使用

---

#### 必做任务功能

##### `markTaskAsRequired(taskId, userId = null)`
标记任务为必做
- **参数**: `taskId` - 任务ID, `userId` - 可选的用户ID
- **返回**: `Promise<{ success: boolean, task?: Task, fallback?: boolean, mutation?: Object, message?: string }>`

##### `unmarkTaskAsRequired(taskId, userId = null)`
取消必做任务标记
- **参数**: `taskId` - 任务ID, `userId` - 可选的用户ID
- **返回**: `Promise<{ success: boolean, task?: Task, fallback?: boolean, mutation?: Object, message?: string }>`

##### `checkRequiredTasks()`
检查必做任务惩罚状态（兼容方法，内部调用checkTasksStatus）
- **返回**: `{ success: boolean, tasks: Task[], message?: string }`

##### `handleRequiredTaskPenalty(task)`
应用必做任务惩罚
- **参数**: `task` - 任务对象
- **返回**: `{ success: boolean, message?: string }`

---

#### 任务查询

##### `getTasksByDate(date, userId = null, options = {})`
获取指定日期的任务
- **参数**:
  - `date` - 日期字符串 `YYYY-MM-DD`
  - `userId` - 可选的用户ID
  - `options.requireFreshStars` - 显式用户首页/任务列表入口传 `true` 时，先刷新云端星星再拉任务
- **返回**: `Promise<Task[]>`

##### `getTodayTasks(userId = null, options = {})`
获取今日任务
- **参数**:
  - `userId` - 可选的用户ID
  - `options.requireFreshStars` - 同 `getTasksByDate`
- **返回**: `Promise<Task[]>`

##### `checkUpcomingTasks()`
检查即将开始的任务
- **返回**: `{ success: boolean, tasks: Task[], message?: string }`

##### `checkTasksStatus()`
检查所有任务状态（应用启动时调用）
- **返回**: `{ success: boolean, message?: string }`

##### `getExpiredIncompleteTasks(userId = null)`
获取已过期且未完成的任务
- **参数**: `userId` - 可选的用户ID
- **返回**: `{ success: boolean, tasks: Task[], message?: string }`

##### `calculateTaskProgress(tasks = null)`
计算任务进度
- **参数**: `tasks` - 可选的任务列表，不传则自动获取今日任务
- **返回**:
  ```javascript
  {
    total: number,
    completed: number,
    rate: number
  }
  ```

---

#### 任务统计

##### `getTaskStatistics(dateRange = {})`
获取任务统计数据
- **参数**: `dateRange` - 可选的日期范围对象 `{ startDate, endDate }`
- **返回**:
  ```javascript
  {
    totalTasks: number,
    completedTasks: number,
    completionRate: number,
    byType: { study: number, habit: number, interest: number }
  }
  ```

---

#### 云端同步（M07 新增）

##### `getTasksByScope(options)`
按作用域获取任务（分析页专用，不修改 `getAllTasks` 默认语义）
- **参数**:
  ```javascript
  {
    scope?: 'family',   // 家长看全家孩子任务（需云端支持）
    userId?: string     // 孩子看自己的任务
  }
  ```
- **返回**: `Task[]`
- **说明**: `scope=family` 时调用云端 `GET /api/tasks?scope=family`，结果不写入本地仓储（维护 M06 隔离）

##### `getTasksByDateRange(startDate, endDate, userId = null, options = {})`
按日期范围批量获取任务（分析页月视图专用，避免逐日请求风暴）
- **参数**: `startDate`/`endDate` - `YYYY-MM-DD` 格式, `userId` - 可选用户 ID, `options` - 作用域选项（同 `getTasksByScope`）
- **返回**: `Task[]`

##### `getOccurrenceTasks(scope = {})`
获取表现项配置任务。
- **参数**:
  ```javascript
  {
    userId?: string,
    date?: string,
    startDate?: string,
    endDate?: string,
    includeInactive?: boolean
  }
  ```
- **返回**: `Promise<Task[]>`
- **说明**:
  - 默认按 `date` 返回当天有效的表现项配置任务
  - 当同时传 `startDate/endDate` 时，按有效时间段 overlap 返回月看板所需骨架行
  - `includeInactive=true` 时返回当前用户全部未删除表现项配置，供“表现项设置页”维护

##### `getOccurrenceRecordsByDateRange(scope = {})`
获取表现记录实例。
- **参数**:
  ```javascript
  {
    userId?: string,
    startDate: string,
    endDate: string
  }
  ```
- **返回**: `Promise<Task[]>`
- **说明**: 仅返回 `executionMode='occurrence' && isOccurrenceRecord=true` 的事实记录实例

##### `_syncUpdateToCloud(task)` *(私有)*
任务编辑云端写入口，接收完整 Task 对象，发送 PUT 并返回标准化后的 `TaskMutationResponse`

##### `_syncDeleteToCloud(taskId)` *(私有)*
任务删除云端写入口；HTTP `404` 视为成功，返回 `TaskMutationResponse`

##### `_syncStatusToCloud(task)` *(私有)*
完成/重置状态云端写入口，接收完整 Task 对象，发送 `{ status, starAwarded }` 并返回 `TaskMutationResponse`

##### `_syncRequiredStateToCloud(task)` *(私有)*
必做/取消必做云端写入口，返回 `TaskMutationResponse`

##### `recordOccurrenceResult(taskId, options = {})`
记录表现项某一天的结果。
- **参数**:
  ```javascript
  {
    userId: string,
    date: string,
    outcome: 'success' | 'failure'
  }
  ```
- **返回**:
  ```javascript
  {
    success: boolean,
    task?: Task,
    record?: Task,
    starsAwarded?: boolean,
    unchanged?: boolean,
    fallback?: boolean,
    mutation?: Object,
    message?: string
  }
  ```
- **说明**:
  - 同一表现项/同一孩子/同一天只保留一条记录
  - 重复记录相同结果时按幂等成功返回
  - `success -> failure` 覆盖时会在同一事务内撤回此前已发星星
  - 查看者家长不具备表现项记录权限；该接口只允许孩子本人或 `manager` 家长链路执行

##### `disableOccurrenceTask(taskId, options = {}, userId = null)`
停用表现项配置任务。
- **参数**:
  ```javascript
  {
    disableFromDate?: string
  }
  ```
- **返回**: `Promise<{ success: boolean, task?: Task, disabledTask?: Task, fallback?: boolean, mutation?: Object, message?: string }>`
- **说明**: 只让该表现项退出未来日期查询，不删除历史记录

##### `convertTaskToOccurrenceMode(taskId, options = {}, userId = null)`
把既有 planned 任务转换为表现项配置任务。
- **参数**:
  ```javascript
  {
    effectiveFromDate?: string
  }
  ```
- **返回**:
  ```javascript
  {
    success: boolean,
    task?: Task,
    convertedTask?: Task,
    archivedFutureInstances?: string[],
    fallback?: boolean,
    mutation?: Object,
    message?: string
  }
  ```
- **说明**: 仅归档未来未完成实例，已完成历史实例与历史表现记录保持不动

---

## StarService - 星星积分服务

星星服务负责星星的获取、消费、过期管理等核心积分逻辑。

### 核心功能
- 星星获取和消费（FIFO策略）
- 有效期管理和分组
- 过期处理和预测
- 数据一致性维护
- 统计分析

### API 方法

#### 星星操作

##### `getTotalStars(userId = null)`
获取用户总星星数量
- **参数**: `userId` - 可选的用户ID，不传则获取所有用户的星星
- **返回**: `Promise<Number>` - 星星总数量

##### `addStars(points, expiryType, source, options = {})`
添加星星（奖励）
- **参数**:
  - `points` - 星星数量
  - `expiryType` - 有效期类型：`'permanent'` | `'week'` | `'month'` | `'quarter'` | `'half_year'` | `'year'`
  - `source` - 来源描述
  - `options.sourceType` - 业务来源类型，如 `task_complete`
  - `options.sourceId` - 业务来源ID，如任务ID
  - `options.userId` - 目标用户ID
- **返回**: `Promise<{ success: boolean, points?: number, group?: StarGroup, record?: StarRecord, message?: string }>`
- **说明**: 云端模式下会异步双写 `POST /api/stars/records`

##### `consumeStars(points, reason, options = {})`
消费星星（FIFO策略：先过期先使用）
- **参数**:
  - `points` - 请求消费数量
  - `reason` - 消费原因
  - `options.userId` - 目标用户ID
  - `options.sourceType` / `options.sourceId` - 业务来源
  - `options.originalTaskDate` - 任务惩罚等需要保留原始日期语义的场景
  - `options.requestedPoints` / `options.idempotencyKey` - 通用扣星云端命令参数
- **返回**: `Promise<{ success: boolean, consumed: number, requested: number, groups?: StarGroup[], record?: StarRecord, message?: string }>`
- **说明**: 云端模式下通用扣星走专用 `POST /api/stars/consume`

##### `consumeStarsFromSpecificType(points, expiryType, reason, options = {})`
从指定有效期分组扣星，主要用于 `resetTask`
- **参数**:
  - `points` - 扣减数量
  - `expiryType` - 指定有效期类型
  - `reason` - 扣减原因
  - `options.userId` - 目标用户ID
  - `options.sourceType` / `options.sourceId` - 业务来源，重置任务时为 `task_reset`
  - `options.originalTaskDate` - 任务原始日期，供分析页按原日期归档
- **返回**: `Promise<{ success: boolean, consumed?: number, groups?: StarGroup[], record?: StarRecord, message?: string }>`
- **说明**: 云端模式下异步双写 `POST /api/stars/records`

##### `refreshStarsFromCloud(userId = null, options = {})`
从云端刷新星星流水与快照
- **参数**:
  - `userId` - 单用户刷新时必填
  - `options.scope` - `'family'` 时拉取全家流水；该模式仅回灌 `starRecords`，不回灌全家 `starGroups`
- **返回**: `Promise<{ success: boolean, groups?: StarGroup[], records?: StarRecord[], message?: string }>`
- **说明**: 首页显式用户任务入口、奖励页、分析页都会复用此方法进行前置同步

##### `getFamilyStarSummary(options = {})`
获取家庭当前星星汇总与分组快照
- **参数**:
  - `options.force` - 为 `true` 时忽略前端内存缓存，重新请求后端 `GET /api/stars/family-summary`
- **返回**:
  ```javascript
  Promise<{
    success: boolean,
    scope: 'family',
    subjectUserIds: string[],
    totalPoints: number,
    groups: StarGroup[],
    fetchedAt?: number
  }>
  ```
- **说明**: 供分析页 family 模式读取当前余额锚点与分组快照；仅云端模式可用

##### `syncExpiryAuthorityIfNeeded(options = {})`
按需触发星星到期权威结算同步
- **参数**:
  - `options.scope` - `'user' | 'family'`
  - `options.userId` - `scope='user'` 时的目标用户
  - `options.force` - 是否忽略本地节流窗口
- **返回**: `Promise<{ success: boolean, skipped?: boolean, reason?: string }>`
- **说明**: 分析页、首页、奖励页等正式读取链路会先经过该方法，确保当前余额与过期预测基线一致

---

#### 过期管理

##### `processExpiredStars()`
处理过期星星（定时任务调用）
- **返回**: `{ success: boolean, expiredAmount: number, affectedUsers: string[], message?: string }`

##### `calculatePendingExpiry()`
计算即将过期的星星
- **返回**: `Array<{ userId, expiryDate, amount, expiryType }>`

##### `getExpiryForecast(userId, days)`
获取星星过期预测
- **参数**: `userId` - 用户ID, `days` - 预测天数
- **返回**: `Array<{ date: string, expiringAmount: number }>`

##### `protectRewardsByExpiry(expiringStars, userId)`
根据即将过期的星星保护奖励
- **参数**: `expiringStars` - 即将过期的星星数组, `userId` - 用户ID
- **返回**: `{ success: boolean, message?: string }`

---

#### 数据维护

##### `checkDataConsistency(userId)`
检查数据一致性（分组总数 vs 存储总数）
- **参数**: `userId` - 用户ID
- **返回**:
  ```javascript
  {
    isConsistent: boolean,
    totalFromGroups: number,
    storedTotal: number,
    difference: number
  }
  ```

##### `repairDataConsistency(userId)`
修复数据不一致
- **参数**: `userId` - 用户ID
- **返回**: `{ success: boolean, repairedAmount: number, message?: string }`

---

#### 统计分析

##### `getStarStatistics(userId, dateRange)`
获取星星统计数据
- **参数**: `userId` - 用户ID, `dateRange` - `{ startDate, endDate }`
- **返回**:
  ```javascript
  {
    totalEarned: number,
    totalConsumed: number,
    totalExpired: number,
    currentBalance: number,
    dailyStats: Array<{date: string, earned: number, consumed: number}>
  }
  ```

##### `getStarRecords(options = {})`
获取星星记录
- **参数**: `options` - `{ userId?, type?, date?, limit? }`
- **返回**: `Promise<StarRecord[]>`

##### `getStarRecordsByDateRange(startDate, endDate, userId = null)`
获取日期范围内的星星记录
- **参数**: `startDate` / `endDate` - `YYYY-MM-DD`, `userId` - 可选用户ID
- **返回**: `Promise<StarRecord[]>`

---

## RewardService - 奖励管理服务

奖励服务负责家庭奖池读取、奖励创建/编辑/启停、兑换与取消兑换、手动发放，以及云端奖励镜像同步。

### 核心功能
- 家庭奖池 / 家庭兑换记录 / 当前孩子个人兑换记录读取
- 奖励 CRUD、启停和复制
- 奖励兑换、取消兑换、手动发放
- `instant / manual` 履约模式统一
- 快过期星星动态抵扣成本预览
- 云端奖励镜像刷新与待同步补偿

### API 方法

#### 奖励管理

##### `getAllRewards(userId = null)`
获取所有奖励列表
- **参数**: `userId` - 可选的用户ID，不传则获取所有用户的奖励
- **返回**: `Promise<Reward[]>`

##### `createReward(rewardData)`
创建新奖励
- **参数**:
  ```javascript
  {
    name: string,
    description: string,
    points: number,
    type: 'item' | 'privilege' | 'activity',
    icon?: string,
    customReward?: boolean
  }
  ```
- **返回**: `Promise<{ success: boolean, reward?: Reward, message?: string }>`
- **说明**: 云端模式下本地保存成功后异步双写到 `/api/rewards`

##### `updateReward(rewardId, rewardData)`
更新奖励信息
- **参数**: `rewardId` - 奖励ID, `rewardData` - 更新数据对象
- **返回**: `Promise<{ success: boolean, reward?: Reward, message?: string }>`

##### `deleteReward(rewardId)`
删除奖励
- **参数**: `rewardId` - 奖励ID
- **返回**: `Promise<{ success: boolean, message?: string }>`

##### `getRewardsByFamily(scope = {})`
获取家庭范围奖励列表。
- **参数**:
  ```javascript
  {
    familyId?: string | null,
    memberUserIds?: string[],
    childUserIds?: string[],
    loginUserId?: string | null,
    viewUserId?: string | null
  }
  ```
- **返回**: `Promise<Reward[]>`
- **说明**:
  - 奖励页、奖励管理页统一复用该入口
  - 无家庭场景下退化为单用户奖励池，不因 `familyId=null` 直接返回空

##### `getClaimedRewardsByExchangeUser(exchangeUserId, scope = {})`
获取某个孩子自己的兑换记录。
- **参数**:
  - `exchangeUserId` - 兑换孩子 userId
  - `scope` - 同 `getRewardsByFamily`
- **返回**: `Promise<Reward[]>`

##### `getFamilyClaimedRewards(scope = {})`
获取家庭范围内所有已兑换奖励记录。
- **参数**: `scope` - 同 `getRewardsByFamily`
- **返回**: `Promise<Reward[]>`

##### `getRewardManageFamilyViewModel(scope = {})`
获取奖励管理页所需聚合视图。
- **参数**: `scope` - 同 `getRewardsByFamily`
- **返回**:
  ```javascript
  {
    familyId: string | null,
    memberUserIds: string[],
    childUserIds: string[],
    manageableRewards: Reward[],
    exchangeRecords: Reward[],
    exampleTemplates: Reward[]
  }
  ```
- **说明**:
  - `manageableRewards` 仅包含未兑换的正式奖励
  - `exchangeRecords` 承担家庭兑换历史，不再让已兑换奖励回流到“奖励设置”主列表

---

#### 奖励兑换

##### `getAvailableRewards(includeClaimed = false, includeExamples = false, userId = null)`
获取可兑换奖励
- **参数**:
  - `includeClaimed` - 是否包含已兑换奖励，默认false
  - `includeExamples` - 是否包含示例奖励，默认false
  - `userId` - 用户ID，可选
- **返回**: `Promise<Reward[]>`
- **说明**: 云端模式下不再按 `reward.userId === userId` 精确过滤，而是依赖后端按家庭可见性返回

##### `exchangeReward(rewardId, userId = null)`
兑换奖励
- **参数**: `rewardId` - 奖励ID, `userId` - 用户ID（可选，默认使用当前用户）
- **返回**:
  ```javascript
  Promise<{
    success: boolean,
    reward?: Reward,
    fulfillmentMode?: 'instant' | 'manual',
    originalPoints?: number,
    expiringStarDeduction?: number,
    hasExpiringDeduction?: boolean,
    actualCost?: number,
    message?: string,
    userId?: string
  }>
  ```
- **内部流程**：验证奖励 → 预览动态抵扣成本 → 消费星星 → 推进奖励状态 → 发布事件/消息
- **说明**:
  - 云端模式下走独立 `_syncExchangeToCloud(rewardId, exchangeUserId, modifyTime)` 路径，不与通用奖励 upsert 混用
  - `instant` 奖励兑换后直接进入终态；`manual` 奖励兑换后进入 `claimed`，前台展示为 `待发放`

##### `previewRewardExchangeCost(rewardId, userId = null)`
预览奖励当前兑换成本。
- **参数**:
  - `rewardId` - 奖励 ID
  - `userId` - 目标孩子 userId
- **返回**:
  ```javascript
  Promise<{
    originalPoints: number,
    expiringStarDeduction: number,
    actualCost: number,
    hasExpiringDeduction: boolean
  }>
  ```
- **说明**:
  - 只认“当前可用星星快照”计算出来的快过期抵扣
  - 不再把 `protectedByExpiry / partialProtection` 作为正式展示语义来源

##### `refreshRewardsFromCloud()`
从云端刷新奖励列表
- **参数**: 无
- **返回**: `Promise<{ success: boolean, rewards?: Reward[], message?: string }>`
- **说明**: 云端模式下执行全量 upsert + stale cleanup，本地 `syncedToCloud !== true` 的奖励会被保留

##### `cancelRewardExchange(rewardId)`
取消兑换
- **参数**: `rewardId` - 奖励ID
- **返回**: `Promise<{ success: boolean, reward?: Reward, pointsRefunded?: number, message?: string }>`
- **说明**:
  - 本地模式下优先按真实兑换流水回查实际退款金额
  - 退款按 `exchangeUserId` 归属正确退回，不再默认退给当前操作者

##### `markRewardAsDelivered(rewardId, operatorUserId = null)`
家长标记手动奖励已发放。
- **参数**:
  - `rewardId` - 奖励 ID
  - `operatorUserId` - 可选；管理动作操作者
- **返回**: `Promise<{ success: boolean, reward?: Reward, message?: string }>`
- **说明**:
  - 仅对 `manual + claimed` 生效
  - 奖励管理页用该方法把 `待发放` 推进到 `已发放`

---

#### 奖励状态管理

##### `toggleRewardStatus(rewardId, enabled)`
切换奖励启用/禁用状态
- **参数**: `rewardId` - 奖励ID, `enabled` - 是否启用
- **返回**: `{ success: boolean, message?: string }`

---

#### 其他方法

##### `getLastExchangeTime()`
获取最后一次兑换时间（当前 loginUser）
- **返回**: `Promise<number>` - 时间戳

##### `getLastExchangeTimeByUser(userId)` *(M07 新增，M09 继续沿用)*
获取指定用户最后一次兑换时间
- **参数**: `userId` - 用户 ID
- **返回**: `Promise<number|null>` - 时间戳；无记录或出错时返回 `null`
- **说明**:
  - 用于首页按目标用户计算奖励兑换保护边界
  - `TaskService.resetTask()` 与首页取消完成前预检查都复用此方法，确保锁定语义一致
  - 不再用 `getLastExchangeTime()` 替代此用户级判断

### 奖励模型补充说明

- `Reward.fulfillmentMode`
  - `instant`：兑换即完成，前台展示为 `已兑换`
  - `manual`：兑换后待家长处理，前台展示为 `待发放 / 已发放`
- `Reward.exchangeUserId`
  - 标识具体是哪个孩子兑换了该奖励
  - 家庭兑换记录与“我的兑换”均以此字段为主归属依据
- 旧字段 `protectedByExpiry / partialProtection`
  - 已进入兼容保留状态
  - 不再作为前端主展示和新写路径 contract

---

## MessageService - 消息通知服务

消息服务负责消息主流读取、家长/孩子视角 scope 解析、本地缓存回灌，以及云端消息状态同步。M10 起，任务/奖励正式消息以云端为权威来源，前端仅负责读取、状态同步和失败时的 provisional 兜底。

### 核心功能
- 家长家庭流 / 孩子个人流作用域解析
- 云端消息全量刷新与本地 stale cleanup
- 单条已读、全部已读、删除的云端同步
- provisional 消息保留与 legacy 消息归档
- 云端模式主流展示过滤（仅 `formal + provisional`）
- 兼容旧接口 `getAllMessages()` / `getUnreadCount()`

### 作用域规则（M10）

- 家长处于家长视角时，默认读取 `scope='family'`
- 家长切到孩子视角时，默认读取 `scope='user'` 且 `userId=currentUserId`
- 孩子设备默认读取 `scope='user'` 且 `userId=currentUserId/loginUserId`
- 无登录上下文时回退到本地 `scope='all'`

### API 方法

#### 消息管理

##### `createSystemMessage(content, type = 'system', options = {})`
创建系统消息
- **参数**:
  - `content` - 消息内容字符串
  - `type` - 消息类型（默认 'system'）
  - `options` - 可选配置 `{ title, priority, userId, subType, expiryDate }`
- **返回**: `Promise<Message>`
- **说明**: 主要用于本地系统类消息；任务/奖励正式消息在云端模式下由后端主写路径生成

##### `createTaskMessage(task, type, options = {})`
创建任务消息（兼容本地路径）
- **参数**:
  - `task` - 任务对象
  - `type` - 通知类型
  - `options` - 附加选项，如 `{ priority, operatorUserId }`
- **返回**: `Promise<Message|null>`
- **说明**: M10 云端模式下，任务/奖励正式消息不再由前端直接持久化；该方法主要用于兼容旧本地路径或非云端消息类型

---

#### 消息查询

##### `refreshMessagesFromCloud(userId = null, options = {})`
按 scope 从云端拉取消息并回灌本地
- **参数**:
  - `userId` - `scope='user'` 时的目标用户 ID；家长家庭流可为空
  - `options.scope` - `'user' | 'family'`
- **返回**: `Promise<Message[]>`
- **说明**:
  - 云端模式下会先做正式提醒保鲜，再读取 `/api/messages`
  - 随后执行 `archiveLegacyMessages`、`replaceSyncedMessagesByScope` 与 `cleanupStaleMessages`
  - 返回值是当前 scope 下允许进入展示层的消息数组，而不是“未经筛选的仓储原始消息”

##### `getMessagesByScope(options = {})`
按 scope 获取消息，必要时先刷新云端
- **参数**:
  - `options.scope` - `'user' | 'family' | 'all'`
  - `options.userId` - 个人流目标用户 ID
  - `options.requireFresh` - 为 `true` 时先调用 `refreshMessagesFromCloud`
- **返回**: `Promise<Message[]>`
- **说明**:
  - 云端模式下主流展示只保留 `formal + provisional`
  - `scope='all'` 仅用于无登录上下文、初始化兼容或测试场景，不作为页面正式读取口径

##### `getAllMessages(options = {})`
兼容接口，内部委托到 `getMessagesByScope`
- **参数**: `options` - 同 `getMessagesByScope`
- **返回**: `Promise<Message[]>`
- **说明**: 默认继续代表“当前有效 scope”的消息快照

##### `getUnreadCount(options = {})`
获取未读消息数量
- **参数**: `options` - 同 `getMessagesByScope`
- **返回**: `Promise<number>`
- **说明**:
  - 有登录上下文时按当前主消息流统计
  - 无上下文且无显式 `scope` 时，回退本地仓储 `getUnreadCount`

---

#### 消息操作

##### `markMessageAsRead(messageId, options = {})`
标记消息为已读
- **参数**:
  - `messageId` - 消息ID
  - `options` - 可选 scope 参数
- **返回**: `Promise<boolean>`
- **说明**: 对正式云端消息会先调用 `PATCH /api/messages/:messageId/read`；若云端失败，本地已读状态不会先落库

##### `markAllMessagesAsRead(options = {})`
标记当前 scope 下的所有消息为已读
- **参数**:
  - `options.scope` - `'user' | 'family'`
  - `options.userId` - `scope='user'` 时可选
- **返回**: `Promise<number>`
- **说明**: 对正式云端消息会先调用 `PATCH /api/messages/read-all`；若云端失败，本地不会先批量改已读

##### `deleteMessage(messageId, options = {})`
删除消息
- **参数**:
  - `messageId` - 消息ID
  - `options` - 可选 scope 参数
- **返回**: `Promise<boolean>`
- **说明**: 对正式云端消息会先调用 `DELETE /api/messages/:messageId`；若云端失败，本地不会先删除

---
---

## ValidationService - 表单验证服务

验证服务提供统一的表单验证逻辑，支持多种验证规则。

### 核心功能
- 任务数据验证
- 奖励数据验证
- 用户数据验证
- 自定义验证规则
- 错误提示管理

### API 方法

##### `validateTaskForm(taskData)`
验证任务表单数据
- **参数**: `taskData` - 任务数据对象
- **返回**: `{ valid: boolean, errorMsg: string, data?: Object }`

##### `validateRewardForm(rewardData)`
验证奖励表单数据
- **参数**: `rewardData` - 奖励数据对象
- **返回**: `{ valid: boolean, errorMsg: string, data?: Object }`

##### `validateUserForm(userData)`
验证用户表单数据
- **参数**: `userData` - 用户数据对象
- **返回**: `{ valid: boolean, errorMsg: string, data?: Object }`

##### `validateField(fieldConfig, value, formData)`
验证单个字段
- **参数**:
  - `fieldConfig` - 字段配置对象
  - `value` - 字段值
  - `formData` - 完整表单数据（用于关联验证）
- **返回**: `{ valid: boolean, errorMsg: string }`

---

## UserService - 用户管理服务

用户服务管理用户账户、角色切换、家庭成员缓存等功能。M6 起引入 `loginUser`（设备拥有者）与 `currentUser`（当前数据视角）双轨模型。

### 核心概念（M22A 后）

| 字段 | 含义 | 生命周期 |
|------|------|---------|
| `loginUser` | 设备登录者（JWT 持有者），决定权限和功能可见性 | 应用启动后不变 |
| `currentUser` | 当前数据视角，家长可切换到孩子 | 随用户切换变化 |
| `familyPermissionRole` | 家长在家庭内的治理权限，取值 `manager | viewer | null` | 随家庭创建、加入或权限调整变化 |

- `isSwitchedChildView` 与 `isViewerReadonly` 已拆开建模：
  - 切到孩子视角不再等价于“全局只读”
  - `viewer` 家长在自己视角下只读，但切到孩子视角后仍可执行孩子自己的任务打卡链路
- 任务创建归属仍沿用 `targetUserId` 语义：家长在孩子视角创建任务时，任务归属到目标孩子
- 家庭治理与页面入口可见性应优先读取 `permissionContext`，而不是只看 `loginUser.role`

### 核心功能
- 登录用户（loginUser）初始化与维护
- 家庭成员缓存（userCache）加载与刷新
- 用户视角切换（currentUser）及会话恢复
- 基于角色的用户列表过滤
- 家庭内 `manager / viewer` 权限刷新与缓存收口

### API 方法

#### 登录用户

##### `getLoginUser()`
获取设备登录用户（设备拥有者，生命周期内不变）
- **返回**: `User | null`

##### `getLoginUserId()`
获取登录用户 ID
- **返回**: `string | null`

---

#### 当前视角用户

##### `getCurrentUser()`
获取当前视角用户（家长可切换到孩子）
- **返回**: `User`

##### `getCurrentUserId()`
获取当前视角用户 ID
- **返回**: `string`

##### `getCurrentUserRole()`
获取当前视角用户角色
- **返回**: `'parent' | 'child'`

---

#### 用户列表与查找

##### `getAllUsers()`
获取可用用户列表（家庭感知）
- **返回**: `User[]`
- **说明**：
  - 孩子设备（`loginUser.role === 'child'`）：只返回自身
  - 家长设备：返回 loginUser + 家庭中所有孩子，不含其他家长

##### `getUserById(userId)`
从缓存获取用户（同步）
- **参数**: `userId` (string)
- **返回**: `User | null`

##### `getUserByIdAsync(userId)`
获取用户，缓存未命中时从 API 拉取（异步）
- **参数**: `userId` (string)
- **返回**: `Promise<User | null>`

---

#### 用户切换

##### `switchToUser(userId)`
切换当前视角到指定用户
- **参数**: `userId` (string)
- **返回**: `Promise<{ success: boolean, user?: User, message?: string }>`
- **限制**：孩子设备（`loginUser.role === 'child'`）禁止切换；家长只能切换到孩子，不能切换到其他家长

---

#### 家庭成员

##### `loadFamilyMembers()`
从云端加载家庭成员并更新本地缓存
- **返回**: `Promise<boolean>`
- **说明**：登录用户无家庭（`loginUser.familyId` 为 null）时静默跳过，失败时缓存保留仅含 loginUser

##### `createFamily(name)`
创建家庭（M6新增）
- **参数**: `name` (string) - 家庭名称
- **返回**: `Promise<{ success: boolean, familyId?: string, message?: string }>`
- **说明**：
  - 创建成功后若后端返回新 token，自动保存并重新初始化 UserService
  - 创建者在家庭内会自动获得 `familyPermissionRole='manager'`

##### `joinFamily(inviteCode)`
通过邀请码加入家庭（M6新增）
- **参数**: `inviteCode` (string) - 邀请码
- **返回**: `Promise<{ success: boolean, message?: string }>`
- **说明**：
  - 加入成功后若后端返回新 token，自动保存并重新初始化 UserService
  - 使用家长邀请码加入后，当前用户会落为 `role='parent' + familyPermissionRole='viewer'`

##### `getFamilyInfo()`
获取当前家庭信息（M6新增）
- **返回**: `Promise<Object | null>`
- **说明**：失败时静默返回 null

##### `refreshInviteCode(role)`
刷新家庭邀请码（M6新增）
- **参数**: `role` ('parent' | 'child') - 目标角色
- **返回**: `Promise<Object>` - 包含新邀请码的响应对象
- **说明**：
  - 失败时直接抛出异常，调用方需自行捕获
  - 当前接口由家庭内 `manager` 家长使用；`role='parent'` 生成的是“默认 viewer 家长”邀请码

##### `createVirtualMember(name)`
创建虚拟成员（场景A共享设备，无独立微信账号的孩子）（M6新增）
- **参数**: `name` (string) - 成员名称
- **返回**: `Promise<{ success: boolean, member?: Object, message?: string }>`
- **说明**：创建成功后自动调用 `loadFamilyMembers()` 刷新缓存

##### `deleteFamilyMember(userId)`
软删除家庭成员（仅虚拟成员）（M6新增）
- **参数**: `userId` (string) - 目标用户ID
- **返回**: `Promise<{ success: boolean, message?: string }>`
- **说明**：删除成功后自动调用 `loadFamilyMembers()` 刷新缓存

##### `updateFamilyMemberPermissionRole(userId, familyPermissionRole)`
调整家庭内家长权限。
- **参数**:
  - `userId` (string) - 目标家长用户 ID
  - `familyPermissionRole` ('manager' | 'viewer')
- **返回**: `Promise<{ success: boolean, message?: string, token?: string }>`
- **说明**：
  - 仅云端模式支持
  - 成功后会自动 `initialize()`，刷新 `loginUser / currentUser / userCache`
  - 当操作者修改的是自己时，后端会回发新 token，本方法会先保存 token 再刷新上下文

##### `updateNickname(userId, nickname)`
更新成员昵称（M6新增）
- **参数**: `userId` (string) - 目标用户ID, `nickname` (string) - 新昵称
- **返回**: `Promise<{ success: boolean, message?: string }>`
- **说明**：更新成功后直接同步 userCache 和 currentUser/loginUser，不重新拉取

---

## ConfigService - 配置管理服务

配置服务管理系统配置和用户偏好设置。

### 核心功能
- 系统配置管理
- 用户偏好设置
- 配置缓存和同步
- 配置变更通知

### API 方法

#### 系统配置

##### `get(key, defaultValue = null)`
获取配置值
- **参数**: `key` - 配置键, `defaultValue` - 可选默认值
- **返回**: 配置值

##### `set(key, value)`
设置配置值
- **参数**: `key` - 配置键, `value` - 配置值
- **返回**: `boolean` - 是否成功

##### `remove(key)`
删除配置
- **参数**: `key` - 配置键
- **返回**: `boolean` - 是否成功

---

#### 用户偏好

##### `getUserPreference(key, defaultValue = null)`
获取用户偏好
- **参数**: `key` - 偏好键, `defaultValue` - 可选默认值
- **返回**: 偏好值

##### `setUserPreference(key, value)`
设置用户偏好
- **参数**: `key` - 偏好键, `value` - 偏好值
- **返回**: `boolean` - 是否成功

##### `getBatch(keys)`
批量获取配置
- **参数**: `keys` (Array) - 配置键数组
- **返回**: `Object` - 配置对象

##### `setBatch(configs)`
批量设置配置
- **参数**: `configs` (Object) - 配置对象
- **返回**: `boolean` - 是否全部成功

---

#### 批量操作

##### `clearAll()`
清除所有配置（谨慎使用）
- **返回**: `Promise<boolean>` - 是否成功

---

## AnalysisBoardService - 分析页月度看板聚合服务

`packageChart/services/analysis-board-service.js` 是分析页专用的轻量聚合模块，不通过 `ServiceManager` 注册实例，而是由页面直接按需调用。

### 核心功能
- 自然月日期列生成
- 基于 `focusUserId + task.type + normalizedTitle` 的任务聚类
- 单元格状态归并：`done / missed / upcoming / blank`
- 超限任务合并为 `其他任务`
- 生成顶部摘要与未来纯空列弱化所需元数据

### API 方法

##### `buildMonthlyBoard({ taskService, monthKey, focusUserId })`
根据指定孩子与指定月份生成分析页月度矩阵看板。
- **参数**:
  ```javascript
  {
    taskService: {
      getTasksByDateRange(startDate, endDate, userId, options): Promise<Array<Object>>
    },
    monthKey?: string, // YYYY-MM
    focusUserId: string
  }
  ```
- **返回**:
  ```javascript
  {
    monthKey: '2026-04',
    monthTitle: '2026年4月',
    daysInMonth: 30,
    columns: [
      {
        key: '2026-04-01',
        day: 1,
        date: '2026-04-01',
        weekdayLabel: '二',
        isToday: false,
        isWeekend: false,
        hasPlannedTasks: true,
        isFutureEmpty: false
      }
    ],
    rows: [
      {
        rowKey: 'child-1|study|数学',
        title: '数学',
        type: 'study',
        cells: [
          {
            date: '2026-04-01',
            state: 'done',
            symbol: '✓',
            cellClass: 'cell-done',
            taskIds: ['task-1'],
            isToday: false,
            isWeekend: false,
            isFutureEmpty: false
          }
        ]
      }
    ],
    summary: {
      displayedRowCount: 6,
      completedCount: 32,
      missedCount: 8,
      upcomingCount: 5
    },
    todayColumnDate: '2026-04-14'
  }
  ```
- **说明**:
  - `monthKey` 非法或缺失时会回退到当前月
  - `focusUserId` 为空时返回空看板 contract，不主动抛错
  - “今天未完成”按正式产品口径归为 `upcoming`，不显示为 `missed`
  - `isFutureEmpty` 仅用于页面弱化未来纯空列，不改变自然月完整日期轴

### 使用示例

```javascript
const serviceManager = require('../../services/service-manager.js');
const { buildMonthlyBoard } = require('../../packageChart/services/analysis-board-service.js');

const taskService = serviceManager.getService('task');

const board = await buildMonthlyBoard({
  taskService,
  monthKey: '2026-04',
  focusUserId: 'child-1'
});
```

---

## 服务集成示例

### 典型业务流程

```javascript
// 任务完成 → 奖励星星 → 兑换奖励流程
async function completeTaskAndClaimReward(taskId) {
  const serviceManager = getApp().serviceManager;
  const taskService = serviceManager.get('taskService');
  const starService = serviceManager.get('starService');
  const rewardService = serviceManager.get('rewardService');

  // 1. 完成任务
  const completeResult = await taskService.completeTask(taskId, 'child');
  if (!completeResult.success) {
    return { success: false, message: completeResult.message };
  }

  // 2. 检查星星余额
  const balanceResult = await starService.getStarBalance('child');
  const balance = balanceResult.balance;

  // 3. 兑换奖励（如果余额足够）
  if (balance >= 50) {
    const rewards = await rewardService.getAvailableRewards('child');
    if (rewards.success && rewards.rewards.length > 0) {
      const affordable = rewards.rewards.filter(r => r.cost <= balance);
      if (affordable.length > 0) {
        await rewardService.claimReward(affordable[0].id, 'child');
      }
    }
  }

  return { success: true };
}
```

---

## 最佳实践

### 1. 服务获取和使用

```javascript
// ✅ 正确：通过ServiceManager获取服务
const taskService = getApp().serviceManager.get('taskService');

// ❌ 错误：直接实例化服务
const taskService = new TaskService();
```

### 2. 错误处理

```javascript
// ✅ 推荐的错误处理模式
async function handleTaskOperation() {
  try {
    const result = await taskService.createTask(taskData);
    if (result.success) {
      logger.info('Page', '任务创建成功', result.task);
    } else {
      logger.warn('Page', '任务创建失败', result.message);
      wx.showToast({ title: result.message, icon: 'error' });
    }
  } catch (error) {
    logger.error('Page', '任务创建异常', error);
    wx.showToast({ title: '系统异常，请重试', icon: 'error' });
  }
}
```

### 3. 事件监听

```javascript
// 在页面中监听服务事件
Page({
  onLoad() {
    const eventBus = getApp().eventBus;

    eventBus.on('task:completed', this.handleTaskCompleted.bind(this));
    eventBus.on('reward:claimed', this.handleRewardClaimed.bind(this));
  },

  onUnload() {
    const eventBus = getApp().eventBus;

    eventBus.off('task:completed', this.handleTaskCompleted);
    eventBus.off('reward:claimed', this.handleRewardClaimed);
  },

  handleTaskCompleted(event) {
    logger.info('Page', '收到任务完成事件', event);
    this.refreshTaskList();
  }
});
```

### 4. 服务间协作

```javascript
// 多个服务协作完成业务流程
async function complexBusinessFlow() {
  const sm = getApp().serviceManager;

  // 服务间通过EventBus松耦合通信
  const taskService = sm.get('taskService');
  const starService = sm.get('starService');

  // TaskService完成时会发布事件
  await taskService.completeTask(taskId, userId);

  // StarService监听事件并响应（已在内部实现）
  // 不需要在这里手动调用
}
```

---

## 服务测试

### 文档边界

- 本章节只说明服务层测试相关的事实来源、Mock 策略和可测试性设计
- 项目级测试分层、命令入口、覆盖率口径请参阅 [testing-strategy.md](../development/testing-strategy.md)
- 后端真实数据库集成测试请参阅 [backend/test/README.md](../../backend/test/README.md)

### 测试文件

所有核心服务都有对应的单元测试文件，测试文件位于 `test/services/` 目录：

| 服务 | 测试文件 |
|------|---------|
| **TaskService** | `test/services/task-service.test.js` |
| **StarService** | `test/services/star-service.test.js` |
| **RewardService** | `test/services/reward-service.test.js` |
| **MessageService** | `test/services/message-service.test.js` |
| **UserService** | `test/services/user-service.test.js` |
| **ValidationService** | `test/services/validation-service.test.js` |

### 运行测试

```bash
# 运行特定服务测试
npm run test:services

# 运行单个服务测试
npm test test/services/task-service.test.js
```

### 测试覆盖范围

**TaskService 测试覆盖**：
- 初始化测试
- CRUD 操作测试
- 状态管理测试
- 必做任务管理
- 任务检查
- 进度计算
- 批量处理
- 惩罚处理
- 错误处理测试

**RewardService 测试覆盖**：
- 奖励管理测试
- 奖励状态管理测试
- 奖励查询测试
- 兑换流程测试
- 取消兑换测试
- 奖励计算测试
- 奖励复制测试
- 批量操作测试
- 辅助方法测试

**MessageService 测试覆盖**：
- 构造函数和初始化
- 消息管理 - 创建消息
- 消息管理 - 获取消息
- 状态管理 - 标记已读
- 状态管理 - 删除消息
- 批量操作
- 批量创建任务消息
- 事件处理 - 任务事件
- 事件处理 - 奖励事件
- 事件处理 - 领域模型事件
- 错误处理
- 边界条件
- 用户操作者逻辑
- 即将到期任务通知
- 消息优先级
- 事件总线集成

### Mock 策略

测试使用依赖注入和 Mock 策略：

```javascript
// Mock Repository
const taskRepository = {
  create: jest.fn().mockResolvedValue({ id: '1', title: 'test' }),
  update: jest.fn().mockResolvedValue(true),
  delete: jest.fn().mockResolvedValue(true),
  findById: jest.fn().mockResolvedValue({ id: '1', title: 'test' }),
  findAll: jest.fn().mockResolvedValue([])
};

// Mock EventBus
const eventBus = {
  publish: jest.fn()
};

// Mock Logger（已在全局设置）
jest.mock('../../utils/logger');
```

### 可测试性

所有核心服务都支持依赖注入，便于单元测试：

```javascript
// 通过构造函数注入依赖
const taskService = new TaskService({
  taskRepository: mockRepository,
  starService: mockStarService,
  eventBus: mockEventBus
});
```

---

### 云端任务服务

任务服务支持云端存储模式，但只有在显式配置 `ENABLE_API=true` 且显式提供 `API_BASE_URL` 时才会启用。

#### API 配置
云端API通过 `API_CONFIG` 进行配置，详见 `utils/api-config.js`。

#### 启用条件
- 未配置 `ENABLE_API` / `API_BASE_URL`：保持本地模式
- 配置 `ENABLE_API=true` 但未配置 `API_BASE_URL`：仍保持本地模式
- 配置 `ENABLE_API=true` 且配置有效 `API_BASE_URL`：启用云端模式

#### 云端存储模式
系统支持三种存储模式（优先级从高到低）：
1. **云端优先模式**（推荐）
2. **本地优先模式**（离线）
3. **本地仅用模式**（测试）

详细说明请参阅：[docs/design/milestone-05b-task-management.md](../design/milestone-05b-task-management.md)

---

**最后更新**：2026-04-21
**维护者**：项目维护团队
