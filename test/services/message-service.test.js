/**
 * message-service.test.js - MessageService 测试
 *
 * 测试 MessageService 的核心业务逻辑
 */

const MessageService = require('../../services/message-service');
const MockEventBus = require('../utils/mock-event-bus');
const TestDataFactory = require('../utils/test-data-factory');
const { Message, MessageType, NotificationType, MessagePriority } = require('../../models/message');
const { EVENTS } = require('../../utils/constants');

// Mock依赖
jest.mock('../../utils/logger');
jest.mock('../../repositories/index');
jest.mock('../../utils/http-client', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn()
}));

const { MessageRepository } = require('../../repositories/index');
const HttpClient = require('../../utils/http-client');

describe('MessageService', () => {
  let messageService;
  let mockMessageRepository;
  let mockUserService;
  let mockEventBus;
  let mockMessage;
  let mockStarService;

  beforeEach(() => {
    // 重置 MockEventBus
    if (mockEventBus && typeof mockEventBus.reset === 'function') {
      mockEventBus.reset();
    }

    // 创建Mock仓储
    mockMessageRepository = {
      loadFromStorage: jest.fn().mockResolvedValue(true),
      addMessage: jest.fn().mockImplementation(async (message) => message),
      batchAddMessages: jest.fn().mockImplementation(async (messages) => messages),
      getAll: jest.fn().mockResolvedValue([]),
      getMessagesByScope: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue(null),
      query: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(true),
      markAsRead: jest.fn().mockResolvedValue(true),
      markAllAsRead: jest.fn().mockResolvedValue(0),
      markManyAsRead: jest.fn().mockResolvedValue(0),
      batchMarkAsRead: jest.fn().mockResolvedValue(0),
      getUnreadCount: jest.fn().mockResolvedValue(0),
      getUnreadMessages: jest.fn().mockResolvedValue([]),
      deleteRelatedMessages: jest.fn().mockResolvedValue(0),
      updateTaskMessages: jest.fn().mockResolvedValue(0),
      cleanExpiredMessages: jest.fn().mockResolvedValue(0),
      archiveLegacyMessages: jest.fn().mockResolvedValue([]),
      replaceSyncedMessagesByScope: jest.fn().mockResolvedValue([]),
      cleanupStaleMessages: jest.fn().mockResolvedValue(true),
      getMessageStats: jest.fn().mockResolvedValue({
        total: 0,
        unread: 0,
        today: 0,
        highPriority: 0,
        byType: {}
      })
    };

    // Mock MessageRepository构造函数
    MessageRepository.mockImplementation(() => mockMessageRepository);

    // 创建Mock用户服务
    mockUserService = {
      getCurrentUserId: jest.fn().mockReturnValue('parent'),
      getCurrentUser: jest.fn().mockReturnValue(null),
      getLoginUser: jest.fn().mockReturnValue(null),
      getUserById: jest.fn().mockReturnValue(null),
      getUserByRole: jest.fn().mockReturnValue(null),
      getAllUsers: jest.fn().mockReturnValue([])
    };
    mockStarService = {
      syncExpiryAuthorityIfNeeded: jest.fn().mockResolvedValue({ settledGroupCount: 0 })
    };

    // 创建EventBus实例
    mockEventBus = new MockEventBus();

    // 创建MessageService实例
    messageService = new MessageService({
      eventBus: mockEventBus,
      messageRepository: mockMessageRepository,
      userService: mockUserService,
      starService: mockStarService
    });

    // 创建Mock消息
    mockMessage = TestDataFactory.createMessage({
      id: 'msg_1',
      userId: 'parent',
      type: MessageType.SYSTEM,
      isRead: false
    });
  });

  afterEach(() => {
    // 不需要在这里调用 jest.clearAllMocks()，因为 beforeEach 中已经调用了
  });

  describe('初始化', () => {
    it('应该正确初始化服务', async () => {
      const initialized = await messageService.initialize();
      expect(initialized).toBe(true);
      expect(mockMessageRepository.loadFromStorage).toHaveBeenCalled();
    });

    it('初始化时应该清理过期消息', async () => {
      mockMessageRepository.cleanExpiredMessages.mockResolvedValue(5);

      await messageService.initialize();

      expect(mockMessageRepository.cleanExpiredMessages).toHaveBeenCalledWith(30);
    });

    it('清理过期消息失败时不应该影响初始化', async () => {
      mockMessageRepository.cleanExpiredMessages.mockRejectedValue(new Error('清理失败'));

      const initialized = await messageService.initialize();

      expect(initialized).toBe(true);
    });
  });

  describe('batchMarkMessagesAsRead / markRelatedMessagesAsRead', () => {
    it('batchMarkMessagesAsRead 应委托给 messageRepository.markManyAsRead', async () => {
      mockMessageRepository.markManyAsRead.mockResolvedValue(2);

      const result = await messageService.batchMarkMessagesAsRead(['msg_1', 'msg_2']);

      expect(result).toBe(2);
      expect(mockMessageRepository.markManyAsRead).toHaveBeenCalledWith(['msg_1', 'msg_2']);
    });

    it('batchMarkMessagesAsRead 在空数组时应直接返回 0', async () => {
      const result = await messageService.batchMarkMessagesAsRead([]);

      expect(result).toBe(0);
      expect(mockMessageRepository.markManyAsRead).not.toHaveBeenCalled();
    });

    it('markRelatedMessagesAsRead 应走完整仓储链路并返回成功', async () => {
      mockMessageRepository.query.mockResolvedValue([
        TestDataFactory.createMessage({
          id: 'msg_1',
          relatedId: 'task_1',
          type: MessageType.TASK,
          isRead: false
        }),
        TestDataFactory.createMessage({
          id: 'msg_2',
          relatedId: 'task_1',
          type: MessageType.TASK,
          isRead: false
        })
      ]);
      mockMessageRepository.markManyAsRead.mockResolvedValue(2);

      const result = await messageService.markRelatedMessagesAsRead('task_1');

      expect(result).toBe(true);
      expect(mockMessageRepository.query).toHaveBeenCalled();
      expect(mockMessageRepository.markManyAsRead).toHaveBeenCalledWith(['msg_1', 'msg_2']);
    });

    it('markRelatedMessagesAsRead 在没有未读消息时应返回 false', async () => {
      mockMessageRepository.query.mockResolvedValue([]);

      const result = await messageService.markRelatedMessagesAsRead('task_1');

      expect(result).toBe(false);
      expect(mockMessageRepository.markManyAsRead).not.toHaveBeenCalled();
    });
  });

  describe('_resolveScopeOptions', () => {
    it('家长切到孩子视角时默认按孩子个人消息流解析', () => {
      mockUserService.getLoginUser.mockReturnValue({
        id: 'parent_1',
        role: 'parent',
        familyId: 'family_1'
      });
      mockUserService.getCurrentUser.mockReturnValue({
        id: 'child_1',
        role: 'child',
        familyId: 'family_1'
      });

      const result = messageService._resolveScopeOptions();

      expect(result).toEqual({
        scope: 'user',
        userId: 'child_1',
        familyId: 'family_1',
        requireFresh: false,
        preferScope: null,
        skipExpiryAuthoritySyncBeforeFormalReminders: false
      });
    });
  });

  describe('createSystemMessage - 创建系统消息', () => {
    it('应该成功创建系统消息', async () => {
      const content = '这是系统通知';
      const result = await messageService.createSystemMessage(content, 'system');

      expect(result).toBeDefined();
      expect(mockMessageRepository.addMessage).toHaveBeenCalled();
    });

    it('应该支持自定义标题和摘要', async () => {
      const content = '这是系统通知';
      const result = await messageService.createSystemMessage(content, 'system', {
        title: '自定义标题',
        summary: '自定义摘要'
      });

      expect(result).toBeDefined();
      expect(mockMessageRepository.addMessage).toHaveBeenCalled();
    });

    it('应该支持设置优先级', async () => {
      const content = '这是系统通知';
      const result = await messageService.createSystemMessage(content, 'system', {
        priority: MessagePriority.HIGH
      });

      expect(result).toBeDefined();
      expect(mockMessageRepository.addMessage).toHaveBeenCalled();
    });

    it('创建失败时应该抛出错误', async () => {
      mockMessageRepository.addMessage.mockRejectedValue(new Error('创建失败'));

      await expect(
        messageService.createSystemMessage('测试内容', 'system')
      ).rejects.toThrow();
    });
  });

  describe('createTaskMessage - 创建任务消息', () => {
    it('应该成功创建任务消息', async () => {
      const task = TestDataFactory.createTask({
        id: 'task_1',
        title: '测试任务',
        type: 'study'
      });

      const result = await messageService.createTaskMessage(task, NotificationType.NEW);

      expect(result).toBeDefined();
      expect(mockMessageRepository.addMessage).toHaveBeenCalled();
    });

    it('应该支持批量操作标记', async () => {
      const task = TestDataFactory.createTask({
        id: 'task_1',
        title: '测试任务'
      });

      const result = await messageService.createTaskMessage(task, NotificationType.NEW, {
        isBatchOperation: true,
        batchCount: 5
      });

      expect(result).toBeDefined();
      expect(mockMessageRepository.addMessage).toHaveBeenCalled();
    });

    it('应该支持优先级设置', async () => {
      const task = TestDataFactory.createTask({
        id: 'task_1',
        title: '测试任务'
      });

      const result = await messageService.createTaskMessage(task, NotificationType.NEW, {
        priority: MessagePriority.HIGH
      });

      expect(result).toBeDefined();
      expect(mockMessageRepository.addMessage).toHaveBeenCalled();
    });

    it('创建失败时应该抛出错误', async () => {
      const task = TestDataFactory.createTask({ id: 'task_1' });
      mockMessageRepository.addMessage.mockRejectedValue(new Error('创建失败'));

      await expect(
        messageService.createTaskMessage(task, NotificationType.NEW)
      ).rejects.toThrow();
    });
  });

  describe('getAllMessages - 获取所有消息', () => {
    it('应该获取所有消息', async () => {
      const messages = [mockMessage];
      mockMessageRepository.getAll.mockResolvedValue(messages);

      const result = await messageService.getAllMessages();

      expect(result).toEqual(messages);
      expect(mockMessageRepository.getAll).toHaveBeenCalled();
    });

    it('获取失败时应该返回空数组', async () => {
      mockMessageRepository.getAll.mockRejectedValue(new Error('获取失败'));

      const result = await messageService.getAllMessages();

      expect(result).toEqual([]);
    });

    it('没有消息时应该返回空数组', async () => {
      mockMessageRepository.getAll.mockResolvedValue([]);

      const result = await messageService.getAllMessages();

      expect(result).toEqual([]);
    });
  });

  describe('display compaction - 展示压缩', () => {
    it('同一任务的多条 upcoming 正式消息应只展示最新一条', async () => {
      mockUserService.getLoginUser.mockReturnValue({
        userId: 'parent_1',
        id: 'parent_1',
        role: 'parent',
        familyId: 'family_1'
      });
      mockUserService.getCurrentUser.mockReturnValue({
        userId: 'child_1',
        id: 'child_1',
        role: 'child',
        familyId: 'family_1'
      });

      mockMessageRepository.getMessagesByScope.mockResolvedValue([
        TestDataFactory.createMessage({
          id: 'msg_upcoming_old',
          userId: 'child_1',
          familyId: 'family_1',
          type: 'task',
          notificationType: 'task_upcoming',
          relatedId: 'task_1',
          relatedType: 'task',
          title: '任务即将开始：数学',
          createTime: 100
        }),
        TestDataFactory.createMessage({
          id: 'msg_upcoming_new',
          userId: 'child_1',
          familyId: 'family_1',
          type: 'task',
          notificationType: 'task_upcoming',
          relatedId: 'task_1',
          relatedType: 'task',
          title: '任务即将开始：数学',
          createTime: 200
        }),
        TestDataFactory.createMessage({
          id: 'msg_complete',
          userId: 'child_1',
          familyId: 'family_1',
          type: 'task',
          notificationType: 'task_complete',
          relatedId: 'task_1',
          relatedType: 'task',
          title: '完成任务：数学',
          createTime: 150
        })
      ]);

      const result = await messageService.getMessagesByScope();

      expect(result.map((message) => message.id)).toEqual([
        'msg_upcoming_new',
        'msg_complete'
      ]);
    });

    it('同一任务配置流应只展示最新状态消息', async () => {
      mockUserService.getLoginUser.mockReturnValue({
        userId: 'parent_1',
        id: 'parent_1',
        role: 'parent',
        familyId: 'family_1'
      });
      mockUserService.getCurrentUser.mockReturnValue({
        userId: 'child_1',
        id: 'child_1',
        role: 'child',
        familyId: 'family_1'
      });

      mockMessageRepository.getMessagesByScope.mockResolvedValue([
        TestDataFactory.createMessage({
          id: 'msg_task_create',
          userId: 'child_1',
          familyId: 'family_1',
          type: 'task',
          notificationType: 'task_create',
          relatedId: 'task_2',
          relatedType: 'task',
          createTime: 100
        }),
        TestDataFactory.createMessage({
          id: 'msg_task_required',
          userId: 'child_1',
          familyId: 'family_1',
          type: 'task',
          notificationType: 'task_required',
          relatedId: 'task_2',
          relatedType: 'task',
          createTime: 200
        }),
        TestDataFactory.createMessage({
          id: 'msg_reward_create',
          userId: 'child_1',
          familyId: 'family_1',
          type: 'reward',
          notificationType: 'reward_create',
          relatedId: 'reward_1',
          relatedType: 'reward',
          createTime: 120
        }),
        TestDataFactory.createMessage({
          id: 'msg_reward_update',
          userId: 'child_1',
          familyId: 'family_1',
          type: 'reward',
          notificationType: 'reward_update',
          relatedId: 'reward_1',
          relatedType: 'reward',
          createTime: 220
        })
      ]);

      const result = await messageService.getMessagesByScope();

      expect(result.map((message) => message.id)).toEqual([
        'msg_reward_update',
        'msg_task_required'
      ]);
    });
  });

  describe('_resolveScopeOptions - 默认消息范围', () => {
    it('未加入家庭的家长默认应回退到个人流', () => {
      mockUserService.getLoginUser.mockReturnValue({
        userId: 'parent_1',
        id: 'parent_1',
        role: 'parent',
        familyId: null
      });
      mockUserService.getCurrentUser.mockReturnValue({
        userId: 'parent_1',
        id: 'parent_1',
        role: 'parent',
        familyId: null
      });

      const result = messageService._resolveScopeOptions();

      expect(result.scope).toBe('user');
      expect(result.userId).toBe('parent_1');
      expect(result.familyId).toBeNull();
    });

    it('家长切到孩子视角时默认应使用孩子个人流', () => {
      mockUserService.getLoginUser.mockReturnValue({
        userId: 'parent_1',
        id: 'parent_1',
        role: 'parent',
        familyId: 'family_1'
      });
      mockUserService.getCurrentUser.mockReturnValue({
        userId: 'child_1',
        id: 'child_1',
        role: 'child',
        familyId: 'family_1'
      });

      const result = messageService._resolveScopeOptions();

      expect(result.scope).toBe('user');
      expect(result.userId).toBe('child_1');
      expect(result.familyId).toBe('family_1');
    });

    it('家长处于家长视角时默认应使用家庭流', () => {
      mockUserService.getLoginUser.mockReturnValue({
        userId: 'parent_1',
        id: 'parent_1',
        role: 'parent',
        familyId: 'family_1'
      });
      mockUserService.getCurrentUser.mockReturnValue({
        userId: 'parent_1',
        id: 'parent_1',
        role: 'parent',
        familyId: 'family_1'
      });

      const result = messageService._resolveScopeOptions();

      expect(result.scope).toBe('family');
      expect(result.userId).toBeNull();
      expect(result.familyId).toBe('family_1');
    });
  });

  describe('listener registration governance', () => {
    it('应注册本地模式监听、云端降级监听和领域观察者', () => {
      expect(mockEventBus.getSubscriberCount(EVENTS.TASK_CREATED)).toBe(1);
      expect(mockEventBus.getSubscriberCount(EVENTS.REWARD_CREATED)).toBe(1);
      expect(mockEventBus.getSubscriberCount(EVENTS.TASK_CLOUD_SYNC_FAILED)).toBe(1);
      expect(mockEventBus.getSubscriberCount(EVENTS.REWARD_CLOUD_SYNC_FAILED)).toBe(1);
      expect(mockEventBus.getSubscriberCount(EVENTS.DOMAIN_MESSAGE_CREATED)).toBe(1);
      expect(mockEventBus.getSubscriberCount(EVENTS.DOMAIN_MESSAGE_ALL_READ)).toBe(1);
    });
  });

  describe('scope compatibility and cloud display filtering', () => {
    afterEach(() => {
      messageService.enableCloudStorage = false;
    });

    it('云端模式下展示结果应只保留 formal 和 provisional 消息', async () => {
      messageService.enableCloudStorage = true;
      const now = Date.now();
      mockUserService.getLoginUser.mockReturnValue({
        userId: 'child_1',
        role: 'child',
        familyId: 'family_1'
      });
      mockUserService.getCurrentUser.mockReturnValue({
        id: 'child_1',
        userId: 'child_1',
        role: 'child',
        familyId: 'family_1'
      });

      mockMessageRepository.getMessagesByScope.mockResolvedValue([
        new Message({
          id: 'msg_formal',
          userId: 'child_1',
          familyId: 'family_1',
          visibilityScope: 'user',
          type: 'task',
          notificationType: 'task_create',
          title: '正式消息',
          summary: '正式消息',
          createTime: now - 1000,
          syncedToCloud: true
        }),
        new Message({
          id: 'msg_provisional',
          userId: 'child_1',
          familyId: 'family_1',
          visibilityScope: 'user',
          type: 'task',
          notificationType: 'task_create',
          title: '待同步消息',
          summary: '待同步消息',
          createTime: now,
          isProvisional: true,
          syncedToCloud: false
        }),
        new Message({
          id: 'msg_local_compat',
          userId: 'child_1',
          familyId: 'family_1',
          visibilityScope: 'user',
          type: 'task',
          notificationType: 'task_create',
          title: '旧本地消息',
          summary: '旧本地消息'
        }),
        new Message({
          id: 'msg_legacy',
          userId: 'child_1',
          familyId: 'family_1',
          visibilityScope: 'user',
          type: 'task',
          notificationType: 'task_create',
          title: 'legacy 消息',
          summary: 'legacy 消息',
          isLegacy: true
        })
      ]);

      const result = await messageService.getMessagesByScope({ scope: 'user', userId: 'child_1' });

      expect(result.map((message) => message.id)).toEqual(['msg_provisional', 'msg_formal']);
    });

    it('同一 messageEventKey 下应优先保留 formal 消息', async () => {
      messageService.enableCloudStorage = true;
      mockUserService.getLoginUser.mockReturnValue({
        userId: 'child_1',
        role: 'child',
        familyId: 'family_1'
      });
      mockUserService.getCurrentUser.mockReturnValue({
        id: 'child_1',
        userId: 'child_1',
        role: 'child',
        familyId: 'family_1'
      });

      mockMessageRepository.getMessagesByScope.mockResolvedValue([
        new Message({
          id: 'msg_provisional',
          userId: 'child_1',
          familyId: 'family_1',
          visibilityScope: 'user',
          type: 'task',
          notificationType: 'task_create',
          title: '待同步消息',
          summary: '待同步消息',
          createTime: 200,
          isProvisional: true,
          syncedToCloud: false,
          messageEventKey: 'task:create:1'
        }),
        new Message({
          id: 'msg_formal',
          userId: 'child_1',
          familyId: 'family_1',
          visibilityScope: 'user',
          type: 'task',
          notificationType: 'task_create',
          title: '正式消息',
          summary: '正式消息',
          createTime: 100,
          syncedToCloud: true,
          messageEventKey: 'task:create:1'
        })
      ]);

      const result = await messageService.getMessagesByScope({ scope: 'user', userId: 'child_1' });

      expect(result.map((message) => message.id)).toEqual(['msg_formal']);
    });

    it('scope=all 兼容分支应直接读取仓储，不触发云端保鲜或过滤', async () => {
      messageService.enableCloudStorage = true;
      mockMessageRepository.getAll.mockResolvedValue([
        new Message({
          id: 'msg_local_only',
          type: 'system',
          title: '本地兼容消息',
          summary: '本地兼容消息'
        })
      ]);

      const result = await messageService.getMessagesByScope();

      expect(result.map((message) => message.id)).toEqual(['msg_local_only']);
      expect(mockMessageRepository.getAll).toHaveBeenCalled();
      expect(mockMessageRepository.getMessagesByScope).not.toHaveBeenCalled();
      expect(HttpClient.get).not.toHaveBeenCalled();
      expect(HttpClient.post).not.toHaveBeenCalled();
    });

    it('scope=all 兼容分支不应把 user/family 两条不同消息流误折叠为一条', async () => {
      messageService.enableCloudStorage = true;
      mockMessageRepository.getAll.mockResolvedValue([
        new Message({
          id: 'msg_user',
          userId: 'child_1',
          familyId: 'family_1',
          visibilityScope: 'user',
          type: 'task',
          notificationType: 'task_create',
          title: '孩子个人流消息',
          summary: '孩子个人流消息',
          messageEventKey: 'task:create:1',
          createTime: 200,
          syncedToCloud: true
        }),
        new Message({
          id: 'msg_family',
          familyId: 'family_1',
          visibilityScope: 'family',
          type: 'task',
          notificationType: 'task_create',
          title: '家庭流消息',
          summary: '家庭流消息',
          messageEventKey: 'task:create:1',
          createTime: 100,
          syncedToCloud: true
        })
      ]);

      const result = await messageService.getMessagesByScope();

      expect(result.map((message) => message.id)).toEqual(['msg_user', 'msg_family']);
    });
  });

  describe('getUnreadCount - 获取未读消息数量', () => {
    it('应该获取未读消息数量', async () => {
      mockMessageRepository.getUnreadCount.mockResolvedValue(5);

      const result = await messageService.getUnreadCount();

      expect(result).toBe(5);
      expect(mockMessageRepository.getUnreadCount).toHaveBeenCalled();
    });

    it('获取失败时应该返回0', async () => {
      mockMessageRepository.getUnreadCount.mockRejectedValue(new Error('获取失败'));

      const result = await messageService.getUnreadCount();

      expect(result).toBe(0);
    });

    it('没有未读消息时应该返回0', async () => {
      mockMessageRepository.getUnreadCount.mockResolvedValue(0);

      const result = await messageService.getUnreadCount();

      expect(result).toBe(0);
    });

    it('有用户上下文时应改为基于 scope 读取结果计算未读数', async () => {
      mockUserService.getLoginUser.mockReturnValue({
        userId: 'child_1',
        role: 'child',
        familyId: 'family_1'
      });
      mockUserService.getCurrentUser.mockReturnValue({
        id: 'child_1',
        userId: 'child_1',
        role: 'child',
        familyId: 'family_1'
      });
      mockMessageRepository.getMessagesByScope.mockResolvedValue([
        new Message({
          id: 'msg_1',
          userId: 'child_1',
          visibilityScope: 'user',
          type: 'task',
          notificationType: 'task_create',
          title: '未读',
          summary: '未读',
          syncedToCloud: true,
          isRead: false
        }),
        new Message({
          id: 'msg_2',
          userId: 'child_1',
          visibilityScope: 'user',
          type: 'task',
          notificationType: 'task_complete',
          title: '已读',
          summary: '已读',
          syncedToCloud: true,
          isRead: true
        })
      ]);

      const result = await messageService.getUnreadCount();

      expect(result).toBe(1);
      expect(mockMessageRepository.getUnreadCount).not.toHaveBeenCalled();
      expect(mockMessageRepository.getMessagesByScope).toHaveBeenCalled();
    });
  });

  describe('cloud-mode local task handlers', () => {
    it('云端模式下不应创建本地 upcoming 消息', () => {
      const createSpy = jest.spyOn(messageService, '_createTaskMessageWithDomainModel').mockReturnValue(null);
      messageService.enableCloudStorage = true;

      messageService._handleUpcomingTask({
        task: TestDataFactory.createTask({ id: 'task_1', title: '即将开始任务' }),
        timeRemaining: 10
      });

      expect(createSpy).not.toHaveBeenCalled();
    });

    it('云端模式下不应创建本地 penalty 消息', () => {
      const createSpy = jest.spyOn(messageService, '_createPenaltyMessageWithDomainModel').mockReturnValue(null);
      messageService.enableCloudStorage = true;

      messageService._handleTaskPenalty({
        task: TestDataFactory.createTask({ id: 'task_1', title: '必做任务' }),
        penaltyPoints: 5
      });

      expect(createSpy).not.toHaveBeenCalled();
    });

    it('云端模式下不应创建本地 required 消息', () => {
      const createSpy = jest.spyOn(messageService, '_createTaskMessageWithDomainModel').mockReturnValue(null);
      messageService.enableCloudStorage = true;

      messageService._handleTaskMarkedRequired({
        task: TestDataFactory.createTask({ id: 'task_1', title: '必做任务' })
      });

      expect(createSpy).not.toHaveBeenCalled();
    });
  });

  describe('markMessageAsRead - 标记消息为已读', () => {
    it('应该成功标记消息为已读', async () => {
      mockMessageRepository.markAsRead.mockResolvedValue(true);

      const result = await messageService.markMessageAsRead('msg_1');

      expect(result).toBe(true);
      expect(mockMessageRepository.markAsRead).toHaveBeenCalledWith('msg_1');
    });

    it('标记失败时应该返回false', async () => {
      mockMessageRepository.markAsRead.mockResolvedValue(false);

      const result = await messageService.markMessageAsRead('msg_1');

      expect(result).toBe(false);
    });

    it('发生异常时应该返回false', async () => {
      mockMessageRepository.markAsRead.mockRejectedValue(new Error('标记失败'));

      const result = await messageService.markMessageAsRead('msg_1');

      expect(result).toBe(false);
    });
  });

  describe('markAllMessagesAsRead - 标记所有消息为已读', () => {
    it('应该成功标记所有消息为已读', async () => {
      mockMessageRepository.markAllAsRead.mockResolvedValue(10);

      const result = await messageService.markAllMessagesAsRead();

      expect(result).toBe(10);
      expect(mockMessageRepository.markAllAsRead).toHaveBeenCalled();
    });

    it('没有消息时应该返回0', async () => {
      mockMessageRepository.markAllAsRead.mockResolvedValue(0);

      const result = await messageService.markAllMessagesAsRead();

      expect(result).toBe(0);
    });

    it('发生异常时应该返回0', async () => {
      mockMessageRepository.markAllAsRead.mockRejectedValue(new Error('标记失败'));

      const result = await messageService.markAllMessagesAsRead();

      expect(result).toBe(0);
    });
  });

  describe('deleteMessage - 删除消息', () => {
    it('应该成功删除消息', async () => {
      mockMessageRepository.delete.mockResolvedValue(true);

      const result = await messageService.deleteMessage('msg_1');

      expect(result).toBe(true);
      expect(mockMessageRepository.delete).toHaveBeenCalledWith('msg_1');
    });

    it('删除失败时应该返回false', async () => {
      mockMessageRepository.delete.mockResolvedValue(false);

      const result = await messageService.deleteMessage('msg_1');

      expect(result).toBe(false);
    });

    it('发生异常时应该返回false', async () => {
      mockMessageRepository.delete.mockRejectedValue(new Error('删除失败'));

      const result = await messageService.deleteMessage('msg_1');

      expect(result).toBe(false);
    });
  });

  describe('事件处理 - 任务相关', () => {
    it('应该处理任务创建事件', () => {
      const task = TestDataFactory.createTask({
        id: 'task_1',
        title: '新任务'
      });

      mockEventBus.emit(EVENTS.TASK_CREATED, { task });

      expect(mockMessageRepository.addMessage).toHaveBeenCalled();
    });

  });

  describe('事件处理 - 奖励相关', () => {
    it('应该处理奖励创建事件', () => {
      const reward = TestDataFactory.createReward({
        id: 'reward_1',
        name: '新奖励'
      });

      mockEventBus.emit(EVENTS.REWARD_CREATED, { reward });

      expect(mockMessageRepository.addMessage).toHaveBeenCalled();
    });

    it('应该处理奖励领取事件', () => {
      const reward = TestDataFactory.createReward({
        id: 'reward_1',
        name: '已领取的奖励',
        points: 100
      });

      mockEventBus.emit(EVENTS.REWARD_CLAIMED, {
        reward,
        operatorUserId: 'child'
      });

      expect(mockMessageRepository.addMessage).toHaveBeenCalled();
    });

    it('兼容格式奖励领取事件应透传 exchangeUserId 和实际消耗金额', () => {
      mockUserService.getCurrentUserId.mockReturnValue('child_1');
      mockUserService.getUserById.mockImplementation((userId) => ({
        parent_1: { userId: 'parent_1', role: 'parent' },
        child_1: { userId: 'child_1', role: 'child' }
      }[userId] || null));
      mockUserService.getUserByRole.mockImplementation((role) => ({
        parent: { userId: 'parent_1', role: 'parent' },
        child: { userId: 'child_1', role: 'child' }
      }[role] || null));

      mockEventBus.emit(EVENTS.REWARD_CLAIMED, {
        rewardId: 'reward_compat_1',
        rewardName: '动画片',
        originalPoints: 10,
        actualCost: 4,
        userId: 'child_1',
        exchangeUserId: 'child_1',
        operatorUserId: 'parent_1'
      });

      expect(mockMessageRepository.addMessage).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'child_1',
        summary: '家长为您兑换了奖励"动画片"，花费了4颗星星'
      }));
    });

    it('应该处理奖励交付事件', () => {
      const reward = TestDataFactory.createReward({
        id: 'reward_1',
        name: '已交付的奖励'
      });

      mockEventBus.emit(EVENTS.REWARD_DELIVERED, { reward });

      expect(mockMessageRepository.addMessage).toHaveBeenCalled();
    });
  });

  describe('主干流程 - 完整的消息生命周期', () => {
    it('应该完整执行消息创建、读取、标记流程', async () => {
      // 1. 创建系统消息
      const content = '这是测试消息';
      mockMessageRepository.addMessage.mockImplementation(async (msg) => {
        return new Message({ ...msg, id: 'msg_test' });
      });

      const message = await messageService.createSystemMessage(content, 'system');
      expect(message).toBeDefined();

      // 2. 获取所有消息
      mockMessageRepository.getAll.mockResolvedValue([message]);
      const messages = await messageService.getAllMessages();
      expect(messages).toHaveLength(1);

      // 3. 获取未读数量
      mockMessageRepository.getUnreadCount.mockResolvedValue(1);
      const unreadCount = await messageService.getUnreadCount();
      expect(unreadCount).toBe(1);

      // 4. 标记为已读
      mockMessageRepository.markAsRead.mockResolvedValue(true);
      const marked = await messageService.markMessageAsRead('msg_test');
      expect(marked).toBe(true);

      // 5. 再次获取未读数量
      mockMessageRepository.getUnreadCount.mockResolvedValue(0);
      const newUnreadCount = await messageService.getUnreadCount();
      expect(newUnreadCount).toBe(0);
    });

    it('应该完整执行任务消息通知流程', async () => {
      // 1. 创建任务
      const task = TestDataFactory.createTask({
        id: 'task_1',
        title: '测试任务',
        type: 'study'
      });

      // 2. 触发任务创建事件
      mockMessageRepository.addMessage.mockImplementation(async (msg) => {
        return new Message({ ...msg, id: `msg_${Date.now()}` });
      });

      mockEventBus.emit(EVENTS.TASK_CREATED, { task });
      expect(mockMessageRepository.addMessage).toHaveBeenCalled();

      // 3. 任务完成
      mockEventBus.emit(EVENTS.TASK_STATUS_UPDATED, {
        task,
        previousStatus: 'pending',
        operationType: 'complete',
        operatorUserId: 'child'
      });
      expect(mockMessageRepository.addMessage).toHaveBeenCalled();

      // 4. 获取消息
      mockMessageRepository.getAll.mockResolvedValue([mockMessage]);
      const messages = await messageService.getAllMessages();
      expect(messages).toBeDefined();
    });

    it('应该完整执行消息清理流程', async () => {
      // 1. 清理过期消息
      mockMessageRepository.cleanExpiredMessages.mockResolvedValue(2);
      const cleanedCount = await messageService.messageRepository.cleanExpiredMessages(30);
      expect(cleanedCount).toBe(2);
      expect(mockMessageRepository.cleanExpiredMessages).toHaveBeenCalledWith(30);
    });
  });

  describe('边界条件', () => {
    it('应该处理不存在的消息ID', async () => {
      mockMessageRepository.markAsRead.mockResolvedValue(false);

      const result = await messageService.markMessageAsRead('nonexistent');

      expect(result).toBe(false);
    });

    it('应该处理事件数据缺失的情况', () => {
      // 触发没有task数据的事件
      mockEventBus.emit(EVENTS.TASK_CREATED, {});

      // 不应该调用addMessage
      expect(mockMessageRepository.addMessage).not.toHaveBeenCalled();
    });

    it('应该处理无效的通知类型', async () => {
      const task = TestDataFactory.createTask({ id: 'task_1' });

      const result = await messageService.createTaskMessage(
        task,
        'invalid_type'
      );

      // 应该创建消息但使用默认类型
      expect(result).toBeDefined();
    });

    it('应该处理批量操作中的空数组', async () => {
      const result = await messageService.batchMarkMessagesAsRead([]);

      expect(result).toBe(0);
    });
  });

  describe('错误处理', () => {
    it('应该捕获仓储初始化错误', async () => {
      mockMessageRepository.loadFromStorage.mockRejectedValue(new Error('加载失败'));

      const initialized = await messageService.initialize();

      // 应该仍然返回resolved Promise以避免阻止应用启动
      expect(initialized).toBe(true);
    });

    it('应该捕获获取消息列表错误', async () => {
      mockMessageRepository.getAll.mockRejectedValue(new Error('数据库错误'));

      const result = await messageService.getAllMessages();

      // 应该返回空数组而非抛出异常
      expect(result).toEqual([]);
    });

    it('应该捕获获取未读数量错误', async () => {
      mockMessageRepository.getUnreadCount.mockRejectedValue(new Error('数据库错误'));

      const result = await messageService.getUnreadCount();

      // 应该返回0而非抛出异常
      expect(result).toBe(0);
    });

    it('应该捕获标记已读错误', async () => {
      mockMessageRepository.markAsRead.mockRejectedValue(new Error('数据库错误'));

      const result = await messageService.markMessageAsRead('msg_1');

      // 应该返回false而非抛出异常
      expect(result).toBe(false);
    });

    it('应该捕获删除消息错误', async () => {
      mockMessageRepository.delete.mockRejectedValue(new Error('数据库错误'));

      const result = await messageService.deleteMessage('msg_1');

      // 应该返回false而非抛出异常
      expect(result).toBe(false);
    });
  });

  describe('用户角色处理', () => {
    it('家长操作时应该跳过特定消息类型', async () => {
      const task = TestDataFactory.createTask({
        id: 'task_1',
        title: '测试任务'
      });

      mockMessageRepository.addMessage.mockImplementation(async (msg) => msg);

      // 家长完成任务
      mockEventBus.emit(EVENTS.TASK_STATUS_UPDATED, {
        task,
        previousStatus: 'pending',
        operationType: 'complete',
        operatorUserId: 'parent'
      });

      // 应该不创建消息
      expect(mockMessageRepository.addMessage).not.toHaveBeenCalled();
    });

    it('孩子真实用户ID完成任务时，应给真实家长ID创建消息', async () => {
      const task = TestDataFactory.createTask({
        id: 'task_2',
        title: '测试任务',
        userId: 'child_1'
      });

      mockUserService.getUserById.mockImplementation((userId) => ({
        parent_1: { userId: 'parent_1', role: 'parent' },
        child_1: { userId: 'child_1', role: 'child' }
      }[userId] || null));
      mockUserService.getUserByRole.mockImplementation((role) => ({
        parent: { userId: 'parent_1', role: 'parent' },
        child: { userId: 'child_1', role: 'child' }
      }[role] || null));

      const result = await messageService._createTaskMessageWithDomainModel(
        task,
        NotificationType.COMPLETED,
        {
          operatorUserId: 'child_1'
        }
      );

      expect(result).toBeDefined();
      expect(result.userId).toBe('parent_1');
      expect(result.summary).toBe('您的孩子完成了任务"测试任务"');
    });
  });

  describe('消息统计', () => {
    it('应该获取消息统计信息', async () => {
      const stats = {
        total: 100,
        unread: 10,
        today: 5,
        highPriority: 3,
        byType: {
          system: 50,
          task: 30,
          reward: 20
        }
      };

      mockMessageRepository.getMessageStats.mockResolvedValue(stats);

      const result = await messageService.messageRepository.getMessageStats();

      expect(result).toEqual(stats);
    });
  });

  describe('高优先级消息', () => {
    it('应该过滤高优先级未读消息', async () => {
      const messages = [
        TestDataFactory.createMessage({
          id: 'msg_1',
          priority: MessagePriority.HIGH,
          isRead: false
        }),
        TestDataFactory.createMessage({
          id: 'msg_2',
          priority: MessagePriority.LOW,
          isRead: false
        }),
        TestDataFactory.createMessage({
          id: 'msg_3',
          priority: MessagePriority.HIGH,
          isRead: false
        })
      ];

      mockMessageRepository.getUnreadMessages.mockResolvedValue(messages);

      // 创建Message实例以便调用isHighPriority方法
      const messageInstances = messages.map(msg => new Message(msg));
      const highPriorityMessages = messageInstances.filter(msg => msg.isHighPriority());

      expect(highPriorityMessages).toHaveLength(2);
      expect(highPriorityMessages[0].id).toBe('msg_1');
      expect(highPriorityMessages[1].id).toBe('msg_3');
    });

    it('已读消息不应该被过滤', async () => {
      const messages = [
        TestDataFactory.createMessage({
          id: 'msg_1',
          priority: MessagePriority.HIGH,
          isRead: true
        }),
        TestDataFactory.createMessage({
          id: 'msg_2',
          priority: MessagePriority.LOW,
          isRead: false
        })
      ];

      mockMessageRepository.getUnreadMessages.mockResolvedValue(
        messages.filter(msg => !msg.isRead)
      );

      const result = await mockMessageRepository.getUnreadMessages();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('msg_2');
    });
  });

  describe('M10 云端消息语义', () => {
    beforeEach(() => {
      messageService.enableCloudStorage = true;
      mockUserService.getLoginUser.mockReturnValue({
        userId: 'child_1',
        role: 'child',
        familyId: 'family_1'
      });
      mockUserService.getCurrentUser.mockReturnValue({
        id: 'child_1',
        familyId: 'family_1'
      });
    });

    afterEach(() => {
      messageService.enableCloudStorage = false;
    });

    it('云端刷新失败时不应先归档 legacy 消息', async () => {
      HttpClient.get.mockRejectedValue(new Error('cloud failed'));

      await expect(
        messageService.refreshMessagesFromCloud('child_1', { scope: 'user' })
      ).rejects.toThrow('cloud failed');

      expect(mockMessageRepository.archiveLegacyMessages).not.toHaveBeenCalled();
    });

    it('公开 refresh 入口应委托到正式镜像刷新 helper', async () => {
      const refreshSpy = jest.spyOn(messageService, '_refreshFormalMessagesFromCloud').mockResolvedValue([]);
      const syncSpy = jest.spyOn(messageService, 'syncFormalRemindersIfNeeded').mockResolvedValue({ success: true, skipped: false });
      const emitSpy = jest.spyOn(messageService, '_emitMessageChangedEvent').mockResolvedValue();
      const displaySpy = jest.spyOn(messageService, '_getScopedMessagesForDisplay').mockResolvedValue([]);

      await expect(
        messageService.refreshMessagesFromCloud('child_1', { scope: 'user' })
      ).resolves.toEqual([]);

      expect(syncSpy).toHaveBeenCalledWith(expect.objectContaining({
        scope: 'user',
        userId: 'child_1'
      }));
      expect(refreshSpy).toHaveBeenCalledWith(expect.objectContaining({
        scope: 'user',
        userId: 'child_1'
      }));
      expect(displaySpy).toHaveBeenCalledWith(expect.objectContaining({
        scope: 'user',
        userId: 'child_1'
      }));
      expect(emitSpy).toHaveBeenCalled();
    });

    it('云端刷新前应先触发正式提醒 sync，且单路失败不阻塞消息读取', async () => {
      HttpClient.post.mockRejectedValueOnce(new Error('sync failed'));
      HttpClient.get.mockResolvedValueOnce({ messages: [] });

      await expect(
        messageService.refreshMessagesFromCloud('child_1', { scope: 'user' })
      ).resolves.toEqual([]);

      expect(HttpClient.post).toHaveBeenCalledWith(
        '/api/tasks/upcoming/sync',
        expect.objectContaining({
          scope: 'user',
          targetUserId: 'child_1'
        })
      );
      expect(HttpClient.post).toHaveBeenCalledWith(
        '/api/stars/expiring-reminders/sync',
        expect.objectContaining({
          scope: 'user',
          targetUserId: 'child_1'
        })
      );
      expect(HttpClient.get).toHaveBeenCalledWith('/api/messages', {
        scope: 'user',
        userId: 'child_1'
      });
    });

    it('正式提醒 sync 在节流窗口内不应重复触发', async () => {
      HttpClient.post.mockClear();
      HttpClient.get.mockClear();
      HttpClient.post.mockResolvedValue({ success: true });
      HttpClient.get.mockResolvedValue({ messages: [] });

      await messageService.refreshMessagesFromCloud('child_1', { scope: 'user' });
      await messageService.refreshMessagesFromCloud('child_1', { scope: 'user' });

      expect(HttpClient.post).toHaveBeenCalledTimes(2);
      expect(HttpClient.get).toHaveBeenCalledTimes(2);
    });

    it('正式提醒 sync 单路失败后仍应进入节流窗口，避免短时间重复打点', async () => {
      HttpClient.post.mockClear();
      HttpClient.get.mockClear();
      HttpClient.post.mockRejectedValueOnce(new Error('sync failed'));
      HttpClient.get.mockResolvedValue({ messages: [] });

      await messageService.refreshMessagesFromCloud('child_1', { scope: 'user' });
      await messageService.refreshMessagesFromCloud('child_1', { scope: 'user' });

      expect(HttpClient.post).toHaveBeenCalledTimes(2);
      expect(HttpClient.get).toHaveBeenCalledTimes(2);
    });

    it('首页已先做 authority sync 时，正式提醒同步应跳过重复 authority 调用', async () => {
      HttpClient.post.mockClear();
      HttpClient.get.mockClear();
      HttpClient.post.mockResolvedValue({ success: true });
      HttpClient.get.mockResolvedValue({ messages: [] });

      await messageService.refreshMessagesFromCloud('child_1', {
        scope: 'user',
        skipExpiryAuthoritySyncBeforeFormalReminders: true
      });

      expect(mockStarService.syncExpiryAuthorityIfNeeded).not.toHaveBeenCalled();
      expect(HttpClient.post).toHaveBeenCalledWith(
        '/api/tasks/upcoming/sync',
        expect.objectContaining({
          scope: 'user',
          targetUserId: 'child_1'
        })
      );
      expect(HttpClient.post).toHaveBeenCalledWith(
        '/api/stars/expiring-reminders/sync',
        expect.objectContaining({
          scope: 'user',
          targetUserId: 'child_1'
        })
      );
    });

    it('正式提醒同步前应通过注入的 starService 触发 authority sync', async () => {
      await messageService._syncExpiryAuthorityBeforeFormalReminders({
        scope: 'user',
        userId: 'child_1',
        familyId: 'family_1'
      });

      expect(mockStarService.syncExpiryAuthorityIfNeeded).toHaveBeenCalledWith({
        scope: 'user',
        userId: 'child_1',
        familyId: 'family_1'
      });
    });

    it('viewer 刷新正式消息时应跳过提醒生成，只读取现有云消息', async () => {
      HttpClient.post.mockClear();
      HttpClient.get.mockClear();
      mockStarService.syncExpiryAuthorityIfNeeded.mockClear();
      mockUserService.getLoginUser.mockReturnValue({
        userId: 'parent_viewer',
        role: 'parent',
        familyId: 'family_1',
        familyPermissionRole: 'viewer'
      });
      mockUserService.getCurrentUser.mockReturnValue({
        userId: 'child_1',
        role: 'child',
        familyId: 'family_1'
      });
      HttpClient.get.mockResolvedValue({ messages: [] });

      const result = await messageService.refreshMessagesFromCloud('child_1', {
        scope: 'user'
      });

      expect(mockStarService.syncExpiryAuthorityIfNeeded).not.toHaveBeenCalled();
      expect(HttpClient.post).not.toHaveBeenCalled();
      expect(HttpClient.get).toHaveBeenCalledWith('/api/messages', {
        scope: 'user',
        userId: 'child_1'
      });
      expect(result).toEqual([]);
    });

    it('系统只读刷新正式消息时应跳过提醒生成，只读取现有云消息', async () => {
      HttpClient.post.mockClear();
      HttpClient.get.mockClear();
      mockStarService.syncExpiryAuthorityIfNeeded.mockClear();
      mockUserService.getLoginUser.mockReturnValue({
        userId: 'parent_readonly',
        role: 'parent',
        familyId: 'family_1',
        familyPermissionRole: 'manager',
        systemAccessLevel: 'readonly'
      });
      mockUserService.getCurrentUser.mockReturnValue({
        userId: 'child_1',
        role: 'child',
        familyId: 'family_1'
      });
      HttpClient.get.mockResolvedValue({ messages: [] });

      const result = await messageService.refreshMessagesFromCloud('child_1', {
        scope: 'user'
      });

      expect(mockStarService.syncExpiryAuthorityIfNeeded).not.toHaveBeenCalled();
      expect(HttpClient.post).not.toHaveBeenCalled();
      expect(HttpClient.get).toHaveBeenCalledWith('/api/messages', {
        scope: 'user',
        userId: 'child_1'
      });
      expect(result).toEqual([]);
    });

    it('正式云端消息单条已读失败时不应先改本地', async () => {
      const message = new Message({
        id: 'msg_cloud_1',
        userId: 'child_1',
        visibilityScope: 'user',
        type: MessageType.TASK,
        notificationType: 'task_create',
        title: '云端消息',
        summary: '待测试',
        syncedToCloud: true
      });
      mockMessageRepository.getById.mockResolvedValue(message);
      HttpClient.patch.mockRejectedValue(new Error('cloud failed'));

      const result = await messageService.markMessageAsRead('msg_cloud_1', { scope: 'user' });

      expect(result).toBe(false);
      expect(mockMessageRepository.markAsRead).not.toHaveBeenCalled();
    });

    it('正式云端消息批量已读失败时不应改本地', async () => {
      const message = new Message({
        id: 'msg_cloud_2',
        userId: 'child_1',
        visibilityScope: 'user',
        type: MessageType.TASK,
        notificationType: 'task_complete',
        title: '云端消息',
        summary: '待测试',
        syncedToCloud: true,
        isRead: false
      });
      mockMessageRepository.getMessagesByScope.mockResolvedValue([message]);
      HttpClient.patch.mockRejectedValue(new Error('cloud failed'));

      const result = await messageService.markAllMessagesAsRead({ scope: 'user', userId: 'child_1' });

      expect(result).toBe(0);
      expect(mockMessageRepository.batchMarkAsRead).not.toHaveBeenCalled();
    });

    it('正式云端消息删除失败时不应先删本地', async () => {
      const message = new Message({
        id: 'msg_cloud_3',
        userId: 'child_1',
        visibilityScope: 'user',
        type: MessageType.REWARD,
        notificationType: 'reward_exchange',
        title: '云端奖励消息',
        summary: '待测试',
        syncedToCloud: true
      });
      mockMessageRepository.getById.mockResolvedValue(message);
      HttpClient.delete.mockRejectedValue(new Error('cloud failed'));

      const result = await messageService.deleteMessage('msg_cloud_3', { scope: 'user' });

      expect(result).toBe(false);
      expect(mockMessageRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('任务待同步文案视角', () => {
    it('家长给孩子创建任务时，孩子个人待同步消息应显示家长给你安排了任务', async () => {
      mockUserService.getUserById.mockImplementation(userId => ({
        parent_1: { userId: 'parent_1', name: '妈妈', role: 'parent' },
        child_1: { userId: 'child_1', name: '爱上', role: 'child' }
      }[userId] || null));

      const messages = await messageService._createTaskProvisionalMessages(
        { id: 'task_1', title: '数学', userId: 'child_1' },
        {
          action: 'create',
          operatorUserId: 'parent_1',
          operatorRole: 'parent',
          targetUserId: 'child_1',
          familyId: 'family_1',
          operationKey: 'op_1',
          notificationType: 'task_create',
          modifyTime: 1
        }
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            visibilityScope: 'user',
            summary: '妈妈给你安排了任务“数学”，等待同步'
          }),
          expect.objectContaining({
            visibilityScope: 'family',
            summary: '妈妈给爱上创建了任务“数学”，等待同步'
          })
        ])
      );
    });

    it('孩子自己完成任务时，家庭待同步消息应显示孩子完成了任务', async () => {
      mockUserService.getUserById.mockImplementation(userId => ({
        child_1: { userId: 'child_1', name: '爱上', role: 'child' }
      }[userId] || null));

      const messages = await messageService._createTaskProvisionalMessages(
        { id: 'task_2', title: '数学', userId: 'child_1' },
        {
          action: 'complete',
          operatorUserId: 'child_1',
          operatorRole: 'child',
          targetUserId: 'child_1',
          familyId: 'family_1',
          operationKey: 'op_2',
          notificationType: 'task_complete',
          modifyTime: 2
        }
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            visibilityScope: 'family',
            summary: '爱上完成了任务“数学”，等待同步'
          })
        ])
      );
    });
  });

  describe('奖励兼容文案视角', () => {
    it('孩子真实用户ID兑换奖励时，兼容消息应发送给真实家长ID', async () => {
      mockUserService.getCurrentUserId.mockReturnValue('child_1');
      mockUserService.getUserById.mockImplementation((userId) => ({
        parent_1: { userId: 'parent_1', role: 'parent' },
        child_1: { userId: 'child_1', role: 'child' }
      }[userId] || null));
      mockUserService.getUserByRole.mockImplementation((role) => ({
        parent: { userId: 'parent_1', role: 'parent' },
        child: { userId: 'child_1', role: 'child' }
      }[role] || null));

      const result = await messageService._createRewardMessageWithDomainModel(
        {
          id: 'reward_child_1',
          name: '动画片',
          points: 10,
          exchangeUserId: 'child_1'
        },
        'claimed',
        {
          operatorUserId: 'child_1'
        }
      );

      expect(result).toBeDefined();
      expect(result.userId).toBe('parent_1');
      expect(result.summary).toBe('您的孩子兑换了奖励"动画片"，花费了10颗星星');
    });

    it('家长代孩子兑换时，兼容消息应明确为家长代兑且不能被跳过', async () => {
      mockUserService.getCurrentUserId.mockReturnValue('child_1');
      mockUserService.getUserById.mockImplementation((userId) => ({
        parent_1: { userId: 'parent_1', role: 'parent' },
        child_1: { userId: 'child_1', role: 'child' }
      }[userId] || null));
      mockUserService.getUserByRole.mockImplementation((role) => ({
        parent: { userId: 'parent_1', role: 'parent' },
        child: { userId: 'child_1', role: 'child' }
      }[role] || null));

      const result = await messageService._createRewardMessageWithDomainModel(
        {
          id: 'reward_1',
          name: '动画片',
          points: 10,
          exchangeUserId: 'child_1'
        },
        'claimed',
        {
          operatorUserId: 'parent_1'
        }
      );

      expect(result).toBeDefined();
      expect(result.userId).toBe('child_1');
      expect(result.summary).toBe('家长为您兑换了奖励"动画片"，花费了10颗星星');
    });

    it('家长代孩子取消兑换时，兼容消息应明确为家长代取消', async () => {
      mockUserService.getCurrentUserId.mockReturnValue('child_1');

      const result = await messageService._createRewardMessageWithDomainModel(
        {
          id: 'reward_2',
          name: '动画片',
          points: 10,
          exchangeUserId: 'child_1'
        },
        'unclaimed',
        {
          operatorUserId: 'parent_1'
        }
      );

      expect(result).toBeDefined();
      expect(result.summary).toBe('家长取消了您兑换的奖励"动画片"，退回10颗星星');
    });

    it('快过期抵扣时奖励兼容消息应展示实际消耗而不是原价', async () => {
      mockUserService.getCurrentUserId.mockReturnValue('child_1');

      const result = await messageService._createRewardMessageWithDomainModel(
        {
          id: 'reward_4',
          name: '动画片',
          points: 10,
          actualCost: 4,
          exchangeUserId: 'child_1'
        },
        'claimed',
        {
          operatorUserId: 'parent_1',
          actualCost: 4
        }
      );

      expect(result).toBeDefined();
      expect(result.summary).toBe('家长为您兑换了奖励"动画片"，花费了4颗星星');
    });

    it('取消兑换兼容消息应展示实际退款而不是原价', async () => {
      mockUserService.getCurrentUserId.mockReturnValue('child_1');

      const result = await messageService._createRewardMessageWithDomainModel(
        {
          id: 'reward_5',
          name: '动画片',
          points: 10,
          pointsRefunded: 0,
          exchangeUserId: 'child_1'
        },
        'unclaimed',
        {
          operatorUserId: 'parent_1',
          pointsRefunded: 0
        }
      );

      expect(result).toBeDefined();
      expect(result.summary).toBe('家长取消了您兑换的奖励"动画片"，退回0颗星星');
    });

    it('孩子真实用户ID取消兑换时，兼容消息应使用家长视角文案', async () => {
      mockUserService.getCurrentUserId.mockReturnValue('child_1');
      mockUserService.getUserById.mockImplementation((userId) => ({
        parent_1: { userId: 'parent_1', role: 'parent' },
        child_1: { userId: 'child_1', role: 'child' }
      }[userId] || null));
      mockUserService.getUserByRole.mockImplementation((role) => ({
        parent: { userId: 'parent_1', role: 'parent' },
        child: { userId: 'child_1', role: 'child' }
      }[role] || null));

      const result = await messageService._createRewardMessageWithDomainModel(
        {
          id: 'reward_3',
          name: '动画片',
          points: 10,
          exchangeUserId: 'child_1'
        },
        'unclaimed',
        {
          operatorUserId: 'child_1'
        }
      );

      expect(result).toBeDefined();
      expect(result.userId).toBe('parent_1');
      expect(result.summary).toBe('您的孩子取消了兑换奖励"动画片"，退回10颗星星');
    });
  });
});
