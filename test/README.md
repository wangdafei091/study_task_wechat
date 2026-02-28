# 测试文件说明

> 项目的单元测试体系，覆盖核心业务逻辑
> **最后更新**：2026-02-28

---

## 📋 测试范围

### ✅ 包含的范围（单元测试）

**重点测试内容**：

1. **领域模型（models）**
   - Task 模型的状态转换
   - Star 模型的有效期计算
   - Reward 模型的状态管理
   - 数据验证逻辑

2. **应用服务（services）**
   - StarService：星星计算、FIFO消费、过期处理
   - TaskService：任务状态变更、必做任务惩罚
   - 其他服务：MessageService、UserService、ConfigService 等

3. **工具函数（utils）**
   - dateUtils：日期计算、格式化
   - formatUtils：格式化逻辑
   - 其他纯函数逻辑

4. **仓储层（repositories）- 可选**
   - 数据查询逻辑
   - 批量操作逻辑

### ❌ 不包含的范围（页面和UI）

**通过微信开发者工具手动测试**：

1. **页面交互**
   - 点击事件
   - 表单提交
   - 页面跳转

2. **UI渲染**
   - 组件显示
   - 样式正确性
   - 动画效果

3. **微信API调用**
   - wx.request
   - wx.setStorage
   - 其他微信原生API

4. **端到端流程**
   - 完整的用户操作流程

---

## 🏗️ 测试结构

```
test/
├── setup/
│   └── jest-setup.js          # Jest 配置
├── __mocks__/
│   ├── storage-adapter-mock.js # 存储适配器模拟
│   └── wx-mock.js            # 微信API模拟
├── models/
│   ├── task.test.js
│   ├── star.test.js
│   ├── star-group.test.js
│   └── reward.test.js
├── services/
│   ├── star-service.test.js
│   ├── task-service.test.js
│   └── message-service.test.js
├── utils/
│   ├── date-utils.test.js
│   └── format-utils.test.js
└── README.md                # 本文档
```

---

## 🚀 运行测试

### 运行所有测试

```bash
npm test
```

### 运行特定测试文件

```bash
npm test -- test/services/star-service.test.js
```

### 监听模式（修改代码后自动运行）

```bash
npm run test:watch
```

### 生成覆盖率报告

```bash
npm run test:coverage

# 查看报告
open coverage/lcov-report/index.html
```

---

## ✅ 验收标准

### 测试完整性

- [ ] 至少覆盖 StarService、TaskService 两个核心服务
- [ ] 至少覆盖 dateUtils、formatUtils 两个工具函数
- [ ] 测试用例总数 >= 30

### 测试质量

- [ ] 所有测试可以通过 `npm test` 运行
- [ ] 测试覆盖率 >= 70%
- [ ] 每个测试都有明确的描述（it('应该...'））
- [ ] 使用 beforeEach/afterEach 清理测试环境

### 文档完整性

- [ ] 有 test/README.md 说明测试范围和运行方法
- [ ] 每个测试文件顶部有简要说明

---

## 🧪 测试规范

### 命名规范

```javascript
// ✅ 正确
describe('StarService', () => {
  it('应该正确添加永久星星', async () => {
    // 测试代码
  });
});

// ❌ 错误
describe('test1', () => {
  it('测试', () => {
    // 测试代码
  });
});
```

### Mock 使用

```javascript
// 使用Mock存储
const MockStorageAdapter = require('../__mocks__/storage-adapter-mock');
const mockStorage = new MockStorageAdapter();

// 在测试中使用
beforeEach(() => {
  mockStorage.clearAll();
});
```

### 异步测试

```javascript
// ✅ 正确 - 使用 async/await
it('应该异步添加星星', async () => {
  const result = await starService.addStars(10, 'permanent', '测试');
  expect(result.success).toBe(true);
});

// ✅ 正确 - 使用 done
it('应该异步添加星星', (done) => {
  starService.addStars(10, 'permanent', '测试').then(result => {
    expect(result.success).toBe(true);
    done();
  });
});
```

---

## 📊 覆盖率目标

| 类型 | 最低 | 目标 |
|------|------|------|
| 分支覆盖率 | 70% | 85% |
| 函数覆盖率 | 70% | 85% |
| 行覆盖率 | 70% | 85% |
| 语句覆盖率 | 70% | 85% |

---

## 🔧 故障排查

### 测试失败

1. **检查Mock配置**：确认所有外部依赖已正确Mock
2. **检查异步代码**：确认所有Promise都正确处理
3. **检查数据清理**：确认beforeEach正确清理测试环境

### 覆盖率不足

1. **增加测试用例**：针对未覆盖的分支添加测试
2. **检查边界情况**：测试空值、null、undefined等边界情况
3. **检查错误处理**：测试异常情况和错误处理逻辑

---

## 📞 后续扩展

### 可选的扩展（后续考虑）

1. **组件测试**
   - 如果使用组件测试框架（如 @testing-library/wechat）
   - 测试组件的渲染和交互

2. **E2E测试**
   - 如果有自动化测试需求
   - 使用微信小程序自动化测试工具

3. **性能测试**
   - 大数据量场景测试
   - 批量操作性能验证
