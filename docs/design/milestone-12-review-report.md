# M12 前端结构治理 - 工程评审报告

> **评审日期**: 2026-03-25
> **评审类型**: 工程评审 (plan-eng-review)
> **设计文档**: `docs/design/milestone-12-frontend-structure-governance.md`
> **分支**: develop
> **提交**: d00426b

---

## 目录

- [Step 0: Scope Challenge](#step-0-scope-challenge)
- [1. Architecture Review](#1-architecture-review)
- [2. Code Quality Review](#2-code-quality-review)
- [3. Test Review](#3-test-review)
- [4. Performance Review](#4-performance-review)
- [5. NOT in Scope](#5-not-in-scope)
- [6. What Already Exists](#6-what-already-exists)
- [7. Failure Modes](#7-failure-modes)
- [8. 评审结论](#8-评审结论)
- [9. 审核结果](#9-审核结果)
- [10. 完成度统计](#10-完成度统计)

---

## Step 0: Scope Challenge

### 范围分析

**设计文档提议的变更**：

| 类型 | 数量 | 详情 |
|------|------|------|
| 新增文件 | 15 | utils/app/(4) + pages/index/modules/(5) + services/task-service/(5) + 设计文档(1) |
| 修改文件 | 4 | app.js, index.js, task-service.js, ROADMAP.md |
| **总计** | **19** | 超过 8 文件阈值 |

**复杂度触发**：✅ 已触发（19 > 8）

**用户决策**：接受完整范围

**理由**：
- 这是结构治理里程碑，目标是拆分 1000-3000 行的超大文件
- 外部 API 保持稳定，仅内部重组
- 已有清晰的分阶段实施策略和回滚方案

---

## 1. Architecture Review

### 1.1 问题识别验证

#### ✅ 设计文档准确识别的问题

**app.js 职责混杂**（995行）：
```
Line 13-253: onLaunch() 混合了:
- 环境配置读取
- UserService 初始化（重复 5 次）
- ServiceManager 初始化
- wx.login 回调
- postLoginInitialization
- 设备监听
```

**首页刷新口径不一致**（3024行）：
```
Line 333, 366: handleTaskDataChanged() 硬编码 getTodayTasks()
- 用户可能在查看其他日期的任务
- 事件触发刷新会跳回"今天"
```

**TaskService 是超级服务**（2608行）：
```
18+ async 方法混合了:
- 查询方法 (6个)
- 写入方法 (4个)
- 检查/惩罚方法 (3个)
- 同步方法 (5个)
```

### 1.2 架构决策确认

| # | 问题 | 决策 | 理由 |
|---|------|------|------|
| 1 | utils/app/ 模块导出模式 | ✅ 纯函数模块 | 简单、可测试，接收 app 实例作为参数 |
| 2 | index-lifecycle 与 index-user-context 分离 | ✅ 保持分离 | 职责分离：等待逻辑 vs 用户初始化 |
| 3 | TaskService 子模块依赖访问 | ✅ 宿主引用模式 | 子模块通过构造函数接收宿主引用，访问 this.taskRepository 等 |
| 4 | waitForServicesReady 位置 | ✅ 移入 index-lifecycle | 与生命周期等待逻辑内聚 |

### 1.3 架构图评估

设计文档的 Mermaid 架构图清晰展示了模块依赖关系：

```
app.js → utils/app/ (4模块)
pages/index/index.js → pages/index/modules/ (5模块)
task-service.js → task-service/ (5模块)
```

**评估**：符合 DDD 原则，外部 API 稳定，内部职责清晰。

---

## 2. Code Quality Review

### 2.1 DRY 违规确认

| 问题 | 位置 | 重复次数 |
|------|------|---------|
| `new UserService({...})` | app.js Line 56, 81, 107, 186, 870 | **5 次** |
| `_fetchSingleTaskFromCloud()` | task-service.js Line 969, 1036, 1119, 1314 | **4 次** |
| `getTodayTasks()` 硬编码 | index.js Line 333, 366 | **2 次** |
| `setData({...})` 调用 | index.js 全文 | **71 次** |

### 2.2 代码质量决策

| # | 问题 | 决策 | 理由 |
|---|------|------|------|
| 1 | loadTaskForWrite 抽取 | ✅ 采纳 | 在 task-write-module 中抽取统一方法，消除 4 处重复 |
| 2 | 统一视图日期方法 | ✅ 采纳 | 在 index-refresh-coordinator 中提供 getTasksForCurrentView() |

---

## 3. Test Review

### 3.1 新增代码路径图

```
┌─────────────────────────────────────────────────────────────────────┐
│  [app.js 壳层]                                                      │
│       ├──▶ [bootstrap-auth.js] prepareUserService, runWxLogin       │
│       ├──▶ [bootstrap-services.js] initialize                       │
│       ├──▶ [post-login-bootstrap.js] run, fixLegacyTaskData         │
│       └──▶ [runtime-observers.js] install                           │
│                                                                     │
│  [pages/index/index.js 壳层]                                        │
│       ├──▶ [index-lifecycle.js] waitForServicesReady, waitForLogin  │
│       ├──▶ [index-user-context.js] initializeMultiUserSystem        │
│       ├──▶ [index-refresh-coordinator.js] refreshPageData, etc      │
│       ├──▶ [index-task-actions.js] completeTask                     │
│       └──▶ [index-reward-flow.js] checkRewardUnlock, etc            │
│                                                                     │
│  [TaskService 门面]                                                 │
│       ├──▶ [task-query-module.js] 查询方法委托                       │
│       ├──▶ [task-write-module.js] loadTaskForWrite, 写入委托        │
│       ├──▶ [task-sync-module.js] 同步方法                           │
│       ├──▶ [task-penalty-module.js] 惩罚方法                        │
│       └──▶ [task-repeat-module.js] 重复任务生成                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 测试覆盖分析

| 测试文件 | 覆盖模块 | 状态 |
|---------|---------|------|
| `test/app/app-bootstrap.test.js` | 启动链路 4 模块 | 🆕 需新增 |
| `test/pages/index.index-refresh-coordinator.test.js` | 刷新协调器 | 🆕 需新增 |
| `test/pages/index.index-task-actions.test.js` | 任务操作 | 🆕 需新增 |
| `test/services/task-service.facade.test.js` | 门面委托 | 🆕 需新增 |
| `test/services/task-service.test.js` | TaskService 现有 | ✅ 已存在 |
| `test/pages/index.reward-flow.test.js` | 奖励流转 | ✅ 已存在 |

**用户决策**：创建完整测试套件（4 个新测试文件）

---

## 4. Performance Review

### 4.1 性能问题

| 问题 | 影响 | 位置 |
|------|------|------|
| UserService.initialize() 重复调用 | 串行等待，启动延迟 | app.js 5 处 |
| setData 调用过多 (71次) | 页面渲染性能 | index.js 全文 |

### 4.2 性能决策

| # | 问题 | 决策 | 理由 |
|---|------|------|------|
| 1 | setData 合并 | ✅ 在 index-refresh-coordinator 中实现批量合并 | 减少渲染次数，与设计文档一致 |

---

## 5. NOT in Scope

以下工作被考虑但明确排除在 M12 之外：

| 项目 | 排除原因 |
|------|---------|
| MessageService 重构 | 范围控制，M12 只处理 3 个核心文件 |
| StarService 重构 | 范围控制，模式可复用 TaskService 方案 |
| RewardService 重构 | 范围控制，模式可复用 TaskService 方案 |
| 环境切换方式修改 | 业务语义不变原则 |
| 登录业务语义修改 | 业务语义不变原则 |
| 视觉改版 | 非 M12 目标，属于 M14 范畴 |
| 扩大测试覆盖口径 | 属于 M13 质量闸门升级议题 |

---

## 6. What Already Exists

| 现有代码/流程 | 是否复用 | 说明 |
|--------------|---------|------|
| ServiceManager | ✅ 复用 | 继续通过 ServiceManager 访问服务 |
| EventBus | ✅ 复用 | 继续使用事件总线进行跨服务通信 |
| TaskRepository | ✅ 复用 | TaskService 门面继续使用现有仓储 |
| 现有测试框架 | ✅ 复用 | Jest + MockSetup + TestDataFactory |
| index.reward-flow.test.js | ✅ 复用 | 奖励流转测试已存在，需验证兼容性 |

---

## 7. Failure Modes

| 新代码路径 | 失败场景 | 测试 | 错误处理 | 用户可见 |
|-----------|---------|------|---------|---------|
| bootstrap-auth.prepareUserService | token 校验失败 | 🆕 | ✅ 降级本地模式 | 静默 |
| index-refresh-coordinator.refreshPageData | 服务未就绪 | 🆕 | ✅ 等待超时 | 静默 |
| task-write-module.loadTaskForWrite | 云端补拉失败 | 🆕 | ✅ 返回 null | 静默 |
| **TaskService 门面委托** | **子模块异常** | 🆕 | ⚠️ **需确认** | **可能静默** |

**⚠️ 关键缺口**：TaskService 门面委托的异常处理需要确认是否会正确传播到调用方。

---

## 8. 评审结论

### ✅ 设计文档优点

1. **问题识别准确**：基于真实代码分析，DRY 违规和职责混杂问题都有明确代码证据
2. **技术方案合理**：门面模式 + 纯函数模块的组合符合 DDD 原则
3. **外部 API 稳定**：不改变服务名、方法签名，降低回归风险
4. **分阶段实施**：4 个步骤有明确的验收标准和依赖关系
5. **替代方案分析完整**：考虑了 3 种替代方案并说明未选择原因
6. **风险评估充分**：识别了启动链回归、首页刷新偏移、隐式依赖丢失等风险
7. **回滚策略清晰**：以步骤为单位提交，可局部回退

### ⚠️ 需要补充的内容

| # | 补充项 | 优先级 | 建议位置 |
|---|--------|--------|---------|
| 1 | 模块导出模式明确 | P1 | 技术方案 → 技术选型表 |
| 2 | 宿主引用模式说明 | P1 | 技术方案 → TaskService 门面化方案 |
| 3 | 门面异常传播策略 | P1 | 代码结构 → 核心代码结构示例 |
| 4 | setData 合并策略 | P2 | 技术方案 → 首页模块化方案 |

### 📝 具体补充建议

#### 补充 1：模块导出模式（技术选型表新增行）

```
| 模块导出模式 | 纯函数导出 | Class 实例化 | 简单、可测试，无需实例化 |
```

#### 补充 2：宿主引用模式（TaskService 门面化方案新增）

```javascript
// 子模块通过工厂函数接收宿主引用
function createTaskSyncModule(host, deps) {
  return {
    async _fetchTasksFromCloud(userId, params) {
      // 通过 host 访问共享依赖
      const { enableCloudStorage, taskRepository, userService } = host;
      // ...
    }
  };
}
```

#### 补充 3：门面异常传播策略（核心代码结构示例补充）

```javascript
// services/task-service.js
class TaskService {
  async getTasksByDate(date, userId, options) {
    try {
      return await this.queryModule.getTasksByDate(date, userId, options);
    } catch (error) {
      logger.error('TaskService', '查询任务失败', { date, userId, error });
      throw error; // 直接传播，由调用方处理
    }
  }
}
```

#### 补充 4：setData 合并策略（首页模块化方案补充）

```javascript
// index-refresh-coordinator.js
async refreshPageData(page, options = {}) {
  const updates = {};

  // 收集所有更新
  if (options.refreshTasks) {
    updates.tasks = await this._loadTasks(page);
  }
  if (options.refreshMessages) {
    updates.messages = await this._loadMessages(page);
  }
  if (options.refreshRewards) {
    Object.assign(updates, await this._loadRewards(page));
  }

  // 一次性提交
  page.setData(updates);
}
```

---

## 9. 审核结果

| 状态 | 说明 |
|------|------|
| 🔶 **需修改** | 设计文档整体质量良好，需补充上述 4 项内容 |

**修改完成后**：可进入实施阶段

---

## 10. 完成度统计

| 检查项 | 结果 |
|--------|------|
| Step 0: Scope Challenge | ✅ 范围确认（19文件，完整版） |
| Architecture Review | ✅ 4 个问题已确认 |
| Code Quality Review | ✅ 2 个问题已确认 |
| Test Review | ✅ 测试图已生成，4 个新测试文件确认 |
| Performance Review | ✅ 1 个问题已确认 |
| NOT in scope | ✅ 已记录 |
| What already exists | ✅ 已记录 |
| Failure modes | ⚠️ 1 个关键缺口需确认 |
| Lake Score | **7/7** 选择完整选项 |

---

## Review Readiness Dashboard

```
+====================================================================+
|                    REVIEW READINESS DASHBOARD                       |
+====================================================================+
| Review          | Runs | Last Run            | Status    | Required |
|-----------------|------|---------------------|-----------|----------|
| Eng Review      |  1   | 2026-03-25 15:59    | OPEN      | YES      |
| CEO Review      |  0   | —                   | —         | no       |
| Design Review   |  0   | —                   | —         | no       |
| Codex Review    |  0   | —                   | —         | no       |
+--------------------------------------------------------------------+
| VERDICT: NOT CLEARED — Eng Review has open issues                  |
+====================================================================+
```

---

**评审人**: Claude Code (plan-eng-review)
**评审日期**: 2026-03-25
**报告版本**: v1.0
