# 里程碑-21A：正确性与质量闸门修复 详细设计文档

> **设计状态**：🟢 已完成
> **创建日期**：2026-04-07
> **设计者**：GPT5 Codex
> **审核者**：项目维护者
> **预计工期**：1-2天
> **完成日期**：2026-04-07

---

## 📋 目录

- [实施结果](#实施结果)
- [需求分析](#需求分析)
- [技术方案](#技术方案)
- [代码结构](#代码结构)
- [实施步骤](#实施步骤)
- [测试方案](#测试方案)
- [风险评估](#风险评估)
- [替代方案](#替代方案)

---

## 实施结果

### 实际完成情况

- 已完成奖励域“示例奖励”单一 owner 收口：`RewardService.isExampleReward()` 成为正式公开入口，首页与奖励页页面层统一改为委托，不再保留自有正则判断。
- 已删除 `RewardService` 中无效的一致性校验分支，避免继续保留“看似存在、实际无效”的假保护。
- 已修复 `StarRecord.clone()` 的稳定性与浅拷贝问题：生成新记录时保证时间戳单调递增，并对嵌套 `data` 做独立拷贝。
- 已将 `MessageRepository.batchDeleteMessages()` 改为显式 `for...of` 顺序批处理，等待语义清晰。
- 已补齐本期相关页面、服务、模型与仓储测试，恢复正式质量闸门。

### 实际验证结果

- `npm test -- --runInBand`：通过，`78 suites / 1735 tests` 全绿
- `npm run test:quality -- --runInBand`：通过，`78 suites / 1735 tests` 全绿
- 本期新增/补强验证覆盖：
  - `test/services/reward-service.test.js`
  - `test/models/star-record.test.js`
  - `test/repositories/message-repository.test.js`
  - `test/pages/index.reward-flow.test.js`
  - `test/pages/rewards.behavior.test.js`
  - `test/pages/rewards.page-contract.test.js`
  - `test/pages/index.page-shell.behavior.test.js`
  - `test/pages/index.user-context.test.js`
  - `test/pages/index.modules.test.js`
  - `test/pages/index.task-actions.test.js`
  - `test/services/task-service.helpers.test.js`

### 本期明确未处理项

- `RewardService` 静态初始化状态问题未纳入本期，仍留给后续治理里程碑处理。
- 本期未扩展为文档治理或服务层基础设施去重，仍按 `M21C / M21D` 边界推进。

---

## 需求分析

### 功能描述

`M20` 完成后，项目主测试树已经恢复稳定，但“正确性”和“正式质量闸门”仍存在几处不应继续带入新迭代的红灯：

1. 奖励域的“示例奖励”判定已经出现多 owner 和规则分叉，且服务层 fallback 规则会把正常自定义奖励误判为示例奖励，影响首页奖励提示、奖励页空态和“只有示例奖励”判断。
   当前至少存在三处实现：`services/reward-service.js`、`pages/index/modules/index-reward-flow.js`、`pages/rewards/rewards.js`。其中 `pages/rewards/rewards.js` 的页面内置规则还缺少空值保护，`reward` 为 `null/undefined` 时会直接访问 `reward.isExample` 并抛异常。
2. `RewardService` 中存在一段看似有效、实际不会执行的一致性校验分支，容易给维护者造成错误安全感。
3. `npm run test:quality` 当前不通过，既包含 `StarRecord.clone()` 的时间戳脆弱断言，也包含若干核心页面/服务模块的 branch coverage 红灯。
4. 少量低风险实现问题仍然残留，例如 `batchDeleteMessages()` 的异步批处理写法可读性差、维护成本高。

`M21A` 的目标不是继续结构重构，也不是新增用户功能，而是先把这批“会影响当前正确性判断、回归判断和下一步迭代基线”的问题收掉，恢复一个可以安全承接后续 `M21B` 用户功能开发的稳定基线。

### 当前现状结论

| 类别 | 当前现状 | M21A 判断 |
|------|---------|-----------|
| 奖励示例判定 | 页面层、服务层各自维护规则，且服务层规则过宽；奖励页页面内规则还缺少 `null` 防护 | 本期必须统一 owner，并修正错误 fallback |
| 奖励一致性校验 | `RewardService` 读取不存在的 `this.serviceManager` | 本期必须收口，不能继续保留“假保护” |
| 正式质量闸门 | `npm test` 通过，但 `npm run test:quality` 失败 | 本期必须恢复双绿 |
| 低风险实现缺陷 | 个别实现虽然未必已触发 bug，但写法脆弱 | 在不扩范围的前提下顺手收口 |

### 业务价值

- [x] 用户价值：避免“正式奖励被误判为示例奖励”导致首页/奖励页提示不正确。
- [x] 技术价值：恢复 `npm run test:quality` 正式闸门，重新建立可交付基线。
- [x] 维护价值：移除无效保护分支和脆弱实现，为后续 `M21B` 用户功能开发降低返工风险。

### 功能范围

**包含**：
- ✅ 统一奖励域“示例奖励”判定 owner，并修正服务层过宽 fallback 规则
- ✅ 收口 `RewardService` 中无效的一致性校验分支
- ✅ 修复 `StarRecord.clone()` 时间戳相关的脆弱测试/实现问题
- ✅ 通过补测试或最小实现调整，让 `npm run test:quality` 恢复为正式绿灯
- ✅ 顺手收口 1-2 个已确认低风险、低耦合的实现问题（如消息批量删除的异步批处理写法）

**不包含**：
- ❌ 不实现 `M21B` 的任务快速续建/复制功能
- ❌ 不启动 `M21C` 的文档同步与治理口径收口
- ❌ 不启动 `M21D` 的服务层基础设施去重
- ❌ 不启动 `M21E` 的大文件继续拆分
- ❌ 不修改架构文档、服务指南或协作文档，除本设计文档和后续里程碑状态文档外不扩散改文档
- ❌ 不通过“降低阈值”来直接放行 `test:quality`，除非审查后证明当前阈值本身与正式风险范围明显不符

### 优先级

- **优先级**：P1
- **理由**：它不是新功能，但直接影响正确性判断和交付质量闸门；若不先完成，会继续阻塞后续里程碑和新功能开发。

---

## 技术方案

### 方案概述

`M21A` 采用“先修真实语义错误，再恢复正式闸门，最后顺手清低风险实现问题”的保守方案。

本期不引入新的抽象层，也不趁机做大规模清理。原则是：

1. 先确保奖励域对“示例奖励”的判断只存在一个正式 owner。
2. 先去掉无效保护分支和脆弱断言，避免继续误导测试与维护。
3. `test:quality` 的恢复优先通过补齐关键测试和最小代码修正完成，而不是先改阈值。
4. 仅处理与本期改动直接相关、低耦合的实现瑕疵，不借题发挥扩成 `M21D`。

### 技术选型

| 技术点 | 选择方案 | 不采用方案 | 选择理由 |
|--------|---------|-----------|---------|
| 示例奖励判定 | 收口到 `RewardService` 单一正式 helper，页面层只委托 | 页面/服务继续各自判断 | 避免规则再次分叉 |
| 一致性校验处理 | 删除无效分支或改为显式依赖注入后再调用 | 保留“看起来存在”的假保护 | 无效保护会误导维护者 |
| 质量闸门恢复 | 补测试 + 最小实现修正 | 直接降低 coverage threshold | 本期目标是恢复正式闸门可信度 |
| 低风险实现问题 | 只修与本期路径直接相关的脆弱写法 | 扩展为全仓实现清理 | 控制范围，避免侵入后续里程碑 |

### DDD分层设计

**领域层（models/）**：
- [x] 修改模型：`models/star-record.js`
- [ ] 不新增模型
- 说明：收口 `clone()` 的可测性与正确性问题，除时间戳稳定性外，同步评估浅拷贝是否会带来嵌套对象共享风险，不改变领域语义。

**服务层（services/）**：
- [x] 修改服务：`services/reward-service.js`
- [ ] 不新增服务
- 说明：奖励域是本期主战场，统一示例奖励判定 owner 并收口无效保护分支。

**仓储层（repositories/）**：
- [x] 视情况修改：`repositories/message-repository.js`
- [ ] 不新增仓储
- 说明：仅在 `batchDeleteMessages()` 作为本期顺手收口项时做最小调整。

**适配器层（adapters/）**：
- [ ] 不新增适配器
- [ ] 不修改适配器
- 说明：本期不处理存储访问层面的问题，那属于 `M21D`/后续治理范围。

**表现层（pages/、components/）**：
- [x] 修改页面：`pages/rewards/rewards.js`
- [x] 修改页面模块：`pages/index/modules/index-reward-flow.js`
- [ ] 视情况修改：`pages/rewards/modules/rewards-sync.js`
- 说明：页面层只负责切换到正式 owner，不再保留第二套示例判定逻辑。

### 数据模型

```typescript
interface ExampleRewardJudgement {
  isExample: boolean;
  reason: 'explicit-flag' | 'legacy-default-id' | 'non-example';
}
```

说明：
- 该接口只是帮助描述本期“单一 owner 判定”的设计目标，不要求在 JS 代码中显式实现 TypeScript 类型。

### 接口设计

本期允许新增一个**正式公开的服务方法**，用于收口奖励域的示例奖励判定。

允许的接口变化仅限：

1. `RewardService` 新增或收口一个正式公开的 `isExampleReward(reward)` 方法，作为页面层唯一允许委托的正式 owner。
2. 删除或改写 `RewardService` 中无效的一致性校验分支，但不改变页面层的公开调用方式。

新增约束：

- 页面层不得继续维护独立的示例奖励正则规则。
- 服务层对示例奖励的 fallback 规则只能兼容历史默认示例 ID，不能覆盖正常自定义奖励 ID 形态。
- 页面层对示例奖励的判断只允许委托 `RewardService.isExampleReward()`，不允许继续直接访问内部私有 helper。
- `test:quality` 的恢复不得以放宽质量闸门为默认方案。

---

## 代码结构

### 文件变更清单

**新增文件**：
- `docs/design/milestone-21a-correctness-quality-gate-fixes.md` - `M21A` 设计文档

**重点修改文件**：
- `services/reward-service.js` - 统一示例奖励判定 owner，收口无效一致性校验分支
- `pages/index/modules/index-reward-flow.js` - 改为委托正式示例奖励判定 owner
- `pages/rewards/rewards.js` - 改为委托正式示例奖励判定 owner，删除页面内第二套规则
- `models/star-record.js` - 收口 `clone()` 的时间戳稳定性与浅拷贝正确性评估
- `repositories/message-repository.js` - 视情况将批量删除改为更稳妥的异步实现

**重点新增/修改测试**：
- `test/services/reward-service.test.js` - 补“正常默认奖励 ID 不应被识别为示例奖励”等用例
- `test/pages/index.reward-flow.test.js` - 补首页奖励提示相关分支
- `test/pages/rewards.behavior.test.js` / `test/pages/rewards.page-contract.test.js` - 补奖励页示例判定委托与空态相关分支
- `test/models/star-record.test.js` - 修正/增强 `clone()` 稳定性断言
- `test/pages/index.modules.test.js` / 相关页面测试 - 按 `test:quality` 红灯结果补充 branch coverage

### 核心代码结构

```javascript
// reward-service.js
class RewardService {
  isExampleReward(reward) {
    // 1. 显式 isExample 标记优先
    // 2. 仅兼容历史默认示例 ID
    // 3. 其余一律视为正式奖励
  }
}

// pages/index/modules/index-reward-flow.js
function isExampleReward(reward) {
  return serviceManager.getRewardService().isExampleReward(reward);
}

// models/star-record.js
clone(overrides = {}, generateNewId = true) {
  // 生成新 ID 时同时确保新 timestamp 稳定且可预测
}
```

### 关键函数

**函数1**：`RewardService.isExampleReward(reward)`
- **输入**：奖励对象
- **输出**：`boolean`
- **职责**：作为奖励域唯一正式的“示例奖励”判定 owner
- **依赖**：无额外跨服务依赖

**函数2**：`StarRecord.clone(overrides, generateNewId)`
- **输入**：覆盖字段、是否生成新 ID
- **输出**：新的 `StarRecord`
- **职责**：确保克隆结果稳定可测，不再依赖同毫秒时间戳偶然性
- **依赖**：`StarRecord` 自身模型构造

**函数3**：`MessageRepository.batchDeleteMessages(messages)`
- **输入**：消息数组
- **输出**：删除数量
- **职责**：按批删除消息，保证实现简单且等待语义清晰
- **依赖**：`deleteMany()`、`batchUtils.chunk()`

---

## 实施步骤

### 第1步：奖励示例判定收口（预计4小时）

- [x] **任务**：统一 `RewardService` 为示例奖励唯一正式 owner，并移除页面层第二套判断规则
- [x] **验证**：页面层仅委托，不再内置正则；补齐“默认生成 ID 不应误判”为测试
- [ ] **依赖**：无

**实施要点**：
1. 先梳理历史默认示例奖励的真实 ID 形态和当前页面/服务规则差异。
2. `RewardService` 中的 fallback 只能兼容历史默认示例，不得覆盖正常自定义奖励 ID。
3. 首页、奖励页和相关模块统一委托 `RewardService.isExampleReward()`，不保留第三套规则。
4. `pages/index/modules/index-reward-flow.js` 中对私有 `_isExampleReward()` 的直接调用也必须一并替换为正式公开方法，不能只删除顶部本地正则 helper。
5. 奖励页页面内缺少 `null` 防护的问题要随着委托收口一并消失，不能保留原页面实现。

---

### 第2步：无效保护分支与脆弱实现修复（预计3小时）

- [x] **任务**：收口 `RewardService` 无效一致性校验分支，并修正 `StarRecord.clone()` 稳定性问题
- [x] **验证**：去掉假保护后不影响现有主链路；`StarRecord` 相关测试稳定通过
- [ ] **依赖**：第1步完成后继续

**实施要点**：
1. 若一致性校验无法在本期接通真实依赖，则直接删除或显式降级，不保留“永远不会执行”的死分支。
2. `StarRecord.clone()` 要么稳定生成更晚时间戳，要么调整测试断言，避免同毫秒偶发红灯。
3. 同步评估 `clone()` 中 `{ ...this }` 的浅拷贝风险；若 `data` 等嵌套对象在 clone 后存在可变共享风险，则补充深拷贝，否则在完成说明中明确本期保持浅拷贝的理由。
4. 不改变奖励兑换、星星记录等业务主语义。

---

### 第3步：恢复正式质量闸门（预计4小时）

- [x] **任务**：补齐 `test:quality` 当前红灯文件的 branch coverage，使正式闸门恢复为绿
- [x] **验证**：`npm run test:quality -- --runInBand` 全绿
- [ ] **依赖**：前两步完成

**实施要点**：
1. 以当前 `test:quality` 的真实红灯文件为准，至少覆盖：`services/task-service.js`、`pages/index/modules/index-user-context.js`、`pages/index/modules/index-task-actions.js`、`pages/index/modules/index-search-panel.js`、`pages/index/modules/index-user-switcher.js`、`pages/index/modules/index-message-preview.js`。
2. 明确 `services/reward-service.js` 当前不在 `jest.quality.config.js` 的 coverage 收集范围内，因此本步恢复正式闸门的重点是页面模块与 `task-service` 红灯分支；`reward-service` 的语义修正仍通过服务测试保证正确性。
3. 优先补这些红灯文件对应的 branch coverage，不默认调整阈值。
4. 若个别分支属于历史兼容壳且已确认无正式风险，可在完成说明中单独说明，但不作为默认处理路径。
5. `npm test` 与 `npm run test:quality` 都要保留为正式验证项。

---

### 第4步：顺手收口低风险实现问题（预计2小时）

- [x] **任务**：在不扩范围前提下，收口 1-2 个与本期直接相关的低风险实现瑕疵
- [x] **验证**：实现更直接、测试无回归
- [ ] **依赖**：前3步完成后执行

**实施要点**：
1. 优先考虑 `batchDeleteMessages()` 这类局部、低耦合、无语义变更的实现问题；默认改为 `for...of` 顺序执行，保持等待语义清晰且不引入新的并发行为。
2. 不扩展到 `EventBus`、大文件拆分、文档同步等后续里程碑范围。
3. 任何“顺手修”都必须满足低耦合、低回归风险、能在本期测试覆盖内闭环。

---

## 测试方案

### 单元测试

| 测试项 | 测试方法 | 预期结果 |
|--------|---------|---------|
| 示例奖励判定统一 | `test/services/reward-service.test.js` | 显式示例奖励、历史默认示例 ID、正常默认奖励 ID 都能得到正确判定 |
| 首页奖励提示分支 | `test/pages/index.reward-flow.test.js` / `test/pages/index.modules.test.js` | 首页在“只有示例奖励 / 有正式奖励”场景下提示正确 |
| 奖励页空态与委托 | `test/pages/rewards.behavior.test.js` / `test/pages/rewards.page-contract.test.js` | 奖励页不再依赖页面内正则，空态判断保持正确 |
| StarRecord clone 稳定性 | `test/models/star-record.test.js` | clone 时间戳相关测试稳定通过 |
| task-service 质量闸门分支 | `test/services/task-service.test.js` | 当前 branch coverage 红灯分支被覆盖，正式闸门恢复 |
| 消息批量删除实现 | `test/repositories/message-repository.test.js` | 批量删除等待语义和返回值保持正确 |

### 集成测试

- [x] `npm test -- --runInBand` 全绿
- [x] `npm run test:quality -- --runInBand` 全绿
- [x] 奖励兑换、首页奖励提示、奖励页空态相关测试不回归

### 手动测试

参考 `docs/development/testing-strategy.md` 的手工回归原则：

1. **首页奖励提示**：
   - [ ] 只有示例奖励时，首页仍显示“去设置正式奖励”类提示
   - [ ] 存在正式奖励时，首页不再误判为“只有示例奖励”

2. **奖励页空态**：
   - [ ] 只有示例奖励时，奖励页显式空态与引导文案正确
   - [ ] 新建正式奖励后，奖励页不再继续显示“只有示例奖励”空态

3. **回归检查**：
   - [ ] 奖励兑换主路径不回归
   - [ ] 首页奖励区域与消息区域无异常联动副作用

### 最小验证集

- `test/services/reward-service.test.js`
- `test/pages/index.reward-flow.test.js`
- `test/pages/index.modules.test.js`
- `test/pages/rewards.behavior.test.js`
- `test/pages/rewards.page-contract.test.js`
- `test/models/star-record.test.js`
- `test/services/task-service.test.js`
- `test/repositories/message-repository.test.js`
- `npm test -- --runInBand`
- `npm run test:quality -- --runInBand`

---

## 风险评估

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|---------|
| 示例奖励判定调整后影响首页/奖励页历史空态 | 中 | 中 | 先补服务层判定测试，再补页面层分支测试，最后做手工回归 |
| 为恢复 `test:quality` 扩大到过多历史分支 | 中 | 中 | 严格只补当前红灯文件和本期直接相关分支，不扩到全仓 |
| 低风险实现问题顺手扩成大范围清理 | 中 | 中 | 明确“顺手收口”只处理低耦合对象，超出即留给 `M21D` |
| 删除无效保护分支后让维护者误以为能力下降 | 低 | 中 | 在设计文档和完成说明中明确：删除的是假保护，不是正式能力回退 |
| `RewardService` 静态初始化状态问题被误认为本期已一并解决 | 中 | 低 | 在实施和完成说明中明确：静态初始化状态不属于 `M21A` 主范围，留给后续治理里程碑处理 |

---

## 替代方案

### 方案A：当前方案 - 正确性修复 + 质量闸门恢复

**描述**：只处理当前最影响基线的问题，恢复双绿后再进入 `M21B`。

**优点**：
- 范围清晰，1-2 天内可闭环
- 能直接为后续用户功能开发扫清阻塞
- 不会把本期扩大成结构重构

**缺点**：
- 不解决 `reward-service.js` / `star-service.js` 的体量问题
- 不处理文档漂移

**结论**：采用。

### 方案B：把 `M21A` 扩成“正确性 + 文档 + 去重”混合里程碑

**描述**：在同一期内同时处理示例奖励、质量闸门、文档同步和服务基础设施去重。

**不采用原因**：
- 会把“先修正确性基线”的目标稀释掉
- 容易与 `M21B / M21C / M21D / M21E` 的边界打架
- 审核和实施复杂度都会明显升高

### 方案C：直接降低质量闸门阈值，让 `test:quality` 先恢复绿色

**描述**：不补测试，直接修改覆盖率阈值。

**不采用原因**：
- 会削弱 `M13` 以来的正式质量闸门可信度
- 当前红灯文件仍属于正式高风险范围，不适合直接降线
- 不能解决 `StarRecord.clone()` 测试脆弱性和奖励域真实语义问题

---

## 审核检查清单

- [x] 是否明确只处理正确性与正式质量闸门问题，不扩到后续里程碑
- [x] 是否明确 `M21A` 不包含任务复制功能
- [x] 是否明确示例奖励判定必须统一 owner
- [x] 是否明确 `npm test` 与 `npm run test:quality` 都要恢复为正式绿灯
- [x] 是否明确不以降低阈值作为默认放行方案
