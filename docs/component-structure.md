# 组件目录结构说明

本文档说明了项目组件的目录结构和组织方式，帮助开发者快速了解组件之间的关系。

## 当前目录结构

```
components/
├── card/                     # 卡片容器组件
├── date-picker/              # 日期选择组件
├── float-menu/               # 浮动菜单组件
├── progressBar/              # 进度条组件
├── progressRing/             # 环形进度组件
├── task-heatmap/             # 任务热力图组件
├── taskItem/                 # 任务列表项组件 (用于首页)
└── upcomingTask/             # 即将到期任务组件
```

## 组件分类

### 任务相关组件
- **taskItem**: 任务列表项组件 (首页专用)
- **task-heatmap**: 任务热力图组件 (任务编辑页面专用)
- **upcomingTask**: 即将到期任务提醒组件

### UI通用组件
- **card**: 卡片容器组件
- **progressBar**: 进度条组件
- **progressRing**: 环形进度组件
- **float-menu**: 浮动菜单组件
- **date-picker**: 日期选择组件

## 组件命名规范

- **基础UI组件**: 使用全小写或连字符命名 (例如: card, progress-bar)
- **业务组件**: 使用小驼峰或连字符命名 (例如: taskItem, task-heatmap)
- **页面特定组件**: 使用前缀标明使用页面 (例如: index-task-item)

## 组件依赖关系

- **task-heatmap**: 独立实现任务展示和操作，不依赖taskItem
- **index页面**: 依赖taskItem展示任务
- **task-edit页面**: 依赖task-heatmap、card和date-picker组件

## 改进建议

为提高代码清晰度，可考虑按以下方式调整组件结构:

```
components/
├── ui/                       # UI基础组件
│   ├── card/
│   ├── progress-bar/
│   ├── progress-ring/
│   └── date-picker/
├── task/                     # 任务相关组件
│   ├── task-list-item/       # 原taskItem
│   ├── task-heatmap/
│   └── upcoming-task/
└── common/                   # 其他通用组件
    └── float-menu/
```

这种结构更清晰地表达了组件的用途和分类，降低了混淆的可能性。 