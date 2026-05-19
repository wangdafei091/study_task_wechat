const serviceManager = require('../../../services/service-manager.js');
const logger = require('../../../utils/logger');
const userContextUtils = require('../../../utils/user-context');

function toggleSearch(page) {
  if (page.data.showSearch) {
    page.setData({ searchClosing: true });

    setTimeout(() => {
      page.setData({
        showSearch: false,
        searchClosing: false
      });
      if (typeof page.syncHomeOnboardingVisibility === 'function') {
        page.syncHomeOnboardingVisibility();
      }
      if (typeof page.evaluatePendingReleaseNotePrompt === 'function') {
        page.evaluatePendingReleaseNotePrompt();
      }
    }, 300);
    return;
  }

  page.setData({
    showSearch: true,
    showStats: false,
    showMessagePreview: false
  });
  if (typeof page.syncHomeOnboardingVisibility === 'function') {
    page.syncHomeOnboardingVisibility();
  }
}

function getEffectiveTaskUserId(page) {
  const {
    currentUser,
    canManageMembers,
    lastActiveChildId,
    availableUsers
  } = page.data;

  if (canManageMembers && currentUser && currentUser.role === 'parent') {
    if (lastActiveChildId) {
      return lastActiveChildId;
    }

    const firstChild = Array.isArray(availableUsers)
      ? availableUsers.find((user) => user.role === 'child')
      : null;
    return userContextUtils.getUserIdentifier(firstChild);
  }

  return userContextUtils.getUserIdentifier(currentUser);
}

function applyTaskFilters(tasks, filters = {}) {
  let results = Array.isArray(tasks) ? [...tasks] : [];

  if (filters.type) {
    results = results.filter((task) => task.type === filters.type);
  }

  if (filters.status !== '') {
    const statusValue = parseInt(filters.status, 10);
    results = results.filter((task) => task.status === statusValue);
  }

  if (filters.dateRange) {
    // 日期范围过滤仍保持现状占位，避免在结构治理里顺手改语义。
  }

  return results;
}

function matchTaskByQuery(task, query) {
  if (!query) {
    return true;
  }

  const safeQuery = query.toLowerCase();
  const titleMatch = task.title && task.title.toLowerCase().includes(safeQuery);
  const descMatch = task.description && task.description.toLowerCase().includes(safeQuery);
  const tagMatch = Array.isArray(task.tags)
    ? task.tags.some((tag) => String(tag).toLowerCase().includes(safeQuery))
    : false;

  return titleMatch || descMatch || tagMatch;
}

async function performSearch(page) {
  const query = String(page.data.searchQuery || '').toLowerCase().trim();
  const filters = page.data.searchFilters || {};
  const taskService = serviceManager.getTaskService();

  if (!taskService || typeof taskService.getAllTasks !== 'function') {
    logger.error('Index', '搜索任务失败：任务服务不可用');
    page.setData({ searchResults: [] });
    return [];
  }

  try {
    const allTasksRaw = await taskService.getAllTasks();
    const effectiveUserId = page.getEffectiveTaskUserId();
    const scopedTasks = effectiveUserId
      ? allTasksRaw.filter((task) => !task.userId || task.userId === effectiveUserId)
      : allTasksRaw;

    const matchedTasks = scopedTasks.filter((task) => matchTaskByQuery(task, query));
    const results = applyTaskFilters(matchedTasks, filters);

    page.setData({
      searchResults: results
    });

    return results;
  } catch (error) {
    logger.error('Index', '搜索任务失败', error);
    page.setData({
      searchResults: []
    });
    return [];
  }
}

function updateSearchQuery(page, e) {
  page.setData({
    searchQuery: e.detail.value
  }, () => {
    page.performSearch();
  });
}

function updateSearchFilter(page, e) {
  const { type, value } = e.currentTarget.dataset;

  page.setData({
    [`searchFilters.${type}`]: value
  });

  page.performSearch();
}

function clearSearchFilters(page) {
  page.setData({
    searchFilters: {
      type: '',
      status: '',
      dateRange: ''
    }
  });

  page.performSearch();
}

async function searchTasks(page) {
  return performSearch(page);
}

module.exports = {
  toggleSearch,
  getEffectiveTaskUserId,
  updateSearchQuery,
  performSearch,
  updateSearchFilter,
  clearSearchFilters,
  searchTasks
};
