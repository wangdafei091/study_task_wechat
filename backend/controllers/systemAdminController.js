const systemAdminService = require('../services/systemAdminService');
const systemSettingService = require('../services/systemSettingService');
const systemUserGovernanceService = require('../services/systemUserGovernanceService');
const inviteCodeService = require('../services/inviteCodeService');
const { success, error } = require('../utils/response');
const { createLogger } = require('../utils/logger');

const logger = createLogger('SystemAdminController');

class SystemAdminController {
  async getBootstrap(req, res) {
    try {
      const result = await systemAdminService.getBootstrapContext(req.user.userId);
      res.json(success(result, '获取成功'));
    } catch (err) {
      logger.error('获取系统入口探测信息失败', err);
      res.status(500).json(error('获取系统入口探测信息失败', 'SYSTEM_BOOTSTRAP_FAILED'));
    }
  }

  async getOverview(req, res) {
    try {
      const result = await systemAdminService.getOverview();
      res.json(success(result, '获取成功'));
    } catch (err) {
      if (err.code === 'SYSTEM_SETTING_CORRUPTED') {
        return res.status(500).json(error('系统准入配置异常，请重新设置', err.code));
      }

      logger.error('获取系统管理概览失败', err);
      res.status(500).json(error('获取系统管理概览失败', 'SYSTEM_OVERVIEW_FAILED'));
    }
  }

  async updateAppAccessMode(req, res) {
    try {
      const mode = String(req.body.mode || '').trim();
      const result = await systemSettingService.updateAppAccessMode(
        mode,
        req.systemAdmin?.userId || req.user.userId
      );

      res.json(success({
        appAccessMode: result.mode,
        modeSource: result.source,
        updatedAt: result.updatedAt,
        updatedByUserId: result.updatedByUserId
      }, '更新成功'));
    } catch (err) {
      if (err.code === 'SYSTEM_SETTING_INVALID') {
        return res.status(400).json(error('准入模式无效', err.code));
      }

      logger.error('更新应用准入模式失败', err);
      res.status(500).json(error('更新应用准入模式失败', 'SYSTEM_SETTING_UPDATE_FAILED'));
    }
  }

  async listUserGovernance(req, res) {
    try {
      const result = await systemUserGovernanceService.listGovernableUsers(req.query || {});
      res.json(success(result, '获取成功'));
    } catch (err) {
      logger.error('获取系统用户治理列表失败', err);
      res.status(500).json(error('获取系统用户治理列表失败', 'SYSTEM_USER_GOVERNANCE_LIST_FAILED'));
    }
  }

  async getInviteGovernance(req, res) {
    try {
      const result = await inviteCodeService.getAdmissionGovernanceOverview();
      res.json(success(result, '获取成功'));
    } catch (err) {
      logger.error('获取邀请码治理概览失败', err);
      res.status(500).json(error('获取邀请码治理概览失败', 'SYSTEM_INVITE_GOVERNANCE_GET_FAILED'));
    }
  }

  async updateInviteGovernance(req, res) {
    try {
      const result = await inviteCodeService.updateAdmissionGlobalQuota(
        req.body?.quotaTotal,
        req.systemAdmin?.userId || req.user.userId
      );
      res.json(success(result, '更新成功'));
    } catch (err) {
      if (err.code === 'INVITE_CODE_GLOBAL_QUOTA_INVALID') {
        return res.status(400).json(error(err.message, err.code));
      }
      logger.error('更新邀请码治理概览失败', err);
      res.status(500).json(error('更新邀请码治理概览失败', 'SYSTEM_INVITE_GOVERNANCE_UPDATE_FAILED'));
    }
  }

  async updateUserAccessLevel(req, res) {
    try {
      const result = await systemUserGovernanceService.updateAccessLevel(
        req.params.userId,
        req.body?.accessLevel,
        req.systemAdmin?.userId || req.user.userId
      );
      res.json(success(result, '更新成功'));
    } catch (err) {
      if (
        err.code === 'SYSTEM_USER_GOVERNANCE_INVALID' ||
        err.code === 'SYSTEM_USER_GOVERNANCE_TARGET_INVALID'
      ) {
        return res.status(400).json(error(err.message, err.code));
      }
      if (err.code === 'SYSTEM_USER_LAST_ADMIN_NORMAL_REQUIRED') {
        return res.status(409).json(error(err.message, err.code));
      }

      logger.error('更新系统用户访问级别失败', err);
      res.status(500).json(error('更新系统用户访问级别失败', 'SYSTEM_USER_GOVERNANCE_UPDATE_FAILED'));
    }
  }

  async updateUserAdmissionIssuer(req, res) {
    try {
      const result = await systemUserGovernanceService.updateAdmissionIssuer(
        req.params.userId,
        req.body || {},
        req.systemAdmin?.userId || req.user.userId
      );
      res.json(success(result, '更新成功'));
    } catch (err) {
      if (
        err.code === 'SYSTEM_USER_GOVERNANCE_INVALID' ||
        err.code === 'SYSTEM_USER_GOVERNANCE_TARGET_INVALID'
      ) {
        return res.status(400).json(error(err.message, err.code));
      }
      logger.error('更新用户邀请码治理失败', err);
      res.status(500).json(error('更新用户邀请码治理失败', 'SYSTEM_USER_INVITE_GOVERNANCE_UPDATE_FAILED'));
    }
  }
}

module.exports = new SystemAdminController();
