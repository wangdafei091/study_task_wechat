/**
 * star-service.js - 星星服务
 * 
 * 提供星星相关的业务逻辑，包括星星的获取、消费和过期处理
 */

const logger = require('../utils/logger');
const { StarGroupRepository, StarRecordRepository } = require('../repositories/index');
const EventBus = require('../utils/core/event-bus');
const API_CONFIG = require('../utils/api-config');
const starUtils = require('./star-service/star-utils');
const starRecords = require('./star-service/star-records');
const starWrite = require('./star-service/star-write');
const starCloud = require('./star-service/star-cloud');
const starExpiry = require('./star-service/star-expiry');

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
    this.rewardService = options.rewardService || null;

    this.enableCloudStorage = API_CONFIG.ENABLE_API;
    this._cloudRefreshInFlight = new Map();
    this._expiryAuthoritySyncTimestamps = new Map();
    this._expiryAuthoritySyncInFlight = new Map();
    this._familySummaryInFlight = null;
    this._familySummaryCache = null;
    
    logger.info('StarService', '初始化星星服务，已注入余额计算器到StarRecordRepository');
  }
  
  /**
   * 初始化服务
   * @returns {Promise<Boolean>} 初始化结果
   */
  async initialize() {
    try {
      if (this.enableCloudStorage) {
        logger.info('StarService', '云端模式跳过本地过期星星初始化清理');
        return true;
      }

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
    return starRecords.getStarGroups(this, userId);
  }
  
  /**
   * 获取用户总星星数量
   * @param {String} userId 可选的用户ID，不传则获取所有用户的星星
   * @returns {Promise<Number>} 星星总数量
   */
  async getTotalStars(userId = null) {
    return starRecords.getTotalStars(this, userId);
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
    return starRecords.getStarRecords(this, options);
  }
  
  /**
   * 获取星星记录按月份分组
   * @param {String} userId 可选的用户ID，不传则获取所有用户的记录
   * @returns {Promise<Object>} 按月份分组的记录
   */
  async getStarRecordsByMonth(userId = null) {
    return starRecords.getStarRecordsByMonth(this, userId);
  }
  
  /**
   * 获取特定日期范围的星星记录
   * @param {String} startDate 开始日期字符串（YYYY-MM-DD格式）
   * @param {String} endDate 结束日期字符串（YYYY-MM-DD格式）
   * @param {String} userId 可选的用户ID，不传则获取所有用户的记录
   * @returns {Promise<Array>} 符合条件的记录列表
   */
  async getStarRecordsByDateRange(startDate, endDate, userId = null) {
    return starRecords.getStarRecordsByDateRange(this, startDate, endDate, userId);
  }
  
  /**
   * 获取特定日期的星星记录
   * @param {String} date 日期字符串（YYYY-MM-DD格式）
   * @param {String} userId 可选的用户ID，不传则获取所有用户的记录
   * @returns {Promise<Array>} 符合条件的记录列表
   */
  async getStarRecordsByDate(date, userId = null) {
    return starRecords.getStarRecordsByDate(this, date, userId);
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
    return starWrite.addStars(this, points, expiryType, source, options);
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
    return starWrite.consumeStars(this, points, reason, options);
  }
  
  /**
   * 处理任务完成奖励
   * @param {Object} task 任务对象
   * @param {Number} points 星星数量
   * @returns {Promise<Object>} 处理结果
   */
  async handleTaskCompletion(task, points) {
    return starWrite.handleTaskCompletion(this, task, points);
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
    return starWrite.consumeStarsUnified(this, params);
  }

  /**
   * 获取过期类型描述
   * @private
   * @param {String} expiryType 过期类型
   * @returns {String} 过期类型描述
   */
  _getExpiryTypeDescription(expiryType) {
    return starUtils.getExpiryTypeDescription(this, expiryType);
  }
  
  /**
   * 计算积分有效期日期（公开方法）
   * @param {String} expiryType 有效期类型
   * @returns {Object} 包含时间戳和可读格式的有效期信息
   */
  calculateExpiryDate(expiryType) {
    return starUtils.calculateExpiryDate(this, expiryType);
  }

  /**
   * 获取有效期类型的文本描述（公开方法）
   * @param {String} expiryType 有效期类型
   * @returns {String} 有效期文本描述
   */
  getExpiryText(expiryType) {
    return starUtils.getExpiryText(this, expiryType);
  }

  /**
   * 格式化过期日期为可读格式
   * @private
   * @param {Date} expiryDate 过期日期
   * @returns {String} 格式化后的日期字符串
   */
  _formatExpiryDate(expiryDate) {
    return starUtils.formatExpiryDate(this, expiryDate);
  }

  _buildEndOfDayDate(year, monthIndex, day) {
    return starUtils.buildEndOfDayDate(this, year, monthIndex, day);
  }

  _parseExpiryDateValue(expiryValue) {
    return starUtils.parseExpiryDateValue(this, expiryValue);
  }

  _normalizeExpiryDateValue(expiryValue) {
    return starUtils.normalizeExpiryDateValue(this, expiryValue);
  }

  _resolveExpiryMetadata(expiryValue, fallbackDisplayText = '') {
    return starUtils.resolveExpiryMetadata(this, expiryValue, fallbackDisplayText);
  }

  /**
   * 计算过期日期
   * @private
   * @param {String} expiryType 过期类型
   * @returns {Date|null} 过期日期对象，null表示永不过期
   */
  _calculateExpiryDate(expiryType) {
    return starUtils.calculateExpiryDateInternal(this, expiryType);
  }
  
  /**
   * 验证星星数据一致性
   * @returns {Promise<Object>} 验证结果
   */
  async validateConsistency() {
    return starRecords.validateConsistency(this);
  }

  /**
   * 根据记录计算余额
   * @private
   * @param {Array} records 星星记录
   * @returns {Object} 计算结果
   */
  _calculateBalanceFromRecords(records) {
    return starRecords.calculateBalanceFromRecords(this, records);
  }
  
  /**
   * 格式化星星数量
   * @param {Number} points 要格式化的星星数量
   * @param {Boolean} useThousandSeparator 是否使用千位分隔符
   * @returns {String} 格式化后的星星数量字符串
   */
  formatStarCount(points, useThousandSeparator = false) {
    return starUtils.formatStarCount(this, points, useThousandSeparator);
  }

  /**
   * 获取即将过期的星星信息
   * @param {String} userId 可选的用户ID，不传则统计全部用户
   * @returns {Promise<Object>} 包含过期星星数和最早过期日期的对象
   */
  async getExpiringStarsInfo(userId = null) {
    return starExpiry.getExpiringStarsInfo(this, userId);
  }

  /**
   * 获取当前可用星星快照
   * @param {String} userId 用户ID
   * @returns {Promise<Object>} 当前可用星星聚合视图
   */
  async getAvailableStarSnapshot(userId = null) {
    return starExpiry.getAvailableStarSnapshot(this, userId);
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
    return starWrite.consumeStarsFromSpecificType(this, points, expiryType, reason, options);
  }

  /**
   * 修复星星记录的余额信息
   * @returns {Promise<Object>} 修复结果
   */
  async repairStarRecordBalances() {
    return starRecords.repairStarRecordBalances(this);
  }

  /**
   * 检查并自动修复数据一致性
   * @returns {Promise<Object>} 检查和修复结果
   */
  async checkAndRepairDataConsistency() {
    return starRecords.checkAndRepairDataConsistency(this);
  }

  /**
   * 实时验证星星操作后的数据一致性
   * @param {String} operation 操作类型
   * @param {Object} operationData 操作数据
   * @returns {Promise<Boolean>} 是否一致
   */
  async verifyOperationConsistency(operation, operationData = {}) {
    return starRecords.verifyOperationConsistency(this, operation, operationData);
  }

  /**
   * 计算每条记录的星星余额
   * @param {Array} records 星星记录列表
   * @param {Number} currentBalance 当前余额
   * @returns {Array} 包含余额信息的记录列表
   */
  calculateRecordBalance(records, currentBalance) {
    return starRecords.calculateRecordBalance(this, records, currentBalance);
  }

  /**
   * 计算月度汇总信息
   * @param {Array} groupedRecords 按月分组的记录
   * @returns {Array} 包含月度汇总的分组记录
   */
  calculateMonthSummary(groupedRecords) {
    return starRecords.calculateMonthSummary(this, groupedRecords);
  }

  /**
   * 按月份分组记录
   * @param {Array} records 星星记录列表
   * @returns {Array} 按月分组的记录
   */
  groupRecordsByMonth(records) {
    return starRecords.groupRecordsByMonth(this, records);
  }

  /**
   * 根据条件筛选记录
   * @param {Array} records 原始记录列表
   * @param {String} typeFilter 类型筛选条件
   * @param {String} timeFilter 时间筛选条件
   * @returns {Array} 筛选后的记录列表
   */
  filterRecords(records, typeFilter, timeFilter) {
    return starRecords.filterRecords(this, records, typeFilter, timeFilter);
  }

  buildStarRecordViewModel(records, options = {}) {
    return starRecords.buildStarRecordViewModel(this, records, options);
  }

  /**
   * 清除缓存
   * 强制下次查询时重新从存储中获取数据
   */
  clearCache() {
    return starRecords.clearCache(this);
  }

  async hasPendingLocalStarRecords(userId = null, options = {}) {
    return starCloud.hasPendingLocalStarRecords(this, userId, options);
  }

  async refreshStarsFromCloud(userId = null, options = {}) {
    return starCloud.refreshStarsFromCloud(this, userId, options);
  }

  async getFamilyStarSummary(options = {}) {
    return starCloud.getFamilyStarSummary(this, options);
  }

  async _fetchStarsFromCloud(userId = null, options = {}) {
    return starCloud.fetchStarsFromCloud(this, userId, options);
  }

  _buildExpiryAuthorityScopeKey(options = {}) {
    return starCloud.buildExpiryAuthorityScopeKey(this, options);
  }

  async syncExpiryAuthorityIfNeeded(options = {}) {
    return starCloud.syncExpiryAuthorityIfNeeded(this, options);
  }

  async _syncStarRecordToCloud(record) {
    return starCloud.syncStarRecordToCloud(this, record);
  }

  async _syncConsumeToCloud(points, reason, options = {}) {
    return starCloud.syncConsumeToCloud(this, points, reason, options);
  }

  async _replaceSyncedStarGroups(userId, cloudGroups) {
    return starCloud.replaceSyncedStarGroups(this, userId, cloudGroups);
  }

  async _replaceSyncedStarRecords(userId, cloudRecords, options = {}) {
    return starCloud.replaceSyncedStarRecords(this, userId, cloudRecords, options);
  }

  _mapCloudGroup(group) {
    return starCloud.mapCloudGroup(this, group);
  }

  _mapCloudRecord(record) {
    return starCloud.mapCloudRecord(this, record);
  }

  _buildConsumeIdempotencyKey(options = {}) {
    return starCloud.buildConsumeIdempotencyKey(this, options);
  }

  _buildGroupMergeKey(group) {
    return starCloud.buildGroupMergeKey(this, group);
  }

  _isGroupWithinReminderWindow(group, nowTimestamp = Date.now()) {
    return starExpiry.isGroupWithinReminderWindow(this, group, nowTimestamp);
  }

  /**
   * 计算即将过期的星星数量（不实际清理）
   * @param {String} userId 可选的用户ID，不传则计算所有用户的即将过期星星
   * @returns {Promise<Number>} 即将过期的星星数量
   */
  async calculatePendingExpiry(userId = null) {
    return starExpiry.calculatePendingExpiry(this, userId);
  }

  /**
   * 奖励过期保护：根据过期星星数量保护可兑换奖励
   * @param {Number} expiredStars 过期的星星数量
   * @param {String} userId 用户ID
   * @returns {Promise<Object>} 保护结果
   */
  async protectRewardsByExpiry(expiredStars, userId) {
    return starExpiry.protectRewardsByExpiry(this, expiredStars, userId);
  }

  updateRewardService(rewardService) {
    if (this.rewardService !== rewardService) {
      this.rewardService = rewardService || null;
      logger.info('StarService', 'RewardService已更新');
    }
  }

  /**
   * 清理过期星星
   * @param {String} userId 可选的用户ID，不传则清理所有用户的过期星星
   * @returns {Promise<Object>} 清理结果包含：success, expiredCount, totalPoints, records
   */
  async cleanupExpiredStars(userId = null) {
    return starExpiry.cleanupExpiredStars(this, userId);
  }
}

module.exports = StarService; 
