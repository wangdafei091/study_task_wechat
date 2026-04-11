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
});
