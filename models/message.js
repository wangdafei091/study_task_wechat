/**
 * message.js - 消息领域模型
 * 
 * 定义消息实体的数据结构、验证规则和业务方法
 */

/**
 * 消息类型枚举
 */
const MessageType = {
  NOTIFICATION: 'notification', // 通知
  SYSTEM: 'system',             // 系统消息
  TASK: 'task',                 // 任务相关
  REWARD: 'reward',             // 奖励相关
  STAR: 'star',                 // 星星相关
  PENALTY: 'penalty'            // 惩罚消息
};

/**
 * 通知类型枚举
 */
const NotificationType = {
  INFO: 'info',           // 一般信息
  SUCCESS: 'success',     // 成功通知
  WARNING: 'warning',     // 警告通知
  ERROR: 'error',         // 错误通知
  UPCOMING: 'upcoming',   // 即将到期提醒
  EXPIRED: 'expired',     // 过期提醒
  COMPLETED: 'completed', // 完成提醒
  HISTORY_COMPLETED: 'history_completed', // 历史补打卡提醒
  MAKEUP_COMPLETED: 'makeup_completed', // 逾期补做提醒
  NEW: 'new',            // 新建提醒
  UPDATED: 'updated',    // 更新提醒
  DELETED: 'deleted',    // 删除提醒
  REQUIRED: 'required'   // 必做提醒
};

/**
 * 消息优先级枚举
 */
const MessagePriority = {
  LOW: 0,      // 低优先级
  MEDIUM: 1,   // 中等优先级
  HIGH: 2      // 高优先级
};

const MessageVisibilityScope = {
  USER: 'user',
  FAMILY: 'family'
};

class Message {
  /**
   * 构造函数
   * @param {Object} data 消息数据
   */
  constructor(data = {}) {
    // 基础信息
    this.id = data.id || `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.userId = data.userId || ''; // 用户ID，标识消息归属
    this.familyId = data.familyId || null;
    this.actorUserId = data.actorUserId || null;
    this.subjectUserId = data.subjectUserId || null;
    this.operationKey = data.operationKey || null;
    this.messageEventKey = data.messageEventKey || null;
    this.visibilityScope = data.visibilityScope || (this.userId ? MessageVisibilityScope.USER : MessageVisibilityScope.FAMILY);
    this.type = data.type || MessageType.NOTIFICATION;
    this.notificationType = data.notificationType || NotificationType.INFO;
    
    // 内容相关
    this.title = data.title || '';
    this.content = data.content || '';
    this.summary = data.summary || '';
    
    // 关联对象
    this.relatedId = data.relatedId || '';
    this.relatedType = data.relatedType || '';
    
    // 状态相关
    this.isRead = data.isRead || false;
    this.isPinned = data.isPinned || false;
    this.isArchived = data.isArchived || false;
    this.isLegacy = data.isLegacy === true;
    this.isProvisional = data.isProvisional === true;
    this.syncedToCloud = data.syncedToCloud === true;
    
    // 时间相关
    this.createTime = data.createTime || Date.now();
    this.readTime = data.readTime || 0;
    this.expireTime = data.expireTime || 0; // 0表示永不过期
    
    // 其他属性
    this.icon = data.icon || this._getDefaultIcon();
    this.data = data.data || {};
    this.actions = data.actions || [];
    this.priority = data.priority || 0; // 0-正常，1-重要，2-紧急
  }
  
  /**
   * 获取默认图标
   * @private
   * @returns {String} 默认图标
   */
  _getDefaultIcon() {
    switch (this.type) {
      case MessageType.NOTIFICATION:
        switch (this.notificationType) {
          case NotificationType.SUCCESS: return '✅';
          case NotificationType.WARNING: return '⚠️';
          case NotificationType.ERROR: return '❌';
          case NotificationType.UPCOMING: return '⏰';
          case NotificationType.EXPIRED: return '🕒';
          case NotificationType.COMPLETED: return '🎉';
          case NotificationType.HISTORY_COMPLETED: return '🗂️';
          default: return 'ℹ️';
        }
      case MessageType.SYSTEM: return '🔧';
      case MessageType.TASK: return '📝';
      case MessageType.REWARD: return '🎁';
      case MessageType.STAR: return '⭐';
      default: return 'ℹ️';
    }
  }
  
  /**
   * 验证消息数据有效性
   * @returns {Array} 错误信息数组，如果没有错误则为空数组
   */
  validate() {
    const errors = [];
    
    // 验证基本信息
    if (!this.type) {
      errors.push('消息类型不能为空');
    }
    
    if (!this.title && !this.content) {
      errors.push('消息必须有标题或内容');
    }

    if (!this.visibilityScope || !Object.values(MessageVisibilityScope).includes(this.visibilityScope)) {
      errors.push('消息可见范围无效');
    }

    if (this.visibilityScope === MessageVisibilityScope.USER && !this.userId) {
      errors.push('个人消息必须指定 userId');
    }
    
    // 验证日期
    if (this.expireTime && this.expireTime < this.createTime) {
      errors.push('过期时间不能早于创建时间');
    }
    
    if (this.isRead && !this.readTime) {
      errors.push('已读消息必须有阅读时间');
    }
    
    return errors;
  }
  
  /**
   * 标记为已读
   * @returns {Message} 当前消息实例
   */
  markAsRead() {
    if (!this.isRead) {
      this.isRead = true;
      this.readTime = Date.now();
    }
    return this;
  }
  
  /**
   * 标记为未读
   * @returns {Message} 当前消息实例
   */
  markAsUnread() {
    this.isRead = false;
    this.readTime = 0;
    return this;
  }
  
  /**
   * 切换置顶状态
   * @returns {Message} 当前消息实例
   */
  togglePin() {
    this.isPinned = !this.isPinned;
    return this;
  }

  /**
   * 归档消息
   * @returns {Message} 当前消息实例
   */
  archive() {
    this.isArchived = true;
    return this;
  }

  /**
   * 取消归档
   * @returns {Message} 当前消息实例
   */
  unarchive() {
    this.isArchived = false;
    return this;
  }

  /**
   * 更新消息属性
   * @param {Object} updates 要更新的属性
   * @returns {Message} 当前消息实例
   */
  update(updates = {}) {
    Object.assign(this, updates);
    return this;
  }
  
  /**
   * 消息是否已过期
   * @returns {Boolean} 是否已过期
   */
  isExpired() {
    if (!this.expireTime) return false; // 未设置过期时间
    return Date.now() > this.expireTime;
  }
  
  /**
   * 获取消息样式类
   * @returns {String} 样式类名
   */
  getStyleClass() {
    let baseClass = 'message';
    
    if (this.isPinned) baseClass += ' pinned';
    if (this.isRead) baseClass += ' read';
    if (this.isArchived) baseClass += ' archived';
    if (this.isExpired()) baseClass += ' expired';
    
    switch (this.type) {
      case MessageType.NOTIFICATION:
        baseClass += ' notification';
        baseClass += ` ${this.notificationType}`;
        break;
      case MessageType.SYSTEM:
        baseClass += ' system';
        break;
      case MessageType.TASK:
        baseClass += ' task';
        break;
      case MessageType.REWARD:
        baseClass += ' reward';
        break;
      case MessageType.STAR:
        baseClass += ' star';
        break;
    }
    
    switch (this.priority) {
      case 1: baseClass += ' important'; break;
      case 2: baseClass += ' urgent'; break;
    }
    
    return baseClass;
  }
  
  /**
   * 获取格式化的创建时间
   * @returns {String} 格式化的时间字符串
   */
  getFormattedTime() {
    const date = new Date(this.createTime);
    return date.toLocaleString();
  }
  
  /**
   * 获取相对时间描述
   * @returns {String} 相对时间描述
   */
  getRelativeTime() {
    const now = Date.now();
    const diff = now - this.createTime;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    
    const date = new Date(this.createTime);
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }
  
  /**
   * 克隆消息
   * @param {Object} overrides 要覆盖的属性
   * @param {Boolean} generateNewId 是否生成新ID
   * @returns {Message} 新的消息实例
   */
  clone(overrides = {}, generateNewId = true) {
    // 准备基础数据
    const baseData = { ...this };
    
    // 如果需要生成新ID
    if (generateNewId) {
      baseData.id = `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      baseData.createTime = Date.now();
      baseData.isRead = false;
      baseData.readTime = 0;
    }
    
    // 应用覆盖属性
    const clonedData = {
      ...baseData,
      ...overrides
    };
    
    return new Message(clonedData);
  }

  /**
   * 检查是否与另一个消息相似（用于去重）
   * @param {Message} other 另一个消息对象
   * @returns {Boolean} 是否相似
   */
  isSimilarTo(other) {
    if (!other || !(other instanceof Message)) {
      return false;
    }

    if (this.messageEventKey && other.messageEventKey) {
      return this.messageEventKey === other.messageEventKey &&
        this.visibilityScope === other.visibilityScope;
    }
    
    // 基本类型和通知类型必须相同
    if (this.type !== other.type || this.notificationType !== other.notificationType) {
      return false;
    }
    
    // 关联对象必须相同
    if (this.relatedId !== other.relatedId || this.relatedType !== other.relatedType) {
      return false;
    }
    
    // 标题和内容必须相同
    if (this.title !== other.title || this.content !== other.content) {
      return false;
    }
    
    // 时间差不能超过5分钟（避免短时间内重复创建相同消息）
    const timeDiff = Math.abs(this.createTime - other.createTime);
    if (timeDiff > 5 * 60 * 1000) {
      return false;
    }
    
    return true;
  }

  /**
   * 检查消息是否与指定实体相关
   * @param {String} entityId 实体ID
   * @returns {Boolean} 是否与指定实体相关
   */
  isRelatedTo(entityId) {
    if (!entityId) {
      return false;
    }
    
    // 检查直接关联
    return this.relatedId === entityId;
  }

  /**
   * 检查消息是否有效（未过期且符合保留条件）
   * @param {Number} expiryDays 保留天数
   * @returns {Boolean} 是否有效
   */
  isValid(expiryDays = 30) {
    // 检查是否已过期
    if (this.isExpired()) {
      return false;
    }
    
    // 检查是否超过保留期限
    const now = Date.now();
    const maxAge = expiryDays * 24 * 60 * 60 * 1000;
    if (now - this.createTime > maxAge) {
      return false;
    }
    
    return true;
  }

  /**
   * 检查是否为高优先级消息
   * @returns {Boolean} 是否为高优先级
   */
  isHighPriority() {
    return this.priority >= MessagePriority.MEDIUM;
  }
}

module.exports = {
  Message,
  MessageType,
  NotificationType,
  MessagePriority,
  MessageVisibilityScope
};
