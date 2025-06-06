/**
 * services/message-service.js - 消息服务
 * 
 * 处理系统消息相关的业务逻辑，包括任务消息、系统通知等
 * 采用适配器模式，内部仍调用现有messageManager
 */

const logger = require('../utils/logger');
const EventBus = require('../utils/core/event-bus');
const { MessageRepository } = require('../repositories/index');
const { Message, MessageType, NotificationType, MessagePriority } = require('../models/message');
const batchUtils = require('../utils/batchUtils');
const { EVENTS } = require('../utils/constants');

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
      
      return Promise.resolve();
    } catch (error) {
      logger.error('MessageService', '初始化消息服务失败', error);
      return Promise.resolve(); // 仍然返回resolved Promise以避免阻止应用启动
    }
  }
  
  /**
   * 注册事件监听器
   * @private
   */
  _registerEventListeners() {
    // 任务相关事件
    this.eventBus.on(EVENTS.TASK_CREATED, this._handleTaskCreated.bind(this));
    this.eventBus.on(EVENTS.TASK_COMPLETED, this._handleTaskCompleted.bind(this));
    this.eventBus.on(EVENTS.TASK_UPDATED, this._handleTaskUpdated.bind(this));
    this.eventBus.on(EVENTS.TASK_DELETED, this._handleTaskDeleted.bind(this));
    this.eventBus.on(EVENTS.TASK_STATUS_UPDATED, this._handleTaskStatusUpdated.bind(this));
    this.eventBus.on(EVENTS.TASK_UPCOMING, this._handleUpcomingTask.bind(this));
    this.eventBus.on(EVENTS.TASK_PENALTY_APPLIED, this._handleTaskPenalty.bind(this));
    this.eventBus.on(EVENTS.TASK_MARKED_REQUIRED, this._handleTaskMarkedRequired.bind(this));
    this.eventBus.on(EVENTS.TASK_UNMARKED_REQUIRED, this._handleTaskUnmarkedRequired.bind(this));
    
    // 奖励相关事件
    this.eventBus.on(EVENTS.REWARD_CREATED, this._handleRewardCreated.bind(this));
    this.eventBus.on(EVENTS.REWARD_CLAIMED, this._handleRewardClaimed.bind(this));
    this.eventBus.on(EVENTS.REWARD_DELIVERED, this._handleRewardDelivered.bind(this));
    this.eventBus.on(EVENTS.REWARD_UNCLAIMED, this._handleRewardUnclaimed.bind(this));
    this.eventBus.on(EVENTS.REWARD_DELETED_BATCH, this._handleRewardDeletedBatch.bind(this));
    this.eventBus.on(EVENTS.REWARD_EXAMPLES_CLEARED, this._handleRewardExamplesCleared.bind(this));
    
    // 领域模型事件
    this.eventBus.on(EVENTS.DOMAIN_MESSAGE_CREATED, this._handleDomainMessageCreated.bind(this));
    this.eventBus.on(EVENTS.DOMAIN_MESSAGE_UPDATED, this._handleDomainMessageUpdated.bind(this));
    this.eventBus.on(EVENTS.DOMAIN_MESSAGE_DELETED, this._handleDomainMessageDeleted.bind(this));
    this.eventBus.on(EVENTS.DOMAIN_MESSAGE_READ, this._handleDomainMessageRead.bind(this));
    this.eventBus.on(EVENTS.DOMAIN_MESSAGE_ALL_READ, this._handleDomainMessageAllRead.bind(this));
    
    logger.info('MessageService', '已注册事件监听器');
  }
  
  /**
   * 处理任务创建事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleTaskCreated(data) {
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
    const { task, previousStatus, operationType, operatorUserId } = data;
    
    if (operationType === 'complete') {
      logger.info('MessageService', `处理任务完成事件: ${task.title}, 操作者=${operatorUserId || '未指定'}`);
      
      // 直接创建领域模型消息，传递操作者信息
      this._createTaskMessageWithDomainModel(task, NotificationType.COMPLETED, {
        priority: MessagePriority.HIGH,
        operatorUserId: operatorUserId // 传递操作者信息
      });
    }
  }
  
  /**
   * 处理任务更新事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleTaskUpdated(data) {
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
    logger.info('MessageService', '收到奖励领取事件，原始数据:', data);
    
    // 兼容不同的事件数据格式
    let reward;
    
    if (data.reward) {
      // 新格式：直接包含reward对象
      reward = data.reward;
      logger.info('MessageService', '使用新格式事件数据（包含reward对象）');
    } else if (data.rewardId && data.rewardName) {
      // 兼容格式：从rewardId和rewardName构造reward对象
      reward = {
        id: data.rewardId,
        name: data.rewardName,
        points: data.points || 0
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
        operatorUserId: operatorUserId // 传递操作者信息
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
    const { reward } = data;
    
    logger.info('MessageService', `处理奖励取消领取事件: ${reward.name}`);
    
    // 创建奖励取消领取消息
    this._createRewardMessageWithDomainModel(reward, 'unclaimed');
  }
  
  /**
   * 处理奖励批量删除事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleRewardDeletedBatch(data) {
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
  async getAllMessages() {
    logger.info('MessageService', '获取所有消息');
    
    try {
      const messages = await this._getAllMessagesWithDomainModel();
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
  async getUnreadCount() {
    logger.info('MessageService', '获取未读消息数量');
    
    try {
      const count = await this._getUnreadCountWithDomainModel();
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
  async markMessageAsRead(messageId) {
    logger.info('MessageService', `标记消息为已读: ${messageId}`);
    
    try {
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
  async markAllMessagesAsRead() {
    logger.info('MessageService', '标记所有消息为已读');
    
    try {
      const count = await this._markAllMessagesAsReadWithDomainModel();
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
  async deleteMessage(messageId) {
    logger.info('MessageService', `删除消息: ${messageId}`);
    
    try {
      const result = await this._deleteMessageWithDomainModel(messageId);
      return Promise.resolve(result);
    } catch (error) {
      logger.error('MessageService', '删除消息失败', error);
      return Promise.resolve(false); // 出错时返回false而非拒绝
    }
  }
  
  /**
   * 获取即将到期任务的通知
   * @param {Array} upcomingTasks 即将到期的任务
   * @returns {Promise<Object>} 通知信息
   */
  async getUpcomingTaskNotifications(upcomingTasks) {
    // 生成即将到期任务的通知
    const notifications = [];
    
    upcomingTasks.forEach(task => {
      const remainingTime = this._calculateRemainingTime(task);
      
      if (!remainingTime) return;
      
      const isRequired = task.isRequired === true;
      const messageType = isRequired ? 'required' : 'upcoming';
      
      notifications.push({
        taskId: task.id,
        title: task.title,
        remainingTime,
        messageType,
        priority: isRequired ? 'high' : 'medium'
      });
    });
    
    return notifications;
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
  
  /**
   * 以下是与新领域模型交互的方法，但不影响现有功能
   * 这些方法目前不会被外部调用，仅为后续迁移做准备
   */
  
  /**
   * 使用领域模型创建消息
   * @param {Object} messageData 消息数据
   * @returns {Promise<Message>} 创建的消息
   * @private
   */
  async _createMessageWithDomainModel(messageData) {
    try {
      const message = new Message(messageData);
      
      // 验证消息
      const errors = message.validate();
      if (errors.length > 0) {
        logger.warn('MessageService', `消息验证失败: ${errors.join(', ')}`, messageData);
        return null;
      }
      
      // 使用addMessage方法支持去重
      const savedMessage = await this.messageRepository.addMessage(message);
      
      logger.info('MessageService', `使用领域模型创建消息成功: ${savedMessage.id}`);
      
      // 触发领域消息事件
      this.eventBus.emit(EVENTS.DOMAIN_MESSAGE_CREATED, { message: savedMessage });
      
      return savedMessage;
    } catch (error) {
      logger.error('MessageService', '使用领域模型创建消息失败', error);
      return null;
    }
  }
  
  /**
   * 使用领域模型创建任务消息
   * @param {Object} task 任务对象
   * @param {String} notificationType 通知类型
   * @param {Object} options 选项
   * @returns {Promise<Message>} 创建的消息
   * @private
   */
  async _createTaskMessageWithDomainModel(task, notificationType, options = {}) {
    const { isBatchOperation, batchCount, priority, operatorUserId } = options;
    
    // 获取当前操作者，优先使用传入的operatorUserId
    const currentOperatorId = operatorUserId || (this.userService ? this.userService.getCurrentUserId() : 'parent');
    
    // 对于特定消息类型，如果是家长操作则不创建消息
    const skipMessagesForParentOperator = [
      NotificationType.COMPLETED,
      NotificationType.UPDATED
    ];
    
    if (skipMessagesForParentOperator.includes(notificationType) && currentOperatorId === 'parent') {
      logger.info('MessageService', `家长操作，跳过消息创建: ${task.title}, 操作类型=${notificationType}, 操作者=${currentOperatorId}`);
      return null; // 不创建消息
    }
    
    let title, summary, icon;
    
    switch(notificationType) {
      case NotificationType.NEW:
        title = '新任务提醒';
        summary = isBatchOperation 
          ? `您有${batchCount}个"${task.title}"循环任务已添加到计划中` 
          : `您有新的任务"${task.title}"已添加到计划中`;
        icon = '📝';
        break;
      case NotificationType.UPCOMING:
        title = '任务即将到期';
        summary = `您的任务"${task.title}"将在不久后到期，请及时完成`;
        icon = '⏰';
        break;
      case NotificationType.UPDATED:
        title = '任务已更新';
        summary = isBatchOperation 
          ? `已更新${batchCount}个"${task.title}"循环任务` 
          : `任务"${task.title}"的内容已被更新`;
        icon = '✏️';
        break;
      case NotificationType.COMPLETED:
        title = '任务已完成';
        // 根据操作者调整文本：小朋友完成发给家长的消息
        if (currentOperatorId === 'child') {
          summary = `您的孩子完成了任务"${task.title}"`;
        } else {
          summary = `恭喜您完成了任务"${task.title}"`;
        }
        icon = '✅';
        break;
      case NotificationType.REQUIRED:
        title = '必做任务提醒';
        summary = `请务必完成任务"${task.title}"，否则将扣除星星`;
        icon = '⚠️';
        break;
      case NotificationType.DELETED:
        title = '任务已删除';
        summary = isBatchOperation 
          ? `已删除${batchCount}个"${task.title}"循环任务` 
          : `任务"${task.title}"已被删除`;
        icon = '🗑️';
        break;
      default:
        title = '任务通知';
        summary = `任务"${task.title}"有新的状态变更`;
        icon = '🔔';
    }
    
    // 确定消息接收者：小朋友操作发给家长，家长创建任务发给小朋友
    let targetUserId;
    if (currentOperatorId === 'child') {
      // 小朋友操作：消息发给家长
      targetUserId = 'parent';
      logger.info('MessageService', `小朋友操作，任务消息发给家长: ${task.title}, 操作类型=${notificationType}`);
    } else if (currentOperatorId === 'parent' && notificationType === NotificationType.NEW) {
      // 家长创建任务：消息发给小朋友
      targetUserId = 'child';
      logger.info('MessageService', `家长创建任务，消息发给小朋友: ${task.title}`);
    } else {
      // 其他情况：使用任务的userId或默认为parent
      targetUserId = task.userId || 'parent';
    }
    
    const messageData = {
      userId: targetUserId,
      type: MessageType.TASK,
      notificationType,
      relatedId: task.id,
      title,
      summary,
      icon,
      isBatchOperation,
      batchCount,
      priority: priority || MessagePriority.MEDIUM
    };
    
    return this._createMessageWithDomainModel(messageData);
  }
  
  /**
   * 使用领域模型创建系统消息
   * @param {String} content 消息内容
   * @param {String} type 消息类型
   * @param {Object} options 选项
   * @returns {Promise<Message>} 创建的消息
   * @private
   */
  async _createSystemMessageWithDomainModel(content, type = 'system', options = {}) {
    let title, icon;
    const { priority, title: customTitle, summary: customSummary } = options;
    
    switch(type) {
      case 'reward':
        title = '星星奖励';
        icon = '⭐';
        break;
      case 'penalty':
        title = '星星扣除';
        icon = '⚠️';
        break;
      case 'achievement':
        title = '成就达成';
        icon = '🏆';
        break;
      case 'welcome':
        title = '欢迎使用小CEO日程表';
        icon = '🎉';
        break;
      default:
        title = '系统通知';
        icon = '🔔';
    }
    
    // 支持自定义标题
    if (customTitle) {
      title = customTitle;
    }
    
    const messageData = {
      userId: 'shared', // 系统消息设为共享，所有用户都能看到
      type: MessageType.SYSTEM,
      notificationType: type,
      title,
      summary: customSummary || content, // 优先使用自定义摘要
      content,
      icon,
      priority: priority || MessagePriority.MEDIUM
    };
    
    return this._createMessageWithDomainModel(messageData);
  }
  
  /**
   * 使用领域模型创建惩罚消息
   * @param {Object} task 任务对象
   * @param {Number} points 扣除的积分
   * @returns {Promise<Message>} 创建的消息
   * @private
   */
  async _createPenaltyMessageWithDomainModel(task, points) {
    const messageData = {
      userId: this.userService ? this.userService.getCurrentUserId() : 'parent', // 获取当前用户ID，默认为parent
      type: MessageType.PENALTY,
      relatedId: task.id,
      title: '星星扣除提醒',
      summary: `必做任务"${task.title}"未完成，已扣除${points}颗星星`,
      content: `您的必做任务"${task.title}"未能按时完成，系统已扣除${points}颗星星。请继续努力，按时完成任务！`,
      icon: '⚠️',
      priority: MessagePriority.HIGH
    };
    
    return this._createMessageWithDomainModel(messageData);
  }
  
  /**
   * 使用领域模型获取所有消息
   * @returns {Promise<Array>} 消息列表
   * @private
   */
  async _getAllMessagesWithDomainModel() {
    try {
      const messages = await this.messageRepository.getAll();
      logger.info('MessageService', `使用领域模型获取所有消息成功: ${messages.length}条`);
      return messages;
    } catch (error) {
      logger.error('MessageService', '使用领域模型获取所有消息失败', error);
      return [];
    }
  }
  
  /**
   * 使用领域模型获取未读消息数量
   * @returns {Promise<Number>} 未读消息数量
   * @private
   */
  async _getUnreadCountWithDomainModel() {
    try {
      const count = await this.messageRepository.getUnreadCount();
      logger.info('MessageService', `使用领域模型获取未读消息数量成功: ${count}条`);
      return count;
    } catch (error) {
      logger.error('MessageService', '使用领域模型获取未读消息数量失败', error);
      return 0;
    }
  }
  
  /**
   * 使用领域模型标记消息为已读
   * @param {String} messageId 消息ID
   * @returns {Promise<Boolean>} 操作结果
   * @private
   */
  async _markMessageAsReadWithDomainModel(messageId) {
    try {
      const result = await this.messageRepository.markAsRead(messageId);
      
      if (result) {
        // 触发领域消息已读事件
        this.eventBus.emit(EVENTS.DOMAIN_MESSAGE_READ, { messageId });
        logger.info('MessageService', `使用领域模型标记消息${messageId}为已读成功`);
        return true;
      } else {
        logger.warn('MessageService', `使用领域模型标记消息${messageId}为已读失败`);
        return false;
      }
    } catch (error) {
      logger.error('MessageService', `使用领域模型标记消息为已读失败, ID=${messageId}`, error);
      return false;
    }
  }
  
  /**
   * 使用领域模型标记所有消息为已读
   * @returns {Promise<Number>} 标记为已读的消息数量
   * @private
   */
  async _markAllMessagesAsReadWithDomainModel() {
    try {
      const count = await this.messageRepository.markAllAsRead();
      
      if (count > 0) {
        // 触发领域消息全部已读事件
        this.eventBus.emit(EVENTS.DOMAIN_MESSAGE_ALL_READ, { count });
      }
      
      logger.info('MessageService', `使用领域模型标记所有消息为已读成功: ${count}条`);
      return count;
    } catch (error) {
      logger.error('MessageService', '使用领域模型标记所有消息为已读失败', error);
      return 0;
    }
  }
  
  /**
   * 使用领域模型删除消息
   * @param {String} messageId 消息ID
   * @returns {Promise<Boolean>} 操作结果
   * @private
   */
  async _deleteMessageWithDomainModel(messageId) {
    try {
      const result = await this.messageRepository.delete(messageId);
      
      if (result) {
        // 触发领域消息删除事件
        this.eventBus.emit(EVENTS.DOMAIN_MESSAGE_DELETED, { messageId });
        logger.info('MessageService', `使用领域模型删除消息${messageId}成功`);
        return true;
      } else {
        logger.warn('MessageService', `使用领域模型删除消息${messageId}失败`);
        return false;
      }
    } catch (error) {
      logger.error('MessageService', `使用领域模型删除消息失败, ID=${messageId}`, error);
      return false;
    }
  }
  
  /**
   * 使用领域模型删除相关消息
   * @param {String} entityId 实体ID
   * @returns {Promise<Number>} 删除的消息数量
   * @private
   */
  async _deleteRelatedMessagesWithDomainModel(entityId) {
    try {
      const count = await this.messageRepository.deleteRelatedMessages(entityId);
      
      if (count > 0) {
        // 触发领域相关消息删除事件
        this.eventBus.emit(EVENTS.DOMAIN_MESSAGE_RELATED_DELETED, { entityId, count });
      }
      
      logger.info('MessageService', `使用领域模型删除与实体${entityId}相关的消息成功: ${count}条`);
      return count;
    } catch (error) {
      logger.error('MessageService', `使用领域模型删除相关消息失败, 实体ID=${entityId}`, error);
      return 0;
    }
  }
  
  /**
   * 使用领域模型更新任务消息
   * @param {Object} task 任务对象
   * @returns {Promise<Number>} 更新的消息数量
   * @private
   */
  async _updateTaskMessagesWithDomainModel(task) {
    try {
      const count = await this.messageRepository.updateTaskMessages(task);
      
      if (count > 0) {
        // 触发领域消息更新事件
        this.eventBus.emit(EVENTS.DOMAIN_MESSAGE_TASK_UPDATED, { taskId: task.id, count });
      }
      
      logger.info('MessageService', `使用领域模型更新任务消息成功: ${count}条`);
      return count;
    } catch (error) {
      logger.error('MessageService', `使用领域模型更新任务消息失败, 任务ID=${task.id}`, error);
      return 0;
    }
  }
  
  /**
   * 使用领域模型获取消息统计信息
   * @returns {Promise<Object>} 统计信息
   * @private
   */
  async _getMessageStatsWithDomainModel() {
    try {
      const stats = await this.messageRepository.getMessageStats();
      logger.info('MessageService', `使用领域模型获取消息统计信息成功`);
      return stats;
    } catch (error) {
      logger.error('MessageService', '使用领域模型获取消息统计信息失败', error);
      return {
        total: 0,
        unread: 0,
        today: 0,
        highPriority: 0,
        byType: {}
      };
    }
  }
  
  /**
   * 使用领域模型清理过期消息
   * @param {Number} expiryDays 过期天数，默认30天
   * @returns {Promise<Number>} 清理的消息数量
   * @private
   */
  async _cleanExpiredMessagesWithDomainModel(expiryDays = 30) {
    try {
      const count = await this.messageRepository.cleanExpiredMessages(expiryDays);
      
      if (count > 0) {
        // 触发领域消息清理事件
        this.eventBus.emit(EVENTS.DOMAIN_MESSAGE_CLEANED, { count, expiryDays });
      }
      
      logger.info('MessageService', `使用领域模型清理过期消息成功: ${count}条`);
      return count;
    } catch (error) {
      logger.error('MessageService', '使用领域模型清理过期消息失败', error);
      return 0;
    }
  }
  
  /**
   * 使用领域模型获取高优先级未读消息
   * @returns {Promise<Array>} 高优先级未读消息列表
   * @private
   */
  async _getHighPriorityMessagesWithDomainModel() {
    try {
      // 获取所有未读消息
      const unreadMessages = await this.messageRepository.getUnreadMessages();
      
      // 过滤出高优先级消息
      const highPriorityMessages = unreadMessages.filter(msg => msg.isHighPriority());
      
      logger.info('MessageService', `使用领域模型获取高优先级未读消息成功: ${highPriorityMessages.length}条`);
      return highPriorityMessages;
    } catch (error) {
      logger.error('MessageService', '使用领域模型获取高优先级未读消息失败', error);
      return [];
    }
  }
  
  /**
   * 迁移消息数据（从旧格式到新模型）
   * @returns {Promise<Object>} 迁移结果
   * @private
   */
  async _migrateMessageData() {
    try {
      logger.info('MessageService', '开始迁移消息数据到领域模型');
      
      // 获取所有现有消息
      const oldMessages = await new Promise((resolve) => {
        this.messageManager.getAllMessages(messages => resolve(messages || []));
      });
      
      if (oldMessages.length === 0) {
        logger.info('MessageService', '没有消息需要迁移');
        return { migrated: 0, total: 0 };
      }
      
      // 将旧消息转换为新模型
      const newMessages = oldMessages.map(old => new Message(old));
      
      // 批量保存到仓储
      await this.messageRepository.saveAll(newMessages);
      
      logger.info('MessageService', `成功迁移${newMessages.length}条消息数据到领域模型`);
      return { migrated: newMessages.length, total: oldMessages.length };
    } catch (error) {
      logger.error('MessageService', '迁移消息数据到领域模型失败', error);
      return { migrated: 0, total: 0, error: error.message };
    }
  }
  
  /**
   * 创建奖励消息（使用领域模型）
   * @param {Object} reward 奖励对象
   * @param {String} action 操作类型
   * @param {Object} options 选项参数
   * @returns {Promise<Message>} 创建的消息
   * @private
   */
  async _createRewardMessageWithDomainModel(reward, action, options = {}) {
    const { operatorUserId } = options;
    
    // 获取当前操作者，优先使用传入的operatorUserId
    const currentOperatorId = operatorUserId || (this.userService ? this.userService.getCurrentUserId() : 'parent');
    
    // 对于特定消息类型，如果是家长操作则不创建消息
    const skipMessagesForParentOperator = ['claimed'];
    
    if (skipMessagesForParentOperator.includes(action) && currentOperatorId === 'parent') {
      logger.info('MessageService', `家长操作，跳过奖励消息创建: ${reward.name}, 操作类型=${action}, 操作者=${currentOperatorId}`);
      return null; // 不创建消息
    }
    
    let title, summary, icon;
    
    switch(action) {
      case 'created':
        title = '新奖励已添加';
        summary = `您已成功添加新奖励"${reward.name}"，需要${reward.points}颗星星兑换`;
        icon = '✨';
        break;
      case 'claimed':
        title = '奖励已兑换';
        summary = `您已成功兑换奖励"${reward.name}"，花费了${reward.points}颗星星`;
        icon = '🎁';
        break;
      case 'delivered':
        title = '奖励已领取';
        summary = `您已成功领取奖励"${reward.name}"`;
        icon = '🎉';
        break;
      case 'unclaimed':
        title = '奖励兑换已取消';
        summary = `您已取消兑换奖励"${reward.name}"，退回${reward.points}颗星星`;
        icon = '↩️';
        break;
      default:
        title = '奖励通知';
        summary = `您的奖励"${reward.name}"有新的状态变更`;
        icon = '🔔';
    }
    
    // 确定消息接收者：小朋友操作发给家长，家长创建奖励发给小朋友
    let targetUserId;
    if (currentOperatorId === 'child') {
      // 小朋友操作：消息发给家长
      targetUserId = 'parent';
      logger.info('MessageService', `小朋友操作，奖励消息发给家长: ${reward.name}, 操作类型=${action}`);
    } else if (currentOperatorId === 'parent' && action === 'created') {
      // 家长创建奖励：消息发给小朋友
      targetUserId = 'child';
      logger.info('MessageService', `家长创建奖励，消息发给小朋友: ${reward.name}`);
    } else {
      // 其他情况：使用原逻辑
      targetUserId = this.userService ? this.userService.getCurrentUserId() : 'parent';
    }
    
    const messageData = {
      userId: targetUserId,
      type: MessageType.REWARD,
      notificationType: action,
      relatedId: reward.id,
      title,
      summary,
      icon,
      priority: MessagePriority.MEDIUM
    };
    
    return this._createMessageWithDomainModel(messageData);
  }
  
  /**
   * 批量创建任务消息
   * @param {Array} tasks 任务数组
   * @param {String} type 消息类型
   * @param {Object} options 附加选项
   * @returns {Promise<Number>} 创建的消息数量
   */
  async batchCreateTaskMessages(tasks, type, options = {}) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      logger.warn('MessageService', '批量创建任务消息失败: 任务数组为空');
      return 0;
    }
    
    logger.info('MessageService', `批量创建任务消息开始: 数量=${tasks.length}, 类型=${type}`);
    
    let createdCount = 0;
    const isBatchOperation = options.isBatchOperation !== false;
    
    // 调用现有逻辑
    for (const task of tasks) {
      try {
        const message = this.messageManager.createTaskMessage(task, type, {
          ...options,
          isBatchOperation: true,
          batchCount: tasks.length
        });
        
        if (message) {
          createdCount++;
        }
      } catch (error) {
        logger.error('MessageService', `批量创建任务消息失败, 任务ID=${task.id}`, error);
      }
    }
    
    // 同时使用领域模型批量创建
    try {
      const domainMessages = [];
      
      // 准备领域消息数据
      tasks.forEach(task => {
        const notificationType = this._mapMessageTypeToNotificationType(type);
        
        // 创建消息数据
        const messageData = this._prepareTaskMessageData(task, notificationType, {
          ...options,
          isBatchOperation: true,
          batchCount: tasks.length
        });
        
        if (messageData) {
          domainMessages.push(new Message(messageData));
        }
      });
      
      // 批量添加消息到仓储
      if (domainMessages.length > 0) {
        await this.messageRepository.batchAddMessages(domainMessages);
      }
    } catch (error) {
      logger.error('MessageService', '使用领域模型批量创建任务消息失败', error);
    }
    
    logger.info('MessageService', `批量创建任务消息完成: 成功=${createdCount}/${tasks.length}`);
    return createdCount;
  }
  
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
    
    // 调用现有逻辑
    return new Promise((resolve) => {
      this.messageManager.markManyAsRead(messageIds, (count) => {
        logger.info('MessageService', `批量标记消息为已读完成: 成功=${count}/${messageIds.length}`);
        resolve(count);
      });
    });
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
   * 将消息类型映射到通知类型
   * @param {String} messageType 消息类型
   * @returns {String} 通知类型
   * @private
   */
  _mapMessageTypeToNotificationType(messageType) {
    const mapping = {
      'new': NotificationType.NEW,
      'upcoming': NotificationType.UPCOMING,
      'edited': NotificationType.UPDATED,
      'completed': NotificationType.COMPLETED,
      'required': NotificationType.REQUIRED,
      'deleted': NotificationType.DELETED
    };
    
    return mapping[messageType] || messageType;
  }
  
  /**
   * 准备任务消息数据
   * @param {Object} task 任务对象
   * @param {String} notificationType 通知类型
   * @param {Object} options 选项
   * @returns {Object} 消息数据
   * @private
   */
  _prepareTaskMessageData(task, notificationType, options = {}) {
    const { isBatchOperation, batchCount, priority, operatorUserId } = options;
    
    // 获取操作者信息
    const currentOperatorId = operatorUserId || (this.userService ? this.userService.getCurrentUserId() : 'parent');
    
    let title, summary, icon;
    
    switch(notificationType) {
      case NotificationType.NEW:
        title = '新任务提醒';
        summary = isBatchOperation 
          ? `您有${batchCount}个"${task.title}"循环任务已添加到计划中` 
          : `您有新的任务"${task.title}"已添加到计划中`;
        icon = '📝';
        break;
      case NotificationType.UPCOMING:
        title = '任务即将到期';
        summary = `您的任务"${task.title}"将在不久后到期，请及时完成`;
        icon = '⏰';
        break;
      case NotificationType.UPDATED:
        title = '任务已更新';
        summary = isBatchOperation 
          ? `已更新${batchCount}个"${task.title}"循环任务` 
          : `任务"${task.title}"的内容已被更新`;
        icon = '✏️';
        break;
      case NotificationType.COMPLETED:
        title = '任务已完成';
        // 根据操作者调整文本：小朋友完成发给家长的消息
        if (currentOperatorId === 'child') {
          summary = `您的孩子完成了任务"${task.title}"`;
        } else {
          summary = `恭喜您完成了任务"${task.title}"`;
        }
        icon = '✅';
        break;
      case NotificationType.REQUIRED:
        title = '必做任务提醒';
        summary = `请务必完成任务"${task.title}"，否则将扣除星星`;
        icon = '⚠️';
        break;
      case NotificationType.DELETED:
        title = '任务已删除';
        summary = isBatchOperation 
          ? `已删除${batchCount}个"${task.title}"循环任务` 
          : `任务"${task.title}"已被删除`;
        icon = '🗑️';
        break;
      default:
        title = '任务通知';
        summary = `任务"${task.title}"有新的状态变更`;
        icon = '🔔';
    }
    
    return {
      userId: this.userService ? this.userService.getCurrentUserId() : 'parent', // 获取当前用户ID，默认为parent
      type: MessageType.TASK,
      notificationType,
      relatedId: task.id,
      title,
      summary,
      icon,
      isBatchOperation,
      batchCount,
      priority: priority || MessagePriority.MEDIUM
    };
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
}

/**
 * 获取通知类型枚举（静态方法，供页面层使用）
 * @returns {Object} NotificationType枚举对象
 * @static
 */
MessageService.getNotificationTypes = function() {
  return NotificationType;
};

module.exports = MessageService; 