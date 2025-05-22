/**
 * services/message-service.js - 消息服务
 * 
 * 处理系统消息相关的业务逻辑，包括任务消息、系统通知等
 * 采用适配器模式，内部仍调用现有messageManager
 */

const logger = require('../utils/logger');
const EventBus = require('../utils/core/event-bus');

class MessageService {
  /**
   * 构造函数
   * @param {Object} options 选项
   * @param {EventBus} options.eventBus 事件总线
   */
  constructor(options = {}) {
    // 初始化事件总线
    this.eventBus = options.eventBus || new EventBus();
    
    // 现有消息管理器
    this.messageManager = require('../utils/messageManager.js');
    
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
    return Promise.resolve();
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
    
    // 创建任务已标记为必做消息
    this.messageManager.createSystemMessage(
      `任务"${task.title}"已标记为必做任务，完成可获得${task.points}星星，未完成将扣除星星`,
      'system'
    );
  }
  
  /**
   * 处理任务取消必做标记事件
   * @param {Object} data 事件数据
   * @private
   */
  _handleTaskUnmarkedRequired(data) {
    const { task } = data;
    
    logger.info('MessageService', `处理任务取消必做标记事件: ${task.title}`);
    
    // 创建任务已取消必做标记消息
    this.messageManager.createSystemMessage(
      `任务"${task.title}"已取消必做任务标记`,
      'system'
    );
  }
  
  /**
   * 创建系统消息
   * @param {String} content 消息内容
   * @param {String} type 消息类型
   * @returns {Promise<Object>} 创建的消息
   */
  async createSystemMessage(content, type = 'system') {
    try {
      logger.info('MessageService', `创建系统消息: ${content.substring(0, 20)}...`);
      
      const result = await new Promise((resolve) => {
        this.messageManager.createSystemMessage(content, type, resolve);
      });
      
      // 触发消息变更事件
      this._emitMessageChangedEvent();
      
      return result;
    } catch (error) {
      logger.error('MessageService', '创建系统消息失败', error);
      return null;
    }
  }
  
  /**
   * 创建任务相关消息
   * @param {Object} task 任务对象
   * @param {String} type 消息类型
   * @param {Object} options 附加选项
   * @returns {Promise<Object>} 创建的消息
   */
  async createTaskMessage(task, type, options = {}) {
    try {
      logger.info('MessageService', `创建任务消息: ${task.title}, 类型=${type}`);
      
      const result = await new Promise((resolve) => {
        this.messageManager.createTaskMessage(task, type, options, resolve);
      });
      
      // 触发消息变更事件
      this._emitMessageChangedEvent();
      
      return result;
    } catch (error) {
      logger.error('MessageService', `创建任务消息失败, 类型=${type}`, error);
      return null;
    }
  }
  
  /**
   * 获取所有消息
   * @returns {Promise<Array>} 消息列表
   */
  async getAllMessages() {
    try {
      return new Promise((resolve) => {
        this.messageManager.getAllMessages(resolve);
      });
    } catch (error) {
      logger.error('MessageService', '获取所有消息失败', error);
      return [];
    }
  }
  
  /**
   * 获取未读消息数量
   * @returns {Promise<Number>} 未读消息数量
   */
  async getUnreadCount() {
    try {
      return new Promise((resolve) => {
        this.messageManager.getUnreadCount(resolve);
      });
    } catch (error) {
      logger.error('MessageService', '获取未读消息数量失败', error);
      return 0;
    }
  }
  
  /**
   * 标记消息为已读
   * @param {String} messageId 消息ID
   * @returns {Promise<Boolean>} 操作结果
   */
  async markMessageAsRead(messageId) {
    try {
      return new Promise((resolve) => {
        this.messageManager.markMessageAsRead(messageId, (success) => {
          if (success) {
            this._emitMessageChangedEvent();
          }
          resolve(success);
        });
      });
    } catch (error) {
      logger.error('MessageService', `标记消息已读失败, ID=${messageId}`, error);
      return false;
    }
  }
  
  /**
   * 标记所有消息为已读
   * @returns {Promise<Boolean>} 操作结果
   */
  async markAllMessagesAsRead() {
    try {
      return new Promise((resolve) => {
        this.messageManager.markAllMessagesAsRead((success) => {
          if (success) {
            this._emitMessageChangedEvent();
          }
          resolve(success);
        });
      });
    } catch (error) {
      logger.error('MessageService', '标记所有消息已读失败', error);
      return false;
    }
  }
  
  /**
   * 删除消息
   * @param {String} messageId 消息ID
   * @returns {Promise<Boolean>} 操作结果
   */
  async deleteMessage(messageId) {
    try {
      return new Promise((resolve) => {
        this.messageManager.deleteMessage(messageId, (success) => {
          if (success) {
            this._emitMessageChangedEvent();
          }
          resolve(success);
        });
      });
    } catch (error) {
      logger.error('MessageService', `删除消息失败, ID=${messageId}`, error);
      return false;
    }
  }
  
  /**
   * 获取即将到期任务的通知
   * @param {Array} upcomingTasks 即将到期的任务
   * @returns {Promise<Object>} 通知信息
   */
  async getUpcomingTaskNotifications(upcomingTasks) {
    try {
      if (!upcomingTasks || upcomingTasks.length === 0) {
        return null;
      }
      
      // 获取最近的即将到期任务
      const sortedTasks = [...upcomingTasks].sort((a, b) => {
        const timeA = new Date(`${a.date} ${a.startTime || '00:00'}`).getTime();
        const timeB = new Date(`${b.date} ${b.startTime || '00:00'}`).getTime();
        return timeA - timeB;
      });
      
      const nextTask = sortedTasks[0];
      const timeRemaining = this._calculateRemainingTime(nextTask);
      
      return {
        name: nextTask.title,
        timeRemaining,
        id: nextTask.id
      };
    } catch (error) {
      logger.error('MessageService', '获取即将到期任务通知失败', error);
      return null;
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
   * 触发消息变更事件
   * @private
   */
  _emitMessageChangedEvent() {
    this.getAllMessages().then(messages => {
      this.eventBus.emit('message:changed', messages);
    });
  }
}

module.exports = MessageService; 