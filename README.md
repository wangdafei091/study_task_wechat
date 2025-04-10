# 学习任务微信小程序

## 项目概述
这是一个帮助用户跟踪和管理学习任务的微信小程序。该程序提供日历视图、任务记录、进度跟踪、统计分析和奖励系统等功能，界面设计简约清爽。

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
12. **任务安排概览**：支持按日、按周、按月查看任务安排，优化重复任务的视觉展示，帮助用户了解小朋友的工作负载情况

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
6. 日视图显示当日任务详情，包括任务时间、标题、持续时间和重复任务标记
7. 周视图以柱状图形式展示一周内每天的任务分布，按类型区分颜色
8. 月视图以热力图形式展示月度任务分布，颜色深浅表示任务量多少

**视觉设计**：
- 使用简约设计，减少图标使用，通过颜色和形状传达信息
- 学习任务使用蓝色系(#4285F4)
- 生活习惯任务使用绿色系(#34A853)
- 整理收纳任务使用橙色系(#FBBC04)
- 任务负载状态以颜色区分：轻松(绿色)、适中(蓝色)、繁重(红色)
- 重复任务使用特殊标记以便于识别

## 数据结构设计

### 任务对象属性
```javascript
{
  id: String,          // 任务唯一标识符
  title: String,       // 任务标题
  description: String, // 任务描述
  type: String,        // 任务类型: 'clock'(生活习惯)、'bag'(整理收纳)、'study'(学习任务)
  status: Number,      // 状态: 0(未完成)、1(已完成)
  date: String,        // 任务日期，格式'YYYY-MM-DD'
  duration: Number,    // 预计持续时间(分钟)
  startTime: String,   // 开始时间，格式'HH:MM'
  endTime: String,     // 结束时间，格式'HH:MM'
  images: Array,       // 任务相关图片路径数组
  createTime: Number,  // 创建时间戳
  updateTime: Number,  // 更新时间戳
  points: Number,      // 完成任务可获得的积分值
  isRepeated: Boolean  // 是否为重复任务（在不同日期有相同标题的任务）
}
```

### 奖励对象属性
```javascript
{
  id: String,          // 奖励唯一标识符
  name: String,        // 奖励名称
  description: String, // 奖励描述
  points: Number,      // 所需积分
  icon: String,        // 奖励图标（emoji或图片路径）
  isUnlocked: Boolean, // 是否已解锁
  claimTime: Number    // 领取时间戳（如已领取）
}
```

## 主要组件API

### 进度圆环组件 (progressRing)
**属性**：
- `percent`: Number - 进度百分比(0-100)
- `size`: String/Number - 组件大小，可选值'large'/'medium'/'small'或具体rpx数值，默认'medium'
- `type`: String - 圆环类型，可选值'study'(学习任务)/'clock'(生活习惯)/'bag'(整理收纳)/'default'，默认'default'
- `color`: String - 自定义颜色（当type为default时使用），默认'#4285F4'
- `showText`: Boolean - 是否显示百分比文本，默认true
- `centerContent`: String - 自定义中心内容文本（不使用插槽时），默认''
- `enableHover`: Boolean - 是否启用悬停效果，默认true
- `borderWidth`: Number - 边框宽度，单位rpx，默认8

**事件**：
- `tap` - 点击事件，返回`{type, percent}`对象

**插槽**：
- 默认插槽 - 可用于自定义圆环中心内容

**使用示例**：
```html
<!-- 基本用法 -->
<progress-ring 
  type="study"
  percent="{{taskProgress.study}}"
  size="large"
  bind:tap="onRingTap">
</progress-ring>

<!-- 自定义颜色和内容 -->
<progress-ring 
  type="default"
  color="#FF5252"
  percent="85"
  size="160"
  borderWidth="10">
  <view class="custom-content">
    <text class="icon">📊</text>
  </view>
</progress-ring>
```

### 卡片组件 (card)
**属性**：
- `title`: String - 卡片标题，可选
- `icon`: String - 标题前的图标，可选
- `noPadding`: Boolean - 是否取消内边距，默认false
- `customClass`: String - 自定义样式类，用于扩展样式
- `customStyle`: String - 自定义内联样式

**插槽**：
- 默认插槽 - 卡片内容区域
- `action` - 标题右侧操作区域插槽

**使用示例**：
```html
<card title="任务概览" icon="📊" custom-class="task-overview-card">
  <view>这里是卡片内容</view>
  <view slot="action">
    <text class="action-text">更多</text>
  </view>
</card>
```

### 日期选择器组件 (date-picker)
**属性**：
- **基本属性**
  - `mode`: String - 选择器模式，可选值'single'(单日期)、'range'(日期范围)，默认'single'
  - `value`: String - 当前选中日期，格式'YYYY-MM-DD'，仅在single模式下使用
  - `label`: String - 日期选择器标签，可选
  - `placeholder`: String - 日期选择器占位符，默认"请选择日期"

- **范围选择相关**
  - `startDate`: String - 范围开始日期，仅在range模式下使用
  - `endDate`: String - 范围结束日期，仅在range模式下使用
  - `startLabel`: String - 开始日期标签，默认"开始日期"
  - `endLabel`: String - 结束日期标签，默认"结束日期"
  - `startPlaceholder`: String - 开始日期占位符，默认"请选择开始日期"
  - `endPlaceholder`: String - 结束日期占位符，默认"请选择结束日期"

- **限制范围**
  - `minDate`: String - 最小可选日期，格式'YYYY-MM-DD'
  - `maxDate`: String - 最大可选日期，格式'YYYY-MM-DD'

- **快速选项**
  - `quickOptions`: Array - 单日期模式快速选项配置，默认提供"今天"、"明天"、"周末"
  - `rangeQuickOptions`: Array - 范围模式快速选项配置，默认提供"本周"、"本月"、"上月"

- **样式相关**
  - `customClass`: String - 自定义样式类
  - `customStyle`: String - 自定义内联样式

- **功能开关**
  - `useNativePicker`: Boolean - 是否使用原生选择器，默认true
  - `showQuickOptions`: Boolean - 是否显示快速选项，默认true

**事件**：
- `change`: 日期变更事件 (单日期模式)
- `startChange`: 开始日期变更事件 (范围模式)
- `endChange`: 结束日期变更事件 (范围模式)
- `rangeChange`: 日期范围变更事件 (范围模式)
- `quickOptionChange`: 快速选项变更事件 (单日期模式)
- `rangeQuickOptionChange`: 快速选项变更事件 (范围模式)
- `showCalendar`: 自定义日历显示事件 (不使用原生选择器时)

**使用示例**：
```html
<!-- 单日期选择器 -->
<date-picker 
  label="执行日期" 
  value="{{date}}" 
  minDate="{{minDate}}"
  bindchange="onDateChange"
></date-picker>

<!-- 日期范围选择器 -->
<date-picker 
  mode="range"
  startLabel="开始日期"
  endLabel="结束日期"
  startDate="{{startDate}}"
  endDate="{{endDate}}"
  bindrangeChange="onRangeChange"
></date-picker>
```

### 日历组件 (calendar)
**属性**：
- `selectedDate`: String - 当前选中日期，格式'YYYY-MM-DD'
- `weekDays`: Array - 星期标题数组，默认值['日', '一', '二', '三', '四', '五', '六']
- `currentWeek`: Array - 当前周数据数组
- `currentMonth`: Array - 当前月数据数组
- `viewMode`: String - 显示模式，'week'或'month'，默认'week'
- `isLandscape`: Boolean - 是否处于横屏模式，默认false
- `deviceType`: Object - 设备类型信息对象

**方法**：
- `updateStyles(deviceType, isLandscape)` - 根据设备类型和屏幕方向更新样式
- `selectDate(e)` - 选择日期的事件处理函数
- `prevMonth()` - 切换到上一个月
- `nextMonth()` - 切换到下一个月
- `prevWeek()` - 切换到上一周
- `nextWeek()` - 切换到下一周
- `toggleViewMode()` - 切换视图模式（周/月）

**事件**：
- `selectDate` - 日期选择事件，返回所选日期和索引
- `viewModeChange` - 视图模式变更事件，返回新的视图模式

**样式适配**：
- 根据设备屏幕大小自动调整日历元素尺寸
- 支持横屏模式下的布局优化
- 支持暗黑模式

## 页面结构
- **首页**：日历视图、任务列表、奖励进度条、统计分析、搜索功能
- **任务详情页**：查看和编辑任务详情，管理任务图片
- **新建任务页**：创建新的学习任务，设置时间、类型、提醒等
- **奖池页**：查看和领取已解锁的奖励

## 技术栈
- 微信小程序原生开发
- WXML + WXSS + JavaScript
- 微信小程序本地存储

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

3. **贡献指南**
   - Fork项目并创建功能分支
   - 完成开发后提交Pull Request
   - 详细描述你的变更和测试方法
   - 确保代码通过所有测试

## 代码示例

### 创建新任务
```javascript
const app = getApp();

// 创建新任务
function createTask(taskData) {
  // 生成唯一ID
  const id = 'task_' + Date.now();
  
  // 构建任务对象
  const task = {
    id: id,
    title: taskData.title || '新任务',
    description: taskData.description || '',
    type: taskData.type || 'study',
    status: 0, // 默认未完成
    date: taskData.date || formatDate(new Date()),
    duration: taskData.duration || 30,
    startTime: taskData.startTime || '09:00',
    endTime: taskData.endTime || '09:30',
    images: [],
    createTime: Date.now(),
    updateTime: Date.now(),
    points: 0,
    isRepeated: false
  };
  
  // 获取现有任务列表
  let tasks = app.globalData.tasks || [];
  tasks.push(task);
  
  // 更新全局数据和本地存储
  app.globalData.tasks = tasks;
  wx.setStorage({
    key: 'taskData',
    data: tasks
  });
  
  return task;
}

// 格式化日期
function formatDate(date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}
```

### 完成任务
```javascript
function completeTask(taskId) {
  let tasks = app.globalData.tasks || [];
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  
  if (taskIndex > -1) {
    // 更新任务状态为已完成
    tasks[taskIndex].status = 1;
    tasks[taskIndex].updateTime = Date.now();
    
    // 更新数据
    app.globalData.tasks = tasks;
    wx.setStorage({
      key: 'taskData',
      data: tasks,
      success: () => {
        console.log('任务状态更新成功');
      }
    });
    
    // 计算并更新积分
    updatePoints(tasks[taskIndex].duration);
    
    return true;
  }
  
  return false;
}

// 更新积分
function updatePoints(duration) {
  // 根据任务时长计算积分
  const points = Math.ceil(duration / 10); // 每10分钟1积分
  let currentPoints = wx.getStorageSync('userPoints') || 0;
  
  // 更新积分
  currentPoints += points;
  wx.setStorage({
    key: 'userPoints',
    data: currentPoints
  });
  
  // 检查奖励解锁
  checkRewards(currentPoints);
}
```

## 效果展示
<img src="path_to_screenshot1.png" width="300" alt="首页任务列表" />
<img src="path_to_screenshot2.png" width="300" alt="统计分析面板" />

## 兼容性说明
- 最低支持微信基础库版本：2.14.0
- 建议使用微信 7.0.0 及以上版本
- 已适配常见机型，包括 iPhone、Android 手机等设备
- 已进行基础库版本检测，对于低版本用户会有相应提示
- 统一使用rpx单位，确保在不同尺寸屏幕上的一致显示效果
- 增强型单位转换工具，自动处理单位不一致的情况
- 支持系统字体大小调整，为视力障碍用户提供更好体验
- 采用弹性布局方案，自动适配不同屏幕尺寸和方向
- 针对小屏幕、标准屏幕和大屏幕提供差异化样式
- 支持横屏模式下的布局优化
- 全面屏设备安全区域适配，确保内容不被遮挡或裁剪
- 完善的高度适配系统，自动计算可用内容区域高度
- 丰富的媒体查询，针对不同屏幕尺寸和方向提供优化体验
- 响应式设计支持，在各种设备上提供一致的用户体验
- 低配设备性能优化，减少不必要的重绘和重排

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

### 高度适配系统
- 完善的内容高度计算方案，解决不同设备屏幕高度差异问题
- 自动处理顶部状态栏、导航栏和底部安全区域
- 支持动态内容高度计算，确保内容区域最大化利用
- 横屏模式下智能调整内容布局和间距

### 媒体查询支持
- 针对不同屏幕尺寸提供差异化样式
- 支持横屏/竖屏方向切换的布局调整
- 适配系统主题(暗黑模式/亮色模式)
- 低高度设备的特殊处理逻辑

### 组件适配增强
- **日历组件**: 针对不同设备尺寸和方向进行智能调整
  - 根据设备类型动态调整日期格子尺寸和字体大小
  - 横屏模式下特殊布局处理，优化显示效果
  - 支持周视图/月视图灵活切换
  - 暗黑模式自适应
  
- **圆形进度指示器**: 新增具有高适配性的环形进度组件
  - Canvas绘制的圆环进度指示器，支持不同设备像素比
  - 自动适应不同屏幕尺寸，调整显示大小和线宽
  - 横屏模式下智能缩放，确保良好显示效果
  - 支持各类主题颜色和暗黑模式
  - 使用固定尺寸的圆环设计，提供一致的视觉体验
  - 各任务类型使用独特颜色，提升识别度和用户体验

### 性能优化
- 针对低端设备提供性能优化方案
- 减少不必要的渲染和计算，优化动画性能
- 智能降级策略，在低性能设备上降低特效复杂度
- 使用setTimeout分批处理大量数据，避免阻塞主线程
- 页面滚动时延迟非关键渲染，提高滚动流畅度
- 图片懒加载，减少初始加载时间
- setData优化，减少数据传输量和更新频率

## 目录结构

```
├── app.js                  # 小程序入口文件
├── app.json                # 小程序全局配置
├── app.wxss                # 全局样式文件
├── components              # 组件目录
│   ├── calendar            # 日历组件(增强适配)
│   ├── progressRing        # 进度圆环组件
│   ├── progressBar         # 线性进度条组件
│   └── taskItem            # 任务项组件
├── pages                   # 页面目录
│   ├── index               # 首页
│   ├── task                # 任务详情页
│   ├── create              # 创建任务页
│   ├── rewards             # 奖励页面
│   └── history             # 历史记录页
├── utils                   # 工具函数目录
│   └── unit.js             # 单位转换和屏幕适配工具
```

## 用户详细指南

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

4. **使用日历**
   - 点击日历标题可以切换周视图/月视图
   - 左右滑动日历可以切换上/下周或月
   - 点击日期可以查看当天任务

5. **查看统计分析**
   - 点击首页的"统计"按钮打开统计面板
   - 查看任务完成率、类型分布等数据
   - 查看连续完成天数等成就

6. **搜索和筛选任务**
   - 点击首页的"搜索"按钮打开搜索面板
   - 输入关键词搜索特定任务
   - 使用筛选条件按类型、状态、时间范围筛选

7. **获取和使用奖励**
   - 点击底部导航的"奖池"进入奖励页面
   - 查看所有可用奖励和所需积分
   - 当积分达到要求时，奖励会自动解锁
   - 点击已解锁的奖励可以领取

### 奖励系统说明
1. **积分获取方式**
   - 完成任务获得积分，根据任务持续时间计算
   - 基本规则：每10分钟任务时长可获得1积分
   - 连续完成任务可获得额外奖励积分

2. **奖励等级**
   - 初级奖励：需要10-30积分
   - 中级奖励：需要31-60积分
   - 高级奖励：需要61-100积分
   - 特殊奖励：需要100积分以上

3. **奖励领取规则**
   - 积分达到要求后，奖励自动解锁
   - 点击已解锁奖励可以领取
   - 领取后积分会相应减少
   - 部分奖励有使用期限限制

## 界面设计说明
1. **配色方案**：
   - 主色调：蓝色 (#4285F4)
   - 背景色：浅灰/白色 (#F8F9FA)
   - 文字颜色：深灰 (#333333)、中灰 (#666666)
   - 强调色：绿色 (#34A853)、橙色 (#FBBC05)

2. **图标说明**：
   - 使用微信小程序内置图标
   - 使用Emoji作为任务类型和奖励图标

3. **布局**：
   - 顶部日历周/月视图（可切换）
   - 中部奖励进度条和统计面板
   - 底部今日任务列表
   - 底部固定的导航栏
   - 悬浮的添加任务按钮
   - 搜索功能入口和筛选面板

## 数据存储
- 使用微信小程序的本地存储(Storage)功能保存数据
- 任务数据存储在'tasks'键下
- 奖励数据存储在'rewards'键下
- 用户积分存储在'userPoints'键下
- 应用配置存储在'appConfig'键下

## 性能与优化
- 首屏加载优化：减少初始渲染内容，优先显示关键UI
- 列表渲染优化：使用虚拟列表技术处理大量任务数据
- 动画性能优化：使用transform代替位置属性，减少重排
- 数据存储优化：批量读写本地存储，减少IO操作
- 异步操作管理：合理使用Promise和async/await处理异步流程

## 最近优化

### 圆环大小优化
我们最近对应用进行了优化，移除了基于任务时长动态调整圆环大小的逻辑，改为使用固定尺寸的圆环。这个改变带来了几个显著的好处：

1. **视觉一致性**：所有圆环现在采用统一尺寸，提供更加一致的视觉体验
2. **简化代码**：移除了复杂的尺寸计算逻辑，使代码更加简洁和易于维护
3. **性能提升**：减少了不必要的计算和重绘，提高了应用性能
4. **用户体验优化**：避免了圆环大小变化可能带来的视觉干扰，使界面更加稳定

这个优化不影响圆环的基本功能和外观，仍然保留了不同任务类型的颜色区分和完成进度显示。

### 组件化改进
在优化过程中，我们加强了组件化开发方式：

1. **进度圆环组件**：使用标准化的参数接口，支持自定义颜色、大小和内容
2. **统一事件处理**：改进了事件处理机制，使组件更易于集成
3. **提升可复用性**：组件设计更加模块化，便于在其他地方重用

## 更新日志
- 2024-05-09: 优化圆环尺寸设计，移除动态调整逻辑，提升界面一致性和性能
- 2024-03-31: 实现头部收缩功能，增强用户体验
- 2024-03-30: 增加日历月视图功能和任务搜索筛选功能
- 2024-03-29: 添加新建任务页面、奖池页面和统计分析功能
- 2024-03-28: 项目初始化，完成首页设计和任务详情页

## 常见问题解答
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

## 任务编辑页面优化

最近对任务编辑页面进行了多次优化，主要包括以下方面：

### 1. 常用任务卡片优化

- **色块式设计**：采用现代化的色块顶部设计风格，移除了冗余的分类信息
- **网格布局**：使用3列网格布局替代横向滚动，更直观地展示多个选项
- **简洁名称显示**：卡片内只显示任务名称，通过顶部色条区分任务类型
- **精致交互效果**：选中状态有微缩放和底部色条指示，提供清晰的视觉反馈

### 2. 入口适配与筛选

- **入口类型筛选**：根据入口类型（学习/习惯）智能筛选显示相关任务模板
- **自定义任务按钮**：每个分类都有对应类型的自定义任务按钮

### 3. 任务信息区域增强

- **类型标识**：通过标签和颜色区分不同类型的任务
- **信息聚合**：将积分和难度信息集中显示在任务信息区域
- **视觉强化**：为积分添加颜色高亮，为难度添加星星图标
- **编辑交互**：提供编辑按钮，方便修改模板任务信息

## 使用方法

1. 在首页选择"创建学习任务"或"创建习惯任务"
2. 在任务编辑页面选择一个常用任务模板或创建自定义任务
3. 编辑任务信息（如需要）
4. 设置执行方式（一次性或周期性）
5. 点击"保存任务"完成创建

## 后续优化方向

- 添加任务标签系统，便于分类管理
- 增强任务统计功能，提供更多数据分析
- 优化执行方式设置，提供更多灵活选项

## 组件说明

### 浮动菜单组件 (Float Menu)

新添加了一个可高度自定义的浮动菜单组件，用于在页面底部或顶部显示弹出式的菜单选项。

#### 主要特性：

- 支持多种位置定位（右下角、左下角、右上角、左上角）
- 可配置的菜单项（图标、标签、样式）
- 支持自定义主题颜色和尺寸
- 动画效果可配置
- 支持无障碍访问

#### 使用方法：

1. 在页面的 JSON 中引入组件
```json
{
  "usingComponents": {
    "float-menu": "/components/float-menu/float-menu"
  }
}
```

2. 在页面 WXML 中使用组件
```xml
<float-menu 
  menuItems="{{menuItems}}"
  position="bottom-right"
  bind:itemtap="handleMenuItemTap"
/>
```

3. 配置菜单项和事件处理
```javascript
Page({
  data: {
    menuItems: [
      {
        id: 'study',
        type: 'study-task',
        icon: '📚',
        label: '学习'
      },
      {
        id: 'habit',
        type: 'habit-task',
        icon: '⏰',
        label: '习惯'
      }
    ]
  },
  
  handleMenuItemTap(e) {
    const item = e.detail.item;
    // 处理菜单项点击...
  }
})
```

更多详细用法请参考：[浮动菜单组件文档](/components/float-menu/README.md) 

# 组件使用指南

本项目包含多个可复用的组件，涵盖进度展示、日期选择、卡片布局等功能。以下是各组件的详细使用指南。

## 1. 进度圆环组件 (progressRing)

圆环形进度指示器，用于直观展示任务完成状态。

### 属性

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

### 事件

| 事件名 | 说明 | 返回值 |
|-------|------|-------|
| tap | 点击事件 | {type, percent} |

### 使用示例

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

## 2. 进度条组件 (progressBar)

线性进度条，支持可爱的小鸡动画效果，适用于展示整体任务进度。

### 属性

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

### 事件

| 事件名 | 说明 | 返回值 |
|-------|------|-------|
| complete | 完成事件 | 无 |

### 使用示例

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

<!-- 自定义奖品 -->
<progress-bar
  current="{{30}}"
  total="{{50}}"
  barHeight="{{20}}"
  rewardImage="/assets/images/toy.png"
  rewardName="玩具车"
/>
```

## 3. 浮动菜单组件 (float-menu)

创建浮动菜单按钮，点击后展开菜单选项，适用于快速操作入口。

### 属性

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

### 事件

| 事件名 | 说明 | 返回值 |
|-------|------|-------|
| itemtap | 菜单项点击事件 | {index, item} |
| statechange | 菜单状态变化事件 | {isOpen} |

### 菜单项格式

每个菜单项(menuItems数组中的元素)可以包含以下属性：

```javascript
{
  id: 'study',       // 唯一标识
  type: 'study-task', // 类型标识
  icon: '📚',        // 图标
  label: '学习'      // 显示文本
}
```

### 使用示例

```html
<float-menu 
  menuItems="{{menuItems}}"
  position="bottom-right"
  bind:itemtap="handleMenuItemTap"
  bind:statechange="handleMenuStateChange"
/>
```

```javascript
Page({
  data: {
    menuItems: [
      {
        id: 'study',
        type: 'study-task',
        icon: '📚',
        label: '学习'
      },
      {
        id: 'habit',
        type: 'habit-task',
        icon: '⏰',
        label: '习惯'
      },
      {
        id: 'organize',
        type: 'organize-task',
        icon: '📦',
        label: '整理'
      }
    ]
  },
  
  handleMenuItemTap(e) {
    const item = e.detail.item;
    console.log('点击了菜单项:', item);
    
    // 根据菜单项类型执行不同操作
    switch(item.type) {
      case 'study-task':
        this.createStudyTask();
        break;
      case 'habit-task':
        this.createHabitTask();
        break;
      case 'organize-task':
        this.createOrganizeTask();
        break;
    }
  },
  
  handleMenuStateChange(e) {
    console.log('菜单状态变化:', e.detail.isOpen);
  }
})
```

## 4. 任务项组件 (taskItem)

展示单个任务的组件，包含任务标题、类型、状态等信息。

### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| task | Object | {} | 任务对象 |

### 事件

| 事件名 | 说明 | 返回值 |
|-------|------|-------|
| complete | 完成任务事件 | {taskId} |
| edit | 编辑任务事件 | {taskId} |

### 使用示例

```html
<block wx:for="{{tasks}}" wx:key="id">
  <task-item 
    task="{{item}}"
    bind:complete="completeTask"
    bind:edit="editTask"
  />
</block>
```

## 5. 卡片组件 (card)

通用卡片容器，提供统一的样式和布局。

### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| title | String | '' | 卡片标题 |
| icon | String | '' | 标题前的图标 |
| noPadding | Boolean | false | 是否取消内边距 |
| customClass | String | '' | 自定义样式类 |
| customStyle | String | '' | 自定义内联样式 |

### 插槽

| 插槽名 | 说明 |
|-------|------|
| 默认插槽 | 卡片内容区域 |
| action | 标题右侧操作区域 |

### 使用示例

```html
<card title="任务概览" icon="📊" custom-class="task-overview-card">
  <view>这里是卡片内容</view>
  <view slot="action">
    <text class="action-text" bindtap="viewMore">更多</text>
  </view>
</card>
```

## 6. 日期选择器组件 (date-picker)

灵活的日期选择组件，支持单日期和日期范围选择模式。

### 属性

**基本属性**
| 属性名 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| mode | String | 'single' | 选择器模式，可选值:'single'(单日期)、'range'(日期范围) |
| value | String | '' | 当前选中日期，格式'YYYY-MM-DD'，仅在single模式下使用 |
| label | String | '' | 日期选择器标签 |
| placeholder | String | '请选择日期' | 日期选择器占位符 |

**范围选择相关**
| 属性名 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| startDate | String | '' | 范围开始日期，仅在range模式下使用 |
| endDate | String | '' | 范围结束日期，仅在range模式下使用 |
| startLabel | String | '开始日期' | 开始日期标签 |
| endLabel | String | '结束日期' | 结束日期标签 |
| startPlaceholder | String | '请选择开始日期' | 开始日期占位符 |
| endPlaceholder | String | '请选择结束日期' | 结束日期占位符 |

**限制范围**
| 属性名 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| minDate | String | '' | L最小可选日期，格式'YYYY-MM-DD' |
| maxDate | String | '' | 最大可选日期，格式'YYYY-MM-DD' |

**其他配置**
| 属性名 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| quickOptions | Array | [...] | 单日期模式快速选项配置 |
| rangeQuickOptions | Array | [...] | 范围模式快速选项配置 |
| customClass | String | '' | 自定义样式类 |
| customStyle | String | '' | 自定义内联样式 |
| useNativePicker | Boolean | true | 是否使用原生选择器 |
| showQuickOptions | Boolean | true | 是否显示快速选项 |

### 事件

| 事件名 | 说明 | 返回值 |
|-------|------|-------|
| change | 日期变更事件 (单日期模式) | {value} |
| startChange | 开始日期变更事件 (范围模式) | {startDate} |
| endChange | 结束日期变更事件 (范围模式) | {endDate} |
| rangeChange | 日期范围变更事件 (范围模式) | {startDate, endDate} |
| quickOptionChange | 快速选项变更事件 (单日期模式) | {option, date} |
| rangeQuickOptionChange | 快速选项变更事件 (范围模式) | {option, startDate, endDate} |

### 使用示例

```html
<!-- 单日期选择器 -->
<date-picker 
  label="执行日期" 
  value="{{date}}" 
  minDate="{{minDate}}"
  bindchange="onDateChange"
/>

<!-- 日期范围选择器 -->
<date-picker 
  mode="range"
  startLabel="开始日期"
  endLabel="结束日期"
  startDate="{{startDate}}"
  endDate="{{endDate}}"
  bindrangeChange="onRangeChange"
/>

<!-- 带快速选项的日期选择器 -->
<date-picker 
  label="截止日期" 
  value="{{dueDate}}"
  quickOptions="{{[
    { label: '今天', value: 'today' },
    { label: '明天', value: 'tomorrow' },
    { label: '下周', value: 'nextWeek' }
  ]}}"
  bindquickOptionChange="onQuickOptionChange"
/>
```

## 7. 日历组件 (calendar)

展示日期的日历组件，支持周视图和月视图切换。

### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| selectedDate | String | '' | 当前选中日期，格式'YYYY-MM-DD' |
| weekDays | Array | ['日', '一', '二', '三', '四', '五', '六'] | 星期标题数组 |
| currentWeek | Array | [] | 当前周数据数组 |
| currentMonth | Array | [] | 当前月数据数组 |
| viewMode | String | 'week' | 显示模式，'week'或'month' |
| isLandscape | Boolean | false | 是否处于横屏模式 |
| deviceType | Object | {} | 设备类型信息对象 |

### 事件

| 事件名 | 说明 | 返回值 |
|-------|------|-------|
| selectDate | 日期选择事件 | {index, date} |
| changeWeek | 切换周事件 | {direction} |
| changeMonth | 切换月事件 | {direction} |
| toggleViewMode | 视图模式切换事件 | {mode} |

### 使用示例

```html
<calendar
  selectedDate="{{selectedDate}}"
  currentWeek="{{currentWeek}}"
  currentMonth="{{currentMonth}}"
  viewMode="{{calendarViewMode}}"
  isLandscape="{{isLandscape}}"
  deviceType="{{deviceType}}"
  bind:selectDate="onSelectDate"
  bind:changeWeek="onChangeWeek"
  bind:changeMonth="onChangeMonth"
  bind:toggleViewMode="onToggleViewMode"
/>
```

```javascript
Page({
  data: {
    selectedDate: '2024-05-10',
    currentWeek: [], // 由日期计算填充
    currentMonth: [], // 由日期计算填充
    calendarViewMode: 'week',
    isLandscape: false,
    deviceType: {
      isSmallScreen: false,
      isLargeScreen: false,
      isExtraLargeScreen: false
    }
  },
  
  onLoad() {
    // 初始化日历数据
    this.initCalendarData();
    // 检测设备屏幕尺寸
    this.checkDeviceType();
  },
  
  // 初始化日历数据
  initCalendarData() {
    const now = new Date();
    const selectedDate = this.formatDate(now);
    const currentWeek = this.calculateWeekDays(now);
    const currentMonth = this.calculateMonthDays(now);
    
    this.setData({
      selectedDate,
      currentWeek,
      currentMonth
    });
  },
  
  // 日期选择处理
  onSelectDate(e) {
    const { date } = e.detail;
    this.setData({ selectedDate: date });
    // 加载选定日期的任务
    this.loadTasksByDate(date);
  },
  
  // 切换周
  onChangeWeek(e) {
    const { direction } = e.detail;
    const offset = direction === 'prev' ? -7 : 7;
    
    // 获取当前周的第一天
    const firstDay = new Date(this.data.currentWeek[0].date);
    // 计算新的一周
    firstDay.setDate(firstDay.getDate() + offset);
    
    const newWeek = this.calculateWeekDays(firstDay);
    this.setData({ currentWeek: newWeek });
  },
  
  // 其他日历相关方法...
})
```

## 组件组合使用示例

以下是一个任务管理页面的组件组合使用示例：

```html
<view class="container">
  <!-- 日历组件 -->
  <calendar
    selectedDate="{{selectedDate}}"
    currentWeek="{{currentWeek}}"
    currentMonth="{{currentMonth}}"
    viewMode="{{calendarViewMode}}"
    bind:selectDate="onSelectDate"
    bind:toggleViewMode="onToggleViewMode"
  />
  
  <!-- 进度概览区域 -->
  <card title="任务进度" icon="📊">
    <view class="progress-rings">
      <!-- 学习任务进度 -->
      <view class="ring-item">
        <progress-ring 
          type="study"
          percent="{{taskProgress.study}}"
          size="large"
          bind:tap="onRingTap"
          data-type="study">
        </progress-ring>
        <text class="ring-label">学习</text>
      </view>
      
      <!-- 生活习惯进度 -->
      <view class="ring-item">
        <progress-ring 
          type="clock"
          percent="{{taskProgress.clock}}"
          size="large"
          bind:tap="onRingTap"
          data-type="clock">
        </progress-ring>
        <text class="ring-label">习惯</text>
      </view>
      
      <!-- 整理收纳进度 -->
      <view class="ring-item">
        <progress-ring 
          type="bag"
          percent="{{taskProgress.bag}}"
          size="large"
          bind:tap="onRingTap"
          data-type="bag">
        </progress-ring>
        <text class="ring-label">整理</text>
      </view>
    </view>
  </card>
  
  <!-- 奖励进度 -->
  <card title="奖励进度" icon="🎁">
    <progress-bar
      current="{{rewardProgress.current}}"
      total="{{rewardProgress.total}}"
      showChick="{{true}}"
      useGradient="{{true}}"
      bind:complete="onRewardComplete"
    />
  </card>
  
  <!-- 任务列表 -->
  <card title="今日任务" custom-class="task-list-card">
    <block wx:if="{{tasks.length > 0}}">
      <block wx:for="{{tasks}}" wx:key="id">
        <task-item 
          task="{{item}}"
          bind:complete="completeTask"
          bind:edit="editTask"
        />
      </block>
    </block>
    <view wx:else class="empty-tasks">
      暂无任务，点击右下角"+"添加
    </view>
  </card>
  
  <!-- 浮动菜单 -->
  <float-menu 
    menuItems="{{menuItems}}"
    position="bottom-right"
    bind:itemtap="handleMenuItemTap"
  />
</view>
```

```javascript
Page({
  data: {
    // 日历相关数据
    selectedDate: '',
    currentWeek: [],
    currentMonth: [],
    calendarViewMode: 'week',
    
    // 任务进度数据
    taskProgress: {
      study: 0,
      clock: 0,
      bag: 0
    },
    
    // 奖励进度
    rewardProgress: {
      current: 0,
      total: 10
    },
    
    // 任务数据
    tasks: [],
    
    // 浮动菜单配置
    menuItems: [
      { id: 'study', type: 'study-task', icon: '📚', label: '学习' },
      { id: 'habit', type: 'habit-task', icon: '⏰', label: '习惯' },
      { id: 'organize', type: 'organize-task', icon: '📦', label: '整理' }
    ]
  },
  
  onLoad() {
    // 初始化数据
    this.initializeData();
  },
  
  // 初始化数据
  initializeData() {
    // 设置当前日期
    const now = new Date();
    const todayStr = this.formatDate(now);
    
    // 初始化日历数据
    const currentWeek = this.calculateWeekDays(now);
    const currentMonth = this.calculateMonthDays(now);
    
    this.setData({
      selectedDate: todayStr,
      currentWeek,
      currentMonth
    });
    
    // 加载任务数据
    this.loadTasks();
  },
  
  // 加载任务数据
  loadTasks() {
    // 从本地存储或API获取任务数据
    // 然后更新任务进度
    this.updateTaskProgress();
  },
  
  // 更新任务进度
  updateTaskProgress() {
    // 根据任务计算各类型进度
    // ...
  },
  
  // 处理任务完成
  completeTask(e) {
    const { taskId } = e.detail;
    // 更新任务完成状态
    // ...
    
    // 更新进度
    this.updateTaskProgress();
  },
  
  // 处理菜单项点击
  handleMenuItemTap(e) {
    const item = e.detail.item;
    
    switch(item.type) {
      case 'study-task':
        this.navigateToCreateTask('study');
        break;
      case 'habit-task':
        this.navigateToCreateTask('clock');
        break;
      case 'organize-task':
        this.navigateToCreateTask('bag');
        break;
    }
  },
  
  // 跳转到创建任务页面
  navigateToCreateTask(type) {
    wx.navigateTo({
      url: `/pages/task-edit/task-edit?type=${type}&date=${this.data.selectedDate}`
    });
  }
})
```

以上就是各组件的详细使用指南和示例。在使用这些组件时，可以根据实际需求组合使用，并通过属性和事件进行自定义配置。

## 更多信息

完整的组件源码和更多示例可以在项目的 `components` 目录下查找。每个组件目录下通常包含 `.js`、`.wxml`、`.wxss` 和 `.json` 文件，分别定义了组件的逻辑、结构、样式和配置。

对于某些复杂组件，可能还会有单独的 README.md 文件提供更详细的使用指南，如 [浮动菜单组件文档](/components/float-menu/README.md)。 