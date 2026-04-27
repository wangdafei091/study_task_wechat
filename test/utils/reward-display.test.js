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

  it('未显式提供预览余额时应回退到 totalPoints 保持展示一致', () => {
    const model = rewardDisplay.buildRewardDisplayModel({
      name: '拼图',
      points: 10,
      claimed: false,
      fulfillmentMode: 'manual'
    }, {
      totalPoints: 20
    });

    expect(model.unlocked).toBe(true);
    expect(model.detailBalanceText).toBe('当前余额 20 颗');
    expect(model.detailActualCostText).toBe('兑换后剩余 10 颗');
  });
});
