# 学习任务微信小程序

## 目录
- [项目概述](#项目概述)
- [功能特点](#功能特点)
- [功能详细说明](#功能详细说明)
- [技术栈](#技术栈)
- [安装与开发](#安装与开发)
- [项目结构](#项目结构)
- [组件文档](#组件文档)
- [工具类文档](#工具类文档)
- [用户指南](#用户指南)
- [项目配置](#项目配置)
- [适配方案](#适配方案)
- [常见问题](#常见问题)
- [更新日志](#更新日志)
- [贡献指南](#贡献指南)

## 项目概述
这是一个帮助用户跟踪和管理学习任务的微信小程序。该程序提供日历视图、任务记录、进度跟踪、统计分析和奖励系统等功能，界面设计简约清爽，专为帮助小朋友养成良好的学习习惯而设计。

## 功能特点
1. **日历任务视图**：支持周/月视图切换，可查看每日任务安排
2. **任务管理**：添加、完成、删除和编辑日常学习任务
3. **课程提醒**：显示即将到来的课程和剩余时间
4. **奖励系统**：完成任务获得积分，达到一定积分解锁不同奖励
5. **图片上传**：支持为任务添加图片
6. **任务分类**：支持三种任务类型：学习任务(study)、生活习惯(clock)、整理收纳(bag)
7. **统计分析**：展示任务完成率、类型分布等数据
8. **数据持久化**：任务和奖励数据保存到本地存储
9. **任务搜索筛选**：支持关键词搜索和多条件筛选（类型、状态、时间范围）
10. **头部收缩功能**：滚动时自动收缩头部区域，优化内容显示空间
11. **固定圆环尺寸**：使用固定尺寸的圆环，提供一致的视觉体验
12. **任务安排概览**：支持按日、按周、按月查看任务安排，优化重复任务的视觉展示
13. **即将到期任务提醒**：在首页显示24小时内即将开始的任务，支持长按操作和滑动消除
14. **消息中心通知**：自动生成任务到期提醒，并在消息中心显示，便于用户快速查看
15. **多层次交互模式**：支持点击、长按、滑动等多种交互方式，提升用户体验

## 功能详细说明

### 头部收缩功能
当用户向下滚动页面时，头部区域（包括日历和进度条）会自动收缩，为任务列表提供更多显示空间。向上滚动时，头部区域会重新展开。

**使用方法**：
- 默认情况下自动启用
- 在页面滚动时自动触发收缩/展开
- 适合在任务较多时提供更好的浏览体验

### 圆环进度指示器
系统使用固定尺寸的圆形进度指示器，直观地展示不同类型任务的完成情况。

**显示特点**：
- 使用大尺寸圆环(160rpx)提供清晰的进度展示
- 不同任务类型使用不同颜色标识，增强视觉区分度

**任务类型颜色**:
- 学习任务(study): 蓝色 #4285F4
- 生活习惯(clock): 绿色 #34A853
- 整理收纳(bag): 橙色 #FBBC04

### 任务安排概览功能
任务编辑页面的任务安排概览功能提供多时间维度的任务计划查看，方便家长了解孩子近期的学习任务安排情况。

**主要特点**：
- **三视图切换**：支持日视图、周视图和月视图的无缝切换
- **日视图**：按时间线展示单日内的所有任务安排，标记重复任务
- **周视图**：以柱状图形式展示一周内每天的任务分布，按类型区分颜色
- **月视图**：热力图形式展示月度任务分布，任务越多颜色越深
- **重复任务标记**：自动识别在不同日期重复的相同任务，使用特殊样式标记
- **任务负载分析**：根据孩子年龄段，自动分析任务量是否适中

**使用方法**：
1. 在任务编辑页面顶部可见任务安排概览板块
2. 点击"日视图"、"周视图"或"月视图"标签切换不同视图
3. 使用左右箭头按钮可切换日期、周次或月份
4. 点击日视图中的任务可查看详情
5. 在月视图中点击日期单元格可快速选择该日期作为任务执行日期

### 奖励系统
完成任务可获得积分，积分可用于解锁各种奖励，激励小朋友持续完成任务。

**积分规则**：
- 基本积分：每10分钟任务时长可获得1积分
- 连续完成：连续完成任务可获得额外奖励积分
- 特殊任务：某些重要任务可设置额外积分

**奖励类型**：
- 游戏时间：使用手机/平板的游戏时间
- 零食奖励：如冰淇淋、巧克力等
- 玩具奖励：新玩具或玩具使用时间
- 活动奖励：看电影、户外活动等
- 定制奖励：家长可自定义奖励内容

### 即将到期任务提醒
首页顶部区域会显示24小时内即将开始的任务提醒，帮助用户及时关注临近的任务。

**主要特点**：
- **智能检测**：自动检测并提示24小时内即将开始的未完成任务
- **时间显示**：精确显示任务剩余小时数，方便用户合理安排时间
- **优先级排序**：当有多个即将到期任务时，按时间先后顺序显示最近的任务
- **多样化交互**：
  - 点击：快速进入任务详情页面
  - 长按：弹出选项菜单，可选择查看任务、查看消息中心或暂时隐藏提醒
  - 左滑：快速消除提醒（1小时后会重新显示）
- **隐藏管理**：用户可以暂时隐藏不需要的提醒，系统会在适当时间自动重新显示
- **震动反馈**：在长按操作时提供触觉反馈，增强交互体验

**使用方法**：
1. 任务提醒会在首页自动显示，无需手动操作
2. 点击提醒可直接进入相应任务详情页面
3. 左滑提醒可暂时隐藏（1小时后重新显示）
4. 长按提醒可选择更多操作选项

### 消息中心通知系统
消息中心整合各类系统通知、任务提醒和成就信息，为用户提供统一的信息管理入口。

**主要特点**：
- **多类型消息**：支持任务提醒、成就通知、系统公告等多种消息类型
- **消息分类**：按照类型对消息进行分组，便于查找
- **未读标记**：明确显示未读消息，点击后自动标记为已读
- **时间显示**：智能时间显示（如"刚刚"、"5分钟前"、"2小时前"等）
- **关联导航**：点击消息可直接跳转到相应的功能页面
- **批量已读**：一键将所有消息标记为已读
- **自动生成**：系统会根据任务状态自动生成相关通知，如即将到期提醒、逾期警告等

**使用方法**：
1. 点击首页右上角的消息图标查看最新消息
2. 点击消息项查看详情或跳转到相关页面
3. 长按消息可标记为已读/未读
4. 点击"全部已读"按钮可将所有消息标记为已读
5. 在消息中心页面可按类型筛选查看不同类型的消息

## 技术栈
- 微信小程序原生开发
- WXML + WXSS + JavaScript
- 微信小程序本地存储
- 模块化组件设计
- 工具类封装

## 安装与开发
### 开发环境要求
- 微信开发者工具最新版
- 微信基础库版本: 2.14.0+

### 启动步骤
1. 克隆代码仓库
```bash
git clone <仓库地址>
```

2. 使用微信开发者工具打开项目目录
3. 点击"编译"按钮运行项目

### 开发指南
1. **代码规范**
   - 变量命名使用驼峰式
   - 组件文件使用小写加连字符
   - JS代码使用2个空格缩进
   - CSS类名使用连字符命名法(kebab-case)

2. **开发流程**
   - 功能开发在feature分支进行
   - 修复bug在hotfix分支进行
   - 提交前运行代码检查
   - 提交信息格式: `[类型]: 简短描述`

## 项目结构
```
├── app.js                  # 小程序入口文件
├── app.json                # 小程序全局配置
├── app.wxss                # 全局样式文件
├── components              # 组件目录
│   ├── calendar            # 日历组件
│   ├── progressRing        # 进度圆环组件
│   ├── progressBar         # 线性进度条组件
│   ├── taskItem            # 任务项组件
│   ├── float-menu          # 浮动菜单组件
│   ├── date-picker         # 日期选择器组件
│   ├── card                # 卡片容器组件
│   ├── recentTasks         # 最近任务组件
│   └── upcomingTask        # 即将到期任务提醒组件
├── pages                   # 页面目录
│   ├── index               # 首页
│   ├── task                # 任务详情页
│   ├── task-edit           # 任务编辑页
│   ├── rewards             # 奖励页面
│   ├── history             # 历史记录页
│   └── message             # 消息中心页面
├── utils                   # 工具函数目录
│   ├── unit.js             # 单位转换和屏幕适配工具
│   ├── dateUtils.js        # 日期处理工具
│   ├── taskUtils.js        # 任务处理工具
│   ├── messageManager.js   # 消息管理工具
│   ├── uiUtils.js          # UI工具类
│   └── feedbackUtils.js    # 反馈工具类
├── assets                  # 静态资源目录
│   ├── images              # 图片资源
│   └── sounds              # 音效资源
└── README.md               # 项目说明文档
```

## 组件文档

### 1. 进度圆环组件 (progressRing)

圆环形进度指示器，用于直观展示任务完成状态。

#### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| percent | Number | 0 | 进度百分比(0-100) |
| size | String/Number | 'medium' | 组件大小，可选值'large'/'medium'/'small'或具体rpx数值 |
| type | String | 'default' | 圆环类型，可选值'study'/'clock'/'bag'/'default' |
| color | String | '#4285F4' | 自定义颜色（当type为default时使用） |
| showText | Boolean | true | 是否显示百分比文本 |
| centerContent | String | '' | 自定义中心内容文本 |
| enableHover | Boolean | true | 是否启用悬停效果 |
| borderWidth | Number | 8 | 边框宽度(rpx) |

#### 事件

| 事件名 | 说明 | 返回值 |
|-------|------|-------|
| tap | 点击事件 | {type, percent} |

#### 使用示例

```html
<!-- 基本用法 -->
<progress-ring 
  type="study"
  percent="{{taskProgress.study}}"
  size="large"
  bind:tap="onRingTap">
</progress-ring>

<!-- 自定义样式 -->
<progress-ring 
  type="default"
  color="#FF5252"
  percent="85"
  size="160"
  borderWidth="10">
  <!-- 使用插槽自定义内容 -->
  <view class="custom-content">
    <text class="icon">📊</text>
  </view>
</progress-ring>
```

### 2. 进度条组件 (progressBar)

线性进度条，支持可爱的小鸡动画效果，适用于展示整体任务进度。

#### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| current | Number | 0 | 当前进度值 |
| total | Number | 100 | 总进度值 |
| showText | Boolean | false | 是否显示文本 |
| barHeight | Number | 16 | 进度条高度(rpx) |
| activeColor | String | '#4285F4' | 进度条颜色 |
| backgroundColor | String | '#E8E8E8' | 背景颜色 |
| borderRadius | Number | 8 | 圆角大小(rpx) |
| showChick | Boolean | true | 是否显示小鸡动画 |
| useGradient | Boolean | true | 是否使用渐变色 |
| rewardImage | String | '' | 奖品图片路径 |
| rewardName | String | '奖品' | 奖品名称 |

#### 事件

| 事件名 | 说明 | 返回值 |
|-------|------|-------|
| complete | 完成事件 | 无 |

#### 使用示例

```html
<!-- 基本用法 -->
<progress-bar
  current="{{rewardProgress.current}}"
  total="{{rewardProgress.total}}"
  showChick="{{true}}"
  useGradient="{{true}}"
  barHeight="{{28}}"
  borderRadius="{{14}}"
  bind:complete="onRewardComplete"
/>
```

### 3. 浮动菜单组件 (float-menu)

创建浮动菜单按钮，点击后展开菜单选项，适用于快速操作入口。

#### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| menuItems | Array | [] | 菜单项配置数组 |
| position | String | 'bottom-right' | 菜单位置，可选值:'bottom-right', 'bottom-left', 'top-right', 'top-left' |
| zIndex | Number | 100 | 菜单层级 |
| mainButtonClass | String | '' | 主按钮样式类 |
| defaultIcon | String | '＋' | 默认图标 |
| closeIcon | String | '×' | 关闭图标 |
| themeColor | String | '' | 主题颜色 |
| buttonSize | Number | 110 | 主按钮尺寸(rpx) |
| itemSize | Number | 100 | 菜单项尺寸(rpx) |
| disableVibrate | Boolean | false | 是否禁用震动反馈 |
| animationDuration | Number | 300 | 显示动画持续时间(毫秒) |

#### 事件

| 事件名 | 说明 | 返回值 |
|-------|------|-------|
| itemtap | 菜单项点击事件 | {index, item} |
| statechange | 菜单状态变化事件 | {isOpen} |

#### 使用示例

```html
<float-menu 
  menuItems="{{menuItems}}"
  position="bottom-right"
  bind:itemtap="handleMenuItemTap"
  bind:statechange="handleMenuStateChange"
/>
```

### 4. 卡片组件 (card)

通用卡片容器，提供统一的样式和布局。

#### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| title | String | '' | 卡片标题 |
| icon | String | '' | 标题前的图标 |
| noPadding | Boolean | false | 是否取消内边距 |
| customClass | String | '' | 自定义样式类 |
| customStyle | String | '' | 自定义内联样式 |

#### 插槽

| 插槽名 | 说明 |
|-------|------|
| 默认插槽 | 卡片内容区域 |
| action | 标题右侧操作区域 |

#### 使用示例

```html
<card title="任务概览" icon="📊" custom-class="task-overview-card">
  <view>这里是卡片内容</view>
  <view slot="action">
    <text class="action-text" bindtap="viewMore">更多</text>
  </view>
</card>
```

### 5. 即将到期任务组件 (upcomingTask)

展示即将到期的任务提醒，支持多种交互方式。

#### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| task | Object | {} | 任务对象，包含id、name、timeRemaining等属性 |
| show | Boolean | false | 是否显示组件 |
| swipeOffset | Number | 0 | 滑动偏移量 |
| dismissing | Boolean | false | 是否正在消除提醒 |

#### 事件

| 事件名 | 说明 | 返回值 |
|-------|------|-------|
| tap | 点击事件 | {id, name} |
| dismiss | 消除事件 | {id} |
| option | 选项点击事件 | {action, id} |

#### 使用示例

```html
<upcoming-task 
  task="{{upcomingTask}}" 
  show="{{showUpcomingTask}}"
  bind:tap="onUpcomingTaskTap"
  bind:dismiss="dismissUpcomingTask"
  bind:option="handleUpcomingOption">
</upcoming-task>
```

## 工具类文档

### 1. dateUtils.js

日期处理工具类，提供日期格式化、计算和比较功能。

#### 主要方法

| 方法名 | 参数 | 返回值 | 说明 |
|-------|------|-------|------|
| formatDate | date, format | String | 将日期格式化为指定格式的字符串 |
| getTodayString | 无 | String | 获取今天的日期字符串(YYYY-MM-DD) |
| getTomorrowString | 无 | String | 获取明天的日期字符串(YYYY-MM-DD) |
| getDaysBetween | dateStr1, dateStr2 | Number | 计算两个日期之间的天数差 |
| getWeekday | dateStr | String | 获取日期对应的星期几(中文) |
| isToday | dateStr | Boolean | 判断日期是否为今天 |
| isSameDay | date1, date2 | Boolean | 判断两个日期是否是同一天 |

### 2. taskUtils.js

任务处理工具类，提供任务统计、过滤、排序等功能。

#### 主要方法

| 方法名 | 参数 | 返回值 | 说明 |
|-------|------|-------|------|
| calculateCompletionRate | tasks | Number | 计算任务完成率(0-100) |
| getTaskStats | tasks | Object | 获取任务统计信息(总数、完成数、未完成数等) |
| filterTasks | tasks, filters | Array | 根据条件筛选任务 |
| sortTasks | tasks, sortBy, ascending | Array | 按指定条件排序任务 |
| generateTaskId | 无 | String | 生成任务唯一ID |
| createTaskObject | taskData | Object | 创建标准格式的任务对象 |
| isTaskOverdue | task | Boolean | 判断任务是否已逾期 |
| getTaskDueStatus | task | String | 获取任务到期状态 |

### 3. messageManager.js

消息管理工具类，提供消息的创建、更新、删除和查询功能。

#### 主要方法

| 方法名 | 参数 | 返回值 | 说明 |
|-------|------|-------|------|
| createTaskMessage | task, type | Object | 创建任务相关消息(新建/更新/完成/即将到期) |
| addMessage | message | void | 添加消息到本地存储 |
| updateTaskMessages | task | void | 更新与任务相关的消息内容 |
| removeTaskMessages | taskId | void | 删除与任务相关的所有消息 |
| getAllMessages | callback | void | 获取所有消息并通过回调返回 |
| getUnreadCount | callback | void | 获取未读消息数量 |
| markAsRead | messageId | void | 标记指定消息为已读 |
| markAllAsRead | 无 | void | 标记所有消息为已读 |
| formatMessageTime | timestamp | String | 格式化消息时间为友好显示(如"刚刚"、"5分钟前") |

### 4. uiUtils.js

UI工具类，提供动画效果、样式计算等功能。

#### 主要方法

| 方法名 | 参数 | 返回值 | 说明 |
|-------|------|-------|------|
| createAnimation | options | Animation | 创建微信小程序动画实例 |
| fadeIn | view, duration | void | 为视图元素创建淡入动画 |
| fadeOut | view, duration | void | 为视图元素创建淡出动画 |
| shake | view, intensity | void | 为视图元素创建抖动动画 |
| colorGradient | startColor, endColor, steps | Array | 计算两个颜色之间的渐变色值 |

### 5. feedbackUtils.js

反馈工具类，提供触觉、声音等反馈方法。

#### 主要方法

| 方法名 | 参数 | 返回值 | 说明 |
|-------|------|-------|------|
| vibrateShort | type | void | 短振动反馈(支持'light'/'medium'/'heavy') |
| vibrateLong | 无 | void | 长振动反馈 |
| playSound | soundType | void | 播放内置声音(如'success'/'error') |
| playCustomSound | soundPath | void | 播放自定义声音 |

## 事件总线与数据流

小程序采用事件总线（Event Bus）模式实现跨组件和跨页面的数据通信，简化了复杂的组件间通信问题。

### 事件总线实现

事件总线在app.js中初始化，提供了发布-订阅模式的基本功能：

```javascript
// 初始化事件总线
initEventBus: function() {
  this.globalData.eventBus = {
    listeners: {},
    
    // 注册事件监听
    on: function(event, callback) {
      if (!this.listeners[event]) {
        this.listeners[event] = [];
      }
      this.listeners[event].push(callback);
    },
    
    // 移除事件监听
    off: function(event, callback) {
      if (!this.listeners[event]) return;
      
      if (callback) {
        // 移除特定回调
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
      } else {
        // 移除所有该事件的回调
        delete this.listeners[event];
      }
    },
    
    // 触发事件
    emit: function(event, data) {
      const callbacks = this.listeners[event] || [];
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`事件处理出错: ${event}`, error);
        }
      });
    }
  };
}
```

### 主要事件类型

系统中定义了以下核心事件类型：

1. **taskDataChanged**: 任务数据变更事件
   - 触发时机：任务创建、编辑、完成、删除
   - 数据格式：任务数组 `Array<Task>`
   - 监听者：首页、统计页面

2. **messageDataChanged**: 消息数据变更事件
   - 触发时机：新消息生成、标记已读、删除消息
   - 数据格式：消息数组 `Array<Message>`
   - 监听者：首页消息预览、消息中心页面

3. **themeChange**: 主题变化事件
   - 触发时机：系统主题切换（如暗黑模式）
   - 数据格式：`{theme: 'light'|'dark'}`
   - 监听者：所有页面组件

4. **orientationChange**: 设备方向变化事件
   - 触发时机：设备旋转（横竖屏切换）
   - 数据格式：`{value: 'portrait'|'landscape'}`
   - 监听者：需要适配横竖屏的页面

### 事件订阅示例

页面在onLoad生命周期中订阅事件：

```javascript
onLoad: function() {
  // 获取全局事件总线
  const eventBus = getApp().globalData.eventBus;
  
  // 订阅任务数据变化事件
  eventBus.on('taskDataChanged', this.handleTaskDataChanged);
  
  // 订阅消息数据变化事件
  eventBus.on('messageDataChanged', this.handleMessageDataChanged);
},

// 在页面卸载时解除事件监听
onUnload: function() {
  const eventBus = getApp().globalData.eventBus;
  eventBus.off('taskDataChanged', this.handleTaskDataChanged);
  eventBus.off('messageDataChanged', this.handleMessageDataChanged);
},

// 任务数据变化处理函数
handleTaskDataChanged: function(allTasks) {
  // 处理任务数据变化
  taskManager.getTodayTasks(todayTasks => {
    this.setData({ tasks: todayTasks });
    this.updateTaskProgress(todayTasks);
  });
},

// 消息数据变化处理函数
handleMessageDataChanged: function(messages) {
  // 更新未读消息计数和消息预览
  const unreadCount = messages.filter(msg => !msg.isRead).length;
  this.setData({ 
    messages,
    unreadCount
  });
}
```

### 事件触发示例

数据变更时触发事件：

```javascript
// 在taskManager中保存任务数据后触发事件
_onTaskDataChanged(tasks) {
  // 通知全局事件总线
  const app = getApp();
  if (app.globalData.eventBus) {
    app.globalData.eventBus.emit('taskDataChanged', tasks);
  }
}

// 在messageManager中保存消息数据后触发事件
_notifyMessageUpdate: function(messages) {
  // 通知全局事件总线
  const app = getApp();
  if (app.globalData.eventBus) {
    app.globalData.eventBus.emit('messageDataChanged', messages);
  }
}
```

### 数据流向图

```
┌────────────┐     ┌───────────────┐     ┌────────────┐
│            │     │               │     │            │
│  用户操作  ├────►│  数据管理器   ├────►│ 本地存储   │
│            │     │               │     │            │
└────────────┘     └───────┬───────┘     └────────────┘
                           │
                           ▼
                   ┌───────────────┐
                   │               │
                   │   事件总线    │
                   │               │
                   └───────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
      ┌───────────┐ ┌───────────┐ ┌───────────┐
      │           │ │           │ │           │
      │ 页面/组件 │ │ 页面/组件 │ │ 页面/组件 │
      │           │ │           │ │           │
      └───────────┘ └───────────┘ └───────────┘
```

通过事件总线机制，我们实现了数据管理器与UI层的解耦，提高了代码的可维护性和扩展性。各个页面和组件只需关注自身的功能实现，无需了解数据如何被其他组件修改，同时也能及时响应数据变化。

## 数据联动机制

系统采用了集中式的数据联动机制，确保用户界面上的各个部分能够保持同步，实现无缝的用户体验。

### 任务与圆环进度联动

当任务的状态发生变化时(如完成、取消完成)，系统会自动更新首页的圆环进度显示。这一过程由统一的`updateTaskProgress`方法控制，确保所有数据保持一致性：

1. **任务完成**：用户点击完成任务后，系统会更新任务状态，并通过`updateTaskProgress`方法重新计算并更新圆环进度。
2. **任务编辑**：编辑任务后(如修改类型)，系统会重新计算对应类型的任务完成率。
3. **任务删除**：删除任务后，系统会自动调整圆环进度以反映当前任务情况。

### 任务与消息中心联动

任务的每次操作都会触发相应的消息通知，这些通知会自动显示在消息中心和首页的消息预览中：

1. **任务创建**：创建新任务时，系统自动生成"新任务提醒"消息。
2. **任务编辑**：编辑任务时，系统更新相关消息内容并生成"任务已更新"消息。
3. **任务完成**：完成任务时，系统自动生成"任务已完成"消息。
4. **任务删除**：删除任务时，系统自动删除与该任务相关的所有消息。
5. **即将到期**：系统会定期检查即将到期的任务，并自动生成提醒消息。

所有这些消息操作由`messageManager.js`工具类集中管理，确保各个页面的消息显示保持一致。

### 存储与全局状态同步

系统采用多层次的数据存储机制，确保数据的持久性和一致性：

1. **页面状态**：各页面通过`setData`维护自身的UI状态。
2. **全局状态**：重要数据存储在`app.globalData`中，作为应用内共享。
3. **持久化存储**：关键数据通过`wx.setStorage`存储到本地，确保应用重启后数据不丢失。

关键数据更新过程：
- 任务数据变更 → 更新页面状态 → 更新全局状态 → 保存到本地存储
- 完成任务 → 更新任务状态 → 更新进度圆环 → 创建完成消息 → 保存到本地存储

## 更新日志

### 2025-04-23 浮动菜单修复
- 修复了浮动菜单点击无效的问题
- 添加了缺失的事件处理函数handleMenuItemTap和handleMenuStateChange
- 优化了组件与页面的交互方式，提升用户体验
- 完善了事件流机制，确保UI响应的一致性

### 2025-04-22 数据联动优化
- 新增`messageManager.js`工具类，集中管理消息相关逻辑
- 优化任务圆环更新，统一使用`updateTaskProgress`方法
- 改进消息与任务的数据同步机制
- 任务变更操作（完成、编辑、删除）现在会自动同步更新相关消息
- 统一首页消息预览与消息中心的数据来源
- 优化即将到期任务的提醒机制，使用消息管理器创建通知

### 2025-04-10 消息中心与任务提醒
- 新增即将到期任务提醒功能和消息中心通知系统
- 添加任务操作反馈机制，提升用户体验
- 优化消息展示和时间格式化

### 2025-04-09 界面优化与性能提升
- 优化圆环尺寸设计，移除动态调整逻辑，提升界面一致性和性能
- 实现头部收缩功能，增强用户体验
- 优化任务列表渲染性能

### 2025-03-30 功能扩展
- 增加日历月视图功能
- 添加任务搜索筛选功能
- 优化任务编辑界面

### 2025-03-29 核心功能实现
- 添加新建任务页面
- 实现奖池页面和积分系统
- 添加统计分析功能

### 2025-03-28 项目初始化
- 项目初始化
- 完成首页设计和任务详情页

## 代码质量与风险管理

为确保小程序的稳定性和可维护性，我们建立了一套完整的代码质量保障和风险管理机制。

### 代码评审流程

1. **评审准则**：
   - 功能完整性：确保功能实现符合需求
   - 代码规范：遵循项目编码规范
   - 性能考量：关注代码执行效率
   - 安全性：防范数据泄露和安全风险
   - 可测试性：代码易于测试和验证

2. **评审方式**：
   - 提交前自审：开发者提交前自我检查
   - 团队评审：定期团队代码走查
   - 自动化检查：使用静态代码分析工具

### 常见问题与解决方案

1. **事件绑定问题**
   
   **症状**：组件事件不触发
   
   **原因**：事件名称不匹配或回调函数缺失
   
   **解决方案**：
   - 确保WXML中的事件名与JS中的处理函数名称一致
   - 检查事件处理函数是否已在Page或Component中定义
   - 使用事件委托机制增强代码健壮性

2. **数据更新问题**
   
   **症状**：UI未能反映最新数据变化
   
   **原因**：数据流不一致或更新时机不当
   
   **解决方案**：
   - 使用统一的数据管理方案
   - 通过事件总线机制同步数据变化
   - 确保在适当时机调用setData更新视图

3. **性能问题**
   
   **症状**：页面滑动卡顿或响应延迟
   
   **原因**：频繁的setData调用或过度渲染
   
   **解决方案**：
   - 减少setData调用频率和数据量
   - 使用防抖和节流技术
   - 避免不必要的计算和重渲染

### 测试策略

1. **单元测试**：对工具函数和独立模块进行测试
2. **组件测试**：验证组件的渲染和交互行为
3. **集成测试**：测试多个组件或页面的协同工作
4. **端到端测试**：模拟用户操作，测试完整流程

### 异常监控

1. **错误日志**：记录JS错误和API调用失败
2. **性能指标**：监控页面加载时间和交互响应
3. **用户反馈**：收集用户报告的问题和建议

### 预防措施

1. **预发布检查清单**：
   - 功能验证：所有新功能都经过测试
   - 兼容性测试：在不同设备和系统版本上测试
   - 边界条件测试：测试异常情况和边界值
   - 性能基准：确保性能指标符合要求

2. **渐进式发布**：
   - 内部测试：团队内部先行使用
   - 有限用户测试：邀请部分用户进行测试
   - 全量发布：确认无问题后向所有用户发布

通过以上机制，我们能够及时发现并解决代码问题，确保小程序的质量和用户体验。

## 贡献指南

### 如何贡献
1. Fork项目仓库
2. 创建你的功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交你的修改 (`git commit -m '[feature]: 添加了某功能'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建一个Pull Request

### 开发规范
- 遵循项目的代码风格
- 为新功能编写测试
- 更新文档以反映代码变化
- 版本号遵循[语义化版本控制](https://semver.org/lang/zh-CN/)

### 贡献类型
- 功能开发
- Bug修复
- 文档改进
- 性能优化
- UI/UX改进

## 核心功能流程

本章节详细介绍系统中主要功能的实现流程。

### 1. 即将到期任务提醒流程

即将到期任务提醒功能的实现流程如下：

1. **触发检查**：在以下几个场景触发检查即将到期任务：
   - 页面加载时
   - 完成任务后
   - 添加/编辑任务后
   - 定时刷新（计划中）

2. **任务筛选**：
   - 从全局任务列表中筛选未完成且有日期设置的任务
   - 计算每个任务距离当前时间的剩余小时数
   - 筛选出24小时内即将开始的任务
   - 按照剩余时间升序排序

3. **隐藏状态检查**：
   - 读取本地存储中的任务隐藏状态
   - 检查是否需要重新显示（隐藏超过1小时会自动重新显示）

4. **更新界面**：
   - 如有满足条件的任务且未被隐藏，更新首页显示即将到期任务提醒
   - 如没有满足条件的任务或用户选择隐藏，则不显示提醒

5. **生成消息通知**：
   - 为即将到期任务生成消息中心通知
   - 检查是否已存在相同任务的通知，若有则更新，若无则添加
   - 更新消息中心的未读消息计数

6. **用户交互处理**：
   - 点击：跳转到对应任务详情页
   - 长按：显示选项菜单（查看任务/查看消息中心/不再提醒）
   - 左滑：触发隐藏提醒功能

7. **隐藏状态保存**：
   - 当用户选择隐藏提醒时，记录当前时间和任务ID
   - 保存到本地存储，供下次检查使用

### 2. 任务创建流程

// ... 其他核心功能流程 ... 

## 系统架构重构与优化

为了提升小程序的性能与可维护性，我们对系统架构进行了重构，主要优化如下：

### 1. 数据流管理优化

采用了统一的数据流管理机制，解决了以前数据更新分散、重复计算的问题：

- **任务管理器**：集中处理任务的CRUD操作，统一任务数据流，减少存储操作频率
- **消息管理器**：统一处理消息的生成、更新和标记，智能去重，提升用户体验
- **事件总线**：实现组件间解耦，通过发布-订阅模式传递数据变更

### 2. 冗余功能整合

重构前存在的问题：
- 任务进度计算逻辑重复（updateTaskProgress和calculateTaskProgress）
- 即将到期任务逻辑分散在多处
- 任务数据在不同组件间直接传递造成数据不一致

重构解决方案：
- 合并任务进度计算为统一方法，避免重复计算
- 集中处理即将到期任务和消息提醒
- 建立统一的数据源和数据流向

### 3. 性能优化

- **存储操作优化**：利用防抖机制减少频繁存储操作，提高性能
- **消息去重处理**：避免生成重复消息，减少存储空间占用
- **按需更新机制**：实现组件根据事件按需更新，减少不必要的重渲染

### 4. 模块化设计

重构后的系统采用明确的分层设计：
- **数据层**：任务管理器和消息管理器负责数据处理
- **业务层**：页面组件专注于业务逻辑
- **视图层**：组件仅负责视图渲染
- **事件层**：事件总线负责数据传递

### 5. 代码质量提升

- 添加完善的注释和函数文档
- 统一的错误处理机制
- 减少重复代码，提高代码复用率

### 6. 重构效果

通过此次架构重构，小程序获得了以下改进：
- 更简洁清晰的代码结构
- 更高的运行性能和响应速度
- 更易于扩展和维护的架构
- 更统一的数据流管理

### 7. 未来优化方向

- 进一步模块化任务类型特定逻辑
- 组件的进一步抽象与复用
- 数据层与云端同步机制
- 用户行为分析与个性化推荐

### 8. 最新修复和优化

#### 2025-04-23 浮动菜单功能修复
- 修复了浮动菜单点击无效的问题
- 通过添加缺失的事件处理函数实现功能正常化
- 保持了原有WXML绑定不变，增强了代码健壮性
- 确保了事件总线和组件事件的正确连接

修复采用的方案：
```javascript
// 处理菜单项点击事件
handleMenuItemTap: function(e) {
  // 内部调用现有的onMenuItemTap
  this.onMenuItemTap(e);
},

// 处理菜单状态变化事件
handleMenuStateChange: function(e) {
  this.setData({
    showFloatMenu: e.detail.isOpen
  });
}
```

该修复解决了重构过程中的组件事件绑定问题，采用了最小修改原则，避免了对现有WXML结构的改动，通过事件委托机制增强了代码的健壮性和可维护性。

#### 2025-04-25 架构评估与代码审查
- 完成了对重构后架构的全面评估
- 优化了事件总线机制，提高了事件传递效率
- 规范了任务管理器和消息管理器的接口设计
- 完善了文档说明，便于团队成员理解和维护
- 添加了防御性编程措施，增强系统稳定性

后续计划：
- 增加自动化测试覆盖
- 优化本地存储策略，减少存储空间占用
- 引入性能监控机制，实时评估系统性能表现 