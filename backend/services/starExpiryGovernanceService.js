const { getPool, query } = require('../config/database');
const starService = require('./starService');
const messageService = require('./messageService');
const { createLogger } = require('../utils/logger');

const logger = createLogger('StarExpiryGovernanceService');

class StarExpiryGovernanceService {
  async syncExpiryAuthority(options = {}) {
    const affectedUserIds = await this._resolveTargetUserIds(options);
    const summary = {
      success: true,
      affectedUserIds: [],
      settledGroupCount: 0,
      settledPoints: 0,
      createdRecordCount: 0,
      invalidGroupCount: 0,
    };

    const pool = getPool();

    for (const userId of affectedUserIds) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const settlement = await starService.settleExpiredGroupsWithConnection(connection, userId, options);
        await this._createExpiredStarMessages(connection, settlement, {
          familyId: options.familyId || null,
          modifyTime: options.modifyTime
        });
        await connection.commit();

        summary.affectedUserIds.push(userId);
        summary.settledGroupCount += Number(settlement.settledGroups || 0);
        summary.settledPoints += Number(settlement.settledPoints || 0);
        summary.createdRecordCount += Number(settlement.createdRecords || 0);
        summary.invalidGroupCount += Number(settlement.invalidGroups || 0);
      } catch (error) {
        await connection.rollback();
        logger.error('单用户星星到期权威结算失败', {
          userId,
          error: error.message,
        });
        throw error;
      } finally {
        connection.release();
      }
    }

    return summary;
  }

  async _resolveTargetUserIds(options = {}) {
    const { viewerUserId, viewerRole, familyId, scope = 'user', targetUserId = null } = options;
    if (!viewerUserId) {
      const error = new Error('viewerUserId 不能为空');
      error.code = 'INVALID_PARAMS';
      throw error;
    }

    if (scope === 'family') {
      if (viewerRole !== 'parent' || !familyId) {
        const error = new Error('仅家长可执行家庭星星到期结算');
        error.code = 'PERMISSION_DENIED';
        throw error;
      }

      const members = await query(
        `SELECT user_id
         FROM users
         WHERE family_id = ?
           AND role = 'child'
           AND status = 'active'`,
        [familyId]
      );
      return members.map((row) => row.user_id);
    }

    return [targetUserId || viewerUserId];
  }

  async _createExpiredStarMessages(connection, settlement = {}, options = {}) {
    const settledDetails = Array.isArray(settlement.settledDetails) ? settlement.settledDetails : [];
    if (settledDetails.length === 0) {
      return [];
    }

    const grouped = new Map();
    settledDetails.forEach((detail) => {
      const normalizedExpiryDate = detail.normalizedExpiryDate || detail.expiryDate || null;
      const subjectUserId = detail.userId || null;
      if (!subjectUserId || !normalizedExpiryDate || Number(detail.points || 0) <= 0) {
        return;
      }

      const groupKey = `${subjectUserId}:${normalizedExpiryDate}`;
      const current = grouped.get(groupKey) || {
        subjectUserId,
        expiryDate: normalizedExpiryDate,
        points: 0
      };
      current.points += Number(detail.points || 0);
      grouped.set(groupKey, current);
    });

    const createdMessages = [];
    for (const item of grouped.values()) {
      const savedMessages = await messageService.createStarMessages({
        familyId: options.familyId || null,
        action: 'expired',
        subjectUserId: item.subjectUserId,
        operationKey: item.expiryDate,
        points: item.points,
        expiryDate: item.expiryDate,
        expiryDateText: item.expiryDate,
        createTimeOverride: Number(options.modifyTime || Date.now())
      }, connection);
      createdMessages.push(...savedMessages);
    }

    return createdMessages;
  }
}

module.exports = new StarExpiryGovernanceService();
