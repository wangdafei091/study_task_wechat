/**
 * family-settings.js - 家庭设置页（家长专属）
 */

const logger = require('../../../utils/logger');
const onboardingState = require('../../../utils/app/onboarding-state');
const userContextUtils = require('../../../utils/user-context');

function getPermissionRoleLabel(role) {
  if (role === 'manager') {
    return '管理员';
  }
  if (role === 'viewer') {
    return '查看者';
  }
  return '未设置';
}

function getPermissionRoleDescription(permissionContext = {}) {
  if (permissionContext.isSystemReadonly) {
    return '当前账号为只读，仅可查看家庭信息';
  }

  if (permissionContext.canManageFamilyGovernance) {
    return '可管理任务、奖励和家庭设置';
  }

  if (permissionContext.familyPermissionRole === 'viewer') {
    return '可查看记录和进展，不能修改内容';
  }

  return '创建家庭或加入家庭后可开始协作';
}

function formatInviteRoleHint(role) {
  if (role === 'parent') {
    return '对方加入后默认为查看者，如需协助管理，可稍后手动设为管理员';
  }

  return '适合给孩子设备加入家庭，不具备管理权限';
}

function isLocalMode() {
  const API_CONFIG = require('../../../utils/api-config');
  return API_CONFIG.ENABLE_API !== true;
}

function parseInviteExpiryTime(expiresAt) {
  if (!expiresAt) {
    return NaN;
  }

  if (typeof expiresAt === 'number') {
    return expiresAt;
  }

  if (expiresAt instanceof Date) {
    return expiresAt.getTime();
  }

  if (typeof expiresAt === 'string') {
    const trimmed = expiresAt.trim();
    if (!trimmed) {
      return NaN;
    }

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      const [datePart, timePart] = trimmed.split(' ');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes, seconds] = timePart.split(':').map(Number);
      // MySQL DATETIME 不带时区，后端当前按中国本地时间写入，这里显式按 UTC+8 解析，
      // 避免在 CI 的 UTC 环境下被误判为“晚 8 小时”。
      return Date.UTC(year, month - 1, day, (hours || 0) - 8, minutes || 0, seconds || 0);
    }

    const parsedDate = new Date(trimmed);

    return parsedDate instanceof Date ? parsedDate.getTime() : NaN;
  }

  const parsedDate = new Date(expiresAt);
  return parsedDate.getTime();
}

function formatInviteExpiry(expiresAt) {
  if (!expiresAt) {
    return '有效期未设置';
  }

  const expiresTime = parseInviteExpiryTime(expiresAt);
  if (!Number.isFinite(expiresTime)) {
    return '有效期未设置';
  }

  const diff = expiresTime - Date.now();
  if (diff <= 0) {
    return '邀请码已过期';
  }

  const hours = Math.max(1, Math.ceil(diff / (60 * 60 * 1000)));
  return `约 ${hours} 小时后失效`;
}

function buildMemberViewModel(member, options = {}) {
  const isParent = member.role === 'parent';
  const familyPermissionRole = member.familyPermissionRole || null;
  return {
    ...member,
    isParent,
    isSelf: member.userId === options.loginUserId,
    familyPermissionRole,
    roleDisplayText: isParent
      ? `家长 · ${getPermissionRoleLabel(familyPermissionRole)}`
      : (member.isVirtual ? '孩子（共享设备）' : '孩子'),
    canAdjustPermission: Boolean(options.canAdjustParentPermission && isParent),
    canDelete: Boolean(options.canManageFamilyGovernance && member.isVirtual),
  };
}

Page({
  data: {
    family: null,           // 当前家庭信息
    members: [],            // 家庭成员列表
    loading: true,
    isParent: false,        // loginUser 是否为家长
    familyPermissionRole: '',
    currentIdentityLabel: '',
    currentIdentityDescription: '',
    isSystemReadonly: false,
    canManageFamilyGovernance: false,
    governanceDisabledReason: '',
    canManageInviteCode: false,
    inviteManagementDisabledReason: '',
    supportsParentPermissionManagement: false,
    canEnterInviteCenter: false,
    noFamilyOnboardingCard: null,
    familyOnboardingCard: null,
    // 邀请码相关
    inviteCode: '',
    inviteCodeExpiresAt: null,
    inviteCodeRole: 'child',
    inviteCodeExpiryText: '',
    inviteRoleHint: formatInviteRoleHint('child'),
    // 创建/加入家庭
    showCreateDialog: false,
    familyNameInput: '',
    // PIN 设置
    showPinDialog: false,
    pinInput: '',
    pinConfirmInput: '',
  },

  onLoad(options = {}) {
    this._pendingEntryAction = options.action || '';
    const app = getApp();
    const userService = app.globalData?.userService;
    if (!userService) return;

    // 本地存储模式下 loginUser 为 null，降级使用 currentUser
    const effectiveUser = userService.getLoginUser() || userService.getCurrentUser();
    if (!effectiveUser) return;

    // 已加入家庭的孩子不需要再进入此页面（家庭管理由家长负责）
    if (effectiveUser.role === 'child' && effectiveUser.familyId) {
      logger.warn('FamilySettings', '已加入家庭的孩子无需访问，重定向');
      wx.showToast({ title: '家庭设置仅家长可管理', icon: 'none' });
      wx.navigateBack({ delta: 1 });
      return;
    }
    // 记录当前登录用户角色，供 WXML 控制按钮显示
    this.setData({
      isParent: effectiveUser.role === 'parent',
      canEnterInviteCenter: effectiveUser.role === 'parent' && !effectiveUser.isVirtual
    });
    // 未加入家庭的用户（包括 child 角色）允许访问，以便输入邀请码加入家庭
    this._loadFamilyData();
  },

  async onShow() {
    const app = typeof getApp === 'function' ? getApp() : null;
    if (typeof app?.waitForSystemAccessRefresh === 'function') {
      const canContinue = await app.waitForSystemAccessRefresh();
      if (canContinue === false) {
        return;
      }
    }

    // 仅在非首次加载（已有数据）时刷新，首次加载由 onLoad 负责
    if (!this.data.loading) {
      this._loadFamilyData();
    }
  },

  async _loadFamilyData() {
    this.setData({ loading: true });
    try {
      const app = getApp();
      const userService = app.globalData?.userService;
      if (!userService) return;

      const familyData = await userService.getFamilyInfo();
      const family = familyData?.data || null;

      if (family) {
        const localMode = isLocalMode();
        const loginUser = userService.getLoginUser() || userService.getCurrentUser();
        const rawMembers = await this._loadMembers();
        const permissionContext = userContextUtils.resolvePermissionContext({
          loginUser,
          currentUser: loginUser,
          availableUsers: [loginUser].concat(rawMembers || [])
        });
        const canManageInviteCode = Boolean(permissionContext.canManageFamilyGovernance && !localMode);
        const supportsParentPermissionManagement = Boolean(permissionContext.canManageFamilyGovernance && !localMode);
        const members = (rawMembers || []).map((member) => buildMemberViewModel(member, {
          canManageFamilyGovernance: permissionContext.canManageFamilyGovernance,
          canAdjustParentPermission: supportsParentPermissionManagement,
          loginUserId: loginUser?.userId || null
        }));
        const familyOnboardingCard = this._resolveFamilyOnboardingCard({
          family,
          members,
          loginUser,
          canManageMembers: permissionContext.canManageMembers,
          isViewerReadonly: permissionContext.isViewerReadonly,
          isSystemReadonly: permissionContext.isSystemReadonly
        });

        this.setData({
          family,
          members,
          familyPermissionRole: permissionContext.familyPermissionRole || '',
          currentIdentityLabel: getPermissionRoleLabel(permissionContext.familyPermissionRole),
          currentIdentityDescription: getPermissionRoleDescription(permissionContext),
          isSystemReadonly: permissionContext.isSystemReadonly,
          canManageFamilyGovernance: permissionContext.canManageFamilyGovernance,
          governanceDisabledReason: permissionContext.canManageFamilyGovernance
            ? ''
            : (permissionContext.isSystemReadonly
              ? '当前账号为只读，仅可查看家庭信息'
              : '只有管理员可以邀请成员或调整权限'),
          canManageInviteCode,
          inviteManagementDisabledReason: canManageInviteCode
            ? ''
            : (localMode
              ? '本地模式下不提供邀请码'
              : (permissionContext.isSystemReadonly
                ? '当前账号为只读，不能刷新邀请码'
                : '只有管理员可以刷新邀请码')),
          supportsParentPermissionManagement,
          inviteCode: family.inviteCode || '',
          inviteCodeExpiresAt: family.inviteCodeExpiresAt,
          inviteCodeRole: family.inviteCodeRole || 'child',
          inviteCodeExpiryText: formatInviteExpiry(family.inviteCodeExpiresAt),
          inviteRoleHint: formatInviteRoleHint(family.inviteCodeRole || 'child'),
          canEnterInviteCenter: Boolean(loginUser && loginUser.role === 'parent' && !loginUser.isVirtual),
          noFamilyOnboardingCard: null,
          familyOnboardingCard,
          loading: false,
        });
      } else {
        const fallbackUser = userService.getLoginUser() || userService.getCurrentUser() || null;
        const noFamilyOnboardingCard = this._resolveNoFamilyOnboardingCard(fallbackUser);

        this.setData({
          family: null,
          members: [],
          familyPermissionRole: '',
          currentIdentityLabel: '',
          currentIdentityDescription: '',
          isSystemReadonly: false,
          canManageFamilyGovernance: false,
          governanceDisabledReason: '',
          canManageInviteCode: false,
          inviteManagementDisabledReason: '',
          supportsParentPermissionManagement: false,
          canEnterInviteCenter: Boolean((userService.getLoginUser() || userService.getCurrentUser())?.role === 'parent'),
          noFamilyOnboardingCard,
          familyOnboardingCard: null,
          loading: false
        });

        this._maybeOpenCreateFamilyDialog();
      }
    } catch (error) {
      logger.error('FamilySettings', '加载家庭数据失败', error);
      this.setData({ loading: false });
    }
  },

  _maybeOpenCreateFamilyDialog() {
    if (this._pendingEntryAction !== 'create_family' || !this.data.isParent || this.data.family) {
      return;
    }

    this._pendingEntryAction = '';
    this.showCreateFamily();
  },

  _resolveNoFamilyOnboardingCard(currentUser) {
    const app = getApp();
    const pendingContext = onboardingState.peekPendingOnboardingContext(app);
    const card = onboardingState.resolveOnboardingStage({
      loginUser: currentUser,
      currentUser,
      pendingOnboardingContext: pendingContext
    });

    if (card.dismissAfterConsume) {
      onboardingState.consumePendingOnboardingContext(app);
    }

    return card.stage === 'stable_none' ? null : card;
  },

  _resolveFamilyOnboardingCard(options = {}) {
    const app = getApp();
    const pendingContext = onboardingState.peekPendingOnboardingContext(app);
    const card = onboardingState.resolveOnboardingStage({
      family: options.family,
      members: options.members,
      loginUser: options.loginUser,
      currentUser: options.loginUser,
      canManageMembers: options.canManageMembers,
      isViewerReadonly: options.isViewerReadonly,
      isSystemReadonly: options.isSystemReadonly,
      pendingOnboardingContext: pendingContext,
      skipTaskStages: true
    });

    if (card.dismissAfterConsume) {
      onboardingState.consumePendingOnboardingContext(app);
    }

    return card.stage === 'stable_none' ? null : card;
  },

  async _loadMembers() {
    try {
      const API_CONFIG = require('../../../utils/api-config');
      // 本地模式：从本地存储读取成员数据
      if (!API_CONFIG.ENABLE_API) {
        const app = getApp();
        const userService = app.globalData?.userService;

        const localMembers = userService?.storageAdapter?.get('localFamilyMembers') || [];
        // 补上家长自身
        const parentUser = userService?.getLoginUser?.() || userService?.getCurrentUser?.();
        const parentMember = parentUser ? [{
          userId: parentUser.userId || parentUser.id,
          nickname: parentUser.name || parentUser.displayName || '家长',
          role: 'parent',
          familyPermissionRole: parentUser.familyPermissionRole || 'manager',
          isVirtual: false,
        }] : [];
        return [...parentMember, ...localMembers];
      }

      // 云端模式：直接调用 API 获取全量成员（含其他家长），不经 getAllUsers() 过滤
      const HttpClient = require('../../../utils/http-client');
      const data = await HttpClient.get(API_CONFIG.ENDPOINTS.FAMILIES_MEMBERS);
      return data.members || [];
    } catch (e) {
      return [];
    }
  },

  // ===== 创建家庭 =====
  showCreateFamily() {
    this.setData({ showCreateDialog: true, familyNameInput: '' });
  },

  onFamilyNameInput(e) {
    this.setData({ familyNameInput: e.detail.value });
  },

  async confirmCreateFamily() {
    const name = this.data.familyNameInput.trim();
    if (!name) {
      wx.showToast({ title: '请输入家庭名称', icon: 'none' });
      return;
    }
    try {
      const userService = getApp().globalData?.userService;
      const result = await userService.createFamily(name);
      if (result.success) {
        onboardingState.setPendingOnboardingContext(getApp(), {
          source: onboardingState.ONBOARDING_SOURCE.CREATE_FAMILY
        });
        wx.showToast({ title: '家庭创建成功', icon: 'success' });
        this.setData({ showCreateDialog: false });
        await this._loadFamilyData();
      } else {
        wx.showToast({ title: result.message || '创建失败', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '创建失败', icon: 'none' });
    }
  },

  cancelCreateFamily() {
    this.setData({ showCreateDialog: false });
  },

  // ===== 加入家庭 =====
  showJoinFamily() {
    this.navigateToAccessGate();
  },

  navigateToInviteCenter() {
    if (!this.data.canEnterInviteCenter) {
      wx.showToast({ title: '当前身份不可用', icon: 'none' });
      return;
    }

    wx.navigateTo({
      url: '/packageManage/pages/invite-center/invite-center'
    });
  },

  navigateToAccessGate() {
    wx.navigateTo({
      url: '/pages/access-gate/access-gate?mode=manual_input'
    });
  },

  onNoFamilyPrimaryTap() {
    const actionType = this.data.noFamilyOnboardingCard?.primaryAction?.type || '';
    if (actionType === 'create_family') {
      this.showCreateFamily();
      return;
    }

    this.navigateToAccessGate();
  },

  onNoFamilySecondaryTap() {
    this.navigateToAccessGate();
  },

  onFamilyOnboardingPrimaryTap() {
    const actionType = this.data.familyOnboardingCard?.primaryAction?.type || '';
    if (actionType === 'add_child') {
      this.addVirtualMember();
      return;
    }

    wx.reLaunch({
      url: '/pages/index/index'
    });
  },

  navigateToAboutPage() {
    wx.navigateTo({
      url: '/packageManage/pages/about/about'
    });
  },

  noop() {},

  // ===== 邀请码刷新 =====
  onInviteCodeRoleChange(e) {
    const inviteCodeRole = e.detail.value;
    this.setData({
      inviteCodeRole,
      inviteRoleHint: formatInviteRoleHint(inviteCodeRole)
    });
  },

  async refreshInviteCode() {
    if (!this.data.canManageInviteCode) {
      wx.showToast({
        title: this.data.inviteManagementDisabledReason || '当前不可刷新邀请码',
        icon: 'none'
      });
      return;
    }
    try {
      const userService = getApp().globalData?.userService;
      const result = await userService.refreshInviteCode(this.data.inviteCodeRole);
      this.setData({
        inviteCode: result.inviteCode,
        inviteCodeExpiresAt: result.inviteCodeExpiresAt,
        inviteCodeExpiryText: formatInviteExpiry(result.inviteCodeExpiresAt),
      });
      wx.showToast({ title: '邀请码已刷新', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: '刷新失败', icon: 'none' });
    }
  },

  copyInviteCode() {
    const code = this.data.inviteCode;
    if (!code) return;
    wx.setClipboardData({ data: code, success: () => wx.showToast({ title: '已复制', icon: 'success' }) });
  },

  // ===== 添加虚拟成员 =====
  async addVirtualMember() {
    if (!this.data.canManageFamilyGovernance) {
      wx.showToast({
        title: this.data.isSystemReadonly ? '当前账号为只读，不能修改家庭设置' : '当前为查看者，不能修改家庭设置',
        icon: 'none'
      });
      return;
    }
    wx.showModal({
      title: '添加孩子',
      editable: true,
      placeholderText: '请输入孩子的名字',
      success: async (res) => {
        if (res.confirm && res.content?.trim()) {
          try {
            const userService = getApp().globalData?.userService;
            const taskService = getApp().getTaskService();
            // 在创建前记录当前孩子数量，判断是否为第一个孩子
            const childrenBefore = userService.getAllUsers().filter(u => u.role === 'child');
            const isFirstChild = childrenBefore.length === 0;

            const result = await userService.createVirtualMember(res.content.trim());
            if (result.success) {
              let toastTitle = '成员添加成功';
              // 仅在创建第一个孩子时触发任务归属迁移
              if (isFirstChild && result.member?.userId && taskService) {
                const loginUserId = userService.getLoginUserId();
                const migrateResult = await taskService._migrateTasksToChild(loginUserId, result.member.userId);
                if (migrateResult.success && migrateResult.count > 0) {
                  toastTitle = `成员添加成功，已将 ${migrateResult.count} 个任务归属给${res.content.trim()}`;
                } else if (!migrateResult.success) {
                  toastTitle = '成员已添加，但任务迁移失败，请稍后重试';
                }
              }
              wx.showToast({ title: toastTitle, icon: 'none', duration: 2500 });
              await this._loadFamilyData();
            } else {
              wx.showToast({ title: result.message || '添加失败', icon: 'none' });
            }
          } catch (e) {
            wx.showToast({ title: '添加失败', icon: 'none' });
          }
        }
      }
    });
  },

  // ===== 删除虚拟成员 =====
  async deleteMember(e) {
    if (!this.data.canManageFamilyGovernance) {
      wx.showToast({
        title: this.data.isSystemReadonly ? '当前账号为只读，不能修改家庭设置' : '当前为查看者，不能修改家庭设置',
        icon: 'none'
      });
      return;
    }
    const { userId, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: `确定删除"${name}"吗？`,
      confirmColor: '#FF4444',
      success: async (res) => {
        if (res.confirm) {
          try {
            const userService = getApp().globalData?.userService;
            const result = await userService.deleteFamilyMember(userId);
            if (result.success) {
              wx.showToast({ title: '已删除', icon: 'success' });
              await this._loadFamilyData();
            } else {
              wx.showToast({ title: result.message || '删除失败', icon: 'none' });
            }
          } catch (e) {
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  // ===== PIN 设置 =====
  showPinSetting() {
    this.setData({ showPinDialog: true, pinInput: '', pinConfirmInput: '' });
  },

  onPinInput(e) {
    this.setData({ pinInput: e.detail.value });
  },

  onPinConfirmInput(e) {
    this.setData({ pinConfirmInput: e.detail.value });
  },

  confirmSetPin() {
    const { pinInput, pinConfirmInput } = this.data;
    if (!pinInput || pinInput.length < 4) {
      wx.showToast({ title: 'PIN码至少4位', icon: 'none' });
      return;
    }
    if (pinInput !== pinConfirmInput) {
      wx.showToast({ title: '两次输入不一致', icon: 'none' });
      return;
    }
    const userService = getApp().globalData?.userService;
    const loginUserId = userService?.getLoginUserId();
    const pinKey = loginUserId ? `family_pin_${loginUserId}` : 'family_pin';
    wx.setStorageSync(pinKey, pinInput);
    wx.showToast({ title: 'PIN码已设置', icon: 'success' });
    this.setData({ showPinDialog: false });
  },

  cancelSetPin() {
    this.setData({ showPinDialog: false });
  },

  clearPin() {
    const userService = getApp().globalData?.userService;
    const loginUserId = userService?.getLoginUserId();
    const pinKey = loginUserId ? `family_pin_${loginUserId}` : 'family_pin';
    wx.removeStorageSync(pinKey);
    wx.showToast({ title: '已清除PIN码', icon: 'success' });
  },

  async onPermissionRoleTap(e) {
    const { userId, role } = e.currentTarget.dataset;
    if (!this.data.supportsParentPermissionManagement) {
      wx.showToast({ title: '当前模式不支持调整家长权限', icon: 'none' });
      return;
    }

    if (!this.data.canManageFamilyGovernance) {
      wx.showToast({
        title: this.data.isSystemReadonly ? '当前账号为只读，不能修改家庭设置' : '当前为查看者，不能修改家庭设置',
        icon: 'none'
      });
      return;
    }

    const targetMember = (this.data.members || []).find((member) => member.userId === userId);
    if (!targetMember || targetMember.familyPermissionRole === role) {
      return;
    }

    try {
      const userService = getApp().globalData?.userService;
      const result = await userService.updateFamilyMemberPermissionRole(userId, role);
      if (!result.success) {
        wx.showToast({ title: result.message || '更新失败', icon: 'none' });
        return;
      }

      wx.showToast({
        title: role === 'manager' ? '已设为管理员' : '已设为查看者',
        icon: 'success'
      });
      await this._loadFamilyData();
    } catch (error) {
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },
});
