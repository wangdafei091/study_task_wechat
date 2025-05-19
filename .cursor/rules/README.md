# 学习任务微信小程序文档索引

本目录包含学习任务微信小程序的文档和开发指南，按照不同分类组织。

## 文档结构

```
.cursor/rules/
├── README.md                 # 文档索引(当前文件)
├── system/                   # 系统架构和优化文档
│   ├── system_architecture.md # 系统架构文档
│   ├── optimization_summary.md # 优化内容总结
│   └── star_points_system.md # 星星有效期与消费机制文档
├── project/                  # 项目具体功能文档
│   ├── project_structure.mdc # 项目结构文档
│   ├── development_workflow.mdc # 开发工作流程文档
│   ├── task_data_model.mdc   # 任务数据模型文档
│   ├── components_guide.mdc  # 组件使用指南
│   └── utils_guide.mdc       # 工具函数使用指南
└── memory-bank/              # 项目记忆库文件
    ├── MemoryBank.mdc        # 记忆库说明文档
    ├── projectbrief.md       # 项目简介
    ├── productContext.md     # 产品上下文
    ├── techContext.md        # 技术上下文
    ├── systemPatterns.md     # 系统设计模式
    ├── activeContext.md      # 当前活动上下文
    └── progress.md           # 项目进度
```

## 核心文档

### 系统文档
- [系统架构](system/system_architecture.md) - 系统整体架构设计
- [优化内容总结](system/optimization_summary.md) - 系统优化和性能改进总结
- [星星有效期与消费机制](system/star_points_system.md) - 详细介绍星星有效期计算和"先过期先使用"的消费策略

### 项目文档
- [项目结构](project/project_structure.mdc) - 项目目录结构和文件关系
- [开发工作流程](project/development_workflow.mdc) - 开发规范和工作流程
- [任务数据模型](project/task_data_model.mdc) - 任务数据结构和处理逻辑
- [组件使用指南](project/components_guide.mdc) - 项目组件功能和使用方法
- [工具函数使用指南](project/utils_guide.mdc) - 工具函数用途和使用示例

### 记忆库文档
- [记忆库说明](memory-bank/MemoryBank.mdc) - 记忆库功能和使用说明
- [项目简介](memory-bank/projectbrief.md) - 项目基本概述和目标
- [产品上下文](memory-bank/productContext.md) - 产品需求和用户场景
- [技术上下文](memory-bank/techContext.md) - 技术选型和实现方案
- [系统设计模式](memory-bank/systemPatterns.md) - 项目使用的设计模式和架构
- [当前活动上下文](memory-bank/activeContext.md) - 当前开发焦点和最新进展
- [项目进度](memory-bank/progress.md) - 项目完成情况和待办事项

## 最新更新

| 日期 | 文档 | 内容 |
|------|------|------|
| 2024-08-10 | [星星有效期与消费机制](system/star_points_system.md) | 新增文档，详细介绍星星有效期和消费机制的实现 |
| 2024-08-10 | [任务数据模型](project/task_data_model.mdc) | 更新文档，添加星星分组数据模型和消费策略 |
| 2024-08-10 | [当前活动上下文](memory-bank/activeContext.md) | 更新文档，添加星星有效期和消费机制的最新实现信息 |
| 2024-08-10 | [项目进度](memory-bank/progress.md) | 更新文档，添加星星有效期和消费机制的实现进度 |
| 2024-07-25 | [系统架构](system/system_architecture.md) | 更新核心架构和数据流转图 |
| 2024-07-25 | [工具函数使用指南](project/utils_guide.mdc) | 更新文档，添加新增工具类和函数说明 |
| 2024-07-25 | [优化内容总结](system/optimization_summary.md) | 更新日期计算和批量处理优化总结 |

## 文档使用说明

1. **项目开发参考**：开发新功能前，先查阅相关文档了解项目架构和模式
2. **代码规范遵循**：按照[开发工作流程](project/development_workflow.mdc)中的规范编写代码
3. **组件和工具使用**：使用组件和工具函数前参考对应指南文档
4. **功能实现参考**：实现类似功能时参考已有实现，如[星星有效期与消费机制](system/star_points_system.md)
5. **项目进度跟踪**：查看[项目进度](memory-bank/progress.md)了解当前完成情况和优先级

## 文档维护规则

1. 每次重大功能更新后，及时更新相关文档
2. 核心架构变更需要同步更新系统文档
3. 新增组件或工具函数需要在对应指南中添加说明
4. 清理过时或冗余文档，保持文档整洁
5. 文档更新后，在本索引中添加更新记录 