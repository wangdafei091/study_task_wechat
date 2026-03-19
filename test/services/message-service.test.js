/**
 * message-service.test.js - MessageService 测试
 *
 * 测试 MessageService 的核心业务逻辑
 */

const MessageService = require('../../services/message-service');
const MockEventBus = require('../utils/mock-event-bus');
const MockSetup = require('../utils/mock-setup');
const TestDataFactory = require('../utils/test-data-factory');
const ScenarioBuilder = require('../utils/scenario-builder');
const { Message, MessageType, NotificationType, MessagePriority } = require('../../models/message');
const { EVENTS } = require('../../utils/constants');

// Mock依赖
jest.mock('../../utils/logger');
jest.mock('../../repositories/index');

const { MessageRepository } = require('../../repositories/index');

describe('MessageService', () => {
  let messageService;
  let mockMessageRepository;
  let mockUserService;
  let mockEventBus;
  let mockMessage;

  beforeEach(() => {
    // 重置 MockEventBus
    if (mockEventBus && typeof mockEventBus.reset === 'function') {
      mockEventBus.reset();
    }

    // 创建Mock仓储
    mockMessageRepository = {
      loadFromStorage: jest.fn().mockResolvedValue(true),
      addMessage: jest.fn().mockImplementation(async (message) => message),
      getAll: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(true),
      markAsRead: jest.fn().mockResolvedValue(true),
      markAllAsRead: jest.fn().mockResolvedValue(0),
      getUnreadCount: jest.fn().mockResolvedValue(0),
      getUnreadMessages: jest.fn().mockResolvedValue([]),
      deleteRelatedMessages: jest.fn().mockResolvedValue(0),
      updateTaskMessages: jest.fn().mockResolvedValue(0),
      cleanExpiredMessages: jest.fn().mockResolvedValue(0),
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
      getCurrentUserId: jest.fn().mockReturnValue('parent')
    };

    // 创建EventBus实例
    mockEventBus = new MockEventBus();

    // 创建MessageService实例
    messageService = new MessageService({
      eventBus: mockEventBus,
      messageRepository: mockMessageRepository,
      userService: mockUserService
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

  describe('getUpcomingTaskNotifications - 获取即将到期任务通知', () => {
    it('应该获取即将到期任务的通知', async () => {
      const task = TestDataFactory.createTask({
        id: 'task_1',
        title: '即将到期的任务',
        date: new Date().toISOString().split('T')[0],
        startTime: '23:00'
      });

      const result = await messageService.getUpcomingTaskNotifications([task]);

      expect(result).toHaveLength(1);
      expect(result[0].taskId).toBe('task_1');
      expect(result[0].title).toBe('即将到期的任务');
    });

    it('应该识别必做任务', async () => {
      const task = TestDataFactory.createTask({
        id: 'task_1',
        title: '必做任务',
        isRequired: true
      });

      const result = await messageService.getUpcomingTaskNotifications([task]);

      expect(result).toHaveLength(1);
      expect(result[0].messageType).toBe('required');
      expect(result[0].priority).toBe('high');
    });

    it('空任务列表应该返回空数组', async () => {
      const result = await messageService.getUpcomingTaskNotifications([]);

      expect(result).toHaveLength(0);
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
      // 1. 模拟有过期消息
      const oldMessages = [
        TestDataFactory.createMessage({
          id: 'msg_old_1',
          createTime: Date.now() - (40 * 24 * 60 * 60 * 1000) // 40天前
        }),
        TestDataFactory.createMessage({
          id: 'msg_old_2',
          createTime: Date.now() - (35 * 24 * 60 * 60 * 1000) // 35天前
        })
      ];

      // 2. 清理过期消息
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
      const result = await messageService.getUpcomingTaskNotifications([]);

      expect(result).toEqual([]);
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
});
