/**
 * family-settings.js - 家庭设置页（家长专属）
 */

const logger = require('../../../utils/logger');

Page({
  data: {
    family: null,           // 当前家庭信息
    members: [],            // 家庭成员列表
    loading: true,
    isParent: false,        // loginUser 是否为家长
    // 邀请码相关
    inviteCode: '',
    inviteCodeExpiresAt: null,
    inviteCodeRole: 'child',
    // 创建/加入家庭
    showCreateDialog: false,
    showJoinDialog: false,
    familyNameInput: '',
    joinCodeInput: '',
    // PIN 设置
    showPinDialog: false,
    pinInput: '',
    pinConfirmInput: '',
  },

  onLoad() {
    const app = getApp();
    const userService = app.globalData?.userService;
    if (!userService) return;

    const loginUser = userService.getLoginUser();
    if (!loginUser) return;

    // 已加入家庭的孩子不需要再进入此页面（家庭管理由家长负责）
    if (loginUser.role === 'child' && loginUser.familyId) {
      logger.warn('FamilySettings', '已加入家庭的孩子无需访问，重定向');
      wx.showToast({ title: '家庭设置仅家长可管理', icon: 'none' });
      wx.navigateBack({ delta: 1 });
      return;
    }
    // 记录当前登录用户角色，供 WXML 控制按钮显示
    this.setData({ isParent: loginUser.role === 'parent' });
    // 未加入家庭的用户（包括 child 角色）允许访问，以便输入邀请码加入家庭
    this._loadFamilyData();
  },

  onShow() {
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
        const members = await this._loadMembers();
        this.setData({
          family,
          members,
          inviteCode: family.inviteCode || '',
          inviteCodeExpiresAt: family.inviteCodeExpiresAt,
          inviteCodeRole: family.inviteCodeRole || 'child',
          loading: false,
        });
      } else {
        this.setData({ family: null, loading: false });
      }
    } catch (error) {
      logger.error('FamilySettings', '加载家庭数据失败', error);
      this.setData({ loading: false });
    }
  },

  async _loadMembers() {
    try {
      // 直接调用 API 获取全量成员（含其他家长），不经 getAllUsers() 过滤
      const HttpClient = require('../../../utils/http-client');
      const API_CONFIG = require('../../../utils/api-config');
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
    this.setData({ showJoinDialog: true, joinCodeInput: '' });
  },

  onJoinCodeInput(e) {
    this.setData({ joinCodeInput: e.detail.value });
  },

  async confirmJoinFamily() {
    const code = this.data.joinCodeInput.trim();
    if (!code) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' });
      return;
    }
    try {
      const userService = getApp().globalData?.userService;
      const result = await userService.joinFamily(code);
      if (result.success) {
        wx.showToast({ title: '加入成功', icon: 'success' });
        this.setData({ showJoinDialog: false });
        await this._loadFamilyData();
      } else {
        wx.showToast({ title: result.message || '加入失败', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '加入失败', icon: 'none' });
    }
  },

  cancelJoinFamily() {
    this.setData({ showJoinDialog: false });
  },

  // ===== 邀请码刷新 =====
  onInviteCodeRoleChange(e) {
    this.setData({ inviteCodeRole: e.detail.value });
  },

  async refreshInviteCode() {
    try {
      const userService = getApp().globalData?.userService;
      const result = await userService.refreshInviteCode(this.data.inviteCodeRole);
      this.setData({
        inviteCode: result.inviteCode,
        inviteCodeExpiresAt: result.inviteCodeExpiresAt,
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
              const members = await this._loadMembers();
              this.setData({ members });
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
              const members = await this._loadMembers();
              this.setData({ members });
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
});
