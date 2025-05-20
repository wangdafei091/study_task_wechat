# 文档管理规则

## 文档位置

所有项目文档必须统一存放在项目根目录的 `docs/` 文件夹下，按照以下分类组织：

```
docs/
├── architecture/       # 架构文档
│   ├── project_structure.md    # 项目结构
│   ├── data_models.md          # 数据模型
│   ├── system_architecture.md  # 系统架构
│   ├── star_points_system.md   # 星星有效期与消费机制
│   └── optimization_summary.md # 优化总结
├── development/       # 开发指南
│   ├── workflow.md             # 开发工作流程
│   ├── coding_standards.md     # 编码规范
│   ├── troubleshooting.md      # 常见问题解决
│   └── CHANGELOG.md            # 更新日志
├── api/               # API文档
│   └── utils_guide.md          # 工具函数指南
├── user/              # 用户手册
│   ├── guide.md                # 用户指南
│   └── faq.md                  # 常见问题解答
└── README.md          # 项目总览
```

## 命名规则

- 文档文件使用小写字母和连字符命名，如 `project-structure.md`
- 每个文档应有明确的标题和简要描述
- 文档内部使用Markdown格式，保持格式一致性

## 文档更新流程

**重要事项**：代码修改不会自动更新文档，需要开发者手动维护。

在以下情况下，必须更新相关文档：

1. **修改代码功能时**：
   - 检查并更新受影响功能的文档
   - 如果修改了API，更新对应的API文档
   - 如果添加了新功能，创建对应的文档

2. **添加新组件或工具函数时**：
   - 在对应指南中添加新组件或函数的说明
   - 包含使用示例和参数说明

3. **修复问题时**：
   - 如果问题与文档描述不符，更新文档
   - 考虑在故障排除指南中添加相关问题的解决方案

## 文档审核与清理

- 定期（每季度）对文档进行审核，确保文档与代码一致
- 移除过时的文档内容，确保文档的准确性
- 文档内容发生重大变更时，在团队中进行通知

## 新功能文档要求

添加新功能时，文档应包含：

1. 功能概述（解决什么问题，提供什么价值）
2. 使用方法（配置选项，API参数等）
3. 示例代码
4. 注意事项和限制
5. 与其他功能的交互

## 日志规范

日志相关的文档应明确说明：

1. 何时添加日志记录
2. 如何格式化日志消息
3. 不同级别日志的使用场景
4. 避免冗余日志的规则

### 日志记录格式

使用 `logger` 工具统一格式，遵循以下格式：

```javascript
const logger = require('../../utils/logger');

// 记录普通信息
logger.log('componentName', '操作描述', 变量);

// 记录流程节点信息
logger.info('componentName', '重要流程点', 变量);

// 记录警告信息
logger.warn('componentName', '警告描述', 变量);

// 记录错误信息 
logger.error('componentName', '错误描述', 错误对象);
```

### 日志记录要点

1. **关键点必须添加日志**：
   - 任务创建、编辑、删除和状态变更
   - 重要数据的读取和存储操作
   - 页面重要生命周期事件
   - 用户关键操作
   - 异步操作的开始和结束
   - 所有积分计算和有效期处理过程

2. **日志内容要求**：
   - 保持简洁明了，包含必要信息
   - 对象日志使用精简版，仅记录关键字段
   - 记录操作类型、对象ID和关键参数
   - 错误日志需包含错误详情和上下文
   - 批量处理操作记录当前进度

3. **避免过度日志**：
   - 不记录频繁重复的常规操作
   - 不记录大量无关紧要的信息
   - 循环中谨慎使用日志
   - 过大对象使用精简版记录关键属性

## UI规范文档要求

UI规范相关文档应包含以下内容：

### UI一致性规则

- **卡片组件**：统一边距、圆角和阴影
  - 卡片内边距：30rpx
  - 卡片容器圆角：16rpx
- **按钮样式**：统一高度(90rpx)和交互效果
  - 功能按钮圆角：8rpx
  - 元素间距：12rpx/24rpx
- **颜色系统**：遵循预定义的颜色变量
  - 学习任务：#4285F4（蓝色）
  - 习惯任务：#4CAF50（绿色）
  - 兴趣任务：#FF9800（橙色）
- **字体系统**：遵循统一的字体大小和粗细规范
  - 标题文字：32rpx，字重500-600
  - 正文文字：28rpx，字重400
  - 辅助文字：24rpx，字重400

## 批量处理机制文档要求

批量处理相关文档应包含以下内容：

### 存储批量操作

- 合并多个setStorage操作
- 使用数据缓冲区，定期批量提交
- 避免频繁的存储操作

### 任务批量处理

- 大量任务状态更新使用批处理
- 批量创建重复任务时分批执行
- 使用异步操作避免UI阻塞

### 批处理实现方式

```javascript
// 批量处理示例
function batchProcess(items, processFn, batchSize = 50) {
  console.info(`[batchProcess] 开始批处理: ${items.length}项`);
  let index = 0;
  
  function processNextBatch() {
    const batch = items.slice(index, index + batchSize);
    if (batch.length === 0) {
      console.info(`[batchProcess] 批处理完成`);
      return;
    }
    
    console.log(`[batchProcess] 处理批次: ${index/batchSize + 1}, 项数: ${batch.length}`);
    batch.forEach(processFn);
    
    index += batchSize;
    setTimeout(processNextBatch, 0);
  }
  
  processNextBatch();
}
``` 