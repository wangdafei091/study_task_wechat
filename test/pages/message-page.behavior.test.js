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

  it('onLoad 和 onShow 应走统一数据加载入口', async () => {
    const page = createPageInstance();
    page.loadMessageData = jest.fn();

    page.onLoad({ tab: 'reward' });
    page.onShow();

    expect(page.data.activeTab).toBe('reward');
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

  it('markAllAsRead、markMessageAsRead 和 deleteMessage 应更新页面状态', async () => {
    const page = createPageInstance();
    page.data.messages = [
      { id: 'm1', type: 'task', isRead: false, createTime: 1 },
      { id: 'm2', type: 'reward', isRead: false, createTime: 2 }
    ];
    page.processMessages = jest.fn();
    page.loadMessageData = jest.fn();

    messageService.markAllMessagesAsRead.mockResolvedValue(2);
    page.markAllAsRead();
    await Promise.resolve();
    expect(page.processMessages).toHaveBeenCalled();

    messageService.markMessageAsRead.mockResolvedValue(true);
    page.markMessageAsRead({ currentTarget: { dataset: { id: 'm1' } } });
    await Promise.resolve();
    jest.runAllTimers();
    expect(page.loadMessageData).toHaveBeenCalled();

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
});
