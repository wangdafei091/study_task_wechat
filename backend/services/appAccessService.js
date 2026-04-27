const { query, execute } = require('../config/database');
const { AppAccessCode, APP_ACCESS_STATUS } = require('../models/AppAccessCode');
const systemSettingService = require('./systemSettingService');

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function isExpired(record) {
  if (!record?.expiresAt) {
    return false;
  }
  const expiresTime = new Date(record.expiresAt).getTime();
  return Number.isFinite(expiresTime) && expiresTime < Date.now();
}

class AppAccessService {
  _isDuplicateCodeError(error) {
    return Boolean(error && (error.code === 'ER_DUP_ENTRY' || error.errno === 1062));
  }

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

  async getAccessMode() {
    const summary = await systemSettingService.getAppAccessMode();
    return summary.mode;
  }

  async isInviteOnlyMode() {
    return (await this.getAccessMode()) === 'invite_only';
  }

  async getByCode(code, options = {}) {
    const normalizedCode = normalizeCode(code);
    if (!normalizedCode) {
      return null;
    }

    const queryRunner = this._getQueryRunner(options.connection);
    const rows = await queryRunner(
      `SELECT * FROM app_access_codes
       WHERE code = ?
       LIMIT 1${options.forUpdate ? ' FOR UPDATE' : ''}`,
      [normalizedCode]
    );
    if (rows.length === 0) {
      return null;
    }

    return AppAccessCode.fromDB(rows[0]);
  }

  async markExpired(accessCodeId, options = {}) {
    const executeRunner = this._getExecuteRunner(options.connection);
    await executeRunner(
      'UPDATE app_access_codes SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE access_code_id = ?',
      [APP_ACCESS_STATUS.EXPIRED, accessCodeId]
    );
  }

  async validateAccessCodeForNewUser(accessCode, options = {}) {
    const normalizedCode = normalizeCode(accessCode);
    if (!normalizedCode) {
      throw Object.assign(new Error('当前为邀请制体验，请先输入邀请码'), {
        code: 'AUTH_APP_ACCESS_CODE_REQUIRED'
      });
    }

    const record = await this.getByCode(normalizedCode, options);
    if (!record) {
      throw Object.assign(new Error('邀请码无效，请检查后重试'), {
        code: 'AUTH_APP_ACCESS_CODE_INVALID'
      });
    }

    if (record.status === APP_ACCESS_STATUS.DISABLED) {
      throw Object.assign(new Error('邀请码无效，请检查后重试'), {
        code: 'AUTH_APP_ACCESS_CODE_INVALID'
      });
    }

    if (record.status === APP_ACCESS_STATUS.CONSUMED) {
      throw Object.assign(new Error('邀请码无效，请检查后重试'), {
        code: 'AUTH_APP_ACCESS_CODE_INVALID'
      });
    }

    if (record.status === APP_ACCESS_STATUS.EXPIRED || isExpired(record)) {
      await this.markExpired(record.accessCodeId, options);
      throw Object.assign(new Error('邀请码已过期，请联系维护者重新获取'), {
        code: 'AUTH_APP_ACCESS_CODE_EXPIRED'
      });
    }

    if (record.usedCount >= record.maxUses) {
      const executeRunner = this._getExecuteRunner(options.connection);
      await executeRunner(
        'UPDATE app_access_codes SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE access_code_id = ?',
        [APP_ACCESS_STATUS.CONSUMED, record.accessCodeId]
      );
      throw Object.assign(new Error('邀请码无效，请检查后重试'), {
        code: 'AUTH_APP_ACCESS_CODE_INVALID'
      });
    }

    return record;
  }

  async consumeAccessCode(accessCodeId, boundUserId, options = {}) {
    const executeRunner = this._getExecuteRunner(options.connection);
    const result = await executeRunner(
      `UPDATE app_access_codes
       SET used_count = used_count + 1,
           status = CASE WHEN used_count + 1 >= max_uses THEN ? ELSE ? END,
           bound_user_id = COALESCE(bound_user_id, ?),
           consumed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE access_code_id = ?
         AND status = ?
         AND used_count < max_uses
         AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)`,
      [
        APP_ACCESS_STATUS.CONSUMED,
        APP_ACCESS_STATUS.ACTIVE,
        boundUserId || null,
        accessCodeId,
        APP_ACCESS_STATUS.ACTIVE
      ]
    );

    return Number(result.affectedRows || 0) > 0;
  }

  async createCodes(options = {}) {
    const count = Math.max(1, Number(options.count || 1));
    const maxUses = Math.max(1, Number(options.maxUses || 1));
    const days = options.days === undefined ? 7 : Number(options.days);
    const note = String(options.note || '').trim();
    const expiresAt = Number.isFinite(days) && days > 0
      ? new Date(Date.now() + days * 24 * 60 * 60 * 1000)
      : null;

    const created = [];
    for (let index = 0; index < count; index += 1) {
      let insertedRecord = null;

      for (let retry = 0; retry < 8; retry += 1) {
        const code = AppAccessCode.generateCode();
        const accessCodeId = AppAccessCode.generateId();

        try {
          await execute(
            `INSERT INTO app_access_codes
             (access_code_id, code, status, max_uses, used_count, expires_at, bound_user_id, note)
             VALUES (?, ?, ?, ?, 0, ?, NULL, ?)`,
            [accessCodeId, code, APP_ACCESS_STATUS.ACTIVE, maxUses, expiresAt, note]
          );

          insertedRecord = new AppAccessCode({
            accessCodeId,
            code,
            status: APP_ACCESS_STATUS.ACTIVE,
            maxUses,
            usedCount: 0,
            expiresAt,
            note
          }).toJSON();
          break;
        } catch (error) {
          if (!this._isDuplicateCodeError(error) || retry === 7) {
            throw error;
          }
        }
      }

      if (!insertedRecord) {
        throw new Error('生成邀请码失败，请稍后重试');
      }

      created.push(insertedRecord);
    }

    return created;
  }

  async disableCodes(codes = []) {
    const normalizedCodes = (Array.isArray(codes) ? codes : [codes])
      .map(normalizeCode)
      .filter(Boolean);

    if (normalizedCodes.length === 0) {
      return 0;
    }

    const placeholders = normalizedCodes.map(() => '?').join(', ');
    const result = await execute(
      `UPDATE app_access_codes
       SET status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE code IN (${placeholders})`,
      [APP_ACCESS_STATUS.DISABLED].concat(normalizedCodes)
    );
    return Number(result.affectedRows || 0);
  }

  async listCodes(filters = {}) {
    const conditions = [];
    const params = [];

    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const rows = await query(
      `SELECT * FROM app_access_codes
       ${whereClause}
       ORDER BY created_at DESC, code ASC`,
      params
    );

    return rows.map((row) => AppAccessCode.fromDB(row).toJSON());
  }
}

module.exports = new AppAccessService();
