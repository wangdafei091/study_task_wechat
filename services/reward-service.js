/**
 * reward-service.js - 奖励服务
 *
 * 提供奖励相关的业务逻辑
 */

const logger = require('../utils/logger');
const { RewardRepository, StarGroupRepository, StarRecordRepository } = require('../repositories/index');
const EventBus = require('../utils/core/event-bus');
const API_CONFIG = require('../utils/api-config');
const rewardContext = require('./reward-service/reward-context');
const rewardQueue = require('./reward-service/reward-queue');
const rewardQuery = require('./reward-service/reward-query');
const rewardWrite = require('./reward-service/reward-write');
const rewardCloud = require('./reward-service/reward-cloud');
const rewardExchange = require('./reward-service/reward-exchange');

class RewardService {
  static _initialized = false;
  static _initializationPromise = null;

  constructor(options = {}) {
    this.rewardRepository = options.rewardRepository || new RewardRepository();
    this.starGroupRepository = options.starGroupRepository || new StarGroupRepository();
    this.starRecordRepository = options.starRecordRepository || new StarRecordRepository();

    this.starService = options.starService || null;
    this.userService = options.userService;
    this.configService = options.configService || null;
    this.storageAdapter = options.storageAdapter;
    this.offlineQueueService = options.offlineQueueService || null;

    this.eventBus = options.eventBus || new EventBus();

    this.initialized = false;
    this.enableCloudStorage = API_CONFIG.ENABLE_API;
    this._lastCloudRewardsSyncTimes = new Map();
    this._cloudRewardsRefreshInFlight = new Map();

    logger.info('RewardService', '构造奖励服务实例');
  }

  async _getUserAvailableStars(userId = null, options = {}) {
    return rewardContext.getUserAvailableStars(this, userId, options);
  }

  async initialize() {
    if (RewardService._initialized) {
      logger.info('RewardService', '奖励服务已初始化，跳过');
      this.initialized = true;
      return;
    }

    if (RewardService._initializationPromise) {
      logger.info('RewardService', '奖励服务正在初始化中，等待完成');
      await RewardService._initializationPromise;
      this.initialized = true;
      return;
    }

    logger.info('RewardService', '开始初始化奖励服务');

    RewardService._initializationPromise = (async () => {
      try {
        if (this.enableCloudStorage) {
          RewardService._initialized = true;
          logger.info('RewardService', '云端模式下跳过默认奖励初始化，等待页面进入时拉取云端奖励');
          return;
        }

        try {
          await this.rewardRepository.loadFromStorage();
          logger.info('RewardService', '从本地存储加载奖励数据成功');
        } catch (error) {
          logger.warn('RewardService', '从本地存储加载奖励数据失败', error);
        }

        const rewardsCount = await this.rewardRepository.count();

        let hasCustomRewards = false;
        try {
          if (this.configService && typeof this.configService.hasCustomRewards === 'function') {
            hasCustomRewards = this.configService.hasCustomRewards();
          } else if (this.storageAdapter) {
            hasCustomRewards = this.storageAdapter.get('has_custom_rewards') === true;
          }
        } catch (error) {
          logger.warn('RewardService', '获取自定义奖励标记失败', error);
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

        RewardService._initialized = true;
        logger.info('RewardService', '服务初始化完成');
      } catch (error) {
        logger.error('RewardService', '初始化服务失败', error);
        RewardService._initialized = false;
        throw error;
      }
    })();

    try {
      await RewardService._initializationPromise;
      this.initialized = true;
    } catch (error) {
      this.initialized = false;
      throw error;
    } finally {
      RewardService._initializationPromise = null;
    }
  }

  _createOperationKey(seed = null) {
    return rewardContext.createOperationKey(this, seed);
  }

  _getUserContextInput() {
    return rewardContext.getUserContextInput(this);
  }

  _getOperatorContext(targetUserId = null, mode = 'manage') {
    return rewardContext.getOperatorContext(this, targetUserId, mode);
  }

  _buildRewardPendingSyncMeta(reward, action, overrides = {}) {
    return rewardContext.buildRewardPendingSyncMeta(this, reward, action, overrides);
  }

  updateOfflineQueueService(offlineQueueService) {
    rewardQueue.updateOfflineQueueService(this, offlineQueueService);
  }

  _buildOfflineQueueContextFromPendingSyncMeta(pendingSyncMeta = {}) {
    return rewardContext.buildOfflineQueueContextFromPendingSyncMeta(this, pendingSyncMeta);
  }

  async _enqueueRewardMutation(action, reward, extra = {}) {
    return rewardQueue.enqueueRewardMutation(this, action, reward, extra);
  }

  async _executeRewardQueueItem(item) {
    return rewardQueue.executeRewardQueueItem(this, item);
  }

  async buildLegacyQueueCandidates() {
    return rewardQueue.buildLegacyQueueCandidates(this);
  }

  async _markRewardSynced(reward, overrides = {}) {
    return rewardQueue.markRewardSynced(this, reward, overrides);
  }

  async _emitRewardCloudSyncFailure(action, reward, error, extra = {}) {
    return rewardQueue.emitRewardCloudSyncFailure(this, action, reward, error, extra);
  }

  async _getDeleteTombstones() {
    return rewardQueue.getDeleteTombstones(this);
  }

  async _saveDeleteTombstone(tombstone) {
    return rewardQueue.saveDeleteTombstone(this, tombstone);
  }

  async _removeDeleteTombstone(entityId) {
    return rewardQueue.removeDeleteTombstone(this, entityId);
  }

  async _flushPendingRewardSyncs() {
    return rewardQueue.flushPendingRewardSyncs(this);
  }

  async getAllRewards(userId = null) {
    return rewardQuery.getAllRewards(this, userId);
  }

  async getClaimedRewards(userId = null) {
    return rewardQuery.getClaimedRewards(this, userId);
  }

  async createReward(rewardData) {
    return rewardWrite.createReward(this, rewardData);
  }

  async updateReward(rewardId, rewardData) {
    return rewardWrite.updateReward(this, rewardId, rewardData);
  }

  async deleteReward(rewardId) {
    return rewardWrite.deleteReward(this, rewardId);
  }

  async toggleRewardStatus(rewardId, enabled) {
    return rewardWrite.toggleRewardStatus(this, rewardId, enabled);
  }

  async getAvailableRewards(includeClaimed = false, includeExamples = false, userId = null) {
    return rewardQuery.getAvailableRewards(this, includeClaimed, includeExamples, userId);
  }

  async refreshRewardsFromCloud(options = {}) {
    return rewardCloud.refreshRewardsFromCloud(this, options);
  }

  async _fetchRewardsFromCloud(options = {}) {
    return rewardCloud.fetchRewardsFromCloud(this, options);
  }

  async _syncRewardToCloud(reward) {
    return rewardCloud.syncRewardToCloud(this, reward);
  }

  async _syncDeleteRewardToCloud(rewardId, deleteMeta = null) {
    return rewardCloud.syncDeleteRewardToCloud(this, rewardId, deleteMeta);
  }

  async _syncExchangeToCloud(rewardId, exchangeUserId, modifyTime, reward = null) {
    return rewardCloud.syncExchangeToCloud(this, rewardId, exchangeUserId, modifyTime, reward);
  }

  async _syncCancelExchangeToCloud(rewardId, exchangeUserId, modifyTime, reward = null) {
    return rewardCloud.syncCancelExchangeToCloud(this, rewardId, exchangeUserId, modifyTime, reward);
  }

  _mapCloudReward(item) {
    return rewardCloud.mapCloudReward(this, item);
  }

  async getExchangeableRewards(userId = null) {
    return rewardQuery.getExchangeableRewards(this, userId);
  }

  async exchangeReward(rewardId, userId = null) {
    return rewardExchange.exchangeReward(this, rewardId, userId);
  }

  async cancelRewardExchange(rewardId) {
    return rewardExchange.cancelRewardExchange(this, rewardId);
  }

  async calculateNextAvailableReward(knownStarCount = null, userId = null) {
    return rewardQuery.calculateNextAvailableReward(this, knownStarCount, userId);
  }

  async duplicateReward(rewardId) {
    return rewardWrite.duplicateReward(this, rewardId);
  }

  async deleteRewards(rewardIds) {
    return rewardWrite.deleteRewards(this, rewardIds);
  }

  clearCache() {
    logger.info('RewardService', '强制清除奖励服务缓存');

    if (this.rewardRepository && typeof this.rewardRepository.invalidateCache === 'function') {
      this.rewardRepository.invalidateCache();
    }
  }

  hasOnlyExampleRewardsSync() {
    return rewardQuery.hasOnlyExampleRewardsSync(this);
  }

  _isExampleReward(reward) {
    return rewardQuery.isExampleReward(this, reward);
  }

  async getLastExchangeTime() {
    return rewardQuery.getLastExchangeTime(this);
  }

  async getLastExchangeTimeByUser(userId) {
    return rewardQuery.getLastExchangeTimeByUser(this, userId);
  }

  async _rollbackStarDeduction(actualCost, reward, userId, reason = '兑换奖励失败') {
    return rewardExchange.rollbackStarDeduction(this, actualCost, reward, userId, reason);
  }

  updateUserService(userService) {
    if (this.userService !== userService) {
      this.userService = userService;
      logger.info('RewardService', 'UserService已更新');
    }
  }

  updateStarService(starService) {
    if (this.starService !== starService) {
      this.starService = starService;
      logger.info('RewardService', 'StarService已更新');
    }
  }

  updateConfigService(configService) {
    if (this.configService !== configService) {
      this.configService = configService || null;
      logger.info('RewardService', 'ConfigService已更新');
    }
  }
}

module.exports = RewardService;
