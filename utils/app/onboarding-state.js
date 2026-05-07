const PENDING_ONBOARDING_CONTEXT_KEY = 'pendingOnboardingContext';

const ONBOARDING_SOURCE = {
  INVITE_JOIN_FAMILY: 'invite_join_family',
  GUEST_INVITE_ENTERED: 'guest_invite_entered',
  CREATE_FAMILY: 'create_family'
};

function createAction(type, text) {
  if (!type || !text) {
    return null;
  }

  return { type, text };
}

function getRole(user) {
  return user && user.role ? user.role : '';
}

function hasFamily(context = {}) {
  if (context.family) {
    return true;
  }

  const members = resolveMembers(context);
  if (members.length > 1) {
    return true;
  }

  const loginUser = context.loginUser || null;
  const currentUser = context.currentUser || null;
  return Boolean(loginUser?.familyId || currentUser?.familyId);
}

function resolveMembers(context = {}) {
  if (Array.isArray(context.members) && context.members.length > 0) {
    return context.members;
  }

  if (Array.isArray(context.availableUsers) && context.availableUsers.length > 0) {
    return context.availableUsers;
  }

  return [];
}

function countChildren(members = []) {
  const seen = new Set();
  let count = 0;

  members.forEach((member) => {
    if (!member || member.role !== 'child') {
      return;
    }

    const userId = member.userId || member.id || member.nickname || '';
    if (seen.has(userId)) {
      return;
    }

    seen.add(userId);
    count += 1;
  });

  return count;
}

function hasTaskContent(context = {}) {
  const tasks = Array.isArray(context.tasks) ? context.tasks : [];
  return tasks.length > 0 || context.showOccurrenceSection === true;
}

function canManageFamilyGovernance(context = {}) {
  if (typeof context.canManageFamilyGovernance === 'boolean') {
    return context.canManageFamilyGovernance;
  }

  return context.canManageMembers === true;
}

function canManageBusinessData(context = {}) {
  if (typeof context.canManageBusinessData === 'boolean') {
    return context.canManageBusinessData;
  }

  return context.canManageMembers === true;
}

function buildNoFamilyStage(role) {
  if (role === 'child') {
    return {
      stage: 'no_family_child',
      title: '输入邀请码加入家庭',
      description: '加入家庭后，你就能查看任务安排和成长进展。',
      primaryAction: createAction('join_with_code', '输入邀请码'),
      secondaryAction: null,
      emphasis: 'normal',
      dismissAfterConsume: false
    };
  }

  return {
    stage: 'no_family_parent',
    title: '先创建你的家庭',
    description: '创建后才能添加孩子、安排任务和一起协作。',
    primaryAction: createAction('create_family', '创建家庭'),
    secondaryAction: createAction('join_with_code', '输入邀请码加入'),
    emphasis: 'normal',
    dismissAfterConsume: false
  };
}

function buildFamilyNoChildStage() {
  return {
    stage: 'family_no_child',
    title: '先把孩子加进家庭',
    description: '添加后，才能按孩子视角安排任务、记录表现和累积奖励。',
    primaryAction: createAction('add_child', '去添加孩子'),
    secondaryAction: null,
    emphasis: 'normal',
    dismissAfterConsume: false
  };
}

function buildParentNoTaskStage() {
  return {
    stage: 'child_no_task_parent_view',
    title: '给孩子安排第一个任务',
    description: '从一个简单任务开始，孩子就能看到今天该做什么。',
    primaryAction: createAction('create_task', '创建任务'),
    secondaryAction: createAction('go_reward_manage', '去看看奖励'),
    emphasis: 'normal',
    dismissAfterConsume: false
  };
}

function buildChildNoTaskStage() {
  return {
    stage: 'child_no_task_child_view',
    title: '今天还没有任务',
    description: '家长安排好任务后，你就能在这里看到今天要做什么。',
    primaryAction: null,
    secondaryAction: null,
    emphasis: 'normal',
    dismissAfterConsume: false
  };
}

function buildReadonlyParentStage(childCount, options = {}) {
  const isSystemReadonly = options.isSystemReadonly === true;
  const isSystemBlocked = options.isSystemBlocked === true;

  if (childCount === 0) {
    return {
      stage: 'readonly_parent_no_child',
      title: '当前先查看家庭信息',
      description: isSystemBlocked
        ? '当前账号已被暂停使用，请联系管理员处理；如需添加孩子或安排任务，请使用其他可用账号。'
        : (isSystemReadonly
        ? '当前账号为只读，可先查看家庭信息；如需添加孩子或安排任务，请使用可编辑账号处理。'
        : '你可以先查看家庭信息；如需添加孩子或安排任务，可由管理员继续处理。'),
      primaryAction: null,
      secondaryAction: null,
      emphasis: 'normal',
      dismissAfterConsume: false
    };
  }

  return {
    stage: 'readonly_parent_no_task',
    title: '当前还没有任务安排',
    description: isSystemBlocked
      ? '当前账号已被暂停使用，请联系管理员处理；你现在只能先查看已有家庭进展。'
      : (isSystemReadonly
      ? '当前账号为只读，你可以先查看家庭进展和历史记录；如需安排任务，请使用可编辑账号处理。'
      : '你可以先查看家庭进展和历史记录；如需安排任务，可由管理员继续处理。'),
    primaryAction: null,
    secondaryAction: null,
    emphasis: 'normal',
    dismissAfterConsume: false
  };
}

function buildStableStage() {
  return {
    stage: 'stable_none',
    title: '',
    description: '',
    primaryAction: null,
    secondaryAction: null,
    emphasis: 'normal',
    dismissAfterConsume: false
  };
}

function buildGuestInviteEnteredStage(role) {
  if (role === 'child') {
    return {
      stage: 'joined_from_invite',
      title: '你已进入小程序',
      description: '接下来输入邀请码加入家庭，就能开始查看任务安排和成长进展。',
      primaryAction: createAction('join_with_code', '输入邀请码'),
      secondaryAction: null,
      emphasis: 'first-entry',
      dismissAfterConsume: true
    };
  }

  return {
    stage: 'joined_from_invite',
    title: '你已进入小程序',
    description: '接下来可以创建自己的家庭，或输入邀请码加入现有家庭。',
    primaryAction: createAction('create_family', '创建家庭'),
    secondaryAction: createAction('join_with_code', '输入邀请码加入'),
    emphasis: 'first-entry',
    dismissAfterConsume: true
  };
}

function buildJoinedFromInviteStage(options = {}) {
  return {
    stage: 'joined_from_invite',
    title: '已加入家庭',
    description: options.description || '现在可以先看看家庭信息和今天的任务安排。',
    primaryAction: options.primaryAction || null,
    secondaryAction: options.secondaryAction || null,
    emphasis: 'first-entry',
    dismissAfterConsume: true
  };
}

function resolveBaseStage(context = {}) {
  const loginUser = context.loginUser || context.currentUser || null;
  const currentUser = context.currentUser || loginUser || null;
  const currentRole = getRole(currentUser) || getRole(loginUser) || 'parent';
  const members = resolveMembers(context);
  const childCount = countChildren(members);
  const isReadonlyParent = currentRole === 'parent'
    && (context.isViewerReadonly === true || context.isSystemReadonly === true || context.isSystemBlocked === true);
  const hasFamilyGovernanceCapability = canManageFamilyGovernance(context);
  const hasBusinessDataCapability = canManageBusinessData(context);

  if (!hasFamily(context)) {
    if (context.skipNoFamilyStages === true) {
      return buildStableStage();
    }
    return buildNoFamilyStage(currentRole);
  }

  if (isReadonlyParent && childCount === 0) {
    return buildReadonlyParentStage(childCount, {
      isSystemReadonly: context.isSystemReadonly,
      isSystemBlocked: context.isSystemBlocked
    });
  }

  if (hasFamilyGovernanceCapability && childCount === 0) {
    return buildFamilyNoChildStage();
  }

  if (context.skipTaskStages === true) {
    return buildStableStage();
  }

  if (!hasTaskContent(context)) {
    if (isReadonlyParent) {
      return buildReadonlyParentStage(childCount, {
        isSystemReadonly: context.isSystemReadonly,
        isSystemBlocked: context.isSystemBlocked
      });
    }

    if (hasBusinessDataCapability && currentRole === 'parent' && childCount > 0) {
      return buildParentNoTaskStage();
    }

    if (context.canManageMembers !== true) {
      return buildChildNoTaskStage();
    }
  }

  return buildStableStage();
}

function applyPendingContext(baseStage, context = {}) {
  const pending = context.pendingOnboardingContext || null;
  if (!pending || !pending.source) {
    return baseStage;
  }

  const loginUser = context.loginUser || context.currentUser || null;
  const currentUser = context.currentUser || loginUser || null;
  const currentRole = getRole(currentUser) || getRole(loginUser) || 'parent';

  if (pending.source === ONBOARDING_SOURCE.GUEST_INVITE_ENTERED) {
    if (baseStage.stage === 'stable_none' && !hasFamily(context)) {
      return buildGuestInviteEnteredStage(currentRole);
    }

    if (baseStage.stage === 'no_family_parent') {
      return {
        ...baseStage,
        title: '你已进入小程序',
        description: '先创建自己的家庭，或输入邀请码加入现有家庭。',
        emphasis: 'first-entry',
        dismissAfterConsume: true
      };
    }

    if (baseStage.stage === 'no_family_child') {
      return {
        ...baseStage,
        title: '你已进入小程序',
        description: '接下来输入邀请码加入家庭，就能开始使用。',
        emphasis: 'first-entry',
        dismissAfterConsume: true
      };
    }
  }

  if (pending.source === ONBOARDING_SOURCE.INVITE_JOIN_FAMILY) {
    if (baseStage.stage === 'stable_none'
      && context.skipTaskStages === true
      && (context.isViewerReadonly === true || context.isSystemReadonly === true)
      && hasFamily(context)) {
      return buildJoinedFromInviteStage({
        description: '你现在可以先查看家庭进展；如需协助管理，可由管理员稍后调整权限。',
        primaryAction: createAction('go_home', '返回首页')
      });
    }

    if (baseStage.stage === 'stable_none' && hasFamily(context)) {
      return buildJoinedFromInviteStage({
        description: currentRole === 'child'
          ? '现在可以看看今天的任务安排和家庭进展了。'
          : '现在可以先看看家庭信息、孩子进展和今天的任务安排。'
      });
    }

    if (baseStage.stage === 'family_no_child') {
      return {
        ...baseStage,
        title: '已加入家庭',
        description: '下一步先把孩子加入家庭，才能开始安排任务。',
        emphasis: 'first-entry',
        dismissAfterConsume: true
      };
    }

    if (baseStage.stage === 'child_no_task_parent_view') {
      return {
        ...baseStage,
        title: '已加入家庭',
        description: '可以先给孩子安排一个简单任务，开始今天的协作。',
        emphasis: 'first-entry',
        dismissAfterConsume: true
      };
    }

    if (baseStage.stage === 'child_no_task_child_view') {
      return {
        ...baseStage,
        title: '已加入家庭',
        description: '现在可以看看今天的任务安排了。',
        emphasis: 'first-entry',
        dismissAfterConsume: true
      };
    }

    if (baseStage.stage === 'readonly_parent_no_task'
      || baseStage.stage === 'readonly_parent_no_child') {
      return {
        ...baseStage,
        title: '已加入家庭',
        description: '你现在可以先查看家庭进展；如需添加成员或安排任务，可由管理员稍后处理。',
        emphasis: 'first-entry',
        dismissAfterConsume: true
      };
    }

  }

  if (pending.source === ONBOARDING_SOURCE.CREATE_FAMILY
    && baseStage.stage === 'family_no_child') {
    return {
      ...baseStage,
      title: '家庭已创建',
      description: '下一步先添加孩子，才能开始安排任务和记录表现。',
      emphasis: 'first-entry',
      dismissAfterConsume: true
    };
  }

  return baseStage;
}

function resolveOnboardingStage(context = {}) {
  const baseStage = resolveBaseStage(context);
  return applyPendingContext(baseStage, context);
}

function shouldShowHomeOnboardingCard(viewState = {}) {
  return viewState.isViewingToday === true &&
    viewState.isViewingFuture !== true &&
    viewState.showSearch !== true &&
    viewState.showMessagePreview !== true;
}

function getAppGlobalData(app) {
  return app && app.globalData ? app.globalData : null;
}

function peekPendingOnboardingContext(app) {
  return getAppGlobalData(app)?.[PENDING_ONBOARDING_CONTEXT_KEY] || null;
}

function setPendingOnboardingContext(app, context) {
  const globalData = getAppGlobalData(app);
  if (!globalData || !context || !context.source) {
    return null;
  }

  globalData[PENDING_ONBOARDING_CONTEXT_KEY] = {
    ...context,
    createdAt: Number(context.createdAt) || Date.now()
  };
  return globalData[PENDING_ONBOARDING_CONTEXT_KEY];
}

function clearPendingOnboardingContext(app) {
  const globalData = getAppGlobalData(app);
  if (!globalData) {
    return;
  }

  globalData[PENDING_ONBOARDING_CONTEXT_KEY] = null;
}

function consumePendingOnboardingContext(app) {
  const pending = peekPendingOnboardingContext(app);
  clearPendingOnboardingContext(app);
  return pending;
}

module.exports = {
  ONBOARDING_SOURCE,
  resolveOnboardingStage,
  shouldShowHomeOnboardingCard,
  peekPendingOnboardingContext,
  setPendingOnboardingContext,
  clearPendingOnboardingContext,
  consumePendingOnboardingContext
};
