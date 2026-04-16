const rewardStatus = require('../../utils/reward-status');

describe('utils/reward-status', () => {
  it('应兼容新旧奖励状态字段', () => {
    expect(rewardStatus.resolveRewardClaimStatus({
      claimed: false
    })).toBe(rewardStatus.RewardClaimDisplayStatus.AVAILABLE);

    expect(rewardStatus.resolveRewardClaimStatus({
      claimed: true
    })).toBe(rewardStatus.RewardClaimDisplayStatus.CLAIMED);

    expect(rewardStatus.resolveRewardClaimStatus({
      claimed: true,
      claimStatus: 'pending'
    })).toBe(rewardStatus.RewardClaimDisplayStatus.CLAIMED);

    expect(rewardStatus.resolveRewardClaimStatus({
      claimed: true,
      claimStatus: 'delivered'
    })).toBe(rewardStatus.RewardClaimDisplayStatus.DELIVERED);
  });

  it('应返回不同页面需要的状态文案', () => {
    const availableReward = { claimed: false, unlocked: true };
    const claimedReward = { claimed: true, claimStatus: 'claimed', claimTime: 1000, fulfillmentMode: 'manual' };
    const deliveredReward = { claimed: true, claimStatus: 'delivered', claimTime: 1000, deliveryTime: 2000, fulfillmentMode: 'manual' };
    const instantReward = { claimed: true, claimStatus: 'delivered', claimTime: 1500, deliveryTime: 1500, fulfillmentMode: 'instant' };

    expect(rewardStatus.getRewardPoolStatusLabel(availableReward)).toBe('可兑换');
    expect(rewardStatus.getRewardPoolActionLabel(availableReward)).toBe('兑换奖励');

    expect(rewardStatus.getRewardPoolStatusLabel(claimedReward)).toBe('待发放');
    expect(rewardStatus.getRewardRecordStatusLabel(claimedReward)).toBe('待发放');
    expect(rewardStatus.getRewardRecordTimeLabel(claimedReward)).toBe('兑换时间');
    expect(rewardStatus.getRewardManageStatusLabel(claimedReward)).toBe('待发放');
    expect(rewardStatus.getRewardPrimaryRecordTime(claimedReward)).toBe(1000);

    expect(rewardStatus.getRewardPoolStatusLabel(deliveredReward)).toBe('已发放');
    expect(rewardStatus.getRewardRecordStatusLabel(deliveredReward)).toBe('已发放');
    expect(rewardStatus.getRewardRecordTimeLabel(deliveredReward)).toBe('发放时间');
    expect(rewardStatus.getRewardManageStatusLabel(deliveredReward)).toBe('已发放');
    expect(rewardStatus.getRewardPrimaryRecordTime(deliveredReward)).toBe(2000);

    expect(rewardStatus.getRewardPoolStatusLabel(instantReward)).toBe('已兑换');
    expect(rewardStatus.getRewardRecordStatusLabel(instantReward)).toBe('已兑换');
    expect(rewardStatus.getRewardRecordTimeLabel(instantReward)).toBe('兑换时间');
  });
});
