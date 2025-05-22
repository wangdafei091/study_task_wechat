/**
 * message-repository.js - 消息仓储
 * 
 * 提供消息实体的存储和检索，继承自基础仓储类
 */

const BaseRepository = require('./base-repository');
const { Message } = require('../models/message');
const logger = require('../utils/logger');

class MessageRepository extends BaseRepository {
  /**
   * 构造函数
   * @param {StorageAdapter} storageAdapter 可选的存储适配器
   * @param {Object} options 选项
   */
  constructor(storageAdapter, options = {}) {
    const storageKey = options.storageKey || 'messageData';
    super(storageKey, Message, {
      namespace: options.namespace || '',
      useCache: options.useCache !== false,
      cacheExpiry: options.cacheExpiry || 60000,
      cacheTTL: options.cacheTTL || 10000
    });
    
    // 如果提供了存储适配器，则使用它替换默认的
    if (storageAdapter) {
      this.storageAdapter = storageAdapter;
    }
    
    logger.info('MessageRepository', '初始化消息仓储');
  }
  
  /**
   * 获取未读消息
   * @returns {Promise<Array>} 未读消息列表
   */
  async getUnreadMessages() {
    try {
      const messages = await this.query(message => !message.isRead);
      logger.info('MessageRepository', `获取未读消息成功, 数量=${messages.length}`);
      return messages;
    } catch (error) {
      logger.error('MessageRepository', '获取未读消息失败', error);
      return [];
    }
  }
  
  /**
   * 获取未读消息数量
   * @returns {Promise<Number>} 未读消息数量
   */
  async getUnreadCount() {
    try {
      const unreadMessages = await this.getUnreadMessages();
      return unreadMessages.length;
    } catch (error) {
      logger.error('MessageRepository', '获取未读消息数量失败', error);
      return 0;
    }
  }
  
  /**
   * 根据类型获取消息
   * @param {String} type 消息类型
   * @returns {Promise<Array>} 指定类型的消息列表
   */
  async getMessagesByType(type) {
    if (!type) {
      logger.warn('MessageRepository', '获取消息类型为空');
      return [];
    }
    
    try {
      const messages = await this.query(message => message.type === type);
      logger.info('MessageRepository', `获取类型为${type}的消息成功, 数量=${messages.length}`);
      return messages;
    } catch (error) {
      logger.error('MessageRepository', `获取类型为${type}的消息失败`, error);
      return [];
    }
  }
  
  /**
   * 获取与指定实体相关的消息
   * @param {String} entityId 实体ID
   * @returns {Promise<Array>} 相关消息列表
   */
  async getRelatedMessages(entityId) {
    if (!entityId) {
      logger.warn('MessageRepository', '获取关联消息的实体ID为空');
      return [];
    }
    
    try {
      const messages = await this.query(message => message.isRelatedTo(entityId));
      logger.info('MessageRepository', `获取与实体${entityId}相关的消息成功, 数量=${messages.length}`);
      return messages;
    } catch (error) {
      logger.error('MessageRepository', `获取与实体${entityId}相关的消息失败`, error);
      return [];
    }
  }
  
  /**
   * 标记消息为已读
   * @param {String} messageId 消息ID
   * @returns {Promise<Message|null>} 更新后的消息或null
   */
  async markAsRead(messageId) {
    if (!messageId) {
      logger.warn('MessageRepository', '标记已读的消息ID为空');
      return null;
    }
    
    try {
      const message = await this.getById(messageId);
      if (!message) {
        logger.warn('MessageRepository', `未找到ID为${messageId}的消息`);
        return null;
      }
      
      if (message.isRead) {
        logger.info('MessageRepository', `消息${messageId}已经是已读状态`);
        return message;
      }
      
      message.markAsRead();
      const updatedMessage = await this.save(message);
      
      logger.info('MessageRepository', `标记消息${messageId}为已读成功`);
      return updatedMessage;
    } catch (error) {
      logger.error('MessageRepository', `标记消息${messageId}为已读失败`, error);
      return null;
    }
  }
  
  /**
   * 标记所有消息为已读
   * @returns {Promise<Number>} 更新的消息数量
   */
  async markAllAsRead() {
    try {
      const unreadMessages = await this.getUnreadMessages();
      if (unreadMessages.length === 0) {
        logger.info('MessageRepository', '没有未读消息需要标记');
        return 0;
      }
      
      const updatedMessages = unreadMessages.map(message => message.markAsRead());
      await this.saveAll(updatedMessages);
      
      logger.info('MessageRepository', `标记所有${updatedMessages.length}条消息为已读成功`);
      return updatedMessages.length;
    } catch (error) {
      logger.error('MessageRepository', '标记所有消息为已读失败', error);
      return 0;
    }
  }
  
  /**
   * 删除与指定实体相关的消息
   * @param {String} entityId 实体ID
   * @returns {Promise<Number>} 删除的消息数量
   */
  async deleteRelatedMessages(entityId) {
    if (!entityId) {
      logger.warn('MessageRepository', '删除关联消息的实体ID为空');
      return 0;
    }
    
    try {
      const messages = await this.getRelatedMessages(entityId);
      if (messages.length === 0) {
        logger.info('MessageRepository', `没有与实体${entityId}相关的消息需要删除`);
        return 0;
      }
      
      const messageIds = messages.map(message => message.id);
      const deletedCount = await this.deleteMany(messageIds);
      
      logger.info('MessageRepository', `删除与实体${entityId}相关的${deletedCount}条消息成功`);
      return deletedCount;
    } catch (error) {
      logger.error('MessageRepository', `删除与实体${entityId}相关的消息失败`, error);
      return 0;
    }
  }
  
  /**
   * 清理过期消息
   * @param {Number} expiryDays 过期天数，默认30天
   * @returns {Promise<Number>} 清理的消息数量
   */
  async cleanExpiredMessages(expiryDays = 30) {
    try {
      const allMessages = await this.getAll();
      const validMessages = allMessages.filter(message => message.isValid(expiryDays));
      
      const expiredCount = allMessages.length - validMessages.length;
      if (expiredCount === 0) {
        logger.info('MessageRepository', '没有过期消息需要清理');
        return 0;
      }
      
      await this.saveAll(validMessages);
      
      logger.info('MessageRepository', `清理${expiredCount}条过期消息成功`);
      return expiredCount;
    } catch (error) {
      logger.error('MessageRepository', '清理过期消息失败', error);
      return 0;
    }
  }
}

module.exports = MessageRepository; 