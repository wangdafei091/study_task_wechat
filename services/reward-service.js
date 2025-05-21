/**
 * reward-service.js - 奖励服务
 * 
 * 提供奖励相关的业务逻辑
 */

const logger = require('../utils/logger');
const { RewardRepository } = require('../repositories');
const { StarGroupRepository } = require('../repositories');
const { StarRecordRepository } = require('../repositories');
const EventBus = require('../utils/core/event-bus');

class RewardService {
  /**
   * 构造函数
   * @param {Object} options 选项
   * @param {RewardRepository} options.rewardRepository 奖励仓储
   * @param {StarGroupRepository} options.starGroupRepository 星星分组仓储
   * @param {StarRecordRepository} options.starRecordRepository 星星记录仓储
   */
  constructor(options = {}) {
    // 初始化仓储
    this.rewardRepository = options.rewardRepository || new RewardRepository();
    this.starGroupRepository = options.starGroupRepository || new StarGroupRepository();
    this.starRecordRepository = options.starRecordRepository || new StarRecordRepository();
    
    // 事件总线
    this.eventBus = options.eventBus || new EventBus();
    
    logger.info('RewardService', '初始化奖励服务');
  }
  
  /**
   * 初始化服务
   * @returns {Promise<Boolean>} 初始化结果
   */
  async initialize() {
    try {
      // 初始化默认奖励
      const defaultRewards = await this.rewardRepository.initializeDefaultRewards();
      
      if (defaultRewards.length > 0) {
        logger.info('RewardService', `初始化默认奖励成功, 数量=${defaultRewards.length}`);
      }
      
      // 确保示例奖励启用
      await this.rewardRepository.ensureExampleRewardsEnabled();
      
      logger.info('RewardService', '奖励服务初始化完成');
      return true;
    } catch (error) {
      logger.error('RewardService', '初始化奖励服务失败', error);
      return false;
    }
  }
  
  /**
   * 获取全部奖励列表
   * @returns {Promise<Array>} 奖励列表
   */
  async getAllRewards() {
    try {
      const rewards = await this.rewardRepository.getAll();
      logger.info('RewardService', `获取全部奖励列表成功, 数量=${rewards.length}`);
      return rewards;
    } catch (error) {
      logger.error('RewardService', '获取全部奖励列表失败', error);
      return [];
    }
  }
  
  /**
   * 获取可用奖励列表
   * @returns {Promise<Array>} 可用奖励列表
   */
  async getAvailableRewards() {
    try {
      const rewards = await this.rewardRepository.getAvailableRewards();
      logger.info('RewardService', `获取可用奖励列表成功, 数量=${rewards.length}`);
      return rewards;
    } catch (error) {
      logger.error('RewardService', '获取可用奖励列表失败', error);
      return [];
    }
  }
  
  /**
   * 获取用户可兑换的奖励列表
   * @returns {Promise<Array>} 用户可兑换的奖励列表
   */
  async getExchangeableRewards() {
    try {
      // 获取用户可用的星星数量
      const availablePoints = await this.starGroupRepository.getTotalPoints();
      
      // 获取可兑换的奖励
      const rewards = await this.rewardRepository.getExchangeableRewards(availablePoints);
      
      logger.info('RewardService', `获取用户可兑换奖励列表成功, 可用星星=${availablePoints}, 可兑换奖励数量=${rewards.length}`);
      return rewards;
    } catch (error) {
      logger.error('RewardService', '获取用户可兑换奖励列表失败', error);
      return [];
    }
  }
  
  /**
   * 创建新奖励
   * @param {Object} rewardData 奖励数据
   * @returns {Promise<Object|null>} 创建的奖励对象或null
   */
  async createReward(rewardData) {
    if (!rewardData || !rewardData.name || !rewardData.points) {
      logger.warn('RewardService', '创建奖励失败: 缺少必要参数');
      return null;
    }
    
    try {
      // 添加默认图标
      if (!rewardData.icon) {
        rewardData.icon = '🎁';
      }
      
      // 保存奖励
      const reward = await this.rewardRepository.save(rewardData);
      
      if (reward) {
        logger.info('RewardService', `创建奖励成功: ${reward.name}, ID=${reward.id}`);
        
        // 触发奖励创建事件
        this.eventBus.emit('reward:created', { reward });
      }
      
      return reward;
    } catch (error) {
      logger.error('RewardService', '创建奖励失败', error);
      return null;
    }
  }
  
  /**
   * 更新奖励
   * @param {String} rewardId 奖励ID
   * @param {Object} updateData 更新数据
   * @returns {Promise<Object|null>} 更新后的奖励对象或null
   */
  async updateReward(rewardId, updateData) {
    if (!rewardId || !updateData) {
      logger.warn('RewardService', '更新奖励失败: 缺少必要参数');
      return null;
    }
    
    try {
      // 获取当前奖励
      const currentReward = await this.rewardRepository.getById(rewardId);
      
      if (!currentReward) {
        logger.warn('RewardService', `更新奖励失败: 未找到ID为${rewardId}的奖励`);
        return null;
      }
      
      // 避免更新不应该更改的字段
      delete updateData.id;
      delete updateData.createTime;
      delete updateData.updateTime;
      
      if (currentReward.claimed) {
        delete updateData.points;
      }
      
      // 示例奖励不允许禁用
      if (currentReward.isExample && updateData.enabled === false) {
        updateData.enabled = true;
      }
      
      // 更新数据
      const updatedData = { ...currentReward, ...updateData, updateTime: Date.now() };
      
      // 保存更新
      const updatedReward = await this.rewardRepository.save(updatedData);
      
      if (updatedReward) {
        logger.info('RewardService', `更新奖励成功: ${updatedReward.name}, ID=${updatedReward.id}`);
        
        // 触发奖励更新事件
        this.eventBus.emit('reward:updated', { 
          reward: updatedReward,
          previousReward: currentReward
        });
      }
      
      return updatedReward;
    } catch (error) {
      logger.error('RewardService', `更新奖励失败, ID=${rewardId}`, error);
      return null;
    }
  }
  
  /**
   * 删除奖励
   * @param {String} rewardId 奖励ID
   * @returns {Promise<Boolean>} 是否删除成功
   */
  async deleteReward(rewardId) {
    if (!rewardId) {
      logger.warn('RewardService', '删除奖励失败: 缺少奖励ID');
      return false;
    }
    
    try {
      // 获取当前奖励
      const currentReward = await this.rewardRepository.getById(rewardId);
      
      if (!currentReward) {
        logger.warn('RewardService', `删除奖励失败: 未找到ID为${rewardId}的奖励`);
        return false;
      }
      
      // 示例奖励不允许删除
      if (currentReward.isExample) {
        logger.warn('RewardService', `删除奖励失败: 不允许删除示例奖励, ID=${rewardId}`);
        return false;
      }
      
      // 已兑换的奖励不允许删除
      if (currentReward.claimed) {
        logger.warn('RewardService', `删除奖励失败: 不允许删除已兑换的奖励, ID=${rewardId}`);
        return false;
      }
      
      // 执行删除
      const deleted = await this.rewardRepository.delete(rewardId);
      
      if (deleted) {
        logger.info('RewardService', `删除奖励成功: ${currentReward.name}, ID=${rewardId}`);
        
        // 触发奖励删除事件
        this.eventBus.emit('reward:deleted', { reward: currentReward });
      }
      
      return deleted;
    } catch (error) {
      logger.error('RewardService', `删除奖励失败, ID=${rewardId}`, error);
      return false;
    }
  }
  
  /**
   * 兑换奖励
   * @param {String} rewardId 奖励ID
   * @returns {Promise<Object>} 兑换结果
   */
  async exchangeReward(rewardId) {
    if (!rewardId) {
      logger.warn('RewardService', '兑换奖励失败: 缺少奖励ID');
      return { success: false, message: '奖励ID不能为空' };
    }
    
    try {
      // 获取奖励
      const reward = await this.rewardRepository.getById(rewardId);
      
      if (!reward) {
        logger.warn('RewardService', `兑换奖励失败: 未找到ID为${rewardId}的奖励`);
        return { success: false, message: '未找到指定的奖励' };
      }
      
      // 检查奖励是否可兑换
      if (!reward.isAvailable()) {
        if (reward.claimed) {
          logger.warn('RewardService', `兑换奖励失败: 奖励已被兑换, ID=${rewardId}`);
          return { success: false, message: '该奖励已被兑换' };
        } else {
          logger.warn('RewardService', `兑换奖励失败: 奖励不可用, ID=${rewardId}`);
          return { success: false, message: '该奖励不可用' };
        }
      }
      
      // 检查星星数量是否足够
      const hasEnough = await this.starGroupRepository.hasEnoughPoints(reward.points);
      
      if (!hasEnough) {
        logger.warn('RewardService', `兑换奖励失败: 星星数量不足, ID=${rewardId}, 需要=${reward.points}`);
        return { success: false, message: '星星数量不足' };
      }
      
      // 先消费星星
      const consumeResult = await this.starGroupRepository.consumeStarsByExpiryOrder(reward.points);
      
      if (!consumeResult.success) {
        logger.error('RewardService', `兑换奖励失败: 消费星星失败, ID=${rewardId}, 需要=${reward.points}, 实际消费=${consumeResult.consumed}`);
        return { success: false, message: '消费星星失败' };
      }
      
      // 创建消费记录
      const record = await this.starRecordRepository.createRewardExchangeRecord(
        rewardId,
        reward.points,
        `兑换奖励: ${reward.name}`
      );
      
      if (!record) {
        logger.error('RewardService', `兑换奖励: 创建记录失败, ID=${rewardId}`);
        // 继续流程，但记录错误
      }
      
      // 标记奖励为已兑换
      const claimedReward = await this.rewardRepository.claimReward(rewardId);
      
      if (!claimedReward) {
        logger.error('RewardService', `兑换奖励: 标记奖励状态失败, ID=${rewardId}`);
        // 这里有一个问题: 星星已经消费，但奖励状态没有更新
        // 在实际应用中应该使用事务或补偿机制处理
        return { success: false, message: '兑换奖励失败，星星已扣除' };
      }
      
      logger.info('RewardService', `兑换奖励成功: ${reward.name}, ID=${rewardId}, 星星数=${reward.points}`);
      
      // 触发奖励兑换事件
      this.eventBus.emit('reward:exchanged', { 
        reward: claimedReward,
        pointsConsumed: reward.points,
        record: record
      });
      
      return { 
        success: true, 
        reward: claimedReward, 
        pointsConsumed: reward.points,
        message: '兑换成功'
      };
    } catch (error) {
      logger.error('RewardService', `兑换奖励失败, ID=${rewardId}`, error);
      return { success: false, message: '兑换过程中发生错误' };
    }
  }
  
  /**
   * 标记奖励为已领取
   * @param {String} rewardId 奖励ID
   * @returns {Promise<Object>} 操作结果
   */
  async deliverReward(rewardId) {
    if (!rewardId) {
      logger.warn('RewardService', '标记奖励为已领取失败: 缺少奖励ID');
      return { success: false, message: '奖励ID不能为空' };
    }
    
    try {
      // 获取奖励
      const reward = await this.rewardRepository.getById(rewardId);
      
      if (!reward) {
        logger.warn('RewardService', `标记奖励为已领取失败: 未找到ID为${rewardId}的奖励`);
        return { success: false, message: '未找到指定的奖励' };
      }
      
      // 检查奖励是否已兑换
      if (!reward.claimed) {
        logger.warn('RewardService', `标记奖励为已领取失败: 奖励未兑换, ID=${rewardId}`);
        return { success: false, message: '该奖励尚未兑换' };
      }
      
      // 检查奖励是否已领取
      if (reward.isDelivered()) {
        logger.info('RewardService', `奖励已经是已领取状态, ID=${rewardId}`);
        return { success: true, reward, message: '奖励已经是已领取状态' };
      }
      
      // 标记为已领取
      const deliveredReward = await this.rewardRepository.deliverReward(rewardId);
      
      if (!deliveredReward) {
        logger.error('RewardService', `标记奖励为已领取失败, ID=${rewardId}`);
        return { success: false, message: '操作失败' };
      }
      
      logger.info('RewardService', `标记奖励为已领取成功: ${reward.name}, ID=${rewardId}`);
      
      // 触发奖励领取事件
      this.eventBus.emit('reward:delivered', { reward: deliveredReward });
      
      return { 
        success: true, 
        reward: deliveredReward,
        message: '标记为已领取'
      };
    } catch (error) {
      logger.error('RewardService', `标记奖励为已领取失败, ID=${rewardId}`, error);
      return { success: false, message: '操作过程中发生错误' };
    }
  }
  
  /**
   * 取消奖励兑换
   * @param {String} rewardId 奖励ID
   * @returns {Promise<Object>} 操作结果
   */
  async cancelRewardExchange(rewardId) {
    if (!rewardId) {
      logger.warn('RewardService', '取消奖励兑换失败: 缺少奖励ID');
      return { success: false, message: '奖励ID不能为空' };
    }
    
    try {
      // 获取奖励
      const reward = await this.rewardRepository.getById(rewardId);
      
      if (!reward) {
        logger.warn('RewardService', `取消奖励兑换失败: 未找到ID为${rewardId}的奖励`);
        return { success: false, message: '未找到指定的奖励' };
      }
      
      // 检查奖励是否已兑换
      if (!reward.claimed) {
        logger.info('RewardService', `奖励尚未兑换, 无需取消, ID=${rewardId}`);
        return { success: true, reward, message: '奖励尚未兑换' };
      }
      
      // 检查奖励是否已领取
      if (reward.isDelivered()) {
        logger.warn('RewardService', `取消奖励兑换失败: 奖励已领取, 不可取消, ID=${rewardId}`);
        return { success: false, message: '已领取的奖励不可取消兑换' };
      }
      
      // 获取相关的兑换记录
      const exchangeRecords = await this.starRecordRepository.getRecordsBySource(
        'reward_exchange', 
        rewardId
      );
      
      if (exchangeRecords.length === 0) {
        logger.warn('RewardService', `取消奖励兑换: 未找到兑换记录, ID=${rewardId}`);
        // 继续流程，但记录警告
      }
      
      // 找到最新的兑换记录
      const latestRecord = exchangeRecords[0];
      const pointsToRefund = latestRecord ? Math.abs(latestRecord.points) : reward.points;
      
      // 获取或创建永久星星分组
      const permanentGroup = await this.starGroupRepository.getOrCreateGroup(
        'permanent', 
        null, 
        '永久有效'
      );
      
      if (!permanentGroup) {
        logger.error('RewardService', `取消奖励兑换失败: 无法创建星星分组, ID=${rewardId}`);
        return { success: false, message: '退款星星失败' };
      }
      
      // 添加星星到永久分组
      const updatedGroup = await this.starGroupRepository.addStarsToGroup(
        permanentGroup,
        pointsToRefund,
        `取消兑换奖励: ${reward.name}`
      );
      
      if (!updatedGroup) {
        logger.error('RewardService', `取消奖励兑换失败: 添加星星到分组失败, ID=${rewardId}`);
        return { success: false, message: '退款星星失败' };
      }
      
      // 创建退款记录
      const refundRecord = await this.starRecordRepository.save({
        type: 'income',
        source: 'reward_exchange_refund',
        sourceId: rewardId,
        points: pointsToRefund,
        description: `取消兑换奖励: ${reward.name}`,
        timestamp: Date.now(),
        balance: latestRecord ? latestRecord.previousBalance : pointsToRefund,
        previousBalance: latestRecord ? latestRecord.balance : 0
      });
      
      if (!refundRecord) {
        logger.error('RewardService', `取消奖励兑换: 创建退款记录失败, ID=${rewardId}`);
        // 继续流程，但记录错误
      }
      
      // 取消奖励兑换
      const unclaimed = await this.rewardRepository.unclaimReward(rewardId);
      
      if (!unclaimed) {
        logger.error('RewardService', `取消奖励兑换: 更新奖励状态失败, ID=${rewardId}`);
        // 这里有一个问题: 星星已经退还，但奖励状态没有更新
        return { success: false, message: '取消兑换失败，星星已退还' };
      }
      
      logger.info('RewardService', `取消奖励兑换成功: ${reward.name}, ID=${rewardId}, 退还星星=${pointsToRefund}`);
      
      // 触发奖励取消兑换事件
      this.eventBus.emit('reward:exchange_cancelled', { 
        reward: unclaimed,
        pointsRefunded: pointsToRefund,
        record: refundRecord
      });
      
      return { 
        success: true, 
        reward: unclaimed,
        pointsRefunded: pointsToRefund,
        message: '取消兑换成功'
      };
    } catch (error) {
      logger.error('RewardService', `取消奖励兑换失败, ID=${rewardId}`, error);
      return { success: false, message: '操作过程中发生错误' };
    }
  }
  
  /**
   * 计算用户下一个可达成的奖励信息
   * 类似于旧架构中的calculateNextReward方法，但专为新架构设计
   * @returns {Promise<Object>} 下一个奖励的信息对象
   */
  async calculateNextAvailableReward() {
    logger.info('RewardService', '计算用户下一个可达成的奖励信息');
    
    try {
      // 获取用户当前可用星星数
      const userPoints = await this.starGroupRepository.getTotalPoints();
      
      // 获取所有可用且未领取的奖励
      const allRewards = await this.rewardRepository.getAvailableRewards();
      logger.info('RewardService', `获取到${allRewards.length}个可用奖励`);
      
      // 过滤出未领取的奖励
      const availableRewards = allRewards.filter(reward => !reward.claimed);
      logger.info('RewardService', `过滤后有${availableRewards.length}个未领取的奖励`);
      
      // 如果没有可用奖励，返回默认值
      if (availableRewards.length === 0) {
        logger.info('RewardService', '没有可用奖励，返回全部完成状态');
        return {
          name: '恭喜！您已领取所有奖励，可以继续积累星星',
          points: '∞',  // 使用无穷符号
          icon: '🎉',
          count: 0,
          remainingStars: 0,
          current: userPoints,
          allClaimed: true
        };
      }
      
      // 为奖励添加解锁状态
      const rewardsWithUnlockState = availableRewards.map(reward => ({
        ...reward,
        unlocked: userPoints >= reward.points
      }));
      
      // 按所需星星数升序排序
      rewardsWithUnlockState.sort((a, b) => a.points - b.points);
      
      // 查找第一个未解锁的奖励
      let nextUnlockedRewards = rewardsWithUnlockState.filter(reward => !reward.unlocked);
      
      // 如果所有奖励都已解锁，使用最高级别的奖励
      if (nextUnlockedRewards.length === 0 && rewardsWithUnlockState.length > 0) {
        nextUnlockedRewards = [rewardsWithUnlockState[rewardsWithUnlockState.length - 1]];
      }
      
      // 构建返回结果
      let result;
      
      if (nextUnlockedRewards.length > 0) {
        const nextPoints = nextUnlockedRewards[0].points;
        const samePointsRewards = nextUnlockedRewards.filter(r => r.points === nextPoints);
        
        result = {
          name: samePointsRewards[0].name,
          points: nextPoints,
          icon: samePointsRewards[0].icon,
          count: samePointsRewards.length,
          remainingStars: Math.max(0, nextPoints - userPoints),
          current: userPoints
        };
        
        logger.info('RewardService', `下一个奖励: ${result.name}, 需要${result.points}颗星星, 还差${result.remainingStars}颗`);
      } else {
        // 默认结果，应该不会走到这里，因为上面已经处理了没有奖励的情况
        result = {
          name: '奖品',
          points: 100,
          icon: '🎁',
          count: 1,
          remainingStars: 100,
          current: userPoints
        };
        
        logger.info('RewardService', `返回默认奖励信息`);
      }
      
      return result;
    } catch (error) {
      logger.error('RewardService', '计算下一个奖励信息失败', error);
      // 返回默认值
      return {
        name: '奖品',
        points: 100,
        icon: '🎁',
        count: 1,
        remainingStars: 100,
        current: 0
      };
    }
  }
  
  /**
   * 复制奖励（创建相同配置的新奖励）
   * 用于重新添加已领取的奖励到奖池
   * @param {String} rewardId 要复制的奖励ID
   * @returns {Promise<Object|null>} 新创建的奖励对象或null
   */
  async duplicateReward(rewardId) {
    if (!rewardId) {
      logger.warn('RewardService', '复制奖励失败: 缺少奖励ID');
      return null;
    }
    
    try {
      // 获取原奖励
      const originalReward = await this.rewardRepository.getById(rewardId);
      
      if (!originalReward) {
        logger.warn('RewardService', `复制奖励失败: 未找到ID为${rewardId}的奖励`);
        return null;
      }
      
      logger.info('RewardService', `准备复制奖励: ${originalReward.name}, ID=${rewardId}`);
      
      // 创建新奖励数据，复制关键属性但重置状态
      const newRewardData = {
        name: originalReward.name,
        description: originalReward.description,
        type: originalReward.type,
        points: originalReward.points,
        icon: originalReward.icon,
        tags: [...(originalReward.tags || [])],
        notes: originalReward.notes,
        enabled: true,
        claimed: false,
        originRewardId: rewardId // 记录源奖励ID
      };
      
      // 保存新奖励
      const newReward = await this.createReward(newRewardData);
      
      if (newReward) {
        logger.info('RewardService', `复制奖励成功: 从"${originalReward.name}"创建了新奖励, 新ID=${newReward.id}`);
        
        // 触发奖励复制事件
        this.eventBus.emit('reward:duplicated', { 
          newReward,
          originalReward
        });
      }
      
      return newReward;
    } catch (error) {
      logger.error('RewardService', `复制奖励失败, ID=${rewardId}`, error);
      return null;
    }
  }
}

module.exports = RewardService; 