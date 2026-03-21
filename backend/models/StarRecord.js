/**
 * 星星流水模型
 */

class StarRecord {
  constructor({
    recordId,
    userId,
    type,
    source,
    sourceId = null,
    points = 0,
    description = '',
    expiryType = null,
    expiryDate = null,
    balance = 0,
    previousBalance = 0,
    originalTaskDate = null,
    requestedPoints = null,
    idempotencyKey = null,
    data = null,
    modifyTime = null,
    createdAt = null,
    deletedAt = null,
  } = {}) {
    this.recordId = recordId;
    this.userId = userId;
    this.type = type;
    this.source = source;
    this.sourceId = sourceId;
    this.points = Number(points || 0);
    this.description = description || '';
    this.expiryType = expiryType || null;
    this.expiryDate = expiryDate || null;
    this.balance = Number(balance || 0);
    this.previousBalance = Number(previousBalance || 0);
    this.originalTaskDate = originalTaskDate || null;
    this.requestedPoints = requestedPoints === null || requestedPoints === undefined
      ? null
      : Number(requestedPoints);
    this.idempotencyKey = idempotencyKey || null;
    this.data = data || null;
    this.modifyTime = modifyTime || null;
    this.createdAt = createdAt || null;
    this.deletedAt = deletedAt || null;
  }

  static fromDB(record) {
    let parsedData = null;
    if (record.data) {
      try {
        parsedData = typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
      } catch (error) {
        parsedData = null;
      }
    }

    return new StarRecord({
      recordId: record.record_id,
      userId: record.user_id,
      type: record.type,
      source: record.source,
      sourceId: record.source_id || null,
      points: record.points,
      description: record.description || '',
      expiryType: record.expiry_type || null,
      expiryDate: record.expiry_date || null,
      balance: record.balance || 0,
      previousBalance: record.previous_balance || 0,
      originalTaskDate: record.original_task_date || null,
      requestedPoints: record.requested_points,
      idempotencyKey: record.idempotency_key || null,
      data: parsedData,
      modifyTime: record.modify_time || null,
      createdAt: record.created_at || null,
      deletedAt: record.deleted_at || null,
    });
  }

  toDB() {
    return {
      record_id: this.recordId,
      user_id: this.userId,
      type: this.type,
      source: this.source,
      source_id: this.sourceId,
      points: this.points,
      description: this.description,
      expiry_type: this.expiryType,
      expiry_date: this.expiryDate,
      balance: this.balance,
      previous_balance: this.previousBalance,
      original_task_date: this.originalTaskDate,
      requested_points: this.requestedPoints,
      idempotency_key: this.idempotencyKey,
      data: this.data ? JSON.stringify(this.data) : null,
      modify_time: this.modifyTime,
    };
  }

  toJSON() {
    return {
      recordId: this.recordId,
      userId: this.userId,
      type: this.type,
      source: this.source,
      sourceId: this.sourceId,
      points: this.points,
      description: this.description,
      expiryType: this.expiryType,
      expiryDate: this.expiryDate,
      balance: this.balance,
      previousBalance: this.previousBalance,
      originalTaskDate: this.originalTaskDate,
      requestedPoints: this.requestedPoints,
      idempotencyKey: this.idempotencyKey,
      data: this.data,
      modifyTime: this.modifyTime,
      createdAt: this.createdAt,
    };
  }
}

module.exports = StarRecord;
