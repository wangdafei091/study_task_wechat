/**
 * 星星服务
 */

const { createHash, randomBytes } = require('crypto');

const { getPool, query } = require('../config/database');
const StarRecord = require('../models/StarRecord');
const StarGroup = require('../models/StarGroup');
const { createLogger } = require('../utils/logger');
const messageService = require('./messageService');

const logger = createLogger('StarService');
const STAR_EXPIRING_REMINDER_WINDOW_DAYS = 3;

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
    return this._filterActiveGroupRows(rows).map(row => StarGroup.fromDB(row));
  }

  async getStarGroupsByUserWithConnection(connection, userId) {
    const rows = await this._getGroupsByUserConn(connection, userId);
    return rows.map(row => StarGroup.fromDB(row));
  }

  async getExpiringProtectionSummary(userId, options = {}) {
    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      return await this.getExpiringProtectionSummaryWithConnection(connection, userId, options);
    } finally {
      connection.release();
    }
  }

  async settleExpiredGroupsWithConnection(connection, userId, options = {}) {
    const modifyTime = Number(options.modifyTime || Date.now());
    const allRows = await this._getAllGroupsByUserConn(connection, userId, { forUpdate: true });
    const expiredRows = [];
    let invalidGroups = 0;

    allRows.forEach((row) => {
      const type = String(row.type || '').trim();
      if (type === 'permanent') {
        return;
      }

      const normalizedExpiryDate = this._normalizeExpiryDate(row);
      if (!normalizedExpiryDate) {
        invalidGroups += 1;
        return;
      }

      if (normalizedExpiryDate >= this._getDateStringForTimestamp(modifyTime)) {
        return;
      }

      expiredRows.push({
        ...row,
        normalizedExpiryDate,
      });
    });

    expiredRows.sort((a, b) => {
      if (a.normalizedExpiryDate !== b.normalizedExpiryDate) {
        return a.normalizedExpiryDate.localeCompare(b.normalizedExpiryDate);
      }
      return String(a.group_id).localeCompare(String(b.group_id));
    });

    let runningBalance = this._sumGroupStars(allRows);
    let settledGroups = 0;
    let settledPoints = 0;
    let createdRecords = 0;

    for (const row of expiredRows) {
      const groupPoints = Number(row.stars || 0);
      await connection.execute('DELETE FROM star_groups WHERE group_id = ?', [row.group_id]);

      if (groupPoints <= 0) {
        continue;
      }

      const idempotencyKey = this._buildExpirySettlementIdempotencyKey(
        userId,
        row.group_id,
        row.normalizedExpiryDate
      );
      const nextBalance = runningBalance - groupPoints;
      const record = new StarRecord({
        recordId: this._buildRecordId('star_expiry', idempotencyKey),
        userId,
        type: 'expense',
        source: 'system',
        sourceId: row.group_id,
        points: -groupPoints,
        description: '星星到期结算',
        expiryType: row.type || null,
        expiryDate: row.expiry_date || null,
        balance: nextBalance,
        previousBalance: runningBalance,
        requestedPoints: groupPoints,
        idempotencyKey,
        data: {
          sourceType: 'star_expiry_settlement',
          groupId: row.group_id,
          normalizedExpiryDate: row.normalizedExpiryDate,
          settledAt: modifyTime,
        },
        modifyTime,
      });

      await this._insertRecordConn(connection, record);
      runningBalance = nextBalance;
      settledGroups += 1;
      settledPoints += groupPoints;
      createdRecords += 1;
    }

    return {
      settledGroups,
      settledPoints,
      createdRecords,
      invalidGroups,
    };
  }

  async getExpiringProtectionSummaryWithConnection(connection, userId, options = {}) {
    const nowTimestamp = Number(options.nowTimestamp || Date.now());
    const rows = await this._getAllGroupsByUserConn(connection, userId);
    const expiringGroups = rows.filter((row) => this._isProtectionWindowGroup(row, nowTimestamp));
    const pendingPoints = expiringGroups.reduce((sum, row) => sum + Number(row.stars || 0), 0);

    return {
      pendingPoints,
      groups: expiringGroups,
    };
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

  async syncExpiringStarMessages(options = {}) {
    const scanUserIds = await this._resolveReminderScanUserIds(options);
    if (scanUserIds.length === 0) {
      return {
        success: true,
        createdCount: 0,
        updatedCount: 0,
        dedupedCount: 0,
        archivedCount: 0,
        activeCount: 0,
        affectedUserIds: [],
      };
    }

    const now = Number(options.modifyTime || Date.now());
    const candidates = await this._buildExpiringStarReminderCandidates(scanUserIds, now);
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const existingMessages = await this._getActiveStarReminderMessagesBySubjectConn(connection, scanUserIds);
      const existingCompositeKeys = new Set(
        existingMessages.map(message => this._buildReminderMessageCompositeKey(message))
      );
      const activeCompositeKeys = new Set();
      const affectedUserIds = new Set();

      for (const candidate of candidates) {
        const savedMessages = await messageService.createStarMessages({
          familyId: options.familyId || null,
          action: 'expiring',
          subjectUserId: candidate.subjectUserId,
          operationKey: candidate.expiryDate,
          points: candidate.points,
          expiryDate: candidate.expiryDate,
          expiryDateText: candidate.expiryDateText,
          daysUntilExpiry: candidate.daysUntilExpiry,
          createTimeOverride: now,
        }, connection);

        savedMessages.forEach((message) => {
          activeCompositeKeys.add(this._buildReminderMessageCompositeKey(message));
          if (message.subjectUserId) {
            affectedUserIds.add(message.subjectUserId);
          }
        });
      }

      const staleMessageIds = existingMessages
        .filter(message => !activeCompositeKeys.has(this._buildReminderMessageCompositeKey(message)))
        .map(message => message.messageId || message.message_id)
        .filter(Boolean);

      if (staleMessageIds.length > 0) {
        const placeholders = staleMessageIds.map(() => '?').join(', ');
        await connection.execute(
          `UPDATE messages
           SET is_archived = 1
           WHERE message_id IN (${placeholders})
             AND deleted_at IS NULL`,
          staleMessageIds
        );
      }

      await connection.commit();

      let createdCount = 0;
      let dedupedCount = 0;
      activeCompositeKeys.forEach((key) => {
        if (existingCompositeKeys.has(key)) {
          dedupedCount += 1;
        } else {
          createdCount += 1;
        }
      });

      return {
        success: true,
        createdCount,
        updatedCount: dedupedCount,
        dedupedCount,
        archivedCount: staleMessageIds.length,
        activeCount: activeCompositeKeys.size,
        affectedUserIds: Array.from(affectedUserIds),
      };
    } catch (error) {
      await connection.rollback();
      logger.error('同步星星即将过期提醒失败', { error: error.message });
      throw error;
    } finally {
      connection.release();
    }
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
    const rows = await this._getAllGroupsByUserConn(connection, userId);
    return this._filterActiveGroupRows(rows);
  }

  async _getAllGroupsByUserConn(connection, userId, options = {}) {
    const lockClause = options.forUpdate === true ? ' FOR UPDATE' : '';
    const [rows] = await connection.execute(
      `SELECT * FROM star_groups
       WHERE user_id = ?
       ORDER BY CASE WHEN type = 'permanent' THEN 1 ELSE 0 END ASC,
                expiry_date ASC,
                created_at ASC${lockClause}`,
      [userId]
    );
    return rows;
  }

  _filterActiveGroupRows(rows = []) {
    return rows.filter(row => this._isActiveGroupRow(row));
  }

  _isActiveGroupRow(row) {
    if (!row) {
      return false;
    }

    const type = String(row.type || '').trim();
    if (type === 'permanent') {
      return true;
    }

    const normalizedExpiryDate = this._normalizeExpiryDate(row);
    if (!normalizedExpiryDate) {
      return false;
    }

    return normalizedExpiryDate >= this._getTodayDateString();
  }

  _normalizeExpiryDate(rowOrExpiryDate) {
    const row = rowOrExpiryDate && typeof rowOrExpiryDate === 'object'
      ? rowOrExpiryDate
      : { expiry_date: rowOrExpiryDate };
    const expiryDate = row.expiry_date;
    if (expiryDate === null || expiryDate === undefined) {
      return null;
    }

    const trimmed = String(expiryDate).trim();
    if (!trimmed || trimmed === '永久') {
      return null;
    }

    const anchorDate = this._resolveExpiryAnchorDate(row) || new Date();
    if (trimmed === '今天到期' || trimmed === '今天') {
      return this._formatDateString(anchorDate);
    }

    if (trimmed === '明天到期' || trimmed === '明天') {
      const tomorrow = new Date(anchorDate.getTime());
      tomorrow.setDate(tomorrow.getDate() + 1);
      return this._formatDateString(tomorrow);
    }

    const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s*到期)?$/);
    if (!dateOnlyMatch) {
      return null;
    }

    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return null;
    }

    const parsedDate = new Date(year, month - 1, day);
    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.getFullYear() !== year ||
      parsedDate.getMonth() !== month - 1 ||
      parsedDate.getDate() !== day
    ) {
      return null;
    }

    return this._formatDateString(parsedDate);
  }

  _getTodayDateString() {
    return this._formatDateString(new Date());
  }

  _getDateStringForTimestamp(timestamp) {
    return this._formatDateString(new Date(timestamp));
  }

  _buildEndOfDayTimestamp(normalizedDate) {
    const parsed = new Date(`${normalizedDate}T23:59:59.999Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }

    const [year, month, day] = String(normalizedDate).split('-').map(Number);
    return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
  }

  _isProtectionWindowGroup(row, nowTimestamp = Date.now()) {
    if (!this._isActiveGroupRow(row)) {
      return false;
    }

    const type = String(row.type || '').trim();
    if (type === 'permanent') {
      return false;
    }

    const normalizedExpiryDate = this._normalizeExpiryDate(row);
    if (!normalizedExpiryDate) {
      return false;
    }

    const expiryTimestamp = this._buildEndOfDayTimestamp(normalizedExpiryDate);
    const windowEnd = nowTimestamp + (48 * 60 * 60 * 1000);
    return expiryTimestamp > nowTimestamp && expiryTimestamp <= windowEnd;
  }

  _buildExpirySettlementIdempotencyKey(userId, groupId, normalizedExpiryDate) {
    return `star_expiry:${userId}:${groupId}:${normalizedExpiryDate}`;
  }

  _resolveExpiryAnchorDate(row) {
    if (!row || typeof row !== 'object') {
      return null;
    }

    const candidates = [row.modify_time, row.updated_at, row.created_at];
    for (const candidate of candidates) {
      const parsed = this._parseDateCandidate(candidate);
      if (parsed) {
        return parsed;
      }
    }
    return null;
  }

  _parseDateCandidate(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'number') {
      const parsedFromNumber = new Date(value);
      return Number.isNaN(parsedFromNumber.getTime()) ? null : parsedFromNumber;
    }

    const trimmed = String(value).trim();
    if (!trimmed) {
      return null;
    }

    if (/^\d+$/.test(trimmed)) {
      const parsedFromTimestamp = new Date(Number(trimmed));
      return Number.isNaN(parsedFromTimestamp.getTime()) ? null : parsedFromTimestamp;
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  _formatDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async _resolveReminderScanUserIds(options = {}) {
    const { viewerUserId, viewerRole, familyId, scope = null, targetUserId = null } = options;

    if (!viewerUserId) {
      return [];
    }

    if (scope === 'user') {
      return [targetUserId || viewerUserId];
    }

    if (viewerRole === 'parent' && familyId) {
      const members = await query(
        `SELECT user_id
         FROM users
         WHERE family_id = ?
           AND role = 'child'
           AND status = 'active'`,
        [familyId]
      );
      return members.map(row => row.user_id);
    }

    return [viewerUserId];
  }

  async _buildExpiringStarReminderCandidates(userIds = [], nowTimestamp = Date.now()) {
    const groupsByUser = await this._getExpiringReminderGroupsByUser(userIds, nowTimestamp);
    const candidates = [];

    groupsByUser.forEach((groups, subjectUserId) => {
      if (!Array.isArray(groups) || groups.length === 0) {
        return;
      }

      const sortedGroups = [...groups].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
      const nearestExpiryDate = sortedGroups[0].expiryDate;
      const nearestGroups = sortedGroups.filter(group => group.expiryDate === nearestExpiryDate);
      const totalPoints = nearestGroups.reduce((sum, group) => sum + Number(group.stars || 0), 0);
      if (totalPoints <= 0) {
        return;
      }

      candidates.push({
        subjectUserId,
        expiryDate: nearestExpiryDate,
        expiryDateText: this._formatExpiryDateText(nearestExpiryDate, nowTimestamp),
        daysUntilExpiry: this._diffDaysFromToday(nearestExpiryDate, nowTimestamp),
        points: totalPoints,
      });
    });

    return candidates;
  }

  async _getExpiringReminderGroupsByUser(userIds = [], nowTimestamp = Date.now()) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return new Map();
    }

    const placeholders = userIds.map(() => '?').join(', ');
    const rows = await query(
      `SELECT *
       FROM star_groups
       WHERE user_id IN (${placeholders})
         AND type <> 'permanent'
       ORDER BY expiry_date ASC, created_at ASC`,
      userIds
    );

    const groupsByUser = new Map();
    rows.forEach((row) => {
      if (!this._isGroupWithinReminderWindow(row, nowTimestamp)) {
        return;
      }

      const normalizedExpiryDate = this._normalizeExpiryDate(row);
      if (!normalizedExpiryDate) {
        return;
      }

      const bucket = groupsByUser.get(row.user_id) || [];
      bucket.push({
        groupId: row.group_id,
        userId: row.user_id,
        stars: Number(row.stars || 0),
        expiryDate: normalizedExpiryDate,
      });
      groupsByUser.set(row.user_id, bucket);
    });

    return groupsByUser;
  }

  _isGroupWithinReminderWindow(row, nowTimestamp = Date.now()) {
    if (!this._isActiveGroupRow(row)) {
      return false;
    }

    const normalizedExpiryDate = this._normalizeExpiryDate(row);
    if (!normalizedExpiryDate) {
      return false;
    }

    const diffDays = this._diffDaysFromToday(normalizedExpiryDate, nowTimestamp);
    return diffDays >= 0 && diffDays < STAR_EXPIRING_REMINDER_WINDOW_DAYS;
  }

  _diffDaysFromToday(expiryDate, nowTimestamp = Date.now()) {
    const today = new Date(nowTimestamp);
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const target = new Date(`${expiryDate}T00:00:00`);
    if (Number.isNaN(target.getTime())) {
      return Number.POSITIVE_INFINITY;
    }

    return Math.round((target.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000));
  }

  _formatExpiryDateText(expiryDate, nowTimestamp = Date.now()) {
    const diffDays = this._diffDaysFromToday(expiryDate, nowTimestamp);
    if (diffDays === 0) {
      return '今天';
    }
    if (diffDays === 1) {
      return '明天';
    }
    return expiryDate;
  }

  async _getActiveStarReminderMessagesBySubjectConn(connection, subjectUserIds = []) {
    if (!Array.isArray(subjectUserIds) || subjectUserIds.length === 0) {
      return [];
    }

    const placeholders = subjectUserIds.map(() => '?').join(', ');
    const [rows] = await connection.execute(
      `SELECT *
       FROM messages
       WHERE deleted_at IS NULL
         AND is_archived = 0
         AND notification_type = 'star_expiring'
         AND subject_user_id IN (${placeholders})`,
      subjectUserIds
    );

    return rows;
  }

  _buildReminderMessageCompositeKey(message) {
    return `${message.visibilityScope || message.visibility_scope}:${message.messageEventKey || message.message_event_key}`;
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
