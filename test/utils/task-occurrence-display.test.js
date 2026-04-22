const {
  ACTIVE_VISIBLE_LIMIT,
  buildOccurrenceCardViewModel,
  buildOccurrenceManageSections
} = require('../../utils/task-occurrence-display');

describe('utils/task-occurrence-display', () => {
  it('单条卡片模型应输出类型、时间范围和状态标签', () => {
    const card = buildOccurrenceCardViewModel({
      id: 'occ_1',
      title: '听写全对',
      type: 'study',
      points: 2,
      date: '2026-04-17',
      activeRange: {
        startDate: '2026-04-17',
        endDate: '',
        hasNoEndDate: true
      },
      modifyTime: 100
    }, '2026-04-18');

    expect(card).toEqual(expect.objectContaining({
      id: 'occ_1',
      typeLabel: '学习',
      typeTone: 'study',
      groupKey: 'active',
      pointsText: '2 颗星星',
      rangeText: '2026-04-17 起长期有效',
      statusText: '生效中',
      statusTone: 'active'
    }));
  });

  it('应按生效中、待生效、历史项分组', () => {
    const result = buildOccurrenceManageSections([
      {
        id: 'active_1',
        type: 'study',
        date: '2026-04-17',
        activeRange: {
          startDate: '2026-04-17',
          endDate: '',
          hasNoEndDate: true
        }
      },
      {
        id: 'upcoming_1',
        type: 'habit',
        date: '2026-04-20',
        activeRange: {
          startDate: '2026-04-20',
          endDate: '',
          hasNoEndDate: true
        }
      },
      {
        id: 'history_1',
        type: 'interest',
        date: '2026-04-01',
        activeRange: {
          startDate: '2026-04-01',
          endDate: '2026-04-10',
          hasNoEndDate: false
        }
      }
    ], '2026-04-17');

    expect(result.summary).toEqual({
      activeCount: 1,
      upcomingCount: 1,
      historyCount: 1,
      totalCount: 3
    });
    expect(result.statsBar).toEqual({
      visible: true,
      items: [
        { key: 'active', label: '生效中', count: 1 },
        { key: 'upcoming', label: '待生效', count: 1 },
        { key: 'history', label: '历史项', count: 1 }
      ]
    });
    expect(result.activeSection.items.map((item) => item.id)).toEqual(['active_1']);
    expect(result.secondaryPanel.visible).toBe(true);
    expect(result.secondaryPanel.upcomingSection.items.map((item) => item.id)).toEqual(['upcoming_1']);
    expect(result.secondaryPanel.historySection.items.map((item) => item.id)).toEqual(['history_1']);
  });

  it('生效中超过阈值时应默认只展示前六条，并支持展开状态', () => {
    const items = Array.from({ length: 8 }).map((_, index) => ({
      id: `active_${index + 1}`,
      type: 'study',
      date: '2026-04-17',
      modifyTime: 100 - index,
      activeRange: {
        startDate: '2026-04-17',
        endDate: '',
        hasNoEndDate: true
      }
    }));

    const collapsed = buildOccurrenceManageSections(items, '2026-04-17');
    expect(collapsed.activeSection.visibleItems).toHaveLength(ACTIVE_VISIBLE_LIMIT);
    expect(collapsed.activeSection.hasToggle).toBe(true);
    expect(collapsed.activeSection.toggleText).toBe('展开其余 2 项');

    const expanded = buildOccurrenceManageSections(items, '2026-04-17', {
      activeExpanded: true
    });
    expect(expanded.activeSection.visibleItems).toHaveLength(8);
    expect(expanded.activeSection.expanded).toBe(true);
  });

  it('待生效和历史项应默认折叠，仅在 uiState 展开时显示明细', () => {
    const items = [
      {
        id: 'upcoming_1',
        type: 'study',
        date: '2026-04-20',
        activeRange: {
          startDate: '2026-04-20',
          endDate: '',
          hasNoEndDate: true
        }
      },
      {
        id: 'history_1',
        type: 'study',
        date: '2026-04-01',
        activeRange: {
          startDate: '2026-04-01',
          endDate: '2026-04-03',
          hasNoEndDate: false
        }
      }
    ];

    const collapsed = buildOccurrenceManageSections(items, '2026-04-17');
    expect(collapsed.secondaryPanel.upcomingSection.expanded).toBe(false);
    expect(collapsed.secondaryPanel.upcomingSection.visibleItems).toHaveLength(0);
    expect(collapsed.secondaryPanel.upcomingSection.summaryText).toBe('待生效 1 项');
    expect(collapsed.secondaryPanel.historySection.expanded).toBe(false);
    expect(collapsed.secondaryPanel.historySection.visibleItems).toHaveLength(0);
    expect(collapsed.secondaryPanel.historySection.summaryText).toBe('历史项 1 项');

    const expanded = buildOccurrenceManageSections(items, '2026-04-17', {
      upcomingExpanded: true,
      historyExpanded: true
    });
    expect(expanded.secondaryPanel.upcomingSection.visibleItems).toHaveLength(1);
    expect(expanded.secondaryPanel.historySection.visibleItems).toHaveLength(1);
  });

  it('主区有数据时不应再输出解释型辅助文案，空态时只保留单一提示来源', () => {
    const activeResult = buildOccurrenceManageSections([
      {
        id: 'active_1',
        type: 'study',
        date: '2026-04-17',
        activeRange: {
          startDate: '2026-04-17',
          endDate: '',
          hasNoEndDate: true
        }
      }
    ], '2026-04-17');

    expect(activeResult.activeSection.summaryText).toBe('当前在用 1 项');
    expect(activeResult.activeSection.noteText).toBeUndefined();
    expect(activeResult.secondaryPanel.upcomingSection).toBe(null);

    const emptyResult = buildOccurrenceManageSections([], '2026-04-17');
    expect(emptyResult.activeSection.summaryText).toBe('');
    expect(emptyResult.activeSection.emptyText).toBe('当前没有生效中的表现项');
    expect(emptyResult.activeSection.emptyNote).toBe('可以先新建 1 条表现项');
  });

  it('应按设计规则排序三组数据', () => {
    const result = buildOccurrenceManageSections([
      {
        id: 'active_no_end',
        modifyTime: 50,
        activeRange: {
          startDate: '2026-04-10',
          endDate: '',
          hasNoEndDate: true
        }
      },
      {
        id: 'active_end_early',
        modifyTime: 1,
        activeRange: {
          startDate: '2026-04-10',
          endDate: '2026-04-19',
          hasNoEndDate: false
        }
      },
      {
        id: 'active_end_late',
        modifyTime: 100,
        activeRange: {
          startDate: '2026-04-10',
          endDate: '2026-04-21',
          hasNoEndDate: false
        }
      },
      {
        id: 'upcoming_late',
        modifyTime: 10,
        activeRange: {
          startDate: '2026-04-25',
          endDate: '',
          hasNoEndDate: true
        }
      },
      {
        id: 'upcoming_early',
        modifyTime: 5,
        activeRange: {
          startDate: '2026-04-22',
          endDate: '',
          hasNoEndDate: true
        }
      },
      {
        id: 'history_newer_end',
        modifyTime: 5,
        activeRange: {
          startDate: '2026-04-01',
          endDate: '2026-04-16',
          hasNoEndDate: false
        }
      },
      {
        id: 'history_older_end',
        modifyTime: 100,
        activeRange: {
          startDate: '2026-04-01',
          endDate: '2026-04-10',
          hasNoEndDate: false
        }
      }
    ], '2026-04-17', {
      upcomingExpanded: true,
      historyExpanded: true
    });

    expect(result.activeSection.items.map((item) => item.id)).toEqual([
      'active_end_early',
      'active_end_late',
      'active_no_end'
    ]);
    expect(result.secondaryPanel.upcomingSection.items.map((item) => item.id)).toEqual([
      'upcoming_early',
      'upcoming_late'
    ]);
    expect(result.secondaryPanel.historySection.items.map((item) => item.id)).toEqual([
      'history_newer_end',
      'history_older_end'
    ]);
  });

  it('锚点任务应在展示模型中标记出来', () => {
    const result = buildOccurrenceManageSections([
      {
        id: 'occ_1',
        activeRange: {
          startDate: '2026-04-17',
          endDate: '',
          hasNoEndDate: true
        }
      }
    ], '2026-04-17', {
      anchorTaskId: 'occ_1'
    });

    expect(result.activeSection.items[0].isAnchorTarget).toBe(true);
  });

  it('生效中锚点若落在默认六条之外，应只为本次回位临时展开', () => {
    const items = Array.from({ length: 8 }).map((_, index) => ({
      id: `active_${index + 1}`,
      type: 'study',
      date: '2026-04-17',
      modifyTime: 100 - index,
      activeRange: {
        startDate: '2026-04-17',
        endDate: '',
        hasNoEndDate: true
      }
    }));

    const result = buildOccurrenceManageSections(items, '2026-04-17', {
      anchorTaskId: 'active_8'
    });

    expect(result.activeSection.expanded).toBe(true);
    expect(result.activeSection.visibleItems).toHaveLength(8);
    expect(result.uiState.activeExpanded).toBe(false);
  });

  it('待生效和历史项都为空时，不应渲染其他表现项容器', () => {
    const result = buildOccurrenceManageSections([
      {
        id: 'active_1',
        activeRange: {
          startDate: '2026-04-17',
          endDate: '',
          hasNoEndDate: true
        }
      }
    ], '2026-04-17');

    expect(result.secondaryPanel.visible).toBe(false);
    expect(result.secondaryPanel.upcomingSection).toBe(null);
    expect(result.secondaryPanel.historySection).toBe(null);
    expect(result.statsBar.visible).toBe(true);
  });

  it('没有任何表现项时，轻统计不应显示', () => {
    const result = buildOccurrenceManageSections([], '2026-04-17');

    expect(result.summary.totalCount).toBe(0);
    expect(result.statsBar.visible).toBe(false);
  });
});
