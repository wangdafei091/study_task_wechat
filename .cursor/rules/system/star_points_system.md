# 星星有效期与消费机制

## 概述

星星（积分）系统是学习任务小程序中的核心激励机制，用户通过完成任务获取星星，并可使用星星兑换奖励。星星有效期和消费机制是确保用户合理使用星星的重要功能。

本文档详细介绍星星有效期的计算逻辑和"先过期先使用"的星星消费策略的实现细节。

## 数据结构

### 星星分组数据结构

为实现"先过期先使用"的星星消费策略，系统将星星按过期时间分组存储：

```javascript
// 存储在 'starGroups' 键下的数据结构
[
  {
    expiryDate: 1627516799999,    // 过期时间戳，'permanent'表示永久有效
    expiryDateStr: '2023/07/31',  // 格式化的过期日期，用于UI显示
    points: 25,                   // 该分组的星星数量
    sources: ['task_123456789']   // 星星来源标识（如任务ID）
  },
  {
    expiryDate: 1630195199999,
    expiryDateStr: '2023/08/30',
    points: 15,
    sources: ['task_987654321', 'task_456789123']
  },
  {
    expiryDate: 'permanent',
    expiryDateStr: '永久',
    points: 50,
    sources: ['task_111222333']
  }
]
```

### 星星记录数据结构

系统同时维护了用户获取、消费和过期星星的记录：

```javascript
// 星星记录结构
{
  id: 'star_1621693875000_123',   // 记录唯一ID
  title: '完成任务：练习钢琴',      // 记录标题
  time: '2023-05-23 15:30:45',    // 格式化时间
  timestamp: 1621693875000,       // 时间戳
  points: 10,                     // 星星数量（消费为负数）
  type: 'income',                 // 类型：income(获取)/expense(消费)/expired(过期)
  source: 'task',                 // 来源：task(任务)/reward(奖励)/system(系统)
  expiryDate: 1624372275000,      // 过期时间戳（获取记录才有）
  expiryDateStr: '2023-06-22'     // 格式化过期日期（获取记录才有）
}
```

## 核心功能实现

### 1. 星星获取与分组

当任务完成时，系统根据任务的有效期设置计算星星的过期时间，并将星星添加到对应的分组中：

```javascript
// 在 taskManager.js 中处理任务完成时的星星获取
if (oldStatus === 0 && status === 1) {
  // 任务从未完成变为已完成
  if (!task.starAwarded) {
    // 计算积分有效期
    const completionDate = new Date();
    const expiryInfo = this.calculateExpiryDate(task.pointsExpiry || 'permanent', completionDate);
    
    // 更新任务的有效期显示
    task.pointsExpiryDate = expiryInfo.expiryDateStr;
    
    // 添加积分并分组
    pointsManager.addUserPoints(task.points, {
      expiry: expiryInfo.expiry,
      expiryDateStr: expiryInfo.expiryDateStr
    }, task.id);
    
    // 标记已获得星星
    task.starAwarded = true;
  }
}
```

**核心实现原理**：
1. 使用 `calculateExpiryDate` 方法根据不同有效期类型计算具体到期时间
2. 调用 `pointsManager.addUserPoints` 添加星星并传递过期信息
3. `pointsManager` 内部调用 `addStarsToGroup` 将星星添加到对应过期时间的分组

### 2. 星星消费策略

系统实现了"先过期先使用"的星星消费策略，优先消费即将过期的星星：

```javascript
// 在 pointsManager.js 中实现的星星消费策略
reduceUserPoints: function(amount) {
  // 确保数值为整数
  const points = parseInt(amount, 10);
  if (isNaN(points) || points <= 0) {
    logger.warn('pointsManager', `无效的星星消费数量: ${amount}`);
    return this.getUserPoints();
  }
  
  const currentPoints = this.getUserPoints();
  
  // 如果星星不足，直接返回
  if (currentPoints < points) {
    logger.warn('pointsManager', `星星不足，无法消费: 当前=${currentPoints}, 需要=${points}`);
    return currentPoints;
  }
  
  // 实现"先过期先使用"策略
  this._consumeStarsByExpiryOrder(points);
  
  // 更新总星星数
  const newPoints = Math.max(0, currentPoints - points);
  this.saveUserPoints(newPoints);
  
  // 清理过期分组并检查数据一致性
  this.maintainStarGroups();
  
  logger.info('pointsManager', `减少星星: ${currentPoints} -> ${newPoints}, 减少: ${points}`);
  return newPoints;
}
```

**消费过程**：
1. 获取所有星星分组并按过期时间排序
2. 从最早过期的分组开始消费星星
3. 如果当前分组星星不足，继续从下一个分组消费
4. 消费完成后更新各分组星星数量
5. 移除星星数为0的空分组

### 3. 数据一致性维护

系统定期检查星星分组数据的一致性，确保数据准确：

```javascript
// 在 pointsManager.js 中实现的数据维护
maintainStarGroups: function() {
  logger.info('pointsManager', '开始维护星星分组数据');
  
  // 1. 清理过期分组
  this.cleanupExpiredGroups();
  
  // 2. 检查数据一致性
  const groups = this.getStarGroups();
  const totalGroupPoints = groups.reduce((sum, group) => sum + group.points, 0);
  const storedTotalPoints = this.getUserPoints();
  
  if (totalGroupPoints !== storedTotalPoints) {
    logger.warn('pointsManager', `发现星星数量不一致: 分组总和=${totalGroupPoints}, 总星星数=${storedTotalPoints}`);
    
    // 3. 自动修复数据不一致
    // 以分组总和为准，更新总星星数
    this.saveUserPoints(totalGroupPoints);
    logger.info('pointsManager', `已修复星星数量: ${storedTotalPoints} -> ${totalGroupPoints}`);
  } else {
    logger.info('pointsManager', `星星数据一致性检查通过: ${totalGroupPoints}`);
  }
}
```

**维护过程**：
1. 清理已过期的星星分组
2. 计算所有分组的星星总和
3. 比较分组总和与存储的总星星数
4. 如果不一致，以分组总和为准进行修复

### 4. 过期预测功能

基于星星分组数据，系统提供星星过期预测功能，帮助用户了解未来星星的过期趋势：

```javascript
// 在 analyticsManager.js 中实现的过期预测
calculateExpiryForecast: function(days, callback) {
  logger.info('analyticsManager', `计算未来${days}天的星星过期趋势`);
  
  // 获取星星分组数据
  const starGroups = pointsManager.getStarGroups();
  
  // 计算日期范围
  const dateRange = this._calculateDateRange(days);
  const { dateArray } = dateRange;
  
  // 初始化预测数据
  const forecast = dateArray.map(date => ({
    date: date,
    expired: 0
  }));
  
  // 计算每天过期的星星数量
  starGroups.forEach(group => {
    // 永久有效的星星不计算过期
    if (group.expiryDate === 'permanent') return;
    
    const expiryDate = new Date(group.expiryDate);
    const expiryDateStr = dateUtils.formatDate(expiryDate);
    
    // 找到对应日期的预测数据
    const index = dateArray.indexOf(expiryDateStr);
    if (index !== -1) {
      forecast[index].expired += group.points;
    }
  });
  
  logger.info('analyticsManager', `过期预测计算完成，共${forecast.length}天数据`);
  
  // 通过回调返回预测数据
  if (typeof callback === 'function') {
    callback(forecast);
  }
  
  return forecast;
}
```

**预测原理**：
1. 获取所有星星分组数据
2. 计算预测的日期范围（未来N天）
3. 从分组数据中提取过期时间
4. 统计每天将过期的星星数量
5. 生成可视化数据供前端展示

## 数据流转

星星有效期和消费机制的完整数据流转如下：

1. **星星获取流程**：
```
任务完成 -> 计算过期时间 -> 添加总星星数 -> 添加到对应分组 -> 创建获取记录 -> 更新UI显示
```

2. **星星消费流程**：
```
用户兑换 -> 检查星星数量 -> 先过期先消费策略 -> 更新分组数据 -> 更新总星星数 -> 创建消费记录 -> 更新UI显示
```

3. **数据维护流程**：
```
定期检查 -> 清理过期分组 -> 验证数据一致性 -> 自动修复不一致 -> 更新UI显示
```

4. **过期预测流程**：
```
用户查看预测 -> 获取分组数据 -> 计算过期预测 -> 生成预测图表 -> 展示给用户
```

## 关键API

### pointsManager.js 关键函数

| 函数名 | 功能描述 |
|-------|---------|
| `addUserPoints` | 增加用户星星，并添加到对应过期时间的分组 |
| `reduceUserPoints` | 减少用户星星，实现"先过期先使用"策略 |
| `addStarsToGroup` | 将星星添加到特定过期时间的分组 |
| `cleanupExpiredGroups` | 清理已过期的星星分组 |
| `maintainStarGroups` | 维护星星分组数据一致性 |
| `getStarGroups` | 获取星星分组数据 |

### taskManager.js 关键函数

| 函数名 | 功能描述 |
|-------|---------|
| `calculateExpiryDate` | 根据有效期类型计算星星到期日期 |
| `updateTaskStatus` | 更新任务状态，处理星星获取和有效期 |

### analyticsManager.js 关键函数

| 函数名 | 功能描述 |
|-------|---------|
| `calculateExpiryForecast` | 计算未来星星过期趋势 |
| `getAllStarRecords` | 获取所有星星记录（获取、消费和过期） |

## 使用范例

### 1. 任务完成后添加星星

```javascript
// 在任务完成时调用
function onTaskCompleted(task) {
  // 更新任务状态为已完成
  taskManager.updateTaskStatus(task.id, 1, (result) => {
    if (result.success) {
      wx.showToast({
        title: '获得' + task.points + '颗星星！',
        icon: 'success'
      });
    }
  });
}
```

### 2. 兑换奖励时消费星星

```javascript
// 在兑换奖励时调用
function exchangeReward(reward) {
  // 检查星星是否足够
  const currentPoints = pointsManager.getUserPoints();
  if (currentPoints < reward.points) {
    wx.showToast({
      title: '星星不足',
      icon: 'none'
    });
    return;
  }
  
  // 消费星星
  pointsManager.reduceUserPoints(reward.points);
  
  // 添加到已兑换奖励
  addRewardToHistory(reward);
  
  wx.showToast({
    title: '兑换成功',
    icon: 'success'
  });
}
```

### 3. 展示过期预测

```javascript
// 在数据分析页面调用
function showExpiryForecast() {
  // 获取未来30天的过期预测
  analyticsManager.calculateExpiryForecast(30, (forecast) => {
    // 使用图表组件展示预测数据
    this.setData({
      expiryForecast: forecast
    });
  });
}
```

## 日志分析

系统在关键操作点添加了详细的日志记录，便于追踪和调试：

```javascript
// 添加星星时的日志
logger.info('pointsManager', `添加星星前检查: 当前=${currentPoints}, 增加=${points}, 预期结果=${newPoints}, 来源=${source || '未知'}`);

// 消费星星时的日志
logger.info('pointsManager', `从分组 [${group.expiryDateStr}] 消费${remainingPoints}颗星星`);

// 数据一致性检查日志
logger.info('pointsManager', `星星数据一致性检查通过: ${totalGroupPoints}`);

// 过期预测日志
logger.info('analyticsManager', `过期预测计算完成，共${forecast.length}天数据`);
```

通过这些日志可以：
1. 追踪星星的获取、消费和过期全过程
2. 监控数据一致性状态
3. 调试复杂的消费策略逻辑
4. 分析用户使用模式和优化系统

## 性能优化

为保证星星系统的高效运行，实施了以下优化措施：

1. **批量操作优化**：处理大量分组数据时使用批量处理，避免UI阻塞
2. **数据结构优化**：按过期时间排序的分组结构，提高消费操作效率
3. **缓存机制**：避免频繁的存储操作，减少性能开销
4. **懒加载**：预测功能采用按需计算，而非预先计算所有预测数据
5. **一致性检查**：维持适当的检查频率，避免过于频繁的数据一致性校验 