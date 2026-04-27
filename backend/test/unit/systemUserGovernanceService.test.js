jest.mock('../../config/database', () => ({
  getPool: jest.fn(),
  query: jest.fn(),
  execute: jest.fn()
}));
jest.mock('../../services/userService', () => ({
  findById: jest.fn(),
  countNormalSystemAdmins: jest.fn()
}));
jest.mock('../../services/inviteCodeService', () => ({
  disableActiveInvitesByIssuer: jest.fn()
}));
jest.mock('../../services/familyService', () => ({
  clearLegacyInviteCodeByIssuer: jest.fn()
}));
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
}));

const db = require('../../config/database');
const inviteCodeService = require('../../services/inviteCodeService');
const familyService = require('../../services/familyService');
const userService = require('../../services/userService');
const systemUserGovernanceService = require('../../services/systemUserGovernanceService');

describe('systemUserGovernanceService', () => {
  let connection;

  beforeEach(() => {
    jest.clearAllMocks();
    connection = {
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn(),
      execute: jest.fn()
    };
    db.getPool.mockReturnValue({
      getConnection: jest.fn().mockResolvedValue(connection)
    });
  });

  it('应返回筛选后的可治理用户列表与汇总', async () => {
    db.query
      .mockResolvedValueOnce([
        {
          user_id: 'user_1',
          nickname: '家长A',
          role: 'parent',
          family_id: 'fam_1',
          family_permission_role: 'manager',
          is_system_admin: 1,
          is_virtual: 0,
          system_access_level: 'blocked',
          system_access_updated_at: '2026-04-26 10:00:00',
          system_access_updated_by_user_id: 'admin_1',
          can_issue_admission_code: 0,
          admission_code_quota_total: null,
          admission_code_quota_used: 0
        }
      ])
      .mockResolvedValueOnce([
        { normal: 0, readonly: 0, blocked: 1 }
      ]);

    const result = await systemUserGovernanceService.listGovernableUsers({
      role: 'parent'
    });

    expect(result).toEqual({
      users: [
        expect.objectContaining({
          userId: 'user_1',
          systemAccessLevel: 'blocked',
          isSystemAdmin: true
        })
      ],
      summary: {
        normal: 0,
        readonly: 0,
        blocked: 1
      },
      nextCursor: '',
      hasMore: false
    });
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('发码状态筛选应按当前有效能力而不是原始字段过滤', async () => {
    db.query
      .mockResolvedValueOnce([
        {
          user_id: 'user_1',
          nickname: '管理员家长',
          role: 'parent',
          family_id: 'fam_1',
          family_permission_role: 'manager',
          is_system_admin: 1,
          is_virtual: 0,
          system_access_level: 'normal',
          can_issue_admission_code: 0,
          admission_code_quota_total: null,
          admission_code_quota_used: 0,
          system_access_updated_at: '2026-04-26 10:00:00',
          system_access_updated_by_user_id: 'admin_1'
        },
        {
          user_id: 'user_4',
          nickname: '普通家长',
          role: 'parent',
          family_id: 'fam_1',
          family_permission_role: 'viewer',
          is_system_admin: 0,
          is_virtual: 0,
          system_access_level: 'normal',
          can_issue_admission_code: 1,
          admission_code_quota_total: 2,
          admission_code_quota_used: 0,
          system_access_updated_at: '2026-04-26 08:00:00',
          system_access_updated_by_user_id: 'admin_1'
        }
      ])
      .mockResolvedValueOnce([{ normal: 2, readonly: 0, blocked: 0 }])
      .mockResolvedValueOnce([
        {
          user_id: 'user_2',
          nickname: '只读家长',
          role: 'parent',
          family_id: 'fam_1',
          family_permission_role: 'viewer',
          is_system_admin: 0,
          is_virtual: 0,
          system_access_level: 'normal',
          can_issue_admission_code: 1,
          admission_code_quota_total: null,
          admission_code_quota_used: 0,
          system_access_updated_at: '2026-04-26 08:30:00',
          system_access_updated_by_user_id: 'admin_1'
        },
        {
          user_id: 'user_3',
          nickname: '普通家长',
          role: 'parent',
          family_id: 'fam_1',
          family_permission_role: 'viewer',
          is_system_admin: 0,
          is_virtual: 0,
          system_access_level: 'readonly',
          can_issue_admission_code: 1,
          admission_code_quota_total: 3,
          admission_code_quota_used: 0,
          system_access_updated_at: '2026-04-26 09:00:00',
          system_access_updated_by_user_id: 'admin_1'
        }
      ])
      .mockResolvedValueOnce([{ normal: 1, readonly: 1, blocked: 0 }]);

    const canIssueResult = await systemUserGovernanceService.listGovernableUsers({
      canIssueAdmissionCode: 'true'
    });
    const cannotIssueResult = await systemUserGovernanceService.listGovernableUsers({
      canIssueAdmissionCode: 'false'
    });

    expect(canIssueResult.users.map((item) => item.userId)).toEqual(['user_1', 'user_4']);
    expect(cannotIssueResult.users.map((item) => item.userId)).toEqual(['user_2', 'user_3']);
    expect(db.query).toHaveBeenCalledTimes(4);
  });

  it('非法访问级别应返回 SYSTEM_USER_GOVERNANCE_INVALID', async () => {
    await expect(systemUserGovernanceService.updateAccessLevel('user_1', 'closed', 'admin_1')).rejects.toMatchObject({
      code: 'SYSTEM_USER_GOVERNANCE_INVALID'
    });
  });

  it('虚拟用户不可作为治理目标', async () => {
    userService.findById.mockResolvedValue({
      userId: 'virtual_1',
      isVirtual: true
    });

    await expect(systemUserGovernanceService.updateAccessLevel('virtual_1', 'readonly', 'admin_1')).rejects.toMatchObject({
      code: 'SYSTEM_USER_GOVERNANCE_TARGET_INVALID'
    });
  });

  it('最后一个 normal 系统管理员不可被降为 readonly', async () => {
    userService.findById.mockResolvedValue({
      userId: 'admin_1',
      isVirtual: false,
      isSystemAdmin: true,
      systemAccessLevel: 'normal'
    });
    userService.countNormalSystemAdmins.mockResolvedValue(0);

    await expect(systemUserGovernanceService.updateAccessLevel('admin_1', 'readonly', 'admin_2')).rejects.toMatchObject({
      code: 'SYSTEM_USER_LAST_ADMIN_NORMAL_REQUIRED'
    });
  });

  it('更新成功后应返回最新摘要', async () => {
    userService.findById
      .mockResolvedValueOnce({
        userId: 'user_1',
        isVirtual: false,
        isSystemAdmin: false,
        systemAccessLevel: 'normal',
        role: 'parent',
        familyId: 'fam_1'
      })
      .mockResolvedValueOnce({
        userId: 'user_1',
        systemAccessLevel: 'readonly',
        systemAccessUpdatedAt: '2026-04-26 12:00:00',
        systemAccessUpdatedByUserId: 'admin_1'
      });
    connection.execute.mockResolvedValue([{ affectedRows: 1 }]);

    const result = await systemUserGovernanceService.updateAccessLevel('user_1', 'readonly', 'admin_1');

    expect(connection.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users'),
      ['readonly', 'admin_1', 'user_1', 'active']
    );
    expect(result).toEqual({
      userId: 'user_1',
      systemAccessLevel: 'readonly',
      systemAccessUpdatedAt: '2026-04-26 12:00:00',
      systemAccessUpdatedByUserId: 'admin_1'
    });
    expect(inviteCodeService.disableActiveInvitesByIssuer).toHaveBeenCalledWith('user_1', {
      connection
    });
    expect(familyService.clearLegacyInviteCodeByIssuer).toHaveBeenCalledWith('fam_1', 'user_1', {
      connection
    });
    expect(connection.commit).toHaveBeenCalled();
  });

  it('停用新用户发码能力后应失效该用户已有新用户邀请码', async () => {
    userService.findById
      .mockResolvedValueOnce({
        userId: 'user_2',
        isVirtual: false,
        role: 'parent',
        systemAccessLevel: 'normal'
      })
      .mockResolvedValueOnce({
        userId: 'user_2',
        canIssueAdmissionCode: false,
        admissionCodeQuotaTotal: null
      });
    connection.execute.mockResolvedValue([{ affectedRows: 1 }]);

    const result = await systemUserGovernanceService.updateAdmissionIssuer('user_2', {
      canIssueAdmissionCode: false,
      admissionCodeQuotaTotal: null
    }, 'admin_1');

    expect(inviteCodeService.disableActiveInvitesByIssuer).toHaveBeenCalledWith('user_2', {
      purpose: 'admission_only',
      connection
    });
    expect(result).toEqual({
      userId: 'user_2',
      canIssueAdmissionCode: false,
      admissionCodeQuotaTotal: null
    });
    expect(connection.commit).toHaveBeenCalled();
  });

  it('保留新用户发码能力时不应误失效已有邀请码', async () => {
    userService.findById
      .mockResolvedValueOnce({
        userId: 'user_3',
        isVirtual: false,
        role: 'parent',
        systemAccessLevel: 'normal'
      })
      .mockResolvedValueOnce({
        userId: 'user_3',
        canIssueAdmissionCode: true,
        admissionCodeQuotaTotal: 3
      });
    connection.execute.mockResolvedValue([{ affectedRows: 1 }]);

    await systemUserGovernanceService.updateAdmissionIssuer('user_3', {
      canIssueAdmissionCode: true,
      admissionCodeQuotaTotal: 3
    }, 'admin_1');

    expect(inviteCodeService.disableActiveInvitesByIssuer).not.toHaveBeenCalledWith('user_3', {
      purpose: 'admission_only',
      connection
    });
    expect(connection.commit).toHaveBeenCalled();
  });
});
