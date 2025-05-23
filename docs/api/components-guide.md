# 组件使用指南

本文档介绍了项目中可用的自定义组件的用途和使用方法，帮助开发人员快速了解如何在页面中使用这些组件。

## 组件概述

项目包含多个自定义组件，位于 `components/` 目录下，主要包括：

- **卡片组件**：提供统一的内容容器
- **进度展示组件**：包括环形进度条和线性进度条
- **任务相关组件**：任务项、即将到期任务、任务热力图等
- **日期选择组件**：提供日期选择和星星日历功能
- **交互组件**：如浮动菜单等

## 组件使用方法

在页面中使用组件需要两步：

### 1. 在页面的 JSON 中声明

```json
{
  "usingComponents": {
    "progress-ring": "/components/progressRing/progressRing",
    "card": "/components/card/card",
    "index-task-item": "/components/index-task-item/index-task-item"
  }
}
```

### 2. 在页面的 WXML 中使用

```html
<card>
  <progress-ring percent="{{taskProgress}}" type="study"></progress-ring>
  <view class="task-list">
    <index-task-item wx:for="{{tasks}}" wx:key="id" task="{{item}}" bind:tap="onTaskTap"></index-task-item>
  </view>
</card>
```

## 卡片组件 (card)

`components/card/card` 提供统一的内容容器，具有一致的样式和交互效果。

### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|-------|-----|
| padding | String | '30rpx' | 内边距 |
| radius | String | '16rpx' | 圆角大小 |
| shadow | Boolean | true | 是否显示阴影 |
| background | String | '#ffffff' | 背景颜色 |

### 事件

| 事件名 | 说明 |
|-------|-----|
| tap | 点击卡片时触发 |

### 插槽

- 默认插槽：卡片内容

### 使用示例

```html
<!-- 基础用法 -->
<card>
  <view>卡片内容</view>
</card>

<!-- 自定义样式 -->
<card padding="20rpx" radius="8rpx" background="#f8f8f8" shadow="{{false}}">
  <view>无阴影卡片</view>
</card>

<!-- 绑定事件 -->
<card bind:tap="onCardTap">
  <view>点击触发事件</view>
</card>
```

## 环形进度条 (progressRing)

`components/progressRing/progressRing` 提供环形进度展示，常用于展示任务完成情况。

### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|-------|-----|
| percent | Number | 0 | 进度百分比(0-100) |
| type | String | 'default' | 类型，可选值：'study'、'habit'、'interest'、'default' |
| size | Number | 120 | 环形大小(rpx) |
| strokeWidth | Number | 8 | 环形宽度(rpx) |
| showText | Boolean | true | 是否显示进度文本 |

### 事件

| 事件名 | 说明 |
|-------|-----|
| tap | 点击进度环时触发 |

### 使用示例

```html
<!-- 基础用法 -->
<progress-ring percent="{{60}}"></progress-ring>

<!-- 不同任务类型 -->
<progress-ring percent="{{75}}" type="study"></progress-ring>
<progress-ring percent="{{40}}" type="habit"></progress-ring>
<progress-ring percent="{{90}}" type="interest"></progress-ring>

<!-- 自定义大小 -->
<progress-ring percent="{{50}}" size="{{180}}" strokeWidth="{{12}}"></progress-ring>
```

## 线性进度条 (progressBar)

`components/progressBar/progressBar` 提供线性进度条，用于展示任务或奖励进度。

### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|-------|-----|
| percent | Number | 0 | 进度百分比(0-100) |
| type | String | 'default' | 类型，可选值：'study'、'habit'、'interest'、'default' |
| height | Number | 6 | 高度(rpx) |
| showText | Boolean | false | 是否显示进度文本 |
| radius | Number | 3 | 圆角大小(rpx) |

### 使用示例

```html
<!-- 基础用法 -->
<progress-bar percent="{{60}}"></progress-bar>

<!-- 显示文本 -->
<progress-bar percent="{{75}}" showText="{{true}}"></progress-bar>

<!-- 自定义样式 -->
<progress-bar percent="{{40}}" type="habit" height="{{10}}" radius="{{5}}"></progress-bar>
```

## 任务项组件 (index-task-item)

`components/index-task-item/index-task-item` 显示单个任务项，主要用于任务列表展示。

### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|-------|-----|
| task | Object | - | 任务对象 |
| showActions | Boolean | true | 是否显示操作按钮 |
| showTime | Boolean | true | 是否显示任务时间 |
| showPoints | Boolean | true | 是否显示任务积分 |

### 事件

| 事件名 | 说明 |
|-------|-----|
| tap | 点击任务项时触发 |
| complete | 点击完成按钮时触发 |
| delete | 点击删除按钮时触发 |
| edit | 点击编辑按钮时触发 |

### 使用示例

```html
<!-- 基础用法 -->
<index-task-item 
  task="{{taskItem}}" 
  bind:tap="onTaskTap"
  bind:complete="onTaskComplete"
  bind:delete="onTaskDelete"
  bind:edit="onTaskEdit">
</index-task-item>

<!-- 仅显示 -->
<index-task-item 
  task="{{taskItem}}" 
  showActions="{{false}}"
  showTime="{{false}}">
</index-task-item>
```

### JS处理示例

```javascript
// 处理任务点击
onTaskTap(e) {
  const taskId = e.currentTarget.dataset.taskId;
  wx.navigateTo({
    url: `/pages/task/task?id=${taskId}`
  });
},

// 处理任务完成
onTaskComplete(e) {
  const taskId = e.detail.taskId;
  const taskService = getApp().serviceManager.getService('taskService');
  taskService.completeTask(taskId)
    .then(result => {
      if (result.success) {
        wx.showToast({ title: '任务已完成', icon: 'success' });
      }
    })
    .catch(error => {
      logger.error('Index', '完成任务失败', error);
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
}
```

## 任务热力图 (task-heatmap)

`components/task-heatmap/task-heatmap` 展示任务完成情况的热力图。

### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|-------|-----|
| data | Array | [] | 热力图数据数组 |
| startDate | String | - | 开始日期(YYYY-MM-DD) |
| endDate | String | - | 结束日期(YYYY-MM-DD) |

### 事件

| 事件名 | 说明 |
|-------|-----|
| cellTap | 点击日期单元格时触发 |

### 使用示例

```html
<task-heatmap 
  data="{{heatmapData}}" 
  startDate="{{startDate}}" 
  endDate="{{endDate}}"
  bind:cellTap="onDateCellTap">
</task-heatmap>
```

```javascript
// 页面中准备数据
onLoad() {
  // 热力图数据格式
  this.setData({
    heatmapData: [
      { date: '2023-06-01', count: 5 },
      { date: '2023-06-02', count: 3 },
      // ...更多数据
    ],
    startDate: '2023-06-01',
    endDate: '2023-06-30'
  });
}
```

## 即将到期任务组件 (upcomingTask)

`components/upcomingTask/upcomingTask` 展示即将到期的任务提醒。

### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|-------|-----|
| task | Object | - | 任务对象 |
| countdown | Boolean | true | 是否显示倒计时 |

### 事件

| 事件名 | 说明 |
|-------|-----|
| tap | 点击任务时触发 |

### 使用示例

```html
<upcoming-task 
  wx:for="{{upcomingTasks}}" 
  wx:key="id" 
  task="{{item}}"
  bind:tap="onUpcomingTaskTap">
</upcoming-task>
```

## 浮动菜单组件 (float-menu)

`components/float-menu/float-menu` 提供浮动操作菜单，常用于添加任务等操作。

### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|-------|-----|
| items | Array | [] | 菜单项数组，格式：[{icon: '图标路径', text: '文本', id: '唯一标识'}] |
| position | String | 'bottom-right' | 位置，可选值：'bottom-right', 'bottom-left', 'top-right', 'top-left' |
| mainIcon | String | - | 主按钮图标路径 |
| mainText | String | '' | 主按钮文本 |

### 事件

| 事件名 | 说明 |
|-------|-----|
| itemTap | 点击菜单项时触发，detail包含item对象 |
| mainTap | 点击主按钮时触发 |

### 使用示例

```html
<float-menu 
  items="{{menuItems}}" 
  position="bottom-right"
  mainIcon="/assets/icons/add.png"
  mainText="添加"
  bind:itemTap="onMenuItemTap"
  bind:mainTap="onAddTap">
</float-menu>
```

```javascript
// 页面中准备数据
onLoad() {
  this.setData({
    menuItems: [
      { id: 'study', icon: '/assets/icons/study.png', text: '学习任务' },
      { id: 'habit', icon: '/assets/icons/habit.png', text: '习惯任务' },
      { id: 'interest', icon: '/assets/icons/interest.png', text: '兴趣任务' }
    ]
  });
},

// 处理菜单点击
onMenuItemTap(e) {
  const item = e.detail.item;
  wx.navigateTo({
    url: `/pages/task-edit/task-edit?type=${item.id}`
  });
}
```

## 日期选择器 (date-picker)

`components/date-picker/date-picker` 提供日期选择功能。

### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|-------|-----|
| value | String | '' | 当前选中日期，格式：YYYY-MM-DD |
| mode | String | 'date' | 模式，可选值：'date'(日期)、'month'(月份) |
| min | String | '' | 最小可选日期 |
| max | String | '' | 最大可选日期 |

### 事件

| 事件名 | 说明 |
|-------|-----|
| change | 选择日期变化时触发，detail包含value(选中日期) |

### 使用示例

```html
<date-picker 
  value="{{selectedDate}}" 
  min="2023-01-01"
  max="2023-12-31"
  bind:change="onDateChange">
</date-picker>
```

```javascript
// 处理日期变更
onDateChange(e) {
  const date = e.detail.value;
  this.setData({ selectedDate: date });
  this.loadTasksByDate(date);
}
```

## 星星日历组件 (star-calendar)

`components/star-calendar/star-calendar` 展示每日获得星星的日历视图。

### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|-------|-----|
| year | Number | 当前年 | 年份 |
| month | Number | 当前月 | 月份(1-12) |
| starData | Array | [] | 星星数据，格式：[{date: '2023-06-01', stars: 5}] |
| showControls | Boolean | true | 是否显示月份切换控件 |

### 事件

| 事件名 | 说明 |
|-------|-----|
| dateSelect | 选择日期时触发，detail包含date(选中日期) |
| monthChange | 月份变化时触发，detail包含year和month |

### 使用示例

```html
<star-calendar 
  year="{{currentYear}}" 
  month="{{currentMonth}}"
  starData="{{monthStarData}}"
  bind:dateSelect="onCalendarDateSelect"
  bind:monthChange="onCalendarMonthChange">
</star-calendar>
```

```javascript
// 处理月份变更
onCalendarMonthChange(e) {
  const { year, month } = e.detail;
  this.setData({
    currentYear: year,
    currentMonth: month
  });
  this.loadMonthStarData(year, month);
},

// 加载月度星星数据
loadMonthStarData(year, month) {
  const starService = getApp().serviceManager.getService('starService');
  starService.getStarRecordsByMonth(year, month)
    .then(records => {
      // 转换为组件需要的格式
      const starData = records.map(record => ({
        date: dateUtils.formatDate(new Date(record.timestamp)),
        stars: record.stars
      }));
      this.setData({ monthStarData: starData });
    })
    .catch(error => {
      logger.error('StarCalendar', '加载星星数据失败', error);
    });
}
```

## 组件开发最佳实践

### 1. 组件属性设置默认值

```javascript
Component({
  properties: {
    type: {
      type: String,
      value: 'default' // 设置默认值
    },
    percent: {
      type: Number,
      value: 0
    }
  }
})
```

### 2. 事件命名规范

- 组件内事件处理函数使用 `_` 前缀
- 通过triggerEvent向外通知父组件

```javascript
methods: {
  _onItemTap() {
    this.triggerEvent('tap', {
      taskId: this.data.task.id,
      task: this.data.task
    });
  }
}
```

### 3. 多使用插槽实现灵活布局

```javascript
Component({
  options: {
    multipleSlots: true // 启用多插槽支持
  },
  
  properties: {
    // ...
  }
})
```

```html
<!-- 组件模板 -->
<view class="card">
  <view class="header">
    <slot name="header"></slot>
  </view>
  <view class="body">
    <slot></slot>
  </view>
  <view class="footer">
    <slot name="footer"></slot>
  </view>
</view>

<!-- 使用方式 -->
<my-card>
  <view slot="header">标题</view>
  <view>内容</view>
  <view slot="footer">底部</view>
</my-card>
```

### 4. 组件与领域服务交互

为保持组件的纯粹性，组件不应直接调用领域服务，而应该通过事件向上传递，由页面处理：

```javascript
// 组件中
methods: {
  _onCompleteTap() {
    this.triggerEvent('complete', {
      taskId: this.data.task.id
    });
  }
}

// 页面中
onTaskComplete(e) {
  const taskId = e.detail.taskId;
  const taskService = getApp().serviceManager.getService('taskService');
  taskService.completeTask(taskId)
    .then(/* 处理结果 */)
    .catch(/* 处理错误 */);
}
```

### 5. 组件样式遵循设计规范

所有组件样式应遵循全局设计规范，保持视觉一致性：

```css
/* 组件样式文件 */
.card {
  border-radius: 16rpx;           /* 统一的圆角 */
  padding: 30rpx;                 /* 统一的内边距 */
  box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.1); /* 统一的阴影效果 */
}

.button {
  height: 90rpx;                  /* 统一的按钮高度 */
  border-radius: 8rpx;            /* 统一的按钮圆角 */
}
``` 