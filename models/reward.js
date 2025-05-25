/**
 * reward.js - 奖励领域模型
 * 
 * 定义奖励实体的数据结构、验证规则和业务方法
 */

/**
 * 奖励状态枚举
 */
const RewardStatus = {
  AVAILABLE: 'available',   // 可兑换
  CLAIMED: 'claimed',       // 已兑换未领取
  DELIVERED: 'delivered',   // 已领取
  DISABLED: 'disabled'      // 已禁用
};

/**
 * 奖励类型枚举
 */
const RewardType = {
  ITEM: 'item',             // 物品奖励
  PRIVILEGE: 'privilege',   // 特权奖励
  ACTIVITY: 'activity'      // 活动奖励
};

class Reward {
  /**
   * 构造函数
   * @param {Object} data 奖励数据
   */
  constructor(data = {}) {
    // 基础信息
    this.id = data.id || `reward_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.name = data.name || '';
    this.description = data.description || '';
    this.type = data.type || RewardType.ITEM;
    this.points = data.points || 0; // 所需星星数
    this.icon = data.icon || '🎁';
    
    // 状态相关
    this.enabled = data.enabled !== false; // 默认启用
    this.claimed = data.claimed || false;
    this.claimTime = data.claimTime || 0;
    this.claimStatus = data.claimStatus || (data.claimed ? RewardStatus.CLAIMED : RewardStatus.AVAILABLE);
    this.deliveryTime = data.deliveryTime || 0;
    
    // 其他属性
    this.createTime = data.createTime || Date.now();
    this.isExample = data.isExample || false;
    this.tags = data.tags || [];
    this.notes = data.notes || '';
  }
  
  /**
   * 验证奖励数据有效性
   * @returns {Array} 错误信息数组，如果没有错误则为空数组
   */
  validate() {
    const errors = [];
    
    // 验证基本信息
    if (!this.name) {
      errors.push('奖励名称不能为空');
    }
    
    if (this.points < 0) {
      errors.push('奖励所需星星数不能为负数');
    }
    
    // 状态验证
    if (this.claimed && !this.claimTime) {
      errors.push('已兑换的奖励必须有兑换时间');
    }
    
    return errors;
  }
  
  /**
   * 是否可兑换
   * @param {Boolean} hasCustomRewards 是否有自定义奖励，由服务层提供
   * @returns {Boolean} 是否可兑换
   */
  isAvailable(hasCustomRewards = false) {
    // 对于示例奖励，只有在没有其他自定义奖励的情况下才认为可用
    if (this.isExample && hasCustomRewards) {
      return false; // 如果有自定义奖励，示例奖励不可用
    }
    
    // 常规检查：已启用且未领取
    return this.enabled && !this.claimed;
  }
  
  /**
   * 兑换奖励
   * @returns {Reward} 当前奖励实例
   */
  claim() {
    if (this.claimed) {
      return this;
    }
    
    if (!this.enabled) {
      return this;
    }
    
    this.claimed = true;
    this.claimTime = Date.now();
    this.claimStatus = RewardStatus.CLAIMED;
    
    return this;
  }
  
  /**
   * 标记奖励为已领取
   * @returns {Reward} 当前奖励实例
   */
  deliver() {
    if (!this.claimed) {
      return this;
    }
    
    this.claimStatus = RewardStatus.DELIVERED;
    this.deliveryTime = Date.now();
    
    return this;
  }
  
  /**
   * 取消兑换
   * @returns {Reward} 当前奖励实例
   */
  unclaim() {
    // 如果奖励已领取，则不能取消兑换
    if (this.claimStatus === RewardStatus.DELIVERED) {
      return this;
    }
    
    this.claimed = false;
    this.claimTime = 0;
    this.claimStatus = RewardStatus.AVAILABLE;
    
    return this;
  }
  
  /**
   * 启用奖励
   * @returns {Reward} 当前奖励实例
   */
  enable() {
    this.enabled = true;
    return this;
  }
  
  /**
   * 禁用奖励
   * @returns {Reward} 当前奖励实例
   */
  disable() {
    this.enabled = false;
    return this;
  }
  
  /**
   * 检查奖励是否已领取
   * @returns {Boolean} 是否已领取
   */
  isDelivered() {
    return this.claimStatus === RewardStatus.DELIVERED;
  }
  
  /**
   * 检查奖励是否待领取（已兑换但未领取）
   * @returns {Boolean} 是否待领取
   */
  isPending() {
    return this.claimed && this.claimStatus === RewardStatus.CLAIMED;
  }
  
  /**
   * 克隆奖励
   * @param {Object} overrides 要覆盖的属性
   * @param {Boolean} generateNewId 是否生成新ID，默认为true
   * @returns {Reward} 新的奖励实例
   */
  clone(overrides = {}, generateNewId = true) {
    // 准备基础数据
    const baseData = { ...this };
    
    // 如果需要生成新ID
    if (generateNewId) {
      baseData.id = `reward_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      baseData.claimed = false;
      baseData.claimTime = 0;
      baseData.claimStatus = RewardStatus.AVAILABLE;
      baseData.deliveryTime = 0;
      baseData.createTime = Date.now();
    }
    
    // 应用覆盖属性
    const clonedData = {
      ...baseData,
      ...overrides
    };
    
    return new Reward(clonedData);
  }
}

module.exports = {
  Reward,
  RewardStatus,
  RewardType
};