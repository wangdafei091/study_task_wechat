/**
 * message-repository.test.js - Message Repository 测试
 *
 * 测试 Message Repository 的数据访问和业务逻辑
 */

const MessageRepository = require('../../repositories/message-repository');
const { Message, MessageType, NotificationType, MessagePriority } = require('../../models/message');
const TestDataFactory = require('../utils/test-data-factory');

describe('Message Repository', () => {
  let repository;
  let mockStorageAdapter;

  // 辅助函数：创建 Message 实例
  const createMessage = (data) => new Message(data);

  beforeEach(() => {
    jest.clearAllMocks();

    // 创建 Mock StorageAdapter
    mockStorageAdapter = {
      getAsync: jest.fn().mockResolvedValue([]),
      setAsync: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue(),
      clear: jest.fn().mockResolvedValue()
    };

    // 创建 Repository 实例，禁用缓存以简化测试
    repository = new MessageRepository(mockStorageAdapter, { useCache: false });
  });

  // ====== 初始化 ======
  describe('初始化', () => {
    it('应该正确初始化仓储', () => {
      expect(repository).toBeInstanceOf(MessageRepository);
    });

    it('应该设置默认的存储键', () => {
      expect(repository.storageKey).toBe('messageData');
    });
  });

  // ====== 消息 CRUD 操作 ======
  describe('addMessage', () => {
    it('应该成功添加新消息', async () => {
      const message = new Message({
        type: MessageType.NOTIFICATION,
        title: '测试消息',
        content: '这是一条测试消息'
      });

      mockStorageAdapter.getAsync.mockResolvedValue([]);
      mockStorageAdapter.setAsync.mockResolvedValue({});

      const result = await repository.addMessage(message);

      expect(result).not.toBeNull();
      expect(result.title).toBe('测试消息');
      expect(mockStorageAdapter.setAsync).toHaveBeenCalled();
    });

    it('应该验证消息数据，无效消息返回 null', async () => {
      const invalidMessage = new Message({
        type: '',
        title: '',
        content: ''
      });

      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const result = await repository.addMessage(invalidMessage);

      expect(result).toBeNull();
      expect(mockStorageAdapter.setAsync).not.toHaveBeenCalled();
    });

    it('应该处理空消息参数', async () => {
      const result = await repository.addMessage(null);

      expect(result).toBeNull();
    });
  });

  describe('markAsRead', () => {
    it('应该成功标记消息为已读', async () => {
      const message = createMessage({
        id: 'msg_1',
        isRead: false
      });

      mockStorageAdapter.getAsync.mockResolvedValue([message]);
      mockStorageAdapter.setAsync.mockResolvedValue({});

      const result = await repository.markAsRead('msg_1');

      expect(result).not.toBeNull();
      expect(result.isRead).toBe(true);
      expect(result.readTime).toBeGreaterThan(0);
    });

    it('处理已读消息时不重复标记', async () => {
      const readTime = Date.now();
      const message = createMessage({
        id: 'msg_1',
        isRead: true,
        readTime: readTime
      });

      mockStorageAdapter.getAsync.mockResolvedValue([message]);

      const result = await repository.markAsRead('msg_1');

      expect(result).not.toBeNull();
      expect(result.isRead).toBe(true);
      expect(result.readTime).toBe(readTime);
    });

    it('处理不存在的消息ID', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const result = await repository.markAsRead('msg_nonexistent');

      expect(result).toBeNull();
    });

    it('处理空消息ID', async () => {
      const result = await repository.markAsRead('');

      expect(result).toBeNull();
    });
  });

  // ====== 消息状态管理 ======
  describe('getUnreadMessages', () => {
    it('应该返回所有未读消息', async () => {
      const mockMessages = [
        createMessage({ id: 'msg_1', isRead: false }),
        createMessage({ id: 'msg_2', isRead: true }),
        createMessage({ id: 'msg_3', isRead: false })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);

      const unreadMessages = await repository.getUnreadMessages();

      expect(unreadMessages.length).toBe(2);
      expect(unreadMessages.every(msg => !msg.isRead)).toBe(true);
    });

    it('应该根据用户ID过滤未读消息', async () => {
      const userId = 'user_123';
      const mockMessages = [
        createMessage({ id: 'msg_1', userId: 'user_456', isRead: false }),
        createMessage({ id: 'msg_2', userId: userId, isRead: false }),
        createMessage({ id: 'msg_3', userId: userId, isRead: false })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);

      const unreadMessages = await repository.getUnreadMessages(userId);

      expect(unreadMessages.length).toBe(2);
      expect(unreadMessages.every(msg => msg.userId === userId)).toBe(true);
    });

    it('应该处理空消息列表', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const unreadMessages = await repository.getUnreadMessages();

      expect(unreadMessages).toEqual([]);
    });
  });

  describe('getUnreadCount', () => {
    it('应该返回正确的未读消息数量', async () => {
      const mockMessages = [
        createMessage({ id: 'msg_1', isRead: false }),
        createMessage({ id: 'msg_2', isRead: true }),
        createMessage({ id: 'msg_3', isRead: false }),
        createMessage({ id: 'msg_4', isRead: false })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);

      const count = await repository.getUnreadCount();

      expect(count).toBe(3);
    });

    it('应该根据用户ID统计未读消息数量', async () => {
      const userId = 'user_123';
      const mockMessages = [
        createMessage({ id: 'msg_1', userId: 'user_456', isRead: false }),
        createMessage({ id: 'msg_2', userId: userId, isRead: false }),
        createMessage({ id: 'msg_3', userId: userId, isRead: true })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);

      const count = await repository.getUnreadCount(userId);

      expect(count).toBe(1);
    });
  });

  describe('markAllAsRead', () => {
    it('应该标记所有消息为已读', async () => {
      const mockMessages = [
        createMessage({ id: 'msg_1', isRead: false }),
        createMessage({ id: 'msg_2', isRead: false }),
        createMessage({ id: 'msg_3', isRead: false })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);
      mockStorageAdapter.setAsync.mockResolvedValue({});

      const count = await repository.markAllAsRead();

      expect(count).toBe(3);
      expect(mockStorageAdapter.setAsync).toHaveBeenCalled();
    });

    it('应该根据用户ID标记消息为已读', async () => {
      const userId = 'user_123';
      const mockMessages = [
        createMessage({ id: 'msg_1', userId: 'user_456', isRead: false }),
        createMessage({ id: 'msg_2', userId: userId, isRead: false }),
        createMessage({ id: 'msg_3', userId: userId, isRead: false })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);
      mockStorageAdapter.setAsync.mockResolvedValue({});

      const count = await repository.markAllAsRead(userId);

      expect(count).toBe(2);
    });

    it('处理没有未读消息的情况', async () => {
      const mockMessages = [
        createMessage({ id: 'msg_1', isRead: true }),
        createMessage({ id: 'msg_2', isRead: true })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);

      const count = await repository.markAllAsRead();

      expect(count).toBe(0);
    });
  });

  describe('markManyAsRead', () => {
    it('应该批量标记指定消息为已读', async () => {
      const mockMessages = [
        createMessage({ id: 'msg_1', isRead: false }),
        createMessage({ id: 'msg_2', isRead: false }),
        createMessage({ id: 'msg_3', isRead: true })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);
      mockStorageAdapter.setAsync.mockResolvedValue({});

      const count = await repository.markManyAsRead(['msg_1', 'msg_2', 'msg_3']);

      expect(count).toBe(2);
    });

    it('处理空的消息ID数组', async () => {
      const count = await repository.markManyAsRead([]);

      expect(count).toBe(0);
    });

    it('处理无效的消息ID', async () => {
      const mockMessages = [
        createMessage({ id: 'msg_1', isRead: false })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);
      mockStorageAdapter.setAsync.mockResolvedValue({});

      const count = await repository.markManyAsRead(['msg_1', 'msg_invalid']);

      expect(count).toBe(1);
    });
  });

  // ====== 消息过滤 ======
  describe('getMessagesByType', () => {
    it('应该根据类型返回消息', async () => {
      const mockMessages = [
        createMessage({ id: 'msg_1', type: MessageType.NOTIFICATION }),
        createMessage({ id: 'msg_2', type: MessageType.SYSTEM }),
        createMessage({ id: 'msg_3', type: MessageType.NOTIFICATION })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);

      const messages = await repository.getMessagesByType(MessageType.NOTIFICATION);

      expect(messages.length).toBe(2);
      expect(messages.every(msg => msg.type === MessageType.NOTIFICATION)).toBe(true);
    });

    it('应该根据用户ID和类型过滤消息', async () => {
      const userId = 'user_123';
      const mockMessages = [
        createMessage({ id: 'msg_1', userId: 'user_456', type: MessageType.NOTIFICATION }),
        createMessage({ id: 'msg_2', userId: userId, type: MessageType.NOTIFICATION }),
        createMessage({ id: 'msg_3', userId: userId, type: MessageType.SYSTEM })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);

      const messages = await repository.getMessagesByType(MessageType.NOTIFICATION, userId);

      expect(messages.length).toBe(1);
      expect(messages[0].userId).toBe(userId);
    });

    it('处理空类型参数', async () => {
      const messages = await repository.getMessagesByType('');

      expect(messages).toEqual([]);
    });
  });

  describe('getMessagesByNotificationType', () => {
    it('应该根据通知类型返回消息', async () => {
      const mockMessages = [
        createMessage({
          id: 'msg_1',
          type: MessageType.NOTIFICATION,
          notificationType: NotificationType.SUCCESS
        }),
        createMessage({
          id: 'msg_2',
          type: MessageType.NOTIFICATION,
          notificationType: NotificationType.WARNING
        }),
        createMessage({
          id: 'msg_3',
          type: MessageType.NOTIFICATION,
          notificationType: NotificationType.SUCCESS
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);

      const messages = await repository.getMessagesByNotificationType(NotificationType.SUCCESS);

      expect(messages.length).toBe(2);
      expect(messages.every(msg => msg.notificationType === NotificationType.SUCCESS)).toBe(true);
    });
  });

  describe('getMessagesByPriority', () => {
    it('应该根据优先级返回消息', async () => {
      const mockMessages = [
        createMessage({ id: 'msg_1', priority: MessagePriority.LOW }),
        createMessage({ id: 'msg_2', priority: MessagePriority.HIGH }),
        createMessage({ id: 'msg_3', priority: MessagePriority.HIGH })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);

      const messages = await repository.getMessagesByPriority(MessagePriority.HIGH);

      expect(messages.length).toBe(2);
      expect(messages.every(msg => msg.priority === MessagePriority.HIGH)).toBe(true);
    });

    it('应该返回高优先级消息', async () => {
      const mockMessages = [
        createMessage({ id: 'msg_1', priority: MessagePriority.HIGH, isRead: false }),
        createMessage({ id: 'msg_2', priority: MessagePriority.LOW, isRead: false }),
        createMessage({ id: 'msg_3', priority: MessagePriority.HIGH, isRead: false })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);

      const messages = await repository.getHighPriorityMessages();

      expect(messages.length).toBe(2);
    });
  });

  describe('getRelatedMessages', () => {
    it('应该返回与指定实体相关的消息', async () => {
      const taskId = 'task_123';
      const mockMessages = [
        createMessage({ id: 'msg_1', relatedId: taskId, relatedType: 'task' }),
        createMessage({ id: 'msg_2', relatedId: 'task_456', relatedType: 'task' }),
        createMessage({ id: 'msg_3', relatedId: taskId, relatedType: 'task' })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);

      const messages = await repository.getRelatedMessages(taskId);

      expect(messages.length).toBe(2);
      expect(messages.every(msg => msg.relatedId === taskId)).toBe(true);
    });

    it('应该根据用户ID过滤相关消息', async () => {
      const taskId = 'task_123';
      const userId = 'user_123';
      const mockMessages = [
        createMessage({
          id: 'msg_1',
          relatedId: taskId,
          relatedType: 'task',
          userId: 'user_456'
        }),
        createMessage({
          id: 'msg_2',
          relatedId: taskId,
          relatedType: 'task',
          userId: userId
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);

      const messages = await repository.getRelatedMessages(taskId, userId);

      expect(messages.length).toBe(1);
      expect(messages[0].userId).toBe(userId);
    });

    it('处理空实体ID', async () => {
      const messages = await repository.getRelatedMessages('');

      expect(messages).toEqual([]);
    });
  });

  describe('getMessagesByTimeRange', () => {
    it('应该返回指定时间范围内的消息', async () => {
      const now = Date.now();
      const startTime = now - 3600000; // 1小时前
      const endTime = now + 3600000; // 1小时后

      const mockMessages = [
        createMessage({ id: 'msg_1', createTime: now - 7200000 }), // 2小时前
        createMessage({ id: 'msg_2', createTime: now }), // 现在
        createMessage({ id: 'msg_3', createTime: now + 1800000 }) // 30分钟后
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);

      const messages = await repository.getMessagesByTimeRange(startTime, endTime);

      expect(messages.length).toBe(2);
      expect(messages.every(msg => msg.createTime >= startTime && msg.createTime <= endTime)).toBe(true);
    });
  });

  describe('getTodayMessages', () => {
    it('应该返回今天的消息', async () => {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

      const mockMessages = [
        createMessage({ id: 'msg_1', createTime: startOfDay - 3600000 }), // 昨天
        createMessage({ id: 'msg_2', createTime: startOfDay + 3600000 }), // 今天
        createMessage({ id: 'msg_3', createTime: startOfDay + 7200000 }) // 今天
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);

      const messages = await repository.getTodayMessages();

      expect(messages.length).toBe(2);
    });
  });

  describe('getMessagesByDateGroup', () => {
    it('应该按日期分组返回消息', async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const mockMessages = [
        createMessage({ id: 'msg_1', createTime: yesterday.getTime() }),
        createMessage({ id: 'msg_2', createTime: today.getTime() }),
        createMessage({ id: 'msg_3', createTime: today.getTime() })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);

      const grouped = await repository.getMessagesByDateGroup(7);

      expect(typeof grouped).toBe('object');
      expect(Object.keys(grouped).length).toBe(7);
    });

    it('应该根据用户ID过滤分组的消息', async () => {
      const userId = 'user_123';
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

      const mockMessages = [
        createMessage({
          id: 'msg_1',
          userId: 'user_456',
          createTime: startOfDay + 3600000
        }),
        createMessage({
          id: 'msg_2',
          userId: userId,
          createTime: startOfDay + 7200000
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);

      const grouped = await repository.getMessagesByDateGroup(7, userId);

      let totalCount = 0;
      for (const date in grouped) {
        totalCount += grouped[date].length;
        if (grouped[date].length > 0) {
          expect(grouped[date][0].userId).toBe(userId);
        }
      }
      expect(totalCount).toBe(1);
    });
  });

  // ====== 消息删除 ======
  describe('deleteRelatedMessages', () => {
    it('应该删除与指定实体相关的消息', async () => {
      const taskId = 'task_123';
      const mockMessages = [
        createMessage({ id: 'msg_1', relatedId: taskId, relatedType: 'task' }),
        createMessage({ id: 'msg_2', relatedId: 'task_456', relatedType: 'task' }),
        createMessage({ id: 'msg_3', relatedId: taskId, relatedType: 'task' })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);
      mockStorageAdapter.remove.mockResolvedValue();

      const count = await repository.deleteRelatedMessages(taskId);

      expect(count).toBe(2);
    });

    it('处理空实体ID', async () => {
      const count = await repository.deleteRelatedMessages('');

      expect(count).toBe(0);
    });
  });

  // ====== 消息清理 ======
  describe('cleanExpiredMessages', () => {
    it('应该清理过期消息', async () => {
      const now = Date.now();
      const mockMessages = [
        createMessage({
          id: 'msg_1',
          createTime: now - 31 * 24 * 60 * 60 * 1000 // 31天前
        }),
        createMessage({
          id: 'msg_2',
          createTime: now - 15 * 24 * 60 * 60 * 1000 // 15天前
        }),
        createMessage({
          id: 'msg_3',
          createTime: now - 29 * 24 * 60 * 60 * 1000 // 29天前
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);
      mockStorageAdapter.remove.mockResolvedValue();

      const count = await repository.cleanExpiredMessages(30);

      expect(count).toBe(1);
    });

    it('处理没有过期消息的情况', async () => {
      const now = Date.now();
      const mockMessages = [
        createMessage({
          id: 'msg_1',
          createTime: now - 1 * 24 * 60 * 60 * 1000 // 1天前
        }),
        createMessage({
          id: 'msg_2',
          createTime: now - 7 * 24 * 60 * 60 * 1000 // 7天前
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);

      const count = await repository.cleanExpiredMessages(30);

      expect(count).toBe(0);
    });
  });

  // ====== 批量操作 ======
  describe('batchAddMessages', () => {
    it('应该处理空的消息数组', async () => {
      const count = await repository.batchAddMessages([]);

      expect(count).toBe(0);
    });
  });

  // ====== 消息更新 ======
  describe('updateTaskMessages', () => {
    it('应该更新任务相关消息的标题', async () => {
      const taskId = 'task_123';
      const task = TestDataFactory.createTask({
        id: taskId,
        title: '新任务标题'
      });

      const mockMessages = [
        createMessage({
          id: 'msg_1',
          relatedId: taskId,
          summary: '任务"旧标题"已完成'
        }),
        createMessage({
          id: 'msg_2',
          relatedId: 'task_456',
          summary: '任务"另一个标题"已完成'
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);
      mockStorageAdapter.setAsync.mockResolvedValue({});

      const count = await repository.updateTaskMessages(task);

      expect(count).toBe(1);
      expect(mockStorageAdapter.setAsync).toHaveBeenCalled();
    });

    it('处理无效的任务参数', async () => {
      const count = await repository.updateTaskMessages(null);

      expect(count).toBe(0);
    });

    it('处理没有相关消息的任务', async () => {
      const task = TestDataFactory.createTask({
        id: 'task_123',
        title: '新任务标题'
      });

      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const count = await repository.updateTaskMessages(task);

      expect(count).toBe(0);
    });
  });

  // ====== 统计信息 ======
  describe('getMessageStats', () => {
    it('应该返回正确的消息统计信息', async () => {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

      const mockMessages = [
        createMessage({
          id: 'msg_1',
          type: MessageType.NOTIFICATION,
          isRead: false,
          priority: MessagePriority.HIGH,
          createTime: startOfDay + 3600000
        }),
        createMessage({
          id: 'msg_2',
          type: MessageType.SYSTEM,
          isRead: true,
          priority: MessagePriority.LOW,
          createTime: startOfDay - 3600000
        }),
        createMessage({
          id: 'msg_3',
          type: MessageType.NOTIFICATION,
          isRead: false,
          priority: MessagePriority.HIGH,
          createTime: startOfDay + 7200000
        })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);

      const stats = await repository.getMessageStats();

      expect(stats.total).toBe(3);
      expect(stats.unread).toBe(2);
      expect(stats.today).toBe(2);
      expect(stats.highPriority).toBe(2);
      expect(stats.byType[MessageType.NOTIFICATION]).toBe(2);
      expect(stats.byType[MessageType.SYSTEM]).toBe(1);
    });

    it('处理空消息列表', async () => {
      mockStorageAdapter.getAsync.mockResolvedValue([]);

      const stats = await repository.getMessageStats();

      expect(stats.total).toBe(0);
      expect(stats.unread).toBe(0);
      expect(stats.today).toBe(0);
      expect(stats.highPriority).toBe(0);
      expect(Object.keys(stats.byType).length).toBeGreaterThan(0);
    });
  });

  // ====== 边界条件和错误处理 ======
  describe('边界条件和错误处理', () => {
    it('应该处理存储错误', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('存储错误'));

      const messages = await repository.getUnreadMessages();

      expect(messages).toEqual([]);
    });

    it('应该处理标记已读时的存储错误', async () => {
      const message = createMessage({ id: 'msg_1', isRead: false });
      // 模拟 getById 抛出错误
      repository.getById = jest.fn().mockRejectedValue(new Error('读取错误'));

      const result = await repository.markAsRead('msg_1');

      expect(result).toBeNull();
    });

    it('应该处理批量标记时的存储错误', async () => {
      const mockMessages = [
        createMessage({ id: 'msg_1', isRead: false }),
        createMessage({ id: 'msg_2', isRead: false })
      ];

      mockStorageAdapter.getAsync.mockResolvedValue(mockMessages);
      // 模拟 saveAll 抛出错误
      repository.saveAll = jest.fn().mockRejectedValue(new Error('保存错误'));

      const count = await repository.markAllAsRead();

      expect(count).toBe(0);
    });

    it('应该处理清理过期消息时的错误', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('读取错误'));

      const count = await repository.cleanExpiredMessages();

      expect(count).toBe(0);
    });

    it('应该处理获取统计信息时的错误', async () => {
      mockStorageAdapter.getAsync.mockRejectedValue(new Error('读取错误'));

      const stats = await repository.getMessageStats();

      expect(stats.total).toBe(0);
      expect(stats.unread).toBe(0);
    });
  });
});
