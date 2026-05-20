class UserProductState {
  constructor({
    userId,
    firstSeenAppVersion,
    firstSeenAt,
    activatedAt = null,
    activationVersion = null,
    activationSource = null,
    lastSeenAppVersion = null,
    lastSeenAt = null,
    createdAt = null,
    updatedAt = null
  } = {}) {
    this.userId = userId;
    this.firstSeenAppVersion = String(firstSeenAppVersion || '').trim();
    this.firstSeenAt = Number(firstSeenAt || 0) || 0;
    this.activatedAt = activatedAt === null || activatedAt === undefined
      ? null
      : Number(activatedAt || 0) || null;
    this.activationVersion = activationVersion ? String(activationVersion).trim() : null;
    this.activationSource = activationSource ? String(activationSource).trim() : null;
    this.lastSeenAppVersion = lastSeenAppVersion ? String(lastSeenAppVersion).trim() : null;
    this.lastSeenAt = lastSeenAt === null || lastSeenAt === undefined
      ? null
      : Number(lastSeenAt || 0) || null;
    this.createdAt = createdAt || null;
    this.updatedAt = updatedAt || null;
  }

  static fromDB(record = {}) {
    return new UserProductState({
      userId: record.user_id,
      firstSeenAppVersion: record.first_seen_app_version,
      firstSeenAt: record.first_seen_at,
      activatedAt: record.activated_at,
      activationVersion: record.activation_version,
      activationSource: record.activation_source,
      lastSeenAppVersion: record.last_seen_app_version,
      lastSeenAt: record.last_seen_at,
      createdAt: record.created_at,
      updatedAt: record.updated_at
    });
  }

  toDB() {
    return {
      user_id: this.userId,
      first_seen_app_version: this.firstSeenAppVersion,
      first_seen_at: this.firstSeenAt,
      activated_at: this.activatedAt,
      activation_version: this.activationVersion,
      activation_source: this.activationSource,
      last_seen_app_version: this.lastSeenAppVersion,
      last_seen_at: this.lastSeenAt
    };
  }

  toJSON() {
    return {
      userId: this.userId,
      firstSeenAppVersion: this.firstSeenAppVersion,
      firstSeenAt: this.firstSeenAt,
      activatedAt: this.activatedAt,
      activationVersion: this.activationVersion,
      activationSource: this.activationSource,
      lastSeenAppVersion: this.lastSeenAppVersion,
      lastSeenAt: this.lastSeenAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = UserProductState;
