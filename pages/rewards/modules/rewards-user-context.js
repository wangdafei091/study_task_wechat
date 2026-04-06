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

function getEffectiveChildUserId(serviceManager) {
  const userService = serviceManager.getUserService();
  if (!userService) {
    logger.warn('rewards', '无法获取用户服务');
    return null;
  }

  const loginUser = userService.getLoginUser ? userService.getLoginUser() : null;
  const currentUser = userService.getCurrentUser ? userService.getCurrentUser() : null;
  const availableUsers = userService.getAllUsers ? userService.getAllUsers() : [];
  const snapshot = userContextUtils.createUserContextSnapshot({
    loginUser,
    currentUser,
    availableUsers
  });
  const defaultSubjectUserId = userContextUtils.resolveDefaultSubjectUserId(snapshot);

  if (defaultSubjectUserId) {
    return defaultSubjectUserId;
  }

  const appInstance = getApp();
  const lastActiveChildId = appInstance?.globalData?.lastActiveChildId || null;
  if (lastActiveChildId) {
    const lastActiveChild = typeof userService.getUserById === 'function'
      ? userService.getUserById(lastActiveChildId)
      : null;
    if (lastActiveChild && lastActiveChild.role === 'child') {
      logger.info('rewards', `使用最近活跃孩子ID: ${lastActiveChildId}`);
      return lastActiveChildId;
    }
    logger.info('rewards', `忽略失效的最近活跃孩子ID: ${lastActiveChildId}`);
  }

  const firstChildId = Array.isArray(snapshot.activeChildUserIds) && snapshot.activeChildUserIds.length > 0
    ? snapshot.activeChildUserIds[0]
    : null;
  if (firstChildId) {
    logger.info('rewards', `使用第一个孩子ID: ${firstChildId}`);
    return firstChildId;
  }

  const firstChild = userService.getUserByRole('child');
  if (firstChild) {
    const firstChildUserId = firstChild.userId || firstChild.id || null;
    logger.info('rewards', `使用第一个孩子ID: ${firstChildUserId}`);
    return firstChildUserId;
  }

  logger.info('rewards', '当前没有可用的孩子视角，返回空孩子ID');
  return null;
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

function getChildUserId(serviceManager) {
  return getEffectiveChildUserId(serviceManager);
}

module.exports = {
  resolveRewardPageViewMode,
  getEffectiveChildUserId,
  getRewardOwnerUserId,
  getChildUserId
};
