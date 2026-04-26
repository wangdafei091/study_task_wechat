const request = require('supertest');
const express = require('express');

jest.mock('../../services/systemAdminService', () => ({
  getBootstrapContext: jest.fn(),
  getOverview: jest.fn()
}));
jest.mock('../../services/systemSettingService', () => ({
  updateAppAccessMode: jest.fn()
}));
jest.mock('../../services/systemUserGovernanceService', () => ({
  listGovernableUsers: jest.fn(),
  updateAccessLevel: jest.fn()
}));
jest.mock('../../middleware/auth', () => ({
  authMiddleware: jest.fn((req, res, next) => {
    req.user = { userId: 'user_1' };
    next();
  })
}));
jest.mock('../../middleware/systemAdmin', () => jest.fn((req, res, next) => {
  req.systemAdmin = { userId: 'admin_1' };
  next();
}));
jest.mock('../../middleware/systemUserAccess', () => ({
  systemUserAccessMiddleware: jest.fn((req, res, next) => next())
}));
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
}));

const systemAdminService = require('../../services/systemAdminService');
const systemSettingService = require('../../services/systemSettingService');
const systemUserGovernanceService = require('../../services/systemUserGovernanceService');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/system', require('../../routes/system'));
  return app;
}

describe('system admin controller routes', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('bootstrap 应返回最小权限探测结果', async () => {
    systemAdminService.getBootstrapContext.mockResolvedValue({
      canEnterSystemAdmin: true
    });

    const res = await request(app).get('/api/system/admin/bootstrap');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ canEnterSystemAdmin: true });
  });

  it('overview 应返回系统概览', async () => {
    systemAdminService.getOverview.mockResolvedValue({
      appAccessMode: 'invite_only',
      modeSource: 'db',
      updatedAt: '2026-04-25 12:00:00',
      updatedByUserId: 'admin_1'
    });

    const res = await request(app).get('/api/system/admin/overview');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(expect.objectContaining({
      appAccessMode: 'invite_only',
      modeSource: 'db'
    }));
  });

  it('overview 遇到配置损坏时应返回明确错误码', async () => {
    systemAdminService.getOverview.mockRejectedValue(
      Object.assign(new Error('系统准入配置无效'), { code: 'SYSTEM_SETTING_CORRUPTED' })
    );

    const res = await request(app).get('/api/system/admin/overview');

    expect(res.status).toBe(500);
    expect(res.body.error_code).toBe('SYSTEM_SETTING_CORRUPTED');
    expect(res.body.message).toBe('系统准入配置异常，请重新设置');
  });

  it('更新准入模式成功后应返回最新摘要', async () => {
    systemSettingService.updateAppAccessMode.mockResolvedValue({
      mode: 'open',
      source: 'db',
      updatedAt: '2026-04-25 12:30:00',
      updatedByUserId: 'admin_1'
    });

    const res = await request(app)
      .patch('/api/system/admin/app-access-mode')
      .send({ mode: 'open' });

    expect(res.status).toBe(200);
    expect(systemSettingService.updateAppAccessMode).toHaveBeenCalledWith('open', 'admin_1');
    expect(res.body.data).toEqual(expect.objectContaining({
      appAccessMode: 'open',
      modeSource: 'db'
    }));
  });

  it('更新准入模式传入非法值时应返回 400', async () => {
    systemSettingService.updateAppAccessMode.mockRejectedValue(
      Object.assign(new Error('invalid'), { code: 'SYSTEM_SETTING_INVALID' })
    );

    const res = await request(app)
      .patch('/api/system/admin/app-access-mode')
      .send({ mode: 'closed' });

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('SYSTEM_SETTING_INVALID');
  });

  it('应返回系统用户治理列表', async () => {
    systemUserGovernanceService.listGovernableUsers.mockResolvedValue([
      { userId: 'user_1', systemAccessLevel: 'normal' }
    ]);

    const res = await request(app).get('/api/system/admin/users/governance');

    expect(res.status).toBe(200);
    expect(res.body.data.users).toEqual([
      expect.objectContaining({ userId: 'user_1' })
    ]);
  });

  it('更新用户访问级别成功后应返回最新摘要', async () => {
    systemUserGovernanceService.updateAccessLevel.mockResolvedValue({
      userId: 'user_2',
      systemAccessLevel: 'readonly',
      systemAccessUpdatedAt: '2026-04-26 12:00:00',
      systemAccessUpdatedByUserId: 'admin_1'
    });

    const res = await request(app)
      .patch('/api/system/admin/users/user_2/access-level')
      .send({ accessLevel: 'readonly' });

    expect(res.status).toBe(200);
    expect(systemUserGovernanceService.updateAccessLevel).toHaveBeenCalledWith('user_2', 'readonly', 'admin_1');
    expect(res.body.data).toEqual(expect.objectContaining({
      userId: 'user_2',
      systemAccessLevel: 'readonly'
    }));
  });

  it('更新用户访问级别命中最后管理员保护时应返回 409', async () => {
    systemUserGovernanceService.updateAccessLevel.mockRejectedValue(
      Object.assign(new Error('至少保留一位可正常使用的系统管理员'), {
        code: 'SYSTEM_USER_LAST_ADMIN_NORMAL_REQUIRED'
      })
    );

    const res = await request(app)
      .patch('/api/system/admin/users/admin_1/access-level')
      .send({ accessLevel: 'blocked' });

    expect(res.status).toBe(409);
    expect(res.body.error_code).toBe('SYSTEM_USER_LAST_ADMIN_NORMAL_REQUIRED');
  });
});
