const userContextUtils = require('./user-context');

const MessageVisibilityScope = {
  USER: 'user',
  FAMILY: 'family'
};

function getUserIdentifier(user) {
  return userContextUtils.getUserIdentifier(user);
}

function isChildView(loginUser, currentUser) {
  return userContextUtils.createUserContextSnapshot({
    loginUser,
    currentUser
  }).isChildView;
}

function resolveMessageScopeOptions(loginUser, currentUser, availableUsers = []) {
  const readContext = userContextUtils.resolveReadContext({
    loginUser,
    currentUser,
    availableUsers
  });

  return {
    scope: readContext.scope || MessageVisibilityScope.USER,
    userId: readContext.scope === MessageVisibilityScope.USER
      ? readContext.subjectUserId || null
      : null
  };
}

function resolveAnalysisOptions(loginUser, currentUser, availableUsers = []) {
  const readContext = userContextUtils.resolveReadContext({
    loginUser,
    currentUser,
    availableUsers
  });

  if (readContext.scope === MessageVisibilityScope.FAMILY) {
    return {
      scope: MessageVisibilityScope.FAMILY,
      childUserIds: readContext.childUserIds || []
    };
  }

  return {
    userId: readContext.subjectUserId || null
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
