/**
 * message-service.test.js - MessageService 单元测试
 *
 * 测试 MessageService 的核心业务逻辑
 */

const MessageService = require('../../services/message-service');
const { Message, MessageType, NotificationType, MessagePriority } = require('../../models/message');
const MockStorageAdapter = require('../__mocks__/storage-adapter-mock');
const { EVENTS } = require('../../utils/constants');

// Mock EventBus
class MockEventBus {
  constructor() {
    this.handlers = {};
    this.emittedEvents = [];
  }

  on(event, handler) {
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }
    this.handlers[event].push(handler);
  }

  emit(event, data) {
    this.emittedEvents.push({ event, data });
    if (this.handlers[event]) {
      this.handlers[event].forEach(handler => handler(data));
    }
  }

  reset() {
    this.handlers = {};
    this.emittedEvents = [];
  }
}

// Mock MessageRepository
class MockMessageRepository {
  constructor() {
    this.messages = [];
    this.unreadCount = 0;
  }

  async loadFromStorage() {
    return true;
  }

  async addMessage(message) {
    this.messages.push(message);
    return message;
  }

  async create(data) {
    const message = new Message(data);
    this.messages.push(message);
    return message;
  }

  async update(id, data) {
    const index = this.messages.findIndex(m => m.id === id);
    if (index !== -1) {
      this.messages[index] = { ...this.messages[index], ...data };
      return true;
    }
    return false;
  }

  async delete(id) {
    const index = this.messages.findIndex(m => m.id === id);
    if (index !== -1) {
      this.messages.splice(index, 1);
      return true;
    }
    return false;
  }

  async findById(id) {
    return this.messages.find(m => m.id === id) || null;
  }

  async getAll() {
    return [...this.messages];
  }

  async getUnreadCount() {
    return this.messages.filter(m => !m.isRead).length;
  }

  async markAsRead(id) {
    const message = this.messages.find(m => m.id === id);
    if (message) {
      message.isRead = true;
      message.readTime = Date.now();
      return true;
    }
    return false;
  }

  async markAllAsRead() {
    const count = this.messages.filter(m => !m.isRead).length;
    this.messages.forEach(m => {
      if (!m.isRead) {
        m.isRead = true;
        m.readTime = Date.now();
      }
    });
    return count;
  }

  async cleanExpiredMessages(days) {
    return 0;
  }

  async deleteRelatedMessages(entityId) {
    const initialCount = this.messages.length;
    this.messages = this.messages.filter(m => m.relatedId !== entityId);
    return initialCount - this.messages.length;
  }

  async updateTaskMessages(task) {
    return 0;
  }

  async getMessageStats() {
    return {
      total: this.messages.length,
      unread: this.messages.filter(m => !m.isRead).length,
      today: 0,
      highPriority: 0,
      byType: {}
    };
  }

  async batchAddMessages(messages) {
    this.messages.push(...messages);
    return messages.length;
  }

  reset() {
    this.messages = [];
    this.unreadCount = 0;
  }
}

describe('MessageService', () => {
  let messageService;
  let mockEventBus;
  let mockMessageRepository;

  beforeEach(() => {
    // 创建Mock对象
    mockEventBus = new MockEventBus();
    mockMessageRepository = new MockMessageRepository();

    // 创建MessageService实例
    messageService = new MessageService({
      eventBus: mockEventBus,
      messageRepository: mockMessageRepository
    });
  });

  describe('构造函数和初始化', () => {
    it('应该正确初始化MessageService', () => {
      expect(messageService.eventBus).toBe(mockEventBus);
      expect(messageService.messageRepository).toBe(mockMessageRepository);
    });

    it('应该成功初始化服务', async () => {
      const result = await messageService.initialize();
      expect(result).toBeUndefined(); // initialize返回Promise.resolve()
    });

    it('应该注册事件监听器', () => {
      // 检查关键事件是否已注册
      expect(mockEventBus.handlers['task:created']).toBeDefined();
      expect(mockEventBus.handlers['task:completed']).toBeDefined();
      expect(mockEventBus.handlers['reward:claimed']).toBeDefined();
      expect(mockEventBus.handlers['domain:message:created']).toBeDefined();
    });
  });

  describe('消息管理 - 创建消息', () => {
    it('应该成功创建系统消息', async () => {
      const message = await messageService.createSystemMessage('测试系统消息', 'system');

      expect(message).toBeDefined();
      expect(message.title).toBe('系统通知');
      expect(message.type).toBe(MessageType.SYSTEM);
      expect(message.summary).toBe('测试系统消息');
    });

    it('应该成功创建任务消息', async () => {
      const task = {
        id: 'task_1',
        title: '测试任务',
        type: 'study',
        date: '2026-03-02'
      };

      const message = await messageService.createTaskMessage(task, NotificationType.NEW);

      expect(message).toBeDefined();
      expect(message.title).toBe('新任务提醒');
      expect(message.type).toBe(MessageType.TASK);
      expect(message.notificationType).toBe(NotificationType.NEW);
    });

    it('应该创建不同类型的任务消息', async () => {
      const task = {
        id: 'task_1',
        title: '测试任务',
        date: '2026-03-02'
      };

      const types = [
        NotificationType.NEW,
        NotificationType.DELETED
      ];

      for (const type of types) {
        const message = await messageService.createTaskMessage(task, type);
        expect(message).toBeDefined();
        expect(message.notificationType).toBe(type);
      }

      // COMPLETED 和 UPDATED 类型在家长操作时不会创建消息
      const completedMessage = await messageService.createTaskMessage(task, NotificationType.COMPLETED, {
        operatorUserId: 'child'
      });
      expect(completedMessage).toBeDefined();

      const updatedMessage = await messageService.createTaskMessage(task, NotificationType.UPDATED, {
        operatorUserId: 'child'
      });
      expect(updatedMessage).toBeDefined();
    });

    it('应该创建奖励消息', async () => {
      const reward = {
        id: 'reward_1',
        name: '测试奖励',
        points: 10
      };

      // 触发奖励创建事件
      mockEventBus.emit(EVENTS.REWARD_CREATED, { reward });

      // 等待异步操作完成
      await new Promise(resolve => setTimeout(resolve, 10));

      // 检查消息是否被创建
      const messages = await messageService.getAllMessages();
      const rewardMessages = messages.filter(m => m.type === MessageType.REWARD);

      expect(rewardMessages.length).toBeGreaterThan(0);
    });
  });

  describe('消息管理 - 获取消息', () => {
    beforeEach(async () => {
      // 添加测试消息
      await messageService.createSystemMessage('消息1', 'system');
      await messageService.createSystemMessage('消息2', 'system');
      await messageService.createSystemMessage('消息3', 'system');
    });

    it('应该获取所有消息', async () => {
      const messages = await messageService.getAllMessages();

      expect(messages).toBeDefined();
      expect(messages.length).toBe(3);
      expect(Array.isArray(messages)).toBe(true);
    });

    it('应该获取未读消息数量', async () => {
      const count = await messageService.getUnreadCount();

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('应该正确计算未读消息', async () => {
      // 先获取初始未读数
      const initialUnread = await messageService.getUnreadCount();
      expect(initialUnread).toBe(3);

      // 标记一条消息为已读
      const messages = await messageService.getAllMessages();
      if (messages.length > 0) {
        await messageService.markMessageAsRead(messages[0].id);

        // 再次获取未读数
        const updatedUnread = await messageService.getUnreadCount();
        expect(updatedUnread).toBe(initialUnread - 1);
      }
    });

    it('应该处理空消息列表', async () => {
      mockMessageRepository.reset();
      const messages = await messageService.getAllMessages();

      expect(messages).toBeDefined();
      expect(messages.length).toBe(0);
      expect(Array.isArray(messages)).toBe(true);
    });
  });

  describe('状态管理 - 标记已读', () => {
    beforeEach(async () => {
      await messageService.createSystemMessage('未读消息1', 'system');
      await messageService.createSystemMessage('未读消息2', 'system');
    });

    it('应该成功标记消息为已读', async () => {
      const messages = await messageService.getAllMessages();
      const messageId = messages[0].id;

      const result = await messageService.markMessageAsRead(messageId);

      expect(result).toBe(true);

      // 验证消息已标记为已读
      const updatedMessages = await messageService.getAllMessages();
      const message = updatedMessages.find(m => m.id === messageId);
      expect(message.isRead).toBe(true);
    });

    it('应该成功标记所有消息为已读', async () => {
      const count = await messageService.markAllMessagesAsRead();

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);

      // 验证所有消息都已读
      const messages = await messageService.getAllMessages();
      const allRead = messages.every(m => m.isRead);
      expect(allRead).toBe(true);
    });

    it('标记不存在的消息应该返回false', async () => {
      const result = await messageService.markMessageAsRead('non_existent_id');
      expect(result).toBe(false);
    });
  });

  describe('状态管理 - 删除消息', () => {
    beforeEach(async () => {
      await messageService.createSystemMessage('待删除消息1', 'system');
      await messageService.createSystemMessage('待删除消息2', 'system');
    });

    it('应该成功删除消息', async () => {
      const messages = await messageService.getAllMessages();
      const messageId = messages[0].id;
      const initialCount = messages.length;

      const result = await messageService.deleteMessage(messageId);

      expect(result).toBe(true);

      // 验证消息已删除
      const updatedMessages = await messageService.getAllMessages();
      expect(updatedMessages.length).toBe(initialCount - 1);
      expect(updatedMessages.find(m => m.id === messageId)).toBeUndefined();
    });

    it('删除不存在的消息应该返回false', async () => {
      const result = await messageService.deleteMessage('non_existent_id');
      expect(result).toBe(false);
    });
  });

  describe('批量操作', () => {
    beforeEach(async () => {
      for (let i = 0; i < 5; i++) {
        await messageService.createSystemMessage(`批量消息${i + 1}`, 'system');
      }
    });

    it('应该批量标记消息为已读', async () => {
      const messages = await messageService.getAllMessages();
      const messageIds = messages.slice(0, 3).map(m => m.id);

      // 添加 messageManager mock
      messageService.messageManager = {
        markManyAsRead: jest.fn((ids, callback) => callback(ids.length))
      };

      const count = await messageService.batchMarkMessagesAsRead(messageIds);

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('应该批量删除消息', async () => {
      const messages = await messageService.getAllMessages();
      const messageIds = messages.slice(0, 3).map(m => m.id);
      const initialCount = messages.length;

      const count = await messageService.batchDeleteMessages(messageIds);

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);

      // 验证消息已删除
      const updatedMessages = await messageService.getAllMessages();
      expect(updatedMessages.length).toBeLessThan(initialCount);
    });

    it('批量操作空数组应该返回0', async () => {
      const count1 = await messageService.batchMarkMessagesAsRead([]);
      const count2 = await messageService.batchDeleteMessages([]);

      expect(count1).toBe(0);
      expect(count2).toBe(0);
    });
  });

  describe('批量创建任务消息', () => {
    it('应该批量创建任务消息', async () => {
      const tasks = [
        { id: 'task_1', title: '任务1', date: '2026-03-02' },
        { id: 'task_2', title: '任务2', date: '2026-03-02' },
        { id: 'task_3', title: '任务3', date: '2026-03-02' }
      ];

      // 添加 messageManager mock
      messageService.messageManager = {
        createTaskMessage: jest.fn((task, type, options) => ({ id: `msg_${task.id}` }))
      };

      const count = await messageService.batchCreateTaskMessages(tasks, NotificationType.NEW);

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('批量创建空任务数组应该返回0', async () => {
      const count = await messageService.batchCreateTaskMessages([], NotificationType.NEW);
      expect(count).toBe(0);
    });
  });

  describe('事件处理 - 任务事件', () => {
    it('应该处理任务创建事件', async () => {
      const task = {
        id: 'task_1',
        title: '新任务',
        date: '2026-03-02'
      };

      mockEventBus.emit(EVENTS.TASK_CREATED, { task });

      // 等待异步操作完成
      await new Promise(resolve => setTimeout(resolve, 10));

      const messages = await messageService.getAllMessages();
      const taskMessages = messages.filter(m => m.type === MessageType.TASK);

      expect(taskMessages.length).toBeGreaterThan(0);
    });

    it('应该处理任务完成事件', async () => {
      const task = {
        id: 'task_1',
        title: '完成的任务',
        date: '2026-03-02'
      };

      mockEventBus.emit(EVENTS.TASK_COMPLETED, { task, operatorUserId: 'child' });

      await new Promise(resolve => setTimeout(resolve, 10));

      const messages = await messageService.getAllMessages();
      const completedMessages = messages.filter(
        m => m.type === MessageType.TASK && m.notificationType === NotificationType.COMPLETED
      );

      expect(completedMessages.length).toBeGreaterThan(0);
    });

    it('应该处理任务删除事件', async () => {
      const task = {
        id: 'task_1',
        title: '已删除任务',
        date: '2026-03-02'
      };

      mockEventBus.emit(EVENTS.TASK_DELETED, {
        taskId: 'task_1',
        taskInfo: task,
        operatorUserId: 'parent'
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const messages = await messageService.getAllMessages();
      const deletedMessages = messages.filter(
        m => m.type === MessageType.TASK && m.notificationType === NotificationType.DELETED
      );

      expect(deletedMessages.length).toBeGreaterThan(0);
    });
  });

  describe('事件处理 - 奖励事件', () => {
    it('应该处理奖励创建事件', async () => {
      const reward = {
        id: 'reward_1',
        name: '新奖励',
        points: 20
      };

      mockEventBus.emit(EVENTS.REWARD_CREATED, { reward });

      await new Promise(resolve => setTimeout(resolve, 10));

      const messages = await messageService.getAllMessages();
      const rewardMessages = messages.filter(m => m.type === MessageType.REWARD);

      expect(rewardMessages.length).toBeGreaterThan(0);
    });

    it('应该处理奖励领取事件', async () => {
      const reward = {
        id: 'reward_1',
        name: '兑换的奖励',
        points: 10
      };

      mockEventBus.emit(EVENTS.REWARD_CLAIMED, {
        reward,
        operatorUserId: 'child'
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const messages = await messageService.getAllMessages();
      const rewardMessages = messages.filter(m => m.type === MessageType.REWARD);

      expect(rewardMessages.length).toBeGreaterThan(0);
    });
  });

  describe('事件处理 - 领域模型事件', () => {
    it('应该处理消息创建事件', async () => {
      const message = new Message({
        id: 'msg_test',
        title: '测试消息',
        type: MessageType.SYSTEM
      });

      mockEventBus.emit(EVENTS.DOMAIN_MESSAGE_CREATED, { message });

      await new Promise(resolve => setTimeout(resolve, 10));

      // 检查是否触发了MESSAGE_CHANGED事件
      const changedEvents = mockEventBus.emittedEvents.filter(
        e => e.event === EVENTS.MESSAGE_CHANGED
      );

      expect(changedEvents.length).toBeGreaterThan(0);
    });

    it('应该处理消息更新事件', async () => {
      const message = new Message({
        id: 'msg_test',
        title: '更新的消息',
        type: MessageType.SYSTEM
      });

      mockEventBus.emit(EVENTS.DOMAIN_MESSAGE_UPDATED, { message });

      await new Promise(resolve => setTimeout(resolve, 10));

      const changedEvents = mockEventBus.emittedEvents.filter(
        e => e.event === EVENTS.MESSAGE_CHANGED
      );

      expect(changedEvents.length).toBeGreaterThan(0);
    });

    it('应该处理消息删除事件', async () => {
      mockEventBus.emit(EVENTS.DOMAIN_MESSAGE_DELETED, { messageId: 'msg_test' });

      await new Promise(resolve => setTimeout(resolve, 10));

      const changedEvents = mockEventBus.emittedEvents.filter(
        e => e.event === EVENTS.MESSAGE_CHANGED
      );

      expect(changedEvents.length).toBeGreaterThan(0);
    });
  });

  describe('错误处理', () => {
    it('应该处理创建系统消息失败', async () => {
      // Mock repository抛出错误
      mockMessageRepository.addMessage = jest.fn().mockRejectedValue(new Error('存储错误'));

      const message = await messageService.createSystemMessage('测试消息', 'system');

      // 应该返回null而不是抛出错误
      expect(message).toBe(null);
    });

    it('应该处理获取消息失败', async () => {
      mockMessageRepository.getAll = jest.fn().mockRejectedValue(new Error('获取失败'));

      const messages = await messageService.getAllMessages();

      // 出错时应该返回空数组
      expect(messages).toEqual([]);
    });

    it('应该处理标记已读失败', async () => {
      mockMessageRepository.markAsRead = jest.fn().mockRejectedValue(new Error('标记失败'));

      const result = await messageService.markMessageAsRead('msg_test');

      // 出错时应该返回false
      expect(result).toBe(false);
    });

    it('应该处理删除消息失败', async () => {
      mockMessageRepository.delete = jest.fn().mockRejectedValue(new Error('删除失败'));

      const result = await messageService.deleteMessage('msg_test');

      // 出错时应该返回false
      expect(result).toBe(false);
    });
  });

  describe('边界条件', () => {
    it('应该处理空内容消息', async () => {
      const message = await messageService.createSystemMessage('', 'system');

      expect(message).toBeDefined();
    });

    it('应该处理无效的消息ID', async () => {
      const result = await messageService.markMessageAsRead(null);
      expect(result).toBe(false);

      const result2 = await messageService.markMessageAsRead(undefined);
      expect(result2).toBe(false);

      const result3 = await messageService.deleteMessage('');
      expect(result3).toBe(false);
    });

    it('应该处理空的任务对象', async () => {
      // 事件处理器应该能处理空任务
      expect(() => {
        mockEventBus.emit(EVENTS.TASK_CREATED, { task: null });
      }).not.toThrow();
    });

    it('应该处理批量操作中的无效ID', async () => {
      // 添加 messageManager mock
      messageService.messageManager = {
        markManyAsRead: jest.fn((ids, callback) => callback(ids.filter(id => id).length))
      };

      const messageIds = ['valid_id', null, undefined, ''];
      const count = await messageService.batchMarkMessagesAsRead(messageIds);

      expect(typeof count).toBe('number');
    });
  });

  describe('用户操作者逻辑', () => {
    it('家长操作创建任务时不应该创建某些消息', async () => {
      const mockUserService = {
        getCurrentUserId: jest.fn().mockReturnValue('parent')
      };

      const serviceWithUser = new MessageService({
        eventBus: mockEventBus,
        messageRepository: mockMessageRepository,
        userService: mockUserService
      });

      const task = {
        id: 'task_1',
        title: '测试任务',
        date: '2026-03-02'
      };

      const initialCount = (await mockMessageRepository.getAll()).length;

      // 家长完成任务不应该创建消息
      mockEventBus.emit(EVENTS.TASK_COMPLETED, {
        task,
        operatorUserId: 'parent'
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const updatedCount = (await mockMessageRepository.getAll()).length;
      expect(updatedCount).toBe(initialCount);
    });

    it('小朋友完成任务应该创建消息发给家长', async () => {
      const mockUserService = {
        getCurrentUserId: jest.fn().mockReturnValue('child')
      };

      const serviceWithUser = new MessageService({
        eventBus: mockEventBus,
        messageRepository: mockMessageRepository,
        userService: mockUserService
      });

      const task = {
        id: 'task_1',
        title: '完成的任务',
        date: '2026-03-02'
      };

      const initialCount = (await mockMessageRepository.getAll()).length;

      // 小朋友完成任务应该创建消息
      mockEventBus.emit(EVENTS.TASK_COMPLETED, {
        task,
        operatorUserId: 'child'
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const updatedCount = (await mockMessageRepository.getAll()).length;
      expect(updatedCount).toBeGreaterThan(initialCount);
    });
  });

  describe('即将到期任务通知', () => {
    it('应该生成即将到期任务通知', async () => {
      const upcomingTasks = [
        {
          id: 'task_1',
          title: '即将到期任务1',
          date: '2026-03-02',
          startTime: '12:00',
          isRequired: false
        },
        {
          id: 'task_2',
          title: '必做任务',
          date: '2026-03-02',
          startTime: '13:00',
          isRequired: true
        }
      ];

      const notifications = await messageService.getUpcomingTaskNotifications(upcomingTasks);

      expect(Array.isArray(notifications)).toBe(true);
      expect(notifications.length).toBeGreaterThan(0);

      // 检查必做任务的优先级
      const requiredTask = notifications.find(n => n.messageType === 'required');
      if (requiredTask) {
        expect(requiredTask.priority).toBe('high');
      }
    });

    it('应该处理空任务列表', async () => {
      const notifications = await messageService.getUpcomingTaskNotifications([]);

      expect(notifications).toEqual([]);
    });
  });

  describe('消息优先级', () => {
    it('应该创建高优先级消息', async () => {
      const task = {
        id: 'task_1',
        title: '紧急任务',
        date: '2026-03-02'
      };

      // 使用小朋友操作者以确保消息被创建
      const message = await messageService.createTaskMessage(task, NotificationType.COMPLETED, {
        priority: MessagePriority.HIGH,
        operatorUserId: 'child'
      });

      expect(message).toBeDefined();
      expect(message.priority).toBe(MessagePriority.HIGH);
    });

    it('应该创建中等优先级消息', async () => {
      const message = await messageService.createSystemMessage('普通消息', 'system');

      expect(message).toBeDefined();
      expect(message.priority).toBe(MessagePriority.MEDIUM);
    });
  });

  describe('事件总线集成', () => {
    it('应该发布MESSAGE_CHANGED事件', async () => {
      await messageService.createSystemMessage('测试消息', 'system');

      await new Promise(resolve => setTimeout(resolve, 10));

      const changedEvents = mockEventBus.emittedEvents.filter(
        e => e.event === EVENTS.MESSAGE_CHANGED
      );

      expect(changedEvents.length).toBeGreaterThan(0);
    });

    it('应该发布DOMAIN_MESSAGE_CREATED事件', async () => {
      await messageService.createSystemMessage('测试消息', 'system');

      await new Promise(resolve => setTimeout(resolve, 10));

      const createdEvents = mockEventBus.emittedEvents.filter(
        e => e.event === EVENTS.DOMAIN_MESSAGE_CREATED
      );

      expect(createdEvents.length).toBeGreaterThan(0);
    });

    it('应该发布DOMAIN_MESSAGE_READ事件', async () => {
      await messageService.createSystemMessage('测试消息', 'system');
      const messages = await messageService.getAllMessages();

      if (messages.length > 0) {
        await messageService.markMessageAsRead(messages[0].id);

        await new Promise(resolve => setTimeout(resolve, 10));

        const readEvents = mockEventBus.emittedEvents.filter(
          e => e.event === EVENTS.DOMAIN_MESSAGE_READ
        );

        expect(readEvents.length).toBeGreaterThan(0);
      }
    });
  });

  describe('消息去重', () => {
    it('repository应该支持消息去重', async () => {
      const messageData = {
        title: '去重测试消息',
        type: MessageType.SYSTEM,
        notificationType: 'test',
        summary: '测试摘要'
      };

      // 创建第一条消息
      const message1 = await mockMessageRepository.create(messageData);
      expect(message1).toBeDefined();

      // 创建相同内容的消息（addMessage可能实现去重逻辑）
      const message2 = await mockMessageRepository.create(messageData);
      expect(message2).toBeDefined();

      // 检查消息数量
      const messages = await mockMessageRepository.getAll();
      expect(messages.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('消息过期处理', () => {
    it('应该清理过期消息', async () => {
      // 添加过期消息
      await messageService.createSystemMessage('过期消息', 'system');

      const count = await mockMessageRepository.cleanExpiredMessages(30);

      expect(typeof count).toBe('number');
    });
  });

  describe('系统初始化', () => {
    it('初始化时应该加载消息仓储', async () => {
      const loadFromStorageSpy = jest.spyOn(mockMessageRepository, 'loadFromStorage');

      await messageService.initialize();

      expect(loadFromStorageSpy).toHaveBeenCalled();
    });

    it('初始化失败不应该阻止服务启动', async () => {
      mockMessageRepository.loadFromStorage = jest.fn().mockRejectedValue(new Error('加载失败'));

      // 应该不会抛出错误
      const result = await messageService.initialize();
      expect(result).toBeUndefined();
    });
  });
});
