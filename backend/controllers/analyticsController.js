const analyticsReadModelService = require('../services/analyticsReadModelService');
const { resolveTargetUserId } = require('../utils/resolveTargetUserId');
const { success, error } = require('../utils/response');
const { createLogger } = require('../utils/logger');

const logger = createLogger('AnalyticsController');

class AnalyticsController {
  async queryReadModel(req, res) {
    return this._handleScopedQuery(
      req,
      res,
      '查询 analytics read model 失败',
      'ANALYTICS_READ_MODEL_QUERY_FAILED',
      (payload, viewer) => analyticsReadModelService.queryReadModel(payload, viewer)
    );
  }

  async queryTaskCompletionStats(req, res) {
    return this._handleScopedQuery(
      req,
      res,
      '查询 analytics task completion stats 失败',
      'ANALYTICS_TASK_COMPLETION_STATS_QUERY_FAILED',
      (payload, viewer) => analyticsReadModelService.queryTaskCompletionStats(payload, viewer)
    );
  }

  async queryUpcomingExpiry(req, res) {
    return this._handleScopedQuery(
      req,
      res,
      '查询 analytics upcoming expiry 失败',
      'ANALYTICS_UPCOMING_EXPIRY_QUERY_FAILED',
      (payload, viewer) => analyticsReadModelService.queryUpcomingExpiry(payload, viewer)
    );
  }

  async queryTaskStarCalendar(req, res) {
    return this._handleScopedQuery(
      req,
      res,
      '查询 analytics task star calendar 失败',
      'ANALYTICS_TASK_STAR_CALENDAR_QUERY_FAILED',
      (payload, viewer) => analyticsReadModelService.queryTaskStarCalendar(payload, viewer)
    );
  }

  async _handleScopedQuery(req, res, logMessage, defaultErrorCode, executor) {
    try {
      const resolved = await this._resolveScopedPayload(req);
      if (resolved.errorResponse) {
        return res.status(resolved.errorResponse.status).json(resolved.errorResponse.body);
      }

      const result = await executor(resolved.payload, {
        viewerUserId: req.user.userId,
        viewerRole: req.user.role,
        familyId: req.user.familyId || null
      });

      return res.json(success(result, '获取成功'));
    } catch (err) {
      logger.error(logMessage, err);
      return res.status(this._statusForError(err.code)).json(
        error(err.message || logMessage, err.code || defaultErrorCode)
      );
    }
  }

  async _resolveScopedPayload(req) {
    const payload = { ...(req.body || {}) };

    if (payload.scope === 'user') {
      if (!payload.userId) {
        return {
          errorResponse: {
            status: 400,
            body: error('userId 参数缺失', 'INVALID_PARAMS')
          }
        };
      }
      const effectiveUserId = await resolveTargetUserId(req, payload.userId);
      if (!effectiveUserId) {
        return {
          errorResponse: {
            status: 403,
            body: error('无权访问该成员数据', 'FAMILY_MEMBER_ACCESS_DENIED')
          }
        };
      }
      payload.userId = effectiveUserId;
    } else if (payload.scope === 'family') {
      if (req.user.role !== 'parent' || !req.user.familyId) {
        return {
          errorResponse: {
            status: 403,
            body: error('仅家长可访问家庭分析读模型', 'PERMISSION_DENIED')
          }
        };
      }
    }

    return { payload };
  }

  _statusForError(errorCode) {
    switch (errorCode) {
      case 'INVALID_PARAMS':
        return 400;
      case 'PERMISSION_DENIED':
      case 'FAMILY_MEMBER_ACCESS_DENIED':
        return 403;
      default:
        return 500;
    }
  }
}

module.exports = new AnalyticsController();
