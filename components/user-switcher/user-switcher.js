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
    // 当前用户信息
    currentUser: {
      type: Object,
      value: null
    },
    
    // 可用用户列表
    availableUsers: {
      type: Array,
      value: []
    },
    
    // 是否显示切换界面
    visible: {
      type: Boolean,
      value: false
    },
    
    // 是否显示添加用户按钮
    showAddUser: {
      type: Boolean,
      value: true
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    showAddUserDialog: false,
    newUserName: '',
    newUserRole: UserRole.CHILD,
    switchAnimation: {},
    addDialogAnimation: {},
    
    // 角色选项
    roleOptions: [
      {
        value: UserRole.CHILD,
        label: '孩子',
        icon: '👶',
        description: '可以完成任务、兑换奖励'
      },
      {
        value: UserRole.PARENT,
        label: '家长',
        icon: '👩‍💼',
        description: '可以管理任务、奖励和查看统计'
      }
    ]
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
        // 记录权限状态
        const canManageUsers = currentUser.role === UserRole.PARENT;
        logger.info('UserSwitcher', `用户管理权限: ${canManageUsers ? '有权限' : '无权限'}`);
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
     * 检查当前用户是否为家长
     */
    isCurrentUserParent() {
      return this.data.currentUser && this.data.currentUser.role === UserRole.PARENT;
    },

    /**
     * 切换用户
     */
    switchToUser(e) {
      const { userId } = e.currentTarget.dataset;
      const user = this.data.availableUsers.find(u => u.id === userId);
      
      if (!user) {
        logger.warn('UserSwitcher', `切换用户失败: 未找到用户 ${userId}`);
        wx.showToast({
          title: '用户不存在',
          icon: 'error'
        });
        return;
      }
      
      logger.info('UserSwitcher', `切换到用户: ${user.name} (${user.role})`);
      
      // 触发用户切换事件
      this.triggerEvent('userSwitch', {
        userId: user.id,
        user: user,
        previousUser: this.data.currentUser
      });
      
      // 关闭切换界面
      this.closeUserSwitcher();
    },

    /**
     * 显示添加用户对话框
     */
    showAddUserDialog() {
      // 权限检查
      if (!this.isCurrentUserParent()) {
        logger.warn('UserSwitcher', '无权限打开添加用户对话框: 当前用户非家长');
        wx.showToast({
          title: '只有家长可以添加用户',
          icon: 'error'
        });
        return;
      }
      
      logger.info('UserSwitcher', '显示添加用户对话框');
      
      this.setData({
        showAddUserDialog: true,
        newUserName: '',
        newUserRole: UserRole.CHILD
      });
      
      // 播放显示动画
      this.addDialogAnimation.scale(1).opacity(1).step();
      this.setData({
        addDialogAnimation: this.addDialogAnimation.export()
      });
    },

    /**
     * 隐藏添加用户对话框
     */
    hideAddUserDialog() {
      logger.info('UserSwitcher', '隐藏添加用户对话框');
      
      // 播放隐藏动画
      this.addDialogAnimation.scale(0.8).opacity(0).step();
      this.setData({
        addDialogAnimation: this.addDialogAnimation.export()
      });
      
      // 延迟隐藏
      setTimeout(() => {
        this.setData({
          showAddUserDialog: false
        });
      }, 250);
    },

    /**
     * 处理用户名输入
     */
    onUserNameInput(e) {
      this.setData({
        newUserName: e.detail.value.trim()
      });
    },

    /**
     * 选择角色
     */
    selectRole(e) {
      const { role } = e.currentTarget.dataset;
      logger.info('UserSwitcher', `选择角色: ${role}`);
      
      this.setData({
        newUserRole: role
      });
    },

    /**
     * 确认添加用户
     */
    confirmAddUser() {
      // 权限检查
      if (!this.isCurrentUserParent()) {
        logger.warn('UserSwitcher', '无权限添加用户: 当前用户非家长');
        wx.showToast({
          title: '只有家长可以添加用户',
          icon: 'error'
        });
        return;
      }
      
      const { newUserName, newUserRole } = this.data;
      
      if (!newUserName) {
        wx.showToast({
          title: '请输入用户名',
          icon: 'error'
        });
        return;
      }
      
      // 检查用户名是否已存在
      const exists = this.data.availableUsers.some(u => u.name === newUserName);
      if (exists) {
        wx.showToast({
          title: '用户名已存在',
          icon: 'error'
        });
        return;
      }
      
      logger.info('UserSwitcher', `添加新用户: ${newUserName} (${newUserRole})`);
      
      // 触发添加用户事件
      this.triggerEvent('userAdd', {
        name: newUserName,
        role: newUserRole
      });
      
      // 隐藏对话框
      this.hideAddUserDialog();
    },

    /**
     * 删除用户
     */
    deleteUser(e) {
      // 权限检查
      if (!this.isCurrentUserParent()) {
        logger.warn('UserSwitcher', '无权限删除用户: 当前用户非家长');
        wx.showToast({
          title: '只有家长可以删除用户',
          icon: 'error'
        });
        return;
      }
      
      const { userId } = e.currentTarget.dataset;
      const user = this.data.availableUsers.find(u => u.id === userId);
      
      if (!user) {
        logger.warn('UserSwitcher', `删除用户失败: 未找到用户 ${userId}`);
        return;
      }
      
      // 确认删除
      wx.showModal({
        title: '确认删除',
        content: `确定要删除用户"${user.name}"吗？此操作将删除该用户的所有数据。`,
        confirmText: '删除',
        confirmColor: '#FF4444',
        success: (res) => {
          if (res.confirm) {
            logger.info('UserSwitcher', `删除用户: ${user.name}`);
            
            // 触发删除用户事件
            this.triggerEvent('userDelete', {
              userId: user.id
            });
          }
        }
      });
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