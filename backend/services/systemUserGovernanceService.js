const userService = require('./userService');
const inviteCodeService = require('./inviteCodeService');
const familyService = require('./familyService');
const User = require('../models/User');
const { INVITE_CODE_PURPOSE } = require('../models/InviteCode');
const { getPool, query } = require('../config/database');
const { createLogger } = require('../utils/logger');

const logger = createLogger('SystemUserGovernanceService');

const VALID_ACCESS_LEVELS = new Set(Object.values(User.SYSTEM_ACCESS_LEVEL));
const GOVERNANCE_FILTER_ALL = 'all';

function normalizeKeyword(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEnumFilter(value, allowedValues = []) {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue || normalizedValue === GOVERNANCE_FILTER_ALL) {
    return GOVERNANCE_FILTER_ALL;
  }
  return allowedValues.includes(normalizedValue) ? normalizedValue : GOVERNANCE_FILTER_ALL;
}

function normalizeBooleanLikeFilter(value) {
  if (value === true || value === 'true') {
    return 'true';
  }
  if (value === false || value === 'false') {
    return 'false';
  }
  return GOVERNANCE_FILTER_ALL;
}

function normalizeGovernanceFilters(filters = {}) {
  return {
    keyword: normalizeKeyword(filters.keyword),
    accessLevel: normalizeEnumFilter(filters.accessLevel, Object.values(User.SYSTEM_ACCESS_LEVEL)),
    role: normalizeEnumFilter(filters.role, ['parent', 'child']),
    canIssueAdmissionCode: normalizeBooleanLikeFilter(filters.canIssueAdmissionCode),
    limit: filters.limit || null,
    cursor: filters.cursor || null
  };
}

function buildEffectiveAdmissionIssuerSql(alias = 'users') {
  return `(
    ${alias}.role = 'parent' AND
    ${alias}.system_access_level = '${User.SYSTEM_ACCESS_LEVEL.NORMAL}' AND
    (
      ${alias}.is_system_admin = 1 OR (
        ${alias}.can_issue_admission_code = 1 AND
        ${alias}.admission_code_quota_total IS NOT NULL AND
        ${alias}.admission_code_quota_total >= 0
      )
    )
  )`;
}

function buildGovernanceWhereClause(filters = {}, alias = 'users') {
  const clauses = [];
  const params = [];

  if (filters.accessLevel !== GOVERNANCE_FILTER_ALL) {
    clauses.push(`${alias}.system_access_level = ?`);
    params.push(filters.accessLevel);
  }

  if (filters.role !== GOVERNANCE_FILTER_ALL) {
    clauses.push(`${alias}.role = ?`);
    params.push(filters.role);
  }

  if (filters.canIssueAdmissionCode !== GOVERNANCE_FILTER_ALL) {
    const effectiveCanIssueSql = buildEffectiveAdmissionIssuerSql(alias);
    clauses.push(filters.canIssueAdmissionCode === 'true'
      ? effectiveCanIssueSql
      : `NOT ${effectiveCanIssueSql}`);
  }

  if (filters.keyword) {
    clauses.push(`(
      LOWER(COALESCE(${alias}.nickname, '')) LIKE ? OR
      LOWER(RIGHT(${alias}.user_id, 4)) LIKE ?
    )`);
    params.push(`%${filters.keyword}%`, `%${filters.keyword}%`);
  }

  return {
    sql: clauses.length > 0 ? ` AND ${clauses.join(' AND ')}` : '',
    params
  };
}

function buildGovernanceSummary(users = []) {
  return users.reduce((result, user) => {
    if (user.systemAccessLevel === User.SYSTEM_ACCESS_LEVEL.BLOCKED) {
      result.blocked += 1;
    } else if (user.systemAccessLevel === User.SYSTEM_ACCESS_LEVEL.READONLY) {
      result.readonly += 1;
    } else {
      result.normal += 1;
    }
    return result;
  }, {
    normal: 0,
    readonly: 0,
    blocked: 0
  });
}

function buildGovernableUser(row) {
  const quotaTotal = row.admission_code_quota_total === null || row.admission_code_quota_total === undefined
    ? null
    : Number(row.admission_code_quota_total);
  const quotaUsed = Number(row.admission_code_quota_used || 0);
  return {
    userId: row.user_id,
    nickname: row.nickname || '',
    role: row.role,
    familyId: row.family_id || null,
    familyPermissionRole: row.family_permission_role || null,
    isSystemAdmin: Boolean(row.is_system_admin),
    isVirtual: Boolean(row.is_virtual),
    systemAccessLevel: row.system_access_level || User.SYSTEM_ACCESS_LEVEL.NORMAL,
    systemAccessUpdatedAt: row.system_access_updated_at || null,
    systemAccessUpdatedByUserId: row.system_access_updated_by_user_id || null,
    canIssueAdmissionCode: Boolean(row.can_issue_admission_code),
    admissionCodeQuotaTotal: quotaTotal,
    admissionCodeQuotaUsed: quotaUsed,
    admissionCodeQuotaRemaining: Number.isFinite(quotaTotal)
      ? Math.max(quotaTotal - quotaUsed, 0)
      : null
  };
}

class SystemUserGovernanceService {
  async listGovernableUsers(filters = {}) {
    try {
      const normalizedFilters = normalizeGovernanceFilters(filters);
      const whereClause = buildGovernanceWhereClause(normalizedFilters, 'users');
      const rows = await query(
        `SELECT users.user_id, users.nickname, users.role, users.family_id, users.family_permission_role,
                users.is_system_admin, users.is_virtual, users.system_access_level,
                users.system_access_updated_at, users.system_access_updated_by_user_id,
                users.can_issue_admission_code, users.admission_code_quota_total,
                COALESCE(admission_usage.total, 0) AS admission_code_quota_used
           FROM users
           LEFT JOIN (
             SELECT issuer_user_id, COUNT(*) AS total
               FROM invite_codes
              WHERE purpose = ?
                AND consumed_by_user_id IS NOT NULL
              GROUP BY issuer_user_id
           ) admission_usage
             ON admission_usage.issuer_user_id = users.user_id
          WHERE users.status = ?
            AND users.is_virtual = 0${whereClause.sql}
          ORDER BY
            CASE users.system_access_level
              WHEN 'blocked' THEN 0
              WHEN 'readonly' THEN 1
              ELSE 2
            END ASC,
            users.is_system_admin DESC,
            COALESCE(users.system_access_updated_at, users.created_at) DESC,
            users.user_id ASC`,
        [INVITE_CODE_PURPOSE.ADMISSION_ONLY, 'active', ...whereClause.params]
      );

      const users = rows.map(buildGovernableUser);
      const summaryRows = await query(
        `SELECT
            SUM(CASE WHEN users.system_access_level = 'normal' THEN 1 ELSE 0 END) AS normal,
            SUM(CASE WHEN users.system_access_level = 'readonly' THEN 1 ELSE 0 END) AS readonly,
            SUM(CASE WHEN users.system_access_level = 'blocked' THEN 1 ELSE 0 END) AS blocked
           FROM users
          WHERE users.status = ?
            AND users.is_virtual = 0${whereClause.sql}`,
        ['active', ...whereClause.params]
      );
      const summary = buildGovernanceSummary(users);
      const summaryRow = summaryRows[0] || {};
      summary.normal = Number(summaryRow.normal || 0);
      summary.readonly = Number(summaryRow.readonly || 0);
      summary.blocked = Number(summaryRow.blocked || 0);

      return {
        users,
        summary,
        nextCursor: '',
        hasMore: false
      };
    } catch (error) {
      logger.error('查询系统治理用户列表失败', error);
      throw error;
    }
  }

  async updateAccessLevel(targetUserId, accessLevel, operatorUserId) {
    const normalizedLevel = String(accessLevel || '').trim();
    if (!VALID_ACCESS_LEVELS.has(normalizedLevel)) {
      throw Object.assign(new Error('系统级访问级别无效'), {
        code: 'SYSTEM_USER_GOVERNANCE_INVALID'
      });
    }

    const targetUser = await userService.findById(targetUserId);
    if (!targetUser || targetUser.isVirtual) {
      throw Object.assign(new Error('目标用户不支持系统治理'), {
        code: 'SYSTEM_USER_GOVERNANCE_TARGET_INVALID'
      });
    }

    if (
      targetUser.isSystemAdmin &&
      targetUser.systemAccessLevel === User.SYSTEM_ACCESS_LEVEL.NORMAL &&
      normalizedLevel !== User.SYSTEM_ACCESS_LEVEL.NORMAL
    ) {
      const remainingCount = await userService.countNormalSystemAdmins({
        excludeUserId: targetUserId
      });
      if (remainingCount <= 0) {
        throw Object.assign(new Error('至少保留一位可正常使用的系统管理员'), {
          code: 'SYSTEM_USER_LAST_ADMIN_NORMAL_REQUIRED'
        });
      }
    }

    const connection = await getPool().getConnection();
    let updatedUser;

    try {
      await connection.beginTransaction();
      const [updateResult] = await connection.execute(
        `UPDATE users
            SET system_access_level = ?,
                system_access_updated_by_user_id = ?,
                system_access_updated_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
            AND status = ?`,
        [normalizedLevel, operatorUserId, targetUserId, 'active']
      );

      if (Number(updateResult?.affectedRows || 0) <= 0) {
        throw Object.assign(new Error('目标用户不存在'), {
          code: 'SYSTEM_USER_GOVERNANCE_TARGET_INVALID'
        });
      }

      if (normalizedLevel !== User.SYSTEM_ACCESS_LEVEL.NORMAL) {
        await inviteCodeService.disableActiveInvitesByIssuer(targetUserId, { connection });
        if (targetUser.role === 'parent' && targetUser.familyId) {
          await familyService.clearLegacyInviteCodeByIssuer(targetUser.familyId, targetUserId, {
            connection
          });
        }
      }

      updatedUser = await userService.findById(targetUserId, { connection });
      if (!updatedUser) {
        throw Object.assign(new Error('目标用户不存在'), {
          code: 'SYSTEM_USER_GOVERNANCE_TARGET_INVALID'
        });
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    logger.info('更新系统用户访问级别成功', {
      targetUserId,
      accessLevel: normalizedLevel,
      operatorUserId
    });

    return {
      userId: updatedUser.userId,
      systemAccessLevel: updatedUser.systemAccessLevel,
      systemAccessUpdatedAt: updatedUser.systemAccessUpdatedAt,
      systemAccessUpdatedByUserId: updatedUser.systemAccessUpdatedByUserId
    };
  }

  async updateAdmissionIssuer(targetUserId, payload = {}, operatorUserId) {
    const targetUser = await userService.findById(targetUserId);
    if (!targetUser || targetUser.isVirtual || targetUser.role !== 'parent') {
      throw Object.assign(new Error('目标用户不支持邀请码治理'), {
        code: 'SYSTEM_USER_GOVERNANCE_TARGET_INVALID'
      });
    }

    if (targetUser.systemAccessLevel !== User.SYSTEM_ACCESS_LEVEL.NORMAL) {
      throw Object.assign(new Error('只允许为正常状态的家长配置新用户邀请码能力'), {
        code: 'SYSTEM_USER_GOVERNANCE_INVALID'
      });
    }

    const canIssueAdmissionCode = Boolean(payload.canIssueAdmissionCode);
    const rawQuota = payload.admissionCodeQuotaTotal;
    const hasQuota = rawQuota !== undefined && rawQuota !== null && rawQuota !== '';
    const normalizedQuota = hasQuota ? Number(rawQuota) : null;

    if (canIssueAdmissionCode && (!Number.isInteger(normalizedQuota) || normalizedQuota < 0)) {
      throw Object.assign(new Error('邀请码额度必须是大于等于 0 的整数'), {
        code: 'SYSTEM_USER_GOVERNANCE_INVALID'
      });
    }

    const connection = await getPool().getConnection();
    let updatedUser;

    try {
      await connection.beginTransaction();
      const [updateResult] = await connection.execute(
        `UPDATE users
            SET can_issue_admission_code = ?,
                admission_code_quota_total = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
            AND status = ?`,
        [canIssueAdmissionCode ? 1 : 0, canIssueAdmissionCode ? normalizedQuota : null, targetUserId, 'active']
      );

      if (Number(updateResult?.affectedRows || 0) <= 0) {
        throw Object.assign(new Error('目标用户不存在'), {
          code: 'SYSTEM_USER_GOVERNANCE_TARGET_INVALID'
        });
      }

      if (!canIssueAdmissionCode) {
        await inviteCodeService.disableActiveInvitesByIssuer(targetUserId, {
          purpose: 'admission_only',
          connection
        });
      }

      updatedUser = await userService.findById(targetUserId, { connection });
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    logger.info('更新用户新用户邀请码治理成功', {
      targetUserId,
      canIssueAdmissionCode,
      admissionCodeQuotaTotal: updatedUser.admissionCodeQuotaTotal,
      operatorUserId
    });

    return {
      userId: updatedUser.userId,
      canIssueAdmissionCode: updatedUser.canIssueAdmissionCode,
      admissionCodeQuotaTotal: updatedUser.admissionCodeQuotaTotal
    };
  }
}

module.exports = new SystemUserGovernanceService();
