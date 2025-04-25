# .cursor/rules 目录清理建议和使用指南

## 当前情况分析

经过检查，.cursor/rules 目录中存在以下问题：

1. **文件名重复**：存在相似文件名但内容重叠的文件
   - `project-structure.mdc` 和 `project_structure.mdc`
   - `development_workflow.mdc` 和 `development_patterns.mdc`
   - `system_architecture.md` 和 `systemPatterns.md`

2. **内容重叠**：多个文件之间存在内容重叠和重复

3. **格式不一致**：有些文件使用 `.mdc` 后缀，有些使用 `.md` 后缀

4. **MemoryBank 系统文件与项目规则混合**：系统性文件与项目规则混在一起

## 清理建议

### 1. 删除冗余文件

建议删除以下重复文件：
- `project-structure.mdc`（保留更详细的 `project_structure.mdc`）
- `development_patterns.mdc`（将其有用内容合并到 `development_workflow.mdc`）
- `system_architecture.md`（将其独特内容合并到 `systemPatterns.md`）
- 如有其他类似重复内容的文件

### 2. 统一文件命名和格式

- 统一使用 `.md` 后缀（或者 `.mdc` 后缀，二选一）
- 统一使用下划线命名法（如 `project_structure.md`）或者短横线命名法（如 `project-structure.md`）
- 建议将所有 MemoryBank 相关文件（如 activeContext.md、progress.md 等）放入单独的子目录

### 3. 整合和重构文件内容

- 将 `utils_guide.mdc` 中的内容按照功能分类整合
- 将组件文档和架构文档分开
- 确保每个文件有明确的职责，避免内容交叉

## 推荐的目录结构

```
.cursor/rules/
├── memory-bank/           # Cursor MemoryBank 相关文件
│   ├── activeContext.md
│   ├── MemoryBank.md
│   ├── productContext.md
│   ├── progress.md
│   ├── projectbrief.md
│   ├── systemPatterns.md
│   └── techContext.md
├── project/               # 项目相关规则
│   ├── project_structure.md
│   ├── components_guide.md
│   ├── utils_guide.md
│   ├── task_data_model.md
│   └── development_workflow.md
└── system/                # 系统架构和优化规则
    ├── optimization_summary.md
    └── system_architecture.md
```

## .cursor/rules 正确使用指南

### 什么是 .cursor/rules

.cursor/rules 目录是 Cursor 用于存储项目规则和指南的专用目录。这些规则文件包含项目结构、开发规范、组件和工具使用说明等信息，可以帮助 Cursor 更好地理解项目并提供更准确的代码编辑和补全建议。

### 规则文件类型

规则文件可以分为几个主要类别：

1. **项目结构说明**：描述项目的目录结构和文件组织
2. **开发规范**：定义代码风格、命名规范和最佳实践
3. **组件使用指南**：描述自定义组件的用法和参数
4. **工具函数指南**：介绍各种工具函数的功能和使用方法
5. **数据模型说明**：定义项目中使用的数据结构和格式
6. **系统架构**：描述整体系统架构和组件关系
7. **MemoryBank文件**：用于Cursor的上下文记忆功能

### 如何编写有效的规则文件

1. **明确主题和范围**：每个文件应该有明确的主题和内容范围
2. **使用标准Markdown格式**：遵循Markdown语法，使用适当的标题层级
3. **添加代码示例**：使用代码块提供实际示例
4. **使用链接**：添加文件链接，方便跳转到相关代码
5. **保持简洁**：内容应该简洁明了，避免不必要的重复
6. **定期更新**：随着项目发展更新规则文件

### 使用规则文件的最佳实践

1. **一致性**：保持文件命名和格式的一致性
2. **避免重复**：不同文件间避免内容重复
3. **分类组织**：按照功能或主题组织文件
4. **重点突出**：突出项目中的关键模式和规范
5. **定期审查**：定期检查和清理规则文件

### 规则文件编写示例

一个好的规则文件应该包含：

```markdown
# 组件名称

简短的描述和用途。

## 使用示例

```html
<component-name prop1="value1" prop2="value2"></component-name>
```

## 属性说明

| 属性名 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| prop1 | String | "" | 属性1的作用 |
| prop2 | Number | 0 | 属性2的作用 |

## 事件

| 事件名 | 参数 | 说明 |
|-------|------|------|
| event1 | {value: String} | 事件1的触发条件和用途 |

## 方法

| 方法名 | 参数 | 返回值 | 说明 |
|-------|------|-------|------|
| method1 | (param: String) | Boolean | 方法1的功能描述 |
```

### 使用 MemoryBank 系统

Cursor 的 MemoryBank 系统是一种特殊的规则文件集合，用于帮助 Cursor 在会话之间保持上下文记忆。它包含以下核心文件：

1. **projectbrief.md**：项目概述和基础信息
2. **productContext.md**：产品背景和目标
3. **activeContext.md**：当前工作重点和进展
4. **systemPatterns.md**：系统架构和设计模式
5. **techContext.md**：技术框架和环境
6. **progress.md**：进度跟踪和待办事项

MemoryBank 文件应定期更新，以反映项目的最新状态和方向。建议使用"update memory bank"命令触发 Cursor 对这些文件进行全面审查。

## 总结

通过清理冗余文件和优化目录结构，可以使 .cursor/rules 目录更加清晰和有效。正确使用规则文件将帮助 Cursor 更好地理解项目，提供更准确的代码编辑和补全建议。建议定期审查和更新规则文件，确保它们与项目的最新状态保持一致。 