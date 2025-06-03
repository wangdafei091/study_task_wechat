/**
 * user-service.js - 用户服务
 * 
 * 提供用户相关的业务逻辑，包括角色管理、状态切换等
 */

const logger = require('../utils/logger');
const { User, UserRole, UserStatus } = require('../models/user');
const EventBus = require('../utils/core/event-bus');

class UserService {
  /**
   * 构造函数
   * @param {Object} options 选项
   */
  constructor(options = {}) {
    // 预设用户
    this.predefinedUsers = {
      parent: new User({
        id: 'parent',
        name: '家长',
        displayName: '家长模式',
        role: UserRole.PARENT,
        avatar: '👩‍💼',
        status: UserStatus.ACTIVE
      }),
      child: new User({
        id: 'child',
        name: '宝宝',
        displayName: '宝宝模式',
        role: UserRole.CHILD,
        avatar: '👶',
        status: UserStatus.ACTIVE
      })
    };
    
    // 当前用户（默认家长）
    this.currentUser = this.predefinedUsers.parent;
    
    // 事件总线
    this.eventBus = options.eventBus || new EventBus();
    
    // 角色切换回调
    this.switchCallbacks = [];
    
    logger.info('UserService', '初始化用户服务', { currentUserId: this.currentUser.id });
  }
  
  /**
   * 初始化服务
   * @returns {Promise<boolean>} 初始化结果
   */
  async initialize() {
    try {
      // 从存储中恢复用户状态
      await this._loadUserState();
      
      logger.info('UserService', '用户服务初始化完成', { currentUserId: this.currentUser.id });
      return true;
    } catch (error) {
      logger.error('UserService', '初始化用户服务失败', error);
      return false;
    }
  }
  
  /**
   * 获取当前用户
   * @returns {User} 当前用户对象
   */
  getCurrentUser() {
    return this.currentUser;
  }
  
  /**
   * 获取当前用户ID
   * @returns {String} 当前用户ID
   */
  getCurrentUserId() {
    return this.currentUser.id;
  }
  
  /**
   * 获取当前用户角色
   * @returns {String} 当前用户角色
   */
  getCurrentUserRole() {
    return this.currentUser.role;
  }
  
  /**
   * 检查当前用户是否为家长
   * @returns {Boolean} 是否为家长
   */
  isCurrentUserParent() {
    return this.currentUser.isParent();
  }
  
  /**
   * 检查当前用户是否为孩子
   * @returns {Boolean} 是否为孩子
   */
  isCurrentUserChild() {
    return this.currentUser.isChild();
  }
  
  /**
   * 获取所有可用用户
   * @returns {Array} 用户列表
   */
  getAllUsers() {
    return Object.values(this.predefinedUsers);
  }
  
  /**
   * 根据角色获取用户
   * @param {String} role 用户角色
   * @returns {User|null} 用户对象或null
   */
  getUserByRole(role) {
    const user = Object.values(this.predefinedUsers).find(u => u.role === role);
    return user || null;
  }
  
  /**
   * 根据ID获取用户
   * @param {String} userId 用户ID
   * @returns {User|null} 用户对象或null
   */
  getUserById(userId) {
    return this.predefinedUsers[userId] || null;
  }
  
  /**
   * 切换到指定用户
   * @param {String} userId 目标用户ID
   * @returns {Promise<Object>} 切换结果
   */
  async switchToUser(userId) {
    try {
      const targetUser = this.getUserById(userId);
      if (!targetUser) {
        logger.warn('UserService', '用户切换失败: 用户不存在', { userId });
        return { success: false, message: '目标用户不存在' };
      }
      
      if (this.currentUser.id === userId) {
        logger.info('UserService', '用户切换跳过: 已是当前用户', { userId });
        return { success: true, message: '已经是当前用户', user: this.currentUser };
      }
      
      const previousUser = this.currentUser;
      this.currentUser = targetUser;
      
      // 保存用户状态
      await this._saveUserState();
      
      // 触发切换事件
      this.eventBus.emit('userSwitched', {
        previousUser: previousUser,
        currentUser: this.currentUser,
        timestamp: Date.now()
      });
      
      // 执行切换回调
      this._executeSwitchCallbacks(previousUser, this.currentUser);
      
      logger.info('UserService', '用户切换成功', {
        from: previousUser.id,
        to: this.currentUser.id
      });
      
      return { success: true, message: '切换成功', user: this.currentUser };
    } catch (error) {
      logger.error('UserService', '用户切换失败', error);
      return { success: false, message: '切换失败: ' + error.message };
    }
  }
  
  /**
   * 切换到家长模式
   * @returns {Promise<Object>} 切换结果
   */
  async switchToParent() {
    return await this.switchToUser('parent');
  }
  
  /**
   * 切换到孩子模式
   * @returns {Promise<Object>} 切换结果
   */
  async switchToChild() {
    return await this.switchToUser('child');
  }
  
  /**
   * 检查当前用户是否有页面访问权限
   * @param {String} pagePath 页面路径
   * @returns {Boolean} 是否有权限
   */
  hasPageAccess(pagePath) {
    return this.currentUser.hasPageAccess(pagePath);
  }
  
  /**
   * 获取当前用户可访问的页面列表
   * @returns {Array} 页面路径列表
   */
  getAccessiblePages() {
    return this.currentUser.getAccessiblePages();
  }
  
  /**
   * 注册用户切换回调
   * @param {Function} callback 回调函数
   */
  onUserSwitch(callback) {
    if (typeof callback === 'function') {
      this.switchCallbacks.push(callback);
      logger.debug('UserService', '注册用户切换回调');
    }
  }
  
  /**
   * 移除用户切换回调
   * @param {Function} callback 回调函数
   */
  offUserSwitch(callback) {
    const index = this.switchCallbacks.indexOf(callback);
    if (index > -1) {
      this.switchCallbacks.splice(index, 1);
      logger.debug('UserService', '移除用户切换回调');
    }
  }
  
  /**
   * 执行用户切换回调
   * @private
   * @param {User} previousUser 之前的用户
   * @param {User} currentUser 当前用户
   */
  _executeSwitchCallbacks(previousUser, currentUser) {
    this.switchCallbacks.forEach(callback => {
      try {
        callback(currentUser, previousUser);
      } catch (error) {
        logger.error('UserService', '执行用户切换回调失败', error);
      }
    });
  }
  
  /**
   * 从存储中加载用户状态
   * @private
   */
  async _loadUserState() {
    try {
      const savedUserId = wx.getStorageSync('currentUserId');
      if (savedUserId && this.predefinedUsers[savedUserId]) {
        this.currentUser = this.predefinedUsers[savedUserId];
        logger.info('UserService', '恢复用户状态', { userId: savedUserId });
      }
    } catch (error) {
      logger.warn('UserService', '加载用户状态失败，使用默认用户', error);
    }
  }
  
  /**
   * 保存用户状态到存储
   * @private
   */
  async _saveUserState() {
    try {
      wx.setStorageSync('currentUserId', this.currentUser.id);
      logger.debug('UserService', '保存用户状态', { userId: this.currentUser.id });
    } catch (error) {
      logger.error('UserService', '保存用户状态失败', error);
    }
  }
  
  /**
   * 获取用户切换统计
   * @returns {Object} 统计信息
   */
  getStatistics() {
    return {
      currentUser: this.currentUser.toObject(),
      availableUsers: this.getAllUsers().map(u => u.toObject()),
      switchCallbackCount: this.switchCallbacks.length
    };
  }
}

module.exports = {
  UserService
}; 