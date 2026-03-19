/**
 * scenario-builder.js - 测试场景构建器
 *
 * 提供复杂测试场景的数据构建方法
 */

const TestDataFactory = require('./test-data-factory');

class ScenarioBuilder {
  /**
   * 构建完整的服务测试场景
   * @param {Object} service 服务实例
   * @param {String} scenarioType 场景类型
   * @returns {Object} 测试场景
   */
  static buildServiceScenario(service, scenarioType) {
    const scenarios = {
      'star-consumption-multi-group': () => ({
        description: '跨分组消费星星',
        setup: async () => {
          const scenario = TestDataFactory.buildMultiGroupConsumption();
          return scenario;
        },
        action: async () => {
          return await service.consumeStars(
            scenario.requestPoints,
            '测试消费',
            { userId: scenario.userId }
          );
        },
        verify: async (result) => {
          expect(result.success).toBe(true);
          expect(result.consumed).toBe(scenario.expectedResults.actualConsumed);
          expect(result.groupsUpdated[0].stars).toBe(scenario.expectedResults.group1StarsAfter);
          expect(result.groupsUpdated[1].stars).toBe(scenario.expectedResults.group2StarsAfter);
          expect(result.groupsUpdated[2].stars).toBe(scenario.expectedResults.group3StarsAfter);
        }
      }),

      'star-expiry-all-scenarios': () => ({
        description: '星星过期所有场景',
        setup: async () => TestDataFactory.buildStarExpiryScenarios(),
        actions: [],
        verify: []
      }),

      'reward-protection': () => ({
        description: '奖励保护逻辑',
        setup: async () => {
          const scenario = TestDataFactory.buildRewardProtectionScenario();
          return scenario;
        },
        action: async () => {
          return await service.protectRewards(scenario.userId);
        },
        verify: async (result) => {
          expect(result.success).toBe(true);
          expect(result.protectedCount).toBe(scenario.expectedResults.protectedCount);
        }
      })
    };

    return scenarios[scenarioType]();
  }
}

module.exports = ScenarioBuilder;
