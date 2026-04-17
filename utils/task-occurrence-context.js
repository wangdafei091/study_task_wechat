const userContextUtils = require('./user-context');

function getChildDisplayName(user) {
  if (!user || typeof user !== 'object') {
    return '';
  }

  return user.displayName || user.name || user.nickname || user.userId || user.id || '';
}

function buildChildOptions(availableUsers = [], familyId = null) {
  const familyScopedUsers = familyId
    ? availableUsers.filter((user) => user && user.familyId === familyId && user.status !== 'inactive')
    : availableUsers;

  return familyScopedUsers
    .filter((user) => user && user.role === 'child' && user.status !== 'inactive')
    .map((user) => ({
      userId: userContextUtils.getUserIdentifier(user),
      label: getChildDisplayName(user),
      rawUser: user
    }))
    .filter((item) => item.userId);
}

function resolveOccurrenceExecutionSubject(input = {}, options = {}) {
  const snapshot = userContextUtils.createUserContextSnapshot(input);
  const childOptions = buildChildOptions(input.availableUsers || [], snapshot.familyId || null);
  const defaultSubjectUserId = userContextUtils.resolveDefaultSubjectUserId(snapshot);

  if (defaultSubjectUserId) {
    const matchedChild = childOptions.find((item) => item.userId === defaultSubjectUserId);
    return {
      targetUserId: defaultSubjectUserId,
      targetUserName: matchedChild ? (matchedChild.label || '') : '',
      requiresPicker: false,
      childOptions,
      isChildView: true,
      isParentOwnView: false
    };
  }

  const lastActiveChildId = options.lastActiveChildId || null;
  if (lastActiveChildId) {
    const lastActiveChild = childOptions.find((item) => item.userId === lastActiveChildId);
    if (lastActiveChild) {
      return {
        targetUserId: lastActiveChildId,
        targetUserName: lastActiveChild.label || '',
        requiresPicker: false,
        childOptions,
        isChildView: false,
        isParentOwnView: snapshot.isParentView && snapshot.loginUserRole === 'parent'
      };
    }
  }

  if (childOptions.length === 1) {
    return {
      targetUserId: childOptions[0].userId,
      targetUserName: childOptions[0].label || '',
      requiresPicker: false,
      childOptions,
      isChildView: false,
      isParentOwnView: snapshot.isParentView && snapshot.loginUserRole === 'parent'
    };
  }

  return {
    targetUserId: null,
    targetUserName: '',
    requiresPicker: childOptions.length > 1,
    childOptions,
    isChildView: false,
    isParentOwnView: snapshot.isParentView && snapshot.loginUserRole === 'parent'
  };
}

module.exports = {
  getChildDisplayName,
  buildChildOptions,
  resolveOccurrenceExecutionSubject
};
