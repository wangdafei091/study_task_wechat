/**
 * 用户数据模型
 */

class User {
  constructor({
    userId,
    openid,
    unionid = null,
    name,
    avatar = '',
    role = 'parent',
    status = 'active',
    createdAt = null,
    updatedAt = null,
  } = {}) {
    this.userId = userId;
    this.openid = openid;
    this.unionid = unionid;
    this.name = name;
    this.avatar = avatar;
    this.role = role;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  /**
   * 从数据库记录转换为User模型
   * @param {Object} dbRecord - 数据库记录
   * @returns {User} User实例
   */
  static fromDB(dbRecord) {
    return new User({
      userId: dbRecord.user_id,
      openid: dbRecord.openid,
      unionid: dbRecord.unionid,
      name: dbRecord.nickname, // 数据库字段是nickname
      avatar: dbRecord.avatar,
      role: dbRecord.role,
      status: dbRecord.status,
      createdAt: dbRecord.created_at,
      updatedAt: dbRecord.updated_at,
    });
  }

  /**
   * 转换为数据库格式
   * @returns {Object} 数据库记录
   */
  toDB() {
    return {
      user_id: this.userId,
      openid: this.openid,
      unionid: this.unionid,
      nickname: this.name, // 数据库字段是nickname
      avatar: this.avatar,
      role: this.role,
      status: this.status,
    };
  }

  /**
   * 转换为API响应格式
   * @returns {Object} API响应对象
   */
  toJSON() {
    return {
      userId: this.userId,
      openid: this.openid, // 添加openid字段，与认证响应文档保持一致
      nickname: this.name, // API使用nickname字段名，与数据库保持一致
      avatar: this.avatar,
      role: this.role,
      status: this.status,
      createdAt: this.createdAt,
    };
  }

  /**
   * 生成用户ID（UUID）
   * @returns {string} UUID
   */
  static generateId() {
    return require('crypto').randomBytes(16).toString('hex');
  }
}

module.exports = User;
