# 测试核心逻辑和主干流程 详细设计文档

> **设计状态**：🔴 待审核
> **创建日期**：2026-03-03
> **修订日期**：2026-03-03
> **设计者**：Claude Code 团队
> **审核者**：[待定]
> **预计工期**：4-6周

---

## 📋 目录

- [需求分析](#需求分析)
- [技术方案](#技术方案)
- [代码结构](#代码结构)
- [实施步骤](#实施步骤)
- [测试方案](#测试方案)
- [风险评估](#风险评估)

---

## 需求分析

### 功能描述

通过补充核心业务逻辑和主干流程的测试用例，提升测试覆盖率，确保关键路径有测试保护。重点关注：
- 星星系统核心业务逻辑（FIFO消费策略、过期处理、奖励保护）
- 任务系统关键业务规则
- 主Repository的CRUD和关键查询
- 主Service的业务流程
- 关键工具函数

### 业务价值

- [ ] **用户价值**：间接提升系统稳定性，降低bug风险
- [ ] **技术价值**：提高代码重构和功能迭代的信心
- [ ] **业务价值**：为业务功能扩展提供保障

### 功能范围

**包含**：
- ✅ 测试核心Model业务逻辑（Star、StarGroup、Reward的FIFO策略、过期检测等）
- ✅ 测试主Repository查询（CRUD、按日期查询、按用户查询、批量操作）
- ✅ 测试核心Service主干流程（任务完成流程、星星消费、奖励兑换）
- ✅ 测试关键工具函数（dateUtils、formatUtils、batchUtils、eventBus）

**不包含**（明确的边界）：
- ❌ UI层和组件测试（页面交互、表单提交、页面跳转）
- ❌ UI渲染、样式正确性、动画效果
- ❌ 微信API调用、端到端流程
- ❌ 边界场景和异常处理（除非是核心逻辑）
- ❌ 辅助工具函数（log-analyzer、permission-utils 等）

### 优先级

- **优先级**：🟢 中长期
- **理由**：测试覆盖率30%偏低，但不追求百分比，而是确保核心逻辑有保护

---

## 技术方案

### 方案概述

基于当前测试覆盖率分析，优先补充关键业务逻辑的测试。不追求整体覆盖率百分比达标，而是确保：
1. 核心业务规则有测试覆盖
2. 主干流程有端到端测试
3. 关键工具函数有测试保护

### 当前测试覆盖率分析

**总体覆盖率**：30.59%

| 层级 | 覆盖率 | 状态 | 说明 |
|------|--------|------|------|
| **Models** | 30.19% | ⚠️ 中等偏低 | Task模型85.36%很高，其他模型极低 |
| **Repositories** | 7.45% | 🔴 严重偏低 | 需要补充测试 |
| **Services** | 45.29% | ⚠️ 中等偏低 | RewardService 79%很高，StarService 23%偏低 |
| **Utils** | 30.29% | ⚠️ 中等偏低 | dateUtils/formatUtils较高，其他工具较低 |

**重点关注的模块**：

1. **Models（覆盖率极低）**：
   - star.js: 2.81% - 核心模型，需要重点补充
   - star-group.js: 0.81% - FIFO消费策略核心，必须补充
   - star-record.js: 4.28% - 需要补充
   - reward.js: 54.41% - 中等，可优化
   - message.js: 23.13% - 需要补充

2. **Repositories（覆盖率极低）**：
   - 所有Repository都低于15%，需要全面补充
   - star-repository.js: 2.64% - 核心仓储
   - task-repository.js: 2.96% - 核心仓储

3. **Services（覆盖率中等）**：
   - star-service.js: 23.61% - 核心服务，需要补充
   - task-service.js: 54.53% - 中等，可优化
   - message-service.js: 58.31% - 中等，可优化

**现有测试文件**：
```
test/
├── models/
│   └── task.test.js (覆盖Task模型，85.36%)
├── services/
│   ├── star-service.test.js
│   ├── task-service.test.js
│   ├── reward-service.test.js
│   └── message-service.test.js
├── utils/
│   ├── date-utils.test.js (62.23%)
│   └── format-utils.test.js (90.47%)
```

### 技术选型

| 技术点 | 选择方案 | 替代方案 | 选择理由 |
|--------|---------|-----------|---------|
| 测试框架 | Jest（现有） | Mocha、AVA | 项目已配置Jest，继续使用 |
| Mock 策略 | Jest mock + 自定义Mock类 | Istanbul、Nock | 简单直接，无需额外依赖 |
| 测试类型 | 单元测试为主 | E2E测试 | 单元测试更灵活，聚焦核心逻辑 |

### 测试覆盖策略

**不追求覆盖率百分比**：
- ❌ 不以70%为硬性目标
- ✅ 聚焦核心业务逻辑和主干流程
- ✅ 确保关键路径有测试保护

**测试优先级**：
```
P0 - 核心业务逻辑（必须）：
  - StarGroup FIFO消费策略
  - Star 过期处理
  - Reward 奖励保护
  - Task 任务状态转换

P1 - 主Repository查询（重要）：
  - 基础CRUD操作
  - 关键查询方法（按日期、按用户、按状态）
  - 批量操作

P1 - 核心Service流程（重要）：
  - 任务完成流程
  - 星星消费流程
  - 奖励兑换流程

P2 - 关键工具函数（可选）：
  - dateUtils 关键方法
  - batchUtils 批量处理
  - eventBus 事件机制
```

---

## 代码结构

### 文件变更清单

**新增文件**：
- `test/models/star-group.test.js` - StarGroup FIFO消费策略测试
- `test/models/star.test.js` - Star模型业务逻辑测试
- `test/models/reward.test.js` - Reward模型业务逻辑测试
- `test/models/message.test.js` - Message模型业务逻辑测试
- `test/models/star-record.test.js` - StarRecord模型测试
- `test/repositories/star-repository.test.js` - 星星仓储测试
- `test/repositories/task-repository.test.js` - 任务仓储测试
- `test/repositories/base-repository.test.js` - 基础仓储测试
- `test/utils/event-bus.test.js` - EventBus测试

**修改文件**：
- `test/models/task.test.js` - 补充缺失的测试用例
- `test/services/star-service.test.js` - 补充核心业务流程测试
- `test/services/task-service.test.js` - 补充任务流程测试

### 核心测试场景

#### StarGroup FIFO消费策略测试

```javascript
describe('StarGroup FIFO消费策略', () => {
  it('应该按过期时间排序分组', () => {
    // 验证：即将过期的分组排在前面
  });

  it('应该从最旧的分组开始消费', () => {
    // 验证：先消费最早过期的星星
  });

  it('应该正确处理余额不足的情况', () => {
    // 验证：星星不足时返回实际可扣减数量
  });

  it('应该在消费后正确更新星星数量', () => {
    // 验证：消费后的星星数量正确
  });
});
```

#### Star过期处理测试

```javascript
describe('Star 过期处理', () => {
  it('应该正确识别过期的星星', () => {
    // 验证：isExpired() 方法正确
  });

  it('应该正确计算剩余有效天数', () => {
    // 验证：getRemainingDays() 方法正确
  });

  it('应该正确处理永久星星（不过期）', () => {
    // 验证：永久星星不过期
  });
});
```

#### Reward奖励保护测试

```javascript
describe('Reward 奖励保护', () => {
  it('应该正确识别可保护的奖励', () => {
    // 验证：即将过期的星星与奖励的匹配逻辑
  });

  it('应该正确分配星星到多个奖励', () => {
    // 验证：优先保护高价值奖励
  });

  it('应该正确处理部分保护的情况', () => {
    // 验证：星星不足时的部分保护逻辑
  });
});
```

### Mock 策略

**StorageAdapter Mock**（已存在，test/__mocks__/storage-adapter-mock.js）：
```javascript
// 用于测试仓储层
class MockStorageAdapter {
  constructor() {
    this.data = {};
  }

  async set(key, value) {
    this.data[key] = value;
    return true;
  }

  async get(key) {
    return this.data[key] || null;
  }

  clear() {
    this.data = {};
  }
}
```

**Repository Mock 模式**：
```javascript
// 在测试文件中 Mock 仓储
const mockStarRepository = {
  getAll: jest.fn().mockResolvedValue([]),
  getById: jest.fn().mockResolvedValue(null),
  save: jest.fn().mockImplementation(async (item) => item),
  delete: jest.fn().mockResolvedValue(true),
  getStarGroupsByUserId: jest.fn().mockResolvedValue([]),
  consumeStarsByExpiryOrder: jest.fn().mockResolvedValue({
    success: true,
    consumed: 10,
    groupsUpdated: []
  })
};
```

---

## 实施步骤

### 第1步：测试核心Model业务逻辑（预计1.5周）

- [ ] **任务**：创建 StarGroup 测试文件，测试FIFO消费策略
- [ ] **任务**：创建 Star 测试文件，测试过期处理
- [ ] **任务**：创建 Reward 测试文件，测试奖励保护
- [ ] **任务**：创建 Message 测试文件，测试消息类型和优先级
- [ ] **任务**：创建 StarRecord 测试文件，测试记录类型
- [ ] **验证**：运行所有Model测试，确保通过
- [ ] **依赖**：无

**验收标准**：
- [ ] StarGroup FIFO策略测试完整（排序、消费、余额处理）
- [ ] Star过期处理测试完整（isExpired、getRemainingDays）
- [ ] Reward保护逻辑测试完整（识别、分配、部分保护）
- [ ] Message测试基本完整（类型、优先级）

---

### 第2步：测试主Repository查询（预计1周）

- [ ] **任务**：创建 StarRepository 测试文件
- [ ] **任务**：创建 TaskRepository 测试文件
- [ ] **任务**：创建 BaseRepository 测试文件
- [ ] **验证**：运行所有Repository测试，确保通过
- [ ] **依赖**：第1步完成后

**验收标准**：
- [ ] 基础CRUD操作有测试覆盖（save、getById、delete等）
- [ ] 关键查询方法有测试覆盖（getStarGroupsByUserId、getTasksByDate等）
- [ ] 批量操作有测试覆盖（saveAll、deleteMany）

---

### 第3步：测试核心Service主干流程（预计1.5周）

- [ ] **任务**：补充 StarService 测试用例（FIFO消费、过期处理、奖励保护）
- [ ] **任务**：补充 TaskService 测试用例（任务完成流程、必做任务惩罚）
- [ ] **任务**：补充 RewardService 测试用例（奖励兑换流程）
- [ ] **验证**：运行所有Service测试，确保通过
- [ ] **依赖**：第2步完成后

**验收标准**：
- [ ] 任务完成流程端到端测试完整
- [ ] 星星消费流程端到端测试完整
- [ ] 奖励兑换流程端到端测试完整
- [ ] 必做任务惩罚流程测试完整

---

### 第4步：测试关键工具函数（预计0.5周）

- [ ] **任务**：创建 EventBus 测试文件（发布、订阅、取消订阅）
- [ ] **任务**：补充 batchUtils 测试用例（批量处理、进度回调）
- [ ] **任务**：补充 dateUtils 关键方法测试（日期计算、格式化）
- [ ] **验证**：运行所有工具函数测试，确保通过
- [ ] **依赖**：第3步完成后

**验收标准**：
- [ ] EventBus 发布订阅机制测试完整
- [ ] batchUtils 批量处理逻辑测试完整
- [ ] dateUtils 日期计算方法测试完整

---

### 第5步：更新文档和验证（预计0.5周）

- [ ] **任务**：更新 API 文档（如有API变更）
- [ ] **任务**：更新 CHANGELOG.md，记录测试覆盖提升
- [ ] **任务**：更新设计文档状态为"已完成"
- [ ] **验证**：运行完整测试套件，生成覆盖率报告
- [ ] **依赖**：第4步完成后

**验收标准**：
- [ ] API 文档与代码一致
- [ ] CHANGELOG 记录完整
- [ ] 设计文档更新为已完成
- [ ] 所有测试通过
- [ ] 生成覆盖率报告

---

## 测试方案

### 测试类型

**单元测试**（主要）：
- Model 业务逻辑测试
- Repository 数据访问测试
- Service 业务流程测试
- Utils 工具函数测试

**不包含**：
- ❌ UI层测试（页面、组件）
- ❌ 端到端测试（E2E）
- ❌ 集成测试（复杂环境依赖）

### 测试覆盖率目标

**不追求百分比**：不设定硬性覆盖率目标

**聚焦目标**：
- ✅ 核心业务逻辑有测试覆盖
- ✅ 主干流程有端到端测试
- ✅ 关键工具函数有测试保护
- ✅ 测试不降低现有覆盖率

### 测试执行命令

```bash
# 运行所有测试
npm test

# 运行特定模块测试
npm run test:models
npm run test:services
npm run test:repositories
npm run test:utils

# 生成覆盖率报告
npm run test:coverage

# 监听模式（开发时使用）
npm run test:watch
```

---

## 风险评估

### 技术风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| 破坏现有功能 | 中 | 低 | 每次补充测试后运行完整测试套件 |
| 测试编写耗时 | 中 | 中 | 优先测试关键逻辑，次要逻辑可暂缓 |
| Mock 不完整 | 中 | 中 | Mock 关键依赖，简单Mock其他 |
| 测试覆盖不足 | 低 | 低 | 聚焦核心逻辑，不追求百分比 |

### 业务风险

| 风险项 | 影响 | 概率 | 应对措施 |
|--------|------|------|---------|
| 遗漏关键场景 | 中 | 低 | 与业务负责人确认测试用例范围 |
| 测试维护成本增加 | 低 | 低 | 测试代码保持简洁，注释清晰 |

---

## 附录

### 参考资料

- [架构文档](../architecture/architecture.md)
- [编码规范](../development/coding_standards.md)
- [开发流程](../development/workflow.md)
- [项目路线图](../development/ROADMAP.md)
- [Jest文档](https://jestjs.io/docs/getting-started)

### 相关 Issue/PR

- Issue #XXX：里程碑-04 测试核心逻辑和主干流程
- PR #XXX：里程碑-04实施

### 版本历史

- **v1.0** (2026-03-03): 初始版本，基于当前测试覆盖率分析创建

---

**最后更新**：2026-03-03
