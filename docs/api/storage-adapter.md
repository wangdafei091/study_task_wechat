# 存储适配器 API

## 概述

`StorageAdapter` 是一个封装微信小程序存储API的适配器，提供更加便捷和可靠的数据存取功能。它支持命名空间隔离、内存缓存、异步操作等特性，是系统底层存储的核心组件。

## 基本用法

### 创建适配器实例

```javascript
const StorageAdapter = require('../adapters/storage-adapter');

// 创建默认适配器
const defaultAdapter = new StorageAdapter();

// 创建带命名空间的适配器
const taskAdapter = new StorageAdapter({
  namespace: 'tasks_'
});

// 创建带缓存配置的适配器
const userAdapter = new StorageAdapter({
  namespace: 'user_',
  useCache: true,
  cacheExpiry: 120000  // 缓存有效期2分钟
});
```

## API 参考

### 构造函数

```javascript
new StorageAdapter(options)
```

**参数：**

- `options` *{Object}* 配置选项
  - `namespace` *{String}* 可选，命名空间前缀
  - `useCache` *{Boolean}* 可选，是否使用缓存，默认为 `true`
  - `cacheExpiry` *{Number}* 可选，缓存过期时间（毫秒），默认为 `60000`（1分钟）

### 同步方法

#### get

获取存储数据（同步）。

```javascript
adapter.get(key, defaultValue)
```

**参数：**

- `key` *{String}* 存储键名
- `defaultValue` *{Any}* 可选，默认值，当数据不存在时返回，默认为 `null`

**返回：**

- *{Any}* 存储的数据或默认值

**示例：**

```javascript
// 获取用户配置，如果不存在则返回默认配置
const userConfig = adapter.get('userConfig', { theme: 'light', fontSize: 'medium' });
```

#### set

设置存储数据（同步）。

```javascript
adapter.set(key, data)
```

**参数：**

- `key` *{String}* 存储键名
- `data` *{Any}* 要存储的数据

**返回：**

- *{Boolean}* 是否成功

**示例：**

```javascript
// 保存用户配置
const success = adapter.set('userConfig', { theme: 'dark', fontSize: 'large' });
```

#### remove

删除存储数据（同步）。

```javascript
adapter.remove(key)
```

**参数：**

- `key` *{String}* 存储键名

**返回：**

- *{Boolean}* 是否成功

**示例：**

```javascript
// 删除用户配置
adapter.remove('userConfig');
```

### 异步方法

#### getAsync

获取存储数据（异步）。

```javascript
await adapter.getAsync(key, defaultValue)
```

**参数：**

- `key` *{String}* 存储键名
- `defaultValue` *{Any}* 可选，默认值，当数据不存在时返回，默认为 `null`

**返回：**

- *{Promise<Any>}* Promise对象，解析为存储的数据或默认值

**示例：**

```javascript
// 异步获取用户数据
const userData = await adapter.getAsync('userData', { name: '', points: 0 });
```

#### setAsync

设置存储数据（异步）。

```javascript
await adapter.setAsync(key, data)
```

**参数：**

- `key` *{String}* 存储键名
- `data` *{Any}* 要存储的数据

**返回：**

- *{Promise<Boolean>}* Promise对象，解析为是否成功

**示例：**

```javascript
// 异步保存用户数据
await adapter.setAsync('userData', { name: '小明', points: 100 });
```

#### removeAsync

删除存储数据（异步）。

```javascript
await adapter.removeAsync(key)
```

**参数：**

- `key` *{String}* 存储键名

**返回：**

- *{Promise<Boolean>}* Promise对象，解析为是否成功

**示例：**

```javascript
// 异步删除用户数据
await adapter.removeAsync('userData');
```

### 辅助方法

#### clearNamespace

清除当前命名空间下的所有数据。

```javascript
await adapter.clearNamespace()
```

**返回：**

- *{Promise<Number>}* Promise对象，解析为已清除的键数量

**示例：**

```javascript
// 清除用户适配器的所有数据
const clearedCount = await userAdapter.clearNamespace();
console.log(`已清除 ${clearedCount} 条数据`);
```

#### clearCache

清除内存缓存。

```javascript
adapter.clearCache()
```

**示例：**

```javascript
// 强制清除缓存，确保下次读取时从存储获取最新数据
adapter.clearCache();
```

## 高级用法

### 命名空间隔离

命名空间可用于隔离不同模块的数据：

```javascript
const taskAdapter = new StorageAdapter({ namespace: 'task_' });
const userAdapter = new StorageAdapter({ namespace: 'user_' });

// 不同适配器操作不同命名空间的数据
taskAdapter.set('list', [...tasks]);
userAdapter.set('profile', { name: '张三', age: 10 });
```

### 缓存机制

适配器实现了两级缓存：

1. **内存缓存**：减少频繁的存储读取操作
2. **持久化存储**：微信小程序的Storage API

```javascript
// 创建短期缓存适配器（适用于频繁访问的数据）
const frequentAdapter = new StorageAdapter({
  cacheExpiry: 10000 // 10秒缓存
});

// 创建长期缓存适配器（适用于较少变化的数据）
const staticAdapter = new StorageAdapter({
  cacheExpiry: 300000 // 5分钟缓存
});

// 禁用缓存（适用于需要实时同步的数据）
const realtimeAdapter = new StorageAdapter({
  useCache: false
});
```

### 错误处理

适配器会自动捕获并记录存储操作的错误：

```javascript
try {
  const data = await adapter.getAsync('complexData');
  // 处理数据
} catch (error) {
  console.error('获取数据失败', error);
}

// 或者通过返回值检查
const success = await adapter.setAsync('complexData', data);
if (!success) {
  console.error('保存数据失败');
}
```

## 最佳实践

1. **使用命名空间**：为不同类型的数据创建独立的适配器，避免键名冲突。

2. **选择合适的缓存策略**：
   - 频繁变化的数据使用短期缓存或禁用缓存
   - 静态数据使用长期缓存
   - 关键数据使用异步方法确保写入成功

3. **批量操作**：对于大量数据的批量操作，考虑使用事务或分批处理。

4. **性能考虑**：
   - 避免存储过大的数据对象
   - 合理设置缓存过期时间
   - 使用异步方法避免阻塞UI

## 注意事项

1. 微信小程序存储容量有限（10MB），需要合理规划数据存储。
2. 复杂对象会自动进行JSON序列化，不支持循环引用结构。
3. 命名空间只影响键名，不影响实际的存储分区。
4. 缓存机制只在当前小程序运行期间有效，小程序重启后缓存会重置。 