jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  logEvent: jest.fn()
}));

jest.mock('../../services/service-manager.js', () => ({
  getMessageService: jest.fn()
}));

jest.mock('../../utils/view-scope', () => ({
  resolveMessageScopeOptions: jest.fn(() => ({ scope: 'user', userId: 'child-1' }))
}));

describe('packageMessage/pages/message/message behavior', () => {
  let pageConfig;
  let messageService;
  let serviceManager;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../packageMessage/pages/message/message.js');
    });
  }

  function createPageInstance() {
    return {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
    };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
    serviceManager = require('../../services/service-manager.js');

    messageService = {
      getMessagesByScope: jest.fn(),
      markAllMessagesAsRead: jest.fn(),
      markMessageAsRead: jest.fn(),
      deleteMessage: jest.fn()
    };

    serviceManager.getMessageService.mockReturnValue(messageService);

    global.getApp = jest.fn(() => ({
      globalData: {
        userService: {
          getLoginUser: jest.fn(() => ({ userId: 'parent-1', role: 'parent' })),
          getCurrentUser: jest.fn(() => ({ userId: 'child-1', role: 'child' }))
        }
      }
    }));

    global.wx = {
      showToast: jest.fn(),
      showModal: jest.fn(({ success }) => success({ confirm: true })),
      showActionSheet: jest.fn(({ success }) => success({ tapIndex: 0 })),
      createAnimation: jest.fn(() => ({
        translateY: jest.fn().mockReturnThis(),
        opacity: jest.fn().mockReturnThis(),
        step: jest.fn().mockReturnThis(),
        export: jest.fn(() => ({ finished: true }))
      }))
    };

    loadPageModule();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.Page;
    delete global.getApp;
    delete global.wx;
  });

  it('onLoad 首次进入应加载一次，首次 onShow 不应重复拉取', async () => {
    const page = createPageInstance();
    page.loadMessageData = jest.fn();

    page.onLoad({ tab: 'reward' });
    await page.onShow();

    expect(page.data.activeTab).toBe('reward');
    expect(page.loadMessageData).toHaveBeenCalledTimes(1);
  });

  it('首次进入后再次 onShow 应刷新消息数据', async () => {
    const page = createPageInstance();
    page.loadMessageData = jest.fn();

    page.onLoad({});
    await page.onShow();
    await page.onShow();

    expect(page.loadMessageData).toHaveBeenCalledTimes(2);
  });

  it('loadMessageData 成功后应处理并写入消息列表', async () => {
    const page = createPageInstance();
    messageService.getMessagesByScope.mockResolvedValue([
      { id: 'm1', type: 'task', isRead: true, createTime: 1 },
      { id: 'm2', type: 'reward', isRead: false, createTime: 2 }
    ]);

    await page.loadMessageData();

    expect(messageService.getMessagesByScope).toHaveBeenCalledWith({
      scope: 'user',
      userId: 'child-1',
      requireFresh: true
    });
    expect(page.data.messages[0].id).toBe('m2');
    expect(page.data.unreadCount).toBe(1);
  });

  it('同一事件存在 formal 与 provisional 时应优先保留 formal，并给剩余 provisional 打弱化标记', async () => {
    const page = createPageInstance();

    page.processMessages([
      {
        id: 'm_formal',
        type: 'task',
        isRead: false,
        createTime: 10,
        syncedToCloud: true,
        messageEventKey: 'event:1'
      },
      {
        id: 'm_provisional_same',
        type: 'task',
        isRead: false,
        createTime: 20,
        isProvisional: true,
        syncedToCloud: false,
        messageEventKey: 'event:1'
      },
      {
        id: 'm_provisional_only',
        type: 'reward',
        isRead: false,
        createTime: 30,
        isProvisional: true,
        syncedToCloud: false,
        messageEventKey: 'event:2'
      }
    ]);

    expect(page.data.messages.map((message) => message.id)).toEqual(['m_provisional_only', 'm_formal']);
    expect(page.data.unreadCount).toBe(2);
    expect(page.data.messages[0]).toEqual(expect.objectContaining({
      id: 'm_provisional_only',
      isWeakProvisional: true,
      syncMetaText: '本机暂存'
    }));
    expect(page.data.messages[1]).toEqual(expect.objectContaining({
      id: 'm_formal',
      isWeakProvisional: false
    }));
  });

  it('markAllAsRead、markMessageAsRead 和 deleteMessage 应更新页面状态', async () => {
    const page = createPageInstance();
    page.data.messages = [
      { id: 'm1', type: 'task', isRead: false, createTime: 1 },
      { id: 'm2', type: 'reward', isRead: false, createTime: 2 }
    ];
    page.processMessages = jest.fn();

    messageService.markAllMessagesAsRead.mockResolvedValue(2);
    page.markAllAsRead();
    await Promise.resolve();
    expect(page.processMessages).toHaveBeenCalled();

    messageService.markMessageAsRead.mockResolvedValue(true);
    page.markMessageAsRead({ currentTarget: { dataset: { id: 'm1' } } });
    await Promise.resolve();
    expect(page.processMessages).toHaveBeenCalledTimes(2);

    messageService.deleteMessage.mockResolvedValue(true);
    page.processMessages.mockClear();
    page.deleteMessage({ currentTarget: { dataset: { id: 'm1' } } });
    await Promise.resolve();
    expect(page.processMessages).toHaveBeenCalled();
  });

  it('详情面板、Tab 与更多加载应正常工作', () => {
    const page = createPageInstance();
    page.data.messages = [
      { id: 'm1', type: 'task', isRead: false, createTime: 1 },
      { id: 'm2', type: 'reward', isRead: true, createTime: 2 }
    ];
    page.data.pageSize = 1;
    page.processMessages(page.data.messages);
    page.switchTab({ currentTarget: { dataset: { tab: 'task' } } });
    page.loadMoreMessages();

    page.showMessageDetail({ id: 'm1', title: '标题' });
    jest.runOnlyPendingTimers();
    expect(page.data.showDetailPanel).toBe(true);

    page.hideMessageDetail();
    jest.runAllTimers();
    expect(page.data.showDetailPanel).toBe(false);

    const stopPropagation = jest.fn();
    const preventDefault = jest.fn();
    expect(page.preventBubble({ stopPropagation, preventDefault })).toBe(false);
    expect(stopPropagation).toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
  });

  it('按 Tab 过滤后应基于最终展示序列重算日期分隔', () => {
    const page = createPageInstance();
    page.formatDate = jest.fn((createTime) => (createTime >= 300 ? '今天' : '昨天'));
    page.formatMessageTime = jest.fn(() => '刚刚');

    page.processMessages([
      { id: 'm1', type: 'reward', isRead: false, createTime: 400 },
      { id: 'm2', type: 'task', isRead: false, createTime: 350 },
      { id: 'm3', type: 'task', isRead: true, createTime: 100 }
    ]);

    page.switchTab({ currentTarget: { dataset: { tab: 'task' } } });

    expect(page.data.filteredMessages.map((message) => message.id)).toEqual(['m2', 'm3']);
    expect(page.data.filteredMessages.map((message) => message.showDateDivider)).toEqual([true, true]);
    expect(page.data.filteredMessages.map((message) => message.dateDivider)).toEqual(['今天', '昨天']);
  });
});
