/**
 * 用户数据模型
 */

class User {
  constructor({
    userId,
    openid = null,
    unionid = null,
    name,
    avatar = '',
    role = 'parent',
    status = 'active',
    familyId = null,
    isVirtual = false,
    createdByUserId = null,
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
    this.familyId = familyId;
    this.isVirtual = isVirtual;
    this.createdByUserId = createdByUserId;
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
      name: dbRecord.nickname,
      avatar: dbRecord.avatar,
      role: dbRecord.role,
      status: dbRecord.status,
      familyId: dbRecord.family_id || null,
      isVirtual: Boolean(dbRecord.is_virtual),
      createdByUserId: dbRecord.created_by_user_id || null,
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
      nickname: this.name,
      avatar: this.avatar,
      role: this.role,
      status: this.status,
      family_id: this.familyId,
      is_virtual: this.isVirtual,
      created_by_user_id: this.createdByUserId,
    };
  }

  /**
   * 转换为API响应格式
   * @returns {Object} API响应对象
   */
  toJSON() {
    return {
      userId: this.userId,
      openid: this.openid,
      nickname: this.name,
      avatar: this.avatar,
      role: this.role,
      status: this.status,
      familyId: this.familyId,
      isVirtual: this.isVirtual,
      createdByUserId: this.createdByUserId,
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
