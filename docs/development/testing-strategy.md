# 项目测试策略总览

> 项目级测试分层、命令入口、覆盖率口径和手工回归的权威说明
> **最后更新**：2026-03-27
> **维护者**：项目维护团队

---

## 文档定位

- 本文档负责回答“测什么、怎么跑、哪些是正式闸门、覆盖率怎么看、哪些仍需手工验证”
- 测试编写规范请参阅 [coding_standards.md](./coding_standards.md#测试规范)
- 后端真实数据库集成测试操作细节请参阅 [backend/test/README.md](../../backend/test/README.md)
- 开发流程和文档同步规则请参阅 [workflow.md](./workflow.md)

---

## 1. 测试分层概览

| 层级 | 目标 | 主要范围 | 主要入口 | 是否正式闸门 |
|------|------|---------|---------|-------------|
| 根级稳定闸门 | 确认当前主测试树全绿 | `test/` 下已纳入根 Jest 的前端/页面/根级契约测试 | `npm test` | 是 |
| 前端覆盖率闸门 | 保护高风险前端壳层与关键模块 | `app.js`、`utils/app/*`、首页、奖池页、消息页、`task-service` 等 | `npm run test:quality` | 是 |
| 前端按目录测试 | 快速回归单个模块或目录 | `test/app`、`test/pages`、`test/services` 等 | `npm run test:*` | 否 |
| 后端单元测试 | 校验后端服务/控制器本地逻辑 | `backend/test/unit` | `npm run test:backend:unit` | 否 |
| 后端轻量集成测试 | 不依赖远程数据库的接口集成回归 | `backend/test/integration` 中非 `*-real.test.js` | `npm run test:backend:integration:memory` | 否 |
| 后端真实 DB 集成测试 | 验证真实数据库链路和云端接口契约 | `backend/test/integration/*-real.test.js` | `npm run test:backend:integration:real` | 手工阻塞闸门 |
| 手工回归 | 验证 UI、动画、真机/开发者工具行为、共享设备视角和同步语义 | 微信开发者工具 / 真机 | 人工执行 | 视里程碑而定 |

---

## 2. 测试命令入口

### 2.1 根目录入口

| 命令 | 用途 |
|------|------|
| `npm test` | 根级稳定闸门 |
| `npm run test:quality` | 前端覆盖率闸门 |
| `npm run test:coverage` | 生成前端覆盖率报告 |
| `npm run test:app` | 运行 `test/app` |
| `npm run test:pages` | 运行 `test/pages` |
| `npm run test:adapters` | 运行 `test/adapters` |
| `npm run test:models` | 运行 `test/models` |
| `npm run test:services` | 运行 `test/services` |
| `npm run test:repositories` | 运行 `test/repositories` |
| `npm run test:backend:unit` | 后端单元测试 |
| `npm run test:backend:integration:memory` | 后端轻量集成测试 |
| `npm run test:backend:integration:real` | 后端真实数据库集成测试 |

### 2.2 backend/ 目录入口

| 命令 | 用途 |
|------|------|
| `npm run test:unit` | 后端单元测试 |
| `npm run test:integration:memory` | 后端轻量集成测试 |
| `npm run test:integration:real` | 后端真实数据库集成测试 |
| `npm run test:coverage` | 后端覆盖率报告 |

### 2.3 推荐使用顺序

1. 日常前端改动：先跑对应目录测试，再跑 `npm test`
2. 涉及高风险前端壳层：补跑 `npm run test:quality`
3. 涉及后端接口逻辑：至少跑后端单元或轻量集成
4. 涉及真实数据库链路、云同步、幂等、家庭权限：补跑真实 DB 集成测试

---

## 3. 覆盖率口径与限制

### 3.1 根级 Jest 覆盖率口径

根 `jest.config.js` 的全局覆盖率阈值为：

| 指标 | 阈值 |
|------|------|
| statements | 70 |
| branches | 70 |
| functions | 70 |
| lines | 70 |

根级覆盖率统计主要覆盖：
- `services/**/*.js`
- `repositories/**/*.js`
- `models/**/*.js`
- `utils/batchUtils.js`
- `utils/dateUtils.js`
- `utils/formatUtils.js`
- `utils/core/**/*.js`

说明：
- 根级 Jest 默认忽略 `backend/test/`
- 根级覆盖率数字不等于“项目整体风险已全部覆盖”

### 3.2 前端覆盖率闸门口径

`npm run test:quality` 使用 `jest.quality.config.js`，重点保护以下文件：

- `app.js`
- `adapters/storage-adapter.js`
- `utils/app/**/*.js`
- `pages/index/index.js`
- `pages/index/modules/**/*.js`
- `pages/rewards/rewards.js`
- `packageMessage/pages/message/message.js`
- `services/task-service.js`
- `services/task-service/**/*.js`

按文件/目录设置的最低阈值：

| 范围 | branches | functions | lines | statements |
|------|----------|-----------|-------|------------|
| `app.js` / `adapters/storage-adapter.js` / `utils/app/**/*.js` | 70 | 75 | 75 | 75 |
| `pages/index/index.js` / `pages/rewards/rewards.js` / `packageMessage/pages/message/message.js` | 65 | 70 | 70 | 70 |
| `pages/index/modules/**/*.js` | 70 | 75 | 75 | 75 |
| `services/task-service.js` / `services/task-service/**/*.js` | 70 | 80 | 80 | 80 |

### 3.3 口径解读

- 覆盖率是质量信号，不是替代手工回归的证据
- 页面层测试主要保护关键行为和契约，不追求 UI 细节全自动化
- 真机差异、动画表现、共享设备交互和多端同步时序仍需要人工确认

---

## 4. 手工回归原则

以下场景应优先安排手工回归：

- 首页、奖池页、消息页、用户切换等关键页面交互发生变化
- 共享设备下“登录用户”和“当前视角用户”语义发生变化
- 任务、星星、奖励、消息四域联动流程发生变化
- 云同步、幂等、家庭权限、历史数据兼容逻辑发生变化
- 开发者工具/真机表现可能影响用户理解时

手工回归关注点：

- 页面主路径是否正确
- 文案与角色权限是否一致
- 同步失败时是否有合理降级
- 真机/开发者工具下是否存在 UI 或时序异常

---

## 5. 常见问题与相关文档

### 5.1 我应该先看哪份文档？

- 想知道测试怎么分层、怎么跑：看本文件
- 想知道测试该怎么写：看 [coding_standards.md](./coding_standards.md#测试规范)
- 想知道后端真实数据库测试怎么准备环境：看 [backend/test/README.md](../../backend/test/README.md)
- 想知道功能开发阶段的测试要求：看 [workflow.md](./workflow.md)

### 5.2 为什么不能只看覆盖率？

因为当前项目已经进入多角色、多设备、云同步阶段，很多高风险问题属于：
- 权限语义
- 页面壳层行为
- 真机/开发者工具差异
- 云端链路与幂等时序

这些问题不能仅依赖覆盖率数字判断。

### 5.3 后端真实数据库集成测试什么时候必须跑？

当变更涉及以下任一情况时，应优先考虑：
- 新增/修改后端 REST 接口
- 真实数据库 schema、迁移脚本或查询语义变化
- 家庭权限、跨家庭隔离、幂等、软删除等后端契约变化
- 前端云同步链路依赖后端行为变化

---

## 相关文档

- [开发流程](./workflow.md)
- [编码规范](./coding_standards.md)
- [后端 REST API 契约](../api/backend-rest-api.md)
- [后端测试说明](../../backend/test/README.md)
