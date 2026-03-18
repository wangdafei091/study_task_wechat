/**
 * 家庭控制器
 */

const familyService = require('../services/familyService');
const userService = require('../services/userService');
const { generateToken } = require('../config/jwt');
const { createLogger } = require('../utils/logger');
const { success, error } = require('../utils/response');
const logger = createLogger('FamilyController');

class FamilyController {
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

      // 重签 JWT，包含最新 familyId
      const user = await userService.findById(userId);
      const token = generateToken({
        userId: user.userId,
        openid: user.openid,
        role: user.role,
        familyId: result.familyId,
      });

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
      const { userId, familyId: existingFamilyId } = req.user;
      const { inviteCode } = req.body;

      if (!inviteCode) {
        return res.status(400).json(error('邀请码不能为空', 'INVALID_PARAMS'));
      }

      if (existingFamilyId) {
        return res.status(400).json(error('您已加入家庭', 'FAMILY_ALREADY_JOINED'));
      }

      logger.info('加入家庭', { userId, inviteCode });
      const result = await familyService.joinFamily(userId, inviteCode);

      // 重签 JWT，包含更新后的 role 和 familyId
      const user = await userService.findById(userId);
      const token = generateToken({
        userId: user.userId,
        openid: user.openid,
        role: result.role,
        familyId: result.familyId,
      });

      res.json(success({ token }, '加入家庭成功'));
    } catch (err) {
      if (err.code === 'FAMILY_INVITE_CODE_INVALID') {
        return res.status(400).json(error('邀请码无效或已使用', err.code));
      }
      if (err.code === 'FAMILY_INVITE_CODE_EXPIRED') {
        return res.status(400).json(error('邀请码已过期', err.code));
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
      const { familyId, role } = req.user;

      if (!familyId) {
        return res.status(400).json(error('您尚未加入家庭', 'FAMILY_NOT_JOINED'));
      }
      if (role !== 'parent') {
        return res.status(403).json(error('只有家长可以生成邀请码', 'FAMILY_PARENT_REQUIRED'));
      }

      const targetRole = req.body.role;
      if (!targetRole || !['parent', 'child'].includes(targetRole)) {
        return res.status(400).json(error('目标角色必须为 parent 或 child', 'INVALID_PARAMS'));
      }

      logger.info('刷新邀请码', { familyId, targetRole });
      const result = await familyService.refreshInviteCode(familyId, targetRole);
      res.json(success(result, '邀请码已刷新'));
    } catch (err) {
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
      const { userId, role, familyId } = req.user;
      const { name } = req.body;

      if (role !== 'parent') {
        return res.status(403).json(error('只有家长可以创建成员', 'FAMILY_PARENT_REQUIRED'));
      }
      if (!familyId) {
        return res.status(400).json(error('您尚未加入家庭', 'FAMILY_NOT_JOINED'));
      }
      if (!name || !name.trim()) {
        return res.status(400).json(error('成员名称不能为空', 'INVALID_PARAMS'));
      }

      logger.info('创建虚拟成员', { userId, familyId, name });
      const member = await familyService.createVirtualMember(userId, familyId, name.trim());
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
      const { role, familyId, userId: operatorId } = req.user;
      const { userId: targetUserId } = req.params;

      if (role !== 'parent') {
        return res.status(403).json(error('只有家长可以删除成员', 'FAMILY_PARENT_REQUIRED'));
      }
      if (!familyId) {
        return res.status(400).json(error('您尚未加入家庭', 'FAMILY_NOT_JOINED'));
      }
      if (targetUserId === operatorId) {
        return res.status(400).json(error('不能删除自己', 'FAMILY_CANNOT_DELETE_SELF'));
      }

      logger.info('删除家庭成员', { operatorId, targetUserId });
      await familyService.softDeleteMember(familyId, targetUserId);
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
}

const familyController = new FamilyController();
module.exports = familyController;
