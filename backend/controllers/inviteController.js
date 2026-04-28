const inviteCodeService = require('../services/inviteCodeService');
const { success, error } = require('../utils/response');
const { createLogger } = require('../utils/logger');

const logger = createLogger('InviteController');

class InviteController {
  async preview(req, res) {
    try {
      const inviteCode = String(req.body?.inviteCode || '').trim();
      if (!inviteCode) {
        return res.status(400).json(error('邀请码不能为空', 'INVITE_CODE_REQUIRED'));
      }

      const result = await inviteCodeService.previewInviteCode({
        code: inviteCode,
        currentUserId: req.user?.userId || null
      });
      res.json(success(result, '获取成功'));
    } catch (err) {
      logger.error('预览邀请码失败', err);
      res.status(500).json(error('预览邀请码失败', 'INVITE_PREVIEW_FAILED'));
    }
  }

  async getBootstrap(req, res) {
    try {
      const result = await inviteCodeService.getInviteBootstrap(req.user.userId);
      res.json(success(result, '获取成功'));
    } catch (err) {
      logger.error('获取邀请码能力摘要失败', err);
      res.status(500).json(error('获取邀请码能力摘要失败', 'INVITE_BOOTSTRAP_FAILED'));
    }
  }

  async getCurrent(req, res) {
    try {
      const result = await inviteCodeService.getCurrentInviteSummary(req.user.userId);
      res.json(success(result, '获取成功'));
    } catch (err) {
      logger.error('获取当前邀请码摘要失败', err);
      res.status(500).json(error('获取当前邀请码摘要失败', 'INVITE_CURRENT_FAILED'));
    }
  }

  async issueAdmissionCode(req, res) {
    try {
      const result = await inviteCodeService.issueAdmissionCode({
        issuerUserId: req.user.userId
      });
      res.json(success(result, '生成成功'));
    } catch (err) {
      if (
        err.code === 'INVITE_CODE_ISSUER_FORBIDDEN' ||
        err.code === 'INVITE_CODE_QUOTA_EXCEEDED' ||
        err.code === 'INVITE_CODE_GLOBAL_QUOTA_EXCEEDED'
      ) {
        return res.status(403).json(error(err.message, err.code));
      }
      logger.error('生成新用户邀请码失败', err);
      res.status(500).json(error('生成新用户邀请码失败', 'INVITE_ADMISSION_ISSUE_FAILED'));
    }
  }

  async issueFamilyCode(req, res) {
    try {
      const targetRole = String(req.body?.targetRole || req.body?.role || '').trim();
      const result = await inviteCodeService.issueFamilyInviteCode({
        issuerUserId: req.user.userId,
        familyId: req.user.familyId || null,
        targetRole
      });
      res.json(success(result, '生成成功'));
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
      logger.error('生成家庭邀请码失败', err);
      res.status(500).json(error('生成家庭邀请码失败', 'INVITE_FAMILY_ISSUE_FAILED'));
    }
  }
}

module.exports = new InviteController();
