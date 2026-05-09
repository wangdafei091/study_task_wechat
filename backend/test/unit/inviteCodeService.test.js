jest.mock('../../config/database', () => ({
  getPool: jest.fn(),
  query: jest.fn(),
  execute: jest.fn()
}));
jest.mock('../../services/appAccessService', () => ({
  getByCode: jest.fn(),
  markExpired: jest.fn()
}));
jest.mock('../../services/familyService', () => ({
  getCurrentFamily: jest.fn(),
  getUserFamilyRoleProfile: jest.fn(),
  clearLegacyInviteCode: jest.fn(),
  clearLegacyInviteCodeByIssuer: jest.fn()
}));
jest.mock('../../services/systemSettingService', () => ({
  getByKey: jest.fn()
}));
jest.mock('../../services/userService', () => ({
  findById: jest.fn(),
  createUser: jest.fn()
}));
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
}));

const { InviteCode, INVITE_CODE_PURPOSE, INVITE_CODE_STATUS } = require('../../models/InviteCode');
const familyService = require('../../services/familyService');
const userService = require('../../services/userService');
const inviteCodeService = require('../../services/inviteCodeService');

describe('inviteCodeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('consumeForNewUser 必须在事务连接内调用', async () => {
    await expect(inviteCodeService.consumeForNewUser({
      code: 'F123456789',
      wechatData: { openid: 'openid_1' },
      profileSnapshot: {}
    })).rejects.toThrow('consumeForNewUser 必须在事务连接中调用');
  });

  it('查看者家长获取当前邀请码摘要时不应返回家庭邀请码', async () => {
    userService.findById.mockResolvedValue({
      userId: 'parent_viewer',
      role: 'parent',
      familyId: 'fam_1',
      familyPermissionRole: 'viewer',
      systemAccessLevel: 'normal',
      status: 'active',
      isVirtual: false,
      isSystemAdmin: false,
      canIssueAdmissionCode: false,
      admissionCodeQuotaTotal: null
    });

    jest.spyOn(inviteCodeService, 'getCurrentAdmissionInvite').mockResolvedValue({
      toJSON: jest.fn(() => ({ code: 'USHOULDHIDE' }))
    });
    jest.spyOn(inviteCodeService, 'getCurrentFamilyInvites').mockResolvedValue([
      InviteCode.fromDB({
        invite_code_id: 'inv_1',
        code: 'FSHOULDHID',
        purpose: INVITE_CODE_PURPOSE.FAMILY_INVITE,
        status: INVITE_CODE_STATUS.ACTIVE,
        family_id: 'fam_1',
        target_role: 'child'
      })
    ]);

    const result = await inviteCodeService.getCurrentInviteSummary('parent_viewer');

    expect(result).toEqual({
      admissionCode: null,
      familyInviteCodes: []
    });
    expect(inviteCodeService.getCurrentFamilyInvites).not.toHaveBeenCalled();
  });

  it('当前邀请码摘要应过滤已过期但状态仍为 active 的邀请码', async () => {
    userService.findById.mockResolvedValue({
      userId: 'parent_manager',
      role: 'parent',
      familyId: 'fam_1',
      familyPermissionRole: 'manager',
      systemAccessLevel: 'normal',
      status: 'active',
      isVirtual: false,
      isSystemAdmin: false,
      canIssueAdmissionCode: true,
      admissionCodeQuotaTotal: 3
    });

    jest.spyOn(inviteCodeService, 'getCurrentAdmissionInvite').mockResolvedValue({
      expiresAt: '2000-01-01T00:00:00.000Z',
      toJSON: jest.fn(() => ({ code: 'UEXPIRED' }))
    });
    jest.spyOn(inviteCodeService, 'getCurrentFamilyInvites').mockResolvedValue([
      InviteCode.fromDB({
        invite_code_id: 'inv_expired',
        code: 'FEXPIRED01',
        purpose: INVITE_CODE_PURPOSE.FAMILY_INVITE,
        status: INVITE_CODE_STATUS.ACTIVE,
        family_id: 'fam_1',
        target_role: 'child',
        expires_at: '2000-01-01T00:00:00.000Z'
      }),
      InviteCode.fromDB({
        invite_code_id: 'inv_active',
        code: 'FACTIVE01',
        purpose: INVITE_CODE_PURPOSE.FAMILY_INVITE,
        status: INVITE_CODE_STATUS.ACTIVE,
        family_id: 'fam_1',
        target_role: 'parent',
        expires_at: '2099-01-01T00:00:00.000Z'
      })
    ]);

    const result = await inviteCodeService.getCurrentInviteSummary('parent_manager');

    expect(result).toEqual({
      admissionCode: null,
      familyInviteCodes: [
        expect.objectContaining({
          code: 'FACTIVE01',
          targetRole: 'parent'
        })
      ]
    });
  });

  it('统一家庭邀请码若发码人不再是正常管理员，应判定为失效', async () => {
    const activeInvite = {
      source: 'unified',
      inviteCodeId: 'inv_2',
      code: 'F123456789',
      purpose: INVITE_CODE_PURPOSE.FAMILY_INVITE,
      status: INVITE_CODE_STATUS.ACTIVE,
      issuerUserId: 'issuer_1',
      familyId: 'fam_1',
      targetRole: 'child',
      expiresAt: '2099-01-01T00:00:00.000Z',
      usedCount: 0,
      maxUses: 1
    };

    userService.findById.mockResolvedValue({
      userId: 'issuer_1',
      role: 'parent',
      status: 'active',
      isVirtual: false,
      systemAccessLevel: 'readonly'
    });
    familyService.getUserFamilyRoleProfile.mockResolvedValue({
      userId: 'issuer_1',
      role: 'parent',
      familyId: 'fam_1',
      familyPermissionRole: 'viewer'
    });

    await expect(inviteCodeService._validateUnifiedInvite(activeInvite)).rejects.toMatchObject({
      code: 'INVITE_CODE_DISABLED'
    });
  });

  it('旧家庭邀请码若创建人已不再是正常管理员，应判定为失效并清理旧码', async () => {
    const legacyInvite = {
      source: 'legacy_family',
      code: 'PARENT01',
      purpose: INVITE_CODE_PURPOSE.FAMILY_INVITE,
      status: INVITE_CODE_STATUS.ACTIVE,
      issuerUserId: 'issuer_legacy',
      familyId: 'fam_legacy',
      targetRole: 'parent',
      expiresAt: '2099-01-01T00:00:00.000Z',
      usedCount: 0,
      maxUses: 1
    };

    userService.findById.mockResolvedValue({
      userId: 'issuer_legacy',
      role: 'parent',
      status: 'active',
      isVirtual: false,
      systemAccessLevel: 'normal'
    });
    familyService.getUserFamilyRoleProfile.mockResolvedValue({
      userId: 'issuer_legacy',
      role: 'parent',
      familyId: 'fam_legacy',
      familyPermissionRole: 'viewer'
    });

    await expect(inviteCodeService._validateUnifiedInvite(legacyInvite)).rejects.toMatchObject({
      code: 'INVITE_CODE_DISABLED'
    });
    expect(familyService.clearLegacyInviteCodeByIssuer).toHaveBeenCalledWith(
      'fam_legacy',
      'issuer_legacy',
      {}
    );
  });

  it('消费新用户邀请码时应在事务内复核全局和个人成功邀请额度', async () => {
    const connection = { execute: jest.fn() };
    const validatedInvite = {
      source: 'unified',
      inviteCodeId: 'inv_quota',
      code: 'U123456789',
      purpose: INVITE_CODE_PURPOSE.ADMISSION_ONLY,
      issuerUserId: 'issuer_quota',
      usedCount: 0,
      maxUses: 1
    };

    jest.spyOn(inviteCodeService, 'resolveInviteCode').mockResolvedValue(validatedInvite);
    jest.spyOn(inviteCodeService, '_validateUnifiedInvite').mockResolvedValue(validatedInvite);
    jest.spyOn(inviteCodeService, 'getAdmissionGlobalQuota').mockResolvedValue(1);
    jest.spyOn(inviteCodeService, 'countGlobalAdmissionUsage').mockResolvedValue(1);
    jest.spyOn(inviteCodeService, 'countUserAdmissionUsage').mockResolvedValue(0);
    userService.findById.mockResolvedValue({
      userId: 'issuer_quota',
      role: 'parent',
      status: 'active',
      isVirtual: false,
      isSystemAdmin: false,
      systemAccessLevel: 'normal',
      canIssueAdmissionCode: true,
      admissionCodeQuotaTotal: 3
    });

    await expect(inviteCodeService.consumeForNewUser({
      code: 'U123456789',
      wechatData: { openid: 'openid_1', unionid: 'union_1' },
      profileSnapshot: {},
      connection
    })).rejects.toMatchObject({
      code: 'INVITE_CODE_GLOBAL_QUOTA_EXCEEDED'
    });
  });

  it('消费新用户邀请码时若发码人个人额度已用尽，应拒绝继续创建用户', async () => {
    const connection = { execute: jest.fn() };
    const validatedInvite = {
      source: 'unified',
      inviteCodeId: 'inv_user_quota',
      code: 'U987654321',
      purpose: INVITE_CODE_PURPOSE.ADMISSION_ONLY,
      issuerUserId: 'issuer_user_quota',
      usedCount: 0,
      maxUses: 1
    };

    jest.spyOn(inviteCodeService, 'resolveInviteCode').mockResolvedValue(validatedInvite);
    jest.spyOn(inviteCodeService, '_validateUnifiedInvite').mockResolvedValue(validatedInvite);
    jest.spyOn(inviteCodeService, 'getAdmissionGlobalQuota').mockResolvedValue(null);
    jest.spyOn(inviteCodeService, 'countGlobalAdmissionUsage').mockResolvedValue(0);
    jest.spyOn(inviteCodeService, 'countUserAdmissionUsage').mockResolvedValue(2);
    userService.findById.mockResolvedValue({
      userId: 'issuer_user_quota',
      role: 'parent',
      status: 'active',
      isVirtual: false,
      isSystemAdmin: false,
      systemAccessLevel: 'normal',
      canIssueAdmissionCode: true,
      admissionCodeQuotaTotal: 2
    });

    await expect(inviteCodeService.consumeForNewUser({
      code: 'U987654321',
      wechatData: { openid: 'openid_2', unionid: 'union_2' },
      profileSnapshot: {},
      connection
    })).rejects.toMatchObject({
      code: 'INVITE_CODE_QUOTA_EXCEEDED'
    });
    expect(userService.createUser).not.toHaveBeenCalled();
  });
});
