const ReleaseNote = require('../../models/release-note');
const ReleaseNoteService = require('../../services/release-note-service');

describe('ReleaseNoteService', () => {
  let repository;
  let service;
  let httpClient;
  let apiConfig;

  beforeEach(() => {
    repository = {
      findByVersion: jest.fn(),
      getAllNotes: jest.fn().mockResolvedValue([]),
      getReadState: jest.fn().mockResolvedValue({
        version: '3.9.0',
        effectiveUserId: 'child-1',
        promptShownAt: 0,
        readAt: 0
      }),
      saveReadState: jest.fn().mockResolvedValue({
        success: true
      })
    };
    httpClient = {
      getUserProductState: jest.fn().mockResolvedValue({
        canAutoPrompt: true,
        canShowHelpBadge: true,
        aboutEntryMode: 'current_update'
      }),
      createUserActivityEvent: jest.fn().mockResolvedValue({
        eventId: 'evt_1'
      })
    };
    apiConfig = {
      ENABLE_API: true
    };
    service = new ReleaseNoteService({
      repository,
      httpClient,
      apiConfig,
      appMeta: {
        version: '3.9.0'
      }
    });
  });

  it('getCurrentReleaseNote 应返回未读和可提示状态', async () => {
    repository.findByVersion.mockResolvedValue(new ReleaseNote({
      version: '3.9.0',
      publishedAt: '2026-05-19',
      title: '本次更新',
      summary: '版本变化更清楚',
      audiences: ['all'],
      highlights: [
        {
          id: 'h1',
          kind: 'new',
          title: '首页提醒',
          summary: '首页轻提醒'
        }
      ]
    }));

    const result = await service.getCurrentReleaseNote({
      currentUser: { userId: 'child-1', role: 'child' },
      loginUser: { userId: 'parent-1', role: 'parent', familyPermissionRole: 'manager' },
      runtimeVersion: '3.9.0'
    });

    expect(result).toEqual(expect.objectContaining({
      success: true,
      unread: true,
      promptEligible: true,
      effectiveUserId: 'child-1',
      canShowHelpBadge: true,
      entryTitle: '本次更新',
      badgeText: '新变化'
    }));
    expect(result.note.version).toBe('3.9.0');
  });

  it('后端返回不可自动提醒时应压制 promptEligible 和帮助 badge', async () => {
    repository.findByVersion.mockResolvedValue(new ReleaseNote({
      version: '3.9.0',
      publishedAt: '2026-05-19',
      title: '本次更新',
      summary: '版本变化更清楚',
      audiences: ['all'],
      highlights: [{ id: 'h1', kind: 'new', title: '首页提醒', summary: '首页轻提醒' }]
    }));
    httpClient.getUserProductState.mockResolvedValueOnce({
      canAutoPrompt: false,
      canShowHelpBadge: false,
      aboutEntryMode: 'recent_changes'
    });

    const result = await service.getCurrentReleaseNote({
      currentUser: { userId: 'child-1', role: 'child' },
      loginUser: { userId: 'parent-1', role: 'parent', familyPermissionRole: 'manager' },
      runtimeVersion: '3.9.0'
    });

    expect(result.promptEligible).toBe(false);
    expect(result.canShowHelpBadge).toBe(false);
    expect(result.entryTitle).toBe('近期变化');
    expect(result.badgeText).toBe('');
  });

  it('当前登录视角获取版本感知状态时不应发送 targetUserId=null', async () => {
    repository.findByVersion.mockResolvedValue(new ReleaseNote({
      version: '3.9.0',
      publishedAt: '2026-05-19',
      title: '本次更新',
      summary: '版本变化更清楚',
      audiences: ['all'],
      highlights: [{ id: 'h1', kind: 'new', title: '首页提醒', summary: '首页轻提醒' }]
    }));

    await service.getCurrentReleaseNote({
      currentUser: { userId: 'parent-1', role: 'parent' },
      loginUser: { userId: 'parent-1', role: 'parent', familyPermissionRole: 'manager' },
      runtimeVersion: '3.9.0'
    });

    expect(httpClient.getUserProductState).toHaveBeenCalledWith(expect.objectContaining({
      runtimeVersion: '3.9.0',
      sourcePage: 'release_note_service'
    }));
    expect(httpClient.getUserProductState.mock.calls[0][0]).not.toHaveProperty('targetUserId');
  });

  it('切换孩子视角获取版本感知状态时应携带 targetUserId', async () => {
    repository.findByVersion.mockResolvedValue(new ReleaseNote({
      version: '3.9.0',
      publishedAt: '2026-05-19',
      title: '本次更新',
      summary: '版本变化更清楚',
      audiences: ['all'],
      highlights: [{ id: 'h1', kind: 'new', title: '首页提醒', summary: '首页轻提醒' }]
    }));

    await service.getCurrentReleaseNote({
      currentUser: { userId: 'child-1', role: 'child' },
      loginUser: { userId: 'parent-1', role: 'parent', familyPermissionRole: 'manager' },
      runtimeVersion: '3.9.0'
    });

    expect(httpClient.getUserProductState).toHaveBeenCalledWith(expect.objectContaining({
      targetUserId: 'child-1',
      runtimeVersion: '3.9.0',
      sourcePage: 'release_note_service'
    }));
  });

  it('后端状态接口失败时应走收敛降级，而不是继续本地放行', async () => {
    repository.findByVersion.mockResolvedValue(new ReleaseNote({
      version: '3.9.0',
      publishedAt: '2026-05-19',
      title: '本次更新',
      summary: '版本变化更清楚',
      audiences: ['all'],
      highlights: [{ id: 'h1', kind: 'new', title: '首页提醒', summary: '首页轻提醒' }]
    }));
    httpClient.getUserProductState.mockRejectedValueOnce(new Error('network'));

    const result = await service.getCurrentReleaseNote({
      currentUser: { userId: 'child-1', role: 'child' },
      loginUser: { userId: 'parent-1', role: 'parent', familyPermissionRole: 'manager' },
      runtimeVersion: '3.9.0'
    });

    expect(result.promptEligible).toBe(false);
    expect(result.canShowHelpBadge).toBe(false);
    expect(result.entryTitle).toBe('近期变化');
  });

  it('listVisibleReleaseNotes 应按当前视角和 familyPermissionRole 过滤', async () => {
    repository.getAllNotes.mockResolvedValue([
      new ReleaseNote({
        version: '3.9.0',
        publishedAt: '2026-05-19',
        title: '全部可见',
        summary: 'all',
        audiences: ['all'],
        highlights: [{ id: 'h1', kind: 'new', title: '1', summary: '1' }]
      }),
      new ReleaseNote({
        version: '3.8.0',
        publishedAt: '2026-05-01',
        title: '仅查看者',
        summary: 'viewer',
        audiences: ['viewer'],
        highlights: [{ id: 'h2', kind: 'improved', title: '2', summary: '2' }]
      }),
      new ReleaseNote({
        version: '3.7.0',
        publishedAt: '2026-04-20',
        title: '仅孩子',
        summary: 'child',
        audiences: ['child'],
        highlights: [{ id: 'h3', kind: 'fixed', title: '3', summary: '3' }]
      })
    ]);

    const viewerResult = await service.listVisibleReleaseNotes({
      currentUser: { userId: 'parent-2', role: 'parent' },
      loginUser: { userId: 'parent-2', role: 'parent', familyPermissionRole: 'viewer' },
      runtimeVersion: '3.9.0'
    });
    const childResult = await service.listVisibleReleaseNotes({
      currentUser: { userId: 'child-1', role: 'child' },
      loginUser: { userId: 'parent-1', role: 'parent', familyPermissionRole: 'manager' },
      runtimeVersion: '3.9.0'
    });

    expect(viewerResult.notes.map((item) => item.version)).toEqual(['3.9.0', '3.8.0']);
    expect(childResult.notes.map((item) => item.version)).toEqual(['3.9.0', '3.7.0']);
  });

  it('markPromptShown、markReleaseNoteRead 和 evaluateReleaseNotePromptDisplay 应返回稳定结果', async () => {
    expect(await service.markPromptShown('3.9.0', 'child-1')).toEqual({ success: true });
    expect(await service.markReleaseNoteRead('3.9.0', 'child-1', {
      currentUser: { userId: 'child-1', role: 'child' },
      loginUser: { userId: 'parent-1', role: 'parent' },
      runtimeVersion: '3.9.0',
      sourcePage: 'whats_new_page'
    })).toEqual({ success: true });
    expect(repository.saveReadState).toHaveBeenCalledTimes(2);
    expect(httpClient.createUserActivityEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'release_note_viewed',
      runtimeVersion: '3.9.0',
      sourcePage: 'whats_new_page'
    }));
    expect(service.evaluateReleaseNotePromptDisplay({
      showSearch: false,
      showMessagePreview: false,
      showHomeOnboardingCard: false,
      showUserSwitcher: false
    })).toEqual({
      shouldDisplay: true,
      pending: false
    });
    expect(service.evaluateReleaseNotePromptDisplay({
      showSearch: true,
      showMessagePreview: false,
      showHomeOnboardingCard: false,
      showUserSwitcher: false
    })).toEqual({
      shouldDisplay: false,
      pending: true
    });
  });

  it('当前登录视角记录客户端事件时不应发送 subjectUserId=null', async () => {
    await service.recordClientEvent('release_note_clicked', {
      currentUser: { userId: 'parent-1', role: 'parent' },
      loginUser: { userId: 'parent-1', role: 'parent', familyPermissionRole: 'manager' },
      runtimeVersion: '3.9.0',
      sourcePage: 'about_page'
    }, {
      version: '3.9.0'
    });

    expect(httpClient.createUserActivityEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'release_note_clicked',
      runtimeVersion: '3.9.0',
      sourcePage: 'about_page',
      payload: { version: '3.9.0' }
    }));
    expect(httpClient.createUserActivityEvent.mock.calls[0][0]).not.toHaveProperty('subjectUserId');
  });

  it('API 关闭时应回退到纯本地规则', async () => {
    apiConfig.ENABLE_API = false;
    repository.findByVersion.mockResolvedValue(new ReleaseNote({
      version: '3.9.0',
      publishedAt: '2026-05-19',
      title: '本次更新',
      summary: '版本变化更清楚',
      audiences: ['all'],
      highlights: [{ id: 'h1', kind: 'new', title: '首页提醒', summary: '首页轻提醒' }]
    }));

    const result = await service.getCurrentReleaseNote({
      currentUser: { userId: 'child-1', role: 'child' },
      runtimeVersion: '3.9.0'
    });

    expect(httpClient.getUserProductState).not.toHaveBeenCalled();
    expect(result.promptEligible).toBe(true);
    expect(result.canShowHelpBadge).toBe(true);
  });
});
