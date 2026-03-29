/**
 * message-repository.js - 消息仓储
 * 
 * 提供消息实体的存储和检索，继承自基础仓储类
 */

const BaseRepository = require('./base-repository');
const { Message, MessageType, MessagePriority, MessageVisibilityScope } = require('../models/message');
const logger = require('../utils/logger');
const batchUtils = require('../utils/batchUtils'); // 引入batchUtils

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

  _getLegacyStorageKey() {
    return `${this.storageKey}:legacy`;
  }

  _getMigrationStorageKey(scope, userId = null) {
    return `${this.storageKey}:migrated:${scope}:${userId || 'all'}`;
  }

  _isArchivedMessage(message) {
    return message && message.isArchived === true;
  }

  async getMessagesByScope({ scope, userId = null, familyId = null }) {
    return this.query(message => {
      if (this._isArchivedMessage(message)) {
        return false;
      }

      if (message.visibilityScope !== scope) {
        return false;
      }

      if (scope === MessageVisibilityScope.USER) {
        if (message.userId !== userId) {
          return false;
        }
        return !familyId || !message.familyId || message.familyId === familyId;
      }

      return !familyId || !message.familyId || message.familyId === familyId;
    });
  }

  async replaceSyncedMessagesByScope(scope, userId, cloudMessages) {
    const allMessages = await this.getAll(false);
    const eventKeys = new Set((cloudMessages || []).map(message => message.messageEventKey).filter(Boolean));
    const retainedMessages = allMessages.filter(message => {
      const sameScope = message.visibilityScope === scope;
      const sameUser = scope !== MessageVisibilityScope.USER || message.userId === userId;

      if (!sameScope || !sameUser) {
        return true;
      }

      if (message.isProvisional) {
        return !message.messageEventKey || !eventKeys.has(message.messageEventKey);
      }

      return message.syncedToCloud !== true;
    });

    const normalizedCloudMessages = (cloudMessages || []).map(message => new Message({
      ...message,
      syncedToCloud: true,
      isLegacy: false,
      isProvisional: false
    }));

    await this._saveData([...retainedMessages, ...normalizedCloudMessages]);
    this.invalidateCache();
    return normalizedCloudMessages;
  }

  async cleanupStaleMessages(scope, userId, validMessageIds) {
    const validIds = new Set(validMessageIds || []);
    const allMessages = await this.getAll(false);
    const filteredMessages = allMessages.filter(message => {
      const sameScope = message.visibilityScope === scope;
      const sameUser = scope !== MessageVisibilityScope.USER || message.userId === userId;

      if (!sameScope || !sameUser) {
        return true;
      }

      if (message.isProvisional || message.syncedToCloud !== true) {
        return true;
      }

      return validIds.has(message.id);
    });

    await this._saveData(filteredMessages);
    this.invalidateCache();
    return true;
  }

  async archiveLegacyMessages(scope, userId = null) {
    const migrationKey = this._getMigrationStorageKey(scope, userId);
    const migrated = await this.storageAdapter.getAsync(migrationKey, false);
    if (migrated) {
      return [];
    }

    const allMessages = await this.getAll(false);
    const legacyCandidates = allMessages.filter(message => {
      if (message.syncedToCloud === true || message.isProvisional || message.isLegacy) {
        return false;
      }
      if (message.visibilityScope !== scope) {
        return false;
      }
      if (scope === MessageVisibilityScope.USER) {
        return message.userId === userId;
      }
      return true;
    });

    if (legacyCandidates.length === 0) {
      await this.storageAdapter.setAsync(migrationKey, true);
      return [];
    }

    const legacyMessages = await this.storageAdapter.getAsync(this._getLegacyStorageKey(), []);
    const nextLegacyMessages = legacyMessages.concat(
      legacyCandidates.map(message => ({ ...message, isLegacy: true }))
    );
    await this.storageAdapter.setAsync(this._getLegacyStorageKey(), nextLegacyMessages);

    const legacyIds = new Set(legacyCandidates.map(message => message.id));
    const retainedMessages = allMessages.filter(message => !legacyIds.has(message.id));
    await this._saveData(retainedMessages);
    await this.storageAdapter.setAsync(migrationKey, true);
    this.invalidateCache();

    return legacyCandidates;
  }
  
  /**
   * 获取未读消息
   * @param {String} userId 可选的用户ID，不传则获取所有用户的消息
   * @returns {Promise<Array>} 未读消息列表
   */
  async getUnreadMessages(userId = null) {
    try {
      const messages = await this.query(message => {
        if (this._isArchivedMessage(message)) {
          return false;
        }

        // 用户过滤
        if (userId && message.userId !== userId) {
          return false;
        }
        return !message.isRead;
      });
      
      logger.info('MessageRepository', `获取未读消息成功${userId ? `, 用户=${userId}` : ''}, 数量=${messages.length}`);
      return messages;
    } catch (error) {
      logger.error('MessageRepository', '获取未读消息失败', error);
      return [];
    }
  }
  
  /**
   * 获取未读消息数量
   * @param {String} userId 可选的用户ID，不传则获取所有用户的消息
   * @returns {Promise<Number>} 未读消息数量
   */
  async getUnreadCount(userId = null) {
    try {
      const unreadMessages = await this.getUnreadMessages(userId);
      return unreadMessages.length;
    } catch (error) {
      logger.error('MessageRepository', '获取未读消息数量失败', error);
      return 0;
    }
  }
  
  /**
   * 根据类型获取消息
   * @param {String} type 消息类型
   * @param {String} userId 可选的用户ID，不传则获取所有用户的消息
   * @returns {Promise<Array>} 指定类型的消息列表
   */
  async getMessagesByType(type, userId = null) {
    if (!type) {
      logger.warn('MessageRepository', '获取消息类型为空');
      return [];
    }
    
    try {
      const messages = await this.query(message => {
        // 用户过滤
        if (userId && message.userId !== userId) {
          return false;
        }
        return message.type === type;
      });
      
      logger.info('MessageRepository', `获取类型为${type}的消息成功${userId ? `, 用户=${userId}` : ''}, 数量=${messages.length}`);
      return messages;
    } catch (error) {
      logger.error('MessageRepository', `获取类型为${type}的消息失败`, error);
      return [];
    }
  }
  
  /**
   * 根据通知子类型获取消息
   * @param {String} notificationType 通知子类型
   * @param {String} userId 可选的用户ID，不传则获取所有用户的消息
   * @returns {Promise<Array>} 指定通知类型的消息列表
   */
  async getMessagesByNotificationType(notificationType, userId = null) {
    if (!notificationType) {
      logger.warn('MessageRepository', '获取消息通知类型为空');
      return [];
    }
    
    try {
      const messages = await this.query(message => {
        // 用户过滤
        if (userId && message.userId !== userId) {
          return false;
        }
        return message.notificationType === notificationType;
      });
      
      logger.info('MessageRepository', `获取通知类型为${notificationType}的消息成功${userId ? `, 用户=${userId}` : ''}, 数量=${messages.length}`);
      return messages;
    } catch (error) {
      logger.error('MessageRepository', `获取通知类型为${notificationType}的消息失败`, error);
      return [];
    }
  }
  
  /**
   * 按优先级获取消息
   * @param {String} priority 优先级
   * @param {String} userId 可选的用户ID，不传则获取所有用户的消息
   * @returns {Promise<Array>} 消息列表
   */
  async getMessagesByPriority(priority, userId = null) {
    if (!priority) {
      logger.warn('MessageRepository', '获取消息优先级为空');
      return [];
    }
    
    try {
      const messages = await this.query(message => {
        if (this._isArchivedMessage(message)) {
          return false;
        }

        // 用户过滤
        if (userId && message.userId !== userId) {
          return false;
        }
        return message.priority === priority;
      });
      
      logger.info('MessageRepository', `获取优先级为${priority}的消息成功${userId ? `, 用户=${userId}` : ''}, 数量=${messages.length}`);
      return messages;
    } catch (error) {
      logger.error('MessageRepository', `获取优先级为${priority}的消息失败`, error);
      return [];
    }
  }
  
  /**
   * 获取高优先级消息
   * @param {String} userId 可选的用户ID，不传则获取所有用户的消息
   * @returns {Promise<Array>} 高优先级消息列表
   */
  async getHighPriorityMessages(userId = null) {
    return this.getMessagesByPriority(MessagePriority.HIGH, userId);
  }
  
  /**
   * 获取与指定实体相关的消息
   * @param {String} entityId 实体ID
   * @param {String} userId 可选的用户ID，不传则获取所有用户的消息
   * @returns {Promise<Array>} 相关消息列表
   */
  async getRelatedMessages(entityId, userId = null) {
    if (!entityId) {
      logger.warn('MessageRepository', '获取关联消息的实体ID为空');
      return [];
    }
    
    try {
      const messages = await this.query(message => {
        // 用户过滤
        if (userId && message.userId !== userId) {
          return false;
        }
        return message.isRelatedTo(entityId);
      });
      
      logger.info('MessageRepository', `获取与实体${entityId}相关的消息成功${userId ? `, 用户=${userId}` : ''}, 数量=${messages.length}`);
      return messages;
    } catch (error) {
      logger.error('MessageRepository', `获取与实体${entityId}相关的消息失败`, error);
      return [];
    }
  }
  
  /**
   * 按时间范围获取消息
   * @param {Number} startTime 开始时间戳
   * @param {Number} endTime 结束时间戳
   * @param {String} userId 可选的用户ID，不传则获取所有用户的消息
   * @returns {Promise<Array>} 消息列表
   */
  async getMessagesByTimeRange(startTime, endTime, userId = null) {
    try {
      const messages = await this.query(message => {
        // 用户过滤
        if (userId && message.userId !== userId) {
          return false;
        }
        return message.createTime >= startTime && message.createTime <= endTime;
      });
      
      logger.info('MessageRepository', `获取时间范围内的消息成功${userId ? `, 用户=${userId}` : ''}, 数量=${messages.length}`);
      return messages;
    } catch (error) {
      logger.error('MessageRepository', '获取时间范围内的消息失败', error);
      return [];
    }
  }
  
  /**
   * 获取今日消息
   * @param {String} userId 可选的用户ID，不传则获取所有用户的消息
   * @returns {Promise<Array>} 今日消息列表
   */
  async getTodayMessages(userId = null) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1;
    
    return this.getMessagesByTimeRange(startOfDay, endOfDay, userId);
  }
  
  /**
   * 获取按日期分组的消息
   * @param {Number} days 天数，默认7天
   * @param {String} userId 可选的用户ID，不传则获取所有用户的消息
   * @returns {Promise<Object>} 按日期分组的消息对象
   */
  async getMessagesByDateGroup(days = 7, userId = null) {
    try {
      const now = new Date();
      const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1).getTime();
      
      const messages = await this.query(message => {
        // 用户过滤
        if (userId && message.userId !== userId) {
          return false;
        }
        return message.createTime >= startTime;
      });
      
      // 按日期分组
      const groupedMessages = {};
      for (let i = 0; i < days; i++) {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        groupedMessages[dateKey] = [];
      }
      
      // 分配消息到日期组
      messages.forEach(message => {
        const msgDate = new Date(message.createTime);
        const dateKey = `${msgDate.getFullYear()}-${String(msgDate.getMonth() + 1).padStart(2, '0')}-${String(msgDate.getDate()).padStart(2, '0')}`;
        
        if (groupedMessages[dateKey]) {
          groupedMessages[dateKey].push(message);
        }
      });
      
      logger.info('MessageRepository', `获取按日期分组的消息成功${userId ? `, 用户=${userId}` : ''}, 总数量=${messages.length}`);
      return groupedMessages;
    } catch (error) {
      logger.error('MessageRepository', '获取按日期分组的消息失败', error);
      return {};
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
   * @param {String} userId 可选的用户ID，不传则标记所有用户的消息
   * @returns {Promise<Number>} 更新的消息数量
   */
  async markAllAsRead(userId = null) {
    try {
      const unreadMessages = await this.getUnreadMessages(userId);
      if (unreadMessages.length === 0) {
        logger.info('MessageRepository', `没有未读消息需要标记${userId ? `, 用户=${userId}` : ''}`);
        return 0;
      }
      
      // 使用批量处理来优化性能
      return this.batchMarkAsRead(unreadMessages);
    } catch (error) {
      logger.error('MessageRepository', '标记所有消息为已读失败', error);
      return 0;
    }
  }
  
  /**
   * 批量标记消息为已读
   * @param {Array} messageIds 消息ID数组
   * @returns {Promise<Number>} 成功标记的消息数量
   */
  async markManyAsRead(messageIds) {
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      logger.warn('MessageRepository', '批量标记已读的消息ID数组为空');
      return 0;
    }
    
    try {
      // 获取所有指定ID的消息
      const messages = await Promise.all(
        messageIds.map(id => this.getById(id))
      );
      
      // 过滤出有效的消息并标记为已读
      const validMessages = messages
        .filter(msg => msg !== null && !msg.isRead);
      
      if (validMessages.length === 0) {
        logger.info('MessageRepository', '没有可标记为已读的有效消息');
        return 0;
      }
      
      // 使用批量处理来优化性能
      return this.batchMarkAsRead(validMessages);
    } catch (error) {
      logger.error('MessageRepository', '批量标记消息为已读失败', error);
      return 0;
    }
  }
  
  /**
   * 使用batchUtils批量标记消息为已读
   * @param {Array} messages 消息对象数组
   * @returns {Promise<Number>} 成功标记的消息数量
   * @private
   */
  async batchMarkAsRead(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return 0;
    }
    
    return new Promise((resolve) => {
      let updatedMessages = [];
      
      batchUtils.batchProcess(
        messages,
        (message) => {
          message.markAsRead();
          updatedMessages.push(message);
        },
        {
          batchSize: 50,
          delay: 0,
          showProgress: false
        },
        async () => {
          try {
            // 保存批量更新的消息
            if (updatedMessages.length > 0) {
              await this.saveAll(updatedMessages);
              logger.info('MessageRepository', `批量标记${updatedMessages.length}条消息为已读成功`);
            }
            resolve(updatedMessages.length);
          } catch (error) {
            logger.error('MessageRepository', '保存批量已读消息失败', error);
            resolve(0);
          }
        }
      );
    });
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
      
      // 使用批量处理删除消息
      return this.batchDeleteMessages(messages);
    } catch (error) {
      logger.error('MessageRepository', `删除与实体${entityId}相关的消息失败`, error);
      return 0;
    }
  }
  
  /**
   * 使用batchUtils批量删除消息
   * @param {Array} messages 消息对象数组
   * @returns {Promise<Number>} 删除的消息数量
   * @private
   */
  async batchDeleteMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return 0;
    }
    
    return new Promise((resolve) => {
      const messageIds = messages.map(message => message.id);
      let successCount = 0;
      let batchCount = Math.ceil(messageIds.length / 50);
      
      // 创建批次
      const batches = batchUtils.chunk(messageIds, 50);
      
      // 处理每个批次
      let processedBatches = 0;
      
      batches.forEach(async (batch, index) => {
        try {
          const deleteCount = await this.deleteMany(batch);
          successCount += deleteCount;
          processedBatches++;
          
          logger.info('MessageRepository', `删除消息批次${index + 1}/${batches.length}完成, 已删除${deleteCount}条`);
          
          // 所有批次处理完成
          if (processedBatches === batches.length) {
            logger.info('MessageRepository', `批量删除消息完成, 共删除${successCount}条`);
            resolve(successCount);
          }
        } catch (error) {
          logger.error('MessageRepository', `删除消息批次${index + 1}失败`, error);
          processedBatches++;
          
          // 即使失败也要继续处理其他批次
          if (processedBatches === batches.length) {
            resolve(successCount);
          }
        }
      });
    });
  }
  
  /**
   * 更新任务相关消息的标题/摘要
   * @param {Object} task 更新后的任务
   * @returns {Promise<Number>} 更新的消息数量
   */
  async updateTaskMessages(task) {
    if (!task || !task.id) {
      logger.warn('MessageRepository', '更新任务消息失败: 任务参数无效');
      return 0;
    }
    
    try {
      const messages = await this.getRelatedMessages(task.id);
      if (messages.length === 0) {
        logger.info('MessageRepository', `没有与任务${task.id}相关的消息需要更新`);
        return 0;
      }
      
      // 使用批量处理更新消息
      return this.batchUpdateTaskMessages(messages, task);
    } catch (error) {
      logger.error('MessageRepository', `更新任务消息失败, 任务ID=${task.id}`, error);
      return 0;
    }
  }
  
  /**
   * 使用batchUtils批量更新任务相关消息
   * @param {Array} messages 消息对象数组
   * @param {Object} task 任务对象
   * @returns {Promise<Number>} 更新的消息数量
   * @private
   */
  async batchUpdateTaskMessages(messages, task) {
    if (!Array.isArray(messages) || messages.length === 0 || !task) {
      return 0;
    }
    
    return new Promise((resolve) => {
      let updatedMessages = [];
      
      batchUtils.batchProcess(
        messages,
        (message) => {
          // 检查消息摘要是否包含任务标题
          if (message.summary && message.summary.includes('"')) {
            // 用新标题替换旧标题
            const newSummary = message.summary.replace(/"([^"]+)"/, `"${task.title}"`);
            if (newSummary !== message.summary) {
              message.update({ summary: newSummary });
              updatedMessages.push(message);
            }
          }
        },
        {
          batchSize: 50,
          delay: 0,
          showProgress: false
        },
        async () => {
          try {
            // 保存批量更新的消息
            if (updatedMessages.length > 0) {
              await this.saveAll(updatedMessages);
              logger.info('MessageRepository', `批量更新任务消息成功, 更新数量=${updatedMessages.length}`);
            }
            resolve(updatedMessages.length);
          } catch (error) {
            logger.error('MessageRepository', '保存批量更新的任务消息失败', error);
            resolve(0);
          }
        }
      );
    });
  }
  
  /**
   * 清理过期消息
   * @param {Number} expiryDays 过期天数，默认30天
   * @returns {Promise<Number>} 清理的消息数量
   */
  async cleanExpiredMessages(expiryDays = 30) {
    try {
      const allMessages = await this.getAll();
      
      // 使用批量处理清理过期消息
      return this.batchCleanExpiredMessages(allMessages, expiryDays);
    } catch (error) {
      logger.error('MessageRepository', '清理过期消息失败', error);
      return 0;
    }
  }
  
  /**
   * 使用batchUtils批量清理过期消息
   * @param {Array} messages 所有消息
   * @param {Number} expiryDays 过期天数
   * @returns {Promise<Number>} 清理的消息数量
   * @private
   */
  async batchCleanExpiredMessages(messages, expiryDays) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return 0;
    }
    
    return new Promise((resolve) => {
      // 先过滤出已过期的消息ID
      const expiredMessages = messages.filter(message => !message.isValid(expiryDays));
      
      if (expiredMessages.length === 0) {
        logger.info('MessageRepository', '没有过期消息需要清理');
        resolve(0);
        return;
      }
      
      const expiredIds = expiredMessages.map(message => message.id);
      logger.info('MessageRepository', `找到${expiredIds.length}条过期消息准备清理`);
      
      // 使用批量删除处理过期消息
      this.batchDeleteMessages(expiredMessages)
        .then(deletedCount => {
          logger.info('MessageRepository', `批量清理过期消息完成, 共清理${deletedCount}条`);
          resolve(deletedCount);
        })
        .catch(error => {
          logger.error('MessageRepository', '批量清理过期消息失败', error);
          resolve(0);
        });
    });
  }
  
  /**
   * 添加消息（支持去重）
   * @param {Message} message 消息对象
   * @returns {Promise<Message>} 保存的消息
   */
  async addMessage(message) {
    if (!message) {
      logger.warn('MessageRepository', '添加消息失败: 消息对象为空');
      return null;
    }
    
    try {
      // 检查消息有效性
      const errors = message.validate();
      if (errors.length > 0) {
        logger.warn('MessageRepository', `添加消息验证失败: ${errors.join(', ')}`);
        return null;
      }
      
      // 获取现有消息
      const existingMessages = await this.getAll();
      
      // 检查是否已存在相似消息
      const similarMessage = existingMessages.find(existing => {
        // 确保existing是Message实例且有isSimilarTo方法
        if (!existing || typeof existing.isSimilarTo !== 'function') {
          logger.warn('MessageRepository', '发现非Message实例或缺少isSimilarTo方法的对象', {
            id: existing?.id,
            type: typeof existing,
            hasMethod: typeof existing?.isSimilarTo,
            constructor: existing?.constructor?.name
          });
          return false;
        }
        return existing.isSimilarTo(message);
      });
      
      if (similarMessage) {
        // 更新现有消息而不是添加新消息
        const updatedMessage = message.clone({ id: similarMessage.id });
        const savedMessage = await this.save(updatedMessage);
        
        logger.info('MessageRepository', `更新现有相似消息: ${similarMessage.id}`);
        return savedMessage;
      } else {
        // 添加新消息
        const savedMessage = await this.save(message);
        
        logger.info('MessageRepository', `添加新消息: ${savedMessage.id}`);
        return savedMessage;
      }
    } catch (error) {
      logger.error('MessageRepository', '添加消息失败', error);
      return null;
    }
  }
  
  /**
   * 批量添加消息（支持去重）
   * @param {Array} messages 消息对象数组
   * @returns {Promise<Number>} 成功添加的消息数量
   */
  async batchAddMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      logger.warn('MessageRepository', '批量添加消息失败: 消息数组为空');
      return 0;
    }
    
    return new Promise((resolve) => {
      let savedCount = 0;
      let validMessages = messages.filter(msg => {
        const errors = msg.validate();
        return errors.length === 0;
      });
      
      if (validMessages.length === 0) {
        logger.warn('MessageRepository', '批量添加消息失败: 没有有效消息');
        resolve(0);
        return;
      }
      
      this.getAll().then(existingMessages => {
        // 使用批量处理添加消息
        let messagesToSave = [];
        let messagesToUpdate = [];
        
        batchUtils.batchProcess(
          validMessages,
          (message) => {
            // 检查是否已存在相似消息
            const similarMessage = existingMessages.find(existing => {
              // 确保existing是Message实例且有isSimilarTo方法
              if (!existing || typeof existing.isSimilarTo !== 'function') {
                return false;
              }
              return existing.isSimilarTo(message);
            });
            
            if (similarMessage) {
              // 准备更新现有消息
              messagesToUpdate.push(message.clone({ id: similarMessage.id }));
            } else {
              // 准备添加新消息
              messagesToSave.push(message);
            }
          },
          {
            batchSize: 50,
            delay: 0,
            showProgress: false
          },
          async () => {
            try {
              // 保存所有新消息
              if (messagesToSave.length > 0) {
                await this.saveAll(messagesToSave);
                savedCount += messagesToSave.length;
                logger.info('MessageRepository', `批量添加${messagesToSave.length}条新消息成功`);
              }
              
              // 更新所有已存在的消息
              if (messagesToUpdate.length > 0) {
                await this.saveAll(messagesToUpdate);
                savedCount += messagesToUpdate.length;
                logger.info('MessageRepository', `批量更新${messagesToUpdate.length}条已存在消息成功`);
              }
              
              resolve(savedCount);
            } catch (error) {
              logger.error('MessageRepository', '保存批量消息失败', error);
              resolve(savedCount);
            }
          }
        );
      }).catch(error => {
        logger.error('MessageRepository', '获取现有消息失败', error);
        resolve(0);
      });
    });
  }
  
  /**
   * 获取消息统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getMessageStats() {
    try {
      const allMessages = await this.getAll();
      const unreadCount = allMessages.filter(msg => !msg.isRead).length;
      
      // 按类型统计
      const typeStats = {};
      Object.values(MessageType).forEach(type => {
        typeStats[type] = allMessages.filter(msg => msg.type === type).length;
      });
      
      // 今日消息
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      const todayCount = allMessages.filter(msg => msg.createTime >= startOfDay).length;
      
      // 高优先级消息
      const highPriorityCount = allMessages.filter(msg => 
        msg.priority === MessagePriority.HIGH && !msg.isRead
      ).length;
      
      const stats = {
        total: allMessages.length,
        unread: unreadCount,
        today: todayCount,
        highPriority: highPriorityCount,
        byType: typeStats
      };
      
      logger.info('MessageRepository', `获取消息统计信息成功`, stats);
      return stats;
    } catch (error) {
      logger.error('MessageRepository', '获取消息统计信息失败', error);
      return {
        total: 0,
        unread: 0,
        today: 0,
        highPriority: 0,
        byType: {}
      };
    }
  }
}

module.exports = MessageRepository; 
