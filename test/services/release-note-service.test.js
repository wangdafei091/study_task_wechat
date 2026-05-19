const ReleaseNote = require('../../models/release-note');
const ReleaseNoteService = require('../../services/release-note-service');

describe('ReleaseNoteService', () => {
  let repository;
  let service;

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
    service = new ReleaseNoteService({
      repository,
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
      effectiveUserId: 'child-1'
    }));
    expect(result.note.version).toBe('3.9.0');
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
    expect(await service.markReleaseNoteRead('3.9.0', 'child-1')).toEqual({ success: true });
    expect(repository.saveReadState).toHaveBeenCalledTimes(2);
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
});
