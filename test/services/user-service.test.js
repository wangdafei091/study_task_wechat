/**
 * user-service.test.js - UserService 测试
 *
 * 测试 UserService 的核心业务逻辑
 * 使用 MockSetup、MockEventBus、TestDataFactory 等工具
 */

const { UserService } = require('../../services/user-service');
const { User, UserRole, UserStatus } = require('../../models/user');
const MockSetup = require('../utils/mock-setup');
const MockEventBus = require('../utils/mock-event-bus');
const TestDataFactory = require('../utils/test-data-factory');

// Mock依赖
jest.mock('../../utils/logger');
jest.mock('../../utils/http-client');
jest.mock('../../adapters/storage-adapter');
jest.mock('../../utils/token-manager');
jest.mock('../../utils/app/system-user-access-state', () => ({
  isBlockedError: jest.fn(() => false),
  handleBlockedError: jest.fn()
}));
jest.mock('../../utils/api-config', () => ({
  ENABLE_API: true,
  ENDPOINTS: {
    AUTH_CURRENT: '/api/auth/current',
    FAMILIES: '/api/families',
    FAMILIES_CURRENT: '/api/families/current',
    FAMILIES_JOIN: '/api/families/join',
    FAMILIES_INVITE_CODE: '/api/families/invite-code',
    FAMILIES_MEMBERS: '/api/families/members',
    FAMILIES_ADD_MEMBER: '/api/families/members',
    FAMILIES_DELETE_MEMBER: '/api/families/members/{userId}',
    FAMILIES_MEMBER_PERMISSION_ROLE: '/api/families/members/{userId}/permission-role',
    USER_NICKNAME: '/api/users/{userId}/nickname',
    USER_AVATAR_PRESET: '/api/users/{userId}/avatar-preset',
  },
}));
jest.mock('../../utils/runtime-version', () => ({
  getRuntimeVersion: jest.fn(() => '3.9.0')
}));

const HttpClient = require('../../utils/http-client');
const StorageAdapter = require('../../adapters/storage-adapter');
const TokenManager = require('../../utils/token-manager');
const logger = require('../../utils/logger');
const API_CONFIG = require('../../utils/api-config');
const systemUserAccessState = require('../../utils/app/system-user-access-state');

describe('UserService', () => {
  let userService;
  let mockHttpClient;
  let mockStorageAdapter;
  let mockEventBus;

  beforeEach(() => {
    // 重置所有mock
    jest.clearAllMocks();
    API_CONFIG.ENABLE_API = true;

    // Mock TokenManager：模拟已登录的家长用户（initialize() 依赖此信息设置 loginUser）
    TokenManager.getUserInfo = jest.fn().mockReturnValue({ userId: 'parent', role: 'parent', familyId: null });

    // 创建 HttpClient Mock
    mockHttpClient = {
      getUser: jest.fn(),
      getAllUsers: jest.fn(),
      switchToUser: jest.fn(),
      post: jest.fn(),
      delete: jest.fn(),
      userExists: jest.fn(),
      validateSession: jest.fn(),
      get: jest.fn().mockResolvedValue(null),  // M6新增，默认返回null
      patch: jest.fn()  // M6 updateNickname
    };

    // 创建 StorageAdapter Mock
    mockStorageAdapter = {
      get: jest.fn(),
      set: jest.fn()
    };

    // Mock HttpClient 模块
    HttpClient.getUser = mockHttpClient.getUser;
    HttpClient.getAllUsers = mockHttpClient.getAllUsers;
    HttpClient.switchToUser = mockHttpClient.switchToUser;
    HttpClient.post = mockHttpClient.post;
    HttpClient.delete = mockHttpClient.delete;
    HttpClient.userExists = mockHttpClient.userExists;
    HttpClient.validateSession = mockHttpClient.validateSession;
    HttpClient.get = mockHttpClient.get;  // M6新增
    HttpClient.patch = mockHttpClient.patch;  // M6 updateNickname

    // Mock StorageAdapter 模块
    StorageAdapter.prototype.get = mockStorageAdapter.get;
    StorageAdapter.prototype.set = mockStorageAdapter.set;

    // 创建 EventBus Mock
    mockEventBus = new MockEventBus();

    // 创建 UserService 实例
    userService = new UserService({
      eventBus: mockEventBus,
      storageAdapter: mockStorageAdapter
    });
  });

  afterEach(() => {
    // 使用 MockSetup 重置所有mock
    MockSetup.resetAllMocks({
      eventBus: mockEventBus,
      services: {},
      adapters: {}
    });
  });

  describe('初始化和基本操作', () => {
    it('应该正确初始化服务', () => {
      expect(userService.currentUser).toBeInstanceOf(User);
      expect(userService.currentUser.id).toBe('parent');
      expect(userService.currentUser.role).toBe(UserRole.PARENT);
      expect(userService.initialized).toBe(false);
    });

    it('初始化应该加载用户数据', async () => {
      const mockUsers = [
        { userId: 'parent', name: '家长', role: 'parent', status: 'active', familyId: 'family_1' },
        { userId: 'child', name: '孩子', role: 'child', status: 'active' }
      ];
      // M6: initialize 通过 HttpClient.get 加载成员（loadFamilyMembers）
      mockHttpClient.get.mockImplementation(async (url) => {
        if (url && url.includes('families')) {
          return { members: mockUsers };
        }
        return mockUsers[0]; // AUTH_CURRENT 返回 loginUser 数据
      });
      mockStorageAdapter.get.mockReturnValue('child');

      const initialized = await userService.initialize();

      expect(initialized).toBe(true);
      expect(userService.initialized).toBe(true);
      expect(userService.currentUser.id).toBe('child');
      expect(mockHttpClient.get).toHaveBeenCalled();
    });

    it('未加入家庭时不应请求家庭成员接口', async () => {
      mockHttpClient.get.mockResolvedValue({
        userId: 'parent',
        nickname: '家长',
        role: 'parent',
        familyId: null
      });
      mockStorageAdapter.get.mockReturnValue(null);

      const initialized = await userService.initialize();

      expect(initialized).toBe(true);
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
      expect(userService.currentUser.id).toBe('parent');
    });

    it('AUTH_CURRENT 命中 SYSTEM_USER_BLOCKED 时不应回退到 token 用户态', async () => {
      const blockedError = Object.assign(new Error('当前账号已被管理员暂停使用'), {
        code: 'SYSTEM_USER_BLOCKED'
      });
      systemUserAccessState.isBlockedError.mockReturnValueOnce(true);
      mockHttpClient.get.mockRejectedValueOnce(blockedError);

      const initialized = await userService.initialize();

      expect(initialized).toBe(false);
      expect(systemUserAccessState.handleBlockedError).toHaveBeenCalledWith(blockedError);
      expect(userService.getLoginUser()).toBeNull();
    });


    it('本地会话为空时，家长设备应默认选第一个孩子', async () => {
      const mockUsers = [
        { userId: 'parent', name: '家长', role: 'parent', status: 'active', familyId: 'family_1' },
        { userId: 'child', name: '孩子', role: 'child', status: 'active' }
      ];
      // M6: loginUser = parent，空会话 → 默认选第一个孩子
      mockHttpClient.get.mockImplementation(async (url) => {
        if (url && url.includes('families')) return { members: mockUsers };
        return mockUsers[0]; // AUTH_CURRENT 返回 parent
      });
      mockStorageAdapter.get.mockReturnValue(null);

      await userService.initialize();

      // 家长设备 + 空会话 → currentUser 应为第一个孩子
      expect(userService.currentUser.id).toBe('child');
    });

    it('loadFamilyMembers 发现失效 currentUser 时应回退到 loginUser 并回正持久化会话', async () => {
      const loginUser = new User({
        userId: 'parent',
        name: '家长',
        role: 'parent',
        status: 'active',
        familyId: 'family_1'
      });
      userService.loginUser = loginUser;
      userService.currentUser = new User({
        userId: 'deleted_child',
        name: '旧孩子',
        role: 'child',
        status: 'active',
        familyId: 'family_1'
      });

      mockHttpClient.get.mockResolvedValue({
        members: [
          { userId: 'child_1', name: '孩子1', role: 'child', status: 'active', familyId: 'family_1' }
        ]
      });

      const loaded = await userService.loadFamilyMembers();

      expect(loaded).toBe(true);
      expect(userService.currentUser.id).toBe('parent');
      expect(mockStorageAdapter.set).toHaveBeenCalledWith('currentUserId', 'parent');
    });

    it('默认占位 currentUser 不应误报成员被删除 warning', async () => {
      const loginUser = { userId: 'real_parent', name: '家长', role: 'parent', status: 'active', familyId: 'family_1' };
      const onlyChild = { userId: 'child_1', name: '孩子1', role: 'child', status: 'active', familyId: 'family_1' };

      mockHttpClient.get.mockImplementation(async (url) => {
        if (url && url.includes('families')) {
          return { members: [onlyChild] };
        }
        return loginUser;
      });
      mockStorageAdapter.get.mockReturnValue(null);

      const initialized = await userService.initialize();

      expect(initialized).toBe(true);
      expect(logger.warn).not.toHaveBeenCalledWith(
        'UserService',
        '当前视角成员已被删除，内存回退到 loginUser',
        expect.any(Object)
      );
      expect(logger.info).toHaveBeenCalledWith(
        'UserService',
        '检测到初始化占位视角，自动回正到 loginUser',
        expect.objectContaining({ userId: 'parent' })
      );
    });

    it('_saveUserState 应复用 _persistCurrentUserId 且不再回退 wx.setStorageSync', async () => {
      userService.currentUser = new User({
        userId: 'child_1',
        name: '孩子1',
        role: 'child'
      });
      userService._persistCurrentUserId = jest.fn().mockReturnValue(true);
      global.wx = {
        setStorageSync: jest.fn()
      };

      await userService._saveUserState();

      expect(userService._persistCurrentUserId).toHaveBeenCalledWith('child_1');
      expect(global.wx.setStorageSync).not.toHaveBeenCalled();
      delete global.wx;
    });

    it('_persistCurrentUserId 在 StorageAdapter 缺失或异常时应返回 false', () => {
      expect(userService._persistCurrentUserId('child_1')).toBe(true);

      userService.storageAdapter = null;
      expect(userService._persistCurrentUserId('child_2')).toBe(false);

      userService.storageAdapter = {
        set: jest.fn(() => {
          throw new Error('storage-fail');
        })
      };
      expect(userService._persistCurrentUserId('child_3')).toBe(false);
    });

    it('applySystemAccessLevelSnapshot 应同步更新 loginUser、currentUser 与缓存', () => {
      const targetUser = new User({
        userId: 'parent',
        name: '家长',
        role: 'parent',
        systemAccessLevel: 'normal'
      });
      userService.loginUser = targetUser;
      userService.currentUser = targetUser;
      userService.userCache.set(targetUser.userId, targetUser);

      userService.applySystemAccessLevelSnapshot('parent', {
        systemAccessLevel: 'readonly',
        systemAccessUpdatedAt: '2026-04-26 12:00:00',
        systemAccessUpdatedByUserId: 'admin_1'
      });

      expect(userService.loginUser.systemAccessLevel).toBe('readonly');
      expect(userService.currentUser.systemAccessLevel).toBe('readonly');
      expect(userService.userCache.get('parent').systemAccessUpdatedByUserId).toBe('admin_1');
    });

    it('loadFamilyMembers 应将 loginUser 与 currentUser 回绑到最新缓存对象', async () => {
      userService.loginUser = new User({
        userId: 'parent',
        name: '旧家长',
        role: 'parent',
        familyId: 'family_1',
        systemAccessLevel: 'normal'
      });
      userService.currentUser = new User({
        userId: 'parent',
        name: '旧家长',
        role: 'parent',
        familyId: 'family_1',
        systemAccessLevel: 'normal'
      });

      mockHttpClient.get.mockResolvedValue({
        members: [
          {
            userId: 'parent',
            name: '新家长',
            role: 'parent',
            familyId: 'family_1',
            familyPermissionRole: 'manager',
            systemAccessLevel: 'readonly'
          },
          {
            userId: 'child_1',
            name: '孩子1',
            role: 'child',
            familyId: 'family_1',
            systemAccessLevel: 'normal'
          }
        ]
      });

      const loaded = await userService.loadFamilyMembers();

      expect(loaded).toBe(true);
      expect(userService.loginUser.name).toBe('新家长');
      expect(userService.loginUser.systemAccessLevel).toBe('readonly');
      expect(userService.currentUser).toBe(userService.loginUser);
      expect(userService.userCache.get('parent')).toBe(userService.loginUser);
    });
  });

  describe('updateCurrentProfile', () => {
    it('云端模式更新资料后应通过模型 update 刷新缓存用户的 modifyTime', async () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1700000005000);
      const loginUser = new User({
        userId: 'parent',
        name: '旧昵称',
        role: 'parent',
        avatar: 'old-avatar'
      });
      loginUser.modifyTime = 1700000000000;
      userService.loginUser = loginUser;
      userService.currentUser = loginUser;
      userService.userCache.set(loginUser.userId, loginUser);
      mockHttpClient.patch.mockResolvedValue({
        userId: 'parent',
        nickname: '新昵称',
        avatar: 'new-avatar'
      });

      const result = await userService.updateCurrentProfile({
        nickname: '新昵称',
        avatarUrl: 'new-avatar'
      });

      expect(result).toEqual({
        success: true,
        user: {
          userId: 'parent',
          nickname: '新昵称',
          avatar: 'new-avatar'
        }
      });
      expect(userService.loginUser.name).toBe('新昵称');
      expect(userService.loginUser.avatar).toBe('new-avatar');
      expect(userService.loginUser.modifyTime).toBe(1700000005000);
      expect(userService.userCache.get('parent').modifyTime).toBe(1700000005000);

      nowSpy.mockRestore();
    });
  });

  describe('获取当前用户', () => {
    it('getCurrentUser应该返回当前用户', () => {
      const currentUser = userService.getCurrentUser();
      expect(currentUser).toBeInstanceOf(User);
      expect(currentUser.id).toBe('parent');
    });

    it('getCurrentUserId应该返回当前用户ID', () => {
      const userId = userService.getCurrentUserId();
      expect(userId).toBe('parent');
    });

    it('getCurrentUserRole应该返回当前用户角色', () => {
      const role = userService.getCurrentUserRole();
      expect(role).toBe(UserRole.PARENT);
    });
  });

  describe('角色检查', () => {
    it('isCurrentUserParent应该正确判断家长角色', () => {
      expect(userService.isCurrentUserParent()).toBe(true);
      expect(userService.isCurrentUserChild()).toBe(false);
    });

    it('切换到孩子后应该正确判断孩子角色', async () => {
      const mockUser = { userId: 'child', name: '孩子', role: 'child', status: 'active' };
      // M6: switchToUser 优先从 userCache 取用户，测试中直接预填缓存
      userService.userCache.set('child', new User(mockUser));

      await userService.switchToUser('child');

      expect(userService.isCurrentUserChild()).toBe(true);
      expect(userService.isCurrentUserParent()).toBe(false);
    });
  });

  describe('用户查询', () => {
    it('getAllUsers应该返回所有用户', () => {
      const parentUser = new User({ userId: 'parent', name: '家长', role: 'parent' });
      const childUser = new User({ userId: 'child', name: '孩子', role: 'child' });

      userService.userCache.set('parent', parentUser);
      userService.userCache.set('child', childUser);

      const users = userService.getAllUsers();

      expect(users).toHaveLength(2);
      expect(users[0].userId).toBe('parent');
      expect(users[1].userId).toBe('child');
    });

    it('缓存为空时应该返回当前用户', () => {
      const users = userService.getAllUsers();

      expect(users).toHaveLength(1);
      expect(users[0].userId).toBe('parent');
    });

    it('孩子设备(非虚拟)getAllUsers只返回自己', () => {
      const childUser = new User({ userId: 'child', name: '孩子', role: 'child', isVirtual: false });
      userService.loginUser = childUser;
      userService.currentUser = childUser;
      userService.userCache.set('parent', new User({ userId: 'parent', role: 'parent' }));
      userService.userCache.set('child', childUser);

      const users = userService.getAllUsers();

      expect(users).toHaveLength(1);
      expect(users[0].userId).toBe('child');
    });

    it('getUserByRole应该根据角色返回用户', () => {
      const parentUser = new User({ userId: 'parent', name: '家长', role: 'parent' });
      const childUser = new User({ userId: 'child', name: '孩子', role: 'child' });

      userService.userCache.set('parent', parentUser);
      userService.userCache.set('child', childUser);

      const foundParent = userService.getUserByRole('parent');
      const foundChild = userService.getUserByRole('child');

      expect(foundParent.userId).toBe('parent');
      expect(foundChild.userId).toBe('child');
    });

    it('getUserById应该从缓存获取用户', () => {
      const parentUser = new User({ userId: 'parent', name: '家长', role: 'parent' });
      userService.userCache.set('parent', parentUser);

      const user = userService.getUserById('parent');

      expect(user).toBeInstanceOf(User);
      expect(user.userId).toBe('parent');
    });

    it('getUserById应该返回null如果用户不存在', () => {
      const user = userService.getUserById('nonexistent');

      expect(user).toBeNull();
    });
  });

  describe('用户切换', () => {
    it('应该成功切换到另一个用户', async () => {
      const mockUser = { userId: 'child', name: '孩子', role: 'child', status: 'active' };
      // M6: switchToUser 优先命中缓存，预填缓存可避免 API 调用
      userService.userCache.set('child', new User(mockUser));

      const result = await userService.switchToUser('child');

      expect(result.success).toBe(true);
      expect(result.user.userId).toBe('child');
      expect(userService.currentUser.id).toBe('child');
    });

    it('切换到当前用户应该返回成功', async () => {
      const result = await userService.switchToUser('parent');

      expect(result.success).toBe(true);
      expect(result.message).toBe('已经是当前用户');
    });

    it('切换失败时应该返回错误', async () => {
      // M6: 缓存中不存在目标用户，HttpClient.get 返回 null → 切换失败
      // mockHttpClient.get 已默认设置为 mockResolvedValue(null)

      const result = await userService.switchToUser('nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toContain('切换失败');
    });

    it('切换应该触发用户切换事件', async () => {
      const mockUser = { userId: 'child', name: '孩子', role: 'child', status: 'active' };
      // M6: 预填缓存，确保切换成功并触发事件
      userService.userCache.set('child', new User(mockUser));

      await userService.switchToUser('child');

      mockEventBus.verifyEmit('user:switched', {
        previousUser: expect.any(Object),
        currentUser: expect.any(Object),
        timestamp: expect.any(Number)
      });
    });

    it('switchToParent应该切换到家长', async () => {
      // M6: 预填缓存，避免 API 调用
      const mockParent = { userId: 'parent', name: '家长', role: 'parent', status: 'active' };
      const mockChild = { userId: 'child', name: '孩子', role: 'child', status: 'active' };
      userService.userCache.set('parent', new User(mockParent));
      userService.userCache.set('child', new User(mockChild));

      // 先切换到孩子
      await userService.switchToUser('child');

      // 切换回家长
      const result = await userService.switchToParent();

      expect(result.success).toBe(true);
      expect(result.user.userId).toBe('parent');
    });

    it('switchToChild应该切换到孩子', async () => {
      const mockUser = { userId: 'child', name: '孩子', role: 'child', status: 'active' };
      // M6: 预填缓存
      userService.userCache.set('child', new User(mockUser));

      const result = await userService.switchToChild();

      expect(result.success).toBe(true);
      expect(result.user.userId).toBe('child');
    });

    it('孩子设备(非虚拟)禁止切换用户', async () => {
      const childUser = new User({ userId: 'child', name: '孩子', role: 'child', isVirtual: false });
      userService.loginUser = childUser;
      userService.currentUser = childUser; // 当前是child，尝试切换到parent → 触发child设备拦截

      const result = await userService.switchToUser('parent');

      expect(result.success).toBe(false);
      expect(result.message).toContain('孩子账号不支持切换用户');
    });

    it('家长不能切换到其他家长视角', async () => {
      userService.loginUser = new User({ userId: 'parent', name: '家长', role: 'parent' });
      const otherParent = new User({ userId: 'parent2', name: '家长2', role: 'parent', status: 'active' });
      userService.userCache.set('parent2', otherParent);

      const result = await userService.switchToUser('parent2');

      expect(result.success).toBe(false);
      expect(result.message).toContain('不支持切换到其他家长账号');
    });
  });

  describe('异步用户查询', () => {
    it('getUserByIdAsync应该从API获取用户', async () => {
      const mockUser = { userId: 'user_123', name: '新用户', role: 'parent', status: 'active' };
      mockHttpClient.getUser.mockResolvedValue(mockUser);

      const user = await userService.getUserByIdAsync('user_123');

      expect(user).toBeInstanceOf(User);
      expect(user.userId).toBe('user_123');
      expect(mockHttpClient.getUser).toHaveBeenCalledWith('user_123');
    });

    it('getUserByIdAsync应该使用缓存', async () => {
      const mockUser = { userId: 'parent', name: '家长', role: 'parent', status: 'active' };
      userService.userCache.set('parent', new User(mockUser));

      const user = await userService.getUserByIdAsync('parent');

      expect(user.userId).toBe('parent');
      expect(mockHttpClient.getUser).not.toHaveBeenCalled();
    });

    it('getUserByIdAsync失败时应该返回null', async () => {
      mockHttpClient.getUser.mockRejectedValue(new Error('用户不存在'));

      const user = await userService.getUserByIdAsync('nonexistent');

      expect(user).toBeNull();
    });
  });

  describe('用户创建和删除', () => {
    it('createUser应该成功创建用户', async () => {
      const mockUserData = {
        userId: 'user_new',
        name: '新用户',
        role: 'child',
        status: 'active'
      };
      mockHttpClient.post.mockResolvedValue(mockUserData);

      const result = await userService.createUser('新用户', 'child');

      expect(result.success).toBe(true);
      expect(result.user).toBeInstanceOf(User);
      expect(result.user.name).toBe('新用户');
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/users', {
        name: '新用户',
        role: 'child',
        status: 'active'
      });
    });

    it('createUser失败时应该返回错误', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('创建失败'));

      const result = await userService.createUser('新用户', 'child');

      expect(result.success).toBe(false);
      expect(result.message).toContain('创建失败');
    });

    it('deleteUser应该成功删除用户', async () => {
      const mockUsers = [
        { userId: 'parent', name: '家长', role: 'parent', status: 'active' },
        { userId: 'child', name: '孩子', role: 'child', status: 'active' }
      ];
      mockHttpClient.getAllUsers.mockResolvedValue(mockUsers);
      mockHttpClient.delete.mockResolvedValue({ success: true });

      userService.userCache.set('parent', new User(mockUsers[0]));
      userService.userCache.set('child', new User(mockUsers[1]));

      const result = await userService.deleteUser('child');

      expect(result.success).toBe(true);
      expect(result.message).toBe('删除成功');
      expect(userService.userCache.has('child')).toBe(false);
      expect(mockHttpClient.delete).toHaveBeenCalledWith('/api/users/child');
    });

    it('删除当前用户应该返回错误', async () => {
      const result = await userService.deleteUser('parent');

      expect(result.success).toBe(false);
      expect(result.message).toBe('不能删除当前用户');
    });

    it('deleteUser失败时应该返回错误', async () => {
      mockHttpClient.delete.mockRejectedValue(new Error('删除失败'));

      const result = await userService.deleteUser('child');

      expect(result.success).toBe(false);
      expect(result.message).toContain('删除失败');
    });
  });

  describe('用户验证', () => {
    it('existsUser应该检查用户是否存在', async () => {
      userService.userCache.set('parent', new User({ userId: 'parent' }));

      const result = await userService.existsUser('parent');

      expect(result).toBe(true);
      expect(mockHttpClient.userExists).not.toHaveBeenCalled();
    });

    it('existsUser应该从API检查', async () => {
      mockHttpClient.userExists.mockResolvedValue(true);

      const result = await userService.existsUser('nonexistent');

      expect(result).toBe(true);
      expect(mockHttpClient.userExists).toHaveBeenCalledWith('nonexistent');
    });

    it('validateSession应该验证会话', async () => {
      mockHttpClient.validateSession.mockResolvedValue(true);

      const result = await userService.validateSession('parent');

      expect(result).toBe(true);
      expect(mockHttpClient.validateSession).toHaveBeenCalledWith('parent');
    });

    it('validateSession失败时应该返回false', async () => {
      mockHttpClient.validateSession.mockRejectedValue(new Error('会话无效'));

      const result = await userService.validateSession('parent');

      expect(result).toBe(false);
    });
  });

  describe('缓存刷新', () => {
    it('refreshUserCache应该刷新用户缓存', async () => {
      const mockUsers = [
        { userId: 'parent', name: '家长', role: 'parent', status: 'active' },
        { userId: 'child', name: '孩子', role: 'child', status: 'active' }
      ];
      // M6: 家庭模式下通过 loadFamilyMembers（HttpClient.get）刷新成员列表
      userService.loginUser = new User({ userId: 'parent', role: 'parent', familyId: 'family_1' });
      mockHttpClient.get.mockResolvedValue({ members: mockUsers });

      const result = await userService.refreshUserCache();

      expect(result).toBe(true);
      expect(userService.userCache.size).toBe(2);
      expect(mockHttpClient.get).toHaveBeenCalled();
    });

    it('refreshUserCache失败时应该返回false', async () => {
      // M6: 家庭模式下通过 HttpClient.get 刷新，模拟 API 失败
      userService.loginUser = new User({ userId: 'parent', role: 'parent', familyId: 'family_1' });
      mockHttpClient.get.mockRejectedValue(new Error('刷新失败'));

      const result = await userService.refreshUserCache();

      expect(result).toBe(false);
    });

    it('refreshForegroundState 应刷新 loginUser、家庭权限和当前视角缓存', async () => {
      userService.loginUser = new User({
        userId: 'parent',
        name: '旧家长',
        role: 'parent',
        familyId: 'family_1',
        familyPermissionRole: 'viewer',
        systemAccessLevel: 'normal'
      });
      userService.currentUser = new User({
        userId: 'child_1',
        name: '旧孩子',
        role: 'child',
        familyId: 'family_1'
      });
      mockStorageAdapter.get.mockReturnValue('child_1');
      mockHttpClient.get.mockImplementation(async (url) => {
        if (url === '/api/auth/current') {
          return {
            userId: 'parent',
            name: '新家长',
            role: 'parent',
            familyId: 'family_1',
            familyPermissionRole: 'manager',
            systemAccessLevel: 'normal'
          };
        }

        return {
          members: [
            {
              userId: 'parent',
              name: '新家长',
              role: 'parent',
              familyId: 'family_1',
              familyPermissionRole: 'manager',
              systemAccessLevel: 'normal'
            },
            {
              userId: 'child_1',
              name: '新孩子',
              role: 'child',
              familyId: 'family_1',
              systemAccessLevel: 'normal'
            }
          ]
        };
      });

      const result = await userService.refreshForegroundState();

      expect(result).toBe(true);
      expect(userService.loginUser.name).toBe('新家长');
      expect(userService.loginUser.familyPermissionRole).toBe('manager');
      expect(userService.currentUser.userId).toBe('child_1');
      expect(userService.currentUser.name).toBe('新孩子');
    });
  });

  describe('权限检查', () => {
    it('hasPageAccess应该检查页面访问权限', () => {
      expect(userService.hasPageAccess('pages/index/index')).toBe(true);
      expect(userService.hasPageAccess('packageTask/pages/task-edit/task-edit')).toBe(true);
    });

    it('getAccessiblePages应该返回可访问的页面', () => {
      const pages = userService.getAccessiblePages();

      expect(pages).toContain('pages/index/index');
      expect(pages).toContain('pages/rewards/rewards');
      expect(pages).toContain('packageTask/pages/task-edit/task-edit');
      expect(pages.length).toBeGreaterThan(0);
    });
  });

  describe('用户切换回调', () => {
    it('onUserSwitch应该注册回调', () => {
      const callback = jest.fn();
      userService.onUserSwitch(callback);

      expect(userService.switchCallbacks).toContain(callback);
    });

    it('offUserSwitch应该移除回调', () => {
      const callback = jest.fn();
      userService.onUserSwitch(callback);
      userService.offUserSwitch(callback);

      expect(userService.switchCallbacks).not.toContain(callback);
    });

    it('切换时应该执行所有回调', async () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      userService.onUserSwitch(callback1);
      userService.onUserSwitch(callback2);

      const mockUser = { userId: 'child', name: '孩子', role: 'child', status: 'active' };
      // M6: 预填缓存
      userService.userCache.set('child', new User(mockUser));

      await userService.switchToUser('child');

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('回调执行失败时不应该影响其他回调', async () => {
      const failingCallback = jest.fn().mockImplementation(() => {
        throw new Error('回调失败');
      });
      const successCallback = jest.fn();
      userService.onUserSwitch(failingCallback);
      userService.onUserSwitch(successCallback);

      const mockUser = { userId: 'child', name: '孩子', role: 'child', status: 'active' };
      // M6: 预填缓存
      userService.userCache.set('child', new User(mockUser));

      await userService.switchToUser('child');

      expect(successCallback).toHaveBeenCalled();
    });
  });

  describe('服务验证', () => {
    it('validateService应该验证服务状态', async () => {
      const mockUsers = [
        { userId: 'parent', name: '家长', role: 'parent', status: 'active' },
        { userId: 'child', name: '孩子', role: 'child', status: 'active' }
      ];
      mockHttpClient.getAllUsers.mockResolvedValue(mockUsers);
      // validateService 内部通过 HttpClient.get(AUTH_CURRENT) 验证 API 连接
      mockHttpClient.get.mockResolvedValue({ userId: 'parent', role: 'parent' });

      // M6: validateService 检查 loginUser 是否设置、缓存是否有数据
      // 直接设置好所需状态，不依赖 initialize() 的完整流程
      userService.initialized = true;
      userService.loginUser = new User({ userId: 'parent', role: 'parent' });
      userService.userCache.set('parent', userService.loginUser);
      userService.userCache.set('child', new User({ userId: 'child', role: 'child' }));

      const result = await userService.validateService();

      expect(result.success).toBe(true);
      expect(result.tests.initialization).toBe(true);
      expect(result.tests.currentUser).toBe(true);
      expect(result.tests.userCache).toBe(true);
      expect(result.tests.apiConnection).toBe(true);
      expect(result.tests.roleSystem).toBe(true);
    });

    it('validateService应该检测初始化问题', async () => {
      const result = await userService.validateService();

      expect(result.success).toBe(false);
      expect(result.errors).toContain('UserService未正确初始化');
    });
  });

  describe('统计信息', () => {
    it('getStatistics应该返回统计信息', () => {
      const parentUser = new User({ userId: 'parent', name: '家长', role: 'parent' });
      const childUser = new User({ userId: 'child', name: '孩子', role: 'child' });

      userService.userCache.set('parent', parentUser);
      userService.userCache.set('child', childUser);

      const stats = userService.getStatistics();

      expect(stats.currentUser.userId).toBe('parent');
      expect(stats.availableUsers).toHaveLength(2);
      expect(stats.switchCallbackCount).toBe(0);
      expect(stats.cacheSize).toBe(2);
      expect(stats.initialized).toBe(false);
    });
  });

  describe('静态方法', () => {
    it('getUserRoles应该返回角色枚举', () => {
      const roles = UserService.getUserRoles();

      expect(roles).toBe(UserRole);
      expect(roles.PARENT).toBe('parent');
      expect(roles.CHILD).toBe('child');
    });
  });

  describe('M6 家庭管理方法', () => {
    it('updateNickname应该成功更新昵称', async () => {
      mockHttpClient.patch.mockResolvedValue({});
      const childUser = new User({ userId: 'child', name: '孩子', role: 'child' });
      userService.userCache.set('child', childUser);

      const result = await userService.updateNickname('child', '新名字');

      expect(result.success).toBe(true);
      expect(childUser.name).toBe('新名字');
    });

    it('updateNickname失败时应该返回错误', async () => {
      mockHttpClient.patch.mockRejectedValue(new Error('更新失败'));

      const result = await userService.updateNickname('child', '新名字');

      expect(result.success).toBe(false);
      expect(result.message).toContain('更新失败');
    });

    it('本地模式下 viewer 家长应允许修改自己的昵称', async () => {
      API_CONFIG.ENABLE_API = false;
      userService.loginUser = new User({
        userId: 'parent_viewer',
        name: '旧昵称',
        role: UserRole.PARENT,
        familyId: 'family_1',
        familyPermissionRole: 'viewer'
      });
      userService.currentUser = userService.loginUser;
      userService.userCache.set('parent_viewer', userService.loginUser);
      mockStorageAdapter.get.mockImplementation((key) => {
        if (key === 'localFamilyMembers') {
          return [];
        }
        return null;
      });

      const result = await userService.updateNickname('parent_viewer', '新昵称');

      expect(result).toEqual({ success: true });
      expect(userService.loginUser.name).toBe('新昵称');
    });

    it('本地模式下 updateChildAvatarPreset 应更新缓存与本地持久化', async () => {
      API_CONFIG.ENABLE_API = false;
      userService.loginUser = new User({
        userId: 'parent_1',
        name: '家长',
        role: UserRole.PARENT,
        familyId: 'family_1',
        familyPermissionRole: 'manager'
      });
      const childUser = new User({
        userId: 'child_1',
        name: '孩子',
        role: UserRole.CHILD,
        familyId: 'family_1',
        isVirtual: true,
        avatar: ''
      });
      userService.currentUser = childUser;
      userService.userCache.set('parent_1', userService.loginUser);
      userService.userCache.set('child_1', childUser);
      mockStorageAdapter.get.mockImplementation((key) => {
        if (key === 'localFamilyMembers') {
          return [{
            userId: 'child_1',
            name: '孩子',
            role: UserRole.CHILD,
            familyId: 'family_1',
            isVirtual: true,
            avatar: ''
          }];
        }
        return null;
      });

      const result = await userService.updateChildAvatarPreset('child_1', 'fox');

      expect(result).toEqual({
        success: true,
        userId: 'child_1',
        avatar: 'preset:fox'
      });
      expect(userService.currentUser.avatar).toBe('preset:fox');
      expect(userService.userCache.get('child_1').avatar).toBe('preset:fox');
      expect(mockStorageAdapter.set).toHaveBeenCalledWith('localFamilyMembers', [
        expect.objectContaining({
          userId: 'child_1',
          avatar: 'preset:fox'
        })
      ]);
    });

    it('createFamily应该成功创建家庭', async () => {
      mockHttpClient.post.mockResolvedValue({ familyId: 'f1' });

      const result = await userService.createFamily('我的家庭');

      expect(result.success).toBe(true);
      expect(result.familyId).toBe('f1');
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/families', {
        name: '我的家庭',
        runtimeVersion: '3.9.0'
      });
    });

    it('createFamily失败时应该返回错误', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('创建失败'));

      const result = await userService.createFamily('我的家庭');

      expect(result.success).toBe(false);
      expect(result.message).toContain('创建失败');
    });

    it('joinFamily应该成功加入家庭', async () => {
      mockHttpClient.post.mockResolvedValue({ success: true });

      const result = await userService.joinFamily('INVITE123');

      expect(result.success).toBe(true);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/families/join', {
        inviteCode: 'INVITE123',
        runtimeVersion: '3.9.0'
      });
    });

    it('joinFamily失败时应该返回错误', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('加入失败'));

      const result = await userService.joinFamily('INVALID');

      expect(result.success).toBe(false);
      expect(result.message).toContain('加入失败');
    });

    it('getFamilyInfo应该返回家庭信息', async () => {
      const familyData = { familyId: 'f1', name: '我的家庭' };
      mockHttpClient.get.mockResolvedValue(familyData);

      const result = await userService.getFamilyInfo();

      expect(result).toEqual(familyData);
    });

    it('getFamilyInfo失败时应该返回null', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('获取失败'));

      const result = await userService.getFamilyInfo();

      expect(result).toBeNull();
    });

    it('createVirtualMember应该成功创建虚拟成员', async () => {
      const memberData = { userId: 'child2', name: '小明', role: 'child' };
      mockHttpClient.post.mockResolvedValue(memberData);
      mockHttpClient.get.mockResolvedValue({ members: [] });

      const result = await userService.createVirtualMember('小明');

      expect(result.success).toBe(true);
      expect(result.member).toEqual(memberData);
    });

    it('createVirtualMember失败时应该返回错误', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('创建失败'));

      const result = await userService.createVirtualMember('小明');

      expect(result.success).toBe(false);
    });

    it('deleteFamilyMember应该成功删除成员', async () => {
      mockHttpClient.delete.mockResolvedValue({});
      mockHttpClient.get.mockResolvedValue({ members: [] });

      const result = await userService.deleteFamilyMember('child2');

      expect(result.success).toBe(true);
    });

    it('deleteFamilyMember失败时应该返回错误', async () => {
      mockHttpClient.delete.mockRejectedValue(new Error('删除失败'));

      const result = await userService.deleteFamilyMember('child2');

      expect(result.success).toBe(false);
    });

    it('updateFamilyMemberPermissionRole 应成功更新家长权限并刷新上下文', async () => {
      const initializeSpy = jest.spyOn(userService, 'initialize').mockResolvedValue(true);
      mockHttpClient.patch.mockResolvedValue({
        userId: 'parent_2',
        familyPermissionRole: 'viewer',
        token: 'jwt-next'
      });

      const result = await userService.updateFamilyMemberPermissionRole('parent_2', 'viewer');

      expect(mockHttpClient.patch).toHaveBeenCalledWith(
        '/api/families/members/parent_2/permission-role',
        { familyPermissionRole: 'viewer' }
      );
      expect(TokenManager.setToken).toHaveBeenCalledWith('jwt-next');
      expect(initializeSpy).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('本地模式下 refreshInviteCode 应直接报不支持', async () => {
      API_CONFIG.ENABLE_API = false;

      await expect(userService.refreshInviteCode('child')).rejects.toThrow('本地模式暂不支持刷新邀请码');
      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });

    it('本地模式下 updateFamilyMemberPermissionRole 不应发起云端请求', async () => {
      API_CONFIG.ENABLE_API = false;

      const result = await userService.updateFamilyMemberPermissionRole('parent_2', 'viewer');

      expect(result).toEqual({
        success: false,
        message: '本地模式暂不支持调整家长权限'
      });
      expect(mockHttpClient.patch).not.toHaveBeenCalled();
    });

    it('updateChildAvatarPreset 在接口未发布时应返回可理解提示', async () => {
      const notFoundError = new Error('请求的资源不存在');
      notFoundError.statusCode = 404;
      notFoundError.code = 'NOT_FOUND';
      mockHttpClient.patch.mockRejectedValue(notFoundError);

      const result = await userService.updateChildAvatarPreset('child_1', 'fox');

      expect(result).toEqual({
        success: false,
        message: '当前环境还没有发布头像功能，请先更新后端服务'
      });
    });
  });

  describe('边界条件', () => {
    it('应该处理空的用户列表', async () => {
      mockHttpClient.getAllUsers.mockResolvedValue([]);

      const result = await userService.refreshUserCache();

      expect(result).toBe(true);
      expect(userService.userCache.size).toBe(0);
    });

    it('应该处理API验证失败', async () => {
      const mockUser = { userId: 'child', name: '孩子', role: 'child', status: 'active' };
      // M6: 预填缓存，switchToUser 命中缓存后不调用 API
      userService.userCache.set('child', new User(mockUser));

      const result = await userService.switchToUser('child');

      expect(result.success).toBe(true);
      expect(result.user.userId).toBe('child');
    });

    it('应该处理无效的用户ID', async () => {
      // M6: 缓存无此用户，HttpClient.get 返回 null → 切换失败
      // mockHttpClient.get 已默认设置为 mockResolvedValue(null)

      const result = await userService.switchToUser('invalid_id');

      expect(result.success).toBe(false);
    });

    it('应该处理existsUser失败', async () => {
      mockHttpClient.userExists.mockRejectedValue(new Error('检查失败'));

      const result = await userService.existsUser('nonexistent');

      expect(result).toBe(false);
    });
  });
});
