jest.mock('../../config/database', () => ({
  query: jest.fn(),
  execute: jest.fn()
}));
jest.mock('../../services/userService', () => ({
  findById: jest.fn(),
  countNormalSystemAdmins: jest.fn()
}));
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
}));

const db = require('../../config/database');
const userService = require('../../services/userService');
const systemUserGovernanceService = require('../../services/systemUserGovernanceService');

describe('systemUserGovernanceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应按状态优先级返回可治理用户列表', async () => {
    db.query.mockResolvedValue([
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
        system_access_updated_by_user_id: 'admin_1'
      }
    ]);

    const result = await systemUserGovernanceService.listGovernableUsers();

    expect(result).toEqual([expect.objectContaining({
      userId: 'user_1',
      systemAccessLevel: 'blocked',
      isSystemAdmin: true
    })]);
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
        systemAccessLevel: 'normal'
      })
      .mockResolvedValueOnce({
        userId: 'user_1',
        systemAccessLevel: 'readonly',
        systemAccessUpdatedAt: '2026-04-26 12:00:00',
        systemAccessUpdatedByUserId: 'admin_1'
      });
    db.execute.mockResolvedValue({ affectedRows: 1 });

    const result = await systemUserGovernanceService.updateAccessLevel('user_1', 'readonly', 'admin_1');

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users'),
      ['readonly', 'admin_1', 'user_1', 'active']
    );
    expect(result).toEqual({
      userId: 'user_1',
      systemAccessLevel: 'readonly',
      systemAccessUpdatedAt: '2026-04-26 12:00:00',
      systemAccessUpdatedByUserId: 'admin_1'
    });
  });
});
