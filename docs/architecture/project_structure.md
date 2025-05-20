# 项目结构

本文档描述了学习任务微信小程序的项目结构和文件关系。

## 核心文件

- `app.js` - 小程序入口文件，包含全局事件总线、全局数据和初始化逻辑
- `app.json` - 小程序配置文件，定义了页面路径、窗口样式和底部导航栏
- `app.wxss` - 全局样式文件
- `project.config.json` - 项目配置文件，包含编译设置和开发者工具配置

## 主要页面目录

- `pages/index/` - 主页（任务日历）
- `pages/task/` - 任务详情页面
- `pages/task-edit/` - 任务编辑页面
- `pages/rewards/` - 奖池页面
- `pages/message/` - 消息中心页面
- `pages/history/` - 历史记录页面

## 组件目录

- `components/` - 可复用组件
  - `components/progressRing/` - 环形进度条组件
  - `components/progressBar/` - 进度条组件
  - `components/task-heatmap/` - 任务热力图组件
  - `components/taskItem/` - 任务项组件
  - `components/upcomingTask/` - 即将到期任务组件
  - `components/card/` - 卡片容器组件
  - `components/float-menu/` - 浮动菜单组件
  - `components/template-selector/` - 模板选择器组件

## 工具函数目录

- `utils/` - 包含各种工具类
  - `utils/taskManager.js` - 任务管理工具
  - `utils/messageManager.js` - 消息管理工具
  - `utils/dateUtils.js` - 日期处理工具
  - `utils/taskUtils.js` - 任务处理工具
  - `utils/uiUtils.js` - UI相关工具函数
  - `utils/unit.js` - 单位换算工具
  - `utils/feedbackUtils.js` - 用户反馈处理工具
  - `utils/stateManager.js` - 状态管理工具

## 样式目录

- `styles/` - 共享样式文件
  - `styles/variables.wxss` - 样式变量定义
  - `styles/common.wxss` - 通用样式类
  - `styles/animation.wxss` - 动画相关样式

## 静态资源目录

- `assets/` - 图片、图标等静态资源
  - `assets/icons/` - 图标文件
  - `assets/images/` - 图片文件
  - `assets/animations/` - 动画资源

## 文档目录

- `docs/` - 项目文档
  - `docs/architecture/` - 架构文档
  - `docs/development/` - 开发指南
  - `docs/api/` - API文档
  - `docs/user/` - 用户手册

## 核心文件关系图

```
app.js ────────┐
               ▼
         全局事件总线 ─────────┐
               │               │
        全局状态/配置 ◄────────┤
               │               │
               ▼               │
pages/ ◄── components/ ◄── utils/
  │          │
  │          ▼
  └───► 页面组件交互
```

## 主要数据流

1. **任务数据流**:
   ```
   taskManager.js ──> 本地存储 ──> 页面/组件展示
        ▲                             │
        │                             │
        └─────────── 用户操作 ◄───────┘
   ```

2. **消息通知流**:
   ```
   事件触发 ──> messageManager.js ──> 消息存储
                      │
                      ▼
               消息中心/通知展示
   ```

3. **主题和样式**:
   ```
   variables.wxss ──> app.wxss ──> 页面/组件样式
   ``` 