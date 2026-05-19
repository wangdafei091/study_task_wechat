const appMeta = require('../../utils/app-meta');
const ReleaseNoteRepository = require('../../repositories/release-note-repository');

describe('ReleaseNoteRepository', () => {
  let mockStorageAdapter;

  beforeEach(() => {
    mockStorageAdapter = {
      getAsync: jest.fn().mockResolvedValue({}),
      setAsync: jest.fn().mockResolvedValue(true)
    };
  });

  it('应按版本号返回注册表中的说明', async () => {
    const repository = new ReleaseNoteRepository(mockStorageAdapter, {
      registry: [
        {
          version: '3.9.0',
          publishedAt: '2026-05-19',
          title: '本次更新',
          summary: '新增版本变化感知',
          audiences: ['all'],
          highlights: [
            {
              id: 'h1',
              kind: 'new',
              title: '首页提醒',
              summary: '首页轻提醒'
            }
          ]
        }
      ]
    });

    const note = await repository.findByVersion('3.9.0');

    expect(note).not.toBeNull();
    expect(note.version).toBe('3.9.0');
    expect(note.validate()).toEqual([]);
  });

  it('saveReadState 和 getReadState 应按 currentUser + version 维度持久化', async () => {
    const stateStore = {};
    mockStorageAdapter.getAsync.mockImplementation(async () => stateStore);
    mockStorageAdapter.setAsync.mockImplementation(async (_key, value) => {
      Object.assign(stateStore, value);
      return true;
    });
    const repository = new ReleaseNoteRepository(mockStorageAdapter, {
      registry: []
    });

    await repository.saveReadState('3.9.0', 'child-1', {
      promptShownAt: 100
    });
    await repository.saveReadState('3.9.0', 'child-1', {
      readAt: 200
    });

    const state = await repository.getReadState('3.9.0', 'child-1');
    expect(state).toEqual({
      version: '3.9.0',
      effectiveUserId: 'child-1',
      promptShownAt: 100,
      readAt: 200
    });
  });

  it('默认注册表应包含当前 app 版本，且所有条目都满足前台约束', async () => {
    const repository = new ReleaseNoteRepository(mockStorageAdapter);
    const notes = await repository.getAllNotes();

    expect(notes.some((note) => note.version === appMeta.version)).toBe(true);
    expect(new Set(notes.map((note) => note.version)).size).toBe(notes.length);
    notes.forEach((note) => {
      expect(note.validate()).toEqual([]);
      expect(note.highlights.length).toBeLessThanOrEqual(3);
    });
  });
});
