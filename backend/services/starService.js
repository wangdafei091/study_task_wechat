/**
 * 星星服务
 */

const { createHash, randomBytes } = require('crypto');

const { getPool, query } = require('../config/database');
const StarRecord = require('../models/StarRecord');
const StarGroup = require('../models/StarGroup');
const { createLogger } = require('../utils/logger');

const logger = createLogger('StarService');

class StarService {
  async getStarSummary(userId) {
    const groups = await this.getStarGroupsByUser(userId);
    const totalPoints = groups.reduce((sum, group) => sum + Number(group.stars || 0), 0);

    return {
      userId,
      totalPoints,
      groups,
    };
  }

  async getStarGroupsByUser(userId) {
    const rows = await query(
      `SELECT * FROM star_groups
       WHERE user_id = ?
       ORDER BY CASE WHEN type = 'permanent' THEN 1 ELSE 0 END ASC,
                expiry_date ASC,
                created_at ASC`,
      [userId]
    );
    return rows.map(row => StarGroup.fromDB(row));
  }

  async getStarGroupsByUserWithConnection(connection, userId) {
    const rows = await this._getGroupsByUserConn(connection, userId);
    return rows.map(row => StarGroup.fromDB(row));
  }

  async getStarRecordsByUser(userId) {
    const rows = await query(
      `SELECT * FROM star_records
       WHERE user_id = ? AND deleted_at IS NULL
       ORDER BY modify_time DESC, created_at DESC`,
      [userId]
    );
    return rows.map(row => StarRecord.fromDB(row));
  }

  async getFamilyStarRecords(familyId) {
    const rows = await query(
      `SELECT sr.* FROM star_records sr
       INNER JOIN users u ON sr.user_id = u.user_id
       WHERE u.family_id = ? AND u.status = 'active' AND sr.deleted_at IS NULL
       ORDER BY sr.modify_time DESC, sr.created_at DESC`,
      [familyId]
    );
    return rows.map(row => StarRecord.fromDB(row));
  }

  async upsertStarRecord(userId, recordData) {
    const payload = this._normalizeRecordPayload(userId, recordData);
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const result = await this._upsertStarRecordWithConnection(connection, userId, payload);

      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      logger.error('写入星星流水失败', { userId, error: error.message });
      throw error;
    } finally {
      connection.release();
    }
  }

  async consumeStars(userId, commandData) {
    const payload = this._normalizeConsumePayload(userId, commandData);
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const result = await this.consumeStarsWithConnection(connection, userId, payload, {
        allowPartial: true,
      });

      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      logger.error('执行通用扣星失败', { userId, error: error.message });
      throw error;
    } finally {
      connection.release();
    }
  }

  async consumeStarsWithConnection(connection, userId, commandData, options = {}) {
    const payload = this._normalizeConsumePayload(userId, commandData);
    const allowPartial = options.allowPartial !== false;
    const recordId = this._buildRecordId(options.recordPrefix || 'consume', payload.idempotencyKey);

    const existingRow = await this._getRecordByIdConn(connection, recordId);
    if (existingRow) {
      const existing = StarRecord.fromDB(existingRow);
      const groups = await this._getGroupsByUserConn(connection, userId);
      return this._buildConsumeResponse(existing, groups, true);
    }

    const groups = await this._getGroupsByUserConn(connection, userId);
    const previousBalance = this._sumGroupStars(groups);
    const requestedPoints = payload.requestedPoints;
    const consumedPoints = allowPartial ? Math.min(previousBalance, requestedPoints) : requestedPoints;

    if (!allowPartial && previousBalance < requestedPoints) {
      const error = new Error('星星不足');
      error.code = 'INSUFFICIENT_STARS';
      throw error;
    }

    if (consumedPoints <= 0) {
      return {
        success: false,
        requestedPoints,
        consumedPoints: 0,
        isPartial: true,
        record: null,
        deductionBreakdown: [],
        updatedGroupsSnapshot: groups.map(group => StarGroup.fromDB(group).toJSON()),
      };
    }

    const deductionBreakdown = await this._deductFromGroups(
      connection,
      userId,
      groups,
      consumedPoints,
      payload.modifyTime
    );

    const updatedGroups = await this._getGroupsByUserConn(connection, userId);
    const balance = this._sumGroupStars(updatedGroups);
    const record = new StarRecord({
      recordId,
      userId,
      type: 'expense',
      source: payload.source,
      sourceId: payload.sourceId,
      points: -consumedPoints,
      description: payload.reason,
      expiryType: null,
      expiryDate: null,
      balance,
      previousBalance,
      originalTaskDate: payload.originalTaskDate,
      requestedPoints,
      idempotencyKey: payload.idempotencyKey,
      data: {
        deductionBreakdown,
        sourceType: payload.sourceType,
      },
      modifyTime: payload.modifyTime,
    });

    await this._insertRecordConn(connection, record);

    return {
      success: true,
      requestedPoints,
      consumedPoints,
      isPartial: consumedPoints < requestedPoints,
      record,
      deductionBreakdown,
      updatedGroupsSnapshot: updatedGroups.map(group => StarGroup.fromDB(group).toJSON()),
    };
  }

  async _upsertStarRecordWithConnection(connection, userId, payload) {
    const existingRow = await this._getRecordByIdConn(connection, payload.recordId);
    if (existingRow) {
      const existing = StarRecord.fromDB(existingRow);
      const updatedGroups = await this._getGroupsByUserConn(connection, userId);

      return {
        record: existing,
        updatedGroupsSnapshot: updatedGroups.map(group => StarGroup.fromDB(group).toJSON()),
        idempotent: true,
      };
    }

    const groups = await this._getGroupsByUserConn(connection, userId);
    const previousBalance = this._sumGroupStars(groups);
    const amount = Math.abs(payload.points);

    if (payload.type === 'income') {
      await this._increaseGroupSnapshot(
        connection,
        userId,
        payload.expiryType,
        payload.expiryDate,
        amount,
        payload.modifyTime
      );
    } else {
      const sameTypeGroups = groups.filter(group => group.type === payload.expiryType);
      const totalInType = this._sumGroupStars(sameTypeGroups);
      if (totalInType < amount) {
        const error = new Error('指定有效期类型星星不足');
        error.code = 'INSUFFICIENT_STARS';
        throw error;
      }

      await this._deductFromGroups(
        connection,
        userId,
        sameTypeGroups,
        amount,
        payload.modifyTime
      );
    }

    const updatedGroups = await this._getGroupsByUserConn(connection, userId);
    const balance = this._sumGroupStars(updatedGroups);
    const record = new StarRecord({
      ...payload,
      userId,
      balance,
      previousBalance,
    });

    await this._insertRecordConn(connection, record);

    return {
      record,
      updatedGroupsSnapshot: updatedGroups.map(group => StarGroup.fromDB(group).toJSON()),
      idempotent: false,
    };
  }

  _normalizeRecordPayload(userId, recordData) {
    if (!recordData || !recordData.recordId) {
      const error = new Error('recordId 不能为空');
      error.code = 'INVALID_PARAMS';
      throw error;
    }

    if (!recordData.expiryType) {
      const error = new Error('expiryType 不能为空');
      error.code = 'INVALID_PARAMS';
      throw error;
    }

    const type = recordData.type;
    const points = Number(recordData.points || 0);
    if (!['income', 'expense'].includes(type) || points === 0) {
      const error = new Error('流水类型或积分非法');
      error.code = 'INVALID_PARAMS';
      throw error;
    }

    if (type === 'income' && points <= 0) {
      const error = new Error('收入流水 points 必须大于 0');
      error.code = 'INVALID_PARAMS';
      throw error;
    }

    if (type === 'expense' && points >= 0) {
      const error = new Error('支出流水 points 必须小于 0');
      error.code = 'INVALID_PARAMS';
      throw error;
    }

    return {
      recordId: recordData.recordId,
      userId,
      type,
      source: recordData.source || 'system',
      sourceId: recordData.sourceId || null,
      points,
      description: recordData.description || '',
      expiryType: recordData.expiryType,
      expiryDate: recordData.expiryDate || null,
      originalTaskDate: recordData.originalTaskDate || null,
      requestedPoints: recordData.requestedPoints || null,
      idempotencyKey: recordData.idempotencyKey || null,
      data: recordData.data || null,
      modifyTime: Number(recordData.modifyTime || Date.now()),
    };
  }

  _normalizeConsumePayload(userId, commandData) {
    if (!commandData || Number(commandData.requestedPoints || 0) <= 0) {
      const error = new Error('requestedPoints 必须大于 0');
      error.code = 'INVALID_PARAMS';
      throw error;
    }

    if (!commandData.idempotencyKey) {
      const error = new Error('idempotencyKey 不能为空');
      error.code = 'INVALID_PARAMS';
      throw error;
    }

    return {
      userId,
      requestedPoints: Number(commandData.requestedPoints),
      reason: commandData.reason || '通用扣星',
      sourceType: commandData.sourceType || 'system',
      source: this._mapSource(commandData.sourceType),
      sourceId: commandData.sourceId || null,
      originalTaskDate: commandData.originalTaskDate || null,
      idempotencyKey: commandData.idempotencyKey,
      modifyTime: Number(commandData.modifyTime || Date.now()),
    };
  }

  _mapSource(sourceType) {
    if (!sourceType) return 'system';
    if (sourceType.startsWith('task')) return 'task';
    if (sourceType.startsWith('reward')) return 'reward';
    if (sourceType.startsWith('adjust')) return 'adjustment';
    return 'system';
  }

  _buildRecordId(prefix, seed) {
    const digest = createHash('sha1').update(String(seed)).digest('hex').slice(0, 24);
    return `${prefix}_${digest}`;
  }

  _generateGroupId() {
    return `group_${randomBytes(8).toString('hex')}`;
  }

  async _insertRecordConn(connection, record) {
    const dbData = record.toDB();
    await connection.execute(
      `INSERT INTO star_records (
         record_id, user_id, type, source, source_id, points, description,
         expiry_type, expiry_date, balance, previous_balance,
         original_task_date, requested_points, idempotency_key, data, modify_time
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dbData.record_id,
        dbData.user_id,
        dbData.type,
        dbData.source,
        dbData.source_id,
        dbData.points,
        dbData.description,
        dbData.expiry_type,
        dbData.expiry_date,
        dbData.balance,
        dbData.previous_balance,
        dbData.original_task_date,
        dbData.requested_points,
        dbData.idempotency_key,
        dbData.data,
        dbData.modify_time,
      ]
    );
  }

  async _increaseGroupSnapshot(connection, userId, expiryType, expiryDate, amount, modifyTime) {
    const [rows] = await connection.execute(
      `SELECT * FROM star_groups
       WHERE user_id = ? AND type = ? AND expiry_date <=> ?
       LIMIT 1`,
      [userId, expiryType, expiryDate]
    );

    if (rows.length > 0) {
      const nextStars = Number(rows[0].stars || 0) + amount;
      await connection.execute(
        'UPDATE star_groups SET stars = ?, modify_time = ? WHERE group_id = ?',
        [nextStars, modifyTime, rows[0].group_id]
      );
      return;
    }

    await connection.execute(
      `INSERT INTO star_groups (group_id, user_id, type, stars, expiry_date, modify_time)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [this._generateGroupId(), userId, expiryType, amount, expiryDate, modifyTime]
    );
  }

  async _deductFromGroups(connection, userId, groups, amount, modifyTime) {
    const sortedGroups = this._sortGroupsForDeduction(groups);
    const deductionBreakdown = [];
    let remaining = amount;

    for (const group of sortedGroups) {
      if (remaining <= 0) {
        break;
      }

      const stars = Number(group.stars || 0);
      if (stars <= 0) {
        continue;
      }

      const deductPoints = Math.min(stars, remaining);
      const nextStars = stars - deductPoints;

      if (nextStars > 0) {
        await connection.execute(
          'UPDATE star_groups SET stars = ?, modify_time = ? WHERE group_id = ?',
          [nextStars, modifyTime, group.group_id]
        );
      } else {
        await connection.execute(
          'DELETE FROM star_groups WHERE group_id = ?',
          [group.group_id]
        );
      }

      deductionBreakdown.push({
        groupId: group.group_id,
        expiryType: group.type,
        points: deductPoints,
      });
      remaining -= deductPoints;
    }

    if (remaining > 0) {
      const error = new Error('星星不足');
      error.code = 'INSUFFICIENT_STARS';
      throw error;
    }

    return deductionBreakdown;
  }

  _sortGroupsForDeduction(groups) {
    return [...groups].sort((a, b) => {
      if (a.type === 'permanent' && b.type !== 'permanent') return 1;
      if (a.type !== 'permanent' && b.type === 'permanent') return -1;

      const expiryA = a.expiry_date || '9999-12-31';
      const expiryB = b.expiry_date || '9999-12-31';
      if (expiryA !== expiryB) {
        return expiryA.localeCompare(expiryB);
      }

      return String(a.group_id).localeCompare(String(b.group_id));
    });
  }

  _sumGroupStars(groups) {
    return groups.reduce((sum, group) => sum + Number(group.stars || 0), 0);
  }

  async _getGroupsByUserConn(connection, userId) {
    const [rows] = await connection.execute(
      `SELECT * FROM star_groups
       WHERE user_id = ?
       ORDER BY CASE WHEN type = 'permanent' THEN 1 ELSE 0 END ASC,
                expiry_date ASC,
                created_at ASC`,
      [userId]
    );
    return rows;
  }

  async _getRecordByIdConn(connection, recordId) {
    const [rows] = await connection.execute(
      'SELECT * FROM star_records WHERE record_id = ? AND deleted_at IS NULL LIMIT 1',
      [recordId]
    );
    return rows[0] || null;
  }

  _buildConsumeResponse(existingRecord, groupRows, idempotent = false) {
    const deductionBreakdown = existingRecord.data?.deductionBreakdown || [];
    const requestedPoints = existingRecord.requestedPoints || Math.abs(existingRecord.points);
    const consumedPoints = Math.abs(existingRecord.points);

    return {
      success: consumedPoints > 0,
      requestedPoints,
      consumedPoints,
      isPartial: consumedPoints < requestedPoints,
      record: existingRecord,
      deductionBreakdown,
      updatedGroupsSnapshot: groupRows.map(group => StarGroup.fromDB(group).toJSON()),
      idempotent,
    };
  }
}

module.exports = new StarService();
