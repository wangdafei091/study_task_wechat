# 组件使用指南

本文档详细介绍了学习任务微信小程序中的自定义组件，基于当前的DDD架构设计，提供完整的组件API和使用示例。

## 组件架构概览

### 组件分类
项目中的组件按功能分为以下几类：

- **基础组件**：卡片、进度条等通用UI组件
- **业务组件**：任务项、奖励项等业务相关组件
- **交互组件**：浮动菜单、日期选择器等交互组件
- **数据展示组件**：热力图、统计图表等数据可视化组件

### 组件设计原则
- **单一职责**：每个组件专注于特定功能
- **可复用性**：组件可在多个页面中复用
- **数据驱动**：通过属性传递数据，通过事件传递操作
- **样式一致**：遵循统一的UI设计规范

## 组件使用方法

### 1. 在页面JSON中声明组件

```json
{
  "usingComponents": {
    "card": "/components/card/card",
    "progress-ring": "/components/progressRing/progressRing",
    "progress-bar": "/components/progressBar/progressBar",
    "task-item": "/components/taskItem/taskItem",
    "reward-item": "/components/rewardItem/rewardItem",
    "floating-menu": "/components/floatingMenu/floatingMenu",
    "date-picker": "/components/datePicker/datePicker",
    "star-calendar": "/components/starCalendar/starCalendar",
    "user-switcher": "/components/userSwitcher/userSwitcher"
  }
}
```

### 2. 在页面WXML中使用组件

```html
<card>
  <view class="header">
    <text class="title">今日任务</text>
    <progress-ring percent="{{taskProgress}}" type="study"></progress-ring>
  </view>
  
  <view class="task-list">
    <task-item 
      wx:for="{{tasks}}" 
      wx:key="id" 
      task="{{item}}"
      bind:complete="onTaskComplete"
      bind:edit="onTaskEdit">
    </task-item>
  </view>
</card>
```

## 基础组件

### Card - 卡片组件

通用的内容容器组件，提供统一的卡片样式。

#### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| padding | String | '30rpx' | 内边距 |
| radius | String | '16rpx' | 圆角大小 |
| shadow | Boolean | true | 是否显示阴影 |
| background | String | '#ffffff' | 背景颜色 |
| margin | String | '24rpx' | 外边距 |

#### 事件

| 事件名 | 说明 | 参数 |
|--------|------|------|
| tap | 点击卡片时触发 | event |

#### 插槽

- **默认插槽**：卡片内容区域

#### 使用示例

```html
<!-- 基础卡片 -->
<card>
  <view class="content">
    <text>基础卡片内容</text>
  </view>
</card>

<!-- 自定义样式卡片 -->
<card 
  padding="40rpx" 
  radius="20rpx" 
  background="#f8f9fa"
  shadow="{{false}}">
  <view class="custom-content">
    <text>自定义样式卡片</text>
  </view>
</card>

<!-- 可点击卡片 -->
<card bind:tap="onCardTap" data-id="{{cardId}}">
  <view class="clickable-content">
    <text>点击我</text>
  </view>
</card>
```

#### JS处理示例

```javascript
Page({
  onCardTap(e) {
    const cardId = e.currentTarget.dataset.id;
    logger.info('Page', '卡片被点击', { cardId });
    
    // 处理卡片点击逻辑
    wx.navigateTo({
      url: `/pages/detail/detail?id=${cardId}`
    });
  }
});
```

### ProgressRing - 环形进度条

用于显示任务完成进度的环形进度条组件。

#### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| percent | Number | 0 | 进度百分比(0-100) |
| type | String | 'default' | 进度条类型：'study'/'habit'/'interest'/'default' |
| size | Number | 120 | 环形直径(rpx) |
| strokeWidth | Number | 8 | 环形线条宽度(rpx) |
| showText | Boolean | true | 是否显示进度文本 |
| animated | Boolean | true | 是否启用动画效果 |

#### 事件

| 事件名 | 说明 | 参数 |
|--------|------|------|
| tap | 点击进度环时触发 | event |

#### 使用示例

```html
<!-- 基础环形进度条 -->
<progress-ring percent="{{75}}"></progress-ring>

<!-- 不同类型的进度条 -->
<progress-ring percent="{{60}}" type="study"></progress-ring>
<progress-ring percent="{{80}}" type="habit"></progress-ring>
<progress-ring percent="{{45}}" type="interest"></progress-ring>

<!-- 自定义大小和样式 -->
<progress-ring 
  percent="{{90}}" 
  size="{{160}}" 
  strokeWidth="{{12}}"
  showText="{{false}}"
  animated="{{false}}">
</progress-ring>

<!-- 可交互的进度条 -->
<progress-ring 
  percent="{{taskProgress}}" 
  type="{{taskType}}"
  bind:tap="onProgressTap">
</progress-ring>
```

#### JS处理示例

```javascript
Page({
  data: {
    taskProgress: 0,
    taskType: 'study'
  },
  
  onLoad() {
    this.calculateProgress();
  },
  
  calculateProgress() {
    const taskService = getApp().serviceManager.get('taskService');
    
    taskService.getAllTasks().then(result => {
      if (result.success) {
        const tasks = result.tasks;
        const completedTasks = tasks.filter(task => task.status === 1);
        const progress = tasks.length > 0 ? 
          Math.round((completedTasks.length / tasks.length) * 100) : 0;
        
        this.setData({ taskProgress: progress });
      }
    });
  },
  
  onProgressTap() {
    wx.showToast({
      title: `当前进度：${this.data.taskProgress}%`,
      icon: 'none'
    });
  }
});
```

### ProgressBar - 线性进度条

用于显示线性进度的组件，适合在列表或卡片中使用。

#### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| percent | Number | 0 | 进度百分比(0-100) |
| type | String | 'default' | 进度条类型：'study'/'habit'/'interest'/'default' |
| height | Number | 6 | 进度条高度(rpx) |
| showText | Boolean | false | 是否显示进度文本 |
| radius | Number | 3 | 圆角大小(rpx) |
| backgroundColor | String | '#f0f0f0' | 背景颜色 |

#### 使用示例

```html
<!-- 基础线性进度条 -->
<progress-bar percent="{{65}}"></progress-bar>

<!-- 显示进度文本 -->
<progress-bar percent="{{80}}" showText="{{true}}"></progress-bar>

<!-- 不同类型的进度条 -->
<progress-bar percent="{{45}}" type="study" height="{{8}}"></progress-bar>
<progress-bar percent="{{70}}" type="habit" height="{{10}}"></progress-bar>

<!-- 自定义样式 -->
<progress-bar 
  percent="{{55}}" 
  height="{{12}}" 
  radius="{{6}}"
  backgroundColor="#e9ecef">
</progress-bar>
```

## 业务组件

### TaskItem - 任务项组件

用于显示单个任务的组件，包含任务信息和操作按钮。

#### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| task | Object | - | 任务对象 |
| showActions | Boolean | true | 是否显示操作按钮 |
| showTime | Boolean | true | 是否显示任务时间 |
| showPoints | Boolean | true | 是否显示任务积分 |
| showStatus | Boolean | true | 是否显示任务状态 |
| compact | Boolean | false | 是否使用紧凑模式 |

#### 事件

| 事件名 | 说明 | 参数 |
|--------|------|------|
| tap | 点击任务项时触发 | { task } |
| complete | 点击完成按钮时触发 | { task } |
| reset | 点击重置按钮时触发 | { task } |
| edit | 点击编辑按钮时触发 | { task } |
| delete | 点击删除按钮时触发 | { task } |
| toggleRequired | 切换必做状态时触发 | { task, isRequired } |

#### 使用示例

```html
<!-- 基础任务项 -->
<task-item 
  task="{{taskItem}}"
  bind:complete="onTaskComplete"
  bind:edit="onTaskEdit">
</task-item>

<!-- 紧凑模式任务项 -->
<task-item 
  task="{{taskItem}}"
  compact="{{true}}"
  showActions="{{false}}">
</task-item>

<!-- 完整功能任务项 -->
<task-item 
  task="{{taskItem}}"
  bind:tap="onTaskTap"
  bind:complete="onTaskComplete"
  bind:reset="onTaskReset"
  bind:edit="onTaskEdit"
  bind:delete="onTaskDelete"
  bind:toggleRequired="onToggleRequired">
</task-item>
```

#### JS处理示例

```javascript
Page({
  data: {
    tasks: []
  },
  
  onLoad() {
    this.loadTasks();
  },
  
  async loadTasks() {
    const taskService = getApp().serviceManager.get('taskService');
    const result = await taskService.getAllTasks();
    
    if (result.success) {
      this.setData({ tasks: result.tasks });
    }
  },
  
  async onTaskComplete(e) {
    const { task } = e.detail;
    const taskService = getApp().serviceManager.get('taskService');
    
    try {
      const result = await taskService.completeTask(task.id, 'child');
      
      if (result.success) {
        wx.showToast({
          title: `任务完成！获得${result.starReward}颗星`,
          icon: 'success'
        });
        
        // 刷新任务列表
        this.loadTasks();
      } else {
        wx.showToast({
          title: result.message,
          icon: 'error'
        });
      }
    } catch (error) {
      logger.error('TaskPage', '完成任务失败', error);
      wx.showToast({
        title: '操作失败，请重试',
        icon: 'error'
      });
    }
  },
  
  onTaskEdit(e) {
    const { task } = e.detail;
    wx.navigateTo({
      url: `/pages/task-edit/task-edit?id=${task.id}`
    });
  },
  
  async onTaskDelete(e) {
    const { task } = e.detail;
    
    const res = await wx.showModal({
      title: '确认删除',
      content: `确定要删除任务"${task.title}"吗？`
    });
    
    if (res.confirm) {
      const taskService = getApp().serviceManager.get('taskService');
      const result = await taskService.deleteTask(task.id);
      
      if (result.success) {
        wx.showToast({ title: '删除成功', icon: 'success' });
        this.loadTasks();
      }
    }
  }
});
```

### RewardItem - 奖励项组件

用于显示单个奖励的组件，包含奖励信息和兑换功能。

#### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| reward | Object | - | 奖励对象 |
| userStars | Number | 0 | 用户当前星星数量 |
| showActions | Boolean | true | 是否显示操作按钮 |
| showStatus | Boolean | true | 是否显示奖励状态 |

#### 事件

| 事件名 | 说明 | 参数 |
|--------|------|------|
| tap | 点击奖励项时触发 | { reward } |
| claim | 点击兑换按钮时触发 | { reward } |
| deliver | 点击已领取按钮时触发 | { reward } |

#### 使用示例

```html
<!-- 基础奖励项 -->
<reward-item 
  reward="{{rewardItem}}"
  userStars="{{starBalance}}"
  bind:claim="onRewardClaim">
</reward-item>

<!-- 奖励列表 -->
<view class="reward-list">
  <reward-item 
    wx:for="{{rewards}}" 
    wx:key="id"
    reward="{{item}}"
    userStars="{{starBalance}}"
    bind:tap="onRewardTap"
    bind:claim="onRewardClaim"
    bind:deliver="onRewardDeliver">
  </reward-item>
</view>
```

#### JS处理示例

```javascript
Page({
  data: {
    rewards: [],
    starBalance: 0
  },
  
  onLoad() {
    this.loadRewards();
    this.loadStarBalance();
  },
  
  async loadRewards() {
    const rewardService = getApp().serviceManager.get('rewardService');
    const result = await rewardService.getAvailableRewards();
    
    if (result.success) {
      this.setData({ rewards: result.rewards });
    }
  },
  
  async loadStarBalance() {
    const starService = getApp().serviceManager.get('starService');
    const balance = await starService.getStarBalance('child');
    this.setData({ starBalance: balance });
  },
  
  async onRewardClaim(e) {
    const { reward } = e.detail;
    const rewardService = getApp().serviceManager.get('rewardService');
    
    try {
      const result = await rewardService.claimReward(reward.id, 'child');
      
      if (result.success) {
        wx.showModal({
          title: '兑换成功！',
          content: `您已成功兑换"${reward.title}"，消耗${result.starCost}颗星星`,
          showCancel: false
        });
        
        // 刷新数据
        this.loadRewards();
        this.loadStarBalance();
      } else {
        wx.showToast({
          title: result.message,
          icon: 'error'
        });
      }
    } catch (error) {
      logger.error('RewardPage', '兑换奖励失败', error);
      wx.showToast({
        title: '兑换失败，请重试',
        icon: 'error'
      });
    }
  }
});
```

## 交互组件

### FloatingMenu - 浮动菜单

提供浮动操作菜单功能，常用于快速操作入口。

#### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| visible | Boolean | false | 是否显示菜单 |
| position | String | 'bottom-right' | 菜单位置：'bottom-right'/'bottom-left'/'top-right'/'top-left' |
| items | Array | [] | 菜单项数组 |

#### 事件

| 事件名 | 说明 | 参数 |
|--------|------|------|
| select | 选择菜单项时触发 | { item, index } |
| close | 关闭菜单时触发 | - |

#### 使用示例

```html
<!-- 浮动菜单 -->
<floating-menu 
  visible="{{showMenu}}"
  position="bottom-right"
  items="{{menuItems}}"
  bind:select="onMenuSelect"
  bind:close="onMenuClose">
</floating-menu>

<!-- 触发按钮 -->
<view class="fab-button" bind:tap="toggleMenu">
  <text class="icon">+</text>
</view>
```

#### JS处理示例

```javascript
Page({
  data: {
    showMenu: false,
    menuItems: [
      { id: 'add-task', title: '添加任务', icon: 'task' },
      { id: 'add-reward', title: '添加奖励', icon: 'gift' },
      { id: 'view-stats', title: '查看统计', icon: 'chart' }
    ]
  },
  
  toggleMenu() {
    this.setData({ showMenu: !this.data.showMenu });
  },
  
  onMenuSelect(e) {
    const { item } = e.detail;
    
    switch (item.id) {
      case 'add-task':
        wx.navigateTo({ url: '/pages/task-edit/task-edit' });
        break;
      case 'add-reward':
        wx.navigateTo({ url: '/pages/reward-edit/reward-edit' });
        break;
      case 'view-stats':
        wx.navigateTo({ url: '/pages/statistics/statistics' });
        break;
    }
    
    this.setData({ showMenu: false });
  },
  
  onMenuClose() {
    this.setData({ showMenu: false });
  }
});
```

### DatePicker - 日期选择器

提供日期选择功能的组件。

#### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| value | String | '' | 当前选中的日期(YYYY-MM-DD) |
| minDate | String | '' | 最小可选日期 |
| maxDate | String | '' | 最大可选日期 |
| placeholder | String | '请选择日期' | 占位符文本 |

#### 事件

| 事件名 | 说明 | 参数 |
|--------|------|------|
| change | 日期改变时触发 | { value } |

#### 使用示例

```html
<!-- 基础日期选择器 -->
<date-picker 
  value="{{selectedDate}}"
  bind:change="onDateChange">
</date-picker>

<!-- 限制日期范围 -->
<date-picker 
  value="{{taskDate}}"
  minDate="{{today}}"
  maxDate="{{maxDate}}"
  placeholder="选择任务日期"
  bind:change="onTaskDateChange">
</date-picker>
```

### UserSwitcher - 用户切换器

提供用户角色切换功能的组件。

#### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| currentUser | String | 'child' | 当前用户ID |
| users | Array | [] | 可选用户列表 |

#### 事件

| 事件名 | 说明 | 参数 |
|--------|------|------|
| switch | 切换用户时触发 | { userId, user } |

#### 使用示例

```html
<!-- 用户切换器 -->
<user-switcher 
  currentUser="{{currentUserId}}"
  users="{{availableUsers}}"
  bind:switch="onUserSwitch">
</user-switcher>
```

#### JS处理示例

```javascript
Page({
  data: {
    currentUserId: 'child',
    availableUsers: [
      { id: 'child', name: '孩子', avatar: '/assets/child-avatar.png' },
      { id: 'parent', name: '家长', avatar: '/assets/parent-avatar.png' }
    ]
  },
  
  onLoad() {
    const userService = getApp().serviceManager.get('userService');
    const currentUserId = userService.getCurrentUserId();
    this.setData({ currentUserId });
  },
  
  onUserSwitch(e) {
    const { userId } = e.detail;
    const userService = getApp().serviceManager.get('userService');
    
    const result = userService.switchUser(userId);
    if (result.success) {
      this.setData({ currentUserId: userId });
      
      // 刷新页面数据
      this.refreshPageData();
      
      wx.showToast({
        title: `已切换到${result.user.name}`,
        icon: 'success'
      });
    }
  }
});
```

## 数据展示组件

### StarCalendar - 星星日历

显示星星获得历史的日历组件。

#### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| year | Number | - | 显示年份 |
| month | Number | - | 显示月份(1-12) |
| data | Array | [] | 星星数据数组 |

#### 事件

| 事件名 | 说明 | 参数 |
|--------|------|------|
| dateSelect | 选择日期时触发 | { date, stars } |

#### 使用示例

```html
<!-- 星星日历 -->
<star-calendar 
  year="{{currentYear}}"
  month="{{currentMonth}}"
  data="{{starCalendarData}}"
  bind:dateSelect="onDateSelect">
</star-calendar>
```

#### JS处理示例

```javascript
Page({
  data: {
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
    starCalendarData: []
  },
  
  onLoad() {
    this.loadStarCalendarData();
  },
  
  async loadStarCalendarData() {
    const starService = getApp().serviceManager.get('starService');
    const startDate = `${this.data.currentYear}-${String(this.data.currentMonth).padStart(2, '0')}-01`;
    const endDate = `${this.data.currentYear}-${String(this.data.currentMonth).padStart(2, '0')}-31`;
    
    const records = await starService.getStarRecords('child', {
      startDate,
      endDate,
      type: 'earn'
    });
    
    // 处理数据格式
    const calendarData = this.processStarRecords(records);
    this.setData({ starCalendarData: calendarData });
  },
  
  processStarRecords(records) {
    const dataMap = {};
    
    records.forEach(record => {
      const date = record.date;
      if (!dataMap[date]) {
        dataMap[date] = 0;
      }
      dataMap[date] += record.amount;
    });
    
    return Object.keys(dataMap).map(date => ({
      date,
      stars: dataMap[date]
    }));
  },
  
  onDateSelect(e) {
    const { date, stars } = e.detail;
    wx.showToast({
      title: `${date}: ${stars}颗星`,
      icon: 'none'
    });
  }
});
```

## 组件开发最佳实践

### 1. 组件设计原则

```javascript
// ✅ 推荐：单一职责，功能明确
Component({
  properties: {
    task: Object,
    showActions: Boolean
  },
  
  methods: {
    handleComplete() {
      this.triggerEvent('complete', { task: this.data.task });
    }
  }
});

// ❌ 避免：功能过于复杂的组件
Component({
  // 包含太多不相关的功能
});
```

### 2. 属性设计

```javascript
// ✅ 推荐：提供合理的默认值
Component({
  properties: {
    type: {
      type: String,
      value: 'default'
    },
    showText: {
      type: Boolean,
      value: true
    }
  }
});
```

### 3. 事件处理

```javascript
// ✅ 推荐：使用语义化的事件名
Component({
  methods: {
    handleItemClick() {
      this.triggerEvent('select', { 
        item: this.data.item,
        timestamp: Date.now()
      });
    }
  }
});
```

### 4. 样式隔离

```javascript
// 组件JS中启用样式隔离
Component({
  options: {
    styleIsolation: 'isolated'
  }
});
```

### 5. 性能优化

```javascript
// ✅ 推荐：使用数据监听器优化性能
Component({
  observers: {
    'task.status': function(status) {
      // 只在状态变化时更新UI
      this.updateStatusDisplay(status);
    }
  }
});
```

---

**文档维护者**：开发团队  
**最后更新**：2024年12月  
**版本**：v3.0 