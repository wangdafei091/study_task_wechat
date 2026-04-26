/**
 * services/message-service.js - 消息服务
 * 
 * 处理系统消息相关的业务逻辑，包括任务消息、系统通知等
 * 基于 MessageRepository、领域模型 helper 与云端同步能力协作完成消息读写
 */

const logger = require('../utils/logger');
const EventBus = require('../utils/core/event-bus');
const { MessageRepository } = require('../repositories/index');
const {
  Message,
  MessageType,
  NotificationType,
  MessagePriority,
  MessageVisibilityScope
} = require('../models/message');
const batchUtils = require('../utils/batchUtils');
const { EVENTS } = require('../utils/constants');
const HttpClient = require('../utils/http-client');
const API_CONFIG = require('../utils/api-config');
const messageDisplay = require('../utils/message-display');
const { isSystemReadonlyUser } = require('../utils/system-access');
const messageProvisional = require('./message-service/message-provisional');
const messageHandlers = require('./message-service/message-handlers');
const messageDomain = require('./message-service/message-domain');

const FORMAL_REMINDER_SYNC_MIN_INTERVAL_MS = 10 * 1000;
const viewScopeUtils = require('../utils/view-scope');

class MessageService {
  /**
   * 构造函数
   * @param {Object} options 选项
   * @param {EventBus} options.eventBus 事件总线
   * @param {MessageRepository} options.messageRepository 消息仓储
   * @param {UserService} options.userService 用户服务
   */
  constructor(options = {}) {
    // 初始化事件总线
    this.eventBus = options.eventBus || new EventBus();
    
    // 新的领域模型仓储
    this.messageRepository = options.messageRepository || new MessageRepository();
    
    // 用户服务
    this.userService = options.userService || null;
    this.starService = options.starService || null;
    this.enableCloudStorage = API_CONFIG.ENABLE_API;
    this._formalReminderSyncTimestamps = new Map();
    this._formalReminderSyncInFlight = new Map();
    this._listenerMap = this._createListenerMap();
    
    logger.info('MessageService', '初始化消息服务');
    
    // 注册事件监听
    this._registerEventListeners();
  }
  
  /**
   * 初始化服务
   * @returns {Promise<void>}
   */
  async initialize() {
    logger.info('MessageService', '启动消息服务');
    try {
      // 加载消息仓储
      await this.messageRepository.loadFromStorage();
      logger.info('MessageService', '已加载消息仓储');
      
      // 清理过期消息
      // 注意：此处仅初始化新领域模型，不会影响现有功能
      try {
        const cleanedCount = await this.messageRepository.cleanExpiredMessages(30);
        if (cleanedCount > 0) {
          logger.info('MessageService', `已清理${cleanedCount}条过期消息`);
        }
      } catch (error) {
        logger.warn('MessageService', '清理过期消息失败', error);
      }
      
      return true;
    } catch (error) {
      logger.error('MessageService', '初始化消息服务失败', error);
      return true; // 仍然返回true以避免阻止应用启动
    }
  }
  
  /**
   * 注册事件监听器
   * @private
   */
  _registerEventListeners() {
    this._registerLocalModeListeners();
    this._registerCloudFallbackListeners();
    this._registerDomainObservers();

    logger.info('MessageService', '已注册事件监听器');
  }

  _createListenerMap() {
    return messageHandlers.createListenerMap(this);
  }

  _registerLocalModeListeners() {
    // 任务相关事件
    this.eventBus.on(EVENTS.TASK_CREATED, this._listenerMap.taskCreated);
    this.eventBus.on(EVENTS.TASK_COMPLETED, this._listenerMap.taskCompleted);
    this.eventBus.on(EVENTS.TASK_UPDATED, this._listenerMap.taskUpdated);
    this.eventBus.on(EVENTS.TASK_DELETED, this._listenerMap.taskDeleted);
    this.eventBus.on(EVENTS.TASK_STATUS_UPDATED, this._listenerMap.taskStatusUpdated);
    this.eventBus.on(EVENTS.TASK_UPCOMING, this._listenerMap.taskUpcoming);
    this.eventBus.on(EVENTS.TASK_PENALTY_APPLIED, this._listenerMap.taskPenaltyApplied);
    this.eventBus.on(EVENTS.TASK_MARKED_REQUIRED, this._listenerMap.taskMarkedRequired);
    this.eventBus.on(EVENTS.TASK_UNMARKED_REQUIRED, this._listenerMap.taskUnmarkedRequired);

    // 奖励相关事件
    this.eventBus.on(EVENTS.REWARD_CREATED, this._listenerMap.rewardCreated);
    this.eventBus.on(EVENTS.REWARD_CLAIMED, this._listenerMap.rewardClaimed);
    this.eventBus.on(EVENTS.REWARD_DELIVERED, this._listenerMap.rewardDelivered);
    this.eventBus.on(EVENTS.REWARD_UNCLAIMED, this._listenerMap.rewardUnclaimed);
    this.eventBus.on(EVENTS.REWARD_DELETED_BATCH, this._listenerMap.rewardDeletedBatch);
    this.eventBus.on(EVENTS.REWARD_EXAMPLES_CLEARED, this._listenerMap.rewardExamplesCleared);
  }

  _registerCloudFallbackListeners() {
    this.eventBus.on(EVENTS.TASK_CLOUD_SYNC_FAILED, this._listenerMap.taskCloudSyncFailed);
    this.eventBus.on(EVENTS.REWARD_CLOUD_SYNC_FAILED, this._listenerMap.rewardCloudSyncFailed);
  }

  _registerDomainObservers() {
    this.eventBus.on(EVENTS.DOMAIN_MESSAGE_CREATED, this._listenerMap.domainMessageCreated);
    this.eventBus.on(EVENTS.DOMAIN_MESSAGE_UPDATED, this._listenerMap.domainMessageUpdated);
    this.eventBus.on(EVENTS.DOMAIN_MESSAGE_DELETED, this._listenerMap.domainMessageDeleted);
    this.eventBus.on(EVENTS.DOMAIN_MESSAGE_READ, this._listenerMap.domainMessageRead);
    this.eventBus.on(EVENTS.DOMAIN_MESSAGE_ALL_READ, this._listenerMap.domainMessageAllRead);
  }

  _getLoginUser() {
    return this.userService?.getLoginUser?.() || null;
  }

  _getCurrentUser() {
    return this.userService?.getCurrentUser?.() || null;
  }

  _getAvailableUsers() {
    return this.userService?.getAllUsers?.() || [];
  }

  _getUserIdentifier(user) {
    return viewScopeUtils.getUserIdentifier(user) || null;
  }

  _resolveOperatorIdentity(operatorUserId = null) {
    const fallbackUserId = operatorUserId || this.userService?.getCurrentUserId?.() || 'parent';

    if (fallbackUserId === 'parent' || fallbackUserId === 'child') {
      return {
        userId: fallbackUserId,
        role: fallbackUserId
      };
    }

    const currentUser = this._getCurrentUser();
    if (this._getUserIdentifier(currentUser) === fallbackUserId) {
      return {
        userId: fallbackUserId,
        role: currentUser?.role || null
      };
    }

    const loginUser = this._getLoginUser();
    if (this._getUserIdentifier(loginUser) === fallbackUserId) {
      return {
        userId: fallbackUserId,
        role: loginUser?.role || null
      };
    }

    const cachedUser = this.userService?.getUserById?.(fallbackUserId) || null;
    return {
      userId: fallbackUserId,
      role: cachedUser?.role || null
    };
  }

  _getUserIdByRole(role) {
    const currentUser = this._getCurrentUser();
    if (currentUser?.role === role) {
      return this._getUserIdentifier(currentUser) || role;
    }

    const loginUser = this._getLoginUser();
    if (loginUser?.role === role) {
      return this._getUserIdentifier(loginUser) || role;
    }

    const roleUser = this.userService?.getUserByRole?.(role) || null;
    if (roleUser) {
      return this._getUserIdentifier(roleUser) || role;
    }

    const allUsers = this.userService?.getAllUsers?.() || [];
    const matchedUser = allUsers.find(user => user?.role === role);
    return this._getUserIdentifier(matchedUser) || role;
  }

  _buildTaskLocalMessageMeta(task, notificationType, options = {}) {
    return messageDomain.buildTaskLocalMessageMeta(this, task, notificationType, options);
  }

  _resolveScopeOptions(options = {}) {
    const loginUser = this._getLoginUser();
    const currentUser = this._getCurrentUser();
    const availableUsers = this._getAvailableUsers();
    if (!options.scope && !loginUser && !currentUser) {
      return {
        scope: 'all',
        userId: null,
        familyId: null,
        requireFresh: false,
        preferScope: null
      };
    }
    const currentUserId = options.userId || viewScopeUtils.getUserIdentifier(currentUser) || viewScopeUtils.getUserIdentifier(loginUser);
    const familyId = loginUser?.familyId || currentUser?.familyId || null;
    const defaultScope = viewScopeUtils.resolveMessageScopeOptions(loginUser, currentUser, availableUsers).scope || MessageVisibilityScope.USER;
    const scope = options.scope || defaultScope;

    return {
      scope,
      userId: scope === MessageVisibilityScope.USER ? currentUserId : null,
      familyId,
      requireFresh: options.requireFresh === true,
      preferScope: options.preferScope || null,
      skipExpiryAuthoritySyncBeforeFormalReminders:
        options.skipExpiryAuthoritySyncBeforeFormalReminders === true
    };
  }

  _sortMessages(messages = []) {
    return [...messages].sort((a, b) => b.createTime - a.createTime);
  }

  _getDisplayCompactGroup(notificationType) {
    const compactGroups = [
      ['task_upcoming'],
      ['task_create', 'task_update', 'task_required', 'task_unrequired'],
      ['reward_create', 'reward_update']
    ];

    return compactGroups.find((group) => group.includes(notificationType)) || null;
  }

  _compactMessagesForDisplay(messages = []) {
    const sortedMessages = this._sortMessages(messageDisplay.dedupeMessagesByEventKey(messages));
    const compactedMessages = [];
    const seenKeys = new Set();

    sortedMessages.forEach((message) => {
      const compactGroup = this._getDisplayCompactGroup(message.notificationType);
      if (!compactGroup || !message.relatedId) {
        compactedMessages.push(message);
        return;
      }

      const compactKey = [
        message.visibilityScope || 'unknown',
        message.userId || '',
        message.familyId || '',
        message.relatedType || '',
        message.relatedId,
        compactGroup.join(',')
      ].join('|');

      if (seenKeys.has(compactKey)) {
        return;
      }

      seenKeys.add(compactKey);
      compactedMessages.push(message);
    });

    return compactedMessages;
  }

  _getRoleDisplayName(role) {
    return role === 'parent' ? '家长' : '孩子';
  }

  _normalizeDisplayName(name, role) {
    if (name && name !== '用户') {
      return name;
    }
    return this._getRoleDisplayName(role);
  }

  _getLocalUserDisplayName(userId, roleHint = null) {
    if (!userId) {
      return this._normalizeDisplayName(null, roleHint);
    }
    const user = this.userService?.getUserById?.(userId) || null;
    const rawName = user?.name || user?.nickname || null;
    return this._normalizeDisplayName(rawName, user?.role || roleHint);
  }

  _buildTaskMessageCopy({ action, taskTitle, actorUserId = null, actorRole = null, subjectUserId = null, actorName = null, subjectName = null, pending = false }) {
    return messageProvisional.buildTaskMessageCopy(this, {
      action,
      taskTitle,
      actorUserId,
      actorRole,
      subjectUserId,
      actorName,
      subjectName,
      pending
    });
  }

  _mapCloudMessage(item) {
    return new Message({
      id: item.messageId || item.id,
      familyId: item.familyId || null,
      userId: item.userId || '',
      actorUserId: item.actorUserId || null,
      subjectUserId: item.subjectUserId || null,
      operationKey: item.operationKey || null,
      messageEventKey: item.messageEventKey || null,
      visibilityScope: item.visibilityScope || (item.userId ? MessageVisibilityScope.USER : MessageVisibilityScope.FAMILY),
      type: item.type || MessageType.NOTIFICATION,
      notificationType: item.notificationType || NotificationType.INFO,
      title: item.title || '',
      summary: item.summary || '',
      content: item.content || '',
      relatedId: item.relatedId || '',
      relatedType: item.relatedType || '',
      isRead: item.isRead === true,
      isArchived: item.isArchived === true,
      readTime: item.readTime || 0,
      createTime: item.createTime || Date.now(),
      icon: item.icon || '',
      priority: item.priority ?? MessagePriority.MEDIUM,
      syncedToCloud: true,
      isLegacy: false,
      isProvisional: false
    });
  }

  _isFormalMessage(message) {
    return Boolean(message && message.syncedToCloud === true && message.isProvisional !== true && message.isLegacy !== true);
  }

  _isProvisionalMessage(message) {
    return Boolean(message && message.isProvisional === true && message.syncedToCloud !== true);
  }

  _isLegacyMessage(message) {
    return Boolean(message && message.isLegacy === true);
  }

  _isCurrentScopeCompatibleMessage(message) {
    return Boolean(message && !this._isFormalMessage(message) && !this._isProvisionalMessage(message) && !this._isLegacyMessage(message));
  }

  async _getRawMessagesByScope(resolved) {
    return resolved.scope === 'all'
      ? this.messageRepository.getAll()
      : this.messageRepository.getMessagesByScope(resolved);
  }

  async _getScopedMessagesForDisplay(resolved) {
    const rawMessages = await this._getRawMessagesByScope(resolved);

    if (!this.enableCloudStorage || resolved.scope === 'all') {
      return rawMessages;
    }

    return rawMessages.filter((message) => (
      this._isFormalMessage(message) || this._isProvisionalMessage(message)
    ));
  }

  async _refreshFormalMessagesFromCloud(resolved) {
    const params = {
      scope: resolved.scope
    };
    if (resolved.scope === MessageVisibilityScope.USER && resolved.userId) {
      params.userId = resolved.userId;
    }

    const response = await HttpClient.get(API_CONFIG.ENDPOINTS.MESSAGES, params);
    const cloudMessages = (response.messages || []).map(item => this._mapCloudMessage(item));
    await this.messageRepository.archiveLegacyMessages(resolved.scope, resolved.userId);
    await this.messageRepository.replaceSyncedMessagesByScope(resolved.scope, resolved.userId, cloudMessages);
    await this.messageRepository.cleanupStaleMessages(
      resolved.scope,
      resolved.userId,
      cloudMessages.map(message => message.id)
    );

    return cloudMessages;
  }

  async refreshMessagesFromCloud(userId = null, options = {}) {
    const resolved = this._resolveScopeOptions({ ...options, userId });

    if (!this.enableCloudStorage) {
      const localMessages = await this._getScopedMessagesForDisplay(resolved);
      return this._compactMessagesForDisplay(localMessages);
    }

    if (resolved.scope === 'all') {
      return this._compactMessagesForDisplay(await this._getScopedMessagesForDisplay(resolved));
    }

    if (!this._getReadonlyReason()) {
      await this.syncFormalRemindersIfNeeded(resolved);
    }
    await this._refreshFormalMessagesFromCloud(resolved);

    await this._emitMessageChangedEvent();
    return this._compactMessagesForDisplay(await this._getScopedMessagesForDisplay(resolved));
  }

  _buildFormalReminderSyncScopeKey(resolved) {
    return `${resolved.scope}:${resolved.userId || resolved.familyId || 'all'}`;
  }

  _getReadonlyReason() {
    const loginUser = this._getLoginUser();
    if (isSystemReadonlyUser(loginUser)) {
      return 'system_readonly';
    }

    if (Boolean(
      loginUser &&
      loginUser.role === 'parent' &&
      loginUser.familyPermissionRole === 'viewer'
    )) {
      return 'viewer_readonly';
    }

    return '';
  }

  async syncFormalRemindersIfNeeded(options = {}) {
    const resolved = this._resolveScopeOptions(options);
    if (!this.enableCloudStorage || !resolved || resolved.scope === 'all') {
      return { success: false, skipped: true };
    }

    const readonlyReason = this._getReadonlyReason();
    if (readonlyReason) {
      return { success: true, skipped: true, reason: readonlyReason };
    }

    const now = Date.now();
    const scopeKey = this._buildFormalReminderSyncScopeKey(resolved);
    const lastSyncTime = this._formalReminderSyncTimestamps.get(scopeKey) || 0;
    if (now - lastSyncTime < FORMAL_REMINDER_SYNC_MIN_INTERVAL_MS) {
      return { success: true, skipped: true, reason: 'throttled' };
    }

    const inFlightSync = this._formalReminderSyncInFlight.get(scopeKey);
    if (inFlightSync) {
      return inFlightSync;
    }

    const syncPromise = (async () => {
      const payload = {
        scope: resolved.scope,
        targetUserId: resolved.scope === MessageVisibilityScope.USER ? resolved.userId : undefined,
        modifyTime: now,
        operationKey: `message_refresh:${scopeKey}:${now}`
      };

      try {
        if (!resolved.skipExpiryAuthoritySyncBeforeFormalReminders) {
          await this._syncExpiryAuthorityBeforeFormalReminders(resolved);
        }
        const [upcomingResult, starsResult] = await Promise.allSettled([
          HttpClient.post(API_CONFIG.ENDPOINTS.TASK_UPCOMING_SYNC, payload),
          HttpClient.post(API_CONFIG.ENDPOINTS.STAR_EXPIRING_REMINDERS_SYNC, payload)
        ]);
        this._formalReminderSyncTimestamps.set(scopeKey, Date.now());

        if (upcomingResult.status === 'rejected') {
          logger.warn('MessageService', 'upcoming 正式提醒同步失败，继续读取现有正式消息', {
            scope: resolved.scope,
            userId: resolved.userId || null,
            error: upcomingResult.reason?.message || 'unknown'
          });
        }

        if (starsResult.status === 'rejected') {
          logger.warn('MessageService', 'star_expiring 正式提醒同步失败，继续读取现有正式消息', {
            scope: resolved.scope,
            userId: resolved.userId || null,
            error: starsResult.reason?.message || 'unknown'
          });
        }

        return {
          success: upcomingResult.status === 'fulfilled' || starsResult.status === 'fulfilled',
          skipped: false,
          upcoming: upcomingResult.status === 'fulfilled',
          stars: starsResult.status === 'fulfilled',
        };
      } catch (error) {
        logger.warn('MessageService', '正式提醒同步失败，继续读取现有正式消息', {
          scope: resolved.scope,
          userId: resolved.userId || null,
          error: error.message
        });
        return { success: false, skipped: false, error: error.message };
      } finally {
        this._formalReminderSyncInFlight.delete(scopeKey);
      }
    })();

    this._formalReminderSyncInFlight.set(scopeKey, syncPromise);

    return syncPromise;
  }

  async _syncExpiryAuthorityBeforeFormalReminders(resolved) {
    try {
      if (!this.starService || typeof this.starService.syncExpiryAuthorityIfNeeded !== 'function') {
        return;
      }

      await this.starService.syncExpiryAuthorityIfNeeded({
        scope: resolved.scope,
        userId: resolved.userId || null,
        familyId: resolved.familyId || null
      });
    } catch (error) {
      logger.warn('MessageService', '正式提醒前的星星到期权威同步失败，继续执行提醒同步', {
        scope: resolved.scope,
        userId: resolved.userId || null,
        error: error.message
      });
    }
  }

  async _syncUpcomingMessagesIfNeeded(resolved) {
    return this.syncFormalRemindersIfNeeded(resolved);
  }

  async getMessagesByScope(options = {}) {
    const resolved = this._resolveScopeOptions(options);
    if (resolved.requireFresh && this.enableCloudStorage) {
      await this.refreshMessagesFromCloud(resolved.userId, resolved);
    }

    const messages = await this._getScopedMessagesForDisplay(resolved);
    return this._compactMessagesForDisplay(messages);
  }

  async _syncReadToCloud(message) {
    if (!this.enableCloudStorage || !message || message.syncedToCloud !== true || message.isProvisional) {
      return;
    }

    const url = API_CONFIG.ENDPOINTS.MESSAGE_READ.replace('{messageId}', message.id);
    await HttpClient.patch(url, {
      readTime: message.readTime || Date.now()
    });
  }

  async _syncDeleteToCloud(message) {
    if (!this.enableCloudStorage || !message || message.syncedToCloud !== true || message.isProvisional) {
      return;
    }

    const url = API_CONFIG.ENDPOINTS.MESSAGE_BY_ID.replace('{messageId}', message.id);
    await HttpClient.delete(url);
  }

  async _syncMarkAllReadToCloud(options = {}) {
    if (!this.enableCloudStorage) {
      return;
    }

    const resolved = this._resolveScopeOptions(options);
    await HttpClient.patch(API_CONFIG.ENDPOINTS.MESSAGE_READ_ALL, {
      scope: resolved.scope,
      userId: resolved.userId || undefined,
      readTime: Date.now()
    });
  }

  async _createProvisionalMessages(eventType, payload = {}) { return messageProvisional.createProvisionalMessages(this, eventType, payload); }
  async _createTaskProvisionalMessages(task, pendingSyncMeta) { return messageProvisional.createTaskProvisionalMessages(this, task, pendingSyncMeta); }
  async _createRewardProvisionalMessages(reward, pendingSyncMeta) { return messageProvisional.createRewardProvisionalMessages(this, reward, pendingSyncMeta); }
  _handleTaskCloudSyncFailed(payload) { messageProvisional.handleTaskCloudSyncFailed(this, payload); }
  _handleRewardCloudSyncFailed(payload) { messageProvisional.handleRewardCloudSyncFailed(this, payload); }
  
  /**
   * 处理任务创建事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleTaskCreated(data) {
    if (this.enableCloudStorage) {
      return;
    }
    logger.info('MessageService', '处理任务创建事件', data);
    
    // 防御性检查，确保data对象和task存在
    if (!data) {
      logger.warn('MessageService', '处理任务创建事件失败：数据为空');
      return;
    }
    
    // 兼容不同的数据结构形式
    let task;
    if (data.task) {
      task = data.task;
    } else if (data.originalTask) {
      task = data.originalTask;
    } else if (Array.isArray(data.tasks) && data.tasks.length > 0) {
      task = data.tasks[0];
    }
    
    if (!task) {
      logger.warn('MessageService', '处理任务创建事件失败：无法获取任务对象', data);
      return;
    }
    
    logger.info('MessageService', `处理任务创建事件: ${task.title}`);
    
    // 构建消息对象
    const batchInfo = data.batchInfo || {};
    
    // 直接创建领域模型消息
    this._createTaskMessageWithDomainModel(task, NotificationType.NEW, {
      isBatchOperation: batchInfo.isBatchOperation,
      batchCount: batchInfo.count || 0,
      priority: MessagePriority.MEDIUM
    });
  }
  
  /**
   * 处理任务状态更新事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleTaskStatusUpdated(data) {
    if (this.enableCloudStorage) {
      return;
    }
    const { task, previousStatus, operationType, operatorUserId } = data;
    
    if (['complete', 'history_complete', 'makeup_complete'].includes(operationType)) {
      logger.info('MessageService', `处理任务完成事件: ${task.title}, 操作者=${operatorUserId || '未指定'}`);

      const notificationType = operationType === 'makeup_complete'
        ? NotificationType.MAKEUP_COMPLETED
        : operationType === 'history_complete'
          ? NotificationType.HISTORY_COMPLETED
          : NotificationType.COMPLETED;

      this._createTaskMessageWithDomainModel(task, notificationType, {
        priority: MessagePriority.HIGH,
        operatorUserId: operatorUserId
      });
    }
  }
  
  /**
   * 处理任务更新事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleTaskUpdated(data) {
    if (this.enableCloudStorage) {
      return;
    }
    const { task, changes, batchInfo, operatorUserId } = data;
    
    logger.info('MessageService', `处理任务更新事件: ${task.title}, 操作者=${operatorUserId || '未指定'}`);
    
    // 更新任务相关消息
    this._updateTaskMessagesWithDomainModel(task);
    
    // 创建任务更新消息，传递操作者信息
    this._createTaskMessageWithDomainModel(task, NotificationType.UPDATED, {
      isBatchOperation: batchInfo && batchInfo.isBatchOperation,
      batchCount: batchInfo && batchInfo.count || 0,
      priority: MessagePriority.MEDIUM,
      operatorUserId: operatorUserId // 传递操作者信息
    });
  }
  
  /**
   * 处理任务删除事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleTaskDeleted(data) {
    if (this.enableCloudStorage) {
      return;
    }
    const { taskId, taskInfo, batchInfo, operatorUserId } = data;
    
    logger.info('MessageService', `处理任务删除事件: ${taskInfo.title || taskId}, 操作者=${operatorUserId || '未指定'}`);
    
    // 删除任务相关消息
    this._deleteRelatedMessagesWithDomainModel(taskId);
    
    // 创建任务删除消息，传递操作者信息
    this._createTaskMessageWithDomainModel(taskInfo, NotificationType.DELETED, {
      isBatchOperation: batchInfo && batchInfo.isBatchOperation,
      batchCount: batchInfo && batchInfo.count || 0,
      priority: MessagePriority.LOW,
      operatorUserId: operatorUserId // 传递操作者信息
    });
  }
  
  /**
   * 处理任务完成事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleTaskCompleted(data) {
    if (this.enableCloudStorage) {
      return;
    }
    const { task, operatorUserId } = data;
    
    logger.info('MessageService', `处理任务完成事件: ${task.title}, 操作者=${operatorUserId || '未指定'}`);
    
    // 创建任务完成消息，传递操作者信息
    this._createTaskMessageWithDomainModel(task, NotificationType.COMPLETED, {
      priority: MessagePriority.HIGH,
      operatorUserId: operatorUserId // 传递操作者信息
    });
  }
  
  /**
   * 处理即将到期的任务
   * @param {Object} data 事件数据
   * @private
   */
  _handleUpcomingTask(data) {
    if (this.enableCloudStorage) {
      return;
    }
    const { task, timeRemaining } = data;
    
    logger.info('MessageService', `处理即将到期任务: ${task.title}, 剩余时间: ${timeRemaining}分钟`);
    
    // 获取格式化后的剩余时间
    let remainingText = this._calculateRemainingTime(task);
    
    // 创建即将到期消息
    this._createTaskMessageWithDomainModel(task, NotificationType.UPCOMING, {
      timeRemaining: timeRemaining || 0,
      remainingText: remainingText,
      priority: MessagePriority.HIGH
    });
  }
  
  /**
   * 处理任务惩罚事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleTaskPenalty(data) {
    if (this.enableCloudStorage) {
      return;
    }
    const { task, penaltyPoints } = data;
    
    logger.info('MessageService', `处理任务惩罚事件: ${task.title}, 扣除星星: ${penaltyPoints}`);
    
    // 创建惩罚消息
    this._createPenaltyMessageWithDomainModel(task, penaltyPoints);
  }
  
  /**
   * 处理任务标记为必做事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleTaskMarkedRequired(data) {
    if (this.enableCloudStorage) {
      return;
    }
    const { task } = data;
    
    logger.info('MessageService', `处理任务标记为必做事件: ${task.title}`);
    
    // 创建必做任务提醒消息
    this._createTaskMessageWithDomainModel(task, NotificationType.REQUIRED, {
      priority: MessagePriority.HIGH
    });
  }
  
  /**
   * 处理任务取消必做标记事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleTaskUnmarkedRequired(data) {
    if (this.enableCloudStorage) {
      return;
    }
    const { task } = data;
    
    logger.info('MessageService', `处理任务取消必做标记事件: ${task.title}`);
    
    // 没有必要发送消息，但可以记录日志
  }
  
  /**
   * 处理奖励领取事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleRewardClaimed(data) {
    if (this.enableCloudStorage) {
      return;
    }
    logger.info('MessageService', '收到奖励领取事件，原始数据:', data);
    
    // 兼容不同的事件数据格式
    let reward;
    
    if (data.reward) {
      // 新格式：直接包含reward对象
      reward = {
        ...data.reward,
        exchangeUserId: data.reward.exchangeUserId || data.exchangeUserId || data.userId || null,
        actualCost: data.actualCost ?? data.reward.actualCost ?? data.points ?? data.reward.points ?? 0
      };
      logger.info('MessageService', '使用新格式事件数据（包含reward对象）');
    } else if (data.rewardId && data.rewardName) {
      // 兼容格式：从rewardId和rewardName构造reward对象
      reward = {
        id: data.rewardId,
        name: data.rewardName,
        points: data.originalPoints ?? data.points ?? 0,
        actualCost: data.actualCost ?? data.points ?? 0,
        fulfillmentMode: data.fulfillmentMode || null,
        exchangeUserId: data.exchangeUserId || data.userId || null
      };
      logger.info('MessageService', '使用兼容格式事件数据（rewardId + rewardName）');
    } else {
      logger.warn('MessageService', '奖励领取事件数据格式不正确，跳过处理', data);
      return;
    }
    
    // 获取操作者信息
    const operatorUserId = data.operatorUserId || data.userId || null;
    
    logger.info('MessageService', `处理奖励领取事件: ${reward.name}, ID=${reward.id}, 消耗星星=${reward.points}, 操作者=${operatorUserId || '未指定'}`);
    
    // 创建奖励领取消息，传递操作者信息
    try {
      this._createRewardMessageWithDomainModel(reward, 'claimed', {
        operatorUserId: operatorUserId,
        actualCost: data.actualCost ?? reward.actualCost ?? reward.points ?? 0
      });
    } catch (error) {
      logger.error('MessageService', '创建奖励领取消息失败', error);
    }
  }
  
  /**
   * 处理奖励交付事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleRewardDelivered(data) {
    if (this.enableCloudStorage) {
      return;
    }
    const { reward } = data;
    
    logger.info('MessageService', `处理奖励交付事件: ${reward.name}`);
    
    // 创建奖励交付消息
    this._createRewardMessageWithDomainModel(reward, 'delivered');
  }
  
  /**
   * 处理奖励取消领取事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleRewardUnclaimed(data) {
    if (this.enableCloudStorage) {
      return;
    }
    const { reward } = data;
    const operatorUserId = data.operatorUserId || data.userId || null;
    
    logger.info('MessageService', `处理奖励取消领取事件: ${reward.name}`);
    
    // 创建奖励取消领取消息
    this._createRewardMessageWithDomainModel(reward, 'unclaimed', {
      operatorUserId,
      pointsRefunded: data.pointsRefunded ?? reward.pointsRefunded ?? reward.points ?? 0
    });
  }
  
  /**
   * 处理奖励批量删除事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleRewardDeletedBatch(data) {
    if (this.enableCloudStorage) {
      return;
    }
    const { rewardIds } = data;
    
    logger.info('MessageService', `处理奖励批量删除事件: 删除了${rewardIds.length}个奖励`);
    
    // 这是自动清理示例奖励的操作，不需要创建用户消息
    // 只记录日志即可
  }
  
  /**
   * 处理示例奖励清理事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleRewardExamplesCleared(data) {
    if (this.enableCloudStorage) {
      return;
    }
    const { count } = data;
    
    logger.info('MessageService', `处理示例奖励清理事件: 清理了${count}个示例奖励`);
    
    // 这是自动清理示例奖励的操作，不需要创建用户消息
    // 只记录日志即可
  }
  
  /**
   * 处理奖励创建事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleRewardCreated(data) {
    if (this.enableCloudStorage) {
      return;
    }
    const { reward } = data;
    
    if (!reward) {
      logger.warn('MessageService', '处理奖励创建事件失败：数据中缺少reward对象', data);
      return;
    }
    
    logger.info('MessageService', `处理奖励创建事件: ${reward.name}, ID=${reward.id}`);
    
    // 创建奖励创建消息
    try {
      this._createRewardMessageWithDomainModel(reward, 'created');
      logger.info('MessageService', '奖励创建消息创建成功');
    } catch (error) {
      logger.error('MessageService', '创建奖励创建消息失败', error);
    }
  }
  
  /**
   * 处理领域模型消息创建事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleDomainMessageCreated(data) {
    const { message } = data;
    
    if (!message) return;
    
    logger.info('MessageService', `处理领域模型消息创建事件: ${message.id}`);
    
    // 这里可以添加处理逻辑，但目前阶段不影响现有功能
    // 仅发布一个通用的消息变更事件
    this._emitMessageChangedEvent();
  }
  
  /**
   * 处理领域模型消息更新事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleDomainMessageUpdated(data) {
    const { message } = data;
    
    if (!message) return;
    
    logger.info('MessageService', `处理领域模型消息更新事件: ${message.id}`);
    
    // 这里可以添加处理逻辑，但目前阶段不影响现有功能
    // 仅发布一个通用的消息变更事件
    this._emitMessageChangedEvent();
  }
  
  /**
   * 处理领域模型消息删除事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleDomainMessageDeleted(data) {
    const { messageId } = data;
    
    logger.info('MessageService', `处理领域模型消息删除事件: ${messageId}`);
    
    // 这里可以添加处理逻辑，但目前阶段不影响现有功能
    // 仅发布一个通用的消息变更事件
    this._emitMessageChangedEvent();
  }
  
  /**
   * 处理领域模型消息已读事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleDomainMessageRead(data) {
    const { messageId } = data;
    
    logger.info('MessageService', `处理领域模型消息已读事件: ${messageId}`);
    
    // 这里可以添加处理逻辑，但目前阶段不影响现有功能
    // 仅发布一个通用的消息变更事件
    this._emitMessageChangedEvent();
  }
  
  /**
   * 处理领域模型消息全部已读事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleDomainMessageAllRead(data) {
    const { count } = data;
    
    logger.info('MessageService', `处理领域模型消息全部已读事件: 共${count}条`);
    
    // 这里可以添加处理逻辑，但目前阶段不影响现有功能
    // 仅发布一个通用的消息变更事件
    this._emitMessageChangedEvent();
  }
  
  /**
   * 创建系统消息
   * @param {String} content 消息内容
   * @param {String} type 消息类型
   * @param {Object} options 选项
   * @returns {Promise<Object>} 创建的消息对象
   */
  async createSystemMessage(content, type = 'system', options = {}) {
    logger.info('MessageService', `创建系统消息: ${content}`);
    
    try {
      const message = await this._createSystemMessageWithDomainModel(content, type, options);
      return Promise.resolve(message);
    } catch (error) {
      logger.error('MessageService', '创建系统消息失败', error);
      return Promise.reject(error);
    }
  }
  
  /**
   * 创建任务消息
   * @param {Object} task 任务对象
   * @param {String} type 消息类型
   * @param {Object} options 选项
   * @returns {Promise<Object>} 创建的消息对象
   */
  async createTaskMessage(task, type, options = {}) {
    logger.info('MessageService', `创建任务消息: ${task.title}, 类型: ${type}`);
    
    try {
      const message = await this._createTaskMessageWithDomainModel(task, type, options);
      return Promise.resolve(message);
    } catch (error) {
      logger.error('MessageService', '创建任务消息失败', error);
      return Promise.reject(error);
    }
  }
  
  /**
   * 获取所有消息
   * @returns {Promise<Array>} 消息数组
   */
  async getAllMessages(options = {}) {
    logger.info('MessageService', '获取所有消息');
    
    try {
      const messages = await this.getMessagesByScope(options);
      return Promise.resolve(messages);
    } catch (error) {
      logger.error('MessageService', '获取所有消息失败', error);
      return Promise.resolve([]); // 返回空数组而非拒绝，避免UI崩溃
    }
  }
  
  /**
   * 获取未读消息数量
   * @returns {Promise<Number>} 未读消息数量
   */
  async getUnreadCount(options = {}) {
    logger.info('MessageService', '获取未读消息数量');
    
    try {
      if (!this._getLoginUser() && !this._getCurrentUser() && !options.scope && typeof this.messageRepository.getUnreadCount === 'function') {
        const count = await this.messageRepository.getUnreadCount();
        return Promise.resolve(count);
      }
      const messages = await this.getMessagesByScope(options);
      const count = messages.filter(message => !message.isRead).length;
      return Promise.resolve(count);
    } catch (error) {
      logger.error('MessageService', '获取未读消息数量失败', error);
      return Promise.resolve(0); // 出错时返回0而非拒绝
    }
  }
  
  /**
   * 标记消息为已读
   * @param {String} messageId 消息ID
   * @returns {Promise<Boolean>} 标记结果
   */
  async markMessageAsRead(messageId, options = {}) {
    logger.info('MessageService', `标记消息为已读: ${messageId}`);
    
    try {
      if (!this._getLoginUser() && !this._getCurrentUser() && !options.scope) {
        const result = await this._markMessageAsReadWithDomainModel(messageId);
        return Promise.resolve(result);
      }
      const message = await this.messageRepository.getById(messageId);
      if (!message) {
        return Promise.resolve(false);
      }

      if (this.enableCloudStorage && message.isProvisional !== true && message.syncedToCloud === true) {
        try {
          await this._syncReadToCloud({ ...message, isRead: true, readTime: Date.now() });
        } catch (syncError) {
          logger.warn('MessageService', '单条消息已读同步失败，放弃本地已读写入', syncError);
          return Promise.resolve(false);
        }
      }

      const result = await this._markMessageAsReadWithDomainModel(messageId);
      return Promise.resolve(result);
    } catch (error) {
      logger.error('MessageService', '标记消息为已读失败', error);
      return Promise.resolve(false); // 出错时返回false而非拒绝
    }
  }
  
  /**
   * 标记所有消息为已读
   * @returns {Promise<Number>} 标记的消息数量
   */
  async markAllMessagesAsRead(options = {}) {
    logger.info('MessageService', '标记所有消息为已读');
    
    try {
      if (!this._getLoginUser() && !this._getCurrentUser() && !options.scope) {
        const count = typeof this.messageRepository.markAllAsRead === 'function'
          ? await this.messageRepository.markAllAsRead()
          : await this._markAllMessagesAsReadWithDomainModel();
        return Promise.resolve(count);
      }
      const resolved = this._resolveScopeOptions(options);
      const scopedMessages = await this._getScopedMessagesForDisplay(resolved);
      const unreadMessages = scopedMessages.filter(message => !message.isRead);
      const hasFormalCloudMessages = unreadMessages.some(
        message => this._isFormalMessage(message)
      );

      if (hasFormalCloudMessages) {
        try {
          await this._syncMarkAllReadToCloud(resolved);
        } catch (syncError) {
          logger.warn('MessageService', '批量已读同步失败，放弃本地已读写入', syncError);
          return Promise.resolve(0);
        }
      }

      const count = await this._markAllMessagesAsReadWithDomainModel(resolved, scopedMessages);
      return Promise.resolve(count);
    } catch (error) {
      logger.error('MessageService', '标记所有消息为已读失败', error);
      return Promise.resolve(0); // 出错时返回0而非拒绝
    }
  }
  
  /**
   * 删除消息
   * @param {String} messageId 消息ID
   * @returns {Promise<Boolean>} 删除结果
   */
  async deleteMessage(messageId, options = {}) {
    logger.info('MessageService', `删除消息: ${messageId}`);
    
    try {
      const message = await this.messageRepository.getById(messageId);
      if (this.enableCloudStorage && message && message.isProvisional !== true && message.syncedToCloud === true) {
        try {
          await this._syncDeleteToCloud(message);
        } catch (syncError) {
          logger.warn('MessageService', '消息删除同步失败，放弃本地删除', syncError);
          return Promise.resolve(false);
        }
      }

      const result = await this._deleteMessageWithDomainModel(messageId);
      return Promise.resolve(result);
    } catch (error) {
      logger.error('MessageService', '删除消息失败', error);
      return Promise.resolve(false); // 出错时返回false而非拒绝
    }
  }
  
  /**
   * 计算任务剩余时间（分钟）
   * @param {Object} task 任务对象
   * @returns {Number} 剩余分钟数
   * @private
   */
  _calculateRemainingTime(task) {
    try {
      const now = new Date();
      const taskTime = new Date(`${task.date} ${task.startTime || '00:00'}`);
      const diffMs = taskTime.getTime() - now.getTime();
      return Math.max(1, Math.round(diffMs / (1000 * 60)));
    } catch (error) {
      logger.error('MessageService', '计算任务剩余时间失败', error);
      return 30; // 默认30分钟
    }
  }
  
  /**
   * 通知消息数据变更 
   * @private
   */
  async _emitMessageChangedEvent() {
    logger.info('MessageService', '通知消息数据变更');
    
    try {
      // 获取最新消息列表，传递给事件处理器
      const messages = await this.getAllMessages();
      logger.info('MessageService', `通知消息数据变更，消息数量=${messages.length}`);
      
      // 使用常量代替硬编码字符串，并传递消息数据
      this.eventBus.emit(EVENTS.MESSAGE_CHANGED, messages);
    } catch (error) {
      logger.error('MessageService', '获取消息列表失败，仅发送空数据变更事件', error);
      // 出错时也发送事件，但不携带数据
      this.eventBus.emit(EVENTS.MESSAGE_CHANGED);
    }
  }
  
  // 领域模型壳层保留给现有测试与调用点，具体实现已迁入 helper。
  async _createMessageWithDomainModel(messageData) { return messageDomain.createMessageWithDomainModel(this, messageData); }
  async _createTaskMessageWithDomainModel(task, notificationType, options = {}) { return messageDomain.createTaskMessageWithDomainModel(this, task, notificationType, options); }
  async _createSystemMessageWithDomainModel(content, type = 'system', options = {}) { return messageDomain.createSystemMessageWithDomainModel(this, content, type, options); }
  async _createPenaltyMessageWithDomainModel(task, points) { return messageDomain.createPenaltyMessageWithDomainModel(this, task, points); }
  async _getAllMessagesWithDomainModel(options = {}) { return messageDomain.getAllMessagesWithDomainModel(this, options); }
  async _getUnreadCountWithDomainModel(options = {}) { return messageDomain.getUnreadCountWithDomainModel(this, options); }
  async _markMessageAsReadWithDomainModel(messageId) { return messageDomain.markMessageAsReadWithDomainModel(this, messageId); }
  async _markAllMessagesAsReadWithDomainModel(options = {}, visibleMessages = null) { return messageDomain.markAllMessagesAsReadWithDomainModel(this, options, visibleMessages); }
  async _deleteMessageWithDomainModel(messageId) { return messageDomain.deleteMessageWithDomainModel(this, messageId); }
  async _deleteRelatedMessagesWithDomainModel(entityId) { return messageDomain.deleteRelatedMessagesWithDomainModel(this, entityId); }
  async _updateTaskMessagesWithDomainModel(task) { return messageDomain.updateTaskMessagesWithDomainModel(this, task); }
  async _createRewardMessageWithDomainModel(reward, action, options = {}) { return messageDomain.createRewardMessageWithDomainModel(this, reward, action, options); }
  
  /**
   * 批量标记消息为已读
   * @param {Array} messageIds 消息ID数组
   * @returns {Promise<Number>} 操作成功的数量
   */
  async batchMarkMessagesAsRead(messageIds) {
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      logger.warn('MessageService', '批量标记消息为已读失败: 消息ID数组为空');
      return 0;
    }
    
    logger.info('MessageService', `批量标记消息为已读开始: 数量=${messageIds.length}`);

    try {
      const count = typeof this.messageRepository.markManyAsRead === 'function'
        ? await this.messageRepository.markManyAsRead(messageIds)
        : await this.messageRepository.batchMarkAsRead(
          (await Promise.all(messageIds.map((id) => this.messageRepository.getById(id))))
            .filter((message) => message && !message.isRead)
        );

      logger.info('MessageService', `批量标记消息为已读完成: 成功=${count}/${messageIds.length}`);
      return count;
    } catch (error) {
      logger.error('MessageService', '批量标记消息为已读失败', error);
      return 0;
    }
  }
  
  /**
   * 批量删除消息
   * @param {Array} messageIds 消息ID数组
   * @returns {Promise<Number>} 操作成功的数量
   */
  async batchDeleteMessages(messageIds) {
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      logger.warn('MessageService', '批量删除消息失败: 消息ID数组为空');
      return 0;
    }
    
    logger.info('MessageService', `批量删除消息开始: 数量=${messageIds.length}`);
    
    let successCount = 0;
    
    // 使用批量处理删除消息
    return new Promise((resolve) => {
      batchUtils.batchProcess(
        messageIds,
        async (messageId) => {
          try {
            const result = await this.deleteMessage(messageId);
            if (result) {
              successCount++;
            }
          } catch (error) {
            logger.error('MessageService', `批量删除消息失败, ID=${messageId}`, error);
          }
        },
        {
          batchSize: 20,
          delay: 0,
          showProgress: false
        },
        () => {
          logger.info('MessageService', `批量删除消息完成: 成功=${successCount}/${messageIds.length}`);
          resolve(successCount);
        }
      );
    });
  }
  
  /**
   * 删除与指定任务相关的特定类型消息
   * @param {String} taskId 任务ID
   * @param {String} notificationType 消息类型，如'upcoming'
   * @returns {Promise<Boolean>} 操作结果
   */
  async deleteRelatedTaskMessages(taskId, notificationType) {
    logger.info('MessageService', `删除任务相关消息: 任务ID=${taskId}, 类型=${notificationType}`);
    
    try {
      // 获取与该任务相关的指定类型消息
      const messages = await this.messageRepository.query(message => 
        message.type === MessageType.TASK && 
        message.relatedId === taskId &&
        message.notificationType === notificationType
      );
      
      if (messages.length === 0) {
        logger.info('MessageService', `未找到任务相关消息: ${taskId}`);
        return Promise.resolve(false);
      }
      
      // 删除这些消息
      const messageIds = messages.map(msg => msg.id);
      await this.batchDeleteMessages(messageIds);
      
      logger.info('MessageService', `已删除${messages.length}条任务相关消息`);
      return Promise.resolve(true);
    } catch (error) {
      logger.error('MessageService', '删除任务相关消息失败', error);
      return Promise.resolve(false);
    }
  }
  
  /**
   * 标记与指定任务相关的所有消息为已读
   * @param {String} taskId 任务ID
   * @returns {Promise<Boolean>} 操作结果
   */
  async markRelatedMessagesAsRead(taskId) {
    logger.info('MessageService', `标记任务相关消息为已读: ${taskId}`);
    
    try {
      // 获取与该任务相关的未读消息
      const messages = await this.messageRepository.query(message => 
        message.type === MessageType.TASK && 
        message.relatedId === taskId &&
        !message.isRead
      );
      
      if (messages.length === 0) {
        logger.info('MessageService', `未找到任务未读消息: ${taskId}`);
        return Promise.resolve(false);
      }
      
      // 标记这些消息为已读
      const messageIds = messages.map(msg => msg.id);
      await this.batchMarkMessagesAsRead(messageIds);
      
      logger.info('MessageService', `已标记${messages.length}条任务相关消息为已读`);
      return Promise.resolve(true);
    } catch (error) {
      logger.error('MessageService', '标记任务相关消息为已读失败', error);
      return Promise.resolve(false);
    }
  }

  /**
   * 更新用户服务实例
   * @param {UserService} userService 新的用户服务实例
   */
  updateUserService(userService) {
    if (this.userService !== userService) {
      this.userService = userService;
      logger.info('MessageService', 'UserService已更新');
    }
  }

  updateStarService(starService) {
    if (this.starService !== starService) {
      this.starService = starService || null;
      logger.info('MessageService', 'StarService已更新');
    }
  }
}

/**
 * 获取通知类型枚举（静态方法，供页面层使用）
 * @returns {Object} NotificationType枚举对象
 * @static
 */
MessageService.getNotificationTypes = function() {
  return NotificationType;
}

module.exports = MessageService;
