# 工具函数使用指南

本文档介绍了项目中可用的各种工具函数的用途和使用方法，帮助开发人员快速了解和使用这些通用功能。

## 服务管理器 (serviceManager.js)

`utils/serviceManager.js` 提供了统一的服务实例管理，是连接UI层与领域服务的桥梁。

### 主要函数

```javascript
// 获取服务实例
serviceManager.getService(serviceName)

// 注册服务
serviceManager.registerService(serviceName, serviceClass, options)

// 重置服务实例
serviceManager.resetService(serviceName)

// 初始化所有服务
serviceManager.initServices()
```

### 使用示例

```javascript
// 获取服务管理器
const serviceManager = getApp().serviceManager;

// 获取任务服务
const taskService = serviceManager.getService('taskService');

// 使用服务
taskService.getAllTasks()
  .then(tasks => {
    this.setData({ taskList: tasks });
  })
  .catch(error => {
    logger.error('TaskPage', '获取任务失败', error);
  });
```

## 任务服务 (TaskService)

`services/task-service.js` 提供任务的增删改查和数据同步功能，是任务管理领域的核心服务类。

### 主要方法

```javascript
// 获取所有任务
async getAllTasks()

// 获取今日任务
async getTodayTasks()

// 创建新任务
async createTask(taskData)

// 更新任务状态
async updateTaskStatus(taskId, status)

// 编辑任务
async updateTask(taskId, changes)

// 删除任务
async deleteTask(taskId)

// 检查即将到期的任务
async checkUpcomingTasks()

// 计算任务进度
async calculateTaskProgress()

// 获取任务统计数据
async getTaskStatistics(dateRange)
```

### 使用示例

```javascript
// 获取服务实例
const taskService = getApp().serviceManager.getService('taskService');

// 获取所有任务
const tasks = await taskService.getAllTasks();
console.log(`[Page] 获取所有任务: ${tasks.length}个`);
this.setData({ taskList: tasks });

// 创建新任务
const newTask = {
  title: '练习钢琴',
  type: 'interest', 
  date: '2023-06-01',
  duration: 30
};
const result = await taskService.createTask(newTask);
if (result.success) {
  console.log(`[Page] 创建任务成功: ${result.task.id}`);
}
```

## 消息服务 (MessageService)

`services/message-service.js` 处理应用内消息通知，包括任务提醒、系统消息等。

### 主要方法

```javascript
// 获取所有消息
async getAllMessages()

// 创建任务相关消息
async createTaskMessage(task, action)

// 创建系统消息
async createSystemMessage(content, type)

// 创建奖励相关消息
async createRewardMessage(reward, action)

// 标记消息为已读
async markMessageAsRead(messageId)

// 删除消息
async deleteMessage(messageId)

// 清除所有消息
async clearAllMessages()

// 获取未读消息数量
async getUnreadCount()
```

### 使用示例

```javascript
// 获取服务实例
const messageService = getApp().serviceManager.getService('messageService');

// 创建任务完成消息
const result = await messageService.createTaskMessage(task, 'completed');
console.log(`[Page] 创建任务完成消息: ${result.message.id}`);

// 获取未读消息数量
const count = await messageService.getUnreadCount();
this.setData({ unreadCount: count });
if (count > 0) {
  wx.showTabBarRedDot({ index: 2 });
}
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
      const taskService = getApp().serviceManager.getService('taskService');
      taskService.deleteTask(taskId);
    }
  }
);

// 获取主题颜色
const studyColor = uiUtils.getThemeColor('study'); // 返回 #4285F4
```

## 日志系统 (logger.js, log-config.js, log-analyzer.js)

### 基本日志记录 (logger.js)

[utils/logger.js](mdc:utils/logger.js) 提供统一的日志记录功能，支持不同日志级别和模块化日志。

```javascript
// 导入日志模块
const logger = require('../utils/logger');

// 记录不同级别的日志
logger.debug('模块名', '调试信息', { 详细数据 });
logger.info('模块名', '一般信息', { 相关数据 });
logger.warn('模块名', '警告信息', { 警告数据 });
logger.error('模块名', '错误信息', 错误对象);
```

### 日志配置 (log-config.js)

[utils/log-config.js](mdc:utils/log-config.js) 提供日志级别配置和模块特定日志控制。

```javascript
// 导入日志配置模块
const logConfig = require('../utils/log-config');

// 设置默认日志级别
logConfig.setDefaultLogLevel('debug'); // 可选值：'debug'、'info'、'warn'、'error'、'none'

// 为特定模块设置日志级别
logConfig.setModuleLogLevel('TaskService', 'info');
logConfig.setModuleLogLevel('BaseRepository', 'warn');

// 应用环境自适应配置
logConfig.applyEnvironmentDefaults();
```

#### 模块特定日志记录器

```javascript
// 创建模块特定的日志记录器
const moduleLogger = logConfig.createModuleLogger('模块名');

// 使用模块特定的日志记录器
moduleLogger.debug('调试信息', { 数据 });
moduleLogger.info('一般信息');
moduleLogger.warn('警告信息');
moduleLogger.error('错误', new Error('发生错误'));
```

### 日志分析 (log-analyzer.js)

[utils/log-analyzer.js](mdc:utils/log-analyzer.js) 用于识别代码中直接使用console的地方，帮助开发者迁移到统一日志系统。

```javascript
// 导入日志分析器
const logAnalyzer = require('../utils/log-analyzer');

// 初始化分析器（通常在app.js中已自动初始化）
logAnalyzer.init();

// 获取分析报告
const report = logAnalyzer.getReport();
console.log(`发现${report.totalFindings}处直接使用console的代码`);
```

### 最佳实践

1. **始终使用模块名**：确保每个日志调用都包含模块名，便于过滤和定位问题
   ```javascript
   // 推荐
   logger.info('TaskService', '任务创建成功', { taskId: id });
   // 不推荐
   logger.info('任务创建成功', { taskId: id });
   ```

2. **适当使用日志级别**：
   - `debug`: 详细的开发调试信息，仅在开发环境显示
   - `info`: 一般操作信息，记录正常流程
   - `warn`: 潜在问题警告，需要关注但不影响运行
   - `error`: 错误信息，影响功能正常运行

3. **记录关键点**：
   - 函数入口/出口的参数和返回值
   - 关键业务状态变更
   - 异步操作的开始和完成
   - 所有错误和异常情况

4. **避免敏感信息**：不要记录用户密码、令牌等敏感信息

## 批量处理工具 (batchUtils.js)

`utils/batchUtils.js` 提供批量处理大量数据的功能，避免UI阻塞。

### 主要函数

```javascript
// 批量处理数据
batchUtils.batchProcess(items, processFn, options, callback)

// 批量存储数据
batchUtils.batchStorage(operations, callback)

// 延迟执行函数
batchUtils.delayExecute(fn, delay)
```

### 使用示例

```javascript
const batchUtils = require('../../utils/batchUtils');

// 批量处理任务
batchUtils.batchProcess(
  tasks,
  task => {
    // 处理单个任务
    task.processed = true;
  },
  { batchSize: 50, delay: 10, showProgress: true },
  () => {
    logger.info('TaskManager', '所有任务处理完成', { count: tasks.length });
  }
);

// 批量存储数据
const operations = [
  { key: 'task_1', data: taskData1 },
  { key: 'task_2', data: taskData2 },
  // 更多存储操作...
];

batchUtils.batchStorage(operations, () => {
  logger.info('StorageManager', '批量存储完成', { count: operations.length });
});

// 延迟执行
batchUtils.delayExecute(() => {
  // 执行非紧急任务
  calculateStatistics();
}, 500);
```

### 批量处理选项

批量处理支持以下选项：

```javascript
{
  batchSize: 50,       // 每批处理的数据项数量
  delay: 0,            // 批次间延迟时间(毫秒)
  showProgress: true,  // 是否显示进度提示
  progressTitle: '处理中' // 进度提示文本
}
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

## 存储工具 (storageUtils.js)

`utils/storageUtils.js` 提供对微信存储API的封装，支持数据压缩和批量操作。

### 主要函数

```javascript
// 设置存储项
storageUtils.setItem(key, data, callback)

// 获取存储项
storageUtils.getItem(key, defaultValue, callback)

// 删除存储项
storageUtils.removeItem(key, callback)

// 批量获取存储项
storageUtils.getItems(keys, callback)

// 批量设置存储项
storageUtils.setItems(items, callback)

// 清除所有存储
storageUtils.clearAll(callback)

// 获取存储信息
storageUtils.getStorageInfo(callback)
```

## 数据分析工具 (analyticsManager.js)

`utils/analyticsManager.js` 提供数据统计和分析功能。

### 主要函数

```javascript
// 生成任务完成统计数据
analyticsManager.generateTaskCompletionStats(startDate, endDate)

// 生成星星获得统计数据
analyticsManager.generateStarEarningStats(startDate, endDate)

// 生成任务类型分布统计
analyticsManager.generateTaskTypeDistribution(tasks)

// 计算任务完成率趋势
analyticsManager.calculateCompletionRateTrend(startDate, endDate, interval)

// 生成热力图数据
analyticsManager.generateHeatmapData(startDate, endDate)
```

### 使用示例

```javascript
const analyticsManager = require('../../utils/analyticsManager');

// 生成30天内的任务完成统计
analyticsManager.generateTaskCompletionStats(
  dateUtils.getDateBefore(30), 
  dateUtils.getTodayString()
).then(stats => {
  this.setData({ completionStats: stats });
});

// 生成任务类型分布
const distribution = analyticsManager.generateTaskTypeDistribution(tasks);
```

## 反馈工具 (feedbackUtils.js)

`utils/feedbackUtils.js` 处理用户反馈相关功能。

### 主要函数

```javascript
// 收集用户反馈
feedbackUtils.collectFeedback(content, type)

// 记录日志
feedbackUtils.logEvent(eventName, params)

// 记录页面访问
feedbackUtils.logPageView(pageName)

// 记录错误信息
feedbackUtils.logError(error, context)

// 获取应用版本信息
feedbackUtils.getVersionInfo()
```

## 格式化工具 (formatUtils.js)

`utils/formatUtils.js` 提供各种数据格式化功能。

### 主要函数

```javascript
// 格式化时间段显示
formatUtils.formatDuration(minutes)

// 格式化星星数量显示
formatUtils.formatStarCount(count)

// 格式化日期区间
formatUtils.formatDateRange(startDate, endDate)

// 格式化百分比
formatUtils.formatPercentage(value)

// 格式化时间点
formatUtils.formatTimePoint(timeString)
```

### 使用示例

```javascript
const formatUtils = require('../../utils/formatUtils');

// 格式化持续时间
const duration = formatUtils.formatDuration(120); // 返回 "2小时"

// 格式化星星数量
const stars = formatUtils.formatStarCount(1234); // 返回 "1,234"
``` 