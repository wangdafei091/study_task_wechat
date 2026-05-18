const logger = require('../../utils/logger');
const { UserRole } = require('../../models/user');
const {
  buildSwitcherDisplayState,
  getUserId,
  listAvatarPresets
} = require('../../utils/user-identity-display');
const { parseAvatarPresetId } = require('../../utils/user-avatar-presets');

const ACTION_LABELS = {
  rename: '修改称呼',
  pickAvatar: '更换头像'
};

Component({
  properties: {
    currentUser: {
      type: Object,
      value: null
    },
    availableUsers: {
      type: Array,
      value: []
    },
    visible: {
      type: Boolean,
      value: false
    },
    showAddUser: {
      type: Boolean,
      value: true
    },
    loginUserId: {
      type: String,
      value: ''
    },
    permissionContext: {
      type: Object,
      value: {}
    }
  },

  data: {
    isRendered: false,
    switchAnimation: {},
    showPinDialog: false,
    pinInput: '',
    pinTargetUserId: '',
    showNicknameDialog: false,
    nicknameInput: '',
    nicknameTargetUserId: '',
    isNicknameSubmitting: false,
    showAvatarDialog: false,
    avatarTargetUserId: '',
    selectedAvatarPresetId: '',
    avatarPresetOptions: [],
    isAvatarSubmitting: false,
    switcherDisplayState: {
      currentCard: null,
      switchableUsers: [],
      footerAction: {
        visible: false,
        text: '添加成员'
      }
    }
  },

  lifetimes: {
    attached() {
      this.initAnimations();
      this._nicknameRequestSeq = 0;
      this._avatarRequestSeq = 0;
      this.setData({
        isRendered: this.data.visible === true
      });
      this.rebuildDisplayState();
    },
    detached() {
      this.clearAnimationTimers();
    }
  },

  observers: {
    visible(visible) {
      if (visible) {
        this.clearAnimationTimers();
        if (!this.switchAnimation) {
          this.initAnimations();
        }
        this.rebuildDisplayState();
        this.switchAnimation.translateY('100%').opacity(0).step({ duration: 0 });
        this.setData({
          isRendered: true,
          switchAnimation: this.switchAnimation.export()
        });

        this._openAnimationTimer = setTimeout(() => {
          this.switchAnimation.translateY('0%').opacity(1).step({ duration: 240 });
          this.setData({
            switchAnimation: this.switchAnimation.export()
          });
        }, 20);
        return;
      }

      if (this.data.isRendered) {
        this.playCloseAnimation();
      }
    },
    'currentUser, availableUsers, loginUserId, permissionContext': function() {
      this.rebuildDisplayState();
    }
  },

  methods: {
    initAnimations() {
      this.switchAnimation = wx.createAnimation({
        duration: 240,
        timingFunction: 'ease-out'
      });
    },

    clearAnimationTimers() {
      if (this._openAnimationTimer) {
        clearTimeout(this._openAnimationTimer);
        this._openAnimationTimer = null;
      }
      if (this._closeAnimationTimer) {
        clearTimeout(this._closeAnimationTimer);
        this._closeAnimationTimer = null;
      }
    },

    rebuildDisplayState() {
      const switcherDisplayState = buildSwitcherDisplayState({
        currentUser: this.data.currentUser,
        availableUsers: this.data.availableUsers,
        loginUserId: this.data.loginUserId,
        permissionContext: this.data.permissionContext || {}
      });

      this.setData({ switcherDisplayState });
    },

    findUserById(userId) {
      const currentUser = this.data.currentUser;
      if (getUserId(currentUser) === userId) {
        return currentUser;
      }

      return (this.data.availableUsers || []).find((user) => getUserId(user) === userId) || null;
    },

    findDisplayUserById(userId) {
      const state = this.data.switcherDisplayState || {};
      if (state.currentCard && state.currentCard.userId === userId) {
        return state.currentCard;
      }

      return (state.switchableUsers || []).find((user) => user.userId === userId) || null;
    },

    switchToUser(e) {
      const { userId } = e.currentTarget.dataset;
      const currentUser = this.data.currentUser;
      const user = this.findUserById(userId);

      if (!user) {
        wx.showToast({ title: '用户不存在', icon: 'error' });
        return;
      }

      const isChildToParent = currentUser?.role === UserRole.CHILD && user.role === UserRole.PARENT;
      if (isChildToParent) {
        const loginUserId = this.data.loginUserId;
        const pinKey = loginUserId ? `family_pin_${loginUserId}` : 'family_pin';
        const storedPin = wx.getStorageSync(pinKey);

        if (storedPin) {
          this.setData({
            showPinDialog: true,
            pinInput: '',
            pinTargetUserId: userId
          });
          return;
        }
      }

      this.triggerEvent('userSwitch', { userId });
    },

    onPinInput(e) {
      this.setData({ pinInput: e.detail.value });
    },

    confirmPin() {
      const { pinInput, pinTargetUserId, loginUserId } = this.data;
      const pinKey = loginUserId ? `family_pin_${loginUserId}` : 'family_pin';
      const storedPin = wx.getStorageSync(pinKey);

      if (pinInput === storedPin) {
        this.setData({ showPinDialog: false, pinInput: '' });
        this.triggerEvent('userSwitch', { userId: pinTargetUserId });
        return;
      }

      wx.showToast({ title: '密码错误', icon: 'error' });
      this.setData({ pinInput: '' });
    },

    cancelPin() {
      this.setData({ showPinDialog: false, pinInput: '' });
    },

    showAddUserDialog() {
      if (this.data.permissionContext?.canManageFamilyGovernance !== true) {
        wx.showToast({ title: '当前不能添加成员', icon: 'none' });
        return;
      }

      this.triggerEvent('userAdd', {});
      this.closeUserSwitcher();
    },

    navigateToHelpFeedback() {
      this.triggerEvent('helpFeedback', {});
    },

    openManagementActions(e) {
      const { userId } = e.currentTarget.dataset;
      const displayUser = this.findDisplayUserById(userId);
      const actions = displayUser?.managementActions || [];

      if (!actions.length) {
        return;
      }

      wx.showActionSheet({
        itemList: actions.map((action) => ACTION_LABELS[action]),
        success: (result) => {
          const action = actions[result.tapIndex];
          if (action === 'rename') {
            this.openNicknameDialog(userId);
            return;
          }
          if (action === 'pickAvatar') {
            this.openAvatarDialog(userId);
          }
        }
      });
    },

    openNicknameDialog(userId) {
      const user = this.findUserById(userId);
      if (!user) {
        return;
      }

      this.setData({
        showNicknameDialog: true,
        nicknameInput: user.name || '',
        nicknameTargetUserId: userId
      });
    },

    onNicknameInput(e) {
      this.setData({ nicknameInput: e.detail.value });
    },

    confirmNicknameEdit() {
      if (this.data.isNicknameSubmitting) {
        return;
      }

      const nickname = String(this.data.nicknameInput || '').trim();
      if (!nickname) {
        wx.showToast({ title: '称呼不能为空', icon: 'error' });
        return;
      }

      this._nicknameRequestSeq += 1;
      const requestSeq = this._nicknameRequestSeq;
      this.setData({
        isNicknameSubmitting: true
      });
      this.triggerEvent('nicknameEdit', {
        userId: this.data.nicknameTargetUserId,
        nickname,
        onSuccess: () => {
          if (requestSeq !== this._nicknameRequestSeq) {
            return;
          }
          this.setData({
            isNicknameSubmitting: false,
            showNicknameDialog: false,
            nicknameInput: '',
            nicknameTargetUserId: ''
          });
        },
        onFailure: () => {
          if (requestSeq !== this._nicknameRequestSeq) {
            return;
          }
          this.setData({
            isNicknameSubmitting: false
          });
        }
      });
    },

    cancelNicknameEdit() {
      this._nicknameRequestSeq += 1;
      this.setData({
        isNicknameSubmitting: false,
        showNicknameDialog: false,
        nicknameInput: '',
        nicknameTargetUserId: ''
      });
    },

    openAvatarDialog(userId) {
      const user = this.findUserById(userId);
      if (!user) {
        return;
      }

      const selectedAvatarPresetId = parseAvatarPresetId(user.avatar);
      const avatarPresetOptions = listAvatarPresets().map((item) => ({
        ...item,
        selected: item.presetId === selectedAvatarPresetId
      }));

      this.setData({
        showAvatarDialog: true,
        avatarTargetUserId: userId,
        selectedAvatarPresetId,
        avatarPresetOptions
      });
    },

    selectAvatarPreset(e) {
      const { presetId } = e.currentTarget.dataset;
      this.setData({
        selectedAvatarPresetId: presetId,
        avatarPresetOptions: (this.data.avatarPresetOptions || []).map((item) => ({
          ...item,
          selected: item.presetId === presetId
        }))
      });
    },

    confirmAvatarPreset() {
      if (this.data.isAvatarSubmitting) {
        return;
      }

      const presetId = this.data.selectedAvatarPresetId;
      if (!presetId) {
        wx.showToast({ title: '请选择头像', icon: 'none' });
        return;
      }

      this._avatarRequestSeq += 1;
      const requestSeq = this._avatarRequestSeq;
      this.setData({
        isAvatarSubmitting: true
      });
      this.triggerEvent('avatarPresetUpdate', {
        userId: this.data.avatarTargetUserId,
        presetId,
        onSuccess: () => {
          if (requestSeq !== this._avatarRequestSeq) {
            return;
          }
          this.setData({
            isAvatarSubmitting: false,
            showAvatarDialog: false,
            avatarTargetUserId: '',
            selectedAvatarPresetId: '',
            avatarPresetOptions: []
          });
        },
        onFailure: () => {
          if (requestSeq !== this._avatarRequestSeq) {
            return;
          }
          this.setData({
            isAvatarSubmitting: false
          });
        }
      });
    },

    cancelAvatarDialog() {
      this._avatarRequestSeq += 1;
      this.setData({
        isAvatarSubmitting: false,
        showAvatarDialog: false,
        avatarTargetUserId: '',
        selectedAvatarPresetId: '',
        avatarPresetOptions: []
      });
    },

    playCloseAnimation() {
      this.clearAnimationTimers();
      this.switchAnimation.translateY('100%').opacity(0).step({ duration: 220 });
      this.setData({
        switchAnimation: this.switchAnimation.export()
      });

      this._closeAnimationTimer = setTimeout(() => {
        this._closeAnimationTimer = null;
        this.setData({
          isRendered: false
        });
      }, 220);
    },

    closeUserSwitcher() {
      logger.info('UserSwitcher', '关闭用户切换界面');
      this.triggerEvent('close');
    },

    preventBubble() {}
  }
});
