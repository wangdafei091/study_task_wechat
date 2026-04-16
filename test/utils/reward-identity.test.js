const rewardIdentity = require('../../utils/reward-identity');

describe('utils/reward-identity', () => {
  it('应统一识别历史与当前格式的示例奖励', () => {
    expect(rewardIdentity.isExampleReward({ isExample: true })).toBe(true);
    expect(rewardIdentity.isExampleReward({ id: 'reward_example_1' })).toBe(true);
    expect(rewardIdentity.isExampleReward({ id: 'family_example_reward' })).toBe(true);
    expect(rewardIdentity.isExampleReward({ id: 'reward_123_1' })).toBe(true);
    expect(rewardIdentity.isExampleReward({ id: 'reward_custom_1' })).toBe(false);
  });

  it('应兼容单孩子家庭旧兑换记录缺少 exchangeUserId 的情况', () => {
    expect(rewardIdentity.resolveRewardExchangeUserId({
      exchangeUserId: 'child_2',
      userId: 'parent_1'
    }, {
      childUserIds: ['child_1', 'child_2']
    })).toBe('child_2');

    expect(rewardIdentity.resolveRewardExchangeUserId({
      userId: 'child_1'
    }, {
      childUserIds: ['child_1', 'child_2']
    })).toBe('child_1');

    expect(rewardIdentity.resolveRewardExchangeUserId({
      userId: 'parent_1'
    }, {
      childUserIds: ['child_1']
    })).toBe('child_1');

    expect(rewardIdentity.resolveRewardExchangeUserId({
      userId: 'parent_1'
    }, {
      childUserIds: ['child_1', 'child_2']
    })).toBeNull();
  });
});
