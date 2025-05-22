/**
 * services/message-service.js - 消息服务
 * 
 * 处理系统消息相关的业务逻辑，包括任务消息、系统通知等
 * 采用适配器模式，内部仍调用现有messageManager
 */

const logger = require('../utils/logger');
const EventBus = require('../utils/core/event-bus');
const { MessageRepository } = require('../repositories/index');
const { Message, MessageType, NotificationType } = require('../models/message');

class MessageService {
  /**
   * 构造函数
   * @param {Object} options 选项
   * @param {EventBus} options.eventBus 事件总线
   * @param {MessageRepository} options.messageRepository 消息仓储
   */
  constructor(options = {}) {
    // 初始化事件总线
    this.eventBus = options.eventBus || new EventBus();
    
    // 现有消息管理器
    this.messageManager = require('../utils/messageManager.js');
    
    // 新的领域模型仓储
    this.messageRepository = options.messageRepository || new MessageRepository();
    
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
    this.eventBus.on('task:created', this._handleTaskCreated.bind(this));
    this.eventBus.on('task:completed', this._handleTaskCompleted.bind(this));
    this.eventBus.on('task:updated', this._handleTaskUpdated.bind(this));
    this.eventBus.on('task:deleted', this._handleTaskDeleted.bind(this));
    this.eventBus.on('task:statusUpdated', this._handleTaskStatusUpdated.bind(this));
    this.eventBus.on('task:upcoming', this._handleUpcomingTask.bind(this));
    this.eventBus.on('task:penaltyApplied', this._handleTaskPenalty.bind(this));
    this.eventBus.on('task:markedRequired', this._handleTaskMarkedRequired.bind(this));
    this.eventBus.on('task:unmarkedRequired', this._handleTaskUnmarkedRequired.bind(this));
    
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
    
    // 如果是批量创建，使用批量消息
    const batchInfo = data.batchInfo || {};
    if (batchInfo && batchInfo.isBatchOperation) {
      this.messageManager.createTaskMessage(task, 'new', {
        isBatchOperation: true,
        batchCount: batchInfo.count || 0
      });
    } else {
      // 单个任务创建
      this.messageManager.createTaskMessage(task, 'new');
    }
  }
  
  /**
   * 处理任务完成事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleTaskStatusUpdated(data) {
    const { task, previousStatus, operationType } = data;
    
    if (operationType === 'complete') {
      logger.info('MessageService', `处理任务完成事件: ${task.title}`);
      this.messageManager.createTaskMessage(task, 'completed');
    }
  }
  
  /**
   * 处理任务更新事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleTaskUpdated(data) {
    const { task, changes, batchInfo } = data;
    
    logger.info('MessageService', `处理任务更新事件: ${task.title}`);
    
    // 如果是批量更新，使用批量消息
    if (batchInfo && batchInfo.isBatchOperation) {
      this.messageManager.createTaskMessage(task, 'edited', {
        isBatchOperation: true,
        batchCount: batchInfo.count || 0
      });
    } else {
      // 单个任务更新
      this.messageManager.createTaskMessage(task, 'edited');
    }
  }
  
  /**
   * 处理任务删除事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleTaskDeleted(data) {
    const { taskId, taskInfo, batchInfo } = data;
    
    logger.info('MessageService', `处理任务删除事件: ${taskInfo.title || taskId}`);
    
    // 删除任务相关消息
    this.messageManager.deleteTaskMessages(taskId);
    
    // 如果是批量删除，使用批量消息
    if (batchInfo && batchInfo.isBatchOperation) {
      this.messageManager.createTaskMessage(taskInfo, 'deleted', {
        isBatchOperation: true,
        batchCount: batchInfo.count || 0
      });
    } else {
      // 单个任务删除
      this.messageManager.createTaskMessage(taskInfo, 'deleted');
    }
  }
  
  /**
   * 处理任务完成事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleTaskCompleted(data) {
    const { task } = data;
    
    logger.info('MessageService', `处理任务完成事件: ${task.title}`);
    
    // 创建任务完成消息
    this.messageManager.createTaskMessage(task, 'completed');
  }
  
  /**
   * 处理即将到期的任务
   * @param {Object} data 事件数据
   * @private
   */
  _handleUpcomingTask(data) {
    const { task, messageType } = data;
    
    logger.info('MessageService', `处理即将到期任务: ${task.title}, 类型: ${messageType}`);
    
    // 创建即将到期或必做任务消息
    this.messageManager.createTaskMessage(task, messageType);
  }
  
  /**
   * 处理任务惩罚事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleTaskPenalty(data) {
    const { task, penaltyPoints, consumeResult } = data;
    
    logger.info('MessageService', `处理任务惩罚事件: ${task.title}, 扣除${penaltyPoints}星星`);
    
    // 创建惩罚消息
    this.messageManager.createPenaltyMessage(task, penaltyPoints);
  }
  
  /**
   * 处理任务标记为必做事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleTaskMarkedRequired(data) {
    const { task } = data;
    
    logger.info('MessageService', `处理任务标记为必做事件: ${task.title}`);
    
    // 创建必做任务消息
    this.messageManager.createTaskMessage(task, 'required');
  }
  
  /**
   * 处理任务取消必做标记事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleTaskUnmarkedRequired(data) {
    const { task } = data;
    
    logger.info('MessageService', `处理任务取消必做标记事件: ${task.title}`);
    
    // 不需要创建消息，因为这不是一个关键事件
  }
  
  /**
   * 创建系统消息
   * @param {String} content 消息内容
   * @param {String} type 消息类型
   * @returns {Promise<Object>} 创建的消息
   */
  async createSystemMessage(content, type = 'system') {
    logger.info('MessageService', `创建系统消息: ${content}, 类型: ${type}`);
    
    // 调用现有逻辑
    return new Promise((resolve) => {
      this.messageManager.createSystemMessage(content, type, (message) => {
        resolve(message);
      });
    });
  }
  
  /**
   * 创建任务相关消息
   * @param {Object} task 任务对象
   * @param {String} type 消息类型
   * @param {Object} options 附加选项
   * @returns {Promise<Object>} 创建的消息
   */
  async createTaskMessage(task, type, options = {}) {
    logger.info('MessageService', `创建任务消息: ${task.title}, 类型: ${type}`);
    
    // 调用现有逻辑
    const message = this.messageManager.createTaskMessage(task, type, options);
    return message;
  }
  
  /**
   * 获取所有消息
   * @returns {Promise<Array>} 消息列表
   */
  async getAllMessages() {
    logger.info('MessageService', '获取所有消息');
    
    // 调用现有逻辑
    return new Promise((resolve) => {
      this.messageManager.getAllMessages((messages) => {
        resolve(messages);
      });
    });
  }
  
  /**
   * 获取未读消息数量
   * @returns {Promise<Number>} 未读消息数量
   */
  async getUnreadCount() {
    logger.info('MessageService', '获取未读消息数量');
    
    // 调用现有逻辑
    return new Promise((resolve) => {
      this.messageManager.getUnreadCount((count) => {
        resolve(count);
      });
    });
  }
  
  /**
   * 标记消息为已读
   * @param {String} messageId 消息ID
   * @returns {Promise<Boolean>} 操作结果
   */
  async markMessageAsRead(messageId) {
    logger.info('MessageService', `标记消息为已读: ${messageId}`);
    
    // 调用现有逻辑
    return new Promise((resolve) => {
      this.messageManager.markAsRead(messageId, (success) => {
        resolve(success);
      });
    });
  }
  
  /**
   * 标记所有消息为已读
   * @returns {Promise<Boolean>} 操作结果
   */
  async markAllMessagesAsRead() {
    logger.info('MessageService', '标记所有消息为已读');
    
    // 调用现有逻辑
    return new Promise((resolve) => {
      this.messageManager.markAllAsRead((count) => {
        resolve(count);
      });
    });
  }
  
  /**
   * 删除消息
   * @param {String} messageId 消息ID
   * @returns {Promise<Boolean>} 操作结果
   */
  async deleteMessage(messageId) {
    logger.info('MessageService', `删除消息: ${messageId}`);
    
    // 调用现有逻辑
    return new Promise((resolve) => {
      this.messageManager.deleteMessage(messageId, (success) => {
        resolve(success);
      });
    });
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
   * 触发消息变更事件
   * @private
   */
  _emitMessageChangedEvent() {
    this.eventBus.emit('messages:changed');
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
      const savedMessage = await this.messageRepository.save(message);
      logger.info('MessageService', `使用领域模型创建消息成功: ${savedMessage.id}`);
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
    const { isBatchOperation, batchCount } = options;
    
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
        summary = `恭喜您完成了任务"${task.title}"`;
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
    
    const messageData = {
      type: MessageType.TASK,
      notificationType,
      relatedId: task.id,
      title,
      summary,
      icon,
      isBatchOperation,
      batchCount
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
}

module.exports = MessageService; 