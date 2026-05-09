# 问题排查指南

本文档提供学习任务微信小程序常见问题的排查方法和解决方案，基于当前的DDD架构设计。

## 用户身份与邀请码问题

### 问题：查看者家长修改自己昵称仍返回 `FAMILY_MANAGER_REQUIRED`

**现象**：日志里出现 `PATCH /api/users/:userId/nickname`，并返回 `403`，错误码为 `FAMILY_MANAGER_REQUIRED`。

**原因**：自改昵称仍走了成员管理接口，旧链路会把查看者当成“修改成员信息”处理。

**解决方案**：
- 自己修改自己的昵称必须走 `PATCH /api/users/current/profile`
- 如果日志里仍然出现 `PATCH /api/users/:userId/nickname`，说明前端仍在使用旧版本调用路径或缓存未刷新
- 如果 `PATCH /api/users/current/profile` 返回 `200`，说明自改昵称链路已经生效

### 问题：邀请中心看到的家庭邀请码复制后提示已过期

**现象**：邀请码中心页面里能看到邀请码，但复制到目标用户后，目标页提示“邀请码已过期，请联系邀请人重新获取”。

**原因**：家庭邀请码默认 24 小时失效；如果页面长时间停留，或者复制的是旧的本地展示状态，就可能把已经过期的码继续发出去。

**解决方案**：
- 在邀请中心重新进入或刷新页面后再复制/分享
- 以页面重新拉取到的最新摘要为准，不要直接复用长时间未刷新的旧 code
- 如果按钮仍然可点但实际已失效，优先检查是否停留在旧页面状态或复制了旧缓存内容

## 架构相关问题

### ServiceManager相关问题

#### 问题：服务获取失败
**现象**：调用`serviceManager.get('serviceName')`返回undefined

**排查步骤**：
1. 检查ServiceManager是否正确初始化
```javascript
// 在app.js中确认
console.log('ServiceManager状态:', this.serviceManager);
```

2. 检查服务名称是否正确
```javascript
// 可用的服务名称
const availableServices = [
  'taskService',
  'starService', 
  'rewardService',
  'messageService',
  'userService'
];
```

**解决方案**：
- 确保在app.js中正确初始化ServiceManager
- 使用正确的服务名称
- 检查服务是否在ServiceManager中注册

#### 问题：服务循环依赖
**现象**：服务初始化时出现循环依赖错误

**解决方案**：
```javascript
// 在服务构造函数中不要直接注入其他服务
class TaskService {
  constructor() {
    this.starService = null; // 延迟注入
  }
  
  // 通过init方法延迟注入依赖
  init(serviceManager) {
    this.starService = serviceManager.get('starService');
  }
}
```

### DDD架构问题

#### 问题：跨层级调用
**现象**：页面直接调用Repository或直接实例化服务

**错误示例**：
```javascript
// ❌ 错误：页面直接调用Repository
const taskRepository = new TaskRepository();
const tasks = await taskRepository.findAll();

// ❌ 错误：直接实例化服务
const taskService = new TaskService();
```

**正确做法**：
```javascript
// ✅ 正确：通过ServiceManager获取服务
const taskService = getApp().serviceManager.get('taskService');
const result = await taskService.getAllTasks();
```

## 数据存储问题

### 存储数据丢失

#### 问题：数据保存后丢失
**排查步骤**：
1. 检查存储操作是否成功
```javascript
try {
  await storageAdapter.set('tasks', tasks);
  logger.info('Storage', '数据保存成功', { count: tasks.length });
} catch (error) {
  logger.error('Storage', '数据保存失败', error);
}
```

2. 检查小程序存储限制
```javascript
// 获取存储信息
wx.getStorageInfo({
  success: (res) => {
    console.log('存储使用情况:', res);
    if (res.currentSize > 8000) { // 接近10MB限制
      logger.warn('Storage', '存储空间不足', res);
    }
  }
});
```

**解决方案**：
- 定期清理过期数据
- 使用数据压缩
- 分批存储大量数据

### 数据一致性问题

#### 问题：星星数量与分组不一致
**现象**：总星星数与分组中星星总和不匹配

**排查方法**：
```javascript
// 使用StarService的数据一致性检查
const starService = getApp().serviceManager.get('starService');
const result = await starService.checkDataConsistency('child');
console.log('数据一致性检查结果:', result);
```

**解决方案**：
- 使用StarService提供的修复方法
- 定期执行数据一致性检查
- 在关键操作后验证数据状态

## 任务管理问题

### 任务状态异常

#### 问题：任务完成后星星未增加
**排查步骤**：
1. 检查任务是否已经获得过星星
```javascript
if (task.starAwarded) {
  logger.warn('TaskService', '任务已经获得过星星', { taskId: task.id });
}
```

2. 检查StarService是否正常工作
```javascript
const starService = getApp().serviceManager.get('starService');
const result = await starService.addStars('child', 10, 'week', task.id, '测试');
console.log('添加星星结果:', result);
```

**解决方案**：
- 重置task.starAwarded为false
- 手动调用StarService添加星星
- 检查任务完成流程的EventBus事件

#### 问题：必做任务惩罚不生效
**排查步骤**：
1. 检查任务是否标记为必做
```javascript
console.log('任务必做状态:', task.isRequired);
console.log('惩罚应用状态:', task.penaltyApplied);
```

2. 检查惩罚逻辑
```javascript
const taskService = getApp().serviceManager.get('taskService');
const result = await taskService.checkRequiredTasks();
console.log('必做任务检查结果:', result);
```

## 奖励兑换问题

### 兑换失败

#### 问题：星星足够但兑换失败
**排查步骤**：
1. 检查用户ID一致性
```javascript
const userService = getApp().serviceManager.get('userService');
const currentUserId = userService.getCurrentUserId();
console.log('当前用户ID:', currentUserId);

const starService = getApp().serviceManager.get('starService');
const balance = await starService.getStarBalance(currentUserId);
console.log('星星余额:', balance);
```

2. 检查奖励状态
```javascript
const rewardService = getApp().serviceManager.get('rewardService');
const reward = await rewardService.getRewardById(rewardId);
console.log('奖励状态:', reward);
```

**常见原因**：
- 用户ID不一致（parent vs child）
- 奖励已被禁用或删除
- 星星余额计算错误

## 消息系统问题

### 消息未显示

#### 问题：系统消息创建但未显示
**排查步骤**：
1. 检查消息是否成功创建
```javascript
const messageService = getApp().serviceManager.get('messageService');
const messages = await messageService.getAllMessages('child');
console.log('所有消息:', messages);
```

2. 检查消息过滤条件
```javascript
const unreadMessages = await messageService.getUnreadMessages('child');
console.log('未读消息:', unreadMessages);
```

## 性能问题

### 页面卡顿

#### 问题：大量数据处理导致界面卡顿
**解决方案**：
```javascript
// 使用批量处理工具
const batchUtils = require('../../utils/batchUtils');

await batchUtils.batchProcess(
  tasks,
  (task) => this.processTask(task),
  {
    batchSize: 50,
    delay: 10,
    showProgress: true
  }
);
```

#### 问题：频繁setData导致性能问题
**解决方案**：
```javascript
// 合并多次setData
const updates = {};
updates.tasks = newTasks;
updates.loading = false;
updates.lastUpdate = Date.now();

this.setData(updates);
```

## 事件系统问题

### EventBus事件未触发

#### 问题：发布事件但监听器未响应
**排查步骤**：
1. 检查事件名称是否一致
```javascript
// 发布端
eventBus.emit('task:completed', task);

// 监听端
eventBus.on('task:completed', this.handleTaskCompleted);
```

2. 检查监听器是否正确绑定
```javascript
// 确保this上下文正确
eventBus.on('task:completed', this.handleTaskCompleted.bind(this));
```

3. 检查事件是否被取消订阅
```javascript
// 在页面onUnload中确保清理事件监听
onUnload() {
  const eventBus = getApp().eventBus;
  eventBus.off('task:completed', this.handleTaskCompleted);
}
```

## 日志和调试

### 日志记录问题

#### 问题：关键操作缺少日志
**解决方案**：
```javascript
const logger = require('../../utils/logger');

// 在关键操作点添加日志
logger.info('TaskService', '开始创建任务', { taskData });

try {
  const result = await this.createTask(taskData);
  logger.info('TaskService', '任务创建成功', { taskId: result.id });
  return result;
} catch (error) {
  logger.error('TaskService', '任务创建失败', { taskData, error });
  throw error;
}
```

### 调试技巧

#### 开发环境调试
```javascript
// 在app.js中设置调试模式
App({
  globalData: {
    debugMode: true // 开发环境设为true
  },
  
  onLaunch() {
    if (this.globalData.debugMode) {
      // 启用详细日志
      console.log('调试模式已启用');
    }
  }
});
```

#### 生产环境问题排查
```javascript
// 使用logger记录关键信息
logger.info('App', '应用启动', {
  version: '1.0.0',
  timestamp: Date.now(),
  userAgent: wx.getSystemInfoSync()
});
```

## 常见错误代码

### 错误码对照表

| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| TASK_NOT_FOUND | 任务不存在 | 检查任务ID是否正确 |
| INSUFFICIENT_STARS | 星星不足 | 检查用户星星余额 |
| REWARD_NOT_AVAILABLE | 奖励不可用 | 检查奖励状态 |
| USER_NOT_FOUND | 用户不存在 | 检查用户ID |
| SERVICE_NOT_INITIALIZED | 服务未初始化 | 检查ServiceManager |

### 错误处理最佳实践

```javascript
// 统一错误处理格式
async handleOperation() {
  try {
    const result = await this.performOperation();
    return { success: true, data: result };
  } catch (error) {
    logger.error('ComponentName', '操作失败', {
      operation: 'operationName',
      error: error.message,
      stack: error.stack
    });
    
    return { 
      success: false, 
      error: error.code || 'UNKNOWN_ERROR',
      message: error.message || '操作失败，请重试'
    };
  }
}
```

## 紧急修复指南

### 数据丢失恢复

#### 紧急恢复任务数据
```javascript
// 在控制台执行数据恢复
const taskService = getApp().serviceManager.get('taskService');
const backupTasks = [
  // 备份任务数据
];

for (const taskData of backupTasks) {
  await taskService.createTask(taskData);
}
```

#### 紧急重置星星数据
```javascript
const starService = getApp().serviceManager.get('starService');
await starService.resetStarData('child');
```

### 服务重启

#### 重启ServiceManager
```javascript
// 在app.js中重新初始化
const serviceManager = require('./utils/service-manager');
this.serviceManager = serviceManager;
this.serviceManager.init();
```

## 预防性措施

### 定期检查

```javascript
// 在app.js中添加定期检查
App({
  onLaunch() {
    this.startHealthCheck();
  },
  
  startHealthCheck() {
    setInterval(() => {
      this.checkSystemHealth();
    }, 60000); // 每分钟检查一次
  },
  
  async checkSystemHealth() {
    try {
      // 检查服务状态
      const taskService = this.serviceManager.get('taskService');
      const starService = this.serviceManager.get('starService');
      
      // 检查数据一致性
      const consistencyResult = await starService.checkDataConsistency('child');
      if (!consistencyResult.isConsistent) {
        logger.warn('HealthCheck', '发现数据不一致', consistencyResult);
      }
      
    } catch (error) {
      logger.error('HealthCheck', '系统健康检查失败', error);
    }
  }
});
```

### 错误监控

```javascript
// 全局错误捕获
App({
  onError(error) {
    logger.error('GlobalError', '全局错误', {
      message: error,
      timestamp: Date.now(),
      stack: error.stack || 'No stack trace'
    });
    
    // 发送错误报告（如果有错误收集服务）
    this.reportError(error);
  },
  
  reportError(error) {
    // 实现错误报告逻辑
  }
});
```

## 后端集成测试常见问题

### 问题1：INSERT 报 `Unknown column 'startTime' in 'field list'`

**原因**：`backend/services/taskService.js` 的 `createTask` SQL 使用了驼峰列名，但数据库实际是下划线命名。

**正确做法**：SQL 中的列名必须与数据库保持一致（下划线），`toDB()` 返回的驼峰键只用于取值，不用于列名。

```javascript
// ❌ 错误
INSERT INTO tasks (startTime, isRequired, ...) VALUES (...)

// ✅ 正确
INSERT INTO tasks (start_time, is_required, ...) VALUES (...)
```

---

### 问题2：集成测试断言 `res.body.code` 取不到值

**原因**：`backend/utils/response.js` 的 `error()` 函数返回的字段名是 `error_code`，不是 `code`。

**正确做法**：
```javascript
// ❌ 错误
expect(res.body.code).toBe('SOME_ERROR_CODE');

// ✅ 正确
expect(res.body.error_code).toBe('SOME_ERROR_CODE');
```

---

### 问题3：集成测试 INSERT families 报外键约束错误

**原因**：`families.created_by` 有外键约束指向 `users.user_id`，若先插入 families 再插入 users，会触发外键校验失败。

**正确做法**：测试数据插入顺序必须是：先 users → 再 families → 再更新 user 的 family_id 关联。

---

## 联系支持

如果遇到无法解决的问题，请提供以下信息：

1. **问题描述**：详细描述问题现象
2. **复现步骤**：提供问题复现的具体步骤
3. **错误日志**：提供相关的日志信息
4. **环境信息**：小程序版本、设备信息等
5. **数据状态**：相关数据的当前状态

---

**文档维护者**：开发团队
**最后更新**：2026年3月
**版本**：v2.1
