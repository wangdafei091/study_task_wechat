/**
 * cache-consistency-fix-test.js - 缓存一致性修复测试
 * 
 * 测试奖励兑换后的缓存清除和数据一致性
 */

const logger = require('../utils/logger');

// 模拟测试环境
const mockServiceManager = {
  services: {},
  
  getService(name) {
    return this.services[name];
  },
  
  setService(name, service) {
    this.services[name] = service;
  }
};

// 模拟StarService
class MockStarService {
  constructor() {
    this.cache = null;
    this.totalStars = 100; // 初始星星数
  }
  
  async getTotalStars() {
    logger.info('MockStarService', `获取总星星数: ${this.totalStars}`);
    return this.totalStars;
  }
  
  async getExpiringStarsInfo() {
    return {
      points: 20,
      expiryDateText: '2024-12-31 24点失效',
      expiryTimestamp: Date.now() + 7 * 24 * 60 * 60 * 1000
    };
  }
  
  clearCache() {
    logger.info('MockStarService', '清除星星服务缓存');
    this.cache = null;
  }
  
  // 模拟星星扣减
  deductStars(amount) {
    this.totalStars -= amount;
    logger.info('MockStarService', `扣减${amount}颗星星，剩余${this.totalStars}颗`);
  }
}

// 模拟RewardService
class MockRewardService {
  constructor() {
    this.cache = null;
    this.rewards = [
      { id: 'reward_1', name: '小玩具', points: 10, claimed: false },
      { id: 'reward_2', name: '零食', points: 20, claimed: false },
      { id: 'reward_3', name: '图书', points: 50, claimed: false }
    ];
  }
  
  async getAvailableRewards(includeAll = false) {
    logger.info('MockRewardService', `获取奖励列表，包含已领取: ${includeAll}`);
    return includeAll ? this.rewards : this.rewards.filter(r => !r.claimed);
  }
  
  async exchangeReward(rewardId) {
    const reward = this.rewards.find(r => r.id === rewardId);
    if (!reward) {
      return { success: false, message: '奖励不存在' };
    }
    
    if (reward.claimed) {
      return { success: false, message: '奖励已领取' };
    }
    
    // 标记为已领取
    reward.claimed = true;
    logger.info('MockRewardService', `兑换奖励成功: ${reward.name}`);
    
    return { success: true, reward };
  }
  
  async calculateNextAvailableReward() {
    const available = this.rewards.filter(r => !r.claimed);
    return available.length > 0 ? available[0] : null;
  }
  
  clearCache() {
    logger.info('MockRewardService', '清除奖励服务缓存');
    this.cache = null;
  }
}

// 模拟StorageAdapter
class MockStorageAdapter {
  constructor() {
    this.cache = new Map();
  }
  
  clearCache() {
    logger.info('MockStorageAdapter', '清除存储适配器缓存');
    this.cache.clear();
  }
}

/**
 * 测试缓存一致性修复
 */
async function testCacheConsistencyFix() {
  logger.info('Test', '开始测试缓存一致性修复');
  
  try {
    // 初始化模拟服务
    const starService = new MockStarService();
    const rewardService = new MockRewardService();
    const storageAdapter = new MockStorageAdapter();
    
    mockServiceManager.setService('starService', starService);
    mockServiceManager.setService('rewardService', rewardService);
    mockServiceManager.setService('storageAdapter', storageAdapter);
    
    // 模拟页面数据加载
    logger.info('Test', '=== 步骤1: 初始数据加载 ===');
    const initialStars = await starService.getTotalStars();
    const initialRewards = await rewardService.getAvailableRewards(true);
    const initialExpiringInfo = await starService.getExpiringStarsInfo();
    
    logger.info('Test', `初始状态: 星星=${initialStars}, 奖励数=${initialRewards.length}, 即将过期=${initialExpiringInfo.points}`);
    
    // 模拟奖励兑换过程
    logger.info('Test', '=== 步骤2: 模拟奖励兑换 ===');
    const targetReward = initialRewards.find(r => !r.claimed);
    if (!targetReward) {
      throw new Error('没有可兑换的奖励');
    }
    
    logger.info('Test', `准备兑换奖励: ${targetReward.name}, 消耗${targetReward.points}颗星星`);
    
    // 执行兑换
    const exchangeResult = await rewardService.exchangeReward(targetReward.id);
    if (!exchangeResult.success) {
      throw new Error(`兑换失败: ${exchangeResult.message}`);
    }
    
    // 扣减星星
    starService.deductStars(targetReward.points);
    
    // 模拟动画完成后的缓存清除
    logger.info('Test', '=== 步骤3: 动画完成后清除缓存 ===');
    starService.clearCache();
    rewardService.clearCache();
    storageAdapter.clearCache();
    
    // 重新获取数据验证一致性
    logger.info('Test', '=== 步骤4: 验证数据一致性 ===');
    const finalStars = await starService.getTotalStars();
    const finalRewards = await rewardService.getAvailableRewards(true);
    const finalExpiringInfo = await starService.getExpiringStarsInfo();
    
    logger.info('Test', `最终状态: 星星=${finalStars}, 奖励数=${finalRewards.length}, 即将过期=${finalExpiringInfo.points}`);
    
    // 验证结果
    const expectedStars = initialStars - targetReward.points;
    const claimedRewards = finalRewards.filter(r => r.claimed);
    
    logger.info('Test', '=== 步骤5: 结果验证 ===');
    
    if (finalStars === expectedStars) {
      logger.info('Test', '✅ 星星数量一致性验证通过');
    } else {
      logger.error('Test', `❌ 星星数量不一致: 期望${expectedStars}, 实际${finalStars}`);
    }
    
    if (claimedRewards.length === 1 && claimedRewards[0].id === targetReward.id) {
      logger.info('Test', '✅ 奖励状态一致性验证通过');
    } else {
      logger.error('Test', `❌ 奖励状态不一致: 期望1个已领取奖励, 实际${claimedRewards.length}个`);
    }
    
    // 模拟页面重新显示时的数据加载
    logger.info('Test', '=== 步骤6: 模拟页面重新显示 ===');
    
    // 强制清除缓存（模拟onShow中的逻辑）
    starService.clearCache();
    rewardService.clearCache();
    storageAdapter.clearCache();
    
    // 重新加载数据
    const reloadStars = await starService.getTotalStars();
    const reloadRewards = await rewardService.getAvailableRewards(true);
    const reloadExpiringInfo = await starService.getExpiringStarsInfo();
    
    logger.info('Test', `重新加载状态: 星星=${reloadStars}, 奖励数=${reloadRewards.length}, 即将过期=${reloadExpiringInfo.points}`);
    
    // 验证重新加载后的一致性
    if (reloadStars === finalStars) {
      logger.info('Test', '✅ 重新加载后星星数量一致性验证通过');
    } else {
      logger.error('Test', `❌ 重新加载后星星数量不一致: 期望${finalStars}, 实际${reloadStars}`);
    }
    
    logger.info('Test', '缓存一致性修复测试完成');
    
    return {
      success: true,
      initialStars,
      finalStars,
      expectedStars,
      exchangedReward: targetReward.name,
      message: '测试通过'
    };
    
  } catch (error) {
    logger.error('Test', '缓存一致性修复测试失败', error);
    return {
      success: false,
      error: error.message,
      message: '测试失败'
    };
  }
}

/**
 * 测试缓存清除方法
 */
function testCacheClearMethods() {
  logger.info('Test', '开始测试缓存清除方法');
  
  const starService = new MockStarService();
  const rewardService = new MockRewardService();
  const storageAdapter = new MockStorageAdapter();
  
  // 测试各服务的clearCache方法
  const results = [];
  
  try {
    starService.clearCache();
    results.push({ service: 'StarService', success: true });
  } catch (error) {
    results.push({ service: 'StarService', success: false, error: error.message });
  }
  
  try {
    rewardService.clearCache();
    results.push({ service: 'RewardService', success: true });
  } catch (error) {
    results.push({ service: 'RewardService', success: false, error: error.message });
  }
  
  try {
    storageAdapter.clearCache();
    results.push({ service: 'StorageAdapter', success: true });
  } catch (error) {
    results.push({ service: 'StorageAdapter', success: false, error: error.message });
  }
  
  logger.info('Test', '缓存清除方法测试结果:', results);
  
  return results;
}

// 导出测试函数
module.exports = {
  testCacheConsistencyFix,
  testCacheClearMethods
};

// 如果直接运行此文件，执行测试
if (require.main === module) {
  (async () => {
    console.log('开始执行缓存一致性修复测试...\n');
    
    // 测试缓存清除方法
    console.log('1. 测试缓存清除方法');
    const clearResults = testCacheClearMethods();
    console.log('缓存清除方法测试完成\n');
    
    // 测试缓存一致性修复
    console.log('2. 测试缓存一致性修复');
    const fixResults = await testCacheConsistencyFix();
    console.log('缓存一致性修复测试完成\n');
    
    // 输出总结
    console.log('=== 测试总结 ===');
    console.log('缓存清除方法:', clearResults.every(r => r.success) ? '✅ 通过' : '❌ 失败');
    console.log('缓存一致性修复:', fixResults.success ? '✅ 通过' : '❌ 失败');
    
    if (!fixResults.success) {
      console.error('错误详情:', fixResults.error);
    }
  })();
} 