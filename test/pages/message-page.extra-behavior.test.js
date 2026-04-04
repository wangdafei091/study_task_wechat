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

jest.mock('../../utils/dateUtils', () => ({
  formatRelativeTime: jest.fn(() => ''),
  getDaysBetween: jest.fn(() => 2),
  isToday: jest.fn(() => false),
  isYesterday: jest.fn(() => false)
}));

describe('packageMessage/pages/message/message extra behavior', () => {
  let pageConfig;
  let messageService;
  let serviceManager;
  let dateUtils;

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
    dateUtils = require('../../utils/dateUtils');
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
        export: jest.fn(() => ({ done: true }))
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

  it('markAllAsRead 在无未读或服务失败时应提示用户', async () => {
    const page = createPageInstance();
    page.data.messages = [{ id: 'm1', isRead: true, type: 'task', createTime: 1 }];
    page.markAllAsRead();
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '暂无未读消息'
    }));

    page.data.messages = [{ id: 'm2', isRead: false, type: 'task', createTime: 2 }];
    messageService.markAllMessagesAsRead.mockResolvedValueOnce(0);
    page.markAllAsRead();
    await Promise.resolve();
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '操作失败'
    }));
  });

  it('deleteMessage、showMessageOptions 和 markMessageAsRead 应覆盖失败分支', async () => {
    const page = createPageInstance();
    page.data.messages = [
      { id: 'm1', isRead: false, type: 'task', createTime: 1, content: 'x' },
      { id: 'm2', isRead: true, type: 'system', createTime: 2, content: 'y' }
    ];
    page.data.filteredMessages = [...page.data.messages];

    page.deleteMessage({ currentTarget: { dataset: {} } });
    expect(global.wx.showModal).not.toHaveBeenCalled();

    messageService.deleteMessage.mockResolvedValueOnce(false);
    page.deleteMessage({ currentTarget: { dataset: { id: 'm1' } } });
    await Promise.resolve();
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '删除失败'
    }));

    page.markMessageAsRead = jest.fn();
    page.deleteMessage = jest.fn();
    page.showMessageOptions({ currentTarget: { dataset: { index: 0 } } });
    expect(page.markMessageAsRead).toHaveBeenCalledWith({
      currentTarget: { dataset: { id: 'm1' } }
    });

    global.wx.showActionSheet.mockImplementationOnce(({ success }) => success({ tapIndex: 0 }));
    page.showMessageOptions({ currentTarget: { dataset: { index: 1 } } });
    expect(page.deleteMessage).toHaveBeenCalledWith({
      currentTarget: { dataset: { id: 'm2' } }
    });
  });

  it('markMessageAsRead 在已读、失败和异常场景下应正确处理', async () => {
    const page = createPageInstance();
    page.processMessages = jest.fn();
    page.data.messages = [
      { id: 'm1', isRead: true, type: 'task', createTime: 1 },
      { id: 'm2', isRead: false, type: 'task', createTime: 2 }
    ];

    page.markMessageAsRead({ currentTarget: { dataset: { id: 'm1' } } });
    expect(messageService.markMessageAsRead).not.toHaveBeenCalled();

    messageService.markMessageAsRead.mockResolvedValueOnce(false);
    page.markMessageAsRead({ currentTarget: { dataset: { id: 'm2' } } });
    await Promise.resolve();
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '操作失败'
    }));

    messageService.markMessageAsRead.mockRejectedValueOnce(new Error('boom'));
    page.markMessageAsRead({ currentTarget: { dataset: { id: 'm2' } } });
    await Promise.resolve();
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '操作失败'
    }));
  });

  it('loadMoreMessages、formatMessageTime、formatDate 和 viewMessageDetail 应覆盖边界分支', async () => {
    const page = createPageInstance();
    page.data.messages = [
      { id: 'm1', title: '消息1', isRead: false, type: 'task', createTime: 1, content: '详情' }
    ];

    page.data.hasMoreMessages = false;
    page.data.currentPage = 1;
    page.loadMoreMessages();
    expect(page.data.currentPage).toBe(1);

    page.data.hasMoreMessages = true;
    page.filterMessagesByTab = jest.fn();
    page.loadMoreMessages();
    expect(page.data.currentPage).toBe(2);
    expect(page.filterMessagesByTab).toHaveBeenCalled();

    expect(page.formatMessageTime(1)).toBe('时间未知');
    expect(page.formatDate(null)).toBe('今天');

    dateUtils.getDaysBetween.mockReturnValueOnce(2);
    expect(page.formatDate(Date.now() - 2 * 86400000)).toBe('前天');

    dateUtils.getDaysBetween.mockReturnValueOnce(3);
    expect(page.formatDate(new Date('2026-03-23').getTime())).toContain('星期');

    dateUtils.getDaysBetween.mockReturnValueOnce(10);
    expect(page.formatDate(new Date('2025-03-01').getTime())).toContain('2025年');

    page.showMessageDetail = jest.fn();
    page.processMessages = jest.fn();
    messageService.markMessageAsRead.mockResolvedValueOnce(true);
    await page.viewMessageDetail({ currentTarget: { dataset: { id: 'm1' } } });
    expect(page.showMessageDetail).toHaveBeenCalled();
    expect(page.processMessages).toHaveBeenCalled();
  });

  it('loadMoreMessages 后应按扩展后的当前展示序列重新计算日期分隔', () => {
    const page = createPageInstance();
    page.data.pageSize = 1;
    page.data.activeTab = 'task';
    page.formatDate = jest.fn((createTime) => (createTime >= 300 ? '今天' : '昨天'));
    page.formatMessageTime = jest.fn(() => '刚刚');

    page.processMessages([
      { id: 'm1', type: 'reward', isRead: false, createTime: 400 },
      { id: 'm2', type: 'task', isRead: false, createTime: 350 },
      { id: 'm3', type: 'task', isRead: false, createTime: 100 }
    ]);

    expect(page.data.filteredMessages.map((message) => message.id)).toEqual(['m2']);
    expect(page.data.filteredMessages[0].showDateDivider).toBe(true);

    page.loadMoreMessages();

    expect(page.data.filteredMessages.map((message) => message.id)).toEqual(['m2', 'm3']);
    expect(page.data.filteredMessages.map((message) => message.showDateDivider)).toEqual([true, true]);
    expect(page.data.filteredMessages.map((message) => message.dateDivider)).toEqual(['今天', '昨天']);
  });
});
