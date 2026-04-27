const taskTemplateService = require('../services/taskTemplateService');
const taskTemplateRecommendationService = require('../services/taskTemplateRecommendationService');
const { ensureManagerBusinessAccess } = require('../utils/family-permission');
const { success, error } = require('../utils/response');
const { createLogger } = require('../utils/logger');

const logger = createLogger('TaskTemplateController');

class TaskTemplateController {
  async _ensureManagePermission(req, res) {
    if (req.user.role !== 'parent' || !req.user.familyId) {
      res.status(403).json(error('仅家长可管理任务模板', 'PERMISSION_DENIED'));
      return false;
    }

    return ensureManagerBusinessAccess(req, res, {
      deniedMessage: '当前为查看者，不能管理任务模板'
    });
  }

  async getTemplates(req, res) {
    try {
      if (!(await this._ensureManagePermission(req, res))) {
        return;
      }

      const templates = await taskTemplateService.listTemplates(req.user.familyId, req.query || {});
      return res.json(success({
        templates: templates.map((template) => template.toJSON()),
        total: templates.length
      }, '获取成功'));
    } catch (err) {
      logger.error('获取任务模板列表失败', err);
      return res.status(500).json(error('获取任务模板列表失败', 'TASK_TEMPLATE_GET_FAILED'));
    }
  }

  async createTemplate(req, res) {
    try {
      if (!(await this._ensureManagePermission(req, res))) {
        return;
      }

      const template = await taskTemplateService.createTemplate(
        req.user.familyId,
        req.user.userId,
        req.body || {}
      );

      return res.json(success({
        template: template.toJSON()
      }, '创建成功'));
    } catch (err) {
      logger.error('创建任务模板失败', err);
      return res.status(this._statusForError(err.code)).json(error(err.message || '创建任务模板失败', err.code || 'TASK_TEMPLATE_CREATE_FAILED'));
    }
  }

  async updateTemplate(req, res) {
    try {
      if (!(await this._ensureManagePermission(req, res))) {
        return;
      }

      const template = await taskTemplateService.updateTemplate(
        req.params.templateId,
        req.user.familyId,
        req.body || {}
      );

      return res.json(success({
        template: template.toJSON()
      }, '更新成功'));
    } catch (err) {
      logger.error('更新任务模板失败', err);
      return res.status(this._statusForError(err.code)).json(error(err.message || '更新任务模板失败', err.code || 'TASK_TEMPLATE_UPDATE_FAILED'));
    }
  }

  async setTemplateEnabled(req, res) {
    try {
      if (!(await this._ensureManagePermission(req, res))) {
        return;
      }

      const template = await taskTemplateService.setTemplateEnabled(
        req.params.templateId,
        req.user.familyId,
        req.body?.enabled === true
      );

      return res.json(success({
        template: template.toJSON()
      }, '更新成功'));
    } catch (err) {
      logger.error('更新任务模板启停状态失败', err);
      return res.status(this._statusForError(err.code)).json(error(err.message || '更新任务模板启停状态失败', err.code || 'TASK_TEMPLATE_ENABLED_FAILED'));
    }
  }

  async deleteTemplate(req, res) {
    try {
      if (!(await this._ensureManagePermission(req, res))) {
        return;
      }

      await taskTemplateService.deleteTemplate(req.params.templateId, req.user.familyId);
      return res.json(success({
        templateId: req.params.templateId
      }, '删除成功'));
    } catch (err) {
      logger.error('删除任务模板失败', err);
      return res.status(this._statusForError(err.code)).json(error(err.message || '删除任务模板失败', err.code || 'TASK_TEMPLATE_DELETE_FAILED'));
    }
  }

  async recordTemplateUsage(req, res) {
    try {
      if (!(await this._ensureManagePermission(req, res))) {
        return;
      }

      const template = await taskTemplateService.recordUsage(req.params.templateId, req.user.familyId);
      return res.json(success({
        template: template.toJSON()
      }, '记录成功'));
    } catch (err) {
      logger.error('记录任务模板使用次数失败', err);
      return res.status(this._statusForError(err.code)).json(error(err.message || '记录任务模板使用次数失败', err.code || 'TASK_TEMPLATE_USAGE_FAILED'));
    }
  }

  async queryRecommendations(req, res) {
    try {
      if (!(await this._ensureManagePermission(req, res))) {
        return;
      }

      const result = await taskTemplateRecommendationService.queryRecommendations({
        familyId: req.user.familyId,
        userId: req.user.userId,
        ...(req.body || {})
      });

      return res.json(success(result, '获取成功'));
    } catch (err) {
      logger.error('查询任务模板推荐候选失败', err);
      return res.status(this._statusForError(err.code)).json(
        error(err.message || '查询任务模板推荐候选失败', err.code || 'TASK_TEMPLATE_RECOMMENDATION_FAILED')
      );
    }
  }

  _statusForError(errorCode) {
    switch (errorCode) {
      case 'INVALID_PARAMS':
      case 'TASK_TEMPLATE_RANGE_TOO_LARGE':
        return 400;
      case 'PERMISSION_DENIED':
        return 403;
      case 'TASK_TEMPLATE_NOT_FOUND':
        return 404;
      default:
        return 500;
    }
  }
}

module.exports = new TaskTemplateController();
