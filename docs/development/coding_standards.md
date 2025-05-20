# 编码规范

本文档定义了学习任务微信小程序的编码规范和最佳实践，确保代码风格统一和质量一致。

## 命名规范

### 文件命名

- 组件文件夹使用小驼峰命名：`taskItem`、`progressRing`
- 工具类文件使用小驼峰命名：`taskManager.js`、`dateUtils.js`
- 页面文件夹使用中划线分隔：`task-edit`、`task-detail`

### 变量命名

- 变量名使用小驼峰命名：`taskList`、`currentUser`
- 常量使用全大写下划线分隔：`MAX_TASK_COUNT`、`DEFAULT_DURATION`
- 类名使用大驼峰命名：`TaskManager`、`MessageCenter`
- 布尔类型变量使用 `is`/`has` 前缀：`isCompleted`、`hasChildren`

### 函数命名

- 函数名使用小驼峰命名：`createTask`、`updateStatus`
- 获取类函数使用 `get` 前缀：`getTasks`、`getRewards`
- 设置类函数使用 `set` 前缀：`setTaskStatus`、`setUserInfo`
- 检查类函数使用 `is`/`has`/`check` 前缀：`isTaskOverdue`、`hasUnreadMessages`

## 代码格式

### 缩进和空格

- 使用2个空格进行缩进，不使用Tab
- 运算符前后使用空格：`x + y`，而不是 `x+y`
- 逗号后使用空格，逗号前不使用空格：`[1, 2, 3]`，而不是 `[1,2,3]` 或 `[1 , 2 , 3]`
- 代码块的大括号放在同一行，并在结尾处添加空格：`if (condition) {`

### 语句和行长度

- 每行代码不超过100个字符
- 语句结尾使用分号
- 复合语句始终使用大括号：
  ```javascript
  if (condition) {
    doSomething();
  }
  ```
  而不是：
  ```javascript
  if (condition) doSomething();
  ```

### 注释规范

- 函数使用JSDoc风格注释：
  ```javascript
  /**
   * 函数描述
   * @param {Type} paramName - 参数描述
   * @return {Type} 返回值描述
   */
  ```
- 复杂逻辑添加行内注释：`// 这里处理特殊情况...`
- TODO项添加标记：`// TODO: 需要改进的地方...`
- 临时代码添加标记：`// FIXME: 临时解决方案...`

## 组件规范

### 组件结构

- 每个组件应包含四个文件：`.js`、`.wxml`、`.wxss` 和 `.json`
- 组件对外暴露的属性和事件在 `properties` 和 `methods` 中定义
- 复杂组件使用私有方法处理内部逻辑，方法名以 `_` 开头

### 组件通信

- 使用属性传递父组件到子组件的数据
- 使用事件传递子组件到父组件的数据：
  ```javascript
  this.triggerEvent('myEvent', { value: this.data.value });
  ```
- 复杂状态管理使用 `utils/stateManager.js`

## 工具类规范

### 模块导出

- 工具类使用模块化设计，通过 `module.exports` 导出：
  ```javascript
  module.exports = {
    function1,
    function2
  };
  ```

### 异步处理

- 所有异步操作使用回调函数或Promise处理
- 避免回调地狱，使用链式调用或async/await模式
- 异步操作添加错误处理：
  ```javascript
  function asyncOperation(param, callback) {
    try {
      // 操作
      callback(null, result);
    } catch (error) {
      console.error(`[模块名] 操作失败: ${error.message}`);
      callback(error);
    }
  }
  ```

## 页面规范

### 生命周期

- 在 `onLoad` 中初始化页面数据和事件绑定
- 在 `onShow` 中刷新页面数据
- 在 `onUnload` 中解绑事件和清理资源
- 避免在 `onReady` 中执行复杂操作

### 事件处理

- 事件处理函数使用 `handleXxx` 或 `onXxx` 前缀：`handleSubmit`、`onButtonTap`
- 使用箭头函数避免 `this` 绑定问题

## 数据管理

### 本地存储

- 使用工具类封装存储操作，避免直接调用 `wx.setStorageSync`
- 关键数据读写添加日志记录
- 避免存储大量数据，合理分割存储内容

### 全局状态

- 全局状态使用 `app.globalData` 或 `stateManager` 管理
- 避免过度使用全局状态，优先考虑组件通信

## 性能优化

### 渲染优化

- 避免频繁 `setData`，合并多次更新
- 使用 `wx:if` 代替 `hidden` 控制复杂组件显示
- 大型列表使用虚拟滚动或分页加载

### 计算优化

- 耗时计算放在 `Worker` 中或使用分批处理
- 缓存频繁使用的计算结果
- 使用节流或防抖处理频繁触发的事件 