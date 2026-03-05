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

const HttpClient = require('../../utils/http-client');
const StorageAdapter = require('../../adapters/storage-adapter');

describe('UserService', () => {
  let userService;
  let mockHttpClient;
  let mockStorageAdapter;
  let mockEventBus;

  beforeEach(() => {
    // 重置所有mock
    jest.clearAllMocks();

    // 创建 HttpClient Mock
    mockHttpClient = {
      getUser: jest.fn(),
      getAllUsers: jest.fn(),
      switchToUser: jest.fn(),
      post: jest.fn(),
      delete: jest.fn(),
      userExists: jest.fn(),
      validateSession: jest.fn()
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
        { userId: 'parent', name: '家长', role: 'parent', status: 'active' },
        { userId: 'child', name: '孩子', role: 'child', status: 'active' }
      ];
      mockHttpClient.getAllUsers.mockResolvedValue(mockUsers);
      mockStorageAdapter.get.mockReturnValue('child');

      const initialized = await userService.initialize();

      expect(initialized).toBe(true);
      expect(userService.initialized).toBe(true);
      expect(userService.currentUser.id).toBe('child');
      expect(mockHttpClient.getAllUsers).toHaveBeenCalled();
    });


    it('本地会话为空时应该使用parent用户', async () => {
      const mockUsers = [
        { userId: 'parent', name: '家长', role: 'parent', status: 'active' },
        { userId: 'child', name: '孩子', role: 'child', status: 'active' }
      ];
      mockHttpClient.getAllUsers.mockResolvedValue(mockUsers);
      mockStorageAdapter.get.mockReturnValue(null);

      await userService.initialize();

      expect(userService.currentUser.id).toBe('parent');
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
      mockHttpClient.getUser.mockResolvedValue(mockUser);

      await userService.switchToUser('child');

      expect(userService.isCurrentUserChild()).toBe(true);
      expect(userService.isCurrentUserParent()).toBe(false);
    });
  });

  describe('用户查询', () => {
    it('getChildUserId应该返回孩子用户ID', () => {
      const mockUsers = [
        { userId: 'parent', name: '家长', role: 'parent', status: 'active' },
        { userId: 'child', name: '孩子', role: 'child', status: 'active' }
      ];
      mockHttpClient.getAllUsers.mockResolvedValue(mockUsers);

      userService.userCache.set('parent', new User(mockUsers[0]));
      userService.userCache.set('child', new User(mockUsers[1]));

      const childUserId = userService.getChildUserId();

      expect(childUserId).toBe('child');
    });

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
      mockHttpClient.getUser.mockResolvedValue(mockUser);
      mockHttpClient.switchToUser.mockResolvedValue({ success: true });

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
      mockHttpClient.getUser.mockRejectedValue(new Error('用户不存在'));

      const result = await userService.switchToUser('nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toContain('切换失败');
    });

    it('切换应该触发用户切换事件', async () => {
      const mockUser = { userId: 'child', name: '孩子', role: 'child', status: 'active' };
      mockHttpClient.getUser.mockResolvedValue(mockUser);
      mockHttpClient.switchToUser.mockResolvedValue({ success: true });

      await userService.switchToUser('child');

      mockEventBus.verifyEmit('user:switched', {
        previousUser: expect.any(Object),
        currentUser: expect.any(Object),
        timestamp: expect.any(Number)
      });
    });

    it('switchToParent应该切换到家长', async () => {
      const mockUser = { userId: 'parent', name: '家长', role: 'parent', status: 'active' };
      mockHttpClient.getUser.mockResolvedValue(mockUser);

      // 先切换到孩子
      const mockChild = { userId: 'child', name: '孩子', role: 'child', status: 'active' };
      mockHttpClient.getUser.mockResolvedValueOnce(mockChild);
      await userService.switchToUser('child');

      // 切换回家长
      mockHttpClient.getUser.mockResolvedValueOnce(mockUser);
      const result = await userService.switchToParent();

      expect(result.success).toBe(true);
      expect(result.user.userId).toBe('parent');
    });

    it('switchToChild应该切换到孩子', async () => {
      const mockUser = { userId: 'child', name: '孩子', role: 'child', status: 'active' };
      mockHttpClient.getUser.mockResolvedValue(mockUser);

      const result = await userService.switchToChild();

      expect(result.success).toBe(true);
      expect(result.user.userId).toBe('child');
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
      mockHttpClient.getAllUsers.mockResolvedValue(mockUsers);

      const result = await userService.refreshUserCache();

      expect(result).toBe(true);
      expect(userService.userCache.size).toBe(2);
      expect(mockHttpClient.getAllUsers).toHaveBeenCalled();
    });

    it('refreshUserCache失败时应该返回false', async () => {
      mockHttpClient.getAllUsers.mockRejectedValue(new Error('刷新失败'));

      const result = await userService.refreshUserCache();

      expect(result).toBe(false);
    });
  });

  describe('权限检查', () => {
    it('hasPageAccess应该检查页面访问权限', () => {
      expect(userService.hasPageAccess('pages/index/index')).toBe(true);
      expect(userService.hasPageAccess('pages/task-edit/task-edit')).toBe(true);
    });

    it('getAccessiblePages应该返回可访问的页面', () => {
      const pages = userService.getAccessiblePages();

      expect(pages).toContain('pages/index/index');
      expect(pages).toContain('pages/rewards/rewards');
      expect(pages).toContain('pages/task-edit/task-edit');
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
      mockHttpClient.getUser.mockResolvedValue(mockUser);

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
      mockHttpClient.getUser.mockResolvedValue(mockUser);

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

      await userService.initialize();
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

  describe('边界条件', () => {
    it('应该处理空的用户列表', async () => {
      mockHttpClient.getAllUsers.mockResolvedValue([]);

      const result = await userService.refreshUserCache();

      expect(result).toBe(true);
      expect(userService.userCache.size).toBe(0);
    });

    it('应该处理API验证失败', async () => {
      const mockUser = { userId: 'child', name: '孩子', role: 'child', status: 'active' };
      mockHttpClient.getUser.mockResolvedValue(mockUser);
      mockHttpClient.switchToUser.mockRejectedValue(new Error('API验证失败'));

      const result = await userService.switchToUser('child');

      expect(result.success).toBe(true);
      expect(result.user.userId).toBe('child');
    });

    it('应该处理无效的用户ID', async () => {
      mockHttpClient.getUser.mockResolvedValue(null);

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
