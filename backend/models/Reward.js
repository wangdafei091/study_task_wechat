/**
 * 奖励模型
 */

class Reward {
  constructor({
    rewardId,
    userId,
    familyId = null,
    name,
    description = '',
    type = 'item',
    points = 0,
    icon = '🎁',
    enabled = true,
    claimed = false,
    claimTime = null,
    claimStatus = null,
    deliveryTime = null,
    exchangeUserId = null,
    isExample = false,
    tags = [],
    notes = '',
    protectedByExpiry = false,
    partialProtection = 0,
    modifyTime = null,
    createdAt = null,
    updatedAt = null,
    deletedAt = null,
  } = {}) {
    this.rewardId = rewardId;
    this.userId = userId;
    this.familyId = familyId || null;
    this.name = name;
    this.description = description || '';
    this.type = type || 'item';
    this.points = Number(points || 0);
    this.icon = icon || '🎁';
    this.enabled = Boolean(enabled);
    this.claimed = Boolean(claimed);
    this.claimTime = claimTime || null;
    this.claimStatus = claimStatus || (this.claimed ? 'claimed' : 'available');
    this.deliveryTime = deliveryTime || null;
    this.exchangeUserId = exchangeUserId || null;
    this.isExample = Boolean(isExample);
    this.tags = Array.isArray(tags) ? tags : [];
    this.notes = notes || '';
    this.protectedByExpiry = Boolean(protectedByExpiry);
    this.partialProtection = Number(partialProtection || 0);
    this.modifyTime = modifyTime || null;
    this.createdAt = createdAt || null;
    this.updatedAt = updatedAt || null;
    this.deletedAt = deletedAt || null;
  }

  static fromDB(record) {
    let tags = [];
    if (record.tags) {
      try {
        tags = typeof record.tags === 'string' ? JSON.parse(record.tags) : record.tags;
      } catch (error) {
        tags = [];
      }
    }

    return new Reward({
      rewardId: record.reward_id,
      userId: record.user_id,
      familyId: record.family_id || null,
      name: record.name,
      description: record.description || '',
      type: record.type || 'item',
      points: record.points,
      icon: record.icon || '🎁',
      enabled: Boolean(record.enabled),
      claimed: Boolean(record.claimed),
      claimTime: record.claim_time || null,
      claimStatus: record.claim_status || 'available',
      deliveryTime: record.delivery_time || null,
      exchangeUserId: record.exchange_user_id || null,
      isExample: Boolean(record.is_example),
      tags,
      notes: record.notes || '',
      protectedByExpiry: Boolean(record.protected_by_expiry),
      partialProtection: record.partial_protection || 0,
      modifyTime: record.modify_time || null,
      createdAt: record.created_at || null,
      updatedAt: record.updated_at || null,
      deletedAt: record.deleted_at || null,
    });
  }

  toDB() {
    return {
      reward_id: this.rewardId,
      user_id: this.userId,
      family_id: this.familyId,
      name: this.name,
      description: this.description,
      type: this.type,
      points: this.points,
      icon: this.icon,
      enabled: this.enabled ? 1 : 0,
      claimed: this.claimed ? 1 : 0,
      claim_time: this.claimTime,
      claim_status: this.claimStatus,
      delivery_time: this.deliveryTime,
      exchange_user_id: this.exchangeUserId,
      is_example: this.isExample ? 1 : 0,
      tags: JSON.stringify(this.tags || []),
      notes: this.notes,
      protected_by_expiry: this.protectedByExpiry ? 1 : 0,
      partial_protection: this.partialProtection,
      modify_time: this.modifyTime,
    };
  }

  toJSON() {
    return {
      rewardId: this.rewardId,
      id: this.rewardId,
      userId: this.userId,
      familyId: this.familyId,
      name: this.name,
      description: this.description,
      type: this.type,
      points: this.points,
      icon: this.icon,
      enabled: this.enabled,
      claimed: this.claimed,
      claimTime: this.claimTime,
      claimStatus: this.claimStatus,
      deliveryTime: this.deliveryTime,
      exchangeUserId: this.exchangeUserId,
      isExample: this.isExample,
      tags: this.tags,
      notes: this.notes,
      protectedByExpiry: this.protectedByExpiry,
      partialProtection: this.partialProtection,
      modifyTime: this.modifyTime,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

module.exports = Reward;
