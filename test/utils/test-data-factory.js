/**
 * test-data-factory.js - 测试数据工厂
 *
 * 提供统一的测试数据创建方法，确保测试数据的一致性和可维护性
 */

const dateUtils = require('../../utils/dateUtils');

class TestDataFactory {
  // ==================== Model 数据工厂 ====================

  /**
   * 创建 StarGroup 测试数据
   * @param {Object} options 覆盖选项
   * @returns {Object} StarGroup 数据
   */
  static createStarGroup(options = {}) {
    const defaults = {
      id: options.id || `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: options.userId || 'user_123',
      stars: options.stars !== undefined ? options.stars : 10,
      expiryDate: options.expiryDate || dateUtils.addDays(new Date(), 7).toISOString(),
      expiryType: options.expiryType || 'week',
      expiryDateStr: options.expiryDateStr || dateUtils.formatDate(dateUtils.addDays(new Date(), 7)),
      type: options.type || 'temporary',
      lastUpdated: Date.now()
    };

    return { ...defaults, ...options };
  }

  /**
   * 创建 Star 测试数据
   * @param {Object} options 覆盖选项
   * @returns {Object} Star 数据
   */
  static createStar(options = {}) {
    const defaults = {
      id: options.id || `star_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      groupId: options.groupId || 'group_123',
      userId: options.userId || 'user_123',
      points: options.points !== undefined ? options.points : 1,
      status: options.status || 'available',
      source: options.source || 'task',
      sourceId: options.sourceId || 'task_456',
      description: options.description || '测试星星',
      timestamp: options.timestamp || Date.now()
    };

    return { ...defaults, ...options };
  }

  /**
   * 创建 Reward 测试数据
   * @param {Object} options 覆盖选项
   * @returns {Object} Reward 数据
   */
  static createReward(options = {}) {
    const defaults = {
      id: options.id || `reward_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: options.userId || 'user_123',
      name: options.name || '测试奖励',
      description: options.description || '测试奖励描述',
      points: options.points !== undefined ? options.points : 100,
      type: options.type || 'custom',
      status: options.status || 'available',
      imageUrl: options.imageUrl || '',
      isExample: options.isExample || false,
      claimedBy: options.claimedBy || null,
      claimTime: options.claimTime || null,
      protectedByExpiry: options.protectedByExpiry || false,
      partialProtection: options.partialProtection || null,
      createTime: options.createTime || Date.now(),
      lastUpdated: Date.now()
    };

    return { ...defaults, ...options };
  }

  /**
   * 创建 Task 测试数据
   * @param {Object} options 覆盖选项
   * @returns {Object} Task 数据
   */
  static createTask(options = {}) {
    const defaults = {
      id: options.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: options.userId || 'user_123',
      title: options.title || '测试任务',
      type: options.type || 'study',
      status: options.status || 'pending',
      date: options.date || dateUtils.getTodayString(),
      startTime: options.startTime || '09:00',
      endTime: options.endTime || '10:00',
      points: options.points !== undefined ? options.points : 10,
      pointsExpiry: options.pointsExpiry || 'week',
      isRequired: options.isRequired || false,
      penaltyApplied: options.penaltyApplied || false,
      completedAt: options.completedAt || null,
      createTime: options.createTime || Date.now(),
      updateTime: options.updateTime || Date.now()
    };

    return { ...defaults, ...options };
  }

  /**
   * 创建 Message 测试数据
   * @param {Object} options 覆盖选项
   * @returns {Object} Message 数据
   */
  static createMessage(options = {}) {
    const defaults = {
      id: options.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: options.userId || 'user_123',
      type: options.type || 'system',
      content: options.content || '测试消息',
      isRead: options.isRead !== undefined ? options.isRead : false,
      priority: options.priority !== undefined ? options.priority : 1,
      relatedType: options.relatedType || 'task',
      relatedId: options.relatedId || 'task_456',
      createTime: options.createTime || Date.now()
    };

    return { ...defaults, ...options };
  }

  /**
   * 创建 StarRecord 测试数据
   * @param {Object} options 覆盖选项
   * @returns {Object} StarRecord 数据
   */
  static createStarRecord(options = {}) {
    const defaults = {
      id: options.id || `record_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: options.userId || 'user_123',
      groupId: options.groupId || 'group_123',
      type: options.type || 'income',
      points: options.points !== undefined ? options.points : 1,
      source: options.source || 'task',
      sourceId: options.sourceId || 'task_456',
      description: options.description || '测试星星记录',
      balance: options.balance || 100,
      previousBalance: options.previousBalance || 99,
      timestamp: options.timestamp || Date.now()
    };

    return { ...defaults, ...options };
  }

  // ==================== 场景构建器 ====================

  /**
   * 构建跨分组消费的测试场景
   * @returns {Object} 测试场景
   */
  static buildMultiGroupConsumption() {
    const today = dateUtils.getTodayString();
    const tomorrow = dateUtils.getTomorrowString();
    const nextWeek = dateUtils.formatDate(dateUtils.addDays(new Date(), 7));

    return {
      userId: 'user_123',
      today: today,
      groups: [
        this.createStarGroup({
          id: 'group_1',
          stars: 5,
          expiryDate: tomorrow,
          expiryType: 'week'
        }),
        this.createStarGroup({
          id: 'group_2',
          stars: 8,
          expiryDate: nextWeek,
          expiryType: 'week'
        })
      ],
      requestPoints: 12,
      expectedResults: {
        consumedFromGroup1: 5,
        consumedFromGroup2: 7,
        group3Unchanged: true,
        actualConsumed: 12
      }
    };
  }

  /**
   * 构建星星过期场景
   * @returns {Array} 过期场景数组
   */
  static buildStarExpiryScenarios() {
    const today = dateUtils.getTodayString();
    const yesterday = dateUtils.getYesterdayString();
    const tomorrow = dateUtils.getTomorrowString();
    const nextWeek = dateUtils.formatDate(dateUtils.addDays(new Date(), 7));

    return [
      {
        description: '今天过期',
        expiryDate: today,
        today: today,
        expectedIsExpired: true,
        expectedRemainingDays: 0
      },
      {
        description: '昨天过期',
        expiryDate: yesterday,
        today: today,
        expectedIsExpired: true,
        expectedRemainingDays: 0
      },
      {
        description: '明天过期',
        expiryDate: tomorrow,
        today: today,
        expectedIsExpired: false,
        expectedRemainingDays: 1
      },
      {
        description: '一周后过期',
        expiryDate: nextWeek,
        today: today,
        expectedIsExpired: false,
        expectedRemainingDays: 7
      },
      {
        description: '永久有效',
        expiryDate: null,
        today: today,
        expectedIsExpired: false,
        expectedRemainingDays: -1
      },
      {
        description: '无效日期',
        expiryDate: 'invalid-date',
        today: today,
        expectedIsExpired: false,
        expectedRemainingDays: 0
      },
      {
        description: '空日期',
        expiryDate: '',
        today: today,
        expectedIsExpired: false,
        expectedRemainingDays: 0
      },
      {
        description: 'undefined日期',
        expiryDate: undefined,
        today: today,
        expectedIsExpired: false,
        expectedRemainingDays: 0
      }
    ];
  }

  /**
   * 构建奖励保护场景
   * @returns {Object} 奖励保护场景
   */
  static buildRewardProtectionScenario() {
    const today = dateUtils.getTodayString();
    const yesterday = dateUtils.getYesterdayString();

    return {
      userId: 'user_123',
      today: today,
      rewards: [
        this.createReward({
          id: 'reward_1',
          name: '高价值奖励',
          points: 100,
          status: 'available'
        }),
        this.createReward({
          id: 'reward_2',
          name: '中价值奖励',
          points: 50,
          status: 'available'
        }),
        this.createReward({
          id: 'reward_3',
          name: '低价值奖励',
          points: 20,
          status: 'available'
        })
      ],
      totalStars: 80,
      expiredStars: 120, // 过期但可用的星星
      expectedResults: {
        protectedCount: 2,
        reward1Protected: 100,
        reward2Protected: 20,
        reward3Unprotected: true,
        totalProtected: 120,
        remainingStars: 80
      }
    };
  }
}

module.exports = TestDataFactory;
