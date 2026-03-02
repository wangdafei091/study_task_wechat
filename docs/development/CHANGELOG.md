# 更新日志

记录学习任务微信小程序的功能更新、bug修复和重要变更。

---

## [3.2.0] - 2026-03-02

### 新增
- **测试环境优化**：完善Jest测试环境配置，添加微信API mock支持
  - 在`jest-setup.js`中添加wx对象的完整mock
  - 支持getDeviceInfo、getWindowInfo、getAppBaseInfo等关键API
  - 解决测试环境中wx未定义的问题
  - 所有测试（364个测试用例）稳定通过

### 修复
- **测试环境问题**：修复deviceInfo模块在测试环境中的错误
  - 解决`wx is not defined`错误
  - 提供默认的设备信息和窗口信息

### 文档
- **更新日志**：初始化CHANGELOG.md文档，记录项目更新历史

---

## [3.1.0] - 2026-02-27

### 新增
- **单元测试体系**：建立完整的Jest单元测试框架
  - 配置Jest测试环境和运行脚本
  - 实现领域模型测试（Task模型）
  - 实现应用服务测试（TaskService、StarService、RewardService、MessageService）
  - 实现工具函数测试（dateUtils、formatUtils）
  - 创建Mock存储适配器和全局logger mock
  - 测试覆盖率脚本配置

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
  - 领域层：Task、Star、StarGroup、Reward、Message、User模型
  - 应用服务层：TaskService、StarService、RewardService、MessageService、UserService
  - 基础设施层：StorageAdapter、各类Repository
  - ServiceManager统一服务管理
  - EventBus事件驱动通信

### 新增
- **任务管理**：完整的任务CRUD、状态管理、必做任务惩罚
- **星星积分系统**：星星获取、分组、FIFO消费策略、过期处理
- **奖励兑换**：奖励管理、库存管理、兑换流程、状态跟踪
- **消息通知**：系统消息、任务提醒、奖励通知、过期预警
- **数据分析**：任务分布、完成情况、星星趋势、用户行为分析
- **多用户支持**：家长和小朋友角色切换

### 优化
- **性能优化**：批量处理机制、多级缓存、事件聚合
- **分包加载**：主包、packageChart、packageManage、packageMessage
- **适配性**：单位转换、屏幕适配、字体缩放

### 修复
- **扣星问题**：修复星星扣减延迟和重复扣分问题
- **过期保护**：修复过期星星的奖励保护功能
- **用户切换**：打通家长和小朋友用户切换功能

---

## 版本号规则

- **主版本号**：重大架构变更或不兼容修改
- **次版本号**：新增功能或重要改进
- **修订号**：Bug修复或小改进

---

**最后更新**：2026-03-02
