/**
 * 奖励保护功能测试
 */

const StarService = require('../services/star-service');
const RewardService = require('../services/reward-service');
const ServiceManager = require('../services/service-manager');

describe('奖励保护功能测试', () => {
  let serviceManager;
  let starService;
  let rewardService;

  beforeEach(async () => {
    // 初始化服务管理器
    serviceManager = new ServiceManager();
    await serviceManager.initialize();
    
    starService = serviceManager.getStarService();
    rewardService = serviceManager.getRewardService();
  });

  afterEach(async () => {
    // 清理
    if (starService && starService.clearCache) {
      starService.clearCache();
    }
    if (rewardService && rewardService.clearCache) {
      rewardService.clearCache();
    }
  });

  test('应该能计算即将过期的星星数量', async () => {
    const expiredStars = await starService.calculatePendingExpiry('test_user');
    expect(typeof expiredStars).toBe('number');
    expect(expiredStars).toBeGreaterThanOrEqual(0);
  });

  test('保护奖励兑换时不应扣除星星', async () => {
    // 创建一个保护奖励
    const protectedReward = await rewardService.createReward({
      name: '测试保护奖励',
      points: 10,
      protectedByExpiry: true,
      userId: 'test_user'
    });

    expect(protectedReward.success).toBe(true);

    // 获取兑换前的星星数量
    const starsBefore = await starService.getTotalStars('test_user');

    // 兑换保护奖励
    const exchangeResult = await rewardService.exchangeReward(
      protectedReward.reward.id, 
      'test_user'
    );

    expect(exchangeResult.success).toBe(true);
    expect(exchangeResult.protectedByExpiry).toBe(true);

    // 获取兑换后的星星数量，应该没有变化
    const starsAfter = await starService.getTotalStars('test_user');
    expect(starsAfter).toBe(starsBefore);
  });

  test('普通奖励兑换时应正常扣除星星', async () => {
    // 添加一些星星
    await starService.addStars(20, 'permanent', '测试星星', { userId: 'test_user' });

    // 创建一个普通奖励
    const normalReward = await rewardService.createReward({
      name: '测试普通奖励',
      points: 10,
      protectedByExpiry: false,
      userId: 'test_user'
    });

    expect(normalReward.success).toBe(true);

    // 获取兑换前的星星数量
    const starsBefore = await starService.getTotalStars('test_user');

    // 兑换普通奖励
    const exchangeResult = await rewardService.exchangeReward(
      normalReward.reward.id, 
      'test_user'
    );

    expect(exchangeResult.success).toBe(true);
    expect(exchangeResult.protectedByExpiry).toBe(false);

    // 获取兑换后的星星数量，应该减少10
    const starsAfter = await starService.getTotalStars('test_user');
    expect(starsAfter).toBe(starsBefore - 10);
  });
}); 