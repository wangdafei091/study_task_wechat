/**
 * reward-service.js - 奖励服务
 * 
 * 提供奖励相关的业务逻辑
 */

const logger = require('../utils/logger');
const { RewardRepository } = require('../repositories/index');
const { StarGroupRepository, StarRecordRepository } = require('../repositories/index');
const EventBus = require('../utils/core/event-bus');
const { EVENTS } = require('../utils/constants');

// 移除静态初始化锁
// let _initializationLock = false;

class RewardService {
  // 使用静态属性存储类级别的初始化状态
  static _initialized = false;
  // 添加初始化Promise锁，防止并发初始化
  static _initializationPromise = null;
  
  /**
   * 构造函数
   * @param {Object} options 选项
   * @param {RewardRepository} options.rewardRepository 奖励仓储
   * @param {StarGroupRepository} options.starGroupRepository 星星分组仓储
   * @param {StarRecordRepository} options.starRecordRepository 星星记录仓储
   * @param {EventBus} options.eventBus 事件总线
   */
  constructor(options = {}) {
    // 初始化仓储
    this.rewardRepository = options.rewardRepository || new RewardRepository();
    this.starGroupRepository = options.starGroupRepository || new StarGroupRepository();
    this.starRecordRepository = options.starRecordRepository || new StarRecordRepository();
    
    // 事件总线
    this.eventBus = options.eventBus || new EventBus();
    
    // 实例级初始化标记
    this.initialized = false;
    
    logger.info('RewardService', '构造奖励服务实例');
  }
  
  /**
   * 初始化服务
   * @returns {Promise<void>}
   */
  async initialize() {
    // 如果类已初始化，避免重复
    if (RewardService._initialized) {
      logger.info('RewardService', '奖励服务已初始化，跳过');
      this.initialized = true;
      return;
    }
    
    // 如果正在初始化中，等待初始化完成
    if (RewardService._initializationPromise) {
      logger.info('RewardService', '奖励服务正在初始化中，等待完成');
      await RewardService._initializationPromise;
      this.initialized = true;
      return;
    }
    
    // 开始初始化过程，创建并保存Promise
    logger.info('RewardService', '开始初始化奖励服务');
    
    // 使用Promise锁防止并发初始化
    RewardService._initializationPromise = (async () => {
      try {
        // 尝试从本地存储加载奖励数据以确保新旧系统数据一致性
        try {
          await this.rewardRepository.loadFromStorage();
          logger.info('RewardService', '从本地存储加载奖励数据成功');
        } catch (error) {
          logger.warn('RewardService', '从本地存储加载奖励数据失败', error);
          // 继续执行，不影响主流程
        }
        
        // 检查是否存在奖励数据，如果不存在则初始化默认奖励
        const rewardsCount = await this.rewardRepository.count();
        
        // 检查是否存在自定义奖励标记
        let hasCustomRewards = false;
        try {
          hasCustomRewards = wx.getStorageSync('has_custom_rewards') === true;
        } catch (e) {
          logger.warn('RewardService', '获取自定义奖励标记失败', e);
        }
        
        if (rewardsCount === 0 && !hasCustomRewards) {
          logger.info('RewardService', '未检测到奖励数据且无自定义奖励标记，开始初始化默认奖励');
          const defaultRewards = await this.rewardRepository.initializeDefaultRewards();
          logger.info('RewardService', `初始化了${defaultRewards.length}个默认奖励`);
        } else if (rewardsCount === 0 && hasCustomRewards) {
          logger.info('RewardService', '检测到自定义奖励标记，跳过默认奖励初始化');
        } else {
          logger.info('RewardService', `检测到${rewardsCount}个奖励数据，跳过默认奖励初始化`);
        }
        
        // 设置初始化完成标志 - 类级别标记
        RewardService._initialized = true;
        logger.info('RewardService', '服务初始化完成');
      } catch (error) {
        logger.error('RewardService', '初始化服务失败', error);
        RewardService._initialized = false;
        throw error;
      }
    })();
    
    try {
      // 等待初始化完成
      await RewardService._initializationPromise;
      // 设置实例级标记
      this.initialized = true;
    } catch (error) {
      this.initialized = false;
      throw error;
    } finally {
      // 清除初始化Promise，允许后续重新初始化（如果需要）
      RewardService._initializationPromise = null;
    }
  }
  
  /**
   * 获取所有奖励
   * @returns {Promise<Array>} 所有奖励列表
   */
  async getAllRewards() {
    try {
      const rewards = await this.rewardRepository.getAll();
      logger.info('RewardService', `获取所有奖励成功, 数量=${rewards.length}`);
      return rewards;
    } catch (error) {
      logger.error('RewardService', '获取所有奖励失败', error);
      return [];
    }
  }
  
  /**
   * 获取已领取的奖励
   * @returns {Promise<Array>} 已领取的奖励列表
   */
  async getClaimedRewards() {
    try {
      const rewards = await this.rewardRepository.getClaimedRewards();
      logger.info('RewardService', `获取已领取奖励成功, 数量=${rewards.length}`);
      return rewards;
    } catch (error) {
      logger.error('RewardService', '获取已领取奖励失败', error);
      return [];
    }
  }
  
  /**
   * 创建奖励
   * @param {Object} rewardData 奖励数据
   * @returns {Promise<Object>} 创建结果
   */
  async createReward(rewardData) {
    if (!rewardData || !rewardData.name || !rewardData.points) {
      logger.warn('RewardService', '创建奖励失败: 缺少必要数据', rewardData);
      return { success: false, message: '奖励数据不完整' };
    }
    
    try {
      // 创建Reward实例
      const { Reward } = require('../models/index');
      const reward = new Reward(rewardData);
      
      // 保存奖励
      const savedReward = await this.rewardRepository.save(reward);
      
      logger.info('RewardService', `创建奖励成功: ${savedReward.name}, ID=${savedReward.id}`);
      
      // 触发奖励创建事件
      this.eventBus.emit(EVENTS.REWARD_CREATED, { reward: savedReward });
      
      return { success: true, reward: savedReward, message: '创建成功' };
    } catch (error) {
      logger.error('RewardService', '创建奖励失败', error);
      return { success: false, message: '创建过程中发生错误' };
    }
  }
  
  /**
   * 更新奖励
   * @param {String} rewardId 奖励ID
   * @param {Object} rewardData 奖励数据
   * @returns {Promise<Object>} 更新结果
   */
  async updateReward(rewardId, rewardData) {
    if (!rewardId || !rewardData) {
      logger.warn('RewardService', '更新奖励失败: 缺少必要数据', { rewardId, rewardData });
      return { success: false, message: '参数不完整' };
    }
    
    try {
      // 获取奖励
      const existingReward = await this.rewardRepository.getById(rewardId);
      
      if (!existingReward) {
        logger.warn('RewardService', `更新奖励失败: 未找到ID为${rewardId}的奖励`);
        return { success: false, message: '未找到指定的奖励' };
      }
      
      // 更新奖励
      const updatedReward = await this.rewardRepository.update(rewardId, rewardData);
      
      logger.info('RewardService', `更新奖励成功: ${updatedReward.name}, ID=${updatedReward.id}`);
      
      // 触发奖励更新事件
      this.eventBus.emit(EVENTS.REWARD_UPDATED, { 
        reward: updatedReward,
        previous: existingReward
      });
      
      return { success: true, reward: updatedReward, message: '更新成功' };
    } catch (error) {
      logger.error('RewardService', `更新奖励失败, ID=${rewardId}`, error);
      return { success: false, message: '更新过程中发生错误' };
    }
  }
  
  /**
   * 删除奖励
   * @param {String} rewardId 奖励ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteReward(rewardId) {
    if (!rewardId) {
      logger.warn('RewardService', '删除奖励失败: 缺少奖励ID');
      return { success: false, message: '奖励ID不能为空' };
    }
    
    try {
      // 获取奖励
      const reward = await this.rewardRepository.getById(rewardId);
      
      if (!reward) {
        logger.warn('RewardService', `删除奖励失败: 未找到ID为${rewardId}的奖励`);
        return { success: false, message: '未找到指定的奖励' };
      }
      
      // 如果奖励已被领取，不允许删除
      if (reward.claimed) {
        logger.warn('RewardService', `删除奖励失败: 奖励已被领取，不能删除, ID=${rewardId}`);
        return { success: false, message: '已领取的奖励不能删除' };
      }
      
      // 删除奖励
      const result = await this.rewardRepository.delete(rewardId);
      
      logger.info('RewardService', `删除奖励成功: ${reward.name}, ID=${rewardId}`);
      
      // 触发奖励删除事件
      this.eventBus.emit(EVENTS.REWARD_DELETED, { reward });
      
      return { success: true, message: '删除成功' };
    } catch (error) {
      logger.error('RewardService', `删除奖励失败, ID=${rewardId}`, error);
      return { success: false, message: '删除过程中发生错误' };
    }
  }
  
  /**
   * 切换奖励启用/禁用状态
   * @param {String} rewardId 奖励ID
   * @param {Boolean} enabled 是否启用
   * @returns {Promise<Object>} 操作结果
   */
  async toggleRewardStatus(rewardId, enabled) {
    if (!rewardId) {
      logger.warn('RewardService', '切换奖励状态失败: 缺少奖励ID');
      return { success: false, message: '奖励ID不能为空' };
    }
    
    try {
      // 获取奖励
      const reward = await this.rewardRepository.getById(rewardId);
      
      if (!reward) {
        logger.warn('RewardService', `切换奖励状态失败: 未找到ID为${rewardId}的奖励`);
        return { success: false, message: '未找到指定的奖励' };
      }
      
      // 如果奖励已被领取，不允许修改状态
      if (reward.claimed) {
        logger.warn('RewardService', `切换奖励状态失败: 奖励已被领取，不能修改状态, ID=${rewardId}`);
        return { success: false, message: '已领取的奖励不能修改状态' };
      }
      
      // 如果状态相同，直接返回成功
      if (reward.enabled === enabled) {
        logger.info('RewardService', `奖励状态已经是${enabled ? '启用' : '禁用'}, ID=${rewardId}`);
        return { success: true, reward, message: `奖励已经是${enabled ? '启用' : '禁用'}状态` };
      }
      
      // 更新奖励状态
      const updatedReward = await this.rewardRepository.update(rewardId, { enabled });
      
      logger.info('RewardService', `切换奖励状态成功: ${updatedReward.name}, ID=${rewardId}, 状态=${enabled ? '启用' : '禁用'}`);
      
      // 触发奖励状态变更事件
      this.eventBus.emit(EVENTS.REWARD_STATUS_CHANGED, { 
        reward: updatedReward,
        enabled
      });
      
      return { success: true, reward: updatedReward, message: `奖励已${enabled ? '启用' : '禁用'}` };
    } catch (error) {
      logger.error('RewardService', `切换奖励状态失败, ID=${rewardId}, enabled=${enabled}`, error);
      return { success: false, message: '操作过程中发生错误' };
    }
  }
  
  /**
   * 标记奖励为已领取
   * @param {String} rewardId 奖励ID
   * @returns {Promise<Object>} 操作结果
   */
  async markRewardAsDelivered(rewardId) {
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
      
      // 如果奖励未被领取，不能标记为已领取
      if (!reward.claimed) {
        logger.warn('RewardService', `标记奖励为已领取失败: 奖励尚未被兑换, ID=${rewardId}`);
        return { success: false, message: '奖励尚未被兑换' };
      }
      
      // 如果奖励已经是已领取状态，直接返回成功
      if (reward.claimStatus === 'delivered') {
        logger.info('RewardService', `奖励已经是已领取状态, ID=${rewardId}`);
        return { success: true, reward, message: '奖励已经是已领取状态' };
      }
      
      // 更新奖励状态
      const updatedReward = await this.rewardRepository.update(rewardId, { claimStatus: 'delivered' });
      
      logger.info('RewardService', `标记奖励为已领取成功: ${updatedReward.name}, ID=${rewardId}`);
      
      // 触发奖励领取状态变更事件
      this.eventBus.emit(EVENTS.REWARD_DELIVERED, { reward: updatedReward });
      
      return { success: true, reward: updatedReward, message: '奖励已标记为已领取' };
    } catch (error) {
      logger.error('RewardService', `标记奖励为已领取失败, ID=${rewardId}`, error);
      return { success: false, message: '操作过程中发生错误' };
    }
  }
  
  /**
   * 获取可用奖励列表
   * @param {Boolean} includeClaimed 是否包含已领取的奖励
   * @param {Boolean} includeExamples 是否包含示例奖励，默认为false
   * @returns {Promise<Array>} 可用奖励列表
   */
  async getAvailableRewards(includeClaimed = false, includeExamples = false) {
    try {
      // 确保服务已初始化
      if (!this.initialized && !RewardService._initialized) {
        logger.info('RewardService', '奖励服务尚未初始化，先执行初始化');
        await this.initialize();
      }
      
      let rewards;
      if (includeClaimed) {
        // 获取所有奖励，可能包括已领取的和示例奖励
        rewards = await this.rewardRepository.getAll();
        
        // 如果不需要示例奖励且存在自定义奖励，过滤掉示例奖励
        if (!includeExamples) {
          const hasCustomRewards = rewards.some(r => !r.isExample && r.enabled);
          if (hasCustomRewards) {
            rewards = rewards.filter(r => !r.isExample);
          }
        }
        
        logger.info('RewardService', `获取所有奖励成功(包含已领取${includeExamples ? '和示例' : ''}), 数量=${rewards.length}`);
      } else {
        // 使用增强的仓储方法，直接处理示例奖励的过滤
        rewards = await this.rewardRepository.getAvailableRewards(includeExamples);
        logger.info('RewardService', `获取可用奖励成功(仅未领取${includeExamples ? '，包含示例' : ''}), 数量=${rewards.length}`);
      }
      
      return rewards;
    } catch (error) {
      logger.error('RewardService', '获取可用奖励失败', error);
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
   * 兑换奖励
   * @param {String} rewardId 奖励ID
   * @returns {Promise<Object>} 兑换结果
   */
  async exchangeReward(rewardId) {
    logger.info('RewardService', `===== 开始兑换奖励流程 =====`);
    logger.info('RewardService', `兑换奖励ID: ${rewardId}`);
    
    if (!rewardId) {
      logger.warn('RewardService', '兑换奖励失败: 缺少奖励ID');
      return { success: false, message: '奖励ID不能为空' };
    }
    
    try {
      // 获取奖励
      logger.info('RewardService', `步骤1: 获取奖励信息, ID=${rewardId}`);
      const reward = await this.rewardRepository.getById(rewardId);
      
      if (!reward) {
        logger.warn('RewardService', `兑换奖励失败: 未找到ID为${rewardId}的奖励`);
        return { success: false, message: '未找到指定的奖励' };
      }
      
      logger.info('RewardService', `奖励信息: 名称=${reward.name}, 积分=${reward.points}, 状态=${reward.enabled ? '启用' : '禁用'}, 已领取=${reward.claimed}`);
      
      // 检查奖励是否可兑换
      if (!reward.enabled) {
        logger.warn('RewardService', `兑换奖励失败: 奖励已禁用, ID=${rewardId}`);
        return { success: false, message: '该奖励已禁用' };
      }
      
      if (reward.claimed) {
        logger.warn('RewardService', `兑换奖励失败: 奖励已被兑换, ID=${rewardId}`);
        return { success: false, message: '该奖励已被兑换' };
      }
      
      // 获取用户当前星星总数
      logger.info('RewardService', `步骤2: 检查用户星星数量`);
      const userStars = await this.starGroupRepository.getTotalPoints();
      logger.info('RewardService', `兑换奖励前用户星星数: ${userStars}`);
      
      // 检查用户是否有足够的星星
      if (userStars < reward.points) {
        logger.warn('RewardService', `兑换奖励失败: 星星不足, 需要${reward.points}颗, 当前${userStars}颗`);
        return { success: false, message: '星星不足' };
      }
      
      // 开始事务，确保数据一致性
      let deductResult = null;
      let consumptionRecord = null;
      
      try {
        logger.info('RewardService', `===== 开始兑换奖励事务 =====`);
        logger.info('RewardService', `事务参数: 奖励=${reward.name}, 消耗星星=${reward.points}颗`);
        
        // 1. 扣除用户星星
        logger.info('RewardService', `步骤3: 开始扣除星星, 数量=${reward.points}`);
        deductResult = await this.starGroupRepository.deductStars(reward.points);
        
        logger.info('RewardService', `扣除星星操作完成, 结果=`, deductResult);
        
        if (!deductResult.success) {
          logger.error('RewardService', `扣除星星失败: ${deductResult.message}`);
          return { success: false, message: '扣除星星失败' };
        }
        
        logger.info('RewardService', `步骤3完成: 星星扣除成功，扣除${reward.points}颗`);
        
        // 2. 创建星星消费记录
        try {
          const recordData = {
            amount: reward.points,
            type: 'exchange', // 消费类型：兑换奖励
            source: `reward_${rewardId}`,
            timestamp: Date.now(),
            data: {
              rewardId: reward.id,
              rewardName: reward.name
            }
          };
          
          consumptionRecord = await this.starRecordRepository.createStarConsumptionRecord(recordData);
          logger.info('RewardService', `星星消费记录创建成功: ${consumptionRecord.id}`);
        } catch (recordError) {
          logger.error('RewardService', '创建星星消费记录失败', recordError);
          
          // 回滚星星扣除操作
          try {
            logger.warn('RewardService', '开始回滚星星扣除操作');
            const permanentGroup = await this.starGroupRepository.getOrCreateGroup(
              'permanent', 
              null, 
              '永久有效'
            );
            
            if (permanentGroup) {
              await this.starGroupRepository.addStarsToGroup(
                permanentGroup,
                reward.points,
                `兑换奖励失败回滚: ${reward.name}`
              );
              logger.info('RewardService', `星星回滚成功，退还${reward.points}颗星星`);
            }
          } catch (rollbackError) {
            logger.error('RewardService', '星星回滚失败', rollbackError);
          }
          
          return { success: false, message: '创建消费记录失败，已回滚星星扣除' };
        }
        
        // 3. 更新奖励状态为已领取
        try {
          reward.claim(); // 使用Reward模型的标准方法，确保状态一致性
          logger.info('RewardService', `奖励状态设置: claimed=${reward.claimed}, claimStatus=${reward.claimStatus}, claimTime=${reward.claimTime}`);
          const savedReward = await this.rewardRepository.save(reward);
          
          if (!savedReward) {
            throw new Error('保存奖励状态失败');
          }
          
          logger.info('RewardService', `奖励状态更新成功: ${reward.name}`);
        } catch (saveError) {
          logger.error('RewardService', '更新奖励状态失败', saveError);
          
          // 回滚星星扣除操作
          try {
            logger.warn('RewardService', '开始回滚星星扣除操作');
            const permanentGroup = await this.starGroupRepository.getOrCreateGroup(
              'permanent', 
              null, 
              '永久有效'
            );
            
            if (permanentGroup) {
              await this.starGroupRepository.addStarsToGroup(
                permanentGroup,
                reward.points,
                `兑换奖励失败回滚: ${reward.name}`
              );
              logger.info('RewardService', `星星回滚成功，退还${reward.points}颗星星`);
            }
          } catch (rollbackError) {
            logger.error('RewardService', '星星回滚失败', rollbackError);
          }
          
          return { success: false, message: '更新奖励状态失败，已回滚星星扣除' };
        }
        
        // 4. 发出奖励领取事件
        try {
          this.eventBus.emit(EVENTS.REWARD_CLAIMED, { 
            rewardId: reward.id,
            rewardName: reward.name,
            points: reward.points,
            timestamp: Date.now()
          });
          logger.info('RewardService', `奖励领取事件发送成功`);
        } catch (eventError) {
          logger.warn('RewardService', '发送奖励领取事件失败', eventError);
          // 事件发送失败不影响主流程
        }
        
        logger.info('RewardService', `兑换奖励成功: ${reward.name}, 消耗${reward.points}颗星星`);
        
        // 5. 验证操作后的数据一致性
        try {
          const starService = this.serviceManager.getStarService();
          if (starService && starService.verifyOperationConsistency) {
            const isConsistent = await starService.verifyOperationConsistency('兑换奖励', {
              rewardId: reward.id,
              rewardName: reward.name,
              consumedPoints: reward.points
            });
            
            if (!isConsistent) {
              logger.error('RewardService', `兑换奖励后数据不一致！奖励: ${reward.name}, 消耗星星: ${reward.points}`);
            }
          }
        } catch (consistencyError) {
          logger.warn('RewardService', '数据一致性检查失败', consistencyError);
        }
        
        return { 
          success: true, 
          reward, 
          message: '兑换成功' 
        };
      } catch (error) {
        logger.error('RewardService', '兑换奖励事务处理失败', error);
        
        // 如果星星已经扣除，尝试回滚
        if (deductResult && deductResult.success) {
          try {
            logger.warn('RewardService', '开始回滚星星扣除操作');
            const permanentGroup = await this.starGroupRepository.getOrCreateGroup(
              'permanent', 
              null, 
              '永久有效'
            );
            
            if (permanentGroup) {
              await this.starGroupRepository.addStarsToGroup(
                permanentGroup,
                reward.points,
                `兑换奖励失败回滚: ${reward.name}`
              );
              logger.info('RewardService', `星星回滚成功，退还${reward.points}颗星星`);
            }
          } catch (rollbackError) {
            logger.error('RewardService', '星星回滚失败', rollbackError);
          }
        }
        
        return { success: false, message: '兑换过程中发生错误，请重试' };
      }
    } catch (error) {
      logger.error('RewardService', '兑换奖励失败', error);
      return { success: false, message: '兑换过程中发生错误' };
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
      this.eventBus.emit(EVENTS.REWARD_EXCHANGE_CANCELLED, { 
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
   * 计算下一个可用的奖励
   * @param {Number|null} knownStarCount 已知的星星数量，如果提供则不重新查询
   * @returns {Promise<Object>} 下一个可用奖励，或默认奖励
   */
  async calculateNextAvailableReward(knownStarCount = null) {
    try {
      // 确保服务已初始化，使用新的初始化机制
      if (!this.initialized && !RewardService._initialized) {
        logger.info('RewardService', '奖励服务尚未初始化，先执行初始化');
        await this.initialize();
      }
      
      // 获取用户可用的星星数量
      const availablePoints = knownStarCount !== null ? 
        knownStarCount : 
        await this.starGroupRepository.getTotalPoints();
      
      logger.info('RewardService', `使用星星数量: ${availablePoints}${knownStarCount !== null ? '(传入参数)' : '(查询获取)'}`);
      
      // 获取所有可用奖励
      let availableRewards = await this.getAvailableRewards(false, false);
      
      // 如果没有可用奖励，检查是否存在已兑换奖励
      if (availableRewards.length === 0) {
        logger.info('RewardService', '没有可用奖励，检查是否存在已兑换奖励');
        
        // 获取所有奖励（包括已兑换的）
        const allRewards = await this.getAvailableRewards(true);
        
        if (allRewards.length > 0) {
          // 存在奖励但都已兑换，返回allClaimed状态
          logger.info('RewardService', '存在已兑换奖励，返回allClaimed状态');
          const highestPointReward = [...allRewards].sort((a, b) => b.points - a.points)[0];
          return {
            ...highestPointReward,
            remainingStars: 0,
            allClaimed: true
          };
        } else {
          // 真的没有任何奖励，返回默认占位奖励
          logger.info('RewardService', '没有任何奖励，返回默认占位奖励');
          const defaultPlaceholder = {
            name: '添加新奖励',
            points: 10,
            icon: '🎁',
            isDefault: true,
            remainingStars: Math.max(0, 10 - availablePoints)
          };
          
          logger.info('RewardService', `返回默认占位奖励，还需${defaultPlaceholder.remainingStars}颗星星`);
          return defaultPlaceholder;
        }
      }
      
      // 过滤未解锁的奖励并按点数排序
      const unlockedRewards = availableRewards.filter(reward => 
        reward.points > availablePoints
      ).sort((a, b) => a.points - b.points);
      
      // 如果没有未解锁的奖励，找点数最高的已解锁奖励
      if (unlockedRewards.length === 0) {
        const highestPointReward = [...availableRewards].sort((a, b) => b.points - a.points)[0];
        // 这种情况下已解锁，remainingStars设为0
        highestPointReward.remainingStars = 0;
        // 表示所有奖励已解锁
        highestPointReward.allClaimed = true;
        logger.info('RewardService', `计算下一个可用奖励：没有未解锁奖励，返回点数最高的奖励 ${highestPointReward.name}(${highestPointReward.points}点), 已解锁`);
        return highestPointReward;
      }
      
      // 返回点数最低的未解锁奖励
      const nextReward = unlockedRewards[0];
      // 计算并添加remainingStars属性
      nextReward.remainingStars = Math.max(0, nextReward.points - availablePoints);
      logger.info('RewardService', `计算下一个可用奖励：${nextReward.name}(${nextReward.points}点), 还需${nextReward.remainingStars}颗星星`);
      return nextReward;
    } catch (error) {
      logger.error('RewardService', '计算下一个可用奖励失败', error);
      // 返回一个默认奖励
      const userPoints = knownStarCount !== null ? knownStarCount : 0;
      return {
        name: '添加新奖励',
        points: 10,
        icon: '🎁',
        isDefault: true,
        remainingStars: Math.max(0, 10 - userPoints)
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
        this.eventBus.emit(EVENTS.REWARD_DUPLICATED, { 
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

  /**
   * 批量删除奖励
   * @param {Array<String>} rewardIds 奖励ID数组
   * @returns {Promise<Object>} 删除结果
   */
  async deleteRewards(rewardIds) {
    if (!Array.isArray(rewardIds) || rewardIds.length === 0) {
      logger.warn('RewardService', '批量删除奖励失败: 无效的ID数组');
      return { success: false, message: '无效的ID数组' };
    }
    
    try {
      // 批量删除奖励
      const deletedCount = await this.rewardRepository.deleteMany(rewardIds);
      
      // 清除缓存
      this.clearCache();
      
      logger.info('RewardService', `批量删除奖励成功: 删除了${deletedCount}个奖励`);
      
      // 触发奖励批量删除事件
      this.eventBus.emit(EVENTS.REWARD_DELETED_BATCH, { rewardIds });
      
      return { success: true, count: deletedCount };
    } catch (error) {
      logger.error('RewardService', '批量删除奖励失败', error);
      return { success: false, message: '批量删除过程中发生错误' };
    }
  }

  /**
   * 清除缓存
   */
  clearCache() {
    logger.info('RewardService', '强制清除奖励服务缓存');
    
    // 清除仓储缓存
    if (this.rewardRepository && typeof this.rewardRepository.invalidateCache === 'function') {
      this.rewardRepository.invalidateCache();
    }
  }

  /**
   * 同步检查是否只有示例奖励可用
   * @returns {Boolean} 是否只有示例奖励可用
   */
  hasOnlyExampleRewardsSync() {
    try {
      logger.debug('RewardService', '同步检查是否只有示例奖励可用');
      
      // 使用仓储层获取奖励数据，避免直接访问存储
      const rewards = this.rewardRepository.getAllSync();
      
      // 过滤出启用的奖励
      const enabledRewards = rewards.filter(r => r.enabled !== false);
      
      // 如果没有奖励，返回true（只有示例奖励）
      if (enabledRewards.length === 0) {
        logger.debug('RewardService', '没有任何奖励，返回true');
        return true;
      }
      
      // 检查是否所有启用的奖励都是示例奖励
      const hasCustomReward = enabledRewards.some(reward => !this._isExampleReward(reward));
      
      logger.debug('RewardService', `是否只有示例奖励: ${!hasCustomReward}, 启用奖励数: ${enabledRewards.length}`);
      return !hasCustomReward;
    } catch (error) {
      logger.error('RewardService', '检查示例奖励失败', error);
      return true; // 出错时保守处理，假设只有示例奖励
    }
  }
  
  /**
   * 判断奖励是否示例奖励
   * @private
   * @param {Object} reward 奖励对象
   * @returns {Boolean} 是否示例奖励
   */
  _isExampleReward(reward) {
    if (!reward) return false;
    
    // 直接检查isExample属性
    if (reward.isExample === true) return true;
    
    // 兼容旧的判断逻辑：示例奖励ID格式判断
    if (reward.id && typeof reward.id === 'string') {
      return reward.id.startsWith('reward_example_') || 
             reward.id.includes('_example_') || 
             /reward_\d+_\d+/.test(reward.id);
    }
    
    return false;
  }

  /**
   * 获取最后一次兑换时间
   * @returns {Promise<Number|null>} 最后一次兑换的时间戳，如果没有兑换过则返回null
   */
  async getLastExchangeTime() {
    try {
      // 获取所有已兑换的奖励
      const claimedRewards = await this.rewardRepository.getClaimedRewards();
      
      if (!claimedRewards || claimedRewards.length === 0) {
        logger.info('RewardService', '没有找到任何兑换记录');
        return null;
      }
      
      // 找到最晚的兑换时间
      const lastExchangeTime = Math.max(...claimedRewards.map(reward => reward.claimTime || 0));
      
      logger.info('RewardService', `获取最后兑换时间成功: ${lastExchangeTime}, 共有${claimedRewards.length}条兑换记录`);
      
      return lastExchangeTime > 0 ? lastExchangeTime : null;
    } catch (error) {
      logger.error('RewardService', '获取最后兑换时间失败', error);
      return null;
    }
  }
}

module.exports = RewardService; 