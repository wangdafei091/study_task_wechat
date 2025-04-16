# 技术上下文

## 技术栈
1. 前端技术
   - 微信小程序原生开发
   - WXML + WXSS + JavaScript
   - 组件化开发
   - 响应式设计
   - 动画效果
   - 性能优化
   - 错误处理
   - 日志记录

2. 数据管理
   - 本地存储
   - 全局状态管理
   - 组件状态管理
   - 数据持久化
   - 数据同步
   - 数据备份
   - 数据恢复
   - 数据验证

3. 工具库
   - 日期处理工具
   - 任务管理工具
   - 消息管理工具
   - UI工具库
   - 性能监控工具
   - 错误处理工具
   - 日志记录工具
   - 测试工具

## 开发环境
1. 开发工具
   - 微信开发者工具
   - VS Code
   - Git
   - Node.js
   - ESLint
   - Prettier
   - Chrome DevTools
   - Postman

2. 开发环境要求
   - Node.js >= 14.0.0
   - npm >= 6.0.0
   - 微信开发者工具最新版
   - 微信基础库 >= 2.19.0
   - Git >= 2.0.0
   - VS Code >= 1.60.0
   - Chrome >= 90.0.0
   - Postman >= 8.0.0

3. 开发规范
   - ESLint
   - Prettier
   - Git Flow
   - 代码审查
   - 命名规范
   - 注释规范
   - 提交规范
   - 文档规范

## 依赖关系
1. 核心依赖
   - 微信小程序基础库
   - 微信开发者工具
   - Node.js
   - npm
   - Git
   - VS Code
   - Chrome
   - Postman

2. 开发依赖
   - ESLint
   - Prettier
   - Git
   - VS Code
   - Chrome DevTools
   - Postman
   - Jest
   - Mocha

3. 项目依赖
   - 日期处理工具
   - 任务管理工具
   - 消息管理工具
   - UI工具库
   - 性能监控工具
   - 错误处理工具
   - 日志记录工具
   - 测试工具

## 技术约束
1. 平台限制
   - 微信小程序平台限制
   - 微信开发者工具限制
   - 微信基础库版本限制
   - 设备兼容性限制
   - 存储空间限制
   - 性能限制
   - 安全限制
   - 网络限制

2. 性能限制
   - 页面大小限制
   - 数据存储限制
   - 动画性能限制
   - 渲染性能限制
   - 内存占用限制
   - CPU使用限制
   - 网络请求限制
   - 存储空间限制

3. 安全限制
   - 数据安全
   - 用户隐私
   - 接口安全
   - 存储安全
   - 通信安全
   - 访问控制
   - 数据加密
   - 安全审计

## 开发流程
1. 开发规范
   - 代码规范
   - 命名规范
   - 注释规范
   - 提交规范
   - 文档规范
   - 测试规范
   - 发布规范
   - 维护规范

2. 开发流程
   - 需求分析
   - 设计实现
   - 代码开发
   - 测试验证
   - 代码审查
   - 性能优化
   - 安全审计
   - 发布部署

3. 发布流程
   - 代码审查
   - 测试验证
   - 版本发布
   - 监控反馈
   - 问题修复
   - 性能优化
   - 安全更新
   - 版本迭代

## 技术文档
1. 开发文档
   - 项目结构
   - 组件文档
   - API文档
   - 工具文档
   - 测试文档
   - 部署文档
   - 维护文档
   - 安全文档

2. 使用文档
   - 用户手册
   - 开发指南
   - 常见问题
   - 更新日志
   - 示例代码
   - 最佳实践
   - 故障排除
   - 性能优化

3. 维护文档
   - 部署文档
   - 监控文档
   - 问题处理
   - 性能优化
   - 安全更新
   - 版本迭代
   - 数据备份
   - 系统恢复

## 项目结构
├── app.js                 # 应用入口
├── app.json               # 应用配置
├── app.wxss              # 全局样式
├── components/           # 组件目录
│   ├── calendar/        # 日历组件
│   ├── card/           # 卡片容器组件
│   ├── date-picker/    # 日期选择器
│   ├── float-menu/     # 浮动菜单
│   ├── progressBar/    # 进度条组件
│   ├── progressRing/   # 圆环进度组件
│   ├── recentTasks/    # 最近任务组件
│   ├── repeat-selector/ # 重复任务选择器
│   ├── task-execution-settings/ # 任务执行设置
│   ├── task-info/      # 任务信息组件
│   ├── task-templates/ # 任务模板组件
│   ├── taskItem/       # 任务项组件
│   ├── template-selector/ # 模板选择器组件
│   └── upcomingTask/   # 即将开始任务组件
├── pages/               # 页面文件
│   ├── index/          # 首页(任务日历)
│   ├── task-edit/      # 任务编辑页
│   ├── task/           # 任务详情页
│   ├── create/         # 创建任务页
│   ├── rewards/        # 奖励页面
│   └── message/        # 消息页面
├── utils/              # 工具类
│   ├── dateUtils.js    # 日期处理工具
│   ├── feedbackUtils.js # 反馈工具
│   ├── messageManager.js # 消息管理
│   ├── taskManager.js  # 任务管理
│   ├── taskUtils.js    # 任务工具
│   ├── uiUtils.js      # UI工具
│   └── unit.js         # 单位转换工具
└── assets/             # 静态资源

## 核心组件
1. template-selector (任务模板选择器)
   - 功能：展示和选择常用任务模板
   - 特点：支持多种任务类型样式
   - 全局组件：已在app.json中注册为全局组件
   - 接口：
     - 输入属性：templates, selectedId, type, showCustom, maxDisplay, customText, title
     - 输出事件：select(选择模板), custom(自定义模板), editShortName(编辑简称), deleteTemplate(删除模板)
   - 样式：支持study/habit/interest三种主题样式
   - 交互：点击选择/自定义模板，触觉反馈，长按编辑
   - 生命周期：attached时设置typeClass
   - 日志：组件载入和各操作时记录日志
   - 性能优化：移除不必要的边框和背景，使用极淡色背景
   - 状态设计：通过CSS类控制不同状态样式
   - 复用策略：全局注册，可在多处使用
   - 详细代码：位于components/template-selector/目录

2. card (卡片容器)
   - 功能：通用卡片容器
   - 接口：title, icon, customClass, noPadding等
   - 样式：圆角卡片，带标题和内容区
   - 交互：展示内容，无特殊交互
   - 生命周期：标准组件生命周期
   - 插槽：默认内容插槽
   - 自定义样式：通过customClass传入

3. progressRing (进度环组件)
   - 功能：圆环形进度显示
   - 特点：支持多种任务类型样式
   - 接口：
     - 输入属性：percent(输入的百分比), size, type, color, showText, centerContent(简单文本内容), enableHover, borderWidth
     - 内部数据：progress(处理后的百分比值), isComplete(是否完成)
     - 输出事件：tap(点击事件)
   - 样式：支持default/habit/study/interest样式
   - 尺寸选项：large/medium/small或自定义数值
   - 交互：点击事件，动画效果
   - 生命周期：监听percent和size变化
   - 状态管理：isComplete标识完成状态
   - 性能优化：待实现渲染性能优化
   - 限制：目前centerContent仅支持简单文本，尚未实现slot插槽机制

4. date-picker (日期选择器)
   - 功能：选择单个日期或日期范围
   - 模式：单日期/日期范围
   - 快捷选项：今天/明天/后天等
   - 范围限制：minDate/maxDate
   - 事件：日期选择/快捷选项选择
   - 样式：适配应用整体风格
   - 交互：选择日期/范围，选择快捷选项

## 核心工具类
1. dateUtils
   - 日期格式化
   - 日期计算
   - 日期比较
   - 日期验证
   - 日期转换
   - 日期解析
   - 日期操作
   - 日期显示

2. taskUtils
   - 任务统计
   - 任务过滤
   - 任务排序
   - 任务验证
   - 任务操作
   - 任务显示
   - 任务分析
   - 任务导出

3. messageManager
   - 消息创建
   - 消息发送
   - 状态管理
   - 消息过滤
   - 消息排序
   - 消息显示
   - 消息分析
   - 消息导出

## 开发规范
1. 组件开发规范
   - 标准目录结构：js/json/wxml/wxss四个文件
   - 标准化接口设计：清晰的输入属性和输出事件
   - 生命周期管理：合理使用组件生命周期
   - 样式隔离：避免样式污染
   - 事件命名：on[Event]或handle[Event]
   - 注释规范：组件/方法/属性都有注释
   - 日志记录：关键操作记录日志
   - 错误处理：合理处理异常情况

## 技术架构

### 组件化架构
1. 核心组件
   - progressRing：圆环进度组件，支持多种任务类型样式，可自定义大小、颜色和边框宽度，提供动画效果
   - progressBar：进度条组件，支持水平和垂直方向，可自定义颜色和样式
   - template-selector：任务模板选择器，支持多种任务类型，提供选择和自定义功能，支持长按编辑
   - taskItem：任务项组件，展示任务信息，支持完成状态切换和详情查看
   - date-picker：日期选择器，支持日期范围选择和特定日期禁用
   - repeat-selector：重复任务选择器，支持多种重复模式

2. 通用容器组件
   - card：卡片容器组件，提供统一的边距、阴影和圆角样式
   - float-menu：浮动菜单组件，支持自定义菜单项和图标
   - custom-input-modal：自定义输入弹窗，支持表单验证和自定义样式

3. 业务组件
   - task-execution-settings：任务执行设置组件，管理任务执行模式和参数
   - task-info：任务信息展示组件，显示任务详细信息
   - task-templates：任务模板组件，管理常用任务模板
   - upcomingTask：即将开始任务提醒组件，显示最近任务信息
   - recentTasks：最近任务组件，展示最近完成或创建的任务

### 适配性优化实现
1. 统一单位系统
   - 通过unitUtils工具自动转换px和rpx单位
   - 增强wx.createSelectorQuery方法，对样式返回值进行单位处理
   - 增强Page.setData方法，自动处理样式值中的px单位
   - 实现适配不同设备像素比的自动转换

2. 高度适配系统
   - 通过getViewportInfo获取设备视口信息
   - 使用getContentHeight计算内容区域可用高度
   - 考虑状态栏、导航栏和安全区域
   - 支持底部标签栏和自定义导航栏的高度计算
   - 为横屏模式提供专门的高度计算逻辑

3. 设备类型识别
   - 通过getDeviceType识别设备类型
   - 根据屏幕尺寸自动分类为小屏、中屏、大屏和超大屏
   - 为不同设备类型提供差异化的UI配置
   - 横竖屏切换自动适配

4. 事件总线系统
   - 实现全局事件总线用于组件间通信
   - 支持事件注册、移除和触发
   - 提供错误处理机制
   - 实现组件生命周期与事件系统的集成

5. 兼容性处理
   - 检查基础库版本兼容性
   - 为老版本提供降级处理
   - 实现版本号比较函数
   - 为不支持的功能提供替代方案