const logger = require('../../../utils/logger');
const userContextUtils = require('../../../utils/user-context');

function resolveRewardPageViewMode(userService) {
  const loginUser = userService?.getLoginUser ? userService.getLoginUser() : null;
  const currentUser = userService?.getCurrentUser ? userService.getCurrentUser() : null;
  const availableUsers = userService?.getAllUsers ? userService.getAllUsers() : [];
  const activeUser = currentUser || loginUser || null;
  const permissionContext = userContextUtils.resolvePermissionContext({
    loginUser,
    currentUser,
    availableUsers
  }, {
    lastActiveChildId: getApp()?.globalData?.lastActiveChildId || null
  });
  const isReadonlyView = permissionContext.isReadonlyView;

  return {
    loginUser,
    currentUser: activeUser,
    isReadonlyView: permissionContext.isReadonlyView,
    viewMode: activeUser && activeUser.role === 'parent' && !isReadonlyView
      ? 'parent-manage'
      : 'child-no-manage'
  };
}

function getChildDisplayName(user) {
  return user?.displayName || user?.name || user?.nickname || user?.userId || user?.id || '';
}

function getChildOptions(userService, snapshot) {
  const allUsers = userService?.getAllUsers ? userService.getAllUsers() : [];
  const familyScopedUsers = snapshot.familyId
    ? allUsers.filter((user) => user && user.familyId === snapshot.familyId && user.status !== 'inactive')
    : allUsers;

  return familyScopedUsers
    .filter((user) => user && user.role === 'child' && user.status !== 'inactive')
    .map((user) => ({
      userId: userContextUtils.getUserIdentifier(user),
      label: getChildDisplayName(user),
      rawUser: user
    }))
    .filter((item) => item.userId);
}

function resolveRewardExecutionSubject(serviceManager) {
  const userService = serviceManager.getUserService();
  if (!userService) {
    logger.warn('rewards', '无法获取用户服务');
    return {
      targetChildUserId: null,
      targetChildName: '',
      requiresPicker: false,
      childOptions: [],
      isChildView: false,
      isParentOwnView: false
    };
  }

  const loginUser = userService.getLoginUser ? userService.getLoginUser() : null;
  const currentUser = userService.getCurrentUser ? userService.getCurrentUser() : null;
  const availableUsers = userService.getAllUsers ? userService.getAllUsers() : [];
  const snapshot = userContextUtils.createUserContextSnapshot({
    loginUser,
    currentUser,
    availableUsers
  });
  const childOptions = getChildOptions(userService, snapshot);
  const defaultSubjectUserId = userContextUtils.resolveDefaultSubjectUserId(snapshot);

  if (defaultSubjectUserId) {
    const matchedChild = childOptions.find((item) => item.userId === defaultSubjectUserId);
    return {
      targetChildUserId: defaultSubjectUserId,
      targetChildName: matchedChild?.label || '',
      requiresPicker: false,
      childOptions,
      isChildView: true,
      isParentOwnView: false
    };
  }

  const appInstance = getApp();
  const lastActiveChildId = appInstance?.globalData?.lastActiveChildId || null;
  if (lastActiveChildId) {
    const lastActiveChild = childOptions.find((item) => item.userId === lastActiveChildId);
    if (lastActiveChild) {
      logger.info('rewards', `使用最近活跃孩子ID: ${lastActiveChildId}`);
      return {
        targetChildUserId: lastActiveChildId,
        targetChildName: lastActiveChild.label || '',
        requiresPicker: false,
        childOptions,
        isChildView: false,
        isParentOwnView: snapshot.isParentView && snapshot.loginUserRole === 'parent'
      };
    }
    logger.info('rewards', `忽略失效的最近活跃孩子ID: ${lastActiveChildId}`);
  }

  if (childOptions.length === 1) {
    logger.info('rewards', `使用唯一孩子ID: ${childOptions[0].userId}`);
    return {
      targetChildUserId: childOptions[0].userId,
      targetChildName: childOptions[0].label || '',
      requiresPicker: false,
      childOptions,
      isChildView: false,
      isParentOwnView: snapshot.isParentView && snapshot.loginUserRole === 'parent'
    };
  }

  logger.info('rewards', '当前没有唯一可用的孩子视角，返回待选择状态');
  return {
    targetChildUserId: null,
    targetChildName: '',
    requiresPicker: childOptions.length > 1,
    childOptions,
    isChildView: false,
    isParentOwnView: snapshot.isParentView && snapshot.loginUserRole === 'parent'
  };
}

function getEffectiveChildUserId(serviceManager) {
  return resolveRewardExecutionSubject(serviceManager).targetChildUserId || null;
}

function getRewardOwnerUserId(serviceManager) {
  const userService = serviceManager.getUserService();
  if (!userService) {
    return null;
  }

  const snapshot = userContextUtils.createUserContextSnapshot({
    loginUser: userService.getLoginUser ? userService.getLoginUser() : null,
    currentUser: userService.getCurrentUser ? userService.getCurrentUser() : null,
    availableUsers: userService.getAllUsers ? userService.getAllUsers() : []
  });

  return snapshot.loginUserId || snapshot.viewUserId || null;
}

function getRewardFamilyScope(serviceManager) {
  const userService = serviceManager.getUserService();
  if (!userService) {
    return {
      familyId: null,
      memberUserIds: [],
      childUserIds: [],
      loginUserId: null,
      viewUserId: null
    };
  }

  const loginUser = userService.getLoginUser ? userService.getLoginUser() : null;
  const currentUser = userService.getCurrentUser ? userService.getCurrentUser() : null;
  const availableUsers = userService.getAllUsers ? userService.getAllUsers() : [];
  const snapshot = userContextUtils.createUserContextSnapshot({
    loginUser,
    currentUser,
    availableUsers
  });
  const familyId = snapshot.familyId || null;
  const familyUsers = familyId
    ? availableUsers.filter((user) => user && user.familyId === familyId && user.status !== 'inactive')
    : [];
  const memberUserIds = familyUsers
    .map((user) => userContextUtils.getUserIdentifier(user))
    .filter(Boolean);
  const childUserIds = familyUsers
    .filter((user) => user.role === 'child')
    .map((user) => userContextUtils.getUserIdentifier(user))
    .filter(Boolean);

  if (!familyId) {
    const fallbackUserId = snapshot.loginUserId || snapshot.viewUserId || null;
    return {
      familyId: null,
      memberUserIds: fallbackUserId ? [fallbackUserId] : [],
      childUserIds: snapshot.isChildView && snapshot.viewUserId ? [snapshot.viewUserId] : [],
      loginUserId: snapshot.loginUserId || null,
      viewUserId: snapshot.viewUserId || null
    };
  }

  if (memberUserIds.length === 0) {
    if (snapshot.loginUserId) {
      memberUserIds.push(snapshot.loginUserId);
    }
    if (snapshot.viewUserId && !memberUserIds.includes(snapshot.viewUserId)) {
      memberUserIds.push(snapshot.viewUserId);
    }
    if (snapshot.isChildView && snapshot.viewUserId && !childUserIds.includes(snapshot.viewUserId)) {
      childUserIds.push(snapshot.viewUserId);
    }
  }

  return {
    familyId,
    memberUserIds,
    childUserIds,
    loginUserId: snapshot.loginUserId || null,
    viewUserId: snapshot.viewUserId || null
  };
}

function getMyExchangeUserId(serviceManager) {
  const userService = serviceManager.getUserService();
  if (!userService) {
    return null;
  }

  const snapshot = userContextUtils.createUserContextSnapshot({
    loginUser: userService.getLoginUser ? userService.getLoginUser() : null,
    currentUser: userService.getCurrentUser ? userService.getCurrentUser() : null,
    availableUsers: userService.getAllUsers ? userService.getAllUsers() : []
  });
  const defaultSubjectUserId = userContextUtils.resolveDefaultSubjectUserId(snapshot);

  if (defaultSubjectUserId) {
    return defaultSubjectUserId;
  }

  return resolveRewardExecutionSubject(serviceManager).targetChildUserId || null;
}

module.exports = {
  resolveRewardPageViewMode,
  resolveRewardExecutionSubject,
  getEffectiveChildUserId,
  getRewardOwnerUserId,
  getRewardFamilyScope,
  getMyExchangeUserId
};
