const systemService = require('../../../services/system-service');
const API_CONFIG = require('../../../utils/api-config');
const systemUserAccessState = require('../../../utils/app/system-user-access-state');

const ACCESS_LEVEL_ORDER = {
  blocked: 0,
  readonly: 1,
  normal: 2
};

const ACCESS_LEVEL_META = {
  normal: {
    label: '正常使用',
    shortLabel: '正常',
    tone: 'normal'
  },
  readonly: {
    label: '只读',
    shortLabel: '只读',
    tone: 'readonly'
  },
  blocked: {
    label: '已禁入',
    shortLabel: '禁入',
    tone: 'blocked'
  }
};

function formatUpdatedAt(value) {
  if (!value) {
    return '暂无';
  }

  return String(value).replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

function maskUserIdSuffix(userId) {
  if (!userId) {
    return '----';
  }

  return String(userId).slice(-4);
}

function buildFamilyRoleLabel(role) {
  if (role === 'manager') {
    return '家庭管理员';
  }
  if (role === 'viewer') {
    return '家庭查看者';
  }
  return '未加入家庭';
}

function sortUsers(users = []) {
  return [...users].sort((left, right) => {
    const leftOrder = ACCESS_LEVEL_ORDER[left.systemAccessLevel] ?? 99;
    const rightOrder = ACCESS_LEVEL_ORDER[right.systemAccessLevel] ?? 99;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    if (Boolean(left.isSystemAdmin) !== Boolean(right.isSystemAdmin)) {
      return left.isSystemAdmin ? -1 : 1;
    }

    return String(right.systemAccessUpdatedAt || '').localeCompare(String(left.systemAccessUpdatedAt || ''));
  });
}

function buildSummary(users = []) {
  return users.reduce((result, user) => {
    if (user.systemAccessLevel === 'blocked') {
      result.blocked += 1;
    } else if (user.systemAccessLevel === 'readonly') {
      result.readonly += 1;
    } else {
      result.normal += 1;
    }
    return result;
  }, {
    normal: 0,
    readonly: 0,
    blocked: 0
  });
}

function buildCardDisabledReason(user, context = {}) {
  if (context.isSelfReadonly) {
    return '当前账号为只读，仅可查看';
  }

  if (
    user.isSystemAdmin &&
    user.systemAccessLevel === 'normal' &&
    context.normalSystemAdminCount <= 1
  ) {
    return '至少保留一位可正常使用的系统管理员';
  }

  return '';
}

function decorateUserCard(user, context = {}) {
  const accessMeta = ACCESS_LEVEL_META[user.systemAccessLevel] || ACCESS_LEVEL_META.normal;
  const disabledReason = buildCardDisabledReason(user, context);

  return {
    ...user,
    nicknameDisplay: user.nickname || '未命名用户',
    roleDisplay: user.role === 'child' ? '孩子' : '家长',
    accessLabel: accessMeta.label,
    accessShortLabel: accessMeta.shortLabel,
    accessTone: accessMeta.tone,
    userIdSuffix: maskUserIdSuffix(user.userId),
    familyRoleLabel: buildFamilyRoleLabel(user.familyPermissionRole),
    updatedAtLabel: formatUpdatedAt(user.systemAccessUpdatedAt),
    isSelf: user.userId === context.loginUserId,
    disabledReason,
    canUpdate: !disabledReason,
    isNormal: user.systemAccessLevel === 'normal',
    isReadonly: user.systemAccessLevel === 'readonly',
    isBlocked: user.systemAccessLevel === 'blocked'
  };
}

Page({
  data: {
    loading: true,
    savingUserId: '',
    loadErrorCode: '',
    loadErrorMessage: '',
    governanceEnabled: API_CONFIG.ENABLE_API === true,
    users: [],
    summary: {
      normal: 0,
      readonly: 0,
      blocked: 0
    },
    loginUserId: '',
    isSelfReadonly: false
  },

  onLoad() {
    if (!this.data.governanceEnabled) {
      wx.showToast({
        title: '仅云端模式可用',
        icon: 'none'
      });
      wx.navigateBack({ delta: 1 });
      return;
    }

    const userService = getApp()?.globalData?.userService;
    const loginUser = userService?.getLoginUser?.() || null;
    this.setData({
      loginUserId: loginUser?.userId || '',
      isSelfReadonly: Boolean(loginUser && (
        (typeof loginUser.isSystemReadonly === 'function' && loginUser.isSystemReadonly()) ||
        loginUser.systemAccessLevel === 'readonly'
      ))
    });
    this.loadUsers();
  },

  handleSystemAdminRequired() {
    wx.showToast({ title: '仅系统管理员可访问', icon: 'none' });
    setTimeout(() => {
      wx.navigateBack({ delta: 1 });
    }, 300);
  },

  setLoadError(error = {}) {
    this.setData({
      loading: false,
      savingUserId: '',
      users: [],
      summary: { normal: 0, readonly: 0, blocked: 0 },
      loadErrorCode: error.code || 'SYSTEM_USER_GOVERNANCE_LIST_FAILED',
      loadErrorMessage: error.message || '加载失败'
    });
  },

  applyAccessSnapshotToSession(userId, snapshot) {
    const app = getApp();
    const userService = app?.globalData?.userService;
    if (!userService || typeof userService.applySystemAccessLevelSnapshot !== 'function') {
      return;
    }

    userService.applySystemAccessLevelSnapshot(userId, snapshot);
  },

  async loadUsers() {
    this.setData({
      loading: true,
      loadErrorCode: '',
      loadErrorMessage: ''
    });

    try {
      const result = await systemService.listUserGovernance();
      const rawUsers = sortUsers(result?.users || []);
      const normalSystemAdminCount = rawUsers.filter((user) => (
        user.isSystemAdmin && user.systemAccessLevel === 'normal'
      )).length;
      const users = rawUsers.map((user) => decorateUserCard(user, {
        loginUserId: this.data.loginUserId,
        isSelfReadonly: this.data.isSelfReadonly,
        normalSystemAdminCount
      }));

      this.setData({
        loading: false,
        users,
        summary: buildSummary(rawUsers),
        loadErrorCode: '',
        loadErrorMessage: ''
      });
    } catch (error) {
      if (error?.code === 'SYSTEM_ADMIN_REQUIRED') {
        this.setData({ loading: false });
        this.handleSystemAdminRequired();
        return;
      }

      this.setLoadError(error);
    }
  },

  onRetryTap() {
    this.loadUsers();
  },

  async onAccessLevelTap(e) {
    const { userId, accessLevel } = e.currentTarget.dataset;
    const targetUser = (this.data.users || []).find((item) => item.userId === userId);
    if (!targetUser || !accessLevel) {
      return;
    }

    if (this.data.savingUserId || targetUser.systemAccessLevel === accessLevel) {
      return;
    }

    if (!targetUser.canUpdate) {
      wx.showToast({
        title: targetUser.disabledReason || '当前不可操作',
        icon: 'none'
      });
      return;
    }

    this.setData({
      savingUserId: userId
    });

    try {
      const result = await systemService.updateUserAccessLevel(userId, accessLevel);
      this.applyAccessSnapshotToSession(userId, result);

      if (userId === this.data.loginUserId && accessLevel === 'blocked') {
        wx.showToast({ title: '已更新', icon: 'success' });
        systemUserAccessState.clearSessionAndRedirectToBlocked();
        return;
      }

      if (userId === this.data.loginUserId && accessLevel === 'readonly') {
        this.setData({
          isSelfReadonly: true
        });
      }

      wx.showToast({ title: '已更新', icon: 'success' });
      await this.loadUsers();
    } catch (error) {
      this.setData({
        savingUserId: ''
      });

      if (error?.code === 'SYSTEM_ADMIN_REQUIRED') {
        this.handleSystemAdminRequired();
        return;
      }

      wx.showToast({
        title: error?.message || '更新失败',
        icon: 'none'
      });
      return;
    }

    this.setData({
      savingUserId: ''
    });
  }
});
