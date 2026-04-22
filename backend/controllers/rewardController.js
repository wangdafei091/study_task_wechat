/**
 * 奖励控制器
 */

const rewardService = require('../services/rewardService');
const familyService = require('../services/familyService');
const {
  ensureManagerBusinessAccess,
  ensureParentManagerBusinessAccess
} = require('../utils/family-permission');
const { success, error } = require('../utils/response');
const { createLogger } = require('../utils/logger');
const { resolveTargetUserId } = require('../utils/resolveTargetUserId');

const logger = createLogger('RewardController');

class RewardController {
  async _buildOperatorContext(req, subjectUserId = null, fallbackOperationKey = null, options = {}) {
    const requestedActorUserId = req.body?.operatorContext?.actorUserId || req.user.userId;
    let actorUserId = req.user.userId;
    let actorRole = req.user.role;
    const allowSubjectActorOverride = options.allowSubjectActorOverride === true;

    if (
      allowSubjectActorOverride &&
      req.user.role === 'parent' &&
      req.user.familyId &&
      subjectUserId &&
      requestedActorUserId &&
      requestedActorUserId !== req.user.userId &&
      requestedActorUserId === subjectUserId
    ) {
      const actorInfo = await familyService.getUserFamilyAndRole(requestedActorUserId);
      if (actorInfo && actorInfo.familyId === req.user.familyId && actorInfo.role === 'child') {
        actorUserId = requestedActorUserId;
        actorRole = 'child';
      }
    }

    return {
      actorUserId,
      actorRole,
      familyId: req.user.familyId || null,
      operationKey: String(
        req.body.operationKey ||
        req.query.operationKey ||
        req.body.modifyTime ||
        fallbackOperationKey ||
        Date.now()
      ),
      modifyTime: Number(req.body.modifyTime || fallbackOperationKey || Date.now()),
    };
  }

  async _ensureRewardManagePermission(req, res) {
    return ensureParentManagerBusinessAccess(req, res, {
      parentRequiredMessage: '仅家长可管理奖励',
      deniedMessage: '当前为查看者，不能修改奖励'
    });
  }

  async getRewards(req, res) {
    try {
      const effectiveUserId = await resolveTargetUserId(req, req.query.userId || req.user.userId);
      if (!effectiveUserId) {
        return res.status(403).json(error('无权访问该成员奖励数据', 'FAMILY_MEMBER_ACCESS_DENIED'));
      }

      const rewards = await rewardService.getVisibleRewards({
        familyId: req.user.familyId,
        userId: req.user.userId,
        targetUserId: effectiveUserId,
      });

      return res.json(success({
        rewards: rewards.map(reward => reward.toJSON()),
        total: rewards.length,
      }, '获取成功'));
    } catch (err) {
      logger.error('获取奖励列表失败', err);
      return res.status(500).json(error('获取奖励列表失败', 'REWARD_GET_FAILED'));
    }
  }

  async createReward(req, res) {
    try {
      if (!(await this._ensureRewardManagePermission(req, res))) {
        return;
      }

      const reward = await rewardService.createReward(
        req.user.userId,
        req.user.familyId,
        req.body,
        await this._buildOperatorContext(req, null, req.body.modifyTime)
      );
      return res.json(success(reward.toJSON(), '创建成功'));
    } catch (err) {
      logger.error('创建奖励失败', err);
      return res.status(this._statusForError(err.code)).json(error(err.message || '创建奖励失败', err.code || 'REWARD_CREATE_FAILED'));
    }
  }

  async updateReward(req, res) {
    try {
      if (!(await this._ensureRewardManagePermission(req, res))) {
        return;
      }

      const reward = await rewardService.updateReward(
        req.params.rewardId,
        req.user.userId,
        req.body,
        await this._buildOperatorContext(req, null, req.body.modifyTime)
      );
      return res.json(success(reward.toJSON(), '更新成功'));
    } catch (err) {
      logger.error('更新奖励失败', err);
      return res.status(this._statusForError(err.code)).json(error(err.message || '更新奖励失败', err.code || 'REWARD_UPDATE_FAILED'));
    }
  }

  async deleteReward(req, res) {
    try {
      if (!(await this._ensureRewardManagePermission(req, res))) {
        return;
      }

      await rewardService.deleteReward(
        req.params.rewardId,
        req.user.userId,
        await this._buildOperatorContext(req)
      );
      return res.json(success({ rewardId: req.params.rewardId }, '删除成功'));
    } catch (err) {
      logger.error('删除奖励失败', err);
      return res.status(this._statusForError(err.code)).json(error(err.message || '删除奖励失败', err.code || 'REWARD_DELETE_FAILED'));
    }
  }

  async exchangeReward(req, res) {
    try {
      if (!(await ensureManagerBusinessAccess(req, res, {
        deniedMessage: '当前为查看者，不能兑换奖励'
      }))) {
        return;
      }

      const reward = await rewardService.getRewardById(req.params.rewardId);
      if (!reward || !rewardService.canUserAccessReward(reward, req.user)) {
        return res.status(404).json(error('奖励不存在', 'REWARD_NOT_FOUND'));
      }

      const targetUserId = req.body.exchangeUserId || req.user.userId;
      const effectiveUserId = await resolveTargetUserId(req, targetUserId);
      if (!effectiveUserId) {
        return res.status(403).json(error('无权为该成员兑换奖励', 'FAMILY_MEMBER_ACCESS_DENIED'));
      }

      const result = await rewardService.exchangeReward(
        req.params.rewardId,
        effectiveUserId,
        req.body.modifyTime,
        await this._buildOperatorContext(req, effectiveUserId, req.body.modifyTime, {
          allowSubjectActorOverride: true
        })
      );

      return res.json(success({
        reward: result.reward.toJSON(),
        record: result.record ? result.record.toJSON() : null,
        consumedPoints: result.consumedPoints,
        deductionBreakdown: result.deductionBreakdown,
        updatedGroupsSnapshot: result.updatedGroupsSnapshot,
        idempotent: result.idempotent,
      }, '兑换成功'));
    } catch (err) {
      logger.error('兑换奖励失败', err);
      return res.status(this._statusForError(err.code)).json(error(err.message || '兑换奖励失败', err.code || 'REWARD_EXCHANGE_FAILED'));
    }
  }

  async cancelRewardExchange(req, res) {
    try {
      if (!(await ensureManagerBusinessAccess(req, res, {
        deniedMessage: '当前为查看者，不能取消奖励兑换'
      }))) {
        return;
      }

      const reward = await rewardService.getRewardById(req.params.rewardId);
      if (!reward || !rewardService.canUserAccessReward(reward, req.user)) {
        return res.status(404).json(error('奖励不存在', 'REWARD_NOT_FOUND'));
      }

      const targetUserId = req.body.exchangeUserId || reward.exchangeUserId || req.user.userId;
      const effectiveUserId = await resolveTargetUserId(req, targetUserId);
      if (!effectiveUserId) {
        return res.status(403).json(error('无权为该成员取消奖励兑换', 'FAMILY_MEMBER_ACCESS_DENIED'));
      }

      const result = await rewardService.cancelRewardExchange(
        req.params.rewardId,
        effectiveUserId,
        req.body.modifyTime,
        await this._buildOperatorContext(req, effectiveUserId, req.body.modifyTime, {
          allowSubjectActorOverride: true
        })
      );

      return res.json(success({
        reward: result.reward.toJSON(),
        refundRecord: result.refundRecord ? result.refundRecord.toJSON() : null,
        refundedPoints: result.refundedPoints,
        updatedGroupsSnapshot: result.updatedGroupsSnapshot,
        idempotent: result.idempotent,
      }, '取消兑换成功'));
    } catch (err) {
      logger.error('取消兑换奖励失败', err);
      return res.status(this._statusForError(err.code)).json(error(err.message || '取消兑换奖励失败', err.code || 'REWARD_CANCEL_EXCHANGE_FAILED'));
    }
  }

  _statusForError(errorCode) {
    switch (errorCode) {
      case 'INVALID_PARAMS':
      case 'INSUFFICIENT_STARS':
      case 'REWARD_DISABLED':
      case 'REWARD_DELIVERED':
      case 'REWARD_CANCEL_WINDOW_EXPIRED':
        return 400;
      case 'PERMISSION_DENIED':
      case 'FAMILY_MEMBER_ACCESS_DENIED':
        return 403;
      case 'REWARD_NOT_FOUND':
        return 404;
      case 'REWARD_ALREADY_EXCHANGED':
      case 'REWARD_ID_USER_MISMATCH':
        return 409;
      default:
        return 500;
    }
  }
}

module.exports = new RewardController();
