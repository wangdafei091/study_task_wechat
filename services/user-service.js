/**
 * user-service.js - 用户服务
 * 
 * 提供用户相关的业务逻辑，通过API与后端交互
 * 第二阶段重构：清理本地管理逻辑，保持接口不变
 */

const logger = require('../utils/logger');
const { User, UserRole, UserStatus } = require('../models/user');
const EventBus = require('../utils/core/event-bus');
const HttpClient = require('../utils/http-client');

class UserService {
  /**
   * 构造函数
   * @param {Object} options 选项
   * @param {StorageAdapter} options.storageAdapter 存储适配器
   */
  constructor(options = {}) {
    // 当前用户缓存（默认家长，避免初始化异常）
    this.currentUser = new User({
      userId: 'parent',
      name: '家长',
      displayName: '家长模式',
      role: UserRole.PARENT,
      avatar: '👩‍💼',
      status: UserStatus.ACTIVE
    });
    
    // 用户列表缓存
    this.userCache = new Map();
    
    // 事件总线
    this.eventBus = options.eventBus || new EventBus();
    
    // 存储适配器（用于会话管理）
    this.storageAdapter = options.storageAdapter;
    
    // 角色切换回调
    this.switchCallbacks = [];
    
    // 初始化标记
    this.initialized = false;
    
    logger.info('UserService', '初始化用户服务（API模式）', { defaultUserId: this.currentUser.id });
  }
  
  /**
   * 初始化服务
   * @returns {Promise<boolean>} 初始化结果
   */
  async initialize() {
    try {
      // 从API加载用户数据并恢复会话
      await this._loadUserState();
      
      this.initialized = true;
      logger.info('UserService', '用户服务初始化完成（API模式）', { currentUserId: this.currentUser.id });
      return true;
    } catch (error) {
      logger.error('UserService', '初始化用户服务失败，使用默认用户', error);
      // 初始化失败时保持默认用户，确保系统可用
      this.initialized = true;
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
   * 获取小朋友用户ID（兼容性方法）
   * @returns {String} 小朋友用户ID
   */
  getChildUserId() {
    const childUser = this.getUserByRole('child');
    return childUser ? childUser.id : 'child';
  }
  
  /**
   * 获取所有可用用户
   * @returns {Array} 用户列表
   */
  getAllUsers() {
    // 返回缓存中的用户列表，如果缓存为空则返回当前用户
    const users = Array.from(this.userCache.values());
    return users.length > 0 ? users : [this.currentUser];
  }
  
  /**
   * 根据角色获取用户
   * @param {String} role 用户角色
   * @returns {User|null} 用户对象或null
   */
  getUserByRole(role) {
    const users = this.getAllUsers();
    const user = users.find(u => u.role === role);
    return user || null;
  }
  
  /**
   * 根据ID获取用户（同步方法，仅从缓存获取）
   * @param {String} userId 用户ID
   * @returns {User|null} 用户对象或null
   */
  getUserById(userId) {
    // 同步方法，仅从缓存获取，保持与现有代码兼容
    return this.userCache.get(userId) || null;
  }

  /**
   * 根据ID获取用户（异步方法，可从API获取）
   * @param {String} userId 用户ID
   * @returns {Promise<User|null>} 用户对象或null
   */
  async getUserByIdAsync(userId) {
    try {
      // 先检查缓存
      if (this.userCache.has(userId)) {
        return this.userCache.get(userId);
      }
      
      // 从API获取用户
      const userData = await HttpClient.getUser(userId);
      const user = new User(userData);
      
      // 更新缓存
      this.userCache.set(user.userId, user);
      
      logger.info('UserService', `从API获取用户成功: ${userId}`);
      return user;
    } catch (error) {
      logger.warn('UserService', `获取用户失败: ${userId}`, error);
      return null;
    }
  }
  
  /**
   * 切换到指定用户
   * @param {String} userId 目标用户ID
   * @returns {Promise<Object>} 切换结果
   */
  async switchToUser(userId) {
    try {
      // 检查是否已是当前用户
      if (this.currentUser.id === userId) {
        logger.info('UserService', '用户切换跳过: 已是当前用户', { userId });
        return { success: true, message: '已经是当前用户', user: this.currentUser };
      }
      
      // 先检查本地缓存中是否有目标用户
      let targetUser = this.userCache.get(userId);
      
      if (!targetUser) {
        // 如果缓存中没有，尝试从API获取
        logger.info('UserService', '本地缓存中未找到用户，从API获取', { userId });
        const userData = await HttpClient.getUser(userId);
        targetUser = new User(userData);
        this.userCache.set(targetUser.userId, targetUser);
      }
      
      // 调用后端API验证用户切换（可选，如果后端需要记录切换行为）
      try {
        await HttpClient.switchToUser(userId);
        logger.info('UserService', 'API用户切换验证成功', { userId });
      } catch (apiError) {
        logger.warn('UserService', 'API用户切换验证失败，继续本地切换', { userId, error: apiError.message });
        // API验证失败不阻止本地切换，因为用户数据已从API获取
      }
      
      const previousUser = this.currentUser;
      this.currentUser = targetUser;
      
      // 保存会话状态到本地
      await this._saveUserState();
      
      // 触发用户切换事件
      this._executeSwitchCallbacks(previousUser, this.currentUser);
      
      // 发送用户切换事件
      this.eventBus.emit('user:switched', {
        previousUser: previousUser.toObject(),
        currentUser: this.currentUser.toObject(),
        timestamp: Date.now()
      });
      
      logger.info('UserService', '用户切换成功', {
        from: previousUser.id,
        to: this.currentUser.id,
        role: this.currentUser.role
      });
      
      return {
        success: true,
        message: '切换成功',
        user: this.currentUser,
        previousUser: previousUser
      };
    } catch (error) {
      logger.error('UserService', '用户切换失败', { userId, error: error.message });
      return {
        success: false,
        message: '切换失败: ' + error.message,
        user: this.currentUser
      };
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
   * 从API加载用户状态和数据
   * @private
   */
  async _loadUserState() {
    try {
      // 1. 从API加载所有用户到缓存
      const response = await HttpClient.getAllUsers();
      const users = response.users || response; // 兼容后端返回 { users, total } 或直接返回数组
      this.userCache.clear();
      users.forEach(userData => {
        const user = new User(userData);
        this.userCache.set(user.userId, user);
      });
      
      logger.info('UserService', `加载用户列表成功: ${users.length}个用户`);
      
      // 2. 恢复会话用户（仅从本地获取会话ID，用户数据从API缓存获取）
      let savedUserId = null;
      try {
        if (this.storageAdapter) {
          savedUserId = this.storageAdapter.get('currentUserId');
        } else {
          savedUserId = wx.getStorageSync('currentUserId');
        }
      } catch (error) {
        logger.warn('UserService', '读取本地会话失败，使用默认用户', error);
      }
      
      // 3. 设置当前用户（优先使用API数据）
      if (savedUserId && this.userCache.has(savedUserId)) {
        this.currentUser = this.userCache.get(savedUserId);
        logger.info('UserService', '恢复用户会话成功', { userId: savedUserId });
      } else {
        // 默认使用parent用户（从API缓存获取）
        const parentUser = this.userCache.get('parent');
        if (parentUser) {
          this.currentUser = parentUser;
          logger.info('UserService', '使用默认用户: parent（从API获取）');
        } else {
          logger.warn('UserService', 'API中未找到parent用户，保持构造函数默认用户');
        }
      }
    } catch (error) {
      logger.error('UserService', 'API加载用户失败，使用默认用户', error);
      // API失败时保持构造函数中的默认用户，确保系统可用
    }
  }
  
  /**
   * 保存会话状态到本地存储（仅保存用户ID，用户数据从API获取）
   * @private
   */
  async _saveUserState() {
    try {
      const userId = this.currentUser.id;
      
      if (this.storageAdapter) {
        this.storageAdapter.set('currentUserId', userId);
      } else {
        wx.setStorageSync('currentUserId', userId);
      }
      
      logger.debug('UserService', '保存用户会话成功', { userId });
    } catch (error) {
      logger.error('UserService', '保存用户会话失败', error);
      // 会话保存失败不影响核心功能，仅记录错误
    }
  }
  
  /**
   * 创建新用户（通过API）
   * @param {String} name 用户名称
   * @param {String} role 用户角色
   * @returns {Promise<Object>} 创建结果
   */
  async createUser(name, role) {
    try {
      // 调用后端API创建用户
      const userData = await HttpClient.post('/api/users', {
        name: name,
        role: role,
        status: 'active'
      });
      
      const user = new User(userData);
      
      // 更新缓存
      this.userCache.set(user.userId, user);
      
      logger.info('UserService', `创建用户成功: ${user.userId}`);
      return { success: true, message: '创建成功', user: user };
    } catch (error) {
      logger.error('UserService', '创建用户失败', error);
      return { success: false, message: '创建失败: ' + error.message };
    }
  }

  /**
   * 删除用户（通过API）
   * @param {String} userId 用户ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteUser(userId) {
    try {
      // 不能删除当前用户
      if (this.currentUser.id === userId) {
        return { success: false, message: '不能删除当前用户' };
      }
      
      // 调用后端API删除用户
      await HttpClient.delete(`/api/users/${userId}`);
      
      // 从缓存中移除
      this.userCache.delete(userId);
      
      logger.info('UserService', `删除用户成功: ${userId}`);
      return { success: true, message: '删除成功' };
    } catch (error) {
      logger.error('UserService', '删除用户失败', error);
      return { success: false, message: '删除失败: ' + error.message };
    }
  }

  /**
   * 检查用户是否存在
   * @param {String} userId 用户ID
   * @returns {Promise<Boolean>} 是否存在
   */
  async existsUser(userId) {
    try {
      // 先检查缓存
      if (this.userCache.has(userId)) {
        return true;
      }
      
      // 调用API检查
      const exists = await HttpClient.userExists(userId);
      return exists;
    } catch (error) {
      logger.warn('UserService', `检查用户存在性失败: ${userId}`, error);
      return false;
    }
  }

  /**
   * 验证用户会话
   * @param {String} sessionUserId 会话用户ID
   * @returns {Promise<Boolean>} 会话是否有效
   */
  async validateSession(sessionUserId) {
    try {
      const isValid = await HttpClient.validateSession(sessionUserId);
      return isValid;
    } catch (error) {
      logger.warn('UserService', '验证用户会话失败', error);
      return false;
    }
  }

  /**
   * 刷新用户缓存（从API重新加载）
   * @returns {Promise<Boolean>} 刷新结果
   */
  async refreshUserCache() {
    try {
      const response = await HttpClient.getAllUsers();
      const users = response.users || response; // 兼容后端返回 { users, total } 或直接返回数组
      this.userCache.clear();
      users.forEach(userData => {
        const user = new User(userData);
        this.userCache.set(user.userId, user);
      });

      logger.info('UserService', `刷新用户缓存成功: ${users.length}个用户`);
      return true;
    } catch (error) {
      logger.error('UserService', '刷新用户缓存失败', error);
      return false;
    }
  }

  /**
   * 验证UserService核心功能是否正常工作
   * @returns {Promise<Object>} 验证结果
   */
  async validateService() {
    const results = {
      success: true,
      tests: {},
      errors: []
    };
    
    try {
      // 测试1: 检查初始化状态
      results.tests.initialization = this.initialized;
      if (!this.initialized) {
        results.errors.push('UserService未正确初始化');
        results.success = false;
      }
      
      // 测试2: 检查当前用户
      results.tests.currentUser = !!this.currentUser && !!this.currentUser.id;
      if (!this.currentUser) {
        results.errors.push('当前用户未设置');
        results.success = false;
      }
      
      // 测试3: 检查用户缓存
      results.tests.userCache = this.userCache.size > 0;
      if (this.userCache.size === 0) {
        results.errors.push('用户缓存为空');
        results.success = false;
      }
      
      // 测试4: 检查API连接
      try {
        const response = await HttpClient.getAllUsers();
        const users = response.users || response; // 兼容后端返回 { users, total } 或直接返回数组
        results.tests.apiConnection = Array.isArray(users) && users.length > 0;
        if (!results.tests.apiConnection) {
          results.errors.push('API连接异常或返回数据为空');
          results.success = false;
        }
      } catch (apiError) {
        results.tests.apiConnection = false;
        results.errors.push('API连接失败: ' + apiError.message);
        results.success = false;
      }
      
      // 测试5: 检查权限系统集成
      const hasParent = !!this.getUserByRole('parent');
      const hasChild = !!this.getUserByRole('child');
      results.tests.roleSystem = hasParent && hasChild;
      if (!results.tests.roleSystem) {
        results.errors.push('角色系统不完整（缺少parent或child用户）');
        results.success = false;
      }
      
      logger.info('UserService', 'Service validation completed', {
        success: results.success,
        tests: results.tests,
        errorCount: results.errors.length
      });
      
    } catch (error) {
      results.success = false;
      results.errors.push('验证过程发生异常: ' + error.message);
      logger.error('UserService', 'Service validation failed', error);
    }
    
    return results;
  }
  
  /**
   * 获取用户切换统计
   * @returns {Object} 统计信息
   */
  getStatistics() {
    return {
      currentUser: this.currentUser.toObject(),
      availableUsers: this.getAllUsers().map(u => u.toObject()),
      switchCallbackCount: this.switchCallbacks.length,
      cacheSize: this.userCache.size,
      initialized: this.initialized
    };
  }

  /**
   * 获取用户角色枚举（静态方法，供页面层使用）
   * @returns {Object} UserRole枚举对象
   * @static
   */
  static getUserRoles() {
    return UserRole;
  }
}

module.exports = {
  UserService
}; 