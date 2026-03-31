/**
 * 奖励控制器
 */

const rewardService = require('../services/rewardService');
const { success, error } = require('../utils/response');
const { createLogger } = require('../utils/logger');
const { resolveTargetUserId } = require('../utils/resolveTargetUserId');

const logger = createLogger('RewardController');

class RewardController {
  _buildOperatorContext(req, fallbackOperationKey = null) {
    return {
      actorUserId: req.user.userId,
      actorRole: req.user.role,
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

  _ensureRewardManagePermission(req, res) {
    if (req.user.familyId && req.user.role !== 'parent') {
      res.status(403).json(error('仅家长可管理奖励', 'PERMISSION_DENIED'));
      return false;
    }

    return true;
  }

  async getRewards(req, res) {
    try {
      const rewards = await rewardService.getVisibleRewards({
        familyId: req.user.familyId,
        userId: req.user.userId,
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
      if (!this._ensureRewardManagePermission(req, res)) {
        return;
      }

      const reward = await rewardService.createReward(
        req.user.userId,
        req.user.familyId,
        req.body,
        this._buildOperatorContext(req, req.body.modifyTime)
      );
      return res.json(success(reward.toJSON(), '创建成功'));
    } catch (err) {
      logger.error('创建奖励失败', err);
      return res.status(this._statusForError(err.code)).json(error(err.message || '创建奖励失败', err.code || 'REWARD_CREATE_FAILED'));
    }
  }

  async updateReward(req, res) {
    try {
      if (!this._ensureRewardManagePermission(req, res)) {
        return;
      }

      const reward = await rewardService.updateReward(
        req.params.rewardId,
        req.user.userId,
        req.body,
        this._buildOperatorContext(req, req.body.modifyTime)
      );
      return res.json(success(reward.toJSON(), '更新成功'));
    } catch (err) {
      logger.error('更新奖励失败', err);
      return res.status(this._statusForError(err.code)).json(error(err.message || '更新奖励失败', err.code || 'REWARD_UPDATE_FAILED'));
    }
  }

  async deleteReward(req, res) {
    try {
      if (!this._ensureRewardManagePermission(req, res)) {
        return;
      }

      await rewardService.deleteReward(
        req.params.rewardId,
        req.user.userId,
        this._buildOperatorContext(req)
      );
      return res.json(success({ rewardId: req.params.rewardId }, '删除成功'));
    } catch (err) {
      logger.error('删除奖励失败', err);
      return res.status(this._statusForError(err.code)).json(error(err.message || '删除奖励失败', err.code || 'REWARD_DELETE_FAILED'));
    }
  }

  async exchangeReward(req, res) {
    try {
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
        this._buildOperatorContext(req, req.body.modifyTime)
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
        this._buildOperatorContext(req, req.body.modifyTime)
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
