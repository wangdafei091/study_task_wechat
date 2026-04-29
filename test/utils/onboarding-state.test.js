const onboardingState = require('../../utils/app/onboarding-state');

describe('utils/app/onboarding-state', () => {
  it('家长无家庭时应返回创建家庭阶段', () => {
    const result = onboardingState.resolveOnboardingStage({
      loginUser: { role: 'parent' },
      currentUser: { role: 'parent' }
    });

    expect(result).toEqual(expect.objectContaining({
      stage: 'no_family_parent',
      title: '先创建你的家庭'
    }));
    expect(result.primaryAction).toEqual({
      type: 'create_family',
      text: '创建家庭'
    });
    expect(result.secondaryAction).toEqual({
      type: 'join_with_code',
      text: '输入邀请码加入'
    });
  });

  it('已创建家庭但没有孩子时应返回添加孩子阶段', () => {
    const result = onboardingState.resolveOnboardingStage({
      family: { familyId: 'fam_1' },
      loginUser: { role: 'parent' },
      currentUser: { role: 'parent' },
      canManageMembers: true,
      members: [{ userId: 'parent_1', role: 'parent' }]
    });

    expect(result).toEqual(expect.objectContaining({
      stage: 'family_no_child',
      title: '先把孩子加进家庭'
    }));
    expect(result.primaryAction).toEqual({
      type: 'add_child',
      text: '去添加孩子'
    });
  });

  it('创建家庭成功后应在无孩子阶段使用一次性承接文案', () => {
    const result = onboardingState.resolveOnboardingStage({
      family: { familyId: 'fam_1' },
      loginUser: { role: 'parent' },
      currentUser: { role: 'parent' },
      canManageMembers: true,
      members: [{ userId: 'parent_1', role: 'parent' }],
      pendingOnboardingContext: {
        source: onboardingState.ONBOARDING_SOURCE.CREATE_FAMILY
      }
    });

    expect(result).toEqual(expect.objectContaining({
      stage: 'family_no_child',
      title: '家庭已创建',
      emphasis: 'first-entry',
      dismissAfterConsume: true
    }));
  });

  it('首页在搜索态、未来日期或消息预览态不应显示 onboarding 卡', () => {
    expect(onboardingState.shouldShowHomeOnboardingCard({
      isViewingToday: true,
      isViewingFuture: false,
      showSearch: false,
      showMessagePreview: false
    })).toBe(true);

    expect(onboardingState.shouldShowHomeOnboardingCard({
      isViewingToday: true,
      isViewingFuture: false,
      showSearch: true,
      showMessagePreview: false
    })).toBe(false);

    expect(onboardingState.shouldShowHomeOnboardingCard({
      isViewingToday: false,
      isViewingFuture: true,
      showSearch: false,
      showMessagePreview: false
    })).toBe(false);

    expect(onboardingState.shouldShowHomeOnboardingCard({
      isViewingToday: true,
      isViewingFuture: false,
      showSearch: false,
      showMessagePreview: true
    })).toBe(false);
  });

  it('首页承接阶段不应展示 no_family 阶段卡', () => {
    const result = onboardingState.resolveOnboardingStage({
      loginUser: { role: 'parent' },
      currentUser: { role: 'parent' },
      skipNoFamilyStages: true
    });

    expect(result).toEqual(expect.objectContaining({
      stage: 'stable_none'
    }));
  });

  it('首页在屏蔽常规 no_family 阶段时，仍应承接访客邀请码进入后的下一步', () => {
    const result = onboardingState.resolveOnboardingStage({
      loginUser: { role: 'parent' },
      currentUser: { role: 'parent' },
      skipNoFamilyStages: true,
      pendingOnboardingContext: {
        source: onboardingState.ONBOARDING_SOURCE.GUEST_INVITE_ENTERED
      }
    });

    expect(result).toEqual(expect.objectContaining({
      stage: 'joined_from_invite',
      title: '你已进入小程序',
      dismissAfterConsume: true
    }));
    expect(result.primaryAction).toEqual({
      type: 'create_family',
      text: '创建家庭'
    });
    expect(result.secondaryAction).toEqual({
      type: 'join_with_code',
      text: '输入邀请码加入'
    });
  });

  it('已加入成熟家庭后，首页仍应展示一次性加入家庭承接卡', () => {
    const result = onboardingState.resolveOnboardingStage({
      family: { familyId: 'fam_1' },
      loginUser: { role: 'parent', familyId: 'fam_1' },
      currentUser: { role: 'parent', familyId: 'fam_1' },
      members: [
        { userId: 'parent_1', role: 'parent' },
        { userId: 'child_1', role: 'child' }
      ],
      canManageMembers: true,
      tasks: [{ id: 'task_1', title: '阅读' }],
      skipNoFamilyStages: true,
      pendingOnboardingContext: {
        source: onboardingState.ONBOARDING_SOURCE.INVITE_JOIN_FAMILY
      }
    });

    expect(result).toEqual(expect.objectContaining({
      stage: 'joined_from_invite',
      title: '已加入家庭',
      dismissAfterConsume: true
    }));
    expect(result.description).toContain('今天的任务安排');
  });

  it('查看者家长在首页无任务时应返回只读解释阶段，而不是孩子口径文案', () => {
    const result = onboardingState.resolveOnboardingStage({
      family: { familyId: 'fam_1' },
      loginUser: { role: 'parent', familyId: 'fam_1', familyPermissionRole: 'viewer' },
      currentUser: { role: 'parent', familyId: 'fam_1', familyPermissionRole: 'viewer' },
      members: [
        { userId: 'parent_1', role: 'parent' },
        { userId: 'child_1', role: 'child' }
      ],
      canManageMembers: false,
      isViewerReadonly: true,
      tasks: [],
      showOccurrenceSection: false
    });

    expect(result).toEqual(expect.objectContaining({
      stage: 'readonly_parent_no_task',
      title: '当前还没有任务安排',
      primaryAction: null,
      secondaryAction: null
    }));
    expect(result.description).toContain('管理员');
  });

  it('系统只读家长在无孩子时应优先返回只读说明，而不是添加孩子 CTA', () => {
    const result = onboardingState.resolveOnboardingStage({
      family: { familyId: 'fam_1' },
      loginUser: {
        role: 'parent',
        familyId: 'fam_1',
        familyPermissionRole: 'manager',
        systemAccessLevel: 'readonly'
      },
      currentUser: {
        role: 'parent',
        familyId: 'fam_1',
        familyPermissionRole: 'manager',
        systemAccessLevel: 'readonly'
      },
      members: [{ userId: 'parent_1', role: 'parent' }],
      canManageMembers: true,
      isSystemReadonly: true,
      tasks: [],
      showOccurrenceSection: false
    });

    expect(result).toEqual(expect.objectContaining({
      stage: 'readonly_parent_no_child',
      title: '当前先查看家庭信息',
      primaryAction: null,
      secondaryAction: null
    }));
    expect(result.description).toContain('只读');
  });

  it('系统只读家长在有孩子但无任务时应优先返回只读说明，而不是创建任务 CTA', () => {
    const result = onboardingState.resolveOnboardingStage({
      family: { familyId: 'fam_1' },
      loginUser: {
        role: 'parent',
        familyId: 'fam_1',
        familyPermissionRole: 'manager',
        systemAccessLevel: 'readonly'
      },
      currentUser: {
        role: 'parent',
        familyId: 'fam_1',
        familyPermissionRole: 'manager',
        systemAccessLevel: 'readonly'
      },
      members: [
        { userId: 'parent_1', role: 'parent' },
        { userId: 'child_1', role: 'child' }
      ],
      canManageMembers: true,
      isSystemReadonly: true,
      tasks: [],
      showOccurrenceSection: false
    });

    expect(result).toEqual(expect.objectContaining({
      stage: 'readonly_parent_no_task',
      title: '当前还没有任务安排',
      primaryAction: null,
      secondaryAction: null
    }));
    expect(result.description).toContain('只读');
  });

  it('一次性上下文应支持 peek、consume 与清空', () => {
    const app = { globalData: {} };

    onboardingState.setPendingOnboardingContext(app, {
      source: onboardingState.ONBOARDING_SOURCE.GUEST_INVITE_ENTERED
    });

    expect(onboardingState.peekPendingOnboardingContext(app)).toEqual(
      expect.objectContaining({
        source: onboardingState.ONBOARDING_SOURCE.GUEST_INVITE_ENTERED
      })
    );

    const consumed = onboardingState.consumePendingOnboardingContext(app);
    expect(consumed).toEqual(expect.objectContaining({
      source: onboardingState.ONBOARDING_SOURCE.GUEST_INVITE_ENTERED
    }));
    expect(onboardingState.peekPendingOnboardingContext(app)).toBeNull();
  });
});
