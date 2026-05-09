const inviteService = require('../../../services/invite-service');
const API_CONFIG = require('../../../utils/api-config');

const FAMILY_ROLE_ORDER = ['child', 'parent'];

const FAMILY_ROLE_META = {
  child: {
    label: '邀请孩子',
    description: '把孩子加入当前家庭，后续可继续在家长视角管理任务与奖励。'
  },
  parent: {
    label: '邀请家长',
    description: '邀请另一位家长共同管理家庭任务、奖励和切换密码。'
  }
};

function parseExpiresAtTimestamp(expiresAt) {
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
      // 后端当前返回的 MySQL DATETIME 不带时区，这里显式按 UTC+8 解析，避免 iOS 和 UTC 环境误判。
      return Date.UTC(year, month - 1, day, (hours || 0) - 8, minutes || 0, seconds || 0);
    }

    return new Date(trimmed).getTime();
  }

  return new Date(expiresAt).getTime();
}

function formatExpiresAt(expiresAt) {
  if (!expiresAt) {
    return '未设置有效期';
  }

  const timestamp = parseExpiresAtTimestamp(expiresAt);
  if (!Number.isFinite(timestamp)) {
    return '未设置有效期';
  }

  const diff = timestamp - Date.now();
  if (diff <= 0) {
    return '已过期';
  }

  const hours = Math.max(1, Math.ceil(diff / (60 * 60 * 1000)));
  return `约 ${hours} 小时后失效`;
}

function isInviteExpired(expiresAt) {
  const timestamp = parseExpiresAtTimestamp(expiresAt);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function decorateInvite(invite, label) {
  if (!invite) {
    return null;
  }

  return {
    ...invite,
    label,
    expiresText: formatExpiresAt(invite.expiresAt),
    isExpired: isInviteExpired(invite.expiresAt)
  };
}

function buildFamilyInviteState(activeRole, bootstrap, familyInviteByRole = {}) {
  const availableRoles = Array.isArray(bootstrap?.availableFamilyInviteRoles)
    ? bootstrap.availableFamilyInviteRoles
    : [];
  const roles = FAMILY_ROLE_ORDER.filter((role) => (
    availableRoles.includes(role) || Boolean(familyInviteByRole[role])
  ));
  const fallbackRole = roles[0] || 'child';
  const resolvedRole = roles.includes(activeRole) ? activeRole : fallbackRole;
  const activeMeta = FAMILY_ROLE_META[resolvedRole] || FAMILY_ROLE_META.child;

  return {
    familyRoleTabs: roles.map((role) => ({
      role,
      label: FAMILY_ROLE_META[role].label,
      description: FAMILY_ROLE_META[role].description,
      enabled: availableRoles.includes(role),
      hasInvite: Boolean(familyInviteByRole[role]?.code)
    })),
    activeFamilyInviteRole: resolvedRole,
    currentFamilyInvite: familyInviteByRole[resolvedRole] || null,
    currentFamilyRoleLabel: activeMeta.label,
    currentFamilyRoleDescription: activeMeta.description,
    currentFamilyRoleCanIssue: availableRoles.includes(resolvedRole)
  };
}

Page({
  data: {
    loading: true,
    loadErrorMessage: '',
    governanceEnabled: API_CONFIG.ENABLE_API === true,
    isSystemReadonly: false,
    submittingAdmission: false,
    submittingFamilyRole: '',
    bootstrap: null,
    admissionInvite: null,
    showFamilyInviteSection: false,
    familyRoleTabs: [],
    activeFamilyInviteRole: 'child',
    currentFamilyInvite: null,
    currentFamilyRoleLabel: '邀请孩子',
    currentFamilyRoleDescription: '',
    currentFamilyRoleCanIssue: false,
    familyInviteByRole: {
      child: null,
      parent: null
    }
  },

  onLoad() {
    this._hasShownOnce = false;
    this.refreshReadonlyState();
    this.loadPageData();
  },

  async onShow() {
    const app = typeof getApp === 'function' ? getApp() : null;
    if (typeof app?.waitForSystemAccessRefresh === 'function') {
      const canContinue = await app.waitForSystemAccessRefresh();
      if (canContinue === false) {
        return;
      }
    }

    if (!this._hasShownOnce) {
      this._hasShownOnce = true;
      this.refreshReadonlyState();
      return;
    }

    this.refreshReadonlyState();
    await this.loadPageData();
  },

  refreshReadonlyState() {
    const loginUser = getApp()?.globalData?.userService?.getLoginUser?.() || null;
    const isSystemReadonly = Boolean(loginUser && (
      (typeof loginUser.isSystemReadonly === 'function' && loginUser.isSystemReadonly()) ||
      loginUser.systemAccessLevel === 'readonly'
    ));

    this.setData({ isSystemReadonly });
  },

  async loadPageData() {
    if (!this.data.governanceEnabled) {
      this.setData({
        loading: false,
        loadErrorMessage: '',
        submittingAdmission: false,
        submittingFamilyRole: ''
      });
      return;
    }

    this.setData({
      loading: true,
      loadErrorMessage: ''
    });

    try {
      const [bootstrap, current] = await Promise.all([
        inviteService.getBootstrap(),
        inviteService.getCurrentInviteSummary()
      ]);
      const familyInviteCodes = Array.isArray(current?.familyInviteCodes)
        ? current.familyInviteCodes
        : [];
      const familyInviteByRole = {
        child: decorateInvite(
          familyInviteCodes.find((item) => item.targetRole === 'child') || null,
          FAMILY_ROLE_META.child.label
        ),
        parent: decorateInvite(
          familyInviteCodes.find((item) => item.targetRole === 'parent') || null,
          FAMILY_ROLE_META.parent.label
        )
      };
      const familyInviteState = buildFamilyInviteState(
        this.data.activeFamilyInviteRole,
        bootstrap,
        familyInviteByRole
      );

      this.setData({
        loading: false,
        bootstrap,
        admissionInvite: decorateInvite(current?.admissionCode || null, '新用户邀请码'),
        submittingAdmission: false,
        submittingFamilyRole: '',
        showFamilyInviteSection: Boolean(
          bootstrap?.canIssueFamilyInviteCode ||
          familyInviteCodes.length > 0
        ),
        familyInviteByRole,
        ...familyInviteState
      });
    } catch (error) {
      this.setData({
        loading: false,
        submittingAdmission: false,
        submittingFamilyRole: '',
        loadErrorMessage: error?.message || '加载失败，请稍后再试'
      });
    }
  },

  async ensureFreshInvite(kind, targetRole) {
    const invite = kind === 'admission'
      ? this.data.admissionInvite
      : this.data.familyInviteByRole?.[targetRole || this.data.activeFamilyInviteRole] || null;

    if (invite && !invite.isExpired) {
      return invite;
    }

    await this.loadPageData();

    return kind === 'admission'
      ? this.data.admissionInvite
      : this.data.familyInviteByRole?.[targetRole || this.data.activeFamilyInviteRole] || null;
  },

  async confirmRefresh(message) {
    return new Promise((resolve) => {
      wx.showModal({
        title: '确认刷新邀请码',
        content: message,
        success: (result) => resolve(Boolean(result.confirm)),
        fail: () => resolve(false)
      });
    });
  },

  onFamilyRoleTabTap(e) {
    const role = e.currentTarget.dataset.role;
    if (!role || role === this.data.activeFamilyInviteRole) {
      return;
    }

    const nextState = buildFamilyInviteState(
      role,
      this.data.bootstrap,
      this.data.familyInviteByRole
    );
    this.setData(nextState);
  },

  async onIssueAdmissionTap() {
    if (!this.data.governanceEnabled) {
      wx.showToast({ title: '仅云端模式可用', icon: 'none' });
      return;
    }

    if (this.data.isSystemReadonly) {
      wx.showToast({ title: '当前账号为只读，仅可查看', icon: 'none' });
      return;
    }

    if (!this.data.bootstrap?.canIssueAdmissionCode) {
      wx.showToast({ title: '当前账号暂不可生成新用户邀请码', icon: 'none' });
      return;
    }

    if (this.data.admissionInvite?.code) {
      const confirmed = await this.confirmRefresh('刷新后，之前发出的新用户邀请码会立即失效。');
      if (!confirmed) {
        return;
      }
    }

    this.setData({
      submittingAdmission: true
    });

    try {
      const result = await inviteService.issueAdmissionCode();
      this.setData({
        submittingAdmission: false,
        admissionInvite: decorateInvite(result, '新用户邀请码')
      });
      wx.showToast({ title: '已生成', icon: 'success' });
    } catch (error) {
      this.setData({
        submittingAdmission: false
      });
      wx.showToast({ title: error?.message || '生成失败', icon: 'none' });
    }
  },

  async onIssueFamilyTap(e) {
    const targetRole = e.currentTarget.dataset.role || this.data.activeFamilyInviteRole;
    if (!targetRole) {
      return;
    }

    if (!this.data.governanceEnabled) {
      wx.showToast({ title: '仅云端模式可用', icon: 'none' });
      return;
    }

    if (this.data.isSystemReadonly) {
      wx.showToast({ title: '当前账号为只读，仅可查看', icon: 'none' });
      return;
    }

    if (!Array.isArray(this.data.bootstrap?.availableFamilyInviteRoles) ||
      !this.data.bootstrap.availableFamilyInviteRoles.includes(targetRole)) {
      wx.showToast({ title: '当前账号暂不可生成家庭邀请码', icon: 'none' });
      return;
    }

    const existingInvite = this.data.familyInviteByRole?.[targetRole] || null;
    if (existingInvite?.code) {
      const confirmed = await this.confirmRefresh('刷新后，之前发出的家庭邀请码会立即失效。');
      if (!confirmed) {
        return;
      }
    }

    this.setData({
      submittingFamilyRole: targetRole
    });

    try {
      const result = await inviteService.issueFamilyCode(targetRole);
      const familyInviteByRole = {
        ...this.data.familyInviteByRole,
        [targetRole]: decorateInvite(result, FAMILY_ROLE_META[targetRole].label)
      };
      this.setData({
        submittingFamilyRole: '',
        familyInviteByRole,
        ...buildFamilyInviteState(targetRole, this.data.bootstrap, familyInviteByRole)
      });
      wx.showToast({ title: '已生成', icon: 'success' });
    } catch (error) {
      this.setData({
        submittingFamilyRole: ''
      });
      wx.showToast({ title: error?.message || '生成失败', icon: 'none' });
    }
  },

  async onCopyTap(e) {
    const { kind = 'family', role = '' } = e.currentTarget.dataset || {};
    const targetRole = role || this.data.activeFamilyInviteRole;
    const invite = kind === 'admission'
      ? this.data.admissionInvite
      : this.data.familyInviteByRole?.[targetRole] || null;

    if (!invite?.code) {
      return;
    }

    if (!invite.isExpired) {
      wx.setClipboardData({
        data: invite.code,
        success: () => wx.showToast({ title: '已复制', icon: 'success' })
      });
      return;
    }

    const freshInvite = await this.ensureFreshInvite(kind, targetRole);
    if (!freshInvite?.code || freshInvite.isExpired) {
      wx.showToast({ title: '邀请码已过期，请先刷新', icon: 'none' });
      return;
    }

    wx.setClipboardData({
      data: freshInvite.code,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  buildSharePayload(kind, targetRole) {
    const invite = kind === 'admission'
      ? this.data.admissionInvite
      : this.data.familyInviteByRole?.[targetRole || 'child'] || null;
    const code = invite?.isExpired ? null : invite?.code;

    if (!code) {
      return {
        title: '小CEO日程表',
        path: '/pages/launch/launch'
      };
    }

    if (kind === 'admission') {
      return {
        title: '邀请你进入小CEO日程表',
        path: `/pages/launch/launch?inviteCode=${encodeURIComponent(code)}`
      };
    }

    return {
      title: targetRole === 'parent' ? '邀请你加入我的家庭（家长）' : '邀请你加入我的家庭（孩子）',
      path: `/pages/launch/launch?inviteCode=${encodeURIComponent(code)}`
    };
  },

  onShareAppMessage(options = {}) {
    const dataset = options.target?.dataset || {};
    return this.buildSharePayload(dataset.kind, dataset.role);
  }
});
