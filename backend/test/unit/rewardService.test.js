jest.mock('../../config/database', () => ({
  getPool: jest.fn(),
  query: jest.fn(),
  execute: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
}));

jest.mock('../../services/starService', () => ({
  getStarGroupsByUserWithConnection: jest.fn(),
  getExpiringProtectionSummaryWithConnection: jest.fn(),
  consumeStarsWithConnection: jest.fn(),
  _buildRecordId: jest.fn()
}));

jest.mock('../../services/messageService', () => ({
  createRewardMessages: jest.fn()
}));

describe('backend RewardService exchange state machine', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('已兑换奖励默认应保持 claimed 状态，允许后续取消兑换', () => {
    const Reward = require('../../models/Reward');

    const reward = new Reward({
      rewardId: 'reward_1',
      userId: 'parent_1',
      name: '冰淇淋',
      claimed: true
    });

    expect(reward.claimStatus).toBe('claimed');
  });

  it('exchangeReward 应写入 claimed 而不是 delivered', async () => {
    const { getPool } = require('../../config/database');
    const starService = require('../../services/starService');
    const messageService = require('../../services/messageService');

    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn(),
      execute: jest.fn()
    };

    connection.execute
      .mockResolvedValueOnce([[
        {
          reward_id: 'reward_1',
          user_id: 'parent_1',
          family_id: 'fam_1',
          name: '冰淇淋',
          points: 20,
          enabled: 1,
          claimed: 0,
          claim_status: 'available',
          claim_time: null,
          delivery_time: null,
          exchange_user_id: null,
          protected_by_expiry: 0,
          partial_protection: 0,
          deleted_at: null,
          modify_time: 100
        }
      ]])
      .mockResolvedValueOnce([[
        {
          reward_id: 'reward_1',
          user_id: 'parent_1',
          family_id: 'fam_1',
          name: '冰淇淋',
          points: 20,
          enabled: 1,
          claimed: 0,
          claim_status: 'available',
          claim_time: null,
          delivery_time: null,
          exchange_user_id: null,
          protected_by_expiry: 0,
          partial_protection: 0,
          deleted_at: null,
          modify_time: 100
        }
      ]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[
        {
          reward_id: 'reward_1',
          user_id: 'parent_1',
          family_id: 'fam_1',
          name: '冰淇淋',
          points: 20,
          enabled: 1,
          claimed: 1,
          claim_status: 'claimed',
          claim_time: 123456,
          delivery_time: null,
          exchange_user_id: 'child_1',
          protected_by_expiry: 0,
          partial_protection: 0,
          deleted_at: null,
          modify_time: 123456
        }
      ]]);

    getPool.mockReturnValue({
      getConnection: jest.fn().mockResolvedValue(connection)
    });

    starService.getStarGroupsByUserWithConnection.mockResolvedValue([]);
    starService.getExpiringProtectionSummaryWithConnection.mockResolvedValue({
      pendingPoints: 0,
      groups: []
    });
    starService.consumeStarsWithConnection.mockResolvedValue({
      record: null,
      consumedPoints: 20,
      deductionBreakdown: [],
      updatedGroupsSnapshot: []
    });
    messageService.createRewardMessages.mockResolvedValue([]);

    const service = require('../../services/rewardService');
    const result = await service.exchangeReward('reward_1', 'child_1', 123456, {
      actorUserId: 'child_1',
      actorRole: 'child'
    });

    const updateCall = connection.execute.mock.calls.find(([sql]) => sql.includes('UPDATE rewards SET'));
    expect(updateCall[0]).toContain("claim_status = 'claimed'");
    expect(updateCall[0]).toContain('delivery_time = NULL');
    expect(result.reward.claimStatus).toBe('claimed');
    expect(connection.commit).toHaveBeenCalled();
  });

  it('保护分配应忽略已禁用奖励，避免吞掉正式奖励的保护额度', async () => {
    const service = require('../../services/rewardService');
    const Reward = require('../../models/Reward');

    const protectionMap = service._buildEffectiveProtectionMapFromInputs(
      [
        new Reward({
          rewardId: 'reward_disabled',
          userId: 'parent_1',
          name: '禁用高价奖励',
          points: 100,
          enabled: false,
          claimed: false
        }),
        new Reward({
          rewardId: 'reward_visible',
          userId: 'parent_1',
          name: '正式奖励',
          points: 80,
          enabled: true,
          claimed: false
        })
      ],
      [],
      80
    );

    expect(protectionMap.get('reward_disabled')).toEqual({
      protectedByExpiry: false,
      partialProtection: 0
    });
    expect(protectionMap.get('reward_visible')).toEqual({
      protectedByExpiry: true,
      partialProtection: 80
    });
  });
});
