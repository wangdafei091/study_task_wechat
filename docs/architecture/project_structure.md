# 微信小程序项目结构

这是一个学习任务微信小程序，用于帮助小朋友养成良好学习习惯的任务管理工具。

## 核心文件
- [app.js](mdc:app.js) - 小程序入口文件，包含全局事件总线、全局数据和初始化逻辑
- [app.json](mdc:app.json) - 小程序配置文件，定义了页面路径、窗口样式和底部导航栏
- [app.wxss](mdc:app.wxss) - 全局样式文件
- [project.config.json](mdc:project.config.json) - 项目配置文件，包含编译设置和开发者工具配置

## 主要页面目录
- [pages/index/](mdc:pages/index) - 主页（任务日历）
- [pages/task/](mdc:pages/task) - 任务详情页面
- [pages/task-edit/](mdc:pages/task-edit) - 任务编辑页面
- [pages/rewards/](mdc:pages/rewards) - 奖池页面
- [pages/message/](mdc:pages/message) - 消息中心页面
- [pages/reward-manage/](mdc:pages/reward-manage) - 奖励管理页面
- [pages/my-exchanges/](mdc:pages/my-exchanges) - 我的兑换记录页面
- [pages/star-records/](mdc:pages/star-records) - 星星记录页面

## 组件目录
- [components/](mdc:components) - 可复用组件
  - [components/progressRing/](mdc:components/progressRing) - 环形进度条组件
  - [components/progressBar/](mdc:components/progressBar) - 进度条组件
  - [components/task-heatmap/](mdc:components/task-heatmap) - 任务热力图组件
  - [components/index-task-item/](mdc:components/index-task-item) - 主页任务项组件
  - [components/upcomingTask/](mdc:components/upcomingTask) - 即将到期任务组件
  - [components/card/](mdc:components/card) - 卡片容器组件
  - [components/float-menu/](mdc:components/float-menu) - 浮动菜单组件
  - [components/date-picker/](mdc:components/date-picker) - 日期选择器组件
  - [components/star-calendar/](mdc:components/star-calendar) - 星星日历组件

## 领域服务目录
- [services/](mdc:services) - 领域服务层
  - [services/task-service.js](mdc:services/task-service.js) - 任务领域服务
  - [services/star-service.js](mdc:services/star-service.js) - 星星领域服务
  - [services/reward-service.js](mdc:services/reward-service.js) - 奖励领域服务
  - [services/message-service.js](mdc:services/message-service.js) - 消息领域服务
  - [services/index.js](mdc:services/index.js) - 服务导出入口

## 领域数据存储
- [repositories/](mdc:repositories) - 领域仓储层
  - [repositories/task-repository.js](mdc:repositories/task-repository.js) - 任务数据仓储
  - [repositories/star-repository.js](mdc:repositories/star-repository.js) - 星星数据仓储
  - [repositories/star-group-repository.js](mdc:repositories/star-group-repository.js) - 星星分组数据仓储
  - [repositories/star-record-repository.js](mdc:repositories/star-record-repository.js) - 星星记录数据仓储
  - [repositories/reward-repository.js](mdc:repositories/reward-repository.js) - 奖励数据仓储
  - [repositories/message-repository.js](mdc:repositories/message-repository.js) - 消息数据仓储
  - [repositories/base-repository.js](mdc:repositories/base-repository.js) - 基础仓储类
  - [repositories/index.js](mdc:repositories/index.js) - 仓储导出入口

## 领域模型
- [models/](mdc:models) - 领域模型
  - [models/task.js](mdc:models/task.js) - 任务领域模型
  - [models/reward.js](mdc:models/reward.js) - 奖励领域模型
  - [models/star.js](mdc:models/star.js) - 星星领域模型
  - [models/star-group.js](mdc:models/star-group.js) - 星星分组模型
  - [models/star-record.js](mdc:models/star-record.js) - 星星记录模型
  - [models/message.js](mdc:models/message.js) - 消息领域模型
  - [models/index.js](mdc:models/index.js) - 模型导出入口

## 适配器目录
- [adapters/](mdc:adapters) - 适配器
  - [adapters/storage-adapter.js](mdc:adapters/storage-adapter.js) - 存储适配器

## 工具函数目录
- [utils/](mdc:utils) - 包含各种工具类
  - [utils/serviceManager.js](mdc:utils/serviceManager.js) - 服务管理器
  - [utils/analyticsManager.js](mdc:utils/analyticsManager.js) - 数据分析管理工具
  - [utils/dateUtils.js](mdc:utils/dateUtils.js) - 日期处理工具
  - [utils/taskUtils.js](mdc:utils/taskUtils.js) - 任务处理工具
  - [utils/uiUtils.js](mdc:utils/uiUtils.js) - UI相关工具函数
  - [utils/unit.js](mdc:utils/unit.js) - 单位换算工具
  - [utils/feedbackUtils.js](mdc:utils/feedbackUtils.js) - 用户反馈处理工具
  - [utils/logger.js](mdc:utils/logger.js) - 日志工具
  - [utils/storageUtils.js](mdc:utils/storageUtils.js) - 存储工具
  - [utils/batchUtils.js](mdc:utils/batchUtils.js) - 批量处理工具
  - [utils/formatUtils.js](mdc:utils/formatUtils.js) - 格式化工具
  - [utils/constants.js](mdc:utils/constants.js) - 常量定义
  - [utils/core/event-bus.js](mdc:utils/core/event-bus.js) - 事件总线

## 样式目录
- [styles/](mdc:styles) - 共享样式文件
  - [styles/variables.wxss](mdc:styles/variables.wxss) - 样式变量定义
  - [styles/common.wxss](mdc:styles/common.wxss) - 通用样式类
  - [styles/animation.wxss](mdc:styles/animation.wxss) - 动画相关样式

## 静态资源目录
- [assets/](mdc:assets) - 图片、图标等静态资源
  - [assets/icons/](mdc:assets/icons) - 图标文件
  - [assets/images/](mdc:assets/images) - 图片文件
  - [assets/animations/](mdc:assets/animations) - 动画资源

## 配置和文档
- [.cursor/](mdc:.cursor) - Cursor工具配置和项目规则
- [docs/](mdc:docs) - 项目文档
  - [docs/architecture/](mdc:docs/architecture) - 架构文档
  - [docs/api/](mdc:docs/api) - API文档
  - [docs/development/](mdc:docs/development) - 开发指南

## 文件关系图

```
app.js ────────┐
               ▼
         全局事件总线 ─────────┐
               │               │
        全局状态/配置 ◄────────┤
               │               │
               ▼               │
pages/ ◄── components/ ◄── services/ ◄── repositories/
  │          │               │            │
  │          ▼               ▼            ▼
  └───► 页面组件交互        领域模型     数据存储
```

## 主要数据流

1. **任务数据流**:
   ```
   TaskService ──> TaskRepository ──> 本地存储 ──> 页面/组件展示
        ▲                                             │
        │                                             │
        └─────────────── 用户操作 ◄───────────────────┘
   ```

2. **消息通知流**:
   ```
   事件触发 ──> MessageService ──> MessageRepository ──> 存储
                      │
                      ▼
               消息中心/通知展示
   ```

3. **主题和样式**:
   ```
   variables.wxss ──> app.wxss ──> 页面/组件样式
   ``` 