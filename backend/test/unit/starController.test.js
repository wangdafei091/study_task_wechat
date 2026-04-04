const request = require('supertest');
const express = require('express');
const { generateToken } = require('../../config/jwt');

jest.mock('../../services/starService');
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
}));

const starService = require('../../services/starService');

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
});
