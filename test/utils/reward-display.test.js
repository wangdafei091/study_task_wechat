const rewardDisplay = require('../../utils/reward-display');

describe('utils/reward-display', () => {
  it('家长自己视角下应显示明确的孩子兑换文案', () => {
    const model = rewardDisplay.buildRewardDisplayModel({
      name: '拼图',
      points: 10,
      claimed: false,
      fulfillmentMode: 'manual'
    }, {
      totalPoints: 20,
      isParentOwnView: true,
      targetChildName: '小明'
    });

    expect(model.poolActionLabel).toBe('为小明兑换');
  });

  it('需要先选孩子时应显示选择孩子兑换', () => {
    const model = rewardDisplay.buildRewardDisplayModel({
      name: '拼图',
      points: 10,
      claimed: false,
      fulfillmentMode: 'manual'
    }, {
      totalPoints: 20,
      requiresTargetSelection: true
    });

    expect(model.poolActionLabel).toBe('选择孩子兑换');
    expect(model.poolStatusLabel).toBe('待选择');
  });
});
