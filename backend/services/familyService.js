/**
 * 家庭服务
 */

const { pool, query, execute } = require('../config/database');
const Family = require('../models/Family');
const User = require('../models/User');
const { createLogger } = require('../utils/logger');
const logger = createLogger('FamilyService');
const FAMILY_PERMISSION_ROLE = {
  MANAGER: 'manager',
  VIEWER: 'viewer'
};

class FamilyService {
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

  /**
   * 创建家庭（使用事务：同时更新 families + users.family_id）
   */
  async createFamily(userId, name) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const familyId = Family.generateId();
      const inviteCode = Family.generateInviteCode();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24小时后过期

      await conn.execute(
        `INSERT INTO families (family_id, name, invite_code, invite_code_role, invite_code_expires_at, created_by, status)
         VALUES (?, ?, ?, ?, ?, ?, 'active')`,
        [familyId, name, inviteCode, 'child', expiresAt, userId]
      );

      await conn.execute(
        'UPDATE users SET family_id = ?, family_permission_role = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
        [familyId, FAMILY_PERMISSION_ROLE.MANAGER, userId]
      );

      const rewardModifyTime = Date.now();
      const [rewardResult] = await conn.execute(
        `UPDATE rewards
         SET family_id = ?, modify_time = ?
         WHERE user_id = ?
           AND family_id IS NULL
           AND deleted_at IS NULL`,
        [familyId, rewardModifyTime, userId]
      );

      await conn.commit();

      logger.info('创建家庭成功', {
        familyId,
        userId,
        name,
        migratedRewardCount: rewardResult?.affectedRows || 0
      });
      return { familyId, name, inviteCode, inviteCodeExpiresAt: expiresAt };
    } catch (error) {
      await conn.rollback();
      logger.error('创建家庭失败', error);
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * 通过邀请码加入家庭（使用事务）
   * 角色由邀请码绑定的 invite_code_role 决定，忽略请求体传入的 role
   */
  async joinFamily(userId, inviteCode) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 查询邀请码
      const [families] = await conn.execute(
        'SELECT * FROM families WHERE invite_code = ? AND status = ? LIMIT 1',
        [inviteCode, 'active']
      );

      if (families.length === 0) {
        throw Object.assign(new Error('邀请码无效'), { code: 'FAMILY_INVITE_CODE_INVALID' });
      }

      const family = families[0];

      // 检查是否已使用
      if (family.invite_code_used_at !== null) {
        throw Object.assign(new Error('邀请码已使用'), { code: 'FAMILY_INVITE_CODE_INVALID' });
      }

      // 检查是否过期
      if (family.invite_code_expires_at && new Date(family.invite_code_expires_at) < new Date()) {
        throw Object.assign(new Error('邀请码已过期'), { code: 'FAMILY_INVITE_CODE_EXPIRED' });
      }

      // 加入者角色由邀请码决定，不接受客户端传入
      const joinRole = family.invite_code_role || 'child';
      const joinFamilyPermissionRole = joinRole === 'parent'
        ? FAMILY_PERMISSION_ROLE.VIEWER
        : null;

      // 更新用户的家庭信息和角色
      await conn.execute(
        'UPDATE users SET family_id = ?, role = ?, family_permission_role = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
        [family.family_id, joinRole, joinFamilyPermissionRole, userId]
      );

      // 标记邀请码已使用（一次性失效）
      await conn.execute(
        'UPDATE families SET invite_code_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE family_id = ?',
        [family.family_id]
      );

      await conn.commit();

      logger.info('加入家庭成功', {
        userId,
        familyId: family.family_id,
        joinRole,
        familyPermissionRole: joinFamilyPermissionRole
      });
      return {
        familyId: family.family_id,
        role: joinRole,
        familyPermissionRole: joinFamilyPermissionRole
      };
    } catch (error) {
      await conn.rollback();
      logger.error('加入家庭失败', error);
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * 获取当前家庭信息
   */
  async getCurrentFamily(familyId) {
    if (!familyId) return null;

    const results = await query(
      'SELECT * FROM families WHERE family_id = ? AND status = ? LIMIT 1',
      [familyId, 'active']
    );

    if (results.length === 0) return null;
    return Family.fromDB(results[0]).toJSON();
  }

  /**
   * 获取家庭成员列表（只返回 active 成员）
   */
  async getFamilyMembers(familyId) {
    const results = await query(
      'SELECT * FROM users WHERE family_id = ? AND status = ? ORDER BY created_at ASC',
      [familyId, 'active']
    );
    return results.map(r => User.fromDB(r).toJSON());
  }

  /**
   * 刷新邀请码
   * @param {string} familyId - 家庭ID
   * @param {string} role - 目标角色 parent | child
   */
  async refreshInviteCode(familyId, role) {
    const inviteCode = Family.generateInviteCode();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await execute(
      `UPDATE families
       SET invite_code = ?, invite_code_role = ?, invite_code_expires_at = ?, invite_code_used_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE family_id = ?`,
      [inviteCode, role, expiresAt, familyId]
    );

    logger.info('刷新邀请码成功', { familyId, role });
    return { inviteCode, inviteCodeRole: role, inviteCodeExpiresAt: expiresAt };
  }

  async clearLegacyInviteCode(familyId, options = {}) {
    if (!familyId) {
      return false;
    }

    const executeRunner = this._getExecuteRunner(options.connection);
    const result = await executeRunner(
      `UPDATE families
          SET invite_code = NULL,
              invite_code_role = NULL,
              invite_code_expires_at = NULL,
              invite_code_used_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE family_id = ?
          AND status = ?`,
      [familyId, 'active']
    );

    return Number(result?.affectedRows || 0) > 0;
  }

  async clearLegacyInviteCodeByIssuer(familyId, issuerUserId, options = {}) {
    if (!familyId || !issuerUserId) {
      return false;
    }

    const executeRunner = this._getExecuteRunner(options.connection);
    const result = await executeRunner(
      `UPDATE families
          SET invite_code = NULL,
              invite_code_role = NULL,
              invite_code_expires_at = NULL,
              invite_code_used_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE family_id = ?
          AND created_by = ?
          AND status = ?`,
      [familyId, issuerUserId, 'active']
    );

    return Number(result?.affectedRows || 0) > 0;
  }

  /**
   * 创建虚拟成员（is_virtual=true，role 强制为 child）
   */
  async createVirtualMember(creatorUserId, familyId, name) {
    // 同家庭同名成员唯一性校验
    const existing = await query(
      'SELECT user_id FROM users WHERE family_id = ? AND nickname = ? AND status = ? LIMIT 1',
      [familyId, name, 'active']
    );
    if (existing.length > 0) {
      throw Object.assign(new Error('同家庭已存在同名成员'), { code: 'FAMILY_MEMBER_DUPLICATE' });
    }

    const userId = User.generateId();
    await execute(
      `INSERT INTO users (user_id, openid, nickname, role, status, family_id, is_virtual, created_by_user_id)
       VALUES (?, NULL, ?, 'child', 'active', ?, TRUE, ?)`,
      [userId, name, familyId, creatorUserId]
    );

    logger.info('创建虚拟成员成功', { userId, name, familyId });
    return { userId, name, role: 'child', isVirtual: true, familyId };
  }

  /**
   * 软删除家庭成员（仅虚拟成员）
   */
  async softDeleteMember(operatorFamilyId, targetUserId) {
    const results = await query(
      'SELECT * FROM users WHERE user_id = ? AND status = ? LIMIT 1',
      [targetUserId, 'active']
    );

    if (results.length === 0) {
      throw Object.assign(new Error('成员不存在'), { code: 'USER_NOT_FOUND' });
    }

    const target = User.fromDB(results[0]);

    if (target.familyId !== operatorFamilyId) {
      throw Object.assign(new Error('无权操作该成员'), { code: 'FAMILY_MEMBER_ACCESS_DENIED' });
    }

    if (!target.isVirtual) {
      throw Object.assign(new Error('只能删除虚拟成员'), { code: 'FAMILY_VIRTUAL_MEMBER_ONLY' });
    }

    await execute(
      'UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      ['inactive', targetUserId]
    );

    logger.info('软删除成员成功', { targetUserId });
  }

  /**
   * 更新成员昵称
   * 权限：修改自己，或家长修改同家庭虚拟成员
   */
  async updateNickname(operatorUserId, operatorRole, operatorFamilyId, targetUserId, nickname) {
    const results = await query(
      'SELECT * FROM users WHERE user_id = ? AND status = ? LIMIT 1',
      [targetUserId, 'active']
    );

    if (results.length === 0) {
      throw Object.assign(new Error('用户不存在'), { code: 'USER_NOT_FOUND' });
    }

    const target = User.fromDB(results[0]);

    const isSelf = operatorUserId === targetUserId;
    const isParentManagingVirtualChild =
      operatorRole === 'parent' &&
      target.isVirtual &&
      target.familyId === operatorFamilyId;

    if (!isSelf && !isParentManagingVirtualChild) {
      throw Object.assign(new Error('无权修改该成员昵称'), { code: 'FAMILY_MEMBER_ACCESS_DENIED' });
    }

    await execute(
      'UPDATE users SET nickname = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [nickname, targetUserId]
    );

    logger.info('更新昵称成功', { targetUserId, nickname });
  }

  /**
   * 获取用户所属家庭ID（从数据库查询，用于校验家庭归属）
   */
  async getUserFamilyId(userId) {
    const results = await query(
      'SELECT family_id FROM users WHERE user_id = ? AND status = ? LIMIT 1',
      [userId, 'active']
    );
    return results.length > 0 ? results[0].family_id : null;
  }

  /**
   * 获取用户家庭ID和角色（用于校验代理操作权限）
   * @returns {{ familyId: string|null, role: string }|null}
   */
  async getUserFamilyAndRole(userId) {
    const results = await query(
      'SELECT family_id, role, family_permission_role FROM users WHERE user_id = ? AND status = ? LIMIT 1',
      [userId, 'active']
    );
    if (results.length === 0) return null;
    return {
      familyId: results[0].family_id,
      role: results[0].role,
      familyPermissionRole: results[0].family_permission_role || null
    };
  }

  async getUserFamilyRoleProfile(userId, options = {}) {
    const queryRunner = this._getQueryRunner(options.connection);
    const results = await queryRunner(
      `SELECT user_id, family_id, role, family_permission_role, is_virtual, nickname
       FROM users
       WHERE user_id = ? AND status = ?
       LIMIT 1${options.forUpdate ? ' FOR UPDATE' : ''}`,
      [userId, 'active']
    );
    if (results.length === 0) {
      return null;
    }

    return {
      userId: results[0].user_id,
      familyId: results[0].family_id || null,
      role: results[0].role,
      familyPermissionRole: results[0].family_permission_role || null,
      isVirtual: Boolean(results[0].is_virtual),
      nickname: results[0].nickname || ''
    };
  }

  async getUserFamilyRoleProfiles(userIds = [], options = {}) {
    const normalizedUserIds = Array.from(new Set(
      (Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean)
    )).sort();

    if (normalizedUserIds.length === 0) {
      return [];
    }

    const queryRunner = this._getQueryRunner(options.connection);
    const placeholders = normalizedUserIds.map(() => '?').join(', ');
    const results = await queryRunner(
      `SELECT user_id, family_id, role, family_permission_role, is_virtual, nickname
       FROM users
       WHERE user_id IN (${placeholders})
         AND status = ?
       ORDER BY user_id ASC${options.forUpdate ? ' FOR UPDATE' : ''}`,
      normalizedUserIds.concat('active')
    );

    return results.map((row) => ({
      userId: row.user_id,
      familyId: row.family_id || null,
      role: row.role,
      familyPermissionRole: row.family_permission_role || null,
      isVirtual: Boolean(row.is_virtual),
      nickname: row.nickname || ''
    }));
  }

  async countManagers(familyId, options = {}) {
    const queryRunner = this._getQueryRunner(options.connection);
    const results = await queryRunner(
      `SELECT user_id
       FROM users
       WHERE family_id = ?
         AND role = 'parent'
         AND family_permission_role = ?
         AND status = ?${options.forUpdate ? ' FOR UPDATE' : ''}`,
      [familyId, FAMILY_PERMISSION_ROLE.MANAGER, 'active']
    );
    return results.length;
  }

  async isFamilyManager(userId, familyId = null) {
    const profile = await this.getUserFamilyRoleProfile(userId);
    if (!profile) {
      return false;
    }

    if (familyId && profile.familyId !== familyId) {
      return false;
    }

    return Boolean(
      profile.role === 'parent' &&
      profile.familyId &&
      profile.familyPermissionRole === FAMILY_PERMISSION_ROLE.MANAGER
    );
  }

  async updateMemberPermissionRole(operatorUserId, operatorFamilyId, targetUserId, familyPermissionRole) {
    if (![FAMILY_PERMISSION_ROLE.MANAGER, FAMILY_PERMISSION_ROLE.VIEWER].includes(familyPermissionRole)) {
      throw Object.assign(new Error('家长权限无效'), { code: 'INVALID_PARAMS' });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const lockedProfiles = await this.getUserFamilyRoleProfiles(
        [operatorUserId, targetUserId],
        { connection, forUpdate: true }
      );
      const profileByUserId = new Map(lockedProfiles.map((profile) => [profile.userId, profile]));
      const operator = profileByUserId.get(operatorUserId) || null;
      const target = profileByUserId.get(targetUserId) || null;

      if (!operator || operator.familyId !== operatorFamilyId) {
        throw Object.assign(new Error('您尚未加入家庭'), { code: 'FAMILY_NOT_JOINED' });
      }

      if (
        operator.role !== 'parent' ||
        operator.familyPermissionRole !== FAMILY_PERMISSION_ROLE.MANAGER
      ) {
        throw Object.assign(new Error('当前仅管理员可调整家长权限'), { code: 'FAMILY_MANAGER_REQUIRED' });
      }

      if (!target || target.familyId !== operatorFamilyId || target.role !== 'parent') {
        throw Object.assign(new Error('只能调整当前家庭内家长成员的权限'), {
          code: 'FAMILY_PARENT_MEMBER_REQUIRED'
        });
      }

      if (
        target.familyPermissionRole === FAMILY_PERMISSION_ROLE.MANAGER &&
        familyPermissionRole === FAMILY_PERMISSION_ROLE.VIEWER
      ) {
        const managerCount = await this.countManagers(operatorFamilyId, {
          connection,
          forUpdate: true
        });
        if (managerCount <= 1) {
          throw Object.assign(new Error('至少保留一位管理员。请先把另一位家长设为管理员，再调整当前身份'), {
            code: 'FAMILY_LAST_MANAGER_REQUIRED'
          });
        }
      }

      const executeRunner = this._getExecuteRunner(connection);
      await executeRunner(
        `UPDATE users
         SET family_permission_role = ?, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND family_id = ? AND status = ?`,
        [familyPermissionRole, targetUserId, operatorFamilyId, 'active']
      );

      await connection.commit();

      logger.info('更新家长权限成功', {
        operatorUserId,
        targetUserId,
        familyPermissionRole
      });

      return {
        userId: targetUserId,
        familyPermissionRole
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

const familyService = new FamilyService();
familyService.FAMILY_PERMISSION_ROLE = FAMILY_PERMISSION_ROLE;
module.exports = familyService;
