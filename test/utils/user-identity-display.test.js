const {
  buildHeaderIdentityDisplay,
  buildIdentityDisplayModel,
  buildProgressCompanionDisplay,
  buildSwitcherDisplayState,
  isLegacyAvatarPlaceholder,
  isStableImageAvatar
} = require('../../utils/user-identity-display');

describe('utils/user-identity-display', () => {
  const basePermissionContext = {
    loginUserId: 'parent_1',
    loginUserRole: 'parent',
    familyId: 'family_1',
    familyPermissionRole: 'manager',
    isSystemBlocked: false,
    isSystemReadonly: false,
    isViewerReadonly: false,
    isSwitchedChildView: false,
    canManageFamilyGovernance: true
  };

  it('应将 legacy emoji 头像归一化为正式 fallback', () => {
    expect(isLegacyAvatarPlaceholder('👩‍💼')).toBe(true);
    expect(isStableImageAvatar('👶')).toBe(false);

    const model = buildIdentityDisplayModel({
      user: {
        userId: 'parent_1',
        role: 'parent',
        name: '妈妈',
        avatar: '👩‍💼'
      },
      currentUserId: 'parent_1',
      loginUserId: 'parent_1',
      permissionContext: basePermissionContext
    });

    expect(model.avatarMode).toBe('initial');
    expect(model.avatarText).toBe('妈');
  });

  it('应识别孩子 preset 头像并导出 emoji 信息', () => {
    const model = buildIdentityDisplayModel({
      user: {
        userId: 'child_1',
        role: 'child',
        name: '妞妞',
        avatar: 'preset:fox'
      },
      currentUserId: 'child_1',
      loginUserId: 'child_1',
      permissionContext: {
        ...basePermissionContext,
        loginUserId: 'child_1',
        loginUserRole: 'child',
        isSwitchedChildView: true
      }
    });

    expect(model.avatarMode).toBe('preset');
    expect(model.avatarPresetId).toBe('fox');
    expect(model.avatarEmoji).toBe('🦊');
    expect(model.managementActions).toEqual(['rename', 'pickAvatar']);
  });

  it('应为家长本人、孩子本人和家长管理孩子导出正确动作', () => {
    const parentSelf = buildIdentityDisplayModel({
      user: {
        userId: 'parent_1',
        role: 'parent',
        name: '爸爸',
        familyId: 'family_1',
        familyPermissionRole: 'manager'
      },
      currentUserId: 'parent_1',
      loginUserId: 'parent_1',
      permissionContext: basePermissionContext
    });

    const managedChild = buildIdentityDisplayModel({
      user: {
        userId: 'child_1',
        role: 'child',
        name: '妞妞',
        familyId: 'family_1',
        isVirtual: true
      },
      currentUserId: 'child_1',
      loginUserId: 'parent_1',
      permissionContext: {
        ...basePermissionContext,
        isSwitchedChildView: true
      }
    });

    expect(parentSelf.managementActions).toEqual(['rename']);
    expect(managedChild.canDelete).toBe(false);
    expect(managedChild.managementActions).toEqual(['rename', 'pickAvatar']);
  });

  it('viewer 和 blocked 不应导出任何管理动作', () => {
    const viewerChild = buildIdentityDisplayModel({
      user: {
        userId: 'child_1',
        role: 'child',
        name: '妞妞',
        familyId: 'family_1',
        isVirtual: true
      },
      currentUserId: 'child_1',
      loginUserId: 'parent_viewer',
      permissionContext: {
        ...basePermissionContext,
        loginUserId: 'parent_viewer',
        familyPermissionRole: 'viewer',
        isViewerReadonly: true,
        canManageFamilyGovernance: false
      }
    });

    const blockedChild = buildIdentityDisplayModel({
      user: {
        userId: 'child_1',
        role: 'child',
        name: '妞妞',
        familyId: 'family_1',
        isVirtual: true
      },
      currentUserId: 'child_1',
      loginUserId: 'parent_1',
      permissionContext: {
        ...basePermissionContext,
        isSystemBlocked: true,
        canManageFamilyGovernance: false
      }
    });

    expect(viewerChild.managementActions).toEqual([]);
    expect(blockedChild.managementActions).toEqual([]);
  });

  it('首页头部应始终表达 currentUser 而不是登录者资料', () => {
    const header = buildHeaderIdentityDisplay({
      currentUser: {
        userId: 'child_2',
        role: 'child',
        name: '乐乐',
        avatar: 'preset:rabbit'
      },
      loginUserId: 'parent_1',
      permissionContext: {
        ...basePermissionContext,
        isSwitchedChildView: true
      }
    });

    expect(header.primaryName).toBe('乐乐');
    expect(header.avatarMode).toBe('preset');
    expect(header.avatarEmoji).toBe('🐰');
  });

  it('进度条伙伴应跟随当前展示数据归属孩子，而不是操作者身份', () => {
    const companion = buildProgressCompanionDisplay({
      currentUser: {
        userId: 'parent_1',
        role: 'parent',
        name: '爸爸'
      },
      availableUsers: [
        {
          userId: 'parent_1',
          role: 'parent',
          name: '爸爸'
        },
        {
          userId: 'child_2',
          role: 'child',
          name: '乐乐',
          avatar: 'preset:panda'
        }
      ],
      canManageMembers: true,
      lastActiveChildId: 'child_2'
    });

    expect(companion.userId).toBe('child_2');
    expect(companion.emoji).toBe('🐼');
    expect(companion.isFallback).toBe(false);
  });

  it('进度条伙伴在无法确定孩子 preset 头像时应回退小鸡', () => {
    const companion = buildProgressCompanionDisplay({
      currentUser: {
        userId: 'parent_1',
        role: 'parent',
        name: '爸爸'
      },
      availableUsers: [
        {
          userId: 'parent_1',
          role: 'parent',
          name: '爸爸'
        }
      ],
      canManageMembers: true,
      lastActiveChildId: ''
    });

    expect(companion.emoji).toBe('🐥');
    expect(companion.isFallback).toBe(true);
  });

  it('切换面板状态应输出当前卡、候选成员和底部动作', () => {
    const state = buildSwitcherDisplayState({
      currentUser: {
        userId: 'child_1',
        role: 'child',
        name: '妞妞',
        familyId: 'family_1'
      },
      availableUsers: [
        {
          userId: 'parent_1',
          role: 'parent',
          name: '妈妈',
          familyId: 'family_1',
          familyPermissionRole: 'manager'
        },
        {
          userId: 'child_1',
          role: 'child',
          name: '妞妞',
          familyId: 'family_1'
        },
        {
          userId: 'child_2',
          role: 'child',
          name: '乐乐',
          familyId: 'family_1',
          avatar: 'preset:cat'
        }
      ],
      loginUserId: 'parent_1',
      permissionContext: {
        ...basePermissionContext,
        isSwitchedChildView: true,
        canManageFamilyGovernance: false
      }
    });

    expect(state.currentCard.primaryName).toBe('妞妞');
    expect(state.switchableUsers).toHaveLength(2);
    expect(state.footerAction.visible).toBe(false);
  });
});
