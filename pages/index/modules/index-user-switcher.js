const logger = require('../../../utils/logger');
const permissionUtils = require('../../../utils/permission-utils');
const userContextUtils = require('../../../utils/user-context');
const { buildIdentityDisplayModel } = require('../../../utils/user-identity-display');
const { buildIndexUserContextState } = require('./index-user-context');

function showUserSwitcher(page) {
  logger.info('Index', '显示用户切换界面');

  const userService = getApp().globalData.userService;
  if (!userService) {
    return;
  }

  page.setData({
    availableUsers: userService.getAllUsers(),
    currentUser: userService.getCurrentUser(),
    showUserSwitcher: true
  });
}

function hideUserSwitcher(page) {
  logger.info('Index', '隐藏用户切换界面');
  page.setData({
    showUserSwitcher: false
  });
}

async function handleUserSwitch(page, e) {
  try {
    const { userId } = e.detail;
    logger.info('Index', `用户切换: 切换到用户ID=${userId}`);

    const userService = getApp().globalData.userService;
    if (!userService) {
      logger.error('Index', '用户服务不可用');
      return;
    }

    const result = await userService.switchToUser(userId);
    if (!result.success) {
      wx.showToast({
        title: result.message || '用户切换失败',
        icon: 'none'
      });
      return;
    }

    const currentUser = userService.getCurrentUser();
    const state = buildIndexUserContextState(page, userService, {
      currentUser,
      availableUsers: userService.getAllUsers(),
      lastActiveChildId: currentUser.role === 'child'
        ? userContextUtils.getUserIdentifier(currentUser)
        : page.data.lastActiveChildId
    });

    page.setData({
      ...state,
      showUserSwitcher: false
    });

    page.updateMenuItemsWithPermissions();
    await page.refreshDataForCurrentUser();

    const displayModel = buildIdentityDisplayModel({
      user: currentUser,
      currentUserId: state.currentUser?.userId || state.currentUser?.id,
      loginUserId: state.loginUserId,
      permissionContext: state.userIdentityPermissionContext
    });

    wx.showToast({
      title: `已切换到 ${displayModel.primaryName}`,
      icon: 'success'
    });

    logger.info('Index', `用户切换完成: ${currentUser.name}(${currentUser.role})`);
  } catch (error) {
    logger.error('Index', '处理用户切换失败', error);
    wx.showToast({
      title: '用户切换失败',
      icon: 'none'
    });
  }
}

async function handleUserAdd() {
  logger.info('Index', '跳转到家庭设置页添加成员');
  wx.navigateTo({
    url: '/packageManage/pages/family-settings/family-settings'
  });
}

async function handleNicknameEdit(page, e) {
  try {
    const { userId, nickname, onSuccess, onFailure } = e.detail;
    const userService = getApp().globalData.userService;
    if (!userService) {
      if (typeof onFailure === 'function') {
        onFailure();
      }
      return;
    }

    const loginUser = typeof userService.getLoginUser === 'function'
      ? userService.getLoginUser()
      : null;
    const loginUserId = userContextUtils.getUserIdentifier(loginUser);
    const isSelfRename = Boolean(userId && loginUserId && userId === loginUserId);
    const result = isSelfRename
      ? await userService.updateCurrentProfile({ nickname })
      : await userService.updateNickname(userId, nickname);

    if (result.success) {
      page.setData(buildIndexUserContextState(page, userService));
      if (typeof onSuccess === 'function') {
        onSuccess();
      }
      wx.showToast({ title: '昵称已更新', icon: 'success' });
      return;
    }

    if (typeof onFailure === 'function') {
      onFailure();
    }
    wx.showToast({ title: result.message || '修改失败', icon: 'none' });
  } catch (error) {
    logger.error('Index', '处理昵称编辑失败', error);
    if (typeof e.detail?.onFailure === 'function') {
      e.detail.onFailure();
    }
    wx.showToast({ title: '修改失败', icon: 'none' });
  }
}

async function handleAvatarPresetUpdate(page, e) {
  try {
    const { userId, presetId, onSuccess, onFailure } = e.detail;
    const userService = getApp().globalData.userService;
    if (!userService) {
      if (typeof onFailure === 'function') {
        onFailure();
      }
      return;
    }

    const result = await userService.updateChildAvatarPreset(userId, presetId);
    if (result.success) {
      page.setData(buildIndexUserContextState(page, userService));
      if (typeof onSuccess === 'function') {
        onSuccess();
      }
      wx.showToast({ title: '头像已更新', icon: 'success' });
      return;
    }

    if (typeof onFailure === 'function') {
      onFailure();
    }
    wx.showToast({ title: result.message || '修改失败', icon: 'none' });
  } catch (error) {
    logger.error('Index', '处理孩子头像更新失败', error);
    if (typeof e.detail?.onFailure === 'function') {
      e.detail.onFailure();
    }
    wx.showToast({ title: '修改失败', icon: 'none' });
  }
}

function updateMenuItemsWithPermissions(page) {
  const { currentUser, isReadonlyView, isViewingToday } = page.data;
  logger.debug('Index', `根据用户权限更新菜单: ${currentUser.role}`);

  const originalMenuItems = [
    {
      id: 'study',
      type: 'study-task',
      icon: '📈',
      label: '分析',
      ariaLabel: '查看统计分析',
      feature: 'analytics',
      action: 'view'
    },
    {
      id: 'habit',
      type: 'habit-task',
      icon: '⏰',
      label: '任务',
      ariaLabel: '创建任务',
      feature: 'task',
      action: 'create'
    },
    {
      id: 'reward-manage',
      type: 'reward-manage',
      icon: '🏆',
      label: '奖励',
      ariaLabel: '管理奖励',
      feature: 'reward',
      action: 'create'
    }
  ];

  const app = getApp();
  const loginUser = app.globalData?.userService?.getLoginUser() || currentUser;
  const filteredMenuItems = permissionUtils.filterMenuItems(
    originalMenuItems,
    loginUser.role,
    loginUser.familyPermissionRole || null
  );
  const finalMenuItems = filteredMenuItems.filter((item) => {
    if (item.id === 'study') {
      return true;
    }

    if (!isViewingToday && (item.id === 'habit' || item.id === 'reward-manage')) {
      return !isReadonlyView;
    }

    if (!isViewingToday) {
      return false;
    }

    if (isReadonlyView && (item.id === 'habit' || item.id === 'reward-manage')) {
      return false;
    }

    return true;
  });

  page.setData({
    menuItems: finalMenuItems
  });

  logger.info('Index', `菜单项更新完成: ${originalMenuItems.length} -> ${finalMenuItems.length}`);
}

function navigateToUserProfile(page) {
  logger.info('Index', '点击用户头像，显示用户切换界面');
  page.showUserSwitcher();
}

async function validateUserModule() {
  try {
    logger.info('Index', '开始验证用户模块功能');

    const userService = getApp().globalData.userService;
    if (!userService) {
      logger.error('Index', '用户服务不可用');
      return false;
    }

    const validation = await userService.validateService();
    if (validation.success) {
      logger.info('Index', '用户模块验证通过');
    } else {
      logger.warn('Index', '用户模块验证失败', validation);
    }
    return validation.success;
  } catch (error) {
    logger.error('Index', '验证用户模块功能失败', error);
    return false;
  }
}

module.exports = {
  showUserSwitcher,
  hideUserSwitcher,
  handleUserSwitch,
  handleUserAdd,
  handleNicknameEdit,
  handleAvatarPresetUpdate,
  updateMenuItemsWithPermissions,
  navigateToUserProfile,
  validateUserModule
};
