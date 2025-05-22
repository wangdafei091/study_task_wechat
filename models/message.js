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

/**
 * 消息优先级枚举
 */
const MessagePriority = {
  LOW: 'low',            // 低优先级
  MEDIUM: 'medium',      // 中优先级
  HIGH: 'high'           // 高优先级
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
    this.content = data.content || data.summary || '';
    this.timestamp = data.timestamp || Date.now();
    this.isRead = data.isRead || false;
    this.icon = data.icon || '🔔';
    this.relatedId = data.relatedId || data.taskId || null; // 兼容旧数据
    this.isBatchOperation = data.isBatchOperation || false;
    this.batchCount = data.batchCount || 0;
    this.priority = data.priority || this._derivePriority(data);
    this.category = data.category || this._deriveCategory();
    this.expiresAt = data.expiresAt || this._calculateExpiryTime(data.expiryDays);
    this.tags = data.tags || this._deriveTags();
    
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
   * 验证消息数据有效性
   * @returns {Array} 错误信息数组，如果没有错误则为空数组
   */
  validate() {
    const errors = [];
    
    if (!this.title) {
      errors.push('消息标题不能为空');
    } else if (this.title.length > 100) {
      errors.push('消息标题长度不能超过100个字符');
    }
    
    if (!this.summary) {
      errors.push('消息摘要不能为空');
    } else if (this.summary.length > 500) {
      errors.push('消息摘要长度不能超过500个字符');
    }
    
    if (!Object.values(MessageType).includes(this.type)) {
      errors.push(`消息类型 ${this.type} 无效`);
    }
    
    if (this.notificationType && 
        this.type === MessageType.TASK && 
        !Object.values(NotificationType).includes(this.notificationType)) {
      errors.push(`通知类型 ${this.notificationType} 无效`);
    }
    
    if (this.priority && !Object.values(MessagePriority).includes(this.priority)) {
      errors.push(`优先级 ${this.priority} 无效`);
    }
    
    // 按类型验证必要字段
    if (this.type === MessageType.TASK && !this.relatedId) {
      errors.push('任务消息必须关联任务ID');
    }
    
    if (this.type === MessageType.REWARD && !this.relatedId) {
      errors.push('奖励消息必须关联奖励ID');
    }
    
    // 检验批量操作数据一致性
    if (this.isBatchOperation && this.batchCount <= 0) {
      errors.push('批量操作消息的批次数量必须大于0');
    }
    
    // 检验时间戳有效性
    if (this.timestamp && (isNaN(this.timestamp) || this.timestamp <= 0)) {
      errors.push('时间戳无效');
    }
    
    // 检验过期时间有效性
    if (this.expiresAt && (isNaN(this.expiresAt) || this.expiresAt < 0)) {
      errors.push('过期时间无效');
    }
    
    return errors;
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
   * 标记为未读
   * @returns {Message} 当前消息实例
   */
  markAsUnread() {
    if (!this.isRead) {
      return this;
    }
    
    this.isRead = false;
    logger.info('Message', `消息已标记为未读: ${this.title} [${this.id}]`);
    return this;
  }
  
  /**
   * 是否有效（未过期）
   * @param {Number} expiryDays 过期天数，默认使用消息自身的过期时间
   * @returns {Boolean} 是否有效
   */
  isValid(expiryDays) {
    const now = Date.now();
    
    // 优先使用设置的过期时间
    if (this.expiresAt) {
      return now < this.expiresAt;
    }
    
    // 如果没有设置，使用传入的过期天数
    if (expiryDays > 0) {
      const expiryTime = this.timestamp + expiryDays * 24 * 60 * 60 * 1000;
      return now < expiryTime;
    }
    
    // 如果都没有设置，则永不过期
    return true;
  }
  
  /**
   * 是否快过期（1天内过期）
   * @returns {Boolean} 是否快过期
   */
  isNearExpiry() {
    if (!this.expiresAt) return false;
    
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    
    return this.expiresAt > now && (this.expiresAt - now) < oneDayMs;
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
   * 更新消息内容
   * @param {Object} data 更新数据
   * @returns {Message} 当前消息实例
   */
  update(data) {
    if (!data) return this;
    
    // 只更新可更新的字段
    if (data.title !== undefined) this.title = data.title;
    if (data.summary !== undefined) this.summary = data.summary;
    if (data.content !== undefined) this.content = data.content;
    if (data.icon !== undefined) this.icon = data.icon;
    if (data.priority !== undefined) this.priority = data.priority;
    if (data.category !== undefined) this.category = data.category;
    if (data.expiresAt !== undefined) this.expiresAt = data.expiresAt;
    if (data.tags !== undefined) this.tags = data.tags;
    
    logger.info('Message', `消息已更新: ${this.title} [${this.id}]`);
    return this;
  }
  
  /**
   * 获取创建时间的格式化字符串
   * @returns {String} 格式化的时间字符串
   */
  getFormattedTime() {
    const date = new Date(this.timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit', 
      minute: '2-digit'
    });
  }
  
  /**
   * 获取相对时间描述
   * @returns {String} 相对时间描述
   */
  getRelativeTimeDescription() {
    const now = Date.now();
    const diff = now - this.timestamp;
    
    // 小于1分钟
    if (diff < 60 * 1000) {
      return '刚刚';
    }
    
    // 小于1小时
    if (diff < 60 * 60 * 1000) {
      const minutes = Math.floor(diff / (60 * 1000));
      return `${minutes}分钟前`;
    }
    
    // 小于1天
    if (diff < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diff / (60 * 60 * 1000));
      return `${hours}小时前`;
    }
    
    // 小于7天
    if (diff < 7 * 24 * 60 * 60 * 1000) {
      const days = Math.floor(diff / (24 * 60 * 60 * 1000));
      return `${days}天前`;
    }
    
    // 大于7天，返回具体日期
    return this.getFormattedTime();
  }
  
  /**
   * 获取过期时间的描述
   * @returns {String} 过期时间描述
   */
  getExpiryDescription() {
    if (!this.expiresAt) return '永久有效';
    
    const now = Date.now();
    
    if (now > this.expiresAt) {
      return '已过期';
    }
    
    const diff = this.expiresAt - now;
    const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
    
    if (days <= 1) return '今天到期';
    if (days <= 7) return `${days}天后到期`;
    
    const date = new Date(this.expiresAt);
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}到期`;
  }
  
  /**
   * 是否为高优先级消息
   * @returns {Boolean} 是否为高优先级
   */
  isHighPriority() {
    return this.priority === MessagePriority.HIGH;
  }
  
  /**
   * 是否为中优先级消息
   * @returns {Boolean} 是否为中优先级
   */
  isMediumPriority() {
    return this.priority === MessagePriority.MEDIUM;
  }
  
  /**
   * 是否为低优先级消息
   * @returns {Boolean} 是否为低优先级
   */
  isLowPriority() {
    return this.priority === MessagePriority.LOW;
  }
  
  /**
   * 设置优先级
   * @param {String} priority 优先级
   * @returns {Message} 当前消息实例
   */
  setPriority(priority) {
    if (Object.values(MessagePriority).includes(priority)) {
      this.priority = priority;
      logger.info('Message', `消息优先级已设置为${priority}: ${this.title} [${this.id}]`);
    } else {
      logger.warn('Message', `尝试设置无效的优先级${priority}: ${this.title} [${this.id}]`);
    }
    return this;
  }
  
  /**
   * 设置过期时间
   * @param {Number} days 天数
   * @returns {Message} 当前消息实例
   */
  setExpiryDays(days) {
    if (days <= 0) {
      this.expiresAt = null; // 永不过期
    } else {
      this.expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
    }
    logger.info('Message', `消息过期时间已设置: ${this.title} [${this.id}], ${this.getExpiryDescription()}`);
    return this;
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
  
  /**
   * 判断消息是否相似（用于去重）
   * @param {Message} other 另一个消息对象
   * @returns {Boolean} 是否相似
   */
  isSimilarTo(other) {
    if (!other) return false;
    
    // 对于任务或奖励消息，主要使用相同的关联ID和通知类型来判断
    if ((this.type === MessageType.TASK || this.type === MessageType.REWARD) &&
        this.getRelatedId() === other.getRelatedId() &&
        this.notificationType === other.notificationType &&
        !this.isRead && !other.isRead) {
      return true;
    }
    
    // 对于其他类型，比较标题和摘要
    if (this.type === other.type && 
        this.title === other.title &&
        this.summary === other.summary &&
        !this.isRead && !other.isRead) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 添加标签
   * @param {String} tag 标签名
   * @returns {Message} 当前消息实例
   */
  addTag(tag) {
    if (!tag) return this;
    
    if (!this.tags) {
      this.tags = [];
    }
    
    if (!this.tags.includes(tag)) {
      this.tags.push(tag);
      logger.info('Message', `消息添加标签: ${tag}, ${this.title} [${this.id}]`);
    }
    
    return this;
  }
  
  /**
   * 移除标签
   * @param {String} tag 标签名
   * @returns {Message} 当前消息实例
   */
  removeTag(tag) {
    if (!tag || !this.tags) return this;
    
    const index = this.tags.indexOf(tag);
    if (index !== -1) {
      this.tags.splice(index, 1);
      logger.info('Message', `消息移除标签: ${tag}, ${this.title} [${this.id}]`);
    }
    
    return this;
  }
  
  /**
   * 判断是否包含标签
   * @param {String} tag 标签名
   * @returns {Boolean} 是否包含标签
   */
  hasTag(tag) {
    if (!tag || !this.tags) return false;
    return this.tags.includes(tag);
  }
  
  /**
   * 计算基于天数的过期时间戳
   * @param {Number} days 过期天数
   * @returns {Number|null} 过期时间戳或null（永不过期）
   * @private
   */
  _calculateExpiryTime(days) {
    if (!days || days <= 0) return null; // 永不过期
    return Date.now() + days * 24 * 60 * 60 * 1000;
  }
  
  /**
   * 根据消息类型和通知类型推导消息类别
   * @returns {String} 消息类别
   * @private
   */
  _deriveCategory() {
    if (this.type === MessageType.TASK) {
      if (this.notificationType === NotificationType.COMPLETED) return 'success';
      if (this.notificationType === NotificationType.REQUIRED) return 'warning';
      if (this.notificationType === NotificationType.UPCOMING) return 'reminder';
      return 'task';
    }
    
    if (this.type === MessageType.REWARD) return 'reward';
    if (this.type === MessageType.PENALTY) return 'penalty';
    if (this.type === MessageType.SYSTEM) {
      if (this.notificationType === NotificationType.ACHIEVEMENT) return 'achievement';
      return 'system';
    }
    
    return 'other';
  }
  
  /**
   * 根据消息内容和类型自动推导优先级
   * @param {Object} data 消息数据
   * @returns {String} 优先级
   * @private
   */
  _derivePriority(data) {
    // 如果已经有优先级，则使用它
    if (data.priority && Object.values(MessagePriority).includes(data.priority)) {
      return data.priority;
    }
    
    // 根据类型和通知类型自动推导优先级
    const type = data.type || this.type;
    const notificationType = data.notificationType || this.notificationType;
    
    // 高优先级情况
    if (type === MessageType.PENALTY) return MessagePriority.HIGH;
    if (type === MessageType.TASK && notificationType === NotificationType.REQUIRED) return MessagePriority.HIGH;
    if (type === MessageType.TASK && notificationType === NotificationType.UPCOMING) return MessagePriority.HIGH;
    
    // 中优先级情况
    if (type === MessageType.TASK && notificationType === NotificationType.COMPLETED) return MessagePriority.MEDIUM;
    if (type === MessageType.REWARD) return MessagePriority.MEDIUM;
    if (type === MessageType.SYSTEM && notificationType === NotificationType.ACHIEVEMENT) return MessagePriority.MEDIUM;
    
    // 默认为低优先级
    return MessagePriority.LOW;
  }
  
  /**
   * 根据消息类型和内容自动生成标签
   * @returns {Array} 标签数组
   * @private
   */
  _deriveTags() {
    const tags = [];
    
    // 根据类型添加标签
    tags.push(this.type);
    
    // 根据通知类型添加标签
    if (this.notificationType) {
      tags.push(this.notificationType);
    }
    
    // 根据优先级添加标签
    if (this.priority) {
      tags.push(`priority:${this.priority}`);
    }
    
    // 根据类别添加标签
    const category = this._deriveCategory();
    if (category) {
      tags.push(`category:${category}`);
    }
    
    // 如果是批量操作，添加批量标签
    if (this.isBatchOperation) {
      tags.push('batch');
    }
    
    return tags;
  }
}

module.exports = {
  Message,
  MessageType,
  NotificationType,
  MessagePriority
}; 