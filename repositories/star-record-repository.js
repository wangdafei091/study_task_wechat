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
   * @param {Array} records 要分组的记录数组
   * @param {Boolean} descending 是否降序排列（最新月份在前）
   * @returns {Array} 按月份分组的记录数组
   */
  groupByMonth(records, descending = true) {
    logger.info('StarRecordRepository', `开始按月份分组${records.length}条记录`);
    
    // 创建月份分组映射
    const monthGroups = {};
    
    // 遍历记录并分组
    records.forEach(record => {
      const date = new Date(record.timestamp);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
      
      if (!monthGroups[monthKey]) {
        monthGroups[monthKey] = {
          title: `${year}年${month}月`,
          records: []
        };
      }
      
      monthGroups[monthKey].records.push(record);
    });
    
    // 将对象转换为数组并按月份排序
    const result = Object.values(monthGroups).sort((a, b) => {
      const comparison = a.title.localeCompare(b.title);
      return descending ? -comparison : comparison;
    });
    
    logger.info('StarRecordRepository', `分组完成，共${result.length}个月份`);
    
    return result;
  }
  
  /**
   * 获取记录并按月份分组
   * @param {Object} options 选项
   * @param {Number} options.limit 限制数量
   * @param {Boolean} options.descending 是否降序排列
   * @returns {Promise<Array>} 按月份分组的记录数组
   */
  async getRecordsGroupedByMonth(options = {}) {
    logger.info('StarRecordRepository', '获取按月份分组的星星记录');
    
    try {
      // 获取所有记录，按时间排序
      const records = await this.getRecordsByTimeOrder(
        options.descending !== false, 
        options.limit || 0
      );
      
      // 按月份分组
      const groupedRecords = this.groupByMonth(records, options.descending !== false);
      
      logger.info('StarRecordRepository', `获取按月份分组的记录成功, 月份数=${groupedRecords.length}`);
      return groupedRecords;
    } catch (error) {
      logger.error('StarRecordRepository', '获取按月份分组的记录失败', error);
      return [];
    }
  }
  
  /**
   * 计算当前余额
   * @private
   * @returns {Promise<Number>} 当前余额
   */
  async _calculateCurrentBalance() {
    try {
      // 优先使用星星分组数据计算余额，确保数据一致性
      try {
        // 尝试获取星星分组总数作为当前余额
        const serviceManager = require('../services/service-manager');
        const starService = serviceManager.getStarService();
        
        if (starService && starService.starGroupRepository) {
          const groupTotal = await starService.starGroupRepository.getTotalPoints();
          logger.info('StarRecordRepository', `从星星分组获取当前余额: ${groupTotal}`);
          return groupTotal;
        }
      } catch (groupError) {
        logger.warn('StarRecordRepository', '无法从星星分组获取余额，使用记录计算', groupError);
      }
      
      // 如果无法从分组获取，则使用记录计算
      const records = await this.getAll();
      
      if (records.length === 0) {
        logger.info('StarRecordRepository', '没有星星记录，当前余额为0');
        return 0;
      }
      
      // 按时间戳排序，最新的记录在前
      const sortedRecords = [...records].sort((a, b) => b.timestamp - a.timestamp);
      
      // 如果最新记录有有效的余额字段，直接返回
      const latestRecord = sortedRecords[0];
      if (latestRecord.balance !== undefined && latestRecord.balance !== null && !isNaN(latestRecord.balance)) {
        logger.info('StarRecordRepository', `从最新记录获取余额: ${latestRecord.balance}`);
        return latestRecord.balance;
      }
      
      // 如果记录没有有效的余额字段，通过累计所有points计算
      logger.info('StarRecordRepository', '记录缺少余额字段，通过累计points计算余额');
      let totalBalance = 0;
      
      // 按时间顺序（从旧到新）累计计算
      const chronologicalRecords = [...records].sort((a, b) => a.timestamp - b.timestamp);
      
      for (const record of chronologicalRecords) {
        const points = Number(record.points || 0);
        totalBalance += points;
        logger.debug('StarRecordRepository', `累计计算: 记录points=${points}, 累计余额=${totalBalance}`);
      }
      
      logger.info('StarRecordRepository', `通过累计计算得到当前余额: ${totalBalance}`);
      return totalBalance;
    } catch (error) {
      logger.error('StarRecordRepository', '计算当前余额失败', error);
      return 0;
    }
  }
  
  /**
   * 创建消费记录
   * @param {Object} options 记录选项
   * @param {Number} options.stars 消费的星星数（正数）
   * @param {String} options.description 描述
   * @param {String} options.type 消费类型
   * @param {String} options.relatedId 相关ID
   * @returns {Promise<Object>} 创建结果
   */
  async createConsumptionRecord(options = {}) {
    if (!options.stars || options.stars <= 0) {
      logger.warn('StarRecordRepository', '尝试使用无效的星星数量创建消费记录');
      return null;
    }
    
    try {
      // 计算当前余额
      const previousBalance = await this._calculateCurrentBalance();
      const balance = previousBalance - options.stars;
      
      // 创建记录对象
      const record = new StarRecord({
        points: -options.stars, // 负数表示消费
        type: RecordType.EXPENSE,
        source: options.type || RecordSource.SYSTEM_ADJUST,
        sourceId: options.relatedId || '',
        description: options.description || '星星消费',
        timestamp: Date.now(),
        balance,
        previousBalance
      });
      
      // 保存记录
      const savedRecord = await this.save(record);
      
      logger.info('StarRecordRepository', `创建消费记录成功: ID=${savedRecord.id}, 星星数=${options.stars}, 类型=${options.type}`);
      return savedRecord;
    } catch (error) {
      logger.error('StarRecordRepository', '创建消费记录失败', error);
      return null;
    }
  }
  
  /**
   * 创建星星消费记录
   * @param {Object} record 消费记录对象
   * @returns {Promise<Object>} 创建的消费记录
   */
  async createStarConsumptionRecord(record) {
    if (!record) {
      logger.warn('StarRecordRepository', '创建消费记录失败: 记录数据为空');
      throw new Error('记录数据不能为空');
    }
    
    if (!record.amount || record.amount <= 0) {
      logger.warn('StarRecordRepository', `创建消费记录失败: 无效的数量 ${record.amount}`);
      throw new Error('消费数量无效');
    }
    
    try {
      logger.info('StarRecordRepository', `开始创建星星消费记录: 数量=${record.amount}, 类型=${record.type}, 来源=${record.source}`);
      
      // 计算当前余额
      const previousBalance = await this._calculateCurrentBalance();
      const balance = previousBalance - record.amount;
      
      logger.info('StarRecordRepository', `余额计算: 操作前=${previousBalance}, 消费=${record.amount}, 操作后=${balance}`);
      
      // 创建消费记录模型，修复参数映射问题
      const starRecord = new StarRecord({
        id: `star_record_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        points: -record.amount, // 修复：使用points而不是amount，消费记录为负数
        type: 'expense', // 修复：使用type而不是recordType，消费记录类型为expense
        source: record.source || 'reward', // 修复：设置正确的来源
        sourceId: record.source || '', // 添加sourceId
        description: `兑换奖励消费: ${record.data?.rewardName || '未知奖励'}`, // 添加描述
        timestamp: record.timestamp || Date.now(),
        balance, // 添加余额信息
        previousBalance, // 添加操作前余额信息
        data: record.data || {}
      });
      
      logger.info('StarRecordRepository', `StarRecord创建参数: points=${starRecord.points}, type=${starRecord.type}, source=${starRecord.source}, balance=${starRecord.balance}, previousBalance=${starRecord.previousBalance}`);
      
      // 验证记录数据
      const validationErrors = starRecord.validate();
      if (validationErrors.length > 0) {
        logger.error('StarRecordRepository', `StarRecord验证失败: ${validationErrors.join(', ')}`);
        throw new Error(`记录数据验证失败: ${validationErrors.join(', ')}`);
      }
      
      // 保存消费记录
      const savedRecord = await this.save(starRecord);
      
      if (!savedRecord) {
        throw new Error('保存消费记录失败');
      }
      
      logger.info('StarRecordRepository', `创建消费记录成功: ID=${savedRecord.id}, 数量=${Math.abs(savedRecord.points)}, 类型=${savedRecord.type}, 余额=${savedRecord.balance}`);
      
      return savedRecord;
    } catch (error) {
      logger.error('StarRecordRepository', '创建消费记录失败', error);
      throw error;
    }
  }
  
  /**
   * 创建消费记录
   * @param {Object} options 记录选项
   * @param {Number} options.stars 消费的星星数（正数）
   * @param {String} options.description 描述
   * @param {String} options.type 消费类型
   * @param {String} options.relatedId 相关ID
   * @returns {Promise<Object>} 创建结果
   * @deprecated 使用createStarConsumptionRecord代替
   */
  async createConsumptionRecord(options = {}) {
    logger.warn('StarRecordRepository', '使用已废弃的createConsumptionRecord方法，请使用createStarConsumptionRecord代替');
    
    // 简化实现，避免循环依赖
    return this.createStarConsumptionRecord({
      amount: options.stars,
      type: 'consumption',
      source: options.type || 'manual',
      description: options.description || '星星消费',
      timestamp: Date.now(),
      data: {
        relatedId: options.relatedId
      }
    });
  }

  /**
   * 修复历史记录的余额信息
   * @returns {Promise<Object>} 修复结果
   */
  async repairRecordBalances() {
    logger.info('StarRecordRepository', '开始修复历史记录的余额信息');
    
    try {
      const records = await this.getAll();
      
      if (records.length === 0) {
        logger.info('StarRecordRepository', '没有记录需要修复');
        return { success: true, repairedCount: 0 };
      }
      
      // 按时间顺序排序（从旧到新）
      const chronologicalRecords = [...records].sort((a, b) => a.timestamp - b.timestamp);
      
      let runningBalance = 0;
      let repairedCount = 0;
      const repairedRecords = [];
      
      for (const record of chronologicalRecords) {
        const points = Number(record.points || 0);
        const previousBalance = runningBalance;
        runningBalance += points;
        
        // 检查是否需要修复
        const needsRepair = record.balance !== runningBalance || record.previousBalance !== previousBalance;
        
        if (needsRepair) {
          record.balance = runningBalance;
          record.previousBalance = previousBalance;
          repairedRecords.push(record);
          repairedCount++;
          
          logger.info('StarRecordRepository', `修复记录 ${record.id}: points=${points}, previousBalance=${previousBalance}, balance=${runningBalance}`);
        }
      }
      
      if (repairedCount > 0) {
        // 批量保存修复后的记录
        await this.saveAll(repairedRecords);
        logger.info('StarRecordRepository', `余额修复完成，共修复${repairedCount}条记录`);
      } else {
        logger.info('StarRecordRepository', '所有记录的余额信息都是正确的，无需修复');
      }
      
      return { success: true, repairedCount };
    } catch (error) {
      logger.error('StarRecordRepository', '修复历史记录余额失败', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 清除缓存
   * 强制下次查询时重新从存储中获取数据
   */
  clearCache() {
    logger.info('StarRecordRepository', '清除星星记录仓储缓存');
    
    // 调用父类的清除缓存方法
    if (super.clearCache) {
      super.clearCache();
    }
    
    // 清除存储适配器缓存
    if (this.storageAdapter && this.storageAdapter.clearCache) {
      this.storageAdapter.clearCache();
    }
  }
}

module.exports = StarRecordRepository; 