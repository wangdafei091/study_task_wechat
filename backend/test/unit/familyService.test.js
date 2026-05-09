jest.mock('../../config/database', () => ({
  pool: {
    getConnection: jest.fn()
  },
  query: jest.fn(),
  execute: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
}));
jest.mock('../../services/userService', () => ({
  findActiveById: jest.fn(),
  findById: jest.fn()
}));

const db = require('../../config/database');
const familyService = require('../../services/familyService');
const userService = require('../../services/userService');

describe('familyService.updateMemberPermissionRole', () => {
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
    db.pool.getConnection.mockResolvedValue(connection);
  });

  it('应在事务内锁定并更新家长权限', async () => {
    connection.execute.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM users') && sql.includes('ORDER BY user_id ASC FOR UPDATE')) {
        return [[{
          user_id: 'operator_1',
          family_id: 'fam_1',
          role: 'parent',
          family_permission_role: 'manager',
          is_virtual: 0,
          nickname: '管理员'
        }, {
          user_id: 'parent_2',
          family_id: 'fam_1',
          role: 'parent',
          family_permission_role: 'viewer',
          is_virtual: 0,
          nickname: '家长2'
        }]];
      }

      if (sql.includes('FROM users') && sql.includes("family_permission_role = ?")) {
        return [[{ user_id: 'operator_1' }]];
      }

      if (sql.includes('UPDATE users')) {
        return [[{ affectedRows: 1 }]];
      }

      throw new Error(`unexpected sql: ${sql}`);
    });

    const result = await familyService.updateMemberPermissionRole(
      'operator_1',
      'fam_1',
      'parent_2',
      'manager'
    );

    expect(result).toEqual({
      userId: 'parent_2',
      familyPermissionRole: 'manager'
    });
    expect(connection.beginTransaction).toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalled();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalled();
    expect(connection.execute).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY user_id ASC FOR UPDATE'),
      ['operator_1', 'parent_2', 'active']
    );
  });

  it('最后一个管理员降级失败时应回滚事务', async () => {
    connection.execute.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM users') && sql.includes('ORDER BY user_id ASC FOR UPDATE')) {
        return [[{
          user_id: 'operator_1',
          family_id: 'fam_1',
          role: 'parent',
          family_permission_role: 'manager',
          is_virtual: 0,
          nickname: '管理员'
        }]];
      }

      if (sql.includes('FROM users') && sql.includes("family_permission_role = ?")) {
        return [[{ user_id: 'operator_1' }]];
      }

      throw new Error(`unexpected sql: ${sql}`);
    });

    await expect(familyService.updateMemberPermissionRole(
      'operator_1',
      'fam_1',
      'operator_1',
      'viewer'
    )).rejects.toMatchObject({
      code: 'FAMILY_LAST_MANAGER_REQUIRED'
    });

    expect(connection.beginTransaction).toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalled();
  });
});

describe('familyService.joinFamily', () => {
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
    db.pool.getConnection.mockResolvedValue(connection);
  });

  it('家长邀请码加入后应默认落位 viewer', async () => {
    connection.execute.mockImplementation(async (sql, params) => {
      if (sql.includes('SELECT * FROM families')) {
        return [[{
          family_id: 'fam_parent',
          invite_code: 'PARENT01',
          invite_code_role: 'parent',
          invite_code_expires_at: '2099-01-01 00:00:00',
          invite_code_used_at: null,
          status: 'active'
        }]];
      }

      if (sql.includes('UPDATE users SET family_id')) {
        expect(params).toEqual(['fam_parent', 'parent', 'viewer', 'user_parent']);
        return [[{ affectedRows: 1 }]];
      }

      if (sql.includes('UPDATE families SET invite_code_used_at')) {
        return [[{ affectedRows: 1 }]];
      }

      throw new Error(`unexpected sql: ${sql}`);
    });

    const result = await familyService.joinFamily('user_parent', 'PARENT01');

    expect(result).toEqual({
      familyId: 'fam_parent',
      role: 'parent',
      familyPermissionRole: 'viewer'
    });
    expect(connection.commit).toHaveBeenCalled();
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  it('孩子邀请码加入后不应写入 familyPermissionRole', async () => {
    connection.execute.mockImplementation(async (sql, params) => {
      if (sql.includes('SELECT * FROM families')) {
        return [[{
          family_id: 'fam_child',
          invite_code: 'CHILD001',
          invite_code_role: 'child',
          invite_code_expires_at: '2099-01-01 00:00:00',
          invite_code_used_at: null,
          status: 'active'
        }]];
      }

      if (sql.includes('UPDATE users SET family_id')) {
        expect(params).toEqual(['fam_child', 'child', null, 'user_child']);
        return [[{ affectedRows: 1 }]];
      }

      if (sql.includes('UPDATE families SET invite_code_used_at')) {
        return [[{ affectedRows: 1 }]];
      }

      throw new Error(`unexpected sql: ${sql}`);
    });

    const result = await familyService.joinFamily('user_child', 'CHILD001');

    expect(result).toEqual({
      familyId: 'fam_child',
      role: 'child',
      familyPermissionRole: null
    });
  });
});

describe('familyService.getCurrentFamily', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应隐藏已过期的 legacy 邀请码字段', async () => {
    db.query.mockResolvedValueOnce([{
      family_id: 'fam_1',
      name: '测试家庭',
      invite_code: 'LEGACY01',
      invite_code_role: 'parent',
      invite_code_expires_at: '2000-01-01 00:00:00',
      invite_code_used_at: null,
      created_by: 'parent_1',
      status: 'active'
    }]);

    const result = await familyService.getCurrentFamily('fam_1');

    expect(result).toEqual(expect.objectContaining({
      familyId: 'fam_1',
      inviteCode: null,
      inviteCodeRole: null,
      inviteCodeExpiresAt: null
    }));
  });
});

describe('familyService identity governance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('家长管理员可修改同家庭独立孩子昵称', async () => {
    userService.findActiveById.mockResolvedValue({
      userId: 'parent_1',
      role: 'parent',
      familyId: 'fam_1',
      familyPermissionRole: 'manager',
      isSystemBlocked: jest.fn(() => false),
      isSystemReadonly: jest.fn(() => false)
    });
    db.query.mockResolvedValueOnce([{
      user_id: 'child_1',
      nickname: '旧称呼',
      role: 'child',
      family_id: 'fam_1',
      is_virtual: 0,
      status: 'active'
    }]);
    db.execute.mockResolvedValue({ affectedRows: 1 });

    await expect(familyService.updateNickname({
      userId: 'parent_1'
    }, 'child_1', '新称呼')).resolves.toBeUndefined();

    expect(db.execute).toHaveBeenCalledWith(
      'UPDATE users SET nickname = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      ['新称呼', 'child_1']
    );
  });

  it('查看者不能修改成员昵称', async () => {
    userService.findActiveById.mockResolvedValue({
      userId: 'viewer_1',
      role: 'parent',
      familyId: 'fam_1',
      familyPermissionRole: 'viewer',
      isSystemBlocked: jest.fn(() => false),
      isSystemReadonly: jest.fn(() => false)
    });

    await expect(familyService.updateNickname({
      userId: 'viewer_1'
    }, 'child_1', '新称呼')).rejects.toMatchObject({
      code: 'FAMILY_MANAGER_REQUIRED'
    });
  });

  it('查看者家长可以修改自己的昵称', async () => {
    userService.findActiveById.mockResolvedValue({
      userId: 'viewer_1',
      role: 'parent',
      familyId: 'fam_1',
      familyPermissionRole: 'viewer',
      isSystemBlocked: jest.fn(() => false),
      isSystemReadonly: jest.fn(() => false)
    });
    db.query.mockResolvedValueOnce([{
      user_id: 'viewer_1',
      nickname: '旧称呼',
      role: 'parent',
      family_id: 'fam_1',
      is_virtual: 0,
      status: 'active'
    }]);
    db.execute.mockResolvedValue({ affectedRows: 1 });

    await expect(familyService.updateNickname({
      userId: 'viewer_1'
    }, 'viewer_1', '新称呼')).resolves.toBeUndefined();

    expect(db.execute).toHaveBeenCalledWith(
      'UPDATE users SET nickname = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      ['新称呼', 'viewer_1']
    );
  });

  it('blocked 用户会在写操作前被拒绝', async () => {
    userService.findActiveById.mockResolvedValue({
      userId: 'blocked_1',
      role: 'parent',
      familyId: 'fam_1',
      familyPermissionRole: 'manager',
      isSystemBlocked: jest.fn(() => true),
      isSystemReadonly: jest.fn(() => false)
    });

    await expect(familyService.updateNickname({
      userId: 'blocked_1'
    }, 'child_1', '新称呼')).rejects.toMatchObject({
      code: 'SYSTEM_USER_BLOCKED'
    });
  });

  it('孩子本人可修改自己的 preset 头像', async () => {
    userService.findActiveById.mockResolvedValue({
      userId: 'child_1',
      role: 'child',
      familyId: 'fam_1',
      familyPermissionRole: null,
      isSystemBlocked: jest.fn(() => false),
      isSystemReadonly: jest.fn(() => false)
    });
    userService.findById.mockResolvedValue({
      userId: 'child_1',
      role: 'child',
      familyId: 'fam_1'
    });
    db.execute.mockResolvedValue({ affectedRows: 1 });

    await expect(familyService.updateChildAvatarPreset({
      userId: 'child_1'
    }, 'child_1', 'fox')).resolves.toEqual({
      userId: 'child_1',
      avatar: 'preset:fox'
    });
  });

  it('父母管理员不能给自己设置孩子 preset 头像', async () => {
    userService.findActiveById.mockResolvedValue({
      userId: 'parent_1',
      role: 'parent',
      familyId: 'fam_1',
      familyPermissionRole: 'manager',
      isSystemBlocked: jest.fn(() => false),
      isSystemReadonly: jest.fn(() => false)
    });
    userService.findById.mockResolvedValue({
      userId: 'parent_1',
      role: 'parent',
      familyId: 'fam_1'
    });

    await expect(familyService.updateChildAvatarPreset({
      userId: 'parent_1'
    }, 'parent_1', 'fox')).rejects.toMatchObject({
      code: 'FAMILY_CHILD_ONLY'
    });
  });
});
