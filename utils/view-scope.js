const MessageVisibilityScope = {
  USER: 'user',
  FAMILY: 'family'
};

function getUserIdentifier(user) {
  if (!user) {
    return null;
  }
  return user.id || user.userId || null;
}

function getCurrentViewUser(loginUser, currentUser) {
  return currentUser || loginUser || null;
}

function isChildView(loginUser, currentUser) {
  const viewUser = getCurrentViewUser(loginUser, currentUser);
  return viewUser?.role === 'child';
}

function resolveMessageScopeOptions(loginUser, currentUser) {
  const familyId = loginUser?.familyId || currentUser?.familyId || null;
  const currentUserId = getUserIdentifier(currentUser) || getUserIdentifier(loginUser);

  if (isChildView(loginUser, currentUser)) {
    return {
      scope: MessageVisibilityScope.USER,
      userId: currentUserId
    };
  }

  if (familyId) {
    return {
      scope: MessageVisibilityScope.FAMILY,
      userId: null
    };
  }

  return {
    scope: MessageVisibilityScope.USER,
    userId: currentUserId
  };
}

function resolveAnalysisOptions(loginUser, currentUser, availableUsers = []) {
  if (isChildView(loginUser, currentUser)) {
    return {
      userId: getUserIdentifier(currentUser) || getUserIdentifier(loginUser)
    };
  }

  const activeChildren = availableUsers
    .filter((user) => user && user.role === 'child' && user.status !== 'inactive');

  if (activeChildren.length === 1) {
    return {
      userId: getUserIdentifier(activeChildren[0])
    };
  }

  if (activeChildren.length >= 2) {
    return {
      scope: MessageVisibilityScope.FAMILY,
      childUserIds: activeChildren
        .map((user) => getUserIdentifier(user))
        .filter(Boolean)
    };
  }

  const familyId = loginUser?.familyId || currentUser?.familyId || null;
  if (familyId) {
    return {
      userId: getUserIdentifier(currentUser) || getUserIdentifier(loginUser)
    };
  }

  return {
    userId: getUserIdentifier(currentUser) || getUserIdentifier(loginUser)
  };
}

function hasResolvedAnalysisOptions(options) {
  return Boolean(options && (options.scope === MessageVisibilityScope.FAMILY || options.userId));
}

module.exports = {
  MessageVisibilityScope,
  getUserIdentifier,
  isChildView,
  resolveMessageScopeOptions,
  resolveAnalysisOptions,
  hasResolvedAnalysisOptions
};
