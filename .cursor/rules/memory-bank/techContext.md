# 技术上下文

## 开发环境

- **开发工具**：微信开发者工具
- **开发语言**：JavaScript (ES6+)
- **布局技术**：WXML + WXSS
- **版本控制**：Git
- **运行环境**：微信小程序运行时
- **调试工具**：微信开发者工具内置调试器

## 技术栈

### 核心框架
- 微信小程序原生框架（非第三方框架）
- 微信小程序组件系统
- 自定义组件机制

### 状态管理
- 自实现的事件总线机制
- 微信小程序 globalData
- 基于回调的数据流转

### 存储机制
- 微信小程序本地存储 API
  - `wx.setStorage` / `wx.setStorageSync`
  - `wx.getStorage` / `wx.getStorageSync`
  - `wx.removeStorage` / `wx.removeStorageSync`
- 自定义存储适配层 (storageUtils.js)
- 批量存储优化机制 (batchUtils.js)

### UI组件
- 小程序原生组件
- 自定义UI组件库
  - 进度环组件 (progressRing)
  - 任务项组件 (taskItem)
  - 卡片容器组件 (card)
  - 热力图组件 (task-heatmap)
  - 即将到期任务组件 (upcomingTask)
  - 浮动菜单组件 (float-menu)
  - 模板选择器组件 (template-selector)

### 工具库
- 日期处理工具 (dateUtils.js)
- 任务管理工具 (taskManager.js)
- 消息管理工具 (messageManager.js)
- UI工具函数 (uiUtils.js)
- 单位换算工具 (unit.js)
- 日志工具 (logger.js)
- 批量处理工具 (batchUtils.js)
- 反馈处理工具 (feedbackUtils.js)
- 分析工具 (analyticsManager.js)

## 技术约束

### 小程序环境限制
- 单个存储项限制为1MB
- 总存储限制为10MB
- 不支持WebSockets和某些HTML5 API
- 页面栈限制为10层
- 代码包大小限制
- 网络请求域名限制

### 性能考量
- 渲染性能：避免频繁setData
- 存储性能：批量处理存储操作
- 启动性能：优化初始化流程
- 列表渲染：大量数据需分页或虚拟列表

### 兼容性要求
- 支持iOS和Android微信环境
- 适配不同屏幕尺寸的设备
- 支持竖屏和横屏模式
- 考虑低端设备的性能限制

## 开发规范

### 编码规范
- 使用ES6+语法
- 小驼峰命名法（变量和函数）
- 大驼峰命名法（类）
- 下划线分隔的大写字母（常量）
- 详细请参见`docs/development/workflow.md`

### 组件规范
- 组件文件夹命名与组件名称一致
- 组件包含.js/.wxml/.wxss/.json四个文件
- 组件API需提供清晰的属性和事件
- 组件内部状态与外部传入属性分离

### 工具函数规范
- 单一职责原则
- 纯函数设计（无副作用）
- 模块导出一致性
- 完善的错误处理
- 详细的函数注释

### 日志规范
- 使用`logger.js`统一记录日志
- 遵循日志级别定义
- 包含模块名、操作描述和相关数据
- 错误日志需包含详情和上下文
- 避免过度日志和循环中日志
- 详细请参见`.cursorrules`中的日志规范

## 依赖管理

### 内部依赖
- 依赖关系通过`require`或导入实现
- 避免循环依赖
- 明确模块边界和职责

### 资源依赖
- 图标和图片存放在`assets`目录
- 公共样式存放在`styles`目录
- 动画资源存放在`assets/animations`目录

## 部署流程

1. 使用微信开发者工具进行代码编译
2. 代码审核和测试
3. 通过微信小程序管理后台上传代码包
4. 提交审核
5. 发布上线

## 安全考量

- 敏感数据加密存储
- 避免在日志中记录敏感信息
- 输入验证和数据过滤
- 避免可预测的ID生成
- 定期清理过期数据 