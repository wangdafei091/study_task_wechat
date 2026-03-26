const logger = require('../../../utils/logger');
const permissionUtils = require('../../../utils/permission-utils');

async function initializeMultiUserSystem(page) {
  try {
    logger.info('Index', '初始化多用户系统');

    const userService = getApp().globalData.userService;
    if (!userService) {
      logger.error('Index', '用户服务未初始化');
      return;
    }

    const currentUser = userService.getCurrentUser();
    const loginUser = userService.getLoginUser() || currentUser;
    const availableUsers = userService.getAllUsers();
    const userPermissions = permissionUtils.getUserPermissions(loginUser.role);
    const isReadonlyView = loginUser.role === 'child' || loginUser.userId !== currentUser.userId;

    page.setData({
      currentUser,
      availableUsers,
      userPermissions,
      loginUserId: loginUser.userId,
      canManageMembers: loginUser.role === 'parent',
      isReadonlyView
    });

    page.updateMenuItemsWithPermissions();
    logger.info('Index', `多用户系统初始化完成，当前用户: ${currentUser.name}(${currentUser.role})`);
  } catch (error) {
    logger.error('Index', '初始化多用户系统失败', error);
  }
}

async function initializeMultiUserSystemDelayed(page) {
  if (page._multiUserSystemInitPromise) {
    return page._multiUserSystemInitPromise;
  }

  logger.info('Index', '开始延迟初始化多用户系统');

  page._multiUserSystemInitPromise = (async () => {
    await page.waitForLoginComplete();

    const maxWaitTime = 3000;
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitTime) {
      const app = getApp();
      if (app.globalData && app.globalData.userService) {
        logger.info('Index', '用户服务已就绪，开始初始化多用户系统');
        await page.initializeMultiUserSystem();
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    logger.warn('Index', '用户服务初始化超时，跳过本次多用户初始化');
    return false;
  })();

  try {
    return await page._multiUserSystemInitPromise;
  } finally {
    page._multiUserSystemInitPromise = null;
  }
}

module.exports = {
  initializeMultiUserSystem,
  initializeMultiUserSystemDelayed
};
