/**
 * reward-repository.js - 奖励仓储
 * 
 * 提供奖励实体的存储和检索，继承自基础仓储类
 */

const BaseRepository = require('./base-repository');
const { Reward, RewardStatus } = require('../models/reward');
const logger = require('../utils/logger');

class RewardRepository extends BaseRepository {
  /**
   * 构造函数
   * @param {StorageAdapter} storageAdapter 可选的存储适配器
   * @param {Object} options 选项
   */
  constructor(storageAdapter, options = {}) {
    const storageKey = options.storageKey || 'rewards';
    super(storageKey, Reward, {
      namespace: options.namespace || '',
      useCache: options.useCache !== false,
      cacheExpiry: options.cacheExpiry || 60000,
      cacheTTL: options.cacheTTL || 10000
    });
    
    // 如果提供了存储适配器，则使用它替换默认的
    if (storageAdapter) {
      this.storageAdapter = storageAdapter;
    }
    
    logger.info('RewardRepository', '初始化奖励仓储');
  }
  
  /**
   * 获取可用的奖励
   * @returns {Promise<Array>} 可用的奖励列表
   */
  async getAvailableRewards() {
    try {
      // 先获取所有数据，然后手动过滤
      const allRewards = await this.getAll();
      
      // 检查是否存在自定义奖励
      const hasCustomRewards = allRewards.some(r => !r.isExample && r.enabled);
      
      // 如果有自定义奖励，则过滤掉示例奖励
      let filteredRewards;
      if (hasCustomRewards) {
        logger.info('RewardRepository', `存在自定义奖励，将过滤掉示例奖励`);
        filteredRewards = allRewards.filter(r => !r.isExample && r.isAvailable());
      } else {
        filteredRewards = allRewards.filter(r => r.isAvailable());
      }
      
      logger.info('RewardRepository', `获取可用奖励成功, 数量=${filteredRewards.length}`);
      return filteredRewards;
    } catch (error) {
      logger.error('RewardRepository', '获取可用奖励失败', error);
      return [];
    }
  }
  
  /**
   * 获取已兑换的奖励
   * @param {Boolean} onlyPending 是否只获取待领取的奖励
   * @returns {Promise<Array>} 已兑换的奖励列表
   */
  async getClaimedRewards(onlyPending = false) {
    try {
      let rewards;
      
      if (onlyPending) {
        rewards = await this.query(reward => reward.isPending());
      } else {
        rewards = await this.query(reward => reward.claimed);
      }
      
      logger.info('RewardRepository', `获取${onlyPending ? '待领取' : '已兑换'}奖励成功, 数量=${rewards.length}`);
      return rewards;
    } catch (error) {
      logger.error('RewardRepository', `获取${onlyPending ? '待领取' : '已兑换'}奖励失败`, error);
      return [];
    }
  }
  
  /**
   * 获取已领取的奖励
   * @returns {Promise<Array>} 已领取的奖励列表
   */
  async getDeliveredRewards() {
    try {
      const rewards = await this.query(reward => reward.isDelivered());
      logger.info('RewardRepository', `获取已领取奖励成功, 数量=${rewards.length}`);
      return rewards;
    } catch (error) {
      logger.error('RewardRepository', '获取已领取奖励失败', error);
      return [];
    }
  }
  
  /**
   * 按星星数排序获取奖励
   * @param {Boolean} ascending 是否升序排序
   * @param {Boolean} onlyAvailable 是否只获取可用的奖励
   * @returns {Promise<Array>} 排序后的奖励列表
   */
  async getRewardsByPointsOrder(ascending = true, onlyAvailable = true) {
    try {
      // 获取奖励
      let rewards;
      
      if (onlyAvailable) {
        rewards = await this.getAvailableRewards();
      } else {
        rewards = await this.getAll();
      }
      
      // 按星星数排序
      const sortedRewards = [...rewards].sort((a, b) => {
        return ascending ? a.points - b.points : b.points - a.points;
      });
      
      logger.info('RewardRepository', `按星星数${ascending ? '升序' : '降序'}获取${onlyAvailable ? '可用' : '所有'}奖励成功, 数量=${sortedRewards.length}`);
      return sortedRewards;
    } catch (error) {
      logger.error('RewardRepository', `按星星数排序获取奖励失败`, error);
      return [];
    }
  }
  
  /**
   * 获取用户可兑换的奖励
   * @param {Number} availablePoints 用户可用的星星数
   * @returns {Promise<Array>} 可兑换的奖励列表
   */
  async getExchangeableRewards(availablePoints) {
    if (availablePoints < 0) {
      logger.warn('RewardRepository', `获取可兑换奖励使用了无效的星星数: ${availablePoints}`);
      return [];
    }
    
    try {
      // 获取可用奖励
      const availableRewards = await this.getAvailableRewards();
      
      // 筛选出可兑换的奖励
      const exchangeableRewards = availableRewards.filter(reward => reward.points <= availablePoints);
      
      logger.info('RewardRepository', `获取用户可兑换奖励成功, 可用星星=${availablePoints}, 可兑换奖励数量=${exchangeableRewards.length}`);
      return exchangeableRewards;
    } catch (error) {
      logger.error('RewardRepository', `获取用户可兑换奖励失败, 可用星星=${availablePoints}`, error);
      return [];
    }
  }
  
  /**
   * 兑换奖励
   * @param {String} rewardId 奖励ID
   * @returns {Promise<Reward|null>} 兑换后的奖励或null
   */
  async claimReward(rewardId) {
    if (!rewardId) {
      logger.warn('RewardRepository', '尝试使用无效的奖励ID兑换奖励');
      return null;
    }
    
    try {
      // 获取奖励
      const reward = await this.getById(rewardId);
      
      if (!reward) {
        logger.warn('RewardRepository', `兑换奖励失败, 未找到ID为${rewardId}的奖励`);
        return null;
      }
      
      // 检查奖励是否可兑换
      if (!reward.isAvailable()) {
        if (reward.claimed) {
          logger.warn('RewardRepository', `兑换奖励失败, 奖励已被兑换, ID=${rewardId}`);
        } else {
          logger.warn('RewardRepository', `兑换奖励失败, 奖励不可用, ID=${rewardId}`);
        }
        return null;
      }
      
      // 兑换奖励
      reward.claim();
      
      // 保存回存储
      const updatedReward = await this.save(reward);
      
      logger.info('RewardRepository', `兑换奖励成功, ID=${updatedReward.id}, 名称=${updatedReward.name}`);
      return updatedReward;
    } catch (error) {
      logger.error('RewardRepository', `兑换奖励失败, ID=${rewardId}`, error);
      return null;
    }
  }
  
  /**
   * 标记奖励为已领取
   * @param {String} rewardId 奖励ID
   * @returns {Promise<Reward|null>} 更新后的奖励或null
   */
  async deliverReward(rewardId) {
    if (!rewardId) {
      logger.warn('RewardRepository', '尝试使用无效的奖励ID标记奖励为已领取');
      return null;
    }
    
    try {
      // 获取奖励
      const reward = await this.getById(rewardId);
      
      if (!reward) {
        logger.warn('RewardRepository', `标记奖励为已领取失败, 未找到ID为${rewardId}的奖励`);
        return null;
      }
      
      // 检查奖励是否已兑换
      if (!reward.claimed) {
        logger.warn('RewardRepository', `标记奖励为已领取失败, 奖励尚未兑换, ID=${rewardId}`);
        return null;
      }
      
      // 检查奖励是否已经是已领取状态
      if (reward.isDelivered()) {
        logger.warn('RewardRepository', `标记奖励为已领取失败, 奖励已经是已领取状态, ID=${rewardId}`);
        return reward;
      }
      
      // 标记为已领取
      reward.deliver();
      
      // 保存回存储
      const updatedReward = await this.save(reward);
      
      logger.info('RewardRepository', `标记奖励为已领取成功, ID=${updatedReward.id}, 名称=${updatedReward.name}`);
      return updatedReward;
    } catch (error) {
      logger.error('RewardRepository', `标记奖励为已领取失败, ID=${rewardId}`, error);
      return null;
    }
  }
  
  /**
   * 取消奖励兑换
   * @param {String} rewardId 奖励ID
   * @returns {Promise<Reward|null>} 更新后的奖励或null
   */
  async unclaimReward(rewardId) {
    if (!rewardId) {
      logger.warn('RewardRepository', '尝试使用无效的奖励ID取消奖励兑换');
      return null;
    }
    
    try {
      // 获取奖励
      const reward = await this.getById(rewardId);
      
      if (!reward) {
        logger.warn('RewardRepository', `取消奖励兑换失败, 未找到ID为${rewardId}的奖励`);
        return null;
      }
      
      // 取消兑换
      reward.unclaim();
      
      // 保存回存储
      const updatedReward = await this.save(reward);
      
      logger.info('RewardRepository', `取消奖励兑换${reward.claimed ? '失败' : '成功'}, ID=${updatedReward.id}, 名称=${updatedReward.name}`);
      return updatedReward;
    } catch (error) {
      logger.error('RewardRepository', `取消奖励兑换失败, ID=${rewardId}`, error);
      return null;
    }
  }
  
  /**
   * 启用或禁用奖励
   * @param {String} rewardId 奖励ID
   * @param {Boolean} enable 是否启用
   * @returns {Promise<Reward|null>} 更新后的奖励或null
   */
  async setRewardEnabled(rewardId, enable) {
    if (!rewardId) {
      logger.warn('RewardRepository', '尝试使用无效的奖励ID启用/禁用奖励');
      return null;
    }
    
    try {
      // 获取奖励
      const reward = await this.getById(rewardId);
      
      if (!reward) {
        logger.warn('RewardRepository', `启用/禁用奖励失败, 未找到ID为${rewardId}的奖励`);
        return null;
      }
      
      // 启用或禁用
      if (enable) {
        reward.enable();
      } else {
        reward.disable();
      }
      
      // 保存回存储
      const updatedReward = await this.save(reward);
      
      logger.info('RewardRepository', `${enable ? '启用' : '禁用'}奖励${updatedReward.enabled === enable ? '成功' : '失败'}, ID=${updatedReward.id}, 名称=${updatedReward.name}`);
      return updatedReward;
    } catch (error) {
      logger.error('RewardRepository', `${enable ? '启用' : '禁用'}奖励失败, ID=${rewardId}`, error);
      return null;
    }
  }
  
  /**
   * 获取默认奖励
   * @returns {Promise<Array>} 默认奖励列表
   */
  async getDefaultRewards() {
    const now = Date.now();
    const defaultRewards = [
      new Reward({
        id: `reward_${now}_1`,
        name: '看动画片30分钟',
        points: 10,
        icon: '🎬',
        enabled: true,
        claimed: false,
        isExample: true,
        createTime: now
      }),
      new Reward({
        id: `reward_${now}_2`,
        name: '额外的零食',
        points: 20,
        icon: '🍪',
        enabled: true,
        claimed: false,
        isExample: true,
        createTime: now + 1
      }),
      new Reward({
        id: `reward_${now}_3`,
        name: '玩游戏1小时',
        points: 30,
        icon: '🎮',
        enabled: true,
        claimed: false,
        isExample: true,
        createTime: now + 2
      })
    ];
    
    logger.info('RewardRepository', `获取默认奖励, 数量=${defaultRewards.length}`);
    return defaultRewards;
  }
  
  /**
   * 初始化默认奖励
   * @returns {Promise<Array>} 保存的默认奖励列表
   */
  async initializeDefaultRewards() {
    try {
      // 检查是否已有奖励数据
      const count = await this.count();
      
      if (count > 0) {
        logger.info('RewardRepository', `已存在奖励数据, 跳过默认奖励初始化`);
        return [];
      }
      
      // 获取默认奖励
      const defaultRewards = await this.getDefaultRewards();
      
      // 保存到存储
      await this.saveAll(defaultRewards);
      
      logger.info('RewardRepository', `初始化默认奖励成功, 数量=${defaultRewards.length}`);
      return defaultRewards;
    } catch (error) {
      logger.error('RewardRepository', '初始化默认奖励失败', error);
      return [];
    }
  }
  
  /**
   * 更新示例奖励状态，确保它们始终是启用状态
   * @returns {Promise<Number>} 更新的奖励数量
   */
  async ensureExampleRewardsEnabled() {
    try {
      // 获取所有示例奖励
      const exampleRewards = await this.query(reward => reward.isExample === true);
      
      // 筛选出禁用的示例奖励
      const disabledExamples = exampleRewards.filter(reward => !reward.enabled);
      
      if (disabledExamples.length === 0) {
        logger.info('RewardRepository', `所有示例奖励均已启用，无需更新`);
        return 0;
      }
      
      // 启用所有禁用的示例奖励
      const updatedRewards = disabledExamples.map(reward => {
        const updatedReward = this._cloneModel(reward);
        updatedReward.enable();
        return updatedReward;
      });
      
      // 保存回存储
      await this.saveAll(updatedRewards);
      
      logger.info('RewardRepository', `更新示例奖励状态成功，启用了${updatedRewards.length}个示例奖励`);
      return updatedRewards.length;
    } catch (error) {
      logger.error('RewardRepository', '更新示例奖励状态失败', error);
      return 0;
    }
  }
  
  /**
   * 克隆模型实例
   * @private
   * @param {Reward} reward 奖励实例
   * @returns {Reward} 克隆后的奖励实例
   */
  _cloneModel(reward) {
    if (!reward) return null;
    return new Reward({ ...reward });
  }
  
  /**
   * 从本地存储加载奖励数据
   * 用于确保存储和仓储中的数据一致
   * @returns {Promise<Array>} 加载的奖励列表
   */
  async loadFromStorage() {
    try {
      logger.info('RewardRepository', '从本地存储加载奖励数据');
      const storedRewards = wx.getStorageSync('rewards') || [];
      
      // 将存储数据转换为领域模型对象
      const rewardsModels = storedRewards.map(data => {
        const { Reward } = require('../models/index');
        return new Reward(data);
      });
      
      // 检查是否需要过滤示例奖励
      const hasCustomRewards = rewardsModels.some(r => !r.isExample && r.enabled);
      
      // 如果有自定义奖励，则过滤掉示例奖励，避免重复显示
      const filteredRewards = hasCustomRewards 
        ? rewardsModels.filter(r => !r.isExample) 
        : rewardsModels;
      
      // 添加新加载的数据（使用正确的saveAll方法）
      await this.saveAll(filteredRewards);
      
      if (hasCustomRewards) {
        logger.info('RewardRepository', `从本地存储加载了${filteredRewards.length}个奖励，已过滤示例奖励`);
      } else {
        logger.info('RewardRepository', `从本地存储加载了${filteredRewards.length}个奖励`);
      }
      
      return filteredRewards;
    } catch (error) {
      logger.error('RewardRepository', '从本地存储加载奖励数据失败', error);
      throw error;
    }
  }
}

module.exports = RewardRepository; 