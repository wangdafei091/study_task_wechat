# 测试文件说明

> 项目的 Jest 测试体系，覆盖核心业务逻辑、应用壳层、关键页面行为与根级契约测试
> **最后更新**：2026-03-26

---

## 📋 测试范围

### ✅ 包含的范围（自动化测试）

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

5. **应用壳层与启动链路（app / utils/app）**
   - `app.js` 对外契约
   - 登录、服务初始化、登录后补偿
   - 运行时监听与全局壳层行为

6. **关键页面行为（pages）**
   - 首页壳层与模块编排
   - 奖励页核心交互契约
   - 消息页主路径行为

7. **根级契约测试**
   - `test/backend/message-service-copy.test.js` 这类根级文案/语义契约测试
   - `package.json` 质量脚本契约测试

### ❌ 不包含的范围（仍以手工验证为主）

**通过微信开发者工具手动测试**：

1. **UI 细节渲染**
   - 组件像素级显示
   - 样式细节和视觉还原
   - 动画效果与过渡细节

2. **真实微信运行时与外部环境**
   - wx.request
   - 设备能力差异
   - 真机/模拟器差异

3. **端到端流程**
   - 完整的用户操作流程

4. **后端真实数据库集成**
   - 远程测试数据库链路
   - 真实 API / DB 联调验证

---

## 🏗️ 测试结构

```
test/
├── adapters/
│   └── storage-adapter.test.js
├── app/
│   ├── app-bootstrap.test.js
│   ├── app-contract.test.js
│   └── post-login-bootstrap.test.js
├── setup/
│   └── jest-setup.js          # Jest 配置
├── __mocks__/
│   ├── storage-adapter-mock.js # 存储适配器模拟
│   └── wx-mock.js            # 微信API模拟
├── pages/
│   ├── index.page-contract.test.js
│   ├── index.reward-flow.test.js
│   └── rewards.page-contract.test.js
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
│   ├── format-utils.test.js
│   └── logger.test.js
├── backend/
│   └── message-service-copy.test.js
└── README.md                # 本文档
```

---

## 🚀 运行测试

### 根级稳定闸门

```bash
npm test
```

### 前端覆盖率闸门

```bash
npm run test:quality
```

### 按目录运行核心测试

```bash
npm run test:app
npm run test:pages
npm run test:adapters
```

### 运行特定测试文件

```bash
npm test -- test/services/star-service.test.js
```

### 监听模式（修改代码后自动运行）

```bash
npm run test:watch
```

### 生成前端覆盖率报告

```bash
npm run test:coverage

# 查看报告
open coverage/lcov-report/index.html
```

### 项目级后端测试入口

```bash
npm run test:backend:unit
npm run test:backend:integration:memory
npm run test:backend:integration:real
```

---

## ✅ 验收标准

### 测试完整性

- [ ] 根级稳定闸门 `npm test` 全绿
- [ ] 前端覆盖率闸门 `npm run test:quality` 通过
- [ ] 关键高风险范围已纳入自动化测试：`app.js`、启动链路、首页、奖励页、消息页、存储适配器

### 测试质量

- [ ] 所有测试可以通过 `npm test` 运行
- [ ] 前端覆盖率闸门达到路径级阈值要求
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

M13 起，项目不再只依赖单一全局阈值，而是以 `jest.quality.config.js` 中定义的核心路径级阈值为正式阻塞标准。覆盖率报告仍会生成，但是否通过以质量闸门脚本结果为准。

---

## 🔧 故障排查

### 测试失败

1. **检查Mock配置**：确认所有外部依赖已正确Mock
2. **检查异步代码**：确认所有Promise都正确处理
3. **检查数据清理**：确认beforeEach正确清理测试环境
4. **区分闸门类型**：先确认失败的是 `npm test` 还是 `npm run test:quality`

### 覆盖率不足

1. **检查质量闸门配置**：确认失败的是哪一个路径级阈值
2. **增加测试用例**：针对未覆盖的分支添加测试
3. **检查边界情况**：测试空值、null、undefined等边界情况
4. **检查错误处理**：测试异常情况和错误处理逻辑

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
