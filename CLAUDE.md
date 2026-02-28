# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供指导。

## 项目概览

**学习任务微信小程序** - 采用领域驱动设计（DDD）架构的游戏化任务管理应用

**核心特性**：
- **微信小程序原生开发**
- **DDD分层架构**（models → services → repositories/adapters → pages/components）
- **游戏化设计**（星星积分、奖励系统）
- **本地存储**（StorageAdapter，无云服务）
- **测试覆盖**（Jest单元测试，目标85%+）

**重要约束**：
- 这是一个微信小程序原生应用，不是跨平台应用
- 不要建议使用 uni-app、Taro 等跨平台框架
- 不要引入微信云开发（本地存储优先）
- 不要引入重型依赖（Vue、React等）
- 遵循DDD架构原则，不得绕过服务层

详细的架构决策请参阅 `docs/architecture/architecture.md`。
详细的编码规范请参阅 `docs/development/coding_standards.md`。
详细的开发流程请参阅 `docs/development/workflow.md`。

---

## 快速参考

### 常用命令

```bash
# 运行测试
npm test

# 运行特定模块测试
npm run test:models
npm run test:services
npm run test:repositories

# 生成测试覆盖率报告
npm run test:coverage

# 代码规范检查
npm run lint

# 自动修复代码规范问题
npm run lint:fix

# 代码格式化
npm run format

# 项目健康检查
npm run health-check
```

### 关键文件位置

| 文件 | 说明 |
|------|------|
| `app.js` | 小程序入口，初始化ServiceManager |
| `models/` | 领域模型（Task、Star、Reward等） |
| `services/` | 应用服务（TaskService、StarService、RewardService等） |
| `repositories/` | 数据仓储（TaskRepository、StarRepository等） |
| `adapters/` | 适配器（StorageAdapter、LoggerAdapter、AnalyticsAdapter） |
| `utils/logger.js` | 统一日志工具 |
| `utils/batchUtils.js` | 批量处理工具 |
| `utils/eventBus.js` | 事件总线 |
| `test/` | Jest单元测试 |

### 核心代码位置

- **DDD架构**：`docs/architecture/architecture.md`
- **服务管理**：通过ServiceManager访问所有服务
- **跨服务通信**：使用EventBus进行事件发布/订阅
- **批量处理**：使用batchUtils进行大量数据操作
- **日志记录**：使用logger进行关键操作记录

---

## 修改之前必读

首先阅读这些文档：
- `docs/architecture/architecture.md` - 理解DDD架构设计
- `docs/development/workflow.md` - 开发规范和流程
- `docs/development/coding_standards.md` - 编码规范详细说明

尽量复用现有代码，避免非必要的新增（使用 batchUtils、EventBus、logger、ServiceManager 等）。

**核心原则**：这是一个微信小程序原生应用，采用DDD架构。避免过度设计。

---

## AI行为准则

- 内化项目约束，在方案设计中自然体现，无需每次口头复述
- 收到开发任务时，首先评估是否符合DDD架构和微信小程序定位
- 如果需求超出定位，说明权衡并提供符合定位的替代方案
- 优先简单方案，避免过度设计
- 不直接说"不能做"，而是提供替代思路；如果一定要实现，说明应该创建独立项目

---

## 开发任务工作流程 ⭐ 核心

⚠️ **重要**：所有新功能必须遵循以下流程，**禁止未经审核直接编码**

### 阶段1：设计阶段（必需）

1. **先阅读文档**
   - `docs/architecture/architecture.md` - DDD架构
   - `docs/development/workflow.md` - 编码规范
   - `docs/development/CHANGELOG.md` - 当前进度

2. **检查现有实现**
   - 搜索相关功能（避免重复造轮子）
   - 理解现有设计模式
   - 基于现有代码改进，而非重写

3. **创建详细设计文档** ⚠️ **必须**
   - 在 `docs/design/` 创建 `[feature-name].md`
   - 使用模板：`docs/design/.template.md`
   - 包含：需求分析、技术方案、代码结构、实施步骤、测试方案、风险评估
   - 设计文档编写严格按照 `docs/design/README.md` 的要求编写

4. **提交审核** ⚠️ **必须**
   - 将设计文档提交给项目维护者审核
   - 审核通过后才能进入实施阶段
   - 审核标准：符合DDD架构、技术方案合理、实施步骤清晰

### 阶段2：实施阶段（审核通过后）

5. **按照设计文档实施**
   - 严格遵循设计文档中的实施步骤
   - 遵循现有代码风格（参考 `docs/development/coding_standards.md`）
   - 添加必要注释（简洁中文）
   - 不添加不必要的依赖
   - 如需变更设计，必须重新审核

### 阶段3：完成阶段（实施后）

6. **完成后：同步更新文档** ⚠️ **重要**
   - 代码和文档**必须同时提交**
   - 根据代码变更类型，更新对应文档：
     - 新增/修改服务/仓储 → 更新 `docs/api/services-guide.md` 或 `repositories.md`
     - 新功能 → 更新 `docs/development/CHANGELOG.md`、`docs/design/[feature-name].md`
     - 修复常见问题 → 更新 `docs/development/troubleshooting.md`
     - 架构调整 → 更新 `docs/architecture/*.md`
     - 发现新陷阱 → 更新 CLAUDE.md 的"常见陷阱"部分
   - **检查清单**：
     - [ ] 是否新增/修改了服务/仓储？→ 更新 API文档
     - [ ] 是否新增了功能？→ 更新 CHANGELOG.md、design/[feature].md
     - [ ] 是否改变了配置？→ 更新相关文档
     - [ ] 是否修复了常见问题？→ 更新 troubleshooting.md
     - [ ] 是否改变了架构设计？→ 更新 architecture/*.md
     - [ ] 是否发现新的陷阱？→ 更新 CLAUDE.md

**参考**：文档更新规范详见 `docs/development/workflow.md` 的"文档维护"章节

---

## 常见陷阱 ⭐ 核心

**陷阱0：未经审核直接编码** ⚠️ **最严重**

❌ **错误示例**（通用场景）：
```
用户："添加一个新功能"
AI助手：[直接开始写代码]

问题：
❌ 违反强制设计文档流程
❌ 没有经过审核就实施
❌ 可能导致返工和架构混乱
```

✅ **正确做法**：
```
用户："添加一个新功能"
AI助手：
1. 创建 docs/design/feature-name.md
2. 填写详细设计文档（使用 .template.md）
3. 提交审核
4. 等待审核通过
5. 按照设计文档实施
```

**检查清单**：
- [ ] 是否创建了详细设计文档？
- [ ] 设计文档是否已提交审核？
- [ ] 是否收到审核通过的确认？
- [ ] 审核通过后才开始编码？

---

**陷阱1：违反DDD架构原则**

详细的正确做法请参阅 `docs/development/coding_standards.md` 的"架构规则"章节。

**检查清单**：
- [ ] 服务访问？→ 使用 `ServiceManager`
- [ ] 跨服务通信？→ 使用 `EventBus`
- [ ] 数据访问？→ 使用 `Repository`
- [ ] 存储操作？→ 使用 `StorageAdapter` 和 `Repository`

---

**陷阱2：重复造轮子**

✅ **正确做法**：
```javascript
// ✅ 使用现有的batchUtils
await batchUtils.batchProcess(
  tasks,
  (task) => processTask(task),
  { batchSize: 50, delay: 10, showProgress: true }
);

// ✅ 使用现有的EventBus
this.eventBus.publish('task:completed', { taskId, userId });
```

**检查清单**：
- [ ] 批量处理？→ 使用 `batchUtils`
- [ ] 跨服务通信？→ 使用 `EventBus`
- [ ] 日志记录？→ 使用 `logger`
- [ ] 数据访问？→ 使用 `StorageAdapter` 和 `Repository`
- [ ] 服务访问？→ 使用 `ServiceManager`

---

**陷阱3：忽略项目定位**

❌ **错误示例**：
```
用户："添加用户账号功能，支持云同步和社交分享"
AI助手："建议接入微信云开发 + 用户系统 + 数据库..."

问题：
❌ 过度设计（项目当前不需要云开发）
❌ 引入外部依赖（与本地存储架构冲突）
❌ 偏离微信小程序原生开发定位

正确做法：
✅ 先确认这是否符合项目定位
✅ 如果需要，说明这是重大架构变更
✅ 考虑简化方案（如使用微信原生分享）
```

---

**陷阱4：不阅读现有代码**

**建议**：
1. ❌ 不要直接开始写代码
2. ✅ 先用 Grep 搜索相关功能
3. ✅ 阅读现有实现
4. ✅ 理解设计意图
5. ✅ 然后基于现有代码改进

---

**陷阱5：文档内容重复**

遵循 `docs/development/workflow.md` 的"文档维护"章节中的判断标准，避免相同详细程度的内容出现在多处。

---

**陷阱6：不遵循UI规范**

详细的UI规范请参阅 `docs/development/coding_standards.md` 的"UI规范"章节。

**检查清单**：
- [ ] 卡片内边距：30rpx
- [ ] 卡片圆角：16rpx
- [ ] 按钮高度：90rpx
- [ ] 按钮圆角：8rpx
- [ ] 任务类型颜色使用正确（学习#4285F4、习惯#4CAF50、兴趣#FF9800）
- [ ] 字体大小符合规范（标题32rpx/500-600、正文28rpx/400、辅助24rpx/400）
- [ ] 间距符合规范（12rpx小间距、24rpx标准间距）

---

**陷阱7：不添加logger日志**

详细的日志规范请参阅 `docs/development/coding_standards.md` 的"日志规范"章节。

**必须记录日志的关键点**：
- [ ] 任务状态变更
- [ ] 积分计算和分配
- [ ] 重要数据操作
- [ ] 异步操作开始和结束
- [ ] 错误和异常情况
- [ ] 业务规则执行

---

**陷阱8：频繁调用setData导致性能问题**

✅ **正确做法**：
```javascript
// ✅ 合并setData调用
this.setData({
  tasks: updatedTasks,
  loading: false,
  message: '完成'
});
```

---

**陷阱9：不进行错误处理**

✅ **正确做法**：
```javascript
// ✅ 完整的错误处理
async loadData() {
  try {
    const data = await this.service.getData();
    this.setData({ data, loading: false });
  } catch (error) {
    logger.error('Page', '加载数据失败', error);
    this.setData({
      loading: false,
      error: '加载数据失败，请重试'
    });
  }
}
```

---

**陷阱10：代码和文档不同步**

✅ **正确做法**：
```bash
git add services/task-service.js docs/api/services-guide.md docs/development/CHANGELOG.md
git commit -m "feat: 添加任务完成功能

- 新增 completeTask 接口
- 更新服务API文档
- 更新更新日志"
```

---

## 相关文档

- **[架构文档](docs/architecture/architecture.md)** - 详细架构决策和技术选型理由和DDD分层架构详解
- **[编码规范](docs/development/coding_standards.md)** - 编码规范权威来源（命名、代码风格、UI规范、日志规范等）
- **[开发流程](docs/development/workflow.md)** - 开发流程和文档维护规范
- **[GitHub协作](docs/development/GITHUB_WORKFLOW.md)** - 团队协作和PR流程
- **[更新日志](docs/development/CHANGELOG.md)** - 开发进度
- **[设计文档指南](docs/design/README.md)** - 如何创建和使用设计文档

---

**版本**：v2.0
**最后更新**：2026-02-27
**维护者**：项目维护团队
