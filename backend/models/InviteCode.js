const crypto = require('crypto');

const INVITE_CODE_PURPOSE = {
  ADMISSION_ONLY: 'admission_only',
  FAMILY_INVITE: 'family_invite'
};

const INVITE_CODE_STATUS = {
  ACTIVE: 'active',
  DISABLED: 'disabled',
  CONSUMED: 'consumed',
  EXPIRED: 'expired'
};

const INVITE_CODE_TARGET_ROLE = {
  PARENT: 'parent',
  CHILD: 'child'
};

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 10;
const PURPOSE_PREFIX = {
  [INVITE_CODE_PURPOSE.ADMISSION_ONLY]: 'U',
  [INVITE_CODE_PURPOSE.FAMILY_INVITE]: 'F'
};

class InviteCode {
  constructor({
    inviteCodeId,
    code,
    purpose,
    status = INVITE_CODE_STATUS.ACTIVE,
    issuerUserId = null,
    familyId = null,
    targetRole = null,
    targetFamilyPermissionRole = null,
    slotKey = null,
    maxUses = 1,
    usedCount = 0,
    expiresAt = null,
    consumedByUserId = null,
    consumedAt = null,
    createdAt = null,
    updatedAt = null
  } = {}) {
    this.inviteCodeId = inviteCodeId;
    this.code = String(code || '').trim().toUpperCase();
    this.purpose = purpose;
    this.status = status;
    this.issuerUserId = issuerUserId || null;
    this.familyId = familyId || null;
    this.targetRole = targetRole || null;
    this.targetFamilyPermissionRole = targetFamilyPermissionRole || null;
    this.slotKey = slotKey || null;
    this.maxUses = Number.isFinite(Number(maxUses)) ? Number(maxUses) : 1;
    this.usedCount = Number.isFinite(Number(usedCount)) ? Number(usedCount) : 0;
    this.expiresAt = expiresAt || null;
    this.consumedByUserId = consumedByUserId || null;
    this.consumedAt = consumedAt || null;
    this.createdAt = createdAt || null;
    this.updatedAt = updatedAt || null;
  }

  static fromDB(record = {}) {
    return new InviteCode({
      inviteCodeId: record.invite_code_id,
      code: record.code,
      purpose: record.purpose,
      status: record.status,
      issuerUserId: record.issuer_user_id || null,
      familyId: record.family_id || null,
      targetRole: record.target_role || null,
      targetFamilyPermissionRole: record.target_family_permission_role || null,
      slotKey: record.slot_key || null,
      maxUses: record.max_uses,
      usedCount: record.used_count,
      expiresAt: record.expires_at || null,
      consumedByUserId: record.consumed_by_user_id || null,
      consumedAt: record.consumed_at || null,
      createdAt: record.created_at || null,
      updatedAt: record.updated_at || null
    });
  }

  toJSON() {
    return {
      inviteCodeId: this.inviteCodeId,
      code: this.code,
      purpose: this.purpose,
      status: this.status,
      issuerUserId: this.issuerUserId,
      familyId: this.familyId,
      targetRole: this.targetRole,
      targetFamilyPermissionRole: this.targetFamilyPermissionRole,
      slotKey: this.slotKey,
      maxUses: this.maxUses,
      usedCount: this.usedCount,
      expiresAt: this.expiresAt,
      consumedByUserId: this.consumedByUserId,
      consumedAt: this.consumedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  static generateId() {
    return crypto.randomBytes(16).toString('hex');
  }

  static generateCode(purpose) {
    const prefix = PURPOSE_PREFIX[purpose];
    if (!prefix) {
      throw new Error('邀请码用途无效');
    }

    let code = prefix;
    for (let index = 1; index < CODE_LENGTH; index += 1) {
      code += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
    }
    return code;
  }

  static normalizeCode(code) {
    return String(code || '').trim().toUpperCase();
  }

  static isUnifiedCodeFormat(code) {
    return /^[UF][ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{9}$/.test(
      InviteCode.normalizeCode(code)
    );
  }
}

module.exports = {
  InviteCode,
  INVITE_CODE_PURPOSE,
  INVITE_CODE_STATUS,
  INVITE_CODE_TARGET_ROLE
};
