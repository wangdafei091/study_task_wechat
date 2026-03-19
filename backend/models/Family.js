/**
 * 家庭数据模型
 */

class Family {
  constructor({
    familyId,
    name,
    inviteCode = null,
    inviteCodeRole = null,
    inviteCodeExpiresAt = null,
    inviteCodeUsedAt = null,
    createdBy,
    status = 'active',
    createdAt = null,
    updatedAt = null,
  } = {}) {
    this.familyId = familyId;
    this.name = name;
    this.inviteCode = inviteCode;
    this.inviteCodeRole = inviteCodeRole;
    this.inviteCodeExpiresAt = inviteCodeExpiresAt;
    this.inviteCodeUsedAt = inviteCodeUsedAt;
    this.createdBy = createdBy;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static fromDB(dbRecord) {
    return new Family({
      familyId: dbRecord.family_id,
      name: dbRecord.name,
      inviteCode: dbRecord.invite_code || null,
      inviteCodeRole: dbRecord.invite_code_role || null,
      inviteCodeExpiresAt: dbRecord.invite_code_expires_at || null,
      inviteCodeUsedAt: dbRecord.invite_code_used_at || null,
      createdBy: dbRecord.created_by,
      status: dbRecord.status,
      createdAt: dbRecord.created_at,
      updatedAt: dbRecord.updated_at,
    });
  }

  toDB() {
    return {
      family_id: this.familyId,
      name: this.name,
      invite_code: this.inviteCode,
      invite_code_role: this.inviteCodeRole,
      invite_code_expires_at: this.inviteCodeExpiresAt,
      invite_code_used_at: this.inviteCodeUsedAt,
      created_by: this.createdBy,
      status: this.status,
    };
  }

  toJSON() {
    return {
      familyId: this.familyId,
      name: this.name,
      inviteCode: this.inviteCode,
      inviteCodeRole: this.inviteCodeRole,
      inviteCodeExpiresAt: this.inviteCodeExpiresAt,
      inviteCodeUsedAt: this.inviteCodeUsedAt,
      createdBy: this.createdBy,
      status: this.status,
      createdAt: this.createdAt,
    };
  }

  static generateId() {
    return require('crypto').randomBytes(16).toString('hex');
  }

  /**
   * 生成随机邀请码（8位字母数字）
   */
  static generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去除易混淆字符 I/O/0/1
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }
}

module.exports = Family;
