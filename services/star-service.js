/**
 * star-service.js - 星星服务
 * 
 * 提供星星相关的业务逻辑，包括星星的获取、消费和过期处理
 */

const logger = require('../utils/logger');
const { StarGroupRepository, StarRecordRepository } = require('../repositories/index');
const EventBus = require('../utils/core/event-bus');
const { StarExpiryType } = require('../models/star');
const { StarRecord } = require('../models/star-record');
const { StarGroup } = require('../models/star-group');
const { EVENTS } = require('../utils/constants');
const HttpClient = require('../utils/http-client');
const API_CONFIG = require('../utils/api-config');

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

    this.enableCloudStorage = API_CONFIG.ENABLE_API;
    this._cloudRefreshInFlight = new Map();
    
    logger.info('StarService', '初始化星星服务，已注入余额计算器到StarRecordRepository');
  }
  
  /**
   * 初始化服务
   * @returns {Promise<Boolean>} 初始化结果
   */
  async initialize() {
    try {
      // 复用 cleanupExpiredStars 完整链路：过期分组清理 → 记录创建 → STARS_EXPIRED 事件 → 空组清理
      // 不传 userId，保持全量清理语义
      const result = await this.cleanupExpiredStars();
      if (!result.success) {
        logger.error('StarService', '初始化清理过期星星失败', result.message);
        return false;
      }
      if (result.expiredCount > 0) {
        logger.info('StarService', `初始化清理过期星星完成, 过期${result.expiredCount}组, 共${result.totalPoints}颗`);
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
        timestamp: Date.now(),
        expiryType,
        expiryDate: expiryDateStr || null,
        syncedToCloud: false
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

      if (record && this.enableCloudStorage) {
        this._syncStarRecordToCloud(record).catch(syncError => {
          logger.warn('StarService', '星星收入云同步失败，本地已保存', {
            recordId: record.id,
            error: syncError.message
          });
        });
      }
      
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
   * @param {Number} points 要消费的星星数量
   * @param {String} reason 消费原因
   * @param {Object} options 选项
   * @param {String} options.userId 用户ID
   * @param {String} options.sourceType 来源类型
   * @param {String} options.sourceId 来源ID
   * @param {String} options.originalTaskDate 任务原始截止日期（用于惩罚记录）
   * @returns {Promise<Object>} 消费结果
   */
  async consumeStars(points, reason, options = {}) {
    if (points <= 0) {
      logger.warn('StarService', `消费星星失败: 星星数量必须大于0, 实际值=${points}`);
      return { success: false, message: '星星数量必须大于0' };
    }
    
    try {
      const { userId, sourceType, sourceId, originalTaskDate } = options;
      const consumeIdempotencyKey = this._buildConsumeIdempotencyKey(options);
      
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
      
      // 如果是任务惩罚类型，使用专门的惩罚记录创建方法
      let record;
      if (sourceType === 'task_penalty' && sourceId) {
        record = await this.starRecordRepository.createPenaltyRecord(
          sourceId, 
          actualConsumed, 
          reason, 
          userId,
          originalTaskDate,
          points, // 传递应扣数量作为requestedPoints
          consumeIdempotencyKey
        );
      } else {
        // 创建普通支出记录
        const recordData = {
          type: 'expense',
          source: sourceType || 'manual',
          sourceId: sourceId || '',
          points: -actualConsumed, // 负数表示支出，使用实际扣减数量
          description: reason || '手动消费星星',
          timestamp: Date.now(),
          idempotencyKey: consumeIdempotencyKey
          // balance和previousBalance将在保存时由仓储计算
        };
        
        // 如果有用户ID，添加到记录中
        if (userId) {
          recordData.userId = userId;
        }
        
        record = await this.starRecordRepository.save(recordData);
      }
      
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

      if (actualConsumed > 0 && this.enableCloudStorage) {
        this._syncConsumeToCloud(points, reason, {
          ...options,
          requestedPoints: points,
          idempotencyKey: consumeIdempotencyKey
        }).catch(syncError => {
          logger.warn('StarService', '通用扣星云同步失败，本地已保存', {
            requestedPoints: points,
            error: syncError.message
          });
        });
      }
      
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

      const record = result.record || null;
      
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
   * 统一的星星消费接口（策略模式）
   * @param {Object} params 消费参数
   * @param {Number} params.points 消费数量
   * @param {String} params.reason 消费原因
   * @param {String} params.strategy 消费策略：'expiry_order'(按过期顺序) | 'specific_type'(特定类型)
   * @param {String} params.expiryType 当strategy为'specific_type'时必需的有效期类型
   * @param {Object} params.options 额外选项（userId, sourceType等）
   * @returns {Promise<Object>} 消费结果
   */
  async consumeStarsUnified(params) {
    const { points, reason, strategy = 'expiry_order', expiryType, options = {} } = params;
    
    if (points <= 0) {
      logger.warn('StarService', `统一扣星失败: 星星数量必须大于0, 实际值=${points}`);
      return { success: false, message: '星星数量必须大于0' };
    }
    
    logger.info('StarService', `使用统一接口消费星星: 数量=${points}, 策略=${strategy}, 原因=${reason}`);
    
    try {
      switch (strategy) {
        case 'expiry_order':
          // 按过期顺序扣星（默认策略）
          return await this.consumeStars(points, reason, options);
          
        case 'specific_type':
          // 从特定类型扣星
          if (!expiryType) {
            logger.warn('StarService', '使用specific_type策略时必须指定expiryType');
            return { success: false, message: '使用特定类型策略时必须指定有效期类型' };
          }
          return await this.consumeStarsFromSpecificType(points, expiryType, reason, options);
          
        default:
          logger.warn('StarService', `未知的消费策略: ${strategy}`);
          return { success: false, message: '未知的消费策略' };
      }
    } catch (error) {
      logger.error('StarService', `统一扣星接口执行失败: 策略=${strategy}`, error);
      return { success: false, message: '扣星操作失败' };
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
        reason,
        options.userId || null
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
        timestamp: Date.now(),
        userId: options.userId || null,
        originalTaskDate: options.originalTaskDate || null,
        expiryType,
        syncedToCloud: false
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

      if (record && this.enableCloudStorage) {
        this._syncStarRecordToCloud(record).catch(syncError => {
          logger.warn('StarService', '特定类型扣星云同步失败，本地已保存', {
            recordId: record.id,
            error: syncError.message
          });
        });
      }
      
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
   * 计算每条记录的星星余额
   * @param {Array} records 星星记录列表
   * @param {Number} currentBalance 当前余额
   * @returns {Array} 包含余额信息的记录列表
   */
  calculateRecordBalance(records, currentBalance) {
    logger.info('StarService', `计算记录余额，当前总星星数：${currentBalance}`);
    
    // 按时间从新到旧排序
    const sortedRecords = [...records].sort((a, b) => b.timestamp - a.timestamp);
    
    // 计算每条记录的结束余额
    const result = [];
    let runningBalance = currentBalance;
    
    for (let i = 0; i < sortedRecords.length; i++) {
      const record = { ...sortedRecords[i] };
      
      // 修复数字问题，确保没有前导零
      record.points = parseInt(record.points);
      record.balance = parseInt(runningBalance);
      
      result.push(record);
      
      // 根据点数变动，计算之前的余额
      runningBalance = runningBalance - record.points;
    }
    
    logger.info('StarService', `记录余额计算完成，处理了${result.length}条记录`);
    return result;
  }

  /**
   * 计算月度汇总信息
   * @param {Array} groupedRecords 按月分组的记录
   * @returns {Array} 包含月度汇总的分组记录
   */
  calculateMonthSummary(groupedRecords) {
    logger.info('StarService', `计算月度汇总，共${groupedRecords.length}个月份`);
    
    return groupedRecords.map(group => {
      const records = group.records || [];
      let incomeTotal = 0;
      let expenseTotal = 0;
      
      records.forEach(record => {
        if (record.points > 0) {
          incomeTotal += record.points;
        } else {
          expenseTotal += Math.abs(record.points);
        }
      });
      
      const netChange = incomeTotal - expenseTotal;
      let summary = '';
      
      // 确保数字不显示前导零，使用parseInt处理
      if (netChange >= 0) {
        summary = `本月共获得 ${parseInt(incomeTotal)} 颗星星`;
      } else {
        summary = `本月共使用 ${parseInt(expenseTotal)} 颗星星`;
      }
      
      return {
        ...group,
        monthSummary: summary,
        incomeTotal: parseInt(incomeTotal),
        expenseTotal: parseInt(expenseTotal),
        netChange: netChange
      };
    });
  }

  /**
   * 按月份分组记录
   * @param {Array} records 星星记录列表
   * @returns {Array} 按月分组的记录
   */
  groupRecordsByMonth(records) {
    logger.info('StarService', '开始按月份分组记录');
    
    const monthGroups = {};
    
    // 按月份分组
    records.forEach(record => {
      if (!record.timestamp) return;
      
      const date = new Date(record.timestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthGroups[monthKey]) {
        monthGroups[monthKey] = {
          month: monthKey,
          monthText: `${date.getFullYear()}年${date.getMonth() + 1}月`,
          records: []
        };
      }
      
      monthGroups[monthKey].records.push(record);
    });
    
    // 将分组转换为数组并按月份排序
    const result = Object.values(monthGroups);
    
    // 按时间从新到旧排序
    result.sort((a, b) => {
      return b.month.localeCompare(a.month);
    });
    
    logger.info('StarService', `月份分组完成，共${result.length}个月份`);
    return result;
  }

  /**
   * 根据条件筛选记录
   * @param {Array} records 原始记录列表
   * @param {String} typeFilter 类型筛选条件
   * @param {String} timeFilter 时间筛选条件
   * @returns {Array} 筛选后的记录列表
   */
  filterRecords(records, typeFilter, timeFilter) {
    logger.info('StarService', `筛选记录，类型：${typeFilter}，时间：${timeFilter}`);
    let filtered = [...records];
    
    // 记录筛选前的数据用于调试
    logger.info('StarService', `筛选前记录数量：${records.length}`);
    if (records.length > 0) {
      logger.info('StarService', `第一条记录类型：${records[0].type}，点数：${records[0].points}，标题：${records[0].title || records[0].description}`);
    }
    
    // 应用类型筛选
    if (typeFilter !== 'all') {
      filtered = filtered.filter(record => record.type === typeFilter);
      logger.info('StarService', `类型筛选后记录数量：${filtered.length}`);
    }
    
    // 应用时间筛选
    if (timeFilter !== 'all') {
      const now = Date.now();
      let timeThreshold = now;
      
      if (timeFilter === 'week') {
        // 一周前
        timeThreshold = now - (7 * 24 * 60 * 60 * 1000);
      } else if (timeFilter === 'month') {
        // 一个月前
        timeThreshold = now - (30 * 24 * 60 * 60 * 1000);
      } else if (timeFilter === '3months') {
        // 三个月前
        timeThreshold = now - (90 * 24 * 60 * 60 * 1000);
      }
      
      filtered = filtered.filter(record => record.timestamp >= timeThreshold);
      logger.info('StarService', `时间筛选后记录数量：${filtered.length}`);
    }
    
    logger.info('StarService', `最终筛选结果：${filtered.length}条记录`);
    return filtered;
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

  async hasPendingLocalStarRecords(userId = null, options = {}) {
    try {
      const allRecords = await this.starRecordRepository.getAll(false);
      const excludeRecordId = options.excludeRecordId || null;

      return allRecords.some(record => {
        if (userId && record.userId !== userId) {
          return false;
        }
        if (excludeRecordId && record.id === excludeRecordId) {
          return false;
        }
        return record.syncedToCloud !== true;
      });
    } catch (error) {
      logger.warn('StarService', '检查本地待同步星星流水失败，按存在待同步处理', {
        userId,
        error: error.message
      });
      return true;
    }
  }

  async refreshStarsFromCloud(userId = null, options = {}) {
    if (!this.enableCloudStorage) {
      return { success: false, message: '云端模式未启用' };
    }
    const scope = options.scope || 'user';
    const scopeKey = scope === 'family'
      ? 'family'
      : `user:${userId || 'missing'}`;
    const inFlightRequest = this._cloudRefreshInFlight.get(scopeKey);
    if (inFlightRequest) {
      logger.info('StarService', '复用进行中的云端星星刷新请求', {
        scope,
        userId: userId || null
      });
      return inFlightRequest;
    }

    const request = this._fetchStarsFromCloud(userId, options)
      .finally(() => {
        if (this._cloudRefreshInFlight.get(scopeKey) === request) {
          this._cloudRefreshInFlight.delete(scopeKey);
        }
      });

    this._cloudRefreshInFlight.set(scopeKey, request);
    return request;
  }

  async _fetchStarsFromCloud(userId = null, options = {}) {
    const scope = options.scope || 'user';

    if (scope === 'family') {
      const familyRecordsData = await HttpClient.get(API_CONFIG.ENDPOINTS.STAR_RECORDS, { scope: 'family' });
      const familyRecords = (familyRecordsData.records || []).map(record => this._mapCloudRecord(record));
      await this._replaceSyncedStarRecords(null, familyRecords, { scope: 'family' });
      logger.info('StarService', '已从云端刷新家庭星星流水', { recordCount: familyRecords.length });
      return { success: true, records: familyRecords, groups: [] };
    }

    if (!userId) {
      return { success: false, message: '刷新单用户星星数据时必须传 userId' };
    }

    const hasPendingLocalRecords = await this.hasPendingLocalStarRecords(userId);
    if (hasPendingLocalRecords) {
      logger.info('StarService', '检测到本地待同步星星流水，跳过云端星星覆盖', { userId });
      const [localGroups, localRecords] = await Promise.all([
        this.starGroupRepository.getAll(false),
        this.starRecordRepository.getAll(false)
      ]);

      return {
        success: true,
        skipped: true,
        reason: 'pending_local_records',
        groups: localGroups.filter(group => group.userId === userId),
        records: localRecords.filter(record => record.userId === userId)
      };
    }

    const starsData = await HttpClient.get(API_CONFIG.ENDPOINTS.STARS, { userId });
    const recordData = await HttpClient.get(API_CONFIG.ENDPOINTS.STAR_RECORDS, { userId });
    const cloudGroups = (starsData.groups || []).map(group => this._mapCloudGroup(group));
    const cloudRecords = (recordData.records || []).map(record => this._mapCloudRecord(record));

    await this._replaceSyncedStarGroups(userId, cloudGroups);
    await this._replaceSyncedStarRecords(userId, cloudRecords);

    logger.info('StarService', '已从云端刷新单用户星星数据', {
      userId,
      groupCount: cloudGroups.length,
      recordCount: cloudRecords.length
    });

    return {
      success: true,
      groups: cloudGroups,
      records: cloudRecords
    };
  }

  async _syncStarRecordToCloud(record) {
    if (!record) return;

    const payload = {
      recordId: record.id,
      userId: record.userId,
      type: record.type,
      source: record.source,
      sourceId: record.sourceId,
      points: record.points,
      description: record.description,
      expiryType: record.expiryType,
      expiryDate: record.expiryDate || null,
      originalTaskDate: record.originalTaskDate || null,
      requestedPoints: record.requestedPoints || null,
      modifyTime: record.modifyTime || record.timestamp || Date.now()
    };

    const response = await HttpClient.post(API_CONFIG.ENDPOINTS.STAR_RECORDS, payload);
    record.syncedToCloud = true;
    await this.starRecordRepository.save(record);

    const hasOtherPendingLocalRecords = await this.hasPendingLocalStarRecords(record.userId, {
      excludeRecordId: record.id
    });

    if (!hasOtherPendingLocalRecords && response && Array.isArray(response.updatedGroupsSnapshot) && record.userId) {
      const groups = response.updatedGroupsSnapshot.map(group => this._mapCloudGroup(group));
      await this._replaceSyncedStarGroups(record.userId, groups);
    }
  }

  async _syncConsumeToCloud(points, reason, options = {}) {
    const requestedPoints = Number(options.requestedPoints || points || 0);
    if (requestedPoints <= 0) {
      return;
    }

    const response = await HttpClient.post(API_CONFIG.ENDPOINTS.STAR_CONSUME, {
      userId: options.userId || null,
      requestedPoints,
      reason: reason || '通用扣星',
      sourceType: options.sourceType || 'system_consume',
      sourceId: options.sourceId || '',
      originalTaskDate: options.originalTaskDate || null,
      idempotencyKey: options.idempotencyKey ||
        `${options.sourceType || 'consume'}:${options.sourceId || 'manual'}:${Date.now()}`
    });

    if (response && Array.isArray(response.updatedGroupsSnapshot) && options.userId) {
      const groups = response.updatedGroupsSnapshot.map(group => this._mapCloudGroup({
        groupId: group.groupId,
        userId: options.userId,
        type: group.expiryType || group.type || 'permanent',
        stars: group.stars,
        expiryDate: group.expiryDate || null,
        modifyTime: Date.now()
      }));
      await this._replaceSyncedStarGroups(options.userId, groups);
    }
  }

  async _replaceSyncedStarGroups(userId, cloudGroups) {
    const allGroups = await this.starGroupRepository.getAll(false);
    const retainedGroups = allGroups.filter(group => group.userId !== userId);
    await this.starGroupRepository._saveData([...retainedGroups, ...cloudGroups]);
    this.starGroupRepository.invalidateCache();
  }

  async _replaceSyncedStarRecords(userId, cloudRecords, options = {}) {
    const allRecords = await this.starRecordRepository.getAll(false);
    const cloudRecordIds = new Set(cloudRecords.map(record => record.id).filter(Boolean));
    const cloudIdempotencyKeys = new Set(
      cloudRecords.map(record => record.idempotencyKey).filter(Boolean)
    );
    const retainedRecords = allRecords.filter(record => {
      const isTargetRecord = options.scope === 'family' ? true : record.userId === userId;
      if (!isTargetRecord) {
        return true;
      }

      if (cloudRecordIds.has(record.id)) {
        return false;
      }

      if (record.idempotencyKey && cloudIdempotencyKeys.has(record.idempotencyKey)) {
        return false;
      }

      if (options.scope === 'family') {
        return record.syncedToCloud !== true;
      }
      return record.userId !== userId || record.syncedToCloud !== true;
    });
    await this.starRecordRepository._saveData([...retainedRecords, ...cloudRecords]);
    this.starRecordRepository.invalidateCache();
  }

  _mapCloudGroup(group) {
    const expiryDateStr = group.expiryDate || '';
    const expiryTimestamp = expiryDateStr ? new Date(expiryDateStr).getTime() : null;
    return new StarGroup({
      id: group.groupId || group.id,
      userId: group.userId,
      type: group.type || group.expiryType || 'permanent',
      expiryType: group.type || group.expiryType || 'permanent',
      stars: Number(group.stars || 0),
      expiryDate: expiryTimestamp,
      expiryDateStr,
      syncedToCloud: true,
      lastUpdated: group.modifyTime || Date.now()
    });
  }

  _mapCloudRecord(record) {
    return new StarRecord({
      id: record.recordId || record.id,
      userId: record.userId,
      type: record.type,
      source: record.source,
      sourceId: record.sourceId || '',
      points: Number(record.points || 0),
      timestamp: record.modifyTime || Date.parse(record.createdAt || '') || Date.now(),
      description: record.description || '',
      expiryType: record.expiryType || null,
      expiryDate: record.expiryDate || null,
      balance: Number(record.balance || 0),
      previousBalance: Number(record.previousBalance || 0),
      originalTaskDate: record.originalTaskDate || null,
      requestedPoints: record.requestedPoints || null,
      syncedToCloud: true,
      idempotencyKey: record.idempotencyKey || null,
      modifyTime: record.modifyTime || Date.now(),
      data: record.data || {}
    });
  }

  _buildConsumeIdempotencyKey(options = {}) {
    if (options.idempotencyKey) {
      return options.idempotencyKey;
    }

    return [
      options.sourceType || 'consume',
      options.sourceId || 'manual',
      options.originalTaskDate || 'na',
      options.userId || 'anonymous',
      Date.now()
    ].join(':');
  }

  _buildGroupMergeKey(group) {
    return [
      group.userId || '',
      group.expiryType || group.type || '',
      group.expiryDateStr || group.expiryDate || ''
    ].join('|');
  }

  /**
   * 计算即将过期的星星数量（不实际清理）
   * @param {String} userId 可选的用户ID，不传则计算所有用户的即将过期星星
   * @returns {Promise<Number>} 即将过期的星星数量
   */
  async calculatePendingExpiry(userId = null) {
    try {
      // 获取所有分组
      const allGroups = await this.starGroupRepository.getAll();
      
      // 用户过滤
      const userGroups = userId ? allGroups.filter(group => group.userId === userId) : allGroups;
      
      // 当前时间
      const now = Date.now();
      
      // 找出即将过期的分组（未来48小时内过期）
      const pendingExpiryGroups = userGroups.filter(group => 
        group.expiryType !== StarExpiryType.PERMANENT && 
        group.expiryDate && 
        group.expiryDate > now && // 还没过期
        group.expiryDate <= (now + 48 * 60 * 60 * 1000) // 48小时内过期
      );
      
      // 计算即将过期总数量
      const pendingPoints = pendingExpiryGroups.reduce((sum, group) => sum + (group.stars || 0), 0);
      
      logger.info('StarService', `计算即将过期星星数量${userId ? `, 用户=${userId}` : ''}: ${pendingPoints}颗`);
      return pendingPoints;
    } catch (error) {
      logger.error('StarService', '计算即将过期星星数量失败', error);
      return 0;
    }
  }

  /**
   * 奖励过期保护：根据过期星星数量保护可兑换奖励
   * @param {Number} expiredStars 过期的星星数量
   * @param {String} userId 用户ID
   * @returns {Promise<Object>} 保护结果
   */
  async protectRewardsByExpiry(expiredStars, userId) {
    // 添加调试：方法开始
    logger.info('StarService', `🔍 保护调试开始: expiredStars=${expiredStars}, userId=${userId}`);
    
    if (!expiredStars || expiredStars <= 0) {
      logger.info('StarService', '无过期星星，跳过奖励保护');
      return { success: true, protectedCount: 0, protectedRewards: [] };
    }

    try {
      // 获取奖励服务
      const serviceManager = require('./service-manager');
      const rewardService = serviceManager.getService('rewardService');
      
      if (!rewardService) {
        logger.error('StarService', '无法获取奖励服务，跳过奖励保护');
        return { success: false, message: '奖励服务不可用' };
      }

      // 获取用户当前星星总数
      const totalStars = await this.getTotalStars(userId);
      logger.info('StarService', `🔍 用户当前星星状态: 当前=${totalStars}颗, 即将过期=${expiredStars}颗, 总可用=${totalStars + expiredStars}颗`);
      
      // 获取所有可用奖励
      const availableRewards = await rewardService.getAvailableRewards(false, false, userId);
      
      // 添加调试：奖励详情
      logger.info('StarService', `🔍 获取到${availableRewards.length}个可用奖励`);
      availableRewards.forEach((reward, index) => {
        logger.info('StarService', `🔍 奖励${index}: "${reward.name}", ${reward.points}颗, claimed=${reward.claimed}, protected=${reward.protectedByExpiry}, userId=${reward.userId}`);
      });
      
      // 筛选出可保护的奖励（当前星星+即将过期星星总额够用）
      const claimableRewards = availableRewards.filter(reward => {
        const totalAvailable = totalStars + expiredStars;
        const condition1 = totalAvailable >= reward.points;
        const condition2 = !reward.claimed;
        const condition3 = !reward.protectedByExpiry;
        
        // 添加调试：筛选过程
        logger.info('StarService', `🔍 筛选"${reward.name}": 总额够用=${condition1}(${totalAvailable}>=${reward.points}), 未领取=${condition2}, 未保护=${condition3}`);
        
        return condition1 && condition2 && condition3;
      });
      
      logger.info('StarService', `🔍 筛选结果: ${claimableRewards.length}个可保护奖励`);
      
      if (claimableRewards.length === 0) {
        logger.info('StarService', `无可保护奖励：当前${totalStars}颗+即将过期${expiredStars}颗=${totalStars + expiredStars}颗总星星`);
        return { success: true, protectedCount: 0, protectedRewards: [] };
      }
      
      logger.info('StarService', `找到${claimableRewards.length}个可保护奖励，总可用星星：${totalStars + expiredStars}颗（当前${totalStars}+过期${expiredStars}）`);
      
      // 按积分从高到低排序（优先保护高价值奖励）
      claimableRewards.sort((a, b) => b.points - a.points);
      
      // 优化后的保护逻辑：优先保护最高价值 + 支持部分保护
      let allocation = expiredStars;
      const currentStars = totalStars; // 当前所有可用星星（修复：即将过期的星星仍然可用）
      const protectedRewards = [];
      
      for (const reward of claimableRewards) {
        const totalAvailable = allocation + currentStars; // 过期+现有星星总额
        
        if (totalAvailable >= reward.points) {
          // 标记为保护奖励
          reward.protectedByExpiry = true;
          reward.partialProtection = Math.min(allocation, reward.points); // 记录保护金额
          allocation = Math.max(0, allocation - reward.partialProtection);
          protectedRewards.push(reward);
          
          logger.info('StarService', `保护奖励: ${reward.name}(${reward.points}颗星星), 保护金额=${reward.partialProtection}颗, 需额外支付=${reward.points - reward.partialProtection}颗`);
        }
      }
      
      // 保存保护状态到奖励数据
      for (const reward of protectedRewards) {
        await rewardService.updateReward(reward.id, { 
          protectedByExpiry: true,
          partialProtection: reward.partialProtection 
        });
      }
      
      logger.info('StarService', `奖励保护完成，保护了${protectedRewards.length}个奖励，使用${expiredStars - allocation}颗过期星星`);
      
      return {
        success: true,
        protectedCount: protectedRewards.length,
        protectedRewards: protectedRewards.map(r => ({ 
          id: r.id, 
          name: r.name, 
          points: r.points,
          partialProtection: r.partialProtection || 0
        })),
        usedExpiredStars: expiredStars - allocation
      };
    } catch (error) {
      logger.error('StarService', '奖励保护失败', error);
      return { success: false, message: '保护过程中发生错误' };
    }
  }

  /**
   * 清理过期星星
   * @param {String} userId 可选的用户ID，不传则清理所有用户的过期星星
   * @returns {Promise<Object>} 清理结果包含：success, expiredCount, totalPoints, records
   */
  async cleanupExpiredStars(userId = null) {
    try {
      // 清理过期分组
      const expiredGroups = await this.starGroupRepository.cleanupExpiredGroups(userId);
      
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
}

module.exports = StarService; 
