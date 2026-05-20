const request = require('supertest');
const express = require('express');
const { generateToken } = require('../../config/jwt');

jest.mock('../../services/familyService');
jest.mock('../../services/inviteCodeService', () => ({
  issueFamilyInviteCode: jest.fn(),
  consumeForExistingUser: jest.fn()
}));
jest.mock('../../services/userProductStateService', () => ({
  markActivated: jest.fn().mockResolvedValue(null),
  recordEvent: jest.fn().mockResolvedValue(null)
}));
jest.mock('../../services/userService');
jest.mock('../../middleware/systemUserAccess', () => ({
  systemUserAccessMiddleware: jest.fn((req, res, next) => next())
}));
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const familyService = require('../../services/familyService');
const inviteCodeService = require('../../services/inviteCodeService');
const userProductStateService = require('../../services/userProductStateService');
const userService = require('../../services/userService');

function buildApp() {
  const app = express();
  app.use(express.json());
  const router = require('../../routes/families');
  app.use('/api/families', router);
  return app;
}

function token(user) {
  return `Bearer ${generateToken(user)}`;
}

const MANAGER = {
  userId: 'parent_manager',
  role: 'parent',
  familyId: 'fam_1',
  familyPermissionRole: 'manager'
};

const VIEWER = {
  userId: 'parent_viewer',
  role: 'parent',
  familyId: 'fam_1',
  familyPermissionRole: 'viewer'
};

describe('familyController governance routes', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('管理员可调整同家庭家长权限', async () => {
    familyService.getUserFamilyRoleProfile.mockResolvedValue({
      userId: 'parent_manager',
      familyId: 'fam_1',
      role: 'parent',
      familyPermissionRole: 'manager'
    });
    familyService.updateMemberPermissionRole.mockResolvedValue({
      userId: 'parent_viewer',
      familyPermissionRole: 'manager'
    });

    const res = await request(app)
      .patch('/api/families/members/parent_viewer/permission-role')
      .set('Authorization', token(MANAGER))
      .send({ familyPermissionRole: 'manager' });

    expect(res.status).toBe(200);
    expect(familyService.updateMemberPermissionRole).toHaveBeenCalledWith(
      'parent_manager',
      'fam_1',
      'parent_viewer',
      'manager'
    );
    expect(res.body.data).toEqual({
      userId: 'parent_viewer',
      familyPermissionRole: 'manager',
      token: null
    });
  });

  it('查看者刷新邀请码应返回 403', async () => {
    familyService.getUserFamilyRoleProfile.mockResolvedValue({
      userId: 'parent_viewer',
      familyId: 'fam_1',
      role: 'parent',
      familyPermissionRole: 'viewer'
    });

    const res = await request(app)
      .post('/api/families/current/invite-code')
      .set('Authorization', token(VIEWER))
      .send({ role: 'child' });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('FAMILY_MANAGER_REQUIRED');
    expect(inviteCodeService.issueFamilyInviteCode).not.toHaveBeenCalled();
  });

  it('已失效的邀请码加入家庭时应返回明确业务错误，而不是 500', async () => {
    inviteCodeService.consumeForExistingUser.mockRejectedValue(Object.assign(
      new Error('邀请码已失效，请联系邀请人重新获取'),
      { code: 'INVITE_CODE_DISABLED' }
    ));

    const res = await request(app)
      .post('/api/families/join')
      .set('Authorization', token({
        userId: 'child_1',
        role: 'child',
        familyId: null,
        familyPermissionRole: null
      }))
      .send({ inviteCode: 'F123456789' });

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('INVITE_CODE_DISABLED');
    expect(res.body.message).toBe('邀请码已失效，请联系邀请人重新获取');
  });

  it('旧家庭邀请码刷新接口应统一走新邀请码服务并返回兼容结构', async () => {
    familyService.getUserFamilyRoleProfile.mockResolvedValue({
      userId: 'parent_manager',
      familyId: 'fam_1',
      role: 'parent',
      familyPermissionRole: 'manager'
    });
    inviteCodeService.issueFamilyInviteCode.mockResolvedValue({
      code: 'F123456789',
      targetRole: 'child',
      expiresAt: '2099-01-01T00:00:00.000Z'
    });

    const res = await request(app)
      .post('/api/families/current/invite-code')
      .set('Authorization', token(MANAGER))
      .send({ role: 'child' });

    expect(res.status).toBe(200);
    expect(inviteCodeService.issueFamilyInviteCode).toHaveBeenCalledWith({
      issuerUserId: 'parent_manager',
      familyId: 'fam_1',
      targetRole: 'child'
    });
    expect(res.body.data).toEqual({
      inviteCode: 'F123456789',
      inviteCodeRole: 'child',
      inviteCodeExpiresAt: '2099-01-01T00:00:00.000Z'
    });
  });

  it('最后一个管理员不能降级', async () => {
    familyService.getUserFamilyRoleProfile.mockResolvedValue({
      userId: 'parent_manager',
      familyId: 'fam_1',
      role: 'parent',
      familyPermissionRole: 'manager'
    });
    familyService.updateMemberPermissionRole.mockRejectedValue(Object.assign(
      new Error('至少保留一位管理员。请先把另一位家长设为管理员，再调整当前身份'),
      { code: 'FAMILY_LAST_MANAGER_REQUIRED' }
    ));

    const res = await request(app)
      .patch('/api/families/members/parent_manager/permission-role')
      .set('Authorization', token(MANAGER))
      .send({ familyPermissionRole: 'viewer' });

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('FAMILY_LAST_MANAGER_REQUIRED');
  });

  it('当前用户自降级时应回传新 token', async () => {
    familyService.getUserFamilyRoleProfile.mockResolvedValue({
      userId: 'parent_manager',
      familyId: 'fam_1',
      role: 'parent',
      familyPermissionRole: 'manager'
    });
    familyService.updateMemberPermissionRole.mockResolvedValue({
      userId: 'parent_manager',
      familyPermissionRole: 'viewer'
    });
    userService.findById.mockResolvedValue({
      userId: 'parent_manager',
      openid: 'openid_1',
      role: 'parent',
      familyId: 'fam_1',
      familyPermissionRole: 'viewer'
    });

    const res = await request(app)
      .patch('/api/families/members/parent_manager/permission-role')
      .set('Authorization', token(MANAGER))
      .send({ familyPermissionRole: 'viewer' });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.token).toBe('string');
  });

  it('加入家庭成功后即使状态同步失败也不应返回 500', async () => {
    inviteCodeService.consumeForExistingUser.mockResolvedValue({
      familyId: 'fam_1'
    });
    userProductStateService.markActivated.mockRejectedValueOnce(new Error('state failed'));
    userService.findById.mockResolvedValue({
      userId: 'child_1',
      openid: 'openid_1',
      role: 'child',
      familyId: 'fam_1',
      familyPermissionRole: null
    });

    const res = await request(app)
      .post('/api/families/join')
      .set('Authorization', token({
        userId: 'child_1',
        role: 'child',
        familyId: null,
        familyPermissionRole: null
      }))
      .send({ inviteCode: 'F123456789' });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.token).toBe('string');
  });
});
