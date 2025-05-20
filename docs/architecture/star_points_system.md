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
    const dateStr = dateUtils.formatDate(expiryDate);
    
    // 查找预测数据中对应的日期
    const forecastItem = forecast.find(item => item.date === dateStr);
    if (forecastItem) {
      forecastItem.expired += group.points;
    }
  });
  
  callback && callback(forecast);
  return forecast;
}
```

**过期预测功能**：
1. 获取未来一段时间内的日期数组
2. 遍历所有星星分组，计算每个分组的过期日期
3. 统计每天过期的星星数量
4. 生成过期预测图表，提示用户合理使用星星

## 有效期计算逻辑

星星有效期的计算基于自然周期（自然周/月/季/年），具体计算逻辑如下：

```javascript
// 在 taskManager.js 中实现的有效期计算
calculateExpiryDate: function(expiryType, completionDate) {
  logger.log('taskManager', `计算积分有效期: 类型=${expiryType}, 完成日期=${completionDate.toISOString()}`);
  
  // 如果是永久有效，直接返回
  if (expiryType === 'permanent') {
    logger.log('taskManager', '积分永久有效');
    return {
      expiry: 'permanent',
      expiryDateStr: '永久'
    };
  }
  
  // 今天日期的零点
  const today = new Date(completionDate);
  today.setHours(0, 0, 0, 0);
  
  let expiryDate = new Date(today);
  let specialCase = '';
  
  switch (expiryType) {
    case 'week': {
      // 计算到当前自然周的周日24点
      const dayOfWeek = today.getDay(); // 0是周日，1-6是周一到周六
      
      if (dayOfWeek === 0) {
        // 周日完成，当天24点失效
        expiryDate.setHours(23, 59, 59, 999);
        specialCase = '当天24点失效';
      } else {
        // 计算到本周日的天数差
        const daysUntilSunday = 7 - dayOfWeek;
        expiryDate.setDate(today.getDate() + daysUntilSunday);
        expiryDate.setHours(23, 59, 59, 999);
      }
      break;
    }
    
    case 'month': {
      // 计算到当前自然月末24点
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      
      // 下个月的第0天就是当前月的最后一天
      expiryDate = new Date(currentYear, currentMonth + 1, 0);
      expiryDate.setHours(23, 59, 59, 999);
      
      // 检查是否是月末完成的
      const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      if (today.getDate() === lastDayOfMonth) {
        specialCase = '当天24点失效';
      }
      break;
    }
    
    case '3months': {
      // 计算到当前自然季度末24点
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      
      // 确定当前季度的最后一个月
      const quarterLastMonth = Math.floor(currentMonth / 3) * 3 + 2;
      
      // 下个月的第0天就是当前月的最后一天
      expiryDate = new Date(currentYear, quarterLastMonth + 1, 0);
      expiryDate.setHours(23, 59, 59, 999);
      break;
    }
    
    case '6months': {
      // 计算到当前自然半年末24点
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      
      // 确定当前半年的最后一个月
      const halfYearLastMonth = Math.floor(currentMonth / 6) * 6 + 5;
      
      // 下个月的第0天就是当前月的最后一天
      expiryDate = new Date(currentYear, halfYearLastMonth + 1, 0);
      expiryDate.setHours(23, 59, 59, 999);
      break;
    }
    
    case '12months': {
      // 计算到当前自然年末24点
      const currentYear = today.getFullYear();
      
      // 当年12月31日24点
      expiryDate = new Date(currentYear, 11, 31);
      expiryDate.setHours(23, 59, 59, 999);
      break;
    }
  }
  
  // 格式化日期为可读格式
  const dateStr = dateUtils.formatDate(expiryDate);
  let expiryDateStr = '';
  
  if (specialCase) {
    expiryDateStr = specialCase;
  } else {
    // 检查是否是今天或明天
    const todayStr = dateUtils.formatDate(new Date());
    
    if (dateStr === todayStr) {
      expiryDateStr = '今天24点失效';
    } else {
      expiryDateStr = dateStr + ' 24点失效';
    }
  }
  
  logger.log('taskManager', `计算结果: ${expiryDateStr}`);
  return {
    expiry: expiryDate.getTime(),
    expiryDateStr: expiryDateStr
  };
}
```

## 用户界面展示

### 星星有效期显示

在任务详情和任务编辑页面，显示星星的有效期信息：

```html
<!-- 在任务详情页展示星星有效期 -->
<view class="points-info">
  <text class="points-value">{{task.points}}</text>
  <text class="points-label">颗星星</text>
  <text class="points-expiry">{{task.pointsExpiryDate ? '(有效期: ' + task.pointsExpiryDate + ')' : ''}}</text>
</view>
```

### 星星过期预警

系统提供星星过期预警功能，当有星星即将过期时，通过消息中心提醒用户：

```javascript
// 在 messageManager.js 中实现的过期预警
createExpiryWarningMessage: function(expiryPoints, expiryDate) {
  const message = {
    id: 'msg_expiry_' + Date.now(),
    type: 'warning',
    title: '星星即将过期',
    summary: `你有 ${expiryPoints} 颗星星将在 ${expiryDate} 过期`,
    content: `请及时使用这些星星，避免浪费。可以前往奖池页面兑换奖品。`,
    timestamp: Date.now(),
    isRead: false,
    icon: '⚠️'
  };
  
  this.addMessage(message);
  return message;
}
```

## 总结

星星有效期和消费机制的实现，有效地解决了以下问题：

1. **合理使用激励**：通过设置有效期，鼓励用户及时使用星星兑换奖励
2. **数据一致性**：通过分组存储和定期维护，确保星星数据的准确性
3. **用户体验优化**：提供过期预测和预警，帮助用户合理规划星星使用
4. **公平消费策略**：实现"先过期先使用"的消费策略，最大化用户利益

后续优化方向包括：

1. 提供更精细的星星使用分析
2. 增强数据同步和备份机制
3. 实现更灵活的有效期配置
4. 支持家长端设置和管理星星策略 