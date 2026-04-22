const ACTIVE_VISIBLE_LIMIT = 6;

const TYPE_LABEL_MAP = {
  study: '学习',
  habit: '习惯',
  interest: '兴趣'
};

const TYPE_TONE_MAP = {
  study: 'study',
  habit: 'habit',
  interest: 'interest'
};

function normalizeUiState(uiState = {}) {
  return {
    activeExpanded: uiState.activeExpanded === true,
    upcomingExpanded: uiState.upcomingExpanded === true,
    historyExpanded: uiState.historyExpanded === true,
    anchorTaskId: uiState.anchorTaskId || ''
  };
}

function getOccurrenceRange(item = {}) {
  const activeRange = item.activeRange || {};
  const startDate = activeRange.startDate || item.date || '';
  const hasNoEndDate = activeRange.hasNoEndDate === true;
  const endDate = hasNoEndDate ? '' : (activeRange.endDate || '');

  return {
    startDate,
    endDate,
    hasNoEndDate
  };
}

function resolveStatusKey(range, today) {
  if (range.startDate && today && range.startDate > today) {
    return 'upcoming';
  }

  if (!range.hasNoEndDate && range.endDate && today && range.endDate < today) {
    return 'history';
  }

  return 'active';
}

function getStatusText(statusKey) {
  if (statusKey === 'upcoming') {
    return '待生效';
  }
  if (statusKey === 'history') {
    return '历史项';
  }
  return '生效中';
}

function getTypeLabel(type) {
  return TYPE_LABEL_MAP[type] || '学习';
}

function getTypeTone(type) {
  return TYPE_TONE_MAP[type] || 'study';
}

function getRangeText(range) {
  const startDate = range.startDate || '未设置';
  if (range.hasNoEndDate) {
    return `${startDate} 起长期有效`;
  }

  return `${startDate} 至 ${range.endDate || '未设置'}`;
}

function compareModifyTimeDesc(left, right) {
  return Number(right.modifyTime || 0) - Number(left.modifyTime || 0);
}

function compareDateAsc(leftDate, rightDate, emptyAtEnd) {
  if (!leftDate && !rightDate) {
    return 0;
  }
  if (!leftDate) {
    return emptyAtEnd ? 1 : -1;
  }
  if (!rightDate) {
    return emptyAtEnd ? -1 : 1;
  }
  if (leftDate === rightDate) {
    return 0;
  }
  return leftDate > rightDate ? 1 : -1;
}

function compareDateDesc(leftDate, rightDate, emptyAtEnd) {
  return compareDateAsc(rightDate, leftDate, emptyAtEnd);
}

function sortActiveItems(items) {
  return items.slice().sort((left, right) => {
    const endCompare = compareDateAsc(left.endDate, right.endDate, true);
    if (endCompare !== 0) {
      return endCompare;
    }
    return compareModifyTimeDesc(left, right);
  });
}

function sortUpcomingItems(items) {
  return items.slice().sort((left, right) => {
    const startCompare = compareDateAsc(left.startDate, right.startDate, true);
    if (startCompare !== 0) {
      return startCompare;
    }
    return compareModifyTimeDesc(left, right);
  });
}

function sortHistoryItems(items) {
  return items.slice().sort((left, right) => {
    const endCompare = compareDateDesc(left.endDate, right.endDate, true);
    if (endCompare !== 0) {
      return endCompare;
    }
    return compareModifyTimeDesc(left, right);
  });
}

function buildOccurrenceCardViewModel(item = {}, today = '') {
  const range = getOccurrenceRange(item);
  const statusKey = resolveStatusKey(range, today);
  const points = Number(item.points || 0);

  return {
    ...item,
    id: item.id || item.taskId || '',
    title: item.title || '',
    type: item.type || 'study',
    typeLabel: getTypeLabel(item.type),
    typeTone: getTypeTone(item.type),
    points,
    pointsText: `${points} 颗星星`,
    startDate: range.startDate,
    endDate: range.endDate,
    hasNoEndDate: range.hasNoEndDate,
    rangeText: getRangeText(range),
    statusKey,
    groupKey: statusKey,
    statusText: getStatusText(statusKey),
    statusTone: statusKey,
    modifyTime: Number(item.modifyTime || 0),
    isAnchorTarget: false
  };
}

function shouldForceExpandActiveForAnchor(items, anchorTaskId) {
  if (!anchorTaskId || items.length <= ACTIVE_VISIBLE_LIMIT) {
    return false;
  }

  const visibleItems = items.slice(0, ACTIVE_VISIBLE_LIMIT);
  if (visibleItems.some((item) => item.id === anchorTaskId)) {
    return false;
  }

  return items.some((item) => item.id === anchorTaskId);
}

function applyAnchor(items, anchorTaskId) {
  return items.map((item) => ({
    ...item,
    isAnchorTarget: Boolean(anchorTaskId) && item.id === anchorTaskId
  }));
}

function createActiveSection(items, uiState) {
  const hiddenCount = items.length > ACTIVE_VISIBLE_LIMIT
    ? items.length - ACTIVE_VISIBLE_LIMIT
    : 0;
  const forceExpandedByAnchor = shouldForceExpandActiveForAnchor(items, uiState.anchorTaskId || '');
  const userExpanded = uiState.activeExpanded === true;
  const expanded = hiddenCount > 0 ? (userExpanded || forceExpandedByAnchor) : true;
  const visibleItems = hiddenCount > 0 && !expanded
    ? items.slice(0, ACTIVE_VISIBLE_LIMIT)
    : items.slice();

  return {
    key: 'active',
    title: '生效中',
    count: items.length,
    expanded,
    hasToggle: hiddenCount > 0,
    hiddenCount,
    summaryText: items.length > 0 ? `当前在用 ${items.length} 项` : '',
    toggleText: expanded ? '收起' : `展开其余 ${hiddenCount} 项`,
    emptyText: '当前没有生效中的表现项',
    emptyNote: '可以先新建 1 条表现项',
    items,
    visibleItems
  };
}

function createSecondarySection(key, title, items, expanded) {
  if (!items.length) {
    return null;
  }

  return {
    key,
    title,
    count: items.length,
    expanded: expanded === true,
    summaryText: `${title} ${items.length} 项`,
    emptyText: key === 'upcoming' ? '暂无待生效项' : '暂无历史项',
    items,
    visibleItems: expanded === true ? items.slice() : []
  };
}

function createStatsBar(summary) {
  const totalCount = Number(summary.totalCount || 0);
  return {
    visible: totalCount > 0,
    items: [
      {
        key: 'active',
        label: '生效中',
        count: Number(summary.activeCount || 0)
      },
      {
        key: 'upcoming',
        label: '待生效',
        count: Number(summary.upcomingCount || 0)
      },
      {
        key: 'history',
        label: '历史项',
        count: Number(summary.historyCount || 0)
      }
    ]
  };
}

function buildOccurrenceManageSections(items = [], today = '', uiState = {}) {
  const normalizedUiState = normalizeUiState(uiState);
  const cards = items.map((item) => buildOccurrenceCardViewModel(item, today));

  const activeItems = sortActiveItems(cards.filter((item) => item.statusKey === 'active'));
  const upcomingItems = sortUpcomingItems(cards.filter((item) => item.statusKey === 'upcoming'));
  const historyItems = sortHistoryItems(cards.filter((item) => item.statusKey === 'history'));

  const anchoredActiveItems = applyAnchor(activeItems, normalizedUiState.anchorTaskId);
  const anchoredUpcomingItems = applyAnchor(upcomingItems, normalizedUiState.anchorTaskId);
  const anchoredHistoryItems = applyAnchor(historyItems, normalizedUiState.anchorTaskId);

  const activeSection = createActiveSection(anchoredActiveItems, normalizedUiState);
  const upcomingSection = createSecondarySection(
    'upcoming',
    '待生效',
    anchoredUpcomingItems,
    normalizedUiState.upcomingExpanded === true
  );
  const historySection = createSecondarySection(
    'history',
    '历史项',
    anchoredHistoryItems,
    normalizedUiState.historyExpanded === true
  );

  const summary = {
    activeCount: anchoredActiveItems.length,
    upcomingCount: anchoredUpcomingItems.length,
    historyCount: anchoredHistoryItems.length,
    totalCount: cards.length
  };

  return {
    summary,
    statsBar: createStatsBar(summary),
    activeSection,
    secondaryPanel: {
      title: '其他表现项',
      visible: Boolean(upcomingSection || historySection),
      upcomingSection,
      historySection
    },
    uiState: {
      ...normalizedUiState,
      activeExpanded: activeSection.hasToggle ? normalizedUiState.activeExpanded : false
    }
  };
}

module.exports = {
  ACTIVE_VISIBLE_LIMIT,
  buildOccurrenceCardViewModel,
  buildOccurrenceManageSections
};
