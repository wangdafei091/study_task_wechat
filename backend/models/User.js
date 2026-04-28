/**
 * 用户数据模型
 */

class User {
  static SYSTEM_ACCESS_LEVEL = {
    NORMAL: 'normal',
    READONLY: 'readonly',
    BLOCKED: 'blocked'
  };

  constructor({
    userId,
    openid = null,
    unionid = null,
    name,
    avatar = '',
    role = 'parent',
    status = 'active',
    familyId = null,
    familyPermissionRole = null,
    isSystemAdmin = false,
    systemAccessLevel = User.SYSTEM_ACCESS_LEVEL.NORMAL,
    systemAccessUpdatedByUserId = null,
    systemAccessUpdatedAt = null,
    canIssueAdmissionCode = false,
    admissionCodeQuotaTotal = null,
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
    this.familyPermissionRole = familyPermissionRole;
    this.isSystemAdmin = Boolean(isSystemAdmin);
    this.systemAccessLevel = systemAccessLevel || User.SYSTEM_ACCESS_LEVEL.NORMAL;
    this.systemAccessUpdatedByUserId = systemAccessUpdatedByUserId;
    this.systemAccessUpdatedAt = systemAccessUpdatedAt;
    this.canIssueAdmissionCode = Boolean(canIssueAdmissionCode);
    this.admissionCodeQuotaTotal = admissionCodeQuotaTotal === null || admissionCodeQuotaTotal === undefined
      ? null
      : Number(admissionCodeQuotaTotal);
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
      familyPermissionRole: dbRecord.family_permission_role || null,
      isSystemAdmin: Boolean(dbRecord.is_system_admin),
      systemAccessLevel: dbRecord.system_access_level || User.SYSTEM_ACCESS_LEVEL.NORMAL,
      systemAccessUpdatedByUserId: dbRecord.system_access_updated_by_user_id || null,
      systemAccessUpdatedAt: dbRecord.system_access_updated_at || null,
      canIssueAdmissionCode: Boolean(dbRecord.can_issue_admission_code),
      admissionCodeQuotaTotal: dbRecord.admission_code_quota_total === null || dbRecord.admission_code_quota_total === undefined
        ? null
        : Number(dbRecord.admission_code_quota_total),
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
      family_permission_role: this.familyPermissionRole,
      is_system_admin: this.isSystemAdmin,
      system_access_level: this.systemAccessLevel,
      system_access_updated_by_user_id: this.systemAccessUpdatedByUserId,
      system_access_updated_at: this.systemAccessUpdatedAt,
      can_issue_admission_code: this.canIssueAdmissionCode,
      admission_code_quota_total: this.admissionCodeQuotaTotal,
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
      familyPermissionRole: this.familyPermissionRole,
      isSystemAdmin: this.isSystemAdmin,
      systemAccessLevel: this.systemAccessLevel,
      systemAccessUpdatedByUserId: this.systemAccessUpdatedByUserId,
      systemAccessUpdatedAt: this.systemAccessUpdatedAt,
      canIssueAdmissionCode: this.canIssueAdmissionCode,
      admissionCodeQuotaTotal: this.admissionCodeQuotaTotal,
      isVirtual: this.isVirtual,
      createdByUserId: this.createdByUserId,
      createdAt: this.createdAt,
    };
  }

  isSystemReadonly() {
    return this.systemAccessLevel === User.SYSTEM_ACCESS_LEVEL.READONLY;
  }

  isSystemBlocked() {
    return this.systemAccessLevel === User.SYSTEM_ACCESS_LEVEL.BLOCKED;
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
