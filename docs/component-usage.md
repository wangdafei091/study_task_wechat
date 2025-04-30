# 组件使用清单

本文档记录了项目中所有组件的用途和使用场景，帮助开发人员快速理解组件关系。

## 任务相关组件

### taskItem 组件 (index-task-item)
- **路径**: `/components/taskItem/taskItem`
- **用途**: 展示任务列表项，提供任务完成状态切换和编辑功能
- **使用页面**:
  - `pages/index/index.wxml` (首页任务列表和搜索结果)
- **不用于**:
  - 任务编辑页面 (pages/task-edit)
  - 任务热力图组件内部
- **注意**: 首页使用此组件时，应使用 `index-task-item` 作为标签名，以明确其用途

### task-heatmap 组件
- **路径**: `/components/task-heatmap/task-heatmap`
- **用途**: 展示任务分布热力图，支持月份导航、日期选择和任务操作
- **使用页面**:
  - `pages/task-edit/task-edit.wxml` (任务编辑页面)
- **特性**:
  - 内部实现了自己的任务项展示和任务操作逻辑
  - 不依赖 taskItem 组件
  - 包含独立的任务编辑、删除功能
- **说明**: 热力图组件中的任务列表实现与首页的任务列表实现是独立的，二者不共享组件

### date-picker 组件
- **路径**: `/components/date-picker/date-picker`
- **用途**: 日期选择器
- **使用页面**:
  - `pages/task-edit/task-edit.wxml` (任务编辑页面)
- **功能**: 提供日期选择，支持年月导航和日期点击选择

## UI通用组件

### card 组件
- **路径**: `/components/card/card`
- **用途**: 提供卡片式UI容器
- **使用页面**:
  - `pages/task-edit/task-edit.wxml` (任务编辑页面)
  - 其他页面
- **功能**: 卡片容器，支持标题、内容和自定义样式

### progressRing 组件
- **路径**: `/components/progressRing/progressRing`
- **用途**: 环形进度指示器
- **使用页面**:
  - `pages/index/index.wxml` (首页)
- **功能**: 展示不同类型任务的完成进度

### progressBar 组件
- **路径**: `/components/progressBar/progressBar`
- **用途**: 线性进度条
- **使用页面**:
  - `pages/index/index.wxml` (首页奖励进度)
- **功能**: 展示进度信息，支持渐变色和动画效果

### upcomingTask 组件
- **路径**: `/components/upcomingTask/upcomingTask`
- **用途**: 即将到期任务提醒
- **使用页面**:
  - `pages/index/index.wxml` (首页)
- **功能**: 显示即将到期的任务提醒

### float-menu 组件
- **路径**: `/components/float-menu/float-menu`
- **用途**: 浮动菜单
- **使用页面**:
  - `pages/index/index.wxml` (首页)
- **功能**: 提供浮动的操作菜单，通常用于添加任务

## 组件关系说明

1. **任务展示与操作的不同实现**:
   - 首页使用 `taskItem` 组件展示任务并提供基本操作
   - 任务编辑页面中的热力图使用内置实现展示任务并提供完整操作
   - 两者功能相似但实现独立，不共享组件代码

2. **命名约定**:
   - `index-task-item`: 首页中使用的任务项组件
   - `task-heatmap`: 任务编辑页面中使用的热力图组件

3. **场景区分**:
   - 组件通过 `scene` 属性区分使用场景
   - 任务热力图默认场景为 `task-edit`

## 最佳实践

1. 使用组件时应遵循其设计用途，不混用不同页面的组件
2. 修改组件时注意其影响范围
3. 添加新组件时更新本文档 