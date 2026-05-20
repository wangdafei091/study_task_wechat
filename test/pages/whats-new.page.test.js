const mockServiceManager = {
  getService: jest.fn(),
  getUserService: jest.fn()
};

jest.mock('../../services/service-manager', () => mockServiceManager);

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

describe('packageManage/pages/whats-new/whats-new', () => {
  let pageConfig;
  let releaseNoteService;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../packageManage/pages/whats-new/whats-new.js');
    });
  }

  function createPage() {
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
    mockServiceManager.getService.mockReset();
    mockServiceManager.getUserService.mockReset();
    releaseNoteService = {
      getCurrentReleaseNote: jest.fn().mockResolvedValue({
        success: true,
        note: {
          version: '3.9.0',
          title: '本次更新',
          summary: '现在可以知道有哪些新变化',
          highlights: [
            {
              id: 'h1',
              kind: 'new',
              title: '首页轻提醒',
              summary: '首页会提醒你'
            }
          ]
        },
        unread: true,
        promptEligible: false,
        effectiveUserId: 'child-1'
      }),
      listVisibleReleaseNotes: jest.fn().mockResolvedValue({
        success: true,
        notes: [
          {
            version: '3.9.0',
            title: '本次更新',
            summary: '现在可以知道有哪些新变化',
            highlights: [
              {
                id: 'h1',
                kind: 'new',
                title: '首页轻提醒',
                summary: '首页会提醒你',
                actionPath: '/pages/index/index'
              }
            ]
          },
          {
            version: '3.8.0',
            title: '上个版本',
            summary: '帮助入口更稳定',
            highlights: []
          }
        ]
      }),
      markReleaseNoteRead: jest.fn().mockResolvedValue({ success: true })
    };

    mockServiceManager.getService.mockImplementation((name) => (
      name === 'releaseNote' ? releaseNoteService : null
    ));
    mockServiceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ userId: 'parent-1', role: 'parent', familyPermissionRole: 'manager' })),
      getCurrentUser: jest.fn(() => ({ userId: 'child-1', role: 'child' }))
    });

    global.wx = {
      navigateTo: jest.fn()
    };

    loadPageModule();
  });

  afterEach(() => {
    delete global.Page;
    delete global.wx;
  });

  it('onLoad 应加载当前版本说明并标记已读', async () => {
    const page = createPage();

    await page.onLoad.call(page, { version: '3.9.0' });

    expect(page.data.currentReleaseNote).toEqual(expect.objectContaining({
      version: '3.9.0'
    }));
    expect(page.data.recentReleaseNotes).toEqual([
      expect.objectContaining({ version: '3.8.0' })
    ]);
    expect(releaseNoteService.markReleaseNoteRead).toHaveBeenCalledWith('3.9.0', 'child-1', expect.objectContaining({
      sourcePage: 'whats_new_page'
    }));
  });

  it('点击近期版本和高亮动作应更新当前卡片并跳转', async () => {
    const page = createPage();

    await page.onLoad.call(page, { version: '3.9.0' });

    page.onRecentReleaseTap.call(page, {
      currentTarget: {
        dataset: {
          version: '3.8.0'
        }
      }
    });
    expect(page.data.currentReleaseNote.version).toBe('3.8.0');

    page.onHighlightActionTap.call(page, {
      currentTarget: {
        dataset: {
          path: '/pages/index/index'
        }
      }
    });
    expect(global.wx.navigateTo).toHaveBeenCalledWith({
      url: '/pages/index/index'
    });
  });
});
