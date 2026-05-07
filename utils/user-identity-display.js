const { FamilyPermissionRole, UserRole } = require('../models/user');
const {
  getAvatarPresetById,
  isAvatarPresetValue,
  listAvatarPresets,
  parseAvatarPresetId
} = require('./user-avatar-presets');

const LEGACY_AVATAR_PLACEHOLDERS = new Set(['👩‍💼', '👶', '👤']);

function getUserId(user) {
  if (!user || typeof user !== 'object') {
    return '';
  }

  return String(user.userId || user.id || '').trim();
}

function normalizeText(value) {
  return String(value || '').trim();
}

function getDefaultPrimaryName(user = {}) {
  return user.role === UserRole.CHILD ? '孩子' : '家长';
}

function resolvePrimaryName(user = {}) {
  return normalizeText(user.name) || getDefaultPrimaryName(user);
}

function resolveSecondaryText(user = {}) {
  if (user.role === UserRole.PARENT) {
    if (user.familyPermissionRole === FamilyPermissionRole.MANAGER) {
      return '家长 · 管理员';
    }
    if (user.familyPermissionRole === FamilyPermissionRole.VIEWER) {
      return '家长 · 查看者';
    }
    return '家长';
  }

  if (user.role === UserRole.CHILD) {
    return user.isVirtual ? '孩子 · 共享设备成员' : '孩子';
  }

  return '';
}

function isLegacyAvatarPlaceholder(avatar) {
  return LEGACY_AVATAR_PLACEHOLDERS.has(normalizeText(avatar));
}

function isStableImageAvatar(avatar) {
  const normalizedAvatar = normalizeText(avatar);
  if (!normalizedAvatar || isAvatarPresetValue(normalizedAvatar) || isLegacyAvatarPlaceholder(normalizedAvatar)) {
    return false;
  }

  return /^(https?:\/\/|cloud:\/\/|data:image\/|\/)/i.test(normalizedAvatar);
}

function getAvatarText(primaryName, user = {}) {
  const normalizedName = normalizeText(primaryName);
  if (normalizedName) {
    return Array.from(normalizedName)[0];
  }

  return user.role === UserRole.CHILD ? '孩' : '家';
}

function resolveAvatarDisplay(user = {}, primaryName = '') {
  const avatar = normalizeText(user.avatar);
  const presetId = parseAvatarPresetId(avatar);
  const preset = getAvatarPresetById(presetId);

  if (isStableImageAvatar(avatar)) {
    return {
      avatarMode: 'image',
      avatarUrl: avatar,
      avatarPresetId: '',
      avatarEmoji: '',
      avatarAccentColor: ''
    };
  }

  if (preset) {
    return {
      avatarMode: 'preset',
      avatarUrl: '',
      avatarPresetId: preset.presetId,
      avatarEmoji: preset.emoji,
      avatarAccentColor: preset.accentColor || ''
    };
  }

  const avatarText = getAvatarText(primaryName, user);
  if (avatarText) {
    return {
      avatarMode: 'initial',
      avatarUrl: '',
      avatarPresetId: '',
      avatarEmoji: '',
      avatarAccentColor: ''
    };
  }

  return {
    avatarMode: 'placeholder',
    avatarUrl: '',
    avatarPresetId: '',
    avatarEmoji: '',
    avatarAccentColor: ''
  };
}

function deriveManagementFlags(user = {}, context = {}) {
  const userId = getUserId(user);
  const loginUserId = normalizeText(context.loginUserId);
  const loginUserRole = context.loginUserRole || '';
  const familyPermissionRole = context.familyPermissionRole || null;
  const isSystemBlocked = context.isSystemBlocked === true;
  const isSystemReadonly = context.isSystemReadonly === true;
  const isViewerReadonly = context.isViewerReadonly === true;
  const isSwitchedChildView = context.isSwitchedChildView === true;
  const operatorFamilyId = normalizeText(context.familyId);
  const isSelf = Boolean(userId && loginUserId && userId === loginUserId);
  const isParentManager = (
    loginUserRole === UserRole.PARENT &&
    familyPermissionRole === FamilyPermissionRole.MANAGER &&
    !isSystemBlocked &&
    !isSystemReadonly &&
    !isViewerReadonly
  );
  const isChildSelf = (
    loginUserRole === UserRole.CHILD &&
    user.role === UserRole.CHILD &&
    isSelf &&
    !isSystemBlocked &&
    !isSystemReadonly &&
    !isViewerReadonly
  );
  const sameFamilyChild = (
    user.role === UserRole.CHILD &&
    normalizeText(user.familyId) &&
    normalizeText(user.familyId) === operatorFamilyId
  );
  const canParentManageChild = isParentManager && sameFamilyChild;
  const canRenameSelfParent = (
    loginUserRole === UserRole.PARENT &&
    isSelf &&
    !isSwitchedChildView &&
    !isSystemBlocked &&
    !isSystemReadonly &&
    !isViewerReadonly &&
    familyPermissionRole !== FamilyPermissionRole.VIEWER
  );

  const canRename = Boolean(canRenameSelfParent || canParentManageChild || isChildSelf);
  const canPickAvatar = Boolean(user.role === UserRole.CHILD && (canParentManageChild || isChildSelf));
  const canDelete = Boolean(
    user.role === UserRole.CHILD &&
    user.isVirtual &&
    canParentManageChild &&
    !isSwitchedChildView
  );

  return {
    canRename,
    canPickAvatar,
    canDelete,
    canManageChildIdentity: canPickAvatar || canDelete
  };
}

function buildManagementActions(flags = {}) {
  const actions = [];
  if (flags.canRename) {
    actions.push('rename');
  }
  if (flags.canPickAvatar) {
    actions.push('pickAvatar');
  }
  return actions;
}

function buildIdentityDisplayModel(context = {}) {
  const user = context.user || {};
  const userId = getUserId(user);
  const currentUserId = normalizeText(context.currentUserId);
  const primaryName = resolvePrimaryName(user);
  const secondaryText = resolveSecondaryText(user);
  const avatarDisplay = resolveAvatarDisplay(user, primaryName);
  const managementFlags = deriveManagementFlags(user, context.permissionContext || {});

  return {
    userId,
    primaryName,
    secondaryText,
    tertiaryText: '',
    avatarMode: avatarDisplay.avatarMode,
    avatarUrl: avatarDisplay.avatarUrl,
    avatarPresetId: avatarDisplay.avatarPresetId,
    avatarEmoji: avatarDisplay.avatarEmoji,
    avatarAccentColor: avatarDisplay.avatarAccentColor,
    avatarText: getAvatarText(primaryName, user),
    badgeText: userId && userId === currentUserId ? '当前' : '',
    canSwitch: Boolean(userId && currentUserId && userId !== currentUserId),
    canDelete: managementFlags.canDelete,
    managementActions: buildManagementActions(managementFlags),
    isCurrentUser: Boolean(userId && userId === currentUserId)
  };
}

function buildHeaderIdentityDisplay(context = {}) {
  const displayModel = buildIdentityDisplayModel({
    user: context.currentUser,
    currentUserId: getUserId(context.currentUser),
    loginUserId: context.loginUserId,
    permissionContext: context.permissionContext || {}
  });

  return {
    avatarMode: displayModel.avatarMode,
    avatarUrl: displayModel.avatarUrl,
    avatarPresetId: displayModel.avatarPresetId,
    avatarEmoji: displayModel.avatarEmoji,
    avatarAccentColor: displayModel.avatarAccentColor,
    avatarText: displayModel.avatarText,
    primaryName: displayModel.primaryName,
    accessibilityLabel: `${displayModel.primaryName}头像`
  };
}

function resolveProgressCompanionUser(context = {}) {
  const currentUser = context.currentUser || null;
  const availableUsers = Array.isArray(context.availableUsers) ? context.availableUsers : [];
  const lastActiveChildId = normalizeText(context.lastActiveChildId);
  const canManageMembers = context.canManageMembers === true;

  if (canManageMembers && currentUser?.role === UserRole.PARENT) {
    if (lastActiveChildId) {
      const matchedChild = availableUsers.find((user) => getUserId(user) === lastActiveChildId);
      if (matchedChild?.role === UserRole.CHILD) {
        return matchedChild;
      }
    }

    return availableUsers.find((user) => user?.role === UserRole.CHILD) || null;
  }

  if (currentUser?.role === UserRole.CHILD) {
    return currentUser;
  }

  return null;
}

function buildProgressCompanionDisplay(context = {}) {
  const companionUser = resolveProgressCompanionUser(context);
  if (!companionUser) {
    return {
      userId: '',
      emoji: '🐥',
      avatarMode: 'fallback',
      avatarPresetId: '',
      avatarAccentColor: '',
      isFallback: true
    };
  }

  const primaryName = resolvePrimaryName(companionUser);
  const avatarDisplay = resolveAvatarDisplay(companionUser, primaryName);
  if (avatarDisplay.avatarMode === 'preset' && avatarDisplay.avatarEmoji) {
    return {
      userId: getUserId(companionUser),
      emoji: avatarDisplay.avatarEmoji,
      avatarMode: avatarDisplay.avatarMode,
      avatarPresetId: avatarDisplay.avatarPresetId,
      avatarAccentColor: avatarDisplay.avatarAccentColor,
      isFallback: false
    };
  }

  return {
    userId: getUserId(companionUser),
    emoji: '🐥',
    avatarMode: 'fallback',
    avatarPresetId: '',
    avatarAccentColor: '',
    isFallback: true
  };
}

function buildSwitcherDisplayState(context = {}) {
  const availableUsers = Array.isArray(context.availableUsers) ? context.availableUsers : [];
  const currentUserId = getUserId(context.currentUser);
  const permissionContext = context.permissionContext || {};

  return {
    currentCard: context.currentUser
      ? buildIdentityDisplayModel({
        user: context.currentUser,
        currentUserId,
        loginUserId: context.loginUserId,
        permissionContext
      })
      : null,
    switchableUsers: availableUsers
      .filter((user) => getUserId(user) && getUserId(user) !== currentUserId)
      .map((user) => buildIdentityDisplayModel({
        user,
        currentUserId,
        loginUserId: context.loginUserId,
        permissionContext
      })),
    footerAction: {
      visible: permissionContext.canManageFamilyGovernance === true,
      text: '添加成员'
    }
  };
}

module.exports = {
  LEGACY_AVATAR_PLACEHOLDERS,
  buildHeaderIdentityDisplay,
  buildIdentityDisplayModel,
  buildProgressCompanionDisplay,
  buildSwitcherDisplayState,
  deriveManagementFlags,
  getAvatarText,
  getDefaultPrimaryName,
  getUserId,
  isLegacyAvatarPlaceholder,
  isStableImageAvatar,
  listAvatarPresets
};
