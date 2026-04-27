const syncState = require('../../utils/sync-state');

describe('utils/sync-state', () => {
  describe('isPendingSyncOccurrenceRecord', () => {
    it('应识别待同步的表现记录', () => {
      expect(syncState.isPendingSyncOccurrenceRecord({
        executionMode: 'occurrence',
        isOccurrenceRecord: true,
        pendingSyncMeta: { action: 'occurrence_record' }
      })).toBe(true);

      expect(syncState.isPendingSyncOccurrenceRecord({
        executionMode: 'occurrence',
        isOccurrenceRecord: true,
        syncedToCloud: false
      })).toBe(true);
    });

    it('非表现记录或无同步标记时应返回 false', () => {
      expect(syncState.isPendingSyncOccurrenceRecord(null)).toBe(false);
      expect(syncState.isPendingSyncOccurrenceRecord({
        executionMode: 'planned',
        pendingSyncMeta: { action: 'update' }
      })).toBe(false);
      expect(syncState.isPendingSyncOccurrenceRecord({
        executionMode: 'occurrence',
        isOccurrenceRecord: false,
        syncedToCloud: false
      })).toBe(false);
    });
  });

  it('应返回统一的待同步 toast 文案', () => {
    expect(syncState.getPendingSyncToastCopy()).toBe('已暂存，联网后自动同步');
  });

  it('应区分 provisional 与 formal 消息', () => {
    expect(syncState.isProvisionalMessage({
      isProvisional: true,
      syncedToCloud: false
    })).toBe(true);

    expect(syncState.isFormalMessage({
      isProvisional: false,
      syncedToCloud: true,
      isLegacy: false
    })).toBe(true);
  });
});
