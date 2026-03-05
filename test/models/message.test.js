/**
 * message.test.js - Message 领域模型测试
 *
 * 测试 Message 模型的核心业务逻辑
 */

const { Message, MessageType, NotificationType, MessagePriority } = require('../../models/message');
const TestDataFactory = require('../utils/test-data-factory');

describe('Message 领域模型', () => {
  // ====== 构造函数和默认值 ======
  describe('构造函数', () => {
    it('应该使用默认值创建消息', () => {
      const message = new Message();

      expect(message.id).toBeDefined();
      expect(message.userId).toBe('');
      expect(message.type).toBe(MessageType.NOTIFICATION);
      expect(message.notificationType).toBe(NotificationType.INFO);
      expect(message.title).toBe('');
      expect(message.content).toBe('');
      expect(message.isRead).toBe(false);
      expect(message.isPinned).toBe(false);
      expect(message.isArchived).toBe(false);
      expect(message.expireTime).toBe(0);
      expect(message.priority).toBe(0);
      expect(message.data).toEqual({});
      expect(message.actions).toEqual([]);
    });

    it('应该使用提供的数据创建消息', () => {
      const data = TestDataFactory.createMessage({
        title: '测试消息',
        type: 'task',
        priority: 1
      });

      const message = new Message(data);

      expect(message.title).toBe('测试消息');
      expect(message.type).toBe('task');
      expect(message.priority).toBe(1);
    });

    it('应该为不同类型设置默认图标', () => {
      const notificationMsg = new Message({ type: MessageType.NOTIFICATION });
      const systemMsg = new Message({ type: MessageType.SYSTEM });
      const taskMsg = new Message({ type: MessageType.TASK });
      const rewardMsg = new Message({ type: MessageType.REWARD });
      const starMsg = new Message({ type: MessageType.STAR });

      expect(notificationMsg.icon).toBe('ℹ️');
      expect(systemMsg.icon).toBe('🔧');
      expect(taskMsg.icon).toBe('📝');
      expect(rewardMsg.icon).toBe('🎁');
      expect(starMsg.icon).toBe('⭐');
    });

    it('应该为不同通知类型设置图标', () => {
      const successMsg = new Message({
        type: MessageType.NOTIFICATION,
        notificationType: NotificationType.SUCCESS
      });
      const warningMsg = new Message({
        type: MessageType.NOTIFICATION,
        notificationType: NotificationType.WARNING
      });
      const errorMsg = new Message({
        type: MessageType.NOTIFICATION,
        notificationType: NotificationType.ERROR
      });

      expect(successMsg.icon).toBe('✅');
      expect(warningMsg.icon).toBe('⚠️');
      expect(errorMsg.icon).toBe('❌');
    });

    it('应该支持自定义图标', () => {
      const message = new Message({ icon: '🎉' });

      expect(message.icon).toBe('🎉');
    });
  });

  // ====== 验证方法 ======
  describe('validate', () => {
    it('有效消息应该通过验证', () => {
      const message = new Message(TestDataFactory.createMessage({
        title: '有效消息'
      }));

      const errors = message.validate();

      expect(errors).toEqual([]);
    });

    it('既没有标题也没有内容的消息应该返回错误', () => {
      const message = new Message({ title: '', content: '' });

      const errors = message.validate();

      expect(errors).toContain('消息必须有标题或内容');
    });

    it('过期时间早于创建时间应该返回错误', () => {
      const createTime = Date.now();
      const message = new Message({
        title: '测试消息',
        createTime: createTime,
        expireTime: createTime - 1000
      });

      const errors = message.validate();

      expect(errors).toContain('过期时间不能早于创建时间');
    });

    it('已读但没有阅读时间的消息应该返回错误', () => {
      const message = new Message({
        title: '测试消息',
        isRead: true,
        readTime: 0
      });

      const errors = message.validate();

      expect(errors).toContain('已读消息必须有阅读时间');
    });

    it('只有标题的消息应该通过验证', () => {
      const message = new Message({ title: '测试消息' });

      const errors = message.validate();

      expect(errors).toEqual([]);
    });

    it('只有内容的消息应该通过验证', () => {
      const message = new Message({ content: '测试内容' });

      const errors = message.validate();

      expect(errors).toEqual([]);
    });
  });

  // ====== markAsRead 和 markAsUnread ======
  describe('markAsRead 和 markAsUnread', () => {
    it('应该标记消息为已读', async () => {
      const message = new Message(TestDataFactory.createMessage({
        isRead: false
      }));

      await new Promise(resolve => setTimeout(resolve, 1));
      message.markAsRead();

      expect(message.isRead).toBe(true);
      expect(message.readTime).toBeGreaterThan(0);
    });

    it('重复标记已读应该保持第一次的阅读时间', () => {
      const message = new Message(TestDataFactory.createMessage({
        isRead: false
      }));

      message.markAsRead();
      const firstReadTime = message.readTime;

      message.markAsRead();

      expect(message.readTime).toBe(firstReadTime);
    });

    it('应该标记消息为未读', () => {
      const message = new Message(TestDataFactory.createMessage({
        isRead: true,
        readTime: Date.now()
      }));

      message.markAsUnread();

      expect(message.isRead).toBe(false);
      expect(message.readTime).toBe(0);
    });

    it('markAsRead应该返回当前实例（链式调用）', () => {
      const message = new Message(TestDataFactory.createMessage());

      const result = message.markAsRead();

      expect(result).toBe(message);
    });

    it('markAsUnread应该返回当前实例（链式调用）', () => {
      const message = new Message(TestDataFactory.createMessage());

      const result = message.markAsUnread();

      expect(result).toBe(message);
    });
  });

  // ====== togglePin ======
  describe('togglePin', () => {
    it('应该切换置顶状态', () => {
      const message = new Message(TestDataFactory.createMessage({
        isPinned: false
      }));

      message.togglePin();

      expect(message.isPinned).toBe(true);

      message.togglePin();

      expect(message.isPinned).toBe(false);
    });

    it('togglePin应该返回当前实例（链式调用）', () => {
      const message = new Message(TestDataFactory.createMessage());

      const result = message.togglePin();

      expect(result).toBe(message);
    });
  });

  // ====== archive 和 unarchive ======
  describe('archive 和 unarchive', () => {
    it('应该归档消息', () => {
      const message = new Message(TestDataFactory.createMessage({
        isArchived: false
      }));

      message.archive();

      expect(message.isArchived).toBe(true);
    });

    it('应该取消归档消息', () => {
      const message = new Message(TestDataFactory.createMessage({
        isArchived: true
      }));

      message.unarchive();

      expect(message.isArchived).toBe(false);
    });

    it('archive应该返回当前实例（链式调用）', () => {
      const message = new Message(TestDataFactory.createMessage());

      const result = message.archive();

      expect(result).toBe(message);
    });

    it('unarchive应该返回当前实例（链式调用）', () => {
      const message = new Message(TestDataFactory.createMessage());

      const result = message.unarchive();

      expect(result).toBe(message);
    });
  });

  // ====== isExpired ======
  describe('isExpired', () => {
    it('未设置过期时间的消息不应该过期', () => {
      const message = new Message(TestDataFactory.createMessage({
        expireTime: 0
      }));

      expect(message.isExpired()).toBe(false);
    });

    it('过期时间在未来不应该过期', () => {
      const futureTime = Date.now() + 86400000;
      const message = new Message(TestDataFactory.createMessage({
        expireTime: futureTime
      }));

      expect(message.isExpired()).toBe(false);
    });

    it('过期时间在过去应该过期', () => {
      const pastTime = Date.now() - 1000;
      const message = new Message(TestDataFactory.createMessage({
        expireTime: pastTime
      }));

      expect(message.isExpired()).toBe(true);
    });
  });

  // ====== getStyleClass ======
  describe('getStyleClass', () => {
    it('应该生成基础样式类', () => {
      const message = new Message(TestDataFactory.createMessage({
        type: MessageType.NOTIFICATION,
        notificationType: NotificationType.INFO
      }));

      const styleClass = message.getStyleClass();

      expect(styleClass).toContain('message');
      expect(styleClass).toContain('notification');
      expect(styleClass).toContain('info');
    });

    it('应该包含pinned类', () => {
      const message = new Message(TestDataFactory.createMessage({
        isPinned: true
      }));

      const styleClass = message.getStyleClass();

      expect(styleClass).toContain('pinned');
    });

    it('应该包含read类', () => {
      const message = new Message(TestDataFactory.createMessage({
        isRead: true
      }));

      const styleClass = message.getStyleClass();

      expect(styleClass).toContain('read');
    });

    it('应该包含archived类', () => {
      const message = new Message(TestDataFactory.createMessage({
        isArchived: true
      }));

      const styleClass = message.getStyleClass();

      expect(styleClass).toContain('archived');
    });

    it('应该包含expired类', () => {
      const pastTime = Date.now() - 1000;
      const message = new Message(TestDataFactory.createMessage({
        expireTime: pastTime
      }));

      const styleClass = message.getStyleClass();

      expect(styleClass).toContain('expired');
    });

    it('应该包含important类（优先级1）', () => {
      const message = new Message(TestDataFactory.createMessage({
        priority: 1
      }));

      const styleClass = message.getStyleClass();

      expect(styleClass).toContain('important');
    });

    it('应该包含urgent类（优先级2）', () => {
      const message = new Message(TestDataFactory.createMessage({
        priority: 2
      }));

      const styleClass = message.getStyleClass();

      expect(styleClass).toContain('urgent');
    });
  });

  // ====== 时间格式化方法 ======
  describe('时间格式化方法', () => {
    it('getFormattedTime应该返回格式化的时间', () => {
      const createTime = new Date('2026-03-03T10:30:00').getTime();
      const message = new Message(TestDataFactory.createMessage({
        createTime: createTime
      }));

      const formattedTime = message.getFormattedTime();

      expect(formattedTime).toContain('2026');
    });

    it('getRelativeTime应该返回"刚刚"', () => {
      const createTime = Date.now() - 1000; // 1秒前
      const message = new Message(TestDataFactory.createMessage({
        createTime: createTime
      }));

      const relativeTime = message.getRelativeTime();

      expect(relativeTime).toBe('刚刚');
    });

    it('getRelativeTime应该返回"X分钟前"', () => {
      const createTime = Date.now() - 120000; // 2分钟前
      const message = new Message(TestDataFactory.createMessage({
        createTime: createTime
      }));

      const relativeTime = message.getRelativeTime();

      expect(relativeTime).toBe('2分钟前');
    });

    it('getRelativeTime应该返回"X小时前"', () => {
      const createTime = Date.now() - 7200000; // 2小时前
      const message = new Message(TestDataFactory.createMessage({
        createTime: createTime
      }));

      const relativeTime = message.getRelativeTime();

      expect(relativeTime).toBe('2小时前');
    });

    it('getRelativeTime应该返回"X天前"', () => {
      const createTime = Date.now() - 172800000; // 2天前
      const message = new Message(TestDataFactory.createMessage({
        createTime: createTime
      }));

      const relativeTime = message.getRelativeTime();

      expect(relativeTime).toBe('2天前');
    });

    it('getRelativeTime超过7天应该返回日期', () => {
      const createTime = new Date('2026-02-20').getTime();
      const message = new Message(TestDataFactory.createMessage({
        createTime: createTime
      }));

      const relativeTime = message.getRelativeTime();

      expect(relativeTime).toBe('2026-2-20');
    });
  });

  // ====== clone ======
  describe('clone', () => {
    it('应该克隆消息并生成新ID', () => {
      const originalMessage = new Message(TestDataFactory.createMessage({
        id: 'original_123',
        title: '原始消息'
      }));

      const clonedMessage = originalMessage.clone();

      expect(clonedMessage.id).not.toBe(originalMessage.id);
      expect(clonedMessage.title).toBe(originalMessage.title);
      expect(clonedMessage).not.toBe(originalMessage); // 不是同一个对象
    });

    it('克隆的消息应该重置状态', async () => {
      const readMessage = new Message(TestDataFactory.createMessage({
        id: 'original_123',
        isRead: true,
        readTime: Date.now()
      }));

      await new Promise(resolve => setTimeout(resolve, 1));
      const clonedMessage = readMessage.clone();

      expect(clonedMessage.isRead).toBe(false);
      expect(clonedMessage.readTime).toBe(0);
    });

    it('克隆消息应该覆盖属性', () => {
      const originalMessage = new Message(TestDataFactory.createMessage({
        id: 'original_123',
        title: '原始消息',
        priority: 0
      }));

      const clonedMessage = originalMessage.clone({
        title: '新消息',
        priority: 1
      });

      expect(clonedMessage.title).toBe('新消息');
      expect(clonedMessage.priority).toBe(1);
    });

    it('克隆消息可以选择不生成新ID', () => {
      const originalMessage = new Message(TestDataFactory.createMessage({
        id: 'original_123'
      }));

      const clonedMessage = originalMessage.clone({}, false);

      expect(clonedMessage.id).toBe('original_123');
    });

    it('克隆应该复制所有属性', () => {
      const originalMessage = new Message(TestDataFactory.createMessage({
        title: '测试消息',
        content: '内容',
        type: 'reward',
        priority: 1,
        data: { key: 'value' },
        actions: [{ label: '查看' }]
      }));

      const clonedMessage = originalMessage.clone();

      expect(clonedMessage.title).toBe('测试消息');
      expect(clonedMessage.content).toBe('内容');
      expect(clonedMessage.type).toBe('reward');
      expect(clonedMessage.priority).toBe(1);
      expect(clonedMessage.data).toEqual({ key: 'value' });
      expect(clonedMessage.actions).toEqual([{ label: '查看' }]);
    });
  });

  // ====== isSimilarTo ======
  describe('isSimilarTo', () => {
    it('完全相同的消息应该相似', () => {
      const message1 = new Message(TestDataFactory.createMessage({
        id: 'msg_1',
        title: '相似消息',
        type: 'notification',
        notificationType: 'info',
        relatedId: 'task_123',
        relatedType: 'task',
        createTime: Date.now()
      }));
      const message2 = new Message(TestDataFactory.createMessage({
        id: 'msg_2',
        title: '相似消息',
        type: 'notification',
        notificationType: 'info',
        relatedId: 'task_123',
        relatedType: 'task',
        createTime: Date.now() + 1000 // 1秒后
      }));

      expect(message1.isSimilarTo(message2)).toBe(true);
    });

    it('不同类型的消息不应该相似', () => {
      const message1 = new Message(TestDataFactory.createMessage({
        type: 'notification'
      }));
      const message2 = new Message(TestDataFactory.createMessage({
        type: 'system'
      }));

      expect(message1.isSimilarTo(message2)).toBe(false);
    });

    it('不同关联对象的消息不应该相似', () => {
      const message1 = new Message(TestDataFactory.createMessage({
        relatedId: 'task_123',
        relatedType: 'task'
      }));
      const message2 = new Message(TestDataFactory.createMessage({
        relatedId: 'task_456',
        relatedType: 'task'
      }));

      expect(message1.isSimilarTo(message2)).toBe(false);
    });

    it('不同标题的消息不应该相似', () => {
      const message1 = new Message(TestDataFactory.createMessage({
        title: '消息1'
      }));
      const message2 = new Message(TestDataFactory.createMessage({
        title: '消息2'
      }));

      expect(message1.isSimilarTo(message2)).toBe(false);
    });

    it('超过5分钟的消息不应该相似', () => {
      const message1 = new Message(TestDataFactory.createMessage({
        title: '相似消息',
        createTime: Date.now()
      }));
      const message2 = new Message(TestDataFactory.createMessage({
        title: '相似消息',
        createTime: Date.now() + 6 * 60 * 1000 // 6分钟后
      }));

      expect(message1.isSimilarTo(message2)).toBe(false);
    });

    it('非Message对象应该返回false', () => {
      const message = new Message(TestDataFactory.createMessage());

      expect(message.isSimilarTo(null)).toBe(false);
      expect(message.isSimilarTo({})).toBe(false);
    });
  });

  // ====== isRelatedTo ======
  describe('isRelatedTo', () => {
    it('应该正确识别关联的消息', () => {
      const message = new Message(TestDataFactory.createMessage({
        relatedId: 'task_123',
        relatedType: 'task'
      }));

      expect(message.isRelatedTo('task_123')).toBe(true);
      expect(message.isRelatedTo('task_456')).toBe(false);
    });

    it('空关联ID应该返回false', () => {
      const message = new Message(TestDataFactory.createMessage({
        relatedId: ''
      }));

      expect(message.isRelatedTo('')).toBe(false);
      expect(message.isRelatedTo(null)).toBe(false);
    });
  });

  // ====== isValid ======
  describe('isValid', () => {
    it('未过期的消息应该有效', () => {
      const message = new Message(TestDataFactory.createMessage({
        createTime: Date.now()
      }));

      expect(message.isValid()).toBe(true);
    });

    it('已过期的消息不应该有效', () => {
      const pastTime = Date.now() - 1000;
      const message = new Message(TestDataFactory.createMessage({
        expireTime: pastTime
      }));

      expect(message.isValid()).toBe(false);
    });

    it('超过保留期限的消息不应该有效', () => {
      const oldCreateTime = Date.now() - (31 * 24 * 60 * 60 * 1000); // 31天前
      const message = new Message(TestDataFactory.createMessage({
        createTime: oldCreateTime
      }));

      expect(message.isValid()).toBe(false);
    });

    it('在保留期限内的消息应该有效', () => {
      const recentCreateTime = Date.now() - (29 * 24 * 60 * 60 * 1000); // 29天前
      const message = new Message(TestDataFactory.createMessage({
        createTime: recentCreateTime
      }));

      expect(message.isValid()).toBe(true);
    });

    it('应该支持自定义保留期限', () => {
      const oldCreateTime = Date.now() - (61 * 24 * 60 * 60 * 1000); // 61天前
      const message = new Message(TestDataFactory.createMessage({
        createTime: oldCreateTime
      }));

      expect(message.isValid(60)).toBe(false);
      expect(message.isValid(90)).toBe(true);
    });
  });

  // ====== 边界场景 ======
  describe('边界场景', () => {
    it('应该处理summary为空字符串', () => {
      const message = new Message({ summary: '' });

      expect(message.summary).toBe('');
    });

    it('应该处理data为undefined', () => {
      const message = new Message({ data: undefined });

      expect(message.data).toEqual({});
    });

    it('应该处理actions为undefined', () => {
      const message = new Message({ actions: undefined });

      expect(message.actions).toEqual([]);
    });

    it('应该处理priority为undefined', () => {
      const message = new Message({ priority: undefined });

      expect(message.priority).toBe(0);
    });

    it('应该处理expireTime为0（永不过期）', () => {
      const message = new Message({ expireTime: 0 });

      expect(message.isExpired()).toBe(false);
    });
  });

  // ====== 关联对象 ======
  describe('关联对象', () => {
    it('应该支持relatedId和relatedType', () => {
      const message = new Message(TestDataFactory.createMessage({
        relatedId: 'task_123',
        relatedType: 'task'
      }));

      expect(message.relatedId).toBe('task_123');
      expect(message.relatedType).toBe('task');
    });

    it('应该支持不同类型的关联对象', () => {
      const taskMessage = new Message(TestDataFactory.createMessage({
        relatedId: 'task_123',
        relatedType: 'task'
      }));
      const rewardMessage = new Message(TestDataFactory.createMessage({
        relatedId: 'reward_456',
        relatedType: 'reward'
      }));

      expect(taskMessage.isRelatedTo('task_123')).toBe(true);
      expect(rewardMessage.isRelatedTo('reward_456')).toBe(true);
    });
  });
});
