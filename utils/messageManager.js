/**
 * messageManager.js - 消息处理工具类
 * 
 * 提供消息相关的通用方法，如添加消息、更新消息、删除消息等
 */

const logger = require('./logger');
const storageUtils = require('./storageUtils');

const messageManager = {
  /**
   * 创建通用消息
   * @private
   * @param {Object} messageData 消息数据对象
   * @param {String} messageData.type 消息类型
   * @param {String} messageData.title 消息标题
   * @param {String} messageData.summary 消息摘要
   * @param {String} messageData.icon 消息图标
   * @param {Object} messageData.metadata 额外元数据
   * @returns {Object} 创建的消息对象
   */
  _createMessage: function(messageData) {
    const { type, title, summary, icon, ...metadata } = messageData;
    const now = Date.now();
    
    // 创建消息基本结构
    const message = {
      id: `msg_${type}_${now}_${Math.floor(Math.random() * 1000)}`,
      type: type || 'system',
      title: title || '系统通知',
      summary: summary || '',
      timestamp: now,
      isRead: false,
      icon: icon || '🔔',
      ...metadata
    };
    
    logger.info('messageManager', `创建${type}消息: ${title}`, message);
    
    // 添加到消息列表
    this.addMessage(message);
    return message;
  },
  
  // 创建任务相关消息
  createTaskMessage: function(task, type = 'new', options = {}) {
    // 检查是否是批量操作
    const isBatchOperation = options.isBatchOperation || false;
    const batchCount = options.batchCount || 0;
    
    let title, summary, icon;
    
    switch(type) {
      case 'new':
        title = '新任务提醒';
        summary = isBatchOperation 
          ? `您有${batchCount}个"${task.title}"循环任务已添加到计划中` 
          : `您有新的任务"${task.title}"已添加到计划中`;
        icon = '📝';
        break;
      case 'upcoming':
        title = '任务即将到期';
        summary = `您的任务"${task.title}"将在不久后到期，请及时完成`;
        icon = '⏰';
        break;
      case 'edited':
        title = '任务已更新';
        summary = isBatchOperation 
          ? `已更新${batchCount}个"${task.title}"循环任务` 
          : `任务"${task.title}"的内容已被更新`;
        icon = '✏️';
        break;
      case 'completed':
        title = '任务已完成';
        summary = `恭喜您完成了任务"${task.title}"`;
        icon = '✅';
        break;
      case 'required':
        title = '必做任务提醒';
        summary = `请务必完成任务"${task.title}"，否则将扣除5积分`;
        icon = '⚠️';
        break;
      case 'deleted':
        title = '任务已删除';
        summary = isBatchOperation 
          ? `已删除${batchCount}个"${task.title}"循环任务` 
          : `任务"${task.title}"已被删除`;
        icon = '🗑️';
        break;
    }
    
    return this._createMessage({
      type: 'task',
      notificationType: type,
      taskId: task.id,
      title,
      summary,
      icon,
      isBatchOperation,
      batchCount
    });
  },
  
  // 创建系统消息
  createSystemMessage: function(content, type = 'system', callback) {
    let title, icon;
    
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
      default:
        title = '系统通知';
        icon = '🔔';
    }
    
    const message = this._createMessage({
      type: 'system',
      notificationType: type,
      title,
      summary: content,
      icon
    });
    
    // 处理回调
    if (typeof callback === 'function') {
      callback(message);
    } else if (callback && typeof callback.success === 'function') {
      callback.success(message);
    }
    
    return message;
  },
  
  // 创建积分惩罚消息
  createPenaltyMessage: function(task, points) {
    return this._createMessage({
      type: 'penalty',
      taskId: task.id,
      title: '星星扣除提醒',
      summary: `必做任务"${task.title}"未完成，已扣除${points}颗星星`,
      icon: '⚠️'
    });
  },
  
  // 添加消息
  addMessage: function(message) {
    // 获取现有消息
    storageUtils.getAsync('messageData', (messages) => {
      messages = messages || [];
      
      // 检查是否已存在相同类型、相同任务的未读消息(去重)
      const existingSimilarMessage = messages.find(msg => 
        msg.type === 'task' && 
        msg.taskId === message.taskId && 
        msg.notificationType === message.notificationType &&
        !msg.isRead
      );
      
      // 如果已存在相似消息，更新它而不是添加新消息
      if (existingSimilarMessage) {
        messages = messages.map(msg => {
          if (msg.id === existingSimilarMessage.id) {
            return {
              ...message,
              id: msg.id // 保持原消息ID
            };
          }
          return msg;
        });
        logger.info('messageManager', `更新现有消息: ${existingSimilarMessage.id}`);
      } else {
        // 添加新消息
        messages.unshift(message);
        logger.info('messageManager', `添加新消息: ${message.id}`);
      }
      
      // 保存到本地存储
      storageUtils.setAsync('messageData', messages, () => {
        // 触发全局消息更新事件
        this._notifyMessageUpdate(messages);
      });
    });
  },
  
  // 更新与任务相关的消息
  updateTaskMessages: function(task) {
    storageUtils.getAsync('messageData', (messages) => {
      messages = messages || [];
      let updated = false;
      
      // 更新与此任务相关的消息
      const updatedMessages = messages.map(msg => {
        if (msg.type === 'task' && msg.taskId === task.id) {
          // 更新消息中的任务标题
          if (msg.summary.includes('"')) {
            msg.summary = msg.summary.replace(/"([^"]+)"/, `"${task.title}"`);
            updated = true;
            logger.info('messageManager', `更新消息内容: ${msg.id}`);
          }
        }
        return msg;
      });
      
      if (updated) {
        // 保存更新后的消息
        storageUtils.setAsync('messageData', updatedMessages, () => {
          // 触发全局消息更新事件
          this._notifyMessageUpdate(updatedMessages);
        });
      }
    });
  },
  
  // 删除与任务相关的消息
  deleteTaskMessages: function(taskId, callback) {
    if (!taskId) {
      logger.error('messageManager', `删除任务消息失败: 任务ID为空`);
      if (typeof callback === 'function') {
        callback(0);
      }
      return;
    }
    
    logger.info('messageManager', `开始删除任务消息: ${taskId}`);
    
    storageUtils.getAsync('messageData', (messages) => {
      messages = messages || [];
      let originalCount = messages.length;
      
      // 过滤掉所有与此任务相关的消息
      const filteredMessages = messages.filter(msg => !(msg.type === 'task' && msg.taskId === taskId));
      const deletedCount = originalCount - filteredMessages.length;
      
      logger.info('messageManager', `删除了${deletedCount}条与任务${taskId}相关的消息`);
      
      if (deletedCount > 0) {
        // 保存更新后的消息列表
        storageUtils.setAsync('messageData', filteredMessages, () => {
          // 触发全局消息更新事件
          this._notifyMessageUpdate(filteredMessages);
          
          if (typeof callback === 'function') {
            callback(deletedCount);
          }
        });
      } else {
        if (typeof callback === 'function') {
          callback(0);
        }
      }
    });
  },
  
  // 获取所有消息
  getAllMessages: function(callback) {
    storageUtils.getAsync('messageData', (messages) => {
      callback(messages || []);
    });
  },
  
  // 获取未读消息数量
  getUnreadCount: function(callback) {
    this.getAllMessages(messages => {
      const unreadCount = messages.filter(msg => !msg.isRead).length;
      logger.info('messageManager', `未读消息数量: ${unreadCount}`);
      callback(unreadCount);
    });
  },
  
  // 标记消息为已读
  markAsRead: function(messageId, callback) {
    storageUtils.getAsync('messageData', (messages) => {
      if (!messages || messages.length === 0) {
        logger.warn('messageManager', `没有消息可标记为已读`);
        if (typeof callback === 'function') {
          callback(false);
        }
        return;
      }
      
      let updated = false;
      
      // 更新指定消息的已读状态
      const updatedMessages = messages.map(msg => {
        if (msg.id === messageId && !msg.isRead) {
          updated = true;
          logger.info('messageManager', `标记消息为已读: ${messageId}`);
          return { ...msg, isRead: true };
        }
        return msg;
      });
      
      if (updated) {
        storageUtils.setAsync('messageData', updatedMessages, () => {
          // 触发全局消息更新事件
          this._notifyMessageUpdate(updatedMessages);
          
          if (typeof callback === 'function') {
            callback(true);
          }
        });
      } else {
        if (typeof callback === 'function') {
          callback(false);
        }
      }
    });
  },
  
  // 标记所有消息为已读
  markAllAsRead: function(callback) {
    storageUtils.getAsync('messageData', (messages) => {
      if (!messages || messages.length === 0) {
        logger.warn('messageManager', `没有消息可标记为已读`);
        if (typeof callback === 'function') {
          callback(0);
        }
        return;
      }
      
      // 检查是否有未读消息
      const unreadCount = messages.filter(msg => !msg.isRead).length;
      
      if (unreadCount === 0) {
        logger.info('messageManager', `所有消息已经是已读状态`);
        if (typeof callback === 'function') {
          callback(0);
        }
        return;
      }
      
      // 更新所有消息的已读状态
      const updatedMessages = messages.map(msg => {
        if (!msg.isRead) {
          return { ...msg, isRead: true };
        }
        return msg;
      });
      
      storageUtils.setAsync('messageData', updatedMessages, () => {
        logger.info('messageManager', `标记全部${unreadCount}条消息为已读`);
        
        // 触发全局消息更新事件
        this._notifyMessageUpdate(updatedMessages);
        
        if (typeof callback === 'function') {
          callback(unreadCount);
        }
      });
    });
  },
  
  // 删除指定的消息
  deleteMessage: function(messageId, callback) {
    storageUtils.getAsync('messageData', (messages) => {
      if (!messages || messages.length === 0) {
        logger.warn('messageManager', `没有消息可删除`);
        if (typeof callback === 'function') {
          callback(false);
        }
        return;
      }
      
      // 过滤掉要删除的消息
      const filteredMessages = messages.filter(msg => msg.id !== messageId);
      
      if (filteredMessages.length < messages.length) {
        storageUtils.setAsync('messageData', filteredMessages, () => {
          logger.info('messageManager', `删除消息: ${messageId}`);
          
          // 触发全局消息更新事件
          this._notifyMessageUpdate(filteredMessages);
          
          if (typeof callback === 'function') {
            callback(true);
          }
        });
      } else {
        logger.warn('messageManager', `未找到要删除的消息: ${messageId}`);
        if (typeof callback === 'function') {
          callback(false);
        }
      }
    });
  },
  
  // 清空所有消息
  clearAllMessages: function(callback) {
    storageUtils.setAsync('messageData', [], () => {
      logger.info('messageManager', `清空所有消息`);
      
      // 触发全局消息更新事件
      this._notifyMessageUpdate([]);
      
      if (typeof callback === 'function') {
        callback(true);
      }
    });
  },
  
  // 触发消息更新事件
  _notifyMessageUpdate: function(messages) {
    const app = getApp();
    if (app && app.globalData) {
      if (typeof app.globalData.eventBus === 'object') {
        app.globalData.eventBus.emit('messagesUpdated', messages);
        logger.info('messageManager', `触发全局消息更新事件`);
      }
    }
  }
};

module.exports = messageManager; 