# 更新日志

记录学习任务微信小程序的功能更新、bug修复和重要变更。

---

## [里程碑-07] - 2026-03-19

### ✅ 完成情况

**普通任务云端同步（CRUD全链路）**

- 后端新增 `PUT /api/tasks/:taskId`（字段白名单、权限校验、Task.validate）
- 后端新增 `DELETE /api/tasks/:taskId`（软删除，`deleted_at`）
- 后端新增 `PATCH /api/tasks/:taskId/status`（仅接受数字 0/1，服务端推导时间字段）
- 后端新增 `GET /api/tasks?scope=family`（家长才可访问，孩子返回 403）
- 数据库迁移 `005_alter_tasks_add_fields.sql`：新增 `deleted_at`、`completion_time`、`star_awarded`、`modify_time`、`duration`、`has_no_end_date`、`tags` 字段
- 全量读路径（`getTasksByUser`/`getTaskById`/`countTasks`/`getTasksByFamily`）添加 `AND deleted_at IS NULL` 过滤

**前端云端双写同步**

- 新增 `_syncUpdateToCloud`：任务编辑后异步同步到云端，失败静默降级
- 新增 `_syncDeleteToCloud`：任务删除后异步同步，404 视为成功（本地重复实例从未上云）
- 新增 `_syncStatusToCloud`：完成/重置后异步同步状态
- `updateTask`、`deleteTask`、`updateTaskStatus`、`resetTask` 均已挂载对应同步方法

**跨设备健壮性**

- `_fetchTasksFromCloud`：只回灌 `loginUserId` 的任务（维护 M06 隔离），新增 `status`/`starAwarded` 合并规则防本地状态被覆盖
- 新增 `_fetchSingleTaskFromCloud`：写操作本地 miss 时补拉单条任务，只持久化 `loginUserId` 的任务
- `getAllTasks` 合并本地 localOnly 任务（解决重复任务实例热力图缺失）
- `resetTask` 跨设备显式拒绝（`crossDeviceLimit: true`），防止星星账目错误
- 新增 `getTasksByScope(options)`：支持 `scope=family`（家长看全家）或 `userId`（孩子看自己）

**分析页用户隔离重新上线**

- `analysis.js` 提取 `getAnalysisOptions(loginUser)` 函数，家长返回 `{ scope: 'family' }`，孩子返回 `{ userId }`
- `analysis.wxml` 把 `analysisOptions` 传给 `star-calendar` 和 `star-trend` 子组件
- `star-calendar` 改为 `getTasksByDateRange` 整月批量拉取，避免 ~30 次并发请求
- `star-trend` 新增 `observers` 监听 `analysisOptions` 变化，账号/角色切换后自动刷新
- `analytics-service` 的 `getTaskStarCalendarData`/`getTaskCompletionStats` 改用 `getTasksByScope`
- 星星趋势图添加免责提示："星星数据仅含本设备记录，完整数据 M09 上线"
- 首页分析入口（菜单 + 进度环）全面开放

### 🔧 Bug 修复

- 修复 `_fetchTasksFromCloud` N² 写放大：改为 `saveAll` 批量持久化
- 修复任务完成后状态闪回：云端读取时合并本地 `modifyTime` 更新的状态
- 修复 `task-edit` 热力图显示家长自己的任务：改为传 `targetUserId`
- 修复家长视角首页任务进度为 0：`onShow` 中确保 `availableUsers` 在 `loadAllPageData` 前就绪
- 修复 `star-calendar` `detached` 事件解绑错误名（`TASK_STATUS_CHANGED` → `TASK_STATUS_UPDATED`）
- 修复奖池页面显示家长 0 颗星：改为读有效孩子的星星数
- 修复奖池代孩子兑换取第一个孩子：改为优先取 `lastActiveChildId`
- 修复 `star-calendar` 降级路径用 `starAwarded` 判断星星收入：改为 `points > 0`

### ⚠️ 已知限制（后续解决）

- 重复任务实例不上云，跨设备下重复任务分析数据可能不完整（M08/M09 处理）
- 云端写失败后本地更新会在下次从云端读取时被覆盖（无重试队列，M08 处理）
- `resetTask` 跨设备操作因本地无对应星星记录而拒绝（M09 星星同步后解决）
- 奖励未做云端同步，孩子在自己设备上看不到家长创建的奖励（M09 处理）

### 📖 详细实施记录

- [里程碑-07：普通任务云端同步 + 分析页隔离](../design/milestone-07-task-sync.md)

---

## [里程碑-06] - 2026-03-15

### ✅ 完成情况

**家庭账户 + 数据隔离**

- 家庭账户后端 API：创建家庭、邀请码加入、成员管理（虚拟成员、软删除）
- 角色权限分离：`loginUser`（设备拥有者，控制权限）vs `currentUser`（数据视角）
- 家长视角默认显示第一个孩子的任务，支持多孩子切换
- 孩子视角只读（不能创建/编辑/删除任务），支持打卡（完成/重置）
- 家长为孩子创建任务云端持久化（`targetUserId` 链路）
- PIN 保护：共享设备孩子视角切回家长视角需输入 PIN
- 家庭设置页面：邀请码生成、成员添加/删除、昵称编辑
- 多孩子积分归属修复（`completeTask`、`resetTask`、`handleRequiredTaskPenalty`）

### 🔧 Bug 修复

- 修复多孩子家庭下积分错误归属到第一个孩子
- 修复孩子设备启动时可能恢复到他人视角（强制回正到 loginUser）
- 修复后端 `createTask`/`_resolveTargetUserId` 允许操作其他家长数据（补加角色校验）
- 修复 `_restoreSession` 绕过 `storageAdapter` 直接调用 `wx.setStorageSync`
- 修复 `FEATURE_PERMISSIONS.child.task.reset` 语义错误（改为 `true`）

### ⚠️ 已知限制（M7 解决）

- 编辑/删除/打卡状态的跨设备实时同步
- 分析页按孩子视角过滤

### 📖 详细实施记录

- [里程碑-06：家庭账户](../design/milestone-06-family-account.md)
- [M6 补充设计：家长角色定位 v4](../design/milestone-06-supplement-parent-role.md)

### 🔍 实施验证与优化（2026-03-16）

**验证结果**：
- ✅ 首页星星/奖励卡片冻结到loginUser（`calculateNextAvailableReward`、`getAvailableRewards` 已传入 `loginUserId`）
- ✅ 星星过期保护使用正确userId（`app.js:347` 已传入 `loginUserId`）
- ✅ 分析页入口全局禁用（所有视角均显示"分析功能即将上线"）
- ✅ 任务加载按用户过滤（所有任务加载调用都传入 `currentUserId`）
- ✅ 用户服务初始化等待优化（同时等待token和用户服务初始化完成）

**代码优化**：
- `index.js`：优化用户服务初始化等待逻辑，提升启动稳定性
- `index.js`：全局禁用分析页入口，待M10补齐数据隔离后开放
- `index.js`：所有任务加载调用都传入 `currentUserId`，确保用户隔离
- `.gitignore`：添加临时工作文件忽略规则（`*.tar.gz`、`findings.md`、`progress.md`、`task_plan.md`）

---

## [里程碑-05A] - 2026-03-09

### ✅ 完成情况
- 后端基础设施搭建（Express + MySQL）
- 用户认证功能（JWT + 微信登录）
- 基础集成测试（18/18通过）
- 任务管理基础API（创建、查询）
- 云端数据存储（MySQL）
- 端到端流程验证

### 🔧 Bug修复
- 修复API数据一致性问题
- 修复用户认证接口实现

### 📖 详细实施记录
[里程碑-05A：后端认证](../design/milestone-05a-backend-auth.md)

---

## [里程碑-05B] - 2026-03-09

### ✅ 完成情况
- 任务管理API完整实现（创建、查询、详情、统计）
- 小程序接入后端API集成完成
- 双写策略实现（云端+本地）并验证成功
- 离线降级机制实现并验证成功
- 完整集成测试（前端1237/1241测试通过，后端18/18通过）

### 🐛 后续修复（2026-03-12）
- ✅ 修复首页日期切换无法显示云端任务的Bug
- ✅ 配置MySQL dateStrings: true确保日期格式统一
- ✅ 完善getTasksByDate云端逻辑，支持按日期查询云端任务
- ✅ 优化getTodayTasks复用云端逻辑
- ✅ 增强_fetchTasksFromCloud支持查询参数传递

### 📖 详细实施记录
[里程碑-05B：任务管理](../design/milestone-05b-task-management.md)

---

## [3.5.0] - 2026-03-09

### 云端存储基础功能上线 🎉

**功能亮点**：
- ✅ **云端存储集成**：完成本地+云端双写策略
- ✅ **API服务稳定**：后端100%测试通过率
- ✅ **前端无缝接入**：99.7%测试通过率

**里程碑详情**：
- [里程碑-05A：后端认证](../design/milestone-05a-backend-auth.md)
- [里程碑-05B：任务管理](../design/milestone-05b-task-management.md)

### 质量评分
⭐⭐⭐⭐⭐ **5/5星 - 优秀**

---

## [计划中] - 云端存储迁移项目 🚧

### 项目概述

- **背景**：现有数据存储在微信本地，清理缓存会导致数据丢失
- **目标**：搭建云端后端架构，实现家庭账户管理和多设备数据同步
- **实施计划**：里程碑-05到里程碑-10
- **详细规划**：docs/design/cloud-storage-migration.md

### 接下来的里程碑

| 里程碑 | 内容 | 状态 |
|--------|------|------|
| M08 | 云端同步完善（重复任务同步 + 冲突解决） | 🟡 设计中 |
| M09 | 星星积分 + 奖励云端同步 | 🔴 未启动 |
| M10 | 消息通知 + 完善优化 | 🔴 未启动 |

---

---

## [3.4.1] - 2026-03-06

### 测试环境和仓储错误处理优化

- ✅ 错误处理优化：BaseRepository 保存失败时抛出异常
- ✅ 测试覆盖提升：新增服务层测试
- ✅ 配置优化：优化 Jest 配置
- ✅ 文档清理：删除过时文档

---

## [3.4.0] - 2026-03-04

### 里程碑-04收尾：完成剩余测试和文档维护

- ✅ 测试基础设施完善：完成所有剩余测试文件创建（5个新文件）
- ✅ 测试用例清理：删除message-service.test.js中11个跳过的测试用例
- ✅ 测试质量提升：清理3个测试文件中的失败测试用例（28个）
- ✅ 文档归档：归档3个已完成的设计文档
- ✅ 代码标记清理：确认无实际TODO/FIXME标记

---

## [3.3.0] - 2026-03-04

### 里程碑-04完成：测试核心逻辑和主干流程

- ✅ 测试基础设施：完成 TestDataFactory、MockEventBus、MockSetup、ScenarioBuilder
- ✅ 领域模型测试：完成 Star、Reward、Message、StarGroup 模型测试（覆盖率~99%）
- ✅ 仓储层测试：完成所有主 Repository 测试（覆盖率~85%）
- ✅ 服务层测试：完成 Task、Star、Reward 服务测试（覆盖率~76%）
- ✅ 测试通过率：974个通过 / 988个总数（98.6%）

---

## [3.3.1] - 2026-03-03

### 代码质量提升
- ✅ 删除重复的日期格式化方法
- ✅ 编码规范更新：补充错误处理日志规范

---

## [3.2.1] - 2026-03-03

### 代码清理
- ✅ 删除未使用代码和调试输出
- ✅ 清理过时标记和注释代码
- ✅ API和仓储文档更新

---

## [3.2.0] - 2026-03-02

### 新增
- ✅ 测试环境优化：完善Jest测试环境配置，添加微信API mock支持
- ✅ 更新日志：初始化CHANGELOG.md文档

---

## [3.1.0] - 2026-02-27

### 新增
- **单元测试体系**：建立完整的Jest测试框架
  - 配置测试环境和运行脚本
  - 实现领域模型、应用服务和工具函数测试
  - 创建Mock适配器和覆盖率配置

### 文档
- **项目维护文档**：完善项目文档体系
  - 更新GITHUB_WORKFLOW.md，明确分支策略和本地开发流程
  - 重组文档目录结构
  - 建立设计文档模板和指南
  - 完善编码规范和工作流程

---

## [3.0.0] - 2026-02-20

### 重构
- **DDD架构**：完整的领域驱动设计架构重构
  - 领域层、应用服务层、基础设施层完整实现
  - ServiceManager统一服务管理
  - EventBus事件驱动通信

### 新增
- **任务管理**：完整的任务CRUD、状态管理、必做任务惩罚
- **星星积分系统**：获取、分组、FIFO消费、过期处理
- **奖励兑换**：管理、库存、兑换、状态跟踪
- **消息通知**：系统消息、任务提醒、奖励预警
- **数据分析**：任务分布、完成情况、星星趋势
- **多用户支持**：家长和小朋友角色切换

### 优化
- **性能优化**：批量处理、多级缓存、事件聚合
- **分包加载**：主包、功能分包
- **适配性**：单位转换、屏幕适配

### 修复
- 扣星延迟和重复扣分问题
- 过期星星奖励保护功能
- 用户切换功能

---

## 版本号规则

- **主版本号**：重大架构变更或不兼容修改
- **次版本号**：新增功能或重要改进
- **修订号**：Bug修复或小改进

---

**最后更新**：2026-03-16
