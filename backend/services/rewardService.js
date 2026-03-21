/**
 * 奖励服务
 */

const { randomBytes } = require('crypto');

const { getPool, query, execute } = require('../config/database');
const Reward = require('../models/Reward');
const { createLogger } = require('../utils/logger');
const starService = require('./starService');

const logger = createLogger('RewardService');

class RewardService {
  canUserAccessReward(reward, viewer = {}) {
    if (!reward) {
      return false;
    }

    if (reward.familyId) {
      return Boolean(viewer.familyId) && reward.familyId === viewer.familyId;
    }

    return reward.userId === viewer.userId;
  }

  async getVisibleRewards({ familyId, userId }) {
    if (familyId) {
      await this._promoteLegacyRewardsForFamily(familyId);
    }

    const sql = familyId
      ? `SELECT * FROM rewards
         WHERE family_id = ? AND deleted_at IS NULL
         ORDER BY modify_time DESC, created_at DESC`
      : `SELECT * FROM rewards
         WHERE user_id = ? AND deleted_at IS NULL
         ORDER BY modify_time DESC, created_at DESC`;
    const params = [familyId || userId];
    const rows = await query(sql, params);
    return rows.map(row => Reward.fromDB(row));
  }

  async getRewardById(rewardId) {
    const rows = await query(
      'SELECT * FROM rewards WHERE reward_id = ? AND deleted_at IS NULL LIMIT 1',
      [rewardId]
    );
    if (rows.length === 0) {
      return null;
    }

    return this._promoteLegacyRewardIfNeeded(Reward.fromDB(rows[0]));
  }

  async createReward(ownerUserId, familyId, rewardData) {
    const payload = this._normalizeRewardPayload(ownerUserId, familyId, rewardData);
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const existingRow = await this._getRewardByIdConn(connection, payload.rewardId, true);
      if (existingRow) {
        if (existingRow.user_id !== ownerUserId) {
          const error = new Error('rewardId 已被其他用户使用');
          error.code = 'REWARD_ID_USER_MISMATCH';
          throw error;
        }

        if (!existingRow.deleted_at) {
          await connection.commit();
          return Reward.fromDB(existingRow);
        }

        await connection.execute(
          `UPDATE rewards SET
             family_id = ?, name = ?, description = ?, type = ?, points = ?, icon = ?,
             enabled = ?, claimed = ?, claim_time = ?, claim_status = ?, delivery_time = ?,
             exchange_user_id = ?, is_example = ?, tags = ?, notes = ?,
             protected_by_expiry = ?, partial_protection = ?, modify_time = ?, deleted_at = NULL
           WHERE reward_id = ?`,
          [
            payload.familyId,
            payload.name,
            payload.description,
            payload.type,
            payload.points,
            payload.icon,
            payload.enabled ? 1 : 0,
            payload.claimed ? 1 : 0,
            payload.claimTime,
            payload.claimStatus,
            payload.deliveryTime,
            payload.exchangeUserId,
            payload.isExample ? 1 : 0,
            JSON.stringify(payload.tags || []),
            payload.notes,
            payload.protectedByExpiry ? 1 : 0,
            payload.partialProtection,
            payload.modifyTime,
            payload.rewardId,
          ]
        );

        const restoredRow = await this._getRewardByIdConn(connection, payload.rewardId);
        await connection.commit();
        return Reward.fromDB(restoredRow);
      }

      await connection.execute(
        `INSERT INTO rewards (
           reward_id, user_id, family_id, name, description, type, points, icon,
           enabled, claimed, claim_time, claim_status, delivery_time, exchange_user_id,
           is_example, tags, notes, protected_by_expiry, partial_protection, modify_time
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.rewardId,
          payload.userId,
          payload.familyId,
          payload.name,
          payload.description,
          payload.type,
          payload.points,
          payload.icon,
          payload.enabled ? 1 : 0,
          payload.claimed ? 1 : 0,
          payload.claimTime,
          payload.claimStatus,
          payload.deliveryTime,
          payload.exchangeUserId,
          payload.isExample ? 1 : 0,
          JSON.stringify(payload.tags || []),
          payload.notes,
          payload.protectedByExpiry ? 1 : 0,
          payload.partialProtection,
          payload.modifyTime,
        ]
      );

      await connection.commit();
      return new Reward(payload);
    } catch (error) {
      await connection.rollback();
      logger.error('创建奖励失败', { ownerUserId, error: error.message });
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateReward(rewardId, operatorUserId, rewardData) {
    const existing = await this.getRewardById(rewardId);
    if (!existing) {
      const error = new Error('奖励不存在');
      error.code = 'REWARD_NOT_FOUND';
      throw error;
    }

    if (existing.userId !== operatorUserId) {
      const error = new Error('无权限更新奖励');
      error.code = 'PERMISSION_DENIED';
      throw error;
    }

    const allowedFields = [
      'name',
      'description',
      'type',
      'points',
      'icon',
      'enabled',
      'isExample',
      'tags',
      'notes',
      'protectedByExpiry',
      'partialProtection',
    ];

    const nextReward = new Reward({
      ...existing.toJSON(),
      rewardId: existing.rewardId,
      ...rewardData,
      userId: existing.userId,
      familyId: existing.familyId,
      modifyTime: Number(rewardData.modifyTime || Date.now()),
    });

    const fields = [];
    const params = [];
    allowedFields.forEach(field => {
      if (rewardData[field] === undefined) {
        return;
      }

      switch (field) {
        case 'isExample':
          fields.push('is_example = ?');
          params.push(nextReward.isExample ? 1 : 0);
          break;
        case 'protectedByExpiry':
          fields.push('protected_by_expiry = ?');
          params.push(nextReward.protectedByExpiry ? 1 : 0);
          break;
        case 'partialProtection':
          fields.push('partial_protection = ?');
          params.push(nextReward.partialProtection);
          break;
        case 'tags':
          fields.push('tags = ?');
          params.push(JSON.stringify(nextReward.tags || []));
          break;
        default:
          fields.push(`${this._toSnakeCase(field)} = ?`);
          params.push(nextReward[field]);
      }
    });

    if (fields.length === 0) {
      return existing;
    }

    fields.push('modify_time = ?');
    params.push(nextReward.modifyTime);
    params.push(rewardId);

    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE rewards SET ${fields.join(', ')} WHERE reward_id = ? AND deleted_at IS NULL`,
        params
      );
      const updatedRow = await this._getRewardByIdConn(connection, rewardId);
      await connection.commit();
      return Reward.fromDB(updatedRow);
    } catch (error) {
      await connection.rollback();
      logger.error('更新奖励失败', { rewardId, error: error.message });
      throw error;
    } finally {
      connection.release();
    }
  }

  async deleteReward(rewardId, operatorUserId) {
    const existing = await this.getRewardById(rewardId);
    if (!existing) {
      const error = new Error('奖励不存在');
      error.code = 'REWARD_NOT_FOUND';
      throw error;
    }

    if (existing.userId !== operatorUserId) {
      const error = new Error('无权限删除奖励');
      error.code = 'PERMISSION_DENIED';
      throw error;
    }

    const result = await execute(
      'UPDATE rewards SET deleted_at = NOW(), modify_time = ? WHERE reward_id = ? AND deleted_at IS NULL',
      [Date.now(), rewardId]
    );
    return result;
  }

  async exchangeReward(rewardId, exchangeUserId, modifyTime) {
    const commandModifyTime = Number(modifyTime || Date.now());
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const rewardRow = await this._getRewardByIdConn(connection, rewardId);
      if (!rewardRow) {
        const error = new Error('奖励不存在');
        error.code = 'REWARD_NOT_FOUND';
        throw error;
      }

      const reward = Reward.fromDB(rewardRow);
      if (!reward.enabled) {
        const error = new Error('奖励已禁用');
        error.code = 'REWARD_DISABLED';
        throw error;
      }

      if (reward.claimed) {
        if (reward.modifyTime === commandModifyTime && reward.exchangeUserId === exchangeUserId) {
          const existingRecord = await this._findExchangeRecordConn(connection, rewardId, exchangeUserId, commandModifyTime);
          const groups = await starService.getStarGroupsByUserWithConnection(connection, exchangeUserId);
          await connection.commit();
          return {
            reward,
            record: existingRecord,
            consumedPoints: existingRecord ? Math.abs(existingRecord.points) : 0,
            deductionBreakdown: existingRecord?.data?.deductionBreakdown || [],
            updatedGroupsSnapshot: groups.map(group => group.toJSON()),
            idempotent: true,
          };
        }

        const error = new Error('奖励已兑换');
        error.code = 'REWARD_ALREADY_EXCHANGED';
        throw error;
      }

      const actualCost = reward.protectedByExpiry
        ? Math.max(0, reward.points - reward.partialProtection)
        : reward.points;

      let consumeResult = {
        success: true,
        consumedPoints: 0,
        deductionBreakdown: [],
        updatedGroupsSnapshot: await starService.getStarGroupsByUserWithConnection(connection, exchangeUserId),
        record: null,
      };

      if (actualCost > 0) {
        consumeResult = await starService.consumeStarsWithConnection(
          connection,
          exchangeUserId,
          {
            requestedPoints: actualCost,
            reason: `兑换奖励: ${reward.name}`,
            sourceType: 'reward_exchange',
            sourceId: rewardId,
            idempotencyKey: `reward_exchange:${rewardId}:${exchangeUserId}:${commandModifyTime}`,
            modifyTime: commandModifyTime,
          },
          {
            allowPartial: false,
            recordPrefix: 'reward_exchange',
          }
        );
      }

      await connection.execute(
        `UPDATE rewards SET
           claimed = 1,
           claim_time = ?,
           claim_status = 'delivered',
           delivery_time = ?,
           exchange_user_id = ?,
           modify_time = ?
         WHERE reward_id = ? AND deleted_at IS NULL`,
        [commandModifyTime, commandModifyTime, exchangeUserId, commandModifyTime, rewardId]
      );

      const updatedRewardRow = await this._getRewardByIdConn(connection, rewardId);
      await connection.commit();

      return {
        reward: Reward.fromDB(updatedRewardRow),
        record: consumeResult.record,
        consumedPoints: consumeResult.consumedPoints || 0,
        deductionBreakdown: consumeResult.deductionBreakdown || [],
        updatedGroupsSnapshot: (consumeResult.updatedGroupsSnapshot || []).map(group =>
          group.toJSON ? group.toJSON() : group
        ),
        idempotent: false,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('兑换奖励失败', { rewardId, exchangeUserId, error: error.message });
      throw error;
    } finally {
      connection.release();
    }
  }

  _normalizeRewardPayload(ownerUserId, familyId, rewardData) {
    if (!rewardData || !rewardData.name || Number(rewardData.points || 0) <= 0) {
      const error = new Error('奖励名称和积分不能为空');
      error.code = 'INVALID_PARAMS';
      throw error;
    }

    return {
      rewardId: rewardData.rewardId || rewardData.id || `reward_${randomBytes(8).toString('hex')}`,
      userId: ownerUserId,
      familyId: familyId || null,
      name: rewardData.name,
      description: rewardData.description || '',
      type: rewardData.type || 'item',
      points: Number(rewardData.points),
      icon: rewardData.icon || '🎁',
      enabled: rewardData.enabled !== false,
      claimed: Boolean(rewardData.claimed),
      claimTime: rewardData.claimTime || null,
      claimStatus: rewardData.claimStatus || (rewardData.claimed ? 'delivered' : 'available'),
      deliveryTime: rewardData.deliveryTime || null,
      exchangeUserId: rewardData.exchangeUserId || null,
      isExample: Boolean(rewardData.isExample),
      tags: Array.isArray(rewardData.tags) ? rewardData.tags : [],
      notes: rewardData.notes || '',
      protectedByExpiry: Boolean(rewardData.protectedByExpiry),
      partialProtection: Number(rewardData.partialProtection || 0),
      modifyTime: Number(rewardData.modifyTime || Date.now()),
    };
  }

  async _getRewardByIdConn(connection, rewardId, includeDeleted = false) {
    const sql = includeDeleted
      ? 'SELECT * FROM rewards WHERE reward_id = ? LIMIT 1'
      : 'SELECT * FROM rewards WHERE reward_id = ? AND deleted_at IS NULL LIMIT 1';
    const [rows] = await connection.execute(sql, [rewardId]);
    return rows[0] || null;
  }

  async _findExchangeRecordConn(connection, rewardId, exchangeUserId, modifyTime) {
    const [rows] = await connection.execute(
      `SELECT * FROM star_records
       WHERE source = 'reward' AND source_id = ? AND user_id = ? AND modify_time = ? AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [rewardId, exchangeUserId, modifyTime]
    );
    return rows.length > 0 ? require('../models/StarRecord').fromDB(rows[0]) : null;
  }

  _toSnakeCase(field) {
    return field.replace(/[A-Z]/g, match => `_${match.toLowerCase()}`);
  }

  async _promoteLegacyRewardsForFamily(familyId) {
    if (!familyId) {
      return 0;
    }

    const modifyTime = Date.now();
    const result = await execute(
      `UPDATE rewards r
       INNER JOIN users u ON u.user_id = r.user_id
       SET r.family_id = ?, r.modify_time = ?
       WHERE r.family_id IS NULL
         AND r.deleted_at IS NULL
         AND u.family_id = ?
         AND u.role = 'parent'
         AND u.status = 'active'`,
      [familyId, modifyTime, familyId]
    );

    const migratedCount = result?.affectedRows || 0;
    if (migratedCount > 0) {
      logger.info('已迁移家庭历史奖励到 family_id 维度', { familyId, migratedCount });
    }

    return migratedCount;
  }

  async _promoteLegacyRewardIfNeeded(reward) {
    if (!reward || reward.familyId || !reward.userId) {
      return reward;
    }

    const ownerRows = await query(
      `SELECT family_id, role
       FROM users
       WHERE user_id = ? AND status = 'active'
       LIMIT 1`,
      [reward.userId]
    );
    const owner = ownerRows[0];

    if (!owner || !owner.family_id || owner.role !== 'parent') {
      return reward;
    }

    const modifyTime = Date.now();
    await execute(
      `UPDATE rewards
       SET family_id = ?, modify_time = ?
       WHERE reward_id = ?
         AND family_id IS NULL
         AND deleted_at IS NULL`,
      [owner.family_id, modifyTime, reward.rewardId]
    );

    const refreshedRows = await query(
      'SELECT * FROM rewards WHERE reward_id = ? AND deleted_at IS NULL LIMIT 1',
      [reward.rewardId]
    );

    if (refreshedRows.length > 0) {
      logger.info('已按奖励归属家长补齐 family_id', {
        rewardId: reward.rewardId,
        familyId: owner.family_id
      });
      return Reward.fromDB(refreshedRows[0]);
    }

    return reward;
  }
}

module.exports = new RewardService();
