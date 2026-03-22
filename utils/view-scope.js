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

function resolveAnalysisOptions(loginUser, currentUser) {
  if (isChildView(loginUser, currentUser)) {
    return {
      userId: getUserIdentifier(currentUser) || getUserIdentifier(loginUser)
    };
  }

  const familyId = loginUser?.familyId || currentUser?.familyId || null;
  if (familyId) {
    return { scope: MessageVisibilityScope.FAMILY };
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
