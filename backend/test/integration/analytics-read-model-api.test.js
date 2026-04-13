const request = require('supertest');
const express = require('express');
const { generateToken } = require('../../config/jwt');

jest.mock('../../services/analyticsReadModelService');
jest.mock('../../services/familyService');
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
}));

const analyticsReadModelService = require('../../services/analyticsReadModelService');
const familyService = require('../../services/familyService');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/analytics', require('../../routes/analytics'));
  return app;
}

function token(user) {
  return `Bearer ${generateToken(user)}`;
}

const PARENT = { userId: 'parent_1', role: 'parent', familyId: 'fam_1' };
const CHILD = { userId: 'child_1', role: 'child', familyId: 'fam_1' };

describe('POST /api/analytics/read-model/query', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('家长查询孩子 user read model 应返回 200', async () => {
    familyService.getUserFamilyAndRole = jest.fn().mockResolvedValue({
      familyId: 'fam_1',
      role: 'child'
    });
    analyticsReadModelService.queryReadModel = jest.fn().mockResolvedValue({
      snapshot: {
        scope: 'user',
        subjectUserIds: ['child_1']
      }
    });

    const res = await request(app)
      .post('/api/analytics/read-model/query')
      .set('Authorization', token(PARENT))
      .send({
        scope: 'user',
        monthKey: '2026-04',
        trendDays: 7,
        userId: 'child_1'
      });

    expect(res.status).toBe(200);
    expect(analyticsReadModelService.queryReadModel).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'user',
      userId: 'child_1'
    }), expect.objectContaining({
      viewerUserId: 'parent_1',
      viewerRole: 'parent',
      familyId: 'fam_1'
    }));
  });

  it('孩子查询 family read model 应返回 403', async () => {
    const res = await request(app)
      .post('/api/analytics/read-model/query')
      .set('Authorization', token(CHILD))
      .send({
        scope: 'family',
        monthKey: '2026-04',
        trendDays: 7
      });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('PERMISSION_DENIED');
    expect(analyticsReadModelService.queryReadModel).not.toHaveBeenCalled();
  });

  it('跨家庭代理 user read model 应返回 403', async () => {
    familyService.getUserFamilyAndRole = jest.fn().mockResolvedValue({
      familyId: 'fam_2',
      role: 'child'
    });

    const res = await request(app)
      .post('/api/analytics/read-model/query')
      .set('Authorization', token(PARENT))
      .send({
        scope: 'user',
        monthKey: '2026-04',
        trendDays: 7,
        userId: 'child_9'
      });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('FAMILY_MEMBER_ACCESS_DENIED');
    expect(analyticsReadModelService.queryReadModel).not.toHaveBeenCalled();
  });

  it('scope=user 缺少 userId 时应返回 400', async () => {
    const res = await request(app)
      .post('/api/analytics/read-model/query')
      .set('Authorization', token(PARENT))
      .send({
        scope: 'user',
        monthKey: '2026-04',
        trendDays: 7
      });

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('INVALID_PARAMS');
    expect(analyticsReadModelService.queryReadModel).not.toHaveBeenCalled();
  });

  it('家长查询 task completion stats 应返回 200', async () => {
    familyService.getUserFamilyAndRole = jest.fn().mockResolvedValue({
      familyId: 'fam_1',
      role: 'child'
    });
    analyticsReadModelService.queryTaskCompletionStats = jest.fn().mockResolvedValue({
      stats: {
        totalTasks: 1,
        completedTasks: 1,
        completionRate: '100.0',
        typeCounts: { study: 1, habit: 0, interest: 0 },
        statusCounts: { pending: 0, completed: 1 }
      }
    });

    const res = await request(app)
      .post('/api/analytics/task-completion-stats/query')
      .set('Authorization', token(PARENT))
      .send({
        scope: 'user',
        userId: 'child_1',
        dateRange: 'today'
      });

    expect(res.status).toBe(200);
    expect(analyticsReadModelService.queryTaskCompletionStats).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'user',
      userId: 'child_1',
      dateRange: 'today'
    }), expect.objectContaining({
      viewerUserId: 'parent_1',
      viewerRole: 'parent',
      familyId: 'fam_1'
    }));
  });

  it('家长查询 family upcoming expiry 应返回 200', async () => {
    analyticsReadModelService.queryUpcomingExpiry = jest.fn().mockResolvedValue({
      items: []
    });

    const res = await request(app)
      .post('/api/analytics/upcoming-expiry/query')
      .set('Authorization', token(PARENT))
      .send({
        scope: 'family',
        childUserIds: ['child_1'],
        days: 7
      });

    expect(res.status).toBe(200);
    expect(analyticsReadModelService.queryUpcomingExpiry).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'family',
      childUserIds: ['child_1'],
      days: 7
    }), expect.objectContaining({
      viewerUserId: 'parent_1',
      viewerRole: 'parent',
      familyId: 'fam_1'
    }));
  });

  it('孩子查询 family task star calendar 应返回 403', async () => {
    const res = await request(app)
      .post('/api/analytics/task-star-calendar/query')
      .set('Authorization', token(CHILD))
      .send({
        scope: 'family',
        childUserIds: ['child_1']
      });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('PERMISSION_DENIED');
    expect(analyticsReadModelService.queryTaskStarCalendar).not.toHaveBeenCalled();
  });
});
