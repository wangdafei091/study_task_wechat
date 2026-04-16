jest.mock('../../services/service-manager.js', () => ({
  getTaskService: jest.fn(),
  getMessageService: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../utils/dateUtils', () => ({
  getTodayString: jest.fn(() => '2026-03-26'),
  formatDate: jest.fn((date) => {
    const target = new Date(date);
    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, '0');
    const day = String(target.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  })
}));

jest.mock('../../utils/permission-utils', () => ({
  filterMenuItems: jest.fn((items) => items)
}));

jest.mock('../../utils/user-context', () => ({
  getUserIdentifier: jest.fn((user) => user?.userId || user?.id || null),
  resolvePermissionContext: jest.fn(() => ({
    userPermissions: { canManageMembers: true },
    loginUserId: 'parent-1',
    canManageMembers: true,
    isReadonlyView: true,
    lastActiveChildId: 'child-1'
  }))
}));

const searchPanelModule = require('../../pages/index/modules/index-search-panel');
const userSwitcherModule = require('../../pages/index/modules/index-user-switcher');
const dateNavigationModule = require('../../pages/index/modules/index-date-navigation');
const messagePreviewModule = require('../../pages/index/modules/index-message-preview');
const serviceManager = require('../../services/service-manager.js');
const permissionUtils = require('../../utils/permission-utils');

describe('pages/index helper modules', () => {
  let appMock;

  beforeEach(() => {
    jest.clearAllMocks();

    global.wx = {
      showToast: jest.fn(),
      navigateTo: jest.fn(({ success }) => {
        if (typeof success === 'function') {
          success();
        }
      }),
      showLoading: jest.fn(),
      hideLoading: jest.fn(),
      vibrateShort: jest.fn(),
      createAnimation: jest.fn(() => ({
        opacity: jest.fn().mockReturnThis(),
        scale: jest.fn().mockReturnThis(),
        step: jest.fn().mockReturnThis(),
        export: jest.fn(() => ({ ok: true }))
      }))
    };

    appMock = {
      globalData: {
        lastActiveChildId: null,
        userService: {
          getLoginUser: jest.fn(() => ({ id: 'parent-1', userId: 'parent-1', role: 'parent' })),
          getCurrentUser: jest.fn(() => ({ id: 'parent-1', userId: 'parent-1', role: 'parent', name: '家长' })),
          getAllUsers: jest.fn(() => [
            { id: 'parent-1', userId: 'parent-1', role: 'parent', name: '家长' },
            { id: 'child-1', userId: 'child-1', role: 'child', name: '小明' }
          ]),
          switchToUser: jest.fn().mockResolvedValue({ success: true }),
          updateNickname: jest.fn().mockResolvedValue({ success: true }),
          deleteFamilyMember: jest.fn().mockResolvedValue({ success: true }),
          validateService: jest.fn().mockResolvedValue({ success: true })
        }
      }
    };

    global.getApp = jest.fn(() => appMock);
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.wx;
    delete global.getApp;
  });

  it('search-panel performSearch 应按 effectiveUserId、关键词和筛选条件过滤任务', async () => {
    serviceManager.getTaskService.mockReturnValue({
      getAllTasks: jest.fn().mockResolvedValue([
        { id: 'task-1', title: '数学', description: '完成作业', status: 0, type: 'study', tags: ['学习'], userId: 'child-1' },
        { id: 'task-2', title: '钢琴', description: '练习', status: 1, type: 'interest', tags: ['艺术'], userId: 'child-1' },
        { id: 'task-3', title: '数学竞赛', description: '准备', status: 0, type: 'study', tags: ['竞赛'], userId: 'child-2' }
      ])
    });

    const page = {
      data: {
        searchQuery: '学',
        searchFilters: { type: 'study', status: '0', dateRange: '' }
      },
      getEffectiveTaskUserId: jest.fn(() => 'child-1'),
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
    };

    const results = await searchPanelModule.performSearch(page);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('task-1');
    expect(page.data.searchResults).toEqual(results);
  });

  it('search-panel getEffectiveTaskUserId 在家长视角无最近孩子时应回退到首个孩子', () => {
    const page = {
      data: {
        currentUser: { id: 'parent-1', role: 'parent' },
        canManageMembers: true,
        lastActiveChildId: '',
        availableUsers: [
          { id: 'parent-1', role: 'parent' },
          { id: 'child-1', role: 'child' }
        ]
      }
    };

    expect(searchPanelModule.getEffectiveTaskUserId(page)).toBe('child-1');

    page.data.availableUsers = [{ id: 'parent-1', role: 'parent' }];
    expect(searchPanelModule.getEffectiveTaskUserId(page)).toBeNull();
  });

  it('search-panel performSearch 在空关键词或任务服务缺失时应走降级分支', async () => {
    serviceManager.getTaskService.mockReturnValueOnce({
      getAllTasks: jest.fn().mockResolvedValue([
        { id: 'task-1', title: '数学', description: '', status: 0, type: 'study', userId: 'child-1' }
      ])
    }).mockReturnValueOnce(null);

    const page = {
      data: {
        searchQuery: '',
        searchFilters: { type: '', status: '', dateRange: '' }
      },
      getEffectiveTaskUserId: jest.fn(() => 'child-1'),
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
    };

    await expect(searchPanelModule.performSearch(page)).resolves.toEqual([
      expect.objectContaining({ id: 'task-1' })
    ]);
    await expect(searchPanelModule.performSearch(page)).resolves.toEqual([]);
    expect(page.data.searchResults).toEqual([]);
  });

  it('user-switcher updateMenuItemsWithPermissions 应在只读且非今日场景过滤管理入口', () => {
    permissionUtils.filterMenuItems.mockImplementation((items) => items);

    const page = {
      data: {
        currentUser: { role: 'parent' },
        isReadonlyView: true,
        isViewingToday: true
      },
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
    };

    userSwitcherModule.updateMenuItemsWithPermissions(page);

    expect(page.data.menuItems).toEqual([
      expect.objectContaining({ id: 'study' })
    ]);
  });

  it('user-switcher updateMenuItemsWithPermissions 应在非今日家长管理视角保留全局入口', () => {
    permissionUtils.filterMenuItems.mockImplementation((items) => items);

    const page = {
      data: {
        currentUser: { role: 'parent' },
        isReadonlyView: false,
        isViewingToday: false
      },
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
    };

    userSwitcherModule.updateMenuItemsWithPermissions(page);

    expect(page.data.menuItems.map((item) => item.id)).toEqual([
      'study',
      'habit',
      'reward-manage'
    ]);
  });

  it('user-switcher showUserSwitcher 与 handleUserSwitch 在 userService 缺失时应直接返回', async () => {
    appMock.globalData.userService = null;

    const page = {
      data: {},
      setData: jest.fn()
    };

    userSwitcherModule.showUserSwitcher(page);
    await expect(userSwitcherModule.handleUserSwitch(page, {
      detail: { userId: 'child-1' }
    })).resolves.toBeUndefined();

    expect(page.setData).not.toHaveBeenCalled();
  });

  it('user-switcher handleUserSwitch 应刷新页面上下文并回写 lastActiveChildId', async () => {
    const page = {
      data: {
        lastActiveChildId: null
      },
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      }),
      updateMenuItemsWithPermissions: jest.fn(),
      refreshDataForCurrentUser: jest.fn().mockResolvedValue()
    };

    await userSwitcherModule.handleUserSwitch(page, {
      detail: { userId: 'child-1' }
    });

    expect(page.updateMenuItemsWithPermissions).toHaveBeenCalled();
    expect(page.refreshDataForCurrentUser).toHaveBeenCalled();
    expect(appMock.globalData.lastActiveChildId).toBe('child-1');
    expect(page.data.currentUser).toEqual(expect.objectContaining({ userId: 'parent-1' }));
  });

  it('user-switcher handleUserSwitch 失败和异常时应提示用户', async () => {
    appMock.globalData.userService.switchToUser
      .mockResolvedValueOnce({ success: false, message: '切换失败' })
      .mockRejectedValueOnce(new Error('boom'));

    const page = {
      data: {
        lastActiveChildId: null
      },
      setData: jest.fn(),
      updateMenuItemsWithPermissions: jest.fn(),
      refreshDataForCurrentUser: jest.fn().mockResolvedValue()
    };

    await userSwitcherModule.handleUserSwitch(page, { detail: { userId: 'child-1' } });
    await userSwitcherModule.handleUserSwitch(page, { detail: { userId: 'child-1' } });

    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '切换失败' }));
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '用户切换失败' }));
  });

  it('user-switcher handleNicknameEdit 应覆盖无服务、失败和成功分支', async () => {
    const page = {
      setData: jest.fn(function setData(update) {
        Object.assign(this, update);
      })
    };

    appMock.globalData.userService = null;
    await expect(userSwitcherModule.handleNicknameEdit(page, {
      detail: { userId: 'child-1', nickname: '新昵称' }
    })).resolves.toBeUndefined();

    appMock.globalData.userService = {
      ...appMock.globalData.userService,
      updateNickname: jest.fn().mockResolvedValueOnce({ success: false, message: '修改失败' }).mockResolvedValueOnce({ success: true }),
      getAllUsers: jest.fn(() => [{ userId: 'child-1' }]),
      getCurrentUser: jest.fn(() => ({ userId: 'child-1' }))
    };
    global.getApp = jest.fn(() => appMock);

    await userSwitcherModule.handleNicknameEdit(page, {
      detail: { userId: 'child-1', nickname: '新昵称' }
    });
    await userSwitcherModule.handleNicknameEdit(page, {
      detail: { userId: 'child-1', nickname: '新昵称' }
    });

    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '修改失败' }));
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '昵称已更新', icon: 'success' }));
  });

  it('user-switcher handleUserDelete 应覆盖无服务、刷新和异常分支', async () => {
    const page = {
      data: {
        currentUser: { id: 'parent-1' }
      },
      setData: jest.fn(),
      refreshDataForCurrentUser: jest.fn().mockResolvedValue()
    };

    appMock.globalData.userService = null;
    await expect(userSwitcherModule.handleUserDelete(page, {
      detail: { userId: 'child-1' }
    })).resolves.toBeUndefined();

    appMock.globalData.userService = {
      ...appMock.globalData.userService,
      deleteFamilyMember: jest.fn().mockResolvedValueOnce({ success: true }).mockRejectedValueOnce(new Error('delete-fail')),
      getAllUsers: jest.fn(() => [{ userId: 'child-1' }]),
      getCurrentUser: jest.fn(() => ({ id: 'child-1', userId: 'child-1' }))
    };
    global.getApp = jest.fn(() => appMock);

    await userSwitcherModule.handleUserDelete(page, {
      detail: { userId: 'child-1' }
    });
    await userSwitcherModule.handleUserDelete(page, {
      detail: { userId: 'child-1' }
    });

    expect(page.refreshDataForCurrentUser).toHaveBeenCalled();
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '成员已删除' }));
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '删除用户失败' }));
  });

  it('date-navigation initializeDateNavigation 与 onPrevWeek 应更新周视图并触发刷新', async () => {
    const page = {
      data: {
        weekOffset: 0,
        menuItems: []
      },
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      }),
      updateMenuItemsWithPermissions: jest.fn(),
      loadTaskDataOnly: jest.fn().mockResolvedValue(),
      checkUpcomingTasks: jest.fn().mockResolvedValue()
    };

    dateNavigationModule.initializeDateNavigation(page);
    expect(page.data.currentViewDate).toBe('2026-03-26');
    expect(page.data.dateNavigation).toHaveLength(7);

    await dateNavigationModule.onPrevWeek(page);
    expect(page.data.weekOffset).toBe(-1);
    expect(page.data.currentViewDate).toBe('2026-03-16');
    expect(page.loadTaskDataOnly).toHaveBeenCalledWith('2026-03-16');
    expect(page.checkUpcomingTasks).toHaveBeenCalled();
    expect(page.updateMenuItemsWithPermissions).toHaveBeenCalled();
  });

  it('date-navigation refreshAfterWeekChange 失败时应回滚快照', async () => {
    const page = {
      data: {
        weekOffset: 0,
        weekLabel: '本周',
        canGoPrevWeek: true,
        canGoNextWeek: false,
        isViewingToday: true,
        isViewingPast: false,
        isViewingFuture: false,
        currentViewDate: '2026-03-26',
        dateNavigation: [{ dateString: '2026-03-26' }],
        pageTitle: '今日任务',
        pageTitleBadge: '',
        tasks: [{ id: 'task-old' }],
        hasTodayTasks: true,
        taskProgress: { habit: 1 },
        stats: { totalTasks: 1 },
        showUpcomingTask: true,
        upcomingTask: { id: 'task-upcoming' },
        menuItems: [{ id: 'study' }]
      },
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      }),
      updateMenuItemsWithPermissions: jest.fn(),
      loadTaskDataOnly: jest.fn().mockRejectedValue(new Error('boom')),
      checkUpcomingTasks: jest.fn()
    };

    await dateNavigationModule.refreshAfterWeekChange(page, -1);
    expect(page.data.weekOffset).toBe(0);
    expect(page.data.currentViewDate).toBe('2026-03-26');
    expect(page.data.pageTitle).toBe('今日任务');
    expect(page.data.pageTitleBadge).toBe('');
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '加载失败'
    }));
  });

  it('message-preview toggle 与跳转消息中心应保持动画和关闭时序', () => {
    jest.useFakeTimers();

    const page = {
      data: {
        showMessagePreview: false,
        showSearch: true,
        showStats: true
      },
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
    };

    messagePreviewModule.toggleMessagePreview(page);
    expect(page.data.showMessagePreview).toBe(true);
    expect(page.data.showSearch).toBe(false);
    expect(page.data.showStats).toBe(false);

    jest.runOnlyPendingTimers();
    messagePreviewModule.navigateToMessageCenter(page, { stopPropagation: jest.fn() });
    jest.runAllTimers();
    expect(page.data.showMessagePreview).toBe(false);
  });

  it('message-preview clear/prevent/detail/read 分支应可覆盖', async () => {
    const rejectError = new Error('read-fail');
    serviceManager.getMessageService.mockReturnValue({
      markMessageAsRead: jest.fn().mockRejectedValue(rejectError),
      markAllMessagesAsRead: jest.fn(),
      getUnreadCount: jest.fn()
    });

    const page = {
      _messagePreviewOpenTimer: setTimeout(() => {}, 1000),
      _messagePreviewCloseTimer: null,
      data: {
        messages: [{ id: 'msg-1', title: '标题', isRead: false }]
      },
      setData: jest.fn(),
      markMessageAsRead: jest.fn(),
      getMessageScopeOptions: jest.fn(() => ({ scope: 'user' })),
      getUnreadMessageCount: jest.fn()
    };

    messagePreviewModule.clearPreviewTimers(page);
    expect(page._messagePreviewOpenTimer).toBeNull();

    expect(messagePreviewModule.preventBubble(page, {})).toBe(false);
    expect(messagePreviewModule.preventTouchMove(page, {})).toBe(false);

    messagePreviewModule.viewMessageDetail(page, { currentTarget: { dataset: { id: 'missing' } } });
    expect(page.markMessageAsRead).not.toHaveBeenCalled();

    messagePreviewModule.viewMessageDetail(page, { currentTarget: { dataset: { id: 'msg-1' } } });
    expect(page.markMessageAsRead).toHaveBeenCalled();

    messagePreviewModule.markMessageAsRead(page, { currentTarget: { dataset: { id: 'msg-1' } } });
    await Promise.resolve();
    await Promise.resolve();
  });

  it('message-preview 快速关开切换时不应被旧关闭定时器反向隐藏', () => {
    jest.useFakeTimers();

    const page = {
      data: {
        showMessagePreview: false,
        showSearch: false,
        showStats: false
      },
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
    };

    messagePreviewModule.toggleMessagePreview(page);
    jest.advanceTimersByTime(50);
    expect(page.data.showMessagePreview).toBe(true);

    messagePreviewModule.toggleMessagePreview(page);
    expect(page.data.showMessagePreview).toBe(true);

    messagePreviewModule.toggleMessagePreview(page);
    jest.advanceTimersByTime(50);
    jest.advanceTimersByTime(250);

    expect(page.data.showMessagePreview).toBe(true);
  });

  it('message-preview markAllMessagesAsRead 与 getUnreadMessageCount 应更新页面状态', async () => {
    serviceManager.getMessageService.mockReturnValue({
      markAllMessagesAsRead: jest.fn().mockResolvedValue(2),
      getUnreadCount: jest.fn().mockResolvedValue(0),
      markMessageAsRead: jest.fn().mockResolvedValue(true)
    });

    const page = {
      data: {
        messages: [{ id: 'msg-1', isRead: false }, { id: 'msg-2', isRead: false }],
        unreadCount: 2
      },
      getMessageScopeOptions: jest.fn(() => ({ scope: 'user', userId: 'child-1' })),
      getUnreadMessageCount: jest.fn(function getUnreadMessageCount() {
        return messagePreviewModule.getUnreadMessageCount(this);
      }),
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
    };

    messagePreviewModule.markAllMessagesAsRead(page);
    await Promise.resolve();
    await Promise.resolve();

    expect(page.data.messages.every((message) => message.isRead)).toBe(true);
    expect(page.getUnreadMessageCount).toHaveBeenCalled();

    await page.getUnreadMessageCount();
    await Promise.resolve();
    expect(page.data.unreadCount).toBe(0);
  });

  it('message-preview markAll/getUnread 应覆盖空态、失败和异常分支', async () => {
    const messageService = {
      markAllMessagesAsRead: jest.fn()
        .mockResolvedValueOnce(0)
        .mockRejectedValueOnce(new Error('mark-all-fail')),
      getUnreadCount: jest.fn().mockRejectedValue(new Error('count-fail')),
      markMessageAsRead: jest.fn()
    };
    serviceManager.getMessageService.mockReturnValue(messageService);

    const emptyPage = {
      data: {
        messages: [],
        unreadCount: 0
      },
      getMessageScopeOptions: jest.fn(() => ({ scope: 'user' })),
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
    };

    messagePreviewModule.markAllMessagesAsRead(emptyPage);
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '暂无未读消息' }));

    const page = {
      data: {
        messages: [{ id: 'msg-1', isRead: false }],
        unreadCount: 1
      },
      getMessageScopeOptions: jest.fn(() => ({ scope: 'user' })),
      getUnreadMessageCount: jest.fn(function getUnreadMessageCount() {
        return messagePreviewModule.getUnreadMessageCount(this);
      }),
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
    };

    messagePreviewModule.markAllMessagesAsRead(page);
    await Promise.resolve();
    await Promise.resolve();

    messagePreviewModule.markAllMessagesAsRead(page);
    await Promise.resolve();
    await Promise.resolve();

    messagePreviewModule.getUnreadMessageCount(page);
    await Promise.resolve();
    await Promise.resolve();

    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '操作失败' }));
  });

  it('user-switcher validateUserModule 应覆盖无服务、失败和异常分支', async () => {
    appMock.globalData.userService = null;
    await expect(userSwitcherModule.validateUserModule()).resolves.toBe(false);

    appMock.globalData.userService = {
      ...appMock.globalData.userService,
      validateService: jest.fn()
        .mockResolvedValueOnce({ success: false })
        .mockRejectedValueOnce(new Error('validate-fail'))
    };
    global.getApp = jest.fn(() => appMock);

    await expect(userSwitcherModule.validateUserModule()).resolves.toBe(false);
    await expect(userSwitcherModule.validateUserModule()).resolves.toBe(false);
  });
});
