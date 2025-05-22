/**
 * message.js - 消息领域模型
 * 
 * 定义消息实体的数据结构、验证规则和业务方法
 */

const logger = require('../utils/logger');

/**
 * 消息类型枚举
 */
const MessageType = {
  SYSTEM: 'system',      // 系统消息
  TASK: 'task',          // 任务相关消息
  REWARD: 'reward',      // 奖励相关消息
  PENALTY: 'penalty',    // 惩罚相关消息
  NOTIFICATION: 'notification' // 通知类消息
};

/**
 * 通知子类型枚举
 */
const NotificationType = {
  NEW: 'new',            // 新建
  UPDATED: 'edited',     // 更新
  COMPLETED: 'completed', // 完成
  DELETED: 'deleted',    // 删除
  UPCOMING: 'upcoming',  // 即将到期
  REQUIRED: 'required',  // 必做任务
  PENALTY: 'penalty',    // 惩罚
  REWARD: 'reward',      // 奖励
  ACHIEVEMENT: 'achievement' // 成就
};

class Message {
  /**
   * 构造函数
   * @param {Object} data 消息数据
   */
  constructor(data = {}) {
    this.id = data.id || `msg_${data.type || 'system'}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.type = data.type || MessageType.SYSTEM;
    this.notificationType = data.notificationType || '';
    this.title = data.title || '系统通知';
    this.summary = data.summary || '';
    this.timestamp = data.timestamp || Date.now();
    this.isRead = data.isRead || false;
    this.icon = data.icon || '🔔';
    this.relatedId = data.relatedId || data.taskId || null; // 兼容旧数据
    this.isBatchOperation = data.isBatchOperation || false;
    this.batchCount = data.batchCount || 0;
    
    // 将原始数据中的其他属性保留，确保向后兼容
    for (const key in data) {
      if (!this.hasOwnProperty(key) && key !== 'id') {
        this[key] = data[key];
      }
    }
    
    logger.info('Message', `消息已创建/加载: ${this.title} [${this.id}]`, {
      type: this.type,
      isRead: this.isRead,
      relatedId: this.relatedId
    });
  }
  
  /**
   * 标记为已读
   * @returns {Message} 当前消息实例
   */
  markAsRead() {
    if (this.isRead) {
      return this;
    }
    
    this.isRead = true;
    logger.info('Message', `消息已标记为已读: ${this.title} [${this.id}]`);
    return this;
  }
  
  /**
   * 是否有效
   * @param {Number} expiryDays 过期天数
   * @returns {Boolean} 是否有效
   */
  isValid(expiryDays = 30) {
    // 过期检查: 默认30天
    if (expiryDays > 0) {
      const expiryTime = this.timestamp + expiryDays * 24 * 60 * 60 * 1000;
      if (Date.now() > expiryTime) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * 获取关联ID
   * @returns {String|null} 关联ID
   */
  getRelatedId() {
    return this.relatedId || this.taskId || null;
  }
  
  /**
   * 是否与指定实体相关
   * @param {String} entityId 实体ID
   * @returns {Boolean} 是否相关
   */
  isRelatedTo(entityId) {
    if (!entityId) return false;
    return this.getRelatedId() === entityId;
  }
  
  /**
   * 复制实例
   * @param {Object} overrides 覆盖的属性
   * @returns {Message} 复制的实例
   */
  clone(overrides = {}) {
    const data = { ...this, ...overrides };
    return new Message(data);
  }
}

module.exports = {
  Message,
  MessageType,
  NotificationType
}; 