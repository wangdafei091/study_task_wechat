# 缓存一致性修复文档

## 问题描述

在奖励兑换功能中发现数据不一致问题：
- 奖励兑换操作本身成功
- 但页面显示的星星数量和即将到期的星星提示都是错误的
- 存在缓存不一致导致的数据显示问题

## 问题分析

### 根本原因
缓存管理不当导致的数据不一致：

1. **星星分组数据不一致**：同一个分组ID在不同查询中显示不同的星星数量
2. **缓存不一致问题**：
   - 动画完成后查询：显示正确的扣除后数量
   - 页面重新加载时查询：显示错误的原始数量
3. **存储适配器缓存问题**：缓存中的数据没有及时更新
4. **数据更新时序问题**：奖励兑换流程中数据更新顺序导致某些查询返回旧数据

### 技术细节
- 涉及的主要文件：`services/star-service.js`、`pages/rewards/rewards.js`、`repositories/`
- 主要问题：缓存数据不一致、数据查询时机问题
- 影响范围：奖励兑换后的页面数据显示

## 修复方案

### 1. 添加缓存清除方法

#### StarService
```javascript
/**
 * 清除缓存
 * 强制下次查询时重新从存储中获取数据
 */
clearCache() {
  logger.info('StarService', '清除星星服务缓存');
  
  // 清除仓储层缓存
  if (this.starGroupRepository && this.starGroupRepository.clearCache) {
    this.starGroupRepository.clearCache();
  }
  
  if (this.starRecordRepository && this.starRecordRepository.clearCache) {
    this.starRecordRepository.clearCache();
  }
}
```

#### StarGroupRepository
```javascript
/**
 * 清除缓存
 * 强制下次查询时重新从存储中获取数据
 */
clearCache() {
  logger.info('StarGroupRepository', '清除星星分组仓储缓存');
  
  // 调用父类的清除缓存方法
  if (super.clearCache) {
    super.clearCache();
  }
  
  // 清除存储适配器缓存
  if (this.storageAdapter && this.storageAdapter.clearCache) {
    this.storageAdapter.clearCache();
  }
}
```

#### StarRecordRepository
```javascript
/**
 * 清除缓存
 * 强制下次查询时重新从存储中获取数据
 */
clearCache() {
  logger.info('StarRecordRepository', '清除星星记录仓储缓存');
  
  // 调用父类的清除缓存方法
  if (super.clearCache) {
    super.clearCache();
  }
  
  // 清除存储适配器缓存
  if (this.storageAdapter && this.storageAdapter.clearCache) {
    this.storageAdapter.clearCache();
  }
}
```

#### BaseRepository
```javascript
/**
 * 清除缓存（别名方法）
 */
clearCache() {
  this.invalidateCache();
}
```

### 2. 强化数据加载时的缓存清除

#### loadRewardsData方法
```javascript
loadRewardsData: async function () {
  console.log('[rewards] 开始加载奖励数据');
  
  try {
    wx.showLoading({ title: '加载中' });
    
    // 获取服务实例
    const starService = serviceManager.getService('starService');
    const rewardService = serviceManager.getService('rewardService');
    
    if (!starService || !rewardService) {
      console.error('[rewards] 无法获取服务实例');
      wx.hideLoading();
      return;
    }
    
    // 强制清除所有相关缓存，确保获取最新数据
    console.log('[rewards] 强制清除缓存以获取最新数据');
    if (starService.clearCache) {
      starService.clearCache();
    }
    if (rewardService.clearCache) {
      rewardService.clearCache();
    }
    
    // 清除存储适配器缓存
    const storageAdapter = serviceManager.getService('storageAdapter');
    if (storageAdapter && storageAdapter.clearCache) {
      storageAdapter.clearCache();
    }
    
    // ... 继续数据加载逻辑
  }
}
```

### 3. 奖励兑换完成后的缓存清除

#### 动画完成回调
```javascript
this.animateStarsCount(originalPoints, targetPoints, async () => {
  // 动画完成后，强制清除所有缓存确保数据一致性
  console.log('[rewards] 动画完成，强制清除缓存确保数据一致性');
  if (starService.clearCache) {
    starService.clearCache();
  }
  if (rewardService.clearCache) {
    rewardService.clearCache();
  }
  const storageAdapter = serviceManager.getService('storageAdapter');
  if (storageAdapter && storageAdapter.clearCache) {
    storageAdapter.clearCache();
  }
  
  // 计算下一个可用奖励
  const nextReward = await rewardService.calculateNextAvailableReward();
  
  // 重新加载奖励数据以更新UI
  await this.loadRewardsData();
  
  // ... 其他逻辑
});
```

### 4. 页面显示时的缓存清除

#### onShow生命周期
```javascript
onShow: async function () {
  console.log('[rewards] 页面显示');
  
  // 获取应用实例
  const app = getApp();
  
  // 检查是否需要刷新奖励信息
  if (app.globalData.needRefreshReward) {
    console.log('[rewards] 检测到奖励数据变更标记，强制刷新');
    
    // 强制清除所有相关缓存
    const starService = serviceManager.getService('starService');
    const rewardService = serviceManager.getService('rewardService');
    const storageAdapter = serviceManager.getService('storageAdapter');
    
    if (starService && starService.clearCache) {
      starService.clearCache();
    }
    if (rewardService && rewardService.clearCache) {
      rewardService.clearCache();
    }
    if (storageAdapter && storageAdapter.clearCache) {
      storageAdapter.clearCache();
    }
    
    // 重新加载数据
    await this.loadRewardsData();
  } else {
    // 常规刷新
    await this.loadRewardsData();
  }
}
```

## 修复效果

### 解决的问题
1. **数据一致性**：确保奖励兑换后页面显示的数据与实际数据一致
2. **缓存同步**：强制清除所有相关缓存，避免读取过期数据
3. **时序问题**：在关键节点清除缓存，确保数据更新的时序正确
4. **用户体验**：用户看到的星星数量和过期提示都是准确的

### 验证方法
1. **功能测试**：执行奖励兑换操作，验证页面数据显示正确
2. **缓存测试**：验证各服务的clearCache方法正常工作
3. **一致性测试**：验证多次页面切换后数据保持一致
4. **自动化测试**：运行`test/cache-consistency-fix-test.js`验证修复效果

## 测试验证

### 运行测试
```bash
# 运行缓存一致性修复测试
node test/cache-consistency-fix-test.js
```

### 测试覆盖
- ✅ 缓存清除方法测试
- ✅ 奖励兑换流程测试
- ✅ 数据一致性验证
- ✅ 页面重新加载测试

## 注意事项

### 性能考虑
- 缓存清除会导致下次查询重新从存储读取数据
- 在关键操作后清除缓存是必要的，但不应过度使用
- 保持缓存清除的精确性，只在必要时清除

### 维护建议
1. **监控日志**：关注缓存清除的日志，确保操作正常
2. **定期检查**：定期验证数据一致性
3. **代码审查**：新增缓存相关代码时要考虑一致性问题
4. **文档更新**：保持文档与代码同步

## 相关文件

### 修改的文件
- `services/star-service.js` - 添加clearCache方法
- `repositories/star-group-repository.js` - 添加clearCache方法
- `repositories/star-record-repository.js` - 添加clearCache方法
- `repositories/base-repository.js` - 添加clearCache别名方法
- `pages/rewards/rewards.js` - 强化缓存清除逻辑

### 新增的文件
- `test/cache-consistency-fix-test.js` - 缓存一致性修复测试
- `docs/development/cache-consistency-fix.md` - 本文档

## 总结

通过系统性地添加缓存清除机制，解决了奖励兑换后的数据不一致问题。修复方案确保了：

1. **数据准确性**：用户看到的数据与实际数据一致
2. **系统稳定性**：避免了缓存不一致导致的异常
3. **用户体验**：提供了可靠的奖励兑换功能
4. **可维护性**：建立了完善的缓存管理机制

这次修复为项目建立了更好的缓存管理模式，为后续功能开发提供了参考。 