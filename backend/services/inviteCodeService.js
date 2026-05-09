const { getPool, query, execute } = require('../config/database');
const {
  InviteCode,
  INVITE_CODE_PURPOSE,
  INVITE_CODE_STATUS,
  INVITE_CODE_TARGET_ROLE
} = require('../models/InviteCode');
const User = require('../models/User');
const appAccessService = require('./appAccessService');
const familyService = require('./familyService');
const systemSettingService = require('./systemSettingService');
const userService = require('./userService');
const { createLogger } = require('../utils/logger');

const logger = createLogger('InviteCodeService');

const ADMISSION_CODE_GLOBAL_QUOTA_SETTING_KEY = 'admission_code_global_quota_total';
const FAMILY_INVITE_EXPIRE_MS = 24 * 60 * 60 * 1000;
const ADMISSION_INVITE_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;

function buildInviteError(message, code) {
  return Object.assign(new Error(message), { code });
}

function isExpired(expiresAt) {
  if (!expiresAt) {
    return false;
  }
  const expiresTime = new Date(expiresAt).getTime();
  return Number.isFinite(expiresTime) && expiresTime < Date.now();
}

function buildTargetFamilyPermissionRole(targetRole) {
  return targetRole === INVITE_CODE_TARGET_ROLE.PARENT ? 'viewer' : null;
}

function buildAdmissionSlotKey(userId) {
  return `admission_only:${userId}`;
}

function buildFamilySlotKey(familyId, targetRole) {
  return `family_invite:${familyId}:${targetRole}`;
}

function normalizeProfileSnapshot(profile = {}) {
  const nickname = String(profile.nickname || profile.nickName || '').trim();
  const avatarUrl = String(profile.avatarUrl || profile.avatar || '').trim();
  return {
    nickname,
    avatarUrl
  };
}

function requireTransactionConnection(connection, methodName) {
  if (!connection || typeof connection.execute !== 'function') {
    throw new Error(`${methodName} 必须在事务连接中调用`);
  }
}

function canUserIssueAdmissionInPrinciple(user) {
  if (!user || user.status !== 'active' || user.isVirtual) {
    return false;
  }

  if (user.isSystemAdmin === true) {
    return user.systemAccessLevel === User.SYSTEM_ACCESS_LEVEL.NORMAL;
  }

  return (
    user.role === 'parent' &&
    user.systemAccessLevel === User.SYSTEM_ACCESS_LEVEL.NORMAL &&
    user.canIssueAdmissionCode === true &&
    Number.isFinite(user.admissionCodeQuotaTotal)
  );
}

function canUserIssueFamilyInviteInPrinciple(user, profile, familyId) {
  return Boolean(
    user &&
    user.status === 'active' &&
    user.systemAccessLevel === User.SYSTEM_ACCESS_LEVEL.NORMAL &&
    profile &&
    profile.userId === user.userId &&
    profile.role === 'parent' &&
    profile.familyId === familyId &&
    profile.familyPermissionRole === 'manager'
  );
}

class InviteCodeService {
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

  async _lockUser(userId, connection) {
    const queryRunner = this._getQueryRunner(connection);
    await queryRunner(
      'SELECT user_id FROM users WHERE user_id = ? AND status = ? LIMIT 1 FOR UPDATE',
      [userId, 'active']
    );
  }

  async _lockFamily(familyId, connection) {
    const queryRunner = this._getQueryRunner(connection);
    await queryRunner(
      'SELECT family_id FROM families WHERE family_id = ? AND status = ? LIMIT 1 FOR UPDATE',
      [familyId, 'active']
    );
  }

  async _findUnifiedInviteByCode(code, options = {}) {
    const normalizedCode = InviteCode.normalizeCode(code);
    if (!normalizedCode || !InviteCode.isUnifiedCodeFormat(normalizedCode)) {
      return null;
    }

    const queryRunner = this._getQueryRunner(options.connection);
    const rows = await queryRunner(
      `SELECT * FROM invite_codes
       WHERE code = ?
       LIMIT 1${options.forUpdate ? ' FOR UPDATE' : ''}`,
      [normalizedCode]
    );

    if (!rows.length) {
      return null;
    }

    return InviteCode.fromDB(rows[0]);
  }

  async _findLegacyFamilyInviteByCode(code, options = {}) {
    const normalizedCode = InviteCode.normalizeCode(code);
    if (!normalizedCode) {
      return null;
    }

    const queryRunner = this._getQueryRunner(options.connection);
    const rows = await queryRunner(
      `SELECT family_id, name, invite_code, invite_code_role, invite_code_expires_at, invite_code_used_at, created_by, status
         FROM families
        WHERE invite_code = ?
          AND status = ?
        LIMIT 1${options.forUpdate ? ' FOR UPDATE' : ''}`,
      [normalizedCode, 'active']
    );

    if (!rows.length) {
      return null;
    }

    const row = rows[0];
    return {
      source: 'legacy_family',
      code: normalizedCode,
      purpose: INVITE_CODE_PURPOSE.FAMILY_INVITE,
      status: row.invite_code_used_at ? INVITE_CODE_STATUS.CONSUMED : INVITE_CODE_STATUS.ACTIVE,
      familyId: row.family_id,
      familyName: row.name,
      issuerUserId: row.created_by || null,
      targetRole: row.invite_code_role || INVITE_CODE_TARGET_ROLE.CHILD,
      targetFamilyPermissionRole: buildTargetFamilyPermissionRole(row.invite_code_role || INVITE_CODE_TARGET_ROLE.CHILD),
      expiresAt: row.invite_code_expires_at || null,
      legacyFamilyId: row.family_id,
      usedAt: row.invite_code_used_at || null,
      maxUses: 1,
      usedCount: row.invite_code_used_at ? 1 : 0
    };
  }

  async _findLegacyAdmissionInviteByCode(code, options = {}) {
    const record = await appAccessService.getByCode(code, options);
    if (!record) {
      return null;
    }

    return {
      source: 'legacy_admission',
      code: record.code,
      purpose: INVITE_CODE_PURPOSE.ADMISSION_ONLY,
      status: record.status,
      issuerUserId: null,
      familyId: null,
      familyName: null,
      targetRole: null,
      targetFamilyPermissionRole: null,
      expiresAt: record.expiresAt || null,
      accessCodeId: record.accessCodeId,
      maxUses: record.maxUses,
      usedCount: record.usedCount
    };
  }

  _buildResolvedUnifiedInvite(invite, familySummary = null) {
    return {
      source: 'unified',
      ...invite.toJSON(),
      familyName: familySummary?.name || null
    };
  }

  async resolveInviteCode(code, options = {}) {
    const normalizedCode = InviteCode.normalizeCode(code);
    if (!normalizedCode) {
      return null;
    }

    const unifiedInvite = await this._findUnifiedInviteByCode(normalizedCode, options);
    if (unifiedInvite) {
      const familySummary = unifiedInvite.familyId
        ? await familyService.getCurrentFamily(unifiedInvite.familyId)
        : null;
      return this._buildResolvedUnifiedInvite(unifiedInvite, familySummary);
    }

    const legacyAdmissionInvite = await this._findLegacyAdmissionInviteByCode(normalizedCode, options);
    if (legacyAdmissionInvite) {
      return legacyAdmissionInvite;
    }

    return this._findLegacyFamilyInviteByCode(normalizedCode, options);
  }

  async _markUnifiedInviteExpired(inviteCodeId, options = {}) {
    const executeRunner = this._getExecuteRunner(options.connection);
    await executeRunner(
      `UPDATE invite_codes
          SET status = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE invite_code_id = ?`,
      [INVITE_CODE_STATUS.EXPIRED, inviteCodeId]
    );
  }

  async _validateUnifiedInvite(resolvedInvite, options = {}) {
    if (!resolvedInvite) {
      logger.warn('邀请码校验失败：记录不存在');
      throw buildInviteError('邀请码无效，请检查后重试', 'INVITE_CODE_INVALID');
    }

    if (resolvedInvite.status === INVITE_CODE_STATUS.DISABLED) {
      logger.warn('邀请码校验失败：邀请码已失效', {
        code: resolvedInvite.code,
        source: resolvedInvite.source,
        purpose: resolvedInvite.purpose
      });
      throw buildInviteError('邀请码已失效，请联系邀请人重新获取', 'INVITE_CODE_DISABLED');
    }

    if (resolvedInvite.status === INVITE_CODE_STATUS.CONSUMED) {
      logger.info('邀请码校验失败：邀请码已消费', {
        code: resolvedInvite.code,
        source: resolvedInvite.source,
        purpose: resolvedInvite.purpose
      });
      throw buildInviteError('邀请码无效，请检查后重试', 'INVITE_CODE_INVALID');
    }

    if (resolvedInvite.status === INVITE_CODE_STATUS.EXPIRED || isExpired(resolvedInvite.expiresAt)) {
      logger.warn('邀请码校验失败：邀请码已过期', {
        code: resolvedInvite.code,
        source: resolvedInvite.source,
        purpose: resolvedInvite.purpose,
        expiresAt: resolvedInvite.expiresAt
      });
      if (resolvedInvite.source === 'unified') {
        await this._markUnifiedInviteExpired(resolvedInvite.inviteCodeId, options);
      } else if (resolvedInvite.source === 'legacy_admission' && resolvedInvite.accessCodeId) {
        await appAccessService.markExpired(resolvedInvite.accessCodeId, options);
      }
      throw buildInviteError('邀请码已过期，请联系邀请人重新获取', 'INVITE_CODE_EXPIRED');
    }

    if (Number(resolvedInvite.usedCount || 0) >= Number(resolvedInvite.maxUses || 1)) {
      logger.warn('邀请码校验失败：已达到使用上限', {
        code: resolvedInvite.code,
        source: resolvedInvite.source,
        usedCount: resolvedInvite.usedCount,
        maxUses: resolvedInvite.maxUses
      });
      throw buildInviteError('邀请码无效，请检查后重试', 'INVITE_CODE_INVALID');
    }

    if (
      (resolvedInvite.source === 'unified' || resolvedInvite.source === 'legacy_family') &&
      resolvedInvite.issuerUserId
    ) {
      const issuerUser = await userService.findById(resolvedInvite.issuerUserId, options);
      if (!issuerUser || issuerUser.status !== 'active') {
        logger.warn('邀请码校验失败：发码人已失效，清理邀请码', {
          code: resolvedInvite.code,
          source: resolvedInvite.source,
          issuerUserId: resolvedInvite.issuerUserId
        });
        if (resolvedInvite.source === 'unified') {
          await this._markUnifiedInviteExpired(resolvedInvite.inviteCodeId, options);
        } else if (resolvedInvite.source === 'legacy_family') {
          await familyService.clearLegacyInviteCodeByIssuer(
            resolvedInvite.familyId,
            resolvedInvite.issuerUserId,
            options
          );
        }
        throw buildInviteError('邀请码已失效，请联系邀请人重新获取', 'INVITE_CODE_DISABLED');
      }

      if (resolvedInvite.purpose === INVITE_CODE_PURPOSE.ADMISSION_ONLY) {
        if (!canUserIssueAdmissionInPrinciple(issuerUser)) {
          logger.warn('邀请码校验失败：发码人已无新用户发码资格，禁用邀请码', {
            code: resolvedInvite.code,
            inviteCodeId: resolvedInvite.inviteCodeId,
            issuerUserId: resolvedInvite.issuerUserId
          });
          await this._disableInviteById(resolvedInvite.inviteCodeId, options);
          throw buildInviteError('邀请码已失效，请联系邀请人重新获取', 'INVITE_CODE_DISABLED');
        }
      }

      if (resolvedInvite.purpose === INVITE_CODE_PURPOSE.FAMILY_INVITE) {
        const issuerProfile = await familyService.getUserFamilyRoleProfile(issuerUser.userId, options);
        const issuerStillEligible = canUserIssueFamilyInviteInPrinciple(
          issuerUser,
          issuerProfile,
          resolvedInvite.familyId
        );

        if (!issuerStillEligible) {
          logger.warn('邀请码校验失败：发码人已无家庭发码资格，清理邀请码', {
            code: resolvedInvite.code,
            source: resolvedInvite.source,
            issuerUserId: resolvedInvite.issuerUserId,
            familyId: resolvedInvite.familyId
          });
          if (resolvedInvite.source === 'unified') {
            await this._disableInviteById(resolvedInvite.inviteCodeId, options);
          } else if (resolvedInvite.source === 'legacy_family') {
            await familyService.clearLegacyInviteCodeByIssuer(
              resolvedInvite.familyId,
              resolvedInvite.issuerUserId,
              options
            );
          }
          throw buildInviteError('邀请码已失效，请联系邀请人重新获取', 'INVITE_CODE_DISABLED');
        }
      }
    }

    return resolvedInvite;
  }

  async _disableInviteById(inviteCodeId, options = {}) {
    const executeRunner = this._getExecuteRunner(options.connection);
    await executeRunner(
      `UPDATE invite_codes
          SET status = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE invite_code_id = ?
          AND status = ?`,
      [INVITE_CODE_STATUS.DISABLED, inviteCodeId, INVITE_CODE_STATUS.ACTIVE]
    );
  }

  async _consumeUnifiedInvite(resolvedInvite, boundUserId, options = {}) {
    const executeRunner = this._getExecuteRunner(options.connection);
    const result = await executeRunner(
      `UPDATE invite_codes
          SET used_count = used_count + 1,
              status = CASE WHEN used_count + 1 >= max_uses THEN ? ELSE ? END,
              consumed_by_user_id = COALESCE(consumed_by_user_id, ?),
              consumed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE invite_code_id = ?
          AND status = ?
          AND used_count < max_uses
          AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)`,
      [
        INVITE_CODE_STATUS.CONSUMED,
        INVITE_CODE_STATUS.ACTIVE,
        boundUserId || null,
        resolvedInvite.inviteCodeId,
        INVITE_CODE_STATUS.ACTIVE
      ]
    );

    return Number(result.affectedRows || 0) > 0;
  }

  async _consumeLegacyFamilyInvite(resolvedInvite, options = {}) {
    const executeRunner = this._getExecuteRunner(options.connection);
    const result = await executeRunner(
      `UPDATE families
          SET invite_code_used_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE family_id = ?
          AND invite_code = ?
          AND invite_code_used_at IS NULL
          AND (invite_code_expires_at IS NULL OR invite_code_expires_at >= CURRENT_TIMESTAMP)`,
      [resolvedInvite.legacyFamilyId, resolvedInvite.code]
    );

    return Number(result.affectedRows || 0) > 0;
  }

  async _buildAdmissionIssuerCapabilities(issuerUser, options = {}) {
    const globalQuota = await this.getAdmissionGlobalQuota(options);
    const globalUsed = await this.countGlobalAdmissionUsage(options);
    const userUsed = await this.countUserAdmissionUsage(issuerUser.userId, options);

    const isSystemAdmin = issuerUser.isSystemAdmin === true;
    const canIssue = isSystemAdmin || (
      issuerUser.role === 'parent' &&
      issuerUser.status === 'active' &&
      !issuerUser.isVirtual &&
      issuerUser.systemAccessLevel === User.SYSTEM_ACCESS_LEVEL.NORMAL &&
      issuerUser.canIssueAdmissionCode === true &&
      Number.isFinite(issuerUser.admissionCodeQuotaTotal)
    );

    return {
      canIssue,
      isSystemAdmin,
      globalQuotaTotal: globalQuota,
      globalQuotaUsed: globalUsed,
      globalQuotaRemaining: Number.isFinite(globalQuota) ? Math.max(globalQuota - globalUsed, 0) : null,
      quotaTotal: issuerUser.admissionCodeQuotaTotal,
      quotaUsed: userUsed,
      quotaRemaining: Number.isFinite(issuerUser.admissionCodeQuotaTotal)
        ? Math.max(issuerUser.admissionCodeQuotaTotal - userUsed, 0)
        : null
    };
  }

  async countUserAdmissionUsage(userId, options = {}) {
    const queryRunner = this._getQueryRunner(options.connection);
    const rows = await queryRunner(
      `SELECT COUNT(*) AS total
         FROM invite_codes
        WHERE purpose = ?
          AND issuer_user_id = ?
          AND consumed_by_user_id IS NOT NULL`,
      [INVITE_CODE_PURPOSE.ADMISSION_ONLY, userId]
    );
    return Number(rows[0]?.total || 0);
  }

  async countGlobalAdmissionUsage(options = {}) {
    const queryRunner = this._getQueryRunner(options.connection);
    const rows = await queryRunner(
      `SELECT COUNT(*) AS total
         FROM invite_codes
        WHERE purpose = ?
          AND consumed_by_user_id IS NOT NULL`,
      [INVITE_CODE_PURPOSE.ADMISSION_ONLY]
    );
    return Number(rows[0]?.total || 0);
  }

  async getAdmissionGlobalQuota(options = {}) {
    const record = await systemSettingService.getByKey(ADMISSION_CODE_GLOBAL_QUOTA_SETTING_KEY, options);
    if (!record) {
      return null;
    }

    const rawValue = String(record.settingValue || '').trim();
    if (!rawValue) {
      return null;
    }

    const normalizedValue = Number(rawValue);
    if (!Number.isInteger(normalizedValue) || normalizedValue < 0) {
      throw buildInviteError('新用户邀请码全局额度配置无效', 'SYSTEM_SETTING_CORRUPTED');
    }

    return normalizedValue;
  }

  async updateAdmissionGlobalQuota(total, operatorUserId, options = {}) {
    const executeRunner = this._getExecuteRunner(options.connection);

    if (total === null || total === undefined || total === '') {
      await executeRunner(
        'DELETE FROM system_settings WHERE setting_key = ?',
        [ADMISSION_CODE_GLOBAL_QUOTA_SETTING_KEY]
      );
      return this.getAdmissionGovernanceOverview(options);
    }

    const normalizedTotal = Number(total);
    if (!Number.isInteger(normalizedTotal) || normalizedTotal < 0) {
      throw buildInviteError('全局额度必须是大于等于 0 的整数', 'INVITE_CODE_GLOBAL_QUOTA_INVALID');
    }

    await executeRunner(
      `INSERT INTO system_settings (setting_key, setting_value, updated_by_user_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         setting_value = VALUES(setting_value),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [ADMISSION_CODE_GLOBAL_QUOTA_SETTING_KEY, String(normalizedTotal), operatorUserId || null]
    );

    return this.getAdmissionGovernanceOverview(options);
  }

  async getAdmissionGovernanceOverview(options = {}) {
    const quotaTotal = await this.getAdmissionGlobalQuota(options);
    const quotaUsed = await this.countGlobalAdmissionUsage(options);
    return {
      quotaTotal,
      quotaUsed,
      quotaRemaining: Number.isFinite(quotaTotal) ? Math.max(quotaTotal - quotaUsed, 0) : null
    };
  }

  async _disableActiveInvitesBySlot(slotKey, options = {}) {
    const executeRunner = this._getExecuteRunner(options.connection);
    await executeRunner(
      `UPDATE invite_codes
          SET status = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE slot_key = ?
          AND status = ?`,
      [INVITE_CODE_STATUS.DISABLED, slotKey, INVITE_CODE_STATUS.ACTIVE]
    );
  }

  async disableActiveInvitesByIssuer(issuerUserId, options = {}) {
    const executeRunner = this._getExecuteRunner(options.connection);
    const params = [INVITE_CODE_STATUS.DISABLED, issuerUserId, INVITE_CODE_STATUS.ACTIVE];
    let sql = `UPDATE invite_codes
                  SET status = ?,
                      updated_at = CURRENT_TIMESTAMP
                WHERE issuer_user_id = ?
                  AND status = ?`;

    if (options.purpose) {
      sql += ' AND purpose = ?';
      params.push(options.purpose);
    }

    await executeRunner(sql, params);
  }

  async _assertAdmissionConsumptionAllowed(resolvedInvite, options = {}) {
    if (
      !resolvedInvite ||
      resolvedInvite.purpose !== INVITE_CODE_PURPOSE.ADMISSION_ONLY ||
      !resolvedInvite.issuerUserId
    ) {
      return;
    }

    const issuerUser = await userService.findById(resolvedInvite.issuerUserId, {
      connection: options.connection,
      forUpdate: true
    });

    if (!issuerUser || !canUserIssueAdmissionInPrinciple(issuerUser)) {
      if (resolvedInvite.source === 'unified') {
        await this._disableInviteById(resolvedInvite.inviteCodeId, options);
      }
      throw buildInviteError('邀请码已失效，请联系邀请人重新获取', 'INVITE_CODE_DISABLED');
    }

    const globalQuota = await this.getAdmissionGlobalQuota({
      connection: options.connection,
      forUpdate: true
    });
    const globalUsed = await this.countGlobalAdmissionUsage(options);
    if (Number.isFinite(globalQuota) && globalUsed >= globalQuota) {
      logger.warn('消费新用户邀请码被拒绝：全局额度已用尽', {
        code: resolvedInvite.code,
        issuerUserId: resolvedInvite.issuerUserId,
        globalQuota,
        globalUsed
      });
      throw buildInviteError('新用户邀请码全局额度已用尽', 'INVITE_CODE_GLOBAL_QUOTA_EXCEEDED');
    }

    if (issuerUser.isSystemAdmin === true) {
      return;
    }

    const userUsed = await this.countUserAdmissionUsage(resolvedInvite.issuerUserId, options);
    const quotaTotal = issuerUser.admissionCodeQuotaTotal;
    if (Number.isFinite(quotaTotal) && userUsed >= quotaTotal) {
      logger.warn('消费新用户邀请码被拒绝：发码人额度已用尽', {
        code: resolvedInvite.code,
        issuerUserId: resolvedInvite.issuerUserId,
        quotaTotal,
        userUsed
      });
      throw buildInviteError('当前账号的新用户邀请码额度已用尽', 'INVITE_CODE_QUOTA_EXCEEDED');
    }
  }

  async _insertInviteRecord(payload, options = {}) {
    const executeRunner = this._getExecuteRunner(options.connection);
    const inviteCode = new InviteCode(payload);
    await executeRunner(
      `INSERT INTO invite_codes (
         invite_code_id, code, purpose, status, issuer_user_id, family_id,
         target_role, target_family_permission_role, slot_key, max_uses,
         used_count, expires_at, consumed_by_user_id, consumed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        inviteCode.inviteCodeId,
        inviteCode.code,
        inviteCode.purpose,
        inviteCode.status,
        inviteCode.issuerUserId,
        inviteCode.familyId,
        inviteCode.targetRole,
        inviteCode.targetFamilyPermissionRole,
        inviteCode.slotKey,
        inviteCode.maxUses,
        inviteCode.usedCount,
        inviteCode.expiresAt,
        inviteCode.consumedByUserId,
        inviteCode.consumedAt
      ]
    );
    return inviteCode;
  }

  async getCurrentAdmissionInvite(issuerUserId, options = {}) {
    const queryRunner = this._getQueryRunner(options.connection);
    const rows = await queryRunner(
      `SELECT * FROM invite_codes
        WHERE slot_key = ?
          AND status = ?
          AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)
        ORDER BY created_at DESC
        LIMIT 1`,
      [buildAdmissionSlotKey(issuerUserId), INVITE_CODE_STATUS.ACTIVE]
    );
    return rows.length ? InviteCode.fromDB(rows[0]) : null;
  }

  async getCurrentFamilyInvites(familyId, options = {}) {
    const queryRunner = this._getQueryRunner(options.connection);
    const rows = await queryRunner(
      `SELECT * FROM invite_codes
        WHERE purpose = ?
          AND family_id = ?
          AND status = ?
          AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)
        ORDER BY target_role ASC, created_at DESC`,
      [INVITE_CODE_PURPOSE.FAMILY_INVITE, familyId, INVITE_CODE_STATUS.ACTIVE]
    );
    return rows.map((row) => InviteCode.fromDB(row));
  }

  async issueAdmissionCode({ issuerUserId } = {}) {
    logger.info('开始生成新用户邀请码', { issuerUserId });
    const issuerUser = await userService.findById(issuerUserId);
    if (!issuerUser || issuerUser.status !== 'active' || issuerUser.isVirtual) {
      logger.warn('生成新用户邀请码被拒绝：发码人状态不允许', { issuerUserId });
      throw buildInviteError('当前账号不能生成新用户邀请码', 'INVITE_CODE_ISSUER_FORBIDDEN');
    }

    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      await this._lockUser(issuerUserId, connection);

      const latestIssuer = await userService.findById(issuerUserId, { connection, forUpdate: true });
      const capabilities = await this._buildAdmissionIssuerCapabilities(latestIssuer, { connection });
      if (!capabilities.canIssue) {
        logger.warn('生成新用户邀请码被拒绝：当前账号无发码权限', {
          issuerUserId,
          capabilities
        });
        throw buildInviteError('当前账号无权生成新用户邀请码', 'INVITE_CODE_ISSUER_FORBIDDEN');
      }

      if (Number.isFinite(capabilities.globalQuotaRemaining) && capabilities.globalQuotaRemaining <= 0) {
        logger.warn('生成新用户邀请码被拒绝：全局额度已用尽', {
          issuerUserId,
          globalQuotaTotal: capabilities.globalQuotaTotal,
          globalQuotaUsed: capabilities.globalQuotaUsed
        });
        throw buildInviteError('新用户邀请码全局额度已用尽', 'INVITE_CODE_GLOBAL_QUOTA_EXCEEDED');
      }

      if (!capabilities.isSystemAdmin && Number.isFinite(capabilities.quotaRemaining) && capabilities.quotaRemaining <= 0) {
        logger.warn('生成新用户邀请码被拒绝：用户额度已用尽', {
          issuerUserId,
          quotaTotal: capabilities.quotaTotal,
          quotaUsed: capabilities.quotaUsed
        });
        throw buildInviteError('当前账号的新用户邀请码额度已用尽', 'INVITE_CODE_QUOTA_EXCEEDED');
      }

      const slotKey = buildAdmissionSlotKey(issuerUserId);
      await this._disableActiveInvitesBySlot(slotKey, { connection });
      const createdInvite = await this._insertInviteRecord({
        inviteCodeId: InviteCode.generateId(),
        code: InviteCode.generateCode(INVITE_CODE_PURPOSE.ADMISSION_ONLY),
        purpose: INVITE_CODE_PURPOSE.ADMISSION_ONLY,
        status: INVITE_CODE_STATUS.ACTIVE,
        issuerUserId,
        familyId: null,
        targetRole: null,
        targetFamilyPermissionRole: null,
        slotKey,
        maxUses: 1,
        usedCount: 0,
        expiresAt: new Date(Date.now() + ADMISSION_INVITE_EXPIRE_MS),
        consumedByUserId: null,
        consumedAt: null
      }, { connection });

      await connection.commit();
      logger.info('生成新用户邀请码成功', {
        issuerUserId,
        inviteCodeId: createdInvite.inviteCodeId,
        code: createdInvite.code
      });
      return createdInvite.toJSON();
    } catch (error) {
      await connection.rollback();
      logger.error('生成新用户邀请码失败', {
        issuerUserId,
        code: error?.code || null,
        message: error?.message || 'unknown'
      });
      throw error;
    } finally {
      connection.release();
    }
  }

  async issueFamilyInviteCode({ issuerUserId, familyId, targetRole } = {}) {
    const normalizedRole = String(targetRole || '').trim();
    if (![INVITE_CODE_TARGET_ROLE.PARENT, INVITE_CODE_TARGET_ROLE.CHILD].includes(normalizedRole)) {
      throw buildInviteError('家庭邀请码目标角色无效', 'INVITE_CODE_TARGET_ROLE_INVALID');
    }

    logger.info('开始生成家庭邀请码', {
      issuerUserId,
      familyId,
      targetRole: normalizedRole
    });
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      await this._lockUser(issuerUserId, connection);
      await this._lockFamily(familyId, connection);

      const profile = await familyService.getUserFamilyRoleProfile(issuerUserId, {
        connection,
        forUpdate: true
      });

      if (
        !profile ||
        profile.role !== 'parent' ||
        profile.familyId !== familyId ||
        profile.familyPermissionRole !== 'manager'
      ) {
        logger.warn('生成家庭邀请码被拒绝：不是家庭管理员', {
          issuerUserId,
          familyId,
          targetRole: normalizedRole
        });
        throw buildInviteError('只有家庭管理员可以生成家庭邀请码', 'INVITE_CODE_FAMILY_MANAGER_REQUIRED');
      }

      const issuerUser = await userService.findById(issuerUserId);
      if (!issuerUser || issuerUser.systemAccessLevel !== User.SYSTEM_ACCESS_LEVEL.NORMAL) {
        logger.warn('生成家庭邀请码被拒绝：系统访问级别不允许', {
          issuerUserId,
          familyId,
          targetRole: normalizedRole
        });
        throw buildInviteError('当前账号无权生成家庭邀请码', 'INVITE_CODE_ISSUER_FORBIDDEN');
      }

      const slotKey = buildFamilySlotKey(familyId, normalizedRole);
      await this._disableActiveInvitesBySlot(slotKey, { connection });
      await familyService.clearLegacyInviteCode(familyId, { connection });
      const createdInvite = await this._insertInviteRecord({
        inviteCodeId: InviteCode.generateId(),
        code: InviteCode.generateCode(INVITE_CODE_PURPOSE.FAMILY_INVITE),
        purpose: INVITE_CODE_PURPOSE.FAMILY_INVITE,
        status: INVITE_CODE_STATUS.ACTIVE,
        issuerUserId,
        familyId,
        targetRole: normalizedRole,
        targetFamilyPermissionRole: buildTargetFamilyPermissionRole(normalizedRole),
        slotKey,
        maxUses: 1,
        usedCount: 0,
        expiresAt: new Date(Date.now() + FAMILY_INVITE_EXPIRE_MS),
        consumedByUserId: null,
        consumedAt: null
      }, { connection });

      await connection.commit();
      logger.info('生成家庭邀请码成功', {
        issuerUserId,
        familyId,
        targetRole: normalizedRole,
        inviteCodeId: createdInvite.inviteCodeId,
        code: createdInvite.code
      });
      return createdInvite.toJSON();
    } catch (error) {
      await connection.rollback();
      logger.error('生成家庭邀请码失败', {
        issuerUserId,
        familyId,
        targetRole: normalizedRole,
        code: error?.code || null,
        message: error?.message || 'unknown'
      });
      throw error;
    } finally {
      connection.release();
    }
  }

  async previewInviteCode({ code, currentUserId = null } = {}) {
    const resolvedInvite = await this.resolveInviteCode(code);
    if (!resolvedInvite) {
      logger.info('预览邀请码：未找到记录', {
        code: InviteCode.normalizeCode(code),
        currentUserId
      });
      return {
        inviteCode: InviteCode.normalizeCode(code),
        purpose: null,
        status: 'invalid',
        targetRole: null,
        familyId: null,
        familyName: null,
        issuerDisplayName: null,
        currentAction: 'invalid',
        currentActionMessage: '邀请码无效，请检查后重试',
        requiresProfileAuthorization: !currentUserId
      };
    }

    try {
      await this._validateUnifiedInvite(resolvedInvite);
    } catch (error) {
      logger.warn('预览邀请码失败：校验未通过', {
        code: resolvedInvite.code,
        currentUserId,
        errorCode: error?.code || null,
        message: error?.message || 'unknown'
      });
      return {
        inviteCode: resolvedInvite.code,
        purpose: resolvedInvite.purpose,
        status: error.code === 'INVITE_CODE_EXPIRED' ? 'expired' : 'invalid',
        targetRole: resolvedInvite.targetRole,
        familyId: resolvedInvite.familyId,
        familyName: resolvedInvite.familyName || null,
        issuerDisplayName: null,
        currentAction: 'invalid',
        currentActionMessage: error.message,
        requiresProfileAuthorization: !currentUserId
      };
    }

    let currentAction = 'invalid';
    let currentActionMessage = '邀请码无效，请检查后重试';

    if (!currentUserId) {
      currentAction = resolvedInvite.purpose === INVITE_CODE_PURPOSE.ADMISSION_ONLY
        ? 'enter_app'
        : 'join_family';
      currentActionMessage = resolvedInvite.purpose === INVITE_CODE_PURPOSE.ADMISSION_ONLY
        ? '确认后即可进入小程序'
        : '确认后即可进入并加入家庭';
    } else {
      const currentUser = await userService.findById(currentUserId);
      if (!currentUser) {
        currentAction = 'invalid';
        currentActionMessage = '当前登录状态无效，请重新进入小程序';
      } else if (currentUser.isSystemBlocked()) {
        currentAction = 'system_blocked';
        currentActionMessage = '当前账号已被管理员暂停使用';
      } else if (resolvedInvite.purpose === INVITE_CODE_PURPOSE.ADMISSION_ONLY) {
        currentAction = 'already_has_access';
        currentActionMessage = '当前账号已进入小程序，无需使用这个邀请码';
      } else if (resolvedInvite.targetRole && currentUser.role !== resolvedInvite.targetRole) {
        currentAction = 'invalid';
        currentActionMessage = '当前账号身份与该邀请码不匹配';
      } else if (currentUser.familyId && currentUser.familyId === resolvedInvite.familyId) {
        currentAction = 'already_in_family';
        currentActionMessage = '你已经在这个家庭里了，无需重复加入';
      } else if (currentUser.familyId && currentUser.familyId !== resolvedInvite.familyId) {
        currentAction = 'has_other_family';
        currentActionMessage = '你已加入其他家庭，暂不支持直接切换';
      } else if (currentUser.isSystemReadonly()) {
        currentAction = 'system_readonly';
        currentActionMessage = '当前账号为只读，仅可查看';
      } else {
        currentAction = 'join_family';
        currentActionMessage = '确认后即可加入该家庭';
      }
    }

    logger.info('预览邀请码成功', {
      code: resolvedInvite.code,
      currentUserId,
      currentAction,
      purpose: resolvedInvite.purpose
    });
    return {
      inviteCode: resolvedInvite.code,
      purpose: resolvedInvite.purpose,
      status: 'active',
      targetRole: resolvedInvite.targetRole,
      familyId: resolvedInvite.familyId || null,
      familyName: resolvedInvite.familyName || null,
      issuerDisplayName: null,
      currentAction,
      currentActionMessage,
      requiresProfileAuthorization: !currentUserId
    };
  }

  async consumeForNewUser({ code, wechatData, profileSnapshot, connection } = {}) {
    requireTransactionConnection(connection, 'consumeForNewUser');
    logger.info('开始消费邀请码并创建新用户', {
      code: InviteCode.normalizeCode(code),
      openid: wechatData?.openid || null
    });
    const normalizedProfile = normalizeProfileSnapshot(profileSnapshot);
    const resolvedInvite = await this.resolveInviteCode(code, {
      connection,
      forUpdate: true
    });
    const validatedInvite = await this._validateUnifiedInvite(resolvedInvite, { connection });
    await this._assertAdmissionConsumptionAllowed(validatedInvite, { connection });

    const createdUser = await userService.createUser({
      openid: wechatData.openid,
      unionid: wechatData.unionid,
      name: normalizedProfile.nickname || '用户',
      avatar: normalizedProfile.avatarUrl || '',
      role: validatedInvite.purpose === INVITE_CODE_PURPOSE.FAMILY_INVITE
        ? validatedInvite.targetRole
        : 'parent',
      familyId: validatedInvite.purpose === INVITE_CODE_PURPOSE.FAMILY_INVITE
        ? validatedInvite.familyId
        : null,
      familyPermissionRole: validatedInvite.purpose === INVITE_CODE_PURPOSE.FAMILY_INVITE
        ? validatedInvite.targetFamilyPermissionRole
        : null
    }, { connection });

    let consumed = false;
    if (validatedInvite.source === 'unified') {
      consumed = await this._consumeUnifiedInvite(validatedInvite, createdUser.userId, { connection });
    } else if (validatedInvite.source === 'legacy_admission') {
      consumed = await appAccessService.consumeAccessCode(validatedInvite.accessCodeId, createdUser.userId, {
        connection
      });
    } else if (validatedInvite.source === 'legacy_family') {
      consumed = await this._consumeLegacyFamilyInvite(validatedInvite, { connection });
    }

    if (!consumed) {
      logger.warn('消费邀请码失败：更新使用状态未生效', {
        code: validatedInvite.code,
        source: validatedInvite.source
      });
      throw buildInviteError('邀请码无效，请检查后重试', 'INVITE_CODE_INVALID');
    }

    logger.info('消费邀请码并创建新用户成功', {
      code: validatedInvite.code,
      source: validatedInvite.source,
      createdUserId: createdUser.userId,
      familyId: createdUser.familyId || null
    });
    return createdUser;
  }

  async consumeForExistingUser({ code, userId } = {}) {
    logger.info('开始消费邀请码并绑定已有用户家庭', {
      code: InviteCode.normalizeCode(code),
      userId
    });
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      await this._lockUser(userId, connection);

      const resolvedInvite = await this.resolveInviteCode(code, {
        connection,
        forUpdate: true
      });
      const validatedInvite = await this._validateUnifiedInvite(resolvedInvite, { connection });

      if (validatedInvite.purpose !== INVITE_CODE_PURPOSE.FAMILY_INVITE) {
        logger.warn('已有用户消费邀请码被拒绝：用途不匹配', {
          code: validatedInvite.code,
          userId,
          purpose: validatedInvite.purpose
        });
        throw buildInviteError('当前邀请码不能用于加入家庭', 'INVITE_CODE_PURPOSE_MISMATCH');
      }

      const currentUser = await userService.findById(userId, { connection, forUpdate: true });
      if (!currentUser) {
        throw buildInviteError('当前用户不存在', 'USER_NOT_FOUND');
      }

      if (validatedInvite.targetRole && currentUser.role !== validatedInvite.targetRole) {
        logger.warn('已有用户消费邀请码被拒绝：角色不匹配', {
          code: validatedInvite.code,
          userId,
          currentRole: currentUser.role,
          targetRole: validatedInvite.targetRole
        });
        throw buildInviteError('当前账号身份与该邀请码不匹配', 'INVITE_CODE_TARGET_ROLE_MISMATCH');
      }

      if (currentUser.familyId && currentUser.familyId === validatedInvite.familyId) {
        logger.info('已有用户消费邀请码无需处理：已在目标家庭', {
          code: validatedInvite.code,
          userId,
          familyId: validatedInvite.familyId
        });
        throw buildInviteError('你已经在这个家庭里了，无需重复加入', 'INVITE_CODE_ALREADY_IN_TARGET_FAMILY');
      }

      if (currentUser.familyId && currentUser.familyId !== validatedInvite.familyId) {
        logger.warn('已有用户消费邀请码被拒绝：已在其他家庭', {
          code: validatedInvite.code,
          userId,
          currentFamilyId: currentUser.familyId,
          targetFamilyId: validatedInvite.familyId
        });
        throw buildInviteError('你已加入其他家庭，暂不支持直接切换', 'INVITE_CODE_EXISTING_USER_HAS_FAMILY');
      }

      const executeRunner = this._getExecuteRunner(connection);
      await executeRunner(
        `UPDATE users
            SET family_id = ?,
                family_permission_role = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?`,
        [validatedInvite.familyId, validatedInvite.targetFamilyPermissionRole, userId]
      );

      let consumed = false;
      if (validatedInvite.source === 'unified') {
        consumed = await this._consumeUnifiedInvite(validatedInvite, userId, { connection });
      } else if (validatedInvite.source === 'legacy_family') {
        consumed = await this._consumeLegacyFamilyInvite(validatedInvite, { connection });
      }

      if (!consumed) {
        logger.warn('已有用户消费邀请码失败：更新使用状态未生效', {
          code: validatedInvite.code,
          userId,
          source: validatedInvite.source
        });
        throw buildInviteError('邀请码无效，请检查后重试', 'INVITE_CODE_INVALID');
      }

      await connection.commit();
      logger.info('已有用户消费邀请码成功', {
        code: validatedInvite.code,
        userId,
        familyId: validatedInvite.familyId,
        familyPermissionRole: validatedInvite.targetFamilyPermissionRole
      });

      return {
        familyId: validatedInvite.familyId,
        familyPermissionRole: validatedInvite.targetFamilyPermissionRole,
        role: currentUser.role
      };
    } catch (error) {
      await connection.rollback();
      logger.error('已有用户消费邀请码失败', {
        code: InviteCode.normalizeCode(code),
        userId,
        errorCode: error?.code || null,
        message: error?.message || 'unknown'
      });
      throw error;
    } finally {
      connection.release();
    }
  }

  async getInviteBootstrap(userId) {
    const currentUser = await userService.findById(userId);
    if (!currentUser) {
      throw buildInviteError('当前用户不存在', 'USER_NOT_FOUND');
    }

    const admissionCapabilities = await this._buildAdmissionIssuerCapabilities(currentUser);
    const canIssueFamilyInviteCode = Boolean(
      currentUser.role === 'parent' &&
      currentUser.familyId &&
      currentUser.familyPermissionRole === 'manager' &&
      currentUser.systemAccessLevel === User.SYSTEM_ACCESS_LEVEL.NORMAL
    );

    return {
      canIssueAdmissionCode: admissionCapabilities.canIssue,
      admissionCodeQuotaTotal: admissionCapabilities.quotaTotal,
      admissionCodeQuotaUsed: admissionCapabilities.quotaUsed,
      admissionCodeQuotaRemaining: admissionCapabilities.quotaRemaining,
      admissionGlobalQuotaTotal: admissionCapabilities.globalQuotaTotal,
      admissionGlobalQuotaUsed: admissionCapabilities.globalQuotaUsed,
      admissionGlobalQuotaRemaining: admissionCapabilities.globalQuotaRemaining,
      canIssueFamilyInviteCode,
      familyId: currentUser.familyId || null,
      availableFamilyInviteRoles: canIssueFamilyInviteCode
        ? [INVITE_CODE_TARGET_ROLE.CHILD, INVITE_CODE_TARGET_ROLE.PARENT]
        : []
    };
  }

  async getCurrentInviteSummary(userId) {
    const currentUser = await userService.findById(userId);
    if (!currentUser) {
      throw buildInviteError('当前用户不存在', 'USER_NOT_FOUND');
    }

    const admissionInvite = canUserIssueAdmissionInPrinciple(currentUser)
      ? await this.getCurrentAdmissionInvite(userId)
      : null;
    const canIssueFamilyInviteCode = Boolean(
      currentUser.role === 'parent' &&
      currentUser.familyId &&
      currentUser.familyPermissionRole === 'manager' &&
      currentUser.systemAccessLevel === User.SYSTEM_ACCESS_LEVEL.NORMAL
    );
    const familyInvites = canIssueFamilyInviteCode
      ? await this.getCurrentFamilyInvites(currentUser.familyId)
      : [];
    const visibleAdmissionInvite = admissionInvite && !isExpired(admissionInvite.expiresAt)
      ? admissionInvite
      : null;
    const visibleFamilyInvites = familyInvites.filter((invite) => !isExpired(invite.expiresAt));

    return {
      admissionCode: visibleAdmissionInvite ? visibleAdmissionInvite.toJSON() : null,
      familyInviteCodes: visibleFamilyInvites.map((invite) => invite.toJSON())
    };
  }
}

module.exports = new InviteCodeService();
module.exports.ADMISSION_CODE_GLOBAL_QUOTA_SETTING_KEY = ADMISSION_CODE_GLOBAL_QUOTA_SETTING_KEY;
