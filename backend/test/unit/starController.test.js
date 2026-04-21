const request = require('supertest');
const express = require('express');
const { generateToken } = require('../../config/jwt');

jest.mock('../../services/starService');
jest.mock('../../services/familyService');
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
}));

const starService = require('../../services/starService');
const familyService = require('../../services/familyService');

function buildApp() {
  const app = express();
  app.use(express.json());
  const router = require('../../routes/stars');
  app.use('/api/stars', router);
  return app;
}

function token(user) {
  return `Bearer ${generateToken(user)}`;
}

describe('GET /api/stars/family-summary', () => {
  const PARENT = { userId: 'parent_1', role: 'parent', familyId: 'fam_1' };
  const CHILD = { userId: 'child_1', role: 'child', familyId: 'fam_1' };
  const VIEWER = { userId: 'parent_viewer', role: 'parent', familyId: 'fam_1', familyPermissionRole: 'viewer' };
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('家长可读取家庭星星汇总', async () => {
    starService.getFamilyStarSummary.mockResolvedValue({
      subjectUserIds: ['child_1', 'child_2'],
      totalPoints: 8,
      groups: [
        {
          toJSON: () => ({
            groupId: 'group_1',
            userId: 'child_1',
            stars: 8,
            expiryType: 'week',
            expiryDate: '2026-04-05'
          })
        }
      ]
    });

    const res = await request(app)
      .get('/api/stars/family-summary')
      .set('Authorization', token(PARENT));

    expect(res.status).toBe(200);
    expect(starService.getFamilyStarSummary).toHaveBeenCalledWith('fam_1');
    expect(res.body.data).toEqual({
      scope: 'family',
      subjectUserIds: ['child_1', 'child_2'],
      totalPoints: 8,
      groups: [
        {
          groupId: 'group_1',
          userId: 'child_1',
          stars: 8,
          expiryType: 'week',
          expiryDate: '2026-04-05'
        }
      ]
    });
  });

  it('孩子访问家庭星星汇总应返回 403', async () => {
    const res = await request(app)
      .get('/api/stars/family-summary')
      .set('Authorization', token(CHILD));

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('PERMISSION_DENIED');
    expect(starService.getFamilyStarSummary).not.toHaveBeenCalled();
  });

  it('查看者家长写入星星流水应返回 403', async () => {
    familyService.getUserFamilyRoleProfile = jest.fn().mockResolvedValue({
      userId: 'parent_viewer',
      familyId: 'fam_1',
      role: 'parent',
      familyPermissionRole: 'viewer'
    });
    familyService.getUserFamilyAndRole = jest.fn().mockResolvedValue({
      userId: 'child_1',
      familyId: 'fam_1',
      role: 'child'
    });

    const res = await request(app)
      .post('/api/stars/records')
      .set('Authorization', token(VIEWER))
      .send({ userId: 'child_1', points: 3, type: 'income' });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('FAMILY_MANAGER_REQUIRED');
    expect(starService.upsertStarRecord).not.toHaveBeenCalled();
  });

  it('查看者家长切到孩子视角执行任务时，应允许补云任务星星流水', async () => {
    familyService.getUserFamilyRoleProfile = jest.fn().mockResolvedValue({
      userId: 'parent_viewer',
      familyId: 'fam_1',
      role: 'parent',
      familyPermissionRole: 'viewer'
    });
    familyService.getUserFamilyAndRole = jest.fn().mockResolvedValue({
      userId: 'child_1',
      familyId: 'fam_1',
      role: 'child'
    });
    starService.upsertStarRecord.mockResolvedValue({
      record: { toJSON: () => ({ recordId: 'record_1' }) },
      updatedGroupsSnapshot: [],
      idempotent: false
    });

    const res = await request(app)
      .post('/api/stars/records')
      .set('Authorization', token(VIEWER))
      .send({
        userId: 'child_1',
        type: 'income',
        source: 'task_complete',
        points: 3,
        operatorContext: {
          actorUserId: 'child_1',
          actorRole: 'child'
        }
      });

    expect(res.status).toBe(200);
    expect(starService.upsertStarRecord).toHaveBeenCalledWith(
      'child_1',
      expect.objectContaining({
        source: 'task_complete',
        operatorContext: expect.objectContaining({
          actorUserId: 'child_1'
        })
      })
    );
  });

  it('孩子写入星星流水应返回 403', async () => {
    const res = await request(app)
      .post('/api/stars/records')
      .set('Authorization', token(CHILD))
      .send({ userId: 'child_1', points: 3, type: 'income' });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('PERMISSION_DENIED');
    expect(starService.upsertStarRecord).not.toHaveBeenCalled();
  });

  it('孩子扣减星星应返回 403', async () => {
    const res = await request(app)
      .post('/api/stars/consume')
      .set('Authorization', token(CHILD))
      .send({ userId: 'child_1', points: 3, reason: 'manual' });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('PERMISSION_DENIED');
    expect(starService.consumeStars).not.toHaveBeenCalled();
  });
});
