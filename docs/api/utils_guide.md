# 工具函数使用指南

本文档介绍了项目中可用的各种工具函数的用途和使用方法，帮助开发人员快速了解和使用这些通用功能。

## 任务管理工具 (taskManager.js)

`utils/taskManager.js` 提供任务的增删改查和数据同步功能。

### 主要函数

```javascript
// 获取所有任务
taskManager.getAllTasks(callback)

// 获取今日任务
taskManager.getTodayTasks(callback)

// 创建新任务
taskManager.createTask(task, callback)

// 更新任务状态
taskManager.updateTaskStatus(taskId, status, callback)

// 编辑任务
taskManager.editTask(taskId, taskData, callback)

// 删除任务
taskManager.deleteTask(taskId, callback)

// 检查即将到期的任务
taskManager.checkUpcomingTasks(callback)

// 计算任务进度
taskManager.calculateTaskProgress(tasks, callback)

// 获取任务统计数据
taskManager.getTaskStatistics(dateRange, callback)
```

### 使用示例

```javascript
// 获取所有任务
taskManager.getAllTasks(tasks => {
  console.log(`[Page] 获取所有任务: ${tasks.length}个`);
  this.setData({ taskList: tasks });
});

// 创建新任务
const newTask = {
  title: '练习钢琴',
  type: 'interest', 
  date: '2023-06-01',
  duration: 30
};
taskManager.createTask(newTask, result => {
  if (result.success) {
    console.log(`[Page] 创建任务成功: ${result.taskId}`);
  }
});
```

## 消息管理工具 (messageManager.js)

`utils/messageManager.js` 处理应用内消息通知，包括任务提醒、系统消息等。

### 主要函数

```javascript
// 获取所有消息
messageManager.getAllMessages(callback)

// 创建任务相关消息
messageManager.createTaskMessage(task, action, callback)

// 创建系统消息
messageManager.createSystemMessage(content, type, callback)

// 创建奖励相关消息
messageManager.createRewardMessage(reward, action, callback)

// 标记消息为已读
messageManager.markMessageAsRead(messageId, callback)

// 删除消息
messageManager.deleteMessage(messageId, callback)

// 清除所有消息
messageManager.clearAllMessages(callback)

// 获取未读消息数量
messageManager.getUnreadCount(callback)
```

### 使用示例

```javascript
// 创建任务完成消息
messageManager.createTaskMessage(task, 'completed', result => {
  console.log(`[Page] 创建任务完成消息: ${result.messageId}`);
});

// 获取未读消息数量
messageManager.getUnreadCount(count => {
  this.setData({ unreadCount: count });
  if (count > 0) {
    wx.showTabBarRedDot({ index: 2 });
  }
});
```

## 日期处理工具 (dateUtils.js)

`utils/dateUtils.js` 提供日期格式化和计算功能。

### 主要函数

```javascript
// 格式化日期为YYYY-MM-DD
dateUtils.formatDate(date)

// 格式化日期时间为YYYY-MM-DD HH:MM
dateUtils.formatDateTime(date)

// 获取当前日期字符串
dateUtils.getTodayString()

// 获取当前时间戳
dateUtils.getCurrentTimestamp()

// 计算两个日期之间的天数
dateUtils.getDaysBetween(startDate, endDate)

// 获取星期几的显示文本
dateUtils.getDayOfWeekText(dayOfWeek)

// 获取当月的日历数据
dateUtils.getMonthCalendar(year, month)

// 检查日期是否是今天
dateUtils.isToday(date)

// 获取指定日期所在周的起止日期
dateUtils.getWeekRange(date)
```

### 使用示例

```javascript
// 格式化日期
const today = new Date();
const formattedDate = dateUtils.formatDate(today); // 如 "2023-06-01"

// 获取日历数据
const calendar = dateUtils.getMonthCalendar(2023, 5); // 获取2023年6月的日历数据

// 检查是否是今天
const isToday = dateUtils.isToday('2023-06-01');
```

## 任务处理工具 (taskUtils.js)

`utils/taskUtils.js` 提供任务数据处理和计算功能。

### 主要函数

```javascript
// 根据类型筛选任务
taskUtils.filterTasksByType(tasks, type)

// 根据状态筛选任务
taskUtils.filterTasksByStatus(tasks, status)

// 计算连续完成天数
taskUtils.calculateStreak(tasks)

// 生成任务热力图数据
taskUtils.generateHeatmapData(tasks, startDate, endDate)

// 按日期分组任务
taskUtils.groupTasksByDate(tasks)

// 获取任务类型显示文本
taskUtils.getTaskTypeText(type)

// 获取任务状态显示文本
taskUtils.getTaskStatusText(status)

// 检查任务是否已逾期
taskUtils.isTaskOverdue(task)

// 生成任务统计数据
taskUtils.generateTaskStatistics(tasks, dateRange)
```

### 使用示例

```javascript
// 筛选学习类型的任务
const studyTasks = taskUtils.filterTasksByType(allTasks, 'study');

// 生成热力图数据
const heatmapData = taskUtils.generateHeatmapData(
  tasks, 
  '2023-01-01', 
  '2023-06-30'
);

// 任务分组
const groupedTasks = taskUtils.groupTasksByDate(tasks);
```

## UI工具函数 (uiUtils.js)

`utils/uiUtils.js` 提供界面相关的辅助功能。

### 主要函数

```javascript
// 显示加载提示
uiUtils.showLoading(title)

// 隐藏加载提示
uiUtils.hideLoading()

// 显示成功提示
uiUtils.showSuccess(message)

// 显示错误提示
uiUtils.showError(message)

// 显示确认对话框
uiUtils.showConfirm(title, content, callback)

// 获取任务类型对应的主题颜色
uiUtils.getThemeColor(type)

// 获取任务状态对应的颜色
uiUtils.getStatusColor(status)

// 获取图标路径
uiUtils.getIconPath(name)

// 震动反馈
uiUtils.vibrateShort()

// 获取系统信息
uiUtils.getSystemInfo()
```

### 使用示例

```javascript
// 显示加载提示
uiUtils.showLoading('数据加载中');

// 显示确认对话框
uiUtils.showConfirm(
  '删除任务', 
  '确定要删除这个任务吗？', 
  confirmed => {
    if (confirmed) {
      taskManager.deleteTask(taskId);
    }
  }
);

// 获取主题颜色
const studyColor = uiUtils.getThemeColor('study'); // 返回 #4285F4
```

## 单位工具 (unit.js)

`utils/unit.js` 处理不同设备屏幕尺寸的适配。

### 主要函数

```javascript
// 获取视口信息
unit.getViewportInfo()

// 判断是否全面屏设备
unit.isFullScreenDevice()

// 获取内容区域高度
unit.getContentHeight(options)

// rpx转换为px
unit.rpxToPx(rpx)

// px转换为rpx
unit.pxToRpx(px)

// 获取安全区域信息
unit.getSafeArea()

// 获取导航栏高度
unit.getNavBarHeight()

// 判断是否为高度较短设备
unit.isShortDevice()
```

### 使用示例

```javascript
// 转换单位
const pxValue = unit.rpxToPx(90); // 将90rpx转换为px值

// 获取内容区域高度
const contentHeight = unit.getContentHeight({
  excludeNav: true,
  excludeTabBar: true
}); 

// 获取安全区域信息
const safeArea = unit.getSafeArea();
```

## 反馈工具 (feedbackUtils.js)

`utils/feedbackUtils.js` 处理用户反馈相关功能。

### 主要函数

```javascript
// 收集用户反馈
feedbackUtils.collectFeedback(content, type, callback)

// 记录日志
feedbackUtils.logEvent(eventName, params)

// 记录页面访问
feedbackUtils.logPageView(pageName)

// 记录错误信息
feedbackUtils.logError(error, context)

// 获取应用版本信息
feedbackUtils.getVersionInfo()
```

### 使用示例

```javascript
// 记录页面访问
feedbackUtils.logPageView('task-detail');

// 收集用户反馈
feedbackUtils.collectFeedback(
  '希望增加更多的任务类型', 
  'suggestion',
  result => {
    if (result.success) {
      uiUtils.showSuccess('反馈已提交');
    }
  }
);

// 记录事件
feedbackUtils.logEvent('task_created', {
  taskType: 'study',
  taskDuration: 60
});
``` 