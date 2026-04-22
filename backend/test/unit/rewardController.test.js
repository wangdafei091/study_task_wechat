const request = require('supertest');
const express = require('express');
const { generateToken } = require('../../config/jwt');

jest.mock('../../services/rewardService');
jest.mock('../../services/familyService');
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const rewardService = require('../../services/rewardService');
const familyService = require('../../services/familyService');

function buildApp() {
  const app = express();
  app.use(express.json());
  const router = require('../../routes/rewards');
  app.use('/api/rewards', router);
  return app;
}

function token(user) {
  return `Bearer ${generateToken(user)}`;
}

const PARENT = { userId: 'parent_1', role: 'parent', familyId: 'fam_1' };
const CHILD = { userId: 'child_1', role: 'child', familyId: 'fam_1' };
const OTHER = { userId: 'other_1', role: 'child', familyId: 'fam_2' };
const VIEWER = { userId: 'parent_viewer', role: 'parent', familyId: 'fam_1', familyPermissionRole: 'viewer' };

function makeReward(overrides = {}) {
  return {
    rewardId: 'reward_001',
    userId: 'parent_1',
    familyId: 'fam_1',
    claimed: true,
    claimStatus: 'pending',
    exchangeUserId: 'child_1',
    toJSON() {
      return {
        rewardId: this.rewardId,
        userId: this.userId,
        familyId: this.familyId,
        claimed: this.claimed,
        claimStatus: this.claimStatus,
        exchangeUserId: this.exchangeUserId,
      };
    },
    ...overrides,
  };
}

describe('PATCH /api/rewards/:rewardId/cancel-exchange', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    familyService.getUserFamilyRoleProfile = jest.fn().mockImplementation(async (userId) => {
      if (userId === 'parent_1') {
        return { userId, familyId: 'fam_1', role: 'parent', familyPermissionRole: 'manager' };
      }
      if (userId === 'parent_viewer') {
        return { userId, familyId: 'fam_1', role: 'parent', familyPermissionRole: 'viewer' };
      }
      return null;
    });
  });

  it('孩子可取消自己的奖励兑换', async () => {
    const reward = makeReward();
    rewardService.getRewardById = jest.fn().mockResolvedValue(reward);
    rewardService.canUserAccessReward = jest.fn().mockReturnValue(true);
    rewardService.cancelRewardExchange = jest.fn().mockResolvedValue({
      reward,
      refundRecord: null,
      refundedPoints: 20,
      updatedGroupsSnapshot: [],
      idempotent: false,
    });

    const res = await request(app)
      .patch('/api/rewards/reward_001/cancel-exchange')
      .set('Authorization', token(CHILD))
      .send({ modifyTime: 123456 });

    expect(res.status).toBe(200);
    expect(rewardService.cancelRewardExchange).toHaveBeenCalledWith(
      'reward_001',
      'child_1',
      123456,
      expect.objectContaining({
        actorUserId: 'child_1',
        actorRole: 'child',
        familyId: 'fam_1',
      })
    );
  });

  it('家长可为同家庭孩子取消奖励兑换', async () => {
    const reward = makeReward();
    rewardService.getRewardById = jest.fn().mockResolvedValue(reward);
    rewardService.canUserAccessReward = jest.fn().mockReturnValue(true);
    familyService.getUserFamilyAndRole = jest.fn().mockResolvedValue({ familyId: 'fam_1', role: 'child' });
    rewardService.cancelRewardExchange = jest.fn().mockResolvedValue({
      reward,
      refundRecord: null,
      refundedPoints: 20,
      updatedGroupsSnapshot: [],
      idempotent: false,
    });

    const res = await request(app)
      .patch('/api/rewards/reward_001/cancel-exchange')
      .set('Authorization', token(PARENT))
      .send({ exchangeUserId: 'child_1' });

    expect(res.status).toBe(200);
    expect(rewardService.cancelRewardExchange).toHaveBeenCalledWith(
      'reward_001',
      'child_1',
      undefined,
      expect.objectContaining({
        actorUserId: 'parent_1',
        actorRole: 'parent',
        familyId: 'fam_1',
      })
    );
  });

  it('跨家庭成员取消奖励兑换应返回 403', async () => {
    const reward = makeReward({ exchangeUserId: 'child_2' });
    rewardService.getRewardById = jest.fn().mockResolvedValue(reward);
    rewardService.canUserAccessReward = jest.fn().mockReturnValue(true);

    const res = await request(app)
      .patch('/api/rewards/reward_001/cancel-exchange')
      .set('Authorization', token(OTHER))
      .send({ exchangeUserId: 'child_2' });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('FAMILY_MEMBER_ACCESS_DENIED');
  });
});

describe('PATCH /api/rewards/:rewardId/exchange', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('孩子可兑换自己的奖励', async () => {
    const reward = makeReward({ claimed: false, claimStatus: 'available', exchangeUserId: null });
    rewardService.getRewardById = jest.fn().mockResolvedValue(reward);
    rewardService.canUserAccessReward = jest.fn().mockReturnValue(true);
    rewardService.exchangeReward = jest.fn().mockResolvedValue({
      reward,
      record: null,
      consumedPoints: 20,
      deductionBreakdown: [],
      updatedGroupsSnapshot: [],
      idempotent: false,
    });

    const res = await request(app)
      .patch('/api/rewards/reward_001/exchange')
      .set('Authorization', token(CHILD))
      .send({ modifyTime: 123456 });

    expect(res.status).toBe(200);
    expect(rewardService.exchangeReward).toHaveBeenCalledWith(
      'reward_001',
      'child_1',
      123456,
      expect.objectContaining({
        actorUserId: 'child_1',
        actorRole: 'child',
        familyId: 'fam_1',
      })
    );
  });

  it('家长在孩子视角下兑换时，应将孩子作为消息操作者透传', async () => {
    const reward = makeReward({ claimed: false, claimStatus: 'available', exchangeUserId: null });
    rewardService.getRewardById = jest.fn().mockResolvedValue(reward);
    rewardService.canUserAccessReward = jest.fn().mockReturnValue(true);
    familyService.getUserFamilyAndRole = jest.fn().mockResolvedValue({ familyId: 'fam_1', role: 'child' });
    rewardService.exchangeReward = jest.fn().mockResolvedValue({
      reward,
      record: null,
      consumedPoints: 20,
      deductionBreakdown: [],
      updatedGroupsSnapshot: [],
      idempotent: false,
    });

    const res = await request(app)
      .patch('/api/rewards/reward_001/exchange')
      .set('Authorization', token(PARENT))
      .send({
        exchangeUserId: 'child_1',
        operatorContext: {
          actorUserId: 'child_1',
          actorRole: 'child'
        }
      });

    expect(res.status).toBe(200);
    expect(rewardService.exchangeReward).toHaveBeenCalledWith(
      'reward_001',
      'child_1',
      undefined,
      expect.objectContaining({
        actorUserId: 'child_1',
        actorRole: 'child',
        familyId: 'fam_1',
      })
    );
  });

  it('家长默认代孩子兑换时，应保持家长作为操作者', async () => {
    const reward = makeReward({ claimed: false, claimStatus: 'available', exchangeUserId: null });
    rewardService.getRewardById = jest.fn().mockResolvedValue(reward);
    rewardService.canUserAccessReward = jest.fn().mockReturnValue(true);
    rewardService.exchangeReward = jest.fn().mockResolvedValue({
      reward,
      record: null,
      consumedPoints: 20,
      deductionBreakdown: [],
      updatedGroupsSnapshot: [],
      idempotent: false,
    });

    const res = await request(app)
      .patch('/api/rewards/reward_001/exchange')
      .set('Authorization', token(PARENT))
      .send({ exchangeUserId: 'child_1' });

    expect(res.status).toBe(200);
    expect(rewardService.exchangeReward).toHaveBeenCalledWith(
      'reward_001',
      'child_1',
      undefined,
      expect.objectContaining({
        actorUserId: 'parent_1',
        actorRole: 'parent',
        familyId: 'fam_1',
      })
    );
  });

  it('查看者家长兑换奖励应返回 403', async () => {
    familyService.getUserFamilyRoleProfile = jest.fn().mockResolvedValue({
      userId: 'parent_viewer',
      familyId: 'fam_1',
      role: 'parent',
      familyPermissionRole: 'viewer'
    });

    const res = await request(app)
      .patch('/api/rewards/reward_001/exchange')
      .set('Authorization', token(VIEWER))
      .send({ exchangeUserId: 'child_1' });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('FAMILY_MANAGER_REQUIRED');
    expect(rewardService.exchangeReward).not.toHaveBeenCalled();
  });

  it('孩子不能创建奖励', async () => {
    const res = await request(app)
      .post('/api/rewards')
      .set('Authorization', token(CHILD))
      .send({ title: '新奖励', pointsCost: 10 });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('PERMISSION_DENIED');
    expect(rewardService.createReward).not.toHaveBeenCalled();
  });
});
