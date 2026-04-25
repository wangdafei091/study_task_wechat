const systemAdminService = require('../services/systemAdminService');
const systemSettingService = require('../services/systemSettingService');
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
}

module.exports = new SystemAdminController();
