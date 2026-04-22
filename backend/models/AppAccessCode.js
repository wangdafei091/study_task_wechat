const crypto = require('crypto');

const APP_ACCESS_STATUS = {
  ACTIVE: 'active',
  DISABLED: 'disabled',
  CONSUMED: 'consumed',
  EXPIRED: 'expired'
};

class AppAccessCode {
  constructor({
    accessCodeId,
    code,
    status = APP_ACCESS_STATUS.ACTIVE,
    maxUses = 1,
    usedCount = 0,
    expiresAt = null,
    boundUserId = null,
    note = '',
    consumedAt = null,
    createdAt = null,
    updatedAt = null,
  } = {}) {
    this.accessCodeId = accessCodeId;
    this.code = String(code || '').trim().toUpperCase();
    this.status = status;
    this.maxUses = Number.isFinite(Number(maxUses)) ? Number(maxUses) : 1;
    this.usedCount = Number.isFinite(Number(usedCount)) ? Number(usedCount) : 0;
    this.expiresAt = expiresAt || null;
    this.boundUserId = boundUserId || null;
    this.note = note || '';
    this.consumedAt = consumedAt || null;
    this.createdAt = createdAt || null;
    this.updatedAt = updatedAt || null;
  }

  static fromDB(record = {}) {
    return new AppAccessCode({
      accessCodeId: record.access_code_id,
      code: record.code,
      status: record.status,
      maxUses: record.max_uses,
      usedCount: record.used_count,
      expiresAt: record.expires_at || null,
      boundUserId: record.bound_user_id || null,
      note: record.note || '',
      consumedAt: record.consumed_at || null,
      createdAt: record.created_at || null,
      updatedAt: record.updated_at || null,
    });
  }

  toJSON() {
    return {
      accessCodeId: this.accessCodeId,
      code: this.code,
      status: this.status,
      maxUses: this.maxUses,
      usedCount: this.usedCount,
      expiresAt: this.expiresAt,
      boundUserId: this.boundUserId,
      note: this.note,
      consumedAt: this.consumedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  static generateId() {
    return crypto.randomBytes(16).toString('hex');
  }

  static generateCode(length = 8) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let index = 0; index < length; index += 1) {
      const randomIndex = crypto.randomInt(0, alphabet.length);
      code += alphabet[randomIndex];
    }
    return code;
  }
}

module.exports = {
  APP_ACCESS_STATUS,
  AppAccessCode
};
