const { query, execute } = require('../config/database');
const { APP_ACCESS_MODE, APP_ACCESS_MODE_VALUES, SystemSetting } = require('../models/SystemSetting');

const APP_ACCESS_MODE_SETTING_KEY = 'app_access_mode';

function getDefaultAppAccessMode() {
  return process.env.APP_ACCESS_MODE === APP_ACCESS_MODE.INVITE_ONLY
    ? APP_ACCESS_MODE.INVITE_ONLY
    : APP_ACCESS_MODE.OPEN;
}

class SystemSettingService {
  _getQueryRunner(connection = null) {
    if (connection && typeof connection.execute === 'function') {
      return async (sql, params = []) => {
        const [rows] = await connection.execute(sql, params);
        return rows;
      };
    }

    return query;
  }

  _getExecuteRunner(connection = null) {
    if (connection && typeof connection.execute === 'function') {
      return async (sql, params = []) => {
        const [result] = await connection.execute(sql, params);
        return result;
      };
    }

    return execute;
  }

  _buildModeSummary(mode, source, record = null) {
    return {
      mode,
      source,
      updatedAt: record?.updatedAt || null,
      updatedByUserId: record?.updatedByUserId || null
    };
  }

  async getByKey(settingKey, options = {}) {
    const queryRunner = this._getQueryRunner(options.connection);
    const rows = await queryRunner(
      `SELECT * FROM system_settings
       WHERE setting_key = ?
       LIMIT 1${options.forUpdate ? ' FOR UPDATE' : ''}`,
      [settingKey]
    );

    if (!rows.length) {
      return null;
    }

    return SystemSetting.fromDB(rows[0]);
  }

  async getAppAccessMode(options = {}) {
    const record = await this.getByKey(APP_ACCESS_MODE_SETTING_KEY, options);
    if (record) {
      if (!APP_ACCESS_MODE_VALUES.includes(record.settingValue)) {
        throw Object.assign(new Error('系统准入配置无效'), {
          code: 'SYSTEM_SETTING_CORRUPTED',
          settingKey: APP_ACCESS_MODE_SETTING_KEY,
          settingValue: record.settingValue
        });
      }

      return this._buildModeSummary(record.settingValue, 'db', record);
    }

    if (process.env.APP_ACCESS_MODE !== undefined) {
      return this._buildModeSummary(getDefaultAppAccessMode(), 'env');
    }

    return this._buildModeSummary(APP_ACCESS_MODE.OPEN, 'default');
  }

  async updateAppAccessMode(mode, operatorUserId, options = {}) {
    if (!APP_ACCESS_MODE_VALUES.includes(mode)) {
      throw Object.assign(new Error('准入模式无效'), {
        code: 'SYSTEM_SETTING_INVALID'
      });
    }

    const executeRunner = this._getExecuteRunner(options.connection);
    await executeRunner(
      `INSERT INTO system_settings (setting_key, setting_value, updated_by_user_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         setting_value = VALUES(setting_value),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [APP_ACCESS_MODE_SETTING_KEY, mode, operatorUserId || null]
    );

    return this.getAppAccessMode(options);
  }
}

module.exports = new SystemSettingService();
module.exports.APP_ACCESS_MODE_SETTING_KEY = APP_ACCESS_MODE_SETTING_KEY;
