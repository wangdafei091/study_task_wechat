const logger = require('../logger');
const TokenManager = require('../token-manager');

const BLOCKED_PAGE_URL = '/pages/system-blocked/system-blocked';
const BLOCKED_SESSION_STORAGE_KEY = 'system_user_blocked_session';
const BLOCKED_REDIRECT_STALE_MS = 1500;
const SYSTEM_USER_ERROR_CODE = {
  BLOCKED: 'SYSTEM_USER_BLOCKED',
  READONLY: 'SYSTEM_USER_READONLY'
};

let blockedRedirectInFlight = false;
let blockedRedirectStartedAt = 0;
let blockedSessionCleanupCompleted = false;

function getServiceManager() {
  try {
    return require('../../services/service-manager');
  } catch (error) {
    logger.warn('SystemUserAccessState', '获取服务管理器失败', error);
    return null;
  }
}

function getErrorCode(error) {
  return error?.code || error?.responseData?.error_code || error?.responseData?.errorCode || '';
}

function isBlockedError(error) {
  return getErrorCode(error) === SYSTEM_USER_ERROR_CODE.BLOCKED;
}

function isReadonlyError(error) {
  return getErrorCode(error) === SYSTEM_USER_ERROR_CODE.READONLY;
}

function clearSessionState() {
  if (blockedSessionCleanupCompleted) {
    return false;
  }

  blockedSessionCleanupCompleted = true;

  try {
    TokenManager.clearToken();
  } catch (error) {
    logger.warn('SystemUserAccessState', '清理 token 失败', error);
  }

  if (typeof wx !== 'undefined' && wx && typeof wx.removeStorageSync === 'function') {
    try {
      wx.removeStorageSync('lastUserInfo');
    } catch (error) {
      logger.warn('SystemUserAccessState', '清理用户缓存失败', error);
    }
  }

  try {
    const app = typeof getApp === 'function' ? getApp() : null;
    if (app?.globalData) {
      app.globalData.userService = null;
    }
  } catch (error) {
    logger.warn('SystemUserAccessState', '清理全局 userService 失败', error);
  }

  try {
    const serviceManager = getServiceManager();
    if (serviceManager && typeof serviceManager.setUserService === 'function') {
      serviceManager.setUserService(null);
    } else {
      logger.warn('SystemUserAccessState', '服务管理器未就绪，跳过清理 ServiceManager.userService');
    }
  } catch (error) {
    logger.warn('SystemUserAccessState', '清理服务管理器 userService 失败', error);
  }
}

function setBlockedSessionFlag() {
  if (typeof wx === 'undefined' || !wx || typeof wx.setStorageSync !== 'function') {
    return false;
  }

  try {
    wx.setStorageSync(BLOCKED_SESSION_STORAGE_KEY, {
      active: true,
      updatedAt: Date.now()
    });
    return true;
  } catch (error) {
    logger.warn('SystemUserAccessState', '写入禁入会话标记失败', error);
    return false;
  }
}

function clearBlockedSessionFlag() {
  blockedSessionCleanupCompleted = false;

  if (typeof wx === 'undefined' || !wx || typeof wx.removeStorageSync !== 'function') {
    return false;
  }

  try {
    wx.removeStorageSync(BLOCKED_SESSION_STORAGE_KEY);
    return true;
  } catch (error) {
    logger.warn('SystemUserAccessState', '清理禁入会话标记失败', error);
    return false;
  }
}

function hasBlockedSessionFlag() {
  if (typeof wx === 'undefined' || !wx || typeof wx.getStorageSync !== 'function') {
    return false;
  }

  try {
    const value = wx.getStorageSync(BLOCKED_SESSION_STORAGE_KEY);
    return Boolean(value && value.active);
  } catch (error) {
    logger.warn('SystemUserAccessState', '读取禁入会话标记失败', error);
    return false;
  }
}

function isAlreadyOnBlockedPage() {
  if (typeof getCurrentPages !== 'function') {
    return false;
  }

  const pages = getCurrentPages();
  if (!Array.isArray(pages) || pages.length === 0) {
    return false;
  }

  const currentPage = pages[pages.length - 1];
  return currentPage?.route === 'pages/system-blocked/system-blocked';
}

function resetBlockedRedirectState() {
  blockedRedirectInFlight = false;
  blockedRedirectStartedAt = 0;
}

function isBlockedRedirectStale() {
  return blockedRedirectInFlight
    && blockedRedirectStartedAt > 0
    && (Date.now() - blockedRedirectStartedAt) >= BLOCKED_REDIRECT_STALE_MS;
}

function redirectToBlockedPage() {
  if (isBlockedRedirectStale()) {
    logger.warn('SystemUserAccessState', '检测到陈旧的禁入跳转锁，自动重置');
    resetBlockedRedirectState();
  }

  if (
    blockedRedirectInFlight ||
    isAlreadyOnBlockedPage() ||
    typeof wx === 'undefined' ||
    !wx ||
    typeof wx.reLaunch !== 'function'
  ) {
    return false;
  }

  blockedRedirectInFlight = true;
  blockedRedirectStartedAt = Date.now();
  wx.reLaunch({
    url: BLOCKED_PAGE_URL,
    complete: () => {
      resetBlockedRedirectState();
    }
  });
  return true;
}

function clearSessionAndRedirectToBlocked() {
  setBlockedSessionFlag();
  clearSessionState();
  redirectToBlockedPage();
}

function handleBlockedError(error) {
  if (!isBlockedError(error)) {
    return false;
  }

  clearSessionAndRedirectToBlocked();
  return true;
}

module.exports = {
  BLOCKED_SESSION_STORAGE_KEY,
  BLOCKED_PAGE_URL,
  SYSTEM_USER_ERROR_CODE,
  clearBlockedSessionFlag,
  clearSessionAndRedirectToBlocked,
  clearSessionState,
  getErrorCode,
  handleBlockedError,
  hasBlockedSessionFlag,
  isBlockedError,
  isReadonlyError,
  redirectToBlockedPage,
  resetBlockedRedirectState,
  setBlockedSessionFlag
};
