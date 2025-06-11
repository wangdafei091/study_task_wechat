/**
 * star-service.js - 星星服务
 * 
 * 提供星星相关的业务逻辑，包括星星的获取、消费和过期处理
 */

const logger = require('../utils/logger');
const { StarGroupRepository, StarRecordRepository } = require('../repositories/index');
const EventBus = require('../utils/core/event-bus');
const { StarExpiryType } = require('../models/star');
const { EVENTS } = require('../utils/constants');

class StarService {
  /**
   * 构造函数
   * @param {Object} options 选项
   * @param {StarGroupRepository} options.starGroupRepository 星星分组仓储
   * @param {StarRecordRepository} options.starRecordRepository 星星记录仓储
   * @param {EventBus} options.eventBus 事件总线
   */
  constructor(options = {}) {
    // 初始化仓储
    this.starGroupRepository = options.starGroupRepository || new StarGroupRepository();
    
    // 创建StarRecordRepository时注入余额计算器，避免循环依赖
    const balanceCalculator = async (userId) => {
      return await this.starGroupRepository.getTotalPoints(userId);
    };
    
    this.starRecordRepository = options.starRecordRepository || new StarRecordRepository(null, {
      balanceCalculator: balanceCalculator
    });
    
    // 事件总线
    this.eventBus = options.eventBus || new EventBus();
    
    logger.info('StarService', '初始化星星服务，已注入余额计算器到StarRecordRepository');
  }
  
  /**
   * 初始化服务
   * @returns {Promise<Boolean>} 初始化结果
   */
  async initialize() {
    try {
      // 清理过期星星分组
      const expiredGroups = await this.starGroupRepository.cleanupExpiredGroups();
      
      if (expiredGroups.length > 0) {
        logger.info('StarService', `清理过期星星分组成功, 数量=${expiredGroups.length}`);
        
        // 创建过期记录
        for (const group of expiredGroups) {
          if (group.stars > 0) {
            await this.starRecordRepository.createExpiredRecord(
              group.stars, 
              group.expiryType, 
              `星星过期: ${group.expiryType} 类型`
            );
          }
        }
      }
      
      // 清理空分组
      const emptyGroupsCount = await this.starGroupRepository.cleanupEmptyGroups();
      
      if (emptyGroupsCount > 0) {
        logger.info('StarService', `清理空星星分组成功, 数量=${emptyGroupsCount}`);
      }
      
      logger.info('StarService', '星星服务初始化完成');
      return true;
    } catch (error) {
      logger.error('StarService', '初始化星星服务失败', error);
      return false;
    }
  }
  
  /**
   * 获取星星分组列表
   * @param {String} userId 可选的用户ID，不传则获取所有用户的分组
   * @returns {Promise<Array>} 星星分组列表
   */
  async getStarGroups(userId = null) {
    try {
      const groups = await this.starGroupRepository.getNonEmptyGroups(userId);
      logger.info('StarService', `获取星星分组列表成功${userId ? `, 用户=${userId}` : ''}, 数量=${groups.length}`);
      return groups;
    } catch (error) {
      logger.error('StarService', '获取星星分组列表失败', error);
      return [];
    }
  }
  
  /**
   * 获取用户总星星数量
   * @param {String} userId 可选的用户ID，不传则获取所有用户的星星
   * @returns {Promise<Number>} 星星总数量
   */
  async getTotalStars(userId = null) {
    try {
      const total = await this.starGroupRepository.getTotalPoints(userId);
      logger.info('StarService', `获取用户总星星数量成功${userId ? `, 用户=${userId}` : ''}: ${total}`);
      return total;
    } catch (error) {
      logger.error('StarService', '获取用户总星星数量失败', error);
      return 0;
    }
  }
  
  /**
   * 获取星星记录列表
   * @param {Object} options 查询选项
   * @param {Number} options.limit 限制数量
   * @param {String} options.type 记录类型
   * @param {String} options.date 日期
   * @param {String} options.userId 可选的用户ID，不传则获取所有用户的记录
   * @returns {Promise<Array>} 星星记录列表
   */
  async getStarRecords(options = {}) {
    try {
      let records = [];
      const { userId } = options;
      
      if (options.type && options.date) {
        // 查询特定类型和日期的记录
        records = await this.starRecordRepository.getRecordsByTypeAndDate(options.type, options.date, userId);
      } else if (options.type) {
        // 查询特定类型的记录
        records = await this.starRecordRepository.getRecordsByType(options.type, userId);
      } else if (options.date) {
        // 查询特定日期的记录
        records = await this.starRecordRepository.getRecordsByDate(options.date, userId);
      } else {
        // 查询所有记录，并按时间排序
        records = await this.starRecordRepository.getRecordsByTimeOrder(true, options.limit || 0, userId);
      }
      
      logger.info('StarService', `获取星星记录列表成功${userId ? `, 用户=${userId}` : ''}, 数量=${records.length}`);
      return records;
    } catch (error) {
      logger.error('StarService', '获取星星记录列表失败', error);
      return [];
    }
  }
  
  /**
   * 获取星星记录按月份分组
   * @param {String} userId 可选的用户ID，不传则获取所有用户的记录
   * @returns {Promise<Object>} 按月份分组的记录
   */
  async getStarRecordsByMonth(userId = null) {
    try {
      // 获取用户的记录并按月份分组
      const groupedRecords = await this.starRecordRepository.getRecordsGroupedByMonth({ userId });
      
      logger.info('StarService', `获取按月份分组的星星记录成功${userId ? `, 用户=${userId}` : ''}, 月份数=${groupedRecords.length}`);
      return groupedRecords;
    } catch (error) {
      logger.error('StarService', '获取按月份分组的星星记录失败', error);
      return [];
    }
  }
  
  /**
   * 获取特定日期范围的星星记录
   * @param {String} startDate 开始日期字符串（YYYY-MM-DD格式）
   * @param {String} endDate 结束日期字符串（YYYY-MM-DD格式）
   * @param {String} userId 可选的用户ID，不传则获取所有用户的记录
   * @returns {Promise<Array>} 符合条件的记录列表
   */
  async getStarRecordsByDateRange(startDate, endDate, userId = null) {
    try {
      logger.info('StarService', `获取日期范围星星记录: ${startDate} 至 ${endDate}${userId ? `, 用户=${userId}` : ''}`);
      
      const records = await this.starRecordRepository.getRecordsByDateRange(startDate, endDate, userId);
      
      logger.info('StarService', `获取日期范围星星记录成功, 数量=${records.length}`);
      return records;
    } catch (error) {
      logger.error('StarService', `获取日期范围星星记录失败: ${startDate} 至 ${endDate}`, error);
      return [];
    }
  }
  
  /**
   * 获取特定日期的星星记录
   * @param {String} date 日期字符串（YYYY-MM-DD格式）
   * @param {String} userId 可选的用户ID，不传则获取所有用户的记录
   * @returns {Promise<Array>} 符合条件的记录列表
   */
  async getStarRecordsByDate(date, userId = null) {
    try {
      logger.info('StarService', `获取特定日期星星记录: ${date}${userId ? `, 用户=${userId}` : ''}`);
      
      const records = await this.starRecordRepository.getRecordsByDate(date, userId);
      
      logger.info('StarService', `获取特定日期星星记录成功, 数量=${records.length}`);
      return records;
    } catch (error) {
      logger.error('StarService', `获取特定日期星星记录失败: ${date}`, error);
      return [];
    }
  }
  
  /**
   * 添加星星
   * @param {Number} points 星星数量
   * @param {String} expiryType 过期类型，来自StarExpiryType枚举
   * @param {String} source 来源描述
   * @param {Object} options 额外选项
   * @param {String} options.sourceType 来源类型
   * @param {String} options.sourceId 来源ID
   * @param {String} options.userId 可选的用户ID
   * @returns {Promise<Object>} 添加结果
   */
  async addStars(points, expiryType, source, options = {}) {
    if (points <= 0) {
      logger.warn('StarService', `添加星星失败: 星星数量必须大于0, 实际值=${points}`);
      return { success: false, message: '星星数量必须大于0' };
    }
    
    if (!expiryType || !Object.values(StarExpiryType).includes(expiryType)) {
      logger.warn('StarService', `添加星星失败: 无效的过期类型: ${expiryType}`);
      return { success: false, message: '无效的过期类型' };
    }
    
    try {
      const { userId } = options;
      
      // 计算过期时间
      const expiryDate = this._calculateExpiryDate(expiryType);
      
      // 生成过期日期字符串
      const expiryDateStr = expiryDate ? this._formatExpiryDate(expiryDate) : '';
      
      logger.info('StarService', `添加星星: 过期类型=${expiryType}, 过期时间=${expiryDate ? expiryDate.getTime() : null}, 过期日期字符串=${expiryDateStr}${userId ? `, 用户=${userId}` : ''}`);
      
      // 获取或创建对应过期类型的分组
      const group = await this.starGroupRepository.getOrCreateGroup(
        expiryType,
        expiryDate ? expiryDate.getTime() : null,
        expiryDateStr,
        userId // 传递用户ID
      );
      
      if (!group) {
        logger.error('StarService', `添加星星失败: 无法获取或创建星星分组, 类型=${expiryType}${userId ? `, 用户=${userId}` : ''}`);
        return { success: false, message: '无法创建星星分组' };
      }
      
      // 添加星星到分组
      const updatedGroup = await this.starGroupRepository.addStarsToGroup(
        group, 
        points,
        source
      );
      
      if (!updatedGroup) {
        logger.error('StarService', `添加星星失败: 无法添加星星到分组, 类型=${expiryType}, 数量=${points}${userId ? `, 用户=${userId}` : ''}`);
        return { success: false, message: '无法添加星星到分组' };
      }
      
      // 创建收入记录
      const recordData = {
        type: 'income',
        source: options.sourceType || 'manual',
        sourceId: options.sourceId || '',
        points: points,
        description: source || '手动添加星星',
        timestamp: Date.now()
        // balance和previousBalance将在保存时由仓储计算
      };
      
      // 如果有用户ID，添加到记录中
      if (userId) {
        recordData.userId = userId;
      }
      
      const record = await this.starRecordRepository.save(recordData);
      
      if (!record) {
        logger.error('StarService', `添加星星: 创建记录失败, 类型=${expiryType}, 数量=${points}${userId ? `, 用户=${userId}` : ''}`);
        // 继续流程，但记录错误
      }
      
      logger.info('StarService', `添加星星成功, 类型=${expiryType}, 数量=${points}, 来源=${source || '未知'}${userId ? `, 用户=${userId}` : ''}`);
      logger.info('StarService', `更新后的分组信息: ID=${updatedGroup.id}, 当前星星数=${updatedGroup.stars}(${typeof updatedGroup.stars}), 过期类型=${updatedGroup.expiryType}`);
      
      // 触发星星添加事件
      this.eventBus.emit(EVENTS.STARS_ADDED, {
        points,
        expiryType,
        group: updatedGroup,
        record
      });
      
      return {
        success: true,
        points,
        group: updatedGroup,
        record,
        message: '添加星星成功'
      };
    } catch (error) {
      logger.error('StarService', `添加星星失败, 类型=${expiryType}, 数量=${points}`, error);
      return { success: false, message: '添加星星过程中发生错误' };
    }
  }
  
  /**
   * 消费星星
   * @param {Number} points 星星数量（正数）
   * @param {String} reason 消费原因
   * @param {Object} options 额外选项
   * @param {String} options.sourceType 来源类型
   * @param {String} options.sourceId 来源ID
   * @param {String} options.userId 可选的用户ID
   * @returns {Promise<Object>} 消费结果
   */
  async consumeStars(points, reason, options = {}) {
    if (points <= 0) {
      logger.warn('StarService', `消费星星失败: 星星数量必须大于0, 实际值=${points}`);
      return { success: false, message: '星星数量必须大于0' };
    }
    
    try {
      const { userId } = options;
      
      // 直接按过期优先顺序消费星星，有多少扣多少
      const consumeResult = await this.starGroupRepository.consumeStarsByExpiryOrder(points, userId);
      
      if (!consumeResult.success && consumeResult.consumed === 0) {
        logger.warn('StarService', `消费星星失败: 没有可用星星${userId ? `, 用户=${userId}` : ''}`);
        return { 
          success: false, 
          consumed: 0,
          message: '没有可用的星星'
        };
      }
      
      // 实际扣减的数量
      const actualConsumed = consumeResult.consumed || 0;
      
      // 创建支出记录（使用实际扣减数量）
      const recordData = {
        type: 'expense',
        source: options.sourceType || 'manual',
        sourceId: options.sourceId || '',
        points: -actualConsumed, // 负数表示支出，使用实际扣减数量
        description: reason || '手动消费星星',
        timestamp: Date.now()
        // balance和previousBalance将在保存时由仓储计算
      };
      
      // 如果有用户ID，添加到记录中
      if (userId) {
        recordData.userId = userId;
      }
      
      const record = await this.starRecordRepository.save(recordData);
      
      if (!record) {
        logger.error('StarService', `消费星星: 创建记录失败, 实际扣减=${actualConsumed}, 原因=${reason || '未知'}${userId ? `, 用户=${userId}` : ''}`);
        // 继续流程，但记录错误
      }
      
      const isFullyConsumed = actualConsumed === points;
      const resultMessage = isFullyConsumed ? '消费星星成功' : `星星余额不足，已扣减${actualConsumed}颗星星`;
      
      logger.info('StarService', `消费星星完成, 请求=${points}, 实际扣减=${actualConsumed}, 原因=${reason || '未知'}${userId ? `, 用户=${userId}` : ''}`);
      
      // 触发星星消费事件
      this.eventBus.emit(EVENTS.STARS_CONSUMED, {
        points: actualConsumed, // 使用实际扣减数量
        reason,
        groups: consumeResult.groupsUpdated,
        record
      });
      
      return {
        success: actualConsumed > 0, // 只要扣减了就算成功
        points: actualConsumed, // 返回实际扣减数量
        consumed: actualConsumed,
        requested: points, // 返回请求的数量
        groups: consumeResult.groupsUpdated,
        record,
        message: resultMessage
      };
    } catch (error) {
      logger.error('StarService', `消费星星失败, 数量=${points}, 原因=${reason || '未知'}`, error);
      return { success: false, message: '消费星星过程中发生错误' };
    }
  }
  
  /**
   * 处理任务完成奖励
   * @param {Object} task 任务对象
   * @param {Number} points 星星数量
   * @returns {Promise<Object>} 处理结果
   */
  async handleTaskCompletion(task, points) {
    if (!task || !task.id) {
      logger.warn('StarService', '处理任务完成奖励失败: 无效的任务');
      return { success: false, message: '无效的任务' };
    }
    
    if (points <= 0) {
      logger.warn('StarService', `处理任务完成奖励失败: 星星数量必须大于0, 实际值=${points}, 任务ID=${task.id}`);
      return { success: false, message: '星星数量必须大于0' };
    }
    
    try {
      // 获取任务的过期类型，默认为本周有效
      const expiryType = task.starExpiryType || StarExpiryType.WEEK;
      
      // 添加星星
      const result = await this.addStars(
        points,
        expiryType,
        `完成任务: ${task.name || task.id}`,
        {
          sourceType: 'task_complete',
          sourceId: task.id,
          userId: task.userId // 传递任务的用户ID
        }
      );
      
      if (!result.success) {
        logger.error('StarService', `处理任务完成奖励失败, 任务ID=${task.id}, 星星数=${points}${task.userId ? `, 用户=${task.userId}` : ''}`);
        return result;
      }
      
      // 创建任务完成记录
      const record = await this.starRecordRepository.createTaskCompleteRecord(
        task.id,
        points,
        `完成任务: ${task.name || task.id}`
      );
      
      if (!record) {
        logger.error('StarService', `处理任务完成奖励: 创建记录失败, 任务ID=${task.id}`);
        // 继续流程，但记录错误
      }
      
      logger.info('StarService', `处理任务完成奖励成功, 任务ID=${task.id}, 星星数=${points}, 过期类型=${expiryType}`);
      
      // 触发任务完成奖励事件
      this.eventBus.emit(EVENTS.TASK_COMPLETED_WITH_REWARD, {
        task,
        points,
        expiryType,
        record
      });
      
      return {
        ...result,
        task,
        record,
        message: '任务完成奖励处理成功'
      };
    } catch (error) {
      logger.error('StarService', `处理任务完成奖励失败, 任务ID=${task.id}, 星星数=${points}`, error);
      return { success: false, message: '处理任务完成奖励过程中发生错误' };
    }
  }
  
  /**
   * 清理过期星星
   * @returns {Promise<Object>} 清理结果
   */
  async cleanupExpiredStars() {
    try {
      // 清理过期分组
      const expiredGroups = await this.starGroupRepository.cleanupExpiredGroups();
      
      if (expiredGroups.length === 0) {
        logger.info('StarService', '清理过期星星: 没有发现过期星星');
        return { 
          success: true, 
          expiredCount: 0, 
          totalPoints: 0,
          message: '没有发现过期星星'
        };
      }
      
      // 计算过期总数
      let totalExpiredPoints = 0;
      const expiredRecords = [];
      
      // 为每个过期分组创建记录
      for (const group of expiredGroups) {
        if (group.stars > 0) {
          totalExpiredPoints += group.stars;
          
          // 创建过期记录
          const record = await this.starRecordRepository.createExpiredRecord(
            group.stars,
            group.expiryType,
            `星星过期: ${this._getExpiryTypeDescription(group.expiryType)}`
          );
          
          if (record) {
            expiredRecords.push(record);
          } else {
            logger.error('StarService', `清理过期星星: 创建记录失败, 分组ID=${group.id}, 星星数=${group.stars}`);
          }
        }
      }
      
      // 清理空分组
      await this.starGroupRepository.cleanupEmptyGroups();
      
      logger.info('StarService', `清理过期星星成功, 过期分组数=${expiredGroups.length}, 过期星星总数=${totalExpiredPoints}`);
      
      // 触发星星过期事件
      if (totalExpiredPoints > 0) {
        this.eventBus.emit(EVENTS.STARS_EXPIRED, {
          expiredGroups,
          totalExpiredPoints,
          records: expiredRecords
        });
      }
      
      return {
        success: true,
        expiredCount: expiredGroups.length,
        totalPoints: totalExpiredPoints,
        records: expiredRecords,
        message: `清理了${expiredGroups.length}个过期分组，共${totalExpiredPoints}颗星星`
      };
    } catch (error) {
      logger.error('StarService', '清理过期星星失败', error);
      return { success: false, message: '清理过期星星过程中发生错误' };
    }
  }
  
  /**
   * 获取过期类型描述
   * @private
   * @param {String} expiryType 过期类型
   * @returns {String} 过期类型描述
   */
  _getExpiryTypeDescription(expiryType) {
    switch (expiryType) {
      case StarExpiryType.PERMANENT:
        return '永久有效';
      case StarExpiryType.WEEK:
        return '本周有效';
      case StarExpiryType.MONTH:
        return '本月有效';
      case StarExpiryType.QUARTER:
        return '本季度有效';
      default:
        return expiryType;
    }
  }
  
  /**
   * 计算积分有效期日期（公开方法）
   * @param {String} expiryType 有效期类型
   * @returns {Object} 包含时间戳和可读格式的有效期信息
   */
  calculateExpiryDate(expiryType) {
    logger.info('StarService', `计算积分有效期: 类型=${expiryType}`);
    
    // 如果是永久有效，直接返回
    if (expiryType === 'permanent') {
      logger.info('StarService', '积分永久有效');
      return {
        expiry: 'permanent',
        expiryDateStr: '永久'
      };
    }
    
    // 使用私有方法计算过期日期
    const expiryDate = this._calculateExpiryDate(expiryType);
    
    if (!expiryDate) {
      logger.warn('StarService', `无法计算有效期: ${expiryType}`);
      return {
        expiry: 'permanent',
        expiryDateStr: '永久'
      };
    }
    
    // 格式化日期为可读格式
    const dateStr = this._formatExpiryDate(expiryDate);
    
    logger.info('StarService', `计算结果: ${dateStr}`);
    return {
      expiry: expiryDate.getTime(),
      expiryDateStr: dateStr
    };
  }

  /**
   * 获取有效期类型的文本描述（公开方法）
   * @param {String} expiryType 有效期类型
   * @returns {String} 有效期文本描述
   */
  getExpiryText(expiryType) {
    const Constants = require('../utils/constants');
    
    // 使用常量中的文本映射
    if (Constants.POINTS_EXPIRY.TEXT[expiryType]) {
      return Constants.POINTS_EXPIRY.TEXT[expiryType];
    }
    
    // 如果常量中没有，使用默认映射
    switch (expiryType) {
      case 'permanent':
        return '永久';
      case 'week':
        return '一周';
      case 'month':
        return '一个月';
      case '3months':
        return '三个月';
      case '6months':
        return '六个月';
      case '12months':
        return '十二个月';
      default:
        return '永久';
    }
  }

  /**
   * 格式化过期日期为可读格式
   * @private
   * @param {Date} expiryDate 过期日期
   * @returns {String} 格式化后的日期字符串
   */
  _formatExpiryDate(expiryDate) {
    const logger = require('../utils/logger');
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const expiry = new Date(expiryDate.getFullYear(), expiryDate.getMonth(), expiryDate.getDate());
    
    // 计算天数差
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let result;
    if (diffDays === 0) {
      result = '今天到期';
    } else if (diffDays === 1) {
      result = '明天到期';
    } else {
      // 格式化为 YYYY-MM-DD 格式
      const year = expiryDate.getFullYear();
      const month = String(expiryDate.getMonth() + 1).padStart(2, '0');
      const day = String(expiryDate.getDate()).padStart(2, '0');
      result = `${year}-${month}-${day} 到期`;
    }
    
    logger.info('StarService', `过期日期格式化: ${expiryDate.toISOString()} -> ${result}`);
    return result;
  }

  /**
   * 计算过期日期
   * @private
   * @param {String} expiryType 过期类型
   * @returns {Date|null} 过期日期对象，null表示永不过期
   */
  _calculateExpiryDate(expiryType) {
    // 永久有效，无过期日期
    if (expiryType === StarExpiryType.PERMANENT) {
      return null;
    }
    
    const now = new Date();
    const result = new Date(now);
    
    switch (expiryType) {
      case StarExpiryType.WEEK: {
        // 本周日的23:59:59
        const daysUntilSunday = 7 - now.getDay(); // 0是周日，所以当天是周日时为7天
        result.setDate(now.getDate() + (daysUntilSunday === 7 ? 0 : daysUntilSunday));
        result.setHours(23, 59, 59, 999);
        break;
      }
      
      case StarExpiryType.MONTH: {
        // 本月最后一天的23:59:59
        result.setMonth(result.getMonth() + 1, 0); // 下个月的第0天就是本月最后一天
        result.setHours(23, 59, 59, 999);
        break;
      }
      
      case StarExpiryType.QUARTER: {
        // 计算当前季度的最后一个月
        const currentMonth = now.getMonth(); // 0-11
        const quarterEndMonth = Math.floor(currentMonth / 3) * 3 + 2; // 季度的最后一个月 (0->2, 1->2, 2->2, 3->5...)
        
        // 设置为季度最后一个月的最后一天
        result.setMonth(quarterEndMonth + 1, 0); // 下个月的第0天就是本月最后一天
        result.setHours(23, 59, 59, 999);
        break;
      }
      
      default:
        // 不识别的类型，默认返回null
        return null;
    }
    
    return result;
  }
  
  /**
   * 验证星星数据一致性
   * @returns {Promise<Object>} 验证结果
   */
  async validateConsistency() {
    logger.info('StarService', '开始验证星星数据一致性');
    
    try {
      // 获取所有星星分组
      const groups = await this.starGroupRepository.getAll();
      
      // 计算分组总和
      const groupsTotal = groups.reduce((sum, group) => sum + (group.stars || 0), 0);
      
      // 获取总记录数
      const records = await this.starRecordRepository.getAll();
      const recordsCalculation = this._calculateBalanceFromRecords(records);
      
      // 检查一致性
      const isConsistent = groupsTotal === recordsCalculation.finalBalance;
      
      const result = {
        isConsistent,
        groupsTotal,
        recordsBalance: recordsCalculation.finalBalance,
        difference: groupsTotal - recordsCalculation.finalBalance,
        groupsCount: groups.length,
        recordsCount: records.length
      };
      
      logger.info('StarService', `星星数据一致性验证结果: ${JSON.stringify(result)}`);
      
      return result;
    } catch (error) {
      logger.error('StarService', '验证星星数据一致性失败', error);
      return {
        isConsistent: false,
        error: error.message
      };
    }
  }

  /**
   * 根据记录计算余额
   * @private
   * @param {Array} records 星星记录
   * @returns {Object} 计算结果
   */
  _calculateBalanceFromRecords(records) {
    let income = 0;
    let expense = 0;
    
    records.forEach(record => {
      if (record.points > 0) {
        income += record.points;
      } else {
        expense += Math.abs(record.points);
      }
    });
    
    return {
      income,
      expense,
      finalBalance: income - expense
    };
  }
  
  /**
   * 格式化星星数量
   * @param {Number} points 要格式化的星星数量
   * @param {Boolean} useThousandSeparator 是否使用千位分隔符
   * @returns {String} 格式化后的星星数量字符串
   */
  formatStarCount(points, useThousandSeparator = false) {
    // 确保输入为数字
    const numPoints = parseInt(points, 10) || 0;
    
    if (useThousandSeparator) {
      // 添加千位分隔符
      return numPoints.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    
    // 普通格式化，直接返回字符串
    return numPoints.toString();
  }

  /**
   * 获取即将过期的星星信息
   * @returns {Promise<Object>} 包含过期星星数和最早过期日期的对象
   */
  async getExpiringStarsInfo() {
    try {
      // 获取所有星星分组
      const groups = await this.starGroupRepository.getAll();
      logger.info('StarService', `获取到${groups.length}个星星分组`);
      
      // 添加详细的分组信息日志
      groups.forEach((group, index) => {
        logger.info('StarService', `分组${index + 1}: ID=${group.id}, 星星数=${group.stars}, 过期类型=${group.expiryType}, 过期时间=${group.expiryDate}, 过期日期字符串=${group.expiryDateStr}`);
      });
      
      // 过滤出非永久有效且未过期的分组
      const expiringGroups = groups.filter(group => 
        group.expiryType !== StarExpiryType.PERMANENT && 
        !group.isExpired()
      );
      
      logger.info('StarService', `过滤后的即将过期分组数量: ${expiringGroups.length}`);
      
      if (expiringGroups.length === 0) {
        logger.info('StarService', '没有找到即将过期的星星分组');
        return { 
          points: 0, 
          expiryDateText: '',
          expiryTimestamp: 0
        };
      }
      
      // 添加过期分组详细信息
      expiringGroups.forEach((group, index) => {
        logger.info('StarService', `即将过期分组${index + 1}: ID=${group.id}, 星星数=${group.stars}, 过期类型=${group.expiryType}, 过期时间=${group.expiryDate}, 过期日期字符串=${group.expiryDateStr}, 是否过期=${group.isExpired()}`);
      });
      
      // 按过期时间排序
      expiringGroups.sort((a, b) => {
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        return a.expiryDate - b.expiryDate;
      });
      
      // 获取最早过期的分组
      const earliestGroup = expiringGroups[0];
      logger.info('StarService', `最早过期分组: ID=${earliestGroup.id}, 过期时间=${earliestGroup.expiryDate}, 过期日期字符串=${earliestGroup.expiryDateStr}`);
      
      // 计算即将过期的星星数量（最早过期日期的所有星星）
      const expiringPoints = expiringGroups
        .filter(g => g.expiryDate === earliestGroup.expiryDate)
        .reduce((sum, g) => sum + (g.stars || 0), 0);
      
      logger.info('StarService', `最早过期日期: ${earliestGroup.expiryDateStr}, 该日期星星: ${expiringPoints}`);
      
      // 添加返回值的详细日志
      const result = {
        points: expiringPoints,
        expiryDateText: earliestGroup.expiryDateStr || '',
        expiryTimestamp: earliestGroup.expiryDate || 0
      };
      
      logger.info('StarService', `即将过期星星信息计算完成:`, result);
      
      return result;
    } catch (error) {
      logger.error('StarService', '获取即将过期星星信息失败', error);
      return { 
        points: 0, 
        expiryDateText: '',
        expiryTimestamp: 0
      };
    }
  }

  /**
   * 从特定有效期类型的分组中消费星星
   * 专门用于任务取消完成时的星星扣减
   * @param {Number} points 星星数量
   * @param {String} expiryType 有效期类型
   * @param {String} reason 消费原因
   * @param {Object} options 额外选项
   * @returns {Promise<Object>} 消费结果
   */
  async consumeStarsFromSpecificType(points, expiryType, reason, options = {}) {
    if (points <= 0) {
      logger.warn('StarService', `从特定类型消费星星失败: 星星数量必须大于0, 实际值=${points}`);
      return { success: false, message: '星星数量必须大于0' };
    }
    
    if (!expiryType) {
      logger.warn('StarService', `从特定类型消费星星失败: 未指定有效期类型`);
      return { success: false, message: '未指定有效期类型' };
    }
    
    try {
      logger.info('StarService', `开始从特定类型消费星星, 数量=${points}, 类型=${expiryType}, 原因=${reason}`);
      
      // 从特定类型的分组中扣减星星
      const deductResult = await this.starGroupRepository.deductStarsFromSpecificExpiryType(
        points,
        expiryType,
        reason
      );
      
      if (!deductResult.success) {
        logger.error('StarService', `从特定类型消费星星失败: ${deductResult.message}`);
        return deductResult;
      }
      
      // 创建支出记录
      const record = await this.starRecordRepository.save({
        type: 'expense',
        source: options.sourceType || 'task_reset',
        sourceId: options.sourceId || '',
        points: -points, // 负数表示支出
        description: reason || '取消任务完成',
        timestamp: Date.now()
      });
      
      if (!record) {
        logger.error('StarService', `从特定类型消费星星: 创建记录失败, 数量=${points}, 类型=${expiryType}`);
        // 继续流程，但记录错误
      }
      
      logger.info('StarService', `从特定类型消费星星成功, 数量=${points}, 类型=${expiryType}, 原因=${reason}`);
      
      // 触发星星消费事件
      this.eventBus.emit(EVENTS.STARS_CONSUMED, {
        points,
        expiryType,
        reason,
        groups: deductResult.deductedGroups,
        record
      });
      
      return {
        success: true,
        points,
        consumed: points,
        groups: deductResult.deductedGroups,
        record,
        message: '从特定类型消费星星成功'
      };
    } catch (error) {
      logger.error('StarService', `从特定类型消费星星失败, 数量=${points}, 类型=${expiryType}`, error);
      return { success: false, message: '从特定类型消费星星过程中发生错误' };
    }
  }

  /**
   * 修复星星记录的余额信息
   * @returns {Promise<Object>} 修复结果
   */
  async repairStarRecordBalances() {
    logger.info('StarService', '开始修复星星记录的余额信息');
    
    try {
      const result = await this.starRecordRepository.repairRecordBalances();
      
      if (result.success) {
        logger.info('StarService', `星星记录余额修复完成，共修复${result.repairedCount}条记录`);
        
        // 清除缓存确保数据一致性
        this.clearCache();
      } else {
        logger.error('StarService', `星星记录余额修复失败: ${result.error}`);
      }
      
      return result;
    } catch (error) {
      logger.error('StarService', '修复星星记录余额失败', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 检查并自动修复数据一致性
   * @returns {Promise<Object>} 检查和修复结果
   */
  async checkAndRepairDataConsistency() {
    logger.info('StarService', '开始检查并修复数据一致性');
    
    try {
      // 1. 验证数据一致性
      const consistencyResult = await this.validateConsistency();
      
      // 2. 修复星星记录余额
      const repairResult = await this.repairStarRecordBalances();
      
      // 3. 再次验证一致性
      const finalConsistencyResult = await this.validateConsistency();
      
      const result = {
        success: true,
        initialConsistency: consistencyResult,
        repairResult,
        finalConsistency: finalConsistencyResult,
        isFixed: finalConsistencyResult.isConsistent
      };
      
      logger.info('StarService', `数据一致性检查和修复完成:`, {
        初始一致性: consistencyResult.isConsistent,
        修复记录数: repairResult.repairedCount,
        最终一致性: finalConsistencyResult.isConsistent
      });
      
      return result;
    } catch (error) {
      logger.error('StarService', '检查并修复数据一致性失败', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 实时验证星星操作后的数据一致性
   * @param {String} operation 操作类型
   * @param {Object} operationData 操作数据
   * @returns {Promise<Boolean>} 是否一致
   */
  async verifyOperationConsistency(operation, operationData = {}) {
    logger.info('StarService', `验证${operation}操作后的数据一致性`);
    
    try {
      // 获取分组总数和记录计算结果
      const groupsTotal = await this.starGroupRepository.getTotalPoints();
      const records = await this.starRecordRepository.getAll();
      const recordsCalculation = this._calculateBalanceFromRecords(records);
      
      const isConsistent = groupsTotal === recordsCalculation.finalBalance;
      
      logger.info('StarService', `${operation}操作后数据一致性检查: 分组总数=${groupsTotal}, 记录余额=${recordsCalculation.finalBalance}, 一致性=${isConsistent}`);
      
      if (!isConsistent) {
        logger.error('StarService', `${operation}操作后数据不一致！`, {
          operation,
          operationData,
          groupsTotal,
          recordsBalance: recordsCalculation.finalBalance,
          difference: groupsTotal - recordsCalculation.finalBalance
        });
        
        // 可以在这里触发自动修复或告警
        // await this.repairStarRecordBalances();
      }
      
      return isConsistent;
    } catch (error) {
      logger.error('StarService', `验证${operation}操作后数据一致性失败`, error);
      return false;
    }
  }

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
}

module.exports = StarService; 