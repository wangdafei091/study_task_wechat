const permissionUtils = require('./permission-utils');

function getUserIdentifier(user) {
  if (!user || typeof user !== 'object') {
    return null;
  }

  return user.userId || user.id || null;
}

function isInactiveUser(user) {
  return Boolean(user && user.status === 'inactive');
}

function uniqueIds(ids = []) {
  return [...new Set((ids || []).filter(Boolean))];
}

function findUserById(availableUsers = [], userId) {
  if (!userId) {
    return null;
  }

  return (availableUsers || []).find((user) => getUserIdentifier(user) === userId) || null;
}

function resolveLoginUser(rawInput = {}, availableUsers = []) {
  if (rawInput.loginUser) {
    return rawInput.loginUser;
  }

  return findUserById(availableUsers, rawInput.loginUserId);
}

function resolveCurrentUser(rawInput = {}, availableUsers = [], loginUser = null) {
  if (rawInput.currentUser) {
    return rawInput.currentUser;
  }

  const currentUser = findUserById(availableUsers, rawInput.currentUserId);
  if (currentUser) {
    return currentUser;
  }

  if (loginUser && getUserIdentifier(loginUser) === rawInput.currentUserId) {
    return loginUser;
  }

  return null;
}

function isSnapshotLike(input = {}) {
  return Boolean(
    input &&
    typeof input === 'object' &&
    (
      Object.prototype.hasOwnProperty.call(input, 'viewUserId') ||
      Object.prototype.hasOwnProperty.call(input, 'loginUserId') ||
      Object.prototype.hasOwnProperty.call(input, 'activeChildUserIds')
    )
  );
}

function normalizeSnapshot(input = {}) {
  if (isSnapshotLike(input)) {
    return {
      loginUser: input.loginUser || null,
      viewUser: input.viewUser || null,
      familyId: input.familyId || null,
      loginUserId: input.loginUserId || null,
      loginUserRole: input.loginUserRole || null,
      familyPermissionRole: input.familyPermissionRole || null,
      loginUserFamilyPermissionRole: input.loginUserFamilyPermissionRole || null,
      viewUserId: input.viewUserId || null,
      viewUserRole: input.viewUserRole || null,
      viewUserFamilyPermissionRole: input.viewUserFamilyPermissionRole || null,
      activeChildUserIds: uniqueIds(input.activeChildUserIds),
      isParentDevice: input.isParentDevice === true,
      isChildDevice: input.isChildDevice === true,
      isParentView: input.isParentView === true,
      isChildView: input.isChildView === true
    };
  }

  return createUserContextSnapshot(input);
}

function createUserContextSnapshot(input = {}) {
  const availableUsers = Array.isArray(input.availableUsers) ? input.availableUsers : [];
  const loginUser = resolveLoginUser(input, availableUsers);
  const currentUser = resolveCurrentUser(input, availableUsers, loginUser);
  const viewUser = currentUser || loginUser || null;
  const activeChildUserIds = uniqueIds(
    availableUsers
      .filter((user) => user && user.role === 'child' && !isInactiveUser(user))
      .map((user) => getUserIdentifier(user))
  );

  return {
    loginUser,
    viewUser,
    familyId: (loginUser && loginUser.familyId) || (viewUser && viewUser.familyId) || null,
    loginUserId: getUserIdentifier(loginUser),
    loginUserRole: (loginUser && loginUser.role) || null,
    familyPermissionRole: (loginUser && loginUser.familyPermissionRole) || null,
    loginUserFamilyPermissionRole: (loginUser && loginUser.familyPermissionRole) || null,
    viewUserId: getUserIdentifier(viewUser),
    viewUserRole: (viewUser && viewUser.role) || null,
    viewUserFamilyPermissionRole: (viewUser && viewUser.familyPermissionRole) || null,
    activeChildUserIds,
    isParentDevice: Boolean(loginUser && loginUser.role === 'parent'),
    isChildDevice: Boolean(loginUser && loginUser.role === 'child'),
    isParentView: Boolean(viewUser && viewUser.role === 'parent'),
    isChildView: Boolean(viewUser && viewUser.role === 'child')
  };
}

function resolveReadContext(input = {}) {
  const snapshot = normalizeSnapshot(input);

  if (snapshot.isChildView) {
    return {
      scope: 'user',
      subjectUserId: snapshot.viewUserId,
      childUserIds: snapshot.viewUserId ? [snapshot.viewUserId] : [],
      familyId: snapshot.familyId
    };
  }

  if (snapshot.familyId) {
    return {
      scope: 'family',
      subjectUserId: null,
      childUserIds: snapshot.activeChildUserIds,
      familyId: snapshot.familyId
    };
  }

  return {
    scope: 'user',
    subjectUserId: snapshot.viewUserId,
    childUserIds: snapshot.viewUserId ? [snapshot.viewUserId] : [],
    familyId: null
  };
}

function resolveDefaultSubjectUserId(input = {}) {
  const snapshot = normalizeSnapshot(input);

  if (snapshot.isChildView && snapshot.viewUserId) {
    return snapshot.viewUserId;
  }

  if (snapshot.isChildDevice && snapshot.loginUserId) {
    return snapshot.loginUserId;
  }

  return null;
}

function resolveMutationContext(input = {}, options = {}) {
  const snapshot = normalizeSnapshot(input);
  const operationMode = options.operationMode === 'manage' ? 'manage' : 'execute';
  const subjectUserId = options.targetUserId || resolveDefaultSubjectUserId(snapshot);
  const executionUsesViewUser = operationMode === 'execute' && snapshot.isChildView;

  return {
    loginUserId: snapshot.loginUserId,
    managementActorUserId: snapshot.loginUserId || snapshot.viewUserId || null,
    managementActorRole: snapshot.loginUserRole || snapshot.viewUserRole || 'system',
    executionActorUserId: executionUsesViewUser
      ? snapshot.viewUserId
      : (snapshot.loginUserId || snapshot.viewUserId || null),
    executionActorRole: executionUsesViewUser
      ? (snapshot.viewUserRole || 'system')
      : (snapshot.loginUserRole || snapshot.viewUserRole || 'system'),
    subjectUserId,
    targetUserId: subjectUserId,
    familyId: snapshot.familyId,
    operationMode,
    viewUserId: snapshot.viewUserId,
    viewUserRole: snapshot.viewUserRole
  };
}

function resolvePermissionContext(input = {}, options = {}) {
  const snapshot = normalizeSnapshot(input);
  const familyPermissionRole = snapshot.loginUserFamilyPermissionRole || snapshot.familyPermissionRole || null;
  const systemAccessLevel = snapshot.loginUser?.systemAccessLevel || 'normal';
  const isExecutingChildView = Boolean(snapshot.isChildView && snapshot.viewUserRole === 'child');
  const isSwitchedChildView = snapshot.loginUserRole === 'child' || (
    Boolean(snapshot.loginUserId) &&
    Boolean(snapshot.viewUserId) &&
    snapshot.loginUserId !== snapshot.viewUserId
  );
  const isSystemReadonly = systemAccessLevel === 'readonly';
  const isSystemBlocked = systemAccessLevel === 'blocked';
  const isViewerReadonly = Boolean(
    snapshot.loginUserRole === 'parent' &&
    snapshot.familyId &&
      familyPermissionRole === 'viewer' &&
      !isExecutingChildView
  );
  const isTaskExecutionReadonly = isSystemBlocked || isSystemReadonly || isViewerReadonly;
  const isReadonlyView = isSystemBlocked || isSystemReadonly || isSwitchedChildView || isViewerReadonly;
  const hasFamilyManagerRole = Boolean(
    snapshot.loginUserRole === 'parent' &&
    snapshot.familyId &&
    familyPermissionRole === 'manager' &&
    !isSystemBlocked &&
    !isSystemReadonly &&
    !isViewerReadonly
  );
  const canManageFamilyGovernance = Boolean(
    hasFamilyManagerRole &&
    !isSwitchedChildView
  );
  const canManageBusinessData = Boolean(
    snapshot.loginUserRole === 'parent' &&
    (!snapshot.familyId || familyPermissionRole === 'manager') &&
    !isSystemBlocked &&
    !isSystemReadonly &&
    !isSwitchedChildView
  );
  const permissionRole = isExecutingChildView ? null : familyPermissionRole;
  const permissionUserRole = isExecutingChildView
    ? (snapshot.viewUserRole || snapshot.loginUserRole)
    : snapshot.loginUserRole;

  return {
    loginUserId: snapshot.loginUserId,
    loginUserRole: snapshot.loginUserRole,
    familyId: snapshot.familyId,
    familyPermissionRole,
    systemAccessLevel,
    isSystemReadonly,
    isSystemBlocked,
    viewUserId: snapshot.viewUserId,
    viewUserRole: snapshot.viewUserRole,
    isSwitchedChildView,
    isViewerReadonly,
    isTaskExecutionReadonly,
    readonlyReason: isSystemBlocked
      ? 'system-blocked'
      : (isSystemReadonly ? 'system-readonly' : (isViewerReadonly ? 'viewer-readonly' : '')),
    canManageMembers: snapshot.loginUserRole === 'parent' && !isSystemBlocked,
    hasFamilyManagerRole,
    isReadonlyView,
    canManageFamilyGovernance,
    canManageBusinessData,
    userPermissions: permissionUtils.getUserPermissions(permissionUserRole, permissionRole),
    lastActiveChildId: options.lastActiveChildId || null
  };
}

module.exports = {
  createUserContextSnapshot,
  getUserIdentifier,
  normalizeSnapshot,
  resolveDefaultSubjectUserId,
  resolveMutationContext,
  resolvePermissionContext,
  resolveReadContext
};
