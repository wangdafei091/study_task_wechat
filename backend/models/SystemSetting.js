const APP_ACCESS_MODE = {
  OPEN: 'open',
  INVITE_ONLY: 'invite_only'
};

const APP_ACCESS_MODE_VALUES = Object.values(APP_ACCESS_MODE);

class SystemSetting {
  constructor({
    settingKey,
    settingValue,
    updatedByUserId = null,
    createdAt = null,
    updatedAt = null
  } = {}) {
    this.settingKey = settingKey || '';
    this.settingValue = settingValue || '';
    this.updatedByUserId = updatedByUserId || null;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static fromDB(record = {}) {
    return new SystemSetting({
      settingKey: record.setting_key,
      settingValue: record.setting_value,
      updatedByUserId: record.updated_by_user_id || null,
      createdAt: record.created_at || null,
      updatedAt: record.updated_at || null
    });
  }

  toJSON() {
    return {
      settingKey: this.settingKey,
      settingValue: this.settingValue,
      updatedByUserId: this.updatedByUserId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = {
  APP_ACCESS_MODE,
  APP_ACCESS_MODE_VALUES,
  SystemSetting
};
