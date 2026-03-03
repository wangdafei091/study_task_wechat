# 更新日志

记录学习任务微信小程序的功能更新、bug修复和重要变更。

---

## [3.3.0] - 2026-03-03

### 代码清理
- **删除未使用代码**：删除完全未使用的 utils/unit.js 文件
  - 删除 app.js 中的导入语句
  - 更新 architecture.md 中的引用说明
- **清理调试输出**：删除生产环境的 console 调试输出
  - 清理 pages/index/index.js 中的用户模块验证调试输出
  - 优化 packageChart/index.js，只在开发环境输出性能日志
- **删除注释代码**：删除注释掉的废弃代码
  - 清理 services/reward-service.js 中的静态初始化锁注释
  - 清理 app.js 中的定时检查注释代码
  - 清理 utils/deviceInfo.js 中的 logger 导入注释
- **清理过时标记**：更新 docs/development/coding_standards.md
  - 删除已实现的 TODO: 添加惩罚通知（已通过 EventBus 实现）
  - 删除已实现的 FIXME: 固定惩罚金额（已改为可配置）

### 文档
- **ROADMAP更新**：创建代码清理里程碑规划
  - 里程碑-01：代码清理（已完成）
  - 里程碑-02：文档修复（待启动）
  - 里程碑-03：重构重复代码（待启动）
  - 里程碑-04：测试核心逻辑（待启动）

### 文档
- **API文档修正**：修正 services-guide.md 中的方法名称错误
  - StarService: `getStarBalance()` → `getTotalStars()`
  - 修正方法返回值描述
- **仓储文档完善**：完善 repositories.md 中的方法描述
  - 修正 TaskRepository 方法名：`findByDate()` → `getTasksByDate()`
  - 修正 StarGroupRepository 方法名：`addStarsToGroup(userId, amount, expiryDate, sourceId)` → `addStarsToGroup(group, points, source)`
  - 修正 StarRecordRepository 方法名：`findByType(userId, type)` → `getRecordsByType(type, userId = null)`
  - 添加详细的参数和返回值说明

---

## [3.2.0] - 2026-03-02

### 新增
- **测试环境优化**：完善Jest测试环境配置，添加微信API mock支持
  - 在`jest-setup.js`中添加wx对象的完整mock
  - 支持getDeviceInfo、getWindowInfo、getAppBaseInfo等关键API
  - 解决测试环境中wx未定义的问题
  - 添加StorageAdapter的mock实现，支持本地存储操作
  - 添加logger的mock实现，支持日志记录功能
  - 所有测试（364个测试用例）稳定通过
  - 支持设备信息、窗口信息、系统信息的mock
  - 支持wx.request等网络API的mock

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
  - `checkTasksStatus()`：检查过期任务和必做任务，自动执行惩罚
  - `handleRequiredTaskPenalty()`：处理必做任务惩罚，扣除相应星星
  - 必做任务未完成时自动扣除星星，并通过EventBus触发惩罚通知
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
