# 当前工作上下文

## 最近更新

### 文档系统优化（已完成）
- 对整个文档体系进行了全面梳理和优化
- 清理了冗余和过时文件，删除了引用不存在工具的文档
- 更新了 `.cursor/rules` 文件中的各项指南，与实际代码一致
- 创建了新的 `services-guide.md` 文档，详细说明领域服务使用方法
- 更新了 `components_guide.mdc` 以匹配实际组件结构
- 更新了 `utils_guide.mdc` 以反映当前工具函数

### 架构迁移状态明确
- 确认项目已完成从传统架构到DDD架构的迁移
- 完成了所有核心服务的迁移：TaskService, StarService, MessageService, RewardService
- 创建了 `new_architecture_guide.md` 文档，提供新架构的开发指南
- 清晰记录了迁移完成的内容和当前架构状态

### Cursor记忆系统完善
- 更新了所有Memory Bank核心文件，包括activeContext、systemPatterns和techContext
- 记录了当前项目的架构状态、技术栈和开发规范
- 确保了Cursor记忆系统能准确理解当前项目状态

## 当前关注点

1. **文档一致性**
   - 所有文档已与实际代码保持一致
   - 统一了日志和批处理等工具的使用方法
   - 明确了 `.cursor/rules` 和 `docs/` 目录的文档关系

2. **新架构应用**
   - DDD架构已完全实施在核心领域：任务、星星、奖励、消息
   - 服务管理器提供统一的服务访问方式
   - 页面和组件通过服务访问业务逻辑，不直接操作数据

3. **代码优化**
   - 使用批量处理机制减少UI阻塞
   - 优化存储操作，通过存储适配器层访问
   - 实现延迟加载和异步处理

4. **UI一致性**
   - 统一的视觉设计和交互模式
   - 遵循预定义的颜色变量和组件样式
   - 卡片、按钮等元素保持一致的样式规范

## 当前项目核心组件

1. **领域模型**
   - Task: 任务模型
   - Star: 星星模型
   - StarGroup: 星星分组模型
   - Reward: 奖励模型
   - Message: 消息模型

2. **领域服务**
   - TaskService: 任务服务
   - StarService: 星星服务
   - RewardService: 奖励服务
   - MessageService: 消息服务

3. **仓储层**
   - BaseRepository: 基础仓储
   - TaskRepository: 任务仓储
   - StarRepository: 星星仓储
   - RewardRepository: 奖励仓储
   - MessageRepository: 消息仓储

4. **适配器层**
   - StorageAdapter: 存储适配器

5. **核心工具**
   - serviceManager: 服务管理器
   - logger: 日志工具
   - batchUtils: 批量处理工具
   - EventBus: 事件总线

## 近期计划

1. **性能优化**
   - 进一步优化批量处理和存储机制
   - 改进大列表渲染性能
   - 实现数据缓存策略

2. **功能增强**
   - 改进星星积分有效期管理
   - 增强任务提醒和通知功能
   - 完善任务统计和分析功能

3. **测试加强**
   - 增加核心业务逻辑的单元测试
   - 实现关键流程的集成测试
   - 提高测试覆盖率

4. **文档维护**
   - 保持文档与代码同步更新
   - 继续完善API文档和开发指南
   - 为新功能添加详细文档 