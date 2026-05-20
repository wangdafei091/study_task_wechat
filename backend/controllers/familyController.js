/**
 * 家庭控制器
 */

const familyService = require('../services/familyService');
const inviteCodeService = require('../services/inviteCodeService');
const userProductStateService = require('../services/userProductStateService');
const userService = require('../services/userService');
const { generateToken } = require('../config/jwt');
const { createLogger } = require('../utils/logger');
const { success, error } = require('../utils/response');
const logger = createLogger('FamilyController');

class FamilyController {
  async _syncUserProductState(action, work) {
    try {
      await work();
    } catch (syncError) {
      logger.warn(`用户产品状态同步失败: ${action}`, {
        code: syncError.code,
        message: syncError.message
      });
    }
  }

  _issueToken(user) {
    return generateToken({
      userId: user.userId,
      openid: user.openid,
      role: user.role,
      familyId: user.familyId || null,
      familyPermissionRole: user.familyPermissionRole || null,
    });
  }

  async _loadLatestUser(userId) {
    return userService.findById(userId);
  }

  async _ensureManagerGovernance(req, res) {
    const operator = await familyService.getUserFamilyRoleProfile(req.user.userId);

    if (!operator || operator.role !== 'parent') {
      res.status(403).json(error('只有家长可以修改家庭设置', 'FAMILY_PARENT_REQUIRED'));
      return null;
    }

    if (!operator.familyId) {
      res.status(400).json(error('您尚未加入家庭', 'FAMILY_NOT_JOINED'));
      return null;
    }

    if (operator.familyPermissionRole !== 'manager') {
      res.status(403).json(error('当前为查看者，不能修改家庭设置', 'FAMILY_MANAGER_REQUIRED'));
      return null;
    }

    return operator;
  }

  /**
   * 创建家庭
   * POST /api/families
   */
  async createFamily(req, res) {
    try {
      const { userId, role, familyId: existingFamilyId } = req.user;
      const { name } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json(error('家庭名称不能为空', 'INVALID_PARAMS'));
      }

      if (role !== 'parent') {
        return res.status(403).json(error('仅家长可以创建家庭', 'FAMILY_CREATE_DENIED'));
      }

      if (existingFamilyId) {
        return res.status(400).json(error('您已加入家庭，无法再次创建', 'FAMILY_ALREADY_JOINED'));
      }

      logger.info('创建家庭', { userId, name });
      const result = await familyService.createFamily(userId, name.trim());

      await this._syncUserProductState('family_create', async () => {
        await userProductStateService.markActivated(userId, {
          runtimeVersion: req.body?.runtimeVersion || null,
          familyId: result.familyId,
          source: 'family_created',
          sourcePage: 'family_create',
          clientPlatform: 'wechat-miniprogram'
        });
        await userProductStateService.recordEvent({
          userId,
          familyId: result.familyId,
          eventType: 'family_created',
          eventTime: Date.now(),
          appVersion: req.body?.runtimeVersion || null,
          clientPlatform: 'wechat-miniprogram',
          sourcePage: 'family_create',
          payloadJson: {
            familyId: result.familyId
          }
        });
      });

      const user = await this._loadLatestUser(userId);
      const token = this._issueToken(user);

      res.json(success({
        familyId: result.familyId,
        name: result.name,
        inviteCode: result.inviteCode,
        inviteCodeExpiresAt: result.inviteCodeExpiresAt,
        token,
      }, '家庭创建成功'));
    } catch (err) {
      logger.error('创建家庭失败', err);
      res.status(500).json(error('创建家庭失败', 'FAMILY_CREATE_FAILED'));
    }
  }

  /**
   * 加入家庭（场景B独立设备）
   * POST /api/families/join
   */
  async joinFamily(req, res) {
    try {
      const { userId } = req.user;
      const { inviteCode } = req.body;

      if (!inviteCode) {
        return res.status(400).json(error('邀请码不能为空', 'INVALID_PARAMS'));
      }

      logger.info('加入家庭', { userId, inviteCode });
      const joinResult = await inviteCodeService.consumeForExistingUser({ code: inviteCode, userId });

      await this._syncUserProductState('family_join', async () => {
        await userProductStateService.markActivated(userId, {
          runtimeVersion: req.body?.runtimeVersion || null,
          familyId: joinResult.familyId || null,
          source: 'family_joined',
          sourcePage: 'family_join',
          clientPlatform: 'wechat-miniprogram'
        });
        await userProductStateService.recordEvent({
          userId,
          familyId: joinResult.familyId || null,
          eventType: 'family_joined',
          eventTime: Date.now(),
          appVersion: req.body?.runtimeVersion || null,
          clientPlatform: 'wechat-miniprogram',
          sourcePage: 'family_join',
          payloadJson: {
            familyId: joinResult.familyId || null
          }
        });
      });

      const user = await this._loadLatestUser(userId);
      const token = this._issueToken(user);

      res.json(success({ token }, '加入家庭成功'));
    } catch (err) {
      if (err.code === 'FAMILY_INVITE_CODE_INVALID' || err.code === 'INVITE_CODE_INVALID') {
        return res.status(400).json(error('邀请码无效或已使用', err.code));
      }
      if (err.code === 'FAMILY_INVITE_CODE_EXPIRED' || err.code === 'INVITE_CODE_EXPIRED') {
        return res.status(400).json(error('邀请码已过期', err.code));
      }
      if (err.code === 'INVITE_CODE_DISABLED') {
        return res.status(400).json(error(err.message, err.code));
      }
      if (
        err.code === 'INVITE_CODE_PURPOSE_MISMATCH' ||
        err.code === 'INVITE_CODE_TARGET_ROLE_MISMATCH' ||
        err.code === 'INVITE_CODE_ALREADY_IN_TARGET_FAMILY' ||
        err.code === 'INVITE_CODE_EXISTING_USER_HAS_FAMILY'
      ) {
        return res.status(400).json(error(err.message, err.code));
      }
      logger.error('加入家庭失败', err);
      res.status(500).json(error('加入家庭失败', 'FAMILY_JOIN_FAILED'));
    }
  }

  /**
   * 获取当前家庭信息
   * GET /api/families/current
   */
  async getCurrentFamily(req, res) {
    try {
      const { familyId } = req.user;
      const data = familyId ? await familyService.getCurrentFamily(familyId) : null;
      res.json(success({ data }, '获取成功'));
    } catch (err) {
      logger.error('获取家庭信息失败', err);
      res.status(500).json(error('获取家庭信息失败', 'FAMILY_GET_FAILED'));
    }
  }

  /**
   * 获取家庭成员列表
   * GET /api/families/current/members
   */
  async getFamilyMembers(req, res) {
    try {
      const { familyId } = req.user;
      if (!familyId) {
        return res.status(400).json(error('您尚未加入家庭', 'FAMILY_NOT_JOINED'));
      }

      const members = await familyService.getFamilyMembers(familyId);
      res.json(success({ members }, '获取成功'));
    } catch (err) {
      logger.error('获取家庭成员失败', err);
      res.status(500).json(error('获取家庭成员失败', 'FAMILY_MEMBERS_GET_FAILED'));
    }
  }

  /**
   * 刷新邀请码
   * POST /api/families/current/invite-code
   */
  async refreshInviteCode(req, res) {
    try {
      const operator = await this._ensureManagerGovernance(req, res);
      if (!operator) {
        return;
      }

      const targetRole = req.body.role;
      if (!targetRole || !['parent', 'child'].includes(targetRole)) {
        return res.status(400).json(error('目标角色必须为 parent 或 child', 'INVALID_PARAMS'));
      }

      logger.info('刷新邀请码', { familyId: operator.familyId, targetRole });
      const result = await inviteCodeService.issueFamilyInviteCode({
        issuerUserId: operator.userId,
        familyId: operator.familyId,
        targetRole
      });
      res.json(success({
        inviteCode: result.code,
        inviteCodeRole: result.targetRole,
        inviteCodeExpiresAt: result.expiresAt
      }, '邀请码已刷新'));
    } catch (err) {
      if (
        err.code === 'INVITE_CODE_FAMILY_MANAGER_REQUIRED' ||
        err.code === 'INVITE_CODE_ISSUER_FORBIDDEN'
      ) {
        return res.status(403).json(error(err.message, err.code));
      }
      if (err.code === 'INVITE_CODE_TARGET_ROLE_INVALID') {
        return res.status(400).json(error(err.message, err.code));
      }
      logger.error('刷新邀请码失败', err);
      res.status(500).json(error('刷新邀请码失败', 'FAMILY_INVITE_CODE_REFRESH_FAILED'));
    }
  }

  /**
   * 创建虚拟成员（场景A：共享设备）
   * POST /api/families/members
   */
  async createVirtualMember(req, res) {
    try {
      const operator = await this._ensureManagerGovernance(req, res);
      if (!operator) {
        return;
      }
      const { name } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json(error('成员名称不能为空', 'INVALID_PARAMS'));
      }

      logger.info('创建虚拟成员', { userId: operator.userId, familyId: operator.familyId, name });
      const member = await familyService.createVirtualMember(operator.userId, operator.familyId, name.trim());
      res.json(success(member, '成员创建成功'));
    } catch (err) {
      if (err.code === 'FAMILY_MEMBER_DUPLICATE') {
        return res.status(400).json(error('同家庭已存在同名成员', err.code));
      }
      logger.error('创建虚拟成员失败', err);
      res.status(500).json(error('创建成员失败', 'FAMILY_MEMBER_CREATE_FAILED'));
    }
  }

  /**
   * 软删除家庭成员（仅虚拟成员）
   * DELETE /api/families/members/:userId
   */
  async deleteMember(req, res) {
    try {
      const operator = await this._ensureManagerGovernance(req, res);
      if (!operator) {
        return;
      }
      const { userId: targetUserId } = req.params;

      if (targetUserId === operator.userId) {
        return res.status(400).json(error('不能删除自己', 'FAMILY_CANNOT_DELETE_SELF'));
      }

      logger.info('删除家庭成员', { operatorId: operator.userId, targetUserId });
      await familyService.softDeleteMember(operator.familyId, targetUserId);
      res.json(success(null, '成员已删除'));
    } catch (err) {
      if (err.code === 'FAMILY_MEMBER_ACCESS_DENIED') {
        return res.status(403).json(error('无权操作该成员', err.code));
      }
      if (err.code === 'FAMILY_VIRTUAL_MEMBER_ONLY') {
        return res.status(400).json(error('只能删除虚拟成员', err.code));
      }
      if (err.code === 'USER_NOT_FOUND') {
        return res.status(404).json(error('成员不存在', err.code));
      }
      logger.error('删除家庭成员失败', err);
      res.status(500).json(error('删除成员失败', 'FAMILY_MEMBER_DELETE_FAILED'));
    }
  }

  /**
   * 调整家庭内家长权限
   * PATCH /api/families/members/:userId/permission-role
   */
  async updateMemberPermissionRole(req, res) {
    try {
      const operator = await this._ensureManagerGovernance(req, res);
      if (!operator) {
        return;
      }

      const { userId: targetUserId } = req.params;
      const { familyPermissionRole } = req.body || {};
      if (!familyPermissionRole) {
        return res.status(400).json(error('家长权限不能为空', 'INVALID_PARAMS'));
      }

      const result = await familyService.updateMemberPermissionRole(
        operator.userId,
        operator.familyId,
        targetUserId,
        familyPermissionRole
      );

      let token = null;
      if (targetUserId === operator.userId) {
        const user = await this._loadLatestUser(operator.userId);
        token = this._issueToken(user);
      }

      return res.json(success({
        ...result,
        token
      }, '权限更新成功'));
    } catch (err) {
      if (err.code === 'INVALID_PARAMS') {
        return res.status(400).json(error('家长权限无效', err.code));
      }
      if (err.code === 'FAMILY_PARENT_MEMBER_REQUIRED') {
        return res.status(400).json(error('只能调整当前家庭内家长成员的权限', err.code));
      }
      if (err.code === 'FAMILY_LAST_MANAGER_REQUIRED') {
        return res.status(400).json(error(err.message, err.code));
      }
      if (err.code === 'FAMILY_MANAGER_REQUIRED') {
        return res.status(403).json(error('当前为查看者，不能修改家庭设置', err.code));
      }
      logger.error('调整家庭成员权限失败', err);
      return res.status(500).json(error('调整家庭成员权限失败', 'FAMILY_PERMISSION_ROLE_UPDATE_FAILED'));
    }
  }
}

const familyController = new FamilyController();
module.exports = familyController;
