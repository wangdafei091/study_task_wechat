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
const HttpClient = require('../utils/http-client');
const API_CONFIG = require('../utils/api-config');
const { Reward } = require('../models/reward');
const userContextUtils = require('../utils/user-context');

const REWARD_CLOUD_REFRESH_MIN_INTERVAL_MS = 3 * 1000;
const LEGACY_EXAMPLE_REWARD_ID_PATTERNS = [
  /^reward_example_/,
  /^reward_\d+_(1|2|3)$/
];

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
   * @param {StarService} options.starService 星星服务
   * @param {UserService} options.userService 用户服务
   * @param {EventBus} options.eventBus 事件总线
   */
  constructor(options = {}) {
    // 初始化仓储
    this.rewardRepository = options.rewardRepository || new RewardRepository();
    this.starGroupRepository = options.starGroupRepository || new StarGroupRepository();
    this.starRecordRepository = options.starRecordRepository || new StarRecordRepository();
    
    // 关联服务
    this.starService = options.starService || null;
    this.userService = options.userService; // 新增：注入用户服务
    this.storageAdapter = options.storageAdapter; // 注入存储适配器
    this.offlineQueueService = options.offlineQueueService || null;
    
    // 事件总线
    this.eventBus = options.eventBus || new EventBus();
    
    // 实例级初始化标记
    this.initialized = false;
    this.enableCloudStorage = API_CONFIG.ENABLE_API;
    this._lastCloudRewardsSyncTimes = new Map();
    this._cloudRewardsRefreshInFlight = new Map();
    
    logger.info('RewardService', '构造奖励服务实例');
  }

  async _getUserAvailableStars(userId = null, options = {}) {
    const shouldPreferStarService = this.enableCloudStorage &&
      this.starService &&
      typeof this.starService.getTotalStars === 'function';

    if (shouldPreferStarService) {
      // 这是奖励域自己的读前余额对齐路径，保留既有 refreshBeforeRead 契约，不并入页面刷新编排。
      const shouldRefresh = options.refreshBeforeRead !== false &&
        userId &&
        typeof this.starService.refreshStarsFromCloud === 'function';

      if (shouldRefresh) {
        try {
          await this.starService.refreshStarsFromCloud(userId);
          logger.info('RewardService', `兑换前已刷新云端星星数据, 用户=${userId}`);
        } catch (refreshError) {
          logger.warn('RewardService', `刷新云端星星数据失败，将继续使用当前本地快照, 用户=${userId}`, refreshError);
        }
      }

      const totalStars = await this.starService.getTotalStars(userId);
      logger.info('RewardService', `通过StarService获取可用星星成功${userId ? `, 用户=${userId}` : ''}: ${totalStars}`);
      return totalStars;
    }

    const totalStars = await this.starGroupRepository.getTotalPoints(userId);
    logger.info('RewardService', `通过StarGroupRepository获取可用星星成功${userId ? `, 用户=${userId}` : ''}: ${totalStars}`);
    return totalStars;
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
        if (this.enableCloudStorage) {
          RewardService._initialized = true;
          logger.info('RewardService', '云端模式下跳过默认奖励初始化，等待页面进入时拉取云端奖励');
          return;
        }

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
          // 尝试从ServiceManager获取ConfigService
          const serviceManager = require('./service-manager');
          const configService = serviceManager.getService('config');
          
          if (configService) {
            hasCustomRewards = configService.hasCustomRewards();
          } else if (this.storageAdapter) {
            hasCustomRewards = this.storageAdapter.get('has_custom_rewards') === true;
          } else {
            // 降级处理：如果没有注入StorageAdapter，回退到直接调用
            hasCustomRewards = wx.getStorageSync('has_custom_rewards') === true;
            logger.warn('RewardService', '配置服务和StorageAdapter均不可用，使用直接wx调用');
          }
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

  _createOperationKey(seed = null) {
    return String(seed || Date.now());
  }

  _getUserContextInput() {
    const loginUser = this.userService?.getLoginUser?.() || null;
    const currentUser = this.userService?.getCurrentUser?.() || null;
    const currentUserId = this.userService?.getCurrentUserId?.() || null;
    const availableUsers = this.userService?.getAllUsers?.() || [];

    return {
      loginUser,
      currentUser,
      currentUserId,
      availableUsers
    };
  }

  _getOperatorContext(targetUserId = null, mode = 'manage') {
    const mutationContext = userContextUtils.resolveMutationContext(
      this._getUserContextInput(),
      {
        targetUserId,
        operationMode: mode
      }
    );
    const isManageMode = mutationContext.operationMode === 'manage';

    return {
      actorUserId: isManageMode
        ? mutationContext.managementActorUserId
        : mutationContext.executionActorUserId,
      actorRole: isManageMode
        ? mutationContext.managementActorRole
        : mutationContext.executionActorRole,
      familyId: mutationContext.familyId || null,
      loginUserId: mutationContext.loginUserId || null,
      targetUserId: mutationContext.targetUserId || null
    };
  }

  _buildRewardPendingSyncMeta(reward, action, overrides = {}) {
    const operatorMode = ['exchange', 'unclaim'].includes(action) ? 'execute' : 'manage';
    const operatorContext = overrides.operatorContext || this._getOperatorContext(reward?.exchangeUserId || null, operatorMode);
    const operationKey = this._createOperationKey(
      overrides.operationKey ||
      overrides.modifyTime ||
      reward?.modifyTime
    );

    return {
      operationKey,
      action,
      operatorUserId: overrides.operatorUserId || operatorContext.actorUserId || null,
      operatorRole: overrides.operatorRole || operatorContext.actorRole || 'system',
      familyId: overrides.familyId || operatorContext.familyId || reward?.familyId || null,
      loginUserId: overrides.loginUserId || operatorContext.loginUserId || null,
      exchangeUserId: overrides.exchangeUserId || reward?.exchangeUserId || operatorContext.targetUserId || null,
      notificationType: overrides.notificationType || `reward_${action}`,
      modifyTime: Number(overrides.modifyTime || reward?.modifyTime || Date.now())
    };
  }

  updateOfflineQueueService(offlineQueueService) {
    this.offlineQueueService = offlineQueueService || null;
    if (this.offlineQueueService) {
      this.offlineQueueService.registerAdapter('reward', this._executeRewardQueueItem.bind(this));
    }
  }

  _buildOfflineQueueContextFromPendingSyncMeta(pendingSyncMeta = {}) {
    return {
      familyId: pendingSyncMeta.familyId || null,
      loginUserId: pendingSyncMeta.loginUserId || this.userService?.getLoginUserId?.() || null,
      actorUserId: pendingSyncMeta.operatorUserId || null,
      actorRole: pendingSyncMeta.operatorRole || 'system',
      exchangeUserId: pendingSyncMeta.exchangeUserId || null
    };
  }

  async _enqueueRewardMutation(action, reward, extra = {}) {
    if (!this.offlineQueueService) {
      return null;
    }

    const pendingSyncMeta = extra.pendingSyncMeta || reward?.pendingSyncMeta || this._buildRewardPendingSyncMeta(reward, action, extra);
    const snapshot = extra.rewardSnapshot || (reward ? { ...reward } : null);

    return this.offlineQueueService.enqueueMutation({
      domain: 'reward',
      entityId: reward?.id || extra.rewardId || null,
      operation: action,
      operationKey: pendingSyncMeta.operationKey,
      payload: {
        pendingSyncMeta,
        rewardId: reward?.id || extra.rewardId || null,
        deleteMeta: extra.deleteMeta || null
      },
      snapshot,
      context: this._buildOfflineQueueContextFromPendingSyncMeta(pendingSyncMeta)
    });
  }

  async _executeRewardQueueItem(item) {
    const snapshot = item.snapshot ? new Reward(item.snapshot) : null;
    const storedReward = item.entityId ? await this.rewardRepository.getById(item.entityId) : null;
    const reward = storedReward || snapshot;

    if (reward && item.payload?.pendingSyncMeta) {
      reward.pendingSyncMeta = { ...item.payload.pendingSyncMeta };
    }

    switch (item.operation) {
      case 'create':
      case 'update':
        return this._syncRewardToCloud(reward);
      case 'delete':
        return this._syncDeleteRewardToCloud(
          item.entityId,
          item.payload?.deleteMeta || item.payload?.pendingSyncMeta || item.snapshot?.pendingSyncMeta || null
        );
      case 'exchange':
        return this._syncExchangeToCloud(
          item.entityId,
          item.payload?.pendingSyncMeta?.exchangeUserId || reward?.exchangeUserId || null,
          item.payload?.pendingSyncMeta?.modifyTime || reward?.modifyTime || Date.now(),
          reward
        );
      case 'unclaim':
        return this._syncCancelExchangeToCloud(
          item.entityId,
          item.payload?.pendingSyncMeta?.exchangeUserId || reward?.exchangeUserId || null,
          item.payload?.pendingSyncMeta?.modifyTime || reward?.modifyTime || Date.now(),
          reward
        );
      default:
        return this._syncRewardToCloud(reward);
    }
  }

  async buildLegacyQueueCandidates() {
    const [rewards, tombstones] = await Promise.all([
      this.rewardRepository.getAll(),
      this._getDeleteTombstones()
    ]);

    const rewardItems = (rewards || [])
      .filter((reward) => reward?.pendingSyncMeta)
      .map((reward) => {
        const pendingSyncMeta = reward.pendingSyncMeta || {};
        const operation = pendingSyncMeta.action || (reward.syncedToCloud ? 'update' : 'create');
        return {
          domain: 'reward',
          entityId: reward.id,
          operation,
          operationKey: pendingSyncMeta.operationKey || `${reward.id}:${operation}`,
          payload: { pendingSyncMeta },
          snapshot: { ...reward },
          context: this._buildOfflineQueueContextFromPendingSyncMeta(pendingSyncMeta),
          legacyMigrationKey: `reward:pending:${reward.id}:${operation}`
        };
      });

    const tombstoneItems = (tombstones || []).map((tombstone) => ({
      domain: 'reward',
      entityId: tombstone.entityId,
      operation: 'delete',
      operationKey: tombstone.operationKey || `${tombstone.entityId}:delete`,
      payload: {
        deleteMeta: tombstone,
        pendingSyncMeta: tombstone
      },
      snapshot: null,
      context: this._buildOfflineQueueContextFromPendingSyncMeta(tombstone),
      legacyMigrationKey: `reward:tombstone:${tombstone.entityId}:delete`
    }));

    return [...rewardItems, ...tombstoneItems];
  }

  async _markRewardSynced(reward, overrides = {}) {
    if (!reward) {
      return null;
    }

    reward.syncedToCloud = true;
    reward.pendingSyncMeta = null;
    if (overrides.modifyTime) {
      reward.modifyTime = overrides.modifyTime;
    }
    return this.rewardRepository.save(reward);
  }

  async _emitRewardCloudSyncFailure(action, reward, error, extra = {}) {
    const pendingSyncMeta = extra.pendingSyncMeta || reward?.pendingSyncMeta || this._buildRewardPendingSyncMeta(reward, action, extra);
    if (reward && action !== 'delete') {
      reward.pendingSyncMeta = pendingSyncMeta;
      reward.syncedToCloud = false;
      await this.rewardRepository.save(reward).catch(() => null);
    }

    await this._enqueueRewardMutation(action, reward, {
      ...extra,
      pendingSyncMeta,
      rewardSnapshot: extra.rewardSnapshot || (reward ? { ...reward } : null)
    }).catch(() => null);

    this.eventBus.emit(EVENTS.REWARD_CLOUD_SYNC_FAILED, {
      action,
      reward,
      rewardId: reward?.id || extra.rewardId || null,
      error,
      pendingSyncMeta,
      rewardSnapshot: extra.rewardSnapshot || (reward ? { ...reward } : null)
    });
  }

  async _getDeleteTombstones() {
    if (typeof this.rewardRepository.getDeleteTombstones !== 'function') {
      return [];
    }
    return this.rewardRepository.getDeleteTombstones().catch(() => []);
  }

  async _saveDeleteTombstone(tombstone) {
    if (typeof this.rewardRepository.saveDeleteTombstone !== 'function') {
      return null;
    }
    return this.rewardRepository.saveDeleteTombstone(tombstone).catch(() => null);
  }

  async _removeDeleteTombstone(entityId) {
    if (typeof this.rewardRepository.removeDeleteTombstone !== 'function') {
      return null;
    }
    return this.rewardRepository.removeDeleteTombstone(entityId).catch(() => null);
  }

  async _flushPendingRewardSyncs() {
    if (this.offlineQueueService) {
      if (typeof this.offlineQueueService.initialize === 'function') {
        await this.offlineQueueService.initialize();
      }
      await this.offlineQueueService.drain({
        domains: ['reward'],
        reason: 'before_reward_read'
      });
      return;
    }

    if (!this.enableCloudStorage) {
      return;
    }

    const rewards = await this.rewardRepository.getAll();
    for (const reward of rewards) {
      if (!reward?.pendingSyncMeta) {
        continue;
      }

      try {
        if (!reward.syncedToCloud) {
          await this._syncRewardToCloud(reward);
          continue;
        }

        switch (reward.pendingSyncMeta.action) {
          case 'exchange':
            await this._syncExchangeToCloud(
              reward.id,
              reward.pendingSyncMeta.exchangeUserId || reward.exchangeUserId,
              reward.pendingSyncMeta.modifyTime || reward.modifyTime,
              reward
            );
            break;
          case 'unclaim':
            await this._syncCancelExchangeToCloud(
              reward.id,
              reward.pendingSyncMeta.exchangeUserId || reward.exchangeUserId,
              reward.pendingSyncMeta.modifyTime || reward.modifyTime,
              reward
            );
            break;
          default:
            await this._syncRewardToCloud(reward);
            break;
        }
      } catch (error) {
        logger.warn('RewardService', '奖励补云失败，保留待同步状态', {
          rewardId: reward.id,
          action: reward.pendingSyncMeta.action,
          error: error.message
        });
      }
    }

    const tombstones = await this._getDeleteTombstones();
    for (const tombstone of tombstones) {
      try {
        await this._syncDeleteRewardToCloud(tombstone.entityId, tombstone);
      } catch (error) {
        logger.warn('RewardService', '奖励删除 tombstone 补云失败，保留待同步状态', {
          rewardId: tombstone.entityId,
          error: error.message
        });
      }
    }
  }
  
  /**
   * 获取所有奖励
   * @param {String} userId 可选的用户ID，不传则获取所有用户的奖励
   * @returns {Promise<Array>} 所有奖励列表
   */
  async getAllRewards(userId = null) {
    try {
      let rewards;
      
      if (userId) {
        // 获取指定用户的奖励
        const allRewards = await this.rewardRepository.getAll();
        rewards = allRewards.filter(reward => reward.userId === userId);
      } else {
        // 获取所有用户的奖励
        rewards = await this.rewardRepository.getAll();
      }
      
      logger.info('RewardService', `获取所有奖励成功${userId ? `, 用户=${userId}` : ''}, 数量=${rewards.length}`);
      return rewards;
    } catch (error) {
      logger.error('RewardService', '获取所有奖励失败', error);
      return [];
    }
  }
  
  /**
   * 获取已领取的奖励
   * @param {String} userId 可选的用户ID，不传则获取所有用户的奖励
   * @returns {Promise<Array>} 已领取的奖励列表
   */
  async getClaimedRewards(userId = null) {
    try {
      const rewards = await this.rewardRepository.getClaimedRewards(false, userId);
      logger.info('RewardService', `获取已领取奖励成功${userId ? `, 用户=${userId}` : ''}, 数量=${rewards.length}`);
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
      // 确保奖励有userId - 如果没有提供，使用当前用户ID
      if (!rewardData.userId) {
        // 通过注入的用户服务获取当前用户ID
        if (this.userService) {
          rewardData.userId = this.userService.getCurrentUserId();
          logger.info('RewardService', `为奖励设置用户ID: ${rewardData.userId}`);
        } else {
          // 如果用户服务不可用，默认设为parent
          rewardData.userId = 'parent';
          logger.warn('RewardService', '用户服务不可用，奖励用户ID设为默认值: parent');
        }
      }
      
      // 创建Reward实例
      const { Reward } = require('../models/index');
      const reward = new Reward(rewardData);
      reward.pendingSyncMeta = this._buildRewardPendingSyncMeta(reward, 'create', {
        operationKey: rewardData.operationKey || reward.modifyTime,
        modifyTime: reward.modifyTime
      });
      
      // 保存奖励
      const savedReward = await this.rewardRepository.save(reward);
      
      logger.info('RewardService', `创建奖励成功: ${savedReward.name}, ID=${savedReward.id}`);
      
      // 触发奖励创建事件
      this.eventBus.emit(EVENTS.REWARD_CREATED, { reward: savedReward });

      if (savedReward && this.enableCloudStorage) {
        this._syncRewardToCloud(savedReward).catch(async syncError => {
          logger.warn('RewardService', '奖励创建云同步失败，本地已保存', {
            rewardId: savedReward.id,
            error: syncError.message
          });
          await this._emitRewardCloudSyncFailure('create', savedReward, syncError);
        });
      }
      
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
      
      // 更新奖励属性
      const updatedFields = [];
      Object.keys(rewardData).forEach(key => {
        if (rewardData[key] !== undefined && existingReward.hasOwnProperty(key)) {
          const oldValue = existingReward[key];
          existingReward[key] = rewardData[key];
          updatedFields.push(`${key}: ${oldValue} → ${rewardData[key]}`);
        }
      });
      existingReward.modifyTime = Date.now();
      existingReward.pendingSyncMeta = this._buildRewardPendingSyncMeta(existingReward, 'update', {
        operationKey: rewardData.operationKey || existingReward.modifyTime,
        modifyTime: existingReward.modifyTime
      });
      existingReward.syncedToCloud = false;
      
      logger.info('RewardService', `奖励更新字段: ${updatedFields.join(', ')}`);
      
      // 保存更新后的奖励
      const updatedReward = await this.rewardRepository.save(existingReward);
      
      logger.info('RewardService', `更新奖励成功: ${updatedReward.name}, ID=${updatedReward.id}`);
      
      // 触发奖励更新事件
      this.eventBus.emit(EVENTS.REWARD_UPDATED, { 
        reward: updatedReward,
        previous: existingReward
      });

      if (updatedReward && this.enableCloudStorage) {
        this._syncRewardToCloud(updatedReward).catch(async syncError => {
          logger.warn('RewardService', '奖励更新云同步失败，本地已保存', {
            rewardId: updatedReward.id,
            error: syncError.message
          });
          await this._emitRewardCloudSyncFailure('update', updatedReward, syncError);
        });
      }
      
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

      const operatorContext = this._getOperatorContext();
      const deleteMeta = {
        entityType: 'reward',
        entityId: rewardId,
        operationKey: this._createOperationKey(Date.now()),
        operatorUserId: operatorContext.actorUserId,
        operatorRole: operatorContext.actorRole,
        familyId: operatorContext.familyId || reward.familyId || null,
        subjectUserId: null,
        notificationType: 'reward_delete',
        title: reward.name,
        summary: `奖励“${reward.name}”已删除`,
        createTime: Date.now()
      };

      await this._saveDeleteTombstone(deleteMeta);
      
      // 删除奖励
      const result = await this.rewardRepository.delete(rewardId);
      
      logger.info('RewardService', `删除奖励成功: ${reward.name}, ID=${rewardId}`);
      
      // 触发奖励删除事件
      this.eventBus.emit(EVENTS.REWARD_DELETED, { reward });

      if (this.enableCloudStorage) {
        this._syncDeleteRewardToCloud(rewardId, deleteMeta).catch(syncError => {
          logger.warn('RewardService', '奖励删除云同步失败，本地已删除', {
            rewardId,
            error: syncError.message
          });
          this._emitRewardCloudSyncFailure('delete', null, syncError, {
            rewardId,
            pendingSyncMeta: deleteMeta,
            rewardSnapshot: reward,
            deleteMeta
          });
        });
      }
      
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
      if (enabled) {
        reward.enable();
        logger.info('RewardService', `启用奖励: ${reward.name}, ID=${rewardId}`);
      } else {
        reward.disable();
        logger.info('RewardService', `禁用奖励: ${reward.name}, ID=${rewardId}`);
      }
      
      const updatedReward = await this.rewardRepository.save(reward);
      
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
   * 获取可用奖励列表
   * @param {Boolean} includeClaimed 是否包含已领取的奖励
   * @param {Boolean} includeExamples 是否包含示例奖励，默认为false
   * @param {String} userId 可选的用户ID，不传则获取所有用户的奖励
   * @returns {Promise<Array>} 可用奖励列表
   */
  async getAvailableRewards(includeClaimed = false, includeExamples = false, userId = null) {
    try {
      // 确保服务已初始化
      if (!this.initialized && !RewardService._initialized) {
        logger.info('RewardService', '奖励服务尚未初始化，先执行初始化');
        await this.initialize();
      }
      
      let rewards;
      if (includeClaimed) {
        // 获取指定用户的所有奖励
        if (userId && !this.enableCloudStorage) {
          const allRewards = await this.rewardRepository.getAll();
          rewards = allRewards.filter(r => r.userId === userId);
        } else {
          rewards = await this.rewardRepository.getAll();
        }
        
        // 过滤掉禁用的奖励（即使includeClaimed=true也不应该返回禁用的奖励）
        const originalCount = rewards.length;
        rewards = rewards.filter(r => r.enabled !== false);
        const filteredCount = originalCount - rewards.length;
        
        if (filteredCount > 0) {
          logger.info('RewardService', `过滤掉${filteredCount}个禁用奖励，剩余${rewards.length}个可用奖励`);
        }
        
        // 如果不需要示例奖励且存在自定义奖励，过滤掉示例奖励
        if (!includeExamples) {
          const hasCustomRewards = rewards.some(r => !r.isExample && r.enabled);
          if (hasCustomRewards) {
            rewards = rewards.filter(r => !r.isExample);
          }
        }
        
        logger.info('RewardService', `获取所有奖励成功(包含已领取${includeExamples ? '和示例' : ''}，已过滤禁用奖励)${userId ? `, 用户=${userId}` : ''}, 数量=${rewards.length}`);
      } else {
        // 使用增强的仓储方法，直接处理示例奖励的过滤
        rewards = await this.rewardRepository.getAvailableRewards(includeExamples, userId);
        logger.info('RewardService', `获取可用奖励成功(仅未领取${includeExamples ? '，包含示例' : ''})${userId ? `, 用户=${userId}` : ''}, 数量=${rewards.length}`);
      }
      
      return rewards;
    } catch (error) {
      logger.error('RewardService', '获取可用奖励失败', error);
      return [];
    }
  }

  async refreshRewardsFromCloud(options = {}) {
    if (!this.enableCloudStorage) {
      return { success: false, message: '云端模式未启用' };
    }

    const {
      force = false,
      minIntervalMs = REWARD_CLOUD_REFRESH_MIN_INTERVAL_MS
    } = options;
    const scopeKey = `user:${options.userId || 'default'}`;

    // in-flight 复用：已在进行中的请求直接复用，避免并发重复
    const inFlight = this._cloudRewardsRefreshInFlight.get(scopeKey);
    if (inFlight) {
      logger.debug('RewardService', '复用进行中的奖励云同步请求');
      return inFlight;
    }

    const request = (async () => {
      // 待同步补云属于一致性自愈链路，不应被读取节流挡住
      await this._flushPendingRewardSyncs();

      const now = Date.now();
      const lastSyncTime = this._lastCloudRewardsSyncTimes.get(scopeKey) || 0;
      if (!force && minIntervalMs > 0 && now - lastSyncTime < minIntervalMs) {
        logger.debug('RewardService', '奖励云同步被短窗口去重跳过', {
          scopeKey,
          elapsed: now - lastSyncTime,
          minIntervalMs
        });
        return { success: true, skipped: true, reason: 'throttled' };
      }

      const result = await this._fetchRewardsFromCloud(options);
      this._lastCloudRewardsSyncTimes.set(scopeKey, Date.now());
      return result;
      })()
      .finally(() => {
        this._cloudRewardsRefreshInFlight.delete(scopeKey);
      });

    this._cloudRewardsRefreshInFlight.set(scopeKey, request);
    return request;
  }

  async _fetchRewardsFromCloud(options = {}) {
    const response = await HttpClient.get(API_CONFIG.ENDPOINTS.REWARDS, options.userId ? {
      userId: options.userId
    } : {});
    const cloudRewards = (response.rewards || []).map(item => this._mapCloudReward(item));
    const allLocal = await this.rewardRepository.getAll(false);
    const cloudRewardIds = new Set(cloudRewards.map(reward => reward.id).filter(Boolean));
    const retainedRewards = allLocal.filter(reward => {
      if (cloudRewardIds.has(reward.id)) {
        return false;
      }

      return reward.syncedToCloud !== true;
    });
    await this.rewardRepository._saveData([...retainedRewards, ...cloudRewards]);
    this.rewardRepository.invalidateCache();
    logger.info('RewardService', '已从云端刷新奖励列表', { rewardCount: cloudRewards.length });
    return { success: true, rewards: cloudRewards };
  }

  async _syncRewardToCloud(reward) {
    if (!reward) return;
    const pendingSyncMeta = reward.pendingSyncMeta || this._buildRewardPendingSyncMeta(reward, reward.syncedToCloud ? 'update' : 'create');

    const payload = {
      rewardId: reward.id,
      name: reward.name,
      description: reward.description,
      type: reward.type,
      points: reward.points,
      icon: reward.icon,
      enabled: reward.enabled,
      claimed: reward.claimed,
      claimTime: reward.claimTime || 0,
      claimStatus: reward.claimStatus,
      deliveryTime: reward.deliveryTime || 0,
      isExample: reward.isExample || false,
      tags: reward.tags || [],
      notes: reward.notes || '',
      protectedByExpiry: reward.protectedByExpiry || false,
      partialProtection: reward.partialProtection || 0,
      modifyTime: pendingSyncMeta.modifyTime || reward.modifyTime || Date.now(),
      operationKey: pendingSyncMeta.operationKey
    };

    if (reward.syncedToCloud) {
      const url = API_CONFIG.ENDPOINTS.REWARD_BY_ID.replace('{rewardId}', reward.id);
      await HttpClient.put(url, payload);
    } else {
      await HttpClient.post(API_CONFIG.ENDPOINTS.REWARDS, payload);
    }

    await this._markRewardSynced(reward, { modifyTime: payload.modifyTime });
  }

  async _syncDeleteRewardToCloud(rewardId, deleteMeta = null) {
    const url = API_CONFIG.ENDPOINTS.REWARD_BY_ID.replace('{rewardId}', rewardId);
    try {
      await HttpClient.request({
        url,
        method: 'DELETE',
        data: deleteMeta ? {
          operationKey: deleteMeta.operationKey,
          operatorContext: {
            actorUserId: deleteMeta.operatorUserId,
            actorRole: deleteMeta.operatorRole,
            familyId: deleteMeta.familyId
          }
        } : null
      });
      await this._removeDeleteTombstone(rewardId);
    } catch (error) {
      if (error.message && error.message.includes('404')) {
        await this._removeDeleteTombstone(rewardId);
        return;
      }
      throw error;
    }
  }

  async _syncExchangeToCloud(rewardId, exchangeUserId, modifyTime, reward = null) {
    const pendingSyncMeta = reward?.pendingSyncMeta || this._buildRewardPendingSyncMeta(reward, 'exchange', {
      modifyTime,
      exchangeUserId
    });
    const url = API_CONFIG.ENDPOINTS.REWARD_EXCHANGE.replace('{rewardId}', rewardId);
    const response = await HttpClient.patch(url, {
      exchangeUserId,
      modifyTime,
      operationKey: pendingSyncMeta.operationKey,
      operatorContext: {
        actorUserId: pendingSyncMeta.operatorUserId,
        actorRole: pendingSyncMeta.operatorRole,
        familyId: pendingSyncMeta.familyId
      }
    });
    if (reward) {
      await this._markRewardSynced(reward, { modifyTime });
    }
    return response;
  }

  async _syncCancelExchangeToCloud(rewardId, exchangeUserId, modifyTime, reward = null) {
    const pendingSyncMeta = reward?.pendingSyncMeta || this._buildRewardPendingSyncMeta(reward, 'unclaim', {
      modifyTime,
      exchangeUserId
    });
    const url = API_CONFIG.ENDPOINTS.REWARD_CANCEL_EXCHANGE.replace('{rewardId}', rewardId);
    const response = await HttpClient.patch(url, {
      exchangeUserId,
      modifyTime,
      operationKey: pendingSyncMeta.operationKey,
      operatorContext: {
        actorUserId: pendingSyncMeta.operatorUserId,
        actorRole: pendingSyncMeta.operatorRole,
        familyId: pendingSyncMeta.familyId
      }
    });
    if (reward) {
      await this._markRewardSynced(reward, { modifyTime });
    }
    return response;
  }

  _mapCloudReward(item) {
    return new Reward({
      id: item.rewardId || item.id,
      userId: item.userId,
      familyId: item.familyId || null,
      name: item.name,
      description: item.description || '',
      type: item.type || 'item',
      points: Number(item.points || 0),
      icon: item.icon || '🎁',
      enabled: item.enabled !== false,
      claimed: item.claimed === true,
      claimTime: item.claimTime || 0,
      claimStatus: item.claimStatus || (item.claimed ? 'claimed' : 'available'),
      deliveryTime: item.deliveryTime || 0,
      isExample: item.isExample === true,
      tags: item.tags || [],
      notes: item.notes || '',
      protectedByExpiry: item.protectedByExpiry === true,
      partialProtection: Number(item.partialProtection || 0),
      syncedToCloud: true,
      modifyTime: item.modifyTime || Date.now(),
      exchangeUserId: item.exchangeUserId || null
    });
  }
  
  /**
   * 获取用户可兑换的奖励列表
   * @param {String} userId 可选的用户ID，不传则获取所有用户的奖励
   * @returns {Promise<Array>} 用户可兑换的奖励列表
   */
  async getExchangeableRewards(userId = null) {
    try {
      // 获取用户可用的星星数量
      const availablePoints = await this._getUserAvailableStars(userId, {
        refreshBeforeRead: !!userId
      });
      
      // 获取可兑换的奖励
      const rewards = await this.rewardRepository.getExchangeableRewards(availablePoints, userId);
      
      logger.info('RewardService', `获取用户可兑换奖励列表成功${userId ? `, 用户=${userId}` : ''}, 可用星星=${availablePoints}, 可兑换奖励数量=${rewards.length}`);
      return rewards;
    } catch (error) {
      logger.error('RewardService', '获取用户可兑换奖励列表失败', error);
      return [];
    }
  }
  
  /**
   * 兑换奖励
   * @param {String} rewardId 奖励ID
   * @param {String} userId 可选的用户ID，不传则获取当前用户ID
   * @returns {Promise<Object>} 兑换结果
   */
  async exchangeReward(rewardId, userId = null) {
    logger.info('RewardService', `===== 开始兑换奖励流程 =====`);
    logger.info('RewardService', `兑换奖励ID: ${rewardId}, 用户ID: ${userId || '未指定，将自动获取'}`);
    
    if (!rewardId) {
      logger.warn('RewardService', '兑换奖励失败: 缺少奖励ID');
      return { success: false, message: '奖励ID不能为空' };
    }
    
    try {
      // 确保有当前用户ID
      if (!userId) {
        // 通过注入的用户服务获取当前用户ID
        if (this.userService) {
          userId = this.userService.getCurrentUserId();
          logger.info('RewardService', `自动获取当前用户ID: ${userId}`);
        } else {
          logger.error('RewardService', '无法获取用户服务，兑换失败');
          return { success: false, message: '用户服务不可用' };
        }
      }
      
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
      
      if (this.enableCloudStorage) {
        const exchangeModifyTime = Date.now();
        const response = await this._syncExchangeToCloud(
          reward.id,
          userId,
          exchangeModifyTime,
          reward
        );
        const cloudReward = this._mapCloudReward(response.reward || {
          ...reward,
          rewardId: reward.id,
          claimed: true,
          claimTime: exchangeModifyTime,
          claimStatus: 'claimed',
          exchangeUserId: userId,
          modifyTime: exchangeModifyTime
        });
        cloudReward.pendingSyncMeta = null;
        cloudReward.syncedToCloud = true;
        await this.rewardRepository.save(cloudReward);

        if (this.starService?.refreshStarsFromCloud) {
          // 兑换成功意味着云端权威余额已变化，本次允许强制回刷最新星星镜像。
          await this.starService.refreshStarsFromCloud(userId, {
            forceCloudAfterAuthority: true
          }).catch(() => null);
        }
        await this.refreshRewardsFromCloud({
          force: true,
          userId
        }).catch(() => null);

        const actualCost = Number(response.consumedPoints || 0);
        this.eventBus.emit(EVENTS.REWARD_CLAIMED, {
          rewardId: cloudReward.id,
          rewardName: cloudReward.name,
          points: actualCost,
          actualCost,
          originalPoints: cloudReward.points,
          displayPoints: actualCost,
          protectedByExpiry: cloudReward.protectedByExpiry || false,
          partialProtection: cloudReward.partialProtection || 0,
          exchangeType: cloudReward.protectedByExpiry
            ? (actualCost > 0 ? 'partial_protected' : 'fully_protected')
            : 'normal',
          userId,
          operatorUserId: userId,
          timestamp: Date.now()
        });

        return {
          success: true,
          reward: cloudReward,
          message: cloudReward.protectedByExpiry
            ? (actualCost > 0 ? '部分保护奖励兑换成功' : '完全保护奖励兑换成功')
            : '兑换成功',
          protectedByExpiry: cloudReward.protectedByExpiry || false,
          partialProtection: cloudReward.partialProtection || 0,
          actualCost,
          userId
        };
      }

      // 获取用户当前星星总数
      logger.info('RewardService', `步骤2: 检查用户星星数量, 用户=${userId}`);
      const userStars = await this._getUserAvailableStars(userId, {
        refreshBeforeRead: true
      });
      logger.info('RewardService', `兑换奖励前用户星星数: ${userStars}, 用户=${userId}`);
      
      // 计算实际需要扣除的星星数量
      const actualCost = reward.protectedByExpiry ? 
        Math.max(0, reward.points - (reward.partialProtection || 0)) : 
        reward.points;
      
      // 检查用户是否有足够的星星
      if (userStars < actualCost) {
        logger.warn('RewardService', `兑换奖励失败: 星星不足, 需要${actualCost}颗, 当前${userStars}颗${reward.protectedByExpiry ? `(保护金额${reward.partialProtection || 0}颗)` : ''}, 用户=${userId}`);
        return { success: false, message: '星星不足' };
      }
      
      // 开始事务，确保数据一致性
      let deductResult = null;
      let consumptionRecord = null;
      
      try {
        logger.info('RewardService', `===== 开始兑换奖励事务 =====`);
        logger.info('RewardService', `事务参数: 奖励=${reward.name}, 原价=${reward.points}颗, 保护金额=${reward.partialProtection || 0}颗, 实际消耗=${actualCost}颗(${reward.protectedByExpiry ? (actualCost > 0 ? '部分保护' : '完全保护') : '普通兑换'}), 用户=${userId}`);
        const exchangeModifyTime = Date.now();
        
        // 1. 扣除用户星星（计算实际扣除数量）
        if (actualCost > 0) {
          logger.info('RewardService', `步骤3: 开始扣除星星, 数量=${actualCost}, 用户=${userId}`);
          deductResult = await this.starGroupRepository.deductStars(actualCost, userId);
          
          logger.info('RewardService', `扣除星星操作完成, 结果=`, deductResult);
          
          if (!deductResult.success) {
            logger.error('RewardService', `扣除星星失败: ${deductResult.message}, 用户=${userId}`);
            return { success: false, message: '扣除星星失败' };
          }
          
          logger.info('RewardService', `步骤3完成: 星星扣除成功，扣除${actualCost}颗, 用户=${userId}`);
        } else {
          logger.info('RewardService', `步骤3跳过: 完全保护奖励无需扣除星星, 奖励=${reward.name}, 用户=${userId}`);
          deductResult = { success: true, message: '完全保护奖励无需扣星' };
        }
        
        // 2. 创建星星消费记录（支持部分保护记录）
        try {
          const recordData = {
            amount: actualCost,
            type: reward.protectedByExpiry ? 
              (actualCost > 0 ? 'partial_protected_exchange' : 'protected_exchange') : 
              'exchange', // 部分保护兑换、完全保护兑换或普通兑换
            source: `reward_${rewardId}`,
            sourceId: reward.id,
            timestamp: exchangeModifyTime,
            userId: userId,
            idempotencyKey: `reward_exchange:${reward.id}:${userId}:${exchangeModifyTime}`,
            modifyTime: exchangeModifyTime,
            data: {
              rewardId: reward.id,
              rewardName: reward.name,
              originalPoints: reward.points,
              protectedByExpiry: reward.protectedByExpiry || false,
              partialProtection: reward.partialProtection || 0,
              actualCost: actualCost
            }
          };
          
          consumptionRecord = await this.starRecordRepository.createStarConsumptionRecord(recordData);
          logger.info('RewardService', `星星消费记录创建成功: ${consumptionRecord.id}, 类型=${recordData.type}, 用户=${userId}`);
        } catch (recordError) {
          logger.error('RewardService', '创建星星消费记录失败', recordError);
          
          // 回滚星星扣除操作
          const rollbackSuccess = await this._rollbackStarDeduction(actualCost, reward, userId, '创建消费记录失败');
          
          return { 
            success: false, 
            message: '创建消费记录失败' + (actualCost > 0 ? (rollbackSuccess ? '，已回滚星星扣除' : '，回滚失败') : '') 
          };
        }
        
        // 3. 更新奖励状态为已兑换未领取
        try {
          reward.claim();
          reward.claimTime = exchangeModifyTime;
          reward.modifyTime = exchangeModifyTime;
          reward.exchangeUserId = userId;
          reward.pendingSyncMeta = this._buildRewardPendingSyncMeta(reward, 'exchange', {
            operationKey: exchangeModifyTime,
            modifyTime: exchangeModifyTime,
            exchangeUserId: userId
          });
          reward.syncedToCloud = false;
          logger.info('RewardService', `奖励状态设置: claimed=${reward.claimed}, claimStatus=${reward.claimStatus}, claimTime=${reward.claimTime}, deliveryTime=${reward.deliveryTime}, 用户=${userId}`);
          const savedReward = await this.rewardRepository.save(reward);
          
          if (!savedReward) {
            throw new Error('保存奖励状态失败');
          }
          
          logger.info('RewardService', `奖励状态更新成功: ${reward.name}, 最终状态=${reward.claimStatus}, 用户=${userId}`);
        } catch (saveError) {
          logger.error('RewardService', '更新奖励状态失败', saveError);
          
          // 回滚星星扣除操作
          const rollbackSuccess = await this._rollbackStarDeduction(actualCost, reward, userId, '更新奖励状态失败');
          
          return { 
            success: false, 
            message: '更新奖励状态失败' + (actualCost > 0 ? (rollbackSuccess ? '，已回滚星星扣除' : '，回滚失败') : '') 
          };
        }
        
        // 4. 发出奖励领取事件
        try {
          this.eventBus.emit(EVENTS.REWARD_CLAIMED, { 
            rewardId: reward.id,
            rewardName: reward.name,
            points: actualCost, // 实际消耗的星星数量（兼容旧版本）
            actualCost: actualCost, // 实际消耗数量
            originalPoints: reward.points, // 原始奖励积分
            displayPoints: actualCost, // 用于显示的消耗数量
            protectedByExpiry: reward.protectedByExpiry || false,
            partialProtection: reward.partialProtection || 0,
            exchangeType: reward.protectedByExpiry ? 
              (actualCost > 0 ? 'partial_protected' : 'fully_protected') : 'normal',
            userId: userId,
            operatorUserId: userId,
            timestamp: Date.now()
          });
          logger.info('RewardService', `奖励领取事件发送成功, 用户=${userId}`);
        } catch (eventError) {
          logger.warn('RewardService', '发送奖励领取事件失败', eventError);
          // 事件发送失败不影响主流程
        }
        
        const costDescription = reward.protectedByExpiry ? 
          (actualCost > 0 ? `${actualCost}颗星星(部分保护，原价${reward.points}颗)` : '0颗星星(完全保护)') : 
          `${actualCost}颗星星`;
        logger.info('RewardService', `兑换奖励成功: ${reward.name}, 消耗${costDescription}, 用户=${userId}`);
        
        const successMessage = reward.protectedByExpiry ? 
          (actualCost > 0 ? '部分保护奖励兑换成功' : '完全保护奖励兑换成功') : 
          '兑换成功';

        if (this.enableCloudStorage) {
          this._syncExchangeToCloud(reward.id, userId, reward.modifyTime || reward.claimTime || Date.now(), reward).catch(async syncError => {
            logger.warn('RewardService', '奖励兑换云同步失败，本地已保存', {
              rewardId: reward.id,
              userId,
              error: syncError.message
            });
            await this._emitRewardCloudSyncFailure('exchange', reward, syncError, {
              exchangeUserId: userId
            });
          });
        }
        
        return { 
          success: true, 
          reward, 
          message: successMessage,
          protectedByExpiry: reward.protectedByExpiry || false,
          partialProtection: reward.partialProtection || 0,
          actualCost: actualCost,
          userId: userId
        };
      } catch (error) {
        logger.error('RewardService', '兑换奖励事务处理失败', error);
        
        // 如果星星已经扣除，尝试回滚
        if (deductResult && deductResult.success) {
          await this._rollbackStarDeduction(actualCost, reward, userId, '兑换事务处理失败');
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

      if (this.enableCloudStorage) {
        const exchangeUserId = reward.exchangeUserId || this.userService?.getCurrentUserId?.() || null;
        const modifyTime = Date.now();
        const response = await this._syncCancelExchangeToCloud(
          rewardId,
          exchangeUserId,
          modifyTime
        );

        const cloudReward = this._mapCloudReward(response.reward || {
          ...reward,
          rewardId: reward.id,
          claimed: false,
          claimTime: 0,
          claimStatus: 'available',
          deliveryTime: 0,
          exchangeUserId: null,
          modifyTime
        });
        cloudReward.pendingSyncMeta = null;
        cloudReward.syncedToCloud = true;
        await this.rewardRepository.save(cloudReward);

        if (this.starService?.refreshStarsFromCloud && exchangeUserId) {
          // 取消兑换成功后同样需要按最新云端余额回刷孩子星星镜像。
          await this.starService.refreshStarsFromCloud(exchangeUserId, {
            forceCloudAfterAuthority: true
          }).catch(() => null);
        }

        const pointsRefunded = Number(response.refundedPoints || 0);
        const operatorContext = this._getOperatorContext(exchangeUserId, 'execute');
        this.eventBus.emit(EVENTS.REWARD_UNCLAIMED, {
          reward: cloudReward,
          pointsRefunded,
          operatorUserId: operatorContext.actorUserId || null
        });
        this.eventBus.emit(EVENTS.REWARD_EXCHANGE_CANCELLED, {
          reward: cloudReward,
          pointsRefunded,
          record: response.refundRecord || null
        });

        return {
          success: true,
          reward: cloudReward,
          pointsRefunded,
          message: '取消兑换成功'
        };
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
  async calculateNextAvailableReward(knownStarCount = null, userId = null) {
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
      
      // 获取所有可用奖励（按 userId 过滤）
      let availableRewards = await this.getAvailableRewards(false, false, userId);
      
      // 如果没有可用奖励，检查是否存在已兑换奖励
      if (availableRewards.length === 0) {
        logger.info('RewardService', '没有可用奖励，检查是否存在已兑换奖励');
        
        // 获取所有奖励（包括已兑换的），但不包括禁用的
        const allRewards = await this.getAvailableRewards(true, false, userId);
        
        // 进一步过滤：只考虑真正已兑换的奖励，排除禁用的奖励
        const actuallyClaimedRewards = allRewards.filter(reward => 
          reward.claimed && reward.enabled !== false
        );
        
        if (actuallyClaimedRewards.length > 0) {
          // 存在真正已兑换的奖励，返回allClaimed状态
          logger.info('RewardService', '存在真正已兑换奖励，返回allClaimed状态');
          const highestPointReward = [...actuallyClaimedRewards].sort((a, b) => b.points - a.points)[0];
          return {
            ...highestPointReward,
            remainingStars: 0,
            allClaimed: true
          };
        } else if (allRewards.length > 0) {
          // 有奖励但都是禁用的，不是已兑换的
          logger.info('RewardService', '发现禁用奖励，返回默认占位奖励');
        } else {
          // 真的没有任何奖励
          logger.info('RewardService', '没有任何奖励，返回默认占位奖励');
        }
        
        // 返回默认占位奖励
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
      const hasCustomReward = enabledRewards.some(reward => !this.isExampleReward(reward));
      
      logger.debug('RewardService', `是否只有示例奖励: ${!hasCustomReward}, 启用奖励数: ${enabledRewards.length}`);
      return !hasCustomReward;
    } catch (error) {
      logger.error('RewardService', '检查示例奖励失败', error);
      return true; // 出错时保守处理，假设只有示例奖励
    }
  }
  
  /**
   * 判断奖励是否示例奖励
   * @param {Object} reward 奖励对象
   * @returns {Boolean} 是否示例奖励
   */
  isExampleReward(reward) {
    if (!reward) {
      return false;
    }

    if (reward.isExample === true) {
      return true;
    }

    if (typeof reward.id !== 'string') {
      return false;
    }

    return LEGACY_EXAMPLE_REWARD_ID_PATTERNS.some((pattern) => pattern.test(reward.id));
  }

  _isExampleReward(reward) {
    return this.isExampleReward(reward);
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

  /**
   * 获取指定用户的最后一次兑换时间（用于家庭视角展示，不影响现有 taskId 调用）
   * @param {String} userId 用户ID
   * @returns {Promise<Number|null>} 最后一次兑换的时间戳
   */
  async getLastExchangeTimeByUser(userId) {
    try {
      const claimedRewards = await this.rewardRepository.getClaimedRewards();
      if (!claimedRewards || claimedRewards.length === 0) return null;

      const userRewards = userId
        ? claimedRewards.filter(r => r.userId === userId)
        : claimedRewards;

      if (userRewards.length === 0) return null;

      const lastTime = Math.max(...userRewards.map(r => r.claimTime || 0));
      return lastTime > 0 ? lastTime : null;
    } catch (error) {
      logger.error('RewardService', '获取用户最后兑换时间失败', error);
      return null;
    }
  }

  /**
   * 星星扣除回滚处理（私有方法）
   * @param {Number} actualCost 需要回滚的星星数量
   * @param {Object} reward 奖励对象
   * @param {String} userId 用户ID
   * @param {String} reason 回滚原因
   * @returns {Promise<Boolean>} 回滚是否成功
   * @private
   */
  async _rollbackStarDeduction(actualCost, reward, userId, reason = '兑换奖励失败') {
    if (actualCost <= 0) {
      logger.info('RewardService', '无需回滚星星扣除，actualCost为0');
      return true;
    }

    try {
      logger.warn('RewardService', `开始回滚星星扣除操作, 用户=${userId}, 回滚数量=${actualCost}, 原因=${reason}`);
      
      const permanentGroup = await this.starGroupRepository.getOrCreateGroup(
        'permanent', 
        null, 
        '永久有效',
        userId
      );
      
      if (!permanentGroup) {
        logger.error('RewardService', '获取永久星星分组失败，回滚中止');
        return false;
      }

      await this.starGroupRepository.addStarsToGroup(
        permanentGroup,
        actualCost,
        `${reason}回滚: ${reward.name}`,
        userId
      );
      
      logger.info('RewardService', `星星回滚成功，退还${actualCost}颗星星, 用户=${userId}`);
      return true;
    } catch (rollbackError) {
      logger.error('RewardService', '星星回滚失败', rollbackError);
      return false;
    }
  }

  /**
   * 更新用户服务实例
   * @param {UserService} userService 新的用户服务实例
   */
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
}

module.exports = RewardService; 
