/**
 * user-service.js - 用户服务
 * 
 * 提供用户相关的业务逻辑，通过API与后端交互
 * 第二阶段重构：清理本地管理逻辑，保持接口不变
 */

const logger = require('../utils/logger');
const { FamilyPermissionRole, User, UserRole, UserStatus } = require('../models/user');
const EventBus = require('../utils/core/event-bus');
const HttpClient = require('../utils/http-client');
const TokenManager = require('../utils/token-manager');
const API_CONFIG = require('../utils/api-config');
const systemUserAccessState = require('../utils/app/system-user-access-state');

class UserService {
  /**
   * 构造函数
   * @param {Object} options 选项
   * @param {StorageAdapter} options.storageAdapter 存储适配器
   */
  constructor(options = {}) {
    // loginUser：设备登录用户，应用生命周期内不变（不随 switchToUser 变化）
    this.loginUser = null;

    // currentUser：当前视角用户，可通过 switchToUser 切换
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
    this.initializationBlocked = false;
    
    logger.info('UserService', '初始化用户服务（API模式）', { defaultUserId: this.currentUser.id });
  }
  
  /**
   * 初始化服务
   * @returns {Promise<boolean>} 初始化结果
   */
  async initialize() {
    try {
      this.initializationBlocked = false;

      // 1. 从 JWT 解析 loginUser（设备登录者，生命周期内不变）
      const tokenInfo = TokenManager.getUserInfo();
      if (tokenInfo && tokenInfo.userId) {
        let userDataFromAPI = null;
        try {
          userDataFromAPI = await HttpClient.get(API_CONFIG.ENDPOINTS.AUTH_CURRENT);
        } catch (error) {
          if (systemUserAccessState.isBlockedError(error)) {
            systemUserAccessState.handleBlockedError(error);
            this.userCache.clear();
            this.loginUser = null;
            this.initializationBlocked = true;
            this.currentUser = new User({
              userId: 'parent',
              name: '家长',
              displayName: '家长模式',
              role: UserRole.PARENT,
              avatar: '👩‍💼',
              status: UserStatus.ACTIVE
            });
            this.initialized = true;
            return false;
          }
        }
        if (userDataFromAPI) {
          this.loginUser = new User(userDataFromAPI);
        } else {
          // 降级：用 token 信息构造 loginUser
          this.loginUser = new User({
            userId: tokenInfo.userId,
            role: tokenInfo.role || UserRole.PARENT,
            familyId: tokenInfo.familyId || null,
            familyPermissionRole: tokenInfo.familyPermissionRole || null,
          });
        }
      }

      // 2. 仅在已加入家庭时拉取家庭成员，避免未入家庭时产生预期内 400 噪音
      if (this.loginUser?.familyId) {
        await this.loadFamilyMembers();
      } else if (this.loginUser) {
        this.userCache.clear();
        this.userCache.set(this.loginUser.userId, this.loginUser);
      }

      // 3. 本地模式：加载本地持久化的家庭和成员数据
      if (!this.loginUser) {
        this._loadLocalFamilyData();
      }

      // 4. 恢复会话，应用非法会话回正规则
      await this._restoreSession();

      this.initialized = true;
      logger.info('UserService', '用户服务初始化完成', {
        loginUserId: this.loginUser?.userId,
        currentUserId: this.currentUser.id,
        localMode: !API_CONFIG.ENABLE_API,
      });
      return true;
    } catch (error) {
      logger.error('UserService', '初始化用户服务失败，使用默认用户', error);
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
   * 获取登录用户（设备拥有者，生命周期内不变）
   * @returns {User|null}
   */
  getLoginUser() {
    return this.loginUser;
  }

  /**
   * 获取登录用户ID
   * @returns {String|null}
   */
  getLoginUserId() {
    return this.loginUser ? this.loginUser.userId : null;
  }

  applySystemAccessLevelSnapshot(userId, snapshot = {}) {
    const targets = [];

    if (this.loginUser?.userId === userId) {
      targets.push(this.loginUser);
    }
    if (this.currentUser?.userId === userId && this.currentUser !== this.loginUser) {
      targets.push(this.currentUser);
    }

    const cached = this.userCache.get(userId);
    if (cached && !targets.includes(cached)) {
      targets.push(cached);
    }

    targets.forEach((user) => {
      user.update({
        systemAccessLevel: snapshot.systemAccessLevel,
        systemAccessUpdatedAt: snapshot.systemAccessUpdatedAt,
        systemAccessUpdatedByUserId: snapshot.systemAccessUpdatedByUserId
      });
    });
  }

  _applyProfileSnapshotToUser(user, profile = {}) {
    if (!user) {
      return;
    }

    const nickname = String(profile.nickname || profile.nickName || '').trim();
    const avatar = String(profile.avatarUrl || profile.avatar || '').trim();
    const patch = {};

    if (nickname) {
      patch.name = nickname;
    }
    if (avatar) {
      patch.avatar = avatar;
    }

    if (Object.keys(patch).length === 0) {
      return;
    }

    if (typeof user.update === 'function') {
      user.update(patch);
      return;
    }

    if (patch.name !== undefined) {
      user.name = patch.name;
    }
    if (patch.avatar !== undefined) {
      user.avatar = patch.avatar;
    }
  }

  /**
   * 获取所有可用用户
   * @returns {Array} 用户列表
   */
  getAllUsers() {
    if (!this.loginUser) {
      // 未登录 / 测试环境：返回所有缓存用户
      const users = Array.from(this.userCache.values())
        .filter(u => u.status !== UserStatus.INACTIVE);
      return users.length > 0 ? users : [this.currentUser];
    }
    // 场景B孩子设备：loginUser 是真实孩子账号，只显示自己
    if (this.loginUser.role === UserRole.CHILD && !this.loginUser.isVirtual) {
      return [this.currentUser];
    }
    // 家长设备：显示 loginUser 自己 + 家庭中所有孩子（不含其他家长）
    // 家长可以在切换器中选择孩子查看任务，也可以切回自己进行管理操作
    const users = Array.from(this.userCache.values())
      .filter(u => u.status !== UserStatus.INACTIVE)
      .filter(u => u.userId === this.loginUser.userId || u.role === UserRole.CHILD);
    return users.length > 0 ? users : [this.loginUser];
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

      // 孩子设备禁止切换到其他用户
      if (this.loginUser?.role === UserRole.CHILD && !this.loginUser?.isVirtual) {
        logger.warn('UserService', '孩子设备禁止切换用户', { loginUserId: this.loginUser.userId });
        return { success: false, message: '孩子账号不支持切换用户' };
      }

      // 先检查本地缓存中是否有目标用户
      let targetUser = this.userCache.get(userId);

      if (!targetUser) {
        // 缓存 miss 时从 API 获取（同家庭成员互查已在后端开放）
        logger.info('UserService', '本地缓存中未找到用户，从API获取', { userId });
        const url = API_CONFIG.ENDPOINTS.USER_BY_ID.replace('{userId}', userId);
        const userData = await HttpClient.get(url);
        if (!userData || !userData.userId) {
          logger.warn('UserService', '用户不存在', { userId });
          return { success: false, message: '切换失败: 用户不存在' };
        }
        targetUser = new User(userData);
        this.userCache.set(targetUser.userId, targetUser);
      }

      // 家长不能切换到其他家长视角（只能切到孩子）
      if (
        this.loginUser?.role === UserRole.PARENT &&
        targetUser.role === UserRole.PARENT &&
        targetUser.userId !== this.loginUser.userId
      ) {
        logger.warn('UserService', '家长不能切换到其他家长视角', { targetUserId: userId });
        return { success: false, message: '不支持切换到其他家长账号' };
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
   * 检查是否有页面访问权限（由 loginUser 决定，不随视角切换变化）
   * @param {String} pagePath 页面路径
   * @returns {Boolean} 是否有权限
   */
  hasPageAccess(pagePath) {
    return this.currentUser.hasPageAccess(pagePath, this.loginUser);
  }

  /**
   * 获取可访问的页面列表（由 loginUser 决定，不随视角切换变化）
   * @returns {Array} 页面路径列表
   */
  getAccessiblePages() {
    return this.currentUser.getAccessiblePages(this.loginUser);
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
   * 加载家庭成员到 userCache（clear + loginUser保底 + 重建）
   */
  async loadFamilyMembers() {
    try {
      const data = await HttpClient.get(API_CONFIG.ENDPOINTS.FAMILIES_MEMBERS);
      const members = (data.members || []).map(m => new User(m));

      this.userCache.clear();
      // loginUser 必须始终在缓存中
      if (this.loginUser) {
        this.userCache.set(this.loginUser.userId, this.loginUser);
      }
      members.forEach(u => this.userCache.set(u.userId, u));
      logger.info('UserService', `家庭成员加载: ${members.length}人`);

      if (this.loginUser && this.userCache.has(this.loginUser.userId)) {
        this.loginUser = this.userCache.get(this.loginUser.userId);
      }
      if (this.currentUser && this.userCache.has(this.currentUser.userId)) {
        this.currentUser = this.userCache.get(this.currentUser.userId);
      }

      if (this.currentUser && !this.userCache.has(this.currentUser.userId)) {
        const isPlaceholderUser = this._isLegacyPlaceholderUserId(this.currentUser.userId);
        const logMethod = isPlaceholderUser ? 'info' : 'warn';
        logger[logMethod](
          'UserService',
          isPlaceholderUser
            ? '检测到初始化占位视角，自动回正到 loginUser'
            : '当前视角成员已被删除，内存回退到 loginUser',
          { userId: this.currentUser.userId }
        );
        this.currentUser = this.loginUser;
        this._persistCurrentUserId(this.loginUser?.userId || null);
      }
      return true;
    } catch (error) {
      // 无家庭或网络失败：保持仅含 loginUser 的缓存
      if (this.loginUser) {
        this.userCache.clear();
        this.userCache.set(this.loginUser.userId, this.loginUser);
      }
      logger.warn('UserService', '加载家庭成员失败，使用本地缓存', error);
      return false;
    }
  }

  /**
   * 恢复会话并应用非法会话回正规则
   * @private
   */
  async _restoreSession() {
    let savedUserId = null;
    try {
      savedUserId = this.storageAdapter
        ? this.storageAdapter.get('currentUserId')
        : null;
    } catch (e) {
      logger.warn('UserService', '读取本地会话失败', e);
    }

    const forceReset = (reason) => {
      this.currentUser = this.loginUser || this.currentUser;
      const uid = this.loginUser?.userId || null;
      this._persistCurrentUserId(uid);
      logger.info('UserService', `会话回正到 loginUser：${reason}`, { userId: uid });
    };

    if (this.loginUser?.role === UserRole.CHILD && !this.loginUser?.isVirtual) {
      // 孩子设备：忽略 savedUserId，始终使用 loginUser
      forceReset('孩子设备');
    } else if (savedUserId && this.userCache.has(savedUserId)) {
      const savedUser = this.userCache.get(savedUserId);
      if (
        this.loginUser?.role === UserRole.PARENT &&
        savedUser.role === UserRole.PARENT &&
        savedUserId !== this.loginUser.userId
      ) {
        // 家长设备恢复到其他家长视角：非法，回正
        forceReset('家长设备不允许恢复其他家长视角');
      } else {
        this.currentUser = savedUser;
      }
    } else {
      // 兜底：家长默认选第一个孩子，孩子设备默认为自己
      if (this.loginUser?.role === UserRole.PARENT) {
        const children = this.getAllUsers().filter(u => u.role === UserRole.CHILD);
        this.currentUser = children.length > 0 ? children[0] : this.loginUser;
        if (children.length > 0) {
          logger.info('UserService', '家长首次启动，默认选第一个孩子', { childId: children[0].userId });
          this._persistCurrentUserId(children[0].userId);
        }
      } else if (this.loginUser) {
        this.currentUser = this.loginUser;
        this._persistCurrentUserId(this.loginUser.userId);
      }
    }

    // 最终校验：家长设备的 currentUser 必须在有效列表（只含孩子）中
    // 防止 savedUserId 指向家长自己导致看不到孩子任务
    const validUsers = this.getAllUsers();
    if (
      this.loginUser?.role === UserRole.PARENT &&
      this.currentUser &&
      !validUsers.some(u => u.userId === this.currentUser.userId)
    ) {
      const fallback = validUsers[0] || this.loginUser;
      logger.info('UserService', '家长currentUser不在有效列表，重定向', { to: fallback.userId });
      this.currentUser = fallback;
      this._persistCurrentUserId(fallback.userId);
    }
  }

  _persistCurrentUserId(userId) {
    if (!userId) {
      return false;
    }

    if (!this.storageAdapter || typeof this.storageAdapter.set !== 'function') {
      logger.warn('UserService', 'StorageAdapter不可用，无法持久化 currentUserId', { userId });
      return false;
    }

    try {
      this.storageAdapter.set('currentUserId', userId);
      return true;
    } catch (error) {
      logger.warn('UserService', '持久化 currentUserId 失败', { userId, error: error.message });
      return false;
    }
  }

  _isLegacyPlaceholderUserId(userId) {
    return userId === 'parent' || userId === 'child';
  }

  /**
   * 更新成员昵称（通过 API），更新成功后直接刷新本地 userCache
   * @param {String} userId 目标用户ID
   * @param {String} nickname 新昵称
   * @returns {Promise<Object>}
   */
  async updateNickname(userId, nickname) {
    try {
      const url = API_CONFIG.ENDPOINTS.USER_NICKNAME.replace('{userId}', userId);
      await HttpClient.patch(url, { nickname });

      // 直接更新 userCache，不重新拉取（减少网络请求）
      const cached = this.userCache.get(userId);
      if (cached) {
        cached.name = nickname;
      }
      if (this.currentUser?.userId === userId) {
        this.currentUser.name = nickname;
      }
      if (this.loginUser?.userId === userId) {
        this.loginUser.name = nickname;
      }

      logger.info('UserService', '更新昵称成功', { userId, nickname });
      return { success: true };
    } catch (error) {
      logger.error('UserService', '更新昵称失败', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * 创建家庭
   * @param {String} name 家庭名称
   */
  async createFamily(name) {
    // 本地模式：在本地存储创建虚拟家庭
    if (this._isLocalMode()) {
      const familyId = 'local_' + Date.now();
      const localFamily = { familyId, name, createdAt: new Date().toISOString() };
      this.storageAdapter?.set('localFamily', localFamily);
      this.storageAdapter?.set('localFamilyMembers', []);

      // 以 currentUser 为基础设置 loginUser
      this.loginUser = new User({
        userId: this.currentUser.userId || 'parent',
        name: this.currentUser.name || '家长',
        displayName: this.currentUser.displayName || '家长模式',
        role: UserRole.PARENT,
        avatar: this.currentUser.avatar || '👩‍💼',
        familyId,
        familyPermissionRole: FamilyPermissionRole.MANAGER,
      });
      this.userCache.set(this.loginUser.userId, this.loginUser);

      logger.info('UserService', '本地模式创建家庭成功', { familyId, name });
      return { success: true, familyId };
    }

    try {
      const result = await HttpClient.post(API_CONFIG.ENDPOINTS.FAMILIES, { name });
      // 保存新 token（包含 familyId）
      if (result.token) {
        TokenManager.setToken(result.token);
        // 重新初始化以刷新 loginUser 和成员缓存
        await this.initialize();
      }
      logger.info('UserService', '创建家庭成功', { familyId: result.familyId });
      return { success: true, ...result };
    } catch (error) {
      logger.error('UserService', '创建家庭失败', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * 加入家庭
   * @param {String} inviteCode 邀请码
   */
  async joinFamily(inviteCode) {
    try {
      const result = await HttpClient.post(API_CONFIG.ENDPOINTS.FAMILIES_JOIN, { inviteCode });
      if (result.token) {
        TokenManager.setToken(result.token);
        await this.initialize();
      }
      logger.info('UserService', '加入家庭成功');
      return { success: true };
    } catch (error) {
      logger.error('UserService', '加入家庭失败', error);
      return { success: false, message: error.message };
    }
  }

  async updateCurrentProfile(profile = {}) {
    if (this._isLocalMode()) {
      this._applyProfileSnapshotToUser(this.loginUser, profile);
      if (this.currentUser?.userId === this.loginUser?.userId) {
        this._applyProfileSnapshotToUser(this.currentUser, profile);
      }
      return { success: true };
    }

    try {
      const result = await HttpClient.patch(API_CONFIG.ENDPOINTS.USER_CURRENT_PROFILE, profile);
      const normalizedProfile = {
        nickname: result?.nickname || result?.name || '',
        avatarUrl: result?.avatar || ''
      };

      if (this.loginUser?.userId === result?.userId) {
        this._applyProfileSnapshotToUser(this.loginUser, normalizedProfile);
      }
      if (this.currentUser?.userId === result?.userId) {
        this._applyProfileSnapshotToUser(this.currentUser, normalizedProfile);
      }
      const cached = result?.userId ? this.userCache.get(result.userId) : null;
      if (cached) {
        this._applyProfileSnapshotToUser(cached, normalizedProfile);
      }
      return { success: true, user: result };
    } catch (error) {
      logger.error('UserService', '更新当前用户资料失败', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * 获取家庭信息
   */
  async getFamilyInfo() {
    // 本地模式：从本地存储读取
    if (this._isLocalMode()) {
      const localFamily = this.storageAdapter?.get('localFamily');
      return localFamily ? { data: localFamily } : null;
    }

    try {
      return await HttpClient.get(API_CONFIG.ENDPOINTS.FAMILIES_CURRENT);
    } catch (error) {
      logger.warn('UserService', '获取家庭信息失败', error);
      return null;
    }
  }

  /**
   * 刷新邀请码
   * @param {String} role 目标角色 parent|child
   */
  async refreshInviteCode(role) {
    if (this._isLocalMode()) {
      throw new Error('本地模式暂不支持刷新邀请码');
    }

    try {
      return await HttpClient.post(API_CONFIG.ENDPOINTS.FAMILIES_INVITE_CODE, { role });
    } catch (error) {
      logger.error('UserService', '刷新邀请码失败', error);
      throw error;
    }
  }

  /**
   * 创建虚拟成员（场景A共享设备）
   * @param {String} name 成员名称
   */
  async createVirtualMember(name) {
    // 本地模式：在本地存储创建虚拟成员
    if (this._isLocalMode()) {
      const userId = 'child_' + Date.now();
      const childData = {
        userId,
        name,
        nickname: name,
        displayName: name,
        role: UserRole.CHILD,
        isVirtual: true,
        familyId: this.loginUser?.familyId || null,
        avatar: '👶',
        status: UserStatus.ACTIVE,
      };
      const childUser = new User(childData);
      this.userCache.set(userId, childUser);

      // 持久化到本地存储
      const members = this.storageAdapter?.get('localFamilyMembers') || [];
      members.push(childData);
      this.storageAdapter?.set('localFamilyMembers', members);

      logger.info('UserService', '本地模式创建虚拟成员成功', { name, userId });
      return { success: true, member: childUser };
    }

    try {
      const member = await HttpClient.post(API_CONFIG.ENDPOINTS.FAMILIES_ADD_MEMBER, { name });
      await this.loadFamilyMembers();
      logger.info('UserService', '创建虚拟成员成功', { name });
      return { success: true, member };
    } catch (error) {
      logger.error('UserService', '创建虚拟成员失败', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * 软删除家庭成员（仅虚拟成员）
   * @param {String} userId 目标用户ID
   */
  async deleteFamilyMember(userId) {
    // 本地模式：从本地存储删除成员
    if (this._isLocalMode()) {
      this.userCache.delete(userId);
      const members = this.storageAdapter?.get('localFamilyMembers') || [];
      const filtered = members.filter(m => m.userId !== userId);
      this.storageAdapter?.set('localFamilyMembers', filtered);

      // 如果删除的是 currentUser，回退到 loginUser
      if (this.currentUser?.userId === userId && this.loginUser) {
        this.currentUser = this.loginUser;
        this.storageAdapter?.set('currentUserId', this.loginUser.userId);
      }

      logger.info('UserService', '本地模式删除家庭成员成功', { userId });
      return { success: true };
    }

    try {
      const url = API_CONFIG.ENDPOINTS.FAMILIES_DELETE_MEMBER.replace('{userId}', userId);
      await HttpClient.delete(url);
      await this.loadFamilyMembers();
      logger.info('UserService', '删除家庭成员成功', { userId });
      return { success: true };
    } catch (error) {
      logger.error('UserService', '删除家庭成员失败', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * 调整家庭内家长权限
   * @param {String} userId 目标用户ID
   * @param {String} familyPermissionRole manager|viewer
   * @returns {Promise<Object>}
   */
  async updateFamilyMemberPermissionRole(userId, familyPermissionRole) {
    if (this._isLocalMode()) {
      return { success: false, message: '本地模式暂不支持调整家长权限' };
    }

    try {
      const url = API_CONFIG.ENDPOINTS.FAMILIES_MEMBER_PERMISSION_ROLE.replace('{userId}', userId);
      const result = await HttpClient.patch(url, { familyPermissionRole });
      if (result.token) {
        TokenManager.setToken(result.token);
      }
      await this.initialize();
      logger.info('UserService', '更新家长权限成功', { userId, familyPermissionRole });
      return { success: true, ...result };
    } catch (error) {
      logger.error('UserService', '更新家长权限失败', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * 判断是否为本地存储模式
   * @returns {Boolean}
   * @private
   */
  _isLocalMode() {
    return !API_CONFIG.ENABLE_API;
  }

  /**
   * 本地模式：从 StorageAdapter 加载持久化的家庭和成员数据
   * @private
   */
  _loadLocalFamilyData() {
    if (!this.storageAdapter) return;

    const localFamily = this.storageAdapter.get('localFamily');
    if (localFamily) {
      // 从 currentUser 构建 loginUser（补充 familyId）
      this.loginUser = new User({
        userId: this.currentUser.userId || 'parent',
        name: this.currentUser.name || '家长',
        displayName: this.currentUser.displayName || '家长模式',
        role: UserRole.PARENT,
        avatar: this.currentUser.avatar || '👩‍💼',
        familyId: localFamily.familyId,
        familyPermissionRole: FamilyPermissionRole.MANAGER,
      });
      this.userCache.set(this.loginUser.userId, this.loginUser);
    }

    // 加载本地虚拟成员
    const members = this.storageAdapter.get('localFamilyMembers') || [];
    members.forEach(m => {
      this.userCache.set(m.userId, new User(m));
    });

    if (localFamily || members.length > 0) {
      logger.info('UserService', '本地模式加载家庭数据', {
        familyId: localFamily?.familyId,
        membersCount: members.length,
      });
    }
  }

  /**
   * 保存会话状态到本地存储（仅保存用户ID，用户数据从API获取）
   * @private
   */
  async _saveUserState() {
    try {
      const userId = this.currentUser.id;
      const persisted = this._persistCurrentUserId(userId);
      if (!persisted) {
        return;
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
   * 刷新用户缓存（家庭模式下使用 loadFamilyMembers，保持缓存一致性）
   * @returns {Promise<Boolean>} 刷新结果
   */
  async refreshUserCache() {
    try {
      if (this.loginUser?.familyId) {
        // 家庭模式：通过 loadFamilyMembers 刷新（clear + 重建，防止幽灵成员）
        const ok = await this.loadFamilyMembers();
        if (!ok) throw new Error('loadFamilyMembers failed');
      } else {
        // 非家庭模式：只更新 loginUser 最新信息
        const userData = await HttpClient.get(API_CONFIG.ENDPOINTS.AUTH_CURRENT);
        if (userData) {
          const user = new User(userData);
          this.userCache.set(user.userId, user);
          if (this.loginUser) {
            this.loginUser = user;
          }
        }
      }
      logger.info('UserService', '刷新用户缓存成功');
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
      
      // 测试4: 检查API连接（通过获取当前用户信息验证，不依赖旧的 getAllUsers 接口）
      try {
        const response = await HttpClient.get(API_CONFIG.ENDPOINTS.AUTH_CURRENT);
        results.tests.apiConnection = !!(response && response.userId);
        if (!results.tests.apiConnection) {
          results.errors.push('API连接异常或返回数据为空');
          results.success = false;
        }
      } catch (apiError) {
        results.tests.apiConnection = false;
        results.errors.push('API连接失败: ' + apiError.message);
        results.success = false;
      }
      
      // 测试5: 检查 loginUser 已设置
      results.tests.roleSystem = !!this.loginUser;
      if (!this.loginUser) {
        results.errors.push('loginUser 未设置（JWT 解析失败或未登录）');
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
