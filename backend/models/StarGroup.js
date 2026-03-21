/**
 * 星星分组快照模型
 */

class StarGroup {
  constructor({
    groupId,
    userId,
    type = 'permanent',
    stars = 0,
    expiryDate = null,
    modifyTime = null,
    createdAt = null,
    updatedAt = null,
  } = {}) {
    this.groupId = groupId;
    this.userId = userId;
    this.type = type;
    this.stars = Number(stars || 0);
    this.expiryDate = expiryDate || null;
    this.modifyTime = modifyTime || null;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static fromDB(record) {
    return new StarGroup({
      groupId: record.group_id,
      userId: record.user_id,
      type: record.type,
      stars: record.stars,
      expiryDate: record.expiry_date || null,
      modifyTime: record.modify_time || null,
      createdAt: record.created_at || null,
      updatedAt: record.updated_at || null,
    });
  }

  toDB() {
    return {
      group_id: this.groupId,
      user_id: this.userId,
      type: this.type,
      stars: this.stars,
      expiry_date: this.expiryDate,
      modify_time: this.modifyTime,
    };
  }

  toJSON() {
    return {
      groupId: this.groupId,
      userId: this.userId,
      type: this.type,
      expiryType: this.type,
      stars: this.stars,
      expiryDate: this.expiryDate,
      modifyTime: this.modifyTime,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

module.exports = StarGroup;
