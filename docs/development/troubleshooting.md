# 常见问题排查指南

本文档提供了项目开发和运行中可能遇到的常见问题及其解决方案。

## 小程序启动与性能问题

### 小程序启动缓慢

**现象**: 小程序冷启动时间超过3秒

**可能原因**:
- `app.js` 中初始化逻辑过重
- 首页加载了大量不必要的数据
- 缓存过大导致初始化延迟

**解决方案**:
1. 检查 `app.js` 中是否存在同步大量数据的操作
2. 采用异步加载模式，将非必要初始化移至 `app.onShow` 或首页的 `onReady`
3. 清理过期缓存，实现自动清理机制
4. 使用 `wx.preloadComponents` 预加载频繁使用的组件

```javascript
// 示例：优化初始化逻辑
App({
  onLaunch: function() {
    // 只保留必要的同步初始化
    this.initCriticalSync();
    
    // 延迟执行非关键初始化
    setTimeout(() => {
      this.initNonCritical();
    }, 500);
  },
  
  initCriticalSync: function() {
    // 关键初始化：用户登录状态等
    console.log('[App] 执行关键初始化');
  },
  
  initNonCritical: function() {
    // 非关键初始化：统计数据、预加载等
    console.log('[App] 执行非关键初始化');
  }
});
```

### 页面渲染卡顿

**现象**: 列表滚动或切换页面时出现明显卡顿

**可能原因**:
- 频繁 `setData` 导致渲染阻塞
- 列表渲染过多项目
- 复杂计算阻塞主线程

**解决方案**:
1. 合并多次 `setData` 调用，减少渲染次数
2. 使用虚拟列表，只渲染视口内元素
3. 使用 `wx:if` 代替 `hidden` 控制大型组件显示
4. 耗时计算使用分批处理，释放主线程

```javascript
// 示例：批量更新数据避免频繁setData
Page({
  updateMultipleItems: function() {
    let updates = {};
    
    // 合并多个更新
    updates['item1'] = this.calculateItem1();
    updates['item2'] = this.calculateItem2();
    updates['list'] = this.processListData();
    
    // 一次性更新
    this.setData(updates);
  }
});
```

## 数据处理问题

### 数据不同步

**现象**: 页面之间切换后数据状态不一致

**可能原因**:
- 缺少全局状态管理
- 页面返回时未刷新数据
- 编辑后未更新关联页面

**解决方案**:
1. 使用 `utils/stateManager.js` 管理全局状态
2. 在 `onShow` 生命周期中刷新页面数据
3. 添加页面通信机制，如全局事件总线

```javascript
// 示例：使用事件总线更新数据
// app.js
App({
  onLaunch: function() {
    this.globalData.eventBus = {
      listeners: {},
      on: function(event, callback) {
        if (!this.listeners[event]) {
          this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
      },
      emit: function(event, data) {
        const eventListeners = this.listeners[event];
        if (eventListeners) {
          eventListeners.forEach(callback => callback(data));
        }
      }
    };
  }
});

// 页面A：发送事件
Page({
  updateTask: function(task) {
    const eventBus = getApp().globalData.eventBus;
    // 更新后发送通知
    eventBus.emit('taskUpdated', task);
  }
});

// 页面B：监听事件
Page({
  onLoad: function() {
    const eventBus = getApp().globalData.eventBus;
    // 注册监听
    eventBus.on('taskUpdated', this.handleTaskUpdate.bind(this));
  },
  handleTaskUpdate: function(task) {
    // 更新页面显示
    this.refreshTaskData();
  }
});
```

### 数据存储异常

**现象**: 数据保存后无法正确读取或丢失

**可能原因**:
- 超出存储限制（微信小程序单个 key 存储上限为 1MB）
- 存储格式不一致
- 异步存储操作未正确处理回调

**解决方案**:
1. 大型数据分割存储，使用多个 key
2. 统一使用 JSON 格式存储对象数据
3. 为关键存储操作添加错误处理和日志
4. 实现数据完整性检查机制

```javascript
// 示例：安全的数据存储和读取
const saveData = (key, data, callback) => {
  try {
    console.log(`[Storage] 保存数据: ${key}, 大小: ${JSON.stringify(data).length} 字节`);
    wx.setStorage({
      key: key,
      data: data,
      success: function() {
        console.log(`[Storage] 数据保存成功: ${key}`);
        if (callback) callback(null);
      },
      fail: function(error) {
        console.error(`[Storage] 数据保存失败: ${key}, 错误: ${error.errMsg}`);
        if (callback) callback(error);
      }
    });
  } catch (e) {
    console.error(`[Storage] 数据处理异常: ${e.message}`);
    if (callback) callback(e);
  }
};
```

## UI与兼容性问题

### 界面适配问题

**现象**: 在某些设备上界面显示异常或元素错位

**可能原因**:
- 未使用响应式单位如 rpx
- 固定高度导致在不同设备上显示异常
- 没有考虑安全区域和刘海屏适配

**解决方案**:
1. 使用 rpx 单位适配不同屏幕
2. 关键尺寸使用 `unit.js` 中的工具函数动态计算
3. 使用 flex 布局代替固定尺寸
4. 为异形屏添加安全区域适配

```javascript
// 示例：自适应内容高度
Page({
  onLoad: function() {
    const unit = require('../../utils/unit.js');
    
    // 获取内容区域高度
    const contentHeight = unit.getContentHeight({
      excludeNav: true,
      excludeTabBar: true
    });
    
    this.setData({
      contentStyle: `height: ${contentHeight}px`
    });
  }
});
```

### 横屏适配问题

**现象**: 横屏模式下界面显示不正确

**可能原因**:
- 布局设计未考虑横屏模式
- 元素位置固定，无法适应横屏

**解决方案**:
1. 监听设备方向变化并调整布局
2. 为横屏模式设计专用布局
3. 使用弹性布局适应横屏状态

```javascript
// 示例：监听屏幕方向变化
Page({
  onLoad: function() {
    wx.onDeviceOrientationChange(this.handleOrientationChange);
  },
  
  handleOrientationChange: function(res) {
    console.log(`[Page] 屏幕方向变化: ${res.value}`);
    
    // 根据方向切换布局
    if (res.value === 'landscape') {
      this.setData({ isLandscape: true });
    } else {
      this.setData({ isLandscape: false });
    }
  },
  
  onUnload: function() {
    // 清理监听
    wx.offDeviceOrientationChange(this.handleOrientationChange);
  }
});
```

## 任务管理问题

### 任务状态更新问题

**现象**: 任务状态更新后未正确反映在界面上

**可能原因**:
- 状态更新后未触发界面刷新
- 多个页面使用的任务数据未同步
- 状态更新逻辑有误

**解决方案**:
1. 确保使用 `taskManager.updateTaskStatus()` 更新任务状态，而不是直接修改
2. 添加任务状态变更事件，确保所有相关页面同步更新
3. 实现数据验证机制，确保状态值正确

```javascript
// 示例：正确的任务状态更新
Page({
  toggleTaskStatus: function(e) {
    const taskId = e.currentTarget.dataset.id;
    const currentStatus = e.currentTarget.dataset.status;
    
    // 计算新状态（在这里简化为0/1切换）
    const newStatus = currentStatus === 0 ? 1 : 0;
    
    // 使用管理器更新状态
    const taskManager = require('../../utils/taskManager.js');
    
    console.log(`[TaskPage] 更新任务状态: ${taskId}, ${currentStatus} -> ${newStatus}`);
    
    taskManager.updateTaskStatus(taskId, newStatus, (result) => {
      if (result.success) {
        // 更新成功后的处理
        this.refreshTaskList(); // 刷新列表
      } else {
        console.error(`[TaskPage] 更新任务状态失败: ${result.error}`);
        wx.showToast({
          title: '状态更新失败',
          icon: 'none'
        });
      }
    });
  }
});
```

### 重复任务生成问题

**现象**: 重复任务生成异常或性能下降

**可能原因**:
- 重复任务逻辑错误导致无限生成
- 一次性生成过多任务导致性能问题
- 重复任务日期计算错误

**解决方案**:
1. 检查重复任务的终止条件是否正确
2. 使用批量处理机制，分批创建重复任务
3. 为重复任务添加合理的日期上限

```javascript
// 示例：批量创建重复任务
const createRepeatingTasks = (templateTask, dates, callback) => {
  console.log(`[TaskManager] 开始创建重复任务: ${dates.length}个`);
  
  // 复制任务模板
  const taskManager = require('./taskManager.js');
  
  // 分批处理
  const batchSize = 10;
  let tasksCreated = 0;
  let currentBatch = 0;
  
  function processNextBatch() {
    const startIdx = currentBatch * batchSize;
    const endIdx = Math.min(startIdx + batchSize, dates.length);
    
    if (startIdx >= dates.length) {
      // 所有批次处理完成
      console.log(`[TaskManager] 重复任务创建完成: ${tasksCreated}/${dates.length}`);
      if (callback) callback({ success: true, count: tasksCreated });
      return;
    }
    
    console.log(`[TaskManager] 处理批次 ${currentBatch + 1}: ${startIdx}-${endIdx-1}`);
    
    // 处理当前批次
    const currentDates = dates.slice(startIdx, endIdx);
    let batchComplete = 0;
    
    currentDates.forEach(date => {
      // 创建单个任务副本
      const taskCopy = { ...templateTask };
      taskCopy.date = date;
      taskCopy.parentTaskId = templateTask.id;
      
      taskManager.createTask(taskCopy, result => {
        batchComplete++;
        if (result.success) {
          tasksCreated++;
        }
        
        // 当前批次完成
        if (batchComplete === currentDates.length) {
          currentBatch++;
          setTimeout(processNextBatch, 50); // 延迟处理下一批次
        }
      });
    });
  }
  
  // 开始处理第一批
  processNextBatch();
};
```

## 组件通信问题

### 组件事件触发失效

**现象**: 组件事件无法正确传递到父页面

**可能原因**:
- 事件名称或参数格式不匹配
- 父页面未正确绑定事件处理函数
- 组件使用方式错误

**解决方案**:
1. 检查事件名称是否一致（区分大小写）
2. 确保事件参数格式正确
3. 使用事件冒泡机制处理深层组件事件

```javascript
// 示例：正确的组件事件绑定
<!-- 组件 WXML -->
<view bindtap="onItemTap" data-id="{{item.id}}">{{item.title}}</view>

// 组件 JS
Component({
  methods: {
    onItemTap: function(e) {
      const id = e.currentTarget.dataset.id;
      console.log(`[Component] 项目点击: ${id}`);
      
      // 触发自定义事件
      this.triggerEvent('itemSelect', {
        itemId: id,
        timestamp: Date.now()
      });
    }
  }
});

<!-- 页面 WXML -->
<custom-component bind:itemSelect="handleItemSelect"></custom-component>

// 页面 JS
Page({
  handleItemSelect: function(e) {
    const itemId = e.detail.itemId;
    console.log(`[Page] 收到项目选择事件: ${itemId}`);
    // 处理事件
  }
});
```

### 跨页面组件通信

**现象**: 不同页面上的组件无法通信或数据不同步

**可能原因**:
- 缺少跨页面通信机制
- 页面切换导致数据丢失
- 缺少共享状态

**解决方案**:
1. 使用 `app.globalData` 存储共享数据
2. 实现全局事件总线
3. 使用 `utils/stateManager.js` 的状态管理

```javascript
// 示例：使用stateManager实现组件通信
// 组件A
const stateManager = require('../../utils/stateManager.js');

Component({
  ready: function() {
    // 订阅状态变化
    stateManager.subscribe('sharedData', this.handleDataChange.bind(this));
  },
  
  detached: function() {
    // 取消订阅
    stateManager.unsubscribe('sharedData', this.handleDataChange);
  },
  
  methods: {
    handleDataChange: function(newData) {
      console.log(`[ComponentA] 收到数据更新: ${JSON.stringify(newData)}`);
      this.setData({ localData: newData });
    },
    
    updateSharedData: function(data) {
      // 更新共享状态
      stateManager.setState('sharedData', data);
    }
  }
});

// 组件B
Component({
  ready: function() {
    // 订阅同一状态
    stateManager.subscribe('sharedData', this.onDataChanged.bind(this));
  },
  
  methods: {
    onDataChanged: function(newData) {
      console.log(`[ComponentB] 收到数据更新: ${JSON.stringify(newData)}`);
      // 处理新数据
    }
  }
});
``` 