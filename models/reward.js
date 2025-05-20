/**
 * reward.js - 奖励领域模型
 * 
 * 定义奖励实体的数据结构、验证规则和业务方法
 */

const logger = require('../utils/logger');

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
    
    logger.info('Reward', `奖励已创建/加载: ${this.name} [${this.id}]`, {
      enabled: this.enabled,
      claimed: this.claimed,
      points: this.points
    });
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
   * 兑换奖励
   * @returns {Reward} 当前奖励实例
   */
  claim() {
    if (this.claimed) {
      logger.warn('Reward', `奖励 ${this.name} [${this.id}] 已经被兑换`);
      return this;
    }
    
    if (!this.enabled) {
      logger.warn('Reward', `奖励 ${this.name} [${this.id}] 已禁用，无法兑换`);
      return this;
    }
    
    this.claimed = true;
    this.claimTime = Date.now();
    this.claimStatus = RewardStatus.CLAIMED;
    
    logger.info('Reward', `奖励已兑换: ${this.name} [${this.id}]`);
    
    return this;
  }
  
  /**
   * 标记奖励为已领取
   * @returns {Reward} 当前奖励实例
   */
  deliver() {
    if (!this.claimed) {
      logger.warn('Reward', `奖励 ${this.name} [${this.id}] 尚未兑换，无法标记为已领取`);
      return this;
    }
    
    if (this.claimStatus === RewardStatus.DELIVERED) {
      logger.warn('Reward', `奖励 ${this.name} [${this.id}] 已经被标记为已领取`);
      return this;
    }
    
    this.claimStatus = RewardStatus.DELIVERED;
    this.deliveryTime = Date.now();
    
    logger.info('Reward', `奖励已领取: ${this.name} [${this.id}]`);
    
    return this;
  }
  
  /**
   * 启用奖励
   * @returns {Reward} 当前奖励实例
   */
  enable() {
    if (this.enabled) {
      return this;
    }
    
    this.enabled = true;
    logger.info('Reward', `奖励已启用: ${this.name} [${this.id}]`);
    
    return this;
  }
  
  /**
   * 禁用奖励
   * @returns {Reward} 当前奖励实例
   */
  disable() {
    // 示例奖励不允许禁用
    if (this.isExample) {
      logger.warn('Reward', `示例奖励无法禁用: ${this.name} [${this.id}]`);
      return this;
    }
    
    if (!this.enabled) {
      return this;
    }
    
    this.enabled = false;
    logger.info('Reward', `奖励已禁用: ${this.name} [${this.id}]`);
    
    return this;
  }
  
  /**
   * 取消兑换
   * @returns {Reward} 当前奖励实例
   */
  unclaim() {
    if (!this.claimed) {
      return this;
    }
    
    // 已领取的奖励不能取消兑换
    if (this.claimStatus === RewardStatus.DELIVERED) {
      logger.warn('Reward', `已领取的奖励无法取消兑换: ${this.name} [${this.id}]`);
      return this;
    }
    
    this.claimed = false;
    this.claimTime = 0;
    this.claimStatus = RewardStatus.AVAILABLE;
    
    logger.info('Reward', `奖励已取消兑换: ${this.name} [${this.id}]`);
    
    return this;
  }
  
  /**
   * 更新奖励信息
   * @param {Object} data 要更新的数据
   * @returns {Reward} 当前奖励实例
   */
  update(data) {
    if (!data) return this;
    
    // 更新基本字段
    if (data.name !== undefined) this.name = data.name;
    if (data.description !== undefined) this.description = data.description;
    if (data.type !== undefined) this.type = data.type;
    if (data.points !== undefined) this.points = data.points;
    if (data.icon !== undefined) this.icon = data.icon;
    if (data.notes !== undefined) this.notes = data.notes;
    if (data.tags !== undefined) this.tags = [...data.tags];
    
    // 示例奖励始终保持启用状态
    if (data.enabled !== undefined && !this.isExample) {
      this.enabled = data.enabled;
    }
    
    logger.info('Reward', `奖励已更新: ${this.name} [${this.id}]`);
    
    return this;
  }
  
  /**
   * 是否可兑换
   * @returns {Boolean} 是否可兑换
   */
  isAvailable() {
    return this.enabled && !this.claimed;
  }
  
  /**
   * 是否已兑换但未领取
   * @returns {Boolean} 是否已兑换未领取
   */
  isPending() {
    return this.claimed && this.claimStatus === RewardStatus.CLAIMED;
  }
  
  /**
   * 是否已领取
   * @returns {Boolean} 是否已领取
   */
  isDelivered() {
    return this.claimed && this.claimStatus === RewardStatus.DELIVERED;
  }
  
  /**
   * 获取奖励状态描述
   * @returns {String} 状态描述
   */
  getStatusDescription() {
    if (!this.enabled) {
      return '已禁用';
    }
    
    if (!this.claimed) {
      return '可兑换';
    }
    
    return this.claimStatus === RewardStatus.DELIVERED ? '已领取' : '待领取';
  }
  
  /**
   * 克隆奖励创建一个新实例
   * @param {Object} overrides 要覆盖的属性
   * @returns {Reward} 新的奖励实例
   */
  clone(overrides = {}) {
    const clonedData = {
      ...this,
      id: `reward_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      createTime: Date.now(),
      claimed: false,
      claimTime: 0,
      claimStatus: RewardStatus.AVAILABLE,
      deliveryTime: 0,
      ...overrides
    };
    
    return new Reward(clonedData);
  }
}

// 导出类和枚举
module.exports = {
  Reward,
  RewardStatus,
  RewardType
}; 