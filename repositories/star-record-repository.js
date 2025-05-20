/**
 * star-record-repository.js - 星星记录仓储
 * 
 * 提供星星记录实体的存储和检索，继承自基础仓储类
 */

const BaseRepository = require('./base-repository');
const { StarRecord, RecordType, RecordSource } = require('../models/star-record');
const logger = require('../utils/logger');

class StarRecordRepository extends BaseRepository {
  /**
   * 构造函数
   * @param {StorageAdapter} storageAdapter 可选的存储适配器
   * @param {Object} options 选项
   */
  constructor(storageAdapter, options = {}) {
    const storageKey = options.storageKey || 'starRecords';
    super(storageKey, StarRecord, {
      namespace: options.namespace || '',
      useCache: options.useCache !== false,
      cacheExpiry: options.cacheExpiry || 60000,
      cacheTTL: options.cacheTTL || 10000
    });
    
    // 如果提供了存储适配器，则使用它替换默认的
    if (storageAdapter) {
      this.storageAdapter = storageAdapter;
    }
    
    logger.info('StarRecordRepository', '初始化星星记录仓储');
  }
  
  /**
   * 获取特定类型的记录
   * @param {String} type 记录类型
   * @returns {Promise<Array>} 符合条件的记录列表
   */
  async getRecordsByType(type) {
    if (!type) {
      logger.warn('StarRecordRepository', '尝试使用无效的类型获取记录');
      return [];
    }
    
    try {
      const records = await this.query(record => record.type === type);
      
      logger.info('StarRecordRepository', `获取类型=${type}的记录成功, 数量=${records.length}`);
      return records;
    } catch (error) {
      logger.error('StarRecordRepository', `获取类型=${type}的记录失败`, error);
      return [];
    }
  }
  
  /**
   * 获取特定来源的记录
   * @param {String} source 记录来源
   * @param {String} sourceId 来源ID
   * @returns {Promise<Array>} 符合条件的记录列表
   */
  async getRecordsBySource(source, sourceId) {
    if (!source) {
      logger.warn('StarRecordRepository', '尝试使用无效的来源获取记录');
      return [];
    }
    
    try {
      const records = await this.query(record => {
        if (sourceId) {
          return record.source === source && record.sourceId === sourceId;
        }
        return record.source === source;
      });
      
      logger.info('StarRecordRepository', `获取来源=${source}${sourceId ? `, 来源ID=${sourceId}` : ''}的记录成功, 数量=${records.length}`);
      return records;
    } catch (error) {
      logger.error('StarRecordRepository', `获取来源=${source}的记录失败`, error);
      return [];
    }
  }
  
  /**
   * 获取特定日期的记录
   * @param {String} date 日期字符串（YYYY-MM-DD格式）
   * @returns {Promise<Array>} 符合条件的记录列表
   */
  async getRecordsByDate(date) {
    if (!date) {
      logger.warn('StarRecordRepository', '尝试使用无效的日期获取记录');
      return [];
    }
    
    try {
      const records = await this.query(record => {
        return record.getDate() === date;
      });
      
      logger.info('StarRecordRepository', `获取日期=${date}的记录成功, 数量=${records.length}`);
      return records;
    } catch (error) {
      logger.error('StarRecordRepository', `获取日期=${date}的记录失败`, error);
      return [];
    }
  }
  
  /**
   * 获取特定日期范围的记录
   * @param {String} startDate 开始日期字符串（YYYY-MM-DD格式）
   * @param {String} endDate 结束日期字符串（YYYY-MM-DD格式）
   * @returns {Promise<Array>} 符合条件的记录列表
   */
  async getRecordsByDateRange(startDate, endDate) {
    if (!startDate || !endDate) {
      logger.warn('StarRecordRepository', '尝试使用无效的日期范围获取记录');
      return [];
    }
    
    try {
      const records = await this.query(record => {
        const recordDate = record.getDate();
        return recordDate >= startDate && recordDate <= endDate;
      });
      
      logger.info('StarRecordRepository', `获取日期范围=${startDate}至${endDate}的记录成功, 数量=${records.length}`);
      return records;
    } catch (error) {
      logger.error('StarRecordRepository', `获取日期范围=${startDate}至${endDate}的记录失败`, error);
      return [];
    }
  }
  
  /**
   * 获取特定月份的记录
   * @param {String} month 月份字符串（YYYY-MM格式）
   * @returns {Promise<Array>} 符合条件的记录列表
   */
  async getRecordsByMonth(month) {
    if (!month) {
      logger.warn('StarRecordRepository', '尝试使用无效的月份获取记录');
      return [];
    }
    
    try {
      const records = await this.query(record => {
        return record.getMonth() === month;
      });
      
      logger.info('StarRecordRepository', `获取月份=${month}的记录成功, 数量=${records.length}`);
      return records;
    } catch (error) {
      logger.error('StarRecordRepository', `获取月份=${month}的记录失败`, error);
      return [];
    }
  }
  
  /**
   * 获取类型和日期的记录
   * @param {String} type 记录类型
   * @param {String} date 日期字符串（YYYY-MM-DD格式）
   * @returns {Promise<Array>} 符合条件的记录列表
   */
  async getRecordsByTypeAndDate(type, date) {
    if (!type || !date) {
      logger.warn('StarRecordRepository', '尝试使用无效的类型或日期获取记录');
      return [];
    }
    
    try {
      const records = await this.query(record => {
        return record.type === type && record.getDate() === date;
      });
      
      logger.info('StarRecordRepository', `获取类型=${type}, 日期=${date}的记录成功, 数量=${records.length}`);
      return records;
    } catch (error) {
      logger.error('StarRecordRepository', `获取类型=${type}, 日期=${date}的记录失败`, error);
      return [];
    }
  }
  
  /**
   * 按时间顺序获取记录
   * @param {Boolean} descending 是否降序排序（新的在前）
   * @param {Number} limit 限制返回的记录数量，0表示不限制
   * @returns {Promise<Array>} 排序后的记录列表
   */
  async getRecordsByTimeOrder(descending = true, limit = 0) {
    try {
      const records = await this.getAll();
      
      // 按时间戳排序
      const sortedRecords = [...records].sort((a, b) => {
        return descending ? b.timestamp - a.timestamp : a.timestamp - b.timestamp;
      });
      
      // 限制数量
      const limitedRecords = limit > 0 ? sortedRecords.slice(0, limit) : sortedRecords;
      
      logger.info('StarRecordRepository', `按时间${descending ? '降序' : '升序'}获取记录成功, 数量=${limitedRecords.length}`);
      return limitedRecords;
    } catch (error) {
      logger.error('StarRecordRepository', `按时间顺序获取记录失败`, error);
      return [];
    }
  }
  
  /**
   * 创建任务完成的收入记录
   * @param {String} taskId 任务ID
   * @param {Number} points 获得的星星数
   * @param {String} description 描述
   * @returns {Promise<StarRecord>} 创建的记录
   */
  async createTaskCompleteRecord(taskId, points, description) {
    if (!taskId || points <= 0) {
      logger.warn('StarRecordRepository', '尝试使用无效参数创建任务完成记录');
      return null;
    }
    
    try {
      // 计算当前余额
      const previousBalance = await this._calculateCurrentBalance();
      const balance = previousBalance + points;
      
      // 创建记录
      const record = StarRecord.createTaskCompleteRecord(
        points,
        taskId,
        description,
        balance,
        previousBalance
      );
      
      // 保存记录
      const savedRecord = await this.save(record);
      
      logger.info('StarRecordRepository', `创建任务完成记录成功, ID=${savedRecord.id}, 任务ID=${taskId}, 星星数=${points}`);
      return savedRecord;
    } catch (error) {
      logger.error('StarRecordRepository', `创建任务完成记录失败, 任务ID=${taskId}`, error);
      return null;
    }
  }
  
  /**
   * 创建奖励兑换的支出记录
   * @param {String} rewardId 奖励ID
   * @param {Number} points 消费的星星数（正数，会自动转为负数）
   * @param {String} description 描述
   * @returns {Promise<StarRecord>} 创建的记录
   */
  async createRewardExchangeRecord(rewardId, points, description) {
    if (!rewardId || points <= 0) {
      logger.warn('StarRecordRepository', '尝试使用无效参数创建奖励兑换记录');
      return null;
    }
    
    try {
      // 计算当前余额
      const previousBalance = await this._calculateCurrentBalance();
      const balance = previousBalance - points;
      
      // 创建记录
      const record = StarRecord.createRewardExchangeRecord(
        points,
        rewardId,
        description,
        balance,
        previousBalance
      );
      
      // 保存记录
      const savedRecord = await this.save(record);
      
      logger.info('StarRecordRepository', `创建奖励兑换记录成功, ID=${savedRecord.id}, 奖励ID=${rewardId}, 星星数=${points}`);
      return savedRecord;
    } catch (error) {
      logger.error('StarRecordRepository', `创建奖励兑换记录失败, 奖励ID=${rewardId}`, error);
      return null;
    }
  }
  
  /**
   * 创建星星过期的记录
   * @param {Number} points 过期的星星数（正数，会自动转为负数）
   * @param {String} expiryType 过期类型
   * @param {String} description 描述
   * @returns {Promise<StarRecord>} 创建的记录
   */
  async createExpiredRecord(points, expiryType, description) {
    if (points <= 0) {
      logger.warn('StarRecordRepository', '尝试使用无效参数创建星星过期记录');
      return null;
    }
    
    try {
      // 计算当前余额
      const previousBalance = await this._calculateCurrentBalance();
      const balance = previousBalance - points;
      
      // 创建记录
      const record = StarRecord.createExpiredRecord(
        points,
        expiryType,
        description,
        balance,
        previousBalance
      );
      
      // 保存记录
      const savedRecord = await this.save(record);
      
      logger.info('StarRecordRepository', `创建星星过期记录成功, ID=${savedRecord.id}, 类型=${expiryType}, 星星数=${points}`);
      return savedRecord;
    } catch (error) {
      logger.error('StarRecordRepository', `创建星星过期记录失败`, error);
      return null;
    }
  }
  
  /**
   * 创建必做任务惩罚记录
   * @param {String} taskId 任务ID
   * @param {Number} points 扣除的星星数（正数，会自动转为负数）
   * @param {String} description 描述
   * @returns {Promise<StarRecord>} 创建的记录
   */
  async createPenaltyRecord(taskId, points, description) {
    if (!taskId || points <= 0) {
      logger.warn('StarRecordRepository', '尝试使用无效参数创建必做任务惩罚记录');
      return null;
    }
    
    try {
      // 计算当前余额
      const previousBalance = await this._calculateCurrentBalance();
      const balance = previousBalance - points;
      
      // 创建记录
      const record = StarRecord.createPenaltyRecord(
        points,
        taskId,
        description,
        balance,
        previousBalance
      );
      
      // 保存记录
      const savedRecord = await this.save(record);
      
      logger.info('StarRecordRepository', `创建必做任务惩罚记录成功, ID=${savedRecord.id}, 任务ID=${taskId}, 星星数=${points}`);
      return savedRecord;
    } catch (error) {
      logger.error('StarRecordRepository', `创建必做任务惩罚记录失败, 任务ID=${taskId}`, error);
      return null;
    }
  }
  
  /**
   * 按月份分组记录
   * @param {Array} records 记录列表
   * @returns {Object} 按月份分组的记录对象
   */
  groupRecordsByMonth(records) {
    if (!Array.isArray(records)) {
      return {};
    }
    
    const groups = {};
    
    records.forEach(record => {
      const month = record.getMonth();
      
      if (!groups[month]) {
        groups[month] = [];
      }
      
      groups[month].push(record);
    });
    
    // 按月份降序排序
    const sortedGroups = {};
    Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .forEach(month => {
        sortedGroups[month] = groups[month];
      });
    
    return sortedGroups;
  }
  
  /**
   * 计算当前余额
   * @private
   * @returns {Promise<Number>} 当前余额
   */
  async _calculateCurrentBalance() {
    try {
      const records = await this.getAll();
      
      if (records.length === 0) {
        return 0;
      }
      
      // 按时间戳排序，最新的记录在前
      const sortedRecords = [...records].sort((a, b) => b.timestamp - a.timestamp);
      
      // 返回最新记录的余额
      return sortedRecords[0].balance;
    } catch (error) {
      logger.error('StarRecordRepository', '计算当前余额失败', error);
      return 0;
    }
  }
}

module.exports = StarRecordRepository; 