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

### 1. 日期处理工具 (dateUtils.js)

提供日期相关的通用方法，如格式化日期、日期计算等。

#### 主要方法

| 方法名 | 参数 | 返回值 | 说明 |
|-------|------|-------|------|
| formatDate | date:Date | String | 将日期格式化为YYYY-MM-DD |
| formatTime | date:Date | String | 将时间格式化为HH:MM |
| getTodayString | 无 | String | 获取今天的日期字符串 |
| getTomorrowString | 无 | String | 获取明天的日期字符串 |
| getYesterdayString | 无 | String | 获取昨天的日期字符串 |
| isToday | date:Date/String | Boolean | 判断是否为今天 |
| isTomorrow | date:Date/String | Boolean | 判断是否为明天 |
| isYesterday | date:Date/String | Boolean | 判断是否为昨天 |
| getDaysBetween | date1:Date/String, date2:Date/String | Number | 获取两个日期之间的天数差 |
| formatDateFriendly | date:Date/String | String | 格式化为友好显示（今天、明天等） |

#### 使用示例

```javascript
const dateUtils = require('../../utils/dateUtils');

// 获取今天的日期
const today = dateUtils.getTodayString(); // 返回 "2024-05-10"

// 格式化日期
const dateStr = dateUtils.formatDate(new Date()); // 返回 "2024-05-10"
```

### 2. 任务处理工具 (taskUtils.js)

提供任务相关的操作和计算方法。

#### 主要方法

| 方法名 | 参数 | 返回值 | 说明 |
|-------|------|-------|------|
| createTaskObject | taskData:Object | Object | 创建标准格式的任务对象 |
| generateTaskId | 无 | String | 生成唯一的任务ID |
| calculateCompletionRate | tasks:Array | Number | 计算任务完成率(0-100) |
| filterTasks | tasks:Array, filters:Object | Array | 按条件筛选任务 |
| sortTasks | tasks:Array, sortBy:String, ascending:Boolean | Array | 排序任务列表 |
| groupTasksByDate | tasks:Array | Object | 按日期分组任务 |
| isTaskOverdue | task:Object | Boolean | 判断任务是否已逾期 |
| getTaskDueStatus | task:Object | String | 获取任务到期状态(overdue/today/tomorrow/upcoming/future) |
| getNextRepeatDate | task:Object | String | 根据重复设置计算下一个任务日期 |
| createRepeatTask | originalTask:Object | Object | 创建重复任务的新实例 |

#### 使用示例

```javascript
const taskUtils = require('../../utils/taskUtils');

// 创建新任务
const newTask = taskUtils.createTaskObject({
  title: '完成数学作业',
  type: 'study',
  date: '2024-05-10'
});

// 检查任务状态
const dueStatus = taskUtils.getTaskDueStatus(task);
if (dueStatus === 'upcoming') {
  console.log('这是一个即将到期的任务');
}

// 判断任务是否逾期
if (taskUtils.isTaskOverdue(task)) {
  console.log('这个任务已经逾期');
}
```

### 3. 反馈工具类 (feedbackUtils.js)

提供统一的用户反馈方法，如震动、声音、提示等。

#### 主要方法

| 方法名 | 参数 | 返回值 | 说明 |
|-------|------|-------|------|
| vibrateFeedback | type:String | 无 | 提供震动反馈，可选值:'light', 'medium', 'heavy' |
| soundFeedback | type:String | 无 | 播放声音反馈，可选值:'success', 'error', 'alert', 'click' |
| showToast | options:Object | 无 | 显示统一的消息提示 |
| taskCompletionFeedback | isComplete:Boolean | 无 | 完成任务的综合反馈 |
| operationFeedback | 无 | 无 | 操作确认的反馈 |

#### 使用示例

```javascript
const feedbackUtils = require('../../utils/feedbackUtils');

// 轻微震动反馈
feedbackUtils.vibrateFeedback('light');

// 完成任务的综合反馈
feedbackUtils.taskCompletionFeedback(true);

// 显示提示消息
feedbackUtils.showToast({
  title: '任务已完成',
  icon: 'success',
  duration: 1500,
  vibrate: true
});
```

## 用户指南

### 使用流程
1. **初次使用**
   - 打开小程序，首页显示任务日历和今日任务列表
   - 可以看到顶部日历视图，默认为周视图
   - 底部为奖励进度条和任务列表

2. **创建任务**
   - 点击底部"+"按钮打开新建任务页面
   - 填写任务名称、描述、类型等信息
   - 选择日期和时间段
   - 点击"保存"按钮完成创建

3. **查看和管理任务**
   - 在首页点击任务项进入任务详情页
   - 可以编辑任务信息、上传图片
   - 点击"完成"按钮标记任务为已完成状态
   - 完成任务后获得相应积分

4. **查看统计与奖励**
   - 点击首页的"统计"按钮查看任务完成情况
   - 点击底部导航的"奖池"进入奖励页面
   - 使用积分解锁和领取奖励

## 项目配置

### 小程序配置 (app.json)
```json
{
  "pages": [
    "pages/index/index",
    "pages/task/task",
    "pages/task-edit/task-edit",
    "pages/rewards/rewards"
  ],
  "window": {
    "backgroundTextStyle": "light",
    "navigationBarBackgroundColor": "#fff",
    "navigationBarTitleText": "学习任务管理",
    "navigationBarTextStyle": "black"
  },
  "tabBar": {
    "color": "#999999",
    "selectedColor": "#4285F4",
    "backgroundColor": "#ffffff",
    "list": [
      {
        "pagePath": "pages/index/index",
        "text": "任务",
        "iconPath": "assets/images/task.png",
        "selectedIconPath": "assets/images/task_selected.png"
      },
      {
        "pagePath": "pages/rewards/rewards",
        "text": "奖励",
        "iconPath": "assets/images/rewards.png",
        "selectedIconPath": "assets/images/rewards_selected.png"
      }
    ]
  },
  "style": "v2",
  "sitemapLocation": "sitemap.json"
}
```

## 适配方案

### 基础库兼容性检查
- 最低支持微信基础库版本：2.14.0
- 推荐微信客户端版本：7.0.0 及以上
- 对于低版本用户会提供基础库版本检查，引导用户升级微信版本

### 设备适配方案
- 支持市面上常见设备，包括各类iPhone机型和Android手机
- 通过自适应单位和弹性布局确保在不同尺寸设备上显示正常
- 针对全面屏设备进行安全区域适配

### 单位与尺寸
- 采用rpx作为主要布局单位，确保在不同屏幕尺寸下显示一致性
- 增强型单位转换工具，处理rpx、px等单位不一致问题
- 对于字体大小，支持跟随系统字体大小调整，方便视力障碍用户使用

### 弹性布局方案
- 采用flexbox布局方案，自动适应不同屏幕尺寸和方向
- 针对小屏(宽度320px)、标准屏和大屏设备差异化样式
- 支持横屏模式下的布局优化
- 通过CSS变量统一管理布局尺寸

### UI一致性保障
- 统一卡片样式，包括边距(margin: 16rpx 30rpx)和内边距(padding: 24rpx)
- 所有主要界面元素（包括消息预览、搜索面板、奖励进度、即将到期任务提醒等）保持一致的视觉风格
- 自定义组件的样式与全局样式保持协调，确保整体UI的统一性
- 通过基于原子设计的组件库，实现样式的一致性和可维护性

## 常见问题

1. **如何备份我的任务数据？**
   目前数据仅保存在本地，建议定期截图重要任务信息。未来版本将添加云端备份功能。

2. **为什么有些任务不显示在日历上？**
   请确保任务设置了正确的日期，且日历当前查看的是相应的月份或周。

3. **积分系统如何计算？**
   基本规则是每10分钟任务时长获得1积分，连续完成任务可获得额外奖励。

4. **如何删除已完成的任务？**
   在任务详情页面，点击右上角的"更多"按钮，选择"删除任务"选项。

5. **如何修改任务完成状态？**
   在任务详情页面，可以通过切换"完成状态"开关来修改。

## 更新日志

### 2025-04-22 数据联动优化
- 增加了`messageManager.js`工具类，集中管理消息相关逻辑
- 优化任务圆环更新，统一使用`updateTaskProgress`方法
- 改进消息与任务的数据同步机制
- 任务变更操作（完成、编辑、删除）现在会自动同步更新相关消息
- 统一了首页消息预览与消息中心的数据来源
- 优化了即将到期任务的提醒机制，使用消息管理器创建通知

### 数据联动机制

系统中的数据联动关系主要包括：

1. **任务状态变更与圆环进度**
   - 任务完成状态变更时，自动更新任务圆环进度
   - 统一使用`updateTaskProgress`方法确保数据一致性
   - 更新同时会触发全局数据同步

2. **任务操作与消息中心**
   - 任务创建：自动生成"新任务提醒"消息
   - 任务编辑：更新相关消息内容，保持消息与任务信息同步
   - 任务完成：自动生成"任务完成"通知
   - 任务删除：自动删除与该任务相关的所有消息

3. **即将到期任务与消息通知**
   - 系统定期检查未来24小时内即将开始的任务
   - 自动生成"任务即将到期"提醒消息
   - 在首页展示最紧急的任务提醒
   - 同时在消息中心中添加相应通知

4. **全局数据与本地存储**
   - 用户操作会同时更新内存中的全局数据和本地存储
   - 确保数据在应用重启后能正确恢复
   - 使用统一的数据更新方法避免不一致

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