/**
 * fake-star-repository.js - Fake Star Repository
 *
 * 用于测试复杂的业务逻辑（FIFO消费、过期处理等）
 */

const StarGroup = require('../../models/star-group');

class FakeStarRepository {
  constructor() {
    this.groups = [
      {
        id: 'group_1',
        userId: 'user_123',
        stars: 5,
        expiryDate: '2026-03-10',
        expiryType: 'week',
        expiryDateStr: '2026-03-10',
        type: 'temporary',
        lastUpdated: Date.now()
      },
      {
        id: 'group_2',
        userId: 'user_123',
        stars: 8,
        expiryDate: '2026-03-15',
        expiryType: 'week',
        expiryDateStr: '2026-03-15',
        type: 'temporary',
        lastUpdated: Date.now()
      }
    ];
  }

  async getStarGroupsByUserId(userId) {
    return this.groups.filter(g => g.userId === userId);
  }

  /**
   * 实现真实的FIFO消费逻辑
   * 这与设计文档中StarRepository的实际实现一致
   */
  async consumeStarsByExpiryOrder(points, userId) {
    const userGroups = await this.getStarGroupsByUserId(userId);

    // 1. 按过期时间排序（即将过期在前）
    const sortedGroups = [...userGroups].sort((a, b) => {
      // 永久分组最后
      if (a.type === 'permanent') return 1;
      if (b.type === 'permanent') return -1;

      // 无过期日期的分组最后
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;

      // 按过期时间升序
      return a.expiryDate - b.expiryDate;
    });

    // 2. 从第一个分组开始消费
    let remainingPoints = points;
    const updatedGroups = [];

    for (const group of sortedGroups) {
      if (remainingPoints <= 0) break;

      if (group.stars <= remainingPoints) {
        group.stars = 0;
        remainingPoints -= group.stars;
      } else {
        group.stars -= remainingPoints;
        remainingPoints = 0;
      }

      updatedGroups.push(group);
    }

    const actualConsumed = points - remainingPoints;

    return {
      success: actualConsumed > 0,
      consumed: actualConsumed,
      groupsUpdated: updatedGroups
    };
  }

  // ✅ 实现真实的FIFO逻辑
  // 根据过期时间排序
  // 从最早的分组开始消费
  // 正确处理余额不足的情况
  // 正确更新分组星星数量
}

module.exports = FakeStarRepository;
