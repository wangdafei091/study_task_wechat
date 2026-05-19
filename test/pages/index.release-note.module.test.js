jest.mock('../../services/service-manager.js', () => ({
  getService: jest.fn(),
  getUserService: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../utils/runtime-version', () => ({
  getRuntimeVersion: jest.fn(() => '3.9.0')
}));

const releaseNoteModule = require('../../pages/index/modules/index-release-note');
const serviceManager = require('../../services/service-manager.js');

function createPage(overrides = {}) {
  return {
    data: {
      currentUser: { id: 'child-1', userId: 'child-1', role: 'child' },
      releaseNoteSheetVisible: false,
      releaseNoteSheetNote: null,
      releaseNoteHelpBadgeVisible: false,
      releaseNoteHelpBadgeText: '',
      showSearch: false,
      showMessagePreview: false,
      showHomeOnboardingCard: false,
      showUserSwitcher: false,
      ...overrides.data
    },
    _pendingReleaseNotePrompt: overrides.pendingPrompt || null,
    setData: jest.fn(function setData(update) {
      Object.assign(this.data, update);
    })
  };
}

describe('pages/index/modules/index-release-note', () => {
  let releaseNoteService;
  let fallbackUserService;

  beforeEach(() => {
    jest.clearAllMocks();

    releaseNoteService = {
      getCurrentReleaseNote: jest.fn().mockResolvedValue({
        success: true,
        note: { version: '3.9.0', title: '本次更新' },
        promptEligible: true,
        effectiveUserId: 'child-1'
      }),
      getHelpEntryBadgeState: jest.fn().mockResolvedValue({
        visible: true,
        text: '有新变化'
      }),
      evaluateReleaseNotePromptDisplay: jest.fn(() => ({
        shouldDisplay: true,
        pending: false
      })),
      markPromptShown: jest.fn().mockResolvedValue({ success: true }),
      markReleaseNoteRead: jest.fn().mockResolvedValue({ success: true })
    };

    fallbackUserService = {
      getCurrentUser: jest.fn(() => ({ id: 'fallback-child', userId: 'fallback-child', role: 'child' })),
      getLoginUser: jest.fn(() => ({ id: 'fallback-parent', userId: 'fallback-parent', role: 'parent' }))
    };

    serviceManager.getService.mockImplementation((name) => (
      name === 'releaseNote' ? releaseNoteService : null
    ));
    serviceManager.getUserService.mockReturnValue(fallbackUserService);

    global.wx = {
      navigateTo: jest.fn()
    };

    global.getApp = jest.fn(() => ({
      globalData: {
        userService: {
          getCurrentUser: jest.fn(() => ({ id: 'child-1', userId: 'child-1', role: 'child' })),
          getLoginUser: jest.fn(() => ({ id: 'parent-1', userId: 'parent-1', role: 'parent' }))
        }
      }
    }));
  });

  afterEach(() => {
    delete global.wx;
    delete global.getApp;
  });

  it('evaluatePendingReleaseNotePrompt 在无待展示提醒时应直接返回 false', async () => {
    const page = createPage();

    await expect(releaseNoteModule.evaluatePendingReleaseNotePrompt(page)).resolves.toBe(false);

    expect(page.setData).not.toHaveBeenCalled();
    expect(releaseNoteService.markPromptShown).not.toHaveBeenCalled();
  });

  it('evaluatePendingReleaseNotePrompt 在服务缺失或页面仍被覆盖时应走降级分支', async () => {
    const pendingPrompt = {
      note: { version: '3.9.0', title: '本次更新' },
      effectiveUserId: 'child-1'
    };
    const page = createPage({ pendingPrompt });

    serviceManager.getService.mockReturnValueOnce(null);
    await expect(releaseNoteModule.evaluatePendingReleaseNotePrompt(page)).resolves.toBe(false);
    expect(page._pendingReleaseNotePrompt).toBeNull();

    page._pendingReleaseNotePrompt = pendingPrompt;
    releaseNoteService.evaluateReleaseNotePromptDisplay.mockReturnValueOnce({
      shouldDisplay: false,
      pending: true
    });
    await expect(releaseNoteModule.evaluatePendingReleaseNotePrompt(page)).resolves.toBe(false);
    expect(page._pendingReleaseNotePrompt).toEqual(pendingPrompt);
    expect(releaseNoteService.markPromptShown).not.toHaveBeenCalled();
  });

  it('refreshReleaseNoteAwareness 在服务缺失时应隐藏提醒并清空 badge', async () => {
    const page = createPage({
      data: {
        releaseNoteSheetVisible: true,
        releaseNoteSheetNote: { version: '3.8.0' },
        releaseNoteHelpBadgeVisible: true,
        releaseNoteHelpBadgeText: '旧提醒'
      },
      pendingPrompt: {
        note: { version: '3.8.0' },
        effectiveUserId: 'child-1'
      }
    });
    serviceManager.getService.mockReturnValueOnce(null);

    await releaseNoteModule.refreshReleaseNoteAwareness(page);

    expect(page._pendingReleaseNotePrompt).toBeNull();
    expect(page.data.releaseNoteSheetVisible).toBe(false);
    expect(page.data.releaseNoteSheetNote).toBeNull();
    expect(page.data.releaseNoteHelpBadgeVisible).toBe(false);
    expect(page.data.releaseNoteHelpBadgeText).toBe('');
  });

  it('refreshReleaseNoteAwareness 在当前版本无可展示内容或不可弹出时应保持收敛', async () => {
    const page = createPage({
      pendingPrompt: {
        note: { version: '3.8.0' },
        effectiveUserId: 'child-1'
      }
    });

    releaseNoteService.getCurrentReleaseNote.mockResolvedValueOnce({
      success: false,
      note: null
    });
    await releaseNoteModule.refreshReleaseNoteAwareness(page);
    expect(page._pendingReleaseNotePrompt).toBeNull();
    expect(page.data.releaseNoteSheetVisible).toBe(false);
    expect(page.data.releaseNoteSheetNote).toBeNull();

    releaseNoteService.getCurrentReleaseNote.mockResolvedValueOnce({
      success: true,
      note: { version: '3.9.0', title: '本次更新' },
      promptEligible: false,
      effectiveUserId: 'child-1'
    });
    await releaseNoteModule.refreshReleaseNoteAwareness(page);
    expect(page._pendingReleaseNotePrompt).toBeNull();
    expect(releaseNoteService.markPromptShown).not.toHaveBeenCalled();
  });

  it('handleReleaseNotePromptLater 应先收起当前提醒，再刷新帮助入口状态', async () => {
    const page = createPage({
      data: {
        releaseNoteSheetVisible: true,
        releaseNoteSheetNote: { version: '3.9.0', title: '本次更新' }
      },
      pendingPrompt: {
        note: { version: '3.9.0', title: '本次更新' },
        effectiveUserId: 'child-1'
      }
    });

    releaseNoteService.getCurrentReleaseNote.mockResolvedValueOnce({
      success: true,
      note: { version: '3.9.0', title: '本次更新' },
      promptEligible: false,
      effectiveUserId: 'child-1'
    });

    await releaseNoteModule.handleReleaseNotePromptLater(page);

    expect(page.data.releaseNoteSheetVisible).toBe(false);
    expect(page.data.releaseNoteSheetNote).toBeNull();
    expect(page.data.releaseNoteHelpBadgeVisible).toBe(true);
    expect(page._pendingReleaseNotePrompt).toBeNull();
  });

  it('handleReleaseNotePromptDetail 应在缺少 currentUser 时回退到登录用户并处理空版本分支', async () => {
    const page = createPage({
      data: {
        currentUser: null,
        releaseNoteSheetVisible: true,
        releaseNoteSheetNote: { version: '3.9.0', title: '本次更新' },
        releaseNoteHelpBadgeVisible: true,
        releaseNoteHelpBadgeText: '有新变化'
      }
    });

    delete global.getApp;
    fallbackUserService.getCurrentUser.mockReturnValueOnce(null);
    await releaseNoteModule.handleReleaseNotePromptDetail(page);

    expect(releaseNoteService.markReleaseNoteRead).toHaveBeenCalledWith('3.9.0', 'fallback-parent');
    expect(page.data.releaseNoteHelpBadgeVisible).toBe(false);
    expect(page.data.releaseNoteHelpBadgeText).toBe('');
    expect(global.wx.navigateTo).toHaveBeenCalledWith({
      url: '/packageManage/pages/whats-new/whats-new?version=3.9.0'
    });

    page.data.releaseNoteSheetNote = null;
    serviceManager.getService.mockReturnValueOnce(null);
    await releaseNoteModule.handleReleaseNotePromptDetail(page);

    expect(global.wx.navigateTo).toHaveBeenLastCalledWith({
      url: '/packageManage/pages/whats-new/whats-new?version='
    });
  });
});
