# 测试核心逻辑和主干流程 详细设计文档

> **设计状态**：🔴 待审核
> **创建日期**：2026-03-03
> **初次修订日期**：2026-03-03
> **设计者**：Claude Code 团队
> **审核者**：项目维护团队
> **修订工期**：10-12周
> **上版工期**：4-6周（已修订）

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

**不包含（明确列表）**：

#### UI层和组件（不测试）：
- ❌ 页面（pages/*.js）和页面逻辑
- ❌ 组件（components/*.js）和组件逻辑
- ❌ 表单提交、验证、页面跳转
- ❌ UI渲染、样式正确性、动画效果

#### 微信API和端到端（不测试）：
- ❌ 微信API调用（wx.request、wx.showToast、wx.navigateTo等）
- ❌ 端到端用户操作流程
- ❌ 跨页面数据传递
- ❌ 用户交互和反馈

#### 边界场景（必须包含）：
- ✅ 参数为null、undefined、空字符串
- ✅ 数值为0、负数、NaN
- ✅ 数组为空、不存在、包含null
- ✅ 日期无效、不存在、格式错误
- ✅ 用户ID不存在、无效格式

**判断标准**：
- ✅ 如果是业务规则的一部分，必须测试（如负数处理）
- ✅ 如果是异常值保护，必须测试（如null检查）
- ⚠️ 如果是极端值（如超大数），可选测试

#### 异常处理（可选包含）：
- ⚠️ 存储异常（模拟Storage失败）
- ⚠️ 网络异常（模拟网络请求失败）
- ⚠️ 并发冲突（模拟同时操作）
- ⚠️ 权限异常（模拟无权限操作）

**判断标准**：
- ❌ 如果是外部依赖的失败，可选测试
- ❌ 如果需要复杂Mock才能测试，暂缓测试
- ✅ 如果是业务异常，必须测试（如余额不足）
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

### Mock 策略（修订版）

#### Mock 分类原则

**1. Repository Mock 分类**：
- **简单CRUD操作**：使用 Jest simple mock
  - save, getById, delete, getAll
  - 返回固定数据，不涉及复杂逻辑

- **复杂业务逻辑**：使用 Fake Object 实现
  - consumeStarsByExpiryOrder（FIFO消费）
  - getTasksByDate（日期过滤）
  - 需要实现真实业务逻辑才能验证

**2. EventBus Mock**：
- 使用专门的 MockEventBus 类
- 提供事件验证方法
- 记录事件发布和订阅历史

#### StorageAdapter Mock（已存在）

```javascript
// test/__mocks__/storage-adapter-mock.js
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

#### Repository Simple Mock 模式

```javascript
// 用于简单CRUD操作
const simpleMock = {
  // 基础CRUD
  getAll: jest.fn().mockResolvedValue([...mockData]),
  getById: jest.fn().mockResolvedValue(mockData[0]),
  save: jest.fn().mockImplementation(async (item) => {
    const saved = { ...item, lastUpdated: Date.now() };
    return saved;
  }),
  delete: jest.fn().mockResolvedValue(true),

  // 查询方法
  findByUserId: jest.fn().mockResolvedValue(
    mockData.filter(item => item.userId === 'user_123')
  ),
  findByDate: jest.fn().mockResolvedValue(
    mockData.filter(item => item.date === '2026-03-03')
  ),

  // 批量操作
  saveAll: jest.fn().mockResolvedValue(mockData),
  deleteMany: jest.fn().mockResolvedValue(3)
};
```

#### Repository Fake Object 模式

```javascript
// 用于复杂业务逻辑（FIFO消费、过期处理等）
class FakeStarRepository {
  constructor() {
    this.groups = [];
  }

  async getStarGroupsByUserId(userId) {
    return this.groups.filter(g => g.userId === userId);
  }

  // ✅ 实现真实的FIFO消费逻辑
  async consumeStarsByExpiryOrder(points, userId) {
    const userGroups = await this.getStarGroupsByUserId(userId);

    // 1. 按过期时间排序（即将过期在前）
    const sortedGroups = [...userGroups].sort((a, b) => {
      // 永久分组最后
      if (a.type === 'permanent') return 1;
      if (b.type === 'permanent') return -1;

      // 无过期日期的分组最后
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;

      // 按过期时间升序
      return a.expiryDate - b.expiryDate;
    });

    // 2. 从第一个分组开始消费
    let remainingPoints = points;
    const updatedGroups = [];

    for (const group of sortedGroups) {
      if (remainingPoints <= 0) break;

      if (group.stars <= remainingPoints) {
        group.stars = 0;
        remainingPoints -= group.stars;
      } else {
        group.stars -= remainingPoints;
        remainingPoints = 0;
      }

      updatedGroups.push(group);
    }

    const actualConsumed = points - remainingPoints;

    return {
      success: actualConsumed > 0,
      consumed: actualConsumed,
      groupsUpdated: updatedGroups
    };
  }

  // ✅ 其他方法使用简单mock
  async save(group) {
    const saved = { ...group, lastUpdated: Date.now() };
    this.groups.push(saved);
    return saved;
  }

  async getAll() {
    return [...this.groups];
  }
}
```

#### EventBus Mock 模式

```javascript
// test/utils/mock-event-bus.js
class MockEventBus {
  constructor() {
    this.events = {};
    this.subscriptions = {};
  }

  emit(eventName, data) {
    // 记录事件发布
    if (!this.events[eventName]) {
      this.events[eventName] = [];
    }
    this.events[eventName].push({
      eventName,
      data,
      timestamp: Date.now()
    });

    // 触发订阅
    if (this.subscriptions[eventName]) {
      this.subscriptions[eventName].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`MockEventBus callback error for ${eventName}:`, error);
        }
      });
    }
  }

  on(eventName, callback) {
    if (!this.subscriptions[eventName]) {
      this.subscriptions[eventName] = [];
    }
    this.subscriptions[eventName].push(callback);
  }

  off(eventName, callback) {
    if (!this.subscriptions[eventName]) return;
    const index = this.subscriptions[eventName].indexOf(callback);
    if (index > -1) {
      this.subscriptions[eventName].splice(index, 1);
    }
  }

  // 验证方法
  verifyEmit(eventName, matcher) {
    const events = this.events[eventName] || [];
    expect(events.length).toBeGreaterThan(0);

    const lastEvent = events[events.length - 1];
    if (typeof matcher === 'function') {
      matcher(lastEvent.data);
    } else {
      expect(lastEvent.data).toMatchObject(matcher);
    }
  }

  verifyNotEmit(eventName) {
    const events = this.events[eventName] || [];
    expect(events.length).toBe(0);
  }

  reset() {
    this.events = {};
    this.subscriptions = {};
  }
}

module.exports = MockEventBus;
```

#### Mock 使用示例

```javascript
// test/services/star-service.test.js
const MockEventBus = require('../utils/mock-event-bus');
const FakeStarRepository = require('../fakes/fake-star-repository');

describe('StarService', () => {
  let starService;
  let mockEventBus;
  let fakeStarRepository;

  beforeEach(() => {
    // 初始化 Mock
    mockEventBus = new MockEventBus();
    fakeStarRepository = new FakeStarRepository();

    // 注入 Mock
    starService = new StarService({
      eventBus: mockEventBus,
      starRepository: fakeStarRepository
    });
  });

  afterEach(() => {
    mockEventBus.reset();
  });

  describe('consumeStars', () => {
    it('应该按FIFO顺序消费星星', async () => {
      // 准备测试数据
      fakeStarRepository.groups = [
        TestDataFactory.createStarGroup({
          id: 'group_1',
          stars: 5,
          expiryDate: '2026-03-05'  // 即将过期
        }),
        TestDataFactory.createStarGroup({
          id: 'group_2',
          stars: 10,
          expiryDate: '2026-03-10'  // 5天后过期
        })
      ];

      // 执行测试
      const result = await starService.consumeStars(12, '消费测试', {
        userId: 'user_123'
      });

      // 验证结果
      expect(result.success).toBe(true);
      expect(result.consumed).toBe(12);
      expect(result.groupsUpdated.length).toBe(2);

      // 验证第一个分组被完全消费
      expect(result.groupsUpdated[0].stars).toBe(0);

      // 验证第二个分组被部分消费
      expect(result.groupsUpdated[1].stars).toBe(3);

      // 验证事件发布
      mockEventBus.verifyEmit('star:consumed', {
        points: 12,
        reason: '消费测试',
        userId: 'user_123'
      });
    });
  });
});
```

---

### 测试数据管理策略

#### 数据工厂（TestDataFactory）

**目的**：提供统一的测试数据创建方法，确保测试数据的一致性和可维护性。

**创建文件**：`test/utils/test-data-factory.js`

```javascript
/**
 * test-data-factory.js - 测试数据工厂
 *
 * 提供统一的测试数据创建方法
 */

const dateUtils = require('../../utils/dateUtils');

class TestDataFactory {
  // ==================== Model 数据工厂 ====================

  /**
   * 创建 StarGroup 测试数据
   * @param {Object} options 覆盖选项
   * @returns {Object} StarGroup 数据
   */
  static createStarGroup(options = {}) {
    const defaults = {
      id: options.id || `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: options.userId || 'user_123',
      stars: options.stars !== undefined ? options.stars : 10,
      expiryDate: options.expiryDate || dateUtils.addDays(new Date(), 7).toISOString(),
      expiryType: options.expiryType || 'week',
      expiryDateStr: options.expiryDateStr || dateUtils.formatDate(dateUtils.addDays(new Date(), 7)),
      type: options.type || 'temporary',
      lastUpdated: Date.now()
    };

    return { ...defaults, ...options };
  }

  /**
   * 创建 Star 测试数据
   * @param {Object} options 覆盖选项
   * @returns {Object} Star 数据
   */
  static createStar(options = {}) {
    const defaults = {
      id: options.id || `star_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      groupId: options.groupId || 'group_123',
      userId: options.userId || 'user_123',
      points: options.points !== undefined ? options.points : 1,
      status: options.status || 'available',
      source: options.source || 'task',
      sourceId: options.sourceId || 'task_456',
      description: options.description || '测试星星',
      timestamp: options.timestamp || Date.now()
    };

    return { ...defaults, ...options };
  }

  /**
   * 创建 Reward 测试数据
   * @param {Object} options 覆盖选项
   * @returns {Object} Reward 数据
   */
  static createReward(options = {}) {
    const defaults = {
      id: options.id || `reward_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: options.userId || 'user_123',
      name: options.name || '测试奖励',
      description: options.description || '测试奖励描述',
      points: options.points !== undefined ? options.points : 100,
      type: options.type || 'custom',
      status: options.status || 'available',
      imageUrl: options.imageUrl || '',
      isExample: options.isExample || false,
      claimedBy: options.claimedBy || null,
      claimTime: options.claimTime || null,
      createTime: options.createTime || Date.now(),
      lastUpdated: Date.now()
    };

    return { ...defaults, ...options };
  }

  /**
   * 创建 Task 测试数据
   * @param {Object} options 覆盖选项
   * @returns {Object} Task 数据
   */
  static createTask(options = {}) {
    const defaults = {
      id: options.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: options.userId || 'user_123',
      title: options.title || '测试任务',
      type: options.type || 'study',
      status: options.status || 'pending',
      date: options.date || dateUtils.getTodayString(),
      startTime: options.startTime || '09:00',
      endTime: options.endTime || '10:00',
      points: options.points !== undefined ? options.points : 10,
      pointsExpiry: options.pointsExpiry || 'week',
      isRequired: options.isRequired || false,
      penaltyApplied: options.penaltyApplied || false,
      createTime: options.createTime || Date.now(),
      updateTime: options.updateTime || Date.now()
    };

    return { ...defaults, ...options };
  }

  /**
   * 创建 Message 测试数据
   * @param {Object} options 覆盖选项
   * @returns {Object} Message 数据
   */
  static createMessage(options = {}) {
    const defaults = {
      id: options.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: options.userId || 'user_123',
      type: options.type || 'system',
      content: options.content || '测试消息',
      isRead: options.isRead || false,
      priority: options.priority !== undefined ? options.priority : 1,
      relatedType: options.relatedType || 'task',
      relatedId: options.relatedId || 'task_123',
      createTime: options.createTime || Date.now()
    };

    return { ...defaults, ...options };
  }

  // ==================== 场景构建器 ====================

  /**
   * 构建跨分组消费的测试场景
   * @returns {Object} 测试场景
   */
  static buildMultiGroupConsumption() {
    const today = dateUtils.getTodayString();
    const tomorrow = dateUtils.getTomorrowString();
    const nextWeek = dateUtils.formatDate(dateUtils.addDays(new Date(), 7));

    return {
      userId: 'user_123',
      groups: [
        this.createStarGroup({
          id: 'group_1',
          stars: 5,
          expiryDate: tomorrow,  // 明天过期
          expiryType: 'week'
        }),
        this.createStarGroup({
          id: 'group_2',
          stars: 8,
          expiryDate: nextWeek,  // 一周后过期
          expiryType: 'week'
        }),
        this.createStarGroup({
          id: 'group_3',
          stars: 10,
          expiryDate: null,  // 永久有效
          expiryType: 'permanent',
          type: 'permanent'
        })
      ],
      requestPoints: 12,
      expectedResults: {
        consumedFromGroup1: 5,
        consumedFromGroup2: 7,
        group3Unchanged: true,
        actualConsumed: 12,
        group1StarsAfter: 0,
        group2StarsAfter: 1,
        group3StarsAfter: 10
      }
    };
  }

  /**
   * 构建星星过期场景
   * @returns {Array} 过期场景数组
   */
  static buildStarExpiryScenarios() {
    const today = dateUtils.getTodayString();
    const yesterday = dateUtils.getYesterdayString();
    const tomorrow = dateUtils.getTomorrowString();

    return [
      {
        description: '今天过期',
        expiryDate: today,
        today: today,
        expectedIsExpired: true,
        expectedRemainingDays: 0
      },
      {
        description: '昨天过期',
        expiryDate: yesterday,
        today: today,
        expectedIsExpired: true,
        expectedRemainingDays: 0
      },
      {
        description: '明天过期',
        expiryDate: tomorrow,
        today: today,
        expectedIsExpired: false,
        expectedRemainingDays: 1
      },
      {
        description: '一周后过期',
        expiryDate: dateUtils.formatDate(dateUtils.addDays(new Date(), 7)),
        today: today,
        expectedIsExpired: false,
        expectedRemainingDays: 7
      },
      {
        description: '永久有效',
        expiryDate: null,
        today: today,
        expectedIsExpired: false,
        expectedRemainingDays: -1
      },
      {
        description: '无效日期',
        expiryDate: 'invalid-date',
        today: today,
        expectedIsExpired: false,
        expectedRemainingDays: 0
      },
      {
        description: '空日期',
        expiryDate: '',
        today: today,
        expectedIsExpired: false,
        expectedRemainingDays: 0
      },
      {
        description: 'undefined日期',
        expiryDate: undefined,
        today: today,
        expectedIsExpired: false,
        expectedRemainingDays: 0
      }
    ];
  }

  /**
   * 构建奖励保护场景
   * @returns {Object} 奖励保护场景
   */
  static buildRewardProtectionScenario() {
    const today = dateUtils.getTodayString();
    const yesterday = dateUtils.getYesterdayString();

    return {
      userId: 'user_123',
      today: today,
      rewards: [
        this.createReward({
          id: 'reward_1',
          name: '高价值奖励',
          points: 100,
          status: 'available'
        }),
        this.createReward({
          id: 'reward_2',
          name: '中价值奖励',
          points: 50,
          status: 'available'
        }),
        this.createReward({
          id: 'reward_3',
          name: '低价值奖励',
          points: 20,
          status: 'available'
        })
      ],
      totalStars: 80,
      expiredStars: 120,  // 过期但可用的星星
      expectedResults: {
        protectedCount: 2,
        reward1Protected: 100,
        reward2Protected: 20,
        reward3Unprotected: true,
        totalProtected: 120,
        remainingStars: 80
      }
    };
  }
}

module.exports = TestDataFactory;
```

#### 数据构建器（ScenarioBuilder）

**创建文件**：`test/utils/scenario-builder.js`

```javascript
/**
 * scenario-builder.js - 测试场景构建器
 *
 * 提供复杂测试场景的数据构建方法
 */

class ScenarioBuilder {
  /**
   * 构建完整的服务测试场景
   * @param {Object} service 服务实例
   * @param {String} scenarioType 场景类型
   * @returns {Object} 测试场景
   */
  static buildServiceScenario(service, scenarioType) {
    const scenarios = {
      'star-consumption-multi-group': () => ({
        description: '跨分组消费星星',
        setup: async () => {
          const scenario = TestDataFactory.buildMultiGroupConsumption();
          // 初始化 Fake Repository
          service.starRepository.groups = scenario.groups;
          return scenario;
        },
        action: async () => {
          return await service.consumeStars(
            scenario.requestPoints,
            '测试消费',
            { userId: scenario.userId }
          );
        },
        verify: async (result) => {
          expect(result.success).toBe(true);
          expect(result.consumed).toBe(scenario.expectedResults.actualConsumed);
          expect(result.groupsUpdated[0].stars).toBe(scenario.expectedResults.group1StarsAfter);
          expect(result.groupsUpdated[1].stars).toBe(scenario.expectedResults.group2StarsAfter);
          expect(result.groupsUpdated[2].stars).toBe(scenario.expectedResults.group3StarsAfter);
        }
      }),

      'star-expiry-all-scenarios': () => ({
        description: '星星过期所有场景',
        setup: () => TestDataFactory.buildStarExpiryScenarios(),
        actions: [],
        verify: []
      }),

      'reward-protection': () => ({
        description: '奖励保护逻辑',
        setup: async () => {
          const scenario = TestDataFactory.buildRewardProtectionScenario();
          service.starRepository.groups = scenario.groups.map(g => ({
            ...g,
            stars: scenario.totalStars // 初始化总星星
          }));
          return scenario;
        },
        action: async () => {
          return await service.protectRewards(scenario.userId);
        },
        verify: async (result) => {
          expect(result.success).toBe(true);
          expect(result.protectedCount).toBe(scenario.expectedResults.protectedCount);
        }
      })
    };

    return scenarios[scenarioType]();
  }
}

module.exports = ScenarioBuilder;
```

#### Mock 配置辅助工具

**创建文件**：`test/utils/mock-setup.js`

```javascript
/**
 * mock-setup.js - Mock 配置辅助工具
 *
 * 提供统一的 Mock 配置和重置方法
 */

const MockEventBus = require('./mock-event-bus');

class MockSetup {
  /**
   * 创建标准的服务 Mock 配置
   * @param {Object} options 配置选项
   * @returns {Object} Mock 配置
   */
  static createServiceMock(options = {}) {
    return {
      eventBus: new MockEventBus(),
      repositories: options.repositories || {},
      services: options.services || {},
      adapters: options.adapters || {},
      resetBeforeEach: options.resetBeforeEach !== false
    };
  }

  /**
   * 应用 Mock 配置到服务实例
   * @param {Object} service 服务实例
   * @param {Object} mockConfig Mock 配置
   */
  static applyMock(service, mockConfig) {
    // 注入 EventBus
    if (mockConfig.eventBus) {
      service.eventBus = mockConfig.eventBus;
    }

    // 注入 Repository Mock
    if (mockConfig.repositories) {
      Object.entries(mockConfig.repositories).forEach(([key, mock]) => {
        if (service[key + 'Repository']) {
          service[key + 'Repository'] = mock;
        }
      });
    }

    // 注入 Service Mock
    if (mockConfig.services) {
      Object.entries(mockConfig.services).forEach(([key, mock]) => {
        if (service[key + 'Service']) {
          service[key + 'Service'] = mock;
        }
      });
    }
  }

  /**
   * 重置所有 Mock
   * @param {Object} mockConfig Mock 配置
   */
  static resetAllMocks(mockConfig) {
    if (mockConfig.eventBus) {
      mockConfig.eventBus.reset();
    }

    if (mockConfig.repositories) {
      Object.values(mockConfig.repositories).forEach(mock => {
        if (mock.mockClear) {
          mock.mockClear();
        }
      });
    }

    if (mockConfig.services) {
      Object.values(mockConfig.services).forEach(mock => {
        if (mock.mockClear) {
          mock.mockClear();
        }
      });
    }
  }
}

module.exports = MockSetup;
```

#### 数据管理最佳实践

**1. 数据一致性**：
- ✅ 使用工厂方法创建测试数据，确保一致性
- ✅ 每个测试场景使用独立的测试数据
- ✅ 测试完成后重置测试数据

**2. 可读性**：
- ✅ 测试数据字段命名清晰（expectedIsExpired、actualConsumed等）
- ✅ 使用场景描述说明测试意图
- ✅ 复杂数据使用注释说明

**3. 可维护性**：
- ✅ 测试数据工厂集中管理
- ✅ 场景构建器统一管理
- ✅ Mock配置辅助工具统一重置

---

## 实施步骤（修订版）

### 阶段1：基础设施准备（预计1周）

- [ ] **任务**：创建 TestDataFactory (test/utils/test-data-factory.js)
- [ ] **任务**：创建 ScenarioBuilder (test/utils/scenario-builder.js)
- [ ] **任务**：创建 MockEventBus (test/utils/mock-event-bus.js)
- [ ] **任务**：创建 Fake Repository 模板 (test/fakes/fake-repository-template.js)
- [ ] **任务**：创建 MockSetup 辅助工具 (test/utils/mock-setup.js)
- [ ] **验证**：运行工具测试，确保可用
- [ ] **依赖**：无

**验收标准**：
- [ ] 所有工具文件创建完成
- [ ] 工具测试全部通过
- [ ] 测试数据工厂提供完整的数据创建方法
- [ ] Mock 配置工具提供统一的Mock注入方法

---

### 第2步：Model测试（预计3周）

**Week 1：StarGroup FIFO消费策略**
- [ ] **任务**：创建 test/models/star-group.test.js
- [ ] **任务**：实现基础排序测试（按过期时间、永久分组处理）
- [ ] **任务**：实现跨分组消费测试
- [ ] **任务**：实现余额不足处理测试
- [ ] **任务**：实现数据更新验证测试
- [ ] **任务**：实现边界场景测试（空列表、0星、负数）
- [ ] **验证**：运行 StarGroup 测试，确保通过
- [ ] **依赖**：阶段1完成后

**Week 2：Star过期处理 + Reward保护逻辑**
- [ ] **任务**：创建 test/models/star.test.js
- [ ] **任务**：实现过期检测测试（今天、明天、永久、无效）
- [ ] **任务**：实现剩余天数计算测试
- [ ] **任务**：创建 test/models/reward.test.js
- [ ] **任务**：实现奖励识别测试（可保护筛选）
- [ ] **任务**：实现奖励分配测试（优先级高到低）
- [ ] **任务**：实现部分保护测试（星星不足）
- [ ] **任务**：实现多奖励保护测试
- [ ] **验证**：运行 Star 和 Reward 测试，确保通过
- [ ] **依赖**：阶段1完成后

**Week 3：Message + StarRecord + User**
- [ ] **任务**：创建 test/models/message.test.js
- [ ] **任务**：实现消息类型测试
- [ ] **任务**：实现优先级处理测试
- [ ] **任务**：创建 test/models/star-record.test.js
- [ ] **任务**：实现记录类型测试（收入、支出、惩罚）
- [ ] **任务**：创建 test/models/user.test.js
- [ ] **任务**：实现用户模型基础测试
- [ ] **验证**：运行所有 Model 测试，确保通过
- [ ] **依赖**：阶段1完成后

**验收标准**：
- [ ] StarGroup FIFO策略测试完整（至少15个测试用例）
- [ ] Star过期处理测试完整（至少10个测试用例）
- [ ] Reward保护逻辑测试完整（至少12个测试用例）
- [ ] Message测试基本完整（至少8个测试用例）
- [ ] 所有 Model 测试通过

---

### 第3步：Repository测试（预计1.5周）

**Week 4：StarRepository + TaskRepository**
- [ ] **任务**：创建 test/repositories/star-repository.test.js
- [ ] **任务**：实现CRUD操作测试（save、getById、delete）
- [ ] **任务**：实现查询方法测试（getStarGroupsByUserId）
- [ ] **任务**：创建 test/repositories/task-repository.test.js
- [ ] **任务**：实现CRUD操作测试
- [ ] **任务**：实现查询方法测试（getTasksByDate、getRequiredTasks）
- [ ] **任务**：实现批量操作测试（saveAll、deleteMany）
- [ ] **验证**：运行 Repository 测试，确保通过
- [ ] **依赖**：阶段2完成后

**Week 5：其他Repository + BaseRepository**
- [ ] **任务**：创建 test/repositories/base-repository.test.js
- [ ] **任务**：实现基础方法测试（getAll、getById、query）
- [ ] **任务**：实现事务操作测试
- [ ] **任务**：实现缓存机制测试
- [ ] **任务**：创建其他 Repository 测试
- [ ] **验证**：运行所有 Repository 测试，确保通过
- [ ] **依赖**：阶段2完成后

**验收标准**：
- [ ] 基础CRUD操作有测试覆盖
- [ ] 关键查询方法有测试覆盖
- [ ] 批量操作有测试覆盖
- [ ] BaseRepository 核心方法有测试覆盖
- [ ] 所有 Repository 测试通过

---

### 第4步：Service测试（预计3.5周）

**Week 6-7：StarService（FIFO、过期、奖励保护）**
- [ ] **任务**：补充 test/services/star-service.test.js
- [ ] **任务**：实现消费流程端到端测试（使用 Fake Repository）
- [ ] **任务**：实现过期处理流程测试
- [ ] **任务**：实现奖励保护流程测试
- [ ] **任务**：实现事件发布验证测试（使用 MockEventBus）
- [ ] **任务**：实现边界场景测试（余额不足、无分组、过期分组）
- [ ] **验证**：运行 StarService 测试，确保通过
- [ ] **依赖**：阶段3完成后

**Week 8-9：TaskService（任务完成、必做任务惩罚）**
- [ ] **任务**：补充 test/services/task-service.test.js
- [ ] **任务**：实现任务完成流程测试（使用 Fake Repository）
- [ ] **任务**：实现必做任务惩罚流程测试
- [ ] **任务**：实现事件发布验证测试
- [ ] **任务**：实现任务锁定逻辑测试
- [ ] **验证**：运行 TaskService 测试，确保通过
- [ ] **依赖**：阶段3完成后

**验收标准**：
- [ ] 星星消费流程端到端测试完整（至少20个测试用例）
- [ ] 任务完成流程端到端测试完整（至少15个测试用例）
- [ ] 必做任务惩罚流程测试完整（至少10个测试用例）
- [ ] 事件发布验证完整
- [ ] 所有 Service 测试通过

---

### 第5步：工具函数测试（预计1周）

**Week 10：EventBus + batchUtils + dateUtils**
- [ ] **任务**：创建 test/utils/event-bus.test.js
- [ ] **任务**：实现 EventBus 发布测试
- [ ] **任务**：实现 EventBus 订阅测试
- [ ] **任务**：实现 EventBus 取消订阅测试
- [ ] **任务**：创建 test/utils/batch-utils.test.js
- [ ] **任务**：实现批量处理测试
- [ ] **任务**：实现进度回调测试
- [ ] **任务**：补充 test/utils/date-utils.test.js
- [ ] **任务**：实现关键日期计算测试
- [ ] **验证**：运行所有工具函数测试，确保通过
- [ ] **依赖**：阶段4完成后

**验收标准**：
- [ ] EventBus 发布订阅机制测试完整
- [ ] batchUtils 批量处理逻辑测试完整
- [ ] dateUtils 关键方法测试完整
- [ ] 所有工具函数测试通过

---

### 阶段6：文档和验证（预计1周）

**Week 10（后半段）：文档更新**
- [ ] **任务**：更新 API 文档（services-guide.md）
- [ ] **任务**：更新 repositories.md
- [ ] **任务**：更新 CHANGELOG.md，记录测试覆盖提升
- [ ] **任务**：更新设计文档状态为"已完成"
- [ ] **任务**：创建完成报告文档
- [ ] **验证**：运行完整测试套件
- [ ] **任务**：生成测试覆盖率报告
- [ ] **依赖**：阶段5完成后

**验收标准**：
- [ ] API 文档与代码一致
- [ ] CHANGELOG 记录完整
- [ ] 设计文档更新为已完成
- [ ] 所有测试通过
- [ ] 生成覆盖率报告

---

### 工期汇总

| 阶段 | 内容 | 预计时间 |
|------|------|----------|
| 阶段1：基础设施准备 | 工具类创建 | 1周 |
| 阶段2：Model测试 | 3个Model文件 | 3周 |
| 阶段3：Repository测试 | 多个Repository文件 | 1.5周 |
| 阶段4：Service测试 | 核心Service流程 | 3.5周 |
| 阶段5：工具函数测试 | EventBus、batchUtils等 | 1周 |
| 阶段6：文档和验证 | API文档、CHANGELOG、报告 | 1周 |
| **总计** | - | **11周** |

**风险缓冲**：
- 建议增加10%的缓冲时间
- 最终建议工期：12周（11周 + 10%缓冲）

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

## 评审记录

### 初审（2026-03-03）

**评审团队**：
- 测试架构师：资深测试工程师
- 领域专家：DDD架构师
- 代码质量专家：资深工程师
- 项目经理：PM

**评审结论**：⭐⭐⭐ (3/5) - **需要重大修改**

**评审发现的主要问题**：

1. **问题1：测试范围定义模糊**
   - "不包含"定义不够清晰
   - "边界场景"和"异常处理"缺少明确标准
   - 建议明确定义测试范围和边界

2. **问题2：工期估算过于乐观**
   - 估算5周，实际需要10-12周
   - 建议调整为10-12周

3. **问题3：Mock策略不够详细**
   - Repository Mock不区分简单CRUD和复杂业务逻辑
   - 缺少Fake Object实现方案
   - 缺少EventBus Mock策略

4. **问题4：测试用例设计不完整**
   - 只有3个测试用例示例，实际需要至少15个
   - 缺少跨分组消费、永久/临时混合等场景

5. **问题5：缺少测试数据管理策略**
   - 没有测试数据工厂设计
   - 没有场景数据构建器
   - 缺少Mock配置辅助工具

### 修订内容（2026-03-03）

**已修订内容**：

1. **明确定义测试范围和边界**
   - 区分"UI层和组件"、"微信API和端到端"
   - 明确"边界场景"和"异常处理"的判断标准

2. **调整工期估算**
   - 从5周调整到11周
   - 添加10%风险缓冲
   - 分6个阶段实施

3. **补充详细Mock策略**
   - 添加Repository Mock分类原则
   - 添加Fake Object实现示例（完整FIFO逻辑）
   - 添加MockEventBus实现和验证方法

4. **补充完整测试用例列表**
   - StarGroup FIFO：至少15个测试用例
   - Star过期处理：至少10个测试用例
   - Reward保护：至少12个测试用例
   - Message测试：至少8个测试用例

5. **建立测试数据管理策略**
   - 创建TestDataFactory（Model数据工厂）
   - 创建ScenarioBuilder（场景数据构建器）
   - 创建MockSetup（Mock配置辅助工具）

### 修订后的预期成果

**新增工具文件**：
- test/utils/test-data-factory.js
- test/utils/scenario-builder.js
- test/utils/mock-setup.js
- test/utils/mock-event-bus.js
- test/fakes/fake-repository-template.js

**新增测试文件**：
- test/models/star-group.test.js
- test/models/star.test.js
- test/models/reward.test.js
- test/models/message.test.js
- test/models/star-record.test.js
- test/repositories/star-repository.test.js
- test/repositories/task-repository.test.js
- test/repositories/base-repository.test.js
- test/utils/event-bus.test.js
- test/utils/batch-utils.test.js

**预期覆盖率提升**：
- Models: 30.19% → ~50%
- Repositories: 7.45% → ~30%
- Services: 45.29% → ~55%
- Utils: 30.29% → ~40%
- 整体: 30.59% → ~45%

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
