const userService = require('./userService');
const User = require('../models/User');
const { query, execute } = require('../config/database');
const { createLogger } = require('../utils/logger');

const logger = createLogger('SystemUserGovernanceService');

const VALID_ACCESS_LEVELS = new Set(Object.values(User.SYSTEM_ACCESS_LEVEL));

function buildGovernableUser(row) {
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
    systemAccessUpdatedByUserId: row.system_access_updated_by_user_id || null
  };
}

class SystemUserGovernanceService {
  async listGovernableUsers() {
    try {
      const rows = await query(
        `SELECT user_id, nickname, role, family_id, family_permission_role, is_system_admin, is_virtual,
                system_access_level, system_access_updated_at, system_access_updated_by_user_id
           FROM users
          WHERE status = ?
            AND is_virtual = 0
          ORDER BY
            CASE system_access_level
              WHEN 'blocked' THEN 0
              WHEN 'readonly' THEN 1
              ELSE 2
            END ASC,
            is_system_admin DESC,
            COALESCE(system_access_updated_at, created_at) DESC,
            user_id ASC`,
        ['active']
      );

      return rows.map(buildGovernableUser);
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

    await execute(
      `UPDATE users
          SET system_access_level = ?,
              system_access_updated_by_user_id = ?,
              system_access_updated_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
          AND status = ?`,
      [normalizedLevel, operatorUserId, targetUserId, 'active']
    );

    const updatedUser = await userService.findById(targetUserId);
    if (!updatedUser) {
      throw Object.assign(new Error('目标用户不存在'), {
        code: 'SYSTEM_USER_GOVERNANCE_TARGET_INVALID'
      });
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
}

module.exports = new SystemUserGovernanceService();
