/**
 * reward-demo.js - 奖励系统示例
 * 
 * 展示奖励系统的基本用法，包括星星管理和奖励兑换流程
 */

const { StarExpiryType } = require('../models');
const { RewardService, StarService } = require('../services');
const EventBus = require('../utils/core/event-bus');
const logger = require('../utils/logger');

/**
 * 奖励系统示例应用
 */
class RewardDemo {
  constructor() {
    // 创建全局事件总线
    this.eventBus = new EventBus();
    
    // 初始化服务
    this.starService = new StarService({ eventBus: this.eventBus });
    this.rewardService = new RewardService({ eventBus: this.eventBus });
    
    // 注册事件监听器
    this._registerEventListeners();
    
    logger.info('RewardDemo', '奖励系统示例应用初始化完成');
  }
  
  /**
   * 注册事件监听器
   * @private
   */
  _registerEventListeners() {
    // 星星添加事件
    this.eventBus.on('stars:added', (event) => {
      logger.info('RewardDemo', `监听到星星添加事件: ${event.points}颗星星已添加，过期类型=${event.expiryType}`);
    });
    
    // 奖励兑换事件
    this.eventBus.on('reward:exchanged', (event) => {
      logger.info('RewardDemo', `监听到奖励兑换事件: "${event.reward.name}" 已兑换，花费${event.pointsConsumed}颗星星`);
    });
    
    // 星星消费事件
    this.eventBus.on('stars:consumed', (event) => {
      logger.info('RewardDemo', `监听到星星消费事件: ${event.points}颗星星已消费，原因=${event.reason}`);
    });
  }
  
  /**
   * 初始化示例应用
   */
  async initialize() {
    try {
      logger.info('RewardDemo', '初始化示例应用...');
      
      // 初始化奖励服务
      await this.rewardService.initialize();
      
      // 初始化星星服务
      await this.starService.initialize();
      
      logger.info('RewardDemo', '示例应用初始化完成');
      return true;
    } catch (error) {
      logger.error('RewardDemo', '初始化示例应用失败', error);
      return false;
    }
  }
  
  /**
   * 展示奖励系统基本操作
   */
  async runDemo() {
    try {
      logger.info('RewardDemo', '===== 开始奖励系统演示 =====');
      
      // 1. 初始化应用
      const initialized = await this.initialize();
      if (!initialized) {
        logger.error('RewardDemo', '初始化失败，演示终止');
        return;
      }
      
      // 2. 添加不同类型的星星
      logger.info('RewardDemo', '--- 添加不同类型的星星 ---');
      
      await this.starService.addStars(
        10, 
        StarExpiryType.PERMANENT, 
        '完成特殊任务'
      );
      
      await this.starService.addStars(
        20, 
        StarExpiryType.WEEK, 
        '完成习惯任务'
      );
      
      await this.starService.addStars(
        15, 
        StarExpiryType.MONTH, 
        '完成学习任务'
      );
      
      // 3. 显示当前星星分组和总数
      logger.info('RewardDemo', '--- 显示当前星星状态 ---');
      
      const groups = await this.starService.getStarGroups();
      logger.info('RewardDemo', `星星分组数: ${groups.length}`);
      
      groups.forEach(group => {
        logger.info('RewardDemo', `- ${group.expiryType} 类型: ${group.points}颗星星, 过期时间=${group.expiryDateStr || '永不过期'}`);
      });
      
      const totalStars = await this.starService.getTotalStars();
      logger.info('RewardDemo', `当前总星星数: ${totalStars}`);
      
      // 4. 获取所有奖励
      logger.info('RewardDemo', '--- 获取奖励列表 ---');
      
      const allRewards = await this.rewardService.getAllRewards();
      logger.info('RewardDemo', `所有奖励数量: ${allRewards.length}`);
      
      allRewards.forEach(reward => {
        logger.info('RewardDemo', `- ${reward.name}: ${reward.points}颗星星, 状态=${reward.claimed ? '已兑换' : '可兑换'}`);
      });
      
      // 5. 获取可兑换的奖励
      const exchangeableRewards = await this.rewardService.getExchangeableRewards();
      logger.info('RewardDemo', `可兑换奖励数量: ${exchangeableRewards.length}`);
      
      // 6. 兑换奖励
      if (exchangeableRewards.length > 0) {
        logger.info('RewardDemo', '--- 兑换奖励 ---');
        
        const rewardToExchange = exchangeableRewards[0];
        logger.info('RewardDemo', `尝试兑换奖励: "${rewardToExchange.name}" (${rewardToExchange.points}颗星星)`);
        
        const exchangeResult = await this.rewardService.exchangeReward(rewardToExchange.id);
        
        if (exchangeResult.success) {
          logger.info('RewardDemo', `奖励兑换成功: "${rewardToExchange.name}", 消费了${exchangeResult.pointsConsumed}颗星星`);
        } else {
          logger.warn('RewardDemo', `奖励兑换失败: ${exchangeResult.message}`);
        }
      }
      
      // 7. 查看星星记录
      logger.info('RewardDemo', '--- 查看星星记录 ---');
      
      const records = await this.starService.getStarRecords({ limit: 10 });
      logger.info('RewardDemo', `最近${records.length}条记录:`);
      
      records.forEach(record => {
        const sign = record.points >= 0 ? '+' : '';
        logger.info('RewardDemo', `- [${record.type}] ${sign}${record.points}颗星星 - ${record.description}`);
      });
      
      // 8. 显示兑换后的星星总数
      const remainingStars = await this.starService.getTotalStars();
      logger.info('RewardDemo', `兑换后剩余星星数: ${remainingStars}`);
      
      logger.info('RewardDemo', '===== 奖励系统演示结束 =====');
    } catch (error) {
      logger.error('RewardDemo', '演示过程中发生错误', error);
    }
  }
}

// 创建并运行示例
if (require.main === module) {
  const demo = new RewardDemo();
  demo.runDemo();
}

module.exports = RewardDemo; 