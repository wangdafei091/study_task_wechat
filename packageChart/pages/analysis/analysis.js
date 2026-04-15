const logger = require('../../../utils/logger.js');
const serviceManager = require('../../../services/service-manager.js');
const { buildMonthlyBoard } = require('../../services/analysis-board-service.js');

function getTodayMonthKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthTitle(monthKey) {
  const [year, month] = String(monthKey || getTodayMonthKey()).split('-');
  return `${year}年${Number(month)}月`;
}

function shiftMonthKey(monthKey, offset) {
  const [yearText, monthText] = String(monthKey || getTodayMonthKey()).split('-');
  const baseDate = new Date(Number(yearText), Number(monthText) - 1 + offset, 1);
  return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}`;
}

function getUserLabel(user) {
  return user?.displayName || user?.name || user?.nickname || '孩子';
}

function resolveChildUsers(userService) {
  return (userService?.getAllUsers?.() || [])
    .filter((user) => user?.role === 'child' && user?.status !== 'inactive')
    .map((user) => ({
      id: user.userId || user.id,
      label: getUserLabel(user)
    }))
    .filter((user) => Boolean(user.id));
}

function resolveInitialFocusUserId(userService) {
  const loginUser = userService?.getLoginUser?.() || null;
  const currentUser = userService?.getCurrentUser?.() || null;
  const childUsers = resolveChildUsers(userService);

  if (loginUser?.role === 'child') {
    return loginUser.userId || loginUser.id || '';
  }

  if (currentUser?.role === 'child' && childUsers.some((user) => user.id === (currentUser.userId || currentUser.id))) {
    return currentUser.userId || currentUser.id;
  }

  return childUsers[0]?.id || '';
}

function buildSummaryItems(summary = {}) {
  return [
    { key: 'rows', label: '行', value: String(summary.displayedRowCount || 0) },
    { key: 'done', label: '✓', value: String(summary.completedCount || 0) },
    { key: 'missed', label: '✕', value: String(summary.missedCount || 0) },
    { key: 'upcoming', label: '○', value: String(summary.upcomingCount || 0) }
  ];
}

function buildLegendItems() {
  return [
    { key: 'done', label: '已完成', symbol: '✓', swatchClass: 'legend-done' },
    { key: 'missed', label: '未完成', symbol: '✕', swatchClass: 'legend-missed' },
    { key: 'upcoming', label: '未开始', symbol: '○', swatchClass: 'legend-upcoming' },
    { key: 'blank', label: '无任务', symbol: '', swatchClass: 'legend-blank' }
  ];
}

function truncateMiddleText(text, options = {}) {
  const normalized = String(text || '');
  const maxLength = Number(options.maxLength || 0);
  const headLength = Number(options.headLength || 0);
  const tailLength = Number(options.tailLength || 0);

  if (!maxLength || normalized.length <= maxLength) {
    return normalized;
  }

  const safeHeadLength = Math.max(1, headLength);
  const safeTailLength = Math.max(1, tailLength);
  return `${normalized.slice(0, safeHeadLength)}…${normalized.slice(-safeTailLength)}`;
}

function buildDisplayBoard(board) {
  if (!board || !Array.isArray(board.rows)) {
    return board;
  }

  return {
    ...board,
    rows: board.rows.map((row) => ({
      ...row,
      displayTitle: truncateMiddleText(row.title, {
        maxLength: 10,
        headLength: 6,
        tailLength: 3
      })
    }))
  };
}

Page({
  data: {
    pageState: 'loading',
    monthKey: getTodayMonthKey(),
    monthTitle: formatMonthTitle(getTodayMonthKey()),
    focusUserId: '',
    selectedRowKey: '',
    childOptions: [],
    showChildSwitcher: false,
    board: null,
    summaryItems: [],
    legendItems: buildLegendItems(),
    emptyTitle: '这个月还没有任务安排',
    emptyDescription: '去任务页新增后，这里会自动生成月度看板。',
    errorMessage: ''
  },

  async onLoad() {
    logger.info('analysis', '开始加载月度任务看板');
    await this.initializePage();
  },

  async initializePage() {
    this.setData({
      pageState: 'loading',
      errorMessage: '',
      selectedRowKey: ''
    });

    await serviceManager.waitForInitialization?.(10000);

    const app = getApp();
    const userService = app?.globalData?.userService || null;
    const taskService = serviceManager.getService('task');
    const childOptions = resolveChildUsers(userService);
    const focusUserId = resolveInitialFocusUserId(userService);

    this.setData({
      childOptions,
      showChildSwitcher: childOptions.length > 1,
      focusUserId
    });

    if (!taskService) {
      this.setData({
        pageState: 'error',
        errorMessage: '任务服务尚未就绪，请稍后重试。'
      });
      return;
    }

    if (!focusUserId) {
      this.setData({
        pageState: 'empty',
        emptyTitle: '当前没有可展示的孩子任务',
        emptyDescription: '家庭里至少需要一个孩子任务数据，才会生成月度看板。'
      });
      return;
    }

    await this.loadBoard({
      monthKey: this.data.monthKey,
      focusUserId
    });
  },

  async loadBoard({ monthKey, focusUserId }) {
    const taskService = serviceManager.getService('task');

    this.setData({
      pageState: 'loading',
      monthKey,
      monthTitle: formatMonthTitle(monthKey),
      focusUserId,
      errorMessage: '',
      selectedRowKey: ''
    });

    try {
      const board = await buildMonthlyBoard({
        taskService,
        monthKey,
        focusUserId
      });
      const displayBoard = buildDisplayBoard(board);

      const hasRows = Array.isArray(displayBoard.rows) && displayBoard.rows.length > 0;

      this.setData({
        board: displayBoard,
        monthKey: displayBoard.monthKey,
        monthTitle: displayBoard.monthTitle,
        summaryItems: buildSummaryItems(displayBoard.summary),
        pageState: hasRows ? 'ready' : 'empty',
        emptyTitle: '这个月还没有任务安排',
        emptyDescription: '换一个月份看看，或者先去创建任务。'
      });
    } catch (error) {
      logger.error('analysis', '加载月度看板失败', error);
      this.setData({
        pageState: 'error',
        errorMessage: '看板加载失败，请稍后重试。'
      });
    }
  },

  async onPrevMonthTap() {
    await this.loadBoard({
      monthKey: shiftMonthKey(this.data.monthKey, -1),
      focusUserId: this.data.focusUserId
    });
  },

  async onNextMonthTap() {
    await this.loadBoard({
      monthKey: shiftMonthKey(this.data.monthKey, 1),
      focusUserId: this.data.focusUserId
    });
  },

  async onChildTap(event) {
    const focusUserId = event?.currentTarget?.dataset?.userId;
    if (!focusUserId || focusUserId === this.data.focusUserId) {
      return;
    }

    await this.loadBoard({
      monthKey: this.data.monthKey,
      focusUserId
    });
  },

  async onRetryTap() {
    await this.loadBoard({
      monthKey: this.data.monthKey,
      focusUserId: this.data.focusUserId
    });
  },

  onBackTap() {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    if (Array.isArray(pages) && pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }

    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  onRowTap(event) {
    const rowKey = event?.currentTarget?.dataset?.rowKey || '';
    if (!rowKey) {
      return;
    }

    this.setData({
      selectedRowKey: rowKey === this.data.selectedRowKey ? '' : rowKey
    });
  },

  onShellTap() {
    if (!this.data.selectedRowKey) {
      return;
    }

    this.setData({
      selectedRowKey: ''
    });
  }
});

module.exports = {
  __testables: {
    getTodayMonthKey,
    formatMonthTitle,
    shiftMonthKey,
    resolveChildUsers,
    resolveInitialFocusUserId,
    buildSummaryItems,
    truncateMiddleText,
    buildDisplayBoard
  }
};
