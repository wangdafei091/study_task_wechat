# 工具函数指南

本文档介绍学习任务微信小程序的工具函数，包括日志、批量处理、事件总线等。

---

## 工具函数目录

```
utils/
├── logger.js              # 统一日志工具
├── batchUtils.js          # 批量处理工具
├── core/
│   └── event-bus.js      # 事件总线
├── dateUtils.js           # 日期处理工具
├── constants.js           # 常量定义
└── formatUtils.js        # 格式化工具
```

---

## 1. Logger - 日志工具

统一的日志记录工具，支持环境自适应的日志级别控制。

### 日志级别

| 级别 | 数值 | 用途 | 说明 |
|------|------|------|------|
| `DEBUG` | 1 | 调试信息 | 开发阶段使用 |
| `INFO` | 2 | 一般信息 | 记录关键操作和状态 |
| `WARN` | 3 | 警告信息 | 记录潜在问题和异常情况 |
| `ERROR` | 4 | 错误信息 | 记录错误和异常 |
| `NONE` | 999 | 禁用日志 | 用于禁用日志 |

### API 方法

#### `info(module, message, data)`
记录信息日志

**参数**：
- `module` - 模块名称（字符串）
- `message` - 日志消息（字符串）
- `data` - 附加数据（对象，可选）

**示例**：
```javascript
const logger = require('../../utils/logger');

logger.info('TaskService', '任务创建成功', { taskId: 'task_123', title: '练习钢琴' });
// 输出：[TaskService] [INFO] 任务创建成功 { taskId: 'task_123', title: '练习钢琴' }
```

---

#### `warn(module, message, data)`
记录警告日志

**参数**：
- `module` - 模块名称
- `message` - 警告消息
- `data` - 附加数据（对象，可选）

**示例**：
```javascript
logger.warn('TaskService', '用户尝试访问不属于自己的任务', { userId: 'child', taskId: 'task_456' });
```

---

#### `error(module, message, error)`
记录错误日志

**参数**：
- `module` - 模块名称
- `message` - 错误消息
- `error` - 错误对象或附加数据（Error 或 Object）

**示例**：
```javascript
try {
  await taskRepository.save(task);
} catch (error) {
  logger.error('TaskService', '保存任务失败', error);
  throw error;
}
```

---

#### `debug(module, message, data)`
记录调试日志

**参数**：
- `module` - 模块名称
- `message` - 调试消息
- `data` - 附加数据（对象，可选）

**示例**：
```javascript
logger.debug('TaskService', '计算星星奖励', { points: 10, taskType: 'study' });
```

---

#### `logEvent(eventName, eventData, context)`
专门记录事件相关的日志

**参数**：
- `eventName` - 事件名称
- `eventData` - 事件数据
- `context` - 上下文信息（对象，可选）

**示例**：
```javascript
logger.logEvent('task:completed', { taskId, userId }, { source: 'userAction' });
```

---

### 日志配置

#### 日志级别控制

可以通过设置日志级别来控制输出的详细程度：

```javascript
// 设置为 INFO 级别（默认）
logger.setLevel('INFO');

// 设置为 DEBUG 级别（开发时）
logger.setLevel('DEBUG');

// 禁用日志
logger.setLevel('NONE');
```

---

### 最佳实践

1. **使用有意义的模块名称**：
```javascript
// ✅ 推荐：使用具体的服务/组件名称
logger.info('TaskService', '...');
logger.info('ProgressRing', '...');
logger.info('IndexPage', '...');

// ❌ 避免：过于通用的名称
logger.info('Module', '...');
```

2. **结构化数据记录**：
```javascript
// ✅ 推荐：使用对象结构
logger.info('TaskService', '任务创建成功', {
  taskId: task.id,
  title: task.title,
  type: task.type
});

// ❌ 避免：字符串拼接
logger.info('TaskService', `任务创建成功: ${task.id}, ${task.title}`);
```

3. **关键操作必须记录**：
- ✅ 任务状态变更
- ✅ 星星计算和分配
- ✅ 重要数据操作
- ✅ 异步操作开始和结束
- ✅ 错误和异常情况
- ✅ 业务规则执行

4. **避免过度日志**：
- ❌ 不要在循环中记录重复信息
- ❌ 不要记录过大的对象
- ❌ 不要记录敏感信息（如用户密码、token）

---

## 2. BatchUtils - 批量处理工具

提供批量处理数据的通用函数，避免UI阻塞。

### API 方法

#### `batchProcess(items, processFn, options, callback)`

批量处理数据，将大量数据分批处理，避免阻塞UI。

**参数**：
- `items` - 需要处理的数据项数组
- `processFn` - 处理单个项的函数
- `options` - 配置选项（可选）
  - `batchSize` - 每批处理的数量，默认 50
  - `delay` - 批次间延迟毫秒数，默认 0
  - `showProgress` - 是否显示进度，默认 true
  - `progressTitle` - 进度标题，默认 '处理中'
- `callback` - 全部处理完成后的回调函数（可选）

**返回**：无返回值

**示例**：
```javascript
const batchUtils = require('../../utils/batchUtils');

// 基本用法
await batchUtils.batchProcess(
  tasks,                    // 要处理的任务数组
  (task) => {              // 处理函数
    return taskService.completeTask(task.id);
  },
  {
    batchSize: 50,          // 每批 50 个
    delay: 10,              // 批次间延迟 10 毫秒
    showProgress: true,       // 显示进度
    progressTitle: '保存任务中'
  }
);
```

---

#### `groupBy(array, keyFn)`

将数组分组处理。

**参数**：
- `array` - 要分组的数组
- `keyFn` - 提取分组键的函数

**返回**：分组结果对象

**示例**：
```javascript
// 按任务类型分组
const tasks = await taskService.getAllTasks();
const grouped = batchUtils.groupBy(tasks, task => task.type);

// 结果：{ study: [...], habit: [...], interest: [...] }
```

---

#### `chunk(array, size)`

按指定数量对数组进行分块。

**参数**：
- `array` - 要分块的数组
- `size` - 每块的大小

**返回**：分块后的二维数组

**示例**：
```javascript
const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const chunks = batchUtils.chunk(items, 3);

// 结果：[[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]
```

---

### 最佳实践

1. **使用批量处理避免UI阻塞**：
```javascript
// ✅ 推荐：使用 batchProcess
await batchUtils.batchProcess(largeDataArray, processItem, options);

// ❌ 避免：直接循环处理
for (const item of largeDataArray) {
  await processItem(item);  // 会阻塞UI
}
```

2. **合理设置批次大小**：
- 默认值 50 适用于大多数场景
- CPU 密集型操作可减小批次（如 20-30）
- I/O 密集型操作可增大批次（如 100-200）

3. **添加延迟避免卡顿**：
```javascript
// ✅ 推荐：添加延迟
await batchUtils.batchProcess(items, processFn, { delay: 10 });

// ❌ 避免：无延迟
await batchUtils.batchProcess(items, processFn, { delay: 0 });
```

---

## 3. EventBus - 事件总线

提供统一的事件发布/订阅机制，用于组件间的松耦合通信。

### API 方法

#### `on(event, callback, options)`

注册事件监听器。

**参数**：
- `event` - 事件名称（字符串）
- `callback` - 回调函数
- `options` - 配置选项（可选）
  - `once` - 是否为一次性监听器（默认 false）

**返回**：取消监听的函数

**示例**：
```javascript
const eventBus = require('../../utils/core/event-bus');

// 普通监听
const offTaskCompleted = eventBus.on('task:completed', (event) => {
  console.log('任务完成', event.detail);
});

// 一次性监听（自动取消）
const offOnce = eventBus.on('reward:claimed', (event) => {
  console.log('奖励兑换', event.detail);
}, { once: true });
```

---

#### `off(event, callback)`

取消事件监听器。

**参数**：
- `event` - 事件名称
- `callback` - 回调函数（与 on 时传入的相同引用）

**返回**：无

**示例**：
```javascript
// 取消监听
offTaskCompleted();  // 取消 task:completed 事件监听
```

---

#### `publish(eventName, eventData)`

发布事件。

**参数**：
- `eventName` - 事件名称
- `eventData` - 事件数据（对象）

**返回**：无

**示例**：
```javascript
// 发布事件
eventBus.publish('task:completed', {
  taskId: 'task_123',
  userId: 'child',
  points: 10
});
```

---

#### `once(event, callback)`

注册一次性事件监听器（触发后自动取消）。

**参数**：
- `event` - 事件名称
- `callback` - 回调函数

**返回**：取消监听的函数

**示例**：
```javascript
const offOnce = eventBus.once('app:ready', (event) => {
  console.log('应用已就绪', event.detail);
  // 监听器会自动取消
});
```

---

### 事件总线特性

#### 性能优化

```javascript
// 启用性能优化
eventBus.setOptimization(true);

// 调试模式
eventBus.setDebugMode(true);
```

#### 事件历史

```javascript
// 获取最近的事件历史
const history = eventBus.getEventHistory();

// 获取事件统计
const stats = eventBus.getEventStats();
```

---

### 最佳实践

1. **使用事件总线解耦组件**：
```javascript
// ✅ 推荐：通过事件通信
// 子组件
this.triggerEvent('customEvent', { value: someValue });

// 父组件
<my-component bind:customEvent="onCustomEvent" />
```

2. **在页面卸载时取消监听**：
```javascript
Page({
  onLoad() {
    this.offTaskCompleted = eventBus.on('task:completed', this.handleTaskCompleted);
  },

  onUnload() {
    this.offTaskCompleted();  // 取消监听，避免内存泄漏
  }
});
```

3. **事件名称使用命名空间**：
```javascript
// ✅ 推荐：使用冒号分隔命名空间
'task:completed'      // 任务相关事件
'reward:claimed'      // 奖励相关事件
'message:created'      // 消息相关事件

// ❌ 避免：过于通用的事件名
'completed'            // 容易冲突
'changed'             // 含义不清
```

---

## 4. DateUtils - 日期处理工具

日期相关的工具函数。

### 主要方法

```javascript
const dateUtils = require('../../utils/dateUtils');

// 获取今日日期字符串
dateUtils.getTodayString();  // 返回 'YYYY-MM-DD'

// 格式化日期
dateUtils.formatDate(date, 'YYYY年MM月DD日');

// 计算日期差
dateUtils.diffDays(date1, date2);  // 返回天数差

// 判断日期是否在范围
dateUtils.isDateInRange(date, startDate, endDate);

// 获取日期所在周的周一
dateUtils.getMondayOfWeek(date);

// 判断是否为今天
dateUtils.isToday(dateString);
```

---

## 5. FormatUtils - 格式化工具

格式化相关的工具函数。

### 主要方法

```javascript
const formatUtils = require('../../utils/formatUtils');

// 格式化星星数量
formatUtils.formatStars(100);  // 返回 '100⭐'

// 格式化日期
formatUtils.formatDate(dateString);  // 返回 '2024年12月01日'

// 格式化时间
formatUtils.formatTime(timeString);  // 返回 '18:30'
```

---

## 6. Constants - 常量定义

项目中的常量定义。

### 主要常量

```javascript
const {
  // 任务类型
  TaskType,
  TaskStatus,
  RepeatType,
  StarExpiryType,

  // 事件类型
  EVENTS,

  // 错误消息
  ERROR_MESSAGES
} = require('../../utils/constants');
```

### 使用示例

```javascript
// 检查任务类型
if (task.type === TaskType.STUDY) {
  // 学习任务逻辑
}

// 发布事件
eventBus.publish(EVENTS.TASK_COMPLETED, eventData);
```

---

## 工具函数使用建议

### 日志记录策略

1. **关键操作必须记录日志**：
   - 任务状态变更
   - 星星计算和分配
   - 奖励兑换
   - 数据一致性检查和修复

2. **使用适当的日志级别**：
   - `DEBUG`：开发调试信息
   - `INFO`：正常业务流程
   - `WARN`：潜在问题
   - `ERROR`：错误和异常

### 批量处理场景

1. **大批量数据操作**：
   - 保存大量任务
   - 删除大量记录
   - 更新多条消息

2. **异步操作批量处理**：
   - 避免阻塞 UI
   - 显示进度提示

### 事件总线使用

1. **跨组件通信**：
   - 页面 ↔ 组件
   - 组件 ↔ 组件

2. **服务间解耦**：
   - 通过事件总线代替直接调用

---

**最后更新**：2026-02-28
**维护者**：项目维护团队
