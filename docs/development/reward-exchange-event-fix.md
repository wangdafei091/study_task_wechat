# 奖励兑换事件处理修复文档

## 问题描述

用户在进行奖励兑换时，虽然兑换操作本身成功（星星正确扣除、奖励状态更新），但在事件处理阶段出现错误：

```
TypeError: Cannot read property 'name' of undefined
    at MessageService._handleRewardClaimed (message-service.js:344)
```

## 问题分析

### 根本原因
MessageService中的`_handleRewardClaimed`方法期望接收包含`reward`对象的事件数据，但实际接收到的事件数据格式不匹配。

### 数据格式不匹配
- **MessageService期望**：`{ reward: { name: "奖励名称", id: "...", points: 10 } }`
- **实际接收**：`{ rewardId: "...", rewardName: "...", points: 10, timestamp: ... }`

### 事件发送源
1. **奖励服务**（reward-service.js:564）：发送 `{ rewardId, rewardName, points, timestamp }`
2. **页面代码**（rewards.js:553）：发送 `{ rewardId, points, newTotalPoints, nextReward }`

## 修复方案

### 修复策略
1. 在MessageService中增加事件数据格式兼容性处理，支持多种数据格式
2. 修复页面代码中发送的事件数据，添加缺失的`rewardName`字段

### 修复内容

#### 1. 修改MessageService中的`_handleRewardClaimed`方法：

**修复前：**
```javascript
_handleRewardClaimed(data) {
  const { reward } = data;
  logger.info('MessageService', `处理奖励领取事件: ${reward.name}`);
  this._createRewardMessageWithDomainModel(reward, 'claimed');
}
```

**修复后：**
```javascript
_handleRewardClaimed(data) {
  // 兼容不同的事件数据格式
  let reward;
  
  if (data.reward) {
    // 新格式：直接包含reward对象
    reward = data.reward;
  } else if (data.rewardId && data.rewardName) {
    // 兼容格式：从rewardId和rewardName构造reward对象
    reward = {
      id: data.rewardId,
      name: data.rewardName,
      points: data.points || 0
    };
  } else {
    logger.warn('MessageService', '奖励领取事件数据格式不正确，跳过处理', data);
    return;
  }
  
  logger.info('MessageService', `处理奖励领取事件: ${reward.name}`);
  this._createRewardMessageWithDomainModel(reward, 'claimed');
}
```

## 修复效果

### 解决的问题
1. ✅ 消除`Cannot read property 'name' of undefined`错误
2. ✅ 保持奖励兑换功能正常工作
3. ✅ 消息系统能正常处理奖励领取事件

### 兼容性
- ✅ 支持新格式事件数据（包含reward对象）
- ✅ 支持现有格式事件数据（rewardId + rewardName）
- ✅ 对未知格式进行安全处理（记录警告并跳过）

### 稳定性提升
- 即使遇到格式不正确的事件数据，也不会导致程序崩溃
- 增加了详细的日志记录，便于后续调试
- 采用最小化修改原则，不影响其他功能

## 测试验证

修复后需要验证：
1. 奖励兑换功能正常工作
2. 不再出现事件处理错误
3. 消息系统能正确创建奖励领取消息
4. 日志记录正常

#### 2. 修复页面代码中的事件数据

**文件：** `pages/rewards/rewards.js`

**修复前：**
```javascript
app.globalData.eventBus.emit(EVENTS.REWARD_CLAIMED, {
  rewardId: reward.id,
  points: reward.points,
  newTotalPoints: targetPoints,
  nextReward: nextReward
});
```

**修复后：**
```javascript
app.globalData.eventBus.emit(EVENTS.REWARD_CLAIMED, {
  rewardId: reward.id,
  rewardName: reward.name,  // 添加rewardName字段以兼容MessageService
  points: reward.points,
  newTotalPoints: targetPoints,
  nextReward: nextReward
});
```

## 相关文件

- `services/message-service.js` - 主要修复文件
- `services/reward-service.js` - 事件发送源1
- `pages/rewards/rewards.js` - 事件发送源2（已修复）

## 修复日期

2025-05-26

## 修复类型

错误修复 - 事件处理兼容性问题 