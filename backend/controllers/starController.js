/**
 * 星星控制器
 */

const starService = require('../services/starService');
const { success, error } = require('../utils/response');
const { createLogger } = require('../utils/logger');
const { resolveTargetUserId } = require('../utils/resolveTargetUserId');

const logger = createLogger('StarController');

class StarController {
  async getStars(req, res) {
    try {
      const effectiveUserId = await resolveTargetUserId(req, req.query.userId);
      if (!effectiveUserId) {
        return res.status(403).json(error('无权访问该成员数据', 'FAMILY_MEMBER_ACCESS_DENIED'));
      }

      const result = await starService.getStarSummary(effectiveUserId);
      return res.json(success({
        ...result,
        groups: result.groups.map(group => group.toJSON()),
      }, '获取成功'));
    } catch (err) {
      logger.error('获取星星余额失败', err);
      return res.status(500).json(error('获取星星余额失败', 'STAR_GET_FAILED'));
    }
  }

  async getRecords(req, res) {
    try {
      const { scope, userId } = req.query;

      if (scope === 'family') {
        if (req.user.role !== 'parent' || !req.user.familyId) {
          return res.status(403).json(error('仅家长可访问家庭星星流水', 'PERMISSION_DENIED'));
        }

        const records = await starService.getFamilyStarRecords(req.user.familyId);
        return res.json(success({
          records: records.map(record => record.toJSON()),
          total: records.length,
        }, '获取成功'));
      }

      const effectiveUserId = await resolveTargetUserId(req, userId);
      if (!effectiveUserId) {
        return res.status(403).json(error('无权访问该成员数据', 'FAMILY_MEMBER_ACCESS_DENIED'));
      }

      const records = await starService.getStarRecordsByUser(effectiveUserId);
      return res.json(success({
        records: records.map(record => record.toJSON()),
        total: records.length,
      }, '获取成功'));
    } catch (err) {
      logger.error('获取星星流水失败', err);
      return res.status(500).json(error('获取星星流水失败', 'STAR_RECORDS_GET_FAILED'));
    }
  }

  async createRecord(req, res) {
    try {
      const effectiveUserId = await resolveTargetUserId(req, req.body.userId);
      if (!effectiveUserId) {
        return res.status(403).json(error('无权操作该成员数据', 'FAMILY_MEMBER_ACCESS_DENIED'));
      }

      const result = await starService.upsertStarRecord(effectiveUserId, req.body);
      return res.json(success({
        record: result.record.toJSON(),
        updatedGroupsSnapshot: result.updatedGroupsSnapshot,
        idempotent: result.idempotent,
      }, '写入成功'));
    } catch (err) {
      logger.error('写入星星流水失败', err);
      return res.status(this._statusForError(err.code)).json(error(err.message || '写入星星流水失败', err.code || 'STAR_RECORD_CREATE_FAILED'));
    }
  }

  async consume(req, res) {
    try {
      const effectiveUserId = await resolveTargetUserId(req, req.body.userId);
      if (!effectiveUserId) {
        return res.status(403).json(error('无权操作该成员数据', 'FAMILY_MEMBER_ACCESS_DENIED'));
      }

      const result = await starService.consumeStars(effectiveUserId, req.body);
      return res.json(success({
        ...result,
        record: result.record ? result.record.toJSON() : null,
      }, '扣减成功'));
    } catch (err) {
      logger.error('执行扣星失败', err);
      return res.status(this._statusForError(err.code)).json(error(err.message || '执行扣星失败', err.code || 'STAR_CONSUME_FAILED'));
    }
  }

  async getGroups(req, res) {
    try {
      const effectiveUserId = await resolveTargetUserId(req, req.query.userId);
      if (!effectiveUserId) {
        return res.status(403).json(error('无权访问该成员数据', 'FAMILY_MEMBER_ACCESS_DENIED'));
      }

      const groups = await starService.getStarGroupsByUser(effectiveUserId);
      return res.json(success({
        groups: groups.map(group => group.toJSON()),
        total: groups.length,
      }, '获取成功'));
    } catch (err) {
      logger.error('获取星星分组失败', err);
      return res.status(500).json(error('获取星星分组失败', 'STAR_GROUPS_GET_FAILED'));
    }
  }

  async syncExpiringReminders(req, res) {
    try {
      const requestedScope = req.body?.scope || req.query?.scope;
      const scope = requestedScope === 'user' ? 'user' : (req.user.role === 'parent' ? 'family' : 'user');
      let targetUserId = null;

      if (scope === 'family') {
        if (req.user.role !== 'parent' || !req.user.familyId) {
          return res.status(403).json(error('仅家长可同步家庭星星提醒', 'PERMISSION_DENIED'));
        }
      } else {
        targetUserId = await resolveTargetUserId(
          req,
          req.body?.targetUserId || req.query?.targetUserId || req.user.userId
        );
        if (!targetUserId) {
          return res.status(403).json(error('无权访问该成员数据', 'FAMILY_MEMBER_ACCESS_DENIED'));
        }
      }

      const result = await starService.syncExpiringStarMessages({
        viewerUserId: req.user.userId,
        viewerRole: req.user.role,
        familyId: req.user.familyId || null,
        scope,
        targetUserId,
        modifyTime: Number(req.body?.modifyTime || req.query?.modifyTime || Date.now()),
        operationKey: String(req.body?.operationKey || req.query?.operationKey || Date.now()),
      });

      return res.json(success(result, '同步成功'));
    } catch (err) {
      logger.error('同步星星即将过期提醒失败', err);
      return res.status(this._statusForError(err.code)).json(
        error(err.message || '同步星星即将过期提醒失败', err.code || 'STAR_EXPIRING_SYNC_FAILED')
      );
    }
  }

  async syncExpiryAuthority(req, res) {
    try {
      const requestedScope = req.body?.scope || req.query?.scope;
      const scope = requestedScope === 'family'
        ? 'family'
        : 'user';
      let targetUserId = null;

      if (scope === 'family') {
        if (req.user.role !== 'parent' || !req.user.familyId) {
          return res.status(403).json(error('仅家长可执行家庭星星到期结算', 'PERMISSION_DENIED'));
        }
      } else {
        targetUserId = await resolveTargetUserId(
          req,
          req.body?.targetUserId || req.query?.targetUserId || req.user.userId
        );
        if (!targetUserId) {
          return res.status(403).json(error('无权访问该成员数据', 'FAMILY_MEMBER_ACCESS_DENIED'));
        }
      }

      const expiryGovernanceService = require('../services/starExpiryGovernanceService');
      const result = await expiryGovernanceService.syncExpiryAuthority({
        viewerUserId: req.user.userId,
        viewerRole: req.user.role,
        familyId: req.user.familyId || null,
        scope,
        targetUserId,
        modifyTime: Number(req.body?.modifyTime || req.query?.modifyTime || Date.now()),
        operationKey: String(req.body?.operationKey || req.query?.operationKey || Date.now()),
      });

      return res.json(success(result, '同步成功'));
    } catch (err) {
      logger.error('执行星星到期权威结算失败', err);
      return res.status(this._statusForError(err.code)).json(
        error(err.message || '执行星星到期权威结算失败', err.code || 'STAR_EXPIRY_AUTHORITY_FAILED')
      );
    }
  }

  _statusForError(errorCode) {
    switch (errorCode) {
      case 'INVALID_PARAMS':
      case 'INSUFFICIENT_STARS':
      case 'REWARD_DISABLED':
        return 400;
      case 'PERMISSION_DENIED':
      case 'FAMILY_MEMBER_ACCESS_DENIED':
        return 403;
      case 'STAR_RECORD_NOT_FOUND':
        return 404;
      case 'REWARD_ALREADY_EXCHANGED':
      case 'REWARD_ID_USER_MISMATCH':
        return 409;
      default:
        return 500;
    }
  }
}

module.exports = new StarController();
