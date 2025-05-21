# 奖励系统自动化测试

本目录包含奖励系统的自动化测试套件，使用Jest进行单元测试和集成测试。

## 目录结构

```
test/
  ├── __mocks__/             - 模拟对象和工具
  │   ├── wx.js              - 微信API模拟
  │   └── storage-adapter-mock.js  - 存储适配器模拟
  │
  ├── models/                - 模型测试
  │   └── reward.test.js     - Reward模型测试
  │
  ├── repositories/          - 仓储层测试
  │   └── reward-repository.test.js  - RewardRepository测试
  │
  ├── services/              - 服务层测试
  │   └── reward-service.test.js     - RewardService测试
  │
  ├── integration/           - 集成测试
  │   └── reward-flow.test.js        - 奖励流程集成测试
  │
  └── setup/                 - 测试设置
      └── jest-setup.js      - Jest全局设置
```

## 运行测试

安装依赖:

```bash
npm install
```

运行所有测试:

```bash
npm test
```

运行特定类型的测试:

```bash
# 只运行模型测试
npm run test:models

# 只运行仓储测试
npm run test:repositories 

# 只运行服务测试
npm run test:services

# 只运行集成测试
npm run test:integration
```

生成测试覆盖率报告:

```bash
npm run test:coverage
```

## 测试内容概述

1. **模型测试** - 测试Reward模型的:
   - 创建和验证
   - 状态转换
   - 业务规则和约束

2. **仓储测试** - 测试RewardRepository的:
   - 数据读写操作
   - 查询和筛选功能
   - 批量处理

3. **服务测试** - 测试RewardService的:
   - 业务逻辑实现
   - 错误处理
   - 复杂计算和聚合

4. **集成测试** - 测试完整流程:
   - 奖励创建、兑换和领取流程
   - 计算下一个可兑换奖励
   - 处理边界情况

## 测试模拟

- **wx API模拟** - 模拟微信小程序API，特别是存储相关功能
- **存储适配器模拟** - 用于隔离仓储层测试的内存存储实现
- **依赖注入** - 服务层测试使用模拟依赖进行隔离测试

## 编写新测试

添加新测试时，遵循以下原则:

1. 单元测试应该隔离被测试的单元，模拟所有外部依赖
2. 集成测试应该测试真实组件之间的交互
3. 每个测试应该关注一个特定功能点
4. 使用适当的断言验证结果
5. 妥善管理测试前后的状态 