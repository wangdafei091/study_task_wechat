/**
 * user-switcher.js - 用户切换组件
 * 
 * 提供用户角色切换界面，支持家长和孩子角色切换
 */

const logger = require('../../utils/logger');
const { UserRole } = require('../../models/user');

Component({
  /**
   * 组件的属性列表
   */
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
    // 设备登录用户ID（PIN key 作用域隔离，由父页面传入）
    loginUserId: {
      type: String,
      value: '',
      observer: function(newVal) {
        // 确保 null 转换为空字符串，避免类型警告
        if (newVal === null || newVal === undefined) {
          this.setData({ loginUserId: '' });
        }
      }
    },
    // 是否有管理权限（由父页面根据 loginUser.role 计算）
    canManageMembers: {
      type: Boolean,
      value: false
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    switchAnimation: {},
    addDialogAnimation: {},
    // PIN 相关
    showPinDialog: false,
    pinInput: '',
    pinTargetUserId: '',
    // 昵称编辑相关
    showNicknameDialog: false,
    nicknameInput: '',
    nicknameTargetUserId: '',
  },

  /**
   * 组件生命周期
   */
  lifetimes: {
    attached() {
      logger.info('UserSwitcher', '用户切换组件初始化');
      this.initAnimations();
    },
    
    detached() {
      logger.info('UserSwitcher', '用户切换组件销毁');
    }
  },

  /**
   * 属性观察者
   */
  observers: {
    'visible': function(visible) {
      if (visible) {
        // 当面板需要显示时，重置动画状态为显示状态
        logger.info('UserSwitcher', '面板显示，重置动画状态');
        
        // 确保动画对象存在
        if (!this.switchAnimation) {
          this.initAnimations();
        }
        
        // 重置动画为显示状态
        this.switchAnimation.translateY('0%').opacity(1).step({ duration: 0 });
        this.setData({
          switchAnimation: this.switchAnimation.export()
        });
        
        // 播放平滑的显示动画
        setTimeout(() => {
          this.switchAnimation.translateY('0%').opacity(1).step({ duration: 300 });
          this.setData({
            switchAnimation: this.switchAnimation.export()
          });
        }, 50);
      }
    },
    
    'currentUser': function(currentUser) {
      if (currentUser) {
        logger.info('UserSwitcher', `当前用户更新: ${currentUser.name} (${currentUser.role})`);
      }
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 初始化动画
     */
    initAnimations() {
      // 切换面板动画
      this.switchAnimation = wx.createAnimation({
        duration: 300,
        timingFunction: 'ease-out'
      });
      
      // 添加用户对话框动画
      this.addDialogAnimation = wx.createAnimation({
        duration: 250,
        timingFunction: 'ease-out'
      });
      
      this.setData({
        switchAnimation: {},
        addDialogAnimation: {}
      });
    },

    /**
     * 切换用户（含 PIN 保护：孩子切回家长时检查 PIN）
     */
    switchToUser(e) {
      const { userId } = e.currentTarget.dataset;
      const currentUser = this.data.currentUser;
      const user = this.data.availableUsers.find(u => u.userId === userId);

      if (!user) {
        logger.warn('UserSwitcher', `切换用户失败: 未找到用户 ${userId}`);
        wx.showToast({ title: '用户不存在', icon: 'error' });
        return;
      }

      // 孩子切换到家长时检查 PIN
      const isChildToParent = currentUser?.role === UserRole.CHILD && user.role === UserRole.PARENT;
      if (isChildToParent) {
        const loginUserId = this.data.loginUserId;
        const pinKey = loginUserId ? `family_pin_${loginUserId}` : 'family_pin';
        const storedPin = wx.getStorageSync(pinKey);

        if (storedPin) {
          // 有 PIN，显示输入对话框
          this.setData({ showPinDialog: true, pinInput: '', pinTargetUserId: userId });
          return;
        }
        // 无 PIN，自由切换
      }

      logger.info('UserSwitcher', `切换到用户: ${user.name}`);
      this.triggerEvent('userSwitch', { userId });
      this.closeUserSwitcher();
    },

    /** PIN 输入 */
    onPinInput(e) {
      this.setData({ pinInput: e.detail.value });
    },

    /** 确认 PIN */
    confirmPin() {
      const { pinInput, pinTargetUserId, loginUserId } = this.data;
      const pinKey = loginUserId ? `family_pin_${loginUserId}` : 'family_pin';
      const storedPin = wx.getStorageSync(pinKey);

      if (pinInput === storedPin) {
        this.setData({ showPinDialog: false, pinInput: '' });
        this.triggerEvent('userSwitch', { userId: pinTargetUserId });
        this.closeUserSwitcher();
      } else {
        wx.showToast({ title: '密码错误', icon: 'error' });
        this.setData({ pinInput: '' });
      }
    },

    /** 取消 PIN */
    cancelPin() {
      this.setData({ showPinDialog: false, pinInput: '' });
    },

    /**
     * 显示添加用户（触发事件，由父页面处理跳转）
     */
    showAddUserDialog() {
      if (!this.data.canManageMembers) {
        wx.showToast({ title: '只有家长可以添加成员', icon: 'error' });
        return;
      }
      this.triggerEvent('userAdd', {});
      this.closeUserSwitcher();
    },

    /**
     * 删除用户（仅虚拟成员）
     */
    deleteUser(e) {
      if (!this.data.canManageMembers) {
        wx.showToast({ title: '只有家长可以删除成员', icon: 'error' });
        return;
      }

      const { userId } = e.currentTarget.dataset;
      const user = this.data.availableUsers.find(u => u.userId === userId);

      if (!user) {
        logger.warn('UserSwitcher', `删除用户失败: 未找到用户 ${userId}`);
        return;
      }

      wx.showModal({
        title: '确认删除',
        content: `确定要删除"${user.name}"吗？`,
        confirmText: '删除',
        confirmColor: '#FF4444',
        success: (res) => {
          if (res.confirm) {
            logger.info('UserSwitcher', `删除用户: ${user.name}`);
            
            // 触发删除用户事件
            this.triggerEvent('userDelete', {
              userId: user.userId
            });
          }
        }
      });
    },

    /**
     * 显示昵称编辑对话框
     */
    showNicknameEdit(e) {
      const { userId } = e.currentTarget.dataset;
      const user = this.data.availableUsers.find(u => u.userId === userId)
        || this.data.currentUser;
      if (!user) return;
      this.setData({
        showNicknameDialog: true,
        nicknameInput: user.name || '',
        nicknameTargetUserId: userId,
      });
    },

    onNicknameInput(e) {
      this.setData({ nicknameInput: e.detail.value });
    },

    confirmNicknameEdit() {
      const { nicknameInput, nicknameTargetUserId } = this.data;
      if (!nicknameInput.trim()) {
        wx.showToast({ title: '昵称不能为空', icon: 'error' });
        return;
      }
      this.triggerEvent('nicknameEdit', {
        userId: nicknameTargetUserId,
        nickname: nicknameInput.trim(),
      });
      this.setData({ showNicknameDialog: false });
    },

    cancelNicknameEdit() {
      this.setData({ showNicknameDialog: false, nicknameInput: '' });
    },

    /**
     * 关闭用户切换界面
     */
    closeUserSwitcher() {
      logger.info('UserSwitcher', '关闭用户切换界面');
      
      // 播放隐藏动画
      this.switchAnimation.translateY('100%').opacity(0).step();
      this.setData({
        switchAnimation: this.switchAnimation.export()
      });
      
      // 触发关闭事件
      this.triggerEvent('close');
    },

    /**
     * 阻止事件冒泡
     */
    preventBubble() {
      // 阻止点击事件冒泡到背景
    },

    /**
     * 获取角色显示文本
     */
    getRoleText(role) {
      const roleMap = {
        [UserRole.CHILD]: '孩子',
        [UserRole.PARENT]: '家长'
      };
      return roleMap[role] || '未知';
    },

    /**
     * 获取角色图标
     */
    getRoleIcon(role) {
      const iconMap = {
        [UserRole.CHILD]: '👶',
        [UserRole.PARENT]: '👩‍💼'
      };
      return iconMap[role] || '👤';
    }
  }
}); 