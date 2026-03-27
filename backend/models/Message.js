const { randomBytes } = require('crypto');

class Message {
  constructor({
    messageId,
    familyId = null,
    userId = null,
    actorUserId = null,
    subjectUserId = null,
    operationKey = null,
    messageEventKey,
    visibilityScope,
    type,
    notificationType,
    relatedId = null,
    relatedType = null,
    title,
    summary,
    content = null,
    icon = null,
    priority = 1,
    isRead = false,
    readTime = null,
    isArchived = false,
    createTime = null,
    deletedAt = null,
    createdAt = null,
    updatedAt = null,
  } = {}) {
    this.messageId = messageId || Message.generateId();
    this.familyId = familyId || null;
    this.userId = userId || null;
    this.actorUserId = actorUserId || null;
    this.subjectUserId = subjectUserId || null;
    this.operationKey = operationKey || null;
    this.messageEventKey = messageEventKey;
    this.visibilityScope = visibilityScope;
    this.type = type;
    this.notificationType = notificationType;
    this.relatedId = relatedId || null;
    this.relatedType = relatedType || null;
    this.title = title;
    this.summary = summary;
    this.content = content || null;
    this.icon = icon || null;
    this.priority = Number(priority || 0);
    this.isRead = Boolean(isRead);
    this.readTime = readTime || null;
    this.isArchived = Boolean(isArchived);
    this.createTime = Number(createTime || Date.now());
    this.deletedAt = deletedAt || null;
    this.createdAt = createdAt || null;
    this.updatedAt = updatedAt || null;
  }

  static generateId() {
    return `msg_${randomBytes(8).toString('hex')}`;
  }

  static fromDB(record) {
    return new Message({
      messageId: record.message_id,
      familyId: record.family_id,
      userId: record.user_id,
      actorUserId: record.actor_user_id,
      subjectUserId: record.subject_user_id,
      operationKey: record.operation_key,
      messageEventKey: record.message_event_key,
      visibilityScope: record.visibility_scope,
      type: record.type,
      notificationType: record.notification_type,
      relatedId: record.related_id,
      relatedType: record.related_type,
      title: record.title,
      summary: record.summary,
      content: record.content,
      icon: record.icon,
      priority: record.priority,
      isRead: Boolean(record.is_read),
      readTime: record.read_time,
      isArchived: Boolean(record.is_archived),
      createTime: record.create_time,
      deletedAt: record.deleted_at,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    });
  }

  validate() {
    const errors = [];

    if (!['user', 'family'].includes(this.visibilityScope)) {
      errors.push('visibilityScope 必须为 user 或 family');
    }
    if (!this.type) {
      errors.push('type 不能为空');
    }
    if (!this.notificationType) {
      errors.push('notificationType 不能为空');
    }
    if (!this.messageEventKey) {
      errors.push('messageEventKey 不能为空');
    }
    if (!this.title) {
      errors.push('title 不能为空');
    }
    if (!this.summary) {
      errors.push('summary 不能为空');
    }
    if (this.visibilityScope === 'user' && !this.userId) {
      errors.push('user scope 消息必须提供 userId');
    }
    if (this.visibilityScope === 'family' && this.userId) {
      errors.push('family scope 消息不能携带 userId');
    }

    return errors;
  }

  toDB() {
    return {
      message_id: this.messageId,
      family_id: this.familyId,
      user_id: this.userId,
      actor_user_id: this.actorUserId,
      subject_user_id: this.subjectUserId,
      operation_key: this.operationKey,
      message_event_key: this.messageEventKey,
      visibility_scope: this.visibilityScope,
      type: this.type,
      notification_type: this.notificationType,
      related_id: this.relatedId,
      related_type: this.relatedType,
      title: this.title,
      summary: this.summary,
      content: this.content,
      icon: this.icon,
      priority: this.priority,
      is_read: this.isRead ? 1 : 0,
      read_time: this.readTime,
      is_archived: this.isArchived ? 1 : 0,
      create_time: this.createTime,
    };
  }

  toJSON() {
    return {
      messageId: this.messageId,
      id: this.messageId,
      familyId: this.familyId,
      userId: this.userId,
      actorUserId: this.actorUserId,
      subjectUserId: this.subjectUserId,
      operationKey: this.operationKey,
      messageEventKey: this.messageEventKey,
      visibilityScope: this.visibilityScope,
      type: this.type,
      notificationType: this.notificationType,
      relatedId: this.relatedId,
      relatedType: this.relatedType,
      title: this.title,
      summary: this.summary,
      content: this.content,
      icon: this.icon,
      priority: this.priority,
      isRead: this.isRead,
      readTime: this.readTime,
      isArchived: this.isArchived,
      createTime: this.createTime,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

module.exports = Message;
