# StorageAdapter API 文档

## 概述

`StorageAdapter` 是学习任务微信小程序中的核心存储适配器，基于DDD架构设计，为仓储层提供统一的数据持久化接口。它封装了微信小程序的存储API，提供命名空间隔离、内存缓存、批量操作、数据验证等高级功能。

## 设计特性

### 核心特性
- **命名空间隔离**：支持多个业务模块独立的存储空间
- **内存缓存**：提供可配置的内存缓存机制，提升读取性能
- **异步优先**：支持同步和异步操作，推荐使用异步方法
- **批量操作**：支持批量读写，优化性能
- **数据验证**：内置数据类型验证和序列化处理
- **错误处理**：完善的错误处理和日志记录

### 架构位置
```
表现层 (Pages/Components)
    ↓
应用层 (Services)
    ↓
仓储层 (Repositories) ← StorageAdapter
    ↓
基础设施层 (Adapters)
```

## 快速开始

### 基础用法

```javascript
// 引入适配器
const StorageAdapter = require('../adapters/storage-adapter');

// 创建默认适配器实例
const storage = new StorageAdapter();

// 基础读写操作
await storage.setAsync('user_profile', { name: '小明', age: 10 });
const profile = await storage.getAsync('user_profile');
```

### 在仓储层中使用

```javascript
// repositories/base-repository.js
class BaseRepository {
  constructor(namespace) {
    this.storage = new StorageAdapter({
      namespace: namespace + '_',
      useCache: true,
      cacheExpiry: 300000 // 5分钟缓存
    });
  }
  
  async save(id, data) {
    return await this.storage.setAsync(id, data);
  }
  
  async findById(id) {
    return await this.storage.getAsync(id);
  }
}
```

## 构造函数

### new StorageAdapter(options)

创建存储适配器实例。

#### 参数

| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| options | Object | {} | 配置选项 |
| options.namespace | String | '' | 命名空间前缀，用于数据隔离 |
| options.useCache | Boolean | true | 是否启用内存缓存 |
| options.cacheExpiry | Number | 60000 | 缓存过期时间(毫秒) |
| options.maxCacheSize | Number | 100 | 最大缓存条目数 |
| options.enableValidation | Boolean | true | 是否启用数据验证 |

#### 使用示例

```javascript
// 基础适配器
const basicStorage = new StorageAdapter();

// 任务数据适配器
const taskStorage = new StorageAdapter({
  namespace: 'tasks',
  useCache: true,
  cacheExpiry: 180000 // 3分钟缓存
});

// 用户数据适配器（长期缓存）
const userStorage = new StorageAdapter({
  namespace: 'users',
  useCache: true,
  cacheExpiry: 600000, // 10分钟缓存
  maxCacheSize: 50
});

// 临时数据适配器（无缓存）
const tempStorage = new StorageAdapter({
  namespace: 'temp',
  useCache: false
});
```

## 核心API

### 异步方法（推荐）

#### getAsync(key, defaultValue)

异步获取存储数据。

**参数**
- `key` *{String}* - 存储键名
- `defaultValue` *{Any}* - 默认值，数据不存在时返回

**返回**
- `Promise<Any>` - 存储的数据或默认值

**示例**

```javascript
// 基础用法
const userData = await storage.getAsync('user_123');

// 带默认值
const userConfig = await storage.getAsync('config', {
  theme: 'light',
  notifications: true,
  language: 'zh-CN'
});

// 获取复杂对象
const taskList = await storage.getAsync('tasks_today', []);

// 错误处理
try {
  const data = await storage.getAsync('important_data');
  if (data) {
    // 处理数据
  }
} catch (error) {
  logger.error('Storage', '获取数据失败', error);
}
```

#### setAsync(key, data)

异步设置存储数据。

**参数**
- `key` *{String}* - 存储键名
- `data` *{Any}* - 要存储的数据

**返回**
- `Promise<Boolean>` - 是否成功

**示例**

```javascript
// 存储基础数据
await storage.setAsync('user_score', 85);

// 存储对象
await storage.setAsync('user_profile', {
  id: 'user_123',
  name: '小明',
  avatar: '/images/avatar.png',
  preferences: {
    theme: 'dark',
    notifications: true
  }
});

// 存储数组
await storage.setAsync('completed_tasks', [
  { id: 'task_1', completedAt: Date.now() },
  { id: 'task_2', completedAt: Date.now() - 3600000 }
]);

// 批量存储
const savePromises = [
  storage.setAsync('key1', 'value1'),
  storage.setAsync('key2', 'value2'),
  storage.setAsync('key3', 'value3')
];
await Promise.all(savePromises);
```

#### removeAsync(key)

异步删除存储数据。

**参数**
- `key` *{String}* - 存储键名

**返回**
- `Promise<Boolean>` - 是否成功

**示例**

```javascript
// 删除单个数据
await storage.removeAsync('temp_data');

// 批量删除
const keysToDelete = ['temp1', 'temp2', 'temp3'];
await Promise.all(
  keysToDelete.map(key => storage.removeAsync(key))
);
```

#### batchGetAsync(keys)

批量异步获取多个数据。

**参数**
- `keys` *{Array<String>}* - 键名数组

**返回**
- `Promise<Object>` - 键值对对象

**示例**

```javascript
// 批量获取用户相关数据
const keys = ['user_profile', 'user_settings', 'user_stats'];
const results = await storage.batchGetAsync(keys);

// results = {
//   user_profile: { name: '小明', ... },
//   user_settings: { theme: 'dark', ... },
//   user_stats: { totalTasks: 50, ... }
// }

// 处理结果
Object.keys(results).forEach(key => {
  if (results[key]) {
    console.log(`${key}:`, results[key]);
  }
});
```

#### batchSetAsync(dataMap)

批量异步设置多个数据。

**参数**
- `dataMap` *{Object}* - 键值对对象

**返回**
- `Promise<Boolean>` - 是否全部成功

**示例**

```javascript
// 批量保存用户数据
const userData = {
  'user_profile': { name: '小明', age: 10 },
  'user_settings': { theme: 'light', sound: true },
  'user_progress': { level: 5, exp: 1250 }
};

const success = await storage.batchSetAsync(userData);
if (success) {
  logger.info('Storage', '用户数据批量保存成功');
}
```

### 同步方法

#### get(key, defaultValue)

同步获取存储数据。

**参数**
- `key` *{String}* - 存储键名
- `defaultValue` *{Any}* - 默认值

**返回**
- `Any` - 存储的数据或默认值

**示例**

```javascript
// 获取配置数据（同步）
const config = storage.get('app_config', {
  version: '1.0.0',
  debug: false
});

// 获取缓存数据
const cachedData = storage.get('cache_key');
```

#### set(key, data)

同步设置存储数据。

**参数**
- `key` *{String}* - 存储键名
- `data` *{Any}* - 要存储的数据

**返回**
- `Boolean` - 是否成功

**示例**

```javascript
// 同步保存配置
const success = storage.set('app_config', {
  version: '1.0.1',
  debug: true
});
```

#### remove(key)

同步删除存储数据。

**参数**
- `key` *{String}* - 存储键名

**返回**
- `Boolean` - 是否成功

## 高级功能

### 命名空间管理

#### clearNamespace()

清除当前命名空间下的所有数据。

**返回**
- `Promise<Boolean>` - 是否成功

**示例**

```javascript
// 清除任务相关的所有数据
const taskStorage = new StorageAdapter({ namespace: 'tasks' });
await taskStorage.clearNamespace();

// 清除用户临时数据
const tempStorage = new StorageAdapter({ namespace: 'temp' });
await tempStorage.clearNamespace();
```

#### getAllKeys()

获取当前命名空间下的所有键名。

**返回**
- `Promise<Array<String>>` - 键名数组

**示例**

```javascript
// 获取所有任务相关的键
const taskStorage = new StorageAdapter({ namespace: 'tasks' });
const taskKeys = await taskStorage.getAllKeys();

// 遍历处理
for (const key of taskKeys) {
  const data = await taskStorage.getAsync(key);
  // 处理数据
}
```

### 缓存管理

#### clearCache()

清除内存缓存。

**示例**

```javascript
// 清除缓存，强制从存储读取最新数据
storage.clearCache();

// 重新获取数据（从存储而非缓存）
const freshData = await storage.getAsync('user_data');
```

#### getCacheStats()

获取缓存统计信息。

**返回**
- `Object` - 缓存统计信息

**示例**

```javascript
const stats = storage.getCacheStats();
console.log('缓存统计:', stats);
// {
//   size: 25,           // 当前缓存条目数
//   maxSize: 100,       // 最大缓存条目数
//   hitRate: 0.85,      // 缓存命中率
//   totalHits: 340,     // 总命中次数
//   totalMisses: 60     // 总未命中次数
// }
```

## 在DDD架构中的应用

### 仓储层集成

```javascript
// repositories/task-repository.js
class TaskRepository {
  constructor() {
    this.storage = new StorageAdapter({
      namespace: 'tasks',
      useCache: true,
      cacheExpiry: 300000 // 5分钟缓存
    });
  }
  
  async save(task) {
    const key = `task_${task.id}`;
    return await this.storage.setAsync(key, task.toJSON());
  }
  
  async findById(id) {
    const key = `task_${id}`;
    const data = await this.storage.getAsync(key);
    return data ? Task.fromJSON(data) : null;
  }
  
  async findByDate(date) {
    const key = `tasks_by_date_${date}`;
    const taskIds = await this.storage.getAsync(key, []);
    
    // 批量获取任务数据
    const taskKeys = taskIds.map(id => `task_${id}`);
    const tasksData = await this.storage.batchGetAsync(taskKeys);
    
    return Object.values(tasksData)
      .filter(data => data)
      .map(data => Task.fromJSON(data));
  }
  
  async saveTasksByDate(date, tasks) {
    const key = `tasks_by_date_${date}`;
    const taskIds = tasks.map(task => task.id);
    
    // 保存任务ID列表
    await this.storage.setAsync(key, taskIds);
    
    // 批量保存任务数据
    const taskData = {};
    tasks.forEach(task => {
      taskData[`task_${task.id}`] = task.toJSON();
    });
    
    return await this.storage.batchSetAsync(taskData);
  }
}
```

### 服务层使用

```javascript
// services/task-service.js
class TaskService {
  constructor() {
    this.taskRepository = new TaskRepository();
    this.cacheStorage = new StorageAdapter({
      namespace: 'task_cache',
      useCache: true,
      cacheExpiry: 60000 // 1分钟缓存
    });
  }
  
  async getTodayTasks() {
    const today = dateUtils.formatDate(new Date());
    const cacheKey = `today_tasks_${today}`;
    
    // 先尝试从缓存获取
    let tasks = await this.cacheStorage.getAsync(cacheKey);
    
    if (!tasks) {
      // 缓存未命中，从仓储获取
      tasks = await this.taskRepository.findByDate(today);
      
      // 更新缓存
      await this.cacheStorage.setAsync(cacheKey, tasks);
      
      logger.info('TaskService', '今日任务从数据库加载', { count: tasks.length });
    } else {
      logger.info('TaskService', '今日任务从缓存加载', { count: tasks.length });
    }
    
    return { success: true, tasks };
  }
  
  async completeTask(taskId, userId) {
    try {
      // 获取任务
      const task = await this.taskRepository.findById(taskId);
      if (!task) {
        return { success: false, message: '任务不存在' };
      }
      
      // 完成任务
      task.complete(userId);
      
      // 保存任务
      await this.taskRepository.save(task);
      
      // 清除相关缓存
      const today = dateUtils.formatDate(new Date());
      await this.cacheStorage.removeAsync(`today_tasks_${today}`);
      
      return { success: true, task };
    } catch (error) {
      logger.error('TaskService', '完成任务失败', error);
      return { success: false, message: '操作失败' };
    }
  }
}
```

## 性能优化

### 缓存策略

```javascript
// 不同业务场景的缓存配置
const storageConfigs = {
  // 用户数据：长期缓存
  user: {
    namespace: 'users',
    useCache: true,
    cacheExpiry: 600000, // 10分钟
    maxCacheSize: 50
  },
  
  // 任务数据：中期缓存
  tasks: {
    namespace: 'tasks',
    useCache: true,
    cacheExpiry: 300000, // 5分钟
    maxCacheSize: 200
  },
  
  // 统计数据：短期缓存
  stats: {
    namespace: 'stats',
    useCache: true,
    cacheExpiry: 60000, // 1分钟
    maxCacheSize: 100
  },
  
  // 临时数据：无缓存
  temp: {
    namespace: 'temp',
    useCache: false
  }
};

// 创建不同用途的存储适配器
const userStorage = new StorageAdapter(storageConfigs.user);
const taskStorage = new StorageAdapter(storageConfigs.tasks);
const statsStorage = new StorageAdapter(storageConfigs.stats);
const tempStorage = new StorageAdapter(storageConfigs.temp);
```

### 批量操作优化

```javascript
// 优化前：逐个操作
async function saveTasksSlowly(tasks) {
  for (const task of tasks) {
    await storage.setAsync(`task_${task.id}`, task);
  }
}

// 优化后：批量操作
async function saveTasksQuickly(tasks) {
  const dataMap = {};
  tasks.forEach(task => {
    dataMap[`task_${task.id}`] = task;
  });
  
  await storage.batchSetAsync(dataMap);
}

// 性能对比测试
const tasks = generateTestTasks(100);

console.time('逐个保存');
await saveTasksSlowly(tasks);
console.timeEnd('逐个保存'); // ~500ms

console.time('批量保存');
await saveTasksQuickly(tasks);
console.timeEnd('批量保存'); // ~50ms
```

## 错误处理

### 异常类型

```javascript
// 常见异常处理
try {
  await storage.setAsync('large_data', hugDataObject);
} catch (error) {
  if (error.code === 'STORAGE_QUOTA_EXCEEDED') {
    // 存储空间不足
    logger.warn('Storage', '存储空间不足，清理旧数据');
    await storage.clearNamespace();
    
    // 重试保存
    await storage.setAsync('large_data', hugDataObject);
  } else if (error.code === 'SERIALIZATION_ERROR') {
    // 序列化错误
    logger.error('Storage', '数据序列化失败', error);
    throw new Error('数据格式错误');
  } else {
    // 其他错误
    logger.error('Storage', '存储操作失败', error);
    throw error;
  }
}
```

### 数据验证

```javascript
// 启用数据验证的适配器
const validatedStorage = new StorageAdapter({
  namespace: 'validated',
  enableValidation: true
});

// 保存时会自动验证数据类型
try {
  await validatedStorage.setAsync('user_age', 'not_a_number'); // 会抛出验证错误
} catch (error) {
  console.log('验证失败:', error.message);
}

// 正确的数据会正常保存
await validatedStorage.setAsync('user_age', 10); // 成功
```

## 最佳实践

### 1. 命名空间规划

```javascript
// ✅ 推荐：按业务模块划分命名空间
const userStorage = new StorageAdapter({ namespace: 'users' });
const taskStorage = new StorageAdapter({ namespace: 'tasks' });
const rewardStorage = new StorageAdapter({ namespace: 'rewards' });

// ❌ 避免：所有数据混在一起
const storage = new StorageAdapter(); // 没有命名空间隔离
```

### 2. 缓存配置

```javascript
// ✅ 推荐：根据数据特性配置缓存
const configs = {
  // 频繁读取的静态数据：长缓存
  staticData: { cacheExpiry: 600000 },
  
  // 经常变化的数据：短缓存
  dynamicData: { cacheExpiry: 30000 },
  
  // 一次性数据：无缓存
  temporaryData: { useCache: false }
};
```

### 3. 异步优先

```javascript
// ✅ 推荐：使用异步方法
async function loadUserData() {
  const userData = await storage.getAsync('user_profile');
  return userData;
}

// ❌ 避免：在异步环境中使用同步方法
async function loadUserDataBadly() {
  const userData = storage.get('user_profile'); // 可能阻塞
  return userData;
}
```

### 4. 错误处理

```javascript
// ✅ 推荐：完善的错误处理
async function saveUserData(userData) {
  try {
    await storage.setAsync('user_profile', userData);
    return { success: true };
  } catch (error) {
    logger.error('Storage', '保存用户数据失败', error);
    return { success: false, error: error.message };
  }
}

// ❌ 避免：忽略错误
async function saveUserDataBadly(userData) {
  await storage.setAsync('user_profile', userData); // 可能抛出异常
}
```

### 5. 数据结构设计

```javascript
// ✅ 推荐：结构化的数据存储
const taskData = {
  id: 'task_123',
  title: '完成作业',
  type: 'study',
  status: 0,
  createdAt: Date.now(),
  metadata: {
    priority: 'high',
    estimatedTime: 30
  }
};

// ❌ 避免：扁平化存储复杂数据
const badTaskData = 'task_123|完成作业|study|0|' + Date.now(); // 难以维护
```

## 调试和监控

### 开发环境调试

```javascript
// 开启调试模式
const debugStorage = new StorageAdapter({
  namespace: 'debug',
  debug: true // 启用详细日志
});

// 监控存储操作
debugStorage.on('get', (key, value) => {
  console.log(`[Storage] GET ${key}:`, value);
});

debugStorage.on('set', (key, value) => {
  console.log(`[Storage] SET ${key}:`, value);
});
```

### 性能监控

```javascript
// 监控缓存性能
setInterval(() => {
  const stats = storage.getCacheStats();
  if (stats.hitRate < 0.7) {
    logger.warn('Storage', '缓存命中率过低', stats);
  }
}, 60000); // 每分钟检查一次
```

---

**文档维护者**：开发团队  
**最后更新**：2024年12月  
**版本**：v3.0 