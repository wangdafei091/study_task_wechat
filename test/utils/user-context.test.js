jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const userContextUtils = require('../../utils/user-context');

describe('utils/user-context', () => {
  const parentUser = {
    userId: 'parent-1',
    role: 'parent',
    familyId: 'family-1',
    familyPermissionRole: 'manager'
  };

  const viewerParentUser = {
    userId: 'parent-viewer',
    role: 'parent',
    familyId: 'family-1',
    familyPermissionRole: 'viewer'
  };

  const childUser = {
    userId: 'child-1',
    role: 'child',
    familyId: 'family-1'
  };

  const secondChildUser = {
    userId: 'child-2',
    role: 'child',
    familyId: 'family-1'
  };

  describe('createUserContextSnapshot', () => {
    it('应识别家长设备切到孩子视角的快照', () => {
      const snapshot = userContextUtils.createUserContextSnapshot({
        loginUser: parentUser,
        currentUser: childUser,
        availableUsers: [parentUser, childUser, { ...secondChildUser, status: 'inactive' }]
      });

      expect(snapshot).toEqual(expect.objectContaining({
        loginUserId: 'parent-1',
        loginUserRole: 'parent',
        viewUserId: 'child-1',
        viewUserRole: 'child',
        familyId: 'family-1',
        activeChildUserIds: ['child-1'],
        isParentDevice: true,
        isChildDevice: false,
        isParentView: false,
        isChildView: true
      }));
    });

    it('应支持根据 currentUserId 从 availableUsers 解析视角用户', () => {
      const snapshot = userContextUtils.createUserContextSnapshot({
        loginUser: parentUser,
        currentUserId: 'child-2',
        availableUsers: [parentUser, childUser, secondChildUser]
      });

      expect(snapshot.viewUserId).toBe('child-2');
      expect(snapshot.viewUserRole).toBe('child');
      expect(snapshot.activeChildUserIds).toEqual(['child-1', 'child-2']);
    });
  });

  describe('resolveReadContext', () => {
    it('家长看自己且有家庭时应解析为 family scope', () => {
      const result = userContextUtils.resolveReadContext({
        loginUser: parentUser,
        currentUser: parentUser,
        availableUsers: [parentUser, childUser, secondChildUser]
      });

      expect(result).toEqual({
        scope: 'family',
        subjectUserId: null,
        childUserIds: ['child-1', 'child-2'],
        familyId: 'family-1'
      });
    });

    it('孩子视角应解析为 user scope', () => {
      const result = userContextUtils.resolveReadContext({
        loginUser: parentUser,
        currentUser: childUser,
        availableUsers: [parentUser, childUser]
      });

      expect(result).toEqual({
        scope: 'user',
        subjectUserId: 'child-1',
        childUserIds: ['child-1'],
        familyId: 'family-1'
      });
    });
  });

  describe('resolveDefaultSubjectUserId', () => {
    it('家长自己视角时不应隐式猜测主体孩子', () => {
      const result = userContextUtils.resolveDefaultSubjectUserId({
        loginUser: parentUser,
        currentUser: parentUser,
        availableUsers: [parentUser, childUser]
      });

      expect(result).toBeNull();
    });

    it('孩子设备应默认以自己为主体', () => {
      const result = userContextUtils.resolveDefaultSubjectUserId({
        loginUser: childUser,
        currentUser: childUser,
        availableUsers: [childUser]
      });

      expect(result).toBe('child-1');
    });
  });

  describe('resolveMutationContext', () => {
    it('家长代孩子执行动作时应保持 execute actor=孩子', () => {
      const result = userContextUtils.resolveMutationContext({
        loginUser: parentUser,
        currentUser: childUser,
        availableUsers: [parentUser, childUser]
      }, {
        operationMode: 'execute'
      });

      expect(result).toEqual(expect.objectContaining({
        loginUserId: 'parent-1',
        managementActorUserId: 'parent-1',
        managementActorRole: 'parent',
        executionActorUserId: 'child-1',
        executionActorRole: 'child',
        subjectUserId: 'child-1',
        targetUserId: 'child-1',
        familyId: 'family-1',
        operationMode: 'execute',
        viewUserId: 'child-1',
        viewUserRole: 'child'
      }));
    });

    it('家长代孩子管理动作时应保持 manage actor=家长', () => {
      const result = userContextUtils.resolveMutationContext({
        loginUser: parentUser,
        currentUser: childUser,
        availableUsers: [parentUser, childUser]
      }, {
        operationMode: 'manage'
      });

      expect(result.managementActorUserId).toBe('parent-1');
      expect(result.managementActorRole).toBe('parent');
      expect(result.executionActorUserId).toBe('parent-1');
      expect(result.executionActorRole).toBe('parent');
      expect(result.subjectUserId).toBe('child-1');
      expect(result.targetUserId).toBe('child-1');
    });

    it('家长自己视角下应允许显式 targetUserId 覆盖主体', () => {
      const result = userContextUtils.resolveMutationContext({
        loginUser: parentUser,
        currentUser: parentUser,
        availableUsers: [parentUser, childUser]
      }, {
        operationMode: 'manage',
        targetUserId: 'child-1'
      });

      expect(result.subjectUserId).toBe('child-1');
      expect(result.targetUserId).toBe('child-1');
      expect(result.managementActorUserId).toBe('parent-1');
    });
  });

  describe('resolvePermissionContext', () => {
    it('家长切到孩子视角时应输出只读权限上下文', () => {
      const result = userContextUtils.resolvePermissionContext({
        loginUser: parentUser,
        currentUser: childUser,
        availableUsers: [parentUser, childUser]
      }, {
        lastActiveChildId: 'child-1'
      });

      expect(result).toEqual(expect.objectContaining({
        loginUserId: 'parent-1',
        loginUserRole: 'parent',
        familyPermissionRole: 'manager',
        viewUserId: 'child-1',
        viewUserRole: 'child',
        canManageMembers: true,
        isSwitchedChildView: true,
        isViewerReadonly: false,
        isReadonlyView: true,
        canManageFamilyGovernance: false,
        canManageBusinessData: false,
        lastActiveChildId: 'child-1'
      }));
      expect(result.userPermissions.task.complete).toBe(true);
      expect(result.userPermissions.task.create).toBe(false);
      expect(result.userPermissions.reward.exchange).toBe(true);
      expect(result.userPermissions.reward.manage).toBe(false);
    });

    it('查看者家长看自己时应保持只读但不混同为孩子视角', () => {
      const result = userContextUtils.resolvePermissionContext({
        loginUser: viewerParentUser,
        currentUser: viewerParentUser,
        availableUsers: [viewerParentUser, childUser]
      });

      expect(result).toEqual(expect.objectContaining({
        loginUserId: 'parent-viewer',
        loginUserRole: 'parent',
        familyPermissionRole: 'viewer',
        viewUserId: 'parent-viewer',
        viewUserRole: 'parent',
        canManageMembers: true,
        isSwitchedChildView: false,
        isViewerReadonly: true,
        isReadonlyView: true,
        canManageFamilyGovernance: false,
        canManageBusinessData: false
      }));
      expect(result.userPermissions.task.create).toBe(false);
      expect(result.userPermissions.reward.manage).toBe(false);
    });

    it('查看者家长切到孩子视角时不应误判为 viewer 只读，执行权限应按孩子口径计算', () => {
      const result = userContextUtils.resolvePermissionContext({
        loginUser: viewerParentUser,
        currentUser: childUser,
        availableUsers: [viewerParentUser, childUser]
      }, {
        lastActiveChildId: 'child-1'
      });

      expect(result).toEqual(expect.objectContaining({
        loginUserId: 'parent-viewer',
        loginUserRole: 'parent',
        familyPermissionRole: 'viewer',
        viewUserId: 'child-1',
        viewUserRole: 'child',
        isSwitchedChildView: true,
        isViewerReadonly: false,
        isReadonlyView: true,
        canManageFamilyGovernance: false,
        canManageBusinessData: false,
        lastActiveChildId: 'child-1'
      }));
      expect(result.userPermissions.task.complete).toBe(true);
      expect(result.userPermissions.task.create).toBe(false);
      expect(result.userPermissions.reward.exchange).toBe(true);
      expect(result.userPermissions.reward.manage).toBe(false);
    });

    it('未加入家庭的家长不应被误判为查看者只读', () => {
      const result = userContextUtils.resolvePermissionContext({
        loginUser: {
          userId: 'solo-parent',
          role: 'parent',
          familyId: null,
          familyPermissionRole: null
        },
        currentUser: {
          userId: 'solo-parent',
          role: 'parent',
          familyId: null,
          familyPermissionRole: null
        },
        availableUsers: []
      });

      expect(result).toEqual(expect.objectContaining({
        familyPermissionRole: null,
        isViewerReadonly: false,
        isReadonlyView: false,
        canManageFamilyGovernance: false,
        canManageBusinessData: true
      }));
      expect(result.userPermissions.task.create).toBe(true);
    });

    it('未登录时应安全降级', () => {
      const snapshot = userContextUtils.createUserContextSnapshot();
      const readContext = userContextUtils.resolveReadContext();
      const permissionContext = userContextUtils.resolvePermissionContext();

      expect(snapshot.loginUserId).toBeNull();
      expect(snapshot.viewUserId).toBeNull();
      expect(readContext).toEqual({
        scope: 'user',
        subjectUserId: null,
        childUserIds: [],
        familyId: null
      });
      expect(permissionContext).toEqual({
        loginUserId: null,
        loginUserRole: null,
        familyPermissionRole: null,
        viewUserId: null,
        viewUserRole: null,
        canManageMembers: false,
        isSwitchedChildView: false,
        isViewerReadonly: false,
        isSystemBlocked: false,
        isSystemReadonly: false,
        isReadonlyView: false,
        readonlyReason: '',
        systemAccessLevel: 'normal',
        canManageFamilyGovernance: false,
        canManageBusinessData: false,
        userPermissions: {},
        lastActiveChildId: null
      });
    });
  });
});
