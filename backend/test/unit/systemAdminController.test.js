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
  updateAccessLevel: jest.fn(),
  updateAdmissionIssuer: jest.fn()
}));
jest.mock('../../services/inviteCodeService', () => ({
  getAdmissionGovernanceOverview: jest.fn(),
  updateAdmissionGlobalQuota: jest.fn()
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
const inviteCodeService = require('../../services/inviteCodeService');

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
    systemUserGovernanceService.listGovernableUsers.mockResolvedValue({
      users: [{ userId: 'user_1', systemAccessLevel: 'normal' }],
      summary: { normal: 1, readonly: 0, blocked: 0 },
      nextCursor: '',
      hasMore: false
    });

    const res = await request(app)
      .get('/api/system/admin/users/governance')
      .query({ keyword: '家长', role: 'parent' });

    expect(res.status).toBe(200);
    expect(systemUserGovernanceService.listGovernableUsers).toHaveBeenCalledWith({
      keyword: '家长',
      role: 'parent'
    });
    expect(res.body.data.users).toEqual([
      expect.objectContaining({ userId: 'user_1' })
    ]);
    expect(res.body.data.summary).toEqual({ normal: 1, readonly: 0, blocked: 0 });
  });

  it('应返回邀请码治理概览', async () => {
    inviteCodeService.getAdmissionGovernanceOverview.mockResolvedValue({
      quotaTotal: 12,
      quotaUsed: 4,
      quotaRemaining: 8
    });

    const res = await request(app).get('/api/system/admin/invite-governance');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      quotaTotal: 12,
      quotaUsed: 4,
      quotaRemaining: 8
    });
  });

  it('更新邀请码治理概览成功后应返回最新摘要', async () => {
    inviteCodeService.updateAdmissionGlobalQuota.mockResolvedValue({
      quotaTotal: 20,
      quotaUsed: 5,
      quotaRemaining: 15
    });

    const res = await request(app)
      .patch('/api/system/admin/invite-governance')
      .send({ quotaTotal: 20 });

    expect(res.status).toBe(200);
    expect(inviteCodeService.updateAdmissionGlobalQuota).toHaveBeenCalledWith(20, 'admin_1');
    expect(res.body.data).toEqual({
      quotaTotal: 20,
      quotaUsed: 5,
      quotaRemaining: 15
    });
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

  it('更新用户新用户邀请码治理成功后应返回最新摘要', async () => {
    systemUserGovernanceService.updateAdmissionIssuer.mockResolvedValue({
      userId: 'user_2',
      canIssueAdmissionCode: true,
      admissionCodeQuotaTotal: 3
    });

    const res = await request(app)
      .patch('/api/system/admin/users/user_2/admission-issuer')
      .send({
        canIssueAdmissionCode: true,
        admissionCodeQuotaTotal: 3
      });

    expect(res.status).toBe(200);
    expect(systemUserGovernanceService.updateAdmissionIssuer).toHaveBeenCalledWith('user_2', {
      canIssueAdmissionCode: true,
      admissionCodeQuotaTotal: 3
    }, 'admin_1');
    expect(res.body.data).toEqual({
      userId: 'user_2',
      canIssueAdmissionCode: true,
      admissionCodeQuotaTotal: 3
    });
  });

  it('更新只读或禁入家长的新用户邀请码治理时应返回 400', async () => {
    systemUserGovernanceService.updateAdmissionIssuer.mockRejectedValue(
      Object.assign(new Error('只允许为正常状态的家长配置新用户邀请码能力'), {
        code: 'SYSTEM_USER_GOVERNANCE_INVALID'
      })
    );

    const res = await request(app)
      .patch('/api/system/admin/users/user_2/admission-issuer')
      .send({
        canIssueAdmissionCode: true,
        admissionCodeQuotaTotal: 3
      });

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('SYSTEM_USER_GOVERNANCE_INVALID');
    expect(res.body.message).toBe('只允许为正常状态的家长配置新用户邀请码能力');
  });
});
