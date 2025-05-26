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
    this.starRecordRepository = options.starRecordRepository || new StarRecordRepository();
    
    // 事件总线
    this.eventBus = options.eventBus || new EventBus();
    
    logger.info('StarService', '初始化星星服务');
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
   * @returns {Promise<Array>} 星星分组列表
   */
  async getStarGroups() {
    try {
      const groups = await this.starGroupRepository.getNonEmptyGroups();
      logger.info('StarService', `获取星星分组列表成功, 数量=${groups.length}`);
      return groups;
    } catch (error) {
      logger.error('StarService', '获取星星分组列表失败', error);
      return [];
    }
  }
  
  /**
   * 获取用户总星星数量
   * @returns {Promise<Number>} 星星总数量
   */
  async getTotalStars() {
    try {
      const total = await this.starGroupRepository.getTotalPoints();
      logger.info('StarService', `获取用户总星星数量成功: ${total}`);
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
   * @returns {Promise<Array>} 星星记录列表
   */
  async getStarRecords(options = {}) {
    try {
      let records = [];
      
      if (options.type && options.date) {
        // 查询特定类型和日期的记录
        records = await this.starRecordRepository.getRecordsByTypeAndDate(options.type, options.date);
      } else if (options.type) {
        // 查询特定类型的记录
        records = await this.starRecordRepository.getRecordsByType(options.type);
      } else if (options.date) {
        // 查询特定日期的记录
        records = await this.starRecordRepository.getRecordsByDate(options.date);
      } else {
        // 查询所有记录，并按时间排序
        records = await this.starRecordRepository.getRecordsByTimeOrder(true, options.limit || 0);
      }
      
      logger.info('StarService', `获取星星记录列表成功, 数量=${records.length}`);
      return records;
    } catch (error) {
      logger.error('StarService', '获取星星记录列表失败', error);
      return [];
    }
  }
  
  /**
   * 获取星星记录按月份分组
   * @returns {Promise<Object>} 按月份分组的记录
   */
  async getStarRecordsByMonth() {
    try {
      // 获取所有记录
      const records = await this.starRecordRepository.getAll();
      
      // 按月份分组
      const groupedRecords = this.starRecordRepository.groupRecordsByMonth(records);
      
      logger.info('StarService', `获取按月份分组的星星记录成功, 月份数=${Object.keys(groupedRecords).length}`);
      return groupedRecords;
    } catch (error) {
      logger.error('StarService', '获取按月份分组的星星记录失败', error);
      return {};
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
      // 计算过期时间
      const expiryDate = this._calculateExpiryDate(expiryType);
      
      // 生成过期日期字符串
      const expiryDateStr = expiryDate ? this._formatExpiryDate(expiryDate) : '';
      
      logger.info('StarService', `添加星星: 过期类型=${expiryType}, 过期时间=${expiryDate ? expiryDate.getTime() : null}, 过期日期字符串=${expiryDateStr}`);
      
      // 获取或创建对应过期类型的分组
      const group = await this.starGroupRepository.getOrCreateGroup(
        expiryType,
        expiryDate ? expiryDate.getTime() : null,
        expiryDateStr
      );
      
      if (!group) {
        logger.error('StarService', `添加星星失败: 无法获取或创建星星分组, 类型=${expiryType}`);
        return { success: false, message: '无法创建星星分组' };
      }
      
      // 添加星星到分组
      const updatedGroup = await this.starGroupRepository.addStarsToGroup(
        group, 
        points,
        source
      );
      
      if (!updatedGroup) {
        logger.error('StarService', `添加星星失败: 无法添加星星到分组, 类型=${expiryType}, 数量=${points}`);
        return { success: false, message: '无法添加星星到分组' };
      }
      
      // 创建收入记录
      const record = await this.starRecordRepository.save({
        type: 'income',
        source: options.sourceType || 'manual',
        sourceId: options.sourceId || '',
        points: points,
        description: source || '手动添加星星',
        timestamp: Date.now()
        // balance和previousBalance将在保存时由仓储计算
      });
      
      if (!record) {
        logger.error('StarService', `添加星星: 创建记录失败, 类型=${expiryType}, 数量=${points}`);
        // 继续流程，但记录错误
      }
      
      logger.info('StarService', `添加星星成功, 类型=${expiryType}, 数量=${points}, 来源=${source || '未知'}`);
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
   * @returns {Promise<Object>} 消费结果
   */
  async consumeStars(points, reason, options = {}) {
    if (points <= 0) {
      logger.warn('StarService', `消费星星失败: 星星数量必须大于0, 实际值=${points}`);
      return { success: false, message: '星星数量必须大于0' };
    }
    
    try {
      // 检查星星是否足够
      const hasEnough = await this.starGroupRepository.hasEnoughPoints(points);
      
      if (!hasEnough) {
        logger.warn('StarService', `消费星星失败: 星星数量不足, 需要=${points}`);
        return { success: false, message: '星星数量不足' };
      }
      
      // 按过期优先顺序消费星星
      const consumeResult = await this.starGroupRepository.consumeStarsByExpiryOrder(points);
      
      if (!consumeResult.success) {
        logger.error('StarService', `消费星星失败: 消费过程出错, 需要=${points}, 实际消费=${consumeResult.consumed}`);
        return { 
          success: false, 
          consumed: consumeResult.consumed,
          message: '消费星星时出错'
        };
      }
      
      // 创建支出记录
      const record = await this.starRecordRepository.save({
        type: 'expense',
        source: options.sourceType || 'manual',
        sourceId: options.sourceId || '',
        points: -points, // 负数表示支出
        description: reason || '手动消费星星',
        timestamp: Date.now()
        // balance和previousBalance将在保存时由仓储计算
      });
      
      if (!record) {
        logger.error('StarService', `消费星星: 创建记录失败, 数量=${points}, 原因=${reason || '未知'}`);
        // 继续流程，但记录错误
      }
      
      logger.info('StarService', `消费星星成功, 数量=${points}, 原因=${reason || '未知'}`);
      
      // 触发星星消费事件
      this.eventBus.emit(EVENTS.STARS_CONSUMED, {
        points,
        reason,
        groups: consumeResult.groupsUpdated,
        record
      });
      
      return {
        success: true,
        points,
        consumed: points,
        groups: consumeResult.groupsUpdated,
        record,
        message: '消费星星成功'
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
          sourceId: task.id
        }
      );
      
      if (!result.success) {
        logger.error('StarService', `处理任务完成奖励失败, 任务ID=${task.id}, 星星数=${points}`);
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
   * 处理必做任务惩罚
   * @param {Object} task 任务对象
   * @param {Number} points 扣除的星星数（正数）
   * @returns {Promise<Object>} 处理结果
   */
  async handleRequiredTaskPenalty(task, points) {
    if (!task || !task.id) {
      logger.warn('StarService', '处理必做任务惩罚失败: 无效的任务');
      return { success: false, message: '无效的任务' };
    }
    
    if (points <= 0) {
      logger.warn('StarService', `处理必做任务惩罚失败: 扣除的星星数必须大于0, 实际值=${points}, 任务ID=${task.id}`);
      return { success: false, message: '扣除的星星数必须大于0' };
    }
    
    try {
      // 检查星星是否足够
      const total = await this.starGroupRepository.getTotalPoints();
      
      // 如果星星不够，只扣除现有的全部
      const actualPoints = Math.min(points, total);
      
      if (actualPoints <= 0) {
        logger.info('StarService', `处理必做任务惩罚: 没有可扣除的星星, 任务ID=${task.id}`);
        
        // 创建惩罚记录，但星星数为0
        const record = await this.starRecordRepository.createPenaltyRecord(
          task.id,
          0,
          `未完成必做任务: ${task.name || task.id} (无可扣除星星)`
        );
        
        return {
          success: true,
          points: 0,
          consumed: 0,
          task,
          record,
          message: '没有可扣除的星星'
        };
      }
      
      // 消费星星
      const consumeResult = await this.consumeStars(
        actualPoints,
        `未完成必做任务: ${task.name || task.id}`,
        {
          sourceType: 'required_penalty',
          sourceId: task.id
        }
      );
      
      if (!consumeResult.success) {
        logger.error('StarService', `处理必做任务惩罚失败, 任务ID=${task.id}, 星星数=${actualPoints}`);
        return consumeResult;
      }
      
      // 创建惩罚记录
      const record = await this.starRecordRepository.createPenaltyRecord(
        task.id,
        actualPoints,
        `未完成必做任务: ${task.name || task.id}`
      );
      
      if (!record) {
        logger.error('StarService', `处理必做任务惩罚: 创建记录失败, 任务ID=${task.id}`);
        // 继续流程，但记录错误
      }
      
      logger.info('StarService', `处理必做任务惩罚成功, 任务ID=${task.id}, 扣除星星数=${actualPoints}`);
      
      // 触发任务惩罚事件
      this.eventBus.emit(EVENTS.TASK_PENALTY_APPLIED, {
        task,
        points: actualPoints,
        record
      });
      
      return {
        ...consumeResult,
        task,
        record,
        originalPoints: points,
        message: actualPoints < points 
          ? `惩罚成功，但只扣除了${actualPoints}颗星星`
          : '惩罚成功'
      };
    } catch (error) {
      logger.error('StarService', `处理必做任务惩罚失败, 任务ID=${task.id}, 星星数=${points}`, error);
      return { success: false, message: '处理必做任务惩罚过程中发生错误' };
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